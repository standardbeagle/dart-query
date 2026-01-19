/**
 * get_task Tool Handler
 *
 * Retrieves a single task by dart_id with optional comment inclusion.
 * Returns task details with deep link URL.
 */

import { DartClient } from '../api/dartClient.js';
import {
  DartAPIError,
  DartTask,
  DartComment,
  GetTaskInput,
  GetTaskOutput,
} from '../types/index.js';

/**
 * Handle get_task tool calls
 *
 * Flow:
 * 1. Validate dart_id is provided
 * 2. Call DartClient.getTask()
 * 3. Generate deep link URL
 * 4. Optionally fetch comments (if include_comments=true)
 * 5. Return GetTaskOutput with task, url, and optional comments
 *
 * @param input - GetTaskInput with dart_id and optional include_comments
 * @returns GetTaskOutput with task details, url, and optional comments
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
  // Step 5: Return output
  // ============================================================================
  const output: GetTaskOutput = {
    task,
    url: deepLinkUrl,
  };

  // Only include comments field if include_comments was requested
  if (input.include_comments) {
    output.comments = comments;
  }

  return output;
}
