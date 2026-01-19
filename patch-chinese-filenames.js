/**
 * Patch Chinese Filenames
 *
 * This script fixes files with non-ASCII characters (like Chinese) in their filenames.
 * It:
 * 1. Scans all file URLs in the database for non-ASCII characters
 * 2. Renames files on disk to use URL-encoded filenames
 * 3. Updates database URLs to use the new filenames
 *
 * Usage: node patch-chinese-filenames.js
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const STORAGE_ROOT = '/storage';
const FILE_BASE_URL = process.env.FILE_BASE_URL || 'https://admin.atap.solar';

// Database connection
const db = new Client({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Check if a string contains non-ASCII characters
 */
function hasNonASCII(str) {
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) > 127) {
      return true;
    }
  }
  return false;
}

/**
 * Sanitize filename by URL-encoding non-ASCII characters
 */
function sanitizeFilename(filename) {
  const ext = path.extname(filename).split('?')[0];
  const baseName = path.basename(filename, ext).split('?')[0];

  let sanitizedBaseName = '';
  for (let i = 0; i < baseName.length; i++) {
    const char = baseName[i];
    const code = char.charCodeAt(0);

    // Allow: a-z, A-Z, 0-9, space, hyphen, underscore, dot
    if (
      (code >= 48 && code <= 57) ||  // 0-9
      (code >= 65 && code <= 90) ||  // A-Z
      (code >= 97 && code <= 122) || // a-z
      code === 32 || code === 45 || code === 46 || code === 95  // space, -, ., _
    ) {
      sanitizedBaseName += char;
    } else {
      // URL-encode non-ASCII characters
      sanitizedBaseName += encodeURIComponent(char);
    }
  }

  return sanitizedBaseName + ext;
}

/**
 * Extract filename from a file URL
 */
function getFilenameFromUrl(url) {
  if (!url) return null;

  // Remove base URL and /api/files prefix
  let relativePath = url.replace(FILE_BASE_URL, '');
  if (relativePath.startsWith('/api/files/')) {
    relativePath = relativePath.replace('/api/files/', '');
  } else if (relativePath.startsWith('/storage/')) {
    relativePath = relativePath.replace('/storage/', '');
  }

  return path.basename(relativePath);
}

/**
 * Process a single table and field
 */
async function processTableField(tableName, tableIdField, fieldName, fieldType) {
  console.log(`\nProcessing ${tableName}.${fieldName}...`);

  // Get all records with file URLs
  const selectQuery = fieldType === 'array'
    ? `SELECT ${tableIdField}, ${fieldName} FROM ${tableName} WHERE ${fieldName} IS NOT NULL AND array_length(${fieldName}, 1) > 0`
    : `SELECT ${tableIdField}, ${fieldName} FROM ${tableName} WHERE ${fieldName} IS NOT NULL`;

  const { rows } = await db.query(selectQuery);

  let patchedCount = 0;
  let skippedCount = 0;

  for (const row of rows) {
    const recordId = row[tableIdField];
    let urls = fieldType === 'array' ? row[fieldName] : [row[fieldName]];

    let hasChanges = false;
    const newUrls = [];

    for (const url of urls) {
      const filename = getFilenameFromUrl(url);

      if (!filename) {
        newUrls.push(url);
        continue;
      }

      // Check if filename has non-ASCII characters
      if (!hasNonASCII(filename)) {
        newUrls.push(url);
        skippedCount++;
        continue;
      }

      console.log(`  Found non-ASCII filename: ${filename}`);

      // Get the full file path
      let relativePath = url.replace(FILE_BASE_URL, '');
      if (relativePath.startsWith('/api/files/')) {
        relativePath = relativePath.replace('/api/files/', '');
      } else if (relativePath.startsWith('/storage/')) {
        relativePath = relativePath.replace('/storage/', '');
      }

      const oldPath = path.join(STORAGE_ROOT, relativePath);
      const dir = path.dirname(oldPath);

      // Generate new sanitized filename
      const sanitizedFilename = sanitizeFilename(filename);
      const newPath = path.join(dir, sanitizedFilename);

      // Rename file on disk if it exists
      if (fs.existsSync(oldPath)) {
        try {
          fs.renameSync(oldPath, newPath);
          console.log(`  ✓ Renamed: ${filename} → ${sanitizedFilename}`);
        } catch (err) {
          console.log(`  ✗ Failed to rename: ${err.message}`);
          newUrls.push(url);
          continue;
        }
      } else {
        console.log(`  ⚠ File not found on disk: ${oldPath}`);
      }

      // Generate new URL
      const newRelativePath = relativePath.replace(filename, sanitizedFilename);
      const newUrl = `${FILE_BASE_URL}/api/files/${newRelativePath}`;
      newUrls.push(newUrl);
      hasChanges = true;
      patchedCount++;
    }

    // Update database if changes were made
    if (hasChanges) {
      const updateValue = fieldType === 'array' ? `ARRAY[${newUrls.map(u => `'${u}'`).join(',')}]::text[]` : `'${newUrls[0]}'`;
      const updateQuery = `UPDATE ${tableName} SET ${fieldName} = ${updateValue} WHERE ${tableIdField} = ${recordId}`;

      try {
        await db.query(updateQuery);
        console.log(`  ✓ Updated database record ${recordId}`);
      } catch (err) {
        console.log(`  ✗ Failed to update database: ${err.message}`);
      }
    }
  }

  console.log(`  Patched: ${patchedCount}, Skipped: ${skippedCount}`);
  return { patched: patchedCount, skipped: skippedCount };
}

