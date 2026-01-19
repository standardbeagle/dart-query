/**
 * delete_task Tool Handler
 *
 * Deletes a task by dart_id (moves to trash - recoverable).
 * The task can be restored from the Dart web UI trash.
 */

import { DartClient } from '../api/dartClient.js';
import {
  DartAPIError,
  ValidationError,
  DeleteTaskInput,
  DeleteTaskOutput,
} from '../types/index.js';

/**
 * Handle delete_task tool calls
 *
 * Flow:
 * 1. Validate dart_id is provided
 * 2. Call DartClient.deleteTask()
 * 3. Return DeleteTaskOutput with deletion confirmation
 *
 * Note: Dart AI moves deleted tasks to trash (recoverable via web UI)
 * rather than permanent deletion. This provides a safety net for
 * accidental deletions.
 *
 * @param input - DeleteTaskInput with dart_id
 * @returns DeleteTaskOutput with deletion status and recoverability info
 * @throws DartAPIError with 404 if task not found
 */
export async function handleDeleteTask(input: DeleteTaskInput): Promise<DeleteTaskOutput> {
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
    throw new ValidationError(
      'input is required and must be an object',
      'input'
    );
  }

  if (!input.dart_id || typeof input.dart_id !== 'string' || input.dart_id.trim() === '') {
    throw new ValidationError(
      'dart_id is required and must be a non-empty string',
      'dart_id'
    );
  }

  // ============================================================================
  // Step 2: Call DartClient.deleteTask()
  // ============================================================================
  const client = new DartClient({ token: DART_TOKEN });

  let deleteResult: { success: boolean; dart_id: string };
  try {
    deleteResult = await client.deleteTask(input.dart_id);
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
        `Failed to delete task: ${error.message}`,
        error.statusCode,
        error.response
      );
    }
    throw error;
  }

  // ============================================================================
  // Step 3: Return deletion confirmation
  // ============================================================================
  return {
    dart_id: deleteResult.dart_id,
    deleted: true,
    recoverable: true,
    message: `Task "${input.dart_id}" has been moved to trash. You can restore it from the Dart web UI at https://app.dartai.com/`,
  };
}
