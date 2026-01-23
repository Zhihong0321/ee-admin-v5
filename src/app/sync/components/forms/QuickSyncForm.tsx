/**
 * ============================================================================
 * QUICK SYNC FORM COMPONENT
 * ============================================================================
 *
 * Form for quick manual and incremental sync operations.
 *
 * File: src/app/sync/components/forms/QuickSyncForm.tsx
 */

import { Calendar, Clock, RefreshCw, Loader2, XCircle, CheckCircle2, FileText } from "lucide-react";

interface QuickSyncFormProps {
  dateFrom: string;
  syncFiles: boolean;
  isSyncing: boolean;
  results: any;
  progress: any;
  onDateFromChange: (value: string) => void;
  onSyncFilesChange: (value: boolean) => void;
  onManualSync: () => void;
  onIncrementalSync: () => void;
}

export function QuickSyncForm({
  dateFrom,
  syncFiles,
  isSyncing,
  results,
  progress,
  onDateFromChange,
  onSyncFilesChange,
  onManualSync,
  onIncrementalSync,
}: QuickSyncFormProps) {
  return (
    <div className="card overflow-hidden bg-gradient-to-br from-cyan-900 via-cyan-800 to-cyan-900 text-white shadow-elevation-lg">
      <div className="p-6 border-b border-white/10">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-cyan-500/20 rounded-xl backdrop-blur-md border border-cyan-500/30">
              <RefreshCw className="h-6 w-6 text-cyan-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold">Quick Sync</h3>
              <p className="text-cyan-200 text-sm">Manual sync with optional file download, or quick 24h incremental</p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Date From Input */}
            <div className="flex items-center gap-2">
              <label className="text-[10px] uppercase font-bold text-cyan-300">From:</label>
              <input
                type="date"
                className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                value={dateFrom}
                onChange={(e) => onDateFromChange(e.target.value)}
                disabled={isSyncing}
              />
            </div>

            {/* File Sync Toggle */}
            <div className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded-lg border border-white/10">
              <input
                type="checkbox"
                id="syncFiles"
                checked={syncFiles}
                onChange={(e) => onSyncFilesChange(e.target.checked)}
                className="w-4 h-4 text-cyan-600 focus:ring-cyan-500 border-white/30 rounded"
                disabled={isSyncing}
              />
              <label
                htmlFor="syncFiles"
                className="text-sm font-medium text-cyan-300 flex items-center gap-2 cursor-pointer"
              >
                <FileText className="h-4 w-4" />
                Files
              </label>
            </div>

            {!isSyncing && (
              <>
                <button
                  onClick={onManualSync}
                  className="btn-primary bg-cyan-600 hover:bg-cyan-500 border-none flex items-center gap-2"
                >
                  <Calendar className="h-4 w-4" />
                  Manual Sync
                </button>
                <button
                  onClick={onIncrementalSync}
                  className="btn-secondary bg-white/10 border-white/20 text-white hover:bg-white/20 flex items-center gap-2"
                >
                  <Clock className="h-4 w-4" />
                  Last 24h
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Results Display */}
      {results?.success ? (
        <div className="p-6 bg-black/20 border-b border-white/5">
          <div className="flex items-center gap-3 mb-4 text-green-400">
            <CheckCircle2 className="h-5 w-5" />
            <p className="font-bold">Sync Completed Successfully</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <p className="text-2xl font-bold text-white">{results.results?.syncedInvoices || 0}</p>
              <p className="text-[10px] uppercase font-bold text-cyan-300">Invoices</p>
            </div>
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <p className="text-2xl font-bold text-white">{results.results?.syncedCustomers || 0}</p>
              <p className="text-[10px] uppercase font-bold text-cyan-300">Customers</p>
            </div>
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <p className="text-2xl font-bold text-white">{results.results?.syncedAgents || 0}</p>
              <p className="text-[10px] uppercase font-bold text-cyan-300">Agents</p>
            </div>
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <p className="text-2xl font-bold text-white">{results.results?.syncedPayments || 0}</p>
              <p className="text-[10px] uppercase font-bold text-cyan-300">Payments</p>
            </div>
          </div>
        </div>
      ) : results && !results.success ? (
        <div className="p-6 bg-black/20 border-b border-white/5">
          <div className="flex items-center gap-3 mb-4 text-red-400">
            <XCircle className="h-5 w-5" />
            <p className="font-bold">Sync Failed</p>
          </div>
          <div className="p-3 bg-red-500/20 rounded-lg text-red-300 text-sm font-mono">
            {results.error}
          </div>
        </div>
      ) : null}

      {/* Progress */}
      {isSyncing && (
        <div className="p-6 bg-black/20 border-b border-white/5">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-cyan-400" />
            <p className="font-bold text-white">Syncing data...</p>
          </div>
          {progress && (
            <>
              <div className="mt-3 h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-cyan-500 transition-all duration-300"
                  style={{ width: `${progress.percentage || 0}%` }}
                />
              </div>
              <p className="text-sm text-cyan-200 mt-2">
                {progress.category}: {progress.current} / {progress.total}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
