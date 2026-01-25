/**
 * Tests for Table Formatter
 */

import { describe, it, expect } from 'vitest';
import {
  abbreviateId,
  truncate,
  formatPriority,
  formatAssignee,
  formatDate,
  formatTags,
  formatSize,
  formatCount,
  formatTasks,
  formatAsTable,
  formatAsCompact,
  formatAsCSV,
  formatAsIds,
  parseFieldList,
  ESSENTIAL_FIELDS,
  getRelationshipCounts,
} from './tableFormatter.js';
import { DartTask } from '../types/index.js';

// ============================================================================
// Test Data
// ============================================================================

const sampleTask: DartTask = {
  dart_id: 'duid_abc123def456',
  title: 'Fix authentication bug in login flow',
  status: 'Todo',
  priority: 'high',
  assignees: ['john.doe@example.com', 'jane@example.com'],
  dartboard: 'Engineering',
  tags: ['bug', 'security', 'urgent', 'p0'],
  due_at: '2026-02-01T10:00:00Z',
  created_at: '2026-01-15T08:30:00Z',
  updated_at: '2026-01-20T14:45:00Z',
  subtask_ids: ['duid_sub1', 'duid_sub2', 'duid_sub3'],
  blocker_ids: ['duid_block1'],
  blocking_ids: [],
  duplicate_ids: [],
  related_ids: ['duid_rel1', 'duid_rel2'],
};

const sampleTasks: DartTask[] = [
  sampleTask,
  {
    dart_id: 'duid_xyz789',
    title: 'Add dark mode',
    status: 'Doing',
    priority: 'medium',
    assignees: ['jane@example.com'],
    dartboard: 'Frontend',
    tags: ['feature'],
    due_at: '2026-02-15T00:00:00Z',
    created_at: '2026-01-10T00:00:00Z',
    updated_at: '2026-01-18T00:00:00Z',
  },
  {
    dart_id: 'duid_short',
    title: 'Quick fix',
    status: 'Done',
    priority: 'low',
    assignees: [],
    created_at: '2026-01-05T00:00:00Z',
    updated_at: '2026-01-06T00:00:00Z',
  },
];

// ============================================================================
// Helper Function Tests
// ============================================================================

describe('abbreviateId', () => {
  it('should abbreviate long IDs', () => {
    expect(abbreviateId('duid_abc123def456')).toBe('..def456');
  });

  it('should preserve short IDs', () => {
    expect(abbreviateId('duid_xy')).toBe('duid_xy');
  });

  it('should handle empty/null', () => {
    expect(abbreviateId('')).toBe('-');
  });
});

describe('truncate', () => {
  it('should truncate long strings with ellipsis', () => {
    expect(truncate('This is a very long string', 15)).toBe('This is a ve...');
  });

  it('should preserve short strings', () => {
    expect(truncate('Short', 15)).toBe('Short');
  });

  it('should handle exact length', () => {
    expect(truncate('Exactly', 7)).toBe('Exactly');
  });

  it('should handle empty/null', () => {
    expect(truncate('', 10)).toBe('-');
  });
});

describe('formatPriority', () => {
  it('should format text priorities', () => {
    expect(formatPriority('critical')).toBe('C');
    expect(formatPriority('high')).toBe('H');
    expect(formatPriority('medium')).toBe('M');
    expect(formatPriority('low')).toBe('L');
  });

  it('should format numeric priorities', () => {
    expect(formatPriority('5')).toBe('C');
    expect(formatPriority('4')).toBe('H');
    expect(formatPriority('3')).toBe('M');
    expect(formatPriority('2')).toBe('L');
    expect(formatPriority('1')).toBe('-');
  });

  it('should handle null/undefined', () => {
    expect(formatPriority(null)).toBe('-');
    expect(formatPriority(undefined)).toBe('-');
  });

  it('should be case-insensitive', () => {
    expect(formatPriority('HIGH')).toBe('H');
    expect(formatPriority('Critical')).toBe('C');
  });
});

