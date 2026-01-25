/**
 * add_task_comment Tool Handler
 *
 * Add a comment to a task with markdown support.
 * Simple append operation for AI rationale, status updates, and notes.
 */

import { DartClient } from '../api/dartClient.js';
import {
  AddTaskCommentInput,
  AddTaskCommentOutput,
  DartAPIError,
  ValidationError,
} from '../types/index.js';

/**
 * Add a comment to a task
 *
 * Features:
 * - Validates dart_id exists (404 error handling)
 * - Validates text is non-empty
 * - Supports markdown formatting
 * - Returns complete comment with author info and timestamp
 *
 * @param input - Comment input with dart_id and text
 * @returns Comment details with comment_id, dart_id, text, author, created_at
 * @throws ValidationError for invalid inputs
 * @throws DartAPIError for API errors (404 if task not found)
 */
export async function handleAddTaskComment(
  input: unknown
): Promise<AddTaskCommentOutput> {
  const DART_TOKEN = process.env.DART_TOKEN;

  if (!DART_TOKEN) {
    throw new DartAPIError(
      'DART_TOKEN environment variable is required. Get your token from: https://app.dartai.com/?settings=account',
      401
    );
  }

  // Defensive input validation
  if (!input || typeof input !== 'object') {
    throw new ValidationError('Input must be a non-null object');
  }

  const typedInput = input as Partial<AddTaskCommentInput>;

  // Validate dart_id
  if (!typedInput.dart_id || typeof typedInput.dart_id !== 'string') {
    throw new ValidationError(
      'dart_id is required and must be a non-empty string',
      'dart_id'
    );
  }

  const dartId = typedInput.dart_id.trim();
  if (!dartId) {
    throw new ValidationError(
      'dart_id cannot be empty or whitespace-only',
      'dart_id'
    );
  }

  // Validate text
  if (!typedInput.text || typeof typedInput.text !== 'string') {
    throw new ValidationError(
      'text is required and must be a non-empty string',
      'text'
    );
  }

  // Validate text is not empty/whitespace-only, but preserve original formatting
  if (typedInput.text.trim() === '') {
    throw new ValidationError(
      'text cannot be empty or whitespace-only',
      'text'
    );
  }

  const dartClient = new DartClient({ token: DART_TOKEN });

  try {
    // Call DartClient.addComment() - use original text to preserve formatting
    const comment = await dartClient.addComment(dartId, typedInput.text);

    // Return structured output
    return {
      comment_id: comment.comment_id,
      dart_id: comment.dart_id,
      text: comment.text,
      author: comment.author,
      created_at: comment.created_at,
    };
  } catch (error) {
    // Enhanced error handling for 404 (task not found)
    if (error instanceof DartAPIError && error.statusCode === 404) {
      throw new DartAPIError(
        `Task not found: dart_id '${dartId}' does not exist. Check the dart_id or use list_tasks to find valid tasks.`,
        404
      );
    }

    // Re-throw other errors
    throw error;
  }
}
