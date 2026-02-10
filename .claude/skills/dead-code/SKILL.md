---
name: dead-code
description: Find and safely remove dead code, unused imports, unreachable branches, and stale dependencies
trigger: when codebase feels bloated, during maintenance, before major refactoring
---

# Dead Code Removal

Identify and remove code that is never executed, reducing codebase size and improving AI maintainability.

## Detection Steps

### 1. Unused Imports
```bash
# TypeScript compilation will catch unused locals
npx tsc --noUnusedLocals --noUnusedParameters --noEmit
```
- Remove all unused import statements
- Remove unused type imports
- Check for side-effect-only imports (CSS, polyfills) — keep those

### 2. Unused Exports
For each exported function, component, type, or constant:
- Search the entire `src/` directory for imports of that symbol
- If exported but never imported elsewhere, check if it's:
  - A page component (used by Next.js routing) — **KEEP**
  - An API route handler (GET, POST, etc.) — **KEEP**
  - A layout/loading/error component — **KEEP**
  - `generateMetadata`, `generateStaticParams` — **KEEP**
  - None of the above — candidate for removal

### 3. Unreachable Code
- Code after `return`, `throw`, `break`, or `continue`
- Branches with impossible conditions (always true/false)
- Feature flags that are permanently enabled or disabled
- Commented-out code blocks (remove them — git has history)

### 4. Unused Components
- Components defined but never rendered anywhere
- Components only used in other dead components (cascading dead code)

### 5. Unused API Routes
- Route handlers in `src/app/api/` that no client code calls
- Cross-reference with `fetch()` calls and form actions

### 6. Unused Dependencies
```bash
# Compare package.json against actual imports
# Check for packages only used in removed code
```
- Scan all `import` and `require` statements in `src/`
- Compare against `dependencies` in `package.json`
- Flag packages with zero import references

### 7. Stale Database Schema
- Drizzle schema columns that no query reads or writes
- Tables defined but never queried

## Confidence Levels

- **High** (safe to remove): Zero references found, not a Next.js convention file
- **Medium** (likely safe): No static references, but could be used dynamically
- **Low** (needs review): Used in string interpolation, dynamic imports, or reflection

## Report Format

```
Dead Code Analysis
==================

Unused imports: <N>
  - <file>:<line> - import { <symbol> } from '<module>'

Unused exports: <N>
  - <file>:<line> - export <symbol> (0 references)

Unreachable code: <N>
  - <file>:<lines> - <reason>

Unused components: <N>
  - <file> - <ComponentName> (0 render references)

Unused dependencies: <N>
  - <package> (0 import references)

Safe to remove: <N> items (high confidence)
Needs review: <N> items (medium/low confidence)
```

## Process

1. **Scan** the entire `src/` directory
2. **Categorize** findings by confidence level
3. **Present** the report before removing anything
4. **Remove** high-confidence items first, one category per commit
5. **Build** after each removal batch: `next build`
6. **Flag** medium/low confidence items for manual review

## Rules

- NEVER remove Next.js convention files (page, layout, loading, error, route handlers)
- NEVER remove code used via dynamic imports or string references
- Preserve exports that are part of a public API consumed by other services
- Keep test utilities and fixtures even if they seem unused
- Never remove error handling just because it hasn't triggered yet
- Remove code in small, focused commits for easy reversal
- Run `next build` after each removal batch to catch false positives
