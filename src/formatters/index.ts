/**
 * Formatters Module
 *
 * Token-efficient output formatting for DartQL results.
 */

export {
  // Table Formatter
  formatTasks,
  formatAsTable,
  formatAsCompact,
  formatAsCSV,
  formatAsIds,
  abbreviateId,
  truncate,
  formatPriority,
  formatAssignee,
  formatDate,
  formatTags,
  formatSize,
  formatCount,
  getRelationshipCounts,
  parseFieldList,
  ESSENTIAL_FIELDS,
  FIELD_DEFINITIONS,
  type OutputFormat,
  type FieldConfig,
  type FormatOptions,
  type RelationshipCounts,
} from './tableFormatter.js';

export {
  // Field Selector
  parseFieldList as parseFields,
  parseFormat,
  parseQuery,
  validateFields,
  getFieldsHelp,
  AVAILABLE_FIELDS,
  type FieldSelection,
  type ParsedQuery,
} from './fieldSelector.js';

export {
  // Relationship Expander
  expandRelationships,
  collectIdsToExpand,
  formatExpandedRelationship,
  formatExpandedAsNested,
  getTotalRelationshipCount,
  hasRelationships,
  type RelatedTaskSummary,
  type ExpandedTask,
  type RelationshipType,
  type ExpandOptions,
} from './relationshipExpander.js';
