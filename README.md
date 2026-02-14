# dart-query

MCP server for [Dart AI](https://dartai.com) task management, optimized for batch operations and minimal context usage.

Instead of looping through tasks one-by-one (filling your context window with intermediate JSON), dart-query uses DartQL selectors and server-side batch operations to update hundreds of tasks in a single call. A 50-task update that would normally consume ~30K tokens takes ~200 tokens with zero context rot.

## Quick Start

### 1. Get Your Dart AI Token

Visit https://app.dartai.com/?settings=account and copy your token (starts with `dsa_`).

### 2. Configure MCP

**npx (recommended)**

```json
{
  "mcpServers": {
    "dart-query": {
      "command": "npx",
      "args": ["-y", "@standardbeagle/dart-query"],
      "env": {
        "DART_TOKEN": "dsa_your_token_here"
      }
    }
  }
}
```

**SLOP-MCP (v0.10.0+)**

```bash
slop register dart-query \
  --command npx \
  --args "-y" "@standardbeagle/dart-query" \
  --env DART_TOKEN=dsa_your_token_here \
  --scope user
```

### 3. Verify

```
info({ level: "overview" })
```

### 4. Example: Batch Update

```typescript
// Preview first
batch_update_tasks({
  selector: "dartboard = 'Engineering' AND priority = 'high'",
  updates: { status: "Doing" },
  dry_run: true
})

// Execute
batch_update_tasks({
  selector: "dartboard = 'Engineering' AND priority = 'high'",
  updates: { status: "Doing" },
  dry_run: false
})
```

## Tools

| Group | Tools | Purpose |
|-------|-------|---------|
| Discovery | `info`, `get_config` | Explore capabilities, workspace config |
| Task CRUD | `create_task`, `get_task`, `update_task`, `delete_task`, `add_task_comment` | Single task operations |
| Query | `list_tasks`, `search_tasks` | Find tasks with filters or full-text search |
| Batch | `batch_update_tasks`, `batch_delete_tasks`, `get_batch_status` | Bulk operations with DartQL selectors |
| Import | `import_tasks_csv` | Bulk create from CSV with validation |
| Docs | `list_docs`, `create_doc`, `get_doc`, `update_doc`, `delete_doc` | Document management |

See **[TOOLS.md](./TOOLS.md)** for full parameter references, DartQL syntax, and CSV import format.

## DartQL Selectors

SQL-like WHERE clauses for targeting tasks in batch operations:

```sql
dartboard = 'Engineering' AND priority = 'high' AND tags CONTAINS 'bug'
due_at < '2026-01-18' AND status != 'Done'
title LIKE '%auth%'
```

## Safety

All Dart AI operations are production (no sandbox). dart-query provides:

- **Dry-run mode** on all batch operations — preview before executing
- **Validation phase** for CSV imports — catch errors before creating anything
- **Confirmation flag** (`confirm: true`) required for batch deletes
- **Recoverable deletes** — tasks move to trash, not permanent deletion

## License

MIT
