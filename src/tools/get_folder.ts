/**
 * get_folder Tool Handler
 *
 * Retrieves details about a specific folder.
 * Token-efficient: returns minimal folder info.
 */

import { DartClient } from '../api/dartClient.js';
import { handleGetConfig } from './get_config.js';
import {
  GetFolderInput,
  GetFolderOutput,
  DartAPIError,
  ValidationError,
  findFolder,
  getFolderNames,
} from '../types/index.js';

/**
 * Handle get_folder tool calls
 *
 * @param input - GetFolderInput with folder_id (dart_id or name)
 * @returns GetFolderOutput with folder details
 */
export async function handleGetFolder(input: GetFolderInput): Promise<GetFolderOutput> {
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

  if (!input.folder_id || typeof input.folder_id !== 'string' || input.folder_id.trim() === '') {
    throw new ValidationError('folder_id is required and must be a non-empty string', 'folder_id');
  }

  // Resolve folder name to dart_id if needed
  const config = await handleGetConfig({ cache_bust: false });

  if (!config.folders || config.folders.length === 0) {
    throw new ValidationError(
      'No folders found in workspace. Create a folder first in Dart AI.',
      'folder_id'
    );
  }

  const folder = findFolder(config.folders, input.folder_id.trim());

  if (!folder) {
    const folderNames = getFolderNames(config.folders);
    throw new ValidationError(
      `Folder "${input.folder_id}" not found. Available: ${folderNames.slice(0, 5).join(', ')}${folderNames.length > 5 ? '...' : ''}`,
      'folder_id',
      folderNames
    );
  }

  const client = new DartClient({ token: DART_TOKEN });

  try {
    const result = await client.getFolder(folder.dart_id);

    return {
      dart_id: result.dart_id,
      name: result.name || folder.name,
      doc_count: result.doc_count,
      url: `https://app.dartai.com/folder/${result.dart_id}`,
    };
  } catch (error) {
    // If API call fails, return basic info from config
    if (error instanceof DartAPIError && error.statusCode === 404) {
      return {
        dart_id: folder.dart_id,
        name: folder.name,
        url: `https://app.dartai.com/folder/${folder.dart_id}`,
      };
    }
    throw error;
  }
}
