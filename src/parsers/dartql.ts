/**
 * DartQL Parser - Tokenizer & Lexer
 *
 * Parses SQL-like WHERE clause syntax for filtering Dart tasks.
 * Supports: WHERE status = 'Todo' AND priority >= 3
 *
 * Phase: Tokenization & Lexical Analysis only (AST building is separate)
 */

import { DartQLParseError } from '../types/index.js';

// ============================================================================
// Token Types
// ============================================================================

export enum TokenType {
  // Identifiers and values
  IDENTIFIER = 'IDENTIFIER',       // field names: status, priority, title
  STRING = 'STRING',               // 'Todo', "In Progress"
  NUMBER = 'NUMBER',               // 42, 3.14

  // Operators
  EQUALS = 'EQUALS',               // =
  NOT_EQUALS = 'NOT_EQUALS',       // !=
  GREATER_THAN = 'GREATER_THAN',   // >
  GREATER_EQUAL = 'GREATER_EQUAL', // >=
  LESS_THAN = 'LESS_THAN',         // <
  LESS_EQUAL = 'LESS_EQUAL',       // <=

  // Logical operators
  AND = 'AND',
  OR = 'OR',
  NOT = 'NOT',

  // Keywords
  IN = 'IN',
  LIKE = 'LIKE',
  CONTAINS = 'CONTAINS',
  IS = 'IS',
  NULL = 'NULL',
  BETWEEN = 'BETWEEN',

  // Grouping
  LPAREN = 'LPAREN',               // (
  RPAREN = 'RPAREN',               // )
  COMMA = 'COMMA',                 // ,

  // Special
  EOF = 'EOF',
  UNKNOWN = 'UNKNOWN',
}

export interface Token {
  type: TokenType;
  value: string;
  position: number;
  length: number;
}

// ============================================================================
// Schema Definition
// ============================================================================

// Valid field names that can appear in DartQL queries
export const VALID_FIELDS = [
  'status',
  'priority',
  'size',
  'title',
  'description',
  'assignee',
  'dartboard',
  'tags',
  'created_at',
  'updated_at',
  'due_at',
  'start_at',
  'completed_at',
  'parent_task',
  'dart_id',
] as const;

export type ValidField = typeof VALID_FIELDS[number];

// ============================================================================
// Tokenizer
// ============================================================================

export class DartQLTokenizer {
  private input: string;
  private position: number;
  private tokens: Token[];

  constructor(input: string) {
    this.input = input.trim();
    this.position = 0;
    this.tokens = [];
  }

  /**
   * Tokenize the input string into an array of tokens
   */
  tokenize(): Token[] {
    this.tokens = [];
    this.position = 0;

    while (this.position < this.input.length) {
      this.skipWhitespace();

      if (this.position >= this.input.length) {
        break;
      }

      const token = this.nextToken();
      if (token) {
        this.tokens.push(token);
      }
    }

    // Add EOF token
    this.tokens.push({
      type: TokenType.EOF,
      value: '',
      position: this.position,
      length: 0,
    });

    return this.tokens;
  }

  /**
   * Skip whitespace characters
   */
  private skipWhitespace(): void {
    while (this.position < this.input.length && /\s/.test(this.input[this.position])) {
      this.position++;
    }
  }

  /**
   * Peek at the next character without consuming it
   */
  private peek(offset: number = 0): string {
    const pos = this.position + offset;
    return pos < this.input.length ? this.input[pos] : '';
  }

  /**
   * Consume and return the next character
   */
  private consume(): string {
    if (this.position >= this.input.length) {
      return '';
    }
    return this.input[this.position++];
  }

  /**
   * Check if we've reached the end
   */
  private isAtEnd(): boolean {
    return this.position >= this.input.length;
  }

  /**
   * Extract the next token from the input
   */
  private nextToken(): Token | null {
    const start = this.position;
    const char = this.peek();

    // String literals (single or double quotes)
    if (char === '"' || char === "'") {
      return this.readString();
    }

    // Numbers
    if (/\d/.test(char)) {
      return this.readNumber();
    }

    // Operators
    if (char === '=' || char === '!' || char === '>' || char === '<') {
      return this.readOperator();
    }

    // Parentheses
    if (char === '(') {
      this.consume();
      return { type: TokenType.LPAREN, value: '(', position: start, length: 1 };
    }
    if (char === ')') {
      this.consume();
      return { type: TokenType.RPAREN, value: ')', position: start, length: 1 };
    }

    // Comma
    if (char === ',') {
      this.consume();
      return { type: TokenType.COMMA, value: ',', position: start, length: 1 };
    }

    // Identifiers and keywords
    if (/[a-zA-Z_]/.test(char)) {
      return this.readIdentifierOrKeyword();
    }

    // Unknown character
    throw new DartQLParseError(
      `Unexpected character: '${char}'`,
      this.position,
      char
    );
  }

