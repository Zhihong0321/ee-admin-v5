/**
 * DIAGNOSTIC SCRIPT - Investigate submitted_payment linked_agent issue
 * Read-only scan of production database to find why agents show as "Unknown"
 */

const { Client } = require('pg');

const PROD_DB = 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway';

async function investigateSubmittedPaymentAgents() {
  const client = new Client({ connectionString: PROD_DB });
  
  try {
    await client.connect();
    console.log('✓ Connected to PRODUCTION database (READ-ONLY)\n');

    // 1. Check submitted_payment table structure
    console.log('=== STEP 1: Check submitted_payment columns ===');
    const tableInfo = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'submitted_payment'
      ORDER BY ordinal_position;
    `);
    console.log('Columns in submitted_payment:');
    tableInfo.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
    });

    // 2. Count total submitted_payments
    console.log('\n=== STEP 2: Count submitted_payments ===');
    const totalCount = await client.query('SELECT COUNT(*) as count FROM submitted_payment');
    console.log(`Total submitted_payment records: ${totalCount.rows[0].count}`);

    // 3. Check linked_agent NULL vs NOT NULL
    console.log('\n=== STEP 3: Check linked_agent NULL status ===');
    const nullCheck = await client.query(`
      SELECT 
        COUNT(*) FILTER (WHERE linked_agent IS NULL) as null_count,
        COUNT(*) FILTER (WHERE linked_agent IS NOT NULL) as not_null_count,
        COUNT(*) FILTER (WHERE linked_agent = '') as empty_string_count
      FROM submitted_payment;
    `);
    console.log('linked_agent status:');
    console.log(`  - NULL values: ${nullCheck.rows[0].null_count}`);
    console.log(`  - NOT NULL values: ${nullCheck.rows[0].not_null_count}`);
    console.log(`  - Empty strings: ${nullCheck.rows[0].empty_string_count}`);

    // 4. Sample submitted_payment records
    console.log('\n=== STEP 4: Sample submitted_payment records ===');
    const samples = await client.query(`
      SELECT id, bubble_id, linked_agent, linked_customer, amount, created_at
      FROM submitted_payment
      ORDER BY created_at DESC
      LIMIT 10;
    `);
    console.log('Sample records (most recent 10):');
    samples.rows.forEach((row, i) => {
      console.log(`  ${i+1}. ID: ${row.id}, Bubble: ${row.bubble_id}`);
      console.log(`     linked_agent: ${row.linked_agent || 'NULL'}`);
      console.log(`     linked_customer: ${row.linked_customer || 'NULL'}`);
      console.log(`     amount: ${row.amount}, created: ${row.created_at}`);
    });

    // 5. Check if linked_agent values exist in users table
    console.log('\n=== STEP 5: Check if linked_agent values exist in users table ===');
    const userCheck = await client.query(`
      SELECT 
        sp.linked_agent,
        COUNT(*) as payment_count,
        u.bubble_id as user_exists,
        u.email as user_email,
        u.linked_agent_profile
      FROM submitted_payment sp
      LEFT JOIN "user" u ON sp.linked_agent = u.bubble_id
      WHERE sp.linked_agent IS NOT NULL
      GROUP BY sp.linked_agent, u.bubble_id, u.email, u.linked_agent_profile
      ORDER BY payment_count DESC
      LIMIT 10;
    `);
    console.log('Top 10 linked_agent values and their user mapping:');
    userCheck.rows.forEach((row, i) => {
      console.log(`  ${i+1}. Agent ID: ${row.linked_agent} (used in ${row.payment_count} payments)`);
      if (row.user_exists) {
        console.log(`     ✓ Found in users: ${row.user_email}`);
        console.log(`     → linked_agent_profile: ${row.linked_agent_profile || 'NULL'}`);
      } else {
        console.log(`     ✗ NOT FOUND in users table`);
      }
    });

    // 6. Check if linked_agent_profile values exist in agent table
    console.log('\n=== STEP 6: Check agent table mapping ===');
    const agentCheck = await client.query(`
      SELECT 
        sp.linked_agent,
        u.email as user_email,
        u.linked_agent_profile,
        a.bubble_id as agent_exists,
        a.name as agent_name,
        COUNT(*) as payment_count
      FROM submitted_payment sp
      LEFT JOIN "user" u ON sp.linked_agent = u.bubble_id
      LEFT JOIN agent a ON u.linked_agent_profile = a.bubble_id
      WHERE sp.linked_agent IS NOT NULL
      GROUP BY sp.linked_agent, u.email, u.linked_agent_profile, a.bubble_id, a.name
      ORDER BY payment_count DESC
      LIMIT 10;
    `);
    console.log('Full mapping chain (payment → user → agent):');
    agentCheck.rows.forEach((row, i) => {
      console.log(`  ${i+1}. Payment linked_agent: ${row.linked_agent} (${row.payment_count} records)`);
      console.log(`     → User: ${row.user_email || 'NOT FOUND'}`);
      console.log(`     → User's linked_agent_profile: ${row.linked_agent_profile || 'NULL'}`);
      if (row.agent_exists) {
        console.log(`     → ✓ Agent found: ${row.agent_name}`);
      } else {
        console.log(`     → ✗ NO AGENT FOUND`);
      }
    });

    // 7. Check agents table
    console.log('\n=== STEP 7: Check agent table ===');
    const agentTable = await client.query(`
      SELECT id, bubble_id, name, email
      FROM agent
      LIMIT 10;
    `);
    console.log('Sample agents in database:');
    agentTable.rows.forEach((row, i) => {
      console.log(`  ${i+1}. ID: ${row.id}, Bubble: ${row.bubble_id}, Name: ${row.name}`);
    });

    // 8. Summary and diagnosis
    console.log('\n=== STEP 8: DIAGNOSIS SUMMARY ===');
    const diagnosis = await client.query(`
      SELECT 
        COUNT(*) as total_payments,
        COUNT(sp.linked_agent) as has_linked_agent,
        COUNT(u.bubble_id) as user_found,
        COUNT(u.linked_agent_profile) as user_has_profile,
        COUNT(a.bubble_id) as agent_found
      FROM submitted_payment sp
      LEFT JOIN "user" u ON sp.linked_agent = u.bubble_id
      LEFT JOIN agent a ON u.linked_agent_profile = a.bubble_id;
    `);
    const stats = diagnosis.rows[0];
    console.log('Pipeline breakdown:');
    console.log(`  Total submitted_payments: ${stats.total_payments}`);
    console.log(`  ├─ Has linked_agent: ${stats.has_linked_agent} (${((stats.has_linked_agent/stats.total_payments)*100).toFixed(1)}%)`);
    console.log(`  ├─ User found: ${stats.user_found} (${((stats.user_found/stats.total_payments)*100).toFixed(1)}%)`);
    console.log(`  ├─ User has linked_agent_profile: ${stats.user_has_profile} (${((stats.user_has_profile/stats.total_payments)*100).toFixed(1)}%)`);
    console.log(`  └─ Agent found: ${stats.agent_found} (${((stats.agent_found/stats.total_payments)*100).toFixed(1)}%)`);

    const missing = stats.total_payments - stats.agent_found;
    if (missing > 0) {
      console.log(`\n⚠ ISSUE IDENTIFIED: ${missing} payments cannot resolve to an agent name`);
      console.log('\nPossible causes:');
      if (stats.has_linked_agent < stats.total_payments) {
        console.log(`  - ${stats.total_payments - stats.has_linked_agent} payments have NULL linked_agent`);
      }
      if (stats.user_found < stats.has_linked_agent) {
        console.log(`  - ${stats.has_linked_agent - stats.user_found} linked_agent values don't exist in users table`);
      }
      if (stats.user_has_profile < stats.user_found) {
        console.log(`  - ${stats.user_found - stats.user_has_profile} users have NULL linked_agent_profile`);
      }
      if (stats.agent_found < stats.user_has_profile) {
        console.log(`  - ${stats.user_has_profile - stats.agent_found} linked_agent_profile values don't exist in agent table`);
      }
    } else {
      console.log('\n✓ All payments can resolve to agent names correctly');
    }

    console.log('\n=== DIAGNOSTIC COMPLETE ===\n');

  } catch (error) {
    console.error('ERROR:', error.message);
    throw error;
  } finally {
    await client.end();
    console.log('✓ Database connection closed');
  }
}

investigateSubmittedPaymentAgents().catch(console.error);
