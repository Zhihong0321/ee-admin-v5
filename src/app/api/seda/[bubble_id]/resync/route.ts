import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sedaRegistration } from "@/db/schema";
import { eq } from "drizzle-orm";
import { fetchBubbleRecordByTypeName } from "@/lib/bubble/fetch-helpers";
import { mapSedaRegistrationFields } from "@/lib/complete-bubble-mappings";

interface RouteContext {
  params: Promise<{
    bubble_id: string;
  }>;
}

/**
 * POST /api/seda/[bubble_id]/resync
 *
 * Re-sync a single SEDA registration with Bubble.
 * MERGE strategy: only fill in columns that are currently empty/null in our DB.
 * Existing data is never overwritten.
 */
export async function POST(
  request: NextRequest,
  { params }: RouteContext
) {
  try {
    const { bubble_id } = await params;

    // 1. Fetch local record
    const local = await db.query.sedaRegistration.findFirst({
      where: eq(sedaRegistration.bubble_id, bubble_id),
    });

    if (!local) {
      return NextResponse.json(
        { error: "SEDA registration not found in local database" },
        { status: 404 }
      );
    }

    // 2. Fetch from Bubble
    let bubbleRecord: any;
    try {
      bubbleRecord = await fetchBubbleRecordByTypeName("seda_registration", bubble_id);
    } catch (err) {
      return NextResponse.json(
        { error: "Failed to fetch from Bubble", detail: String(err) },
        { status: 502 }
      );
    }

    if (!bubbleRecord) {
      return NextResponse.json(
        { error: "Record not found in Bubble" },
        { status: 404 }
      );
    }

    // 3. Map Bubble fields to our column names
    const bubbleMapped = mapSedaRegistrationFields(bubbleRecord);

    // 4. Merge: only fill empty/null columns
    // Skip identifiers and metadata that should not be touched
    const SKIP_COLUMNS = new Set([
      "bubble_id",
      "id",
      "created_at",
      "last_synced_at",
      "updated_at",
      "seda_profile_status",
      "seda_profile_id",
      "seda_profile_checked_at",
    ]);

    const mergeData: Record<string, any> = {};
    const filledFields: string[] = [];
    const skippedFields: string[] = [];

    for (const [column, bubbleValue] of Object.entries(bubbleMapped)) {
      if (SKIP_COLUMNS.has(column)) continue;

      const localValue = (local as any)[column];

      // "Empty" = null, undefined, empty string, or empty array
      const localIsEmpty =
        localValue === null ||
        localValue === undefined ||
        localValue === "" ||
        (Array.isArray(localValue) && localValue.length === 0);

      // Bubble value must actually have data
      const bubbleHasData =
        bubbleValue !== null &&
        bubbleValue !== undefined &&
        bubbleValue !== "" &&
        !(Array.isArray(bubbleValue) && bubbleValue.length === 0);

      if (localIsEmpty && bubbleHasData) {
        mergeData[column] = bubbleValue;
        filledFields.push(column);
      } else {
        skippedFields.push(column);
      }
    }

    // 5. Apply merge if there's anything to update
    if (Object.keys(mergeData).length > 0) {
      mergeData.last_synced_at = new Date();
      mergeData.updated_at = new Date();

      await db
        .update(sedaRegistration)
        .set(mergeData)
        .where(eq(sedaRegistration.bubble_id, bubble_id));
    }

    return NextResponse.json({
      success: true,
      filled_count: filledFields.length,
      filled_fields: filledFields,
      skipped_count: skippedFields.length,
      message:
        filledFields.length > 0
          ? `Merged ${filledFields.length} field(s) from Bubble`
          : "No empty fields to fill — local data is already complete",
    });
  } catch (error: any) {
    console.error("Error re-syncing SEDA:", error);
    return NextResponse.json(
      { error: "Failed to re-sync", detail: error?.message },
      { status: 500 }
    );
  }
}