  /**
   * Read a string literal (single or double quoted)
   */
  private readString(): Token {
    const start = this.position;
    const quote = this.consume(); // Opening quote
    let value = '';

    while (!this.isAtEnd() && this.peek() !== quote) {
      const char = this.consume();

      // Handle escape sequences
      if (char === '\\' && !this.isAtEnd()) {
        const next = this.consume();
        switch (next) {
          case 'n': value += '\n'; break;
          case 't': value += '\t'; break;
          case 'r': value += '\r'; break;
          case '\\': value += '\\'; break;
          case quote: value += quote; break;
          default: value += next;
        }
      } else {
        value += char;
      }
    }

    if (this.isAtEnd()) {
      throw new DartQLParseError(
        `Unterminated string literal starting at position ${start}`,
        start,
        quote
      );
    }

    this.consume(); // Closing quote
    const length = this.position - start;

    return {
      type: TokenType.STRING,
      value,
      position: start,
      length,
    };
  }

  /**
   * Read a numeric literal
   */
  private readNumber(): Token {
    const start = this.position;
    let value = '';

    // Read integer part
    while (!this.isAtEnd() && /\d/.test(this.peek())) {
      value += this.consume();
    }

    // Read decimal part if present
    if (this.peek() === '.' && /\d/.test(this.peek(1))) {
      value += this.consume(); // consume '.'
      while (!this.isAtEnd() && /\d/.test(this.peek())) {
        value += this.consume();
      }
    }

    const length = this.position - start;

    return {
      type: TokenType.NUMBER,
      value,
      position: start,
      length,
    };
  }

  /**
   * Read an operator (=, !=, >, >=, <, <=)
   */
  private readOperator(): Token {
    const start = this.position;
    const first = this.consume();
    const second = this.peek();

    // Two-character operators
    if (first === '!' && second === '=') {
      this.consume();
      return { type: TokenType.NOT_EQUALS, value: '!=', position: start, length: 2 };
    }
    if (first === '>' && second === '=') {
      this.consume();
      return { type: TokenType.GREATER_EQUAL, value: '>=', position: start, length: 2 };
    }
    if (first === '<' && second === '=') {
      this.consume();
      return { type: TokenType.LESS_EQUAL, value: '<=', position: start, length: 2 };
    }

    // Single-character operators
    if (first === '=') {
      return { type: TokenType.EQUALS, value: '=', position: start, length: 1 };
    }
    if (first === '>') {
      return { type: TokenType.GREATER_THAN, value: '>', position: start, length: 1 };
    }
    if (first === '<') {
      return { type: TokenType.LESS_THAN, value: '<', position: start, length: 1 };
    }

    throw new DartQLParseError(
      `Invalid operator starting with '${first}'`,
      start,
      first
    );
  }

  /**
   * Read an identifier or keyword
   */
  private readIdentifierOrKeyword(): Token {
    const start = this.position;
    let value = '';

    // Read alphanumeric characters and underscores
    while (!this.isAtEnd() && /[a-zA-Z0-9_]/.test(this.peek())) {
      value += this.consume();
    }

    const length = this.position - start;
    const upperValue = value.toUpperCase();

    // Check if it's a keyword
    const keywordMap: Record<string, TokenType> = {
      'AND': TokenType.AND,
      'OR': TokenType.OR,
      'NOT': TokenType.NOT,
      'IN': TokenType.IN,
      'LIKE': TokenType.LIKE,
      'CONTAINS': TokenType.CONTAINS,
      'IS': TokenType.IS,
      'NULL': TokenType.NULL,
      'BETWEEN': TokenType.BETWEEN,
    };

    const type = keywordMap[upperValue] || TokenType.IDENTIFIER;

    return {
      type,
      value,
      position: start,
      length,
    };
  }
}

// ============================================================================
// Lexer (Token Stream with Validation)
// ============================================================================

