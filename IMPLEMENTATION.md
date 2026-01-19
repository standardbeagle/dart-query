# Implementation Guide

This guide walks through implementing the dart-query MCP server based on the comprehensive design in `mcp-design-dart-query.json`.

## Implementation Priority

Follow this order for fastest path to a working MCP:

### Phase 1: Core Infrastructure (Foundation)
**Priority: Critical - Start Here**

1. **Dart API Client** (`src/api/dartClient.ts`)
   - Wrap Dart API calls with authentication
   - Implement basic error handling and retry logic
   - Methods needed first: `getConfig()`, `createTask()`, `getTasks()`, `updateTask()`

2. **Config Cache** (`src/cache/configCache.ts`)
   - Simple in-memory cache with TTL (use `node-cache`)
   - Methods: `get()`, `set()`, `invalidate()`
   - 5-minute TTL for config data

3. **Info Tool** (`src/tools/info.ts`)
   - No API calls - pure documentation rendering
   - Implement sparse table formatting
   - Three levels: overview, group, tool

### Phase 2: Basic CRUD (Get Value Quickly)
**Priority: High - Ship Minimum Viable Product**

4. **get_config** (`src/tools/get_config.ts`)
   - Use Dart API client + cache
   - Filter by `include` parameter
   - Test with production API to validate token

5. **create_task** (`src/tools/create_task.ts`)
   - Validate references against config
   - Create single task via API
   - Return dart_id and URL

6. **list_tasks** (`src/tools/list_tasks.ts`)
   - Implement basic filtering
   - Support `detail_level` parameter
   - Pagination with `limit` and `offset`

7. **get_task** / **update_task** / **delete_task**
   - Straightforward CRUD operations
   - Minimal validation needed

**🚀 CHECKPOINT: You now have a working MCP for basic task management**

### Phase 3: DartQL & Batch Operations (Power Features)
**Priority: Medium - Add Advanced Capabilities**

8. **DartQL Parser** (`src/parsers/dartql.ts`)
   - Tokenizer for WHERE clause syntax
   - Parser to build AST
   - Converter: AST → `list_tasks` filters
   - Start with simple operators (`=`, `AND`, `OR`), add complex later

9. **Batch Operations** (`src/batch/batchOperations.ts`)
   - `batch_update_tasks`: dry_run mode → execute mode
   - `batch_delete_tasks`: requires confirm=true
   - Use `p-limit` for concurrency control
   - Collect errors, don't stop on first failure

10. **Batch Store** (`src/batch/batchStore.ts`)
    - Track batch operation state
    - In-memory store (Map or node-cache)
    - `get_batch_status` tool

**🚀 CHECKPOINT: You can now perform bulk operations with DartQL**

### Phase 4: CSV Import (Bulk Data Handling)
**Priority: Medium - Complete Feature Set**

11. **CSV Parser** (`src/parsers/csv.ts`)
    - Use `papaparse` library
    - Normalize column names (case-insensitive, aliases)
    - Resolve references (emails → dart_ids, names → dart_ids)

12. **CSV Import Tool** (`src/tools/import_tasks_csv.ts`)
    - Validation phase: parse, resolve, validate
    - Preview mode: show first 10 valid rows + all errors
    - Execute mode: parallel creation with error collection
    - Reference rollback if >50% fail

**🚀 CHECKPOINT: Full-featured MCP with all 18 tools**

### Phase 5: Polish & Production Hardening
**Priority: Low - Nice to Have**

13. **Document Tools** (`src/tools/docs/`)
    - `list_docs`, `create_doc`, `get_doc`, `update_doc`, `delete_doc`
    - Similar patterns to task CRUD

14. **Search & Advanced Queries**
    - `search_tasks` with relevance ranking
    - Client-side filtering for unsupported API filters
    - Fuzzy matching for typos

15. **Production Safety**
    - Enhanced error messages with suggestions
    - Rate limiting warnings for large batches
    - Validation of production-only testing approach

## File-by-File Implementation

### 1. `src/api/dartClient.ts`

```typescript
import pRetry from 'p-retry';

interface DartClientConfig {
  token: string;
  baseUrl?: string;
}

export class DartClient {
  private token: string;
  private baseUrl: string;

  constructor(config: DartClientConfig) {
    this.token = config.token;
    this.baseUrl = config.baseUrl || 'https://app.dartai.com/api/v0';
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    return pRetry(
      async () => {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
          ...options,
          headers: {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json',
            ...options.headers,
          },
        });

        if (!response.ok) {
          if (response.status === 429) {
            // Trigger retry
            throw new Error('Rate limited');
          }
          throw new DartAPIError(
            `API error: ${response.statusText}`,
            response.status,
            await response.json()
          );
        }

        return response.json();
      },
      {
        retries: 5,
        onFailedAttempt: (error) => {
          console.error(`Attempt ${error.attemptNumber} failed. Retrying...`);
        },
      }
    );
  }

  async getConfig(): Promise<DartConfig> {
    // TODO: Implement actual Dart API endpoint
    return this.request<DartConfig>('/config');
  }

  async createTask(task: CreateTaskInput): Promise<DartTask> {
    // TODO: Implement actual Dart API endpoint
    return this.request<DartTask>('/tasks', {
      method: 'POST',
      body: JSON.stringify(task),
    });
  }

  // TODO: Add remaining methods
  // - listTasks(filters)
  // - getTask(dart_id)
  // - updateTask(dart_id, updates)
  // - deleteTask(dart_id)
  // - addComment(dart_id, text)
  // - etc.
}
```

