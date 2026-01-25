/**
 * ============================================================================
 * BUBBLE SYNC TYPE DEFINITIONS
 * ============================================================================
 *
 * Central type definitions for all Bubble API interactions.
 * Modify these types when Bubble schema changes.
 *
 * Types defined:
 * - BubbleInvoiceRaw: Raw invoice record from Bubble API
 * - BubbleCustomerRaw: Raw customer profile from Bubble API
 * - BubbleAgentRaw: Raw agent record from Bubble API
 * - BubblePaymentRaw: Raw payment record from Bubble API
 * - BubbleSEDA Raw: Raw SEDA registration from Bubble API
 * - InvoiceSyncDecision: Sync decision result for single invoice
 * - SyncProgressUpdate: Progress update structure for real-time tracking
 * - SyncResult: Standard result type for sync operations
 *
 * File: src/lib/bubble/types.ts
 */

/**
 * Raw Invoice record from Bubble API
 * Represents the 'invoice' object type in eternalgy.bubbleapps.io
 *
 * IMPORTANT: Bubble API uses Capitalized_Space_Separated field names.
 * This type definition MUST match the actual API response structure.
 */
export interface BubbleInvoiceRaw {
  _id: string;                       // Bubble unique identifier
  "Modified Date": string;            // ISO timestamp, API limitation: cannot constrain
  "Created Date": string;

  // Invoice identifiers
  "Invoice ID"?: string;              // Internal invoice ID
  "Invoice Number"?: string;          // Invoice number (e.g., "INV-001")
  "Number"?: string;                  // Alias for Invoice Number

  // Related records (Capitalized with spaces - Bubble API convention)
  "Linked Customer"?: string;         // Customer_Profile._id
  "Linked Agent"?: string;            // Agent._id
  "Linked Payment"?: string[];        // Array of Payment._id
  "Linked SEDA Registration"?: string; // SEDA_Registration._id
  "linked_invoice_item"?: string[];   // Array of invoice item IDs

  // Amounts
  "Amount"?: number | string;         // Base amount
  "Total Amount"?: number | string;   // Total with adjustments

  // Status and dates
  "Status"?: string;                  // Invoice status (draft, DEPOSIT, FULLY PAID, etc.)
  "Invoice Date"?: string;            // Invoice date (for accounting)

  // Creator tracking
  "Created By"?: string;              // User._id who created invoice

  // Fallback/alternative field names (also present in API)
  invoice_id?: string;
  invoice_number?: string;
  linked_customer?: string;
  linked_agent?: string;
  linked_payment?: string[];
  linked_seda_registration?: string;
  total_amount?: number | string;
  status?: string;
  created_by?: string;
  created_at?: string;
  invoice_date?: string;
  items?: any[];                      // Invoice line items (array of objects)
  notes?: string;                     // Invoice notes
  Address?: string;                   // Invoice address
  percent_of_total_amount?: number;   // Payment percentage (calculated field)

  // Index signature for dynamic field access
  [key: string]: any;
}

/**
 * Raw Customer Profile record from Bubble API
 */
export interface BubbleCustomerRaw {
  _id: string;
  "Modified Date": string;
  "Created Date": string;
  "Name"?: string;
  "email"?: string;
  "contact"?: string;
  "address"?: string;
  "customer_id"?: string;
  "last_synced_at"?: string;
  // Add other fields as needed
}

/**
 * Raw Agent record from Bubble API
 */
export interface BubbleAgentRaw {
  _id: string;
  "Modified Date": string;
  "Created Date": string;
  "Name"?: string;
  "email"?: string;
  "Contact"?: string;
  "Agent Type"?: string;
  "Address"?: string;
  "bankin_account"?: string;
  "banker"?: string;
  // Add other fields as needed
}

/**
 * Raw Payment record from Bubble API
 */
export interface BubblePaymentRaw {
  _id: string;
  "Modified Date": string;
  "Created Date": string;
  "amount"?: number | string;
  "status"?: string;
  "payment_date"?: string;
  "payment_method"?: string;
  "attachment"?: string[];
  // Add other fields as needed
}

