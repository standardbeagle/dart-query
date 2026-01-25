/**
 * CSV Parser for task imports with flexible column mapping and normalization
 *
 * Features:
 * - Accepts CSV data as string or file path
 * - Flexible column name matching with aliases
 * - Case-insensitive column normalization
 * - Validates headers and required columns
 * - Reports unknown columns as warnings
 * - Handles quoted fields and commas in values (via papaparse)
 */

import Papa from 'papaparse';
import { readFileSync } from 'fs';
import type { DartConfig } from '../types/index.js';

// ============================================================================
// Types
// ============================================================================

export interface CSVParseResult {
  data: Array<Record<string, string>>;
  warnings: string[];
  errors: string[];
}

export interface ValidationError {
  row_number: number;
  field: string;
  error: string;
  value: unknown;
}

export interface ResolveReferencesResult {
  resolved: Record<string, unknown>;
  errors: ValidationError[];
  suggestions: Array<{ field: string; input: string; suggestions: string[] }>;
}

export interface CSVParseOptions {
  csv_data?: string;
  csv_file_path?: string;
  column_mapping?: Record<string, string>;
}

// ============================================================================
// Column Aliases Configuration
// ============================================================================

/**
 * Column aliases for flexible mapping
 * Each key is the canonical field name, value is array of alternative names
 * All matching is case-insensitive
 */
const COLUMN_ALIASES: Record<string, string[]> = {
  title: ['title', 'task name', 'task', 'name', 'summary'],
  description: ['description', 'desc', 'details', 'notes', 'body'],
  assignee: ['assignee', 'assigned to', 'owner', 'responsible'],
  status: ['status', 'state', 'stage'],
  priority: ['priority', 'pri', 'importance'],
  size: ['size', 'estimate', 'points', 'story points'],
  tags: ['tags', 'labels', 'categories'],
  dartboard: ['dartboard', 'board', 'project'],
  due_at: ['due_at', 'due date', 'due', 'deadline'],
  start_at: ['start_at', 'start date', 'start', 'begins'],
  parent_task: ['parent_task', 'parent', 'parent_id'],
  // Relationship fields - all store comma-separated dart_ids
  subtask_ids: ['subtask_ids', 'subtasks', 'child_tasks'],
  blocker_ids: ['blocker_ids', 'blockers', 'blocked_by'],
  blocking_ids: ['blocking_ids', 'blocking', 'blocks'],
  duplicate_ids: ['duplicate_ids', 'duplicates'],
  related_ids: ['related_ids', 'related'],
};

/**
 * Known valid column names (normalized)
 */
const VALID_COLUMNS = Object.keys(COLUMN_ALIASES);

/**
 * Required columns that must be present
 */
const REQUIRED_COLUMNS = ['title'];

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Parse CSV data with flexible column mapping and validation
 *
 * @param options - CSV data source and optional column mapping
 * @returns Parsed data with normalized column names, warnings, and errors
 *
 * @example
 * ```typescript
 * const result = parseCSV({
 *   csv_data: 'Title,Assignee\nFix bug,john@example.com'
 * });
 * // result.data = [{ title: 'Fix bug', assignee: 'john@example.com' }]
 * ```
 */
