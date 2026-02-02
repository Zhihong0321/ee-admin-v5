/**
 * ============================================================================
 * RELATIONSHIP VALIDATOR & REBUILDER
 * ============================================================================
 * 
 * Validates and rebuilds relationships between tables after JSON sync.
 * Ensures all linked_* fields reference existing records and logs missing data.
 * 
 * File: src/lib/relationship-validator.ts
 */

import { db } from "@/lib/db";
import { 
  invoices, 
  payments, 
  submitted_payments, 
  sedaRegistration, 
  invoice_items, 
  customers, 
  agents, 
  users 
} from "@/db/schema";
import { eq, inArray, sql, isNotNull } from "drizzle-orm";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface ValidationError {
  table: string;
  record_id: number;
  bubble_id: string;
  field: string;
  referenced_bubble_id: string;
  referenced_table: string;
  error: string;
  timestamp: Date;
}

export interface ValidationReport {
  started_at: Date;
  completed_at: Date;
  total_records_checked: number;
  total_relationships_checked: number;
  total_errors: number;
  errors_by_table: Record<string, number>;
  errors: ValidationError[];
  fixed_relationships: number;
  summary: string;
}

export interface RebuildOptions {
  fix_broken_links?: boolean;  // Remove references to non-existent records
  validate_only?: boolean;       // Only validate, don't fix
  tables?: string[];             // Specific tables to check (default: all)
  log_to_file?: boolean;         // Save errors to file
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Check if a bubble_id exists in a table
 */
async function checkBubbleIdExists(
  table: any,
  bubbleId: string
): Promise<boolean> {
  const result = await db
    .select({ id: table.id })
    .from(table)
    .where(eq(table.bubble_id, bubbleId))
    .limit(1);
  
  return result.length > 0;
}

/**
 * Check if a customer_id exists in customers table
 */
async function checkCustomerIdExists(customerId: string): Promise<boolean> {
  const result = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.customer_id, customerId))
    .limit(1);
  
  return result.length > 0;
}

/**
 * Get all bubble_ids from a table for batch validation
 */
async function getAllBubbleIds(table: any): Promise<Set<string>> {
  const results = await db
    .select({ bubble_id: table.bubble_id })
    .from(table)
    .where(isNotNull(table.bubble_id));
  
  return new Set(results.map(r => r.bubble_id as string).filter(Boolean));
}

/**
 * Get all customer_ids from customers table
 */
async function getAllCustomerIds(): Promise<Set<string>> {
  const results = await db
    .select({ customer_id: customers.customer_id })
    .from(customers)
    .where(isNotNull(customers.customer_id));
  
  return new Set(results.map(r => r.customer_id as string).filter(Boolean));
}

// ============================================================================
// TABLE-SPECIFIC VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validate invoice relationships
 */
