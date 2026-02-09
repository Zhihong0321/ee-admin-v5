import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sedaRegistration, customers } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * POST /api/seda/create-profile
 * Creates a SEDA profile by calling the external SEDA manager API
 */
export async function POST(request: NextRequest) {
    try {
        const { seda_bubble_id } = await request.json();

        if (!seda_bubble_id) {
            return NextResponse.json({ error: "seda_bubble_id is required" }, { status: 400 });
        }

        console.log("Creating SEDA profile for registration:", seda_bubble_id);

        // Fetch SEDA and Customer data
        const result = await db
            .select({
                seda: sedaRegistration,
                customer: customers,
            })
            .from(sedaRegistration)
            .leftJoin(customers, eq(sedaRegistration.linked_customer, customers.customer_id))
            .where(eq(sedaRegistration.bubble_id, seda_bubble_id))
            .limit(1);

        if (result.length === 0) {
            return NextResponse.json({ error: "SEDA registration not found" }, { status: 404 });
        }

        const { seda, customer } = result[0];

        // Helper to get non-empty value or default
        const getValue = (val: string | null | undefined, defaultValue: string = "-") => {
            if (!val || val.trim() === "") return defaultValue;
            return val.trim();
        };

        // Normalize IC
        const normalizeIC = (ic: string | null | undefined) => {
            if (!ic) return "-";
            return ic.replace(/\D/g, ''); // Digits only as per working examples
        };

        // Normalize Phone
        const normalizePhone = (phone: string | null | undefined, defaultVal: string = "0123456789") => {
            if (!phone) return defaultVal;
            return phone.replace(/\D/g, '');
        };

        // Split Address
        const fullAddress = getValue(seda.installation_address || customer?.address || "").toUpperCase();
        const address_line_1 = fullAddress.substring(0, 40);
        const address_line_2 = fullAddress.substring(40, 80) || "MALAYSIA";

        // Extract postcode from address if missing
        let postcodeValue = getValue(customer?.postcode || "", "50000");
        if (postcodeValue === "50000" && fullAddress.match(/\b\d{5}\b/)) {
            const match = fullAddress.match(/\b\d{5}\b/);
            if (match) postcodeValue = match[0];
        }

        // Prepare ProfileUpdate object for SEDA API
        const profileData = {
            salutation: "MR",
            name: getValue(customer?.name || "").toUpperCase(),
            citizenship: "Malaysian",
            mykad_passport: normalizeIC(seda.ic_no || customer?.ic_number || ""),
            email: getValue(seda.email || customer?.email || "no-email@example.com").toLowerCase(),
            address_line_1,
            address_line_2,
            address_line_3: "",
            postcode: postcodeValue,
            town: getValue(seda.city || customer?.city || "KUALA LUMPUR").toUpperCase(),
            state: getValue(seda.state || customer?.state || "SELANGOR").toUpperCase(),
            mobile: normalizePhone(customer?.phone || seda.e_contact_no),
            phone: normalizePhone(customer?.phone),
            contact_salutation: "MR",
            contact_name: getValue(seda.e_contact_name || "EMERGENCY CONTACT").toUpperCase(),
            contact_mykad_passport: normalizeIC(seda.e_contact_mykad || "800101145001"),
            contact_citizenship: "Malaysian",
            contact_relationship: getValue(seda.e_contact_relationship || "FRIEND").toUpperCase(),
            contact_email: "no-email@example.com",
            contact_mobile: normalizePhone(seda.e_contact_no),
        };

        console.log("Sending profile data to SEDA API:", profileData);

        // Call External API
        // The endpoint is POST /api/v1/profiles/ as per openapi.json
        const apiResponse = await fetch("https://seda-manager-production.up.railway.app/api/v1/profiles/", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(profileData),
        });

        if (!apiResponse.ok) {
            const errorText = await apiResponse.text();
            let errorData;
            try {
                errorData = JSON.parse(errorText);
            } catch (e) {
                errorData = { message: errorText };
            }

            console.error("SEDA API Error:", errorData);
            return NextResponse.json({
                error: "SEDA API call failed",
                details: errorData
            }, { status: apiResponse.status });
        }

        const responseData = await apiResponse.json();
        console.log("SEDA API Success Response:", responseData);

        // Check success flag
        if (responseData.success === false) {
            return NextResponse.json({
                error: "SEDA API reported failure",
                message: responseData.message || "Unknown error"
            }, { status: 400 });
        }

        // Extract the profile ID from the response according to new OpenAPI schema
        const profile_id = responseData.profile_id || responseData.id || responseData.profile_id_text || responseData._id;

        if (!profile_id) {
            console.warn("Profile ID not found in API response, using full response as string");
        }

        const finalProfileId = profile_id ? profile_id.toString() : JSON.stringify(responseData);

        // Update Database
        const updated = await db
            .update(sedaRegistration)
            .set({
                seda_profile: finalProfileId,
                updated_at: new Date(),
            })
            .where(eq(sedaRegistration.bubble_id, seda_bubble_id))
            .returning();

        return NextResponse.json({
            success: true,
            profile_id: finalProfileId,
            data: updated[0],
            message: "Profile created and linked successfully"
        });

    } catch (error: any) {
        console.error("Create Profile Error:", error);
        return NextResponse.json({
            error: "Internal server error",
            message: error.message
        }, { status: 500 });
    }
}
