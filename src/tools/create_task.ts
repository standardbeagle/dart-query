/**
 * create_task Tool Handler
 *
 * Creates a new task in Dart AI with full parameter support and reference validation.
 * This is the primary method for task creation - validates all references before API call.
 */

import { DartClient } from '../api/dartClient.js';
import { handleGetConfig } from './get_config.js';
import {
  CreateTaskInput,
  CreateTaskOutput,
  DartAPIError,
  ValidationError,
  DartConfig,
  findDartboard,
  findTag,
  findStatus,
  getDartboardNames,
  getTagNames,
  getStatusNames,
} from '../types/index.js';

/**
 * Handle create_task tool calls
 *
 * Flow:
 * 1. Validate required fields (title, dartboard)
 * 2. Get workspace config for reference validation
 * 3. Validate dartboard exists
 * 4. Validate assignees exist (if provided)
 * 5. Validate tags exist (if provided)
 * 6. Validate status exists (if provided)
 * 7. Validate priority (if provided)
 * 8. Validate size (if provided)
 * 9. Validate relationship fields format (subtask_ids, blocker_ids, etc.)
 * 10. Validate dates (if provided)
 * 11. Call DartClient.createTask()
 * 12. Map API response
 * 13. Return CreateTaskOutput
 *
 * @param input - CreateTaskInput with task details and optional relationship arrays
 * @returns CreateTaskOutput with dart_id, title, url, created_at, all_fields (includes relationships)
 */