async function validateInvoiceRelationships(
  errors: ValidationError[],
  options: RebuildOptions,
  existingIds: {
    customers: Set<string>;
    agents: Set<string>;
    payments: Set<string>;
    submitted_payments: Set<string>;
    seda: Set<string>;
    invoice_items: Set<string>;
    users: Set<string>;
  }
): Promise<{ checked: number; fixed: number }> {
  console.log('🔍 Validating invoice relationships...');
  
  const allInvoices = await db.select().from(invoices);
  let relationshipsChecked = 0;
  let relationshipsFixed = 0;

  for (const invoice of allInvoices) {
    const invoiceId = invoice.id;
    const bubbleId = invoice.bubble_id || 'unknown';
    let needsUpdate = false;
    const updates: any = {};

    // Check linked_customer
    if (invoice.linked_customer) {
      relationshipsChecked++;
      if (!existingIds.customers.has(invoice.linked_customer)) {
        errors.push({
          table: 'invoice',
          record_id: invoiceId,
          bubble_id: bubbleId,
          field: 'linked_customer',
          referenced_bubble_id: invoice.linked_customer,
          referenced_table: 'customer',
          error: `Customer ${invoice.linked_customer} not found in database`,
          timestamp: new Date()
        });

        if (options.fix_broken_links) {
          updates.linked_customer = null;
          needsUpdate = true;
        }
      }
    }

    // Check linked_agent
    if (invoice.linked_agent) {
      relationshipsChecked++;
      if (!existingIds.agents.has(invoice.linked_agent)) {
        errors.push({
          table: 'invoice',
          record_id: invoiceId,
          bubble_id: bubbleId,
          field: 'linked_agent',
          referenced_bubble_id: invoice.linked_agent,
          referenced_table: 'agent',
          error: `Agent ${invoice.linked_agent} not found in database`,
          timestamp: new Date()
        });

        if (options.fix_broken_links) {
          updates.linked_agent = null;
          needsUpdate = true;
        }
      }
    }

    // Check linked_payment (array)
    if (invoice.linked_payment && Array.isArray(invoice.linked_payment)) {
      const validPayments: string[] = [];
      
      for (const paymentId of invoice.linked_payment) {
        relationshipsChecked++;
        const existsInPayments = existingIds.payments.has(paymentId);
        const existsInSubmitted = existingIds.submitted_payments.has(paymentId);

        if (!existsInPayments && !existsInSubmitted) {
          errors.push({
            table: 'invoice',
            record_id: invoiceId,
            bubble_id: bubbleId,
            field: 'linked_payment',
            referenced_bubble_id: paymentId,
            referenced_table: 'payment / submitted_payment',
            error: `Payment ${paymentId} not found in payment or submitted_payment tables`,
            timestamp: new Date()
          });
        } else {
          validPayments.push(paymentId);
        }
      }

      if (options.fix_broken_links && validPayments.length !== invoice.linked_payment.length) {
        updates.linked_payment = validPayments.length > 0 ? validPayments : null;
        needsUpdate = true;
      }
    }

    // Check linked_seda_registration
    if (invoice.linked_seda_registration) {
      relationshipsChecked++;
      if (!existingIds.seda.has(invoice.linked_seda_registration)) {
        errors.push({
          table: 'invoice',
          record_id: invoiceId,
          bubble_id: bubbleId,
          field: 'linked_seda_registration',
          referenced_bubble_id: invoice.linked_seda_registration,
          referenced_table: 'seda_registration',
          error: `SEDA registration ${invoice.linked_seda_registration} not found in database`,
          timestamp: new Date()
        });

        if (options.fix_broken_links) {
          updates.linked_seda_registration = null;
          needsUpdate = true;
        }
      }
    }

    // Check linked_invoice_item (array)
    if (invoice.linked_invoice_item && Array.isArray(invoice.linked_invoice_item)) {
      const validItems: string[] = [];
      
      for (const itemId of invoice.linked_invoice_item) {
        relationshipsChecked++;
        if (!existingIds.invoice_items.has(itemId)) {
          errors.push({
            table: 'invoice',
            record_id: invoiceId,
            bubble_id: bubbleId,
            field: 'linked_invoice_item',
            referenced_bubble_id: itemId,
            referenced_table: 'invoice_item',
            error: `Invoice item ${itemId} not found in database`,
            timestamp: new Date()
          });
        } else {
          validItems.push(itemId);
        }
      }

      if (options.fix_broken_links && validItems.length !== invoice.linked_invoice_item.length) {
        updates.linked_invoice_item = validItems.length > 0 ? validItems : null;
        needsUpdate = true;
      }
    }

    // Check created_by
    if (invoice.created_by) {
      relationshipsChecked++;
      if (!existingIds.users.has(invoice.created_by)) {
        errors.push({
          table: 'invoice',
          record_id: invoiceId,
          bubble_id: bubbleId,
          field: 'created_by',
          referenced_bubble_id: invoice.created_by,
          referenced_table: 'user',
          error: `User ${invoice.created_by} not found in database`,
          timestamp: new Date()
        });

        if (options.fix_broken_links) {
          updates.created_by = null;
          needsUpdate = true;
        }
      }
    }

    // Apply updates if needed
    if (needsUpdate && !options.validate_only) {
      await db.update(invoices)
        .set({ ...updates, updated_at: new Date() })
        .where(eq(invoices.id, invoiceId));
      relationshipsFixed++;
    }
  }

  console.log(`✅ Checked ${allInvoices.length} invoices, ${relationshipsChecked} relationships`);
  return { checked: relationshipsChecked, fixed: relationshipsFixed };
}

/**
 * Validate payment relationships
 */
