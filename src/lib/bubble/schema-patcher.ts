/**
 * ============================================================================
 * SCHEMA PATCHER - AUTO-DISCOVER AND CREATE MISSING COLUMNS
 * ============================================================================
 *
 * Automatically discovers JSON fields and creates missing database columns.
 * Treats JSON data as the "source of truth" for schema structure.
 *
 * File: src/lib/bubble/schema-patcher.ts
 */

import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { logSyncActivity } from "@/lib/logger";

export type EntityType = 'invoice' | 'payment' | 'seda_registration' | 'invoice_item' | 'user';

/**
 * Map entity types to actual database table names
 */
const TABLE_NAMES: Record<EntityType, string> = {
  'invoice': 'invoice',
  'payment': 'payment',
  'seda_registration': 'seda_registration',
  'invoice_item': 'invoice_item',
  'user': 'user',
};

/**
 * Infer PostgreSQL column type from JSON value
 */
function inferPgType(value: any): string {
  if (value === null || value === undefined) {
    return 'text'; // Default to text for null values
  }

  const type = typeof value;

  // Handle arrays
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return 'text[]'; // Default to text array for empty arrays
    }
    // Infer array type from first element
    const elementType = inferPgType(value[0]);
    return elementType.endsWith('[]') ? elementType : `${elementType}[]`;
  }

  // Handle numbers
  if (type === 'number') {
    return Number.isInteger(value) ? 'integer' : 'numeric';
  }

  // Handle booleans
  if (type === 'boolean') {
    return 'boolean';
  }

  // Handle dates (ISO 8601 strings)
  if (type === 'string') {
    // Check if it's a date string
    const dateRegex = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/;
    if (dateRegex.test(value)) {
      return 'timestamp with time zone';
    }
    // Default to text
    return 'text';
  }

  // Default to text
  return 'text';
}

/**
 * Get all existing column names for a table
 */
async function getExistingColumns(tableName: string): Promise<Set<string>> {
  try {
    const result = await db.execute(sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = ${tableName}
      AND table_schema = 'public'
    `);

    const columns = new Set<string>();
    for (const row of result.rows as any[]) {
      columns.add(row.column_name);
    }

    return columns;
  } catch (error) {
    logSyncActivity(`Failed to fetch columns for ${tableName}: ${error}`, 'ERROR');
    throw error;
  }
}

/**
 * Extract all unique keys from JSON data
 */
function extractJsonKeys(jsonData: any[]): Set<string> {
  const keys = new Set<string>();

  for (const record of jsonData) {
    if (record && typeof record === 'object') {
      Object.keys(record).forEach(key => keys.add(key));
    }
  }

  return keys;
}

/**
 * Convert a JSON key to a snake_case column name
 */
function toColumnName(key: string): string {
  // Convert spaces and special chars to underscores, make lowercase
  return key
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, ''); // Trim leading/trailing underscores
}

/**
 * Check if a column already exists in the table
 */
function shouldSkipColumn(columnName: string): boolean {
  // Skip system columns that shouldn't be modified
  const systemColumns = ['id', 'created_at', 'updated_at', 'last_synced_at'];
  return systemColumns.includes(columnName);
}

/**
 * Add a new column to a table
 */
async function addColumn(
  tableName: string,
  columnName: string,
  columnType: string
): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE ${sql.identifier(tableName)}
      ADD COLUMN IF NOT EXISTS ${sql.identifier(columnName)} ${sql.raw(columnType)}
    `);
    logSyncActivity(`✓ Added column ${tableName}.${columnName} (${columnType})`, 'INFO');
  } catch (error) {
    logSyncActivity(`Failed to add column ${tableName}.${columnName}: ${error}`, 'ERROR');
    throw error;
  }
}

/**
 * Schema patch result
 */
export interface SchemaPatchResult {
  success: boolean;
  entityType: EntityType;
  existingColumns: string[];
  jsonFields: string[];
  missingColumns: {
    columnName: string;
    jsonField: string;
    inferredType: string;
  }[];
  addedColumns: string[];
  errors: string[];
}

/**
 * ============================================================================
 * MAIN FUNCTION - PATCH SCHEMA FROM JSON
 * ============================================================================
 */

