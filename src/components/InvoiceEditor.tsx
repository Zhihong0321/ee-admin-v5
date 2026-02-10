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
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4 md:p-8">
      <div className="bg-white rounded-xl shadow-xl w-full h-[95vh] max-h-[95vh] flex flex-col overflow-hidden border border-secondary-200">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-secondary-200 bg-white">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-secondary-100 rounded text-secondary-600">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-secondary-900">Invoice Editor</h2>
              <p className="text-[11px] text-secondary-500 font-medium">{invoiceData?.invoice_number || 'Draft'}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={handleDownloadPdf}
              disabled={downloading}
              className="text-[12px] font-medium text-secondary-700 hover:text-secondary-900 flex items-center gap-2 px-3 py-1.5 rounded border border-secondary-200 hover:bg-secondary-50 transition-colors"
            >
              {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              <span>Download PDF</span>
            </button>
            <button 
              onClick={onClose}
              className="p-1.5 hover:bg-secondary-100 rounded-md transition-colors text-secondary-400 hover:text-secondary-900"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs Bar */}
        <div className="flex items-center px-6 border-b border-secondary-200 bg-secondary-50/50">
          <button
            onClick={() => setActiveTab("details")}
            className={`px-4 py-2.5 text-[12px] font-medium border-b-2 transition-all mr-2 ${
              activeTab === "details"
                ? "border-primary-600 text-primary-600"
                : "border-transparent text-secondary-500 hover:text-secondary-700"
            }`}
          >
            Invoice Details
          </button>
          <button
            onClick={() => setActiveTab("preview")}
            className={`px-4 py-2.5 text-[12px] font-medium border-b-2 transition-all ${
              activeTab === "preview"
                ? "border-primary-600 text-primary-600"
                : "border-transparent text-secondary-500 hover:text-secondary-700"
            }`}
          >
            Preview Document
          </button>
        </div>

        {/* Content Area */}
        {activeTab === "preview" ? (
          <div className="flex-1 bg-secondary-100/50 p-6 overflow-auto flex justify-center">
            <iframe 
              ref={iframeRef}
              className="w-full max-w-[800px] bg-white shadow-sm min-h-[1100px] border border-secondary-200"
              title="Invoice Preview"
            />
          </div>
        ) : (
          <div className="flex-1 overflow-auto bg-white">
            {/* Split Layout: Info & Customer */}
            <div className="grid grid-cols-1 lg:grid-cols-2 border-b border-secondary-200">
              {/* Info Column */}
              <div className="border-r border-secondary-200">
                {/* Summary Section */}
                <div className="p-6 border-b border-secondary-100 bg-secondary-50/20">
                  <h3 className="text-[11px] font-bold text-secondary-400 uppercase tracking-wider mb-6">General Information</h3>
                  <div className="grid grid-cols-2 gap-y-6 gap-x-8">
                    <div>
                      <span className="text-[11px] font-medium text-secondary-500 block mb-1">Invoice Number</span>
                      <p className="text-sm font-semibold text-secondary-900">{invoiceData?.invoice_number || 'N/A'}</p>
                    </div>
                    <div>
                      <span className="text-[11px] font-medium text-secondary-500 block mb-1">Date of Issue</span>
                      <p className="text-sm font-semibold text-secondary-900">
                        {invoiceData?.invoice_date 
                          ? new Date(invoiceData.invoice_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                          : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <span className="text-[11px] font-medium text-secondary-500 block mb-1">Status</span>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          invoiceData?.paid ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                          {invoiceData?.paid ? 'Paid' : 'Unpaid'}
                        </span>
                        <span className="text-[11px] font-bold text-secondary-500 font-mono">
                          {invoiceData?.percent_of_total_amount ? `${parseFloat(invoiceData.percent_of_total_amount).toFixed(1)}%` : '0%'}
                        </span>
                      </div>
                    </div>
                    <div>
                      <span className="text-[11px] font-medium text-secondary-500 block mb-1">Source</span>
                      <p className="text-[11px] font-bold text-secondary-600 uppercase border border-secondary-200 inline-block px-1.5 py-0.5 rounded bg-white">{invoiceData?.created_by_user_name || 'System'}</p>
                    </div>
                  </div>
                </div>

                {/* Agent Assignment */}
                <div className="p-6">
                  <h3 className="text-[11px] font-bold text-secondary-400 uppercase tracking-wider mb-4">Internal Assignment</h3>
                  <div className="flex items-center gap-2 max-w-sm">
                    <select
                      value={selectedAgentId}
                      onChange={(e) => setSelectedAgentId(e.target.value)}
                      className="flex-1 h-9 px-3 bg-white border border-secondary-200 rounded text-sm font-medium text-secondary-900 outline-none focus:border-primary-500 transition-colors"
                      disabled={savingAgent}
                    >
                      <option value="">Select Assigned Agent</option>
                      {agents.map((agent) => (
                        <option key={agent.id} value={agent.bubble_id}>
                          {agent.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handleSaveAgent}
                      disabled={savingAgent || !selectedAgentId}
                      className="h-9 px-3 bg-secondary-900 hover:bg-black text-white rounded text-[11px] font-bold uppercase tracking-wider transition-all disabled:opacity-50"
                    >
                      {savingAgent ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Assign'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Customer Column */}
              <div className="p-6">
                <h3 className="text-[11px] font-bold text-secondary-400 uppercase tracking-wider mb-6">Customer Profile</h3>
                {invoiceData?.customer_data ? (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-8">
                      <div>
                        <span className="text-[11px] font-medium text-secondary-500 block mb-1">Full Name</span>
                        <p className="text-base font-bold text-secondary-900 tracking-tight">{invoiceData.customer_data.name || 'N/A'}</p>
                      </div>
                      <div>
                        <span className="text-[11px] font-medium text-secondary-500 block mb-1">IC / Identification</span>
                        <p className="text-base font-bold text-secondary-900 font-mono">{invoiceData.customer_data.ic_number || 'N/A'}</p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-8 border-t border-secondary-100 pt-6">
                      <div className="flex items-start gap-3">
                        <Mail className="w-4 h-4 text-secondary-400 mt-0.5" />
                        <div className="min-w-0">
                          <span className="text-[11px] font-medium text-secondary-500 block">Email</span>
                          <p className="text-sm font-medium text-secondary-900 truncate">{invoiceData.customer_data.email || 'N/A'}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <Phone className="w-4 h-4 text-secondary-400 mt-0.5" />
                        <div>
                          <span className="text-[11px] font-medium text-secondary-500 block">Contact</span>
                          <p className="text-sm font-medium text-secondary-900">{invoiceData.customer_data.phone || 'N/A'}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 border-t border-secondary-100 pt-6">
                      <MapPin className="w-4 h-4 text-secondary-400 mt-0.5" />
                      <div>
                        <span className="text-[11px] font-medium text-secondary-500 block">Installation Address</span>
                        <p className="text-sm font-medium text-secondary-900 mt-1 leading-relaxed">
                          {invoiceData.customer_data.address ? `${invoiceData.customer_data.address}, ` : ''}
                          {invoiceData.customer_data.city ? `${invoiceData.customer_data.city}, ` : ''}
                          {invoiceData.customer_data.state ? `${invoiceData.customer_data.state} ` : ''}
                          {invoiceData.customer_data.postcode || ''}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center py-12 text-secondary-400 border border-dashed border-secondary-200 rounded bg-secondary-50/50">
                    <p className="text-[11px] font-medium italic">No customer record linked</p>
                  </div>
                )}
              </div>
            </div>

            {/* Line Items Section */}
            <div className="border-b border-secondary-200">
              <div className="flex items-center justify-between px-6 py-4 bg-secondary-50/50 border-b border-secondary-100">
                <div className="flex items-center gap-3">
                  <h3 className="text-[11px] font-bold text-secondary-900 uppercase tracking-widest">Billing Details</h3>
                  <span className="text-[10px] font-bold text-secondary-400">{invoiceData?.items?.length || 0} entries</span>
                </div>
                {version === "v2" && (
                  <button
                    onClick={() => setShowAddItem(!showAddItem)}
                    className="h-8 px-3 text-[11px] font-bold uppercase tracking-wider text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded transition-all flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Item
                  </button>
                )}
              </div>

              {/* Add Item Form */}
              {showAddItem && (
                <div className="p-6 bg-white border-b border-secondary-100">
                  <div className="max-w-4xl">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                      <div className="md:col-span-6">
                        <label className="text-[11px] font-bold text-secondary-500 uppercase mb-2 block">Item Description</label>
                        <input
                          type="text"
                          value={newItem.description}
                          onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                          className="w-full h-9 px-3 rounded border border-secondary-200 focus:border-primary-500 text-sm font-medium outline-none transition-all"
                          placeholder="e.g. Solar PV System"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="text-[11px] font-bold text-secondary-500 uppercase mb-2 block text-center">Qty</label>
                        <input
                          type="number"
                          step="0.01"
                          value={newItem.qty}
                          onChange={(e) => setNewItem({ ...newItem, qty: e.target.value })}
                          className="w-full h-9 rounded border border-secondary-200 focus:border-primary-500 text-center text-sm font-bold outline-none transition-all"
                        />
                      </div>
                      <div className="md:col-span-4">
                        <label className="text-[11px] font-bold text-secondary-500 uppercase mb-2 block text-right">Unit Price (MYR)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={newItem.unit_price}
                          onChange={(e) => setNewItem({ ...newItem, unit_price: e.target.value })}
                          className="w-full h-9 px-3 rounded border border-secondary-200 focus:border-primary-500 text-right font-mono text-sm font-bold outline-none transition-all"
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-4 mt-6">
                      <div className="text-right">
                        <span className="text-[10px] font-bold text-secondary-400 uppercase block">Line Subtotal</span>
                        <div className="text-lg font-bold text-secondary-900 font-mono tracking-tighter">
                          RM {parseFloat(calculateAmount(newItem.qty, newItem.unit_price)).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                      <button
                        onClick={handleAddItem}
                        disabled={addingItem}
                        className="h-9 px-6 bg-primary-600 hover:bg-primary-700 text-white rounded text-[11px] font-bold uppercase tracking-wider transition-all disabled:opacity-50 shadow-sm"
                      >
                        {addingItem ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm Add'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                {invoiceData?.items && invoiceData.items.length > 0 ? (
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-secondary-100 bg-secondary-50/30">
                        <th className="px-6 py-3 text-left text-[11px] font-bold text-secondary-400 uppercase tracking-wider">Description</th>
                        <th className="px-6 py-3 text-center text-[11px] font-bold text-secondary-400 uppercase tracking-wider w-24">Qty</th>
                        <th className="px-6 py-3 text-right text-[11px] font-bold text-secondary-400 uppercase tracking-wider w-40">Unit Rate</th>
                        <th className="px-6 py-3 text-right text-[11px] font-bold text-secondary-400 uppercase tracking-wider w-40">Amount</th>
                        <th className="px-6 py-3 text-right text-[11px] font-bold text-secondary-400 uppercase tracking-wider w-32">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-secondary-50">
                      {invoiceData.items.map((item: any, index: number) => {
                        const isEditing = editingItemId === item.id;
                        const itemData = isEditing && editingItem ? editingItem : item;

                        return (
                          <tr key={item.id || index} className={`${isEditing ? "bg-primary-50/20" : "hover:bg-secondary-50/20 transition-all group"}`}>
                            <td className="px-6 py-4">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={itemData.description}
                                  onChange={(e) => handleItemFieldChange("description", e.target.value)}
                                  className="w-full h-8 px-2 rounded border border-primary-200 text-sm font-medium outline-none"
                                />
                              ) : (
                                <div>
                                  <div className="text-sm font-semibold text-secondary-900 leading-tight">{item.description || 'N/A'}</div>
                                  {item.inv_item_type && (
                                    <div className="text-[9px] font-bold text-secondary-400 uppercase mt-1 tracking-tight">{item.inv_item_type}</div>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4 text-center">
                              {isEditing ? (
                                <input
                                  type="number"
                                  step="0.01"
                                  value={itemData.qty}
                                  onChange={(e) => handleItemFieldChange("qty", e.target.value)}
                                  className="w-16 h-8 border border-primary-200 rounded text-sm text-center font-bold"
                                />
                              ) : (
                                <span className="text-sm font-medium text-secondary-700 font-mono">{item.qty || 0}</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right">
                              {isEditing ? (
                                <input
                                  type="number"
                                  step="0.01"
                                  value={itemData.unit_price}
                                  onChange={(e) => handleItemFieldChange("unit_price", e.target.value)}
                                  className="w-24 h-8 border border-primary-200 rounded text-sm text-right font-mono"
                                />
                              ) : (
                                <span className="text-sm font-medium text-secondary-500 font-mono">
                                  {item.unit_rate ? parseFloat(item.unit_rate).toLocaleString('en-US', { minimumFractionDigits: 2 }) : (item.unit_price ? parseFloat(item.unit_price).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00')}
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right font-bold text-secondary-900 font-mono">
                              {parseFloat(itemData.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                {isEditing ? (
                                  <>
                                    <button
                                      onClick={handleSaveItem}
                                      disabled={savingItem}
                                      className="p-1 text-primary-600 hover:bg-primary-50 rounded"
                                    >
                                      {savingItem ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-4 h-4" />}
                                    </button>
                                    <button onClick={cancelEditingItem} className="p-1 text-secondary-400 hover:bg-secondary-50 rounded">
                                      <XIcon className="w-4 h-4" />
                                    </button>
                                  </>
                                ) : (
                                  version === "v2" && (
                                    <>
                                      <button onClick={() => startEditingItem(item)} className="p-1.5 text-secondary-400 hover:text-primary-600 rounded-md hover:bg-primary-50 transition-colors">
                                        <Edit2 className="w-3.5 h-3.5" />
                                      </button>
                                      <button onClick={() => handleDeleteItem(item.id)} className="p-1.5 text-secondary-400 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors">
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </>
                                  )
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="bg-secondary-50/50 border-t border-secondary-200">
                        <td colSpan={3} className="px-6 py-6 text-right font-bold uppercase tracking-wider text-secondary-400 text-[10px]">Total Amount (RM)</td>
                        <td className="px-6 py-6 text-right font-bold text-lg font-mono text-secondary-900">
                          {parseFloat(invoiceData.total_amount || calculatedTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                ) : (
                  <div className="py-20 text-center text-secondary-300">
                    <p className="text-[11px] font-bold uppercase tracking-widest">No Line Items Defined</p>
                  </div>
                )}
              </div>
            </div>

            {/* Remittance Registry */}
            <div className="p-6">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-[11px] font-bold text-secondary-900 uppercase tracking-widest flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-secondary-400" />
                  Payments Registry
                </h3>
                <div className="text-right">
                  <span className="text-[10px] font-bold text-secondary-400 uppercase block">Total Remitted</span>
                  <span className="text-xl font-bold text-green-600 font-mono tracking-tighter">
                    RM {parseFloat(invoiceData?.total_payments || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
              
              {invoiceData?.linked_payments && invoiceData.linked_payments.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  {invoiceData.linked_payments.map((payment: any, index: number) => (
                    <div key={payment.id || index} className="p-4 rounded border border-secondary-100 bg-secondary-50/20 hover:border-secondary-300 transition-all group">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-secondary-500 bg-white border border-secondary-200 px-1.5 py-0.5 rounded leading-none">{payment.payment_method_v2 || payment.payment_method || 'Entry'}</span>
                        <span className="text-[10px] font-medium text-secondary-400">{payment.payment_date ? new Date(payment.payment_date).toLocaleDateString() : 'N/A'}</span>
                      </div>
                      <div className="text-lg font-bold text-secondary-900 font-mono leading-none mb-2">
                        {parseFloat(payment.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                      <div className="text-[10px] font-medium text-secondary-400 uppercase truncate">
                        {payment.issuer_bank || payment.terminal || 'Bank Remit'}
                        {payment.epp_month ? ` • ${payment.epp_month}M Install` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center text-secondary-300 border border-dashed border-secondary-100 rounded bg-secondary-50/30">
                  <p className="text-[11px] font-medium italic">No payments recorded</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Action Footer */}
        <div className="px-6 py-4 border-t border-secondary-200 bg-white flex justify-between items-center">
          <div className="text-[10px] font-medium text-secondary-400 uppercase tracking-wider">
            System Identity: <span className="font-bold text-secondary-600">{invoiceData?.created_by_user_name || 'Automated'}</span>
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-secondary-600 hover:bg-secondary-50 rounded transition-all">
              Discard Changes
            </button>
            <button 
              onClick={handleDownloadPdf}
              disabled={downloading}
              className="px-6 py-2 bg-secondary-900 hover:bg-black text-white text-[11px] font-bold uppercase tracking-wider rounded transition-all shadow-sm flex items-center gap-2"
            >
              {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Authorize PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
