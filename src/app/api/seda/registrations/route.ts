import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sedaRegistration } from "@/db/schema";
import { desc, ne } from "drizzle-orm";

/**
 * GET /api/seda/registrations
 * Fetch SEDA registrations - simplified version
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const statusFilter = searchParams.get("status");
    const searchQuery = searchParams.get("search").toLowerCase();

    console.log("SEDA API called with:", { statusFilter, searchQuery });

    // Simple query first - just SEDA table
    const allSeda = await db
      .select()
      .from(sedaRegistration)
      .where(ne(sedaRegistration.reg_status, "Deleted"))
      .orderBy(desc(sedaRegistration.created_date))
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
      registrations: sedas.map(s => ({
        ...s,
        customer_name: null, // Will be filled in next step
        checkpoints: {
          name: false,
          address: !!s.installation_address,
          mykad: !!(s.mykad_pdf || s.ic_copy_front),
          tnb_bill: !!(s.tnb_bill_1 && s.tnb_bill_2 && s.tnb_bill_3),
          tnb_meter: !!s.tnb_meter,
          emergency_contact: !!(s.e_contact_name && s.e_contact_no && s.e_contact_relationship),
          payment_5percent: false, // Will calculate with invoice
        },
        completed_count: 0,
        progress_percentage: 0,
      }))
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
