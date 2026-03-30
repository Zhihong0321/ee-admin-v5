"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Filter,
  Handshake,
  Link2,
  Mail,
  MapPin,
  Phone,
  Search,
  Sparkles,
  User,
  Users,
  UserPlus,
  X,
} from "lucide-react";
import { getReferralAgents, getReferrals, searchReferralInvoices, updateReferral } from "./actions";

type ReferralRow = {
  id: number;
  bubble_id: string | null;
  linked_customer_profile: string | null;
  name: string | null;
  relationship: string | null;
  mobile_number: string | null;
  status: string | null;
  created_at: string | Date | null;
  updated_at: string | Date | null;
  linked_agent: string | null;
  preferred_agent_log: string | null;
  deal_value: string | number | null;
  commission_earned: string | number | null;
  linked_invoice: string | null;
  project_type: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  agent_name: string | null;
  agent_contact: string | null;
  agent_bubble_id: string | null;
};

type AgentOption = {
  id: number;
  bubble_id: string | null;
  name: string | null;
  contact: string | null;
  email: string | null;
  agent_type: string | null;
};

type InvoiceOption = {
  id: number;
  bubble_id: string | null;
  invoice_number: string | null;
  linked_customer: string | null;
  customer_name: string | null;
  total_amount: string | number | null;
  invoice_date: string | Date | null;
  linked_referral: string | null;
  is_linked_elsewhere: boolean;
};

const STATUS_OPTIONS = ["All", "Pending", "Contacted", "Qualified", "Converted", "Won", "Lost", "Rejected"];

