/**
 * Unit tests for CSV parser
 */

import { describe, test, expect } from 'vitest';
import { parseCSV, normalizeColumns, getSupportedColumns, isValidColumn, resolveReferences, validateRow } from './csv';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import type { DartConfig } from '../types/index.js';

// ============================================================================
// Test Helpers
// ============================================================================

const TEST_DIR = '/tmp/csv-parser-tests';

function setupTestDir() {
  try {
    mkdirSync(TEST_DIR, { recursive: true });
  } catch {
    // Directory may already exist
  }
}

function cleanupTestDir() {
  try {
    rmSync(TEST_DIR, { recursive: true, force: true });
  } catch {
    // Directory may not exist
  }
}

function createTestFile(filename: string, content: string): string {
  setupTestDir();
  const filePath = join(TEST_DIR, filename);
  writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

// Mock DartConfig for testing
function createMockConfig(): DartConfig {
  return {
    assignees: [
      { dart_id: 'user1', name: 'John Doe', email: 'john@example.com' },
      { dart_id: 'user2', name: 'Jane Smith', email: 'jane@example.com' },
      { dart_id: 'user3', name: 'Bob Wilson', email: 'bob@example.com' },
    ],
    dartboards: [
      { dart_id: 'board1', name: 'Engineering' },
      { dart_id: 'board2', name: 'Design' },
      { dart_id: 'board3', name: 'Marketing' },
    ],
    statuses: [
      { dart_id: 'status1', name: 'Todo' },
      { dart_id: 'status2', name: 'In Progress' },
      { dart_id: 'status3', name: 'Done' },
    ],
    tags: [
      { dart_id: 'tag1', name: 'urgent' },
      { dart_id: 'tag2', name: 'bug' },
      { dart_id: 'tag3', name: 'feature' },
    ],
    priorities: [
      { value: 1, label: 'Lowest' },
      { value: 2, label: 'Low' },
      { value: 3, label: 'Medium' },
      { value: 4, label: 'High' },
      { value: 5, label: 'Highest' },
    ],
    sizes: [
      { value: 1, label: 'XS' },
      { value: 2, label: 'S' },
      { value: 3, label: 'M' },
      { value: 4, label: 'L' },
      { value: 5, label: 'XL' },
    ],
    folders: [],
  };
}

// ============================================================================
// Basic Parsing Tests
// ============================================================================

describe('parseCSV - basic functionality', () => {
  test('parses simple CSV with standard headers', () => {
    const csv = 'Title,Description,Assignee\nFix bug,Bug in login,john@example.com\nAdd feature,New dashboard,jane@example.com';
    const result = parseCSV({ csv_data: csv });

    expect(result.errors).toEqual([]);
    expect(result.data).toHaveLength(2);
    expect(result.data[0]).toEqual({
      title: 'Fix bug',
      description: 'Bug in login',
      assignee: 'john@example.com',
    });
    expect(result.data[1]).toEqual({
      title: 'Add feature',
      description: 'New dashboard',
      assignee: 'jane@example.com',
    });
  });

  test('accepts csv_data as string', () => {
    const csv = 'Title\nTest task';
    const result = parseCSV({ csv_data: csv });

    expect(result.errors).toEqual([]);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].title).toBe('Test task');
  });

  test('accepts csv_file_path', () => {
    const csv = 'Title,Assignee\nFile task,user@example.com';
    const filePath = createTestFile('test.csv', csv);

    const result = parseCSV({ csv_file_path: filePath });

    expect(result.errors).toEqual([]);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toEqual({
      title: 'File task',
      assignee: 'user@example.com',
    });

    cleanupTestDir();
  });

  test('requires either csv_data or csv_file_path', () => {
    const result = parseCSV({});

    expect(result.errors).toContain('Either csv_data or csv_file_path must be provided');
    expect(result.data).toEqual([]);
  });

  test('warns when both csv_data and csv_file_path provided, uses csv_data', () => {
    const csv = 'Title\nData task';
    const filePath = createTestFile('ignored.csv', 'Title\nFile task');

    const result = parseCSV({ csv_data: csv, csv_file_path: filePath });

    expect(result.warnings).toContain('Both csv_data and csv_file_path provided; using csv_data');
    expect(result.data[0].title).toBe('Data task');

    cleanupTestDir();
  });
});

// ============================================================================
// Header Row Validation
// ============================================================================

describe('parseCSV - header validation', () => {
  test('validates first row must be headers', () => {
    const csv = 'Title\nTask 1\nTask 2';
    const result = parseCSV({ csv_data: csv });

    expect(result.errors).toEqual([]);
    expect(result.data).toHaveLength(2);
  });

  test('errors on missing header row', () => {
    // Empty string is falsy, so provide whitespace-only content instead
    const csv = '   ';
    const result = parseCSV({ csv_data: csv });

    expect(result.errors).toContain('CSV content is empty');
  });

  test('errors on whitespace-only content', () => {
    const csv = '   \n  \n   ';
    const result = parseCSV({ csv_data: csv });

    expect(result.errors).toContain('CSV content is empty');
  });
});

// ============================================================================
// Required Column Validation
// ============================================================================

describe('parseCSV - required column validation', () => {
  test('validates required column "title" exists', () => {
    const csv = 'Title,Assignee\nTask 1,user1';
    const result = parseCSV({ csv_data: csv });

    expect(result.errors).toEqual([]);
  });

  test('errors when required column "title" is missing', () => {
    const csv = 'Assignee,Priority\nuser1,3';
    const result = parseCSV({ csv_data: csv });

    expect(result.errors).toContain("Required column 'title' is missing");
    expect(result.data).toEqual([]);
  });

  test('provides hint for missing required column', () => {
    const csv = 'Description\nSome description';
    const result = parseCSV({ csv_data: csv });

    expect(result.errors.some(e => e.includes('title'))).toBe(true);
    expect(result.errors.some(e => e.includes('Hint:'))).toBe(true);
  });
});

