# MCP Integration Test Guide

This document provides step-by-step instructions for testing the dart-query MCP server with Claude Desktop.

## Prerequisites

1. Claude Desktop installed
2. Dart AI account with API token (get from https://app.dartai.com/?settings=account)
3. Node.js 18+ installed

## Setup Instructions

### 1. Build the Project

```bash
cd /home/beagle/work/mcps/dart-query
npm install
npm run build
```

Verify build output:
- `dist/index.js` exists and is executable
- `dist/` contains .js, .d.ts, and .js.map files

### 2. Configure Claude Desktop

Add to your Claude Desktop config file:

**macOS/Linux**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "dart-query": {
      "command": "node",
      "args": [
        "/home/beagle/work/mcps/dart-query/dist/index.js"
      ],
      "env": {
        "DART_TOKEN": "YOUR_DART_TOKEN_HERE"
      }
    }
  }
}
```

**IMPORTANT**: Replace `YOUR_DART_TOKEN_HERE` with your actual Dart AI token.

### 3. Restart Claude Desktop

Completely quit and restart Claude Desktop to load the new MCP server.

## Verification Tests

### Test 1: Progressive Discovery

Start a conversation in Claude Desktop and ask:

```
Use the info tool to discover dart-query capabilities
```

Expected: Overview of tool categories (Discovery, Tasks, Batch, Documents, Search)

### Test 2: Get Workspace Config

```
Use get_config to show my Dart workspace configuration
```

Expected: List of dartboards, statuses, assignees, tags, priorities, sizes

### Test 3: List Tasks

```
Use list_tasks to show my current tasks with minimal detail level
```

Expected: List of tasks with dart_id and title

### Test 4: Create a Test Task

```
Create a test task with title "MCP Integration Test" in my default dartboard
```

Expected: Task created successfully with dart_id returned

### Test 5: Batch Operations (Dry Run)

```
Use batch_update_tasks to preview updating all tasks with priority 5 to add a "urgent" tag (use dry_run=true)
```

Expected: Preview of tasks that would be updated, no actual changes made

### Test 6: Search Tasks

```
Search for tasks containing "integration" or "test"
```

Expected: Relevant tasks with relevance scores

## Troubleshooting

### Server Not Starting

1. Check DART_TOKEN is set correctly in config
2. Verify token starts with `dsa_`
3. Check Claude Desktop logs for errors
4. Test server manually:
   ```bash
   DART_TOKEN="your_token" node /home/beagle/work/mcps/dart-query/dist/index.js
   ```
   Should print: "dart-query MCP server running on stdio"

### Tools Not Appearing

1. Verify JSON syntax in claude_desktop_config.json
2. Check file paths are absolute (not relative)
3. Ensure Node.js is in PATH
4. Restart Claude Desktop completely (quit from system tray/menu bar)

### API Errors

1. Verify DART_TOKEN is valid at https://app.dartai.com/?settings=account
2. Check network connectivity to Dart API
3. Verify workspace has required entities (dartboards, etc.)

## Production Deployment

Once testing is complete, you can:

1. **Publish to npm** (optional):
   ```bash
   npm publish
   ```

2. **Install globally**:
   ```bash
   npm install -g dart-query
   ```

   Then update Claude Desktop config to use the global installation:
   ```json
   {
     "mcpServers": {
       "dart-query": {
         "command": "dart-query",
         "env": {
           "DART_TOKEN": "YOUR_DART_TOKEN_HERE"
         }
       }
     }
   }
   ```

3. **Use via npx** (no installation):
   ```json
   {
     "mcpServers": {
       "dart-query": {
         "command": "npx",
         "args": ["dart-query"],
         "env": {
           "DART_TOKEN": "YOUR_DART_TOKEN_HERE"
         }
       }
     }
   }
   ```

## Success Criteria

All tests pass when:
- ✓ Server starts without errors
- ✓ All 18 tools are available in Claude Desktop
- ✓ Progressive discovery works (info tool)
- ✓ Workspace config loads
- ✓ Tasks can be listed and created
- ✓ Batch operations preview correctly
- ✓ Search returns relevant results

## Support

For issues or questions:
- Review README.md for detailed tool documentation
- Check IMPLEMENTATION.md for architecture details
- Verify all acceptance criteria in this test plan
