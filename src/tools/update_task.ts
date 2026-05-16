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
  resolveDartId,
  RELATIONSHIP_FIELDS,
  RelationshipField,
} from '../types/index.js';
import { normalizeRelationshipInput, assertNoPseudoEdgeTags } from '../api/relationshipNormalizer.js';
import { applyDiffMirror, type RelationshipSnapshot } from './relationshipMirror.js';

/** Fields that are valid update fields (everything except identifiers/timestamps) */
const VALID_UPDATE_FIELDS = new Set([
  'title', 'description', 'dartboard', 'status', 'priority', 'size',
  'assignees', 'tags', 'due_at', 'start_at', 'parent_task',
  'subtask_ids', 'blocker_ids', 'blocking_ids', 'duplicate_ids', 'related_ids',
  'comment', 'add_to', 'remove_from',
]);

/**
 * Hard mistakes — wrong field names that have a single obvious target.
 * These still throw a corrective error because the input clearly meant
 * something else (not a stylistic synonym).
 *
 * Relationship-name aliases (parent, subtasks, blocked_by, blocks, etc.)
 * are handled by `normalizeRelationshipInput` upstream and never reach
 * this map.
 */
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

  // Normalize relationship-field aliases (parent, subtasks, blocked_by, etc.)
  // → legacy internal names (parent_task, subtask_ids, ...) so the rest of the
  // handler doesn't branch on surface naming. Replaces `input` in-place.
  const normalized = normalizeRelationshipInput(input as unknown as Record<string, unknown>);
  input = normalized as unknown as UpdateTaskInput;

  // Accept id, task_id, or taskId as aliases for dart_id
  const rawInput = normalized;
  input.dart_id = resolveDartId(rawInput);

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
  // Normalize relationship-field aliases inside add_to / remove_from too,
  // so callers can write `add_to: { blocked_by: [...] }` instead of `blocker_ids`.
  if (input.add_to && typeof input.add_to === 'object') {
    input.add_to = normalizeRelationshipInput(input.add_to as Record<string, unknown>) as typeof input.add_to;
  }
  if (input.remove_from && typeof input.remove_from === 'object') {
    input.remove_from = normalizeRelationshipInput(input.remove_from as Record<string, unknown>) as typeof input.remove_from;
  }

  const { dart_id, comment, add_to, remove_from, ...updateFields } = input;

  // Validate comment if provided
  if (comment !== undefined) {
    if (typeof comment !== 'string' || comment.trim() === '') {
      throw new ValidationError('comment must be a non-empty string', 'comment');
    }
  }

  // Validate add_to / remove_from
  const relationshipFieldSet = new Set<string>(RELATIONSHIP_FIELDS);
  for (const [opName, opValue] of [['add_to', add_to], ['remove_from', remove_from]] as const) {
    if (opValue === undefined) continue;
    if (typeof opValue !== 'object' || opValue === null) {
      throw new ValidationError(`${opName} must be an object`, opName);
    }
    for (const [field, ids] of Object.entries(opValue)) {
      if (!relationshipFieldSet.has(field)) {
        throw new ValidationError(
          `${opName} only supports relationship fields: ${RELATIONSHIP_FIELDS.join(', ')}`,
          opName
        );
      }
      if (!Array.isArray(ids)) {
        throw new ValidationError(`${opName}.${field} must be an array of dart_ids`, opName);
      }
      // Check for conflict: direct field + add_to/remove_from on same field
      if ((updateFields as any)[field] !== undefined) {
        throw new ValidationError(
          `Cannot use both direct "${field}" and ${opName}.${field} — use one or the other`,
          field
        );
      }
    }
  }

  const hasAddRemoveOps = add_to !== undefined || remove_from !== undefined;
  if (Object.keys(updateFields).length === 0 && !hasAddRemoveOps && comment === undefined) {
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

    // Reject pseudo-edge tags ("needs:X", "blocks:Y", etc.) before resolving.
    assertNoPseudoEdgeTags(updateFields.tags, ValidationError);

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
    resolvedUpdates.priority = updateFields.priority;
  }

  if (updateFields.size !== undefined) {
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
  // Step 14: Resolve add_to / remove_from by fetching current task
  // ============================================================================
  const client = new DartClient({ token: DART_TOKEN });

  // Identify which relationship fields this update touches. Used both for
  // resolving add_to/remove_from and for capturing the "before" snapshot
  // needed by the auto-mirror diff. parent_task is a scalar, the rest arrays.
  const touchedRelationshipFields = new Set<string>();
  for (const f of RELATIONSHIP_FIELDS) {
    if (resolvedUpdates[f] !== undefined) touchedRelationshipFields.add(f);
  }
  if (resolvedUpdates.parent_task !== undefined) touchedRelationshipFields.add('parent_task');
  if (add_to) Object.keys(add_to).forEach((f) => touchedRelationshipFields.add(f));
  if (remove_from) Object.keys(remove_from).forEach((f) => touchedRelationshipFields.add(f));

  // Pre-fetch current task once when relationships are touched. Reused for
  // both add_to/remove_from resolution and the mirror "before" snapshot.
  let currentTask: DartTask | undefined;
  if (hasAddRemoveOps || touchedRelationshipFields.size > 0) {
    currentTask = await client.getTask(dart_id);
  }

  if (hasAddRemoveOps && currentTask) {
    // Collect all relationship fields touched by add_to/remove_from
    const opFields = new Set<RelationshipField>();
    if (add_to) Object.keys(add_to).forEach(f => opFields.add(f as RelationshipField));
    if (remove_from) Object.keys(remove_from).forEach(f => opFields.add(f as RelationshipField));

    for (const field of opFields) {
      const current = (currentTask[field] as string[] | undefined) ?? [];
      let merged = [...current];

      // Add new IDs (deduplicate)
      if (add_to?.[field]) {
        const addIds = add_to[field]!;
        const existing = new Set(merged);
        for (const id of addIds) {
          if (!existing.has(id)) merged.push(id);
        }
      }

      // Remove specified IDs
      if (remove_from?.[field]) {
        const removeSet = new Set(remove_from[field]!);
        merged = merged.filter(id => !removeSet.has(id));
      }

      resolvedUpdates[field] = merged;
      if (!updatedFields.includes(field)) updatedFields.push(field);
    }
  }

  // Snapshot "before" relationships from pre-fetched currentTask
  const beforeSnapshot: RelationshipSnapshot | undefined = currentTask && {
    parent_task: currentTask.parent_task ?? null,
    subtask_ids: currentTask.subtask_ids ?? [],
    blocker_ids: currentTask.blocker_ids ?? [],
    blocking_ids: currentTask.blocking_ids ?? [],
    duplicate_ids: currentTask.duplicate_ids ?? [],
    related_ids: currentTask.related_ids ?? [],
  };

  // ============================================================================
  // Step 16: Call DartClient.updateTask() (skip if comment-only)
  // ============================================================================

  let updatedTask: DartTask;
  if (Object.keys(resolvedUpdates).length === 0) {
    // Comment-only update — just fetch current task
    updatedTask = await client.getTask(dart_id);
  } else {
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
  }

  // ============================================================================
  // Step 16.5: Auto-mirror inverse-side relationship changes
  //
  // Same intent as create-side mirror: keep parent↔subtask, blocker↔blocking,
  // duplicate, related links bidirectionally consistent. Diff before/after
  // and patch the inverse side per change. Best-effort; warnings surface in
  // output but do not fail the update.
  // ============================================================================
  let mirrorApplied: string[] = [];
  let mirrorWarnings: string[] = [];
  if (beforeSnapshot && touchedRelationshipFields.size > 0) {
    const afterSnapshot: RelationshipSnapshot = {
      parent_task: updatedTask.parent_task ?? null,
      subtask_ids: updatedTask.subtask_ids ?? [],
      blocker_ids: updatedTask.blocker_ids ?? [],
      blocking_ids: updatedTask.blocking_ids ?? [],
      duplicate_ids: updatedTask.duplicate_ids ?? [],
      related_ids: updatedTask.related_ids ?? [],
    };
    const mirror = await applyDiffMirror(
      client,
      updatedTask.dart_id,
      beforeSnapshot,
      afterSnapshot,
      touchedRelationshipFields
    );
    mirrorApplied = mirror.mirrored;
    mirrorWarnings = mirror.warnings;
  }

  // ============================================================================
  // Step 17: Add comment if provided (non-blocking — update already succeeded)
  // ============================================================================
  let commentAdded: boolean | undefined;
  let commentError: string | undefined;
  if (comment) {
    try {
      await client.addComment(dart_id, comment.trim());
      commentAdded = true;
    } catch (err) {
      commentAdded = false;
      commentError = err instanceof Error ? err.message : String(err);
    }
  }

  // ============================================================================
  // Step 18: Generate deep link URL and return output
  // ============================================================================
  const deepLinkUrl = `https://app.dartai.com/task/${updatedTask.dart_id}`;

  return {
    dart_id: updatedTask.dart_id,
    updated_fields: updatedFields,
    task: updatedTask,
    url: deepLinkUrl,
    ...(commentAdded !== undefined && { comment_added: commentAdded }),
    ...(commentError !== undefined && { comment_error: commentError }),
    ...(mirrorApplied.length > 0 && { mirror_applied: mirrorApplied }),
    ...(mirrorWarnings.length > 0 && { mirror_warnings: mirrorWarnings }),
  };
}
