/**
 * Config Cache Layer
 *
 * Caches workspace configuration (dartboards, assignees, statuses, tags, etc.)
 * with a 5-minute TTL to reduce API calls.
 *
 * Configuration data rarely changes but is heavily accessed before
 * every create/update operation for validation purposes.
 */

import NodeCache from 'node-cache';
import { DartConfig } from '../types/index.js';

/**
 * Cache key for storing DartConfig
 */
const CONFIG_CACHE_KEY = 'workspace_config';

/**
 * ConfigCache - Singleton cache for workspace configuration
 *
 * Features:
 * - 5-minute TTL (300 seconds)
 * - Automatic cleanup on expiration
 * - Manual cache invalidation support
 * - Type-safe storage of DartConfig
 */
export class ConfigCache {
  private readonly cache: NodeCache;
  private readonly ttlSeconds: number;

  constructor(ttlSeconds: number = 300) {
    this.ttlSeconds = ttlSeconds;
    this.cache = new NodeCache({
      stdTTL: ttlSeconds,
      checkperiod: 60, // Check for expired keys every 60 seconds
      useClones: true, // Clone objects to prevent mutation of cached data
    });
  }

  /**
   * Get cached configuration
   * @returns DartConfig if cached and not expired, undefined otherwise
   */
  get(): DartConfig | undefined {
    try {
      return this.cache.get<DartConfig>(CONFIG_CACHE_KEY);
    } catch (error) {
      // Log error but don't throw - treat as cache miss
      console.error('ConfigCache.get() error:', error);
      return undefined;
    }
  }

  /**
   * Store configuration in cache with TTL
   * @param config - Workspace configuration to cache
   * @throws Error if config is null or undefined
   */
  set(config: DartConfig): void {
    if (!config) {
      throw new Error('Cannot cache null or undefined config');
    }
    try {
      this.cache.set(CONFIG_CACHE_KEY, config);
    } catch (error) {
      // Re-throw with context
      throw new Error(`Failed to cache config: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Invalidate (clear) the cached configuration
   * Use this when configuration changes are detected or manual refresh is needed
   */
  invalidate(): void {
    try {
      this.cache.del(CONFIG_CACHE_KEY);
    } catch (error) {
      // Log error but don't throw - invalidation succeeded in effect
      console.error('ConfigCache.invalidate() error:', error);
    }
  }

  /**
   * Check if cache has valid (non-expired) data
   * @returns true if cache is expired or empty, false if cache has valid data
   */
  isExpired(): boolean {
    try {
      return !this.cache.has(CONFIG_CACHE_KEY);
    } catch (error) {
      // On error, assume expired
      console.error('ConfigCache.isExpired() error:', error);
      return true;
    }
  }

  /**
   * Get cache statistics (for debugging/monitoring)
   * @returns Object with cache stats
   */
  getStats(): {
    keys: number;
    hits: number;
    misses: number;
    ksize: number;
    vsize: number;
  } {
    return this.cache.getStats();
  }

  /**
   * Get TTL configuration
   * @returns TTL in seconds
   */
  getTTL(): number {
    return this.ttlSeconds;
  }
}

/**
 * Singleton instance of ConfigCache
 * Export this for use throughout the application
 */
export const configCache = new ConfigCache();
