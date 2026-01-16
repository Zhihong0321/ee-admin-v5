const { Client } = require('pg');

async function analyzeSchema() {
  const client = new Client({
    connectionString: 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway'
  });

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL\n');

    // Check invoice table structure
    console.log('=== INVOICE TABLE ===');
    const invoiceColumns = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'invoice'
      ORDER BY ordinal_position;
    `);
    console.table(invoiceColumns.rows);

    // Check payment table structure
    console.log('\n=== PAYMENT TABLE ===');
    const paymentColumns = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'payment'
      ORDER BY ordinal_position;
    `);
    console.table(paymentColumns.rows);

    // Check seda_registration table structure
    console.log('\n=== SEDA_REGISTRATION TABLE ===');
    const sedaColumns = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'seda_registration'
      ORDER BY ordinal_position;
    `);
    console.table(sedaColumns.rows);

    // Check invoice_new_items for price totals
    console.log('\n=== INVOICE_NEW_ITEMS TABLE ===');
    const itemsColumns = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'invoice_new_item'
      ORDER BY ordinal_position;
    `);
    console.table(itemsColumns.rows);

    // Sample invoice data to understand relationships
    console.log('\n=== SAMPLE INVOICE DATA ===');
    const sampleInvoices = await client.query(`
      SELECT
        id,
        invoice_number,
        status,
        total_amount,
        linked_payment,
        linked_seda_registration,
        created_at
      FROM invoice
      LIMIT 3;
    `);
    console.table(sampleInvoices.rows);

    // Sample payment data
    console.log('\n=== SAMPLE PAYMENT DATA ===');
    const samplePayments = await client.query(`
      SELECT
        id,
        bubble_id,
        amount,
        payment_date,
        linked_invoice
      FROM payment
      LIMIT 3;
    `);
    console.table(samplePayments.rows);

    // Sample SEDA data
    console.log('\n=== SAMPLE SEDA DATA ===');
    const sampleSeda = await client.query(`
      SELECT
        id,
        bubble_id,
        reg_status,
        linked_customer,
        linked_invoice
      FROM seda_registration
      LIMIT 3;
    `);
    console.table(sampleSeda.rows);

    // Check current status distribution
    console.log('\n=== CURRENT INVOICE STATUS DISTRIBUTION ===');
    const statusCounts = await client.query(`
      SELECT status, COUNT(*) as count
      FROM invoice
      GROUP BY status
      ORDER BY count DESC;
    `);
    console.table(statusCounts.rows);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

analyzeSchema();
