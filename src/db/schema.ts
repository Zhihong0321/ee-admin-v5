import { pgTable, serial, text, integer, timestamp, numeric, boolean, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

// Agent Table
export const agents = pgTable('agent', {
  id: serial('id').primaryKey(),
  bubble_id: text('bubble_id'),
  name: text('name'),
  email: text('email'),
  contact: text('contact'),
  agent_type: text('agent_type'),
  address: text('address'),
  bankin_account: text('bankin_account'),
  banker: text('banker'),
  ic_front: text('ic_front'),  // Agent employee IC front (already exists in Postgres!)
  ic_back: text('ic_back'),    // Agent employee IC back (already exists in Postgres!)
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
  last_synced_at: timestamp('last_synced_at'),
});

// User Table
export const users = pgTable('user', {
  id: serial('id').primaryKey(),
  bubble_id: text('bubble_id'),
  email: text('email'), // Added to match Bubble authentication.email
  linked_agent_profile: text('linked_agent_profile'), // Links to agents.bubble_id
  agent_code: text('agent_code'),
  dealership: text('dealership'),
  profile_picture: text('profile_picture'),
  user_signed_up: boolean('user_signed_up'),
  access_level: text('access_level').array(),
  created_date: timestamp('created_date'),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
  last_synced_at: timestamp('last_synced_at'),
});

export const usersRelations = relations(users, ({ one }) => ({
  agent: one(agents, {
    fields: [users.linked_agent_profile],
    references: [agents.bubble_id],
  }),
}));

export const agentsRelations = relations(agents, ({ many }) => ({
  users: many(users),
}));

// Consolidated Invoice Table
export const invoices = pgTable('invoice', {
  id: serial('id').primaryKey(),
  bubble_id: text('bubble_id'),
  invoice_id: integer('invoice_id'),
  invoice_number: text('invoice_number'),
  total_amount: numeric('total_amount'),
  invoice_date: timestamp('invoice_date', { withTimezone: true }),
  status: text('status'),
  is_latest: boolean('is_latest').default(true),
  share_token: text('share_token'),
  linked_invoice_item: text('linked_invoice_item').array(), // ARRAY of invoice item bubble_ids

  // Linked records (Bubble relationships)
  linked_customer: text('linked_customer'), // Customer bubble_id
  linked_agent: text('linked_agent'), // Agent bubble_id
  linked_payment: text('linked_payment').array(), // ARRAY of payment bubble_ids
  linked_seda_registration: text('linked_seda_registration'), // SEDA registration bubble_id

  // Calculated Fields (synced from Bubble)
  percent_of_total_amount: numeric('percent_of_total_amount'), // Payment percentage (0-100)
  paid: boolean('paid').default(false), // Whether invoice is fully paid
  full_payment_date: timestamp('full_payment_date', { withTimezone: true }), // Date when invoice was fully paid
  last_payment_date: timestamp('last_payment_date', { withTimezone: true }), // Date of last payment received

  // Legacy Columns (kept for backward compatibility)
  amount: numeric('amount'),
  dealercode: text('dealercode'),
  approval_status: text('approval_status'),
  case_status: text('case_status'),

  // Timestamps
  created_at: timestamp('created_at', { withTimezone: true }),
  updated_at: timestamp('updated_at', { withTimezone: true }),
  template_id: text('template_id'),
  created_by: text('created_by'),
});

// Snapshot Table
export const invoice_snapshots = pgTable('invoice_snapshot', {
  id: serial('id').primaryKey(),
  invoice_id: integer('invoice_id'),
  version: integer('version').notNull(),
  snapshot_data: text('snapshot_data'),
  created_at: timestamp('created_at', { withTimezone: true }),
  created_by: text('created_by'),
});

// Customer Table
export const customers = pgTable('customer', {
  id: serial('id').primaryKey(),
  customer_id: text('customer_id'),
  name: text('name'),
  email: text('email'),
  phone: text('phone'),
  address: text('address'),
  city: text('city'),
  state: text('state'),
  postcode: text('postcode'),
  ic_number: text('ic_number'),
  linked_seda_registration: text('linked_seda_registration'),
  linked_old_customer: text('linked_old_customer'),
  notes: text('notes'),
  version: integer('version').default(1),
  updated_by: text('updated_by'),
  created_by: text('created_by'),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
  last_synced_at: timestamp('last_synced_at'),
});

// Customer History Table (Temporal Archive)
export const customer_history = pgTable('customer_history', {
  history_id: serial('history_id').primaryKey(),
  customer_id: integer('customer_id'), // References the main customer.id
  name: text('name'),
  email: text('email'),
  phone: text('phone'),
  address: text('address'),
  city: text('city'),
  state: text('state'),
  postcode: text('postcode'),
  ic_number: text('ic_number'),
  notes: text('notes'),
  version: integer('version'),
  changed_by: text('changed_by'),
  changed_at: timestamp('changed_at').defaultNow(),
  change_operation: text('change_operation'), // 'UPDATE' or 'DELETE'
});

// Customer Snapshot Table - Automatic snapshots on UPDATE/DELETE
export const customer_snapshots = pgTable('customer_snapshot', {
  snapshot_id: serial('snapshot_id').primaryKey(),
  customer_id: integer('customer_id').references(() => customers.id, { onDelete: 'cascade' }).notNull(),
  // Snapshot of all customer fields
  customer_id_text: text('customer_id_text'), // Original customer.customer_id
  name: text('name'),
  email: text('email'),
  phone: text('phone'),
  address: text('address'),
  city: text('city'),
  state: text('state'),
  postcode: text('postcode'),
  ic_number: text('ic_number'),
  linked_seda_registration: text('linked_seda_registration'),
  linked_old_customer: text('linked_old_customer'),
  notes: text('notes'),
  version: integer('version'),
  updated_by: text('updated_by'),
  created_by: text('created_by'),
  created_at: timestamp('created_at'),
  updated_at: timestamp('updated_at'),
  last_synced_at: timestamp('last_synced_at'),
  // Snapshot metadata
  snapshot_operation: text('snapshot_operation').notNull(), // 'UPDATE' or 'DELETE'
  snapshot_created_at: timestamp('snapshot_created_at').defaultNow().notNull(),
  snapshot_created_by: text('snapshot_created_by'),
});

// SEDA Registration Table
export const sedaRegistration = pgTable('seda_registration', {
  id: serial('id').primaryKey(),
  bubble_id: text('bubble_id'),
  last_synced_at: timestamp('last_synced_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }),
  updated_at: timestamp('updated_at', { withTimezone: true }),
  reg_status: text('reg_status'),
  created_by: text('created_by'),
  drawing_system_submitted: text('drawing_system_submitted'),
  modified_date: timestamp('modified_date', { withTimezone: true }),
  state: text('state'),
  redex_status: text('redex_status'),
  roof_images: text('roof_images').array(),
  sunpeak_hours: numeric('sunpeak_hours'),
  system_size_in_form_kwp: numeric('system_size_in_form_kwp'),
  created_date: timestamp('created_date', { withTimezone: true }),
  agent: text('agent'),
  project_price: numeric('project_price'),
  system_size: numeric('system_size'),
  city: text('city'),
  linked_customer: text('linked_customer'),
  inverter_kwac: numeric('inverter_kwac'),
  slug: text('slug'),
  estimated_monthly_saving: numeric('estimated_monthly_saving'),
  average_tnb: numeric('average_tnb'),
  price_category: text('price_category'),
  g_electric_folder_link: text('g_electric_folder_link'),
  g_roof_folder_link: text('g_roof_folder_link'),
  installation_address: text('installation_address'),
  linked_invoice: text('linked_invoice').array(),
  customer_signature: text('customer_signature'),
  email: text('email'),
  ic_copy_back: text('ic_copy_back'),
  ic_copy_front: text('ic_copy_front'),
  tnb_bill_3: text('tnb_bill_3'),
  tnb_bill_1: text('tnb_bill_1'),
  tnb_meter: text('tnb_meter'),
  e_contact_no: text('e_contact_no'),
  tnb_bill_2: text('tnb_bill_2'),
  drawing_pdf_system: text('drawing_pdf_system').array(),
  e_contact_name: text('e_contact_name'),
  seda_status: text('seda_status'),
  version: integer('version'),
  nem_application_no: text('nem_application_no'),
  e_contact_relationship: text('e_contact_relationship'),
  ic_no: text('ic_no'),
  request_drawing_date: timestamp('request_drawing_date', { withTimezone: true }),
  phase_type: text('phase_type'),
  special_remark: text('special_remark'),
  tnb_account_no: text('tnb_account_no'),
  nem_cert: text('nem_cert'),
  property_ownership_prove: text('property_ownership_prove'),
  inverter_serial_no: text('inverter_serial_no'),
  tnb_meter_install_date: timestamp('tnb_meter_install_date', { withTimezone: true }),
  tnb_meter_status: text('tnb_meter_status'),
  first_completion_date: timestamp('first_completion_date', { withTimezone: true }),
  e_contact_mykad: text('e_contact_mykad'),
  mykad_pdf: text('mykad_pdf'),
  nem_type: text('nem_type'),
  postcode: text('postcode'),
  e_email: text('e_email'),
  redex_remark: text('redex_remark'),
  site_images: text('site_images').array(),
  company_registration_no: text('company_registration_no'),
  drawing_system_actual: text('drawing_system_actual').array(),
  check_tnb_bill_and_meter_image: text('check_tnb_bill_and_meter_image'),
  check_mykad: text('check_mykad'),
  check_ownership: text('check_ownership'),
  check_fill_in_detail: text('check_fill_in_detail'),
  drawing_engineering_seda_pdf: text('drawing_engineering_seda_pdf').array(),
  // SEDA Profile Status (from SEDA Manager API)
  seda_profile_status: text('seda_profile_status'), // 'not_checked', 'not_found', 'profile_created', 'error'
  seda_profile_id: text('seda_profile_id'), // Profile ID from SEDA Manager
  seda_profile_checked_at: timestamp('seda_profile_checked_at', { withTimezone: true }), // Last check timestamp

  // Installation Address Components
  installation_address_1: text('installation_address_1'),
  installation_address_2: text('installation_address_2'),
  latitude: numeric('latitude'),
  longitude: numeric('longitude'),
});

// Invoice Template Table
export const invoice_templates = pgTable('invoice_template', {
  id: serial('id').primaryKey(),
  bubble_id: text('bubble_id'),
  template_name: text('template_name'),
  company_name: text('company_name'),
  company_address: text('company_address'),
  company_phone: text('company_phone'),
  company_email: text('company_email'),
  sst_registration_no: text('sst_registration_no'),
  bank_name: text('bank_name'),
  bank_account_no: text('bank_account_no'),
  bank_account_name: text('bank_account_name'),
  logo_url: text('logo_url'),
  terms_and_conditions: text('terms_and_conditions'),
  active: boolean('active').default(true),
  is_default: boolean('is_default').default(false),
  created_by: text('created_by'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  disclaimer: text('disclaimer'),
  apply_sst: boolean('apply_sst').default(false),
});

// Payment Table
export const payments = pgTable('payment', {
  id: serial('id').primaryKey(),
  bubble_id: text('bubble_id'),
  last_synced_at: timestamp('last_synced_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  modified_date: timestamp('modified_date', { withTimezone: true }),
  amount: numeric('amount'),
  created_date: timestamp('created_date', { withTimezone: true }),
  payment_date: timestamp('payment_date', { withTimezone: true }),
  payment_index: numeric('payment_index'),
  epp_month: numeric('epp_month'),
  bank_charges: numeric('bank_charges'),
  remark: text('remark'),
  payment_method_v2: text('payment_method_v2'),
  linked_invoice: text('linked_invoice'),
  linked_customer: text('linked_customer'),
  terminal: text('terminal'),
  attachment: text('attachment').array(),
  verified_by: text('verified_by'),
  payment_method: text('payment_method'),
  edit_history: text('edit_history'),
  log: text('log'),
  issuer_bank: text('issuer_bank'),
  created_by: text('created_by'),
  linked_agent: text('linked_agent'),
  epp_type: text('epp_type'),
  epp_cost: numeric('epp_cost'),
});

// Submitted Payment Table
export const submitted_payments = pgTable('submitted_payment', {
  id: serial('id').primaryKey(),
  bubble_id: text('bubble_id'),
  last_synced_at: timestamp('last_synced_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  created_date: timestamp('created_date', { withTimezone: true }),
  modified_date: timestamp('modified_date', { withTimezone: true }),
  payment_date: timestamp('payment_date', { withTimezone: true }),
  payment_index: numeric('payment_index'),
  epp_month: numeric('epp_month'),
  bank_charges: numeric('bank_charges'),
  amount: numeric('amount'),
  issuer_bank: text('issuer_bank'),
  payment_method_v2: text('payment_method_v2'),
  terminal: text('terminal'),
  epp_type: text('epp_type'),
  status: text('status'),
  payment_method: text('payment_method'),
  created_by: text('created_by'),
  linked_agent: text('linked_agent'),
  remark: text('remark'),
  linked_invoice: text('linked_invoice'),
  linked_customer: text('linked_customer'),
  attachment: text('attachment').array(),
  verified_by: text('verified_by'),
  edit_history: text('edit_history'),
  log: text('log'),
  epp_cost: numeric('epp_cost'),
});

// Invoice Items Table (CRITICAL: Was missing from schema!)
export const invoice_items = pgTable('invoice_item', {
  id: serial('id').primaryKey(),
  bubble_id: text('bubble_id').notNull(),
  last_synced_at: timestamp('last_synced_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  description: text('description'),
  modified_date: timestamp('modified_date', { withTimezone: true }),
  qty: numeric('qty'),
  amount: numeric('amount'),
  unit_price: numeric('unit_price'),
  created_by: text('created_by'),
  created_date: timestamp('created_date', { withTimezone: true }),
  is_a_package: boolean('is_a_package'),
  inv_item_type: text('inv_item_type'),
  linked_package: text('linked_package'),
  epp: numeric('epp'),
  linked_invoice: text('linked_invoice'),
  sort: numeric('sort'),
  linked_voucher: text('linked_voucher'),
  voucher_remark: text('voucher_remark'),
});

// Sync Progress Table - for tracking sync operation progress
export const sync_progress = pgTable('sync_progress', {
  id: serial('id').primaryKey(),
  session_id: text('session_id').notNull().unique(),
  status: text('status').notNull(), // 'running', 'completed', 'error'
  total_invoices: integer('total_invoices').notNull().default(0),
  synced_invoices: integer('synced_invoices').notNull().default(0),
  current_invoice_id: text('current_invoice_id'),
  date_from: text('date_from'),
  date_to: text('date_to'),
  error_message: text('error_message'),
  started_at: timestamp('started_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  completed_at: timestamp('completed_at', { withTimezone: true }),
});

// Schema Descriptions Table - for storing column descriptions for documentation
export const schema_descriptions = pgTable('schema_descriptions', {
  id: serial('id').primaryKey(),
  table_name: text('table_name').notNull(),
  column_name: text('column_name').notNull(),
  description: text('description').notNull(),
  data_type: text('data_type'),
  is_nullable: text('is_nullable'),
  column_default: text('column_default'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  updated_by: text('updated_by'),
});

// Invoice Edit History Table - Audit trail for all invoice edits
export const invoice_edit_history = pgTable('invoice_edit_history', {
  id: serial('id').primaryKey(),
  invoice_id: integer('invoice_id').references(() => invoices.id).notNull(),
  invoice_number: text('invoice_number'),
  entity_type: text('entity_type').notNull(),       // 'invoice_item' | 'invoice'
  entity_id: text('entity_id'),                      // bubble_id of edited entity
  action_type: text('action_type').notNull(),        // 'update' | 'create' | 'delete'
  changes: jsonb('changes').notNull(),               // [{ field, before, after }]
  edited_by_name: text('edited_by_name'),
  edited_by_phone: text('edited_by_phone'),
  edited_by_user_id: text('edited_by_user_id'),
  edited_by_role: text('edited_by_role'),
  edited_at: timestamp('edited_at', { withTimezone: true }).defaultNow(),
});

export const invoiceEditHistoryRelations = relations(invoice_edit_history, ({ one }) => ({
  invoice: one(invoices, {
    fields: [invoice_edit_history.invoice_id],
    references: [invoices.id],
  }),
}));
