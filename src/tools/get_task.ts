/**
 * get_task Tool Handler
 *
 * Retrieves a single task by dart_id with optional comment inclusion.
 * Returns task details with deep link URL and relationship information.
 *
 * Features:
 * - Relationship counts for quick overview
 * - Optional expanded relationships with titles (requires additional API calls)
 * - include_relationships parameter to omit relationship fields for smaller response
 */

import { DartClient } from '../api/dartClient.js';
import {
  DartAPIError,
  DartTask,
  DartComment,
  GetTaskInput,
  GetTaskOutput,
  RelationshipCounts,
  ExpandedRelationships,
  RelatedTaskSummary,
} from '../types/index.js';

/**
 * Calculate relationship counts from a task
 */
function calculateRelationshipCounts(task: DartTask): RelationshipCounts {
  const subtasks = task.subtask_ids?.length ?? 0;
  const blockers = task.blocker_ids?.length ?? 0;
  const blocking = task.blocking_ids?.length ?? 0;
  const duplicates = task.duplicate_ids?.length ?? 0;
  const related = task.related_ids?.length ?? 0;

  return {
    subtasks,
    blockers,
    blocking,
    duplicates,
    related,
    total: subtasks + blockers + blocking + duplicates + related,
  };
}

/**
 * Fetch task titles for a list of dart_ids
 * Returns summaries with dart_id and title only
 */
async function fetchTaskSummaries(
  client: DartClient,
  dartIds: string[]
): Promise<RelatedTaskSummary[]> {
  if (!dartIds || dartIds.length === 0) {
    return [];
  }

  const summaries: RelatedTaskSummary[] = [];

  // Fetch each task individually (API doesn't support batch get by IDs)
  // Use Promise.allSettled to handle partial failures gracefully
  const results = await Promise.allSettled(
    dartIds.map(async (dartId) => {
      const task = await client.getTask(dartId);
      return {
        dart_id: task.dart_id,
        title: task.title,
      };
    })
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      summaries.push(result.value);
    }
    // For rejected promises, we skip the task (it may have been deleted)
  }

  return summaries;
}

/**
 * Fetch expanded relationships with titles for all related tasks
 */
async function fetchExpandedRelationships(
  client: DartClient,
  task: DartTask
): Promise<ExpandedRelationships> {
  const expanded: ExpandedRelationships = {};

  // Fetch all relationship types in parallel
  const [subtasks, blockers, blocking, duplicates, related] = await Promise.all([
    fetchTaskSummaries(client, task.subtask_ids ?? []),
    fetchTaskSummaries(client, task.blocker_ids ?? []),
    fetchTaskSummaries(client, task.blocking_ids ?? []),
    fetchTaskSummaries(client, task.duplicate_ids ?? []),
    fetchTaskSummaries(client, task.related_ids ?? []),
  ]);

  // Only include non-empty arrays
  if (subtasks.length > 0) expanded.subtasks = subtasks;
  if (blockers.length > 0) expanded.blockers = blockers;
  if (blocking.length > 0) expanded.blocking = blocking;
  if (duplicates.length > 0) expanded.duplicates = duplicates;
  if (related.length > 0) expanded.related = related;

  return expanded;
}

/**
 * Remove relationship fields from task for compact response
 */
function stripRelationshipFields(task: DartTask): DartTask {
  const { subtask_ids: _subtask_ids, blocker_ids: _blocker_ids, blocking_ids: _blocking_ids, duplicate_ids: _duplicate_ids, related_ids: _related_ids, ...taskWithoutRelationships } = task;
  return taskWithoutRelationships as DartTask;
}

/**
 * Handle get_task tool calls
 *
 * Flow:
 * 1. Validate dart_id is provided
 * 2. Call DartClient.getTask()
 * 3. Generate deep link URL
 * 4. Optionally fetch comments (if include_comments=true)
 * 5. Calculate relationship counts (if include_relationships=true, default)
 * 6. Optionally fetch expanded relationships (if expand_relationships=true)
 * 7. Return GetTaskOutput with task, url, and optional comments/relationships
 *
 * @param input - GetTaskInput with dart_id and optional include_comments, include_relationships, expand_relationships
 * @returns GetTaskOutput with task details, url, and optional comments/relationships
 * @throws DartAPIError with 404 status if task not found
 */
export async function handleGetTask(input: GetTaskInput): Promise<GetTaskOutput> {
  const DART_TOKEN = process.env.DART_TOKEN;

  if (!DART_TOKEN) {
    throw new DartAPIError(
      'DART_TOKEN environment variable is required. Get your token from: https://app.dartai.com/?settings=account',
      401
    );
  }

  // ============================================================================
  // Step 1: Validate input and dart_id
  // ============================================================================
  if (!input || typeof input !== 'object') {
    throw new DartAPIError(
      'input is required and must be an object',
      400
    );
  }

  if (!input.dart_id || typeof input.dart_id !== 'string' || input.dart_id.trim() === '') {
    throw new DartAPIError(
      'dart_id is required and must be a non-empty string',
      400
    );
  }

  // Default include_relationships to true
  const includeRelationships = input.include_relationships !== false;
  const expandRelationships = input.expand_relationships === true;

  // ============================================================================
  // Step 2: Call DartClient.getTask()
  // ============================================================================
  const client = new DartClient({ token: DART_TOKEN });

  let task: DartTask;
  try {
    task = await client.getTask(input.dart_id);
  } catch (error) {
    // Handle 404 errors specifically
    if (error instanceof DartAPIError && error.statusCode === 404) {
      throw new DartAPIError(
        `Task not found: No task with dart_id "${input.dart_id}" exists in workspace`,
        404,
        error.response
      );
    }
    // Re-throw other errors with enhanced context
    if (error instanceof DartAPIError) {
      throw new DartAPIError(
        `Failed to retrieve task: ${error.message}`,
        error.statusCode,
        error.response
      );
    }
    throw error;
  }

  // ============================================================================
  // Step 3: Generate deep link URL
  // ============================================================================
  const deepLinkUrl = `https://app.dartai.com/task/${task.dart_id}`;

  // ============================================================================
  // Step 4: Optionally fetch comments
  // ============================================================================
  let comments: DartComment[] | undefined;

  if (input.include_comments) {
    // TODO: Implement comment fetching when API endpoint is available
    // For now, return empty array as placeholder
    comments = [];

    // Note: Once Dart API exposes /tasks/{dart_id}/comments endpoint:
    // try {
    //   comments = await client.getTaskComments(task.dart_id);
    // } catch (error) {
    //   // Log error but don't fail the entire request if comment fetch fails
    //   console.error(`Failed to fetch comments for task ${task.dart_id}:`, error);
    //   comments = [];
    // }
  }

  // ============================================================================
  // Step 5: Build output with relationship information
  // ============================================================================
  const output: GetTaskOutput = {
    // If include_relationships is false, strip the relationship fields from task
    task: includeRelationships ? task : stripRelationshipFields(task),
    url: deepLinkUrl,
  };

  // Only include comments field if include_comments was requested
  if (input.include_comments) {
    output.comments = comments;
  }

  // ============================================================================
  // Step 6: Add relationship counts and expanded relationships
  // ============================================================================
  if (includeRelationships) {
    // Always include relationship counts when relationships are included
    output.relationship_counts = calculateRelationshipCounts(task);

    // Optionally fetch expanded relationships (titles for related tasks)
    if (expandRelationships) {
      output.expanded_relationships = await fetchExpandedRelationships(client, task);
    }
  }

  return output;
}
