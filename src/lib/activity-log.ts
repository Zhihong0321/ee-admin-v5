import { db } from "@/lib/db";
import { activity_log } from "@/db/schema";
import { resolveActor } from "@/lib/invoice-edit-logger";
import { headers } from "next/headers";
import { sql } from "drizzle-orm";

/**
 * Cross-app activity log writer. See SOP-SCHEMA-Activity-log.md.
 *
 * The `activity_log` table is shared by every app on prod_main, so this module
 * owns exactly one app's half of the contract: it always stamps `app` from
 * config (never from the URL), always resolves the actor to `user.id` as an
 * integer, and never throws.
 *
 * Rule 1 of the SOP: logging must never break the user's action. Every function
 * here swallows its own errors. If you find yourself wanting to `throw` from
 * this file, the answer is no.
 *
 * Rule 2: call this AFTER the real work has committed, outside its transaction.
 */

/** Explicit slug. Deliberately not derived from the request URL — cron jobs and
 *  webhooks have no URL, and staging/custom domains would fragment one app into
 *  several. See SOP §4 Rule 3. */
const APP_SLUG = process.env.ACTIVITY_LOG_APP_SLUG || "ee-admin";
const APP_ENV = process.env.ACTIVITY_LOG_APP_ENV || process.env.NODE_ENV || "development";

export type ActivityStatus = "success" | "failed";

/** `action` and `entityType` are intentionally plain `string`, not unions.
 *  Constraining them is the ee_attachment.doc_type mistake — a closed list on a
 *  column four apps write to eventually rejects a valid write inside somebody's
 *  save handler. See SOP §4 Rule 4. */
export type ActivityParams = {
  action: string;
  entityType?: string;
  entityId?: string | number | null;
  entityLabel?: string | null;
  /** Pre-rendered display line. Auto-generated when omitted, but supplying a
   *  good one is what makes the feed readable — see SOP §6. */
  description?: string;
  /** Changed column NAMES only. Never values: the shared table must not carry
   *  row payloads or anything sensitive. */
  fields?: string[];
  status?: ActivityStatus;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
  sourceUrl?: string;
  actorKind?: string;
  requestId?: string;
};

const PAST_TENSE: Record<string, string> = {
  create: "created",
  update: "updated",
  delete: "deleted",
  save: "saved",
  print: "printed",
  send: "sent",
  recover: "recovered",
  sync: "synced",
  approve: "approved",
  reject: "rejected",
  upload: "uploaded",
  export: "exported",
};

/** Unknown verbs pass through unchanged rather than being dropped or mapped to a
 *  default — the whole point of the open taxonomy is that new actions surface. */
function verb(action: string): string {
  return PAST_TENSE[action] ?? action;
}

function autoDescribe(
  actorName: string,
  p: ActivityParams,
): string {
  const subject = p.entityLabel || p.entityId || "";
  const parts = [actorName, verb(p.action), p.entityType, subject].filter(Boolean);
  let line = parts.join(" ").trim();
  if (p.fields?.length) line += ` (${p.fields.join(", ")})`;
  if (p.status === "failed") line += " — FAILED";
  return line;
}

/** Best-effort request context. Outside a request scope (cron, script) `headers()`
 *  throws; that is expected and not worth logging. */
