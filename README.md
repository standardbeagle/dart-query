# dart-query

**Production-ready MCP server for Dart AI task management with batch operations, SQL-like selectors, CSV import, and zero context rot.**

## What Problem Does This Solve?

### The Context Rot Problem

When managing tasks in Dart AI through an LLM, you quickly run into **context rot**:

```
You: "Update all high-priority tasks in Engineering to assign them to John"

LLM: Let me list the tasks...
[Fetches 847 tasks, fills context window with JSON]
[Context limit hit before making any updates]
[Lost track of what we were doing]
```

**Traditional approach** (context explosion):
1. List all tasks → 2000+ tokens
2. Filter in LLM → context fills with intermediate data
3. Update each task individually → 50+ API calls, each response adds more context
4. By task #10, you've lost context of what you're doing
5. No way to verify results without re-fetching everything

**dart-query approach** (zero context rot):
1. Single DartQL query: `"dartboard = 'Engineering' AND priority = 'high'"`
2. Server-side batch operation updates all 50 tasks
3. Returns summary: "50 tasks updated in 12s"
4. Context usage: ~100 tokens total

### Context-Efficient Design

Every operation is designed to **minimize token usage** while maximizing capability:

| Operation | Traditional | dart-query | Token Savings |
|-----------|-------------|------------|---------------|
| Update 50 tasks | 50 API calls, ~25K tokens | 1 batch op, ~200 tokens | **99% reduction** |
| Import 100 tasks | 100 create calls, ~30K tokens | 1 CSV import, ~300 tokens | **99% reduction** |
| Find + update tasks | List all + filter + update, ~20K tokens | DartQL selector, ~150 tokens | **99% reduction** |

**Key features for context efficiency:**
- **Progressive disclosure**: `info` tool discovers capabilities without reading schemas
- **Detail levels**: Return minimal/standard/full data based on need
- **Batch operations**: Single operation handles hundreds of tasks
- **Config caching**: 5-minute cache prevents repeated fetches
- **DartQL language**: SQL-like selectors instead of procedural filtering

### Production Safety Without Sandbox

Dart AI has **no sandbox environment** - all operations are production. dart-query provides safety through:

- **Dry-run modes**: Preview every batch operation before execution
- **Validation phases**: CSV imports validate before creating anything
- **Confirmation flags**: Batch deletes require explicit `confirm=true`
- **Recoverable operations**: Deleted tasks go to trash, not permanent deletion
- **Error isolation**: Failed operations don't corrupt subsequent work

## Quick Start

### 1. Installation

**Option A: Install from npm (recommended)**

```bash
npm install -g @standardbeagle/dart-query
```

**Option B: Install from source**

```bash
git clone https://github.com/standardbeagle/dart-query
cd dart-query
npm install
npm run build
```

### 2. Get Your Dart AI Token

Visit https://app.dartai.com/?settings=account and copy your token (starts with `dsa_`)

### 3. Configure MCP

**Option A: Using npm global install**

Add to your MCP settings (e.g., `~/Library/Application Support/Claude/claude_desktop_config.json`):

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

**Option B: Using local installation**

```json
{
  "mcpServers": {
    "dart-query": {
      "command": "node",
      "args": ["/absolute/path/to/dart-query/dist/index.js"],
      "env": {
        "DART_TOKEN": "dsa_your_token_here"
      }
    }
  }
}
```

**Option C: Using SLOP-MCP for dynamic management**

```bash
# With npm package
slop register dart-query \
  --command npx \
  --args "-y" "@standardbeagle/dart-query" \
  --env DART_TOKEN=dsa_your_token_here \
  --scope user

# With local installation
slop register dart-query \
  --command node \
  --args dist/index.js \
  --env DART_TOKEN=dsa_your_token_here \
  --scope user
```

### 4. Verify Connection

```typescript
// Get workspace config
get_config({})

// Explore capabilities
info({ level: "overview" })
```

### 5. Your First Operations

