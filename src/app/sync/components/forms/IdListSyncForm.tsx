/**
 * ============================================================================
 * ID LIST SYNC FORM COMPONENT
 * ============================================================================
 *
 * Form for fast ID-list sync from CSV data.
 *
 * File: src/app/sync/components/forms/IdListSyncForm.tsx
 */

import { useState } from "react";
import { List, Upload, RefreshCw, Loader2, XCircle, CheckCircle2, FileText } from "lucide-react";

interface IdListSyncFormProps {
  isSyncing: boolean;
  results: any;
  onSync: (csvData: string) => void;
}

export function IdListSyncForm({
  isSyncing,
  results,
  onSync,
}: IdListSyncFormProps) {
  const [csvData, setCsvData] = useState('');
  const [fileName, setFileName] = useState('');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvData(text);
    };
    reader.readAsText(file);
  };

  const handleSync = () => {
    if (csvData.trim()) {
      onSync(csvData);
    }
  };

  const handleClear = () => {
    setCsvData('');
    setFileName('');
  };

  const parsedCount = csvData.trim()
    ? csvData.split('\n').filter(line => line.trim()).length
    : 0;

  return (
    <div className="card overflow-hidden bg-gradient-to-br from-emerald-900 via-emerald-800 to-emerald-900 text-white shadow-elevation-lg">
      <div className="p-6 border-b border-white/10">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-500/20 rounded-xl backdrop-blur-md border border-emerald-500/30">
              <List className="h-6 w-6 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold">Fast ID List Sync</h3>
              <p className="text-emerald-200 text-sm">Sync specific invoices by CSV list of IDs</p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* File Upload */}
            <div className="flex items-center gap-2">
              <label className="btn-primary bg-emerald-600 hover:bg-emerald-500 border-none flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                <Upload className="h-4 w-4" />
                Upload CSV
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileUpload}
                  disabled={isSyncing}
                  className="hidden"
                />
              </label>
              {fileName && (
                <span className="text-xs text-emerald-300 max-w-[200px] truncate">
                  {fileName}
                </span>
              )}
            </div>

            {!isSyncing && csvData && (
              <>
                <button
                  onClick={handleSync}
                  className="btn-primary bg-emerald-600 hover:bg-emerald-500 border-none flex items-center gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Sync {parsedCount} IDs
                </button>
                <button
                  onClick={handleClear}
                  className="text-xs text-emerald-300 hover:text-white underline"
                >
                  Clear
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* CSV Preview */}
      {csvData && (
        <div className="p-6 bg-black/20 border-b border-white/5">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="h-4 w-4 text-emerald-400" />
            <p className="text-sm font-bold text-emerald-300">
              CSV Data ({parsedCount} IDs)
            </p>
          </div>
          <div className="p-3 bg-emerald-950/50 rounded-lg text-emerald-200 text-xs font-mono max-h-[150px] overflow-y-auto">
            {csvData.split('\n').slice(0, 10).map((line, idx) => (
              <div key={idx}>{line}</div>
            ))}
            {csvData.split('\n').length > 10 && (
              <div className="text-emerald-400 italic mt-2">
                ...and {csvData.split('\n').length - 10} more lines
              </div>
            )}
          </div>
        </div>
      )}

      {/* Results Display */}
      {results?.success ? (
        <div className="p-6 bg-black/20 border-b border-white/5">
          <div className="flex items-center gap-3 mb-4 text-green-400">
            <CheckCircle2 className="h-5 w-5" />
            <p className="font-bold">ID List Sync Completed Successfully</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <p className="text-2xl font-bold text-white">{results.results?.syncedInvoices || 0}</p>
              <p className="text-[10px] uppercase font-bold text-emerald-300">Invoices</p>
            </div>
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <p className="text-2xl font-bold text-white">{results.results?.syncedCustomers || 0}</p>
              <p className="text-[10px] uppercase font-bold text-emerald-300">Customers</p>
            </div>
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <p className="text-2xl font-bold text-white">{results.results?.syncedAgents || 0}</p>
              <p className="text-[10px] uppercase font-bold text-emerald-300">Agents</p>
            </div>
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <p className="text-2xl font-bold text-white">{results.results?.syncedPayments || 0}</p>
              <p className="text-[10px] uppercase font-bold text-emerald-300">Payments</p>
            </div>
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <p className="text-2xl font-bold text-white">{results.results?.syncedSedas || 0}</p>
              <p className="text-[10px] uppercase font-bold text-emerald-300">SEDA</p>
            </div>
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <p className="text-2xl font-bold text-white">{results.results?.syncedItems || 0}</p>
              <p className="text-[10px] uppercase font-bold text-emerald-300">Items</p>
            </div>
          </div>
        </div>
      ) : results && !results.success ? (
        <div className="p-6 bg-black/20 border-b border-white/5">
          <div className="flex items-center gap-3 mb-4 text-red-400">
            <XCircle className="h-5 w-5" />
            <p className="font-bold">ID List Sync Failed</p>
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
            <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
            <p className="font-bold text-white">Syncing {parsedCount} invoices...</p>
          </div>
          <p className="text-sm text-emerald-200 mt-2">This may take a few minutes. Please check the logs below for progress.</p>
        </div>
      )}
    </div>
  );
}
