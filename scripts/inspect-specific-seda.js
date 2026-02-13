
async function checkSpecificSeda() {
  const { default: fetch } = await import('node-fetch');
  const BUBBLE_API_KEY = 'b870d2b5ee6e6b39bcf99409c59c9e02';
  const BUBBLE_ID = '1769997706675x428164794917060600';
  const BUBBLE_API_URL = `https://eternalgy.bubbleapps.io/api/1.1/obj/seda_registration/${BUBBLE_ID}`;

  console.log(`Fetching specific record: ${BUBBLE_ID}`);
  
  const response = await fetch(BUBBLE_API_URL, {
    headers: {
      'Authorization': `Bearer ${BUBBLE_API_KEY}`
    }
  });

  const text = await response.text();
  
  try {
      const data = JSON.parse(text);
      const seda = data.response;

      console.log(`
=== ALL FIELDS IN BUBBLE FOR ${BUBBLE_ID} ===
`);
      const keys = Object.keys(seda).sort();
      keys.forEach(k => {
          console.log(`"${k}": ${seda[k]}`);
      });
      
  } catch (e) {
      console.error("Failed to parse JSON response:");
      console.log(text.substring(0, 1000));
  }
}

checkSpecificSeda()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
