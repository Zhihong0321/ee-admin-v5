/**
 * Comprehensive File Migration System
 * Migrates ALL files from Bubble URLs to local Railway storage
 */

import { db } from "@/lib/db";
import { sedaRegistration, users, payments, submitted_payments, invoice_templates, customers } from "@/db/schema";
import { eq, or, and, isNotNull, notLike, gte, sql } from "drizzle-orm";
import { downloadBubbleFile, FILE_BASE_URL } from "@/lib/storage";
import { updateProgress, deleteProgress } from "@/lib/progress-tracker";
import path from "path";
import fs from "fs";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface MigrationResult {
  success: boolean;
  summary: {
    totalFiles: number;
    migrated: number;
    failed: number;
    skipped: number;
    totalSize: number; // in bytes
    duration: number; // in seconds
  };
  details: {
    table: string;
    field: string;
    recordId: number;
    oldUrl: string;
    newUrl: string | null;
    error?: string;
  }[];
}

interface FileFieldConfig {
  table: any;
  tableName: string;
  idField: string;
  dateField: string; // Field to filter by creation date
  fields: FieldConfig[];
}

interface FieldConfig {
  fieldName: string;
  fieldType: 'single' | 'array';
  subfolder: string;
}

// ============================================================================
// ALL FILE FIELDS CONFIGURATION
// ============================================================================

