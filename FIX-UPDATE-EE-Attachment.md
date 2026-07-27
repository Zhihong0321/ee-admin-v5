# Fix / update — migrate photo reads and writes to `ee_attachment`

Status: in progress. Started 2026-07-27.

`ee_attachment` is the new source of truth for invoice site photos, replacing the
array columns `invoice.linked_roof_image` and `invoice.site_assessment_image`.
This tracks every remaining reader and writer that still assumes the old shape,
plus the UI and API-contract work needed for the screens to express the new one.

---

## Start here

If you are picking this up cold, in this order:

1. **Read the reference implementation before the prose.** The canonical read is
   already written, prod-verified, and committed:
   [`src/app/api/engineering-v2/route.ts`](src/app/api/engineering-v2/route.ts) —
   the two `LEFT JOIN LATERAL` blocks and the `dropSuppressed` merge. The
   canonical write is
   [`src/app/(app)/engineering-v2/actions.ts`](src/app/(app)/engineering-v2/actions.ts) —
   the `if (docType)` branch. **Copy those patterns. Do not re-derive them from
   the SQL snippets below** — the snippets are documentation and drift; the code
   is what actually ran against prod.
2. Read "Old schema vs new schema" for the shape change.
3. Read "Background" for the three rules that make it easy to get wrong.
4. Pick a task. Tier 1 and Tier 2 are the real work and should land together.

**State as of 2026-07-27:** engineering-v2 read and write paths are migrated and
committed on branch `feat/engineering-v2-ee-attachment` (`54d22aa` code,
`8ff24b2` this doc). Nothing pushed. Everything else in the task list is open.

**Database access.** No local dev server and no local database in this repo —
ever. Use the read-only pg-proxy against `prod_main`. The token is short-lived
and supplied by the user: **ask for a fresh one**, don't hunt for a stored
credential. Validate writes with `EXPLAIN` before running them, and never run a
destructive statement without showing the affected rows first.

**Line numbers in this document are hints, not addresses.** They were accurate
when written and go stale on the first edit. Grep for the symbol or the column
name instead of trusting the number.

**Do not do these without asking:**
- Backfilling the 156 unbackfilled SEDA photos into `ee_attachment` — this was
  offered and explicitly declined once. It is still an open decision, not a task.
- Changing the Bubble sync mappings so they stop writing the legacy columns.
  Historical photos would stop arriving.
- Committing anything under `tmp/`, or `.claude/settings.local.json`.

**Every change must be verified against prod, not just typechecked.** The
required evidence is a before/after photo-count comparison showing no invoice
loses anything — query at the bottom of this file. A clean `tsc` proves nothing
about SQL, which is where every bug in this migration has been so far.

---

## Old schema vs new schema

### Shape

**Old** — photos were array elements on the owning row. Two columns on `invoice`,
two more on `seda_registration`, all `text[]` of URLs:

```
invoice.linked_roof_image      text[]   -- roof photos
invoice.site_assessment_image  text[]   -- site assessment photos
seda_registration.roof_images  text[]   -- roof photos reached via linked_seda_registration
seda_registration.site_images  text[]   -- empty in prod, 0 URLs
```

**New** — one row per photo in `ee_attachment`, addressed by owner rather than
owned by a column.

### Field mapping

| Old | New |
|---|---|
| `invoice.linked_roof_image[]` | row with `doc_type = 'roof_angle'` |
| `invoice.site_assessment_image[]` | row with `doc_type = 'site_other'` |
| the array element (URL string) | `file_url` — byte-identical, not rewritten |
| the invoice the array hung off | `owner_type = 'invoice'`, `owner_id = invoice.bubble_id` |
| position in the array | `sort_order` |
| `array_append(...)` to add | `INSERT` one row |
| `array_remove(...)` to delete | set `deleted_at` — **the row stays** |
| *(no equivalent)* | `category`, `module` — grouping above `doc_type` |
| *(no equivalent)* | uploader, size, mime, checksum, timestamps, GPS, caption |

### What genuinely changed, not just moved

