import { db } from "@/lib/db";
import { invoice_edit_history, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth"; // Assuming you have an auth utility

export type InvoiceEditLogParams = {
  invoiceId: number;
  invoiceNumber: string | null;
  entityType: "invoice" | "invoice_item";
  entityId: string | null;
  actionType: "create" | "update" | "delete";
  before: any;
  after: any;
  fields: string[];
};

export async function logInvoiceEdit(params: InvoiceEditLogParams) {
  try {
    // 1. Identify who is making the change
    // In a server action, we might need to get the user from the session
    // For now, we'll try to get it, or default to 'System' if running in a background job context
    let editorName = "System";
    let editorId = "system";
    let editorRole = "system";
    let editorPhone = "";

    // This is a placeholder for actual auth logic. 
    // If you're using NextAuth or custom auth, replace this.
    try {
        // Attempt to get user from session if available
        // const session = await getServerSession(authOptions);
        // if (session?.user) { ... }
        // For this example, we'll leave it as System/Unknown until integrated with your specific auth
    } catch (e) {
        // Ignore auth errors during logging
    }

    // 2. Calculate the diff
    const changes: Array<{ field: string; before: any; after: any }> = [];

    if (params.actionType === "update") {
      for (const field of params.fields) {
        const beforeVal = params.before ? params.before[field] : null;
        const afterVal = params.after ? params.after[field] : null;

        // Simple strict equality check. For complex objects/arrays, you might need deep comparison
        if (String(beforeVal) !== String(afterVal)) {
           // Format values for display (e.g., handles null/undefined)
           const fmtBefore = beforeVal === null || beforeVal === undefined ? "—" : String(beforeVal);
           const fmtAfter = afterVal === null || afterVal === undefined ? "—" : String(afterVal);
           
           changes.push({
             field,
             before: fmtBefore,
             after: fmtAfter
           });
        }
      }
    } else if (params.actionType === "create") {
        // For creation, we just show what was set
        changes.push({
            field: "item",
            before: null,
            after: params.after?.description || "New Item"
        });
         // Add detailed fields if needed
         if (params.after?.amount) changes.push({ field: "amount", before: null, after: params.after.amount });
    } else if (params.actionType === "delete") {
        changes.push({
            field: "item",
            before: params.before?.description || "Item",
            after: null
        });
    }

    // Only log if there are actual changes or it's a create/delete action
    if (changes.length > 0 || params.actionType !== 'update') {
        await db.insert(invoice_edit_history).values({
            invoice_id: params.invoiceId,
            invoice_number: params.invoiceNumber,
            entity_type: params.entityType,
            entity_id: params.entityId,
            action_type: params.actionType,
            changes: changes, // Drizzle handles JSONB serialization
            edited_by_name: editorName,
            edited_by_user_id: editorId,
            edited_by_role: editorRole,
            edited_by_phone: editorPhone,
            edited_at: new Date(),
        });
    }

  } catch (error) {
    console.error("Failed to log invoice edit:", error);
    // We don't throw here to avoid blocking the actual user action if logging fails
  }
}