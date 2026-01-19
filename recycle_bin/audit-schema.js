/**
 * MILESTONE 1: COMPLETE SCHEMA AUDIT
 *
 * This script audits:
 * 1. Postgres invoice table structure (ALL columns)
 * 2. Postgres invoice_item table structure (ALL columns)
 * 3. Sample invoice from Bubble API (ALL fields)
 * 4. Field mapping gaps
 */

const { Client } = require('pg');

const PG_CONNECTION = 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway';
const BUBBLE_API_KEY = 'b870d2b5ee6e6b39bcf99409c59c9e02';
const BUBBLE_BASE_URL = 'https://eternalgy.bubbleapps.io/api/1.1/obj';

// Output storage
const audit = {
  timestamp: new Date().toISOString(),
  postgres: {
    invoice_table: null,
    invoice_item_table: null
  },
  bubble: {
    sample_invoice: null,
    all_fields: []
  },
  mapping: {
    missing_in_postgres: [],
    missing_in_bubble_mapping: []
  }
};

async function auditPostgresInvoiceTable() {
  const client = new Client({ connectionString: PG_CONNECTION });

  try {
    await client.connect();
    console.log('\n=== AUDIT: POSTGRES invoice TABLE STRUCTURE ===\n');

    // Get ALL columns with metadata
    const result = await client.query(`
      SELECT
        column_name,
        data_type,
        is_nullable,
        column_default,
        character_maximum_length,
        numeric_precision,
        numeric_scale
      FROM information_schema.columns
      WHERE table_name = 'invoice'
        AND table_schema = 'public'
      ORDER BY ordinal_position;
    `);

    console.log(`Found ${result.rows.length} columns in invoice table:\n`);

    const columns = result.rows.map(col => ({
      name: col.column_name,
      type: col.data_type,
      nullable: col.is_nullable === 'YES',
      default: col.column_default,
      maxLength: col.character_maximum_length,
      precision: col.numeric_precision,
      scale: col.numeric_scale
    }));

    columns.forEach((col, idx) => {
      console.log(`${(idx + 1).toString().padStart(2)}. ${col.name.padEnd(30)} ${col.type.padEnd(15)} NULL: ${col.nullable}`);
    });

    audit.postgres.invoice_table = columns;

    // Also check constraints
    const constraints = await client.query(`
      SELECT
        constraint_name,
        constraint_type
      FROM information_schema.table_constraints
      WHERE table_name = 'invoice'
        AND table_schema = 'public'
      ORDER BY constraint_type;
    `);

    console.log(`\nConstraints: ${constraints.rows.length}`);
    constraints.rows.forEach(c => {
      console.log(`  - ${c.constraint_type}: ${c.constraint_name}`);
    });

    return columns;

  } finally {
    await client.end();
  }
}

async function auditPostgresInvoiceItemTable() {
  const client = new Client({ connectionString: PG_CONNECTION });

  try {
    await client.connect();
    console.log('\n=== AUDIT: POSTGRES invoice_item TABLE STRUCTURE (CRITICAL) ===\n');

    // Check if table exists first
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'invoice_item'
          AND table_schema = 'public'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.log('❌ CRITICAL: invoice_item table DOES NOT EXIST in Postgres!\n');
      audit.postgres.invoice_item_table = { exists: false };
      return null;
    }

    // Get ALL columns with metadata
    const result = await client.query(`
      SELECT
        column_name,
        data_type,
        is_nullable,
        column_default,
        character_maximum_length,
        numeric_precision,
        numeric_scale
      FROM information_schema.columns
      WHERE table_name = 'invoice_item'
        AND table_schema = 'public'
      ORDER BY ordinal_position;
    `);

    console.log(`Found ${result.rows.length} columns in invoice_item table:\n`);

    const columns = result.rows.map(col => ({
      name: col.column_name,
      type: col.data_type,
      nullable: col.is_nullable === 'YES',
      default: col.column_default,
      maxLength: col.character_maximum_length,
      precision: col.numeric_precision,
      scale: col.numeric_scale
    }));

    columns.forEach((col, idx) => {
      console.log(`${(idx + 1).toString().padStart(2)}. ${col.name.padEnd(30)} ${col.type.padEnd(15)} NULL: ${col.nullable}`);
    });

    // Get row count
    const countResult = await client.query('SELECT COUNT(*) as count FROM invoice_item');
    console.log(`\nTotal rows: ${countResult.rows[0].count}`);

    // Get a sample row
    const sampleResult = await client.query('SELECT * FROM invoice_item LIMIT 1');
    if (sampleResult.rows.length > 0) {
      console.log('\nSample record:');
      console.log(JSON.stringify(sampleResult.rows[0], null, 2));
    }

    audit.postgres.invoice_item_table = {
      exists: true,
      columns,
      rowCount: parseInt(countResult.rows[0].count),
      sample: sampleResult.rows[0] || null
    };

    return columns;

  } finally {
    await client.end();
  }
}