**Delete became non-destructive.** Removing a photo used to make its URL vanish
from the array. Now it sets `deleted_at` and the row remains, so every read needs
`deleted_at IS NULL AND purged_at IS NULL`. `purged_at` is a second, harder stage
— currently 0 rows — for when the file itself is destroyed.

**Type went from 2 buckets to an open taxonomy.** The array column *was* the
type: a URL in `linked_roof_image` was a roof photo by definition. Now type is
`doc_type`, a free-text column that already holds 7 distinct values and grows
without migration or warning.

**Photos gained identity.** An array element had no id — you could only address
it by string equality on the URL, and you could not attach anything to it. A row
has `id`, so it can be soft-deleted, reordered, captioned, and audited
individually.

**Ordering became explicit.** Array position was implicit and shifted whenever an
element was removed. `sort_order` is a stored integer, stable across deletes.

**Provenance is recorded.** Who uploaded it, when, from what file, how big, and
its sha256 — none of which an array of URLs could express.

### `ee_attachment` columns

31 columns. Grouped by what they're for:

| group | columns |
|---|---|
| identity | `id` |
| ownership | `owner_type`, `owner_id`, `linked_customer` |
| classification | `module`, `category`, `doc_type`, `sort_order`, `caption` |
| the file | `file_url`, `storage_subdir`, `storage_key`, `original_filename`, `mime_type`, `size_bytes`, `checksum_sha256` |
| provenance | `uploaded_by`, `uploaded_by_name`, `uploaded_by_role`, `uploaded_at`, `taken_at`, `gps_lat`, `gps_lng` |
| lifecycle | `deleted_at`, `deleted_by`, `deleted_by_name`, `restored_at`, `restored_by`, `purged_at` |
| misc | `metadata_json`, `updated_at` |

`NOT NULL` with no default — must be supplied on every insert: `owner_type`,
`owner_id`, `module`, `category`, `doc_type`, `file_url`. (`sort_order`,
`uploaded_at`, `metadata_json`, `updated_at` have defaults; `id` is a sequence.)

Indexed on `(owner_type, owner_id, doc_type)` as `idx_ee_attachment_owner_doc_type`.

---

## Background — read this before touching anything

Three facts drive every decision below.

**1. Deletes are soft.** A deleted photo keeps its row and gets `deleted_at` set.
Every read **must** filter `deleted_at IS NULL AND purged_at IS NULL`. Miss it and
deleted photos reappear on screen. This is the single most likely bug in the
migration.

**2. `doc_type` is an open, growing taxonomy.** It held only `roof_angle` and
`site_other` until 2026-07-26, when `house_front`, `house_db`, `sunpath`,
`inverter_location` and `roof_closeup` started landing from the `invoice-office`
module. Never filter to a known list — use an allow-list on the roof side and a
**catch-all** on the site side, so unrecognised types surface instead of
vanishing. Hardcoding two types already cost 10 photos once.

**3. `ee_attachment` is not complete, so reads must union.** Two populations of
data exist and neither is a superset of the other:

| source | holds | why it can't be dropped |
|---|---|---|
| `ee_attachment` | everything backfilled + everything the new system uploads | — |
| `invoice.linked_roof_image` / `site_assessment_image` | pre-cutover history, still written by the Bubble sync | sync keeps writing them |
| `seda_registration.roof_images` | 156 photos across 88 invoices | never backfilled |

Invoices created in the new system (UUID `bubble_id`, `invoice_id IS NULL`) have
no legacy data at all. Invoices synced from Bubble may have no `ee_attachment`
rows yet. A read that picks only one source is wrong for one of the two.

### The canonical read

```sql
-- live set, bucketed
array_agg(a.file_url ORDER BY a.sort_order NULLS LAST, a.id)
  FILTER (WHERE a.doc_type IN ('roof_angle','roof_closeup'))                    AS ee_roof,
array_agg(a.file_url ORDER BY a.sort_order NULLS LAST, a.id)
  FILTER (WHERE COALESCE(a.doc_type,'') NOT IN ('roof_angle','roof_closeup'))   AS ee_site
FROM ee_attachment a
WHERE a.owner_type = 'invoice'
  AND a.owner_id   = <invoice.bubble_id>
  AND a.category   = 'site_assessment'
  AND a.deleted_at IS NULL
  AND a.purged_at  IS NULL
```

