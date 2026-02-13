/**
 * ============================================================================
 * SYNC ACTIONS BARREL EXPORT
 * ============================================================================
 *
 * This file re-exports all sync action functions from domain-specific modules.
 * Maintains backward compatibility with existing imports.
 *
 * Structure:
 * - core-sync.ts: Manual, incremental, and progress sync operations
 * - invoice-sync.ts: Full invoice sync and ID list sync
 * - integrity-sync.ts: Integrity-first sync operations
 * - seda-sync.ts: SEDA-only sync operations
 * - data-patches.ts: Payment percentages, creator patches, status updates
 * - data-cleanup.ts: Demo deletion, date fixes
 * - link-restoration.ts: Invoice-SEDA and SEDA-customer link restoration
 * - utilities.ts: Logging, file URL patching, filename fixes
 * - relationship-rebuild.ts: Relationship validation and rebuilding
 *
 * File: src/app/sync/actions/index.ts
 */

// Core Sync Operations
export {
  runManualSync,
  runIncrementalSync,
  startManualSyncWithProgress
} from './core-sync';

// Invoice Sync Operations
export {
  runFullInvoiceSync,
  runIdListSync,
  runJsonFileSync
} from './invoice-sync';

// Integrity Sync Operations
export {
  runIntegritySync,
  runIntegrityBatchSync,
  runInvoiceIdListSync
} from './integrity-sync';

// SEDA Sync Operations
export {
  runSedaOnlySync
} from './seda-sync';

// Data Patch Operations
export {
  updateInvoicePaymentPercentages,
  updatePaymentCalculations,
  patchInvoiceCreators,
  updateInvoiceStatuses
} from './data-patches';

// Data Cleanup Operations
export {
  deleteDemoInvoices,
  fixMissingInvoiceDates
} from './data-cleanup';

// Link Restoration Operations
export {
  restoreInvoiceSedaLinks,
  patchSedaCustomerLinks,
  syncInvoiceItemLinks
} from './link-restoration';

// Utility Operations
export {
  fetchSyncLogs,
  clearSyncLogs,
  patchFileUrlsToAbsolute,
  patchChineseFilenames
} from './utilities';

// Bubble File Migration Operations
export {
  migrateBubbleFilesToLocal,
  randomTestMigration
} from './bubble-file-migration';

// Payment Operations
export {
  resetPaymentTable,
  savePaymentSyncList,
  loadPaymentSyncList,
  syncPaymentsFromBubble,
  linkPaymentsToInvoices,
  recalculateInvoicePaymentStatus,
  getProblemSyncList,
  clearProblemSyncList,
  type ProblemSync
} from './payment-operations';

// JSON Upload Sync Operations
export {
  uploadAndSyncJson,
  uploadInvoicesJson,
  uploadPaymentsJson,
  uploadSedaRegistrationsJson,
  uploadInvoiceItemsJson
} from './json-upload-sync';

// Relationship Validation & Rebuild Operations
export {
  runRelationshipValidation,
  quickValidation,
  fullRebuild,
  validateSpecificTables,
  rebuildSpecificTables,
  getRecentReports,
  getValidationReport,
  exportErrorsAsCSV
} from './relationship-rebuild';
