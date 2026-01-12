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

// Legacy Invoice Table
export const invoices = pgTable('invoice', {
  id: serial('id').primaryKey(),
  invoice_id: integer('invoice_id'),
  amount: numeric('amount'),
  invoice_date: timestamp('invoice_date'),
  linked_customer: text('linked_customer'),
  linked_agent: text('linked_agent'), // This links to agents.bubble_id
  dealercode: text('dealercode'),
  approval_status: text('approval_status'),
  created_at: timestamp('created_at'),
});

// New Invoice Table
export const invoices_new = pgTable('invoice_new', {
  id: serial('id').primaryKey(),
  invoice_number: text('invoice_number'),
  customer_id: integer('customer_id'),
  agent_id: text('agent_id'), // This will link to agents.bubble_id or id
  total_amount: numeric('total_amount'),
  invoice_date: text('invoice_date'),
  customer_name_snapshot: text('customer_name_snapshot'),
  agent_name_snapshot: text('agent_name_snapshot'),
  status: text('status'),
  created_at: timestamp('created_at'),
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
