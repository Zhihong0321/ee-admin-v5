"use server";

import { db } from "@/lib/db";
import { users, agents } from "@/db/schema";
import { ilike, or, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { pushUserUpdateToBubble, pushAgentUpdateToBubble, syncProfilesFromBubble, syncSingleProfileFromBubble } from "@/lib/bubble";
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
          sql`EXISTS (
            SELECT 1 FROM agent a 
            WHERE a.bubble_id = ${users.linked_agent_profile} 
            AND (a.name ILIKE ${`%${search}%`} OR a.email ILIKE ${`%${search}%`})
          )`
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
      with: {
        agent: true
      },
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
      agent_name: u.agent?.name || "N/A",
      agent_email: u.agent?.email || "N/A",
      agent_contact: u.agent?.contact || "N/A",
      agent_type: u.agent?.agent_type || "N/A",
      agent_address: u.agent?.address || "N/A",
      agent_banker: u.agent?.banker || "N/A",
      agent_bankin_account: u.agent?.bankin_account || "N/A",
      agent_ic_front: u.agent?.ic_front || null,
      agent_ic_back: u.agent?.ic_back || null,
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

export async function createAgentForUser(userId: number, agentData: Partial<typeof agents.$inferInsert>) {
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      with: { agent: true }
    });

    if (!user) {
      return { success: false, error: "User not found" };
    }

    // If user has linked_agent_profile but agent doesn't exist, create with that bubble_id
    if (user.linked_agent_profile && !user.agent) {
      // Check if agent with this bubble_id already exists
      const existingAgent = await db.query.agents.findFirst({
        where: eq(agents.bubble_id, user.linked_agent_profile)
      });

      if (existingAgent) {
        return { success: false, error: "Agent with this bubble_id already exists" };
      }

      const newAgent = await db
        .insert(agents)
        .values({
          bubble_id: user.linked_agent_profile, // Use existing link
          name: agentData.name,
          email: agentData.email,
          contact: agentData.contact,
          address: agentData.address,
          banker: agentData.banker,
          bankin_account: agentData.bankin_account,
          agent_type: 'manual',
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning();

      revalidatePath("/users");
      return { success: true, agent: newAgent[0] };
    }

    if (user.agent) {
      return { success: false, error: "User already has a linked agent profile" };
    }

    // Create new agent with user's bubble_id as the agent bubble_id
    const newAgent = await db
      .insert(agents)
      .values({
        bubble_id: user.bubble_id + '_agent', // Create unique agent bubble_id
        name: agentData.name,
        email: agentData.email,
        contact: agentData.contact,
        address: agentData.address,
        banker: agentData.banker,
        bankin_account: agentData.bankin_account,
        agent_type: 'manual',
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning();

    // Link the agent to the user
    await db
      .update(users)
      .set({
        linked_agent_profile: newAgent[0].bubble_id,
        updated_at: new Date(),
      })
      .where(eq(users.id, userId));

    revalidatePath("/users");
    return { success: true, agent: newAgent[0] };
  } catch (error) {
    console.error("Error creating agent:", error);
    return { success: false, error: `Failed to create agent: ${String(error)}` };
  }
}

export async function updateUserProfile(userId: number, agentData: Partial<typeof agents.$inferInsert>, tags?: string[]) {
  try {
    // First find the user to get the agent link
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId)
    });

    if (!user) {
      return { success: false, error: "User not found" };
    }

    // Update access_level on the user table if tags provided
    if (tags) {
      await db
        .update(users)
        .set({
          access_level: tags,
          updated_at: new Date(),
        })
        .where(eq(users.id, userId));
    }

    // Update agent profile if link exists
    if (user.linked_agent_profile) {
      const result = await db
        .update(agents)
        .set({
          ...agentData,
          updated_at: new Date(),
        })
        .where(eq(agents.bubble_id, user.linked_agent_profile))
        .returning();

      if (result.length === 0) {
        return { success: false, error: 'Agent profile link is broken. Please contact support.' };
      }
    } else {
      return { success: false, error: 'User has no linked agent profile' };
    }

    revalidatePath("/users");
    return { success: true };
  } catch (error) {
    console.error("updateUserProfile error:", error);
    return { success: false, error: `Database error: ${String(error)}` };
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
