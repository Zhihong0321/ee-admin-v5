"use server";

import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import fs from "fs";
import path from "path";

export type UploadType = "roof" | "site" | "pv" | "eng";

const STORAGE_ROOT = process.env.STORAGE_ROOT || "/storage";
const FILE_BASE_URL = process.env.FILE_BASE_URL || "https://admin.atap.solar";

/** Map upload type → which table/column to append the URL into */
const TYPE_CONFIG: Record<
    UploadType,
    | { table: "invoice"; column: string }
    | { table: "seda"; column: string }
> = {
    roof: { table: "invoice", column: "linked_roof_image" },
    site: { table: "invoice", column: "site_assessment_image" },
    pv: { table: "invoice", column: "pv_system_drawing" },
    eng: { table: "seda", column: "drawing_engineering_seda_pdf" },
};

export async function uploadAttachment(
    formData: FormData,
    uploadType: UploadType,
    invoiceBubbleId: string,
    sedaBubbleId: string | null
) {
    const file = formData.get("file") as File | null;
    if (!file) return { success: false, error: "No file provided" };

    const { table, column } = TYPE_CONFIG[uploadType];

    // Validate seda bubble id required for eng uploads
    if (table === "seda" && !sedaBubbleId) {
        return { success: false, error: "No SEDA registration linked to this invoice" };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const sanitized = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const subfolder = `engineering-v2/${uploadType}`;
    const targetDir = path.join(STORAGE_ROOT, subfolder);

    try {
        // Ensure directory
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        // Write file
        fs.writeFileSync(path.join(targetDir, sanitized), buffer);
        const fileUrl = `${FILE_BASE_URL}/api/files/${subfolder}/${sanitized}`;

        // Append URL to the correct array column
        if (table === "invoice") {
            await db.execute(sql`
        UPDATE invoice
        SET ${sql.raw(`"${column}"`)} = array_append(
          COALESCE(${sql.raw(`"${column}"`)}, '{}'),
          ${fileUrl}
        )
        WHERE bubble_id = ${invoiceBubbleId}
      `);
        } else {
            await db.execute(sql`
        UPDATE seda_registration
        SET ${sql.raw(`"${column}"`)} = array_append(
          COALESCE(${sql.raw(`"${column}"`)}, '{}'),
          ${fileUrl}
        )
        WHERE bubble_id = ${sedaBubbleId}
      `);
        }

        revalidatePath("/engineering-v2");
        return { success: true, url: fileUrl };
    } catch (err: any) {
        console.error("[engineering-v2/upload]", err);
        return { success: false, error: err?.message ?? String(err) };
    }
}
