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
 * 1. Correct API query parameter names matching the Dart API schema
 * 2. no_defaults=true is always sent to disable hidden default filters
 * 3. Response mapping (camelCase → snake_case)
 * 4. Request body structure for mutations
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
// The Dart API uses name-based params (dartboard, status, tag) for title/name
// matching, and _id params (dartboard_id, status_id, tag_id) for internal IDs.
// Since config returns names (strings), we use name-based params.

describe('DartClient.listTasks - dartboard filter', () => {
  const recorder = createFetchRecorder('listTasks-dartboard-filter');

  beforeEach(() => recorder.install());
  afterEach(() => recorder.uninstall());
  afterAll(() => recorder.save());

  it('sends dartboard name param with no_defaults=true', async () => {
    const client = createClient();
    const result = await client.listTasks({ dartboard: 'Personal/dart-query', limit: 10 });

    expect(result.total).toBe(2);
    expect(result.tasks).toHaveLength(2);

    // Verify response mapping
    const task = result.tasks[0];
    expect(task.dart_id).toBe('G61I3EqkxBCP');
    expect(task.title).toBe('add_task_comment returns 404 for newly-created tasks');
    expect(task.created_at).toBe('2026-02-17T11:12:51.548398-08:00');

    // Verify correct endpoint param names
    const cassette = recorder.getCassette();
    const endpoint = cassette.exchanges[0].request.endpoint;
    expect(endpoint).toContain('no_defaults=true');
    expect(endpoint).toContain('dartboard=');
    // Must NOT use dartboard_id (that expects internal IDs, not names)
    expect(endpoint).not.toContain('dartboard_id=');
  });
});

describe('DartClient.listTasks - status filter', () => {
  const recorder = createFetchRecorder('listTasks-status-filter');

  beforeEach(() => recorder.install());
  afterEach(() => recorder.uninstall());
  afterAll(() => recorder.save());

  it('sends status name param (not status_id)', async () => {
    const client = createClient();
    const result = await client.listTasks({ status: 'In Progress', limit: 50 });

    expect(result.total).toBe(1);
    expect(result.tasks[0].dart_id).toBe('task_010');

    const cassette = recorder.getCassette();
    const endpoint = cassette.exchanges[0].request.endpoint;
    expect(endpoint).toContain('no_defaults=true');
    expect(endpoint).toContain('status=');
    expect(endpoint).not.toContain('status_id=');
  });
});

describe('DartClient.listTasks - tag filter', () => {
  const recorder = createFetchRecorder('listTasks-tag-filter');

  beforeEach(() => recorder.install());
  afterEach(() => recorder.uninstall());
  afterAll(() => recorder.save());

  it('sends tag name params (not tag_id or tags)', async () => {
    const client = createClient();
    const result = await client.listTasks({ tags: ['Bug', 'critical'], limit: 50 });

    expect(result.total).toBe(3);

    const cassette = recorder.getCassette();
    const endpoint = cassette.exchanges[0].request.endpoint;
    expect(endpoint).toContain('no_defaults=true');
    expect(endpoint).toContain('tag=');
    expect(endpoint).not.toContain('tag_id=');
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
    expect(endpoint).not.toContain('&due_before=');
    expect(endpoint).not.toContain('&due_after=');
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
      status: 'To Do',
      dartboard: 'Personal/dart-query',
      priority: 'medium',
      tags: ['Bug'],
      due_before: '2026-04-01T00:00:00Z',
      due_after: '2026-03-01T00:00:00Z',
      limit: 25,
      offset: 10,
    });

    expect(result.total).toBe(15);

    const cassette = recorder.getCassette();
    const endpoint = cassette.exchanges[0].request.endpoint;

    // Correct param names (name-based, not _id)
    expect(endpoint).toContain('no_defaults=true');
    expect(endpoint).toContain('assignee=');
    expect(endpoint).toContain('status=');
    expect(endpoint).toContain('dartboard=');
    expect(endpoint).toContain('tag=');
    expect(endpoint).toContain('due_at_before=');
    expect(endpoint).toContain('due_at_after=');
    expect(endpoint).toContain('priority=medium');
    expect(endpoint).toContain('limit=25');
    expect(endpoint).toContain('offset=10');

    // Must NOT use _id variants (config gives names not IDs)
    expect(endpoint).not.toContain('dartboard_id=');
    expect(endpoint).not.toContain('status_id=');
    expect(endpoint).not.toContain('tag_id=');
  });
});

