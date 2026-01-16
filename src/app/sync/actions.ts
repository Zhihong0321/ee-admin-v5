"use server";

import { db } from "@/lib/db";
import { invoices, payments, submitted_payments, agents, users, sedaRegistration, invoice_templates, customers } from "@/db/schema";
import { syncCompleteInvoicePackage, syncInvoicePackageWithRelations } from "@/lib/bubble";
import { revalidatePath } from "next/cache";
import { logSyncActivity, getLatestLogs } from "@/lib/logger";
import { eq, sql, and, or, isNull, isNotNull, inArray } from "drizzle-orm";
import { createProgressSession } from "@/lib/progress-tracker";
import { randomUUID } from "crypto";

export async function runManualSync(dateFrom?: string, dateTo?: string, syncFiles = false, sessionId?: string) {
  logSyncActivity(`Manual Sync Triggered: ${dateFrom || 'All'} to ${dateTo || 'All'}, syncFiles: ${syncFiles}`, 'INFO');

  try {
    const result = await syncCompleteInvoicePackage(dateFrom, dateTo, syncFiles, sessionId);

    if (result.success) {
      logSyncActivity(`Manual Sync SUCCESS: ${result.results?.syncedInvoices} invoices, ${result.results?.syncedCustomers} customers`, 'INFO');
    } else {
      logSyncActivity(`Manual Sync FAILED: ${result.error}`, 'ERROR');
    }

    revalidatePath("/sync");
    revalidatePath("/invoices");
    revalidatePath("/customers");

    return result;
  } catch (error) {
    logSyncActivity(`Manual Sync CRASHED: ${String(error)}`, 'ERROR');
    return { success: false, error: String(error) };
  }
}

export async function deleteDemoInvoices() {
  logSyncActivity(`Starting 'Delete Demo Invoices' job...`, 'INFO');

  try {
    // 1. Identify Demo Invoices (No Linked Customer AND No Linked Payments)
    // Fetch all needed fields to filter in memory (safer for arrays/nulls) or construct complex query
    // We will do a hybrid approach: Get all invoices, filter in code to be 100% sure of logic, then bulk delete.
    // Given ~4000 invoices max, this is fine.
    
    const allInvoices = await db.select({
      id: invoices.id,
      bubble_id: invoices.bubble_id,
      linked_customer: invoices.linked_customer,
      linked_payment: invoices.linked_payment,
      linked_seda_registration: invoices.linked_seda_registration
    }).from(invoices);

    const demoInvoices = allInvoices.filter(inv => {
      const noCustomer = !inv.linked_customer || inv.linked_customer.trim() === '';
      const payments = inv.linked_payment as string[] | null;
      const noPayments = !payments || payments.length === 0;
      return noCustomer && noPayments;
    });

    if (demoInvoices.length === 0) {
      logSyncActivity(`No Demo Invoices found.`, 'INFO');
      return { success: true, count: 0, message: "No demo invoices found." };
    }

    const demoInvoiceIds = demoInvoices.map(i => i.id);
    const demoInvoiceBubbleIds = demoInvoices.map(i => i.bubble_id).filter(Boolean) as string[];
    
    // 2. Identify Linked SEDA Registrations to delete
    const sedaIdsToDelete: string[] = [];
    for (const inv of demoInvoices) {
      if (inv.linked_seda_registration) {
        sedaIdsToDelete.push(inv.linked_seda_registration);
      }
    }

    logSyncActivity(`Found ${demoInvoiceIds.length} demo invoices. ${sedaIdsToDelete.length} linked SEDA registrations will also be marked as deleted.`, 'INFO');

    // 3. Perform Soft Deletion (Update Status)
    // A. Update SEDA Registrations status to 'Deleted'
    let sedaUpdatedCount = 0;
    if (sedaIdsToDelete.length > 0) {
      await db.update(sedaRegistration)
        .set({ reg_status: 'Deleted', updated_at: new Date() })
        .where(inArray(sedaRegistration.bubble_id, sedaIdsToDelete));
      sedaUpdatedCount = sedaIdsToDelete.length;
      logSyncActivity(`Marked ${sedaUpdatedCount} SEDA registrations as 'Deleted'.`, 'INFO');
    }

    // B. Update Invoices status to 'deleted'
    await db.update(invoices)
      .set({ status: 'deleted', updated_at: new Date() })
      .where(inArray(invoices.id, demoInvoiceIds));
    
    logSyncActivity(`Marked ${demoInvoiceIds.length} Demo Invoices as 'deleted'.`, 'INFO');

    revalidatePath("/sync");
    revalidatePath("/invoices");

        return {

          success: true,

          updatedInvoices: demoInvoiceIds.length,

          updatedSeda: sedaUpdatedCount,

          message: `Successfully marked ${demoInvoiceIds.length} demo invoices and ${sedaUpdatedCount} associated SEDA registrations as deleted.`

        };

      } catch (error) {

        logSyncActivity(`Delete Demo Invoices Job CRASHED: ${String(error)}`, 'ERROR');

        return { success: false, error: String(error) };

      }

    }

    