export interface LexerResult {
  tokens: Token[];
  errors: string[];
  fields: string[];
}

export class DartQLLexer {
  private tokens: Token[];
  private errors: string[];
  private fields: Set<string>;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.errors = [];
    this.fields = new Set();
  }

  /**
   * Analyze tokens and validate field names
   */
  analyze(): LexerResult {
    this.errors = [];
    this.fields = new Set();

    for (let i = 0; i < this.tokens.length; i++) {
      const token = this.tokens[i];

      // Validate identifiers as field names
      if (token.type === TokenType.IDENTIFIER) {
        this.validateFieldName(token);
      }

      // Validate operator sequences (e.g., NOT followed by IN)
      if (token.type === TokenType.NOT) {
        const next = this.tokens[i + 1];
        if (next && next.type === TokenType.IN) {
          // NOT IN is valid, combine into a single conceptual token
          // (actual AST building will handle this)
          continue;
        } else if (next && next.type === TokenType.LPAREN) {
          // NOT ( is valid for logical negation
          continue;
        }
      }

      // Validate IS NULL / IS NOT NULL
      if (token.type === TokenType.IS) {
        const next = this.tokens[i + 1];
        if (!next || (next.type !== TokenType.NULL && next.type !== TokenType.NOT)) {
          this.errors.push(`IS keyword must be followed by NULL or NOT NULL at position ${token.position}`);
        }
      }
    }

    return {
      tokens: this.tokens,
      errors: this.errors,
      fields: Array.from(this.fields),
    };
  }

  /**
   * Validate field name and suggest corrections for typos
   */
  private validateFieldName(token: Token): void {
    const fieldName = token.value.toLowerCase();
    this.fields.add(fieldName);

    // Check if field name is valid
    if (!VALID_FIELDS.includes(fieldName as ValidField)) {
      const suggestion = this.findClosestField(fieldName);
      if (suggestion) {
        this.errors.push(
          `Unknown field: '${token.value}'. Did you mean '${suggestion}'? (at position ${token.position})`
        );
      } else {
        this.errors.push(
          `Unknown field: '${token.value}'. Valid fields: ${VALID_FIELDS.join(', ')} (at position ${token.position})`
        );
      }
    }
  }

  /**
   * Find the closest valid field name using Levenshtein distance (fuzzy matching)
   */
  private findClosestField(input: string): string | null {
    const threshold = 2; // Maximum edit distance for suggestions
    let closest: string | null = null;
    let minDistance = Infinity;

    for (const field of VALID_FIELDS) {
      const distance = this.levenshteinDistance(input, field);
      if (distance < minDistance && distance <= threshold) {
        minDistance = distance;
        closest = field;
      }
    }

    return closest;
  }

  /**
   * Calculate Levenshtein distance between two strings (edit distance)
   */
  private levenshteinDistance(a: string, b: string): number {
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
}

// ============================================================================
// AST Parser (Recursive Descent)
// ============================================================================

import type { DartQLExpression, DartQLParseResult, DartQLOperator } from '../types/index.js';

