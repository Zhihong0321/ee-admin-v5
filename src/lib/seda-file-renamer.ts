import { sedaRegistration } from "@/db/schema";
import fs from "fs";
import path from "path";

/**
 * File field mappings for SEDA document download
 */
interface FileFieldMapping {
  field: keyof typeof sedaRegistration._.columns;
  displayName: string;
  isArray: boolean;
}

export const FILE_MAPPINGS: FileFieldMapping[] = [
  // Single files
  { field: "mykad_pdf", displayName: "MyKadPDF", isArray: false },
  { field: "ic_copy_front", displayName: "MyKadFront", isArray: false },
  { field: "ic_copy_back", displayName: "MyKadBack", isArray: false },
  { field: "tnb_bill_1", displayName: "TNB_Bill01", isArray: false },
  { field: "tnb_bill_2", displayName: "TNB_Bill02", isArray: false },
  { field: "tnb_bill_3", displayName: "TNB_Bill03", isArray: false },
  { field: "tnb_meter", displayName: "TNBMeter", isArray: false },
  { field: "customer_signature", displayName: "CustomerSignature", isArray: false },
  { field: "property_ownership_prove", displayName: "PropertyOwnership", isArray: false },
  { field: "nem_cert", displayName: "NEMCert", isArray: false },
  { field: "e_contact_mykad", displayName: "EmergencyMyKad", isArray: false },
  { field: "drawing_system_submitted", displayName: "DrawingSystemSubmitted", isArray: false },
  { field: "g_electric_folder_link", displayName: "GElectricFolder", isArray: false },
  { field: "g_roof_folder_link", displayName: "GRoofFolder", isArray: false },

  // Array files (multiple images/PDFs)
  { field: "roof_images", displayName: "RoofImage", isArray: true },
  { field: "site_images", displayName: "SiteImage", isArray: true },
  { field: "drawing_pdf_system", displayName: "DrawingSystem", isArray: true },
  { field: "drawing_system_actual", displayName: "DrawingSystemActual", isArray: true },
  { field: "drawing_engineering_seda_pdf", displayName: "DrawingEngineeringSEDA", isArray: true },
];

/**
 * Sanitize customer name for filename
 * - Replace spaces with underscores
 * - Remove special characters
 * - Limit to 50 characters
 */
export function sanitizeCustomerName(name: string | null): string {
  if (!name) return "UnknownCustomer";

  return name
    .trim()
    .replace(/[^a-zA-Z0-9\s-]/g, "") // Remove special chars
    .replace(/\s+/g, "_") // Spaces to underscores
    .replace(/-+/g, "_") // Hyphens to underscores
    .substring(0, 50); // Max 50 chars
}

/**
 * Extract file extension from URL
 * Handles both /api/files/ and external URLs
 */
export function getFileExtension(url: string): string {
  if (!url) return "jpg"; // Default fallback

  // Handle /api/files/ path format
  if (url.includes("/api/files/") || url.includes("/storage/")) {
    const filename = url.split("/").pop() || "";
    const ext = filename.split(".").pop();
    return ext || "jpg";
  }

  // Handle standard URLs
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const ext = pathname.split(".").pop();
    return ext || "jpg";
  } catch {
    return "jpg"; // Default fallback
  }
}

/**
 * Generate renamed filename for SEDA document
 * Format: {CustomerName}_{DocumentType}{Index}.{extension}
 * Example: Gan_Zhi_Hong_RoofImage01.jpg
 */
export function generateFileName(
  customerName: string,
  documentType: string,
  index: number,
  originalUrl: string
): string {
  // Extract extension from URL
  const extension = getFileExtension(originalUrl);

  // Sanitize customer name
  const sanitizedName = sanitizeCustomerName(customerName);

  // Build filename
  // Array files: Gan_Zhi_Hong_RoofImage01.jpg
  // Single files: Gan_Zhi_Hong_MyKadPDF.pdf
  const indexSuffix = index > 0 ? String(index).padStart(2, "0") : "";

  return `${sanitizedName}_${documentType}${indexSuffix}.${extension}`;
}

/**
 * Download file from URL
 * Handles both local /api/files/ and external URLs
 */
export async function downloadFile(url: string): Promise<Buffer> {
  if (!url || url.trim() === "") {
    throw new Error("Invalid URL: URL is empty");
  }

  console.log(`[downloadFile] Attempting to download: ${url}`);

  // Handle local /api/files/ URLs
  if (url.startsWith("/api/files/") || url.startsWith("/storage/")) {
    // Extract path from URL
    const localPath = url.replace("/api/files/", "").replace("/storage/", "");
    const fullPath = path.join(process.cwd(), "storage", localPath);

    console.log(`[downloadFile] Local file path: ${fullPath}`);

    // Check if file exists
    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${fullPath}`);
    }

    const buffer = fs.readFileSync(fullPath);
    console.log(`[downloadFile] Successfully read local file: ${buffer.length} bytes`);
    return buffer;
  }

  // Handle external URLs (Bubble.io, etc.)
  try {
    console.log(`[downloadFile] Fetching external URL: ${url}`);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    console.log(`[downloadFile] Successfully downloaded external file: ${buffer.length} bytes`);
    return buffer;
  } catch (error: any) {
    throw new Error(`Failed to download external file: ${error.message}`);
  }
}

/**
 * Extract all file URLs from SEDA registration data
 * Returns array of { url, newName } objects
 */
export function extractAllFiles(sedaData: any, customerName: string) {
  const files: { url: string; newName: string }[] = [];

  console.log(`[extractAllFiles] Processing SEDA data for customer: ${customerName}`);
  console.log(`[extractAllFiles] Total field mappings to check: ${FILE_MAPPINGS.length}`);

  for (const mapping of FILE_MAPPINGS) {
    const fieldValue = sedaData[mapping.field];

    // Detailed logging for ownership document
    if (mapping.field === 'property_ownership_prove') {
      console.log(`[extractAllFiles] Field "${mapping.field}":`, {
        value: fieldValue,
        type: typeof fieldValue,
        isEmpty: !fieldValue,
        isWhitespace: fieldValue?.trim?.() === '',
      });
    } else {
      console.log(`[extractAllFiles] Field "${mapping.field}":`, fieldValue ? "HAS VALUE" : "NULL/EMPTY");
    }

    if (!fieldValue) continue;

    if (mapping.isArray) {
      // Handle array fields
      const urls = Array.isArray(fieldValue) ? fieldValue : [];
      console.log(`[extractAllFiles] Array field "${mapping.field}" has ${urls.length} items`);

      urls.forEach((url: string, index: number) => {
        if (url && url.trim() !== "") {
          const newName = generateFileName(
            customerName,
            mapping.displayName,
            index + 1,
            url
          );
          files.push({ url, newName });
          console.log(`[extractAllFiles] Added: ${newName}`);
        }
      });
    } else {
      // Handle single fields
      if (fieldValue && fieldValue.trim() !== "") {
        const newName = generateFileName(
          customerName,
          mapping.displayName,
          0,
          fieldValue
        );
        files.push({ url: fieldValue, newName });
        console.log(`[extractAllFiles] Added: ${newName}`);
      }
    }
  }

  console.log(`[extractAllFiles] Total files extracted: ${files.length}`);
  return files;
}