export async function fixMissingInvoiceDates() {
  logSyncActivity(`Starting 'Fix Missing Invoice Dates' job (via Full Resync)...`, 'INFO');

  try {
    // We cannot simply backfill from local created_at because it might be the sync time.
    // The only safe way is to re-sync the invoices from Bubble with the corrected mapping.
    // We'll trigger a full sync without file downloads to be faster.
    
    logSyncActivity(`Triggering full data sync to fetch correct Invoice Dates from Bubble...`, 'INFO');
    
    // Pass undefined for dates to sync ALL history. syncFiles=false for speed.
    const result = await syncCompleteInvoicePackage(undefined, undefined, false);

    revalidatePath("/sync");
    revalidatePath("/invoices");

    if (result.success) {
      return {
        success: true,
        fixed: result.results?.syncedInvoices,
        message: `Sync Complete. Processed ${result.results?.syncedInvoices} invoices. Invoice Dates should now be corrected.`
      };
    } else {
       return { success: false, error: result.error };
    }

  } catch (error) {
    logSyncActivity(`Fix Invoice Dates Job CRASHED: ${String(error)}`, 'ERROR');
    return { success: false, error: String(error) };
  }
}

    

    export async function patchInvoiceCreators() {
  logSyncActivity(`Starting 'Patch Invoice Creators' job...`, 'INFO');
  
  try {
    // 1. Get stats before we start
    const allNullCreatedBy = await db.select().from(invoices).where(isNull(invoices.created_by));
    const totalNulls = allNullCreatedBy.length;
    
    if (totalNulls === 0) {
      logSyncActivity(`No invoices found with created_by = NULL.`, 'INFO');
      return { success: true, fixed: 0, unfixable: 0, total_nulls: 0, message: "No invoices need patching." };
    }

    logSyncActivity(`Found ${totalNulls} invoices with created_by = NULL. Analyzing...`, 'INFO');

    let fixedCount = 0;
    let unfixableCount = 0; // linked_agent is null
    let agentNoUserCount = 0; // linked_agent exists but no user found

    // 2. Find invoices that CAN be fixed (have linked_agent)
    const fixableInvoices = await db.select({
      id: invoices.id,
      bubble_id: invoices.bubble_id,
      linked_agent: invoices.linked_agent,
    })
    .from(invoices)
    .where(and(isNull(invoices.created_by), isNotNull(invoices.linked_agent)));

    // 3. Process fixable invoices
    for (const inv of fixableInvoices) {
      if (!inv.linked_agent) continue;

      // Find the agent
      const agent = await db.query.agents.findFirst({
        where: eq(agents.bubble_id, inv.linked_agent)
      });

      if (agent && agent.bubble_id) {
        // Find the user linked to this agent
        // User table has `linked_agent_profile` which points to agent.bubble_id
        const user = await db.query.users.findFirst({
          where: eq(users.linked_agent_profile, agent.bubble_id)
        });

        if (user && user.bubble_id) {
          // UPDATE the invoice
          await db.update(invoices)
            .set({ created_by: user.bubble_id })
            .where(eq(invoices.id, inv.id));
          
          fixedCount++;
          logSyncActivity(`Fixed Invoice ${inv.bubble_id}: Set created_by = ${user.bubble_id} (Agent: ${agent.name})`, 'INFO');
        } else {
          agentNoUserCount++;
          logSyncActivity(`WARNING: Skipped Invoice ${inv.bubble_id}: Agent ${agent.name} has no linked User account.`, 'ERROR');
        }
      } else {
        // Agent ID exists in invoice but not in Agent table?!
         logSyncActivity(`WARNING: Skipped Invoice ${inv.bubble_id}: Linked Agent ID ${inv.linked_agent} not found in DB.`, 'ERROR');
         agentNoUserCount++;
      }
    }

    // 4. Count truly unfixable (no linked_agent)
    const orphanedInvoices = await db.select({ count: sql<number>`count(*)` })
      .from(invoices)
      .where(and(isNull(invoices.created_by), isNull(invoices.linked_agent)));
    
    unfixableCount = Number(orphanedInvoices[0].count);

    logSyncActivity(`Patch Job Complete. Fixed: ${fixedCount}. Unfixable (No Agent): ${unfixableCount}. Agent w/o User: ${agentNoUserCount}.`, 'INFO');
    
    revalidatePath("/sync");
    revalidatePath("/invoices");

    return {
      success: true,
      fixed: fixedCount,
      unfixable: unfixableCount,
      agent_no_user: agentNoUserCount,
      total_nulls: totalNulls,
      message: `Fixed ${fixedCount} invoices. ${unfixableCount} have no agent. ${agentNoUserCount} have agent but no user.`
    };

  } catch (error) {
    logSyncActivity(`Patch Job CRASHED: ${String(error)}`, 'ERROR');
    return { success: false, error: String(error) };
  }
}

