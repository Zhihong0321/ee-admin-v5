"use server";

import { db } from "@/lib/db";
import { sedaRegistration, users, payments, submitted_payments } from "@/db/schema";
import { eq, isNotNull, and, notLike, or, sql } from "drizzle-orm";
import { downloadBubbleFile, checkStorageHealth } from "@/lib/storage";
import path from "path";

export async function testStorageHealth() {
  return await checkStorageHealth();
}

export type SyncCategory = 'signatures' | 'ic_copies' | 'bills' | 'roof_site_images' | 'payments' | 'user_profiles';

export async function syncFilesByCategory(category: SyncCategory, limit: number = 50) {
  try {
    const results = { success: 0, failed: 0, details: [] as string[] };
    let filesToProcess: any[] = [];
    let tableName = "";
    let idField = "";
    let urlField = "";
    let updateTable: any = null;

    // Define query based on category
    switch (category) {
      case 'signatures':
        filesToProcess = await db.select({
          id: sedaRegistration.id,
          url: sedaRegistration.customer_signature
        })
        .from(sedaRegistration)
        .where(
          and(
            isNotNull(sedaRegistration.customer_signature),
            notLike(sedaRegistration.customer_signature, '/storage/%')
          )
        )
        .limit(limit);
        tableName = "seda_registration";
        idField = "id";
        urlField = "customer_signature";
        updateTable = sedaRegistration;
        break;

      case 'ic_copies':
        filesToProcess = await db.select({
          id: sedaRegistration.id,
          url: sedaRegistration.ic_copy_front
        })
        .from(sedaRegistration)
        .where(
          and(
            isNotNull(sedaRegistration.ic_copy_front),
            notLike(sedaRegistration.ic_copy_front, '/storage/%')
          )
        )
        .limit(limit);
        tableName = "seda_registration";
        idField = "id";
        urlField = "ic_copy_front";
        updateTable = sedaRegistration;
        break;

      case 'bills':
        filesToProcess = await db.select({
          id: sedaRegistration.id,
          url: sedaRegistration.tnb_bill_1
        })
        .from(sedaRegistration)
        .where(
          and(
            isNotNull(sedaRegistration.tnb_bill_1),
            notLike(sedaRegistration.tnb_bill_1, '/storage/%')
          )
        )
        .limit(limit);
        tableName = "seda_registration";
        idField = "id";
        urlField = "tnb_bill_1";
        updateTable = sedaRegistration;
        break;

        case 'roof_site_images':
            // TODO: Handle array fields (roof_images, site_images)
            filesToProcess = []; 
            // This is a bit more complex as it's a JSON array usually, but assuming string URL for now or need to handle array
            // If it's a single URL field in legacy data:
            /*
            filesToProcess = await db.select({
              id: sedaRegistration.id,
              url: sedaRegistration.roof_images // This is an array
            })
            .from(sedaRegistration)
            ...
            */
            break;

      case 'payments':
        // TODO: Handle array fields (attachment)
        filesToProcess = [];
        /*
        // Check both payments and submitted_payments tables
        const paymentsFiles = await db.select({
            id: payments.id,
            url: payments.attachment // Array
          })
          .from(payments)
          .where(
            and(
              isNotNull(payments.attachment),
              // notLike(payments.attachment, '/storage/%') // Cannot use notLike on array
            )
          )
          .limit(limit);
        
        if (paymentsFiles.length > 0) {
            filesToProcess = paymentsFiles;
            tableName = "payments";
            idField = "id";
            urlField = "attachment";
            updateTable = payments;
        } else {
             const subPaymentsFiles = await db.select({
                id: submitted_payments.id,
                url: submitted_payments.attachment // Array
              })
              .from(submitted_payments)
              ...
            filesToProcess = subPaymentsFiles;
            tableName = "submitted_payments";
            idField = "id";
            urlField = "attachment";
            updateTable = submitted_payments;
        }
        */
        break;

      case 'user_profiles':
        filesToProcess = await db.select({
          id: users.id,
          url: users.profile_picture
        })
        .from(users)
        .where(
          and(
            isNotNull(users.profile_picture),
            notLike(users.profile_picture, '/storage/%')
          )
        )
        .limit(limit);
        tableName = "users";
        idField = "id";
        urlField = "profile_picture";
        updateTable = users;
        break;
    }

    if (filesToProcess.length === 0) {
        return { success: true, results: { success: 0, failed: 0, details: ["No files found to process for this category."] } };
    }

    for (const record of filesToProcess) {
        if (!record.url) continue;

        try {
            // 1. Download and Save
            const filename = path.basename(record.url).split('?')[0]; // simple filename extraction
            
            const savedPath = await downloadBubbleFile(record.url, tableName, filename);
            
            if (savedPath) {
                // 2. Update Database
                // /storage/filename.ext
                // savedPath is absolute path? check downloadBubbleFile return
                // downloadBubbleFile returns: return `/api/files/${filename}`; (public url)
                
                await db.update(updateTable)
                    .set({ [urlField]: savedPath })
                    .where(eq(updateTable[idField], record.id));

                results.success++;
                results.details.push(`Migrated [${record.id}]: ${record.url} -> ${savedPath} View: ${savedPath}`);
            } else {
                results.failed++;
                results.details.push(`Failed Download [${record.id}]: ${record.url}`);
            }

        } catch (err) {
            console.error(`Error processing ${record.id}:`, err);
            results.failed++;
            results.details.push(`Error [${record.id}]: ${String(err)}`);
        }
    }

    return { success: true, results };

  } catch (error) {
    console.error("Sync category error:", error);
    return { success: false, error: String(error) };
  }
}
