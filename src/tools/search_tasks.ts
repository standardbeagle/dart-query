/**
 * search_tasks Tool Handler
 *
 * Full-text search across tasks with relevance ranking.
 * Alternative to list_tasks for text-based discovery.
 */

import { DartClient } from '../api/dartClient.js';
import { configCache } from '../cache/configCache.js';
import {
  DartTask,
  DartAPIError,
  ValidationError,
  SearchTasksInput,
  SearchTasksOutput,
} from '../types/index.js';

/**
 * Handle search_tasks tool calls
 *
 * Flow:
 * 1. Parse query string (extract phrases, exclusions, terms)
 * 2. Try Dart API search endpoint if available
 * 3. Fallback: list_tasks + client-side search
 * 4. Calculate relevance scores for each match
 * 5. Sort by relevance descending
 * 6. Apply progressive detail levels based on relevance
 * 7. Return search results with metadata
 */
export async function handleSearchTasks(input: SearchTasksInput): Promise<SearchTasksOutput> {
  // Defensive input handling
  const safeInput = input || {};

  // Validate required fields
  if (!safeInput.query || typeof safeInput.query !== 'string') {
    throw new ValidationError('query is required and must be a string', 'query');
  }

  const query = safeInput.query.trim();
  if (query.length === 0) {
    throw new ValidationError('query cannot be empty or whitespace-only', 'query');
  }

  const DART_TOKEN = process.env.DART_TOKEN;
  if (!DART_TOKEN) {
    throw new DartAPIError(
      'DART_TOKEN environment variable is required. Get your token from: https://app.dartai.com/?settings=account',
      401
    );
  }

  // Initialize Dart API client
  const client = new DartClient({ token: DART_TOKEN });

  // Parse query into structured search terms
  const queryParsed = parseQuery(query);

  // Validate that we have at least some search terms (not just exclusions)
  if (queryParsed.terms.length === 0 && queryParsed.phrases.length === 0) {
    throw new ValidationError(
      'query must contain at least one search term or phrase (not just exclusions)',
      'query'
    );
  }

  // Validate limit
  const limit = validateLimit(safeInput.limit);

  // Resolve dartboard if provided
  let dartboardId: string | undefined;
  if (safeInput.dartboard) {
    dartboardId = await resolveDartboard(safeInput.dartboard, client);
  }

  // Try API search endpoint first (if available in future)
  // For now, we'll use client-side search as fallback
  const searchMethod = 'client_side'; // TODO: Implement API search when endpoint is available

  // Fetch all tasks for client-side search
  const tasks = await fetchAllTasks(client, dartboardId, safeInput.include_completed);

  // Perform client-side search with relevance scoring
  const searchResults = performClientSideSearch(tasks, queryParsed);

  // Sort by relevance descending
  searchResults.sort((a, b) => b.relevance_score - a.relevance_score);

  // Apply limit
  const limitedResults = searchResults.slice(0, limit);

  // Apply progressive detail levels based on relevance
  const resultsWithDetail = applyProgressiveDetail(limitedResults);

  return {
    tasks: resultsWithDetail,
    total_results: searchResults.length,
    query_parsed: queryParsed,
    search_method: searchMethod,
  };
}

/**
 * Parse query string into structured search terms
 *
 * Supports:
 * - Quoted phrases: "exact match"
 * - Exclusions: -term (exclude results with term)
 * - Regular terms: word word2
 */
interface QueryParsed {
  terms: string[];
  phrases: string[];
  exclusions: string[];
}