export function parseCSV(options: CSVParseOptions): CSVParseResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Input validation
  if (!options.csv_data && !options.csv_file_path) {
    errors.push('Either csv_data or csv_file_path must be provided');
    return { data: [], warnings, errors };
  }

  if (options.csv_data && options.csv_file_path) {
    warnings.push('Both csv_data and csv_file_path provided; using csv_data');
  }

  // Get CSV content
  let csvContent: string;
  try {
    if (options.csv_data) {
      csvContent = options.csv_data;
    } else {
      csvContent = readFileSync(options.csv_file_path!, 'utf-8');
    }
  } catch (err) {
    errors.push(`Failed to read CSV file: ${err instanceof Error ? err.message : String(err)}`);
    return { data: [], warnings, errors };
  }

  // Defensive check for empty content
  if (!csvContent || csvContent.trim().length === 0) {
    errors.push('CSV content is empty');
    return { data: [], warnings, errors };
  }

  // Parse CSV with papaparse
  const parseResult = Papa.parse<Record<string, string>>(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header: string) => header.trim(), // Trim whitespace from headers
    delimiter: '', // Auto-detect delimiter (empty string means auto-detect)
  });

  // Check for parse errors
  if (parseResult.errors.length > 0) {
    for (const error of parseResult.errors) {
      // Single-column CSVs trigger "Unable to auto-detect delimiter" warning
      // This is not a real error, just a limitation of auto-detection
      if (error.message && error.message.includes('Unable to auto-detect delimiting character')) {
        // Ignore this warning - papaparse still parses single-column CSVs correctly
        continue;
      }
      errors.push(`CSV parse error at row ${error.row ?? 'unknown'}: ${error.message}`);
    }
  }

  // Validate that we have headers
  if (!parseResult.meta.fields || parseResult.meta.fields.length === 0) {
    errors.push('CSV must have a header row with column names');
    return { data: [], warnings, errors };
  }

  // Normalize columns
  const normalizeResult = normalizeColumns(
    parseResult.data,
    parseResult.meta.fields,
    options.column_mapping
  );

  warnings.push(...normalizeResult.warnings);
  errors.push(...normalizeResult.errors);

  return {
    data: normalizeResult.data,
    warnings,
    errors,
  };
}

/**
 * Normalize column names using aliases and custom mappings
 *
 * @param data - Parsed CSV data
 * @param originalHeaders - Original header names from CSV
 * @param customMapping - Optional custom column mapping
 * @returns Normalized data with warnings and errors
 */
export function normalizeColumns(
  data: Array<Record<string, string>>,
  originalHeaders: string[],
  customMapping?: Record<string, string>
): CSVParseResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Build mapping from original header to normalized field name
  const headerMapping = new Map<string, string>();
  const unmappedHeaders: string[] = [];

  for (const header of originalHeaders) {
    const trimmedHeader = header.trim();
    if (!trimmedHeader) {
      warnings.push('Found empty column header; skipping');
      continue;
    }

    let mappedField: string | null = null;

    // 1. Check custom mapping first (case-sensitive)
    if (customMapping && customMapping[trimmedHeader]) {
      mappedField = customMapping[trimmedHeader];

      // Validate that custom mapping target is a valid field
      if (!VALID_COLUMNS.includes(mappedField)) {
        warnings.push(`Custom mapping for "${trimmedHeader}" maps to unknown field "${mappedField}"; using anyway`);
      }

      headerMapping.set(trimmedHeader, mappedField);
      continue;
    }

    // 2. Check custom mapping case-insensitive
    if (customMapping) {
      const lowerHeader = trimmedHeader.toLowerCase();
      for (const [key, value] of Object.entries(customMapping)) {
        if (key.toLowerCase() === lowerHeader) {
          mappedField = value;

          // Validate that custom mapping target is a valid field
          if (!VALID_COLUMNS.includes(mappedField)) {
            warnings.push(`Custom mapping for "${trimmedHeader}" maps to unknown field "${mappedField}"; using anyway`);
          }

          headerMapping.set(trimmedHeader, mappedField);
          break;
        }
      }
      if (mappedField) continue;
    }

    // 3. Check built-in aliases (case-insensitive)
    const lowerHeader = trimmedHeader.toLowerCase();
    for (const [canonicalName, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (aliases.some(alias => alias.toLowerCase() === lowerHeader)) {
        mappedField = canonicalName;
        headerMapping.set(trimmedHeader, mappedField);
        break;
      }
    }

    if (!mappedField) {
      unmappedHeaders.push(trimmedHeader);
    }
  }

  // Report unknown columns as warnings
  if (unmappedHeaders.length > 0) {
    warnings.push(`Unknown columns (will be ignored): ${unmappedHeaders.join(', ')}`);
    warnings.push(`Valid columns: ${VALID_COLUMNS.join(', ')}`);
  }

  // Validate required columns
  const mappedFields = Array.from(headerMapping.values());
  for (const required of REQUIRED_COLUMNS) {
    if (!mappedFields.includes(required)) {
      errors.push(`Required column '${required}' is missing`);
      errors.push(`Hint: '${required}' can be named: ${COLUMN_ALIASES[required].join(', ')}`);
    }
  }

  // If validation errors, return empty data
  if (errors.length > 0) {
    return { data: [], warnings, errors };
  }

  // Transform data with normalized column names
  const normalizedData: Array<Record<string, string>> = [];
  let rowNumber = 1; // Start at 1 (header is row 0)

  for (const row of data) {
    rowNumber++;
    const normalizedRow: Record<string, string> = {};

    for (const [originalHeader, normalizedField] of headerMapping.entries()) {
      const value = row[originalHeader];
      // Only include non-empty values
      if (value !== undefined && value !== null && value.trim() !== '') {
        normalizedRow[normalizedField] = value.trim();
      }
    }

    // Validate required fields have values
    for (const required of REQUIRED_COLUMNS) {
      if (mappedFields.includes(required)) {
        if (!normalizedRow[required] || normalizedRow[required].trim() === '') {
          warnings.push(`Row ${rowNumber}: Required field '${required}' is empty`);
        }
      }
    }

    // Only include rows that have at least one field
    if (Object.keys(normalizedRow).length > 0) {
      normalizedData.push(normalizedRow);
    }
  }

  return {
    data: normalizedData,
    warnings,
    errors,
  };
}

