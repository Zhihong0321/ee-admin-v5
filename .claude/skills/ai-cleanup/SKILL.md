---
name: ai-cleanup
description: Remove AI-generated code slop and artifacts to produce clean, production-ready code
trigger: after AI-assisted coding sessions, before code reviews, before commits
---

# AI Code Cleanup

Remove AI-generated code artifacts that degrade code quality and confuse future AI sessions.

## When to Use

- After AI-assisted coding sessions
- Before code reviews or merging branches
- When code feels over-engineered or bloated
- When preparing code for production

## Slop Categories to Detect and Remove

### 1. Unnecessary Comments
Remove comments that restate what the code already says:
```typescript
// BAD - remove these
const user = await getUser(id); // Get the user by ID
return user.name; // Return the user's name

// GOOD - keep comments that explain WHY
// We fetch fresh user data here because the cache may be stale
// after profile updates from the SEDA API
const user = await getUser(id);
```

### 2. Defensive Bloat
Remove excessive try/catch, redundant null checks, and unnecessary validation:
```typescript
// BAD - over-defensive
function getProfileName(profile: Profile): string {
  try {
    if (profile === null || profile === undefined) {
      return '';
    }
    if (typeof profile.name !== 'string') {
      return '';
    }
    return profile.name ?? '';
  } catch (error) {
    console.error('Error getting profile name:', error);
    return '';
  }
}

// GOOD - trust TypeScript types
function getProfileName(profile: Profile): string {
  return profile.name;
}
```

### 3. Type Workarounds
Remove casts to `any`, unnecessary assertions, and suppression directives:
- `as any` casts — fix the actual type instead
- `@ts-ignore` / `@ts-expect-error` — resolve the type error
- Unnecessary type assertions (`value as string` when already typed)
- Redundant generic parameters that TypeScript can infer

### 4. Style Inconsistencies
Fix patterns that deviate from the project's conventions:
- This project uses: `camelCase` for variables/functions, `PascalCase` for components/types
- Path aliases use `@/*` for `./src/*`
- Tailwind CSS for styling (not inline styles or CSS modules)
- Server Components by default, `'use client'` only when needed

### 5. AI Tells — Patterns That Scream "AI Wrote This"
- Overly verbose variable names: `userProfileDataFromDatabase` -> `profile`
- "Just in case" code paths that can never execute
- Unnecessary abstractions for one-time operations
- Adding `console.log` statements meant for debugging
- Empty catch blocks or catch-and-rethrow patterns
- Importing modules that are never used
- Wrapping single-use logic in utility functions

## Process

1. **Scan** the changed files for slop categories above
2. **Preserve** legitimate error handling, necessary type assertions, and helpful comments
3. **Remove** artifacts one category at a time
4. **Verify** the app still builds: `next build`
5. **Test** functionality is preserved after each cleanup pass

## Rules

- NEVER change behavior — only remove unnecessary code
- Preserve existing project style conventions
- Keep error handling at system boundaries (API routes, form handlers, external API calls)
- Keep comments that explain business logic or non-obvious decisions
- Work incrementally — one category per pass
- If unsure whether something is slop, leave it and flag it for review
