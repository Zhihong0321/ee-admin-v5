import { getInvoicesWithDrawingTags } from "./src/app/engineering/actions";

async function main() {
    const data = await getInvoicesWithDrawingTags();
    console.log(`Found ${data.length} tagged invoices.`);
    for (const inv of data) {
        console.log(`Invoice: ${inv.invoice_number}`);
        console.log(`  seda_bubble_id: ${inv.seda_bubble_id}`);
        console.log(`  roofImageCount: ${inv.roofImageCount}`);
        console.log(`  invoice_linked_roof_image: ${inv.invoice_linked_roof_image}`);
        console.log(`  seda_roof_images: ${inv.seda_roof_images}`);
        console.log(`  systemDrawingCount: ${inv.systemDrawingCount}`);
        console.log(`  invoice_pv_system_drawing: ${inv.invoice_pv_system_drawing}`);
        console.log(`  seda_drawing_pdf_system: ${inv.seda_drawing_pdf_system}`);
        console.log(`  engineeringDrawingCount: ${inv.engineeringDrawingCount}`);
        console.log(`  seda_drawing_engineering_seda_pdf: ${inv.seda_drawing_engineering_seda_pdf}`);
        console.log("-------------------");
    }
    process.exit(0);
}

main().catch(console.error);
