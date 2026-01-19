"use client";

import { useState, useEffect } from "react";
import { Search, Loader2, Eye, Receipt, AlertCircle } from "lucide-react";

interface InvoiceNeedingSeda {
  invoice_bubble_id: string;
  invoice_number: string | null;
  total_amount: string | null;
  percent_paid: string | null;
  customer_name: string | null;
  customer_bubble_id: string | null;
  agent_bubble_id: string | null;
  agent_name_snapshot: string | null;
  agent_name: string | null;
  linked_seda_registration: string | null;
  invoice_date: string | null;
  invoice_status: string | null;
  invoice_updated_at: string | null;
  seda_bubble_id: string | null;
  seda_status: string | null;
  seda_modified_date: string | null;
  seda_updated_at: string | null;
  seda_installation_address: string | null;
}

interface InvoiceGroup {
  group: string;
  group_type: string;
  count: number;
  invoices: InvoiceNeedingSeda[];
}

export default function SedaListPage() {
  const [data, setData] = useState<InvoiceGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("need-attention");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [attentionCount, setAttentionCount] = useState<number>(0);

  useEffect(() => {
    fetchData();
    fetchAttentionCount();
  }, [search, activeTab]);

  const fetchAttentionCount = async () => {
    try {
      const response = await fetch('/api/seda/attention-count');
      if (response.ok) {
        const data = await response.json();
        setAttentionCount(data.count);
      }
    } catch (error) {
      console.error("Error fetching attention count:", error);
    }
  };

  useEffect(() => {
    if (data.length > 0 && expandedGroups.size === 0) {
      setExpandedGroups(new Set([data[0].group]));
    }
  }, [data]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("group", activeTab);
      if (search) {
        params.append("search", search);
      }

      const response = await fetch(`/api/seda/invoices-needing-seda?${params}`);
      if (!response.ok) throw new Error("Failed to fetch");

      const result: InvoiceGroup[] = await response.json();
      setData(result);
    } catch (error) {
      console.error("Error fetching invoices:", error);
      alert("Failed to load invoices. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
  };

  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(group)) {
        newSet.delete(group);
      } else {
        newSet.add(group);
      }
      return newSet;
    });
  };

  const getPaymentPercentage = (invoice: InvoiceNeedingSeda): number => {
    if (!invoice.percent_paid) return 0;
    return parseFloat(invoice.percent_paid);
  };

  const getPaymentColor = (percent: number): string => {
    if (percent < 25) return "bg-red-500";
    if (percent < 50) return "bg-orange-500";
    if (percent < 75) return "bg-yellow-500";
    return "bg-emerald-500";
  };

  const getStatusBadgeColor = (status: string | null): string => {
    if (!status) return "bg-slate-100 text-slate-700";

    const normalizedStatus = status.toLowerCase();

    if (normalizedStatus.includes('approved') || normalizedStatus.includes('approved by seda')) {
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    }
    if (normalizedStatus.includes('demo')) {
      return "bg-amber-100 text-amber-700 border-amber-200";
    }
    if (normalizedStatus.includes('incomplete') || normalizedStatus.includes('pending')) {
      return "bg-blue-100 text-blue-700 border-blue-200";
    }
    if (normalizedStatus.includes('rejected') || normalizedStatus.includes('declined')) {
      return "bg-red-100 text-red-700 border-red-200";
    }

    return "bg-slate-100 text-slate-700 border-slate-200";
  };

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const tabs = [
    {
      id: "need-attention",
      label: "Need Attention",
      description: "Not approved yet",
      icon: AlertCircle
    },
    {
      id: "no-seda",
      label: "Without SEDA",
      description: "Invoices without SEDA registration",
      icon: Receipt
    },
    {
      id: "seda-status",
      label: "By SEDA Status",
      description: "All SEDA grouped by approval status",
      icon: Eye
    },
  ];

  const totalCount = data.reduce((sum, group) => sum + group.count, 0);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
                SEDA Processing
              </h1>
              <p className="text-slate-500 mt-1">
                Manage invoices requiring SEDA approval
              </p>
            </div>

            {attentionCount > 0 && (
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                <div className="text-sm font-medium text-red-700">
                  {attentionCount} Need Attention
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden mb-6">
          <div className="flex flex-wrap items-center divide-x divide-slate-200">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setExpandedGroups(new Set());
                }}
                className={`
                  flex-1 min-w-[180px] px-6 py-4 text-left transition-colors
                  ${activeTab === tab.id
                    ? 'bg-slate-50 border-b-2 border-slate-900'
                    : 'hover:bg-slate-50 border-b-2 border-transparent'
                  }
                `}
              >
                <div className="flex items-center gap-3">
                  <tab.icon className={`w-5 h-5 flex-shrink-0 ${
                    activeTab === tab.id ? 'text-slate-900' : 'text-slate-400'
                  }`} />
                  <div>
                    <div className={`text-sm font-semibold ${
                      activeTab === tab.id ? 'text-slate-900' : 'text-slate-600'
                    }`}>
                      {tab.label}
                    </div>
                    <div className={`text-xs ${
                      activeTab === tab.id ? 'text-slate-500' : 'text-slate-400'
                    }`}>
                      {tab.description}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="mb-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search by customer, agent..."
              className="w-full pl-12 pr-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <button
              type="submit"
              className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-1.5 bg-slate-900 text-white text-sm font-medium rounded-md hover:bg-slate-800 transition-colors"
            >
              Search
            </button>
          </div>
        </form>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Total Invoices</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">{totalCount}</p>
              </div>
              <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center">
                <Receipt className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Without SEDA</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">
                  {data.reduce((sum, g) => sum + g.invoices.filter(i => !i.linked_seda_registration).length, 0)}
                </p>
              </div>
              <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">With SEDA</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">
                  {data.reduce((sum, g) => sum + g.invoices.filter(i => i.linked_seda_registration).length, 0)}
                </p>
              </div>
              <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center">
                <Eye className="w-6 h-6 text-emerald-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Data */}
        {loading ? (
          <div className="bg-white border border-slate-200 rounded-xl p-16 text-center shadow-sm">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-slate-400" />
            <p className="mt-4 text-slate-500">Loading invoices...</p>
          </div>
        ) : data.length === 0 || totalCount === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-16 text-center shadow-sm">
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
                <Receipt className="w-8 h-8 text-slate-400" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">No invoices found</p>
                <p className="text-sm text-slate-500">
                  {search ? "Try adjusting your search criteria" : "No invoices match this filter"}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {data.map((group) => (
              <div key={group.group} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                {/* Group Header */}
                <button
                  onClick={() => toggleGroup(group.group)}
                  className="w-full px-6 py-4 bg-slate-50 hover:bg-slate-100 transition-colors flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-slate-900">
                      {group.group}
                    </span>
                    <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-white border border-slate-200 text-slate-600">
                      {group.count}
                    </span>
                  </div>
                  <span className={`text-slate-400 transition-transform ${
                    expandedGroups.has(group.group) ? 'rotate-180' : ''
                  }`}>
                    ▼
                  </span>
                </button>

                {/* Group Table */}
                {expandedGroups.has(group.group) && (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50">
                          <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-48">
                            SEDA Status
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            Customer
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-40">
                            Agent
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-32">
                            Payment
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-32">
                            Last Modified
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider w-32">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {group.invoices.map((invoice) => {
                          const percent = getPaymentPercentage(invoice);
                          return (
                            <tr key={invoice.invoice_bubble_id} className="hover:bg-slate-50 transition-colors">
                              {/* SEDA Status */}
                              <td className="px-6 py-4">
                                {invoice.linked_seda_registration ? (
                                  <span className={`inline-flex items-center px-3 py-1 text-xs font-medium rounded-full border ${getStatusBadgeColor(invoice.seda_status)}`}>
                                    {invoice.seda_status || "Not Set"}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-3 py-1 text-xs font-medium rounded-full bg-red-50 text-red-700 border border-red-200">
                                    Not Created
                                  </span>
                                )}
                              </td>

                              {/* Customer */}
                              <td className="px-6 py-4">
                                <div className="text-sm text-slate-900 font-medium max-w-xs truncate">
                                  {invoice.customer_name || "N/A"}
                                </div>
                              </td>

                              {/* Agent */}
                              <td className="px-6 py-4">
                                <div className="text-sm text-slate-600">
                                  {invoice.agent_name || invoice.agent_name_snapshot || "N/A"}
                                </div>
                              </td>

                              {/* Payment */}
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-20 bg-slate-100 rounded-full h-2 overflow-hidden">
                                    <div
                                      className={`h-full ${getPaymentColor(percent)} transition-all`}
                                      style={{ width: `${Math.min(percent, 100)}%` }}
                                    />
                                  </div>
                                  <span className="text-sm font-semibold text-slate-700">
                                    {percent.toFixed(0)}%
                                  </span>
                                </div>
                              </td>

                              {/* Last Modified */}
                              <td className="px-6 py-4">
                                <div className="text-sm text-slate-500">
                                  {formatDate(invoice.seda_modified_date || invoice.seda_updated_at || invoice.invoice_updated_at)}
                                </div>
                              </td>

                              {/* Actions */}
                              <td className="px-6 py-4">
                                <div className="flex items-center justify-end gap-1">
                                  <a
                                    href={`/invoice/${invoice.invoice_bubble_id}`}
                                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                    title="View Invoice"
                                  >
                                    <Receipt className="w-4 h-4" />
                                  </a>
                                  {invoice.linked_seda_registration ? (
                                    <a
                                      href={`/seda/${invoice.linked_seda_registration}`}
                                      className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                      title="View SEDA"
                                    >
                                      <Eye className="w-4 h-4" />
                                    </a>
                                  ) : (
                                    <a
                                      href={`https://calculator.atap.solar/new?invoice=${invoice.invoice_bubble_id}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="px-3 py-2 text-xs font-medium text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg border border-emerald-200 transition-colors"
                                      title="Create SEDA"
                                    >
                                      Create
                                    </a>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
