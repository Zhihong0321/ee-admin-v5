/**
 * COMPLETE AUDIT: ALL BUBBLE → POSTGRES TABLE MAPPINGS
 *
 * This script creates a complete field inventory for EVERY table
 * Mapping Bubble fields → Postgres columns
 * Identifying gaps, missing columns, and data type mismatches
 */

const { Client } = require('pg');
const fs = require('fs');

const PG_CONNECTION = 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway';
const BUBBLE_API_KEY = 'b870d2b5ee6e6b39bcf99409c59c9e02';
const BUBBLE_BASE_URL = 'https://eternalgy.bubbleapps.io/api/1.1/obj';

// Complete table definitions
const TABLES = {
  invoice: {
    postgres: 'invoice',
    bubble: 'invoice',
    description: 'Main invoice table'
  },
  customer: {
    postgres: 'customer',
    bubble: 'Customer_Profile', // NOTE: Different name!
    description: 'Customer profiles'
  },
  agent: {
    postgres: 'agent',
    bubble: 'agent',
    description: 'Agent records'
  },
  user: {
    postgres: 'user',
    bubble: 'user',
    description: 'User accounts'
  },
  payment: {
    postgres: 'payment',
    bubble: 'payment',
    description: 'Payment records'
  },
  submitted_payment: {
    postgres: 'submitted_payment',
    bubble: 'submit_payment', // NOTE: Different name!
    description: 'Submitted payments'
  },
  seda_registration: {
    postgres: 'seda_registration',
    bubble: 'seda_registration',
    description: 'SEDA registration records'
  },
  invoice_item: {
    postgres: 'invoice_item',
    bubble: null, // UNKNOWN - need to find
    description: 'Invoice line items'
  },
  invoice_template: {
    postgres: 'invoice_template',
    bubble: null, // UNKNOWN - need to find
    description: 'Invoice templates'
  },
};