function formatMoney(value: string | number | null | undefined) {
  const numericValue = Number(value ?? 0);
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(numericValue) ? numericValue : 0);
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "N/A";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString("en-MY", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatusClasses(status: string | null | undefined) {
  const normalized = (status || "Pending").toLowerCase();
  if (normalized.includes("won") || normalized.includes("convert")) {
    return "bg-emerald-100 text-emerald-700 border-emerald-200";
  }
  if (normalized.includes("lost") || normalized.includes("reject")) {
    return "bg-red-100 text-red-700 border-red-200";
  }
  if (normalized.includes("contact") || normalized.includes("qualif")) {
    return "bg-amber-100 text-amber-700 border-amber-200";
  }
  return "bg-secondary-100 text-secondary-700 border-secondary-200";
}

export default function ReferralsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(50);
  const [totalRows, setTotalRows] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [stats, setStats] = useState({ total: 0, assigned: 0, unassigned: 0, pending: 0 });
  const [editingReferral, setEditingReferral] = useState<ReferralRow | null>(null);
  const [agentSearch, setAgentSearch] = useState("");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceResults, setInvoiceResults] = useState<InvoiceOption[]>([]);
  const [activeTab, setActiveTab] = useState<"details" | "invoice">("details");
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  useEffect(() => {
    fetchData(1, search, statusFilter);
    loadAgents();
  }, []);

  async function loadAgents() {
    setLoadingAgents(true);
    try {
      const data = await getReferralAgents();
      setAgents(data);
    } catch (error) {
      console.error("Failed to fetch agents", error);
    } finally {
      setLoadingAgents(false);
    }
  }

  async function fetchData(page = currentPage, searchTerm = search, status = statusFilter) {
    setLoading(true);
    try {
      const data = await getReferrals({
        search: searchTerm,
        status,
        page,
        pageSize,
      });
      setReferrals(data.referrals);
      setCurrentPage(data.pagination.page);
      setTotalRows(data.pagination.total);
      setTotalPages(data.pagination.totalPages);
      setStats(data.stats);
    } catch (error) {
      console.error("Failed to fetch referrals", error);
    } finally {
      setLoading(false);
    }
  }

  const filteredAgents = useMemo(() => {
    const term = agentSearch.trim().toLowerCase();
    if (!term) return agents.slice(0, 12);

    return agents
      .filter((agent) => {
        const haystack = [
          agent.name,
          agent.email,
          agent.contact,
          agent.bubble_id,
          String(agent.id),
          agent.agent_type,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(term);
      })
      .slice(0, 12);
  }, [agentSearch, agents]);

  const selectedAgent = useMemo(() => {
    if (!editingReferral?.linked_agent) return null;
    return agents.find((agent) => String(agent.id) === editingReferral.linked_agent) || null;
  }, [agents, editingReferral]);

  const selectedInvoice = useMemo(() => {
    if (!editingReferral?.linked_invoice) return null;
    return invoiceResults.find((invoice) => invoice.bubble_id === editingReferral.linked_invoice) || null;
  }, [invoiceResults, editingReferral]);

  async function loadInvoiceMatches(referralId: number, searchTerm = invoiceSearch) {
    setLoadingInvoices(true);
    try {
      const result = await searchReferralInvoices(referralId, searchTerm);
      if (result.success) {
        setInvoiceResults(result.invoices);
      } else {
        console.error("Failed to fetch invoices", result.error);
        setInvoiceResults([]);
      }
    } catch (error) {
      console.error("Failed to fetch invoices", error);
      setInvoiceResults([]);
    } finally {
      setLoadingInvoices(false);
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    fetchData(1, search, statusFilter);
  };

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value);
    setCurrentPage(1);
    fetchData(1, search, value);
  };

  const handleEditClick = (referral: ReferralRow) => {
    setEditingReferral({ ...referral });
    setAgentSearch(referral.agent_name || "");
    const initialInvoiceSearch = referral.customer_name || referral.name || referral.linked_customer_profile || "";
    setInvoiceSearch(initialInvoiceSearch);
    setInvoiceResults([]);
    setActiveTab("details");
    setIsEditModalOpen(true);
    void loadInvoiceMatches(referral.id, initialInvoiceSearch);
  };

  const handleSaveReferral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingReferral) return;

    setSaving(true);
    try {
      const result = await updateReferral(editingReferral.id, {
        status: editingReferral.status || "Pending",
        linked_agent: editingReferral.linked_agent || null,
        linked_invoice: editingReferral.linked_invoice || null,
      });

      if (result.success) {
        setIsEditModalOpen(false);
        await fetchData(currentPage, search, statusFilter);
      } else {
        alert(result.error || "Failed to update referral");
      }
    } catch (error) {
      console.error("Failed to update referral", error);
      alert("Failed to update referral");
    } finally {
      setSaving(false);
    }
  };

  const startResult = totalRows === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endResult = totalRows === 0 ? 0 : Math.min(currentPage * pageSize, totalRows);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-secondary-900">Referral Management</h1>
          <p className="text-secondary-600">
            Browse all referrals, update their status, and assign them to sales agents.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fetchData(currentPage, search, statusFilter)}
            className="btn-secondary flex items-center gap-2"
          >
            <Sparkles className="h-4 w-4" />
            Refresh
          </button>
          <button type="button" className="btn-secondary flex items-center gap-2">
            <Users className="h-4 w-4" />
            Export
          </button>
          <button type="button" className="btn-primary flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            New Referral
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="card p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-secondary-500">Total</p>
          <div className="mt-2 flex items-end justify-between">
            <span className="text-3xl font-bold text-secondary-900">{stats.total}</span>
            <Handshake className="h-6 w-6 text-primary-500" />
          </div>
        </div>
        <div className="card p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-secondary-500">Assigned</p>
          <div className="mt-2 flex items-end justify-between">
            <span className="text-3xl font-bold text-secondary-900">{stats.assigned}</span>
            <User className="h-6 w-6 text-emerald-500" />
          </div>
        </div>
        <div className="card p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-secondary-500">Unassigned</p>
          <div className="mt-2 flex items-end justify-between">
            <span className="text-3xl font-bold text-secondary-900">{stats.unassigned}</span>
            <MapPin className="h-6 w-6 text-amber-500" />
          </div>
        </div>
        <div className="card p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-secondary-500">Pending</p>
          <div className="mt-2 flex items-end justify-between">
            <span className="text-3xl font-bold text-secondary-900">{stats.pending}</span>
            <Users className="h-6 w-6 text-secondary-400" />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="p-6 border-b border-secondary-200 bg-gradient-to-r from-secondary-50/50 to-white">
          <form onSubmit={handleSearch} className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="relative w-full xl:max-w-xl">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search by referral name, mobile number, customer, bubble id, or agent..."
                className="input pl-12 pr-4"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-secondary-500" />
                <select
                  value={statusFilter}
                  onChange={(e) => handleStatusFilterChange(e.target.value)}
                  className="input min-w-[180px] py-2.5"
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option === "All" ? "All statuses" : option}
                    </option>
                  ))}
                </select>
              </div>

              <button type="button" onClick={() => fetchData(1, search, statusFilter)} className="btn-secondary flex items-center gap-2">
                <ArrowUpDown className="w-4 h-4" />
                Apply Filters
              </button>
            </div>
          </form>
        </div>

        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Referral</th>
                <th>Customer</th>
                <th>Agent</th>
                <th>Contact</th>
                <th>Status</th>
                <th>Deal / Commission</th>
                <th>Dates</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <tr key={index} className="animate-pulse">
                    <td colSpan={8} className="px-6 py-6">
                      <div className="h-4 rounded bg-secondary-200 w-3/4" />
                    </td>
                  </tr>
                ))
              ) : referrals.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="p-4 bg-secondary-100 rounded-full">
                        <UserPlus className="h-8 w-8 text-secondary-400" />
                      </div>
                      <div>
                        <p className="font-medium text-secondary-900 mb-1">No referrals found</p>
                        <p className="text-sm text-secondary-600">
                          {search || statusFilter !== "All"
                            ? "Try adjusting the search or status filter"
                            : "There are no referral records yet"}
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                referrals.map((referral) => (
                  <tr key={referral.id}>
                    <td>
                      <div className="space-y-1">
                        <div className="font-semibold text-secondary-900">{referral.name || "Unnamed referral"}</div>
                        <div className="text-xs text-secondary-500 flex items-center gap-1.5">
                          <span className="font-mono">{referral.bubble_id || "No bubble id"}</span>
                        </div>
                        <div className="text-[11px] text-secondary-400">
                          {referral.relationship || "No relationship noted"}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="space-y-1">
                        <div className="text-sm font-medium text-secondary-900">
                          {referral.customer_name || referral.linked_customer_profile || "Unlinked customer"}
                        </div>
                        <div className="text-xs text-secondary-500">
                          {referral.project_type || "No project type"}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="h-9 w-9 rounded-full bg-primary-50 flex items-center justify-center">
                          <User className="h-4 w-4 text-primary-600" />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-secondary-900">
                            {referral.agent_name || "Unassigned"}
                          </div>
                          <div className="truncate text-[11px] text-secondary-500">
                            {referral.agent_bubble_id ? `Agent ID: ${referral.agent_bubble_id}` : "No assigned agent"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm text-secondary-600">
                          <Phone className="h-3.5 w-3.5" />
                          {referral.mobile_number || "No phone"}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-secondary-600">
                          <Mail className="h-3.5 w-3.5" />
                          {referral.customer_email || "No email"}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold border ${getStatusClasses(referral.status)}`}>
                        {referral.status || "Pending"}
                      </span>
                    </td>
                    <td>
                      <div className="space-y-1 text-sm">
                        <div className="font-medium text-secondary-900">{formatMoney(referral.deal_value)}</div>
                        <div className="text-xs text-secondary-500">
                          Commission {formatMoney(referral.commission_earned)}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="space-y-1 text-xs text-secondary-500">
                        <div>Created: {formatDate(referral.created_at)}</div>
                        <div>Updated: {formatDate(referral.updated_at)}</div>
                      </div>
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleEditClick(referral)}
                          className="btn-ghost text-primary-600 hover:text-primary-700 flex items-center gap-1.5"
                        >
                          <Sparkles className="h-4 w-4" />
                          Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="p-6 border-t border-secondary-200 bg-secondary-50/30 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-secondary-600">
            Showing <span className="font-semibold text-secondary-900">{startResult}</span> to{" "}
            <span className="font-semibold text-secondary-900">{endResult}</span> of{" "}
            <span className="font-semibold text-secondary-900">{totalRows}</span> referrals
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fetchData(currentPage - 1, search, statusFilter)}
              disabled={loading || currentPage <= 1}
              className="p-2 rounded-lg border border-secondary-200 bg-white text-secondary-500 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-secondary-50 transition-colors"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-3 py-1.5 text-sm font-medium text-secondary-700 bg-white border border-secondary-200 rounded-lg">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => fetchData(currentPage + 1, search, statusFilter)}
              disabled={loading || currentPage >= totalPages}
              className="p-2 rounded-lg border border-secondary-200 bg-white text-secondary-500 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-secondary-50 transition-colors"
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {isEditModalOpen && editingReferral && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-secondary-900/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-elevation-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col animate-scale-in">
            <div className="p-6 border-b border-secondary-200 flex items-center justify-between bg-white z-10">
              <div>
                <h2 className="text-xl font-bold text-secondary-900">Edit Referral</h2>
                <p className="text-sm text-secondary-500 mt-0.5">
                  {editingReferral.name || editingReferral.bubble_id || `Referral #${editingReferral.id}`}
                </p>
                <div className="flex gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => setActiveTab("details")}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      activeTab === "details"
                        ? "bg-primary-600 text-white"
                        : "bg-secondary-100 text-secondary-600 hover:bg-secondary-200"
                    }`}
                  >
                    Details
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("invoice")}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                      activeTab === "invoice"
                        ? "bg-primary-600 text-white"
                        : "bg-secondary-100 text-secondary-600 hover:bg-secondary-200"
                    }`}
                  >
                    <FileText className="h-4 w-4" />
                    Invoice Link
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsEditModalOpen(false);
                  setInvoiceResults([]);
                }}
                className="p-2 hover:bg-secondary-100 rounded-full transition-colors"
              >
                <X className="h-6 w-6 text-secondary-500" />
              </button>
            </div>

            <form id="referral-edit-form" onSubmit={handleSaveReferral} className="flex-1 overflow-y-auto p-6 space-y-6">
              {activeTab === "details" ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-secondary-700">Referral Name</label>
                      <input
                        type="text"
                        className="input bg-secondary-50"
                        value={editingReferral.name || ""}
                        disabled
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-secondary-700">Mobile Number</label>
                      <input
                        type="text"
                        className="input bg-secondary-50"
                        value={editingReferral.mobile_number || ""}
                        disabled
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-secondary-700">Customer Profile</label>
                      <input
                        type="text"
                        className="input bg-secondary-50"
                        value={editingReferral.linked_customer_profile || ""}
                        disabled
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-secondary-700">Project Type</label>
                      <input
                        type="text"
                        className="input bg-secondary-50"
                        value={editingReferral.project_type || ""}
                        disabled
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-secondary-700">Status</label>
                      <input
                        list="referral-status-options"
                        type="text"
                        className="input"
                        value={editingReferral.status || "Pending"}
                        onChange={(e) => setEditingReferral({ ...editingReferral, status: e.target.value })}
                      />
                      <datalist id="referral-status-options">
                        {STATUS_OPTIONS.filter((option) => option !== "All").map((option) => (
                          <option key={option} value={option} />
                        ))}
                      </datalist>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-secondary-700">Assigned Agent</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          className="input"
                          placeholder={loadingAgents ? "Loading agents..." : "Search by name, email, or contact"}
                          value={agentSearch}
                          onChange={(e) => setAgentSearch(e.target.value)}
                        />
                        {editingReferral.linked_agent && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingReferral({ ...editingReferral, linked_agent: null });
                              setAgentSearch("");
                            }}
                            className="btn-secondary whitespace-nowrap"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-secondary-500">
                        Selected:{" "}
                        <span className="font-medium text-secondary-800">
                          {selectedAgent ? `${selectedAgent.name} (ID ${selectedAgent.id})` : "Unassigned"}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-secondary-700">Preferred Agent History</label>
                    <textarea
                      className="input min-h-[180px] font-mono text-xs leading-5 bg-secondary-50"
                      value={editingReferral.preferred_agent_log || ""}
                      readOnly
                      placeholder="Agent change history will appear here after updates."
                    />
                    <p className="text-xs text-secondary-500">
                      Every change to the preferred agent is appended with the editor name and timestamp.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-semibold text-secondary-700">Agent Matches</label>
                      <span className="text-xs text-secondary-500">{filteredAgents.length} shown</span>
                    </div>
                    <div className="max-h-72 overflow-y-auto rounded-2xl border border-secondary-200 bg-secondary-50/40 p-3 space-y-2">
                      {filteredAgents.length === 0 ? (
                        <div className="py-10 text-center text-sm text-secondary-500">
                          No agents match your search.
                        </div>
                      ) : (
                        filteredAgents.map((agent) => {
                          const isSelected = editingReferral.linked_agent === String(agent.id);
                          return (
                            <button
                              key={agent.id}
                              type="button"
                              onClick={() => {
                                setEditingReferral({ ...editingReferral, linked_agent: String(agent.id) });
                                setAgentSearch(agent.name || "");
                              }}
                              className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${
                                isSelected
                                  ? "border-primary-400 bg-primary-50"
                                  : "border-secondary-200 bg-white hover:border-primary-200 hover:bg-primary-50/60"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="font-semibold text-secondary-900 truncate">
                                    {agent.name || "Unnamed agent"}
                                  </div>
                                  <div className="mt-1 text-xs text-secondary-500 truncate">
                                    {agent.contact || "No contact"} {agent.email ? `• ${agent.email}` : ""}
                                  </div>
                                </div>
                                <div className="text-right text-[11px] text-secondary-500 shrink-0">
                                  <div className="font-mono">ID {agent.id}</div>
                                  <div>{agent.bubble_id || "No bubble id"}</div>
                                </div>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded-2xl border border-secondary-200 bg-secondary-50/50 p-5 space-y-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-secondary-900">Link Invoice To Referral</h3>
                        <p className="text-sm text-secondary-600">
                          Search existing invoices by customer name or invoice number, then attach the invoice to this referral for referral fee tracking.
                        </p>
                      </div>
                      <div className="text-xs text-secondary-500">
                        Customer: <span className="font-medium text-secondary-700">{editingReferral.customer_name || editingReferral.name || "N/A"}</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-secondary-700">Selected Invoice</label>
                      <div className="rounded-xl border border-secondary-200 bg-white px-4 py-3">
                        {selectedInvoice ? (
                          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <div className="min-w-0">
                              <div className="font-semibold text-secondary-900">
                                {selectedInvoice.invoice_number || selectedInvoice.bubble_id || `Invoice #${selectedInvoice.id}`}
                              </div>
                              <div className="text-xs text-secondary-500 mt-1">
                                {selectedInvoice.customer_name || selectedInvoice.linked_customer || "Unknown customer"} • {formatDate(selectedInvoice.invoice_date)}
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-semibold text-secondary-800">{formatMoney(selectedInvoice.total_amount)}</span>
                              <button
                                type="button"
                                onClick={() => setEditingReferral({ ...editingReferral, linked_invoice: null })}
                                className="btn-secondary"
                              >
                                Clear Link
                              </button>
                            </div>
                          </div>
                        ) : editingReferral.linked_invoice ? (
                          <div className="text-sm text-secondary-500">
                            Linked invoice ID: <span className="font-mono text-secondary-700">{editingReferral.linked_invoice}</span>
                          </div>
                        ) : (
                          <div className="text-sm text-secondary-500">No invoice linked yet.</div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-secondary-700">Search Invoices</label>
                      <div className="flex flex-col gap-3 md:flex-row">
                        <input
                          type="text"
                          className="input"
                          placeholder="Search by customer name, invoice number, or customer ID"
                          value={invoiceSearch}
                          onChange={(e) => setInvoiceSearch(e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={() => loadInvoiceMatches(editingReferral.id, invoiceSearch)}
                          className="btn-secondary flex items-center justify-center gap-2 whitespace-nowrap"
                        >
                          <Search className="h-4 w-4" />
                          Search
                        </button>
                      </div>
                      <p className="text-xs text-secondary-500">
                        Matching is biased toward the linked customer profile and similar customer names.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-semibold text-secondary-700">Invoice Matches</label>
                      <span className="text-xs text-secondary-500">{invoiceResults.length} shown</span>
                    </div>
                    <div className="max-h-[28rem] overflow-y-auto rounded-2xl border border-secondary-200 bg-secondary-50/40 p-3 space-y-2">
                      {loadingInvoices ? (
                        Array.from({ length: 4 }).map((_, index) => (
                          <div key={index} className="animate-pulse rounded-xl border border-secondary-200 bg-white px-4 py-4">
                            <div className="h-4 w-1/3 rounded bg-secondary-200" />
                            <div className="mt-3 h-3 w-2/3 rounded bg-secondary-100" />
                          </div>
                        ))
                      ) : invoiceResults.length === 0 ? (
                        <div className="py-12 text-center text-sm text-secondary-500">
                          No invoice matches found for this referral.
                        </div>
                      ) : (
                        invoiceResults.map((invoice) => {
                          const isSelected = editingReferral.linked_invoice === invoice.bubble_id;
                          return (
                            <button
                              key={invoice.id}
                              type="button"
                              disabled={invoice.is_linked_elsewhere}
                              onClick={() => setEditingReferral({ ...editingReferral, linked_invoice: invoice.bubble_id })}
                              className={`w-full text-left rounded-xl border px-4 py-4 transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${
                                isSelected
                                  ? "border-primary-400 bg-primary-50"
                                  : invoice.is_linked_elsewhere
                                    ? "border-red-200 bg-red-50/60"
                                    : "border-secondary-200 bg-white hover:border-primary-200 hover:bg-primary-50/60"
                              }`}
                            >
                              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-semibold text-secondary-900">
                                      {invoice.invoice_number || invoice.bubble_id || `Invoice #${invoice.id}`}
                                    </span>
                                    {isSelected && (
                                      <span className="inline-flex items-center rounded-full bg-primary-100 px-2 py-0.5 text-[11px] font-semibold text-primary-700">
                                        Linked
                                      </span>
                                    )}
                                    {invoice.is_linked_elsewhere && (
                                      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                                        Already linked elsewhere
                                      </span>
                                    )}
                                  </div>
                                  <div className="mt-2 text-sm text-secondary-700">
                                    {invoice.customer_name || invoice.linked_customer || "Unknown customer"}
                                  </div>
                                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-secondary-500">
                                    <span>Date: {formatDate(invoice.invoice_date)}</span>
                                    <span>Customer ID: {invoice.linked_customer || "N/A"}</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                  <div className="text-right">
                                    <div className="font-semibold text-secondary-900">{formatMoney(invoice.total_amount)}</div>
                                    <div className="text-[11px] text-secondary-500 flex items-center gap-1 justify-end">
                                      <Link2 className="h-3 w-3" />
                                      {invoice.bubble_id || "No invoice id"}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                </>
              )}
            </form>

            <div className="p-6 border-t border-secondary-200 bg-white flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsEditModalOpen(false);
                  setInvoiceResults([]);
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="referral-edit-form"
                disabled={saving}
                className="btn-primary disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
