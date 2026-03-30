"use server";

import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { agents, customers, referrals } from "@/db/schema";
import { getUser } from "@/lib/auth";

type GetReferralsParams = {
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
};

export async function getReferralAgents() {
  try {
    const data = await db
      .select({
        id: agents.id,
        bubble_id: agents.bubble_id,
        name: agents.name,
        contact: agents.contact,
        email: agents.email,
        agent_type: agents.agent_type,
      })
      .from(agents)
      .orderBy(asc(agents.name));

    return data;
  } catch (error) {
    console.error("Database error in getReferralAgents:", error);
    throw error;
  }
}

function formatLogTimestamp(date = new Date()) {
  return date.toISOString().replace("T", " ").replace("Z", " UTC");
}

function getAgentDisplayName(agent: { id: number; name: string | null; bubble_id: string | null } | null, fallbackId?: string | null) {
  if (!agent) {
    return fallbackId ? `Agent #${fallbackId}` : "Unassigned";
  }

  return agent.name?.trim() || agent.bubble_id || `Agent #${agent.id}`;
}

function appendPreferredAgentLog(existingLog: string | null | undefined, entry: string) {
  const normalizedExisting = (existingLog || "").trim();
  return normalizedExisting ? `${normalizedExisting}\n${entry}` : entry;
}

export async function getReferrals({ search, status, page = 1, pageSize = 50 }: GetReferralsParams = {}) {
  try {
    const currentPage = Math.max(1, page);
    const safePageSize = Math.max(1, Math.min(pageSize, 100));

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
          ilike(agents.name, term),
          ilike(agents.contact, term),
        ),
      );
    }

    if (status && status !== "all") {
      filters.push(eq(referrals.status, status));
    }

    const whereClause = filters.length > 0 ? and(...filters) : undefined;

    const countQuery = db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(referrals)
      .leftJoin(customers, eq(customers.customer_id, referrals.linked_customer_profile))
      .leftJoin(agents, eq(sql`CAST(${agents.id} AS TEXT)`, referrals.linked_agent));

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
        preferred_agent_log: referrals.preferred_agent_log,
        deal_value: referrals.deal_value,
        commission_earned: referrals.commission_earned,
        linked_invoice: referrals.linked_invoice,
        project_type: referrals.project_type,
        customer_name: customers.name,
        customer_phone: customers.phone,
        customer_email: customers.email,
        agent_name: agents.name,
        agent_contact: agents.contact,
        agent_bubble_id: agents.bubble_id,
      })
      .from(referrals)
      .leftJoin(customers, eq(customers.customer_id, referrals.linked_customer_profile))
      .leftJoin(agents, eq(sql`CAST(${agents.id} AS TEXT)`, referrals.linked_agent));

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
      .leftJoin(customers, eq(customers.customer_id, referrals.linked_customer_profile))
      .leftJoin(agents, eq(sql`CAST(${agents.id} AS TEXT)`, referrals.linked_agent));

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

export async function updateReferral(
  id: number,
  data: {
    status?: string;
    linked_agent?: string | null;
  },
) {
  try {
    const user = await getUser();
    const actorName = user?.name || user?.phone || user?.userId || "System Admin";

    await db.transaction(async (tx) => {
      const existing = await tx
        .select({
          id: referrals.id,
          linked_agent: referrals.linked_agent,
          preferred_agent_log: referrals.preferred_agent_log,
        })
        .from(referrals)
        .where(eq(referrals.id, id))
        .limit(1);

      if (existing.length === 0) {
        throw new Error("Referral not found");
      }

      const current = existing[0];
      const oldAgentId = current.linked_agent?.trim() || null;
      const newAgentId = data.linked_agent?.trim() || null;
      const agentChanged = oldAgentId !== newAgentId;

      let updatedLog = current.preferred_agent_log;

      if (agentChanged) {
        const idsToResolve = Array.from(
          new Set(
            [oldAgentId, newAgentId]
              .filter((value): value is string => Boolean(value))
              .map((value) => Number.parseInt(value, 10))
              .filter((value) => Number.isFinite(value)),
          ),
        );

        const resolvedAgents = idsToResolve.length > 0
          ? await tx
              .select({
                id: agents.id,
                name: agents.name,
                bubble_id: agents.bubble_id,
              })
              .from(agents)
              .where(inArray(agents.id, idsToResolve))
          : [];

        const agentMap = new Map(resolvedAgents.map((agent) => [String(agent.id), agent]));
        const oldAgent = oldAgentId ? agentMap.get(oldAgentId) || null : null;
        const newAgent = newAgentId ? agentMap.get(newAgentId) || null : null;
        const oldLabel = getAgentDisplayName(oldAgent, oldAgentId);
        const newLabel = getAgentDisplayName(newAgent, newAgentId);
        const entry = `${formatLogTimestamp()} - ${actorName} updated the preferred agent from ${oldLabel} to ${newLabel}.`;

        updatedLog = appendPreferredAgentLog(current.preferred_agent_log, entry);
      }

      await tx
        .update(referrals)
        .set({
          status: data.status,
          linked_agent: data.linked_agent,
          preferred_agent_log: updatedLog,
          updated_at: new Date(),
        })
        .where(eq(referrals.id, id));
    });

    revalidatePath("/referrals");
    return { success: true };
  } catch (error) {
    console.error("Database error in updateReferral:", error);
    return { success: false, error: String(error) };
  }
}