// ============================================================================
// Column Normalization & Aliases
// ============================================================================

describe('normalizeColumns - case-insensitive matching', () => {
  test('normalizes column names case-insensitively', () => {
    const csv = 'TITLE,Assignee,PRIORITY\nTask 1,user1,3';
    const result = parseCSV({ csv_data: csv });

    expect(result.errors).toEqual([]);
    expect(result.data[0]).toEqual({
      title: 'Task 1',
      assignee: 'user1',
      priority: '3',
    });
  });

  test('handles mixed case column names', () => {
    const csv = 'TiTlE,DeSCriPTioN\nTask,Desc';
    const result = parseCSV({ csv_data: csv });

    expect(result.data[0]).toEqual({
      title: 'Task',
      description: 'Desc',
    });
  });
});

describe('normalizeColumns - column aliases', () => {
  test('maps "Task Name" to "title"', () => {
    const csv = 'Task Name,Assignee\nFix bug,user1';
    const result = parseCSV({ csv_data: csv });

    expect(result.data[0].title).toBe('Fix bug');
  });

  test('maps "Assigned To" to "assignee"', () => {
    const csv = 'Title,Assigned To\nTask,john@example.com';
    const result = parseCSV({ csv_data: csv });

    expect(result.data[0].assignee).toBe('john@example.com');
  });

  test('supports multiple title aliases', () => {
    const aliases = ['Title', 'Task Name', 'Task', 'Name', 'Summary'];

    for (const alias of aliases) {
      const csv = `${alias}\nTest task`;
      const result = parseCSV({ csv_data: csv });

      expect(result.errors).toEqual([]);
      expect(result.data[0].title).toBe('Test task');
    }
  });

  test('supports multiple assignee aliases', () => {
    const aliases = ['Assignee', 'Assigned To', 'Owner', 'Responsible'];

    for (const alias of aliases) {
      const csv = `Title,${alias}\nTask,user@example.com`;
      const result = parseCSV({ csv_data: csv });

      expect(result.data[0].assignee).toBe('user@example.com');
    }
  });

  test('supports description aliases', () => {
    const csv = 'Title,Desc\nTask,Description text';
    const result = parseCSV({ csv_data: csv });

    expect(result.data[0].description).toBe('Description text');
  });

  test('supports status aliases', () => {
    const csv = 'Title,State\nTask,In Progress';
    const result = parseCSV({ csv_data: csv });

    expect(result.data[0].status).toBe('In Progress');
  });

  test('supports priority aliases', () => {
    const csv = 'Title,Pri\nTask,3';
    const result = parseCSV({ csv_data: csv });

    expect(result.data[0].priority).toBe('3');
  });

  test('supports dartboard aliases', () => {
    const csv = 'Title,Board\nTask,Engineering';
    const result = parseCSV({ csv_data: csv });

    expect(result.data[0].dartboard).toBe('Engineering');
  });

  test('supports due_at aliases', () => {
    const csv = 'Title,Due Date\nTask,2026-02-01';
    const result = parseCSV({ csv_data: csv });

    expect(result.data[0].due_at).toBe('2026-02-01');
  });
});

// ============================================================================
// Unknown Column Warnings
// ============================================================================

describe('parseCSV - unknown column warnings', () => {
  test('warns about unknown columns', () => {
    const csv = 'Title,UnknownCol,AnotherUnknown\nTask,value1,value2';
    const result = parseCSV({ csv_data: csv });

    expect(result.warnings).toContain('Unknown columns (will be ignored): UnknownCol, AnotherUnknown');
  });

  test('provides list of valid columns in warning', () => {
    const csv = 'Title,InvalidColumn\nTask,value';
    const result = parseCSV({ csv_data: csv });

    expect(result.warnings.some(w => w.includes('Valid columns:'))).toBe(true);
  });

  test('ignores unknown columns in output', () => {
    const csv = 'Title,UnknownCol,Assignee\nTask,ignored,user1';
    const result = parseCSV({ csv_data: csv });

    expect(result.data[0]).toEqual({
      title: 'Task',
      assignee: 'user1',
    });
    expect(result.data[0]).not.toHaveProperty('UnknownCol');
  });

  test('warns about empty column headers', () => {
    const data = [{ 'Title': 'Task', '': 'value' }];
    const headers = ['Title', ''];
    const result = normalizeColumns(data, headers);

    expect(result.warnings.some(w => w.includes('empty column header'))).toBe(true);
  });
});

// ============================================================================
// Quoted Fields & Commas in Values
// ============================================================================

describe('parseCSV - handles quoted fields and commas', () => {
  test('handles commas in quoted values', () => {
    const csv = 'Title,Description\n"Fix bug","Bug in login, logout, and registration"';
    const result = parseCSV({ csv_data: csv });

    expect(result.data[0].description).toBe('Bug in login, logout, and registration');
  });

  test('handles quotes in quoted values', () => {
    const csv = 'Title,Description\n"Task","He said ""hello"""';
    const result = parseCSV({ csv_data: csv });

    expect(result.data[0].description).toBe('He said "hello"');
  });

  test('handles newlines in quoted values', () => {
    const csv = 'Title,Description\n"Task","Line 1\nLine 2\nLine 3"';
    const result = parseCSV({ csv_data: csv });

    expect(result.data[0].description).toBe('Line 1\nLine 2\nLine 3');
  });

  test('handles mixed quoted and unquoted fields', () => {
    const csv = 'Title,Assignee,Description\n"Task with, comma",user1,"Description, here"';
    const result = parseCSV({ csv_data: csv });

    expect(result.data[0]).toEqual({
      title: 'Task with, comma',
      assignee: 'user1',
      description: 'Description, here',
    });
  });

  test('handles complex real-world CSV', () => {
    const csv = `Title,Assignee,"Task Name",Priority
"Fix bug in ""login"" system","john@example.com, jane@example.com","Critical issue, needs immediate attention",5
"Add feature","user1","Simple task",2`;

    const result = parseCSV({ csv_data: csv });

    expect(result.errors).toEqual([]);
    expect(result.data).toHaveLength(2);
    // Both "Title" and "Task Name" map to 'title', but last one wins
    expect(result.data[0].title).toBe('Critical issue, needs immediate attention');
    expect(result.data[0].assignee).toBe('john@example.com, jane@example.com');
    expect(result.data[1].title).toBe('Simple task');
  });
});

