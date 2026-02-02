import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sedaRegistration, customers } from "@/db/schema";
import { eq } from "drizzle-orm";
import JSZip from "jszip";
import fs from "fs";
import path from "path";
import {
  sanitizeCustomerName,
} from "@/lib/seda-file-renamer";

const STORAGE_ROOT = '/storage';

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
 * Download ALL SEDA documents from storage as a ZIP file
 * Scans the actual storage folder instead of relying on database URLs
 */
export async function GET(
  request: NextRequest,
  { params }: RouteContext
) {
  try {
    const { bubble_id } = await params;

    // Fetch SEDA registration with customer
    const sedaData = await db
      .select({
        bubble_id: sedaRegistration.bubble_id,
        linked_customer: sedaRegistration.linked_customer,
        customer_name: customers.name,
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

    // Check if storage exists
    if (!fs.existsSync(STORAGE_ROOT)) {
      return NextResponse.json(
        { error: "Storage folder not found" },
        { status: 404 }
      );
    }

    // Scan storage for all files
    const allFiles = scanDirectory(STORAGE_ROOT);

    // Filter files related to this SEDA registration
    // Match by bubble_id or customer_id
    const relatedFiles = allFiles.filter(filePath => {
      const lowerPath = filePath.toLowerCase();
      return lowerPath.includes(bubble_id.toLowerCase()) ||
             (seda.linked_customer && lowerPath.includes(seda.linked_customer.toLowerCase()));
    });

    if (relatedFiles.length === 0) {
      return NextResponse.json(
        { error: "No documents found for this SEDA registration in storage" },
        { status: 404 }
      );
    }

    // Create ZIP file
    const zip = new JSZip();
    let successCount = 0;

    // Add all files to ZIP with clean names
    for (const relativePath of relatedFiles) {
      try {
        const fullPath = path.join(STORAGE_ROOT, relativePath);
        const fileBuffer = fs.readFileSync(fullPath);

        // Generate clean filename: CustomerName_OriginalFileName.ext
        const originalName = path.basename(relativePath);
        const ext = path.extname(originalName);
        const baseName = path.basename(originalName, ext);
        const cleanName = `${sanitizedName}_${baseName}${ext}`;

        zip.file(cleanName, fileBuffer);
        successCount++;
      } catch (error) {
        // Skip files that can't be read
      }
    }

    if (successCount === 0) {
      return NextResponse.json(
        { error: "Failed to read any files" },
        { status: 500 }
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
