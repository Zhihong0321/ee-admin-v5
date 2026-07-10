import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { invoice_audit_log, invoices, sedaRegistration } from "@/db/schema";
import { requireExternalApiKey } from "@/lib/external-api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MATCH_THRESHOLD = 0.9;
const MIN_FIELD_SCORE = 0.85;
const MIN_SCORE_MARGIN = 0.05;
const MAX_CANDIDATES = 5;

const STATUS_ALIASES: Record<string, string> = {
  pending: "Pending",
  submitted: "Submitted",
  approved: "Approved",
  "approved by seda": "APPROVED BY SEDA",
};

interface SedaCandidate {
  bubble_id: string;
  current_status: string | null;
  customer_name: string;
  installation_address: string;
}

interface ScoredCandidate extends SedaCandidate {
  name_score: number;
  address_score: number;
  score: number;
}

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-MY")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    previous = current;
  }

  return previous[b.length];
}

function ratio(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

function fieldScore(left: string, right: string): number {
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return 0;
  if (a === b) return 1;

  const aTokens = [...new Set(a.split(" "))];
  const bTokens = [...new Set(b.split(" "))];
  const bTokenSet = new Set(bTokens);
  const intersection = aTokens.filter((token) => bTokenSet.has(token)).length;
  const union = new Set([...aTokens, ...bTokens]).size;
  const tokenJaccard = union ? intersection / union : 0;
  const tokenContainment =
    Math.min(aTokens.length, bTokens.length) > 0
      ? intersection / Math.min(aTokens.length, bTokens.length)
      : 0;
  const orderedRatio = ratio(a, b);
  const sortedRatio = ratio(
    [...aTokens].sort().join(" "),
    [...bTokens].sort().join(" ")
  );

  // Token order is unreliable in Malaysian addresses; character similarity
  // still helps catch small spelling and formatting differences.
  return Math.min(
    1,
    0.35 * orderedRatio +
      0.35 * sortedRatio +
      0.2 * tokenContainment +
      0.1 * tokenJaccard
  );
}

function roundScore(score: number): number {
  return Math.round(score * 1000) / 1000;
}

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

function normalizeStatus(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return STATUS_ALIASES[value.trim().toLocaleLowerCase("en-MY")] || null;
}

async function getCandidates(): Promise<SedaCandidate[]> {
  const result = await db.execute(sql`
    SELECT
      sr.bubble_id,
      sr.seda_status AS current_status,
      sr.installation_address,
      c.name AS customer_name
    FROM seda_registration sr
    LEFT JOIN LATERAL (
      SELECT i.linked_customer
      FROM invoice i
      WHERE i.linked_seda_registration = sr.bubble_id
         OR i.bubble_id = ANY(sr.linked_invoice)
      ORDER BY i.updated_at DESC NULLS LAST, i.id DESC
      LIMIT 1
    ) linked_invoice ON TRUE
    INNER JOIN customer c
      ON c.customer_id = COALESCE(NULLIF(sr.linked_customer, ''), linked_invoice.linked_customer)
    WHERE NULLIF(TRIM(sr.bubble_id), '') IS NOT NULL
      AND NULLIF(TRIM(c.name), '') IS NOT NULL
      AND NULLIF(TRIM(sr.installation_address), '') IS NOT NULL
  `);

  return result.rows as unknown as SedaCandidate[];
}

function scoreCandidates(
  candidates: SedaCandidate[],
  inputName: string,
  inputAddress: string
): ScoredCandidate[] {
  return candidates
    .map((candidate) => {
      const nameScore = fieldScore(inputName, candidate.customer_name);
      const addressScore = fieldScore(inputAddress, candidate.installation_address);
      const score = 0.45 * nameScore + 0.55 * addressScore;

      return {
        ...candidate,
        name_score: nameScore,
        address_score: addressScore,
        score,
      };
    })
    .sort((left, right) => right.score - left.score);
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
    const scored = scoreCandidates(await getCandidates(), name, address);
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
