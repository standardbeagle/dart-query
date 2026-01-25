/**
 * DartQL Parser - Tokenizer, Lexer & AST Builder Tests
 */

import { describe, it, expect } from 'vitest';
import {
  parseDartQL,
  parseDartQLToAST,
  convertToFilters,
  DartQLTokenizer,
  DartQLLexer,
  TokenType,
  VALID_FIELDS,
} from './dartql.js';
import { DartQLParseError } from '../types/index.js';

// ============================================================================
// Tokenizer Tests
// ============================================================================

describe('DartQLTokenizer', () => {
  describe('Basic Tokenization', () => {
    it('should tokenize a simple equality expression', () => {
      const tokenizer = new DartQLTokenizer("status = 'Todo'");
      const tokens = tokenizer.tokenize();

      expect(tokens).toHaveLength(4); // status, =, 'Todo', EOF
      expect(tokens[0]).toMatchObject({ type: TokenType.IDENTIFIER, value: 'status' });
      expect(tokens[1]).toMatchObject({ type: TokenType.EQUALS, value: '=' });
      expect(tokens[2]).toMatchObject({ type: TokenType.STRING, value: 'Todo' });
      expect(tokens[3]).toMatchObject({ type: TokenType.EOF });
    });

    it('should tokenize numeric comparisons', () => {
      const tokenizer = new DartQLTokenizer('priority >= 3');
      const tokens = tokenizer.tokenize();

      expect(tokens).toHaveLength(4);
      expect(tokens[0]).toMatchObject({ type: TokenType.IDENTIFIER, value: 'priority' });
      expect(tokens[1]).toMatchObject({ type: TokenType.GREATER_EQUAL, value: '>=' });
      expect(tokens[2]).toMatchObject({ type: TokenType.NUMBER, value: '3' });
      expect(tokens[3]).toMatchObject({ type: TokenType.EOF });
    });

    it('should tokenize decimal numbers', () => {
      const tokenizer = new DartQLTokenizer('size > 3.5');
      const tokens = tokenizer.tokenize();

      expect(tokens[2]).toMatchObject({ type: TokenType.NUMBER, value: '3.5' });
    });
  });

  describe('Operators', () => {
    it('should tokenize all comparison operators', () => {
      const operators = [
        { input: 'a = b', expected: TokenType.EQUALS },
        { input: 'a != b', expected: TokenType.NOT_EQUALS },
        { input: 'a > b', expected: TokenType.GREATER_THAN },
        { input: 'a >= b', expected: TokenType.GREATER_EQUAL },
        { input: 'a < b', expected: TokenType.LESS_THAN },
        { input: 'a <= b', expected: TokenType.LESS_EQUAL },
      ];

      for (const { input, expected } of operators) {
        const tokenizer = new DartQLTokenizer(input);
        const tokens = tokenizer.tokenize();
        expect(tokens[1].type).toBe(expected);
      }
    });
  });

  describe('Keywords', () => {
    it('should tokenize AND, OR, NOT as logical operators', () => {
      const tokenizer = new DartQLTokenizer('a AND b OR NOT c');
      const tokens = tokenizer.tokenize();

      expect(tokens[1]).toMatchObject({ type: TokenType.AND, value: 'AND' });
      expect(tokens[3]).toMatchObject({ type: TokenType.OR, value: 'OR' });
      expect(tokens[4]).toMatchObject({ type: TokenType.NOT, value: 'NOT' });
    });

    it('should tokenize IN keyword', () => {
      const tokenizer = new DartQLTokenizer("status IN ('Todo', 'Done')");
      const tokens = tokenizer.tokenize();

      expect(tokens[1]).toMatchObject({ type: TokenType.IN, value: 'IN' });
    });

    it('should tokenize LIKE and CONTAINS keywords', () => {
      const tokenizer = new DartQLTokenizer("title LIKE '%bug%' AND tags CONTAINS 'urgent'");
      const tokens = tokenizer.tokenize();

      expect(tokens[1]).toMatchObject({ type: TokenType.LIKE, value: 'LIKE' });
      expect(tokens[5]).toMatchObject({ type: TokenType.CONTAINS, value: 'CONTAINS' });
    });

    it('should tokenize IS NULL', () => {
      const tokenizer = new DartQLTokenizer('due_at IS NULL');
      const tokens = tokenizer.tokenize();

      expect(tokens[1]).toMatchObject({ type: TokenType.IS, value: 'IS' });
      expect(tokens[2]).toMatchObject({ type: TokenType.NULL, value: 'NULL' });
    });

    it('should tokenize BETWEEN keyword', () => {
      const tokenizer = new DartQLTokenizer("priority BETWEEN 2 AND 5");
      const tokens = tokenizer.tokenize();

      expect(tokens[1]).toMatchObject({ type: TokenType.BETWEEN, value: 'BETWEEN' });
    });

    it('should handle keywords case-insensitively', () => {
      const tokenizer = new DartQLTokenizer('a and b OR not c');
      const tokens = tokenizer.tokenize();

      expect(tokens[1]).toMatchObject({ type: TokenType.AND, value: 'and' });
      expect(tokens[3]).toMatchObject({ type: TokenType.OR, value: 'OR' });
      expect(tokens[4]).toMatchObject({ type: TokenType.NOT, value: 'not' });
    });
  });

  describe('String Literals', () => {
    it('should tokenize single-quoted strings', () => {
      const tokenizer = new DartQLTokenizer("title = 'Fix bug'");
      const tokens = tokenizer.tokenize();

      expect(tokens[2]).toMatchObject({ type: TokenType.STRING, value: 'Fix bug' });
    });

    it('should tokenize double-quoted strings', () => {
      const tokenizer = new DartQLTokenizer('title = "Fix bug"');
      const tokens = tokenizer.tokenize();

      expect(tokens[2]).toMatchObject({ type: TokenType.STRING, value: 'Fix bug' });
    });

    it('should handle escaped quotes in strings', () => {
      const tokenizer = new DartQLTokenizer("title = 'It\\'s working'");
      const tokens = tokenizer.tokenize();

      expect(tokens[2]).toMatchObject({ type: TokenType.STRING, value: "It's working" });
    });

    it('should handle escape sequences', () => {
      const tokenizer = new DartQLTokenizer('description = "Line 1\\nLine 2\\tTabbed"');
      const tokens = tokenizer.tokenize();

      expect(tokens[2]).toMatchObject({ type: TokenType.STRING, value: 'Line 1\nLine 2\tTabbed' });
    });

    it('should throw error for unterminated strings', () => {
      const tokenizer = new DartQLTokenizer("title = 'unterminated");

      expect(() => tokenizer.tokenize()).toThrow(DartQLParseError);
      expect(() => tokenizer.tokenize()).toThrow(/Unterminated string literal/);
    });
  });

  describe('Parentheses and Grouping', () => {
    it('should tokenize parentheses', () => {
      const tokenizer = new DartQLTokenizer('(a OR b) AND c');
      const tokens = tokenizer.tokenize();

      expect(tokens[0]).toMatchObject({ type: TokenType.LPAREN, value: '(' });
      expect(tokens[4]).toMatchObject({ type: TokenType.RPAREN, value: ')' });
    });

    it('should tokenize nested parentheses', () => {
      const tokenizer = new DartQLTokenizer('((a AND b) OR (c AND d))');
      const tokens = tokenizer.tokenize();

      expect(tokens.filter(t => t.type === TokenType.LPAREN)).toHaveLength(3);
      expect(tokens.filter(t => t.type === TokenType.RPAREN)).toHaveLength(3);
    });
  });

  describe('IN Clause', () => {
    it('should tokenize IN clause with array', () => {
      const tokenizer = new DartQLTokenizer("status IN ('Todo', 'In Progress', 'Done')");
      const tokens = tokenizer.tokenize();

      expect(tokens[1]).toMatchObject({ type: TokenType.IN });
      expect(tokens[2]).toMatchObject({ type: TokenType.LPAREN });
      expect(tokens[3]).toMatchObject({ type: TokenType.STRING, value: 'Todo' });
      expect(tokens[4]).toMatchObject({ type: TokenType.COMMA });
      expect(tokens[5]).toMatchObject({ type: TokenType.STRING, value: 'In Progress' });
      expect(tokens[6]).toMatchObject({ type: TokenType.COMMA });
      expect(tokens[7]).toMatchObject({ type: TokenType.STRING, value: 'Done' });
      expect(tokens[8]).toMatchObject({ type: TokenType.RPAREN });
    });

    it('should tokenize NOT IN clause', () => {
      const tokenizer = new DartQLTokenizer("status NOT IN ('Archived')");
      const tokens = tokenizer.tokenize();

      expect(tokens[1]).toMatchObject({ type: TokenType.NOT });
      expect(tokens[2]).toMatchObject({ type: TokenType.IN });
    });
  });

  describe('Complex Expressions', () => {
    it('should tokenize complex WHERE clause', () => {
      const tokenizer = new DartQLTokenizer(
        "status = 'Todo' AND priority >= 3 AND (assignee = 'user1' OR assignee IS NULL)"
      );
      const tokens = tokenizer.tokenize();

      expect(tokens.length).toBeGreaterThan(10);
      expect(tokens.filter(t => t.type === TokenType.AND)).toHaveLength(2);
      expect(tokens.filter(t => t.type === TokenType.OR)).toHaveLength(1);
    });

    it('should tokenize BETWEEN clause', () => {
      const tokenizer = new DartQLTokenizer('created_at BETWEEN "2026-01-01" AND "2026-12-31"');
      const tokens = tokenizer.tokenize();

      expect(tokens[1]).toMatchObject({ type: TokenType.BETWEEN });
      expect(tokens[2]).toMatchObject({ type: TokenType.STRING, value: '2026-01-01' });
      expect(tokens[3]).toMatchObject({ type: TokenType.AND });
      expect(tokens[4]).toMatchObject({ type: TokenType.STRING, value: '2026-12-31' });
    });
  });

  describe('Whitespace Handling', () => {
    it('should handle multiple spaces', () => {
      const tokenizer = new DartQLTokenizer('status    =     "Todo"');
      const tokens = tokenizer.tokenize();

      expect(tokens).toHaveLength(4); // status, =, "Todo", EOF
    });

    it('should handle leading and trailing whitespace', () => {
      const tokenizer = new DartQLTokenizer('   status = "Todo"   ');
      const tokens = tokenizer.tokenize();

      expect(tokens).toHaveLength(4);
    });

    it('should handle tabs and newlines', () => {
      const tokenizer = new DartQLTokenizer('status\t=\n"Todo"');
      const tokens = tokenizer.tokenize();

      expect(tokens).toHaveLength(4);
    });
  });

  describe('Error Handling', () => {
    it('should throw error for unexpected characters', () => {
      const tokenizer = new DartQLTokenizer('status = @invalid');

      expect(() => tokenizer.tokenize()).toThrow(DartQLParseError);
      expect(() => tokenizer.tokenize()).toThrow(/Unexpected character/);
    });
  });

  describe('Position Tracking', () => {
    it('should track token positions correctly', () => {
      const tokenizer = new DartQLTokenizer('status = "Todo"');
      const tokens = tokenizer.tokenize();

      expect(tokens[0].position).toBe(0); // 'status' starts at 0
      expect(tokens[1].position).toBe(7); // '=' starts at 7
      expect(tokens[2].position).toBe(9); // '"Todo"' starts at 9
    });
  });
});

