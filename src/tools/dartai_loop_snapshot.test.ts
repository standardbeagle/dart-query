import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api/dartClient.js', () => ({
  DartClient: vi.fn().mockImplementation(() => ({
    listTasks: vi.fn().mockResolvedValue({
      tasks: [
        { dart_id: 'a', title: 'T1', status: 'Todo', dartboard: 'db1', tags: [], assignees: [] },
        { dart_id: 'b', title: 'T2', status: 'Todo', dartboard: 'db1', tags: ['loop-blocked'], assignees: [] },
        { dart_id: 'c', title: 'T3', status: 'In Progress', dartboard: 'db1', tags: ['claimed:r1'], assignees: ['r1'] },
      ],
      total: 3,
    }),
  })),
}));

vi.mock('../cache/configCache.js', () => ({
  configCache: {
    get: vi.fn().mockReturnValue({
      dartboards: [{ dart_id: 'db1', name: 'Personal/agnt' }],
      statuses: [{ name: 'Todo' }, { name: 'In Progress' }, { name: 'Done' }],
      assignees: [{ dart_id: 'r1', name: 'Andy', email: 'andy@x.com' }],
    }),
  },
}));

import { handleDartaiLoopSnapshot } from './dartai_loop_snapshot.js';
import type { LoopSnapshotInput } from '../types/index.js';

describe('dartai_loop_snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns dartboard_id, config, queue, runner_claimed, and blocked in single call', async () => {
    const input: LoopSnapshotInput = { dartboard: 'Personal/agnt', runner_dart_id: 'r1', queue_limit: 20 };
    const result = await handleDartaiLoopSnapshot(input);
    expect(result.dartboard_id).toBe('db1');
    expect(result.config.statuses).toContain('Todo');
    expect(result.config.assignees).toEqual([{ dart_id: 'r1', email: 'andy@x.com' }]);
    expect(result.queue.map((t) => t.dart_id)).toEqual(['a']);
    expect(result.runner_claimed.map((t) => t.dart_id)).toEqual(['c']);
    expect(result.blocked.map((t) => t.dart_id)).toEqual(['b']);
    expect(result.fetched_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('throws if dartboard cannot be resolved', async () => {
    const input: LoopSnapshotInput = { dartboard: 'nonexistent', queue_limit: 20 };
    await expect(handleDartaiLoopSnapshot(input)).rejects.toThrow(/dartboard.*not found/i);
  });

  it('omits runner_claimed when runner_dart_id not provided', async () => {
    const input: LoopSnapshotInput = { dartboard: 'Personal/agnt', queue_limit: 20 };
    const result = await handleDartaiLoopSnapshot(input);
    expect(result.runner_claimed).toEqual([]);
  });

  it('truncates queue to queue_limit after partition', async () => {
    const { DartClient } = await import('../api/dartClient.js');
    const MockedDartClient = DartClient as unknown as ReturnType<typeof vi.fn>;
    MockedDartClient.mockImplementationOnce(() => ({
      listTasks: vi.fn().mockResolvedValue({
        tasks: [
          { dart_id: 'q1', title: 'Q1', status: 'Todo', dartboard: 'db1', tags: [], assignees: [] },
          { dart_id: 'q2', title: 'Q2', status: 'Todo', dartboard: 'db1', tags: [], assignees: [] },
          { dart_id: 'q3', title: 'Q3', status: 'Todo', dartboard: 'db1', tags: [], assignees: [] },
          { dart_id: 'q4', title: 'Q4', status: 'Todo', dartboard: 'db1', tags: [], assignees: [] },
          { dart_id: 'q5', title: 'Q5', status: 'Todo', dartboard: 'db1', tags: [], assignees: [] },
        ],
        total: 5,
      }),
    }));

    const input: LoopSnapshotInput = { dartboard: 'Personal/agnt', queue_limit: 2 };
    const result = await handleDartaiLoopSnapshot(input);
    expect(result.queue.length).toBe(2);
    expect(result.queue.map((t) => t.dart_id)).toEqual(['q1', 'q2']);
  });
});
