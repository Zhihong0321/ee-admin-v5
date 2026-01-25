import { NextRequest, NextResponse } from 'next/server';
import { getSyncProgress } from '@/lib/sync-progress';

export const dynamic = 'force-dynamic';

/**
 * GET /api/sync/progress?sessionId=xxx
 *
 * Simple progress endpoint - returns JSON, no SSE complexity
 * Frontend polls this every 2 seconds
 */
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  }

  try {
    const progress = await getSyncProgress(sessionId);

    if (!progress) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, progress });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch progress' },
      { status: 500 }
    );
  }
}