export async function runIncrementalSync() {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  return await runManualSync(yesterday, undefined, true);
}

export async function fetchSyncLogs() {
  return getLatestLogs(100);
}

/**
 * Start a manual sync with progress tracking
 * Returns a sessionId that can be used to track progress via SSE
 */
export async function startManualSyncWithProgress(dateFrom?: string, dateTo?: string, syncFiles = false) {
  const sessionId = randomUUID();
  createProgressSession(sessionId);

  // Run sync in background
  runManualSync(dateFrom, dateTo, syncFiles, sessionId).catch((error) => {
    logSyncActivity(`Background Sync Error: ${String(error)}`, 'ERROR');
  });

  return { success: true, sessionId };
}

export async function updateInvoicePaymentPercentages() {
  logSyncActivity(`Starting update of invoice payment percentages...`, 'INFO');

  try {
    const allInvoices = await db.select({
      id: invoices.id,
      bubble_id: invoices.bubble_id,
      total_amount: invoices.total_amount,
      linked_payment: invoices.linked_payment,
    })
    .from(invoices)
    .where(sql`${invoices.total_amount} IS NOT NULL AND ${invoices.total_amount} > 0`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const invoice of allInvoices) {
      if (!invoice.linked_payment || invoice.linked_payment.length === 0) {
        skippedCount++;
        continue;
      }

      const totalAmount = parseFloat(invoice.total_amount || '0');
      if (totalAmount <= 0) {
        skippedCount++;
        continue;
      }

      let totalPaid = 0;

      for (const paymentBubbleId of invoice.linked_payment) {
        const payment = await db.query.payments.findFirst({
          where: eq(payments.bubble_id, paymentBubbleId),
        });

        const submittedPayment = await db.query.submitted_payments.findFirst({
          where: eq(submitted_payments.bubble_id, paymentBubbleId),
        });

        if (payment && payment.amount) {
          totalPaid += parseFloat(payment.amount);
        } else if (submittedPayment && submittedPayment.amount) {
          totalPaid += parseFloat(submittedPayment.amount);
        }
      }

      const percentage = (totalPaid / totalAmount) * 100;

      await db.execute(sql`
        UPDATE invoice
        SET percent_of_total_amount = ${percentage}, updated_at = NOW()
        WHERE id = ${invoice.id}
      `);

      updatedCount++;
      logSyncActivity(`Updated invoice ${invoice.bubble_id}: ${percentage.toFixed(2)}% paid (${totalPaid}/${totalAmount})`, 'INFO');
    }

    logSyncActivity(`Payment percentage update complete: ${updatedCount} updated, ${skippedCount} skipped`, 'INFO');

    revalidatePath("/invoices");

    return {
      success: true,
      updated: updatedCount,
      skipped: skippedCount,
      message: `Updated ${updatedCount} invoices, skipped ${skippedCount} invoices without payments.`
    };
  } catch (error) {
    logSyncActivity(`Payment percentage update CRASHED: ${String(error)}`, 'ERROR');
    return { success: false, error: String(error) };
  }
}

