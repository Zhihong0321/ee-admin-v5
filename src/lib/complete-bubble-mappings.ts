/**
 * COMPLETE BUBBLE → POSTGRES FIELD MAPPINGS
 *
 * ALL TABLES - COMPLETE AUDIT RESULTS
 *
 * Phase 1A Complete: All tables audited with correct column names
 *
 * Date: 2026-01-19
 * Status: READY FOR IMPLEMENTATION
 */

// ============================================================================
// INVOICE TABLE (107 columns in Postgres, 39 fields in Bubble)
// ============================================================================

export interface FieldMappingConfig {
  column: string;
  type: 'string' | 'text' | 'integer' | 'numeric' | 'timestamp' | 'boolean' | 'array';
  relation?: string;
  note?: string;
}

export const INVOICE_FIELD_MAPPING: Record<string, FieldMappingConfig> = {
  // Primary Keys
  '_id': { column: 'bubble_id', type: 'string' },
  'Invoice ID': { column: 'invoice_id', type: 'integer' },
  'Invoice Number': { column: 'invoice_number', type: 'string' },

  // Amounts
  'Amount': { column: 'amount', type: 'numeric' },
  'Total Amount': { column: 'total_amount', type: 'numeric' },

  // Payments - FIXED: Using actual Postgres column names!
  '1st Payment %': { column: '1st_payment', type: 'integer' },
  '1st Payment Date': { column: '1st_payment_date', type: 'timestamp' },
  '2nd Payment %': { column: '2nd_payment', type: 'integer' },
  'Amount Eligible for Comm': { column: 'amount_eligible_for_comm', type: 'numeric' },
  'Full Payment Date': { column: 'full_payment_date', type: 'timestamp' },
  'Last Payment Date': { column: 'last_payment_date', type: 'timestamp' },

  // Relational Fields
  'Linked Customer': { column: 'linked_customer', type: 'string', relation: 'customer' },
  'Linked Agent': { column: 'linked_agent', type: 'string', relation: 'agent' },
  'Linked Payment': { column: 'linked_payment', type: 'array', relation: 'payment' },
  'Linked SEDA registration': { column: 'linked_seda_registration', type: 'string', relation: 'seda_registration' },
  'Linked Invoice Item': { column: 'linked_invoice_item', type: 'array', relation: 'invoice_item' },
  'Created By': { column: 'created_by', type: 'string', relation: 'user' },
  'Linked Package': { column: 'linked_package', type: 'string', relation: 'package' },
  'Linked Agreement': { column: 'linked_agreement', type: 'string', relation: 'agreement' },
  'Linked Stock Transaction': { column: 'linked_stock_transaction', type: 'array', relation: 'stock_transaction' },

  // Dates
  'Invoice Date': { column: 'invoice_date', type: 'timestamp' },
  'Created Date': { column: 'created_date', type: 'timestamp' },
  'Modified Date': { column: 'modified_date', type: 'timestamp' },

  // Status & Classification
  'Status': { column: 'status', type: 'string' },
  'Type': { column: 'type', type: 'string' },
  'Version': { column: 'version', type: 'integer' },
  'Approval Status': { column: 'approval_status', type: 'string' },
  'Stock Status INV': { column: 'stock_status_inv', type: 'string' },
  'Paid?': { column: 'paid', type: 'boolean' },
  'Need Approval': { column: 'need_approval', type: 'boolean' },
  'Locked Package?': { column: 'locked_package', type: 'boolean' },
  'Commission Paid?': { column: 'commission_paid', type: 'boolean' },

  // Commission & Performance
  'Normal Commission': { column: 'normal_commission', type: 'numeric' },
  'Performance Tier Month': { column: 'performance_tier_month', type: 'integer' },
  'Performance Tier Year': { column: 'performance_tier_year', type: 'integer' },

  // Inventory
  'Panel Qty': { column: 'panel_qty', type: 'integer' },
  'Stamp Cash Price': { column: 'stamp_cash_price', type: 'numeric' },

  // Text Fields
  'Dealercode': { column: 'dealercode', type: 'string' },
  'Logs': { column: 'logs', type: 'text' },
  'Eligible Amount Description': { column: 'eligible_amount_description', type: 'text' },

  // Counters
  'visit': { column: 'visit', type: 'integer' },

  // UNMAPPED: Percent of Total Amount - unclear destination
  // 'Percent of Total Amount': { column: '???', type: 'numeric', note: 'Destination unclear' },
};

