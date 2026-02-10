const { Client } = require('pg');

const connectionString = 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway';

async function querySchema() {
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    console.log('Connected to database\n');

    // Query invoice table schema
    console.log('=== INVOICE TABLE SCHEMA ===');
    const invoiceSchema = await client.query(`
      SELECT 
        column_name, 
        data_type, 
        is_nullable, 
        column_default,
        character_maximum_length
      FROM information_schema.columns 
      WHERE table_name = 'invoice' 
      ORDER BY ordinal_position
    `);
    console.log(JSON.stringify(invoiceSchema.rows, null, 2));

    // Query invoice_item table schema
    console.log('\n=== INVOICE_ITEM TABLE SCHEMA ===');
    const itemSchema = await client.query(`
      SELECT 
        column_name, 
        data_type, 
        is_nullable, 
        column_default,
        character_maximum_length
      FROM information_schema.columns 
      WHERE table_name = 'invoice_item' 
      ORDER BY ordinal_position
    `);
    console.log(JSON.stringify(itemSchema.rows, null, 2));

    // Query agent table schema (for agent selection)
    console.log('\n=== AGENT TABLE SCHEMA ===');
    const agentSchema = await client.query(`
      SELECT 
        column_name, 
        data_type, 
        is_nullable, 
        column_default
      FROM information_schema.columns 
      WHERE table_name = 'agent' 
      ORDER BY ordinal_position
    `);
    console.log(JSON.stringify(agentSchema.rows, null, 2));

    // Query foreign key relationships
    console.log('\n=== FOREIGN KEY RELATIONSHIPS ===');
    const fkRelations = await client.query(`
      SELECT
        tc.table_name, 
        kcu.column_name, 
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name 
      FROM information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' 
        AND (tc.table_name = 'invoice' OR tc.table_name = 'invoice_item')
      ORDER BY tc.table_name, kcu.column_name
    `);
    console.log(JSON.stringify(fkRelations.rows, null, 2));

    // Get sample invoice with items
    console.log('\n=== SAMPLE INVOICE WITH ITEMS ===');
    const sampleInvoice = await client.query(`
      SELECT 
        i.id,
        i.invoice_number,
        i.total_amount,
        i.linked_agent,
        i.linked_invoice_item,
        COUNT(ii.id) as item_count
      FROM invoice i
      LEFT JOIN invoice_item ii ON ii.bubble_id = ANY(i.linked_invoice_item)
      WHERE i.is_latest = true
      GROUP BY i.id, i.invoice_number, i.total_amount, i.linked_agent, i.linked_invoice_item
      LIMIT 1
    `);
    console.log(JSON.stringify(sampleInvoice.rows, null, 2));

    if (sampleInvoice.rows.length > 0) {
      const invoice = sampleInvoice.rows[0];
      if (invoice.linked_invoice_item && invoice.linked_invoice_item.length > 0) {
        const sampleItems = await client.query(`
          SELECT * FROM invoice_item 
          WHERE bubble_id = ANY($1::text[])
          LIMIT 5
        `, [invoice.linked_invoice_item]);
        console.log('\n=== SAMPLE INVOICE ITEMS ===');
        console.log(JSON.stringify(sampleItems.rows, null, 2));
      }
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

querySchema();
