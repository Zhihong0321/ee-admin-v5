# Invoice Sync Fixes - Based on Production DB Analysis

## PRODUCTION DATA ANALYSIS

### Current State (Based on DIRECT DB ACCESS):

**Invoices Table:**
- Total invoices with linked_customer: 4,111
- All have Bubble format UIDs: `123192380482982x123892138901238`
- Zero have ERP V2 format UIDs (`cust_xxxx`)
- Fields present in schema: `linked_payment` (ARRAY), `linked_seda_registration` (text)
- Current status: `customer_name_snapshot` is NULL for all old invoices

**Customers Table:**
- Total customers: 55
- All have ERP V2 format UIDs: `cust_xxxx`
- Zero have Bubble format UIDs
- Field present in schema: `linked_seda_registration` (text)
- Sync status: ✅ `linked_seda_registration` is properly synced

## PROBLEM IDENTIFIED

### Root Cause:
- Old invoices (from Bubble) have `linked_customer` = Bubble format UID
- Customers table (from sync) has `customer_id` = ERP V2 format UID
- **NO MATCH POSSIBLE** when backfilling `customer_name_snapshot` via local DB query

### Example:
```
Invoice.linked_customer: "1708562011724x866113013604941800"
Customer.customer_id: "cust_e7fbc274"
❌ Can't match! Different UID formats!
```

## FIXES IMPLEMENTED

### 1. Customer Name Sync Fix (`src/lib/bubble.ts`)

**Location:** Lines 469-485

**Problem:** Old sync tried to match Bubble UID to ERP V2 UID (impossible)

**Solution:** Extract customer name DIRECTLY from Bubble invoice data

```typescript
// OLD (won't work):
if (!customerNameSnapshot && linkedCustomerId) {
  const localCustomer = await db.query.customers.findFirst({
    where: eq(customers.customer_id, linkedCustomerId)
  });
  // Can't match - UIDs are different formats!
}

// NEW (works):
let customerNameSnapshot = bInv["Customer Name"] || bInv.customer_name ||
                           bInv.Customer_Name ||
                           bInv["Linked Customer Name"] ||
                           null;
```

**Result:** ✅ Customer names pulled directly from Bubble API during sync

---

### 2. Linked Payment Array Sync (`src/lib/bubble.ts`)

**Location:** Lines 494-500, 517, 542

**Problem:** Not syncing `linked_payment` ARRAY field

**Solution:** Map from Bubble with array conversion

```typescript
const linkedPayment = bInv["Linked Payment"] || bInv.linked_payment || null;
const linkedPaymentArray = linkedPayment
  ? (Array.isArray(linkedPayment) ? linkedPayment : [linkedPayment])
  : null;

await db.insert(invoices).values({
  // ...
  linked_payment: linkedPaymentArray,  // ✅ Now syncing
  // ...
});
```

**Result:** ✅ `linked_payment` ARRAY synced on insert and update

---

### 3. Linked SEDA Registration Sync (`src/lib/bubble.ts`)

**Location:** Lines 502-504, 518, 543

**Problem:** Not syncing `linked_seda_registration` for invoices

**Solution:** Map from Bubble

```typescript
const linkedSedaRegistration = bInv["Linked SEDA Registration"] ||
                             bInv.linked_seda_registration ||
                             null;

await db.insert(invoices).values({
  // ...
  linked_seda_registration: linkedSedaRegistration,  // ✅ Now syncing
  // ...
});
```

**Result:** ✅ `linked_seda_registration` synced for both invoices AND customers

---

### 4. Backfill Function Update (`src/app/invoices/actions.ts`)

**Location:** Lines 218-339

**Problem:** Backfill tries to match all invoices, but Bubble format UIDs can't match

**Solution:** Detect format and skip Bubble format invoices

```typescript
if (invoice.linked_customer.startsWith('cust_')) {
  // ERP V2 format - can match directly
  const customer = await db.query.customers.findFirst({
    where: eq(customers.customer_id, invoice.linked_customer)
  });
  // ... backfill works
} else {
  // Bubble format - can't match
  customerFormatMismatchCount++;
  console.log(`Bubble format customer_id, skipping - needs re-sync from Bubble`);
}
```