```typescript
// Create a task
create_task({
  title: "Test dart-query MCP",
  dartboard: "Personal/test",
  priority: "high"
})

// Batch update multiple tasks (dry run first!)
batch_update_tasks({
  selector: "dartboard = 'Personal/test' AND priority = 'high'",
  updates: { status: "Doing" },
  dry_run: true  // Preview first
})

// Execute after reviewing preview
batch_update_tasks({
  selector: "dartboard = 'Personal/test' AND priority = 'high'",
  updates: { status: "Doing" },
  dry_run: false
})

// Clean up
batch_delete_tasks({
  selector: "dartboard = 'Personal/test'",
  dry_run: false,
  confirm: true  // Required safety flag
})
```

## Core Features

### 🔍 **Progressive Discovery**
Start with `info` tool to explore capabilities without loading all schemas. Navigate overview → group → tool with increasing detail.

### 🎯 **DartQL Query Language**
SQL-like WHERE clause syntax for powerful batch operations:
```sql
dartboard = 'Engineering' AND priority = 'high' AND tags CONTAINS 'bug'
```

### 📊 **CSV Bulk Import**
Import hundreds of tasks from CSV with validation, error recovery, and fuzzy matching:
- Validate phase catches errors before creating anything
- Parallel import with configurable concurrency
- Continue-on-error mode for resilience

### ⚡ **Batch Operations**
Update or delete hundreds of tasks in a single operation:
- Server-side execution (no context rot)
- Dry-run preview mode
- Parallel processing with rate limiting

### 💾 **Context Efficiency**
- Detail levels (minimal/standard/full)
- 5-minute config cache
- Token-optimized responses
- Progressive disclosure of capabilities

### 🛡️ **Production Safety**
- No sandbox: all operations are production
- Dry-run modes for batch operations
- Validation phases for CSV imports
- Confirmation flags for destructive operations
- Recoverable deletions (tasks → trash)

## Tool Groups

| Group | Tools | Use Case |
|-------|-------|----------|
| **Discovery** | `info`, `get_config` | Explore capabilities, get workspace config |
| **Task CRUD** | `create_task`, `get_task`, `update_task`, `delete_task`, `add_task_comment` | Single task operations |
| **Task Query** | `list_tasks`, `search_tasks` | Find tasks with filters or full-text search |
| **Batch Operations** | `batch_update_tasks`, `batch_delete_tasks`, `get_batch_status` | Bulk operations on hundreds of tasks |
| **CSV Import** | `import_tasks_csv` | Bulk create from CSV files |
| **Documents** | `list_docs`, `create_doc`, `get_doc`, `update_doc`, `delete_doc` | Document management |

## Common Use Cases

### Bulk Task Management
```typescript
// Update all overdue high-priority tasks
batch_update_tasks({
  selector: "due_at < '2026-01-18' AND priority = 'high' AND status != 'Done'",
  updates: { priority: "critical", assignees: ["john@company.com"] },
  dry_run: true  // Preview first!
})
```

### Project Cleanup
```typescript
// Archive completed tasks from Q4 2025
batch_update_tasks({
  selector: "completed_at >= '2025-10-01' AND completed_at < '2026-01-01'",
  updates: { dartboard: "Archive" },
  dry_run: false,
  concurrency: 10
})
```

### CSV Migration
```typescript
// Import tasks from external system
import_tasks_csv({
  csv_file_path: "./jira-export.csv",
  dartboard: "Engineering",
  column_mapping: {
    "Issue Summary": "title",
    "Assignee Email": "assignee",
    "Priority": "priority"
  },
  validate_only: true  // Validate first!
})
```

### Search and Update
```typescript
// Find all authentication-related tasks
const results = search_tasks({
  query: "authentication oauth security",
  dartboard: "Engineering",
  limit: 20
})

// Update them in batch
batch_update_tasks({
  selector: "tags CONTAINS 'security' AND title LIKE '%auth%'",
  updates: { priority: "high" }
})
```

## Documentation

📖 **[Complete Tool Documentation →](./TOOLS.md)**

Detailed documentation for all tools including:
- Full parameter references
- Return value schemas
- How-to guides for common workflows
- Use case examples
- DartQL syntax reference
- CSV import formats
- Error handling strategies
- Performance optimization tips

## Production Safety Checklist

