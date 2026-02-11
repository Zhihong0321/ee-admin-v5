"use client";

import { useState, useEffect } from "react";
import { Search, Loader2, Eye, Receipt, AlertCircle, CheckCircle, XCircle, Clock } from "lucide-react";

interface SedaRegistration {
  id: number;
  bubble_id: string;
  seda_status: string | null;
  installation_address: string | null;
  city: string | null;
  state: string | null;
  ic_no: string | null;
  email: string | null;
  customer_name: string | null;
  agent_name: string | null;
  modified_date: string | null;
  updated_at: string | null;
  created_date: string | null;
  linked_invoice: string[] | null;
  share_token: string | null;
  percent_of_total_amount: number;
  completed_count: number;
  is_form_completed: boolean;
  has_required_payment: boolean;
  seda_profile_status: string | null;
  seda_profile_id: string | null;
}

interface SedaGroup {
  seda_status: string;
  count: number;
  registrations: SedaRegistration[];
}

export default function SedaListPage() {
  const [data, setData] = useState<SedaGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("Pending");
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
      // Find the group that matches activeTab or just take the first
      const activeGroup = data.find(g => g.seda_status === activeTab) || data[0];
      setExpandedGroups(new Set([activeGroup.seda_status]));
    }
  }, [data]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      // In this new registrations-only view, we might want to filter by status or show all
      // For now, let's show all and filter in JS if activeTab is set, 
      // or use the API statusFilter if available.
      if (activeTab && activeTab !== "All") {
        params.append("status", activeTab);
      }
      if (search) {
        params.append("search", search);
      }

      const response = await fetch(`/api/seda/registrations?${params}`);
      if (!response.ok) throw new Error("Failed to fetch");

      const result: SedaGroup[] = await response.json();
      setData(result);
    } catch (error) {
      console.error("Error fetching SEDA registrations:", error);
      alert("Failed to load SEDA registrations. Please try again.");
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

  const getPaymentColor = (percent: number): string => {
    if (percent < 25) return "bg-red-500";
    if (percent < 50) return "bg-orange-500";
    if (percent < 75) return "bg-yellow-500";
    return "bg-emerald-500";
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
      id: "Pending",
      label: "Pending Verification",
      description: "Ready for admin check",
      icon: AlertCircle
    },
    {
      id: "Submitted",
      label: "Submitted to SEDA",
      description: "Waiting for portal approval",
      icon: Eye
    },
    {
      id: "Approved",
      label: "Approved by SEDA",
      description: "Completed registrations",
      icon: Receipt
    },
    {
      id: "All",
      label: "All Registrations",
      description: "View all records",
      icon: Search
    }
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
                SEDA Registration Management
              </h1>
              <p className="text-slate-500 mt-1">
                View and manage existing SEDA registration forms
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
                  <tab.icon className={`w-5 h-5 flex-shrink-0 ${activeTab === tab.id ? 'text-slate-900' : 'text-slate-400'
                    }`} />
                  <div>
                    <div className={`text-sm font-semibold ${activeTab === tab.id ? 'text-slate-900' : 'text-slate-600'
                      }`}>
                      {tab.label}
                    </div>
                    <div className={`text-xs ${activeTab === tab.id ? 'text-slate-500' : 'text-slate-400'
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
              placeholder="Search by customer, address, IC number..."
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

        {/* Data */}
        {loading ? (
          <div className="bg-white border border-slate-200 rounded-xl p-16 text-center shadow-sm">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-slate-400" />
            <p className="mt-4 text-slate-500">Loading registrations...</p>
          </div>
        ) : data.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-16 text-center shadow-sm">
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
                <Receipt className="w-8 h-8 text-slate-400" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">No registrations found</p>
                <p className="text-sm text-slate-500">
                  {search ? "Try adjusting your search criteria" : "No registrations match this filter"}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {data.map((group) => (
              <div key={group.seda_status} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                {/* Group Header */}
                <button
                  onClick={() => toggleGroup(group.seda_status)}
                  className="w-full px-6 py-4 bg-slate-50 hover:bg-slate-100 transition-colors flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-slate-900">
                      {group.seda_status === "null" ? "Unknown Status" : group.seda_status}
                    </span>
                    <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-white border border-slate-200 text-slate-600">
                      {group.count}
                    </span>
                  </div>
                  <span className={`text-slate-400 transition-transform ${expandedGroups.has(group.seda_status) ? 'rotate-180' : ''
                    }`}>
                    ▼
                  </span>
                </button>

                {/* Group Table */}
                {expandedGroups.has(group.seda_status) && (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50">
                          <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-40">
                            Submission Ready
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            Customer
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-32">
                            Form Progress
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-32">
                            Payment
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-32">
                            SEDA Profile
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
                        {group.registrations.map((seda) => {
                          const percent = seda.percent_of_total_amount;
                          const isReady = seda.is_form_completed && seda.has_required_payment;

                          return (
                            <tr key={seda.bubble_id} className="hover:bg-slate-50 transition-colors">
                              {/* Submission Ready */}
                              <td className="px-6 py-4">
                                {isReady ? (
                                  <span className="inline-flex items-center px-3 py-1 text-xs font-bold rounded-full bg-emerald-500 text-white border border-emerald-600 shadow-sm animate-pulse">
                                    READY
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-3 py-1 text-xs font-medium rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                                    INCOMPLETE
                                  </span>
                                )}
                              </td>

                              {/* Customer */}
                              <td className="px-6 py-4">
                                <div className="text-sm text-slate-900 font-medium max-w-xs truncate">
                                  {seda.customer_name || "N/A"}
                                </div>
                                <div className="text-xs text-slate-400 mt-1">
                                  {seda.ic_no || "No IC"}
                                </div>
                              </td>

                              {/* Form Progress */}
                              <td className="px-6 py-4">
                                <div className="flex flex-col gap-1">
                                  <div className="text-xs font-semibold text-slate-700">
                                    {seda.completed_count}/7 Complete
                                  </div>
                                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                    <div
                                      className={`h-full transition-all ${seda.completed_count === 7 ? "bg-emerald-500" : "bg-blue-400"
                                        }`}
                                      style={{ width: `${(seda.completed_count / 7) * 100}%` }}
                                    />
                                  </div>
                                </div>
                              </td>

                              {/* Payment */}
                              <td className="px-6 py-4">
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center justify-between text-[10px] font-bold">
                                    <span className={percent >= 4 ? "text-emerald-600" : "text-red-600"}>
                                      {percent.toFixed(1)}%
                                    </span>
                                    {percent >= 4 && <span className="text-emerald-600">✓ 4%</span>}
                                  </div>
                                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                    <div
                                      className={`h-full ${getPaymentColor(percent)} transition-all`}
                                      style={{ width: `${Math.min(percent, 100)}%` }}
                                    />
                                  </div>
                                </div>
                              </td>

                              {/* SEDA Profile Status */}
                              <td className="px-6 py-4">
                                {seda.seda_profile_status === "profile_created" ? (
                                  seda.seda_profile_id ? (
                                    <a
                                      href={`https://atap.seda.gov.my/profiles/individuals/${seda.seda_profile_id}/edit`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 hover:bg-emerald-200 transition-colors"
                                    >
                                      <CheckCircle className="w-3 h-3" />
                                      View Profile
                                    </a>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                                      <CheckCircle className="w-3 h-3" />
                                      Created
                                    </span>
                                  )
                                ) : seda.seda_profile_status === "not_found" ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                                    <XCircle className="w-3 h-3" />
                                    Not Found
                                  </span>
                                ) : seda.seda_profile_status === "error" ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700 border border-red-200">
                                    <AlertCircle className="w-3 h-3" />
                                    Error
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                                    <Clock className="w-3 h-3" />
                                    Not Checked
                                  </span>
                                )}
                              </td>

                              {/* Last Modified */}
                              <td className="px-6 py-4">
                                <div className="text-sm text-slate-500">
                                  {formatDate(seda.modified_date || seda.updated_at || seda.created_date)}
                                </div>
                              </td>

                              {/* Actions */}
                              <td className="px-6 py-4">
                                <div className="flex items-center justify-end gap-1">
                                  {seda.linked_invoice?.[0] && (
                                    <a
                                      href={seda.share_token ? `https://calculator.atap.solar/view/${seda.share_token}` : `/invoice/${seda.linked_invoice[0]}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                      title="View Invoice"
                                    >
                                      <Receipt className="w-4 h-4" />
                                    </a>
                                  )}
                                  <a
                                    href={`/seda/${seda.bubble_id}`}
                                    className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                    title="View SEDA Details"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </a>
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
