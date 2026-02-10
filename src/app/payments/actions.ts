"use server";

import { db } from "@/lib/db";
import { payments, submitted_payments, agents, customers, invoices, invoice_templates, users, invoice_items } from "@/db/schema";
import { ilike, or, desc, eq, and, sql, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { syncPaymentsFromBubble } from "@/lib/bubble";

export async function triggerPaymentSync() {
  const result = await syncPaymentsFromBubble();
  if (result.success) {
    revalidatePath("/payments");
  }
  return result;
}

export async function getSubmittedPayments(search?: string, status: string = 'pending') {
  try {
    const searchFilters = search
      ? or(
          ilike(submitted_payments.remark, `%${search}%`),
          ilike(submitted_payments.payment_method, `%${search}%`),
          ilike(agents.name, `%${search}%`),
          ilike(customers.name, `%${search}%`)
        )
      : undefined;

    const whereClause = searchFilters 
      ? and(eq(submitted_payments.status, status), searchFilters)
      : eq(submitted_payments.status, status);

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
        customer_name: customers.name,
        created_at: submitted_payments.created_at,
        linked_invoice: submitted_payments.linked_invoice,
        share_token: invoices.share_token,
        log: submitted_payments.log,
      })
      .from(submitted_payments)
      .leftJoin(agents, eq(submitted_payments.linked_agent, agents.bubble_id))
      .leftJoin(customers, eq(submitted_payments.linked_customer, customers.customer_id))
      .leftJoin(invoices, eq(submitted_payments.linked_invoice, invoices.bubble_id))
      .where(whereClause)
      .orderBy(desc(submitted_payments.created_at))
      .limit(50);

    return data;
  } catch (error) {
    console.error("Database error in getSubmittedPayments:", error);
    throw error;
  }
}

export async function getVerifiedPayments(search?: string) {
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
        customer_name: customers.name,
        created_at: payments.created_at,
        linked_invoice: payments.linked_invoice,
        share_token: invoices.share_token,
        payment_index: payments.payment_index,
        epp_month: payments.epp_month,
        bank_charges: payments.bank_charges,
        terminal: payments.terminal,
        epp_type: payments.epp_type,
        payment_method_v2: payments.payment_method_v2,
        log: payments.log,
      })
      .from(payments)
      .leftJoin(agents, eq(payments.linked_agent, agents.bubble_id))
      .leftJoin(customers, eq(payments.linked_customer, customers.customer_id))
      .leftJoin(invoices, eq(payments.linked_invoice, invoices.bubble_id))
      .where(filters)
      .orderBy(desc(payments.payment_date), desc(payments.created_at))
      .limit(50);

    return data;
  } catch (error) {
    console.error("Database error in getVerifiedPayments:", error);
    throw error;
  }
}

export async function getInvoiceDetailsByBubbleId(bubbleId: string) {
  try {
    // Try to parse as integer for invoice_id search
    const numericId = parseInt(bubbleId);
    const isNumeric = !isNaN(numericId) && /^\d+$/.test(bubbleId);

    const invoice = await db.query.invoices.findFirst({
      where: isNumeric 
        ? or(eq(invoices.bubble_id, bubbleId), eq(invoices.invoice_id, numericId))
        : eq(invoices.bubble_id, bubbleId),
    });

    if (!invoice) {
      return null;
    }

    // Fetch linked items using linked_invoice column in invoice_items table
    const items = await db.query.invoice_items.findMany({
      where: eq(invoice_items.linked_invoice, invoice.bubble_id || ''),
      orderBy: desc(invoice_items.created_at)
    });

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
    console.error("Database error in getInvoiceDetailsByBubbleId:", error);
    throw error;
  }
}

/**
 * Diagnostic function to check for missing invoices linked to payments
 */
export async function diagnoseMissingInvoices() {
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

    return result;
  } catch (error) {
    console.error("Error in diagnoseMissingInvoices:", error);
    throw error;
  }
}

