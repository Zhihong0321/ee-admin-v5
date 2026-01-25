/**
 * COMPLETE BUBBLE → POSTGRES FIELD MAPPINGS
 *
 * Phase 1B: Build Complete Mapping Logic
 *
 * This file maps EVERY Bubble field to its Postgres column.
 * Zero database changes. Pure mapping logic.
 *
 * Risk: ZERO - No schema changes, no database writes
 */

// ============================================================================
// INVOICE FIELD MAPPINGS (107 columns in Postgres, 39 fields in Bubble)
// ============================================================================

export interface FieldMappingConfig {
  /** Postgres column name */
  column: string;
  /** Data type for conversion */
  type: 'string' | 'text' | 'integer' | 'numeric' | 'timestamp' | 'boolean' | 'array';
  /** Is this a relational field (points to another table)? */
  relation?: 'customer' | 'agent' | 'user' | 'payment' | 'submitted_payment' | 'seda_registration' | 'invoice_item' | 'invoice' | 'template' | 'package' | 'agreement' | 'stock_transaction' | 'voucher' | 'roof_image' | 'notification' | 'follow_up' | 'lead_from_customer' | 'payment_plan' | 'saving_report';
  /** Is this column missing from Postgres (needs creation)? */
  needsColumn?: boolean;
  /** Snake_case column name if different from default */
  snakeCase?: string;
}

export const INVOICE_FIELD_MAPPING: Record<string, FieldMappingConfig> = {
  // ==========================================================================
  // PRIMARY IDENTIFIERS (Already Mapped)
  // ==========================================================================
  '_id': { column: 'bubble_id', type: 'string' },
  'Invoice ID': { column: 'invoice_id', type: 'integer' },
  'Invoice Number': { column: 'invoice_number', type: 'string' },

  // ==========================================================================
  // AMOUNTS & PAYMENTS (Partially Mapped - Critical Gaps)
  // ==========================================================================
  'Amount': { column: 'amount', type: 'numeric' },
  'Total Amount': { column: 'total_amount', type: 'numeric' },

  // ✅ FIXED: Now using actual Postgres column names
  '1st Payment %': { column: '1st_payment', type: 'integer' },
  '1st Payment Date': { column: '1st_payment_date', type: 'timestamp' },
  '2nd Payment %': { column: '2nd_payment', type: 'integer' },
  'Amount Eligible for Comm': { column: 'amount_eligible_for_comm', type: 'numeric' },
  'Full Payment Date': { column: 'full_payment_date', type: 'timestamp' },
  'Last Payment Date': { column: 'last_payment_date', type: 'timestamp' },

  // ==========================================================================
  // RELATIONAL FIELDS (Critical - Most Synced Incompletely)
  // ==========================================================================
  'Linked Customer': { column: 'linked_customer', type: 'string', relation: 'customer' },
  'Linked Agent': { column: 'linked_agent', type: 'string', relation: 'agent' },
  'Linked Payment': { column: 'linked_payment', type: 'array', relation: 'payment' },
  'Linked SEDA registration': { column: 'linked_seda_registration', type: 'string', relation: 'seda_registration' },
  'Linked Invoice Item': { column: 'linked_invoice_item', type: 'array', relation: 'invoice_item' },
  'Created By': { column: 'created_by', type: 'string', relation: 'user' },

  // ❌ MISSING RELATIONS
  'Linked Package': { column: 'linked_package', type: 'string', relation: 'package' },
  'Linked Agreement': { column: 'linked_agreement', type: 'string', relation: 'agreement' },
  'Linked Stock Transaction': { column: 'linked_stock_transaction', type: 'array', relation: 'stock_transaction' },

  // ==========================================================================
  // DATES & TIMESTAMPS
  // ==========================================================================
  'Invoice Date': { column: 'invoice_date', type: 'timestamp' },
  'Created Date': { column: 'created_date', type: 'timestamp' },
  'Modified Date': { column: 'modified_date', type: 'timestamp' },

  // ==========================================================================
  // STATUS & CLASSIFICATION
  // ==========================================================================
  'Status': { column: 'status', type: 'string' },
  'Type': { column: 'type', type: 'string' },
  'Version': { column: 'version', type: 'integer' },

  // ❌ MISSING STATUS FIELDS
  'Approval Status': { column: 'approval_status', type: 'string' },
  'Stock Status INV': { column: 'stock_status_inv', type: 'string' },
  'Paid?': { column: 'paid', type: 'boolean' },
  'Need Approval': { column: 'need_approval', type: 'boolean' },
  'Locked Package?': { column: 'locked_package', type: 'boolean' },
  'Commission Paid?': { column: 'commission_paid', type: 'boolean' },

  // ==========================================================================
  // COMMISSION & PERFORMANCE
  // ==========================================================================
  // ❌ MISSING: All commission fields
  'Normal Commission': { column: 'normal_commission', type: 'numeric' },
  'Performance Tier Month': { column: 'performance_tier_month', type: 'integer' },
  'Performance Tier Year': { column: 'performance_tier_year', type: 'integer' },

  // ==========================================================================
  // INVENTORY & STOCK
  // ==========================================================================
  // ❌ MISSING: Inventory fields
  'Panel Qty': { column: 'panel_qty', type: 'integer' },
  'Stamp Cash Price': { column: 'stamp_cash_price', type: 'numeric' },

  // ==========================================================================
  // PERCENTAGE CALCULATIONS
  // ==========================================================================
  // ⚠️ UNVERIFIED: Column not found in initial check - needs confirmation
  // 'Percent of Total Amount': { column: '???', type: 'numeric', needsConfirmation: true },
  // Note: Postgres column for this field is unclear from current data
  // May be stored in a different column or not synced

  // ==========================================================================
  // TEXT FIELDS
  // ==========================================================================
  'Dealercode': { column: 'dealercode', type: 'string' },
  'Logs': { column: 'logs', type: 'text' },
  'Eligible Amount Description': { column: 'eligible_amount_description', type: 'text' },

  // ==========================================================================
  // COUNTERS
  // ==========================================================================
  'visit': { column: 'visit', type: 'integer' },
};