// ============================================================================
// Empty Lines & Whitespace
// ============================================================================

describe('parseCSV - handles empty lines', () => {
  test('skips empty lines (skipEmptyLines: true)', () => {
    const csv = 'Title\nTask 1\n\n\nTask 2\n\nTask 3';
    const result = parseCSV({ csv_data: csv });

    expect(result.data).toHaveLength(3);
    expect(result.data.map(d => d.title)).toEqual(['Task 1', 'Task 2', 'Task 3']);
  });

  test('trims whitespace from headers', () => {
    const csv = '  Title  ,  Assignee  \nTask,user1';
    const result = parseCSV({ csv_data: csv });

    expect(result.data[0]).toEqual({
      title: 'Task',
      assignee: 'user1',
    });
  });

  test('trims whitespace from values', () => {
    const csv = 'Title,Assignee\n  Task with spaces  ,  user1  ';
    const result = parseCSV({ csv_data: csv });

    expect(result.data[0]).toEqual({
      title: 'Task with spaces',
      assignee: 'user1',
    });
  });

  test('excludes rows with only empty values', () => {
    const csv = 'Title,Assignee\nTask,user1\n,\n  ,  \nTask 2,user2';
    const result = parseCSV({ csv_data: csv });

    expect(result.data).toHaveLength(2);
    expect(result.data[0].title).toBe('Task');
    expect(result.data[1].title).toBe('Task 2');
  });
});

// ============================================================================
// Custom Column Mapping
// ============================================================================

describe('parseCSV - custom column mapping', () => {
  test('applies custom column mapping', () => {
    const csv = 'CustomTitle,CustomAssignee\nTask,user1';
    const result = parseCSV({
      csv_data: csv,
      column_mapping: {
        CustomTitle: 'title',
        CustomAssignee: 'assignee',
      },
    });

    expect(result.errors).toEqual([]);
    expect(result.data[0]).toEqual({
      title: 'Task',
      assignee: 'user1',
    });
  });

  test('custom mapping overrides built-in aliases', () => {
    const csv = 'Title,Description\nMyTitle,MyDesc';
    const result = parseCSV({
      csv_data: csv,
      column_mapping: {
        Title: 'description',
        Description: 'title',
      },
    });

    expect(result.data[0]).toEqual({
      description: 'MyTitle',
      title: 'MyDesc',
    });
  });

  test('custom mapping is case-insensitive', () => {
    const csv = 'CUSTOMCOL\nValue';
    const result = parseCSV({
      csv_data: csv,
      column_mapping: {
        customcol: 'title',
      },
    });

    expect(result.data[0].title).toBe('Value');
  });
});

// ============================================================================
// Various CSV Formats
// ============================================================================

describe('parseCSV - various CSV formats', () => {
  test('handles CSV from Excel export', () => {
    const csv = 'Title,Assignee,Priority\r\nTask 1,user1,3\r\nTask 2,user2,5';
    const result = parseCSV({ csv_data: csv });

    expect(result.data).toHaveLength(2);
    expect(result.data[0].title).toBe('Task 1');
  });

  test('handles single column CSV', () => {
    const csv = 'Title\nTask 1\nTask 2\nTask 3';
    const result = parseCSV({ csv_data: csv });

    expect(result.data).toHaveLength(3);
    expect(result.data[0]).toEqual({ title: 'Task 1' });
  });

  test('handles many columns CSV', () => {
    const csv = 'Title,Assignee,Status,Priority,Size,Tags,Dartboard,Due Date\nTask,user1,Todo,3,5,urgent,Engineering,2026-02-01';
    const result = parseCSV({ csv_data: csv });

    expect(result.data[0]).toEqual({
      title: 'Task',
      assignee: 'user1',
      status: 'Todo',
      priority: '3',
      size: '5',
      tags: 'urgent',
      dartboard: 'Engineering',
      due_at: '2026-02-01',
    });
  });

  test('handles UTF-8 characters', () => {
    const csv = 'Title,Assignee\n"Tâche français 日本語",用户';
    const result = parseCSV({ csv_data: csv });

    expect(result.data[0].title).toBe('Tâche français 日本語');
    expect(result.data[0].assignee).toBe('用户');
  });

  test('handles partial rows (missing values)', () => {
    const csv = 'Title,Assignee,Priority\nTask 1,user1,3\nTask 2,,\nTask 3,user3,';
    const result = parseCSV({ csv_data: csv });

    expect(result.data[0]).toEqual({ title: 'Task 1', assignee: 'user1', priority: '3' });
    expect(result.data[1]).toEqual({ title: 'Task 2' });
    expect(result.data[2]).toEqual({ title: 'Task 3', assignee: 'user3' });
  });
});

// ============================================================================
// Edge Cases & Error Handling
// ============================================================================

