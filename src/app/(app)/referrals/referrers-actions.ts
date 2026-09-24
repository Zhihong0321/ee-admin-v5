"use server";

import { and, eq, sql } from "drizzle-orm";
import { invoices } from "@/db/schema";
import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import { revalidatePath } from "next/cache";
import { signReferralUpdateToken } from "@/lib/referral-update-token";
import { hasInvoiceLinkedReferralColumn } from "./actions";

export type ReferrerFeeLead = {
  referralId: number;
  name: string | null;
  mobileNumber: string | null;
  relationship: string | null;
  projectType: string | null;
  missingFields: string[];
  invoices: ReferrerFeeInvoice[];
};

export type ReferrerFeeInvoice = {
  id: number;
  invoiceNumber: string | null;
  totalAmount: number | null;
  customerPaidPercent: number;
  referralCommissionPaidAmount: number;
  packageTypes: string[];
};

export type ReferrerFeeSummary = {
  customerId: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  paidInvoiceCount: number;
  referralCommissionPaidAmount: number;
  hasMissingInfo: boolean;
  missingPayoutFields: string[];
  updateUrl: string | null;
  leads: ReferrerFeeLead[];
};

function isReferralAdmin(user: Awaited<ReturnType<typeof getUser>>) {
  return (
    user?.isAdmin === true ||
    user?.role === "owner" ||
    (user?.tags || []).map((tag) => tag.toLowerCase()).includes("admin")
  );
}

type PaidReferralInvoiceRow = {
  referrer_id: string;
  referrer_name: string | null;
  referrer_phone: string | null;
  referrer_email: string | null;
  referral_id: number;
  lead_name: string | null;
  lead_phone: string | null;
  relationship: string | null;
  project_type: string | null;
  referrer_bank_name: string | null;
  referrer_bank_account: string | null;
  referrer_ic_number: string | null;
  referrer_tin: string | null;
  referrer_address: string | null;
  referrer_notes: string | null;
  invoice_id: number;
  invoice_number: string | null;
  invoice_total_amount: string | number | null;
  percent_of_total_amount: string | number | null;
  referral_commission_paid_amount: string | number | null;
  linked_package_types: string[] | null;
};

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://admin.atap.solar").replace(/\/$/, "");

function noteValue(raw: string | null, key: string) {
  if (!raw?.trim()) return "";
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const value = parsed?.[key];
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}

function columnOrNote(column: string | null, notes: string | null, key: string) {
  return column?.trim() || noteValue(notes, key);
}

function payoutGaps(row: PaidReferralInvoiceRow) {
  const missing: string[] = [];
  const name = row.referrer_name?.trim() || "";
  if (!name || name === "Referral") missing.push("name");
  if (!columnOrNote(row.referrer_bank_name, row.referrer_notes, "bankName")) missing.push("bank name");
  if (!columnOrNote(row.referrer_bank_account, row.referrer_notes, "bankAccount")) missing.push("bank account");
  if (!columnOrNote(row.referrer_ic_number, row.referrer_notes, "icNumber")) missing.push("MyKad");
  if (!columnOrNote(row.referrer_tin, row.referrer_notes, "tin")) missing.push("TIN");
  if (!columnOrNote(row.referrer_address, row.referrer_notes, "address")) missing.push("address");
  return missing;
}