async function validatePaymentRelationships(
  errors: ValidationError[],
  options: RebuildOptions,
  existingIds: {
    customers: Set<string>;
    agents: Set<string>;
    invoices: Set<string>;
    users: Set<string>;
  }
): Promise<{ checked: number; fixed: number }> {
  console.log('🔍 Validating payment relationships...');
  
  const allPayments = await db.select().from(payments);
  let relationshipsChecked = 0;
  let relationshipsFixed = 0;

  for (const payment of allPayments) {
    const paymentId = payment.id;
    const bubbleId = payment.bubble_id || 'unknown';
    let needsUpdate = false;
    const updates: any = {};

    // Check linked_invoice
    if (payment.linked_invoice) {
      relationshipsChecked++;
      if (!existingIds.invoices.has(payment.linked_invoice)) {
        errors.push({
          table: 'payment',
          record_id: paymentId,
          bubble_id: bubbleId,
          field: 'linked_invoice',
          referenced_bubble_id: payment.linked_invoice,
          referenced_table: 'invoice',
          error: `Invoice ${payment.linked_invoice} not found in database`,
          timestamp: new Date()
        });

        if (options.fix_broken_links) {
          updates.linked_invoice = null;
          needsUpdate = true;
        }
      }
    }

    // Check linked_customer
    if (payment.linked_customer) {
      relationshipsChecked++;
      if (!existingIds.customers.has(payment.linked_customer)) {
        errors.push({
          table: 'payment',
          record_id: paymentId,
          bubble_id: bubbleId,
          field: 'linked_customer',
          referenced_bubble_id: payment.linked_customer,
          referenced_table: 'customer',
          error: `Customer ${payment.linked_customer} not found in database`,
          timestamp: new Date()
        });

        if (options.fix_broken_links) {
          updates.linked_customer = null;
          needsUpdate = true;
        }
      }
    }

    // Check linked_agent
    if (payment.linked_agent) {
      relationshipsChecked++;
      if (!existingIds.agents.has(payment.linked_agent)) {
        errors.push({
          table: 'payment',
          record_id: paymentId,
          bubble_id: bubbleId,
          field: 'linked_agent',
          referenced_bubble_id: payment.linked_agent,
          referenced_table: 'agent',
          error: `Agent ${payment.linked_agent} not found in database`,
          timestamp: new Date()
        });

        if (options.fix_broken_links) {
          updates.linked_agent = null;
          needsUpdate = true;
        }
      }
    }

    // Check created_by
    if (payment.created_by) {
      relationshipsChecked++;
      if (!existingIds.users.has(payment.created_by)) {
        errors.push({
          table: 'payment',
          record_id: paymentId,
          bubble_id: bubbleId,
          field: 'created_by',
          referenced_bubble_id: payment.created_by,
          referenced_table: 'user',
          error: `User ${payment.created_by} not found in database`,
          timestamp: new Date()
        });

        if (options.fix_broken_links) {
          updates.created_by = null;
          needsUpdate = true;
        }
      }
    }

    // Apply updates if needed
    if (needsUpdate && !options.validate_only) {
      await db.update(payments)
        .set({ ...updates, updated_at: new Date() })
        .where(eq(payments.id, paymentId));
      relationshipsFixed++;
    }
  }

  console.log(`✅ Checked ${allPayments.length} payments, ${relationshipsChecked} relationships`);
  return { checked: relationshipsChecked, fixed: relationshipsFixed };
}

/**
 * Validate submitted_payment relationships (similar to payment)
 */
