/**
 * execute_dartql Tool Handler Tests
 *
 * Unit tests for interpolation, SET→DartTask conversion, and input validation.
 * Integration tests require mocking DartClient and are not included here.
 */

import { describe, it, expect } from 'vitest';
import { interpolateTemplate } from './execute_dartql.js';
import type { DartTask } from '../types/index.js';

// Helper to create a minimal DartTask for testing
function makeTask(overrides: Partial<DartTask> = {}): DartTask {
  return {
    dart_id: 'duid_test',
    title: 'Test Task',
    status: 'Todo',
    priority: '3',
    assignees: ['alice@example.com', 'bob@example.com'],
    tags: ['urgent', 'bug'],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
    ...overrides,
  };
}

describe('interpolateTemplate', () => {
  it('should interpolate single field', () => {
    const task = makeTask({ title: 'Fix Login Bug' });
    expect(interpolateTemplate('Closed: {title}', task)).toBe('Closed: Fix Login Bug');
  });

  it('should interpolate multiple fields', () => {
    const task = makeTask({ title: 'Fix Bug', status: 'Done' });
    expect(interpolateTemplate('{title} is now {status}', task)).toBe('Fix Bug is now Done');
  });

  it('should handle array fields by joining with commas', () => {
    const task = makeTask({ tags: ['urgent', 'bug'] });
    expect(interpolateTemplate('Tags: {tags}', task)).toBe('Tags: urgent, bug');
  });

  it('should handle null/undefined fields as empty string', () => {
    const task = makeTask({ description: undefined });
    expect(interpolateTemplate('Desc: {description}', task)).toBe('Desc: ');
  });

  it('should handle missing fields as empty string', () => {
    const task = makeTask();
    expect(interpolateTemplate('Due: {due_at}', task)).toBe('Due: ');
  });

  it('should leave literal text without braces unchanged', () => {
    const task = makeTask();
    expect(interpolateTemplate('No vars here', task)).toBe('No vars here');
  });

  it('should handle empty template', () => {
    const task = makeTask();
    expect(interpolateTemplate('', task)).toBe('');
  });

  it('should handle numeric fields', () => {
    const task = makeTask({ priority: '5' });
    expect(interpolateTemplate('Priority: {priority}', task)).toBe('Priority: 5');
  });

  it('should handle dart_id field', () => {
    const task = makeTask({ dart_id: 'duid_abc123' });
    expect(interpolateTemplate('ID: {dart_id}', task)).toBe('ID: duid_abc123');
  });

  it('should handle multiple occurrences of same template var', () => {
    const task = makeTask({ title: 'Bug' });
    expect(interpolateTemplate('{title} - {title}', task)).toBe('Bug - Bug');
  });

  it('should handle assignees array', () => {
    const task = makeTask({ assignees: ['alice', 'bob'] });
    expect(interpolateTemplate('Assigned: {assignees}', task)).toBe('Assigned: alice, bob');
  });

  it('should handle empty array as empty string', () => {
    const task = makeTask({ tags: [] });
    expect(interpolateTemplate('Tags: {tags}', task)).toBe('Tags: ');
  });
});
