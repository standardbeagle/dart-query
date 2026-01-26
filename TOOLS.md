# dart-query Tools Documentation

**Complete reference for all MCP tools, parameters, workflows, and use cases.**

## Table of Contents

- [Tool Groups Overview](#tool-groups-overview)
- [Discovery Tools](#discovery-tools)
- [Configuration Tools](#configuration-tools)
- [Task CRUD Operations](#task-crud-operations)
- [Task Query Operations](#task-query-operations)
- [Batch Operations](#batch-operations)
- [CSV Import](#csv-import)
- [Document Management](#document-management)
- [DartQL Reference](#dartql-reference)
- [Error Handling](#error-handling)
- [Performance Optimization](#performance-optimization)
- [Common Workflows](#common-workflows)

---

## Tool Groups Overview

dart-query organizes 18 tools into 7 functional groups:

| Group | Tools | Purpose |
|-------|-------|---------|
| **discovery** | `info` | Progressive capability discovery |
| **config** | `get_config` | Workspace configuration |
| **task-crud** | 5 tools | Single task operations (create, get, update, delete, comment) |
| **task-query** | 2 tools | Search and filter tasks (list, search) |
| **task-batch** | 3 tools | Bulk operations (batch update, batch delete, status) |
| **import** | 1 tool | CSV bulk import |
| **doc-crud** | 5 tools | Document management (create, get, update, delete, list) |

**Token Budget Summary:**
- Discovery: ~150 tokens (overview)
- Config: ~400 tokens
- CRUD: ~200-300 tokens per operation
- Batch: ~400 tokens (summary, not full data)
- Import: ~500 tokens

---

## Discovery Tools

### `info` - Progressive Capability Discovery

**Purpose:** Explore dart-query capabilities without loading all schemas. Start here.

**Input Schema:**
```typescript
{
  level?: 'overview' | 'group' | 'tool'  // default: 'overview'
  target?: string                         // group name or tool name
}
```

**Output Schema:**
```typescript
{
  level: string           // echoed back
  content: string         // formatted documentation
  next_steps: string[]    // suggested follow-up queries
}
```

**Examples:**

```typescript
// Get overview of all tool groups
info()
// → Shows sparse table with 7 tool groups

// Explore batch operations
info({ level: 'group', target: 'task-batch' })
// → Shows 3 batch operation tools with descriptions

// Get full documentation for a specific tool
info({ level: 'tool', target: 'batch_update_tasks' })
// → Shows complete schema, examples, DartQL syntax guide
```

**Token Budget:** ~150 tokens (overview), ~200 tokens (group), ~500 tokens (tool)

**Performance:** Instant (no API calls)

---

## Configuration Tools

### `get_config` - Workspace Configuration

**Purpose:** Retrieve workspace configuration including dartboards, assignees, statuses, tags, priorities, sizes, and folders. **Always call this before creating tasks or importing CSV.**

**Input Schema:**
```typescript
{
  cache_bust?: boolean              // default: false, force refresh cache
  include?: string[]                // limit to specific sections
}
```

**Valid `include` values:**
- `"assignees"` - User list with emails
- `"dartboards"` - Board names (Personal/test, Engineering/backend, etc.)
- `"statuses"` - Status names (To Do, Doing, Done, etc.)
- `"tags"` - Tag names
- `"priorities"` - Priority values ("critical", "high", "medium", "low")
- `"sizes"` - Size values ("xs", "small", "medium", "large", "xl")
- `"folders"` - Document folder names

**Output Schema:**
```typescript
{
  assignees: Array<{
    dart_id: string
    name: string
    email: string
    role?: string
  }>

  dartboards: string[]       // e.g., ["Personal/test", "Engineering/backend"]
  statuses: string[]         // e.g., ["To Do", "Doing", "Done"]
  tags: string[]             // e.g., ["bug", "feature", "urgent"]
  priorities: string[]       // e.g., ["critical", "high", "medium", "low"]
  sizes: string[]            // e.g., ["xs", "small", "medium", "large", "xl"]
  folders: string[]          // doc folder names

  cached_at: string          // ISO8601 timestamp
  cache_ttl_seconds: number  // 300 (5 minutes)
}
```

**Examples:**

```typescript
// Get full workspace config (cached for 5 minutes)
get_config()

// Get only dartboards and assignees (token-efficient)
get_config({ include: ["dartboards", "assignees"] })

// Force refresh cached config
get_config({ cache_bust: true })
```

**Use Cases:**
- Validate dartboard names before creating tasks
- Get assignee emails for CSV import
- Check available statuses, tags, priorities, sizes
- Discover valid reference values for batch updates

**Token Budget:** ~400 tokens for full config

**Performance:** Fast (cached) / Medium (API call on cache miss)

---

## Task CRUD Operations

### `create_task` - Create Single Task

**Purpose:** Create a new task with all metadata.

**Input Schema:**
```typescript
{
  title: string                    // REQUIRED, max 500 chars
  dartboard: string                // REQUIRED, dartboard name
  description?: string             // optional description
  status?: string                  // e.g., "To Do", "Doing"
  priority?: string                // "critical", "high", "medium", "low"
  size?: string                    // "xs", "small", "medium", "large", "xl"
  assignees?: string[]             // email addresses or names
  tags?: string[]                  // tag names
  due_at?: string                  // ISO8601 date (e.g., "2026-02-01T00:00:00Z")
  start_at?: string                // ISO8601 date
  parent_task?: string             // parent task dart_id

  // Relationship fields (arrays of dart_id strings)
  subtask_ids?: string[]           // IDs of subtask (child) tasks
  blocker_ids?: string[]           // IDs of tasks that block this task
  blocking_ids?: string[]          // IDs of tasks blocked by this task
  duplicate_ids?: string[]         // IDs of duplicate tasks
  related_ids?: string[]           // IDs of related tasks
}
```

**Output Schema:**
```typescript
{
  dart_id: string                  // unique task ID
  title: string
  description?: string
  status?: string
  priority?: string
  size?: string
  assignees?: string[]
  tags?: string[]
  dartboard: string
  due_at?: string
  start_at?: string
  completed_at?: string
  created_at: string
  updated_at: string
  parent_task?: string
  url?: string                     // web UI link

  // Relationship fields
  subtask_ids?: string[]           // IDs of subtask (child) tasks
  blocker_ids?: string[]           // IDs of tasks that block this task
  blocking_ids?: string[]          // IDs of tasks blocked by this task
  duplicate_ids?: string[]         // IDs of duplicate tasks
  related_ids?: string[]           // IDs of related tasks
}
```

**Examples:**

```typescript
// Minimal task
create_task({
  title: "Fix authentication bug",
  dartboard: "Engineering/backend"
})

// Full task with all metadata
create_task({
  title: "Implement OAuth2 login",
  dartboard: "Engineering/backend",
  description: "Add Google and GitHub OAuth providers",
  status: "To Do",
  priority: "high",
  size: "large",
  assignees: ["engineer@company.com"],
  tags: ["feature", "auth"],
  due_at: "2026-02-15T00:00:00Z"
})

// Task with relationships - creating a task that is blocked by another
create_task({
  title: "Deploy OAuth2 to production",
  dartboard: "Engineering/backend",
  priority: "high",
  blocker_ids: ["duid_oauth_impl"]   // blocked by the OAuth implementation task
})

// Task with multiple relationships
create_task({
  title: "Update user documentation",
  dartboard: "Documentation",
  related_ids: ["duid_oauth_impl", "duid_api_docs"],
  blocking_ids: ["duid_release_v2"]  // this task blocks the v2 release
})
```

**Errors:**
- `ValidationError`: Title empty, dartboard not found, invalid priority/size
- `DartAPIError`: Network errors, authentication failures

**Token Budget:** ~300 tokens

---

### `get_task` - Retrieve Single Task

**Purpose:** Get full details of an existing task by its `dart_id`.

**Input Schema:**
```typescript
{
  dart_id: string                  // REQUIRED
  detail_level?: 'minimal' | 'standard' | 'full'  // default: 'standard'
  include_relationships?: boolean  // default: true, include relationship data
  expand_relationships?: boolean   // default: false, include titles of related tasks
}
```

**Output Schema:**
```typescript
{
  // Core task fields (same as create_task output)
  dart_id: string
  title: string
  description?: string
  status?: string
  priority?: string
  size?: string
  assignees?: string[]
  tags?: string[]
  dartboard: string
  due_at?: string
  start_at?: string
  completed_at?: string
  created_at: string
  updated_at: string
  parent_task?: string
  url?: string

  // Relationship IDs (when include_relationships=true)
  subtask_ids?: string[]
  blocker_ids?: string[]
  blocking_ids?: string[]
  duplicate_ids?: string[]
  related_ids?: string[]

  // Relationship counts (always included when include_relationships=true)
  relationship_counts?: {
    subtasks: number
    blockers: number
    blocking: number
    duplicates: number
    related: number
  }

  // Expanded relationships (when expand_relationships=true)
  expanded_relationships?: {
    subtasks?: Array<{ dart_id: string, title: string }>
    blockers?: Array<{ dart_id: string, title: string }>
    blocking?: Array<{ dart_id: string, title: string }>
    duplicates?: Array<{ dart_id: string, title: string }>
    related?: Array<{ dart_id: string, title: string }>
  }
}
```

**Examples:**

```typescript
// Get full task details with relationships
get_task({ dart_id: "duid_task123" })
// Returns:
// {
//   dart_id: "duid_task123",
//   title: "Implement OAuth2",
//   blocker_ids: ["duid_design_review"],
//   blocking_ids: ["duid_deploy_prod"],
//   relationship_counts: { subtasks: 0, blockers: 1, blocking: 1, duplicates: 0, related: 0 }
// }

// Get minimal details (fewer tokens)
get_task({ dart_id: "duid_task123", detail_level: "minimal" })

// Exclude relationship data for smaller response
get_task({ dart_id: "duid_task123", include_relationships: false })

// Get expanded relationships with task titles (useful for display)
get_task({ dart_id: "duid_task123", expand_relationships: true })
// Returns:
// {
//   dart_id: "duid_task123",
//   title: "Implement OAuth2",
//   blocker_ids: ["duid_design_review"],
//   expanded_relationships: {
//     blockers: [{ dart_id: "duid_design_review", title: "Design review meeting" }],
//     blocking: [{ dart_id: "duid_deploy_prod", title: "Deploy to production" }]
//   }
// }
```

**Token Budget:** ~200 tokens (minimal), ~300 tokens (standard), ~400+ tokens (with expanded relationships)

---

### `update_task` - Update Single Task

**Purpose:** Update one or more fields of an existing task.

**Input Schema:**
```typescript
{
  dart_id: string                  // REQUIRED
  updates: {                       // REQUIRED, at least one field
    title?: string
    description?: string
    status?: string
    priority?: string
    size?: string
    assignees?: string[]
    tags?: string[]
    dartboard?: string
    due_at?: string
    start_at?: string
    parent_task?: string

    // Relationship fields (arrays of dart_id strings)
    subtask_ids?: string[]         // IDs of subtask (child) tasks
    blocker_ids?: string[]         // IDs of tasks that block this task
    blocking_ids?: string[]        // IDs of tasks blocked by this task
    duplicate_ids?: string[]       // IDs of duplicate tasks
    related_ids?: string[]         // IDs of related tasks
  }
}
```

**Relationship Update Semantics:**
- **Full replacement**: Providing a relationship array replaces ALL existing values
- **Empty array `[]`**: Clears all relationships of that type
- **Omitting field**: Leaves existing relationships unchanged

**Output Schema:** Same as `get_task` (updated task)

**Examples:**

```typescript
// Update status only
update_task({
  dart_id: "duid_task123",
  updates: { status: "Doing" }
})

// Update multiple fields
update_task({
  dart_id: "duid_task123",
  updates: {
    status: "Doing",
    priority: "critical",
    assignees: ["john@company.com"]
  }
})

// Add blockers to a task (replaces any existing blockers)
update_task({
  dart_id: "duid_deploy_task",
  updates: {
    blocker_ids: ["duid_testing", "duid_code_review"]
  }
})

// Clear all blockers (task is no longer blocked)
update_task({
  dart_id: "duid_deploy_task",
  updates: {
    blocker_ids: []  // empty array clears all blockers
  }
})

// Link related tasks
update_task({
  dart_id: "duid_task123",
  updates: {
    related_ids: ["duid_task456", "duid_task789"]
  }
})

// Mark tasks as duplicates
update_task({
  dart_id: "duid_original",
  updates: {
    duplicate_ids: ["duid_dup1", "duid_dup2"]
  }
})

// Add subtasks to a parent task
update_task({
  dart_id: "duid_parent_feature",
  updates: {
    subtask_ids: ["duid_subtask1", "duid_subtask2", "duid_subtask3"]
  }
})
```

**Important:** To add a single relationship without losing existing ones, first retrieve the current task with `get_task`, then include all existing IDs plus the new one in the update.

---

### `delete_task` - Move Task to Trash

**Purpose:** Move a task to trash (recoverable from Dart web UI).

**Input Schema:**
```typescript
{
  dart_id: string                  // REQUIRED
}
```

**Output Schema:**
```typescript
{
  success: boolean
  dart_id: string
  message: string
}
```

**Examples:**

```typescript
delete_task({ dart_id: "duid_task123" })
// → Task moved to trash, recoverable from web UI
```

**Note:** Tasks are NOT permanently deleted - they move to trash and can be restored via Dart web UI.

---

### `add_task_comment` - Add Comment to Task

**Purpose:** Add a text comment to an existing task.

**Input Schema:**
```typescript
{
  dart_id: string                  // REQUIRED
  comment: string                  // REQUIRED, comment text
}
```

**Output Schema:**
```typescript
{
  success: boolean
  comment_id: string
  dart_id: string
}
```

**Examples:**

```typescript
add_task_comment({
  dart_id: "duid_task123",
  comment: "Reviewed by security team - approved for deployment"
})
```

---

## Task Query Operations

### `list_tasks` - Filter and List Tasks

**Purpose:** List tasks with optional filtering by assignee, status, dartboard, priority, tags, due dates, and relationships.

**Input Schema:**
```typescript
{
  assignee?: string                // email or name
  status?: string                  // status name
  dartboard?: string               // dartboard name
  priority?: string                // "critical", "high", "medium", "low"
  tags?: string[]                  // array of tag names
  due_before?: string              // ISO8601 date
  due_after?: string               // ISO8601 date
  limit?: number                   // max results, default 100
  offset?: number                  // pagination offset, default 0
  detail_level?: 'minimal' | 'standard' | 'full'  // default: 'standard'

  // Relationship filters
  has_parent?: boolean             // filter tasks that have/don't have a parent
  // Note: Only has_parent is supported. Other relationship filters (has_subtasks,
  // has_blockers, is_blocking) are not available because the list API doesn't
  // return taskRelationships data.
}
```

**Output Schema:**
```typescript
{
  tasks: DartTask[]                // array of task objects (includes relationship fields)
  total: number                    // total matching tasks
}
```

**Examples:**

```typescript
// List all tasks (max 100)
list_tasks()

// List high-priority tasks in Engineering dartboard
list_tasks({
  dartboard: "Engineering/backend",
  priority: "high"
})

// List overdue tasks
list_tasks({
  due_before: "2026-01-18T00:00:00Z"
})

// List tasks by assignee with minimal details
list_tasks({
  assignee: "john@company.com",
  detail_level: "minimal"
})

// Pagination (get next 100 tasks)
list_tasks({ limit: 100, offset: 100 })

// List subtasks only (tasks with a parent)
list_tasks({
  has_parent: true
})

// List root tasks only (tasks without a parent)
list_tasks({
  has_parent: false
})

// Combine parent filter with other filters
list_tasks({
  dartboard: "Engineering/backend",
  has_parent: false,
  priority: "high"
})
// Returns high-priority root tasks in the Engineering dartboard
```

**API Limitation:** Only `has_parent` filter is supported because the list API returns `parent_task` but does not return `taskRelationships` data (subtask_ids, blocker_ids, etc.). To see full relationship data, use `get_task()` on individual tasks.

**Token Budget:** Variable based on result count (~200 tokens per 10 tasks)

---

### `search_tasks` - Full-Text Search

**Purpose:** Search tasks by keywords with relevance ranking.

**Input Schema:**
```typescript
{
  query: string                    // REQUIRED, search keywords
  dartboard?: string               // filter to specific dartboard
  limit?: number                   // max results, default 20
  offset?: number                  // pagination offset, default 0
}
```

**Output Schema:**
```typescript
{
  results: DartTask[]              // ranked by relevance
  total: number
  query: string                    // echoed back
}
```

**Examples:**

```typescript
// Multi-term search
search_tasks({ query: "authentication security oauth" })

// Phrase search with dartboard filter
search_tasks({
  query: "error handling database",
  dartboard: "Engineering/backend"
})

// Pagination
search_tasks({
  query: "bug fix",
  limit: 20,
  offset: 20
})
```

**How Search Works:**
- Searches task titles and descriptions
- Ranks by relevance score (TF-IDF)
- Returns matches ordered by score (highest first)

**Token Budget:** Variable (~300 tokens per 10 results)

---

## Batch Operations

**CRITICAL SAFETY RULES:**
1. **ALWAYS use `dry_run: true` first** to preview matching tasks
2. **Review preview before executing** - verify selector is correct
3. **Test with small dataset first** (< 10 tasks) before large batches
4. **Have rollback plan** - tasks go to trash, recoverable via web UI

### `batch_update_tasks` - Bulk Update with DartQL

**Purpose:** Update multiple tasks matching a DartQL selector expression (SQL-like WHERE syntax).

**Input Schema:**
```typescript
{
  selector: string                 // REQUIRED, DartQL WHERE clause
  updates: {                       // REQUIRED, fields to update
    title?: string
    description?: string
    status?: string
    priority?: string
    size?: string
    assignees?: string[]
    tags?: string[]
    dartboard?: string
    due_at?: string
    start_at?: string

    // Relationship fields (arrays of dart_id strings)
    subtask_ids?: string[]         // IDs of subtask (child) tasks
    blocker_ids?: string[]         // IDs of tasks that block this task
    blocking_ids?: string[]        // IDs of tasks blocked by this task
    duplicate_ids?: string[]       // IDs of duplicate tasks
    related_ids?: string[]         // IDs of related tasks
  }
  dry_run?: boolean                // default: false (RECOMMENDED: use true first!)
  concurrency?: number             // default: 5, range 1-20
}
```

**Relationship Update Semantics:**
- **Full replacement**: Providing a relationship array replaces ALL existing values for ALL matched tasks
- **Empty array `[]`**: Clears all relationships of that type on ALL matched tasks
- **Omitting field**: Leaves existing relationships unchanged

**Output Schema:**
```typescript
{
  batch_operation_id: string
  selector_matched: number         // total tasks matching selector
  dry_run: boolean

  // If dry_run=true:
  preview_tasks?: Array<{
    dart_id: string
    title: string
    current_values: object         // current values of fields being updated
    new_values: object             // values that will be applied (for relationships)
  }>                               // max 10 tasks shown

  // If dry_run=false:
  successful_updates: number
  failed_updates: number
  successful_dart_ids: string[]
  failed_items: Array<{
    dart_id: string
    error: string
    reason: string
  }>
  execution_time_ms: number
}
```

**Examples:**

```typescript
// Step 1: ALWAYS preview first (dry_run=true by default)
batch_update_tasks({
  selector: "dartboard = 'Engineering/backend' AND priority = 'high'",
  updates: { status: "Doing" },
  dry_run: true
})
// → Returns preview of up to 10 matching tasks

// Step 2: Review preview, verify selector matches ONLY intended tasks

// Step 3: Execute update (dry_run=false)
batch_update_tasks({
  selector: "dartboard = 'Engineering/backend' AND priority = 'high'",
  updates: { status: "Doing" },
  dry_run: false
})
// → Updates all matching tasks
```

**Complex Examples:**

```typescript
// Update all overdue high-priority tasks
batch_update_tasks({
  selector: "due_at < '2026-01-18T00:00:00Z' AND priority = 'high' AND status != 'Done'",
  updates: {
    priority: "critical",
    assignees: ["manager@company.com"]
  },
  dry_run: true  // ALWAYS preview first!
})

// Move completed Q4 tasks to archive
batch_update_tasks({
  selector: "completed_at >= '2025-10-01T00:00:00Z' AND completed_at < '2026-01-01T00:00:00Z'",
  updates: { dartboard: "Archive/2025-Q4" },
  dry_run: false,
  concurrency: 10  // faster with higher concurrency
})
```

**Relationship Batch Examples:**

```typescript
// Clear all blockers from tasks in a specific dartboard
batch_update_tasks({
  selector: "dartboard = 'Engineering/backend' AND blocker_ids IS NOT NULL",
  updates: {
    blocker_ids: []  // empty array clears all blockers
  },
  dry_run: true  // ALWAYS preview first!
})

// Mark all high-priority tasks as blocking the release task
batch_update_tasks({
  selector: "priority = 'critical' AND status != 'Done'",
  updates: {
    blocking_ids: ["duid_release_v2"]
  },
  dry_run: true
})

// Link all security-tagged tasks as related to the audit task
batch_update_tasks({
  selector: "tags CONTAINS 'security'",
  updates: {
    related_ids: ["duid_security_audit_2026"]
  },
  dry_run: true
})

// Clear duplicate relationships from resolved tasks
batch_update_tasks({
  selector: "status = 'Done' AND duplicate_ids IS NOT NULL",
  updates: {
    duplicate_ids: []
  },
  dry_run: false
})
```

**Important:** Batch relationship updates apply the SAME values to ALL matched tasks. Use this for scenarios like:
- Clearing relationships across many tasks
- Linking multiple tasks to a common blocker/release
- Resetting relationships during cleanup operations

**Token Budget:** ~400 tokens (returns summary, not full task data)

**Performance:** Depends on match count and concurrency (2-5 tasks/second typical)

---

### `batch_delete_tasks` - Bulk Delete with DartQL

**Purpose:** Delete (move to trash) multiple tasks matching a DartQL selector.

**Input Schema:**
```typescript
{
  selector: string                 // REQUIRED, DartQL WHERE clause
  dry_run?: boolean                // default: false (RECOMMENDED: use true first!)
  confirm?: boolean                // REQUIRED for dry_run=false (safety flag)
  concurrency?: number             // default: 5, range 1-20
}
```

**Output Schema:** Same as `batch_update_tasks` (but no `preview_tasks`)

**Examples:**

```typescript
// Step 1: Preview (dry_run=true)
batch_delete_tasks({
  selector: "dartboard = 'Personal/test' AND status = 'Done'",
  dry_run: true
})
// → Shows count of matching tasks

// Step 2: Execute (dry_run=false with confirm=true)
batch_delete_tasks({
  selector: "dartboard = 'Personal/test' AND status = 'Done'",
  dry_run: false,
  confirm: true  // REQUIRED safety flag
})
// → Moves all matching tasks to trash
```

**SAFETY NOTES:**
- Tasks move to **trash**, NOT permanent deletion
- Recoverable via Dart web UI
- `confirm: true` required for dry_run=false (prevents accidental deletion)
- Triple-check selector specificity before executing

---

### `get_batch_status` - Check Batch Operation Status

**Purpose:** Get status of a long-running batch operation.

**Input Schema:**
```typescript
{
  batch_operation_id: string       // from batch_update_tasks or batch_delete_tasks
}
```

**Output Schema:**
```typescript
{
  batch_operation_id: string
  operation_type: 'update' | 'delete' | 'import'
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  total_items: number
  successful_items: number
  failed_items: number
  started_at: string
  completed_at?: string
}
```

**Examples:**

```typescript
get_batch_status({ batch_operation_id: "batch_abc123" })
```

---

## CSV Import

### `import_tasks_csv` - Bulk Create from CSV

**Purpose:** Create hundreds of tasks from CSV data with validation, error recovery, and fuzzy matching.

**Input Schema:**
```typescript
{
  csv_data?: string                // inline CSV content (first row = headers)
  csv_file_path?: string           // OR path to CSV file
  dartboard: string                // REQUIRED, default dartboard name
  column_mapping?: object          // custom column name mappings
  validate_only?: boolean          // default: true (RECOMMENDED: validate first!)
  continue_on_error?: boolean      // default: true
  concurrency?: number             // default: 5, range 1-20
}
```

**CSV Column Mapping:**
```typescript
{
  // Map custom column names to dart-query field names
  "Task Name": "title",
  "Assigned To": "assignee",
  "Issue Priority": "priority",
  "Labels": "tags"
}
```

**Output Schema:**
```typescript
{
  batch_operation_id: string
  total_rows: number
  valid_rows: number
  invalid_rows: number

  // Validation errors (if any)
  validation_errors: Array<{
    row_number: number
    errors: string[]               // list of errors for this row
  }>

  // If validate_only=true:
  preview: Array<{
    row_number: number
    task_preview: object           // what will be created
  }>                               // max 10 rows

  // If validate_only=false:
  created_tasks: number
  failed_tasks: number
  created_dart_ids: string[]
  failed_items: Array<{
    row_number: number
    error: string
    row_data: object
  }>

  execution_time_ms: number
}
```

**CSV Format Guide:**

**Required Columns:**
- `title` - Task title (REQUIRED)

**Optional Columns:**
- `description` - Task description
- `status` - Status name (e.g., "To Do", "Doing")
- `priority` - Priority string ("critical", "high", "medium", "low")
- `size` - Size string ("xs", "small", "medium", "large", "xl")
- `assignee` - Email address or name (singular)
- `dartboard` - Override default dartboard
- `tags` - Comma-separated tag names
- `due_date` / `due_at` - ISO8601 date or recognizable format
- `start_date` / `start_at` - ISO8601 date
- `parent_task` - Parent task dart_id

**Relationship Columns** (comma-separated dart_id values):
- `subtask_ids` / `subtasks` / `children` - Comma-separated subtask IDs
- `blocker_ids` / `blockers` / `blocked_by` - Comma-separated blocker IDs
- `blocking_ids` / `blocking` / `blocks` - Comma-separated blocked task IDs
- `duplicate_ids` / `duplicates` - Comma-separated duplicate task IDs
- `related_ids` / `related` / `related_tasks` - Comma-separated related task IDs

**Flexible Column Names** (case-insensitive, fuzzy matched):
- `title` = `Title` = `Task Name` = `Task`
- `assignee` = `Assigned To` = `Owner` = `Assignee`
- `tags` = `Labels` = `Tags`
- `priority` = `Priority` = `Pri`
- `blocker_ids` = `blockers` = `blocked_by`
- `blocking_ids` = `blocking` = `blocks`

**Example CSV (Basic):**

```csv
title,description,assignee,priority,tags,due_at
"Fix login bug","Users can't login after password reset",john@company.com,critical,"bug,security",2026-02-01T00:00:00Z
"Update API docs","Document new authentication endpoints",writer@company.com,medium,documentation,2026-02-15T00:00:00Z
"Add rate limiting","Prevent API abuse",engineer@company.com,high,"feature,security",2026-02-10T00:00:00Z
```

**Example CSV (With Relationships):**

```csv
title,priority,blocker_ids,related_ids,tags
"Deploy to production",critical,"duid_testing,duid_code_review",,deployment
"Write unit tests",high,,"duid_feature_impl","testing,quality"
"Code review",medium,"duid_feature_impl",,review
"Feature implementation",high,,,"feature,backend"
```

**CSV Relationship Format Notes:**
- Use comma-separated dart_id values within a single cell
- Wrap in quotes if values contain commas: `"duid_task1,duid_task2"`
- Empty cell means no relationships of that type
- All dart_id values must be in valid format (e.g., `duid_xxxxx`)

**Workflow:**

```typescript
// Step 1: Get config to understand valid values
get_config()
// → See available dartboards, priorities, sizes, tags

// Step 2: Validate CSV (validate_only=true)
import_tasks_csv({
  csv_file_path: "./tasks.csv",
  dartboard: "Engineering/backend",
  validate_only: true
})
// → Returns validation errors and preview of first 10 tasks

// Step 3: Fix any validation errors in CSV

// Step 4: Execute import (validate_only=false)
import_tasks_csv({
  csv_file_path: "./tasks.csv",
  dartboard: "Engineering/backend",
  validate_only: false
})
// → Creates all tasks (41 tasks in 17.4s typical)
```

**Advanced Example with Column Mapping:**

```typescript
import_tasks_csv({
  csv_file_path: "./jira_export.csv",
  dartboard: "Engineering/backend",
  column_mapping: {
    "Issue Summary": "title",
    "Issue Description": "description",
    "Assignee Email": "assignee",
    "Issue Priority": "priority",
    "Labels": "tags"
  },
  validate_only: true
})
```

**Error Recovery:**

If > 50% of tasks fail, you'll get a rollback suggestion:

```
WARNING: 75% of tasks failed to create. Consider deleting created tasks and fixing errors.
Created task IDs: duid_task1, duid_task2, duid_task3
```

Use `batch_delete_tasks` to clean up:

```typescript
// Delete failed import batch
batch_delete_tasks({
  selector: "dart_id IN ('duid_task1', 'duid_task2', 'duid_task3')",
  dry_run: false,
  confirm: true
})
```

**Token Budget:** ~500 tokens (returns summary + first 10 preview)

**Performance:** 2-4 tasks/second typical (41 tasks in 17.4s production tested)

---

## Document Management

dart-query includes full document (notes/docs) management. Documents are separate from tasks.

### `list_docs` - List Documents

**Input Schema:**
```typescript
{
  folder?: string                  // filter by folder name
  title_contains?: string          // filter by title substring
  text_contains?: string           // filter by content substring
  limit?: number                   // default 100
  offset?: number                  // default 0
}
```

**Output Schema:**
```typescript
{
  docs: Array<{
    doc_id: string
    title: string
    folder?: string
    created_at: string
    updated_at: string
  }>
  total: number
}
```

### `create_doc` - Create Document

**Input Schema:**
```typescript
{
  title: string                    // REQUIRED
  text: string                     // REQUIRED, markdown content
  folder?: string                  // folder name
}
```

**Output Schema:**
```typescript
{
  doc_id: string
  title: string
  text: string
  folder?: string
  created_at: string
  updated_at: string
  url?: string
}
```

### `get_doc` - Retrieve Document

**Input Schema:**
```typescript
{
  doc_id: string                   // REQUIRED
}
```

**Output Schema:** Same as `create_doc`

### `update_doc` - Update Document

**Input Schema:**
```typescript
{
  doc_id: string                   // REQUIRED
  title?: string
  text?: string
  folder?: string
}
```

**Output Schema:** Same as `get_doc` (updated doc)

### `delete_doc` - Delete Document

**Input Schema:**
```typescript
{
  doc_id: string                   // REQUIRED
}
```

**Output Schema:**
```typescript
{
  success: boolean
  doc_id: string
}
```

**Note:** Docs move to trash (recoverable)

---

## DartQL Reference

**DartQL** is a SQL-like WHERE clause syntax for batch operations.

### Syntax Overview

```sql
field operator value [AND|OR field operator value ...]
```

### Supported Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `=` | Equals | `status = 'To Do'` |
| `!=` | Not equals | `priority != 'low'` |
| `>` | Greater than | `due_at > '2026-02-01'` |
| `>=` | Greater or equal | `priority >= 'high'` |
| `<` | Less than | `due_at < '2026-01-18'` |
| `<=` | Less or equal | `priority <= 'medium'` |
| `IN` | In list | `status IN ('To Do', 'Doing')` |
| `NOT IN` | Not in list | `priority NOT IN ('low')` |
| `LIKE` | Pattern match | `title LIKE '%authentication%'` |
| `CONTAINS` | Array contains | `tags CONTAINS 'urgent'` |
| `IS NULL` | Is null/undefined | `due_at IS NULL` |
| `IS NOT NULL` | Is not null | `assignees IS NOT NULL` |
| `BETWEEN` | Range | `created_at BETWEEN '2026-01-01' AND '2026-01-31'` |

### Logical Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `AND` | Logical AND | `status = 'To Do' AND priority = 'high'` |
| `OR` | Logical OR | `status = 'To Do' OR status = 'Doing'` |
| `NOT` | Logical NOT | `NOT (priority = 'low')` |
| `( )` | Grouping | `(status = 'To Do' OR status = 'Doing') AND priority = 'high'` |

### Valid Fields

**Core Fields:**
- `status` - Task status
- `priority` - Priority string
- `size` - Size string
- `title` - Task title
- `description` - Task description
- `assignee` - Assignee email
- `dartboard` - Dartboard name
- `tags` - Tag array
- `created_at` - Creation timestamp
- `updated_at` - Update timestamp
- `due_at` - Due date
- `start_at` - Start date
- `completed_at` - Completion timestamp
- `dart_id` - Task ID

**Relationship Fields:**
- `parent_task` - Parent task ID (string)
- `subtask_ids` - Subtask IDs (array)
- `blocker_ids` - Blocker task IDs (array)
- `blocking_ids` - Blocked task IDs (array)
- `duplicate_ids` - Duplicate task IDs (array)
- `related_ids` - Related task IDs (array)

### Examples

**Simple equality:**
```sql
status = 'To Do'
dartboard = 'Engineering/backend'
priority = 'high'
```

**Multiple conditions (AND):**
```sql
status = 'To Do' AND priority = 'high'
dartboard = 'Engineering/backend' AND assignee = 'john@company.com'
```

**OR conditions:**
```sql
status = 'To Do' OR status = 'Doing'
priority = 'high' OR priority = 'critical'
```

**Range operators:**
```sql
due_at < '2026-01-18T00:00:00Z'
due_at > '2026-02-01T00:00:00Z'
```

**IN operator:**
```sql
status IN ('To Do', 'Doing', 'Blocked')
priority IN ('high', 'critical')
```

**Tag filtering:**
```sql
tags CONTAINS 'urgent'
tags CONTAINS 'bug' AND tags CONTAINS 'security'
```

**Pattern matching:**
```sql
title LIKE '%authentication%'
description LIKE '%API%'
```

**NULL checks:**
```sql
due_at IS NULL
assignees IS NOT NULL
```

**Complex queries with grouping:**
```sql
(status = 'To Do' OR status = 'Doing') AND priority = 'high'
dartboard = 'Engineering/backend' AND (priority = 'critical' OR tags CONTAINS 'urgent')
```

**BETWEEN operator:**
```sql
created_at BETWEEN '2026-01-01T00:00:00Z' AND '2026-01-31T23:59:59Z'
```

### Relationship Query Examples

**Find tasks with relationships:**
```sql
-- Tasks that have blockers (are blocked by something)
blocker_ids IS NOT NULL

-- Tasks that are blocking other tasks
blocking_ids IS NOT NULL

-- Tasks with subtasks (parent tasks)
subtask_ids IS NOT NULL

-- Leaf tasks (no subtasks)
subtask_ids IS NULL

-- Tasks with related tasks
related_ids IS NOT NULL

-- Tasks marked as duplicates
duplicate_ids IS NOT NULL
```

**Find tasks blocked by a specific task:**
```sql
-- Tasks blocked by the release blocker
blocker_ids CONTAINS 'duid_release_blocker'

-- Tasks blocking the deployment
blocking_ids CONTAINS 'duid_deployment'
```

**Find tasks related to a specific task:**
```sql
related_ids CONTAINS 'duid_feature_spec'
```

**Combined relationship and field queries:**
```sql
-- High-priority blocked tasks
blocker_ids IS NOT NULL AND priority = 'high'

-- Blocked tasks in Engineering dartboard
dartboard = 'Engineering/backend' AND blocker_ids IS NOT NULL

-- Critical tasks that are blocking releases
priority = 'critical' AND blocking_ids CONTAINS 'duid_release_v2'

-- Parent tasks with urgent tag
subtask_ids IS NOT NULL AND tags CONTAINS 'urgent'

-- Unblocked tasks ready to start
blocker_ids IS NULL AND status = 'To Do' AND priority = 'high'
```

**Note on IS NULL for relationship arrays:**
- `blocker_ids IS NULL` matches tasks with NO blockers (empty array or undefined)
- `blocker_ids IS NOT NULL` matches tasks with AT LEAST ONE blocker
- Empty arrays `[]` are treated as NULL for relationship fields

### API Filters vs. Client-Side Filtering

dart-query optimizes queries by using Dart API filters when possible, falling back to client-side filtering for complex queries.

**API-Compatible** (fast):
- Simple `=` equality on: assignee, status, dartboard, priority, tags
- Range operators on: due_at (`<`, `>`, `<=`, `>=`)
- AND logic only

**Requires Client-Side Filtering** (slower):
- OR logic
- NOT logic
- `!=` operator
- `IN`, `NOT IN`, `LIKE`, `CONTAINS`, `IS NULL`, `BETWEEN`
- Range operators on priority/size
- Complex nested expressions

**Example:**

```typescript
// API-compatible (fast)
batch_update_tasks({
  selector: "dartboard = 'Engineering' AND priority = 'high'",
  updates: { status: "Doing" }
})

// Requires client-side filtering (slower, fetches all tasks first)
batch_update_tasks({
  selector: "status IN ('To Do', 'Doing') AND tags CONTAINS 'urgent'",
  updates: { priority: "critical" }
})
```

When client-side filtering is needed, you'll see a warning:

```
Query requires client-side filtering which may impact performance.
Consider using simpler queries with API-supported filters for better performance.
```

### Error Messages and Fuzzy Matching

DartQL provides helpful error messages with suggestions:

```
Unknown field: 'priorty'. Did you mean 'priority'?
Unknown field: 'assignees'. Did you mean 'assignee'?
```

---

## Error Handling

### Error Types

**`ValidationError`** - Input validation failures
```typescript
{
  message: string
  field?: string                   // which field failed
  suggestions?: string[]           // fuzzy match suggestions
}
```

**Common causes:**
- Missing required fields
- Invalid field values (priority not in config)
- Invalid date formats
- Empty strings where non-empty expected

**`DartAPIError`** - API communication errors
```typescript
{
  message: string
  statusCode: number               // HTTP status code
  response?: object                // API response body
}
```

**Common status codes:**
- `401` - Invalid or missing DART_TOKEN
- `404` - Resource not found (task, dartboard, etc.)
- `429` - Rate limit exceeded
- `400` - Bad request (malformed data)
- `500` - Server error

**`DartQLParseError`** - DartQL syntax errors
```typescript
{
  message: string
  position: number                 // character position in query
  token: string                    // token that caused error
}
```

**Common causes:**
- Unterminated string literals
- Unknown operators
- Missing parentheses
- Invalid field names

### Error Recovery Strategies

**Validation Errors:**
```typescript
try {
  create_task({
    title: "Test task",
    dartboard: "Invalid Board"
  });
} catch (error) {
  if (error instanceof ValidationError) {
    // Check suggestions
    if (error.suggestions && error.suggestions.length > 0) {
      console.log(`Did you mean: ${error.suggestions.join(', ')}?`);
    }
    // Get valid values from config
    const config = await get_config();
    console.log(`Valid dartboards: ${config.dartboards.join(', ')}`);
  }
}
```

**Rate Limiting (429):**
```typescript
// Reduce concurrency
batch_update_tasks({
  selector: "status = 'To Do'",
  updates: { priority: "high" },
  concurrency: 2  // Lower than default 5
})
```

dart-query has automatic retry with exponential backoff for rate limits.

**Network Errors:**
```typescript
try {
  const config = await get_config();
} catch (error) {
  if (error instanceof DartAPIError && error.statusCode >= 500) {
    // Server error - retry after delay
    await new Promise(resolve => setTimeout(resolve, 5000));
    const config = await get_config({ cache_bust: true });
  }
}
```

**CSV Import Errors:**
```typescript
// Always validate first
const validation = await import_tasks_csv({
  csv_file_path: "./tasks.csv",
  dartboard: "Engineering",
  validate_only: true
});

if (validation.validation_errors.length > 0) {
  // Show all errors
  validation.validation_errors.forEach(err => {
    console.log(`Row ${err.row_number}: ${err.errors.join('; ')}`);
  });

  // Fix CSV and retry
} else {
  // Execute import
  const result = await import_tasks_csv({
    csv_file_path: "./tasks.csv",
    dartboard: "Engineering",
    validate_only: false
  });
}
```

---

## Performance Optimization

### 1. Use Config Cache

```typescript
// Good: Uses 5-minute cache
get_config()

// Bad: Forces API call every time
get_config({ cache_bust: true })
```

### 2. Use Detail Levels

```typescript
// Minimal details (fewer tokens, faster)
list_tasks({ detail_level: "minimal" })

// Standard (default)
list_tasks({ detail_level: "standard" })

// Full (most tokens, slowest)
list_tasks({ detail_level: "full" })
```

### 3. Optimize Batch Concurrency

```typescript
// Too low: slow
batch_update_tasks({
  selector: "...",
  updates: { ... },
  concurrency: 1
})

// Default: balanced (5 concurrent)
batch_update_tasks({
  selector: "...",
  updates: { ... }
})

// Higher: faster but risks rate limits
batch_update_tasks({
  selector: "...",
  updates: { ... },
  concurrency: 15  // Monitor for 429 errors
})
```

### 4. Use API-Compatible DartQL

```typescript
// Fast: API-compatible
selector: "dartboard = 'Engineering' AND priority = 'high'"

// Slow: Client-side filtering required
selector: "status IN ('To Do', 'Doing') OR priority = 'critical'"
```

### 5. Pagination for Large Result Sets

```typescript
// Get first 100 tasks
const page1 = await list_tasks({ limit: 100, offset: 0 });

// Get next 100 tasks
const page2 = await list_tasks({ limit: 100, offset: 100 });
```

### 6. Batch Operations vs. Individual Operations

```typescript
// Bad: 50 individual API calls, 25,000+ tokens
for (const task of tasks) {
  await update_task({ dart_id: task.dart_id, updates: { status: "Done" } });
}

// Good: 1 batch operation, ~400 tokens
batch_update_tasks({
  selector: "dartboard = 'Engineering' AND priority = 'high'",
  updates: { status: "Done" }
})
```

**Token savings: 99%**
**Time savings: 90%**
**Context rot: Eliminated**

### 7. CSV Import vs. Individual Creates

```typescript
// Bad: 100 create_task calls, 30,000+ tokens
for (const row of csvData) {
  await create_task({ title: row.title, ... });
}

// Good: 1 CSV import, ~500 tokens
import_tasks_csv({
  csv_file_path: "./tasks.csv",
  dartboard: "Engineering",
  validate_only: false
})
```

---

## Common Workflows

### Workflow 1: Create and Track Feature Development

```typescript
// Step 1: Create parent task
const parent = await create_task({
  title: "Implement OAuth2 authentication",
  dartboard: "Engineering/backend",
  priority: "high",
  size: "xl",
  due_at: "2026-03-01T00:00:00Z"
});

// Step 2: Create subtasks
await create_task({
  title: "Add Google OAuth provider",
  dartboard: "Engineering/backend",
  priority: "high",
  parent_task: parent.dart_id
});

await create_task({
  title: "Add GitHub OAuth provider",
  dartboard: "Engineering/backend",
  priority: "high",
  parent_task: parent.dart_id
});

// Step 3: Update all subtasks when starting work
await batch_update_tasks({
  selector: `parent_task = '${parent.dart_id}'`,
  updates: { status: "Doing" }
});
```

### Workflow 2: Migrate Tasks from External System

```typescript
// Step 1: Export from external system to CSV
// Create CSV: jira_export.csv

// Step 2: Get dart-query config
const config = await get_config();
console.log("Available dartboards:", config.dartboards);
console.log("Available priorities:", config.priorities);

// Step 3: Validate CSV
const validation = await import_tasks_csv({
  csv_file_path: "./jira_export.csv",
  dartboard: "Engineering/backend",
  column_mapping: {
    "Issue Summary": "title",
    "Issue Description": "description",
    "Assignee Email": "assignee",
    "Issue Priority": "priority",
    "Labels": "tags"
  },
  validate_only: true
});

if (validation.validation_errors.length > 0) {
  console.error("Validation errors:", validation.validation_errors);
  process.exit(1);
}

// Step 4: Execute import
const result = await import_tasks_csv({
  csv_file_path: "./jira_export.csv",
  dartboard: "Engineering/backend",
  column_mapping: {
    "Issue Summary": "title",
    "Issue Description": "description",
    "Assignee Email": "assignee",
    "Issue Priority": "priority",
    "Labels": "tags"
  },
  validate_only: false
});

console.log(`Created ${result.created_tasks} tasks in ${result.execution_time_ms}ms`);
```

### Workflow 3: Weekly Sprint Planning

```typescript
// Step 1: Find all unassigned high-priority tasks
const unassigned = await list_tasks({
  priority: "high",
  status: "To Do"
});

// Step 2: Assign to team members
await batch_update_tasks({
  selector: "priority = 'high' AND status = 'To Do' AND tags CONTAINS 'backend'",
  updates: { assignees: ["john@company.com"] }
});

await batch_update_tasks({
  selector: "priority = 'high' AND status = 'To Do' AND tags CONTAINS 'frontend'",
  updates: { assignees: ["jane@company.com"] }
});

// Step 3: Set sprint deadlines
await batch_update_tasks({
  selector: "assignees IS NOT NULL AND status = 'To Do'",
  updates: { due_at: "2026-02-01T00:00:00Z" }
});
```

### Workflow 4: End of Quarter Cleanup

```typescript
// Step 1: Archive completed tasks
await batch_update_tasks({
  selector: "completed_at >= '2025-10-01' AND completed_at < '2026-01-01'",
  updates: { dartboard: "Archive/2025-Q4" },
  dry_run: true  // Preview first
});

// Step 2: After reviewing preview, execute
await batch_update_tasks({
  selector: "completed_at >= '2025-10-01' AND completed_at < '2026-01-01'",
  updates: { dartboard: "Archive/2025-Q4" },
  dry_run: false,
  concurrency: 10
});

// Step 3: Delete abandoned low-priority tasks
await batch_delete_tasks({
  selector: "priority = 'low' AND updated_at < '2025-10-01' AND status = 'To Do'",
  dry_run: true
});

await batch_delete_tasks({
  selector: "priority = 'low' AND updated_at < '2025-10-01' AND status = 'To Do'",
  dry_run: false,
  confirm: true
});
```

### Workflow 5: Security Audit Remediation

```typescript
// Step 1: Search for security-related tasks
const securityTasks = await search_tasks({
  query: "security vulnerability authentication xss sql injection",
  dartboard: "Engineering"
});

// Step 2: Tag all security tasks
await batch_update_tasks({
  selector: "tags CONTAINS 'security'",
  updates: {
    priority: "critical",
    tags: ["security", "audit-2026-q1"]
  }
});

// Step 3: Track remediation
await add_task_comment({
  dart_id: "duid_task123",
  comment: "Reviewed by security team - CVSS 8.5, requires immediate patching"
});
```

### Workflow 6: Managing Task Dependencies (Relationships)

```typescript
// Step 1: Create a release task that will be blocked by feature tasks
const release = await create_task({
  title: "Release v2.0",
  dartboard: "Engineering/releases",
  priority: "high",
  due_at: "2026-03-01T00:00:00Z"
});

// Step 2: Create feature tasks that block the release
const feature1 = await create_task({
  title: "Implement OAuth2",
  dartboard: "Engineering/backend",
  priority: "high",
  blocking_ids: [release.dart_id]  // This task blocks the release
});

const feature2 = await create_task({
  title: "Update user dashboard",
  dartboard: "Engineering/frontend",
  priority: "high",
  blocking_ids: [release.dart_id]  // This task also blocks the release
});

// Step 3: Update the release task with its blockers
await update_task({
  dart_id: release.dart_id,
  updates: {
    blocker_ids: [feature1.dart_id, feature2.dart_id]
  }
});

// Step 4: Check the release task for blockers
// Note: list_tasks doesn't support has_blockers filter (API limitation)
// Use get_task to see relationship data for individual tasks
const releaseTask = await get_task({ dart_id: release.dart_id });
const hasBlockers = releaseTask.blocker_ids?.length > 0;

// Step 5: When a feature is complete, update relationships
// Remove completed feature from blockers
const remainingBlockers = releaseTask.blocker_ids?.filter(
  id => id !== feature1.dart_id
) || [];

await update_task({
  dart_id: release.dart_id,
  updates: {
    blocker_ids: remainingBlockers
  }
});

// Step 6: Check if release is ready (no more blockers)
const updatedRelease = await get_task({ dart_id: release.dart_id });
const isReady = !updatedRelease.blocker_ids || updatedRelease.blocker_ids.length === 0;
```

### Workflow 7: Linking Related Tasks

```typescript
// Step 1: Create a design spec task
const designSpec = await create_task({
  title: "Design authentication system spec",
  dartboard: "Engineering/design",
  priority: "high"
});

// Step 2: Create implementation tasks related to the spec
const backendTask = await create_task({
  title: "Implement auth backend",
  dartboard: "Engineering/backend",
  related_ids: [designSpec.dart_id]
});

const frontendTask = await create_task({
  title: "Implement auth frontend",
  dartboard: "Engineering/frontend",
  related_ids: [designSpec.dart_id]
});

// Step 3: Update the spec to link back to implementations
await update_task({
  dart_id: designSpec.dart_id,
  updates: {
    related_ids: [backendTask.dart_id, frontendTask.dart_id]
  }
});

// Step 4: Batch link all auth-tagged tasks to the spec
await batch_update_tasks({
  selector: "tags CONTAINS 'auth' AND dart_id != '" + designSpec.dart_id + "'",
  updates: {
    related_ids: [designSpec.dart_id]
  },
  dry_run: true  // Preview first!
});

// Step 5: Find all tasks related to the spec
const relatedToSpec = await list_tasks({});
// Then filter client-side or use DartQL:
await batch_update_tasks({
  selector: "related_ids CONTAINS '" + designSpec.dart_id + "'",
  updates: { status: "In Review" },
  dry_run: true
});
```

### Workflow 8: Handling Duplicate Tasks

```typescript
// Step 1: Find potential duplicates via search
const searchResults = await search_tasks({
  query: "authentication login bug"
});

// Step 2: Mark tasks as duplicates of the original
const originalTask = searchResults.results[0];
const duplicateTasks = searchResults.results.slice(1);

// Link duplicates to original
await update_task({
  dart_id: originalTask.dart_id,
  updates: {
    duplicate_ids: duplicateTasks.map(t => t.dart_id)
  }
});

// Step 3: Close duplicate tasks
await batch_update_tasks({
  selector: `dart_id IN (${duplicateTasks.map(t => `'${t.dart_id}'`).join(', ')})`,
  updates: {
    status: "Duplicate",
    duplicate_ids: [originalTask.dart_id]  // Link back to original
  },
  dry_run: false
});

// Step 4: Find all tasks marked as duplicates
const allDuplicates = await list_tasks({});
// Use DartQL to find:
await batch_update_tasks({
  selector: "duplicate_ids IS NOT NULL",
  updates: { priority: "low" },
  dry_run: true
});
```

---

## Troubleshooting Guide

### Problem: Authentication Errors

**Error:**
```
Error: Invalid DART_TOKEN
```

**Solution:**
1. Get fresh token from https://app.dartai.com/?settings=account
2. Ensure token starts with `dsa_`
3. Verify environment variable: `echo $DART_TOKEN`
4. Restart MCP server after changing token

### Problem: Rate Limiting (429)

**Error:**
```
Error: Rate limit exceeded
```

**Solution:**
1. Reduce `concurrency` parameter (try 2-3 instead of default 5)
2. Add delays between batch operations
3. Use API-compatible DartQL (avoids client-side filtering)
4. Contact Dart support if persistent

dart-query has automatic retry with exponential backoff.

### Problem: CSV Import Failures

**Error:**
```
Row 3, column 'priority': Invalid priority: "5". Available: critical, high, medium, low
```

**Solution:**
1. Always use `validate_only: true` first
2. Check `get_config()` for available values
3. Use string priorities ("high") not numbers (3)
4. Use string sizes ("medium") not numbers (3)
5. Verify dartboard names exactly match config
6. Check date formats (ISO8601: "2026-02-01T00:00:00Z")

### Problem: DartQL Syntax Errors

**Error:**
```
Unknown field: priorty. Did you mean: priority?
```

**Solution:**
1. Check field name spelling (fuzzy match suggestions provided)
2. Valid fields: status, priority, size, title, description, assignee, dartboard, tags, dates, dart_id
3. Use quotes for string values: `status = 'To Do'` not `status = To Do`
4. Check operator syntax: `=`, `!=`, `>`, `>=`, `<`, `<=`, `IN`, `NOT IN`, `LIKE`, `CONTAINS`

### Problem: Batch Operations Matching Wrong Tasks

**Error:**
```
Accidentally updated 500 tasks instead of 50
```

**Solution:**
1. **ALWAYS** use `dry_run: true` first
2. Review preview carefully before executing
3. Test selector with `list_tasks()` first
4. Start with small batches (< 10 tasks) to verify selector
5. Use more specific selectors (multiple AND conditions)

**Recovery:**
Tasks move to trash (recoverable via Dart web UI)

### Problem: Slow Performance

**Symptoms:**
- Batch operations taking > 10s per task
- CSV imports timing out
- Context window filling up

**Solutions:**
1. Use API-compatible DartQL (avoid OR, NOT, LIKE)
2. Increase concurrency (try 10-15 instead of 5)
3. Use `detail_level: "minimal"` for large queries
4. Enable config cache (default 5 minutes)
5. Paginate large result sets
6. Use batch operations instead of individual CRUD

---

## Best Practices Summary

### Production Safety
- ✅ Always use `dry_run: true` for batch operations
- ✅ Always use `validate_only: true` for CSV imports
- ✅ Test selectors with small datasets first (< 10 tasks)
- ✅ Review previews before executing
- ✅ Have rollback plan (tasks → trash, recoverable)
- ✅ Use `confirm: true` for batch deletes
- ✅ Triple-check selector specificity

### Performance
- ✅ Use batch operations for > 5 tasks
- ✅ Use CSV import for > 50 tasks
- ✅ Use config cache (don't bust unless needed)
- ✅ Use minimal detail levels when possible
- ✅ Use API-compatible DartQL selectors
- ✅ Adjust concurrency based on rate limits (2-15 range)
- ✅ Paginate large result sets (limit/offset)

### Error Prevention
- ✅ Call `get_config()` before creating tasks
- ✅ Validate all CSV data before import
- ✅ Use fuzzy match suggestions for typos
- ✅ Check field names in DartQL queries
- ✅ Use proper date formats (ISO8601)
- ✅ Use string priorities/sizes ("high", "medium") not numbers

### Context Efficiency
- ✅ Batch operations return summaries (not full data)
- ✅ CSV import returns preview of first 10 (not all)
- ✅ Use `info` tool for progressive discovery
- ✅ Use `detail_level: "minimal"` when appropriate
- ✅ **Result: 99% token reduction vs. traditional approach**

---

**For additional help:**
- GitHub Issues: https://github.com/standardbeagle/dart-query/issues
- Dart AI Support: https://dartai.com/support
- MCP Documentation: https://modelcontextprotocol.io
