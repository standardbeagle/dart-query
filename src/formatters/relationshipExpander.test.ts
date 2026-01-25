/**
 * Tests for Relationship Expander
 */

import { describe, it, expect, vi } from 'vitest';
import {
  collectIdsToExpand,
  expandRelationships,
  formatExpandedRelationship,
  formatExpandedAsNested,
  getTotalRelationshipCount,
  hasRelationships,
} from './relationshipExpander.js';
import { DartTask } from '../types/index.js';

// ============================================================================
// Test Data
// ============================================================================

const taskWithRelationships: DartTask = {
  dart_id: 'duid_main',
  title: 'Main task',
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
  subtask_ids: ['duid_sub1', 'duid_sub2'],
  blocker_ids: ['duid_block1'],
  blocking_ids: ['duid_blocking1', 'duid_blocking2'],
  duplicate_ids: [],
  related_ids: ['duid_rel1'],
};

const taskNoRelationships: DartTask = {
  dart_id: 'duid_simple',
  title: 'Simple task',
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};

const relatedTaskMap = new Map<string, DartTask>([
  ['duid_sub1', { dart_id: 'duid_sub1', title: 'Subtask 1', created_at: '', updated_at: '' }],
  ['duid_sub2', { dart_id: 'duid_sub2', title: 'Subtask 2', created_at: '', updated_at: '' }],
  ['duid_block1', { dart_id: 'duid_block1', title: 'Blocker task', created_at: '', updated_at: '' }],
  ['duid_blocking1', { dart_id: 'duid_blocking1', title: 'Blocked task 1', created_at: '', updated_at: '' }],
  ['duid_blocking2', { dart_id: 'duid_blocking2', title: 'Blocked task 2', created_at: '', updated_at: '' }],
  ['duid_rel1', { dart_id: 'duid_rel1', title: 'Related task', created_at: '', updated_at: '' }],
]);

// ============================================================================
// collectIdsToExpand Tests
// ============================================================================

describe('collectIdsToExpand', () => {
  it('should collect subtask IDs', () => {
    const ids = collectIdsToExpand([taskWithRelationships], ['subtasks']);
    expect(ids.has('duid_sub1')).toBe(true);
    expect(ids.has('duid_sub2')).toBe(true);
    expect(ids.size).toBe(2);
  });

  it('should collect blocker IDs', () => {
    const ids = collectIdsToExpand([taskWithRelationships], ['blockers']);
    expect(ids.has('duid_block1')).toBe(true);
    expect(ids.size).toBe(1);
  });

  it('should collect multiple relationship types', () => {
    const ids = collectIdsToExpand([taskWithRelationships], ['subtasks', 'blockers', 'blocking']);
    expect(ids.has('duid_sub1')).toBe(true);
    expect(ids.has('duid_block1')).toBe(true);
    expect(ids.has('duid_blocking1')).toBe(true);
    expect(ids.size).toBe(5);
  });

  it('should handle empty relationship arrays', () => {
    const ids = collectIdsToExpand([taskWithRelationships], ['duplicates']);
    expect(ids.size).toBe(0);
  });

  it('should handle tasks without relationships', () => {
    const ids = collectIdsToExpand([taskNoRelationships], ['subtasks', 'blockers']);
    expect(ids.size).toBe(0);
  });

  it('should deduplicate IDs across multiple tasks', () => {
    const task2: DartTask = {
      dart_id: 'duid_other',
      title: 'Other task',
      created_at: '',
      updated_at: '',
      blocker_ids: ['duid_block1', 'duid_sub1'], // duid_block1 also in first task
    };
    const ids = collectIdsToExpand([taskWithRelationships, task2], ['blockers', 'subtasks']);
    // duid_block1 should only appear once
    expect(ids.size).toBe(3); // sub1, sub2, block1
  });
});

// ============================================================================
// expandRelationships Tests
// ============================================================================

