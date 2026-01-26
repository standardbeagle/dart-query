/**
 * Info Tool - Progressive Discovery
 * Entry point for users to discover dart-query capabilities
 *
 * Three detail levels:
 * - overview: Sparse table of 7 tool groups
 * - group: Tools in specific category
 * - tool: Full schema and examples
 */

import { InfoInput, InfoOutput } from '../types/index.js';

/**
 * Tool groups with counts and purposes
 */
const TOOL_GROUPS = {
  discovery: {
    count: 1,
    purpose: 'Progressive capability discovery',
    tools: [
      {
        name: 'info',
        description: 'Progressive discovery of dart-query capabilities - start here',
      },
    ],
  },
  config: {
    count: 1,
    purpose: 'Workspace configuration',
    tools: [
      {
        name: 'get_config',
        description: 'Get workspace configuration: assignees, dartboards, statuses, tags, priorities, sizes',
      },
    ],
  },
  'task-crud': {
    count: 5,
    purpose: 'Single task operations',
    tools: [
      {
        name: 'create_task',
        description: 'Create a new task with title, description, status, priority, size, dates, dartboard, assignees, tags, and relationships (parent, blockers, related)',
      },
      {
        name: 'get_task',
        description: 'Retrieve an existing task by its dart_id with full details and relationship information',
      },
      {
        name: 'update_task',
        description: "Update an existing task's properties (status, title, description, priority, assignees, relationships, etc.)",
      },
      {
        name: 'delete_task',
        description: 'Move a task to trash (recoverable from Dart web UI)',
      },
      {
        name: 'add_task_comment',
        description: 'Add a comment to an existing task',
      },
    ],
  },
  'task-query': {
    count: 2,
    purpose: 'Search and filter tasks',
    tools: [
      {
        name: 'list_tasks',
        description: 'List tasks with optional filtering by assignee, status, dartboard, priority, due date, has_parent, and more',
      },
      {
        name: 'search_tasks',
        description: 'Full-text search across task titles and descriptions with relevance ranking',
      },
    ],
  },
  'task-batch': {
    count: 3,
    purpose: 'Bulk operations on multiple tasks',
    tools: [
      {
        name: 'batch_update_tasks',
        description: 'Update multiple tasks matching a DartQL selector expression (SQL-like WHERE syntax)',
      },
      {
        name: 'batch_delete_tasks',
        description: 'Delete multiple tasks matching a DartQL selector expression (moves to trash, recoverable)',
      },
      {
        name: 'get_batch_status',
        description: 'Get status of a long-running batch operation by batch_operation_id',
      },
    ],
  },
  'doc-crud': {
    count: 5,
    purpose: 'Document management',
    tools: [
      {
        name: 'list_docs',
        description: 'List docs with optional filtering by folder, title, text content',
      },
      {
        name: 'create_doc',
        description: 'Create a new doc with title, text content (markdown), and folder',
      },
      {
        name: 'get_doc',
        description: 'Retrieve an existing doc by its doc_id with full text content',
      },
      {
        name: 'update_doc',
        description: "Update an existing doc's title or text content",
      },
      {
        name: 'delete_doc',
        description: 'Move a doc to trash (recoverable)',
      },
    ],
  },
  import: {
    count: 1,
    purpose: 'CSV bulk import',
    tools: [
      {
        name: 'import_tasks_csv',
        description: 'Bulk-create tasks from CSV data (inline text or file path) with validation and error recovery',
      },
    ],
  },
};

/**
 * Render overview: sparse table of tool groups
 */
function renderOverview(): string {
  return `Dart Query MCP - Task Management with Batch Operations

Tool Groups
-----------
Group       | Count | Purpose
----------- | ----- | -------
discovery   | 1     | Progressive capability discovery
config      | 1     | Workspace configuration
task-crud   | 5     | Single task operations
task-query  | 2     | Search and filter tasks
task-batch  | 3     | Bulk operations on multiple tasks
doc-crud    | 5     | Document management
import      | 1     | CSV bulk import

Quick Start:    info(level='group', target='task-crud')
Batch Ops:      info(level='group', target='task-batch')
DartQL Help:    info(level='tool', target='batch_update_tasks')
Relationships:  info(level='tool', target='relationships')`;
}

