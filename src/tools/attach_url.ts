/**
 * attach_url Tool Handler
 *
 * Attaches a file from a URL to a task.
 * The URL must be publicly accessible for Dart to fetch the file.
 */

import { DartClient } from '../api/dartClient.js';
import {
  AttachUrlInput,
  AttachUrlOutput,
  DartAPIError,
  ValidationError,
} from '../types/index.js';

// Basic URL validation pattern
const URL_PATTERN = /^https?:\/\/.+/i;

/**
 * Handle attach_url tool calls
 *
 * @param input - AttachUrlInput with task dart_id and URL
 * @returns AttachUrlOutput with attachment details
 */
export async function handleAttachUrl(input: AttachUrlInput): Promise<AttachUrlOutput> {
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

  if (!input.url || typeof input.url !== 'string' || input.url.trim() === '') {
    throw new ValidationError('url is required and must be a non-empty string', 'url');
  }

  if (!URL_PATTERN.test(input.url.trim())) {
    throw new ValidationError(
      'url must be a valid HTTP or HTTPS URL',
      'url'
    );
  }

  if (input.filename !== undefined && typeof input.filename !== 'string') {
    throw new ValidationError('filename must be a string if provided', 'filename');
  }

  const client = new DartClient({ token: DART_TOKEN });

  const result = await client.attachUrl({
    dart_id: input.dart_id.trim(),
    url: input.url.trim(),
    filename: input.filename,
  });

  return {
    attachment_id: result.attachment_id,
    dart_id: result.dart_id,
    url: result.url,
    filename: result.filename,
    task_url: `https://app.dartai.com/task/${input.dart_id.trim()}`,
  };
}
