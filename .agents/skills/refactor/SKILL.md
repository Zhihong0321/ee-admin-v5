---
name: refactor
description: Systematic code refactoring that improves structure without changing behavior
trigger: when code works but is messy, after features are complete, when technical debt accumulates
---

# Code Refactoring

Improve code structure, readability, and maintainability without changing external behavior.

## Prerequisites

- Code must be working before refactoring starts
- Commit working code FIRST to create a safety net
- Refactoring commits must be separate from feature commits

## Priority Levels

### Critical — Fix Immediately
- **Duplicate knowledge**: Same logic copy-pasted in multiple places
- **Deep nesting**: More than 3 levels of indentation
- **God files**: Components or modules doing too many things (>300 lines)
- **Tight coupling**: Components that can't be understood in isolation

### High — Address This Session
- **Magic numbers/strings**: Hardcoded values without named constants
- **Unclear naming**: Variables/functions that don't communicate intent
- **Mixed concerns**: API calls mixed with UI logic in components
- **Long parameter lists**: Functions with more than 4 parameters

### Nice — Handle When Nearby
- **Minor naming improvements**: Slightly better variable names
- **Small extractions**: Breaking out a helper from a long function
- **Import organization**: Grouping and ordering imports

### Skip — Leave As-Is
- Already clean, readable code
- Code that works and rarely changes
- Style preferences that don't affect readability

## Refactoring Patterns for This Project

### Next.js App Router Patterns
```typescript
// BEFORE: Mixed concerns in a Server Component
export default async function ProfilePage({ params }: Props) {
  const db = getDb();
  const result = await db.select().from(profiles).where(eq(profiles.id, params.id));
  const profile = result[0];
  // ... 50 lines of data transformation
  // ... 100 lines of JSX
}

// AFTER: Separated concerns
export default async function ProfilePage({ params }: Props) {
  const profile = await getProfile(params.id);
  return <ProfileView profile={profile} />;
}
```

### Drizzle ORM Query Patterns
- Extract repeated queries into `src/lib/queries/` functions
- Share WHERE clause builders for common filters
- Keep raw SQL in a single location if needed

### Component Patterns
- Extract reusable UI into `src/components/ui/`
- Keep page-specific components co-located with their page
- Use composition over props drilling — prefer `children` and slots

## DRY — Applied Thoughtfully

Consolidate when:
- The underlying business concept is identical
- Changes to one would always require changes to the other

Keep separate when:
- Different concerns happen to look similar today
- Coupling the code would make both harder to change independently
- The "duplication" is only 2-3 lines

## Anti-Pattern: Speculative Code

Remove any code written "just in case":
- Unused function parameters
- Configuration options nobody uses
- Error handling for impossible states
- Abstract base classes with one implementation

## Process

1. **Commit** current working code
2. **Identify** the highest-priority refactoring target
3. **Refactor** one thing at a time
4. **Verify** with `next build` after each change
5. **Commit** each refactoring separately with clear message
6. **Repeat** for next priority item

## Rules

- One refactoring per commit for clean, reviewable diffs
- NEVER mix refactoring with feature changes
- If a refactoring breaks the build, revert and try a smaller step
- Behavior must remain identical — verified by build success
- Prefer small, safe refactorings over ambitious restructuring
