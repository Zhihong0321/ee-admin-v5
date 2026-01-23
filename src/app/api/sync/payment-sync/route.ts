/**
 * API Route: POST /api/sync/payment-sync
 *
 * Syncs payments from Bubble using the saved ID list.
 */

import { NextResponse } from "next/server";
import { syncPaymentsFromBubble } from "@/app/sync/actions/payment-operations";

export async function POST() {
  try {
    const result = await syncPaymentsFromBubble();

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
