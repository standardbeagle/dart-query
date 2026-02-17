/**
 * Shared validation for task update fields.
 *
 * Extracted from batch_update_tasks.ts so both batch_update_tasks and
 * execute_dartql can reuse the same validation logic.
 */

import {
  DartConfig,
  DartTask,
  ValidationError,
  findDartboard,
  findStatus,
  findTag,
  getDartboardNames,
  getStatusNames,
} from '../types/index.js';

/**
 * Validate updates object against workspace config.
 * Resolves names to dart_ids for all reference fields.
 */
export async function validateUpdates(
  updates: Partial<Omit<DartTask, 'dart_id' | 'created_at' | 'updated_at'>>,
  config: DartConfig
): Promise<Partial<DartTask>> {
  const validated: Partial<DartTask> = {};

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

  if (updates.description !== undefined) {
    validated.description = updates.description;
  }

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
      const available = dartboardNames.slice(0, 10).join(', ') +
        (dartboardNames.length > 10 ? `, ... (${dartboardNames.length - 10} more)` : '');
      throw new ValidationError(
        `Invalid dartboard: "${updates.dartboard}" not found in workspace. Available dartboards: ${available}`,
        'dartboard',
        dartboardNames
      );
    }
    validated.dartboard = typeof dartboard === 'string' ? dartboard : dartboard.dart_id;
  }

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
      throw new ValidationError(
        `Invalid status: "${updates.status}" not found in workspace. Available statuses: ${statusNames.join(', ')}`,
        'status',
        statusNames
      );
    }
    validated.status = typeof status === 'string' ? status : status.dart_id;
  }

  if (updates.priority !== undefined) {
    if (!config.priorities || config.priorities.length === 0) {
      throw new ValidationError(
        'No priorities found in workspace configuration. Cannot update priority.',
        'priority'
      );
    }
    if (typeof updates.priority !== 'number' || updates.priority < 1 || updates.priority > 5) {
      throw new ValidationError(
        `Invalid priority: ${updates.priority}. Valid range: 1-5 (1=lowest, 5=highest)`,
        'priority',
        ['1', '2', '3', '4', '5']
      );
    }
    validated.priority = updates.priority;
  }

  if (updates.size !== undefined) {
    if (!config.sizes || config.sizes.length === 0) {
      throw new ValidationError(
        'No sizes found in workspace configuration. Cannot update size.',
        'size'
      );
    }
    if (typeof updates.size !== 'number' || updates.size < 1 || updates.size > 5) {
      throw new ValidationError(
        `Invalid size: ${updates.size}. Valid range: 1-5 (1=XS, 5=XL)`,
        'size',
        ['1', '2', '3', '4', '5']
      );
    }
    validated.size = updates.size;
  }

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
          (a) => a.email === assigneeIdOrName || a.name === assigneeIdOrName
        );
        if (!assignee) {
          const available = config.assignees
            .map((a) => a.email ? `${a.name} <${a.email}>` : a.name)
            .join(', ');
          throw new ValidationError(
            `Invalid assignee: "${assigneeIdOrName}" not found in workspace. Available assignees: ${available}`,
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

  if (updates.tags !== undefined) {
    if (!Array.isArray(updates.tags)) {
      throw new ValidationError('tags must be an array of tag dart_ids or names', 'tags');
    }
    if (updates.tags.length > 0) {
      const resolvedTags: string[] = [];
      for (const tagInput of updates.tags) {
        if (typeof tagInput !== 'string') {
          throw new ValidationError(
            `tags array must contain only strings, found: ${typeof tagInput}`,
            'tags'
          );
        }
        const tag = findTag(config.tags, tagInput);
        resolvedTags.push(tag ? (typeof tag === 'string' ? tag : tag.dart_id) : tagInput);
      }
      validated.tags = resolvedTags;
    } else {
      validated.tags = [];
    }
  }

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

  if (updates.parent_task !== undefined) {
    validated.parent_task = updates.parent_task;
  }

  // Validate relationship arrays
  const relFields = ['subtask_ids', 'blocker_ids', 'blocking_ids', 'duplicate_ids', 'related_ids'] as const;
  for (const fieldName of relFields) {
    const val = validateRelationshipArray(fieldName, updates[fieldName]);
    if (val !== undefined) {
      (validated as Record<string, unknown>)[fieldName] = val;
    }
  }

  return validated;
}

/**
 * Validate a relationship array field value.
 * Returns the validated array, undefined if the value is undefined.
 */
export function validateRelationshipArray(
  fieldName: string,
  value: unknown
): string[] | undefined {
  if (value === undefined) return undefined;

  if (!Array.isArray(value)) {
    throw new ValidationError(`${fieldName} must be an array of task dart_ids`, fieldName);
  }

  if (value.length === 0) return [];

  for (let i = 0; i < value.length; i++) {
    const item = value[i];
    if (typeof item !== 'string') {
      throw new ValidationError(`${fieldName}[${i}] must be a string, found: ${typeof item}`, fieldName);
    }
    if (item.trim() === '') {
      throw new ValidationError(`${fieldName}[${i}] must be a non-empty string`, fieldName);
    }
  }

  return value as string[];
}

/**
 * Extract current values from task for preview display.
 */
export function extractCurrentValues(task: DartTask, updatedFields: string[]): Partial<DartTask> {
  const currentValues: Record<string, unknown> = {};
  for (const field of updatedFields) {
    if (field in task) {
      currentValues[field] = task[field as keyof DartTask];
    }
  }
  return currentValues as Partial<DartTask>;
}
