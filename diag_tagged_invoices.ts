import { getInvoicesWithDrawingTags } from "./src/app/engineering/actions";

async function main() {
    const data = await getInvoicesWithDrawingTags();
    console.log(`Found ${data.length} tagged invoices.`);
    for (const inv of data) {
        console.log(`Invoice: ${inv.invoice_number}`);
        console.log(`  seda_bubble_id: ${inv.seda_bubble_id}`);
        console.log(`  roofImageCount: ${inv.roofImageCount}`);
        console.log(`  roof_images: ${inv.roof_images}`);
        console.log(`  systemDrawingCount: ${inv.systemDrawingCount}`);
        console.log(`  drawing_pdf_system: ${inv.drawing_pdf_system}`);
        console.log(`  engineeringDrawingCount: ${inv.engineeringDrawingCount}`);
        console.log(`  drawing_engineering_seda_pdf: ${inv.drawing_engineering_seda_pdf}`);
        console.log("-------------------");
    }
    process.exit(0);
}

main().catch(console.error);
