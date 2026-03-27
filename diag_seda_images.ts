import { db } from "./src/lib/db";
import { sedaRegistration, invoices } from "./src/db/schema";
import { isNotNull, sql, eq } from "drizzle-orm";

async function main() {
    const records = await db
        .select({
            id: invoices.id,
            bubble_id: invoices.bubble_id,
            linked_seda: invoices.linked_seda_registration,
            roof_images: sedaRegistration.roof_images,
            drawing_pdf_system: sedaRegistration.drawing_pdf_system,
            drawing_engineering_seda_pdf: sedaRegistration.drawing_engineering_seda_pdf
        })
        .from(invoices)
        .leftJoin(sedaRegistration, eq(invoices.linked_seda_registration, sedaRegistration.bubble_id))
        .where(
            sql`${sedaRegistration.roof_images} IS NOT NULL`
        )
        .limit(10);

    console.log("Found records:");
    for (const r of records) {
        console.log(`Invoice ID: ${r.id}, Linked SEDA: ${r.linked_seda}`);
        console.log(`Roof Images (${typeof r.roof_images}):`, JSON.stringify(r.roof_images));
        console.log("-------");
    }
    process.exit(0);
}

main().catch(console.error);
