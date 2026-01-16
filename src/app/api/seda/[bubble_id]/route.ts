import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sedaRegistration, customers, invoices, payments, agents } from "@/db/schema";
import { eq, sql, and } from "drizzle-orm";
import { validateSedaCheckpoints } from "@/lib/seda-validation";

interface RouteContext {
  params: Promise<{
    bubble_id: string;
  }>;
}

/**
 * GET /api/seda/[bubble_id]
 * Fetch single SEDA registration with all related data
 */
export async function GET(
  request: NextRequest,
  { params }: RouteContext
) {
  try {
    const { bubble_id } = await params;

    // Fetch SEDA registration
    const sedaData = await db
      .select()
      .from(sedaRegistration)
      .where(eq(sedaRegistration.bubble_id, bubble_id))
      .limit(1);

    if (sedaData.length === 0) {
      return NextResponse.json(
        { error: "SEDA registration not found" },
        { status: 404 }
      );
    }

    const seda = sedaData[0];

    // Fetch customer
    let customerData = null;
    if (seda.linked_customer) {
      const customerRecords = await db
        .select()
        .from(customers)
        .where(eq(customers.customer_id, seda.linked_customer))
        .limit(1);

      if (customerRecords.length > 0) {
        customerData = customerRecords[0];
      }
    }

    // Fetch agent
    let agentData = null;
    if (seda.agent) {
      const agentRecords = await db
        .select()
        .from(agents)
        .where(eq(agents.bubble_id, seda.agent))
        .limit(1);

      if (agentRecords.length > 0) {
        agentData = agentRecords[0];
      }
    }

    // Get first invoice (linked_invoice[0])
    const firstInvoiceId = seda.linked_invoice && seda.linked_invoice.length > 0
      ? seda.linked_invoice[0]
      : null;

    let invoiceData: any = null;
    let paymentsData: any[] = [];

    if (firstInvoiceId) {
      // Fetch invoice
      const invoiceRecords = await db
        .select()
        .from(invoices)
        .where(eq(invoices.bubble_id, firstInvoiceId))
        .limit(1);

      if (invoiceRecords.length > 0) {
        invoiceData = invoiceRecords[0];

        // Fetch payments for this invoice
        const paymentIds = invoiceData.linked_payment || [];
        if (paymentIds.length > 0) {
          paymentsData = await db
            .select()
            .from(payments)
            .where(sql`${payments.bubble_id} = ANY(${paymentIds})`);
        }
      }
    }

    // Validate checkpoints
    const checkpointValidation = await validateSedaCheckpoints(
      seda,
      customerData,
      invoiceData,
      paymentsData
    );

    // Return complete data
    return NextResponse.json({
      seda: {
        ...seda,
        customer: customerData,
        agent: agentData,
        invoice: invoiceData,
        payments: paymentsData,
      },
      checkpoints: checkpointValidation.result,
      completed_count: checkpointValidation.completed_count,
      progress_percentage: checkpointValidation.progress_percentage,
    });
  } catch (error) {
    console.error("Error fetching SEDA registration:", error);
    return NextResponse.json(
      { error: "Failed to fetch SEDA registration" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/seda/[bubble_id]
 * Update SEDA registration status
 * Body: { reg_status?: string, seda_status?: string }
 */
export async function PATCH(
  request: NextRequest,
  { params }: RouteContext
) {
  try {
    const { bubble_id } = await params;
    const body = await request.json();
    const { reg_status, seda_status } = body;

    // Validate status values
    const validRegStatuses = [
      "Draft",
      "Submitted",
      "Approved",
      "APPROVED",
      "Deleted",
      "Incomplete",
      "Demo",
      "Verified",
      "1 NEW CONTACT",
      "PROPOSAL",
      "2 PROPOSAL",
      null,
    ];

    const validSedaStatuses = [
      "Pending",
      "VERIFIED",
      "APPROVED BY SEDA",
      "INCOMPLETE",
      "DEMO",
      null,
    ];

    // Check if reg_status is valid (including null)
    if (reg_status !== undefined && !validRegStatuses.includes(reg_status)) {
      return NextResponse.json(
        { error: "Invalid reg_status value" },
        { status: 400 }
      );
    }

    // Check if seda_status is valid (including null)
    if (seda_status !== undefined && !validSedaStatuses.includes(seda_status)) {
      return NextResponse.json(
        { error: "Invalid seda_status value" },
        { status: 400 }
      );
    }

    // Build update object
    const updateData: any = {
      updated_at: new Date(),
    };

    if (reg_status !== undefined) {
      updateData.reg_status = reg_status;
    }

    if (seda_status !== undefined) {
      updateData.seda_status = seda_status;
    }

    // Update database
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

    return NextResponse.json({
      success: true,
      data: updated[0],
    });
  } catch (error) {
    console.error("Error updating SEDA registration:", error);
    return NextResponse.json(
      { error: "Failed to update SEDA registration" },
      { status: 500 }
    );
  }
}
