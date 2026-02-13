
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../src/db/schema';
import { eq, inArray, sql } from 'drizzle-orm';

// Setup DB Connection directly to avoid path alias issues
const connectionString = "postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway";
const pool = new Pool({ connectionString });
const db = drizzle(pool, { schema });

async function calculateCommission() {
    console.log("Starting commission calculation...");

    try {
        // Fetch invoices. Filter strategy:
        // 1. Must be fully paid (status = 'FULLY PAID' OR payment percentage >= 99.9)
        // 2. Must NOT have been processed yet (eligible_amount_description IS NULL or empty)

        // Note: percent_of_total_amount is numeric string in DB
        const BATCH_SIZE = 50;

        // Query for candidates
        const allInvoices = await db.select({ id: schema.invoices.id })
            .from(schema.invoices)
            .where(
                and(
                    // Status Check
                    or(
                        eq(schema.invoices.status, 'FULLY PAID'),
                        sql`CAST(${schema.invoices.percent_of_total_amount} AS NUMERIC) >= 99.9`
                    ),
                    // Not Processed Check
                    or(
                        sql`${schema.invoices.eligible_amount_description} IS NULL`,
                        eq(schema.invoices.eligible_amount_description, '')
                    )
                )
            );

        const totalInvoices = allInvoices.length;
        console.log(`Found ${totalInvoices} fully paid invoices to process. Processing in batches of ${BATCH_SIZE}...`);

        for (let i = 0; i < totalInvoices; i += BATCH_SIZE) {
            const batchIds = allInvoices.slice(i, i + BATCH_SIZE).map(inv => inv.id);

            // Fetch full details for batch
            const batchInvoices = await db.select().from(schema.invoices)
                .where(inArray(schema.invoices.id, batchIds));

            for (const inv of batchInvoices) {
                if (!inv.bubble_id) continue;

                // 1. Get Payments
                let totalReceived = 0;
                let totalEppCost = 0;
                const paymentListLines: string[] = [];

                if (inv.linked_payment && inv.linked_payment.length > 0) {
                    const validPaymentIds = inv.linked_payment.filter(id => id !== null) as string[];

                    if (validPaymentIds.length > 0) {
                        try {
                            const linkedPayments = await db.select().from(schema.payments)
                                .where(inArray(schema.payments.bubble_id, validPaymentIds));

                            for (const pay of linkedPayments) {
                                const amount = parseFloat(pay.amount || '0');
                                totalReceived += amount;

                                const eppCost = parseFloat(pay.epp_cost || '0');
                                totalEppCost += eppCost;

                                const dateStr = pay.payment_date ? new Date(pay.payment_date).toISOString().split('T')[0] : '-';
                                const bank = pay.issuer_bank || 'Unknown Bank';
                                const tenure = pay.epp_month ? `${pay.epp_month}mos` : '';
                                const bankInfo = `${bank} ${tenure}`.trim();

                                paymentListLines.push(
                                    `RM ${amount.toFixed(2)} | ${dateStr} | ${pay.payment_method || '-'} | ${bankInfo.replace('Unknown Bank', '')} | RM ${eppCost.toFixed(2)}`
                                );
                            }
                        } catch (err) {
                            console.error(`Error fetching payments for invoice ${inv.invoice_number}:`, err);
                        }
                    }
                }

                // 2. Get Vouchers
                let totalVoucherCost = 0;
                const voucherListLines: string[] = [];

                if (inv.linked_invoice_item && inv.linked_invoice_item.length > 0) {
                    const validItemIds = inv.linked_invoice_item.filter(id => id !== null) as string[];

                    if (validItemIds.length > 0) {
                        try {
                            const linkedItems = await db.select().from(schema.invoice_items)
                                .where(inArray(schema.invoice_items.bubble_id, validItemIds));

                            for (const item of linkedItems) {
                                if (item.linked_voucher) {
                                    const voucher = await db.select().from(schema.vouchers)
                                        .where(eq(schema.vouchers.bubble_id, item.linked_voucher))
                                        .limit(1);

                                    if (voucher.length > 0) {
                                        const v = voucher[0];
                                        const deductable = v.deductable_from_commission || 0;
                                        totalVoucherCost += deductable;

                                        voucherListLines.push(`${v.title} (Comm. Deduct: RM ${deductable})`);
                                    }
                                }
                            }
                        } catch (err) {
                            console.error(`Error fetching vouchers for invoice ${inv.invoice_number}:`, err);
                        }
                    }
                }

                // 3. Calculations
                const invoiceTotal = parseFloat(inv.total_amount || inv.amount || '0');

                let percentStr = "0.00%";
                if (invoiceTotal > 0) {
                    const percent = (totalReceived / invoiceTotal) * 100;
                    percentStr = percent.toFixed(2) + "%";
                }

                const amountEligible = invoiceTotal - (totalEppCost + totalVoucherCost);

                // 4. Construct Description
                const description = `List Of Payment
${paymentListLines.length > 0 ? paymentListLines.map((l, i) => `${i + 1}. ${l}`).join('\n') : 'No payments found'}

List Of Voucher in this Invoice :
${voucherListLines.length > 0 ? voucherListLines.map((l, i) => `${i + 1}. ${l}`).join('\n') : 'No vouchers found'}

Invoice Final Amount : RM ${invoiceTotal.toFixed(2)}
Total Received : RM ${totalReceived.toFixed(2)}
Percent of Total Payment : ${percentStr}

EPP INTEREST TOTAL : RM ${totalEppCost.toFixed(2)}
VOUCHER COST TOTAL : RM ${totalVoucherCost.toFixed(2)}

Invoice.amount_eligible_for_comm = RM ${amountEligible.toFixed(2)}`;

                // 5. Update Invoice
                await db.update(schema.invoices)
                    .set({
                        eligible_amount_description: description,
                        amount_eligible_for_comm: amountEligible.toFixed(2),
                        updated_at: new Date()
                    })
                    .where(eq(schema.invoices.id, inv.id));
            }

            const percentDone = ((i + BATCH_SIZE) / totalInvoices * 100).toFixed(1);
            console.log(`Processed batch ${Math.floor(i / BATCH_SIZE) + 1} (${Math.min(i + BATCH_SIZE, totalInvoices)}/${totalInvoices} - ${percentDone}%)`);

            await new Promise(resolve => setTimeout(resolve, 500));
        }

        console.log("\nCalculation and update complete.");

    } catch (error) {
        console.error("Error in calculation script:", error);
    } finally {
        await pool.end();
    }
}

import { and, or } from 'drizzle-orm';
calculateCommission();
