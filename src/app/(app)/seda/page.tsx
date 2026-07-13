"use client";

import { useState, useEffect } from "react";
import { Search, Loader2, Eye, Receipt, AlertCircle, CheckCircle, XCircle, Clock, ListChecks, Bell, AlertTriangle, GitCompare, X, ShieldCheck } from "lucide-react";

const AUTO_PROCESSED_TAB = "Auto Processed Task";
const PENDING_TASKS_TAB = "Pending Task List";

interface SedaRegistration {
  id: number;
  bubble_id: string;
  seda_status: string | null;
  installation_address: string | null;
  city: string | null;
  state: string | null;
  ic_no: string | null;
  tin_number: string | null;
  tax_document: string | null;
  email: string | null;
  customer_name: string | null;
  agent_user_id: string | null;
  agent_user_email: string | null;
  agent_code: string | null;
  modified_date: string | null;
  updated_at: string | null;
  created_date: string | null;
  linked_invoice: string[] | null;
  share_token: string | null;
  percent_of_total_amount: number;
  completed_count: number;
  total_checkpoints?: number;
  is_form_completed: boolean;
  has_required_payment: boolean;
  application_type: string | null;
  seda_profile_status: string | null;
  seda_profile_id: string | null;
}

interface SedaGroup {
  seda_status: string;
  count: number;
  registrations: SedaRegistration[];
}

interface AutoProcessedTask {
  id: number;
  invoice_id: number | null;
  invoice_number: string | null;
  entity_id: string | null;
  changes: Array<{ field: string; before: unknown; after: unknown }> | string | null;
  actor_name: string | null;
  source_app: string | null;
  edited_at: string;
  customer_name: string | null;
}