async function validateSubmittedPaymentRelationships(
  errors: ValidationError[],
  options: RebuildOptions,
  existingIds: {
    customers: Set<string>;
    agents: Set<string>;
    invoices: Set<string>;
    users: Set<string>;
  }
): Promise<{ checked: number; fixed: number }> {
  console.log('🔍 Validating submitted_payment relationships...');
  
  const allSubmittedPayments = await db.select().from(submitted_payments);
  let relationshipsChecked = 0;
  let relationshipsFixed = 0;

  for (const payment of allSubmittedPayments) {
    const paymentId = payment.id;
    const bubbleId = payment.bubble_id || 'unknown';
    let needsUpdate = false;
    const updates: any = {};

    // Same checks as regular payments
    if (payment.linked_invoice) {
      relationshipsChecked++;
      if (!existingIds.invoices.has(payment.linked_invoice)) {
        errors.push({
          table: 'submitted_payment',
          record_id: paymentId,
          bubble_id: bubbleId,
          field: 'linked_invoice',
          referenced_bubble_id: payment.linked_invoice,
          referenced_table: 'invoice',
          error: `Invoice ${payment.linked_invoice} not found in database`,
          timestamp: new Date()
        });

        if (options.fix_broken_links) {
          updates.linked_invoice = null;
          needsUpdate = true;
        }
      }
    }

    if (payment.linked_customer) {
      relationshipsChecked++;
      if (!existingIds.customers.has(payment.linked_customer)) {
        errors.push({
          table: 'submitted_payment',
          record_id: paymentId,
          bubble_id: bubbleId,
          field: 'linked_customer',
          referenced_bubble_id: payment.linked_customer,
          referenced_table: 'customer',
          error: `Customer ${payment.linked_customer} not found in database`,
          timestamp: new Date()
        });

        if (options.fix_broken_links) {
          updates.linked_customer = null;
          needsUpdate = true;
        }
      }
    }

    if (payment.linked_agent) {
      relationshipsChecked++;
      if (!existingIds.agents.has(payment.linked_agent)) {
        errors.push({
          table: 'submitted_payment',
          record_id: paymentId,
          bubble_id: bubbleId,
          field: 'linked_agent',
          referenced_bubble_id: payment.linked_agent,
          referenced_table: 'agent',
          error: `Agent ${payment.linked_agent} not found in database`,
          timestamp: new Date()
        });

        if (options.fix_broken_links) {
          updates.linked_agent = null;
          needsUpdate = true;
        }
      }
    }

    if (payment.created_by) {
      relationshipsChecked++;
      if (!existingIds.users.has(payment.created_by)) {
        errors.push({
          table: 'submitted_payment',
          record_id: paymentId,
          bubble_id: bubbleId,
          field: 'created_by',
          referenced_bubble_id: payment.created_by,
          referenced_table: 'user',
          error: `User ${payment.created_by} not found in database`,
          timestamp: new Date()
        });

        if (options.fix_broken_links) {
          updates.created_by = null;
          needsUpdate = true;
        }
      }
    }

    if (needsUpdate && !options.validate_only) {
      await db.update(submitted_payments)
        .set({ ...updates, updated_at: new Date() })
        .where(eq(submitted_payments.id, paymentId));
      relationshipsFixed++;
    }
  }

  console.log(`✅ Checked ${allSubmittedPayments.length} submitted_payments, ${relationshipsChecked} relationships`);
  return { checked: relationshipsChecked, fixed: relationshipsFixed };
}

/**
 * Validate SEDA registration relationships
 */
async function validateSedaRelationships(
  errors: ValidationError[],
  options: RebuildOptions,
  existingIds: {
    customers: Set<string>;
    invoices: Set<string>;
    users: Set<string>;
  }
): Promise<{ checked: number; fixed: number }> {
  console.log('🔍 Validating SEDA registration relationships...');
  
  const allSeda = await db.select().from(sedaRegistration);
  let relationshipsChecked = 0;
  let relationshipsFixed = 0;

  for (const seda of allSeda) {
    const sedaId = seda.id;
    const bubbleId = seda.bubble_id || 'unknown';
    let needsUpdate = false;
    const updates: any = {};

    // Check linked_customer
    if (seda.linked_customer) {
      relationshipsChecked++;
      if (!existingIds.customers.has(seda.linked_customer)) {
        errors.push({
          table: 'seda_registration',
          record_id: sedaId,
          bubble_id: bubbleId,
          field: 'linked_customer',
          referenced_bubble_id: seda.linked_customer,
          referenced_table: 'customer',
          error: `Customer ${seda.linked_customer} not found in database`,
          timestamp: new Date()
        });

        if (options.fix_broken_links) {
          updates.linked_customer = null;
          needsUpdate = true;
        }
      }
    }

    // Check linked_invoice (array)
    if (seda.linked_invoice && Array.isArray(seda.linked_invoice)) {
      const validInvoices: string[] = [];
      
      for (const invoiceId of seda.linked_invoice) {
        relationshipsChecked++;
        if (!existingIds.invoices.has(invoiceId)) {
          errors.push({
            table: 'seda_registration',
            record_id: sedaId,
            bubble_id: bubbleId,
            field: 'linked_invoice',
            referenced_bubble_id: invoiceId,
            referenced_table: 'invoice',
            error: `Invoice ${invoiceId} not found in database`,
            timestamp: new Date()
          });
        } else {
          validInvoices.push(invoiceId);
        }
      }

      if (options.fix_broken_links && validInvoices.length !== seda.linked_invoice.length) {
        updates.linked_invoice = validInvoices.length > 0 ? validInvoices : null;
        needsUpdate = true;
      }
    }

    // Check created_by
    if (seda.created_by) {
      relationshipsChecked++;
      if (!existingIds.users.has(seda.created_by)) {
        errors.push({
          table: 'seda_registration',
          record_id: sedaId,
          bubble_id: bubbleId,
          field: 'created_by',
          referenced_bubble_id: seda.created_by,
          referenced_table: 'user',
          error: `User ${seda.created_by} not found in database`,
          timestamp: new Date()
        });

        if (options.fix_broken_links) {
          updates.created_by = null;
          needsUpdate = true;
        }
      }
    }

    if (needsUpdate && !options.validate_only) {
      await db.update(sedaRegistration)
        .set({ ...updates, updated_at: new Date() })
        .where(eq(sedaRegistration.id, sedaId));
      relationshipsFixed++;
    }
  }

  console.log(`✅ Checked ${allSeda.length} SEDA registrations, ${relationshipsChecked} relationships`);
  return { checked: relationshipsChecked, fixed: relationshipsFixed };
}

