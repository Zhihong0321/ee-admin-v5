import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoices, sedaRegistration, agents, customers } from "@/db/schema";
import { desc, or, and, sql, gt, lt, eq, isNull, ne } from "drizzle-orm";

/**
 * GET /api/seda/invoices-needing-seda
 * Fetch invoices with partial payments, grouped by various criteria
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const searchValue = searchParams.get("search");
    const groupBy = searchParams.get("group") || "need-attention"; // Default to need-attention
    const searchQuery = searchValue ? searchValue.toLowerCase() : "";

    console.log("Invoices API called with:", { searchQuery, groupBy });

    // Determine which invoices to fetch based on groupBy
    let whereCondition;

    if (groupBy === "need-attention") {
      // Default: Invoices needing attention (not approved yet)
      whereCondition = and(
        gt(invoices.percent_of_total_amount, '0'),
        sql`${invoices.linked_seda_registration} IS NOT NULL`,
        or(
          isNull(sedaRegistration.seda_status),
          sql`${sedaRegistration.seda_status} != 'APPROVED BY SEDA'`
        )
      );
    } else if (groupBy === "no-seda") {
      // Invoices without SEDA registration
      whereCondition = and(
        gt(invoices.percent_of_total_amount, '0'),
        isNull(invoices.linked_seda_registration)
      );
    } else if (groupBy === "seda-status" || groupBy === "reg-status") {
      // Only invoices WITH SEDA registration (all)
      whereCondition = and(
        gt(invoices.percent_of_total_amount, '0'),
        sql`${invoices.linked_seda_registration} IS NOT NULL`
      );
    } else {
      // All invoices with payment > 0
      whereCondition = gt(invoices.percent_of_total_amount, '0');
    }

    // Fetch invoices
    const allInvoices = await db
      .select({
        invoice_bubble_id: invoices.bubble_id,
        invoice_number: invoices.invoice_number,
        total_amount: invoices.total_amount,
        percent_paid: invoices.percent_of_total_amount,
        customer_name: invoices.customer_name_snapshot,
        customer_bubble_id: invoices.linked_customer,
        agent_bubble_id: invoices.linked_agent,
        agent_name_snapshot: invoices.agent_name_snapshot,
        linked_seda_registration: invoices.linked_seda_registration,
        invoice_date: invoices.invoice_date,
        invoice_status: invoices.status,
        invoice_updated_at: invoices.updated_at,

        // SEDA fields
        seda_bubble_id: sedaRegistration.bubble_id,
        seda_status: sedaRegistration.seda_status,
        seda_reg_status: sedaRegistration.reg_status,
        seda_modified_date: sedaRegistration.modified_date,
        seda_updated_at: sedaRegistration.updated_at,
        seda_installation_address: sedaRegistration.installation_address,

        // Agent name (invoice.linked_agent → agents.bubble_id)
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
      .limit(500);

    console.log("Fetched invoices:", allInvoices.length);

    // Apply search filter if provided
    let filtered = allInvoices;

    if (searchQuery) {
      filtered = filtered.filter(inv =>
        (inv.invoice_number?.toLowerCase().includes(searchQuery)) ||
        (inv.customer_name?.toLowerCase().includes(searchQuery)) ||
        (inv.agent_name?.toLowerCase().includes(searchQuery)) ||
        (inv.agent_name_snapshot?.toLowerCase().includes(searchQuery)) ||
        (inv.seda_installation_address?.toLowerCase().includes(searchQuery))
      );
    }

    console.log("Filtered invoices:", filtered.length);

    // Group the results
    if (groupBy === "need-attention") {
      // Group by seda_status (same as seda-status but for attention view)
      const grouped: Record<string, typeof filtered> = {};
      filtered.forEach(invoice => {
        const status = invoice.seda_status || "No Status";
        if (!grouped[status]) grouped[status] = [];
        grouped[status].push(invoice);
      });

      const response = Object.entries(grouped).map(([status, invoices]) => ({
        group: status,
        group_type: "need-attention",
        count: invoices.length,
        invoices
      }));

      // Sort groups: "No Status" first, then by count DESC
      response.sort((a, b) => {
        if (a.group === "No Status") return -1;
        if (b.group === "No Status") return 1;
        return b.count - a.count; // Largest count first
      });

      return NextResponse.json(response);

    } else if (groupBy === "seda-status") {
      // Group by seda_status
      const grouped: Record<string, typeof filtered> = {};
      filtered.forEach(invoice => {
        const status = invoice.seda_status || "No Status";
        if (!grouped[status]) grouped[status] = [];
        grouped[status].push(invoice);
      });

      const response = Object.entries(grouped).map(([status, invoices]) => ({
        group: status,
        group_type: "seda_status",
        count: invoices.length,
        invoices
      }));

      // Sort groups: "No Status" first, then by count DESC
      response.sort((a, b) => {
        if (a.group === "No Status") return -1;
        if (b.group === "No Status") return 1;
        return b.count - a.count;
      });

      return NextResponse.json(response);

    } else if (groupBy === "reg-status") {
      // Group by reg_status
      const grouped: Record<string, typeof filtered> = {};
      filtered.forEach(invoice => {
        const status = invoice.seda_reg_status || "No Reg Status";
        if (!grouped[status]) grouped[status] = [];
        grouped[status].push(invoice);
      });

      const response = Object.entries(grouped).map(([status, invoices]) => ({
        group: status,
        group_type: "reg_status",
        count: invoices.length,
        invoices
      }));

      // Sort groups: "No Reg Status" first, then by count DESC
      response.sort((a, b) => {
        if (a.group === "No Reg Status") return -1;
        if (b.group === "No Reg Status") return 1;
        return b.count - a.count;
      });

      return NextResponse.json(response);

    } else {
      // no-seda or no-status: return as single flat list
      return NextResponse.json([{
        group: groupBy === "no-seda" ? "Without SEDA" : "No SEDA Status",
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