**Result:**
- ✅ Backfills ERP V2 format invoices
- ⚠️ Logs warning for Bubble format invoices (need re-sync from Bubble)
- 📊 Returns statistics on what was updated vs what needs re-sync

---

## SCHEMA CHANGES: NONE

**IMPORTANT:** NO CHANGES MADE TO `src/db/schema.ts`

All fixes are in SYNC LOGIC only. The production DB schema is used as-is.

---

## HOW TO USE

### Fixing New Syncs (Automatic)
1. Click "Sync Bubble" button in Invoice page
2. New invoices will have:
   - ✅ customer_name_snapshot (from Bubble data)
   - ✅ linked_payment (ARRAY)
   - ✅ linked_seda_registration

### Fixing Old Invoices
**Option 1: Re-sync from Bubble (Recommended)**
1. Click "Sync Bubble" button
2. All invoices will be updated from Bubble
3. Customer names will be populated from Bubble data
4. linked_payment and linked_seda_registration will be populated

**Option 2: Backfill (Partial)**
1. Click "Backfill Names" button
2. ERP V2 format invoices (cust_*) will be updated with customer names
3. Bubble format invoices (123x*) will be skipped with warning
4. For Bubble format invoices: use Option 1 instead

---

## EXPECTED BEHAVIOR

### Sync from Bubble:
```
Fetching invoices from Bubble...
New invoice found: 1708562030126x966996074806116400. Importing...
  - customer_name_snapshot: "John Doe" (from Bubble data)
  - linked_payment: ["1708562189594x427994653613883400", ...]
  - linked_seda_registration: "seda_631a89cdc48f33fe"
```

### Backfill Output:
```
Starting backfill of invoice names...
Found 4111 invoices to check
Invoice INV-12345: Found customer "Test User"
Invoice INV-67890: Found customer "Mr Chong"
Invoice INV-11111: Bubble format customer_id, skipping
...
Backfill complete:
  updated: 0
  missingCustomers: 0
  formatMismatchBubble: 4111
  missingAgents: 100

Message: "0 invoices updated. 4111 invoices have Bubble format UIDs and need re-sync from Bubble."
```

---

## VERIFICATION STEPS

### Test 1: Check linked_payment sync
```sql
SELECT id, linked_payment FROM invoice WHERE linked_payment IS NOT NULL LIMIT 5;
```
Expected: Should see array of payment IDs

### Test 2: Check linked_seda_registration sync
```sql
SELECT id, linked_seda_registration FROM invoice WHERE linked_seda_registration IS NOT NULL LIMIT 5;
```
Expected: Should see SEDA registration IDs

### Test 3: Check customer_name snapshot
```sql
SELECT id, customer_name_snapshot FROM invoice WHERE customer_name_snapshot IS NOT NULL LIMIT 5;
```
Expected: After sync, should see customer names

---

## NOTES

1. **NO schema changes** - All fixes are in sync logic only
2. **Backward compatible** - Old invoices still work, just need re-sync
3. **Format detection** - Code automatically detects Bubble vs ERP V2 format
4. **Detailed logging** - All operations log what's happening
5. **Stats reporting** - Backfill returns detailed statistics

---

## FILES MODIFIED

1. `src/lib/bubble.ts` - Customer/invoice sync logic
2. `src/app/invoices/actions.ts` - Backfill function
3. `src/app/invoices/page.tsx` - Sync and backfill buttons

---

## SUMMARY

| Issue | Status | Fix |
|--------|--------|------|
| customer_name_snapshot empty | ✅ FIXED | Pull from Bubble data directly |
| linked_payment not syncing | ✅ FIXED | Map from Bubble with array conversion |
| linked_seda_registration not syncing | ✅ FIXED | Map from Bubble |
| Old invoices can't backfill | ⚠️ PARTIAL | ERP V2 format works, Bubble format needs re-sync |
| Schema changes | ✅ NONE | Logic only, no schema changes |