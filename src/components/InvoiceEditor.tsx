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
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 md:p-8">
      <div className="bg-white rounded-2xl shadow-2xl w-full h-[95vh] max-h-[95vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-secondary-200 bg-secondary-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 rounded-lg">
              <FileText className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-secondary-900">Invoice Editor</h2>
              <p className="text-xs text-secondary-500">{invoiceData?.invoice_number || 'Draft'}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={handleDownloadPdf}
              disabled={downloading}
              className="btn-secondary py-2 flex items-center gap-2"
            >
              {downloading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>PDF</span>
            </button>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-secondary-200 rounded-full transition-colors text-secondary-500 hover:text-secondary-900"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-6 bg-secondary-50/50 border-b border-secondary-200">
          <button
            onClick={() => setActiveTab("preview")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "preview"
                ? "border-primary-600 text-primary-600"
                : "border-transparent text-secondary-600 hover:text-secondary-900"
            }`}
          >
            Preview
          </button>
          <button
            onClick={() => setActiveTab("details")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === "details"
                ? "border-primary-600 text-primary-600"
                : "border-transparent text-secondary-600 hover:text-secondary-900"
            }`}
          >
            <Info className="w-4 h-4" />
            Details
          </button>
        </div>

        {/* Content */}
        {activeTab === "preview" ? (
          <div className="flex-1 bg-secondary-100 p-4 md:p-8 overflow-auto flex justify-center">
            <iframe 
              ref={iframeRef}
              className="w-full max-w-[800px] bg-white shadow-lg min-h-[1100px] rounded-sm"
              title="Invoice Preview"
            />
          </div>
        ) : (
          <div className="flex-1 overflow-auto p-6 bg-secondary-50">
            <div className="max-w-full mx-auto space-y-6">
              {/* Invoice Summary */}
              <div className="card p-6">
                <div className="flex items-center gap-3 mb-4">
                  <FileText className="w-5 h-5 text-primary-600" />
                  <h3 className="text-lg font-bold text-secondary-900">Invoice Summary</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="min-w-0">
                    <label className="text-sm text-secondary-500">Invoice Number</label>
                    <p className="font-semibold text-secondary-900 truncate" title={invoiceData?.invoice_number}>{invoiceData?.invoice_number || 'N/A'}</p>
                  </div>
                  <div className="min-w-0">
                    <label className="text-sm text-secondary-500">Invoice Date</label>
                    <p className="font-semibold text-secondary-900 truncate">
                      {invoiceData?.invoice_date 
                        ? new Date(invoiceData.invoice_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                        : 'N/A'}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <label className="text-sm text-secondary-500">Status</label>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0 ${
                        invoiceData?.paid ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {invoiceData?.paid ? 'Paid' : 'Pending'}
                      </span>
                      <span className="text-sm text-secondary-600">
                        {invoiceData?.percent_of_total_amount ? `${parseFloat(invoiceData.percent_of_total_amount).toFixed(1)}%` : '0%'} Paid
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Customer Details */}
              <div className="card p-6">
                <div className="flex items-center gap-3 mb-4">
                  <User className="w-5 h-5 text-primary-600" />
                  <h3 className="text-lg font-bold text-secondary-900">Customer Details</h3>
                </div>
                {invoiceData?.customer_data ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="min-w-0">
                      <label className="text-sm text-secondary-500">Name</label>
                      <p className="font-semibold text-secondary-900 truncate" title={invoiceData.customer_data.name}>{invoiceData.customer_data.name || 'N/A'}</p>
                    </div>
                    <div className="min-w-0">
                      <label className="text-sm text-secondary-500">IC Number</label>
                      <p className="font-medium text-secondary-700 truncate" title={invoiceData.customer_data.ic_number}>{invoiceData.customer_data.ic_number || 'N/A'}</p>
                    </div>
                    <div className="flex items-start gap-2 min-w-0">
                      <Mail className="w-4 h-4 text-secondary-400 mt-1 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <label className="text-sm text-secondary-500">Email</label>
                        <p className="font-medium text-secondary-700 truncate" title={invoiceData.customer_data.email}>{invoiceData.customer_data.email || 'N/A'}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 min-w-0">
                      <Phone className="w-4 h-4 text-secondary-400 mt-1 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <label className="text-sm text-secondary-500">Phone</label>
                        <p className="font-medium text-secondary-700 truncate" title={invoiceData.customer_data.phone}>{invoiceData.customer_data.phone || 'N/A'}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 md:col-span-2 min-w-0">
                      <MapPin className="w-4 h-4 text-secondary-400 mt-1 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <label className="text-sm text-secondary-500">Address</label>
                        <p className="font-medium text-secondary-700">
                          {invoiceData.customer_data.address ? `${invoiceData.customer_data.address}, ` : ''}
                          {invoiceData.customer_data.city ? `${invoiceData.customer_data.city}, ` : ''}
                          {invoiceData.customer_data.state ? `${invoiceData.customer_data.state} ` : ''}
                          {invoiceData.customer_data.postcode || ''}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-secondary-500">No customer details available</p>
                )}
              </div>

              {/* Agent Selection (Editable) */}
              <div className="card p-6">
                <div className="flex items-center gap-3 mb-4">
                  <User className="w-5 h-5 text-primary-600" />
                  <h3 className="text-lg font-bold text-secondary-900">Agent</h3>
                </div>
                <div className="flex items-center gap-3">
                  <select
                    value={selectedAgentId}
                    onChange={(e) => setSelectedAgentId(e.target.value)}
                    className="input flex-1"
                    disabled={savingAgent}
                  >
                    <option value="">Select an agent...</option>
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.bubble_id}>
                        {agent.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleSaveAgent}
                    disabled={savingAgent || !selectedAgentId}
                    className="btn-primary flex items-center gap-2"
                  >
                    {savingAgent ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    Save Agent
                  </button>
                </div>
              </div>

              {/* Invoice Items (Editable) */}
              <div className="card p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Package className="w-5 h-5 text-primary-600" />
                    <h3 className="text-lg font-bold text-secondary-900">Invoice Items</h3>
                    <span className="px-2 py-0.5 bg-secondary-100 text-secondary-600 text-xs rounded-full">
                      {invoiceData?.items?.length || 0} items
                    </span>
                  </div>
                  {version === "v2" && (
                    <button
                      onClick={() => setShowAddItem(!showAddItem)}
                      className="btn-secondary flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Add Item
                    </button>
                  )}
                </div>

                {/* Add Item Form */}
                {showAddItem && (
                  <div className="mb-4 p-4 bg-primary-50 rounded-lg border border-primary-200">
                    <h4 className="font-semibold text-secondary-900 mb-3">Add New Item</h4>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div className="md:col-span-2">
                        <label className="text-sm text-secondary-500 mb-1 block">Description *</label>
                        <input
                          type="text"
                          value={newItem.description}
                          onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                          className="input"
                          placeholder="Item description"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-secondary-500 mb-1 block">Qty *</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={newItem.qty}
                          onChange={(e) => {
                            const qty = e.target.value;
                            setNewItem({ ...newItem, qty });
                          }}
                          className="input"
                          placeholder="1"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-secondary-500 mb-1 block">Unit Price *</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={newItem.unit_price}
                          onChange={(e) => {
                            const unit_price = e.target.value;
                            setNewItem({ ...newItem, unit_price });
                          }}
                          className="input"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2 mt-3">
                      <div className="text-sm text-secondary-600">
                        Amount: <span className="font-semibold">MYR {parseFloat(calculateAmount(newItem.qty, newItem.unit_price)).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <button
                        onClick={() => {
                          setShowAddItem(false);
                          setNewItem({ description: "", qty: "1", unit_price: "0" });
                        }}
                        className="btn-secondary"
                        disabled={addingItem}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleAddItem}
                        disabled={addingItem}
                        className="btn-primary flex items-center gap-2"
                      >
                        {addingItem ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Plus className="w-4 h-4" />
                        )}
                        Add Item
                      </button>
                    </div>
                  </div>
                )}

                {invoiceData?.items && invoiceData.items.length > 0 ? (
                  <table className="table w-full">
                    <thead>
                      <tr>
                        <th className="w-[35%]">Description</th>
                        <th className="text-center w-[10%]">Qty</th>
                        <th className="text-right w-[15%]">Unit Price</th>
                        <th className="text-right w-[15%]">Amount</th>
                        <th className="text-right w-[25%]">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoiceData.items.map((item: any, index: number) => {
                        const isEditing = editingItemId === item.id;
                        const itemData = isEditing && editingItem ? editingItem : item;

                        return (
                          <tr key={item.id || index} className={isEditing ? "bg-primary-50" : ""}>
                            <td>
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={itemData.description}
                                  onChange={(e) => handleItemFieldChange("description", e.target.value)}
                                  className="input text-sm"
                                  placeholder="Description"
                                />
                              ) : (
                                <>
                                  <div className="font-medium text-secondary-900 truncate" title={item.description}>{item.description || 'N/A'}</div>
                                  {item.inv_item_type && (
                                    <div className="text-xs text-secondary-500 capitalize">{item.inv_item_type}</div>
                                  )}
                                </>
                              )}
                            </td>
                            <td className="text-center">
                              {isEditing ? (
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0.01"
                                  value={itemData.qty}
                                  onChange={(e) => handleItemFieldChange("qty", e.target.value)}
                                  className="input text-sm text-center"
                                />
                              ) : (
                                <span className="px-2 py-1 bg-secondary-100 text-secondary-700 rounded text-sm">
                                  {item.qty || 0}
                                </span>
                              )}
                            </td>
                            <td className="text-right">
                              {isEditing ? (
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={itemData.unit_price}
                                  onChange={(e) => handleItemFieldChange("unit_price", e.target.value)}
                                  className="input text-sm text-right"
                                />
                              ) : (
                                <span className="text-secondary-700">
                                  {item.unit_price ? `MYR ${parseFloat(item.unit_price).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '-'}
                                </span>
                              )}
                            </td>
                            <td className="text-right font-semibold text-secondary-900">
                              MYR {parseFloat(itemData.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="text-right">
                              {isEditing ? (
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={cancelEditingItem}
                                    disabled={savingItem}
                                    className="p-1.5 hover:bg-secondary-200 rounded text-secondary-600 hover:text-secondary-900"
                                    title="Cancel"
                                  >
                                    <XIcon className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={handleSaveItem}
                                    disabled={savingItem}
                                    className="p-1.5 hover:bg-primary-200 rounded text-primary-600 hover:text-primary-700"
                                    title="Save"
                                  >
                                    {savingItem ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <Check className="w-4 h-4" />
                                    )}
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-2">
                                  {version === "v2" && (
                                    <>
                                      <button
                                        onClick={() => startEditingItem(item)}
                                        className="p-1.5 hover:bg-secondary-200 rounded text-secondary-600 hover:text-secondary-900"
                                        title="Edit"
                                      >
                                        <Edit2 className="w-4 h-4" />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteItem(item.id)}
                                        disabled={deletingItemId === item.id}
                                        className="p-1.5 hover:bg-red-100 rounded text-red-600 hover:text-red-700"
                                        title="Delete"
                                      >
                                        {deletingItemId === item.id ? (
                                          <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                          <Trash2 className="w-4 h-4" />
                                        )}
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-secondary-50">
                        <td colSpan={3} className="text-right font-bold text-secondary-900">
                          Total
                        </td>
                        <td colSpan={2} className="text-right font-bold text-primary-600 text-lg">
                          MYR {parseFloat(invoiceData.total_amount || calculatedTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                ) : (
                  <p className="text-secondary-500">No invoice items found. Click "Add Item" to create one.</p>
                )}
              </div>

              {/* Payments */}
              <div className="card p-6">
                <div className="flex items-center gap-3 mb-4">
                  <CreditCard className="w-5 h-5 text-primary-600" />
                  <h3 className="text-lg font-bold text-secondary-900">Payments</h3>
                  <span className="px-2 py-0.5 bg-secondary-100 text-secondary-600 text-xs rounded-full">
                    {invoiceData?.linked_payments?.length || 0} payments
                  </span>
                  <span className="ml-auto text-sm font-semibold text-green-600">
                    Total: MYR {parseFloat(invoiceData?.total_payments || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                {invoiceData?.linked_payments && invoiceData.linked_payments.length > 0 ? (
                  <table className="table w-full">
                    <thead>
                      <tr>
                        <th className="w-[20%]">Date</th>
                        <th className="w-[25%]">Method</th>
                        <th className="w-[25%]">Bank/Terminal</th>
                        <th className="text-right w-[30%]">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoiceData.linked_payments.map((payment: any, index: number) => (
                        <tr key={payment.id || index}>
                          <td>
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4 text-secondary-400 flex-shrink-0" />
                              <span className="truncate">
                                {payment.payment_date 
                                  ? new Date(payment.payment_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                                  : 'N/A'}
                              </span>
                            </div>
                          </td>
                          <td>
                            <span className="px-2 py-1 bg-secondary-100 text-secondary-700 rounded text-sm capitalize inline-block">
                              {payment.payment_method_v2 || payment.payment_method || 'N/A'}
                            </span>
                            {payment.epp_type && (
                              <span className="ml-1 text-xs text-secondary-500 block truncate">({payment.epp_type})</span>
                            )}
                          </td>
                          <td>
                            <div className="text-sm text-secondary-700 truncate" title={payment.issuer_bank || payment.terminal}>
                              {payment.issuer_bank || payment.terminal || '-'}
                            </div>
                            {payment.epp_month && (
                              <div className="text-xs text-secondary-500">{payment.epp_month} months</div>
                            )}
                          </td>
                          <td className="text-right font-semibold text-green-600">
                            <div className="flex items-center justify-end gap-1">
                              <DollarSign className="w-4 h-4" />
                              <span>MYR {parseFloat(payment.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-secondary-500">No payments found</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-secondary-200 bg-white flex justify-between items-center">
          <div className="text-sm text-secondary-500">
            Created by: <span className="font-medium text-secondary-700">{invoiceData?.created_by_user_name || 'System'}</span>
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="btn-secondary">
              Close
            </button>
            <button 
              onClick={handleDownloadPdf}
              disabled={downloading}
              className="btn-primary flex items-center gap-2"
            >
              {downloading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              Download PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
