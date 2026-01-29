/**
 * Verify if linked_agent contains agent bubble_ids directly
 */

const { Client } = require('pg');

const PROD_DB = 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway';

async function verifyAgentDirectLink() {
  const client = new Client({ connectionString: PROD_DB });
  
  try {
    await client.connect();
    console.log('✓ Connected to PRODUCTION database\n');

    console.log('=== Checking if linked_agent matches agent.bubble_id directly ===\n');
    
    const result = await client.query(`
      SELECT 
        sp.id,
        sp.bubble_id as payment_bubble_id,
        sp.linked_agent,
        a.bubble_id as agent_bubble_id,
        a.name as agent_name,
        a.email as agent_email
      FROM submitted_payment sp
      LEFT JOIN agent a ON sp.linked_agent = a.bubble_id
      WHERE sp.linked_agent IS NOT NULL
      ORDER BY sp.created_at DESC;
    `);

    console.log(`Found ${result.rows.length} payments with linked_agent values:\n`);
    
    result.rows.forEach((row, i) => {
      console.log(`${i+1}. Payment ID: ${row.id} (${row.payment_bubble_id})`);
      console.log(`   linked_agent: ${row.linked_agent}`);
      if (row.agent_bubble_id) {
        console.log(`   ✓ DIRECT MATCH in agent table!`);
        console.log(`   → Agent: ${row.agent_name} (${row.agent_email})`);
      } else {
        console.log(`   ✗ No match in agent table`);
      }
      console.log('');
    });

    console.log('=== CONCLUSION ===');
    const matchCount = result.rows.filter(r => r.agent_bubble_id).length;
    const totalWithAgent = result.rows.length;
    
    if (matchCount === totalWithAgent && totalWithAgent > 0) {
      console.log('✓ ALL linked_agent values are DIRECT agent bubble_ids (not user bubble_ids)');
      console.log('\nFIX NEEDED: Payment queries should join directly to agent table, not through users table');
    } else if (matchCount > 0) {
      console.log(`⚠ MIXED: ${matchCount}/${totalWithAgent} are agent bubble_ids, others might be user bubble_ids`);
    } else {
      console.log('✗ None match agent bubble_ids - they might be user bubble_ids or invalid');
    }

  } catch (error) {
    console.error('ERROR:', error.message);
  } finally {
    await client.end();
  }
}

verifyAgentDirectLink().catch(console.error);
