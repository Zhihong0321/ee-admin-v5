import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sedaRegistration, customers, invoices } from "@/db/schema";
import { eq, or, sql } from "drizzle-orm";
import JSZip from "jszip";
import fs from "fs";
import path from "path";
import {
  extractAllFiles,
  downloadFile,
  generateFileName,
  sanitizeCustomerName,
} from "@/lib/seda-file-renamer";
import { migrateSedaFilesToLocalByBubbleId } from "@/app/sync/actions/bubble-file-migration";

interface RouteContext {
  params: Promise<{
    bubble_id: string;
  }>;
}

/**
 * Recursively scan directory for files
 */
function scanDirectory(dirPath: string, basePath: string = ''): string[] {
  const files: string[] = [];

  if (!fs.existsSync(dirPath)) return files;

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = basePath ? path.join(basePath, entry.name) : entry.name;

      if (entry.isDirectory()) {
        files.push(...scanDirectory(fullPath, relativePath));
      } else if (entry.isFile()) {
        files.push(relativePath);
      }
    }
  } catch (error) {
    // Skip directories we can't read
  }

  return files;
}

/**
 * Site photos for every invoice linked to this SEDA registration.
 *
 * The SEDA array columns are no longer the whole picture: photos uploaded since
 * the cutover live in ee_attachment, pre-cutover ones live in the legacy invoice
 * arrays, and soft-deleted ones must not leave the building at all. Roof is an
 * allow-list and site is a catch-all, so an unrecognised doc_type still ends up
 * in the ZIP instead of being silently dropped. Mirrors
 * src/app/api/engineering-v2/route.ts.
 */
async function fetchInvoicePhotos(sedaBubbleId: string): Promise<{
  roof: string[];
  site: string[];
  suppressed: Set<string>;
}> {
  const result = await db.execute(sql`
    SELECT
      COALESCE(att.ee_roof, ARRAY[]::text[])                 AS ee_roof,
      COALESCE(att.ee_site, ARRAY[]::text[])                 AS ee_site,
      COALESCE(i.linked_roof_image, ARRAY[]::text[])         AS legacy_roof,
      COALESCE(i.site_assessment_image, ARRAY[]::text[])     AS legacy_site,
      COALESCE(sup.urls, ARRAY[]::text[])                    AS suppressed
    FROM invoice i
    JOIN seda_registration sr
      ON (i.linked_seda_registration = sr.bubble_id
          OR i.bubble_id = ANY(COALESCE(sr.linked_invoice, ARRAY[]::text[])))
    LEFT JOIN LATERAL (
      SELECT
        array_agg(a2.file_url ORDER BY a2.sort_order NULLS LAST, a2.id)
          FILTER (WHERE a2.doc_type IN ('roof_angle', 'roof_closeup')) AS ee_roof,
        array_agg(a2.file_url ORDER BY a2.sort_order NULLS LAST, a2.id)
          FILTER (WHERE COALESCE(a2.doc_type, '') NOT IN ('roof_angle', 'roof_closeup')) AS ee_site
      FROM ee_attachment a2
      WHERE a2.owner_type = 'invoice'
        AND a2.owner_id   = i.bubble_id
        AND a2.category   = 'site_assessment'
        AND a2.deleted_at IS NULL
        AND a2.purged_at  IS NULL
    ) att ON TRUE
    LEFT JOIN LATERAL (
      SELECT array_agg(a3.file_url) AS urls
      FROM ee_attachment a3
      WHERE a3.owner_type = 'invoice'
        AND a3.owner_id   = i.bubble_id
        AND (a3.deleted_at IS NOT NULL OR a3.purged_at IS NOT NULL)
    ) sup ON TRUE
    WHERE sr.bubble_id = ${sedaBubbleId}
      AND COALESCE(i.is_deleted, false) = false
      AND i.status <> 'deleted'
  `);

  const roof: string[] = [];
  const site: string[] = [];
  const suppressed = new Set<string>();

  for (const row of result.rows as any[]) {
    roof.push(...toUrlArray(row.ee_roof), ...toUrlArray(row.legacy_roof));
    site.push(...toUrlArray(row.ee_site), ...toUrlArray(row.legacy_site));
    for (const url of toUrlArray(row.suppressed)) suppressed.add(url);
  }

  // An invoice can exist in several versions; a URL that is live on any of them
  // is live, so only suppress URLs no version still holds.
  for (const url of [...roof, ...site]) suppressed.delete(url);

  return { roof, site, suppressed };
}

function toUrlArray(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]).filter(Boolean) : [];
}

/**
 * GET /api/seda/[bubble_id]/download
 * Download all SEDA documents as a ZIP file with renamed filenames
 */