describe('expandRelationships', () => {
  it('should expand subtasks', async () => {
    const mockFetchTask = vi.fn();
    const mockFetchTasks = vi.fn().mockResolvedValue(relatedTaskMap);

    const result = await expandRelationships([taskWithRelationships], {
      expand: ['subtasks'],
      fetchTask: mockFetchTask,
      fetchTasks: mockFetchTasks,
    });

    expect(result).toHaveLength(1);
    expect(result[0]._subtasks).toHaveLength(2);
    expect(result[0]._subtasks![0].title).toBe('Subtask 1');
    expect(result[0]._subtasks![1].title).toBe('Subtask 2');
  });

  it('should expand multiple relationship types', async () => {
    const mockFetchTasks = vi.fn().mockResolvedValue(relatedTaskMap);

    const result = await expandRelationships([taskWithRelationships], {
      expand: ['subtasks', 'blockers', 'blocking'],
      fetchTask: vi.fn(),
      fetchTasks: mockFetchTasks,
    });

    expect(result[0]._subtasks).toHaveLength(2);
    expect(result[0]._blockers).toHaveLength(1);
    expect(result[0]._blocking).toHaveLength(2);
  });

  it('should return tasks unchanged when no expansion needed', async () => {
    const mockFetchTask = vi.fn();

    const result = await expandRelationships([taskWithRelationships], {
      expand: [],
      fetchTask: mockFetchTask,
    });

    expect(mockFetchTask).not.toHaveBeenCalled();
    expect(result[0]._subtasks).toBeUndefined();
  });

  it('should handle not found tasks', async () => {
    const partialMap = new Map<string, DartTask>([
      ['duid_sub1', { dart_id: 'duid_sub1', title: 'Subtask 1', created_at: '', updated_at: '' }],
      // duid_sub2 is missing
    ]);
    const mockFetchTasks = vi.fn().mockResolvedValue(partialMap);

    const result = await expandRelationships([taskWithRelationships], {
      expand: ['subtasks'],
      fetchTask: vi.fn(),
      fetchTasks: mockFetchTasks,
    });

    expect(result[0]._subtasks![0].title).toBe('Subtask 1');
    expect(result[0]._subtasks![1].title).toBe('(not found)');
  });

  it('should fall back to individual fetches when batch not available', async () => {
    const mockFetchTask = vi.fn().mockImplementation(async (id: string) => {
      return relatedTaskMap.get(id) || null;
    });

    const result = await expandRelationships([taskWithRelationships], {
      expand: ['subtasks'],
      fetchTask: mockFetchTask,
    });

    expect(mockFetchTask).toHaveBeenCalledTimes(2);
    expect(result[0]._subtasks).toHaveLength(2);
  });
});

// ============================================================================
// formatExpandedRelationship Tests
// ============================================================================

describe('formatExpandedRelationship', () => {
  const summaries = [
    { dart_id: 'duid_abc123', title: 'First task' },
    { dart_id: 'duid_def456', title: 'Second task' },
    { dart_id: 'duid_ghi789', title: 'Third task' },
    { dart_id: 'duid_jkl012', title: 'Fourth task' },
  ];

  it('should format summaries as compact string', () => {
    const result = formatExpandedRelationship(summaries.slice(0, 2));
    expect(result).toContain('123');
    expect(result).toContain('First task');
    expect(result).toContain(',');
  });

  it('should truncate to maxItems with count', () => {
    const result = formatExpandedRelationship(summaries, 2);
    expect(result).toContain('(+2)');
  });

  it('should handle empty/undefined', () => {
    expect(formatExpandedRelationship(undefined)).toBe('-');
    expect(formatExpandedRelationship([])).toBe('-');
  });

  it('should truncate long titles', () => {
    const longTitleSummaries = [
      { dart_id: 'duid_x', title: 'This is a very long task title that should be truncated' },
    ];
    const result = formatExpandedRelationship(longTitleSummaries, 3, 10);
    expect(result).toContain('..');
    expect(result.length).toBeLessThan(50);
  });
});

// ============================================================================
// formatExpandedAsNested Tests
// ============================================================================

describe('formatExpandedAsNested', () => {
  const summaries = [
    { dart_id: 'duid_abc123', title: 'First task' },
    { dart_id: 'duid_def456', title: 'Second task' },
  ];

  it('should format as indented list', () => {
    const lines = formatExpandedAsNested(summaries);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('└─');
    expect(lines[0]).toContain('First task');
  });

  it('should respect custom indent', () => {
    const lines = formatExpandedAsNested(summaries, '    ');
    expect(lines[0]).toMatch(/^    └─/);
  });

  it('should truncate with ellipsis', () => {
    const manySummaries = Array.from({ length: 10 }, (_, i) => ({
      dart_id: `duid_${i}`,
      title: `Task ${i}`,
    }));
    const lines = formatExpandedAsNested(manySummaries, '  ', 3);
    expect(lines).toHaveLength(4); // 3 items + "and X more"
    expect(lines[3]).toContain('7 more');
  });

  it('should handle empty/undefined', () => {
    expect(formatExpandedAsNested(undefined)).toEqual([]);
    expect(formatExpandedAsNested([])).toEqual([]);
  });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe('getTotalRelationshipCount', () => {
  it('should count all relationships', () => {
    const count = getTotalRelationshipCount(taskWithRelationships);
    // 2 subtasks + 1 blocker + 2 blocking + 0 dups + 1 related = 6
    expect(count).toBe(6);
  });

  it('should return 0 for task without relationships', () => {
    const count = getTotalRelationshipCount(taskNoRelationships);
    expect(count).toBe(0);
  });
});

describe('hasRelationships', () => {
  it('should return true for task with relationships', () => {
    expect(hasRelationships(taskWithRelationships)).toBe(true);
  });

  it('should return false for task without relationships', () => {
    expect(hasRelationships(taskNoRelationships)).toBe(false);
  });

  it('should return false for task with empty arrays', () => {
    const taskEmptyArrays: DartTask = {
      dart_id: 'x',
      title: 'test',
      created_at: '',
      updated_at: '',
      subtask_ids: [],
      blocker_ids: [],
      blocking_ids: [],
    };
    expect(hasRelationships(taskEmptyArrays)).toBe(false);
  });
});
