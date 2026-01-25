/**
 * Token-Efficient Table Formatter for DartQL Results
 *
 * Provides high-density, token-stingy output formats:
 * - table: Aligned text table with borders
 * - compact: Tab-separated, no borders
 * - csv: CSV for piping/export
 * - json: Full JSON (current behavior)
 * - ids: Just dart_ids, newline-separated
 */

import { DartTask } from '../types/index.js';

// ============================================================================
// Types
// ============================================================================

export type OutputFormat = 'table' | 'compact' | 'csv' | 'json' | 'ids';

/** Internal type with metadata for formatting */
interface TaskWithMeta extends DartTask {
  _titleWidth?: number;
}

export interface FieldConfig {
  key: string;           // Field key in DartTask
  header: string;        // Column header (abbreviated)
  width: number;         // Max width for table format
  align?: 'left' | 'right';
  format?: (value: unknown, task: DartTask) => string;
}

export interface FormatOptions {
  fields?: string[];              // Selected fields (default: essential)
  format?: OutputFormat;          // Output format (default: table)
  truncate_title?: number;        // Title truncation (default: 25)
  show_footer?: boolean;          // Show pagination footer (default: true)
  total_count?: number;           // Total count for footer
  has_more?: boolean;             // Has more results
  offset?: number;                // Current offset
}

