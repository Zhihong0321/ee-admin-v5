"use server";

import { db } from "@/lib/db";
import { sedaRegistration, users, payments, submitted_payments } from "@/db/schema";
import { eq, isNotNull, and, notLike, or, sql } from "drizzle-orm";
import { downloadBubbleFile, checkStorageHealth } from "@/lib/storage";
import { createProgressSession, updateProgress, deleteProgress } from "@/lib/progress-tracker";
import path from "path";
import fs from "fs";

import sharp from "sharp";

// Helper function to format bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

export interface StorageFile {
  name: string;
  path: string; // Relative to /storage
  fullPath: string; // Absolute path
  size: number;
  sizeFormatted: string;
  type: 'image' | 'pdf' | 'other';
  extension: string;
  mtime: Date;
}

/**
 * List all files in the storage directory recursively
 */
export async function listAllFiles(): Promise<StorageFile[]> {
  const STORAGE_ROOT = '/storage';
  const files: StorageFile[] = [];

  function scanDir(dir: string) {
    if (!fs.existsSync(dir)) return;
    
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else {
        const stats = fs.statSync(fullPath);
        const relativePath = path.relative(STORAGE_ROOT, fullPath).replace(/\\/g, '/');
        const ext = path.extname(entry.name).toLowerCase();
        
        let type: 'image' | 'pdf' | 'other' = 'other';
        if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) {
          type = 'image';
        } else if (ext === '.pdf') {
          type = 'pdf';
        }

        files.push({
          name: entry.name,
          path: relativePath,
          fullPath: fullPath,
          size: stats.size,
          sizeFormatted: formatBytes(stats.size),
          type,
          extension: ext,
          mtime: stats.mtime
        });
      }
    }
  }

  scanDir(STORAGE_ROOT);
  return files;
}

/**
 * Shrink an image file using sharp
 * @param filePath Absolute path to the image
 * @param quality Quality percentage (1-100)
 */
export async function shrinkImage(filePath: string, quality: number = 80) {
  try {
    const ext = path.extname(filePath).toLowerCase();
    const tempPath = `${filePath}.tmp${ext}`;
    
    let pipeline = sharp(filePath);
    
    // Auto-rotate based on EXIF
    pipeline = pipeline.rotate();

    if (ext === '.jpg' || ext === '.jpeg') {
      await pipeline.jpeg({ quality, mozjpeg: true }).toFile(tempPath);
    } else if (ext === '.png') {
      await pipeline.png({ quality, compressionLevel: 9 }).toFile(tempPath);
    } else if (ext === '.webp') {
      await pipeline.webp({ quality }).toFile(tempPath);
    } else {
      throw new Error("Unsupported image format for shrinking");
    }

    // Check if shrink actually worked (sometimes it gets bigger if quality was already low)
    const oldSize = fs.statSync(filePath).size;
    const newSize = fs.statSync(tempPath).size;

    if (newSize < oldSize) {
      fs.renameSync(tempPath, filePath);
      return { success: true, oldSize: formatBytes(oldSize), newSize: formatBytes(newSize), saved: formatBytes(oldSize - newSize) };
    } else {
      fs.unlinkSync(tempPath);
      return { success: false, message: "Shrinking didn't reduce file size (already optimized)" };
    }
  } catch (error) {
    console.error("Shrink error:", error);
    return { success: false, error: String(error) };
  }
}

// Helper function to get file size
async function getFileSize(filePath: string): Promise<number> {
  try {
    const stats = fs.statSync(filePath);
    return stats.size;
  } catch (error) {
    return 0;
  }
}

export async function testStorageHealth() {
  return await checkStorageHealth();
}

export type SyncCategory = 'signatures' | 'ic_copies' | 'bills' | 'roof_site_images' | 'payments' | 'user_profiles';