export async function GET(
  request: NextRequest,
  { params }: RouteContext
) {
  try {
    const { bubble_id } = await params;

    // Fetch SEDA data with customer name via invoice (invoice is the center of data relationship)
    // Flow: SEDA <- invoice.linked_seda_registration -> invoice.linked_customer -> customer
    const fetchSedaData = async () => {
      return db
        .select({
          bubble_id: sedaRegistration.bubble_id,
          mykad_pdf: sedaRegistration.mykad_pdf,
          ic_copy_front: sedaRegistration.ic_copy_front,
          ic_copy_back: sedaRegistration.ic_copy_back,
          tnb_bill_1: sedaRegistration.tnb_bill_1,
          tnb_bill_2: sedaRegistration.tnb_bill_2,
          tnb_bill_3: sedaRegistration.tnb_bill_3,
          tnb_bills_12_months: sedaRegistration.tnb_bills_12_months,
          tnb_meter: sedaRegistration.tnb_meter,
          customer_signature: sedaRegistration.customer_signature,
          property_ownership_prove: sedaRegistration.property_ownership_prove,
          nem_cert: sedaRegistration.nem_cert,
          e_contact_mykad: sedaRegistration.e_contact_mykad,
          drawing_system_submitted: sedaRegistration.drawing_system_submitted,
          g_electric_folder_link: sedaRegistration.g_electric_folder_link,
          g_roof_folder_link: sedaRegistration.g_roof_folder_link,
          roof_images: sedaRegistration.roof_images,
          site_images: sedaRegistration.site_images,
          drawing_pdf_system: sedaRegistration.drawing_pdf_system,
          drawing_system_actual: sedaRegistration.drawing_system_actual,
          drawing_engineering_seda_pdf: sedaRegistration.drawing_engineering_seda_pdf,
          ssm_form_9: sedaRegistration.ssm_form_9,
          ssm_form_49: sedaRegistration.ssm_form_49,
          director_ic_front: sedaRegistration.director_ic_front,
          director_ic_back: sedaRegistration.director_ic_back,
          customer_name: customers.name,
        })
        .from(sedaRegistration)
        .leftJoin(invoices, or(eq(invoices.linked_seda_registration, sedaRegistration.bubble_id), sql`${invoices.bubble_id} = ANY(${sedaRegistration.linked_invoice})`))
        .leftJoin(customers, eq(invoices.linked_customer, customers.customer_id))
        .where(eq(sedaRegistration.bubble_id, bubble_id))
        .limit(1);
    };

    // Fetch SEDA registration with customer
    const sedaData = await fetchSedaData();

    if (sedaData.length === 0) {
      return NextResponse.json(
        { error: "SEDA registration not found" },
        { status: 404 }
      );
    }

    const seda = sedaData[0];
    const customerName = seda.customer_name || "UnknownCustomer";
    const sanitizedName = sanitizeCustomerName(customerName);

    // Migrate this SEDA's files to local storage before zipping
    const migrationResult = await migrateSedaFilesToLocalByBubbleId(bubble_id);

    // Re-fetch after migration to ensure URLs are updated
    const refreshedData = await fetchSedaData();
    const refreshedSeda = refreshedData.length > 0 ? refreshedData[0] : seda;

    // Extract all file URLs with new names
    const sedaFiles = extractAllFiles(refreshedSeda, customerName);

    // Fold in the invoice-owned photos (ee_attachment + legacy invoice arrays)
    // and drop anything soft-deleted, including SEDA array entries that were
    // deleted through a tombstone row rather than by editing the array.
    const invoicePhotos = await fetchInvoicePhotos(bubble_id);
    const files = sedaFiles.filter((f) => !invoicePhotos.suppressed.has(f.url));
    const suppressedFromSeda = sedaFiles.length - files.length;

    const seenUrls = new Set(files.map((f) => f.url));
    const usedNames = new Set(files.map((f) => f.newName));
    const nextIndex = { RoofImage: 1, SiteImage: 1 };

    for (const [urls, displayName] of [
      [invoicePhotos.roof, "RoofImage"],
      [invoicePhotos.site, "SiteImage"],
    ] as const) {
      for (const url of urls) {
        if (!url || invoicePhotos.suppressed.has(url) || seenUrls.has(url)) continue;
        seenUrls.add(url);

        // Names come from the SEDA arrays first, so skip past any index they
        // already used rather than silently overwriting an entry in the ZIP.
        let newName = generateFileName(customerName, displayName, nextIndex[displayName], url);
        while (usedNames.has(newName)) {
          nextIndex[displayName]++;
          newName = generateFileName(customerName, displayName, nextIndex[displayName], url);
        }
        usedNames.add(newName);
        nextIndex[displayName]++;
        files.push({ url, newName });
      }
    }

    // Create ZIP file
    const zip = new JSZip();
    let successCount = 0;
    let failCount = 0;
    const downloadFailures: Array<{ name: string; url: string; error: string }> = [];

    // Add all files to ZIP
    for (const file of files) {
      try {
        const isLocal = file.url.includes("/api/files/") || file.url.includes("/storage/");
        if (!isLocal) {
          failCount++;
          downloadFailures.push({
            name: file.newName,
            url: file.url,
            error: "Not migrated to local storage",
          });
          continue;
        }

        const fileBuffer = await downloadFile(file.url);
        zip.file(file.newName, fileBuffer);
        successCount++;
      } catch (error) {
        failCount++;
        downloadFailures.push({
          name: file.newName,
          url: file.url,
          error: (error as Error).message,
        });
        // Continue with other files even if one fails
      }
    }

    const manifest = {
      bubble_id,
      customer_name: customerName,
      migration: migrationResult,
      files_from_seda_columns: sedaFiles.length,
      files_added_from_invoice_photos: files.length - (sedaFiles.length - suppressedFromSeda),
      files_omitted_as_deleted: suppressedFromSeda,
      files_found: files.length,
      downloaded: successCount,
      failed: failCount,
      download_failures: downloadFailures,
    };

    zip.file("download_manifest.json", JSON.stringify(manifest, null, 2));

    // Generate ZIP buffer
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    // Return ZIP file with proper headers
    const zipFilename = `${sanitizedName}_All_Documents.zip`;

    return new Response(zipBuffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipFilename}"`,
        "Content-Length": zipBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('[DOWNLOAD] Failed:', (error as Error).message);
    return NextResponse.json(
      { error: "Failed to download documents", details: (error as Error).message },
      { status: 500 }
    );
  }
}
