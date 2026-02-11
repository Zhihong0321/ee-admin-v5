
const fs = require('fs');

async function analyzeJsonFile() {
    try {
        const rawData = fs.readFileSync('e:\\EE-Admin-v5\\payment-json-feb.json', 'utf8');
        const payments = JSON.parse(rawData);

        console.log(`Total Payments in JSON: ${payments.length}`);

        let withAttachment = 0;
        let withoutAttachment = 0;

        payments.forEach(p => {
            const attachment = p.Attachment;
            if (attachment && attachment.trim() !== "" && attachment !== "//") {
                withAttachment++;
            } else {
                withoutAttachment++;
            }
        });

        console.log(`Payments WITH Attachment: ${withAttachment}`);
        console.log(`Payments WITHOUT Attachment: ${withoutAttachment}`);
        console.log(`Percentage missing: ${((withoutAttachment / payments.length) * 100).toFixed(2)}%`);

        if (withoutAttachment > 0) {
            console.log('\nSample Payments with NO Attachment:');
            const samples = payments.filter(p => !p.Attachment || p.Attachment.trim() === "" || p.Attachment === "//").slice(0, 5);
            samples.forEach(s => {
                console.log(`ID: ${s['unique id']} | Amount: ${s.Amount} | Date: ${s['Payment Date']} | Attachment: "${s.Attachment}"`);
            });
        }

    } catch (err) {
        console.error('Error analyzing JSON file:', err);
    }
}

analyzeJsonFile();
