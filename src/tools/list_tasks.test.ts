/**
 * list_tasks Tool Handler Tests
 *
 * Tests for handling undefined/null values in config data
 * to prevent "Cannot read properties of undefined" errors
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleListTasks } from './list_tasks.js';
import { DartClient } from '../api/dartClient.js';
import { configCache } from '../cache/configCache.js';

// Mock DartClient
vi.mock('../api/dartClient.js');
vi.mock('../cache/configCache.js');

describe('list_tasks - optional chaining safety', () => {
  beforeEach(() => {
    // Clear cache before each test
    vi.clearAllMocks();
    process.env.DART_TOKEN = 'dsa_test_token';
  });

  it('should handle assignees with undefined name gracefully', async () => {
    const mockConfig = {
      assignees: [
        { dart_id: 'user1', name: undefined as any, email: 'test@example.com' },
        { dart_id: 'user2', name: 'John Doe', email: 'john@example.com' },
      ],
      dartboards: [{ dart_id: 'db1', name: 'Engineering' }],
      statuses: [{ dart_id: 'st1', name: 'In Progress' }],
      tags: [{ dart_id: 'tag1', name: 'urgent' }],
      priorities: [],
      sizes: [],
      folders: [],
    };

    const mockTasks = {
      tasks: [{ dart_id: 'task1', title: 'Test Task', created_at: '2024-01-01' }],
      total: 1,
    };

    vi.mocked(configCache.get).mockReturnValue(null);
    vi.mocked(DartClient).mockImplementation(() => ({
      getConfig: vi.fn().mockResolvedValue(mockConfig),
      listTasks: vi.fn().mockResolvedValue(mockTasks),
    } as any));

    // This should not throw "Cannot read properties of undefined (reading 'toLowerCase')"
    const result = await handleListTasks({ assignee: 'john@example.com' });

    expect(result.tasks).toHaveLength(1);
  });

  it('should handle assignees with undefined email gracefully', async () => {
    const mockConfig = {
      assignees: [
        { dart_id: 'user1', name: 'Jane Doe', email: undefined },
        { dart_id: 'user2', name: 'John Doe', email: 'john@example.com' },
      ],
      dartboards: [{ dart_id: 'db1', name: 'Engineering' }],
      statuses: [{ dart_id: 'st1', name: 'In Progress' }],
      tags: [{ dart_id: 'tag1', name: 'urgent' }],
      priorities: [],
      sizes: [],
      folders: [],
    };

    const mockTasks = {
      tasks: [{ dart_id: 'task1', title: 'Test Task', created_at: '2024-01-01' }],
      total: 1,
    };

    vi.mocked(configCache.get).mockReturnValue(null);
    vi.mocked(DartClient).mockImplementation(() => ({
      getConfig: vi.fn().mockResolvedValue(mockConfig),
      listTasks: vi.fn().mockResolvedValue(mockTasks),
    } as any));

    // This should not throw error when email is undefined
    const result = await handleListTasks({ assignee: 'Jane Doe' });

    expect(result.tasks).toHaveLength(1);
  });

  it('should handle assignees with null dart_id gracefully', async () => {
    const mockConfig = {
      assignees: [
        { dart_id: null as any, name: 'Test User', email: 'test@example.com' },
        { dart_id: 'user2', name: 'John Doe', email: 'john@example.com' },
      ],
      dartboards: [{ dart_id: 'db1', name: 'Engineering' }],
      statuses: [{ dart_id: 'st1', name: 'In Progress' }],
      tags: [{ dart_id: 'tag1', name: 'urgent' }],
      priorities: [],
      sizes: [],
      folders: [],
    };

    const mockTasks = {
      tasks: [{ dart_id: 'task1', title: 'Test Task', created_at: '2024-01-01' }],
      total: 1,
    };

    vi.mocked(configCache.get).mockReturnValue(null);
    vi.mocked(DartClient).mockImplementation(() => ({
      getConfig: vi.fn().mockResolvedValue(mockConfig),
      listTasks: vi.fn().mockResolvedValue(mockTasks),
    } as any));

    // Should handle null dart_id without crashing
    const result = await handleListTasks({ assignee: 'john@example.com' });

    expect(result.tasks).toHaveLength(1);
  });

  it('should handle tags with undefined name gracefully', async () => {
    const mockConfig = {
      assignees: [{ dart_id: 'user1', name: 'John Doe', email: 'john@example.com' }],
      dartboards: [{ dart_id: 'db1', name: 'Engineering' }],
      statuses: [{ dart_id: 'st1', name: 'In Progress' }],
      tags: [
        { dart_id: 'tag1', name: undefined as any },
        { dart_id: 'tag2', name: 'urgent' },
      ],
      priorities: [],
      sizes: [],
      folders: [],
    };

    const mockTasks = {
      tasks: [{ dart_id: 'task1', title: 'Test Task', created_at: '2024-01-01' }],
      total: 1,
    };

    vi.mocked(configCache.get).mockReturnValue(null);
    vi.mocked(DartClient).mockImplementation(() => ({
      getConfig: vi.fn().mockResolvedValue(mockConfig),
      listTasks: vi.fn().mockResolvedValue(mockTasks),
    } as any));

    // Should handle undefined tag name without crashing
    const result = await handleListTasks({ tags: ['urgent'] });

    expect(result.tasks).toHaveLength(1);
  });

  it('should match assignee by name even when email is null', async () => {
    const mockConfig = {
      assignees: [
        { dart_id: 'user1', name: 'John Doe', email: null as any },
      ],
      dartboards: [{ dart_id: 'db1', name: 'Engineering' }],
      statuses: [{ dart_id: 'st1', name: 'In Progress' }],
      tags: [],
      priorities: [],
      sizes: [],
      folders: [],
    };

    const mockTasks = {
      tasks: [{ dart_id: 'task1', title: 'Test Task', assignee: 'user1', created_at: '2024-01-01' }],
      total: 1,
    };

    vi.mocked(configCache.get).mockReturnValue(null);
    vi.mocked(DartClient).mockImplementation(() => ({
      getConfig: vi.fn().mockResolvedValue(mockConfig),
      listTasks: vi.fn().mockResolvedValue(mockTasks),
    } as any));

    // Should successfully match by name even with null email
    const result = await handleListTasks({ assignee: 'John Doe' });

    expect(result.tasks).toHaveLength(1);
    expect(result.filters_applied).toHaveProperty('assignee');
  });
});
