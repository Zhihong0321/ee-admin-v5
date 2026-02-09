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
    console.log("Checking SEDA profile for:", bubble_id);

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

    // 2. Call SEDA Manager API to check profile by MyKad
    console.log("Calling SEDA Manager API for MyKad:", mykad);

    let profileStatus = "not_found";
    let profileId: string | null = null;
    let apiResponse: any = null;
    let errorMessage: string | null = null;

    try {
      const response = await fetch(
        `${SEDA_MANAGER_API}/api/v1/mapper/by-mykad/${encodeURIComponent(mykad)}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          // 30 second timeout
          signal: AbortSignal.timeout(30000),
        }
      );

      if (response.ok) {
        apiResponse = await response.json();
        console.log("SEDA Manager API response:", JSON.stringify(apiResponse).substring(0, 500));

        // Check if profile exists in response
        if (apiResponse && (apiResponse.profile_id || apiResponse.id || apiResponse.data)) {
          profileStatus = "profile_created";
          profileId = apiResponse.profile_id || apiResponse.id || null;
        } else if (apiResponse && Object.keys(apiResponse).length > 0) {
          // Has some data, consider it as profile found
          profileStatus = "profile_created";
          profileId = apiResponse.profile_id || apiResponse.id || null;
        } else {
          profileStatus = "not_found";
        }
      } else if (response.status === 404) {
        profileStatus = "not_found";
        console.log("Profile not found in SEDA Manager");
      } else {
        profileStatus = "error";
        errorMessage = `API returned status ${response.status}`;
        console.error("SEDA Manager API error:", response.status, response.statusText);
      }
    } catch (fetchError: any) {
      console.error("Error calling SEDA Manager API:", fetchError);
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

    console.log("Updated SEDA profile status:", profileStatus);

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
    console.error("Error checking SEDA profile:", error);
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
