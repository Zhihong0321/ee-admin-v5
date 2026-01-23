/**
 * ============================================================================
 * BUBBLE API FETCH HELPERS
 * ============================================================================
 *
 * Shared helper functions for fetching data from Bubble API.
 * These are used across multiple sync operations.
 *
 * Functions:
 * - fetchBubbleRecordByTypeName: Fetch single record by ID
 * - fetchBubbleRecordsWithConstraints: Fetch all records with optional filters
 * - fetchAllBubbleIds: Fetch all record IDs (memory efficient)
 *
 * File: src/lib/bubble/fetch-helpers.ts
 */

import { BUBBLE_BASE_URL, BUBBLE_API_HEADERS, getBubbleUrlWithCursor } from './client';

/**
 * ============================================================================
 * FUNCTION: fetchBubbleRecordByTypeName
 * ============================================================================
 *
 * INTENT (What & Why):
 * Fetch a single record from Bubble API by its type and ID.
 * Used to get individual records for relational sync operations.
 *
 * INPUTS:
 * @param typeName - Bubble object type (e.g., 'invoice', 'Customer_Profile')
 * @param bubbleId - Bubble unique identifier for the record
 *
 * OUTPUTS:
 * @returns Bubble record object (response.payload)
 * @throws Error if record not found (404) or API error occurs
 *
 * EXECUTION ORDER (Step-by-step):
 * 1. Construct URL: {BASE_URL}/{typeName}/{bubbleId}
 * 2. Send GET request with auth headers
 * 3. Check response status (throw if not OK)
 * 4. Parse JSON response
 * 5. Return response.payload (single record object)
 *
 * BUBBLE API RESPONSE FORMAT:
 * {
 *   response: {
 *     _id: "1647839483923x8394832",
 *     "Modified Date": "2026-01-19T10:30:00Z",
 *     ...other fields
 *   }
 * }
 *
 * EDGE CASES:
 * - Record not found (404) → Throws error
 * - Invalid bubbleId → Throws error
 * - Network error → Throws error
 *
 * SIDE EFFECTS:
 * - Makes HTTP GET request to Bubble API
 * - No database writes
 *
 * DEPENDENCIES:
 * - Requires: BUBBLE_BASE_URL, BUBBLE_API_HEADERS
 * - Used by: All sync operations that need individual records
 */
