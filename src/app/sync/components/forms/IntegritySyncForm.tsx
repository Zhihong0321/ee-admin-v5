/**
 * ============================================================================
 * INTEGRITY SYNC FORM COMPONENT
 * ============================================================================
 *
 * Form for integrity-first sync operations (single + batch).
 *
 * File: src/app/sync/components/forms/IntegritySyncForm.tsx
 */

import { useState } from "react";
import { Shield, Check, RefreshCw, Loader2, XCircle, CheckCircle2 } from "lucide-react";

interface IntegritySyncFormProps {
  isSyncing: boolean;
  results: any;
  batchDateFrom: string;
  batchDateTo: string;
  onSingleSync: (invoiceId: string) => void;
  onBatchSync: () => void;
  onBatchDateFromChange: (value: string) => void;
  onBatchDateToChange: (value: string) => void;
}

export function IntegritySyncForm({
  isSyncing,
  results,
  batchDateFrom,
  batchDateTo,
  onSingleSync,
  onBatchSync,
  onBatchDateFromChange,
  onBatchDateToChange,
}: IntegritySyncFormProps) {
  const [syncMode, setSyncMode] = useState<'single' | 'batch'>('single');
  const [invoiceId, setInvoiceId] = useState('');

  const handleSingleSync = () => {
    if (invoiceId.trim()) {
      onSingleSync(invoiceId.trim());
    }
  };

  return (
    <div className="card overflow-hidden bg-gradient-to-br from-amber-900 via-amber-800 to-amber-900 text-white shadow-elevation-lg">
      <div className="p-6 border-b border-white/10">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-500/20 rounded-xl backdrop-blur-md border border-amber-500/30">
              <Shield className="h-6 w-6 text-amber-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold">Integrity-First Sync</h3>
              <p className="text-amber-200 text-sm">Guaranteed complete data integrity with rollback protection</p>
            </div>
          </div>

          {/* Mode Toggle */}
          <div className="flex items-center gap-2 bg-black/20 rounded-lg p-1">
            <button
              onClick={() => setSyncMode('single')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                syncMode === 'single'
                  ? 'bg-amber-600 text-white'
                  : 'text-amber-300 hover:text-white'
              }`}
              disabled={isSyncing}
            >
              Single Invoice
            </button>
            <button
              onClick={() => setSyncMode('batch')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                syncMode === 'batch'
                  ? 'bg-amber-600 text-white'
                  : 'text-amber-300 hover:text-white'
              }`}
              disabled={isSyncing}
            >
              Date Range
            </button>
          </div>
        </div>
      </div>

      {/* Single Invoice Mode */}
      {syncMode === 'single' && (
        <div className="p-6 bg-black/20 border-b border-white/5">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-amber-300 mb-2">
                Invoice Bubble ID
              </label>
              <input
                type="text"
                placeholder="e.g., 172938476562819082453187014723758553261"
                className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                value={invoiceId}
                onChange={(e) => setInvoiceId(e.target.value)}
                disabled={isSyncing}
              />
            </div>
            {!isSyncing && (
              <button
                onClick={handleSingleSync}
                disabled={!invoiceId.trim()}
                className="btn-primary bg-amber-600 hover:bg-amber-500 border-none flex items-center gap-2 px-6 disabled:opacity-50 disabled:cursor-not-allowed self-end"
              >
                <Check className="h-4 w-4" />
                Sync Invoice
              </button>
            )}
          </div>
        </div>
      )}

      {/* Batch Mode */}
      {syncMode === 'batch' && (
        <div className="p-6 bg-black/20 border-b border-white/5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              {/* Date From Input */}
              <div className="flex items-center gap-2">
                <label className="text-[10px] uppercase font-bold text-amber-300">From:</label>
                <input
                  type="date"
                  className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  value={batchDateFrom}
                  onChange={(e) => onBatchDateFromChange(e.target.value)}
                  disabled={isSyncing}
                />
              </div>

              {/* Date To Input */}
              <div className="flex items-center gap-2">
                <label className="text-[10px] uppercase font-bold text-amber-300">To:</label>
                <input
                  type="date"
                  className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  value={batchDateTo}
                  onChange={(e) => onBatchDateToChange(e.target.value)}
                  disabled={isSyncing}
                  placeholder="Current"
                />
                {batchDateTo && (
                  <button
                    onClick={() => onBatchDateToChange('')}
                    className="text-xs text-amber-300 hover:text-white underline"
                    disabled={isSyncing}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {!isSyncing && (
              <button
                onClick={onBatchSync}
                disabled={!batchDateFrom}
                className="btn-primary bg-amber-600 hover:bg-amber-500 border-none flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className="h-4 w-4" />
                Start Batch Sync
              </button>
            )}
          </div>
        </div>
      )}

      {/* Results Display */}
      {results?.success ? (
        <div className="p-6 bg-black/20 border-b border-white/5">
          <div className="flex items-center gap-3 mb-4 text-green-400">
            <CheckCircle2 className="h-5 w-5" />
            <p className="font-bold">
              {syncMode === 'single' ? 'Single Invoice' : 'Batch'} Sync Completed Successfully
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <p className="text-2xl font-bold text-white">{results.results?.syncedInvoices || 0}</p>
              <p className="text-[10px] uppercase font-bold text-amber-300">Invoices</p>
            </div>
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <p className="text-2xl font-bold text-white">{results.results?.syncedCustomers || 0}</p>
              <p className="text-[10px] uppercase font-bold text-amber-300">Customers</p>
            </div>
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <p className="text-2xl font-bold text-white">{results.results?.syncedAgents || 0}</p>
              <p className="text-[10px] uppercase font-bold text-amber-300">Agents</p>
            </div>
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <p className="text-2xl font-bold text-white">{results.results?.syncedPayments || 0}</p>
              <p className="text-[10px] uppercase font-bold text-amber-300">Payments</p>
            </div>
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <p className="text-2xl font-bold text-white">{results.results?.syncedSedas || 0}</p>
              <p className="text-[10px] uppercase font-bold text-amber-300">SEDA</p>
            </div>
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <p className="text-2xl font-bold text-white">{results.results?.syncedItems || 0}</p>
              <p className="text-[10px] uppercase font-bold text-amber-300">Items</p>
            </div>
          </div>
        </div>
      ) : results && !results.success ? (
        <div className="p-6 bg-black/20 border-b border-white/5">
          <div className="flex items-center gap-3 mb-4 text-red-400">
            <XCircle className="h-5 w-5" />
            <p className="font-bold">Integrity Sync Failed</p>
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
            <Loader2 className="h-5 w-5 animate-spin text-amber-400" />
            <p className="font-bold text-white">
              Running integrity sync...
            </p>
          </div>
          <p className="text-sm text-amber-200 mt-2">
            This ensures complete data integrity with transaction rollback. Please check the logs below for progress.
          </p>
        </div>
      )}
    </div>
  );
}
