import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoices, sedaRegistration, agents, customers } from "@/db/schema";
import { desc, or, and, sql, gt, lt, eq, isNull } from "drizzle-orm";

/**
 * GET /api/seda/invoices-needing-seda
 * Fetch invoices with partial payments (0-100%) that need SEDA processing
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const searchValue = searchParams.get("search");
    const filter = searchParams.get("filter"); // "all", "without-seda", "with-seda"
    const searchQuery = searchValue ? searchValue.toLowerCase() : "";

    console.log("Invoices needing SEDA API called with:", { searchQuery, filter });

    // Fetch invoices with partial payments and their linked SEDA registrations
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

        // SEDA fields
        seda_bubble_id: sedaRegistration.bubble_id,
        seda_status: sedaRegistration.seda_status,
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
      .where((query) => {
        // Base condition: partial payment (0-100%)
        const baseConditions = and(
          gt(invoices.percent_of_total_amount, '0'),
          lt(invoices.percent_of_total_amount, '100')
        );

        // Add filter based on SEDA status
        if (filter === 'without-seda') {
          // Only invoices without SEDA or SEDA with null/empty status
          return and(
            baseConditions,
            or(
              isNull(sedaRegistration.bubble_id),
              isNull(sedaRegistration.seda_status),
              eq(sedaRegistration.seda_status, ''),
              eq(sedaRegistration.seda_status, 'null')
            )!
          );
        } else if (filter === 'with-seda') {
          // Only invoices with SEDA that has status set
          return and(
            baseConditions,
            sql`${sedaRegistration.bubble_id} IS NOT NULL`,
            sql`${sedaRegistration.seda_status} IS NOT NULL`,
            sql`${sedaRegistration.seda_status} != ''`,
            sql`${sedaRegistration.seda_status} != 'null'`
          );
        }

        // Default: show all (filter is 'all' or not specified)
        return baseConditions;
      })
      .orderBy(
        desc(sql`COALESCE(${sedaRegistration.modified_date}, ${sedaRegistration.updated_at})`),
        desc(invoices.updated_at)
      )
      .limit(100);

    console.log("Fetched invoices needing SEDA:", allInvoices.length);

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

    return NextResponse.json(filtered);
  } catch (error: any) {
    console.error("Invoices needing SEDA API Error:", error);
    console.error("Error stack:", error.stack);
    return NextResponse.json(
      {
        error: "Failed to fetch invoices needing SEDA",
        message: error.message,
        stack: error.stack
      },
      { status: 500 }
    );
  }
}
