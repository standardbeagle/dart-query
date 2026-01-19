# Dart-Query MCP Implementation Tasks

## Task 1: Dart API Client Foundation
**Priority:** High
**Scope:** 2 files (src/api/dartClient.ts, src/types/index.ts)
**Description:** Implement the core Dart API client wrapper with authentication, error handling, and retry logic. This is the foundation for all API communication.

**Acceptance Criteria:**
- [ ] DartClient class accepts token and baseUrl config
- [ ] Private request() method handles authentication headers
- [ ] HTTP error codes mapped to DartAPIError (400, 401, 403, 404, 429, 500)
- [ ] Retry logic with p-retry for 429 rate limits (max 5 retries)
- [ ] DART_TOKEN validation on client instantiation
- [ ] Basic methods: getConfig(), createTask(), listTasks(), getTask(), updateTask(), deleteTask()
- [ ] All methods properly typed with TypeScript interfaces

**Context:**
- Base URL: https://app.dartai.com/api/v0
- Token format: dsa_*
- Production-only environment (no sandbox)
- Must handle rate limiting gracefully

---

## Task 2: Config Cache Layer
**Priority:** High
**Scope:** 1 file (src/cache/configCache.ts)
**Description:** Implement config caching with 5-minute TTL to reduce API calls for workspace configuration.

**Acceptance Criteria:**
- [ ] ConfigCache class using node-cache with 300s TTL
- [ ] Methods: get(), set(), invalidate(), isExpired()
- [ ] Singleton export (configCache)
- [ ] Cache stores DartConfig type
- [ ] Auto-cleanup on TTL expiration
- [ ] Manual cache busting support

**Context:**
- Config rarely changes (dartboards, assignees, statuses, tags)
- Heavy usage (called before every create/update for validation)
- 5-minute TTL is optimal balance

---

## Task 3: Info Tool - Progressive Discovery
**Priority:** High
**Scope:** 2 files (src/tools/info.ts, src/index.ts)
**Description:** Implement the info tool for progressive capability discovery with three detail levels: overview, group, tool.

**Acceptance Criteria:**
- [ ] handleInfo() function with InfoInput → InfoOutput
- [ ] Three levels implemented: overview, group, tool
- [ ] Overview renders sparse table of 7 tool groups
- [ ] Group level shows tools in specific category
- [ ] Tool level shows full schema and examples
- [ ] Helpful next_steps suggestions
- [ ] DartQL syntax guide for batch tools
- [ ] CSV format guide for import tool
- [ ] No API calls required (pure documentation)
- [ ] Integrated into main server tool list

**Context:**
- Entry point for users to discover capabilities
- Token-efficient (100-500 tokens per response)
- No external dependencies

---

## Task 4: get_config Tool
**Priority:** High
**Scope:** 2 files (src/tools/get_config.ts, src/index.ts)
**Description:** Implement get_config tool that retrieves workspace configuration with caching and optional filtering.

**Acceptance Criteria:**
- [ ] handleGetConfig() with GetConfigInput → DartConfig
- [ ] Uses DartClient.getConfig() for API call
- [ ] Integrates configCache (check cache first)
- [ ] cache_bust parameter forces refresh
- [ ] include parameter filters response sections
- [ ] Returns cached_at timestamp and cache_ttl_seconds
- [ ] Validates DART_TOKEN works (fail fast on 401/403)
- [ ] Proper error handling with actionable messages
- [ ] Integrated into main server tool list

**Context:**
- First API call users will make
- Tests authentication
- Critical for create/update operations

---

## Task 5: create_task Tool
**Priority:** High
**Scope:** 2 files (src/tools/create_task.ts, src/index.ts)
**Description:** Implement create_task for creating new Dart tasks with full parameter support and reference validation.

**Acceptance Criteria:**
- [ ] handleCreateTask() with CreateTaskInput → CreateTaskOutput
- [ ] Validates required fields (title, dartboard)
- [ ] Validates references against config (dartboard_id, assignee_ids, tag_ids exist)
- [ ] Resolves status name to status_id if needed
- [ ] Calls DartClient.createTask()
- [ ] Returns dart_id, title, url, created_at, all_fields
- [ ] Generates deep link URL: https://app.dartai.com/task/{dart_id}
- [ ] Clear error messages for invalid references
- [ ] Integrated into main server tool list

**Context:**
- Primary task creation method
- Requires get_config for validation
- Production testing: create TEST tasks to verify

---

## Task 6: list_tasks Tool
**Priority:** High
**Scope:** 2 files (src/tools/list_tasks.ts, src/index.ts)
**Description:** Implement list_tasks for querying tasks with filters, pagination, and detail levels.

