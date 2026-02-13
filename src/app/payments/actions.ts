"use server";

import { db } from "@/lib/db";
import { payments, submitted_payments, agents, customers, invoices, invoice_templates, users, invoice_items, vouchers } from "@/db/schema";
import { ilike, or, desc, eq, and, sql, inArray, isNull, isNotNull, gte, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { syncPaymentsFromBubble } from "@/lib/bubble";
import { calculateEppCost, getEppRate } from "@/lib/epp-rates";

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
        ilike(submitted_payments.payment_method_v2, `%${search}%`),
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
        payment_method_v2: submitted_payments.payment_method_v2,
        status: submitted_payments.status,
        attachment: submitted_payments.attachment,
        remark: submitted_payments.remark,
        agent_name: agents.name,
        customer_name: customers.name,
        created_at: submitted_payments.created_at,
        linked_invoice: submitted_payments.linked_invoice, // This might be numeric or bubble ID
        invoice_bubble_id: invoices.bubble_id, // REAL bubble ID from join
        share_token: invoices.share_token,
        epp_type: submitted_payments.epp_type,
        epp_month: submitted_payments.epp_month,
        issuer_bank: submitted_payments.issuer_bank,
        log: submitted_payments.log,
      })
      .from(submitted_payments)
      .leftJoin(agents, eq(submitted_payments.linked_agent, agents.bubble_id))
      .leftJoin(customers, eq(submitted_payments.linked_customer, customers.customer_id))
      .leftJoin(invoices, sql`${submitted_payments.linked_invoice} = ${invoices.bubble_id} OR ${submitted_payments.linked_invoice} = CAST(${invoices.invoice_id} AS TEXT)`)
      .where(whereClause)
      .orderBy(desc(submitted_payments.created_at))
      .limit(5000);

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
        ilike(payments.payment_method_v2, `%${search}%`),
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
      .limit(5000);

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
      ? and(
        or(
          eq(invoices.paid, true),
          sql`cast(${invoices.percent_of_total_amount} as numeric) >= 99.9`
        ),
        filters
      )
      : or(
        eq(invoices.paid, true),
        sql`cast(${invoices.percent_of_total_amount} as numeric) >= 99.9`
      );

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
        eligible_amount_description: invoices.eligible_amount_description,
        amount_eligible_for_comm: invoices.amount_eligible_for_comm,
      })
      .from(invoices)
      .leftJoin(customers, eq(invoices.linked_customer, customers.customer_id))
      .leftJoin(agents, eq(invoices.linked_agent, agents.bubble_id))
      .where(whereClause)
      .orderBy(desc(invoices.full_payment_date), desc(invoices.updated_at))
      .limit(5000);

    return data;
  } catch (error) {
    console.error("Database error in getFullyPaidInvoices:", error);
    throw error;
  }
}

/**
 * Get fully paid invoices grouped by agent for a specific month/year
 */