export async function getReferrerFeeSummary(): Promise<ReferrerFeeSummary[]> {
  const user = await getUser();
  if (!isReferralAdmin(user)) throw new Error("Admin permission required");

  const hasLinkedReferral = await hasInvoiceLinkedReferralColumn();
  const invoiceReferralMatch = hasLinkedReferral
    ? sql`(
        NULLIF(BTRIM(i.linked_referral), '') = COALESCE(NULLIF(BTRIM(r.bubble_id), ''), r.id::text)
        OR (
          NULLIF(BTRIM(i.linked_referral), '') IS NULL
          AND r.linked_invoice = i.bubble_id
        )
      )`
    : sql`r.linked_invoice = i.bubble_id`;

  const result = await db.execute(sql`
    SELECT DISTINCT
      c.customer_id AS referrer_id,
      c.name AS referrer_name,
      c.phone AS referrer_phone,
      c.email AS referrer_email,
      r.id AS referral_id,
      r.name AS lead_name,
      r.mobile_number AS lead_phone,
      r.relationship,
      r.project_type,
      c.bank_name AS referrer_bank_name,
      c.bank_account AS referrer_bank_account,
      c.ic_number AS referrer_ic_number,
      c.tin AS referrer_tin,
      c.address AS referrer_address,
      c.notes AS referrer_notes,
      i.id AS invoice_id,
      i.invoice_number,
      CAST(COALESCE(i.total_amount, i.amount) AS TEXT) AS invoice_total_amount,
      CAST(i.percent_of_total_amount AS TEXT) AS percent_of_total_amount,
      CAST(i.referral_commission_paid_amount AS TEXT) AS referral_commission_paid_amount,
      ARRAY(
        SELECT DISTINCT CASE
          WHEN LOWER(BTRIM(p.type)) = 'residential' THEN 'Residential'
          WHEN LOWER(BTRIM(p.type)) = 'commercial' OR LOWER(BTRIM(p.type)) LIKE 'tariff_%' THEN 'Commercial'
          ELSE INITCAP(REPLACE(BTRIM(p.type), '_', ' '))
        END
        FROM invoice_item ii
        INNER JOIN package p ON p.bubble_id = ii.linked_package
        WHERE ii.bubble_id = ANY(i.linked_invoice_item)
          AND NULLIF(BTRIM(p.type), '') IS NOT NULL
        ORDER BY 1
      ) AS linked_package_types
    FROM invoice i
    INNER JOIN referral r ON ${invoiceReferralMatch}
    INNER JOIN customer c ON c.customer_id = r.linked_customer_profile
    WHERE i.is_latest = true
      AND COALESCE(i.is_deleted, false) = false
      AND COALESCE(i.percent_of_total_amount, 0) > 0
      AND r.linked_customer_profile IS NOT NULL
      AND BTRIM(r.linked_customer_profile) <> ''
    ORDER BY c.name ASC NULLS LAST, r.id ASC, i.id ASC
  `);

  const rows = (result.rows ?? result) as PaidReferralInvoiceRow[];
  const referrersByCustomer = new Map<
    string,
    ReferrerFeeSummary & {
      _leads: Map<number, ReferrerFeeLead>;
      _invoices: Map<number, number>;
    }
  >();

  for (const row of rows) {
    const customerId = row.referrer_id?.trim();
    if (!customerId) continue;

    let referrer = referrersByCustomer.get(customerId);
    if (!referrer) {
      referrer = {
        customerId,
        name: row.referrer_name,
        phone: row.referrer_phone,
        email: row.referrer_email,
        paidInvoiceCount: 0,
        referralCommissionPaidAmount: 0,
        hasMissingInfo: false,
        missingPayoutFields: payoutGaps(row),
        updateUrl: null,
        leads: [],
        _leads: new Map(),
        _invoices: new Map(),
      };
      referrersByCustomer.set(customerId, referrer);
    }

    if (!referrer._leads.has(row.referral_id)) {
      referrer._leads.set(row.referral_id, {
        referralId: row.referral_id,
        name: row.lead_name,
        mobileNumber: row.lead_phone,
        relationship: row.relationship,
        projectType: row.project_type,
        missingFields: [],
        invoices: [],
      });
    }

    const lead = referrer._leads.get(row.referral_id)!;
    const paidAmount = Number(row.referral_commission_paid_amount || 0);
    const paidPercent = Number(row.percent_of_total_amount || 0);
    const totalAmount = row.invoice_total_amount == null ? Number.NaN : Number(row.invoice_total_amount);
    const invoice = {
      id: row.invoice_id,
      invoiceNumber: row.invoice_number,
      totalAmount: Number.isFinite(totalAmount) ? totalAmount : null,
      customerPaidPercent: Number.isFinite(paidPercent) ? paidPercent : 0,
      referralCommissionPaidAmount: Number.isFinite(paidAmount) ? Math.round(paidAmount * 100) / 100 : 0,
      packageTypes: Array.isArray(row.linked_package_types) ? row.linked_package_types : [],
    };
    if (!lead.invoices.some((item) => item.id === invoice.id)) lead.invoices.push(invoice);

    if (!referrer._invoices.has(row.invoice_id)) {
      referrer._invoices.set(row.invoice_id, Math.round(invoice.referralCommissionPaidAmount * 100));
    }
  }

  const summaries = [...referrersByCustomer.values()].map((referrer) => {
    const leads = [...referrer._leads.values()].sort((a, b) => a.referralId - b.referralId);
    const invoicesForReferrer = [...referrer._invoices.values()];
    return {
      customerId: referrer.customerId,
      name: referrer.name,
      phone: referrer.phone,
      email: referrer.email,
      paidInvoiceCount: invoicesForReferrer.length,
      referralCommissionPaidAmount: invoicesForReferrer.reduce((totalCents, amountCents) => totalCents + amountCents, 0) / 100,
      hasMissingInfo: referrer.missingPayoutFields.length > 0,
      missingPayoutFields: referrer.missingPayoutFields,
      updateUrl: null as string | null,
      leads,
    };
  });

  for (const summary of summaries) {
    // Always provide a form link so WhatsApp can carry a real page even when the
    // current record appears complete and the referrer needs to correct it.
    const referralIds = summary.leads.map((lead) => lead.referralId);
    if (referralIds.length === 0) continue;

    const token = await signReferralUpdateToken({
      referrerCustomerId: summary.customerId,
      referralIds,
    });
    summary.updateUrl = `${APP_URL}/referral-update/${token}`;
  }

  return summaries.sort((a, b) => Number(b.hasMissingInfo) - Number(a.hasMissingInfo) ||
    (a.name || "").localeCompare(b.name || ""));
}

