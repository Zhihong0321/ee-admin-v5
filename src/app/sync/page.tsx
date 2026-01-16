"use client";

import { useState, useEffect, useRef } from "react";
import {
  RefreshCw, Calendar, Clock, Database, FileText,
  UserCheck, AlertCircle, CheckCircle2, Loader2, ArrowRight, Percent, ShieldCheck, Trash2, CalendarDays,
  Download, File, XCircle, Circle, FolderOpen, HardDrive, Zap, Activity, FileDown, Tag, Link, Globe
} from "lucide-react";
import { runManualSync, runIncrementalSync, fetchSyncLogs, updateInvoicePaymentPercentages, patchInvoiceCreators, deleteDemoInvoices, fixMissingInvoiceDates, startManualSyncWithProgress, updateInvoiceStatuses, restoreInvoiceSedaLinks, runFullInvoiceSync, patchFileUrlsToAbsolute } from "./actions";

export default function SyncPage() {
  const [dateFrom, setDateFrom] = useState("");
  const [syncFiles, setSyncFiles] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  // Full Invoice Sync state
  const [fullSyncDateFrom, setFullSyncDateFrom] = useState("");
  const [fullSyncDateTo, setFullSyncDateTo] = useState("");
  const [isFullSyncing, setIsFullSyncing] = useState(false);
  const [fullSyncResults, setFullSyncResults] = useState<any>(null);
  const [isUpdatingPercentages, setIsUpdatingPercentages] = useState(false);
  const [isPatchingCreators, setIsPatchingCreators] = useState(false);
  const [isDeletingDemo, setIsDeletingDemo] = useState(false);
  const [isFixingDates, setIsFixingDates] = useState(false);
  const [isUpdatingStatuses, setIsUpdatingStatuses] = useState(false);
  const [isRestoringLinks, setIsRestoringLinks] = useState(false);
  const [isPatchingUrls, setIsPatchingUrls] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);

  // Progress tracking state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [progress, setProgress] = useState<any>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Migration state
  const [migrationStats, setMigrationStats] = useState<any>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationSessionId, setMigrationSessionId] = useState<string | null>(null);
  const [migrationProgress, setMigrationProgress] = useState<any>(null);
  const migrationEventSourceRef = useRef<EventSource | null>(null);
  const [migrationDateFilter, setMigrationDateFilter] = useState<string>(''); // Date filter for migration

  const loadLogs = async () => {
    const latestLogs = await fetchSyncLogs();
    setLogs(latestLogs);
  };

  useEffect(() => {
    loadLogs();
    fetchMigrationStats(); // Load migration stats on page load
    const interval = setInterval(loadLogs, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, []);

  // Migration SSE connection
  useEffect(() => {
    console.log('[Migration SSE] Effect triggered, sessionId:', migrationSessionId);
    if (!migrationSessionId) {
      console.log('[Migration SSE] No sessionId, skipping connection');
      return;
    }

    const url = `/api/migration/progress/stream?sessionId=${migrationSessionId}`;
    console.log('[Migration SSE] Connecting to:', url);
    const eventSource = new EventSource(url);
    migrationEventSourceRef.current = eventSource;
    console.log('[Migration SSE] EventSource created');

    eventSource.onopen = () => {
      console.log('[Migration SSE] Connection opened');
    };

    eventSource.onmessage = (event) => {
      console.log('[Migration SSE] Message received:', event.data);
      const data = JSON.parse(event.data);

      if (data.type === 'initial' || data.type === 'progress') {
        console.log('[Migration SSE] Updating progress:', data.progress);
        setMigrationProgress(data.progress);
      } else if (data.type === 'completed') {
        console.log('[Migration SSE] Migration completed');
        setMigrationProgress(data.progress);
        setIsMigrating(false);
        eventSource.close();
        fetchMigrationStats(); // Refresh stats
      } else if (data.type === 'error') {
        console.error('[Migration SSE] Migration error:', data);
        setIsMigrating(false);
        eventSource.close();
      }
    };

    eventSource.onerror = (error) => {
      console.error('[SSE] Migration connection error:', error);
      console.error('[SSE] Session ID:', migrationSessionId);
      console.error('[SSE] ReadyState:', eventSource.readyState);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [migrationSessionId]);

  // SSE connection for progress updates
  useEffect(() => {
    if (!sessionId) return;

    const eventSource = new EventSource(`/api/sync/files-progress?sessionId=${sessionId}`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setProgress(data);

      if (data.status === 'completed' || data.status === 'error') {
        setIsSyncing(false);
        eventSource.close();
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [sessionId]);

  const handleSync = async (type: 'manual' | 'auto') => {
    setIsSyncing(true);
    setResults(null);
    setProgress(null);

    try {
      if (type === 'manual') {
        const syncRes = await startManualSyncWithProgress(dateFrom, undefined, syncFiles);
        if (syncRes.success && syncRes.sessionId) {
          setSessionId(syncRes.sessionId);
        }
      } else {
        const res = await runIncrementalSync();
        setResults(res);
        await loadLogs();
      }
    } catch (error) {
      setResults({ success: false, error: String(error) });
      setIsSyncing(false);
    }
  };

  const handleUpdatePercentages = async () => {
    if (!confirm("This will calculate and update payment percentages for all invoices based on linked payments. Continue?")) return;
    
    setIsUpdatingPercentages(true);
    setResults(null);
    try {
      const res = await updateInvoicePaymentPercentages();
      setResults(res);
      await loadLogs();
    } catch (error) {
      setResults({ success: false, error: String(error) });
    } finally {
      setIsUpdatingPercentages(false);
    }
  };

  const handlePatchCreators = async () => {
    if (!confirm("This will attempt to fix invoices with NULL 'created_by' by looking up their Linked Agent's User profile. Continue?")) return;

    setIsPatchingCreators(true);
    setResults(null);
    try {
      const res = await patchInvoiceCreators();
      setResults(res);
      await loadLogs();
    } catch (error) {
      setResults({ success: false, error: String(error) });
    } finally {
      setIsPatchingCreators(false);
    }
  };

  const handleDeleteDemo = async () => {
    if (!confirm("This will mark all 'Demo Invoices' (no customer & no payments) and their linked SEDA registrations as 'deleted'. Continue?")) return;

    setIsDeletingDemo(true);
    setResults(null);
    try {
      const res = await deleteDemoInvoices();
      setResults(res);
      await loadLogs();
    } catch (error) {
      setResults({ success: false, error: String(error) });
    } finally {
      setIsDeletingDemo(false);
    }
  };

  const handleFixDates = async () => {
    if (!confirm("This will perform a FULL DATA SYNC (without files) to re-fetch correct Invoice Dates from Bubble. This may take a few minutes. Continue?")) return;

    setIsFixingDates(true);
    setResults(null);
    try {
      const res = await fixMissingInvoiceDates();
      setResults(res);
      await loadLogs();
    } catch (error) {
      setResults({ success: false, error: String(error) });
    } finally {
      setIsFixingDates(false);
    }
  };

  const handleUpdateStatuses = async () => {
    if (!confirm("This will update ALL invoice statuses based on:\n\n• No payment + no SEDA → 'draft'\n• Payment < 50% → 'DEPOSIT'\n• SEDA status = 'APPROVED' → 'SEDA APPROVED'\n• Payment 100% → 'FULLY PAID'\n\nContinue?")) return;

    setIsUpdatingStatuses(true);
    setResults(null);
    try {
      const res = await updateInvoiceStatuses();
      setResults(res);
      await loadLogs();
    } catch (error) {
      setResults({ success: false, error: String(error) });
    } finally {
      setIsUpdatingStatuses(false);
    }
  };

  const handleRestoreLinks = async () => {
    if (!confirm("This will restore missing links between invoices and SEDA registrations.\n\nIt will scan SEDA registrations and update invoice.linked_seda_registration based on the seda.linked_invoice array.\n\nContinue?")) return;

    setIsRestoringLinks(true);
    setResults(null);
    try {
      const res = await restoreInvoiceSedaLinks();
      setResults(res);
      await loadLogs();
    } catch (error) {
      setResults({ success: false, error: String(error) });
    } finally {
      setIsRestoringLinks(false);
    }
  };

  const handlePatchUrls = async () => {
    if (!confirm("This will convert all relative /storage/ URLs to absolute https://admin.atap.solar/storage/ URLs in the database.\n\nThis is needed so other apps on different subdomains can access the files.\n\nContinue?")) return;

    setIsPatchingUrls(true);
    setResults(null);
    try {
      const res = await patchFileUrlsToAbsolute();
      setResults(res);
      await loadLogs();
    } catch (error) {
      setResults({ success: false, error: String(error) });
    } finally {
      setIsPatchingUrls(false);
    }
  };

  const handleFullInvoiceSync = async () => {
    if (!fullSyncDateFrom) {
      alert("Please select a 'From' date for the sync range");
      return;
    }

    const confirmMsg = fullSyncDateTo
      ? `Sync all invoices and their relational data from ${fullSyncDateFrom} to ${fullSyncDateTo}?\n\nThis will:\n• Sync invoices within the date range\n• Sync all related customers, agents, payments, SEDA, and items\n• NOT download files (use File Migration separately)\n\nContinue?`
      : `Sync all invoices and their relational data from ${fullSyncDateFrom} to current date?\n\nThis will:\n• Sync invoices within the date range\n• Sync all related customers, agents, payments, SEDA, and items\n• NOT download files (use File Migration separately)\n\nContinue?`;

    if (!confirm(confirmMsg)) return;

    setIsFullSyncing(true);
    setFullSyncResults(null);
    try {
      const res = await runFullInvoiceSync(fullSyncDateFrom, fullSyncDateTo || undefined);
      setFullSyncResults(res);
      await loadLogs();
    } catch (error) {
      setFullSyncResults({ success: false, error: String(error) });
    } finally {
      setIsFullSyncing(false);
    }
  };

  // Fetch migration statistics
  const fetchMigrationStats = async () => {
    setIsLoadingStats(true);
    try {
      const url = migrationDateFilter
        ? `/api/migration/stats?createdAfter=${migrationDateFilter}`
        : '/api/migration/stats';
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setMigrationStats(data.stats);
      }
    } catch (error) {
      console.error('Failed to fetch migration stats:', error);
    } finally {
      setIsLoadingStats(false);
    }
  };

  // Start full migration
  const handleStartMigration = async () => {
    const fileCount = migrationStats?.totalFiles || 0;
    const dateFilterText = migrationDateFilter ? ` (created after ${migrationDateFilter})` : '';
    if (!confirm(`Start file migration${dateFilterText}?\n\nThis will download ${fileCount} files from Bubble and update all database URLs.\n\nThe process will run in the background and you can track progress below.`)) {
      return;
    }

    console.log('[Migration] Starting migration...', migrationDateFilter ? `with date filter: ${migrationDateFilter}` : 'no date filter');
    setIsMigrating(true);
    setMigrationProgress(null);
    try {
      const res = await fetch('/api/migration/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ createdAfter: migrationDateFilter || undefined })
      });
      const data = await res.json();

      console.log('[Migration] Start response:', data);

      if (data.success) {
        console.log('[Migration] Setting sessionId:', data.sessionId);
        setMigrationSessionId(data.sessionId);
      } else {
        alert('Failed to start migration: ' + data.error);
        setIsMigrating(false);
      }
    } catch (error) {
      console.error('Failed to start migration:', error);
      alert('Failed to start migration');
      setIsMigrating(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in pb-20">
      {/* ... existing header ... */}
      <div className="space-y-2 border-b border-secondary-200 pb-6">
        <h1 className="text-3xl font-bold text-secondary-900 flex items-center gap-3">
          <RefreshCw className={`h-8 w-8 text-primary-600 ${isSyncing ? 'animate-spin' : ''}`} />
          Sync Center
        </h1>
        <p className="text-secondary-500">
          Synchronize data and files from Bubble ERP v1 to Postgres ERP v2.
        </p>
      </div>

      {/* Bubble Decommission: File Migration Section */}
      <div className="card overflow-hidden bg-gradient-to-br from-green-900 via-green-800 to-green-900 text-white shadow-elevation-lg">
        <div className="p-6 border-b border-white/10">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-red-500/20 rounded-xl backdrop-blur-md border border-red-500/30">
                <FolderOpen className="h-6 w-6 text-red-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold">Bubble Decommission: File Migration</h3>
                <p className="text-green-200 text-sm">Migrate ALL files from Bubble to Railway storage before shutdown</p>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {/* Date Filter Input */}
              <div className="flex items-center gap-2">
                <label className="text-[10px] uppercase font-bold text-green-300">From Date:</label>
                <input
                  type="date"
                  className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  value={migrationDateFilter}
                  onChange={(e) => setMigrationDateFilter(e.target.value)}
                  disabled={isMigrating}
                />
                {migrationDateFilter && (
                  <button
                    onClick={() => setMigrationDateFilter('')}
                    className="text-xs text-green-300 hover:text-white underline"
                    disabled={isMigrating}
                  >
                    Clear
                  </button>
                )}
              </div>

              {migrationStats && (
                <div className="px-4 py-2 bg-white/5 rounded-xl border border-white/10 text-center">
                  <p className="text-[10px] uppercase font-bold text-green-300 tracking-wider">Files to Migrate</p>
                  <p className="text-2xl font-bold text-white">{migrationStats.totalFiles}</p>
                </div>
              )}

              {!isMigrating && (
                <button
                  onClick={handleStartMigration}
                  disabled={!migrationStats || migrationStats.totalFiles === 0 || isLoadingStats}
                  className="btn-primary bg-red-600 hover:bg-red-500 border-none flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FileDown className="h-4 w-4" />
                  {isLoadingStats ? 'Scanning...' : 'Start Full Migration'}
                </button>
              )}

              <button
                onClick={fetchMigrationStats}
                disabled={isLoadingStats}
                className="btn-secondary bg-white/5 border-white/10 text-white hover:bg-white/10 flex items-center gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${isLoadingStats ? 'animate-spin' : ''}`} />
                Scan
              </button>
            </div>
          </div>
        </div>

        {/* Migration Progress */}
        {isMigrating && migrationProgress && (
          <div className="p-6 bg-black/20 border-b border-white/5">
            <div className="space-y-4">
              {/* Progress Bar */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-white flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    Overall Progress
                  </p>
                  <p className="text-sm font-bold text-green-400">
                    {migrationProgress.totalFiles > 0
                      ? Math.round((migrationProgress.completedFiles / migrationProgress.totalFiles) * 100)
                      : 0}%
                  </p>
                </div>
                <div className="h-4 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all duration-300"
                    style={{
                      width: `${migrationProgress.totalFiles > 0
                        ? (migrationProgress.completedFiles / migrationProgress.totalFiles) * 100
                        : 0}%`
                    }}
                  />
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-green-400 font-semibold">
                    ✓ {migrationProgress.completedFiles} migrated
                  </span>
                  <span className={migrationProgress.failedFiles > 0 ? 'text-red-400' : 'text-green-300'}>
                    ✗ {migrationProgress.failedFiles} failed
                  </span>
                  <span className="text-green-300">
                    → {migrationProgress.totalFiles - migrationProgress.completedFiles - migrationProgress.failedFiles} remaining
                  </span>
                </div>
              </div>

              {/* Current File & Speed */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-white/5 rounded-xl space-y-2">
                  <p className="text-[10px] uppercase font-bold text-green-300 tracking-wider flex items-center gap-2">
                    <File className="h-3 w-3" />
                    Currently Downloading
                  </p>
                  {migrationProgress.currentFile ? (
                    <>
                      <p className="text-sm font-medium text-white truncate">{migrationProgress.currentFile}</p>
                    </>
                  ) : (
                    <p className="text-sm text-green-200">Initializing...</p>
                  )}
                </div>

                <div className="p-4 bg-white/5 rounded-xl space-y-2">
                  <p className="text-[10px] uppercase font-bold text-green-300 tracking-wider flex items-center gap-2">
                    <Zap className="h-3 w-3" />
                    Download Speed
                  </p>
                  {migrationProgress.downloadSpeed ? (
                    <p className="text-lg font-bold text-green-400">{migrationProgress.downloadSpeed}</p>
                  ) : (
                    <p className="text-sm text-green-200">Calculating...</p>
                  )}
                </div>
              </div>

              {/* Recent Activity */}
              {migrationProgress.details && migrationProgress.details.length > 0 && (
                <div className="pt-4 border-t border-white/5">
                  <p className="text-[10px] uppercase font-bold text-green-300 tracking-wider mb-3">Recent Activity</p>
                  <div className="bg-black/30 rounded-lg p-3 h-24 overflow-y-auto space-y-1">
                    {migrationProgress.details.slice(-8).map((detail: string, idx: number) => (
                      <p key={idx} className="text-xs font-mono text-green-100 truncate">
                        {detail}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Breakdown by Table */}
        {migrationStats && !isMigrating && (
          <div className="p-6">
            <p className="text-[10px] uppercase font-bold text-green-300 tracking-wider mb-4 flex items-center gap-2">
              <Database className="h-3 w-3" />
              Files by Table (Click "Scan" to refresh)
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {Object.entries(migrationStats.byTable).map(([table, count]: [string, any]) => (
                <div
                  key={table}
                  className="p-3 bg-white/5 rounded-lg border border-white/5 hover:border-green-500/30 transition-all"
                >
                  <p className="text-[10px] uppercase font-bold text-green-300 truncate">{table}</p>
                  <p className="text-xl font-bold text-white">{count}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Full Invoice Sync Section */}
      <div className="card overflow-hidden bg-gradient-to-br from-blue-900 via-blue-800 to-blue-900 text-white shadow-elevation-lg">
        <div className="p-6 border-b border-white/10">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-500/20 rounded-xl backdrop-blur-md border border-blue-500/30">
                <Database className="h-6 w-6 text-blue-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold">Full Invoice Sync with Date Range</h3>
                <p className="text-blue-200 text-sm">Sync invoices + all relational data (customers, agents, payments, SEDA, items)</p>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {/* Date From Input */}
              <div className="flex items-center gap-2">
                <label className="text-[10px] uppercase font-bold text-blue-300">From:</label>
                <input
                  type="date"
                  className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={fullSyncDateFrom}
                  onChange={(e) => setFullSyncDateFrom(e.target.value)}
                  disabled={isFullSyncing}
                />
              </div>

              {/* Date To Input */}
              <div className="flex items-center gap-2">
                <label className="text-[10px] uppercase font-bold text-blue-300">To:</label>
                <input
                  type="date"
                  className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={fullSyncDateTo}
                  onChange={(e) => setFullSyncDateTo(e.target.value)}
                  disabled={isFullSyncing}
                  placeholder="Current"
                />
                {fullSyncDateTo && (
                  <button
                    onClick={() => setFullSyncDateTo('')}
                    className="text-xs text-blue-300 hover:text-white underline"
                    disabled={isFullSyncing}
                  >
                    Clear
                  </button>
                )}
              </div>

              {!isFullSyncing && (
                <button
                  onClick={handleFullInvoiceSync}
                  disabled={!fullSyncDateFrom}
                  className="btn-primary bg-blue-600 hover:bg-blue-500 border-none flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCw className="h-4 w-4" />
                  Start Full Invoice Sync
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Full Sync Results */}
        {fullSyncResults && (
          <div className="p-6 bg-black/20 border-b border-white/5">
            <div className={`flex items-center gap-3 mb-4 ${fullSyncResults.success ? 'text-green-400' : 'text-red-400'}`}>
              {fullSyncResults.success ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
              <p className="font-bold">{fullSyncResults.success ? 'Sync Completed Successfully' : 'Sync Failed'}</p>
            </div>

            {fullSyncResults.success && (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
                <div className="text-center p-3 bg-white/5 rounded-lg">
                  <p className="text-2xl font-bold text-white">{fullSyncResults.results?.syncedInvoices}</p>
                  <p className="text-[10px] uppercase font-bold text-blue-300">Invoices</p>
                </div>
                <div className="text-center p-3 bg-white/5 rounded-lg">
                  <p className="text-2xl font-bold text-white">{fullSyncResults.results?.syncedCustomers}</p>
                  <p className="text-[10px] uppercase font-bold text-blue-300">Customers</p>
                </div>
                <div className="text-center p-3 bg-white/5 rounded-lg">
                  <p className="text-2xl font-bold text-white">{fullSyncResults.results?.syncedAgents}</p>
                  <p className="text-[10px] uppercase font-bold text-blue-300">Agents</p>
                </div>
                <div className="text-center p-3 bg-white/5 rounded-lg">
                  <p className="text-2xl font-bold text-white">{fullSyncResults.results?.syncedUsers}</p>
                  <p className="text-[10px] uppercase font-bold text-blue-300">Users</p>
                </div>
                <div className="text-center p-3 bg-white/5 rounded-lg">
                  <p className="text-2xl font-bold text-white">{fullSyncResults.results?.syncedPayments + fullSyncResults.results?.syncedSubmittedPayments}</p>
                  <p className="text-[10px] uppercase font-bold text-blue-300">Payments</p>
                </div>
                <div className="text-center p-3 bg-white/5 rounded-lg">
                  <p className="text-2xl font-bold text-white">{fullSyncResults.results?.syncedItems}</p>
                  <p className="text-[10px] uppercase font-bold text-blue-300">Items</p>
                </div>
                <div className="text-center p-3 bg-white/5 rounded-lg">
                  <p className="text-2xl font-bold text-white">{fullSyncResults.results?.syncedSedas}</p>
                  <p className="text-[10px] uppercase font-bold text-blue-300">SEDA</p>
                </div>
                <div className="text-center p-3 bg-white/5 rounded-lg">
                  <p className="text-2xl font-bold text-white">{fullSyncResults.results?.syncedTemplates}</p>
                  <p className="text-[10px] uppercase font-bold text-blue-300">Templates</p>
                </div>
              </div>
            )}

            {!fullSyncResults.success && (
              <div className="p-3 bg-red-500/20 rounded-lg text-red-300 text-sm font-mono">
                {fullSyncResults.error}
              </div>
            )}
          </div>
        )}

        {/* Full Sync Progress */}
        {isFullSyncing && (
          <div className="p-6 bg-black/20 border-b border-white/5">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
              <p className="font-bold text-white">Syncing invoices and all related data...</p>
            </div>
            <p className="text-sm text-blue-200 mt-2">This may take a few minutes. Please check the logs below for progress.</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        {/* ... (Manual sync side) ... */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-sm font-bold text-secondary-400 uppercase tracking-widest">
            <Calendar className="h-4 w-4" />
            Manual Range Sync
          </div>
          
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-secondary-700">Sync Data Modified Since:</label>
              <input 
                type="date" 
                className="input"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
              <p className="text-[10px] text-secondary-400 italic">Leave empty to sync all historical data (Caution: slow)</p>
            </div>

            <label className="flex items-center gap-3 p-4 border border-secondary-200 rounded-xl cursor-pointer hover:bg-secondary-50 transition-colors">
              <input 
                type="checkbox" 
                className="h-5 w-5 rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
                checked={syncFiles}
                onChange={(e) => setSyncFiles(e.target.checked)}
              />
              <div>
                <p className="text-sm font-bold text-secondary-900">Auto-Sync Files</p>
                <p className="text-xs text-secondary-500">Download missing signatures/images after data sync</p>
              </div>
            </label>

             <button 
               onClick={() => handleSync('manual')}
               disabled={isSyncing}
               className="btn-primary w-full py-4 flex items-center justify-center gap-3 shadow-elevation-md"
             >
               {isSyncing ? <Loader2 className="h-5 w-5 animate-spin" /> : <RefreshCw className="h-5 w-5" />}
               Execute Manual Sync
             </button>

             <button 
               onClick={handleUpdatePercentages}
               disabled={isUpdatingPercentages}
               className="w-full py-3 rounded-xl border border-secondary-200 bg-secondary-50 hover:bg-secondary-100 text-secondary-700 font-bold transition-all flex items-center justify-center gap-2"
             >
               {isUpdatingPercentages ? <Loader2 className="h-5 w-5 animate-spin" /> : <Percent className="h-5 w-5" />}
               Update Payment Percentages
             </button>

             <button 
               onClick={handlePatchCreators}
               disabled={isPatchingCreators}
               className="w-full py-3 rounded-xl border border-secondary-200 bg-secondary-50 hover:bg-secondary-100 text-secondary-700 font-bold transition-all flex items-center justify-center gap-2"
             >
               {isPatchingCreators ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
               Patch Creator IDs (Fix NULLs)
             </button>

             <button 
               onClick={handleFixDates}
               disabled={isFixingDates}
               className="w-full py-3 rounded-xl border border-secondary-200 bg-secondary-50 hover:bg-secondary-100 text-secondary-700 font-bold transition-all flex items-center justify-center gap-2"
             >
               {isFixingDates ? <Loader2 className="h-5 w-5 animate-spin" /> : <CalendarDays className="h-5 w-5" />}
               Fix Missing Dates (Backfill)
             </button>

             <button
               onClick={handleDeleteDemo}
               disabled={isDeletingDemo}
               className="w-full py-3 rounded-xl border border-secondary-200 bg-secondary-50 hover:bg-secondary-100 text-secondary-700 font-bold transition-all flex items-center justify-center gap-2"
             >
               {isDeletingDemo ? <Loader2 className="h-5 w-5 animate-spin" /> : <Trash2 className="h-5 w-5" />}
               Hide Demo Invoices (Mark Deleted)
             </button>

             <button
               onClick={handleUpdateStatuses}
               disabled={isUpdatingStatuses}
               className="w-full py-3 rounded-xl border border-primary-200 bg-primary-50 hover:bg-primary-100 text-primary-700 font-bold transition-all flex items-center justify-center gap-2"
             >
               {isUpdatingStatuses ? <Loader2 className="h-5 w-5 animate-spin" /> : <Tag className="h-5 w-5" />}
               Update Invoice Statuses
             </button>

             <button
               onClick={handleRestoreLinks}
               disabled={isRestoringLinks}
               className="w-full py-3 rounded-xl border border-green-200 bg-green-50 hover:bg-green-100 text-green-700 font-bold transition-all flex items-center justify-center gap-2"
             >
               {isRestoringLinks ? <Loader2 className="h-5 w-5 animate-spin" /> : <Link className="h-5 w-5" />}
               Restore Invoice-SEDA Links
             </button>

             <button
               onClick={handlePatchUrls}
               disabled={isPatchingUrls}
               className="w-full py-3 rounded-xl border border-orange-200 bg-orange-50 hover:bg-orange-100 text-orange-700 font-bold transition-all flex items-center justify-center gap-2"
             >
               {isPatchingUrls ? <Loader2 className="h-5 w-5 animate-spin" /> : <Globe className="h-5 w-5" />}
               Patch File URLs to Absolute
             </button>
          </div>
        </div>

        {/* ... (Maintenance side) ... */}
        <div className="space-y-6 border-l border-secondary-100 pl-0 md:pl-12">
          <div className="flex items-center gap-2 text-sm font-bold text-secondary-400 uppercase tracking-widest">
            <Clock className="h-4 w-4" />
            Maintenance & Automation
          </div>

          <div className="space-y-4 pt-2">
            <div className="p-6 rounded-2xl bg-secondary-900 text-white space-y-4">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <Database className="h-5 w-5 text-primary-400" />
                Incremental Sync
              </h3>
              <p className="text-sm text-secondary-400">
                Quickly pull changes from the last 24 hours. Ideal for daily maintenance.
              </p>
              <button 
                onClick={() => handleSync('auto')}
                disabled={isSyncing}
                className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-white font-bold transition-all flex items-center justify-center gap-2"
              >
                Sync Last 24 Hours
              </button>
            </div>

            <div className="p-6 rounded-2xl border border-secondary-200 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary-50 rounded-lg">
                  <RefreshCw className="h-5 w-5 text-primary-600" />
                </div>
                <h3 className="font-bold text-secondary-900">External Trigger (CRON)</h3>
              </div>
              <code className="block p-3 bg-secondary-50 rounded-lg text-[10px] text-secondary-600 break-all border border-secondary-200">
                GET /api/sync/cron?secret=sync_admin_2026
              </code>
              <p className="text-[10px] text-secondary-500">
                Trigger this URL from your Railway Cron Job or a GitHub Action to keep the database fresh automatically.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* File Sync Progress Section */}
      {progress && progress.category && (
        <div className="mt-8 border-t-2 pt-8 border-blue-100 animate-slide-up">
          <div className="flex items-center gap-3 mb-6">
            <Download className="h-6 w-6 text-blue-500 animate-pulse" />
            <h2 className="text-xl font-bold text-secondary-900">
              File Sync Progress
            </h2>
          </div>

          <div className="bg-white rounded-2xl border border-secondary-200 p-6 space-y-6">
            {/* Overall Progress */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-secondary-700">
                  {progress.category ? progress.category.charAt(0).toUpperCase() + progress.category.slice(1).replace('_', ' ') : 'Processing...'}
                </span>
                <span className="font-bold text-blue-600">
                  {progress.completedFiles} / {progress.totalFiles} files
                </span>
              </div>

              <div className="h-3 bg-secondary-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-300 ease-out"
                  style={{
                    width: `${progress.totalFiles > 0 ? (progress.completedFiles / progress.totalFiles) * 100 : 0}%`
                  }}
                />
              </div>
            </div>

            {/* Current File Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-secondary-50 rounded-xl space-y-1">
                <p className="text-[10px] uppercase font-bold text-secondary-400 mb-1">Current File</p>
                <div className="flex items-center gap-2">
                  <File className="h-4 w-4 text-blue-500" />
                  <p className="text-sm font-medium text-secondary-900 truncate">
                    {progress.currentFile || 'Waiting...'}
                  </p>
                </div>
              </div>

              <div className="p-4 bg-secondary-50 rounded-xl space-y-1">
                <p className="text-[10px] uppercase font-bold text-secondary-400 mb-1">Download Speed</p>
                <div className="flex items-center gap-2">
                  <Download className="h-4 w-4 text-green-500" />
                  <p className="text-sm font-bold text-green-600">
                    {progress.downloadSpeed || 'Calculating...'}
                  </p>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-secondary-100">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{progress.completedFiles}</p>
                <p className="text-xs text-secondary-500 font-semibold">Completed</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-red-600">{progress.failedFiles}</p>
                <p className="text-xs text-secondary-500 font-semibold">Failed</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-secondary-900">
                  {progress.totalFiles - progress.completedFiles - progress.failedFiles}
                </p>
                <p className="text-xs text-secondary-500 font-semibold">Remaining</p>
              </div>
            </div>

            {/* Categories Progress */}
            {progress.categoriesTotal && progress.categoriesTotal.length > 0 && (
              <div className="pt-4 border-t border-secondary-100">
                <p className="text-xs font-bold text-secondary-400 uppercase mb-3">Categories</p>
                <div className="flex flex-wrap gap-2">
                  {progress.categoriesTotal.map((cat: string) => {
                    const isCompleted = progress.categoriesCompleted?.includes(cat);
                    const isCurrent = progress.category === cat;
                    return (
                      <span
                        key={cat}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                          isCompleted
                            ? 'bg-green-100 text-green-700'
                            : isCurrent
                            ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-500'
                            : 'bg-secondary-100 text-secondary-500'
                        }`}
                      >
                        {isCompleted ? '✓' : isCurrent ? '↓' : '○'} {cat.replace('_', ' ')}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recent Activity */}
            {progress.details && progress.details.length > 0 && (
              <div className="pt-4 border-t border-secondary-100">
                <p className="text-xs font-bold text-secondary-400 uppercase mb-3">Recent Activity</p>
                <div className="bg-secondary-950 rounded-lg p-4 h-32 overflow-y-auto space-y-1.5">
                  {progress.details.slice(-10).reverse().map((detail: string, idx: number) => (
                    <p key={idx} className="text-xs font-mono text-secondary-300 flex items-center gap-2">
                      {detail.startsWith('✓') ? (
                        <CheckCircle2 className="h-3 w-3 text-green-400 flex-shrink-0" />
                      ) : (
                        <XCircle className="h-3 w-3 text-red-400 flex-shrink-0" />
                      )}
                      <span className={detail.startsWith('✓') ? 'text-green-400' : 'text-red-400'}>{detail}</span>
                    </p>
                  ))}
                </div>
              </div>
            )}

            {progress.status === 'completed' && (
              <div className="flex items-center justify-center gap-2 p-4 bg-green-50 rounded-xl border border-green-200">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <p className="font-bold text-green-700">File sync completed successfully!</p>
              </div>
            )}

            {progress.status === 'error' && (
              <div className="flex items-center justify-center gap-2 p-4 bg-red-50 rounded-xl border border-red-200">
                <AlertCircle className="h-5 w-5 text-red-600" />
                <p className="font-bold text-red-700">File sync encountered an error</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Results Section */}
      {results && (
        <div className={`mt-8 border-t-2 pt-8 animate-slide-up ${results.success ? 'border-green-100' : 'border-red-100'}`}>
          <div className="flex items-center gap-3 mb-6">
            {results.success ? (
              <CheckCircle2 className="h-6 w-6 text-green-500" />
            ) : (
              <AlertCircle className="h-6 w-6 text-red-500" />
            )}
            <h2 className="text-xl font-bold text-secondary-900">
              {results.success ? 'Sync Completed Successfully' : 'Sync Process Failed'}
            </h2>
          </div>

          {results.success && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="p-4 border-b border-secondary-100">
                <p className="text-[10px] uppercase font-bold text-secondary-400 mb-1">Invoices</p>
                <p className="text-2xl font-bold text-secondary-900">{results.results?.syncedInvoices}</p>
              </div>
              <div className="p-4 border-b border-secondary-100">
                <p className="text-[10px] uppercase font-bold text-secondary-400 mb-1">Customers</p>
                <p className="text-2xl font-bold text-secondary-900">{results.results?.syncedCustomers}</p>
              </div>
              <div className="p-4 border-b border-secondary-100">
                <p className="text-[10px] uppercase font-bold text-secondary-400 mb-1">Agents/Users</p>
                <p className="text-2xl font-bold text-secondary-900">
                  {(results.results?.syncedAgents || 0) + (results.results?.syncedUsers || 0)}
                </p>
              </div>
              <div className="p-4 border-b border-secondary-100">
                <p className="text-[10px] uppercase font-bold text-secondary-400 mb-1">SEDA</p>
                <p className="text-2xl font-bold text-secondary-900">{results.results?.syncedSedas}</p>
              </div>
              <div className="p-4 border-b border-secondary-100">
                <p className="text-[10px] uppercase font-bold text-secondary-400 mb-1">Payments</p>
                <p className="text-2xl font-bold text-secondary-900">
                  {(results.results?.syncedPayments || 0) + (results.results?.syncedSubmittedPayments || 0)}
                </p>
              </div>
              <div className="p-4 border-b border-secondary-100">
                <p className="text-[10px] uppercase font-bold text-secondary-400 mb-1">Items</p>
                <p className="text-2xl font-bold text-secondary-900">{results.results?.syncedItems}</p>
              </div>
              <div className="p-4 border-b border-secondary-100">
                <p className="text-[10px] uppercase font-bold text-secondary-400 mb-1">Templates</p>
                <p className="text-2xl font-bold text-secondary-900">{results.results?.syncedTemplates}</p>
              </div>
            </div>
          )}

          {!results.success && (
            <div className="p-4 bg-red-50 rounded-xl border border-red-100 text-red-700 text-sm font-mono">
              {results.error}
            </div>
          )}
        </div>
      )}

      {/* Logs Section */}
      <div className="mt-12 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold text-secondary-400 uppercase tracking-widest">
            <FileText className="h-4 w-4" />
            Live Sync Logs
          </div>
          <button 
            onClick={loadLogs}
            className="text-[10px] font-bold text-primary-600 hover:text-primary-700 uppercase tracking-widest"
          >
            Refresh Logs
          </button>
        </div>
        <div className="bg-secondary-950 rounded-2xl p-6 font-mono text-[11px] text-secondary-300 h-80 overflow-y-auto border border-secondary-800 shadow-elevation-lg">
          {logs.map((log, i) => {
            const isError = log.includes('[ERROR]');
            const isCron = log.includes('[CRON]');
            return (
              <p key={i} className={`mb-1.5 leading-relaxed ${isError ? 'text-red-400' : isCron ? 'text-primary-400' : 'text-secondary-400'}`}>
                <span className="opacity-30 mr-2">{i+1}</span>
                {log}
              </p>
            );
          })}
          {logs.length === 0 && <p className="opacity-50">Waiting for activity...</p>}
        </div>
      </div>
    </div>
  );
}
