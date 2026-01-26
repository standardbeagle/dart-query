/**
 * list_tasks Tool Handler
 *
 * Query tasks with filters, pagination, and detail levels.
 * Hub tool for task discovery - feeds batch operations and provides token-efficient querying.
 */

import { DartClient } from '../api/dartClient.js';
import { configCache } from '../cache/configCache.js';
import {
  ListTasksInput,
  ListTasksOutput,
  DartTask,
  DartAPIError,
  ValidationError,
  findStatus,
  findDartboard,
  findTag,
  getStatusNames,
  getDartboardNames,
  getTagNames,
} from '../types/index.js';

/**
 * Handle list_tasks tool calls
 *
 * Flow:
 * 1. Validate input parameters (pagination, filters, detail_level)
 * 2. Resolve filter references (names to IDs) against config
 * 3. Call DartClient.listTasks() with filters
 * 4. Apply client-side filtering fallback if API doesn't support filter
 * 5. Apply detail_level pruning (minimal/standard/full)
 * 6. Calculate pagination metadata
 * 7. Return tasks with pagination info and filters_applied
 *
 * @param input - ListTasksInput with filters, pagination, and detail level
 * @returns ListTasksOutput with tasks array and pagination metadata
 */
export async function handleListTasks(input: ListTasksInput): Promise<ListTasksOutput> {
  // Defensive input handling
  const safeInput = input || {};

  const DART_TOKEN = process.env.DART_TOKEN;

  if (!DART_TOKEN) {
    throw new DartAPIError(
      'DART_TOKEN environment variable is required. Get your token from: https://app.dartai.com/?settings=account',
      401
    );
  }

  // Initialize Dart API client
  const client = new DartClient({ token: DART_TOKEN });

  // Validate and normalize pagination parameters
  const limit = validateLimit(safeInput.limit);
  const offset = validateOffset(safeInput.offset);

  // Validate detail_level
  const detailLevel = validateDetailLevel(safeInput.detail_level);

  // Validate and resolve filters
  const resolvedFilters = await resolveFilters(safeInput, client);

  // Build API request with resolved filters
  const apiRequest: ListTasksInput = {
    ...resolvedFilters,
    limit,
    offset,
    detail_level: detailLevel,
  };

  // Call DartClient.listTasks()
  let apiResponse: { tasks: DartTask[]; total: number };
  try {
    apiResponse = await client.listTasks(apiRequest);
  } catch (error) {
    // Enhance error messages for authentication issues
    if (error instanceof DartAPIError) {
      if (error.statusCode === 401) {
        throw new DartAPIError(
          'Authentication failed: Invalid DART_TOKEN. Get a valid token from: https://app.dartai.com/?settings=account',
          401,
          error.response
        );
      } else if (error.statusCode === 403) {
        throw new DartAPIError(
          'Access forbidden: Your DART_TOKEN does not have permission to list tasks.',
          403,
          error.response
        );
      }
    }
    // Re-throw other errors
    throw error;
  }

  // Extract tasks and total count
  let tasks = apiResponse.tasks || [];
  const totalCount = apiResponse.total || 0;

  // Apply client-side filtering fallback if API doesn't support certain filters
  // (Some filters might not be supported by the API, so we filter client-side)
  tasks = applyClientSideFilters(tasks, safeInput);

  // Apply detail_level pruning to reduce token usage
  tasks = applyDetailLevel(tasks, detailLevel);

  // Calculate pagination metadata
  const returnedCount = tasks.length;
  // Use limit (not returnedCount) to calculate hasMore, as client-side filtering could reduce returnedCount
  const hasMore = offset + limit < totalCount;
  const nextOffset = hasMore ? offset + limit : null;

  // Build filters_applied object
  const filtersApplied = buildFiltersApplied(safeInput, resolvedFilters);

  return {
    tasks,
    total_count: totalCount,
    returned_count: returnedCount,
    has_more: hasMore,
    next_offset: nextOffset,
    filters_applied: filtersApplied,
  };
}

/**
 * Validate and normalize limit parameter
 */
function validateLimit(limit?: number): number {
  if (limit === undefined || limit === null) {
    return 50; // Default limit
  }

  if (typeof limit !== 'number' || !Number.isInteger(limit)) {
    throw new ValidationError('limit must be an integer');
  }

  if (limit < 1) {
    throw new ValidationError('limit must be at least 1');
  }

  if (limit > 500) {
    throw new ValidationError('limit must not exceed 500 (max allowed)');
  }

  return limit;
}

/**
 * Validate and normalize offset parameter
 */
function validateOffset(offset?: number): number {
  if (offset === undefined || offset === null) {
    return 0; // Default offset
  }

  if (typeof offset !== 'number' || !Number.isInteger(offset)) {
    throw new ValidationError('offset must be an integer');
  }

  if (offset < 0) {
    throw new ValidationError('offset must be non-negative');
  }

  return offset;
}

/**
 * Validate detail_level parameter
 */
