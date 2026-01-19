/**
 * get_batch_status Tool Handler
 *
 * Retrieves the status of a batch operation by batch_operation_id.
 * Used to track the progress and results of batch_update_tasks, batch_delete_tasks,
 * and import_tasks_csv operations.
 *
 * Flow:
 * 1. Validate batch_operation_id input
 * 2. Retrieve operation from batchOperations store
 * 3. Return operation state or "not found" message
 */

import { getBatchOperation } from '../batch/batchOperations.js';
import {
  GetBatchStatusInput,
  GetBatchStatusOutput,
  ValidationError,
} from '../types/index.js';

/**
 * Handle get_batch_status tool calls
 *
 * Retrieves batch operation state from in-memory store.
 * Operations are stored for up to 1 hour after completion.
 *
 * @param input - GetBatchStatusInput with batch_operation_id
 * @returns GetBatchStatusOutput with found status and operation details
 */
export async function handleGetBatchStatus(
  input: GetBatchStatusInput
): Promise<GetBatchStatusOutput> {
  // ============================================================================
  // Step 1: Validate input
  // ============================================================================
  if (!input || typeof input !== 'object') {
    throw new ValidationError('input is required and must be an object', 'input');
  }

  if (
    !input.batch_operation_id ||
    typeof input.batch_operation_id !== 'string' ||
    input.batch_operation_id.trim() === ''
  ) {
    throw new ValidationError(
      'batch_operation_id is required and must be a non-empty string',
      'batch_operation_id'
    );
  }

  // ============================================================================
  // Step 2: Retrieve operation from store
  // ============================================================================
  const operation = getBatchOperation(input.batch_operation_id);

  // ============================================================================
  // Step 3: Return result
  // ============================================================================
  if (!operation) {
    return {
      found: false,
      message: `Batch operation "${input.batch_operation_id}" not found. Operations are kept in memory for 1 hour after completion.`,
    };
  }

  return {
    found: true,
    operation,
  };
}
