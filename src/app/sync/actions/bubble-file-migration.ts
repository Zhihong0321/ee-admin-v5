/**
 * ============================================================================
 * BUBBLE FILE MIGRATION - COMPREHENSIVE SOLUTION
 * ============================================================================
 *
 * This module provides a comprehensive file migration system that:
 * 1. Scans database for all Bubble storage URLs
 * 2. Downloads files from Bubble to app's attached storage
 * 3. Rewrites URLs in PostgreSQL to absolute local URLs
 * 4. Auto-sanitizes Chinese/non-ASCII filenames during download
 *
 * File: src/app/sync/actions/bubble-file-migration.ts
 */

"use server";

import { db } from "@/lib/db";
import { sedaRegistration, users, payments, submitted_payments, invoice_templates } from "@/db/schema";
import { eq, and, isNotNull, gte } from "drizzle-orm";
import { logSyncActivity } from "@/lib/logger";
import { revalidatePath } from "next/cache";
import path from "path";
import fs from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";

const STORAGE_ROOT = '/storage';
const FILE_BASE_URL = process.env.FILE_BASE_URL || 'https://admin.atap.solar';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if URL is from Bubble storage (external)
 */
function isBubbleUrl(url: string | null): boolean {
  if (!url) return false;
  // Already migrated to local storage
  if (url.startsWith('/storage/')) return false;
  if (url.startsWith('/api/files/')) return false;
  if (url.startsWith(FILE_BASE_URL)) return false;
  // External URLs (Bubble storage)
  if (url.includes('s3.amazonaws.com')) return true;
  if (url.includes('bubble.io')) return true;
  if (url.includes('bubbleapps.io')) return true;
  if (url.startsWith('//s3.')) return true;
  if (url.startsWith('http://') || url.startsWith('https://')) return true;
  return false;
}

/**
 * Check if filename contains non-ASCII characters
 */
function hasNonASCII(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) > 127) return true;
  }
  return false;
}

/**
 * Sanitize filename - URL-encode non-ASCII characters
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
 * Extract filename from URL
 */
function getFilenameFromUrl(url: string): string {
  try {
    const urlObj = new URL(url.startsWith('//') ? 'https:' + url : url);
    const pathname = urlObj.pathname;
    return path.basename(pathname) || `file_${Date.now()}.dat`;
  } catch {
    return `file_${Date.now()}.dat`;
  }
}

/**
 * Generate safe, unique filename
 */
function generateFilename(originalUrl: string, recordId: number, index: number = 0): string {
  const timestamp = Date.now();
  const originalFilename = getFilenameFromUrl(originalUrl);
  const ext = path.extname(originalFilename).split('?')[0] || '.jpg';
  const baseName = path.basename(originalFilename, ext).split('?')[0];
  const safeBaseName = baseName.replace(/[^a-zA-Z0-9_\-]/g, '_').substring(0, 30);
  const suffix = index > 0 ? `_${index}` : '';
  const filename = `${recordId}_${safeBaseName}_${timestamp}${suffix}${ext}`;
  return sanitizeFilename(filename); // Auto-sanitize
}

/**
 * Download file from URL
 */
async function downloadFile(url: string, targetPath: string): Promise<number> {
  const fullUrl = url.startsWith('//') ? `https:${url}` : url;
  const response = await fetch(fullUrl);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  if (!response.body) throw new Error('Response body is empty');

  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // @ts-ignore
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(targetPath));
  return fs.statSync(targetPath).size;
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// ============================================================================
// FILE FIELDS CONFIGURATION
// ============================================================================

