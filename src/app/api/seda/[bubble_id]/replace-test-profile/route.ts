import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sedaRegistration, customers } from "@/db/schema";
import { eq } from "drizzle-orm";

const SEDA_MANAGER_API = "https://seda-manager-production.up.railway.app";
const TEST_PROFILE_MYKAD_PATTERN = "02020201";

interface RouteContext {
  params: Promise<{
    bubble_id: string;
  }>;
}

/**
 * POST /api/seda/[bubble_id]/replace-test-profile
 * Replace a test profile in SEDA with current registration data
 *
 * 1. Search for test profiles (mykad contains 02020201)
 * 2. Pick the first one
 * 3. Update it with current registration data via mapper
 */
export async function POST(
  request: NextRequest,
  { params }: RouteContext
) {
  try {
    const { bubble_id } = await params;
    console.log("Replace test profile for:", bubble_id);

    // 1. Get the seda_registration record
    const records = await db
      .select({
        seda: sedaRegistration,
        customer_name: customers.name,
      })
      .from(sedaRegistration)
      .leftJoin(customers, eq(sedaRegistration.linked_customer, customers.customer_id))
      .where(eq(sedaRegistration.bubble_id, bubble_id))
      .limit(1);

    if (records.length === 0) {
      return NextResponse.json(
        { error: "SEDA registration not found" },
        { status: 404 }
      );
    }

    const { seda } = records[0];
    const mykad = seda.ic_no;

    if (!mykad) {
      return NextResponse.json(
        { error: "IC number is required" },
        { status: 400 }
      );
    }

    // 2. Search for test profiles
    console.log("Searching for test profiles...");
    const searchResponse = await fetch(
      `${SEDA_MANAGER_API}/api/v1/profiles/search?registration_number=${TEST_PROFILE_MYKAD_PATTERN}`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(30000),
      }
    );

    const searchResult = await searchResponse.json();
    console.log("Test profile search result:", JSON.stringify(searchResult).substring(0, 500));

    if (!searchResult.profiles || searchResult.profiles.length === 0) {
      return NextResponse.json({
        success: false,
        error: "No test profiles available",
        message: "No test profiles found with mykad pattern 02020201",
      }, { status: 404 });
    }

    const testProfile = searchResult.profiles[0];
    const testProfileId = testProfile.id;
    console.log("Found test profile:", testProfileId, testProfile.name);

    // 3. Get mapped data for the current registration
    console.log("Getting mapped data for IC:", mykad);
    const mapperResponse = await fetch(
      `${SEDA_MANAGER_API}/api/v1/mapper/by-mykad/${encodeURIComponent(mykad)}`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(30000),
      }
    );

    if (!mapperResponse.ok) {
      return NextResponse.json({
        success: false,
        error: "Failed to get registration data",
        message: `Mapper API returned ${mapperResponse.status}`,
      }, { status: 500 });
    }

    const mapperData = await mapperResponse.json();
    console.log("Mapper data:", JSON.stringify(mapperData).substring(0, 500));

    if (!mapperData.mapped_to_seda) {
      return NextResponse.json({
        success: false,
        error: "No mapped data available",
        message: "Registration data could not be mapped to SEDA format",
      }, { status: 400 });
    }

    // 4. Update the test profile with new data
    console.log("Updating test profile", testProfileId, "with new data...");
    const updateResponse = await fetch(
      `${SEDA_MANAGER_API}/api/v1/profiles/${testProfileId}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mapperData.mapped_to_seda),
        signal: AbortSignal.timeout(60000),
      }
    );

    const updateResult = await updateResponse.json().catch(() => null);
    console.log("Update response:", updateResponse.status, JSON.stringify(updateResult).substring(0, 500));

    if (!updateResponse.ok) {
      return NextResponse.json({
        success: false,
        error: "Failed to update test profile",
        message: updateResult?.detail || updateResult?.message || `API returned ${updateResponse.status}`,
        api_response: updateResult,
      }, { status: 500 });
    }

    // 5. Update our database with the profile ID
    await db
      .update(sedaRegistration)
      .set({
        seda_profile_status: "profile_created",
        seda_profile_id: testProfileId.toString(),
        seda_profile_checked_at: new Date(),
      })
      .where(eq(sedaRegistration.bubble_id, bubble_id));

    console.log("Successfully replaced test profile", testProfileId);

    return NextResponse.json({
      success: true,
      message: `Test profile ${testProfileId} replaced with registration data`,
      profile_id: testProfileId,
      profile_url: testProfile.url || `https://atap.seda.gov.my/profiles/individuals/${testProfileId}/edit`,
      previous_name: testProfile.name,
    });

  } catch (error: any) {
    console.error("Error replacing test profile:", error);
    return NextResponse.json(
      {
        error: "Failed to replace test profile",
        message: error.message,
      },
      { status: 500 }
    );
  }
}
