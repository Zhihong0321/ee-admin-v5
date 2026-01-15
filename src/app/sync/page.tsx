"use client";

import { useState } from "react";
import { 
  RefreshCw, Calendar, Clock, Database, FileText, 
  UserCheck, AlertCircle, CheckCircle2, Loader2, ArrowRight
} from "lucide-react";
import { runManualSync, runIncrementalSync, fetchSyncLogs } from "./actions";
import { useEffect } from "react";

export default function SyncPage() {
  const [dateFrom, setDateFrom] = useState("");
  const [syncFiles, setSyncFiles] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const loadLogs = async () => {
    const latestLogs = await fetchSyncLogs();
    setLogs(latestLogs);
  };

  useEffect(() => {
    loadLogs();
    const interval = setInterval(loadLogs, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, []);

  const handleSync = async (type: 'manual' | 'auto') => {
    setIsSyncing(true);
    setResults(null);
    try {
      const res = type === 'manual' 
        ? await runManualSync(dateFrom, undefined, syncFiles)
        : await runIncrementalSync();
      
      setResults(res);
      await loadLogs();
    } catch (error) {
      setResults({ success: false, error: String(error) });
    } finally {
      setIsSyncing(false);
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
