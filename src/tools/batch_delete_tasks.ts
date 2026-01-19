/**
 * batch_delete_tasks Tool Handler
 *
 * Batch delete multiple tasks matching a DartQL selector.
 * CRITICAL PRODUCTION SAFETY:
 * - dry_run defaults to TRUE
 * - confirm=true REQUIRED when dry_run=false (throws error otherwise)
 * - This is the MOST DANGEROUS operation - explicit confirmation is mandatory
 *
 * Flow:
 * 1. Parse DartQL selector to AST
 * 2. Validate dry_run and confirm flags (CRITICAL SAFETY)
 * 3. Resolve selector to dart_ids via list_tasks + client-side filtering
 * 4. dry_run=true: Return preview (max 20 tasks) without deleting
 * 5. dry_run=false + confirm=true: Parallel deletes with p-limit concurrency control
 * 6. Collect deleted_dart_ids and failed_items
 * 7. Return batch_operation_id, recoverable=true, and results
 */

import pLimit from 'p-limit';
import { DartClient } from '../api/dartClient.js';
import { parseDartQLToAST, convertToFilters } from '../parsers/dartql.js';
import {
  BatchDeleteTasksInput,
  BatchDeleteTasksOutput,
  DartAPIError,
  ValidationError,
  DartTask,
} from '../types/index.js';
import {
  createBatchOperation,
  completeBatchOperation,
  addSuccessfulItem,
  addFailedItem,
} from '../batch/batchOperations.js';

/**
 * Handle batch_delete_tasks tool calls
 *
 * PRODUCTION SAFETY: This is a DESTRUCTIVE batch operation!
 * - dry_run defaults to TRUE
 * - confirm=true REQUIRED when dry_run=false
 * - Tasks move to trash (recoverable via web UI)
 *
 * @param input - BatchDeleteTasksInput with selector, dry_run, confirm, concurrency
 * @returns BatchDeleteTasksOutput with batch_operation_id, matched count, results
 */
export async function handleBatchDeleteTasks(
  input: BatchDeleteTasksInput
): Promise<BatchDeleteTasksOutput> {
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
      'selector is required and must be a non-empty DartQL WHERE clause (e.g., "status = \'Archived\' AND completed_at < \'2025-01-01\'")',
      'selector'
    );
  }

  // ============================================================================
  // Step 2: Validate dry_run and confirm flags (CRITICAL SAFETY)
  // ============================================================================
  // PRODUCTION SAFETY: dry_run defaults to TRUE unless explicitly set to false
  const dryRun = input.dry_run !== false; // Default to true

  // CRITICAL: If dry_run=false, confirm MUST be true
  if (!dryRun && input.confirm !== true) {
    throw new ValidationError(
      'SAFETY CHECK FAILED: When dry_run=false, confirm=true is REQUIRED to execute deletions. ' +
        'This prevents accidental batch deletions. Set confirm=true to proceed.',
      'confirm'
    );
  }

  // Validate concurrency (default 5, range 1-20)
  let concurrency = input.concurrency ?? 5;
  if (typeof concurrency !== 'number' || !Number.isInteger(concurrency)) {
    throw new ValidationError('concurrency must be an integer', 'concurrency');
  }
  if (concurrency < 1 || concurrency > 20) {
    throw new ValidationError('concurrency must be between 1 and 20', 'concurrency');
  }

  // ============================================================================
  // Step 3: Parse DartQL selector
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
  // Step 4: Convert AST to filters
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
  // Step 5: Resolve selector to dart_ids via list_tasks
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
          'Selector matches too many tasks (>10,000). Please narrow your selector to avoid accidental mass deletion.',
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
  // Step 6: Handle dry_run mode (preview only, no deletions)
  // ============================================================================
  if (dryRun) {
    // Preview mode: return max 20 tasks (more than batch_update since deletes are more critical)
    const previewTasks = matchingTasks.slice(0, 20).map((task) => ({
      dart_id: task.dart_id,
      title: task.title,
    }));

    return {
      batch_operation_id: 'dry_run',
      selector_matched: selectorMatched,
      dry_run: true,
      preview_tasks: previewTasks,
      successful_deletions: 0,
      failed_deletions: 0,
      deleted_dart_ids: [],
      failed_items: [],
      recoverable: true,
    };
  }

  // ============================================================================
  // Step 7: Create batch operation for tracking
  // ============================================================================
  const batchOperation = createBatchOperation('delete', selectorMatched);
  const batchOperationId = batchOperation.batch_operation_id;
  const startTime = Date.now();

  // ============================================================================
  // Step 8: Execute parallel deletions with concurrency control
  // ============================================================================
  const limit = pLimit(concurrency);
  const deletedDartIds: string[] = [];
  const failedItems: Array<{ dart_id: string; error: string }> = [];

  const deletePromises = matchingTasks.map((task) =>
    limit(async () => {
      try {
        await client.deleteTask(task.dart_id);

        deletedDartIds.push(task.dart_id);
        addSuccessfulItem(batchOperationId, task.dart_id);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        failedItems.push({
          dart_id: task.dart_id,
          error: errorMessage,
        });

        addFailedItem(batchOperationId, {
          id: task.dart_id,
          error: errorMessage,
        });

        // Continue on error - collect all failures instead of stopping
        // This is safer for batch operations
      }
    })
  );

  // Wait for all deletions to complete
  await Promise.all(deletePromises);

  // ============================================================================
  // Step 9: Complete batch operation and return results
  // ============================================================================
  const executionTimeMs = Date.now() - startTime;
  const status = failedItems.length === 0 ? 'completed' : failedItems.length === selectorMatched ? 'failed' : 'completed';
  completeBatchOperation(batchOperationId, status);

  return {
    batch_operation_id: batchOperationId,
    selector_matched: selectorMatched,
    dry_run: false,
    successful_deletions: deletedDartIds.length,
    failed_deletions: failedItems.length,
    deleted_dart_ids: deletedDartIds,
    failed_items: failedItems,
    recoverable: true,
    execution_time_ms: executionTimeMs,
  };
}
