
import { db } from './src/lib/db';
import { sedaRegistration, customers } from './src/db/schema';
import { eq, like } from 'drizzle-orm';

async function run() {
    try {
        const result = await db
            .select({
                seda_bubble_id: sedaRegistration.bubble_id,
                customer_name: customers.name,
                ic_no: sedaRegistration.ic_no,
                email: sedaRegistration.email,
                city: sedaRegistration.city,
                state: sedaRegistration.state,
            })
            .from(sedaRegistration)
            .leftJoin(customers, eq(sedaRegistration.linked_customer, customers.customer_id))
            .where(like(customers.name, '%PANG KIEN WING%'))
            .limit(5);

        console.log('SEARCH_RESULT_START');
        console.log(JSON.stringify(result, null, 2));
        console.log('SEARCH_RESULT_END');
    } catch (error) {
        console.error('Error searching:', error);
    } finally {
        process.exit(0);
    }
}

run();
