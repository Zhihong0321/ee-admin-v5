"use client";

import React, { useState, useTransition, useMemo } from "react";
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
  Trash2,
  Tag,
  List,
} from "lucide-react";
import { uploadEngineeringFile, deleteEngineeringFile, getEngineeringInvoices } from "./actions";

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

/**
 * Simple fuzzy match: every word in the query must appear somewhere
 * in the target string (case-insensitive).
 */
function fuzzyMatch(query: string, target: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = target.toLowerCase();
  return words.every((w) => hay.includes(w));
}

export default function EngineeringClient({ initialInvoices, initialSearch }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState(initialSearch);
  const [selectedInvoice, setSelectedInvoice] = useState<EngineeringInvoice | null>(null);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"tagged" | "all">("tagged");
  const [allInvoices, setAllInvoices] = useState<EngineeringInvoice[]>([]);
  const [loadingAll, setLoadingAll] = useState(false);

  const handleTabChange = async (tab: "tagged" | "all") => {
    setActiveTab(tab);
    if (tab === "all" && allInvoices.length === 0) {
      setLoadingAll(true);
      try {
        const data = await getEngineeringInvoices();
        setAllInvoices(data);
      } catch (error) {
        console.error("Failed to load all invoices", error);
      } finally {
        setLoadingAll(false);
      }
    }
  };

  const sourceInvoices = activeTab === "tagged" ? initialInvoices : allInvoices;

  const displayedInvoices = useMemo(() => {
    if (!search.trim()) return sourceInvoices;
    return sourceInvoices.filter((inv) => {
      const searchable = [
        inv.customer_name,
        inv.invoice_number,
        inv.agent_name,
        inv.address,
      ]
        .filter(Boolean)
        .join(" ");
      return fuzzyMatch(search, searchable);
    });
  }, [search, sourceInvoices]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // search is already applied instantly via useMemo
  };

  const handleViewInvoice = (invoice: EngineeringInvoice) => {
    // We need to get the bubble_id or share_token for this invoice
    // Since the EngineeringInvoice interface doesn't include these fields,
    // we'll need to either fetch them or assume they exist
    const targetId = invoice.seda_bubble_id; // Using seda_bubble_id as fallback
    if (!targetId) {
      alert("No valid Bubble ID found for this invoice.");
      return;
    }
    window.open(`https://calculator.atap.solar/view/${targetId}`, '_blank');
  };

  const handleDelete = async (url: string, type: "system" | "engineering" | "roof") => {
    if (!selectedInvoice?.seda_bubble_id || !confirm("Delete this file?")) return;

    setDeletingFile(url);
    try {
      const result = await deleteEngineeringFile(selectedInvoice.seda_bubble_id, url, type);
      if (result.success) {
        startTransition(() => {
          router.refresh();
          if (selectedInvoice) {
            const updated = { ...selectedInvoice };
            if (type === "system") {
              updated.drawing_pdf_system = updated.drawing_pdf_system?.filter(u => u !== url) || null;
              updated.systemDrawingCount--;
            } else if (type === "engineering") {
              updated.drawing_engineering_seda_pdf = updated.drawing_engineering_seda_pdf?.filter(u => u !== url) || null;
              updated.engineeringDrawingCount--;
            } else {
              updated.roof_images = updated.roof_images?.filter(u => u !== url) || null;
              updated.roofImageCount--;
            }
            setSelectedInvoice(updated);
          }
        });
      } else {
        alert("Delete failed: " + result.error);
      }
    } catch (error) {
      alert("An error occurred during delete");
    } finally {
      setDeletingFile(null);
    }
  };  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: "system" | "engineering" | "roof") => {
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
    <div className="space-y-4">
      {/* Tabs + Search in one row */}
      <div className="card shadow-elevation-md">
        <div className="flex items-center justify-between border-b border-secondary-200 bg-secondary-50">
          {/* Tabs */}
          <div className="flex">
            <button
              onClick={() => handleTabChange("tagged")}
              className={`flex items-center gap-2 px-6 py-4 font-medium transition-all ${
                activeTab === "tagged"
                  ? "border-b-2 border-primary-600 text-primary-600 bg-white"
                  : "text-secondary-600 hover:text-secondary-900"
              }`}
            >
              <Tag className="w-4 h-4" />
              Tagged ({initialInvoices.length})
            </button>
            <button
              onClick={() => handleTabChange("all")}
              className={`flex items-center gap-2 px-6 py-4 font-medium transition-all ${
                activeTab === "all"
                  ? "border-b-2 border-primary-600 text-primary-600 bg-white"
                  : "text-secondary-600 hover:text-secondary-900"
              }`}
            >
              <List className="w-4 h-4" />
              All
            </button>
          </div>

          {/* Search in same row */}
          <div className="flex gap-2 px-6 py-2 items-center">
            <div className="relative w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search customer, invoice, agent..."
                className="input pl-10 pr-9 py-2 text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-secondary-400 hover:text-secondary-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {search && (
              <span className="text-xs text-secondary-500">{displayedInvoices.length} results</span>
            )}
          </div>
        </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th className="w-[10%]">Invoice No.</th>
              <th className="w-[12%]">Customer</th>
              <th className="w-[13%]">Agent</th>
              <th className="w-[20%]">Address</th>
              <th className="text-right w-[11%]">Amount</th>
              <th className="text-center w-[10%]">System Drawing</th>
              <th className="text-center w-[9%]">Roof Images</th>
              <th className="text-center w-[9%]">Eng Drawing</th>
              <th className="text-right w-[6%]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loadingAll && activeTab === "all" ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={9}>
                    <div className="h-4 bg-secondary-200 rounded w-3/4"></div>
                  </td>
                </tr>
              ))
            ) : displayedInvoices.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-6 py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="p-4 bg-secondary-100 rounded-full">
                      <FileText className="h-8 w-8 text-secondary-400" />
                    </div>
                    <div>
                      <p className="font-medium text-secondary-900 mb-1">No invoices found</p>
                      <p className="text-sm text-secondary-600">
                        {search ? "Try adjusting your search criteria" : "No invoices with drawing tags available"}
                      </p>
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              displayedInvoices.map((inv) => (
                <tr key={inv.id}>
                  <td>
                    <div className="font-semibold text-secondary-900 truncate">{inv.invoice_number}</div>
                  </td>
                  <td>
                    <div className="font-medium text-secondary-700 truncate">{inv.customer_name}</div>
                  </td>
                  <td>
                    <div className="text-secondary-600 truncate">{inv.agent_name}</div>
                  </td>
                  <td>
                    <div className="text-secondary-600 truncate max-w-[16rem]" title={inv.address || ""}>{inv.address}</div>
                  </td>
                  <td className="text-right">
                    <div className="font-bold text-secondary-900">
                      {inv.total_amount ? `MYR ${parseFloat(inv.total_amount).toLocaleString()}` : "-"}
                    </div>
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
                    <div className="flex items-center gap-1.5 justify-end">
                      <button
                        onClick={() => handleViewInvoice(inv)}
                        className="btn-ghost text-accent-600 hover:text-accent-700 flex items-center gap-1.5"
                        title="View Invoice in Calculator"
                      >
                        <ExternalLink className="w-4 h-4" />
                        View
                      </button>
                      <button
                        onClick={() => setSelectedInvoice(inv)}
                        className="btn-ghost text-primary-600 hover:text-primary-700 flex items-center gap-1.5"
                        title="Manage Files"
                      >
                        <Eye className="w-4 h-4" />
                        Files
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
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
                    <FileItem key={i} url={url} label={`System Drawing ${i + 1}`} onDelete={() => handleDelete(url, "system")} deleting={deletingFile === url} />
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
                        <button
                          onClick={() => handleDelete(url, "roof")}
                          disabled={deletingFile === url}
                          className="p-2 bg-white rounded-full text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          {deletingFile === url ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </button>
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
                    <FileItem key={i} url={url} label={`Engineering Drawing ${i + 1}`} onDelete={() => handleDelete(url, "engineering")} deleting={deletingFile === url} />
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

function FileItem({ url, label, onDelete, deleting }: { url: string; label: string; onDelete: () => void; deleting: boolean }) {
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
        <button
          onClick={onDelete}
          disabled={deleting}
          className="p-2 text-secondary-400 hover:text-red-600 transition-colors disabled:opacity-50"
          title="Delete"
        >
          {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
