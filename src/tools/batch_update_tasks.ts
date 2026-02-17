/**
 * batch_update_tasks Tool Handler
 *
 * Batch update multiple tasks matching a DartQL selector.
 * CRITICAL PRODUCTION SAFETY: Always recommend dry_run=true first!
 *
 * Flow:
 * 1. Parse DartQL selector to AST
 * 2. Resolve selector to dart_ids via list_tasks + client-side filtering
 * 3. dry_run=true: Return preview (max 10 tasks) without updating
 * 4. dry_run=false: Parallel updates with p-limit concurrency control
 * 5. Collect successful_dart_ids and failed_items
 * 6. Return batch_operation_id, execution_time_ms, and results
 */

import pLimit from 'p-limit';
import { DartClient } from '../api/dartClient.js';
import { handleGetConfig } from './get_config.js';
import { parseDartQLToAST, convertToFilters } from '../parsers/dartql.js';
import {
  BatchUpdateTasksInput,
  BatchUpdateTasksOutput,
  DartAPIError,
  ValidationError,
  DartConfig,
  DartTask,
} from '../types/index.js';
import { validateUpdates, extractCurrentValues } from '../batch/validateUpdates.js';
import {
  createBatchOperation,
  completeBatchOperation,
  addSuccessfulItem,
  addFailedItem,
} from '../batch/batchOperations.js';

/**
 * Handle batch_update_tasks tool calls
 *
 * PRODUCTION SAFETY: This is a batch WRITE operation - dry_run mode is critical!
 *
 * @param input - BatchUpdateTasksInput with selector, updates, dry_run, concurrency
 * @returns BatchUpdateTasksOutput with batch_operation_id, matched count, results
 */
