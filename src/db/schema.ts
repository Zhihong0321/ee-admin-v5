import { pgTable, serial, text, integer, timestamp, numeric, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

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
  customer_id: integer('customer_id'),
  agent_id: text('agent_id'),
  total_amount: numeric('total_amount'),
  subtotal: numeric('subtotal'),
  sst_rate: numeric('sst_rate'),
  sst_amount: numeric('sst_amount'),
  discount_amount: numeric('discount_amount'),
  voucher_amount: numeric('voucher_amount'),
  invoice_date: timestamp('invoice_date', { withTimezone: true }),
  due_date: timestamp('due_date', { withTimezone: true }),
  status: text('status'),
  is_latest: boolean('is_latest').default(true),
  share_token: text('share_token'),
  
  // Snapshots
  customer_name_snapshot: text('customer_name_snapshot'),
  customer_address_snapshot: text('customer_address_snapshot'),
  customer_phone_snapshot: text('customer_phone_snapshot'),
  customer_email_snapshot: text('customer_email_snapshot'),
  agent_name_snapshot: text('agent_name_snapshot'),
  
  // Legacy Columns (kept for backward compatibility)
  amount: numeric('amount'),
  linked_customer: text('linked_customer'),
  linked_agent: text('linked_agent'), // This links to agents.bubble_id
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
  snapshot_data: sql`jsonb`.notNull(),
  created_at: timestamp('created_at', { withTimezone: true }),
  created_by: text('created_by'),
});

// New Invoice Item Table
export const invoice_new_items = pgTable('invoice_new_item', {
  id: serial('id').primaryKey(),
  bubble_id: text('bubble_id'),
  invoice_id: text('invoice_id'), // This links to invoices.bubble_id
  description: text('description'),
  qty: numeric('qty'),
  unit_price: numeric('unit_price'),
  total_price: numeric('total_price'),
  item_type: text('item_type'),
  sort_order: integer('sort_order'),
  created_at: timestamp('created_at', { withTimezone: true }),
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
  payment_index: integer('payment_index'),
  epp_month: integer('epp_month'),
  bank_charges: integer('bank_charges'),
  remark: text('remark'),
  payment_method_v2: text('payment_method_v2'),
  linked_invoice: text('linked_invoice'),
  linked_customer: text('linked_customer'),
  terminal: text('terminal'),
  attachment: text('attachment').array(),
  verified_by: text('verified_by'),
  payment_method: text('payment_method'),
  edit_history: text('edit_history'),
  issuer_bank: text('issuer_bank'),
  created_by: text('created_by'),
  linked_agent: text('linked_agent'),
  epp_type: text('epp_type'),
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
  payment_index: integer('payment_index'),
  epp_month: integer('epp_month'),
  bank_charges: integer('bank_charges'),
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
});
