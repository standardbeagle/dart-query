/**
 * Tests for Field Selector
 */

import { describe, it, expect } from 'vitest';
import {
  parseFieldList,
  parseFormat,
  parseQuery,
  validateFields,
  getFieldsHelp,
  AVAILABLE_FIELDS,
} from './fieldSelector.js';
import { ESSENTIAL_FIELDS } from './tableFormatter.js';

// ============================================================================
// parseFieldList Tests
// ============================================================================

describe('parseFieldList', () => {
  it('should parse simple field list', () => {
    const result = parseFieldList('id,title,status');
    expect(result.fields).toEqual(['id', 'title', 'status']);
    expect(result.expand).toEqual([]);
    expect(result.explicit).toBe(true);
  });

  it('should handle spaces around commas', () => {
    const result = parseFieldList('id , title , status');
    expect(result.fields).toEqual(['id', 'title', 'status']);
  });

  it('should normalize to lowercase', () => {
    const result = parseFieldList('ID,Title,STATUS');
    expect(result.fields).toEqual(['id', 'title', 'status']);
  });

  it('should parse count fields with # prefix', () => {
    const result = parseFieldList('id,#subtasks,#blockers');
    expect(result.fields).toEqual(['id', '#subtasks', '#blockers']);
  });

  it('should parse expansion fields with + prefix', () => {
    const result = parseFieldList('id,title,+blockers,+subtasks');
    expect(result.fields).toContain('#blockers');
    expect(result.fields).toContain('#subtasks');
    expect(result.expand).toContain('blockers');
    expect(result.expand).toContain('subtasks');
  });

  it('should handle wildcard *', () => {
    const result = parseFieldList('*');
    expect(result.fields.length).toBeGreaterThan(10);
    expect(result.fields).toContain('id');
    expect(result.fields).toContain('title');
    expect(result.fields).toContain('status');
  });

  it('should use defaults for empty/invalid input', () => {
    const result = parseFieldList('');
    expect(result.fields).toEqual(ESSENTIAL_FIELDS);
    expect(result.explicit).toBe(false);
  });

  it('should ignore unknown fields', () => {
    const result = parseFieldList('id,unknownfield,title');
    expect(result.fields).toEqual(['id', 'title']);
  });

  it('should handle only unknown fields by falling back to defaults', () => {
    const result = parseFieldList('foo,bar,baz');
    expect(result.fields).toEqual(ESSENTIAL_FIELDS);
    expect(result.explicit).toBe(false);
  });
});

// ============================================================================
// parseFormat Tests
// ============================================================================

describe('parseFormat', () => {
  it('should parse valid formats', () => {
    expect(parseFormat('table')).toBe('table');
    expect(parseFormat('compact')).toBe('compact');
    expect(parseFormat('csv')).toBe('csv');
    expect(parseFormat('json')).toBe('json');
    expect(parseFormat('ids')).toBe('ids');
  });

  it('should be case-insensitive', () => {
    expect(parseFormat('TABLE')).toBe('table');
    expect(parseFormat('Compact')).toBe('compact');
  });

  it('should default to table for invalid formats', () => {
    expect(parseFormat('invalid')).toBe('table');
    expect(parseFormat('')).toBe('table');
    expect(parseFormat(undefined)).toBe('table');
  });
});

// ============================================================================
// parseQuery Tests
// ============================================================================

