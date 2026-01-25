#!/usr/bin/env node

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get package.json path
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJsonPath = join(__dirname, '..', 'package.json');

// Handle --version and --help flags before any other imports
const args = process.argv.slice(2);
if (args.includes('--version') || args.includes('-v')) {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  console.log(packageJson.version);
  process.exit(0);
}

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
dart-query - MCP server for Dart AI task management

Usage:
  dart-query [options]

Options:
  --version, -v    Show version number
  --help, -h       Show this help message

Environment Variables:
  DART_TOKEN       Your Dart AI API token (required)
                   Get it from: https://app.dartai.com/?settings=account

MCP Server:
  This is an MCP (Model Context Protocol) server.
  It should be configured in your MCP client (e.g., Claude Desktop).
  See README.md for configuration instructions.
`);
  process.exit(0);
}

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Import tool handlers
import { handleInfo } from './tools/info.js';
import { handleGetConfig } from './tools/get_config.js';
import { handleCreateTask } from './tools/create_task.js';
import { handleListTasks } from './tools/list_tasks.js';
import { handleGetTask } from './tools/get_task.js';
import { handleUpdateTask } from './tools/update_task.js';
import { handleDeleteTask } from './tools/delete_task.js';
import { handleBatchUpdateTasks } from './tools/batch_update_tasks.js';
import { handleBatchDeleteTasks } from './tools/batch_delete_tasks.js';
import { handleGetBatchStatus } from './tools/get_batch_status.js';
import { handleImportTasksCSV } from './tools/import_tasks_csv.js';
import { handleListDocs } from './tools/list_docs.js';
import { handleCreateDoc } from './tools/create_doc.js';
import { handleGetDoc } from './tools/get_doc.js';
import { handleUpdateDoc } from './tools/update_doc.js';
import { handleDeleteDoc } from './tools/delete_doc.js';
import { handleSearchTasks } from './tools/search_tasks.js';
import { handleAddTaskComment } from './tools/add_task_comment.js';
import { handleListComments } from './tools/list_comments.js';
import { handleMoveTask } from './tools/move_task.js';
import { handleAddTimeTracking } from './tools/add_time_tracking.js';
import { handleAttachUrl } from './tools/attach_url.js';
import { handleGetDartboard } from './tools/get_dartboard.js';
import { handleGetFolder } from './tools/get_folder.js';

// Warn if DART_TOKEN is missing (but don't exit - tools will fail when called)
const DART_TOKEN = process.env.DART_TOKEN;
if (!DART_TOKEN) {
  console.error('Warning: DART_TOKEN environment variable is not set');
  console.error('Tools will fail when called. Get your token from: https://app.dartai.com/?settings=account');
} else if (!DART_TOKEN.startsWith('dsa_')) {
  console.error('Warning: DART_TOKEN should start with "dsa_"');
  console.error('Check your token format at: https://app.dartai.com/?settings=account');
}

/**
 * dart-query MCP Server
 * Advanced task management for Dart AI with batch operations and DartQL
 */
class DartQueryServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'dart-query',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
    this.setupErrorHandling();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        // Discovery & Config
        {
          name: 'info',
          description: 'Progressive discovery of dart-query capabilities - start here',
          inputSchema: {
            type: 'object',
            properties: {
              level: {
                type: 'string',
                enum: ['overview', 'group', 'tool'],
                description: 'Detail level: overview=categories, group=tools in category, tool=full documentation',
              },
              target: {
                type: 'string',
                description: 'Group name (when level=group) or tool name (when level=tool)',
              },
            },
          },
        },
        {
          name: 'get_config',
          description: 'Get workspace configuration: assignees, dartboards, statuses, tags, priorities, sizes',
          inputSchema: {
            type: 'object',
            properties: {
              cache_bust: {
                type: 'boolean',
                description: 'Force refresh cached config (default: 5-minute cache)',
              },
              include: {
                type: 'array',
                items: {
                  type: 'string',
                  enum: ['assignees', 'dartboards', 'statuses', 'tags', 'priorities', 'sizes', 'folders'],
                },
                description: 'Limit response to specific config sections (default: all)',
              },
            },
          },
        },

        // Task CRUD
        {
          name: 'create_task',
          description: 'Create a new task with title, description, status, priority, size, dates, dartboard, assignees, tags, and task relationships (subtasks, blockers, related tasks)',
          inputSchema: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: 'Task title (max 500 chars)',
              },
              description: {
                type: 'string',
                description: 'Task description (markdown supported)',
              },
              dartboard: {
                type: 'string',
                description: 'Dartboard dart_id (use get_config to find)',
              },
              status: {
                type: 'string',
                description: 'Status name or dart_id',
              },
              priority: {
                type: 'integer',
                description: 'Priority 1-5 (1=lowest, 5=highest)',
              },
              size: {
                type: 'integer',
                description: 'Size estimate 1-5',
              },
              assignees: {
                type: 'array',
                items: { type: 'string' },
                description: 'Array of assignee dart_ids',
              },
              tags: {
                type: 'array',
                items: { type: 'string' },
                description: 'Array of tag dart_ids',
              },
              due_at: {
                type: 'string',
                description: 'Due date (ISO8601)',
              },
              start_at: {
                type: 'string',
                description: 'Start date (ISO8601)',
              },
              parent_task: {
                type: 'string',
                description: 'Parent task dart_id for subtasks',
              },
              subtask_ids: {
                type: 'array',
                items: { type: 'string' },
                description: 'IDs of tasks that are subtasks (children) of this task. Each ID must be a valid dart_id format.',
              },
              blocker_ids: {
                type: 'array',
                items: { type: 'string' },
                description: 'IDs of tasks that block this task from being started or completed. Each ID must be a valid dart_id format.',
              },
              blocking_ids: {
                type: 'array',
                items: { type: 'string' },
                description: 'IDs of tasks that this task is blocking. Each ID must be a valid dart_id format.',
              },
              duplicate_ids: {
                type: 'array',
                items: { type: 'string' },
                description: 'IDs of tasks that are duplicates of this task. Each ID must be a valid dart_id format.',
              },
              related_ids: {
                type: 'array',
                items: { type: 'string' },
                description: 'IDs of tasks that are related to this task (loosely connected). Each ID must be a valid dart_id format.',
              },
            },
            required: ['title', 'dartboard'],
          },
        },

        // Task Query
        {
          name: 'list_tasks',
          description: 'Query tasks with filters (assignee, status, dartboard, priority, tags, dates, relationships), pagination, and detail levels. Relationship filters use client-side filtering - may be slower for large task counts.',
          inputSchema: {
            type: 'object',
            properties: {
              assignee: {
                type: 'string',
                description: 'Filter by assignee (dart_id, name, or email)',
              },
              status: {
                type: 'string',
                description: 'Filter by status (dart_id or name)',
              },
              dartboard: {
                type: 'string',
                description: 'Filter by dartboard (dart_id or name)',
              },
              priority: {
                type: 'integer',
                description: 'Filter by priority (1-5)',
              },
              tags: {
                type: 'array',
                items: { type: 'string' },
                description: 'Filter by tags (dart_ids or names)',
              },
              due_before: {
                type: 'string',
                description: 'Filter tasks due before date (ISO8601)',
              },
              due_after: {
                type: 'string',
                description: 'Filter tasks due after date (ISO8601)',
              },
              // Relationship filters (client-side)
              has_parent: {
                type: 'boolean',
                description: 'Filter tasks with parent (true) or without parent (false). Client-side filter.',
              },
              has_subtasks: {
                type: 'boolean',
                description: 'Filter tasks with subtasks (true) or without subtasks (false). Client-side filter.',
              },
              has_blockers: {
                type: 'boolean',
                description: 'Filter tasks that are blocked (true) or not blocked (false). Client-side filter.',
              },
              is_blocking: {
                type: 'boolean',
                description: 'Filter tasks that block others (true) or block nothing (false). Client-side filter.',
              },
              blocked_by: {
                type: 'string',
                description: 'Filter tasks blocked by specific task (dart_id). Client-side filter.',
              },
              blocking: {
                type: 'string',
                description: 'Filter tasks that are blocking a specific task (dart_id). Client-side filter.',
              },
              // Pagination
              limit: {
                type: 'integer',
                description: 'Max tasks to return (default: 50, max: 500)',
              },
              offset: {
                type: 'integer',
                description: 'Pagination offset (default: 0)',
              },
              detail_level: {
                type: 'string',
                enum: ['minimal', 'standard', 'full'],
                description: 'minimal=id+title, standard=+status+assignee+priority, full=all fields including relationships',
              },
            },
          },
        },
        {
          name: 'get_task',
          description: 'Get a specific task by dart_id with optional comments and relationship details. Returns task relationships (subtasks, blockers, blocking, duplicates, related) with counts and optional expanded titles.',
          inputSchema: {
            type: 'object',
            properties: {
              dart_id: {
                type: 'string',
                description: 'Task dart_id',
              },
              include_comments: {
                type: 'boolean',
                description: 'Include task comments in response (default: false)',
              },
              include_relationships: {
                type: 'boolean',
                description: 'Include relationship fields and counts in response (default: true). Set to false for smaller response.',
              },
              expand_relationships: {
                type: 'boolean',
                description: 'Fetch titles for all related tasks (default: false). Requires additional API calls. Only applies when include_relationships is true.',
              },
            },
            required: ['dart_id'],
          },
        },
        {
          name: 'update_task',
          description: 'Update an existing task with partial field updates including task relationships (validates references, only sends changed fields). Relationship arrays use full replacement semantics - to add/remove, get current values, modify, then update with the full array.',
          inputSchema: {
            type: 'object',
            properties: {
              dart_id: {
                type: 'string',
                description: 'Task dart_id to update',
              },
              updates: {
                type: 'object',
                description: 'Fields to update (partial DartTask object)',
                properties: {
                  title: {
                    type: 'string',
                    description: 'Task title (max 500 chars)',
                  },
                  description: {
                    type: 'string',
                    description: 'Task description (markdown supported)',
                  },
                  dartboard: {
                    type: 'string',
                    description: 'Dartboard dart_id or name',
                  },
                  status: {
                    type: 'string',
                    description: 'Status dart_id or name',
                  },
                  priority: {
                    type: 'integer',
                    description: 'Priority 1-5',
                  },
                  size: {
                    type: 'integer',
                    description: 'Size estimate 1-5',
                  },
                  assignees: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of assignee dart_ids, names, or emails',
                  },
                  tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of tag dart_ids or names',
                  },
                  due_at: {
                    type: 'string',
                    description: 'Due date (ISO8601)',
                  },
                  start_at: {
                    type: 'string',
                    description: 'Start date (ISO8601)',
                  },
                  parent_task: {
                    type: 'string',
                    description: 'Parent task dart_id',
                  },
                  subtask_ids: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'IDs of tasks that are subtasks (children) of this task. Full replacement: set to [] to clear all subtasks.',
                  },
                  blocker_ids: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'IDs of tasks that block this task. Full replacement: set to [] to clear all blockers.',
                  },
                  blocking_ids: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'IDs of tasks that this task is blocking. Full replacement: set to [] to clear.',
                  },
                  duplicate_ids: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'IDs of tasks that are duplicates of this task. Full replacement: set to [] to clear.',
                  },
                  related_ids: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'IDs of related tasks (loosely connected). Full replacement: set to [] to clear.',
                  },
                },
              },
            },
            required: ['dart_id', 'updates'],
          },
        },
        {
          name: 'delete_task',
          description: 'Delete a task (moves to trash - recoverable via Dart web UI)',
          inputSchema: {
            type: 'object',
            properties: {
              dart_id: {
                type: 'string',
                description: 'Task dart_id to delete',
              },
            },
            required: ['dart_id'],
          },
        },

        // Batch Operations
        {
          name: 'batch_update_tasks',
          description: 'Batch update multiple tasks matching a DartQL selector. Supports all task fields including relationships. CRITICAL: Always use dry_run=true first to preview changes!',
          inputSchema: {
            type: 'object',
            properties: {
              selector: {
                type: 'string',
                description: 'DartQL WHERE clause to select tasks (e.g., "status = \'Todo\' AND priority >= 3")',
              },
              updates: {
                type: 'object',
                description: 'Fields to update (partial DartTask object). Relationship arrays use full replacement semantics - set to [] to clear.',
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                  dartboard: { type: 'string' },
                  status: { type: 'string' },
                  priority: { type: 'integer' },
                  size: { type: 'integer' },
                  assignees: { type: 'array', items: { type: 'string' } },
                  tags: { type: 'array', items: { type: 'string' } },
                  due_at: { type: 'string' },
                  start_at: { type: 'string' },
                  parent_task: { type: 'string' },
                  subtask_ids: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'IDs of tasks that are subtasks (children) of this task. Full replacement: set to [] to clear.',
                  },
                  blocker_ids: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'IDs of tasks that block this task. Full replacement: set to [] to clear.',
                  },
                  blocking_ids: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'IDs of tasks that this task is blocking. Full replacement: set to [] to clear.',
                  },
                  duplicate_ids: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'IDs of tasks that are duplicates of this task. Full replacement: set to [] to clear.',
                  },
                  related_ids: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'IDs of related tasks (loosely connected). Full replacement: set to [] to clear.',
                  },
                },
              },
              dry_run: {
                type: 'boolean',
                description: 'Preview mode (default: true). Set to false to execute updates.',
              },
              concurrency: {
                type: 'integer',
                description: 'Parallel updates (default: 5, range: 1-20)',
              },
            },
            required: ['selector', 'updates'],
          },
        },
        {
          name: 'batch_delete_tasks',
          description: 'Batch delete multiple tasks matching a DartQL selector. MOST DANGEROUS OPERATION! CRITICAL: dry_run defaults to true, confirm=true REQUIRED when dry_run=false. Tasks move to trash (recoverable).',
          inputSchema: {
            type: 'object',
            properties: {
              selector: {
                type: 'string',
                description: 'DartQL WHERE clause to select tasks (e.g., "status = \'Archived\' AND completed_at < \'2025-01-01\'")',
              },
              dry_run: {
                type: 'boolean',
                description: 'Preview mode (default: true). Set to false to execute deletions.',
              },
              confirm: {
                type: 'boolean',
                description: 'REQUIRED when dry_run=false. Safety confirmation for deletions.',
              },
              concurrency: {
                type: 'integer',
                description: 'Parallel deletions (default: 5, range: 1-20)',
              },
            },
            required: ['selector'],
          },
        },
        {
          name: 'get_batch_status',
          description: 'Retrieve status of a batch operation (update, delete, or import) by batch_operation_id. Operations are kept in memory for 1 hour.',
          inputSchema: {
            type: 'object',
            properties: {
              batch_operation_id: {
                type: 'string',
                description: 'Batch operation ID returned from batch_update_tasks, batch_delete_tasks, or import_tasks_csv',
              },
            },
            required: ['batch_operation_id'],
          },
        },

        // CSV Import
        {
          name: 'import_tasks_csv',
          description: 'Import tasks from CSV file with validation and parallel creation. CRITICAL: ALWAYS use validate_only=true first! Production safety: validate → fix errors → import.',
          inputSchema: {
            type: 'object',
            properties: {
              csv_data: {
                type: 'string',
                description: 'CSV data as string (use this OR csv_file_path)',
              },
              csv_file_path: {
                type: 'string',
                description: 'Path to CSV file (use this OR csv_data)',
              },
              dartboard: {
                type: 'string',
                description: 'Dartboard dart_id or name for all imported tasks',
              },
              column_mapping: {
                type: 'object',
                description: 'Custom column name mapping (e.g., {"Task Name": "title", "Owner": "assignee"})',
              },
              validate_only: {
                type: 'boolean',
                description: 'Preview mode (default: TRUE for production safety). Returns validation errors and preview without creating tasks.',
              },
              continue_on_error: {
                type: 'boolean',
                description: 'Continue importing valid rows even if some fail (default: true)',
              },
              concurrency: {
                type: 'integer',
                description: 'Parallel task creation (default: 5, range: 1-20)',
              },
            },
            required: ['dartboard'],
          },
        },

        // Document CRUD
        {
          name: 'list_docs',
          description: 'List documents with optional filtering by folder, title_contains, text_contains. Supports pagination.',
          inputSchema: {
            type: 'object',
            properties: {
              folder: {
                type: 'string',
                description: 'Filter by folder (dart_id or name)',
              },
              title_contains: {
                type: 'string',
                description: 'Filter by title substring (case-insensitive)',
              },
              text_contains: {
                type: 'string',
                description: 'Filter by text content substring (case-insensitive)',
              },
              limit: {
                type: 'integer',
                description: 'Max docs to return (default: 50, max: 500)',
              },
              offset: {
                type: 'integer',
                description: 'Pagination offset (default: 0)',
              },
            },
          },
        },
        {
          name: 'create_doc',
          description: 'Create a new document with title, text (markdown supported), and optional folder',
          inputSchema: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: 'Document title',
              },
              text: {
                type: 'string',
                description: 'Document text content (markdown supported)',
              },
              folder: {
                type: 'string',
                description: 'Folder dart_id or name (optional)',
              },
            },
            required: ['title', 'text'],
          },
        },
        {
          name: 'get_doc',
          description: 'Get a specific document by doc_id with full text content',
          inputSchema: {
            type: 'object',
            properties: {
              doc_id: {
                type: 'string',
                description: 'Document doc_id',
              },
            },
            required: ['doc_id'],
          },
        },
        {
          name: 'update_doc',
          description: 'Update an existing document (title, text, or folder). Validates references and only sends changed fields.',
          inputSchema: {
            type: 'object',
            properties: {
              doc_id: {
                type: 'string',
                description: 'Document doc_id to update',
              },
              updates: {
                type: 'object',
                description: 'Fields to update',
                properties: {
                  title: {
                    type: 'string',
                    description: 'Document title',
                  },
                  text: {
                    type: 'string',
                    description: 'Document text (markdown supported)',
                  },
                  folder: {
                    type: 'string',
                    description: 'Folder dart_id or name',
                  },
                },
              },
            },
            required: ['doc_id', 'updates'],
          },
        },
        {
          name: 'delete_doc',
          description: 'Delete a document (moves to trash - recoverable via Dart web UI)',
          inputSchema: {
            type: 'object',
            properties: {
              doc_id: {
                type: 'string',
                description: 'Document doc_id to delete',
              },
            },
            required: ['doc_id'],
          },
        },

        // Search
        {
          name: 'search_tasks',
          description: 'Full-text search across tasks with relevance ranking. Alternative to list_tasks for text-based discovery. Supports quoted phrases and exclusions.',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query. Supports quoted phrases ("exact match"), exclusions (-term), and regular terms.',
              },
              dartboard: {
                type: 'string',
                description: 'Optional dartboard filter (dart_id or name)',
              },
              include_completed: {
                type: 'boolean',
                description: 'Include completed tasks in results (default: false)',
              },
              limit: {
                type: 'integer',
                description: 'Max results to return (default: 50, max: 500)',
              },
            },
            required: ['query'],
          },
        },

        // Task Comments
        {
          name: 'add_task_comment',
          description: 'Add a comment to a task for status updates, AI rationale, or notes. Supports markdown formatting.',
          inputSchema: {
            type: 'object',
            properties: {
              dart_id: {
                type: 'string',
                description: 'Task dart_id to add comment to',
              },
              text: {
                type: 'string',
                description: 'Comment text (markdown supported)',
              },
            },
            required: ['dart_id', 'text'],
          },
        },
        {
          name: 'list_comments',
          description: 'List comments on a task with pagination. Token-efficient: returns minimal comment data.',
          inputSchema: {
            type: 'object',
            properties: {
              task_id: {
                type: 'string',
                description: 'Task dart_id to list comments for',
              },
              limit: {
                type: 'integer',
                description: 'Max comments to return (default: 50, max: 100)',
              },
              offset: {
                type: 'integer',
                description: 'Pagination offset (default: 0)',
              },
            },
            required: ['task_id'],
          },
        },

        // Task Operations
        {
          name: 'move_task',
          description: 'Move/reposition a task within a dartboard or to a different dartboard. Supports ordering by index or relative to another task.',
          inputSchema: {
            type: 'object',
            properties: {
              dart_id: {
                type: 'string',
                description: 'Task dart_id to move',
              },
              dartboard: {
                type: 'string',
                description: 'Target dartboard (dart_id or name) - moves task to different dartboard',
              },
              order: {
                type: 'integer',
                description: 'Position index in dartboard (0-based)',
              },
              after_id: {
                type: 'string',
                description: 'Place task after this task dart_id',
              },
              before_id: {
                type: 'string',
                description: 'Place task before this task dart_id',
              },
            },
            required: ['dart_id'],
          },
        },
        {
          name: 'add_time_tracking',
          description: 'Add a time tracking entry to a task. Supports started_at/finished_at or duration_minutes.',
          inputSchema: {
            type: 'object',
            properties: {
              dart_id: {
                type: 'string',
                description: 'Task dart_id to add time entry to',
              },
              started_at: {
                type: 'string',
                description: 'Start time in ISO8601 format (e.g., 2026-01-25T10:00:00Z)',
              },
              finished_at: {
                type: 'string',
                description: 'End time in ISO8601 format (optional if duration_minutes provided)',
              },
              duration_minutes: {
                type: 'integer',
                description: 'Duration in minutes (optional if finished_at provided)',
              },
              note: {
                type: 'string',
                description: 'Optional note about the time entry',
              },
            },
            required: ['dart_id', 'started_at'],
          },
        },
        {
          name: 'attach_url',
          description: 'Attach a file from URL to a task. URL must be publicly accessible.',
          inputSchema: {
            type: 'object',
            properties: {
              dart_id: {
                type: 'string',
                description: 'Task dart_id to attach file to',
              },
              url: {
                type: 'string',
                description: 'Public URL of file to attach',
              },
              filename: {
                type: 'string',
                description: 'Optional filename override',
              },
            },
            required: ['dart_id', 'url'],
          },
        },

        // Workspace Navigation
        {
          name: 'get_dartboard',
          description: 'Get details about a dartboard including task count. Token-efficient lookup.',
          inputSchema: {
            type: 'object',
            properties: {
              dartboard_id: {
                type: 'string',
                description: 'Dartboard dart_id or name',
              },
            },
            required: ['dartboard_id'],
          },
        },
        {
          name: 'get_folder',
          description: 'Get details about a folder including doc count. Token-efficient lookup.',
          inputSchema: {
            type: 'object',
            properties: {
              folder_id: {
                type: 'string',
                description: 'Folder dart_id or name',
              },
            },
            required: ['folder_id'],
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'info': {
            const result = await handleInfo(args || {});
            return {
              content: [
                {
                  type: 'text',
                  text: result.content,
                },
              ],
            };
          }

          case 'get_config': {
            const result = await handleGetConfig(args || {});
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'create_task': {
            const result = await handleCreateTask((args || {}) as any);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'list_tasks': {
            const result = await handleListTasks((args || {}) as any);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'get_task': {
            const result = await handleGetTask((args || {}) as any);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'update_task': {
            const result = await handleUpdateTask((args || {}) as any);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'delete_task': {
            const result = await handleDeleteTask((args || {}) as any);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'batch_update_tasks': {
            const result = await handleBatchUpdateTasks((args || {}) as any);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'batch_delete_tasks': {
            const result = await handleBatchDeleteTasks((args || {}) as any);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'get_batch_status': {
            const result = await handleGetBatchStatus((args || {}) as any);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'import_tasks_csv': {
            const result = await handleImportTasksCSV((args || {}) as any);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'list_docs': {
            const result = await handleListDocs((args || {}) as any);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'create_doc': {
            const result = await handleCreateDoc((args || {}) as any);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'get_doc': {
            const result = await handleGetDoc((args || {}) as any);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'update_doc': {
            const result = await handleUpdateDoc((args || {}) as any);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'delete_doc': {
            const result = await handleDeleteDoc((args || {}) as any);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'search_tasks': {
            const result = await handleSearchTasks((args || {}) as any);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'add_task_comment': {
            const result = await handleAddTaskComment((args || {}) as any);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'list_comments': {
            const result = await handleListComments((args || {}) as any);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'move_task': {
            const result = await handleMoveTask((args || {}) as any);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'add_time_tracking': {
            const result = await handleAddTimeTracking((args || {}) as any);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'attach_url': {
            const result = await handleAttachUrl((args || {}) as any);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'get_dartboard': {
            const result = await handleGetDartboard((args || {}) as any);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'get_folder': {
            const result = await handleGetFolder((args || {}) as any);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [
            {
              type: 'text',
              text: `Error executing ${name}: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('dart-query MCP server running on stdio');
  }
}

// Start server
const server = new DartQueryServer();
server.run().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