/**
 * Update Invoice Statuses based on Payment and SEDA status
 *
 * Logic:
 * 1. No payment AND no SEDA form → 'draft'
 * 2. Payment percent < 50% → 'DEPOSIT'
 * 3. SEDA form status = 'APPROVED' → 'SEDA APPROVED'
 * 4. Payment is full (100%) → 'FULLY PAID'
 */
export async function updateInvoiceStatuses() {
  logSyncActivity(`Starting 'Update Invoice Statuses' job...`, 'INFO');

  try {
    // Get all invoices that are not deleted
    const allInvoices = await db.select({
      id: invoices.id,
      bubble_id: invoices.bubble_id,
      total_amount: invoices.total_amount,
      linked_payment: invoices.linked_payment,
      linked_seda_registration: invoices.linked_seda_registration,
      current_status: invoices.status,
    })
    .from(invoices)
    .where(sql`${invoices.status} != 'deleted'`);

    logSyncActivity(`Processing ${allInvoices.length} invoices...`, 'INFO');

    let updatedCount = 0;
    const statusChanges = {
      draft: 0,
      deposit: 0,
      seda_approved: 0,
      fully_paid: 0,
      other: 0
    };

    for (const invoice of allInvoices) {
      // Calculate total paid
      let totalPaid = 0;
      if (invoice.linked_payment && invoice.linked_payment.length > 0) {
        for (const paymentBubbleId of invoice.linked_payment) {
          const payment = await db.query.payments.findFirst({
            where: eq(payments.bubble_id, paymentBubbleId),
          });

          const submittedPayment = await db.query.submitted_payments.findFirst({
            where: eq(submitted_payments.bubble_id, paymentBubbleId),
          });

          if (payment && payment.amount) {
            totalPaid += parseFloat(payment.amount || '0');
          } else if (submittedPayment && submittedPayment.amount) {
            totalPaid += parseFloat(submittedPayment.amount || '0');
          }
        }
      }

      // Get SEDA registration status
      let sedaStatus = null;
      if (invoice.linked_seda_registration) {
        const seda = await db.query.sedaRegistration.findFirst({
          where: eq(sedaRegistration.bubble_id, invoice.linked_seda_registration),
        });
        sedaStatus = seda?.reg_status;
      }

      // Determine new status based on business logic
      let newStatus = invoice.current_status;
      const totalAmount = parseFloat(invoice.total_amount || '0');
      const paymentPercent = totalAmount > 0 ? (totalPaid / totalAmount) * 100 : 0;

      // Priority 1: SEDA APPROVED (if SEDA is approved)
      if (sedaStatus && (sedaStatus.toUpperCase() === 'APPROVED' || sedaStatus.toUpperCase() === 'Approved')) {
        newStatus = 'SEDA APPROVED';
      }
      // Priority 2: FULLY PAID (100% payment)
      else if (paymentPercent >= 99.9) {
        newStatus = 'FULLY PAID';
      }
      // Priority 3: DEPOSIT (< 50% payment)
      else if (paymentPercent > 0 && paymentPercent < 50) {
        newStatus = 'DEPOSIT';
      }
      // Priority 4: DRAFT (no payment and no SEDA)
      else if (paymentPercent === 0 && !sedaStatus) {
        newStatus = 'draft';
      }

      // Update if status changed
      if (newStatus !== invoice.current_status) {
        await db.update(invoices)
          .set({ status: newStatus, updated_at: new Date() })
          .where(eq(invoices.id, invoice.id));

        updatedCount++;
        logSyncActivity(`Invoice ${invoice.bubble_id}: '${invoice.current_status}' → '${newStatus}' (${paymentPercent.toFixed(1)}% paid, SEDA: ${sedaStatus || 'none'})`, 'INFO');

        // Track counts
        switch (newStatus) {
          case 'draft':
            statusChanges.draft++;
            break;
          case 'DEPOSIT':
            statusChanges.deposit++;
            break;
          case 'SEDA APPROVED':
            statusChanges.seda_approved++;
            break;
          case 'FULLY PAID':
            statusChanges.fully_paid++;
            break;
          default:
            statusChanges.other++;
        }
      }
    }

    logSyncActivity(`Invoice status update complete: ${updatedCount} updated`, 'INFO');

    revalidatePath("/sync");
    revalidatePath("/invoices");

    return {
      success: true,
      updated: updatedCount,
      processed: allInvoices.length,
      changes: statusChanges,
      message: `Updated ${updatedCount} invoice statuses.\n
      • Draft: ${statusChanges.draft}
      • Deposit: ${statusChanges.deposit}
      • SEDA Approved: ${statusChanges.seda_approved}
      • Fully Paid: ${statusChanges.fully_paid}`
    };
  } catch (error) {
    logSyncActivity(`Invoice Status Update CRASHED: ${String(error)}`, 'ERROR');
    return { success: false, error: String(error) };
  }
}

