import { NextResponse } from "next/server";
import { patchAllInvoicePercentages } from "@/app/sync/actions/payment-operations";

/**
 * API Route: POST /api/sync/patch-payment-percentages
 * Force-patches all invoice percentages based on linked payments.
 */
export async function POST() {
  try {
    const result = await patchAllInvoicePercentages();
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
