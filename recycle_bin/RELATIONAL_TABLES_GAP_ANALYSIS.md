# CRITICAL: RELATIONAL TABLES NOT AUDITED

**Issue**: You caught me focusing only on `invoice` table
**Status**: 🔴 CRITICAL GAPS FOUND in ALL relational tables

---

## EXECUTIVE SUMMARY

```
┌────────────────────────────────────────────────────────────────┐
│  DATA LOSS ACROSS ALL INVOICE-RELATIONAL TABLES               │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  Table                Bubble Fields    Synced      Lost        │
│  ────────────────────────────────────────────────────────────  │
│  seda_registration    69 fields        16 (23%)    53 (77%) 🔴│
│  payment              25 fields        9  (36%)    16 (64%) 🔴│
│  agent                26 fields        14 (54%)    12 (46%) 🟠│
│  Customer_Profile     19 fields        11 (58%)     8 (42%) 🟠│
│  user                 16 fields        11 (69%)     5 (31%) 🟠│
│  submit_payment       18 fields        14 (78%)     4 (22%) 🟡│
│                                                                │
│  AVERAGE SYNC COVERAGE: 48%                                   │
│  AVERAGE DATA LOSS: 52%                                       │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## DETAILED BREAKDOWN

### 1. SEDA Registration - 🔴 WORST OFFENDER

```
Postgres Columns: 69
Bubble Fields: 16
Fields NOT Synced: 53 (77%!)
```

**Bubble Fields (16):**
```
1. CITY
2. Modified Date
3. _id
4. Project Price
5. Created By
6. ??SunPeak Hours
7. Redex-Status
8. Agent
9. Linked Customer
10. Roof Images
11. Reg Status
12. System Size in FORM kWp
13. Created Date
14. System Size
15. Drawing (SYSTEM) Submitted
16. STATE
```

**Postgres Has BUT Not Synced (53 fields):**
```
From schema.ts line 163-232:
• nem_application_no
• nem_type
• phase_type
• tnb_account_no
• property_ownership_prove
• inverter_serial_no
• tnb_meter_install_date
• tnb_meter_status
• first_completion_date
• e_contact_mykad
• mykad_pdf
• e_email
• redex_remark
• site_images (array)
• company_registration_no
• drawing_system_actual (array)
• drawing_engineering_seda_pdf (array)
• check_tnb_bill_and_meter_image
• check_mykad
• check_ownership
• check_fill_in_detail
• ... 30+ more!
```

### 2. Payment Table - 🔴 BAD

```
Postgres Columns: 25
Bubble Fields: 9
Fields NOT Synced: 16 (64%)
```

**Bubble Fields (9):**
```
Created Date, Remark, Amount, Linked Agent, Created By,
Payment Date, Payment Method, _id, Modified Date
```

**Current Sync (bubble.ts:263-275) ONLY Maps:**
```typescript
{
  amount: payment.Amount?.toString(),
  payment_date: payment["Payment Date"],
  payment_method: payment["Payment Method"],
  remark: payment.Remark,
  linked_agent: payment["Linked Agent"],
  linked_customer: payment["Linked Customer"],
  linked_invoice: payment["Linked Invoice"],
  created_by: payment["Created By"],
  created_date: payment["Created Date"],
  modified_date: payment["Modified Date"],
  last_synced_at: new Date()
}
```

**Missing Fields NOT Synced:**
```
• issuer_bank
• epp_type
• epp_month
• bank_charges
• payment_index
• terminal
• attachment (array)
• verified_by
• edit_history
• ... and more
```

### 3. Agent Table - 🟠 MEDIUM GAP

```
Postgres Columns: 26
Bubble Fields: 14
Fields NOT Synced: 12 (46%)
```

**Bubble Fields (14):**
```
Name, Slug, Modified Date, Contact, Agent Type, Annual Collection,
Created Date, Linked User Login, Intro Youtube, Commission,
TREE SEED, Last Update Annual Sales, _id, Current Annual Sales
```

**Current Sync (bubble.ts:195-199) ONLY Maps:**
```typescript
{
  name: agent.Name,
  email: agent.email,
  contact: agent.Contact,
  agent_type: agent["Agent Type"],
  address: agent.Address,
  bankin_account: agent.bankin_account,
  banker: agent.banker,
  updated_at: new Date(agent["Modified Date"]),
  last_synced_at: new Date()
}
```

**Missing Fields:**
```
• Slug
• Annual Collection
• Linked User Login
• Intro Youtube
• Commission
• TREE SEED
• Last Update Annual Sales
• Current Annual Sales
```

### 4. Customer Profile - 🟠 MEDIUM GAP

```
Postgres Columns: 19
Bubble Fields: 11
Fields NOT Synced: 8 (42%)
```

**Current Sync Uses Wrong Name:**
```typescript
// bubble.ts:210 - Uses "Customer_Profile" ✅
await syncTable('Customer_Profile', customers, ...)

