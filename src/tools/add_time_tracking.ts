/**
 * add_time_tracking Tool Handler
 *
 * Adds a time tracking entry to a task.
 * Supports started_at/finished_at timestamps or duration_minutes.
 */

import { DartClient } from '../api/dartClient.js';
import {
  AddTimeTrackingInput,
  AddTimeTrackingOutput,
  DartAPIError,
  ValidationError,
} from '../types/index.js';

// ISO8601 date pattern
const ISO8601_PATTERN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/;

/**
 * Handle add_time_tracking tool calls
 *
 * @param input - AddTimeTrackingInput with task_id and time entry details
 * @returns AddTimeTrackingOutput with created entry
 */
export async function handleAddTimeTracking(input: AddTimeTrackingInput): Promise<AddTimeTrackingOutput> {
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

  if (!input.dart_id || typeof input.dart_id !== 'string' || input.dart_id.trim() === '') {
    throw new ValidationError('dart_id is required and must be a non-empty string', 'dart_id');
  }

  if (!input.started_at || typeof input.started_at !== 'string') {
    throw new ValidationError('started_at is required and must be an ISO8601 string', 'started_at');
  }

  if (!ISO8601_PATTERN.test(input.started_at)) {
    throw new ValidationError(
      'started_at must be a valid ISO8601 date (e.g., 2026-01-25T10:00:00Z)',
      'started_at'
    );
  }

  if (input.finished_at !== undefined) {
    if (typeof input.finished_at !== 'string' || !ISO8601_PATTERN.test(input.finished_at)) {
      throw new ValidationError(
        'finished_at must be a valid ISO8601 date if provided',
        'finished_at'
      );
    }
  }

  if (input.duration_minutes !== undefined) {
    if (typeof input.duration_minutes !== 'number' || input.duration_minutes < 0) {
      throw new ValidationError(
        'duration_minutes must be a non-negative number if provided',
        'duration_minutes'
      );
    }
  }

  const client = new DartClient({ token: DART_TOKEN });

  const result = await client.addTimeTracking({
    dart_id: input.dart_id.trim(),
    started_at: input.started_at,
    finished_at: input.finished_at,
    duration_minutes: input.duration_minutes,
    note: input.note,
  });

  return {
    entry: {
      entry_id: result.entry_id,
      dart_id: result.dart_id,
      started_at: result.started_at,
      finished_at: result.finished_at,
      duration_minutes: result.duration_minutes,
      note: result.note,
    },
    task_id: input.dart_id.trim(),
    url: `https://app.dartai.com/task/${input.dart_id.trim()}`,
  };
}
