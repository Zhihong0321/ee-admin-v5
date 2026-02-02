/**
 * ============================================================================
 * RELATIONSHIP VALIDATOR FORM COMPONENT
 * ============================================================================
 * 
 * UI for validating and rebuilding relationships after JSON sync.
 * Shows validation results and detailed error reports.
 * 
 * File: src/app/sync/components/forms/RelationshipValidatorForm.tsx
 */

"use client";

import { useState } from "react";
import { Shield, CheckCircle2, XCircle, Loader2, AlertTriangle, Download, RefreshCw } from "lucide-react";

interface RelationshipValidatorFormProps {
  onValidate: (options: { fixBrokenLinks: boolean; tables?: string[] }) => Promise<void>;
  isValidating: boolean;
  results: any;
}

export function RelationshipValidatorForm({
  onValidate,
  isValidating,
  results
}: RelationshipValidatorFormProps) {
  const [mode, setMode] = useState<'validate' | 'rebuild'>('validate');
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [showAllErrors, setShowAllErrors] = useState(false);

  const availableTables = [
    { value: 'invoice', label: 'Invoices', icon: '📄' },
    { value: 'payment', label: 'Payments', icon: '💰' },
    { value: 'submitted_payment', label: 'Submitted Payments', icon: '✅' },
    { value: 'seda_registration', label: 'SEDA Registrations', icon: '📋' },
    { value: 'invoice_item', label: 'Invoice Items', icon: '📝' },
    { value: 'user', label: 'Users', icon: '👤' },
  ];

  const handleValidate = () => {
    onValidate({
      fixBrokenLinks: mode === 'rebuild',
      tables: selectedTables.length > 0 ? selectedTables : undefined
    });
  };

  const toggleTable = (table: string) => {
    setSelectedTables(prev =>
      prev.includes(table)
        ? prev.filter(t => t !== table)
        : [...prev, table]
    );
  };

  const report = results?.report;
  const hasErrors = report && report.total_errors > 0;

  return (
    <div className="card overflow-hidden bg-gradient-to-br from-purple-900 via-purple-800 to-purple-900 text-white shadow-elevation-lg">
      {/* Header */}
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-purple-600/30 rounded-xl backdrop-blur-md border border-purple-400/30">
              <Shield className="h-6 w-6 text-purple-200" />
            </div>
            <div>
              <h3 className="text-xl font-bold">Relationship Validator</h3>
              <p className="text-purple-200 text-sm">Validate and rebuild database relationships after JSON sync</p>
            </div>
          </div>
        </div>
      </div>

      {/* Mode Selection */}
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-sm font-medium text-purple-200">Mode:</span>
          <div className="flex gap-2">
            <button
              onClick={() => setMode('validate')}
              disabled={isValidating}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === 'validate'
                  ? 'bg-purple-500 text-white'
                  : 'bg-white/10 text-purple-200 hover:bg-white/20'
              } disabled:opacity-50`}
            >
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Validate Only
              </span>
            </button>
            <button
              onClick={() => setMode('rebuild')}
              disabled={isValidating}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === 'rebuild'
                  ? 'bg-purple-500 text-white'
                  : 'bg-white/10 text-purple-200 hover:bg-white/20'
              } disabled:opacity-50`}
            >
              <span className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                Validate & Fix
              </span>
            </button>
          </div>
        </div>

        <div className="text-xs text-purple-200 p-3 bg-purple-950/50 rounded-lg">
          {mode === 'validate' ? (
            <>
              <AlertTriangle className="h-4 w-4 inline mr-2" />
              <strong>Validate Only:</strong> Checks all relationships and reports errors without making changes.
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4 inline mr-2" />
              <strong>Validate & Fix:</strong> Checks relationships and automatically removes invalid references.
            </>
          )}
        </div>
      </div>

      {/* Table Selection */}
      <div className="p-6 border-b border-white/10">
        <div className="mb-3">
          <span className="text-sm font-medium text-purple-200">Tables to check:</span>
          <span className="text-xs text-purple-300 ml-2">(leave empty to check all)</span>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {availableTables.map(table => (
            <button
              key={table.value}
              onClick={() => toggleTable(table.value)}
              disabled={isValidating}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${
                selectedTables.includes(table.value)
                  ? 'bg-purple-500/30 border-purple-400 text-white'
                  : 'bg-white/5 border-white/10 text-purple-200 hover:bg-white/10'
              } disabled:opacity-50`}
            >
              <span className="mr-2">{table.icon}</span>
              {table.label}
            </button>
          ))}
        </div>

        {selectedTables.length > 0 && (
          <button
            onClick={() => setSelectedTables([])}
            className="text-xs text-purple-300 hover:text-white underline mt-2"
            disabled={isValidating}
          >
            Clear selection (check all tables)
          </button>
        )}
      </div>

      {/* Action Button */}
      <div className="p-6 border-b border-white/10">
        <button
          onClick={handleValidate}
          disabled={isValidating}
          className="w-full px-6 py-3 bg-purple-500 hover:bg-purple-600 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isValidating ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              {mode === 'validate' ? 'Validating...' : 'Validating & Fixing...'}
            </>
          ) : (
            <>
              <Shield className="h-5 w-5" />
              {mode === 'validate' 
                ? `Validate ${selectedTables.length > 0 ? `${selectedTables.length} Tables` : 'All Relationships'}`
                : `Validate & Fix ${selectedTables.length > 0 ? `${selectedTables.length} Tables` : 'All Relationships'}`
              }
            </>
          )}
        </button>
      </div>

      {/* Results */}
      {report && (
        <div className="p-6 bg-black/20">
          <div className={`flex items-center gap-3 mb-4 ${hasErrors ? 'text-yellow-400' : 'text-green-400'}`}>
            {hasErrors ? (
              <AlertTriangle className="h-5 w-5" />
            ) : (
              <CheckCircle2 className="h-5 w-5" />
            )}
            <p className="font-bold">
              {hasErrors 
                ? `Found ${report.total_errors} Relationship Errors` 
                : '✅ All Relationships Valid!'
              }
            </p>
          </div>

          {/* Statistics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <p className="text-2xl font-bold text-white">{report.total_relationships_checked}</p>
              <p className="text-[10px] uppercase font-bold text-purple-300">Checked</p>
            </div>
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <p className="text-2xl font-bold text-white">{report.total_errors}</p>
              <p className="text-[10px] uppercase font-bold text-purple-300">Errors</p>
            </div>
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <p className="text-2xl font-bold text-white">{report.fixed_relationships}</p>
              <p className="text-[10px] uppercase font-bold text-purple-300">Fixed</p>
            </div>
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <p className="text-2xl font-bold text-white">
                {((report.completed_at.getTime() - report.started_at.getTime()) / 1000).toFixed(1)}s
              </p>
              <p className="text-[10px] uppercase font-bold text-purple-300">Duration</p>
            </div>
          </div>

          {/* Errors by Table */}
          {hasErrors && (
            <div className="mb-4">
              <h4 className="text-sm font-bold text-purple-200 mb-2">Errors by Table:</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {Object.entries(report.errors_by_table).map(([table, count]) => (
                  <div key={table} className="px-3 py-2 bg-red-500/20 rounded-lg border border-red-500/30">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-red-200">{table}</span>
                      <span className="text-sm font-bold text-red-300">{count as number}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error Details */}
          {hasErrors && report.errors.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-bold text-purple-200">Error Details:</h4>
                <button
                  onClick={() => setShowAllErrors(!showAllErrors)}
                  className="text-xs text-purple-300 hover:text-white underline"
                >
                  {showAllErrors ? 'Show less' : `Show all ${report.errors.length} errors`}
                </button>
              </div>
              
              <div className="max-h-64 overflow-y-auto bg-red-500/10 rounded-lg p-3 space-y-2">
                {(showAllErrors ? report.errors : report.errors.slice(0, 10)).map((error: any, idx: number) => (
                  <div key={idx} className="text-xs font-mono bg-red-500/20 rounded p-2 border border-red-500/30">
                    <div className="text-red-300">
                      <strong>{error.table}</strong> (ID: {error.record_id})
                    </div>
                    <div className="text-red-200 mt-1">
                      Field: <code className="bg-black/30 px-1 rounded">{error.field}</code>
                    </div>
                    <div className="text-red-200">
                      Missing: <code className="bg-black/30 px-1 rounded">{error.referenced_bubble_id}</code> ({error.referenced_table})
                    </div>
                    <div className="text-red-400 mt-1 text-[10px]">{error.error}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
