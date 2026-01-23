/**
 * API Route: GET /api/sync/payment-problems
 * POST /api/sync/payment-problems
 *
 * GET: Get the list of problematic payment syncs
 * POST: Clear the problem sync list (or specific payment)
 */

import { NextRequest, NextResponse } from "next/server";
import { getProblemSyncList, clearProblemSyncList } from "@/app/sync/actions/payment-operations";

export async function GET() {
  try {
    const result = await getProblemSyncList();
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { paymentId } = body;

    const result = await clearProblemSyncList(paymentId);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
