import fs from 'fs';
import path from 'path';

const LOG_DIR = '/storage/logs';
const SYNC_LOG_PATH = path.join(LOG_DIR, 'sync.log');

// In-memory log buffer as fallback (for environments where file system doesn't persist)
const MEMORY_LOG_BUFFER: string[] = [];
const MAX_MEMORY_LOGS = 500;

export function logSyncActivity(message: string, type: 'INFO' | 'ERROR' | 'CRON' = 'INFO') {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${type}] ${message}`;

  // Always add to memory buffer
  MEMORY_LOG_BUFFER.push(logEntry);
  if (MEMORY_LOG_BUFFER.length > MAX_MEMORY_LOGS) {
    MEMORY_LOG_BUFFER.shift(); // Remove oldest
  }

  // Also try to write to file
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
    fs.appendFileSync(SYNC_LOG_PATH, logEntry + '\n');
  } catch (err) {
    // File write failed, but we still have memory buffer
    console.error('Failed to write to sync log file (using memory buffer):', err);
  }

  // Always log to console
  console.log(logEntry);
}

export function getLatestLogs(limit = 50): string[] {
  // Try reading from file first
  try {
    if (fs.existsSync(SYNC_LOG_PATH)) {
      const content = fs.readFileSync(SYNC_LOG_PATH, 'utf8');
      const lines = content.trim().split('\n');
      const fileLogs = lines.slice(-limit).reverse();

      // If file has logs, use them
      if (fileLogs.length > 0 && fileLogs[0] !== '') {
        return fileLogs;
      }
    }
  } catch (err) {
    console.error('Failed to read sync log file (using memory buffer):', err);
  }

  // Fallback to memory buffer
  if (MEMORY_LOG_BUFFER.length > 0) {
    return MEMORY_LOG_BUFFER.slice(-limit).reverse();
  }

  return ['No logs found yet.'];
}

export function clearLogs(): { success: boolean; message: string } {
  // Clear memory buffer
  MEMORY_LOG_BUFFER.length = 0;

  // Try to clear file
  try {
    if (fs.existsSync(SYNC_LOG_PATH)) {
      fs.unlinkSync(SYNC_LOG_PATH);
    }
    return { success: true, message: 'Logs cleared successfully.' };
  } catch (err) {
    // Memory buffer is cleared even if file delete fails
    return { success: true, message: 'Memory logs cleared (file delete failed).' };
  }
}