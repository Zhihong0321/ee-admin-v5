
const BUBBLE_API_KEY = process.env.BUBBLE_API_KEY || 'b870d2b5ee6e6b39bcf99409c59c9e02';
const BUBBLE_BASE_URL = 'https://eternalgy.bubbleapps.io/api/1.1/obj';
const AGENT_ID = '1743046625411x149828353222770700';

async function main() {
  const headers = {
    'Authorization': `Bearer ${BUBBLE_API_KEY}`,
    'Content-Type': 'application/json'
  };

  console.log(`Scanning Bubble invoices for Agent ID: ${AGENT_ID} to find one without Invoice ID...`);
  
  const constraints = JSON.stringify([
    { key: 'Linked Agent', constraint_type: 'equals', value: AGENT_ID }
  ]);

  // Fetch more results to find a non-formal one
  const url = `${BUBBLE_BASE_URL}/invoice?constraints=${encodeURIComponent(constraints)}&limit=200`;
  
  try {
    const response = await fetch(url, { headers });
    const data = await response.json();
    
    console.log(`Fetched ${data.response.results.length} invoices.`);
    
    const noId = data.response.results.find((i: any) => !i['Invoice ID']);
    
    if (noId) {
        console.log(`\nFound Invoice WITHOUT "Invoice ID":`);
        console.log(`- Bubble ID: ${noId._id}`);
        console.log(`- Created Date: ${noId['Created Date']}`);
        console.log(`- Amount: ${noId.Amount}`);
    } else {
        console.log('\nAll fetched invoices have an "Invoice ID".');
    }

  } catch (error) { console.error(error); }
}

main();