// ============================================================================
// INVOICE ITEM FIELD MAPPINGS (20 columns in Postgres)
// ============================================================================

export const INVOICE_ITEM_FIELD_MAPPING: Record<string, FieldMappingConfig> = {
  '_id': { column: 'bubble_id', type: 'string' },
  'Description': { column: 'description', type: 'text' },
  'Qty': { column: 'qty', type: 'integer' },
  'Unit Price': { column: 'unit_price', type: 'numeric' },
  'Amount': { column: 'amount', type: 'numeric' },
  'Created By': { column: 'created_by', type: 'string', relation: 'user' },
  'Created Date': { column: 'created_date', type: 'timestamp' },
  'Modified Date': { column: 'modified_date', type: 'timestamp' },
  'Is a Package': { column: 'is_a_package', type: 'boolean' },
  'Invoice': { column: 'linked_invoice', type: 'string', relation: 'invoice' },
  'Package': { column: 'linked_package', type: 'string', relation: 'package' },
  'EPP': { column: 'epp', type: 'integer' },
  'Sort': { column: 'sort', type: 'integer' },
  'Voucher': { column: 'linked_voucher', type: 'string', relation: 'voucher' },
  'Voucher Remark': { column: 'voucher_remark', type: 'text' },
  'Item Type': { column: 'inv_item_type', type: 'string' },
};

// ============================================================================
// MAPPING FUNCTIONS
// ============================================================================

/**
 * Convert Bubble value to Postgres value based on type
 */
function convertBubbleValue(value: any, type: FieldMappingConfig['type']): any {
  if (value === null || value === undefined) {
    return null;
  }

  switch (type) {
    case 'integer':
      return typeof value === 'number' ? Math.floor(value) : parseInt(String(value), 10);

    case 'numeric':
      return typeof value === 'number' ? value : parseFloat(String(value));

    case 'boolean':
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') return value.toLowerCase() === 'true' || value === 'yes' || value === 'y';
      return Boolean(value);

    case 'timestamp':
      if (value instanceof Date) return value;
      if (typeof value === 'string') return new Date(value);
      if (typeof value === 'number') return new Date(value);
      return null;

    case 'array':
      if (Array.isArray(value)) return value;
      if (typeof value === 'string' && value.length > 0) return [value];
      return [];

    case 'string':
    case 'text':
      return String(value);

    default:
      return value;
  }
}

/**
 * Map ALL invoice fields from Bubble to Postgres format
 *
 * @param bubbleInvoice - Raw invoice object from Bubble API
 * @returns Postgres-formatted invoice record
 */
export function mapAllInvoiceFields(bubbleInvoice: any): Record<string, any> {
  const mapped: Record<string, any> = {};
  const unmappedFields: string[] = [];

  for (const [bubbleField, config] of Object.entries(INVOICE_FIELD_MAPPING)) {
    const bubbleValue = bubbleInvoice[bubbleField];

    // Skip undefined values (preserve existing data on update)
    if (bubbleValue === undefined) {
      continue;
    }

    // Convert and assign
    mapped[config.column] = convertBubbleValue(bubbleValue, config.type);
  }

  // Track any Bubble fields not in our mapping
  for (const field of Object.keys(bubbleInvoice)) {
    if (!INVOICE_FIELD_MAPPING[field] && field !== '_id') {
      unmappedFields.push(field);
    }
  }

  // Add metadata about unmapped fields
  if (unmappedFields.length > 0) {
    mapped._unmapped_bubble_fields = unmappedFields;
  }

  return mapped;
}

