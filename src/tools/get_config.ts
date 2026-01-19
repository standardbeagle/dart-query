/**
 * get_config Tool Handler
 *
 * Retrieves workspace configuration with caching and optional filtering.
 * This is typically the first API call users make - validates authentication.
 */

import { DartClient } from '../api/dartClient.js';
import { configCache } from '../cache/configCache.js';
import { DartConfig, GetConfigInput, DartAPIError } from '../types/index.js';

/**
 * Handle get_config tool calls
 *
 * Flow:
 * 1. Check cache (unless cache_bust=true)
 * 2. On cache miss, call DartClient.getConfig()
 * 3. Cache the result
 * 4. Apply include filter if specified
 * 5. Add cached_at and cache_ttl_seconds metadata
 * 6. Return filtered config
 *
 * @param input - GetConfigInput with optional cache_bust and include filter
 * @returns DartConfig with metadata
 */
export async function handleGetConfig(input: GetConfigInput): Promise<DartConfig> {
  const DART_TOKEN = process.env.DART_TOKEN;

  if (!DART_TOKEN) {
    throw new DartAPIError(
      'DART_TOKEN environment variable is required. Get your token from: https://app.dartai.com/?settings=account',
      401
    );
  }

  // Initialize Dart API client
  const client = new DartClient({ token: DART_TOKEN });

  let config: DartConfig | undefined;
  let cachedAtTimestamp: string | undefined;

  // Check cache first (unless cache_bust is true)
  if (!input.cache_bust) {
    const cachedConfig = configCache.get();
    if (cachedConfig) {
      config = cachedConfig;
      // Preserve the original cached_at timestamp
      cachedAtTimestamp = cachedConfig.cached_at;
    }
  }

  // Cache miss or cache_bust requested - fetch from API
  if (!config) {
    try {
      config = await client.getConfig();

      // Cache the fresh config with timestamp
      const configWithTimestamp: DartConfig = {
        ...config,
        cached_at: new Date().toISOString(),
        cache_ttl_seconds: configCache.getTTL(),
      };
      configCache.set(configWithTimestamp);

      // Update local reference to include timestamp
      config = configWithTimestamp;
      cachedAtTimestamp = configWithTimestamp.cached_at;
    } catch (error) {
      // Enhance error messages for authentication issues
      if (error instanceof DartAPIError) {
        if (error.statusCode === 401) {
          throw new DartAPIError(
            'Authentication failed: Invalid DART_TOKEN. Get a valid token from: https://app.dartai.com/?settings=account',
            401,
            error.response
          );
        } else if (error.statusCode === 403) {
          throw new DartAPIError(
            'Access forbidden: Your DART_TOKEN does not have permission to access workspace configuration.',
            403,
            error.response
          );
        }
      }
      // Re-throw other errors
      throw error;
    }
  }

  // Validate include filter values if provided
  const validSections = ['assignees', 'dartboards', 'statuses', 'tags', 'priorities', 'sizes', 'folders'] as const;
  type ValidSection = typeof validSections[number];

  if (input.include && Array.isArray(input.include)) {
    // Validate all sections are valid
    for (const section of input.include) {
      if (!validSections.includes(section as ValidSection)) {
        throw new DartAPIError(
          `Invalid include section: "${section}". Valid sections: ${validSections.join(', ')}`,
          400
        );
      }
    }
  }

  // Apply include filter if specified
  let finalConfig: DartConfig;

  if (input.include && Array.isArray(input.include) && input.include.length > 0) {
    // Only include requested sections, fill others with empty arrays
    finalConfig = {
      assignees: input.include.includes('assignees') ? config.assignees : [],
      dartboards: input.include.includes('dartboards') ? config.dartboards : [],
      statuses: input.include.includes('statuses') ? config.statuses : [],
      tags: input.include.includes('tags') ? config.tags : [],
      priorities: input.include.includes('priorities') ? config.priorities : [],
      sizes: input.include.includes('sizes') ? config.sizes : [],
      folders: input.include.includes('folders') ? config.folders : [],
      cached_at: cachedAtTimestamp || new Date().toISOString(),
      cache_ttl_seconds: configCache.getTTL(),
    };
  } else {
    // No filter - return full config
    finalConfig = {
      ...config,
      cached_at: cachedAtTimestamp || new Date().toISOString(),
      cache_ttl_seconds: configCache.getTTL(),
    };
  }

  return finalConfig;
}
