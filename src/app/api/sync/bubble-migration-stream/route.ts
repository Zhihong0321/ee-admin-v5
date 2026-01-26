/**
 * Streaming API for Bubble File Migration
 * Provides real-time progress updates during file migration
 */

import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import {
  sedaRegistration,
  users,
  payments,
  submitted_payments,
  invoice_templates
} from '@/db/schema';
import { isNotNull, and, gte, eq } from 'drizzle-orm';
import path from 'path';
import fs from 'fs';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

const STORAGE_ROOT = path.join(process.cwd(), 'storage');
const FILE_BASE_URL = process.env.NEXT_PUBLIC_FILE_BASE_URL || 'https://admin.atap.solar';

// Helper functions
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
    if (
      (code >= 48 && code <= 57) ||
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122) ||
      code === 32 || code === 45 || code === 46 || code === 95
    ) {
      sanitizedBaseName += char;
    } else {
      sanitizedBaseName += encodeURIComponent(char);
    }
  }
  return sanitizedBaseName + ext;
}

function getFilenameFromUrl(url: string): string {
  try {
    const urlObj = new URL(url.startsWith('//') ? `https:${url}` : url);
    const pathname = urlObj.pathname;
    return path.basename(pathname);
  } catch {
    return 'unknown';
  }
}

function generateFilename(url: string, recordId: number, index: number = 0): string {
  const originalFilename = getFilenameFromUrl(url);
  const sanitized = sanitizeFilename(originalFilename);
  const timestamp = Date.now();
  const ext = path.extname(sanitized);
  const base = path.basename(sanitized, ext);
  return `${recordId}_${base}_${timestamp}_${index}${ext}`;
}

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

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

const FILE_FIELDS_CONFIG = [
  {
    table: sedaRegistration,
    tableName: 'seda_registration',
    idField: 'id',
    dateField: 'created_date',
    fields: [
      { name: 'customer_signature', type: 'single' as const, subfolder: 'seda/signatures' },
      { name: 'ic_copy_front', type: 'single' as const, subfolder: 'seda/ic_copies' },
      { name: 'ic_copy_back', type: 'single' as const, subfolder: 'seda/ic_copies' },
      { name: 'company_registration_document', type: 'single' as const, subfolder: 'seda/company_docs' },
      { name: 'utility_bill_copy', type: 'single' as const, subfolder: 'seda/utility_bills' },
      { name: 'letter_of_authorization', type: 'single' as const, subfolder: 'seda/authorization_letters' },
      { name: 'inverter_warranty', type: 'single' as const, subfolder: 'seda/warranties' },
      { name: 'solar_panel_warranty', type: 'single' as const, subfolder: 'seda/warranties' },
      { name: 'installer_certificate', type: 'single' as const, subfolder: 'seda/certificates' },
      { name: 'roof_sketch', type: 'single' as const, subfolder: 'seda/roof_sketches' },
      { name: 'site_photos', type: 'array' as const, subfolder: 'seda/site_photos' },
      { name: 'installer_certificates', type: 'array' as const, subfolder: 'seda/certificates' },
      { name: 'array_photo', type: 'single' as const, subfolder: 'seda/array_photos' },
      { name: 'full_view_photo', type: 'single' as const, subfolder: 'seda/full_view_photos' },
    ]
  },
  {
    table: users,
    tableName: 'user',
    idField: 'id',
    dateField: 'created_date',
    fields: [
      { name: 'profile_photo', type: 'single' as const, subfolder: 'profiles' }
    ]
  },
  {
    table: payments,
    tableName: 'payment',
    idField: 'id',
    dateField: 'created_date',
    fields: [
      { name: 'payment_proof_image', type: 'single' as const, subfolder: 'payments' }
    ]
  },
  {
    table: submitted_payments,
    tableName: 'submitted_payment',
    idField: 'id',
    dateField: 'created_date',
    fields: [
      { name: 'payment_proof_image', type: 'single' as const, subfolder: 'payments' }
    ]
  },
  {
    table: invoice_templates,
    tableName: 'invoice_template',
    idField: 'id',
    dateField: 'created_date',
    fields: [
      { name: 'company_logo', type: 'single' as const, subfolder: 'company_logos' }
    ]
  }
];