/**
 * Map ALL invoice item fields from Bubble to Postgres format
 *
 * @param bubbleItem - Raw invoice_item object from Bubble API
 * @returns Postgres-formatted invoice_item record
 */
export function mapInvoiceItemFields(bubbleItem: any): Record<string, any> {
  const mapped: Record<string, any> = {};
  const unmappedFields: string[] = [];

  for (const [bubbleField, config] of Object.entries(INVOICE_ITEM_FIELD_MAPPING)) {
    const bubbleValue = bubbleItem[bubbleField];

    if (bubbleValue === undefined) {
      continue;
    }

    mapped[config.column] = convertBubbleValue(bubbleValue, config.type);
  }

  // Track unmapped fields
  for (const field of Object.keys(bubbleItem)) {
    if (!INVOICE_ITEM_FIELD_MAPPING[field] && field !== '_id') {
      unmappedFields.push(field);
    }
  }

  if (unmappedFields.length > 0) {
    mapped._unmapped_bubble_fields = unmappedFields;
  }

  return mapped;
}

// ============================================================================
// MISSING COLUMNS DETECTION
// ============================================================================

export interface MissingColumn {
  bubbleField: string;
  postgresColumn: string;
  dataType: string;
  reason: string;
}

/**
 * Detect columns that exist in mapping but may be missing from Postgres
 */
export function detectMissingInvoiceColumns(): MissingColumn[] {
  const missing: MissingColumn[] = [];

  for (const [bubbleField, config] of Object.entries(INVOICE_FIELD_MAPPING)) {
    if (config.needsColumn) {
      missing.push({
        bubbleField,
        postgresColumn: config.column,
        dataType: config.type,
        reason: 'Field exists in Bubble but column may not exist in Postgres'
      });
    }
  }

  return missing;
}

// ============================================================================
// FIELD INVENTORY REPORTS
// ============================================================================

/**
 * Generate a complete field inventory report
 */
export function generateFieldInventoryReport() {
  return {
    timestamp: new Date().toISOString(),
    invoice: {
      totalBubbleFields: Object.keys(INVOICE_FIELD_MAPPING).length,
      mappedFields: Object.keys(INVOICE_FIELD_MAPPING).filter(k => !INVOICE_FIELD_MAPPING[k].needsColumn).length,
      missingColumns: Object.keys(INVOICE_FIELD_MAPPING).filter(k => INVOICE_FIELD_MAPPING[k].needsColumn).length,
      relationalFields: Object.keys(INVOICE_FIELD_MAPPING).filter(k => INVOICE_FIELD_MAPPING[k].relation).length,
      fields: INVOICE_FIELD_MAPPING
    },
    invoice_item: {
      totalBubbleFields: Object.keys(INVOICE_ITEM_FIELD_MAPPING).length,
      mappedFields: Object.keys(INVOICE_ITEM_FIELD_MAPPING).length,
      relationalFields: Object.keys(INVOICE_ITEM_FIELD_MAPPING).filter(k => INVOICE_ITEM_FIELD_MAPPING[k].relation).length,
      fields: INVOICE_ITEM_FIELD_MAPPING
    }
  };
}

// ============================================================================
// RELATIONAL FIELD EXTRACTION
// ============================================================================

/**
 * Extract all relational bubble_ids from an invoice
 * Useful for dependency-ordered syncing
 */
export function extractInvoiceRelations(bubbleInvoice: any) {
  return {
    customer: bubbleInvoice['Linked Customer'] || null,
    agent: bubbleInvoice['Linked Agent'] || null,
    seda_registration: bubbleInvoice['Linked SEDA registration'] || null,
    package: bubbleInvoice['Linked Package'] || null,
    agreement: bubbleInvoice['Linked Agreement'] || null,
    created_by: bubbleInvoice['Created By'] || null,
    payments: Array.isArray(bubbleInvoice['Linked Payment']) ? bubbleInvoice['Linked Payment'] : [],
    invoice_items: Array.isArray(bubbleInvoice['Linked Invoice Item']) ? bubbleInvoice['Linked Invoice Item'] : [],
    stock_transactions: Array.isArray(bubbleInvoice['Linked Stock Transaction']) ? bubbleInvoice['Linked Stock Transaction'] : [],
  };
}

/**
 * Extract relations from invoice item
 */
export function extractInvoiceItemRelations(bubbleItem: any) {
  return {
    invoice: bubbleItem['Invoice'] || null,
    package: bubbleItem['Package'] || null,
    voucher: bubbleItem['Voucher'] || null,
    created_by: bubbleItem['Created By'] || null,
  };
}
