
const { Client } = require('pg');

async function run() {
    const client = new Client({
        connectionString: 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway'
    });

    const seda_bubble_id = "1769495646516x735574853002199000";

    try {
        await client.connect();

        // Fetch data
        const query = `
      SELECT s.*, c.name as customer_real_name, c.email as customer_real_email, c.ic_number, c.phone, c.address, c.postcode, c.city as customer_city, c.state as customer_state
      FROM seda_registration s
      LEFT JOIN customer c ON s.linked_customer = c.customer_id
      WHERE s.bubble_id = $1
      LIMIT 1
    `;
        const res = await client.query(query, [seda_bubble_id]);

        if (res.rows.length === 0) {
            console.log("SEDA not found");
            return;
        }

        const row = res.rows[0];

        const getValue = (val, defaultValue = "-") => {
            if (!val || val.toString().trim() === "") return defaultValue;
            return val.toString().trim();
        };

        const normalizeIC = (ic) => {
            if (!ic) return "-";
            return ic.replace(/\D/g, '');
        };

        const normalizePhone = (phone, defaultVal = "0123456789") => {
            if (!phone) return defaultVal;
            return phone.replace(/\D/g, '');
        };

        const fullAddress = getValue(row.installation_address || row.address).toUpperCase();
        const address_line_1 = fullAddress.substring(0, 40);
        const address_line_2 = fullAddress.substring(40, 80) || "MALAYSIA";

        let postcodeValue = getValue(row.postcode || "", "50000");
        if (postcodeValue === "50000" && fullAddress.match(/\b\d{5}\b/)) {
            const match = fullAddress.match(/\b\d{5}\b/);
            if (match) postcodeValue = match[0];
        }

        const profileData = {
            salutation: "MR",
            name: getValue(row.customer_real_name || row.customer_name).toUpperCase(),
            citizenship: "Malaysian",
            mykad_passport: normalizeIC(row.ic_no || row.ic_number),
            email: getValue(row.email || row.customer_real_email || "no-email@example.com").toLowerCase(),
            address_line_1,
            address_line_2,
            address_line_3: "",
            postcode: postcodeValue,
            town: getValue(row.city || row.customer_city || "KUALA LUMPUR").toUpperCase(),
            state: getValue(row.state || row.customer_state || "SELANGOR").toUpperCase(),
            mobile: normalizePhone(row.phone || row.e_contact_no),
            phone: normalizePhone(row.phone),
            contact_salutation: "MR",
            contact_name: getValue(row.e_contact_name || "EMERGENCY CONTACT").toUpperCase(),
            contact_mykad_passport: normalizeIC(row.e_contact_mykad || "800101145001"),
            contact_citizenship: "Malaysian",
            contact_relationship: getValue(row.e_contact_relationship || "FRIEND").toUpperCase(),
            contact_email: "no-email@example.com",
            contact_mobile: normalizePhone(row.e_contact_no),
        };

        console.log("Sending to SEDA API (REFINED):", JSON.stringify(profileData, null, 2));

        const apiResponse = await fetch("https://seda-manager-production.up.railway.app/api/v1/profiles/", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(profileData),
        });

        console.log("API Status:", apiResponse.status);
        const responseData = await apiResponse.json();
        console.log("API Payload Result:");
        console.log(JSON.stringify(responseData, null, 2));

        if (apiResponse.ok && responseData.success !== false) {
            const profile_id = responseData.profile_id || responseData.id;
            console.log("Extracted Profile ID SUCCESS:", profile_id);
        } else {
            console.log("API reported failure or error status");
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await client.end();
    }
}

run();
