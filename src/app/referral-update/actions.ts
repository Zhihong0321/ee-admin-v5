"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { customers, referrals } from "@/db/schema";
import { db } from "@/lib/db";
import { verifyReferralUpdateToken } from "@/lib/referral-update-token";

export type PublicReferralLead = {
  id: number;
  name: string | null;
  mobile_number: string | null;
  relationship: string | null;
  project_type: string | null;
};

export async function getReferralUpdateForm(token: string) {
  try {
    const payload = await verifyReferralUpdateToken(token);
    const result = await db
      .select({
        id: referrals.id,
        name: referrals.name,
        mobile_number: referrals.mobile_number,
        relationship: referrals.relationship,
        project_type: referrals.project_type,
        referrer_name: customers.name,
      })
      .from(referrals)
      .leftJoin(customers, eq(customers.customer_id, referrals.linked_customer_profile))
      .where(and(
        inArray(referrals.id, payload.referralIds),
        eq(referrals.linked_customer_profile, payload.referrerCustomerId),
      ))
      .orderBy(referrals.id);

    if (result.length !== payload.referralIds.length) {
      return { success: false as const, error: "This update link is no longer valid." };
    }

    return {
      success: true as const,
      referrerName: result[0]?.referrer_name || "Referrer",
      leads: result.map(({ id, name, mobile_number, relationship, project_type }) => ({
        id,
        name,
        mobile_number,
        relationship,
        project_type,
      })),
    };
  } catch {
    return { success: false as const, error: "This update link is invalid or has expired." };
  }
}

export async function updateReferralDetailsFromLink(
  token: string,
  updates: Array<{
    id: number;
    name: string;
    mobile_number: string;
    relationship: string;
    project_type: string;
  }>,
) {
  try {
    const payload = await verifyReferralUpdateToken(token);
    if (
      !Array.isArray(updates) ||
      updates.length !== payload.referralIds.length ||
      new Set(updates.map((item) => item.id)).size !== updates.length ||
      updates.some((item) => !payload.referralIds.includes(item.id))
    ) {
      return { success: false, error: "The submitted referral details do not match this update link." };
    }

    const normalized = updates.map((item) => ({
      id: item.id,
      name: String(item.name || "").trim(),
      mobile_number: String(item.mobile_number || "").trim(),
      relationship: String(item.relationship || "").trim(),
      project_type: String(item.project_type || "").trim(),
    }));

    await db.transaction(async (tx) => {
      for (const item of normalized) {
        const [current] = await tx
          .select({
            name: referrals.name,
            mobile_number: referrals.mobile_number,
            relationship: referrals.relationship,
            project_type: referrals.project_type,
          })
          .from(referrals)
          .where(and(
            eq(referrals.id, item.id),
            eq(referrals.linked_customer_profile, payload.referrerCustomerId),
          ))
          .for("update");

        if (!current) throw new Error("A referral is no longer linked to this referrer");

        const next = {
          name: current.name?.trim() ? current.name : item.name,
          mobile_number: current.mobile_number?.trim() ? current.mobile_number : item.mobile_number,
          relationship: current.relationship?.trim() ? current.relationship : item.relationship,
          project_type: current.project_type?.trim() ? current.project_type : item.project_type,
        };
        if (
          !next.name || next.name.length > 200 ||
          !next.mobile_number || next.mobile_number.length > 50 ||
          !next.relationship || next.relationship.length > 120 ||
          !next.project_type || next.project_type.length > 120
        ) {
          throw new Error("Please complete all missing fields and check their length");
        }

        const updated = await tx
          .update(referrals)
          .set({
            ...next,
            updated_at: new Date(),
          })
          .where(and(
            eq(referrals.id, item.id),
            eq(referrals.linked_customer_profile, payload.referrerCustomerId),
          ))
          .returning({ id: referrals.id });

        if (updated.length !== 1) throw new Error("A referral is no longer linked to this referrer");
      }
    });

    revalidatePath("/referrals");
    revalidatePath("/referrals/referrers");
    return { success: true };
  } catch (error) {
    console.error("Failed to update referral details from public link:", error);
    return { success: false, error: "We could not save these details. Please ask your contact for a new link." };
  }
}
