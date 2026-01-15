const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway',
});

async function run() {
  try {
    await client.connect();
    console.log("Connected to DB for Relationship Audit\n");

    // 1. Invoice -> Customer
    const invCust = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN i.linked_customer IS NOT NULL THEN 1 END) as with_link,
        COUNT(CASE WHEN c.customer_id IS NOT NULL THEN 1 END) as valid_link
      FROM invoice i
      LEFT JOIN customer c ON i.linked_customer = c.customer_id
    `);
    console.log(`1. Invoice -> Customer: ${invCust.rows[0].valid_link} / ${invCust.rows[0].with_link} valid links`);

    // 2. Invoice -> Agent
    const invAgent = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN i.linked_agent IS NOT NULL THEN 1 END) as with_link,
        COUNT(CASE WHEN a.bubble_id IS NOT NULL THEN 1 END) as valid_link
      FROM invoice i
      LEFT JOIN agent a ON i.linked_agent = a.bubble_id
    `);
    console.log(`2. Invoice -> Agent:    ${invAgent.rows[0].valid_link} / ${invAgent.rows[0].with_link} valid links`);

    // 3. Invoice -> Created By (User)
    const invUser = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN i.created_by IS NOT NULL THEN 1 END) as with_link,
        COUNT(CASE WHEN u.bubble_id IS NOT NULL THEN 1 END) as valid_link
      FROM invoice i
      LEFT JOIN "user" u ON i.created_by = u.bubble_id
    `);
    console.log(`3. Invoice -> CreatedBy:  ${invUser.rows[0].valid_link} / ${invUser.rows[0].with_link} valid links`);

    // 4. Invoice -> Invoice Items
    // Check how many items point to a valid invoice
    const itemInv = await client.query(`
      SELECT 
        COUNT(*) as total_items,
        COUNT(CASE WHEN i.bubble_id IS NOT NULL THEN 1 END) as valid_parent_invoice
      FROM invoice_new_item it
      LEFT JOIN invoice i ON it.invoice_id = i.bubble_id
    `);
    console.log(`4. Invoice Items -> Invoice: ${itemInv.rows[0].valid_parent_invoice} / ${itemInv.rows[0].total_items} items attached to valid invoices`);

    // 5. Invoice -> Payments (Array)
    // We need to unnest the array to check individual links
    const invPay = await client.query(`
      WITH links AS (
        SELECT unnest(linked_payment) as pay_id FROM invoice
      )
      SELECT 
        COUNT(*) as total_links,
        COUNT(CASE WHEN p.bubble_id IS NOT NULL THEN 1 END) as valid_links
      FROM links l
      LEFT JOIN payment p ON l.pay_id = p.bubble_id
    `);
    console.log(`5. Invoice -> Payments:   ${invPay.rows[0].valid_links} / ${invPay.rows[0].total_links} valid payment links`);

    // 6. Invoice -> SEDA
    const invSeda = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN i.linked_seda_registration IS NOT NULL THEN 1 END) as with_link,
        COUNT(CASE WHEN s.bubble_id IS NOT NULL THEN 1 END) as valid_link
      FROM invoice i
      LEFT JOIN seda_registration s ON i.linked_seda_registration = s.bubble_id
    `);
    console.log(`6. Invoice -> SEDA:       ${invSeda.rows[0].valid_link} / ${invSeda.rows[0].with_link} valid links`);

    // 7. SEDA -> Invoice (Array)
    const sedaInv = await client.query(`
      WITH links AS (
        SELECT unnest(linked_invoice) as inv_id FROM seda_registration
      )
      SELECT 
        COUNT(*) as total_links,
        COUNT(CASE WHEN i.bubble_id IS NOT NULL THEN 1 END) as valid_links
      FROM links l
      LEFT JOIN invoice i ON l.inv_id = i.bubble_id
    `);
    console.log(`7. SEDA -> Invoice:       ${sedaInv.rows[0].valid_links} / ${sedaInv.rows[0].total_links} valid invoice links`);

    // 8. SEDA -> Customer
    const sedaCust = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN s.linked_customer IS NOT NULL THEN 1 END) as with_link,
        COUNT(CASE WHEN c.customer_id IS NOT NULL THEN 1 END) as valid_link
      FROM seda_registration s
      LEFT JOIN customer c ON s.linked_customer = c.customer_id
    `);
    console.log(`8. SEDA -> Customer:      ${sedaCust.rows[0].valid_link} / ${sedaCust.rows[0].with_link} valid links`);

    // 9. User -> Agent Profile
    const userAgent = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN u.linked_agent_profile IS NOT NULL THEN 1 END) as with_link,
        COUNT(CASE WHEN a.bubble_id IS NOT NULL THEN 1 END) as valid_link
      FROM "user" u
      LEFT JOIN agent a ON u.linked_agent_profile = a.bubble_id
    `);
    console.log(`9. User -> Agent Profile: ${userAgent.rows[0].valid_link} / ${userAgent.rows[0].with_link} valid links`);

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.end();
  }
}

run();