export async function handleBatchUpdateTasks(
  input: BatchUpdateTasksInput
): Promise<BatchUpdateTasksOutput> {
  const DART_TOKEN = process.env.DART_TOKEN;

  if (!DART_TOKEN) {
    throw new DartAPIError(
      'DART_TOKEN environment variable is required. Get your token from: https://app.dartai.com/?settings=account',
      401
    );
  }

  // ============================================================================
  // Step 1: Validate input
  // ============================================================================
  if (!input || typeof input !== 'object') {
    throw new ValidationError('input is required and must be an object', 'input');
  }

  if (!input.selector || typeof input.selector !== 'string' || input.selector.trim() === '') {
    throw new ValidationError(
      'selector is required and must be a non-empty DartQL WHERE clause (e.g., "status = \'Todo\' AND priority >= 3")',
      'selector'
    );
  }

  if (!input.updates || typeof input.updates !== 'object' || Object.keys(input.updates).length === 0) {
    throw new ValidationError(
      'updates is required and must be a non-empty object with at least one field to update',
      'updates'
    );
  }

  // Validate dry_run (default to true for safety)
  const dryRun = input.dry_run !== false; // Default to true unless explicitly set to false

  // Validate concurrency (default 5, range 1-20)
  let concurrency = input.concurrency ?? 5;
  if (typeof concurrency !== 'number' || !Number.isInteger(concurrency)) {
    throw new ValidationError('concurrency must be an integer', 'concurrency');
  }
  if (concurrency < 1 || concurrency > 20) {
    throw new ValidationError('concurrency must be between 1 and 20', 'concurrency');
  }

  // ============================================================================
  // Step 2: Parse DartQL selector
  // ============================================================================
  const parseResult = parseDartQLToAST(input.selector);

  if (parseResult.errors.length > 0) {
    throw new ValidationError(
      `DartQL parse errors: ${parseResult.errors.join('; ')}`,
      'selector',
      parseResult.errors
    );
  }

  // ============================================================================
  // Step 3: Convert AST to filters
  // ============================================================================
  const filterResult = convertToFilters(parseResult.ast);

  if (filterResult.errors.length > 0) {
    throw new ValidationError(
      `DartQL conversion errors: ${filterResult.errors.join('; ')}`,
      'selector',
      filterResult.errors
    );
  }

  // ============================================================================
  // Step 4: Get workspace config for validation
  // ============================================================================
  let config: DartConfig;
  try {
    config = await handleGetConfig({ cache_bust: false });
  } catch (error) {
    if (error instanceof DartAPIError) {
      throw new DartAPIError(
        `Failed to retrieve workspace config for validation: ${error.message}`,
        error.statusCode,
        error.response
      );
    }
    throw error;
  }

  // ============================================================================
  // Step 5: Validate updates against workspace config
  // ============================================================================
  const validatedUpdates = await validateUpdates(input.updates, config);

  // ============================================================================
  // Step 6: Resolve selector to dart_ids via list_tasks
  // ============================================================================
  const client = new DartClient({ token: DART_TOKEN });

  // Fetch all matching tasks (use high limit to get all)
  let matchingTasks: DartTask[] = [];
  try {
    // Start with API filters if available
    const apiFilters = filterResult.apiFilters;
    let offset = 0;
    const limit = 500;
    let hasMore = true;

    while (hasMore) {
      const response = await client.listTasks({
        ...apiFilters,
        limit,
        offset,
      });

      matchingTasks.push(...(response.tasks || []));

      hasMore = offset + limit < (response.total || 0);
      offset += limit;

      // Safety limit: max 10,000 tasks
      if (matchingTasks.length >= 10000) {
        throw new ValidationError(
          'Selector matches too many tasks (>10,000). Please narrow your selector.',
          'selector'
        );
      }
    }

    // Apply client-side filtering if needed
    if (filterResult.requiresClientSide && filterResult.clientFilter) {
      matchingTasks = matchingTasks.filter(filterResult.clientFilter);
    }
  } catch (error) {
    if (error instanceof DartAPIError) {
      throw new DartAPIError(
        `Failed to fetch matching tasks: ${error.message}`,
        error.statusCode,
        error.response
      );
    }
    throw error;
  }

  const selectorMatched = matchingTasks.length;

  // ============================================================================
  // Step 7: Handle dry_run mode (preview only, no updates)
  // ============================================================================
  if (dryRun) {
    const previewTasks = matchingTasks.slice(0, 10).map((task) => ({
      dart_id: task.dart_id,
      title: task.title,
      current_values: extractCurrentValues(task, Object.keys(validatedUpdates)),
      new_values: validatedUpdates,
    }));

    return {
      batch_operation_id: 'dry_run',
      selector_matched: selectorMatched,
      dry_run: true,
      preview_tasks: previewTasks,
      successful_updates: 0,
      failed_updates: 0,
      successful_dart_ids: [],
      failed_items: [],
      execution_time_ms: 0,
    };
  }

  // ============================================================================
  // Step 8: Create batch operation for tracking
  // ============================================================================
  const batchOperation = createBatchOperation('update', selectorMatched);
  const batchOperationId = batchOperation.batch_operation_id;
  const startTime = Date.now();

  // ============================================================================
  // Step 9: Execute parallel updates with concurrency control
  // ============================================================================
  const limit = pLimit(concurrency);
  const successfulDartIds: string[] = [];
  const failedItems: Array<{ dart_id: string; error: string; reason: string }> = [];

  const updatePromises = matchingTasks.map((task) =>
    limit(async () => {
      try {
        await client.updateTask(task.dart_id, validatedUpdates);

        successfulDartIds.push(task.dart_id);
        addSuccessfulItem(batchOperationId, task.dart_id);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const reason =
          error instanceof DartAPIError
            ? `HTTP ${error.statusCode}: ${error.message}`
            : errorMessage;

        failedItems.push({
          dart_id: task.dart_id,
          error: errorMessage,
          reason,
        });

        addFailedItem(batchOperationId, {
          id: task.dart_id,
          error: reason,
        });

        // If continue_on_error is not explicitly set, we don't throw and continue
        // This is safer for batch operations - collect all errors instead of stopping
      }
    })
  );

  // Wait for all updates to complete
  await Promise.all(updatePromises);

  // ============================================================================
  // Step 10: Complete batch operation and return results
  // ============================================================================
  const executionTimeMs = Date.now() - startTime;
  const status = failedItems.length === 0 ? 'completed' : failedItems.length === selectorMatched ? 'failed' : 'completed';
  completeBatchOperation(batchOperationId, status);

  return {
    batch_operation_id: batchOperationId,
    selector_matched: selectorMatched,
    dry_run: false,
    successful_updates: successfulDartIds.length,
    failed_updates: failedItems.length,
    successful_dart_ids: successfulDartIds,
    failed_items: failedItems,
    execution_time_ms: executionTimeMs,
  };
}

