/**
 * link_tasks handler tests — verifies input validation and that each
 * relationship verb routes to the correct update_task payload.
 *
 * Mocks `handleUpdateTask` so we test the verb→payload translation and
 * input validation without exercising the full update pipeline.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./update_task.js', () => ({
  handleUpdateTask: vi.fn(),
}));

import { handleUpdateTask } from './update_task.js';
import { handleLinkTasks, LINK_TYPES } from './link_tasks.js';
import { ValidationError } from '../types/index.js';

const baseUpdateResponse = {
  dart_id: 'X',
  updated_fields: ['blocking_ids'],
  task: { dart_id: 'X', title: 'Anchor', created_at: '', updated_at: '' },
  url: 'https://app.dartai.com/task/X',
  mirror_applied: ['T1', 'T2'],
  mirror_warnings: [],
};

describe('handleLinkTasks - input validation', () => {
  beforeEach(() => {
    vi.mocked(handleUpdateTask).mockReset();
    vi.mocked(handleUpdateTask).mockResolvedValue(baseUpdateResponse as any);
  });

  it('rejects missing from', async () => {
    await expect(
      handleLinkTasks({ type: 'blocks', from: '', to: ['A'] } as any)
    ).rejects.toThrow(ValidationError);
  });

  it('rejects invalid type', async () => {
    await expect(
      handleLinkTasks({ type: 'nope' as any, from: 'X', to: ['A'] } as any)
    ).rejects.toThrow(/must be one of/);
  });

  it('rejects empty `to` array', async () => {
    await expect(
      handleLinkTasks({ type: 'blocks', from: 'X', to: [] })
    ).rejects.toThrow(/non-empty array/);
  });

  it('rejects non-string entries in `to`', async () => {
    await expect(
      handleLinkTasks({ type: 'blocks', from: 'X', to: [null as any] })
    ).rejects.toThrow(ValidationError);
  });

  it('rejects multi-target `parent` (must be exactly 1)', async () => {
    await expect(
      handleLinkTasks({ type: 'parent', from: 'X', to: ['P1', 'P2'] })
    ).rejects.toThrow(/exactly one target/);
  });

  it('LINK_TYPES covers all expected verbs', () => {
    expect(new Set(LINK_TYPES)).toEqual(
      new Set(['parent', 'subtasks', 'blocks', 'blocked_by', 'duplicates', 'related'])
    );
  });
});

describe('handleLinkTasks - verb routing', () => {
  beforeEach(() => {
    vi.mocked(handleUpdateTask).mockReset();
    vi.mocked(handleUpdateTask).mockResolvedValue(baseUpdateResponse as any);
  });

  it('parent → update_task with parent_task scalar', async () => {
    await handleLinkTasks({ type: 'parent', from: 'X', to: ['P'] });
    expect(handleUpdateTask).toHaveBeenCalledWith({
      dart_id: 'X',
      parent_task: 'P',
    });
  });

  it('subtasks → add_to.subtask_ids on anchor', async () => {
    await handleLinkTasks({ type: 'subtasks', from: 'P', to: ['A', 'B'] });
    expect(handleUpdateTask).toHaveBeenCalledWith({
      dart_id: 'P',
      add_to: { subtask_ids: ['A', 'B'] },
    });
  });

  it('blocks → add_to.blocking_ids on anchor', async () => {
    await handleLinkTasks({ type: 'blocks', from: 'X', to: ['A', 'B'] });
    expect(handleUpdateTask).toHaveBeenCalledWith({
      dart_id: 'X',
      add_to: { blocking_ids: ['A', 'B'] },
    });
  });

  it('blocked_by → add_to.blocker_ids on anchor', async () => {
    await handleLinkTasks({ type: 'blocked_by', from: 'X', to: ['A'] });
    expect(handleUpdateTask).toHaveBeenCalledWith({
      dart_id: 'X',
      add_to: { blocker_ids: ['A'] },
    });
  });

  it('duplicates → add_to.duplicate_ids', async () => {
    await handleLinkTasks({ type: 'duplicates', from: 'X', to: ['D'] });
    expect(handleUpdateTask).toHaveBeenCalledWith({
      dart_id: 'X',
      add_to: { duplicate_ids: ['D'] },
    });
  });

  it('related → add_to.related_ids', async () => {
    await handleLinkTasks({ type: 'related', from: 'X', to: ['R'] });
    expect(handleUpdateTask).toHaveBeenCalledWith({
      dart_id: 'X',
      add_to: { related_ids: ['R'] },
    });
  });

  it('passes through mirror_applied + mirror_warnings from update_task', async () => {
    vi.mocked(handleUpdateTask).mockResolvedValue({
      ...baseUpdateResponse,
      mirror_applied: ['T1'],
      mirror_warnings: ['failed to patch T2'],
    } as any);

    const result = await handleLinkTasks({
      type: 'blocks',
      from: 'X',
      to: ['T1', 'T2'],
    });

    expect(result.mirror_applied).toEqual(['T1']);
    expect(result.mirror_warnings).toEqual(['failed to patch T2']);
    expect(result.from).toBe('X');
    expect(result.type).toBe('blocks');
    expect(result.to).toEqual(['T1', 'T2']);
    expect(result.url).toBe('https://app.dartai.com/task/X');
  });

  it('defaults mirror fields to [] when update_task omits them', async () => {
    vi.mocked(handleUpdateTask).mockResolvedValue({
      dart_id: 'X',
      updated_fields: [],
      task: { dart_id: 'X', title: '', created_at: '', updated_at: '' },
      url: 'u',
    } as any);

    const result = await handleLinkTasks({ type: 'related', from: 'X', to: ['R'] });
    expect(result.mirror_applied).toEqual([]);
    expect(result.mirror_warnings).toEqual([]);
  });
});
