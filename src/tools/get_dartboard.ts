/**
 * get_dartboard Tool Handler
 *
 * Retrieves details about a specific dartboard.
 * Token-efficient: returns minimal dartboard info.
 */

import { DartClient } from '../api/dartClient.js';
import { handleGetConfig } from './get_config.js';
import {
  GetDartboardInput,
  GetDartboardOutput,
  DartAPIError,
  ValidationError,
  findDartboard,
  getDartboardNames,
} from '../types/index.js';

/**
 * Handle get_dartboard tool calls
 *
 * @param input - GetDartboardInput with dartboard_id (dart_id or name)
 * @returns GetDartboardOutput with dartboard details
 */
export async function handleGetDartboard(input: GetDartboardInput): Promise<GetDartboardOutput> {
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

  if (!input.dartboard_id || typeof input.dartboard_id !== 'string' || input.dartboard_id.trim() === '') {
    throw new ValidationError('dartboard_id is required and must be a non-empty string', 'dartboard_id');
  }

  // Resolve dartboard name to dart_id if needed
  const config = await handleGetConfig({ cache_bust: false });
  const dartboard = findDartboard(config.dartboards, input.dartboard_id.trim());

  if (!dartboard) {
    const dartboardNames = getDartboardNames(config.dartboards);
    throw new ValidationError(
      `Dartboard "${input.dartboard_id}" not found. Available: ${dartboardNames.slice(0, 5).join(', ')}${dartboardNames.length > 5 ? '...' : ''}`,
      'dartboard_id',
      dartboardNames
    );
  }

  const client = new DartClient({ token: DART_TOKEN });

  try {
    const result = await client.getDartboard(dartboard.dart_id);

    return {
      dart_id: result.dart_id,
      name: result.name || dartboard.name,
      description: result.description,
      task_count: result.task_count,
      url: `https://app.dartai.com/b/${result.dart_id}`,
    };
  } catch (error) {
    // If API call fails, return basic info from config
    if (error instanceof DartAPIError && error.statusCode === 404) {
      return {
        dart_id: dartboard.dart_id,
        name: dartboard.name,
        url: `https://app.dartai.com/b/${dartboard.dart_id}`,
      };
    }
    throw error;
  }
}
