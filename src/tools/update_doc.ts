/**
 * update_doc Tool Handler
 *
 * Updates an existing document with partial field updates.
 * Validates doc_id exists, validates folder references, and only sends changed fields.
 */

import { DartClient } from '../api/dartClient.js';
import { handleGetConfig } from './get_config.js';
import {
  UpdateDocInput,
  UpdateDocOutput,
  DartAPIError,
  ValidationError,
  DartConfig,
  findFolder,
  getFolderNames,
} from '../types/index.js';

/**
 * Handle update_doc tool calls
 *
 * Flow:
 * 1. Validate doc_id is provided
 * 2. Validate updates object is non-empty
 * 3. Validate folder reference (if updating folder)
 * 4. Resolve folder name to folder_id if needed
 * 5. Call DartClient.updateDoc()
 * 6. Track which fields were updated
 * 7. Generate deep link URL
 * 8. Return UpdateDocOutput
 *
 * @param input - UpdateDocInput with doc_id and updates
 * @returns UpdateDocOutput with updated_fields, doc, and url
 * @throws DartAPIError with 404 status if document not found
 */
export async function handleUpdateDoc(input: UpdateDocInput): Promise<UpdateDocOutput> {
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
  // Step 2: Validate updates object
  // ============================================================================
  if (!input.updates || typeof input.updates !== 'object') {
    throw new ValidationError(
      'updates is required and must be an object',
      'updates'
    );
  }

  const updateKeys = Object.keys(input.updates);
  if (updateKeys.length === 0) {
    throw new ValidationError(
      'updates must contain at least one field to update',
      'updates'
    );
  }

  // ============================================================================
  // Step 3: Validate folder reference (if updating folder)
  // ============================================================================
  let resolvedFolder: string | undefined;

  if (input.updates.folder !== undefined) {
    if (input.updates.folder === null || input.updates.folder === '') {
      // Allow clearing folder
      resolvedFolder = input.updates.folder as string | undefined;
    } else if (typeof input.updates.folder === 'string') {
      // Validate folder exists
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

      if (!config.folders || config.folders.length === 0) {
        throw new ValidationError(
          'No folders found in workspace configuration. Create a folder first in Dart AI.',
          'folder'
        );
      }

      const folder = findFolder(config.folders, input.updates.folder);

      if (!folder) {
        const folderNames = getFolderNames(config.folders);
        const availableFolders = folderNames.join(', ');
        throw new ValidationError(
          `Invalid folder: "${input.updates.folder}" not found in workspace. Available folders: ${availableFolders}`,
          'folder',
          folderNames
        );
      }

      resolvedFolder = folder.dart_id;
    } else {
      // Invalid type for folder
      throw new ValidationError(
        `folder must be a string or null (received: ${typeof input.updates.folder})`,
        'folder'
      );
    }
  }

  // ============================================================================
  // Step 4: Validate title and text (if provided)
  // ============================================================================
  if (input.updates.title !== undefined) {
    if (typeof input.updates.title !== 'string' || input.updates.title.trim() === '') {
      throw new ValidationError(
        'title must be a non-empty string',
        'title'
      );
    }
  }

  if (input.updates.text !== undefined) {
    if (typeof input.updates.text !== 'string') {
      throw new ValidationError(
        'text must be a string',
        'text'
      );
    }
  }

  // ============================================================================
  // Step 5: Build updates object with resolved references
  // ============================================================================
  const resolvedUpdates: { title?: string; text?: string; folder?: string } = {};
  const updatedFields: string[] = [];

  if (input.updates.title !== undefined) {
    resolvedUpdates.title = input.updates.title;
    updatedFields.push('title');
  }

  if (input.updates.text !== undefined) {
    resolvedUpdates.text = input.updates.text;
    updatedFields.push('text');
  }

  if (input.updates.folder !== undefined) {
    resolvedUpdates.folder = resolvedFolder;
    updatedFields.push('folder');
  }

  // ============================================================================
  // Step 6: Call DartClient.updateDoc()
  // ============================================================================
  const client = new DartClient({ token: DART_TOKEN });

  let updatedDoc;
  try {
    updatedDoc = await client.updateDoc({
      doc_id: input.doc_id,
      updates: resolvedUpdates,
    });
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
        `Failed to update document: ${error.message}`,
        error.statusCode,
        error.response
      );
    }
    throw error;
  }

  // ============================================================================
  // Step 7: Generate deep link URL and return output
  // ============================================================================
  const deepLinkUrl = `https://app.dartai.com/doc/${updatedDoc.doc_id}`;

  return {
    doc_id: updatedDoc.doc_id,
    updated_fields: updatedFields,
    doc: updatedDoc,
    url: deepLinkUrl,
  };
}