**Before ANY batch operation:**
- [ ] Use `dry_run: true` and review preview
- [ ] Verify selector matches ONLY intended tasks
- [ ] Test with small dataset first (< 10 tasks)
- [ ] Have rollback plan (tasks go to trash, recoverable)

**Before CSV import:**
- [ ] Use `validate_only: true` and fix all errors
- [ ] Test with 5-10 rows first
- [ ] Verify column mapping is correct
- [ ] Check references exist in workspace (`get_config`)

**Before batch delete:**
- [ ] Triple-check selector specificity
- [ ] Understand tasks move to trash (recoverable)
- [ ] Set `confirm: true` (required safety flag)

## Performance Metrics

Tested with production Dart API:

| Operation | Tasks | Time | Throughput |
|-----------|-------|------|------------|
| CSV Import | 41 tasks | 17.4s | 2.4 tasks/sec |
| Batch Update | 75 tasks | 22s | 3.4 tasks/sec |
| Batch Delete | 165 tasks | 37s | 4.5 tasks/sec |
| Single CRUD | 1 task | <2s | - |

*Concurrency: 10-20 parallel operations, production rate limits observed*

## Troubleshooting

### Authentication Issues
```
Error: Invalid DART_TOKEN
```
**Solution**: Ensure token starts with `dsa_` and get fresh token from https://app.dartai.com/?settings=account

### Rate Limiting (429)
```
Error: Rate limit exceeded
```
**Solution**: Reduce `concurrency` parameter (default: 5, try: 2-3). Automatic retry with exponential backoff.

### CSV Import Errors
```
Error: Row 3, column 'priority': Invalid priority: "5". Available: critical, high, medium, low
```
**Solution**: Use `validate_only: true` to see all errors. Check available values with `get_config()`.

### DartQL Syntax Errors
```
Error: Unknown field: priorty. Did you mean: priority?
```
**Solution**: Use fuzzy match suggestions. Reference field list with `info({ level: "tool", target: "batch_update_tasks" })`.

**See [TOOLS.md](./TOOLS.md) for comprehensive troubleshooting guide.**

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Type checking
npm run typecheck

# Run tests (unit tests only - no sandbox for integration)
npm test
```

### Project Structure
```
src/
├── index.ts              # MCP server entry point
├── tools/                # Tool implementations (info, CRUD, batch, import)
├── api/dartClient.ts     # Dart API wrapper with retry logic
├── parsers/              # DartQL and CSV parsers
├── cache/configCache.ts  # 5-minute config cache
├── batch/                # Batch operation tracking
└── types/index.ts        # TypeScript interfaces
```

## Design Philosophy

1. **Context efficiency first**: Every feature minimizes token usage
2. **Production safety**: Dry-run, validation, confirmation flags
3. **Progressive disclosure**: Discover capabilities without overwhelming schemas
4. **Zero context rot**: Batch operations prevent context pollution
5. **Fail-safe defaults**: `dry_run: true`, `validate_only: true` by default

## Comparison: Traditional vs dart-query

### Update 50 Tasks (Traditional LLM approach)
```
1. list_tasks() → Returns 50 task objects (~15,000 tokens)
2. For each task:
   - update_task(task1) → ~300 tokens
   - update_task(task2) → ~300 tokens
   - ... (50 iterations)
3. Total: ~30,000 tokens, 50 API calls, context window exhausted
```

### Update 50 Tasks (dart-query)
```
1. batch_update_tasks({
     selector: "dartboard = 'X' AND priority = 'high'",
     updates: { assignee: "john@company.com" }
   })
2. Total: ~200 tokens, 1 API call, zero context rot
```

**Token savings: 99%**
**Time savings: 90%**
**Context rot: Eliminated**

## Related Projects

- [Dart AI](https://dartai.com) - AI-powered task management platform
- [MCP](https://modelcontextprotocol.io) - Model Context Protocol specification
- [SLOP-MCP](https://github.com/belingud/slop-mcp) - Dynamic MCP server management

## License

MIT

---

**Built for production use. Tested with live Dart AI workspace managing 2000+ tasks across 67 dartboards.**
