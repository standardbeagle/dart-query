/**
 * execute_dartql Tool Handler
 *
 * Executes DartQL UPDATE/DELETE statements with:
 * - Multi-statement support (semicolon-separated)
 * - Template variable interpolation in SET values and COMMENTs
 * - Array literal support for relationship fields
 * - Dry-run by default for safety
 *
 * Replaces batch_update_tasks and batch_delete_tasks with a single,
 * more powerful SQL-like interface that LLMs find easier to use.
 */

import pLimit from 'p-limit';
import { DartClient } from '../api/dartClient.js';
import { handleGetConfig } from './get_config.js';
import { parseDartQLStatements, convertToFilters } from '../parsers/dartql.js';
import {
  ExecuteDartQLInput,
  ExecuteDartQLOutput,
  StatementResult,
  DartQLUpdateStatement,
  DartQLDeleteStatement,
  DartQLSetValue,
  DartAPIError,
  ValidationError,
  DartConfig,
  DartTask,
} from '../types/index.js';
import { validateUpdates } from '../batch/validateUpdates.js';
import {
  createBatchOperation,
  completeBatchOperation,
  addSuccessfulItem,
  addFailedItem,
} from '../batch/batchOperations.js';

/**
 * Interpolate {field} template variables in a string using pre-update task values.
 */
export function interpolateTemplate(template: string, task: DartTask): string {
  return template.replace(/\{(\w+)\}/g, (_match, field) => {
    const val = task[field as keyof DartTask];
    if (val === null || val === undefined) return '';
    if (Array.isArray(val)) return val.join(', ');
    return String(val);
  });
}

/**
 * Convert DartQLSetValue AST node to a string value, interpolating templates.
 */
function setValueToPlainWithTemplate(sv: DartQLSetValue, task: DartTask): unknown {
  switch (sv.type) {
    case 'string': return interpolateTemplate(sv.value, task);
    case 'number': return sv.value;
    case 'null': return undefined;
    case 'array': return sv.elements.map(e => setValueToPlainWithTemplate(e, task));
  }
}

/**
 * Build a Partial<DartTask> from assignments for a specific task (with template interpolation).
 */
function assignmentsToUpdates(
  assignments: DartQLUpdateStatement['assignments'],
  task: DartTask
): Partial<DartTask> {
  const updates: Record<string, unknown> = {};
  for (const { field, value } of assignments) {
    updates[field] = setValueToPlainWithTemplate(value, task);
  }
  return updates as Partial<DartTask>;
}

/**
 * Build planned operations descriptions for dry-run preview.
 */
function buildPlannedOps(stmt: DartQLUpdateStatement | DartQLDeleteStatement): string[] {
  if (stmt.type === 'delete') {
    return ['DELETE task'];
  }
  const ops: string[] = [];
  for (const a of stmt.assignments) {
    ops.push(`SET ${a.field} = ${formatSetValue(a.value)}`);
  }
  if (stmt.comment) {
    ops.push(`COMMENT '${stmt.comment}'`);
  }
  return ops;
}

function formatSetValue(sv: DartQLSetValue): string {
  switch (sv.type) {
    case 'string': return `'${sv.value}'`;
    case 'number': return String(sv.value);
    case 'null': return 'NULL';
    case 'array': return `[${sv.elements.map(formatSetValue).join(', ')}]`;
  }
}

/**
 * Fetch all matching tasks for a WHERE clause with pagination and 10K cap.
 */
