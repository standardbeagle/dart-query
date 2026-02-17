/**
 * validateUpdates Smoke Tests
 *
 * Confirms the extracted validation functions work after the move.
 */

import { describe, it, expect } from 'vitest';
import { validateUpdates, validateRelationshipArray, extractCurrentValues } from './validateUpdates.js';
import type { DartConfig, DartTask } from '../types/index.js';

function makeConfig(overrides: Partial<DartConfig> = {}): DartConfig {
  return {
    assignees: [{ name: 'Alice', email: 'alice@example.com' }],
    dartboards: [{ dart_id: 'db1', name: 'Main Board' }],
    statuses: [{ dart_id: 'st1', name: 'Todo' }, { dart_id: 'st2', name: 'Done' }],
    tags: [{ dart_id: 'tg1', name: 'urgent' }],
    priorities: [
      { value: 1, label: 'Low' },
      { value: 2, label: 'Medium' },
      { value: 3, label: 'High' },
      { value: 4, label: 'Critical' },
      { value: 5, label: 'Highest' },
    ],
    sizes: [
      { value: 1, label: 'XS' },
      { value: 2, label: 'S' },
      { value: 3, label: 'M' },
      { value: 4, label: 'L' },
      { value: 5, label: 'XL' },
    ],
    folders: [],
    ...overrides,
  };
}

describe('validateUpdates', () => {
  it('should validate simple title update', async () => {
    const config = makeConfig();
    const result = await validateUpdates({ title: 'New Title' }, config);
    expect(result.title).toBe('New Title');
  });

  it('should reject empty title', async () => {
    const config = makeConfig();
    await expect(validateUpdates({ title: '' }, config)).rejects.toThrow('title must be a non-empty string');
  });

  it('should resolve status name to dart_id', async () => {
    const config = makeConfig();
    const result = await validateUpdates({ status: 'Todo' }, config);
    expect(result.status).toBe('st1');
  });

  it('should reject invalid status', async () => {
    const config = makeConfig();
    await expect(validateUpdates({ status: 'NonExistent' }, config)).rejects.toThrow('Invalid status');
  });

  it('should validate priority range', async () => {
    const config = makeConfig();
    const result = await validateUpdates({ priority: 3 as any }, config);
    expect(result.priority).toBe(3);
  });

  it('should reject priority out of range', async () => {
    const config = makeConfig();
    await expect(validateUpdates({ priority: 10 as any }, config)).rejects.toThrow('Invalid priority');
  });

  it('should pass through description', async () => {
    const config = makeConfig();
    const result = await validateUpdates({ description: 'Hello' }, config);
    expect(result.description).toBe('Hello');
  });
});

describe('validateRelationshipArray', () => {
  it('should return undefined for undefined input', () => {
    expect(validateRelationshipArray('blocker_ids', undefined)).toBeUndefined();
  });

  it('should return empty array for empty array', () => {
    expect(validateRelationshipArray('blocker_ids', [])).toEqual([]);
  });

  it('should pass through valid string array', () => {
    expect(validateRelationshipArray('blocker_ids', ['id1', 'id2'])).toEqual(['id1', 'id2']);
  });

  it('should reject non-array input', () => {
    expect(() => validateRelationshipArray('blocker_ids', 'not-an-array')).toThrow('must be an array');
  });

  it('should reject non-string elements', () => {
    expect(() => validateRelationshipArray('blocker_ids', [123])).toThrow('must be a string');
  });

  it('should reject empty string elements', () => {
    expect(() => validateRelationshipArray('blocker_ids', [''])).toThrow('must be a non-empty string');
  });
});

describe('extractCurrentValues', () => {
  it('should extract specified fields from task', () => {
    const task: DartTask = {
      dart_id: 'test',
      title: 'Test',
      status: 'Todo',
      priority: '3',
      created_at: '2026-01-01',
      updated_at: '2026-01-15',
    };
    const result = extractCurrentValues(task, ['status', 'priority']);
    expect(result).toEqual({ status: 'Todo', priority: '3' });
  });

  it('should skip fields not present on task', () => {
    const task: DartTask = {
      dart_id: 'test',
      title: 'Test',
      created_at: '2026-01-01',
      updated_at: '2026-01-15',
    };
    const result = extractCurrentValues(task, ['status', 'description']);
    expect(result).toEqual({});
  });
});
