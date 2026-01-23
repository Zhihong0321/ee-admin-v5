/**
 * API Route: POST /api/sync/payment-save-list
 *
 * Saves a comma-separated list of payment IDs to persistent storage.
 */

import { NextRequest, NextResponse } from "next/server";
import { savePaymentSyncList } from "@/app/sync/actions/payment-operations";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { paymentIds } = body;

    const result = await savePaymentSyncList(paymentIds);

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
