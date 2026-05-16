/**
 * Relationship auto-mirror — patches inverse sides of task relationships
 * after a write, so the graph stays bidirectionally consistent without
 * the caller having to set both sides.
 *
 * Dart's API does not auto-mirror parent↔subtask, blocker↔blocking, or the
 * symmetric duplicate/related links. Most PM tools (Jira, Linear, Asana,
 * ClickUp, GitHub sub-issues) do. dart-query restores that intuition by
 * patching the inverse side here.
 *
 * Mirror writes are best-effort: failures are collected as warnings and
 * returned to the caller, never thrown. The primary write has already
 * succeeded by the time we run; surfacing partial mirror failure beats
 * pretending the create failed.
 *
 * Scope of this file: additive mirroring (create or "pure add" operations).
 * Diff-based mirroring for updates lives alongside this when stream C2 lands.
 */

import type { DartClient } from '../api/dartClient.js';
import type { DartTask } from '../types/index.js';

/**
 * Additive deltas describing relationships set on a newly created (or
 * augmented) task. Each non-empty field triggers an inverse-side patch.
 */
export interface AdditiveRelationshipDeltas {
  parent_task?: string;
  subtask_ids?: string[];
  blocker_ids?: string[];
  blocking_ids?: string[];
  duplicate_ids?: string[];
  related_ids?: string[];
}

/**
 * Result of mirroring — non-empty `warnings` indicates one or more inverse
 * patches failed. Caller should surface this in tool output so the LLM /
 * user can see the graph is asymmetric.
 */
export interface MirrorResult {
  /** Inverse-side task IDs that were successfully patched */
  mirrored: string[];
  /** Human-readable warnings for failed inverse patches */
  warnings: string[];
}

/**
 * Patch a single relationship array on a target task by adding `anchorId`
 * if it isn't already present. GET → modify → PUT (the dart-query way).
 *
 * Returns `null` on success, or a warning string on failure.
 */
async function addToRelationshipArray(
  client: DartClient,
  targetId: string,
  field: 'subtask_ids' | 'blocker_ids' | 'blocking_ids' | 'duplicate_ids' | 'related_ids',
  anchorId: string
): Promise<string | null> {
  try {
    const target = await client.getTask(targetId);
    const current = (target as any)[field] as string[] | undefined;
    if (current && current.includes(anchorId)) {
      return null; // Already mirrored — nothing to do
    }
    const next = [...(current ?? []), anchorId];
    await client.updateTask(targetId, { [field]: next } as Partial<DartTask>);
    return null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Failed to mirror ${field} on ${targetId}: ${msg}`;
  }
}

/**
 * Set `parent_task` on a target task, replacing any existing parent.
 *
 * Used when a parent is created with `subtask_ids: [A, B]` — each child
 * needs its `parent_task` pointed at the new parent.
 */
async function setParentOnTarget(
  client: DartClient,
  targetId: string,
  newParentId: string | null
): Promise<string | null> {
  try {
    // Pass empty string to clear parent (Dart API treats undefined → no-change,
    // but the mirror layer always wants to write something explicit).
    const value = newParentId ?? '';
    await client.updateTask(targetId, { parent_task: value } as Partial<DartTask>);
    return null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Failed to mirror parent_task on ${targetId}: ${msg}`;
  }
}

/**
 * Patch a relationship array on a target task by removing `anchorId` if
 * it is currently present. No-op if not.
 */
async function removeFromRelationshipArray(
  client: DartClient,
  targetId: string,
  field: 'subtask_ids' | 'blocker_ids' | 'blocking_ids' | 'duplicate_ids' | 'related_ids',
  anchorId: string
): Promise<string | null> {
  try {
    const target = await client.getTask(targetId);
    const current = (target as any)[field] as string[] | undefined;
    if (!current || !current.includes(anchorId)) {
      return null; // Already absent — nothing to do
    }
    const next = current.filter((id) => id !== anchorId);
    await client.updateTask(targetId, { [field]: next } as Partial<DartTask>);
    return null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Failed to unmirror ${field} on ${targetId}: ${msg}`;
  }
}

/**
 * Clear `parent_task` on a child only if it currently points at
 * `expectedParent`. Prevents stomping on a parent that was re-pointed
 * between the original read and the mirror write.
 */
async function clearParentIfMatches(
  client: DartClient,
  childId: string,
  expectedParent: string
): Promise<string | null> {
  try {
    const child = await client.getTask(childId);
    if (child.parent_task !== expectedParent) {
      return null; // Parent already changed elsewhere — leave it
    }
    await client.updateTask(childId, { parent_task: '' } as Partial<DartTask>);
    return null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Failed to clear parent_task on ${childId}: ${msg}`;
  }
}

/**
 * Apply inverse-side patches for an additive write (typically create_task).
 *
 * `anchorId` is the task that was just created (or had relationships added).
 * `deltas` is the set of relationships set on the anchor.
 *
 * Mirror map:
 *   anchor.parent_task = P     → P.subtask_ids += anchor
 *   anchor.subtask_ids = [C…]  → C.parent_task = anchor (for each child)
 *   anchor.blocker_ids = [B…]  → B.blocking_ids += anchor
 *   anchor.blocking_ids = [X…] → X.blocker_ids += anchor
 *   anchor.duplicate_ids = [D…] → D.duplicate_ids += anchor (bidirectional)
 *   anchor.related_ids = [R…]   → R.related_ids += anchor (bidirectional)
 */
