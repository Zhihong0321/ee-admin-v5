import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function safeArray(val: unknown): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return (val as string[]).filter(Boolean);
  return [];
}

function mergeUnique(...arrays: string[][]): string[] {
  return [...new Set(arrays.flat().filter(Boolean))];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search')?.trim() || '';
  const minPct = parseFloat(searchParams.get('minPct') || '0');
  const maxPct = parseFloat(searchParams.get('maxPct') || '100');
  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 300);

  try {
    // Build search conditions
    const searchCondition = search
      ? sql`AND (
          inv.invoice_number ILIKE ${'%' + search + '%'}
          OR c.name ILIKE ${'%' + search + '%'}
          OR a.name ILIKE ${'%' + search + '%'}
          OR sr.installation_address ILIKE ${'%' + search + '%'}
        )`
      : sql``;

    const pctCondition = (minPct > 0 || maxPct < 100)
      ? sql`AND COALESCE(inv.percent_of_total_amount::numeric, 0) BETWEEN ${minPct} AND ${maxPct}`
      : sql``;

    const result = await db.execute(sql`
      SELECT
        inv.id,
        inv.bubble_id,
        inv.invoice_number,
        inv.invoice_date,
        inv.created_at,
        inv.status,
        inv.total_amount,
        inv.amount,
        inv.percent_of_total_amount,
        inv.case_status,
        inv.installation_status,
        COALESCE(sr.state, c.state) AS state,

        -- Package type: grab from the first invoice item that has a linked_package
        -- NOTE: is_a_package is NULL for many older records (not just false), so we
        -- use linked_package IS NOT NULL as the reliable signal instead.
        (
          SELECT p.type
          FROM invoice_item ii
          JOIN package p ON ii.linked_package = p.bubble_id
          WHERE ii.linked_invoice = inv.bubble_id
            AND ii.linked_package IS NOT NULL
            AND ii.linked_package != ''
          ORDER BY ii.sort ASC NULLS LAST
          LIMIT 1
        ) AS package_type,

        -- Attachments from invoice
        inv.linked_roof_image,
        inv.pv_system_drawing,
        inv.site_assessment_image,

        -- Attachments from SEDA
        sr.bubble_id         AS seda_bubble_id,
        sr.roof_images       AS seda_roof_images,
        sr.site_images       AS seda_site_images,
        sr.drawing_pdf_system AS seda_pv_drawing,
        sr.drawing_engineering_seda_pdf AS seda_eng_drawing,

        -- Site photos (roof + site assessment) now live in ee_attachment,
        -- one row per photo. att.* is the live set; sup.* is everything
        -- ee_attachment has soft-deleted or purged, which we subtract below.
        att.ee_roof,
        att.ee_site,
        drw.ee_pv,
        drw.ee_eng,
        sup.suppressed_urls,
        COALESCE(sr.installation_address, c.address) AS installation_address,
        sr.seda_status,

        -- Customer
        c.name   AS customer_name,
        c.phone  AS customer_phone,

        -- Agent
        a.name   AS agent_name
      FROM invoice inv
      LEFT JOIN seda_registration sr
        ON inv.linked_seda_registration = sr.bubble_id
      LEFT JOIN customer c
        ON inv.linked_customer = c.customer_id
      LEFT JOIN "user" a
        ON inv.linked_agent = a.bubble_id
      LEFT JOIN LATERAL (
        SELECT
          -- Roof is an explicit allow-list; site is a deliberate catch-all.
          -- The doc_type taxonomy grew from 2 to 7 on 2026-07-26 (house_front,
          -- house_db, sunpath, inverter_location, roof_closeup) and will keep
          -- growing, so anything unrecognised must surface under site rather
          -- than fall through both filters and disappear.
          array_agg(a2.file_url ORDER BY a2.sort_order NULLS LAST, a2.id)
            FILTER (WHERE a2.doc_type IN ('roof_angle', 'roof_closeup')) AS ee_roof,
          array_agg(a2.file_url ORDER BY a2.sort_order NULLS LAST, a2.id)
            FILTER (WHERE COALESCE(a2.doc_type, '') NOT IN ('roof_angle', 'roof_closeup')) AS ee_site
        FROM ee_attachment a2
        WHERE a2.owner_type = 'invoice'
          AND a2.owner_id   = inv.bubble_id
          AND a2.category   = 'site_assessment'
          AND a2.deleted_at IS NULL
          AND a2.purged_at  IS NULL
      ) att ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          -- Same rule one category over: pv is the allow-list, engineering is
          -- the catch-all, so a drawing doc_type nobody has seen yet lands
          -- somewhere visible instead of falling through both filters.
          array_agg(a4.file_url ORDER BY a4.sort_order NULLS LAST, a4.id)
            FILTER (WHERE a4.doc_type = 'pv_system') AS ee_pv,
          array_agg(a4.file_url ORDER BY a4.sort_order NULLS LAST, a4.id)
            FILTER (WHERE COALESCE(a4.doc_type, '') <> 'pv_system') AS ee_eng
        FROM ee_attachment a4
        WHERE a4.owner_type = 'invoice'
          AND a4.owner_id   = inv.bubble_id
          AND a4.category   = 'drawing'
          AND a4.deleted_at IS NULL
          AND a4.purged_at  IS NULL
      ) drw ON TRUE
      LEFT JOIN LATERAL (
        SELECT array_agg(a3.file_url) AS suppressed_urls
        FROM ee_attachment a3
        WHERE a3.owner_type = 'invoice'
          AND a3.owner_id   = inv.bubble_id
          AND (a3.deleted_at IS NOT NULL OR a3.purged_at IS NOT NULL)
      ) sup ON TRUE
      WHERE inv.is_latest = true
        AND COALESCE(inv.is_deleted, false) = false
        AND inv.status != 'deleted'
        ${searchCondition}
        ${pctCondition}
      ORDER BY inv.created_at DESC NULLS LAST
      LIMIT ${limit}
    `);

    const rows = (result.rows as any[]).map((row) => {
      // ee_attachment is the source of truth for site photos. The legacy
      // arrays still hold everything uploaded before the cutover and are still
      // written by the Bubble sync, and seda_registration.roof_images holds
      // photos that were never backfilled. So union all three (ee_attachment
      // first, so its sort_order wins) and then drop anything ee_attachment has
      // marked deleted or purged — without that subtraction a deleted photo
      // would come straight back via the arrays.
      const suppressed = new Set(safeArray(row.suppressed_urls));
      const dropSuppressed = (urls: string[]) =>
        urls.filter((url) => !suppressed.has(url));

      const roofImages = dropSuppressed(mergeUnique(
        safeArray(row.ee_roof),
        safeArray(row.linked_roof_image),
        safeArray(row.seda_roof_images)
      ));
      const siteAssessment = dropSuppressed(mergeUnique(
        safeArray(row.ee_site),
        safeArray(row.site_assessment_image),
        safeArray(row.seda_site_images)
      ));
      // Drawings moved to ee_attachment under category 'drawing'. Same union
      // as the photos above: new rows first, then the legacy columns the
      // Bubble sync still writes, minus anything soft-deleted.
      const pvDrawing = dropSuppressed(mergeUnique(
        safeArray(row.ee_pv),
        safeArray(row.pv_system_drawing),
        safeArray(row.seda_pv_drawing)
      ));
      const engDrawing = dropSuppressed(mergeUnique(
        safeArray(row.ee_eng),
        safeArray(row.seda_eng_drawing)
      ));

      return {
        id: row.id,
        bubble_id: row.bubble_id,
        invoice_number: row.invoice_number,
        invoice_date: row.invoice_date,
        created_at: row.created_at,
        status: row.status,
        case_status: row.case_status,
        installation_status: row.installation_status,
        package_type: row.package_type || null,
        state: row.state,
        total_amount: row.total_amount ? parseFloat(row.total_amount) : null,
        amount: row.amount ? parseFloat(row.amount) : null,
        percent_paid: row.percent_of_total_amount
          ? parseFloat(row.percent_of_total_amount)
          : 0,
        customer_name: row.customer_name || null,
        customer_phone: row.customer_phone || null,
        agent_name: row.agent_name || null,
        installation_address: row.installation_address || null,
        seda_bubble_id: row.seda_bubble_id || null,
        seda_status: row.seda_status || null,
        // Attachment arrays
        roof_images: roofImages,
        site_assessment: siteAssessment,
        pv_drawing: pvDrawing,
        eng_drawing: engDrawing,
        // Quick-view counts
        roof_count: roofImages.length,
        site_count: siteAssessment.length,
        pv_count: pvDrawing.length,
        eng_count: engDrawing.length,
        total_attachments: roofImages.length + siteAssessment.length + pvDrawing.length + engDrawing.length,
      };
    });

    return NextResponse.json({
      success: true,
      fetchedAt: new Date().toISOString(),
      total: rows.length,
      invoices: rows,
    });
  } catch (error: any) {
    console.error('[engineering-v2]', error);
    return NextResponse.json(
      { success: false, error: error?.message ?? String(error) },
      { status: 500 }
    );
  }
}
