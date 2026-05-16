/**
 * link_tasks Tool Handler
 *
 * Atomic bidirectional linker for task relationships. One call writes both
 * sides — the anchor's relationship array and the inverse side on each
 * target — via the auto-mirror path used by create_task / update_task.
 *
 * Maps directly onto Linear's `issueRelationCreate` mental model so LLMs
 * trained on PM-tool corpus can reach for the verb that matches their
 * intent instead of remembering which array name to set on which side.
 *
 * Internally this delegates to `handleUpdateTask` so the synonym
 * normalization, pseudo-edge tag rejection, and auto-mirror diff logic
 * are reused unchanged.
 */

import { handleUpdateTask } from './update_task.js';
import {
  LinkTasksInput,
  LinkTasksOutput,
  ValidationError,
  UpdateTaskInput,
} from '../types/index.js';

/** Valid relationship verbs accepted by link_tasks */
export const LINK_TYPES = [
  'parent',
  'subtasks',
  'blocks',
  'blocked_by',
  'duplicates',
  'related',
] as const;
export type LinkType = typeof LINK_TYPES[number];

/**
 * Translate a `link_tasks` request into an `update_task` payload.
 *
 * - `parent`     : single target, written directly to anchor.parent_task
 * - everything else : multi-target add_to.<inverse_field> on the anchor
 *
 * The corresponding inverse-side patches happen inside `update_task` via
 * the diff-mirror code path — no duplicate logic here.
 */
function buildUpdatePayload(input: LinkTasksInput): UpdateTaskInput {
  switch (input.type) {
    case 'parent':
      if (input.to.length !== 1) {
        throw new ValidationError(
          `link_tasks { type: "parent" } accepts exactly one target task ID; got ${input.to.length}. ` +
            `A task can only have one parent — use { type: "subtasks", from: parentId, to: [...] } ` +
            `if you meant to attach multiple children.`,
          'to'
        );
      }
      return {
        dart_id: input.from,
        parent_task: input.to[0],
      };

    case 'subtasks':
      return {
        dart_id: input.from,
        add_to: { subtask_ids: input.to },
      };

    case 'blocks':
      return {
        dart_id: input.from,
        add_to: { blocking_ids: input.to },
      };

    case 'blocked_by':
      return {
        dart_id: input.from,
        add_to: { blocker_ids: input.to },
      };

    case 'duplicates':
      return {
        dart_id: input.from,
        add_to: { duplicate_ids: input.to },
      };

    case 'related':
      return {
        dart_id: input.from,
        add_to: { related_ids: input.to },
      };

    default: {
      const exhaustive: never = input.type;
      throw new ValidationError(
        `Unknown link type "${exhaustive}". Valid types: ${LINK_TYPES.join(', ')}`,
        'type'
      );
    }
  }
}

export async function handleLinkTasks(input: LinkTasksInput): Promise<LinkTasksOutput> {
  if (!input || typeof input !== 'object') {
    throw new ValidationError('input is required and must be an object', 'input');
  }
  if (!input.from || typeof input.from !== 'string' || input.from.trim() === '') {
    throw new ValidationError('from is required and must be a non-empty dart_id', 'from');
  }
  if (!input.type || !LINK_TYPES.includes(input.type as LinkType)) {
    throw new ValidationError(
      `type is required and must be one of: ${LINK_TYPES.join(', ')}`,
      'type'
    );
  }
  if (!Array.isArray(input.to) || input.to.length === 0) {
    throw new ValidationError('to is required and must be a non-empty array of dart_ids', 'to');
  }
  for (const id of input.to) {
    if (typeof id !== 'string' || id.trim() === '') {
      throw new ValidationError('each entry in `to` must be a non-empty dart_id string', 'to');
    }
  }

  const payload = buildUpdatePayload(input);
  const result = await handleUpdateTask(payload);

  return {
    from: result.dart_id,
    type: input.type,
    to: input.to,
    url: result.url,
    // Surface mirror status — primary motivation for using this verb
    mirror_applied: result.mirror_applied ?? [],
    mirror_warnings: result.mirror_warnings ?? [],
  };
}
