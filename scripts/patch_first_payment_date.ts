import { db } from "../src/lib/db";
import { invoices, payments, customers } from "../src/db/schema";
import { eq, or, and, gte, isNotNull, inArray, desc } from "drizzle-orm";
import fs from "fs";

async function main() {
    console.log("Starting first_payment_date extraction script...");

    try {
        // 1. Fetch all invoices from Nov 2025 onwards (Nov 1, 2025 = 2025-11-01)
        const startDate = new Date('2025-11-01T00:00:00Z');

        console.log(`Fetching invoices created on or after ${startDate.toISOString()}...`);

        // We fetch invoices that have linked_payment
        const targetInvoices = await db.select({
            id: invoices.id,
            bubble_id: invoices.bubble_id,
            invoice_number: invoices.invoice_number,
            created_at: invoices.created_at,
            linked_payment: invoices.linked_payment,
            first_payment_date: invoices.first_payment_date,
            customer_id: invoices.linked_customer
        })
            .from(invoices)
            .where(
                and(
                    gte(invoices.created_at, startDate),
                    isNotNull(invoices.linked_payment)
                )
            );

        console.log(`Found ${targetInvoices.length} invoices since Nov 2025 with linked payments.`);

        if (targetInvoices.length === 0) {
            console.log("No invoices to process. Exiting.");
            process.exit(0);
        }

        // 2. Extract all unique payment IDs across these invoices
        const allPaymentIds = new Set<string>();
        targetInvoices.forEach(inv => {
            if (Array.isArray(inv.linked_payment)) {
                inv.linked_payment.forEach(pid => {
                    if (pid && typeof pid === 'string') {
                        allPaymentIds.add(pid);
                    }
                });
            }
        });

        console.log(`Extracted ${allPaymentIds.size} unique payment IDs to resolve.`);

        if (allPaymentIds.size === 0) {
            console.log("No actual payment IDs found in the arrays. Exiting.");
            process.exit(0);
        }

        // 3. Fetch all those payments in one go to build a date map
        const uniqueIdsArray = Array.from(allPaymentIds);
        const paymentDatesMap = new Map<string, Date>();

        // Process in chunks if there are too many to avoid query limits
        const chunkSize = 500;
        for (let i = 0; i < uniqueIdsArray.length; i += chunkSize) {
            const chunk = uniqueIdsArray.slice(i, i + chunkSize);

            const paymentRecords = await db
                .select({
                    bubble_id: payments.bubble_id,
                    date: payments.payment_date,
                    created_at: payments.created_at
                })
                .from(payments)
                .where(inArray(payments.bubble_id, chunk));

            paymentRecords.forEach(p => {
                // Prefer payment_date, fallback to created_at
                const dateStr = p.date || p.created_at;
                if (dateStr) {
                    const date = new Date(dateStr);
                    if (!isNaN(date.getTime()) && p.bubble_id) {
                        paymentDatesMap.set(p.bubble_id, date);
                    }
                }
            });
        }

        console.log(`Successfully mapped dates for ${paymentDatesMap.size} payments.`);

        // 4. Fetch customer names for better output
        const customerIds = Array.from(new Set(targetInvoices.map(i => i.customer_id).filter(id => id && typeof id === 'string')));
        const customerMap = new Map<string, string>();

        if (customerIds.length > 0) {
            for (let i = 0; i < customerIds.length; i += chunkSize) {
                const chunk = customerIds.slice(i, i + chunkSize) as string[];
                const customerRecords = await db
                    .select({
                        id: customers.customer_id,
                        name: customers.name
                    })
                    .from(customers)
                    .where(inArray(customers.customer_id, chunk));

                customerRecords.forEach(c => {
                    if (c.id && c.name) {
                        customerMap.set(c.id, c.name);
                    }
                });
            }
        }

        // 5. Calculate new first_payment_date for each invoice and execute updates
        let updatedCount = 0;
        let noValidDatesCount = 0;
        let skippedCount = 0;

        for (const inv of targetInvoices) {
            if (!Array.isArray(inv.linked_payment) || inv.linked_payment.length === 0) {
                continue;
            }

            let newFirstDate: Date | null = null;

            // Find the earliest date among all linked payments
            inv.linked_payment.forEach((pid: string) => {
                const pDate = paymentDatesMap.get(pid);
                if (pDate) {
                    if (!newFirstDate || pDate < newFirstDate) {
                        newFirstDate = pDate;
                    }
                }
            });

            if (!newFirstDate) {
                noValidDatesCount++;
                continue;
            }

            // Execute update on the database
            // Only update if it's currently null or different
            const currentFirstDate = inv.first_payment_date ? new Date(inv.first_payment_date) : null;

            const needsUpdate = !currentFirstDate || currentFirstDate.getTime() !== (newFirstDate as Date).getTime();

            if (needsUpdate) {
                await db.update(invoices)
                    .set({
                        first_payment_date: newFirstDate,
                        updated_at: new Date()
                    })
                    .where(eq(invoices.id, inv.id));

                updatedCount++;
                console.log(`Updated invoice ${inv.invoice_number || inv.bubble_id} with first payment date: ${(newFirstDate as Date).toISOString().split('T')[0]}`);
            } else {
                skippedCount++;
            }
        }

        console.log("\n=================================");
        console.log("🏁 DB PATCH SCRIPT COMPLETED");
        console.log(`Invoices analyzed: ${targetInvoices.length}`);
        console.log(`Successfully Updated DB: ${updatedCount}`);
        console.log(`Skipped (already correct): ${skippedCount}`);
        console.log(`No valid dates (skipped): ${noValidDatesCount}`);
        console.log("=================================\n");

        process.exit(0);
    } catch (error) {
        console.error("Fatal error running script:", error);
        process.exit(1);
    }
}

main();
