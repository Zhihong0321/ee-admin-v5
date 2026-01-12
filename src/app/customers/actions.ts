"use server";

import { db } from "@/lib/db";
import { customers, customer_history, agents } from "@/db/schema";
import { ilike, or, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function getCustomers(search?: string) {
  console.log(`Fetching customers: search=${search}`);
  try {
    const filters = search
      ? or(
          ilike(customers.name, `%${search}%`),
          ilike(customers.email, `%${search}%`),
          ilike(customers.phone, `%${search}%`),
          ilike(customers.customer_id, `%${search}%`),
          ilike(customers.ic_number, `%${search}%`),
          ilike(agents.name, `%${search}%`)
        )
      : undefined;

    const data = await db
      .select({
        id: customers.id,
        customer_id: customers.customer_id,
        name: customers.name,
        email: customers.email,
        phone: customers.phone,
        address: customers.address,
        city: customers.city,
        state: customers.state,
        postcode: customers.postcode,
        ic_number: customers.ic_number,
        notes: customers.notes,
        version: customers.version,
        created_by: customers.created_by,
        agent_name: agents.name,
      })
      .from(customers)
      .leftJoin(agents, eq(customers.created_by, sql`CAST(${agents.id} AS TEXT)`))
      .where(filters)
      .orderBy(desc(customers.id))
      .limit(50);

    console.log(`Fetched ${data.length} customers`);
    return data;
  } catch (error) {
    console.error("Database error in getCustomers:", error);
    throw error;
  }
}

export async function updateCustomer(id: number, data: Partial<typeof customers.$inferInsert>, updatedBy?: string) {
  console.log(`Updating customer ${id}:`, data);
  try {
    // The version increment and history insertion are handled by DB triggers
    await db
      .update(customers)
      .set({
        ...data,
        updated_by: updatedBy || "System Admin",
        updated_at: new Date(),
      })
      .where(eq(customers.id, id));
    
    revalidatePath("/customers");
    return { success: true };
  } catch (error) {
    console.error("Database error in updateCustomer:", error);
    throw error;
  }
}

export async function getCustomerHistory(customerId?: number) {
  console.log(`Fetching history ${customerId ? `for customer ${customerId}` : 'for all customers'}`);
  try {
    const query = db
      .select({
        history_id: customer_history.history_id,
        customer_id: customer_history.customer_id,
        name: customer_history.name,
        email: customer_history.email,
        phone: customer_history.phone,
        version: customer_history.version,
        changed_by: customer_history.changed_by,
        changed_at: customer_history.changed_at,
        change_operation: customer_history.change_operation,
      })
      .from(customer_history);
    
    if (customerId) {
      query.where(eq(customer_history.customer_id, customerId));
    }
    
    const data = await query.orderBy(desc(customer_history.changed_at)).limit(100);
    
    return data;
  } catch (error) {
    console.error("Database error in getCustomerHistory:", error);
    throw error;
  }
}

export async function getCustomerById(id: number) {
  try {
    const data = await db
      .select()
      .from(customers)
      .where(eq(customers.id, id))
      .limit(1);
    
    return data[0] || null;
  } catch (error) {
    console.error("Database error in getCustomerById:", error);
    throw error;
  }
}
