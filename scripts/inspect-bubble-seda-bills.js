
async function checkSedaBills() {
  const { default: fetch } = await import('node-fetch');
  const BUBBLE_API_URL = 'https://eternalgy.bubbleapps.io/api/1.1/obj/seda_registration';
  const BUBBLE_API_KEY = 'b870d2b5ee6e6b39bcf99409c59c9e02';

  console.log(`Fetching from: ${BUBBLE_API_URL}`);
  
  const response = await fetch(`${BUBBLE_API_URL}?limit=5`, {
    headers: {
      'Authorization': `Bearer ${BUBBLE_API_KEY}`
    }
  });

  const text = await response.text();
  
  try {
      const data = JSON.parse(text);
      const results = data.response.results;

      console.log(`Checking ${results.length} records for TNB bill fields...\n`);

      for (const seda of results) {
        console.log(`Record ID: ${seda._id}`);
        const keys = Object.keys(seda);
        
        const combined = [...new Set([
            ...keys.filter(k => k.toLowerCase().includes('bill')),
            ...keys.filter(k => k.toLowerCase().includes('tnb'))
        ])].sort();
        
        if (combined.length > 0) {
          console.log('  Fields found:');
          combined.forEach(k => {
            console.log(`    - "${k}": ${seda[k] ? '(populated)' : '(empty)'} -> value: ${seda[k]}`);
          });
        }
        console.log('---');
      }
  } catch (e) {
      console.error("Failed to parse JSON response:");
      console.log(text.substring(0, 1000));
  }
}

checkSedaBills()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