then union with the legacy arrays and subtract the suppressed set:

```
roof = ee_roof ∪ invoice.linked_roof_image     ∪ seda.roof_images
site = ee_site ∪ invoice.site_assessment_image ∪ seda.site_images
       └── minus every file_url whose ee_attachment row has deleted_at or purged_at set
```

The subtraction is mandatory. Without it the union resurrects deleted photos
through the legacy arrays.

### The canonical write

One row per photo. Required (`NOT NULL`, no default): `owner_type`, `owner_id`,
`module`, `category`, `doc_type`, `file_url`.

- `owner_type` = `'invoice'`, `owner_id` = `invoice.bubble_id`
- `module` = `'invoice-office'`, `category` = `'site_assessment'`
- `sort_order` = `SELECT COALESCE(MAX(sort_order)+1, 0)` for this owner + doc_type,
  ignoring soft-deleted rows
- `uploaded_by` takes a **user `bubble_id`**, but the JWT carries the integer
  `users.id`. Resolve `users.id → users.bubble_id` first. Writing the JWT value
  raw misattributes the upload to a nonexistent user.
- also populate `linked_customer`, `storage_subdir`, `storage_key`,
  `original_filename`, `mime_type`, `size_bytes`, `checksum_sha256`

---

## Task list

### Done

- [x] **Engineering v2 read path** — [`src/app/api/engineering-v2/route.ts`](src/app/api/engineering-v2/route.ts)
      Union of all three sources, suppression subtraction, roof allow-list +
      site catch-all. Verified: +20 photos rendered, 0 regressions across 5,619
      live invoices.
- [x] **Engineering v2 write path** — [`src/app/(app)/engineering-v2/actions.ts`](src/app/(app)/engineering-v2/actions.ts)
      Roof and site uploads insert an `ee_attachment` row. `pv` and `eng` still
      append to legacy columns (not migrated). Insert validated with `EXPLAIN`.

Committed on branch `feat/engineering-v2-ee-attachment` as `54d22aa`.

### Tier 1 — broken now, user-facing

- [ ] **T1.1 — `/engineering` v1 list + counts**
      [`src/app/(app)/engineering/actions.ts:111,113,129`](src/app/(app)/engineering/actions.ts:111)
      and [`:190,192,208`](src/app/(app)/engineering/actions.ts:190)
      Two separate query functions both compute `roofImageCount` from the legacy
      arrays only. Undercounts new uploads, still counts all soft-deleted photos.
      Apply the canonical read to both.

- [ ] **T1.2 — `/engineering` v1 detail panel**
      [`engineering-client.tsx:465,469`](src/app/(app)/engineering/engineering-client.tsx:465) renders `invoice_linked_roof_image`;
      [`:491,508`](src/app/(app)/engineering/engineering-client.tsx:491) renders `seda_roof_images`;
      [`:157,194`](src/app/(app)/engineering/engineering-client.tsx:157) mutates those arrays for optimistic updates.
      Feed it the unioned list from T1.1 instead of the raw columns.

- [ ] **T1.3 — SEDA ZIP export**
      [`src/app/api/seda/[bubble_id]/download/route.ts:81-82`](src/app/api/seda/[bubble_id]/download/route.ts:81)
      Packages `roof_images` / `site_images` only. Photos living solely in
      `ee_attachment` are silently missing from the customer's download.
      **Highest severity on this list** — the artifact leaves the building and
      nobody can see what was omitted.

### Tier 2 — write paths that bypass `ee_attachment`

Do these together with Tier 1. Fixing v1's reads alone leaves it creating photos
v2 can't soft-delete, and vice versa.

- [ ] **T2.1 — v1 upload**
      [`src/app/(app)/engineering/actions.ts:265-266`](src/app/(app)/engineering/actions.ts:265)
      Appends roof photos to `seda.roof_images`. Switch to an `ee_attachment`
      insert using the canonical write.

- [ ] **T2.2 — v1 delete**
      [`src/app/(app)/engineering/actions.ts:311-312`](src/app/(app)/engineering/actions.ts:311)
      Filters the URL out of the SEDA array and never sets `deleted_at`, so
      deleting in v1 leaves the photo visible in v2. Must set `deleted_at`,
      `deleted_by`, `deleted_by_name` on the matching row.

