/**
 * API Route: POST /api/sync/payment-link
 *
 * Links synced payments to their invoices (Step 2).
 */

import { NextResponse } from "next/server";
import { linkPaymentsToInvoices } from "@/app/sync/actions/payment-operations";

export async function POST() {
  try {
    const result = await linkPaymentsToInvoices();

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
