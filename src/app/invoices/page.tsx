"use client";

import { useState, useEffect } from "react";
import { Search, Filter, ArrowUpDown, ChevronLeft, ChevronRight, Download, Plus, Eye, FileText, Loader2 } from "lucide-react";
import { getInvoices, getInvoiceDetails } from "./actions";
import InvoiceViewer from "@/components/InvoiceViewer";

export default function InvoicesPage() {
  const [version, setVersion] = useState<"v1" | "v2">("v2");
  const [search, setSearch] = useState("");
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  useEffect(() => {
// ... existing useEffect ...
    fetchData();
  }, [version]);

  async function fetchData() {
// ... existing fetchData ...
  }

  const handleViewDetails = async (id: number) => {
// ... existing handleViewDetails ...
  };

  const handleDownloadPdf = async (id: number) => {
    setDownloadingId(id);
    try {
      const result = await generateInvoicePdf(id, version);
      if (result?.downloadUrl) {
        window.open(result.downloadUrl, "_blank");
      }
    } catch (error) {
      console.error("Failed to download PDF:", error);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
// ... existing handleSearch ...
    e.preventDefault();
    fetchData();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ... rest of the code ... */}
      {/* Invoice Viewer Modal */}
      {selectedInvoice && (
        <InvoiceViewer 
          invoiceData={selectedInvoice} 
          onClose={() => setSelectedInvoice(null)} 
          version={version}
        />
      )}

      {loadingDetails && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/20 backdrop-blur-[2px]">
          <div className="bg-white p-6 rounded-xl shadow-xl flex flex-col items-center gap-4">
            <Loader2 className="w-10 h-10 text-primary-600 animate-spin" />
            <p className="font-medium text-secondary-900">Loading invoice details...</p>
          </div>
        </div>
      )}

      {/* Header Section */}
// ... rest of header section ...
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-secondary-900">Invoices</h1>
          <p className="text-secondary-600">
            Manage and browse your {version === "v1" ? "legacy" : "new"} ERP invoices.
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Version Toggle */}
          <div className="flex items-center bg-white border border-secondary-200 rounded-xl p-1 shadow-sm">
            <button
              onClick={() => setVersion("v1")}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                version === "v1"
                  ? "bg-primary-600 text-white shadow-sm"
                  : "text-secondary-600 hover:text-secondary-900 hover:bg-secondary-50"
              }`}
            >
              ERP v1
            </button>
            <button
              onClick={() => setVersion("v2")}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                version === "v2"
                  ? "bg-primary-600 text-white shadow-sm"
                  : "text-secondary-600 hover:text-secondary-900 hover:bg-secondary-50"
              }`}
            >
              ERP v2
            </button>
          </div>
          
          {/* Action Buttons */}
          <button className="btn-secondary flex items-center gap-2">
            <Download className="h-4 w-4" />
            Export
          </button>
          <button className="btn-primary flex items-center gap-2">
            <Plus className="h-4 w-4" />
            New Invoice
          </button>
        </div>
      </div>

      {/* Main Card */}
      <div className="card">
        {/* Filters Bar */}
        <div className="p-6 border-b border-secondary-200 bg-gradient-to-r from-secondary-50/50 to-white">
          <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="relative w-full md:w-96">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search by invoice ID, customer name, or agent..."
                className="input pl-12 pr-4"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            
            <div className="flex items-center gap-2 w-full md:w-auto">
              <button 
                type="button"
                onClick={fetchData}
                className="btn-secondary flex items-center gap-2"
              >
                <Filter className="w-4 h-4" />
                Filter
              </button>
              <button 
                type="button"
                className="btn-secondary flex items-center gap-2"
              >
                <ArrowUpDown className="w-4 h-4" />
                Sort
              </button>
            </div>
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
                <th>Date</th>
                <th className="text-right">Amount</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={6} className="px-6 py-6">
                      <div className="h-4 bg-secondary-200 rounded w-3/4"></div>
                    </td>
                  </tr>
                ))
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="p-4 bg-secondary-100 rounded-full">
                        <FileText className="h-8 w-8 text-secondary-400" />
                      </div>
                      <div>
                        <p className="font-medium text-secondary-900 mb-1">No invoices found</p>
                        <p className="text-sm text-secondary-600">
                          {search ? "Try adjusting your search criteria" : "Get started by creating your first invoice"}
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td>
                      <div className="font-semibold text-secondary-900">
                        {version === "v1" ? `INV-${inv.invoice_id}` : inv.invoice_number || `ID-${inv.id}`}
                      </div>
                    </td>
                    <td>
                      <div className="font-medium text-secondary-700">
                        {version === "v1" ? inv.linked_customer : inv.customer_name_snapshot || "N/A"}
                      </div>
                    </td>
                    <td>
                      <div className="text-secondary-600">
                        {inv.agent_name || (version === "v1" ? inv.dealercode : "N/A")}
                      </div>
                    </td>
                    <td>
                      <div className="text-secondary-600">
                        {inv.invoice_date
                          ? new Date(inv.invoice_date).toLocaleDateString("en-US", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })
                          : "N/A"}
                      </div>
                    </td>
                    <td className="text-right">
                      <div className="font-bold text-secondary-900">
                        MYR {parseFloat(version === "v1" ? inv.amount : inv.total_amount || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </div>
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => handleDownloadPdf(inv.id)}
                          disabled={downloadingId === inv.id}
                          className="btn-ghost text-secondary-600 hover:text-secondary-900 p-2"
                          title="Download PDF"
                        >
                          {downloadingId === inv.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                        </button>
                        <button 
                          onClick={() => handleViewDetails(inv.id)}
                          className="btn-ghost text-primary-600 hover:text-primary-700 flex items-center gap-1.5"
                        >
                          <Eye className="h-4 w-4" />
                          View
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="p-6 border-t border-secondary-200 bg-secondary-50/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <p className="text-sm text-secondary-600">
              Showing <span className="font-semibold text-secondary-900">{invoices.length}</span> of{" "}
              <span className="font-semibold text-secondary-900">{invoices.length}</span> results
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled
              className="p-2 rounded-lg border border-secondary-200 bg-white text-secondary-400 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-secondary-50 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-3 py-1.5 text-sm font-medium text-secondary-700 bg-white border border-secondary-200 rounded-lg">
              1
            </span>
            <button
              disabled
              className="p-2 rounded-lg border border-secondary-200 bg-white text-secondary-400 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-secondary-50 transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
