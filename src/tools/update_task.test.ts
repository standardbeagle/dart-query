import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleUpdateTask } from './update_task.js';
import { DartClient } from '../api/dartClient.js';
import { configCache } from '../cache/configCache.js';
import type { DartConfig, DartTask } from '../types/index.js';

vi.mock('../api/dartClient.js');
vi.mock('../cache/configCache.js');

function makeConfig(overrides: Partial<DartConfig> = {}): DartConfig {
  return {
    assignees: [{ name: 'Alice', email: 'alice@example.com' }],
    dartboards: [{ dart_id: 'db1', name: 'Main Board' }],
    statuses: [{ dart_id: 'st1', name: 'Todo' }, { dart_id: 'st2', name: 'Done' }],
    tags: [{ dart_id: 'tg1', name: 'urgent' }],
    priorities: [
      { value: 1, label: 'Lowest' },
      { value: 3, label: 'Medium' },
      { value: 5, label: 'Highest' },
    ],
    sizes: [
      { value: 1, label: 'XS' },
      { value: 3, label: 'M' },
    ],
    folders: [],
    ...overrides,
  };
}

function makeTask(overrides: Partial<DartTask> = {}): DartTask {
  return {
    dart_id: 'duid_test123',
    title: 'Test Task',
    status: 'Todo',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
    blocker_ids: ['duid_blocker1'],
    blocking_ids: [],
    subtask_ids: ['duid_sub1', 'duid_sub2'],
    duplicate_ids: [],
    related_ids: ['duid_rel1'],
    ...overrides,
  };
}

function setupMocks(config: DartConfig, returnTask: DartTask) {
  vi.clearAllMocks();
  process.env.DART_TOKEN = 'dsa_test_token';
  vi.mocked(configCache.get).mockReturnValue(null);
  vi.mocked(DartClient).mockImplementation(() => ({
    getConfig: vi.fn().mockResolvedValue(config),
    updateTask: vi.fn().mockResolvedValue(returnTask),
    addComment: vi.fn().mockResolvedValue({
      comment_id: 'comment_123',
      dart_id: returnTask.dart_id,
      text: 'test comment',
      author: { dart_id: 'user1', name: 'Alice' },
      created_at: '2026-01-15T12:00:00Z',
    }),
    getTask: vi.fn().mockResolvedValue(returnTask),
  } as any));
}

// =============================================================================
// Feature 1: comment parameter on update_task
// =============================================================================

describe('update_task - comment parameter', () => {
  const config = makeConfig();
  const task = makeTask({ status: 'Done' });

  beforeEach(() => setupMocks(config, task));

  it('should accept comment and include it in output', async () => {
    const result = await handleUpdateTask({
      dart_id: 'duid_test123',
      status: 'Done',
      comment: 'Completed the work',
    } as any);

    expect(result.dart_id).toBe('duid_test123');
    expect(result.comment_added).toBe(true);
  });

  it('should call addComment on DartClient when comment provided', async () => {
    await handleUpdateTask({
      dart_id: 'duid_test123',
      status: 'Done',
      comment: 'Status change note',
    } as any);

    // The handler creates DartClient twice: once for getConfig (via handleGetConfig), once for the update
    const instances = vi.mocked(DartClient).mock.results;
    const handlerClient = instances[instances.length - 1].value;
    expect(handlerClient.addComment).toHaveBeenCalledWith('duid_test123', 'Status change note');
  });

  it('should not call addComment when comment is not provided', async () => {
    await handleUpdateTask({
      dart_id: 'duid_test123',
      status: 'Done',
    });

    const instances = vi.mocked(DartClient).mock.results;
    const handlerClient = instances[instances.length - 1].value;
    expect(handlerClient.addComment).not.toHaveBeenCalled();
  });

  it('should still succeed if addComment fails (non-blocking)', async () => {
    vi.mocked(DartClient).mockImplementation(() => ({
      getConfig: vi.fn().mockResolvedValue(config),
      updateTask: vi.fn().mockResolvedValue(task),
      addComment: vi.fn().mockRejectedValue(new Error('Comment API failed')),
    } as any));

    const result = await handleUpdateTask({
      dart_id: 'duid_test123',
      status: 'Done',
      comment: 'This will fail but update should succeed',
    } as any);

    expect(result.dart_id).toBe('duid_test123');
    expect(result.comment_added).toBe(false);
  });

  it('should reject empty string comment', async () => {
    await expect(handleUpdateTask({
      dart_id: 'duid_test123',
      status: 'Done',
      comment: '   ',
    } as any)).rejects.toThrow(/comment.*non-empty/i);
  });

  it('should not count comment as an updated field', async () => {
    const result = await handleUpdateTask({
      dart_id: 'duid_test123',
      status: 'Done',
      comment: 'A note',
    } as any);

    expect(result.updated_fields).not.toContain('comment');
    expect(result.updated_fields).toContain('status');
  });
});

// =============================================================================
// Feature 2: add_to / remove_from relationship operations
// =============================================================================

