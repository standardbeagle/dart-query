/**
 * update_task Tool Handler
 *
 * Updates an existing task with partial field updates.
 * Validates all references against workspace config before API call.
 * Only sends changed fields to the API for efficiency.
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
} from '../types/index.js';

/**
 * Handle update_task tool calls
 *
 * Flow:
 * 1. Validate dart_id is provided
 * 2. Validate updates object is non-empty
 * 3. Get workspace config for reference validation
 * 4. Validate all reference fields (dartboard, status, assignees, tags)
 * 5. Resolve names to dart_ids for all reference fields
 * 6. Validate priority, size, and date formats
 * 7. Call DartClient.updateTask() with only changed fields
 * 8. Generate deep link URL
 * 9. Return UpdateTaskOutput with updated_fields list
 *
 * @param input - UpdateTaskInput with dart_id and updates object
 * @returns UpdateTaskOutput with dart_id, updated_fields, task, url
 * @throws DartAPIError with 404 if task not found
 * @throws ValidationError if any reference is invalid
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
  // Step 1: Validate input and dart_id
  // ============================================================================
  if (!input || typeof input !== 'object') {
    throw new ValidationError(
      'input is required and must be an object',
      'input'
    );
  }

  if (!input.dart_id || typeof input.dart_id !== 'string' || input.dart_id.trim() === '') {
    throw new ValidationError(
      'dart_id is required and must be a non-empty string',
      'dart_id'
    );
  }

  // ============================================================================
  // Step 2: Validate updates object
  // ============================================================================
  if (!input.updates || typeof input.updates !== 'object' || Object.keys(input.updates).length === 0) {
    throw new ValidationError(
      'updates is required and must be a non-empty object with at least one field to update',
      'updates'
    );
  }

  // ============================================================================
  // Step 3: Get workspace config for validation
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
  // Step 4: Build resolved updates object (only changed fields)
  // ============================================================================
  const resolvedUpdates: Partial<DartTask> = {};
  const updatedFields: string[] = [];

  // Track which fields are being updated
  for (const key of Object.keys(input.updates)) {
    if (input.updates[key as keyof typeof input.updates] !== undefined) {
      updatedFields.push(key);
    }
  }

  // ============================================================================
  // Step 5: Validate and resolve title
  // ============================================================================
  if (input.updates.title !== undefined) {
    if (typeof input.updates.title !== 'string' || input.updates.title.trim() === '') {
      throw new ValidationError(
        'title must be a non-empty string',
        'title'
      );
    }

    // Validate title length (max 500 chars per Dart API spec)
    if (input.updates.title.length > 500) {
      throw new ValidationError(
        `title exceeds maximum length of 500 characters (current: ${input.updates.title.length})`,
        'title'
      );
    }

    resolvedUpdates.title = input.updates.title;
  }

  // ============================================================================
  // Step 6: Validate and resolve dartboard
  // ============================================================================
  if (input.updates.dartboard !== undefined) {
    if (!config.dartboards || config.dartboards.length === 0) {
      throw new ValidationError(
        'No dartboards found in workspace configuration. Cannot update dartboard.',
        'dartboard'
      );
    }

    const dartboardExists = config.dartboards.includes(input.updates.dartboard!);

    if (!dartboardExists) {
      const availableDartboards = config.dartboards.slice(0, 10).join(', ') +
        (config.dartboards.length > 10 ? `, ... (${config.dartboards.length - 10} more)` : '');
      throw new ValidationError(
        `Invalid dartboard: "${input.updates.dartboard}" not found in workspace. Available dartboards: ${availableDartboards}`,
        'dartboard',
        config.dartboards
      );
    }

    resolvedUpdates.dartboard = input.updates.dartboard;
  }

  // ============================================================================
  // Step 7: Validate and resolve status
  // ============================================================================
  if (input.updates.status !== undefined) {
    if (!config.statuses || config.statuses.length === 0) {
      throw new ValidationError(
        'No statuses found in workspace configuration. Cannot update status.',
        'status'
      );
    }

    const statusExists = config.statuses.includes(input.updates.status!);

    if (!statusExists) {
      const availableStatuses = config.statuses.join(', ');
      throw new ValidationError(
        `Invalid status: "${input.updates.status}" not found in workspace. Available statuses: ${availableStatuses}`,
        'status',
        config.statuses
      );
    }

    resolvedUpdates.status = input.updates.status;
  }

  // ============================================================================
  // Step 8: Validate and resolve assignees
  // ============================================================================
  if (input.updates.assignees !== undefined) {
    if (!Array.isArray(input.updates.assignees)) {
      throw new ValidationError(
        'assignees must be an array of assignee dart_ids, names, or emails',
        'assignees'
      );
    }

    if (input.updates.assignees.length > 0) {
      if (!config.assignees || config.assignees.length === 0) {
        throw new ValidationError(
          'No assignees found in workspace configuration. Cannot update assignees.',
          'assignees'
        );
      }

      const invalidAssignees: string[] = [];

      for (const assigneeId of input.updates.assignees) {
        // Validate that each element is a string
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
      const resolvedAssignees = input.updates.assignees.map((assigneeIdOrName) => {
        const assignee = config.assignees.find(
          (a) => a.email === assigneeIdOrName || a.name === assigneeIdOrName
        );
        return assignee ? (assignee.email || assignee.name) : assigneeIdOrName;
      });

      resolvedUpdates.assignees = resolvedAssignees;
    } else {
      // Empty array means clear all assignees
      resolvedUpdates.assignees = [];
    }
  }

  // ============================================================================
  // Step 9: Validate and resolve tags
  // ============================================================================
  if (input.updates.tags !== undefined) {
    if (!Array.isArray(input.updates.tags)) {
      throw new ValidationError(
        'tags must be an array of tag dart_ids or names',
        'tags'
      );
    }

    if (input.updates.tags.length > 0) {
      if (!config.tags || config.tags.length === 0) {
        throw new ValidationError(
          'No tags found in workspace configuration. Cannot update tags.',
          'tags'
        );
      }

      const invalidTags: string[] = [];

      for (const tagId of input.updates.tags) {
        // Validate that each element is a string
        if (typeof tagId !== 'string') {
          throw new ValidationError(
            `tags array must contain only strings, found: ${typeof tagId}`,
            'tags'
          );
        }

        const tagExists = config.tags.includes(tagId);

        if (!tagExists) {
          invalidTags.push(tagId);
        }
      }

      if (invalidTags.length > 0) {
        const availableTags = config.tags.slice(0, 20).join(', ') +
          (config.tags.length > 20 ? `, ... (${config.tags.length - 20} more)` : '');
        throw new ValidationError(
          `Invalid tag(s): ${invalidTags.join(', ')} not found in workspace. Available tags: ${availableTags}`,
          'tags',
          config.tags
        );
      }

      // Tags are already strings, no resolution needed
      const resolvedTags = input.updates.tags;

      resolvedUpdates.tags = resolvedTags;
    } else {
      // Empty array means clear all tags
      resolvedUpdates.tags = [];
    }
  }

  // ============================================================================
  // Step 10: Validate priority and size
  // ============================================================================
  if (input.updates.priority !== undefined) {
    if (!config.priorities || config.priorities.length === 0) {
      throw new ValidationError(
        'No priorities found in workspace configuration. Cannot update priority.',
        'priority'
      );
    }

    // Priority is a number (1-5), but config has strings - validate range instead
    if (typeof input.updates.priority !== 'number' || input.updates.priority < 1 || input.updates.priority > 5) {
      throw new ValidationError(
        `Invalid priority: ${input.updates.priority}. Valid range: 1-5 (1=lowest, 5=highest)`,
        'priority',
        ['1', '2', '3', '4', '5']
      );
    }

    resolvedUpdates.priority = input.updates.priority;
  }

  if (input.updates.size !== undefined) {
    if (!config.sizes || config.sizes.length === 0) {
      throw new ValidationError(
        'No sizes found in workspace configuration. Cannot update size.',
        'size'
      );
    }

    // Size is a number (1-5), but config has strings - validate range instead
    if (typeof input.updates.size !== 'number' || input.updates.size < 1 || input.updates.size > 5) {
      throw new ValidationError(
        `Invalid size: ${input.updates.size}. Valid range: 1-5 (1=XS, 5=XL)`,
        'size',
        ['1', '2', '3', '4', '5']
      );
    }

    resolvedUpdates.size = input.updates.size;
  }

  // ============================================================================
  // Step 11: Validate date formats
  // ============================================================================
  if (input.updates.due_at !== undefined) {
    const dueDate = new Date(input.updates.due_at);
    if (isNaN(dueDate.getTime())) {
      throw new ValidationError(
        `Invalid due_at date format: "${input.updates.due_at}". Expected ISO8601 format (e.g., "2026-01-17T10:00:00Z")`,
        'due_at'
      );
    }
    resolvedUpdates.due_at = input.updates.due_at;
  }

  if (input.updates.start_at !== undefined) {
    const startDate = new Date(input.updates.start_at);
    if (isNaN(startDate.getTime())) {
      throw new ValidationError(
        `Invalid start_at date format: "${input.updates.start_at}". Expected ISO8601 format (e.g., "2026-01-17T10:00:00Z")`,
        'start_at'
      );
    }
    resolvedUpdates.start_at = input.updates.start_at;
  }

  // ============================================================================
  // Step 12: Pass through other fields (description, parent_task, etc.)
  // ============================================================================
  if (input.updates.description !== undefined) {
    resolvedUpdates.description = input.updates.description;
  }

  if (input.updates.parent_task !== undefined) {
    resolvedUpdates.parent_task = input.updates.parent_task;
  }

  // ============================================================================
  // Step 13: Call DartClient.updateTask()
  // ============================================================================
  const client = new DartClient({ token: DART_TOKEN });

  let updatedTask: DartTask;
  try {
    updatedTask = await client.updateTask({
      dart_id: input.dart_id,
      updates: resolvedUpdates,
    });
  } catch (error) {
    // Handle 404 errors specifically
    if (error instanceof DartAPIError && error.statusCode === 404) {
      throw new DartAPIError(
        `Task not found: No task with dart_id "${input.dart_id}" exists in workspace`,
        404,
        error.response
      );
    }
    // Re-throw other errors with enhanced context
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
  // Step 14: Generate deep link URL and return output
  // ============================================================================
  const deepLinkUrl = `https://app.dartai.com/task/${updatedTask.dart_id}`;

  return {
    dart_id: updatedTask.dart_id,
    updated_fields: updatedFields,
    task: updatedTask,
    url: deepLinkUrl,
  };
}