function parseQuery(query: string): QueryParsed {
  const phrases: string[] = [];
  const exclusions: string[] = [];
  const terms: string[] = [];

  let remaining = query;

  // Extract quoted phrases (both " and ')
  const phraseRegex = /["']([^"']+)["']/g;
  let match: RegExpExecArray | null;

  while ((match = phraseRegex.exec(query)) !== null) {
    phrases.push(match[1].toLowerCase());
    // Remove matched phrase from remaining string
    remaining = remaining.replace(match[0], ' ');
  }

  // Extract exclusions (words starting with -)
  const exclusionRegex = /-(\w+)/g;
  while ((match = exclusionRegex.exec(remaining)) !== null) {
    exclusions.push(match[1].toLowerCase());
    // Remove matched exclusion from remaining string
    remaining = remaining.replace(match[0], ' ');
  }

  // Extract remaining terms (split by whitespace, filter empty)
  const remainingTerms = remaining
    .split(/\s+/)
    .map(t => t.trim().toLowerCase())
    .filter(t => t.length > 0);

  terms.push(...remainingTerms);

  return { terms, phrases, exclusions };
}

/**
 * Validate limit parameter
 */
function validateLimit(limit?: number): number {
  if (limit === undefined || limit === null) {
    return 50; // Default limit
  }

  if (typeof limit !== 'number' || !Number.isInteger(limit)) {
    throw new ValidationError('limit must be an integer', 'limit');
  }

  if (limit < 1) {
    throw new ValidationError('limit must be at least 1', 'limit');
  }

  if (limit > 500) {
    throw new ValidationError('limit must not exceed 500 (max allowed)', 'limit');
  }

  return limit;
}

/**
 * Resolve dartboard name or dart_id to dart_id
 */
async function resolveDartboard(dartboard: string, client: DartClient): Promise<string> {
  if (typeof dartboard !== 'string') {
    throw new ValidationError('dartboard must be a string', 'dartboard');
  }

  const dartboardInput = dartboard.trim();
  if (dartboardInput.length === 0) {
    throw new ValidationError('dartboard cannot be empty', 'dartboard');
  }

  // Get config to resolve names to IDs
  let config = configCache.get();
  if (!config) {
    config = await client.getConfig();
    configCache.set({
      ...config,
      cached_at: new Date().toISOString(),
      cache_ttl_seconds: configCache.getTTL(),
    });
  }

  // Handle empty dartboards array edge case
  if (!config.dartboards || config.dartboards.length === 0) {
    throw new ValidationError(
      'No dartboards configured in workspace. Cannot filter by dartboard.',
      'dartboard',
      ['No dartboards available']
    );
  }

  const matchedDartboard = config.dartboards.find(
    (d) => d.toLowerCase() === dartboardInput.toLowerCase()
  );

  if (!matchedDartboard) {
    throw new ValidationError(
      `Dartboard not found: "${dartboardInput}". Use get_config to see available dartboards.`,
      'dartboard',
      config.dartboards.slice(0, 10)
    );
  }

  return matchedDartboard;
}

/**
 * Fetch all tasks for client-side search
 * Uses pagination to fetch all tasks (up to reasonable limit)
 */
async function fetchAllTasks(
  client: DartClient,
  dartboardId?: string,
  includeCompleted?: boolean
): Promise<DartTask[]> {
  const allTasks: DartTask[] = [];
  const fetchLimit = 500; // Max per request
  const maxTotalTasks = 10000; // Safety limit to prevent memory issues
  let offset = 0;
  let hasMore = true;

  while (hasMore && allTasks.length < maxTotalTasks) {
    const response = await client.listTasks({
      dartboard: dartboardId,
      limit: fetchLimit,
      offset,
      detail_level: 'full', // Need full text for search
    });

    allTasks.push(...response.tasks);

    // Check if we have more tasks to fetch
    hasMore = offset + fetchLimit < response.total;
    offset += fetchLimit;

    // Safety break
    if (allTasks.length >= maxTotalTasks) {
      break;
    }
  }

  // Filter out completed tasks if not included
  if (!includeCompleted) {
    return allTasks.filter(task => !task.completed_at);
  }

  return allTasks;
}

/**
 * Perform client-side search with relevance scoring
 */