const FILE_FIELDS_CONFIG = [
  // SEDA Registration
  {
    table: sedaRegistration,
    tableName: 'seda_registration',
    idField: 'id',
    dateField: 'created_date',
    fields: [
      { name: 'customer_signature', type: 'single' as const, subfolder: 'seda/signatures' },
      { name: 'ic_copy_front', type: 'single' as const, subfolder: 'seda/ic_copies' },
      { name: 'ic_copy_back', type: 'single' as const, subfolder: 'seda/ic_copies' },
      { name: 'tnb_bill_1', type: 'single' as const, subfolder: 'seda/tnb_bills' },
      { name: 'tnb_bill_2', type: 'single' as const, subfolder: 'seda/tnb_bills' },
      { name: 'tnb_bill_3', type: 'single' as const, subfolder: 'seda/tnb_bills' },
      { name: 'nem_cert', type: 'single' as const, subfolder: 'seda/certificates' },
      { name: 'mykad_pdf', type: 'single' as const, subfolder: 'seda/mykad' },
      { name: 'property_ownership_prove', type: 'single' as const, subfolder: 'seda/ownership' },
      { name: 'roof_images', type: 'array' as const, subfolder: 'seda/roof_images' },
      { name: 'site_images', type: 'array' as const, subfolder: 'seda/site_images' },
      { name: 'drawing_pdf_system', type: 'array' as const, subfolder: 'seda/drawings' },
      { name: 'drawing_system_actual', type: 'array' as const, subfolder: 'seda/drawings' },
      { name: 'drawing_engineering_seda_pdf', type: 'array' as const, subfolder: 'seda/drawings' },
    ]
  },
  // Users
  {
    table: users,
    tableName: 'user',
    idField: 'id',
    dateField: 'created_date',
    fields: [
      { name: 'profile_picture', type: 'single' as const, subfolder: 'users/profiles' },
    ]
  },
  // Payments
  {
    table: payments,
    tableName: 'payment',
    idField: 'id',
    dateField: 'created_date',
    fields: [
      { name: 'attachment', type: 'array' as const, subfolder: 'payments/attachments' },
    ]
  },
  // Submitted Payments
  {
    table: submitted_payments,
    tableName: 'submitted_payment',
    idField: 'id',
    dateField: 'created_date',
    fields: [
      { name: 'attachment', type: 'array' as const, subfolder: 'payments/submitted' },
    ]
  },
  // Invoice Templates
  {
    table: invoice_templates,
    tableName: 'invoice_template',
    idField: 'id',
    dateField: 'created_at',
    fields: [
      { name: 'logo_url', type: 'single' as const, subfolder: 'templates/logos' },
    ]
  },
];

// ============================================================================
// MAIN MIGRATION FUNCTION
// ============================================================================

/**
 * Migrate all files from Bubble storage to local storage
 * 
 * STEPS:
 * 1. Scan database for Bubble URLs
 * 2. Download files from Bubble
 * 3. Save to /storage/ with sanitized filenames
 * 4. Update database with new absolute URLs
 * 
 * @param options.dryRun - Preview without downloading (default: false)
 * @param options.createdAfter - Only process records created after this date
 * @param options.tables - Specific tables to process (default: all)
 */
