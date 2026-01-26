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

function isBubbleUrl(url: string | null): boolean {
  if (!url) return false;
  if (url.startsWith('/storage/')) return false;
  if (url.startsWith('/api/files/')) return false;
  if (url.startsWith(FILE_BASE_URL)) return false;
  if (url.includes('s3.amazonaws.com')) return true;
  if (url.includes('bubble.io')) return true;
  if (url.includes('bubbleapps.io')) return true;
  if (url.startsWith('//s3.')) return true;
  if (url.startsWith('http://') || url.startsWith('https://')) return true;
  return false;
}

function hasNonASCII(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) > 127) return true;
  }
  return false;
}

function sanitizeFilename(filename: string): string {
  const ext = path.extname(filename).split('?')[0];
  const baseName = path.basename(filename, ext).split('?')[0];
  let sanitizedBaseName = '';
  for (let i = 0; i < baseName.length; i++) {
    const char = baseName[i];
    const code = char.charCodeAt(0);
    if ((code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 32 || code === 45 || code === 46 || code === 95) {
      sanitizedBaseName += char;
    } else {
      sanitizedBaseName += encodeURIComponent(char);
    }
  }
  return sanitizedBaseName + ext;
}

function getFilenameFromUrl(url: string): string {
  try {
    const urlObj = new URL(url.startsWith('//') ? 'https:' + url : url);
    const pathname = urlObj.pathname;
    return path.basename(pathname) || `file_${Date.now()}.dat`;
  } catch {
    return `file_${Date.now()}.dat`;
  }
}

function generateFilename(originalUrl: string, recordId: number, index: number = 0): string {
  const timestamp = Date.now();
  const originalFilename = getFilenameFromUrl(originalUrl);
  const ext = path.extname(originalFilename).split('?')[0] || '.jpg';
  const baseName = path.basename(originalFilename, ext).split('?')[0];
  const safeBaseName = baseName.replace(/[^a-zA-Z0-9_\-]/g, '_').substring(0, 30);
  const suffix = index > 0 ? `_${index}` : '';
  const filename = `${recordId}_${safeBaseName}_${timestamp}${suffix}${ext}`;
  return sanitizeFilename(filename);
}

async function downloadFile(url: string, targetPath: string): Promise<number> {
  const fullUrl = url.startsWith('//') ? `https:${url}` : url;
  const response = await fetch(fullUrl);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  if (!response.body) throw new Error('Response body is empty');
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  // @ts-ignore
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(targetPath));
  return fs.statSync(targetPath).size;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

const FILE_FIELDS_CONFIG = [
  { table: sedaRegistration, tableName: 'seda_registration', idField: 'id', dateField: 'created_date', fields: [
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
  ]},
  { table: users, tableName: 'user', idField: 'id', dateField: 'created_date', fields: [
    { name: 'profile_picture', type: 'single' as const, subfolder: 'users/profiles' },
  ]},
  { table: payments, tableName: 'payment', idField: 'id', dateField: 'created_date', fields: [
    { name: 'attachment', type: 'array' as const, subfolder: 'payments/attachments' },
  ]},
  { table: submitted_payments, tableName: 'submitted_payment', idField: 'id', dateField: 'created_date', fields: [
    { name: 'attachment', type: 'array' as const, subfolder: 'payments/submitted' },
  ]},
  { table: invoice_templates, tableName: 'invoice_template', idField: 'id', dateField: 'created_at', fields: [
    { name: 'logo_url', type: 'single' as const, subfolder: 'templates/logos' },
  ]},
];

// ============================================================================
// MAIN MIGRATION FUNCTION (CHUNKED)
// ============================================================================

export async function migrateBubbleFilesToLocal(options: {
  dryRun?: boolean;
  limit?: number;
} = {}) {
  const limit = options.limit || 50;
  
  try {
    let scannedCount = 0;
    const allFileReferences: any[] = [];

    // SCANNING
    for (const config of FILE_FIELDS_CONFIG) {
      if (allFileReferences.length >= limit && !options.dryRun) break;
      for (const fieldConfig of config.fields) {
        if (allFileReferences.length >= limit && !options.dryRun) break;
        try {
          if (fieldConfig.type === 'single') {
            const records = await db.select({ id: (config.table as any)[config.idField], url: (config.table as any)[fieldConfig.name] }).from(config.table).where(isNotNull((config.table as any)[fieldConfig.name]));
            for (const record of records) {
              if (isBubbleUrl(record.url)) {
                scannedCount++;
                if (options.dryRun || allFileReferences.length < limit) {
                  allFileReferences.push({ config, fieldConfig, recordId: record.id, url: record.url });
                }
              }
            }
          } else {
            const records = await db.select({ id: (config.table as any)[config.idField], urls: (config.table as any)[fieldConfig.name] }).from(config.table).where(isNotNull((config.table as any)[fieldConfig.name]));
            for (const record of records) {
              if (Array.isArray(record.urls)) {
                for (let i = 0; i < record.urls.length; i++) {
                  if (isBubbleUrl(record.urls[i])) {
                    scannedCount++;
                    if (options.dryRun || allFileReferences.length < limit) {
                      allFileReferences.push({ config, fieldConfig, recordId: record.id, url: record.urls[i], arrayIndex: i });
                    }
                  }
                }
              }
            }
          }
        } catch (e) {}
      }
    }

    if (options.dryRun) return { success: true, total: scannedCount };
    if (allFileReferences.length === 0) return { success: true, completed: true, processed: 0 };

    // PROCESSING
    let downloaded = 0;
    let totalSize = 0;
    for (const file of allFileReferences) {
      try {
        const filename = generateFilename(file.url, file.recordId, file.arrayIndex || 0);
        const targetPath = path.join(STORAGE_ROOT, file.fieldConfig.subfolder, filename);
        const newUrl = `${FILE_BASE_URL}/api/files/${file.fieldConfig.subfolder}/${filename}`;
        const size = await downloadFile(file.url, targetPath);
        
        if (file.fieldConfig.type === 'single') {
          await db.update(file.config.table).set({ [file.fieldConfig.name]: newUrl }).where(eq((file.config.table as any)[file.config.idField], file.recordId));
        } else {
          const res = await db.select().from(file.config.table).where(eq((file.config.table as any)[file.config.idField], file.recordId)).limit(1);
          if (res.length > 0) {
            const urls = [...res[0][file.fieldConfig.name]];
            urls[file.arrayIndex] = newUrl;
            await db.update(file.config.table).set({ [file.fieldConfig.name]: urls }).where(eq((file.config.table as any)[file.config.idField], file.recordId));
          }
        }
        downloaded++;
        totalSize += size;
        logSyncActivity(`✅ Migrated: ${filename} (${formatBytes(size)})`, 'INFO');
      } catch (e: any) {
        logSyncActivity(`❌ Failed: ${file.url} - ${e.message}`, 'ERROR');
      }
    }

    return { success: true, completed: false, processed: downloaded, totalSize: formatBytes(totalSize) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function randomTestMigration() {
  const startTime = Date.now();
  try {
    const all: any[] = [];
    for (const config of FILE_FIELDS_CONFIG) {
      for (const field of config.fields) {
        try {
          const records = await db.select({ id: (config.table as any)[config.idField], val: (config.table as any)[field.name] }).from(config.table).where(isNotNull((config.table as any)[field.name]));
          for (const r of records) {
            if (field.type === 'single') {
              if (isBubbleUrl(r.val)) all.push({ config, field, id: r.id, url: r.val });
            } else if (Array.isArray(r.val)) {
              r.val.forEach((u: string, i: number) => { if (isBubbleUrl(u)) all.push({ config, field, id: r.id, url: u, idx: i }); });
            }
          }
        } catch (e) {}
      }
    }
    if (all.length === 0) return { success: false, error: "No Bubble URLs found" };
    const target = all[Math.floor(Math.random() * all.length)];
    const filename = generateFilename(target.url, target.id, target.idx || 0);
    const targetPath = path.join(STORAGE_ROOT, target.field.subfolder, filename);
    const newUrl = `${FILE_BASE_URL}/api/files/${target.field.subfolder}/${filename}`;
    const size = await downloadFile(target.url, targetPath);
    
    if (target.field.type === 'single') {
      await db.update(target.config.table).set({ [target.field.name]: newUrl }).where(eq((target.config.table as any)[target.config.idField], target.id));
    } else {
      const res = await db.select().from(target.config.table).where(eq((target.config.table as any)[target.config.idField], target.id)).limit(1);
      const urls = [...res[0][target.field.name]];
      urls[target.idx] = newUrl;
      await db.update(target.config.table).set({ [target.field.name]: urls }).where(eq((target.config.table as any)[target.config.idField], target.id));
    }

    revalidatePath("/sync");
    const ext = path.extname(filename).toLowerCase();
    return {
      success: true,
      imageUrl: newUrl,
      isImage: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'].includes(ext),
      isPdf: ext === '.pdf',
      details: { table: target.config.tableName, field: target.field.name, recordId: target.id, fileSize: formatBytes(size), newUrl }
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