describe('parseCSV - edge cases', () => {
  test('handles file read errors gracefully', () => {
    const result = parseCSV({ csv_file_path: '/nonexistent/file.csv' });

    expect(result.errors.some(e => e.includes('Failed to read CSV file'))).toBe(true);
    expect(result.data).toEqual([]);
  });

  test('handles malformed CSV gracefully', () => {
    const csv = 'Title\n"Unclosed quote';
    const result = parseCSV({ csv_data: csv });

    // papaparse is lenient and tries to recover
    expect(result.data).toBeDefined();
  });

  test('handles very large number of columns', () => {
    const headers = ['Title', ...Array.from({ length: 100 }, (_, i) => `Col${i}`)];
    const csv = headers.join(',') + '\nTask,' + Array.from({ length: 100 }, () => 'val').join(',');
    const result = parseCSV({ csv_data: csv });

    expect(result.data[0].title).toBe('Task');
    expect(result.warnings.length).toBeGreaterThan(0); // Unknown columns warning
  });

  test('returns array of row objects with normalized keys', () => {
    const csv = 'Title,Assignee\nTask 1,user1\nTask 2,user2';
    const result = parseCSV({ csv_data: csv });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.every(row => typeof row === 'object')).toBe(true);
    expect(result.data.every(row => 'title' in row)).toBe(true);
  });
});

// ============================================================================
// Utility Functions Tests
// ============================================================================

describe('getSupportedColumns', () => {
  test('returns all supported column aliases', () => {
    const supported = getSupportedColumns();

    expect(supported).toHaveProperty('title');
    expect(supported).toHaveProperty('assignee');
    expect(supported.title).toContain('title');
    expect(supported.assignee).toContain('assignee');
  });
});

describe('isValidColumn', () => {
  test('returns true for valid column names', () => {
    expect(isValidColumn('title')).toBe(true);
    expect(isValidColumn('Title')).toBe(true);
    expect(isValidColumn('TITLE')).toBe(true);
    expect(isValidColumn('Task Name')).toBe(true);
    expect(isValidColumn('assignee')).toBe(true);
    expect(isValidColumn('Assigned To')).toBe(true);
  });

  test('returns false for invalid column names', () => {
    expect(isValidColumn('UnknownColumn')).toBe(false);
    expect(isValidColumn('InvalidField')).toBe(false);
    expect(isValidColumn('')).toBe(false);
  });
});

// ============================================================================
// Adversarial Edge Cases
// ============================================================================

describe('parseCSV - adversarial edge cases', () => {
  test('handles duplicate column headers (papaparse renames them)', () => {
    // Note: papaparse automatically renames duplicate headers by appending numbers
    // e.g., "Title" and "Title" become "Title" and "Title_1"
    // This is expected behavior and we should handle it gracefully
    const csv = 'Title,Assignee,Title\nTask,user1,Duplicate';
    const result = parseCSV({ csv_data: csv });

    // The second "Title" gets renamed to something like "Title_1" by papaparse
    // which we won't recognize, so it becomes an unknown column (warning)
    expect(result.warnings.some(w => w.includes('Unknown columns'))).toBe(true);
    expect(result.data[0].title).toBe('Task');
  });

  test('validates custom mapping targets are valid fields', () => {
    const csv = 'CustomCol\nValue';
    const result = parseCSV({
      csv_data: csv,
      column_mapping: {
        CustomCol: 'invalid_field_name',
      },
    });

    expect(result.warnings.some(w => w.includes('maps to unknown field'))).toBe(true);
  });

  test('warns about empty required field values', () => {
    const csv = 'Title,Assignee\n,user1\nTask,user2';
    const result = parseCSV({ csv_data: csv });

    expect(result.warnings.some(w => w.includes("Required field 'title' is empty"))).toBe(true);
    expect(result.data).toHaveLength(2); // Still includes the row
  });

  test('handles literal "undefined" and "null" strings', () => {
    const csv = 'Title,Assignee\nundefined,null';
    const result = parseCSV({ csv_data: csv });

    expect(result.data[0].title).toBe('undefined');
    expect(result.data[0].assignee).toBe('null');
  });

  test('handles columns with only whitespace in values', () => {
    const csv = 'Title,Assignee\n   ,   ';
    const result = parseCSV({ csv_data: csv });

    // Row with only whitespace values is excluded
    expect(result.data).toHaveLength(0);
  });

  test('handles very long field values', () => {
    const longValue = 'A'.repeat(10000);
    const csv = `Title\n"${longValue}"`;
    const result = parseCSV({ csv_data: csv });

    expect(result.data[0].title).toBe(longValue);
  });

  test('handles special characters in file path', () => {
    const csv = 'Title\nTask from special path';
    const filePath = createTestFile('test file with spaces.csv', csv);

    const result = parseCSV({ csv_file_path: filePath });

    expect(result.errors).toEqual([]);
    expect(result.data[0].title).toBe('Task from special path');

    cleanupTestDir();
  });
});

// ============================================================================
// Real-World Integration Tests
// ============================================================================