// ============================================================================
// CUSTOMER TABLE (19 columns in Postgres, 11 fields in Customer_Profile)
// ============================================================================

export const CUSTOMER_FIELD_MAPPING: Record<string, FieldMappingConfig> = {
  // Primary Keys
  '_id': { column: 'customer_id', type: 'string' },

  // Basic Info
  'Name': { column: 'name', type: 'string' },
  'Address': { column: 'address', type: 'string' },
  'State': { column: 'state', type: 'string' },
  'Created By': { column: 'created_by', type: 'string' },

  // MANUAL MAPPING - These were missed by auto-mapping
  'Contact': { column: 'phone', type: 'string', note: 'Contact maps to phone field' },
  'Whatsapp': { column: 'phone', type: 'string', note: 'Whatsapp also maps to phone (alt contact)' },
  'Modified Date': { column: 'modified_date', type: 'timestamp' },
  'Linked Agent': { column: 'linked_agent', type: 'string', relation: 'agent', note: 'Agent bubble_id' },
  'Created Date': { column: 'created_date', type: 'timestamp' },

  // NOT IN POSTGRES: Status field (local-only field)
  // 'Status': { column: null, note: 'Status field exists in Bubble but not in Postgres customer table' },
};

// ============================================================================
// AGENT TABLE (26 columns in Postgres, 14 fields in Bubble)
// ============================================================================

export const AGENT_FIELD_MAPPING: Record<string, FieldMappingConfig> = {
  '_id': { column: 'bubble_id', type: 'string' },
  'Name': { column: 'name', type: 'string' },
  'Slug': { column: 'slug', type: 'string' },
  'Contact': { column: 'contact', type: 'string' },
  'Agent Type': { column: 'agent_type', type: 'string' },
  'Commission': { column: 'commission', type: 'integer' },
  'TREE SEED': { column: 'tree_seed', type: 'string' },
  'Created Date': { column: 'created_date', type: 'timestamp' },
  'Modified Date': { column: 'modified_date', type: 'timestamp' },
  'Linked User Login': { column: 'linked_user_login', type: 'string', relation: 'user' },
  'Last Update Annual Sales': { column: 'last_update_annual_sales', type: 'timestamp' },
  'Current Annual Sales': { column: 'current_annual_sales', type: 'integer' },
  'Annual Collection': { column: 'annual_collection', type: 'integer' },
  'Intro Youtube': { column: 'intro_youtube', type: 'string' },
};

// ============================================================================
// USER TABLE (16 columns in Postgres, 11 fields in Bubble)
// ============================================================================

export const USER_FIELD_MAPPING: Record<string, FieldMappingConfig> = {
  '_id': { column: 'bubble_id', type: 'string' },
  'authentication': { column: 'authentication', type: 'text', note: 'Nested object from Bubble.auth.email.email' },
  'Created Date': { column: 'created_date', type: 'timestamp' },
  'user_signed_up': { column: 'user_signed_up', type: 'boolean' },
  'Dealership': { column: 'dealership', type: 'string' },
  'Profile Picture': { column: 'profile_picture', type: 'string' },
  'Access Level': { column: 'access_level', type: 'array' },
  'Linked Agent Profile': { column: 'linked_agent_profile', type: 'string', relation: 'agent' },
  'check in report today': { column: 'check_in_report_today', type: 'string' },
  'agent_code': { column: 'agent_code', type: 'string' },
  'Modified Date': { column: 'modified_date', type: 'timestamp' },
};

// ============================================================================
// PAYMENT TABLE (25 columns in Postgres, 9 fields in Bubble)
// ============================================================================

