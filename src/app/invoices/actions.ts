"use server";

import { db } from "@/lib/db";
import { invoices, agents, users, invoice_templates, customers, payments, invoice_items } from "@/db/schema";
import { ilike, or, sql, desc, eq, and, inArray } from "drizzle-orm";
import { getInvoiceHtml } from "@/lib/invoice-renderer";
import { revalidatePath } from "next/cache";
import { syncCompleteInvoicePackage } from "@/lib/bubble";

const PDF_API_URL = "https://pdf-gen-production-6c81.up.railway.app";

export async function getInvoices(version: "v1" | "v2", search?: string) {
  console.log(`Fetching invoices: version=${version}, search=${search}`);
  try {
    if (version === "v1") {
      const filters = [
        sql`(${invoices.invoice_number} IS NULL OR ${invoices.invoice_number} = '')`
      ];

      if (search) {
        filters.push(or(
          ilike(invoices.linked_customer, `%${search}%`),
          ilike(agents.name, `%${search}%`),
          ilike(invoices.dealercode, `%${search}%`),
          sql`CAST(${invoices.invoice_id} AS TEXT) ILIKE ${`%${search}%`}`
        ) as any);
      }

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
      .where(and(...filters))
      .orderBy(desc(invoices.id))
      .limit(50);
      
      console.log(`Fetched ${data.length} v1 invoices`);
      return data;
    } else {
      // v2 - Modern Invoices (Consolidated)
      const data = await db.execute(sql`
        SELECT
          i.id,
          i.invoice_number,
          i.total_amount,
          i.invoice_date,
          i.percent_of_total_amount,
          c.name as customer_name,
          COALESCE(a.name, i.linked_agent) as agent_name
        FROM invoice i
        LEFT JOIN customer c ON c.customer_id = i.linked_customer
        LEFT JOIN agent a ON a.bubble_id = i.linked_agent
        WHERE i.is_latest = true
        ${search ? sql`AND (c.name ILIKE ${`%${search}%`} OR i.invoice_number ILIKE ${`%${search}%`} OR a.name ILIKE ${`%${search}%`})` : sql``}
        ORDER BY i.created_at DESC
        LIMIT 50
      `);

      const processedData = data.rows.map((row: any) => ({
        id: row.id,
        invoice_number: row.invoice_number,
        total_amount: row.total_amount,
        invoice_date: row.invoice_date,
        percent_of_total_amount: row.percent_of_total_amount,
        customer_name_snapshot: row.customer_name || "N/A",
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
    const invoice = await db.query.invoices.findFirst({
      where: eq(invoices.id, id),
    });

    if (!invoice) return null;

    if (version === "v2" || invoice.invoice_number) {
      // Fetch all linked invoice items
      let items: any[] = [];
      if (invoice.linked_invoice_item && invoice.linked_invoice_item.length > 0) {
        items = await db.query.invoice_items.findMany({
          where: inArray(invoice_items.bubble_id, invoice.linked_invoice_item),
        });
      }

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

      // Fetch customer data
      let customerData = null;
      if (invoice.linked_customer) {
        customerData = await db.query.customers.findFirst({
          where: eq(customers.customer_id, invoice.linked_customer),
        });
      }

      // Fetch all linked payments
      let paymentsData: any[] = [];
      if (invoice.linked_payment && invoice.linked_payment.length > 0) {
        paymentsData = await db.query.payments.findMany({
          where: inArray(payments.bubble_id, invoice.linked_payment),
        });
      }

      return {
        ...invoice,
        items,
        template,
        created_by_user_name,
        customer_data: customerData,
        customer_name_snapshot: customerData?.name || null,
        customer_address_snapshot: customerData?.address || null,
        customer_phone_snapshot: customerData?.phone || null,
        customer_email_snapshot: customerData?.email || null,
        linked_payments: paymentsData,
        total_payments: paymentsData.reduce((sum, p) => sum + Number(p.amount || 0), 0),
      };
    } else {
      // v1 legacy - limited detail support for now
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
        created_by_user_name: "Legacy System",
        customer_data: null,
        linked_payments: [],
        total_payments: 0,
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

export async function triggerInvoiceSync(dateFrom?: string, dateTo?: string) {
  console.log(`Triggering invoice sync from Bubble... Date range: ${dateFrom || 'All'} to ${dateTo || 'All'}`);
  try {
    const result = await syncCompleteInvoicePackage(dateFrom, dateTo);
    if (!result.success) {
      console.error("Invoice sync failed:", result.error);
      return { success: false, error: result.error };
    }

    revalidatePath("/invoices");
    return { success: true, results: result.results };
  } catch (error) {
    console.error("Error triggering invoice sync:", error);
    return { success: false, error: String(error) };
  }
}