export interface RelationshipCounts {
  subtasks: number;
  blockers: number;
  blocking: number;
  duplicates: number;
  related: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Priority abbreviations: value -> display */
const PRIORITY_MAP: Record<string, string> = {
  critical: 'C',
  high: 'H',
  medium: 'M',
  low: 'L',
  '5': 'C',
  '4': 'H',
  '3': 'M',
  '2': 'L',
  '1': '-',
  '0': '-',
};

/** Essential fields shown by default */
export const ESSENTIAL_FIELDS = ['id', 'title', 'status', 'pri', 'assignee', 'due'];

/** All available field definitions */
export const FIELD_DEFINITIONS: Record<string, FieldConfig> = {
  id: {
    key: 'dart_id',
    header: 'id',
    width: 8,
    format: (v) => abbreviateId(String(v || '')),
  },
  title: {
    key: 'title',
    header: 'title',
    width: 25,
    format: (v, task) => truncate(String(v || ''), (task as TaskWithMeta)._titleWidth || 25),
  },
  status: {
    key: 'status',
    header: 'status',
    width: 8,
    format: (v) => truncate(String(v || '-'), 8),
  },
  pri: {
    key: 'priority',
    header: 'pri',
    width: 3,
    align: 'right',
    format: (v) => formatPriority(v),
  },
  assignee: {
    key: 'assignees',
    header: '@',
    width: 10,
    format: (v) => formatAssignee(v),
  },
  due: {
    key: 'due_at',
    header: 'due',
    width: 10,
    format: (v) => formatDate(v),
  },
  board: {
    key: 'dartboard',
    header: 'board',
    width: 12,
    format: (v) => truncate(String(v || '-'), 12),
  },
  tags: {
    key: 'tags',
    header: 'tags',
    width: 15,
    format: (v) => formatTags(v),
  },
  size: {
    key: 'size',
    header: 'sz',
    width: 2,
    format: (v) => formatSize(v),
  },
  desc: {
    key: 'description',
    header: 'desc',
    width: 30,
    format: (v) => truncate(String(v || '-'), 30),
  },
  start: {
    key: 'start_at',
    header: 'start',
    width: 10,
    format: (v) => formatDate(v),
  },
  done: {
    key: 'completed_at',
    header: 'done',
    width: 10,
    format: (v) => formatDate(v),
  },
  created: {
    key: 'created_at',
    header: 'created',
    width: 10,
    format: (v) => formatDate(v),
  },
  updated: {
    key: 'updated_at',
    header: 'updated',
    width: 10,
    format: (v) => formatDate(v),
  },
  parent: {
    key: 'parent_task',
    header: 'parent',
    width: 8,
    format: (v) => v ? abbreviateId(String(v)) : '-',
  },
  '#subtasks': {
    key: 'subtask_ids',
    header: '#sub',
    width: 4,
    align: 'right',
    format: (v) => formatCount(v),
  },
  '#blockers': {
    key: 'blocker_ids',
    header: '#blk',
    width: 4,
    align: 'right',
    format: (v) => formatCount(v),
  },
  '#blocking': {
    key: 'blocking_ids',
    header: '#blkg',
    width: 5,
    align: 'right',
    format: (v) => formatCount(v),
  },
  '#dups': {
    key: 'duplicate_ids',
    header: '#dup',
    width: 4,
    align: 'right',
    format: (v) => formatCount(v),
  },
  '#related': {
    key: 'related_ids',
    header: '#rel',
    width: 4,
    align: 'right',
    format: (v) => formatCount(v),
  },
};

// ============================================================================
// Formatting Helpers
// ============================================================================

/** Abbreviate dart_id to last 6 characters with prefix */
export function abbreviateId(id: string): string {
  if (!id) return '-';
  if (id.length <= 8) return id;
  return '..' + id.slice(-6);
}

/** Truncate string with ellipsis */
export function truncate(str: string, maxLen: number): string {
  if (!str) return '-';
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

/** Format priority to single character */
export function formatPriority(value: unknown): string {
  if (value === null || value === undefined) return '-';
  const str = String(value).toLowerCase();
  return PRIORITY_MAP[str] || '-';
}

/** Format assignee(s) to abbreviated name */
export function formatAssignee(value: unknown): string {
  if (!value) return '-';
  if (Array.isArray(value)) {
    if (value.length === 0) return '-';
    // Take first assignee, abbreviate
    const first = String(value[0]);
    // If email, take part before @
    if (first.includes('@')) {
      return truncate(first.split('@')[0], 10);
    }
    // If name, take first name
    return truncate(first.split(' ')[0], 10);
  }
  return truncate(String(value), 10);
}

/** Format date to YYYY-MM-DD */
export function formatDate(value: unknown): string {
  if (!value) return '-';
  const str = String(value);
  // If already short date, return as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  // Extract date part from ISO string
  const match = str.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '-';
}

/** Format tags array to comma-separated string */
export function formatTags(value: unknown): string {
  if (!value) return '-';
  if (Array.isArray(value)) {
    if (value.length === 0) return '-';
    return value.slice(0, 3).join(',') + (value.length > 3 ? '...' : '');
  }
  return String(value);
}

/** Format size to abbreviation */
export function formatSize(value: unknown): string {
  if (value === null || value === undefined) return '-';
  const sizeMap: Record<string, string> = {
    xs: 'XS', small: 'S', medium: 'M', large: 'L', xl: 'XL',
    '1': 'XS', '2': 'S', '3': 'M', '4': 'L', '5': 'XL',
  };
  return sizeMap[String(value).toLowerCase()] || '-';
}

/** Format array count */
export function formatCount(value: unknown): string {
  if (!value) return '0';
  if (Array.isArray(value)) return String(value.length);
  return '0';
}

// ============================================================================
// Table Formatting
// ============================================================================

/** Pad string to width, respecting alignment */
function pad(str: string, width: number, align: 'left' | 'right' = 'left'): string {
  const truncated = str.length > width ? str.slice(0, width) : str;
  const padding = width - truncated.length;
  if (align === 'right') {
    return ' '.repeat(padding) + truncated;
  }
  return truncated + ' '.repeat(padding);
}

/** Get field value from task */
function getFieldValue(task: DartTask, fieldConfig: FieldConfig): string {
  const value = task[fieldConfig.key as keyof DartTask];
  if (fieldConfig.format) {
    return fieldConfig.format(value, task);
  }
  return value !== null && value !== undefined ? String(value) : '-';
}

/** Parse field list, handling modifiers like # for counts */
export function parseFieldList(fields: string[]): FieldConfig[] {
  const configs: FieldConfig[] = [];

  for (const field of fields) {
    // Handle count modifiers
    const countField = '#' + field.replace(/^#/, '');
    if (FIELD_DEFINITIONS[countField]) {
      configs.push(FIELD_DEFINITIONS[countField]);
      continue;
    }

    // Handle regular fields
    if (FIELD_DEFINITIONS[field]) {
      configs.push(FIELD_DEFINITIONS[field]);
    }
  }

  return configs;
}

/**
 * Format tasks as aligned text table
 */
export function formatAsTable(
  tasks: DartTask[],
  options: FormatOptions = {}
): string {
  const fields = options.fields || ESSENTIAL_FIELDS;
  const fieldConfigs = parseFieldList(fields);

  if (fieldConfigs.length === 0 || tasks.length === 0) {
    return 'No results';
  }

  // Add _titleWidth to tasks for dynamic truncation
  const titleWidth = options.truncate_title || 25;
  const tasksWithMeta = tasks.map(t => ({ ...t, _titleWidth: titleWidth }));

  // Build header row
  const headerCells = fieldConfigs.map(f => pad(f.header, f.width, f.align));
  const headerRow = '│ ' + headerCells.join(' │ ') + ' │';

  // Build separator
  const separatorCells = fieldConfigs.map(f => '─'.repeat(f.width));
  const topBorder = '┌─' + separatorCells.join('─┬─') + '─┐';
  const headerSep = '├─' + separatorCells.join('─┼─') + '─┤';
  const bottomBorder = '└─' + separatorCells.join('─┴─') + '─┘';

  // Build data rows
  const dataRows = tasksWithMeta.map(task => {
    const cells = fieldConfigs.map(f => {
      const value = getFieldValue(task as DartTask, f);
      return pad(value, f.width, f.align);
    });
    return '│ ' + cells.join(' │ ') + ' │';
  });

  // Build table
  const lines = [topBorder, headerRow, headerSep, ...dataRows, bottomBorder];

  // Add footer
  if (options.show_footer !== false) {
    const footer = buildFooter(tasks.length, options);
    if (footer) {
      lines.push(footer);
    }
  }

  return lines.join('\n');
}

/**
 * Format tasks as tab-separated compact output
 */
export function formatAsCompact(
  tasks: DartTask[],
  options: FormatOptions = {}
): string {
  const fields = options.fields || ESSENTIAL_FIELDS;
  const fieldConfigs = parseFieldList(fields);

  if (fieldConfigs.length === 0 || tasks.length === 0) {
    return '';
  }

  const titleWidth = options.truncate_title || 25;
  const tasksWithMeta = tasks.map(t => ({ ...t, _titleWidth: titleWidth }));

  const rows = tasksWithMeta.map(task => {
    const values = fieldConfigs.map(f => getFieldValue(task as DartTask, f));
    return values.join('\t');
  });

  // Add footer
  if (options.show_footer !== false) {
    const footer = buildFooter(tasks.length, options);
    if (footer) {
      rows.push(footer);
    }
  }

  return rows.join('\n');
}

/**
 * Format tasks as CSV
 */
export function formatAsCSV(
  tasks: DartTask[],
  options: FormatOptions = {}
): string {
  const fields = options.fields || ESSENTIAL_FIELDS;
  const fieldConfigs = parseFieldList(fields);

  if (fieldConfigs.length === 0) {
    return '';
  }

  // CSV header
  const header = fieldConfigs.map(f => f.header).join(',');

  if (tasks.length === 0) {
    return header;
  }

  const titleWidth = options.truncate_title || 100; // Wider for CSV
  const tasksWithMeta = tasks.map(t => ({ ...t, _titleWidth: titleWidth }));

  const rows = tasksWithMeta.map(task => {
    const values = fieldConfigs.map(f => {
      const value = getFieldValue(task as DartTask, f);
      // Escape CSV: quote if contains comma, quote, or newline
      if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return '"' + value.replace(/"/g, '""') + '"';
      }
      return value;
    });
    return values.join(',');
  });

  return [header, ...rows].join('\n');
}

/**
 * Format tasks as newline-separated IDs only
 */
export function formatAsIds(tasks: DartTask[]): string {
  return tasks.map(t => t.dart_id).join('\n');
}

/**
 * Build pagination footer
 */
function buildFooter(returnedCount: number, options: FormatOptions): string {
  const parts: string[] = [];

  parts.push(`${returnedCount} tasks`);

  if (options.total_count !== undefined && options.total_count !== returnedCount) {
    parts.push(`of ${options.total_count}`);
  }

  if (options.has_more) {
    parts.push(`| more: +${(options.offset || 0) + returnedCount}`);
  }

  return parts.join(' ');
}

// ============================================================================
// Main Formatter Function
// ============================================================================

/**
 * Format tasks according to specified options
 */
export function formatTasks(
  tasks: DartTask[],
  options: FormatOptions = {}
): string {
  const format = options.format || 'table';

  switch (format) {
    case 'table':
      return formatAsTable(tasks, options);
    case 'compact':
      return formatAsCompact(tasks, options);
    case 'csv':
      return formatAsCSV(tasks, options);
    case 'ids':
      return formatAsIds(tasks);
    case 'json':
      return JSON.stringify(tasks, null, 2);
    default:
      return formatAsTable(tasks, options);
  }
}

/**
 * Get relationship counts from a task
 */
export function getRelationshipCounts(task: DartTask): RelationshipCounts {
  return {
    subtasks: task.subtask_ids?.length || 0,
    blockers: task.blocker_ids?.length || 0,
    blocking: task.blocking_ids?.length || 0,
    duplicates: task.duplicate_ids?.length || 0,
    related: task.related_ids?.length || 0,
  };
}
