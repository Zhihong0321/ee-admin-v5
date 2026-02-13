/**
 * EPP Cost Calculation Patch Script
 *
 * This script calculates epp_cost for all payments where:
 * - payment_method = 'Credit Card' AND epp_type = 'EPP'
 *   OR
 * - epp_type = 'EPP' (regardless of payment_method)
 *
 * Formula: epp_cost = (amount * rate) / (100 + rate)
 * Example: RM20,000 at 10% interest = RM1,818.18
 */

const { Pool } = require('pg');

const connectionString = "postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway";

const pool = new Pool({
    connectionString,
});

// EPP Interest Rates (from Eternal Energy rate table)
const EPP_RATES = {
    6: { 'MBB': 2.50, 'PBB': 2.50, 'HLB': null, 'CIMB': 2.50, 'AM Bank': null, 'UOB': 2.50, 'OCBC': 4.00 },
    12: { 'MBB': 3.50, 'PBB': 3.50, 'HLB': 3.50, 'CIMB': 3.50, 'AM Bank': null, 'UOB': 3.50, 'OCBC': 5.00 },
    18: { 'MBB': null, 'PBB': 4.00, 'HLB': 4.00, 'CIMB': null, 'AM Bank': null, 'UOB': null, 'OCBC': 6.00 },
    24: { 'MBB': 5.50, 'PBB': 5.50, 'HLB': 5.50, 'CIMB': 5.50, 'AM Bank': 7.00, 'UOB': 5.50, 'OCBC': 7.00 },
    36: { 'MBB': 6.00, 'PBB': 6.00, 'HLB': 6.00, 'CIMB': null, 'AM Bank': 9.00, 'UOB': 9.00, 'OCBC': 8.00 },
    48: { 'MBB': 8.00, 'PBB': 8.00, 'HLB': 8.00, 'CIMB': null, 'AM Bank': null, 'UOB': 8.50, 'OCBC': 9.00 },
    60: { 'MBB': 10.00, 'PBB': 10.00, 'HLB': 10.00, 'CIMB': null, 'AM Bank': null, 'UOB': null, 'OCBC': null },
};

/**
 * Calculate EPP cost
 * Formula: (amount * rate) / (100 + rate)
 */
function calculateEppCost(amount, rate) {
    if (!rate || !amount) return null;
    return (amount * rate) / (100 + rate);
}

/**
 * Get EPP rate for bank and tenure
 */
function getEppRate(bank, tenure) {
    if (!bank || !tenure) return null;
    const tenureRates = EPP_RATES[tenure];
    if (!tenureRates) return null;
    return tenureRates[bank] || null;
}

async function patchPayments(client, tableName) {
    console.log(`\n📊 Processing ${tableName} table...`);

    // Get all EPP payments that need epp_cost calculated
    const result = await client.query(`
        SELECT
            id,
            amount,
            issuer_bank,
            epp_month,
            epp_type,
            epp_cost
        FROM ${tableName}
        WHERE epp_type = 'EPP'
          AND (epp_cost IS NULL OR epp_cost = 0)
        ORDER BY id;
    `);

    const rowCount = result.rows.length;
    console.log(`   Found ${rowCount} EPP payments to update`);

    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const row of result.rows) {
        try {
            const tenure = row.epp_month ? parseInt(row.epp_month) : null;
            const amount = row.amount ? parseFloat(row.amount) : null;
            const bank = row.issuer_bank;

            // Validate required fields
            if (!amount || !tenure || !bank) {
                console.log(`   ⚠️  Skipping ID ${row.id}: Missing amount (${amount}), tenure (${tenure}), or bank (${bank})`);
                skipped++;
                continue;
            }

            // Get the rate
            const rate = getEppRate(bank, tenure);
            if (rate === null) {
                console.log(`   ⚠️  Skipping ID ${row.id}: No EPP rate for ${bank} at ${tenure} months`);
                skipped++;
                continue;
            }

            // Calculate EPP cost
            const eppCost = calculateEppCost(amount, rate);

            // Update the record
            await client.query(`
                UPDATE ${tableName}
                SET epp_cost = $1
                WHERE id = $2
            `, [eppCost, row.id]);

            updated++;
            console.log(`   ✅ ID ${row.id}: RM${amount.toFixed(2)} @ ${rate}% (${tenure}mo) → EPP Cost: RM${eppCost.toFixed(2)}`);

        } catch (err) {
            errors++;
            console.error(`   ❌ Error updating ID ${row.id}:`, err.message);
        }
    }

    console.log(`\n   📈 Summary for ${tableName}:`);
    console.log(`   ✅ Updated: ${updated}`);
    console.log(`   ⚠️  Skipped: ${skipped}`);
    console.log(`   ❌ Errors: ${errors}`);

    return { updated, skipped, errors };
}

async function runPatch() {
    const client = await pool.connect();
    try {
        console.log('╔════════════════════════════════════════════════════════╗');
        console.log('║     EPP Cost Calculation Patch Script                          ║');
        console.log('╚════════════════════════════════════════════════════════╝');

        // Process payment table
        const paymentResults = await patchPayments(client, 'payment');

        // Process submitted_payment table
        const submittedResults = await patchPayments(client, 'submitted_payment');

        const totalUpdated = paymentResults.updated + submittedResults.updated;
        const totalSkipped = paymentResults.skipped + submittedResults.skipped;
        const totalErrors = paymentResults.errors + submittedResults.errors;

        console.log('\n╔════════════════════════════════════════════════════════╗');
        console.log('║                     FINAL SUMMARY                             ║');
        console.log('╚════════════════════════════════════════════════════════╝');
        console.log(`✅ Successfully updated: ${totalUpdated}`);
        console.log(`⚠️  Skipped: ${totalSkipped}`);
        console.log(`❌ Errors: ${totalErrors}`);

        if (totalUpdated > 0) {
            console.log('\n✅ Patch completed successfully!');
        } else {
            console.log('\n⚠️  No payments were updated.');
        }

    } catch (err) {
        console.error('\n❌ Patch failed:', err);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

runPatch();
