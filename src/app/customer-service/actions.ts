"use server";

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
export async function createWhatsAppGroup(invoiceNumber: string, participants: string[]) {
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

  const subject = `INV-${invoiceNumber} Support`;

  const payload = {
    sessionId: "eternalgy-auth",
    subject: subject.slice(0, 25), // WA group names max length is 25
    participants: cleanedParticipants
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (response.status === 409) {
      return { success: false, error: "Group already exists with these same members (409 Conflict)." };
    }

    if (!response.ok) {
      const err = await response.text();
      return { success: false, error: `Baileys API error: ${err}` };
    }

    const data = await response.json();
    return { success: true, group: data.group };
  } catch (error: any) {
    console.error("Failed to create whatsapp group", error);
    return { success: false, error: error.message };
  }
}
