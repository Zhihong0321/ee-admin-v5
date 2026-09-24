"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Copy, Eye, Loader2, MessageCircle, Phone, Save, Users } from "lucide-react";
import InvoiceViewer from "@/components/InvoiceViewer";
import { getInvoiceDetails } from "@/app/(app)/invoices/actions";
import {
  updateInvoiceReferralCommissionPaidAmount,
  type ReferrerFeeInvoice,
  type ReferrerFeeSummary,
} from "../referrers-actions";

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function whatsappDigits(phone: string | null) {
  const digits = (phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("60")) return digits;
  if (digits.startsWith("0")) return `60${digits.slice(1)}`;
  return `60${digits}`;
}

function getWhatsAppHref(referrer: ReferrerFeeSummary) {
  const digits = whatsappDigits(referrer.phone);
  if (!digits) return null;

  const missingLeads = referrer.leads.filter((lead) => lead.missingFields.length > 0);
  const message = missingLeads.length > 0
    ? `Hi ${referrer.name || "there"}, could you please help us complete these referral details?\n${missingLeads
        .map((lead) => `• ${lead.name?.trim() || "Unnamed lead"}: ${lead.missingFields.join(", ")}`)
        .join("\n")}\n\nYou can securely fill in the details here: ${referrer.updateUrl}`
    : `Hi ${referrer.name || "there"}, could you please confirm that the referral details we have recorded are correct? Thank you.`;

  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

function InvoiceFeeEditor({
  invoice,
  onQuickView,
  quickViewLoading,
}: {
  invoice: ReferrerFeeInvoice;
  onQuickView: () => void;
  quickViewLoading: boolean;
}) {
  const router = useRouter();
  const initialAmount = invoice.referralCommissionPaidAmount.toFixed(2);
  const [amount, setAmount] = useState(initialAmount);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setAmount(initialAmount), [initialAmount]);

  async function handleSave() {
    const parsed = Number(amount);
    if (!amount.trim() || !Number.isFinite(parsed)) {
      setError("Enter a valid amount");
      return;
    }
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const result = await updateInvoiceReferralCommissionPaidAmount(invoice.id, parsed);
      if (!result.success) {
        setError(result.error || "Could not save amount");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch (saveError) {
      console.error("Failed to save referral fee amount", saveError);
      setError("Could not save amount");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 text-xs text-secondary-600">
        <button
          type="button"
          onClick={onQuickView}
          disabled={quickViewLoading}
          className="inline-flex items-center gap-1.5 font-semibold text-primary-700 hover:underline disabled:opacity-60"
          aria-label={`View ${invoice.invoiceNumber || `invoice ${invoice.id}`} and its payment record`}
        >
          {quickViewLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
          {invoice.invoiceNumber || `Invoice #${invoice.id}`}
          <span className="font-normal">· View invoice & payments</span>
        </button>
        <span className="ml-2">Buyer paid {invoice.customerPaidPercent.toLocaleString("en-MY", { maximumFractionDigits: 2 })}%</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs font-medium text-secondary-600">
          Referral fee paid (RM)
          <input
            type="number" min="0" step="0.01" inputMode="decimal"
            value={amount}
            onChange={(event) => { setAmount(event.target.value); setSaved(false); setError(""); }}
            className="input w-28 py-1.5 text-sm"
            aria-label={`Referral fee paid for ${invoice.invoiceNumber || `invoice ${invoice.id}`}`}
          />
        </label>
        <button type="button" onClick={handleSave} disabled={saving} className="btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-60">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {saving ? "Saving" : "Save"}
        </button>
        {saved && <span className="text-xs font-medium text-emerald-700">Saved</span>}
        {error && <span role="alert" className="text-xs text-red-700">{error}</span>}
      </div>
    </div>
  );
}

function ReferrerCard({
  referrer,
  onQuickViewInvoice,
  loadingQuickViewId,
}: {
  referrer: ReferrerFeeSummary;
  onQuickViewInvoice: (invoiceId: number) => void;
  loadingQuickViewId: number | null;
}) {
  const [copied, setCopied] = useState(false);
  const whatsappHref = getWhatsAppHref(referrer);

  async function copyUpdateLink() {
    if (!referrer.updateUrl) return;
    try {
      await navigator.clipboard.writeText(referrer.updateUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      console.error("Unable to copy referral update link", error);
      alert("Could not copy the link. Open the update form and copy its address.");
    }
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-secondary-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-secondary-100 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wide text-primary-700">Referrer · introduced these leads</p>
          <h3 className="break-words text-xl font-semibold text-secondary-900">{referrer.name || "Unnamed referrer"}</h3>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-secondary-600">
            {referrer.phone ? <span className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{referrer.phone}</span> : <span>No phone recorded</span>}
            {referrer.email && <span className="break-all">{referrer.email}</span>}
          </div>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-3 sm:min-w-[270px]">
          <div className="rounded-xl bg-secondary-50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-secondary-500">Invoices with payment</p>
            <p className="mt-1 text-2xl font-bold text-secondary-900">{referrer.paidInvoiceCount}</p>
          </div>
          <div className="rounded-xl bg-emerald-50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Referral fee paid</p>
            <p className="mt-1 text-lg font-bold text-emerald-800">{formatMoney(referrer.referralCommissionPaidAmount)}</p>
          </div>
        </div>
      </div>

      <div className="space-y-3 p-5 sm:p-6">
        {referrer.leads.map((lead) => (
          <div key={lead.referralId} className="rounded-xl border border-secondary-100 bg-secondary-50/50 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-secondary-400">Referred lead · potential buyer</p>
                <p className="break-words font-semibold text-secondary-900">{lead.name?.trim() || "Unnamed lead"}</p>
                <p className="mt-1 text-xs text-secondary-600">
                  {[lead.mobileNumber, lead.relationship, lead.projectType].filter(Boolean).join(" · ") || "No lead details recorded"}
                </p>
              </div>
              {lead.missingFields.length > 0 ? (
                <span className="inline-flex w-fit shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                  Missing: {lead.missingFields.join(", ")}
                </span>
              ) : (
                <span className="inline-flex w-fit shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Complete
                </span>
              )}
            </div>
            {lead.invoices.length > 0 && (
              <div className="mt-3 space-y-2">
                {lead.invoices.map((invoice) => (
                  <InvoiceFeeEditor
                    key={invoice.id}
                    invoice={invoice}
                    onQuickView={() => onQuickViewInvoice(invoice.id)}
                    quickViewLoading={loadingQuickViewId === invoice.id}
                  />
                ))}
              </div>
            )}
          </div>
        ))}

        <div className="flex flex-wrap gap-2 pt-1">
          {whatsappHref ? (
            <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="btn-primary inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700">
              <MessageCircle className="h-4 w-4" />
              WhatsApp {referrer.hasMissingInfo ? "to request details" : "to confirm details"}
            </a>
          ) : (
            <button type="button" disabled className="btn-secondary inline-flex cursor-not-allowed items-center gap-2 opacity-50" title="No referrer phone number is available">
              <MessageCircle className="h-4 w-4" />No WhatsApp number
            </button>
          )}
          {referrer.updateUrl && (
            <>
              <a href={referrer.updateUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary inline-flex items-center gap-2">
                <Users className="h-4 w-4" />Open update form
              </a>
              <button type="button" onClick={copyUpdateLink} className="btn-secondary inline-flex items-center gap-2">
                <Copy className="h-4 w-4" />{copied ? "Copied" : "Copy update link"}
              </button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

export default function ReferrersClient({ referrers }: { referrers: ReferrerFeeSummary[] }) {
  const [quickViewInvoice, setQuickViewInvoice] = useState<any | null>(null);
  const [loadingQuickViewId, setLoadingQuickViewId] = useState<number | null>(null);

  const { missingInfo, allComplete } = useMemo(() => ({
    missingInfo: referrers.filter((referrer) => referrer.hasMissingInfo),
    allComplete: referrers.filter((referrer) => !referrer.hasMissingInfo),
  }), [referrers]);

  async function handleQuickViewInvoice(invoiceId: number) {
    setLoadingQuickViewId(invoiceId);
    try {
      const details = await getInvoiceDetails(invoiceId, "v2");
      if (details) setQuickViewInvoice(details);
      else alert("Invoice not found.");
    } catch (error) {
      console.error("Failed to load invoice and payment record", error);
      alert("Could not load the invoice and payment record. Please try again.");
    } finally {
      setLoadingQuickViewId(null);
    }
  }

  return (
    <main className="min-w-0 max-w-6xl space-y-6">
      {quickViewInvoice && (
        <InvoiceViewer
          invoiceData={quickViewInvoice}
          onClose={() => setQuickViewInvoice(null)}
          version="v2"
          initialTab="details"
        />
      )}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/referrals" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary-700 hover:text-primary-800">
            <ArrowLeft className="h-4 w-4" />Referral leads
          </Link>
          <h1 className="text-3xl font-bold text-secondary-900">Referrer Fee Follow-up</h1>
          <p className="mt-1 text-secondary-600">Each card is the referrer—the person who introduced the leads. The leads and their buyer invoices appear inside the card. Referral fees show the amount recorded as paid.</p>
        </div>
        <div className="rounded-xl border border-secondary-200 bg-white px-4 py-3 text-sm text-secondary-600">
          {referrers.length} referrers · {missingInfo.length} need lead details · {allComplete.length} complete
        </div>
      </header>

      {referrers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-secondary-300 bg-white px-6 py-16 text-center">
          <Users className="mx-auto h-9 w-9 text-secondary-300" />
          <p className="mt-3 font-medium text-secondary-800">No referrers with paid invoices yet</p>
          <p className="mt-1 text-sm text-secondary-500">A referrer appears here when a linked invoice has received any customer payment.</p>
        </div>
      ) : (
        <div className="space-y-8">
          <section className="space-y-4">
            <div className="flex items-center justify-between border-b border-secondary-200 pb-2">
              <h2 className="text-xl font-bold text-amber-800">Missing lead details</h2>
              <span className="text-sm text-secondary-500">{missingInfo.length} referrers</span>
            </div>
            {missingInfo.length === 0 ? (
              <p className="rounded-xl bg-white p-5 text-sm text-secondary-500">No incomplete referral details.</p>
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">{missingInfo.map((referrer) => <ReferrerCard key={referrer.customerId} referrer={referrer} onQuickViewInvoice={handleQuickViewInvoice} loadingQuickViewId={loadingQuickViewId} />)}</div>
            )}
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between border-b border-secondary-200 pb-2">
              <h2 className="text-xl font-bold text-emerald-800">Lead details complete</h2>
              <span className="text-sm text-secondary-500">{allComplete.length} referrers</span>
            </div>
            {allComplete.length === 0 ? (
              <p className="rounded-xl bg-white p-5 text-sm text-secondary-500">No referrers with complete lead details yet.</p>
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">{allComplete.map((referrer) => <ReferrerCard key={referrer.customerId} referrer={referrer} onQuickViewInvoice={handleQuickViewInvoice} loadingQuickViewId={loadingQuickViewId} />)}</div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