async function auditBubbleInvoiceSample() {
  console.log('\n=== AUDIT: BUBBLE INVOICE OBJECT (ALL FIELDS) ===\n');

  try {
    // First, get a list of invoices to pick one
    console.log('Fetching invoice list from Bubble...');
    const listRes = await fetch(`${BUBBLE_BASE_URL}/invoice?limit=1`, {
      headers: { 'Authorization': `Bearer ${BUBBLE_API_KEY}` }
    });

    if (!listRes.ok) {
      console.log(`❌ Failed to fetch invoice list: ${listRes.status}`);
      return null;
    }

    const listData = await listRes.json();
    const invoices = listData.response.results || [];

    if (invoices.length === 0) {
      console.log('❌ No invoices found in Bubble');
      return null;
    }

    const sampleInvoiceId = invoices[0]._id;
    console.log(`Found invoice: ${sampleInvoiceId}`);
    console.log(`Fetching complete invoice object...\n`);

    // Fetch the complete invoice object
    const invRes = await fetch(`${BUBBLE_BASE_URL}/invoice/${sampleInvoiceId}`, {
      headers: { 'Authorization': `Bearer ${BUBBLE_API_KEY}` }
    });

    if (!invRes.ok) {
      console.log(`❌ Failed to fetch invoice: ${invRes.status}`);
      return null;
    }

    const invData = await invRes.json();
    const invoice = invData.response;

    // Extract ALL field names
    const allFields = Object.keys(invoice).sort();

    console.log(`Found ${allFields.length} fields in Bubble invoice object:\n`);
    allFields.forEach((field, idx) => {
      const value = invoice[field];
      const valueStr = Array.isArray(value)
        ? `Array[${value.length}]`
        : typeof value === 'object'
          ? JSON.stringify(value).substring(0, 50)
          : String(value).substring(0, 50);

      console.log(`${(idx + 1).toString().padStart(2)}. ${field.padEnd(40)} ${valueStr}`);
    });

    audit.bubble.sample_invoice = invoice;
    audit.bubble.all_fields = allFields;

    return invoice;

  } catch (error) {
    console.error(`Error: ${error.message}`);
    return null;
  }
}

async function analyzeFieldMapping() {
  console.log('\n=== FIELD MAPPING ANALYSIS ===\n');

  if (!audit.postgres.invoice_table || !audit.bubble.all_fields) {
    console.log('⚠️  Skipping - missing audit data\n');
    return;
  }

  const pgColumns = audit.postgres.invoice_table.map(c => c.name);
  const bubbleFields = audit.bubble.all_fields;

  // Known field mappings (from existing code)
  const knownMappings = {
    '_id': 'bubble_id',
    'Invoice ID': 'invoice_id',
    'Invoice Number': 'invoice_number',
    'Total Amount': 'total_amount',
    'Amount': 'amount',
    'Invoice Date': 'invoice_date',
    'Status': 'status',
    'Share Token': 'share_token',
    'Linked Customer': 'linked_customer',
    'Linked Agent': 'linked_agent',
    'Linked Payment': 'linked_payment',
    'Linked SEDA Registration': 'linked_seda_registration',
    'Linked Invoice Item': 'linked_invoice_item',
    'Linked invoice item': 'linked_invoice_item',
    'Created Date': 'created_at',
    'Modified Date': 'updated_at',
    'Created By': 'created_by'
  };

  console.log('FIELD MAPPING GAPS:\n');

  // 1. Bubble fields NOT in Postgres
  const missingInPostgres = bubbleFields.filter(f =>
    !pgColumns.includes(knownMappings[f]) &&
    !pgColumns.includes(f) &&
    f !== '_id' // Skip Bubble's internal ID
  );

  if (missingInPostgres.length > 0) {
    console.log(`❌ ${missingInPostgres.length} Bubble fields NOT in Postgres:`);
    missingInPostgres.forEach(f => console.log(`   - ${f}`));
    audit.mapping.missing_in_postgres = missingInPostgres;
  } else {
    console.log('✓ All Bubble fields mapped in Postgres');
  }

  // 2. Postgres columns NOT mapped from Bubble
  const mappedPgColumns = Object.values(knownMappings);
  const missingInBubble = pgColumns.filter(c =>
    !mappedPgColumns.includes(c) &&
    c !== 'id' && // Skip serial PK
    c !== 'is_latest' && // Skip local-only fields
    !c.startsWith('_') // Skip private fields
  );

  if (missingInBubble.length > 0) {
    console.log(`\n⚠️  ${missingInBubble.length} Postgres columns NOT from Bubble (local-only):`);
    missingInBubble.forEach(f => console.log(`   - ${f}`));
    audit.mapping.missing_in_bubble_mapping = missingInBubble;
  } else {
    console.log('\n✓ All Postgres columns mapped from Bubble');
  }

  console.log('');
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     MILESTONE 1: COMPLETE SCHEMA AUDIT                   ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    // Step 1: Audit Postgres invoice table
    await auditPostgresInvoiceTable();

    // Step 2: Audit Postgres invoice_item table (CRITICAL)
    await auditPostgresInvoiceItemTable();

    // Step 3: Audit Bubble invoice structure
    await auditBubbleInvoiceSample();

    // Step 4: Analyze field mapping gaps
    await analyzeFieldMapping();

    // Save audit results to file
    const fs = require('fs');
    fs.writeFileSync(
      'SCHEMA_AUDIT_RESULTS.json',
      JSON.stringify(audit, null, 2)
    );

    console.log('\n✓ Audit complete. Results saved to: SCHEMA_AUDIT_RESULTS.json\n');

  } catch (error) {
    console.error('\n❌ AUDIT FAILED:', error.message);
    console.error(error.stack);
  }
}

main();
