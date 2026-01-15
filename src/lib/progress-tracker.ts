/**
 * Real-time progress tracking for file sync operations
 */

export interface FileSyncProgress {
  sessionId: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  category: string | null;
  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
  currentFile: string | null;
  downloadSpeed: string | null; // e.g., "1.5 MB/s"
  currentDownloadSpeed: number; // bytes per second
  lastUpdateTime: number;
  details: string[];
  categoriesCompleted: string[];
  categoriesTotal: string[];
  currentFileSize: number | null;
  downloadedBytes: number | null;
}

// In-memory progress store (in production, consider using Redis or DB)
const progressStore = new Map<string, FileSyncProgress>();

export function createProgressSession(sessionId: string): FileSyncProgress {
  const progress: FileSyncProgress = {
    sessionId,
    status: 'idle',
    category: null,
    totalFiles: 0,
    completedFiles: 0,
    failedFiles: 0,
    currentFile: null,
    downloadSpeed: null,
    currentDownloadSpeed: 0,
    lastUpdateTime: Date.now(),
    details: [],
    categoriesCompleted: [],
    categoriesTotal: [],
    currentFileSize: null,
    downloadedBytes: null,
  };
  progressStore.set(sessionId, progress);
  return progress;
}

export function getProgress(sessionId: string): FileSyncProgress | undefined {
  return progressStore.get(sessionId);
}

export function updateProgress(sessionId: string, updates: Partial<FileSyncProgress>): void {
  const progress = progressStore.get(sessionId);
  if (progress) {
    Object.assign(progress, updates);
    progress.lastUpdateTime = Date.now();
  }
}

export function deleteProgress(sessionId: string): void {
  progressStore.delete(sessionId);
}

export function getAllSessions(): string[] {
  return Array.from(progressStore.keys());
}