export async function syncFilesByCategory(category: SyncCategory, limit: number = 50, sessionId?: string) {
  try {
    const results = { success: 0, failed: 0, details: [] as string[] };
    let filesToProcess: any[] = [];
    let tableName = "";
    let idField = "";
    let urlField = "";
    let updateTable: any = null;

    // Initialize progress tracking if sessionId provided
    if (sessionId) {
      updateProgress(sessionId, { category, status: 'running' });
    }

    // Define query based on category
    switch (category) {
      case 'signatures':
        filesToProcess = await db.select({
          id: sedaRegistration.id,
          url: sedaRegistration.customer_signature
        })
        .from(sedaRegistration)
        .where(
          and(
            isNotNull(sedaRegistration.customer_signature),
            notLike(sedaRegistration.customer_signature, '/storage/%')
          )
        )
        .limit(limit);
        tableName = "seda_registration";
        idField = "id";
        urlField = "customer_signature";
        updateTable = sedaRegistration;
        break;

      case 'ic_copies':
        filesToProcess = await db.select({
          id: sedaRegistration.id,
          url: sedaRegistration.ic_copy_front
        })
        .from(sedaRegistration)
        .where(
          and(
            isNotNull(sedaRegistration.ic_copy_front),
            notLike(sedaRegistration.ic_copy_front, '/storage/%')
          )
        )
        .limit(limit);
        tableName = "seda_registration";
        idField = "id";
        urlField = "ic_copy_front";
        updateTable = sedaRegistration;
        break;

      case 'bills':
        filesToProcess = await db.select({
          id: sedaRegistration.id,
          url: sedaRegistration.tnb_bill_1
        })
        .from(sedaRegistration)
        .where(
          and(
            isNotNull(sedaRegistration.tnb_bill_1),
            notLike(sedaRegistration.tnb_bill_1, '/storage/%')
          )
        )
        .limit(limit);
        tableName = "seda_registration";
        idField = "id";
        urlField = "tnb_bill_1";
        updateTable = sedaRegistration;
        break;

        case 'roof_site_images':
            // TODO: Handle array fields (roof_images, site_images)
            filesToProcess = []; 
            // This is a bit more complex as it's a JSON array usually, but assuming string URL for now or need to handle array
            // If it's a single URL field in legacy data:
            /*
            filesToProcess = await db.select({
              id: sedaRegistration.id,
              url: sedaRegistration.roof_images // This is an array
            })
            .from(sedaRegistration)
            ...
            */
            break;

      case 'payments':
        // TODO: Handle array fields (attachment)
        filesToProcess = [];
        /*
        // Check both payments and submitted_payments tables
        const paymentsFiles = await db.select({
            id: payments.id,
            url: payments.attachment // Array
          })
          .from(payments)
          .where(
            and(
              isNotNull(payments.attachment),
              // notLike(payments.attachment, '/storage/%') // Cannot use notLike on array
            )
          )
          .limit(limit);
        
        if (paymentsFiles.length > 0) {
            filesToProcess = paymentsFiles;
            tableName = "payments";
            idField = "id";
            urlField = "attachment";
            updateTable = payments;
        } else {
             const subPaymentsFiles = await db.select({
                id: submitted_payments.id,
                url: submitted_payments.attachment // Array
              })
              .from(submitted_payments)
              ...
            filesToProcess = subPaymentsFiles;
            tableName = "submitted_payments";
            idField = "id";
            urlField = "attachment";
            updateTable = submitted_payments;
        }
        */
        break;

      case 'user_profiles':
        filesToProcess = await db.select({
          id: users.id,
          url: users.profile_picture
        })
        .from(users)
        .where(
          and(
            isNotNull(users.profile_picture),
            notLike(users.profile_picture, '/storage/%')
          )
        )
        .limit(limit);
        tableName = "users";
        idField = "id";
        urlField = "profile_picture";
        updateTable = users;
        break;
    }

    if (filesToProcess.length === 0) {
        if (sessionId) {
          updateProgress(sessionId, { status: 'completed', details: ["No files found to process for this category."] });
        }
        return { success: true, results: { success: 0, failed: 0, details: ["No files found to process for this category."] } };
    }

    // Update progress with total files
    if (sessionId) {
        updateProgress(sessionId, {
            totalFiles: filesToProcess.length,
            completedFiles: 0,
            failedFiles: 0
        });
    }

    for (let i = 0; i < filesToProcess.length; i++) {
        const record = filesToProcess[i];
        if (!record.url) continue;

        const filename = path.basename(record.url).split('?')[0];
        const startTime = Date.now();

        try {
            // Update progress: current file
            if (sessionId) {
                updateProgress(sessionId, {
                    currentFile: filename,
                    downloadedBytes: null,
                    currentFileSize: null
                });
            }

            // 1. Download and Save
            const savedPath = await downloadBubbleFile(record.url, tableName, filename);

            if (savedPath) {
                // Calculate download speed
                const endTime = Date.now();
                const duration = (endTime - startTime) / 1000; // seconds
                const fileSize = await getFileSize(savedPath);
                const speed = duration > 0 ? fileSize / duration : 0;
                const speedText = formatBytes(speed) + '/s';

                // 2. Update Database
                await db.update(updateTable)
                    .set({ [urlField]: savedPath })
                    .where(eq(updateTable[idField], record.id));

                results.success++;
                results.details.push(`Migrated [${record.id}]: ${record.url} -> ${savedPath}`);

                // Update progress: completed
                if (sessionId) {
                    updateProgress(sessionId, {
                        completedFiles: results.success,
                        downloadSpeed: speedText,
                        currentDownloadSpeed: speed,
                        details: [`✓ ${filename} (${formatBytes(fileSize)})`]
                    });
                }
            } else {
                results.failed++;
                results.details.push(`Failed Download [${record.id}]: ${record.url}`);

                if (sessionId) {
                    updateProgress(sessionId, {
                        failedFiles: results.failed,
                        details: [`✗ ${filename} - Failed to download`]
                    });
                }
            }

        } catch (err) {
            console.error(`Error processing ${record.id}:`, err);
            results.failed++;
            results.details.push(`Error [${record.id}]: ${String(err)}`);

            if (sessionId) {
                updateProgress(sessionId, {
                    failedFiles: results.failed,
                    details: [`✗ ${filename} - ${String(err)}`]
                });
            }
        }
    }

    // Mark category as completed
    if (sessionId) {
        updateProgress(sessionId, {
            status: 'completed',
            currentFile: null,
            downloadSpeed: null,
            currentDownloadSpeed: 0
        });
    }

    return { success: true, results };

  } catch (error) {
    console.error("Sync category error:", error);
    if (sessionId) {
      updateProgress(sessionId, { status: 'error', details: [`Error: ${String(error)}`] });
    }
    return { success: false, error: String(error) };
  }
}