### Tier U — UI and API contract

Everything above only makes the *data* correct. These make the screens reflect
it. **U0 blocks U1–U3** — the current API contract cannot express `doc_type`, so
no amount of client work fixes the UI until the shape changes.

- [ ] **U0 — widen the API response shape** *(prerequisite)*
      [`src/app/api/engineering-v2/route.ts:190`](src/app/api/engineering-v2/route.ts:190)
      returns `roof_images: string[]` — flat URLs, `doc_type` and `sort_order`
      discarded at the boundary. Change to an object per photo:
      `{ url, doc_type, sort_order, attachment_id, source: 'ee_attachment' | 'legacy' | 'seda' }`.
      `attachment_id` is required for U3 (nothing else identifies the row to
      soft-delete); `source` is what drives the migration-state badge.
      Update the `InvoiceRow` type at
      [`engineering-v2-client.tsx:35-38`](src/app/(app)/engineering-v2/engineering-v2-client.tsx:35)
      and the consumer at [`:342`](src/app/(app)/engineering-v2/engineering-v2-client.tsx:342).

- [ ] **U1 — show `doc_type` per photo**
      A chip on each tile. Keeps the taxonomy visible without the tab strip
      growing from 4 to 7 to 12. Depends on U0.

- [ ] **U2 — let uploads choose a `doc_type`**
      [`engineering-v2-client.tsx:87-94`](src/app/(app)/engineering-v2/engineering-v2-client.tsx:87)
      hardcodes four buckets, so this app can only ever write `roof_angle` or
      `site_other` — 5 of the 7 live types are unreachable from here. Uploading a
      sunpath or DB-box photo is currently impossible in Admin. Add a doc_type
      picker on upload, populated from the live taxonomy rather than a constant.

- [ ] **U3 — add a delete affordance to v2**
      [`engineering-v2-client.tsx`](src/app/(app)/engineering-v2/engineering-v2-client.tsx)
      imports `uploadAttachment` only — there is no delete in v2 at all. Deletes
      are soft now, so this is a new server action setting `deleted_at`,
      `deleted_by`, `deleted_by_name`. Pairs with T2.2 so both screens delete the
      same way. Depends on U0 for `attachment_id`.

- [ ] **U4 — tab membership from data, not constants**
      Roof stays an allow-list; site becomes the visible catch-all so an
      unrecognised `doc_type` lands somewhere a human can see it. Mirror the same
      rule the API uses — do not invent a second bucketing scheme in the client.

- [ ] **U5 — v1 has no Site Assessment tab**
      [`engineering-client.tsx`](src/app/(app)/engineering/engineering-client.tsx)
      shows roof images and drawings only. Site assessment photos are invisible
      there entirely. Decide: add the tab, or retire v1 in favour of v2 rather
      than migrating a screen you intend to delete.

### Tier 3 — file plumbing, no visible breakage yet

These move, rename, or migrate files in storage by walking array columns. None
know `ee_attachment` exists, so new photos are excluded from all of them.
Mechanical, lower stakes, safe to do as a follow-up commit.

- [ ] **T3.1** — [`src/lib/file-migration.ts:74-75`](src/lib/file-migration.ts:74)
- [ ] **T3.2** — [`src/lib/seda-file-renamer.ts:37-38`](src/lib/seda-file-renamer.ts:37)
- [ ] **T3.3** — [`src/app/sync/actions/bubble-file-migration.ts:127-128`](src/app/sync/actions/bubble-file-migration.ts:127)
- [ ] **T3.4** — [`src/app/sync/actions/utilities.ts:215-216`](src/app/sync/actions/utilities.ts:215) and [`:531-532`](src/app/sync/actions/utilities.ts:531)
- [ ] **T3.5** — [`src/app/api/sync/invoice/route.ts:307`](src/app/api/sync/invoice/route.ts:307)
- [ ] **T3.6** — [`src/app/(app)/manage-company/storage-actions.ts:211`](src/app/(app)/manage-company/storage-actions.ts:211)
      Already a no-op `TODO(array-fields)`, so the "Roof & Site Photos" button in
      [`manage-company/page.tsx:167`](src/app/(app)/manage-company/page.tsx:167)
      does nothing today either way. Either implement it against `ee_attachment`
      or delete the category.

