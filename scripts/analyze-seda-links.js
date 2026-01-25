const { Client } = require('pg');

async function analyzeSedaLinks() {
  const client = new Client({
    connectionString: 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway'
  });

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL\n');

    // Check SEDA registrations with linked_invoice (array)
    console.log('=== SEDA WITH LINKED INVOICE (ARRAY) ===');
    const sedaWithInvoice = await client.query(`
      SELECT
        id,
        bubble_id as seda_bubble_id,
        reg_status,
        linked_invoice,
        array_length(linked_invoice, 1) as invoice_count
      FROM seda_registration
      WHERE linked_invoice IS NOT NULL
        AND array_length(linked_invoice, 1) > 0
        AND reg_status != 'Deleted'
      LIMIT 10;
    `);
    console.table(sedaWithInvoice.rows);

    // Check how many SEDA have linked invoices
    console.log('\n=== SEDA LINKAGE STATS ===');
    const sedaStats = await client.query(`
      SELECT
        COUNT(*) as total_seda,
        COUNT(linked_invoice) as with_any_link,
        COUNT(CASE WHEN array_length(linked_invoice, 1) > 0 THEN 1 END) as with_valid_link
      FROM seda_registration
      WHERE reg_status != 'Deleted';
    `);
    console.table(sedaStats.rows);

    // Find invoices that should be linked (using unnest)
    console.log('\n=== UNLINKED INVOICES THAT CAN BE LINKED ===');
    const unlinkable = await client.query(`
      SELECT DISTINCT
        i.id as invoice_id,
        i.bubble_id as invoice_bubble_id,
        i.invoice_number,
        i.linked_seda_registration as current_link,
        s.bubble_id as should_link_to_seda,
        s.reg_status as seda_status
      FROM seda_registration s
      CROSS JOIN unnest(s.linked_invoice) as inv_bubble_id
      LEFT JOIN invoice i ON i.bubble_id = inv_bubble_id
      WHERE i.linked_seda_registration IS NULL
        AND i.bubble_id IS NOT NULL
        AND i.status != 'deleted'
        AND s.reg_status != 'Deleted'
      LIMIT 15;
    `);
    console.table(unlinkable.rows);

    // Count how many can be fixed
    console.log('\n=== FIXABLE INVOICES COUNT ===');
    const fixableCount = await client.query(`
      SELECT COUNT(*) as fixable_count
      FROM (
        SELECT DISTINCT
          i.bubble_id
        FROM seda_registration s
        CROSS JOIN unnest(s.linked_invoice) as inv_bubble_id
        LEFT JOIN invoice i ON i.bubble_id = inv_bubble_id
        WHERE i.linked_seda_registration IS NULL
          AND i.bubble_id IS NOT NULL
          AND i.status != 'deleted'
          AND s.reg_status != 'Deleted'
      ) subquery;
    `);
    console.table(fixableCount.rows);

    // Check for potential conflicts (1 invoice linked to multiple SEDA)
    console.log('\n=== POTENTIAL CONFLICTS (INVOICE IN MULTIPLE SEDA) ===');
    const conflicts = await client.query(`
      SELECT
        inv_bubble_id,
        COUNT(*) as seda_count,
        ARRAY_AGG(s.bubble_id) as seda_bubble_ids
      FROM seda_registration s
      CROSS JOIN unnest(s.linked_invoice) as inv_bubble_id
      LEFT JOIN invoice i ON i.bubble_id = inv_bubble_id
      WHERE i.status != 'deleted'
        AND s.reg_status != 'Deleted'
      GROUP BY inv_bubble_id
      HAVING COUNT(*) > 1
      LIMIT 5;
    `);
    console.table(conflicts.rows);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

analyzeSedaLinks();
