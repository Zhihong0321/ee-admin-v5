"use server";

import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { customers, referrals } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { resolvedIdentityContact, resolvedIdentityName } from "@/lib/agent-identity";

type GetReferralsParams = {
  search?: string;
  status?: string;
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
};

type ReferralInvoiceSearchContext = {
  id: number;
  bubble_id: string | null;
  linked_customer_profile: string | null;
  referral_name: string | null;
  customer_name: string | null;
  linked_invoice: string | null;
};

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

  if (referral.linked_invoice && invoice.bubble_id === referral.linked_invoice) {
    score += 500;
  }

  if (
    referral.linked_customer_profile &&
    invoice.linked_customer &&
    referral.linked_customer_profile === invoice.linked_customer
  ) {
    score += 300;
  }

  const referralCustomerName = normalizeSearchText(referral.customer_name);
  const referralName = normalizeSearchText(referral.referral_name);

  if (referralCustomerName && customerName.includes(referralCustomerName)) {
    score += 140;
  }

  if (referralName && customerName.includes(referralName)) {
    score += 100;
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
    // promoted to users in migration 2026-07-20b, so no agent-table union is needed.
    const result = await db.execute(sql`
      SELECT
        u.id         AS id,
        u.bubble_id  AS value,
        u.bubble_id  AS bubble_id,
        u.name       AS name,
        u.contact    AS contact,
        u.email      AS email,
        u.agent_type AS agent_type
      FROM "user" u
      WHERE u.bubble_id IS NOT NULL AND u.bubble_id <> ''
      ORDER BY u.name ASC NULLS LAST
    `);

    return result.rows as Array<{
      id: number;
      value: string;
      bubble_id: string | null;
      name: string | null;
      contact: string | null;
      email: string | null;
      agent_type: string | null;

    }>;
  } catch (error) {
    console.error("Database error in getReferralAgents:", error);
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

export async function getReferrals({ search, status, page = 1, pageSize = 50 }: GetReferralsParams = {}) {
  try {
    const currentPage = Math.max(1, page);
    const safePageSize = Math.max(1, Math.min(pageSize, 100));
    const hasPreferredAgentLog = await hasReferralPreferredAgentLogColumn();

    // linked_agent holds a user.bubble_id and resolves against `user` alone.
    const agentNameExpr = resolvedIdentityName(sql`${referrals.linked_agent}`);
    const agentContactExpr = resolvedIdentityContact(sql`${referrals.linked_agent}`);

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
        agent_bubble_id: referrals.linked_agent,
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
        referral_name: referrals.name,
        customer_name: customers.name,
        linked_invoice: referrals.linked_invoice,
      })
      .from(referrals)
      .leftJoin(customers, eq(customers.customer_id, referrals.linked_customer_profile))
      .where(eq(referrals.id, referralId))
      .limit(1);

    const referral = (referralResult[0] as ReferralInvoiceSearchContext | undefined) ?? null;

    if (!referral) {
      return { success: false, error: "Referral not found", invoices: [] };
    }

    const hasLinkedReferralColumn = await hasInvoiceLinkedReferralColumn();
    const query = search?.trim() || "";
    const queryTerms = buildUniqueSearchTerms(
      query,
      referral.customer_name,
      referral.referral_name,
      referral.linked_customer_profile,
    );

    const conditions = [];

    if (referral.linked_customer_profile) {
      conditions.push(sql`i.linked_customer = ${referral.linked_customer_profile}`);
    }

    if (referral.linked_invoice) {
      conditions.push(sql`i.bubble_id = ${referral.linked_invoice}`);
    }

    for (const term of queryTerms) {
      const ilikeTerm = `%${term}%`;
      conditions.push(sql`c.name ILIKE ${ilikeTerm}`);
      conditions.push(sql`i.invoice_number ILIKE ${ilikeTerm}`);
      conditions.push(sql`i.linked_customer ILIKE ${ilikeTerm}`);
    }

    const whereClause = conditions.length > 0
      ? sql`AND (${sql.join(conditions, sql` OR `)})`
      : sql``;

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
        ${hasLinkedReferralColumn
          ? sql`r.name`
          : sql`NULL::text`} AS linked_referral_name
      FROM invoice i
      LEFT JOIN customer c ON c.customer_id = i.linked_customer
      ${hasLinkedReferralColumn
        ? sql`LEFT JOIN referral r ON r.bubble_id = i.linked_referral OR CAST(r.id AS TEXT) = i.linked_referral`
        : sql``}
      WHERE COALESCE(i.is_latest, true) = true
        AND COALESCE(i.is_deleted, false) = false
        ${whereClause}
      ORDER BY i.invoice_date DESC NULLS LAST, i.created_at DESC NULLS LAST, i.id DESC
      LIMIT 60
    `);

    const referralLinkKey = referral.bubble_id?.trim() || String(referral.id);

    const invoices = (result.rows as ReferralInvoiceSearchRow[])
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
          score: scoreInvoiceCandidate(row, referral, query),
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
  },
) {
  try {
    const user = await getUser();
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
      const newAgentId = data.linked_agent?.trim() || null;
      const oldInvoiceId = current.linked_invoice?.trim() || null;
      const newInvoiceId = data.linked_invoice?.trim() || null;
      const agentChanged = oldAgentId !== newAgentId;
      const invoiceChanged = oldInvoiceId !== newInvoiceId;
      const nextStatus = data.status ?? current.status;
      const nextUpdatedAt = new Date();
      const referralLinkKey = current.bubble_id?.trim() || String(current.id);

      let updatedLog = current.preferred_agent_log;

      if (agentChanged) {
        // Resolve labels through the shared identity rule rather than by parsing the
        // value as an agent.id — the value is a bubble_id for anything written since
        // the identity normalisation, and only legacy rows are still integers.
        const refsToResolve = Array.from(
          new Set([oldAgentId, newAgentId].filter((value): value is string => Boolean(value))),
        );

        const labels = new Map<string, string>();

        if (refsToResolve.length > 0) {
          const resolved = await tx.execute(sql`
            SELECT r.ref,
                   ${resolvedIdentityName(sql`r.ref`)} AS name
            FROM UNNEST(ARRAY[${sql.join(refsToResolve.map((v) => sql`${v}`), sql`, `)}]::text[]) AS r(ref)
          `);

          for (const row of resolved.rows as Array<{ ref: string; name: string | null }>) {
            if (row.name) labels.set(row.ref, row.name);
          }
        }

        const oldLabel = oldAgentId ? labels.get(oldAgentId) || `Agent #${oldAgentId}` : "Unassigned";
        const newLabel = newAgentId ? labels.get(newAgentId) || `Agent #${newAgentId}` : "Unassigned";
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
            linked_agent = ${newAgentId},
            linked_invoice = ${newInvoiceId},
            preferred_agent_log = ${updatedLog},
            updated_at = ${nextUpdatedAt}
          WHERE id = ${id}
        `);
      } else {
        await tx
          .update(referrals)
          .set({
            status: nextStatus,
            linked_agent: newAgentId,
            linked_invoice: newInvoiceId,
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
    return { success: true };
  } catch (error) {
    console.error("Database error in updateReferral:", error);
    return { success: false, error: String(error) };
  }
}
