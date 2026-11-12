import { db } from "@/lib/db";
import { invoices } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";

/** How many times a link is attempted before the failure is recorded. */
export const LINK_MAX_ATTEMPTS = 3;

/**
 * Atomically add a payment UID to invoice.linked_payment.
 *
 * This is one UPDATE, not a read-modify-write in JavaScript. Postgres locks the
 * invoice row for the statement. If another transaction changed the row first,
 * Postgres re-checks the WHERE clause and recomputes the SET on the newest row
 * version. So two concurrent appends cannot overwrite each other, and a UID that
 * is already on the array is never added twice.
 *
 * Returns true when the UID is on the array after the statement. A false result
 * means the invoice was not found, or the UID is still missing for another reason.
 */
export async function appendPaymentLink(
  invoiceBubbleId: string,
  paymentBubbleId: string,
): Promise<boolean> {
  await db
    .update(invoices)
    .set({
      linked_payment: sql`array_append(COALESCE(${invoices.linked_payment}, ARRAY[]::text[]), ${paymentBubbleId})`,
      updated_at: new Date(),
    })
    .where(
      and(
        eq(invoices.bubble_id, invoiceBubbleId),
        sql`NOT (${paymentBubbleId} = ANY(COALESCE(${invoices.linked_payment}, ARRAY[]::text[])))`,
      ),
    );

  const [row] = await db
    .select({ links: invoices.linked_payment })
    .from(invoices)
    .where(eq(invoices.bubble_id, invoiceBubbleId))
    .limit(1);

  return Boolean(row?.links?.includes(paymentBubbleId));
}
