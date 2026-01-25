/**
 * move_task Tool Handler
 *
 * Repositions a task within a dartboard or moves it to a different dartboard.
 * Supports positioning by order index or relative to another task.
 */

import { DartClient } from '../api/dartClient.js';
import { handleGetConfig } from './get_config.js';
import {
  MoveTaskInput,
  MoveTaskOutput,
  DartAPIError,
  ValidationError,
  findDartboard,
  getDartboardNames,
} from '../types/index.js';

/**
 * Handle move_task tool calls
 *
 * @param input - MoveTaskInput with dart_id and positioning options
 * @returns MoveTaskOutput with updated task and URL
 */
export async function handleMoveTask(input: MoveTaskInput): Promise<MoveTaskOutput> {
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

  // At least one positioning option should be provided
  if (input.dartboard === undefined && input.order === undefined &&
      input.after_id === undefined && input.before_id === undefined) {
    throw new ValidationError(
      'At least one of dartboard, order, after_id, or before_id must be provided',
      'positioning'
    );
  }

  // Validate dartboard if provided
  let resolvedDartboard: string | undefined;
  if (input.dartboard !== undefined) {
    const config = await handleGetConfig({ cache_bust: false });
    const dartboard = findDartboard(config.dartboards, input.dartboard);

    if (!dartboard) {
      const dartboardNames = getDartboardNames(config.dartboards);
      throw new ValidationError(
        `Invalid dartboard: "${input.dartboard}" not found. Available: ${dartboardNames.slice(0, 5).join(', ')}`,
        'dartboard',
        dartboardNames
      );
    }
    resolvedDartboard = typeof dartboard === 'string' ? dartboard : dartboard.dart_id;
  }

  const client = new DartClient({ token: DART_TOKEN });

  const task = await client.moveTask({
    dart_id: input.dart_id.trim(),
    dartboard: resolvedDartboard,
    order: input.order,
    after_id: input.after_id,
    before_id: input.before_id,
  });

  return {
    dart_id: task.dart_id,
    dartboard: task.dartboard || resolvedDartboard || '',
    task,
    url: `https://app.dartai.com/task/${task.dart_id}`,
  };
}
