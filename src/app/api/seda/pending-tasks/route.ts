import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import {
  findBestSedaMatch,
  getSedaCandidates,
  normalizeStatus,
  roundScore,
} from "@/lib/seda-matching";

interface SedaTaskRow {
  id: number;
  application_number: string | null;
  customer_name: string | null;
  installation_address: string | null;
  status: string;
  requires_manual_review: boolean;
  attempt_count: number;
  last_error: string | null;
  payload: { status?: unknown } | null;
  source_email_id: string;
  created_at: string;
  updated_at: string;
}

type MatchStatus = "already_resolved" | "needs_attention" | "missing_data";

/**
 * GET /api/seda/pending-tasks
 * List PENDING seda_tasks (created by the ee-mail worker) and re-run the same
 * name/address match used by /api/v1/seda/status to see if the target SEDA
 * registration already has the status the task was trying to set — meaning an
 * admin likely already resolved it manually and the task is stale.
 */
export async function GET() {
  try {
    const result = await db.execute(sql`
      SELECT id, application_number, customer_name, installation_address, status,
             requires_manual_review, attempt_count, last_error, payload, source_email_id,
             created_at, updated_at
      FROM seda_tasks
      WHERE status = 'PENDING'
      ORDER BY created_at DESC
      LIMIT 100
    `);

    const tasks = result.rows as unknown as SedaTaskRow[];
    const candidates = await getSedaCandidates();

    const enriched = tasks.map((task) => {
      const targetStatus = normalizeStatus(task.payload?.status) || "Approved";
      const name = task.customer_name?.trim();
      const address = task.installation_address?.trim();

      let matchStatus: MatchStatus = "missing_data";
      let matchedBubbleId: string | null = null;
      let matchedCurrentStatus: string | null = null;
      let matchScore: number | null = null;

      if (name && address) {
        const match = findBestSedaMatch(candidates, name, address);
        matchScore = match.best ? roundScore(match.best.score) : null;

        if (match.matched && match.best) {
          matchedBubbleId = match.best.bubble_id;
          matchedCurrentStatus = match.best.current_status;
          matchStatus =
            normalizeStatus(match.best.current_status) === targetStatus
              ? "already_resolved"
              : "needs_attention";
        } else {
          matchStatus = "needs_attention";
        }
      }

      return {
        ...task,
        target_status: targetStatus,
        match_status: matchStatus,
        matched_bubble_id: matchedBubbleId,
        matched_current_status: matchedCurrentStatus,
        match_score: matchScore,
      };
    });

    return NextResponse.json({
      tasks: enriched,
      needsAttentionCount: enriched.filter((t) => t.match_status !== "already_resolved").length,
    });
  } catch (error) {
    console.error("Error fetching pending SEDA tasks:", error);
    return NextResponse.json(
      { error: "Failed to fetch pending SEDA tasks" },
      { status: 500 }
    );
  }
}
