"use server";

import { db } from "@/lib/db";
import { users, agents } from "@/db/schema";
import { ilike, or, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { pushUserUpdateToBubble, pushAgentUpdateToBubble, syncProfilesFromBubble, syncSingleProfileFromBubble } from "@/lib/bubble";

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


export async function getUsers(search?: string) {
  console.log(`Fetching users with agent info: search=${search}`);
  try {
    // Using relational query for more reliable joins
    const data = await db.query.users.findMany({
      with: {
        agent: true
      },
      where: (users, { or, ilike }) => {
        if (!search) return undefined;
        return or(
          ilike(users.agent_code, `%${search}%`),
          sql`EXISTS (
            SELECT 1 FROM agent a 
            WHERE a.bubble_id = ${users.linked_agent_profile} 
            AND (a.name ILIKE ${`%${search}%`} OR a.email ILIKE ${`%${search}%`})
          )`
        );
      },
      orderBy: (users, { desc }) => [desc(users.id)],
      limit: 50,
    });

    console.log(`Fetched ${data.length} users raw data`);
    
    // Transform to match the UI expectation
    const transformedData = data.map(u => ({
      id: u.id,
      bubble_id: u.bubble_id,
      agent_code: u.agent_code,
      dealership: u.dealership,
      profile_picture: u.profile_picture,
      user_signed_up: u.user_signed_up,
      access_level: u.access_level || [],
      joined_date: u.created_date,
      agent_name: u.agent?.name || "N/A",
      agent_email: u.agent?.email || "N/A",
      agent_contact: u.agent?.contact || "N/A",
      agent_type: u.agent?.agent_type || "N/A",
      agent_address: u.agent?.address || "N/A",
      agent_banker: u.agent?.banker || "N/A",
      agent_bankin_account: u.agent?.bankin_account || "N/A",
      last_synced_at: u.last_synced_at,
    }));

    console.log('Sample transformed user:', transformedData[0]);
    return transformedData;
  } catch (error) {
    console.error("Database error in getUsers:", error);
    throw error;
  }
}

export async function updateUserProfile(userId: number, agentData: Partial<typeof agents.$inferInsert>, tags?: string[]) {
  try {
    // First find the user to get the agent link
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId)
    });

    if (user) {
      // Update access_level on the user table if tags provided
      if (tags) {
        await db
          .update(users)
          .set({
            access_level: tags,
            updated_at: new Date(),
          })
          .where(eq(users.id, userId));

        // PUSH TO BUBBLE
        if (user.bubble_id) {
          await pushUserUpdateToBubble(user.bubble_id, { access_level: tags });
        }
      }

      // Update agent profile if link exists
      if (user.linked_agent_profile) {
        await db
          .update(agents)
          .set({
            ...agentData,
            updated_at: new Date(),
          })
          .where(eq(agents.bubble_id, user.linked_agent_profile));

        // PUSH TO BUBBLE
        await pushAgentUpdateToBubble(user.linked_agent_profile, agentData);
      }
      
      revalidatePath("/users");
      return { success: true };
    }
    return { success: false, error: "User not found" };
  } catch (error) {
    console.error("Database error in updateUserProfile:", error);
    throw error;
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