describe('parseCSV - real-world scenarios', () => {
  test('parses typical Jira export', () => {
    const csv = `Summary,Assignee,Status,Priority
"PROJ-123: Fix login bug","john.doe@company.com","In Progress","High"
"PROJ-124: Add dashboard","jane.smith@company.com","To Do","Medium"`;

    const result = parseCSV({
      csv_data: csv,
      column_mapping: {
        Summary: 'title',
      },
    });

    expect(result.errors).toEqual([]);
    expect(result.data).toHaveLength(2);
    expect(result.data[0].title).toBe('PROJ-123: Fix login bug');
    expect(result.data[0].assignee).toBe('john.doe@company.com');
  });

  test('parses typical Trello export', () => {
    const csv = `Card Name,Members,List,Labels
"Design new homepage","Alice, Bob","In Progress","Design,UX"
"Fix mobile layout","Charlie","Done","Bug,Mobile"`;

    const result = parseCSV({
      csv_data: csv,
      column_mapping: {
        'Card Name': 'title',
        Members: 'assignee',
        List: 'status',
        Labels: 'tags',
      },
    });

    expect(result.data).toHaveLength(2);
    expect(result.data[0].title).toBe('Design new homepage');
    expect(result.data[0].assignee).toBe('Alice, Bob');
  });

  test('parses typical Asana export', () => {
    const csv = `Task Name,Assignee Email,Status,Priority,Due Date
"Quarterly planning","manager@company.com","Not Started","High","2026-03-01"
"Team retrospective","lead@company.com","Completed","Medium","2026-01-15"`;

    const result = parseCSV({
      csv_data: csv,
      column_mapping: {
        'Task Name': 'title',
        'Assignee Email': 'assignee',
      },
    });

    expect(result.data).toHaveLength(2);
    expect(result.data[0].title).toBe('Quarterly planning');
    expect(result.data[0].due_at).toBe('2026-03-01'); // Due Date alias works
  });
});

// ============================================================================
// Reference Resolution Tests
// ============================================================================

describe('resolveReferences - dartboard name to dart_id', () => {
  const config = createMockConfig();

  test('resolves dartboard name to dart_id', () => {
    const row = { title: 'Task', dartboard: 'Engineering' };
    const result = resolveReferences(row, config, 1);

    expect(result.errors).toEqual([]);
    expect(result.resolved.dartboard).toBe('board1');
  });

  test('resolves dartboard name case-insensitively', () => {
    const row = { title: 'Task', dartboard: 'ENGINEERING' };
    const result = resolveReferences(row, config, 1);

    expect(result.errors).toEqual([]);
    expect(result.resolved.dartboard).toBe('board1');
  });

  test('accepts dartboard dart_id directly', () => {
    const row = { title: 'Task', dartboard: 'board2' };
    const result = resolveReferences(row, config, 1);

    expect(result.errors).toEqual([]);
    expect(result.resolved.dartboard).toBe('board2');
  });

  test('errors on unknown dartboard', () => {
    const row = { title: 'Task', dartboard: 'Unknown Board' };
    const result = resolveReferences(row, config, 1);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].field).toBe('dartboard');
    expect(result.errors[0].error).toContain('not found');
    expect(result.errors[0].value).toBe('Unknown Board');
    expect(result.errors[0].row_number).toBe(1);
  });

  test('suggests close matches for dartboard typos', () => {
    const row = { title: 'Task', dartboard: 'Enginering' }; // Missing 'e'
    const result = resolveReferences(row, config, 1);

    expect(result.errors).toHaveLength(1);
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].field).toBe('dartboard');
    expect(result.suggestions[0].input).toBe('Enginering');
    expect(result.suggestions[0].suggestions).toContain('Engineering');
  });
});

describe('resolveReferences - assignee email/name to dart_id', () => {
  const config = createMockConfig();

  test('resolves assignee email to dart_id', () => {
    const row = { title: 'Task', assignee: 'john@example.com' };
    const result = resolveReferences(row, config, 1);

    expect(result.errors).toEqual([]);
    expect(result.resolved.assignee).toBe('user1');
  });

  test('resolves assignee name to dart_id', () => {
    const row = { title: 'Task', assignee: 'Jane Smith' };
    const result = resolveReferences(row, config, 1);

    expect(result.errors).toEqual([]);
    expect(result.resolved.assignee).toBe('user2');
  });

  test('resolves assignee case-insensitively', () => {
    const row = { title: 'Task', assignee: 'JOHN@EXAMPLE.COM' };
    const result = resolveReferences(row, config, 1);

    expect(result.errors).toEqual([]);
    expect(result.resolved.assignee).toBe('user1');
  });

  test('accepts assignee dart_id directly', () => {
    const row = { title: 'Task', assignee: 'user3' };
    const result = resolveReferences(row, config, 1);

    expect(result.errors).toEqual([]);
    expect(result.resolved.assignee).toBe('user3');
  });

  test('errors on unknown assignee', () => {
    const row = { title: 'Task', assignee: 'unknown@example.com' };
    const result = resolveReferences(row, config, 1);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].field).toBe('assignee');
    expect(result.errors[0].error).toContain('not found');
  });

  test('suggests close matches for assignee typos', () => {
    const row = { title: 'Task', assignee: 'jhon@example.com' }; // Typo in 'john'
    const result = resolveReferences(row, config, 1);

    expect(result.errors).toHaveLength(1);
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].suggestions).toContain('john@example.com');
  });
});

describe('resolveReferences - tag names to dart_ids', () => {
  const config = createMockConfig();

  test('resolves single tag name to dart_id', () => {
    const row = { title: 'Task', tags: 'urgent' };
    const result = resolveReferences(row, config, 1);

    expect(result.errors).toEqual([]);
    expect(result.resolved.tags).toEqual(['tag1']);
  });

  test('resolves multiple comma-separated tags', () => {
    const row = { title: 'Task', tags: 'urgent, bug, feature' };
    const result = resolveReferences(row, config, 1);

    expect(result.errors).toEqual([]);
    expect(result.resolved.tags).toEqual(['tag1', 'tag2', 'tag3']);
  });

  test('resolves tags case-insensitively', () => {
    const row = { title: 'Task', tags: 'URGENT, BUG' };
    const result = resolveReferences(row, config, 1);

    expect(result.errors).toEqual([]);
    expect(result.resolved.tags).toEqual(['tag1', 'tag2']);
  });

  test('accepts tag dart_ids directly', () => {
    const row = { title: 'Task', tags: 'tag1, tag2' };
    const result = resolveReferences(row, config, 1);

    expect(result.errors).toEqual([]);
    expect(result.resolved.tags).toEqual(['tag1', 'tag2']);
  });

  test('errors on unknown tags', () => {
    const row = { title: 'Task', tags: 'urgent, unknown-tag' };
    const result = resolveReferences(row, config, 1);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].field).toBe('tags');
    expect(result.errors[0].value).toBe('unknown-tag');
  });

  test('suggests close matches for tag typos', () => {
    const row = { title: 'Task', tags: 'ugrent' }; // Typo in 'urgent'
    const result = resolveReferences(row, config, 1);

    expect(result.errors).toHaveLength(1);
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].suggestions).toContain('urgent');
  });

  test('does not set tags if any tag is invalid', () => {
    const row = { title: 'Task', tags: 'urgent, invalid, bug' };
    const result = resolveReferences(row, config, 1);

    expect(result.errors).toHaveLength(1);
    expect(result.resolved.tags).toBeUndefined();
  });
});

