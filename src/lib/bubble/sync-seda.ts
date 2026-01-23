/**
 * ============================================================================
 * SEDA REGISTRATION SYNC
 * ============================================================================
 *
 * SEDA-only sync operations within a date range.
 * Syncs SEDA registrations without affecting invoices or other data.
 *
 * File: src/lib/bubble/sync-seda.ts
 */

import { db } from "@/lib/db";
import { sedaRegistration } from "@/db/schema";
import { logSyncActivity } from "@/lib/logger";
import { eq } from "drizzle-orm";
import { fetchBubbleRecordsWithConstraints } from "./fetch-helpers";

/**
 * ============================================================================
 * FUNCTION: syncSedaRegistrations
 * ============================================================================
 *
 * INTENT (What & Why):
 * SEDA-only sync within a date range. Use this when only SEDA forms have
 * been updated in Bubble and you don't need to sync invoices or other data.
 *
 * DIFFERENCES FROM FULL SYNC:
 * - Only syncs SEDA registrations table
 * - Does NOT sync invoices, customers, agents, payments
 * - Overwrites local data if Bubble version is newer
 *
 * INPUTS:
 * @param dateFrom - ISO date string (required): Start of sync window
 * @param dateTo - ISO date string (optional): End of sync window. Defaults to present.
 *
 * OUTPUTS:
 * @returns {
 *   success: boolean,
 *   results: {
 *     syncedSedas: number,
 *     skippedSedas: number,
 *     errors: string[]
 *   },
 *   error?: string
 * }
 *
 * EXECUTION ORDER (Step-by-step):
 * 1. Fetch all SEDA registrations from Bubble
 * 2. Filter locally by Modified Date (API limitation)
 * 3. For each SEDA, check if newer than local copy
 * 4. Upsert newer SEDAs to PostgreSQL
 * 5. Return results with synced/skipped counts
 *
 * BUBBLE API LIMITATION WORKAROUND:
 * Bubble API does NOT support constraints on 'Modified Date' system field.
 * Must fetch ALL SEDA registrations and filter locally.
 *
 * EDGE CASES:
 * - No SEDAs in date range → Returns success with count: 0
 * - SEDA not found in Bubble (404) → Logs error, continues
 * - Local copy is newer → Skips (not counted as synced)
 *
 * SIDE EFFECTS:
 * - Writes to seda_registration table only
 * - Calls logSyncActivity() for audit trail
 *
 * DEPENDENCIES:
 * - Requires: fetchBubbleRecordsWithConstraints()
 * - Used by: src/app/sync/actions/seda-sync.ts (runSedaOnlySync)
 */
export async function syncSedaRegistrations(dateFrom: string, dateTo?: string) {
  logSyncActivity(`SEDA Sync: Starting (DateFrom: ${dateFrom}, DateTo: ${dateTo || 'current'})`, 'INFO');

  const results = {
    syncedSedas: 0,
    skippedSedas: 0,
    errors: [] as string[]
  };

  try {
    // Step 1: Fetch SEDA registrations from Bubble
    logSyncActivity(`Step 1: Fetching SEDA registrations from ${dateFrom} to ${dateTo || 'current'}...`, 'INFO');

    // NOTE: Bubble API does NOT support constraints on 'Modified Date' field
    // We must fetch ALL and filter locally
    const fromDate = new Date(dateFrom);
    const toDate = dateTo ? new Date(dateTo) : new Date();

    logSyncActivity(`Fetching all SEDA registrations from Bubble...`, 'INFO');
    const allSedas = await fetchBubbleRecordsWithConstraints('seda_registration', []);
    logSyncActivity(`Fetched ${allSedas.length} total SEDA registrations from Bubble`, 'INFO');

    // Filter locally by Modified Date
    const bubbleSedas = allSedas.filter(seda => {
      const modifiedDate = new Date(seda["Modified Date"]);
      return modifiedDate >= fromDate && modifiedDate <= toDate;
    });

    logSyncActivity(`After filtering by Modified Date: ${bubbleSedas.length} SEDA registrations in range`, 'INFO');

    if (bubbleSedas.length === 0) {
      logSyncActivity(`No SEDA registrations found in the specified date range`, 'INFO');
      return { success: true, results };
    }

    // Step 2: Sync each SEDA registration
    logSyncActivity(`Step 2: Syncing SEDA registrations...`, 'INFO');

    for (const seda of bubbleSedas) {
      try {
        // Check if record exists and compare timestamps
        const existingRecord = await db.query.sedaRegistration.findFirst({
          where: eq(sedaRegistration.bubble_id, seda._id)
        });

        const bubbleModifiedDate = new Date(seda["Modified Date"]);
        const shouldUpdate = !existingRecord ||
          !existingRecord.last_synced_at ||
          bubbleModifiedDate > new Date(existingRecord.last_synced_at);

        if (shouldUpdate) {
          const vals = {
            seda_status: seda["SEDA Status"],
            state: seda.State,
            city: seda.City,
            agent: seda.Agent,
            project_price: seda["Project Price"],
            linked_customer: seda["Linked Customer"],
            customer_signature: seda["Customer Signature"],
            ic_copy_front: seda["IC Copy Front"],
            ic_copy_back: seda["IC Copy Back"],
            tnb_bill_1: seda["TNB Bill 1"],
            tnb_bill_2: seda["TNB Bill 2"],
            tnb_bill_3: seda["TNB Bill 3"],
            nem_cert: seda["NEM Cert"],
            mykad_pdf: seda["Mykad PDF"],
            property_ownership_prove: seda["Property Ownership Prove"],
            check_tnb_bill_and_meter_image: seda["Check TNB Bill and Meter Image"],
            roof_images: seda["Roof Images"],
            site_images: seda["Site Images"],
            drawing_pdf_system: seda["Drawing PDF System"],
            drawing_system_actual: seda["Drawing System Actual"],
            drawing_engineering_seda_pdf: seda["Drawing Engineering Seda PDF"],
            modified_date: bubbleModifiedDate,
            updated_at: bubbleModifiedDate,
            last_synced_at: new Date()
          };

          await db.insert(sedaRegistration).values({ bubble_id: seda._id, ...vals })
            .onConflictDoUpdate({ target: sedaRegistration.bubble_id, set: vals });

          results.syncedSedas++;
          logSyncActivity(`Synced SEDA ${seda._id}`, 'INFO');
        } else {
          results.skippedSedas++;
        }

      } catch (err) {
        results.errors.push(`SEDA ${seda._id}: ${err}`);
        logSyncActivity(`Error syncing SEDA ${seda._id}: ${err}`, 'ERROR');
      }
    }

    logSyncActivity(`SEDA Sync Complete: ${results.syncedSedas} synced, ${results.skippedSedas} skipped`, 'INFO');

    if (results.errors.length > 0) {
      logSyncActivity(`Errors encountered: ${results.errors.length}`, 'ERROR');
      results.errors.slice(0, 5).forEach(e => logSyncActivity(e, 'ERROR'));
    }

    return { success: true, results };
  } catch (error) {
    logSyncActivity(`SEDA Sync Error: ${String(error)}`, 'ERROR');
    return { success: false, error: String(error) };
  }
}
