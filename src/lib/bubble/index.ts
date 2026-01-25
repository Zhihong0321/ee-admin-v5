/**
 * ============================================================================
 * BUBBLE API INTEGRATION - BARREL EXPORT
 * ============================================================================
 *
 * This file re-exports all Bubble API functions from domain-specific modules.
 * Maintains backward compatibility with original bubble.ts imports.
 *
 * Structure:
 * - client.ts: API client configuration and URL builders
 * - push-operations.ts: Push local updates to Bubble
 * - fetch-helpers.ts: Shared fetch functions
 * - utils.ts: Invoice total calculation helpers
 * - sync-complete.ts: Complete sync engine (all tables)
 * - sync-profiles.ts: User and agent sync operations
 * - sync-invoices.ts: Invoice sync with relations (to be created)
 * - sync-seda.ts: SEDA sync operations (to be created)
 * - sync-payments.ts: Payment sync with deletion tracking (to be created)
 * - sync-idlist.ts: Fast ID-based sync (to be created)
 * - types.ts: TypeScript type definitions
 *
 * File: src/lib/bubble/index.ts
 */

// API Client
export {
  BUBBLE_BASE_URL,
  BUBBLE_API_KEY,
  BUBBLE_API_HEADERS,
  getBubbleUrl,
  getBubbleUrlWithCursor
} from './client';

// Push Operations
export {
  pushUserUpdateToBubble,
  pushAgentUpdateToBubble,
  pushPaymentUpdateToBubble
} from './push-operations';

// Fetch Helpers
export {
  fetchBubbleRecordByTypeName,
  fetchBubbleRecordsWithConstraints,
  fetchAllBubbleIds
} from './fetch-helpers';

// Utility Functions
export {
  calculateTotalFromInvoiceItems,
  getInvoiceTotalWithFallback
} from './utils';

// Complete Sync Engine
export {
  syncCompleteInvoicePackage
} from './sync-complete';

// Profile Sync Operations
export {
  syncProfilesFromBubble,
  syncSingleProfileFromBubble
} from './sync-profiles';

// Payment Sync Operations
export {
  syncPaymentsFromBubble
} from './sync-payments';

// Invoice Sync Operations
export {
  syncInvoicePackageWithRelations
} from './sync-invoices';

// SEDA Sync Operations
export {
  syncSedaRegistrations
} from './sync-seda';

// ID-List Sync Operations
export {
  syncByIdList
} from './sync-idlist';

// JSON File Sync Operations
export {
  syncInvoicesFromJsonFile
} from './sync-from-json';

// JSON Upload Sync Operations (with validation)
export {
  syncJsonWithValidation,
  type EntityType,
  type JsonUploadSyncResult
} from './sync-json-upload';

// Re-export types
export type {
  BubbleInvoiceRaw,
  BubbleCustomerRaw,
  BubbleAgentRaw,
  BubblePaymentRaw,
  BubbleSEDARaw,
  InvoiceSyncDecision,
  SyncProgressUpdate,
  SyncResult,
  IdsToSync,
  ExistingRecordsMap,
  FieldMappingConfig,
  BubbleConstraint,
  IntegritySyncOptions,
  IntegritySyncStats
} from './types';
