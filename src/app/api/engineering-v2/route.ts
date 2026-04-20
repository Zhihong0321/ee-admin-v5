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

        -- Package type: grab from the first package-type invoice item linked to this invoice
        (
          SELECT p.type
          FROM invoice_item ii
          JOIN package p ON ii.linked_package = p.bubble_id
          WHERE ii.linked_invoice = inv.bubble_id
            AND ii.is_a_package = true
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
      LEFT JOIN agent a
        ON inv.linked_agent = a.bubble_id
      WHERE inv.is_latest = true
        AND COALESCE(inv.is_deleted, false) = false
        AND inv.status != 'deleted'
        ${searchCondition}
        ${pctCondition}
      ORDER BY inv.created_at DESC NULLS LAST
      LIMIT ${limit}
    `);

        const rows = (result.rows as any[]).map((row) => {
            const roofImages = mergeUnique(
                safeArray(row.linked_roof_image),
                safeArray(row.seda_roof_images)
            );
            const siteAssessment = mergeUnique(
                safeArray(row.site_assessment_image),
                safeArray(row.seda_site_images)
            );
            const pvDrawing = mergeUnique(
                safeArray(row.pv_system_drawing),
                safeArray(row.seda_pv_drawing)
            );
            const engDrawing = safeArray(row.seda_eng_drawing);

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