describe('DartClient.listTasks - no filters', () => {
  const recorder = createFetchRecorder('listTasks-no-filters');

  beforeEach(() => recorder.install());
  afterEach(() => recorder.uninstall());
  afterAll(() => recorder.save());

  it('sends only no_defaults when no filters specified', async () => {
    const client = createClient();
    const result = await client.listTasks({});

    expect(result.total).toBe(150);

    const cassette = recorder.getCassette();
    const endpoint = cassette.exchanges[0].request.endpoint;
    // Only no_defaults, no filter params
    expect(endpoint).toBe('/api/v0/public/tasks/list?no_defaults=true');
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
    const requestBody = cassette.exchanges[0].request.body as Record<string, unknown>;
    expect((requestBody.item as Record<string, unknown>).title).toBe('New snapshot test task');
    expect((requestBody.item as Record<string, unknown>).dartboard).toBe('db_eng');
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
    const body = exchange.request.body as Record<string, unknown>;
    const item = body.item as Record<string, unknown>;
    expect(item.id).toBe('task_001');
    expect(item.title).toBe('Fix login bug (updated)');
    expect(item.priority).toBe(5);
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

// ─── listDocs: parameter correctness ──────────────────────────────────────────

describe('DartClient.listDocs - folder filter', () => {
  const recorder = createFetchRecorder('listDocs-folder-filter');

  beforeEach(() => recorder.install());
  afterEach(() => recorder.uninstall());
  afterAll(() => recorder.save());

  it('sends folder param to /docs/list endpoint', async () => {
    const client = createClient();
    const result = await client.listDocs({ folder: 'Personal/stuff', limit: 10 });

    expect(result.total).toBe(1);

    const cassette = recorder.getCassette();
    const endpoint = cassette.exchanges[0].request.endpoint;
    // Must use /docs/list (not /docs)
    expect(endpoint).toContain('/docs/list');
    expect(endpoint).toContain('folder=');
    expect(endpoint).not.toContain('folder_id=');
  });
});

describe('DartClient.listDocs - title and text search', () => {
  const recorder = createFetchRecorder('listDocs-text-search');

  beforeEach(() => recorder.install());
  afterEach(() => recorder.uninstall());
  afterAll(() => recorder.save());

  it('sends title and text params (not title_contains/text_contains)', async () => {
    const client = createClient();
    const result = await client.listDocs({
      title_contains: 'API',
      text_contains: 'authentication',
      limit: 50,
    });

    expect(result.total).toBe(2);

    const cassette = recorder.getCassette();
    const endpoint = cassette.exchanges[0].request.endpoint;
    // API uses "title" and "text", not "title_contains" and "text_contains"
    expect(endpoint).toContain('title=');
    expect(endpoint).toContain('text=');
    expect(endpoint).not.toContain('title_contains=');
    expect(endpoint).not.toContain('text_contains=');
  });
});

// ─── listComments: parameter correctness ──────────────────────────────────────

describe('DartClient.listComments', () => {
  const recorder = createFetchRecorder('listComments');

  beforeEach(() => recorder.install());
  afterEach(() => recorder.uninstall());
  afterAll(() => recorder.save());

  it('sends task_id and maps comment response', async () => {
    const client = createClient();
    const result = await client.listComments({ task_id: 'G61I3EqkxBCP', limit: 5 });

    expect(result.total).toBe(1);
    expect(result.comments[0].comment_id).toBe('comment_001');
    expect(result.comments[0].text).toBe('Investigating this issue');

    const cassette = recorder.getCassette();
    const endpoint = cassette.exchanges[0].request.endpoint;
    expect(endpoint).toContain('task_id=');
    expect(endpoint).toContain('limit=5');
  });
});

// ─── createTask: every param reaches the request body ─────────────────────────

describe('DartClient.createTask - all fields reach API', () => {
  const recorder = createFetchRecorder('createTask-all-fields');

  beforeEach(() => recorder.install());
  afterEach(() => recorder.uninstall());
  afterAll(() => recorder.save());

  it('maps every input field to the correct API field name', async () => {
    const client = createClient();
    await client.createTask({
      title: 'Full field test',
      dartboard: 'Personal/dart-query',
      description: 'Testing all fields',
      status: 'To Do',
      priority: 'high',
      assignees: ['alice@example.com'],
      tags: ['Bug'],
      due_at: '2026-04-01T00:00:00Z',
      start_at: '2026-03-25T00:00:00Z',
      parent_task: 'parent_123',
      blocker_ids: ['blocker_1'],
      subtask_ids: ['sub_1'],
    });

    const cassette = recorder.getCassette();
    const body = cassette.exchanges[0].request.body as Record<string, unknown>;
    const item = body.item as Record<string, unknown>;

    // Every input param must appear in the request body
    expect(item.title).toBe('Full field test');
    expect(item.dartboard).toBe('Personal/dart-query');
    expect(item.description).toBe('Testing all fields');
    expect(item.status).toBe('To Do');
    expect(item.priority).toBe('high');
    expect(item.assignees).toEqual(['alice@example.com']);
    expect(item.tags).toEqual(['Bug']);
    // snake_case → camelCase conversions
    expect(item.dueAt).toBe('2026-04-01T00:00:00Z');
    expect(item.startAt).toBe('2026-03-25T00:00:00Z');
    expect(item.parentId).toBe('parent_123');
    // Relationships nested in taskRelationships
    const rels = item.taskRelationships as Record<string, unknown>;
    expect(rels.blockerIds).toEqual(['blocker_1']);
    expect(rels.subtaskIds).toEqual(['sub_1']);

    // Must NOT have snake_case field names in request
    expect(item).not.toHaveProperty('due_at');
    expect(item).not.toHaveProperty('start_at');
    expect(item).not.toHaveProperty('parent_task');
    expect(item).not.toHaveProperty('blocker_ids');
    expect(item).not.toHaveProperty('subtask_ids');
  });
});

// ─── updateTask: every param reaches the request body ─────────────────────────

describe('DartClient.updateTask - all fields reach API', () => {
  const recorder = createFetchRecorder('updateTask-all-fields');

  beforeEach(() => recorder.install());
  afterEach(() => recorder.uninstall());
  afterAll(() => recorder.save());

  it('maps every update field to the correct API field name', async () => {
    const client = createClient();
    await client.updateTask('task_001', {
      title: 'Updated title',
      description: 'Updated desc',
      dartboard: 'Personal/dart-query',
      status: 'Doing',
      priority: 'critical',
      assignees: ['bob@example.com'],
      tags: ['urgent'],
      due_at: '2026-05-01T00:00:00Z',
      start_at: '2026-04-01T00:00:00Z',
      parent_task: 'parent_999',
      subtask_ids: ['sub_a'],
      blocker_ids: ['block_b'],
      blocking_ids: ['blocking_c'],
      duplicate_ids: ['dup_d'],
      related_ids: ['rel_e'],
    });

    const cassette = recorder.getCassette();
    const body = cassette.exchanges[0].request.body as Record<string, unknown>;
    const item = body.item as Record<string, unknown>;

    expect(item.id).toBe('task_001');
    expect(item.title).toBe('Updated title');
    expect(item.description).toBe('Updated desc');
    expect(item.dartboard).toBe('Personal/dart-query');
    expect(item.status).toBe('Doing');
    expect(item.priority).toBe('critical');
    expect(item.assignees).toEqual(['bob@example.com']);
    expect(item.tags).toEqual(['urgent']);
    expect(item.dueAt).toBe('2026-05-01T00:00:00Z');
    expect(item.startAt).toBe('2026-04-01T00:00:00Z');
    expect(item.parentId).toBe('parent_999');

    const rels = item.taskRelationships as Record<string, unknown>;
    expect(rels.subtaskIds).toEqual(['sub_a']);
    expect(rels.blockerIds).toEqual(['block_b']);
    expect(rels.blockingIds).toEqual(['blocking_c']);
    expect(rels.duplicateIds).toEqual(['dup_d']);
    expect(rels.relatedIds).toEqual(['rel_e']);
  });
});

// ─── moveTask: every param reaches the request body ───────────────────────────

describe('DartClient.moveTask - all fields reach API', () => {
  const recorder = createFetchRecorder('moveTask');

  beforeEach(() => recorder.install());
  afterEach(() => recorder.uninstall());
  afterAll(() => recorder.save());

  it('maps all move params to correct API field names', async () => {
    const client = createClient();
    await client.moveTask({
      dart_id: 'task_001',
      dartboard: 'Personal/beagle-term',
      order: 5,
      after_id: 'task_prev',
      before_id: 'task_next',
    });

    const cassette = recorder.getCassette();
    const body = cassette.exchanges[0].request.body as Record<string, unknown>;

    expect(body.dartboard).toBe('Personal/beagle-term');
    expect(body.order).toBe(5);
    // snake_case → camelCase
    expect(body.afterId).toBe('task_prev');
    expect(body.beforeId).toBe('task_next');
    // Must NOT have snake_case in request
    expect(body).not.toHaveProperty('after_id');
    expect(body).not.toHaveProperty('before_id');
    expect(body).not.toHaveProperty('dart_id');
  });
});

// ─── addTimeTracking: every param reaches the request body ────────────────────

describe('DartClient.addTimeTracking - all fields reach API', () => {
  const recorder = createFetchRecorder('addTimeTracking');

  beforeEach(() => recorder.install());
  afterEach(() => recorder.uninstall());
  afterAll(() => recorder.save());

  it('maps all time tracking params to correct API field names', async () => {
    const client = createClient();
    const result = await client.addTimeTracking({
      dart_id: 'task_001',
      started_at: '2026-03-23T09:00:00Z',
      finished_at: '2026-03-23T11:00:00Z',
      duration_minutes: 120,
      note: 'Morning work session',
    });

    expect(result.entry_id).toBe('time_001');
    expect(result.duration_minutes).toBe(120);
    expect(result.note).toBe('Morning work session');

    const cassette = recorder.getCassette();
    const exchange = cassette.exchanges.find(e => e.request.method === 'POST' && e.request.endpoint.includes('/time-tracking'))!;
    const body = exchange.request.body as Record<string, unknown>;

    expect(body.startedAt).toBe('2026-03-23T09:00:00Z');
    expect(body.finishedAt).toBe('2026-03-23T11:00:00Z');
    expect(body.note).toBe('Morning work session');
    // Must NOT have snake_case
    expect(body).not.toHaveProperty('started_at');
    expect(body).not.toHaveProperty('finished_at');
    expect(body).not.toHaveProperty('duration_minutes');
  });
});

// ─── attachUrl: every param reaches the request body ──────────────────────────

describe('DartClient.attachUrl - all fields reach API', () => {
  const recorder = createFetchRecorder('attachUrl');

  beforeEach(() => recorder.install());
  afterEach(() => recorder.uninstall());
  afterAll(() => recorder.save());

  it('sends url and filename in request body', async () => {
    const client = createClient();
    const result = await client.attachUrl({
      dart_id: 'task_001',
      url: 'https://example.com/doc.pdf',
      filename: 'design-spec.pdf',
    });

    expect(result.attachment_id).toBe('attach_001');
    expect(result.url).toBe('https://example.com/doc.pdf');
    expect(result.filename).toBe('design-spec.pdf');

    const cassette = recorder.getCassette();
    const body = cassette.exchanges[0].request.body as Record<string, unknown>;
    expect(body.url).toBe('https://example.com/doc.pdf');
    expect(body.filename).toBe('design-spec.pdf');
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
