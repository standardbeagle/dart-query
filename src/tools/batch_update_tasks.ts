/**
 * batch_update_tasks Tool Handler
 *
 * Batch update multiple tasks matching a DartQL selector.
 * CRITICAL PRODUCTION SAFETY: Always recommend dry_run=true first!
 *
 * Flow:
 * 1. Parse DartQL selector to AST
 * 2. Resolve selector to dart_ids via list_tasks + client-side filtering
 * 3. dry_run=true: Return preview (max 10 tasks) without updating
 * 4. dry_run=false: Parallel updates with p-limit concurrency control
 * 5. Collect successful_dart_ids and failed_items
 * 6. Return batch_operation_id, execution_time_ms, and results
 */

import pLimit from 'p-limit';
import { DartClient } from '../api/dartClient.js';
import { handleGetConfig } from './get_config.js';
import { parseDartQLToAST, convertToFilters } from '../parsers/dartql.js';
import {
  BatchUpdateTasksInput,
  BatchUpdateTasksOutput,
  DartAPIError,
  ValidationError,
  DartConfig,
  DartTask,
  findDartboard,
  findStatus,
  findTag,
  getDartboardNames,
  getStatusNames,
  getTagNames,
} from '../types/index.js';
import {
  createBatchOperation,
  completeBatchOperation,
  addSuccessfulItem,
  addFailedItem,
} from '../batch/batchOperations.js';

/**
 * Handle batch_update_tasks tool calls
 *
 * PRODUCTION SAFETY: This is a batch WRITE operation - dry_run mode is critical!
 *
 * @param input - BatchUpdateTasksInput with selector, updates, dry_run, concurrency
 * @returns BatchUpdateTasksOutput with batch_operation_id, matched count, results
 */
