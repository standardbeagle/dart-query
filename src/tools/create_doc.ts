/**
 * create_doc Tool Handler
 *
 * Creates a new document in Dart AI with title, text (markdown), and optional folder.
 * Validates folder references and generates deep link URLs.
 */

import { DartClient } from '../api/dartClient.js';
import { handleGetConfig } from './get_config.js';
import {
  CreateDocInput,
  CreateDocOutput,
  DartAPIError,
  ValidationError,
  DartConfig,
} from '../types/index.js';

/**
 * Handle create_doc tool calls
 *
 * Flow:
 * 1. Validate required fields (title, text)
 * 2. Get workspace config for folder validation (if folder provided)
 * 3. Validate folder exists (if provided)
 * 4. Resolve folder name to folder_id if needed
 * 5. Call DartClient.createDoc()
 * 6. Generate deep link URL
 * 7. Return CreateDocOutput
 *
 * @param input - CreateDocInput with doc details
 * @returns CreateDocOutput with doc_id, title, url, created_at, all_fields
 */
export async function handleCreateDoc(input: CreateDocInput): Promise<CreateDocOutput> {
  const DART_TOKEN = process.env.DART_TOKEN;

  if (!DART_TOKEN) {
    throw new DartAPIError(
      'DART_TOKEN environment variable is required. Get your token from: https://app.dartai.com/?settings=account',
      401
    );
  }

  // ============================================================================
  // Step 1: Validate required fields
  // ============================================================================
  if (!input.title || typeof input.title !== 'string' || input.title.trim() === '') {
    throw new ValidationError(
      'title is required and must be a non-empty string',
      'title'
    );
  }

  if (!input.text || typeof input.text !== 'string') {
    throw new ValidationError(
      'text is required and must be a string (markdown supported)',
      'text'
    );
  }

  // ============================================================================
  // Step 2: Validate folder reference (if provided)
  // ============================================================================
  let resolvedFolder: string | undefined;

  if (input.folder) {
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

    // Check if folder exists
    if (!config.folders || config.folders.length === 0) {
      throw new ValidationError(
        'No folders found in workspace configuration. Create a folder first in Dart AI.',
        'folder'
      );
    }

    const folderExists = config.folders.includes(input.folder);

    if (!folderExists) {
      const availableFolders = config.folders.join(', ');
      throw new ValidationError(
        `Invalid folder: "${input.folder}" not found in workspace. Available folders: ${availableFolders}`,
        'folder',
        config.folders
      );
    }

    resolvedFolder = input.folder;
  }

  // ============================================================================
  // Step 3: Call DartClient.createDoc()
  // ============================================================================
  const client = new DartClient({ token: DART_TOKEN });

  const docInput: { title: string; text: string; folder?: string } = {
    title: input.title,
    text: input.text,
  };

  if (resolvedFolder) {
    docInput.folder = resolvedFolder;
  }

  let createdDoc;
  try {
    createdDoc = await client.createDoc(docInput);
  } catch (error) {
    if (error instanceof DartAPIError) {
      throw new DartAPIError(
        `Failed to create document: ${error.message}`,
        error.statusCode,
        error.response
      );
    }
    throw error;
  }

  // ============================================================================
  // Step 4: Generate deep link URL and return output
  // ============================================================================
  const deepLinkUrl = `https://app.dartai.com/doc/${createdDoc.doc_id}`;

  return {
    doc_id: createdDoc.doc_id,
    title: createdDoc.title,
    url: deepLinkUrl,
    created_at: createdDoc.created_at,
    all_fields: createdDoc,
  };
}
