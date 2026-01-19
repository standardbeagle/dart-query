/**
 * import_tasks_csv Tool Handler
 *
 * Imports tasks from CSV with validation phase and parallel creation.
 * Production safety: ALWAYS recommend validate_only=true first.
 *
 * Features:
 * - CSV parsing with flexible column mapping
 * - Reference resolution (dartboard, assignee, status, tags)
 * - Two-phase operation: validate_only=true (preview) then validate_only=false (execute)
 * - Parallel task creation with configurable concurrency
 * - Error collection with continue_on_error support
 * - Rollback suggestions for high failure rates
 */

import { DartClient } from '../api/dartClient.js';
import { handleGetConfig } from './get_config.js';
import { parseCSV, resolveReferences, validateRow } from '../parsers/csv.js';
import {
  createBatchOperation,
  addSuccessfulItem,
  addFailedItem,
  completeBatchOperation,
} from '../batch/batchOperations.js';
import pLimit from 'p-limit';
import {
  ImportTasksCSVInput,
  ImportTasksCSVOutput,
  DartAPIError,
  ValidationError,
  DartConfig,
  CreateTaskInput,
} from '../types/index.js';

/**
 * Handle import_tasks_csv tool calls
 *
 * Flow:
 * 1. Input validation (require csv_data or csv_file_path, dartboard)
 * 2. Parse CSV with parseCSV() and column_mapping
 * 3. Get config via get_config() for reference resolution
 * 4. Validate ALL rows - collect errors (don't stop on first error)
 * 5. Resolve references (dartboard, assignee, status, tags names → dart_ids)
 * 6. If validate_only=true: return preview + validation_errors
 * 7. If validate_only=false: parallel create with p-limit concurrency
 * 8. If continue_on_error=true: collect failures, continue execution
 * 9. Return created_dart_ids, failed_items with row context
 * 10. Suggest rollback if >50% failed
 *
 * @param input - ImportTasksCSVInput with CSV source and options
 * @returns ImportTasksCSVOutput with results and errors
 */
