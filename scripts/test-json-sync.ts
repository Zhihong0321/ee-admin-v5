/**
 * Test script for JSON file invoice sync
 * Run with: npx tsx scripts/test-json-sync.ts
 */

import { syncInvoicesFromJsonFile } from '../src/lib/bubble/sync-from-json';

async function testSync() {
  console.log('Starting JSON file invoice sync test...\n');

  const result = await syncInvoicesFromJsonFile('sample-data-invoice.json', 5);

  console.log('\n=== SYNC RESULTS ===');
  console.log(`Success: ${result.success}`);
  console.log(`Processed: ${result.processed}`);
  console.log(`Synced: ${result.synced}`);
  console.log(`Errors: ${result.errors.length}`);

  if (result.errors.length > 0) {
    console.log('\n=== ERRORS ===');
    result.errors.forEach(err => console.log(`- ${err}`));
  }

  process.exit(result.success ? 0 : 1);
}

testSync().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
