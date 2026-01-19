import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sedaRegistration, customers } from "@/db/schema";
import { eq } from "drizzle-orm";
import JSZip from "jszip";
import {
  extractAllFiles,
  downloadFile,
  sanitizeCustomerName,
} from "@/lib/seda-file-renamer";

interface RouteContext {
  params: Promise<{
    bubble_id: string;
  }>;
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

    // Fetch SEDA registration with customer
    const sedaData = await db
      .select({
        bubble_id: sedaRegistration.bubble_id,
        linked_customer: sedaRegistration.linked_customer,
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
        roof_images: sedaRegistration.roof_images,
        site_images: sedaRegistration.site_images,
        drawing_pdf_system: sedaRegistration.drawing_pdf_system,
        drawing_system_actual: sedaRegistration.drawing_system_actual,
        drawing_engineering_seda_pdf: sedaRegistration.drawing_engineering_seda_pdf,
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

    // Extract all file URLs with new names
    const files = extractAllFiles(seda, customerName);

    console.log(`Found ${files.length} files for download`);
    files.forEach(f => console.log(`  - ${f.newName}: ${f.url}`));

    if (files.length === 0) {
      return NextResponse.json(
        { error: "No documents found for this SEDA registration" },
        { status: 404 }
      );
    }

    // Create ZIP file
    const zip = new JSZip();
    let successCount = 0;
    let failCount = 0;

    // Add all files to ZIP
    for (const file of files) {
      try {
        console.log(`Downloading: ${file.newName} from ${file.url}`);
        const fileBuffer = await downloadFile(file.url);
        zip.file(file.newName, fileBuffer);
        successCount++;
        console.log(`✓ Successfully added: ${file.newName} (${fileBuffer.length} bytes)`);
      } catch (error) {
        failCount++;
        console.error(`✗ Failed to download file: ${file.url}`, error);
        // Continue with other files even if one fails
      }
    }

    console.log(`Download complete: ${successCount} succeeded, ${failCount} failed`);

    if (successCount === 0) {
      return NextResponse.json(
        { error: "Failed to download any files. All files are missing or inaccessible." },
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
    console.error("Error downloading SEDA documents:", error);
    return NextResponse.json(
      { error: "Failed to download documents" },
      { status: 500 }
    );
  }
}
