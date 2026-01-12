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
  RefreshCw
} from "lucide-react";
import { getSubmittedPayments, getVerifiedPayments, verifyPayment, getInvoiceDetailsByBubbleId, triggerPaymentSync } from "./actions";
import { cn } from "@/lib/utils";
import InvoiceViewer from "@/components/InvoiceViewer";

export default function PaymentsPage() {
  const [activeTab, setActiveTab] = useState<"pending" | "verified">("pending");
  const [search, setSearch] = useState("");
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [viewingPayment, setViewingPayment] = useState<any | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  
  // Invoice state
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);

  // Magnifying glass state
  const [showMagnifier, setShowMagnifier] = useState(false);
  const [magnifierPos, setMagnifierPos] = useState({ x: 0, y: 0 });
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  async function fetchData() {
    setLoading(true);
    try {
      const data = activeTab === "pending" 
        ? await getSubmittedPayments(search)
        : await getVerifiedPayments(search);
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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchData();
  };

  const handleViewClick = (payment: any) => {
    setViewingPayment(payment);
    setIsViewModalOpen(true);
  };

  const handleVerify = async (id: number) => {
    if (!confirm("Are you sure you want to verify this payment?")) return;
    
    try {
      await verifyPayment(id, "System Admin");
      fetchData();
    } catch (error) {
      console.error("Failed to verify payment", error);
      alert("Failed to verify payment");
    }
  };

  const handleViewInvoice = async (invoiceBubbleId: string) => {
    setLoadingInvoice(true);
    try {
      const details = await getInvoiceDetailsByBubbleId(invoiceBubbleId);
      if (details) {
        setSelectedInvoice(details);
      } else {
        alert("Invoice not found in the system.");
      }
    } catch (error) {
      console.error("Failed to fetch invoice details", error);
      alert("Failed to load invoice details.");
    } finally {
      setLoadingInvoice(false);
    }
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
      {/* Invoice Viewer Modal */}
      {selectedInvoice && (
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
              ) : payments.length === 0 ? (
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
                payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>
                      <div className="flex flex-col">
                        <span className="font-medium text-secondary-900">
                          {payment.payment_date ? new Date(payment.payment_date).toLocaleDateString() : 'N/A'}
                        </span>
                        <span className="text-xs text-secondary-500">
                          {payment.created_at ? new Date(payment.created_at).toLocaleTimeString() : ''}
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
                      <span className="px-2.5 py-1 bg-secondary-100 text-secondary-700 rounded-full text-xs font-medium">
                        {payment.payment_method || "N/A"}
                      </span>
                    </td>
                    <td>
                      <div className="flex flex-col gap-1">
                        {activeTab === "pending" && (
                          <span className={cn(
                            "w-fit px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                            payment.status === 'pending' ? "bg-yellow-100 text-yellow-700" : "bg-secondary-100 text-secondary-700"
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
                        {activeTab === "pending" && payment.status !== 'verified' && (
                          <button 
                            onClick={() => handleVerify(payment.id)}
                            className="btn-ghost text-green-600 hover:text-green-700 flex items-center gap-1.5"
                          >
                            <CheckCircle className="h-4 w-4" />
                            Verify
                          </button>
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
              Showing <span className="font-semibold text-secondary-900">{payments.length}</span> results
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
              <button 
                onClick={() => setIsViewModalOpen(false)}
                className="p-2 hover:bg-secondary-100 rounded-full transition-colors"
              >
                <X className="h-6 w-6 text-secondary-500" />
              </button>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
              {/* Info Sidebar */}
              <div className="w-full md:w-80 bg-secondary-50 p-6 space-y-6 overflow-y-auto border-r border-secondary-200">
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-secondary-400 uppercase tracking-widest">Transaction Info</h3>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <Calendar className="h-4 w-4 text-secondary-400 mt-0.5" />
                      <div>
                        <p className="text-xs text-secondary-500">Payment Date</p>
                        <p className="text-sm font-medium text-secondary-900">
                          {viewingPayment.payment_date ? new Date(viewingPayment.payment_date).toLocaleDateString() : 'N/A'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <CreditCard className="h-4 w-4 text-secondary-400 mt-0.5" />
                      <div>
                        <p className="text-xs text-secondary-500">Method</p>
                        <p className="text-sm font-medium text-secondary-900">{viewingPayment.payment_method}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <DollarSign className="h-4 w-4 text-secondary-400 mt-0.5" />
                      <div>
                        <p className="text-xs text-secondary-500">Amount</p>
                        <p className="text-sm font-bold text-secondary-900">RM {parseFloat(viewingPayment.amount).toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                </div>

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

                {viewingPayment.linked_invoice && (
                  <div className="space-y-4 pt-4 border-t border-secondary-200">
                    <h3 className="text-xs font-bold text-secondary-400 uppercase tracking-widest">Linked Invoice</h3>
                    <button
                      onClick={() => handleViewInvoice(viewingPayment.linked_invoice)}
                      className="w-full btn-secondary py-2.5 flex items-center justify-center gap-2 text-sm"
                    >
                      <FileText className="h-4 w-4 text-primary-600" />
                      View Linked Invoice
                    </button>
                  </div>
                )}
                
                {activeTab === "pending" && (
                  <button
                    onClick={() => {
                      handleVerify(viewingPayment.id);
                      setIsViewModalOpen(false);
                    }}
                    className="w-full btn-primary py-3 flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="h-5 w-5" />
                    Verify Payment
                  </button>
                )}
              </div>

              {/* Attachment Preview with Magnifier */}
              <div className="flex-1 bg-secondary-900 relative overflow-hidden flex items-center justify-center p-4">
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
