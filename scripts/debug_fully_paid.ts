
import { db } from '../src/lib/db';
import { invoices, customers, agents } from '../src/db/schema';
import { eq, sql, desc, or, and } from 'drizzle-orm';

async function check() {
    try {
        console.log('--- DIAGNOSTIC START ---');

        console.log('Querying invoices...');

        // 1. Raw count of paid invoices
        const paidInvoices = await db
            .select({ count: sql<number>`count(*)` })
            .from(invoices)
            .where(eq(invoices.paid, true));
        console.log('Invoices with paid=true:', Number(paidInvoices[0].count));

        // 2. Raw count of 99.9% invoices
        const percentInvoices = await db
            .select({ count: sql<number>`count(*)` })
            .from(invoices)
            .where(sql`cast(${invoices.percent_of_total_amount} as numeric) >= 99.9`);
        console.log('Invoices with percent >= 99.9:', Number(percentInvoices[0].count));

        // 3. Check full_payment_date distribution for PAID invoices
        // If full_payment_date is NULL, they might be sorted to the end or hidden if filtering for non-null
        const nullDate = await db
            .select({ count: sql<number>`count(*)` })
            .from(invoices)
            .where(and(eq(invoices.paid, true), sql`${invoices.full_payment_date} IS NULL`));
        console.log('Paid invoices with NULL full_payment_date:', Number(nullDate[0].count));

        // 4. Simulate getFullyPaidInvoices query logic FROM actions.ts
        // Note: The original query uses `orderBy(desc(invoices.full_payment_date))`
        // In Postgres, NULLs come FIRST in DESC order by default unless NULLS LAST is specified.
        // Wait, by default: ASC = NULLS LAST, DESC = NULLS FIRST.
        // So if they are NULL, they should appear at the TOP of the list?

        const whereClause = or(
            eq(invoices.paid, true),
            sql`cast(${invoices.percent_of_total_amount} as numeric) >= 99.9`
        );

        const queryData = await db
            .select({
                id: invoices.id,
                invoice_number: invoices.invoice_number,
                full_payment_date: invoices.full_payment_date,
                paid: invoices.paid,
                percent: invoices.percent_of_total_amount
            })
            .from(invoices)
            .leftJoin(customers, eq(invoices.linked_customer, customers.customer_id))
            .leftJoin(agents, eq(invoices.linked_agent, agents.bubble_id))
            .where(whereClause)
            .orderBy(desc(invoices.full_payment_date), desc(invoices.updated_at))
            .limit(10);

        console.log(`Query Result Count (Limit 10): ${queryData.length}`);
        if (queryData.length > 0) {
            console.log('First result:', JSON.stringify(queryData[0], null, 2));
        } else {
            console.log('NO RESULTS FOUND with the query.');
        }

        console.log('--- DIAGNOSTIC END ---');
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

check();