describe('formatAssignee', () => {
  it('should format email to username', () => {
    expect(formatAssignee(['john.doe@example.com'])).toBe('john.doe');
  });

  it('should format name to first name', () => {
    expect(formatAssignee(['John Doe'])).toBe('John');
  });

  it('should take first assignee from array', () => {
    expect(formatAssignee(['first@example.com', 'second@example.com'])).toBe('first');
  });

  it('should handle empty array', () => {
    expect(formatAssignee([])).toBe('-');
  });

  it('should handle null/undefined', () => {
    expect(formatAssignee(null)).toBe('-');
    expect(formatAssignee(undefined)).toBe('-');
  });
});

describe('formatDate', () => {
  it('should extract date from ISO string', () => {
    expect(formatDate('2026-02-01T10:00:00Z')).toBe('2026-02-01');
  });

  it('should preserve short date format', () => {
    expect(formatDate('2026-02-01')).toBe('2026-02-01');
  });

  it('should handle null/undefined', () => {
    expect(formatDate(null)).toBe('-');
    expect(formatDate(undefined)).toBe('-');
  });
});

describe('formatTags', () => {
  it('should format tag array', () => {
    expect(formatTags(['bug', 'urgent'])).toBe('bug,urgent');
  });

  it('should truncate with ellipsis after 3 tags', () => {
    expect(formatTags(['a', 'b', 'c', 'd', 'e'])).toBe('a,b,c...');
  });

  it('should handle empty array', () => {
    expect(formatTags([])).toBe('-');
  });

  it('should handle null/undefined', () => {
    expect(formatTags(null)).toBe('-');
  });
});

describe('formatSize', () => {
  it('should format text sizes', () => {
    expect(formatSize('xs')).toBe('XS');
    expect(formatSize('small')).toBe('S');
    expect(formatSize('medium')).toBe('M');
    expect(formatSize('large')).toBe('L');
    expect(formatSize('xl')).toBe('XL');
  });

  it('should format numeric sizes', () => {
    expect(formatSize('1')).toBe('XS');
    expect(formatSize('2')).toBe('S');
    expect(formatSize('3')).toBe('M');
    expect(formatSize('4')).toBe('L');
    expect(formatSize('5')).toBe('XL');
  });

  it('should handle null/undefined', () => {
    expect(formatSize(null)).toBe('-');
    expect(formatSize(undefined)).toBe('-');
  });
});

describe('formatCount', () => {
  it('should count array length', () => {
    expect(formatCount(['a', 'b', 'c'])).toBe('3');
  });

  it('should handle empty array', () => {
    expect(formatCount([])).toBe('0');
  });

  it('should handle null/undefined', () => {
    expect(formatCount(null)).toBe('0');
    expect(formatCount(undefined)).toBe('0');
  });
});

// ============================================================================
// Field Parsing Tests
// ============================================================================

describe('parseFieldList', () => {
  it('should parse valid field names', () => {
    const configs = parseFieldList(['id', 'title', 'status']);
    expect(configs).toHaveLength(3);
    expect(configs[0].key).toBe('dart_id');
    expect(configs[1].key).toBe('title');
    expect(configs[2].key).toBe('status');
  });

  it('should parse count fields with # prefix', () => {
    const configs = parseFieldList(['#subtasks', '#blockers']);
    expect(configs).toHaveLength(2);
    expect(configs[0].header).toBe('#sub');
    expect(configs[1].header).toBe('#blk');
  });

  it('should ignore unknown fields', () => {
    const configs = parseFieldList(['id', 'unknownfield', 'title']);
    expect(configs).toHaveLength(2);
  });
});

// ============================================================================
// Relationship Counts Tests
// ============================================================================

describe('getRelationshipCounts', () => {
  it('should count all relationships', () => {
    const counts = getRelationshipCounts(sampleTask);
    expect(counts.subtasks).toBe(3);
    expect(counts.blockers).toBe(1);
    expect(counts.blocking).toBe(0);
    expect(counts.duplicates).toBe(0);
    expect(counts.related).toBe(2);
  });

  it('should handle missing relationship fields', () => {
    const counts = getRelationshipCounts({ dart_id: 'x', title: 'test', created_at: '', updated_at: '' });
    expect(counts.subtasks).toBe(0);
    expect(counts.blockers).toBe(0);
  });
});

// ============================================================================
// Format Output Tests
// ============================================================================

