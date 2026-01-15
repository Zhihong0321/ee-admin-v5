async function fetchSubmitPayment() {
  const apiKey = 'b870d2b5ee6e6b39bcf99409c59c9e02';
  const baseUrl = 'https://eternalgy.bubbleapps.io/api/1.1/obj/submit_payment';

  try {
    console.log('Fetching sample submit_payment...');
    const response = await fetch(`${baseUrl}?limit=1`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    if (data.response?.results?.length > 0) {
      console.log(JSON.stringify(data.response.results[0], null, 2));
    } else {
      console.log('No results.');
    }
  } catch (error) {
    console.error(error.message);
  }
}

fetchSubmitPayment();