function validateDetailLevel(detailLevel?: string): 'minimal' | 'standard' | 'full' {
  if (!detailLevel) {
    return 'standard'; // Default detail level
  }

  if (!['minimal', 'standard', 'full'].includes(detailLevel)) {
    throw new ValidationError(
      `detail_level must be one of: minimal, standard, full. Got: "${detailLevel}"`
    );
  }

  return detailLevel as 'minimal' | 'standard' | 'full';
}

/**
 * Resolve filter references (names to IDs) against workspace config
 */
async function resolveFilters(
  input: ListTasksInput,
  client: DartClient
): Promise<ListTasksInput> {
  // If no filters that need resolution, return as-is
  const needsResolution = input.assignee || input.status || input.dartboard || input.tags;

  if (!needsResolution) {
    return { ...input };
  }

  // Get config to resolve names to IDs
  let config = configCache.get();
  if (!config) {
    config = await client.getConfig();
    configCache.set({
      ...config,
      cached_at: new Date().toISOString(),
      cache_ttl_seconds: configCache.getTTL(),
    });
  }

  const resolved: ListTasksInput = { ...input };

  // Resolve assignee (dart_id, name, or email)
  if (input.assignee && typeof input.assignee === 'string') {
    const assigneeInput = input.assignee; // Type narrowing

    // Handle empty assignees array edge case
    if (!config.assignees || config.assignees.length === 0) {
      throw new ValidationError(
        'No assignees configured in workspace. Cannot filter by assignee.',
        'assignee',
        ['No assignees available']
      );
    }

    const assignee = config.assignees.find(
      (a) =>
        a.name?.toLowerCase() === assigneeInput.toLowerCase() ||
        a.email?.toLowerCase() === assigneeInput.toLowerCase()
    );

    if (!assignee) {
      throw new ValidationError(
        `Assignee not found: "${assigneeInput}". Use get_config to see available assignees.`,
        'assignee',
        config.assignees.map((a) => a.email ? `${a.name} <${a.email}>` : a.name)
      );
    }

    // Use email if available, otherwise name
    resolved.assignee = assignee.email || assignee.name;
  }

  // Resolve status (dart_id or name)
  if (input.status && typeof input.status === 'string') {
    const statusInput = input.status; // Type narrowing

    // Handle empty statuses array edge case
    if (!config.statuses || config.statuses.length === 0) {
      throw new ValidationError(
        'No statuses configured in workspace. Cannot filter by status.',
        'status',
        ['No statuses available']
      );
    }

    const status = findStatus(config.statuses, statusInput);

    if (!status) {
      throw new ValidationError(
        `Status not found: "${statusInput}". Use get_config to see available statuses.`,
        'status',
        getStatusNames(config.statuses)
      );
    }

    // Return dart_id for API filtering
    resolved.status = typeof status === 'string' ? status : status.dart_id;
  }

  // Resolve dartboard (dart_id or name)
  if (input.dartboard && typeof input.dartboard === 'string') {
    const dartboardInput = input.dartboard; // Type narrowing

    // Handle empty dartboards array edge case
    if (!config.dartboards || config.dartboards.length === 0) {
      throw new ValidationError(
        'No dartboards configured in workspace. Cannot filter by dartboard.',
        'dartboard',
        ['No dartboards available']
      );
    }

    const dartboard = findDartboard(config.dartboards, dartboardInput);

    if (!dartboard) {
      throw new ValidationError(
        `Dartboard not found: "${dartboardInput}". Use get_config to see available dartboards.`,
        'dartboard',
        getDartboardNames(config.dartboards).slice(0, 10)
      );
    }

    // Return dart_id for API filtering
    resolved.dartboard = typeof dartboard === 'string' ? dartboard : dartboard.dart_id;
  }

  // Resolve tags (dart_ids or names)
  if (input.tags && Array.isArray(input.tags) && input.tags.length > 0) {
    // Handle empty tags array edge case
    if (!config.tags || config.tags.length === 0) {
      throw new ValidationError(
        'No tags configured in workspace. Cannot filter by tags.',
        'tags',
        ['No tags available']
      );
    }

    const resolvedTags: string[] = [];

    for (const tagInput of input.tags) {
      // Validate tagInput is a string
      if (typeof tagInput !== 'string') {
        throw new ValidationError(
          `Invalid tag value: tags must be strings. Got: ${typeof tagInput}`,
          'tags'
        );
      }

      const tag = findTag(config.tags, tagInput);

      if (!tag) {
        throw new ValidationError(
          `Tag not found: "${tagInput}". Use get_config to see available tags.`,
          'tags',
          getTagNames(config.tags).slice(0, 20)
        );
      }

      // Return dart_id for API filtering
      resolvedTags.push(typeof tag === 'string' ? tag : tag.dart_id);
    }

    resolved.tags = resolvedTags;
  }

  // Validate date formats
  if (input.due_before && !isValidISO8601Date(input.due_before)) {
    throw new ValidationError(
      `due_before must be in ISO8601 format (e.g., "2024-12-31T23:59:59Z"). Got: "${input.due_before}"`,
      'due_before'
    );
  }

  if (input.due_after && !isValidISO8601Date(input.due_after)) {
    throw new ValidationError(
      `due_after must be in ISO8601 format (e.g., "2024-01-01T00:00:00Z"). Got: "${input.due_after}"`,
      'due_after'
    );
  }

  // Validate priority range
  if (input.priority !== undefined) {
    if (typeof input.priority !== 'number' || !Number.isInteger(input.priority)) {
      throw new ValidationError('priority must be an integer', 'priority');
    }

    if (input.priority < 1 || input.priority > 5) {
      throw new ValidationError(
        'priority must be between 1 and 5 (1=lowest, 5=highest)',
        'priority'
      );
    }
  }

  // Validate relationship filters
  validateRelationshipFilters(input);

  return resolved;
}

