/**
 * AUDIT: ALL TABLES RELATIONAL TO INVOICE
 *
 * Check every table that links to invoice
 */

const { Client } = require('pg');

const PG_CONNECTION = 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway';
const BUBBLE_API_KEY = 'b870d2b5ee6e6b39bcf99409c59c9e02';
const BUBBLE_BASE_URL = 'https://eternalgy.bubbleapps.io/api/1.1/obj';

const RELATIONAL_TABLES = [
  'customer',
  'agent',
  'user',
  'payment',
  'submit_payment',
  'seda_registration',
  'invoice_item',
  'invoice_template',
];

async function auditTable(tableName) {
  const client = new Client({ connectionString: PG_CONNECTION });

  try {
    await client.connect();

    console.log(`\n═══════════════════════════════════════════════════════════`);
    console.log(`TABLE: ${tableName.toUpperCase()}`);
    console.log(`═══════════════════════════════════════════════════════════\n`);

    // Get Postgres column count
    const pgResult = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = $1
        AND table_schema = 'public'
      ORDER BY column_name;
    `, [tableName]);

    const pgColumns = pgResult.rows.map(r => r.column_name);
    console.log(`Postgres: ${pgColumns.length} columns\n`);

    // Get row count
    const countResult = await client.query(`SELECT COUNT(*) as count FROM ${tableName}`);
    console.log(`Rows: ${countResult.rows[0].count}\n`);

    // Get sample row
    const sampleResult = await client.query(`SELECT * FROM ${tableName} LIMIT 1`);
    if (sampleResult.rows.length > 0) {
      const sample = sampleResult.rows[0];
      const nonNullFields = Object.keys(sample).filter(k => sample[k] !== null && sample[k] !== undefined);

      console.log(`Sample data (non-null fields):\n`);
      nonNullFields.slice(0, 15).forEach(field => {
        const value = sample[field];
        const display = Array.isArray(value) ? `Array[${value.length}]` :
                       typeof value === 'object' ? JSON.stringify(value).substring(0, 40) :
                       String(value).substring(0, 40);
        console.log(`  ${field.padEnd(35)} ${display}`);
      });

      if (nonNullFields.length > 15) {
        console.log(`  ... and ${nonNullFields.length - 15} more`);
      }
    }

    return { columns: pgColumns, rowCount: parseInt(countResult.rows[0].count) };

  } finally {
    await client.end();
  }
}

async function fetchBubbleFields(tableName) {
  try {
    // Bubble uses different names for some tables
    const bubbleTableName = tableName === 'agent' ? 'agent' :
                          tableName === 'submit_payment' ? 'submit_payment' :
                          tableName === 'seda_registration' ? 'seda_registration' :
                          tableName;

    const res = await fetch(`${BUBBLE_BASE_URL}/${bubbleTableName}?limit=1`, {
      headers: { 'Authorization': `Bearer ${BUBBLE_API_KEY}` }
    });

    if (!res.ok) {
      console.log(`  ⚠️  Could not fetch from Bubble: ${res.status}`);
      return [];
    }

    const data = await res.json();
    const records = data.response.results || [];

    if (records.length === 0) {
      console.log(`  ⚠️  No records in Bubble`);
      return [];
    }

    const fields = Object.keys(records[0]);
    console.log(`\nBubble API: ${fields.length} fields\n`);

    return fields;

  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
    return [];
  }
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     AUDIT: ALL INVOICE-RELATIONAL TABLES                   ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  const results = {};

  for (const table of RELATIONAL_TABLES) {
    const pgInfo = await auditTable(table);
    const bubbleFields = await fetchBubbleFields(table);

    results[table] = {
      postgres: pgInfo,
      bubble: { fieldCount: bubbleFields.length }
    };

    // Comparison
    if (bubbleFields.length > 0) {
      console.log(`\nCoverage:`);
      console.log(`  Postgres: ${pgInfo.columns.length} columns`);
      console.log(`  Bubble:   ${bubbleFields.length} fields`);
      console.log(`  Ratio:    ${((pgInfo.columns.length / bubbleFields.length) * 100).toFixed(0)}%`);
    }
  }

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     SUMMARY                                               ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log('Table                  Postgres Columns    Bubble Fields    Data Rows');
  console.log('─────────────────────────────────────────────────────────────────');

  for (const [table, info] of Object.entries(results)) {
    const pg = info.postgres.columns.length;
    const bb = info.bubble.fieldCount;
    const rows = info.postgres.rowCount;

    console.log(`${table.padEnd(23)} ${pg.toString().padEnd(20)} ${bb.toString().padEnd(16)} ${rows}`);
  }

  console.log('\n✓ Audit complete\n');
}

main();
