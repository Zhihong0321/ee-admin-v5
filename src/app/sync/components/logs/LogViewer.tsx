/**
 * ============================================================================
 * LOG VIEWER COMPONENT
 * ============================================================================
 *
 * Displays sync logs with clear functionality.
 *
 * File: src/app/sync/components/logs/LogViewer.tsx
 */

import { Trash2, ScrollText, Loader2 } from "lucide-react";

interface LogViewerProps {
  logs: string[];
  isClearing: boolean;
  onClear: () => void;
}

export function LogViewer({ logs, isClearing, onClear }: LogViewerProps) {
  return (
    <div className="card bg-white">
      <div className="p-6 border-b border-secondary-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-secondary-100 rounded-lg">
              <ScrollText className="h-5 w-5 text-secondary-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-secondary-900">Sync Logs</h3>
              <p className="text-secondary-500 text-sm">Real-time sync activity log</p>
            </div>
          </div>

          <button
            onClick={onClear}
            disabled={isClearing}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isClearing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Clearing...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                Clear Logs
              </>
            )}
          </button>
        </div>
      </div>

      <div className="p-6">
        {logs.length === 0 ? (
          <div className="text-center py-12 text-secondary-400">
            <ScrollText className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No sync logs yet</p>
            <p className="text-sm">Logs will appear here as you run sync operations</p>
          </div>
        ) : (
          <div className="bg-secondary-900 rounded-lg p-4 h-96 overflow-y-auto font-mono text-sm">
            {logs.map((log, idx) => (
              <div
                key={idx}
                className={`mb-1 ${log.includes('Error') ? 'text-red-400' : log.includes('Success') ? 'text-green-400' : 'text-secondary-300'}`}
              >
                <span className="text-secondary-500 mr-2">[{idx + 1}]</span>
                {log}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
