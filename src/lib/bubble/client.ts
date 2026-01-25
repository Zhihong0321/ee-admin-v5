/**
 * ============================================================================
 * BUBBLE API CLIENT
 * ============================================================================
 *
 * Core Bubble API client configuration and shared fetch utilities.
 *
 * Provides:
 * - API endpoint configuration
 * - Authentication headers
 * - Shared constants
 *
 * File: src/lib/bubble/client.ts
 */

/**
 * Bubble API configuration
 * Base URL for all Bubble API requests
 */
export const BUBBLE_BASE_URL = 'https://eternalgy.bubbleapps.io/api/1.1/obj';

/**
 * Bubble API key for authentication
 * Falls back to hardcoded key if environment variable not set
 */
export const BUBBLE_API_KEY = process.env.BUBBLE_API_KEY || 'b870d2b5ee6e6b39bcf99409c59c9e02';

/**
 * Standard headers for Bubble API requests
 * Includes Bearer token authentication
 */
export const BUBBLE_API_HEADERS = {
  'Authorization': `Bearer ${BUBBLE_API_KEY}`,
  'Content-Type': 'application/json'
} as const;

/**
 * ============================================================================
 * HELPER: Build Bubble API URL
 * ============================================================================
 *
 * Constructs a fully qualified Bubble API endpoint URL
 *
 * @param typeName - Bubble object type (e.g., 'invoice', 'customer')
 * @param id - Optional record ID for single record requests
 * @returns Full URL for Bubble API request
 *
 * Example:
 *   getBubbleUrl('invoice', '12345') // 'https://eternalgy.bubbleapps.io/api/1.1/obj/invoice/12345'
 *   getBubbleUrl('invoice')           // 'https://eternalgy.bubbleapps.io/api/1.1/obj/invoice'
 */
export function getBubbleUrl(typeName: string, id?: string): string {
  return id ? `${BUBBLE_BASE_URL}/${typeName}/${id}` : `${BUBBLE_BASE_URL}/${typeName}`;
}

/**
 * ============================================================================
 * HELPER: Build Bubble API URL with Query Parameters
 * ============================================================================
 *
 * Constructs a Bubble API endpoint URL with cursor-based pagination
 *
 * @param typeName - Bubble object type
 * @param cursor - Pagination cursor (default: 0)
 * @param limit - Records per page (default: 100)
 * @param constraints - Optional Bubble API constraints
 * @returns Full URL with query parameters
 *
 * Example:
 *   getBubbleUrlWithCursor('invoice', 100, 100)
 *   // 'https://eternalgy.bubbleapps.io/api/1.1/obj/invoice?limit=100&cursor=100'
 */
export function getBubbleUrlWithCursor(
  typeName: string,
  cursor = 0,
  limit = 100,
  constraints: any[] = []
): string {
  let url = `${BUBBLE_BASE_URL}/${typeName}?limit=${limit}&cursor=${cursor}`;

  // Add constraints if provided (for non-system fields)
  if (constraints.length > 0) {
    const constraintsParam = encodeURIComponent(JSON.stringify(constraints));
    url += `&constraints=${constraintsParam}`;
  }

  return url;
}
