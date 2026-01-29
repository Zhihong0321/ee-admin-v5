"use server";

import { db } from "@/lib/db";
import { payments, submitted_payments, agents, customers, invoices, invoice_templates, users } from "@/db/schema";
import { ilike, or, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { syncPaymentsFromBubble } from "@/lib/bubble";

export async function triggerPaymentSync() {
  const result = await syncPaymentsFromBubble();
  if (result.success) {
    revalidatePath("/payments");
  }
  return result;
}

export async function getSubmittedPayments(search?: string) {
  console.log(`Fetching submitted payments: search=${search}`);
  try {
    const filters = search
      ? or(
          ilike(submitted_payments.remark, `%${search}%`),
          ilike(submitted_payments.payment_method, `%${search}%`),
          ilike(agents.name, `%${search}%`),
          ilike(customers.name, `%${search}%`)
        )
      : undefined;

    const data = await db
      .select({
        id: submitted_payments.id,
        bubble_id: submitted_payments.bubble_id,
        amount: submitted_payments.amount,
        payment_date: submitted_payments.payment_date,
        payment_method: submitted_payments.payment_method,
        status: submitted_payments.status,
        attachment: submitted_payments.attachment,
        remark: submitted_payments.remark,
        agent_name: agents.name,
        agent_bubble_id: submitted_payments.linked_agent,
        customer_name: customers.name,
        customer_bubble_id: submitted_payments.linked_customer,
        created_at: submitted_payments.created_at,
        linked_invoice: submitted_payments.linked_invoice,
      })
      .from(submitted_payments)
      .leftJoin(users, eq(submitted_payments.linked_agent, users.bubble_id))
      .leftJoin(agents, eq(users.linked_agent_profile, agents.bubble_id))
      .leftJoin(customers, eq(submitted_payments.linked_customer, customers.customer_id))
      .where(filters)
      .orderBy(desc(submitted_payments.created_at))
      .limit(50);

    console.log(`[DEBUG] Sample submitted payment:`, data[0] ? {
      id: data[0].id,
      linked_agent: data[0].agent_bubble_id,
      agent_name: data[0].agent_name,
      linked_customer: data[0].customer_bubble_id,
      customer_name: data[0].customer_name
    } : 'No data');

    return data;
  } catch (error) {
    console.error("Database error in getSubmittedPayments:", error);
    throw error;
  }
}

export async function getVerifiedPayments(search?: string) {
  console.log(`Fetching verified payments: search=${search}`);
  try {
    const filters = search
      ? or(
          ilike(payments.remark, `%${search}%`),
          ilike(payments.payment_method, `%${search}%`),
          ilike(agents.name, `%${search}%`),
          ilike(customers.name, `%${search}%`)
        )
      : undefined;

    const data = await db
      .select({
        id: payments.id,
        bubble_id: payments.bubble_id,
        amount: payments.amount,
        payment_date: payments.payment_date,
        payment_method: payments.payment_method,
        issuer_bank: payments.issuer_bank,
        attachment: payments.attachment,
        remark: payments.remark,
        agent_name: agents.name,
        agent_bubble_id: payments.linked_agent,
        customer_name: customers.name,
        customer_bubble_id: payments.linked_customer,
        created_at: payments.created_at,
        linked_invoice: payments.linked_invoice,
      })
      .from(payments)
      .leftJoin(users, eq(payments.linked_agent, users.bubble_id))
      .leftJoin(agents, eq(users.linked_agent_profile, agents.bubble_id))
      .leftJoin(customers, eq(payments.linked_customer, customers.customer_id))
      .where(filters)
      .orderBy(desc(payments.payment_date), desc(payments.created_at))
      .limit(50);

    console.log(`[DEBUG] Sample verified payment:`, data[0] ? {
      id: data[0].id,
      linked_agent: data[0].agent_bubble_id,
      agent_name: data[0].agent_name,
      linked_customer: data[0].customer_bubble_id,
      customer_name: data[0].customer_name
    } : 'No data');

    return data;
  } catch (error) {
    console.error("Database error in getVerifiedPayments:", error);
    throw error;
  }
}

export async function getInvoiceDetailsByBubbleId(bubbleId: string) {
  console.log(`[INVOICE LOOKUP] Searching for invoice with bubble_id: ${bubbleId}`);
  try {
    const invoice = await db.query.invoices.findFirst({
      where: eq(invoices.bubble_id, bubbleId),
    });

    if (!invoice) {
      console.error(`[INVOICE LOOKUP] Invoice NOT FOUND in database for bubble_id: ${bubbleId}`);
      console.error(`[INVOICE LOOKUP] This means the invoice hasn't been synced from Bubble to Postgres yet.`);
      // Check if there are ANY invoices in the database
      const allInvoices = await db.query.invoices.findMany({ limit: 5 });
      console.error(`[INVOICE LOOKUP] Sample invoice bubble_ids in database:`, allInvoices.map(inv => inv.bubble_id));
      return null;
    }

    console.log(`[INVOICE LOOKUP] Invoice FOUND: ${invoice.invoice_number} (ID: ${invoice.bubble_id})`);

    const items: any[] = [];

    console.log(`[INVOICE LOOKUP] Found ${items.length} items for invoice`);

    const template = await db.query.invoice_templates.findFirst({
      where: invoice.template_id
        ? eq(invoice_templates.bubble_id, invoice.template_id)
        : eq(invoice_templates.is_default, true),
    });

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
  } catch (error) {
    console.error("[INVOICE LOOKUP] Database error:", error);
    throw error;
  }
}

/**
 * Diagnostic function to check for missing invoices linked to payments
 */
export async function diagnoseMissingInvoices() {
  console.log("[DIAGNOSIS] Checking for missing invoices linked to payments...");
  const result = {
    totalPayments: 0,
    paymentsWithLinkedInvoice: 0,
    missingInvoices: [] as string[],
    sampleBubbleIds: [] as string[]
  };

  try {
    // Check verified payments
    const allPayments = await db
      .select({
        bubble_id: payments.bubble_id,
        linked_invoice: payments.linked_invoice,
        payment_date: payments.payment_date
      })
      .from(payments)
      .orderBy(desc(payments.payment_date))
      .limit(50);

    result.totalPayments = allPayments.length;

    for (const payment of allPayments) {
      if (payment.linked_invoice) {
        result.paymentsWithLinkedInvoice++;
        const invoice = await db.query.invoices.findFirst({
          where: eq(invoices.bubble_id, payment.linked_invoice)
        });

        if (!invoice) {
          result.missingInvoices.push(payment.linked_invoice);
        }
      }
    }

    // Get sample invoice IDs
    const sampleInvoices = await db.query.invoices.findMany({ limit: 5 });
    result.sampleBubbleIds = sampleInvoices.map(inv => inv.bubble_id).filter(Boolean) as string[];

    console.log("[DIAGNOSIS] Results:", result);
    return result;
  } catch (error) {
    console.error("[DIAGNOSIS] Error:", error);
    throw error;
  }
}

export async function verifyPayment(submittedPaymentId: number, adminId: string) {
  console.log(`Verifying payment: id=${submittedPaymentId}, admin=${adminId}`);
  try {
    // 1. Get the submitted payment data
    const submitted = await db
      .select()
      .from(submitted_payments)
      .where(eq(submitted_payments.id, submittedPaymentId))
      .limit(1);

    if (submitted.length === 0) {
      throw new Error("Submitted payment not found");
    }

    const p = submitted[0];

    // 2. Insert into payments table
    await db.insert(payments).values({
      bubble_id: p.bubble_id,
      amount: p.amount,
      payment_date: p.payment_date,
      payment_method: p.payment_method,
      payment_method_v2: p.payment_method_v2,
      attachment: p.attachment,
      remark: p.remark,
      linked_agent: p.linked_agent,
      linked_customer: p.linked_customer,
      linked_invoice: p.linked_invoice,
      terminal: p.terminal,
      epp_type: p.epp_type,
      epp_month: p.epp_month,
      bank_charges: p.bank_charges,
      issuer_bank: p.issuer_bank,
      created_by: p.created_by,
      verified_by: adminId,
      created_date: p.created_date,
      modified_date: new Date(),
    });

    // 3. Update status in submitted_payments or delete it
    // For now, let's update status to 'verified'
    await db
      .update(submitted_payments)
      .set({ status: 'verified', updated_at: new Date(), verified_by: adminId })
      .where(eq(submitted_payments.id, submittedPaymentId));

    revalidatePath("/payments");
    return { success: true };
  } catch (error) {
    console.error("Database error in verifyPayment:", error);
    throw error;
  }
}
