/**
 * ============================================================================
 * PROGRESS TRACKER COMPONENT
 * ============================================================================
 *
 * Displays real-time sync progress with category breakdown and percentage.
 *
 * File: src/app/sync/components/progress/ProgressTracker.tsx
 */

import { Activity, CheckCircle2, XCircle, Loader2 } from "lucide-react";

interface SyncProgress {
  status: 'running' | 'completed' | 'error';
  category?: string;
  details?: string[];
  current?: number;
  total?: number;
  percentage?: number;
}

interface ProgressTrackerProps {
  progress: SyncProgress | null;
  title?: string;
}

export function ProgressTracker({ progress, title = "Sync Progress" }: ProgressTrackerProps) {
  if (!progress) {
    return (
      <div className="card bg-secondary-50 border border-secondary-200">
        <div className="p-6 text-center text-secondary-400">
          <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No active sync operation</p>
        </div>
      </div>
    );
  }

  const percentage = progress.percentage || (progress.current && progress.total
    ? Math.round((progress.current / progress.total) * 100)
    : 0);

  return (
    <div className="card bg-white">
      <div className="p-6 border-b border-secondary-200">
        <h3 className="text-lg font-semibold text-secondary-900 flex items-center gap-2">
          {progress.status === 'running' && (
            <Loader2 className="h-5 w-5 text-primary-600 animate-spin" />
          )}
          {progress.status === 'completed' && (
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          )}
          {progress.status === 'error' && (
            <XCircle className="h-5 w-5 text-red-600" />
          )}
          {title}
        </h3>
      </div>

      <div className="p-6 space-y-4">
        {/* Status Badge */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-secondary-700">Status</span>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
            progress.status === 'running'
              ? 'bg-blue-100 text-blue-700'
              : progress.status === 'completed'
              ? 'bg-green-100 text-green-700'
              : 'bg-red-100 text-red-700'
          }`}>
            {progress.status.toUpperCase()}
          </span>
        </div>

        {/* Category */}
        {progress.category && (
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-secondary-700">Category</span>
            <span className="text-sm text-secondary-600">{progress.category}</span>
          </div>
        )}

        {/* Progress Bar */}
        {progress.total && (
          <div>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="font-medium text-secondary-700">Progress</span>
              <span className="text-secondary-600">
                {progress.current} / {progress.total} ({percentage}%)
              </span>
            </div>
            <div className="w-full bg-secondary-200 rounded-full h-2">
              <div
                className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
        )}

        {/* Details */}
        {progress.details && progress.details.length > 0 && (
          <div>
            <span className="text-sm font-medium text-secondary-700 block mb-2">Details</span>
            <ul className="space-y-1">
              {progress.details.slice(0, 5).map((detail, idx) => (
                <li key={idx} className="text-xs text-secondary-600 flex items-start gap-2">
                  <span className="text-primary-600 mt-0.5">•</span>
                  {detail}
                </li>
              ))}
              {progress.details.length > 5 && (
                <li className="text-xs text-secondary-400 italic">
                  ...and {progress.details.length - 5} more
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