/**
 * Restore Invoice-SEDA Links
 *
 * Scans SEDA registrations for linked_invoice array and updates
 * invoice.linked_seda_registration to restore the missing links.
 *
 * This fixes the issue where sync didn't populate invoice.linked_seda_registration
 */
export async function restoreInvoiceSedaLinks() {
  logSyncActivity(`Starting 'Restore Invoice-SEDA Links' job...`, 'INFO');

  try {
    // Get all SEDA registrations with linked_invoice array
    const sedaRegistrations = await db.select({
      seda_bubble_id: sedaRegistration.bubble_id,
      linked_invoices: sedaRegistration.linked_invoice,
      reg_status: sedaRegistration.reg_status,
    })
    .from(sedaRegistration)
    .where(
      and(
        isNotNull(sedaRegistration.linked_invoice),
        sql`array_length(${sedaRegistration.linked_invoice}, 1) > 0`,
        sql`${sedaRegistration.reg_status} != 'Deleted'`
      )
    );

    logSyncActivity(`Found ${sedaRegistrations.length} SEDA registrations with linked invoices`, 'INFO');

    let linkedCount = 0;
    let skippedCount = 0;
    let notFoundCount = 0;

    for (const seda of sedaRegistrations) {
      if (!seda.linked_invoices || seda.linked_invoices.length === 0) {
        skippedCount++;
        continue;
      }

      // Process each invoice in the linked_invoice array
      for (const invoiceBubbleId of seda.linked_invoices) {
        try {
          // Find the invoice
          const invoice = await db.query.invoices.findFirst({
            where: eq(invoices.bubble_id, invoiceBubbleId as string),
          });

          if (!invoice) {
            logSyncActivity(`SEDA ${seda.seda_bubble_id}: Invoice ${invoiceBubbleId} not found`, 'ERROR');
            notFoundCount++;
            continue;
          }

          // Skip if already linked
          if (invoice.linked_seda_registration) {
            if (invoice.linked_seda_registration !== seda.seda_bubble_id) {
              logSyncActivity(`Invoice ${invoiceBubbleId}: Already linked to different SEDA (${invoice.linked_seda_registration}), skipping`, 'ERROR');
            } else {
              skippedCount++;
            }
            continue;
          }

          // Update the invoice with SEDA link
          await db.update(invoices)
            .set({ linked_seda_registration: seda.seda_bubble_id, updated_at: new Date() })
            .where(eq(invoices.id, invoice.id));

          linkedCount++;
          logSyncActivity(`Invoice ${invoiceBubbleId}: Linked to SEDA ${seda.seda_bubble_id} (${seda.reg_status})`, 'INFO');

        } catch (error) {
          logSyncActivity(`Error linking invoice ${invoiceBubbleId}: ${String(error)}`, 'ERROR');
        }
      }
    }

    logSyncActivity(`Invoice-SEDA link restoration complete: ${linkedCount} linked, ${skippedCount} skipped, ${notFoundCount} not found`, 'INFO');

    revalidatePath("/sync");
    revalidatePath("/invoices");

    return {
      success: true,
      linked: linkedCount,
      skipped: skippedCount,
      notFound: notFoundCount,
      total: sedaRegistrations.length,
      message: `Successfully linked ${linkedCount} invoices to their SEDA registrations.\n
      • Linked: ${linkedCount}
      • Skipped: ${skippedCount}
      • Not Found: ${notFoundCount}`
    };
  } catch (error) {
    logSyncActivity(`Restore SEDA Links CRASHED: ${String(error)}`, 'ERROR');
    return { success: false, error: String(error) };
  }
}

