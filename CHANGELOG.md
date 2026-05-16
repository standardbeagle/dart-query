# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.12.0] - 2026-05-16

### Added
- **Industry-standard relationship field names** — task responses now emit canonical Jira/Linear-style names (`parent`, `subtasks`, `blocked_by`, `blocks`, `duplicates`, `related`) alongside the legacy `_ids` / `parent_task` shape. LLMs writing the names they already know from PM-tool training corpus now produce valid input. Legacy names are deprecated and will be removed in **0.13.0**.
- **Input synonym normalization** — `create_task` and `update_task` accept either canonical or legacy field names interchangeably (`parent` ↔ `parent_task`, `subtasks` ↔ `subtask_ids`, `blocked_by` ↔ `blocker_ids`, `blocks` ↔ `blocking_ids`, plus common camelCase / hyphenated variants). Internal contract still uses the legacy names; surface is symmetric.
- **Auto-mirrored inverse relationships** — `create_task` and `update_task` now patch the inverse side of every relationship change so the graph stays bidirectionally consistent without the caller having to set both sides. Setting `parent_task: P` on a child auto-patches `P.subtask_ids`; setting `blocker_ids: [B]` auto-patches `B.blocking_ids`; duplicates/related mirror bidirectionally. Best-effort — failures surface in new `mirror_warnings` / `mirror_applied` response fields, never fail the primary write.
- **`link_tasks` tool** — atomic bidirectional relationship verb. One call writes both sides via the auto-mirror path. Verbs: `parent`, `subtasks`, `blocks`, `blocked_by`, `duplicates`, `related`. Maps onto Linear's `issueRelationCreate` mental model.
- **Pseudo-edge tag rejection** — tags matching `^(needs|depends-on|blocked-by|blocks|parent|child|subtask|duplicate|related):` are now rejected at input time with a corrective error pointing at the correct relationship field. Prevents the common GitHub Actions / Jira label muscle-memory pattern (`tags: ["needs:T-42"]`) from silently dropping dependency info.

### Deprecated
- Legacy `_ids`-suffixed relationship field names (`subtask_ids`, `blocker_ids`, `blocking_ids`, `duplicate_ids`, `related_ids`) and `parent_task` on response payloads. Use `subtasks`, `blocked_by`, `blocks`, `duplicates`, `related`, `parent`. Legacy names will be removed in 0.13.0.

## [0.11.0] - 2026-05-05

### Added
- **`dartai_loop_snapshot` tool** — single-call aggregation for dartai loop startup. Returns dartboard config, claimable queue, runner-claimed tasks, and blocked tasks in one response. Eliminates 2 round-trips per loop iteration start.

## [0.10.5] - 2026-04-13

### Fixed
- **`add_task_comment` endpoint** — corrected from broken `POST /tasks/{id}/comments` to `POST /comments` with `{ item: { taskId, text } }` body per OpenAPI spec; removed obsolete retry-on-404 loop
- **Comment API types** — `author` is now a string (not an object), `created_at` is optional on `DartComment` and omitted from `AddTaskCommentOutput` to match backend response
- **DartQL `IS NULL` / `IS NOT NULL` client-side filtering** — removed incorrect `assignee` → `assignees` alias in `evaluateExpression` that caused wrong boolean results
- **`add_time_tracking` snapshot test** — added missing `GET /config` cassette exchange and aligned assertions with current request shape

## [0.10.3] - 2026-04-09

### Fixed
- **Hybrid DartQL filtering** — batch operations with mixed API/client-side conditions (e.g., `dartboard = 'X' AND title LIKE 'Y%'`) now extract API-compatible filters to narrow the fetch, preventing 500 errors from unbounded queries
- **HTML error responses** — Dart API errors that return HTML pages now show a clean message (e.g., "Server returned HTML error page: Dart") instead of raw markup

### Added
- **SQL-92 `<>` operator** — alias for `!=` (not equals)
- **`INCLUDES`/`HAS` aliases** — alternative keywords for `CONTAINS`
- **Operator hint errors** — common non-SQL operators (`starts_with`, `endswith`, `matches`, `regex`, etc.) now produce targeted error messages suggesting the correct LIKE syntax
- Updated all tool schema descriptions and documentation to reference SQL-92 syntax with full operator list and LIKE wildcard examples

## [0.10.2] - 2026-04-07

### Added
- **`comment` parameter on `create_task`** — add an initial comment when creating a task, matching `update_task` parity (non-blocking)

## [0.10.1] - 2026-04-07

### Fixed
- **`create_task` `item` wrapper** — silently unwraps `{ item: { title, ... } }` when LLMs erroneously wrap parameters, matching the mistake-detection pattern already in `update_task`

## [0.10.0] - 2026-04-07

### Added
- **`comment` parameter on `update_task`** — add a comment in the same call as a status/field update, eliminating the most common two-call pattern (non-blocking: update succeeds even if comment fails)
- **`add_to` / `remove_from` parameters on `update_task`** — incrementally add or remove IDs from relationship arrays without manually fetching, merging, and replacing. Supports all relationship fields: `subtask_ids`, `blocker_ids`, `blocking_ids`, `duplicate_ids`, `related_ids`
- 18 new TDD tests for comment and relationship merge features

## [0.9.0] - 2026-04-07

