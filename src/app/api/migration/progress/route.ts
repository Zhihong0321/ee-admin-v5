import { getProgress } from "@/lib/progress-tracker";
import { NextRequest, NextResponse } from "next/server";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/migration/progress?sessionId=xxx
 * Get migration progress (polling endpoint)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json({
      success: false,
      error: 'sessionId is required'
    }, { status: 400 });
  }

  const progress = getProgress(sessionId);

  if (!progress) {
    return NextResponse.json({
      success: false,
      error: 'Session not found'
    }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    progress
  });
}