describe('parseQuery', () => {
  it('should parse simple WHERE clause', () => {
    const result = parseQuery("status = 'Todo'");
    expect(result.whereClause).toBe("status = 'Todo'");
    expect(result.selection.fields).toEqual(ESSENTIAL_FIELDS);
    expect(result.selection.explicit).toBe(false);
  });

  it('should parse SELECT with WHERE', () => {
    const result = parseQuery("SELECT id,title,due WHERE status = 'Todo'");
    expect(result.selection.fields).toEqual(['id', 'title', 'due']);
    expect(result.selection.explicit).toBe(true);
    expect(result.whereClause).toBe("status = 'Todo'");
  });

  it('should parse SELECT without WHERE', () => {
    const result = parseQuery('SELECT id,title,status');
    expect(result.selection.fields).toEqual(['id', 'title', 'status']);
    expect(result.whereClause).toBe('');
  });

  it('should parse format option at end', () => {
    const result = parseQuery("status = 'Todo' format=compact");
    expect(result.selection.format).toBe('compact');
    expect(result.whereClause).toBe("status = 'Todo'");
  });

  it('should parse SELECT with format option', () => {
    const result = parseQuery("SELECT id,title WHERE status = 'Todo' format=csv");
    expect(result.selection.fields).toEqual(['id', 'title']);
    expect(result.selection.format).toBe('csv');
    expect(result.whereClause).toBe("status = 'Todo'");
  });

  it('should handle empty query', () => {
    const result = parseQuery('');
    expect(result.selection.fields).toEqual(ESSENTIAL_FIELDS);
    expect(result.whereClause).toBe('');
  });

  it('should be case-insensitive for SELECT and WHERE keywords', () => {
    const result = parseQuery("select id,title where status = 'Todo'");
    expect(result.selection.fields).toEqual(['id', 'title']);
    expect(result.whereClause).toBe("status = 'Todo'");
  });

  it('should parse expansion in SELECT', () => {
    const result = parseQuery('SELECT id,title,+blockers WHERE has_parent = true');
    expect(result.selection.fields).toContain('id');
    expect(result.selection.fields).toContain('title');
    expect(result.selection.fields).toContain('#blockers');
    expect(result.selection.expand).toContain('blockers');
  });
});

// ============================================================================
// validateFields Tests
// ============================================================================

describe('validateFields', () => {
  it('should validate known fields', () => {
    const result = validateFields(['id', 'title', 'status']);
    expect(result.valid).toEqual(['id', 'title', 'status']);
    expect(result.unknown).toEqual([]);
  });

  it('should identify unknown fields', () => {
    const result = validateFields(['id', 'foo', 'title', 'bar']);
    expect(result.valid).toEqual(['id', 'title']);
    expect(result.unknown).toEqual(['foo', 'bar']);
  });

  it('should validate count fields', () => {
    const result = validateFields(['#subtasks', '#blockers']);
    expect(result.valid).toEqual(['#subtasks', '#blockers']);
  });

  it('should validate expansion fields', () => {
    const result = validateFields(['+blockers', '+subtasks']);
    expect(result.valid).toContain('+blockers');
    expect(result.valid).toContain('+subtasks');
  });

  it('should validate wildcard', () => {
    const result = validateFields(['*']);
    expect(result.valid).toContain('*');
  });
});

// ============================================================================
// getFieldsHelp Tests
// ============================================================================

describe('getFieldsHelp', () => {
  it('should return help text', () => {
    const help = getFieldsHelp();
    expect(help).toContain('Available fields');
    expect(help).toContain('Core fields');
    expect(help).toContain('Relationship counts');
    expect(help).toContain('Expansion');
    expect(help).toContain('Output formats');
    expect(help).toContain('Examples');
  });

  it('should document all essential fields', () => {
    const help = getFieldsHelp();
    expect(help).toContain('id');
    expect(help).toContain('title');
    expect(help).toContain('status');
    expect(help).toContain('pri');
  });
});

// ============================================================================
// AVAILABLE_FIELDS Tests
// ============================================================================

describe('AVAILABLE_FIELDS', () => {
  it('should contain core fields', () => {
    expect(AVAILABLE_FIELDS).toContain('id');
    expect(AVAILABLE_FIELDS).toContain('title');
    expect(AVAILABLE_FIELDS).toContain('status');
    expect(AVAILABLE_FIELDS).toContain('pri');
  });

  it('should contain relationship count fields', () => {
    expect(AVAILABLE_FIELDS).toContain('#subtasks');
    expect(AVAILABLE_FIELDS).toContain('#blockers');
  });
});
