"use server";

import { db } from "@/lib/db";
import { invoices, invoices_new, agents, users } from "@/db/schema";
import { ilike, or, sql, desc, eq } from "drizzle-orm";

export async function getInvoices(version: "v1" | "v2", search?: string) {
  console.log(`Fetching invoices: version=${version}, search=${search}`);
  try {
    if (version === "v1") {
      const filters = search 
        ? or(
            ilike(invoices.linked_customer, `%${search}%`),
            ilike(agents.name, `%${search}%`),
            ilike(invoices.dealercode, `%${search}%`),
            sql`CAST(${invoices.invoice_id} AS TEXT) ILIKE ${`%${search}%`}`
          )
        : undefined;

      const data = await db.select({
        id: invoices.id,
        invoice_id: invoices.invoice_id,
        amount: invoices.amount,
        invoice_date: invoices.invoice_date,
        linked_customer: invoices.linked_customer,
        agent_name: agents.name,
        dealercode: invoices.dealercode,
      })
      .from(invoices)
      .leftJoin(agents, eq(invoices.linked_agent, agents.bubble_id))
      .where(filters)
      .orderBy(desc(invoices.id))
      .limit(50);
      
      console.log(`Fetched ${data.length} v1 invoices`);
      return data;
    } else {
      const filters = search
        ? or(
            ilike(invoices_new.customer_name_snapshot, `%${search}%`),
            ilike(agents.name, `%${search}%`),
            ilike(invoices_new.invoice_number, `%${search}%`)
          )
        : undefined;

      // Use a more standard Drizzle join for a2
      const data = await db.execute(sql`
        SELECT 
          i.id, 
          i.invoice_number, 
          i.total_amount, 
          i.invoice_date, 
          i.customer_name_snapshot,
          COALESCE(a1.name, a2.name) as agent_name
        FROM invoice_new i
        LEFT JOIN agent a1 ON i.agent_id = a1.bubble_id
        LEFT JOIN "user" u ON CAST(u.id AS TEXT) = i.created_by
        LEFT JOIN agent a2 ON u.linked_agent_profile = a2.bubble_id
        WHERE i.customer_id IS NOT NULL
        ${search ? sql`AND (i.customer_name_snapshot ILIKE ${`%${search}%`} OR i.invoice_number ILIKE ${`%${search}%`} OR a1.name ILIKE ${`%${search}%`} OR a2.name ILIKE ${`%${search}%`})` : sql``}
        ORDER BY i.id DESC
        LIMIT 50
      `);
      
      const processedData = data.rows.map((row: any) => ({
        id: row.id,
        invoice_number: row.invoice_number,
        total_amount: row.total_amount,
        invoice_date: row.invoice_date,
        customer_name_snapshot: row.customer_name_snapshot,
        agent_name: row.agent_name || "N/A"
      }));

      console.log(`Fetched ${processedData.length} v2 invoices`);
      return processedData;
    }
  } catch (error) {
    console.error("Database error in getInvoices:", error);
    throw error;
  }
}
