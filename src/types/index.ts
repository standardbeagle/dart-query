/**
 * TypeScript type definitions for dart-query MCP server
 */

// ============================================================================
// Task Relationship Types
// ============================================================================

/**
 * TaskRelationships groups all task relationship arrays.
 *
 * All relationship fields are optional arrays of task dart_ids.
 * These relationships allow tasks to be connected in various ways
 * to model dependencies, duplicates, and related work items.
 *
 * Canonical names follow Jira/Linear conventions: `subtasks`, `blocked_by`,
 * `blocks`, `duplicates`, `related`. The legacy `_ids`-suffixed names remain
 * for one minor version and will be removed in the next breaking release.
 */
export interface TaskRelationships {
  /**
   * IDs of tasks that are subtasks (children) of this task.
   * Subtasks represent work that is part of completing the parent task.
   */
  subtasks?: string[];

  /**
   * IDs of tasks that block this task from being started or completed.
   * This task cannot proceed until all blocker tasks are resolved.
   */
  blocked_by?: string[];

  /**
   * IDs of tasks that this task is blocking.
   * Those tasks cannot proceed until this task is resolved.
   */
  blocks?: string[];

  /**
   * IDs of tasks that are duplicates of this task.
   * Duplicate tasks represent the same work item created multiple times.
   */
  duplicates?: string[];

  /**
   * IDs of tasks that are related to this task.
   * Related tasks are loosely connected but not dependencies or duplicates.
   */
  related?: string[];

  /** @deprecated Use `subtasks`. Removed in 0.13.0. */
  subtask_ids?: string[];
  /** @deprecated Use `blocked_by`. Removed in 0.13.0. */
  blocker_ids?: string[];
  /** @deprecated Use `blocks`. Removed in 0.13.0. */
  blocking_ids?: string[];
  /** @deprecated Use `duplicates`. Removed in 0.13.0. */
  duplicate_ids?: string[];
  /** @deprecated Use `related`. Removed in 0.13.0. */
  related_ids?: string[];
}

// ============================================================================
// Dart API Types
// ============================================================================

export interface DartTask extends TaskRelationships {
  dart_id: string;
  title: string;
  description?: string;
  status?: string;
  status_id?: string;
  priority?: number; // 1-5 (1=lowest, 5=highest)
  size?: number; // 1-5 (1=XS, 5=XL)
  assignees?: string[];
  tags?: string[];
  dartboard?: string;
  dartboard_id?: string;
  due_at?: string;
  start_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
  /** ID of parent task (canonical name). */
  parent?: string | null;
  /** @deprecated Use `parent`. Removed in 0.13.0. */
  parent_task?: string;
  url?: string;
}

export interface DartUser {
  dart_id?: string;
  name: string;
  email?: string;
}

export interface DartBoard {
  dart_id: string;
  name: string;
}

export interface DartStatus {
  dart_id: string;
  name: string;
}

export interface DartTag {
  dart_id: string;
  name: string;
}

export interface DartFolder {
  dart_id: string;
  name: string;
}

export interface DartPriority {
  value: number;
  label: string;
}

export interface DartSize {
  value: number;
  label: string;
}

export interface DartDoc {
  doc_id: string;
  title: string;
  text: string;
  folder?: string;
  folder_id?: string;
  created_at: string;
  updated_at: string;
  url?: string;
}

export interface DartComment {
  comment_id: string;
  dart_id?: string; // task id (optional in list responses)
  text: string;
  author: string;
  created_at?: string;
  parent_id?: string; // For threaded comments
}

// ============================================================================
// Config Types
// ============================================================================

export interface DartConfig {
  today?: string;
  user?: DartUser;
  assignees: DartUser[];
  dartboards: (DartBoard | string)[];
  statuses: (DartStatus | string)[];
  tags: (DartTag | string)[];
  priorities: DartPriority[];
  sizes: DartSize[];
  folders: DartFolder[];
  types?: string[];
  skills?: string[];
  customProperties?: Array<{ name: string; type: string; options?: string[] }>;
  cached_at?: string;
  cache_ttl_seconds?: number;
}

// ============================================================================
// Config Helper Functions
// ============================================================================

/** Extract names from dartboards array for fuzzy matching */
export function getDartboardNames(dartboards: (DartBoard | string)[]): string[] {
  return dartboards.map(d => typeof d === 'string' ? d : d.name);
}

/** Extract names from statuses array for fuzzy matching */
export function getStatusNames(statuses: (DartStatus | string)[]): string[] {
  return statuses.map(s => typeof s === 'string' ? s : s.name);
}

