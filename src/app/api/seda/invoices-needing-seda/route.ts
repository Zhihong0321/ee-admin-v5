import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoices, sedaRegistration, agents, customers } from "@/db/schema";
import { desc, or, and, sql, eq, isNull } from "drizzle-orm";

/**
 * GET /api/seda/invoices-needing-seda
 * Fetch invoices with partial payments, grouped by various criteria
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const searchValue = searchParams.get("search");
    const groupBy = searchParams.get("group") || "pending"; // Default to pending
    const searchQuery = searchValue ? searchValue.toLowerCase() : "";

    console.log("Invoices API called with:", { searchQuery, groupBy });

    // ALWAYS filter by percent_of_total_amount > 0 as per requirement
    // Milestone: Invoice with Payment (>0% payment, deposited invoice)
    let whereCondition = and(
      sql`${invoices.total_amount} > 0`,
      sql`${invoices.percent_of_total_amount} > 0`
    );

    // Filter by status group
    if (groupBy === "pending") {
      // Pending: status is null, empty, or literally 'pending' (case insensitive)
      whereCondition = and(
        whereCondition,
        or(
          isNull(sedaRegistration.seda_status),
          sql`${sedaRegistration.seda_status} = ''`,
          sql`LOWER(${sedaRegistration.seda_status}) = 'pending'`,
          sql`LOWER(${sedaRegistration.seda_status}) = 'not set'`
        )
      );
    } else if (groupBy === "submitted") {
      whereCondition = and(
        whereCondition,
        sql`LOWER(${sedaRegistration.seda_status}) = 'submitted'`
      );
    } else if (groupBy === "approved") {
      whereCondition = and(
        whereCondition,
        or(
          sql`LOWER(${sedaRegistration.seda_status}) = 'approved'`,
          sql`LOWER(${sedaRegistration.seda_status}) = 'approved by seda'`
        )
      );
    }

    // Fetch invoices with all fields needed for form validation
    const allInvoices = await db
      .select({
        invoice_bubble_id: invoices.bubble_id,
        invoice_number: invoices.invoice_number,
        total_amount: invoices.total_amount,
        percent_of_total_amount: invoices.percent_of_total_amount,
        customer_name: customers.name,
        customer_bubble_id: invoices.linked_customer,
        agent_bubble_id: invoices.linked_agent,
        linked_seda_registration: invoices.linked_seda_registration,
        invoice_date: invoices.invoice_date,
        invoice_status: invoices.status,
        invoice_updated_at: invoices.updated_at,

        // SEDA fields
        seda_bubble_id: sedaRegistration.bubble_id,
        seda_status: sedaRegistration.seda_status,
        seda_modified_date: sedaRegistration.modified_date,
        seda_updated_at: sedaRegistration.updated_at,
        seda_installation_address: sedaRegistration.installation_address,
        seda_ic_no: sedaRegistration.ic_no,
        seda_email: sedaRegistration.email,

        // Validation fields
        mykad_pdf: sedaRegistration.mykad_pdf,
        ic_copy_front: sedaRegistration.ic_copy_front,
        tnb_bill_1: sedaRegistration.tnb_bill_1,
        tnb_bill_2: sedaRegistration.tnb_bill_2,
        tnb_bill_3: sedaRegistration.tnb_bill_3,
        tnb_meter: sedaRegistration.tnb_meter,
        e_contact_name: sedaRegistration.e_contact_name,
        e_contact_no: sedaRegistration.e_contact_no,
        e_contact_relationship: sedaRegistration.e_contact_relationship,

        // Agent name
        agent_name: agents.name,
      })
      .from(invoices)
      .leftJoin(sedaRegistration, eq(invoices.linked_seda_registration, sedaRegistration.bubble_id))
      .leftJoin(agents, eq(invoices.linked_agent, agents.bubble_id))
      .leftJoin(customers, eq(invoices.linked_customer, customers.customer_id))
      .where(whereCondition)
      .orderBy(
        desc(sql`COALESCE(${sedaRegistration.modified_date}, ${sedaRegistration.updated_at}, ${invoices.updated_at})`)
      )
      .limit(1000);

    console.log("Fetched invoices:", allInvoices.length);

    // Apply search filter if provided
    let filtered = allInvoices;

    if (searchQuery) {
      filtered = filtered.filter(inv =>
        (inv.invoice_number?.toLowerCase().includes(searchQuery)) ||
        (inv.customer_name?.toLowerCase().includes(searchQuery)) ||
        (inv.agent_name?.toLowerCase().includes(searchQuery)) ||
        (inv.seda_installation_address?.toLowerCase().includes(searchQuery))
      );
    }

    console.log("Filtered invoices:", filtered.length);

    // Group the results
    if (groupBy === "pending" || groupBy === "submitted" || groupBy === "approved") {
      // Enrichment: Calculate form completion and payment status
      const enriched = filtered.map(inv => {
        const hasName = !!inv.customer_name;
        const hasAddress = !!inv.seda_installation_address;
        const hasMykad = !!(inv.mykad_pdf || inv.ic_copy_front);
        const hasBills = !!(inv.tnb_bill_1 && inv.tnb_bill_2 && inv.tnb_bill_3);
        const hasMeter = !!inv.tnb_meter;
        const hasEmergency = !!(inv.e_contact_name && inv.e_contact_no && inv.e_contact_relationship);
        const has5Percent = parseFloat(inv.percent_of_total_amount || "0") >= 5;

        const completed_count = [hasName, hasAddress, hasMykad, hasBills, hasMeter, hasEmergency, has5Percent].filter(Boolean).length;
        const is_form_completed = completed_count === 7;

        return {
          ...inv,
          completed_count,
          is_form_completed,
          has_5_percent: has5Percent
        };
      });

      // Group by normalized status
      const grouped: Record<string, typeof enriched> = {};
      enriched.forEach(invoice => {
        let status = "Pending";
        const rawStatus = invoice.seda_status?.toLowerCase();

        if (rawStatus === "submitted") status = "Submitted";
        else if (rawStatus === "approved" || rawStatus === "approved by seda") status = "Approved";

        if (!grouped[status]) grouped[status] = [];
        grouped[status].push(invoice);
      });

      const response = Object.entries(grouped).map(([status, invoices]) => ({
        group: status,
        group_type: "seda_status",
        count: invoices.length,
        invoices
      }));

      // Sort: Put the requested group first if it exists, otherwise sort by status
      response.sort((a, b) => {
        const statusOrder = ["Pending", "Submitted", "Approved"];
        return statusOrder.indexOf(a.group) - statusOrder.indexOf(b.group);
      });

      return NextResponse.json(response);

    } else {
      // Generic fallback
      return NextResponse.json([{
        group: "Results",
        group_type: groupBy,
        count: filtered.length,
        invoices: filtered
      }]);
    }

  } catch (error: any) {
    console.error("Invoices API Error:", error);
    console.error("Error stack:", error.stack);
    return NextResponse.json(
      {
        error: "Failed to fetch invoices",
        message: error.message,
        stack: error.stack
      },
      { status: 500 }
    );
  }
}
