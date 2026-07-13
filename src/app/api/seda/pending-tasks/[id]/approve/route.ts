import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { invoice_audit_log, invoices, sedaRegistration } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { getSedaCandidates, normalizeStatus } from "@/lib/seda-matching";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

interface SedaTaskRow {
  id: number;
  application_number: string | null;
  status: string;
  payload: { status?: unknown } | null;
}

async function getInvoiceForAudit(bubbleId: string) {
  return db.query.invoices.findFirst({
    where: (invoice, { eq }) => eq(invoice.linked_seda_registration, bubbleId),
    columns: { id: true, invoice_number: true },
  });
}

/**
 * POST /api/seda/pending-tasks/:id/approve
 * Admin-confirmed manual override: an admin has looked at the match diagnosis,
 * picked the correct SEDA registration, and confirms it should be set to the
 * task's target status even though the automated matcher couldn't reach the
 * 90% confidence threshold. Requires the linked invoice to already have the
 * required payment (>= 4%) — this route will not approve an unpaid record.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const taskId = Number(id);
    if (!Number.isFinite(taskId)) {
      return NextResponse.json({ error: "Invalid task id" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
    }

    const bubbleId = typeof (body as Record<string, unknown>)?.bubble_id === "string"
      ? ((body as Record<string, unknown>).bubble_id as string).trim()
      : "";
    if (!bubbleId) {
      return NextResponse.json({ error: "bubble_id is required" }, { status: 400 });
    }

    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const taskResult = await db.execute(sql`
      SELECT id, application_number, status, payload
      FROM seda_tasks
      WHERE id = ${taskId}
      LIMIT 1
    `);
    const task = (taskResult.rows as unknown as SedaTaskRow[])[0];
    if (!task) {
      return NextResponse.json({ error: "SEDA task not found" }, { status: 404 });
    }
    if (task.status === "COMPLETED") {
      return NextResponse.json({ error: "This task is already completed" }, { status: 409 });
    }

    const targetStatus = normalizeStatus(task.payload?.status) || "Approved";

    const candidates = await getSedaCandidates();
    const candidate = candidates.find((c) => c.bubble_id === bubbleId);
    if (!candidate) {
      return NextResponse.json({ error: "SEDA registration not found" }, { status: 404 });
    }
    if (!candidate.has_required_payment) {
      return NextResponse.json(
        { error: `Cannot approve: linked invoice payment is ${candidate.percent_of_total_amount.toFixed(1)}%, below the required 4%` },
        { status: 400 }
      );
    }

    const previousStatus = candidate.current_status || null;

    if (previousStatus !== targetStatus) {
      const [updated] = await db
        .update(sedaRegistration)
        .set({ seda_status: targetStatus, updated_at: new Date() })
        .where(sql`${sedaRegistration.bubble_id} = ${bubbleId}`)
        .returning({ bubble_id: sedaRegistration.bubble_id });

      if (!updated) {
        return NextResponse.json({ error: "SEDA registration was not found during update" }, { status: 404 });
      }

      const invoice = await getInvoiceForAudit(bubbleId);
      await db.insert(invoice_audit_log).values({
        invoice_id: invoice?.id ?? null,
        invoice_number: invoice?.invoice_number ?? null,
        entity_type: "seda",
        entity_id: bubbleId,
        action_type: "update",
        changes: [
          {
            field: "seda_status",
            before: previousStatus,
            after: targetStatus,
            source: "admin-manual-review",
            seda_task_id: task.id,
            application_number: task.application_number,
          },
        ],
        actor_user_id: user.userId,
        actor_phone: user.phone,
        actor_name: user.name || user.phone,
        actor_role: user.role,
        source_app: "admin-manual-review",
        edited_at: new Date(),
      });
    }

    await db.execute(sql`
      UPDATE seda_tasks
      SET status = 'COMPLETED',
          requires_manual_review = false,
          last_error = NULL,
          completed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP,
          api_response = ${JSON.stringify({
            success: true,
            matched: true,
            manual: true,
            seda_bubble_id: bubbleId,
            approved_by: user.name || user.phone,
          })}::jsonb
      WHERE id = ${taskId}
    `);

    return NextResponse.json({
      success: true,
      seda_bubble_id: bubbleId,
      previous_status: previousStatus,
      status: targetStatus,
      updated: previousStatus !== targetStatus,
    });
  } catch (error) {
    console.error("Error approving SEDA task:", error);
    return NextResponse.json({ error: "Failed to approve SEDA task" }, { status: 500 });
  }
}
