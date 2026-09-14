import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { customers, invoices, payments } from "@/db/schema";
import { generateGenericPdf } from "@/lib/pdf-generator";
import { numberToWords } from "@/lib/number-to-words";
import { getReceiptHtml } from "@/lib/receipt-template";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ payment_uid: string }>;
}

/**
 * Public official-receipt URL. A receipt belongs to one verified payment, not
 * an invoice: an invoice can have several instalment payments and therefore
 * several official receipts.
 *
 * GET /api/official-receipts/{payment-bubble-id}
 */
export async function GET(_: Request, { params }: RouteContext) {
  const { payment_uid: paymentUid } = await params;

  if (!paymentUid) {
    return NextResponse.json({ error: "Payment UID is required" }, { status: 400 });
  }

  try {
    // The payment table contains verified payments only; submitted payments
    // remain in submitted_payment until verification succeeds.
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.bubble_id, paymentUid))
      .limit(1);

    if (!payment) {
      return NextResponse.json({ error: "Official receipt not found" }, { status: 404 });
    }

    if (!payment.linked_customer) {
      return NextResponse.json({ error: "Receipt customer is missing" }, { status: 404 });
    }

    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.customer_id, payment.linked_customer))
      .limit(1);

    if (!customer) {
      return NextResponse.json({ error: "Receipt customer is missing" }, { status: 404 });
    }

    let invoiceRef = "";
    if (payment.linked_invoice) {
      const [invoice] = await db
        .select({ invoice_number: invoices.invoice_number })
        .from(invoices)
        .where(eq(invoices.bubble_id, payment.linked_invoice))
        .limit(1);
      invoiceRef = invoice?.invoice_number || "";
    }

    let paymentSeq = 1;
    if (payment.linked_invoice) {
      const invoicePayments = await db
        .select({ id: payments.id, bubble_id: payments.bubble_id })
        .from(payments)
        .where(eq(payments.linked_invoice, payment.linked_invoice))
        .orderBy(payments.payment_date, payments.created_at);
      const index = invoicePayments.findIndex((item) => item.id === payment.id);
      if (index >= 0) paymentSeq = index + 1;
    }

    const amount = typeof payment.amount === "string"
      ? Number.parseFloat(payment.amount)
      : Number(payment.amount || 0);
    const safeAmount = Number.isFinite(amount) ? amount : 0;
    const voucherNo = invoiceRef
      ? `${invoiceRef}-PAY${String(paymentSeq).padStart(2, "0")}`
      : `OR-${paymentUid.substring(0, 7).toUpperCase()}-PAY${String(paymentSeq).padStart(2, "0")}`;

    const receiptHtml = getReceiptHtml({
      customerName: customer.name || "",
      customerAddress: customer.address || "",
      voucherNo,
      receiptDate: new Date(payment.payment_date || payment.created_at || new Date()).toLocaleDateString("en-GB"),
      amountInWords: numberToWords(safeAmount),
      paymentMethod: payment.payment_method || payment.payment_method_v2 || "",
      chequeNo: payment.remark || "",
      paymentAmount: safeAmount.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      invoiceRef,
      description: `PAYMENT FOR - ${invoiceRef || "INVOICE"}`,
    });

    const pdfId = await generateGenericPdf(receiptHtml);
    const pdfResponse = await fetch(
      `https://pdf-gen-production-6c81.up.railway.app/api/download/${encodeURIComponent(pdfId)}`,
      { cache: "no-store" },
    );

    if (!pdfResponse.ok || !pdfResponse.body) {
      throw new Error(`Generated receipt PDF could not be retrieved (${pdfResponse.status})`);
    }

    const fileBase = (invoiceRef || paymentUid.substring(0, 7)).replace(/[^a-zA-Z0-9_-]/g, "_");
    return new Response(pdfResponse.body, {
      headers: {
        "Content-Type": pdfResponse.headers.get("content-type") || "application/pdf",
        "Content-Disposition": `inline; filename="Official_Receipt_${fileBase}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Public official receipt generation failed:", error);
    return NextResponse.json({ error: "Failed to generate official receipt" }, { status: 500 });
  }
}
