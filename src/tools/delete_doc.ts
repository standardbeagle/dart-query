/**
 * delete_doc Tool Handler
 *
 * Deletes a document (moves to trash - recoverable via Dart web UI).
 * Returns confirmation with recoverability information.
 */

import { DartClient } from '../api/dartClient.js';
import {
  DartAPIError,
  DeleteDocInput,
  DeleteDocOutput,
} from '../types/index.js';

/**
 * Handle delete_doc tool calls
 *
 * Flow:
 * 1. Validate doc_id is provided
 * 2. Call DartClient.deleteDoc()
 * 3. Return DeleteDocOutput with deletion confirmation
 *
 * @param input - DeleteDocInput with doc_id
 * @returns DeleteDocOutput with deleted status and recoverability info
 * @throws DartAPIError with 404 status if document not found
 */
export async function handleDeleteDoc(input: DeleteDocInput): Promise<DeleteDocOutput> {
  const DART_TOKEN = process.env.DART_TOKEN;

  if (!DART_TOKEN) {
    throw new DartAPIError(
      'DART_TOKEN environment variable is required. Get your token from: https://app.dartai.com/?settings=account',
      401
    );
  }

  // ============================================================================
  // Step 1: Validate input and doc_id
  // ============================================================================
  if (!input || typeof input !== 'object') {
    throw new DartAPIError(
      'input is required and must be an object',
      400
    );
  }

  if (!input.doc_id || typeof input.doc_id !== 'string' || input.doc_id.trim() === '') {
    throw new DartAPIError(
      'doc_id is required and must be a non-empty string',
      400
    );
  }

  // ============================================================================
  // Step 2: Call DartClient.deleteDoc()
  // ============================================================================
  const client = new DartClient({ token: DART_TOKEN });

  let result: { success: boolean; doc_id: string };
  try {
    result = await client.deleteDoc(input.doc_id);
  } catch (error) {
    // Handle 404 errors specifically
    if (error instanceof DartAPIError && error.statusCode === 404) {
      throw new DartAPIError(
        `Document not found: No document with doc_id "${input.doc_id}" exists in workspace`,
        404,
        error.response
      );
    }
    // Re-throw other errors with enhanced context
    if (error instanceof DartAPIError) {
      throw new DartAPIError(
        `Failed to delete document: ${error.message}`,
        error.statusCode,
        error.response
      );
    }
    throw error;
  }

  // ============================================================================
  // Step 3: Return output with recoverability information
  // ============================================================================
  return {
    doc_id: result.doc_id,
    deleted: result.success,
    recoverable: true, // Documents move to trash (recoverable via web UI)
    message: `Document "${result.doc_id}" moved to trash. Recoverable via Dart web UI: https://app.dartai.com/trash`,
  };
}