export async function handleImportTasksCSV(
  input: ImportTasksCSVInput
): Promise<ImportTasksCSVOutput> {
  const startTime = Date.now();

  // Defensive input validation
  if (!input || typeof input !== 'object') {
    throw new ValidationError('Input must be an object');
  }

  const DART_TOKEN = process.env.DART_TOKEN;
  if (!DART_TOKEN) {
    throw new DartAPIError(
      'DART_TOKEN environment variable is required. Get your token from: https://app.dartai.com/?settings=account',
      401
    );
  }

  // ============================================================================
  // Phase 1: Input Validation
  // ============================================================================

  // Require CSV source
  if (!input.csv_data && !input.csv_file_path) {
    throw new ValidationError(
      'Either csv_data or csv_file_path must be provided',
      'csv_data'
    );
  }

  // Require dartboard
  if (!input.dartboard || typeof input.dartboard !== 'string' || input.dartboard.trim() === '') {
    throw new ValidationError(
      'dartboard is required and must be a non-empty string (dartboard name or dart_id)',
      'dartboard'
    );
  }

  // Validate validate_only (defaults to undefined which means false, but we'll default to TRUE for safety)
  const validateOnly = input.validate_only ?? true; // PRODUCTION SAFETY: default to TRUE!

  // Validate continue_on_error (defaults to true)
  const continueOnError = input.continue_on_error ?? true;

  // Validate concurrency (default 5, range 1-20)
  const concurrency = input.concurrency ?? 5;
  if (typeof concurrency !== 'number' || concurrency < 1 || concurrency > 20) {
    throw new ValidationError(
      'concurrency must be a number between 1 and 20',
      'concurrency'
    );
  }

  // ============================================================================
  // Phase 2: Parse CSV
  // ============================================================================

  const parseResult = parseCSV({
    csv_data: input.csv_data,
    csv_file_path: input.csv_file_path,
    column_mapping: input.column_mapping,
  });

  // Check for parse errors
  if (parseResult.errors.length > 0) {
    throw new ValidationError(
      `CSV parse errors: ${parseResult.errors.join('; ')}`,
      'csv_data'
    );
  }

  const totalRows = parseResult.data.length;

  if (totalRows === 0) {
    throw new ValidationError(
      'CSV contains no valid data rows (after skipping empty lines)',
      'csv_data'
    );
  }

  // Safety limit for imports
  if (totalRows > 10000) {
    throw new ValidationError(
      `CSV contains ${totalRows} rows, exceeding safety limit of 10,000 rows. Please split into smaller batches.`,
      'csv_data'
    );
  }

  // ============================================================================
  // Phase 3: Get config for reference resolution
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

  // Validate dartboard exists
  const dartboardExists = config.dartboards.includes(input.dartboard);

  if (!dartboardExists) {
    const availableDartboards = config.dartboards.slice(0, 10).join(', ') +
      (config.dartboards.length > 10 ? `, ... (${config.dartboards.length - 10} more)` : '');
    throw new ValidationError(
      `Invalid dartboard: "${input.dartboard}" not found in workspace. Available dartboards: ${availableDartboards}`,
      'dartboard',
      config.dartboards
    );
  }

  const dartboardId = input.dartboard;

  // ============================================================================
  // Phase 4: Validate ALL rows - collect errors for all rows
  // ============================================================================

  const validationErrors: Array<{ row_number: number; errors: string[] }> = [];
  const resolvedRows: Array<{ row_number: number; data: Record<string, unknown> }> = [];

  let rowNumber = 1; // Start at 1 (header is row 0)
  for (const row of parseResult.data) {
    rowNumber++;

    // Validate row structure and data types
    const rowErrors = validateRow(row, config, rowNumber);

    // Resolve references (dartboard, assignee, status, tags)
    const resolveResult = resolveReferences(row, config, rowNumber);

    // Collect all errors for this row (including suggestions in error messages)
    const allRowErrors: string[] = [];

    // Add validation errors
    for (const err of rowErrors) {
      allRowErrors.push(`${err.field}: ${err.error}`);
    }

    // Add resolution errors with suggestions if available
    for (const err of resolveResult.errors) {
      const suggestion = resolveResult.suggestions.find(s => s.field === err.field && s.input === err.value);
      if (suggestion && suggestion.suggestions.length > 0) {
        allRowErrors.push(`${err.field}: ${err.error} (Did you mean: ${suggestion.suggestions.join(', ')}?)`);
      } else {
        allRowErrors.push(`${err.field}: ${err.error}`);
      }
    }

    if (allRowErrors.length > 0) {
      validationErrors.push({
        row_number: rowNumber,
        errors: allRowErrors,
      });
    } else {
      // Row is valid - add dartboard_id to resolved data
      resolvedRows.push({
        row_number: rowNumber,
        data: {
          ...resolveResult.resolved,
          dartboard: dartboardId, // Always set the resolved dartboard ID
        },
      });
    }
  }

  const validRows = resolvedRows.length;
  const invalidRows = validationErrors.length;

  // ============================================================================
  // Phase 5: validate_only=true - Return preview + validation_errors
  // ============================================================================

  if (validateOnly) {
    // Generate preview of first 10 valid rows
    const preview = resolvedRows.slice(0, 10).map((item) => ({
      row_number: item.row_number,
      task_preview: {
        title: item.data.title as string,
        description: item.data.description as string | undefined,
        dartboard: dartboardId,
        status: item.data.status as string | undefined,
        priority: item.data.priority as string | undefined,
        size: item.data.size as string | undefined,
        assignee: item.data.assignee as string | undefined,
        tags: item.data.tags as string[] | undefined,
        due_at: item.data.due_at as string | undefined,
        start_at: item.data.start_at as string | undefined,
      },
    }));

    // Create batch operation for tracking (even in validate_only mode)
    const batchOperation = createBatchOperation('import', totalRows);

    return {
      batch_operation_id: batchOperation.batch_operation_id,
      total_rows: totalRows,
      valid_rows: validRows,
      invalid_rows: invalidRows,
      validation_errors: validationErrors,
      preview: preview,
      created_tasks: 0,
      failed_tasks: 0,
      created_dart_ids: [],
      failed_items: [],
      execution_time_ms: Date.now() - startTime,
    };
  }

  // ============================================================================
  // Phase 6: validate_only=false - Parallel task creation
  // ============================================================================

  // If there are validation errors and continue_on_error=false, throw error
  if (invalidRows > 0 && !continueOnError) {
    throw new ValidationError(
      `CSV validation failed: ${invalidRows} rows have errors. Set continue_on_error=true to skip invalid rows or fix errors first. Run with validate_only=true to see all errors.`,
      'csv_data'
    );
  }

  // Create batch operation for tracking
  const batchOperation = createBatchOperation('import', validRows);

  // Initialize API client
  const client = new DartClient({ token: DART_TOKEN });

  // Parallel task creation with p-limit
  const limit = pLimit(concurrency);
  const createdDartIds: string[] = [];
  const failedItems: Array<{ row_number: number; error: string; row_data: Record<string, unknown> }> = [];

  const createTasks = resolvedRows.map((item) =>
    limit(async () => {
      try {
        // Build CreateTaskInput from resolved data
        // Note: CSV parser uses 'assignee' (singular), API expects 'assignees' (array)
        let assignees: string[] | undefined;
        if (item.data.assignee && typeof item.data.assignee === 'string') {
          assignees = [item.data.assignee];
        }

        const taskInput: CreateTaskInput = {
          title: item.data.title as string,
          dartboard: dartboardId,
          description: item.data.description as string | undefined,
          status: item.data.status as string | undefined,
          priority: item.data.priority as string | undefined,
          size: item.data.size as string | undefined,
          assignees: assignees,
          tags: item.data.tags as string[] | undefined,
          due_at: item.data.due_at as string | undefined,
          start_at: item.data.start_at as string | undefined,
          parent_task: item.data.parent_task as string | undefined,
        };

        // Create task via API
        const createdTask = await client.createTask(taskInput);

        // Track success
        addSuccessfulItem(batchOperation.batch_operation_id, createdTask.dart_id);
        createdDartIds.push(createdTask.dart_id);
      } catch (error) {
        // Track failure
        const errorMessage = error instanceof Error ? error.message : String(error);
        addFailedItem(batchOperation.batch_operation_id, {
          row_number: item.row_number,
          error: errorMessage,
        });

        failedItems.push({
          row_number: item.row_number,
          error: errorMessage,
          row_data: item.data,
        });

        // If continue_on_error=false, rethrow to stop execution
        if (!continueOnError) {
          throw error;
        }
      }
    })
  );

  // Wait for all tasks to complete
  try {
    await Promise.all(createTasks);
  } catch (error) {
    // If continue_on_error=false, this will be hit
    completeBatchOperation(batchOperation.batch_operation_id, 'failed');
    throw error;
  }

  // Mark batch operation as complete
  completeBatchOperation(
    batchOperation.batch_operation_id,
    failedItems.length > 0 ? 'failed' : 'completed'
  );

  const executionTimeMs = Date.now() - startTime;

  // ============================================================================
  // Phase 7: Rollback suggestion if >50% failed
  // ============================================================================

  const failureRate = validRows > 0 ? failedItems.length / validRows : 0;
  const rollbackSuggestion = failureRate > 0.5
    ? `WARNING: ${Math.round(failureRate * 100)}% of tasks failed to create. Consider deleting created tasks and fixing errors. Created task IDs: ${createdDartIds.join(', ')}`
    : undefined;

  // Add rollback suggestion to first failed item if applicable
  if (rollbackSuggestion && failedItems.length > 0) {
    failedItems[0].error = `${failedItems[0].error}\n\n${rollbackSuggestion}`;
  }

  // ============================================================================
  // Phase 8: Return results
  // ============================================================================

  return {
    batch_operation_id: batchOperation.batch_operation_id,
    total_rows: totalRows,
    valid_rows: validRows,
    invalid_rows: invalidRows,
    validation_errors: validationErrors,
    preview: undefined, // Only returned in validate_only mode
    created_tasks: createdDartIds.length,
    failed_tasks: failedItems.length,
    created_dart_ids: createdDartIds,
    failed_items: failedItems,
    execution_time_ms: executionTimeMs,
  };
}
