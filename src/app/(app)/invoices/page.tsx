"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Search, Filter, ArrowUpDown, ChevronLeft, ChevronRight, Download, Plus, Eye, Edit2, FileText, Loader2, Database, Trash2, RotateCcw, AlertTriangle, X, Printer } from "lucide-react";
import { getInvoices, getInvoiceDetails, generateInvoicePdf, deleteInvoice, recoverInvoice, getUsersForFilter } from "./actions";
import InvoiceEditor from "@/components/InvoiceEditor";
import { getInvoiceIdDisplay, getInvoiceNumberDisplay } from "@/lib/invoice-display";

function InvoicesContent() {
  const searchParams = useSearchParams();
  const [version, setVersion] = useState<"v1" | "v2">("v2");
  const [tab, setTab] = useState<"active" | "deleted">("active");
  const [search, setSearch] = useState("");
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 50;
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [paidPercentMin, setPaidPercentMin] = useState("");
  const [paidPercentMax, setPaidPercentMax] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [createdBy, setCreatedBy] = useState("");
  const [userList, setUserList] = useState<{ bubble_id: string | null; name: string | null; email: string | null }[]>([]);

  // Warning Popup State based on expiry date (Apr 20, 2026)
  // [ NOTICE TO NEXT AI AGENT / DEVELOPER ]
  // This warning was requested to be removed after April 20, 2026.
  // Please delete the entire "Warning Popup" block and related state below after this date.
  const [showWarning, setShowWarning] = useState(() => {
    const today = new Date();
    const expiryDate = new Date("2026-04-20");
    return today < expiryDate;
  });

  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  useEffect(() => {
    fetchData();
  }, [version, tab]);

  useEffect(() => {
    getUsersForFilter().then(setUserList).catch(console.error);
  }, []);

  // Handle auto-opening invoice from query param
  useEffect(() => {
    const id = searchParams.get("id");
    if (id) {
      handleViewDetails(parseInt(id));
    }
  }, [searchParams]);

  async function fetchData(p?: number) {
    const currentPage = p ?? page;
    setLoading(true);
    try {
      const filters = {
        paidPercentMin: paidPercentMin ? parseFloat(paidPercentMin) : undefined,
        paidPercentMax: paidPercentMax ? parseFloat(paidPercentMax) : undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        createdBy: createdBy || undefined,
      };
      const result = await getInvoices(version, search, tab, currentPage, pageSize, filters);
      setInvoices(result.data);
      setTotal(result.total);
      setPage(result.page);
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
    fetchData(1);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Warning Popup */}
      {showWarning && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="bg-red-950 text-white p-8 md:p-12 rounded-3xl shadow-2xl max-w-2xl w-full border border-red-900/50 transform animate-in zoom-in-95 duration-300">
            <div className="flex flex-col items-center text-center space-y-8">
              <div className="p-4 bg-red-900/30 rounded-2xl border border-red-500/30">
                <AlertTriangle className="w-16 h-16 text-red-500 animate-pulse" />
              </div>
              <div className="space-y-4">
                <h3 className="text-3xl font-black tracking-tight uppercase">Important Notice</h3>
                <div className="h-1 w-20 bg-red-500 mx-auto rounded-full"></div>
                <p className="text-xl md:text-2xl font-bold leading-relaxed text-red-100">
                  [ WHEN EDIT INVOICE, DO NOT EDIT PACKAGE. PLEASE USE CHANGE PACKAGE FUNCTION ]
                </p>
              </div>
              <button
                onClick={() => setShowWarning(false)}
                className="w-full py-4 bg-white text-red-950 font-black text-lg rounded-2xl hover:bg-red-50 transition-all shadow-xl hover:scale-[1.02] active:scale-[0.98] uppercase tracking-wider"
              >
                I Understand
              </button>
            </div>
          </div>
        </div>
      )}

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
                placeholder="Search by Invoice ID, invoice no., customer name, or invoice by user..."
                className="input pl-12 pr-4"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <button
                type="button"
                onClick={() => setShowFilters(!showFilters)}
                className={`btn-secondary flex items-center gap-2 ${showFilters ? 'bg-primary-50 border-primary-200 text-primary-700' : ''}`}
              >
                <Filter className="w-4 h-4" />
                Filters
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

        {/* Filter Panel */}
        {showFilters && (
          <div className="p-6 border-b border-secondary-200 bg-secondary-50/60">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-secondary-700 flex items-center gap-2">
                <Filter className="w-4 h-4" />
                Filter Options
              </h3>
              <button
                onClick={() => setShowFilters(false)}
                className="p-1 rounded hover:bg-secondary-200 text-secondary-400 hover:text-secondary-600 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-xs font-semibold text-secondary-500 mb-2 uppercase tracking-wide">Invoice Date Range</label>
                <div className="flex flex-col gap-2">
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="input text-sm"
                    placeholder="From"
                  />
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="input text-sm"
                    placeholder="To"
                  />
                </div>
              </div>
              {version === "v2" && (
                <div>
                  <label className="block text-xs font-semibold text-secondary-500 mb-2 uppercase tracking-wide">Paid Amount %</label>
                  <div className="flex flex-col gap-2">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={paidPercentMin}
                      onChange={(e) => setPaidPercentMin(e.target.value)}
                      className="input text-sm"
                      placeholder="Min % (e.g. 0)"
                    />
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={paidPercentMax}
                      onChange={(e) => setPaidPercentMax(e.target.value)}
                      className="input text-sm"
                      placeholder="Max % (e.g. 100)"
                    />
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-secondary-500 mb-2 uppercase tracking-wide">Created By (User)</label>
                <select
                  value={createdBy}
                  onChange={(e) => setCreatedBy(e.target.value)}
                  className="input text-sm"
                >
                  <option value="">All Users</option>
                  {userList.map((u, index) => (
                    <option key={u.bubble_id ?? index} value={u.bubble_id ?? ""}>
                      {u.name || u.email || u.bubble_id || "Unknown User"}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-5">
              <button
                onClick={() => { setPage(1); fetchData(1); }}
                className="btn-primary text-sm"
              >
                Apply Filters
              </button>
              <button
                onClick={() => {
                  setDateFrom("");
                  setDateTo("");
                  setPaidPercentMin("");
                  setPaidPercentMax("");
                  setCreatedBy("");
                  setTimeout(() => fetchData(1), 0);
                }}
                className="btn-secondary text-sm"
              >
                Clear Filters
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Invoice ID</th>
                <th>Customer</th>
                <th>Invoice By</th>
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
                  const currentViewIsV1 = version === 'v1';
                  const matchesCurrentView = currentViewIsV1
                    ? 'linked_customer' in inv
                    : 'customer_name_snapshot' in inv;

                  // Skip if data doesn't match expected version structure (helps during state transitions)
                  if (!matchesCurrentView) return null;

                  return (
                    <tr key={inv.id}>
                      <td>
                        <div className="space-y-1">
                          <div className="text-base font-bold tracking-tight text-secondary-900">
                            {getInvoiceIdDisplay(inv)}
                          </div>
                          {(() => {
                            const invoiceNumber = getInvoiceNumberDisplay(inv);
                            const invoiceId = getInvoiceIdDisplay(inv);

                            if (!invoiceNumber || invoiceNumber === invoiceId) return null;

                            return (
                              <div className="text-xs font-medium text-secondary-500">
                                Invoice No. {invoiceNumber}
                              </div>
                            );
                          })()}
                        </div>
                      </td>
                      <td>
                        <div className="font-medium text-secondary-700">
                          {version === "v1" ? inv.linked_customer : inv.customer_name_snapshot || "N/A"}
                        </div>
                      </td>
                      <td>
                        <div className="text-secondary-600">
                          {inv.invoice_by_user_name || inv.agent_name || (version === "v1" ? inv.dealercode : "N/A")}
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
                            onClick={() => window.open(`/invoices/${inv.id}/print?v=${version}`, "_blank")}
                            className="btn-ghost text-secondary-600 hover:text-secondary-900 p-2"
                            title="Printable A4 Invoice"
                          >
                            <Printer className="h-4 w-4" />
                          </button>
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
              <span className="font-semibold text-secondary-900">{total}</span> results
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => fetchData(page - 1)}
              className="p-2 rounded-lg border border-secondary-200 bg-white text-secondary-400 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-secondary-50 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-3 py-1.5 text-sm font-medium text-secondary-700 bg-white border border-secondary-200 rounded-lg">
              {page}
            </span>
            <button
              disabled={page * pageSize >= total}
              onClick={() => fetchData(page + 1)}
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
