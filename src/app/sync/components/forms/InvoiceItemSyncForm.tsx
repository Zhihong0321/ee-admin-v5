/**
 * ============================================================================
 * INVOICE ITEM SYNC FORM COMPONENT
 * ============================================================================
 *
 * Form for syncing invoice item links from local database.
 *
 * File: src/app/sync/components/forms/InvoiceItemSyncForm.tsx
 */

import { Link, Zap, Loader2, CheckCircle2, XCircle } from "lucide-react";

interface InvoiceItemSyncFormProps {
  dateFrom: string;
  isSyncing: boolean;
  results: any;
  onDateFromChange: (value: string) => void;
  onSync: () => void;
}

export function InvoiceItemSyncForm({
  dateFrom,
  isSyncing,
  results,
  onDateFromChange,
  onSync,
}: InvoiceItemSyncFormProps) {
  return (
    <div className="card overflow-hidden bg-gradient-to-br from-green-600 to-emerald-700 text-white shadow-elevation-lg">
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold flex items-center gap-2">
              <Link className="h-6 w-6" />
              Invoice Item Link Sync
            </h3>
            <p className="text-green-200 text-sm">Populates invoice.linked_invoice_item from existing invoice_item table (FAST - no Bubble API!)</p>
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-green-200">Created From (optional - leave empty for ALL invoices)</label>
          <input
            type="date"
            className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-white/50"
            value={dateFrom}
            onChange={(e) => onDateFromChange(e.target.value)}
            disabled={isSyncing}
          />
        </div>

        <button
          onClick={onSync}
          disabled={isSyncing}
          className="w-full py-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-white font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSyncing ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Linking...
            </>
          ) : (
            <>
              <Zap className="h-5 w-5" />
              Link Invoice Items Now
            </>
          )}
        </button>

        {/* Results */}
        {results?.success && (
          <div className="p-4 bg-white/5 rounded-xl space-y-3">
            <div className="flex items-center gap-2 text-green-300">
              <CheckCircle2 className="h-5 w-5" />
              <p className="font-bold">Link Complete!</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center p-3 bg-white/5 rounded-lg">
                <p className="text-2xl font-bold text-white">{results.results?.updatedCount}</p>
                <p className="text-[10px] uppercase font-bold text-green-300">Invoices Updated</p>
              </div>
              <div className="text-center p-3 bg-white/5 rounded-lg">
                <p className="text-2xl font-bold text-white">{results.results?.totalItems}</p>
                <p className="text-[10px] uppercase font-bold text-green-300">Total Items</p>
              </div>
              <div className="text-center p-3 bg-white/5 rounded-lg">
                <p className="text-2xl font-bold text-white">{results.results?.duration}s</p>
                <p className="text-[10px] uppercase font-bold text-green-300">Duration</p>
              </div>
            </div>
          </div>
        )}

        {results && !results.success && (
          <div className="p-3 bg-red-500/20 rounded-lg text-red-300 text-sm font-mono">
            {results.error}
          </div>
        )}

        {isSyncing && (
          <div className="p-3 bg-white/5 rounded-lg text-center">
            <Loader2 className="h-5 w-5 animate-spin text-green-400 mx-auto mb-2" />
            <p className="text-sm text-green-200">Linking invoice items... (Fast!)</p>
          </div>
        )}
      </div>
    </div>
  );
}
