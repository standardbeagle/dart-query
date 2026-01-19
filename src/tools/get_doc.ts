/**
 * get_doc Tool Handler
 *
 * Retrieves a single document by doc_id with full text content.
 * Returns document details with deep link URL.
 */

import { DartClient } from '../api/dartClient.js';
import {
  DartAPIError,
  DartDoc,
  GetDocInput,
  GetDocOutput,
} from '../types/index.js';

/**
 * Handle get_doc tool calls
 *
 * Flow:
 * 1. Validate doc_id is provided
 * 2. Call DartClient.getDoc()
 * 3. Generate deep link URL
 * 4. Return GetDocOutput with doc and url
 *
 * @param input - GetDocInput with doc_id
 * @returns GetDocOutput with document details and url
 * @throws DartAPIError with 404 status if document not found
 */
export async function handleGetDoc(input: GetDocInput): Promise<GetDocOutput> {
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
  // Step 2: Call DartClient.getDoc()
  // ============================================================================
  const client = new DartClient({ token: DART_TOKEN });

  let doc: DartDoc;
  try {
    doc = await client.getDoc(input.doc_id);
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
        `Failed to retrieve document: ${error.message}`,
        error.statusCode,
        error.response
      );
    }
    throw error;
  }

  // ============================================================================
  // Step 3: Generate deep link URL
  // ============================================================================
  const deepLinkUrl = `https://app.dartai.com/doc/${doc.doc_id}`;

  // ============================================================================
  // Step 4: Return output
  // ============================================================================
  return {
    doc,
    url: deepLinkUrl,
  };
}
