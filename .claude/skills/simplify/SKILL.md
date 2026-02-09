---
name: simplify
description: Simplify code to improve readability and AI maintainability — reduce nesting, improve naming, remove duplication
trigger: when code is hard to follow, when functions are too long, when nesting is too deep
---

# Code Simplification

Make code easier to understand on first read. Simpler code is easier for both humans and AI to maintain and extend.

## Simplification Steps

### 1. Reduce Nesting (Target: max 3 levels)

```typescript
// BEFORE: Deep nesting
async function handleRequest(req: Request) {
  const session = await getSession();
  if (session) {
    const user = await getUser(session.userId);
    if (user) {
      if (user.role === 'admin') {
        const data = await fetchData();
        if (data) {
          return Response.json(data);
        }
        return Response.json({ error: 'No data' }, { status: 404 });
      }
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    return Response.json({ error: 'User not found' }, { status: 404 });
  }
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}

// AFTER: Guard clauses (early returns)
async function handleRequest(req: Request) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await getUser(session.userId);
  if (!user) {
    return Response.json({ error: 'User not found' }, { status: 404 });
  }

  if (user.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const data = await fetchData();
  if (!data) {
    return Response.json({ error: 'No data' }, { status: 404 });
  }

  return Response.json(data);
}
```

### 2. Extract Functions

Signs a block should be a function:
- It has a comment explaining what it does (the comment becomes the function name)
- It's a logical unit within a longer function
- It's repeated in more than one place

```typescript
// BEFORE
// Transform profile data for display
const displayName = profile.firstName + ' ' + profile.lastName;
const initials = profile.firstName[0] + profile.lastName[0];
const status = profile.active ? 'Active' : 'Inactive';

// AFTER
function formatProfileForDisplay(profile: Profile) {
  return {
    displayName: `${profile.firstName} ${profile.lastName}`,
    initials: profile.firstName[0] + profile.lastName[0],
    status: profile.active ? 'Active' : 'Inactive',
  };
}
```

Each function should do ONE thing. If you need "and" to describe it, split it.

### 3. Improve Naming

| Bad | Good | Rule |
|-----|------|------|
| `d`, `tmp`, `val` | `profile`, `tempFile`, `statusCode` | No single-letter vars (except `i`, `j`, `k` in loops) |
| `usr`, `btn`, `cfg` | `user`, `button`, `config` | No abbreviations |
| `valid`, `enabled` | `isValid`, `isEnabled` | Booleans read as questions |
| `check()`, `process()` | `isExpired()`, `sendEmail()` | Functions describe action or return |
| `data`, `result`, `info` | `profiles`, `searchResults`, `errorDetails` | Specific over generic |

### 4. Remove Duplication

Consolidate when:
- Same business concept, changes would always happen together
- Identical logic in 3+ places

Keep separate when:
- Different concerns happen to share structure
- Coupling would make both harder to change

```typescript
// BEFORE: Copy-paste with minor differences
async function getActiveProfiles() {
  const result = await db.select().from(profiles).where(eq(profiles.status, 'active'));
  return result;
}
async function getPendingProfiles() {
  const result = await db.select().from(profiles).where(eq(profiles.status, 'pending'));
  return result;
}

// AFTER: Parameterized
async function getProfilesByStatus(status: ProfileStatus) {
  return db.select().from(profiles).where(eq(profiles.status, status));
}
```

### 5. Simplify Conditionals

```typescript
// BEFORE: Complex boolean
if (user.role === 'admin' || user.role === 'superadmin' || (user.role === 'editor' && user.departmentId === resource.departmentId)) {

// AFTER: Descriptive variable
const canEditResource = user.role === 'admin'
  || user.role === 'superadmin'
  || (user.role === 'editor' && user.departmentId === resource.departmentId);

if (canEditResource) {
```

```typescript
// BEFORE: Long switch/if-else
if (status === 'active') return 'green';
else if (status === 'pending') return 'yellow';
else if (status === 'inactive') return 'gray';
else if (status === 'error') return 'red';

// AFTER: Lookup map
const statusColors: Record<Status, string> = {
  active: 'green',
  pending: 'yellow',
  inactive: 'gray',
  error: 'red',
};
return statusColors[status];
```

### 6. Flatten Component Trees

```tsx
// BEFORE: Wrapper soup
<div className="container">
  <div className="wrapper">
    <div className="inner">
      <ProfileCard profile={profile} />
    </div>
  </div>
</div>

// AFTER: Meaningful structure only
<section className="container mx-auto p-4">
  <ProfileCard profile={profile} />
</section>
```

## Process

1. Pick ONE simplification type per pass
2. Apply it across the affected files
3. Verify with `next build`
4. Confirm the code is actually more readable, not just shorter
5. Commit with a message describing the simplification

## Rules

- Simpler means easier to understand on first read, NOT fewer lines
- Do NOT sacrifice clarity for cleverness — explicit beats implicit
- Preserve ALL existing behavior — this is refactoring, not rewriting
- If a function is complex because the domain is complex, add documentation instead of oversimplifying
- One kind of simplification per commit for clean diffs
- Three similar lines is better than a premature abstraction
