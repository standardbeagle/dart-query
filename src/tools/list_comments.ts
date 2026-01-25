/**
 * list_comments Tool Handler
 *
 * Lists comments on a task with pagination support.
 * Token-efficient: returns minimal comment data with pagination info.
 */

import { DartClient } from '../api/dartClient.js';
import {
  ListCommentsInput,
  ListCommentsOutput,
  DartComment,
  DartAPIError,
  ValidationError,
} from '../types/index.js';

/**
 * Handle list_comments tool calls
 *
 * @param input - ListCommentsInput with task_id and pagination options
 * @returns ListCommentsOutput with comments array and pagination metadata
 */
export async function handleListComments(input: ListCommentsInput): Promise<ListCommentsOutput> {
  const DART_TOKEN = process.env.DART_TOKEN;

  if (!DART_TOKEN) {
    throw new DartAPIError(
      'DART_TOKEN environment variable is required. Get your token from: https://app.dartai.com/?settings=account',
      401
    );
  }

  // Validate input
  if (!input || typeof input !== 'object') {
    throw new ValidationError('Input must be an object', 'input');
  }

  if (!input.task_id || typeof input.task_id !== 'string' || input.task_id.trim() === '') {
    throw new ValidationError('task_id is required and must be a non-empty string', 'task_id');
  }

  // Validate pagination params
  const limit = input.limit ?? 50;
  if (typeof limit !== 'number' || limit < 1 || limit > 100) {
    throw new ValidationError('limit must be a number between 1 and 100', 'limit');
  }

  const offset = input.offset ?? 0;
  if (typeof offset !== 'number' || offset < 0) {
    throw new ValidationError('offset must be a non-negative number', 'offset');
  }

  const client = new DartClient({ token: DART_TOKEN });

  const result = await client.listComments({
    task_id: input.task_id.trim(),
    limit,
    offset,
  });

  const returnedCount = result.comments.length;
  const hasMore = (offset + returnedCount) < result.total;

  // Map to DartComment type
  const comments: DartComment[] = result.comments.map(c => ({
    comment_id: c.comment_id,
    text: c.text,
    author: c.author,
    created_at: c.created_at,
    parent_id: c.parent_id,
  }));

  return {
    comments,
    total_count: result.total,
    returned_count: returnedCount,
    has_more: hasMore,
    next_offset: hasMore ? offset + returnedCount : null,
    task_id: input.task_id.trim(),
  };
}