async function fetchMatchingTasks(
  client: DartClient,
  whereExpr: import('../types/index.js').DartQLExpression
): Promise<DartTask[]> {
  const filterResult = convertToFilters(whereExpr);

  if (filterResult.errors.length > 0) {
    throw new ValidationError(
      `DartQL filter conversion errors: ${filterResult.errors.join('; ')}`,
      'query',
      filterResult.errors
    );
  }

  let matchingTasks: DartTask[] = [];
  const apiFilters = filterResult.apiFilters;
  let offset = 0;
  const pageSize = 500;
  let hasMore = true;

  while (hasMore) {
    const response = await client.listTasks({
      ...apiFilters,
      limit: pageSize,
      offset,
    });

    matchingTasks.push(...(response.tasks || []));
    hasMore = offset + pageSize < (response.total || 0);
    offset += pageSize;

    if (matchingTasks.length >= 10000) {
      throw new ValidationError(
        'Statement matches too many tasks (>10,000). Please narrow your WHERE clause.',
        'query'
      );
    }
  }

  if (filterResult.requiresClientSide && filterResult.clientFilter) {
    matchingTasks = matchingTasks.filter(filterResult.clientFilter);
  }

  return matchingTasks;
}

/**
 * Handle execute_dartql tool calls.
 */
export async function handleExecuteDartQL(
  input: ExecuteDartQLInput
): Promise<ExecuteDartQLOutput> {
  const DART_TOKEN = process.env.DART_TOKEN;

  if (!DART_TOKEN) {
    throw new DartAPIError(
      'DART_TOKEN environment variable is required. Get your token from: https://app.dartai.com/?settings=account',
      401
    );
  }

  // Validate input
  if (!input || typeof input !== 'object') {
    throw new ValidationError('input is required and must be an object', 'input');
  }
  if (!input.query || typeof input.query !== 'string' || input.query.trim() === '') {
    throw new ValidationError('query is required and must be a non-empty DartQL statement', 'query');
  }

  const dryRun = input.dry_run !== false;

  let concurrency = input.concurrency ?? 5;
  if (typeof concurrency !== 'number' || !Number.isInteger(concurrency)) {
    throw new ValidationError('concurrency must be an integer', 'concurrency');
  }
  if (concurrency < 1 || concurrency > 20) {
    throw new ValidationError('concurrency must be between 1 and 20', 'concurrency');
  }

  // Parse
  const parseResult = parseDartQLStatements(input.query);
  if (parseResult.errors.length > 0) {
    throw new ValidationError(
      `DartQL parse errors: ${parseResult.errors.join('; ')}`,
      'query',
      parseResult.errors
    );
  }

  const { statements } = parseResult.program;

  // Fetch config if any UPDATE statement exists
  let config: DartConfig | undefined;
  if (statements.some(s => s.type === 'update')) {
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
  }

  const client = new DartClient({ token: DART_TOKEN });
  const batchOp = createBatchOperation('dartql', 0);
  const batchId = batchOp.batch_operation_id;
  const startTime = Date.now();

  const statementResults: StatementResult[] = [];
  let totalMatched = 0;
  let totalSucceeded = 0;
  let totalFailed = 0;

  // Execute statements sequentially (each fetches fresh from API)
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];

    try {
      const matchingTasks = await fetchMatchingTasks(client, stmt.where);
      totalMatched += matchingTasks.length;

      if (stmt.type === 'update') {
        const result = await executeUpdateStatement(
          stmt, matchingTasks, client, config!, dryRun, concurrency, batchId
        );
        result.statement_index = i;
        totalSucceeded += result.succeeded;
        totalFailed += result.failed;
        statementResults.push(result);
      } else {
        const result = await executeDeleteStatement(
          stmt, matchingTasks, client, dryRun, concurrency, batchId
        );
        result.statement_index = i;
        totalSucceeded += result.succeeded;
        totalFailed += result.failed;
        statementResults.push(result);
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      statementResults.push({
        statement_index: i,
        statement_type: stmt.type,
        selector_matched: 0,
        succeeded: 0,
        failed: 1,
        failed_items: [{ dart_id: '', error: errMsg }],
      });
      totalFailed += 1;
    }
  }

  const executionTimeMs = Date.now() - startTime;
  const status = totalFailed === 0 ? 'completed' : 'completed';
  completeBatchOperation(batchId, status);

  return {
    batch_operation_id: dryRun ? 'dry_run' : batchId,
    dry_run: dryRun,
    statements: statementResults,
    total_matched: totalMatched,
    total_succeeded: totalSucceeded,
    total_failed: totalFailed,
    execution_time_ms: executionTimeMs,
  };
}

