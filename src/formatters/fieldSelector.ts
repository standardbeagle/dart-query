/**
 * Field Selection Parser for DartQL
 *
 * Parses field selection syntax:
 * - Simple: "id,title,status,due"
 * - With expansion: "+blockers,+subtasks" (fetch related task titles)
 * - With counts: "#blockers,#subtasks" (just counts)
 * - SELECT prefix: "SELECT id,title,due WHERE status = 'Todo'"
 *
 * Field Modifiers:
 * - + prefix: Expand (fetch related data)
 * - # prefix: Count only
 * - * wildcard: All fields
 */

import { ESSENTIAL_FIELDS, FIELD_DEFINITIONS, OutputFormat } from './tableFormatter.js';

// ============================================================================
// Types
// ============================================================================

export interface FieldSelection {
  /** Selected field names */
  fields: string[];
  /** Fields to expand (fetch related titles) */
  expand: string[];
  /** Output format */
  format: OutputFormat;
  /** Title truncation width */
  truncate_title: number;
  /** Whether field selection was explicit or default */
  explicit: boolean;
}

export interface ParsedQuery {
  /** Field selection */
  selection: FieldSelection;
  /** WHERE clause (if SELECT used) */
  whereClause: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Relationship fields that can be expanded */
const EXPANDABLE_FIELDS = ['subtasks', 'blockers', 'blocking', 'duplicates', 'related'];

/** All available field names */
export const AVAILABLE_FIELDS = [
  // Core fields
  'id', 'title', 'desc', 'status', 'pri', 'size',
  'assignee', 'board', 'tags', 'due', 'start', 'done',
  'created', 'updated', 'parent',
  // Relationship counts
  '#subtasks', '#blockers', '#blocking', '#dups', '#related',
];

// ============================================================================
// Parsing Functions
// ============================================================================

/**
 * Parse a field list string into FieldSelection
 *
 * Examples:
 * - "id,title,status" -> fields: ['id', 'title', 'status']
 * - "id,title,+blockers" -> fields: ['id', 'title'], expand: ['blockers']
 * - "#subtasks,#blockers" -> fields: ['#subtasks', '#blockers']
 * - "*" -> all fields
 */
export function parseFieldList(fieldStr: string): FieldSelection {
  const selection: FieldSelection = {
    fields: [],
    expand: [],
    format: 'table',
    truncate_title: 25,
    explicit: true,
  };

  if (!fieldStr || fieldStr.trim() === '') {
    selection.fields = [...ESSENTIAL_FIELDS];
    selection.explicit = false;
    return selection;
  }

  const parts = fieldStr.split(',').map(s => s.trim().toLowerCase());

  for (const part of parts) {
    if (!part) continue;

    // Handle wildcard
    if (part === '*') {
      selection.fields = Object.keys(FIELD_DEFINITIONS);
      continue;
    }

    // Handle expansion modifier (+)
    if (part.startsWith('+')) {
      const field = part.slice(1);
      if (EXPANDABLE_FIELDS.includes(field)) {
        selection.expand.push(field);
        // Also add the count field
        selection.fields.push('#' + field);
      }
      continue;
    }

    // Handle count modifier (#)
    if (part.startsWith('#')) {
      const countField = part;
      if (FIELD_DEFINITIONS[countField]) {
        selection.fields.push(countField);
      }
      continue;
    }

    // Regular field
    if (FIELD_DEFINITIONS[part]) {
      selection.fields.push(part);
    }
  }

  // If no valid fields found, use defaults
  if (selection.fields.length === 0) {
    selection.fields = [...ESSENTIAL_FIELDS];
    selection.explicit = false;
  }

  return selection;
}

/**
 * Parse format option from string
 */
export function parseFormat(formatStr: string | undefined): OutputFormat {
  if (!formatStr) return 'table';

  const normalized = formatStr.toLowerCase().trim();
  const validFormats: OutputFormat[] = ['table', 'compact', 'csv', 'json', 'ids'];

  if (validFormats.includes(normalized as OutputFormat)) {
    return normalized as OutputFormat;
  }

  return 'table';
}

/**
 * Parse a full query that may include SELECT prefix
 *
 * Examples:
 * - "status = 'Todo'" -> simple WHERE clause
 * - "SELECT id,title WHERE status = 'Todo'" -> field selection + WHERE
 * - "SELECT id,title WHERE has_parent = true format=compact"
 */
export function parseQuery(query: string): ParsedQuery {
  const result: ParsedQuery = {
    selection: {
      fields: [...ESSENTIAL_FIELDS],
      expand: [],
      format: 'table',
      truncate_title: 25,
      explicit: false,
    },
    whereClause: query.trim(),
  };

  if (!query || query.trim() === '') {
    return result;
  }

  let workingQuery = query.trim();

  // Extract format option (at end of query)
  const formatMatch = workingQuery.match(/\s+format\s*=\s*(\w+)\s*$/i);
  if (formatMatch) {
    result.selection.format = parseFormat(formatMatch[1]);
    workingQuery = workingQuery.slice(0, formatMatch.index).trim();
  }

  // Check for SELECT prefix
  const selectMatch = workingQuery.match(/^SELECT\s+(.+?)\s+WHERE\s+(.+)$/i);
  if (selectMatch) {
    const fieldsPart = selectMatch[1].trim();
    const wherePart = selectMatch[2].trim();

    result.selection = {
      ...parseFieldList(fieldsPart),
      format: result.selection.format,
    };
    result.whereClause = wherePart;
    return result;
  }

  // Check for SELECT without WHERE (select all)
  const selectOnlyMatch = workingQuery.match(/^SELECT\s+(.+)$/i);
  if (selectOnlyMatch && !selectOnlyMatch[1].toLowerCase().includes(' where ')) {
    result.selection = {
      ...parseFieldList(selectOnlyMatch[1].trim()),
      format: result.selection.format,
    };
    result.whereClause = '';
    return result;
  }

  // No SELECT prefix, treat entire query as WHERE clause
  result.whereClause = workingQuery;
  return result;
}

/**
 * Validate field names and return unknown fields
 */
export function validateFields(fields: string[]): { valid: string[]; unknown: string[] } {
  const valid: string[] = [];
  const unknown: string[] = [];

  for (const field of fields) {
    const normalized = field.toLowerCase().trim();

    // Handle modifiers
    const cleanField = normalized.replace(/^[+#]/, '');

    if (FIELD_DEFINITIONS[normalized] ||
        FIELD_DEFINITIONS['#' + cleanField] ||
        EXPANDABLE_FIELDS.includes(cleanField) ||
        normalized === '*') {
      valid.push(normalized);
    } else {
      unknown.push(field);
    }
  }

  return { valid, unknown };
}

/**
 * Get help text for available fields
 */
export function getFieldsHelp(): string {
  const lines = [
    'Available fields:',
    '',
    'Core fields:',
    '  id       - Task ID (abbreviated)',
    '  title    - Task title',
    '  desc     - Description',
    '  status   - Current status',
    '  pri      - Priority (C/H/M/L)',
    '  size     - Size (XS/S/M/L/XL)',
    '  assignee - Assignee name',
    '  board    - Dartboard name',
    '  tags     - Tags (comma-separated)',
    '  due      - Due date',
    '  start    - Start date',
    '  done     - Completion date',
    '  created  - Created date',
    '  updated  - Updated date',
    '  parent   - Parent task ID',
    '',
    'Relationship counts (prefix with #):',
    '  #subtasks - Number of subtasks',
    '  #blockers - Number of blockers',
    '  #blocking - Number of tasks blocked',
    '  #dups     - Number of duplicates',
    '  #related  - Number of related tasks',
    '',
    'Expansion (prefix with +):',
    '  +subtasks - Expand subtask titles',
    '  +blockers - Expand blocker titles',
    '  +blocking - Expand blocked task titles',
    '',
    'Special:',
    '  *         - All fields',
    '',
    'Output formats (append format=X):',
    '  table   - Aligned text table (default)',
    '  compact - Tab-separated, no borders',
    '  csv     - CSV format',
    '  json    - Full JSON',
    '  ids     - Just dart_ids',
    '',
    'Examples:',
    '  status = \'Todo\'',
    '  SELECT id,title,due WHERE status = \'Todo\'',
    '  SELECT id,title WHERE has_parent = true format=compact',
  ];

  return lines.join('\n');
}
