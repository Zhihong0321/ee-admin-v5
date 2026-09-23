import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sedaRegistration, customers, invoices, users } from "@/db/schema";
import { desc, eq, sql, or, and, isNull, gte, ilike } from "drizzle-orm";

function normalizeSedaStatus(raw: string | null | undefined): string {
  const value = (raw || "").trim().toLowerCase();
  if (!value || value === "pending" || value === "not set") return "Pending";
  if (value === "submitted") return "Submitted";
  if (value === "approved" || value === "approved by seda") return "Approved";
  return (raw || "").trim();
}

function statusFilterCondition(statusFilter: string | null) {
  if (!statusFilter || statusFilter.toLowerCase() === "all") return undefined;

  const status = statusFilter.toLowerCase();
  if (status === "pending") {
    return or(
      isNull(sedaRegistration.seda_status),
      sql`${sedaRegistration.seda_status} = ''`,
      sql`LOWER(${sedaRegistration.seda_status}) = 'pending'`,
      sql`LOWER(${sedaRegistration.seda_status}) = 'not set'`
    );
  }
  if (status === "submitted") {
    return sql`LOWER(${sedaRegistration.seda_status}) = 'submitted'`;
  }
  if (status === "approved") {
    return or(
      sql`LOWER(${sedaRegistration.seda_status}) = 'approved'`,
      sql`LOWER(${sedaRegistration.seda_status}) = 'approved by seda'`
    );
  }
  return sql`LOWER(${sedaRegistration.seda_status}) = ${status}`;
}

const statusKeySql = sql<string>`CASE
  WHEN ${sedaRegistration.seda_status} IS NULL
    OR BTRIM(${sedaRegistration.seda_status}) = ''
    OR LOWER(${sedaRegistration.seda_status}) IN ('pending', 'not set')
  THEN 'Pending'
  WHEN LOWER(${sedaRegistration.seda_status}) = 'submitted' THEN 'Submitted'
  WHEN LOWER(${sedaRegistration.seda_status}) IN ('approved', 'approved by seda') THEN 'Approved'
  ELSE ${sedaRegistration.seda_status}
END`;