/**
 * Raw SEDA Registration record from Bubble API
 */
export interface BubbleSEDARaw {
  _id: string;
  "Modified Date": string;
  "Created Date": string;
  "seda_status"?: string;
  "linked_customer"?: string;
  "linked_invoice"?: string[];
  "customer_signature"?: string;
  "ic_copy_front"?: string;
  "ic_copy_back"?: string;
  "tnb_bill_1"?: string;
  "tnb_bill_2"?: string;
  "tnb_bill_3"?: string;
  "nem_cert"?: string;
  "mykad_pdf"?: string;
  "property_ownership_prove"?: string;
  "roof_images"?: string[];
  "site_images"?: string[];
  "drawing_pdf_system"?: string[];
  "drawing_system_actual"?: string[];
  "drawing_engineering_seda_pdf"?: string[];
  // Add other fields as needed
}

/**
 * Sync decision result for a single invoice
 * Used during sync to determine if invoice and/or relations need syncing
 */
export interface InvoiceSyncDecision {
  invoiceId: string;
  needsSync: boolean;
  reasons: ('invoice' | 'customer' | 'agent' | 'payment' | 'seda' | 'template' | 'user' | 'submitted_payment')[];
  invoiceTimestamp: Date;
  localTimestamp?: Date;
}

/**
 * Progress update structure for real-time sync tracking
 * Used by SSE endpoints to push progress to UI
 */
export interface SyncProgressUpdate {
  status: 'running' | 'completed' | 'error';
  category: string;
  details: string[];
  current: number;
  total: number;
  timestamp: Date;
}

/**
 * Standard result type for sync operations
 * All sync functions should return this structure
 */
export interface SyncResult {
  success: boolean;
  results?: {
    syncedInvoices?: number;
    syncedCustomers?: number;
    syncedAgents?: number;
    syncedUsers?: number;
    syncedPayments?: number;
    syncedSubmittedPayments?: number;
    syncedSedas?: number;
    syncedTemplates?: number;
    syncedItems?: number;
  };
  error?: string;
}

/**
 * IDs to sync collected from sync decision logic
 */
export interface IdsToSync {
  customers: Set<string>;
  agents: Set<string>;
  users: Set<string>;
  payments: Set<string>;
  submittedPayments: Set<string>;
  sedas: Set<string>;
  templates: Set<string>;
}

/**
 * Existing records from PostgreSQL for timestamp comparison
 */
export interface ExistingRecordsMap {
  invoices: Map<string, Date>;         // bubble_id -> updated_at
  customers: Map<string, Date>;        // customer_id -> last_synced_at
  agents: Map<string, Date>;           // bubble_id -> updated_at
  users: Map<string, Date>;            // bubble_id -> updated_at
  payments: Map<string, Date>;         // bubble_id -> updated_at
  submittedPayments: Map<string, Date>; // bubble_id -> updated_at
  sedas: Map<string, Date>;            // bubble_id -> updated_at
  templates: Map<string, Date>;        // bubble_id -> updated_at
}

/**
 * Field mapping configuration for entity type
 */
export interface FieldMappingConfig {
  [key: string]: string | ((value: any) => any);
}

/**
 * Bubble API constraint for fetching records
 */
export interface BubbleConstraint {
  key: string;
  constraint: 'equals' | 'contains' | 'greater than' | 'less than';
  value: any;
}

/**
 * Options for integrity sync operations
 */
export interface IntegritySyncOptions {
  force?: boolean;           // Skip timestamp check and force sync
  skipUsers?: boolean;       // Skip syncing users (faster)
  skipAgents?: boolean;      // Skip syncing agents (faster)
  syncSessionId?: string;    // Progress tracking session ID
  onProgress?: (step: string, message: string) => void;
  onBatchProgress?: (current: number, total: number, message: string) => void;
}

/**
 * Statistics from integrity sync operation
 */
export interface IntegritySyncStats {
  agent: number;
  customer: number;
  user: number;
  payments: number;
  submitted_payments: number;
  invoice_items: number;
  seda: number;
  invoice: number;
  template: number;
}
