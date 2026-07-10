import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

interface AutoProcessedTaskRow {
  id: number;
  invoice_id: number | null;
  invoice_number: string | null;
  entity_id: string | null;
  changes: unknown;
  actor_name: string | null;
  source_app: string | null;
  edited_at: string;
  customer_name: string | null;
}

/**
 * GET /api/seda/auto-processed-tasks
 * Return the latest invoice audit entries that changed a SEDA status.
 */
export async function GET() {
  try {
    const result = await db.execute(sql`
      SELECT
        ial.id,
        ial.invoice_id,
        COALESCE(ial.invoice_number, i.invoice_number) AS invoice_number,
        ial.entity_id,
        ial.changes,
        ial.actor_name,
        ial.source_app,
        ial.edited_at,
        c.name AS customer_name
      FROM invoice_audit_log ial
      LEFT JOIN invoice i ON i.id = ial.invoice_id
      LEFT JOIN customer c ON c.customer_id = i.linked_customer
      WHERE ial.entity_type = 'seda'
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            CASE
              WHEN jsonb_typeof(ial.changes) = 'array' THEN ial.changes
              ELSE '[]'::jsonb
            END
          ) AS change
          WHERE change->>'field' = 'seda_status'
        )
      ORDER BY ial.edited_at DESC
      LIMIT 20
    `);

    return NextResponse.json({ tasks: result.rows as unknown as AutoProcessedTaskRow[] });
  } catch (error) {
    console.error("Error fetching SEDA auto-processed tasks:", error);
    return NextResponse.json(
      { error: "Failed to fetch SEDA auto-processed tasks" },
      { status: 500 }
    );
  }
}
