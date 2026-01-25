import { NextRequest, NextResponse } from "next/server";
import { syncInvoiceWithFullIntegrity } from "@/lib/integrity-sync";
import { db } from "@/lib/db";
import { invoices, payments, submitted_payments, sedaRegistration } from "@/db/schema";
import { eq, inArray, isNotNull } from "drizzle-orm";
import path from "path";
import fs from "fs";

/**
 * POST /api/sync/invoice
 * Fast sync a single invoice by Bubble ID
 *
 * Body: { bubble_id: string, force?: boolean, skipUsers?: boolean, skipAgents?: boolean }
 *
 * This endpoint syncs a single invoice with full integrity:
 * - Syncs all relational data (customer, agent, payments, SEDA, items)
 * - Respects dependency order
 * - Automatically patches all file URLs (absolute URLs + Chinese filenames)
 * - Returns detailed sync results
 */
export async function POST(request: NextRequest) {
  const STORAGE_ROOT = '/storage';
  const FILE_BASE_URL = process.env.FILE_BASE_URL || 'https://admin.atap.solar';

  try {
    const body = await request.json();

    const { bubble_id, force = false, skipUsers = true, skipAgents = true } = body;

    // Validate input
    if (!bubble_id || typeof bubble_id !== 'string') {
      return NextResponse.json({
        success: false,
        error: 'bubble_id is required and must be a string'
      }, { status: 400 });
    }

    console.log(`[API] Fast Invoice Sync triggered for bubble_id: ${bubble_id}`);
    console.log(`[API] Options: force=${force}, skipUsers=${skipUsers}, skipAgents=${skipAgents}`);

    // Run the integrity sync
    const result = await syncInvoiceWithFullIntegrity(bubble_id, {
      force,
      skipUsers,
      skipAgents,
      onProgress: (step, message) => {
        console.log(`[API] [${bubble_id}] ${step}: ${message}`);
      }
    });

    if (!result.success) {
      return NextResponse.json({
        success: false,
        invoiceId: result.invoiceId,
        steps: result.steps,
        stats: result.stats,
        errors: result.errors
      });
    }

    console.log(`[API] Sync complete. Starting file URL patching...`);

    // ====================================================================
    // FILE PATCHING: Process all linked files
    // ====================================================================

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

    // Get the invoice from DB to find linked entities
    const invoice = await db.query.invoices.findFirst({
      where: eq(invoices.bubble_id, bubble_id)
    });

    if (!invoice) {
      console.log(`[API] Warning: Invoice ${bubble_id} not found after sync`);
      return NextResponse.json({
        success: true,
        invoiceId: result.invoiceId,
        steps: result.steps,
        stats: result.stats,
        errors: result.errors,
        filePatching: {
          skipped: true,
          reason: 'Invoice not found in database after sync'
        }
      });
    }

    let totalPatched = 0;
    let totalAbsoluteUrls = 0;
    const patchDetails: any[] = [];

    // ====================================================================
    // 1. Patch PAYMENT attachments (linked_payment array)
    // ====================================================================
    if (invoice.linked_payment && invoice.linked_payment.length > 0) {
      console.log(`[API] Patching ${invoice.linked_payment.length} payment(s)...`);

      // Check regular payments table
      const foundPayments = await db.select({
        id: payments.id,
        bubble_id: payments.bubble_id,
        attachment: payments.attachment
      })
      .from(payments)
      .where(inArray(payments.bubble_id, invoice.linked_payment));

      // Check submitted_payments table
      const foundSubmittedPayments = await db.select({
        id: submitted_payments.id,
        bubble_id: submitted_payments.bubble_id,
        attachment: submitted_payments.attachment
      })
      .from(submitted_payments)
      .where(inArray(submitted_payments.bubble_id, invoice.linked_payment));

      // Process regular payments
      for (const payment of foundPayments) {
        if (!payment.attachment || payment.attachment.length === 0) continue;

        const newUrls: string[] = [];
        let hasChanges = false;

        for (const url of payment.attachment) {
          let processedUrl = url;

          // 1. Convert to absolute URL if needed
          if (url && url.includes('/storage/')) {
            const storagePath = url.split('/storage/').pop() || '';
            if (storagePath) {
              processedUrl = `${FILE_BASE_URL}/api/files/${storagePath}`;
              hasChanges = true;
            }
          }

          // 2. Handle Chinese/non-ASCII filenames
          const filename = getFilenameFromUrl(processedUrl);
          if (filename && hasNonASCII(filename)) {
            let relativePath = processedUrl.replace(FILE_BASE_URL, '');
            if (relativePath.startsWith('/api/files/')) {
              relativePath = relativePath.replace('/api/files/', '');
            }

            const oldPath = path.join(STORAGE_ROOT, relativePath);
            const dir = path.dirname(oldPath);
            const sanitizedFilename = sanitizeFilename(filename);
            const newPath = path.join(dir, sanitizedFilename);

            // Rename file on disk if it exists
            if (fs.existsSync(oldPath)) {
              try {
                fs.renameSync(oldPath, newPath);
                console.log(`[API] Renamed: ${filename} -> ${sanitizedFilename}`);
                patchDetails.push({
                  entity: 'payment',
                  bubble_id: payment.bubble_id,
                  action: 'rename',
                  from: filename,
                  to: sanitizedFilename
                });
              } catch (err: any) {
                console.log(`[API] Failed to rename: ${err.message}`);
              }
            }

            // Generate new URL
            const newRelativePath = relativePath.replace(filename, sanitizedFilename);
            processedUrl = `${FILE_BASE_URL}/api/files/${newRelativePath}`;
            hasChanges = true;
            totalPatched++;
          }

          newUrls.push(processedUrl);

          if (url.includes('/storage/') && url !== processedUrl) {
            totalAbsoluteUrls++;
          }
        }

        // Update database if changed
        if (hasChanges) {
          await db.update(payments)
            .set({ attachment: newUrls })
            .where(eq(payments.id, payment.id));

          console.log(`[API] Updated payment ${payment.bubble_id} (${newUrls.length} files)`);
        }
      }

      // Process submitted payments (same logic)
      for (const payment of foundSubmittedPayments) {
        if (!payment.attachment || payment.attachment.length === 0) continue;

        const newUrls: string[] = [];
        let hasChanges = false;

        for (const url of payment.attachment) {
          let processedUrl = url;

          // 1. Convert to absolute URL if needed
          if (url && url.includes('/storage/')) {
            const storagePath = url.split('/storage/').pop() || '';
            if (storagePath) {
              processedUrl = `${FILE_BASE_URL}/api/files/${storagePath}`;
              hasChanges = true;
            }
          }

          // 2. Handle Chinese/non-ASCII filenames
          const filename = getFilenameFromUrl(processedUrl);
          if (filename && hasNonASCII(filename)) {
            let relativePath = processedUrl.replace(FILE_BASE_URL, '');
            if (relativePath.startsWith('/api/files/')) {
              relativePath = relativePath.replace('/api/files/', '');
            }

            const oldPath = path.join(STORAGE_ROOT, relativePath);
            const dir = path.dirname(oldPath);
            const sanitizedFilename = sanitizeFilename(filename);
            const newPath = path.join(dir, sanitizedFilename);

            if (fs.existsSync(oldPath)) {
              try {
                fs.renameSync(oldPath, newPath);
                console.log(`[API] Renamed: ${filename} -> ${sanitizedFilename}`);
              } catch (err: any) {
                console.log(`[API] Failed to rename: ${err.message}`);
              }
            }

            const newRelativePath = relativePath.replace(filename, sanitizedFilename);
            processedUrl = `${FILE_BASE_URL}/api/files/${newRelativePath}`;
            hasChanges = true;
            totalPatched++;
          }

          newUrls.push(processedUrl);

          if (url.includes('/storage/') && url !== processedUrl) {
            totalAbsoluteUrls++;
          }
        }

        if (hasChanges) {
          await db.update(submitted_payments)
            .set({ attachment: newUrls })
            .where(eq(submitted_payments.id, payment.id));

          console.log(`[API] Updated submitted payment ${payment.bubble_id} (${newUrls.length} files)`);
        }
      }
    }

    // ====================================================================
    // 2. Patch SEDA Registration files
    // ====================================================================
    if (invoice.linked_seda_registration) {
      console.log(`[API] Patching SEDA registration ${invoice.linked_seda_registration}...`);

      // SEDA file fields to patch
      const sedaFileFields = [
        'customer_signature', 'ic_copy_front', 'ic_copy_back',
        'tnb_bill_1', 'tnb_bill_2', 'tnb_bill_3', 'nem_cert',
        'mykad_pdf', 'property_ownership_prove'
      ];

      const sedaArrayFields = [
        'roof_images', 'site_images', 'drawing_pdf_system',
        'drawing_system_actual', 'drawing_engineering_seda_pdf'
      ];

      const seda = await db.query.sedaRegistration.findFirst({
        where: eq(sedaRegistration.bubble_id, invoice.linked_seda_registration)
      });

      if (seda) {
        const updates: any = { updated_at: new Date() };

        // Process single file fields
        for (const field of sedaFileFields) {
          const url = (seda as any)[field];
          if (!url) continue;

          let processedUrl = url;
          let hasChanges = false;

          // 1. Convert to absolute URL
          if (url.includes('/storage/')) {
            const storagePath = url.split('/storage/').pop() || '';
            if (storagePath) {
              processedUrl = `${FILE_BASE_URL}/api/files/${storagePath}`;
              hasChanges = true;
            }
          }

          // 2. Handle Chinese filenames
          const filename = getFilenameFromUrl(processedUrl);
          if (filename && hasNonASCII(filename)) {
            let relativePath = processedUrl.replace(FILE_BASE_URL, '');
            if (relativePath.startsWith('/api/files/')) {
              relativePath = relativePath.replace('/api/files/', '');
            }

            const oldPath = path.join(STORAGE_ROOT, relativePath);
            const dir = path.dirname(oldPath);
            const sanitizedFilename = sanitizeFilename(filename);
            const newPath = path.join(dir, sanitizedFilename);

            if (fs.existsSync(oldPath)) {
              try {
                fs.renameSync(oldPath, newPath);
                console.log(`[API] SEDA renamed: ${filename} -> ${sanitizedFilename}`);
                patchDetails.push({
                  entity: 'seda_registration',
                  bubble_id: seda.bubble_id,
                  field,
                  action: 'rename',
                  from: filename,
                  to: sanitizedFilename
                });
              } catch (err: any) {
                console.log(`[API] Failed to rename: ${err.message}`);
              }
            }

            const newRelativePath = relativePath.replace(filename, sanitizedFilename);
            processedUrl = `${FILE_BASE_URL}/api/files/${newRelativePath}`;
            hasChanges = true;
            totalPatched++;
          }

          if (hasChanges) {
            (updates as any)[field] = processedUrl;
          }

          if (url.includes('/storage/') && url !== processedUrl) {
            totalAbsoluteUrls++;
          }
        }

        // Process array file fields
        for (const field of sedaArrayFields) {
          const urls = (seda as any)[field] as string[] | null;
          if (!urls || urls.length === 0) continue;

          const newUrls: string[] = [];

          for (const url of urls) {
            let processedUrl = url;
            let hasChanges = false;

            // 1. Convert to absolute URL
            if (url.includes('/storage/')) {
              const storagePath = url.split('/storage/').pop() || '';
              if (storagePath) {
                processedUrl = `${FILE_BASE_URL}/api/files/${storagePath}`;
                hasChanges = true;
              }
            }

            // 2. Handle Chinese filenames
            const filename = getFilenameFromUrl(processedUrl);
            if (filename && hasNonASCII(filename)) {
              let relativePath = processedUrl.replace(FILE_BASE_URL, '');
              if (relativePath.startsWith('/api/files/')) {
                relativePath = relativePath.replace('/api/files/', '');
              }

              const oldPath = path.join(STORAGE_ROOT, relativePath);
              const dir = path.dirname(oldPath);
              const sanitizedFilename = sanitizeFilename(filename);
              const newPath = path.join(dir, sanitizedFilename);

              if (fs.existsSync(oldPath)) {
                try {
                  fs.renameSync(oldPath, newPath);
                  console.log(`[API] SEDA array field renamed: ${filename} -> ${sanitizedFilename}`);
                } catch (err: any) {
                  console.log(`[API] Failed to rename: ${err.message}`);
                }
              }

              const newRelativePath = relativePath.replace(filename, sanitizedFilename);
              processedUrl = `${FILE_BASE_URL}/api/files/${newRelativePath}`;
              hasChanges = true;
              totalPatched++;
            }

            newUrls.push(processedUrl);

            if (url.includes('/storage/') && url !== processedUrl) {
              totalAbsoluteUrls++;
            }
          }

          (updates as any)[field] = newUrls;
        }

        // Apply SEDA updates
        if (Object.keys(updates).length > 1) { // More than just updated_at
          await db.update(sedaRegistration)
            .set(updates)
            .where(eq(sedaRegistration.id, seda.id));

          console.log(`[API] Updated SEDA registration ${seda.bubble_id}`);
        }
      }
    }

    console.log(`[API] File patching complete: ${totalPatched} Chinese filenames patched, ${totalAbsoluteUrls} URLs converted to absolute`);

    // Return the sync result with file patching info
    return NextResponse.json({
      success: true,
      invoiceId: result.invoiceId,
      steps: result.steps,
      stats: result.stats,
      errors: result.errors,
      filePatching: {
        totalPatched,
        totalAbsoluteUrls,
        details: patchDetails
      }
    });

  } catch (error: any) {
    console.error('[API] Fast Invoice Sync error:', error);

    return NextResponse.json({
      success: false,
      error: error.message || 'Unknown error occurred'
    }, { status: 500 });
  }
}