/** Extract names from tags array for fuzzy matching */
export function getTagNames(tags: (DartTag | string)[]): string[] {
  return tags.map(t => typeof t === 'string' ? t : t.name);
}

/** Extract names from folders array for fuzzy matching */
export function getFolderNames(folders: (DartFolder | string)[]): string[] {
  return folders.map(f => typeof f === 'string' ? f : f.name);
}

/** Extract labels from priorities array for fuzzy matching */
export function getPriorityLabels(priorities: DartPriority[]): string[] {
  return priorities.map(p => p.label);
}

/** Extract labels from sizes array for fuzzy matching */
export function getSizeLabels(sizes: DartSize[]): string[] {
  return sizes.map(s => s.label);
}

/** Find dartboard by name or dart_id (case-insensitive) */
export function findDartboard(dartboards: (DartBoard | string)[], input: string): DartBoard | string | undefined {
  const normalized = input.toLowerCase().trim();
  return dartboards.find(d => {
    if (typeof d === 'string') {
      return d.toLowerCase() === normalized;
    }
    return d.name?.toLowerCase() === normalized || d.dart_id?.toLowerCase() === normalized;
  });
}

/** Get dart_id from a dartboard (handles both string and object formats) */
export function getDartboardId(dartboard: DartBoard | string): string {
  if (typeof dartboard === 'string') {
    return dartboard; // When API returns strings, the string IS the identifier
  }
  return dartboard.dart_id;
}

/** Get name from a dartboard (handles both string and object formats) */
export function getDartboardName(dartboard: DartBoard | string): string {
  if (typeof dartboard === 'string') {
    return dartboard;
  }
  return dartboard.name;
}

/** Find status by name or dart_id (case-insensitive) */
export function findStatus(statuses: (DartStatus | string)[], input: string): DartStatus | string | undefined {
  const normalized = input.toLowerCase().trim();
  return statuses.find(s => {
    if (typeof s === 'string') {
      return s.toLowerCase() === normalized;
    }
    return s.name?.toLowerCase() === normalized || s.dart_id?.toLowerCase() === normalized;
  });
}

/** Get dart_id from a status (handles both string and object formats) */
export function getStatusId(status: DartStatus | string): string {
  if (typeof status === 'string') {
    return status;
  }
  return status.dart_id;
}

/** Find tag by name or dart_id (case-insensitive) */
export function findTag(tags: (DartTag | string)[], input: string): DartTag | string | undefined {
  const normalized = input.toLowerCase().trim();
  return tags.find(t => {
    if (typeof t === 'string') {
      return t.toLowerCase() === normalized;
    }
    return t.name?.toLowerCase() === normalized || t.dart_id?.toLowerCase() === normalized;
  });
}

/** Get dart_id from a tag (handles both string and object formats) */
export function getTagId(tag: DartTag | string): string {
  if (typeof tag === 'string') {
    return tag;
  }
  return tag.dart_id;
}

/** Find folder by name or dart_id (case-insensitive) */
export function findFolder(folders: (DartFolder | string)[], input: string): DartFolder | undefined {
  const normalized = input.toLowerCase().trim();
  for (const f of folders) {
    if (typeof f === 'string') {
      if (f.toLowerCase() === normalized) return { dart_id: f, name: f };
    } else {
      if (f.name?.toLowerCase() === normalized || f.dart_id?.toLowerCase() === normalized) return f;
    }
  }
  return undefined;
}

// ============================================================================
// Tool Input/Output Types
// ============================================================================

export interface InfoInput {
  level?: 'overview' | 'group' | 'tool';
  target?: string;
}

export interface InfoOutput {
  level: string;
  content: string;
  next_steps: string[];
}

export interface GetConfigInput {
  cache_bust?: boolean;
  include?: Array<'assignees' | 'dartboards' | 'statuses' | 'tags' | 'priorities' | 'sizes' | 'folders'>;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  dartboard: string;
  status?: string;
  priority?: number; // 1-5 (1=lowest, 5=highest)
  size?: number; // 1-5 (1=XS, 5=XL)
  assignees?: string[];
  tags?: string[];
  due_at?: string;
  start_at?: string;
  parent_task?: string;
  // Relationship fields for initial creation
  /** IDs of tasks that are subtasks (children) of this task */
  subtask_ids?: string[];
  /** IDs of tasks that block this task */
  blocker_ids?: string[];
  /** IDs of tasks that this task blocks */
  blocking_ids?: string[];
  /** IDs of tasks that are duplicates of this task */
  duplicate_ids?: string[];
  /** IDs of tasks that are related to this task */
  related_ids?: string[];
  /** Optional comment to add after creating the task (non-blocking) */
  comment?: string;
}