export async function handleCreateTask(input: CreateTaskInput): Promise<CreateTaskOutput> {
  const DART_TOKEN = process.env.DART_TOKEN;

  if (!DART_TOKEN) {
    throw new DartAPIError(
      'DART_TOKEN environment variable is required. Get your token from: https://app.dartai.com/?settings=account',
      401
    );
  }

  // ============================================================================
  // Step 1: Validate required fields
  // ============================================================================
  if (!input.title || typeof input.title !== 'string' || input.title.trim() === '') {
    throw new ValidationError(
      'title is required and must be a non-empty string',
      'title'
    );
  }

  // Validate title length (max 500 chars per Dart API spec)
  if (input.title.length > 500) {
    throw new ValidationError(
      `title exceeds maximum length of 500 characters (current: ${input.title.length})`,
      'title'
    );
  }

  if (!input.dartboard || typeof input.dartboard !== 'string' || input.dartboard.trim() === '') {
    throw new ValidationError(
      'dartboard is required and must be a non-empty string (dartboard name)',
      'dartboard'
    );
  }

  // ============================================================================
  // Step 2: Get workspace config for validation
  // ============================================================================
  let config: DartConfig;
  try {
    config = await handleGetConfig({ cache_bust: false });
  } catch (error) {
    // Re-throw with enhanced context
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
  // Step 3: Validate dartboard exists
  // ============================================================================
  if (!config.dartboards || config.dartboards.length === 0) {
    throw new ValidationError(
      'No dartboards found in workspace configuration. Create a dartboard first in Dart AI.',
      'dartboard'
    );
  }

  const dartboard = findDartboard(config.dartboards, input.dartboard);

  if (!dartboard) {
    const dartboardNames = getDartboardNames(config.dartboards);
    const availableDartboards = dartboardNames.slice(0, 10).join(', ') +
      (dartboardNames.length > 10 ? `, ... (${dartboardNames.length - 10} more)` : '');
    throw new ValidationError(
      `Invalid dartboard: "${input.dartboard}" not found in workspace. Available dartboards: ${availableDartboards}`,
      'dartboard',
      dartboardNames
    );
  }

  // ============================================================================
  // Step 4: Validate assignees (if provided)
  // ============================================================================
  if (input.assignees && Array.isArray(input.assignees) && input.assignees.length > 0) {
    const invalidAssignees: string[] = [];

    for (const assignee of input.assignees) {
      const assigneeExists = config.assignees.some(
        (a) => a.email === assignee || a.name === assignee
      );

      if (!assigneeExists) {
        invalidAssignees.push(assignee);
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
  }

  // ============================================================================
  // Step 5: Validate tags (if provided)
  // ============================================================================
  if (input.tags && Array.isArray(input.tags) && input.tags.length > 0) {
    const invalidTags: string[] = [];

    for (const tagInput of input.tags) {
      if (!findTag(config.tags, tagInput)) {
        invalidTags.push(tagInput);
      }
    }

    if (invalidTags.length > 0) {
      const tagNames = getTagNames(config.tags);
      const availableTags = tagNames.slice(0, 20).join(', ') +
        (tagNames.length > 20 ? `, ... (${tagNames.length - 20} more)` : '');
      throw new ValidationError(
        `Invalid tag(s): ${invalidTags.join(', ')} not found in workspace. Available tags: ${availableTags}`,
        'tags',
        tagNames
      );
    }
  }

  // ============================================================================
  // Step 6: Validate status (if provided)
  // ============================================================================
  if (input.status && typeof input.status === 'string') {
    if (!findStatus(config.statuses, input.status)) {
      const statusNames = getStatusNames(config.statuses);
      const availableStatuses = statusNames.join(', ');
      throw new ValidationError(
        `Invalid status: "${input.status}" not found in workspace. Available statuses: ${availableStatuses}`,
        'status',
        statusNames
      );
    }
  }

  // ============================================================================
  // Step 7: Validate priority (if provided)
  // ============================================================================
  if (input.priority !== undefined && input.priority !== null) {
    // Priority validation is now string-based
    // But the input is number (1-5), so no validation needed
  }

  // ============================================================================
  // Step 8: Validate size (if provided)
  // ============================================================================
  if (input.size !== undefined && input.size !== null) {
    // Size validation is now string-based
    // But the input is number (1-5), so no validation needed
  }

  // ============================================================================
  // Step 9: Validate relationship fields (format check only, not existence)
  // ============================================================================
  /**
   * Validates that a dart_id is in a valid format.
   * dart_ids are typically alphanumeric strings, but we only validate
   * that they are non-empty strings (format-only, not existence).
   */
  const validateDartIdFormat = (id: string): boolean => {
    // dart_ids must be non-empty strings
    return typeof id === 'string' && id.trim().length > 0;
  };

  const validateRelationshipIds = (ids: string[] | undefined, fieldName: string): void => {
    if (!ids || !Array.isArray(ids)) {
      return; // Field is optional
    }

    const invalidIds: string[] = [];

    for (const id of ids) {
      if (!validateDartIdFormat(id)) {
        invalidIds.push(id === '' ? '(empty string)' : String(id));
      }
    }

    if (invalidIds.length > 0) {
      throw new ValidationError(
        `Invalid dart_id format in ${fieldName}: ${invalidIds.join(', ')}. Each ID must be a non-empty string.`,
        fieldName
      );
    }
  };

  // Validate all relationship fields
  validateRelationshipIds(input.subtask_ids, 'subtask_ids');
  validateRelationshipIds(input.blocker_ids, 'blocker_ids');
  validateRelationshipIds(input.blocking_ids, 'blocking_ids');
  validateRelationshipIds(input.duplicate_ids, 'duplicate_ids');
  validateRelationshipIds(input.related_ids, 'related_ids');

  // ============================================================================
  // Step 10: Validate dates (if provided)
  // ============================================================================
  const validateDate = (dateStr: string, fieldName: string) => {
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        throw new ValidationError(
          `Invalid ${fieldName}: "${dateStr}" is not a valid ISO8601 date`,
          fieldName
        );
      }
    } catch {
      throw new ValidationError(
        `Invalid ${fieldName}: "${dateStr}" is not a valid ISO8601 date`,
        fieldName
      );
    }
  };

  if (input.due_at) {
    validateDate(input.due_at, 'due_at');
  }

  if (input.start_at) {
    validateDate(input.start_at, 'start_at');
  }

  // ============================================================================
  // Step 11: Create task via API
  // ============================================================================
  const client = new DartClient({ token: DART_TOKEN });

  let createdTask;
  try {
    createdTask = await client.createTask(input);
  } catch (error) {
    if (error instanceof DartAPIError) {
      throw new DartAPIError(
        `Failed to create task: ${error.message}`,
        error.statusCode,
        error.response
      );
    }
    throw error;
  }

  // ============================================================================
  // Step 12: Map API response (API returns 'id' but we use 'dart_id')
  // ============================================================================
  const taskWithDartId = {
    ...createdTask,
    dart_id: (createdTask as any).id || createdTask.dart_id,
    created_at: (createdTask as any).createdAt || createdTask.created_at,
    updated_at: (createdTask as any).updatedAt || createdTask.updated_at,
  };

  const url = (createdTask as any).htmlUrl || `https://app.dartai.com/task/${taskWithDartId.dart_id}`;

  // ============================================================================
  // Step 13: Return CreateTaskOutput
  // ============================================================================
  return {
    dart_id: taskWithDartId.dart_id,
    title: taskWithDartId.title,
    url,
    created_at: taskWithDartId.created_at,
    all_fields: taskWithDartId,
  };
}
