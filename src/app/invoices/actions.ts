"use server";

import { db } from "@/lib/db";
import { invoices, invoices_new, agents, users, invoice_new_items, invoice_templates } from "@/db/schema";
import { ilike, or, sql, desc, eq } from "drizzle-orm";
import { getInvoiceHtml } from "@/lib/invoice-renderer";

const PDF_API_URL = "https://pdf-gen-production-6c81.up.railway.app";

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

export async function getInvoiceDetails(id: number, version: "v1" | "v2") {
  console.log(`Fetching invoice details: id=${id}, version=${version}`);
  try {
    if (version === "v2") {
      const invoice = await db.query.invoices_new.findFirst({
        where: eq(invoices_new.id, id),
      });

      if (!invoice) return null;

      const items = await db.query.invoice_new_items.findMany({
        where: eq(invoice_new_items.invoice_id, invoice.bubble_id as string),
        orderBy: [desc(invoice_new_items.sort_order)],
      });

      const template = await db.query.invoice_templates.findFirst({
        where: invoice.template_id 
          ? eq(invoice_templates.bubble_id, invoice.template_id)
          : eq(invoice_templates.is_default, true),
      });

      // Get creator name
      let created_by_user_name = "System";
      if (invoice.created_by) {
        const creator = await db.query.users.findFirst({
          where: eq(users.bubble_id, invoice.created_by),
        });
        if (creator) {
          created_by_user_name = creator.email || "User";
        }
      }

      return {
        ...invoice,
        items,
        template,
        created_by_user_name
      };
    } else {
      // v1 legacy - limited detail support for now
      const invoice = await db.query.invoices.findFirst({
        where: eq(invoices.id, id),
      });
      
      if (!invoice) return null;

      // For v1, we'll try to map it to the viewer structure
      return {
        id: invoice.id,
        invoice_number: `INV-${invoice.invoice_id}`,
        invoice_date: invoice.invoice_date instanceof Date ? invoice.invoice_date.toISOString().split('T')[0] : null,
        total_amount: invoice.amount,
        subtotal: invoice.amount,
        customer_name_snapshot: invoice.linked_customer,
        items: [
          {
            description: "Legacy Invoice Item",
            qty: 1,
            total_price: invoice.amount,
            item_type: "product"
          }
        ],
        template: await db.query.invoice_templates.findFirst({ where: eq(invoice_templates.is_default, true) }),
        created_by_user_name: "Legacy System"
      };
    }
  } catch (error) {
    console.error("Database error in getInvoiceDetails:", error);
    throw error;
  }
}

export async function generateInvoicePdf(id: number, version: "v1" | "v2") {
  console.log(`Generating PDF for invoice: id=${id}, version=${version}`);
  try {
    const details = await getInvoiceDetails(id, version);
    if (!details) throw new Error("Invoice not found");

    const html = getInvoiceHtml(details);

    const response = await fetch(`${PDF_API_URL}/api/generate-pdf`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        html,
        baseUrl: process.env.NEXT_PUBLIC_APP_URL || "https://admin.atap.solar",
        options: {
          format: "A4",
          printBackground: true,
          margin: {
            top: "0.5cm",
            right: "0.5cm",
            bottom: "0.5cm",
            left: "0.5cm",
          },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PDF API error: ${errorText}`);
    }

    const data = await response.json();
    const pdfId = data.pdfId;

    if (!pdfId) {
      throw new Error("PDF ID not received from API");
    }

    return {
      pdfId,
      downloadUrl: `${PDF_API_URL}/api/download/${pdfId}`,
    };
  } catch (error) {
    console.error("Failed to generate PDF:", error);
    throw error;
  }
}