describe('resolveReferences - status name to dart_id', () => {
  const config = createMockConfig();

  test('resolves status name to dart_id', () => {
    const row = { title: 'Task', status: 'In Progress' };
    const result = resolveReferences(row, config, 1);

    expect(result.errors).toEqual([]);
    expect(result.resolved.status).toBe('status2');
  });

  test('resolves status case-insensitively', () => {
    const row = { title: 'Task', status: 'DONE' };
    const result = resolveReferences(row, config, 1);

    expect(result.errors).toEqual([]);
    expect(result.resolved.status).toBe('status3');
  });

  test('errors on unknown status', () => {
    const row = { title: 'Task', status: 'Unknown Status' };
    const result = resolveReferences(row, config, 1);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].field).toBe('status');
  });

  test('suggests close matches for status typos', () => {
    const row = { title: 'Task', status: 'Toto' }; // Typo in 'Todo'
    const result = resolveReferences(row, config, 1);

    expect(result.errors).toHaveLength(1);
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].suggestions).toContain('Todo');
  });
});

describe('resolveReferences - multiple fields', () => {
  const config = createMockConfig();

  test('resolves all fields simultaneously', () => {
    const row = {
      title: 'Task',
      dartboard: 'Engineering',
      assignee: 'john@example.com',
      status: 'Todo',
      tags: 'urgent, bug',
    };
    const result = resolveReferences(row, config, 1);

    expect(result.errors).toEqual([]);
    expect(result.resolved.dartboard).toBe('board1');
    expect(result.resolved.assignee).toBe('user1');
    expect(result.resolved.status).toBe('status1');
    expect(result.resolved.tags).toEqual(['tag1', 'tag2']);
  });

  test('preserves non-reference fields', () => {
    const row = {
      title: 'Task Title',
      description: 'Description',
      priority: '3',
      dartboard: 'Engineering',
    };
    const result = resolveReferences(row, config, 1);

    expect(result.resolved.title).toBe('Task Title');
    expect(result.resolved.description).toBe('Description');
    expect(result.resolved.priority).toBe('3');
  });
});

// ============================================================================
// Row Validation Tests
// ============================================================================

describe('validateRow - required fields', () => {
  const config = createMockConfig();

  test('passes validation with required title field', () => {
    const row = { title: 'Valid Task' };
    const errors = validateRow(row, config, 1);

    expect(errors).toEqual([]);
  });

  test('errors when title is missing', () => {
    const row = { description: 'No title' };
    const errors = validateRow(row, config, 1);

    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('title');
    expect(errors[0].error).toContain('required');
  });

  test('errors when title is empty string', () => {
    const row = { title: '' };
    const errors = validateRow(row, config, 1);

    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('title');
  });

  test('errors when title is only whitespace', () => {
    const row = { title: '   ' };
    const errors = validateRow(row, config, 1);

    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('title');
  });

  test('errors when title exceeds 500 characters', () => {
    const row = { title: 'A'.repeat(501) };
    const errors = validateRow(row, config, 1);

    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('title');
    expect(errors[0].error).toContain('500 characters');
  });
});

describe('validateRow - data types (priority, size)', () => {
  const config = createMockConfig();

  test('accepts valid priority (1-5)', () => {
    const row = { title: 'Task', priority: '3' };
    const errors = validateRow(row, config, 1);

    expect(errors).toEqual([]);
  });

  test('errors on priority < 1', () => {
    const row = { title: 'Task', priority: '0' };
    const errors = validateRow(row, config, 1);

    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('priority');
    expect(errors[0].error).toContain('Available priorities:');
  });

  test('errors on priority > 5', () => {
    const row = { title: 'Task', priority: '6' };
    const errors = validateRow(row, config, 1);

    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('priority');
  });

  test('errors on non-matching priority', () => {
    // Note: 'high' matches config label 'High' case-insensitively, so use 'invalid'
    const row = { title: 'Task', priority: 'invalid' };
    const errors = validateRow(row, config, 1);

    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('priority');
  });

  test('accepts valid size (1-5)', () => {
    const row = { title: 'Task', size: '2' };
    const errors = validateRow(row, config, 1);

    expect(errors).toEqual([]);
  });

  test('errors on size < 1', () => {
    const row = { title: 'Task', size: '0' };
    const errors = validateRow(row, config, 1);

    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('size');
  });

  test('errors on size > 5', () => {
    const row = { title: 'Task', size: '10' };
    const errors = validateRow(row, config, 1);

    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('size');
  });

  test('errors on non-numeric size', () => {
    const row = { title: 'Task', size: 'large' };
    const errors = validateRow(row, config, 1);

    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('size');
  });
});

