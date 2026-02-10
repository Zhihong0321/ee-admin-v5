"use client";

import { useState, useEffect, useRef } from "react";
import { 
  Search, 
  Filter, 
  ArrowUpDown, 
  Eye, 
  CreditCard, 
  CheckCircle, 
  Clock, 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  ZoomIn, 
  X,
  User,
  Calendar,
  DollarSign,
  FileText,
  Loader2,
  RefreshCw,
  ArrowLeft,
  Trash2,
  Edit,
  Save,
  XCircle,
  History,
  Terminal,
  Calculator
} from "lucide-react";
import { 
  getSubmittedPayments, 
  getVerifiedPayments, 
  verifyPayment, 
  getInvoiceDetailsByBubbleId, 
  triggerPaymentSync, 
  diagnoseMissingInvoices,
  updateVerifiedPayment,
  updateSubmittedPayment,
  softDeleteSubmittedPayment,
  runPaymentReconciliation,
  analyzePaymentAttachment
} from "./actions";
import { cn } from "@/lib/utils";
import InvoiceViewer from "@/components/InvoiceViewer";
import { INVOICE_TEMPLATE_HTML } from "@/lib/invoice-template";
import { Sparkles, Zap, AlertTriangle } from "lucide-react";

function formatDate(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return 'N/A';
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) return 'Invalid Date';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatTime(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '';
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

export default function PaymentsPage() {
  const [activeTab, setActiveTab] = useState<"pending" | "verified" | "deleted">("pending");
  const [search, setSearch] = useState("");
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  
  // AI Analysis State
  const [analyzing, setAnalyzing] = useState(false);
  const [aiData, setAIData] = useState<{ amount: string, date: string } | null>(null);

  // View Modal State
  const [viewingPayment, setViewingPayment] = useState<any | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>("all");
  
  // Invoice state
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);
  const [showInvoiceInline, setShowInvoiceInModal] = useState(false);

  // Magnifying glass state
  const [showMagnifier, setShowMagnifier] = useState(false);
  const [magnifierPos, setMagnifierPos] = useState({ x: 0, y: 0 });
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const imgRef = useRef<HTMLImageElement>(null);
  const inlineInvoiceRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    fetchData();
  }, [activeTab]); // Note: sort and filter are applied client-side after fetch

  // Apply client-side sorting and filtering
  const filteredAndSortedPayments = payments
    .filter(payment => {
      if (paymentMethodFilter === "all") return true;
      return (payment.payment_method || "").toLowerCase() === paymentMethodFilter.toLowerCase();
    })
    .sort((a, b) => {
      const dateA = a.payment_date || a.created_at;
      const dateB = b.payment_date || b.created_at;
      const timeA = dateA ? (dateA instanceof Date ? dateA.getTime() : new Date(dateA).getTime()) : 0;
      const timeB = dateB ? (dateB instanceof Date ? dateB.getTime() : new Date(dateB).getTime()) : 0;
      return sortOrder === "desc" ? timeB - timeA : timeA - timeB;
    });

  useEffect(() => {
    if (inlineInvoiceRef.current && selectedInvoice && showInvoiceInline) {
      const doc = inlineInvoiceRef.current.contentDocument || inlineInvoiceRef.current.contentWindow?.document;
      if (doc) {
        doc.open();
        const dataScript = `<script>window.invoiceData = ${JSON.stringify(selectedInvoice)};</script>`;
        const htmlWithData = INVOICE_TEMPLATE_HTML.replace('</head>', `${dataScript}</head>`);
        doc.write(htmlWithData);
        doc.close();
      }
    }
  }, [selectedInvoice, showInvoiceInline]);

  const handleAIAnalysis = async () => {
    if (!viewingPayment?.attachment?.[0]) return;
    
    setAnalyzing(true);
    setAIData(null);
    try {
      const result = await analyzePaymentAttachment(viewingPayment.attachment[0]);
      if (result.success) {
        setAIData(result.data);
      } else {
        alert("AI Analysis failed: " + result.error);
      }
    } catch (error) {
      console.error("AI Error:", error);
      alert("AI Error occurred.");
    } finally {
      setAnalyzing(false);
    }
  };

  const applyAIData = () => {
    if (!aiData) return;
    setEditForm({
      ...editForm,
      amount: aiData.amount,
      payment_date: aiData.date
    });
    setIsEditing(true);
  };

  async function fetchData() {
    setLoading(true);
    try {
      let data;
      if (activeTab === "verified") {
        data = await getVerifiedPayments(search);
      } else {
        // Pending or Deleted
        data = await getSubmittedPayments(search, activeTab);
      }
      setPayments(data);
    } catch (error) {
      console.error("Failed to fetch payments", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const result = await triggerPaymentSync();
      if (result.success) {
        alert("Sync complete: New submissions imported and verified payments synchronized.");
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
  }

  async function handleReconcile() {
    if (!confirm("This will match pending submissions with verified payments (5-column match) and mark them as deleted. Continue?")) return;
    setReconciling(true);
    try {
      const result = await runPaymentReconciliation();
      alert(`Reconciliation complete. ${result.count} payments matched and cleaned up.`);
      fetchData();
    } catch (error) {
      console.error("Reconciliation error", error);
      alert("Reconciliation failed.");
    } finally {
      setReconciling(false);
    }
  }

  async function handleDiagnose() {
    try {
      const result = await diagnoseMissingInvoices();
      const message = `
Invoice Diagnostic Results
==========================
Total payments checked: ${result.totalPayments}
Payments with linked invoices: ${result.paymentsWithLinkedInvoice}
Missing invoices: ${result.missingInvoices.length}

${result.missingInvoices.length > 0 ? `Missing Invoice IDs:\n${result.missingInvoices.slice(0, 5).join('\n')}${result.missingInvoices.length > 5 ? '\n... and more' : ''}` : 'All invoices found!'}

Sample Invoice IDs in database:\n${result.sampleBubbleIds.join('\n')}

${result.missingInvoices.length > 0 ? '\nRECOMMENDATION: Run a full invoice sync from the Sync page to update missing invoices.' : ''}
      `.trim();
      alert(message);
    } catch (error) {
      console.error("Diagnostic error", error);
      alert("Diagnostic failed: " + error);
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchData();
  };

  const handleViewClick = (payment: any) => {
    setViewingPayment(payment);
    setEditForm({
      amount: payment.amount,
      payment_method: payment.payment_method,
      payment_date: payment.payment_date ? new Date(payment.payment_date).toISOString().split('T')[0] : ''
    });
    setAIData(null); // Reset AI data
    setShowInvoiceInModal(false);
    setIsViewModalOpen(true);
    setIsEditing(false);
  };

  const handleVerify = async (id: number) => {
    if (!confirm("Are you sure you want to verify this payment?")) return;
    
    try {
      await verifyPayment(id, "System Admin");
      fetchData();
      setIsViewModalOpen(false);
    } catch (error) {
      console.error("Failed to verify payment", error);
      alert("Failed to verify payment");
    }
  };

  const handleDeleteSubmission = async (id: number) => {
    if (!confirm("Are you sure you want to DELETE this submission? It will be moved to the Deleted tab.")) return;

    try {
      await softDeleteSubmittedPayment(id, "System Admin"); // TODO: Use real user
      fetchData();
    } catch (error) {
      console.error("Failed to delete submission", error);
      alert("Failed to delete submission");
    }
  };

  const handleSaveChanges = async () => {
    if (!viewingPayment) return;

    try {
      const updates = {
        amount: editForm.amount,
        payment_method: editForm.payment_method,
        payment_date: new Date(editForm.payment_date)
      };

      if (activeTab === "verified") {
        await updateVerifiedPayment(viewingPayment.id, updates, "System Admin");
      } else {
        await updateSubmittedPayment(viewingPayment.id, updates, "System Admin");
      }

      alert("Changes saved successfully.");
      setIsEditing(false);
      fetchData();
      setIsViewModalOpen(false); // Close to refresh state properly
    } catch (error) {
      console.error("Failed to save changes", error);
      alert("Failed to save changes");
    }
  };

  const handleViewInvoice = async (invoiceBubbleId: string, shareToken?: string) => {
    // Priority: Share Token > Real Bubble ID
    const targetId = shareToken || invoiceBubbleId;
    if (!targetId) {
      alert("No valid Bubble ID or Share Token found for this invoice.");
      return;
    }
    window.open(`https://calculator.atap.solar/view/${targetId}`, '_blank');
  };

  // Magnifying glass logic
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imgRef.current) return;

    const { top, left, width, height } = imgRef.current.getBoundingClientRect();
    const x = ((e.pageX - left - window.scrollX) / width) * 100;
    const y = ((e.pageY - top - window.scrollY) / height) * 100;

    setCursorPos({ x: e.pageX - left - window.scrollX, y: e.pageY - top - window.scrollY });
    setMagnifierPos({ x, y });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Invoice Viewer Modal (only for standalone view if ever needed, but now we have inline) */}
      {selectedInvoice && !isViewModalOpen && (
        <InvoiceViewer 
          invoiceData={selectedInvoice} 
          onClose={() => setSelectedInvoice(null)} 
          version="v2"
        />
      )}

      {loadingInvoice && (
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
          <h1 className="text-3xl font-bold text-secondary-900">Payment Management</h1>
          <p className="text-secondary-600">
            Verify agent submitted payments and view payment history.
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={handleReconcile}
            disabled={reconciling}
            className="btn-secondary flex items-center gap-2"
          >
            <CheckCircle className={`h-4 w-4 ${reconciling ? 'animate-pulse' : ''}`} />
            {reconciling ? 'Running...' : 'Auto-Reconcile'}
          </button>
          <button
            onClick={handleDiagnose}
            className="btn-secondary flex items-center gap-2"
          >
            <FileText className="h-4 w-4" />
            Diagnose Invoices
          </button>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="btn-secondary flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync Bubble'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-secondary-200">
        <button
          onClick={() => setActiveTab("pending")}
          className={cn(
            "px-6 py-3 text-sm font-medium border-b-2 transition-all flex items-center gap-2",
            activeTab === "pending"
              ? "border-primary-600 text-primary-600 bg-primary-50/50"
              : "border-transparent text-secondary-500 hover:text-secondary-700 hover:bg-secondary-50"
          )}
        >
          <Clock className="h-4 w-4" />
          Pending Verification
        </button>
        <button
          onClick={() => setActiveTab("verified")}
          className={cn(
            "px-6 py-3 text-sm font-medium border-b-2 transition-all flex items-center gap-2",
            activeTab === "verified"
              ? "border-primary-600 text-primary-600 bg-primary-50/50"
              : "border-transparent text-secondary-500 hover:text-secondary-700 hover:bg-secondary-50"
          )}
        >
          <CheckCircle className="h-4 w-4" />
          Verified Payments
        </button>
        <button
          onClick={() => setActiveTab("deleted")}
          className={cn(
            "px-6 py-3 text-sm font-medium border-b-2 transition-all flex items-center gap-2",
            activeTab === "deleted"
              ? "border-red-600 text-red-600 bg-red-50/50"
              : "border-transparent text-secondary-500 hover:text-secondary-700 hover:bg-secondary-50"
          )}
        >
          <Trash2 className="h-4 w-4" />
          Deleted Submissions
        </button>
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
                placeholder="Search by agent, customer, or remark..."
                className="input pl-12 pr-4"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            
            <div className="flex items-center gap-2 w-full md:w-auto relative">
              {/* Filter Button */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                  className={cn(
                    "btn-secondary flex items-center gap-2",
                    paymentMethodFilter !== "all" && "border-primary-500 text-primary-600"
                  )}
                >
                  <Filter className="w-4 h-4" />
                  Filter
                  {paymentMethodFilter !== "all" && (
                    <span className="ml-1 w-2 h-2 bg-primary-500 rounded-full"></span>
                  )}
                </button>

                {/* Filter Dropdown */}
                {showFilterDropdown && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowFilterDropdown(false)}
                    ></div>
                    <div className="absolute right-0 top-full mt-2 z-20 w-56 bg-white rounded-lg shadow-xl border border-secondary-200 animate-scale-in">
                      <div className="p-2">
                        <p className="px-3 py-2 text-xs font-semibold text-secondary-500 uppercase tracking-wider">
                          Payment Method
                        </p>
                        <button
                          onClick={() => {
                            setPaymentMethodFilter("all");
                            setShowFilterDropdown(false);
                          }}
                          className={cn(
                            "w-full text-left px-3 py-2 rounded-md text-sm flex items-center justify-between transition-colors",
                            paymentMethodFilter === "all"
                              ? "bg-primary-50 text-primary-700 font-medium"
                              : "text-secondary-700 hover:bg-secondary-50"
                          )}
                        >
                          <span>All Methods</span>
                          {paymentMethodFilter === "all" && <CheckCircle className="h-4 w-4 text-primary-600" />}
                        </button>
                        {Array.from(new Set(payments.map(p => p.payment_method).filter(Boolean)))
                          .sort()
                          .map(method => (
                          <button
                            key={method}
                            onClick={() => {
                              setPaymentMethodFilter(method);
                              setShowFilterDropdown(false);
                            }}
                            className={cn(
                              "w-full text-left px-3 py-2 rounded-md text-sm flex items-center justify-between transition-colors",
                              paymentMethodFilter.toLowerCase() === method.toLowerCase()
                                ? "bg-primary-50 text-primary-700 font-medium"
                                : "text-secondary-700 hover:bg-secondary-50"
                            )}
                          >
                            <span>{method}</span>
                            {paymentMethodFilter.toLowerCase() === method.toLowerCase() && (
                              <CheckCircle className="h-4 w-4 text-primary-600" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Sort Button */}
              <button
                type="button"
                onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
                className="btn-secondary flex items-center gap-2"
              >
                <ArrowUpDown className={cn("w-4 h-4", sortOrder === "asc" && "rotate-180 transition-transform")} />
                Sort
                <span className="text-xs text-secondary-500">
                  ({sortOrder === "desc" ? "Newest" : "Oldest"})
                </span>
              </button>
            </div>
          </form>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Agent / Customer</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Status / Remark</th>
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
              ) : filteredAndSortedPayments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="p-4 bg-secondary-100 rounded-full">
                        <CreditCard className="h-8 w-8 text-secondary-400" />
                      </div>
                      <div>
                        <p className="font-medium text-secondary-900 mb-1">No payments found</p>
                        <p className="text-sm text-secondary-600">
                          {search ? "Try adjusting your search criteria" : "No payments in this category"}
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredAndSortedPayments.map((payment) => (
                  <tr key={payment.id}>
                    <td>
                      <div className="flex flex-col">
                        <span className="font-medium text-secondary-900">
                          {formatDate(payment.payment_date || payment.created_at)}
                        </span>
                        <span className="text-xs text-secondary-500">
                          {formatTime(payment.payment_date || payment.created_at)}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5 text-sm font-semibold text-secondary-900">
                          <User className="h-3.5 w-3.5 text-primary-500" />
                          {payment.agent_name || "Unknown Agent"}
                        </div>
                        <div className="text-xs text-secondary-500 pl-5">
                          Cust: {payment.customer_name || "N/A"}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="text-sm font-bold text-secondary-900">
                        RM {parseFloat(payment.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-col gap-1">
                        <span className="px-2.5 py-1 bg-secondary-100 text-secondary-700 rounded-full text-xs font-medium w-fit">
                          {payment.payment_method || "N/A"}
                        </span>
                        {payment.issuer_bank && (
                          <span className="text-xs text-secondary-500">
                            Bank: {payment.issuer_bank}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-col gap-1">
                        {(activeTab === "pending" || activeTab === "deleted") && (
                          <span className={cn(
                            "w-fit px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                            payment.status === 'pending' ? "bg-yellow-100 text-yellow-700" : 
                            payment.status === 'deleted' ? "bg-red-100 text-red-700" :
                            "bg-secondary-100 text-secondary-700"
                          )}>
                            {payment.status || 'pending'}
                          </span>
                        )}
                        <p className="text-xs text-secondary-600 italic line-clamp-1 max-w-[200px]">
                          {payment.remark || "No remark"}
                        </p>
                      </div>
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => handleViewClick(payment)}
                          className="btn-ghost text-primary-600 hover:text-primary-700 flex items-center gap-1.5"
                        >
                          <Eye className="h-4 w-4" />
                          View
                        </button>
                        {activeTab === "pending" && payment.status === 'pending' && (
                          <>
                            <button 
                              onClick={() => handleDeleteSubmission(payment.id)}
                              className="btn-ghost text-red-600 hover:text-red-700 flex items-center gap-1.5"
                              title="Delete Submission"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        )}
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
              Showing <span className="font-semibold text-secondary-900">{filteredAndSortedPayments.length}</span> results
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

      {/* View Modal */}
      {isViewModalOpen && viewingPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-secondary-900/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-elevation-xl w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col animate-scale-in">
            {/* Modal Header */}
            <div className="p-6 border-b border-secondary-200 flex items-center justify-between bg-white">
              <div>
                <h2 className="text-xl font-bold text-secondary-900">Payment Details</h2>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-sm text-secondary-500">
                    Agent: <span className="font-semibold text-secondary-900">{viewingPayment.agent_name}</span>
                  </span>
                  <span className="text-secondary-300">|</span>
                  <span className="text-sm text-secondary-500">
                    Amount: <span className="font-bold text-primary-600">RM {parseFloat(viewingPayment.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!isEditing && (
                  <button 
                    onClick={() => setIsEditing(true)}
                    className="p-2 text-primary-600 hover:bg-primary-50 rounded-full transition-colors flex items-center gap-2 px-4"
                  >
                    <Edit className="h-4 w-4" />
                    Edit
                  </button>
                )}
                <button 
                  onClick={() => setIsViewModalOpen(false)}
                  className="p-2 hover:bg-secondary-100 rounded-full transition-colors"
                >
                  <X className="h-6 w-6 text-secondary-500" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
              {/* Info Sidebar */}
              <div className="w-full md:w-80 bg-secondary-50 p-6 space-y-6 overflow-y-auto border-r border-secondary-200">
                {isEditing ? (
                   <div className="space-y-4 bg-white p-4 rounded-lg shadow-sm border border-primary-200">
                    <h3 className="text-xs font-bold text-primary-600 uppercase tracking-widest flex items-center gap-2">
                      <Edit className="h-3 w-3" />
                      Editing Payment
                    </h3>
                    
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-secondary-500">Payment Date</label>
                        <input 
                          type="date" 
                          className="input w-full text-sm py-1"
                          value={editForm.payment_date}
                          onChange={e => setEditForm({...editForm, payment_date: e.target.value})}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-secondary-500">Method</label>
                        <select 
                          className="input w-full text-sm py-1"
                          value={editForm.payment_method}
                          onChange={e => setEditForm({...editForm, payment_method: e.target.value})}
                        >
                          <option value="Cash">Cash</option>
                          <option value="Online Transfer">Online Transfer</option>
                          <option value="Cheque">Cheque</option>
                          <option value="Credit Card">Credit Card</option>
                          <option value="E-Wallet">E-Wallet</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-secondary-500">Amount (RM)</label>
                        <input 
                          type="number" 
                          step="0.01"
                          className="input w-full text-sm py-1 font-bold"
                          value={editForm.amount}
                          onChange={e => setEditForm({...editForm, amount: e.target.value})}
                        />
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button onClick={handleSaveChanges} className="flex-1 btn-primary py-1.5 text-xs">Save</button>
                      <button onClick={() => setIsEditing(false)} className="flex-1 btn-secondary py-1.5 text-xs">Cancel</button>
                    </div>
                   </div>
                ) : (
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold text-secondary-400 uppercase tracking-widest">Transaction Info</h3>
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <Calendar className="h-4 w-4 text-secondary-400 mt-0.5" />
                        <div>
                          <p className="text-xs text-secondary-500">Payment Date</p>
                          <p className="text-sm font-medium text-secondary-900">
                            {formatDate(viewingPayment.payment_date || viewingPayment.created_at)}
                          </p>
                          <p className="text-xs text-secondary-500 mt-0.5">
                            {formatTime(viewingPayment.payment_date || viewingPayment.created_at)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <CreditCard className="h-4 w-4 text-secondary-400 mt-0.5" />
                        <div>
                          <p className="text-xs text-secondary-500">Method</p>
                          <p className="text-sm font-medium text-secondary-900">{viewingPayment.payment_method}</p>
                          {viewingPayment.issuer_bank && (
                             <p className="text-xs text-secondary-500">{viewingPayment.issuer_bank}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <DollarSign className="h-4 w-4 text-secondary-400 mt-0.5" />
                        <div>
                          <p className="text-xs text-secondary-500">Amount</p>
                          <p className="text-sm font-bold text-secondary-900">RM {parseFloat(viewingPayment.amount).toLocaleString()}</p>
                        </div>
                      </div>
                      
                      {/* Detailed info for verified payments */}
                      {activeTab === "verified" && (
                        <>
                          {viewingPayment.payment_index && (
                            <div className="flex items-start gap-3">
                              <Calculator className="h-4 w-4 text-secondary-400 mt-0.5" />
                              <div>
                                <p className="text-xs text-secondary-500">Payment Index</p>
                                <p className="text-sm font-medium text-secondary-900">Payment #{viewingPayment.payment_index}</p>
                              </div>
                            </div>
                          )}
                          {viewingPayment.terminal && (
                            <div className="flex items-start gap-3">
                              <Terminal className="h-4 w-4 text-secondary-400 mt-0.5" />
                              <div>
                                <p className="text-xs text-secondary-500">Terminal</p>
                                <p className="text-sm font-medium text-secondary-900">{viewingPayment.terminal}</p>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}

                <div className="space-y-4 pt-4 border-t border-secondary-200">
                  <h3 className="text-xs font-bold text-secondary-400 uppercase tracking-widest">Customer Details</h3>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-secondary-900">{viewingPayment.customer_name || "N/A"}</p>
                    <p className="text-xs text-secondary-500">ID: {viewingPayment.bubble_id}</p>
                  </div>
                </div>

                {viewingPayment.remark && (
                  <div className="space-y-4 pt-4 border-t border-secondary-200">
                    <h3 className="text-xs font-bold text-secondary-400 uppercase tracking-widest">Remark</h3>
                    <p className="text-sm text-secondary-600 italic bg-white p-3 rounded-lg border border-secondary-200">
                      "{viewingPayment.remark}"
                    </p>
                  </div>
                )}

                {viewingPayment.log && (
                  <div className="space-y-4 pt-4 border-t border-secondary-200">
                    <h3 className="text-xs font-bold text-secondary-400 uppercase tracking-widest flex items-center gap-2">
                      <History className="h-3 w-3" />
                      Modification Log
                    </h3>
                    <div className="text-xs text-secondary-600 bg-white p-3 rounded-lg border border-secondary-200 max-h-32 overflow-y-auto whitespace-pre-line">
                      {viewingPayment.log}
                    </div>
                  </div>
                )}

                {viewingPayment.invoice_bubble_id && (
                  <div className="space-y-4 pt-4 border-t border-secondary-200">
                    <h3 className="text-xs font-bold text-secondary-400 uppercase tracking-widest">Linked Invoice</h3>
                    <button
                      onClick={() => handleViewInvoice(viewingPayment.invoice_bubble_id, viewingPayment.share_token)}
                      className="w-full btn-secondary py-2.5 flex items-center justify-center gap-2 text-sm"
                    >
                      <FileText className="h-4 w-4 text-primary-600" />
                      View Linked Invoice
                    </button>
                  </div>
                )}
                
                {activeTab === "pending" && viewingPayment.status === 'pending' && (
                  <div className="flex gap-2 pt-4">
                     <button
                      onClick={() => {
                        handleVerify(viewingPayment.id);
                        setIsViewModalOpen(false);
                      }}
                      className="flex-1 btn-primary py-3 flex items-center justify-center gap-2"
                    >
                      <CheckCircle className="h-5 w-5" />
                      Verify
                    </button>
                     <button
                      onClick={() => {
                        handleDeleteSubmission(viewingPayment.id);
                        setIsViewModalOpen(false);
                      }}
                      className="px-4 btn-secondary border-red-200 text-red-600 hover:bg-red-50 flex items-center justify-center gap-2"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Attachment Preview */}
              <div className="flex-1 bg-secondary-900 relative overflow-hidden flex items-center justify-center p-4">
                {/* AI Analysis Overlay */}
                <div className="absolute top-4 right-4 z-40 flex flex-col gap-2 max-w-xs">
                  {!aiData && !analyzing ? (
                    <button 
                      onClick={handleAIAnalysis}
                      className="btn-primary bg-primary-600 hover:bg-primary-500 shadow-lg border-none py-2 px-4 flex items-center gap-2 group transition-all"
                    >
                      <Sparkles className="h-4 w-4 group-hover:animate-pulse" />
                      Scan with Gemini AI
                    </button>
                  ) : analyzing ? (
                    <div className="bg-white/90 backdrop-blur-md p-3 rounded-xl shadow-xl border border-primary-200 flex items-center gap-3 animate-pulse">
                      <Loader2 className="h-5 w-5 text-primary-600 animate-spin" />
                      <span className="text-sm font-semibold text-primary-900">AI Analyzing Receipt...</span>
                    </div>
                  ) : aiData && (
                    <div className="bg-white/95 backdrop-blur-md p-4 rounded-xl shadow-2xl border border-primary-100 flex flex-col gap-3 animate-scale-in">
                      <div className="flex items-center justify-between border-b border-secondary-100 pb-2">
                        <div className="flex items-center gap-2">
                          <Zap className="h-4 w-4 text-amber-500 fill-amber-500" />
                          <span className="text-xs font-bold text-secondary-900 uppercase tracking-wider">AI Extracted Data</span>
                        </div>
                        <button onClick={() => setAIData(null)} className="text-secondary-400 hover:text-secondary-600">
                          <X className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="space-y-3">
                        {/* Amount Match */}
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] text-secondary-500 uppercase font-bold">Amount</span>
                          <div className={cn(
                            "flex items-center justify-between p-2 rounded-lg border",
                            parseFloat(aiData.amount) === parseFloat(viewingPayment.amount)
                              ? "bg-green-50 border-green-200 text-green-700"
                              : "bg-red-50 border-red-200 text-red-700"
                          )}>
                            <span className="font-bold">RM {parseFloat(aiData.amount).toLocaleString()}</span>
                            {parseFloat(aiData.amount) === parseFloat(viewingPayment.amount) ? (
                              <CheckCircle className="h-4 w-4" />
                            ) : (
                              <AlertTriangle className="h-4 w-4" />
                            )}
                          </div>
                        </div>

                        {/* Date Match */}
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] text-secondary-500 uppercase font-bold">Payment Date</span>
                          <div className={cn(
                            "flex items-center justify-between p-2 rounded-lg border",
                            aiData.date === (viewingPayment.payment_date ? new Date(viewingPayment.payment_date).toISOString().split('T')[0] : '')
                              ? "bg-green-50 border-green-200 text-green-700"
                              : "bg-red-50 border-red-200 text-red-700"
                          )}>
                            <span className="font-bold">{aiData.date || 'Not found'}</span>
                            {aiData.date === (viewingPayment.payment_date ? new Date(viewingPayment.payment_date).toISOString().split('T')[0] : '') ? (
                              <CheckCircle className="h-4 w-4" />
                            ) : (
                              <AlertTriangle className="h-4 w-4" />
                            )}
                          </div>
                        </div>
                      </div>

                      <button 
                        onClick={applyAIData}
                        className="w-full mt-2 btn-secondary bg-primary-50 border-primary-200 text-primary-700 hover:bg-primary-100 py-2 flex items-center justify-center gap-2 text-xs font-bold"
                      >
                        <Edit className="h-3.5 w-3.5" />
                        Use AI Data
                      </button>
                    </div>
                  )}
                </div>

                {viewingPayment.attachment && viewingPayment.attachment.length > 0 ? (
                  <div 
                    className="relative cursor-none group h-full w-full flex items-center justify-center"
                    onMouseMove={handleMouseMove}
                    onMouseEnter={() => setShowMagnifier(true)}
                    onMouseLeave={() => setShowMagnifier(false)}
                  >
                    <img
                      ref={imgRef}
                      src={viewingPayment.attachment[0]}
                      alt="Payment Attachment"
                      className="max-h-full max-w-full object-contain shadow-2xl transition-opacity group-hover:opacity-90"
                    />
                    
                    {showMagnifier && (
                      <>
                        {/* Custom Cursor / Magnifier Ring */}
                        <div 
                          className="pointer-events-none absolute border-2 border-primary-500 rounded-full shadow-2xl z-50 overflow-hidden"
                          style={{
                            left: `${cursorPos.x - 75}px`,
                            top: `${cursorPos.y - 75}px`,
                            width: '150px',
                            height: '150px',
                            backgroundImage: `url(${viewingPayment.attachment[0]})`,
                            backgroundRepeat: 'no-repeat',
                            backgroundSize: `${imgRef.current ? imgRef.current.width * 2.5 : 0}px ${imgRef.current ? imgRef.current.height * 2.5 : 0}px`,
                            backgroundPosition: `${magnifierPos.x}% ${magnifierPos.y}%`
                          }}
                        />
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/60 backdrop-blur-md rounded-full text-white text-xs flex items-center gap-2 pointer-events-none">
                          <ZoomIn className="h-3 w-3" />
                          Magnifying glass active
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4 text-white/50">
                    <div className="p-8 bg-white/5 rounded-full">
                      <Eye className="h-12 w-12" />
                    </div>
                    <p>No attachment available for this payment</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}