/**
 * GET /api/seda/registrations
 * Fetch SEDA registrations - optimized for list view
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const statusFilter = searchParams.get("status");
    const searchValue = searchParams.get("search")?.trim() || "";
    const agentUserIdFilter = searchParams.get("agent_user_id") || searchParams.get("user_id");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get("pageSize") || "50")));

    const likePattern = searchValue ? `%${searchValue}%` : "";
    const searchCondition = searchValue
      ? or(
          ilike(sedaRegistration.installation_address, likePattern),
          ilike(sedaRegistration.ic_no, likePattern),
          ilike(sedaRegistration.email, likePattern),
          ilike(customers.name, likePattern),
          ilike(sedaRegistration.agent, likePattern),
          ilike(users.email, likePattern),
          ilike(users.agent_code, likePattern),
          ilike(sedaRegistration.bubble_id, likePattern),
          ilike(invoices.invoice_number, likePattern)
        )
      : undefined;

    const whereClause = and(
      gte(invoices.percent_of_total_amount, "4"),
      statusFilterCondition(statusFilter),
      searchCondition,
      agentUserIdFilter ? eq(sedaRegistration.agent, agentUserIdFilter) : undefined
    );

    const invoiceSedaJoin = or(
      eq(invoices.linked_seda_registration, sedaRegistration.bubble_id),
      sql`${invoices.bubble_id} = ANY(${sedaRegistration.linked_invoice})`
    );

    const [results, attentionResult, countResult, statusCountResult] = await Promise.all([
      db
        .select({
          id: sedaRegistration.id,
          bubble_id: sedaRegistration.bubble_id,
          application_type: sedaRegistration.application_type,
          seda_status: sedaRegistration.seda_status,
          nem_type: sedaRegistration.nem_type,
          installation_address: sedaRegistration.installation_address,
          installation_address_1: sedaRegistration.installation_address_1,
          installation_address_2: sedaRegistration.installation_address_2,
          postcode: sedaRegistration.postcode,
          city: sedaRegistration.city,
          state: sedaRegistration.state,
          latitude: sedaRegistration.latitude,
          longitude: sedaRegistration.longitude,
          ic_no: sedaRegistration.ic_no,
          // The live EE Admin database does not currently have this column.
          // Keep the response shape stable for the UI without selecting it.
          tin_number: sql<string | null>`NULL`,
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
          tnb_bills_12_months: sedaRegistration.tnb_bills_12_months,
          tnb_meter: sedaRegistration.tnb_meter,
          ssm_form_9: sedaRegistration.ssm_form_9,
          ssm_form_49: sedaRegistration.ssm_form_49,
          director_ic_front: sedaRegistration.director_ic_front,
          director_ic_back: sedaRegistration.director_ic_back,
          company_registration_no: sedaRegistration.company_registration_no,
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
        .innerJoin(sedaRegistration, invoiceSedaJoin)
        .leftJoin(customers, eq(invoices.linked_customer, customers.customer_id))
        .leftJoin(users, eq(sedaRegistration.agent, users.bubble_id))
        .where(whereClause)
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

      db
        .select({ count: sql<number>`COUNT(DISTINCT ${sedaRegistration.bubble_id})` })
        .from(invoices)
        .innerJoin(sedaRegistration, invoiceSedaJoin)
        .leftJoin(customers, eq(invoices.linked_customer, customers.customer_id))
        .leftJoin(users, eq(sedaRegistration.agent, users.bubble_id))
        .where(whereClause),

      db
        .select({
          seda_status: statusKeySql,
          count: sql<number>`COUNT(DISTINCT ${sedaRegistration.bubble_id})`,
        })
        .from(invoices)
        .innerJoin(sedaRegistration, invoiceSedaJoin)
        .leftJoin(customers, eq(invoices.linked_customer, customers.customer_id))
        .leftJoin(users, eq(sedaRegistration.agent, users.bubble_id))
        .where(whereClause)
        .groupBy(statusKeySql),
    ]);

    const attentionCount = Number(attentionResult[0]?.count || 0);
    const totalCount = Number(countResult[0]?.count || 0);
    const statusCountMap = new Map<string, number>();
    for (const row of statusCountResult) {
      statusCountMap.set(normalizeSedaStatus(row.seda_status), Number(row.count || 0));
    }

    // Remove duplicates if multiple invoices point to the same SEDA registration
    const seenSedaIds = new Set<string>();
    const uniqueSeda = results.filter(row => {
      if (!row.bubble_id || seenSedaIds.has(row.bubble_id)) return false;
      seenSedaIds.add(row.bubble_id);
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
      const applicationType = String(seda.application_type || "").toLowerCase();
      const nemType = String(seda.nem_type || "").toLowerCase();
      const isCommercial =
        applicationType === "commercial" ||
        nemType.includes("commercial") ||
        nemType.includes("nova") ||
        !!seda.company_registration_no;
      const hasCommercialDocs = !!(seda.ssm_form_9 && seda.ssm_form_49 && seda.director_ic_front && seda.director_ic_back);

      const checklist = [hasName, hasAddress, hasMykad, hasBills, hasMeter, hasEmergency, hasRequiredPayment];
      if (isCommercial) checklist.push(hasCommercialDocs);
      const completed_count = checklist.filter(Boolean).length;
      const is_form_completed = completed_count === checklist.length;

      return {
        ...seda,
        seda_status: normalizeSedaStatus(seda.seda_status),
        percent_of_total_amount: parseFloat(seda.percent_of_total_amount || "0"),
        completed_count,
        total_checkpoints: checklist.length,
        is_form_completed,
        has_required_payment: hasRequiredPayment
      };
    });

    const grouped: Record<string, typeof enrichedSeda> = {};
    enrichedSeda.forEach(seda => {
      const status = seda.seda_status || "Pending";
      if (!grouped[status]) grouped[status] = [];
      grouped[status].push(seda);
    });

    const groups = Object.entries(grouped).map(([status, sedas]) => ({
      seda_status: status,
      count: statusCountMap.get(status) ?? sedas.length,
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
      totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
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