export async function POST(request: NextRequest) {
  const { dryRun = false } = await request.json();

  // Create a readable stream for SSE
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendMessage = (data: any) => {
        const message = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      try {
        sendMessage({ type: 'start', message: 'Starting migration...' });

        // Phase 1: Quick scan to count total URLs
        sendMessage({ type: 'phase', phase: 'scanning', message: 'Scanning database for Bubble URLs...' });
        
        const allFiles: Array<{
          config: typeof FILE_FIELDS_CONFIG[0];
          fieldConfig: typeof FILE_FIELDS_CONFIG[0]['fields'][0];
          recordId: number;
          url: string;
          arrayIndex?: number;
        }> = [];

        for (const config of FILE_FIELDS_CONFIG) {
          for (const fieldConfig of config.fields) {
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
                  allFiles.push({
                    config,
                    fieldConfig,
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
                      allFiles.push({
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
          }
        }

        const totalFiles = allFiles.length;
        sendMessage({ 
          type: 'scan_complete', 
          total: totalFiles,
          message: `Found ${totalFiles} files to ${dryRun ? 'preview' : 'migrate'}`
        });

        if (dryRun) {
          sendMessage({ type: 'complete', scanned: totalFiles, downloaded: 0, message: 'Dry run complete' });
          controller.close();
          return;
        }

        // Phase 2: Download files
        sendMessage({ type: 'phase', phase: 'downloading', message: 'Starting downloads...' });

        let downloaded = 0;
        let failed = 0;
        let totalSize = 0;

        for (let i = 0; i < allFiles.length; i++) {
          const file = allFiles[i];
          const current = i + 1;
          
          try {
            const filename = generateFilename(file.url, file.recordId, file.arrayIndex || 0);
            const targetPath = path.join(STORAGE_ROOT, file.fieldConfig.subfolder, filename);
            const newUrl = `${FILE_BASE_URL}/api/files/${file.fieldConfig.subfolder}/${filename}`;

            sendMessage({
              type: 'progress',
              current,
              total: totalFiles,
              currentFile: filename,
              table: file.config.tableName,
              field: file.fieldConfig.name,
              recordId: file.recordId,
              downloaded,
              failed
            });

            const fileSize = await downloadFile(file.url, targetPath);
            totalSize += fileSize;
            downloaded++;

            // Update database
            if (file.fieldConfig.type === 'single') {
              await db
                .update(file.config.table)
                .set({ [file.fieldConfig.name]: newUrl })
                .where(eq((file.config.table as any)[file.config.idField], file.recordId));
            } else {
              // Array field - need to update specific element
              const currentRecord = await db
                .select({ urls: (file.config.table as any)[file.fieldConfig.name] })
                .from(file.config.table)
                .where(eq((file.config.table as any)[file.config.idField], file.recordId))
                .limit(1);

              if (currentRecord.length > 0 && Array.isArray(currentRecord[0].urls)) {
                const updatedUrls = [...currentRecord[0].urls];
                if (file.arrayIndex !== undefined) {
                  updatedUrls[file.arrayIndex] = newUrl;
                  await db
                    .update(file.config.table)
                    .set({ [file.fieldConfig.name]: updatedUrls })
                    .where(eq((file.config.table as any)[file.config.idField], file.recordId));
                }
              }
            }

            sendMessage({
              type: 'file_success',
              current,
              total: totalFiles,
              filename,
              fileSize: formatBytes(fileSize),
              downloaded,
              failed
            });

          } catch (error: any) {
            failed++;
            sendMessage({
              type: 'file_error',
              current,
              total: totalFiles,
              error: error.message,
              downloaded,
              failed
            });
          }
        }

        sendMessage({
          type: 'complete',
          scanned: totalFiles,
          downloaded,
          failed,
          totalSize: formatBytes(totalSize),
          message: `Migration complete: ${downloaded} downloaded, ${failed} failed`
        });

        controller.close();
      } catch (error: any) {
        sendMessage({ type: 'error', error: error.message });
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
