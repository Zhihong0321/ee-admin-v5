"use client";

import { useEffect, useRef, useState } from "react";
import { INVOICE_TEMPLATE_HTML } from "@/lib/invoice-template";
import { X, Download, Loader2, FileText, User, CreditCard, Package, MapPin, Phone, Mail, Calendar, DollarSign, Info, Save, Edit2, Plus, Trash2, Check, X as XIcon } from "lucide-react";
import { generateInvoicePdf, updateInvoiceItem, createInvoiceItem, deleteInvoiceItem, updateInvoiceAgent, getAgentsForSelection, getInvoiceDetails } from "@/app/invoices/actions";

interface InvoiceEditorProps {
  invoiceData: any;
  onClose: () => void;
  version?: "v1" | "v2";
}

type Tab = "preview" | "details";

interface EditingItem {
  id: number;
  description: string;
  qty: string;
  unit_price: string;
  amount: string;
}

export default function InvoiceEditor({ invoiceData: initialInvoiceData, onClose, version = "v2" }: InvoiceEditorProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("details");
  const [invoiceData, setInvoiceData] = useState(initialInvoiceData);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editingItem, setEditingItem] = useState<EditingItem | null>(null);
  const [savingItem, setSavingItem] = useState(false);
  const [agents, setAgents] = useState<Array<{ id: number; bubble_id: string; name: string }>>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [savingAgent, setSavingAgent] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItem, setNewItem] = useState({ description: "", qty: "1", unit_price: "0" });
  const [addingItem, setAddingItem] = useState(false);
  const [deletingItemId, setDeletingItemId] = useState<number | null>(null);

  // Load agents on mount
  useEffect(() => {
    async function loadAgents() {
      const result = await getAgentsForSelection();
      if (result.success && result.agents) {
        setAgents(result.agents);
        // Set current agent
        if (invoiceData?.linked_agent) {
          const currentAgent = result.agents.find(a => a.bubble_id === invoiceData.linked_agent);
          if (currentAgent) {
            setSelectedAgentId(currentAgent.bubble_id);
          }
        }
      }
    }
    loadAgents();
  }, [invoiceData?.linked_agent]);

  // Update preview when invoiceData changes
  useEffect(() => {
    if (iframeRef.current && invoiceData && activeTab === "preview") {
      const doc = iframeRef.current.contentDocument || iframeRef.current.contentWindow?.document;
      if (doc) {
        doc.open();
        const dataScript = `<script>window.invoiceData = ${JSON.stringify(invoiceData)};</script>`;
        const htmlWithData = INVOICE_TEMPLATE_HTML.replace('</head>', `${dataScript}</head>`);
        doc.write(htmlWithData);
        doc.close();
      }
    }
  }, [invoiceData, activeTab]);

  const handleDownloadPdf = async () => {
    if (!invoiceData.id) return;
    setDownloading(true);
    try {
      const result = await generateInvoicePdf(invoiceData.id, version);
      if (result?.downloadUrl) {
        window.open(result.downloadUrl, "_blank");
      }
    } catch (error) {
      console.error("Failed to download PDF:", error);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  const startEditingItem = (item: any) => {
    setEditingItem({
      id: item.id,
      description: item.description || "",
      qty: item.qty?.toString() || "1",
      unit_price: item.unit_price?.toString() || "0",
      amount: item.amount?.toString() || "0",
    });
    setEditingItemId(item.id);
  };

  const cancelEditingItem = () => {
    setEditingItem(null);
    setEditingItemId(null);
  };

  const calculateAmount = (qty: string, unitPrice: string) => {
    const qtyNum = parseFloat(qty) || 0;
    const priceNum = parseFloat(unitPrice) || 0;
    return (qtyNum * priceNum).toFixed(2);
  };

  const handleItemFieldChange = (field: keyof EditingItem, value: string) => {
    if (!editingItem) return;
    
    const updated = { ...editingItem, [field]: value };
    
    // Auto-calculate amount when qty or unit_price changes
    if (field === "qty" || field === "unit_price") {
      updated.amount = calculateAmount(
        field === "qty" ? value : updated.qty,
        field === "unit_price" ? value : updated.unit_price
      );
    }
    
    setEditingItem(updated);
  };

  const handleSaveItem = async () => {
    if (!editingItem || !invoiceData?.id) return;

    // Validation
    if (!editingItem.description.trim()) {
      alert("Description is required");
      return;
    }

    const qtyNum = parseFloat(editingItem.qty);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      alert("Quantity must be greater than 0");
      return;
    }

    const priceNum = parseFloat(editingItem.unit_price);
    if (isNaN(priceNum) || priceNum < 0) {
      alert("Unit price must be 0 or greater");
      return;
    }

    setSavingItem(true);
    try {
      const result = await updateInvoiceItem(editingItem.id, {
        description: editingItem.description.trim(),
        qty: qtyNum,
        unit_price: priceNum,
      });

      if (result.success) {
        // Refresh invoice data
        const refreshed = await getInvoiceDetails(invoiceData.id, version);
        if (refreshed) {
          setInvoiceData(refreshed);
        }
        cancelEditingItem();
      } else {
        alert(result.error || "Failed to update item");
      }
    } catch (error) {
      console.error("Error saving item:", error);
      alert("Failed to save item. Please try again.");
    } finally {
      setSavingItem(false);
    }
  };

  const handleAddItem = async () => {
    if (!invoiceData?.id) return;

    // Validation
    if (!newItem.description.trim()) {
      alert("Description is required");
      return;
    }

    const qtyNum = parseFloat(newItem.qty);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      alert("Quantity must be greater than 0");
      return;
    }

    const priceNum = parseFloat(newItem.unit_price);
    if (isNaN(priceNum) || priceNum < 0) {
      alert("Unit price must be 0 or greater");
      return;
    }

    setAddingItem(true);
    try {
      const result = await createInvoiceItem(invoiceData.id, {
        description: newItem.description.trim(),
        qty: qtyNum,
        unit_price: priceNum,
      });

      if (result.success) {
        // Refresh invoice data
        const refreshed = await getInvoiceDetails(invoiceData.id, version);
        if (refreshed) {
          setInvoiceData(refreshed);
        }
        setNewItem({ description: "", qty: "1", unit_price: "0" });
        setShowAddItem(false);
      } else {
        alert(result.error || "Failed to add item");
      }
    } catch (error) {
      console.error("Error adding item:", error);
      alert("Failed to add item. Please try again.");
    } finally {
      setAddingItem(false);
    }
  };

  const handleDeleteItem = async (itemId: number) => {
    if (!invoiceData?.id) return;
    if (!confirm("Are you sure you want to delete this item?")) return;

    setDeletingItemId(itemId);
    try {
      const result = await deleteInvoiceItem(itemId, invoiceData.id);

      if (result.success) {
        // Refresh invoice data
        const refreshed = await getInvoiceDetails(invoiceData.id, version);
        if (refreshed) {
          setInvoiceData(refreshed);
        }
      } else {
        alert(result.error || "Failed to delete item");
      }
    } catch (error) {
      console.error("Error deleting item:", error);
      alert("Failed to delete item. Please try again.");
    } finally {
      setDeletingItemId(null);
    }
  };

  const handleSaveAgent = async () => {
    if (!invoiceData?.id || !selectedAgentId) return;

    setSavingAgent(true);
    try {
      const result = await updateInvoiceAgent(invoiceData.id, selectedAgentId);

      if (result.success) {
        // Refresh invoice data
        const refreshed = await getInvoiceDetails(invoiceData.id, version);
        if (refreshed) {
          setInvoiceData(refreshed);
        }
        alert("Agent updated successfully");
      } else {
        alert(result.error || "Failed to update agent");
      }
    } catch (error) {
      console.error("Error saving agent:", error);
      alert("Failed to save agent. Please try again.");
    } finally {
      setSavingAgent(false);
    }
  };

  // Calculate total from items (client-side for display)
  const calculatedTotal = invoiceData?.items?.reduce((sum: number, item: any) => {
    return sum + (parseFloat(item.amount?.toString() || "0") || 0);
  }, 0) || 0;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 md:p-8 font-sans">
      <div className="bg-white rounded-3xl shadow-2xl w-full h-[95vh] max-h-[95vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-300 border border-secondary-200">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-secondary-200 bg-secondary-900 text-white">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-primary-600 rounded-xl shadow-lg shadow-primary-900/50">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-black uppercase tracking-[0.2em] leading-none">Invoice Control</h2>
              <p className="text-[10px] font-bold text-secondary-400 uppercase tracking-widest mt-1.5">{invoiceData?.invoice_number || 'Draft System Object'}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={handleDownloadPdf}
              disabled={downloading}
              className="bg-white/10 hover:bg-white/20 text-white py-2.5 px-6 rounded-xl transition-all font-black uppercase tracking-widest text-[10px] flex items-center gap-2 border border-white/10"
            >
              {downloading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>Export PDF</span>
            </button>
            <button 
              onClick={onClose}
              className="p-2.5 hover:bg-white/10 rounded-full transition-all text-white/50 hover:text-white"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-8 bg-secondary-50 border-b border-secondary-200">
          <button
            onClick={() => setActiveTab("preview")}
            className={`px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] border-b-4 transition-all ${
              activeTab === "preview"
                ? "border-primary-600 text-primary-600"
                : "border-transparent text-secondary-400 hover:text-secondary-600"
            }`}
          >
            Visual Preview
          </button>
          <button
            onClick={() => setActiveTab("details")}
            className={`px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] border-b-4 transition-all flex items-center gap-2 ${
              activeTab === "details"
                ? "border-primary-600 text-primary-600"
                : "border-transparent text-secondary-400 hover:text-secondary-600"
            }`}
          >
            <Info className="w-4 h-4" />
            Data Management
          </button>
        </div>

        {/* Content */}
        {activeTab === "preview" ? (
          <div className="flex-1 bg-secondary-100 p-8 overflow-auto flex justify-center">
            <iframe 
              ref={iframeRef}
              className="w-full max-w-[850px] bg-white shadow-2xl min-h-[1100px] rounded-lg border border-secondary-200"
              title="Invoice Preview"
            />
          </div>
        ) : (
          <div className="flex-1 overflow-auto bg-white">
            {/* Main Details Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 border-b border-secondary-200">
              {/* Left Column: Summary & Agent */}
              <div className="border-r border-secondary-200 flex flex-col">
                {/* Invoice Summary */}
                <div className="p-10 border-b border-secondary-200 bg-secondary-50/30">
                  <div className="flex items-center gap-3 mb-10">
                    <FileText className="w-5 h-5 text-primary-600" />
                    <h3 className="text-xs font-black text-secondary-900 uppercase tracking-[0.2em]">Core Transaction</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-y-10 gap-x-12">
                    <div>
                      <label className="text-[10px] font-black text-secondary-400 uppercase tracking-widest">Serial Number</label>
                      <p className="text-2xl font-black text-secondary-900 mt-1 tracking-tighter">{invoiceData?.invoice_number || 'N/A'}</p>
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-secondary-400 uppercase tracking-widest">Document Date</label>
                      <p className="text-2xl font-black text-secondary-900 mt-1 tracking-tighter">
                        {invoiceData?.invoice_date 
                          ? new Date(invoiceData.invoice_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                          : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-secondary-400 uppercase tracking-widest">Payment Integrity</label>
                      <div className="flex items-center gap-3 mt-2">
                        <span className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                          invoiceData?.paid ? 'bg-green-600 text-white shadow-lg shadow-green-900/20' : 'bg-amber-500 text-white shadow-lg shadow-amber-900/20'
                        }`}>
                          {invoiceData?.paid ? 'Settled' : 'Pending'}
                        </span>
                        <span className="text-xl font-black text-secondary-900 font-mono tracking-tighter">
                          {invoiceData?.percent_of_total_amount ? `${parseFloat(invoiceData.percent_of_total_amount).toFixed(1)}%` : '0%'}
                        </span>
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-secondary-400 uppercase tracking-widest">Audit Trail</label>
                      <p className="text-[10px] font-black text-secondary-700 mt-2 uppercase border border-secondary-200 inline-block px-3 py-1.5 rounded-xl tracking-tighter bg-white shadow-sm">{invoiceData?.created_by_user_name || 'System Auto'}</p>
                    </div>
                  </div>
                </div>

                {/* Agent Selection */}
                <div className="p-10 flex-1 bg-white">
                  <div className="flex items-center gap-3 mb-8">
                    <User className="w-5 h-5 text-primary-600" />
                    <h3 className="text-xs font-black text-secondary-900 uppercase tracking-[0.2em]">Stakeholder Assignment</h3>
                  </div>
                  <div className="space-y-6 max-w-sm">
                    <div className="relative">
                      <select
                        value={selectedAgentId}
                        onChange={(e) => setSelectedAgentId(e.target.value)}
                        className="w-full h-14 px-6 appearance-none bg-secondary-50 border-2 border-secondary-100 hover:border-primary-500 focus:border-primary-600 transition-all font-black text-secondary-900 uppercase text-xs tracking-[0.1em] rounded-2xl outline-none"
                        disabled={savingAgent}
                      >
                        <option value="">Choose Assigned Agent</option>
                        {agents.map((agent) => (
                          <option key={agent.id} value={agent.bubble_id}>
                            {agent.name}
                          </option>
                        ))}
                      </select>
                      <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-secondary-300 border-l border-secondary-200 pl-4">
                        <User className="w-5 h-5" />
                      </div>
                    </div>
                    <button
                      onClick={handleSaveAgent}
                      disabled={savingAgent || !selectedAgentId}
                      className="bg-secondary-900 hover:bg-black text-white w-full py-4 rounded-2xl shadow-2xl flex items-center justify-center gap-3 group transition-all active:scale-95"
                    >
                      {savingAgent ? (
                        <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
                      ) : (
                        <Save className="w-5 h-5 group-hover:scale-110 transition-transform text-primary-500" />
                      )}
                      <span className="uppercase tracking-[0.2em] font-black text-[10px]">Update Assignment</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Column: Customer Details */}
              <div className="p-10 bg-white flex flex-col">
                <div className="flex items-center gap-3 mb-10">
                  <User className="w-5 h-5 text-primary-600" />
                  <h3 className="text-xs font-black text-secondary-900 uppercase tracking-[0.2em]">Customer Profile</h3>
                </div>
                {invoiceData?.customer_data ? (
                  <div className="space-y-12 flex-1">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                      <div>
                        <label className="text-[10px] font-black text-secondary-400 uppercase tracking-widest">Full Legal Name</label>
                        <p className="text-3xl font-black text-secondary-900 mt-1 leading-none tracking-tighter uppercase">{invoiceData.customer_data.name || 'N/A'}</p>
                      </div>
                      <div>
                        <label className="text-[10px] font-black text-secondary-400 uppercase tracking-widest">Identity Document (IC)</label>
                        <p className="text-3xl font-black text-secondary-900 mt-1 font-mono tracking-tighter">{invoiceData.customer_data.ic_number || 'N/A'}</p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12 border-t border-secondary-100 pt-12">
                      <div className="flex items-start gap-5">
                        <div className="p-4 bg-secondary-900 rounded-[1.25rem] text-white shadow-xl">
                          <Mail className="w-6 h-6" />
                        </div>
                        <div className="min-w-0">
                          <label className="text-[10px] font-black text-secondary-400 uppercase tracking-widest">Electronic Mail</label>
                          <p className="text-base font-black text-secondary-900 truncate mt-1">{invoiceData.customer_data.email || 'N/A'}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-5">
                        <div className="p-4 bg-secondary-900 rounded-[1.25rem] text-white shadow-xl">
                          <Phone className="w-6 h-6" />
                        </div>
                        <div>
                          <label className="text-[10px] font-black text-secondary-400 uppercase tracking-widest">Direct Contact</label>
                          <p className="text-base font-black text-secondary-900 mt-1">{invoiceData.customer_data.phone || 'N/A'}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-start gap-5 border-t border-secondary-100 pt-12">
                      <div className="p-4 bg-secondary-900 rounded-[1.25rem] text-white shadow-xl">
                        <MapPin className="w-6 h-6" />
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] font-black text-secondary-400 uppercase tracking-widest">Service Domicile</label>
                        <p className="text-base font-black text-secondary-900 mt-3 leading-relaxed uppercase tracking-tight max-w-md">
                          {invoiceData.customer_data.address ? `${invoiceData.customer_data.address}, ` : ''}
                          <br />
                          {invoiceData.customer_data.city ? `${invoiceData.customer_data.city}, ` : ''}
                          {invoiceData.customer_data.state ? `${invoiceData.customer_data.state} ` : ''}
                          {invoiceData.customer_data.postcode || ''}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center py-20 text-secondary-200 border-4 border-dotted border-secondary-50 rounded-[3rem] bg-secondary-50/20">
                    <User className="w-20 h-20 mb-6 opacity-5" />
                    <p className="font-black uppercase tracking-[0.4em] text-[10px]">Registry Link Broken</p>
                  </div>
                )}
              </div>
            </div>

            {/* Invoice Items Section */}
            <div className="border-b border-secondary-200">
              <div className="flex items-center justify-between px-10 py-8 bg-secondary-900">
                <div className="flex items-center gap-5">
                  <Package className="w-7 h-7 text-primary-500" />
                  <h3 className="text-xs font-black text-white uppercase tracking-[0.4em]">Itemized Billing Table</h3>
                  <div className="px-3 py-1 bg-white text-secondary-900 text-[10px] font-black rounded-lg uppercase tracking-tighter shadow-lg">
                    {invoiceData?.items?.length || 0} ENTRIES
                  </div>
                </div>
                {version === "v2" && (
                  <button
                    onClick={() => setShowAddItem(!showAddItem)}
                    className="bg-primary-600 hover:bg-primary-500 text-white flex items-center gap-3 text-[10px] px-8 py-4 rounded-[1.25rem] transition-all font-black uppercase tracking-widest shadow-2xl shadow-primary-900/40 active:scale-95 border border-primary-500/50"
                  >
                    <Plus className="w-5 h-5" />
                    Append Line
                  </button>
                )}
              </div>

              {/* Add Item Form */}
              {showAddItem && (
                <div className="p-12 bg-primary-50 border-y border-primary-200 animate-in fade-in slide-in-from-top-8 duration-700">
                  <div className="max-w-5xl mx-auto bg-white p-10 rounded-[3rem] border border-primary-100 shadow-[0_35px_60px_-15px_rgba(0,0,0,0.1)]">
                    <div className="flex items-center justify-between mb-10">
                      <div className="flex items-center gap-4">
                        <div className="w-4 h-4 rounded-full bg-primary-600 shadow-lg shadow-primary-200" />
                        <h4 className="font-black text-secondary-900 uppercase text-xs tracking-[0.3em]">Initialize New Line Entry</h4>
                      </div>
                      <button onClick={() => setShowAddItem(false)} className="p-2.5 hover:bg-primary-50 rounded-full transition-colors text-primary-300">
                        <XIcon className="w-7 h-7" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
                      <div className="md:col-span-6">
                        <label className="text-[10px] font-black text-secondary-400 uppercase tracking-widest mb-3 block">Description of Goods / Services</label>
                        <input
                          type="text"
                          value={newItem.description}
                          onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                          className="w-full h-16 px-6 py-4 rounded-2xl border-2 border-secondary-100 focus:border-primary-500 bg-secondary-50 font-black text-secondary-900 placeholder:text-secondary-300 focus:ring-8 focus:ring-primary-100 transition-all outline-none"
                          placeholder="e.g. Turnkey EPC Solution for Commercial Solar"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="text-[10px] font-black text-secondary-400 uppercase tracking-widest mb-3 block text-center">Unit Qty</label>
                        <input
                          type="number"
                          step="0.01"
                          value={newItem.qty}
                          onChange={(e) => setNewItem({ ...newItem, qty: e.target.value })}
                          className="w-full h-16 px-6 rounded-2xl border-2 border-secondary-100 focus:border-primary-500 text-center bg-secondary-50 font-black text-secondary-900 focus:ring-8 focus:ring-primary-100 transition-all outline-none"
                        />
                      </div>
                      <div className="md:col-span-4">
                        <label className="text-[10px] font-black text-secondary-400 uppercase tracking-widest mb-3 block text-right">Unit Rate (MYR)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={newItem.unit_price}
                          onChange={(e) => setNewItem({ ...newItem, unit_price: e.target.value })}
                          className="w-full h-16 px-6 rounded-2xl border-2 border-secondary-100 focus:border-primary-500 text-right font-mono font-black text-secondary-900 focus:ring-8 focus:ring-primary-100 transition-all outline-none bg-secondary-50"
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-8 mt-12 pt-10 border-t border-secondary-100">
                      <div className="mr-auto">
                        <span className="text-[10px] font-black text-secondary-400 uppercase tracking-widest">Entry Valuation</span>
                        <div className="text-4xl font-black text-primary-600 font-mono tracking-tighter mt-1">
                          MYR {parseFloat(calculateAmount(newItem.qty, newItem.unit_price)).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                      <button
                        onClick={handleAddItem}
                        disabled={addingItem}
                        className="bg-secondary-900 hover:bg-black text-white h-16 px-14 rounded-2xl shadow-2xl flex items-center gap-4 transition-all active:scale-95"
                      >
                        {addingItem ? <Loader2 className="w-6 h-6 animate-spin text-primary-500" /> : <><Plus className="w-6 h-6 text-primary-500" /><span className="font-black uppercase tracking-widest text-xs">Append to Record</span></>}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="p-0 overflow-x-auto">
                {invoiceData?.items && invoiceData.items.length > 0 ? (
                  <table className="w-full border-collapse min-w-[1100px]">
                    <thead>
                      <tr className="bg-secondary-50/50 border-b border-secondary-200">
                        <th className="px-12 py-8 text-left text-[10px] font-black text-secondary-400 uppercase tracking-[0.3em]">Line Specification</th>
                        <th className="px-12 py-8 text-center text-[10px] font-black text-secondary-400 uppercase tracking-[0.3em] w-36">Units</th>
                        <th className="px-12 py-8 text-right text-[10px] font-black text-secondary-400 uppercase tracking-[0.3em] w-52">Rate</th>
                        <th className="px-12 py-8 text-right text-[10px] font-black text-secondary-400 uppercase tracking-[0.3em] w-52">Valuation</th>
                        <th className="px-12 py-8 text-right text-[10px] font-black text-secondary-400 uppercase tracking-[0.3em] w-48">Execution</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-secondary-100">
                      {invoiceData.items.map((item: any, index: number) => {
                        const isEditing = editingItemId === item.id;
                        const itemData = isEditing && editingItem ? editingItem : item;

                        return (
                          <tr key={item.id || index} className={`${isEditing ? "bg-primary-50/50" : "hover:bg-secondary-50/30 transition-all group"}`}>
                            <td className="px-12 py-8">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={itemData.description}
                                  onChange={(e) => handleItemFieldChange("description", e.target.value)}
                                  className="w-full h-12 px-5 py-2 rounded-xl border-2 border-primary-200 bg-white font-black text-secondary-900 shadow-inner outline-none focus:border-primary-500 transition-all"
                                />
                              ) : (
                                <div>
                                  <div className="font-black text-secondary-900 leading-tight text-xl uppercase tracking-tighter">{item.description || 'N/A'}</div>
                                  {item.inv_item_type && (
                                    <div className="inline-block px-3 py-1 bg-secondary-900 text-[9px] font-black text-white uppercase tracking-widest mt-3 rounded-lg">{item.inv_item_type}</div>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-12 py-8 text-center">
                              {isEditing ? (
                                <input
                                  type="number"
                                  step="0.01"
                                  value={itemData.qty}
                                  onChange={(e) => handleItemFieldChange("qty", e.target.value)}
                                  className="w-28 h-12 px-5 py-2 rounded-xl border-2 border-primary-200 bg-white font-black text-secondary-900 text-center shadow-inner outline-none focus:border-primary-500 transition-all"
                                />
                              ) : (
                                <span className="font-black text-secondary-900 font-mono text-2xl tracking-tighter">{item.qty || 0}</span>
                              )}
                            </td>
                            <td className="px-12 py-8 text-right">
                              {isEditing ? (
                                <input
                                  type="number"
                                  step="0.01"
                                  value={itemData.unit_price}
                                  onChange={(e) => handleItemFieldChange("unit_price", e.target.value)}
                                  className="w-36 h-12 px-5 py-2 rounded-xl border-2 border-primary-200 bg-white font-mono font-black text-secondary-900 text-right shadow-inner outline-none focus:border-primary-500 transition-all"
                                />
                              ) : (
                                <span className="font-black text-secondary-500 font-mono text-lg">
                                  {item.unit_rate ? parseFloat(item.unit_rate).toLocaleString('en-US', { minimumFractionDigits: 2 }) : (item.unit_price ? parseFloat(item.unit_price).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00')}
                                </span>
                              )}
                            </td>
                            <td className="px-12 py-8 text-right font-black text-secondary-900 font-mono tracking-tighter text-2xl">
                              {parseFloat(itemData.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-12 py-8 text-right">
                              <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-all transform group-hover:translate-x-0 translate-x-4">
                                {isEditing ? (
                                  <div className="flex items-center gap-2 opacity-100 translate-x-0">
                                    <button
                                      onClick={handleSaveItem}
                                      disabled={savingItem}
                                      className="p-4 text-white bg-primary-600 hover:bg-primary-700 rounded-2xl transition-all shadow-xl shadow-primary-200 active:scale-95"
                                      title="Commit Changes"
                                    >
                                      {savingItem ? <Loader2 className="w-6 h-6 animate-spin" /> : <Check className="w-6 h-6" />}
                                    </button>
                                    <button
                                      onClick={cancelEditingItem}
                                      className="p-4 text-secondary-400 hover:bg-secondary-100 rounded-2xl transition-all active:scale-95"
                                      title="Cancel"
                                    >
                                      <XIcon className="w-6 h-6" />
                                    </button>
                                  </div>
                                ) : (
                                  version === "v2" && (
                                    <>
                                      <button
                                        onClick={() => startEditingItem(item)}
                                        className="p-4 text-secondary-400 hover:text-primary-600 hover:bg-primary-50 rounded-2xl transition-all active:scale-95"
                                        title="Modify Entry"
                                      >
                                        <Edit2 className="w-6 h-6" />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteItem(item.id)}
                                        className="p-4 text-secondary-400 hover:text-red-600 hover:bg-red-50 rounded-2xl transition-all active:scale-95"
                                        title="Purge Entry"
                                      >
                                        <Trash2 className="w-6 h-6" />
                                      </button>
                                    </>
                                  )
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="bg-secondary-900 text-white shadow-[0_-20px_50px_-15px_rgba(0,0,0,0.3)] relative z-10">
                        <td colSpan={3} className="px-12 py-12 text-right font-black uppercase tracking-[0.5em] text-secondary-400 text-xs">Gross Document Valuation (MYR)</td>
                        <td className="px-12 py-12 text-right font-black text-5xl font-mono tracking-tighter text-primary-500">
                          {parseFloat(invoiceData.total_amount || calculatedTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                ) : (
                  <div className="py-40 text-center text-secondary-200 border-b border-secondary-100 bg-secondary-50/20">
                    <Package className="w-24 h-24 mx-auto mb-8 opacity-5" />
                    <p className="font-black uppercase tracking-[0.4em] text-xs">Void Transaction State</p>
                    <p className="text-sm font-black mt-4 text-secondary-400">Add entries to populate this document's financial matrix.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Payments Section */}
            <div className="p-12 bg-white">
              <div className="flex items-center gap-5 mb-12 border-b-2 border-secondary-900 pb-10">
                <CreditCard className="w-8 h-8 text-primary-600" />
                <h3 className="text-xs font-black text-secondary-900 uppercase tracking-[0.4em]">Remittance Ledger</h3>
                <div className="ml-auto flex flex-col items-end">
                  <span className="text-[10px] font-black text-secondary-400 uppercase tracking-widest mb-2">Aggregate Cleared</span>
                  <span className="text-5xl font-black text-green-600 font-mono tracking-tighter leading-none">
                    MYR {parseFloat(invoiceData?.total_payments || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
              
              {invoiceData?.linked_payments && invoiceData.linked_payments.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-10">
                  {invoiceData.linked_payments.map((payment: any, index: number) => (
                    <div key={payment.id || index} className="p-10 rounded-[2.5rem] border-2 border-secondary-100 bg-secondary-50/30 hover:border-green-400 hover:bg-white hover:shadow-[0_40px_80px_-15px_rgba(22,163,74,0.15)] transition-all duration-700 group relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 rounded-full -mr-16 -mt-16 group-hover:scale-[2.5] transition-transform duration-1000" />
                      <div className="flex items-center justify-between mb-8 relative z-10">
                        <div className="px-4 py-1.5 bg-secondary-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest group-hover:bg-green-600 transition-colors shadow-lg">
                          {payment.payment_method_v2 || payment.payment_method || 'REMIT'}
                        </div>
                        <div className="text-[10px] font-black text-secondary-400 group-hover:text-green-600 transition-colors">
                          {payment.payment_date ? new Date(payment.payment_date).toLocaleDateString() : 'N/A'}
                        </div>
                      </div>
                      <div className="text-4xl font-black text-secondary-900 font-mono tracking-tighter mb-6 group-hover:translate-x-2 transition-transform relative z-10">
                        {parseFloat(payment.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                      <div className="flex flex-col gap-2 relative z-10 border-t border-secondary-100 pt-6">
                        <span className="text-[10px] font-black text-secondary-400 uppercase tracking-[0.2em]">{payment.issuer_bank || payment.terminal || 'Universal Remit'}</span>
                        {payment.epp_month && <span className="inline-block self-start px-3 py-1 bg-green-100 text-green-700 rounded-lg text-[10px] font-black mt-2 uppercase shadow-sm">Credit Installment: {payment.epp_month} M</span>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-32 text-secondary-200 border-8 border-dotted border-secondary-50 rounded-[4rem] bg-secondary-50/10">
                  <CreditCard className="w-24 h-24 mb-8 opacity-5" />
                  <p className="font-black uppercase tracking-[0.5em] text-xs">Zero Liquidity Record</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-8 py-6 border-t border-secondary-200 bg-secondary-900 flex justify-between items-center text-white">
          <div className="text-[10px] font-black uppercase tracking-widest text-secondary-400 flex items-center gap-2">
            System Custodian: <span className="text-primary-500">{invoiceData?.created_by_user_name || 'Autonomous Core'}</span>
          </div>
          <div className="flex gap-4">
            <button onClick={onClose} className="bg-white/10 hover:bg-white/20 text-white py-3 px-8 rounded-xl transition-all font-black uppercase tracking-widest text-[10px]">
              Dismiss Editor
            </button>
            <button 
              onClick={handleDownloadPdf}
              disabled={downloading}
              className="bg-primary-600 hover:bg-primary-500 text-white py-3 px-10 rounded-xl transition-all font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary-900/40"
            >
              Authorize Download
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}