export async function fetchBubbleRecordByTypeName(typeName: string, bubbleId: string): Promise<any> {
  const response = await fetch(`${BUBBLE_BASE_URL}/${typeName}/${bubbleId}`, { headers: BUBBLE_API_HEADERS });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${typeName} ${bubbleId} from Bubble: ${response.statusText}`);
  }

  const data = await response.json();
  return data.response; // Single object
}

/**
 * ============================================================================
 * FUNCTION: fetchBubbleRecordsWithConstraints
 * ============================================================================
 *
 * INTENT (What & Why):
 * Fetch all records from a Bubble object type with optional filtering.
 * Uses cursor-based pagination to handle large result sets.
 *
 * BUBBLE API LIMITATION WORKAROUND:
 * Bubble API does NOT support constraints on system fields like 'Modified Date'.
 * For date filtering, fetch all records and filter locally.
 * Constraints only work on custom fields.
 *
 * INPUTS:
 * @param typeName - Bubble object type (e.g., 'invoice', 'Customer_Profile')
 * @param constraints - Optional Bubble API constraints array:
 *   [{ key: 'Status', constraint: 'equals', value: 'draft' }]
 *
 * OUTPUTS:
 * @returns Array of all matching Bubble records
 *
 * EXECUTION ORDER (Step-by-step):
 * 1. Initialize empty results array and cursor = 0
 * 2. Loop until no more records:
 *    a. Build URL with cursor and optional constraints
 *    b. Fetch records (limit=100 per page)
 *    c. Append records to results array
 *    d. Check remaining count (break if 0)
 *    e. Increment cursor by records.length
 * 3. Return all accumulated records
 *
 * PAGINATION STRATEGY:
 * - Bubble API uses cursor-based pagination
 * - Each page returns up to 100 records
 * - Response includes 'remaining' count for more pages
 *
 * CONSTRAINTS FORMAT:
 * [{
 *   key: "field_name",
 *   constraint: "equals" | "contains" | "greater than" | "less than",
 *   value: any
 * }]
 *
 * EDGE CASES:
 * - No records found → Returns empty array []
 * - 404 error → Returns empty array (not an error, just no data)
 * - Network error mid-pagination → Stops and returns accumulated records
 * - Invalid constraints → May return empty results (Bubble API behavior)
 *
 * SIDE EFFECTS:
 * - Makes multiple HTTP GET requests to Bubble API
 * - No database writes
 * - Console errors for non-404 failures only
 *
 * DEPENDENCIES:
 * - Requires: BUBBLE_BASE_URL, BUBBLE_API_HEADERS
 * - Used by: All sync operations that need all records of a type
 *
 * PERFORMANCE NOTES:
 * - Fetching 4000 invoices = ~40 API calls (4000 ÷ 100)
 * - Each API call ~100-500ms depending on Bubble load
 * - Total time for 4000 records: ~5-20 seconds
 */
export async function fetchBubbleRecordsWithConstraints(typeName: string, constraints: any[] = []): Promise<any[]> {
  const allRecords: any[] = [];
  let cursor = 0;

  while (true) {
    try {
      let url = getBubbleUrlWithCursor(typeName, cursor, 100, constraints);

      const response = await fetch(url, { headers: BUBBLE_API_HEADERS });

      if (!response.ok) {
        // Don't log 404 as error - it just means no records found
        if (response.status !== 404) {
          console.error(`Error fetching ${typeName} batch: ${response.statusText}`);
        }
        break;
      }

      const data = await response.json();
      const records = data.response.results || [];
      const remaining = data.response.remaining || 0;

      allRecords.push(...records);

      if (remaining === 0 || records.length === 0) {
        break;
      }

      cursor += records.length;
    } catch (err) {
      // Only log unexpected errors, not 404s (no records found)
      if (!String(err).includes('Not Found')) {
        console.error(`Error fetching ${typeName} batch:`, err);
      }
      break;
    }
  }

  return allRecords;
}

/**
 * ============================================================================
 * FUNCTION: fetchAllBubbleIds
 * ============================================================================
 *
 * INTENT (What & Why):
 * Fetch all Bubble IDs for a given object type without loading full records.
 * Memory-efficient way to check what exists in Bubble for comparison.
 *
 * INPUTS:
 * @param typeName - Bubble object type (e.g., 'payment', 'submit_payment')
 *
 * OUTPUTS:
 * @returns Set<string> - Set of all Bubble IDs for the type
 *
 * EXECUTION ORDER (Step-by-step):
 * 1. Initialize empty Set for IDs
 * 2. Loop until no more records:
 *    a. Fetch page with only _id field
 *    b. Extract _id from each record
 *    c. Add to Set (duplicates automatically ignored)
 *    d. Check remaining count (break if 0)
 * 3. Return Set of IDs
 *
 * MEMORY EFFICIENCY:
 * - Only stores IDs (strings), not full record objects
 * - Uses Set data structure for O(1) lookups
 * - Typical usage: comparing local vs Bubble IDs to detect changes
 *
 * USE CASES:
 * - Detect new records (exist in Bubble, not locally)
 * - Detect deleted records (exist locally, not in Bubble)
 * - Build ID sets for batch operations
 *
 * EDGE CASES:
 * - No records found → Returns empty Set
 * - Network error → Stops and returns partial Set
 *
 * SIDE EFFECTS:
 * - Makes multiple HTTP GET requests to Bubble API
 * - No database writes
 * - Console errors for failures
 *
 * DEPENDENCIES:
 * - Requires: BUBBLE_BASE_URL, BUBBLE_API_HEADERS
 * - Used by: syncPaymentsFromBubble (deletion tracking)
 *
 * PERFORMANCE NOTES:
 * - Faster than fetchBubbleRecordsWithConstraints (less data transferred)
 * - Still requires pagination loops for large datasets
 */
export async function fetchAllBubbleIds(typeName: string): Promise<Set<string>> {
  const ids = new Set<string>();
  let cursor = 0;

  while (true) {
    try {
      const response = await fetch(`${BUBBLE_BASE_URL}/${typeName}?limit=100&cursor=${cursor}`, { headers: BUBBLE_API_HEADERS });
      if (!response.ok) break;

      const data = await response.json();
      const records = data.response.results || [];
      const remaining = data.response.remaining || 0;

      for (const record of records) {
        ids.add(record._id);
      }

      if (remaining === 0 || records.length === 0) break;
      cursor += records.length;
    } catch (err) {
      console.error(`Error fetching ${typeName} IDs:`, err);
      break;
    }
  }

  return ids;
}