export class DartQLParser {
  private tokens: Token[];
  private position: number;
  private errors: string[];
  private fields: Set<string>;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.position = 0;
    this.errors = [];
    this.fields = new Set();
  }

  /**
   * Parse tokens into an Abstract Syntax Tree
   */
  parse(): DartQLParseResult {
    this.position = 0;
    this.errors = [];
    this.fields = new Set();

    // Handle empty input (only EOF token)
    if (this.tokens.length === 1 && this.tokens[0].type === TokenType.EOF) {
      this.errors.push('Empty query - no expression to parse');
      return {
        ast: { type: 'group', expressions: [] },
        fields: [],
        errors: this.errors,
      };
    }

    try {
      const ast = this.parseExpression();

      // Ensure we consumed all tokens (except EOF)
      if (this.current().type !== TokenType.EOF) {
        this.addError(`Unexpected token: '${this.current().value}' at position ${this.current().position}`);
      }

      return {
        ast,
        fields: Array.from(this.fields),
        errors: this.errors,
      };
    } catch (error) {
      if (error instanceof DartQLParseError) {
        this.errors.push(error.message);
      } else {
        this.errors.push(`Parse error: ${error instanceof Error ? error.message : String(error)}`);
      }

      return {
        ast: { type: 'group', expressions: [] },
        fields: Array.from(this.fields),
        errors: this.errors,
      };
    }
  }

  /**
   * Get current token
   */
  private current(): Token {
    return this.tokens[this.position] || this.tokens[this.tokens.length - 1];
  }

  /**
   * Peek at next token without consuming
   */
  private peek(offset: number = 1): Token {
    const pos = this.position + offset;
    return this.tokens[pos] || this.tokens[this.tokens.length - 1];
  }

  /**
   * Consume current token and advance
   */
  private consume(): Token {
    const token = this.current();
    if (token.type !== TokenType.EOF) {
      this.position++;
    }
    return token;
  }

  /**
   * Check if current token matches expected type
   */
  private match(...types: TokenType[]): boolean {
    return types.includes(this.current().type);
  }

  /**
   * Expect specific token type and consume it
   */
  private expect(type: TokenType, errorMessage: string): Token {
    if (!this.match(type)) {
      this.addError(errorMessage + ` at position ${this.current().position}`);
      throw new DartQLParseError(errorMessage, this.current().position, this.current().value);
    }
    return this.consume();
  }

  /**
   * Add error with context
   */
  private addError(message: string): void {
    this.errors.push(message);
  }

  /**
   * Parse expression - handles OR (lowest precedence)
   */
  private parseExpression(): DartQLExpression {
    let left = this.parseAndExpression();

    while (this.match(TokenType.OR)) {
      this.consume(); // consume OR
      const right = this.parseAndExpression();
      left = {
        type: 'logical',
        operator: 'OR',
        left,
        right,
      };
    }

    return left;
  }

  /**
   * Parse AND expression (higher precedence than OR)
   */
  private parseAndExpression(): DartQLExpression {
    let left = this.parseNotExpression();

    while (this.match(TokenType.AND)) {
      this.consume(); // consume AND
      const right = this.parseNotExpression();
      left = {
        type: 'logical',
        operator: 'AND',
        left,
        right,
      };
    }

    return left;
  }

  /**
   * Parse NOT expression (highest precedence)
   */
  private parseNotExpression(): DartQLExpression {
    if (this.match(TokenType.NOT)) {
      this.consume();

      // Check if this is "NOT IN" (should be handled in comparison)
      if (this.match(TokenType.IN)) {
        // Backtrack - this is part of a NOT IN comparison
        this.position--;
        return this.parsePrimary();
      }

      // Logical NOT
      const expression = this.parseNotExpression(); // Allow chaining: NOT NOT x
      return {
        type: 'logical',
        operator: 'NOT',
        right: expression,
      };
    }

    return this.parsePrimary();
  }

  /**
   * Parse primary expression (comparisons or grouped expressions)
   */
  private parsePrimary(): DartQLExpression {
    // Handle grouped expressions (parentheses)
    if (this.match(TokenType.LPAREN)) {
      this.consume(); // consume (
      const expression = this.parseExpression();
      this.expect(TokenType.RPAREN, 'Expected closing parenthesis');

      return {
        type: 'group',
        expressions: [expression],
      };
    }

    // Must be a comparison expression
    return this.parseComparison();
  }

  /**
   * Parse comparison expression (field operator value)
   */
  private parseComparison(): DartQLExpression {
    // Expect field name (identifier)
    const fieldToken = this.expect(TokenType.IDENTIFIER, 'Expected field name');
    const field = fieldToken.value.toLowerCase();
    this.fields.add(field);

    // Special case: IS NULL / IS NOT NULL
    if (this.match(TokenType.IS)) {
      this.consume(); // consume IS

      const isNot = this.match(TokenType.NOT);
      if (isNot) {
        this.consume(); // consume NOT
      }

      this.expect(TokenType.NULL, 'Expected NULL after IS or IS NOT');

      return {
        type: 'comparison',
        field,
        operator: isNot ? 'IS NOT NULL' : 'IS NULL',
        value: null,
      };
    }

    // Special case: NOT IN
    if (this.match(TokenType.NOT)) {
      const next = this.peek();
      if (next.type === TokenType.IN) {
        this.consume(); // consume NOT
        this.consume(); // consume IN
        const value = this.parseInArray();
        return {
          type: 'comparison',
          field,
          operator: 'NOT IN',
          value,
        };
      }
    }

    // Special case: IN
    if (this.match(TokenType.IN)) {
      this.consume(); // consume IN
      const value = this.parseInArray();
      return {
        type: 'comparison',
        field,
        operator: 'IN',
        value,
      };
    }

    // Special case: BETWEEN
    if (this.match(TokenType.BETWEEN)) {
      this.consume(); // consume BETWEEN
      const start = this.parseValue();
      this.expect(TokenType.AND, 'Expected AND in BETWEEN clause');
      const end = this.parseValue();
      return {
        type: 'comparison',
        field,
        operator: 'BETWEEN',
        value: [start, end],
      };
    }

    // Standard operators
    const operator = this.parseOperator();
    const value = this.parseValue();

    return {
      type: 'comparison',
      field,
      operator,
      value,
    };
  }

  /**
   * Parse comparison operator
   */
  private parseOperator(): DartQLOperator {
    const token = this.current();

    const operatorMap: Partial<Record<TokenType, DartQLOperator>> = {
      [TokenType.EQUALS]: '=',
      [TokenType.NOT_EQUALS]: '!=',
      [TokenType.GREATER_THAN]: '>',
      [TokenType.GREATER_EQUAL]: '>=',
      [TokenType.LESS_THAN]: '<',
      [TokenType.LESS_EQUAL]: '<=',
      [TokenType.LIKE]: 'LIKE',
      [TokenType.CONTAINS]: 'CONTAINS',
    };

    const operator = operatorMap[token.type];
    if (!operator) {
      this.addError(`Expected comparison operator, got '${token.value}' at position ${token.position}`);
      throw new DartQLParseError(`Expected comparison operator`, token.position, token.value);
    }

    this.consume();
    return operator;
  }

  /**
   * Parse value (string, number, or identifier for NULL)
   */
  private parseValue(): unknown {
    const token = this.current();

    if (token.type === TokenType.STRING) {
      this.consume();
      return token.value;
    }

    if (token.type === TokenType.NUMBER) {
      this.consume();
      return parseFloat(token.value);
    }

    if (token.type === TokenType.NULL) {
      this.consume();
      return null;
    }

    this.addError(`Expected value (string, number, or NULL), got '${token.value}' at position ${token.position}`);
    throw new DartQLParseError('Expected value', token.position, token.value);
  }

  /**
   * Parse IN array: (value1, value2, value3)
   */
  private parseInArray(): unknown[] {
    this.expect(TokenType.LPAREN, 'Expected opening parenthesis for IN clause');

    const values: unknown[] = [];

    // Handle empty array
    if (this.match(TokenType.RPAREN)) {
      this.consume();
      return values;
    }

    // Parse first value
    values.push(this.parseValue());

    // Parse remaining values
    while (this.match(TokenType.COMMA)) {
      this.consume(); // consume comma
      values.push(this.parseValue());
    }

    this.expect(TokenType.RPAREN, 'Expected closing parenthesis for IN clause');

    return values;
  }
}

