/**
 * Check the full Bubble API response for invoice item
 */

const BUBBLE_API_KEY = 'b870d2b5ee6e6b39bcf99409c59c9e02';
const ITEM_ID = '1765783727740x812920548953423900';

async function checkBubbleResponse() {
  const url = `https://eternalgy.bubbleapps.io/api/1.1/obj/invoice-item/${ITEM_ID}`;

  console.log('Fetching:', url);
  console.log('Authorization:', `Bearer ${BUBBLE_API_KEY.substring(0, 10)}...`);

  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${BUBBLE_API_KEY}` },
  });

  console.log('\n=== HTTP RESPONSE ===');
  console.log('Status:', response.status);
  console.log('Status Text:', response.statusText);

  const data = await response.json();

  console.log('\n=== FULL JSON RESPONSE ===');
  console.log(JSON.stringify(data, null, 2));

  console.log('\n=== data.response ===');
  console.log(data.response);
  console.log('Type:', typeof data.response);
  console.log('Keys:', data.response ? Object.keys(data.response) : 'N/A');
}

checkBubbleResponse().catch(console.error);
