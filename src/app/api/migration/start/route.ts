import { migrateAllBubbleFiles } from "@/lib/file-migration";
import { createProgressSession } from "@/lib/progress-tracker";
import { NextRequest, NextResponse } from "next/server";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/migration/start
 * Start comprehensive file migration from Bubble URLs to local storage
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { sessionId } = body;

    // Create progress session if not provided
    const migrationSessionId = sessionId || `migration_${Date.now()}`;
    createProgressSession(migrationSessionId);

    // Start migration in background (don't await)
    migrateAllBubbleFiles(migrationSessionId).catch((error) => {
      console.error('Migration error:', error);
    });

    return NextResponse.json({
      success: true,
      sessionId: migrationSessionId,
      message: 'File migration started',
      progressUrl: `/api/migration/progress?sessionId=${migrationSessionId}`
    });
  } catch (error) {
    console.error('Failed to start migration:', error);
    return NextResponse.json(
      {
        success: false,
        error: String(error)
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/migration/start
 * Check if a migration is currently running
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

  return NextResponse.json({
    success: true,
    hasSession: true,
    message: 'Use /api/migration/progress for real-time updates'
  });
}
