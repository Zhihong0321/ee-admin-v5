import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoices, sedaRegistration } from "@/db/schema";
import { gt, sql, or, eq, and } from "drizzle-orm";

/**
 * GET /api/seda/attention-count
 * Count invoices needing attention: payment > 0% AND reg_status != APPROVED
 */
export async function GET(request: NextRequest) {
  try {
    const result = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(invoices)
      .leftJoin(sedaRegistration, eq(invoices.linked_seda_registration, sedaRegistration.bubble_id))
      .where(
        and(
          gt(invoices.percent_of_total_amount, '0'),
          or(
            isNull(sedaRegistration.reg_status),
            sql`${sedaRegistration.reg_status} != 'APPROVED'`
          )
        )
      );

    const count = result[0]?.count || 0;

    return NextResponse.json({ count });
  } catch (error: any) {
    console.error("Error fetching attention count:", error);
    return NextResponse.json({ count: 0 }, { status: 500 });
  }
}