// ============================================================================
// Relationship Field Helpers
// ============================================================================

/**
 * Fields that contain comma-separated dart_id arrays
 */
const RELATIONSHIP_ARRAY_FIELDS = [
  'subtask_ids',
  'blocker_ids',
  'blocking_ids',
  'duplicate_ids',
  'related_ids',
];

/**
 * Validates that a dart_id is in a valid format.
 * dart_ids must be non-empty strings (format-only, not existence check).
 *
 * @param id - The dart_id to validate
 * @returns true if the dart_id format is valid
 */
export function isValidDartIdFormat(id: string): boolean {
  return typeof id === 'string' && id.trim().length > 0;
}

/**
 * Parse a comma-separated string of dart_ids into an array.
 * Validates each dart_id format and returns errors for invalid ones.
 *
 * @param value - Comma-separated string of dart_ids (e.g., "task-id1,task-id2,task-id3")
 * @param fieldName - Name of the field for error reporting
 * @param rowNumber - Row number for error reporting
 * @returns Object with parsed array and any validation errors
 */
export function parseIdList(
  value: string,
  fieldName: string,
  rowNumber: number
): { ids: string[]; errors: Array<{ row_number: number; field: string; error: string; value: string }> } {
  const errors: Array<{ row_number: number; field: string; error: string; value: string }> = [];

  // Handle empty or whitespace-only value
  if (!value || value.trim().length === 0) {
    return { ids: [], errors };
  }

  // Split by comma and trim each ID
  const rawIds = value.split(',').map(id => id.trim()).filter(id => id.length > 0);

  // If only commas with no actual IDs
  if (rawIds.length === 0) {
    return { ids: [], errors };
  }

  // Validate each dart_id format
  const validIds: string[] = [];
  const invalidIds: string[] = [];

  for (const id of rawIds) {
    if (isValidDartIdFormat(id)) {
      validIds.push(id);
    } else {
      invalidIds.push(id === '' ? '(empty string)' : id);
    }
  }

  // Report invalid IDs
  if (invalidIds.length > 0) {
    errors.push({
      row_number: rowNumber,
      field: fieldName,
      error: `Invalid dart_id format: ${invalidIds.join(', ')}. Each ID must be a non-empty string.`,
      value: value,
    });
  }

  return { ids: validIds, errors };
}

/**
 * Check if a field is a relationship array field
 */
