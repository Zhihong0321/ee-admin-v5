
import { db } from '../src/lib/db';
import { payments } from '../src/db/schema';
import { count } from 'drizzle-orm';

async function main() {
    try {
        const result = await db.select({ value: count() }).from(payments);
        console.log('Total payment records:', result[0].value);
    } catch (error) {
        console.error('Error counting payments:', error);
    } finally {
        process.exit(0);
    }
}

main();
