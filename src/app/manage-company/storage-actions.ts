import { db } from "@/lib/db";
import { sedaRegistration, users, payments, submitted_payments } from "@/db/schema";
import { eq, isNotNull, and, notLike, or, sql } from "drizzle-orm";
import { downloadBubbleFile, checkStorageHealth } from "@/lib/storage";
import path from "path";

export async function testStorageHealth() {
  return await checkStorageHealth();
}

export type SyncCategory = 'signatures' | 'ic_copies' | 'bills' | 'roof_site_images' | 'user_profiles' | 'payments';

/**
 * Main sync engine for all Bubble files
 */
export async function syncFilesByCategory(category: SyncCategory, limit = 50) {
  console.log(`Starting sync for category: ${category} (limit: ${limit})`);
  
  const results = {
    success: 0,
    failed: 0,
    remaining: 0,
    details: [] as string[]
  };

  try {
    switch (category) {
      case 'signatures':
        await syncSingleColumn(sedaRegistration, 'customer_signature', 'signatures', limit, results);
        break;
      
      case 'ic_copies':
        await syncSingleColumn(sedaRegistration, 'ic_copy_front', 'ic_copies', limit, results);
        await syncSingleColumn(sedaRegistration, 'ic_copy_back', 'ic_copies', limit, results);
        await syncSingleColumn(sedaRegistration, 'mykad_pdf', 'ic_copies', limit, results);
        await syncSingleColumn(sedaRegistration, 'nem_cert', 'ic_copies', limit, results);
        await syncSingleColumn(sedaRegistration, 'property_ownership_prove', 'ic_copies', limit, results);
        break;

      case 'bills':
        await syncSingleColumn(sedaRegistration, 'tnb_bill_1', 'bills', limit, results);
        await syncSingleColumn(sedaRegistration, 'tnb_bill_2', 'bills', limit, results);
        await syncSingleColumn(sedaRegistration, 'tnb_bill_3', 'bills', limit, results);
        await syncSingleColumn(sedaRegistration, 'tnb_meter', 'bills', limit, results);
        break;

      case 'user_profiles':
        await syncSingleColumn(users, 'profile_picture', 'profiles', limit, results);
        break;

      case 'roof_site_images':
        await syncArrayColumn(sedaRegistration, 'roof_images', 'roofs', limit, results);
        await syncArrayColumn(sedaRegistration, 'site_images', 'sites', limit, results);
        await syncArrayColumn(sedaRegistration, 'drawing_pdf_system', 'drawings', limit, results);
        await syncArrayColumn(sedaRegistration, 'drawing_system_actual', 'drawings', limit, results);
        await syncArrayColumn(sedaRegistration, 'drawing_engineering_seda_pdf', 'drawings', limit, results);
        break;

      case 'payments':
        await syncArrayColumn(payments, 'attachment', 'payments', limit, results);
        await syncArrayColumn(submitted_payments, 'attachment', 'payments', limit, results);
        break;
    }

    return { success: true, results };
  } catch (error) {
    console.error(`Sync failed for ${category}:`, error);
    return { success: false, error: String(error) };
  }
}

/**
 * Logic for columns with a single URL
 */
async function syncSingleColumn(table: any, column: string, folder: string, limit: number, results: any) {
  const records = await db.select({
    id: table.id,
    bubble_id: table.bubble_id,
    url: table[column]
  })
  .from(table)
  .where(
    and(
      isNotNull(table[column]),
      notLike(table[column], '/storage/%'),
      or(
        sql`${table[column]} LIKE '//%'`,
        sql`${table[column]} LIKE 'http%'`
      )
    )
  )
  .limit(limit);

  for (const record of records) {
    const ext = path.extname(record.url.split('?')[0]) || '.png';
    const filename = `${record.bubble_id}_${column}${ext}`;
    const localPath = await downloadBubbleFile(record.url, folder, filename);

    if (localPath) {
      await db.update(table).set({ [column]: localPath }).where(eq(table.id, record.id));
      results.success++;
    } else {
      results.failed++;
    }
  }
}

/**
 * Logic for columns with an ARRAY of URLs
 */
async function syncArrayColumn(table: any, column: string, folder: string, limit: number, results: any) {
  const records = await db.select({
    id: table.id,
    bubble_id: table.bubble_id,
    urls: table[column]
  })
  .from(table)
  .where(isNotNull(table[column]))
  .limit(limit);

  for (const record of records) {
    const urls = record.urls as string[];
    const newPaths: string[] = [];
    let recordChanged = false;

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      if (url && (url.startsWith('//') || url.startsWith('http'))) {
        const ext = path.extname(url.split('?')[0]) || '.png';
        const filename = `${record.bubble_id}_${column}_${i}${ext}`;
        const localPath = await downloadBubbleFile(url, folder, filename);
        
        if (localPath) {
          newPaths.push(localPath);
          recordChanged = true;
          results.success++;
        } else {
          newPaths.push(url); // Keep original if failed
          results.failed++;
        }
      } else {
        newPaths.push(url);
      }
    }

    if (recordChanged) {
      await db.update(table).set({ [column]: newPaths }).where(eq(table.id, record.id));
    }
  }
}

