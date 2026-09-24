"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { updateReferralDetailsFromLink, type PublicReferralLead } from "../actions";

export default function ReferralUpdateForm({
  token,
  referrerName,
  leads: initialLeads,
}: {
  token: string;
  referrerName: string;
  leads: PublicReferralLead[];
}) {
  const [leads, setLeads] = useState(initialLeads);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  function updateLead(id: number, field: keyof Omit<PublicReferralLead, "id">, value: string) {
    setLeads((current) => current.map((lead) => lead.id === id ? { ...lead, [field]: value } : lead));
    setSaved(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const result = await updateReferralDetailsFromLink(token, leads.map((lead) => ({
        id: lead.id,
        name: lead.name || "",
        mobile_number: lead.mobile_number || "",
        relationship: lead.relationship || "",
        project_type: lead.project_type || "",
      })));
      if (!result.success) {
        setError(result.error || "We could not save the referral details.");
        return;
      }
      setSaved(true);
    } catch (submitError) {
      console.error("Failed to submit referral details", submitError);
      setError("We could not save the referral details. Please try again.");
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
              <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Complete referral details</h1>
            </div>
          </div>
          <p className="mt-4 text-sm text-primary-50">Hello {referrerName}. Please check and complete the lead details below.</p>
        </header>

        {saved ? (
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Details submitted</p>
              <p className="mt-1 text-sm">Thank you. The referral information has been updated.</p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {leads.map((lead, index) => (
              <section key={lead.id} className="space-y-4 rounded-2xl border border-secondary-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="border-b border-secondary-100 pb-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-secondary-400">Referral lead {index + 1}</p>
                  <p className="mt-1 text-sm text-secondary-600">Please provide the best available details for this person.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-1.5 text-sm font-medium text-secondary-700">
                    Lead name {!lead.name?.trim() && <span className="text-red-500">*</span>}
                    <input
                      required maxLength={200} autoComplete="name"
                      readOnly={Boolean(lead.name?.trim())}
                      className={`input ${lead.name?.trim() ? "bg-secondary-50 text-secondary-500" : ""}`} value={lead.name || ""}
                      onChange={(event) => updateLead(lead.id, "name", event.target.value)}
                    />
                  </label>
                  <label className="space-y-1.5 text-sm font-medium text-secondary-700">
                    Contact number {!lead.mobile_number?.trim() && <span className="text-red-500">*</span>}
                    <input
                      required maxLength={50} type="tel" autoComplete="tel"
                      readOnly={Boolean(lead.mobile_number?.trim())}
                      className={`input ${lead.mobile_number?.trim() ? "bg-secondary-50 text-secondary-500" : ""}`} value={lead.mobile_number || ""}
                      onChange={(event) => updateLead(lead.id, "mobile_number", event.target.value)}
                    />
                  </label>
                  <label className="space-y-1.5 text-sm font-medium text-secondary-700">
                    Relationship to you {!lead.relationship?.trim() && <span className="text-red-500">*</span>}
                    <input
                      required maxLength={120}
                      readOnly={Boolean(lead.relationship?.trim())}
                      className={`input ${lead.relationship?.trim() ? "bg-secondary-50 text-secondary-500" : ""}`} value={lead.relationship || ""}
                      onChange={(event) => updateLead(lead.id, "relationship", event.target.value)}
                    />
                  </label>
                  <label className="space-y-1.5 text-sm font-medium text-secondary-700">
                    Project type {!lead.project_type?.trim() && <span className="text-red-500">*</span>}
                    <input
                      required maxLength={120}
                      readOnly={Boolean(lead.project_type?.trim())}
                      className={`input ${lead.project_type?.trim() ? "bg-secondary-50 text-secondary-500" : ""}`} value={lead.project_type || ""}
                      onChange={(event) => updateLead(lead.id, "project_type", event.target.value)}
                    />
                  </label>
                </div>
              </section>
            ))}

            {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

            <div className="flex flex-col gap-3 rounded-2xl border border-secondary-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-secondary-500">Only missing details can be filled in. Existing details are locked.</p>
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
