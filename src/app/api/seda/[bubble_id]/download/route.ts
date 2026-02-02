import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sedaRegistration, customers } from "@/db/schema";
import { eq } from "drizzle-orm";
import JSZip from "jszip";
import fs from "fs";
import path from "path";
import {
  sanitizeCustomerName,
  getFileExtension,
} from "@/lib/seda-file-renamer";

const STORAGE_ROOT = '/storage';

/**
 * Check if URL is from Bubble.io or external storage
 */
function isExternalUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const lower = url.toLowerCase();
  return lower.includes('bubble.io') ||
         lower.includes('bubbleapps.io') ||
         lower.includes('s3.amazonaws.com') ||
         lower.includes('amazonaws.com') ||
         (lower.startsWith('http://') && !lower.includes('/api/files/')) ||
         (lower.startsWith('https://') && !lower.includes('/api/files/')) ||
         lower.startsWith('//');
}

/**
 * Download file from external URL (Bubble.io, S3, etc.)
 */
async function downloadExternalFile(url: string): Promise<Buffer> {
  const fullUrl = url.startsWith('//') ? `https:${url}` : url;
  const response = await fetch(fullUrl);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

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
 * Download ALL SEDA documents from storage AND database URLs
 * Handles both local /storage files AND external Bubble.io URLs
 */
export async function GET(
  request: NextRequest,
  { params }: RouteContext
) {
  try {
    const { bubble_id } = await params;

    // Fetch SEDA registration with ALL document fields
    const sedaData = await db
      .select({
        bubble_id: sedaRegistration.bubble_id,
        linked_customer: sedaRegistration.linked_customer,
        customer_name: customers.name,
        mykad_pdf: sedaRegistration.mykad_pdf,
        ic_copy_front: sedaRegistration.ic_copy_front,
        ic_copy_back: sedaRegistration.ic_copy_back,
        tnb_bill_1: sedaRegistration.tnb_bill_1,
        tnb_bill_2: sedaRegistration.tnb_bill_2,
        tnb_bill_3: sedaRegistration.tnb_bill_3,
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
      })
      .from(sedaRegistration)
      .leftJoin(customers, eq(sedaRegistration.linked_customer, customers.customer_id))
      .where(eq(sedaRegistration.bubble_id, bubble_id))
      .limit(1);

    if (sedaData.length === 0) {
      return NextResponse.json(
        { error: "SEDA registration not found" },
        { status: 404 }
      );
    }

    const seda = sedaData[0];
    const customerName = seda.customer_name || "UnknownCustomer";
    const sanitizedName = sanitizeCustomerName(customerName);

    const zip = new JSZip();
    let fileCount = 0;
    const addedFiles = new Set<string>(); // Track filenames to avoid duplicates

    // STEP 1: Scan local storage folder for files
    if (fs.existsSync(STORAGE_ROOT)) {
      const allFiles = scanDirectory(STORAGE_ROOT);

      for (const relativePath of allFiles) {
        const lowerPath = relativePath.toLowerCase();
        // Match files by bubble_id or customer_id
        if (lowerPath.includes(bubble_id.toLowerCase()) ||
            (seda.linked_customer && lowerPath.includes(seda.linked_customer.toLowerCase()))) {

          try {
            const fullPath = path.join(STORAGE_ROOT, relativePath);
            const fileBuffer = fs.readFileSync(fullPath);
            const originalName = path.basename(relativePath);
            const cleanName = `${sanitizedName}_${originalName}`;

            if (!addedFiles.has(cleanName)) {
              zip.file(cleanName, fileBuffer);
              addedFiles.add(cleanName);
              fileCount++;
            }
          } catch (error) {
            // Skip files that can't be read
          }
        }
      }
    }

    // STEP 2: Download external URLs from database (Bubble.io, S3, etc.)
    const fieldMappings = [
      { field: 'mykad_pdf', name: 'MyKadPDF' },
      { field: 'ic_copy_front', name: 'MyKadFront' },
      { field: 'ic_copy_back', name: 'MyKadBack' },
      { field: 'tnb_bill_1', name: 'TNB_Bill1' },
      { field: 'tnb_bill_2', name: 'TNB_Bill2' },
      { field: 'tnb_bill_3', name: 'TNB_Bill3' },
      { field: 'tnb_meter', name: 'TNB_Meter' },
      { field: 'customer_signature', name: 'Signature' },
      { field: 'property_ownership_prove', name: 'Ownership' },
      { field: 'nem_cert', name: 'NEM_Cert' },
      { field: 'e_contact_mykad', name: 'EmergencyMyKad' },
      { field: 'drawing_system_submitted', name: 'DrawingSubmitted' },
      { field: 'g_electric_folder_link', name: 'GElectricFolder' },
      { field: 'g_roof_folder_link', name: 'GRoofFolder' },
    ];

    const arrayFieldMappings = [
      { field: 'roof_images', name: 'RoofImage' },
      { field: 'site_images', name: 'SiteImage' },
      { field: 'drawing_pdf_system', name: 'DrawingSystem' },
      { field: 'drawing_system_actual', name: 'DrawingActual' },
      { field: 'drawing_engineering_seda_pdf', name: 'DrawingSEDA' },
    ];

    // Process single file fields
    for (const mapping of fieldMappings) {
      const url = seda[mapping.field];
      if (url && isExternalUrl(url)) {
        try {
          const buffer = await downloadExternalFile(url);
          const ext = getFileExtension(url);
          const filename = `${sanitizedName}_${mapping.name}.${ext}`;

          if (!addedFiles.has(filename)) {
            zip.file(filename, buffer);
            addedFiles.add(filename);
            fileCount++;
          }
        } catch (error) {
          // Skip failed downloads
        }
      }
    }

    // Process array file fields
    for (const mapping of arrayFieldMappings) {
      const urls = seda[mapping.field];
      if (Array.isArray(urls)) {
        for (let i = 0; i < urls.length; i++) {
          const url = urls[i];
          if (url && isExternalUrl(url)) {
            try {
              const buffer = await downloadExternalFile(url);
              const ext = getFileExtension(url);
              const index = String(i + 1).padStart(2, '0');
              const filename = `${sanitizedName}_${mapping.name}${index}.${ext}`;

              if (!addedFiles.has(filename)) {
                zip.file(filename, buffer);
                addedFiles.add(filename);
                fileCount++;
              }
            } catch (error) {
              // Skip failed downloads
            }
          }
        }
      }
    }

    if (fileCount === 0) {
      return NextResponse.json(
        { error: "No documents found for this SEDA registration" },
        { status: 404 }
      );
    }

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
    return NextResponse.json(
      { error: "Failed to download documents" },
      { status: 500 }
    );
  }
}