**Acceptance Criteria:**
- [ ] handleListTasks() with ListTasksInput → ListTasksOutput
- [ ] Supports filters: assignee, status, dartboard, priority, tags, due_before, due_after
- [ ] Pagination: limit (default 50, max 500), offset
- [ ] Detail levels: minimal (id+title), standard (+status+assignee+priority), full (all)
- [ ] Returns tasks[], total_count, returned_count, has_more, next_offset
- [ ] Filters echoed back in filters_applied
- [ ] Calls DartClient.listTasks()
- [ ] Client-side filtering fallback if API doesn't support filter
- [ ] Integrated into main server tool list

**Context:**
- Hub tool for task discovery
- Feeds batch operations
- Token efficiency via detail_level parameter

---

## Task 7: get_task, update_task, delete_task Tools
**Priority:** High
**Scope:** 4 files (src/tools/get_task.ts, src/tools/update_task.ts, src/tools/delete_task.ts, src/index.ts)
**Description:** Implement the remaining CRUD operations for tasks.

**Acceptance Criteria:**
- [ ] get_task: retrieves by dart_id, optional include_comments
- [ ] get_task: returns task + comments + url
- [ ] update_task: validates dart_id exists
- [ ] update_task: validates update references against config
- [ ] update_task: only sends changed fields to API
- [ ] update_task: returns updated_fields list
- [ ] delete_task: moves to trash (recoverable)
- [ ] delete_task: returns deleted=true, recoverable=true
- [ ] All integrated into main server tool list
- [ ] Proper error handling for 404 (task not found)

**Context:**
- Standard CRUD operations
- delete_task is recoverable via Dart web UI
- update_task used by batch operations

---

## Task 8: DartQL Parser - Tokenizer & Lexer
**Priority:** Medium
**Scope:** 2 files (src/parsers/dartql.ts, src/parsers/dartql.test.ts)
**Description:** Implement the DartQL tokenizer and lexer for parsing WHERE clause syntax.

**Acceptance Criteria:**
- [ ] Tokenizer splits input into tokens (identifiers, operators, values, keywords)
- [ ] Recognizes operators: =, !=, >, >=, <, <=, IN, NOT IN, LIKE, CONTAINS, IS NULL, BETWEEN
- [ ] Recognizes logical operators: AND, OR, NOT
- [ ] Handles string literals (single/double quotes)
- [ ] Handles numeric literals
- [ ] Handles parentheses for grouping
- [ ] Validates field names against schema
- [ ] Returns token stream or parse errors
- [ ] Unit tests for valid/invalid syntax
- [ ] Fuzzy matching for typos ("priorty" → "priority")

**Context:**
- SQL-like WHERE clause syntax
- No SELECT/FROM - WHERE only
- Foundation for batch operations

---

## Task 9: DartQL Parser - AST Builder
**Priority:** Medium
**Scope:** 2 files (src/parsers/dartql.ts, src/parsers/dartql.test.ts)
**Description:** Build AST (Abstract Syntax Tree) from DartQL token stream.

**Acceptance Criteria:**
- [ ] Parser builds DartQLExpression AST from tokens
- [ ] Expression types: comparison, logical, group
- [ ] Handles operator precedence (NOT > AND > OR)
- [ ] Handles parentheses for grouping
- [ ] Recursive descent parsing
- [ ] Returns DartQLParseResult with ast, fields, errors
- [ ] Validation: unknown fields → error with suggestions
- [ ] Unit tests for complex queries with parentheses
- [ ] Error messages with position and context

**Context:**
- AST enables conversion to API filters
- Supports nested logic: (A OR B) AND C
- Clear error messages critical for UX

---

## Task 10: DartQL to Filters Converter
**Priority:** Medium
**Scope:** 2 files (src/parsers/dartql.ts, src/parsers/dartql.test.ts)
**Description:** Convert DartQL AST to list_tasks filter parameters or client-side filter function.

**Acceptance Criteria:**
- [ ] convertToFilters() converts AST to ListTasksInput filters
- [ ] Simple operators map directly: status = 'Todo' → { status: 'Todo' }
- [ ] Range operators: priority >= 3 → { priority_min: 3 }
- [ ] Complex queries fall back to client-side filtering
- [ ] IN clause: status IN ['Todo', 'In Progress'] → client-side
- [ ] CONTAINS, LIKE: client-side string matching
- [ ] Returns { apiFilters, clientFilter?, requiresClientSide }
- [ ] Unit tests for all operator types
- [ ] Performance warning for client-side filters

**Context:**
- Dart API may not support all filters
- Fallback to client-side ensures full DartQL support
- Warn users about performance implications

