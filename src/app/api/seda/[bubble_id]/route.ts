import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sedaRegistration, customers, invoices, users, invoice_audit_log } from "@/db/schema";
import { eq, sql, or, getTableColumns } from "drizzle-orm";
import { getUser } from "@/lib/auth";

interface RouteContext {
  params: Promise<{
    bubble_id: string;
  }>;
}

/**
 * GET /api/seda/[bubble_id]
 * Fetch single SEDA registration - SIMPLE VERSION
 */
export async function GET(
  request: NextRequest,
  { params }: RouteContext
) {
  try {
    const { bubble_id } = await params;

    // Fetch SEDA data with customer name via invoice (invoice is the center of data relationship)
    // Flow: SEDA <- invoice.linked_seda_registration -> invoice.linked_customer -> customer
    const result = await db
      .select({
        // SEDA fields
        seda: sedaRegistration,
        // Customer name
        customer_name: customers.name,
        agent_user_email: users.email,
        agent_code: users.agent_code,
        // Invoice fields
        invoice_number: invoices.invoice_number,
        invoice_total: invoices.total_amount,
        invoice_percent_paid: invoices.percent_of_total_amount,
        invoice_id: invoices.id,
      })
      .from(sedaRegistration)
      .leftJoin(invoices, or(eq(invoices.linked_seda_registration, sedaRegistration.bubble_id), sql`${invoices.bubble_id} = ANY(${sedaRegistration.linked_invoice})`))
      .leftJoin(customers, eq(invoices.linked_customer, customers.customer_id))
      .leftJoin(users, eq(sedaRegistration.agent, users.bubble_id))
      .where(eq(sedaRegistration.bubble_id, bubble_id))
      .limit(1);

    if (result.length === 0) {
      return NextResponse.json(
        { error: "SEDA registration not found" },
        { status: 404 }
      );
    }

    const { seda, customer_name, agent_user_email, agent_code, invoice_number, invoice_total, invoice_percent_paid, invoice_id } = result[0];

    // Calculate checkpoints
    const hasRequiredPayment = parseFloat(invoice_percent_paid || "0") >= 4;
    const applicationType = String(seda.application_type || "").toLowerCase();
    const nemType = String(seda.nem_type || "").toLowerCase();
    const isCommercial =
      applicationType === "commercial" ||
      nemType.includes("commercial") ||
      nemType.includes("nova") ||
      !!seda.company_registration_no;
    const hasCommercialDocs = !!(
      seda.ssm_form_9 &&
      seda.ssm_form_49 &&
      seda.director_ic_front &&
      seda.director_ic_back
    );

    const checkpoints = {
      name: !!customer_name,
      address: !!seda.installation_address,
      mykad: !!(seda.mykad_pdf || seda.ic_copy_front),
      tnb_bill: !!(seda.tnb_bill_1 || seda.tnb_bill_2 || seda.tnb_bill_3),
      tnb_meter: !!seda.tnb_meter,
      emergency_contact: !!(seda.e_contact_name && seda.e_contact_no && seda.e_contact_relationship),
      payment_required: hasRequiredPayment,
      ...(isCommercial ? { commercial_docs: hasCommercialDocs } : {}),
    };

    const completed_count = Object.values(checkpoints).filter(Boolean).length;
    const total_checkpoints = Object.keys(checkpoints).length;
    const progress_percentage = Math.round((completed_count / total_checkpoints) * 100);

    // Return response with customer data
    return NextResponse.json({
      seda: {
        ...seda,
        agent_user_id: seda.agent,
        agent_user_email,
        agent_code,
      },
      customer: customer_name ? { name: customer_name } : null,
      agent: seda.agent ? {
        user_id: seda.agent,
        email: agent_user_email,
        agent_code,
      } : null,
      invoice: invoice_id ? {
        id: invoice_id,
        invoice_number: invoice_number,
        total_amount: invoice_total,
        percent_of_total_amount: invoice_percent_paid
      } : null,
      payments: [],
      checkpoints,
      completed_count,
      total_checkpoints,
      progress_percentage,
    });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json(
      {
        error: "Failed to fetch SEDA registration",
        message: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/seda/[bubble_id]
 * Update SEDA registration fields (admin edit)
 *
 * Important: never alters schema; only updates existing columns on `seda_registration`.
 */
export async function PATCH(
  request: NextRequest,
  { params }: RouteContext
) {
  try {
    const { bubble_id } = await params;
    const body = await request.json();

    // Fetch current row before update so we can diff before/after for the audit log
    const current = await db.query.sedaRegistration.findFirst({
      where: eq(sedaRegistration.bubble_id, bubble_id),
    });

    // Whitelist strictly to existing columns in the Drizzle schema to avoid runtime errors.
    // Block primary identifiers to prevent accidental data corruption.
    const cols = getTableColumns(sedaRegistration);
    const DISALLOWED = new Set([
      "id",
      "bubble_id",
      "created_at",
      "created_date",
      "last_synced_at",
      "updated_at",
    ]);

    const updateData: Record<string, any> = {};
    const unknownKeys: string[] = [];
    for (const [key, value] of Object.entries(body || {})) {
      if (DISALLOWED.has(key)) continue;
      if (!(key in cols)) {
        unknownKeys.push(key);
        continue;
      }
      // Avoid common DB cast errors when a user clears a numeric/timestamp field.
      // Empty-string is almost never a valid value in Postgres for these types.
      updateData[key] = value === "" ? null : value;
    }

    const commercialDocKeys = [
      "application_type",
      "ssm_form_9",
      "ssm_form_49",
      "director_ic_front",
      "director_ic_back",
    ];
    if (commercialDocKeys.some((key) => key in updateData)) {
      const merged = { ...(current || {}), ...updateData } as any;
      const isCommercial = String(merged.application_type || "").toLowerCase() === "commercial";
      updateData.commercial_docs_completed = isCommercial
        ? !!(merged.ssm_form_9 && merged.ssm_form_49 && merged.director_ic_front && merged.director_ic_back)
        : false;
    }

    // Always bump updated_at server-side, never from the client.
    updateData.updated_at = new Date();

    if (unknownKeys.length > 0) {
      return NextResponse.json(
        { error: "Unknown fields in request body", unknown_keys: unknownKeys },
        { status: 400 }
      );
    }

    if (Object.keys(updateData).length === 1) {
      return NextResponse.json(
        { error: "No valid fields provided for update" },
        { status: 400 }
      );
    }

    const updated = await db
      .update(sedaRegistration)
      .set(updateData)
      .where(eq(sedaRegistration.bubble_id, bubble_id))
      .returning();

    if (updated.length === 0) {
      return NextResponse.json(
        { error: "SEDA registration not found" },
        { status: 404 }
      );
    }

    // Write audit log — fire-and-forget, never blocks the response
    void (async () => {
      try {
        // Build change list by diffing request body against prior state
        const changes: Array<{ field: string; before: any; after: any }> = [];
        for (const [key, after] of Object.entries(updateData)) {
          if (key === 'updated_at') continue;
          const before = current ? (current as any)[key] : undefined;
          const beforeStr = before == null ? null : String(before);
          const afterStr = after == null ? null : String(after);
          if (beforeStr !== afterStr) {
            changes.push({ field: key, before: beforeStr, after: afterStr });
          }
        }
        if (changes.length === 0) return;

        // Resolve the linked invoice via linked_seda_registration
        const invoice = await db.query.invoices.findFirst({
          where: eq(invoices.linked_seda_registration, bubble_id),
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
          entity_type: 'seda',
          entity_id: bubble_id,
          action_type: 'update',
          changes,
          actor_name: actor.name ?? null,
          actor_phone: actor.phone ?? null,
          actor_user_id: actor.userId ?? null,
          actor_role: actor.role ?? null,
          source_app: 'ee-admin',
          edited_at: new Date(),
        });
      } catch (e) {
        console.error('[seda/patch] audit log failed:', e);
      }
    })();

    return NextResponse.json({
      success: true,
      data: updated[0],
    });
  } catch (error: any) {
    console.error(error);
    const details: any = {
      message: error?.message,
      code: error?.code,
      detail: error?.detail,
      hint: error?.hint,
      constraint: error?.constraint,
      table: error?.table,
      column: error?.column,
    };
    return NextResponse.json(
      { error: "Failed to update SEDA registration", ...details },
      { status: 500 }
    );
  }
}
