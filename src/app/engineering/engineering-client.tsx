"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Eye,
  FileText,
  Image as ImageIcon,
  FileDigit,
  Upload,
  Loader2,
  X,
  Download,
  ExternalLink,
} from "lucide-react";
import { uploadEngineeringFile } from "./actions";

interface EngineeringInvoice {
  id: number;
  invoice_number: string | null;
  total_amount: string | null;
  invoice_date: Date | null;
  status: string | null;
  customer_name: string | null;
  agent_name: string | null;
  address: string | null;
  seda_bubble_id: string | null;
  drawing_pdf_system: string[] | null;
  drawing_engineering_seda_pdf: string[] | null;
  roof_images: string[] | null;
  systemDrawingCount: number;
  engineeringDrawingCount: number;
  roofImageCount: number;
}

interface Props {
  initialInvoices: EngineeringInvoice[];
  initialSearch: string;
}

export default function EngineeringClient({ initialInvoices, initialSearch }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(initialSearch);
  const [selectedInvoice, setSelectedInvoice] = useState<EngineeringInvoice | null>(null);
  const [uploadingType, setUploadingType] = useState<string | null>(null);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(() => {
      router.push(`/engineering?search=${encodeURIComponent(search)}`);
    });
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: "system" | "engineering" | "roof") => {
    if (!selectedInvoice?.seda_bubble_id || !e.target.files?.[0]) return;

    setUploadingType(type);
    const formData = new FormData();
    formData.append("file", e.target.files[0]);

    try {
      const result = await uploadEngineeringFile(selectedInvoice.seda_bubble_id, formData, type);
      if (result.success) {
        // Refresh the page data
        startTransition(() => {
          router.refresh();
          // Update selected invoice to show new file (hacky but works for instant feedback if router.refresh is slow)
          if (selectedInvoice) {
            const updated = { ...selectedInvoice };
            if (type === "system") {
              updated.drawing_pdf_system = [...(updated.drawing_pdf_system || []), result.url!];
              updated.systemDrawingCount++;
            } else if (type === "engineering") {
              updated.drawing_engineering_seda_pdf = [...(updated.drawing_engineering_seda_pdf || []), result.url!];
              updated.engineeringDrawingCount++;
            } else {
              updated.roof_images = [...(updated.roof_images || []), result.url!];
              updated.roofImageCount++;
            }
            setSelectedInvoice(updated);
          }
        });
      } else {
        alert("Upload failed: " + result.error);
      }
    } catch (error) {
      alert("An error occurred during upload");
    } finally {
      setUploadingType(null);
    }
  };

  return (
    <div className="card shadow-elevation-md">
      {/* Search Bar */}
      <div className="p-6 border-b border-secondary-200">
        <form onSubmit={handleSearch} className="flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search by invoice, customer, agent, or address..."
              className="input pl-12 pr-4 w-full"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button type="submit" disabled={isPending} className="btn-primary px-8">
            {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Search"}
          </button>
        </form>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Invoice No.</th>
              <th>Customer</th>
              <th>Agent</th>
              <th>Address</th>
              <th className="text-right">Amount</th>
              <th className="text-center">System Drawing</th>
              <th className="text-center">Roof Images</th>
              <th className="text-center">Eng Drawing</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {initialInvoices.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-20 text-center text-secondary-500">
                  No invoices found matching your criteria.
                </td>
              </tr>
            ) : (
              initialInvoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="font-semibold text-secondary-900">{inv.invoice_number}</td>
                  <td className="font-medium text-secondary-700">{inv.customer_name}</td>
                  <td className="text-secondary-600">{inv.agent_name}</td>
                  <td className="text-secondary-600 max-w-xs truncate">{inv.address}</td>
                  <td className="text-right font-bold text-secondary-900">
                    {inv.total_amount ? `MYR ${parseFloat(inv.total_amount).toLocaleString()}` : "-"}
                  </td>
                  <td className="text-center">
                    <span className={`badge ${inv.systemDrawingCount > 0 ? "badge-success" : "badge-secondary"}`}>
                      {inv.systemDrawingCount > 0 ? `[${inv.systemDrawingCount}]` : "Empty"}
                    </span>
                  </td>
                  <td className="text-center">
                    <span className={`badge ${inv.roofImageCount > 0 ? "badge-success" : "badge-secondary"}`}>
                      {inv.roofImageCount > 0 ? `[${inv.roofImageCount}]` : "Empty"}
                    </span>
                  </td>
                  <td className="text-center">
                    <span className={`badge ${inv.engineeringDrawingCount > 0 ? "badge-success" : "badge-secondary"}`}>
                      {inv.engineeringDrawingCount > 0 ? `[${inv.engineeringDrawingCount}]` : "Empty"}
                    </span>
                  </td>
                  <td className="text-right">
                    <button
                      onClick={() => setSelectedInvoice(inv)}
                      className="btn-ghost text-primary-600 hover:text-primary-700 flex items-center gap-1.5 ml-auto"
                    >
                      <Eye className="w-4 h-4" />
                      Enter
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Detail Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-secondary-100 flex items-center justify-between bg-secondary-50">
              <div>
                <h2 className="text-2xl font-bold text-secondary-900">
                  Invoice: {selectedInvoice.invoice_number}
                </h2>
                <p className="text-secondary-600 text-sm">{selectedInvoice.customer_name} | {selectedInvoice.address}</p>
              </div>
              <button
                onClick={() => setSelectedInvoice(null)}
                className="p-2 hover:bg-secondary-200 rounded-full transition-colors"
              >
                <X className="w-6 h-6 text-secondary-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-10">
              {/* System Drawings Section */}
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <FileDigit className="w-5 h-5 text-blue-600" />
                    Solar PV Drawings (System)
                  </h3>
                  <label className="btn-primary cursor-pointer flex items-center gap-2 text-sm">
                    {uploadingType === "system" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    Upload System Drawing
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,image/*"
                      onChange={(e) => handleUpload(e, "system")}
                      disabled={!!uploadingType}
                    />
                  </label>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {selectedInvoice.drawing_pdf_system?.map((url, i) => (
                    <FileItem key={i} url={url} label={`System Drawing ${i + 1}`} />
                  ))}
                  {(!selectedInvoice.drawing_pdf_system || selectedInvoice.drawing_pdf_system.length === 0) && (
                    <div className="col-span-2 py-4 text-center border-2 border-dashed border-secondary-200 rounded-xl text-secondary-400">
                      No system drawings uploaded yet.
                    </div>
                  )}
                </div>
              </section>

              {/* Roof Images Section */}
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-emerald-600" />
                    Roof Images
                  </h3>
                  <label className="btn-primary bg-emerald-600 hover:bg-emerald-700 border-none cursor-pointer flex items-center gap-2 text-sm">
                    {uploadingType === "roof" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    Upload Roof Image
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={(e) => handleUpload(e, "roof")}
                      disabled={!!uploadingType}
                    />
                  </label>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {selectedInvoice.roof_images?.map((url, i) => (
                    <div key={i} className="group relative aspect-square rounded-xl overflow-hidden bg-secondary-100 border border-secondary-200">
                      <img src={url} alt={`Roof Image ${i+1}`} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <a href={url} target="_blank" rel="noopener noreferrer" className="p-2 bg-white rounded-full text-secondary-900 hover:bg-secondary-100">
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    </div>
                  ))}
                  {(!selectedInvoice.roof_images || selectedInvoice.roof_images.length === 0) && (
                    <div className="col-span-4 py-8 text-center border-2 border-dashed border-secondary-200 rounded-xl text-secondary-400">
                      No roof images uploaded yet.
                    </div>
                  )}
                </div>
              </section>

              {/* Engineering Drawings Section */}
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <FileText className="w-5 h-5 text-amber-600" />
                    Engineering Drawings
                  </h3>
                  <label className="btn-primary bg-amber-600 hover:bg-amber-700 border-none cursor-pointer flex items-center gap-2 text-sm">
                    {uploadingType === "engineering" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    Upload Eng Drawing
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,image/*"
                      onChange={(e) => handleUpload(e, "engineering")}
                      disabled={!!uploadingType}
                    />
                  </label>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {selectedInvoice.drawing_engineering_seda_pdf?.map((url, i) => (
                    <FileItem key={i} url={url} label={`Engineering Drawing ${i + 1}`} />
                  ))}
                  {(!selectedInvoice.drawing_engineering_seda_pdf || selectedInvoice.drawing_engineering_seda_pdf.length === 0) && (
                    <div className="col-span-2 py-4 text-center border-2 border-dashed border-secondary-200 rounded-xl text-secondary-400">
                      No engineering drawings uploaded yet.
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FileItem({ url, label }: { url: string; label: string }) {
  const filename = url.split("/").pop();
  return (
    <div className="flex items-center justify-between p-3 bg-secondary-50 border border-secondary-200 rounded-xl hover:border-primary-300 transition-colors">
      <div className="flex items-center gap-3 overflow-hidden">
        <div className="p-2 bg-white rounded-lg border border-secondary-200">
          <FileText className="w-5 h-5 text-secondary-500" />
        </div>
        <div className="overflow-hidden">
          <p className="font-medium text-secondary-900 truncate">{label}</p>
          <p className="text-xs text-secondary-500 truncate">{filename}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 text-secondary-400 hover:text-primary-600 transition-colors"
          title="Open in new tab"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
        <a
          href={url}
          download
          className="p-2 text-secondary-400 hover:text-primary-600 transition-colors"
          title="Download"
        >
          <Download className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}