---

## Task 11: batch_update_tasks Tool
**Priority:** Medium
**Scope:** 3 files (src/tools/batch_update_tasks.ts, src/batch/batchOperations.ts, src/index.ts)
**Description:** Implement batch task updates with DartQL selector, dry-run mode, and parallel execution.

**Acceptance Criteria:**
- [ ] handleBatchUpdateTasks() with BatchUpdateTasksInput → BatchUpdateTasksOutput
- [ ] Parses selector with DartQL parser
- [ ] Resolves selector to dart_ids via list_tasks + client filter
- [ ] dry_run=true: returns preview (max 10 tasks) without updating
- [ ] dry_run=false: parallel updates with p-limit concurrency control
- [ ] Concurrency configurable (default 5, range 1-20)
- [ ] Collects successful_dart_ids and failed_items
- [ ] continue_on_error: don't stop on first failure
- [ ] Returns batch_operation_id, execution_time_ms
- [ ] Integrated into main server tool list

**Context:**
- ALWAYS recommend dry_run=true first
- Production safety critical
- Use p-limit for concurrency

---

## Task 12: batch_delete_tasks & Batch Store
**Priority:** Medium
**Scope:** 4 files (src/tools/batch_delete_tasks.ts, src/batch/batchStore.ts, src/tools/get_batch_status.ts, src/index.ts)
**Description:** Implement batch deletion with safety checks and batch operation state tracking.

**Acceptance Criteria:**
- [ ] handleBatchDeleteTasks() with BatchDeleteTasksInput → BatchDeleteTasksOutput
- [ ] dry_run defaults to true for safety
- [ ] confirm=true REQUIRED when dry_run=false (throw error otherwise)
- [ ] Resolves selector to dart_ids
- [ ] Preview mode: returns preview (max 20 tasks)
- [ ] Execute mode: parallel deletes with p-limit
- [ ] BatchStore: in-memory Map or node-cache for operation state
- [ ] get_batch_status: retrieves operation state by batch_operation_id
- [ ] Returns recoverable=true (tasks go to trash)
- [ ] All integrated into main server tool list

**Context:**
- Most dangerous operation - requires explicit confirmation
- dry_run=true by default
- Deletions are recoverable via web UI

---

## Task 13: CSV Parser Foundation
**Priority:** Medium
**Scope:** 2 files (src/parsers/csv.ts, src/parsers/csv.test.ts)
**Description:** Implement CSV parsing with flexible column mapping and normalization.

**Acceptance Criteria:**
- [ ] parseCSV() accepts csv_data string or csv_file_path
- [ ] Uses papaparse with { header: true, skipEmptyLines: true }
- [ ] normalizeColumns() handles case-insensitive matching
- [ ] Column aliases: Title=title=Task Name, Assignee=assignee=Assigned To
- [ ] Returns array of row objects with normalized keys
- [ ] Validation: first row must be headers
- [ ] Validation: required column 'title' exists
- [ ] Error reporting: unknown columns as warnings
- [ ] Unit tests with various CSV formats
- [ ] Handles quoted fields, commas in values

**Context:**
- Flexibility critical for imports from different tools
- Case-insensitive reduces user friction
- papaparse handles edge cases

---

## Task 14: CSV Reference Resolution & Validation
**Priority:** Medium
**Scope:** 2 files (src/parsers/csv.ts, src/parsers/csv.test.ts)
**Description:** Resolve human-readable references (emails, names) to dart_ids and validate rows.

**Acceptance Criteria:**
- [ ] resolveReferences() converts dartboard names → dart_ids
- [ ] resolveReferences() converts assignee emails → dart_ids
- [ ] resolveReferences() converts tag names → dart_ids
- [ ] Uses config cache for lookups
- [ ] validateRow() checks required fields (title)
- [ ] validateRow() checks valid references (dartboard, assignees, tags exist)
- [ ] validateRow() checks data types (priority 1-5, dates ISO8601)
- [ ] Returns validation errors with row_number, field, error, value
- [ ] Fuzzy matching for close matches (suggest corrections)
- [ ] Unit tests with invalid references, types

**Context:**
- Users provide emails, not dart_ids
- Clear error messages critical
- Validation before API calls prevents waste

---

## Task 15: import_tasks_csv Tool
**Priority:** Medium
**Scope:** 2 files (src/tools/import_tasks_csv.ts, src/index.ts)
**Description:** Implement CSV import with validation phase and parallel creation.

