"use server";

import { db } from "@/lib/db";
import { invoices, sedaRegistration, customers, users, invoice_audit_log } from "@/db/schema";
import { eq, sql, and, desc, or, ilike, inArray } from "drizzle-orm";
import { getUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/activity-log";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";

/**
 * Resolve invoice from an invoice or seda bubble_id and write a drawing event
 * to invoice_audit_log.
 */
async function logDrawingAudit({
  sedaBubbleId,
  invoiceBubbleId,
  actionType,
  fileType,
  fileUrl,
}: {
  sedaBubbleId?: string | null;
  invoiceBubbleId?: string | null;
  actionType: 'upload' | 'delete';
  fileType: string;
  fileUrl: string;
}) {
  try {
    const invoice = await db.query.invoices.findFirst({
      where: invoiceBubbleId
        ? eq(invoices.bubble_id, invoiceBubbleId)
        : eq(invoices.linked_seda_registration, sedaBubbleId!),
      columns: { id: true, bubble_id: true, invoice_number: true },
    });
    if (!invoice) return;

    let actor: { name?: string; phone?: string; userId?: string; role?: string } = {};
    try {
      const user = await getUser();
      if (user) actor = { name: user.name || undefined, phone: user.phone || undefined, userId: user.userId || undefined, role: user.role || undefined };
    } catch (_) {}

    await db.insert(invoice_audit_log).values({
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
      entity_type: 'drawing',
      entity_id: invoice.bubble_id,
      action_type: actionType,
      changes: [{ field: fileType, before: actionType === 'delete' ? fileUrl : null, after: actionType === 'upload' ? fileUrl : null }],
      actor_name: actor.name ?? null,
      actor_phone: actor.phone ?? null,
      actor_user_id: actor.userId ?? null,
      actor_role: actor.role ?? null,
      source_app: 'ee-admin',
      edited_at: new Date(),
    });
  } catch (e) {
    console.error('Failed to write drawing audit log:', e);
  }
}

const STORAGE_ROOT = "/storage";
const FILE_BASE_URL = process.env.FILE_BASE_URL || "https://admin.atap.solar";

function normalizeUrlArray(values: string[] | null | undefined): string[] {
  return (values || []).filter((value): value is string => Boolean(value));
}

function mergeUniqueUrls(...groups: Array<string[] | null | undefined>): string[] {
  const seen = new Set<string>();
  for (const group of groups) {
    for (const url of normalizeUrlArray(group)) {
      seen.add(url);
    }
  }
  return [...seen];
}

const ATTACHMENT_MODULE = "invoice-office";

/**
 * What this screen's three file types are in ee_attachment. Drawings sit under
 * their own category so the roof/site bucketing does not swallow them; within
 * each category one doc_type is the allow-list and everything else is the
 * catch-all. Mirrors engineering-v2/actions.ts.
 */
const ATTACHMENT_TARGET: Record<
  "system" | "engineering" | "roof",
  { category: string; docType: string }
> = {
  roof: { category: "site_assessment", docType: "roof_angle" },
  system: { category: "drawing", docType: "pv_system" },
  engineering: { category: "drawing", docType: "engineering_seda" },
};

/**
 * Live roof photos for this invoice out of ee_attachment.
 *
 * Roof is an explicit allow-list; everything else is site assessment and is not
 * shown on this screen. The doc_type taxonomy is open and grows without
 * migration, so this list must never be inverted into "everything except site".
 * Mirrors src/app/api/engineering-v2/route.ts.
 */
const eeRoofImagesSql = sql<string[] | null>`(
  SELECT array_agg(a2.file_url ORDER BY a2.sort_order NULLS LAST, a2.id)
    FILTER (WHERE a2.doc_type IN ('roof_angle', 'roof_closeup'))
  FROM ee_attachment a2
  WHERE a2.owner_type = 'invoice'
    AND a2.owner_id   = ${invoices.bubble_id}
    AND a2.category   = 'site_assessment'
    AND a2.deleted_at IS NULL
    AND a2.purged_at  IS NULL
)`;

/**
 * Live drawings for this invoice out of ee_attachment. pv is the allow-list,
 * engineering is the catch-all — an unrecognised drawing doc_type shows up
 * under engineering rather than disappearing.
 */
const eePvDrawingsSql = sql<string[] | null>`(
  SELECT array_agg(a4.file_url ORDER BY a4.sort_order NULLS LAST, a4.id)
    FILTER (WHERE a4.doc_type = 'pv_system')
  FROM ee_attachment a4
  WHERE a4.owner_type = 'invoice'
    AND a4.owner_id   = ${invoices.bubble_id}
    AND a4.category   = 'drawing'
    AND a4.deleted_at IS NULL
    AND a4.purged_at  IS NULL
)`;

const eeEngDrawingsSql = sql<string[] | null>`(
  SELECT array_agg(a5.file_url ORDER BY a5.sort_order NULLS LAST, a5.id)
    FILTER (WHERE COALESCE(a5.doc_type, '') <> 'pv_system')
  FROM ee_attachment a5
  WHERE a5.owner_type = 'invoice'
    AND a5.owner_id   = ${invoices.bubble_id}
    AND a5.category   = 'drawing'
    AND a5.deleted_at IS NULL
    AND a5.purged_at  IS NULL
)`;

/**
 * Everything ee_attachment has soft-deleted or purged for this invoice. The
 * legacy arrays are still written by the Bubble sync, so without subtracting
 * this set a deleted photo comes straight back through them.
 */
const eeSuppressedUrlsSql = sql<string[] | null>`(
  SELECT array_agg(a3.file_url)
  FROM ee_attachment a3
  WHERE a3.owner_type = 'invoice'
    AND a3.owner_id   = ${invoices.bubble_id}
    AND (a3.deleted_at IS NOT NULL OR a3.purged_at IS NOT NULL)
)`;

/**
 * ee_attachment is the source of truth, but it is not complete: the legacy
 * invoice array holds pre-cutover history and seda_registration.roof_images
 * holds photos that were never backfilled. Union all three, then drop anything
 * ee_attachment marked deleted or purged.
 */
function buildFileLists(row: {
  ee_roof_images: string[] | null;
  ee_pv_drawings: string[] | null;
  ee_eng_drawings: string[] | null;
  invoice_linked_roof_image: string[] | null;
  invoice_pv_system_drawing: string[] | null;
  seda_roof_images: string[] | null;
  seda_drawing_pdf_system: string[] | null;
  seda_drawing_engineering_seda_pdf: string[] | null;
  suppressed_urls: string[] | null;
}) {
  const suppressed = new Set(normalizeUrlArray(row.suppressed_urls));
  const live = (...groups: Array<string[] | null | undefined>) =>
    mergeUniqueUrls(...groups).filter((url) => !suppressed.has(url));

  return {
    roof_images: live(
      row.ee_roof_images,
      row.invoice_linked_roof_image,
      row.seda_roof_images
    ),
    pv_drawings: live(
      row.ee_pv_drawings,
      row.invoice_pv_system_drawing,
      row.seda_drawing_pdf_system
    ),
    eng_drawings: live(
      row.ee_eng_drawings,
      row.seda_drawing_engineering_seda_pdf
    ),
  };
}

/**
 * ee_attachment.uploaded_by / deleted_by hold a user bubble_id, but the JWT
 * carries the integer users.id. Resolve across rather than writing the raw JWT
 * value — they are different keyspaces and mixing them attributes the row to a
 * user that does not exist. Copied from engineering-v2/actions.ts.
 */
async function resolveActor() {
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

/**
 * Fetch invoices with engineering-related data
 */
export async function getEngineeringInvoices(search?: string) {
  try {
    let whereCondition = and(
      sql`${invoices.status} != 'deleted'`,
      eq(invoices.is_latest, true)
    )!;

    if (search) {
      whereCondition = and(
        whereCondition,
        or(
          ilike(invoices.invoice_number, `%${search}%`),
          ilike(customers.name, `%${search}%`),
          ilike(users.name, `%${search}%`),
          ilike(sedaRegistration.installation_address, `%${search}%`)
        )
      )!;
    }

    const results = await db
      .select({
        id: invoices.id,
        bubble_id: invoices.bubble_id,
        share_token: invoices.share_token,
        invoice_number: invoices.invoice_number,
        total_amount: invoices.total_amount,
        invoice_date: invoices.invoice_date,
        status: invoices.status,
        customer_name: customers.name,
        agent_name: users.name,
        address: sedaRegistration.installation_address,
        seda_bubble_id: sedaRegistration.bubble_id,
        invoice_linked_roof_image: invoices.linked_roof_image,
        invoice_pv_system_drawing: invoices.pv_system_drawing,
        seda_roof_images: sedaRegistration.roof_images,
        seda_drawing_pdf_system: sedaRegistration.drawing_pdf_system,
        seda_drawing_engineering_seda_pdf: sedaRegistration.drawing_engineering_seda_pdf,
        ee_roof_images: eeRoofImagesSql,
        ee_pv_drawings: eePvDrawingsSql,
        ee_eng_drawings: eeEngDrawingsSql,
        suppressed_urls: eeSuppressedUrlsSql,
      })
      .from(invoices)
      .leftJoin(sedaRegistration, eq(invoices.linked_seda_registration, sedaRegistration.bubble_id))
      .leftJoin(customers, eq(invoices.linked_customer, customers.customer_id))
      .leftJoin(users, eq(invoices.linked_agent, users.bubble_id))
      .where(whereCondition)
      .orderBy(desc(invoices.created_at))
      .limit(200);

    return results.map((row) => {
      const files = buildFileLists(row);
      return {
        ...row,
        ...files,
        systemDrawingCount: files.pv_drawings.length,
        engineeringDrawingCount: files.eng_drawings.length,
        roofImageCount: files.roof_images.length,
      };
    });
  } catch (error) {
    console.error("Error fetching engineering invoices:", error);
    throw new Error("Failed to fetch engineering data");
  }
}

/**
 * Fetch invoices with active engineering/system drawing tags from chat
 */
export async function getInvoicesWithDrawingTags(search?: string) {
  try {
    // Get invoice IDs with active engineering tags
    const taggedInvoicesResult = await db.execute(sql`
      SELECT DISTINCT ct.invoice_id
      FROM chat_thread ct
      INNER JOIN chat_message cm ON ct.id = cm.thread_id
      WHERE cm.message_type = 'tag'
        AND cm.tag_role = 'engineering'
        AND cm.is_tag_active = true
    `);

    const invoiceIds = taggedInvoicesResult.rows.map((r: any) => r.invoice_id).filter(Boolean);

    if (invoiceIds.length === 0) {
      return [];
    }

    // Build where condition
    let whereCondition = and(
      sql`${invoices.status} != 'deleted'`,
      eq(invoices.is_latest, true),
      inArray(invoices.bubble_id, invoiceIds)
    )!;

    if (search) {
      whereCondition = and(
        whereCondition,
        or(
          ilike(invoices.invoice_number, `%${search}%`),
          ilike(customers.name, `%${search}%`),
          ilike(users.name, `%${search}%`),
          ilike(sedaRegistration.installation_address, `%${search}%`)
        )
      )!;
    }

    const results = await db
      .select({
        id: invoices.id,
        bubble_id: invoices.bubble_id,
        share_token: invoices.share_token,
        invoice_number: invoices.invoice_number,
        total_amount: invoices.total_amount,
        invoice_date: invoices.invoice_date,
        status: invoices.status,
        customer_name: customers.name,
        agent_name: users.name,
        address: sedaRegistration.installation_address,
        seda_bubble_id: sedaRegistration.bubble_id,
        invoice_linked_roof_image: invoices.linked_roof_image,
        invoice_pv_system_drawing: invoices.pv_system_drawing,
        seda_roof_images: sedaRegistration.roof_images,
        seda_drawing_pdf_system: sedaRegistration.drawing_pdf_system,
        seda_drawing_engineering_seda_pdf: sedaRegistration.drawing_engineering_seda_pdf,
        ee_roof_images: eeRoofImagesSql,
        ee_pv_drawings: eePvDrawingsSql,
        ee_eng_drawings: eeEngDrawingsSql,
        suppressed_urls: eeSuppressedUrlsSql,
      })
      .from(invoices)
      .leftJoin(sedaRegistration, eq(invoices.linked_seda_registration, sedaRegistration.bubble_id))
      .leftJoin(customers, eq(invoices.linked_customer, customers.customer_id))
      .leftJoin(users, eq(invoices.linked_agent, users.bubble_id))
      .where(whereCondition)
      .orderBy(desc(invoices.created_at))
      .limit(200);

    return results.map((row) => {
      const files = buildFileLists(row);
      return {
        ...row,
        ...files,
        systemDrawingCount: files.pv_drawings.length,
        engineeringDrawingCount: files.eng_drawings.length,
        roofImageCount: files.roof_images.length,
      };
    });
  } catch (error) {
    console.error("Error fetching invoices with drawing tags:", error);
    return [];
  }
}

/**
 * Upload a file for engineering/drawing purposes
 */
export async function uploadEngineeringFile(
  sedaBubbleId: string | null,
  formData: FormData,
  fileType: "system" | "engineering" | "roof",
  invoiceBubbleId?: string | null
) {
  const file = formData.get("file") as File;
  if (!file) throw new Error("No file uploaded");

  // Everything this screen uploads is owned by the invoice in ee_attachment —
  // photos and drawings alike. An invoice created in the new system has no SEDA
  // registration at all, so the SEDA id cannot be the key any more.
  if (!invoiceBubbleId) {
    return { success: false, error: "No invoice linked to this row" };
  }

  const { category, docType } = ATTACHMENT_TARGET[fileType];
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

    // One ee_attachment row per file. sort_order continues the existing run for
    // this invoice + doc_type, ignoring soft-deleted rows so a delete then
    // re-upload does not leave a gap.
    const [actor, invoiceRow] = await Promise.all([
      resolveActor(),
      db.query.invoices.findFirst({
        where: eq(invoices.bubble_id, invoiceBubbleId),
        columns: { linked_customer: true },
      }),
    ]);

    const storageKey = `${subfolder}/${sanitizedFilename}`;
    const checksum = crypto.createHash("sha256").update(buffer).digest("hex");

    await db.execute(sql`
      INSERT INTO ee_attachment (
        owner_type, owner_id, linked_customer, module, category, doc_type,
        sort_order, file_url, storage_subdir, storage_key,
        original_filename, mime_type, size_bytes, checksum_sha256,
        uploaded_by, uploaded_by_name, uploaded_by_role
      ) VALUES (
        'invoice', ${invoiceBubbleId}, ${invoiceRow?.linked_customer ?? null},
        ${ATTACHMENT_MODULE}, ${category}, ${docType},
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
        ${actor.bubbleId}, ${actor.name}, ${actor.role}
      )
    `);

    await logDrawingAudit({ invoiceBubbleId, actionType: 'upload', fileType, fileUrl });

    revalidatePath("/engineering");
    await logActivity({
      action: "upload",
      entityType: "attachment",
      entityId: invoiceBubbleId,
      entityLabel: file.name,
      description: `${fileType} file "${file.name}" uploaded to invoice ${invoiceBubbleId}`,
      metadata: { file_type: fileType, seda_bubble_id: sedaBubbleId, surface: "engineering-v1" },
    });
    return { success: true, url: fileUrl };
  } catch (error) {
    console.error("Error uploading engineering file:", error);
    await logActivity({
      action: "upload",
      entityType: "attachment",
      entityId: invoiceBubbleId,
      entityLabel: file.name,
      status: "failed",
      errorMessage: String(error),
      metadata: { file_type: fileType, surface: "engineering-v1" },
    });
    return { success: false, error: String(error) };
  }
}

/**
 * Delete a file from engineering/drawing records
 */
export async function deleteEngineeringFile(
  sedaBubbleId: string | null,
  fileUrl: string,
  fileType: "system" | "engineering" | "roof",
  invoiceBubbleId?: string | null
) {
  try {
    if (!invoiceBubbleId) {
      return { success: false, error: "No invoice linked to this row" };
    }

    const { category, docType } = ATTACHMENT_TARGET[fileType];
    const actor = await resolveActor();

    // Deletes are soft: the row stays and gets deleted_at, which every read
    // subtracts. Never edit the legacy arrays here — the Bubble sync rewrites
    // them, so an array edit is undone on the next sync while the tombstone
    // survives.
    const softDeleted = await db.execute(sql`
      UPDATE ee_attachment
      SET deleted_at      = now(),
          deleted_by      = ${actor.bubbleId},
          deleted_by_name = ${actor.name},
          updated_at      = now()
      WHERE owner_type = 'invoice'
        AND owner_id   = ${invoiceBubbleId}
        AND file_url   = ${fileUrl}
        AND deleted_at IS NULL
        AND purged_at  IS NULL
      RETURNING id
    `);

    if ((softDeleted.rows?.length ?? 0) === 0) {
      // The file only exists in a legacy array (pre-cutover history, or one of
      // the SEDA photos never backfilled) so there is no row to mark. Insert a
      // tombstone instead — a row that exists only to be subtracted by the
      // suppression filter in every read.
      const invoiceRow = await db.query.invoices.findFirst({
        where: eq(invoices.bubble_id, invoiceBubbleId),
        columns: { linked_customer: true },
      });

      await db.execute(sql`
        INSERT INTO ee_attachment (
          owner_type, owner_id, linked_customer, module, category, doc_type,
          file_url, deleted_at, deleted_by, deleted_by_name, metadata_json
        ) VALUES (
          'invoice', ${invoiceBubbleId}, ${invoiceRow?.linked_customer ?? null},
          ${ATTACHMENT_MODULE}, ${category}, ${docType},
          ${fileUrl}, now(), ${actor.bubbleId}, ${actor.name},
          ${JSON.stringify({ tombstone_for: 'legacy_array', deleted_from: 'engineering-v1' })}::jsonb
        )
      `);
    }

    await logDrawingAudit({ invoiceBubbleId, actionType: 'delete', fileType, fileUrl });

    revalidatePath("/engineering");
    await logActivity({
      action: "delete",
      entityType: "attachment",
      entityId: invoiceBubbleId,
      entityLabel: fileUrl.split("/").pop() ?? fileUrl,
      description: `${fileType} file removed from invoice ${invoiceBubbleId}`,
      metadata: { file_type: fileType, file_url: fileUrl, surface: "engineering-v1" },
    });
    return { success: true };
  } catch (error) {
    console.error("Error deleting engineering file:", error);
    await logActivity({
      action: "delete",
      entityType: "attachment",
      entityId: invoiceBubbleId,
      status: "failed",
      errorMessage: String(error),
      metadata: { file_type: fileType, file_url: fileUrl, surface: "engineering-v1" },
    });
    return { success: false, error: String(error) };
  }
}
