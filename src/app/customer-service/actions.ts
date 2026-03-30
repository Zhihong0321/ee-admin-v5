"use server";

import fs from "fs";
import path from "path";
import { db } from "@/lib/db";
import { invoices, customers, agents, app_settings } from "@/db/schema";
import { desc, isNotNull, eq } from "drizzle-orm";

const CS_WHATSAPP_KEY = "CS_WHATSAPP_NO";

export async function getCustomerServiceNo() {
  try {
    const records = await db.select().from(app_settings).where(eq(app_settings.key, CS_WHATSAPP_KEY)).limit(1);
    if (records.length > 0) {
      return records[0].value || "";
    }
    return "";
  } catch (error) {
    console.error("Failed to get CS number from DB:", error);
    return ""; 
  }
}

export async function saveCustomerServiceNo(whatsappNo: string) {
  try {
    await db.insert(app_settings)
      .values({ key: CS_WHATSAPP_KEY, value: whatsappNo })
      .onConflictDoUpdate({
        target: app_settings.key,
        set: { value: whatsappNo, updated_at: new Date() }
      });
    return { success: true };
  } catch (error: any) {
    console.error("Failed to save CS number:", error);
    return { success: false, error: error.message };
  }
}

// 2. Fetching invoices
export async function getPaidInvoices() {
  try {
    const results = await db.select({
      id: invoices.id,
      invoice_number: invoices.invoice_number,
      first_payment_date: invoices.first_payment_date,
      customer_name: customers.name,
      customer_phone: customers.phone,
      agent_name: agents.name,
      agent_phone: agents.contact,
    })
      .from(invoices)
      .leftJoin(customers, eq(invoices.linked_customer, customers.customer_id))
      .leftJoin(agents, eq(invoices.linked_agent, agents.bubble_id))
      .where(isNotNull(invoices.first_payment_date))
      .orderBy(desc(invoices.first_payment_date));
    
    return results;
  } catch (error) {
    console.error("Failed to fetch paid invoices", error);
    return [];
  }
}

// 3. Create WhatsApp group
export async function createWhatsAppGroup(customerName: string, participants: string[], retry: boolean = true) {
  const url = "https://ee-baileys-production.up.railway.app/groups/create";
  
  // Clean participants: remove empty/invalid and non-digits
  const cleanedParticipants = participants
    .filter(p => !!p)
    .map(p => p.replace(/\D/g, '')) 
    .filter(p => p.length > 8); 

  // Require at least CS and another
  if (cleanedParticipants.length === 0) {
    return { success: false, error: "No valid participants provided." };
  }

  const subject = `${customerName} | Eternalgy Solar`;

  // Determine the correct public URL for your image 
  // Make sure your Next.js app is publicly reachable, or pass a permanent remote URL.
  // Using an external placeholder URL just to test if the backend accepts imageUrl/picture
  // Alternatively if your wrapper accepts base64 here, you can place it.
  
  let base64Image = "";
  try {
    // Check both potential names
    const names = ["eternalgy-profile.png", "eternalgy-whatsapp.png"];
    for (const n of names) {
      const p = path.join(process.cwd(), "public", n);
      if (fs.existsSync(p)) {
        base64Image = `data:image/png;base64,${fs.readFileSync(p).toString("base64")}`;
        break;
      }
    }
  } catch(e) {}

  const payload = {
    sessionId: "eternalgy-auth",
    subject: subject.slice(0, 50),
    participants: cleanedParticipants,
    profileImageUrl: base64Image || undefined
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (response.status === 409) {
      const existingGroupUid = data.groupUid;
      if (existingGroupUid && retry) {
        console.log(`Conflict detected for group creation. Attempting to leave existing group: ${existingGroupUid}`);
        await deleteWhatsAppGroup(existingGroupUid);
        // Retry once after leaving
        return await createWhatsAppGroup(customerName, participants, false);
      }
      return { success: false, error: data.error || "Group already exists with these same members (409 Conflict)." };
    }

    if (!response.ok) {
      const err = await response.text();
      return { success: false, error: `Baileys API error: ${err}` };
    }

    return { success: true, group: data.group };
  } catch (error: any) {
    console.error("Failed to create whatsapp group", error);
    return { success: false, error: error.message };
  }
}

export async function deleteWhatsAppGroup(groupUid: string) {
  const encodedJid = encodeURIComponent(groupUid);
  const url = `https://ee-baileys-production.up.railway.app/groups/${encodedJid}?sessionId=eternalgy-auth`;

  try {
    const response = await fetch(url, {
      method: "DELETE",
    });

    if (!response.ok) {
      const err = await response.text();
      console.error(`Failed to leave group ${groupUid}: ${err}`);
      return { success: false, error: err };
    }

    return { success: true };
  } catch (error: any) {
    console.error(`Error leaving group ${groupUid}:`, error);
    return { success: false, error: error.message };
  }
}

export async function testCreateWhatsAppGroup(csNo: string) {
  // Test function to create a group specifically involving the provided csNo and a hardcoded number.
  return await createWhatsAppGroup("Test Customer", [csNo, "60182920127"]);
}

