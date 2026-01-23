/**
 * ============================================================================
 * BUBBLE PUSH OPERATIONS
 * ============================================================================
 *
 * Functions to push local data changes back to Bubble API.
 * These are used when local updates need to be synchronized to Bubble.
 *
 * Functions:
 * - pushUserUpdateToBubble: Update user access_level in Bubble
 * - pushAgentUpdateToBubble: Update agent fields in Bubble
 * - pushPaymentUpdateToBubble: Update payment fields in Bubble
 *
 * File: src/lib/bubble/push-operations.ts
 */

import { BUBBLE_BASE_URL, BUBBLE_API_HEADERS } from './client';

/**
 * ============================================================================
 * FUNCTION: pushUserUpdateToBubble
 * ============================================================================
 *
 * INTENT (What & Why):
 * Push local user updates back to Bubble. Currently used for updating
 * user access_level when changed via admin interface.
 *
 * INPUTS:
 * @param bubbleId - Bubble user ID (required)
 * @param data - Update data object with optional fields:
 *   - access_level: string[] - User permissions/roles
 *
 * OUTPUTS:
 * @returns Bubble API response object on success
 * @throws Error if bubbleId is missing or API call fails
 *
 * EXECUTION ORDER (Step-by-step):
 * 1. Validate bubbleId exists (return early if missing)
 * 2. Map local field names to Bubble field names
 * 3. Return early if no data to update
 * 4. Send PATCH request to Bubble API
 * 5. Return response or throw error
 *
 * FIELD MAPPINGS:
 * - access_level → "Access Level"
 *
 * EDGE CASES:
 * - No bubbleId → Returns early, no error logged
 * - Empty data object → Returns early, no API call made
 * - API error (404, 500) → Throws error with status code
 *
 * SIDE EFFECTS:
 * - Makes HTTP PATCH request to Bubble API
 * - Updates user data in Bubble (external system)
 * - Console logging for debugging
 *
 * DEPENDENCIES:
 * - Requires: BUBBLE_BASE_URL, BUBBLE_API_HEADERS
 * - Used by: User management UI operations
 */
