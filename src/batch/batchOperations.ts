/**
 * Batch Operations Utility
 *
 * Manages batch operation state tracking, ID generation, and shared utilities
 * for batch_update_tasks, batch_delete_tasks, and import_tasks_csv tools.
 */

import { BatchOperation } from '../types/index.js';

/**
 * In-memory batch operation store
 * Maps batch_operation_id to BatchOperation state
 */
const batchOperations = new Map<string, BatchOperation>();

/**
 * Generate a unique batch operation ID
 * Format: batch_OPERATION_TIMESTAMP_RANDOM
 *
 * @param operationType - Type of batch operation (update, delete, import)
 * @returns Unique batch operation ID
 *
 * @example
 * generateBatchOperationId('update') // => 'batch_update_1706123456789_a1b2c3'
 */
export function generateBatchOperationId(
  operationType: 'update' | 'delete' | 'import'
): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `batch_${operationType}_${timestamp}_${random}`;
}

/**
 * Create and register a new batch operation
 *
 * @param operationType - Type of batch operation
 * @param totalItems - Total number of items to process
 * @returns BatchOperation with initial state
 */
export function createBatchOperation(
  operationType: 'update' | 'delete' | 'import',
  totalItems: number
): BatchOperation {
  const batchOperationId = generateBatchOperationId(operationType);

  const operation: BatchOperation = {
    batch_operation_id: batchOperationId,
    operation_type: operationType,
    status: 'running',
    progress: {
      completed: 0,
      total: totalItems,
      percent: 0,
    },
    successful_ids: [],
    failed_items: [],
    started_at: new Date().toISOString(),
  };

  batchOperations.set(batchOperationId, operation);

  return operation;
}

/**
 * Update batch operation progress
 *
 * @param batchOperationId - Batch operation ID
 * @param completed - Number of completed items
 */
export function updateBatchProgress(
  batchOperationId: string,
  completed: number
): void {
  const operation = batchOperations.get(batchOperationId);
  if (!operation) return;

  operation.progress.completed = completed;
  operation.progress.percent = Math.round((completed / operation.progress.total) * 100);
}

/**
 * Mark batch operation as completed
 *
 * @param batchOperationId - Batch operation ID
 * @param status - Final status (completed or failed)
 */
export function completeBatchOperation(
  batchOperationId: string,
  status: 'completed' | 'failed'
): void {
  const operation = batchOperations.get(batchOperationId);
  if (!operation) return;

  operation.status = status;
  operation.completed_at = new Date().toISOString();
  operation.execution_time_ms =
    new Date(operation.completed_at).getTime() - new Date(operation.started_at).getTime();
}

/**
 * Get batch operation by ID
 *
 * @param batchOperationId - Batch operation ID
 * @returns BatchOperation or undefined if not found
 */
export function getBatchOperation(batchOperationId: string): BatchOperation | undefined {
  return batchOperations.get(batchOperationId);
}

/**
 * Add successful item to batch operation
 *
 * @param batchOperationId - Batch operation ID
 * @param itemId - ID of successful item (dart_id or row number)
 */
export function addSuccessfulItem(batchOperationId: string, itemId: string): void {
  const operation = batchOperations.get(batchOperationId);
  if (!operation) return;

  operation.successful_ids.push(itemId);
}

/**
 * Add failed item to batch operation
 *
 * @param batchOperationId - Batch operation ID
 * @param error - Error details
 */
export function addFailedItem(
  batchOperationId: string,
  error: { id?: string; row_number?: number; error: string }
): void {
  const operation = batchOperations.get(batchOperationId);
  if (!operation) return;

  operation.failed_items.push(error);
}

/**
 * Clean up old batch operations (older than 1 hour)
 * Call this periodically to prevent memory leaks
 */
export function cleanupOldOperations(): void {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;

  for (const [id, operation] of batchOperations.entries()) {
    const startedAt = new Date(operation.started_at).getTime();
    if (startedAt < oneHourAgo && operation.status !== 'running') {
      batchOperations.delete(id);
    }
  }
}
