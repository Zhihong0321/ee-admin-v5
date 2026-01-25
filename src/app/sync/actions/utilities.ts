"use server";

/**
 * ============================================================================
 * SYNC UTILITY OPERATIONS
 * ============================================================================
 *
 * Utility functions for sync operations including logging, file URL patching,
 * and other maintenance tasks.
 *
 * Functions:
 * - fetchSyncLogs: Retrieve recent sync activity logs
 * - clearSyncLogs: Clear all sync logs from file system
 * - patchFileUrlsToAbsolute: Convert relative URLs to absolute URLs
 * - patchChineseFilenames: Fix non-ASCII filenames
 *
 * File: src/app/sync/actions/utilities.ts
 */

import { revalidatePath } from "next/cache";
import { logSyncActivity, getLatestLogs, clearLogs } from "@/lib/logger";
import { db } from "@/lib/db";
import { users, payments, submitted_payments, sedaRegistration, invoice_templates } from "@/db/schema";
import { eq, isNotNull } from "drizzle-orm";
import fs from "fs";
import path from "path";

/**
 * ============================================================================
 * FUNCTION: fetchSyncLogs
 * ============================================================================
 *
 * INTENT (What & Why):
 * Retrieve the most recent sync activity logs for display in the UI.
 * Provides audit trail and debugging information for sync operations.
 *
 * INPUTS:
 * None (hardcoded to fetch 100 most recent logs)
 *
 * OUTPUTS:
 * @returns string[] - Array of log message strings (most recent last)
 *
 * EXECUTION ORDER (Step-by-step):
 * 1. Call getLatestLogs(100) from logger module
 * 2. Return logs array
 *
 * LOG FORMAT:
 * Each log entry is a string with format:
 * "[timestamp] [LEVEL] message"
 * Example: "[2026-01-19 10:30:00] [INFO] Manual Sync SUCCESS"
 *
 * EDGE CASES:
 * - No logs exist → Returns empty array []
 * - Log file corrupted → Returns partial logs or empty array
 *
 * SIDE EFFECTS:
 * - Reads from sync.log file on file system
 * - No database writes
 * - No cache revalidation
 *
 * DEPENDENCIES:
 * - Requires: getLatestLogs() from @/lib/logger
 * - Used by: src/app/sync/page.tsx (Log display)
 */
export async function fetchSyncLogs() {
  return getLatestLogs(100);
}

/**
 * ============================================================================
 * FUNCTION: clearSyncLogs
 * ============================================================================
 *
 * INTENT (What & Why):
 * Delete the sync.log file to clear all accumulated logs. Useful for
 * debugging or starting fresh log file.
 *
 * INPUTS:
 * None
 *
 * OUTPUTS:
 * @returns { success: boolean, message?: string, error?: string }
 *
 * EXECUTION ORDER (Step-by-step):
 * 1. Call clearLogs() from logger module
 * 2. Return result
 *
 * WARNING:
 * This operation cannot be undone. All historical logs will be permanently
 * deleted from file system.
 *
 * EDGE CASES:
 * - Log file doesn't exist → Returns success: true
 * - File permission error → Returns success: false with error
 *
 * SIDE EFFECTS:
 * - Deletes sync.log file from file system
 * - No database writes
 * - No cache revalidation
 *
 * DEPENDENCIES:
 * - Requires: clearLogs() from @/lib/logger
 * - Used by: src/app/sync/page.tsx (Clear Logs button)
 */
