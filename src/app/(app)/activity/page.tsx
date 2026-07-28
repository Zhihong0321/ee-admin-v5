import Link from "next/link";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { Activity, AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type Row = {
  id: string;
  occurred_at: string;
  app: string;
  app_env: string | null;
  actor_kind: string;
  actor_name: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_label: string | null;
  description: string | null;
  fields: string[] | null;
  status: string;
  error_message: string | null;
  source_url: string | null;
};

/** Unknown verbs must render, not vanish — `action` is an open taxonomy and the
 *  whole point is that a new one from another app shows up here on its own. */
const PAST_TENSE: Record<string, string> = {
  create: "created",
  update: "updated",
  delete: "deleted",
  save: "saved",
  print: "printed",
  send: "sent",
  recover: "recovered",
  sync: "synced",
  verify: "verified",
  reconcile: "reconciled",
  calculate: "calculated",
  approve: "approved",
  reject: "rejected",
  upload: "uploaded",
  export: "exported",
  activate: "activated",
};

const ACTION_STYLES: Record<string, string> = {
  create: "bg-emerald-50 text-emerald-700 border-emerald-200",
  update: "bg-blue-50 text-blue-700 border-blue-200",
  delete: "bg-red-50 text-red-700 border-red-200",
  save: "bg-blue-50 text-blue-700 border-blue-200",
  print: "bg-violet-50 text-violet-700 border-violet-200",
  send: "bg-amber-50 text-amber-700 border-amber-200",
};

function actionStyle(action: string) {
  return ACTION_STYLES[action] ?? "bg-secondary-100 text-secondary-700 border-secondary-200";
}

function describe(row: Row): string {
  if (row.description?.trim()) return row.description;
  // Fallback for rows written by an app that didn't pre-render a description.
  const verb = PAST_TENSE[row.action] ?? row.action;
  const subject = row.entity_label || row.entity_id || "";
  const line = [row.actor_name || row.actor_kind, verb, row.entity_type, subject]
    .filter(Boolean)
    .join(" ");
  return row.fields?.length ? `${line} (${row.fields.join(", ")})` : line;
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Today";
  if (same(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "short", year: "numeric" });
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{
    app?: string;
    action?: string;
    entity?: string;
    actor?: string;
    q?: string;
    before?: string;
  }>;
}) {
  const sp = await searchParams;

  const where: any[] = [sql`1=1`];
  if (sp.app) where.push(sql`app = ${sp.app}`);
  if (sp.action) where.push(sql`action = ${sp.action}`);
  if (sp.entity) where.push(sql`entity_type = ${sp.entity}`);
  if (sp.actor) where.push(sql`actor_name = ${sp.actor}`);
  if (sp.q) where.push(sql`(description ILIKE ${"%" + sp.q + "%"} OR entity_label ILIKE ${"%" + sp.q + "%"})`);
  // Cursor pagination on occurred_at — OFFSET degrades as the table grows.
  if (sp.before) where.push(sql`occurred_at < ${sp.before}`);

  const clause = sql.join(where, sql` AND `);

  const [rowsResult, facetsResult, totalResult] = await Promise.all([
    db.execute(sql`
      SELECT id, occurred_at, app, app_env, actor_kind, actor_name, actor_role,
             action, entity_type, entity_id, entity_label, description, fields,
             status, error_message, source_url
      FROM activity_log
      WHERE ${clause}
      ORDER BY occurred_at DESC, id DESC
      LIMIT ${PAGE_SIZE + 1}
    `),
    db.execute(sql`
      SELECT 'app' AS kind, app AS value FROM activity_log WHERE app IS NOT NULL GROUP BY app
      UNION ALL
      SELECT 'action', action FROM activity_log WHERE action IS NOT NULL GROUP BY action
      UNION ALL
      SELECT 'entity', entity_type FROM activity_log WHERE entity_type IS NOT NULL GROUP BY entity_type
      UNION ALL
      SELECT 'actor', actor_name FROM activity_log WHERE actor_name IS NOT NULL GROUP BY actor_name
      ORDER BY 1, 2
    `),
    db.execute(sql`SELECT count(*)::int AS n FROM activity_log`),
  ]);

  const all = rowsResult.rows as unknown as Row[];
  const rows = all.slice(0, PAGE_SIZE);
  const nextCursor = all.length > PAGE_SIZE ? rows[rows.length - 1]?.occurred_at : null;

  const facets = facetsResult.rows as unknown as { kind: string; value: string }[];
  const optionsFor = (kind: string) => facets.filter((f) => f.kind === kind).map((f) => f.value);
  const total = (totalResult.rows[0] as any)?.n ?? 0;

  // Group consecutive rows by calendar day.
  const groups: { day: string; rows: Row[] }[] = [];
  for (const row of rows) {
    const day = dayLabel(row.occurred_at);
    if (groups[groups.length - 1]?.day !== day) groups.push({ day, rows: [] });
    groups[groups.length - 1].rows.push(row);
  }

  const carry = (extra: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...extra })) {
      if (v) params.set(k, v);
    }
    const qs = params.toString();
    return qs ? `/activity?${qs}` : "/activity";
  };

  const hasFilters = Boolean(sp.app || sp.action || sp.entity || sp.actor || sp.q);

  return (
    <div className="max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-secondary-900">
            <Activity className="h-6 w-6 text-primary-600" />
            Activity Log
          </h1>
          <p className="mt-1 text-sm text-secondary-500">
            {total.toLocaleString()} event{total === 1 ? "" : "s"} across all connected apps · kept 30 days
          </p>
        </div>
      </div>

      <form method="GET" className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-secondary-200 bg-white p-4 shadow-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-secondary-500">Search</span>
          <input
            type="text"
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="description or label"
            className="w-56 rounded-md border border-secondary-300 px-3 py-2 text-sm"
          />
        </label>

        {([
          ["app", "App"],
          ["action", "Action"],
          ["entity", "Entity"],
          ["actor", "Who"],
        ] as const).map(([key, label]) => (
          <label key={key} className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-secondary-500">{label}</span>
            <select
              name={key}
              defaultValue={(sp as any)[key] ?? ""}
              className="w-40 rounded-md border border-secondary-300 px-3 py-2 text-sm"
            >
              <option value="">All</option>
              {optionsFor(key).map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        ))}

        <button
          type="submit"
          className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          Filter
        </button>
        {hasFilters && (
          <Link href="/activity" className="px-2 py-2 text-sm text-secondary-500 hover:text-secondary-900">
            Clear
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-secondary-300 bg-white p-12 text-center">
          <Activity className="mx-auto h-8 w-8 text-secondary-300" />
          <p className="mt-3 text-sm font-medium text-secondary-700">
            {hasFilters ? "No activity matches these filters." : "No activity recorded yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.day}>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-secondary-400">{group.day}</h2>
              <div className="overflow-hidden rounded-lg border border-secondary-200 bg-white shadow-sm">
                {group.rows.map((row, i) => (
                  <div
                    key={row.id}
                    className={`flex items-start gap-3 px-4 py-3 ${i > 0 ? "border-t border-secondary-100" : ""} ${
                      row.status === "failed" ? "bg-red-50/40" : ""
                    }`}
                  >
                    <span className="w-12 shrink-0 pt-0.5 font-mono text-xs text-secondary-400">
                      {timeLabel(row.occurred_at)}
                    </span>
                    <span
                      className={`shrink-0 rounded border px-2 py-0.5 text-xs font-semibold ${actionStyle(row.action)}`}
                    >
                      {row.action}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-secondary-900">{describe(row)}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-secondary-400">
                        <span>{row.app}</span>
                        {row.app_env && row.app_env !== "production" && (
                          <span className="rounded bg-amber-100 px-1 text-amber-700">{row.app_env}</span>
                        )}
                        {row.actor_kind !== "user" && <span>· {row.actor_kind}</span>}
                        {row.actor_role && <span>· {row.actor_role}</span>}
                        {row.source_url && <span className="truncate">· {row.source_url}</span>}
                      </div>
                      {row.status === "failed" && row.error_message && (
                        <p className="mt-1 flex items-start gap-1 text-xs text-red-600">
                          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                          <span className="break-all">{row.error_message}</span>
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {nextCursor && (
        <div className="mt-6 text-center">
          <Link
            href={carry({ before: nextCursor })}
            className="inline-block rounded-md border border-secondary-300 bg-white px-5 py-2 text-sm font-medium text-secondary-700 hover:bg-secondary-50"
          >
            Load older
          </Link>
        </div>
      )}
    </div>
  );
}
