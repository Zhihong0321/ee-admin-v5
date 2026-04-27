"use server";

import { departmentMembers, departments, users } from "@/db/schema";
import { db } from "@/lib/db";
import { asc, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

const DEPARTMENT_MEMBER_ROLES = ["HOD", "ASSISTANT_HOD", "MEMBER"] as const;

export type DepartmentMemberRole = (typeof DEPARTMENT_MEMBER_ROLES)[number];

export type DepartmentUserOption = {
  id: number;
  name: string;
  email: string | null;
  contact: string | null;
  agent_code: string | null;
  profile_picture: string | null;
};

export type DepartmentMemberAssignment = DepartmentUserOption & {
  role: DepartmentMemberRole;
};

export type ManagedDepartment = {
  id: number;
  name: string;
  description: string | null;
  hod: DepartmentMemberAssignment | null;
  assistant_hods: DepartmentMemberAssignment[];
  members: DepartmentMemberAssignment[];
  headcount: number;
  updated_at: Date | null;
};

type CreateDepartmentInput = {
  name: string;
  description?: string | null;
};

type UpdateDepartmentInput = {
  departmentId: number;
  name: string;
  description?: string | null;
  hodUserId?: number | null;
  assistantHodUserIds?: number[];
  memberUserIds?: number[];
};

function normalizeRole(role: string | null | undefined): DepartmentMemberRole | null {
  return DEPARTMENT_MEMBER_ROLES.includes(role as DepartmentMemberRole)
    ? (role as DepartmentMemberRole)
    : null;
}

function normalizeUserIds(ids: Array<number | null | undefined>) {
  return [...new Set(ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
}

function displayName(user: {
  id: number;
  email: string | null;
  agent_code: string | null;
  agent?: { name: string | null } | null;
}) {
  return user.agent?.name || user.email || user.agent_code || `User #${user.id}`;
}

function toUserOption(user: {
  id: number;
  email: string | null;
  agent_code: string | null;
  profile_picture: string | null;
  agent?: { name: string | null; email: string | null; contact: string | null } | null;
}): DepartmentUserOption {
  return {
    id: user.id,
    name: displayName(user),
    email: user.agent?.email || user.email || null,
    contact: user.agent?.contact || null,
    agent_code: user.agent_code,
    profile_picture: user.profile_picture,
  };
}

export async function getDepartmentManagementData() {
  const [departmentRows, membershipRows, userRows] = await Promise.all([
    db.select().from(departments).orderBy(desc(departments.updated_at), asc(departments.name)),
    db.select().from(departmentMembers),
    db.query.users.findMany({
      with: {
        agent: true,
      },
      orderBy: (users, { asc }) => [asc(users.agent_code), asc(users.email), asc(users.id)],
    }),
  ]);

  const usersById = new Map(userRows.map((user) => [user.id, toUserOption(user)]));
  const membershipsByDepartment = new Map<number, typeof membershipRows>();

  for (const membership of membershipRows) {
    const group = membershipsByDepartment.get(membership.department_id) || [];
    group.push(membership);
    membershipsByDepartment.set(membership.department_id, group);
  }

  const departmentData: ManagedDepartment[] = departmentRows.map((department) => {
    const assignments = (membershipsByDepartment.get(department.id) || [])
      .map((membership) => {
        const user = usersById.get(membership.user_id);
        const role = normalizeRole(membership.role);
        if (!user || !role) return null;

        return {
          ...user,
          role,
        };
      })
      .filter((assignment): assignment is DepartmentMemberAssignment => Boolean(assignment));

    const hod = assignments.find((assignment) => assignment.role === "HOD") || null;
    const assistantHods = assignments.filter((assignment) => assignment.role === "ASSISTANT_HOD");
    const members = assignments.filter((assignment) => assignment.role === "MEMBER");

    return {
      id: department.id,
      name: department.name,
      description: department.description,
      hod,
      assistant_hods: assistantHods,
      members,
      headcount: assignments.length,
      updated_at: department.updated_at,
    };
  });

  return {
    departments: departmentData,
    users: [...usersById.values()],
    stats: {
      departments: departmentData.length,
      assigned_hods: departmentData.filter((department) => department.hod).length,
      assistant_hods: departmentData.reduce((count, department) => count + department.assistant_hods.length, 0),
      members: departmentData.reduce((count, department) => count + department.members.length, 0),
      unstaffed_departments: departmentData.filter((department) => department.headcount === 0).length,
    },
  };
}

export async function createDepartment(input: CreateDepartmentInput) {
  const name = input.name.trim();
  const description = input.description?.trim() || null;

  if (!name) {
    return { success: false, error: "Department name is required." };
  }

  await db.insert(departments).values({
    name,
    description,
    created_at: new Date(),
    updated_at: new Date(),
  });

  revalidatePath("/users/department-management");
  return { success: true };
}

export async function updateDepartmentAssignments(input: UpdateDepartmentInput) {
  const departmentId = Number(input.departmentId);
  const name = input.name.trim();
  const description = input.description?.trim() || null;
  const hodUserId = input.hodUserId ? Number(input.hodUserId) : null;
  const assistantIds = normalizeUserIds(input.assistantHodUserIds || []);
  const memberIds = normalizeUserIds(input.memberUserIds || []);

  if (!Number.isInteger(departmentId) || departmentId <= 0) {
    return { success: false, error: "Invalid department selected." };
  }

  if (!name) {
    return { success: false, error: "Department name is required." };
  }

  if (hodUserId !== null && (!Number.isInteger(hodUserId) || hodUserId <= 0)) {
    return { success: false, error: "Invalid HoD selected." };
  }

  if (assistantIds.length > 2) {
    return { success: false, error: "A department can have up to 2 Assistant HoDs." };
  }

  if (hodUserId && assistantIds.includes(hodUserId)) {
    return { success: false, error: "HoD cannot also be an Assistant HoD." };
  }

  const leadershipIds = new Set([hodUserId, ...assistantIds].filter((id): id is number => Boolean(id)));
  const finalMemberIds = memberIds.filter((id) => !leadershipIds.has(id));
  const allUserIds = [...leadershipIds, ...finalMemberIds];

  if (allUserIds.length > 0) {
    const validUsers = await db.query.users.findMany();
    const validUserIds = new Set(validUsers.map((user) => user.id));
    const invalidUserId = allUserIds.find((id) => !validUserIds.has(id));
    if (invalidUserId) {
      return { success: false, error: `Selected user #${invalidUserId} was not found.` };
    }
  }

  const department = await db.query.departments.findFirst({
    where: eq(departments.id, departmentId),
  });

  if (!department) {
    return { success: false, error: "Department not found." };
  }

  const now = new Date();
  const rowsToInsert: Array<typeof departmentMembers.$inferInsert> = [];

  if (hodUserId) {
    rowsToInsert.push({
      department_id: departmentId,
      user_id: hodUserId,
      role: "HOD",
      created_at: now,
      updated_at: now,
    });
  }

  for (const assistantId of assistantIds) {
    rowsToInsert.push({
      department_id: departmentId,
      user_id: assistantId,
      role: "ASSISTANT_HOD",
      created_at: now,
      updated_at: now,
    });
  }

  for (const memberId of finalMemberIds) {
    rowsToInsert.push({
      department_id: departmentId,
      user_id: memberId,
      role: "MEMBER",
      created_at: now,
      updated_at: now,
    });
  }

  await db.transaction(async (tx) => {
    await tx
      .update(departments)
      .set({
        name,
        description,
        updated_at: now,
      })
      .where(eq(departments.id, departmentId));

    await tx.delete(departmentMembers).where(eq(departmentMembers.department_id, departmentId));

    if (rowsToInsert.length > 0) {
      await tx.insert(departmentMembers).values(rowsToInsert);
    }
  });

  revalidatePath("/users/department-management");
  return { success: true };
}