/**
 * Validate invoice_item relationships
 */
async function validateInvoiceItemRelationships(
  errors: ValidationError[],
  options: RebuildOptions,
  existingIds: {
    invoices: Set<string>;
    users: Set<string>;
  }
): Promise<{ checked: number; fixed: number }> {
  console.log('🔍 Validating invoice_item relationships...');
  
  const allItems = await db.select().from(invoice_items);
  let relationshipsChecked = 0;
  let relationshipsFixed = 0;

  for (const item of allItems) {
    const itemId = item.id;
    const bubbleId = item.bubble_id || 'unknown';
    let needsUpdate = false;
    const updates: any = {};

    // Check linked_invoice
    if (item.linked_invoice) {
      relationshipsChecked++;
      if (!existingIds.invoices.has(item.linked_invoice)) {
        errors.push({
          table: 'invoice_item',
          record_id: itemId,
          bubble_id: bubbleId,
          field: 'linked_invoice',
          referenced_bubble_id: item.linked_invoice,
          referenced_table: 'invoice',
          error: `Invoice ${item.linked_invoice} not found in database`,
          timestamp: new Date()
        });

        if (options.fix_broken_links) {
          updates.linked_invoice = null;
          needsUpdate = true;
        }
      }
    }

    // Check created_by
    if (item.created_by) {
      relationshipsChecked++;
      if (!existingIds.users.has(item.created_by)) {
        errors.push({
          table: 'invoice_item',
          record_id: itemId,
          bubble_id: bubbleId,
          field: 'created_by',
          referenced_bubble_id: item.created_by,
          referenced_table: 'user',
          error: `User ${item.created_by} not found in database`,
          timestamp: new Date()
        });

        if (options.fix_broken_links) {
          updates.created_by = null;
          needsUpdate = true;
        }
      }
    }

    if (needsUpdate && !options.validate_only) {
      await db.update(invoice_items)
        .set({ ...updates, updated_at: new Date() })
        .where(eq(invoice_items.id, itemId));
      relationshipsFixed++;
    }
  }

  console.log(`✅ Checked ${allItems.length} invoice items, ${relationshipsChecked} relationships`);
  return { checked: relationshipsChecked, fixed: relationshipsFixed };
}

/**
 * Validate user relationships
 */
async function validateUserRelationships(
  errors: ValidationError[],
  options: RebuildOptions,
  existingIds: {
    agents: Set<string>;
  }
): Promise<{ checked: number; fixed: number }> {
  console.log('🔍 Validating user relationships...');
  
  const allUsers = await db.select().from(users);
  let relationshipsChecked = 0;
  let relationshipsFixed = 0;

  for (const user of allUsers) {
    const userId = user.id;
    const bubbleId = user.bubble_id || 'unknown';
    let needsUpdate = false;
    const updates: any = {};

    // Check linked_agent_profile
    if (user.linked_agent_profile) {
      relationshipsChecked++;
      if (!existingIds.agents.has(user.linked_agent_profile)) {
        errors.push({
          table: 'user',
          record_id: userId,
          bubble_id: bubbleId,
          field: 'linked_agent_profile',
          referenced_bubble_id: user.linked_agent_profile,
          referenced_table: 'agent',
          error: `Agent ${user.linked_agent_profile} not found in database`,
          timestamp: new Date()
        });

        if (options.fix_broken_links) {
          updates.linked_agent_profile = null;
          needsUpdate = true;
        }
      }
    }

    if (needsUpdate && !options.validate_only) {
      await db.update(users)
        .set({ ...updates, updated_at: new Date() })
        .where(eq(users.id, userId));
      relationshipsFixed++;
    }
  }

  console.log(`✅ Checked ${allUsers.length} users, ${relationshipsChecked} relationships`);
  return { checked: relationshipsChecked, fixed: relationshipsFixed };
}

