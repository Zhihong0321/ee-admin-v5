"use client";

import { useState, useEffect } from "react";
import { Search, Filter, ArrowUpDown, ChevronLeft, ChevronRight, Download, Plus, Eye, Users, User, Mail, Phone, MapPin, Edit2, History, Clock } from "lucide-react";
import { getCustomers, updateCustomer, getCustomerHistory } from "./actions";

export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCustomer, setEditingCustomer] = useState<any | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isGlobalHistoryOpen, setIsGlobalHistoryOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"details" | "history">("details");
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const data = await getCustomers(search);
      setCustomers(data);
    } catch (error) {
      console.error("Failed to fetch customers", error);
    } finally {
      setLoading(false);
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchData();
  };

  const handleEditClick = (customer: any) => {
    setEditingCustomer({ ...customer });
    setActiveTab("details");
    setIsEditModalOpen(true);
  };

  const loadHistory = async (customerId: number) => {
    setLoadingHistory(true);
    try {
      const data = await getCustomerHistory(customerId);
      setHistory(data);
    } catch (error) {
      console.error("Failed to fetch history", error);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (isEditModalOpen && activeTab === "history" && editingCustomer) {
      loadHistory(editingCustomer.id);
    }
  }, [activeTab, isEditModalOpen, editingCustomer]);

  useEffect(() => {
    if (isGlobalHistoryOpen) {
      setLoadingHistory(true);
      getCustomerHistory().then(data => {
        setHistory(data);
        setLoadingHistory(false);
      }).catch(error => {
        console.error("Failed to fetch global history", error);
        setLoadingHistory(false);
      });
    }
  }, [isGlobalHistoryOpen]);

  const handleUpdateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer) return;

    try {
      await updateCustomer(editingCustomer.id, {
        name: editingCustomer.name,
        email: editingCustomer.email,
        phone: editingCustomer.phone,
        address: editingCustomer.address,
        city: editingCustomer.city,
        state: editingCustomer.state,
        postcode: editingCustomer.postcode,
        notes: editingCustomer.notes,
      }, "System Admin"); // In a real app, this would be the actual user's name
      setIsEditModalOpen(false);
      fetchData();
    } catch (error) {
      console.error("Failed to update customer", error);
      alert("Failed to update customer");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-secondary-900">Customers</h1>
          <p className="text-secondary-600">
            Manage and browse your customer database.
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsGlobalHistoryOpen(true)}
            className="btn-secondary flex items-center gap-2"
          >
            <History className="h-4 w-4" />
            History
          </button>
          <button className="btn-secondary flex items-center gap-2">
            <Download className="h-4 w-4" />
            Export
          </button>
          <button className="btn-primary flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add Customer
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
                placeholder="Search by name, email, phone, or ID..."
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
                <th>Customer Name</th>
                <th>Agent</th>
                <th>Contact Info</th>
                <th>Location</th>
                <th>ID / IC</th>
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
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="p-4 bg-secondary-100 rounded-full">
                        <Users className="h-8 w-8 text-secondary-400" />
                      </div>
                      <div>
                        <p className="font-medium text-secondary-900 mb-1">No customers found</p>
                        <p className="text-sm text-secondary-600">
                          {search ? "Try adjusting your search criteria" : "Start by adding your first customer"}
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                customers.map((customer) => (
                  <tr key={customer.id}>
                    <td>
                      <div className="font-semibold text-secondary-900">{customer.name}</div>
                      <div className="text-xs text-secondary-500">{customer.customer_id}</div>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-primary-50 flex items-center justify-center">
                          <User className="h-4 w-4 text-primary-600" />
                        </div>
                        <div className="text-sm font-medium text-secondary-900">
                          {customer.agent_name || "Unassigned"}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-sm text-secondary-600">
                          <Mail className="h-3 w-3" />
                          {customer.email || "No email"}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-secondary-600">
                          <Phone className="h-3 w-3" />
                          {customer.phone || "No phone"}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="flex items-start gap-2 text-sm text-secondary-600">
                        <MapPin className="h-3 w-3 mt-1 shrink-0" />
                        <span className="line-clamp-2">
                          {[customer.city, customer.state].filter(Boolean).join(", ") || "No location"}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="text-secondary-600 font-medium">
                        {customer.ic_number || "N/A"}
                      </div>
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => handleEditClick(customer)}
                          className="btn-ghost text-primary-600 hover:text-primary-700 flex items-center gap-1.5"
                        >
                          <Edit2 className="h-4 w-4" />
                          Edit
                        </button>
                        <button className="btn-ghost text-secondary-600 hover:text-secondary-700">
                          <Eye className="h-4 w-4" />
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
              Showing <span className="font-semibold text-secondary-900">{customers.length}</span> results
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

      {/* Edit Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-secondary-900/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-elevation-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-scale-in">
            {/* Modal Header */}
            <div className="p-6 border-b border-secondary-200 flex items-center justify-between bg-white z-10">
              <div>
                <h2 className="text-xl font-bold text-secondary-900">
                  {activeTab === "details" ? "Edit Customer" : "Change History"}
                </h2>
                <p className="text-sm text-secondary-500 mt-0.5">
                  {editingCustomer?.name} (v{editingCustomer?.version})
                </p>
              </div>
              <button 
                onClick={() => setIsEditModalOpen(false)}
                className="p-2 hover:bg-secondary-100 rounded-full transition-colors"
              >
                <Plus className="h-6 w-6 rotate-45 text-secondary-500" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-secondary-200 px-6 bg-secondary-50/50">
              <button
                onClick={() => setActiveTab("details")}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-all ${
                  activeTab === "details"
                    ? "border-primary-600 text-primary-600"
                    : "border-transparent text-secondary-500 hover:text-secondary-700"
                }`}
              >
                Details
              </button>
              <button
                onClick={() => setActiveTab("history")}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-all flex items-center gap-2 ${
                  activeTab === "history"
                    ? "border-primary-600 text-primary-600"
                    : "border-transparent text-secondary-500 hover:text-secondary-700"
                }`}
              >
                <History className="h-4 w-4" />
                History
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              {activeTab === "details" ? (
                <form id="edit-customer-form" onSubmit={handleUpdateCustomer} className="p-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-secondary-700">Full Name</label>
                      <input
                        type="text"
                        required
                        className="input"
                        value={editingCustomer?.name || ""}
                        onChange={(e) => setEditingCustomer({ ...editingCustomer, name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-secondary-700">Customer ID</label>
                      <input
                        type="text"
                        disabled
                        className="input bg-secondary-50 cursor-not-allowed"
                        value={editingCustomer?.customer_id || ""}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-secondary-700">Email Address</label>
                      <input
                        type="email"
                        className="input"
                        value={editingCustomer?.email || ""}
                        onChange={(e) => setEditingCustomer({ ...editingCustomer, email: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-secondary-700">Phone Number</label>
                      <input
                        type="text"
                        className="input"
                        value={editingCustomer?.phone || ""}
                        onChange={(e) => setEditingCustomer({ ...editingCustomer, phone: e.target.value })}
                      />
                    </div>
                    <div className="md:col-span-2 space-y-2">
                      <label className="text-sm font-semibold text-secondary-700">Address</label>
                      <textarea
                        className="input min-h-[100px] py-3"
                        value={editingCustomer?.address || ""}
                        onChange={(e) => setEditingCustomer({ ...editingCustomer, address: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-secondary-700">City</label>
                      <input
                        type="text"
                        className="input"
                        value={editingCustomer?.city || ""}
                        onChange={(e) => setEditingCustomer({ ...editingCustomer, city: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-secondary-700">State</label>
                      <input
                        type="text"
                        className="input"
                        value={editingCustomer?.state || ""}
                        onChange={(e) => setEditingCustomer({ ...editingCustomer, state: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-secondary-700">Postcode</label>
                      <input
                        type="text"
                        className="input"
                        value={editingCustomer?.postcode || ""}
                        onChange={(e) => setEditingCustomer({ ...editingCustomer, postcode: e.target.value })}
                      />
                    </div>
                    <div className="md:col-span-2 space-y-2">
                      <label className="text-sm font-semibold text-secondary-700">Notes</label>
                      <textarea
                        className="input min-h-[80px] py-3"
                        value={editingCustomer?.notes || ""}
                        onChange={(e) => setEditingCustomer({ ...editingCustomer, notes: e.target.value })}
                      />
                    </div>
                  </div>
                </form>
              ) : (
                <div className="p-6">
                  {loadingHistory ? (
                    <div className="space-y-4">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="animate-pulse flex gap-4 p-4 border border-secondary-100 rounded-xl">
                          <div className="h-10 w-10 bg-secondary-100 rounded-full"></div>
                          <div className="flex-1 space-y-2">
                            <div className="h-4 bg-secondary-100 rounded w-1/4"></div>
                            <div className="h-3 bg-secondary-100 rounded w-3/4"></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : history.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="p-4 bg-secondary-50 rounded-full w-fit mx-auto mb-4">
                        <Clock className="h-8 w-8 text-secondary-300" />
                      </div>
                      <p className="text-secondary-600 font-medium">No history available yet</p>
                      <p className="text-sm text-secondary-400 mt-1">Changes will appear here after the first update</p>
                    </div>
                  ) : (
                    <div className="relative space-y-4">
                      {/* Timeline Line */}
                      <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-secondary-100"></div>
                      
                      {history.map((record, idx) => (
                        <div key={record.history_id} className="relative pl-14 pb-4">
                          {/* Timeline Dot */}
                          <div className="absolute left-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-primary-500 border-2 border-white ring-4 ring-primary-50"></div>
                          
                          <div className="card p-5 border-secondary-200 hover:border-primary-200 transition-colors bg-white">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <span className="px-2.5 py-1 bg-secondary-100 text-secondary-700 rounded-lg text-xs font-bold">
                                  Version {record.version}
                                </span>
                                <span className="text-sm font-medium text-secondary-900">
                                  {record.changed_by || "Unknown User"}
                                </span>
                              </div>
                              <span className="text-xs text-secondary-500 flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {new Date(record.changed_at).toLocaleString()}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <p className="text-secondary-500 mb-1 uppercase text-[10px] font-bold tracking-wider">Name</p>
                                <p className="text-secondary-900 font-medium">{record.name}</p>
                              </div>
                              <div>
                                <p className="text-secondary-500 mb-1 uppercase text-[10px] font-bold tracking-wider">Phone</p>
                                <p className="text-secondary-900 font-medium">{record.phone || "N/A"}</p>
                              </div>
                              <div className="col-span-2">
                                <p className="text-secondary-500 mb-1 uppercase text-[10px] font-bold tracking-wider">Email</p>
                                <p className="text-secondary-900 font-medium">{record.email || "N/A"}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-secondary-200 bg-white flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
              {activeTab === "details" && (
                <button
                  type="submit"
                  form="edit-customer-form"
                  className="btn-primary"
                >
                  Save Changes
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Global History Modal */}
      {isGlobalHistoryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-secondary-900/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-elevation-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-scale-in">
            <div className="p-6 border-b border-secondary-200 flex items-center justify-between bg-white z-10">
              <div>
                <h2 className="text-xl font-bold text-secondary-900">All Customer Edit Records</h2>
                <p className="text-sm text-secondary-500 mt-0.5">Audit log of all changes across all customers</p>
              </div>
              <button 
                onClick={() => setIsGlobalHistoryOpen(false)}
                className="p-2 hover:bg-secondary-100 rounded-full transition-colors"
              >
                <Plus className="h-6 w-6 rotate-45 text-secondary-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {loadingHistory ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="animate-pulse flex gap-4 p-4 border border-secondary-100 rounded-xl">
                      <div className="h-10 w-10 bg-secondary-100 rounded-full"></div>
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-secondary-100 rounded w-1/4"></div>
                        <div className="h-3 bg-secondary-100 rounded w-3/4"></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : history.length === 0 ? (
                <div className="text-center py-12">
                  <div className="p-4 bg-secondary-50 rounded-full w-fit mx-auto mb-4">
                    <Clock className="h-8 w-8 text-secondary-300" />
                  </div>
                  <p className="text-secondary-600 font-medium">No history available yet</p>
                </div>
              ) : (
                <div className="relative space-y-4">
                  <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-secondary-100"></div>
                  {history.map((record) => (
                    <div key={record.history_id} className="relative pl-14 pb-4">
                      <div className="absolute left-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-primary-500 border-2 border-white ring-4 ring-primary-50"></div>
                      <div className="card p-5 border-secondary-200 hover:border-primary-200 transition-colors bg-white">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                              record.change_operation === 'DELETE' ? 'bg-red-100 text-red-700' : 'bg-secondary-100 text-secondary-700'
                            }`}>
                              {record.change_operation || 'UPDATE'}
                            </span>
                            <span className="text-sm font-bold text-secondary-900">
                              {record.name}
                            </span>
                            <span className="text-xs text-secondary-500">
                              (v{record.version})
                            </span>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-medium text-secondary-900">
                              {record.changed_by || "Unknown User"}
                            </div>
                            <div className="text-xs text-secondary-500 flex items-center gap-1 justify-end">
                              <Clock className="h-3 w-3" />
                              {new Date(record.changed_at).toLocaleString()}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 text-sm border-t border-secondary-50 pt-3">
                          <div className="flex justify-between">
                            <span className="text-secondary-500">Phone:</span>
                            <span className="text-secondary-900 font-medium">{record.phone || "N/A"}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-secondary-500">Email:</span>
                            <span className="text-secondary-900 font-medium">{record.email || "N/A"}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-secondary-200 bg-white flex items-center justify-end">
              <button
                onClick={() => setIsGlobalHistoryOpen(false)}
                className="btn-secondary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