export async function verifyPayment(submittedPaymentId: number, adminId: string) {
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
      log: p.log, // Preserve log from submission
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

// ============================================================================
// NEW ACTIONS FOR PAYMENT MANAGEMENT
// ============================================================================

interface UpdatePaymentParams {
  amount?: string;
  payment_method?: string;
  payment_date?: Date;
}

export async function updateVerifiedPayment(id: number, updates: UpdatePaymentParams, user: string) {
  try {
    // Get current payment
    const current = await db.query.payments.findFirst({
      where: eq(payments.id, id)
    });

    if (!current) throw new Error("Payment not found");

    const changes: string[] = [];
    const dateStr = new Date().toISOString();

    if (updates.amount && updates.amount !== current.amount) {
      changes.push(`[${dateStr}] ${user} changed Amount from ${current.amount} to ${updates.amount}`);
    }
    if (updates.payment_method && updates.payment_method !== current.payment_method) {
      changes.push(`[${dateStr}] ${user} changed Method from ${current.payment_method} to ${updates.payment_method}`);
    }
    if (updates.payment_date && current.payment_date && updates.payment_date.getTime() !== current.payment_date.getTime()) {
      changes.push(`[${dateStr}] ${user} changed Date from ${current.payment_date.toISOString()} to ${updates.payment_date.toISOString()}`);
    }

    if (changes.length === 0) return { success: true, message: "No changes detected" };

    const newLog = (current.log ? current.log + "\n" : "") + changes.join("\n");

    await db.update(payments)
      .set({
        ...updates,
        log: newLog,
        updated_at: new Date()
      })
      .where(eq(payments.id, id));

    revalidatePath("/payments");
    return { success: true, message: "Payment updated successfully" };
  } catch (error) {
    console.error("Error updating verified payment:", error);
    throw error;
  }
}

export async function updateSubmittedPayment(id: number, updates: UpdatePaymentParams, user: string) {
  try {
    // Get current payment
    const current = await db.query.submitted_payments.findFirst({
      where: eq(submitted_payments.id, id)
    });

    if (!current) throw new Error("Payment not found");

    const changes: string[] = [];
    const dateStr = new Date().toISOString();

    if (updates.amount && updates.amount !== current.amount) {
      changes.push(`[${dateStr}] ${user} changed Amount from ${current.amount} to ${updates.amount}`);
    }
    if (updates.payment_method && updates.payment_method !== current.payment_method) {
      changes.push(`[${dateStr}] ${user} changed Method from ${current.payment_method} to ${updates.payment_method}`);
    }
    if (updates.payment_date && current.payment_date && updates.payment_date.getTime() !== current.payment_date.getTime()) {
      changes.push(`[${dateStr}] ${user} changed Date from ${current.payment_date.toISOString()} to ${updates.payment_date.toISOString()}`);
    }

    if (changes.length === 0) return { success: true, message: "No changes detected" };

    const newLog = (current.log ? current.log + "\n" : "") + changes.join("\n");

    await db.update(submitted_payments)
      .set({
        ...updates,
        log: newLog,
        updated_at: new Date()
      })
      .where(eq(submitted_payments.id, id));

    revalidatePath("/payments");
    return { success: true, message: "Submitted payment updated successfully" };
  } catch (error) {
    console.error("Error updating submitted payment:", error);
    throw error;
  }
}

export async function softDeleteSubmittedPayment(id: number, user: string) {
  try {
     const current = await db.query.submitted_payments.findFirst({
      where: eq(submitted_payments.id, id)
    });

    if (!current) throw new Error("Payment not found");

    const dateStr = new Date().toISOString();
    const logEntry = `[${dateStr}] ${user} deleted this submission.`;
    const newLog = (current.log ? current.log + "\n" : "") + logEntry;

    await db.update(submitted_payments)
      .set({
        status: 'deleted',
        log: newLog,
        updated_at: new Date()
      })
      .where(eq(submitted_payments.id, id));

    revalidatePath("/payments");
    return { success: true };
  } catch (error) {
    console.error("Error deleting submitted payment:", error);
    throw error;
  }
}

export async function runPaymentReconciliation() {
  try {
    // 1. Get all pending submitted payments
    const pending = await db.select().from(submitted_payments).where(eq(submitted_payments.status, 'pending'));
    
    let matchedCount = 0;

    for (const p of pending) {
      // 2. Check for match in verified payments
      // Match criteria: Amount, Date (roughly), Agent, Customer, Invoice
      
      const conditions = [
        p.amount ? eq(payments.amount, p.amount) : undefined,
        p.linked_agent ? eq(payments.linked_agent, p.linked_agent) : undefined,
        p.linked_invoice ? eq(payments.linked_invoice, p.linked_invoice) : undefined,
      ].filter(Boolean); // Remove undefined

      // Note: Dates might differ slightly due to timezones, so exact match is risky.
      // But for now, let's trust the 5-column rule requested: Amount, Agent, Customer, Invoice, Date
      
      const potentialMatches = await db.select().from(payments).where(and(...conditions as any));

      // Refine match: Check date within 24 hours? Or exact?
      // "pick 5 column to check" -> let's try strict match first, if it fails, maybe relax date
      
      const match = potentialMatches.find(pm => {
        // Date check (ignore time)
        const d1 = pm.payment_date ? new Date(pm.payment_date).toDateString() : '';
        const d2 = p.payment_date ? new Date(p.payment_date).toDateString() : '';
        
        // Customer check
        const c1 = pm.linked_customer || '';
        const c2 = p.linked_customer || '';
        
        return d1 === d2 && c1 === c2;
      });

      if (match) {
        // 3. Mark as verified/deleted if match found
        await db.update(submitted_payments)
          .set({ 
            status: 'deleted', // or 'verified' -> Request says "mark the submitted payment as deleted"
            log: (p.log || '') + `\n[${new Date().toISOString()}] System Auto-Reconciliation: Matched with verified payment ID ${match.id}`,
            updated_at: new Date()
          })
          .where(eq(submitted_payments.id, p.id));
        matchedCount++;
      }
    }

    revalidatePath("/payments");
    return { success: true, count: matchedCount };
  } catch (error) {
    console.error("Reconciliation error:", error);
    throw error;
  }
}