/**
 * Validate relationship filter parameters
 *
 * Note: Only has_parent is supported because the list API returns parent_task.
 * Other relationship filters (has_subtasks, has_blockers, is_blocking) are not
 * available because the list API doesn't return taskRelationships data.
 */
function validateRelationshipFilters(input: ListTasksInput): void {
  // Validate has_parent boolean filter
  if (input.has_parent !== undefined && typeof input.has_parent !== 'boolean') {
    throw new ValidationError('has_parent must be a boolean', 'has_parent');
  }
}

/**
 * Validate ISO8601 date format
 */
function isValidISO8601Date(dateString: string): boolean {
  const iso8601Regex = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})?)?$/;
  if (!iso8601Regex.test(dateString)) {
    return false;
  }

  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

/**
 * Check if relationship filters are being used (require client-side filtering)
 *
 * Note: Only has_parent is supported. Other relationship filters were removed
 * because the list API doesn't return taskRelationships data.
 */
function hasRelationshipFilters(input: ListTasksInput): boolean {
  return input.has_parent !== undefined;
}

/**
 * Apply client-side filtering for relationship filters.
 *
 * Note: Only has_parent is supported because the list API returns parent_task.
 * Other relationship filters (has_subtasks, has_blockers, is_blocking) were removed
 * because the list API doesn't return taskRelationships data.
 */
function applyClientSideFilters(tasks: DartTask[], input: ListTasksInput): DartTask[] {
  // If no relationship filters, return as-is (API handles other filters)
  if (!hasRelationshipFilters(input)) {
    return tasks;
  }

  return tasks.filter((task) => {
    // has_parent filter: tasks with or without a parent task
    if (input.has_parent !== undefined) {
      const hasParent = task.parent_task !== undefined && task.parent_task !== null && task.parent_task !== '';
      if (input.has_parent !== hasParent) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Apply detail_level pruning to reduce token usage
 */
function applyDetailLevel(
  tasks: DartTask[],
  detailLevel: 'minimal' | 'standard' | 'full'
): DartTask[] {
  if (detailLevel === 'full') {
    return tasks; // Return all fields
  }

  return tasks.map((task) => {
    if (detailLevel === 'minimal') {
      // minimal: id + title only
      return {
        dart_id: task.dart_id,
        title: task.title,
        created_at: task.created_at,
        updated_at: task.updated_at,
      } as DartTask;
    }

    // standard: id + title + status + assignee + priority
    return {
      dart_id: task.dart_id,
      title: task.title,
      status: task.status,
      status_id: task.status_id,
      priority: task.priority,
      assignees: task.assignees,
      dartboard: task.dartboard,
      dartboard_id: task.dartboard_id,
      created_at: task.created_at,
      updated_at: task.updated_at,
    } as DartTask;
  });
}

/**
 * Build filters_applied object for response
 */
function buildFiltersApplied(
  input: ListTasksInput,
  resolved: ListTasksInput
): Record<string, unknown> {
  const filtersApplied: Record<string, unknown> = {};

  // Echo back all applied filters
  if (resolved.assignee) filtersApplied.assignee = resolved.assignee;
  if (resolved.status) filtersApplied.status = resolved.status;
  if (resolved.dartboard) filtersApplied.dartboard = resolved.dartboard;
  if (resolved.priority !== undefined) filtersApplied.priority = resolved.priority;
  if (resolved.tags && resolved.tags.length > 0) filtersApplied.tags = resolved.tags;
  if (resolved.due_before) filtersApplied.due_before = resolved.due_before;
  if (resolved.due_after) filtersApplied.due_after = resolved.due_after;

  // Echo back relationship filters (client-side filters)
  // Note: Only has_parent is supported (list API returns parent_task)
  if (input.has_parent !== undefined) filtersApplied.has_parent = input.has_parent;

  // Include pagination info (using actual validated values, not defaults from input)
  filtersApplied.limit = input.limit !== undefined ? input.limit : 50;
  filtersApplied.offset = input.offset !== undefined ? input.offset : 0;
  filtersApplied.detail_level = input.detail_level || 'standard';

  // Flag indicating client-side filtering was used
  if (hasRelationshipFilters(input)) {
    filtersApplied.client_side_filtered = true;
  }

  return filtersApplied;
}
