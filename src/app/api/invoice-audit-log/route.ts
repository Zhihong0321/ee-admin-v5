import { NextRequest, NextResponse } from 'next/server';
import { queryProxy } from '@/lib/pg-proxy';

const ITEMS_PER_PAGE = 20;

interface AuditLogRow {
  id: number;
  invoice_id: number;
  invoice_number: string;
  entity_type: string;
  action_type: string;
  changes: unknown[];
  actor_name: string | null;
  actor_phone: string | null;
  actor_role: string | null;
  application_name: string | null;
  edited_at: string;
}

interface InvoiceSummaryRow {
  invoice_id: number;
  invoice_number: string;
  total_changes: number;
  latest_change: string;
  customer_name: string | null;
  total_amount: string | null;
  invoice_created_at: string | null;
  percent_paid: string | null;
  first_payment_date: string | null;
  seda_status: string | null;
  seda_modified_date: string | null;
  agent: string | null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const grouped = searchParams.get('grouped') === 'true';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const search = searchParams.get('search') || '';
    const invoiceId = searchParams.get('invoice_id') || '';
    const offset = (page - 1) * ITEMS_PER_PAGE;

    // ── GROUPED MODE: enriched invoice summaries for the list view ──
    if (grouped) {
      const conditions: string[] = [];
      const params: unknown[] = [];
      let pi = 1;

      if (search) {
        conditions.push(`(ial.invoice_number ILIKE $${pi} OR c.name ILIKE $${pi})`);
        params.push(`%${search}%`);
        pi++;
      }

      const havingClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countSql = `
        SELECT COUNT(DISTINCT ial.invoice_number)::int as count
        FROM invoice_audit_log ial
        LEFT JOIN invoice i ON i.id = ial.invoice_id
        LEFT JOIN customer c ON c.customer_id = i.linked_customer
        ${havingClause}
      `;
      const countResult = await queryProxy(countSql, params);
      const totalCount = (countResult.rows[0] as { count: number })?.count || 0;

      const sql = `
        SELECT
          MIN(ial.invoice_id)::int                    AS invoice_id,
          ial.invoice_number,
          COUNT(ial.id)::int                          AS total_changes,
          MAX(ial.edited_at)                          AS latest_change,
          MAX(c.name)                                 AS customer_name,
          MAX(i.total_amount::text)                   AS total_amount,
          MAX(i.created_at)                           AS invoice_created_at,
          MAX(i.percent_of_total_amount::text)        AS percent_paid,
          MAX(i."1st_payment_date")                   AS first_payment_date,
          MAX(sr.seda_status)                         AS seda_status,
          MAX(sr.modified_date)                         AS seda_modified_date,
          MAX(ag.name)                                AS agent
        FROM invoice_audit_log ial
        LEFT JOIN invoice i ON i.id = ial.invoice_id
        LEFT JOIN customer c ON c.customer_id = i.linked_customer
        LEFT JOIN seda_registration sr ON sr.bubble_id = i.linked_seda_registration
        LEFT JOIN "user" ag ON ag.bubble_id = i.linked_agent
        ${havingClause}
        GROUP BY ial.invoice_number
        ORDER BY latest_change DESC
        LIMIT ${ITEMS_PER_PAGE} OFFSET ${offset}
      `;

      const result = await queryProxy(sql, params);
      const invoices = result.rows as InvoiceSummaryRow[];
      const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

      return NextResponse.json({
        invoices,
        pagination: {
          page,
          total_pages: totalPages,
          total_count: totalCount,
          per_page: ITEMS_PER_PAGE,
          has_more: page < totalPages,
        },
      });
    }

    // ── DETAIL MODE: logs for a specific invoice ──
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (invoiceId) {
      conditions.push(`invoice_id = $${paramIndex}`);
      params.push(parseInt(invoiceId, 10));
      paramIndex++;
    }

    if (search) {
      conditions.push(`invoice_number ILIKE $${paramIndex}`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countSql = `SELECT COUNT(*)::int as count FROM invoice_audit_log ${whereClause}`;
    const countResult = await queryProxy(countSql, params);
    const totalCount = (countResult.rows[0] as { count: number })?.count || 0;

    const sql = `
      SELECT 
        id,
        invoice_id,
        invoice_number,
        entity_type,
        action_type,
        changes,
        actor_name,
        actor_phone,
        actor_role,
        application_name,
        edited_at
      FROM invoice_audit_log
      ${whereClause}
      ORDER BY edited_at DESC
      LIMIT ${ITEMS_PER_PAGE * 5}
      OFFSET ${offset}
    `;

    const result = await queryProxy(sql, params);
    const logs = result.rows as AuditLogRow[];
    const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

    return NextResponse.json({
      logs,
      pagination: {
        page,
        total_pages: totalPages,
        total_count: totalCount,
        per_page: ITEMS_PER_PAGE,
        has_more: page < totalPages,
      },
    });

  } catch (error) {
    console.error('Error fetching invoice audit logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch audit logs', details: String(error) },
      { status: 500 }
    );
  }
}
