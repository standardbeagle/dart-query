/**
 * list_docs Tool Handler
 *
 * Lists documents with optional filtering by folder, title, and text content.
 * Supports pagination and returns comprehensive doc information.
 */

import { DartClient } from '../api/dartClient.js';
import { handleGetConfig } from './get_config.js';
import {
  ListDocsInput,
  ListDocsOutput,
  DartAPIError,
  ValidationError,
  DartConfig,
} from '../types/index.js';

/**
 * Handle list_docs tool calls
 *
 * Flow:
 * 1. Validate input parameters (limit, offset, folder)
 * 2. Get workspace config for folder validation (if folder filter provided)
 * 3. Resolve folder name to folder_id if needed
 * 4. Call DartClient.listDocs() with filters
 * 5. Calculate pagination metadata
 * 6. Return ListDocsOutput with docs and pagination info
 *
 * @param input - ListDocsInput with optional filters
 * @returns ListDocsOutput with docs array and pagination metadata
 */
export async function handleListDocs(input?: ListDocsInput): Promise<ListDocsOutput> {
  const DART_TOKEN = process.env.DART_TOKEN;

  if (!DART_TOKEN) {
    throw new DartAPIError(
      'DART_TOKEN environment variable is required. Get your token from: https://app.dartai.com/?settings=account',
      401
    );
  }

  // ============================================================================
  // Step 1: Defensive input handling and validation
  // ============================================================================
  const safeInput = input || {};

  // Validate limit (default 50, max 500)
  let limit = safeInput.limit !== undefined ? safeInput.limit : 50;
  if (typeof limit !== 'number' || limit < 1 || limit > 500) {
    throw new ValidationError(
      `limit must be a number between 1 and 500 (received: ${limit})`,
      'limit'
    );
  }

  // Validate offset (default 0, non-negative)
  let offset = safeInput.offset !== undefined ? safeInput.offset : 0;
  if (typeof offset !== 'number' || offset < 0) {
    throw new ValidationError(
      `offset must be a non-negative number (received: ${offset})`,
      'offset'
    );
  }

  // ============================================================================
  // Step 2: Validate folder reference (if provided)
  // ============================================================================
  let resolvedFolder: string | undefined;

  if (safeInput.folder) {
    // Get config to validate folder reference
    let config: DartConfig;
    try {
      config = await handleGetConfig({ cache_bust: false });
    } catch (error) {
      if (error instanceof DartAPIError) {
        throw new DartAPIError(
          `Failed to retrieve workspace config for folder validation: ${error.message}`,
          error.statusCode,
          error.response
        );
      }
      throw error;
    }

    // Check if folder exists (by dart_id or name)
    if (!config.folders || config.folders.length === 0) {
      throw new ValidationError(
        'No folders found in workspace configuration. Create a folder first in Dart AI.',
        'folder'
      );
    }

    const folderExists = config.folders.includes(safeInput.folder);

    if (!folderExists) {
      const availableFolders = config.folders.join(', ');
      throw new ValidationError(
        `Invalid folder: "${safeInput.folder}" not found in workspace. Available folders: ${availableFolders}`,
        'folder',
        config.folders
      );
    }

    resolvedFolder = safeInput.folder;
  }

  // ============================================================================
  // Step 3: Call DartClient.listDocs()
  // ============================================================================
  const client = new DartClient({ token: DART_TOKEN });

  const apiInput: {
    folder?: string;
    title_contains?: string;
    text_contains?: string;
    limit: number;
    offset: number;
  } = {
    limit,
    offset,
  };

  if (resolvedFolder) {
    apiInput.folder = resolvedFolder;
  }

  // Validate title_contains is non-empty string if provided
  if (safeInput.title_contains !== undefined) {
    if (typeof safeInput.title_contains !== 'string') {
      throw new ValidationError(
        'title_contains must be a string',
        'title_contains'
      );
    }
    if (safeInput.title_contains.trim() !== '') {
      apiInput.title_contains = safeInput.title_contains;
    }
    // Silently ignore empty/whitespace-only strings
  }

  // Validate text_contains is non-empty string if provided
  if (safeInput.text_contains !== undefined) {
    if (typeof safeInput.text_contains !== 'string') {
      throw new ValidationError(
        'text_contains must be a string',
        'text_contains'
      );
    }
    if (safeInput.text_contains.trim() !== '') {
      apiInput.text_contains = safeInput.text_contains;
    }
    // Silently ignore empty/whitespace-only strings
  }

  let apiResponse: { docs: DartAPIDoc[]; total: number };
  try {
    apiResponse = await client.listDocs(apiInput);
  } catch (error) {
    if (error instanceof DartAPIError) {
      throw new DartAPIError(
        `Failed to list documents: ${error.message}`,
        error.statusCode,
        error.response
      );
    }
    throw error;
  }

  // ============================================================================
  // Step 4: Calculate pagination metadata
  // ============================================================================
  const returnedCount = apiResponse.docs.length;
  const totalCount = apiResponse.total;
  const hasMore = (offset + returnedCount) < totalCount;
  const nextOffset = hasMore ? offset + returnedCount : null;

  // ============================================================================
  // Step 5: Build filters_applied object for transparency
  // ============================================================================
  const filtersApplied: Record<string, unknown> = {
    limit,
    offset,
  };

  if (resolvedFolder) {
    filtersApplied.folder = resolvedFolder;
  }

  if (safeInput.title_contains) {
    filtersApplied.title_contains = safeInput.title_contains;
  }

  if (safeInput.text_contains) {
    filtersApplied.text_contains = safeInput.text_contains;
  }

  // ============================================================================
  // Step 6: Return output
  // ============================================================================
  return {
    docs: apiResponse.docs,
    total_count: totalCount,
    returned_count: returnedCount,
    has_more: hasMore,
    next_offset: nextOffset,
    filters_applied: filtersApplied,
  };
}

// Import DartDoc type from types (avoiding circular dependency)
import type { DartDoc as DartAPIDoc } from '../types/index.js';
