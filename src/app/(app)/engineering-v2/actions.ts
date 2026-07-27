"use server";

import { db } from "@/lib/db";
import { invoices, invoice_audit_log, users } from "@/db/schema";
import { sql, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getUser } from "@/lib/auth";
import crypto from "crypto";
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

/**
 * Site photos live in ee_attachment now — one row per photo, not an array
 * element. Upload types listed here bypass TYPE_CONFIG entirely and insert a
 * row instead. pv/eng are absent on purpose: they have not been migrated and
 * still append to their legacy columns.
 */
const ATTACHMENT_DOC_TYPE: Partial<Record<UploadType, string>> = {
    roof: "roof_angle",
    site: "site_other",
};

const ATTACHMENT_MODULE = "invoice-office";
const ATTACHMENT_CATEGORY = "site_assessment";

/**
 * ee_attachment.uploaded_by holds a user bubble_id, but the JWT carries the
 * integer users.id. Resolve across rather than writing the raw JWT value —
 * they are different keyspaces and mixing them misattributes the upload.
 */
async function resolveUploader() {
    try {
        const user = await getUser();
        if (!user) return { bubbleId: null, name: null, role: null };

        let bubbleId: string | null = null;
        let name = user.name?.trim() || null;

        if (user.userId && user.userId !== "system") {
            const dbUser = await db.query.users.findFirst({
                where: eq(users.id, parseInt(user.userId, 10)),
                columns: { bubble_id: true, name: true },
            });
            bubbleId = dbUser?.bubble_id ?? null;
            if (!name) name = dbUser?.name ?? null;
        }

        return { bubbleId, name, role: user.role || null };
    } catch (_) {
        return { bubbleId: null, name: null, role: null };
    }
}

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

        const docType = ATTACHMENT_DOC_TYPE[uploadType];

        if (docType) {
            // Site photos: one ee_attachment row. sort_order continues the
            // existing run for this invoice + doc_type, ignoring soft-deleted
            // rows so a delete then re-upload does not leave a gap.
            const [uploader, invoiceRow] = await Promise.all([
                resolveUploader(),
                db.query.invoices.findFirst({
                    where: eq(invoices.bubble_id, invoiceBubbleId),
                    columns: { linked_customer: true },
                }),
            ]);

            const storageKey = `${subfolder}/${sanitized}`;
            const checksum = crypto.createHash("sha256").update(buffer).digest("hex");

            await db.execute(sql`
        INSERT INTO ee_attachment (
          owner_type, owner_id, linked_customer, module, category, doc_type,
          sort_order, file_url, storage_subdir, storage_key,
          original_filename, mime_type, size_bytes, checksum_sha256,
          uploaded_by, uploaded_by_name, uploaded_by_role
        ) VALUES (
          'invoice', ${invoiceBubbleId}, ${invoiceRow?.linked_customer ?? null},
          ${ATTACHMENT_MODULE}, ${ATTACHMENT_CATEGORY}, ${docType},
          (
            SELECT COALESCE(MAX(sort_order) + 1, 0)
            FROM ee_attachment
            WHERE owner_type = 'invoice'
              AND owner_id   = ${invoiceBubbleId}
              AND doc_type   = ${docType}
              AND deleted_at IS NULL
          ),
          ${fileUrl}, ${subfolder}, ${storageKey},
          ${file.name}, ${file.type || null}, ${buffer.length}, ${checksum},
          ${uploader.bubbleId}, ${uploader.name}, ${uploader.role}
        )
      `);
        } else if (table === "invoice") {
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

        // Log to invoice_audit_log
        try {
            const invoice = await db.query.invoices.findFirst({
                where: eq(invoices.bubble_id, invoiceBubbleId),
                columns: { id: true, invoice_number: true },
            });
            if (invoice) {
                let actor: { name?: string; phone?: string; userId?: string; role?: string } = {};
                try {
                    const user = await getUser();
                    if (user) actor = { name: user.name || undefined, phone: user.phone || undefined, userId: user.userId || undefined, role: user.role || undefined };
                } catch (_) {}
                await db.insert(invoice_audit_log).values({
                    invoice_id: invoice.id,
                    invoice_number: invoice.invoice_number,
                    entity_type: 'drawing',
                    entity_id: invoiceBubbleId,
                    action_type: 'upload',
                    changes: [{ field: uploadType, before: null, after: fileUrl }],
                    actor_name: actor.name ?? null,
                    actor_phone: actor.phone ?? null,
                    actor_user_id: actor.userId ?? null,
                    actor_role: actor.role ?? null,
                    source_app: 'ee-admin',
                    edited_at: new Date(),
                });
            }
        } catch (e) {
            console.error('[engineering-v2/upload] audit log failed:', e);
        }

        revalidatePath("/engineering-v2");
        return { success: true, url: fileUrl };
    } catch (err: any) {
        console.error("[engineering-v2/upload]", err);
        return { success: false, error: err?.message ?? String(err) };
    }
}
