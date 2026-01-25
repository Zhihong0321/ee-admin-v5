import { getMigrationStats } from "@/lib/file-migration";
import { NextResponse } from "next/server";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/migration/stats?createdAfter=2024-01-01
 * Get migration statistics without running migration
 * Shows how many files need to be migrated
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const createdAfter = searchParams.get('createdAfter') || undefined;

    const stats = await getMigrationStats(createdAfter);

    return NextResponse.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Failed to get migration stats:', error);
    return NextResponse.json(
      {
        success: false,
        error: String(error)
      },
      { status: 500 }
    );
  }
}
