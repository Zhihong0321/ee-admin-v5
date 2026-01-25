import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sedaRegistration, invoices } from "@/db/schema";
import { eq, isNull, and, sql } from "drizzle-orm";

/**
 * POST /api/maintenance/patch-seda-links
 *
 * Maintenance endpoint to patch missing links between invoices and SEDA registrations.
 *
 * This endpoint performs two patches:
 * 1. Backfill invoice.linked_seda_registration for invoices missing this link
 * 2. Patch seda_registration.linked_customer for SEDAs missing this link
 *
 * Both patches use the customer relationship as the bridge:
 * - Invoice -> linked_customer -> SEDA
 * - SEDA -> linked_customer -> Invoice
 */
export async function POST(request: NextRequest) {
  try {
    const results = {
      invoicesPatched: 0,
      sedasPatched: 0,
      errors: [] as string[]
    };

    // ========================================================================
    // PATCH 1: Backfill invoice.linked_seda_registration
    // ========================================================================
    console.log('Patch 1: Backfilling invoice.linked_seda_registration...');

    // Find invoices missing linked_seda_registration but their customer has SEDAs
    const invoicesNeedingPatch = await db
      .select({
        invoice_bubble_id: invoices.bubble_id,
        linked_customer: invoices.linked_customer,
        invoice_number: invoices.invoice_number,
      })
      .from(invoices)
      .where(
        and(
          isNull(invoices.linked_seda_registration),
          sql`CAST(${invoices.total_amount} AS FLOAT) > 0`,
          sql`${invoices.linked_customer} IS NOT NULL`
        )
      );

    console.log(`Found ${invoicesNeedingPatch.length} invoices needing SEDA link`);

    // For each invoice, find the closest SEDA by timestamp
    for (const invoice of invoicesNeedingPatch) {
      try {
        // Find SEDAs for this customer, ordered by closest timestamp
        const matchingSedas = await db
          .select({
            seda_bubble_id: sedaRegistration.bubble_id,
            time_diff: sql`ABS(EXTRACT(EPOCH FROM (${sedaRegistration.created_at} - ${invoices.created_at})))`,
          })
          .from(sedaRegistration)
          .where(eq(sedaRegistration.linked_customer, invoice.linked_customer!))
          .orderBy(sql`ABS(EXTRACT(EPOCH FROM (${sedaRegistration.created_at} - (SELECT created_at FROM invoice WHERE bubble_id = ${invoice.invoice_bubble_id}))))`)
          .limit(1);

        if (matchingSedas.length > 0) {
          // Update the invoice with the SEDA link
          await db
            .update(invoices)
            .set({ linked_seda_registration: matchingSedas[0].seda_bubble_id })
            .where(eq(invoices.bubble_id, invoice.invoice_bubble_id!));

          results.invoicesPatched++;
        }
      } catch (err) {
        results.errors.push(`Invoice ${invoice.invoice_bubble_id}: ${err}`);
      }
    }

    // ========================================================================
    // PATCH 2: Backfill seda_registration.linked_customer
    // ========================================================================
    console.log('Patch 2: Backfilling seda_registration.linked_customer...');

    // Find SEDAs missing linked_customer but have linked invoices
    const sedasNeedingPatch = await db
      .select({
        seda_bubble_id: sedaRegistration.bubble_id,
      })
      .from(sedaRegistration)
      .leftJoin(invoices, eq(invoices.linked_seda_registration, sedaRegistration.bubble_id))
      .where(
        and(
          sql`${sedaRegistration.linked_customer} IS NULL OR ${sedaRegistration.linked_customer} = ''`,
          sql`${invoices.linked_customer} IS NOT NULL`
        )
      );

    console.log(`Found ${sedasNeedingPatch.length} SEDAs needing customer link`);

    // Update each SEDA with the customer from its linked invoice
    for (const seda of sedasNeedingPatch) {
      try {
        // Get the customer from the linked invoice
        const invoiceWithCustomer = await db
          .select({
            linked_customer: invoices.linked_customer,
          })
          .from(invoices)
          .where(eq(invoices.linked_seda_registration, seda.seda_bubble_id!))
          .limit(1);

        if (invoiceWithCustomer.length > 0 && invoiceWithCustomer[0].linked_customer) {
          // Update the SEDA with the customer link
          await db
            .update(sedaRegistration)
            .set({ linked_customer: invoiceWithCustomer[0].linked_customer })
            .where(eq(sedaRegistration.bubble_id, seda.seda_bubble_id!));

          results.sedasPatched++;
        }
      } catch (err) {
        results.errors.push(`SEDA ${seda.seda_bubble_id}: ${err}`);
      }
    }

    console.log('Patch complete:', results);

    return NextResponse.json({
      success: true,
      results
    });

  } catch (error: any) {
    console.error('Patch error:', error);
    return NextResponse.json(
      {
        error: "Patch failed",
        message: error.message
      },
      { status: 500 }
    );
  }
}
