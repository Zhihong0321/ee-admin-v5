"use client";

type Introducer = { name?: string | null; phone?: string | null; email?: string | null } | null | undefined;

export default function IntroducerBadge({ introducer }: { introducer: Introducer }) {
  const primary = introducer?.name?.trim() || introducer?.phone?.trim() || "Not linked";

  return (
    <div className="inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm shadow-sm">
      <span className="shrink-0 font-extrabold uppercase tracking-wide text-amber-900">Introducer</span>
      <span className="font-semibold text-secondary-900">{primary}</span>
      {introducer?.name?.trim() && introducer.phone?.trim() ? (
        <span className="text-secondary-700">{introducer.phone}</span>
      ) : null}
      {introducer?.email?.trim() ? (
        <span className="break-all text-secondary-600">{introducer.email}</span>
      ) : null}
    </div>
  );
}
