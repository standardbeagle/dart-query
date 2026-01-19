# Publishing Guide

This document explains how to publish `@standardbeagle/dart-query` to npm using GitHub Actions.

## Prerequisites

1. **NPM Token** - Organization-wide npm token is already configured in GitHub repository secrets as `NPM_TOKEN`
2. **GitHub Repository Access** - Push access to `standardbeagle/dart-query`
3. **Version Control** - Clean git working tree

## Publishing Process

### 1. Update Version

Update the version in `package.json`:

```bash
# For patch release (1.0.0 -> 1.0.1)
npm version patch

# For minor release (1.0.0 -> 1.1.0)
npm version minor

# For major release (1.0.0 -> 2.0.0)
npm version major
```

This will:
- Update `package.json` version
- Create a git commit with message like "1.0.1"
- Create a git tag like "v1.0.1"

### 2. Push Tag to GitHub

```bash
# Push the commit and tag
git push origin main --follow-tags
```

**Alternative: Push tag only**
```bash
git push origin v1.0.1
```

### 3. GitHub Actions Workflow

Once the tag is pushed, GitHub Actions will automatically:

1. **Build and Test** (on Ubuntu, macOS, Windows with Node 18 & 20)
   - Install dependencies
   - Run type checking
   - Run linting
   - Run tests
   - Build the project
   - Verify build output

2. **Publish to npm** (only after all tests pass)
   - Verify version in `package.json` matches tag
   - Build production artifacts
   - Publish to npm with provenance
   - Create GitHub Release with changelog

### 4. Verify Publication

After the workflow completes:

1. **Check npm**: https://www.npmjs.com/package/@standardbeagle/dart-query
2. **Check GitHub Release**: https://github.com/standardbeagle/dart-query/releases

## Manual Testing Before Release

Before creating a version tag, test locally:

```bash
# Clean install
rm -rf node_modules package-lock.json
npm install

# Type check
npm run typecheck

# Lint
npm run lint

# Run tests
npm test

# Build
npm run build

# Test the built package
node dist/index.js

# Test as installed package (dry run)
npm pack
# This creates @standardbeagle-dart-query-1.0.0.tgz

# Test installation in a different directory
mkdir /tmp/test-dart-query
cd /tmp/test-dart-query
npm init -y
npm install /path/to/dart-query/@standardbeagle-dart-query-1.0.0.tgz

# Test the installed CLI
npx dart-query
```

## Package Contents

The npm package includes:

- `dist/` - Compiled JavaScript and type definitions
- `README.md` - Main documentation
- `TOOLS.md` - Comprehensive tool reference
- `LICENSE` - MIT License

**Excluded from package:**
- `src/` - TypeScript source files
- `.github/` - GitHub Actions workflows
- `tests/` - Test files
- Configuration files (tsconfig.json, vitest.config.ts, etc.)

See `.npmignore` and `package.json` "files" field for details.

## Rollback a Release

If a published version has critical issues:

### Option 1: Publish a Patch Version

```bash
# Fix the issue
git add .
git commit -m "Fix critical bug in v1.0.1"

# Publish patch
npm version patch
git push origin main --follow-tags
```

### Option 2: Deprecate Version (npm)

```bash
npm deprecate @standardbeagle/dart-query@1.0.1 "Critical bug - use 1.0.2 instead"
```

**DO NOT** use `npm unpublish` - it's disruptive and only allowed within 72 hours.

## Continuous Integration

Every push and PR runs the CI workflow (`.github/workflows/ci.yml`):

- Tests on Ubuntu, macOS, Windows
- Tests on Node 18 and 20
- Type checking, linting, tests, build

This ensures all platforms are supported before release.

## Troubleshooting

### Workflow fails with "Version mismatch"

**Error:**
```
Tag version (1.0.1) does not match package.json version (1.0.0)
```

**Solution:**
Ensure you ran `npm version` and both package.json and git tag match:

```bash
git tag -d v1.0.1  # Delete incorrect tag locally
git push origin :refs/tags/v1.0.1  # Delete from remote

npm version patch  # Creates correct version
git push origin main --follow-tags
```

### Workflow fails with "NPM_TOKEN not found"

**Error:**
```
npm error code ENEEDAUTH
```

**Solution:**
Ensure `NPM_TOKEN` is configured in GitHub repository secrets:

1. Go to https://github.com/standardbeagle/dart-query/settings/secrets/actions
2. Verify `NPM_TOKEN` exists
3. If missing, add it with the organization-wide npm token

### Build fails on Windows

**Error:**
```
chmod: command not found
```

**Solution:**
The build script uses `chmod +x dist/index.js` which may not work on Windows. The GitHub Actions workflow handles this with cross-platform bash.

For local Windows development, manually make the file executable or use WSL.

### Tests fail on macOS

**Error:**
```
EACCES: permission denied
```

**Solution:**
Some tests may fail due to file permissions. Check:
- Node version compatibility (18+)
- File system permissions
- Ensure clean `node_modules` (`rm -rf node_modules && npm install`)

## Version Strategy

**Semantic Versioning (semver):**

- **Patch (1.0.x)** - Bug fixes, documentation updates
- **Minor (1.x.0)** - New features, backwards-compatible
- **Major (x.0.0)** - Breaking changes

**Breaking changes** for dart-query include:
- Removing tools
- Changing tool input/output schemas
- Removing DartQL operators
- Changing CSV import format

## Pre-release Versions

For beta testing:

```bash
# Create pre-release version
npm version 1.1.0-beta.1

# Push tag
git push origin v1.1.0-beta.1

# Users install with
npm install @standardbeagle/dart-query@beta
```

## Support

- GitHub Issues: https://github.com/standardbeagle/dart-query/issues
- npm Package: https://www.npmjs.com/package/@standardbeagle/dart-query
- Dart AI: https://dartai.com
