---
name: extract
description: Extract functions, components, hooks, or modules from existing code into clean, reusable units
trigger: when files are too long, when logic is repeated, when components do too many things
---

# Code Extraction

Extract a function, component, hook, or module from existing code into its own unit while preserving behavior.

## When to Extract

- File exceeds ~300 lines
- A function exceeds ~50 lines
- Same logic appears in 3+ places
- A component renders AND fetches AND transforms data
- A comment says "// Handle X" — that block is a function named `handleX`

## Extraction Types

### Function
Pure logic with clear inputs and outputs.
```typescript
// Extract from: src/app/api/profiles/route.ts
// To: src/lib/profiles.ts

export function transformProfileResponse(raw: DbProfile): ProfileResponse {
  return {
    id: raw.id,
    displayName: `${raw.first_name} ${raw.last_name}`,
    status: raw.is_active ? 'active' : 'inactive',
  };
}
```

### Server Component
UI rendering that fetches its own data (Next.js App Router).
```typescript
// Extract from: src/app/dashboard/page.tsx (large page)
// To: src/app/dashboard/_components/profile-stats.tsx

export default async function ProfileStats() {
  const stats = await getProfileStats();
  return (
    <div className="grid grid-cols-3 gap-4">
      <StatCard label="Total" value={stats.total} />
      <StatCard label="Active" value={stats.active} />
      <StatCard label="Pending" value={stats.pending} />
    </div>
  );
}
```

### Client Component
Interactive UI that needs browser APIs or React state.
```typescript
// Extract from: a large page component
// To: src/components/ui/search-input.tsx

'use client';

export function SearchInput({ onSearch }: { onSearch: (query: string) => void }) {
  const [query, setQuery] = useState('');
  // ...
}
```

### Query Function (Drizzle)
Database query logic extracted for reuse.
```typescript
// Extract from: scattered db.select() calls
// To: src/lib/queries/profiles.ts

export async function findProfileById(id: string) {
  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, id));
  return profile ?? null;
}
```

### Server Action
Form handling / mutation logic.
```typescript
// Extract from: inline in a page component
// To: src/app/profiles/actions.ts

'use server';

export async function updateProfile(formData: FormData) {
  const id = formData.get('id') as string;
  const name = formData.get('name') as string;
  await db.update(profiles).set({ name }).where(eq(profiles.id, id));
  revalidatePath('/profiles');
}
```

## Extraction Process

1. **Identify** the code block to extract (file path + line range or description)
2. **Analyze** the selected code:
   - Variables used within the block that are defined outside it = **parameters**
   - Variables modified within the block that are used after it = **return values**
   - Side effects (I/O, mutations, DOM manipulation)
3. **Choose** extraction type from above
4. **Name** it descriptively based on its purpose (not implementation)
5. **Create** the extracted unit with:
   - Clear TypeScript parameter types
   - Return type annotation
   - Minimal parameter count (<5, use options object if more)
6. **Replace** original code with a call to the extracted unit
7. **Update** imports in all affected files
8. **Verify** with `next build`

## File Organization for This Project

```
src/
  app/
    dashboard/
      page.tsx              # Page component (thin, mostly composition)
      _components/          # Page-specific components
        dashboard-stats.tsx
        recent-activity.tsx
  components/
    ui/                     # Shared reusable UI components
      button.tsx
      card.tsx
      search-input.tsx
  lib/
    queries/                # Extracted Drizzle query functions
      profiles.ts
      users.ts
    utils/                  # Pure utility functions
      format.ts
      validation.ts
```

## Report Format

```
Extracted: <type> <name> from <source-file>
  To: <destination-file>
  Parameters: <param-list>
  Returns: <return-type>
  Lines replaced: <start>-<end>
  Build: pass/fail
```

## Rules

- Extraction must be behavior-preserving — verify with build
- Choose names that describe PURPOSE, not implementation
- Keep parameter count under 5; use an options object for more
- Maintain the same error handling behavior in extracted code
- Update ALL call sites when moving a function to a different module
- Co-locate page-specific components with their page in `_components/`
- Share truly reusable components in `src/components/ui/`
- Share query logic in `src/lib/queries/`