export async function getFullyPaidInvoicesByAgent(month: number, year: number, search?: string) {
  try {
    // Create date range for the selected month/year
    const startDate = new Date(year, month - 1, 1); // First day of month
    const endDate = new Date(year, month, 0, 23, 59, 59, 999); // Last day of month

    const filters = search
      ? or(
        ilike(agents.name, `%${search}%`),
        ilike(customers.name, `%${search}%`)
      )
      : undefined;

    // Get all fully paid invoices in the date range
    const invoiceData = await db
      .select({
        id: invoices.id,
        bubble_id: invoices.bubble_id,
        invoice_number: invoices.invoice_number,
        total_amount: invoices.total_amount,
        full_payment_date: invoices.full_payment_date,
        agent_name: agents.name,
        customer_name: customers.name,
        eligible_amount_description: invoices.eligible_amount_description,
        amount_eligible_for_comm: invoices.amount_eligible_for_comm,
        linked_payment: invoices.linked_payment,
      })
      .from(invoices)
      .leftJoin(agents, eq(invoices.linked_agent, agents.bubble_id))
      .leftJoin(customers, eq(invoices.linked_customer, customers.customer_id))
      .where(and(
        eq(invoices.paid, true),
        isNotNull(invoices.full_payment_date), // Ensure full_payment_date is not null
        gte(invoices.full_payment_date, startDate),
        lte(invoices.full_payment_date, endDate),
        filters || undefined
      ));

    // 2. Extract all Payment Bubble IDs to fetch their dates
    const allPaymentIds: string[] = [];
    invoiceData.forEach(inv => {
      if (inv.linked_payment && Array.isArray(inv.linked_payment)) {
        allPaymentIds.push(...inv.linked_payment);
      }
    });

    // 3. Fetch Payment Dates if we have any linked payments
    const paymentDatesMap = new Map<string, Date>();
    if (allPaymentIds.length > 0) {
      // Chunking if too many IDs (optional, but safer)
      const uniqueIds = Array.from(new Set(allPaymentIds));
      const paymentRecords = await db
        .select({
          bubble_id: payments.bubble_id,
          date: payments.payment_date,
          created_at: payments.created_at // fallback
        })
        .from(payments)
        .where(inArray(payments.bubble_id, uniqueIds));

      paymentRecords.forEach(p => {
        const date = p.date ? new Date(p.date) : new Date(p.created_at || '');
        if (!isNaN(date.getTime())) {
          paymentDatesMap.set(p.bubble_id, date);
        }
      });
    }

    // 4. Group by agent and process data
    const agentGroups: Record<string, any> = {};

    for (const invoice of invoiceData) {
      const agentName = invoice.agent_name || 'Unknown Agent';

      if (!agentGroups[agentName]) {
        agentGroups[agentName] = {
          agent_name: agentName,
          invoice_count: 0,
          invoices: [],
          total_amount: 0,
          total_eligible_amount: 0
        };
      }

      // Calculate First Payment Date
      let firstPaymentDate: Date | null = null;
      if (invoice.linked_payment && Array.isArray(invoice.linked_payment)) {
        invoice.linked_payment.forEach((pid: string) => {
          const pDate = paymentDatesMap.get(pid);
          if (pDate) {
            if (!firstPaymentDate || pDate < firstPaymentDate) {
              firstPaymentDate = pDate;
            }
          }
        });
      }

      const invWithFirstPayment = {
        ...invoice,
        first_payment_date: firstPaymentDate
      };

      agentGroups[agentName].invoice_count++;
      agentGroups[agentName].invoices.push(invWithFirstPayment);
      agentGroups[agentName].total_amount += parseFloat(invoice.total_amount || '0');
      agentGroups[agentName].total_eligible_amount += parseFloat(invoice.amount_eligible_for_comm || '0');
    }

    // Convert to array and sort by invoice count (descending)
    const result = Object.values(agentGroups)
      .sort((a: any, b: any) => b.invoice_count - a.invoice_count);

    return result;
  } catch (error) {
    console.error("Database error in getFullyPaidInvoicesByAgent:", error);
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

/**
 * Fetch attachment from URL and convert to base64
 * Handles both S3 bucket (protocol-relative) and Railway storage URLs
 *
 * @param rawUrl - The attachment URL (can be protocol-relative, absolute, or empty)
 * @returns Object with base64 data and mimeType, or throws error
 */
async function fetchAttachmentForAI(rawUrl: string): Promise<{ data: string; mimeType: string }> {
  // 1. Validate URL
  if (!rawUrl || typeof rawUrl !== 'string' || rawUrl.trim() === '') {
    throw new Error("Empty or invalid attachment URL");
  }

  // 2. Normalize URL
  let attachmentUrl = rawUrl.trim();

  // Handle protocol-relative URLs (S3/Bubble: //s3.amazonaws.com/..., //cdn.bubble.io/...)
  if (attachmentUrl.startsWith('//')) {
    attachmentUrl = 'https:' + attachmentUrl;
  }

  // Handle relative paths (Railway storage: /api/files/payments/...)
  // Convert to absolute URL using FILE_BASE_URL
  if (attachmentUrl.startsWith('/api/files/') || attachmentUrl.startsWith('/storage/')) {
    const FILE_BASE_URL = process.env.FILE_BASE_URL || 'https://admin.atap.solar';
    attachmentUrl = FILE_BASE_URL + attachmentUrl;
  }

  console.log("Fetching attachment for AI:", attachmentUrl);

  // 3. Fetch the attachment
  const response = await fetch(attachmentUrl, {
    // Add timeout to prevent hanging
    signal: AbortSignal.timeout(30000), // 30 second timeout
    // Follow redirects (important for S3 signed URLs)
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch attachment: HTTP ${response.status} ${response.statusText}`);
  }

  // 4. Convert to base64
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64Data = buffer.toString('base64');

  // 5. Detect mimeType
  const contentType = response.headers.get('content-type');
  const mimeType = contentType || 'image/jpeg'; // Default to jpeg if not detected

  console.log("Attachment fetched successfully:", {
    url: attachmentUrl.substring(0, 60) + '...',
    size: buffer.length,
    mimeType
  });

  return { data: base64Data, mimeType };
}

export async function analyzePaymentAttachment(rawUrl: string) {
  try {
    // 1. Fetch the attachment and convert to base64 (handles both S3 and Railway)
    const { data: base64Data, mimeType } = await fetchAttachmentForAI(rawUrl);

    // 2. Prepare prompt for Gemini
    const prompt = `
      Extract the following details from this payment receipt/bank transfer screenshot:
      1. Total Payment Amount (numeric only, e.g., 1250.00)
      2. Payment Date (in YYYY-MM-DD format)
      3. Check if this is an EPP (Easy Payment Plan / Installment) transaction.
         Indicators of EPP: "TENURE", "MONTHLY REPAYMENT", "INSTALLMENT", interest rate fields, or multiple months mentioned.
         If EPP is detected:
         - is_epp: true
         - bank: The issuing bank name. Map to one of these exact values: "MBB" (Maybank), "PBB" (Public Bank), "HLB" (Hong Leong Bank), "CIMB", "AM Bank" (AmBank), "UOB", "OCBC". Use the closest match.
         - tenure: The number of months (numeric only, e.g., 36)
         If NOT an EPP transaction, set is_epp to false.

      Respond ONLY with a JSON object like this:
      {
        "amount": "1250.00",
        "date": "2024-05-20",
        "is_epp": true,
        "bank": "PBB",
        "tenure": "36"
      }
      If you cannot find the information, return null for that field. For is_epp, default to false if unsure.
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

    // 4. If this payment is linked to an invoice, link it and recalculate
    if (p.linked_invoice && p.bubble_id) {
      // 4a. Add to invoice's linked_payment array
      await linkPaymentToInvoice(p.linked_invoice, p.bubble_id);

      // 4b. Recalculate status
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

/**
 * Link a payment to an invoice's linked_payment array
 */
async function linkPaymentToInvoice(invoiceBubbleId: string, paymentBubbleId: string) {
  try {
    const invoice = await db.query.invoices.findFirst({
      where: eq(invoices.bubble_id, invoiceBubbleId)
    });

    if (!invoice) return;

    const currentLinks = invoice.linked_payment || [];

    // Check if already linked
    if (!currentLinks.includes(paymentBubbleId)) {
      const newLinks = [...currentLinks, paymentBubbleId];

      await db.update(invoices)
        .set({ linked_payment: newLinks, updated_at: new Date() })
        .where(eq(invoices.bubble_id, invoiceBubbleId));

      console.log(`Linked payment ${paymentBubbleId} to invoice ${invoiceBubbleId}`);
    }
  } catch (error) {
    console.error(`Error linking payment ${paymentBubbleId} to invoice ${invoiceBubbleId}:`, error);
  }
}

// ============================================================================
// NEW ACTIONS FOR PAYMENT MANAGEMENT
// ============================================================================

interface UpdatePaymentParams {
  amount?: string;
  payment_method?: string;
  payment_date?: Date;
  epp_type?: string | null;
  epp_month?: string | null;
  issuer_bank?: string | null;
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
    if ('epp_type' in updates && (updates.epp_type ?? null) !== (current.epp_type ?? null)) {
      changes.push(`[${dateStr}] ${user} changed EPP Type from ${current.epp_type || 'None'} to ${updates.epp_type || 'None'}`);
    }
    if ('issuer_bank' in updates && (updates.issuer_bank ?? null) !== (current.issuer_bank ?? null)) {
      changes.push(`[${dateStr}] ${user} changed Issuer Bank from ${current.issuer_bank || 'None'} to ${updates.issuer_bank || 'None'}`);
    }
    if ('epp_month' in updates && (updates.epp_month ?? null) !== (current.epp_month ?? null)) {
      changes.push(`[${dateStr}] ${user} changed EPP Month from ${current.epp_month || 'None'} to ${updates.epp_month || 'None'}`);
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
    if ('epp_type' in updates && (updates.epp_type ?? null) !== (current.epp_type ?? null)) {
      changes.push(`[${dateStr}] ${user} changed EPP Type from ${current.epp_type || 'None'} to ${updates.epp_type || 'None'}`);
    }
    if ('issuer_bank' in updates && (updates.issuer_bank ?? null) !== (current.issuer_bank ?? null)) {
      changes.push(`[${dateStr}] ${user} changed Issuer Bank from ${current.issuer_bank || 'None'} to ${updates.issuer_bank || 'None'}`);
    }
    if ('epp_month' in updates && (updates.epp_month ?? null) !== (current.epp_month ?? null)) {
      changes.push(`[${dateStr}] ${user} changed EPP Month from ${current.epp_month || 'None'} to ${updates.epp_month || 'None'}`);
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

/**
 * Rescans all paid invoices that are missing a full_payment_date
 * and populates it based on the latest payment date.
 */
export async function getEppPayments(search?: string) {
  try {
    // Get only EPP payments (filtered by epp_type = 'EPP')
    const eppFilter = eq(payments.epp_type, 'EPP');

    const searchFilter = search
      ? or(
        ilike(payments.remark, `%${search}%`),
        ilike(payments.issuer_bank, `%${search}%`),
        ilike(agents.name, `%${search}%`),
        ilike(customers.name, `%${search}%`)
      )
      : undefined;
    const whereClause = searchFilter ? and(eppFilter, searchFilter) : eppFilter;

    const data = await db
      .select({
        id: payments.id,
        bubble_id: payments.bubble_id,
        amount: payments.amount,
        payment_date: payments.payment_date,
        attachment: payments.attachment,
        agent_name: agents.name,
        customer_name: customers.name,
        issuer_bank: payments.issuer_bank,
        epp_month: payments.epp_month,
        epp_type: payments.epp_type,
        epp_cost: payments.epp_cost,
        payment_method: payments.payment_method,
        remark: payments.remark,
        log: payments.log,
      })
      .from(payments)
      .leftJoin(agents, eq(payments.linked_agent, agents.bubble_id))
      .leftJoin(customers, eq(payments.linked_customer, customers.customer_id))
      .where(whereClause)
      .orderBy(desc(payments.payment_date))
      .limit(5000);

    // Calculate EPP cost for any that are missing it
    const updatedData = await Promise.all(data.map(async (payment) => {
      if (payment.epp_type === 'EPP' && (!payment.epp_cost || Number(payment.epp_cost) === 0)) {
        const tenure = payment.epp_month ? parseInt(payment.epp_month) : null;
        const amount = payment.amount ? parseFloat(payment.amount) : null;
        const bank = payment.issuer_bank;

        if (amount && tenure && bank) {
          const rate = await getEppRateFromDb(bank, tenure);
          if (rate !== null) {
            const eppCost = calculateEppCost(amount, rate);
            await db.update(payments)
              .set({ epp_cost: eppCost.toString() })
              .where(eq(payments.id, payment.id));
          }
        }
      }
      return payment;
    }));

    return updatedData;
  } catch (error) {
    console.error("Database error in getEppPayments:", error);
    throw error;
  }
}

/**
 * Get EPP rate from database (fallback to config if needed)
 */
async function getEppRateFromDb(bank: string, tenure: number): Promise<number | null> {
  // First try to get from database
  // For now, use the config function
  return getEppRate(bank, tenure);
}

export async function getPaymentsWithoutMethod(search?: string) {
  try {
    const searchFilters = search
      ? or(
        ilike(payments.remark, `%${search}%`),
        ilike(agents.name, `%${search}%`),
        ilike(customers.name, `%${search}%`)
      )
      : undefined;

    const whereClause = searchFilters
      ? and(
        and(
          or(isNull(payments.payment_method), eq(payments.payment_method, '')),
          or(isNull(payments.payment_method_v2), eq(payments.payment_method_v2, ''))
        ),
        searchFilters
      )
      : and(
        or(isNull(payments.payment_method), eq(payments.payment_method, '')),
        or(isNull(payments.payment_method_v2), eq(payments.payment_method_v2, ''))
      );

    const data = await db
      .select({
        id: payments.id,
        bubble_id: payments.bubble_id,
        amount: payments.amount,
        payment_date: payments.payment_date,
        attachment: payments.attachment,
        agent_name: agents.name,
        customer_name: customers.name,
        issuer_bank: payments.issuer_bank,
        epp_type: payments.epp_type,
        epp_month: payments.epp_month,
        remark: payments.remark,
        payment_method: payments.payment_method,
        payment_method_v2: payments.payment_method_v2,
        log: payments.log,
      })
      .from(payments)
      .leftJoin(agents, eq(payments.linked_agent, agents.bubble_id))
      .leftJoin(customers, eq(payments.linked_customer, customers.customer_id))
      .where(whereClause)
      .orderBy(desc(payments.payment_date))
      .limit(5000);

    return data;
  } catch (error) {
    console.error("Database error in getPaymentsWithoutMethod:", error);
    throw error;
  }
}

export async function bulkAIUpdatePaymentMethod(paymentIds: number[]) {
  const results: {
    id: number;
    success: boolean;
    payment_method?: string;
    is_epp?: boolean;
    bank?: string | null;
    tenure?: string | null;
    error?: string;
  }[] = [];

  for (const id of paymentIds) {
    try {
      // 1. Fetch the payment
      const payment = await db.query.payments.findFirst({
        where: eq(payments.id, id),
      });
      if (!payment) {
        results.push({ id, success: false, error: "Payment not found" });
        continue;
      }
      if (!payment.attachment || payment.attachment.length === 0) {
        results.push({ id, success: false, error: "No attachment" });
        continue;
      }

      // 2. Fetch attachment and convert to base64 (handles both S3 and Railway)
      const { data: base64Data, mimeType } = await fetchAttachmentForAI(payment.attachment[0]);

      // 3. Call Gemini with enhanced payment method detection prompt
      const prompt = `
You are analyzing a payment receipt/bank transfer screenshot to determine the PAYMENT METHOD.

**Classification rules — pick ONE:**
| Keywords on receipt | payment_method |
|---|---|
| "Fund Transfer", "Giro", "Cash Deposit", "DuitNow", "IBG", "Instant Transfer", "Online Banking", "RENTAS" | "Online Transfer" |
| "EMV SALE", "VISA", "MASTERCARD", "Credit Card", card number starting with 4xxx or 5xxx | "Credit Card" |
| "E-Wallet", "GrabPay", "Touch n Go", "TnG", "Boost", "ShopeePay" | "E-Wallet" |
| "Cheque", "Check", cheque number | "Cheque" |
| No digital indicators, "Cash" | "Cash" |

**EPP detection (layered on top of Credit Card):**
If any of TENURE / MONTHLY REPAYMENT / INSTALLMENT fields are present → is_epp: true.
When EPP is detected:
- payment_method stays "Credit Card"
- bank: Map to one of these exact values: "MBB" (Maybank), "PBB" (Public Bank), "HLB" (Hong Leong Bank), "CIMB", "AM Bank" (AmBank), "UOB", "OCBC". Use the closest match.
- tenure: The number of months (numeric only, e.g., 36)

**Also extract:**
- amount: Total payment amount (numeric, e.g. "1115.00")
- date: Payment date in YYYY-MM-DD format

Respond ONLY with a JSON object:
{
  "amount": "1115.00",
  "date": "2026-01-01",
  "payment_method": "Online Transfer",
  "is_epp": false,
  "bank": null,
  "tenure": null
}
If you cannot determine the payment method, set payment_method to null.
For is_epp, default to false if unsure.
`;

      const aiResponse = await generateWithGemini(prompt, {
        model: "gemini-3-flash-preview",
        temperature: 0,
        file: { mimeType, data: base64Data },
      });

      // 4. Parse response
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        results.push({ id, success: false, error: "Failed to parse AI response" });
        continue;
      }
      const parsed = JSON.parse(jsonMatch[0]);

      if (!parsed.payment_method) {
        results.push({ id, success: false, error: "AI could not determine method" });
        continue;
      }

      // 5. Build update object
      const updateObj: Record<string, any> = {
        payment_method: parsed.payment_method,
        updated_at: new Date(),
      };
      if (parsed.is_epp && parsed.bank) {
        updateObj.epp_type = "EPP";
        updateObj.issuer_bank = parsed.bank;
        if (parsed.tenure) updateObj.epp_month = String(parsed.tenure);
      }

      // 6. Build log entry
      const dateStr = new Date().toISOString();
      const logParts = [`[${dateStr}] AI Bulk Scan: Set method to "${parsed.payment_method}"`];
      if (parsed.is_epp) {
        logParts.push(`EPP detected: ${parsed.bank || "?"} / ${parsed.tenure || "?"} months`);
      }
      const logEntry = logParts.join(", ");
      updateObj.log = (payment.log ? payment.log + "\n" : "") + logEntry;

      // 7. Write to DB
      await db.update(payments).set(updateObj).where(eq(payments.id, id));

      results.push({
        id,
        success: true,
        payment_method: parsed.payment_method,
        is_epp: parsed.is_epp || false,
        bank: parsed.bank || null,
        tenure: parsed.tenure || null,
      });
    } catch (error: any) {
      results.push({ id, success: false, error: error.message || "Unknown error" });
    }
  }

  revalidatePath("/payments");
  return results;
}

export async function rescanFullPaymentDates() {
  try {
    // 1. Find all paid invoices where full_payment_date is null
    const paidInvoices = await db
      .select({
        id: invoices.id,
        bubble_id: invoices.bubble_id,
        total_amount: invoices.total_amount,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.paid, true),
          isNull(invoices.full_payment_date)
        )
      );

    console.log(`Rescanning ${paidInvoices.length} paid invoices for missing full_payment_date...`);
    let updatedCount = 0;

    for (const inv of paidInvoices) {
      if (!inv.bubble_id) continue;

      // 2. Find all verified payments for this invoice
      const vPayments = await db
        .select({
          payment_date: payments.payment_date,
          amount: payments.amount,
        })
        .from(payments)
        .where(eq(payments.linked_invoice, inv.bubble_id));

      if (vPayments.length === 0) continue;

      // 3. Find latest payment date
      let latestDate: Date | null = null;
      let totalPaid = 0;

      for (const p of vPayments) {
        totalPaid += parseFloat(p.amount || "0");
        if (p.payment_date) {
          const d = new Date(p.payment_date);
          if (!latestDate || d > latestDate) {
            latestDate = d;
          }
        }
      }

      // 4. Update if we found a date
      if (latestDate) {
        await db.update(invoices)
          .set({
            full_payment_date: latestDate,
            last_payment_date: latestDate,
            updated_at: new Date()
          })
          .where(eq(invoices.id, inv.id));
        updatedCount++;
      }
    }

    revalidatePath("/payments");
    return { success: true, count: updatedCount };
  } catch (error) {
    console.error("Scan error:", error);
    throw error;
  }
}

/**
 * Run Commission Calculation for Fully Paid Invoices
 * Processes in batches of 50 to avoid timeout.
 */
export async function runCommissionCalculation() {
  try {
    // 1. Fetch random 50 fully paid invoices that might need processing
    // Prioritize those with empty description, but also include some others to ensure updates
    // For simplicity in this action, we'll just grab 50 fully paid invoices where description is null OR order by updated_at ASC

    // 1. Fetch ALL fully paid invoices to process
    // Prioritize oldest updated_at to ensure consistent updates across all records
    const invoicesToProcess = await db.select({
      id: invoices.id,
      bubble_id: invoices.bubble_id,
      invoice_number: invoices.invoice_number,
      total_amount: invoices.total_amount,
      amount: invoices.amount,
      linked_payment: invoices.linked_payment,
      linked_invoice_item: invoices.linked_invoice_item
    })
      .from(invoices)
      .where(
        or(
          eq(invoices.status, 'FULLY PAID'),
          sql`CAST(${invoices.percent_of_total_amount} AS NUMERIC) >= 99.9`
        )
      )
      .orderBy(invoices.updated_at);

    if (invoicesToProcess.length === 0) {
      return { success: true, count: 0, message: "No fully paid invoices found." };
    }

    let processedCount = 0;

    for (const inv of invoicesToProcess) {
      if (!inv.bubble_id) continue;

      // 1. Get Payments
      let totalReceived = 0;
      let totalEppCost = 0;
      const paymentListLines: string[] = [];

      if (inv.linked_payment && inv.linked_payment.length > 0) {
        // Filter out nulls
        const validPaymentIds = inv.linked_payment.filter(id => id !== null) as string[];

        if (validPaymentIds.length > 0) {
          const linkedPayments = await db.select().from(payments)
            .where(inArray(payments.bubble_id, validPaymentIds));

          for (const pay of linkedPayments) {
            const amount = parseFloat(pay.amount || '0');
            totalReceived += amount;

            const eppCost = parseFloat(pay.epp_cost || '0');
            totalEppCost += eppCost;

            const dateStr = pay.payment_date ? new Date(pay.payment_date).toISOString().split('T')[0] : '-';
            const bank = pay.issuer_bank || 'Unknown Bank';
            const tenure = pay.epp_month ? `${pay.epp_month}mos` : '';
            const bankInfo = `${bank} ${tenure}`.trim();

            paymentListLines.push(
              `RM ${amount.toFixed(2)} | ${dateStr} | ${pay.payment_method || '-'} | ${bankInfo.replace('Unknown Bank', '')} | RM ${eppCost.toFixed(2)}`
            );
          }
        }
      }

      // 2. Get Vouchers
      let totalVoucherCost = 0;
      const voucherListLines: string[] = [];

      if (inv.linked_invoice_item && inv.linked_invoice_item.length > 0) {
        const validItemIds = inv.linked_invoice_item.filter(id => id !== null) as string[];

        if (validItemIds.length > 0) {
          const linkedItems = await db.select().from(invoice_items)
            .where(inArray(invoice_items.bubble_id, validItemIds));

          for (const item of linkedItems) {
            if (item.linked_voucher) {
              const voucher = await db.select().from(vouchers)
                .where(eq(vouchers.bubble_id, item.linked_voucher))
                .limit(1);

              if (voucher.length > 0) {
                const v = voucher[0];
                const deductable = v.deductable_from_commission || 0;
                totalVoucherCost += deductable;

                voucherListLines.push(`${v.title} (Comm. Deduct: RM ${deductable})`);
              }
            }
          }
        }
      }

      // 3. Calculations
      const invoiceTotal = parseFloat(inv.total_amount || inv.amount || '0');
      let percentStr = "0.00%";
      if (invoiceTotal > 0) {
        const percent = (totalReceived / invoiceTotal) * 100;
        percentStr = percent.toFixed(2) + "%";
      }

      const amountEligible = invoiceTotal - (totalEppCost + totalVoucherCost);

      // 4. Construct Description
      const description = `List Of Payment
${paymentListLines.length > 0 ? paymentListLines.map((l, i) => `${i + 1}. ${l}`).join('\n') : 'No payments found'}

List Of Voucher in this Invoice :
${voucherListLines.length > 0 ? voucherListLines.map((l, i) => `${i + 1}. ${l}`).join('\n') : 'No vouchers found'}

Invoice Final Amount : RM ${invoiceTotal.toFixed(2)}
Total Received : RM ${totalReceived.toFixed(2)}
Percent of Total Payment : ${percentStr}

EPP INTEREST TOTAL : RM ${totalEppCost.toFixed(2)}
VOUCHER COST TOTAL : RM ${totalVoucherCost.toFixed(2)}

Invoice.amount_eligible_for_comm = RM ${amountEligible.toFixed(2)}`;

      // 5. Update Invoice
      await db.update(invoices)
        .set({
          eligible_amount_description: description,
          amount_eligible_for_comm: amountEligible.toFixed(2),
          updated_at: new Date()
        })
        .where(eq(invoices.id, inv.id));

      processedCount++;
    }

    revalidatePath("/payments");
    return { success: true, count: processedCount, message: `Processed ${processedCount} invoices` };

  } catch (error) {
    console.error("Commission Calculation Action Error:", error);
    return { success: false, error: String(error) };
  }
}