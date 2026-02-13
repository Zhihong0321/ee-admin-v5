
const { Pool } = require('pg');

async function main() {
  const connectionString = "postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway";
  const pool = new Pool({ connectionString });
  
  const invoiceId = 1008534;
  console.log(`🔍 Recalculating for invoice ID: ${invoiceId}`);

  try {
    const invRes = await pool.query('SELECT id, bubble_id, total_amount, linked_payment FROM invoice WHERE invoice_id = $1', [invoiceId]);
    if (invRes.rows.length === 0) {
      console.error("❌ Invoice not found");
      return;
    }

    const invoice = invRes.rows[0];
    const totalAmount = parseFloat(invoice.total_amount || '0');
    if (totalAmount <= 0) {
      console.error("❌ Total amount is 0 or null");
      return;
    }

    const linkedPayments = invoice.linked_payment || [];
    console.log(`Found ${linkedPayments.length} linked payments: ${linkedPayments.join(', ')}`);

    let totalPaid = 0;
    for (const paymentBubbleId of linkedPayments) {
      const payRes = await pool.query('SELECT amount FROM payment WHERE bubble_id = $1', [paymentBubbleId]);
      if (payRes.rows.length > 0 && payRes.rows[0].amount) {
        const amt = parseFloat(payRes.rows[0].amount);
        totalPaid += amt;
        console.log(`  - Payment ${paymentBubbleId}: ${amt}`);
      } else {
        console.warn(`  - Payment ${paymentBubbleId} not found or has no amount`);
      }
    }

    const percentage = (totalPaid / totalAmount) * 100;
    console.log(`📊 Total Paid: ${totalPaid} / ${totalAmount} = ${percentage}%`);

    console.log(`Updating database...`);
    await pool.query('UPDATE invoice SET percent_of_total_amount = $1, updated_at = NOW() WHERE id = $2', [percentage.toString(), invoice.id]);

    console.log(`✅ Done!`);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();
