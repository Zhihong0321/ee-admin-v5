"use server";

import { db } from "@/lib/db";
import { sedaRegistration } from "@/db/schema";
import { eq, isNotNull, and, notLike } from "drizzle-orm";
import { downloadBubbleFile, checkStorageHealth } from "@/lib/storage";
import path from "path";

export async function testStorageHealth() {
  return await checkStorageHealth();
}

/**
 * Test function to sync up to 10 customer signatures from SEDA registrations
 */
export async function syncTestSignatures(limit = 10) {
  console.log(`Starting test sync of ${limit} signatures...`);
  
  try {
    // Find SEDA registrations that have a signature URL but haven't been downloaded yet
    // (Assuming downloaded ones start with /storage)
    const records = await db.select({
      id: sedaRegistration.id,
      bubble_id: sedaRegistration.bubble_id,
      customer_signature: sedaRegistration.customer_signature
    })
    .from(sedaRegistration)
    .where(
      and(
        isNotNull(sedaRegistration.customer_signature),
        notLike(sedaRegistration.customer_signature, '/storage/%')
      )
    )
    .limit(limit);

    console.log(`Found ${records.length} records to sync.`);
    
    const results = {
      total: records.length,
      success: 0,
      failed: 0,
      details: [] as string[]
    };

    for (const record of records) {
      if (!record.customer_signature) continue;

      // Create a unique filename
      const extension = path.extname(record.customer_signature.split('?')[0]) || '.png';
      const filename = `${record.bubble_id}${extension}`;

      const localPath = await downloadBubbleFile(
        record.customer_signature,
        'signatures',
        filename
      );

      if (localPath) {
        // Update database with new local path
        await db.update(sedaRegistration)
          .set({ customer_signature: localPath })
          .where(eq(sedaRegistration.id, record.id));
        
        // Verify update by fetching it back
        const updatedRecord = await db.select({ sig: sedaRegistration.customer_signature })
          .from(sedaRegistration)
          .where(eq(sedaRegistration.id, record.id))
          .limit(1);

        const webUrl = `/api/files/signatures/${filename}`;
        
        results.success++;
        results.details.push(`Record ${record.id} UPDATED! DB now contains: ${updatedRecord[0].sig}. View: ${webUrl}`);
      } else {
        results.failed++;
        results.details.push(`Failed: ${record.id}`);
      }
    }

    return { success: true, results };
  } catch (error) {
    console.error("Sync test failed:", error);
    return { success: false, error: String(error) };
  }
}