export interface CreateTaskOutput {
  dart_id: string;
  title: string;
  url: string;
  created_at: string;
  all_fields: DartTask;
  comment_added?: boolean;
  /**
   * IDs of tasks whose inverse-side relationships were auto-patched after
   * this create. e.g. setting `parent: P` causes `P.subtasks` to be updated;
   * `P` would appear here.
   */
  mirror_applied?: string[];
  /**
   * Human-readable warnings for inverse-side patches that failed. Non-empty
   * means the graph is asymmetric — the primary task was still created.
   */
  mirror_warnings?: string[];
}

export interface GetTaskInput {
  dart_id: string;
  include_comments?: boolean;
  /**
   * Include relationship fields in response (default: true).
   * When false, relationship arrays are omitted for smaller response.
   */
  include_relationships?: boolean;
  /**
   * Expand related task summaries (fetch titles for each related task).
   * Requires additional API calls. Only applies when include_relationships is true.
   */
  expand_relationships?: boolean;
}

/**
 * Summary of a related task (title only for compact display)
 */
export interface RelatedTaskSummary {
  dart_id: string;
  title: string;
}

/**
 * Expanded relationship information with titles
 */
export interface ExpandedRelationships {
  subtasks?: RelatedTaskSummary[];
  blockers?: RelatedTaskSummary[];
  blocking?: RelatedTaskSummary[];
  duplicates?: RelatedTaskSummary[];
  related?: RelatedTaskSummary[];
}

/**
 * Relationship counts for quick overview
 */
export interface RelationshipCounts {
  subtasks: number;
  blockers: number;
  blocking: number;
  duplicates: number;
  related: number;
  total: number;
}

export interface GetTaskOutput {
  task: DartTask;
  comments?: DartComment[];
  url: string;
  /**
   * Relationship counts for quick overview (when include_relationships is true)
   */
  relationship_counts?: RelationshipCounts;
  /**
   * Expanded relationship details with titles (when expand_relationships is true)
   */
  expanded_relationships?: ExpandedRelationships;
}

/**
 * Flat input for update_task - all fields at top level alongside dart_id.
 * Only dart_id is required; include any fields you want to change.
 */
/** Relationship field names that support add_to/remove_from operations */
export const RELATIONSHIP_FIELDS = ['subtask_ids', 'blocker_ids', 'blocking_ids', 'duplicate_ids', 'related_ids'] as const;
export type RelationshipField = typeof RELATIONSHIP_FIELDS[number];

export type UpdateTaskInput = { dart_id: string } & Partial<Omit<DartTask, 'dart_id' | 'created_at' | 'updated_at'>> & {
  /** Optional comment to add after updating the task */
  comment?: string;
  /** Append IDs to relationship arrays (merges with existing, deduplicates) */
  add_to?: Partial<Record<RelationshipField, string[]>>;
  /** Remove IDs from relationship arrays */
  remove_from?: Partial<Record<RelationshipField, string[]>>;
};

export interface UpdateTaskOutput {
  dart_id: string;
  updated_fields: string[];
  task: DartTask;
  url: string;
  comment_added?: boolean;
  /** Surfaced when a comment was attempted but failed (update itself succeeded) */
  comment_error?: string;
  /**
   * IDs of inverse-side tasks whose relationships were auto-patched after
   * this update — e.g. changing `parent` from P1 to P2 patches both
   * `P1.subtasks` and `P2.subtasks`.
   */
  mirror_applied?: string[];
  /**
   * Warnings for inverse-side patches that failed. Non-empty means the
   * graph is asymmetric — the primary update still succeeded.
   */
  mirror_warnings?: string[];
}

/**
 * Atomic bidirectional task-link verb input.
 *
 * Maps onto Linear's issueRelationCreate semantics: pick a relationship
 * type, point `from` at the anchor task, list one or more targets in `to`.
 * The dart-query auto-mirror layer writes both sides of the relationship
 * in a single call so callers cannot accidentally leave the graph
 * asymmetric (a common LLM failure mode).
 */