export async function applyAdditiveMirror(
  client: DartClient,
  anchorId: string,
  deltas: AdditiveRelationshipDeltas
): Promise<MirrorResult> {
  const mirrored: string[] = [];
  const warnings: string[] = [];

  const collect = (id: string, err: string | null) => {
    if (err) warnings.push(err);
    else mirrored.push(id);
  };

  // parent_task → patch parent's subtask_ids
  if (deltas.parent_task) {
    collect(deltas.parent_task, await addToRelationshipArray(client, deltas.parent_task, 'subtask_ids', anchorId));
  }

  // subtask_ids → patch each child's parent_task
  for (const childId of deltas.subtask_ids ?? []) {
    collect(childId, await setParentOnTarget(client, childId, anchorId));
  }

  // blocker_ids → patch each blocker's blocking_ids
  for (const blockerId of deltas.blocker_ids ?? []) {
    collect(blockerId, await addToRelationshipArray(client, blockerId, 'blocking_ids', anchorId));
  }

  // blocking_ids → patch each blocked task's blocker_ids
  for (const blockedId of deltas.blocking_ids ?? []) {
    collect(blockedId, await addToRelationshipArray(client, blockedId, 'blocker_ids', anchorId));
  }

  // duplicate_ids → bidirectional
  for (const dupId of deltas.duplicate_ids ?? []) {
    collect(dupId, await addToRelationshipArray(client, dupId, 'duplicate_ids', anchorId));
  }

  // related_ids → bidirectional
  for (const relId of deltas.related_ids ?? []) {
    collect(relId, await addToRelationshipArray(client, relId, 'related_ids', anchorId));
  }

  return { mirrored, warnings };
}

/**
 * Snapshot of a task's relationships at a point in time — used as the
 * "before" / "after" pair for diff-based mirroring on update_task.
 *
 * Missing fields are treated as "not touched" — diff only mirrors fields
 * present in both snapshots. Pass empty arrays explicitly to indicate
 * "we set this and it's now empty".
 */
export interface RelationshipSnapshot {
  parent_task?: string | null;
  subtask_ids?: string[];
  blocker_ids?: string[];
  blocking_ids?: string[];
  duplicate_ids?: string[];
  related_ids?: string[];
}

function setDiff(after: string[], before: string[]): { added: string[]; removed: string[] } {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  return {
    added: after.filter((id) => !beforeSet.has(id)),
    removed: before.filter((id) => !afterSet.has(id)),
  };
}

/**
 * Apply inverse-side patches for an update that changed relationships.
 *
 * Computes per-field added / removed sets, then issues add or remove
 * patches on the inverse side for each. Only mirrors fields where the
 * "after" snapshot was actually written (present in `touched`).
 *
 * `touched` is the set of relationship field names the caller updated.
 * Fields not in `touched` are skipped entirely, even if the snapshots
 * differ — those differences come from concurrent edits, not this write.
 */
export async function applyDiffMirror(
  client: DartClient,
  anchorId: string,
  before: RelationshipSnapshot,
  after: RelationshipSnapshot,
  touched: Set<string>
): Promise<MirrorResult> {
  const mirrored: string[] = [];
  const warnings: string[] = [];

  const collect = (id: string, err: string | null) => {
    if (err) warnings.push(err);
    else if (!mirrored.includes(id)) mirrored.push(id);
  };

  // ── parent_task: 4 cases ──────────────────────────────────────────────
  if (touched.has('parent_task')) {
    const b = before.parent_task ?? null;
    const a = after.parent_task ?? null;
    if (b !== a) {
      if (b) {
        collect(b, await removeFromRelationshipArray(client, b, 'subtask_ids', anchorId));
      }
      if (a) {
        collect(a, await addToRelationshipArray(client, a, 'subtask_ids', anchorId));
      }
    }
  }

  // ── subtask_ids: added children point at anchor, removed children clear ─
  if (touched.has('subtask_ids')) {
    const { added, removed } = setDiff(after.subtask_ids ?? [], before.subtask_ids ?? []);
    for (const childId of added) {
      collect(childId, await setParentOnTarget(client, childId, anchorId));
    }
    for (const childId of removed) {
      collect(childId, await clearParentIfMatches(client, childId, anchorId));
    }
  }

  // ── blocker_ids ↔ blocking_ids ───────────────────────────────────────
  if (touched.has('blocker_ids')) {
    const { added, removed } = setDiff(after.blocker_ids ?? [], before.blocker_ids ?? []);
    for (const id of added) {
      collect(id, await addToRelationshipArray(client, id, 'blocking_ids', anchorId));
    }
    for (const id of removed) {
      collect(id, await removeFromRelationshipArray(client, id, 'blocking_ids', anchorId));
    }
  }
  if (touched.has('blocking_ids')) {
    const { added, removed } = setDiff(after.blocking_ids ?? [], before.blocking_ids ?? []);
    for (const id of added) {
      collect(id, await addToRelationshipArray(client, id, 'blocker_ids', anchorId));
    }
    for (const id of removed) {
      collect(id, await removeFromRelationshipArray(client, id, 'blocker_ids', anchorId));
    }
  }

  // ── duplicates (bidirectional) ───────────────────────────────────────
  if (touched.has('duplicate_ids')) {
    const { added, removed } = setDiff(after.duplicate_ids ?? [], before.duplicate_ids ?? []);
    for (const id of added) {
      collect(id, await addToRelationshipArray(client, id, 'duplicate_ids', anchorId));
    }
    for (const id of removed) {
      collect(id, await removeFromRelationshipArray(client, id, 'duplicate_ids', anchorId));
    }
  }

  // ── related (bidirectional) ──────────────────────────────────────────
  if (touched.has('related_ids')) {
    const { added, removed } = setDiff(after.related_ids ?? [], before.related_ids ?? []);
    for (const id of added) {
      collect(id, await addToRelationshipArray(client, id, 'related_ids', anchorId));
    }
    for (const id of removed) {
      collect(id, await removeFromRelationshipArray(client, id, 'related_ids', anchorId));
    }
  }

  return { mirrored, warnings };
}
