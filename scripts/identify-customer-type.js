async function identifyCustomerType() {
  const apiKey = 'b870d2b5ee6e6b39bcf99409c59c9e02';
  const baseUrl = 'https://eternalgy.bubbleapps.io/api/1.1/obj';
  const customerId = '1767074039217x391494533217779700';

  const types = ['customer', 'Customer', 'user', 'agent', 'agreement', 'package'];

  for (const type of types) {
    try {
      console.log(`\nChecking ${type}...`);
      const response = await fetch(`${baseUrl}/${type}/${customerId}`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        console.log(`FOUND: ${type}`);
        const data = await response.json();
        console.log(JSON.stringify(data.response, null, 2));
        return;
      } else {
        console.log(`Failed ${type}: ${response.status}`);
      }
    } catch (error) {
      // ignore
    }
  }
}

identifyCustomerType();
