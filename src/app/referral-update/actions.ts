"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { customers, referrals } from "@/db/schema";
import { db } from "@/lib/db";
import { verifyReferralUpdateToken } from "@/lib/referral-update-token";

export type PublicReferralReferrer = {
  name: string;
  ic_number: string;
  address: string;
  bank_name: string;
  bank_account: string;
  tin: string;
  phone: string | null;
  registered: boolean;
};

const PLACEHOLDER_NAME = "Referral";

function trimmed(value: unknown) {
  return String(value ?? "").trim();
}

function emptyToNull(value: string) {
  return value ? value : null;
}

function firstFilled(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const text = value?.trim();
    if (text) return text;
  }
  return "";
}

function notesObject(raw: string | null, strict: boolean): Record<string, unknown> {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    if (strict) throw new Error("Referrer notes are not a JSON object");
    return {};
  }
  if (strict) throw new Error("Referrer notes are not a JSON object");
  return {};
}

function noteText(notes: Record<string, unknown>, key: string) {
  const value = notes[key];
  return typeof value === "string" ? value : "";
}

function isRealName(name: string) {
  return Boolean(name) && name !== PLACEHOLDER_NAME;
}

function isRegistered(name: string, bankAccount: string) {
  return isRealName(name) && Boolean(bankAccount);
}

function readReferrer(row: {
  name: string | null;
  ic_number: string | null;
  address: string | null;
  bank_name: string | null;
  bank_account: string | null;
  tin: string | null;
  phone: string | null;
  notes: string | null;
}): PublicReferralReferrer {
  const notes = notesObject(row.notes, false);
  const name = firstFilled(row.name, noteText(notes, "name"));
  const bankAccount = firstFilled(row.bank_account, noteText(notes, "bankAccount"));
  return {
    name: name === PLACEHOLDER_NAME ? "" : name,
    ic_number: firstFilled(row.ic_number, noteText(notes, "icNumber")),
    address: firstFilled(row.address, noteText(notes, "address")),
    bank_name: firstFilled(row.bank_name, noteText(notes, "bankName")),
    bank_account: bankAccount,
    tin: firstFilled(row.tin, noteText(notes, "tin")),
    phone: row.phone?.trim() || null,
    registered: isRegistered(name, bankAccount),
  };
}

function mergeReferralAccountNotes(
  existing: string | null,
  details: {
    name: string;
    bank_name: string | null;
    bank_account: string | null;
    ic_number: string | null;
    tin: string | null;
    address: string | null;
  },
  updatedAt: string,
) {
  const notes = notesObject(existing, true);
  const next: Record<string, unknown> = {
    ...notes,
    kind: "referral_account",
    bankerName: details.bank_name || details.name,
    updatedAt,
  };

  if (details.bank_account) next.bankAccount = details.bank_account;
  else delete next.bankAccount;
  if (details.bank_name) next.bankName = details.bank_name;
  else delete next.bankName;
  if (details.ic_number) next.icNumber = details.ic_number;
  else delete next.icNumber;
  if (details.tin) next.tin = details.tin;
  else delete next.tin;
  if (details.address) next.address = details.address;
  else delete next.address;

  return JSON.stringify(next);
}

export async function getReferralUpdateForm(token: string) {
  try {
    const payload = await verifyReferralUpdateToken(token);
    const linked = await db
      .select({ id: referrals.id })
      .from(referrals)
      .where(and(
        inArray(referrals.id, payload.referralIds),
        eq(referrals.linked_customer_profile, payload.referrerCustomerId),
      ));
    if (linked.length !== payload.referralIds.length) {
      return { success: false as const, error: "This update link is no longer valid." };
    }

    const [customer] = await db
      .select({
        name: customers.name,
        ic_number: customers.ic_number,
        address: customers.address,
        bank_name: customers.bank_name,
        bank_account: customers.bank_account,
        tin: customers.tin,
        phone: customers.phone,
        notes: customers.notes,
      })
      .from(customers)
      .where(eq(customers.customer_id, payload.referrerCustomerId))
      .limit(1);
    if (!customer) {
      return { success: false as const, error: "This update link is no longer valid." };
    }

    return { success: true as const, referrer: readReferrer(customer) };
  } catch {
    return { success: false as const, error: "This update link is invalid or has expired." };
  }
}

export async function updateReferralDetailsFromLink(
  token: string,
  referrerDetails: PublicReferralReferrer,
) {
  try {
    const payload = await verifyReferralUpdateToken(token);
    const name = trimmed(referrerDetails?.name);
    const bankName = trimmed(referrerDetails?.bank_name);
    const bankAccount = trimmed(referrerDetails?.bank_account);
    const icNumber = trimmed(referrerDetails?.ic_number);
    const tin = trimmed(referrerDetails?.tin);
    const address = trimmed(referrerDetails?.address);

    if (
      !isRealName(name) || name.length > 200 ||
      !bankName || bankName.length > 120 ||
      !bankAccount || bankAccount.length > 50 ||
      !icNumber || icNumber.length > 30 ||
      !tin || tin.length > 50 ||
      !address || address.length > 500
    ) {
      return { success: false as const, error: "Please complete your name, MyKad, address, bank, and tax details." };
    }

    const updatedAt = new Date();
    const details = {
      name,
      bank_name: emptyToNull(bankName),
      bank_account: emptyToNull(bankAccount),
      ic_number: emptyToNull(icNumber),
      tin: emptyToNull(tin),
      address: emptyToNull(address),
    };

    await db.transaction(async (tx) => {
      const linked = await tx
        .select({ id: referrals.id })
        .from(referrals)
        .where(and(
          inArray(referrals.id, payload.referralIds),
          eq(referrals.linked_customer_profile, payload.referrerCustomerId),
        ));
      if (linked.length !== payload.referralIds.length) {
        throw new Error("This update link is no longer valid");
      }

      const [customer] = await tx
        .select({ id: customers.id, notes: customers.notes })
        .from(customers)
        .where(eq(customers.customer_id, payload.referrerCustomerId))
        .for("update");
      if (!customer) throw new Error("The linked referrer is no longer available");

      const notes = mergeReferralAccountNotes(customer.notes, details, updatedAt.toISOString());
      const updated = await tx
        .update(customers)
        .set({
          ...details,
          remark: "REFERRAL_ACCOUNT",
          notes,
          updated_by: "whatsapp_agent",
          updated_at: updatedAt,
        })
        .where(eq(customers.customer_id, payload.referrerCustomerId))
        .returning({ id: customers.id });
      if (updated.length !== 1) throw new Error("The linked referrer could not be updated");
    });

    revalidatePath("/referrals");
    revalidatePath("/referrals/referrers");
    return { success: true as const, registered: true, name };
  } catch (error) {
    console.error("Failed to update referrer payout details from public link:", error);
    return { success: false as const, error: "We could not save these details. Please ask your contact for a new link." };
  }
}
