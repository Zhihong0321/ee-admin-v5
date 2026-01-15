import { getMigrationStats } from "@/lib/file-migration";
import { NextResponse } from "next/server";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/migration/stats
 * Get migration statistics without running migration
 * Shows how many files need to be migrated
 */
export async function GET() {
  try {
    const stats = await getMigrationStats();

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
