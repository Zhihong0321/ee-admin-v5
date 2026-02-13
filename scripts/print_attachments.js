
const fs = require('fs');

const rawData = fs.readFileSync('e:\\EE-Admin-v5\\payment-json-feb.json', 'utf8');
const payments = JSON.parse(rawData);

payments.forEach((p, i) => {
    console.log(`${i + 1}. ID: ${p['unique id']} | Attachment: ${p.Attachment}`);
});
