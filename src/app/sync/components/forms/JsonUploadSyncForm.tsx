/**
 * ============================================================================
 * JSON UPLOAD SYNC FORM COMPONENT
 * ============================================================================
 *
 * Form for uploading and syncing JSON data from Bubble exports.
 * Validates first entry before processing all records.
 *
 * File: src/app/sync/components/forms/JsonUploadSyncForm.tsx
 */

import { useState } from "react";
import { Upload, RefreshCw, Loader2, XCircle, CheckCircle2, FileJson, Database } from "lucide-react";

type EntityType = 'invoice' | 'payment' | 'seda_registration' | 'invoice_item' | 'user' | 'agent';

interface EntityOption {
  value: EntityType;
  label: string;
  color: string;
}

const ENTITY_OPTIONS: EntityOption[] = [
  { value: 'invoice', label: 'Invoices', color: 'blue' },
  { value: 'payment', label: 'Payments', color: 'green' },
  { value: 'seda_registration', label: 'SEDA Registrations', color: 'purple' },
  { value: 'invoice_item', label: 'Invoice Items', color: 'orange' },
  { value: 'user', label: 'Users', color: 'cyan' },
  { value: 'agent', label: 'Agents', color: 'amber' },
];

interface JsonUploadSyncFormProps {
  isSyncing: boolean;
  results: any;
  onSync: (entityType: EntityType, jsonData: any[]) => void;
}

