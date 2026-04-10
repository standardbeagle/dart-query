/**
 * search_tasks Tool Handler Tests
 *
 * Tests for inline filter extraction from query strings
 * and dartboard resolution for search queries.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleSearchTasks } from './search_tasks.js';
import { DartClient } from '../api/dartClient.js';
import { configCache } from '../cache/configCache.js';

vi.mock('../api/dartClient.js');
vi.mock('../cache/configCache.js');

const mockConfig = {
  assignees: [{ dart_id: 'user1', name: 'Alice' }],
  dartboards: [
    { dart_id: 'db1', name: 'Personal/agnt' },
    { dart_id: 'db2', name: 'Personal/dart-query' },
  ],
  statuses: [{ dart_id: 'st1', name: 'Done' }],
  tags: [],
  priorities: [],
  sizes: [],
  folders: [],
};

describe('search_tasks - inline filter extraction', () => {
  let mockListTasks: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DART_TOKEN = 'dsa_test_token';

    // Mock configCache
    vi.mocked(configCache.get).mockReturnValue(null);
    vi.mocked(configCache.getTTL).mockReturnValue(300);
    vi.mocked(configCache.set).mockImplementation(() => {});

    // Mock DartClient
    mockListTasks = vi.fn().mockResolvedValue({ tasks: [], total: 0 });
    const mockGetConfig = vi.fn().mockResolvedValue(mockConfig);
    vi.mocked(DartClient).mockImplementation(() => ({
      listTasks: mockListTasks,
      getConfig: mockGetConfig,
    }) as any);
  });

  it('should extract dartboard: filter from query and use as API filter', async () => {
    const result = await handleSearchTasks({
      query: 'dartboard:Personal/agnt bug fix',
    });

    // Should have resolved dartboard and passed to listTasks
    expect(mockListTasks).toHaveBeenCalled();
    const callArgs = mockListTasks.mock.calls[0][0];
    expect(callArgs.dartboard).toBe('db1');

    // Query should parse the search terms without the dartboard filter
    expect(result.query_parsed.terms).toEqual(['bug', 'fix']);
    expect(result.query_parsed.filters).toEqual({ dartboard: 'Personal/agnt' });
  });

  it('should extract quoted dartboard: filter from query', async () => {
    const result = await handleSearchTasks({
      query: 'dartboard:"Personal/agnt" bug',
    });

    expect(mockListTasks).toHaveBeenCalled();
    const callArgs = mockListTasks.mock.calls[0][0];
    expect(callArgs.dartboard).toBe('db1');
    expect(result.query_parsed.terms).toEqual(['bug']);
  });

  it('should prefer explicit dartboard param over inline filter', async () => {
    const result = await handleSearchTasks({
      query: 'dartboard:Personal/agnt bug',
      dartboard: 'Personal/dart-query',
    });

    expect(mockListTasks).toHaveBeenCalled();
    const callArgs = mockListTasks.mock.calls[0][0];
    expect(callArgs.dartboard).toBe('db2');
  });

  it('should extract status: filter from query', async () => {
    const result = await handleSearchTasks({
      query: 'status:Done bug fix',
    });

    expect(mockListTasks).toHaveBeenCalled();
    const callArgs = mockListTasks.mock.calls[0][0];
    expect(callArgs.status).toBe('Done');
    expect(result.query_parsed.terms).toEqual(['bug', 'fix']);
    expect(result.query_parsed.filters).toEqual({ status: 'Done' });
  });

  it('should reject query with only filters and no search terms', async () => {
    await expect(
      handleSearchTasks({ query: 'dartboard:Personal/agnt' })
    ).rejects.toThrow('query must contain search terms in addition to filters');
  });

  it('should work without any inline filters', async () => {
    const result = await handleSearchTasks({
      query: 'bug fix',
    });

    expect(mockListTasks).toHaveBeenCalled();
    const callArgs = mockListTasks.mock.calls[0][0];
    expect(callArgs.dartboard).toBeUndefined();
    expect(result.query_parsed.terms).toEqual(['bug', 'fix']);
    expect(result.query_parsed.filters).toEqual({});
  });

  it('should combine inline filters with phrases and exclusions', async () => {
    const result = await handleSearchTasks({
      query: 'dartboard:Personal/agnt "exact phrase" -excluded search',
    });

    expect(result.query_parsed.terms).toEqual(['search']);
    expect(result.query_parsed.phrases).toEqual(['exact phrase']);
    expect(result.query_parsed.exclusions).toEqual(['excluded']);
    expect(result.query_parsed.filters).toEqual({ dartboard: 'Personal/agnt' });
  });
});