export function isRelationshipArrayField(fieldName: string): boolean {
  return RELATIONSHIP_ARRAY_FIELDS.includes(fieldName);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get list of supported column names and their aliases
 */
export function getSupportedColumns(): Record<string, string[]> {
  return { ...COLUMN_ALIASES };
}

/**
 * Check if a column name is valid (case-insensitive)
 */
export function isValidColumn(columnName: string): boolean {
  const lower = columnName.toLowerCase();
  return VALID_COLUMNS.some(valid =>
    COLUMN_ALIASES[valid].some(alias => alias.toLowerCase() === lower)
  );
}

// ============================================================================
// Reference Resolution & Validation
// ============================================================================

/**
 * Levenshtein distance algorithm for fuzzy matching (borrowed from DartQL parser)
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Find closest matches using fuzzy matching
 */
function findClosestMatches(input: string, candidates: string[], threshold: number = 2): string[] {
  const matches: Array<{ value: string; distance: number }> = [];

  for (const candidate of candidates) {
    const distance = levenshteinDistance(input.toLowerCase(), candidate.toLowerCase());
    if (distance <= threshold) {
      matches.push({ value: candidate, distance });
    }
  }

  // Sort by distance (closest first)
  matches.sort((a, b) => a.distance - b.distance);

  return matches.slice(0, 3).map(m => m.value); // Return top 3 matches
}

/**
 * Resolve human-readable references to dart_ids using config cache
 *
 * Converts:
 * - Dartboard names → dart_ids
 * - Assignee emails/names → dart_ids
 * - Tag names → dart_ids
 *
 * @param row - CSV row data (normalized column names)
 * @param config - DartConfig from config cache
 * @param rowNumber - Row number for error reporting
 * @returns ResolveReferencesResult with resolved values, errors, and suggestions
 */
export function resolveReferences(
  row: Record<string, string>,
  config: DartConfig,
  rowNumber: number
): ResolveReferencesResult {
  const resolved: Record<string, unknown> = { ...row };
  const errors: ValidationError[] = [];
  const suggestions: Array<{ field: string; input: string; suggestions: string[] }> = [];

  // Resolve dartboard (name → dart_id)
  if (row.dartboard) {
    const dartboardInput = row.dartboard.trim();

    // Edge case: whitespace-only string
    if (dartboardInput.length === 0) {
      errors.push({
        row_number: rowNumber,
        field: 'dartboard',
        error: 'Dartboard value is empty or whitespace-only',
        value: row.dartboard,
      });
    } else {
      const dartboard = config.dartboards.find(d => {
        if (typeof d === 'string') {
          return d.toLowerCase() === dartboardInput.toLowerCase();
        }
        return d.name?.toLowerCase() === dartboardInput.toLowerCase() ||
               d.dart_id?.toLowerCase() === dartboardInput.toLowerCase();
      });

      if (dartboard) {
        resolved.dartboard = typeof dartboard === 'string' ? dartboard : dartboard.dart_id;
      } else {
        // Try fuzzy matching on names
        const dartboardNames = config.dartboards.map(d => typeof d === 'string' ? d : d.name);
        const matches = findClosestMatches(dartboardInput, dartboardNames);

        errors.push({
          row_number: rowNumber,
          field: 'dartboard',
          error: `Dartboard '${dartboardInput}' not found in workspace`,
          value: dartboardInput,
        });

        if (matches.length > 0) {
          suggestions.push({
            field: 'dartboard',
            input: dartboardInput,
            suggestions: matches,
          });
        }
      }
    }
  }

  // Resolve status (name → dart_id)
  if (row.status) {
    const statusInput = row.status.trim();
    const status = config.statuses.find(s => {
      if (typeof s === 'string') {
        return s.toLowerCase() === statusInput.toLowerCase();
      }
      return s.name?.toLowerCase() === statusInput.toLowerCase() ||
             s.dart_id?.toLowerCase() === statusInput.toLowerCase();
    });

    if (status) {
      resolved.status = typeof status === 'string' ? status : status.dart_id;
    } else {
      // Try fuzzy matching on names
      const statusNames = config.statuses.map(s => typeof s === 'string' ? s : s.name);
      const matches = findClosestMatches(statusInput, statusNames);

      errors.push({
        row_number: rowNumber,
        field: 'status',
        error: `Status '${statusInput}' not found in workspace`,
        value: statusInput,
      });

      if (matches.length > 0) {
        suggestions.push({
          field: 'status',
          input: statusInput,
          suggestions: matches,
        });
      }
    }
  }

  // Resolve assignee (email/name → dart_id or email)
  if (row.assignee) {
    const assigneeInput = row.assignee.trim();
    const assignee = config.assignees.find(
      a => a.email?.toLowerCase() === assigneeInput.toLowerCase() ||
           a.name?.toLowerCase() === assigneeInput.toLowerCase() ||
           a.dart_id?.toLowerCase() === assigneeInput.toLowerCase()
    );

    if (assignee) {
      // Return dart_id if available, otherwise email or name
      resolved.assignee = assignee.dart_id || assignee.email || assignee.name;
    } else {
      // Try fuzzy matching on both email and name
      const assigneeEmails = config.assignees.filter(a => a.email).map(a => a.email!);
      const assigneeNames = config.assignees.map(a => a.name);
      const emailMatches = findClosestMatches(assigneeInput, assigneeEmails);
      const nameMatches = findClosestMatches(assigneeInput, assigneeNames);
      const allMatches = [...new Set([...emailMatches, ...nameMatches])];

      errors.push({
        row_number: rowNumber,
        field: 'assignee',
        error: `Assignee '${assigneeInput}' not found in workspace`,
        value: assigneeInput,
      });

      if (allMatches.length > 0) {
        suggestions.push({
          field: 'assignee',
          input: assigneeInput,
          suggestions: allMatches,
        });
      }
    }
  }

  // Resolve tags (comma-separated names → array of dart_ids)
  if (row.tags) {
    const tagsInput = row.tags.trim();

    // Edge case: whitespace-only or just commas
    if (tagsInput.length === 0) {
      errors.push({
        row_number: rowNumber,
        field: 'tags',
        error: 'Tags value is empty or whitespace-only',
        value: row.tags,
      });
    } else {
      const tagInputNames = tagsInput.split(',').map(t => t.trim()).filter(t => t.length > 0);

      // Edge case: only commas, no actual tag names
      if (tagInputNames.length === 0) {
        errors.push({
          row_number: rowNumber,
          field: 'tags',
          error: 'Tags value contains only commas, no tag names',
          value: row.tags,
        });
      } else {
        const resolvedTags: string[] = [];
        let hasTagErrors = false;

        for (const tagInput of tagInputNames) {
          const tag = config.tags.find(t => {
            if (typeof t === 'string') {
              return t.toLowerCase() === tagInput.toLowerCase();
            }
            return t.name?.toLowerCase() === tagInput.toLowerCase() ||
                   t.dart_id?.toLowerCase() === tagInput.toLowerCase();
          });

          if (tag) {
            resolvedTags.push(typeof tag === 'string' ? tag : tag.dart_id);
          } else {
            // Try fuzzy matching on names
            const tagNames = config.tags.map(t => typeof t === 'string' ? t : t.name);
            const matches = findClosestMatches(tagInput, tagNames);

            errors.push({
              row_number: rowNumber,
              field: 'tags',
              error: `Tag '${tagInput}' not found in workspace`,
              value: tagInput,
            });

            if (matches.length > 0) {
              suggestions.push({
                field: 'tags',
                input: tagInput,
                suggestions: matches,
              });
            }

            hasTagErrors = true;
          }
        }

        // Only set resolved tags if all tags were found
        if (!hasTagErrors && resolvedTags.length > 0) {
          resolved.tags = resolvedTags;
        } else if (hasTagErrors) {
          // Remove original string value if resolution failed
          delete resolved.tags;
        }
      }
    }
  }

  // Parse relationship array fields (comma-separated dart_ids)
  // These don't require workspace lookup - just format validation
  for (const field of RELATIONSHIP_ARRAY_FIELDS) {
    if (row[field]) {
      const parseResult = parseIdList(row[field], field, rowNumber);

      // Add any validation errors
      for (const err of parseResult.errors) {
        errors.push({
          row_number: err.row_number,
          field: err.field,
          error: err.error,
          value: err.value,
        });
      }

      // Set parsed array if we have valid IDs (even if some were invalid)
      if (parseResult.ids.length > 0) {
        resolved[field] = parseResult.ids;
      } else {
        // Remove original string value if no valid IDs
        delete resolved[field];
      }
    }
  }

  return { resolved, errors, suggestions };
}

/**
 * Validate a CSV row for required fields, data types, and references
 *
 * Checks:
 * - Required fields (title)
 * - Valid references (dartboard, assignees, tags exist)
 * - Data types (priority 1-5, size 1-5, dates ISO8601)
 *
 * @param row - CSV row data (normalized column names, BEFORE reference resolution)
 * @param config - DartConfig from config cache
 * @param rowNumber - Row number for error reporting
 * @returns Array of ValidationError objects
 */
export function validateRow(
  row: Record<string, string>,
  config: DartConfig,
  rowNumber: number
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Validate required field: title
  if (!row.title || row.title.trim().length === 0) {
    errors.push({
      row_number: rowNumber,
      field: 'title',
      error: 'Title is required',
      value: row.title || '',
    });
  }

  // Validate title length (max 500 chars per API spec)
  if (row.title && row.title.length > 500) {
    errors.push({
      row_number: rowNumber,
      field: 'title',
      error: 'Title exceeds maximum length of 500 characters',
      value: row.title,
    });
  }

  // Validate priority (must match config - by label or value)
  if (row.priority) {
    const priorityInput = row.priority.trim().toLowerCase();
    const validPriority = config.priorities.find(
      p => p.label.toLowerCase() === priorityInput ||
           p.value.toString() === row.priority.trim()
    );
    if (!validPriority) {
      const availablePriorities = config.priorities.map(p => `${p.label} (${p.value})`).join(', ');
      errors.push({
        row_number: rowNumber,
        field: 'priority',
        error: `Invalid priority: "${row.priority}". Available priorities: ${availablePriorities}`,
        value: row.priority,
      });
    }
  }

  // Validate size (must match config - by label or value)
  if (row.size) {
    const sizeInput = row.size.trim().toLowerCase();
    const validSize = config.sizes.find(
      s => s.label.toLowerCase() === sizeInput ||
           s.value.toString() === row.size.trim()
    );
    if (!validSize) {
      const availableSizes = config.sizes.slice(0, 10).map(s => `${s.label} (${s.value})`).join(', ') +
        (config.sizes.length > 10 ? `, ... (${config.sizes.length - 10} more)` : '');
      errors.push({
        row_number: rowNumber,
        field: 'size',
        error: `Invalid size: "${row.size}". Available sizes: ${availableSizes}`,
        value: row.size,
      });
    }
  }

  // Validate due_at (ISO8601 date format)
  if (row.due_at) {
    if (!isValidISO8601Date(row.due_at)) {
      errors.push({
        row_number: rowNumber,
        field: 'due_at',
        error: 'Due date must be in ISO8601 format (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ)',
        value: row.due_at,
      });
    }
  }

  // Validate start_at (ISO8601 date format)
  if (row.start_at) {
    if (!isValidISO8601Date(row.start_at)) {
      errors.push({
        row_number: rowNumber,
        field: 'start_at',
        error: 'Start date must be in ISO8601 format (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ)',
        value: row.start_at,
      });
    }
  }

  // Validate dartboard exists (reference validation)
  if (row.dartboard) {
    const dartboardInput = row.dartboard.trim();
    const dartboard = config.dartboards.find(d => {
      if (typeof d === 'string') {
        return d.toLowerCase() === dartboardInput.toLowerCase();
      }
      return d.name.toLowerCase() === dartboardInput.toLowerCase() ||
             d.dart_id.toLowerCase() === dartboardInput.toLowerCase();
    });

    if (!dartboard) {
      errors.push({
        row_number: rowNumber,
        field: 'dartboard',
        error: `Dartboard '${dartboardInput}' not found in workspace`,
        value: dartboardInput,
      });
    }
  }

  // Validate status exists (reference validation)
  if (row.status) {
    const statusInput = row.status.trim();
    const status = config.statuses.find(s => {
      if (typeof s === 'string') {
        return s.toLowerCase() === statusInput.toLowerCase();
      }
      return s.name?.toLowerCase() === statusInput.toLowerCase() ||
             s.dart_id?.toLowerCase() === statusInput.toLowerCase();
    });

    if (!status) {
      errors.push({
        row_number: rowNumber,
        field: 'status',
        error: `Status '${statusInput}' not found in workspace`,
        value: statusInput,
      });
    }
  }

  // Validate assignee exists (reference validation)
  if (row.assignee) {
    const assigneeInput = row.assignee.trim();
    const assignee = config.assignees.find(
      a => a.email?.toLowerCase() === assigneeInput.toLowerCase() ||
           a.name?.toLowerCase() === assigneeInput.toLowerCase() ||
           a.dart_id?.toLowerCase() === assigneeInput.toLowerCase()
    );

    if (!assignee) {
      errors.push({
        row_number: rowNumber,
        field: 'assignee',
        error: `Assignee '${assigneeInput}' not found in workspace`,
        value: assigneeInput,
      });
    }
  }

  // Validate tags exist (reference validation)
  if (row.tags) {
    const tagsInput = row.tags.trim();
    const tagInputNames = tagsInput.split(',').map(t => t.trim()).filter(t => t.length > 0);

    for (const tagInput of tagInputNames) {
      const tag = config.tags.find(t => {
        if (typeof t === 'string') {
          return t.toLowerCase() === tagInput.toLowerCase();
        }
        return t.name.toLowerCase() === tagInput.toLowerCase() ||
               t.dart_id.toLowerCase() === tagInput.toLowerCase();
      });

      if (!tag) {
        errors.push({
          row_number: rowNumber,
          field: 'tags',
          error: `Tag '${tagInput}' not found in workspace`,
          value: tagInput,
        });
      }
    }
  }

  // Validate relationship array fields (format-only, not existence check)
  for (const field of RELATIONSHIP_ARRAY_FIELDS) {
    if (row[field]) {
      const parseResult = parseIdList(row[field], field, rowNumber);

      // Add any validation errors (invalid dart_id format)
      for (const err of parseResult.errors) {
        errors.push({
          row_number: err.row_number,
          field: err.field,
          error: err.error,
          value: err.value,
        });
      }
    }
  }

  return errors;
}

/**
 * Validate ISO8601 date format
 * Accepts: YYYY-MM-DD, YYYY-MM-DDTHH:MM:SS, YYYY-MM-DDTHH:MM:SSZ, YYYY-MM-DDTHH:MM:SS+00:00
 */
function isValidISO8601Date(dateString: string): boolean {
  // ISO8601 regex pattern
  const iso8601Pattern = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})?)?$/;

  if (!iso8601Pattern.test(dateString)) {
    return false;
  }

  // Check if date is valid using Date constructor
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    return false;
  }

  // JavaScript Date constructor is lenient (e.g., 2023-02-29 becomes 2023-03-01)
  // We need to verify the date wasn't auto-corrected
  // Extract date components from the input string
  const [datePart] = dateString.split('T');
  const [year, month, day] = datePart.split('-').map(Number);

  // Check that the parsed date matches the input values
  if (date.getUTCFullYear() !== year) return false;
  if (date.getUTCMonth() + 1 !== month) return false; // getUTCMonth() is 0-indexed
  if (date.getUTCDate() !== day) return false;

  return true;
}
