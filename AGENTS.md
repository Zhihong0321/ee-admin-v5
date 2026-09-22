# EE-Admin-v5 — agent instructions

## Database

**There is no local database and no local dev server in this project. Never start
one, never seed one, never "test locally".** All data work runs against
`prod_main` through the pg-proxy.

The proxy token is short-lived and supplied by the user — **ask for a fresh one**
rather than searching for a stored credential. Read freely. Before any write:
show the affected rows first, validate the statement with `EXPLAIN`, and get
confirmation. Because it is production, a query that is merely *probably* correct
is not good enough.

`npx tsc --noEmit -p tsconfig.json` typechecks. It proves nothing about SQL —
every bug found in this repo recently has been in SQL that typechecked fine.
Verify data changes by querying prod before and after.

## Photo storage is mid-migration

Invoice site photos are moving from array columns (`invoice.linked_roof_image`,
`invoice.site_assessment_image`, `seda_registration.roof_images`) to the
`ee_attachment` table, one row per photo.

**Before touching any photo read or write, read
[`FIX-UPDATE-EE-Attachment.md`](FIX-UPDATE-EE-Attachment.md).** It carries the
old-vs-new schema mapping, what is already migrated, what is not, and the
verification queries. Working reference implementations are committed in
`src/app/api/engineering-v2/route.ts` (read) and
`src/app/(app)/engineering-v2/actions.ts` (write) — copy those patterns.

Two traps that have already caused real bugs:

- **`ee_attachment.doc_type` is an open taxonomy.** It grew from 2 values to 7
  without warning. Never filter to a hardcoded list — use an allow-list on one
  bucket and a catch-all on the other, so unknown types surface instead of
  silently disappearing.
- **Deletes are soft.** Every read must filter
  `deleted_at IS NULL AND purged_at IS NULL`, or deleted photos come back.

## Identity columns

`user.bubble_id` (a Bubble id like `1725871255370x1468…`) and `user.id` (an
integer) are different keyspaces, and the auth JWT carries the **integer**. Any
column storing a `bubble_id` — `invoice.created_by`, `invoice.linked_agent`,
`ee_attachment.uploaded_by` — needs the integer resolved across to a `bubble_id`
first. Writing the JWT value straight through attributes rows to a user that does
not exist, and it fails silently.

The `agent` table is retired as an identity source. Resolve people via `user`.

## Repo conventions

- `tmp/` and `diag_*.ts` at the repo root are scratch. Never commit them.
- `recycle_bin/` is dead code kept for reference. Do not use it as a pattern and
  do not "fix" it.
- Do not commit `.Codex/settings.local.json`.
- Commit only when asked. If on `main`, branch first.
