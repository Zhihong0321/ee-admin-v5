
"use server";
import { db } from "@/lib/db";
import { invoices, payments } from "@/db/schema";
import { eq, isNotNull } from "drizzle-orm";
import { logSyncActivity } from "@/lib/logger";
import { revalidatePath } from "next/cache";

/**
 * ============================================================================
 * FUNCTION: syncMissingPaymentLinks
 * ============================================================================
 *
 * INTENT (What & Why):
 * Scan all payments that have a `linked_invoice` and ensure their ID is present
 * in the corresponding invoice's `linked_payment` array. This fixes data consistency
 * issues where the link is one-sided (Payment -> Invoice) but not (Invoice -> Payment).
 *
 * INPUTS:
 * None (scans all verified payments)
 *
 * OUTPUTS:
 * @returns { success: boolean, updated: number, message: string }
 */
export async function syncMissingPaymentLinks() {
    logSyncActivity("Starting 'Sync Missing Payment Links' job...", 'INFO');

    try {
        let updatedCount = 0;

        // 1. Fetch all invoices into a Map for O(1) access
        // We need the full array to update it
        const allInvoices = await db.select({
            id: invoices.id,
            bubble_id: invoices.bubble_id,
            linked_payment: invoices.linked_payment
        }).from(invoices);

        const invoiceMap = new Map<string, { id: number, linked_payment: string[] }>();
        allInvoices.forEach(inv => {
            if (inv.bubble_id) {
                invoiceMap.set(inv.bubble_id, {
                    id: inv.id,
                    linked_payment: inv.linked_payment || []
                });
            }
        });

        // 2. Fetch all verified payments with linked_invoice
        const paymentsWithLinks = await db.select({
            bubble_id: payments.bubble_id,
            linked_invoice: payments.linked_invoice
        })
            .from(payments)
            .where(isNotNull(payments.linked_invoice));

        logSyncActivity(`Scanning ${paymentsWithLinks.length} payments for missing links...`, 'INFO');

        // 3. Check each payment
        for (const p of paymentsWithLinks) {
            if (!p.linked_invoice || !p.bubble_id) continue;

            const invData = invoiceMap.get(p.linked_invoice);

            if (invData) {
                // Check if payment ID is in the invoice's linked_payment array
                if (!invData.linked_payment.includes(p.bubble_id)) {
                    // It's missing! Add it.
                    const newLinks = [...invData.linked_payment, p.bubble_id];

                    // Update DB
                    await db.update(invoices)
                        .set({
                            linked_payment: newLinks,
                            updated_at: new Date()
                        })
                        .where(eq(invoices.id, invData.id));

                    // Update Map in case there are multiple payments for same invoice
                    invoiceMap.set(p.linked_invoice, {
                        id: invData.id,
                        linked_payment: newLinks
                    });

                    updatedCount++;
                    logSyncActivity(`Fixed Link: Added Payment ${p.bubble_id} to Invoice ${p.linked_invoice}`, 'INFO');
                }
            }
        }

        logSyncActivity(`Sync Missing Links complete. Updated ${updatedCount} invoices.`, 'INFO');
        revalidatePath("/invoices");

        return {
            success: true,
            updated: updatedCount,
            message: `Updated ${updatedCount} invoices with missing payment links.`
        };

    } catch (error) {
        logSyncActivity(`Sync Missing Links CRASHED: ${String(error)}`, 'ERROR');
        return { success: false, error: String(error) };
    }
}