### Fixed
- **priority/size type mismatch** — DartTask interface now uses `number` (1-5) matching the Dart API and tool schemas, fixing round-trip incompatibility
- **list_tasks standard detail** now includes `description`, `parent_task`, and `blocker_ids`
- **list_tasks minimal detail** now includes `parent_task` and `blocker_ids`
- **search_tasks medium/low relevance** now includes `parent_task` and `blocker_ids`
- **import_tasks_csv** correctly converts priority/size from CSV strings to numbers

### Added
- **`resolveDartId()` helper** — all task modification tools now accept `id`, `task_id`, or `taskId` as aliases for `dart_id`, enabling seamless round-tripping from get/list responses into update/delete/move operations
- Applied to: `get_task`, `update_task`, `delete_task`, `move_task`, `add_task_comment`, `add_time_tracking`, `attach_url`

### Changed
- Cleaned up dead validation code in `create_task` for priority/size

## [0.6.1] - 2026-02-17

### Changed
- **Flattened `update_task` tool schema** - all fields now go at top level alongside `dart_id` instead of nested inside an `updates` object. Reduces LLM mistakes significantly.
- `DartClient.updateTask()` now takes two arguments `(dartId, updates)` instead of a single input object

### Added
- **LLM mistake detection** in `update_task` handler with corrective error messages:
  - Detects `task_id`, `id`, `taskId` and suggests `dart_id`
  - Detects nested `updates: {...}` wrapper and explains flat format
  - Detects misspelled fields (`due_date`→`due_at`, `blockers`→`blocker_ids`, etc.)

## [0.6.0] - 2026-02-15

### Changed
- Improved error messages surfacing actual API error details
- Permissive tag handling for unknown tags

## [0.5.0] - 2026-01-25

### Removed
- **Relationship filters from list_tasks** that couldn't work due to API limitations:
  - `has_subtasks`, `has_blockers`, `is_blocking`, `blocked_by`, `blocking` filters removed
  - List API doesn't return `taskRelationships` data (subtask_ids, blocker_ids, etc.)
  - `has_parent` filter retained - works because list API returns `parent_task`
- Updated info tool documentation to clarify API limitations

## [0.4.0] - 2026-01-25

### Added
- **Token-efficient table formatter module** for high-density query output:
  - `tableFormatter.ts` - Core formatting with 5 output modes
  - `fieldSelector.ts` - Field selection parser with SELECT...WHERE syntax
  - `relationshipExpander.ts` - Batch relationship expansion with title summaries
- Output format options: `table`, `compact`, `csv`, `json`, `ids`
- Essential fields default: `id`, `title`, `status`, `pri`, `assignee`, `due`
- Field modifiers: `#` for counts, `+` for expansion, `*` for all fields
- Query syntax: `SELECT id,title,due WHERE status = 'Todo' format=compact`
- Abbreviation helpers for IDs (`..def456`), dates, priorities (`C/H/M/L`)
- 103 new tests for formatter module

### Changed
- DartConfig now accepts union types (`Object | string`) for dartboards, statuses, and tags
- Added helper functions: `getDartboardId`, `getDartboardName`, `getStatusId`, `getTagId`
- Updated `findDartboard`, `findStatus`, `findTag` to handle both object and string formats

### Fixed
- Type errors when processing API responses that return entities as plain strings

## [0.3.0] - 2026-01-25

### Added
- **New tools for comprehensive task management:**
  - `list_comments` - List comments on a task with pagination
  - `move_task` - Reposition task within dartboard or move to different dartboard
  - `add_time_tracking` - Add time tracking entries to tasks
  - `attach_url` - Attach files from URL to tasks
  - `get_dartboard` - Get dartboard details including task count
  - `get_folder` - Get folder details including doc count
- DartClient methods for all new API endpoints
- Token-efficient response formats for new tools

### Changed
- Tool count increased from 18 to 24
- Improved DartComment type with optional parent_id for threaded comments

## [0.2.0] - 2026-01-25

### Added
- Full task relationship support across all APIs:
  - `subtask_ids` - Child tasks under a parent
  - `blocker_ids` - Tasks that block this task
  - `blocking_ids` - Tasks this task is blocking
  - `duplicate_ids` - Duplicate tasks
  - `related_ids` - Related tasks
- Relationship field support in DartQL queries (e.g., `blocker_ids IS NOT NULL`)
- Relationship filters in CSV import tool
- Relationship boolean filters in list_tasks: `has_parent`, `has_subtasks`, `has_blockers`, `is_blocking`
- Helper functions for config lookups: `findDartboard`, `findStatus`, `findTag`, `findFolder`

### Changed
- Config types now use proper objects (`DartBoard`, `DartStatus`, `DartTag`, `DartFolder`, `DartPriority`, `DartSize`) with `dart_id` fields instead of plain strings
- DartQL parser now returns priority as number instead of string
- `ListTasksInput.priority` now accepts both string and number types

### Fixed
- Config item resolution now properly extracts `dart_id` from objects
- CSV parser correctly validates against config object labels and values
- All 342 tests passing

## [0.1.0] - 2026-01-24

### Added
- Initial release of dart-query MCP server
- Core task management tools: `create_task`, `get_task`, `update_task`, `list_tasks`, `delete_task`
- Batch operations: `batch_update_tasks`
- CSV import: `import_tasks_csv` with validation and parallel creation
- Document management: `create_doc`, `get_doc`, `update_doc`, `list_docs`
- Search functionality: `search_tasks` with DartQL query language
- Configuration: `get_config` for workspace settings
- Info tool for capability discovery
- DartQL parser with full SQL-like WHERE clause support
- Comprehensive test suite (137 CSV tests, 205 DartQL tests)
