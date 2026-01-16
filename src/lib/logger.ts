import fs from 'fs';
import path from 'path';

const LOG_DIR = '/storage/logs';
const SYNC_LOG_PATH = path.join(LOG_DIR, 'sync.log');

export function logSyncActivity(message: string, type: 'INFO' | 'ERROR' | 'CRON' = 'INFO') {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${type}] ${message}\n`;

  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
    fs.appendFileSync(SYNC_LOG_PATH, logEntry);
    console.log(logEntry.trim());
  } catch (err) {
    console.error('Failed to write to sync log:', err);
  }
}

export function getLatestLogs(limit = 50): string[] {
  try {
    if (!fs.existsSync(SYNC_LOG_PATH)) return ['No logs found yet.'];
    const content = fs.readFileSync(SYNC_LOG_PATH, 'utf8');
    const lines = content.trim().split('\n');
    return lines.slice(-limit).reverse();
  } catch (err) {
    return [`Error reading logs: ${err}`];
  }
}

export function clearLogs(): { success: boolean; message: string } {
  try {
    if (!fs.existsSync(SYNC_LOG_PATH)) {
      return { success: true, message: 'No log file to delete.' };
    }
    fs.unlinkSync(SYNC_LOG_PATH);
    return { success: true, message: 'Logs cleared successfully.' };
  } catch (err) {
    return { success: false, message: `Failed to clear logs: ${err}` };
  }
}