/**
 * GET /api/sync/invoice
 * Returns endpoint info
 */
export async function GET() {
  return NextResponse.json({
    endpoint: "/api/sync/invoice",
    method: "POST",
    description: "Fast sync a single invoice by Bubble ID with full integrity and automatic file patching",
    features: [
      "Syncs invoice with all relations (customer, agent, payments, SEDA, items)",
      "Automatically patches file URLs (converts /storage/ to absolute URLs)",
      "Handles Chinese/non-ASCII filenames (renames files + updates database)",
      "Patches payment attachments (both payment and submitted_payment tables)",
      "Patches SEDA registration files (all 13 file fields)"
    ],
    body: {
      bubble_id: "string (required) - The Bubble ID of the invoice to sync",
      force: "boolean (optional, default: false) - Skip timestamp check and force sync",
      skipUsers: "boolean (optional, default: true) - Skip syncing users (they rarely change)",
      skipAgents: "boolean (optional, default: true) - Skip syncing agents (they rarely change)"
    },
    response: {
      success: "boolean",
      invoiceId: "string",
      steps: "array of sync step results",
      stats: "sync statistics per entity",
      errors: "array of error messages",
      filePatching: {
        totalPatched: "number of Chinese filenames patched",
        totalAbsoluteUrls: "number of URLs converted to absolute",
        details: "array of file rename details"
      }
    },
    example: {
      bubble_id: "1647839483923x8394832",
      force: false,
      skipUsers: true,
      skipAgents: true
    }
  });
}
