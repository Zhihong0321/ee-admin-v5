/**
 * ============================================================================
 * SEDA SYNC FORM COMPONENT
 * ============================================================================
 *
 * Form for syncing SEDA registrations with date range.
 *
 * File: src/app/sync/components/forms/SedaSyncForm.tsx
 */

import { FileText, RefreshCw, Loader2, XCircle, CheckCircle2 } from "lucide-react";

interface SedaSyncFormProps {
  dateFrom: string;
  dateTo: string;
  isSyncing: boolean;
  results: any;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onSync: () => void;
}

export function SedaSyncForm({
  dateFrom,
  dateTo,
  isSyncing,
  results,
  onDateFromChange,
  onDateToChange,
  onSync,
}: SedaSyncFormProps) {
  return (
    <div className="card overflow-hidden bg-gradient-to-br from-purple-900 via-purple-800 to-purple-900 text-white shadow-elevation-lg">
      <div className="p-6 border-b border-white/10">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-purple-500/20 rounded-xl backdrop-blur-md border border-purple-500/30">
              <FileText className="h-6 w-6 text-purple-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold">SEDA Only Sync</h3>
              <p className="text-purple-200 text-sm">Sync SEDA registrations without touching other data</p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Date From Input */}
            <div className="flex items-center gap-2">
              <label className="text-[10px] uppercase font-bold text-purple-300">From:</label>
              <input
                type="date"
                className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                value={dateFrom}
                onChange={(e) => onDateFromChange(e.target.value)}
                disabled={isSyncing}
              />
            </div>

            {/* Date To Input */}
            <div className="flex items-center gap-2">
              <label className="text-[10px] uppercase font-bold text-purple-300">To:</label>
              <input
                type="date"
                className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                value={dateTo}
                onChange={(e) => onDateToChange(e.target.value)}
                disabled={isSyncing}
                placeholder="Current"
              />
              {dateTo && (
                <button
                  onClick={() => onDateToChange('')}
                  className="text-xs text-purple-300 hover:text-white underline"
                  disabled={isSyncing}
                >
                  Clear
                </button>
              )}
            </div>

            {!isSyncing && (
              <button
                onClick={onSync}
                disabled={!dateFrom}
                className="btn-primary bg-purple-600 hover:bg-purple-500 border-none flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className="h-4 w-4" />
                Start SEDA Sync
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Results Display */}
      {results?.success ? (
        <div className="p-6 bg-black/20 border-b border-white/5">
          <div className="flex items-center gap-3 mb-4 text-green-400">
            <CheckCircle2 className="h-5 w-5" />
            <p className="font-bold">SEDA Sync Completed Successfully</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <p className="text-2xl font-bold text-white">{results.results?.syncedSedas || 0}</p>
              <p className="text-[10px] uppercase font-bold text-purple-300">SEDA Records</p>
            </div>
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <p className="text-2xl font-bold text-white">{results.results?.syncedCustomers || 0}</p>
              <p className="text-[10px] uppercase font-bold text-purple-300">Customers</p>
            </div>
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <p className="text-2xl font-bold text-white">{results.results?.syncedTemplates || 0}</p>
              <p className="text-[10px] uppercase font-bold text-purple-300">Templates</p>
            </div>
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <p className="text-2xl font-bold text-white">{results.results?.linkUpdates || 0}</p>
              <p className="text-[10px] uppercase font-bold text-purple-300">Link Updates</p>
            </div>
          </div>
        </div>
      ) : results && !results.success ? (
        <div className="p-6 bg-black/20 border-b border-white/5">
          <div className="flex items-center gap-3 mb-4 text-red-400">
            <XCircle className="h-5 w-5" />
            <p className="font-bold">SEDA Sync Failed</p>
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
            <Loader2 className="h-5 w-5 animate-spin text-purple-400" />
            <p className="font-bold text-white">Syncing SEDA registrations...</p>
          </div>
          <p className="text-sm text-purple-200 mt-2">This may take a few minutes. Please check the logs below for progress.</p>
        </div>
      )}
    </div>
  );
}
