/**
 * ============================================================================
 * SYNC ACTIONS HOOK
 * ============================================================================
 *
 * Custom hook for sync action handlers with state management.
 * Encapsulates all sync operation handlers with loading states.
 *
 * File: src/app/sync/hooks/useSyncActions.ts
 */

import { useState, useCallback } from "react";
import {
  runManualSync,
  runIncrementalSync,
  runFullInvoiceSync,
  runSedaOnlySync,
  runIdListSync,
  updateInvoicePaymentPercentages,
  patchInvoiceCreators,
  updateInvoiceStatuses,
  deleteDemoInvoices,
  fixMissingInvoiceDates,
  restoreInvoiceSedaLinks,
  patchFileUrlsToAbsolute,
  patchChineseFilenames,
  syncInvoiceItemLinks,
} from "../actions";

export interface SyncResult {
  success: boolean;
  results?: any;
  error?: string;
}

interface UseSyncActionsReturn {
  // Manual sync
  handleManualSync: (dateFrom?: string, syncFiles?: boolean) => Promise<SyncResult>;
  handleIncrementalSync: () => Promise<SyncResult>;

  // Invoice sync
  handleFullInvoiceSync: (dateFrom: string, dateTo?: string) => Promise<SyncResult>;

  // SEDA sync
  handleSedaOnlySync: (dateFrom: string, dateTo?: string) => Promise<SyncResult>;

  // ID list sync
  handleIdListSync: (csvData: string) => Promise<SyncResult>;

  // Data patches
  handleUpdatePercentages: () => Promise<SyncResult>;
  handlePatchCreators: () => Promise<SyncResult>;
  handleUpdateStatuses: () => Promise<SyncResult>;

  // Link restoration
  handleRestoreLinks: () => Promise<SyncResult>;

  // File operations
  handlePatchUrls: () => Promise<SyncResult>;
  handlePatchChinese: () => Promise<SyncResult>;
  handleInvoiceItemSync: (dateFrom?: string) => Promise<SyncResult>;

  // Data cleanup
  handleDeleteDemo: () => Promise<SyncResult>;
  handleFixDates: () => Promise<SyncResult>;
}

/**
 * Hook providing all sync action handlers
 */
export function useSyncActions(): UseSyncActionsReturn {
  /**
   * Manual sync with optional date range
   */
  const handleManualSync = useCallback(async (dateFrom?: string, syncFiles = false) => {
    try {
      return await runManualSync(dateFrom, undefined, syncFiles);
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }, []);

  /**
   * Quick incremental sync (last 24 hours)
   */
  const handleIncrementalSync = useCallback(async () => {
    try {
      return await runIncrementalSync();
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }, []);

  /**
   * Full invoice sync with relations
   */
  const handleFullInvoiceSync = useCallback(async (dateFrom: string, dateTo?: string) => {
    try {
      return await runFullInvoiceSync(dateFrom, dateTo);
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }, []);

  /**
   * SEDA-only sync
   */
  const handleSedaOnlySync = useCallback(async (dateFrom: string, dateTo?: string) => {
    try {
      return await runSedaOnlySync(dateFrom, dateTo);
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }, []);

  /**
   * Fast ID-list sync from CSV
   */
  const handleIdListSync = useCallback(async (csvData: string) => {
    try {
      return await runIdListSync(csvData);
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }, []);

  /**
   * Update invoice payment percentages
   */
  const handleUpdatePercentages = useCallback(async () => {
    try {
      return await updateInvoicePaymentPercentages();
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }, []);

  /**
   * Patch invoice creators from linked agents
   */
  const handlePatchCreators = useCallback(async () => {
    try {
      return await patchInvoiceCreators();
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }, []);

  /**
   * Update invoice statuses based on payment/SEDA state
   */
  const handleUpdateStatuses = useCallback(async () => {
    try {
      return await updateInvoiceStatuses();
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }, []);

  /**
   * Delete demo invoices (no customer, no payments)
   */
  const handleDeleteDemo = useCallback(async () => {
    try {
      return await deleteDemoInvoices();
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }, []);

  /**
   * Fix missing invoice dates via full resync
   */
  const handleFixDates = useCallback(async () => {
    try {
      return await fixMissingInvoiceDates();
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }, []);

  /**
   * Restore Invoice→SEDA links from SEDA.linked_invoice array
   */
  const handleRestoreLinks = useCallback(async () => {
    try {
      return await restoreInvoiceSedaLinks();
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }, []);

  /**
   * Patch file URLs from /storage/ to absolute URLs
   */
  const handlePatchUrls = useCallback(async () => {
    try {
      return await patchFileUrlsToAbsolute();
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }, []);

  /**
   * Patch Chinese filenames to URL-encoded names
   */
  const handlePatchChinese = useCallback(async () => {
    try {
      return await patchChineseFilenames();
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }, []);

  /**
   * Sync invoice items from local database to invoices
   */
  const handleInvoiceItemSync = useCallback(async (dateFrom?: string) => {
    try {
      return await syncInvoiceItemLinks(dateFrom);
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }, []);

  return {
    handleManualSync,
    handleIncrementalSync,
    handleFullInvoiceSync,
    handleSedaOnlySync,
    handleIdListSync,
    handleUpdatePercentages,
    handlePatchCreators,
    handleUpdateStatuses,
    handleRestoreLinks,
    handlePatchUrls,
    handlePatchChinese,
    handleInvoiceItemSync,
    handleDeleteDemo,
    handleFixDates,
  };
}