// ============================================================================
// Main Parse Function (Tokenization + Lexing + AST Building)
// ============================================================================

/**
 * Parse DartQL WHERE clause into AST with validation
 *
 * @param input - DartQL WHERE clause (e.g., "status = 'Todo' AND priority >= 3")
 * @returns DartQLParseResult with AST, extracted fields, and any errors
 *
 * @example
 * const result = parseDartQLToAST("status = 'Todo' AND priority >= 3");
 * if (result.errors.length > 0) {
 *   console.error('Parse errors:', result.errors);
 * } else {
 *   console.log('AST:', result.ast);
 *   console.log('Fields:', result.fields);
 * }
 */
export function parseDartQLToAST(input: string): DartQLParseResult {
  try {
    // Phase 1: Tokenization
    const tokenizer = new DartQLTokenizer(input);
    const tokens = tokenizer.tokenize();

    // Phase 2: Lexical analysis (field validation)
    const lexer = new DartQLLexer(tokens);
    const lexerResult = lexer.analyze();

    // If lexer found errors, return early
    if (lexerResult.errors.length > 0) {
      return {
        ast: { type: 'group', expressions: [] },
        fields: lexerResult.fields,
        errors: lexerResult.errors,
      };
    }

    // Phase 3: AST building
    const parser = new DartQLParser(tokens);
    const parseResult = parser.parse();

    return parseResult;
  } catch (error) {
    if (error instanceof DartQLParseError) {
      return {
        ast: { type: 'group', expressions: [] },
        fields: [],
        errors: [error.message],
      };
    }
    throw error;
  }
}

// ============================================================================
// AST to Filters Converter
// ============================================================================