export async function pushUserUpdateToBubble(bubbleId: string, data: { access_level?: string[] }) {
  if (!bubbleId) {
    console.error("pushUserUpdateToBubble: No bubble_id provided");
    return;
  }

  const bubbleData: any = {};
  if (data.access_level) {
    bubbleData["Access Level"] = data.access_level;
  }

  if (Object.keys(bubbleData).length === 0) return;

  console.log(`pushUserUpdateToBubble: Updating user ${bubbleId} with data:`, bubbleData);

  try {
    const response = await fetch(`${BUBBLE_BASE_URL}/user/${bubbleId}`, {
      method: 'PATCH',
      headers: BUBBLE_API_HEADERS,
      body: JSON.stringify(bubbleData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Bubble User Patch Failed (${response.status}):`, errorText);
      console.error(`Request data:`, bubbleData);
      console.error(`Request URL:`, `${BUBBLE_BASE_URL}/user/${bubbleId}`);
      throw new Error(`Bubble Update Failed (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    console.log(`Bubble User Patch Success:`, result);
    return result;
  } catch (error) {
    console.error("Error pushing User update to Bubble:", error);
    throw error;
  }
}

/**
 * ============================================================================
 * FUNCTION: pushAgentUpdateToBubble
 * ============================================================================
 *
 * INTENT (What & Why):
 * Push local agent updates back to Bubble. Used when agent information
 * is modified in the admin interface and needs to sync to Bubble.
 *
 * INPUTS:
 * @param bubbleId - Bubble agent ID (required)
 * @param data - Update data object with optional fields:
 *   - name: string | null
 *   - email: string | null
 *   - contact: string | null
 *   - agent_type: string | null
 *   - address: string | null
 *   - bankin_account: string | null
 *   - banker: string | null
 *
 * OUTPUTS:
 * @returns Bubble API response object on success
 * @throws Error if API call fails
 *
 * EXECUTION ORDER (Step-by-step):
 * 1. Validate bubbleId exists (return early if missing)
 * 2. Map local field names to Bubble field names
 * 3. Filter out null/undefined values
 * 4. Return early if no data to update
 * 5. Send PATCH request to Bubble API
 * 6. Return response or throw error
 *
 * FIELD MAPPINGS:
 * - name → "Name"
 * - contact → "Contact"
 * - agent_type → "Agent Type"
 * - email → "email"
 * - address → "Address"
 * - bankin_account → "bankin_account"
 * - banker → "banker"
 *
 * EDGE CASES:
 * - No bubbleId → Returns early
 * - All fields null → Returns early, no API call made
 *
 * SIDE EFFECTS:
 * - Makes HTTP PATCH request to Bubble API
 * - Updates agent data in Bubble (external system)
 *
 * DEPENDENCIES:
 * - Requires: BUBBLE_BASE_URL, BUBBLE_API_HEADERS
 * - Used by: Agent management UI operations
 */
export async function pushAgentUpdateToBubble(bubbleId: string, data: {
  name?: string | null;
  email?: string | null;
  contact?: string | null;
  agent_type?: string | null;
  address?: string | null;
  bankin_account?: string | null;
  banker?: string | null;
}) {
  if (!bubbleId) return;

  const bubbleData: any = {};
  if (data.name) bubbleData["Name"] = data.name;
  if (data.contact) bubbleData["Contact"] = data.contact;
  if (data.agent_type) bubbleData["Agent Type"] = data.agent_type;
  if (data.email) bubbleData["email"] = data.email;
  if (data.address) bubbleData["Address"] = data.address;
  if (data.bankin_account) bubbleData["bankin_account"] = data.bankin_account;
  if (data.banker) bubbleData["banker"] = data.banker;

  if (Object.keys(bubbleData).length === 0) return;

  try {
    const response = await fetch(`${BUBBLE_BASE_URL}/agent/${bubbleId}`, {
      method: 'PATCH',
      headers: BUBBLE_API_HEADERS,
      body: JSON.stringify(bubbleData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Bubble Agent Patch Failed (${response.status}):`, errorText);
      throw new Error(`Bubble Update Failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Error pushing Agent update to Bubble:", error);
    throw error;
  }
}

/**
 * ============================================================================
 * FUNCTION: pushPaymentUpdateToBubble
 * ============================================================================
 *
 * INTENT (What & Why):
 * Push local payment updates back to Bubble. Used when payment information
 * is modified and needs to sync to Bubble source of truth.
 *
 * INPUTS:
 * @param bubbleId - Bubble payment ID (required)
 * @param data - Update data object with optional fields:
 *   - amount: string | null
 *   - payment_method: string | null
 *   - remark: string | null
 *   - payment_date: Date | null
 *
 * OUTPUTS:
 * @returns Bubble API response object on success
 * @throws Error if API call fails
 *
 * EXECUTION ORDER (Step-by-step):
 * 1. Validate bubbleId exists (return early if missing)
 * 2. Map local field names to Bubble field names
 * 3. Convert Date to ISO string for payment_date
 * 4. Filter out null/undefined values
 * 5. Return early if no data to update
 * 6. Send PATCH request to Bubble API
 * 7. Return response or throw error
 *
 * FIELD MAPPINGS:
 * - amount → "Amount" (parsed as float)
 * - payment_method → "Payment Method"
 * - remark → "Remark"
 * - payment_date → "Payment Date" (ISO string)
 *
 * EDGE CASES:
 * - No bubbleId → Returns early
 * - All fields null → Returns early, no API call made
 *
 * SIDE EFFECTS:
 * - Makes HTTP PATCH request to Bubble API
 * - Updates payment data in Bubble (external system)
 *
 * DEPENDENCIES:
 * - Requires: BUBBLE_BASE_URL, BUBBLE_API_HEADERS
 * - Used by: Payment management operations
 */
export async function pushPaymentUpdateToBubble(bubbleId: string, data: {
  amount?: string | null;
  payment_method?: string | null;
  remark?: string | null;
  payment_date?: Date | null;
}) {
  if (!bubbleId) return;

  const bubbleData: any = {};
  if (data.amount) bubbleData["Amount"] = parseFloat(data.amount);
  if (data.payment_method) bubbleData["Payment Method"] = data.payment_method;
  if (data.remark) bubbleData["Remark"] = data.remark;
  if (data.payment_date) bubbleData["Payment Date"] = data.payment_date.toISOString();

  if (Object.keys(bubbleData).length === 0) return;

  try {
    const response = await fetch(`${BUBBLE_BASE_URL}/payment/${bubbleId}`, {
      method: 'PATCH',
      headers: BUBBLE_API_HEADERS,
      body: JSON.stringify(bubbleData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Bubble Payment Patch Failed (${response.status}):`, errorText);
      throw new Error(`Bubble Update Failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Error pushing Payment update to Bubble:", error);
    throw error;
  }
}
