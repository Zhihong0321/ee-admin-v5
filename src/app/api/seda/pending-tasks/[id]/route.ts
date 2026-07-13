import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import {
  MATCH_THRESHOLD,
  MIN_FIELD_SCORE,
  MIN_SCORE_MARGIN,
  getSedaCandidates,
  normalizeStatus,
  roundScore,
  scoreSedaCandidates,
} from "@/lib/seda-matching";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

interface SedaTaskRow {
  id: number;
  application_number: string | null;
  customer_name: string | null;
  installation_address: string | null;
  status: string;
  requires_manual_review: boolean;
  last_error: string | null;
  payload: { status?: unknown; name_candidates?: unknown } | null;
  created_at: string;
}

/**
 * GET /api/seda/pending-tasks/:id
 * Diagnose why a pending SEDA task couldn't auto-match: shows the name/address
 * the email worker extracted alongside the closest SEDA Registration candidates
 * and their individual field scores, so an admin can see exactly what's off.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const taskId = Number(id);
    if (!Number.isFinite(taskId)) {
      return NextResponse.json({ error: "Invalid task id" }, { status: 400 });
    }

    const result = await db.execute(sql`
      SELECT id, application_number, customer_name, installation_address, status,
             requires_manual_review, last_error, payload, created_at
      FROM seda_tasks
      WHERE id = ${taskId}
      LIMIT 1
    `);

    const task = (result.rows as unknown as SedaTaskRow[])[0];
    if (!task) {
      return NextResponse.json({ error: "SEDA task not found" }, { status: 404 });
    }

    const targetStatus = normalizeStatus(task.payload?.status) || "Approved";
    const name = task.customer_name?.trim() || "";
    const address = task.installation_address?.trim() || "";

    const scored = name && address ? scoreSedaCandidates(await getSedaCandidates(), name, address) : [];

    return NextResponse.json({
      task: {
        id: task.id,
        application_number: task.application_number,
        customer_name: task.customer_name,
        installation_address: task.installation_address,
        last_error: task.last_error,
        target_status: targetStatus,
      },
      thresholds: {
        match_threshold: MATCH_THRESHOLD,
        min_field_score: MIN_FIELD_SCORE,
        min_score_margin: MIN_SCORE_MARGIN,
      },
      candidates: scored.slice(0, 5).map((candidate) => ({
        bubble_id: candidate.bubble_id,
        customer_name: candidate.customer_name,
        installation_address: candidate.installation_address,
        current_status: candidate.current_status,
        name_score: roundScore(candidate.name_score),
        address_score: roundScore(candidate.address_score),
        score: roundScore(candidate.score),
        invoice_number: candidate.invoice_number,
        percent_of_total_amount: candidate.percent_of_total_amount,
        has_required_payment: candidate.has_required_payment,
      })),
    });
  } catch (error) {
    console.error("Error diagnosing pending SEDA task:", error);
    return NextResponse.json(
      { error: "Failed to diagnose pending SEDA task" },
      { status: 500 }
    );
  }
}
