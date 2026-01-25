# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