export async function updateInvoiceReferralCommissionPaidAmount(invoiceId: number, amount: number) {
  const user = await getUser();
  if (!isReferralAdmin(user)) {
    return { success: false, error: "Admin permission required to record a referral fee payment" };
  }

  if (
    !Number.isSafeInteger(invoiceId) ||
    invoiceId <= 0 ||
    !Number.isFinite(amount) ||
    amount < 0 ||
    amount > 9_999_999_999.99 ||
    Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001
  ) {
    return { success: false, error: "Enter a non-negative amount with no more than two decimal places" };
  }

  try {
    const hasLinkedReferral = await hasInvoiceLinkedReferralColumn();
    const hasReferralAttribution = hasLinkedReferral
      ? sql`EXISTS (
          SELECT 1
          FROM referral r
          WHERE NULLIF(BTRIM(invoice.linked_referral), '') =
            COALESCE(NULLIF(BTRIM(r.bubble_id), ''), r.id::text)
            OR (
              NULLIF(BTRIM(invoice.linked_referral), '') IS NULL
              AND r.linked_invoice = ${invoices.bubble_id}
            )
        )`
      : sql`EXISTS (
          SELECT 1
          FROM referral r
          WHERE r.linked_invoice = ${invoices.bubble_id}
        )`;
    const paidAmount = amount.toFixed(2);
    const updated = await db
      .update(invoices)
      .set({
        referral_commission_paid_amount: paidAmount,
        updated_at: new Date(),
      })
      .where(and(
        eq(invoices.id, invoiceId),
        eq(invoices.is_latest, true),
        sql`COALESCE(${invoices.is_deleted}, false) = false`,
        sql`COALESCE(${invoices.percent_of_total_amount}, 0) > 0`,
        hasReferralAttribution,
      ))
      .returning({ id: invoices.id, invoice_number: invoices.invoice_number });

    if (updated.length !== 1) {
      return { success: false, error: "A paid invoice linked to a referral was not found" };
    }

    try {
      await logActivity({
        action: "update",
        entityType: "invoice",
        entityId: invoiceId,
        fields: ["referral_commission_paid_amount"],
        metadata: { referral_commission_paid_amount: paidAmount, updated_by: user?.name || user?.userId || "Admin" },
      });
    } catch (logError) {
      console.error("Failed to log referral commission payment", logError);
    }
    revalidatePath("/referrals/referrers");
    revalidatePath("/invoices");
    return { success: true };
  } catch (error) {
    console.error("Failed to record referral commission payment:", error);
    return { success: false, error: "Could not save the referral fee amount" };
  }
}
