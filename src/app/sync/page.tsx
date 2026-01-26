/**
 * ============================================================================
 * SYNC CENTER PAGE
 * ============================================================================
 *
 * Main synchronization interface for Bubble ERP to PostgreSQL ERP migration.
 * Now using extracted components for better maintainability.
 *
 * File: src/app/sync/page.tsx
 */

"use client";

import { useState, useEffect } from "react";
import { RefreshCw } from "lucide-react";
import {
  JsonUploadSyncForm,
  RelationshipValidatorForm,
} from "./components/forms";
import { LogViewer } from "./components/logs";
import { fetchSyncLogs, clearSyncLogs } from "./actions";

export default function SyncPage() {
  // ============================================================================
  // STATE
  // ============================================================================

  // JSON Upload Sync state
  const [isJsonUploadSyncing, setIsJsonUploadSyncing] = useState(false);
  const [jsonUploadResults, setJsonUploadResults] = useState<any>(null);

  // Relationship Validator state
  const [isValidatingRelationships, setIsValidatingRelationships] = useState(false);
  const [relationshipResults, setRelationshipResults] = useState<any>(null);

  // File and URL Patcher state
  const [isPatchingUrls, setIsPatchingUrls] = useState(false);
  const [isPatchingChinese, setIsPatchingChinese] = useState(false);
  const [isMigratingBubbleFiles, setIsMigratingBubbleFiles] = useState(false);
  const [patchResults, setPatchResults] = useState<any>(null);
  const [migrationResults, setMigrationResults] = useState<any>(null);

  // Logs state
  const [logs, setLogs] = useState<string[]>([]);
  const [isClearingLogs, setIsClearingLogs] = useState(false);

  // ============================================================================
  // EFFECTS
  // ============================================================================

  useEffect(() => {
    loadLogs();
    const interval = setInterval(loadLogs, 10000);
    return () => clearInterval(interval);
  }, []);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const loadLogs = async () => {
    const hasAuthToken = document.cookie.includes('auth_token=');
    if (!hasAuthToken) return;

    try {
      const latestLogs = await fetchSyncLogs();
      setLogs(latestLogs);
    } catch (error) {
      const errorMsg = String(error);
      if (!errorMsg.includes('fetch') && !errorMsg.includes('Failed to fetch')) {
        setLogs([`Error loading logs: ${errorMsg}`]);
      }
    }
  };

  const handleClearLogs = async () => {
    if (!confirm("This will delete all sync logs. This action cannot be undone. Continue?")) return;

    setIsClearingLogs(true);
    try {
      const res = await clearSyncLogs();
      if (res.success) {
        setLogs(['Logs cleared.']);
      } else {
        setLogs([`Failed to clear logs: ${res.error}`]);
      }
    } catch (error) {
      setLogs([`Error: ${String(error)}`]);
    } finally {
      setIsClearingLogs(false);
    }
  };

  const handleJsonUploadSync = async (entityType: 'invoice' | 'payment' | 'seda_registration' | 'invoice_item' | 'user', jsonData: any[]) => {
    if (!jsonData || jsonData.length === 0) {
      alert("No JSON data to sync");
      return;
    }

    if (!confirm(`Sync ${jsonData.length} ${entityType.replace('_', ' ')} records from JSON?

This will:
• Validate the first entry first
• If validation fails, entire sync is rejected
• If validation passes, sync all records
• Upsert records (update if exists, insert if new)

Continue?`)) {
      return;
    }

    setIsJsonUploadSyncing(true);
    setJsonUploadResults(null);

    try {
      // Direct import from json-upload-sync action
      const { uploadAndSyncJson } = await import("./actions/json-upload-sync");
      const res = await uploadAndSyncJson(entityType, jsonData);
      setJsonUploadResults(res);
      await loadLogs();
    } catch (error) {
      setJsonUploadResults({ success: false, error: String(error) });
    } finally {
      setIsJsonUploadSyncing(false);
    }
  };

  const handleRelationshipValidation = async (options: { fixBrokenLinks: boolean; tables?: string[] }) => {
    const action = options.fixBrokenLinks ? 'validate and fix' : 'validate';
    const tableCount = options.tables?.length || 0;
    const tableText = tableCount > 0 ? `${tableCount} tables` : 'all tables';
    
    if (!confirm(`${action === 'validate' ? 'Validate' : 'Validate and fix'} relationships in ${tableText}?

This will check all linked_* fields and ${options.fixBrokenLinks ? 'remove invalid references' : 'report errors'}.

Continue?`)) {
      return;
    }

    setIsValidatingRelationships(true);
    setRelationshipResults(null);

    try {
      const { runRelationshipValidation } = await import("./actions/relationship-rebuild");
      const res = await runRelationshipValidation({
        fix_broken_links: options.fixBrokenLinks,
        validate_only: !options.fixBrokenLinks,
        tables: options.tables,
        log_to_file: true
      });
      setRelationshipResults(res);
      await loadLogs();
    } catch (error) {
      setRelationshipResults({ success: false, error: String(error) });
    } finally {
      setIsValidatingRelationships(false);
    }
  };

  const handlePatchUrls = async () => {
    if (!confirm("This will convert all /storage/ URLs to absolute https://admin.atap.solar/api/files/ URLs in the database.\n\nThis fixes the issue where:\n1. Other apps on different subdomains cannot access files\n2. /storage/ path redirects to dashboard instead of serving files\n3. Wrong /api/files/storage/ path (doubled storage folder)\n\nContinue?")) return;

    setIsPatchingUrls(true);
    setPatchResults(null);

    try {
      const res = await patchFileUrlsToAbsolute();
      setPatchResults(res);
      await loadLogs();
    } catch (error) {
      setPatchResults({ success: false, error: String(error) });
    } finally {
      setIsPatchingUrls(false);
    }
  };

  const handlePatchChinese = async () => {
    if (!confirm("This will fix files with Chinese (or other non-ASCII) characters in their filenames.\n\nIt will:\n1. Scan all file URLs in the database\n2. Rename files on disk to use URL-encoded names\n3. Update database URLs with the new filenames\n\nThis fixes the issue where files with Chinese characters cannot be accessed from browsers.\n\nContinue?")) return;

    setIsPatchingChinese(true);
    setPatchResults(null);

    try {
      const res = await patchChineseFilenames();
      setPatchResults(res);
      await loadLogs();
    } catch (error) {
      setPatchResults({ success: false, error: String(error) });
    } finally {
      setIsPatchingChinese(false);
    }
  };

  const handleMigrateBubbleFiles = async (dryRun: boolean = false) => {
    const action = dryRun ? 'preview' : 'migrate';
    if (!confirm(
      `This will ${action} files from Bubble storage to local storage.

Steps:
1. Scan database for Bubble storage URLs (s3.amazonaws.com, etc.)
2. ${dryRun ? 'Preview files to download' : 'Download files to /storage/'}
3. ${dryRun ? 'Show migration plan' : 'Update database with new absolute URLs'}
4. Auto-sanitize Chinese/non-ASCII filenames

${dryRun ? '🔍 DRY RUN: No files will be downloaded' : '⚠️ This will download files from Bubble'}

Continue?`
    )) return;

    setIsMigratingBubbleFiles(true);
    setMigrationResults(null);

    try {
      const res = await migrateBubbleFilesToLocal({ dryRun });
      setMigrationResults(res);
      await loadLogs();
    } catch (error) {
      setMigrationResults({ success: false, error: String(error) });
    } finally {
      setIsMigratingBubbleFiles(false);
    }
  };

  // Get current patch operation name for tracking
  const getCurrentOperation = () => {
    if (isPatchingUrls) return 'patchUrls';
    if (isPatchingChinese) return 'patchChinese';
    return null;
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in pb-20">
      {/* Header */}
      <div className="space-y-2 border-b border-secondary-200 pb-6">
        <h1 className="text-3xl font-bold text-secondary-900 flex items-center gap-3">
          <RefreshCw className="h-8 w-8 text-primary-600" />
          Sync Center
        </h1>
        <p className="text-secondary-500">
          Synchronize data from JSON uploads and patch file URLs.
        </p>
      </div>

      {/* JSON Upload Sync */}
      <JsonUploadSyncForm
        isSyncing={isJsonUploadSyncing}
        results={jsonUploadResults}
        onSync={handleJsonUploadSync}
      />

      {/* Relationship Validator */}
      <RelationshipValidatorForm 
        onValidate={handleRelationshipValidation}
        isValidating={isValidatingRelationships}
        results={relationshipResults}
      />

      {/* Bubble File Migration */}
      <section className="bg-white rounded-lg shadow-sm border border-secondary-200 p-6">
        <h2 className="text-xl font-semibold text-secondary-900 mb-4 flex items-center gap-2">
          <svg className="h-5 w-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
          </svg>
          Bubble File Migration
        </h2>
        <p className="text-sm text-secondary-500 mb-6">
          Download files from Bubble storage to local server and update database URLs.
        </p>

        <div className="space-y-4">
          {/* Migration Info Box */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="font-medium text-blue-900 mb-2">👉 What this does:</h3>
            <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
              <li>Scans database for URLs pointing to Bubble storage (s3.amazonaws.com)</li>
              <li>Downloads files from Bubble and saves to /storage/</li>
              <li>Updates database URLs to https://admin.atap.solar/api/files/</li>
              <li>Auto-sanitizes Chinese/non-ASCII filenames during download</li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => handleMigrateBubbleFiles(true)}
              disabled={isMigratingBubbleFiles}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-secondary-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {isMigratingBubbleFiles ? 'Scanning...' : 'Preview (Dry Run)'}
            </button>
            <button
              onClick={() => handleMigrateBubbleFiles(false)}
              disabled={isMigratingBubbleFiles}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-secondary-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {isMigratingBubbleFiles ? 'Migrating...' : 'Start Migration'}
            </button>
          </div>

          {/* Results Display */}
          {migrationResults && (
            <div className={`p-4 rounded-lg border ${
              migrationResults.success
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}>
              {migrationResults.success ? (
                <>
                  <p className="font-medium mb-3">✓ {migrationResults.message?.split('\n')[0] || 'Migration completed!'}</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div className="p-2 bg-white bg-opacity-50 rounded">
                      <p className="font-bold text-lg">{migrationResults.scanned || 0}</p>
                      <p className="text-xs">Scanned</p>
                    </div>
                    <div className="p-2 bg-white bg-opacity-50 rounded">
                      <p className="font-bold text-lg">{migrationResults.downloaded || 0}</p>
                      <p className="text-xs">Downloaded</p>
                    </div>
                    <div className="p-2 bg-white bg-opacity-50 rounded">
                      <p className="font-bold text-lg">{migrationResults.failed || 0}</p>
                      <p className="text-xs">Failed</p>
                    </div>
                    <div className="p-2 bg-white bg-opacity-50 rounded">
                      <p className="font-bold text-lg">{migrationResults.totalSize || '0 B'}</p>
                      <p className="text-xs">Total Size</p>
                    </div>
                  </div>
                  {migrationResults.duration && (
                    <p className="text-xs mt-2">⏱️ Duration: {migrationResults.duration}</p>
                  )}
                </>
              ) : (
                <p className="font-medium">✗ Error: {migrationResults.error}</p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* File and URL Patcher */}
      <section className="bg-white rounded-lg shadow-sm border border-secondary-200 p-6">
        <h2 className="text-xl font-semibold text-secondary-900 mb-4 flex items-center gap-2">
          <svg className="h-5 w-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          File and URL Patcher
        </h2>
        <p className="text-sm text-secondary-500 mb-6">
          Fix file URLs and handle special character filenames in the database.
        </p>

        <div className="space-y-4">
          {/* Patch URLs */}
          <div className="flex items-start gap-4 p-4 bg-secondary-50 rounded-lg border border-secondary-200">
            <div className="flex-1">
              <h3 className="font-medium text-secondary-900 mb-1">Patch File URLs</h3>
              <p className="text-sm text-secondary-600 mb-3">
                Convert all /storage/ URLs to absolute https://admin.atap.solar/api/files/ URLs in the database.
              </p>
              <div className="text-xs text-secondary-500">
                Fixes issues with cross-domain file access and incorrect /api/files/storage/ paths.
              </div>
            </div>
            <button
              onClick={handlePatchUrls}
              disabled={isPatchingUrls || isPatchingChinese}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:bg-secondary-300 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              {isPatchingUrls ? 'Patching...' : 'Patch URLs'}
            </button>
          </div>

          {/* Patch Chinese Filenames */}
          <div className="flex items-start gap-4 p-4 bg-secondary-50 rounded-lg border border-secondary-200">
            <div className="flex-1">
              <h3 className="font-medium text-secondary-900 mb-1">Patch Chinese Filenames</h3>
              <p className="text-sm text-secondary-600 mb-3">
                Fix files with Chinese (or other non-ASCII) characters in their filenames.
              </p>
              <div className="text-xs text-secondary-500">
                Renames files on disk to URL-encoded names and updates database URLs accordingly.
              </div>
            </div>
            <button
              onClick={handlePatchChinese}
              disabled={isPatchingUrls || isPatchingChinese}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:bg-secondary-300 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              {isPatchingChinese ? 'Patching...' : 'Patch Filenames'}
            </button>
          </div>

          {/* Results Display */}
          {patchResults && (
            <div className={`p-4 rounded-lg border ${
              patchResults.success
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}>
              {patchResults.success ? (
                <>
                  <p className="font-medium mb-2">✓ Patch completed successfully!</p>
                  {patchResults.results && (
                    <div className="text-sm space-y-1">
                      {Object.entries(patchResults.results).map(([key, value]: [string, any]) => (
                        <p key={key}>{key}: {value}</p>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="font-medium">✗ Error: {patchResults.error}</p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Logs */}
      <LogViewer
        logs={logs}
        isClearing={isClearingLogs}
        onClear={handleClearLogs}
      />
    </div>
  );
}

// Import actions at the bottom to avoid clutter
import {
  patchFileUrlsToAbsolute,
  patchChineseFilenames,
} from "./actions";
import { migrateBubbleFilesToLocal } from "./actions/bubble-file-migration";
