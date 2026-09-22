"use server";

/**
 * Referrals read and write agent identity exclusively through `user` (bubble_id and,
 * for legacy Bubble rows, integer user.id). The retired `agent` table must not be
 * queried or joined here — see src/lib/agent-identity.ts.
 */

import { and, desc, eq, ilike, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/activity-log";
import { db } from "@/lib/db";
import { customers, referrals, users } from "@/db/schema";
import { getUser } from "@/lib/auth";
import {
  resolveUserRefToBubbleId,
  resolvedIdentityBubbleIdLoose,
  resolvedIdentityContactLoose,
  resolvedIdentityNameLoose,
} from "@/lib/agent-identity";

type GetReferralsParams = {
  search?: string;
  status?: string;
  assignedAgent?: string;
  referrer?: string;
  page?: number;
  pageSize?: number;
};

type ReferralEditRow = {
  id: number;
  bubble_id: string | null;
  status: string | null;
  linked_agent: string | null;
  linked_invoice: string | null;
  preferred_agent_log: string | null;
  name: string | null;
  relationship: string | null;
  mobile_number: string | null;
  linked_customer_profile: string | null;
  deal_value: string | null;
  commission_earned: string | null;
  project_type: string | null;
};

/** Columns only an admin may write. Everything else in `referral` (id, bubble_id,
 *  created_at, updated_at, status, linked_agent, linked_invoice) is either
 *  immutable or already editable by any agent via the existing edit modal. */
const ADMIN_ONLY_REFERRAL_FIELDS = [
  "name",
  "relationship",
  "mobile_number",
  "linked_customer_profile",
  "deal_value",
  "commission_earned",
  "project_type",
] as const;

function isReferralAdmin(user: Awaited<ReturnType<typeof getUser>>) {
  return (
    user?.isAdmin === true ||
    user?.role === "owner" ||
    (user?.tags || []).map((tag) => tag.toLowerCase()).includes("admin")
  );
}

function coerceNumericField(value: string | number | null | undefined) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

function coerceTextField(value: string | null | undefined) {
  const trimmed = (value || "").trim();
  return trimmed === "" ? null : trimmed;
}

type ReferralInvoiceSearchContext = {
  id: number;
  bubble_id: string | null;
  linked_customer_profile: string | null;
  /** Lead name (referral.name) — the prospect whose invoices we link. */
  lead_name: string | null;
  linked_invoice: string | null;
};

/** Bubble sometimes stored a customer id in linked_invoice. Those are not invoices. */
function looksLikeCustomerId(value: string | null | undefined) {
  const trimmed = (value || "").trim().toLowerCase();
  return trimmed.startsWith("cust_") || trimmed.startsWith("customer_");
}

function looksLikeInvoiceId(value: string | null | undefined) {
  const trimmed = (value || "").trim();
  if (!trimmed || looksLikeCustomerId(trimmed)) return false;
  return true;
}

type ReferralInvoiceSearchRow = {
  id: number;
  bubble_id: string | null;
  invoice_number: string | null;
  linked_customer: string | null;
  customer_name: string | null;
  total_amount: string | null;
  invoice_date: Date | string | null;
  linked_referral: string | null;
  linked_referral_name: string | null;
};

let referralPreferredAgentLogColumnPromise: Promise<boolean> | null = null;
let invoiceLinkedReferralColumnPromise: Promise<boolean> | null = null;

async function hasReferralPreferredAgentLogColumn() {
  if (!referralPreferredAgentLogColumnPromise) {
    referralPreferredAgentLogColumnPromise = db
      .execute(sql`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'referral'
            AND column_name = 'preferred_agent_log'
        ) AS exists
      `)
      .then((result) => {
        const exists = (result.rows[0] as { exists?: boolean } | undefined)?.exists;
        return exists === true;
      })
      .catch((error) => {
        referralPreferredAgentLogColumnPromise = null;
        throw error;
      });
  }

  return referralPreferredAgentLogColumnPromise;
}

async function hasInvoiceLinkedReferralColumn() {
  if (!invoiceLinkedReferralColumnPromise) {
    invoiceLinkedReferralColumnPromise = db
      .execute(sql`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'invoice'
            AND column_name = 'linked_referral'
        ) AS exists
      `)
      .then((result) => {
        const exists = (result.rows[0] as { exists?: boolean } | undefined)?.exists;
        return exists === true;
      })
      .catch((error) => {
        invoiceLinkedReferralColumnPromise = null;
        throw error;
      });
  }

  return invoiceLinkedReferralColumnPromise;
}

async function ensureInvoiceLinkedReferralColumn() {
  if (await hasInvoiceLinkedReferralColumn()) {
    return true;
  }

  await db.execute(sql`
    ALTER TABLE invoice
    ADD COLUMN IF NOT EXISTS linked_referral text
  `);

  invoiceLinkedReferralColumnPromise = Promise.resolve(true);
  return true;
}

function normalizeSearchText(value: string | null | undefined) {
  return (value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function buildUniqueSearchTerms(...values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .flatMap((value) => (value || "").split(/\s+/))
        .map((value) => value.trim())
        .filter((value) => value.length >= 2),
    ),
  ).slice(0, 8);
}

function scoreInvoiceCandidate(
  invoice: ReferralInvoiceSearchRow,
  referral: ReferralInvoiceSearchContext,
  searchTerm: string,
) {
  const invoiceNumber = normalizeSearchText(invoice.invoice_number);
  const customerName = normalizeSearchText(invoice.customer_name);
  const linkedCustomer = normalizeSearchText(invoice.linked_customer);
  const query = normalizeSearchText(searchTerm);
  const haystack = `${invoiceNumber} ${customerName} ${linkedCustomer}`.trim();

  let score = 0;

  if (
    looksLikeInvoiceId(referral.linked_invoice) &&
    invoice.bubble_id === referral.linked_invoice
  ) {
    score += 500;
  }

  // Lead name on the invoice customer — this is who Invoice Link is for.
  const leadName = normalizeSearchText(referral.lead_name);
  if (leadName && customerName.includes(leadName)) {
    score += 300;
  }

  if (query) {
    if (haystack.includes(query)) {
      score += 180;
    }

    for (const token of buildUniqueSearchTerms(query)) {
      if (invoiceNumber.includes(token)) score += 20;
      if (customerName.includes(token)) score += 35;
      if (linkedCustomer.includes(token)) score += 15;
    }
  }

  return score;
}

/**
 * Assignable agents, keyed by the canonical identity (`user.bubble_id`).
 *
 * Previously this returned `agent.id` and the UI wrote that raw integer into
 * `referral.linked_agent` — which collides with `user.id` and misattributes referrals.
 * The `value` field is what must be persisted; `id` is retained for React keys only.
 *
 * Sourced from `user` alone. The agent table is retired.
 */
export async function getReferralAgents() {
  try {
    // Every assignable agent is a user row. The 34 agents that had no login were
    // promoted to users in migration 2026-07-20b — no agent-table union or join.
    const rows = await db
      .select({
        id: users.id,
        bubble_id: users.bubble_id,
        name: users.name,
        contact: users.contact,
        email: users.email,
        agent_type: users.agent_type,
      })
      .from(users)
      .where(and(isNotNull(users.bubble_id), ne(users.bubble_id, "")))
      .orderBy(users.name);

    return rows
      .filter((row): row is typeof row & { bubble_id: string } => Boolean(row.bubble_id?.trim()))
      .map((row) => ({
        id: row.id,
        value: row.bubble_id,
        bubble_id: row.bubble_id,
        name: row.name,
        contact: row.contact,
        email: row.email,
        agent_type: row.agent_type,
      }));
  } catch (error) {
    console.error("Database error in getReferralAgents:", error);
    throw error;
  }
}

export async function getReferralReferrers() {
  try {
    // 介绍人 = linked customer profile on the lead, not referral.name (that is the lead).
    const result = await db.execute(sql`
      SELECT DISTINCT TRIM(c.name) AS name
      FROM referral r
      INNER JOIN customer c ON c.customer_id = r.linked_customer_profile
      WHERE c.name IS NOT NULL AND TRIM(c.name) <> ''
      ORDER BY name ASC
    `);

    return result.rows
      .map((row) => (row as { name: string | null }).name)
      .filter((name): name is string => Boolean(name));
  } catch (error) {
    console.error("Database error in getReferralReferrers:", error);
    throw error;
  }
}

function formatLogTimestamp(date = new Date()) {
  return date.toISOString().replace("T", " ").replace("Z", " UTC");
}

function appendPreferredAgentLog(existingLog: string | null | undefined, entry: string) {
  const normalizedExisting = (existingLog || "").trim();
  return normalizedExisting ? `${normalizedExisting}\n${entry}` : entry;
}

export async function getReferrals({
  search,
  status,
  assignedAgent,
  referrer,
  page = 1,
  pageSize = 50,
}: GetReferralsParams = {}) {
  try {
    const currentPage = Math.max(1, page);
    const safePageSize = Math.max(1, Math.min(pageSize, 100));
    const hasPreferredAgentLog = await hasReferralPreferredAgentLogColumn();

    // linked_agent resolves against `user` alone — but not against one keyspace.
    // Bubble has been writing the integer `user.id` here since 2026-07-22 (80 live
    // rows), while everything older holds a `user.bubble_id`. A bubble_id-only read
    // rendered every recent lead as "Unassigned", so resolve both and display the
    // canonical bubble_id. See src/lib/agent-identity.ts.
    const agentNameExpr = resolvedIdentityNameLoose(sql`${referrals.linked_agent}`);
    const agentContactExpr = resolvedIdentityContactLoose(sql`${referrals.linked_agent}`);
    // Falls back to the raw stored value when it resolves to no user at all, so an
    // assignment we cannot interpret still surfaces instead of looking unassigned.
    const agentCanonicalRefExpr = sql<string | null>`COALESCE(
      ${resolvedIdentityBubbleIdLoose(sql`${referrals.linked_agent}`)},
      ${referrals.linked_agent}
    )`;

    const filters = [];

    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      filters.push(
        or(
          ilike(referrals.name, term),
          ilike(referrals.mobile_number, term),
          ilike(referrals.bubble_id, term),
          ilike(referrals.linked_customer_profile, term),
          ilike(referrals.relationship, term),
          ilike(referrals.status, term),
          ilike(referrals.project_type, term),
          ilike(customers.name, term),
          ilike(customers.customer_id, term),
          sql`${agentNameExpr} ILIKE ${term}`,
          sql`${agentContactExpr} ILIKE ${term}`,
        ),
      );
    }

    if (status && status.toLowerCase() !== "all") {
      filters.push(eq(referrals.status, status));
    }

    if (assignedAgent === "unassigned") {
      filters.push(or(isNull(referrals.linked_agent), eq(referrals.linked_agent, "")));
    } else if (assignedAgent && assignedAgent !== "all") {
      // Match on the canonical bubble_id, not the stored text: the dropdown offers
      // bubble_ids while recent rows store the agent's integer user.id.
      filters.push(sql`${agentCanonicalRefExpr} = ${assignedAgent}`);
    }

    if (referrer?.trim()) {
      // 介绍人 filter matches the linked customer name, not the lead (referral.name).
      filters.push(eq(customers.name, referrer.trim()));
    }

    const whereClause = filters.length > 0 ? and(...filters) : undefined;

    const countQuery = db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(referrals)
      .leftJoin(customers, eq(customers.customer_id, referrals.linked_customer_profile));

    const [{ count }] = whereClause ? await countQuery.where(whereClause) : await countQuery;
    const total = count ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / safePageSize));
    const effectivePage = Math.min(currentPage, totalPages);
    const offset = (effectivePage - 1) * safePageSize;

    const baseQuery = db
      .select({
        id: referrals.id,
        bubble_id: referrals.bubble_id,
        linked_customer_profile: referrals.linked_customer_profile,
        name: referrals.name,
        relationship: referrals.relationship,
        mobile_number: referrals.mobile_number,
        status: referrals.status,
        created_at: referrals.created_at,
        updated_at: referrals.updated_at,
        linked_agent: referrals.linked_agent,
        preferred_agent_log: hasPreferredAgentLog
          ? sql<string | null>`${sql.identifier("referral")}.${sql.identifier("preferred_agent_log")}`
          : sql<string | null>`NULL`,
        deal_value: referrals.deal_value,
        commission_earned: referrals.commission_earned,
        linked_invoice: referrals.linked_invoice,
        project_type: referrals.project_type,
        customer_name: customers.name,
        customer_phone: customers.phone,
        customer_email: customers.email,
        agent_name: agentNameExpr,
        agent_contact: agentContactExpr,
        agent_bubble_id: agentCanonicalRefExpr,
      })
      .from(referrals)
      .leftJoin(customers, eq(customers.customer_id, referrals.linked_customer_profile));

    const referralRows = whereClause ? baseQuery.where(whereClause) : baseQuery;
    const data = await referralRows.orderBy(desc(referrals.created_at), desc(referrals.id)).limit(safePageSize).offset(offset);

    const statsQuery = db
      .select({
        total: sql<number>`count(*)::int`,
        assigned: sql<number>`sum(case when ${referrals.linked_agent} is not null and ${referrals.linked_agent} <> '' then 1 else 0 end)::int`,
        unassigned: sql<number>`sum(case when ${referrals.linked_agent} is null or ${referrals.linked_agent} = '' then 1 else 0 end)::int`,
        pending: sql<number>`sum(case when ${referrals.status} = 'Pending' then 1 else 0 end)::int`,
      })
      .from(referrals)
      .leftJoin(customers, eq(customers.customer_id, referrals.linked_customer_profile));

    const [stats] = whereClause ? await statsQuery.where(whereClause) : await statsQuery;

    return {
      referrals: data,
      pagination: {
        page: effectivePage,
        pageSize: safePageSize,
        total,
        totalPages,
      },
      stats: {
        total: stats?.total ?? total,
        assigned: stats?.assigned ?? 0,
        unassigned: stats?.unassigned ?? 0,
        pending: stats?.pending ?? 0,
      },
    };
  } catch (error) {
    console.error("Database error in getReferrals:", error);
    throw error;
  }
}

