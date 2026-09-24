"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { updateReferralDetailsFromLink, type PublicReferralReferrer } from "../actions";

export default function ReferralUpdateForm({
  token,
  referrer: initialReferrer,
}: {
  token: string;
  referrer: PublicReferralReferrer;
}) {
  const [referrer, setReferrer] = useState(initialReferrer);
  const [saving, setSaving] = useState(false);
  const [savedName, setSavedName] = useState("");
  const [error, setError] = useState("");

  function updateReferrer(field: keyof Omit<PublicReferralReferrer, "phone" | "registered">, value: string) {
    setReferrer((current) => ({ ...current, [field]: value }));
    setSavedName("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const result = await updateReferralDetailsFromLink(token, referrer);
      if (!result.success) {
        setError(result.error || "We could not save your details.");
        return;
      }
      setSavedName(result.name);
    } catch (submitError) {
      console.error("Failed to submit referrer payout details", submitError);
      setError("We could not save your details. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-secondary-50 px-4 py-10 sm:py-16">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="rounded-2xl bg-primary-700 p-6 text-white shadow-sm sm:p-8">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white/15 p-2.5"><Sparkles className="h-5 w-5" /></div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary-100">EE Admin · Referral</p>
              <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Referrer payout details</h1>
            </div>
          </div>
          <p className="mt-4 text-sm text-primary-50">
            Hello {referrer.name || "there"}. Before we can pay your referral fee, we need the details below as shown on your MyKad and bank account.
          </p>
        </header>

        {savedName ? (
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Your details are saved, {savedName}.</p>
              <p className="mt-1 text-sm">Thank you. We will use these details for your referral fee payment.</p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <section className="space-y-4 rounded-2xl border border-secondary-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="border-b border-secondary-100 pb-3">
                <p className="text-xs font-bold uppercase tracking-wider text-secondary-400">Your details</p>
                <p className="mt-1 text-sm text-secondary-600">These are your own payout details. All fields are required.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm font-medium text-secondary-700">
                  Name (as on MyKad) <span className="text-red-500">*</span>
                  <input required maxLength={200} autoComplete="name" className="input" value={referrer.name} onChange={(event) => updateReferrer("name", event.target.value)} />
                </label>
                <label className="space-y-1.5 text-sm font-medium text-secondary-700">
                  MyKad ID number <span className="text-red-500">*</span>
                  <input required maxLength={30} autoComplete="off" className="input" value={referrer.ic_number} onChange={(event) => updateReferrer("ic_number", event.target.value)} />
                </label>
                <label className="space-y-1.5 text-sm font-medium text-secondary-700 sm:col-span-2">
                  Address (same as MyKad) <span className="text-red-500">*</span>
                  <textarea required maxLength={500} autoComplete="street-address" rows={3} className="input resize-y" value={referrer.address} onChange={(event) => updateReferrer("address", event.target.value)} />
                </label>
                <label className="space-y-1.5 text-sm font-medium text-secondary-700">
                  Bank name <span className="text-red-500">*</span>
                  <input required maxLength={120} autoComplete="off" className="input" value={referrer.bank_name} onChange={(event) => updateReferrer("bank_name", event.target.value)} />
                </label>
                <label className="space-y-1.5 text-sm font-medium text-secondary-700">
                  Bank account number <span className="text-red-500">*</span>
                  <input required maxLength={50} inputMode="numeric" autoComplete="off" className="input" value={referrer.bank_account} onChange={(event) => updateReferrer("bank_account", event.target.value)} />
                </label>
                <label className="space-y-1.5 text-sm font-medium text-secondary-700">
                  Personal TIN (Tax ID) <span className="text-red-500">*</span>
                  <input required maxLength={50} autoComplete="off" className="input" value={referrer.tin} onChange={(event) => updateReferrer("tin", event.target.value)} />
                </label>
                <label className="space-y-1.5 text-sm font-medium text-secondary-700">
                  Phone
                  <input readOnly className="input cursor-not-allowed bg-secondary-50 text-secondary-500" value={referrer.phone || "No phone recorded"} />
                </label>
              </div>
            </section>

            {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

            <div className="flex flex-col gap-3 rounded-2xl border border-secondary-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-secondary-500">Submitting this form updates your payout details on the referrer account.</p>
              <button type="submit" disabled={saving} className="btn-primary inline-flex items-center justify-center gap-2 disabled:opacity-60">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {saving ? "Submitting…" : "Submit details"}
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