// ============================================================================
// Lexer Tests (Field Validation and Fuzzy Matching)
// ============================================================================

describe('DartQLLexer', () => {
  describe('Field Validation', () => {
    it('should validate known field names', () => {
      const tokenizer = new DartQLTokenizer('status = "Todo" AND priority >= 3');
      const tokens = tokenizer.tokenize();
      const lexer = new DartQLLexer(tokens);
      const result = lexer.analyze();

      expect(result.errors).toHaveLength(0);
      expect(result.fields).toContain('status');
      expect(result.fields).toContain('priority');
    });

    it('should report unknown field names', () => {
      const tokenizer = new DartQLTokenizer('invalid_field = "test"');
      const tokens = tokenizer.tokenize();
      const lexer = new DartQLLexer(tokens);
      const result = lexer.analyze();

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Unknown field');
      expect(result.errors[0]).toContain('invalid_field');
    });

    it('should validate all valid fields', () => {
      for (const field of VALID_FIELDS) {
        const tokenizer = new DartQLTokenizer(`${field} = "test"`);
        const tokens = tokenizer.tokenize();
        const lexer = new DartQLLexer(tokens);
        const result = lexer.analyze();

        expect(result.errors).toHaveLength(0);
      }
    });
  });

  describe('Fuzzy Matching (Typo Suggestions)', () => {
    it('should suggest "priority" for "priorty" typo', () => {
      const tokenizer = new DartQLTokenizer('priorty = 3');
      const tokens = tokenizer.tokenize();
      const lexer = new DartQLLexer(tokens);
      const result = lexer.analyze();

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Did you mean');
      expect(result.errors[0]).toContain('priority');
    });

    it('should suggest "status" for "satus" typo', () => {
      const tokenizer = new DartQLTokenizer('satus = "Todo"');
      const tokens = tokenizer.tokenize();
      const lexer = new DartQLLexer(tokens);
      const result = lexer.analyze();

      expect(result.errors[0]).toContain('status');
    });

    it('should suggest "assignee" for "asignee" typo', () => {
      const tokenizer = new DartQLTokenizer('asignee = "user1"');
      const tokens = tokenizer.tokenize();
      const lexer = new DartQLLexer(tokens);
      const result = lexer.analyze();

      expect(result.errors[0]).toContain('assignee');
    });

    it('should suggest "dartboard" for "darboard" typo', () => {
      const tokenizer = new DartQLTokenizer('darboard = "board1"');
      const tokens = tokenizer.tokenize();
      const lexer = new DartQLLexer(tokens);
      const result = lexer.analyze();

      expect(result.errors[0]).toContain('dartboard');
    });

    it('should not suggest for completely unrelated words', () => {
      const tokenizer = new DartQLTokenizer('completely_wrong = "test"');
      const tokens = tokenizer.tokenize();
      const lexer = new DartQLLexer(tokens);
      const result = lexer.analyze();

      expect(result.errors[0]).toContain('Valid fields:');
      expect(result.errors[0]).not.toContain('Did you mean');
    });
  });

  describe('Field Extraction', () => {
    it('should extract all referenced fields', () => {
      const tokenizer = new DartQLTokenizer('status = "Todo" AND priority >= 3 AND title LIKE "%bug%"');
      const tokens = tokenizer.tokenize();
      const lexer = new DartQLLexer(tokens);
      const result = lexer.analyze();

      expect(result.fields).toContain('status');
      expect(result.fields).toContain('priority');
      expect(result.fields).toContain('title');
      expect(result.fields).toHaveLength(3);
    });

    it('should not duplicate fields', () => {
      const tokenizer = new DartQLTokenizer('status = "Todo" OR status = "Done"');
      const tokens = tokenizer.tokenize();
      const lexer = new DartQLLexer(tokens);
      const result = lexer.analyze();

      expect(result.fields).toContain('status');
      expect(result.fields).toHaveLength(1);
    });
  });

  describe('IS NULL Validation', () => {
    it('should validate IS NULL syntax', () => {
      const tokenizer = new DartQLTokenizer('due_at IS NULL');
      const tokens = tokenizer.tokenize();
      const lexer = new DartQLLexer(tokens);
      const result = lexer.analyze();

      expect(result.errors).toHaveLength(0);
    });

    it('should validate IS NOT NULL syntax', () => {
      const tokenizer = new DartQLTokenizer('assignee IS NOT NULL');
      const tokens = tokenizer.tokenize();
      const lexer = new DartQLLexer(tokens);
      const result = lexer.analyze();

      expect(result.errors).toHaveLength(0);
    });
  });
});

// ============================================================================
// Integration Tests (parseDartQL function)
// ============================================================================

