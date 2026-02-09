import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sedaRegistration, customers, invoices } from "@/db/schema";
import { eq, sql, or, getTableColumns } from "drizzle-orm";

interface RouteContext {
  params: Promise<{
    bubble_id: string;
  }>;
}

/**
 * GET /api/seda/[bubble_id]
 * Fetch single SEDA registration - SIMPLE VERSION
 */
export async function GET(
  request: NextRequest,
  { params }: RouteContext
) {
  try {
    const { bubble_id } = await params;

    console.log("Fetching SEDA details for:", bubble_id);

    // Fetch SEDA data with customer name and linked invoice via LEFT JOIN
    const result = await db
      .select({
        // SEDA fields
        seda: sedaRegistration,
        // Customer name
        customer_name: customers.name,
        // Invoice fields
        invoice_number: invoices.invoice_number,
        invoice_total: invoices.total_amount,
        invoice_percent_paid: invoices.percent_of_total_amount,
        invoice_id: invoices.id,
      })
      .from(sedaRegistration)
      .leftJoin(customers, eq(sedaRegistration.linked_customer, customers.customer_id))
      .leftJoin(invoices, or(eq(invoices.linked_seda_registration, sedaRegistration.bubble_id), sql`${invoices.bubble_id} = ANY(${sedaRegistration.linked_invoice})`))
      .where(eq(sedaRegistration.bubble_id, bubble_id))
      .limit(1);

    if (result.length === 0) {
      console.log("SEDA not found:", bubble_id);
      return NextResponse.json(
        { error: "SEDA registration not found" },
        { status: 404 }
      );
    }

    const { seda, customer_name, invoice_number, invoice_total, invoice_percent_paid, invoice_id } = result[0];
    console.log("Found SEDA:", seda.bubble_id, "customer:", customer_name);

    // Calculate checkpoints
    const has5Percent = parseFloat(invoice_percent_paid || "0") >= 5;

    const checkpoints = {
      name: !!customer_name,
      address: !!seda.installation_address,
      mykad: !!(seda.mykad_pdf || seda.ic_copy_front),
      tnb_bill: !!(seda.tnb_bill_1 && seda.tnb_bill_2 && seda.tnb_bill_3),
      tnb_meter: !!seda.tnb_meter,
      emergency_contact: !!(seda.e_contact_name && seda.e_contact_no && seda.e_contact_relationship),
      payment_5percent: has5Percent,
    };

    const completed_count = Object.values(checkpoints).filter(Boolean).length;
    const progress_percentage = Math.round((completed_count / 7) * 100);

    // Return response with customer data
    return NextResponse.json({
      seda: seda,
      customer: customer_name ? { name: customer_name } : null,
      agent: null,
      invoice: invoice_id ? {
        id: invoice_id,
        invoice_number: invoice_number,
        total_amount: invoice_total,
        percent_of_total_amount: invoice_percent_paid
      } : null,
      payments: [],
      checkpoints,
      completed_count,
      progress_percentage,
    });
  } catch (error: any) {
    console.error("Error fetching SEDA details:", error);
    console.error("Error details:", error.message);
    console.error("Error stack:", error.stack);
    return NextResponse.json(
      {
        error: "Failed to fetch SEDA registration",
        message: error.message,
        stack: error.stack
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/seda/[bubble_id]
 * Update SEDA registration fields (admin edit)
 *
 * Important: never alters schema; only updates existing columns on `seda_registration`.
 */
export async function PATCH(
  request: NextRequest,
  { params }: RouteContext
) {
  try {
    const { bubble_id } = await params;
    const body = await request.json();
    console.log("Updating SEDA:", bubble_id, Object.keys(body || {}));

    // Whitelist strictly to existing columns in the Drizzle schema to avoid runtime errors.
    // Block primary identifiers to prevent accidental data corruption.
    const cols = getTableColumns(sedaRegistration);
    const DISALLOWED = new Set([
      "id",
      "bubble_id",
      "created_at",
      "created_date",
      "last_synced_at",
      "updated_at",
    ]);

    const updateData: Record<string, any> = {};
    const unknownKeys: string[] = [];
    for (const [key, value] of Object.entries(body || {})) {
      if (DISALLOWED.has(key)) continue;
      if (!(key in cols)) {
        unknownKeys.push(key);
        continue;
      }
      // Avoid common DB cast errors when a user clears a numeric/timestamp field.
      // Empty-string is almost never a valid value in Postgres for these types.
      updateData[key] = value === "" ? null : value;
    }

    // Always bump updated_at server-side, never from the client.
    updateData.updated_at = new Date();

    if (unknownKeys.length > 0) {
      return NextResponse.json(
        { error: "Unknown fields in request body", unknown_keys: unknownKeys },
        { status: 400 }
      );
    }

    if (Object.keys(updateData).length === 1) {
      return NextResponse.json(
        { error: "No valid fields provided for update" },
        { status: 400 }
      );
    }

    const updated = await db
      .update(sedaRegistration)
      .set(updateData)
      .where(eq(sedaRegistration.bubble_id, bubble_id))
      .returning();

    if (updated.length === 0) {
      return NextResponse.json(
        { error: "SEDA registration not found" },
        { status: 404 }
      );
    }

    console.log("Updated SEDA:", updated[0].bubble_id);

    return NextResponse.json({
      success: true,
      data: updated[0],
    });
  } catch (error: any) {
    console.error("Error updating SEDA:", error);
    const details: any = {
      message: error?.message,
      code: error?.code,
      detail: error?.detail,
      hint: error?.hint,
      constraint: error?.constraint,
      table: error?.table,
      column: error?.column,
    };
    return NextResponse.json(
      { error: "Failed to update SEDA registration", ...details },
      { status: 500 }
    );
  }
}
