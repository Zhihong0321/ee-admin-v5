/**
 * ============================================================================
 * STANDARDIZED LOGGING MODULE
 * ============================================================================
 *
 * Provides consistent logging interface across the application.
 * Replaces inconsistent console.error/console.log usage.
 *
 * Features:
 * - Structured logging with levels (info, error, debug)
 * - Integrates with existing logSyncActivity() for audit trail
 * - Debug mode toggle via DEBUG_MODE environment variable
 * - Context object support for structured data
 *
 * Usage:
 *   import { LOG } from '@/lib/logging/standard';
 *
 *   LOG.info('Sync completed', { synced: 100, skipped: 5 });
 *   LOG.error('Sync failed', error, { invoiceId: '12345' });
 *   LOG.debug('Checking timestamp', { timestamp: '2026-01-19' });
 *
 * File: src/lib/logging/standard.ts
 */

import { logSyncActivity } from '@/lib/logger';

/**
 * Standardized logging interface
 */
export const LOG = {
  /**
   * Log informational messages
   * Always writes to sync log file and console
   *
   * @param message - Log message string
   * @param context - Optional structured data object
   */
  info: (message: string, context?: Record<string, any>) => {
    logSyncActivity(message, 'INFO');
    if (context) {
      console.log(`[INFO] ${message}`, context);
    } else {
      console.log(`[INFO] ${message}`);
    }
  },

  /**
   * Log error messages
   * Always writes to sync log file and console
   *
   * @param message - Error message string
   * @param error - Optional Error object or unknown value
   * @param context - Optional structured data object
   */
  error: (message: string, error?: Error | unknown, context?: Record<string, any>) => {
    logSyncActivity(message, 'ERROR');
    if (error || context) {
      console.error(`[ERROR] ${message}`, error, context);
    } else {
      console.error(`[ERROR] ${message}`);
    }
  },

  /**
   * Log debug messages
   * Only logs if DEBUG_MODE environment variable is 'true'
   * Useful for development troubleshooting without spamming production logs
   *
   * @param message - Debug message string
   * @param context - Optional structured data object
   */
  debug: (message: string, context?: Record<string, any>) => {
    // Only log debug if environment variable set
    if (process.env.DEBUG_MODE === 'true') {
      console.log(`[DEBUG] ${message}`, context || '');
    }
  },

  /**
   * Log warning messages
   * Writes to sync log file and console
   *
   * @param message - Warning message string
   * @param context - Optional structured data object
   */
  warn: (message: string, context?: Record<string, any>) => {
    logSyncActivity(message, 'ERROR'); // LogSyncActivity doesn't have WARN level, use ERROR
    if (context) {
      console.warn(`[WARN] ${message}`, context);
    } else {
      console.warn(`[WARN] ${message}`);
    }
  }
};

/**
 * Type for structured log context
 */
export interface LogContext extends Record<string, any> {
  [key: string]: any;
}