export async function handleBatchUpdateTasks(
  input: BatchUpdateTasksInput
): Promise<BatchUpdateTasksOutput> {
  const DART_TOKEN = process.env.DART_TOKEN;

  if (!DART_TOKEN) {
    throw new DartAPIError(
      'DART_TOKEN environment variable is required. Get your token from: https://app.dartai.com/?settings=account',
      401
    );
  }

  // ============================================================================
  // Step 1: Validate input
  // ============================================================================
  if (!input || typeof input !== 'object') {
    throw new ValidationError('input is required and must be an object', 'input');
  }

  if (!input.selector || typeof input.selector !== 'string' || input.selector.trim() === '') {
    throw new ValidationError(
      'selector is required and must be a non-empty DartQL WHERE clause (e.g., "status = \'Todo\' AND priority >= 3")',
      'selector'
    );
  }

  if (!input.updates || typeof input.updates !== 'object' || Object.keys(input.updates).length === 0) {
    throw new ValidationError(
      'updates is required and must be a non-empty object with at least one field to update',
      'updates'
    );
  }

  // Validate dry_run (default to true for safety)
  const dryRun = input.dry_run !== false; // Default to true unless explicitly set to false

  // Validate concurrency (default 5, range 1-20)
  let concurrency = input.concurrency ?? 5;
  if (typeof concurrency !== 'number' || !Number.isInteger(concurrency)) {
    throw new ValidationError('concurrency must be an integer', 'concurrency');
  }
  if (concurrency < 1 || concurrency > 20) {
    throw new ValidationError('concurrency must be between 1 and 20', 'concurrency');
  }

  // ============================================================================
  // Step 2: Parse DartQL selector
  // ============================================================================
  const parseResult = parseDartQLToAST(input.selector);

  if (parseResult.errors.length > 0) {
    throw new ValidationError(
      `DartQL parse errors: ${parseResult.errors.join('; ')}`,
      'selector',
      parseResult.errors
    );
  }

  // ============================================================================
  // Step 3: Convert AST to filters
  // ============================================================================
  const filterResult = convertToFilters(parseResult.ast);

  if (filterResult.errors.length > 0) {
    throw new ValidationError(
      `DartQL conversion errors: ${filterResult.errors.join('; ')}`,
      'selector',
      filterResult.errors
    );
  }

  // ============================================================================
  // Step 4: Get workspace config for validation
  // ============================================================================
  let config: DartConfig;
  try {
    config = await handleGetConfig({ cache_bust: false });
  } catch (error) {
    if (error instanceof DartAPIError) {
      throw new DartAPIError(
        `Failed to retrieve workspace config for validation: ${error.message}`,
        error.statusCode,
        error.response
      );
    }
    throw error;
  }

  // ============================================================================
  // Step 5: Validate updates against workspace config
  // ============================================================================
  const validatedUpdates = await validateUpdates(input.updates, config);

  // ============================================================================
  // Step 6: Resolve selector to dart_ids via list_tasks
  // ============================================================================
  const client = new DartClient({ token: DART_TOKEN });

  // Fetch all matching tasks (use high limit to get all)
  let matchingTasks: DartTask[] = [];
  try {
    // Start with API filters if available
    const apiFilters = filterResult.apiFilters;
    let offset = 0;
    const limit = 500;
    let hasMore = true;

    while (hasMore) {
      const response = await client.listTasks({
        ...apiFilters,
        limit,
        offset,
      });

      matchingTasks.push(...(response.tasks || []));

      hasMore = offset + limit < (response.total || 0);
      offset += limit;

      // Safety limit: max 10,000 tasks
      if (matchingTasks.length >= 10000) {
        throw new ValidationError(
          'Selector matches too many tasks (>10,000). Please narrow your selector.',
          'selector'
        );
      }
    }

    // Apply client-side filtering if needed
    if (filterResult.requiresClientSide && filterResult.clientFilter) {
      matchingTasks = matchingTasks.filter(filterResult.clientFilter);
    }
  } catch (error) {
    if (error instanceof DartAPIError) {
      throw new DartAPIError(
        `Failed to fetch matching tasks: ${error.message}`,
        error.statusCode,
        error.response
      );
    }
    throw error;
  }

  const selectorMatched = matchingTasks.length;

  // ============================================================================
  // Step 7: Handle dry_run mode (preview only, no updates)
  // ============================================================================
  if (dryRun) {
    const previewTasks = matchingTasks.slice(0, 10).map((task) => ({
      dart_id: task.dart_id,
      title: task.title,
      current_values: extractCurrentValues(task, Object.keys(validatedUpdates)),
      new_values: validatedUpdates,
    }));

    return {
      batch_operation_id: 'dry_run',
      selector_matched: selectorMatched,
      dry_run: true,
      preview_tasks: previewTasks,
      successful_updates: 0,
      failed_updates: 0,
      successful_dart_ids: [],
      failed_items: [],
      execution_time_ms: 0,
    };
  }

  // ============================================================================
  // Step 8: Create batch operation for tracking
  // ============================================================================
  const batchOperation = createBatchOperation('update', selectorMatched);
  const batchOperationId = batchOperation.batch_operation_id;
  const startTime = Date.now();

  // ============================================================================
  // Step 9: Execute parallel updates with concurrency control
  // ============================================================================
  const limit = pLimit(concurrency);
  const successfulDartIds: string[] = [];
  const failedItems: Array<{ dart_id: string; error: string; reason: string }> = [];

  const updatePromises = matchingTasks.map((task) =>
    limit(async () => {
      try {
        await client.updateTask({
          dart_id: task.dart_id,
          updates: validatedUpdates,
        });

        successfulDartIds.push(task.dart_id);
        addSuccessfulItem(batchOperationId, task.dart_id);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const reason =
          error instanceof DartAPIError
            ? `HTTP ${error.statusCode}: ${error.message}`
            : errorMessage;

        failedItems.push({
          dart_id: task.dart_id,
          error: errorMessage,
          reason,
        });

        addFailedItem(batchOperationId, {
          id: task.dart_id,
          error: reason,
        });

        // If continue_on_error is not explicitly set, we don't throw and continue
        // This is safer for batch operations - collect all errors instead of stopping
      }
    })
  );

  // Wait for all updates to complete
  await Promise.all(updatePromises);

  // ============================================================================
  // Step 10: Complete batch operation and return results
  // ============================================================================
  const executionTimeMs = Date.now() - startTime;
  const status = failedItems.length === 0 ? 'completed' : failedItems.length === selectorMatched ? 'failed' : 'completed';
  completeBatchOperation(batchOperationId, status);

  return {
    batch_operation_id: batchOperationId,
    selector_matched: selectorMatched,
    dry_run: false,
    successful_updates: successfulDartIds.length,
    failed_updates: failedItems.length,
    successful_dart_ids: successfulDartIds,
    failed_items: failedItems,
    execution_time_ms: executionTimeMs,
  };
}

/**
 * Validate updates object against workspace config
 * Resolves names to dart_ids for all reference fields
 */