export function JsonUploadSyncForm({
  isSyncing,
  results,
  onSync,
}: JsonUploadSyncFormProps) {
  const [selectedEntity, setSelectedEntity] = useState<EntityType>('invoice');
  const [jsonData, setJsonData] = useState<any[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setParseError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);

        if (!Array.isArray(parsed)) {
          throw new Error('JSON must be an array of records');
        }

        setJsonData(parsed);
      } catch (err) {
        setParseError(err instanceof Error ? err.message : 'Failed to parse JSON');
        setJsonData(null);
      }
    };
    reader.readAsText(file);
  };

  const handleSync = () => {
    if (jsonData && jsonData.length > 0) {
      onSync(selectedEntity, jsonData);
    }
  };

  const handleClear = () => {
    setJsonData(null);
    setFileName('');
    setParseError(null);
  };

  const getEntityColorClass = (entity: EntityType) => {
    const option = ENTITY_OPTIONS.find(o => o.value === entity);
    switch (option?.color) {
      case 'blue': return 'text-blue-400 bg-blue-500/20 border-blue-500/30';
      case 'green': return 'text-green-400 bg-green-500/20 border-green-500/30';
      case 'purple': return 'text-purple-400 bg-purple-500/20 border-purple-500/30';
      case 'orange': return 'text-orange-400 bg-orange-500/20 border-orange-500/30';
      case 'cyan': return 'text-cyan-400 bg-cyan-500/20 border-cyan-500/30';
      case 'amber': return 'text-amber-400 bg-amber-500/20 border-amber-500/30';
      default: return 'text-gray-400 bg-gray-500/20 border-gray-500/30';
    }
  };

  const selectedOption = ENTITY_OPTIONS.find(o => o.value === selectedEntity);

  return (
    <div className="card overflow-hidden bg-gradient-to-br from-indigo-900 via-indigo-800 to-indigo-900 text-white shadow-elevation-lg">
      <div className="p-6 border-b border-white/10">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-xl backdrop-blur-md border ${getEntityColorClass(selectedEntity)}`}>
              <Database className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold">JSON Upload Sync</h3>
              <p className="text-indigo-200 text-sm">Upload Bubble JSON export to sync PostgreSQL</p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Entity Selector */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-indigo-200">Table:</label>
              <select
                value={selectedEntity}
                onChange={(e) => setSelectedEntity(e.target.value as EntityType)}
                disabled={isSyncing}
                className="bg-indigo-950/50 border border-indigo-500/30 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50"
              >
                {ENTITY_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* File Upload */}
            <div className="flex items-center gap-2">
              <label className="btn-primary bg-indigo-600 hover:bg-indigo-500 border-none flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                <Upload className="h-4 w-4" />
                Upload JSON
                <input
                  type="file"
                  accept=".json"
                  onChange={handleFileUpload}
                  disabled={isSyncing}
                  className="hidden"
                />
              </label>
              {fileName && (
                <span className="text-xs text-indigo-300 max-w-[200px] truncate">
                  {fileName}
                </span>
              )}
            </div>

            {!isSyncing && jsonData && (
              <>
                <button
                  onClick={handleSync}
                  className="btn-primary bg-indigo-600 hover:bg-indigo-500 border-none flex items-center gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Sync {jsonData.length} Records
                </button>
                <button
                  onClick={handleClear}
                  className="text-xs text-indigo-300 hover:text-white underline"
                >
                  Clear
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Parse Error */}
      {parseError && (
        <div className="p-6 bg-red-500/20 border-b border-white/5">
          <div className="flex items-center gap-3 mb-2 text-red-400">
            <XCircle className="h-5 w-5" />
            <p className="font-bold">JSON Parse Error</p>
          </div>
          <div className="p-3 bg-red-500/30 rounded-lg text-red-300 text-sm font-mono">
            {parseError}
          </div>
        </div>
      )}

      {/* JSON Preview */}
      {jsonData && !parseError && (
        <div className="p-6 bg-black/20 border-b border-white/5">
          <div className="flex items-center gap-2 mb-3">
            <FileJson className="h-4 w-4 text-indigo-400" />
            <p className="text-sm font-bold text-indigo-300">
              JSON Data ({jsonData.length} {selectedOption?.label})
            </p>
          </div>
          <div className="p-3 bg-indigo-950/50 rounded-lg text-indigo-200 text-xs font-mono max-h-[150px] overflow-y-auto">
            <div className="text-indigo-400 mb-2">// First record preview:</div>
            {JSON.stringify(jsonData[0], null, 2).split('\n').slice(0, 15).join('\n')}
            <div className="text-indigo-400 italic mt-2">
              ...and {jsonData.length - 1} more records
            </div>
          </div>
        </div>
      )}

      {/* Validation Error */}
      {results?.result?.validationError && (
        <div className="p-6 bg-red-500/20 border-b border-white/5">
          <div className="flex items-center gap-3 mb-4 text-red-400">
            <XCircle className="h-5 w-5" />
            <p className="font-bold">First Entry Validation Failed - Sync Rejected</p>
          </div>
          <div className="p-3 bg-red-500/30 rounded-lg text-red-300 text-sm font-mono">
            {results.result.validationError}
          </div>
          <p className="text-xs text-red-200 mt-2">
            The first record failed to sync. Please check your JSON format and field names match the Bubble export structure.
          </p>
        </div>
      )}

      {/* Results Display */}
      {results?.result && !results?.result?.validationError ? (
        results.success ? (
          <div className="p-6 bg-black/20 border-b border-white/5">
            <div className="flex items-center gap-3 mb-4 text-green-400">
              <CheckCircle2 className="h-5 w-5" />
              <p className="font-bold">JSON Upload Sync Completed Successfully</p>
            </div>

            <div className={`grid gap-3 ${results.result.entityType === 'seda_registration' ? 'grid-cols-2 md:grid-cols-6' : 'grid-cols-2 md:grid-cols-5'}`}>
              <div className="text-center p-3 bg-white/5 rounded-lg">
                <p className="text-2xl font-bold text-white">{results.result.processed}</p>
                <p className="text-[10px] uppercase font-bold text-indigo-300">Processed</p>
              </div>
              <div className="text-center p-3 bg-white/5 rounded-lg">
                <p className="text-2xl font-bold text-white">{results.result.synced}</p>
                <p className="text-[10px] uppercase font-bold text-indigo-300">
                  {results.result.entityType === 'seda_registration' ? 'Inserted' : 'Synced'}
                </p>
              </div>
              {results.result.entityType === 'seda_registration' && (
                <div className="text-center p-3 bg-purple-500/10 rounded-lg border border-purple-500/20">
                  <p className="text-2xl font-bold text-purple-300">{results.result.merged || 0}</p>
                  <p className="text-[10px] uppercase font-bold text-purple-400">Merged</p>
                </div>
              )}
              <div className="text-center p-3 bg-white/5 rounded-lg">
                <p className="text-2xl font-bold text-white">{results.result.skipped}</p>
                <p className="text-[10px] uppercase font-bold text-indigo-300">Skipped</p>
              </div>
              <div className="text-center p-3 bg-white/5 rounded-lg">
                <p className="text-2xl font-bold text-white">{results.result.errors.length}</p>
                <p className="text-[10px] uppercase font-bold text-indigo-300">Errors</p>
              </div>
              <div className="text-center p-3 bg-white/5 rounded-lg">
                <p className="text-2xl font-bold text-white capitalize">
                  {results.result.entityType?.replace('_', ' ')}
                </p>
                <p className="text-[10px] uppercase font-bold text-indigo-300">Table</p>
              </div>
            </div>
            
            {/* SEDA Merge Mode Info */}
            {results.result.entityType === 'seda_registration' && (
              <div className="mt-3 p-3 bg-purple-500/10 rounded-lg border border-purple-500/20">
                <p className="text-xs text-purple-300">
                  <span className="font-bold">Merge Mode:</span> Only empty fields were filled with JSON data. 
                  Existing data was preserved.
                </p>
              </div>
            )}

            {results.result.errors.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-bold text-yellow-400 mb-2">
                  Some records had errors:
                </p>
                <div className="max-h-[100px] overflow-y-auto bg-yellow-500/10 rounded-lg p-3">
                  {results.result.errors.slice(0, 5).map((error: string, idx: number) => (
                    <div key={idx} className="text-yellow-300 text-xs font-mono mb-1">
                      {error}
                    </div>
                  ))}
                  {results.result.errors.length > 5 && (
                    <div className="text-yellow-400 text-xs italic mt-2">
                      ...and {results.result.errors.length - 5} more errors
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Schema Patch Results */}
            {results.result.schemaPatch && (
              <div className="mt-4 p-4 bg-cyan-500/10 rounded-lg border border-cyan-500/20">
                <div className="flex items-center gap-2 mb-3">
                  <Database className="h-4 w-4 text-cyan-400" />
                  <p className="text-sm font-bold text-cyan-400">Schema Auto-Patch Results</p>
                </div>

                {results.result.schemaPatch.addedColumns.length > 0 ? (
                  <div>
                    <p className="text-xs text-cyan-300 mb-2">
                      ✓ Added {results.result.schemaPatch.addedColumns.length} new column(s) to database:
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {results.result.schemaPatch.addedColumns.map((col: string, idx: number) => (
                        <div key={idx} className="text-xs font-mono bg-cyan-950/50 px-2 py-1 rounded text-cyan-200">
                          {col}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-cyan-300">
                    ✓ Schema is up to date - no new columns needed
                  </p>
                )}

                {results.result.schemaPatch.missingColumns.length > 0 && results.result.schemaPatch.addedColumns.length === 0 && (
                  <div className="mt-2 text-xs text-cyan-200">
                    Found {results.result.schemaPatch.missingColumns.length} potential new columns in JSON (already exist in database or were skipped)
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="p-6 bg-red-500/20 border-b border-white/5">
            <div className="flex items-center gap-3 mb-4 text-red-400">
              <XCircle className="h-5 w-5" />
              <p className="font-bold">JSON Upload Sync Failed</p>
            </div>
            <div className="p-3 bg-red-500/30 rounded-lg text-red-300 text-sm font-mono">
              {results.error}
            </div>
          </div>
        )
      ) : null}

      {/* Progress */}
      {isSyncing && (
        <div className="p-6 bg-black/20 border-b border-white/5">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
            <p className="font-bold text-white">
              Syncing {jsonData?.length || 0} {selectedOption?.label}...
            </p>
          </div>
          <p className="text-sm text-indigo-200 mt-2">
            Validating first entry, then processing all records. Please check the logs below for progress.
          </p>
        </div>
      )}
    </div>
  );
}