import type { ListTasksInput } from '../types/index.js';

/**
 * Result of converting DartQL AST to filters
 */
export interface ConvertToFiltersResult {
  /**
   * API-compatible filters that can be passed directly to ListTasksInput
   */
  apiFilters: Partial<ListTasksInput>;

  /**
   * Client-side filter function for queries that can't be expressed via API
   * Returns true if task matches the criteria
   */
  clientFilter?: (task: unknown) => boolean;

  /**
   * Whether client-side filtering is required (not all filters supported by API)
   */
  requiresClientSide: boolean;

  /**
   * Warning messages about performance implications
   */
  warnings: string[];

  /**
   * Errors encountered during conversion
   */
  errors: string[];
}

/**
 * Convert DartQL AST to ListTasksInput filters
 *
 * Maps simple operators directly to API filters:
 * - status = 'Todo' → { status: 'Todo' }
 * - priority >= 3 → client-side (API doesn't support range on priority)
 * - assignee = 'user1' → { assignee: 'user1' }
 *
 * Falls back to client-side filtering for complex queries:
 * - IN clauses (status IN ['Todo', 'In Progress'])
 * - CONTAINS, LIKE operators
 * - OR logic (API only supports AND)
 * - NOT logic
 * - Complex nested expressions
 *
 * @param ast - DartQL AST from parseDartQLToAST()
 * @returns ConvertToFiltersResult with apiFilters and optional clientFilter
 */
