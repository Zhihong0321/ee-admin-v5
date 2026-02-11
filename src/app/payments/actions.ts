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
        linked_invoice: submitted_payments.linked_invoice, // This might be numeric or bubble ID
        invoice_bubble_id: invoices.bubble_id, // REAL bubble ID from join
        share_token: invoices.share_token,
        log: submitted_payments.log,
      })
      .from(submitted_payments)
      .leftJoin(agents, eq(submitted_payments.linked_agent, agents.bubble_id))
      .leftJoin(customers, eq(submitted_payments.linked_customer, customers.customer_id))
      .leftJoin(invoices, sql`${submitted_payments.linked_invoice} = ${invoices.bubble_id} OR ${submitted_payments.linked_invoice} = CAST(${invoices.invoice_id} AS TEXT)`)
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
        invoice_bubble_id: invoices.bubble_id, // REAL bubble ID from join
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
      .leftJoin(invoices, sql`${payments.linked_invoice} = ${invoices.bubble_id} OR ${payments.linked_invoice} = CAST(${invoices.invoice_id} AS TEXT)`)
      .where(filters)
      .orderBy(desc(payments.payment_date), desc(payments.created_at))
      .limit(50);

    return data;
  } catch (error) {
    console.error("Database error in getVerifiedPayments:", error);
    throw error;
  }
}

/**
 * Get fully paid invoices with payment details
 */
