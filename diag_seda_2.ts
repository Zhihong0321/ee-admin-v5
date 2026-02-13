
import { db } from "./src/lib/db";
import { sedaRegistration, invoices } from "./src/db/schema";
import { sql, or, eq, and, isNull } from "drizzle-orm";

async function diag2() {
    try {
        console.log("Joined Records with Status 'Pending' and >= 4%:");
        const pendingPaid = await db
            .select({ count: sql`count(*)` })
            .from(invoices)
            .innerJoin(sedaRegistration, or(
                eq(invoices.linked_seda_registration, sedaRegistration.bubble_id),
                sql`${invoices.bubble_id} = ANY(${sedaRegistration.linked_invoice})`
            ))
            .where(and(
                sql`CAST(${invoices.percent_of_total_amount} AS NUMERIC) >= 4`,
                eq(sedaRegistration.seda_status, 'Pending')
            ));
        console.table(pendingPaid);

        console.log("\nJoined Records with Status NULL and >= 4%:");
        const nullPaid = await db
            .select({ count: sql`count(*)` })
            .from(invoices)
            .innerJoin(sedaRegistration, or(
                eq(invoices.linked_seda_registration, sedaRegistration.bubble_id),
                sql`${invoices.bubble_id} = ANY(${sedaRegistration.linked_invoice})`
            ))
            .where(and(
                sql`CAST(${invoices.percent_of_total_amount} AS NUMERIC) >= 4`,
                isNull(sedaRegistration.seda_status)
            ));
        console.table(nullPaid);

    } catch (e) {
        console.error(e);
    }
}

diag2();
