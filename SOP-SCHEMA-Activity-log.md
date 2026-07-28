# SOP — `activity_log` (shared cross-app activity log)

**Database:** `prod_main` · **Table:** `public.activity_log` · **Created:** 2026-07-28
**Audience:** every team whose app connects to `prod_main`.

This table records **who did what, in which app**. One row per meaningful user
action. Every app on `prod_main` writes to this same table — that is the point.

---

## 1. Pick the right table first

There are five similarly-named tables in `prod_main`. Choosing wrong is the most
common mistake. Use this:

| Table | Use it for | Retention | Who writes |
|---|---|---|---|
| **`activity_log`** | **Who did what, in which app. Create/update/delete/save/print/send.** | **30 days** | **All apps** |
| `invoice_audit_log` | Field-level before/after diffs on invoices only | Forever | EE-Admin only |
| `audit_log` | Legacy generic audit. Superseded by `activity_log` — do not add new writes | — | Legacy referral app |
| `_activity_feed` | Department announcements shown to staff (pinned posts) | — | Unrelated feature |
| `activity_v2_report` | Staff task/time tracking with points | — | Unrelated feature |

**If you want a feed of user actions → `activity_log`. Nothing else.**

`activity_log` and `invoice_audit_log` are complements, not rivals. An invoice
edit in EE-Admin writes to **both**: the diff goes to `invoice_audit_log`, the
"Nurul updated INV-0312" line goes to `activity_log`.

---

## 2. Schema

```sql
CREATE TABLE activity_log (
  id             bigserial   PRIMARY KEY,

  -- Which app wrote this row
  app            text        NOT NULL,          -- REQUIRED. slug from your app's own env config
  app_env        text,                          -- 'prod' | 'staging' | 'dev'
  source_url     text,                          -- full URL or route, when one exists

  -- Who did it
  actor_kind     text        NOT NULL DEFAULT 'user',  -- user | system | cron | webhook | api
  actor_user_id  integer,                       -- "user".id  (INTEGER — see §5)
  actor_ref      text,                          -- your app's own id: bubble_id, email, key label
  actor_name     text,                          -- snapshot of the name at the time
  actor_role     text,

  -- What happened
  action         text        NOT NULL,          -- REQUIRED. free text, see §4
  entity_type    text,                          -- 'invoice' | 'payment' | 'customer' | ...
  entity_id      text,                          -- text: holds integer ids AND bubble ids
  entity_label   text,                          -- 'INV-2024-0312'
  description    text,                          -- pre-rendered human line, see §6
  fields         text[],                        -- changed column NAMES only, never values
  status         text        NOT NULL DEFAULT 'success',  -- 'success' | 'failed'
  error_message  text,

  -- Context
  request_id     text,                          -- correlate rows from one user action
  ip             text,
  user_agent     text,
  metadata       jsonb       NOT NULL DEFAULT '{}'::jsonb,  -- your escape hatch, see §7

  -- Time and lifecycle
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  retain_until   timestamptz                    -- NULL = purged after 30 days
);
```

Indexes: `(occurred_at DESC)`, `(app, occurred_at DESC)`,
`(actor_user_id, occurred_at DESC) WHERE actor_user_id IS NOT NULL`,
`(entity_type, entity_id, occurred_at DESC)`.

**Only three columns are required: `app`, `action`, and a primary key you don't
supply.** Everything else is optional. A thin row is better than no row.

---

## 3. Minimum viable write

```sql
INSERT INTO activity_log (app, action, entity_type, entity_id, description)
VALUES ('crm', 'update', 'customer', '4821', 'Aisha updated customer Lim Enterprise');
```

Fuller, the way you should actually do it:

```sql
INSERT INTO activity_log
  (app, app_env, source_url, actor_kind, actor_user_id, actor_name, actor_role,
   action, entity_type, entity_id, entity_label, description, fields, request_id)
VALUES
  ('crm', 'prod', '/customers/4821', 'user', 17, 'Aisha', 'admin',
   'update', 'customer', '4821', 'Lim Enterprise',
   'Aisha updated customer Lim Enterprise (phone, address)',
   ARRAY['phone','address'], 'req_9f2c31');
```

