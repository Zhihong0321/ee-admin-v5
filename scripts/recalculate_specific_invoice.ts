
import { db } from "../src/lib/db";
import { invoices, payments } from "../src/db/schema";
import { eq, sql } from "drizzle-orm";

async function main() {
  const invoiceId = 1008534;
  console.log(`🔍 Recalculating for invoice ID: ${invoiceId}`);

  const [invoice] = await db.select({
    id: invoices.id,
    bubble_id: invoices.bubble_id,
    total_amount: invoices.total_amount,
    linked_payment: invoices.linked_payment
  })
  .from(invoices)
  .where(eq(invoices.invoice_id, invoiceId));

  if (!invoice) {
    console.error("❌ Invoice not found");
    return;
  }

  const totalAmount = parseFloat(invoice.total_amount || '0');
  if (totalAmount <= 0) {
    console.error("❌ Total amount is 0 or null");
    return;
  }

  let totalPaid = 0;
  const linkedPayments = invoice.linked_payment || [];
  console.log(`Found ${linkedPayments.length} linked payments: ${linkedPayments.join(', ')}`);

  for (const paymentBubbleId of linkedPayments) {
    const payment = await db.query.payments.findFirst({
      where: eq(payments.bubble_id, paymentBubbleId)
    });

    if (payment && payment.amount) {
      const amt = parseFloat(payment.amount);
      totalPaid += amt;
      console.log(`  - Payment ${paymentBubbleId}: ${amt}`);
    } else {
      console.warn(`  - Payment ${paymentBubbleId} not found or has no amount`);
    }
  }

  const percentage = (totalPaid / totalAmount) * 100;
  console.log(`📊 Total Paid: ${totalPaid} / ${totalAmount} = ${percentage}%`);

  console.log(`Updating database...`);
  await db.update(invoices)
    .set({
      percent_of_total_amount: percentage.toString(),
      updated_at: new Date()
    })
    .where(eq(invoices.id, invoice.id));

  console.log(`✅ Done!`);
  process.exit(0);
}

main().catch(console.error);
