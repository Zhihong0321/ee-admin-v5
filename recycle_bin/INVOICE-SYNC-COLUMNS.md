# Invoice Sync - Complete Column List

## Invoice Sync Fields (All 3 Sync Locations)

### ✅ NOW SYNCING (as of fix):

| Column | Bubble Field | PostgreSQL Type | Description |
|--------|--------------|-----------------|-------------|
| `bubble_id` | `_id` | text | Primary key from Bubble |
| `invoice_id` | `Invoice ID` or `invoice_id` | integer | Invoice ID number |
| `invoice_number` | `Invoice Number` or `invoice_number` | text | Human-readable invoice number |
| **`linked_invoice_item`** | **`linked_invoice_item`** | **text[]** | **⭐ ARRAY of item bubble_ids (CRITICAL - WAS MISSING!)** |
| `linked_customer` | `Linked Customer` | text | Customer bubble_id |
| `linked_agent` | `Linked Agent` | text | Agent bubble_id |
| `linked_payment` | `Linked Payment` | text[] | ARRAY of payment bubble_ids |
| `linked_seda_registration` | `Linked SEDA Registration` | text | SEDA registration bubble_id |
| `amount` | `Amount` | numeric | Invoice amount (legacy) |
| `total_amount` | `Total Amount` | numeric | Final billing amount |
| `status` | `Status` | text | Draft, payment_submitted, etc |
| `invoice_date` | `Invoice Date` | timestamp | Invoice date |
| `created_at` | `Created Date` | timestamp | Creation timestamp |
| `created_by` | `Created By` | text | User who created |
| `updated_at` | `Modified Date` | timestamp | Last modification timestamp |
| `last_synced_at` | *computed* | timestamp | Last sync time (syncCompleteInvoicePackage only) |

### ❌ NOT SYNCING (Missing from sync code):

| Column | PostgreSQL Type | Notes |
|--------|-----------------|-------|
| `customer_id` | integer | Not synced - derived from linked_customer |
| `agent_id` | text | Not synced - derived from linked_agent |
| `subtotal` | numeric | Not synced - not in Bubble |
| `sst_rate` | numeric | Not synced - not in Bubble |
| `sst_amount` | numeric | Not synced - not in Bubble |
| `discount_amount` | numeric | Not synced - not in Bubble |
| `voucher_amount` | numeric | Not synced - not in Bubble |
| `percent_of_total_amount` | numeric | Not synced - not in Bubble |
| `due_date` | timestamp | Not synced - not in Bubble |
| `is_latest` | boolean | Not synced - computed field |
| `share_token` | text | Not synced - generated on demand |
| `customer_name_snapshot` | text | Not synced - computed field |
| `customer_address_snapshot` | text | Not synced - computed field |
| `customer_phone_snapshot` | text | Not synced - computed field |
| `customer_email_snapshot` | text | Not synced - computed field |
| `agent_name_snapshot` | text | Not synced - computed field |
| `dealercode` | text | Not synced - legacy |
| `approval_status` | text | Not synced - legacy |
| `case_status` | text | Not synced - legacy |
| `template_id` | text | Not synced - separate template table |

---

## Sync Locations Fixed

### 1. syncCompleteInvoicePackage() - Line 219-237
```typescript
await syncTable('invoice', invoices, invoices.bubble_id, (b) => ({
  ...
  linked_invoice_item: b["linked_invoice_item"] || b.linked_invoice_item || null, // ✅ ADDED
  ...
}))
```

### 2. syncInvoicePackageWithRelations() - Line 988-1003
```typescript
const vals = {
  ...
  linked_invoice_item: inv["linked_invoice_item"] || inv.linked_invoice_item || null, // ✅ ADDED
  ...
};
```

### 3. syncCompleteInvoicePackage() - Line 1398-1414
```typescript
const vals = {
  ...
  linked_invoice_item: inv["linked_invoice_item"] || inv.linked_invoice_item || null, // ✅ ADDED
  ...
};
```

---

## What This Fix Does

Before this fix:
- `invoice.linked_invoice_item` was **always NULL or empty array** in PostgreSQL
- Sales Agent App couldn't find invoice items
- Invoice PDFs had no line items

After this fix:
- `invoice.linked_invoice_item` is **properly synced** from Bubble
- Contains array of item bubble_ids like: `['item_xxx', 'item_yyy']`
- Sales Agent App can query: `WHERE invoice_new_items.bubble_id = ANY(invoice.linked_invoice_item)`
- All 15,957 items with proper links will now be accessible

---

## Next Steps

1. **Re-sync your invoices** from Jan 2026 to populate `linked_invoice_item`
2. **Run sync from sync page** → "Full Invoice Sync" with date range 2026-01-01 to 2026-01-18
3. **Verify items appear** in Sales Agent App