describe('validateRow - date formats (ISO8601)', () => {
  const config = createMockConfig();

  test('accepts valid ISO8601 date (YYYY-MM-DD)', () => {
    const row = { title: 'Task', due_at: '2026-02-15' };
    const errors = validateRow(row, config, 1);

    expect(errors).toEqual([]);
  });

  test('accepts valid ISO8601 datetime (YYYY-MM-DDTHH:MM:SSZ)', () => {
    const row = { title: 'Task', due_at: '2026-02-15T14:30:00Z' };
    const errors = validateRow(row, config, 1);

    expect(errors).toEqual([]);
  });

  test('accepts valid ISO8601 with timezone offset', () => {
    const row = { title: 'Task', due_at: '2026-02-15T14:30:00+05:30' };
    const errors = validateRow(row, config, 1);

    expect(errors).toEqual([]);
  });

  test('accepts valid ISO8601 with milliseconds', () => {
    const row = { title: 'Task', start_at: '2026-02-15T14:30:00.123Z' };
    const errors = validateRow(row, config, 1);

    expect(errors).toEqual([]);
  });

  test('errors on invalid date format (MM/DD/YYYY)', () => {
    const row = { title: 'Task', due_at: '02/15/2026' };
    const errors = validateRow(row, config, 1);

    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('due_at');
    expect(errors[0].error).toContain('ISO8601');
  });

  test('errors on invalid date format (DD-MM-YYYY)', () => {
    const row = { title: 'Task', due_at: '15-02-2026' };
    const errors = validateRow(row, config, 1);

    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('due_at');
  });

  test('errors on invalid date value', () => {
    const row = { title: 'Task', due_at: '2026-13-45' }; // Invalid month and day
    const errors = validateRow(row, config, 1);

    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('due_at');
  });

  test('errors on non-date string', () => {
    const row = { title: 'Task', due_at: 'next week' };
    const errors = validateRow(row, config, 1);

    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('due_at');
  });

  test('validates start_at date format', () => {
    const row = { title: 'Task', start_at: 'invalid-date' };
    const errors = validateRow(row, config, 1);

    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('start_at');
  });
});

describe('validateRow - reference validation', () => {
  const config = createMockConfig();

  test('validates dartboard exists', () => {
    const row = { title: 'Task', dartboard: 'Engineering' };
    const errors = validateRow(row, config, 1);

    expect(errors).toEqual([]);
  });

  test('errors on unknown dartboard', () => {
    const row = { title: 'Task', dartboard: 'Unknown Board' };
    const errors = validateRow(row, config, 1);

    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('dartboard');
    expect(errors[0].error).toContain('not found');
  });

  test('validates status exists', () => {
    const row = { title: 'Task', status: 'Todo' };
    const errors = validateRow(row, config, 1);

    expect(errors).toEqual([]);
  });

  test('errors on unknown status', () => {
    const row = { title: 'Task', status: 'Invalid Status' };
    const errors = validateRow(row, config, 1);

    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('status');
  });

  test('validates assignee exists (email)', () => {
    const row = { title: 'Task', assignee: 'john@example.com' };
    const errors = validateRow(row, config, 1);

    expect(errors).toEqual([]);
  });

  test('validates assignee exists (name)', () => {
    const row = { title: 'Task', assignee: 'Jane Smith' };
    const errors = validateRow(row, config, 1);

    expect(errors).toEqual([]);
  });

  test('errors on unknown assignee', () => {
    const row = { title: 'Task', assignee: 'unknown@example.com' };
    const errors = validateRow(row, config, 1);

    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('assignee');
  });

  test('validates tags exist', () => {
    const row = { title: 'Task', tags: 'urgent, bug' };
    const errors = validateRow(row, config, 1);

    expect(errors).toEqual([]);
  });

  test('errors on unknown tags', () => {
    const row = { title: 'Task', tags: 'urgent, invalid-tag, bug' };
    const errors = validateRow(row, config, 1);

    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('tags');
    expect(errors[0].value).toBe('invalid-tag');
  });
});

describe('validateRow - multiple validation errors', () => {
  const config = createMockConfig();

  test('collects multiple errors from different fields', () => {
    const row = {
      title: '',
      priority: '10',
      due_at: 'invalid-date',
      dartboard: 'Unknown',
    };
    const errors = validateRow(row, config, 1);

    expect(errors).toHaveLength(4);
    expect(errors.map(e => e.field)).toContain('title');
    expect(errors.map(e => e.field)).toContain('priority');
    expect(errors.map(e => e.field)).toContain('due_at');
    expect(errors.map(e => e.field)).toContain('dartboard');
  });

  test('includes row_number in all errors', () => {
    const row = {
      title: '',
      priority: 'high',
      dartboard: 'Invalid',
    };
    const errors = validateRow(row, config, 42);

    expect(errors.every(e => e.row_number === 42)).toBe(true);
  });

  test('includes value in all errors', () => {
    const row = {
      title: '',
      priority: 'high',
    };
    const errors = validateRow(row, config, 1);

    expect(errors.every(e => e.value !== undefined)).toBe(true);
  });
});

// ============================================================================
// Integration Tests (Validation + Resolution)
// ============================================================================

// ============================================================================
// Edge Case Tests (Adversarial)
// ============================================================================

