import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { invoice_audit_log, invoices, sedaRegistration } from "@/db/schema";
import { requireExternalApiKey } from "@/lib/external-api-auth";
import {
  MATCH_THRESHOLD,
  MAX_CANDIDATES,
  MIN_FIELD_SCORE,
  MIN_SCORE_MARGIN,
  ScoredCandidate,
  getSedaCandidates,
  normalizeStatus,
  roundScore,
  scoreSedaCandidates,
} from "@/lib/seda-matching";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function publicCandidate(candidate: ScoredCandidate) {
  return {
    seda_bubble_id: candidate.bubble_id,
    current_status: candidate.current_status || null,
    matched_name: candidate.customer_name,
    matched_address: candidate.installation_address,
    name_score: roundScore(candidate.name_score),
    address_score: roundScore(candidate.address_score),
    score: roundScore(candidate.score),
  };
}

async function getInvoiceForAudit(bubbleId: string) {
  return db.query.invoices.findFirst({
    where: (invoice, { eq }) => eq(invoice.linked_seda_registration, bubbleId),
    columns: { id: true, invoice_number: true },
  });
}

/**
 * POST /api/v1/seda/status
 * Match an existing SEDA registration by customer name + installation address,
 * then update only its SEDA status.
 */
export async function POST(request: NextRequest) {
  const authError = requireExternalApiKey(request);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 }
    );
  }

  const payload = body as Record<string, unknown>;
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const address =
    typeof payload.address === "string" ? payload.address.trim() : "";
  const status = normalizeStatus(payload.status);
  const dryRun = payload.dry_run === true;

  if (name.length < 2 || name.length > 200) {
    return NextResponse.json(
      { error: "name is required and must be between 2 and 200 characters" },
      { status: 400 }
    );
  }

  if (address.length < 5 || address.length > 500) {
    return NextResponse.json(
      { error: "address is required and must be between 5 and 500 characters" },
      { status: 400 }
    );
  }

  if (!status) {
    return NextResponse.json(
      {
        error: "status must be one of: Pending, Submitted, Approved, APPROVED BY SEDA",
      },
      { status: 400 }
    );
  }

  try {
    const scored = scoreSedaCandidates(await getSedaCandidates(), name, address);
    const best = scored[0];
    const second = scored[1];

    if (!best || best.score < MATCH_THRESHOLD) {
      return NextResponse.json(
        {
          matched: false,
          error: "No SEDA registration met the 90% match threshold",
          threshold: MATCH_THRESHOLD,
          candidates: scored.slice(0, MAX_CANDIDATES).map(publicCandidate),
        },
        { status: 404 }
      );
    }

    const margin = second ? best.score - second.score : best.score;
    const isFieldSafe =
      best.name_score >= MIN_FIELD_SCORE && best.address_score >= MIN_FIELD_SCORE;
    const isUnambiguous = margin >= MIN_SCORE_MARGIN;

    if (!isFieldSafe || !isUnambiguous) {
      return NextResponse.json(
        {
          matched: false,
          error: "Match is ambiguous; no status was changed",
          threshold: MATCH_THRESHOLD,
          minimum_score_margin: MIN_SCORE_MARGIN,
          candidates: scored.slice(0, MAX_CANDIDATES).map(publicCandidate),
        },
        { status: 409 }
      );
    }

    const previousStatus = best.current_status || null;

    if (!dryRun && previousStatus !== status) {
      const [updated] = await db
        .update(sedaRegistration)
        .set({ seda_status: status, updated_at: new Date() })
        .where(sql`${sedaRegistration.bubble_id} = ${best.bubble_id}`)
        .returning({
          bubble_id: sedaRegistration.bubble_id,
          seda_status: sedaRegistration.seda_status,
        });

      if (!updated) {
        return NextResponse.json(
          { error: "SEDA registration was not found during update" },
          { status: 404 }
        );
      }

      const invoice = await getInvoiceForAudit(best.bubble_id);
      await db.insert(invoice_audit_log).values({
        invoice_id: invoice?.id ?? null,
        invoice_number: invoice?.invoice_number ?? null,
        entity_type: "seda",
        entity_id: best.bubble_id,
        action_type: "update",
        changes: [
          {
            field: "seda_status",
            before: previousStatus,
            after: status,
            match_score: roundScore(best.score),
            source: "external-seda-api",
          },
        ],
        source_app: "external-seda-api",
        edited_at: new Date(),
      });
    }

    return NextResponse.json({
      success: true,
      matched: true,
      dry_run: dryRun,
      seda_bubble_id: best.bubble_id,
      previous_status: previousStatus,
      status,
      name_score: roundScore(best.name_score),
      address_score: roundScore(best.address_score),
      score: roundScore(best.score),
      score_margin: roundScore(margin),
      updated: !dryRun && previousStatus !== status,
    });
  } catch (error) {
    console.error("External SEDA status API error:", error);
    return NextResponse.json(
      { error: "Failed to match or update SEDA registration" },
      { status: 500 }
    );
  }
}
