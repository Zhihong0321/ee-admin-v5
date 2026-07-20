"use server";

import { db } from "@/lib/db";
import { users } from "@/db/schema";
import { ilike, or, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { pushAgentUpdateToBubble, syncProfilesFromBubble, syncSingleProfileFromBubble } from "@/lib/bubble";
import fs from "fs";
import path from "path";

const STORAGE_ROOT = process.env.STORAGE_ROOT || "/storage";
const FILE_BASE_URL = process.env.FILE_BASE_URL || "https://admin.atap.solar";

type UserLetterType = "offer_letter" | "employment_letter";

function sanitizeUploadName(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function triggerProfileSync() {
  const result = await syncProfilesFromBubble();
  if (result.success) {
    revalidatePath("/users");
  }
  return result;
}

export async function syncUserFromBubble(bubbleId: string, agentBubbleId?: string) {
  try {
    if (bubbleId) {
      await syncSingleProfileFromBubble(bubbleId, 'user');
    }
    if (agentBubbleId) {
      await syncSingleProfileFromBubble(agentBubbleId, 'agent');
    }
    revalidatePath("/users");
    return { success: true };
  } catch (error) {
    console.error("Manual sync error:", error);
    return { success: false, error: String(error) };
  }
}

type GetUsersParams = {
  search?: string;
  page?: number;
  pageSize?: number;
};

export async function getUsers({ search, page = 1, pageSize = 50 }: GetUsersParams = {}) {
  try {
    const currentPage = Math.max(1, page);
    const safePageSize = Math.max(1, Math.min(pageSize, 100));
    const searchFilter = search
      ? or(
          ilike(users.agent_code, `%${search}%`),
          ilike(users.name, `%${search}%`),
          ilike(users.email, `%${search}%`)
        )
      : undefined;

    const totalCountQuery = db.select({
      count: sql<number>`count(*)::int`,
    }).from(users);
    const [{ count }] = searchFilter
      ? await totalCountQuery.where(searchFilter)
      : await totalCountQuery;
    const total = count ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / safePageSize));
    const effectivePage = Math.min(currentPage, totalPages);
    const offset = (effectivePage - 1) * safePageSize;

    const data = await db.query.users.findMany({
      where: searchFilter,
      orderBy: (users, { desc }) => [desc(users.id)],
      limit: safePageSize,
      offset,
    });

    const transformedData = data.map((u) => ({
      id: u.id,
      bubble_id: u.bubble_id,
      agent_code: u.agent_code,
      dealership: u.dealership,
      profile_picture: u.profile_picture,
      offer_letter: u.offer_letter,
      employment_letter: u.employment_letter,
      user_signed_up: u.user_signed_up,
      access_level: u.access_level || [],
      joined_date: u.created_date,
      linked_agent_profile: u.linked_agent_profile,
      agent_name: u.name || "N/A",
      agent_email: u.email || "N/A",
      agent_contact: u.contact || "N/A",
      agent_type: u.agent_type || "N/A",
      agent_address: u.address || "N/A",
      agent_banker: u.banker || "N/A",
      agent_bankin_account: u.bankin_account || "N/A",
      agent_ic_front: u.ic_front || null,
      agent_ic_back: u.ic_back || null,
      last_synced_at: u.last_synced_at,
    }));

    return {
      users: transformedData,
      pagination: {
        page: effectivePage,
        pageSize: safePageSize,
        total,
        totalPages,
      },
    };
  } catch (error) {
    console.error("Database error in getUsers:", error);
    throw error;
  }
}

export async function uploadUserLetter(userId: number, letterType: UserLetterType, formData: FormData) {
  try {
    if (!Number.isInteger(userId) || userId <= 0) {
      return { success: false, error: "Invalid user selected" };
    }

    if (letterType !== "offer_letter" && letterType !== "employment_letter") {
      return { success: false, error: "Invalid letter type" };
    }

    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) {
      return { success: false, error: "No file uploaded" };
    }

    const maxSize = 15 * 1024 * 1024;
    if (file.size > maxSize) {
      return { success: false, error: "File is too large. Maximum size is 15MB." };
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      return { success: false, error: "User not found" };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const subfolder = `users/letters/${letterType}`;
    const targetDir = path.join(STORAGE_ROOT, subfolder);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const sanitizedFilename = `${userId}-${Date.now()}-${sanitizeUploadName(file.name)}`;
    fs.writeFileSync(path.join(targetDir, sanitizedFilename), buffer);

    const fileUrl = `${FILE_BASE_URL}/api/files/${subfolder}/${sanitizedFilename}`;

    await db
      .update(users)
      .set({
        [letterType]: fileUrl,
        updated_at: new Date(),
      })
      .where(eq(users.id, userId));

    revalidatePath("/users");
    return { success: true, url: fileUrl };
  } catch (error) {
    console.error("uploadUserLetter error:", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Profile fields for a user. Formerly these lived on a separate `agent` row; the
 * agent table is retired (migration 2026-07-20b) and a user IS the agent, so these
 * are plain columns on `user`.
 */
type UserProfileData = {
  name?: string | null;
  email?: string | null;
  contact?: string | null;
  address?: string | null;
  banker?: string | null;
  bankin_account?: string | null;
  agent_type?: string | null;
};

/**
 * Kept for the existing "create agent profile" button. There is no longer a separate
 * agent record to create — this just fills in the user's own profile fields.
 */
export async function createAgentForUser(userId: number, agentData: UserProfileData) {
  return updateUserProfile(userId, { ...agentData, agent_type: agentData.agent_type || 'manual' });
}

export async function updateUserProfile(userId: number, agentData: UserProfileData, tags?: string[]) {
  try {
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });

    if (!user) {
      return { success: false, error: "User not found" };
    }

    const result = await db
      .update(users)
      .set({
        ...agentData,
        ...(tags ? { access_level: tags } : {}),
        updated_at: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    if (result.length === 0) {
      return { success: false, error: "Failed to update user profile" };
    }

    revalidatePath("/users");
    return { success: true };
  } catch (error) {
    console.error("updateUserProfile error:", error);
    return { success: false, error: `Database error: ${String(error)}` };
  }
}

export async function activateUser(userId: number) {
  try {
    if (!Number.isInteger(userId) || userId <= 0) {
      return { success: false, error: "Invalid user selected" };
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      return { success: false, error: "User not found" };
    }

    if (user.user_signed_up) {
      return { success: true, alreadyActive: true };
    }

    // Postgres is now the source of truth (Bubble sync is disabled), so a
    // local update is durable — no push to Bubble needed.
    await db
      .update(users)
      .set({
        user_signed_up: true,
        updated_at: new Date(),
      })
      .where(eq(users.id, userId));

    revalidatePath("/users");
    return { success: true };
  } catch (error) {
    console.error("activateUser error:", error);
    return { success: false, error: `Failed to activate user: ${String(error)}` };
  }
}

export async function getAllUniqueTags() {
  try {
    const res = await db.execute(sql`
      SELECT DISTINCT unnest(access_level) as tag 
      FROM "user" 
      WHERE access_level IS NOT NULL 
      ORDER BY tag
    `);
    return res.rows.map((r: any) => r.tag as string);
  } catch (error) {
    console.error("Database error in getAllUniqueTags:", error);
    return [];
  }
}
