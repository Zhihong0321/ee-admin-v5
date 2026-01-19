/**
 * Test script to sync SEDA status from Bubble to PostgreSQL
 * This will run a SEDA-only sync to populate the seda_status field
 */

const { runSedaOnlySync } = require('./src/app/sync/actions');

async function testSedaStatusSync() {
  console.log('=== TESTING SEDA STATUS SYNC ===\n');
  console.log('Starting SEDA-only sync to populate seda_status field...\n');

  try {
    const result = await runSedaOnlySync();

    console.log('\n=== SYNC COMPLETE ===');
    console.log('Results:', JSON.stringify(result, null, 2));

    if (result.success) {
      console.log('\n✓ Sync successful!');
      console.log(`Synced ${result.results.syncedSedas} SEDA registrations`);
    } else {
      console.log('\n✗ Sync failed:', result.error);
    }

    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error('\n✗ Error:', error);
    process.exit(1);
  }
}

testSedaStatusSync();
