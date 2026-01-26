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
 */
export interface TaskRelationships {
  /**
   * IDs of tasks that are subtasks (children) of this task.
   * Subtasks represent work that is part of completing the parent task.
   */
  subtask_ids?: string[];

  /**
   * IDs of tasks that block this task from being started or completed.
   * This task cannot proceed until all blocker tasks are resolved.
   */
  blocker_ids?: string[];

  /**
   * IDs of tasks that this task is blocking.
   * Those tasks cannot proceed until this task is resolved.
   */
  blocking_ids?: string[];

  /**
   * IDs of tasks that are duplicates of this task.
   * Duplicate tasks represent the same work item created multiple times.
   */
  duplicate_ids?: string[];

  /**
   * IDs of tasks that are related to this task.
   * Related tasks are loosely connected but not dependencies or duplicates.
   */
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
  priority?: string; // "critical", "high", "medium", "low"
  size?: string; // e.g., "small", "medium", "large", "xs", "xl"
  assignees?: string[];
  tags?: string[];
  dartboard?: string;
  dartboard_id?: string;
  due_at?: string;
  start_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
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
  author: {
    dart_id: string;
    name: string;
  };
  created_at: string;
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
export function getFolderNames(folders: DartFolder[]): string[] {
  return folders.map(f => f.name);
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
export function findFolder(folders: DartFolder[], input: string): DartFolder | undefined {
  const normalized = input.toLowerCase().trim();
  return folders.find(
    f => f.name?.toLowerCase() === normalized || f.dart_id?.toLowerCase() === normalized
  );
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
  priority?: string; // "critical", "high", "medium", "low"
  size?: string; // e.g., "small", "medium", "large", "xs", "xl"
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
}

export interface CreateTaskOutput {
  dart_id: string;
  title: string;
  url: string;
  created_at: string;
  all_fields: DartTask;
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

export interface UpdateTaskInput {
  dart_id: string;
  updates: Partial<Omit<DartTask, 'dart_id' | 'created_at' | 'updated_at'>>;
}

export interface UpdateTaskOutput {
  dart_id: string;
  updated_fields: string[];
  task: DartTask;
  url: string;
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
  priority?: string | number; // "critical", "high", "medium", "low" or numeric value 0-5
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
// Batch Operation State
// ============================================================================

export interface BatchOperation {
  batch_operation_id: string;
  operation_type: 'update' | 'delete' | 'import';
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
  author: {
    dart_id: string;
    name: string;
  };
  created_at: string;
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