export async function migrateBubbleFilesToLocal(options: {
  dryRun?: boolean;
  createdAfter?: string;
  tables?: string[];
} = {}) {
  const startTime = Date.now();
  logSyncActivity(`Starting Bubble-to-Local file migration...`, 'INFO');
  
  if (options.dryRun) {
    logSyncActivity(`🔍 DRY RUN MODE - No files will be downloaded`, 'INFO');
  }
  if (options.createdAfter) {
    logSyncActivity(`📅 Filter: Records created after ${options.createdAfter}`, 'INFO');
  }

  try {
    let scanned = 0;
    let downloaded = 0;
    let failed = 0;
    let skipped = 0;
    let totalSize = 0;
    const details: any[] = [];

    // Filter by tables if specified
    const configsToProcess = options.tables
      ? FILE_FIELDS_CONFIG.filter(c => options.tables!.includes(c.tableName))
      : FILE_FIELDS_CONFIG;

    // ============================================================================
    // STEP 1: QUICK SCAN TO COUNT TOTAL URLs
    // ============================================================================
    logSyncActivity(`📊 Step 1: Quick scan to count total Bubble URLs...`, 'INFO');
    
    let totalToMigrate = 0;
    const allFileReferences: Array<{
      config: any;
      fieldConfig: any;
      recordId: number;
      url: string;
      arrayIndex?: number;
    }> = [];

    for (const config of configsToProcess) {
      for (const fieldConfig of config.fields) {
        try {
          if (fieldConfig.type === 'single') {
            const whereConditions: any[] = [
              isNotNull((config.table as any)[fieldConfig.name])
            ];
            if (options.createdAfter) {
              whereConditions.push(gte((config.table as any)[config.dateField], new Date(options.createdAfter)));
            }
            const records = await db
              .select({
                id: (config.table as any)[config.idField],
                url: (config.table as any)[fieldConfig.name]
              })
              .from(config.table)
              .where(and(...whereConditions));

            for (const record of records) {
              if (isBubbleUrl(record.url)) {
                totalToMigrate++;
                allFileReferences.push({
                  config,
                  fieldConfig,
                  recordId: record.id,
                  url: record.url
                });
              }
            }
          } else {
            // Array field
            const whereConditions: any[] = [
              isNotNull((config.table as any)[fieldConfig.name])
            ];
            if (options.createdAfter) {
              whereConditions.push(gte((config.table as any)[config.dateField], new Date(options.createdAfter)));
            }
            const records = await db
              .select({
                id: (config.table as any)[config.idField],
                urls: (config.table as any)[fieldConfig.name]
              })
              .from(config.table)
              .where(and(...whereConditions));

            for (const record of records) {
              if (Array.isArray(record.urls)) {
                for (let i = 0; i < record.urls.length; i++) {
                  const url = record.urls[i];
                  if (isBubbleUrl(url)) {
                    totalToMigrate++;
                    allFileReferences.push({
                      config,
                      fieldConfig,
                      recordId: record.id,
                      url: url,
                      arrayIndex: i
                    });
                  }
                }
              }
            }
          }
        } catch (error) {
          // Skip errors during scan
        }
      }
    }

    logSyncActivity(`✅ Scan complete: Found ${totalToMigrate} Bubble URLs to ${options.dryRun ? 'preview' : 'migrate'}`, 'INFO');

    if (options.dryRun) {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      logSyncActivity(`✅ Dry run complete in ${duration}s`, 'INFO');
      revalidatePath("/sync");
      return {
        success: true,
        scanned: totalToMigrate,
        downloaded: 0,
        failed: 0,
        totalSize: '0 B',
        duration: `${duration}s`,
        message: `Dry run complete: ${totalToMigrate} files would be migrated`
      };
    }

    // ============================================================================
    // STEP 2: DOWNLOAD AND MIGRATE FILES
    // ============================================================================
    logSyncActivity(`📥 Step 2: Downloading ${totalToMigrate} files...`, 'INFO');

    for (let i = 0; i < allFileReferences.length; i++) {
      const fileRef = allFileReferences[i];
      const currentProgress = i + 1;
      
      try {
        const hadChinese = hasNonASCII(getFilenameFromUrl(fileRef.url));
        const filename = generateFilename(fileRef.url, fileRef.recordId, fileRef.arrayIndex || 0);
        const targetPath = path.join(STORAGE_ROOT, fileRef.fieldConfig.subfolder, filename);
        const newUrl = `${FILE_BASE_URL}/api/files/${fileRef.fieldConfig.subfolder}/${filename}`;

        // Log progress
        logSyncActivity(`📥 [${currentProgress}/${totalToMigrate}] ${filename}`, 'INFO');
        logSyncActivity(`   Table: ${fileRef.config.tableName}.${fileRef.fieldConfig.name}, ID: ${fileRef.recordId}`, 'INFO');

        // DOWNLOAD FILE
        const fileSize = await downloadFile(fileRef.url, targetPath);
        logSyncActivity(`   ✅ Downloaded: ${formatBytes(fileSize)}`, 'INFO');

        // UPDATE DATABASE
        if (fileRef.fieldConfig.type === 'single') {
          await db
            .update(fileRef.config.table)
            .set({ [fileRef.fieldConfig.name]: newUrl })
            .where(eq((fileRef.config.table as any)[fileRef.config.idField], fileRef.recordId));
        } else {
          // Array field - update specific element
          const currentRecord = await db
            .select({ urls: (fileRef.config.table as any)[fileRef.fieldConfig.name] })
            .from(fileRef.config.table)
            .where(eq((fileRef.config.table as any)[fileRef.config.idField], fileRef.recordId))
            .limit(1);

          if (currentRecord.length > 0 && Array.isArray(currentRecord[0].urls)) {
            const updatedUrls = [...currentRecord[0].urls];
            if (fileRef.arrayIndex !== undefined) {
              updatedUrls[fileRef.arrayIndex] = newUrl;
              await db
                .update(fileRef.config.table)
                .set({ [fileRef.fieldConfig.name]: updatedUrls })
                .where(eq((fileRef.config.table as any)[fileRef.config.idField], fileRef.recordId));
            }
          }
        }

        downloaded++;
        totalSize += fileSize;
        logSyncActivity(`   ✅ Progress: ${downloaded} downloaded, ${failed} failed`, 'INFO');

        details.push({
          table: fileRef.config.tableName,
          field: fileRef.fieldConfig.name,
          recordId: fileRef.recordId,
          oldUrl: fileRef.url,
          newUrl: newUrl,
          fileSize: formatBytes(fileSize),
          hadChineseChars: hadChinese
        });
      } catch (err: any) {
        failed++;
        logSyncActivity(`   ❌ Failed: ${err.message}`, 'ERROR');
        details.push({
          table: fileRef.config.tableName,
          field: fileRef.fieldConfig.name,
          recordId: fileRef.recordId,
          oldUrl: fileRef.url,
          newUrl: null,
          error: err.message
        });
      }
    }

    // ============================================================================
    // COMPLETE
    // ============================================================================
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    logSyncActivity(`✅ Migration complete!`, 'INFO');
    logSyncActivity(`   Scanned: ${scanned} Bubble URLs`, 'INFO');
    logSyncActivity(`   Downloaded: ${downloaded}`, 'INFO');
    logSyncActivity(`   Failed: ${failed}`, 'INFO');
    logSyncActivity(`   Skipped: ${skipped}`, 'INFO');
    logSyncActivity(`   Total size: ${formatBytes(totalSize)}`, 'INFO');
    logSyncActivity(`   Duration: ${duration}s`, 'INFO');

    revalidatePath("/sync");
    revalidatePath("/invoices");
    revalidatePath("/customers");

    return {
      success: true,
      scanned,
      downloaded,
      failed,
      skipped,
      totalSize: formatBytes(totalSize),
      duration: `${duration}s`,
      details,
      message: options.dryRun
        ? `DRY RUN: Found ${scanned} files to migrate\n\nNo files were downloaded.`
        : `Successfully migrated ${downloaded}/${scanned} files from Bubble storage

Total size: ${formatBytes(totalSize)}
Duration: ${duration}s
${failed > 0 ? `
⚠️ ${failed} files failed` : ''}`
    };

  } catch (error) {
    logSyncActivity(`Migration crashed: ${String(error)}`, 'ERROR');
    return { success: false, error: String(error) };
  }
}