export async function searchReferralInvoices(referralId: number, search?: string) {
  try {
    const referralResult = await db
      .select({
        id: referrals.id,
        bubble_id: referrals.bubble_id,
        linked_customer_profile: referrals.linked_customer_profile,
        lead_name: referrals.name,
        linked_invoice: referrals.linked_invoice,
      })
      .from(referrals)
      .where(eq(referrals.id, referralId))
      .limit(1);

    const referral = (referralResult[0] as ReferralInvoiceSearchContext | undefined) ?? null;

    if (!referral) {
      return { success: false, error: "Referral not found", invoices: [] };
    }

    const hasLinkedReferralColumn = await hasInvoiceLinkedReferralColumn();
    const query = search?.trim() || "";
    const rawLinkedInvoice = referral.linked_invoice?.trim() || "";
    const linkedInvoiceId = looksLikeInvoiceId(rawLinkedInvoice) ? rawLinkedInvoice : "";
    const leadName = referral.lead_name?.trim() || "";

    const conditions = [];

    if (query) {
      // Free-text search — same shape as /invoices.
      const ilikeTerm = `%${query}%`;
      conditions.push(sql`c.name ILIKE ${ilikeTerm}`);
      conditions.push(sql`i.invoice_number ILIKE ${ilikeTerm}`);
      conditions.push(sql`CAST(i.invoice_id AS TEXT) ILIKE ${ilikeTerm}`);
      conditions.push(sql`i.bubble_id ILIKE ${ilikeTerm}`);
      conditions.push(sql`i.linked_customer ILIKE ${ilikeTerm}`);
    } else {
      // Default: this lead's invoices by name + any already-linked real invoice.
      // Do NOT search linked_customer_profile — that is the 介绍人, not the lead.
      if (leadName) {
        conditions.push(sql`c.name ILIKE ${`%${leadName}%`}`);
      }
      if (linkedInvoiceId) {
        conditions.push(sql`i.bubble_id = ${linkedInvoiceId}`);
      }
    }

    if (conditions.length === 0) {
      return { success: true, invoices: [] };
    }

    const whereClause = sql`AND (${sql.join(conditions, sql` OR `)})`;

    // No join onto referral here — the OR cast join was timing out and returning zero rows.
    const result = await db.execute(sql`
      SELECT
        i.id,
        i.bubble_id,
        i.invoice_number,
        i.linked_customer,
        c.name AS customer_name,
        CAST(i.total_amount AS TEXT) AS total_amount,
        i.invoice_date,
        ${hasLinkedReferralColumn
          ? sql`i.linked_referral`
          : sql`NULL::text`} AS linked_referral,
        NULL::text AS linked_referral_name
      FROM invoice i
      LEFT JOIN customer c ON c.customer_id = i.linked_customer
      WHERE i.is_latest = true
        AND COALESCE(i.is_deleted, false) = false
        ${whereClause}
      ORDER BY i.invoice_date DESC NULLS LAST, i.created_at DESC NULLS LAST, i.id DESC
      LIMIT 60
    `);

    const referralLinkKey = referral.bubble_id?.trim() || String(referral.id);
    const rows = (result.rows ?? result) as ReferralInvoiceSearchRow[];

    const invoices = (Array.isArray(rows) ? rows : [])
      .map((row) => {
        const isLinkedElsewhere = Boolean(row.linked_referral && row.linked_referral !== referralLinkKey);

        return {
          id: row.id,
          bubble_id: row.bubble_id,
          invoice_number: row.invoice_number,
          linked_customer: row.linked_customer,
          customer_name: row.customer_name,
          total_amount: row.total_amount,
          invoice_date: row.invoice_date instanceof Date ? row.invoice_date.toISOString() : row.invoice_date,
          linked_referral: row.linked_referral,
          linked_referral_name: row.linked_referral_name,
          is_linked_elsewhere: isLinkedElsewhere,
          score: scoreInvoiceCandidate(row, referral, query || leadName),
        };
      })
      .sort((a, b) => b.score - a.score || b.id - a.id)
      .slice(0, 20)
      .map(({ score, ...invoice }) => invoice);

    return { success: true, invoices };
  } catch (error) {
    console.error("Database error in searchReferralInvoices:", error);
    return { success: false, error: String(error), invoices: [] };
  }
}