describe('resolveReferences - edge cases', () => {
  const config = createMockConfig();

  test('handles whitespace-only dartboard value', () => {
    const row = { title: 'Task', dartboard: '   ' };
    const result = resolveReferences(row, config, 1);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain('empty or whitespace-only');
  });

  test('handles whitespace-only tags value', () => {
    const row = { title: 'Task', tags: '   ' };
    const result = resolveReferences(row, config, 1);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain('empty or whitespace-only');
  });

  test('handles tags with only commas', () => {
    const row = { title: 'Task', tags: ',,,,' };
    const result = resolveReferences(row, config, 1);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain('only commas');
  });

  test('handles tags with commas and whitespace', () => {
    const row = { title: 'Task', tags: '  ,  ,  ' };
    const result = resolveReferences(row, config, 1);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain('only commas');
  });

  test('handles empty config arrays gracefully', () => {
    const emptyConfig: DartConfig = {
      assignees: [],
      dartboards: [],
      statuses: [],
      tags: [],
      priorities: [],
      sizes: [],
      folders: [],
    };

    const row = {
      title: 'Task',
      dartboard: 'Engineering',
      assignee: 'john@example.com',
      tags: 'urgent',
    };

    const result = resolveReferences(row, emptyConfig, 1);

    expect(result.errors).toHaveLength(3);
    expect(result.suggestions).toHaveLength(0); // No suggestions for empty arrays
  });

  test('trims whitespace around reference values', () => {
    const row = {
      title: 'Task',
      dartboard: '  Engineering  ',
      assignee: '  john@example.com  ',
      status: '  Todo  ',
    };

    const result = resolveReferences(row, config, 1);

    expect(result.errors).toEqual([]);
    expect(result.resolved.dartboard).toBe('board1');
    expect(result.resolved.assignee).toBe('user1');
    expect(result.resolved.status).toBe('status1');
  });

  test('handles tags with extra whitespace in comma-separated list', () => {
    const row = { title: 'Task', tags: ' urgent , bug , feature ' };
    const result = resolveReferences(row, config, 1);

    expect(result.errors).toEqual([]);
    expect(result.resolved.tags).toEqual(['tag1', 'tag2', 'tag3']);
  });
});

describe('validateRow - edge cases', () => {
  const config = createMockConfig();

  test('handles empty config arrays gracefully', () => {
    const emptyConfig: DartConfig = {
      assignees: [],
      dartboards: [],
      statuses: [],
      tags: [],
      priorities: [],
      sizes: [],
      folders: [],
    };

    const row = {
      title: 'Task',
      dartboard: 'Engineering',
    };

    const errors = validateRow(row, emptyConfig, 1);

    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('dartboard');
  });

  test('handles title with exactly 500 characters (boundary)', () => {
    const row = { title: 'A'.repeat(500) };
    const errors = validateRow(row, config, 1);

    expect(errors).toEqual([]);
  });

  test('handles title with 501 characters (just over boundary)', () => {
    const row = { title: 'A'.repeat(501) };
    const errors = validateRow(row, config, 1);

    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('title');
  });

  test('handles priority boundary values', () => {
    expect(validateRow({ title: 'Task', priority: '1' }, config, 1)).toEqual([]);
    expect(validateRow({ title: 'Task', priority: '5' }, config, 1)).toEqual([]);
    expect(validateRow({ title: 'Task', priority: '0' }, config, 1).length).toBeGreaterThan(0);
    expect(validateRow({ title: 'Task', priority: '6' }, config, 1).length).toBeGreaterThan(0);
  });

  test('handles size boundary values', () => {
    expect(validateRow({ title: 'Task', size: '1' }, config, 1)).toEqual([]);
    expect(validateRow({ title: 'Task', size: '5' }, config, 1)).toEqual([]);
    expect(validateRow({ title: 'Task', size: '0' }, config, 1).length).toBeGreaterThan(0);
    expect(validateRow({ title: 'Task', size: '6' }, config, 1).length).toBeGreaterThan(0);
  });

  test('handles decimal priority values', () => {
    const row = { title: 'Task', priority: '3.5' };
    const errors = validateRow(row, config, 1);

    // Config-based validation requires exact match; '3.5' doesn't match '3'
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('priority');
  });

  test('handles negative priority values', () => {
    const row = { title: 'Task', priority: '-1' };
    const errors = validateRow(row, config, 1);

    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('priority');
  });

  test('validates leap year dates correctly', () => {
    const row = { title: 'Task', due_at: '2024-02-29' }; // Valid leap year
    const errors = validateRow(row, config, 1);

    expect(errors).toEqual([]);
  });

  test('errors on invalid leap year dates', () => {
    const row = { title: 'Task', due_at: '2023-02-29' }; // Invalid - not a leap year
    const errors = validateRow(row, config, 1);

    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('due_at');
  });
});

describe('validateRow and resolveReferences - integration', () => {
  const config = createMockConfig();

  test('validation passes before resolution, resolution succeeds', () => {
    const row = {
      title: 'Fix bug',
      dartboard: 'Engineering',
      assignee: 'john@example.com',
      priority: '3',
      tags: 'urgent, bug',
    };

    // Validate first
    const validationErrors = validateRow(row, config, 1);
    expect(validationErrors).toEqual([]);

    // Then resolve
    const resolution = resolveReferences(row, config, 1);
    expect(resolution.errors).toEqual([]);
    expect(resolution.resolved.dartboard).toBe('board1');
    expect(resolution.resolved.assignee).toBe('user1');
    expect(resolution.resolved.tags).toEqual(['tag1', 'tag2']);
  });

  test('validation catches errors that resolution would also catch', () => {
    const row = {
      title: 'Task',
      dartboard: 'Unknown Board',
      assignee: 'unknown@example.com',
    };

    // Both should catch the same reference errors
    const validationErrors = validateRow(row, config, 1);
    const resolution = resolveReferences(row, config, 1);

    expect(validationErrors.length).toBeGreaterThan(0);
    expect(resolution.errors.length).toBeGreaterThan(0);
  });

  test('validation can catch errors that resolution does not (data types)', () => {
    const row = {
      title: 'Task',
      priority: '100', // Invalid priority
      due_at: 'invalid-date', // Invalid date
    };

    const validationErrors = validateRow(row, config, 1);
    const resolution = resolveReferences(row, config, 1);

    // Validation should catch type errors
    expect(validationErrors.length).toBe(2);
    // Resolution doesn't validate types, only references
    expect(resolution.errors).toEqual([]);
  });
});
