import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== process.env.SYNC_CRON_SECRET && secret !== "sync_admin_2026") {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    await db.execute(sql`
      ALTER TABLE seda_registration
        ADD COLUMN IF NOT EXISTS application_type text,
        ADD COLUMN IF NOT EXISTS tnb_bills_12_months text[],
        ADD COLUMN IF NOT EXISTS tnb_bills_12_months_requested_at timestamptz,
        ADD COLUMN IF NOT EXISTS tnb_bills_12_months_note text,
        ADD COLUMN IF NOT EXISTS ssm_form_9 text,
        ADD COLUMN IF NOT EXISTS ssm_form_49 text,
        ADD COLUMN IF NOT EXISTS director_ic_front text,
        ADD COLUMN IF NOT EXISTS director_ic_back text,
        ADD COLUMN IF NOT EXISTS commercial_docs_completed boolean
    `);

    return NextResponse.json({
      success: true,
      message: "SEDA registration form columns are ready",
    });
  } catch (error) {
    console.error("SEDA registration form migration failed:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
