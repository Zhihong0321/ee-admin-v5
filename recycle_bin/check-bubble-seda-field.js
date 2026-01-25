/**
 * Check what the SEDA status field name is in Bubble
 * by looking at a sample SEDA record
 */
const fetch = require('node-fetch');

async function checkSedaField() {
  const BUBBLE_API_URL = 'https://easternalgebra.bubbleapps.io/api/1.1/obj/seda_registration';
  const BUBBLE_API_KEY = 'c9b71b6207e67213e90e8d8cd1fc7712';

  // Fetch one SEDA record to see its structure
  const response = await fetch(`${BUBBLE_API_URL}?limit=1`, {
    headers: {
      'Authorization': `Bearer ${BUBBLE_API_KEY}`
    }
  });

  const data = await response.json();
  const seda = data.response.results[0];

  console.log('=== SAMPLE SEDA RECORD FIELDS ===\n');
  console.log('All fields in SEDA record:');
  console.log(Object.keys(seda).sort());

  console.log('\n=== FIELDS CONTAINING "status" or "Status" ===');
  Object.keys(seda).forEach(key => {
    if (key.toLowerCase().includes('status')) {
      console.log(`${key}: "${seda[key]}"`);
    }
  });

  console.log('\n=== FIELDS CONTAINING "seda" or "SEDA" ===');
  Object.keys(seda).forEach(key => {
    if (key.toLowerCase().includes('seda')) {
      console.log(`${key}: "${seda[key]}"`);
    }
  });
}

checkSedaField()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
