/**
 * ============================================================================
 * DATA PATCHES PANEL COMPONENT
 * ============================================================================
 *
 * Panel for data patch operations (percentages, creators, statuses).
 *
 * File: src/app/sync/components/panels/DataPatchesPanel.tsx
 */

import { Wrench, RefreshCw, Loader2, XCircle, CheckCircle2 } from "lucide-react";

interface DataPatchesPanelProps {
  isSyncing: boolean;
  results: any;
  currentOperation: string | null;
  onUpdatePercentages: () => void;
  onPatchCreators: () => void;
  onUpdateStatuses: () => void;
}

export function DataPatchesPanel({
  isSyncing,
  results,
  currentOperation,
  onUpdatePercentages,
  onPatchCreators,
  onUpdateStatuses,
}: DataPatchesPanelProps) {
  return (
    <div className="card bg-gradient-to-br from-slate-800 to-slate-900 text-white shadow-elevation-lg">
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-700/50 rounded-lg">
            <Wrench className="h-5 w-5 text-slate-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold">Data Patches</h3>
            <p className="text-slate-300 text-sm">Fix data inconsistencies and missing values</p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {/* Update Payment Percentages */}
        <div className="p-4 bg-black/20 rounded-lg border border-white/10">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h4 className="font-semibold text-slate-200 mb-1">Update Payment Percentages</h4>
              <p className="text-sm text-slate-400">
                Recalculate all invoice payment percentages based on linked payments
              </p>
            </div>
            <button
              onClick={onUpdatePercentages}
              disabled={isSyncing}
              className="btn-primary bg-slate-700 hover:bg-slate-600 border-none flex items-center gap-2 px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {isSyncing && currentOperation === 'percentages' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Run Patch
                </>
              )}
            </button>
          </div>
        </div>

        {/* Patch Invoice Creators */}
        <div className="p-4 bg-black/20 rounded-lg border border-white/10">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h4 className="font-semibold text-slate-200 mb-1">Patch Invoice Creators</h4>
              <p className="text-sm text-slate-400">
                Update invoice creator fields from linked agent information
              </p>
            </div>
            <button
              onClick={onPatchCreators}
              disabled={isSyncing}
              className="btn-primary bg-slate-700 hover:bg-slate-600 border-none flex items-center gap-2 px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {isSyncing && currentOperation === 'creators' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Run Patch
                </>
              )}
            </button>
          </div>
        </div>

        {/* Update Invoice Statuses */}
        <div className="p-4 bg-black/20 rounded-lg border border-white/10">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h4 className="font-semibold text-slate-200 mb-1">Update Invoice Statuses</h4>
              <p className="text-sm text-slate-400">
                Recalculate invoice statuses based on payment and SEDA state
              </p>
            </div>
            <button
              onClick={onUpdateStatuses}
              disabled={isSyncing}
              className="btn-primary bg-slate-700 hover:bg-slate-600 border-none flex items-center gap-2 px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {isSyncing && currentOperation === 'statuses' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Run Patch
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Results Display */}
      {results?.success && (
        <div className="p-6 bg-black/20 border-t border-white/5">
          <div className="flex items-center gap-3 mb-4 text-green-400">
            <CheckCircle2 className="h-5 w-5" />
            <p className="font-bold">Patch Completed Successfully</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {results.results?.updatedCount !== undefined && (
              <div className="text-center p-3 bg-white/5 rounded-lg">
                <p className="text-2xl font-bold text-white">{results.results.updatedCount}</p>
                <p className="text-[10px] uppercase font-bold text-slate-300">Records Updated</p>
              </div>
            )}
            {results.results?.processedCount !== undefined && (
              <div className="text-center p-3 bg-white/5 rounded-lg">
                <p className="text-2xl font-bold text-white">{results.results.processedCount}</p>
                <p className="text-[10px] uppercase font-bold text-slate-300">Records Processed</p>
              </div>
            )}
            {results.results?.successCount !== undefined && (
              <div className="text-center p-3 bg-white/5 rounded-lg">
                <p className="text-2xl font-bold text-white">{results.results.successCount}</p>
                <p className="text-[10px] uppercase font-bold text-slate-300">Successful</p>
              </div>
            )}
            {results.results?.errorCount !== undefined && (
              <div className="text-center p-3 bg-white/5 rounded-lg">
                <p className="text-2xl font-bold text-white">{results.results.errorCount}</p>
                <p className="text-[10px] uppercase font-bold text-slate-300">Errors</p>
              </div>
            )}
          </div>
        </div>
      )}

      {results && !results.success && (
        <div className="p-6 bg-black/20 border-t border-white/5">
          <div className="flex items-center gap-3 mb-4 text-red-400">
            <XCircle className="h-5 w-5" />
            <p className="font-bold">Patch Failed</p>
          </div>
          <div className="p-3 bg-red-500/20 rounded-lg text-red-300 text-sm font-mono">
            {results.error}
          </div>
        </div>
      )}
    </div>
  );
}
