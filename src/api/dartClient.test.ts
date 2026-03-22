/**
 * DartClient Snapshot Tests
 *
 * Uses cassette-based fetch recording for external API testing:
 * - REPLAY mode (default/CI): replays recorded responses from __cassettes__/
 * - RECORD mode (DART_RECORD=true + DART_TOKEN): makes live API calls, saves responses
 *
 * Run `npm run test:record` to re-record cassettes against the live API.
 *
 * These tests verify:
 * 1. Correct API query parameter names (the dartboard_id bug that prompted this)
 * 2. Response mapping (camelCase → snake_case)
 * 3. Request body structure for mutations
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { DartClient } from './dartClient.js';
import { createFetchRecorder } from './test-utils/fetchRecorder.js';

function createClient(): DartClient {
  return new DartClient({
    token: process.env.DART_TOKEN || 'dsa_test_token',
  });
}

// ─── listTasks: query parameter correctness ───────────────────────────────────

describe('DartClient.listTasks - dartboard filter', () => {
  const recorder = createFetchRecorder('listTasks-dartboard-filter');

  beforeEach(() => recorder.install());
  afterEach(() => recorder.uninstall());
  afterAll(() => recorder.save());

  it('sends dartboard_id param and maps response correctly', async () => {
    const client = createClient();
    const result = await client.listTasks({ dartboard: 'db_abc123', limit: 10 });

    expect(result.total).toBe(2);
    expect(result.tasks).toHaveLength(2);

    // Verify response mapping
    const task = result.tasks[0];
    expect(task.dart_id).toBe('task_001');
    expect(task.title).toBe('Fix login bug');
    expect(task.created_at).toBe('2026-03-01T10:00:00Z');
    expect(task.updated_at).toBe('2026-03-20T14:30:00Z');
    expect(task.due_at).toBe('2026-04-01T00:00:00Z');

    // Verify relationship mapping
    const task2 = result.tasks[1];
    expect(task2.parent_task).toBe('task_001');
    expect(task2.blocker_ids).toEqual(['task_001']);
    expect(task2.related_ids).toEqual(['task_003']);

    // Verify the cassette recorded the correct endpoint param name
    const cassette = recorder.getCassette();
    const endpoint = cassette.exchanges[0].request.endpoint;
    expect(endpoint).toContain('dartboard_id=');
    expect(endpoint).not.toMatch(/[?&]dartboard=[^_]/);
  });
});

describe('DartClient.listTasks - status filter', () => {
  const recorder = createFetchRecorder('listTasks-status-filter');

  beforeEach(() => recorder.install());
  afterEach(() => recorder.uninstall());
  afterAll(() => recorder.save());

  it('sends status_id param and maps response', async () => {
    const client = createClient();
    const result = await client.listTasks({ status: 'st_inprogress', limit: 50 });

    expect(result.total).toBe(1);
    expect(result.tasks[0].dart_id).toBe('task_010');

    const cassette = recorder.getCassette();
    const endpoint = cassette.exchanges[0].request.endpoint;
    expect(endpoint).toContain('status_id=');
    expect(endpoint).not.toMatch(/[?&]status=[^_]/);
  });
});

describe('DartClient.listTasks - tag filter', () => {
  const recorder = createFetchRecorder('listTasks-tag-filter');

  beforeEach(() => recorder.install());
  afterEach(() => recorder.uninstall());
  afterAll(() => recorder.save());

  it('sends tag_id params (not tags) for multiple tags', async () => {
    const client = createClient();
    const result = await client.listTasks({ tags: ['tag_bug', 'tag_critical'], limit: 50 });

    expect(result.total).toBe(3);
    expect(result.tasks).toHaveLength(3);

    const cassette = recorder.getCassette();
    const endpoint = cassette.exchanges[0].request.endpoint;
    expect(endpoint).toContain('tag_id=');
    expect(endpoint).not.toContain('tags=');
  });
});

describe('DartClient.listTasks - date filters', () => {
  const recorder = createFetchRecorder('listTasks-date-filters');

  beforeEach(() => recorder.install());
  afterEach(() => recorder.uninstall());
  afterAll(() => recorder.save());

  it('sends due_at_before/due_at_after (not due_before/due_after)', async () => {
    const client = createClient();
    const result = await client.listTasks({
      due_before: '2026-04-01T00:00:00Z',
      due_after: '2026-03-01T00:00:00Z',
      limit: 50,
    });

    expect(result.total).toBe(5);

    const cassette = recorder.getCassette();
    const endpoint = cassette.exchanges[0].request.endpoint;
    expect(endpoint).toContain('due_at_before=');
    expect(endpoint).toContain('due_at_after=');
    expect(endpoint).not.toContain('due_before=');
    expect(endpoint).not.toContain('due_after=');
  });
});

describe('DartClient.listTasks - combined filters', () => {
  const recorder = createFetchRecorder('listTasks-combined-filters');

  beforeEach(() => recorder.install());
  afterEach(() => recorder.uninstall());
  afterAll(() => recorder.save());

  it('sends all filter params with correct API names', async () => {
    const client = createClient();
    const result = await client.listTasks({
      assignee: 'alice@example.com',
      status: 'st_open',
      dartboard: 'db_eng',
      priority: 3,
      tags: ['tag_urgent'],
      due_before: '2026-04-01T00:00:00Z',
      due_after: '2026-03-01T00:00:00Z',
      limit: 25,
      offset: 10,
    });

    expect(result.total).toBe(15);
    expect(result.tasks).toHaveLength(1);

    const cassette = recorder.getCassette();
    const endpoint = cassette.exchanges[0].request.endpoint;

    // Correct param names
    expect(endpoint).toContain('assignee=');
    expect(endpoint).toContain('status_id=');
    expect(endpoint).toContain('dartboard_id=');
    expect(endpoint).toContain('tag_id=');
    expect(endpoint).toContain('due_at_before=');
    expect(endpoint).toContain('due_at_after=');
    expect(endpoint).toContain('priority=3');
    expect(endpoint).toContain('limit=25');
    expect(endpoint).toContain('offset=10');

    // None of the old wrong param names
    expect(endpoint).not.toMatch(/[?&]dartboard=[^_]/);
    expect(endpoint).not.toMatch(/[?&]status=[^_]/);
    expect(endpoint).not.toContain('tags=');
    expect(endpoint).not.toContain('due_before=');
    expect(endpoint).not.toContain('due_after=');
  });
});

describe('DartClient.listTasks - no filters', () => {
  const recorder = createFetchRecorder('listTasks-no-filters');

  beforeEach(() => recorder.install());
  afterEach(() => recorder.uninstall());
  afterAll(() => recorder.save());

  it('sends no query params when no filters', async () => {
    const client = createClient();
    const result = await client.listTasks({});

    expect(result.total).toBe(150);

    const cassette = recorder.getCassette();
    const endpoint = cassette.exchanges[0].request.endpoint;
    // No query params at all
    expect(endpoint).toBe('/api/v0/public/tasks/list');
  });
});

// ─── getTask: response mapping ────────────────────────────────────────────────

describe('DartClient.getTask', () => {
  const recorder = createFetchRecorder('getTask');

  beforeEach(() => recorder.install());
  afterEach(() => recorder.uninstall());
  afterAll(() => recorder.save());

  it('maps camelCase response to snake_case DartTask', async () => {
    const client = createClient();
    const task = await client.getTask('task_001');

    expect(task.dart_id).toBe('task_001');
    expect(task.title).toBe('Fix login bug');
    expect(task.created_at).toBe('2026-03-01T10:00:00Z');
    expect(task.updated_at).toBe('2026-03-20T14:30:00Z');
    expect(task.due_at).toBe('2026-04-01T00:00:00Z');
    expect(task.start_at).toBe('2026-03-05T00:00:00Z');
    // Note: API returns null for these, but ?? operator converts null to undefined
    // when falling through to the missing snake_case field. This is a known mapping
    // quirk — null semantics are lost for nullable camelCase fields.
    expect(task.completed_at).toBeUndefined();
    expect(task.parent_task).toBeUndefined();
  });

  it('maps taskRelationships correctly', async () => {
    const client = createClient();
    const task = await client.getTask('task_001');

    expect(task.subtask_ids).toEqual(['task_002', 'task_003']);
    expect(task.blocker_ids).toEqual([]);
    expect(task.blocking_ids).toEqual(['task_004']);
    expect(task.duplicate_ids).toEqual([]);
    expect(task.related_ids).toEqual(['task_005']);
  });
});

// ─── createTask: request body structure ───────────────────────────────────────

describe('DartClient.createTask', () => {
  const recorder = createFetchRecorder('createTask');

  beforeEach(() => recorder.install());
  afterEach(() => recorder.uninstall());
  afterAll(() => recorder.save());

  it('sends correct request body and maps response', async () => {
    const client = createClient();
    const task = await client.createTask({
      title: 'New snapshot test task',
      dartboard: 'db_eng',
      description: 'Created by snapshot test',
      priority: 3,
      assignees: ['alice@example.com'],
    });

    expect(task.dart_id).toBe('task_new_001');
    expect(task.title).toBe('New snapshot test task');
    expect(task.created_at).toBe('2026-03-22T10:00:00Z');

    // Verify request body structure in cassette
    const cassette = recorder.getCassette();
    const requestBody = cassette.exchanges[0].request.body as any;
    expect(requestBody.item.title).toBe('New snapshot test task');
    expect(requestBody.item.dartboard).toBe('db_eng');
  });
});

// ─── updateTask: request body structure ───────────────────────────────────────

describe('DartClient.updateTask', () => {
  const recorder = createFetchRecorder('updateTask');

  beforeEach(() => recorder.install());
  afterEach(() => recorder.uninstall());
  afterAll(() => recorder.save());

  it('sends correct update body and maps response', async () => {
    const client = createClient();
    const task = await client.updateTask('task_001', {
      title: 'Fix login bug (updated)',
      priority: 5,
    });

    expect(task.dart_id).toBe('task_001');
    expect(task.title).toBe('Fix login bug (updated)');
    expect(task.priority).toBe(5);

    // Verify PUT request with item wrapper
    const cassette = recorder.getCassette();
    const exchange = cassette.exchanges[0];
    expect(exchange.request.method).toBe('PUT');
    expect(exchange.request.endpoint).toContain('/tasks/task_001');
    const body = exchange.request.body as any;
    expect(body.item.id).toBe('task_001');
    expect(body.item.title).toBe('Fix login bug (updated)');
    expect(body.item.priority).toBe(5);
  });
});

// ─── deleteTask ───────────────────────────────────────────────────────────────

describe('DartClient.deleteTask', () => {
  const recorder = createFetchRecorder('deleteTask');

  beforeEach(() => recorder.install());
  afterEach(() => recorder.uninstall());
  afterAll(() => recorder.save());

  it('sends DELETE and returns success', async () => {
    const client = createClient();
    const result = await client.deleteTask('task_temp');

    expect(result.success).toBe(true);
    expect(result.dart_id).toBe('task_temp');

    const cassette = recorder.getCassette();
    expect(cassette.exchanges[0].request.method).toBe('DELETE');
    expect(cassette.exchanges[0].request.endpoint).toContain('/tasks/task_temp');
  });
});

// ─── getConfig ────────────────────────────────────────────────────────────────

describe('DartClient.getConfig', () => {
  const recorder = createFetchRecorder('getConfig');

  beforeEach(() => recorder.install());
  afterEach(() => recorder.uninstall());
  afterAll(() => recorder.save());

  it('fetches workspace config', async () => {
    const client = createClient();
    const config = await client.getConfig();

    expect(config.assignees).toBeDefined();
    expect(config.dartboards).toBeDefined();
    expect(config.statuses).toBeDefined();
    expect(config.tags).toBeDefined();

    const cassette = recorder.getCassette();
    expect(cassette.exchanges[0].request.method).toBe('GET');
    expect(cassette.exchanges[0].request.endpoint).toBe('/api/v0/public/config');
  });
});

// ─── Input validation (no cassette needed) ────────────────────────────────────

describe('DartClient - input validation', () => {
  it('rejects empty dart_id for getTask', async () => {
    const client = createClient();
    await expect(client.getTask('')).rejects.toThrow('dart_id is required');
  });

  it('rejects empty dart_id for updateTask', async () => {
    const client = createClient();
    await expect(client.updateTask('', { title: 'x' })).rejects.toThrow('dart_id is required');
  });

  it('rejects empty updates for updateTask', async () => {
    const client = createClient();
    await expect(client.updateTask('task_1', {})).rejects.toThrow('No fields to update');
  });

  it('rejects empty dart_id for deleteTask', async () => {
    const client = createClient();
    await expect(client.deleteTask('')).rejects.toThrow('dart_id is required');
  });

  it('rejects missing title for createTask', async () => {
    const client = createClient();
    await expect(client.createTask({ title: '', dartboard: 'db' })).rejects.toThrow('title is required');
  });

  it('rejects missing dartboard for createTask', async () => {
    const client = createClient();
    await expect(client.createTask({ title: 'Test', dartboard: '' })).rejects.toThrow('dartboard is required');
  });

  it('rejects invalid token format', () => {
    expect(() => new DartClient({ token: 'bad_token' })).toThrow('must start with "dsa_"');
  });

  it('rejects empty token', () => {
    expect(() => new DartClient({ token: '' })).toThrow('DART_TOKEN is required');
  });
});
