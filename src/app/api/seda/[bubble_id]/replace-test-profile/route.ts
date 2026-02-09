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
 * Derive salutation from MyKad number
 * Last digit odd = Mr, even = Ms
 */
function getSalutation(mykad: string): string {
  const lastDigit = parseInt(mykad.slice(-1), 10);
  return lastDigit % 2 === 1 ? "Mr" : "Ms";
}

/**
 * Split address into lines (max 3 lines)
 */
function splitAddress(address: string | null): { line1: string; line2: string; line3: string } {
  if (!address) return { line1: "", line2: "", line3: "" };

  const parts = address.split(",").map(p => p.trim());
  return {
    line1: parts[0] || "",
    line2: parts[1] || "",
    line3: parts.slice(2).join(", ") || "",
  };
}

/**
 * POST /api/seda/[bubble_id]/replace-test-profile
 * Replace a test profile in SEDA with current registration data
 *
 * Endpoint: PUT /api/v1/profiles/{profile_id}
 */
export async function POST(
  request: NextRequest,
  { params }: RouteContext
) {
  try {
    const { bubble_id } = await params;
    console.log("Replace test profile for:", bubble_id);

    // 1. Get the seda_registration record with customer data
    const records = await db
      .select({
        seda: sedaRegistration,
        customer_name: customers.name,
        customer_phone: customers.phone,
        customer_postcode: customers.postcode,
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

    const { seda, customer_name, customer_phone, customer_postcode } = records[0];
    const mykad = seda.ic_no;

    if (!mykad) {
      return NextResponse.json(
        { error: "IC number is required" },
        { status: 400 }
      );
    }

    // Extract postcode from installation_address if not in customer
    let postcode = customer_postcode || "";
    if (!postcode && seda.installation_address) {
      const postcodeMatch = seda.installation_address.match(/\b(\d{5})\b/);
      if (postcodeMatch) postcode = postcodeMatch[1];
    }

    // 2. Search for test profiles
    console.log("Searching for test profiles with pattern:", TEST_PROFILE_MYKAD_PATTERN);
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

    // 3. Build profile data from seda_registration
    const address = splitAddress(seda.installation_address);
    const salutation = getSalutation(mykad);
    // Get emergency contact salutation from their mykad if available
    const contactMykad = seda.e_contact_mykad || mykad;
    const contactSalutation = getSalutation(contactMykad);

    const profileData = {
      // Owner info
      salutation: salutation,
      name: customer_name || seda.email?.split("@")[0] || "Unknown",
      citizenship: "Malaysian",
      mykad_passport: mykad,
      email: seda.email || "",
      address_line_1: address.line1,
      address_line_2: address.line2,
      address_line_3: address.line3,
      postcode: postcode,
      town: seda.city || "",
      state: seda.state || "",
      phone: "",
      mobile: customer_phone || seda.e_contact_no || "",

      // Emergency contact info
      contact_salutation: contactSalutation,
      contact_name: seda.e_contact_name || "",
      contact_mykad_passport: contactMykad,
      contact_citizenship: "Malaysian",
      contact_relationship: seda.e_contact_relationship || "",
      contact_email: seda.e_email || seda.email || "",
      contact_phone: "",
      contact_mobile: seda.e_contact_no || "",
    };

    console.log("Profile data to send:", JSON.stringify(profileData));

    // 4. Update the test profile with PUT /api/v1/profiles/{profile_id}
    console.log("Calling PUT /api/v1/profiles/" + testProfileId);
    const updateResponse = await fetch(
      `${SEDA_MANAGER_API}/api/v1/profiles/${testProfileId}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileData),
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

    // 5. Get the new profile_id (SEDA may return a new one)
    const newProfileId = updateResult?.profile_id || updateResult?.id || testProfileId;

    // 6. Update our database with the profile ID
    await db
      .update(sedaRegistration)
      .set({
        seda_profile_status: "profile_created",
        seda_profile_id: newProfileId.toString(),
        seda_profile_checked_at: new Date(),
      })
      .where(eq(sedaRegistration.bubble_id, bubble_id));

    console.log("Successfully replaced test profile, new ID:", newProfileId);

    return NextResponse.json({
      success: true,
      message: `Test profile replaced. New profile ID: ${newProfileId}`,
      profile_id: newProfileId,
      profile_url: `https://atap.seda.gov.my/profiles/individuals/${newProfileId}/edit`,
      previous_profile_id: testProfileId,
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