/**
 * Main function
 */
async function main() {
  console.log('=== Chinese Filename Patching Tool ===\n');
  console.log(`Storage Root: ${STORAGE_ROOT}`);
  console.log(`File Base URL: ${FILE_BASE_URL}\n`);

  await db.connect();
  console.log('Connected to database\n');

  const results = {
    totalPatched: 0,
    totalSkipped: 0
  };

  // Define all file fields to patch
  const fieldsToPatch = [
    { table: 'seda_registration', idField: 'id', field: 'customer_signature', type: 'single' },
    { table: 'seda_registration', idField: 'id', field: 'ic_copy_front', type: 'single' },
    { table: 'seda_registration', idField: 'id', field: 'ic_copy_back', type: 'single' },
    { table: 'seda_registration', idField: 'id', field: 'tnb_bill_1', type: 'single' },
    { table: 'seda_registration', idField: 'id', field: 'tnb_bill_2', type: 'single' },
    { table: 'seda_registration', idField: 'id', field: 'tnb_bill_3', type: 'single' },
    { table: 'seda_registration', idField: 'id', field: 'nem_cert', type: 'single' },
    { table: 'seda_registration', idField: 'id', field: 'mykad_pdf', type: 'single' },
    { table: 'seda_registration', idField: 'id', field: 'property_ownership_prove', type: 'single' },
    { table: 'seda_registration', idField: 'id', field: 'roof_images', type: 'array' },
    { table: 'seda_registration', idField: 'id', field: 'site_images', type: 'array' },
    { table: 'seda_registration', idField: 'id', field: 'drawing_pdf_system', type: 'array' },
    { table: 'seda_registration', idField: 'id', field: 'drawing_system_actual', type: 'array' },
    { table: 'seda_registration', idField: 'id', field: 'drawing_engineering_seda_pdf', type: 'array' },
    { table: 'users', idField: 'id', field: 'profile_picture', type: 'single' },
    { table: 'payment', idField: 'id', field: 'attachment', type: 'array' },
    { table: 'submitted_payment', idField: 'id', field: 'attachment', type: 'array' },
    { table: 'invoice_template', idField: 'id', field: 'logo_url', type: 'single' },
  ];

  for (const fieldConfig of fieldsToPatch) {
    const result = await processTableField(
      fieldConfig.table,
      fieldConfig.idField,
      fieldConfig.field,
      fieldConfig.type
    );
    results.totalPatched += result.patched;
    results.totalSkipped += result.skipped;
  }

  await db.end();

  console.log('\n=== Summary ===');
  console.log(`Total files patched: ${results.totalPatched}`);
  console.log(`Total files skipped: ${results.totalSkipped}`);
  console.log('\n✓ Patching complete!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