/**
 * Full Invoice Sync with Date Range
 *
 * This is a NEW sync method that:
 * 1. Syncs invoices within a specified date range (from -> to)
 * 2. For each invoice, syncs ALL its relational data (customer, agent, payments, SEDA, items)
 * 3. Does NOT download files (user will handle file migration separately)
 *
 * Key differences from syncCompleteInvoicePackage:
 * - Filters by invoice date range (dateFrom to dateTo)
 * - Directly queries related tables by Bubble ID for each invoice
 * - Ensures all relational data is synced for the filtered invoices
 * - Skips file downloads entirely
 */
export async function runFullInvoiceSync(dateFrom: string, dateTo?: string, sessionId?: string) {
  logSyncActivity(`Full Invoice Sync: ${dateFrom} to ${dateTo || 'current'}`, 'INFO');

  try {
    const result = await syncInvoicePackageWithRelations(dateFrom, dateTo, sessionId);

    if (result.success) {
      logSyncActivity(`Full Invoice Sync SUCCESS: ${result.results?.syncedInvoices} invoices with all relations`, 'INFO');
    } else {
      logSyncActivity(`Full Invoice Sync FAILED: ${result.error}`, 'ERROR');
    }

    revalidatePath("/sync");
    revalidatePath("/invoices");
    revalidatePath("/customers");

    return result;
  } catch (error) {
    logSyncActivity(`Full Invoice Sync CRASHED: ${String(error)}`, 'ERROR');
    return { success: false, error: String(error) };
  }
}

/**
 * Patch File URLs to Absolute URLs
 *
 * Converts all relative /storage/ URLs to absolute https://admin.atap.solar/storage/ URLs
 * This fixes the issue where other apps on different subdomains cannot access files
 */