// ============================================================================
// MAIN VALIDATION FUNCTION
// ============================================================================

/**
 * Validate and rebuild all relationships across all tables
 */
export async function validateAndRebuildRelationships(
  options: RebuildOptions = {}
): Promise<ValidationReport> {
  const startTime = new Date();
  console.log('🚀 Starting relationship validation and rebuild...');
  console.log('Options:', options);

  const errors: ValidationError[] = [];
  let totalRecordsChecked = 0;
  let totalRelationshipsChecked = 0;
  let totalRelationshipsFixed = 0;

  // Pre-load all existing IDs for fast validation
  console.log('📋 Pre-loading all existing IDs...');
  const existingIds = {
    customers: await getAllCustomerIds(),
    agents: await getAllBubbleIds(agents),
    users: await getAllBubbleIds(users),
    invoices: await getAllBubbleIds(invoices),
    payments: await getAllBubbleIds(payments),
    submitted_payments: await getAllBubbleIds(submitted_payments),
    seda: await getAllBubbleIds(sedaRegistration),
    invoice_items: await getAllBubbleIds(invoice_items),
  };

  console.log('✅ ID sets loaded:', {
    customers: existingIds.customers.size,
    agents: existingIds.agents.size,
    users: existingIds.users.size,
    invoices: existingIds.invoices.size,
    payments: existingIds.payments.size,
    submitted_payments: existingIds.submitted_payments.size,
    seda: existingIds.seda.size,
    invoice_items: existingIds.invoice_items.size,
  });

  // Validate each table
  const tablesToCheck = options.tables || [
    'invoice', 
    'payment', 
    'submitted_payment', 
    'seda_registration', 
    'invoice_item', 
    'user'
  ];

  if (tablesToCheck.includes('invoice')) {
    const result = await validateInvoiceRelationships(errors, options, existingIds);
    totalRelationshipsChecked += result.checked;
    totalRelationshipsFixed += result.fixed;
  }

  if (tablesToCheck.includes('payment')) {
    const result = await validatePaymentRelationships(errors, options, existingIds);
    totalRelationshipsChecked += result.checked;
    totalRelationshipsFixed += result.fixed;
  }

  if (tablesToCheck.includes('submitted_payment')) {
    const result = await validateSubmittedPaymentRelationships(errors, options, existingIds);
    totalRelationshipsChecked += result.checked;
    totalRelationshipsFixed += result.fixed;
  }

  if (tablesToCheck.includes('seda_registration')) {
    const result = await validateSedaRelationships(errors, options, existingIds);
    totalRelationshipsChecked += result.checked;
    totalRelationshipsFixed += result.fixed;
  }

  if (tablesToCheck.includes('invoice_item')) {
    const result = await validateInvoiceItemRelationships(errors, options, existingIds);
    totalRelationshipsChecked += result.checked;
    totalRelationshipsFixed += result.fixed;
  }

  if (tablesToCheck.includes('user')) {
    const result = await validateUserRelationships(errors, options, existingIds);
    totalRelationshipsChecked += result.checked;
    totalRelationshipsFixed += result.fixed;
  }

  const endTime = new Date();
  const duration = (endTime.getTime() - startTime.getTime()) / 1000;

  // Count errors by table
  const errorsByTable: Record<string, number> = {};
  for (const error of errors) {
    errorsByTable[error.table] = (errorsByTable[error.table] || 0) + 1;
  }

  const summary = `
Validation Complete!
Duration: ${duration.toFixed(2)}s
Total relationships checked: ${totalRelationshipsChecked}
Total errors found: ${errors.length}
Relationships fixed: ${totalRelationshipsFixed}

Errors by table:
${Object.entries(errorsByTable).map(([table, count]) => `  ${table}: ${count}`).join('\n')}
  `;

  console.log(summary);

  const report: ValidationReport = {
    started_at: startTime,
    completed_at: endTime,
    total_records_checked: totalRecordsChecked,
    total_relationships_checked: totalRelationshipsChecked,
    total_errors: errors.length,
    errors_by_table: errorsByTable,
    errors,
    fixed_relationships: totalRelationshipsFixed,
    summary
  };

  return report;
}