function parseChanges(changes: AutoProcessedTask["changes"]): Array<{ field: string; before: unknown; after: unknown }> {
  if (Array.isArray(changes)) return changes;
  if (typeof changes === "string") {
    try {
      const parsed = JSON.parse(changes);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not set";
  return String(value);
}

type PendingTaskMatchStatus = "already_resolved" | "needs_attention" | "missing_data";

interface PendingSedaTask {
  id: number;
  application_number: string | null;
  customer_name: string | null;
  installation_address: string | null;
  status: string;
  requires_manual_review: boolean;
  attempt_count: number;
  last_error: string | null;
  source_email_id: string;
  created_at: string;
  updated_at: string;
  target_status: string;
  match_status: PendingTaskMatchStatus;
  matched_bubble_id: string | null;
  matched_current_status: string | null;
  match_score: number | null;
  matched_percent_paid: number | null;
  matched_has_required_payment: boolean | null;
}

interface DiagnoseCandidate {
  bubble_id: string;
  customer_name: string;
  installation_address: string;
  current_status: string | null;
  name_score: number;
  address_score: number;
  score: number;
  invoice_number: string | null;
  percent_of_total_amount: number;
  has_required_payment: boolean;
}

interface DiagnoseData {
  task: {
    id: number;
    application_number: string | null;
    customer_name: string | null;
    installation_address: string | null;
    last_error: string | null;
    target_status: string;
  };
  thresholds: {
    match_threshold: number;
    min_field_score: number;
    min_score_margin: number;
  };
  candidates: DiagnoseCandidate[];
}

export default function SedaListPage() {
  const [data, setData] = useState<SedaGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("Pending");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [attentionCount, setAttentionCount] = useState<number>(0);
  const [autoProcessedTasks, setAutoProcessedTasks] = useState<AutoProcessedTask[]>([]);
  const [autoProcessedLoading, setAutoProcessedLoading] = useState(false);
  const [autoProcessedError, setAutoProcessedError] = useState<string | null>(null);
  const [pendingTasks, setPendingTasks] = useState<PendingSedaTask[]>([]);
  const [pendingTasksLoading, setPendingTasksLoading] = useState(false);
  const [pendingTasksError, setPendingTasksError] = useState<string | null>(null);
  const [pendingNeedsAttentionCount, setPendingNeedsAttentionCount] = useState<number>(0);
  const [diagnoseModalOpen, setDiagnoseModalOpen] = useState(false);
  const [diagnoseData, setDiagnoseData] = useState<DiagnoseData | null>(null);
  const [diagnoseLoading, setDiagnoseLoading] = useState(false);
  const [diagnoseError, setDiagnoseError] = useState<string | null>(null);
  const [diagnoseTaskId, setDiagnoseTaskId] = useState<number | null>(null);
  const [approvingBubbleId, setApprovingBubbleId] = useState<string | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [approvedBubbleId, setApprovedBubbleId] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab === AUTO_PROCESSED_TAB) {
      fetchAutoProcessedTasks();
    } else if (activeTab === PENDING_TASKS_TAB) {
      fetchPendingTasks();
    } else {
      fetchData();
    }
  }, [search, activeTab]);

  useEffect(() => {
    // Fetch once on mount so the "needs attention" badge is visible
    // even if the admin hasn't opened the Pending Task List tab yet.
    fetchPendingTasks();
  }, []);

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

      const result = await response.json();
      setData(result.groups || []);
      setAttentionCount(result.attentionCount || 0);
    } catch (error) {
      console.error("Error fetching SEDA registrations:", error);
      alert("Failed to load SEDA registrations. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const fetchAutoProcessedTasks = async () => {
    setAutoProcessedLoading(true);
    setAutoProcessedError(null);
    try {
      const response = await fetch("/api/seda/auto-processed-tasks");
      if (!response.ok) throw new Error("Failed to fetch auto-processed tasks");
      const result = await response.json();
      setAutoProcessedTasks(result.tasks || []);
    } catch (error) {
      console.error("Error fetching SEDA auto-processed tasks:", error);
      setAutoProcessedError("Failed to load the latest SEDA status updates.");
    } finally {
      setAutoProcessedLoading(false);
    }
  };

  const fetchPendingTasks = async () => {
    setPendingTasksLoading(true);
    setPendingTasksError(null);
    try {
      const response = await fetch("/api/seda/pending-tasks");
      if (!response.ok) throw new Error("Failed to fetch pending SEDA tasks");
      const result = await response.json();
      setPendingTasks(result.tasks || []);
      setPendingNeedsAttentionCount(result.needsAttentionCount || 0);
    } catch (error) {
      console.error("Error fetching pending SEDA tasks:", error);
      setPendingTasksError("Failed to load pending SEDA tasks.");
    } finally {
      setPendingTasksLoading(false);
    }
  };

  const openDiagnose = async (taskId: number) => {
    setDiagnoseModalOpen(true);
    setDiagnoseTaskId(taskId);
    setDiagnoseData(null);
    setDiagnoseError(null);
    setDiagnoseLoading(true);
    setApproveError(null);
    setApprovedBubbleId(null);
    try {
      const response = await fetch(`/api/seda/pending-tasks/${taskId}`);
      if (!response.ok) throw new Error("Failed to load diagnosis");
      const result = await response.json();
      setDiagnoseData(result);
    } catch (error) {
      console.error("Error diagnosing pending SEDA task:", error);
      setDiagnoseError("Failed to load match diagnosis for this task.");
    } finally {
      setDiagnoseLoading(false);
    }
  };

  const closeDiagnose = () => {
    setDiagnoseModalOpen(false);
    setDiagnoseTaskId(null);
    setDiagnoseData(null);
    setDiagnoseError(null);
    setDiagnoseLoading(false);
    setApproveError(null);
    setApprovedBubbleId(null);
  };

  const handleApprove = async (candidate: DiagnoseCandidate) => {
    if (!diagnoseTaskId) return;
    const confirmed = window.confirm(
      `Approve this SEDA registration as "${diagnoseData?.task.target_status}"?\n\n` +
      `${candidate.customer_name}\n${candidate.installation_address}\n\n` +
      `This updates the live SEDA registration status and marks the pending task as resolved.`
    );
    if (!confirmed) return;

    setApprovingBubbleId(candidate.bubble_id);
    setApproveError(null);
    try {
      const response = await fetch(`/api/seda/pending-tasks/${diagnoseTaskId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bubble_id: candidate.bubble_id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to approve");

      setApprovedBubbleId(candidate.bubble_id);
      fetchPendingTasks();
    } catch (error) {
      console.error("Error approving SEDA task:", error);
      setApproveError(error instanceof Error ? error.message : "Failed to approve this SEDA registration.");
    } finally {
      setApprovingBubbleId(null);
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

  const formatDateTime = (dateStr: string | null): string => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const tabs: Array<{
    id: string;
    label: string;
    description: string;
    icon: typeof AlertCircle;
    badge?: number;
  }> = [
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
    },
    {
      id: AUTO_PROCESSED_TAB,
      label: "Auto Processed Task",
      description: "Latest SEDA status updates",
      icon: ListChecks
    },
    {
      id: PENDING_TASKS_TAB,
      label: "Pending Task List",
      description: "SEDA tasks awaiting a match",
      icon: Bell,
      badge: pendingNeedsAttentionCount > 0 ? pendingNeedsAttentionCount : undefined
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
              <div className="flex flex-col gap-2 mt-2">
                <p className="text-slate-500">
                  View and manage existing SEDA registration forms
                </p>
                <div className="flex items-center">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-sm">
                    INVOICE WITH PAYMENT &ge; 4% RECEIVED
                  </span>
                </div>
              </div>
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
                    <div className={`flex items-center gap-2 text-sm font-semibold ${activeTab === tab.id ? 'text-slate-900' : 'text-slate-600'
                      }`}>
                      {tab.label}
                      {!!tab.badge && (
                        <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-bold">
                          {tab.badge}
                        </span>
                      )}
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
        {activeTab !== AUTO_PROCESSED_TAB && activeTab !== PENDING_TASKS_TAB && <form onSubmit={handleSearch} className="mb-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search by customer, address, IC number, TIN number, user ID, user email..."
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
        </form>}

        {activeTab === AUTO_PROCESSED_TAB ? (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">Latest SEDA status updates</h2>
              <p className="text-sm text-slate-500 mt-1">The 20 most recent invoice audit log entries created when a SEDA status was updated.</p>
            </div>

            {autoProcessedLoading ? (
              <div className="p-16 text-center">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-slate-400" />
                <p className="mt-4 text-slate-500">Loading status updates...</p>
              </div>
            ) : autoProcessedError ? (
              <div className="p-10 text-center text-sm text-red-600">{autoProcessedError}</div>
            ) : autoProcessedTasks.length === 0 ? (
              <div className="p-16 text-center text-sm text-slate-500">No SEDA status updates found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Invoice</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Customer</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status update</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {autoProcessedTasks.map((task) => {
                      const statusChange = parseChanges(task.changes).find((change) => change.field === "seda_status");
                      return (
                        <tr key={task.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 text-sm text-slate-600 whitespace-nowrap">{formatDateTime(task.edited_at)}</td>
                          <td className="px-6 py-4">
                            {task.invoice_id ? (
                              <a href={`/invoice/${task.invoice_id}`} className="text-sm font-semibold text-blue-600 hover:text-blue-800">
                                {task.invoice_number || `Invoice #${task.invoice_id}`}
                              </a>
                            ) : (
                              <span className="text-sm text-slate-500">Not linked</span>
                            )}
                            <div className="text-xs text-slate-400 font-mono mt-1 truncate max-w-[14rem]">{task.entity_id || "No SEDA ID"}</div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-700">{task.customer_name || "Not available"}</td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2 text-sm">
                              <span className="px-2 py-1 rounded-md bg-slate-100 text-slate-600">{displayValue(statusChange?.before)}</span>
                              <span className="text-slate-400">→</span>
                              <span className="px-2 py-1 rounded-md bg-emerald-100 text-emerald-700 font-semibold">{displayValue(statusChange?.after)}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-500">{task.source_app || task.actor_name || "System"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : activeTab === PENDING_TASKS_TAB ? (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">Pending SEDA tasks</h2>
              <p className="text-sm text-slate-500 mt-1">
                Tasks the email worker created from SEDA application emails but hasn&apos;t auto-processed yet.
                Each one is re-checked against SEDA Registration Management — if the target status is already set, it likely means an admin already handled it manually.
              </p>
            </div>

            {pendingTasksLoading ? (
              <div className="p-16 text-center">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-slate-400" />
                <p className="mt-4 text-slate-500">Loading pending tasks...</p>
              </div>
            ) : pendingTasksError ? (
              <div className="p-10 text-center text-sm text-red-600">{pendingTasksError}</div>
            ) : pendingTasks.length === 0 ? (
              <div className="p-16 text-center text-sm text-slate-500">No pending SEDA tasks. All caught up.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Application #</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Customer</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Target Status</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Match Result</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Reason / Last Error</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-32">Created</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider w-28">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pendingTasks.map((task) => (
                      <tr key={task.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="text-sm font-semibold text-slate-900">{task.application_number || `Task #${task.id}`}</div>
                          {task.requires_manual_review && (
                            <div className="text-xs text-amber-600 mt-1">Needs manual review</div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-slate-900 max-w-xs truncate">{task.customer_name || "Not available"}</div>
                          <div className="text-xs text-slate-400 mt-1 max-w-xs truncate">{task.installation_address || "No address"}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-1 rounded-md bg-slate-100 text-slate-600 text-sm">{task.target_status}</span>
                        </td>
                        <td className="px-6 py-4">
                          {task.match_status === "already_resolved" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                              <CheckCircle className="w-3 h-3" />
                              No Processed Needed
                            </span>
                          ) : task.match_status === "missing_data" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                              <XCircle className="w-3 h-3" />
                              Missing Name/Address
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold rounded-full bg-red-100 text-red-700 border border-red-200">
                              <AlertTriangle className="w-3 h-3" />
                              Needs Attention
                            </span>
                          )}
                          {task.match_score !== null && (
                            <div className="text-xs text-slate-400 mt-1">Match score: {(task.match_score * 100).toFixed(1)}%</div>
                          )}
                          {task.matched_percent_paid !== null && (
                            <div className={`text-xs mt-1 ${task.matched_has_required_payment ? "text-emerald-600" : "text-red-500"}`}>
                              Payment: {task.matched_percent_paid.toFixed(1)}%{task.matched_has_required_payment ? " ✓" : ""}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-500 max-w-xs truncate" title={task.last_error || undefined}>
                          {task.last_error || "Not attempted yet"}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-500 whitespace-nowrap">{formatDate(task.created_at)}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-1">
                            {task.match_status !== "missing_data" && (
                              <button
                                type="button"
                                onClick={() => openDiagnose(task.id)}
                                className="inline-flex items-center gap-1 p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Compare email data vs SEDA Registration DB"
                              >
                                <GitCompare className="w-4 h-4" />
                              </button>
                            )}
                            {task.matched_bubble_id && (
                              <a
                                href={`/seda/${task.matched_bubble_id}`}
                                className="inline-flex items-center gap-1 p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                title="View matched SEDA registration"
                              >
                                <Eye className="w-4 h-4" />
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : loading ? (
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
                          <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-56">
                            Agent User
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
                          const totalCheckpoints = seda.total_checkpoints || 7;
                          const openSedaForm = () => {
                            window.location.href = `/seda/${seda.bubble_id}`;
                          };

                          return (
                            <tr
                              key={seda.bubble_id}
                              onClick={openSedaForm}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  openSedaForm();
                                }
                              }}
                              role="button"
                              tabIndex={0}
                              title="Open SEDA form"
                              className="cursor-pointer hover:bg-slate-50 focus:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500 transition-colors"
                            >
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
                                  {seda.tin_number && <span className="ml-2">| TIN: {seda.tin_number}</span>}
                                  {seda.tax_document && <span className="ml-2 text-emerald-600">✓ Tax Doc</span>}
                                  {seda.application_type && <span className="ml-2 uppercase">{seda.application_type}</span>}
                                </div>
                              </td>

                              {/* Agent User */}
                              <td className="px-6 py-4">
                                <div className="text-sm text-slate-900 font-mono max-w-[14rem] truncate">
                                  {seda.agent_user_id || "No user ID"}
                                </div>
                                <div className="text-xs text-slate-400 mt-1 max-w-[14rem] truncate">
                                  {seda.agent_user_email || seda.agent_code || "No user email"}
                                </div>
                              </td>

                              {/* Form Progress */}
                              <td className="px-6 py-4">
                                <div className="flex flex-col gap-1">
                                  <div className="text-xs font-semibold text-slate-700">
                                    {seda.completed_count}/{totalCheckpoints} Complete
                                  </div>
                                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                    <div
                                      className={`h-full transition-all ${seda.completed_count === totalCheckpoints ? "bg-emerald-500" : "bg-blue-400"
                                        }`}
                                      style={{ width: `${(seda.completed_count / totalCheckpoints) * 100}%` }}
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
                                      onClick={(event) => event.stopPropagation()}
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
                                      onClick={(event) => event.stopPropagation()}
                                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                      title="View Invoice"
                                    >
                                      <Receipt className="w-4 h-4" />
                                    </a>
                                  )}
                                  <a
                                    href={`/seda/${seda.bubble_id}`}
                                    onClick={(event) => event.stopPropagation()}
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

      {diagnoseModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
          onClick={closeDiagnose}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[85vh] overflow-y-auto"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">
                Match Diagnosis{diagnoseData ? ` — ${diagnoseData.task.application_number || `Task #${diagnoseData.task.id}`}` : ""}
              </h3>
              <button
                type="button"
                onClick={closeDiagnose}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              {diagnoseLoading ? (
                <div className="p-10 text-center">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto text-slate-400" />
                  <p className="mt-4 text-slate-500">Loading diagnosis...</p>
                </div>
              ) : diagnoseError ? (
                <div className="p-6 text-center text-sm text-red-600">{diagnoseError}</div>
              ) : diagnoseData ? (
                <>
                  <div className="mb-6">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">From the SEDA email (task)</div>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs text-slate-400">Customer Name</div>
                        <div className="text-sm font-medium text-slate-900">{diagnoseData.task.customer_name || "Not extracted"}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400">Installation Address</div>
                        <div className="text-sm font-medium text-slate-900 whitespace-pre-wrap">{diagnoseData.task.installation_address || "Not extracted"}</div>
                      </div>
                    </div>
                    {diagnoseData.task.last_error && (
                      <div className="mt-2 text-xs text-amber-600">Last error: {diagnoseData.task.last_error}</div>
                    )}
                  </div>

                  {approveError && (
                    <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{approveError}</div>
                  )}

                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Closest SEDA Registration DB matches</div>
                    <div className="text-xs text-slate-400">
                      Needs ≥{Math.round(diagnoseData.thresholds.match_threshold * 100)}% overall,
                      ≥{Math.round(diagnoseData.thresholds.min_field_score * 100)}% each field,
                      and ≥{Math.round(diagnoseData.thresholds.min_score_margin * 100)}% lead over 2nd place
                    </div>
                  </div>

                  {diagnoseData.candidates.length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-lg">
                      No SEDA registrations found to compare against.
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-slate-200 rounded-lg">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50">
                            <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">DB Name</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">DB Address</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-24">Name %</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-24">Address %</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-24">Overall %</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-28">Payment</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-32">Admin Action</th>
                            <th className="px-4 py-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider w-16"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {diagnoseData.candidates.map((candidate, index) => {
                            const passesOverall = candidate.score >= diagnoseData.thresholds.match_threshold;
                            const passesFields =
                              candidate.name_score >= diagnoseData.thresholds.min_field_score &&
                              candidate.address_score >= diagnoseData.thresholds.min_field_score;
                            return (
                              <tr key={candidate.bubble_id} className={index === 0 ? "bg-blue-50/40" : undefined}>
                                <td className="px-4 py-3 text-sm text-slate-900 max-w-[14rem] truncate">{candidate.customer_name}</td>
                                <td className="px-4 py-3 text-sm text-slate-600 max-w-[16rem] whitespace-pre-wrap">{candidate.installation_address}</td>
                                <td className={`px-4 py-3 text-sm font-semibold ${candidate.name_score >= diagnoseData.thresholds.min_field_score ? "text-emerald-600" : "text-red-600"}`}>
                                  {(candidate.name_score * 100).toFixed(1)}%
                                </td>
                                <td className={`px-4 py-3 text-sm font-semibold ${candidate.address_score >= diagnoseData.thresholds.min_field_score ? "text-emerald-600" : "text-red-600"}`}>
                                  {(candidate.address_score * 100).toFixed(1)}%
                                </td>
                                <td className={`px-4 py-3 text-sm font-bold ${passesOverall && passesFields ? "text-emerald-600" : "text-red-600"}`}>
                                  {(candidate.score * 100).toFixed(1)}%
                                </td>
                                <td className="px-4 py-3 text-sm text-slate-500">{candidate.current_status || "N/A"}</td>
                                <td className="px-4 py-3">
                                  <div className={`text-sm font-semibold ${candidate.has_required_payment ? "text-emerald-600" : "text-red-600"}`}>
                                    {candidate.percent_of_total_amount.toFixed(1)}%
                                    {candidate.has_required_payment && <span className="ml-1">✓</span>}
                                  </div>
                                  {candidate.invoice_number && (
                                    <div className="text-xs text-slate-400 truncate max-w-[8rem]">{candidate.invoice_number}</div>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  {approvedBubbleId === candidate.bubble_id ? (
                                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                                      <CheckCircle className="w-3.5 h-3.5" />
                                      Approved
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      disabled={!candidate.has_required_payment || approvingBubbleId === candidate.bubble_id}
                                      onClick={() => handleApprove(candidate)}
                                      title={candidate.has_required_payment ? `Set this registration to ${diagnoseData.task.target_status}` : "Cannot approve: linked invoice payment is below the required 4%"}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
                                    >
                                      {approvingBubbleId === candidate.bubble_id ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      ) : (
                                        <ShieldCheck className="w-3.5 h-3.5" />
                                      )}
                                      Approve
                                    </button>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <a
                                    href={`/seda/${candidate.bubble_id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                    title="View this SEDA registration"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </a>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
