
import { db } from "@/lib/db";
import { customers } from "@/db/schema";

async function run() {
    console.log("Inspecting Customer ID format...");
    const c = await db.select({
        id: customers.id,
        customer_id: customers.customer_id,
        name: customers.name
    }).from(customers).limit(3);

    console.log("Customer Records:", c);
}
run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) });
