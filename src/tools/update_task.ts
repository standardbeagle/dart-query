/**
 * update_task Tool Handler
 *
 * Updates an existing task with partial field updates.
 * Flat input: dart_id + any fields to change at the same level.
 * Validates all references against workspace config before API call.
 * Only sends changed fields to the API for efficiency.
 *
 * Supports relationship fields (subtask_ids, blocker_ids, blocking_ids,
 * duplicate_ids, related_ids) with full replacement semantics:
 * - Setting a relationship array replaces the entire array
 * - Setting an empty array [] clears all relationships of that type
 * - To add: get current values, append new ID, update with full array
 * - To remove: get current values, filter out ID, update with full array
 */

import { DartClient } from '../api/dartClient.js';
import { handleGetConfig } from './get_config.js';
import {
  UpdateTaskInput,
  UpdateTaskOutput,
  DartAPIError,
  ValidationError,
  DartConfig,
  DartTask,
  findDartboard,
  findStatus,
  findTag,
  getDartboardNames,
  getStatusNames,
} from '../types/index.js';

/** Fields that are valid update fields (everything except identifiers/timestamps) */
const VALID_UPDATE_FIELDS = new Set([
  'title', 'description', 'dartboard', 'status', 'priority', 'size',
  'assignees', 'tags', 'due_at', 'start_at', 'parent_task',
  'subtask_ids', 'blocker_ids', 'blocking_ids', 'duplicate_ids', 'related_ids',
]);

/** Common parameter mistakes LLMs make, mapped to the correct field */
const FIELD_CORRECTIONS: Record<string, string> = {
  task_id: 'dart_id',
  id: 'dart_id',
  taskId: 'dart_id',
  task_name: 'title',
  name: 'title',
  board: 'dartboard',
  assignee: 'assignees',
  tag: 'tags',
  due_date: 'due_at',
  dueDate: 'due_at',
  start_date: 'start_at',
  startDate: 'start_at',
  parent: 'parent_task',
  parentId: 'parent_task',
  parent_id: 'parent_task',
  blockers: 'blocker_ids',
  blocking: 'blocking_ids',
  subtasks: 'subtask_ids',
  duplicates: 'duplicate_ids',
  related: 'related_ids',
  // Detect old nested format
  updates: 'NESTED_UPDATES',
};

/**
 * Handle update_task tool calls
 *
 * Accepts flat input: { dart_id, title?, status?, blocker_ids?, ... }
 * Detects common LLM mistakes and provides corrective error messages.
 */