// But audit-relational-tables.js used "customer" ❌ (404)
```

**Missing Fields:**
```
• linked_seda_registration
• linked_old_customer
• notes
• version
• updated_by
• created_by
```

### 5. User Table - 🟠 MEDIUM GAP

```
Postgres Columns: 16
Bubble Fields: 11
Fields NOT Synced: 5 (31%)
```

**Missing Fields:**
```
• check in report today  (weird name, but exists in Bubble!)
```

### 6. Invoice Item - 🟡 SMALL GAP

```
Postgres Columns: 20
Bubble Fields: 9 (if we find correct name)
Fields NOT Synced: 11 (55%)
```

**Problem:** Can't find Bubble object!
```
❌ Tried "invoice_new_item" → 404
❌ Tried "invoice_item" → 404
Need to find correct Bubble name!
```

### 7. Invoice Template - ❌ NOT FOUND

```
Postgres Columns: 20
Bubble Fields: ???
Can't find the Bubble object!
```

---

## ROOT CAUSE

All sync functions use **PARTIAL MAPPINGS**:

```typescript
// bubble.ts:219-237 - INVOICE (15/39 fields = 38%)
await syncTable('invoice', invoices, invoices.bubble_id, (b) => ({
  invoice_id: b["Invoice ID"],
  invoice_number: b["Invoice Number"],
  // ... only 15 fields mapped!
}));

// bubble.ts:240-247 - SEDA (8/69 fields = 11%!)
await syncTable('seda_registration', sedaRegistration, ... (b) => ({
  state: b.State,
  city: b.City,
  agent: b.Agent,
  // ... only 8 fields mapped!
}));

// EVERY sync has the same problem!
```

---

## IMPACT

When you sync:
1. ✅ Mapped fields update correctly
2. ❌ Unmapped fields are **NULLIFIED** (set to NULL)
3. ❌ Data is **PERMANENTLY LOST**

This happens because `onConflictDoUpdate` with partial data:

```typescript
await db.insert(table).values(mappedData)
  .onConflictDoUpdate({
    target: table.bubble_id,
    set: mappedData  // ❌ Only includes mapped fields!
  });
```

**Result**: Any field NOT in `mappedData` gets set to NULL!

---

## WHAT NEEDS TO HAPPEN

### Phase 1A Revised: Complete All Table Mappings

For EACH table:
1. ✅ Get correct Bubble object name
2. ✅ Fetch ALL Bubble fields
3. ✅ Get ALL Postgres column names
4. ✅ Create complete mapping
5. ✅ Verify column names match (no more "first_payment" vs "1st_payment" bugs!)
6. ✅ Handle data types correctly

### Priority Order:

1. **seda_registration** (CRITICAL - 77% data loss)
2. **payment** (CRITICAL - 64% data loss)
3. **invoice** (already done - 38% data loss)
4. **agent** (MEDIUM - 46% data loss)
5. **Customer_Profile** (MEDIUM - 42% data loss)
6. **user** (MEDIUM - 31% data loss)
7. **submit_payment** (LOW - 22% data loss)
8. **invoice_item** (UNKNOWN - can't find Bubble object)
9. **invoice_template** (UNKNOWN - can't find Bubble object)

---

## NEXT STEPS

I need to:
1. Create complete field mappings for ALL tables
2. Verify every column name against actual Postgres schema
3. Find correct Bubble object names for invoice_item and invoice_template
4. Build mapping functions for each table

**Should I proceed with auditing ALL tables and creating complete mappings?**

This will take time but it's **ESSENTIAL** before any sync can be considered safe.