/**
 * Analyze JSON data and create missing columns in database.
 *
 * @param entityType - Type of entity to patch
 * @param jsonData - JSON data from Bubble export
 * @returns SchemaPatchResult with details of what was added
 */
export async function patchSchemaFromJson(
  entityType: EntityType,
  jsonData: any[]
): Promise<SchemaPatchResult> {
  const result: SchemaPatchResult = {
    success: false,
    entityType,
    existingColumns: [],
    jsonFields: [],
    missingColumns: [],
    addedColumns: [],
    errors: [],
  };

  const tableName = TABLE_NAMES[entityType];

  logSyncActivity(`Schema Analysis: Checking ${tableName} for missing columns...`, 'INFO');

  try {
    // Step 1: Get existing columns
    logSyncActivity(`Step 1: Fetching existing columns...`, 'INFO');
    const existingColumnsSet = await getExistingColumns(tableName);
    result.existingColumns = Array.from(existingColumnsSet);
    logSyncActivity(`Found ${result.existingColumns.length} existing columns`, 'INFO');

    // Step 2: Extract JSON keys
    logSyncActivity(`Step 2: Analyzing JSON structure...`, 'INFO');
    const jsonKeys = extractJsonKeys(jsonData);
    result.jsonFields = Array.from(jsonKeys).sort();
    logSyncActivity(`Found ${result.jsonFields.length} unique fields in JSON`, 'INFO');

    // Step 3: Find missing columns
    logSyncActivity(`Step 3: Identifying missing columns...`, 'INFO');
    const missingColumns: typeof result.missingColumns = [];

    for (const jsonField of result.jsonFields) {
      const columnName = toColumnName(jsonField);

      if (existingColumnsSet.has(columnName)) {
        continue; // Column already exists
      }

      if (shouldSkipColumn(columnName)) {
        continue; // Skip system columns
      }

      // Infer type from JSON data
      let inferredType = 'text';
      for (const record of jsonData) {
        if (record[jsonField] !== undefined && record[jsonField] !== null) {
          inferredType = inferPgType(record[jsonField]);
          break;
        }
      }

      missingColumns.push({
        columnName,
        jsonField,
        inferredType,
      });
    }

    result.missingColumns = missingColumns;

    if (missingColumns.length === 0) {
      logSyncActivity(`✓ Schema is up to date! No missing columns.`, 'INFO');
      result.success = true;
      return result;
    }

    logSyncActivity(`Found ${missingColumns.length} missing columns:`, 'INFO');
    missingColumns.forEach(({ columnName, inferredType }) => {
      logSyncActivity(`  - ${columnName} (${inferredType})`, 'INFO');
    });

    // Step 4: Add missing columns
    logSyncActivity(`Step 4: Adding missing columns...`, 'INFO');

    for (const { columnName, inferredType } of missingColumns) {
      try {
        await addColumn(tableName, columnName, inferredType);
        result.addedColumns.push(columnName);
      } catch (error) {
        const errorMsg = `Failed to add column ${columnName}: ${error}`;
        result.errors.push(errorMsg);
        logSyncActivity(`✗ ${errorMsg}`, 'ERROR');
      }
    }

    result.success = result.errors.length === 0 || result.addedColumns.length > 0;

    if (result.success) {
      logSyncActivity(`✓ Schema patch complete: ${result.addedColumns.length}/${missingColumns.length} columns added`, 'INFO');
    } else {
      logSyncActivity(`Schema patch completed with errors`, 'ERROR');
    }

    return result;

  } catch (error) {
    const errorMsg = `Schema patch failed: ${String(error)}`;
    result.errors.push(errorMsg);
    logSyncActivity(`✗ ${errorMsg}`, 'ERROR');
    return result;
  }
}

/**
 * ============================================================================
 * CONVENIENCE FUNCTIONS FOR EACH ENTITY TYPE
 * ============================================================================
 */

export async function patchInvoiceSchema(jsonData: any[]) {
  return patchSchemaFromJson('invoice', jsonData);
}

export async function patchPaymentSchema(jsonData: any[]) {
  return patchSchemaFromJson('payment', jsonData);
}

export async function patchSedaRegistrationSchema(jsonData: any[]) {
  return patchSchemaFromJson('seda_registration', jsonData);
}

export async function patchInvoiceItemSchema(jsonData: any[]) {
  return patchSchemaFromJson('invoice_item', jsonData);
}