Node / `pg`:

```js
await pool.query(
  `INSERT INTO activity_log
     (app, app_env, actor_kind, actor_user_id, actor_name,
      action, entity_type, entity_id, entity_label, description, fields)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
  [APP_SLUG, process.env.APP_ENV, 'user', user.id, user.name,
   'update', 'customer', String(id), label, description, changedFields]
);
```

Python / `psycopg`:

```python
cur.execute(
    """INSERT INTO activity_log
         (app, app_env, actor_kind, actor_ref, actor_name,
          action, entity_type, entity_id, description)
       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
    (APP_SLUG, APP_ENV, "user", user_email, user_name,
     "delete", "quotation", str(qid), f"{user_name} deleted quotation {qref}"),
)
```

---

## 4. The five rules

**Rule 1 — Logging must never break the user's action.**
Wrap the insert in try/catch, swallow the error, log it to your console. A
missing activity row is a minor gap. A failed save because logging threw is an
incident. Never let one become the other.

**Rule 2 — Write it *after* the real work commits, outside that transaction.**
If the log insert lives inside your business transaction, a log failure rolls
back real user data, and your transaction holds locks longer than it needs to.

**Rule 3 — `app` is an explicit slug from your config. Never parse it from a URL.**
Your app has staging domains, custom domains, localhost, and cron jobs with no
URL at all. Hardcode the slug in your env (`APP_SLUG=crm`) and send it every
time. Put the URL in `source_url` if you have one — it's context, not identity.

**Rule 4 — `action` and `entity_type` are free text. There is no enum, and there
must never be one.**
This DB has already been bitten by a hardcoded allow-list (`ee_attachment.doc_type`
grew from 2 values to 7 and silently dropped rows). A constrained verb column on
a table four apps write to *will* reject a valid write inside somebody's save
handler. Send whatever verb describes your action. **Readers must handle unknown
values with a catch-all** so new actions surface instead of disappearing.

**Rule 5 — Never put secrets, passwords, tokens, card numbers, or full row
payloads in this table.**
`fields` holds column *names*, not values. If you need before/after values, that
is a job for your own audit table, not the shared feed.

---

## 5. The actor-identity trap (read this one twice)

`prod_main` has two user keyspaces and they are **not** interchangeable:

- `"user".id` — **integer**, e.g. `17`
- `"user".bubble_id` — text, e.g. `1725871255370x1468…`

`activity_log.actor_user_id` is **integer** and must receive `"user".id`.

Putting a `bubble_id` in `actor_user_id` will either error or silently attribute
the row to a user that does not exist. If your app identifies people by bubble_id,
email, or its own id, put that in **`actor_ref`** (text) and leave
`actor_user_id` NULL — or resolve it across first:

```sql
SELECT id FROM "user" WHERE bubble_id = $1;
```

Always fill `actor_name` too. It is a **snapshot**, deliberately denormalised, so
the feed still reads correctly after someone is renamed or deleted.

Non-human actors are welcome — set `actor_kind` to `system`, `cron`, `webhook`,
or `api` and leave the user columns NULL. Do not skip logging them; a feed that
shows only humans hides half the story.

---

## 6. `description` — fill it in

Technically nullable. In practice, fill it on every write.

`description` is the **pre-rendered display line**, written at the moment you
still have all the context:

> `Nurul sent Receipt RCP-0412 to Ahmad (+6012…)`

The alternative is every reader reconstructing prose from `action` +
`entity_type` + `fields`, which means the shared feed page has to know how to
describe every entity type in every app. It won't. Render once, at write time.

Format that works: **`{who} {did what} {to which thing} ({details})`**.

---

## 7. `metadata` — use it instead of `ALTER TABLE`

Four apps share this table. If every team adds a column, the schema becomes
unmanageable and migrations start blocking each other.

So: anything your app needs that isn't in the schema goes into `metadata` jsonb.

```sql
metadata = '{"quotation_version": 3, "approval_tier": "manager"}'
```

**Do not `ALTER TABLE activity_log` without agreement from the other teams.**
If several apps end up putting the same key in `metadata`, that's the signal to
promote it to a real column — as a coordinated change, not a surprise.

---

## 8. Reading it

Global feed, most recent first:

```sql
SELECT occurred_at, app, actor_name, action, entity_type, entity_label, description
FROM activity_log
ORDER BY occurred_at DESC
LIMIT 50;
```

One app only:

```sql
SELECT * FROM activity_log
WHERE app = 'crm' AND app_env = 'prod'
ORDER BY occurred_at DESC LIMIT 50;
```

Everything one person did:

```sql
SELECT * FROM activity_log
WHERE actor_user_id = 17
ORDER BY occurred_at DESC LIMIT 100;
```

History of one record:

```sql
SELECT * FROM activity_log
WHERE entity_type = 'invoice' AND entity_id = '312'
ORDER BY occurred_at DESC;
```

All four queries hit an index. Two things to keep doing:

- **Paginate with a cursor on `(occurred_at, id)`, not `OFFSET`.** Offset
  pagination degrades as the table grows.
- **Render unknown `action` values with a fallback** —
  `"{actor_name} {action} {entity_type} {entity_label}"` — rather than filtering
  to verbs you recognise. See Rule 4.

---

## 9. Retention

Rows are deleted after **30 days**:

```sql
DELETE FROM activity_log
WHERE occurred_at < now() - interval '30 days'
  AND retain_until IS NULL;
```

**This already runs — you do not need to schedule anything.** `ee-admin` runs it
opportunistically on write (`maybePurgeExpired()` in `src/lib/activity-log.ts`),
at most once per day across all instances. The lock is a row in `app_settings`
under key `activity_log_last_purge`, claimed with an
`ON CONFLICT DO UPDATE ... WHERE` so exactly one instance wins. Do not add a
second purge from your app.

This is a **presentational feed, not a compliance record.** Do not build anything
that depends on rows older than 30 days existing.

If your app genuinely needs a specific row kept longer, set `retain_until` on
that row when you insert it. Don't set it on everything — that defeats the
policy and the table grows without bound.

---

## 10. Registered app slugs

Keep this list current. Add a row when your app starts writing.

| `app` | System | Owner |
|---|---|---|
| `ee-admin` | EE-Admin-v5 (Next.js) | — |
| `agent-os` | Solar Calculator v2 (Node/Express) | — |
| _(add yours)_ | | |

---

## 11. Anti-patterns

- ❌ Deriving `app` from the hostname → Rule 3.
- ❌ A `CHECK` constraint or TS enum on `action` → Rule 4.
- ❌ A foreign key from `activity_log` to `"user"` or any entity table. FKs lock
  the referenced row and would block deleting a user. Also, other apps log actors
  that don't exist in `"user"` at all.
- ❌ DB triggers to populate this table. Triggers run inside your transaction,
  can't tell which button was pressed, and would log every bulk sync and
  migration — burying real human activity under thousands of machine rows.
- ❌ Logging reads. Only log actions that change something or leave the system
  (create, update, delete, save, print, send). Logging page views will flood it.
- ❌ Storing full row payloads in `metadata`. Rows should stay ~250–350 bytes.

---

## 12. Changelog

| Date | Change |
|---|---|
| 2026-07-28 | Table created in `prod_main` with 4 indexes. Verified with an insert/delete round-trip. |
| 2026-07-28 | `ee-admin` wired up: 48 call sites, `/activity` feed page, 30-day lazy purge. |
| 2026-07-28 | `agent-os` (Solar Calculator v2) wired up Phase 1 pilot: invoice create, customer create, claim receipt submit. Verified with an insert/delete round-trip against `prod_main`. |