describe('update_task - add_to relationship merging', () => {
  const config = makeConfig();
  const task = makeTask();

  beforeEach(() => setupMocks(config, task));

  it('should merge add_to.blocker_ids with existing blockers', async () => {
    const result = await handleUpdateTask({
      dart_id: 'duid_test123',
      add_to: { blocker_ids: ['duid_blocker2'] },
    } as any);

    // Should have fetched current task then sent merged array
    const instances = vi.mocked(DartClient).mock.results;
    const clientInstance = instances[instances.length - 1].value;
    expect(clientInstance.getTask).toHaveBeenCalledWith('duid_test123');
    expect(clientInstance.updateTask).toHaveBeenCalledWith('duid_test123', expect.objectContaining({
      blocker_ids: ['duid_blocker1', 'duid_blocker2'],
    }));
  });

  it('should merge add_to.subtask_ids with existing subtasks', async () => {
    await handleUpdateTask({
      dart_id: 'duid_test123',
      add_to: { subtask_ids: ['duid_sub3'] },
    } as any);

    const instances = vi.mocked(DartClient).mock.results;
    const clientInstance = instances[instances.length - 1].value;
    expect(clientInstance.updateTask).toHaveBeenCalledWith('duid_test123', expect.objectContaining({
      subtask_ids: ['duid_sub1', 'duid_sub2', 'duid_sub3'],
    }));
  });

  it('should not add duplicates when add_to contains existing IDs', async () => {
    await handleUpdateTask({
      dart_id: 'duid_test123',
      add_to: { blocker_ids: ['duid_blocker1', 'duid_blocker2'] },
    } as any);

    const instances = vi.mocked(DartClient).mock.results;
    const clientInstance = instances[instances.length - 1].value;
    expect(clientInstance.updateTask).toHaveBeenCalledWith('duid_test123', expect.objectContaining({
      blocker_ids: ['duid_blocker1', 'duid_blocker2'],
    }));
  });

  it('should support multiple relationship types in one add_to', async () => {
    await handleUpdateTask({
      dart_id: 'duid_test123',
      add_to: {
        blocker_ids: ['duid_blocker2'],
        related_ids: ['duid_rel2'],
      },
    } as any);

    const instances = vi.mocked(DartClient).mock.results;
    const clientInstance = instances[instances.length - 1].value;
    expect(clientInstance.updateTask).toHaveBeenCalledWith('duid_test123', expect.objectContaining({
      blocker_ids: ['duid_blocker1', 'duid_blocker2'],
      related_ids: ['duid_rel1', 'duid_rel2'],
    }));
  });

  it('should validate add_to values are string arrays', async () => {
    await expect(handleUpdateTask({
      dart_id: 'duid_test123',
      add_to: { blocker_ids: 'not-an-array' },
    } as any)).rejects.toThrow(/array/i);
  });

  it('should reject add_to with non-relationship fields', async () => {
    await expect(handleUpdateTask({
      dart_id: 'duid_test123',
      add_to: { title: ['something'] },
    } as any)).rejects.toThrow(/relationship/i);
  });
});

describe('update_task - remove_from relationship merging', () => {
  const config = makeConfig();
  const task = makeTask();

  beforeEach(() => setupMocks(config, task));

  it('should remove specified IDs from existing blockers', async () => {
    await handleUpdateTask({
      dart_id: 'duid_test123',
      remove_from: { blocker_ids: ['duid_blocker1'] },
    } as any);

    const instances = vi.mocked(DartClient).mock.results;
    const clientInstance = instances[instances.length - 1].value;
    expect(clientInstance.updateTask).toHaveBeenCalledWith('duid_test123', expect.objectContaining({
      blocker_ids: [],
    }));
  });

  it('should remove one subtask while keeping others', async () => {
    await handleUpdateTask({
      dart_id: 'duid_test123',
      remove_from: { subtask_ids: ['duid_sub1'] },
    } as any);

    const instances = vi.mocked(DartClient).mock.results;
    const clientInstance = instances[instances.length - 1].value;
    expect(clientInstance.updateTask).toHaveBeenCalledWith('duid_test123', expect.objectContaining({
      subtask_ids: ['duid_sub2'],
    }));
  });

  it('should handle removing IDs that do not exist (no-op)', async () => {
    await handleUpdateTask({
      dart_id: 'duid_test123',
      remove_from: { blocker_ids: ['duid_nonexistent'] },
    } as any);

    const instances = vi.mocked(DartClient).mock.results;
    const clientInstance = instances[instances.length - 1].value;
    // Original blocker_ids unchanged since the removed ID wasn't there
    expect(clientInstance.updateTask).toHaveBeenCalledWith('duid_test123', expect.objectContaining({
      blocker_ids: ['duid_blocker1'],
    }));
  });

  it('should support combined add_to and remove_from', async () => {
    await handleUpdateTask({
      dart_id: 'duid_test123',
      add_to: { blocker_ids: ['duid_blocker2'] },
      remove_from: { subtask_ids: ['duid_sub1'] },
    } as any);

    const instances = vi.mocked(DartClient).mock.results;
    const clientInstance = instances[instances.length - 1].value;
    expect(clientInstance.updateTask).toHaveBeenCalledWith('duid_test123', expect.objectContaining({
      blocker_ids: ['duid_blocker1', 'duid_blocker2'],
      subtask_ids: ['duid_sub2'],
    }));
  });

  it('should reject using add_to/remove_from with direct relationship fields', async () => {
    await expect(handleUpdateTask({
      dart_id: 'duid_test123',
      blocker_ids: ['duid_direct'],
      add_to: { blocker_ids: ['duid_add'] },
    } as any)).rejects.toThrow(/cannot.*both/i);
  });

  it('should combine add_to and remove_from with other field updates', async () => {
    const updatedTask = makeTask({ status: 'Done' });
    setupMocks(config, updatedTask);

    const result = await handleUpdateTask({
      dart_id: 'duid_test123',
      status: 'Done',
      add_to: { blocker_ids: ['duid_blocker2'] },
      comment: 'Updated status and blockers',
    } as any);

    expect(result.updated_fields).toContain('status');
    expect(result.updated_fields).toContain('blocker_ids');
    expect(result.comment_added).toBe(true);
  });
});