export interface LinkTasksInput {
  /** Relationship verb */
  type: 'parent' | 'subtasks' | 'blocks' | 'blocked_by' | 'duplicates' | 'related';
  /** Anchor task — the dart_id the relationship is being added to */
  from: string;
  /**
   * Target dart_ids. Must be length 1 for `type: "parent"`; arbitrary
   * length for all other types.
   */
  to: string[];
}

export interface LinkTasksOutput {
  from: string;
  type: LinkTasksInput['type'];
  to: string[];
  url: string;
  /** Inverse-side task IDs that were auto-mirrored */
  mirror_applied: string[];
  /** Warnings for inverse-side patches that failed (best-effort mirror) */
  mirror_warnings: string[];
}

export interface DeleteTaskInput {
  dart_id: string;
}

export interface DeleteTaskOutput {
  dart_id: string;
  deleted: boolean;
  recoverable: boolean;
  message: string;
}

export interface ListTasksInput {
  assignee?: string;
  status?: string;
  dartboard?: string;
  priority?: number; // 1-5 (1=lowest, 5=highest)
  tags?: string[];
  due_before?: string;
  due_after?: string;
  limit?: number;
  offset?: number;
  detail_level?: 'minimal' | 'standard' | 'full';

  // Relationship filters (client-side filtering)
  /**
   * Filter tasks that have a parent task (true) or no parent task (false).
   * Filters based on parent_task field being set or undefined.
   * Note: Other relationship filters (has_subtasks, has_blockers, is_blocking)
   * are not available because the list API doesn't return taskRelationships data.
   */
  has_parent?: boolean;
}

export interface ListTasksOutput {
  tasks: DartTask[];
  total_count: number;
  returned_count: number;
  has_more: boolean;
  next_offset: number | null;
  filters_applied: Record<string, unknown>;
}

// ============================================================================
// Loop Snapshot Types (dartai_loop_snapshot)
// ============================================================================

/**
 * Compact task representation for loop snapshot output.
 *
 * Note: kept standalone (not `Pick<DartTask, ...>`) because `DartTask.status`
 * is optional (`string | undefined`) while loop snapshot guarantees a string —
 * tasks without a status are not partitioned into any bucket.
 */
export interface TaskSummary {
  dart_id: string;
  title: string;
  status: string;
  tags: string[];
  assignees: string[];
}

export interface LoopSnapshotInput {
  /** Dartboard name (exact match) or dart_id. Resolved against config cache. */
  dartboard: string;
  /** Optional runner dart_id; when set, populates `runner_claimed` partition. */
  runner_dart_id?: string;
  /** Max tasks returned in `queue`. Default 20. */
  queue_limit?: number;
}

export interface LoopSnapshotOutput {
  dartboard_id: string;
  config: {
    statuses: string[];
    assignees: { dart_id: string; email: string }[];
  };
  /** Todo status, no `claimed:*` tag, not `loop-blocked` tagged. */
  queue: TaskSummary[];
  /** In Progress status assigned to `runner_dart_id`. Empty when runner not provided. */
  runner_claimed: TaskSummary[];
  /** Tasks tagged `loop-blocked` regardless of status. */
  blocked: TaskSummary[];
  /** ISO-8601 timestamp of when the snapshot was assembled. */
  fetched_at: string;
}

// ============================================================================
// Batch Operation Types
// ============================================================================

export interface BatchUpdateTasksInput {
  selector: string; // DartQL WHERE clause
  updates: Partial<Omit<DartTask, 'dart_id' | 'created_at' | 'updated_at'>>;
  dry_run?: boolean;
  concurrency?: number;
}

export interface BatchUpdateTasksOutput {
  batch_operation_id: string;
  selector_matched: number;
  dry_run: boolean;
  preview_tasks?: Array<{
    dart_id: string;
    title: string;
    current_values: Partial<DartTask>;
    new_values: Partial<DartTask>;
  }>;
  successful_updates: number;
  failed_updates: number;
  successful_dart_ids: string[];
  failed_items: Array<{ dart_id: string; error: string; reason: string }>;
  execution_time_ms: number;
}

export interface BatchDeleteTasksInput {
  selector: string;
  dry_run?: boolean;
  confirm?: boolean;
  concurrency?: number;
}

export interface BatchDeleteTasksOutput {
  batch_operation_id: string;
  selector_matched: number;
  dry_run: boolean;
  preview_tasks?: Array<{ dart_id: string; title: string }>;
  successful_deletions: number;
  failed_deletions: number;
  deleted_dart_ids: string[];
  failed_items: Array<{ dart_id: string; error: string }>;
  recoverable: boolean;
  execution_time_ms?: number;
}