async function getPostgresColumns(tableName) {
  const client = new Client({ connectionString: PG_CONNECTION });

  try {
    await client.connect();

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
      WHERE table_name = $1
        AND table_schema = 'public'
      ORDER BY ordinal_position;
    `, [tableName]);

    return result.rows.map(col => ({
      name: col.column_name,
      type: col.data_type,
      nullable: col.is_nullable === 'YES',
      default: col.column_default,
      maxLength: col.character_maximum_length,
      precision: col.numeric_precision,
      scale: col.numeric_scale,
    }));

  } finally {
    await client.end();
  }
}

async function getBubbleFields(bubbleTableName) {
  if (!bubbleTableName) {
    return { found: false, fields: [] };
  }

  try {
    const res = await fetch(`${BUBBLE_BASE_URL}/${bubbleTableName}?limit=1`, {
      headers: { 'Authorization': `Bearer ${BUBBLE_API_KEY}` }
    });

    if (!res.ok) {
      return { found: false, fields: [], error: res.status };
    }

    const data = await res.json();
    const records = data.response.results || [];

    if (records.length === 0) {
      return { found: true, fields: [], isEmpty: true };
    }

    const fields = Object.keys(records[0]);

    return { found: true, fields, sample: records[0] };

  } catch (error) {
    return { found: false, fields: [], error: error.message };
  }
}

function guessMapping(bubbleField, pgColumns) {
  // Try exact match first
  const exactMatch = pgColumns.find(c =>
    c.name.toLowerCase() === bubbleField.toLowerCase()
  );
  if (exactMatch) return exactMatch.name;

  // Try snake_case conversion
  const snakeCase = bubbleField
    .replace(/([A-Z])/g, '_$1')
    .replace(/^_/, '')
    .toLowerCase();

  const snakeMatch = pgColumns.find(c =>
    c.name.toLowerCase() === snakeCase
  );
  if (snakeMatch) return snakeMatch.name;

  // Try removing spaces and special chars
  const cleaned = bubbleField.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const cleanedMatch = pgColumns.find(c =>
    c.name.toLowerCase().replace(/_/g, '') === cleaned
  );
  if (cleanedMatch) return cleanedMatch.name;

  return null;
}

async function auditTable(tableKey) {
  const table = TABLES[tableKey];
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`AUDIT: ${table.postgres.toUpperCase()}`);
  console.log(`${'═'.repeat(70)}`);
  console.log(`Description: ${table.description}`);
  console.log(`Postgres Table: ${table.postgres}`);
  console.log(`Bubble Object:  ${table.bubble || 'UNKNOWN'}`);

  // Get Postgres columns
  const pgColumns = await getPostgresColumns(table.postgres);
  console.log(`\nPostgres: ${pgColumns.length} columns`);

  // Get Bubble fields
  const bubble = await getBubbleFields(table.bubble);

  if (!bubble.found) {
    console.log(`\n❌ Bubble object NOT FOUND`);
    if (bubble.error) {
      console.log(`   Error: ${bubble.error}`);
    }
    return {
      tableKey,
      postgres: table.postgres,
      bubble: table.bubble,
      pgColumns,
      bubbleFields: [],
      mappings: [],
      unmappedBubble: [],
      unmappedPostgres: pgColumns,
      complete: false
    };
  }

  if (bubble.isEmpty) {
    console.log(`\n⚠️  Bubble object exists but has NO records`);
  }

  console.log(`Bubble: ${bubble.fields.length} fields`);

  // Create mappings
  const mappings = [];
  const unmappedBubble = [];
  const unmappedPostgres = [...pgColumns];
  const ambiguousMappings = [];

  console.log(`\n${'─'.repeat(70)}`);
  console.log(`FIELD MAPPINGS:`);
  console.log(`${'─'.repeat(70)}\n`);

  for (const bubbleField of bubble.fields) {
    // Skip Bubble internal fields
    if (bubbleField === '_id' || bubbleField.startsWith('_')) {
      const pgCol = bubbleField === '_id' ? 'bubble_id' : null;
      if (pgCol && pgColumns.find(c => c.name === pgCol)) {
        mappings.push({ bubbleField, pgColumn: pgCol, type: 'primary_key' });
        unmappedPostgres.splice(unmappedPostgres.findIndex(c => c.name === pgCol), 1);
      }
      continue;
    }

    // Guess mapping
    const pgCol = guessMapping(bubbleField, pgColumns);

    if (pgCol) {
      const pgColumnInfo = pgColumns.find(c => c.name === pgCol);
      mappings.push({
        bubbleField,
        pgColumn: pgCol,
        pgType: pgColumnInfo.type,
        confidence: 'high'
      });
      unmappedPostgres.splice(unmappedPostgres.findIndex(c => c.name === pgCol), 1);
    } else {
      unmappedBubble.push(bubbleField);
    }
  }

  // Print mappings
  console.log(`\n✅ MAPPED FIELDS (${mappings.length}):\n`);
  mappings.slice(0, 30).forEach(({ bubbleField, pgColumn, pgType }) => {
    console.log(`  ${bubbleField.padEnd(35)} → ${pgColumn.padEnd(30)} ${pgType || ''}`);
  });
  if (mappings.length > 30) {
    console.log(`  ... and ${mappings.length - 30} more`);
  }

  // Print unmapped Bubble fields
  if (unmappedBubble.length > 0) {
    console.log(`\n⚠️  UNMAPPED BUBBLE FIELDS (${unmappedBubble.length}):\n`);
    unmappedBubble.forEach(f => console.log(`    • ${f}`));
  }

  // Print unmapped Postgres columns
  if (unmappedPostgres.length > 0) {
    console.log(`\n📋 POSTGRES-ONLY COLUMNS (${unmappedPostgres.length}):\n`);
    unmappedPostgres.slice(0, 20).forEach(c => {
      console.log(`    • ${c.name.padEnd(35)} ${c.type}`);
    });
    if (unmappedPostgres.length > 20) {
      console.log(`    ... and ${unmappedPostgres.length - 20} more`);
    }
  }

  // Statistics
  const totalFields = bubble.fields.length;
  const mappedCount = mappings.length;
  const coverage = totalFields > 0 ? ((mappedCount / totalFields) * 100).toFixed(1) : 0;

  console.log(`\n${'─'.repeat(70)}`);
  console.log(`STATISTICS:`);
  console.log(`${'─'.repeat(70)}\n`);
  console.log(`  Bubble Fields:        ${totalFields}`);
  console.log(`  Postgres Columns:     ${pgColumns.length}`);
  console.log(`  Mapped Fields:        ${mappedCount} (${coverage}%)`);
  console.log(`  Unmapped Bubble:      ${unmappedBubble.length}`);
  console.log(`  Postgres-Only:        ${unmappedPostgres.length}`);

  return {
    tableKey,
    postgres: table.postgres,
    bubble: table.bubble,
    pgColumns,
    bubbleFields: bubble.fields,
    mappings,
    unmappedBubble,
    unmappedPostgres,
    complete: bubble.found && bubble.fields.length > 0,
    coverage: parseFloat(coverage)
  };
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     COMPLETE AUDIT: ALL BUBBLE → POSTGRES TABLES           ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  const results = {};

  for (const tableKey of Object.keys(TABLES)) {
    const result = await auditTable(tableKey);
    results[tableKey] = result;
  }

  // Save results to JSON
  fs.writeFileSync(
    'COMPLETE_AUDIT_RESULTS.json',
    JSON.stringify(results, null, 2)
  );

  // Summary
  console.log('\n\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     SUMMARY                                                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log(`Table                    Status      Mapped    Coverage`);
  console.log(`${'─'.repeat(70)}`);

  for (const [tableKey, result] of Object.entries(results)) {
    const status = !result.complete ? '❌ NOT FOUND' :
                    result.coverage < 50 ? '🔴 CRITICAL' :
                    result.coverage < 70 ? '🟠 BAD' :
                    result.coverage < 90 ? '🟡 OK' : '✅ GOOD';

    console.log(`${result.postgres.padEnd(25)} ${status.padEnd(11)} ${result.mappings.length.toString().padEnd(5)} ${result.coverage}%`);
  }

  console.log(`\n✓ Results saved to: COMPLETE_AUDIT_RESULTS.json\n`);
}

main();
