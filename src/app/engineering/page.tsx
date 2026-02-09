"use server";

import React from "react";
import EngineeringClient from "./engineering-client";
import { getInvoicesWithDrawingTags } from "./actions";

export default async function EngineeringPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const params = await searchParams;
  const search = params.search || "";
  const invoices = await getInvoicesWithDrawingTags(search);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-secondary-900">ENGINEERING</h1>
          <p className="text-secondary-600">
            Invoices with active drawing requests (System Drawing or Engineering Drawing tags).
          </p>
        </div>
      </div>

      <EngineeringClient initialInvoices={invoices} initialSearch={search} />
    </div>
  );
}
