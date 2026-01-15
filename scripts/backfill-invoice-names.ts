/**
 * Backfill script: Updates customer_name_snapshot for existing invoices
 * 
 * This script:
 * 1. Finds all invoices with empty customer_name_snapshot
 * 2. Looks up the customer using linked_customer (Bubble customer ID)
 * 3. Updates the invoice with the customer name from the customers table
 * 4. Also fills in agent_name_snapshot if missing
 */

import { db } from "../src/lib/db";
import { invoices, customers, agents } from "../src/db/schema";
import { eq } from "drizzle-orm";

async function backfillInvoiceCustomerNames() {
  console.log("Starting backfill of customer names for existing invoices...");

  try {
    // Get all invoices
    const allInvoices = await db.select({
      id: invoices.id,
      bubble_id: invoices.bubble_id,
      invoice_number: invoices.invoice_number,
      linked_customer: invoices.linked_customer,
      linked_agent: invoices.linked_agent,
      customer_name_snapshot: invoices.customer_name_snapshot,
      agent_name_snapshot: invoices.agent_name_snapshot
    }).from(invoices);

    console.log(`Found ${allInvoices.length} invoices to check`);

    let updatedCount = 0;
    let customerMissingCount = 0;
    let agentMissingCount = 0;

    for (const invoice of allInvoices) {
      const updates: any = {};

      // Check if customer name needs to be filled
      if (!invoice.customer_name_snapshot || invoice.customer_name_snapshot.trim() === '') {
        if (invoice.linked_customer) {
          const customer = await db.query.customers.findFirst({
            where: eq(customers.customer_id, invoice.linked_customer)
          });

          if (customer && customer.name) {
            updates.customer_name_snapshot = customer.name;
            console.log(`Invoice ${invoice.invoice_number || invoice.id}: Found customer "${customer.name}"`);
          } else {
            console.log(`Invoice ${invoice.invoice_number || invoice.id}: Customer not found for ID ${invoice.linked_customer}`);
            customerMissingCount++;
          }
        } else {
          customerMissingCount++;
        }
      }

      // Check if agent name needs to be filled
      if (!invoice.agent_name_snapshot || invoice.agent_name_snapshot.trim() === '') {
        if (invoice.linked_agent) {
          const agent = await db.query.agents.findFirst({
            where: eq(agents.bubble_id, invoice.linked_agent)
          });

          if (agent && agent.name) {
            updates.agent_name_snapshot = agent.name;
            console.log(`Invoice ${invoice.invoice_number || invoice.id}: Found agent "${agent.name}"`);
          } else {
            console.log(`Invoice ${invoice.invoice_number || invoice.id}: Agent not found for ID ${invoice.linked_agent}`);
            agentMissingCount++;
          }
        } else {
          agentMissingCount++;
        }
      }

      // Apply updates if any
      if (Object.keys(updates).length > 0) {
        await db.update(invoices)
          .set(updates)
          .where(eq(invoices.id, invoice.id));
        updatedCount++;
      }
    }

    console.log("\n=== Backfill Complete ===");
    console.log(`Total invoices checked: ${allInvoices.length}`);
    console.log(`Invoices updated: ${updatedCount}`);
    console.log(`Invoices with missing customer: ${customerMissingCount}`);
    console.log(`Invoices with missing agent: ${agentMissingCount}`);

  } catch (error) {
    console.error("Error during backfill:", error);
    process.exit(1);
  }
}

// Run the backfill
backfillInvoiceCustomerNames()
  .then(() => {
    console.log("Backfill completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Backfill failed:", error);
    process.exit(1);
  });