// ============================================================================
// CSV Import Types
// ============================================================================

export interface ImportTasksCSVInput {
  csv_data?: string;
  csv_file_path?: string;
  dartboard: string;
  column_mapping?: Record<string, string>;
  validate_only?: boolean;
  continue_on_error?: boolean;
  concurrency?: number;
}

export interface ImportTasksCSVOutput {
  batch_operation_id: string;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  validation_errors: Array<{ row_number: number; errors: string[] }>;
  preview?: Array<{ row_number: number; task_preview: Partial<DartTask> }>;
  created_tasks: number;
  failed_tasks: number;
  created_dart_ids: string[];
  failed_items: Array<{ row_number: number; error: string; row_data: Record<string, unknown> }>;
  execution_time_ms: number;
}

// ============================================================================
// Document CRUD Types
// ============================================================================

export interface ListDocsInput {
  folder?: string;
  title_contains?: string;
  text_contains?: string;
  limit?: number;
  offset?: number;
}

export interface ListDocsOutput {
  docs: DartDoc[];
  total_count: number;
  returned_count: number;
  has_more: boolean;
  next_offset: number | null;
  filters_applied: Record<string, unknown>;
}

export interface CreateDocInput {
  title: string;
  text: string;
  folder?: string;
}

export interface CreateDocOutput {
  doc_id: string;
  title: string;
  url: string;
  created_at: string;
  all_fields: DartDoc;
}

export interface GetDocInput {
  doc_id: string;
}

export interface GetDocOutput {
  doc: DartDoc;
  url: string;
}

export interface UpdateDocInput {
  doc_id: string;
  updates: {
    title?: string;
    text?: string;
    folder?: string;
  };
}

export interface UpdateDocOutput {
  doc_id: string;
  updated_fields: string[];
  doc: DartDoc;
  url: string;
}

export interface DeleteDocInput {
  doc_id: string;
}

export interface DeleteDocOutput {
  doc_id: string;
  deleted: boolean;
  recoverable: boolean;
  message: string;
}

// ============================================================================
// DartQL Types
// ============================================================================

export type DartQLOperator = '=' | '!=' | '>' | '>=' | '<' | '<=' | 'IN' | 'NOT IN' | 'LIKE' | 'CONTAINS' | 'IS NULL' | 'IS NOT NULL' | 'BETWEEN';
export type DartQLLogicalOperator = 'AND' | 'OR' | 'NOT';

export interface DartQLExpression {
  type: 'comparison' | 'logical' | 'group';
  field?: string;
  operator?: DartQLOperator | DartQLLogicalOperator;
  value?: unknown;
  left?: DartQLExpression;
  right?: DartQLExpression;
  expressions?: DartQLExpression[];
}

export interface DartQLParseResult {
  ast: DartQLExpression;
  fields: string[];
  errors: string[];
}

// ============================================================================
// DartQL Statement Types (UPDATE/DELETE language)
// ============================================================================

export interface DartQLProgram {
  statements: DartQLStatement[];
}

export type DartQLStatement = DartQLUpdateStatement | DartQLDeleteStatement;

export interface DartQLUpdateStatement {
  type: 'update';
  where: DartQLExpression;
  assignments: DartQLAssignment[];
  comment?: string; // raw template with {field} placeholders
}

export interface DartQLDeleteStatement {
  type: 'delete';
  where: DartQLExpression;
  confirmed: boolean;
}

export interface DartQLAssignment {
  field: string;
  value: DartQLSetValue;
}

export type DartQLSetValue =
  | { type: 'string'; value: string }
  | { type: 'number'; value: number }
  | { type: 'null' }
  | { type: 'array'; elements: DartQLSetValue[] };

export interface DartQLStatementParseResult {
  program: DartQLProgram;
  errors: string[];
}

export interface ExecuteDartQLInput {
  query: string;
  dry_run?: boolean;     // default true
  concurrency?: number;  // 1-20, default 5
}

export interface ExecuteDartQLOutput {
  batch_operation_id: string;
  dry_run: boolean;
  statements: StatementResult[];
  total_matched: number;
  total_succeeded: number;
  total_failed: number;
  execution_time_ms: number;
}

export interface StatementResult {
  statement_index: number;
  statement_type: 'update' | 'delete';
  selector_matched: number;
  succeeded: number;
  failed: number;
  preview_tasks?: Array<{ dart_id: string; title: string; planned_ops: string[] }>;
  successful_dart_ids?: string[];
  failed_items?: Array<{ dart_id: string; error: string }>;
  comments_added?: number;
  comments_failed?: number;
}

