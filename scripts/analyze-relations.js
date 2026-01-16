const { Client } = require('pg');

async function analyzeRelationships() {
  const client = new Client({
    connectionString: 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway'
  });

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL\n');

    // Check how invoices link to payments
    console.log('=== INVOICE-PAYMENT RELATIONSHIP ===');
    const invoicePayments = await client.query(`
      SELECT
        i.id,
        i.invoice_number,
        i.total_amount,
        i.linked_payment,
        COALESCE(SUM(p.amount), 0) as total_paid
      FROM invoice i
      LEFT JOIN payment p ON p.bubble_id = ANY(i.linked_payment)
      WHERE i.linked_payment IS NOT NULL
        AND i.total_amount IS NOT NULL
        AND i.total_amount > 0
      GROUP BY i.id, i.invoice_number, i.total_amount, i.linked_payment
      LIMIT 5;
    `);
    console.table(invoicePayments.rows);

    // Check SEDA statuses
    console.log('\n=== SEDA REGISTRATION STATUSES ===');
    const sedaStatuses = await client.query(`
      SELECT reg_status, COUNT(*) as count
      FROM seda_registration
      WHERE reg_status IS NOT NULL
      GROUP BY reg_status
      ORDER BY count DESC;
    `);
    console.table(sedaStatuses.rows);

    // Check how many invoices have linked SEDA
    console.log('\n=== INVOICE-SEDA RELATIONSHIP ===');
    const invoiceSeda = await client.query(`
      SELECT
        COUNT(*) as total_invoices,
        COUNT(linked_seda_registration) as with_seda,
        COUNT(*) - COUNT(linked_seda_registration) as without_seda
      FROM invoice
      WHERE status != 'deleted';
    `);
    console.table(invoiceSeda.rows);

    // Check payment percentage distribution
    console.log('\n=== PAYMENT PERCENTAGE DISTRIBUTION ===');
    const paymentPercents = await client.query(`
      SELECT
        CASE
          WHEN total_paid = 0 THEN '0%'
          WHEN total_paid < total_amount * 0.5 THEN '0-50%'
          WHEN total_paid < total_amount THEN '50-99%'
          ELSE '100%'
        END as payment_range,
        COUNT(*) as invoice_count
      FROM (
        SELECT
          i.id,
          i.total_amount,
          COALESCE(SUM(p.amount), 0) as total_paid
        FROM invoice i
        LEFT JOIN payment p ON p.bubble_id = ANY(i.linked_payment)
        WHERE i.total_amount IS NOT NULL
          AND i.total_amount > 0
          AND i.status != 'deleted'
        GROUP BY i.id, i.total_amount
      ) subquery
      GROUP BY payment_range
      ORDER BY payment_range;
    `);
    console.table(paymentPercents.rows);

    // Sample data for testing logic
    console.log('\n=== SAMPLE INVOICES FOR LOGIC TESTING ===');
    const sampleData = await client.query(`
      SELECT
        i.id,
        i.invoice_number,
        i.status,
        i.total_amount,
        COALESCE(SUM(p.amount), 0) as total_paid,
        CASE
          WHEN i.total_amount > 0 THEN COALESCE(SUM(p.amount), 0) / i.total_amount * 100
          ELSE 0
        END as payment_percent,
        i.linked_seda_registration,
        s.reg_status as seda_status
      FROM invoice i
      LEFT JOIN payment p ON p.bubble_id = ANY(i.linked_payment)
      LEFT JOIN seda_registration s ON s.bubble_id = i.linked_seda_registration
      WHERE i.status != 'deleted'
        AND i.total_amount IS NOT NULL
      GROUP BY i.id, i.invoice_number, i.status, i.total_amount, i.linked_seda_registration, s.reg_status
      LIMIT 10;
    `);
    console.table(sampleData.rows);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

analyzeRelationships();
