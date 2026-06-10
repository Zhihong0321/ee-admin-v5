import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sedaRegistration, customers, invoices, users } from "@/db/schema";
import { desc, eq, sql, or, and, isNull, gte } from "drizzle-orm";

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
    const agentUserIdFilter = searchParams.get("agent_user_id") || searchParams.get("user_id");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get("pageSize") || "50")));

    const [results, attentionResult] = await Promise.all([
      db
        .select({
          id: sedaRegistration.id,
          bubble_id: sedaRegistration.bubble_id,
          seda_status: sedaRegistration.seda_status,
          installation_address: sedaRegistration.installation_address,
          installation_address_1: sedaRegistration.installation_address_1,
          installation_address_2: sedaRegistration.installation_address_2,
          postcode: sedaRegistration.postcode,
          city: sedaRegistration.city,
          state: sedaRegistration.state,
          latitude: sedaRegistration.latitude,
          longitude: sedaRegistration.longitude,
          ic_no: sedaRegistration.ic_no,
          tin_number: sedaRegistration.tin_number,
          tax_document: sedaRegistration.tax_document,
          email: sedaRegistration.email,
          customer_name: customers.name,
          agent_user_id: sedaRegistration.agent,
          agent_user_email: users.email,
          agent_code: users.agent_code,
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

          // Invoice info for enrichment
          percent_of_total_amount: invoices.percent_of_total_amount,
          share_token: invoices.share_token,
          invoice_bubble_id: invoices.bubble_id
        })
        .from(invoices)
        .innerJoin(sedaRegistration, or(
          eq(invoices.linked_seda_registration, sedaRegistration.bubble_id),
          sql`${invoices.bubble_id} = ANY(${sedaRegistration.linked_invoice})`
        ))
        .leftJoin(customers, eq(invoices.linked_customer, customers.customer_id))
        .leftJoin(users, eq(sedaRegistration.agent, users.bubble_id))
        .where(gte(invoices.percent_of_total_amount, "4"))
        .orderBy(desc(sedaRegistration.created_date))
        .limit(pageSize)
        .offset((page - 1) * pageSize),

      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(invoices)
        .leftJoin(sedaRegistration, eq(invoices.linked_seda_registration, sedaRegistration.bubble_id))
        .where(
          and(
            sql`${invoices.total_amount} > 0`,
            sql`${invoices.percent_of_total_amount} > 0`,
            or(
              isNull(sedaRegistration.seda_status),
              sql`${sedaRegistration.seda_status} = ''`,
              sql`LOWER(${sedaRegistration.seda_status}) = 'pending'`,
              sql`LOWER(${sedaRegistration.seda_status}) = 'not set'`
            )
          )
        ),
    ]);

    const attentionCount = attentionResult[0]?.count || 0;

    // Remove duplicates if multiple invoices point to the same SEDA registration
    const seenSedaIds = new Set<string>();
    const uniqueSeda = results.filter(row => {
      if (seenSedaIds.has(row.bubble_id!)) return false;
      seenSedaIds.add(row.bubble_id!);
      return true;
    });

    // Enrich SEDA records with calculations
    const enrichedSeda = uniqueSeda.map(seda => {
      const hasName = !!seda.customer_name;
      const hasAddress = !!seda.installation_address;
      const hasMykad = !!(seda.mykad_pdf || seda.ic_copy_front);
      const hasBills = !!(seda.tnb_bill_1 || seda.tnb_bill_2 || seda.tnb_bill_3);
      const hasMeter = !!seda.tnb_meter;
      const hasEmergency = !!(seda.e_contact_name && seda.e_contact_no && seda.e_contact_relationship);
      const hasRequiredPayment = parseFloat(seda.percent_of_total_amount || "0") >= 4;

      const completed_count = [hasName, hasAddress, hasMykad, hasBills, hasMeter, hasEmergency, hasRequiredPayment].filter(Boolean).length;
      const is_form_completed = completed_count === 7;

      return {
        ...seda,
        seda_status: seda.seda_status || "Pending", // Treat null as Pending
        percent_of_total_amount: parseFloat(seda.percent_of_total_amount || "0"),
        completed_count,
        is_form_completed,
        has_required_payment: hasRequiredPayment
      };
    });

    // Filter by search/status remaining in JS
    let filtered = enrichedSeda;

    if (statusFilter && statusFilter.toLowerCase() !== "all") {
      filtered = filtered.filter(s => s.seda_status === statusFilter);
    }

    if (agentUserIdFilter) {
      filtered = filtered.filter(s => s.agent_user_id === agentUserIdFilter);
    }

    if (searchQuery) {
      filtered = filtered.filter(s =>
        (s.installation_address?.toLowerCase().includes(searchQuery)) ||
        (s.ic_no?.toLowerCase().includes(searchQuery)) ||
        (s.tin_number?.toLowerCase().includes(searchQuery)) ||
        (s.email?.toLowerCase().includes(searchQuery)) ||
        (s.customer_name?.toLowerCase().includes(searchQuery)) ||
        (s.agent_user_id?.toLowerCase().includes(searchQuery)) ||
        (s.agent_user_email?.toLowerCase().includes(searchQuery)) ||
        (s.agent_code?.toLowerCase().includes(searchQuery))
      );
    }

    // Group by seda_status
    const totalCount = filtered.length;
    const offset = (page - 1) * pageSize;
    const paginated = filtered.slice(offset, offset + pageSize);

    const grouped: Record<string, any[]> = {};
    paginated.forEach(seda => {
      const status = seda.seda_status || "Pending";
      if (!grouped[status]) grouped[status] = [];
      grouped[status].push(seda);
    });

    const groups = Object.entries(grouped).map(([status, sedas]) => ({
      seda_status: status,
      count: sedas.length,
      registrations: sedas
    }));

    groups.sort((a, b) => {
      if (a.seda_status === "Pending") return -1;
      if (b.seda_status === "Pending") return 1;
      return a.seda_status.localeCompare(b.seda_status);
    });

    return NextResponse.json({
      groups,
      attentionCount,
      totalCount,
      page,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize),
    });
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
