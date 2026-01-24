/**
 * ============================================================================
 * SYNC CENTER PAGE
 * ============================================================================
 *
 * Main synchronization interface for Bubble ERP to PostgreSQL ERP migration.
 * Now using extracted components for better maintainability.
 *
 * File: src/app/sync/page.tsx
 */

"use client";

import { useState, useEffect, useRef } from "react";
import { RefreshCw } from "lucide-react";
import {
  QuickSyncForm,
  FullInvoiceSyncForm,
  SedaSyncForm,
  IdListSyncForm,
  IntegritySyncForm,
  InvoiceItemSyncForm,
  FileMigrationForm,
  PaymentSyncForm,
  JsonUploadSyncForm,
} from "./components/forms";
import {
  DataPatchesPanel,
  MaintenancePanel,
} from "./components/panels";
import { LogViewer } from "./components/logs";
import { fetchSyncLogs, clearSyncLogs } from "./actions";

export default function SyncPage() {
  // ============================================================================
  // STATE
  // ============================================================================

  // Quick Sync state
  const [dateFrom, setDateFrom] = useState("");
  const [syncFiles, setSyncFiles] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResults, setSyncResults] = useState<any>(null);

  // Full Invoice Sync state
  const [fullSyncDateFrom, setFullSyncDateFrom] = useState("");
  const [fullSyncDateTo, setFullSyncDateTo] = useState("");
  const [isFullSyncing, setIsFullSyncing] = useState(false);
  const [fullSyncResults, setFullSyncResults] = useState<any>(null);

  // SEDA-Only Sync state
  const [sedaSyncDateFrom, setSedaSyncDateFrom] = useState("");
  const [sedaSyncDateTo, setSedaSyncDateTo] = useState("");
  const [isSedaSyncing, setIsSedaSyncing] = useState(false);
  const [sedaSyncResults, setSedaSyncResults] = useState<any>(null);

  // ID List Sync state
  const [isIdListSyncing, setIsIdListSyncing] = useState(false);
  const [idListSyncResults, setIdListSyncResults] = useState<any>(null);

  // JSON Upload Sync state
  const [isJsonUploadSyncing, setIsJsonUploadSyncing] = useState(false);
  const [jsonUploadResults, setJsonUploadResults] = useState<any>(null);

  // Integrity Sync state
  const [isIntegritySyncing, setIsIntegritySyncing] = useState(false);
  const [integritySyncResults, setIntegritySyncResults] = useState<any>(null);
  const [integrityBatchDateFrom, setIntegrityBatchDateFrom] = useState("");
  const [integrityBatchDateTo, setIntegrityBatchDateTo] = useState("");
  const [isIntegrityBatchSyncing, setIsIntegrityBatchSyncing] = useState(false);
  const [integrityBatchResults, setIntegrityBatchResults] = useState<any>(null);

  // Invoice Item Sync state
  const [itemSyncDateFrom, setItemSyncDateFrom] = useState("");
  const [isItemSyncing, setIsItemSyncing] = useState(false);
  const [itemSyncResults, setItemSyncResults] = useState<any>(null);

  // Patches & Maintenance state
  const [isUpdatingPercentages, setIsUpdatingPercentages] = useState(false);
  const [isPatchingCreators, setIsPatchingCreators] = useState(false);
  const [isUpdatingStatuses, setIsUpdatingStatuses] = useState(false);
  const [isDeletingDemo, setIsDeletingDemo] = useState(false);
  const [isFixingDates, setIsFixingDates] = useState(false);
  const [isRestoringLinks, setIsRestoringLinks] = useState(false);
  const [isPatchingUrls, setIsPatchingUrls] = useState(false);
  const [isPatchingChinese, setIsPatchingChinese] = useState(false);
  const [patchResults, setPatchResults] = useState<any>(null);

  // Logs state
  const [logs, setLogs] = useState<string[]>([]);
  const [isClearingLogs, setIsClearingLogs] = useState(false);

  // File Migration state
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationStats, setMigrationStats] = useState<any>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [migrationDateFilter, setMigrationDateFilter] = useState<string>("");
  const [migrationProgress, setMigrationProgress] = useState<any>(null);
  const [migrationSessionId, setMigrationSessionId] = useState<string | null>(null);
  const migrationEventSourceRef = useRef<EventSource | null>(null);

  // Progress tracking state (managed inline for now)
  const [progress, setProgress] = useState<any>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // ============================================================================
  // EFFECTS
  // ============================================================================

  useEffect(() => {
    loadLogs();
    fetchMigrationStats();
    const interval = setInterval(loadLogs, 10000);
    return () => clearInterval(interval);
  }, []);

  // Migration SSE connection
  useEffect(() => {
    if (!migrationSessionId) return;

    const url = `/api/migration/progress/stream?sessionId=${migrationSessionId}`;
    const eventSource = new EventSource(url);
    migrationEventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'initial' || data.type === 'progress') {
        setMigrationProgress(data.progress);
      } else if (data.type === 'completed') {
        setMigrationProgress(data.progress);
        setIsMigrating(false);
        eventSource.close();
        fetchMigrationStats();
      } else if (data.type === 'error') {
        setIsMigrating(false);
        eventSource.close();
      }
    };

    eventSource.onerror = (error) => {
      console.error('[SSE] Migration connection error:', error);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [migrationSessionId]);

  // Sync SSE connection for file progress
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

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const loadLogs = async () => {
    const hasAuthToken = document.cookie.includes('auth_token=');
    if (!hasAuthToken) return;

    try {
      const latestLogs = await fetchSyncLogs();
      setLogs(latestLogs);
    } catch (error) {
      const errorMsg = String(error);
      if (!errorMsg.includes('fetch') && !errorMsg.includes('Failed to fetch')) {
        setLogs([`Error loading logs: ${errorMsg}`]);
      }
    }
  };

  const handleClearLogs = async () => {
    if (!confirm("This will delete all sync logs. This action cannot be undone. Continue?")) return;

    setIsClearingLogs(true);
    try {
      const res = await clearSyncLogs();
      if (res.success) {
        setLogs(['Logs cleared.']);
      } else {
        setLogs([`Failed to clear logs: ${res.error}`]);
      }
    } catch (error) {
      setLogs([`Error: ${String(error)}`]);
    } finally {
      setIsClearingLogs(false);
    }
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    setSyncResults(null);

    try {
      const res = await runManualSync(dateFrom, undefined, syncFiles);
      setSyncResults(res);
      await loadLogs();
    } catch (error) {
      setSyncResults({ success: false, error: String(error) });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleIncrementalSync = async () => {
    setIsSyncing(true);
    setSyncResults(null);

    try {
      const res = await runIncrementalSync();
      setSyncResults(res);
      await loadLogs();
    } catch (error) {
      setSyncResults({ success: false, error: String(error) });
    } finally {
      setIsSyncing(false);
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

  const handleSedaOnlySync = async () => {
    if (!sedaSyncDateFrom) {
      alert("Please select a 'From' date for the sync range");
      return;
    }

    const confirmMsg = sedaSyncDateTo
      ? `Sync SEDA registrations from ${sedaSyncDateFrom} to ${sedaSyncDateTo}?\n\nThis will:\n• Sync SEDA registrations modified in date range\n• Overwrite local data if Bubble is newer\n• Include all fields (status, documents, images)\n\nContinue?`
      : `Sync SEDA registrations from ${sedaSyncDateFrom} to current date?\n\nThis will:\n• Sync SEDA registrations modified in date range\n• Overwrite local data if Bubble is newer\n• Include all fields (status, documents, images)\n\nContinue?`;

    if (!confirm(confirmMsg)) return;

    setIsSedaSyncing(true);
    setSedaSyncResults(null);

    try {
      const res = await runSedaOnlySync(sedaSyncDateFrom, sedaSyncDateTo || undefined);
      setSedaSyncResults(res);
      await loadLogs();
    } catch (error) {
      setSedaSyncResults({ success: false, error: String(error) });
    } finally {
      setIsSedaSyncing(false);
    }
  };

  const handleIdListSync = async (csvData: string) => {
    if (!csvData.trim()) {
      alert("Please paste CSV data");
      return;
    }

    const lines = csvData.trim().split('\n');
    const hasHeader = lines[0].toLowerCase().includes('type') || lines[0].toLowerCase().includes('id');
    const recordCount = hasHeader ? lines.length - 1 : lines.length;

    if (!confirm(`Sync ${recordCount} records from CSV?\n\nThis will:\n• Check local data first\n• Only fetch from Bubble if newer\n• Skip records that are already up-to-date\n• Sync all related data (customers, agents, payments, items)\n\nContinue?`)) {
      return;
    }

    setIsIdListSyncing(true);
    setIdListSyncResults(null);

    try {
      const res = await runIdListSync(csvData);
      setIdListSyncResults(res);
      await loadLogs();
    } catch (error) {
      setIdListSyncResults({ success: false, error: String(error) });
    } finally {
      setIsIdListSyncing(false);
    }
  };

  const handleJsonUploadSync = async (entityType: 'invoice' | 'payment' | 'seda_registration' | 'invoice_item', jsonData: any[]) => {
    if (!jsonData || jsonData.length === 0) {
      alert("No JSON data to sync");
      return;
    }

    if (!confirm(`Sync ${jsonData.length} ${entityType.replace('_', ' ')} records from JSON?\n\nThis will:\n• Validate the first entry first\n• If validation fails, entire sync is rejected\n• If validation passes, sync all records\n• Upsert records (update if exists, insert if new)\n\nContinue?`)) {
      return;
    }

    setIsJsonUploadSyncing(true);
    setJsonUploadResults(null);

    try {
      // Direct import from json-upload-sync action
      const { uploadAndSyncJson } = await import("./actions/json-upload-sync");
      const res = await uploadAndSyncJson(entityType, jsonData);
      setJsonUploadResults(res);
      await loadLogs();
    } catch (error) {
      setJsonUploadResults({ success: false, error: String(error) });
    } finally {
      setIsJsonUploadSyncing(false);
    }
  };

  const handleIntegritySingleSync = async (invoiceId: string) => {
    if (!invoiceId.trim()) {
      alert("Please enter an Invoice Bubble ID");
      return;
    }

    if (!confirm(`Run INTEGRITY SYNC for invoice ${invoiceId}?\n\nThis will:\n• Sync invoice with ALL dependencies (agent, customer, user, payments, items, SEDA)\n• Use complete field mappings (zero data loss)\n• Respect dependency order\n• Provide detailed progress tracking\n\nThis is the NEW integrity-first sync method.\n\nContinue?`)) {
      return;
    }

    setIsIntegritySyncing(true);
    setIntegritySyncResults(null);

    try {
      const res = await runIntegritySync(invoiceId.trim(), { force: true });
      setIntegritySyncResults(res);
      await loadLogs();
    } catch (error) {
      setIntegritySyncResults({ success: false, error: String(error) });
    } finally {
      setIsIntegritySyncing(false);
    }
  };

  const handleIntegrityBatchSync = async () => {
    if (!integrityBatchDateFrom) {
      alert("Please select a 'From' date for the sync range");
      return;
    }

    const confirmMsg = integrityBatchDateTo
      ? `Run INTEGRITY BATCH SYNC from ${integrityBatchDateFrom} to ${integrityBatchDateTo}?\n\nThis will:\n• Sync ALL invoices in date range with complete dependencies\n• Use NEW integrity-first method (zero data loss)\n• Skip up-to-date invoices automatically\n• Provide detailed progress tracking\n\nContinue?`
      : `Run INTEGRITY BATCH SYNC from ${integrityBatchDateFrom} to current date?\n\nThis will:\n• Sync ALL invoices in date range with complete dependencies\n• Use NEW integrity-first method (zero data loss)\n• Skip up-to-date invoices automatically\n• Provide detailed progress tracking\n\nContinue?`;

    if (!confirm(confirmMsg)) return;

    setIsIntegrityBatchSyncing(true);
    setIntegrityBatchResults(null);

    try {
      const res = await runIntegrityBatchSync(integrityBatchDateFrom, integrityBatchDateTo || undefined);
      setIntegrityBatchResults(res);
      await loadLogs();
    } catch (error) {
      setIntegrityBatchResults({ success: false, error: String(error) });
    } finally {
      setIsIntegrityBatchSyncing(false);
    }
  };

  const handleInvoiceItemSync = async () => {
    const confirmMsg = itemSyncDateFrom
      ? `Link invoice items from invoice_item table to invoices (created ${itemSyncDateFrom} onwards)?\n\nThis will:\n• Populate invoice.linked_invoice_item with FK bubble_ids\n• From existing invoice_item records in Postgres\n• FAST - no Bubble API calls!\n\nContinue?`
      : `Link ALL invoice items from invoice_item table to ALL invoices?\n\nThis will:\n• Populate invoice.linked_invoice_item with FK bubble_ids\n• From existing invoice_item records in Postgres\n• FAST - no Bubble API calls!\n\nContinue?`;

    if (!confirm(confirmMsg)) return;

    setIsItemSyncing(true);
    setItemSyncResults(null);

    try {
      const res = await syncInvoiceItemLinks(itemSyncDateFrom || undefined);
      setItemSyncResults(res);
      await loadLogs();
    } catch (error) {
      setItemSyncResults({ success: false, error: String(error) });
    } finally {
      setIsItemSyncing(false);
    }
  };

  const handleUpdatePercentages = async () => {
    if (!confirm("This will calculate and update payment percentages for all invoices based on linked payments. Continue?")) return;

    setIsUpdatingPercentages(true);
    setPatchResults(null);

    try {
      const res = await updateInvoicePaymentPercentages();
      setPatchResults(res);
      await loadLogs();
    } catch (error) {
      setPatchResults({ success: false, error: String(error) });
    } finally {
      setIsUpdatingPercentages(false);
    }
  };

  const handlePatchCreators = async () => {
    if (!confirm("This will attempt to fix invoices with NULL 'created_by' by looking up their Linked Agent's User profile. Continue?")) return;

    setIsPatchingCreators(true);
    setPatchResults(null);

    try {
      const res = await patchInvoiceCreators();
      setPatchResults(res);
      await loadLogs();
    } catch (error) {
      setPatchResults({ success: false, error: String(error) });
    } finally {
      setIsPatchingCreators(false);
    }
  };

  const handleUpdateStatuses = async () => {
    if (!confirm("This will update ALL invoice statuses based on:\n\n• No payment + no SEDA → 'draft'\n• Payment < 50% → 'DEPOSIT'\n• SEDA status = 'APPROVED' → 'SEDA APPROVED'\n• Payment 100% → 'FULLY PAID'\n\nContinue?")) return;

    setIsUpdatingStatuses(true);
    setPatchResults(null);

    try {
      const res = await updateInvoiceStatuses();
      setPatchResults(res);
      await loadLogs();
    } catch (error) {
      setPatchResults({ success: false, error: String(error) });
    } finally {
      setIsUpdatingStatuses(false);
    }
  };

  const handleDeleteDemo = async () => {
    if (!confirm("This will mark all 'Demo Invoices' (no customer & no payments) and their linked SEDA registrations as 'deleted'. Continue?")) return;

    setIsDeletingDemo(true);
    setPatchResults(null);

    try {
      const res = await deleteDemoInvoices();
      setPatchResults(res);
      await loadLogs();
    } catch (error) {
      setPatchResults({ success: false, error: String(error) });
    } finally {
      setIsDeletingDemo(false);
    }
  };

  const handleFixDates = async () => {
    if (!confirm("This will perform a FULL DATA SYNC (without files) to re-fetch correct Invoice Dates from Bubble. This may take a few minutes. Continue?")) return;

    setIsFixingDates(true);
    setPatchResults(null);

    try {
      const res = await fixMissingInvoiceDates();
      setPatchResults(res);
      await loadLogs();
    } catch (error) {
      setPatchResults({ success: false, error: String(error) });
    } finally {
      setIsFixingDates(false);
    }
  };

  const handleRestoreLinks = async () => {
    if (!confirm("This will restore missing links between invoices and SEDA registrations.\n\nIt will scan SEDA registrations and update invoice.linked_seda_registration based on the seda.linked_invoice array.\n\nContinue?")) return;

    setIsRestoringLinks(true);
    setPatchResults(null);

    try {
      const res = await restoreInvoiceSedaLinks();
      setPatchResults(res);
      await loadLogs();
    } catch (error) {
      setPatchResults({ success: false, error: String(error) });
    } finally {
      setIsRestoringLinks(false);
    }
  };

  const handlePatchUrls = async () => {
    if (!confirm("This will convert all /storage/ URLs to absolute https://admin.atap.solar/api/files/ URLs in the database.\n\nThis fixes the issue where:\n1. Other apps on different subdomains cannot access files\n2. /storage/ path redirects to dashboard instead of serving files\n3. Wrong /api/files/storage/ path (doubled storage folder)\n\nContinue?")) return;

    setIsPatchingUrls(true);
    setPatchResults(null);

    try {
      const res = await patchFileUrlsToAbsolute();
      setPatchResults(res);
      await loadLogs();
    } catch (error) {
      setPatchResults({ success: false, error: String(error) });
    } finally {
      setIsPatchingUrls(false);
    }
  };

  const handlePatchChinese = async () => {
    if (!confirm("This will fix files with Chinese (or other non-ASCII) characters in their filenames.\n\nIt will:\n1. Scan all file URLs in the database\n2. Rename files on disk to use URL-encoded names\n3. Update database URLs with the new filenames\n\nThis fixes the issue where files with Chinese characters cannot be accessed from browsers.\n\nContinue?")) return;

    setIsPatchingChinese(true);
    setPatchResults(null);

    try {
      const res = await patchChineseFilenames();
      setPatchResults(res);
      await loadLogs();
    } catch (error) {
      setPatchResults({ success: false, error: String(error) });
    } finally {
      setIsPatchingChinese(false);
    }
  };

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

  const handleStartMigration = async () => {
    const fileCount = migrationStats?.totalFiles || 0;
    const dateFilterText = migrationDateFilter ? ` (created after ${migrationDateFilter})` : '';
    if (!confirm(`Start file migration${dateFilterText}?\n\nThis will download ${fileCount} files from Bubble and update all database URLs.\n\nThe process will run in the background and you can track progress below.`)) {
      return;
    }

    setIsMigrating(true);
    setMigrationProgress(null);

    try {
      const res = await fetch('/api/migration/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ createdAfter: migrationDateFilter || undefined })
      });
      const data = await res.json();

      if (data.success) {
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

  // Get current patch operation name for tracking
  const getCurrentOperation = () => {
    if (isUpdatingPercentages) return 'percentages';
    if (isPatchingCreators) return 'creators';
    if (isUpdatingStatuses) return 'statuses';
    if (isDeletingDemo) return 'deleteDemo';
    if (isFixingDates) return 'fixDates';
    if (isRestoringLinks) return 'restoreLinks';
    if (isPatchingUrls) return 'patchUrls';
    if (isPatchingChinese) return 'patchChinese';
    return null;
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in pb-20">
      {/* Header */}
      <div className="space-y-2 border-b border-secondary-200 pb-6">
        <h1 className="text-3xl font-bold text-secondary-900 flex items-center gap-3">
          <RefreshCw className={`h-8 w-8 text-primary-600 ${isSyncing ? 'animate-spin' : ''}`} />
          Sync Center
        </h1>
        <p className="text-secondary-500">
          Synchronize data and files from Bubble ERP v1 to Postgres ERP v2.
        </p>
      </div>

      {/* File Migration */}
      <FileMigrationForm
        isMigrating={isMigrating}
        dateFrom={migrationDateFilter}
        migrationStats={migrationStats}
        migrationProgress={migrationProgress}
        onDateFromChange={setMigrationDateFilter}
        onStartMigration={handleStartMigration}
        onScanStats={fetchMigrationStats}
      />

      {/* Quick Sync */}
      <QuickSyncForm
        dateFrom={dateFrom}
        syncFiles={syncFiles}
        isSyncing={isSyncing}
        results={syncResults}
        progress={progress}
        onDateFromChange={setDateFrom}
        onSyncFilesChange={setSyncFiles}
        onManualSync={handleManualSync}
        onIncrementalSync={handleIncrementalSync}
      />

      {/* Full Invoice Sync */}
      <FullInvoiceSyncForm
        dateFrom={fullSyncDateFrom}
        dateTo={fullSyncDateTo}
        isSyncing={isFullSyncing}
        results={fullSyncResults}
        onDateFromChange={setFullSyncDateFrom}
        onDateToChange={setFullSyncDateTo}
        onSync={handleFullInvoiceSync}
      />

      {/* Invoice Item Sync */}
      <InvoiceItemSyncForm
        dateFrom={itemSyncDateFrom}
        isSyncing={isItemSyncing}
        results={itemSyncResults}
        onDateFromChange={setItemSyncDateFrom}
        onSync={handleInvoiceItemSync}
      />

      {/* SEDA-Only Sync */}
      <SedaSyncForm
        dateFrom={sedaSyncDateFrom}
        dateTo={sedaSyncDateTo}
        isSyncing={isSedaSyncing}
        results={sedaSyncResults}
        onDateFromChange={setSedaSyncDateFrom}
        onDateToChange={setSedaSyncDateTo}
        onSync={handleSedaOnlySync}
      />

      {/* ID List Sync */}
      <IdListSyncForm
        isSyncing={isIdListSyncing}
        results={idListSyncResults}
        onSync={handleIdListSync}
      />

      {/* JSON Upload Sync */}
      <JsonUploadSyncForm
        isSyncing={isJsonUploadSyncing}
        results={jsonUploadResults}
        onSync={handleJsonUploadSync}
      />

      {/* Integrity Sync */}
      <IntegritySyncForm
        isSyncing={isIntegritySyncing || isIntegrityBatchSyncing}
        results={integritySyncResults || integrityBatchResults}
        batchDateFrom={integrityBatchDateFrom}
        batchDateTo={integrityBatchDateTo}
        onSingleSync={handleIntegritySingleSync}
        onBatchSync={handleIntegrityBatchSync}
        onBatchDateFromChange={setIntegrityBatchDateFrom}
        onBatchDateToChange={setIntegrityBatchDateTo}
      />

      {/* Data Patches */}
      <DataPatchesPanel
        isSyncing={isUpdatingPercentages || isPatchingCreators || isUpdatingStatuses}
        results={patchResults}
        currentOperation={getCurrentOperation()}
        onUpdatePercentages={handleUpdatePercentages}
        onPatchCreators={handlePatchCreators}
        onUpdateStatuses={handleUpdateStatuses}
      />

      {/* Maintenance */}
      <MaintenancePanel
        isSyncing={isDeletingDemo || isFixingDates || isRestoringLinks || isPatchingUrls || isPatchingChinese}
        results={patchResults}
        currentOperation={getCurrentOperation()}
        onDeleteDemo={handleDeleteDemo}
        onFixDates={handleFixDates}
        onRestoreLinks={handleRestoreLinks}
        onPatchUrls={handlePatchUrls}
        onPatchChinese={handlePatchChinese}
      />

      {/* Payment Sync Operations */}
      <PaymentSyncForm
        onActionComplete={() => {
          loadLogs();
          // Optionally trigger other refresh actions
        }}
      />

      {/* Logs */}
      <LogViewer
        logs={logs}
        isClearing={isClearingLogs}
        onClear={handleClearLogs}
      />
    </div>
  );
}

// Import actions at the bottom to avoid clutter
import {
  runManualSync,
  runIncrementalSync,
  runFullInvoiceSync,
  runSedaOnlySync,
  runIdListSync,
  runIntegritySync,
  runIntegrityBatchSync,
  syncInvoiceItemLinks,
  updateInvoicePaymentPercentages,
  patchInvoiceCreators,
  updateInvoiceStatuses,
  deleteDemoInvoices,
  fixMissingInvoiceDates,
  restoreInvoiceSedaLinks,
  patchFileUrlsToAbsolute,
  patchChineseFilenames,
} from "./actions";
