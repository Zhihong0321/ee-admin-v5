/**
 * ============================================================================
 * PAYMENT SYNC FORM COMPONENT
 * ============================================================================
 *
 * Provides UI for:
 * - Payment Reset (delete files + truncate table)
 * - Payment Sync from Bubble (sync specific IDs)
 * - Link Payments to Invoices (Step 2)
 * - Recalculate Invoice Payment Status (Step 3)
 *
 * File: src/app/sync/components/forms/PaymentSyncForm.tsx
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Save, Link2, Calculator, ExternalLink } from "lucide-react";

interface PaymentSyncFormProps {
  onActionComplete?: () => void;
}

export function PaymentSyncForm({ onActionComplete }: PaymentSyncFormProps) {
  // Payment Reset state
  const [resetConfirmed, setResetConfirmed] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetResult, setResetResult] = useState<any>(null);

  // Payment Sync state
  const [paymentIdsInput, setPaymentIdsInput] = useState("");
  const [isSavingList, setIsSavingList] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);

  // Step 2: Link Payments state
  const [isLinking, setIsLinking] = useState(false);
  const [linkResult, setLinkResult] = useState<any>(null);

  // Step 3: Recalculate state
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [recalculateResult, setRecalculateResult] = useState<any>(null);

  // Problem syncs state
  const [problemCount, setProblemCount] = useState<number>(0);

  // Fetch problem count on mount
  useEffect(() => {
    const fetchProblemCount = async () => {
      try {
        const response = await fetch("/api/sync/payment-problems");
        const result = await response.json();
        if (result.success) {
          setProblemCount(result.count);
        }
      } catch (error) {
        console.error("Failed to fetch problem count:", error);
      }
    };

    fetchProblemCount();
  }, []);

  // Handler: Reset Payment Table
  const handleResetPaymentTable = async () => {
    if (!resetConfirmed) {
      alert("Please check the confirmation box first!");
      return;
    }

    setIsResetting(true);
    setResetResult(null);

    try {
      const response = await fetch("/api/sync/payment-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmDelete: true })
      });

      const result = await response.json();
      setResetResult(result);

      if (result.success) {
        setResetConfirmed(false);
        onActionComplete?.();
      }
    } catch (error: any) {
      setResetResult({ success: false, error: String(error) });
    } finally {
      setIsResetting(false);
    }
  };

  // Handler: Save Payment Sync List
  const handleSavePaymentSyncList = async () => {
    if (!paymentIdsInput.trim()) {
      alert("Please enter at least one Payment ID!");
      return;
    }

    setIsSavingList(true);
    setSyncResult(null);

    try {
      const response = await fetch("/api/sync/payment-save-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentIds: paymentIdsInput })
      });

      const result = await response.json();
      setSyncResult({ ...result, action: "save" });

      if (result.success) {
        setPaymentIdsInput("");
        onActionComplete?.();
      }
    } catch (error: any) {
      setSyncResult({ success: false, error: String(error), action: "save" });
    } finally {
      setIsSavingList(false);
    }
  };

  // Handler: Sync Payments from Bubble
  const handleSyncPayments = async () => {
    setIsSyncing(true);
    setSyncResult(null);

    try {
      const response = await fetch("/api/sync/payment-sync", {
        method: "POST"
      });

      const result = await response.json();
      setSyncResult({ ...result, action: "sync" });

      if (result.success) {
        onActionComplete?.();
      }
    } catch (error: any) {
      setSyncResult({ success: false, error: String(error), action: "sync" });
    } finally {
      setIsSyncing(false);
    }
  };

  // Handler: Link Payments to Invoices (Step 2)
  const handleLinkPayments = async () => {
    setIsLinking(true);
    setLinkResult(null);

    try {
      const response = await fetch("/api/sync/payment-link", {
        method: "POST"
      });

      const result = await response.json();
      setLinkResult(result);

      if (result.success) {
        onActionComplete?.();
      }
    } catch (error: any) {
      setLinkResult({ success: false, error: String(error) });
    } finally {
      setIsLinking(false);
    }
  };

  // Handler: Recalculate Invoice Payment Status (Step 3)
  const handleRecalculate = async () => {
    setIsRecalculating(true);
    setRecalculateResult(null);

    try {
      const response = await fetch("/api/sync/payment-recalculate", {
        method: "POST"
      });

      const result = await response.json();
      setRecalculateResult(result);

      if (result.success) {
        onActionComplete?.();
      }
    } catch (error: any) {
      setRecalculateResult({ success: false, error: String(error) });
    } finally {
      setIsRecalculating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ================================================================== */}
      {/* SECTION: PROBLEM SYNCS INFO BAR */}
      {/* ================================================================== */}
      {problemCount > 0 && (
        <div className="border border-orange-300 bg-orange-50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-orange-600" />
              <div>
                <h3 className="text-lg font-semibold text-orange-800">
                  {problemCount} Problem Payment{problemCount !== 1 ? 's' : ''}
                </h3>
                <p className="text-sm text-orange-700">
                  Payments that couldn't be synced or linked to invoices
                </p>
              </div>
            </div>
            <Link
              href="/sync/problem-syncs"
              className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 flex items-center gap-2"
            >
              View Problems
              <ExternalLink className="w-4 h-4" />
            </Link>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* SECTION: PAYMENT RESET (DANGER ZONE) */}
      {/* ================================================================== */}
      <div className="border border-red-300 bg-red-50 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-red-800 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          Payment Reset (DANGER ZONE)
        </h3>
        <p className="text-sm text-red-600 mt-2">
          This will <strong>DELETE ALL PAYMENT FILES</strong> from storage and <strong>TRUNCATE</strong> the payment table.
          This operation is <strong>IRREVERSIBLE</strong>.
        </p>

        <div className="mt-4 space-y-3">
          <label className="flex items-center gap-2 text-sm text-red-700">
            <input
              type="checkbox"
              checked={resetConfirmed}
              onChange={(e) => setResetConfirmed(e.target.checked)}
              className="w-4 h-4 text-red-600 border-red-300 rounded focus:ring-red-500"
            />
            I understand this will permanently delete all payment data
          </label>

          <button
            onClick={handleResetPaymentTable}
            disabled={!resetConfirmed || isResetting}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isResetting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Resetting...
              </>
            ) : (
              <>
                <AlertTriangle className="w-4 h-4" />
                Reset Payment Table
              </>
            )}
          </button>

          {resetResult && (
            <div className={`p-3 rounded text-sm ${
              resetResult.success ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
            }`}>
              {resetResult.success ? (
                <>
                  <strong>Success!</strong> Deleted {resetResult.filesDeleted} files and {resetResult.paymentsDeleted} payment records.
                </>
              ) : (
                <>
                  <strong>Error:</strong> {resetResult.error}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ================================================================== */}
      {/* SECTION: STEP 1 - PAYMENT SYNC FROM BUBBLE */}
      {/* ================================================================== */}
      <div className="border border-gray-300 bg-white rounded-lg p-4">
        <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          <RefreshCw className="w-5 h-5" />
          Step 1: Sync Payments from Bubble
        </h3>
        <p className="text-sm text-gray-600 mt-2">
          Sync specific payment IDs from Bubble to PostgreSQL. Enter comma-separated Bubble payment IDs below.
        </p>

        <div className="mt-4 space-y-3">
          <textarea
            value={paymentIdsInput}
            onChange={(e) => setPaymentIdsInput(e.target.value)}
            placeholder="payment-id-1, payment-id-2, payment-id-3..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
            rows={3}
          />

          <div className="flex gap-2">
            <button
              onClick={handleSavePaymentSyncList}
              disabled={isSavingList || !paymentIdsInput.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSavingList ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save List ({paymentIdsInput.split(',').filter(id => id.trim()).length} IDs)
                </>
              )}
            </button>

            <button
              onClick={handleSyncPayments}
              disabled={isSyncing}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSyncing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Start Sync
                </>
              )}
            </button>
          </div>

          {syncResult && (
            <div className={`p-3 rounded text-sm ${
              syncResult.success ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
            }`}>
              {syncResult.success ? (
                <>
                  <strong>Success!</strong> {syncResult.message}
                </>
              ) : (
                <>
                  <strong>Error:</strong> {syncResult.error}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ================================================================== */}
      {/* SECTION: STEP 2 - LINK PAYMENTS TO INVOICES */}
      {/* ================================================================== */}
      <div className="border border-gray-300 bg-white rounded-lg p-4">
        <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          <Link2 className="w-5 h-5" />
          Step 2: Link Payments to Invoices
        </h3>
        <p className="text-sm text-gray-600 mt-2">
          Cross-check synced payments against invoices and link them together.
          Creates orphan list for payments with missing invoices.
        </p>

        <div className="mt-4 space-y-3">
          <button
            onClick={handleLinkPayments}
            disabled={isLinking}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isLinking ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Linking...
              </>
            ) : (
              <>
                <Link2 className="w-4 h-4" />
                Link Payments to Invoices
              </>
            )}
          </button>

          {linkResult && (
            <div className={`p-3 rounded text-sm ${
              linkResult.success ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
            }`}>
              {linkResult.success ? (
                <>
                  <strong>Success!</strong> {linkResult.message}
                  {linkResult.orphanCount > 0 && (
                    <div className="mt-2 text-xs">
                      Orphaned payments: {linkResult.orphanCount}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <strong>Error:</strong> {linkResult.error}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ================================================================== */}
      {/* SECTION: STEP 3 - RECALCULATE INVOICE PAYMENT STATUS */}
      {/* ================================================================== */}
      <div className="border border-gray-300 bg-white rounded-lg p-4">
        <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          <Calculator className="w-5 h-5" />
          Step 3: Recalculate Invoice Payment Status
        </h3>
        <p className="text-sm text-gray-600 mt-2">
          Recalculate <code>percent_of_total_amount</code> and <code>paid</code> status for all invoices.
          Updates invoice payment % based on linked payments.
        </p>

        <div className="mt-4 space-y-3">
          <button
            onClick={handleRecalculate}
            disabled={isRecalculating}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isRecalculating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Recalculating...
              </>
            ) : (
              <>
                <Calculator className="w-4 h-4" />
                Recalculate All Invoices
              </>
            )}
          </button>

          {recalculateResult && (
            <div className={`p-3 rounded text-sm ${
              recalculateResult.success ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
            }`}>
              {recalculateResult.success ? (
                <>
                  <strong>Success!</strong> {recalculateResult.message}
                </>
              ) : (
                <>
                  <strong>Error:</strong> {recalculateResult.error}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
