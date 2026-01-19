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
  seda_bubble_id: string | null;
  seda_status: string | null;
  seda_modified_date: string | null;
  seda_updated_at: string | null;
  seda_installation_address: string | null;
}

export default function SedaListPage() {
  const [invoices, setInvoices] = useState<InvoiceNeedingSeda[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  useEffect(() => {
    fetchData();
  }, [search]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) {
        params.append("search", search);
      }

      const response = await fetch(`/api/seda/invoices-needing-seda?${params}`);
      if (!response.ok) throw new Error("Failed to fetch");

      const result: InvoiceNeedingSeda[] = await response.json();
      setInvoices(result);
    } catch (error) {
      console.error("Error fetching invoices needing SEDA:", error);
      alert("Failed to load invoices. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">SEDA Processing - Urgent</h1>
          <p className="text-gray-600">Invoices with partial payments (0-100%) that need SEDA registration</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <div className="text-3xl font-bold text-blue-900">{invoices.length}</div>
          <div className="text-sm text-blue-700 mt-1">Invoices Needing SEDA</div>
        </div>
        <div className="card bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
          <div className="text-3xl font-bold text-orange-900">
            {invoices.filter(i => !i.seda_bubble_id).length}
          </div>
          <div className="text-sm text-orange-700 mt-1">Without SEDA Form</div>
        </div>
        <div className="card bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <div className="text-3xl font-bold text-green-900">
            {invoices.filter(i => i.seda_bubble_id).length}
          </div>
          <div className="text-sm text-green-700 mt-1">With SEDA Started</div>
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

      {/* Data Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Customer</th>
                <th>Agent</th>
                <th>Payment %</th>
                <th>SEDA Status</th>
                <th>Last Modified</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary-600" />
                    <p className="mt-4 text-gray-600">Loading invoices...</p>
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="p-4 bg-gray-100 rounded-full">
                        <Receipt className="h-8 w-8 text-gray-400" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 mb-1">No invoices found</p>
                        <p className="text-sm text-gray-600">
                          {search ? "Try adjusting your search criteria" : "All invoices have SEDA processed!"}
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                invoices.map((invoice) => {
                  const percent = getPaymentPercentage(invoice);
                  return (
                    <tr key={invoice.invoice_bubble_id} className="hover:bg-gray-50">
                      <td>
                        <div className="font-medium text-gray-900">
                          {invoice.invoice_number || "N/A"}
                        </div>
                        {invoice.total_amount && (
                          <div className="text-sm text-gray-500">
                            RM {parseFloat(invoice.total_amount).toLocaleString('en-MY', { minimumFractionDigits: 2 })}
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="text-sm text-gray-900">
                          {invoice.customer_name || "N/A"}
                        </div>
                      </td>
                      <td>
                        <div className="text-sm text-gray-600">
                          {invoice.agent_name || invoice.agent_name_snapshot || "N/A"}
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-24 bg-gray-200 rounded-full h-2.5 overflow-hidden">
                            <div
                              className={`h-full ${getPaymentColor(percent)} transition-all`}
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium text-gray-700">
                            {percent.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td>
                        {invoice.seda_bubble_id ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            {invoice.seda_status || "Not Set"}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            SEDA FORM not created yet
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="text-sm text-gray-600">
                          {formatDate(invoice.seda_modified_date || invoice.seda_updated_at || invoice.invoice_date)}
                        </div>
                      </td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <a
                            href={`/invoice/${invoice.invoice_bubble_id}`}
                            className="btn-ghost text-blue-600 hover:text-blue-700 flex items-center gap-1.5"
                            title="View Invoice"
                          >
                            <Receipt className="h-4 w-4" />
                          </a>
                          {invoice.seda_bubble_id ? (
                            <a
                              href={`/seda/${invoice.seda_bubble_id}`}
                              className="btn-ghost text-primary-600 hover:text-primary-700 flex items-center gap-1.5"
                              title="View SEDA"
                            >
                              <Eye className="h-4 w-4" />
                            </a>
                          ) : (
                            <a
                              href={`https://calculator.atap.solar/new?invoice=${invoice.invoice_bubble_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn-ghost text-green-600 hover:text-green-700 flex items-center gap-1.5 text-sm"
                              title="Create SEDA"
                            >
                              Create
                            </a>
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
      </div>
    </div>
  );
}