async function requestContext(): Promise<{ ip?: string; userAgent?: string; url?: string }> {
  try {
    const h = await headers();
    return {
      ip:
        h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        h.get("x-real-ip") ||
        undefined,
      userAgent: h.get("user-agent") || undefined,
      url: h.get("referer") || undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Record one activity row. Never throws, never rejects.
 *
 * Awaited rather than fire-and-forget: this app runs on a long-lived pg Pool,
 * so the insert costs a couple of milliseconds and we would rather have the row
 * than save the round-trip.
 */
export async function logActivity(params: ActivityParams): Promise<void> {
  try {
    const actor = await resolveActor();
    const ctx = await requestContext();

    // The JWT carries `user.id` as an INTEGER. A bubble_id here would attribute
    // the row to a user that does not exist, silently. See SOP §5.
    const parsedId = parseInt(actor.userId, 10);
    const actorUserId = Number.isFinite(parsedId) ? parsedId : null;
    const actorKind =
      params.actorKind ?? (actorUserId === null ? "system" : "user");

    await db.insert(activity_log).values({
      app: APP_SLUG,
      app_env: APP_ENV,
      source_url: params.sourceUrl ?? ctx.url ?? null,
      actor_kind: actorKind,
      actor_user_id: actorUserId,
      actor_ref: actor.phone || null,
      actor_name: actor.name || null,
      actor_role: actor.role || null,
      action: params.action,
      entity_type: params.entityType ?? null,
      entity_id:
        params.entityId === null || params.entityId === undefined
          ? null
          : String(params.entityId),
      entity_label: params.entityLabel ?? null,
      description: params.description ?? autoDescribe(actor.name, params),
      fields: params.fields?.length ? params.fields : null,
      status: params.status ?? "success",
      error_message: params.errorMessage ?? null,
      request_id: params.requestId ?? null,
      ip: ctx.ip ?? null,
      user_agent: ctx.userAgent ?? null,
      metadata: params.metadata ?? {},
    });

    // Not awaited: the daily purge must not add latency to a user's save.
    void maybePurgeExpired();
  } catch (error) {
    // Swallowed on purpose. A missing activity row is a gap in a feed; a throw
    // here would turn it into a failed user action.
    console.error("[activity-log] failed to record activity:", error);
  }
}

// ---------------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------------

export const RETENTION_DAYS = 30;

const PURGE_SETTING_KEY = "activity_log_last_purge";
const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

/** In-process throttle so a busy server doesn't query app_settings on every
 *  single write. The app_settings row is still the real lock — this only keeps
 *  us from asking it too often. */
let lastCheckedAt = 0;

/**
 * Delete rows past the retention window, at most once a day across all server
 * instances. There is no cron in this project, so the purge rides along on
 * writes; `app_settings` is the cross-instance lock.
 *
 * Never throws.
 */
export async function maybePurgeExpired(): Promise<void> {
  const now = Date.now();
  if (now - lastCheckedAt < CHECK_INTERVAL_MS) return;
  lastCheckedAt = now;

  try {
    const cutoff = new Date(now - PURGE_INTERVAL_MS).toISOString();
    const stamp = new Date(now).toISOString();

    // Atomic claim: the UPDATE only fires if the stored timestamp is older than
    // the cutoff, so exactly one instance wins and the rest get zero rows back.
    const claimed = await db.execute(sql`
      INSERT INTO app_settings (key, value)
      VALUES (${PURGE_SETTING_KEY}, ${stamp})
      ON CONFLICT (key) DO UPDATE
        SET value = ${stamp}, updated_at = now()
        WHERE app_settings.value < ${cutoff}
      RETURNING key
    `);

    if (claimed.rowCount === 0) return;

    const deleted = await db.execute(sql`
      DELETE FROM activity_log
      WHERE occurred_at < now() - (${RETENTION_DAYS} || ' days')::interval
        AND retain_until IS NULL
    `);

    console.log(`[activity-log] purged ${deleted.rowCount ?? 0} row(s) older than ${RETENTION_DAYS} days`);
  } catch (error) {
    console.error("[activity-log] purge failed:", error);
  }
}

/** Convenience wrapper for actions that can fail: records `success` or `failed`
 *  and re-throws the original error untouched. */
export async function logActivityResult<T>(
  params: ActivityParams,
  work: () => Promise<T>,
): Promise<T> {
  try {
    const result = await work();
    await logActivity({ ...params, status: "success" });
    return result;
  } catch (error) {
    await logActivity({
      ...params,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