### Leave alone — deliberately still legacy

Not bugs. Changing these breaks historical sync.

- [`complete-bubble-mappings.ts:46,226-227`](src/lib/complete-bubble-mappings.ts:46), [`sync-idlist.ts:332-333`](src/lib/bubble/sync-idlist.ts:332), [`bubble/types.ts:145-146`](src/lib/bubble/types.ts:145) — Bubble→Postgres sync must keep writing the legacy columns.
- [`schema.ts:107,109,250,305`](src/db/schema.ts:107) — column definitions.
- [`engineering-v2-client.tsx:35,342`](src/app/(app)/engineering-v2/engineering-v2-client.tsx:35) — consumes the already-migrated API output.

### Not production

`diag_seda_images.ts`, `diag_seda_images2.ts`, `diag_tagged_invoices.ts`,
`diag_out.json` (repo root); all of `recycle_bin/`; `FEATURE-TRACKER.md`.
[`db-inspector/page.tsx:59,82,92`](src/app/(app)/db-inspector/page.tsx:59) is
column-name lists for a debug screen — cosmetic only.

---

## Checklist — per change

Run through this for every task before marking it done.

- [ ] Read filters `deleted_at IS NULL AND purged_at IS NULL`
- [ ] Read unions `ee_attachment` + legacy invoice arrays + `seda_registration`
- [ ] Suppressed URLs subtracted after the union
- [ ] Roof is an allow-list, site is a catch-all — no closed `doc_type` list anywhere
- [ ] Write resolves `users.id → users.bubble_id` for `uploaded_by`
- [ ] Write computes `sort_order` from live rows only
- [ ] Delete sets `deleted_at` rather than removing the row or editing an array
- [ ] `npx tsc --noEmit -p tsconfig.json` exits 0
- [ ] New SQL validated against prod — `EXPLAIN` for writes, execute for reads
- [ ] Photo count compared before/after: no invoice loses anything

## Checklist — before the whole migration is called done

- [ ] Every Tier 1, Tier 2 and Tier U item closed
- [ ] v1 and v2 show identical photo sets for the same invoice
- [ ] Deleting a photo in either screen hides it in both
- [ ] SEDA ZIP export contains every photo both screens show
- [ ] Every one of the 7 live `doc_type` values can be uploaded from Admin, not
      just the 2 the old bucket names map to
- [ ] A photo with an unrecognised `doc_type` is visible on screen, not silently
      filtered — test by inserting a junk type and confirming it appears
- [ ] Decide the fate of the 156 unbackfilled `seda_registration.roof_images`
      photos — backfill them into `ee_attachment`, or keep the SEDA union
      permanently. Currently unresolved; the union is load-bearing until then.
- [ ] Decide whether `pv_system_drawing` and `drawing_engineering_seda_pdf`
      migrate under their own `category`, or stay legacy forever. Pick
      deliberately rather than letting it drift.
- [ ] Admin OS team notified of the two corrections: `doc_type` is an open set of
      7 and growing, not a closed set of 2; and the row count in the handover
      message was stale.

---

## Verification queries

Point these at the pg-proxy (`prod_main`). Read-only unless noted.

**Current doc_type taxonomy** — re-run before assuming any list is complete:

```sql
SELECT owner_type, category, module, doc_type, COUNT(*) AS n,
       MIN(uploaded_at) AS first_up, MAX(uploaded_at) AS last_up
FROM ee_attachment
GROUP BY 1,2,3,4
ORDER BY n DESC;
```

**Photos reachable from an invoice but missing from `ee_attachment`** (the SEDA gap):

```sql
SELECT COUNT(*) AS missing, COUNT(DISTINCT i.bubble_id) AS invoices
FROM invoice i
JOIN seda_registration sr ON sr.bubble_id = i.linked_seda_registration
CROSS JOIN LATERAL unnest(
  COALESCE(sr.roof_images, ARRAY[]::text[]) || COALESCE(sr.site_images, ARRAY[]::text[])
) AS u(url)
WHERE NOT EXISTS (
  SELECT 1 FROM ee_attachment a
  WHERE a.owner_type = 'invoice' AND a.owner_id = i.bubble_id AND a.file_url = u.url
);
```