/**
 * Random test migration - Pick one random Bubble URL and migrate it
 * Returns the image URL for browser verification
 * 
 * @returns Image URL to display in browser + migration details
 */
export async function randomTestMigration() {
  const startTime = Date.now();
  logSyncActivity(`🎲 Starting RANDOM TEST migration...`, 'INFO');

  try {
    // ============================================================================
    // STEP 1: FIND ALL BUBBLE URLs
    // ============================================================================
    const allBubbleUrls: Array<{
      table: any;
      tableName: string;
      idField: string;
      fieldName: string;
      fieldType: 'single' | 'array';
      subfolder: string;
      recordId: number;
      url: string;
      arrayIndex?: number;
    }> = [];

    logSyncActivity(`📊 Scanning database for Bubble URLs...`, 'INFO');

    for (const config of FILE_FIELDS_CONFIG) {
      for (const fieldConfig of config.fields) {
        try {
          if (fieldConfig.type === 'single') {
            const records = await db
              .select({
                id: (config.table as any)[config.idField],
                url: (config.table as any)[fieldConfig.name]
              })
              .from(config.table)
              .where(isNotNull((config.table as any)[fieldConfig.name]));

            for (const record of records) {
              if (isBubbleUrl(record.url)) {
                allBubbleUrls.push({
                  table: config.table,
                  tableName: config.tableName,
                  idField: config.idField,
                  fieldName: fieldConfig.name,
                  fieldType: 'single',
                  subfolder: fieldConfig.subfolder,
                  recordId: record.id,
                  url: record.url
                });
              }
            }
          } else {
            const records = await db
              .select({
                id: (config.table as any)[config.idField],
                urls: (config.table as any)[fieldConfig.name]
              })
              .from(config.table)
              .where(isNotNull((config.table as any)[fieldConfig.name]));

            for (const record of records) {
              if (Array.isArray(record.urls)) {
                for (let i = 0; i < record.urls.length; i++) {
                  const url = record.urls[i];
                  if (isBubbleUrl(url)) {
                    allBubbleUrls.push({
                      table: config.table,
                      tableName: config.tableName,
                      idField: config.idField,
                      fieldName: fieldConfig.name,
                      fieldType: 'array',
                      subfolder: fieldConfig.subfolder,
                      recordId: record.id,
                      url: url,
                      arrayIndex: i
                    });
                  }
                }
              }
            }
          }
        } catch (error) {
          // Skip errors during scan
        }
      }
    }

    if (allBubbleUrls.length === 0) {
      return {
        success: false,
        error: 'No Bubble URLs found in database. All files may already be migrated.'
      };
    }

    logSyncActivity(`✅ Found ${allBubbleUrls.length} Bubble URLs`, 'INFO');

    // ============================================================================
    // STEP 2: PICK ONE RANDOM URL
    // ============================================================================
    const randomIndex = Math.floor(Math.random() * allBubbleUrls.length);
    const selectedFile = allBubbleUrls[randomIndex];

    logSyncActivity(`🎯 Randomly selected #${randomIndex + 1}/${allBubbleUrls.length}`, 'INFO');
    logSyncActivity(`   Table: ${selectedFile.tableName}`, 'INFO');
    logSyncActivity(`   Field: ${selectedFile.fieldName}`, 'INFO');
    logSyncActivity(`   Record ID: ${selectedFile.recordId}`, 'INFO');
    logSyncActivity(`   Old URL: ${selectedFile.url}`, 'INFO');

    // ============================================================================
    // STEP 3: DOWNLOAD & MIGRATE
    // ============================================================================
    const hadChinese = hasNonASCII(getFilenameFromUrl(selectedFile.url));
    const filename = generateFilename(selectedFile.url, selectedFile.recordId, selectedFile.arrayIndex || 0);
    const targetPath = path.join(STORAGE_ROOT, selectedFile.subfolder, filename);
    const newUrl = `${FILE_BASE_URL}/api/files/${selectedFile.subfolder}/${filename}`;

    logSyncActivity(`📥 Downloading file...`, 'INFO');
    const fileSize = await downloadFile(selectedFile.url, targetPath);
    logSyncActivity(`✅ Downloaded: ${formatBytes(fileSize)}`, 'INFO');

    // ============================================================================
    // STEP 4: UPDATE DATABASE
    // ============================================================================
    logSyncActivity(`💾 Updating database...`, 'INFO');

    if (selectedFile.fieldType === 'single') {
      await db
        .update(selectedFile.table)
        .set({ [selectedFile.fieldName]: newUrl })
        .where(eq((selectedFile.table as any)[selectedFile.idField], selectedFile.recordId));
    } else {
      // Array field - update specific element
      const currentRecord = await db
        .select({ urls: (selectedFile.table as any)[selectedFile.fieldName] })
        .from(selectedFile.table)
        .where(eq((selectedFile.table as any)[selectedFile.idField], selectedFile.recordId))
        .limit(1);

      if (currentRecord.length > 0 && Array.isArray(currentRecord[0].urls)) {
        const updatedUrls = [...currentRecord[0].urls];
        if (selectedFile.arrayIndex !== undefined) {
          updatedUrls[selectedFile.arrayIndex] = newUrl;
          await db
            .update(selectedFile.table)
            .set({ [selectedFile.fieldName]: updatedUrls })
            .where(eq((selectedFile.table as any)[selectedFile.idField], selectedFile.recordId));
        }
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    logSyncActivity(`✅ Random test complete!`, 'INFO');
    logSyncActivity(`   File size: ${formatBytes(fileSize)}`, 'INFO');
    logSyncActivity(`   Duration: ${duration}s`, 'INFO');
    logSyncActivity(`   New URL: ${newUrl}`, 'INFO');

    revalidatePath("/sync");

    // Determine file type for display
    const ext = path.extname(filename).toLowerCase();
    const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'].includes(ext);
    const isPdf = ext === '.pdf';

    return {
      success: true,
      imageUrl: newUrl,
      isImage,
      isPdf,
      details: {
        table: selectedFile.tableName,
        field: selectedFile.fieldName,
        recordId: selectedFile.recordId,
        oldUrl: selectedFile.url,
        newUrl: newUrl,
        filename: filename,
        fileSize: formatBytes(fileSize),
        hadChineseChars: hadChinese,
        sanitized: hadChinese ? 'Yes (non-ASCII characters URL-encoded)' : 'No (already ASCII)',
        duration: `${duration}s`,
        totalBubbleUrlsFound: allBubbleUrls.length,
        selectedIndex: randomIndex + 1
      }
    };

  } catch (error) {
    logSyncActivity(`❌ Random test failed: ${String(error)}`, 'ERROR');
    return { success: false, error: String(error) };
  }
}