/**
 * Render group: tools in specific category
 */
function renderGroup(target: string): string {
  const group = TOOL_GROUPS[target as keyof typeof TOOL_GROUPS];

  if (!group) {
    const validGroups = Object.keys(TOOL_GROUPS).join(', ');
    return `Error: Unknown group "${target}". Valid groups: ${validGroups}`;
  }

  let output = `Tool Group: ${target}\n`;
  output += `Purpose: ${group.purpose}\n`;
  output += `Tools (${group.count}):\n\n`;

  group.tools.forEach((tool) => {
    output += `• ${tool.name}\n  ${tool.description}\n\n`;
  });

  output += `\nNext Steps:\n`;
  output += `- info(level='tool', target='${group.tools[0].name}') - Full documentation\n`;
  output += `- info(level='overview') - Return to overview`;

  return output;
}

/**
 * Render tool: full schema and examples
 */
function renderTool(target: string): string {
  // Full tool documentation with schema and examples
  const toolDocs: Record<string, string> = {
    info: `Tool: info
Description: Progressive discovery of dart-query capabilities - start here

Input Schema:
  level?: 'overview' | 'group' | 'tool' (default: 'overview')
    Detail level for information display

  target?: string
    Group name (when level='group') or tool name (when level='tool')

Output Schema:
  level: string (echoed back)
  content: string (formatted documentation)
  next_steps: string[] (suggested follow-up queries)

Examples:
  info()
    → Shows overview table of all tool groups

  info(level='group', target='task-batch')
    → Shows batch operation tools

  info(level='tool', target='batch_update_tasks')
    → Shows full schema and DartQL syntax guide

Token Budget: ~150 tokens (overview), ~200 tokens (group), ~500 tokens (tool)
Performance: Instant (no API calls required)`,

    get_config: `Tool: get_config
Description: Get workspace configuration: assignees, dartboards, statuses, tags, priorities, sizes

Input Schema:
  cache_bust?: boolean (default: false)
    Force refresh cached config (default: 5-minute cache)

  include?: Array<'assignees' | 'dartboards' | 'statuses' | 'tags' | 'priorities' | 'sizes' | 'folders'>
    Limit response to specific config sections (default: all)

Output Schema:
  assignees: Array<{dart_id, name, email, role}>
  dartboards: Array<{dart_id, name, description}>
  statuses: Array<{dart_id, name, color, order}>
  tags: Array<{dart_id, name, color}>
  priorities: Array<{value: 1-5, label}>
  sizes: Array<{value: 1-5, label}>
  folders: Array<{dart_id, name, space_id}>
  cached_at: iso8601 timestamp
  cache_ttl_seconds: integer

Use Cases:
  - Get valid dartboard_ids before creating tasks
  - Validate assignee emails before CSV import
  - Resolve status names to dart_ids

Examples:
  get_config()
    → Full workspace configuration (cached for 5 minutes)

  get_config(include=['dartboards', 'assignees'])
    → Only dartboards and assignees (token-efficient)

  get_config(cache_bust=true)
    → Force refresh cached config

Token Budget: ~400 tokens
Performance: Fast (cached) / Medium (API call)`,

    batch_update_tasks: `Tool: batch_update_tasks
Description: Update multiple tasks matching a DartQL selector expression (SQL-like WHERE syntax)

Input Schema:
  selector: string (required)
    DartQL WHERE clause (e.g., "status = 'Todo' AND priority >= 3")

  updates: object (required)
    Fields to update on all matching tasks
    Properties: status, priority, size, assignees, tags, due_at, start_at

  dry_run?: boolean (default: false)
    Preview matching tasks without updating (RECOMMENDED for first run)

  concurrency?: integer (default: 5)
    Max concurrent API calls (1-20)

Output Schema:
  batch_operation_id: string
  selector_matched: integer (total tasks matching selector)
  dry_run: boolean
  preview_tasks?: Array<{dart_id, title, current_values}> (if dry_run=true)
  successful_updates: integer
  failed_updates: integer
  successful_dart_ids: string[]
  failed_items: Array<{dart_id, error, reason}>
  execution_time_ms: integer

DartQL Syntax Guide:
  Operators: =, !=, >, >=, <, <=, IN, NOT IN, LIKE, CONTAINS
  Logical: AND, OR, NOT
  Grouping: Use parentheses for precedence

  Examples:
    "status = 'Todo'"
    "priority >= 3 AND assignee = 'duid_user1'"
    "tags CONTAINS 'urgent' AND due_at < '2026-02-01'"
    "(status = 'Todo' OR status = 'In Progress') AND NOT (priority = 1)"

Workflow:
  1. batch_update_tasks(selector="...", updates={...}, dry_run=true)
     → Preview matching tasks

  2. Review preview, confirm selector is correct

  3. batch_update_tasks(selector="...", updates={...}, dry_run=false)
     → Execute update

Token Budget: ~400 tokens
Performance: Slow (depends on match count)`,

    import_tasks_csv: `Tool: import_tasks_csv
Description: Bulk-create tasks from CSV data with validation and error recovery

Input Schema:
  csv_data?: string
    Inline CSV content (first row must be headers)

  csv_file_path?: string
    Path to CSV file (alternative to csv_data)

  dartboard: string (required)
    Default dartboard dart_id (can be overridden per-row via 'dartboard' column)

  column_mapping?: object
    Custom column name mappings (e.g., {'Task Name': 'title', 'Assigned To': 'assignee'})

  validate_only?: boolean (default: false)
    Validate and preview without creating tasks (RECOMMENDED for first run)

  continue_on_error?: boolean (default: true)
    Continue processing if individual rows fail

  concurrency?: integer (default: 5)
    Max concurrent task creation calls

CSV Format Guide:
  Required Columns:
    title - Task title (required)

  Optional Columns:
    description, status, priority, size, assignee, dartboard, tags, due_date, start_date, parent_task

  Flexible Column Names (case-insensitive):
    'Title' = 'title' = 'Task Name'
    'Assigned To' = 'assignee' = 'Owner'
    'Tags' = 'labels' (comma-separated)

CSV Example:
  title,description,assignee,priority,tags,due_date
  "Fix login bug","Users can't login",engineer@company.com,5,"bug,urgent",2026-02-01
  "Update docs","API documentation",writer@company.com,2,documentation,2026-02-15

Workflow:
  1. get_config() → Get dartboard_ids for reference resolution

  2. import_tasks_csv(csv_file_path='tasks.csv', dartboard='duid_board1', validate_only=true)
     → Validation errors, preview

  3. Fix CSV errors if any

  4. import_tasks_csv(csv_file_path='tasks.csv', dartboard='duid_board1', validate_only=false)
     → Execute import

Token Budget: ~500 tokens
Performance: Slow (depends on row count)`,

    relationships: `Topic: Task Relationships
Description: Dart supports six relationship types to model task dependencies and connections

Relationship Types:
  parent_task / subtask_ids
    Hierarchical parent-child relationships for breaking work into subtasks.
    A task can have one parent and multiple subtasks.

  blocker_ids / blocking_ids
    Dependency relationships where one task blocks another.
    blocker_ids: Tasks that must complete before this task can start.
    blocking_ids: Tasks that this task is blocking.

  duplicate_ids
    Links tasks that represent the same work (usually to consolidate).
    Bidirectional - marking A as duplicate of B links both.

  related_ids
    General-purpose links between related tasks.
    Use for reference without implying dependency or hierarchy.

Creating Tasks with Relationships:
  create_task(
    title="Implement login",
    subtask_ids=["duid_task2", "duid_task3"],
    blocker_ids=["duid_task1"]
  )

Updating Relationships:
  update_task(
    dart_id="duid_task1",
    subtask_ids=["duid_new1", "duid_new2"],  // Replaces existing
    related_ids=[]  // Clears all related tasks
  )
  Note: Relationship updates use full replacement, not append.

Querying Relationships:
  get_task(dart_id="duid_task1", expand_relationships=true)
    → Includes relationship_counts and expanded relationship details

  list_tasks(has_parent=true)
    → Filter to subtasks only (tasks with a parent)

  list_tasks(has_parent=false)
    → Filter to root tasks only (tasks without a parent)

API Limitation:
  The list_tasks endpoint only supports has_parent filter because the Dart
  API returns parent_task in list responses but does NOT return relationship
  arrays (subtask_ids, blocker_ids, etc.). To find tasks with relationships,
  use get_task() on individual tasks or filter by parent_task in DartQL.

Relationship Filters (list_tasks):
  has_parent: boolean - Tasks with/without a parent task (SUPPORTED)

  Note: Other relationship filters (has_subtasks, has_blockers, is_blocking)
  are NOT available because the list API doesn't return taskRelationships.

DartQL Relationship Queries (batch operations):
  Note: DartQL queries for batch_update_tasks/batch_delete_tasks fetch full
  task data, so relationship fields can be used in WHERE clauses:

  "parent_task IS NOT NULL"        - Subtasks (tasks with parent)
  "parent_task IS NULL"            - Root tasks (no parent)

CSV Import:
  Relationship columns accept comma-separated dart_ids:
    subtask_ids,blocker_ids
    "duid_a,duid_b","duid_c"

Best Practices:
  - Use expand_relationships=true sparingly (adds API calls)
  - Clear relationships with empty array [], not null
  - Validate dart_ids exist before creating relationships
  - Use get_task() to see full relationship data for a task

Token Budget: ~600 tokens
Performance: Varies by operation`,
  };

  const doc = toolDocs[target];

  if (!doc) {
    const availableTools = Object.keys(toolDocs).join(', ');
    return `Error: No documentation for tool "${target}".

Available tools with full documentation: ${availableTools}

For other tools, use: info(level='group', target='...')`;
  }

  return doc + "\n\nNext Steps:\n- info(level='overview') - Return to overview";
}

