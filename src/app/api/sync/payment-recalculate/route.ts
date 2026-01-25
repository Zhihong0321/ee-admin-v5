/**
 * API Route: POST /api/sync/payment-recalculate
 *
 * Recalculates invoice payment status (Step 3).
 */

import { NextResponse } from "next/server";
import { recalculateInvoicePaymentStatus } from "@/app/sync/actions/payment-operations";

export async function POST() {
  try {
    const result = await recalculateInvoicePaymentStatus();

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