export const PAYMENT_FIELD_MAPPING: Record<string, FieldMappingConfig> = {
  '_id': { column: 'bubble_id', type: 'string' },
  'Amount': { column: 'amount', type: 'numeric' },
  'Payment Date': { column: 'payment_date', type: 'timestamp' },
  'Payment Method': { column: 'payment_method', type: 'string' },
  'Remark': { column: 'remark', type: 'text' },
  'Linked Agent': { column: 'linked_agent', type: 'string', relation: 'agent' },
  'Linked Customer': { column: 'linked_customer', type: 'string', relation: 'customer', note: 'Exists in Postgres, may need manual sync' },
  'Linked Invoice': { column: 'linked_invoice', type: 'string', relation: 'invoice', note: 'Exists in Postgres, may need manual sync' },
  'Created By': { column: 'created_by', type: 'string', relation: 'user' },
  'Created Date': { column: 'created_date', type: 'timestamp' },
  'Modified Date': { column: 'modified_date', type: 'timestamp' },
};

// ============================================================================
// SUBMITTED_PAYMENT TABLE (26 columns in Postgres, 14 fields in Bubble)
// ============================================================================

export const SUBMITTED_PAYMENT_FIELD_MAPPING: Record<string, FieldMappingConfig> = {
  '_id': { column: 'bubble_id', type: 'string' },
  'Amount': { column: 'amount', type: 'numeric' },
  'PAYMENT DATE': { column: 'payment_date', type: 'timestamp' },
  'Issuer Bank': { column: 'issuer_bank', type: 'string' },
  'Payment Method V2': { column: 'payment_method_v2', type: 'string' },
  'Terminal': { column: 'terminal', type: 'string' },
  'Attachment': { column: 'attachment', type: 'array' },
  'Modified Date': { column: 'modified_date', type: 'timestamp' },
  'Created Date': { column: 'created_date', type: 'timestamp' },
  'Created By': { column: 'created_by', type: 'string', relation: 'user' },
  'Linked Agent': { column: 'linked_agent', type: 'string', relation: 'agent' },
  'Linked Customer': { column: 'linked_customer', type: 'string', relation: 'customer' },
  'Linked Invoice': { column: 'linked_invoice', type: 'string', relation: 'invoice' },

  // UNMAPPED: Linked Installment - unclear destination
  // 'Linked Installment': { column: '???', note: 'Not found in Postgres schema' },
};

// ============================================================================
// SEDA_REGISTRATION TABLE (69 columns in Postgres, 16 fields in Bubble)
// ============================================================================

export const SEDA_REGISTRATION_FIELD_MAPPING: Record<string, FieldMappingConfig> = {
  '_id': { column: 'bubble_id', type: 'string' },
  'CITY': { column: 'city', type: 'string' },
  'STATE': { column: 'state', type: 'string' },
  'Agent': { column: 'agent', type: 'string', relation: 'agent' },
  'Linked Customer': { column: 'linked_customer', type: 'string', relation: 'customer' },
  'Created By': { column: 'created_by', type: 'string' },
  'Created Date': { column: 'created_date', type: 'timestamp' },
  'Modified Date': { column: 'modified_date', type: 'timestamp' },
  'Project Price': { column: 'project_price', type: 'numeric' },
  'System Size': { column: 'system_size', type: 'integer' },
  'System Size in FORM kWp': { column: 'system_size_in_form_kwp', type: 'integer' },
  'Reg Status': { column: 'reg_status', type: 'string' },
  'Redex-Status': { column: 'redex_status', type: 'string' },
  'Roof Images': { column: 'roof_images', type: 'array' },
  'Drawing (SYSTEM) Submitted': { column: 'drawing_system_submitted', type: 'boolean' },
  '??SunPeak Hours': { column: 'sunpeak_hours', type: 'numeric', note: 'Weird field name in Bubble' },
};

// NOTE: Postgres has 53 ADDITIONAL columns not in Bubble
// These may be: calculated fields, old schema fields, or local-only fields

// ============================================================================
// INVOICE_ITEM TABLE (20 columns in Postgres, 9 fields in Bubble)
// ============================================================================