describe('parseDartQL', () => {
  describe('Valid Queries', () => {
    it('should parse simple equality', () => {
      const result = parseDartQL('status = "Todo"');

      expect(result.errors).toHaveLength(0);
      expect(result.tokens.length).toBeGreaterThan(0);
      expect(result.fields).toContain('status');
    });

    it('should parse complex queries from design spec examples', () => {
      const examples = [
        "status = 'In Progress' AND priority >= 3",
        "assignee IN ('user1', 'user2') AND dartboard = 'board1'",
        "tags CONTAINS 'urgent' AND due_at < '2026-02-01'",
        "(status = 'Todo' OR status = 'In Progress') AND NOT (priority = 1)",
      ];

      for (const example of examples) {
        const result = parseDartQL(example);
        expect(result.errors).toHaveLength(0);
        expect(result.tokens.length).toBeGreaterThan(0);
      }
    });

    it('should parse BETWEEN queries', () => {
      const result = parseDartQL("created_at BETWEEN '2026-01-01' AND '2026-01-31'");

      expect(result.errors).toHaveLength(0);
      expect(result.fields).toContain('created_at');
    });

    it('should parse LIKE queries', () => {
      const result = parseDartQL("title LIKE '%bug%'");

      expect(result.errors).toHaveLength(0);
      expect(result.fields).toContain('title');
    });

    it('should parse IS NULL queries', () => {
      const result = parseDartQL('parent_task IS NULL');

      expect(result.errors).toHaveLength(0);
      expect(result.fields).toContain('parent_task');
    });
  });

  describe('Invalid Queries', () => {
    it('should report errors for invalid field names', () => {
      const result = parseDartQL('invalid_field = "test"');

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Unknown field');
    });

    it('should report errors with typo suggestions', () => {
      const result = parseDartQL('priorty >= 3');

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('priority');
    });

    it('should handle unterminated strings gracefully', () => {
      const result = parseDartQL('status = "unterminated');

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Unterminated string');
    });

    it('should handle unexpected characters gracefully', () => {
      const result = parseDartQL('status = @invalid');

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Unexpected character');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty input', () => {
      const result = parseDartQL('');

      expect(result.tokens).toHaveLength(1); // Just EOF
      expect(result.fields).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle whitespace-only input', () => {
      const result = parseDartQL('   \t\n  ');

      expect(result.tokens).toHaveLength(1); // Just EOF
      expect(result.fields).toHaveLength(0);
    });

    it('should handle mixed case field names', () => {
      const result = parseDartQL('Status = "Todo"');

      expect(result.errors).toHaveLength(0);
      expect(result.fields).toContain('status'); // Normalized to lowercase
    });

    it('should handle very long strings', () => {
      const longString = 'a'.repeat(1000);
      const result = parseDartQL(`description = "${longString}"`);

      expect(result.errors).toHaveLength(0);
      expect(result.tokens[2].value).toBe(longString);
    });

    it('should handle multiple errors in one query', () => {
      const result = parseDartQL('invalid1 = "test" AND invalid2 = 123');

      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Real-World Scenarios', () => {
    it('should parse query for high-priority tasks', () => {
      const result = parseDartQL("priority >= 4 AND status != 'Done'");

      expect(result.errors).toHaveLength(0);
      expect(result.fields).toContain('priority');
      expect(result.fields).toContain('status');
    });

    it('should parse query for overdue tasks', () => {
      const result = parseDartQL("due_at < '2026-01-18' AND status != 'Done'");

      expect(result.errors).toHaveLength(0);
      expect(result.fields).toContain('due_at');
      expect(result.fields).toContain('status');
    });

    it('should parse query for unassigned urgent tasks', () => {
      const result = parseDartQL("assignee IS NULL AND tags CONTAINS 'urgent'");

      expect(result.errors).toHaveLength(0);
      expect(result.fields).toContain('assignee');
      expect(result.fields).toContain('tags');
    });

    it('should parse query for tasks in specific dartboards', () => {
      const result = parseDartQL("dartboard IN ('board1', 'board2') AND priority >= 3");

      expect(result.errors).toHaveLength(0);
      expect(result.fields).toContain('dartboard');
      expect(result.fields).toContain('priority');
    });
  });
});

// ============================================================================
// AST Parser Tests
// ============================================================================

describe('DartQLParser (AST Builder)', () => {
  describe('Simple Comparisons', () => {
    it('should parse simple equality comparison', () => {
      const result = parseDartQLToAST('status = "Todo"');

      expect(result.errors).toHaveLength(0);
      expect(result.ast.type).toBe('comparison');
      expect(result.ast.field).toBe('status');
      expect(result.ast.operator).toBe('=');
      expect(result.ast.value).toBe('Todo');
      expect(result.fields).toContain('status');
    });

    it('should parse numeric comparison', () => {
      const result = parseDartQLToAST('priority >= 3');

      expect(result.errors).toHaveLength(0);
      expect(result.ast.type).toBe('comparison');
      expect(result.ast.field).toBe('priority');
      expect(result.ast.operator).toBe('>=');
      expect(result.ast.value).toBe(3);
    });

    it('should parse all comparison operators', () => {
      const tests = [
        { query: 'priority = 5', op: '=' },
        { query: 'priority != 5', op: '!=' },
        { query: 'priority > 5', op: '>' },
        { query: 'priority >= 5', op: '>=' },
        { query: 'priority < 5', op: '<' },
        { query: 'priority <= 5', op: '<=' },
        { query: 'title LIKE "%bug%"', op: 'LIKE' },
        { query: 'tags CONTAINS "urgent"', op: 'CONTAINS' },
      ];

      for (const test of tests) {
        const result = parseDartQLToAST(test.query);
        expect(result.errors).toHaveLength(0);
        expect(result.ast.operator).toBe(test.op);
      }
    });

    it('should parse decimal numbers', () => {
      const result = parseDartQLToAST('size >= 3.5');

      expect(result.errors).toHaveLength(0);
      expect(result.ast.value).toBe(3.5);
    });
  });

  describe('Logical Operators', () => {
    it('should parse AND expression', () => {
      const result = parseDartQLToAST('status = "Todo" AND priority >= 3');

      expect(result.errors).toHaveLength(0);
      expect(result.ast.type).toBe('logical');
      expect(result.ast.operator).toBe('AND');
      expect(result.ast.left?.type).toBe('comparison');
      expect(result.ast.right?.type).toBe('comparison');
      expect(result.fields).toContain('status');
      expect(result.fields).toContain('priority');
    });

    it('should parse OR expression', () => {
      const result = parseDartQLToAST('status = "Todo" OR status = "In Progress"');

      expect(result.errors).toHaveLength(0);
      expect(result.ast.type).toBe('logical');
      expect(result.ast.operator).toBe('OR');
      expect(result.ast.left?.type).toBe('comparison');
      expect(result.ast.right?.type).toBe('comparison');
    });

    it('should parse NOT expression', () => {
      const result = parseDartQLToAST('NOT (priority = 1)');

      expect(result.errors).toHaveLength(0);
      expect(result.ast.type).toBe('logical');
      expect(result.ast.operator).toBe('NOT');
      expect(result.ast.right?.type).toBe('group');
    });
  });

  describe('Operator Precedence (NOT > AND > OR)', () => {
    it('should handle OR with lower precedence than AND', () => {
      const result = parseDartQLToAST('priority = 1 OR size = 2 AND tags = "test"');

      // Should parse as: priority = 1 OR (size = 2 AND tags = "test")
      expect(result.errors).toHaveLength(0);
      expect(result.ast.type).toBe('logical');
      expect(result.ast.operator).toBe('OR');
      expect(result.ast.left?.field).toBe('priority');
      expect(result.ast.right?.type).toBe('logical');
      expect(result.ast.right?.operator).toBe('AND');
    });

    it('should handle AND with higher precedence than OR', () => {
      const result = parseDartQLToAST('priority = 1 AND size = 2 OR tags = "test"');

      // Should parse as: (priority = 1 AND size = 2) OR tags = "test"
      expect(result.errors).toHaveLength(0);
      expect(result.ast.type).toBe('logical');
      expect(result.ast.operator).toBe('OR');
      expect(result.ast.left?.type).toBe('logical');
      expect(result.ast.left?.operator).toBe('AND');
      expect(result.ast.right?.field).toBe('tags');
    });

    it('should handle NOT with highest precedence', () => {
      const result = parseDartQLToAST('NOT priority = 1 AND size = 2');

      // Should parse as: (NOT (priority = 1)) AND size = 2
      expect(result.errors).toHaveLength(0);
      expect(result.ast.type).toBe('logical');
      expect(result.ast.operator).toBe('AND');
      expect(result.ast.left?.type).toBe('logical');
      expect(result.ast.left?.operator).toBe('NOT');
      expect(result.ast.right?.field).toBe('size');
    });

    it('should handle multiple ANDs left-to-right', () => {
      const result = parseDartQLToAST('priority = 1 AND size = 2 AND tags = "test"');

      // Should parse as: (priority = 1 AND size = 2) AND tags = "test"
      expect(result.errors).toHaveLength(0);
      expect(result.ast.type).toBe('logical');
      expect(result.ast.operator).toBe('AND');
      expect(result.ast.left?.type).toBe('logical');
      expect(result.ast.left?.operator).toBe('AND');
      expect(result.ast.right?.field).toBe('tags');
    });

    it('should handle multiple ORs left-to-right', () => {
      const result = parseDartQLToAST('priority = 1 OR size = 2 OR tags = "test"');

      // Should parse as: (priority = 1 OR size = 2) OR tags = "test"
      expect(result.errors).toHaveLength(0);
      expect(result.ast.type).toBe('logical');
      expect(result.ast.operator).toBe('OR');
      expect(result.ast.left?.type).toBe('logical');
      expect(result.ast.left?.operator).toBe('OR');
      expect(result.ast.right?.field).toBe('tags');
    });
  });

  describe('Parentheses and Grouping', () => {
    it('should parse simple grouped expression', () => {
      const result = parseDartQLToAST('(status = "Todo")');

      expect(result.errors).toHaveLength(0);
      expect(result.ast.type).toBe('group');
      expect(result.ast.expressions?.[0].type).toBe('comparison');
    });

    it('should override precedence with parentheses', () => {
      const result = parseDartQLToAST('(priority = 1 OR size = 2) AND tags = "test"');

      // Parentheses force: (priority = 1 OR size = 2) AND tags = "test"
      expect(result.errors).toHaveLength(0);
      expect(result.ast.type).toBe('logical');
      expect(result.ast.operator).toBe('AND');
      expect(result.ast.left?.type).toBe('group');
      expect(result.ast.right?.field).toBe('tags');
    });

    it('should parse nested parentheses', () => {
      const result = parseDartQLToAST('((priority = 1 AND size = 2) OR tags = "test")');

      expect(result.errors).toHaveLength(0);
      expect(result.ast.type).toBe('group');
      expect(result.ast.expressions?.[0].type).toBe('logical');
      expect(result.ast.expressions?.[0].operator).toBe('OR');
    });

    it('should parse complex nested logic', () => {
      const result = parseDartQLToAST('(priority = 1 OR size = 2) AND (tags = "test" OR status = "Todo")');

      expect(result.errors).toHaveLength(0);
      expect(result.ast.type).toBe('logical');
      expect(result.ast.operator).toBe('AND');
      expect(result.ast.left?.type).toBe('group');
      expect(result.ast.right?.type).toBe('group');
    });

    it('should parse deeply nested parentheses', () => {
      const result = parseDartQLToAST('(((priority = 1)))');

      expect(result.errors).toHaveLength(0);
      expect(result.ast.type).toBe('group');
      expect(result.ast.expressions?.[0].type).toBe('group');
      expect(result.ast.expressions?.[0].expressions?.[0].type).toBe('group');
      expect(result.ast.expressions?.[0].expressions?.[0].expressions?.[0].type).toBe('comparison');
    });
  });

  describe('Special Operators', () => {
    it('should parse IN operator with array', () => {
      const result = parseDartQLToAST('status IN ("Todo", "In Progress", "Done")');

      expect(result.errors).toHaveLength(0);
      expect(result.ast.type).toBe('comparison');
      expect(result.ast.field).toBe('status');
      expect(result.ast.operator).toBe('IN');
      expect(result.ast.value).toEqual(['Todo', 'In Progress', 'Done']);
    });

    it('should parse NOT IN operator', () => {
      const result = parseDartQLToAST('status NOT IN ("Archived")');

      expect(result.errors).toHaveLength(0);
      expect(result.ast.type).toBe('comparison');
      expect(result.ast.field).toBe('status');
      expect(result.ast.operator).toBe('NOT IN');
      expect(result.ast.value).toEqual(['Archived']);
    });

    it('should parse IS NULL operator', () => {
      const result = parseDartQLToAST('due_at IS NULL');

      expect(result.errors).toHaveLength(0);
      expect(result.ast.type).toBe('comparison');
      expect(result.ast.field).toBe('due_at');
      expect(result.ast.operator).toBe('IS NULL');
      expect(result.ast.value).toBe(null);
    });

    it('should parse IS NOT NULL operator', () => {
      const result = parseDartQLToAST('assignee IS NOT NULL');

      expect(result.errors).toHaveLength(0);
      expect(result.ast.type).toBe('comparison');
      expect(result.ast.field).toBe('assignee');
      expect(result.ast.operator).toBe('IS NOT NULL');
      expect(result.ast.value).toBe(null);
    });

    it('should parse BETWEEN operator', () => {
      const result = parseDartQLToAST('created_at BETWEEN "2026-01-01" AND "2026-12-31"');

      expect(result.errors).toHaveLength(0);
      expect(result.ast.type).toBe('comparison');
      expect(result.ast.field).toBe('created_at');
      expect(result.ast.operator).toBe('BETWEEN');
      expect(result.ast.value).toEqual(['2026-01-01', '2026-12-31']);
    });

    it('should parse BETWEEN with numbers', () => {
      const result = parseDartQLToAST('priority BETWEEN 2 AND 5');

      expect(result.errors).toHaveLength(0);
      expect(result.ast.operator).toBe('BETWEEN');
      expect(result.ast.value).toEqual([2, 5]);
    });

    it('should parse empty IN array', () => {
      const result = parseDartQLToAST('status IN ()');

      expect(result.errors).toHaveLength(0);
      expect(result.ast.value).toEqual([]);
    });
  });

  describe('Complex Queries from Design Spec', () => {
    it('should parse: status = "In Progress" AND priority >= 3', () => {
      const result = parseDartQLToAST('status = "In Progress" AND priority >= 3');

      expect(result.errors).toHaveLength(0);
      expect(result.ast.type).toBe('logical');
      expect(result.ast.operator).toBe('AND');
      expect(result.fields).toContain('status');
      expect(result.fields).toContain('priority');
    });

    it('should parse: assignee IN ("user1", "user2") AND dartboard = "board1"', () => {
      const result = parseDartQLToAST('assignee IN ("user1", "user2") AND dartboard = "board1"');

      expect(result.errors).toHaveLength(0);
      expect(result.ast.type).toBe('logical');
      expect(result.ast.left?.operator).toBe('IN');
      expect(result.ast.right?.field).toBe('dartboard');
    });

    it('should parse: tags CONTAINS "urgent" AND due_at < "2026-02-01"', () => {
      const result = parseDartQLToAST('tags CONTAINS "urgent" AND due_at < "2026-02-01"');

      expect(result.errors).toHaveLength(0);
      expect(result.ast.type).toBe('logical');
      expect(result.ast.left?.operator).toBe('CONTAINS');
      expect(result.ast.right?.operator).toBe('<');
    });

    it('should parse: (status = "Todo" OR status = "In Progress") AND NOT (priority = 1)', () => {
      const result = parseDartQLToAST('(status = "Todo" OR status = "In Progress") AND NOT (priority = 1)');

      expect(result.errors).toHaveLength(0);
      expect(result.ast.type).toBe('logical');
      expect(result.ast.operator).toBe('AND');
      expect(result.ast.left?.type).toBe('group');
      expect(result.ast.right?.type).toBe('logical');
      expect(result.ast.right?.operator).toBe('NOT');
    });

    it('should parse: created_at BETWEEN "2026-01-01" AND "2026-01-31"', () => {
      const result = parseDartQLToAST('created_at BETWEEN "2026-01-01" AND "2026-01-31"');

      expect(result.errors).toHaveLength(0);
      expect(result.ast.type).toBe('comparison');
      expect(result.ast.operator).toBe('BETWEEN');
      expect(result.ast.value).toEqual(['2026-01-01', '2026-01-31']);
    });
  });

  describe('Error Handling', () => {
    it('should report error for missing field name', () => {
      const result = parseDartQLToAST('= "Todo"');

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Expected field name');
    });

    it('should report error for missing operator', () => {
      const result = parseDartQLToAST('status "Todo"');

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Expected comparison operator');
    });

    it('should report error for missing value', () => {
      const result = parseDartQLToAST('status =');

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Expected value');
    });

    it('should report error for missing closing parenthesis', () => {
      const result = parseDartQLToAST('(status = "Todo"');

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('closing parenthesis');
    });

    it('should report error for missing opening parenthesis in IN', () => {
      const result = parseDartQLToAST('status IN "Todo", "Done")');

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('opening parenthesis');
    });

    it('should report error for invalid field name with suggestion', () => {
      const result = parseDartQLToAST('priorty = 3');

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('priority');
    });

    it('should report error for incomplete AND expression', () => {
      const result = parseDartQLToAST('status = "Todo" AND');

      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should report error for incomplete BETWEEN expression', () => {
      const result = parseDartQLToAST('priority BETWEEN 1');

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('AND');
    });

    it('should report error for empty query', () => {
      const result = parseDartQLToAST('');

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Empty query');
    });

    it('should include position information in errors', () => {
      const result = parseDartQLToAST('status = "Todo" AND invalid_field = 123');

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toMatch(/position \d+/);
    });

    it('should report error for unexpected extra tokens', () => {
      const result = parseDartQLToAST('status = "Todo" AND');

      expect(result.errors.length).toBeGreaterThan(0);
      // Should fail because AND expects another expression
    });
  });

  describe('Field Extraction', () => {
    it('should extract all fields from complex query', () => {
      const result = parseDartQLToAST(
        'status = "Todo" AND priority >= 3 AND (assignee = "user1" OR dartboard = "board1")'
      );

      expect(result.errors).toHaveLength(0);
      expect(result.fields).toContain('status');
      expect(result.fields).toContain('priority');
      expect(result.fields).toContain('assignee');
      expect(result.fields).toContain('dartboard');
      expect(result.fields).toHaveLength(4);
    });

    it('should normalize field names to lowercase', () => {
      const result = parseDartQLToAST('Status = "Todo" AND PRIORITY >= 3');

      expect(result.errors).toHaveLength(0);
      expect(result.fields).toContain('status');
      expect(result.fields).toContain('priority');
    });

    it('should not duplicate fields', () => {
      const result = parseDartQLToAST('status = "Todo" OR status = "Done" OR status = "In Progress"');

      expect(result.errors).toHaveLength(0);
      expect(result.fields).toContain('status');
      expect(result.fields).toHaveLength(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle single comparison without logical operators', () => {
      const result = parseDartQLToAST('priority = 5');

      expect(result.errors).toHaveLength(0);
      expect(result.ast.type).toBe('comparison');
    });

    it('should handle long chains of AND', () => {
      const result = parseDartQLToAST('priority = 1 AND size = 2 AND tags = "test" AND status = "Todo" AND dartboard = "board1"');

      expect(result.errors).toHaveLength(0);
      expect(result.fields).toHaveLength(5);
    });

    it('should handle long chains of OR', () => {
      const result = parseDartQLToAST('priority = 1 OR size = 2 OR tags = "test" OR status = "Todo"');

      expect(result.errors).toHaveLength(0);
      expect(result.fields).toHaveLength(4);
    });

    it('should handle multiple NOT operators', () => {
      const result = parseDartQLToAST('NOT NOT (priority = 1)');

      expect(result.errors).toHaveLength(0);
      expect(result.ast.type).toBe('logical');
      expect(result.ast.operator).toBe('NOT');
      expect(result.ast.right?.type).toBe('logical');
      expect(result.ast.right?.operator).toBe('NOT');
    });

    it('should handle mixed string quote types', () => {
      const result = parseDartQLToAST('status = "Todo" AND title = \'Fix bug\'');

      expect(result.errors).toHaveLength(0);
      expect(result.ast.type).toBe('logical');
    });

    it('should handle IN with single value', () => {
      const result = parseDartQLToAST('status IN ("Todo")');

      expect(result.errors).toHaveLength(0);
      expect(result.ast.value).toEqual(['Todo']);
    });

    it('should handle IN with numbers', () => {
      const result = parseDartQLToAST('priority IN (1, 2, 3, 4, 5)');

      expect(result.errors).toHaveLength(0);
      expect(result.ast.value).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('Real-World Scenarios', () => {
    it('should parse query for high-priority unfinished tasks', () => {
      const result = parseDartQLToAST('priority >= 4 AND status != "Done" AND status != "Archived"');

      expect(result.errors).toHaveLength(0);
      expect(result.ast.type).toBe('logical');
      expect(result.fields).toContain('priority');
      expect(result.fields).toContain('status');
    });

    it('should parse query for overdue tasks', () => {
      const result = parseDartQLToAST('due_at < "2026-01-18" AND status != "Done"');

      expect(result.errors).toHaveLength(0);
      expect(result.fields).toContain('due_at');
      expect(result.fields).toContain('status');
    });

    it('should parse query for unassigned urgent tasks', () => {
      const result = parseDartQLToAST('assignee IS NULL AND tags CONTAINS "urgent" AND priority >= 3');

      expect(result.errors).toHaveLength(0);
      expect(result.ast.left?.left?.operator).toBe('IS NULL');
      expect(result.fields).toContain('assignee');
      expect(result.fields).toContain('tags');
      expect(result.fields).toContain('priority');
    });

    it('should parse query for tasks in multiple dartboards', () => {
      const result = parseDartQLToAST('dartboard IN ("board1", "board2", "board3") AND priority >= 3');

      expect(result.errors).toHaveLength(0);
      expect(result.ast.left?.value).toEqual(['board1', 'board2', 'board3']);
    });

    it('should parse query with complex nested conditions', () => {
      const result = parseDartQLToAST(
        '(status = "Todo" OR status = "In Progress") AND (priority >= 3 OR tags CONTAINS "urgent") AND assignee IS NOT NULL'
      );

      expect(result.errors).toHaveLength(0);
      expect(result.ast.type).toBe('logical');
      expect(result.ast.operator).toBe('AND');
      expect(result.fields).toHaveLength(4); // status, priority, tags, assignee
    });
  });
});

// ============================================================================
// Converter Tests (AST to Filters)
// ============================================================================

describe('convertToFilters', () => {
  describe('API-Compatible Simple Queries', () => {
    it('should convert simple equality: status = "Todo"', () => {
      const ast = parseDartQLToAST('status = "Todo"').ast;
      const result = convertToFilters(ast);

      expect(result.errors).toHaveLength(0);
      expect(result.requiresClientSide).toBe(false);
      expect(result.apiFilters).toEqual({ status: 'Todo' });
      expect(result.clientFilter).toBeUndefined();
      expect(result.warnings).toHaveLength(0);
    });

    it('should convert assignee equality', () => {
      const ast = parseDartQLToAST('assignee = "user1"').ast;
      const result = convertToFilters(ast);

      expect(result.requiresClientSide).toBe(false);
      expect(result.apiFilters).toEqual({ assignee: 'user1' });
    });

    it('should convert dartboard equality', () => {
      const ast = parseDartQLToAST('dartboard = "board1"').ast;
      const result = convertToFilters(ast);

      expect(result.requiresClientSide).toBe(false);
      expect(result.apiFilters).toEqual({ dartboard: 'board1' });
    });

    it('should convert priority equality', () => {
      const ast = parseDartQLToAST('priority = 3').ast;
      const result = convertToFilters(ast);

      expect(result.requiresClientSide).toBe(false);
      expect(result.apiFilters).toEqual({ priority: 3 });
    });

    it('should convert tags equality to array', () => {
      const ast = parseDartQLToAST('tags = "urgent"').ast;
      const result = convertToFilters(ast);

      expect(result.requiresClientSide).toBe(false);
      expect(result.apiFilters).toEqual({ tags: ['urgent'] });
    });
  });

  describe('Range Operators on due_at', () => {
    it('should convert due_at < date to due_before', () => {
      const ast = parseDartQLToAST('due_at < "2026-02-01"').ast;
      const result = convertToFilters(ast);

      expect(result.requiresClientSide).toBe(false);
      expect(result.apiFilters).toEqual({ due_before: '2026-02-01' });
    });

    it('should convert due_at <= date to due_before', () => {
      const ast = parseDartQLToAST('due_at <= "2026-02-01"').ast;
      const result = convertToFilters(ast);

      expect(result.requiresClientSide).toBe(false);
      expect(result.apiFilters).toEqual({ due_before: '2026-02-01' });
    });

    it('should convert due_at > date to due_after', () => {
      const ast = parseDartQLToAST('due_at > "2026-01-01"').ast;
      const result = convertToFilters(ast);

      expect(result.requiresClientSide).toBe(false);
      expect(result.apiFilters).toEqual({ due_after: '2026-01-01' });
    });

    it('should convert due_at >= date to due_after', () => {
      const ast = parseDartQLToAST('due_at >= "2026-01-01"').ast;
      const result = convertToFilters(ast);

      expect(result.requiresClientSide).toBe(false);
      expect(result.apiFilters).toEqual({ due_after: '2026-01-01' });
    });
  });

  describe('AND Combinations (API Compatible)', () => {
    it('should convert status AND priority', () => {
      const ast = parseDartQLToAST('status = "Todo" AND priority = 3').ast;
      const result = convertToFilters(ast);

      expect(result.requiresClientSide).toBe(false);
      expect(result.apiFilters).toEqual({ status: 'Todo', priority: 3 });
      expect(result.warnings).toHaveLength(0);
    });

    it('should convert multiple AND conditions', () => {
      const ast = parseDartQLToAST('status = "Todo" AND priority = 3 AND assignee = "user1"').ast;
      const result = convertToFilters(ast);

      expect(result.requiresClientSide).toBe(false);
      expect(result.apiFilters).toEqual({
        status: 'Todo',
        priority: 3,
        assignee: 'user1',
      });
    });

    it('should convert status AND due_at range', () => {
      const ast = parseDartQLToAST('status = "In Progress" AND due_at < "2026-02-01"').ast;
      const result = convertToFilters(ast);

      expect(result.requiresClientSide).toBe(false);
      expect(result.apiFilters).toEqual({
        status: 'In Progress',
        due_before: '2026-02-01',
      });
    });
  });

  describe('Client-Side: IN Operator', () => {
    it('should require client-side for IN operator', () => {
      const ast = parseDartQLToAST('status IN ("Todo", "In Progress")').ast;
      const result = convertToFilters(ast);

      expect(result.requiresClientSide).toBe(true);
      expect(result.clientFilter).toBeDefined();
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('client-side filtering');
    });

    it('should correctly filter with IN operator', () => {
      const ast = parseDartQLToAST('status IN ("Todo", "Done")').ast;
      const result = convertToFilters(ast);

      expect(result.clientFilter).toBeDefined();
      if (result.clientFilter) {
        expect(result.clientFilter({ status: 'Todo' })).toBe(true);
        expect(result.clientFilter({ status: 'Done' })).toBe(true);
        expect(result.clientFilter({ status: 'In Progress' })).toBe(false);
      }
    });

    it('should correctly filter with NOT IN operator', () => {
      const ast = parseDartQLToAST('status NOT IN ("Archived")').ast;
      const result = convertToFilters(ast);

      expect(result.requiresClientSide).toBe(true);
      if (result.clientFilter) {
        expect(result.clientFilter({ status: 'Todo' })).toBe(true);
        expect(result.clientFilter({ status: 'Archived' })).toBe(false);
      }
    });
  });

  describe('Client-Side: CONTAINS and LIKE', () => {
    it('should require client-side for CONTAINS', () => {
      const ast = parseDartQLToAST('tags CONTAINS "urgent"').ast;
      const result = convertToFilters(ast);

      expect(result.requiresClientSide).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should correctly filter with CONTAINS on array', () => {
      const ast = parseDartQLToAST('tags CONTAINS "urgent"').ast;
      const result = convertToFilters(ast);

      if (result.clientFilter) {
        expect(result.clientFilter({ tags: ['urgent', 'bug'] })).toBe(true);
        expect(result.clientFilter({ tags: ['bug'] })).toBe(false);
        expect(result.clientFilter({ tags: [] })).toBe(false);
      }
    });

    it('should correctly filter with CONTAINS on string', () => {
      const ast = parseDartQLToAST('title CONTAINS "bug"').ast;
      const result = convertToFilters(ast);

      if (result.clientFilter) {
        expect(result.clientFilter({ title: 'Fix bug in login' })).toBe(true);
        expect(result.clientFilter({ title: 'Add feature' })).toBe(false);
      }
    });

    it('should correctly filter with LIKE operator', () => {
      const ast = parseDartQLToAST('title LIKE "%bug%"').ast;
      const result = convertToFilters(ast);

      expect(result.requiresClientSide).toBe(true);
      if (result.clientFilter) {
        expect(result.clientFilter({ title: 'Fix bug in system' })).toBe(true);
        expect(result.clientFilter({ title: 'debugging tools' })).toBe(true);
        expect(result.clientFilter({ title: 'Add feature' })).toBe(false);
      }
    });

    it('should handle LIKE with leading wildcard', () => {
      const ast = parseDartQLToAST('title LIKE "%bug"').ast;
      const result = convertToFilters(ast);

      if (result.clientFilter) {
        expect(result.clientFilter({ title: 'Fix the bug' })).toBe(true);
        expect(result.clientFilter({ title: 'bug fix' })).toBe(false);
      }
    });

    it('should handle LIKE with trailing wildcard', () => {
      const ast = parseDartQLToAST('title LIKE "Fix%"').ast;
      const result = convertToFilters(ast);

      if (result.clientFilter) {
        expect(result.clientFilter({ title: 'Fix bug' })).toBe(true);
        expect(result.clientFilter({ title: 'Fixed issue' })).toBe(true);
        expect(result.clientFilter({ title: 'Bug fix' })).toBe(false);
      }
    });
  });

  describe('Client-Side: IS NULL / IS NOT NULL', () => {
    it('should require client-side for IS NULL', () => {
      const ast = parseDartQLToAST('due_at IS NULL').ast;
      const result = convertToFilters(ast);

      expect(result.requiresClientSide).toBe(true);
    });

    it('should correctly filter with IS NULL', () => {
      const ast = parseDartQLToAST('parent_task IS NULL').ast;
      const result = convertToFilters(ast);

      if (result.clientFilter) {
        expect(result.clientFilter({ parent_task: null })).toBe(true);
        expect(result.clientFilter({ parent_task: undefined })).toBe(true);
        expect(result.clientFilter({ parent_task: 'task-123' })).toBe(false);
      }
    });

    it('should correctly filter with IS NOT NULL', () => {
      const ast = parseDartQLToAST('assignee IS NOT NULL').ast;
      const result = convertToFilters(ast);

      if (result.clientFilter) {
        expect(result.clientFilter({ assignee: 'user1' })).toBe(true);
        expect(result.clientFilter({ assignee: null })).toBe(false);
        expect(result.clientFilter({ assignee: undefined })).toBe(false);
      }
    });
  });

  describe('Client-Side: BETWEEN', () => {
    it('should require client-side for BETWEEN', () => {
      const ast = parseDartQLToAST('priority BETWEEN 2 AND 5').ast;
      const result = convertToFilters(ast);

      expect(result.requiresClientSide).toBe(true);
    });

    it('should correctly filter with BETWEEN on numbers', () => {
      const ast = parseDartQLToAST('priority BETWEEN 2 AND 5').ast;
      const result = convertToFilters(ast);

      if (result.clientFilter) {
        expect(result.clientFilter({ priority: 1 })).toBe(false);
        expect(result.clientFilter({ priority: 2 })).toBe(true);
        expect(result.clientFilter({ priority: 3 })).toBe(true);
        expect(result.clientFilter({ priority: 5 })).toBe(true);
        expect(result.clientFilter({ priority: 6 })).toBe(false);
      }
    });

    it('should correctly filter with BETWEEN on dates', () => {
      const ast = parseDartQLToAST('created_at BETWEEN "2026-01-01" AND "2026-01-31"').ast;
      const result = convertToFilters(ast);

      if (result.clientFilter) {
        expect(result.clientFilter({ created_at: '2026-01-15' })).toBe(true);
        expect(result.clientFilter({ created_at: '2026-01-01' })).toBe(true);
        expect(result.clientFilter({ created_at: '2026-01-31' })).toBe(true);
        expect(result.clientFilter({ created_at: '2025-12-31' })).toBe(false);
        expect(result.clientFilter({ created_at: '2026-02-01' })).toBe(false);
      }
    });
  });

  describe('Client-Side: OR Logic', () => {
    it('should require client-side for OR operator', () => {
      const ast = parseDartQLToAST('status = "Todo" OR status = "In Progress"').ast;
      const result = convertToFilters(ast);

      expect(result.requiresClientSide).toBe(true);
      expect(result.warnings.some(w => w.includes('OR logic'))).toBe(true);
    });

    it('should correctly filter with OR logic', () => {
      const ast = parseDartQLToAST('status = "Todo" OR status = "Done"').ast;
      const result = convertToFilters(ast);

      if (result.clientFilter) {
        expect(result.clientFilter({ status: 'Todo' })).toBe(true);
        expect(result.clientFilter({ status: 'Done' })).toBe(true);
        expect(result.clientFilter({ status: 'In Progress' })).toBe(false);
      }
    });

    it('should correctly filter with complex OR', () => {
      const ast = parseDartQLToAST('priority = 5 OR tags CONTAINS "urgent"').ast;
      const result = convertToFilters(ast);

      if (result.clientFilter) {
        expect(result.clientFilter({ priority: 5, tags: [] })).toBe(true);
        expect(result.clientFilter({ priority: 3, tags: ['urgent'] })).toBe(true);
        expect(result.clientFilter({ priority: 3, tags: ['normal'] })).toBe(false);
      }
    });
  });

  describe('Client-Side: NOT Logic', () => {
    it('should require client-side for NOT operator', () => {
      const ast = parseDartQLToAST('NOT (priority = 1)').ast;
      const result = convertToFilters(ast);

      expect(result.requiresClientSide).toBe(true);
      expect(result.warnings.some(w => w.includes('NOT logic'))).toBe(true);
    });

    it('should correctly filter with NOT logic', () => {
      const ast = parseDartQLToAST('NOT (status = "Done")').ast;
      const result = convertToFilters(ast);

      if (result.clientFilter) {
        expect(result.clientFilter({ status: 'Todo' })).toBe(true);
        expect(result.clientFilter({ status: 'Done' })).toBe(false);
      }
    });

    it('should correctly filter with double NOT', () => {
      const ast = parseDartQLToAST('NOT NOT (priority = 3)').ast;
      const result = convertToFilters(ast);

      if (result.clientFilter) {
        expect(result.clientFilter({ priority: 3 })).toBe(true);
        expect(result.clientFilter({ priority: 5 })).toBe(false);
      }
    });
  });

  describe('Client-Side: != Operator', () => {
    it('should require client-side for != operator', () => {
      const ast = parseDartQLToAST('status != "Done"').ast;
      const result = convertToFilters(ast);

      expect(result.requiresClientSide).toBe(true);
      expect(result.warnings.some(w => w.includes('!='))).toBe(true);
    });

    it('should correctly filter with != operator', () => {
      const ast = parseDartQLToAST('status != "Archived"').ast;
      const result = convertToFilters(ast);

      if (result.clientFilter) {
        expect(result.clientFilter({ status: 'Todo' })).toBe(true);
        expect(result.clientFilter({ status: 'Archived' })).toBe(false);
      }
    });
  });

  describe('Client-Side: Range on Priority', () => {
    it('should require client-side for priority >= 3', () => {
      const ast = parseDartQLToAST('priority >= 3').ast;
      const result = convertToFilters(ast);

      expect(result.requiresClientSide).toBe(true);
      expect(result.warnings.some(w => w.includes('priority'))).toBe(true);
    });

    it('should correctly filter with priority >= 3', () => {
      const ast = parseDartQLToAST('priority >= 3').ast;
      const result = convertToFilters(ast);

      if (result.clientFilter) {
        expect(result.clientFilter({ priority: 1 })).toBe(false);
        expect(result.clientFilter({ priority: 3 })).toBe(true);
        expect(result.clientFilter({ priority: 5 })).toBe(true);
      }
    });

    it('should correctly filter with priority < 3', () => {
      const ast = parseDartQLToAST('priority < 3').ast;
      const result = convertToFilters(ast);

      if (result.clientFilter) {
        expect(result.clientFilter({ priority: 1 })).toBe(true);
        expect(result.clientFilter({ priority: 2 })).toBe(true);
        expect(result.clientFilter({ priority: 3 })).toBe(false);
      }
    });
  });

  describe('Complex Client-Side Queries', () => {
    it('should handle (status = "Todo" OR status = "In Progress") AND priority >= 3', () => {
      const ast = parseDartQLToAST('(status = "Todo" OR status = "In Progress") AND priority >= 3').ast;
      const result = convertToFilters(ast);

      expect(result.requiresClientSide).toBe(true);

      if (result.clientFilter) {
        expect(result.clientFilter({ status: 'Todo', priority: 5 })).toBe(true);
        expect(result.clientFilter({ status: 'In Progress', priority: 3 })).toBe(true);
        expect(result.clientFilter({ status: 'Done', priority: 5 })).toBe(false);
        expect(result.clientFilter({ status: 'Todo', priority: 1 })).toBe(false);
      }
    });

    it('should handle nested AND/OR with NOT', () => {
      const ast = parseDartQLToAST('status = "Todo" AND NOT (priority = 1 OR priority = 2)').ast;
      const result = convertToFilters(ast);

      expect(result.requiresClientSide).toBe(true);

      if (result.clientFilter) {
        expect(result.clientFilter({ status: 'Todo', priority: 3 })).toBe(true);
        expect(result.clientFilter({ status: 'Todo', priority: 1 })).toBe(false);
        expect(result.clientFilter({ status: 'Done', priority: 3 })).toBe(false);
      }
    });
  });

  describe('Performance Warnings', () => {
    it('should include performance warning for client-side filtering', () => {
      const ast = parseDartQLToAST('status IN ("Todo", "Done")').ast;
      const result = convertToFilters(ast);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('performance');
    });

    it('should include specific reason warnings', () => {
      const ast = parseDartQLToAST('status = "Todo" OR priority >= 3').ast;
      const result = convertToFilters(ast);

      expect(result.warnings.length).toBeGreaterThan(1);
      expect(result.warnings.some(w => w.includes('OR logic'))).toBe(true);
    });

    it('should not have warnings for API-compatible queries', () => {
      const ast = parseDartQLToAST('status = "Todo" AND priority = 3').ast;
      const result = convertToFilters(ast);

      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty group expression', () => {
      const ast = { type: 'group' as const, expressions: [] };
      const result = convertToFilters(ast);

      expect(result.errors).toHaveLength(0);
    });

    it('should handle task object with missing fields', () => {
      const ast = parseDartQLToAST('status = "Todo"').ast;
      const result = convertToFilters(ast);

      if (result.clientFilter) {
        expect(result.clientFilter({})).toBe(false);
        expect(result.clientFilter({ status: undefined })).toBe(false);
      }
    });

    it('should handle non-object task input', () => {
      const ast = parseDartQLToAST('status = "Todo"').ast;
      const result = convertToFilters(ast);

      if (result.clientFilter) {
        expect(result.clientFilter(null)).toBe(false);
        expect(result.clientFilter(undefined)).toBe(false);
        expect(result.clientFilter('not an object')).toBe(false);
        expect(result.clientFilter(123)).toBe(false);
      }
    });

    it('should handle expressions with missing field names', () => {
      const ast = { type: 'comparison' as const, operator: '=' as const, value: 'test' };
      const result = convertToFilters(ast);

      if (result.clientFilter) {
        expect(result.clientFilter({ status: 'test' })).toBe(false);
      }
    });
  });

  describe('Real-World Scenarios', () => {
    it('should handle: high-priority unfinished tasks', () => {
      const ast = parseDartQLToAST('priority >= 4 AND status != "Done"').ast;
      const result = convertToFilters(ast);

      expect(result.requiresClientSide).toBe(true);

      if (result.clientFilter) {
        expect(result.clientFilter({ priority: 5, status: 'Todo' })).toBe(true);
        expect(result.clientFilter({ priority: 4, status: 'In Progress' })).toBe(true);
        expect(result.clientFilter({ priority: 3, status: 'Todo' })).toBe(false);
        expect(result.clientFilter({ priority: 5, status: 'Done' })).toBe(false);
      }
    });

    it('should handle: overdue tasks', () => {
      const ast = parseDartQLToAST('due_at < "2026-01-18" AND status != "Done"').ast;
      const result = convertToFilters(ast);

      // Mixed: due_at < is API-compatible, status != is not
      expect(result.requiresClientSide).toBe(true);
    });

    it('should handle: unassigned urgent tasks', () => {
      const ast = parseDartQLToAST('assignee IS NULL AND tags CONTAINS "urgent"').ast;
      const result = convertToFilters(ast);

      expect(result.requiresClientSide).toBe(true);

      if (result.clientFilter) {
        expect(result.clientFilter({ assignee: null, tags: ['urgent', 'bug'] })).toBe(true);
        expect(result.clientFilter({ assignee: 'user1', tags: ['urgent'] })).toBe(false);
        expect(result.clientFilter({ assignee: null, tags: ['normal'] })).toBe(false);
      }
    });

    it('should handle: tasks in multiple dartboards (client-side fallback)', () => {
      const ast = parseDartQLToAST('dartboard IN ("board1", "board2") AND priority >= 3').ast;
      const result = convertToFilters(ast);

      expect(result.requiresClientSide).toBe(true);

      if (result.clientFilter) {
        expect(result.clientFilter({ dartboard: 'board1', priority: 5 })).toBe(true);
        expect(result.clientFilter({ dartboard: 'board2', priority: 3 })).toBe(true);
        expect(result.clientFilter({ dartboard: 'board3', priority: 5 })).toBe(false);
        expect(result.clientFilter({ dartboard: 'board1', priority: 1 })).toBe(false);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle conversion errors gracefully', () => {
      // Create an invalid AST structure
      const invalidAST = { type: 'unknown' as any };
      const result = convertToFilters(invalidAST);

      // Should not throw, but may have empty filters
      expect(result.errors).toHaveLength(0);
      expect(result.apiFilters).toEqual({});
    });
  });

  describe('Adversarial Edge Cases', () => {
    it('should handle LIKE with regex special characters', () => {
      const ast = parseDartQLToAST('title LIKE "bug.fix"').ast;
      const result = convertToFilters(ast);

      if (result.clientFilter) {
        // Dot should be literal, not regex wildcard
        expect(result.clientFilter({ title: 'bug.fix' })).toBe(true);
        expect(result.clientFilter({ title: 'bug-fix' })).toBe(false);
        expect(result.clientFilter({ title: 'bugafix' })).toBe(false);
      }
    });

    it('should handle LIKE with parentheses and brackets', () => {
      const ast = parseDartQLToAST('title LIKE "fix(bug)"').ast;
      const result = convertToFilters(ast);

      if (result.clientFilter) {
        expect(result.clientFilter({ title: 'fix(bug)' })).toBe(true);
        expect(result.clientFilter({ title: 'fixbug' })).toBe(false);
      }
    });

    it('should handle LIKE underscore as single character wildcard', () => {
      const ast = parseDartQLToAST('title LIKE "bug_fix"').ast;
      const result = convertToFilters(ast);

      if (result.clientFilter) {
        expect(result.clientFilter({ title: 'bug-fix' })).toBe(true);
        expect(result.clientFilter({ title: 'bug.fix' })).toBe(true);
        expect(result.clientFilter({ title: 'bug fix' })).toBe(true);
        expect(result.clientFilter({ title: 'bugfix' })).toBe(false); // too short
        expect(result.clientFilter({ title: 'bug--fix' })).toBe(false); // too long
      }
    });

    it('should handle LIKE case-insensitively (SQL standard)', () => {
      const ast = parseDartQLToAST('title LIKE "%BUG%"').ast;
      const result = convertToFilters(ast);

      if (result.clientFilter) {
        expect(result.clientFilter({ title: 'Fix bug in code' })).toBe(true);
        expect(result.clientFilter({ title: 'FIX BUG IN CODE' })).toBe(true);
        expect(result.clientFilter({ title: 'Fix Bug In Code' })).toBe(true);
      }
    });

    it('should handle null values in API filter extraction', () => {
      const ast = {
        type: 'comparison' as const,
        field: 'status',
        operator: '=' as const,
        value: null
      };
      const result = convertToFilters(ast);

      expect(result.apiFilters.status).toBe('');
    });

    it('should handle NaN in priority filter extraction', () => {
      const ast = {
        type: 'comparison' as const,
        field: 'priority',
        operator: '=' as const,
        value: 'not-a-number'
      };
      const result = convertToFilters(ast);

      expect(result.apiFilters.priority).toBe(0);
    });

    it('should handle mixed AND with API and client-side filters', () => {
      // status = "Todo" is API-compatible, status != "Done" is not
      const ast = parseDartQLToAST('status = "Todo" AND priority >= 3').ast;
      const result = convertToFilters(ast);

      // priority >= requires client-side
      expect(result.requiresClientSide).toBe(true);
    });

    it('should handle empty BETWEEN array edge case', () => {
      const ast = {
        type: 'comparison' as const,
        field: 'priority',
        operator: 'BETWEEN' as const,
        value: []
      };
      const result = convertToFilters(ast);

      if (result.clientFilter) {
        expect(result.clientFilter({ priority: 3 })).toBe(false);
      }
    });

    it('should handle BETWEEN with mismatched types', () => {
      const ast = {
        type: 'comparison' as const,
        field: 'priority',
        operator: 'BETWEEN' as const,
        value: ['string', 5]
      };
      const result = convertToFilters(ast);

      if (result.clientFilter) {
        expect(result.clientFilter({ priority: 3 })).toBe(false);
      }
    });

    it('should handle AND with missing left side', () => {
      const ast = {
        type: 'logical' as const,
        operator: 'AND' as const,
        right: { type: 'comparison' as const, field: 'status', operator: '=' as const, value: 'Todo' }
      };
      const result = convertToFilters(ast);

      if (result.clientFilter) {
        expect(result.clientFilter({ status: 'Todo' })).toBe(false);
      }
    });

    it('should handle OR with missing right side', () => {
      const ast = {
        type: 'logical' as const,
        operator: 'OR' as const,
        left: { type: 'comparison' as const, field: 'status', operator: '=' as const, value: 'Todo' }
      };
      const result = convertToFilters(ast);

      if (result.clientFilter) {
        expect(result.clientFilter({ status: 'Todo' })).toBe(true);
        expect(result.clientFilter({ status: 'Done' })).toBe(false);
      }
    });

    it('should handle group with multiple expressions', () => {
      const ast = {
        type: 'group' as const,
        expressions: [
          { type: 'comparison' as const, field: 'status', operator: '=' as const, value: 'Todo' },
          { type: 'comparison' as const, field: 'priority', operator: '=' as const, value: 3 }
        ]
      };
      const result = convertToFilters(ast);

      // Group only evaluates first expression
      if (result.clientFilter) {
        expect(result.clientFilter({ status: 'Todo', priority: 5 })).toBe(true);
        expect(result.clientFilter({ status: 'Done', priority: 3 })).toBe(false);
      }
    });
  });
});

// ============================================================================
// Relationship Field Tests
// ============================================================================

describe('DartQL Relationship Fields', () => {
  describe('Field Validation', () => {
    it('should recognize subtask_ids as valid field', () => {
      const result = parseDartQL('subtask_ids IS NOT NULL');

      expect(result.errors).toHaveLength(0);
      expect(result.fields).toContain('subtask_ids');
    });

    it('should recognize blocker_ids as valid field', () => {
      const result = parseDartQL('blocker_ids CONTAINS "task-abc123"');

      expect(result.errors).toHaveLength(0);
      expect(result.fields).toContain('blocker_ids');
    });

    it('should recognize blocking_ids as valid field', () => {
      const result = parseDartQL('blocking_ids IS NULL');

      expect(result.errors).toHaveLength(0);
      expect(result.fields).toContain('blocking_ids');
    });

    it('should recognize duplicate_ids as valid field', () => {
      const result = parseDartQL('duplicate_ids IS NOT NULL');

      expect(result.errors).toHaveLength(0);
      expect(result.fields).toContain('duplicate_ids');
    });

    it('should recognize related_ids as valid field', () => {
      const result = parseDartQL('related_ids CONTAINS "task-xyz789"');

      expect(result.errors).toHaveLength(0);
      expect(result.fields).toContain('related_ids');
    });

    it('should recognize parent_task as valid field', () => {
      const result = parseDartQL('parent_task IS NULL');

      expect(result.errors).toHaveLength(0);
      expect(result.fields).toContain('parent_task');
    });

    it('should validate all relationship fields in complex query', () => {
      const result = parseDartQL(
        'subtask_ids IS NOT NULL AND blocker_ids CONTAINS "task-1" AND parent_task IS NULL'
      );

      expect(result.errors).toHaveLength(0);
      expect(result.fields).toContain('subtask_ids');
      expect(result.fields).toContain('blocker_ids');
      expect(result.fields).toContain('parent_task');
    });
  });

  describe('AST Parsing', () => {
    it('should parse: blocker_ids CONTAINS "task-abc123"', () => {
      const result = parseDartQLToAST('blocker_ids CONTAINS "task-abc123"');

      expect(result.errors).toHaveLength(0);
      expect(result.ast.type).toBe('comparison');
      expect(result.ast.field).toBe('blocker_ids');
      expect(result.ast.operator).toBe('CONTAINS');
      expect(result.ast.value).toBe('task-abc123');
    });

    it('should parse: subtask_ids IS NOT NULL (has subtasks)', () => {
      const result = parseDartQLToAST('subtask_ids IS NOT NULL');

      expect(result.errors).toHaveLength(0);
      expect(result.ast.type).toBe('comparison');
      expect(result.ast.field).toBe('subtask_ids');
      expect(result.ast.operator).toBe('IS NOT NULL');
      expect(result.ast.value).toBe(null);
    });

    it('should parse: parent_task IS NULL (root level tasks)', () => {
      const result = parseDartQLToAST('parent_task IS NULL');

      expect(result.errors).toHaveLength(0);
      expect(result.ast.type).toBe('comparison');
      expect(result.ast.field).toBe('parent_task');
      expect(result.ast.operator).toBe('IS NULL');
      expect(result.ast.value).toBe(null);
    });

    it('should parse complex relationship query', () => {
      const result = parseDartQLToAST(
        'parent_task IS NULL AND subtask_ids IS NOT NULL AND status = "Todo"'
      );

      expect(result.errors).toHaveLength(0);
      expect(result.ast.type).toBe('logical');
      expect(result.ast.operator).toBe('AND');
      expect(result.fields).toContain('parent_task');
      expect(result.fields).toContain('subtask_ids');
      expect(result.fields).toContain('status');
    });
  });

  describe('Client-Side Filtering: CONTAINS on Relationship Arrays', () => {
    it('should filter blocker_ids CONTAINS "task-abc123"', () => {
      const ast = parseDartQLToAST('blocker_ids CONTAINS "task-abc123"').ast;
      const result = convertToFilters(ast);

      expect(result.requiresClientSide).toBe(true);
      expect(result.clientFilter).toBeDefined();

      if (result.clientFilter) {
        // Task blocked by task-abc123
        expect(result.clientFilter({ blocker_ids: ['task-abc123', 'task-def456'] })).toBe(true);
        expect(result.clientFilter({ blocker_ids: ['task-abc123'] })).toBe(true);

        // Task not blocked by task-abc123
        expect(result.clientFilter({ blocker_ids: ['task-def456'] })).toBe(false);
        expect(result.clientFilter({ blocker_ids: [] })).toBe(false);
        expect(result.clientFilter({ blocker_ids: undefined })).toBe(false);
      }
    });

    it('should filter subtask_ids CONTAINS "task-child"', () => {
      const ast = parseDartQLToAST('subtask_ids CONTAINS "task-child"').ast;
      const result = convertToFilters(ast);

      if (result.clientFilter) {
        expect(result.clientFilter({ subtask_ids: ['task-child', 'task-other'] })).toBe(true);
        expect(result.clientFilter({ subtask_ids: ['task-other'] })).toBe(false);
        expect(result.clientFilter({ subtask_ids: [] })).toBe(false);
      }
    });

    it('should filter related_ids CONTAINS "task-related"', () => {
      const ast = parseDartQLToAST('related_ids CONTAINS "task-related"').ast;
      const result = convertToFilters(ast);

      if (result.clientFilter) {
        expect(result.clientFilter({ related_ids: ['task-related'] })).toBe(true);
        expect(result.clientFilter({ related_ids: ['task-other'] })).toBe(false);
      }
    });
  });

  describe('Client-Side Filtering: IS NULL / IS NOT NULL on Arrays', () => {
    it('should filter subtask_ids IS NULL (no subtasks)', () => {
      const ast = parseDartQLToAST('subtask_ids IS NULL').ast;
      const result = convertToFilters(ast);

      expect(result.requiresClientSide).toBe(true);

      if (result.clientFilter) {
        // No subtasks (empty array, null, or undefined)
        expect(result.clientFilter({ subtask_ids: [] })).toBe(true);
        expect(result.clientFilter({ subtask_ids: null })).toBe(true);
        expect(result.clientFilter({ subtask_ids: undefined })).toBe(true);
        expect(result.clientFilter({})).toBe(true);

        // Has subtasks
        expect(result.clientFilter({ subtask_ids: ['task-1'] })).toBe(false);
        expect(result.clientFilter({ subtask_ids: ['task-1', 'task-2'] })).toBe(false);
      }
    });

    it('should filter subtask_ids IS NOT NULL (has subtasks)', () => {
      const ast = parseDartQLToAST('subtask_ids IS NOT NULL').ast;
      const result = convertToFilters(ast);

      expect(result.requiresClientSide).toBe(true);

      if (result.clientFilter) {
        // Has subtasks (non-empty array)
        expect(result.clientFilter({ subtask_ids: ['task-1'] })).toBe(true);
        expect(result.clientFilter({ subtask_ids: ['task-1', 'task-2', 'task-3'] })).toBe(true);

        // No subtasks (empty array, null, undefined)
        expect(result.clientFilter({ subtask_ids: [] })).toBe(false);
        expect(result.clientFilter({ subtask_ids: null })).toBe(false);
        expect(result.clientFilter({ subtask_ids: undefined })).toBe(false);
        expect(result.clientFilter({})).toBe(false);
      }
    });

    it('should filter blocker_ids IS NULL (not blocked)', () => {
      const ast = parseDartQLToAST('blocker_ids IS NULL').ast;
      const result = convertToFilters(ast);

      if (result.clientFilter) {
        expect(result.clientFilter({ blocker_ids: [] })).toBe(true);
        expect(result.clientFilter({ blocker_ids: null })).toBe(true);
        expect(result.clientFilter({ blocker_ids: ['task-blocker'] })).toBe(false);
      }
    });

    it('should filter blocker_ids IS NOT NULL (is blocked)', () => {
      const ast = parseDartQLToAST('blocker_ids IS NOT NULL').ast;
      const result = convertToFilters(ast);

      if (result.clientFilter) {
        expect(result.clientFilter({ blocker_ids: ['task-blocker'] })).toBe(true);
        expect(result.clientFilter({ blocker_ids: [] })).toBe(false);
      }
    });

    it('should filter blocking_ids IS NOT NULL (is blocking other tasks)', () => {
      const ast = parseDartQLToAST('blocking_ids IS NOT NULL').ast;
      const result = convertToFilters(ast);

      if (result.clientFilter) {
        expect(result.clientFilter({ blocking_ids: ['task-blocked'] })).toBe(true);
        expect(result.clientFilter({ blocking_ids: [] })).toBe(false);
      }
    });
  });

  describe('Client-Side Filtering: parent_task (string field)', () => {
    it('should filter parent_task IS NULL (root level tasks)', () => {
      const ast = parseDartQLToAST('parent_task IS NULL').ast;
      const result = convertToFilters(ast);

      if (result.clientFilter) {
        // Root level tasks (no parent)
        expect(result.clientFilter({ parent_task: null })).toBe(true);
        expect(result.clientFilter({ parent_task: undefined })).toBe(true);
        expect(result.clientFilter({})).toBe(true);

        // Subtasks (has parent)
        expect(result.clientFilter({ parent_task: 'task-parent' })).toBe(false);
      }
    });

    it('should filter parent_task IS NOT NULL (subtasks)', () => {
      const ast = parseDartQLToAST('parent_task IS NOT NULL').ast;
      const result = convertToFilters(ast);

      if (result.clientFilter) {
        // Subtasks (has parent)
        expect(result.clientFilter({ parent_task: 'task-parent' })).toBe(true);

        // Root level tasks (no parent)
        expect(result.clientFilter({ parent_task: null })).toBe(false);
        expect(result.clientFilter({ parent_task: undefined })).toBe(false);
      }
    });

    it('should filter parent_task = "task-specific-parent"', () => {
      const ast = parseDartQLToAST('parent_task = "task-specific-parent"').ast;
      const result = convertToFilters(ast);

      if (result.clientFilter) {
        expect(result.clientFilter({ parent_task: 'task-specific-parent' })).toBe(true);
        expect(result.clientFilter({ parent_task: 'task-other-parent' })).toBe(false);
        expect(result.clientFilter({ parent_task: null })).toBe(false);
      }
    });
  });

  describe('Complex Relationship Queries', () => {
    it('should filter: parent_task IS NULL AND subtask_ids IS NOT NULL (root tasks with children)', () => {
      const ast = parseDartQLToAST('parent_task IS NULL AND subtask_ids IS NOT NULL').ast;
      const result = convertToFilters(ast);

      if (result.clientFilter) {
        // Root task with subtasks
        expect(result.clientFilter({
          parent_task: null,
          subtask_ids: ['task-child-1', 'task-child-2']
        })).toBe(true);

        // Root task without subtasks
        expect(result.clientFilter({
          parent_task: null,
          subtask_ids: []
        })).toBe(false);

        // Subtask with its own subtasks
        expect(result.clientFilter({
          parent_task: 'task-parent',
          subtask_ids: ['task-grandchild']
        })).toBe(false);
      }
    });

    it('should filter: blocker_ids IS NOT NULL AND status = "Todo" (blocked todo tasks)', () => {
      const ast = parseDartQLToAST('blocker_ids IS NOT NULL AND status = "Todo"').ast;
      const result = convertToFilters(ast);

      if (result.clientFilter) {
        expect(result.clientFilter({
          blocker_ids: ['task-blocker'],
          status: 'Todo'
        })).toBe(true);

        expect(result.clientFilter({
          blocker_ids: [],
          status: 'Todo'
        })).toBe(false);

        expect(result.clientFilter({
          blocker_ids: ['task-blocker'],
          status: 'Done'
        })).toBe(false);
      }
    });

    it('should filter: (blocker_ids IS NULL OR blocking_ids IS NOT NULL) AND priority >= 3', () => {
      const ast = parseDartQLToAST('(blocker_ids IS NULL OR blocking_ids IS NOT NULL) AND priority >= 3').ast;
      const result = convertToFilters(ast);

      if (result.clientFilter) {
        // Not blocked, high priority
        expect(result.clientFilter({
          blocker_ids: [],
          blocking_ids: [],
          priority: 5
        })).toBe(true);

        // Blocking others, high priority
        expect(result.clientFilter({
          blocker_ids: ['task-x'],
          blocking_ids: ['task-y'],
          priority: 4
        })).toBe(true);

        // Blocked, not blocking, high priority
        expect(result.clientFilter({
          blocker_ids: ['task-x'],
          blocking_ids: [],
          priority: 5
        })).toBe(false);

        // Not blocked but low priority
        expect(result.clientFilter({
          blocker_ids: [],
          blocking_ids: [],
          priority: 2
        })).toBe(false);
      }
    });

    it('should filter: duplicate_ids IS NOT NULL (tasks with duplicates)', () => {
      const ast = parseDartQLToAST('duplicate_ids IS NOT NULL').ast;
      const result = convertToFilters(ast);

      if (result.clientFilter) {
        expect(result.clientFilter({ duplicate_ids: ['task-dup'] })).toBe(true);
        expect(result.clientFilter({ duplicate_ids: [] })).toBe(false);
      }
    });
  });

  describe('Real-World Relationship Scenarios', () => {
    it('should find all root-level tasks (tasks without parents)', () => {
      const ast = parseDartQLToAST('parent_task IS NULL').ast;
      const result = convertToFilters(ast);

      const tasks = [
        { id: 'task-1', title: 'Root Task 1', parent_task: null },
        { id: 'task-2', title: 'Subtask', parent_task: 'task-1' },
        { id: 'task-3', title: 'Root Task 2', parent_task: undefined },
      ];

      if (result.clientFilter) {
        const rootTasks = tasks.filter(result.clientFilter);
        expect(rootTasks).toHaveLength(2);
        expect(rootTasks.map(t => t.id)).toEqual(['task-1', 'task-3']);
      }
    });

    it('should find all tasks blocked by a specific task', () => {
      const ast = parseDartQLToAST('blocker_ids CONTAINS "task-blocker"').ast;
      const result = convertToFilters(ast);

      const tasks = [
        { id: 'task-1', blocker_ids: ['task-blocker'] },
        { id: 'task-2', blocker_ids: ['task-other'] },
        { id: 'task-3', blocker_ids: ['task-blocker', 'task-other'] },
        { id: 'task-4', blocker_ids: [] },
      ];

      if (result.clientFilter) {
        const blockedTasks = tasks.filter(result.clientFilter);
        expect(blockedTasks).toHaveLength(2);
        expect(blockedTasks.map(t => t.id)).toEqual(['task-1', 'task-3']);
      }
    });

    it('should find all tasks that have subtasks', () => {
      const ast = parseDartQLToAST('subtask_ids IS NOT NULL').ast;
      const result = convertToFilters(ast);

      const tasks = [
        { id: 'task-1', subtask_ids: ['task-child-1', 'task-child-2'] },
        { id: 'task-2', subtask_ids: [] },
        { id: 'task-3', subtask_ids: ['task-child-3'] },
      ];

      if (result.clientFilter) {
        const parentTasks = tasks.filter(result.clientFilter);
        expect(parentTasks).toHaveLength(2);
        expect(parentTasks.map(t => t.id)).toEqual(['task-1', 'task-3']);
      }
    });

    it('should find unblocked high-priority tasks', () => {
      const ast = parseDartQLToAST('blocker_ids IS NULL AND priority >= 4').ast;
      const result = convertToFilters(ast);

      const tasks = [
        { id: 'task-1', blocker_ids: [], priority: 5 },
        { id: 'task-2', blocker_ids: ['task-x'], priority: 5 },
        { id: 'task-3', blocker_ids: [], priority: 2 },
        { id: 'task-4', blocker_ids: [], priority: 4 },
      ];

      if (result.clientFilter) {
        const unblockedHighPriority = tasks.filter(result.clientFilter);
        expect(unblockedHighPriority).toHaveLength(2);
        expect(unblockedHighPriority.map(t => t.id)).toEqual(['task-1', 'task-4']);
      }
    });
  });
});