export async function updateReferral(
  id: number,
  data: {
    status?: string;
    linked_agent?: string | null;
    linked_invoice?: string | null;
    name?: string | null;
    relationship?: string | null;
    mobile_number?: string | null;
    linked_customer_profile?: string | null;
    deal_value?: string | number | null;
    commission_earned?: string | number | null;
    project_type?: string | null;
  },
) {
  try {
    const user = await getUser();
    const requestedAdminFields = ADMIN_ONLY_REFERRAL_FIELDS.filter((field) => field in data);
    if (requestedAdminFields.length > 0 && !isReferralAdmin(user)) {
      return {
        success: false,
        error: `Admin permission required to edit: ${requestedAdminFields.join(", ")}`,
      };
    }

    const actorName = user?.name || user?.phone || user?.userId || "System Admin";
    const hasPreferredAgentLog = await hasReferralPreferredAgentLogColumn();
    const shouldEnsureInvoiceLink = Boolean(data.linked_invoice?.trim());

    if (shouldEnsureInvoiceLink) {
      await ensureInvoiceLinkedReferralColumn();
    }

    const hasLinkedReferralColumn = await hasInvoiceLinkedReferralColumn();

    await db.transaction(async (tx) => {
      const existingResult = await tx.execute(sql`
        SELECT
          id,
          bubble_id,
          status,
          linked_agent,
          linked_invoice,
          name,
          relationship,
          mobile_number,
          linked_customer_profile,
          CAST(deal_value AS TEXT) AS deal_value,
          CAST(commission_earned AS TEXT) AS commission_earned,
          project_type,
          ${hasPreferredAgentLog
            ? sql`${sql.identifier("preferred_agent_log")}`
            : sql`NULL::text`} AS preferred_agent_log
        FROM referral
        WHERE id = ${id}
        LIMIT 1
      `);

      const current = (existingResult.rows[0] as ReferralEditRow | undefined) ?? null;

      if (!current) {
        throw new Error("Referral not found");
      }

      const oldAgentId = current.linked_agent?.trim() || null;
      const requestedAgentId = data.linked_agent?.trim() || null;
      const oldInvoiceId = current.linked_invoice?.trim() || null;
      const newInvoiceId = data.linked_invoice?.trim() || null;
      // Fold both sides onto the canonical user.bubble_id before comparing and before
      // writing. Bubble writes recent rows as the integer user.id, so without this an
      // admin re-picking the same agent would log a phantom change, and the row would
      // keep a value no read path can resolve. Anything unresolvable is kept verbatim
      // rather than dropped.
      const oldAgentRef = await resolveUserRefToBubbleId(oldAgentId);
      const newAgentRef = await resolveUserRefToBubbleId(requestedAgentId);
      const agentChanged = oldAgentRef !== newAgentRef;
      const invoiceChanged = oldInvoiceId !== newInvoiceId;
      const nextStatus = data.status ?? current.status;
      const nextUpdatedAt = new Date();
      const referralLinkKey = current.bubble_id?.trim() || String(current.id);

      const nextName = "name" in data ? coerceTextField(data.name) : current.name;
      const nextRelationship = "relationship" in data ? coerceTextField(data.relationship) : current.relationship;
      const nextMobileNumber = "mobile_number" in data ? coerceTextField(data.mobile_number) : current.mobile_number;
      const nextCustomerProfile =
        "linked_customer_profile" in data
          ? coerceTextField(data.linked_customer_profile)
          : current.linked_customer_profile;
      const nextProjectType = "project_type" in data ? coerceTextField(data.project_type) : current.project_type;
      const nextDealValue = "deal_value" in data ? coerceNumericField(data.deal_value) : current.deal_value;
      const nextCommissionEarned =
        "commission_earned" in data ? coerceNumericField(data.commission_earned) : current.commission_earned;

      let updatedLog = current.preferred_agent_log;

      if (agentChanged) {
        // Resolve labels via user.bubble_id / user.id only (never the retired agent table).
        const refsToResolve = Array.from(
          new Set([oldAgentRef, newAgentRef].filter((value): value is string => Boolean(value))),
        );

        const labels = new Map<string, string>();

        if (refsToResolve.length > 0) {
          const resolved = await tx.execute(sql`
            SELECT r.ref,
                   ${resolvedIdentityNameLoose(sql`r.ref`)} AS name
            FROM UNNEST(ARRAY[${sql.join(refsToResolve.map((v) => sql`${v}`), sql`, `)}]::text[]) AS r(ref)
          `);

          for (const row of resolved.rows as Array<{ ref: string; name: string | null }>) {
            if (row.name) labels.set(row.ref, row.name);
          }
        }

        const oldLabel = oldAgentRef ? labels.get(oldAgentRef) || `Agent #${oldAgentRef}` : "Unassigned";
        const newLabel = newAgentRef ? labels.get(newAgentRef) || `Agent #${newAgentRef}` : "Unassigned";
        const entry = `${formatLogTimestamp()} - ${actorName} updated the preferred agent from ${oldLabel} to ${newLabel}.`;

        updatedLog = appendPreferredAgentLog(current.preferred_agent_log, entry);
      }

      if (invoiceChanged && newInvoiceId) {
        const targetInvoiceResult = await tx.execute(sql`
          SELECT
            id,
            bubble_id,
            invoice_number,
            ${hasLinkedReferralColumn
              ? sql`${sql.identifier("linked_referral")}`
              : sql`NULL::text`} AS linked_referral
          FROM invoice
          WHERE bubble_id = ${newInvoiceId}
          LIMIT 1
        `);

        const targetInvoice = (targetInvoiceResult.rows[0] as {
          id: number;
          bubble_id: string | null;
          invoice_number: string | null;
          linked_referral: string | null;
        } | undefined) ?? null;

        if (!targetInvoice) {
          throw new Error("Selected invoice not found");
        }

        if (
          hasLinkedReferralColumn &&
          targetInvoice.linked_referral &&
          targetInvoice.linked_referral !== referralLinkKey
        ) {
          throw new Error(
            `Invoice ${targetInvoice.invoice_number || targetInvoice.bubble_id || targetInvoice.id} is already linked to another referral.`,
          );
        }
      }

      if (hasPreferredAgentLog) {
        await tx.execute(sql`
          UPDATE referral
          SET
            status = ${nextStatus},
            linked_agent = ${newAgentRef},
            linked_invoice = ${newInvoiceId},
            preferred_agent_log = ${updatedLog},
            name = ${nextName},
            relationship = ${nextRelationship},
            mobile_number = ${nextMobileNumber},
            linked_customer_profile = ${nextCustomerProfile},
            deal_value = ${nextDealValue},
            commission_earned = ${nextCommissionEarned},
            project_type = ${nextProjectType},
            updated_at = ${nextUpdatedAt}
          WHERE id = ${id}
        `);
      } else {
        await tx
          .update(referrals)
          .set({
            status: nextStatus,
            linked_agent: newAgentRef,
            linked_invoice: newInvoiceId,
            name: nextName,
            relationship: nextRelationship,
            mobile_number: nextMobileNumber,
            linked_customer_profile: nextCustomerProfile,
            deal_value: nextDealValue,
            commission_earned: nextCommissionEarned,
            project_type: nextProjectType,
            updated_at: nextUpdatedAt,
          })
          .where(eq(referrals.id, id));
      }

      if (invoiceChanged && hasLinkedReferralColumn) {
        if (oldInvoiceId) {
          await tx.execute(sql`
            UPDATE invoice
            SET
              linked_referral = NULL,
              updated_at = ${nextUpdatedAt}
            WHERE bubble_id = ${oldInvoiceId}
              AND linked_referral = ${referralLinkKey}
          `);
        }

        if (newInvoiceId) {
          await tx.execute(sql`
            UPDATE invoice
            SET
              linked_referral = ${referralLinkKey},
              updated_at = ${nextUpdatedAt}
            WHERE bubble_id = ${newInvoiceId}
          `);
        }
      }
    });

    revalidatePath("/referrals");
    revalidatePath("/invoices");
    await logActivity({
      action: "update",
      entityType: "referral",
      entityId: id,
      fields: Object.keys(data),
      metadata: { ...data },
    });
    return { success: true };
  } catch (error) {
    console.error("Database error in updateReferral:", error);
    await logActivity({
      action: "update",
      entityType: "referral",
      entityId: id,
      fields: Object.keys(data),
      status: "failed",
      errorMessage: String(error),
    });
    return { success: false, error: String(error) };
  }
}

