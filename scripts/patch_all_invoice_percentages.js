
const { Pool } = require('pg');

async function main() {
  const connectionString = "postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway";
  const pool = new Pool({ connectionString });
  
  console.log(`🚀 Starting Global Invoice Payment Percentage Patch...`);

  try {
    // 1. Fetch all invoices that have linked payments
    const invRes = await pool.query(`
      SELECT id, bubble_id, invoice_id, total_amount, linked_payment, percent_of_total_amount 
      FROM invoice 
      WHERE linked_payment IS NOT NULL 
      AND array_length(linked_payment, 1) > 0
    `);
    
    console.log(`Found ${invRes.rows.length} invoices with linked payments.`);
    let updatedCount = 0;
    let errorCount = 0;

    for (const invoice of invRes.rows) {
      try {
        const totalAmount = parseFloat(invoice.total_amount || '0');
        if (totalAmount <= 0) continue;

        const linkedPayments = invoice.linked_payment || [];
        let totalPaid = 0;

        // 2. Sum up actual payments from the payment table
        const payRes = await pool.query('SELECT amount FROM payment WHERE bubble_id = ANY($1)', [linkedPayments]);
        
        for (const payment of payRes.rows) {
          if (payment.amount) {
            totalPaid += parseFloat(payment.amount);
          }
        }

        const newPercentage = (totalPaid / totalAmount) * 100;
        const oldPercentage = parseFloat(invoice.percent_of_total_amount || '0');

        // 3. Only update if the difference is significant (to avoid unnecessary writes)
        if (Math.abs(newPercentage - oldPercentage) > 0.001) {
          await pool.query(
            'UPDATE invoice SET percent_of_total_amount = $1, updated_at = NOW() WHERE id = $2', 
            [newPercentage.toString(), invoice.id]
          );
          updatedCount++;
          if (updatedCount % 50 === 0) {
              console.log(`...processed ${updatedCount} updates...`);
          }
        }
      } catch (err) {
        console.error(`❌ Error patching invoice ${invoice.invoice_id}:`, err.message);
        errorCount++;
      }
    }

    console.log(`
✅ Patch Complete!`);
    console.log(`- Total invoices checked: ${invRes.rows.length}`);
    console.log(`- Total invoices updated: ${updatedCount}`);
    console.log(`- Errors encountered: ${errorCount}`);

  } catch (err) {
    console.error("CRITICAL ERROR:", err);
  } finally {
    await pool.end();
  }
}

main();