export async function clearSyncLogs() {
  logSyncActivity('Clearing logs...', 'INFO');

  try {
    const result = clearLogs();

    if (result.success) {
      return { success: true, message: result.message };
    } else {
      return { success: false, error: result.message };
    }
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * ============================================================================
 * FUNCTION: patchFileUrlsToAbsolute
 * ============================================================================
 *
 * INTENT (What & Why):
 * Convert all relative /storage/ URLs to absolute https://admin.atap.solar/api/files/ URLs.
 * Fixes cross-subdomain file access issues where other apps cannot access files
 * with relative URLs.
 *
 * PROBLEM:
 * - Old URL: /storage/seda/ic_copies/file.jpg (relative)
 * - New URL: https://admin.atap.solar/api/files/seda/ic_copies/file.jpg (absolute)
 * - Other apps on different subdomains can't resolve relative URLs
 *
 * INPUTS:
 * None (operates on all file URL fields across all tables)
 *
 * OUTPUTS:
 * @returns {
 *   success: boolean,
 *   totalUpdated: number,
 *   updates: string[],
 *   message: string
 * }
 *
 * EXECUTION ORDER (Step-by-step):
 * 1. Define all file fields across all tables (SEDA, Users, Payments, Templates)
 * 2. For each table and field:
 *    a. Fetch records where field IS NOT NULL
 *    b. Check if URL contains '/storage/'
 *    c. Extract path after '/storage/'
 *    d. Rebuild URL with absolute base URL
 *    e. Update if URL changed
 * 3. Return statistics
 *
 * TABLES AND FIELDS:
 * - seda_registration: customer_signature, ic_copy_front, ic_copy_back, tnb_bill_1/2/3,
 *   nem_cert, mykad_pdf, property_ownership_prove, roof_images (array),
 *   site_images (array), drawing_pdf_system (array), drawing_system_actual (array),
 *   drawing_engineering_seda_pdf (array)
 * - user: profile_picture
 * - payment: attachment (array)
 * - submitted_payment: attachment (array)
 * - invoice_template: logo_url
 *
 * URL TRANSFORMATION:
 * /storage/seda/ic_copies/file.jpg
 * → https://admin.atap.solar/api/files/seda/ic_copies/file.jpg
 *
 * EDGE CASES:
 * - URL already absolute → Skipped (no change)
 * - URL doesn't contain /storage/ → Skipped
 * - Field is NULL → Skipped
 * - Array fields → Process each element individually
 *
 * SIDE EFFECTS:
 * - Updates file URL fields in PostgreSQL (all tables with file fields)
 * - Calls logSyncActivity() for audit trail
 * - Calls revalidatePath() to refresh Next.js cache
 *
 * DEPENDENCIES:
 * - Requires: db.select(), db.update() for multiple tables
 * - Used by: src/app/sync/page.tsx (Patch File URLs button)
 */
export async function patchFileUrlsToAbsolute() {
  logSyncActivity(`Starting 'Patch File URLs to Absolute' job...`, 'INFO');

  const BASE_URL = 'https://admin.atap.solar';

  try {
    let totalUpdated = 0;
    const updates: string[] = [];

    // ============================================================================
    // Define all file fields across all tables
    // Note: We need to specify which fields are arrays vs single
    // ============================================================================
    const fileFieldsConfig = [
      // SEDA Registration - Multiple file fields
      {
        table: sedaRegistration,
        tableName: 'seda_registration',
        idField: 'id',
        fields: [
          { name: 'customer_signature', type: 'single' },
          { name: 'ic_copy_front', type: 'single' },
          { name: 'ic_copy_back', type: 'single' },
          { name: 'tnb_bill_1', type: 'single' },
          { name: 'tnb_bill_2', type: 'single' },
          { name: 'tnb_bill_3', type: 'single' },
          { name: 'nem_cert', type: 'single' },
          { name: 'mykad_pdf', type: 'single' },
          { name: 'property_ownership_prove', type: 'single' },
          { name: 'roof_images', type: 'array' },
          { name: 'site_images', type: 'array' },
          { name: 'drawing_pdf_system', type: 'array' },
          { name: 'drawing_system_actual', type: 'array' },
          { name: 'drawing_engineering_seda_pdf', type: 'array' },
        ]
      },
      // Users - Profile pictures
      {
        table: users,
        tableName: 'user',
        idField: 'id',
        fields: [{ name: 'profile_picture', type: 'single' }]
      },
      // Payments - Attachments (array)
      {
        table: payments,
        tableName: 'payment',
        idField: 'id',
        fields: [{ name: 'attachment', type: 'array' }]
      },
      // Submitted Payments - Attachments (array)
      {
        table: submitted_payments,
        tableName: 'submitted_payment',
        idField: 'id',
        fields: [{ name: 'attachment', type: 'array' }]
      },
      // Invoice Templates - Logos
      {
        table: invoice_templates,
        tableName: 'invoice_template',
        idField: 'id',
        fields: [{ name: 'logo_url', type: 'single' }]
      },
    ];

    // ============================================================================
    // Process each table and field
    // ============================================================================
    for (const config of fileFieldsConfig) {
      logSyncActivity(`Scanning ${config.tableName}...`, 'INFO');

      for (const fieldConfig of config.fields) {
        const fieldName = fieldConfig.name;
        const fieldType = fieldConfig.type;

        try {
          if (fieldType === 'array') {
            // Array field - process in memory
            const records = await db
              .select({
                id: (config.table as any)[config.idField],
                urls: (config.table as any)[fieldName]
              })
              .from(config.table)
              .where(isNotNull((config.table as any)[fieldName]));

            let fieldUpdatedCount = 0;

            for (const record of records) {
              if (Array.isArray(record.urls)) {
                const updatedUrls = record.urls.map((url: string) => {
                  // If URL contains /storage/, extract path after /storage/ and rebuild full URL
                  if (url && url.includes('/storage/')) {
                    // Extract the path after /storage/ (e.g., "seda/ic_copies/file.jpg")
                    const storagePath = url.split('/storage/').pop() || '';
                    if (storagePath) {
                      return `${BASE_URL}/api/files/${storagePath}`;
                    }
                  }
                  return url;
                });

                // Check if any URL changed
                const hasChanges = updatedUrls.some((newUrl, idx) => newUrl !== record.urls[idx]);

                if (hasChanges) {
                  await db
                    .update(config.table)
                    .set({ [fieldName]: updatedUrls })
                    .where(eq((config.table as any)[config.idField], record.id));
                  totalUpdated++;
                  fieldUpdatedCount++;
                }
              }
            }

            if (fieldUpdatedCount > 0) {
              updates.push(`${config.tableName}.${fieldName}: ${fieldUpdatedCount} records`);
              logSyncActivity(`Updated ${fieldUpdatedCount} records in ${config.tableName}.${fieldName}`, 'INFO');
            }
          } else {
            // Single field - process in memory
            const records = await db
              .select({
                id: (config.table as any)[config.idField],
                url: (config.table as any)[fieldName]
              })
              .from(config.table)
              .where(isNotNull((config.table as any)[fieldName]));

            let fieldUpdatedCount = 0;

            for (const record of records) {
              const url = record.url as string | null;

              // If URL contains /storage/, extract path after /storage/ and rebuild full URL
              if (url && url.includes('/storage/')) {
                // Extract the path after /storage/ (e.g., "seda/ic_copies/file.jpg")
                const storagePath = url.split('/storage/').pop() || '';
                if (storagePath) {
                  const newUrl = `${BASE_URL}/api/files/${storagePath}`;

                  await db
                    .update(config.table)
                    .set({ [fieldName]: newUrl })
                    .where(eq((config.table as any)[config.idField], record.id));

                  totalUpdated++;
                  fieldUpdatedCount++;
                }
              }
            }

            if (fieldUpdatedCount > 0) {
              updates.push(`${config.tableName}.${fieldName}: ${fieldUpdatedCount} records`);
              logSyncActivity(`Updated ${fieldUpdatedCount} records in ${config.tableName}.${fieldName}`, 'INFO');
            }
          }
        } catch (error) {
          logSyncActivity(`Error patching ${config.tableName}.${fieldName}: ${String(error)}`, 'ERROR');
        }
      }
    }

    logSyncActivity(`Patch complete: ${totalUpdated} URL(s) updated`, 'INFO');

    revalidatePath("/sync");
    revalidatePath("/invoices");
    revalidatePath("/customers");

    return {
      success: true,
      totalUpdated,
      updates,
      message: `Successfully patched ${totalUpdated} file URL(s) to absolute URLs.\n\nUpdated:\n${updates.join('\n')}`
    };

  } catch (error) {
    logSyncActivity(`Patch File URLs CRASHED: ${String(error)}`, 'ERROR');
    return { success: false, error: String(error) };
  }
}

/**
 * ============================================================================
 * FUNCTION: patchChineseFilenames
 * ============================================================================
 *
 * INTENT (What & Why):
 * Fix files with non-ASCII characters (like Chinese) in their filenames.
 * Renames files on disk to use URL-encoded filenames and updates database URLs.
 * Ensures files can be accessed reliably regardless of encoding issues.
 *
 * PROBLEM:
 * - File on disk: /storage/sedæ/中文文件名.jpg (Chinese characters)
 * - Browser may not encode correctly → 404 error
 * - File system encoding issues → File not found
 *
 * SOLUTION:
 * - Rename: 中文文件名.jpg → %E4%B8%AD%E6%96%87%E6%96%87%E4%BB%B6%E5%90%8D.jpg
 * - Update database URL to new encoded filename
 * - Preserves file content, only changes filename
 *
 * INPUTS:
 * None (operates on all file URL fields across all tables)
 *
 * OUTPUTS:
 * @returns {
 *   success: boolean,
 *   totalPatched: number,
 *   totalSkipped: number,
 *   message: string
 * }
 *
 * EXECUTION ORDER (Step-by-step):
 * 1. Define all file fields across all tables
 * 2. For each table and field:
 *    a. Fetch records where field IS NOT NULL
 *    b. Extract filename from URL
 *    c. Check if filename has non-ASCII characters (> char code 127)
 *    d. If non-ASCII:
 *       i. Sanitize filename (URL-encode non-ASCII chars)
 *       ii. Rename file on disk
 *       iii. Update database URL
 *    e. If ASCII → Skip
 * 3. Return statistics
 *
 * SANITIZATION STRATEGY:
 * - Keep: a-z, A-Z, 0-9, space, hyphen, underscore, dot
 * - Encode: All other characters (using encodeURIComponent)
 * - Example: "文件.jpg" → "%E6%96%87%E4%BB%B6.jpg"
 *
 * FILESYSTEM OPERATIONS:
 * - Uses fs.renameSync() to rename files
 * - Preserves file content and permissions
 * - Skips if file doesn't exist on disk (logs warning)
 *
 * EDGE CASES:
 * - Filename already ASCII → Skipped
 * - File doesn't exist on disk → Logs warning, continues
 * - Rename fails (permissions) → Logs error, continues with old URL
 * - Array fields → Processes each element individually
 *
 * SIDE EFFECTS:
 * - Renames files on disk in /storage directory
 * - Updates file URL fields in PostgreSQL
 * - Calls logSyncActivity() for audit trail
 * - Calls revalidatePath() to refresh Next.js cache
 *
 * DEPENDENCIES:
 * - Requires: fs module, path module, db operations for multiple tables
 * - Used by: src/app/sync/page.tsx (Patch Chinese Filenames button)
 *
 * WARNING:
 * This operation renames files on disk. Ensure backups exist before running.
 * Operation is NOT reversible without manual file renaming.
 */
export async function patchChineseFilenames() {
  logSyncActivity(`Starting 'Patch Chinese Filenames' job...`, 'INFO');

  const STORAGE_ROOT = '/storage';
  const FILE_BASE_URL = process.env.FILE_BASE_URL || 'https://admin.atap.solar';

  /**
   * Check if a string contains non-ASCII characters
   */
  function hasNonASCII(str: string): boolean {
    for (let i = 0; i < str.length; i++) {
      if (str.charCodeAt(i) > 127) {
        return true;
      }
    }
    return false;
  }

  /**
   * Sanitize filename by URL-encoding non-ASCII characters
   */
  function sanitizeFilename(filename: string): string {
    const ext = path.extname(filename).split('?')[0];
    const baseName = path.basename(filename, ext).split('?')[0];

    let sanitizedBaseName = '';
    for (let i = 0; i < baseName.length; i++) {
      const char = baseName[i];
      const code = char.charCodeAt(0);

      // Allow: a-z, A-Z, 0-9, space, hyphen, underscore, dot
      if (
        (code >= 48 && code <= 57) ||  // 0-9
        (code >= 65 && code <= 90) ||  // A-Z
        (code >= 97 && code <= 122) || // a-z
        code === 32 || code === 45 || code === 46 || code === 95  // space, -, ., _
      ) {
        sanitizedBaseName += char;
      } else {
        // URL-encode non-ASCII characters
        sanitizedBaseName += encodeURIComponent(char);
      }
    }

    return sanitizedBaseName + ext;
  }

  /**
   * Extract filename from a file URL
   */
  function getFilenameFromUrl(url: string): string | null {
    if (!url) return null;

    // Remove base URL and /api/files prefix
    let relativePath = url.replace(FILE_BASE_URL, '');
    if (relativePath.startsWith('/api/files/')) {
      relativePath = relativePath.replace('/api/files/', '');
    } else if (relativePath.startsWith('/storage/')) {
      relativePath = relativePath.replace('/storage/', '');
    }

    return path.basename(relativePath);
  }

  try {
    let totalPatched = 0;
    let totalSkipped = 0;

    // ============================================================================
    // Define all file fields across all tables
    // ============================================================================
    const fileFieldsConfig = [
      // SEDA Registration - Multiple file fields
      {
        table: sedaRegistration,
        tableName: 'seda_registration',
        idField: 'id',
        fields: [
          { name: 'customer_signature', type: 'single' },
          { name: 'ic_copy_front', type: 'single' },
          { name: 'ic_copy_back', type: 'single' },
          { name: 'tnb_bill_1', type: 'single' },
          { name: 'tnb_bill_2', type: 'single' },
          { name: 'tnb_bill_3', type: 'single' },
          { name: 'nem_cert', type: 'single' },
          { name: 'mykad_pdf', type: 'single' },
          { name: 'property_ownership_prove', type: 'single' },
          { name: 'roof_images', type: 'array' },
          { name: 'site_images', type: 'array' },
          { name: 'drawing_pdf_system', type: 'array' },
          { name: 'drawing_system_actual', type: 'array' },
          { name: 'drawing_engineering_seda_pdf', type: 'array' },
        ]
      },
      // Users - Profile pictures
      {
        table: users,
        tableName: 'user',
        idField: 'id',
        fields: [{ name: 'profile_picture', type: 'single' }]
      },
      // Payments - Attachments (array)
      {
        table: payments,
        tableName: 'payment',
        idField: 'id',
        fields: [{ name: 'attachment', type: 'array' }]
      },
      // Submitted Payments - Attachments (array)
      {
        table: submitted_payments,
        tableName: 'submitted_payment',
        idField: 'id',
        fields: [{ name: 'attachment', type: 'array' }]
      },
      // Invoice Templates - Logos
      {
        table: invoice_templates,
        tableName: 'invoice_template',
        idField: 'id',
        fields: [{ name: 'logo_url', type: 'single' }]
      },
    ];

    // ============================================================================
    // Process each table and field
    // ============================================================================
    for (const config of fileFieldsConfig) {
      logSyncActivity(`Scanning ${config.tableName}...`, 'INFO');

      for (const fieldConfig of config.fields) {
        const fieldName = fieldConfig.name;
        const fieldType = fieldConfig.type;

        try {
          if (fieldType === 'array') {
            // Array field - process in memory
            const records = await db
              .select({
                id: (config.table as any)[config.idField],
                urls: (config.table as any)[fieldName]
              })
              .from(config.table)
              .where(isNotNull((config.table as any)[fieldName]));

            for (const record of records) {
              if (Array.isArray(record.urls)) {
                const newUrls: string[] = [];
                let hasChanges = false;

                for (const url of record.urls) {
                  const filename = getFilenameFromUrl(url);

                  if (!filename || !hasNonASCII(filename)) {
                    newUrls.push(url);
                    totalSkipped++;
                    continue;
                  }

                  logSyncActivity(`Found non-ASCII filename: ${filename}`, 'INFO');

                  // Get the full file path
                  let relativePath = url.replace(FILE_BASE_URL, '');
                  if (relativePath.startsWith('/api/files/')) {
                    relativePath = relativePath.replace('/api/files/', '');
                  } else if (relativePath.startsWith('/storage/')) {
                    relativePath = relativePath.replace('/storage/', '');
                  }

                  const oldPath = path.join(STORAGE_ROOT, relativePath);
                  const dir = path.dirname(oldPath);

                  // Generate new sanitized filename
                  const sanitizedFilename = sanitizeFilename(filename);
                  const newPath = path.join(dir, sanitizedFilename);

                  // Rename file on disk if it exists
                  if (fs.existsSync(oldPath)) {
                    try {
                      fs.renameSync(oldPath, newPath);
                      logSyncActivity(`✓ Renamed: ${filename} → ${sanitizedFilename}`, 'INFO');
                    } catch (err: any) {
                      logSyncActivity(`✗ Failed to rename: ${(err as Error).message}`, 'ERROR');
                      newUrls.push(url);
                      continue;
                    }
                  } else {
                    logSyncActivity(`⚠ File not found on disk: ${oldPath}`, 'INFO');
                  }

                  // Generate new URL
                  const newRelativePath = relativePath.replace(filename, sanitizedFilename);
                  const newUrl = `${FILE_BASE_URL}/api/files/${newRelativePath}`;
                  newUrls.push(newUrl);
                  hasChanges = true;
                  totalPatched++;
                }

                // Update database if changes were made
                if (hasChanges) {
                  await db
                    .update(config.table)
                    .set({ [fieldName]: newUrls })
                    .where(eq((config.table as any)[config.idField], record.id));

                  logSyncActivity(`✓ Updated database record ${record.id}`, 'INFO');
                }
              }
            }
          } else {
            // Single field - process in memory
            const records = await db
              .select({
                id: (config.table as any)[config.idField],
                url: (config.table as any)[fieldName]
              })
              .from(config.table)
              .where(isNotNull((config.table as any)[fieldName]));

            for (const record of records) {
              const url = record.url as string;
              const filename = getFilenameFromUrl(url);

              if (!filename || !hasNonASCII(filename)) {
                totalSkipped++;
                continue;
              }

              logSyncActivity(`Found non-ASCII filename: ${filename}`, 'INFO');

              // Get the full file path
              let relativePath = url.replace(FILE_BASE_URL, '');
              if (relativePath.startsWith('/api/files/')) {
                relativePath = relativePath.replace('/api/files/', '');
              } else if (relativePath.startsWith('/storage/')) {
                relativePath = relativePath.replace('/storage/', '');
              }

              const oldPath = path.join(STORAGE_ROOT, relativePath);
              const dir = path.dirname(oldPath);

              // Generate new sanitized filename
              const sanitizedFilename = sanitizeFilename(filename);
              const newPath = path.join(dir, sanitizedFilename);

              // Rename file on disk if it exists
              if (fs.existsSync(oldPath)) {
                try {
                  fs.renameSync(oldPath, newPath);
                  logSyncActivity(`✓ Renamed: ${filename} → ${sanitizedFilename}`, 'INFO');
                } catch (err: any) {
                  logSyncActivity(`✗ Failed to rename: ${(err as Error).message}`, 'ERROR');
                  continue;
                }
              } else {
                logSyncActivity(`⚠ File not found on disk: ${oldPath}`, 'INFO');
              }

              // Generate new URL
              const newRelativePath = relativePath.replace(filename, sanitizedFilename);
              const newUrl = `${FILE_BASE_URL}/api/files/${newRelativePath}`;

              // Update database
              await db
                .update(config.table)
                .set({ [fieldName]: newUrl })
                .where(eq((config.table as any)[config.idField], record.id));

              logSyncActivity(`✓ Updated database record ${record.id}`, 'INFO');
              totalPatched++;
            }
          }
        } catch (error) {
          logSyncActivity(`Error patching ${config.tableName}.${fieldName}: ${String(error)}`, 'ERROR');
        }
      }
    }

    logSyncActivity(`Chinese filename patching complete: ${totalPatched} patched, ${totalSkipped} skipped`, 'INFO');

    revalidatePath("/sync");
    revalidatePath("/invoices");
    revalidatePath("/customers");

    return {
      success: true,
      totalPatched,
      totalSkipped,
      message: `Successfully patched ${totalPatched} file(s) with Chinese characters.\nSkipped ${totalSkipped} file(s).`
    };

  } catch (error) {
    logSyncActivity(`Patch Chinese Filenames CRASHED: ${String(error)}`, 'ERROR');
    return { success: false, error: String(error) };
  }
}
