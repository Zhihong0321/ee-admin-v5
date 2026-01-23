/**
 * ============================================================================
 * FILE MIGRATION FORM COMPONENT
 * ============================================================================
 *
 * Form for Bubble file migration with progress tracking.
 *
 * File: src/app/sync/components/forms/FileMigrationForm.tsx
 */

import { useState, useEffect } from "react";
import { FolderOpen, FileDown, RefreshCw, Activity, File, Zap, Database } from "lucide-react";

interface FileMigrationFormProps {
  isMigrating: boolean;
  dateFrom: string;
  migrationStats: any;
  migrationProgress: any;
  onDateFromChange: (value: string) => void;
  onStartMigration: () => void;
  onScanStats: () => void;
}

export function FileMigrationForm({
  isMigrating,
  dateFrom,
  migrationStats,
  migrationProgress,
  onDateFromChange,
  onStartMigration,
  onScanStats,
}: FileMigrationFormProps) {
  return (
    <div className="card overflow-hidden bg-gradient-to-br from-green-900 via-green-800 to-green-900 text-white shadow-elevation-lg">
      <div className="p-6 border-b border-white/10">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-red-500/20 rounded-xl backdrop-blur-md border border-red-500/30">
              <FolderOpen className="h-6 w-6 text-red-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold">Bubble Decommission: File Migration</h3>
              <p className="text-green-200 text-sm">Migrate ALL files from Bubble to Railway storage before shutdown</p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Date Filter Input */}
            <div className="flex items-center gap-2">
              <label className="text-[10px] uppercase font-bold text-green-300">From Date:</label>
              <input
                type="date"
                className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                value={dateFrom}
                onChange={(e) => onDateFromChange(e.target.value)}
                disabled={isMigrating}
              />
              {dateFrom && (
                <button
                  onClick={() => onDateFromChange('')}
                  className="text-xs text-green-300 hover:text-white underline"
                  disabled={isMigrating}
                >
                  Clear
                </button>
              )}
            </div>

            {migrationStats && (
              <div className="px-4 py-2 bg-white/5 rounded-xl border border-white/10 text-center">
                <p className="text-[10px] uppercase font-bold text-green-300 tracking-wider">Files to Migrate</p>
                <p className="text-2xl font-bold text-white">{migrationStats.totalFiles}</p>
              </div>
            )}

            {!isMigrating && (
              <button
                onClick={onStartMigration}
                disabled={!migrationStats || migrationStats.totalFiles === 0}
                className="btn-primary bg-red-600 hover:bg-red-500 border-none flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FileDown className="h-4 w-4" />
                Start Full Migration
              </button>
            )}

            <button
              onClick={onScanStats}
              disabled={isMigrating}
              className="btn-secondary bg-white/5 border-white/10 text-white hover:bg-white/10 flex items-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Scan
            </button>
          </div>
        </div>
      </div>

      {/* Migration Progress */}
      {isMigrating && migrationProgress && (
        <div className="p-6 bg-black/20 border-b border-white/5">
          <div className="space-y-4">
            {/* Progress Bar */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-white flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Overall Progress
                </p>
                <p className="text-sm font-bold text-green-400">
                  {migrationProgress.totalFiles > 0
                    ? Math.round((migrationProgress.completedFiles / migrationProgress.totalFiles) * 100)
                    : 0}%
                </p>
              </div>
              <div className="h-4 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all duration-300"
                  style={{
                    width: `${migrationProgress.totalFiles > 0
                      ? (migrationProgress.completedFiles / migrationProgress.totalFiles) * 100
                      : 0}%`
                  }}
                />
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="text-green-400 font-semibold">
                  ✓ {migrationProgress.completedFiles} migrated
                </span>
                <span className={migrationProgress.failedFiles > 0 ? 'text-red-400' : 'text-green-300'}>
                  ✗ {migrationProgress.failedFiles} failed
                </span>
                <span className="text-green-300">
                  → {migrationProgress.totalFiles - migrationProgress.completedFiles - migrationProgress.failedFiles} remaining
                </span>
              </div>
            </div>

            {/* Current File & Speed */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-white/5 rounded-xl space-y-2">
                <p className="text-[10px] uppercase font-bold text-green-300 tracking-wider flex items-center gap-2">
                  <File className="h-3 w-3" />
                  Currently Downloading
                </p>
                {migrationProgress.currentFile ? (
                  <>
                    <p className="text-sm font-medium text-white truncate">{migrationProgress.currentFile}</p>
                  </>
                ) : (
                  <p className="text-sm text-green-200">Initializing...</p>
                )}
              </div>

              <div className="p-4 bg-white/5 rounded-xl space-y-2">
                <p className="text-[10px] uppercase font-bold text-green-300 tracking-wider flex items-center gap-2">
                  <Zap className="h-3 w-3" />
                  Download Speed
                </p>
                {migrationProgress.downloadSpeed ? (
                  <p className="text-lg font-bold text-green-400">{migrationProgress.downloadSpeed}</p>
                ) : (
                  <p className="text-sm text-green-200">Calculating...</p>
                )}
              </div>
            </div>

            {/* Recent Activity */}
            {migrationProgress.details && migrationProgress.details.length > 0 && (
              <div className="pt-4 border-t border-white/5">
                <p className="text-[10px] uppercase font-bold text-green-300 tracking-wider mb-3">Recent Activity</p>
                <div className="bg-black/30 rounded-lg p-3 h-24 overflow-y-auto space-y-1">
                  {migrationProgress.details.slice(-8).map((detail: string, idx: number) => (
                    <p key={idx} className="text-xs font-mono text-green-100 truncate">
                      {detail}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Breakdown by Table */}
      {migrationStats && !isMigrating && (
        <div className="p-6">
          <p className="text-[10px] uppercase font-bold text-green-300 tracking-wider mb-4 flex items-center gap-2">
            <Database className="h-3 w-3" />
            Files by Table (Click "Scan" to refresh)
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {Object.entries(migrationStats.byTable).map(([table, count]: [string, any]) => (
              <div
                key={table}
                className="p-3 bg-white/5 rounded-lg border border-white/5 hover:border-green-500/30 transition-all"
              >
                <p className="text-[10px] uppercase font-bold text-green-300 truncate">{table}</p>
                <p className="text-xl font-bold text-white">{count}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