export async function patchFileUrlsToAbsolute() {
  logSyncActivity(`Starting 'Patch File URLs to Absolute' job...`, 'INFO');

  const BASE_URL = 'https://admin.atap.solar';

  try {
    let totalUpdated = 0;
    const updates: string[] = [];

    // ============================================================================
    // Define all file fields across all tables
    // ============================================================================
    const fileFieldsConfig = [
      // SEDA Registration - Multiple file fields
      {
        table: sedaRegistration,
        tableName: 'seda_registration',
        idField: 'id',
        fields: [
          'customer_signature',
          'ic_copy_front',
          'ic_copy_back',
          'tnb_bill_1',
          'tnb_bill_2',
          'tnb_bill_3',
          'nem_cert',
          'mykad_pdf',
          'property_ownership_prove',
          'check_tnb_bill_and_meter_image',
          'roof_images',
          'site_images',
          'drawing_pdf_system',
          'drawing_system_actual',
          'drawing_engineering_seda_pdf',
        ]
      },
      // Users - Profile pictures
      {
        table: users,
        tableName: 'user',
        idField: 'id',
        fields: ['profile_picture']
      },
      // Payments - Attachments (array)
      {
        table: payments,
        tableName: 'payment',
        idField: 'id',
        fields: ['attachment']
      },
      // Submitted Payments - Attachments (array)
      {
        table: submitted_payments,
        tableName: 'submitted_payment',
        idField: 'id',
        fields: ['attachment']
      },
      // Invoice Templates - Logos
      {
        table: invoice_templates,
        tableName: 'invoice_template',
        idField: 'id',
        fields: ['logo_url']
      },
    ];

    // ============================================================================
    // Process each table and field
    // ============================================================================
    for (const config of fileFieldsConfig) {
      logSyncActivity(`Scanning ${config.tableName}...`, 'INFO');

      for (const fieldName of config.fields) {
        try {
          // Check if field is array or single by looking at a sample record
          const sample = await db
            .select({ [fieldName]: (config.table as any)[fieldName] })
            .from(config.table)
            .limit(1);

          if (sample.length === 0) continue;

          const isArray = Array.isArray(sample[0][fieldName]);

          if (isArray) {
            // Array field - need to process in memory
            const records = await db
              .select({
                id: (config.table as any)[config.idField],
                urls: (config.table as any)[fieldName]
              })
              .from(config.table)
              .where(isNotNull((config.table as any)[fieldName]));

            for (const record of records) {
              if (Array.isArray(record.urls)) {
                const updatedUrls = record.urls.map((url: string) => {
                  if (url && url.startsWith('/storage/') && !url.startsWith(BASE_URL)) {
                    return `${BASE_URL}${url}`;
                  }
                  return url;
                });

                // Check if any URL changed
                const hasChanges = updatedUrls.some((newUrl, idx) => newUrl !== record.urls[idx]);

                if (hasChanges) {
                  await db
                    .update(config.table)
                    .set({ [fieldName]: updatedUrls })
                    .where(eq((config.table as any)[config.idField], record.id));
                  totalUpdated++;
                  logSyncActivity(`Updated ${config.tableName}.${fieldName} (ID: ${record.id})`, 'INFO');
                }
              }
            }
          } else {
            // Single field - can update directly with SQL
            const result = await db.execute(sql`
              UPDATE ${sql.identifier(config.tableName)}
              SET ${sql.identifier(fieldName)} = CONCAT('${BASE_URL}', ${sql.identifier(fieldName)})
              WHERE ${sql.identifier(fieldName)} LIKE '/storage/%'
              AND ${sql.identifier(fieldName)} NOT LIKE '${BASE_URL}/%'
            `);

            const updatedCount = Number(result.rowCount || 0);
            if (updatedCount > 0) {
              totalUpdated += updatedCount;
              updates.push(`${config.tableName}.${fieldName}: ${updatedCount} records`);
              logSyncActivity(`Updated ${updatedCount} records in ${config.tableName}.${fieldName}`, 'INFO');
            }
          }
        } catch (error) {
          logSyncActivity(`Error patching ${config.tableName}.${fieldName}: ${String(error)}`, 'ERROR');
        }
      }
    }

    logSyncActivity(`Patch complete: ${totalUpdated} URL(s) updated`, 'INFO');

    revalidatePath("/sync");
    revalidatePath("/invoices");
    revalidatePath("/customers");

    return {
      success: true,
      totalUpdated,
      updates,
      message: `Successfully patched ${totalUpdated} file URL(s) to absolute URLs.\n\nUpdated:\n${updates.join('\n')}`
    };

  } catch (error) {
    logSyncActivity(`Patch File URLs CRASHED: ${String(error)}`, 'ERROR');
    return { success: false, error: String(error) };
  }
}
