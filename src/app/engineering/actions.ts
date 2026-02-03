"use server";

import { db } from "@/lib/db";
import { invoices, sedaRegistration, customers, agents } from "@/db/schema";
import { eq, sql, and, desc, or, ilike } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import fs from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";

const STORAGE_ROOT = "/storage";
const FILE_BASE_URL = process.env.FILE_BASE_URL || "https://admin.atap.solar";

/**
 * Fetch invoices with engineering-related data
 */
export async function getEngineeringInvoices(search?: string) {
  try {
    let whereCondition = sql`${invoices.status} != 'deleted'`;

    if (search) {
      whereCondition = and(
        whereCondition,
        or(
          ilike(invoices.invoice_number, `%${search}%`),
          ilike(customers.name, `%${search}%`),
          ilike(agents.name, `%${search}%`),
          ilike(sedaRegistration.installation_address, `%${search}%`)
        )
      )!;
    }

    const results = await db
      .select({
        id: invoices.id,
        invoice_number: invoices.invoice_number,
        total_amount: invoices.total_amount,
        invoice_date: invoices.invoice_date,
        status: invoices.status,
        customer_name: customers.name,
        agent_name: agents.name,
        address: sedaRegistration.installation_address,
        seda_bubble_id: sedaRegistration.bubble_id,
        drawing_pdf_system: sedaRegistration.drawing_pdf_system,
        drawing_engineering_seda_pdf: sedaRegistration.drawing_engineering_seda_pdf,
        roof_images: sedaRegistration.roof_images,
      })
      .from(invoices)
      .leftJoin(sedaRegistration, eq(invoices.linked_seda_registration, sedaRegistration.bubble_id))
      .leftJoin(customers, eq(invoices.linked_customer, customers.customer_id))
      .leftJoin(agents, eq(invoices.linked_agent, agents.bubble_id))
      .where(whereCondition)
      .orderBy(desc(invoices.created_at))
      .limit(100);

    return results.map((row) => ({
      ...row,
      systemDrawingCount: row.drawing_pdf_system?.length || 0,
      engineeringDrawingCount: row.drawing_engineering_seda_pdf?.length || 0,
      roofImageCount: row.roof_images?.length || 0,
    }));
  } catch (error) {
    console.error("Error fetching engineering invoices:", error);
    throw new Error("Failed to fetch engineering data");
  }
}

/**
 * Upload a file for engineering/drawing purposes
 */
export async function uploadEngineeringFile(
  sedaBubbleId: string,
  formData: FormData,
  fileType: "system" | "engineering" | "roof"
) {
  const file = formData.get("file") as File;
  if (!file) throw new Error("No file uploaded");

  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = file.name;
  const subfolder = `engineering/${fileType}`;

  try {
    // Ensure directory exists
    const targetDir = path.join(STORAGE_ROOT, subfolder);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Sanitize filename (basic)
    const sanitizedFilename = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const localPath = path.join(targetDir, sanitizedFilename);

    // Save file
    fs.writeFileSync(localPath, buffer);

    // Generate URL
    const fileUrl = `${FILE_BASE_URL}/api/files/${subfolder}/${sanitizedFilename}`;

    // Update database
    const seda = await db.query.sedaRegistration.findFirst({
      where: eq(sedaRegistration.bubble_id, sedaBubbleId),
    });

    if (!seda) throw new Error("SEDA registration not found");

    let fieldName: keyof typeof sedaRegistration;
    let currentArray: string[] = [];

    if (fileType === "system") {
      fieldName = "drawing_pdf_system";
      currentArray = seda.drawing_pdf_system || [];
    } else if (fileType === "engineering") {
      fieldName = "drawing_engineering_seda_pdf";
      currentArray = seda.drawing_engineering_seda_pdf || [];
    } else {
      fieldName = "roof_images";
      currentArray = seda.roof_images || [];
    }

    const updatedArray = [...currentArray, fileUrl];

    await db
      .update(sedaRegistration)
      .set({ [fieldName]: updatedArray })
      .where(eq(sedaRegistration.bubble_id, sedaBubbleId));

    revalidatePath("/engineering");
    return { success: true, url: fileUrl };
  } catch (error) {
    console.error("Error uploading engineering file:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Delete a file from engineering/drawing records
 */
export async function deleteEngineeringFile(
  sedaBubbleId: string,
  fileUrl: string,
  fileType: "system" | "engineering" | "roof"
) {
  try {
    const seda = await db.query.sedaRegistration.findFirst({
      where: eq(sedaRegistration.bubble_id, sedaBubbleId),
    });

    if (!seda) throw new Error("SEDA registration not found");

    let fieldName: keyof typeof sedaRegistration;
    let currentArray: string[] = [];

    if (fileType === "system") {
      fieldName = "drawing_pdf_system";
      currentArray = seda.drawing_pdf_system || [];
    } else if (fileType === "engineering") {
      fieldName = "drawing_engineering_seda_pdf";
      currentArray = seda.drawing_engineering_seda_pdf || [];
    } else {
      fieldName = "roof_images";
      currentArray = seda.roof_images || [];
    }

    const updatedArray = currentArray.filter((url) => url !== fileUrl);

    await db
      .update(sedaRegistration)
      .set({ [fieldName]: updatedArray })
      .where(eq(sedaRegistration.bubble_id, sedaBubbleId));

    revalidatePath("/engineering");
    return { success: true };
  } catch (error) {
    console.error("Error deleting engineering file:", error);
    return { success: false, error: String(error) };
  }
}
