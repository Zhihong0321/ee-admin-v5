"use server";

import { db } from "@/lib/db";
import { payments, submitted_payments, agents, customers } from "@/db/schema";
import { ilike, or, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

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
        customer_name: customers.name,
        created_at: submitted_payments.created_at,
      })
      .from(submitted_payments)
      .leftJoin(agents, eq(submitted_payments.linked_agent, agents.bubble_id))
      .leftJoin(customers, eq(submitted_payments.linked_customer, customers.customer_id))
      .where(filters)
      .orderBy(desc(submitted_payments.created_at))
      .limit(50);

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
        attachment: payments.attachment,
        remark: payments.remark,
        agent_name: agents.name,
        customer_name: customers.name,
        created_at: payments.created_at,
      })
      .from(payments)
      .leftJoin(agents, eq(payments.linked_agent, agents.bubble_id))
      .leftJoin(customers, eq(payments.linked_customer, customers.customer_id))
      .where(filters)
      .orderBy(desc(payments.created_at))
      .limit(50);

    return data;
  } catch (error) {
    console.error("Database error in getVerifiedPayments:", error);
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