function performClientSideSearch(
  tasks: DartTask[],
  queryParsed: QueryParsed
): Array<DartTask & { relevance_score: number }> {
  const results: Array<DartTask & { relevance_score: number }> = [];

  for (const task of tasks) {
    const relevanceScore = calculateRelevance(task, queryParsed);

    // Only include tasks with relevance > 0
    if (relevanceScore > 0) {
      results.push({
        ...task,
        relevance_score: relevanceScore,
      });
    }
  }

  return results;
}

/**
 * Calculate relevance score for a task
 *
 * Scoring factors:
 * - Title exact phrase match: +10
 * - Title partial phrase match: +5
 * - Description exact phrase match: +7
 * - Description partial phrase match: +3
 * - Title term match: +2 per term
 * - Description term match: +1 per term
 * - Exclusion match: 0 (exclude from results)
 *
 * Returns: 0-1 normalized score (0 = no match, 1 = perfect match)
 */
function calculateRelevance(task: DartTask, queryParsed: QueryParsed): number {
  const title = (task.title || '').toLowerCase();
  const description = (task.description || '').toLowerCase();

  // Check exclusions first (if any match, score = 0)
  for (const exclusion of queryParsed.exclusions) {
    if (title.includes(exclusion) || description.includes(exclusion)) {
      return 0; // Exclude this task
    }
  }

  let score = 0;
  let maxScore = 0;

  // Score phrases (higher weight)
  for (const phrase of queryParsed.phrases) {
    maxScore += 10; // Title exact phrase
    maxScore += 7;  // Description exact phrase

    // Title phrase matching
    if (title.includes(phrase)) {
      // Exact phrase match (consecutive words)
      score += 10;
    } else {
      // Check for partial phrase match (all words present but not consecutive)
      const titleWords = title.split(/\s+/);
      const phraseWords = phrase.split(/\s+/);
      const allWordsPresent = phraseWords.every(word => titleWords.includes(word));
      if (allWordsPresent) {
        score += 5;
      }
    }

    // Description phrase matching
    if (description.includes(phrase)) {
      // Exact phrase match (consecutive words)
      score += 7;
    } else {
      // Check for partial phrase match (all words present but not consecutive)
      const descWords = description.split(/\s+/);
      const phraseWords = phrase.split(/\s+/);
      const allWordsPresent = phraseWords.every(word => descWords.includes(word));
      if (allWordsPresent) {
        score += 3;
      }
    }
  }

  // Score individual terms
  for (const term of queryParsed.terms) {
    maxScore += 2; // Title term
    maxScore += 1; // Description term

    if (title.includes(term)) {
      score += 2;
    }

    if (description.includes(term)) {
      score += 1;
    }
  }

  // Normalize score to 0-1 range
  if (maxScore === 0) {
    return 0; // No search terms provided
  }

  const normalizedScore = Math.min(score / maxScore, 1);

  return normalizedScore;
}

/**
 * Apply progressive detail levels based on relevance score
 *
 * - High relevance (>0.7): Full detail
 * - Medium relevance (0.3-0.7): Standard detail
 * - Low relevance (<0.3): Minimal detail
 */
function applyProgressiveDetail(
  results: Array<DartTask & { relevance_score: number }>
): Array<DartTask & { relevance_score: number }> {
  return results.map(result => {
    const score = result.relevance_score;

    if (score > 0.7) {
      // High relevance: return full detail
      return result;
    } else if (score >= 0.3) {
      // Medium relevance: standard detail
      return {
        dart_id: result.dart_id,
        title: result.title,
        description: result.description,
        status: result.status,
        status_id: result.status_id,
        priority: result.priority,
        assignees: result.assignees,
        dartboard: result.dartboard,
        dartboard_id: result.dartboard_id,
        created_at: result.created_at,
        updated_at: result.updated_at,
        relevance_score: result.relevance_score,
      } as DartTask & { relevance_score: number };
    } else {
      // Low relevance: minimal detail
      return {
        dart_id: result.dart_id,
        title: result.title,
        created_at: result.created_at,
        updated_at: result.updated_at,
        relevance_score: result.relevance_score,
      } as DartTask & { relevance_score: number };
    }
  });
}