**Soft-deleted rows still present in a legacy array** — must stay 0, or the
suppression subtraction is load-bearing rather than defensive:

```sql
SELECT COUNT(*) FROM ee_attachment a
WHERE a.owner_type = 'invoice' AND a.deleted_at IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM invoice i
    WHERE i.bubble_id = a.owner_id
      AND a.file_url = ANY(
        COALESCE(i.linked_roof_image, ARRAY[]::text[]) ||
        COALESCE(i.site_assessment_image, ARRAY[]::text[]))
  );
```

**Before/after regression check — required evidence for any read change.**
`regressions` must be 0. A positive `new_*` delta is good (photos recovered); any
regression means an invoice lost something and the change is wrong.

```sql
WITH live AS (
  SELECT inv.bubble_id,
    COALESCE(inv.linked_roof_image,     ARRAY[]::text[]) AS leg_roof,
    COALESCE(inv.site_assessment_image, ARRAY[]::text[]) AS leg_site,
    COALESCE(sr.roof_images,            ARRAY[]::text[]) AS seda_roof,
    COALESCE(sr.site_images,            ARRAY[]::text[]) AS seda_site,
    COALESCE(att.ee_roof,               ARRAY[]::text[]) AS ee_roof,
    COALESCE(att.ee_site,               ARRAY[]::text[]) AS ee_site,
    COALESCE(sup.urls,                  ARRAY[]::text[]) AS sup
  FROM invoice inv
  LEFT JOIN seda_registration sr ON inv.linked_seda_registration = sr.bubble_id
  LEFT JOIN LATERAL (
    SELECT array_agg(a.file_url) FILTER (WHERE a.doc_type IN ('roof_angle','roof_closeup')) AS ee_roof,
           array_agg(a.file_url) FILTER (WHERE COALESCE(a.doc_type,'') NOT IN ('roof_angle','roof_closeup')) AS ee_site
    FROM ee_attachment a
    WHERE a.owner_type='invoice' AND a.owner_id=inv.bubble_id
      AND a.category='site_assessment' AND a.deleted_at IS NULL AND a.purged_at IS NULL
  ) att ON TRUE
  LEFT JOIN LATERAL (
    SELECT array_agg(a.file_url) AS urls FROM ee_attachment a
    WHERE a.owner_type='invoice' AND a.owner_id=inv.bubble_id
      AND (a.deleted_at IS NOT NULL OR a.purged_at IS NOT NULL)
  ) sup ON TRUE
  WHERE inv.is_latest = true
    AND COALESCE(inv.is_deleted,false) = false
    AND inv.status <> 'deleted'
)
SELECT
  sum(cardinality(leg_roof || seda_roof))                                    AS old_roof_rough,
  sum((SELECT count(*) FROM (SELECT DISTINCT u FROM unnest(ee_roof || leg_roof || seda_roof) u
        WHERE u <> ALL(sup)) q))                                             AS new_roof,
  count(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM unnest(leg_roof || seda_roof) o
    WHERE o <> ALL(ee_roof || leg_roof || seda_roof) OR o = ANY(sup)))       AS roof_regressions,
  count(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM unnest(leg_site || seda_site) o
    WHERE o <> ALL(ee_site || leg_site || seda_site) OR o = ANY(sup)))       AS site_regressions,
  count(*)                                                                   AS invoices
FROM live;
```

---

## Reference figures

Snapshot taken 2026-07-27. The table is live and growing — re-measure before
quoting any of these.

| metric | value |
|---|---|
| `ee_attachment` rows | 3,039 |
| soft-deleted | 115 |
| purged | 0 |
| distinct doc_types | 7 |
| SEDA roof photos never backfilled | 156 across 88 invoices |
| photos recovered by the v2 read fix | +20 (11 roof, 9 site) |
| regressions from the v2 read fix | 0 across 5,619 live invoices |
