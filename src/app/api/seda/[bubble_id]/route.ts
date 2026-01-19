import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sedaRegistration, customers } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

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

    // Fetch SEDA data with customer name via LEFT JOIN
    const result = await db
      .select({
        // SEDA fields
        seda: sedaRegistration,
        // Customer name
        customer_name: customers.name,
      })
      .from(sedaRegistration)
      .leftJoin(customers, eq(sedaRegistration.linked_customer, customers.customer_id))
      .where(eq(sedaRegistration.bubble_id, bubble_id))
      .limit(1);

    if (result.length === 0) {
      console.log("SEDA not found:", bubble_id);
      return NextResponse.json(
        { error: "SEDA registration not found" },
        { status: 404 }
      );
    }

    const { seda, customer_name } = result[0];
    console.log("Found SEDA:", seda.bubble_id, "customer:", customer_name);

    // Calculate checkpoints inline - no external function calls
    const checkpoints = {
      name: !!customer_name,
      address: !!seda.installation_address,
      mykad: !!(seda.mykad_pdf || seda.ic_copy_front),
      tnb_bill: !!(seda.tnb_bill_1 && seda.tnb_bill_2 && seda.tnb_bill_3),
      tnb_meter: !!seda.tnb_meter,
      emergency_contact: !!(seda.e_contact_name && seda.e_contact_no && seda.e_contact_relationship),
      payment_5percent: false, // TODO: fetch from invoice/payments
    };

    const completed_count = Object.values(checkpoints).filter(Boolean).length;
    const progress_percentage = Math.round((completed_count / 7) * 100);

    // Return response with customer data
    return NextResponse.json({
      seda: seda,
      customer: customer_name ? { name: customer_name } : null,
      agent: null,
      invoice: null,
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
 * Update SEDA registration status
 */
export async function PATCH(
  request: NextRequest,
  { params }: RouteContext
) {
  try {
    const { bubble_id } = await params;
    const body = await request.json();
    const { seda_status } = body;

    console.log("Updating SEDA:", bubble_id, { seda_status });

    // Simple update
    const updateData: any = {
      updated_at: new Date(),
    };

    if (seda_status !== undefined) {
      updateData.seda_status = seda_status;
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
