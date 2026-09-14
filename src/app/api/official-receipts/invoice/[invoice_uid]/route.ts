import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { invoices, payments } from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ invoice_uid: string }>;
}

/**
 * Lists the public OR URLs for an invoice. An invoice can have more than one
 * verified payment, so this route deliberately returns one URL per payment
 * rather than silently choosing one instalment receipt.
 *
 * GET /api/official-receipts/invoice/{invoice-bubble-id}
 */
export async function GET(request: Request, { params }: RouteContext) {
  const { invoice_uid: invoiceUid } = await params;

  if (!invoiceUid) {
    return NextResponse.json({ error: "Invoice UID is required" }, { status: 400 });
  }

  try {
    const [invoice] = await db
      .select({ bubble_id: invoices.bubble_id, invoice_number: invoices.invoice_number })
      .from(invoices)
      .where(eq(invoices.bubble_id, invoiceUid))
      .limit(1);

    if (!invoice?.bubble_id) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    // `payment` is the verified-payment table. Pending submissions live in
    // `submitted_payment`, so they can never be returned as official receipts.
    const verifiedPayments = await db
      .select({
        payment_uid: payments.bubble_id,
        payment_date: payments.payment_date,
        amount: payments.amount,
      })
      .from(payments)
      .where(eq(payments.linked_invoice, invoice.bubble_id))
      .orderBy(asc(payments.payment_date), asc(payments.created_at));

    const origin = new URL(request.url).origin;
    const receipts = verifiedPayments
      .filter((payment) => Boolean(payment.payment_uid))
      .map((payment, index) => ({
        sequence: index + 1,
        payment_uid: payment.payment_uid,
        payment_date: payment.payment_date,
        amount: payment.amount,
        receipt_url: `${origin}/api/official-receipts/${encodeURIComponent(payment.payment_uid!)}`,
      }));

    return NextResponse.json({
      invoice_uid: invoice.bubble_id,
      invoice_number: invoice.invoice_number,
      receipts,
    });
  } catch (error) {
    console.error("Public official receipt list failed:", error);
    return NextResponse.json({ error: "Failed to retrieve official receipts" }, { status: 500 });
  }
}
