import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sedaRegistration, customers } from "@/db/schema";
import { desc, ne, eq, sql } from "drizzle-orm";

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

    console.log("SEDA API called with:", { statusFilter, searchQuery });

    // Fetch SEDA with customer name via LEFT JOIN
    const allSeda = await db
      .select({
        id: sedaRegistration.id,
        bubble_id: sedaRegistration.bubble_id,
        reg_status: sedaRegistration.reg_status,
        seda_status: sedaRegistration.seda_status,
        installation_address: sedaRegistration.installation_address,
        city: sedaRegistration.city,
        state: sedaRegistration.state,
        ic_no: sedaRegistration.ic_no,
        email: sedaRegistration.email,
        customer_name: customers.name,
        agent: sedaRegistration.agent,
        modified_date: sedaRegistration.modified_date,
        updated_at: sedaRegistration.updated_at,
        created_date: sedaRegistration.created_date,
      })
      .from(sedaRegistration)
      .leftJoin(customers, eq(sedaRegistration.linked_customer, customers.customer_id))
      .where(ne(sedaRegistration.reg_status, "Deleted"))
      .orderBy(desc(sql`COALESCE(${sedaRegistration.modified_date}, ${sedaRegistration.updated_at}, ${sedaRegistration.created_date})`))
      .limit(100);

    console.log("Fetched SEDA records:", allSeda.length);

    // Filter in JavaScript
    let filtered = allSeda;

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

    console.log("Filtered records:", filtered.length);

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

    console.log("Returning response with", response.length, "groups");

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("SEDA API Error:", error);
    console.error("Error stack:", error.stack);
    return NextResponse.json(
      {
        error: "Failed to fetch SEDA registrations",
        message: error.message,
        stack: error.stack
      },
      { status: 500 }
    );
  }
}
