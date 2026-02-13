
const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
    connectionString: "postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway",
});

function parseBubbleDate(dateStr) {
    if (!dateStr || dateStr === "" || typeof dateStr !== 'string') return null;
    const trimmed = dateStr.trim();
    if (!trimmed) return null;
    const date = new Date(trimmed);
    return isNaN(date.getTime()) ? null : date;
}

function parseCommaSeparated(value) {
    if (value === null || value === undefined) return null;
    if (Array.isArray(value)) return value.length > 0 ? value : null;
    const strValue = String(value);
    if (strValue === "" || strValue === "//") return null;
    const parts = strValue.split(',').map(s => s.trim()).filter(s => s !== "");
    return parts.length > 0 ? parts : null;
}

async function runSync() {
    try {
        const rawData = fs.readFileSync('e:\\EE-Admin-v5\\payment-json-feb.json', 'utf8');
        const paymentData = JSON.parse(rawData);
        console.log(`Starting sync for ${paymentData.length} payments from JSON...`);

        let syncedCount = 0;
        let errorCount = 0;

        for (const pay of paymentData) {
            const bubbleId = pay["unique id"] || pay._id;
            if (!bubbleId) continue;

            try {
                const jsonModifiedDate = parseBubbleDate(pay["Modified Date"]);
                const attachment = parseCommaSeparated(pay["Attachment"]);

                const vals = {
                    bubble_id: bubbleId,
                    amount: pay.Amount ? String(pay.Amount) : null,
                    payment_date: parseBubbleDate(pay["Payment Date"]),
                    payment_method: pay["Payment Method"] || null,
                    payment_method_v2: pay["Payment Method V2"] || pay["Payment Method v2"] || null,
                    remark: pay.Remark || null,
                    linked_agent: pay["Linked Agent"] || null,
                    linked_customer: pay["Linked Customer"] || null,
                    linked_invoice: pay["Linked Invoice"] || null,
                    created_by: pay["Created By"] || pay.Creator || null,
                    created_date: parseBubbleDate(pay["Created Date"]),
                    modified_date: jsonModifiedDate,
                    payment_index: pay["Payment Index"] ? Number(pay["Payment Index"]) : (pay.payment_index ? Number(pay.payment_index) : null),
                    epp_month: pay["EPP Month"] ? Number(pay["EPP Month"]) : (pay.epp_month ? Number(pay.epp_month) : null),
                    bank_charges: pay["Bank Charges"] ? Number(pay["Bank Charges"]) : (pay.bank_charges ? Number(pay.bank_charges) : null),
                    terminal: pay.Terminal || null,
                    attachment: attachment,
                    verified_by: pay["Verified By"] || null,
                    edit_history: pay["Edit History"] || null,
                    issuer_bank: pay["Issuer Bank"] || null,
                    epp_type: pay["EPP Type"] || null,
                    created_at: parseBubbleDate(pay["Created Date"]) || new Date(),
                    updated_at: jsonModifiedDate || new Date(),
                    last_synced_at: new Date()
                };

                // Upsert logic
                const query = {
                    text: `
            INSERT INTO payment (
              bubble_id, amount, payment_date, payment_method, payment_method_v2, 
              remark, linked_agent, linked_customer, linked_invoice, created_by, 
              created_date, modified_date, payment_index, epp_month, bank_charges, 
              terminal, attachment, verified_by, edit_history, issuer_bank, 
              epp_type, created_at, updated_at, last_synced_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24
            )
            ON CONFLICT (bubble_id) DO UPDATE SET
              amount = EXCLUDED.amount,
              payment_date = EXCLUDED.payment_date,
              payment_method = EXCLUDED.payment_method,
              payment_method_v2 = EXCLUDED.payment_method_v2,
              remark = EXCLUDED.remark,
              linked_agent = EXCLUDED.linked_agent,
              linked_customer = EXCLUDED.linked_customer,
              linked_invoice = EXCLUDED.linked_invoice,
              created_by = EXCLUDED.created_by,
              created_date = EXCLUDED.created_date,
              modified_date = EXCLUDED.modified_date,
              payment_index = EXCLUDED.payment_index,
              epp_month = EXCLUDED.epp_month,
              bank_charges = EXCLUDED.bank_charges,
              terminal = EXCLUDED.terminal,
              attachment = EXCLUDED.attachment,
              verified_by = EXCLUDED.verified_by,
              edit_history = EXCLUDED.edit_history,
              issuer_bank = EXCLUDED.issuer_bank,
              epp_type = EXCLUDED.epp_type,
              updated_at = EXCLUDED.updated_at,
              last_synced_at = EXCLUDED.last_synced_at
          `,
                    values: [
                        vals.bubble_id, vals.amount, vals.payment_date, vals.payment_method, vals.payment_method_v2,
                        vals.remark, vals.linked_agent, vals.linked_customer, vals.linked_invoice, vals.created_by,
                        vals.created_date, vals.modified_date, vals.payment_index, vals.epp_month, vals.bank_charges,
                        vals.terminal, vals.attachment, vals.verified_by, vals.edit_history, vals.issuer_bank,
                        vals.epp_type, vals.created_at, vals.updated_at, vals.last_synced_at
                    ]
                };

                await pool.query(query);
                syncedCount++;
            } catch (err) {
                console.error(`Error syncing payment ${bubbleId}:`, err);
                errorCount++;
            }
        }

        console.log(`Sync complete: ${syncedCount} synced, ${errorCount} errors.`);

        // Now run the invoice patch: update full_payment_date with last_payment_date for paid invoices
        console.log('Running patch for paid invoices...');
        const patchRes = await pool.query(`
      UPDATE invoice 
      SET full_payment_date = last_payment_date 
      WHERE paid = true 
      AND (full_payment_date IS NULL OR full_payment_date != last_payment_date)
    `);
        console.log(`Invoice patch complete: ${patchRes.rowCount} invoices updated.`);

    } catch (err) {
        console.error('Core sync error:', err);
    } finally {
        await pool.end();
    }
}

runSync();