export function convertToFilters(ast: DartQLExpression): ConvertToFiltersResult {
  const result: ConvertToFiltersResult = {
    apiFilters: {},
    requiresClientSide: false,
    warnings: [],
    errors: [],
  };

  try {
    // Analyze AST to determine if we can use API filters or need client-side
    const analysis = analyzeAST(ast);

    if (analysis.canUseAPI) {
      // Extract API-compatible filters
      result.apiFilters = extractAPIFilters(ast);
    } else {
      // Need client-side filtering
      result.requiresClientSide = true;
      result.clientFilter = buildClientSideFilter(ast);
      result.warnings.push(
        'Query requires client-side filtering which may impact performance. ' +
        'Consider using simpler queries with API-supported filters for better performance.'
      );

      // Add specific warnings for unsupported operations
      if (analysis.reasons.length > 0) {
        result.warnings.push(...analysis.reasons);
      }
    }
  } catch (error) {
    result.errors.push(
      `Failed to convert AST to filters: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return result;
}

/**
 * Analysis result for AST evaluation
 */
interface ASTAnalysis {
  canUseAPI: boolean;
  reasons: string[];
}

/**
 * Analyze AST to determine if it can be converted to API filters
 * API supports: Simple AND chains of equality/range comparisons on specific fields
 */
function analyzeAST(ast: DartQLExpression): ASTAnalysis {
  const reasons: string[] = [];

  // Check if AST uses unsupported features
  const canUseAPI = isAPICompatible(ast, reasons);

  return { canUseAPI, reasons };
}

/**
 * Check if AST expression is compatible with API filters
 */
function isAPICompatible(expr: DartQLExpression, reasons: string[]): boolean {
  // Handle comparison expressions
  if (expr.type === 'comparison') {
    const field = expr.field?.toLowerCase();
    const operator = expr.operator;

    // Check field support
    const apiSupportedFields = ['assignee', 'status', 'dartboard', 'priority', 'tags', 'due_at'];
    if (field && !apiSupportedFields.includes(field)) {
      reasons.push(`Field '${field}' not supported by API filters`);
      return false;
    }

    // Check operator support per field
    if (operator === 'IN' || operator === 'NOT IN') {
      reasons.push(`${operator} operator requires client-side filtering`);
      return false;
    }

    if (operator === 'LIKE' || operator === 'CONTAINS') {
      reasons.push(`${operator} operator requires client-side filtering`);
      return false;
    }

    if (operator === 'IS NULL' || operator === 'IS NOT NULL') {
      reasons.push(`${operator} operator requires client-side filtering`);
      return false;
    }

    if (operator === 'BETWEEN') {
      reasons.push(`BETWEEN operator requires client-side filtering`);
      return false;
    }

    // Check range operators (only due_at supports <, >, <=, >=)
    if (field === 'priority' && (operator === '>' || operator === '>=' || operator === '<' || operator === '<=')) {
      reasons.push(`Range operators on 'priority' require client-side filtering (API only supports equality)`);
      return false;
    }

    if (field === 'due_at') {
      // due_at supports <, > via due_before, due_after
      if (operator === '<' || operator === '<=') {
        return true; // Maps to due_before
      }
      if (operator === '>' || operator === '>=') {
        return true; // Maps to due_after
      }
      if (operator === '=' || operator === '!=') {
        reasons.push(`Equality operators on 'due_at' require client-side filtering`);
        return false;
      }
    }

    // For other fields, only = and != are allowed
    if (operator !== '=' && operator !== '!=') {
      reasons.push(`Operator '${operator}' not supported by API for field '${field}'`);
      return false;
    }

    // != requires client-side filtering
    if (operator === '!=') {
      reasons.push(`!= operator requires client-side filtering`);
      return false;
    }

    return true;
  }

  // Handle logical expressions
  if (expr.type === 'logical') {
    if (expr.operator === 'OR') {
      reasons.push('OR logic requires client-side filtering (API only supports AND)');
      return false;
    }

    if (expr.operator === 'NOT') {
      reasons.push('NOT logic requires client-side filtering');
      return false;
    }

    if (expr.operator === 'AND') {
      // Check both sides
      const leftOk = expr.left ? isAPICompatible(expr.left, reasons) : false;
      const rightOk = expr.right ? isAPICompatible(expr.right, reasons) : false;
      return leftOk && rightOk;
    }
  }

  // Handle group expressions
  if (expr.type === 'group') {
    if (expr.expressions && expr.expressions.length > 0) {
      return expr.expressions.every(e => isAPICompatible(e, reasons));
    }
  }

  return false;
}

/**
 * Extract API-compatible filters from AST
 * Only called when isAPICompatible returns true
 */
function extractAPIFilters(expr: DartQLExpression): Partial<ListTasksInput> {
  const filters: Partial<ListTasksInput> = {};

  if (expr.type === 'comparison') {
    const field = expr.field?.toLowerCase();
    const operator = expr.operator;
    const value = expr.value;

    if (field === 'assignee' && operator === '=') {
      filters.assignee = value != null ? String(value) : '';
    } else if (field === 'status' && operator === '=') {
      filters.status = value != null ? String(value) : '';
    } else if (field === 'dartboard' && operator === '=') {
      filters.dartboard = value != null ? String(value) : '';
    } else if (field === 'priority' && operator === '=') {
      filters.priority = value != null ? String(value) : '';
    } else if (field === 'tags' && operator === '=') {
      // Single tag - convert to array
      filters.tags = value != null ? [String(value)] : [];
    } else if (field === 'due_at') {
      if (operator === '<' || operator === '<=') {
        filters.due_before = value != null ? String(value) : '';
      } else if (operator === '>' || operator === '>=') {
        filters.due_after = value != null ? String(value) : '';
      }
    }
  } else if (expr.type === 'logical' && expr.operator === 'AND') {
    // Merge filters from both sides
    const leftFilters = expr.left ? extractAPIFilters(expr.left) : {};
    const rightFilters = expr.right ? extractAPIFilters(expr.right) : {};

    // Merge (note: duplicate fields will be overwritten - AST parser should prevent this)
    Object.assign(filters, leftFilters, rightFilters);
  } else if (expr.type === 'group') {
    // Extract from grouped expression
    if (expr.expressions && expr.expressions.length > 0) {
      return extractAPIFilters(expr.expressions[0]);
    }
  }

  return filters;
}

/**
 * Build client-side filter function from AST
 */
function buildClientSideFilter(expr: DartQLExpression): (task: unknown) => boolean {
  return (task: unknown) => {
    return evaluateExpression(expr, task);
  };
}

/**
 * Evaluate AST expression against a task object
 */
function evaluateExpression(expr: DartQLExpression, task: unknown): boolean {
  // Type guard for task object
  if (!task || typeof task !== 'object') {
    return false;
  }

  const taskObj = task as Record<string, unknown>;

  if (expr.type === 'comparison') {
    const field = expr.field?.toLowerCase();
    const operator = expr.operator;
    const value = expr.value;

    if (!field) return false;

    const taskValue = taskObj[field];

    // Handle different operators
    switch (operator) {
      case '=':
        return taskValue === value;

      case '!=':
        return taskValue !== value;

      case '>':
        return typeof taskValue === 'number' && typeof value === 'number' && taskValue > value;

      case '>=':
        return typeof taskValue === 'number' && typeof value === 'number' && taskValue >= value;

      case '<':
        if (typeof taskValue === 'number' && typeof value === 'number') {
          return taskValue < value;
        }
        // String comparison for dates
        if (typeof taskValue === 'string' && typeof value === 'string') {
          return taskValue < value;
        }
        return false;

      case '<=':
        if (typeof taskValue === 'number' && typeof value === 'number') {
          return taskValue <= value;
        }
        if (typeof taskValue === 'string' && typeof value === 'string') {
          return taskValue <= value;
        }
        return false;

      case 'IN':
        if (Array.isArray(value)) {
          return value.includes(taskValue);
        }
        return false;

      case 'NOT IN':
        if (Array.isArray(value)) {
          return !value.includes(taskValue);
        }
        return false;

      case 'CONTAINS':
        if (Array.isArray(taskValue) && typeof value === 'string') {
          return taskValue.includes(value);
        }
        if (typeof taskValue === 'string' && typeof value === 'string') {
          return taskValue.includes(value);
        }
        return false;

      case 'LIKE':
        if (typeof taskValue === 'string' && typeof value === 'string') {
          // LIKE implementation: % means wildcard (any chars), _ means single char
          // Escape regex special characters first, then replace wildcards
          const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const pattern = escaped.replace(/%/g, '.*').replace(/_/g, '.');
          const regex = new RegExp(`^${pattern}$`, 'i'); // case-insensitive like SQL
          return regex.test(taskValue);
        }
        return false;

      case 'IS NULL':
        return taskValue === null || taskValue === undefined;

      case 'IS NOT NULL':
        return taskValue !== null && taskValue !== undefined;

      case 'BETWEEN':
        if (Array.isArray(value) && value.length === 2) {
          const [min, max] = value;
          if (typeof taskValue === 'number' && typeof min === 'number' && typeof max === 'number') {
            return taskValue >= min && taskValue <= max;
          }
          if (typeof taskValue === 'string' && typeof min === 'string' && typeof max === 'string') {
            return taskValue >= min && taskValue <= max;
          }
        }
        return false;

      default:
        return false;
    }
  } else if (expr.type === 'logical') {
    if (expr.operator === 'AND') {
      const leftResult = expr.left ? evaluateExpression(expr.left, task) : false;
      const rightResult = expr.right ? evaluateExpression(expr.right, task) : false;
      return leftResult && rightResult;
    } else if (expr.operator === 'OR') {
      const leftResult = expr.left ? evaluateExpression(expr.left, task) : false;
      const rightResult = expr.right ? evaluateExpression(expr.right, task) : false;
      return leftResult || rightResult;
    } else if (expr.operator === 'NOT') {
      const result = expr.right ? evaluateExpression(expr.right, task) : false;
      return !result;
    }
  } else if (expr.type === 'group') {
    if (expr.expressions && expr.expressions.length > 0) {
      return evaluateExpression(expr.expressions[0], task);
    }
  }

  return false;
}

// ============================================================================
// Legacy Parse Function (Tokenization + Lexing only)
// ============================================================================

export interface ParseResult {
  tokens: Token[];
  fields: string[];
  errors: string[];
}

/**
 * Parse DartQL WHERE clause into tokens with validation (legacy function)
 *
 * @deprecated Use parseDartQLToAST for full AST parsing
 * @param input - DartQL WHERE clause (e.g., "status = 'Todo' AND priority >= 3")
 * @returns ParseResult with tokens, extracted fields, and any errors
 *
 * @example
 * const result = parseDartQL("status = 'Todo' AND priority >= 3");
 * if (result.errors.length > 0) {
 *   console.error('Parse errors:', result.errors);
 * } else {
 *   console.log('Tokens:', result.tokens);
 *   console.log('Fields:', result.fields);
 * }
 */
export function parseDartQL(input: string): ParseResult {
  try {
    // Tokenization phase
    const tokenizer = new DartQLTokenizer(input);
    const tokens = tokenizer.tokenize();

    // Lexical analysis phase
    const lexer = new DartQLLexer(tokens);
    const result = lexer.analyze();

    return result;
  } catch (error) {
    if (error instanceof DartQLParseError) {
      return {
        tokens: [],
        fields: [],
        errors: [error.message],
      };
    }
    throw error;
  }
}