export const INVOICE_ITEM_FIELD_MAPPING: Record<string, FieldMappingConfig> = {
  '_id': { column: 'bubble_id', type: 'string' },
  'DESCRIPTION': { column: 'description', type: 'text' },
  'QTY': { column: 'qty', type: 'integer' },
  'AMOUNT': { column: 'amount', type: 'numeric' },
  'UNIT PRICE': { column: 'unit_price', type: 'numeric' },
  'Created By': { column: 'created_by', type: 'string', relation: 'user' },
  'Created Date': { column: 'created_date', type: 'timestamp' },
  'Modified Date': { column: 'modified_date', type: 'timestamp' },
  'is a Package?': { column: 'is_a_package', type: 'boolean' },

  // Postgres has additional fields not in Bubble:
  // - linked_invoice (relation back to invoice)
  // - linked_package (relation to package)
  // - epp (integer)
  // - sort (display order)
  // - linked_voucher (relation to voucher)
  // - voucher_remark (text)
  // - inv_item_type (text)
};

// ============================================================================
// INVOICE_TEMPLATE TABLE (20 columns in Postgres, NOT FOUND IN BUBBLE)
// ============================================================================

export const INVOICE_TEMPLATE_FIELD_MAPPING: Record<string, FieldMappingConfig> = {
  // NOTE: invoice_template table exists in Postgres with 20 columns
  // BUT: Could not find corresponding Bubble object
  // May be: local-only table, or different object name

  // Postgres columns (from schema.ts:235-256):
  // - bubble_id, template_name, company_name, company_address, company_phone
  // - company_email, sst_registration_no, bank_name, bank_account_no
  // - bank_account_name, logo_url, terms_and_conditions, active, is_default
  // - created_by, created_at, updated_at, disclaimer, apply_sst

  // For now, marking as DO NOT SYNC from Bubble
  // Sync should only work FROM Bubble if we find the object name
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
 */
export function mapInvoiceFields(bubbleInvoice: any): Record<string, any> {
  const mapped: Record<string, any> = {};
  const unmappedFields: string[] = [];

  for (const [bubbleField, config] of Object.entries(INVOICE_FIELD_MAPPING)) {
    const bubbleValue = bubbleInvoice[bubbleField];

    if (bubbleValue === undefined) {
      continue;
    }

    mapped[config.column] = convertBubbleValue(bubbleValue, config.type);
  }

  // SPECIAL CASE: If Bubble has "Amount" but not "Total Amount", copy Amount to total_amount
  // This is needed because Bubble stores the invoice total in "Amount" field
  if (bubbleInvoice['Amount'] !== undefined && bubbleInvoice['Total Amount'] === undefined) {
    mapped.total_amount = convertBubbleValue(bubbleInvoice['Amount'], 'numeric');
  }

  // Track unmapped fields
  for (const field of Object.keys(bubbleInvoice)) {
    if (!INVOICE_FIELD_MAPPING[field] && field !== '_id') {
      unmappedFields.push(field);
    }
  }

  if (unmappedFields.length > 0) {
    mapped._unmapped_bubble_fields = unmappedFields;
  }

  return mapped;
}

/**
 * Map customer fields
 */
export function mapCustomerFields(bubbleCustomer: any): Record<string, any> {
  const mapped: Record<string, any> = {};

  for (const [bubbleField, config] of Object.entries(CUSTOMER_FIELD_MAPPING)) {
    const bubbleValue = bubbleCustomer[bubbleField];

    if (bubbleValue === undefined || !config.column) {
      continue;
    }

    mapped[config.column] = convertBubbleValue(bubbleValue, config.type);
  }

  return mapped;
}

/**
 * Map agent fields
 */
export function mapAgentFields(bubbleAgent: any): Record<string, any> {
  const mapped: Record<string, any> = {};

  for (const [bubbleField, config] of Object.entries(AGENT_FIELD_MAPPING)) {
    const bubbleValue = bubbleAgent[bubbleField];

    if (bubbleValue === undefined) {
      continue;
    }

    mapped[config.column] = convertBubbleValue(bubbleValue, config.type);
  }

  return mapped;
}

/**
 * Map user fields
 */
export function mapUserFields(bubbleUser: any): Record<string, any> {
  const mapped: Record<string, any> = {};

  for (const [bubbleField, config] of Object.entries(USER_FIELD_MAPPING)) {
    const bubbleValue = bubbleUser[bubbleField];

    if (bubbleValue === undefined) {
      continue;
    }

    // Special handling for authentication nested object
    if (bubbleField === 'authentication') {
      // Extract email from nested object
      if (bubbleValue && bubbleValue.email && bubbleValue.email.email) {
        mapped[config.column] = JSON.stringify(bubbleValue);
      }
      continue;
    }

    mapped[config.column] = convertBubbleValue(bubbleValue, config.type);
  }

  return mapped;
}

/**
 * Map payment fields
 */
export function mapPaymentFields(bubblePayment: any): Record<string, any> {
  const mapped: Record<string, any> = {};

  for (const [bubbleField, config] of Object.entries(PAYMENT_FIELD_MAPPING)) {
    const bubbleValue = bubblePayment[bubbleField];

    if (bubbleValue === undefined) {
      continue;
    }

    mapped[config.column] = convertBubbleValue(bubbleValue, config.type);
  }

  return mapped;
}

/**
 * Map submitted_payment fields
 */
export function mapSubmittedPaymentFields(bubblePayment: any): Record<string, any> {
  const mapped: Record<string, any> = {};

  for (const [bubbleField, config] of Object.entries(SUBMITTED_PAYMENT_FIELD_MAPPING)) {
    const bubbleValue = bubblePayment[bubbleField];

    if (bubbleValue === undefined || !config.column) {
      continue;
    }

    mapped[config.column] = convertBubbleValue(bubbleValue, config.type);
  }

  return mapped;
}

/**
 * Map seda_registration fields
 */
export function mapSedaRegistrationFields(bubbleSeda: any): Record<string, any> {
  const mapped: Record<string, any> = {};

  for (const [bubbleField, config] of Object.entries(SEDA_REGISTRATION_FIELD_MAPPING)) {
    const bubbleValue = bubbleSeda[bubbleField];

    if (bubbleValue === undefined) {
      continue;
    }

    mapped[config.column] = convertBubbleValue(bubbleValue, config.type);
  }

  return mapped;
}

/**
 * Map invoice_item fields
 */
export function mapInvoiceItemFields(bubbleItem: any): Record<string, any> {
  const mapped: Record<string, any> = {};

  for (const [bubbleField, config] of Object.entries(INVOICE_ITEM_FIELD_MAPPING)) {
    const bubbleValue = bubbleItem[bubbleField];

    if (bubbleValue === undefined) {
      continue;
    }

    mapped[config.column] = convertBubbleValue(bubbleValue, config.type);
  }

  return mapped;
}

// ============================================================================
// EXPORT ALL MAPPINGS
// ============================================================================

export const ALL_FIELD_MAPPINGS = {
  invoice: INVOICE_FIELD_MAPPING,
  customer: CUSTOMER_FIELD_MAPPING,
  agent: AGENT_FIELD_MAPPING,
  user: USER_FIELD_MAPPING,
  payment: PAYMENT_FIELD_MAPPING,
  submitted_payment: SUBMITTED_PAYMENT_FIELD_MAPPING,
  seda_registration: SEDA_REGISTRATION_FIELD_MAPPING,
  invoice_item: INVOICE_ITEM_FIELD_MAPPING,
  invoice_template: INVOICE_TEMPLATE_FIELD_MAPPING,
};

export const ALL_MAPPING_FUNCTIONS = {
  invoice: mapInvoiceFields,
  customer: mapCustomerFields,
  agent: mapAgentFields,
  user: mapUserFields,
  payment: mapPaymentFields,
  submitted_payment: mapSubmittedPaymentFields,
  seda_registration: mapSedaRegistrationFields,
  invoice_item: mapInvoiceItemFields,
  invoice_template: null, // No Bubble object found
};

// ============================================================================
// RELATIONAL EXTRACTION FUNCTIONS
// ============================================================================

/**
 * Extract all bubble_ids of related records from an invoice
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
