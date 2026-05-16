/**
 * Tests for additive relationship mirror.
 *
 * Mocks DartClient at the method level — verifies that
 * `applyAdditiveMirror` issues the correct inverse-side patches and
 * collects failures as warnings rather than throwing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DartClient } from '../api/dartClient.js';
import type { DartTask } from '../types/index.js';
import { applyAdditiveMirror, applyDiffMirror, type RelationshipSnapshot } from './relationshipMirror.js';

interface MockState {
  tasks: Map<string, Partial<DartTask>>;
  updateCalls: Array<{ id: string; updates: Partial<DartTask> }>;
  failGetIds?: Set<string>;
  failUpdateIds?: Set<string>;
}

function makeMockClient(state: MockState): DartClient {
  return {
    getTask: vi.fn(async (id: string) => {
      if (state.failGetIds?.has(id)) {
        throw new Error(`simulated get failure on ${id}`);
      }
      return (state.tasks.get(id) ?? { dart_id: id }) as DartTask;
    }),
    updateTask: vi.fn(async (id: string, updates: Partial<DartTask>) => {
      if (state.failUpdateIds?.has(id)) {
        throw new Error(`simulated update failure on ${id}`);
      }
      state.updateCalls.push({ id, updates });
      const existing = state.tasks.get(id) ?? { dart_id: id };
      const merged = { ...existing, ...updates };
      state.tasks.set(id, merged);
      return merged as DartTask;
    }),
  } as unknown as DartClient;
}

describe('applyAdditiveMirror', () => {
  let state: MockState;

  beforeEach(() => {
    state = {
      tasks: new Map(),
      updateCalls: [],
    };
  });

  it('patches parent.subtask_ids when child has parent_task set', async () => {
    state.tasks.set('P', { dart_id: 'P', subtask_ids: [] });
    const client = makeMockClient(state);

    const result = await applyAdditiveMirror(client, 'NEW', { parent_task: 'P' });

    expect(result.warnings).toEqual([]);
    expect(result.mirrored).toEqual(['P']);
    expect(state.updateCalls).toEqual([
      { id: 'P', updates: { subtask_ids: ['NEW'] } },
    ]);
  });

  it('appends new child to existing parent.subtask_ids', async () => {
    state.tasks.set('P', { dart_id: 'P', subtask_ids: ['A', 'B'] });
    const client = makeMockClient(state);

    await applyAdditiveMirror(client, 'NEW', { parent_task: 'P' });

    expect(state.updateCalls[0].updates.subtask_ids).toEqual(['A', 'B', 'NEW']);
  });

  it('is idempotent — skips patch if anchor already in parent.subtask_ids', async () => {
    state.tasks.set('P', { dart_id: 'P', subtask_ids: ['NEW'] });
    const client = makeMockClient(state);

    const result = await applyAdditiveMirror(client, 'NEW', { parent_task: 'P' });

    expect(state.updateCalls).toEqual([]); // no write needed
    expect(result.warnings).toEqual([]);
    expect(result.mirrored).toEqual(['P']);
  });

  it('sets parent_task on each child when anchor declares subtask_ids', async () => {
    state.tasks.set('C1', { dart_id: 'C1' });
    state.tasks.set('C2', { dart_id: 'C2' });
    const client = makeMockClient(state);

    const result = await applyAdditiveMirror(client, 'PARENT', {
      subtask_ids: ['C1', 'C2'],
    });

    expect(result.mirrored).toEqual(['C1', 'C2']);
    expect(state.updateCalls).toEqual([
      { id: 'C1', updates: { parent_task: 'PARENT' } },
      { id: 'C2', updates: { parent_task: 'PARENT' } },
    ]);
  });

  it('mirrors blocker_ids → blocking_ids on the inverse side', async () => {
    state.tasks.set('B1', { dart_id: 'B1', blocking_ids: [] });
    const client = makeMockClient(state);

    await applyAdditiveMirror(client, 'TASK', { blocker_ids: ['B1'] });

    expect(state.updateCalls).toEqual([
      { id: 'B1', updates: { blocking_ids: ['TASK'] } },
    ]);
  });

  it('mirrors blocking_ids → blocker_ids on the inverse side', async () => {
    state.tasks.set('X1', { dart_id: 'X1', blocker_ids: [] });
    const client = makeMockClient(state);

    await applyAdditiveMirror(client, 'TASK', { blocking_ids: ['X1'] });

    expect(state.updateCalls).toEqual([
      { id: 'X1', updates: { blocker_ids: ['TASK'] } },
    ]);
  });

  it('mirrors duplicates bidirectionally', async () => {
    state.tasks.set('D1', { dart_id: 'D1', duplicate_ids: [] });
    const client = makeMockClient(state);

    await applyAdditiveMirror(client, 'TASK', { duplicate_ids: ['D1'] });

    expect(state.updateCalls).toEqual([
      { id: 'D1', updates: { duplicate_ids: ['TASK'] } },
    ]);
  });

  it('mirrors related bidirectionally', async () => {
    state.tasks.set('R1', { dart_id: 'R1', related_ids: [] });
    const client = makeMockClient(state);

    await applyAdditiveMirror(client, 'TASK', { related_ids: ['R1'] });

    expect(state.updateCalls).toEqual([
      { id: 'R1', updates: { related_ids: ['TASK'] } },
    ]);
  });

  it('collects warnings for failures, never throws', async () => {
    state.tasks.set('P', { dart_id: 'P' });
    state.failUpdateIds = new Set(['P']);
    const client = makeMockClient(state);

    const result = await applyAdditiveMirror(client, 'NEW', { parent_task: 'P' });

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('subtask_ids');
    expect(result.warnings[0]).toContain('P');
    expect(result.mirrored).toEqual([]);
  });

  it('continues mirroring remaining sides even if one fails', async () => {
    state.tasks.set('P', { dart_id: 'P' });
    state.tasks.set('B1', { dart_id: 'B1', blocking_ids: [] });
    state.failUpdateIds = new Set(['P']);
    const client = makeMockClient(state);

    const result = await applyAdditiveMirror(client, 'NEW', {
      parent_task: 'P',
      blocker_ids: ['B1'],
    });

    expect(result.warnings).toHaveLength(1);
    expect(result.mirrored).toEqual(['B1']); // blocker mirror succeeded
  });

  it('returns empty result for empty deltas', async () => {
    const client = makeMockClient(state);
    const result = await applyAdditiveMirror(client, 'NEW', {});
    expect(result).toEqual({ mirrored: [], warnings: [] });
    expect(state.updateCalls).toEqual([]);
  });
});

describe('applyDiffMirror', () => {
  let state: MockState;

  beforeEach(() => {
    state = { tasks: new Map(), updateCalls: [] };
  });

  const empty: RelationshipSnapshot = {
    parent_task: null,
    subtask_ids: [],
    blocker_ids: [],
    blocking_ids: [],
    duplicate_ids: [],
    related_ids: [],
  };

  it('only mirrors fields listed in `touched`, even when snapshots differ', async () => {
    const client = makeMockClient(state);
    const before: RelationshipSnapshot = { ...empty, blocker_ids: ['B1'] };
    const after: RelationshipSnapshot = { ...empty, blocker_ids: ['B2'] };

    // Pretend caller did NOT touch blocker_ids — mirror should ignore the diff
    const result = await applyDiffMirror(client, 'A', before, after, new Set());
    expect(result).toEqual({ mirrored: [], warnings: [] });
    expect(state.updateCalls).toEqual([]);
  });

  it('parent change P1 → P2 removes from P1.subtasks and adds to P2.subtasks', async () => {
    state.tasks.set('P1', { dart_id: 'P1', subtask_ids: ['A'] });
    state.tasks.set('P2', { dart_id: 'P2', subtask_ids: [] });
    const client = makeMockClient(state);

    await applyDiffMirror(
      client,
      'A',
      { ...empty, parent_task: 'P1' },
      { ...empty, parent_task: 'P2' },
      new Set(['parent_task'])
    );

    const targets = state.updateCalls.map((c) => c.id).sort();
    expect(targets).toEqual(['P1', 'P2']);
    const p1Update = state.updateCalls.find((c) => c.id === 'P1')!;
    expect(p1Update.updates.subtask_ids).toEqual([]);
    const p2Update = state.updateCalls.find((c) => c.id === 'P2')!;
    expect(p2Update.updates.subtask_ids).toEqual(['A']);
  });

  it('parent cleared (P → null) removes anchor from P.subtasks', async () => {
    state.tasks.set('P', { dart_id: 'P', subtask_ids: ['A', 'OTHER'] });
    const client = makeMockClient(state);

    await applyDiffMirror(
      client,
      'A',
      { ...empty, parent_task: 'P' },
      { ...empty, parent_task: null },
      new Set(['parent_task'])
    );

    expect(state.updateCalls).toEqual([
      { id: 'P', updates: { subtask_ids: ['OTHER'] } },
    ]);
  });

  it('subtask added → set parent_task on new child; removed → clear if still ours', async () => {
    state.tasks.set('C_NEW', { dart_id: 'C_NEW' });
    state.tasks.set('C_OLD', { dart_id: 'C_OLD', parent_task: 'P' });
    const client = makeMockClient(state);

    await applyDiffMirror(
      client,
      'P',
      { ...empty, subtask_ids: ['C_OLD'] },
      { ...empty, subtask_ids: ['C_NEW'] },
      new Set(['subtask_ids'])
    );

    const cNewUpd = state.updateCalls.find((c) => c.id === 'C_NEW')!;
    expect(cNewUpd.updates.parent_task).toBe('P');
    const cOldUpd = state.updateCalls.find((c) => c.id === 'C_OLD')!;
    expect(cOldUpd.updates.parent_task).toBe(''); // cleared
  });

  it('subtask removed: skips clear when child reparented elsewhere', async () => {
    // C_OLD was once parented to P but has since been moved to OTHER
    state.tasks.set('C_OLD', { dart_id: 'C_OLD', parent_task: 'OTHER' });
    const client = makeMockClient(state);

    await applyDiffMirror(
      client,
      'P',
      { ...empty, subtask_ids: ['C_OLD'] },
      { ...empty, subtask_ids: [] },
      new Set(['subtask_ids'])
    );

    // Should NOT have stomped on the re-parented child
    expect(state.updateCalls).toEqual([]);
  });

  it('blocker added/removed mirrors blocking_ids on the inverse', async () => {
    state.tasks.set('B_NEW', { dart_id: 'B_NEW', blocking_ids: [] });
    state.tasks.set('B_OLD', { dart_id: 'B_OLD', blocking_ids: ['T'] });
    const client = makeMockClient(state);

    await applyDiffMirror(
      client,
      'T',
      { ...empty, blocker_ids: ['B_OLD'] },
      { ...empty, blocker_ids: ['B_NEW'] },
      new Set(['blocker_ids'])
    );

    const newSide = state.updateCalls.find((c) => c.id === 'B_NEW')!;
    expect(newSide.updates.blocking_ids).toEqual(['T']);
    const oldSide = state.updateCalls.find((c) => c.id === 'B_OLD')!;
    expect(oldSide.updates.blocking_ids).toEqual([]);
  });

  it('related diff mirrors both add and remove on related_ids', async () => {
    state.tasks.set('R_NEW', { dart_id: 'R_NEW', related_ids: [] });
    state.tasks.set('R_OLD', { dart_id: 'R_OLD', related_ids: ['T'] });
    const client = makeMockClient(state);

    await applyDiffMirror(
      client,
      'T',
      { ...empty, related_ids: ['R_OLD'] },
      { ...empty, related_ids: ['R_NEW'] },
      new Set(['related_ids'])
    );

    expect(state.updateCalls.find((c) => c.id === 'R_NEW')!.updates.related_ids).toEqual(['T']);
    expect(state.updateCalls.find((c) => c.id === 'R_OLD')!.updates.related_ids).toEqual([]);
  });

  it('no-op when before equals after', async () => {
    state.tasks.set('B', { dart_id: 'B', blocking_ids: ['T'] });
    const client = makeMockClient(state);

    const result = await applyDiffMirror(
      client,
      'T',
      { ...empty, blocker_ids: ['B'] },
      { ...empty, blocker_ids: ['B'] },
      new Set(['blocker_ids'])
    );
    expect(state.updateCalls).toEqual([]);
    expect(result).toEqual({ mirrored: [], warnings: [] });
  });
});
