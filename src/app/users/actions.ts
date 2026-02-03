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
      linked_agent_profile: u.linked_agent_profile,
      agent_name: u.agent?.name || "N/A",
      agent_email: u.agent?.email || "N/A",
      agent_contact: u.agent?.contact || "N/A",
      agent_type: u.agent?.agent_type || "N/A",
      agent_address: u.agent?.address || "N/A",
      agent_banker: u.agent?.banker || "N/A",
      agent_bankin_account: u.agent?.bankin_account || "N/A",
      agent_ic_front: u.agent?.employee_ic_front || null, // Employee IC front
      agent_ic_back: u.agent?.employee_ic_back || null,   // Employee IC back
      last_synced_at: u.last_synced_at,
    }));

    console.log('Sample transformed user:', transformedData[0]);
    return transformedData;
  } catch (error) {
    console.error("Database error in getUsers:", error);
    throw error;
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
  console.log('=== SERVER ACTION DEBUG ===');
  console.log('Received userId:', userId);
  console.log('Received agentData:', agentData);
  console.log('Received tags:', tags);
  
  try {
    // First find the user to get the agent link
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId)
    });

    console.log('Found user:', {
      id: user?.id,
      bubble_id: user?.bubble_id,
      linked_agent_profile: user?.linked_agent_profile
    });

    if (!user) {
      console.log('❌ User not found');
      return { success: false, error: "User not found" };
    }

    // Update access_level on the user table if tags provided
    if (tags) {
      console.log('Updating user tags...');
      await db
        .update(users)
        .set({
          access_level: tags,
          updated_at: new Date(),
        })
        .where(eq(users.id, userId));
      console.log('✅ Tags updated');
    }

    // Update agent profile if link exists
    if (user.linked_agent_profile) {
      console.log('Updating agent profile with bubble_id:', user.linked_agent_profile);
      console.log('Agent update data:', agentData);
      
      const result = await db
        .update(agents)
        .set({
          ...agentData,
          updated_at: new Date(),
        })
        .where(eq(agents.bubble_id, user.linked_agent_profile))
        .returning();
      
      console.log('✅ Agent update result - rows affected:', result.length);
      if (result.length > 0) {
        console.log('Updated agent data:', result[0]);
      } else {
        console.log('❌❌❌ CRITICAL: No rows updated - linked_agent_profile exists but no matching agent!');
        console.log('linked_agent_profile value:', user.linked_agent_profile);
        console.log('This user has a BROKEN agent link!');
        return { success: false, error: 'Agent profile link is broken. Please contact support.' };
      }
    } else {
      console.log('⚠️ No linked_agent_profile - skipping agent update');
      return { success: false, error: 'User has no linked agent profile' };
    }

    console.log('========================');
    revalidatePath("/users");
    return { success: true };
  } catch (error) {
    console.error("Database error in updateUserProfile:", error);
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