async function executeUpdateStatement(
  stmt: DartQLUpdateStatement,
  matchingTasks: DartTask[],
  client: DartClient,
  config: DartConfig,
  dryRun: boolean,
  concurrency: number,
  batchId: string,
): Promise<StatementResult> {
  const result: StatementResult = {
    statement_index: 0,
    statement_type: 'update',
    selector_matched: matchingTasks.length,
    succeeded: 0,
    failed: 0,
  };

  if (dryRun) {
    result.preview_tasks = matchingTasks.slice(0, 10).map(task => ({
      dart_id: task.dart_id,
      title: task.title,
      planned_ops: buildPlannedOps(stmt),
    }));
    return result;
  }

  const limit = pLimit(concurrency);
  const successfulIds: string[] = [];
  const failedItems: Array<{ dart_id: string; error: string }> = [];
  let commentsAdded = 0;
  let commentsFailed = 0;

  const promises = matchingTasks.map(task => limit(async () => {
    try {
      // Build per-task updates with template interpolation
      const rawUpdates = assignmentsToUpdates(stmt.assignments, task);
      const validated = await validateUpdates(rawUpdates, config);
      await client.updateTask(task.dart_id, validated);

      successfulIds.push(task.dart_id);
      addSuccessfulItem(batchId, task.dart_id);

      // Handle COMMENT if present
      if (stmt.comment) {
        try {
          const commentText = interpolateTemplate(stmt.comment, task);
          await client.addComment(task.dart_id, commentText);
          commentsAdded++;
        } catch {
          commentsFailed++;
        }
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      failedItems.push({ dart_id: task.dart_id, error: errMsg });
      addFailedItem(batchId, { id: task.dart_id, error: errMsg });
    }
  }));

  await Promise.all(promises);

  result.succeeded = successfulIds.length;
  result.failed = failedItems.length;
  result.successful_dart_ids = successfulIds;
  result.failed_items = failedItems.length > 0 ? failedItems : undefined;
  if (stmt.comment) {
    result.comments_added = commentsAdded;
    result.comments_failed = commentsFailed;
  }

  return result;
}

async function executeDeleteStatement(
  stmt: DartQLDeleteStatement,
  matchingTasks: DartTask[],
  client: DartClient,
  dryRun: boolean,
  concurrency: number,
  batchId: string,
): Promise<StatementResult> {
  const result: StatementResult = {
    statement_index: 0,
    statement_type: 'delete',
    selector_matched: matchingTasks.length,
    succeeded: 0,
    failed: 0,
  };

  if (dryRun) {
    result.preview_tasks = matchingTasks.slice(0, 10).map(task => ({
      dart_id: task.dart_id,
      title: task.title,
      planned_ops: ['DELETE task' + (stmt.confirmed ? '' : ' (CONFIRM required)')],
    }));
    return result;
  }

  // Safety: DELETE requires CONFIRM keyword
  if (!stmt.confirmed) {
    throw new ValidationError(
      'DELETE statement requires CONFIRM keyword when dry_run=false. ' +
      'Add CONFIRM to the end of the DELETE statement to proceed.',
      'query'
    );
  }

  const limit = pLimit(concurrency);
  const successfulIds: string[] = [];
  const failedItems: Array<{ dart_id: string; error: string }> = [];

  const promises = matchingTasks.map(task => limit(async () => {
    try {
      await client.deleteTask(task.dart_id);
      successfulIds.push(task.dart_id);
      addSuccessfulItem(batchId, task.dart_id);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      failedItems.push({ dart_id: task.dart_id, error: errMsg });
      addFailedItem(batchId, { id: task.dart_id, error: errMsg });
    }
  }));

  await Promise.all(promises);

  result.succeeded = successfulIds.length;
  result.failed = failedItems.length;
  result.successful_dart_ids = successfulIds;
  result.failed_items = failedItems.length > 0 ? failedItems : undefined;

  return result;
}
