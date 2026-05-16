/**
 * Relationship field normalizer
 *
 * dart-query exposes Jira/Linear-style canonical names (`parent`, `subtasks`,
 * `blocked_by`, `blocks`, `duplicates`, `related`) but the internal API client
 * still consumes legacy snake_case names (`parent_task`, `subtask_ids`, etc.).
 *
 * This module maps any accepted input alias — canonical names, camelCase
 * variants, and common LLM near-misses — onto the legacy names. Keeps the
 * "Postel: liberal in, strict internal" contract in one place so both
 * `create_task` and `update_task` accept identical synonym sets.
 *
 * Legacy names are removed in 0.13.0; at that point the internal contract
 * migrates to canonical and this map shrinks.
 */

/**
 * Maps any input alias to the legacy internal name.
 * Keys are alias names callers may send; values are the canonical legacy
 * field name used inside DartClient + tool handlers.
 *
 * Identity entries (legacy → legacy) are intentional: simplifies callers,
 * lets the normalizer be applied unconditionally.
 */
export const RELATIONSHIP_INPUT_SYNONYMS: Readonly<Record<string, string>> = Object.freeze({
  // Parent
  parent: 'parent_task',
  parentId: 'parent_task',
  parent_id: 'parent_task',
  parent_task: 'parent_task',

  // Subtasks (parent → children)
  subtasks: 'subtask_ids',
  children: 'subtask_ids',
  child_ids: 'subtask_ids',
  childIds: 'subtask_ids',
  subtaskIds: 'subtask_ids',
  subtask_ids: 'subtask_ids',

  // Blocked by (this is blocked by X)
  blocked_by: 'blocker_ids',
  blockedBy: 'blocker_ids',
  blockers: 'blocker_ids',
  depends_on: 'blocker_ids',
  dependsOn: 'blocker_ids',
  blockerIds: 'blocker_ids',
  blocker_ids: 'blocker_ids',

  // Blocks (this blocks X)
  blocks: 'blocking_ids',
  blocking: 'blocking_ids',
  blockingIds: 'blocking_ids',
  blocking_ids: 'blocking_ids',

  // Duplicates
  duplicates: 'duplicate_ids',
  duplicate_of: 'duplicate_ids',
  duplicateOf: 'duplicate_ids',
  duplicateIds: 'duplicate_ids',
  duplicate_ids: 'duplicate_ids',

  // Related
  related: 'related_ids',
  relations: 'related_ids',
  relatedIds: 'related_ids',
  related_ids: 'related_ids',
});

/**
 * Rewrite an input object so any relationship alias is replaced by its
 * legacy canonical key. Non-alias keys pass through unchanged.
 *
 * Conflict policy: if both alias and target appear (e.g. `parent` and
 * `parent_task`), the legacy key wins — the alias value is dropped. This
 * keeps existing call sites that already use legacy names deterministic
 * during the migration window.
 */
export function normalizeRelationshipInput<T extends Record<string, unknown>>(input: T): T {
  if (!input || typeof input !== 'object') return input;

  const out: Record<string, unknown> = { ...input };
  for (const key of Object.keys(input)) {
    const target = RELATIONSHIP_INPUT_SYNONYMS[key];
    if (!target || target === key) continue;
    if (target in out) {
      // Legacy key already present — drop alias, legacy wins
      delete out[key];
      continue;
    }
    out[target] = out[key];
    delete out[key];
  }
  return out as T;
}

/**
 * Map of tag-prefix → suggested relationship field. Drives the pseudo-edge
 * rejection message: when an LLM encodes a dependency as a `needs:X` tag
 * (GitHub Actions / GitLab CI muscle memory), we want a corrective error
 * naming the actual field to use.
 */
const PSEUDO_EDGE_TAG_HINTS: Readonly<Record<string, string>> = Object.freeze({
  needs: 'blocked_by',
  'depends-on': 'blocked_by',
  depends_on: 'blocked_by',
  blockedby: 'blocked_by',
  'blocked-by': 'blocked_by',
  blocks: 'blocks',
  blocking: 'blocks',
  parent: 'parent',
  'parent-of': 'subtasks',
  child: 'parent',
  'child-of': 'parent',
  subtask: 'subtasks',
  duplicate: 'duplicates',
  'duplicate-of': 'duplicates',
  related: 'related',
});

const PSEUDO_EDGE_TAG_REGEX =
  /^(needs|depends[-_]?on|blocked[-_]?by|blocks|blocking|parent(?:-of)?|child(?:-of)?|subtask|duplicate(?:-of)?|related)\s*:\s*(.+)$/i;

/**
 * Reject tags that look like dependency edges encoded as labels.
 *
 * Planners that train on GitHub Actions / Jira labels often write things
 * like `tags: ["needs:T-42", "blocks:T-99"]` to indicate dependencies.
 * Those tags are inert in Dart — the graph reads `blocker_ids` /
 * `blocking_ids` / `parent_task`, not free-text labels. Rejecting at
 * input time with a corrective message points the caller at the right
 * field instead of letting the relationship silently vanish.
 *
 * Throws if a violation is found, including the tag value and the
 * suggested replacement field. No-op for tags without recognized
 * dependency-edge prefixes.
 */
export function assertNoPseudoEdgeTags(
  tags: unknown,
  ValidationErrorCtor: new (msg: string, field: string) => Error
): void {
  if (!Array.isArray(tags)) return;
  for (const tag of tags) {
    if (typeof tag !== 'string') continue;
    const match = tag.match(PSEUDO_EDGE_TAG_REGEX);
    if (!match) continue;

    const prefix = match[1].toLowerCase().replace(/_/g, '-');
    const target = match[2].trim();
    const suggestedField = PSEUDO_EDGE_TAG_HINTS[prefix] ?? 'blocked_by';

    throw new ValidationErrorCtor(
      `Tag "${tag}" looks like a dependency edge encoded as a label. ` +
        `Dart's task graph reads relationship fields, not tags — ` +
        `use ${suggestedField}: ["${target}"] instead. ` +
        `Tags are free-text labels (e.g. "backend", "v2") and do not link tasks.`,
      'tags'
    );
  }
}
