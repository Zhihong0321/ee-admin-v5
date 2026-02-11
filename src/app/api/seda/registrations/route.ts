import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sedaRegistration, customers, invoices, agents, users } from "@/db/schema";
import { desc, ne, eq, sql, or, arrayContains } from "drizzle-orm";

/**
 * GET /api/seda/registrations
 * Fetch SEDA registrations - optimized for list view
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const statusFilter = searchParams.get("status");
    const searchValue = searchParams.get("search");
    const searchQuery = searchValue ? searchValue.toLowerCase() : "";

    // Fetch SEDA with customer name and agent name via LEFT JOIN
    // Chain: seda.agent -> user.bubble_id -> user.linked_agent_profile -> agent.bubble_id
    const allSeda = await db
      .select({
        id: sedaRegistration.id,
        bubble_id: sedaRegistration.bubble_id,
        seda_status: sedaRegistration.seda_status,
        installation_address: sedaRegistration.installation_address,
        city: sedaRegistration.city,
        state: sedaRegistration.state,
        ic_no: sedaRegistration.ic_no,
        email: sedaRegistration.email,
        customer_name: customers.name,
        agent: sedaRegistration.agent,
        agent_name: agents.name,
        modified_date: sedaRegistration.modified_date,
        updated_at: sedaRegistration.updated_at,
        created_date: sedaRegistration.created_date,
        linked_invoice: sedaRegistration.linked_invoice,

        // Checkpoint fields
        mykad_pdf: sedaRegistration.mykad_pdf,
        ic_copy_front: sedaRegistration.ic_copy_front,
        tnb_bill_1: sedaRegistration.tnb_bill_1,
        tnb_bill_2: sedaRegistration.tnb_bill_2,
        tnb_bill_3: sedaRegistration.tnb_bill_3,
        tnb_meter: sedaRegistration.tnb_meter,
        e_contact_name: sedaRegistration.e_contact_name,
        e_contact_no: sedaRegistration.e_contact_no,
        e_contact_relationship: sedaRegistration.e_contact_relationship,

        // SEDA Profile fields
        seda_profile_status: sedaRegistration.seda_profile_status,
        seda_profile_id: sedaRegistration.seda_profile_id,
      })
      .from(sedaRegistration)
      .leftJoin(customers, eq(sedaRegistration.linked_customer, customers.customer_id))
      .leftJoin(users, eq(sedaRegistration.agent, users.bubble_id))
      .leftJoin(agents, eq(users.linked_agent_profile, agents.bubble_id))
      .orderBy(desc(sql`COALESCE(${sedaRegistration.modified_date}, ${sedaRegistration.updated_at}, ${sedaRegistration.created_date})`))
      .limit(1000);

    // Fetch invoice data for payment checkpoint
    const linkedInvoiceIds = allSeda
      .filter(s => s.linked_invoice && s.linked_invoice.length > 0)
      .flatMap(s => s.linked_invoice || []);

    let invoiceDataMap: Record<string, { share_token: string, percent_paid: number }> = {};

    if (linkedInvoiceIds.length > 0) {
      const invoiceRecords = await db
        .select({
          bubble_id: invoices.bubble_id,
          share_token: invoices.share_token,
          percent_paid: invoices.percent_of_total_amount,
        })
        .from(invoices)
        .where(
          or(...linkedInvoiceIds.map(id => eq(invoices.bubble_id, id)))
        );

      invoiceDataMap = Object.fromEntries(
        invoiceRecords.map(inv => [
          inv.bubble_id,
          {
            share_token: inv.share_token || '',
            percent_paid: parseFloat(inv.percent_paid || "0")
          }
        ])
      );
    }

    // Enrich SEDA records with calculations
    const enrichedSeda = allSeda.map(seda => {
      const firstInvoiceId = seda.linked_invoice?.[0];
      const invData = firstInvoiceId ? invoiceDataMap[firstInvoiceId] : null;

      const hasName = !!seda.customer_name;
      const hasAddress = !!seda.installation_address;
      const hasMykad = !!(seda.mykad_pdf || seda.ic_copy_front);
      const hasBills = !!(seda.tnb_bill_1 && seda.tnb_bill_2 && seda.tnb_bill_3);
      const hasMeter = !!seda.tnb_meter;
      const hasEmergency = !!(seda.e_contact_name && seda.e_contact_no && seda.e_contact_relationship);
      const has5Percent = (invData?.percent_paid || 0) >= 5;

      const completed_count = [hasName, hasAddress, hasMykad, hasBills, hasMeter, hasEmergency, has5Percent].filter(Boolean).length;
      const is_form_completed = completed_count === 7;

      return {
        ...seda,
        share_token: invData?.share_token || null,
        percent_of_total_amount: invData?.percent_paid || 0,
        completed_count,
        is_form_completed,
        has_5_percent: has5Percent
      };
    });

    // Filter in JavaScript
    let filtered = enrichedSeda;

    if (statusFilter && statusFilter !== "all") {
      filtered = filtered.filter(s => s.seda_status === statusFilter);
    }

    if (searchQuery) {
      filtered = filtered.filter(s =>
        (s.installation_address?.toLowerCase().includes(searchQuery)) ||
        (s.ic_no?.toLowerCase().includes(searchQuery)) ||
        (s.email?.toLowerCase().includes(searchQuery))
      );
    }

    // Group by seda_status
    const grouped: Record<string, any[]> = {};
    filtered.forEach(seda => {
      const status = seda.seda_status || "null";
      if (!grouped[status]) grouped[status] = [];
      grouped[status].push(seda);
    });

    const response = Object.entries(grouped).map(([status, sedas]) => ({
      seda_status: status,
      count: sedas.length,
      registrations: sedas
    }));

    response.sort((a, b) => {
      if (a.seda_status === "null") return -1;
      if (b.seda_status === "null") return 1;
      return a.seda_status.localeCompare(b.seda_status);
    });

    return NextResponse.json(response);
  } catch (error: any) {
    console.error(error);
    return NextResponse.json(
      {
        error: "Failed to fetch SEDA registrations",
        message: error.message,
      },
      { status: 500 }
    );
  }
}