const FILE_FIELDS_CONFIG: FileFieldConfig[] = [
  // SEDA Registration - Multiple file fields
  {
    table: sedaRegistration,
    tableName: 'seda_registration',
    idField: 'id',
    dateField: 'created_date',
    fields: [
      { fieldName: 'customer_signature', fieldType: 'single', subfolder: 'seda/signatures' },
      { fieldName: 'ic_copy_front', fieldType: 'single', subfolder: 'seda/ic_copies' },
      { fieldName: 'ic_copy_back', fieldType: 'single', subfolder: 'seda/ic_copies' },
      { fieldName: 'tnb_bill_1', fieldType: 'single', subfolder: 'seda/tnb_bills' },
      { fieldName: 'tnb_bill_2', fieldType: 'single', subfolder: 'seda/tnb_bills' },
      { fieldName: 'tnb_bill_3', fieldType: 'single', subfolder: 'seda/tnb_bills' },
      { fieldName: 'nem_cert', fieldType: 'single', subfolder: 'seda/certificates' },
      { fieldName: 'mykad_pdf', fieldType: 'single', subfolder: 'seda/mykad' },
      { fieldName: 'property_ownership_prove', fieldType: 'single', subfolder: 'seda/ownership' },
      { fieldName: 'check_tnb_bill_and_meter_image', fieldType: 'single', subfolder: 'seda/checks' },
      { fieldName: 'roof_images', fieldType: 'array', subfolder: 'seda/roof_images' },
      { fieldName: 'site_images', fieldType: 'array', subfolder: 'seda/site_images' },
      { fieldName: 'drawing_pdf_system', fieldType: 'array', subfolder: 'seda/drawings' },
      { fieldName: 'drawing_system_actual', fieldType: 'array', subfolder: 'seda/drawings' },
      { fieldName: 'drawing_engineering_seda_pdf', fieldType: 'array', subfolder: 'seda/drawings' },
    ]
  },
  // Users - Profile pictures
  {
    table: users,
    tableName: 'user',
    idField: 'id',
    dateField: 'created_date',
    fields: [
      { fieldName: 'profile_picture', fieldType: 'single', subfolder: 'users/profiles' },
    ]
  },
  // Payments - Attachments
  {
    table: payments,
    tableName: 'payment',
    idField: 'id',
    dateField: 'created_date',
    fields: [
      { fieldName: 'attachment', fieldType: 'array', subfolder: 'payments/attachments' },
    ]
  },
  // Submitted Payments - Attachments
  {
    table: submitted_payments,
    tableName: 'submitted_payment',
    idField: 'id',
    dateField: 'created_date',
    fields: [
      { fieldName: 'attachment', fieldType: 'array', subfolder: 'payments/submitted' },
    ]
  },
  // Invoice Templates - Logos
  {
    table: invoice_templates,
    tableName: 'invoice_template',
    idField: 'id',
    dateField: 'created_at',
    fields: [
      { fieldName: 'logo_url', fieldType: 'single', subfolder: 'templates/logos' },
    ]
  },
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if a URL is from Bubble (external) and needs migration
 */
function isExternalUrl(url: string | null): boolean {
  if (!url) return false;
  if (url.startsWith('/storage/')) return false; // Already migrated (relative)
  if (url.startsWith(FILE_BASE_URL + '/storage/')) return false; // Already migrated (absolute)
  if (url.startsWith('http://') || url.startsWith('https://')) return true;
  if (url.startsWith('//')) return true; // Protocol-relative URL
  return false;
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

/**
 * Get file size from path (supports both absolute URLs and relative paths)
 */
function getFileSize(filePath: string): number {
  try {
    // Convert absolute URL back to relative path for file system access
    const localPath = filePath.startsWith(FILE_BASE_URL)
      ? filePath.replace(FILE_BASE_URL, '')
      : filePath;
    return fs.statSync(localPath).size;
  } catch {
    return 0;
  }
}

/**
 * Generate unique filename
 */
function generateFilename(originalUrl: string, recordId: number, index: number = 0): string {
  const timestamp = Date.now();
  const ext = path.extname(originalUrl).split('?')[0] || '.jpg';
  const baseName = path.basename(originalUrl, ext).split('?')[0];
  const safeBaseName = baseName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
  const suffix = index > 0 ? `_ ${index}` : '';
  return `${recordId}_${safeBaseName}_${timestamp}${suffix}${ext}`;
}

// ============================================================================
// MAIN MIGRATION FUNCTION
// ============================================================================

/**
 * Comprehensive file migration from Bubble URLs to local storage
 * Scans ALL tables and fields with file URLs, downloads files, and updates database
 * @param sessionId - Optional progress tracking session ID
 * @param createdAfter - Optional date filter to only migrate records created after this date (ISO string)
 */
export async function migrateAllBubbleFiles(sessionId?: string, createdAfter?: string): Promise<MigrationResult> {
  const startTime = Date.now();
  const result: MigrationResult = {
    success: false,
    summary: {
      totalFiles: 0,
      migrated: 0,
      failed: 0,
      skipped: 0,
      totalSize: 0,
      duration: 0
    },
    details: []
  };

  try {
    console.log('🚀 Starting comprehensive file migration...');
    if (createdAfter) {
      console.log(`📅 Filter: Only files created after ${createdAfter}`);
    }

    // Initialize progress tracking
    if (sessionId) {
      updateProgress(sessionId, {
        status: 'running',
        totalFiles: 0,
        completedFiles: 0,
        failedFiles: 0,
        currentFile: null,
        downloadSpeed: null,
        currentDownloadSpeed: 0,
        details: createdAfter
          ? [`🔍 Scanning for files created after ${createdAfter}...`]
          : ['🔍 Scanning database for external URLs...'],
        categoriesTotal: [],
        categoriesCompleted: []
      });
    }

    // ============================================================================
    // STEP 1: Scan ALL tables and fields for external URLs
    // ============================================================================
    console.log('📊 Step 1: Scanning database for external URLs...');

    const filesToMigrate: Array<{
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

    for (const config of FILE_FIELDS_CONFIG) {
      console.log(`   Scanning ${config.tableName}...`);

      for (const fieldConfig of config.fields) {
        try {
          let records: any[];

          if (fieldConfig.fieldType === 'single') {
            // Single field - get records where field is external URL
            const whereConditions = [
              isNotNull((config.table as any)[fieldConfig.fieldName]),
              notLike((config.table as any)[fieldConfig.fieldName], '/storage/%'),
              notLike((config.table as any)[fieldConfig.fieldName], `${FILE_BASE_URL}/storage/%`)
            ];

            // Add date filter if specified
            if (createdAfter) {
              whereConditions.push(gte((config.table as any)[config.dateField], new Date(createdAfter)));
            }

            records = await db
              .select({
                id: (config.table as any)[config.idField],
                url: (config.table as any)[fieldConfig.fieldName]
              })
              .from(config.table)
              .where(and(...whereConditions));

            // Add to migration list
            for (const record of records) {
              if (isExternalUrl(record.url)) {
                filesToMigrate.push({
                  table: config.table,
                  tableName: config.tableName,
                  idField: config.idField,
                  fieldName: fieldConfig.fieldName,
                  fieldType: 'single',
                  subfolder: fieldConfig.subfolder,
                  recordId: record.id,
                  url: record.url
                });
              }
            }
          } else {
            // Array field - need to process in memory
            const whereConditions = [
              isNotNull((config.table as any)[fieldConfig.fieldName])
            ];

            // Add date filter if specified
            if (createdAfter) {
              whereConditions.push(gte((config.table as any)[config.dateField], new Date(createdAfter)));
            }

            records = await db
              .select({
                id: (config.table as any)[config.idField],
                urls: (config.table as any)[fieldConfig.fieldName]
              })
              .from(config.table)
              .where(and(...whereConditions));

            // Process each array
            for (const record of records) {
              if (Array.isArray(record.urls)) {
                for (let i = 0; i < record.urls.length; i++) {
                  const url = record.urls[i];
                  if (isExternalUrl(url)) {
                    filesToMigrate.push({
                      table: config.table,
                      tableName: config.tableName,
                      idField: config.idField,
                      fieldName: fieldConfig.fieldName,
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

          console.log(`   Found ${records.length} records in ${config.tableName}.${fieldConfig.fieldName}`);
        } catch (error) {
          console.error(`   ❌ Error scanning ${config.tableName}.${fieldConfig.fieldName}:`, error);
          if (sessionId) {
            updateProgress(sessionId, {
              details: [`❌ Scan error: ${config.tableName}.${fieldConfig.fieldName}`]
            });
          }
        }
      }
    }

    result.summary.totalFiles = filesToMigrate.length;
    console.log(`\n✅ Scan complete: ${filesToMigrate.length} files to migrate\n`);

    // Update progress with total
    if (sessionId) {
      updateProgress(sessionId, {
        totalFiles: filesToMigrate.length,
        details: [
          `📊 Found ${filesToMigrate.length} files to migrate`,
          '⬇️ Starting download...'
        ]
      });
    }

    if (filesToMigrate.length === 0) {
      console.log('✨ No files to migrate! All files are already local.');
      result.success = true;
      result.summary.duration = (Date.now() - startTime) / 1000;
      return result;
    }

    // ============================================================================
    // STEP 2: Download and migrate files
    // ============================================================================
    console.log('⬇️ Step 2: Downloading and migrating files...\n');

    for (let i = 0; i < filesToMigrate.length; i++) {
      const file = filesToMigrate[i];
      const filename = generateFilename(file.url, file.recordId, file.arrayIndex);
      const downloadStartTime = Date.now();

      try {
        // Update progress
        if (sessionId) {
          updateProgress(sessionId, {
            currentFile: filename,
            completedFiles: i,
            downloadedBytes: null,
            currentFileSize: null
          });
        }

        console.log(`[${i + 1}/${filesToMigrate.length}] ${file.tableName}.${file.fieldName} (ID: ${file.recordId})`);
        console.log(`   URL: ${file.url.substring(0, 80)}...`);

        // Download file
        const savedPath = await downloadBubbleFile(file.url, file.subfolder, filename);

        if (!savedPath) {
          throw new Error('Download failed - returned null path');
        }

        const fileSize = getFileSize(savedPath);
        const downloadDuration = (Date.now() - downloadStartTime) / 1000;
        const speed = downloadDuration > 0 ? fileSize / downloadDuration : 0;

        console.log(`   ✅ Downloaded: ${savedPath}`);
        console.log(`   📦 Size: ${formatBytes(fileSize)} | ⚡ Speed: ${formatBytes(speed)}/s`);

        // Update database with new path
        if (file.fieldType === 'single') {
          await db
            .update(file.table)
            .set({ [file.fieldName]: savedPath })
            .where(eq((file.table as any)[file.idField], file.recordId));
        } else {
          // Array field - need to update specific element
          // First, get current array
          const currentRecord = await db
            .select({ urls: (file.table as any)[file.fieldName] })
            .from(file.table)
            .where(eq((file.table as any)[file.idField], file.recordId))
            .limit(1);

          if (currentRecord.length > 0 && Array.isArray(currentRecord[0].urls)) {
            const updatedUrls = [...currentRecord[0].urls];
            if (file.arrayIndex !== undefined) {
              updatedUrls[file.arrayIndex] = savedPath;
              await db
                .update(file.table)
                .set({ [file.fieldName]: updatedUrls })
                .where(eq((file.table as any)[file.idField], file.recordId));
            }
          }
        }

        result.summary.migrated++;
        result.summary.totalSize += fileSize;

        result.details.push({
          table: file.tableName,
          field: file.fieldName,
          recordId: file.recordId,
          oldUrl: file.url,
          newUrl: savedPath
        });

        // Update progress
        if (sessionId) {
          updateProgress(sessionId, {
            completedFiles: i + 1,
            downloadSpeed: `${formatBytes(speed)}/s`,
            currentDownloadSpeed: speed,
            details: [
              `✅ ${filename}`,
              `   ${formatBytes(fileSize)} • ${formatBytes(speed)}/s`
            ]
          });
        }

      } catch (error) {
        const errorMsg = String(error);
        console.error(`   ❌ Error: ${errorMsg}`);

        result.summary.failed++;
        result.details.push({
          table: file.tableName,
          field: file.fieldName,
          recordId: file.recordId,
          oldUrl: file.url,
          newUrl: null,
          error: errorMsg
        });

        if (sessionId) {
          updateProgress(sessionId, {
            failedFiles: result.summary.failed,
            details: [
              `❌ ${filename}`,
              `   Error: ${errorMsg.substring(0, 100)}`
            ]
          });
        }
      }
    }

    // ============================================================================
    // COMPLETE
    // ============================================================================
    result.summary.duration = (Date.now() - startTime) / 1000;
    result.success = true;

    console.log('\n' + '='.repeat(60));
    console.log('✅ MIGRATION COMPLETE!');
    console.log('='.repeat(60));
    console.log(`📊 Summary:`);
    console.log(`   Total files: ${result.summary.totalFiles}`);
    console.log(`   ✅ Migrated: ${result.summary.migrated}`);
    console.log(`   ❌ Failed: ${result.summary.failed}`);
    console.log(`   📦 Total size: ${formatBytes(result.summary.totalSize)}`);
    console.log(`   ⏱️ Duration: ${result.summary.duration.toFixed(2)}s`);
    console.log('='.repeat(60));

    if (sessionId) {
      updateProgress(sessionId, {
        status: 'completed',
        currentFile: null,
        downloadSpeed: null,
        currentDownloadSpeed: 0,
        details: [
          '✅ Migration complete!',
          `📊 ${result.summary.migrated}/${result.summary.totalFiles} files migrated`,
          `📦 Total: ${formatBytes(result.summary.totalSize)} • ⏱️ ${result.summary.duration.toFixed(2)}s`,
          result.summary.failed > 0 ? `⚠️ ${result.summary.failed} failed` : ''
        ].filter(Boolean)
      });
    }

    return result;

  } catch (error) {
    console.error('❌ Migration failed:', error);
    result.summary.duration = (Date.now() - startTime) / 1000;
    result.success = false;

    if (sessionId) {
      updateProgress(sessionId, {
        status: 'error',
        details: [`❌ Migration failed: ${String(error)}`]
      });
    }

    return result;
  }
}

/**
 * Get migration statistics without running migration
 * @param createdAfter - Optional date filter to only count records created after this date (ISO string)
 */
export async function getMigrationStats(createdAfter?: string) {
  const stats = {
    totalFiles: 0,
    byTable: {} as Record<string, number>,
    byField: {} as Record<string, number>
  };

  console.log('[Migration Stats] Scanning for files to migrate...', createdAfter ? `Filter: after ${createdAfter}` : 'No filter');

  for (const config of FILE_FIELDS_CONFIG) {
    let tableCount = 0;

    for (const fieldConfig of config.fields) {
      try {
        let count = 0;

        if (fieldConfig.fieldType === 'single') {
          const whereConditions = [
            isNotNull((config.table as any)[fieldConfig.fieldName]),
            notLike((config.table as any)[fieldConfig.fieldName], '/storage/%'),
            notLike((config.table as any)[fieldConfig.fieldName], `${FILE_BASE_URL}/storage/%`)
          ];

          if (createdAfter) {
            whereConditions.push(gte((config.table as any)[config.dateField], new Date(createdAfter)));
          }

          const records = await db
            .select({ id: (config.table as any)[config.idField] })
            .from(config.table)
            .where(and(...whereConditions));
          count = records.length;
        } else {
          const whereConditions = [
            isNotNull((config.table as any)[fieldConfig.fieldName])
          ];

          if (createdAfter) {
            whereConditions.push(gte((config.table as any)[config.dateField], new Date(createdAfter)));
          }

          const records = await db
            .select({ urls: (config.table as any)[fieldConfig.fieldName] })
            .from(config.table)
            .where(and(...whereConditions));

          // Count external URLs in arrays
          for (const record of records) {
            if (Array.isArray(record.urls)) {
              for (const url of record.urls) {
                if (isExternalUrl(url)) count++;
              }
            }
          }
        }

        tableCount += count;
        stats.totalFiles += count;

        const fieldKey = `${config.tableName}.${fieldConfig.fieldName}`;
        stats.byField[fieldKey] = count;

      } catch (error) {
        console.error(`Error counting ${config.tableName}.${fieldConfig.fieldName}:`, error);
      }
    }

    stats.byTable[config.tableName] = tableCount;
  }

  return stats;
}
