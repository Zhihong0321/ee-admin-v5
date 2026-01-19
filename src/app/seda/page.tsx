"use client";

import { useState, useEffect } from "react";
import { Search, FileText, Loader2, Eye, Receipt } from "lucide-react";

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
  seda_reg_status: string | null;
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
  const [activeTab, setActiveTab] = useState<string>("no-status"); // Default to urgent
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchData();
  }, [search, activeTab]);

  useEffect(() => {
    // Expand first group by default when data changes
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
    return "bg-green-500";
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
    { id: "no-status", label: "No SEDA Status", description: "Invoices with SEDA but no status set" },
    { id: "no-seda", label: "Without SEDA", description: "Invoices without SEDA registration" },
    { id: "seda-status", label: "By SEDA Status", description: "Grouped by SEDA approval status" },
    { id: "reg-status", label: "By Reg Status", description: "Grouped by registration status" },
  ];

  const totalCount = data.reduce((sum, group) => sum + group.count, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">SEDA Processing</h1>
          <p className="text-gray-600">Manage invoices with partial payments (0-100%)</p>
        </div>
      </div>

      {/* Main Tabs */}
      <div className="bg-white border border-gray-200 rounded-xl p-1 shadow-sm">
        <div className="flex items-center gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setExpandedGroups(new Set());
              }}
              className={`px-4 py-3 text-sm font-medium rounded-lg whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? "bg-primary-600 text-white shadow-sm"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
              }`}
              title={tab.description}
            >
              <div className="flex flex-col items-start">
                <span>{tab.label}</span>
                {data.find(g => g.group_type === tab.id || (tab.id === "no-status" && g.group === "No SEDA Status") || (tab.id === "no-seda" && g.group === "Without SEDA")) && (
                  <span className="text-xs opacity-75">
                    {data.find(g => g.group_type === tab.id || (tab.id === "no-status" && g.group === "No SEDA Status") || (tab.id === "no-seda" && g.group === "Without SEDA"))?.count || 0} invoices
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="flex gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search by invoice, customer, agent..."
            className="input pl-10"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <button type="submit" className="btn-secondary">
          Search
        </button>
      </form>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <div className="text-3xl font-bold text-blue-900">{totalCount}</div>
          <div className="text-sm text-blue-700 mt-1">Total Invoices</div>
        </div>
        <div className="card bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
          <div className="text-3xl font-bold text-orange-900">
            {data.reduce((sum, g) => sum + g.invoices.filter(i => !i.seda_bubble_id).length, 0)}
          </div>
          <div className="text-sm text-orange-700 mt-1">Without SEDA</div>
        </div>
        <div className="card bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <div className="text-3xl font-bold text-green-900">
            {data.reduce((sum, g) => sum + g.invoices.filter(i => i.seda_bubble_id).length, 0)}
          </div>
          <div className="text-sm text-green-700 mt-1">With SEDA</div>
        </div>
      </div>

      {/* Data */}
      {loading ? (
        <div className="card p-16 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary-600" />
          <p className="mt-4 text-gray-600">Loading invoices...</p>
        </div>
      ) : data.length === 0 || totalCount === 0 ? (
        <div className="card p-16 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="p-4 bg-gray-100 rounded-full">
              <Receipt className="h-8 w-8 text-gray-400" />
            </div>
            <div>
              <p className="font-medium text-gray-900 mb-1">No invoices found</p>
              <p className="text-sm text-gray-600">
                {search ? "Try adjusting your search criteria" : "No invoices match this filter"}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {data.map((group) => (
            <div key={group.group} className="card overflow-hidden">
              {/* Group Header */}
              <button
                onClick={() => toggleGroup(group.group)}
                className="w-full px-6 py-4 bg-gray-50 hover:bg-gray-100 transition-colors flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-gray-900">
                    {group.group}
                  </span>
                  <span className="px-2 py-1 text-xs font-medium rounded-full bg-primary-100 text-primary-700">
                    {group.count} invoices
                  </span>
                </div>
                <span className={`transition-transform ${expandedGroups.has(group.group) ? 'rotate-180' : ''}`}>
                  ▼
                </span>
              </button>

              {/* Group Table */}
              {expandedGroups.has(group.group) && (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">Invoice #</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Agent</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-36">Payment %</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SEDA Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-36">Last Modified</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-28">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {group.invoices.map((invoice) => {
                        const percent = getPaymentPercentage(invoice);
                        return (
                          <tr key={invoice.invoice_bubble_id} className="hover:bg-gray-50">
                            <td className="px-4 py-4 whitespace-nowrap">
                              <div className="font-medium text-gray-900 text-sm">
                                {invoice.invoice_number || "N/A"}
                              </div>
                              {invoice.total_amount && (
                                <div className="text-xs text-gray-500">
                                  RM {parseFloat(invoice.total_amount).toLocaleString('en-MY', { minimumFractionDigits: 2 })}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">
                                {invoice.customer_name || "N/A"}
                              </div>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-600">
                                {invoice.agent_name || invoice.agent_name_snapshot || "N/A"}
                              </div>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <div className="w-16 bg-gray-200 rounded-full h-2 overflow-hidden flex-shrink-0">
                                  <div
                                    className={`h-full ${getPaymentColor(percent)} transition-all`}
                                    style={{ width: `${percent}%` }}
                                  />
                                </div>
                                <span className="text-sm font-medium text-gray-700">
                                  {percent.toFixed(0)}%
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              {invoice.seda_bubble_id ? (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                  {invoice.seda_status || "Not Set"}
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                  Not Created
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">
                              {formatDate(invoice.seda_modified_date || invoice.seda_updated_at || invoice.invoice_updated_at)}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-right">
                              <div className="flex items-center justify-end gap-1">
                                <a
                                  href={`/invoice/${invoice.invoice_bubble_id}`}
                                  className="text-blue-600 hover:text-blue-700 p-1 hover:bg-blue-50 rounded"
                                  title="View Invoice"
                                >
                                  <Receipt className="h-4 w-4" />
                                </a>
                                {invoice.seda_bubble_id ? (
                                  <a
                                    href={`/seda/${invoice.seda_bubble_id}`}
                                    className="text-primary-600 hover:text-primary-700 p-1 hover:bg-primary-50 rounded"
                                    title="View SEDA"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </a>
                                ) : (
                                  <a
                                    href={`https://calculator.atap.solar/new?invoice=${invoice.invoice_bubble_id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-green-600 hover:text-green-700 p-1 hover:bg-green-50 rounded text-xs font-medium"
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
  );
}