describe('formatAsTable', () => {
  it('should format tasks as aligned table', () => {
    const result = formatAsTable(sampleTasks);

    // Check table structure
    expect(result).toContain('┌');
    expect(result).toContain('┐');
    expect(result).toContain('└');
    expect(result).toContain('┘');
    expect(result).toContain('│');

    // Check headers present
    expect(result).toContain('id');
    expect(result).toContain('title');
    expect(result).toContain('status');

    // Check data present
    expect(result).toContain('Todo');
    expect(result).toContain('Doing');
    expect(result).toContain('Done');
  });

  it('should include footer with task count', () => {
    const result = formatAsTable(sampleTasks);
    expect(result).toContain('3 tasks');
  });

  it('should handle empty task list', () => {
    const result = formatAsTable([]);
    expect(result).toBe('No results');
  });

  it('should respect custom field selection', () => {
    const result = formatAsTable(sampleTasks, { fields: ['id', 'title'] });
    expect(result).toContain('id');
    expect(result).toContain('title');
    expect(result).not.toContain('status');
  });
});

describe('formatAsCompact', () => {
  it('should format tasks as tab-separated values', () => {
    const result = formatAsCompact(sampleTasks);

    // Check tab separation
    expect(result).toContain('\t');

    // Check no table borders
    expect(result).not.toContain('┌');
    expect(result).not.toContain('│');
  });

  it('should handle empty task list', () => {
    const result = formatAsCompact([]);
    expect(result).toBe('');
  });
});

describe('formatAsCSV', () => {
  it('should format tasks as CSV', () => {
    const result = formatAsCSV(sampleTasks, { fields: ['id', 'title', 'status'] });

    const lines = result.split('\n');

    // Check header row
    expect(lines[0]).toBe('id,title,status');

    // Check data rows exist
    expect(lines.length).toBe(4); // 1 header + 3 data rows
  });

  it('should escape values with commas', () => {
    const taskWithComma: DartTask = {
      ...sampleTask,
      title: 'Fix bug, urgent',
    };
    const result = formatAsCSV([taskWithComma], { fields: ['title'] });
    expect(result).toContain('"Fix bug, urgent"');
  });

  it('should handle empty task list', () => {
    const result = formatAsCSV([], { fields: ['id', 'title'] });
    expect(result).toBe('id,title');
  });
});

describe('formatAsIds', () => {
  it('should format as newline-separated IDs', () => {
    const result = formatAsIds(sampleTasks);
    const lines = result.split('\n');

    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('duid_abc123def456');
    expect(lines[1]).toBe('duid_xyz789');
    expect(lines[2]).toBe('duid_short');
  });

  it('should handle empty task list', () => {
    const result = formatAsIds([]);
    expect(result).toBe('');
  });
});

// ============================================================================
// Main formatTasks Tests
// ============================================================================

describe('formatTasks', () => {
  it('should default to table format', () => {
    const result = formatTasks(sampleTasks);
    expect(result).toContain('┌');
  });

  it('should respect format option', () => {
    expect(formatTasks(sampleTasks, { format: 'compact' })).toContain('\t');
    expect(formatTasks(sampleTasks, { format: 'csv' })).toContain(',');
    expect(formatTasks(sampleTasks, { format: 'ids' })).not.toContain('\t');
    expect(formatTasks(sampleTasks, { format: 'json' })).toContain('"dart_id"');
  });

  it('should include pagination info when provided', () => {
    const result = formatTasks(sampleTasks, {
      total_count: 100,
      has_more: true,
      offset: 0,
    });
    expect(result).toContain('of 100');
    expect(result).toContain('more');
  });
});

// ============================================================================
// Essential Fields Tests
// ============================================================================

describe('ESSENTIAL_FIELDS', () => {
  it('should contain core display fields', () => {
    expect(ESSENTIAL_FIELDS).toContain('id');
    expect(ESSENTIAL_FIELDS).toContain('title');
    expect(ESSENTIAL_FIELDS).toContain('status');
    expect(ESSENTIAL_FIELDS).toContain('pri');
    expect(ESSENTIAL_FIELDS).toContain('assignee');
    expect(ESSENTIAL_FIELDS).toContain('due');
  });

  it('should be reasonably sized for token efficiency', () => {
    expect(ESSENTIAL_FIELDS.length).toBeLessThanOrEqual(8);
  });
});