async function validateUpdates(
  updates: Partial<Omit<DartTask, 'dart_id' | 'created_at' | 'updated_at'>>,
  config: DartConfig
): Promise<Partial<DartTask>> {
  const validated: Partial<DartTask> = {};

  // Validate title
  if (updates.title !== undefined) {
    if (typeof updates.title !== 'string' || updates.title.trim() === '') {
      throw new ValidationError('title must be a non-empty string', 'title');
    }
    if (updates.title.length > 500) {
      throw new ValidationError(
        `title exceeds maximum length of 500 characters (current: ${updates.title.length})`,
        'title'
      );
    }
    validated.title = updates.title;
  }

  // Validate description
  if (updates.description !== undefined) {
    validated.description = updates.description;
  }

  // Validate dartboard
  if (updates.dartboard !== undefined) {
    if (!config.dartboards || config.dartboards.length === 0) {
      throw new ValidationError(
        'No dartboards found in workspace configuration. Cannot update dartboard.',
        'dartboard'
      );
    }

    const dartboard = findDartboard(config.dartboards, updates.dartboard!);

    if (!dartboard) {
      const dartboardNames = getDartboardNames(config.dartboards);
      const availableDartboards = dartboardNames.slice(0, 10).join(', ') +
        (dartboardNames.length > 10 ? `, ... (${dartboardNames.length - 10} more)` : '');
      throw new ValidationError(
        `Invalid dartboard: "${updates.dartboard}" not found in workspace. Available dartboards: ${availableDartboards}`,
        'dartboard',
        dartboardNames
      );
    }

    validated.dartboard = dartboard.dart_id;
  }

  // Validate status
  if (updates.status !== undefined) {
    if (!config.statuses || config.statuses.length === 0) {
      throw new ValidationError(
        'No statuses found in workspace configuration. Cannot update status.',
        'status'
      );
    }

    const status = findStatus(config.statuses, updates.status!);

    if (!status) {
      const statusNames = getStatusNames(config.statuses);
      const availableStatuses = statusNames.join(', ');
      throw new ValidationError(
        `Invalid status: "${updates.status}" not found in workspace. Available statuses: ${availableStatuses}`,
        'status',
        statusNames
      );
    }

    validated.status = status.dart_id;
  }

  // Validate priority
  if (updates.priority !== undefined) {
    if (!config.priorities || config.priorities.length === 0) {
      throw new ValidationError(
        'No priorities found in workspace configuration. Cannot update priority.',
        'priority'
      );
    }

    // Priority is a number (1-5), validate range
    if (typeof updates.priority !== 'number' || updates.priority < 1 || updates.priority > 5) {
      throw new ValidationError(
        `Invalid priority: ${updates.priority}. Valid range: 1-5 (1=lowest, 5=highest)`,
        'priority',
        ['1', '2', '3', '4', '5']
      );
    }

    validated.priority = updates.priority;
  }

  // Validate size
  if (updates.size !== undefined) {
    if (!config.sizes || config.sizes.length === 0) {
      throw new ValidationError(
        'No sizes found in workspace configuration. Cannot update size.',
        'size'
      );
    }

    // Size is a number (1-5), validate range
    if (typeof updates.size !== 'number' || updates.size < 1 || updates.size > 5) {
      throw new ValidationError(
        `Invalid size: ${updates.size}. Valid range: 1-5 (1=XS, 5=XL)`,
        'size',
        ['1', '2', '3', '4', '5']
      );
    }

    validated.size = updates.size;
  }

  // Validate assignees
  if (updates.assignees !== undefined) {
    if (!Array.isArray(updates.assignees)) {
      throw new ValidationError(
        'assignees must be an array of assignee dart_ids, names, or emails',
        'assignees'
      );
    }

    if (updates.assignees.length > 0) {
      if (!config.assignees || config.assignees.length === 0) {
        throw new ValidationError(
          'No assignees found in workspace configuration. Cannot update assignees.',
          'assignees'
        );
      }

      const resolvedAssignees: string[] = [];

      for (const assigneeIdOrName of updates.assignees) {
        if (typeof assigneeIdOrName !== 'string') {
          throw new ValidationError(
            `assignees array must contain only strings, found: ${typeof assigneeIdOrName}`,
            'assignees'
          );
        }

        const assignee = config.assignees.find(
          (a) =>
            a.email === assigneeIdOrName ||
            a.name === assigneeIdOrName
        );

        if (!assignee) {
          const availableAssignees = config.assignees
            .map((a) => a.email ? `${a.name} <${a.email}>` : a.name)
            .join(', ');
          throw new ValidationError(
            `Invalid assignee: "${assigneeIdOrName}" not found in workspace. Available assignees: ${availableAssignees}`,
            'assignees',
            config.assignees.map((a) => a.email || a.name)
          );
        }

        resolvedAssignees.push(assignee.email || assignee.name);
      }

      validated.assignees = resolvedAssignees;
    } else {
      validated.assignees = [];
    }
  }

  // Validate tags
  if (updates.tags !== undefined) {
    if (!Array.isArray(updates.tags)) {
      throw new ValidationError('tags must be an array of tag dart_ids or names', 'tags');
    }

    if (updates.tags.length > 0) {
      if (!config.tags || config.tags.length === 0) {
        throw new ValidationError(
          'No tags found in workspace configuration. Cannot update tags.',
          'tags'
        );
      }

      const resolvedTags: string[] = [];

      for (const tagInput of updates.tags) {
        if (typeof tagInput !== 'string') {
          throw new ValidationError(
            `tags array must contain only strings, found: ${typeof tagInput}`,
            'tags'
          );
        }

        const tag = findTag(config.tags, tagInput);

        if (!tag) {
          const tagNames = getTagNames(config.tags);
          const availableTags = tagNames.slice(0, 20).join(', ') +
            (tagNames.length > 20 ? `, ... (${tagNames.length - 20} more)` : '');
          throw new ValidationError(
            `Invalid tag: "${tagInput}" not found in workspace. Available tags: ${availableTags}`,
            'tags',
            tagNames
          );
        }

        resolvedTags.push(tag.dart_id);
      }

      validated.tags = resolvedTags;
    } else {
      validated.tags = [];
    }
  }

  // Validate date formats
  if (updates.due_at !== undefined) {
    const dueDate = new Date(updates.due_at);
    if (isNaN(dueDate.getTime())) {
      throw new ValidationError(
        `Invalid due_at date format: "${updates.due_at}". Expected ISO8601 format (e.g., "2026-01-17T10:00:00Z")`,
        'due_at'
      );
    }
    validated.due_at = updates.due_at;
  }

  if (updates.start_at !== undefined) {
    const startDate = new Date(updates.start_at);
    if (isNaN(startDate.getTime())) {
      throw new ValidationError(
        `Invalid start_at date format: "${updates.start_at}". Expected ISO8601 format (e.g., "2026-01-17T10:00:00Z")`,
        'start_at'
      );
    }
    validated.start_at = updates.start_at;
  }

  // Pass through other fields
  if (updates.parent_task !== undefined) {
    validated.parent_task = updates.parent_task;
  }

  // ============================================================================
  // Validate and resolve relationship fields
  // All relationship fields are string arrays with full replacement semantics
  // Empty array [] clears all relationships of that type
  // ============================================================================

  // Helper function to validate relationship array
  const validateRelationshipArray = (
    fieldName: string,
    value: unknown
  ): string[] | undefined => {
    if (value === undefined) {
      return undefined;
    }

    if (!Array.isArray(value)) {
      throw new ValidationError(
        `${fieldName} must be an array of task dart_ids`,
        fieldName
      );
    }

    // Empty array is valid - it clears all relationships
    if (value.length === 0) {
      return [];
    }

    // Validate each element is a non-empty string
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      if (typeof item !== 'string') {
        throw new ValidationError(
          `${fieldName}[${i}] must be a string, found: ${typeof item}`,
          fieldName
        );
      }
      if (item.trim() === '') {
        throw new ValidationError(
          `${fieldName}[${i}] must be a non-empty string`,
          fieldName
        );
      }
    }

    return value as string[];
  };

  // Validate and resolve subtask_ids
  const subtaskIds = validateRelationshipArray('subtask_ids', updates.subtask_ids);
  if (subtaskIds !== undefined) {
    validated.subtask_ids = subtaskIds;
  }

  // Validate and resolve blocker_ids
  const blockerIds = validateRelationshipArray('blocker_ids', updates.blocker_ids);
  if (blockerIds !== undefined) {
    validated.blocker_ids = blockerIds;
  }

  // Validate and resolve blocking_ids
  const blockingIds = validateRelationshipArray('blocking_ids', updates.blocking_ids);
  if (blockingIds !== undefined) {
    validated.blocking_ids = blockingIds;
  }

  // Validate and resolve duplicate_ids
  const duplicateIds = validateRelationshipArray('duplicate_ids', updates.duplicate_ids);
  if (duplicateIds !== undefined) {
    validated.duplicate_ids = duplicateIds;
  }

  // Validate and resolve related_ids
  const relatedIds = validateRelationshipArray('related_ids', updates.related_ids);
  if (relatedIds !== undefined) {
    validated.related_ids = relatedIds;
  }

  return validated;
}

/**
 * Extract current values from task for preview
 */
function extractCurrentValues(task: DartTask, updatedFields: string[]): Partial<DartTask> {
  const currentValues: Record<string, unknown> = {};

  for (const field of updatedFields) {
    if (field in task) {
      currentValues[field] = task[field as keyof DartTask];
    }
  }

  return currentValues as Partial<DartTask>;
}
