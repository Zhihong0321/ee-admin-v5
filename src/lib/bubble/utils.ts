/**
 * ============================================================================
 * BUBBLE SYNC UTILITY FUNCTIONS
 * ============================================================================
 *
 * Utility functions for invoice total calculation and fallback logic.
 * These helpers preserve data integrity when Bubble data is incomplete.
 *
 * Functions:
 * - calculateTotalFromInvoiceItems: Calculate total from linked invoice items
 * - getInvoiceTotalWithFallback: Multi-level fallback for invoice totals
 *
 * File: src/lib/bubble/utils.ts
 */

import { db } from "@/lib/db";

/**
 * ============================================================================
 * FUNCTION: calculateTotalFromInvoiceItems
 * ============================================================================
 *
 * INTENT (What & Why):
 * Calculate invoice total_amount by summing up all linked invoice items.
 * Used as fallback when Bubble invoice.total_amount is null or missing.
 *
 * INPUTS:
 * @param linkedInvoiceItemIds - Array of invoice item bubble_id strings
 *
 * OUTPUTS:
 * @returns number | null - Sum of item amounts, or null if no items found
 *
 * EXECUTION ORDER (Step-by-step):
 * 1. Validate input (return null if empty array)
 * 2. Fetch all invoice items from database
 * 3. Filter to only items linked to this invoice
 * 4. Sum up all item.amount values
 * 5. Return total if > 0, else null
 *
 * DATA FLOW:
 * Invoice.items → invoice_items table → amount field → Sum
 *
 * EDGE CASES:
 * - Empty items array → Returns null
 * - Items exist but have no amount → Returns 0 (treated as null)
 * - Items not found in DB → Returns null (graceful degradation)
 *
 * SIDE EFFECTS:
 * - Reads from invoice_items table
 * - No database writes
 *
 * DEPENDENCIES:
 * - Requires: db.query.invoice_items
 * - Used by: getInvoiceTotalWithFallback, payment sync operations
 *
 * PERFORMANCE NOTES:
 * - Fetches ALL invoice items, filters in memory
 * - Could be optimized with direct DB query, but < 10k items so acceptable
 */
export async function calculateTotalFromInvoiceItems(linkedInvoiceItemIds: string[]): Promise<number | null> {
  if (!linkedInvoiceItemIds || linkedInvoiceItemIds.length === 0) {
    return null;
  }

  try {
    // Fetch all invoice items and filter in memory
    // (Drizzle doesn't have easy array contains syntax)
    const { invoice_items: invoiceItems } = await import('@/db/schema');
    const allItems = await db.query.invoice_items.findMany();

    // Filter to only items linked to this invoice
    const matchedItems = allItems.filter(item =>
      linkedInvoiceItemIds.includes(item.bubble_id)
    );

    if (matchedItems.length === 0) {
      return null;
    }

    // Sum up all item amounts
    let total = 0;
    for (const item of matchedItems) {
      if (item.amount) {
        total += parseFloat(item.amount.toString());
      }
    }

    return total > 0 ? total : null;
  } catch (err) {
    console.error('Error calculating total from invoice items:', err);
    return null;
  }
}

/**
 * ============================================================================
 * FUNCTION: getInvoiceTotalWithFallback
 * ============================================================================
 *
 * INTENT (What & Why):
 * Get invoice total_amount with intelligent fallback logic to preserve data.
 * Prevents data loss when Bubble total_amount is null but local value exists.
 *
 * FALLBACK PRIORITY (Multi-level):
 * 1. Use Bubble value if not null (source of truth)
 * 2. Calculate from linked_invoice_items if Bubble is null
 * 3. Preserve existing local value if Bubble is null and no items
 * 4. Only set to null if all above fail (will show as 0 in UI)
 *
 * INPUTS:
 * @param bubbleTotal - Total amount from Bubble (may be null)
 * @param linkedInvoiceItemIds - Array of linked invoice item IDs
 * @param existingLocalTotal - Current total_amount in local database
 *
 * OUTPUTS:
 * @returns string | null - Best available total as string, or null
 *
 * EXECUTION ORDER (Step-by-step):
 * 1. Priority 1: Check if Bubble has valid value → Return it
 * 2. Priority 2: Calculate from invoice items → Return if > 0
 * 3. Priority 3: Preserve existing local value → Return it
 * 4. Priority 4: Last resort → Return null
 *
 * WHY THIS LOGIC?
 * - Bubble is source of truth when data exists
 * - Invoice items are backup calculation method
 * - Local value preserves data during sync interruptions
 * - Null is better than 0 for "unknown" (distinguishable from "free")
 *
 * DATA PRESERVATION EXAMPLE:
 * ```
 * Bubble: null (not set in Bubble)
 * Items: [] (no items linked)
 * Local: "5000.00" (previously synced)
 * Result: "5000.00" (preserved local value!)
 * ```
 *
 * EDGE CASES:
 * - All sources null → Returns null
 * - Bubble is "0" → Returns "0" (legitimate zero value)
 * - Local is null → Checks items, then returns null
 * - Items sum to 0 → Returns null (not "0", to distinguish from free)
 *
 * SIDE EFFECTS:
 * - Reads from invoice_items table (via calculateTotalFromInvoiceItems)
 * - No database writes
 *
 * DEPENDENCIES:
 * - Requires: calculateTotalFromInvoiceItems()
 * - Used by: Invoice sync operations, payment sync operations
 *
 * DATA INTEGRITY:
 * This function is CRITICAL for preventing data loss during sync.
 * Without this logic, invoice totals would be nulled whenever Bubble
 * data is incomplete, losing previously synced values.
 */
export async function getInvoiceTotalWithFallback(
  bubbleTotal: any,
  linkedInvoiceItemIds: string[],
  existingLocalTotal?: any
): Promise<string | null> {
  // Priority 1: Bubble has a valid value
  if (bubbleTotal !== null && bubbleTotal !== undefined && bubbleTotal !== '') {
    return bubbleTotal.toString();
  }

  // Priority 2: Calculate from invoice items
  if (linkedInvoiceItemIds && linkedInvoiceItemIds.length > 0) {
    const calculatedTotal = await calculateTotalFromInvoiceItems(linkedInvoiceItemIds);
    if (calculatedTotal !== null && calculatedTotal > 0) {
      return calculatedTotal.toString();
    }
  }

  // Priority 3: Preserve existing local value
  if (existingLocalTotal !== null && existingLocalTotal !== undefined && existingLocalTotal !== '') {
    return existingLocalTotal.toString();
  }

  // Priority 4: Last resort - null (will show as 0 in UI, but distinguishable)
  return null;
}
