/**
 * TypeScript type definitions for dart-query MCP server
 */

// ============================================================================
// Dart API Types
// ============================================================================

export interface DartTask {
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
  name: string;
  email?: string;
}

export interface DartBoard {
  name: string;
}

export interface DartStatus {
  name: string;
}

export interface DartTag {
  name: string;
}

export interface DartFolder {
  name: string;
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
  dart_id: string; // task id
  text: string;
  author: {
    dart_id: string;
    name: string;
  };
  created_at: string;
}

// ============================================================================
// Config Types
// ============================================================================

export interface DartConfig {
  today?: string;
  user?: DartUser;
  assignees: DartUser[];
  dartboards: string[];
  statuses: string[];
  tags: string[];
  priorities: string[];
  sizes: string[];
  folders: string[];
  types?: string[];
  skills?: string[];
  customProperties?: Array<{ name: string; type: string; options?: string[] }>;
  cached_at?: string;
  cache_ttl_seconds?: number;
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
}

export interface GetTaskOutput {
  task: DartTask;
  comments?: DartComment[];
  url: string;
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
  priority?: string; // "critical", "high", "medium", "low"
  tags?: string[];
  due_before?: string;
  due_after?: string;
  limit?: number;
  offset?: number;
  detail_level?: 'minimal' | 'standard' | 'full';
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
  preview_tasks?: Array<{ dart_id: string; title: string; current_values: Partial<DartTask> }>;
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
