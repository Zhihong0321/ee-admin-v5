import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sedaRegistration, customers, invoices } from "@/db/schema";
import { eq, sql, or } from "drizzle-orm";

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
 * Backwards compatible with older callers that only send `{ seda_status }`.
 */
export async function PATCH(
  request: NextRequest,
  { params }: RouteContext
) {
  try {
    const { bubble_id } = await params;
    const body = await request.json();

    console.log("Updating SEDA:", bubble_id, Object.keys(body || {}));

    // Only allow safe, human-edited fields to be updated from the UI.
    // Do not allow changing identifiers, sync fields, or relational fields.
    const ALLOWED_FIELDS = new Set([
      "seda_status",
      "email",
      "ic_no",
      "installation_address",
      "city",
      "state",
      "system_size",
      "system_size_in_form_kwp",
      "inverter_kwac",
      "inverter_serial_no",
      "phase_type",
      "tnb_account_no",
      "tnb_meter_status",
      "e_contact_name",
      "e_contact_no",
      "e_contact_relationship",
      "e_email",
      "special_remark",
      "project_price",
      "agent",
      "nem_application_no",
      "nem_type",
      "redex_status",
      "redex_remark",
      "reg_status",
      "tnb_meter_install_date",
      "first_completion_date",
    ]);

    const updateData: Record<string, any> = { updated_at: new Date() };

    for (const [key, value] of Object.entries(body || {})) {
      if (!ALLOWED_FIELDS.has(key)) continue;
      // Keep explicit nulls; omit undefined (doesn't exist in JSON anyway).
      updateData[key] = value;
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
    return NextResponse.json(
      { error: "Failed to update SEDA registration", message: error.message },
      { status: 500 }
    );
  }
}
