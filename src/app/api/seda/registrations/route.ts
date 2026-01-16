import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sedaRegistration, customers, invoices, payments, agents } from "@/db/schema";
import { eq, sql, and, desc, or, like } from "drizzle-orm";
import { validateSedaCheckpoints } from "@/lib/seda-validation";

/**
 * GET /api/seda/registrations
 * Fetch SEDA registrations with customer, invoice, and payment data
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const statusFilter = searchParams.get("status");
    const searchQuery = searchParams.get("search");

    // Build query conditions
    const conditions: any[] = [
      sql`${sedaRegistration.reg_status} != 'Deleted'`
    ];

    // Filter by status
    if (statusFilter && statusFilter !== "all") {
      conditions.push(eq(sedaRegistration.seda_status, statusFilter));
    }

    // Fetch SEDA registrations with relations
    const sedaList = await db
      .select({
        // SEDA fields
        id: sedaRegistration.id,
        bubble_id: sedaRegistration.bubble_id,
        reg_status: sedaRegistration.reg_status,
        seda_status: sedaRegistration.seda_status,
        installation_address: sedaRegistration.installation_address,
        city: sedaRegistration.city,
        state: sedaRegistration.state,
        ic_no: sedaRegistration.ic_no,
        email: sedaRegistration.email,
        project_price: sedaRegistration.project_price,
        created_date: sedaRegistration.created_date,
        modified_date: sedaRegistration.modified_date,
        agent: sedaRegistration.agent,
        linked_customer: sedaRegistration.linked_customer,
        linked_invoice: sedaRegistration.linked_invoice,

        // Checkpoint fields
        mykad_pdf: sedaRegistration.mykad_pdf,
        ic_copy_front: sedaRegistration.ic_copy_front,
        ic_copy_back: sedaRegistration.ic_copy_back,
        tnb_bill_1: sedaRegistration.tnb_bill_1,
        tnb_bill_2: sedaRegistration.tnb_bill_2,
        tnb_bill_3: sedaRegistration.tnb_bill_3,
        tnb_meter: sedaRegistration.tnb_meter,
        e_contact_name: sedaRegistration.e_contact_name,
        e_contact_no: sedaRegistration.e_contact_no,
        e_contact_relationship: sedaRegistration.e_contact_relationship,

        // Customer fields
        customer_name: customers.name,
        customer_id: customers.id,

        // Agent fields
        agent_name: agents.name,
      })
      .from(sedaRegistration)
      .leftJoin(customers, eq(sedaRegistration.linked_customer, customers.customer_id))
      .leftJoin(agents, eq(sedaRegistration.agent, agents.bubble_id))
      .where(and(...conditions))
      .orderBy(desc(sedaRegistration.created_date))
      .limit(100);

    // Filter by search in JavaScript (safer than complex SQL)
    let filteredSedaList = sedaList;
    if (searchQuery && searchQuery.trim() !== "") {
      const searchLower = searchQuery.trim().toLowerCase();
      filteredSedaList = sedaList.filter((seda) =>
        (seda.customer_name && seda.customer_name.toLowerCase().includes(searchLower)) ||
        (seda.installation_address && seda.installation_address.toLowerCase().includes(searchLower)) ||
        (seda.ic_no && seda.ic_no.toLowerCase().includes(searchLower)) ||
        (seda.email && seda.email.toLowerCase().includes(searchLower))
      );
    }

    // Now fetch invoice and payment data for each SEDA
    const results = await Promise.all(
      filteredSedaList.map(async (seda) => {
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
          { name: seda.customer_name },
          invoiceData,
          paymentsData
        );

        return {
          ...seda,
          invoice: invoiceData,
          payments: paymentsData,
          checkpoints: checkpointValidation.result,
          completed_count: checkpointValidation.completed_count,
          progress_percentage: checkpointValidation.progress_percentage,
        };
      })
    );

    // Group by seda_status
    const grouped = results.reduce((acc, seda) => {
      const status = seda.seda_status || "null";
      if (!acc[status]) {
        acc[status] = [];
      }
      acc[status].push(seda);
      return acc;
    }, {} as Record<string, typeof results>);

    // Format response
    const response = Object.entries(grouped).map(([status, sedas]) => ({
      seda_status: status,
      count: sedas.length,
      registrations: sedas,
    }));

    // Sort by status (null first, then alphabetically)
    response.sort((a, b) => {
      if (a.seda_status === "null") return -1;
      if (b.seda_status === "null") return 1;
      return a.seda_status.localeCompare(b.seda_status);
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching SEDA registrations:", error);
    return NextResponse.json(
      { error: "Failed to fetch SEDA registrations", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
