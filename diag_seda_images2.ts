import { db } from "./src/lib/db";
import { sedaRegistration } from "./src/db/schema";
import { sql } from "drizzle-orm";
import * as fs from "fs";

async function main() {
    const records = await db
        .select({
            id: sedaRegistration.id,
            roof_images: sedaRegistration.roof_images,
            sys: sedaRegistration.drawing_pdf_system,
            eng: sedaRegistration.drawing_engineering_seda_pdf
        })
        .from(sedaRegistration)
        .where(sql`${sedaRegistration.roof_images} IS NOT NULL`)
        .limit(5);

    fs.writeFileSync("diag_out.json", JSON.stringify(records, null, 2));
    process.exit(0);
}

main().catch(console.error);
