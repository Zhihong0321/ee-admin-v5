/**
 * API Route: POST /api/sync/payment-reset
 *
 * Resets the payment table by deleting all files and truncating the table.
 */

import { NextRequest, NextResponse } from "next/server";
import { resetPaymentTable } from "@/app/sync/actions/payment-operations";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { confirmDelete } = body;

    const result = await resetPaymentTable(confirmDelete);

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
