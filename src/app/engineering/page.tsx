"use server";

import React from "react";
import EngineeringClient from "./engineering-client";
import { getInvoicesWithDrawingRequests } from "./actions";

export default async function EngineeringPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const params = await searchParams;
  const search = params.search || "";
  const invoices = await getInvoicesWithDrawingRequests(search);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-secondary-900">ENGINEERING</h1>
          <p className="text-secondary-600">
            Manage System Drawings, Engineering Drawings, and Roof Images for invoices with active drawing requests.
          </p>
        </div>
      </div>

      <EngineeringClient initialInvoices={invoices} initialSearch={search} />
    </div>
  );
}
