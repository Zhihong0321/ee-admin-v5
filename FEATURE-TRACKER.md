# UNIMPLEMENTED FEATURES TRACKER

This file tracks intentional gaps in implementation. DO NOT randomly fix these without understanding the WHY.

## Format: `[FILE:LINE] Status - Description | Reason | Priority`

---

### [storage-actions.ts:110] BLOCKED - Handle array fields (roof_images, site_images)
- **File**: `src/app/manage-company/storage-actions.ts`
- **Line**: 110, 125
- **Description**: Array fields (roof_images, site_images, attachment) are not properly handled during file sync
- **Reason**: Bubble API returns arrays as comma-separated strings, needs parsing logic to convert to proper arrays
- **Impact**: Images not synced for these specific fields
- **Priority**: MEDIUM (affects company data completeness)
- **Notes**: Need to:
  1. Parse comma-separated strings into arrays
  2. Validate each URL
  3. Download files to correct storage paths
  4. Update database with proper array format

---

### [seda/route.ts:57] DEFERRED - Fetch payment_5percent from invoice/payments
- **File**: `src/app/api/seda/[bubble_id]/route.ts`
- **Line**: 57
- **Description**: SEDA API returns hardcoded `false` for `payment_5percent` field
- **Reason**: Requires join query on invoice and payments tables, performance concern for hot API path
- **Impact**: SEDA API consumers receive incorrect payment status
- **Priority**: LOW (nice-to-have for API consumers)
- **Notes**: Current workaround:
  ```typescript
  payment_5percent: false, // TODO: fetch from invoice/payments
  ```
  To implement:
  1. Query invoice by linked_invoice
  2. Calculate total payments from linked_payment array
  3. Check if payment >= 5% of total_amount
  4. Cache result to avoid repeated queries

---

### [bubble.ts:1032-1043] DISABLED - Invoice items sync logic
- **File**: `src/lib/bubble.ts`
- **Line**: 1032-1043
- **Description**: Invoice items sync code is commented out during debugging
- **Reason**: Causing sync failures, needs investigation before re-enabling
- **Impact**: Invoice line items not synced during full invoice sync
- **Priority**: HIGH (affects invoice data completeness)
- **Notes**: Separate endpoint `/api/sync/invoice-items` exists for dedicated sync

---

## Completed Features (Removed from Tracker)

- ~~[actions.ts] Split into domain-specific modules~~ → **COMPLETED** (2026-01-22)
- ~~[logger.ts] Add structured logging~~ → **COMPLETED** (2026-01-22)

---

## Feature Requests

### Add invoice item sync to main sync flow
- **Priority**: MEDIUM
- **Description**: Include invoice items in main sync instead of requiring separate sync
- **Impact**: Improves data completeness, reduces manual steps

### Add file migration progress tracking
- **Priority**: LOW
- **Description**: Show real-time progress for file migration operations
- **Impact**: Better UX for long-running migrations

---

## Notes

- This file should be updated when features are implemented or when new intentional gaps are discovered
- Each entry should include: file location, status, description, reason, impact, and priority
- High priority items should be addressed in next sprint