### 2. `src/cache/configCache.ts`

```typescript
import NodeCache from 'node-cache';
import type { DartConfig } from '../types/index.js';

class ConfigCache {
  private cache: NodeCache;

  constructor(ttlSeconds = 300) {
    this.cache = new NodeCache({
      stdTTL: ttlSeconds,
      checkperiod: ttlSeconds / 2,
    });
  }

  get(): DartConfig | undefined {
    return this.cache.get<DartConfig>('config');
  }

  set(config: DartConfig): void {
    this.cache.set('config', config);
  }

  invalidate(): void {
    this.cache.del('config');
  }

  isExpired(): boolean {
    return !this.cache.has('config');
  }
}

export const configCache = new ConfigCache();
```

### 3. `src/tools/info.ts`

```typescript
import type { InfoInput, InfoOutput } from '../types/index.js';

export async function handleInfo(input: InfoInput): Promise<InfoOutput> {
  const level = input.level || 'overview';

  if (level === 'overview') {
    return {
      level: 'overview',
      content: renderOverview(),
      next_steps: [
        "info(level='group', target='task-batch') - Learn batch operations",
        "get_config() - Get workspace configuration",
      ],
    };
  }

  if (level === 'group') {
    if (!input.target) {
      throw new Error('target parameter required when level=group');
    }
    return {
      level: 'group',
      content: renderGroup(input.target),
      next_steps: [
        `info(level='tool', target='<tool_name>') - Get detailed tool documentation`,
      ],
    };
  }

  if (level === 'tool') {
    if (!input.target) {
      throw new Error('target parameter required when level=tool');
    }
    return {
      level: 'tool',
      content: renderTool(input.target),
      next_steps: [
        'Try the tool with actual parameters',
      ],
    };
  }

  throw new Error(`Unknown level: ${level}`);
}

function renderOverview(): string {
  return `Dart Query MCP - Task Management with Batch Operations

Tool Groups
-----------
Group      | Count | Purpose
---------- | ----- | -------
discovery  | 1     | Progressive capability discovery
config     | 1     | Workspace configuration
task-crud  | 6     | Single task operations
task-query | 2     | Search and filter tasks
task-batch | 3     | Bulk operations on multiple tasks
doc-crud   | 5     | Document management
import     | 1     | CSV bulk import

Quick Start: info(level='group', target='task-crud')
Batch Ops:   info(level='group', target='task-batch')
DartQL Help: info(level='tool', target='batch_update_tasks')`;
}

function renderGroup(group: string): string {
  // TODO: Implement group-specific documentation
  return `Group: ${group}\n\nTools in this group:\n- tool1\n- tool2`;
}

function renderTool(tool: string): string {
  // TODO: Implement tool-specific documentation
  return `Tool: ${tool}\n\nFull schema and examples coming soon.`;
}
```

## Testing Strategy for Production

Since you only have access to production:

### 1. Unit Tests (Safe - No API Calls)
- DartQL parser logic
- CSV parser and column normalization
- Validation functions
- Fuzzy matching

### 2. Integration Tests with Mocks
- Tool handlers with mocked Dart API
- Error handling paths
- Input validation

### 3. Production Testing (Careful!)
```bash
# Step 1: Read-only operations first
get_config()
list_tasks({ limit: 5 })
get_task({ dart_id: "<existing_task_id>" })

# Step 2: Safe write operations
create_task({ title: "TEST - delete me", dartboard: "<id>" })
update_task({ dart_id: "<test_task>", updates: { priority: 1 } })
delete_task({ dart_id: "<test_task>" })

# Step 3: Batch operations with dry_run
batch_update_tasks({
  selector: "title LIKE 'TEST%'",
  updates: { priority: 1 },
  dry_run: true  // <-- ALWAYS true first
})

# Step 4: CSV import with validation
import_tasks_csv({
  csv_data: "title\nTEST task 1\nTEST task 2",
  dartboard: "<id>",
  validate_only: true  // <-- ALWAYS true first
})
```

## Common Pitfalls to Avoid

1. **Don't skip dry_run** - Always preview batch operations first
2. **Cache config properly** - Reduces API calls dramatically
3. **Handle rate limits** - Use p-retry and p-limit
4. **Validate references** - Check dart_ids exist in config before API calls
5. **Column name flexibility** - CSV imports need case-insensitive matching
6. **Error context** - Include row numbers, field names in error messages
7. **Security** - Never log DART_TOKEN, never send to client

## Next Steps

1. **Install dependencies**: `npm install`
2. **Implement DartClient**: Start with `getConfig()` and test with your token
3. **Build info tool**: No API calls needed, validate MCP integration works
4. **Ship Phase 1**: Get basic CRUD working
5. **Iterate**: Add DartQL, batch ops, CSV import progressively

## Resources

- Design spec: `mcp-design-dart-query.json`
- MCP SDK docs: https://modelcontextprotocol.io/
- Dart API docs: https://app.dartai.com/api/v0/public/docs/
- TypeScript handbook: https://www.typescriptlang.org/docs/