export async function deleteReferral(id: number) {
  try {
    const user = await getUser();
    if (!isReferralAdmin(user)) {
      return { success: false, error: "Admin permission required to delete a referral" };
    }

    const hasLinkedReferralColumn = await hasInvoiceLinkedReferralColumn();
    let deletedReferral: ReferralEditRow | null = null;

    await db.transaction(async (tx) => {
      const existingResult = await tx.execute(sql`
        SELECT
          id,
          bubble_id,
          status,
          linked_agent,
          linked_invoice,
          name,
          relationship,
          mobile_number,
          linked_customer_profile,
          CAST(deal_value AS TEXT) AS deal_value,
          CAST(commission_earned AS TEXT) AS commission_earned,
          project_type,
          NULL::text AS preferred_agent_log
        FROM referral
        WHERE id = ${id}
        FOR UPDATE
      `);

      const current = (existingResult.rows[0] as ReferralEditRow | undefined) ?? null;
      if (!current) {
        throw new Error("Referral not found");
      }

      deletedReferral = current;
      const referralLinkKey = current.bubble_id?.trim() || String(current.id);

      if (hasLinkedReferralColumn) {
        await tx.execute(sql`
          UPDATE invoice
          SET linked_referral = NULL, updated_at = ${new Date()}
          WHERE linked_referral = ${referralLinkKey}
        `);
      }

      await tx.delete(referrals).where(eq(referrals.id, id));
    });

    revalidatePath("/referrals");
    revalidatePath("/invoices");
    await logActivity({
      action: "delete",
      entityType: "referral",
      entityId: id,
      metadata: { referral: deletedReferral },
    });

    return { success: true };
  } catch (error) {
    console.error("Database error in deleteReferral:", error);
    await logActivity({
      action: "delete",
      entityType: "referral",
      entityId: id,
      status: "failed",
      errorMessage: String(error),
    });
    return { success: false, error: String(error) };
  }
}