/**
 * Generate next steps based on current level
 */
function generateNextSteps(level: string, target?: string): string[] {
  if (level === 'overview') {
    return [
      "info(level='group', target='task-batch') - Learn batch operations",
      "get_config() - Get workspace configuration before creating tasks",
      "info(level='group', target='task-crud') - Learn single task operations",
    ];
  }

  if (level === 'group' && target) {
    const group = TOOL_GROUPS[target as keyof typeof TOOL_GROUPS];
    if (group && group.tools.length > 0) {
      return [
        `info(level='tool', target='${group.tools[0].name}') - Full documentation for ${group.tools[0].name}`,
        "info(level='overview') - Return to overview",
      ];
    }
  }

  if (level === 'tool') {
    return [
      "info(level='overview') - Return to overview",
      "get_config() - Get workspace configuration",
    ];
  }

  return [
    "info() - Show overview",
  ];
}

/**
 * Handle info tool request
 */
export async function handleInfo(input: InfoInput): Promise<InfoOutput> {
  // Defensive: handle undefined/null input
  const safeInput = input || {};

  const level = safeInput.level || 'overview';
  const target = safeInput.target;

  let content: string;

  switch (level) {
    case 'overview':
      content = renderOverview();
      break;

    case 'group':
      if (!target) {
        content = 'Error: target parameter required when level=group\n\n' + renderOverview();
      } else {
        content = renderGroup(target);
      }
      break;

    case 'tool':
      if (!target) {
        content = 'Error: target parameter required when level=tool\n\n' + renderOverview();
      } else {
        content = renderTool(target);
      }
      break;

    default:
      content = `Error: Invalid level "${level}". Valid levels: overview, group, tool\n\n` + renderOverview();
  }

  return {
    level,
    content,
    next_steps: generateNextSteps(level, target),
  };
}