export async function getFullyPaidInvoices(search?: string) {
  try {
    const filters = search
      ? or(
          ilike(invoices.invoice_number, `%${search}%`),
          ilike(customers.name, `%${search}%`),
          ilike(agents.name, `%${search}%`)
        )
      : undefined;

    const whereClause = filters 
      ? and(eq(invoices.paid, true), filters)
      : eq(invoices.paid, true);

    const data = await db
      .select({
        id: invoices.id,
        bubble_id: invoices.bubble_id,
        invoice_number: invoices.invoice_number,
        total_amount: invoices.total_amount,
        percent_of_total_amount: invoices.percent_of_total_amount,
        full_payment_date: invoices.full_payment_date,
        last_payment_date: invoices.last_payment_date,
        paid: invoices.paid,
        customer_name: customers.name,
        agent_name: agents.name,
        created_at: invoices.created_at,
        updated_at: invoices.updated_at,
      })
      .from(invoices)
      .leftJoin(customers, eq(invoices.linked_customer, customers.customer_id))
      .leftJoin(agents, eq(invoices.linked_agent, agents.bubble_id))
      .where(whereClause)
      .orderBy(desc(invoices.full_payment_date), desc(invoices.updated_at))
      .limit(50);

    return data;
  } catch (error) {
    console.error("Database error in getFullyPaidInvoices:", error);
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

import { generateWithGemini } from "@/lib/ai-router";

export async function analyzePaymentAttachment(attachmentUrl: string) {
  try {
    console.log("Analyzing attachment:", attachmentUrl);
    
    // 1. Fetch the attachment and convert to base64
    const response = await fetch(attachmentUrl);
    if (!response.ok) throw new Error("Failed to fetch attachment");
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Data = buffer.toString('base64');
    const mimeType = response.headers.get('content-type') || 'image/jpeg';

    // 2. Prepare prompt for Gemini
    const prompt = `
      Extract the following details from this payment receipt/bank transfer screenshot:
      1. Total Payment Amount (numeric only, e.g., 1250.00)
      2. Payment Date (in YYYY-MM-DD format)
      
      Respond ONLY with a JSON object like this:
      {
        "amount": "1250.00",
        "date": "2024-05-20"
      }
      If you cannot find the information, return null for that field.
    `;

    // 3. Call AI Router
    const aiResponse = await generateWithGemini(prompt, {
      model: "gemini-3-flash-preview",
      temperature: 0,
      file: {
        mimeType,
        data: base64Data
      }
    });

    console.log("AI Response:", aiResponse);

    // 4. Parse JSON from AI response
    // Sometimes AI wraps response in ```json ... ```
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Failed to parse AI response as JSON");
    
    const extractedData = JSON.parse(jsonMatch[0]);
    return { success: true, data: extractedData };
  } catch (error: any) {
    console.error("AI Analysis Error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Enhanced verifyPayment function that:
 * 1. Inserts payment into verified table
 * 2. Updates submitted payment status
 * 3. Recalculates invoice payment percentage
 * 4. Checks if payment completes full payment
 * 5. Updates invoice.paid and full_payment_date if applicable
 */
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

    // 3. Update status in submitted_payments
    await db
      .update(submitted_payments)
      .set({ status: 'verified', updated_at: new Date(), verified_by: adminId })
      .where(eq(submitted_payments.id, submittedPaymentId));

    // 4. If this payment is linked to an invoice, recalculate payment status
    if (p.linked_invoice) {
      await recalculateInvoicePaymentStatus(p.linked_invoice, adminId);
    }

    revalidatePath("/payments");
    return { success: true };
  } catch (error) {
    console.error("Database error in verifyPayment:", error);
    throw error;
  }
}

/**
 * Recalculate invoice payment percentage and check for full payment
 * @param invoiceBubbleId - The bubble_id of the invoice to recalculate
 * @param triggeredBy - Who triggered this recalculation (for logging)
 */
async function recalculateInvoicePaymentStatus(invoiceBubbleId: string, triggeredBy: string) {
  try {
    // 1. Get the invoice
    const invoice = await db.query.invoices.findFirst({
      where: eq(invoices.bubble_id, invoiceBubbleId)
    });

    if (!invoice) {
      console.warn(`Invoice ${invoiceBubbleId} not found for payment recalculation`);
      return;
    }

    const totalAmount = parseFloat(invoice.total_amount || '0');
    
    // Skip if total_amount is 0 or null
    if (totalAmount <= 0) {
      console.warn(`Invoice ${invoiceBubbleId}: total_amount is ${totalAmount}, skipping recalculation`);
      return;
    }

    // 2. Get all verified payments linked to this invoice
    const linkedPayments = await db
      .select({ amount: payments.amount, payment_date: payments.payment_date })
      .from(payments)
      .where(eq(payments.linked_invoice, invoiceBubbleId));

    // 3. Sum up all payments
    let totalPaid = 0;
    let latestPaymentDate: Date | null = null;
    
    for (const payment of linkedPayments) {
      const amount = parseFloat(payment.amount || '0');
      totalPaid += amount;
      
      if (payment.payment_date) {
        const paymentDate = new Date(payment.payment_date);
        if (!latestPaymentDate || paymentDate > latestPaymentDate) {
          latestPaymentDate = paymentDate;
        }
      }
    }

    // 4. Calculate percentage
    const percentage = (totalPaid / totalAmount) * 100;
    const isFullyPaid = totalPaid >= totalAmount; // Full payment when sum >= total_amount
    
    // 5. Determine full payment date
    // Use the latest payment date if fully paid, otherwise null
    const fullPaymentDate = isFullyPaid && latestPaymentDate ? latestPaymentDate : null;

    // 6. Update invoice with new values
    await db.update(invoices)
      .set({
        percent_of_total_amount: percentage.toString(),
        paid: isFullyPaid,
        full_payment_date: fullPaymentDate,
        last_payment_date: latestPaymentDate,
        updated_at: new Date()
      })
      .where(eq(invoices.bubble_id, invoiceBubbleId));

    console.log(`Invoice ${invoiceBubbleId}: ${percentage.toFixed(2)}% paid (${isFullyPaid ? 'FULLY PAID' : 'PARTIAL'}), triggered by ${triggeredBy}`);

  } catch (error) {
    console.error(`Error recalculating payment status for invoice ${invoiceBubbleId}:`, error);
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