// ============================================================================
// Batch Operation State
// ============================================================================

export interface BatchOperation {
  batch_operation_id: string;
  operation_type: 'update' | 'delete' | 'import' | 'dartql';
  status: 'running' | 'completed' | 'failed';
  progress: {
    completed: number;
    total: number;
    percent: number;
  };
  successful_ids: string[];
  failed_items: Array<{ id?: string; row_number?: number; error: string }>;
  started_at: string;
  completed_at?: string;
  execution_time_ms?: number;
}

export interface GetBatchStatusInput {
  batch_operation_id: string;
}

export interface GetBatchStatusOutput {
  found: boolean;
  operation?: BatchOperation;
  message?: string;
}

// ============================================================================
// Search Tasks Types
// ============================================================================

export interface SearchTasksInput {
  query: string;
  dartboard?: string;
  include_completed?: boolean;
  limit?: number;
}

export interface SearchTasksOutput {
  tasks: Array<DartTask & { relevance_score: number }>;
  total_results: number;
  query_parsed: {
    terms: string[];
    phrases: string[];
    exclusions: string[];
    filters: Record<string, string>;
  };
  search_method: 'api' | 'client_side';
}

// ============================================================================
// Task Comment Types
// ============================================================================

export interface AddTaskCommentInput {
  dart_id: string;
  text: string;
}

export interface AddTaskCommentOutput {
  comment_id: string;
  dart_id: string;
  text: string;
  author: string;
}

// ============================================================================
// Error Types
// ============================================================================

export class DartAPIError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public response?: unknown
  ) {
    super(message);
    this.name = 'DartAPIError';
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public field?: string,
    public suggestions?: string[]
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Resolve dart_id from input, accepting id, task_id, or taskId as aliases.
 * Returns the resolved dart_id string or throws ValidationError.
 */
export function resolveDartId(input: Record<string, unknown>): string {
  const dartId = input.dart_id ?? input.id ?? input.task_id ?? input.taskId;
  if (!dartId || typeof dartId !== 'string' || dartId.trim() === '') {
    throw new ValidationError('dart_id is required and must be a non-empty string', 'dart_id');
  }
  return dartId.trim();
}

export class DartQLParseError extends Error {
  constructor(
    message: string,
    public position?: number,
    public token?: string
  ) {
    super(message);
    this.name = 'DartQLParseError';
  }
}

// ============================================================================
// List Comments Types
// ============================================================================

export interface ListCommentsInput {
  task_id: string;
  limit?: number;
  offset?: number;
}

export interface ListCommentsOutput {
  comments: DartComment[];
  total_count: number;
  returned_count: number;
  has_more: boolean;
  next_offset: number | null;
  task_id: string;
}

// ============================================================================
// Move Task Types
// ============================================================================

export interface MoveTaskInput {
  dart_id: string;
  dartboard?: string;
  order?: number;
  after_id?: string;
  before_id?: string;
}

export interface MoveTaskOutput {
  dart_id: string;
  dartboard: string;
  task: DartTask;
  url: string;
}

// ============================================================================
// Time Tracking Types
// ============================================================================

export interface AddTimeTrackingInput {
  dart_id: string;
  started_at: string;
  finished_at?: string;
  duration_minutes?: number;
  note?: string;
}

export interface TimeTrackingEntry {
  entry_id: string;
  dart_id: string;
  started_at: string;
  finished_at?: string;
  duration_minutes: number;
  note?: string;
}

export interface AddTimeTrackingOutput {
  entry: TimeTrackingEntry;
  task_id: string;
  url: string;
}

// ============================================================================
// Attach URL Types
// ============================================================================

export interface AttachUrlInput {
  dart_id: string;
  url: string;
  filename?: string;
}

export interface AttachUrlOutput {
  attachment_id: string;
  dart_id: string;
  url: string;
  filename: string;
  task_url: string;
}

// ============================================================================
// Dartboard Types
// ============================================================================

export interface GetDartboardInput {
  dartboard_id: string;
}

export interface GetDartboardOutput {
  dart_id: string;
  name: string;
  description?: string;
  task_count?: number;
  url: string;
}

// ============================================================================
// Folder Types
// ============================================================================

export interface GetFolderInput {
  folder_id: string;
}

export interface GetFolderOutput {
  dart_id: string;
  name: string;
  doc_count?: number;
  url: string;
}
