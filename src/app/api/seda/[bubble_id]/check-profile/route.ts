import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sedaRegistration } from "@/db/schema";
import { eq } from "drizzle-orm";

const SEDA_MANAGER_API = "https://seda-manager-production.up.railway.app";

interface RouteContext {
  params: Promise<{
    bubble_id: string;
  }>;
}

/**
 * POST /api/seda/[bubble_id]/check-profile
 * Check SEDA profile status via SEDA Manager API
 * Uses the ic_no (MyKad) to search for existing profile
 */
export async function POST(
  request: NextRequest,
  { params }: RouteContext
) {
  try {
    const { bubble_id } = await params;

    // 1. Get the seda_registration record to get ic_no
    const records = await db
      .select({
        id: sedaRegistration.id,
        bubble_id: sedaRegistration.bubble_id,
        ic_no: sedaRegistration.ic_no,
        email: sedaRegistration.email,
      })
      .from(sedaRegistration)
      .where(eq(sedaRegistration.bubble_id, bubble_id))
      .limit(1);

    if (records.length === 0) {
      return NextResponse.json(
        { error: "SEDA registration not found" },
        { status: 404 }
      );
    }

    const record = records[0];
    const mykad = record.ic_no;

    if (!mykad) {
      // Update status to indicate no IC number
      await db
        .update(sedaRegistration)
        .set({
          seda_profile_status: "no_ic",
          seda_profile_checked_at: new Date(),
        })
        .where(eq(sedaRegistration.bubble_id, bubble_id));

      return NextResponse.json({
        success: false,
        status: "no_ic",
        message: "No IC number found in registration",
      });
    }

    // 2. Call SEDA Manager API to search for profile by IC/MyKad
    let profileStatus = "not_found";
    let profileId: string | null = null;
    let apiResponse: any = null;
    let errorMessage: string | null = null;

    try {
      const response = await fetch(
        `${SEDA_MANAGER_API}/api/v1/profiles/search?registration_number=${encodeURIComponent(mykad)}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(30000),
        }
      );

      apiResponse = await response.json().catch(() => null);

      if (response.ok && Array.isArray(apiResponse) && apiResponse.length > 0) {
        // Profile found
        profileStatus = "profile_created";
        profileId = apiResponse[0]?.id?.toString() || apiResponse[0]?.profile_id?.toString() || null;
      } else if (response.status === 404 || (apiResponse?.detail && apiResponse.detail.includes("No profiles found"))) {
        profileStatus = "not_found";
      } else if (!response.ok) {
        profileStatus = "error";
        errorMessage = apiResponse?.detail || `API returned status ${response.status}`;
      } else {
        profileStatus = "not_found";
      }
    } catch (fetchError: any) {
      profileStatus = "error";
      errorMessage = fetchError.message || "Failed to connect to SEDA Manager API";
    }

    // 3. Update the seda_registration record with the result
    const updateData: any = {
      seda_profile_status: profileStatus,
      seda_profile_checked_at: new Date(),
    };

    if (profileId) {
      updateData.seda_profile_id = profileId;
    }

    await db
      .update(sedaRegistration)
      .set(updateData)
      .where(eq(sedaRegistration.bubble_id, bubble_id));

    return NextResponse.json({
      success: true,
      status: profileStatus,
      profile_id: profileId,
      checked_at: new Date().toISOString(),
      message: getStatusMessage(profileStatus),
      error: errorMessage,
      api_response: apiResponse,
    });

  } catch (error: any) {
    console.error(error);
    return NextResponse.json(
      {
        error: "Failed to check SEDA profile",
        message: error.message,
      },
      { status: 500 }
    );
  }
}

function getStatusMessage(status: string): string {
  switch (status) {
    case "profile_created":
      return "Profile found in SEDA Manager";
    case "not_found":
      return "Profile not found in SEDA Manager";
    case "no_ic":
      return "No IC number in registration";
    case "error":
      return "Error checking SEDA Manager";
    default:
      return "Unknown status";
  }
}
