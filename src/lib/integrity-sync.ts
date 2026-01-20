/**
 * INTEGRITY-FIRST SYNC FUNCTIONS
 *
 * Phase 2: Build sync functions that:
 * 1. Use complete field mappings (zero data loss)
 * 2. Respect dependency order (sync relations first)
 * 3. Implement MERGE logic (preserve local-only fields)
 * 4. Track progress
 * 5. Handle errors gracefully
 *
 * File: src/lib/integrity-sync.ts
 */

import { db } from "@/lib/db";
import * as schema from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import {
  ALL_FIELD_MAPPINGS,
  ALL_MAPPING_FUNCTIONS,
  extractInvoiceRelations
} from "./complete-bubble-mappings";
import {
  updateSyncProgress,
  completeSyncProgress,
  errorSyncProgress
} from "./sync-progress";

const BUBBLE_API_KEY = process.env.BUBBLE_API_KEY || 'b870d2b5ee6e6b39bcf99409c59c9e02';
const BUBBLE_BASE_URL = 'https://eternalgy.bubbleapps.io/api/1.1/obj';

// ============================================================================
// BUBBLE API HELPERS
// ============================================================================

async function fetchBubbleRecord(typeName: string, bubbleId: string): Promise<any> {
  const response = await fetch(`${BUBBLE_BASE_URL}/${typeName}/${bubbleId}`, {
    headers: { 'Authorization': `Bearer ${BUBBLE_API_KEY}` }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${typeName} ${bubbleId} from Bubble: ${response.statusText}`);
  }

  const data = await response.json();
  return data.response;
}

// ============================================================================
// MERGE LOGIC (The Key to Data Integrity)
// ============================================================================

/**
 * MERGE strategy for updates:
 * 1. If record doesn't exist → INSERT everything
 * 2. If record exists → UPDATE only known fields, preserve unknown fields
 *
 * This prevents data loss when new fields are added to Bubble
 */
async function upsertWithMerge(
  table: any,
  bubbleId: string,
  mappedData: Record<string, any>,
  conflictTarget: any
) {
  // Check if record exists
  const existing = await db.select()
    .from(table)
    .where(eq(table.bubble_id, bubbleId))
    .limit(1);

  if (existing.length === 0) {
    // INSERT NEW
    await db.insert(table)
      .values({ bubble_id: bubbleId, ...mappedData });
    return { action: 'INSERT', fields: Object.keys(mappedData).length };
  } else {
    // UPDATE with MERGE
    // Only update fields that we have mappings for
    // Preserve any fields that aren't in our mapping (local-only fields)
    await db.update(table)
      .set({
        ...mappedData,
        updated_at: mappedData.updated_at || new Date(),
        last_synced_at: new Date()
      })
      .where(eq(table.bubble_id, bubbleId));
    return { action: 'UPDATE', fields: Object.keys(mappedData).length };
  }
}

// ============================================================================
// TABLE-SPECIFIC SYNC FUNCTIONS
// ============================================================================

/**
 * Sync single agent from Bubble
 */
export async function syncAgentIntegrity(bubbleId: string): Promise<{
  success: boolean;
  action: string;
  error?: string;
}> {
  try {
    const bubbleAgent = await fetchBubbleRecord('agent', bubbleId);
    const mappedAgent = ALL_MAPPING_FUNCTIONS.agent(bubbleAgent);

    // Add timestamps
    mappedAgent.updated_at = bubbleAgent['Modified Date'] ? new Date(bubbleAgent['Modified Date']) : new Date();
    mappedAgent.created_at = bubbleAgent['Created Date'] ? new Date(bubbleAgent['Created Date']) : new Date();
    mappedAgent.last_synced_at = new Date();

    await upsertWithMerge(schema.agents, bubbleId, mappedAgent, schema.agents.bubble_id);

    return { success: true, action: 'agent' };
  } catch (error: any) {
    return { success: false, action: 'agent', error: error.message };
  }
}

/**
 * Sync single customer from Bubble
 */
export async function syncCustomerIntegrity(customerId: string): Promise<{
  success: boolean;
  action: string;
  error?: string;
}> {
  try {
    // Note: Bubble object is "Customer_Profile", not "customer"
    const bubbleCustomer = await fetchBubbleRecord('Customer_Profile', customerId);
    const mappedCustomer = ALL_MAPPING_FUNCTIONS.customer(bubbleCustomer);

    // Add timestamps
    mappedCustomer.updated_at = bubbleCustomer['Modified Date'] ? new Date(bubbleCustomer['Modified Date']) : new Date();
    mappedCustomer.created_at = bubbleCustomer['Created Date'] ? new Date(bubbleCustomer['Created Date']) : new Date();
    mappedCustomer.last_synced_at = new Date();

    // Customer uses customer_id as unique key, not bubble_id
    await db.insert(schema.customers)
      .values({ customer_id: customerId, ...mappedCustomer })
      .onConflictDoUpdate({
        target: schema.customers.customer_id,
        set: {
          ...mappedCustomer,
          updated_at: mappedCustomer.updated_at,
          last_synced_at: new Date()
        }
      });

    return { success: true, action: 'customer' };
  } catch (error: any) {
    return { success: false, action: 'customer', error: error.message };
  }
}

/**
 * Sync single user from Bubble
 */
export async function syncUserIntegrity(bubbleId: string): Promise<{
  success: boolean;
  action: string;
  error?: string;
}> {
  try {
    const bubbleUser = await fetchBubbleRecord('user', bubbleId);
    const mappedUser = ALL_MAPPING_FUNCTIONS.user(bubbleUser);

    // Add timestamps
    mappedUser.updated_at = bubbleUser['Modified Date'] ? new Date(bubbleUser['Modified Date']) : new Date();
    mappedUser.created_at = bubbleUser['Created Date'] ? new Date(bubbleUser['Created Date']) : new Date();
    mappedUser.last_synced_at = new Date();

    await upsertWithMerge(schema.users, bubbleId, mappedUser, schema.users.bubble_id);

    return { success: true, action: 'user' };
  } catch (error: any) {
    return { success: false, action: 'user', error: error.message };
  }
}

/**
 * Sync single payment from Bubble
 */
export async function syncPaymentIntegrity(bubbleId: string): Promise<{
  success: boolean;
  action: string;
  error?: string;
}> {
  try {
    const bubblePayment = await fetchBubbleRecord('payment', bubbleId);
    const mappedPayment = ALL_MAPPING_FUNCTIONS.payment(bubblePayment);

    // Add timestamps
    mappedPayment.updated_at = bubblePayment['Modified Date'] ? new Date(bubblePayment['Modified Date']) : new Date();
    mappedPayment.created_at = bubblePayment['Created Date'] ? new Date(bubblePayment['Created Date']) : new Date();
    mappedPayment.modified_date = mappedPayment.updated_at;
    mappedPayment.last_synced_at = new Date();

    await upsertWithMerge(schema.payments, bubbleId, mappedPayment, schema.payments.bubble_id);

    return { success: true, action: 'payment' };
  } catch (error: any) {
    return { success: false, action: 'payment', error: error.message };
  }
}

/**
 * Sync single submitted_payment from Bubble
 */
export async function syncSubmittedPaymentIntegrity(bubbleId: string): Promise<{
  success: boolean;
  action: string;
  error?: string;
}> {
  try {
    const bubblePayment = await fetchBubbleRecord('submit_payment', bubbleId);
    const mappedPayment = ALL_MAPPING_FUNCTIONS.submitted_payment(bubblePayment);

    // Add timestamps
    mappedPayment.updated_at = bubblePayment['Modified Date'] ? new Date(bubblePayment['Modified Date']) : new Date();
    mappedPayment.created_at = bubblePayment['Created Date'] ? new Date(bubblePayment['Created Date']) : new Date();
    mappedPayment.modified_date = mappedPayment.updated_at;
    mappedPayment.last_synced_at = new Date();

    await upsertWithMerge(schema.submitted_payments, bubbleId, mappedPayment, schema.submitted_payments.bubble_id);

    return { success: true, action: 'submitted_payment' };
  } catch (error: any) {
    return { success: false, action: 'submitted_payment', error: error.message };
  }
}

/**
 * Sync single invoice_item from Bubble
 */
export async function syncInvoiceItemIntegrity(bubbleId: string): Promise<{
  success: boolean;
  action: string;
  error?: string;
}> {
  try {
    const bubbleItem = await fetchBubbleRecord('invoice_item', bubbleId);
    const mappedItem = ALL_MAPPING_FUNCTIONS.invoice_item(bubbleItem);

    // Add timestamps
    mappedItem.updated_at = bubbleItem['Modified Date'] ? new Date(bubbleItem['Modified Date']) : new Date();
    mappedItem.created_at = bubbleItem['Created Date'] ? new Date(bubbleItem['Created Date']) : new Date();
    mappedItem.modified_date = mappedItem.updated_at;
    mappedItem.last_synced_at = new Date();

    await upsertWithMerge(schema.invoice_items, bubbleId, mappedItem, schema.invoice_items.bubble_id);

    return { success: true, action: 'invoice_item' };
  } catch (error: any) {
    return { success: false, action: 'invoice_item', error: error.message };
  }
}

/**
 * Sync single seda_registration from Bubble
 */
export async function syncSedaRegistrationIntegrity(bubbleId: string): Promise<{
  success: boolean;
  action: string;
  error?: string;
}> {
  try {
    const bubbleSeda = await fetchBubbleRecord('seda_registration', bubbleId);
    const mappedSeda = ALL_MAPPING_FUNCTIONS.seda_registration(bubbleSeda);

    // Add timestamps
    mappedSeda.updated_at = bubbleSeda['Modified Date'] ? new Date(bubbleSeda['Modified Date']) : new Date();
    mappedSeda.created_at = bubbleSeda['Created Date'] ? new Date(bubbleSeda['Created Date']) : new Date();
    mappedSeda.last_synced_at = new Date();

    await upsertWithMerge(schema.sedaRegistration, bubbleId, mappedSeda, schema.sedaRegistration.bubble_id);

    return { success: true, action: 'seda_registration' };
  } catch (error: any) {
    return { success: false, action: 'seda_registration', error: error.message };
  }
}

// ============================================================================
// MASTER INVOICE SYNC (WITH ALL DEPENDENCIES)
// ============================================================================

export interface SyncInvoiceResult {
  success: boolean;
  invoiceId: string;
  steps: Array<{
    action: string;
    success: boolean;
    error?: string;
  }>;
  errors: string[];
  stats: {
    agent: number;
    customer: number;
    user: number;
    payments: number;
    submitted_payments: number;
    invoice_items: number;
    seda: number;
    invoice: number;
  };
}

/**
 * MAIN FUNCTION: Sync complete invoice with all dependencies
 *
 * This function:
 * 1. Fetches invoice from Bubble
 * 2. Extracts all relations
 * 3. Syncs dependencies in correct order
 * 4. Syncs invoice itself
 * 5. Returns detailed results
 */
export async function syncInvoiceWithFullIntegrity(
  invoiceBubbleId: string,
  options: {
    sessionId?: string;
    force?: boolean;  // Skip timestamp check
    skipUsers?: boolean; // Skip syncing users
    skipAgents?: boolean; // Skip syncing agents
    onProgress?: (step: string, message: string) => void;
  } = {}
): Promise<SyncInvoiceResult> {
  const results: SyncInvoiceResult = {
    success: false,
    invoiceId: invoiceBubbleId,
    steps: [],
    errors: [],
    stats: {
      agent: 0,
      customer: 0,
      user: 0,
      payments: 0,
      submitted_payments: 0,
      invoice_items: 0,
      seda: 0,
      invoice: 0
    }
  };

  const log = (step: string, message: string) => {
    console.log(`[syncInvoice] ${step}: ${message}`);
    options.onProgress?.(step, message);
  };

  try {
    log('START', `Starting sync for invoice ${invoiceBubbleId}`);

    // STEP 1: Fetch invoice from Bubble
    log('FETCH', `Fetching invoice from Bubble...`);
    const bubbleInvoice = await fetchBubbleRecord('invoice', invoiceBubbleId);
    results.steps.push({ action: 'fetch_invoice', success: true });

    // STEP 2: Check if update needed (unless force=true)
    if (!options.force) {
      const localInvoice = await db.query.invoices.findFirst({
        where: eq(schema.invoices.bubble_id, invoiceBubbleId)
      });

      if (localInvoice) {
        const bubbleModified = new Date(bubbleInvoice['Modified Date']);
        // updated_at should never be null, but handle it just in case
        const localModified = localInvoice.updated_at ? new Date(localInvoice.updated_at) : new Date(0);

        if (bubbleModified <= localModified) {
          log('SKIP', `Invoice is up-to-date (Bubble: ${bubbleModified}, Local: ${localModified})`);
          return {
            ...results,
            success: true,
            steps: [{ action: 'skip', success: true }]
          };
        }
      }
    }

    // STEP 3: Extract relations
    log('EXTRACT', 'Extracting relations...');
    const relations = extractInvoiceRelations(bubbleInvoice);
    results.steps.push({ action: 'extract_relations', success: true });

    // STEP 4: Sync dependencies in correct order
    // LEVEL 0: Agent (if linked) - SKIP if skipAgents=true
    if (relations.agent && !options.skipAgents) {
      log('SYNC_AGENT', `Syncing agent ${relations.agent}...`);
      const agentResult = await syncAgentIntegrity(relations.agent);
      results.steps.push(agentResult);
      if (agentResult.success) {
        results.stats.agent++;
      }
    } else if (relations.agent && options.skipAgents) {
      log('SKIP_AGENT', `Skipping agent ${relations.agent} (skipAgents=true)`);
    }

    // LEVEL 0: Customer (if linked)
    if (relations.customer) {
      log('SYNC_CUSTOMER', `Syncing customer ${relations.customer}...`);
      const customerResult = await syncCustomerIntegrity(relations.customer);
      results.steps.push(customerResult);
      if (customerResult.success) {
        results.stats.customer++;
      }
    }

    // LEVEL 1: Created By (user) - SKIP if skipUsers=true
    if (relations.created_by && !options.skipUsers) {
      log('SYNC_USER', `Syncing user ${relations.created_by}...`);
      const userResult = await syncUserIntegrity(relations.created_by);
      results.steps.push(userResult);
      if (userResult.success) {
        results.stats.user++;
      }
    } else if (relations.created_by && options.skipUsers) {
      log('SKIP_USER', `Skipping user ${relations.created_by} (skipUsers=true)`);
    }

    // LEVEL 3: Payments (array)
    if (relations.payments && relations.payments.length > 0) {
      log('SYNC_PAYMENTS', `Syncing ${relations.payments.length} payments...`);

      for (const paymentId of relations.payments) {
        const paymentResult = await syncPaymentIntegrity(paymentId);
        results.steps.push(paymentResult);
        if (paymentResult.success) {
          results.stats.payments++;
        } else {
          // Payment might be in submit_payment table instead
          const subPaymentResult = await syncSubmittedPaymentIntegrity(paymentId);
          results.steps.push(subPaymentResult);
          if (subPaymentResult.success) {
            results.stats.submitted_payments++;
          } else {
            results.errors.push(`Payment ${paymentId} failed: ${paymentResult.error}`);
          }
        }
      }
    }

    // LEVEL 3: Invoice Items (array)
    if (relations.invoice_items && relations.invoice_items.length > 0) {
      log('SYNC_ITEMS', `Syncing ${relations.invoice_items.length} invoice items...`);

      for (const itemId of relations.invoice_items) {
        const itemResult = await syncInvoiceItemIntegrity(itemId);
        results.steps.push(itemResult);
        if (itemResult.success) {
          results.stats.invoice_items++;
        } else {
          results.errors.push(`Invoice item ${itemId} failed: ${itemResult.error}`);
        }
      }
    }

    // LEVEL 4: SEDA Registration
    if (relations.seda_registration) {
      log('SYNC_SEDA', `Syncing SEDA registration ${relations.seda_registration}...`);
      const sedaResult = await syncSedaRegistrationIntegrity(relations.seda_registration);
      results.steps.push(sedaResult);
      if (sedaResult.success) {
        results.stats.seda++;
      }
    }

    // STEP 5: Finally, sync the invoice itself
    log('SYNC_INVOICE', `Syncing invoice ${invoiceBubbleId}...`);
    const mappedInvoice = ALL_MAPPING_FUNCTIONS.invoice(bubbleInvoice);

    // DEBUG: Log linked_invoice_item before upsert
    log('DEBUG', `linked_invoice_item in mappedInvoice: ${JSON.stringify(mappedInvoice.linked_invoice_item)}`);
    log('DEBUG', `linked_invoice_item type: ${Array.isArray(mappedInvoice.linked_invoice_item) ? 'array' : typeof mappedInvoice.linked_invoice_item}`);
    log('DEBUG', `linked_invoice_item length: ${Array.isArray(mappedInvoice.linked_invoice_item) ? mappedInvoice.linked_invoice_item.length : 'N/A'}`);

    // Add timestamps
    mappedInvoice.updated_at = bubbleInvoice['Modified Date'] ? new Date(bubbleInvoice['Modified Date']) : new Date();
    mappedInvoice.created_at = bubbleInvoice['Created Date'] ? new Date(bubbleInvoice['Created Date']) : new Date();
    mappedInvoice.created_date = mappedInvoice.created_at; // Bubble field
    mappedInvoice.modified_date = mappedInvoice.updated_at; // Bubble field
    mappedInvoice.last_synced_at = new Date();

    await upsertWithMerge(schema.invoices, invoiceBubbleId, mappedInvoice, schema.invoices.bubble_id);

    results.stats.invoice++;
    results.steps.push({ action: 'sync_invoice', success: true });

    results.success = true;

    log('COMPLETE', `✅ Sync complete!`);

    // Summary
    log('SUMMARY', `
      Agent: ${results.stats.agent}
      Customer: ${results.stats.customer}
      User: ${results.stats.user}
      Payments: ${results.stats.payments}
      Submitted Payments: ${results.stats.submitted_payments}
      Invoice Items: ${results.stats.invoice_items}
      SEDA: ${results.stats.seda}
      Invoice: ${results.stats.invoice}
      Errors: ${results.errors.length}
    `);

  } catch (error: any) {
    results.errors.push(`FATAL: ${error.message}`);
    results.success = false;
    log('ERROR', `Sync failed: ${error.message}`);
  }

  return results;
}

// ============================================================================
// BATCH SYNC FUNCTIONS
// ============================================================================

/**
 * Sync multiple invoices by date range
 */
export async function syncBatchInvoicesWithIntegrity(
  dateFrom: string,
  dateTo?: string,
  options: {
    sessionId?: string;
    syncSessionId?: string; // NEW: DB-based progress tracking session ID
    onProgress?: (current: number, total: number, message: string) => void;
  } = {}
): Promise<{
  success: boolean;
  results: {
    total: number;
    synced: number;
    skipped: number;
    failed: number;
    errors: string[];
  };
}> {
  const log = (message: string) => {
    console.log(`[BATCH SYNC] ${message}`);
  };

  try {
    log('Fetching invoices from Bubble...');

    // Fetch all invoices from Bubble
    // Note: Bubble API doesn't support constraints on Modified Date
    const allInvoices: any[] = [];
    let cursor = 0;

    while (true) {
      const response = await fetch(`${BUBBLE_BASE_URL}/invoice?limit=100&cursor=${cursor}`, {
        headers: { 'Authorization': `Bearer ${BUBBLE_API_KEY}` }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch invoices: ${response.statusText}`);
      }

      const data = await response.json();
      const records = data.response.results || [];
      const remaining = data.response.remaining || 0;

      allInvoices.push(...records);

      if (remaining === 0 || records.length === 0) {
        break;
      }

      cursor += records.length;
    }

    log(`Fetched ${allInvoices.length} total invoices`);

    // Filter by date range
    const fromDate = new Date(dateFrom);
    const toDate = dateTo ? new Date(dateTo) : new Date();

    const invoicesInDateRange = allInvoices.filter(inv => {
      const modifiedDate = new Date(inv['Modified Date']);
      return modifiedDate >= fromDate && modifiedDate <= toDate;
    });

    log(`Found ${invoicesInDateRange.length} invoices in date range`);

    // Initialize progress in database if sessionId provided
    if (options.syncSessionId) {
      await updateSyncProgress(options.syncSessionId, {
        total_invoices: invoicesInDateRange.length,
        synced_invoices: 0,
      });
    }

    if (invoicesInDateRange.length === 0) {
      if (options.syncSessionId) {
        await completeSyncProgress(options.syncSessionId, { synced: 0 });
      }
      return {
        success: true,
        results: {
          total: 0,
          synced: 0,
          skipped: 0,
          failed: 0,
          errors: []
        }
      };
    }

    // Sync each invoice
    let synced = 0;
    let skipped = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < invoicesInDateRange.length; i++) {
      const invoice = invoicesInDateRange[i];

      options.onProgress?.(i + 1, invoicesInDateRange.length, `Syncing invoice ${invoice._id}...`);

      const result = await syncInvoiceWithFullIntegrity(invoice._id, {
        sessionId: options.sessionId,
        force: false
      });

      if (result.success) {
        if (result.steps.some(s => s.action === 'skip')) {
          skipped++;
        } else {
          synced++;
        }
      } else {
        failed++;
        errors.push(...result.errors);
      }

      // Update progress in database every invoice (or at least frequently)
      if (options.syncSessionId) {
        await updateSyncProgress(options.syncSessionId, {
          synced_invoices: synced + skipped, // Total processed
          current_invoice_id: invoice._id,
        });
      }

      // Log progress every 10 invoices
      if ((i + 1) % 10 === 0) {
        log(`Progress: ${i + 1}/${invoicesInDateRange.length} synced`);
      }
    }

    log(`✅ Batch complete!`);

    // Mark progress as completed
    if (options.syncSessionId) {
      await completeSyncProgress(options.syncSessionId, { synced });
    }

    return {
      success: true,
      results: {
        total: invoicesInDateRange.length,
        synced,
        skipped,
        failed,
        errors
      }
    };

  } catch (error: any) {
    log(`❌ Batch sync failed: ${error.message}`);

    // Mark progress as errored
    if (options.syncSessionId) {
      await errorSyncProgress(options.syncSessionId, error.message);
    }

    return {
      success: false,
      results: {
        total: 0,
        synced: 0,
        skipped: 0,
        failed: 0,
        errors: [error.message]
      }
    };
  }
}