export async function handleUpdateTask(input: UpdateTaskInput): Promise<UpdateTaskOutput> {
  const DART_TOKEN = process.env.DART_TOKEN;

  if (!DART_TOKEN) {
    throw new DartAPIError(
      'DART_TOKEN environment variable is required. Get your token from: https://app.dartai.com/?settings=account',
      401
    );
  }

  // ============================================================================
  // Step 1: Validate input and detect common mistakes
  // ============================================================================
  if (!input || typeof input !== 'object') {
    throw new ValidationError(
      'input is required and must be an object',
      'input'
    );
  }

  // Detect nested { updates: {...} } format and give corrective error
  if ('updates' in input && typeof (input as any).updates === 'object') {
    const nested = (input as any).updates;
    const fieldList = Object.keys(nested).join(', ');
    throw new ValidationError(
      `Do not wrap fields in an "updates" object. Pass fields directly alongside dart_id. ` +
      `Instead of { dart_id, updates: { ${fieldList} } }, use { dart_id, ${fieldList} }`,
      'updates'
    );
  }

  // Detect task_id/id used instead of dart_id
  const rawInput = input as Record<string, unknown>;
  if (!rawInput.dart_id) {
    if (rawInput.task_id) {
      throw new ValidationError(
        `Use "dart_id" not "task_id". Received task_id: "${rawInput.task_id}"`,
        'dart_id'
      );
    }
    if (rawInput.id) {
      throw new ValidationError(
        `Use "dart_id" not "id". Received id: "${rawInput.id}"`,
        'dart_id'
      );
    }
    if (rawInput.taskId) {
      throw new ValidationError(
        `Use "dart_id" not "taskId". Received taskId: "${rawInput.taskId}"`,
        'dart_id'
      );
    }
    throw new ValidationError(
      'dart_id is required and must be a non-empty string',
      'dart_id'
    );
  }

  if (typeof input.dart_id !== 'string' || input.dart_id.trim() === '') {
    throw new ValidationError(
      'dart_id must be a non-empty string',
      'dart_id'
    );
  }

  // Detect misspelled field names and suggest corrections
  const corrections: string[] = [];
  for (const key of Object.keys(rawInput)) {
    if (key === 'dart_id') continue;
    if (VALID_UPDATE_FIELDS.has(key)) continue;
    const correction = FIELD_CORRECTIONS[key];
    if (correction && correction !== 'NESTED_UPDATES') {
      corrections.push(`"${key}" → use "${correction}" instead`);
    }
  }
  if (corrections.length > 0) {
    throw new ValidationError(
      `Invalid field names: ${corrections.join(', ')}`,
      corrections[0].split('"')[1]
    );
  }

  // ============================================================================
  // Step 2: Extract update fields (everything except dart_id)
  // ============================================================================
  const { dart_id, ...updateFields } = input;

  if (Object.keys(updateFields).length === 0) {
    throw new ValidationError(
      'At least one field to update is required alongside dart_id (e.g., title, status, blocker_ids)',
      'input'
    );
  }

  // ============================================================================
  // Step 3: Get workspace config for validation
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
  // Step 4: Build resolved updates object (only changed fields)
  // ============================================================================
  const resolvedUpdates: Partial<DartTask> = {};
  const updatedFields: string[] = [];

  for (const key of Object.keys(updateFields)) {
    if ((updateFields as any)[key] !== undefined) {
      updatedFields.push(key);
    }
  }

  // ============================================================================
  // Step 5: Validate and resolve title
  // ============================================================================
  if (updateFields.title !== undefined) {
    if (typeof updateFields.title !== 'string' || updateFields.title.trim() === '') {
      throw new ValidationError(
        'title must be a non-empty string',
        'title'
      );
    }

    if (updateFields.title.length > 500) {
      throw new ValidationError(
        `title exceeds maximum length of 500 characters (current: ${updateFields.title.length})`,
        'title'
      );
    }

    resolvedUpdates.title = updateFields.title;
  }

  // ============================================================================
  // Step 6: Validate and resolve dartboard
  // ============================================================================
  if (updateFields.dartboard !== undefined) {
    if (!config.dartboards || config.dartboards.length === 0) {
      throw new ValidationError(
        'No dartboards found in workspace configuration. Cannot update dartboard.',
        'dartboard'
      );
    }

    const dartboard = findDartboard(config.dartboards, updateFields.dartboard!);

    if (!dartboard) {
      const dartboardNames = getDartboardNames(config.dartboards);
      const availableDartboards = dartboardNames.slice(0, 10).join(', ') +
        (dartboardNames.length > 10 ? `, ... (${dartboardNames.length - 10} more)` : '');
      throw new ValidationError(
        `Invalid dartboard: "${updateFields.dartboard}" not found in workspace. Available dartboards: ${availableDartboards}`,
        'dartboard',
        dartboardNames
      );
    }

    resolvedUpdates.dartboard = typeof dartboard === 'string' ? dartboard : dartboard.dart_id;
  }

  // ============================================================================
  // Step 7: Validate and resolve status
  // ============================================================================
  if (updateFields.status !== undefined) {
    if (!config.statuses || config.statuses.length === 0) {
      throw new ValidationError(
        'No statuses found in workspace configuration. Cannot update status.',
        'status'
      );
    }

    const status = findStatus(config.statuses, updateFields.status!);

    if (!status) {
      const statusNames = getStatusNames(config.statuses);
      const availableStatuses = statusNames.join(', ');
      throw new ValidationError(
        `Invalid status: "${updateFields.status}" not found in workspace. Available statuses: ${availableStatuses}`,
        'status',
        statusNames
      );
    }

    resolvedUpdates.status = typeof status === 'string' ? status : status.dart_id;
  }

  // ============================================================================
  // Step 8: Validate and resolve assignees
  // ============================================================================
  if (updateFields.assignees !== undefined) {
    if (!Array.isArray(updateFields.assignees)) {
      throw new ValidationError(
        'assignees must be an array of assignee dart_ids, names, or emails',
        'assignees'
      );
    }

    if (updateFields.assignees.length > 0) {
      if (!config.assignees || config.assignees.length === 0) {
        throw new ValidationError(
          'No assignees found in workspace configuration. Cannot update assignees.',
          'assignees'
        );
      }

      const invalidAssignees: string[] = [];

      for (const assigneeId of updateFields.assignees) {
        if (typeof assigneeId !== 'string') {
          throw new ValidationError(
            `assignees array must contain only strings, found: ${typeof assigneeId}`,
            'assignees'
          );
        }

        const assigneeExists = config.assignees.some(
          (assignee) => assignee.email === assigneeId || assignee.name === assigneeId
        );

        if (!assigneeExists) {
          invalidAssignees.push(assigneeId);
        }
      }

      if (invalidAssignees.length > 0) {
        const availableAssignees = config.assignees
          .map((a) => a.email ? `${a.name} <${a.email}>` : a.name)
          .join(', ');
        throw new ValidationError(
          `Invalid assignee(s): ${invalidAssignees.join(', ')} not found in workspace. Available assignees: ${availableAssignees}`,
          'assignees',
          config.assignees.map((a) => a.email || a.name)
        );
      }

      // Resolve assignee names/emails - use email if available, otherwise name
      const resolvedAssignees = updateFields.assignees.map((assigneeIdOrName) => {
        const assignee = config.assignees.find(
          (a) => a.email === assigneeIdOrName || a.name === assigneeIdOrName
        );
        return assignee ? (assignee.email || assignee.name) : assigneeIdOrName;
      });

      resolvedUpdates.assignees = resolvedAssignees;
    } else {
      resolvedUpdates.assignees = [];
    }
  }

  // ============================================================================
  // Step 9: Resolve tags (pass through as-is, Dart API creates new tags)
  // ============================================================================
  if (updateFields.tags !== undefined) {
    if (!Array.isArray(updateFields.tags)) {
      throw new ValidationError(
        'tags must be an array of tag dart_ids or names',
        'tags'
      );
    }

    if (updateFields.tags.length > 0) {
      const resolvedTags: string[] = [];
      for (const tagInput of updateFields.tags) {
        if (typeof tagInput !== 'string') {
          throw new ValidationError(
            `tags array must contain only strings, found: ${typeof tagInput}`,
            'tags'
          );
        }
        const tag = findTag(config.tags, tagInput);
        resolvedTags.push(tag ? (typeof tag === 'string' ? tag : tag.dart_id) : tagInput);
      }
      resolvedUpdates.tags = resolvedTags;
    } else {
      resolvedUpdates.tags = [];
    }
  }

  // ============================================================================
  // Step 10: Validate priority and size
  // ============================================================================
  if (updateFields.priority !== undefined) {
    if (!config.priorities || config.priorities.length === 0) {
      throw new ValidationError(
        'No priorities found in workspace configuration. Cannot update priority.',
        'priority'
      );
    }

    if (typeof updateFields.priority !== 'number' || updateFields.priority < 1 || updateFields.priority > 5) {
      throw new ValidationError(
        `Invalid priority: ${updateFields.priority}. Valid range: 1-5 (1=lowest, 5=highest)`,
        'priority',
        ['1', '2', '3', '4', '5']
      );
    }

    resolvedUpdates.priority = updateFields.priority;
  }

  if (updateFields.size !== undefined) {
    if (!config.sizes || config.sizes.length === 0) {
      throw new ValidationError(
        'No sizes found in workspace configuration. Cannot update size.',
        'size'
      );
    }

    if (typeof updateFields.size !== 'number' || updateFields.size < 1 || updateFields.size > 5) {
      throw new ValidationError(
        `Invalid size: ${updateFields.size}. Valid range: 1-5 (1=XS, 5=XL)`,
        'size',
        ['1', '2', '3', '4', '5']
      );
    }

    resolvedUpdates.size = updateFields.size;
  }

  // ============================================================================
  // Step 11: Validate date formats
  // ============================================================================
  if (updateFields.due_at !== undefined) {
    const dueDate = new Date(updateFields.due_at);
    if (isNaN(dueDate.getTime())) {
      throw new ValidationError(
        `Invalid due_at date format: "${updateFields.due_at}". Expected ISO8601 format (e.g., "2026-01-17T10:00:00Z")`,
        'due_at'
      );
    }
    resolvedUpdates.due_at = updateFields.due_at;
  }

  if (updateFields.start_at !== undefined) {
    const startDate = new Date(updateFields.start_at);
    if (isNaN(startDate.getTime())) {
      throw new ValidationError(
        `Invalid start_at date format: "${updateFields.start_at}". Expected ISO8601 format (e.g., "2026-01-17T10:00:00Z")`,
        'start_at'
      );
    }
    resolvedUpdates.start_at = updateFields.start_at;
  }

  // ============================================================================
  // Step 12: Pass through other fields (description, parent_task, etc.)
  // ============================================================================
  if (updateFields.description !== undefined) {
    resolvedUpdates.description = updateFields.description;
  }

  if (updateFields.parent_task !== undefined) {
    resolvedUpdates.parent_task = updateFields.parent_task;
  }

  // ============================================================================
  // Step 13: Validate and resolve relationship fields
  // ============================================================================

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

    if (value.length === 0) {
      return [];
    }

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

  const subtaskIds = validateRelationshipArray('subtask_ids', updateFields.subtask_ids);
  if (subtaskIds !== undefined) {
    resolvedUpdates.subtask_ids = subtaskIds;
  }

  const blockerIds = validateRelationshipArray('blocker_ids', updateFields.blocker_ids);
  if (blockerIds !== undefined) {
    resolvedUpdates.blocker_ids = blockerIds;
  }

  const blockingIds = validateRelationshipArray('blocking_ids', updateFields.blocking_ids);
  if (blockingIds !== undefined) {
    resolvedUpdates.blocking_ids = blockingIds;
  }

  const duplicateIds = validateRelationshipArray('duplicate_ids', updateFields.duplicate_ids);
  if (duplicateIds !== undefined) {
    resolvedUpdates.duplicate_ids = duplicateIds;
  }

  const relatedIds = validateRelationshipArray('related_ids', updateFields.related_ids);
  if (relatedIds !== undefined) {
    resolvedUpdates.related_ids = relatedIds;
  }

  // ============================================================================
  // Step 14: Call DartClient.updateTask()
  // ============================================================================
  const client = new DartClient({ token: DART_TOKEN });

  let updatedTask: DartTask;
  try {
    updatedTask = await client.updateTask(dart_id, resolvedUpdates);
  } catch (error) {
    if (error instanceof DartAPIError && error.statusCode === 404) {
      throw new DartAPIError(
        `Task not found: No task with dart_id "${dart_id}" exists in workspace`,
        404,
        error.response
      );
    }
    if (error instanceof DartAPIError) {
      throw new DartAPIError(
        `Failed to update task: ${error.message}`,
        error.statusCode,
        error.response
      );
    }
    throw error;
  }

  // ============================================================================
  // Step 15: Generate deep link URL and return output
  // ============================================================================
  const deepLinkUrl = `https://app.dartai.com/task/${updatedTask.dart_id}`;

  return {
    dart_id: updatedTask.dart_id,
    updated_fields: updatedFields,
    task: updatedTask,
    url: deepLinkUrl,
  };
}
