import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sedaRegistration, customers } from "@/db/schema";
import { eq } from "drizzle-orm";

const SEDA_MANAGER_API = "https://seda-manager-production.up.railway.app";

interface RouteContext {
  params: Promise<{
    bubble_id: string;
  }>;
}

/**
 * POST /api/seda/[bubble_id]/create-profile
 * Create SEDA profile via SEDA Manager API
 * Uses the registration data to create a new profile
 */
export async function POST(
  request: NextRequest,
  { params }: RouteContext
) {
  try {
    const { bubble_id } = await params;

    // 1. Get the seda_registration record with customer data
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

    const { seda, customer_name } = records[0];

    if (!seda.ic_no) {
      return NextResponse.json(
        { error: "IC number is required to create profile" },
        { status: 400 }
      );
    }

    // 2. Build the profile data from registration
    const profileData = {
      name: customer_name || seda.email?.split('@')[0] || "Unknown",
      registration_number: seda.ic_no,
      type: "individual",
      email: seda.email || null,
      phone: seda.e_contact_no || null,
      address: seda.installation_address || null,
      city: seda.city || null,
      state: seda.state || null,
      // Additional fields that might be needed
      ic_number: seda.ic_no,
    };

    // 3. Call SEDA Manager API to create profile
    let profileId: string | null = null;
    let apiResponse: any = null;
    let errorMessage: string | null = null;

    try {
      const response = await fetch(
        `${SEDA_MANAGER_API}/api/v1/profiles/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(profileData),
          signal: AbortSignal.timeout(30000),
        }
      );

      apiResponse = await response.json().catch(() => null);

      if (response.ok) {
        profileId = apiResponse?.profile_id || apiResponse?.id || null;

        // Update the seda_registration with the new profile info
        await db
          .update(sedaRegistration)
          .set({
            seda_profile_status: "profile_created",
            seda_profile_id: profileId,
            seda_profile_checked_at: new Date(),
          })
          .where(eq(sedaRegistration.bubble_id, bubble_id));

        return NextResponse.json({
          success: true,
          status: "profile_created",
          profile_id: profileId,
          message: "Profile created successfully in SEDA Manager",
          api_response: apiResponse,
        });
      } else {
        errorMessage = apiResponse?.detail || apiResponse?.message || `API returned status ${response.status}`;

        return NextResponse.json({
          success: false,
          status: "error",
          message: errorMessage,
          api_response: apiResponse,
        }, { status: response.status });
      }
    } catch (fetchError: any) {
      console.error(fetchError);
      return NextResponse.json({
        success: false,
        status: "error",
        message: fetchError.message || "Failed to connect to SEDA Manager API",
      }, { status: 500 });
    }

  } catch (error: any) {
    console.error(error);
    return NextResponse.json(
      {
        error: "Failed to create SEDA profile",
        message: error.message,
      },
      { status: 500 }
    );
  }
}
