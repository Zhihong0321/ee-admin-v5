/**
 * ============================================================================
 * MAINTENANCE PANEL COMPONENT
 * ============================================================================
 *
 * Panel for data maintenance operations (cleanup, fixes, link restoration).
 *
 * File: src/app/sync/components/panels/MaintenancePanel.tsx
 */

import { Settings, RefreshCw, Loader2, XCircle, CheckCircle2, Link2, FileText, Calendar } from "lucide-react";

interface MaintenancePanelProps {
  isSyncing: boolean;
  results: any;
  currentOperation: string | null;
  onDeleteDemo: () => void;
  onFixDates: () => void;
  onRestoreLinks: () => void;
  onPatchUrls: () => void;
  onPatchChinese: () => void;
}

export function MaintenancePanel({
  isSyncing,
  results,
  currentOperation,
  onDeleteDemo,
  onFixDates,
  onRestoreLinks,
  onPatchUrls,
  onPatchChinese,
}: MaintenancePanelProps) {
  return (
    <div className="card bg-gradient-to-br from-zinc-800 to-zinc-900 text-white shadow-elevation-lg">
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-zinc-700/50 rounded-lg">
            <Settings className="h-5 w-5 text-zinc-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold">Data Maintenance</h3>
            <p className="text-zinc-300 text-sm">Cleanup, fixes, and data restoration operations</p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {/* Delete Demo Invoices */}
        <div className="p-4 bg-black/20 rounded-lg border border-white/10">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-semibold text-zinc-200">Delete Demo Invoices</h4>
                <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-full">Destructive</span>
              </div>
              <p className="text-sm text-zinc-400">
                Remove demo invoices (no customer, no payments) from database
              </p>
            </div>
            <button
              onClick={onDeleteDemo}
              disabled={isSyncing}
              className="btn-primary bg-red-700 hover:bg-red-600 border-none flex items-center gap-2 px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {isSyncing && currentOperation === 'deleteDemo' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Run Cleanup
                </>
              )}
            </button>
          </div>
        </div>

        {/* Fix Missing Invoice Dates */}
        <div className="p-4 bg-black/20 rounded-lg border border-white/10">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="h-4 w-4 text-zinc-400" />
                <h4 className="font-semibold text-zinc-200">Fix Missing Invoice Dates</h4>
              </div>
              <p className="text-sm text-zinc-400">
                Resync invoices from Bubble to fix missing creation dates
              </p>
            </div>
            <button
              onClick={onFixDates}
              disabled={isSyncing}
              className="btn-primary bg-zinc-700 hover:bg-zinc-600 border-none flex items-center gap-2 px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {isSyncing && currentOperation === 'fixDates' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Run Fix
                </>
              )}
            </button>
          </div>
        </div>

        {/* Restore Invoice-SEDA Links */}
        <div className="p-4 bg-black/20 rounded-lg border border-white/10">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Link2 className="h-4 w-4 text-zinc-400" />
                <h4 className="font-semibold text-zinc-200">Restore Invoice-SEDA Links</h4>
              </div>
              <p className="text-sm text-zinc-400">
                Rebuild broken invoice to SEDA registration links from SEDA data
              </p>
            </div>
            <button
              onClick={onRestoreLinks}
              disabled={isSyncing}
              className="btn-primary bg-zinc-700 hover:bg-zinc-600 border-none flex items-center gap-2 px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {isSyncing && currentOperation === 'restoreLinks' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Restore
                </>
              )}
            </button>
          </div>
        </div>

        {/* Patch File URLs to Absolute */}
        <div className="p-4 bg-black/20 rounded-lg border border-white/10">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <FileText className="h-4 w-4 text-zinc-400" />
                <h4 className="font-semibold text-zinc-200">Patch File URLs to Absolute</h4>
              </div>
              <p className="text-sm text-zinc-400">
                Convert relative /storage/ paths to absolute Bubble URLs
              </p>
            </div>
            <button
              onClick={onPatchUrls}
              disabled={isSyncing}
              className="btn-primary bg-zinc-700 hover:bg-zinc-600 border-none flex items-center gap-2 px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {isSyncing && currentOperation === 'patchUrls' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Patch URLs
                </>
              )}
            </button>
          </div>
        </div>

        {/* Patch Chinese Filenames */}
        <div className="p-4 bg-black/20 rounded-lg border border-white/10">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <FileText className="h-4 w-4 text-zinc-400" />
                <h4 className="font-semibold text-zinc-200">Patch Chinese Filenames</h4>
              </div>
              <p className="text-sm text-zinc-400">
                URL-encode Chinese filenames to fix file access issues
              </p>
            </div>
            <button
              onClick={onPatchChinese}
              disabled={isSyncing}
              className="btn-primary bg-zinc-700 hover:bg-zinc-600 border-none flex items-center gap-2 px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {isSyncing && currentOperation === 'patchChinese' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Patch Filenames
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
            <p className="font-bold">Operation Completed Successfully</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {results.results?.deletedCount !== undefined && (
              <div className="text-center p-3 bg-white/5 rounded-lg">
                <p className="text-2xl font-bold text-white">{results.results.deletedCount}</p>
                <p className="text-[10px] uppercase font-bold text-zinc-300">Deleted</p>
              </div>
            )}
            {results.results?.updatedCount !== undefined && (
              <div className="text-center p-3 bg-white/5 rounded-lg">
                <p className="text-2xl font-bold text-white">{results.results.updatedCount}</p>
                <p className="text-[10px] uppercase font-bold text-zinc-300">Updated</p>
              </div>
            )}
            {results.results?.restoredCount !== undefined && (
              <div className="text-center p-3 bg-white/5 rounded-lg">
                <p className="text-2xl font-bold text-white">{results.results.restoredCount}</p>
                <p className="text-[10px] uppercase font-bold text-zinc-300">Restored</p>
              </div>
            )}
            {results.results?.processedCount !== undefined && (
              <div className="text-center p-3 bg-white/5 rounded-lg">
                <p className="text-2xl font-bold text-white">{results.results.processedCount}</p>
                <p className="text-[10px] uppercase font-bold text-zinc-300">Processed</p>
              </div>
            )}
          </div>
        </div>
      )}

      {results && !results.success && (
        <div className="p-6 bg-black/20 border-t border-white/5">
          <div className="flex items-center gap-3 mb-4 text-red-400">
            <XCircle className="h-5 w-5" />
            <p className="font-bold">Operation Failed</p>
          </div>
          <div className="p-3 bg-red-500/20 rounded-lg text-red-300 text-sm font-mono">
            {results.error}
          </div>
        </div>
      )}
    </div>
  );
}
