"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Search, Filter, ArrowUpDown, ChevronLeft, ChevronRight, Download, Plus, Eye, Edit2, FileText, Loader2, RefreshCw, Database, Trash2, RotateCcw } from "lucide-react";
import { getInvoices, getInvoiceDetails, generateInvoicePdf, triggerInvoiceSync, deleteInvoice, recoverInvoice } from "./actions";
import InvoiceEditor from "@/components/InvoiceEditor";

function InvoicesContent() {
  const searchParams = useSearchParams();
  const [version, setVersion] = useState<"v1" | "v2">("v2");
  const [tab, setTab] = useState<"active" | "deleted">("active");
  const [search, setSearch] = useState("");
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  useEffect(() => {
    fetchData();
  }, [version, tab]);

  // Handle auto-opening invoice from query param
  useEffect(() => {
    const id = searchParams.get("id");
    if (id) {
      handleViewDetails(parseInt(id));
    }
  }, [searchParams]);

  async function fetchData() {
    setLoading(true);
    try {
      const data = await getInvoices(version, search, tab);
      setInvoices(data);
    } catch (error) {
      console.error("Failed to fetch invoices:", error);
    } finally {
      setLoading(false);
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this invoice?")) return;
    try {
      const res = await deleteInvoice(id);
      if (res.success) {
        fetchData();
      } else {
        alert("Failed to delete invoice");
      }
    } catch (error) {
      console.error("Failed to delete invoice:", error);
      alert("Failed to delete invoice");
    }
  };

  const handleRecover = async (id: number) => {
    try {
      const res = await recoverInvoice(id);
      if (res.success) {
        fetchData();
      } else {
        alert("Failed to recover invoice");
      }
    } catch (error) {
      console.error("Failed to recover invoice:", error);
      alert("Failed to recover invoice");
    }
  };

  const handleViewDetails = async (id: number) => {
    setLoadingDetails(true);
    try {
      const details = await getInvoiceDetails(id, version);
      if (details) {
        setSelectedInvoice(details);
      }
    } catch (error) {
      console.error("Failed to fetch invoice details:", error);
      alert("Failed to load invoice details. Please try again.");
    } finally {
      setLoadingDetails(false);
    }
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
    e.preventDefault();
    fetchData();
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await triggerInvoiceSync();
      if (result.success) {
        alert("Sync complete: Customers and invoices synchronized from Bubble.");
        fetchData();
      } else {
        alert("Sync failed: " + result.error);
      }
    } catch (error) {
      console.error("Sync error", error);
      alert("Sync error");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Invoice Editor Modal */}
      {selectedInvoice && (
        <InvoiceEditor
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-secondary-900">Invoices</h1>
          <p className="text-secondary-600">
            Manage and browse your {version === "v1" ? "legacy Bubble" : "modern consolidated"} invoices.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="btn-secondary flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync Bubble'}
          </button>

          {/* Version Toggle */}
          <div className="flex items-center bg-white border border-secondary-200 rounded-xl p-1 shadow-sm">
            <button
              onClick={() => {
                setVersion("v1");
                setInvoices([]);
              }}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${version === "v1"
                  ? "bg-primary-600 text-white shadow-sm"
                  : "text-secondary-600 hover:text-secondary-900 hover:bg-secondary-50"
                }`}
            >
              Legacy
            </button>
            <button
              onClick={() => {
                setVersion("v2");
                setInvoices([]);
              }}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${version === "v2"
                  ? "bg-primary-600 text-white shadow-sm"
                  : "text-secondary-600 hover:text-secondary-900 hover:bg-secondary-50"
                }`}
            >
              Consolidated
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
        {/* Tabs Bar */}
        <div className="flex border-b border-secondary-200 px-6 pt-2 gap-4">
          <button
            onClick={() => { setTab("active"); setInvoices([]); }}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${tab === "active"
                ? "border-primary-600 text-primary-600"
                : "border-transparent text-secondary-500 hover:text-secondary-700 hover:border-secondary-300"
              }`}
          >
            Active Invoices
          </button>
          <button
            onClick={() => { setTab("deleted"); setInvoices([]); }}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${tab === "deleted"
                ? "border-primary-600 text-primary-600"
                : "border-transparent text-secondary-500 hover:text-secondary-700 hover:border-secondary-300"
              }`}
          >
            Deleted Invoices
          </button>
        </div>

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
                {version === "v2" ? <th className="text-right">% Paid</th> : null}
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
                  <td colSpan={version === "v1" ? 6 : 7} className="px-6 py-16 text-center">
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
                invoices.map((inv) => {
                  // Safety check: ensure we're rendering the correct version of data
                  const isV1Data = 'invoice_id' in inv;
                  const currentViewIsV1 = version === 'v1';

                  // Skip if data doesn't match expected version structure (helps during state transitions)
                  if (isV1Data !== currentViewIsV1) return null;

                  return (
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
                      {version === "v2" ? (
                        <td className="text-right">
                          <div className={`font-semibold ${inv.percent_of_total_amount ? (parseFloat(inv.percent_of_total_amount) >= 100 ? 'text-green-600' : parseFloat(inv.percent_of_total_amount) > 0 ? 'text-amber-600' : 'text-secondary-400') : 'text-secondary-400'}`}>
                            {inv.percent_of_total_amount ? `${parseFloat(inv.percent_of_total_amount).toFixed(1)}%` : '0%'}
                          </div>
                        </td>
                      ) : null}
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
                            className="btn-ghost text-primary-600 hover:text-primary-700 flex items-center gap-1.5 px-2 py-1"
                          >
                            <Edit2 className="h-4 w-4" />
                            {tab === "active" ? "Edit" : "View"}
                          </button>
                          {tab === "active" ? (
                            <button
                              onClick={() => handleDelete(inv.id)}
                              className="btn-ghost text-red-600 hover:text-red-700 p-2"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleRecover(inv.id)}
                              className="btn-ghost text-green-600 hover:text-green-700 p-2"
                              title="Recover"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
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

export default function InvoicesPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-10 h-10 text-primary-600 animate-spin" />
      </div>
    }>
      <InvoicesContent />
    </Suspense>
  );
}
