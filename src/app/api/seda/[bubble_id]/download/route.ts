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
    const files = extractAllFiles(refreshedSeda, customerName);

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
