import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const MATCH_THRESHOLD = 0.9;
export const MIN_FIELD_SCORE = 0.85;
export const MIN_SCORE_MARGIN = 0.05;
export const MAX_CANDIDATES = 5;

export const STATUS_ALIASES: Record<string, string> = {
  pending: "Pending",
  submitted: "Submitted",
  approved: "Approved",
  "approved by seda": "APPROVED BY SEDA",
};

export interface SedaCandidate {
  bubble_id: string;
  current_status: string | null;
  customer_name: string;
  installation_address: string;
}

export interface ScoredCandidate extends SedaCandidate {
  name_score: number;
  address_score: number;
  score: number;
}

export interface SedaMatchResult {
  matched: boolean;
  best: ScoredCandidate | null;
  second: ScoredCandidate | null;
  margin: number;
  reason?: string;
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

export function fieldScore(left: string, right: string): number {
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

export function roundScore(score: number): number {
  return Math.round(score * 1000) / 1000;
}

export function normalizeStatus(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return STATUS_ALIASES[value.trim().toLocaleLowerCase("en-MY")] || null;
}

export async function getSedaCandidates(): Promise<SedaCandidate[]> {
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

export function scoreSedaCandidates(
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

/**
 * Runs the same match/ambiguity rules used by the external SEDA status API
 * against an already-fetched candidate list.
 */
export function findBestSedaMatch(
  candidates: SedaCandidate[],
  inputName: string,
  inputAddress: string
): SedaMatchResult {
  const scored = scoreSedaCandidates(candidates, inputName, inputAddress);
  const best = scored[0] ?? null;
  const second = scored[1] ?? null;

  if (!best || best.score < MATCH_THRESHOLD) {
    return {
      matched: false,
      best,
      second,
      margin: 0,
      reason: "No SEDA registration met the 90% match threshold",
    };
  }

  const margin = second ? best.score - second.score : best.score;
  const isFieldSafe =
    best.name_score >= MIN_FIELD_SCORE && best.address_score >= MIN_FIELD_SCORE;
  const isUnambiguous = margin >= MIN_SCORE_MARGIN;

  if (!isFieldSafe || !isUnambiguous) {
    return {
      matched: false,
      best,
      second,
      margin,
      reason: "Match is ambiguous; no status was changed",
    };
  }

  return { matched: true, best, second, margin };
}
