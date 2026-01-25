/**
 * ============================================================================
 * FULL INVOICE SYNC FORM COMPONENT
 * ============================================================================
 *
 * Form for syncing invoices with date range and all relational data.
 *
 * File: src/app/sync/components/forms/FullInvoiceSyncForm.tsx
 */

import { Calendar, Database, RefreshCw, Loader2, XCircle, CheckCircle2 } from "lucide-react";

interface FullInvoiceSyncFormProps {
  dateFrom: string;
  dateTo: string;
  isSyncing: boolean;
  results: any;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onSync: () => void;
}

export function FullInvoiceSyncForm({
  dateFrom,
  dateTo,
  isSyncing,
  results,
  onDateFromChange,
  onDateToChange,
  onSync,
}: FullInvoiceSyncFormProps) {
  return (
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
                value={dateFrom}
                onChange={(e) => onDateFromChange(e.target.value)}
                disabled={isSyncing}
              />
            </div>

            {/* Date To Input */}
            <div className="flex items-center gap-2">
              <label className="text-[10px] uppercase font-bold text-blue-300">To:</label>
              <input
                type="date"
                className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={dateTo}
                onChange={(e) => onDateToChange(e.target.value)}
                disabled={isSyncing}
                placeholder="Current"
              />
              {dateTo && (
                <button
                  onClick={() => onDateToChange('')}
                  className="text-xs text-blue-300 hover:text-white underline"
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
                className="btn-primary bg-blue-600 hover:bg-blue-500 border-none flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className="h-4 w-4" />
                Start Full Invoice Sync
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
            <p className="font-bold">Sync Completed Successfully</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <p className="text-2xl font-bold text-white">{results.results?.syncedInvoices}</p>
              <p className="text-[10px] uppercase font-bold text-blue-300">Invoices</p>
            </div>
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <p className="text-2xl font-bold text-white">{results.results?.syncedCustomers}</p>
              <p className="text-[10px] uppercase font-bold text-blue-300">Customers</p>
            </div>
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <p className="text-2xl font-bold text-white">{results.results?.syncedAgents}</p>
              <p className="text-[10px] uppercase font-bold text-blue-300">Agents</p>
            </div>
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <p className="text-2xl font-bold text-white">{results.results?.syncedUsers}</p>
              <p className="text-[10px] uppercase font-bold text-blue-300">Users</p>
            </div>
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <p className="text-2xl font-bold text-white">{results.results?.syncedPayments + results.results?.syncedSubmittedPayments}</p>
              <p className="text-[10px] uppercase font-bold text-blue-300">Payments</p>
            </div>
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <p className="text-2xl font-bold text-white">{results.results?.syncedSedas}</p>
              <p className="text-[10px] uppercase font-bold text-blue-300">SEDA</p>
            </div>
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <p className="text-2xl font-bold text-white">{results.results?.syncedTemplates}</p>
              <p className="text-[10px] uppercase font-bold text-blue-300">Templates</p>
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
            <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
            <p className="font-bold text-white">Syncing invoices and all related data...</p>
          </div>
          <p className="text-sm text-blue-200 mt-2">This may take a few minutes. Please check the logs below for progress.</p>
        </div>
      )}
    </div>
  );
}