**Acceptance Criteria:**
- [ ] handleImportTasksCSV() with ImportTasksCSVInput → ImportTasksCSVOutput
- [ ] Parses CSV with parseCSV()
- [ ] Normalizes columns with column_mapping support
- [ ] Resolves all references via get_config()
- [ ] Validates all rows, collects errors
- [ ] validate_only=true: returns preview + validation_errors
- [ ] validate_only=false: parallel creates with p-limit
- [ ] continue_on_error=true: collects failures, continues
- [ ] Returns created_dart_ids, failed_items with row context
- [ ] Rollback suggestion if >50% failed
- [ ] Integrated into main server tool list

**Context:**
- ALWAYS recommend validate_only=true first
- Production testing: start with 5-10 row CSVs
- Error recovery critical for large imports

---

## Task 16: Document CRUD Tools
**Priority:** Low
**Scope:** 6 files (src/tools/docs/*.ts, src/index.ts)
**Description:** Implement document management tools (list, create, get, update, delete).

**Acceptance Criteria:**
- [ ] list_docs: filter by folder, title_contains, text_contains
- [ ] create_doc: title, text (markdown), optional folder
- [ ] get_doc: retrieve by doc_id with full text
- [ ] update_doc: update title or text
- [ ] delete_doc: move to trash (recoverable)
- [ ] All return appropriate doc_id, url, timestamps
- [ ] Similar patterns to task CRUD
- [ ] Integrated into main server tool list
- [ ] Error handling for 404 (doc not found)

**Context:**
- Lower priority than tasks
- Same patterns as task CRUD
- Recoverable deletions

---

## Task 17: search_tasks Tool
**Priority:** Low
**Scope:** 2 files (src/tools/search_tasks.ts, src/index.ts)
**Description:** Implement full-text search with relevance ranking.

**Acceptance Criteria:**
- [ ] handleSearchTasks() with query string
- [ ] Calls Dart API search endpoint if available
- [ ] Fallback: list_tasks + client-side search
- [ ] calculateRelevance() scores based on title/description matches
- [ ] Supports quoted phrases, - for exclusion
- [ ] Returns results sorted by relevance_score descending
- [ ] Progressive detail: high relevance (>0.7) = full, medium = standard, low = minimal
- [ ] Optional dartboard filter
- [ ] include_completed parameter
- [ ] Integrated into main server tool list

**Context:**
- Alternative to list_tasks for text discovery
- Relevance scoring improves UX
- Fallback ensures functionality

---

## Task 18: add_task_comment Tool
**Priority:** Low
**Scope:** 2 files (src/tools/add_task_comment.ts, src/index.ts)
**Description:** Implement task commenting for status updates and notes.

**Acceptance Criteria:**
- [ ] handleAddTaskComment() with dart_id and text
- [ ] Supports markdown formatting
- [ ] Calls DartClient.addComment()
- [ ] Returns comment_id, dart_id, text, author, created_at
- [ ] Simple append operation
- [ ] Error handling for invalid dart_id
- [ ] Integrated into main server tool list

**Context:**
- Used for AI rationale, status updates
- Markdown support for formatting
- Straightforward implementation

---

## Task 19: Integration Testing & README
**Priority:** Medium
**Scope:** 3 files (README.md, src/index.ts, manual testing)
**Description:** Complete README with examples, perform integration testing, and create production testing guide.

**Acceptance Criteria:**
- [ ] README updated with all 18 tool examples
- [ ] DartQL syntax reference complete
- [ ] CSV format examples with all columns
- [ ] Troubleshooting section expanded
- [ ] Production testing guide (start small, dry-run first)
- [ ] Manual integration test: create task, update, delete (with real DART_TOKEN)
- [ ] Manual integration test: batch_update with dry_run=true
- [ ] Manual integration test: CSV import with validate_only=true (5 rows)
- [ ] All tool schemas verified in main server
- [ ] Security check: DART_TOKEN never logged

**Context:**
- Production-only testing requires careful approach
- Start with single operations
- Use dry_run and validate_only modes
- Delete TEST tasks after validation

---

## Task 20: Build & Distribution
**Priority:** Medium
**Scope:** 4 files (package.json, tsconfig.json, .npmignore, dist/)
**Description:** Build TypeScript to JavaScript, test distribution, and prepare for deployment.

**Acceptance Criteria:**
- [ ] npm run build completes without errors
- [ ] dist/ contains compiled JavaScript + types
- [ ] dist/index.js has shebang and is executable
- [ ] npm start works (runs compiled server)
- [ ] MCP integration test with Claude Desktop config
- [ ] .npmignore excludes src/, tests/, .claude/
- [ ] Version bumped to 1.0.0
- [ ] Package ready for npm publish (if desired)

**Context:**
- TypeScript compilation to ES2022/Node16
- Executable entry point for MCP
- Ready for production use
