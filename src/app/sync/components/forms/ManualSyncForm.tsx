/**
 * ============================================================================
 * MANUAL SYNC FORM COMPONENT
 * ============================================================================
 *
 * Form component for manual sync operations.
 * Handles date range selection and file sync toggle.
 *
 * File: src/app/sync/components/forms/ManualSyncForm.tsx
 */

import { useState } from "react";
import { Calendar, FileText } from "lucide-react";

interface ManualSyncFormProps {
  dateFrom: string;
  syncFiles: boolean;
  onDateFromChange: (value: string) => void;
  onSyncFilesChange: (value: boolean) => void;
  onSync: () => void;
  isSyncing: boolean;
}

export function ManualSyncForm({
  dateFrom,
  syncFiles,
  onDateFromChange,
  onSyncFilesChange,
  onSync,
  isSyncing,
}: ManualSyncFormProps) {
  return (
    <div className="card bg-white">
      <div className="p-6 border-b border-secondary-200">
        <h2 className="text-xl font-semibold text-secondary-900 flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary-600" />
          Manual Sync
        </h2>
        <p className="text-secondary-500 text-sm mt-1">
          Sync all data from Bubble with optional date range filtering
        </p>
      </div>

      <div className="p-6 space-y-4">
        {/* Date Range */}
        <div>
          <label className="block text-sm font-medium text-secondary-700 mb-1">
            From Date (Optional)
          </label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => onDateFromChange(e.target.value)}
            className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            disabled={isSyncing}
          />
          <p className="text-xs text-secondary-400 mt-1">
            Leave empty to sync all history
          </p>
        </div>

        {/* File Sync Toggle */}
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="syncFiles"
            checked={syncFiles}
            onChange={(e) => onSyncFilesChange(e.target.checked)}
            className="w-4 h-4 text-primary-600 focus:ring-primary-500 border-secondary-300 rounded"
            disabled={isSyncing}
          />
          <label
            htmlFor="syncFiles"
            className="text-sm font-medium text-secondary-700 flex items-center gap-2"
          >
            <FileText className="h-4 w-4" />
            Download files with sync
          </label>
        </div>

        {/* Sync Button */}
        <button
          onClick={onSync}
          disabled={isSyncing}
          className="w-full py-2 px-4 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
        >
          {isSyncing ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Syncing...
            </>
          ) : (
            <>
              <Calendar className="h-4 w-4" />
              Start Manual Sync
            </>
          )}
        </button>
      </div>
    </div>
  );
}
