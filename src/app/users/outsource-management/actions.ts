"use server";

import { users } from "@/db/schema";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

const OUTSOURCE_ROLES = ["OGM", "OUM", "OSM"] as const;

export type OutsourceRole = (typeof OUTSOURCE_ROLES)[number];

export type OutsourceMember = {
  id: number;
  bubble_id: string | null;
  name: string;
  email: string | null;
  contact: string | null;
  agent_code: string | null;
  dealership: string | null;
  profile_picture: string | null;
  access_level: string[];
  role: OutsourceRole | null;
  parent_user_id: number | null;
  parent_name: string | null;
  parent_role: OutsourceRole | null;
  notes: string | null;
  unit_count: number;
  sales_count: number;
  direct_report_count: number;
};

type UpdateOutsourceRelationshipInput = {
  userId: number;
  role: OutsourceRole | "";
  parentUserId?: number | null;
  notes?: string | null;
};

function normalizeRole(role: string | null | undefined): OutsourceRole | null {
  const normalized = role?.trim().toUpperCase();
  return OUTSOURCE_ROLES.includes(normalized as OutsourceRole) ? (normalized as OutsourceRole) : null;
}

function displayName(user: {
  id: number;
  email: string | null;
  agent_code: string | null;
  agent?: { name: string | null } | null;
}) {
  return user.agent?.name || user.email || user.agent_code || `User #${user.id}`;
}

function expectedParentRole(role: OutsourceRole | null): OutsourceRole | null {
  if (role === "OUM") return "OGM";
  if (role === "OSM") return "OUM";
  return null;
}

function allowedChildRole(role: OutsourceRole | null): OutsourceRole | null {
  if (role === "OGM") return "OUM";
  if (role === "OUM") return "OSM";
  return null;
}

export async function getOutsourceManagementData() {
  const rows = await db.query.users.findMany({
    with: {
      agent: true,
    },
    orderBy: (users, { asc, desc }) => [
      asc(users.outsource_role),
      desc(users.id),
    ],
  });

  const baseMembers = rows.map((user) => ({
    id: user.id,
    bubble_id: user.bubble_id,
    name: displayName(user),
    email: user.agent?.email || user.email || null,
    contact: user.agent?.contact || null,
    agent_code: user.agent_code,
    dealership: user.dealership,
    profile_picture: user.profile_picture,
    access_level: user.access_level || [],
    role: normalizeRole(user.outsource_role),
    parent_user_id: user.outsource_parent_user_id,
    notes: user.outsource_notes,
  }));

  const memberById = new Map(baseMembers.map((member) => [member.id, member]));
  const childrenByParent = new Map<number, typeof baseMembers>();

  for (const member of baseMembers) {
    if (!member.parent_user_id) continue;
    const siblings = childrenByParent.get(member.parent_user_id) || [];
    siblings.push(member);
    childrenByParent.set(member.parent_user_id, siblings);
  }

  const members: OutsourceMember[] = baseMembers.map((member) => {
    const directReports = childrenByParent.get(member.id) || [];
    const unitReports = directReports.filter((report) => report.role === "OUM");
    const directSalesReports = directReports.filter((report) => report.role === "OSM");
    const salesViaUnits = unitReports.reduce((count, unit) => {
      const unitReports = childrenByParent.get(unit.id) || [];
      return count + unitReports.filter((report) => report.role === "OSM").length;
    }, 0);
    const parent = member.parent_user_id ? memberById.get(member.parent_user_id) : null;

    return {
      ...member,
      parent_name: parent?.name || null,
      parent_role: parent?.role || null,
      unit_count: unitReports.length,
      sales_count: directSalesReports.length + salesViaUnits,
      direct_report_count: directReports.length,
    };
  });

  const memberLookup = new Map(members.map((member) => [member.id, member]));
  const invalidRelationships = members.filter((member) => {
    if (!member.role) return Boolean(member.parent_user_id);
    const requiredParentRole = expectedParentRole(member.role);
    if (!requiredParentRole) return Boolean(member.parent_user_id);
    if (!member.parent_user_id) return true;
    return memberLookup.get(member.parent_user_id)?.role !== requiredParentRole;
  }).length;

  return {
    members,
    stats: {
      general_managers: members.filter((member) => member.role === "OGM").length,
      unit_managers: members.filter((member) => member.role === "OUM").length,
      sales: members.filter((member) => member.role === "OSM").length,
      unassigned: members.filter((member) => !member.role).length,
      invalid_relationships: invalidRelationships,
    },
  };
}

export async function updateOutsourceRelationship(input: UpdateOutsourceRelationshipInput) {
  const role = normalizeRole(input.role);
  const parentUserId = input.parentUserId ? Number(input.parentUserId) : null;
  const notes = input.notes?.trim() || null;

  if (input.role && !role) {
    return { success: false, error: "Unsupported outsource role." };
  }

  if (!Number.isInteger(input.userId) || input.userId <= 0) {
    return { success: false, error: "Invalid user selected." };
  }

  if (parentUserId !== null && (!Number.isInteger(parentUserId) || parentUserId <= 0)) {
    return { success: false, error: "Invalid parent selected." };
  }

  if (parentUserId === input.userId) {
    return { success: false, error: "A user cannot report to themselves." };
  }

  const target = await db.query.users.findFirst({
    where: eq(users.id, input.userId),
  });

  if (!target) {
    return { success: false, error: "User not found." };
  }

  let finalParentUserId: number | null = null;
  const requiredParentRole = expectedParentRole(role);

  if (requiredParentRole) {
    if (!parentUserId) {
      return { success: false, error: `${role} must report to a ${requiredParentRole}.` };
    }

    const parent = await db.query.users.findFirst({
      where: eq(users.id, parentUserId),
    });

    if (!parent) {
      return { success: false, error: "Selected parent user was not found." };
    }

    const parentRole = normalizeRole(parent.outsource_role);
    if (parentRole !== requiredParentRole) {
      return { success: false, error: `${role} must report to a ${requiredParentRole}.` };
    }

    finalParentUserId = parentUserId;
  }

  const childRows = await db.query.users.findMany({
    where: eq(users.outsource_parent_user_id, input.userId),
  });
  const validChildRole = allowedChildRole(role);
  const blockingChildren = childRows
    .map((child) => normalizeRole(child.outsource_role))
    .filter((childRole) => childRole && childRole !== validChildRole);

  if (blockingChildren.length > 0) {
    const childLabel = validChildRole ? validChildRole : "no direct reports";
    return {
      success: false,
      error: `Move existing direct reports first. A ${role || "unassigned user"} can have ${childLabel}.`,
    };
  }

  await db
    .update(users)
    .set({
      outsource_role: role,
      outsource_parent_user_id: finalParentUserId,
      outsource_notes: notes,
      updated_at: new Date(),
    })
    .where(eq(users.id, input.userId));

  revalidatePath("/users/outsource-management");
  return { success: true };
}
