'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Database,
  Download,
  Save,
  ChevronRight,
  FileText,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Settings,
  Search,
} from 'lucide-react';

interface Column {
  name: string;
  dataType: string;
  maxLength: number | null;
  nullable: boolean;
  default: string | null;
  description: string;
}

interface TableData {
  tableName: string;
  columns: Column[];
}

interface TableInfo {
  name: string;
  type: string;
}

export default function SchemaManagerPage() {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableData, setTableData] = useState<TableData | null>(null);
  const [loading, setLoading] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [saveStatus, setSaveStatus] = useState<{
    type: 'success' | 'error' | null;
    message: string;
  }>({ type: null, message: '' });

  const [savingColumns, setSavingColumns] = useState<Set<string>>(new Set());
  const autosaveTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Fetch all tables on mount
  useEffect(() => {
    fetchTables();

    // Cleanup timeouts on unmount
    return () => {
      autosaveTimeoutRef.current.forEach((timeout) => clearTimeout(timeout));
    };
  }, []);

  // Fetch columns when table is selected
  useEffect(() => {
    if (selectedTable) {
      fetchTableColumns(selectedTable);
    }
  }, [selectedTable]);

  const fetchTables = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/schema-manager/tables');
      const data = await response.json();

      if (data.success) {
        setTables(data.tables);
        setSetupComplete(true);
      } else {
        // If error, it might be because table doesn't exist
        setSetupComplete(false);
      }
    } catch (error) {
      console.error('Failed to fetch tables:', error);
      setSetupComplete(false);
    } finally {
      setLoading(false);
    }
  };

  const fetchTableColumns = async (tableName: string) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/schema-manager/columns/${encodeURIComponent(tableName)}`);
      const data = await response.json();

      if (data.success) {
        setTableData(data);
      } else {
        console.error('API error:', data.error);
        setSaveStatus({ type: 'error', message: data.error || 'Failed to load table columns' });
        setTimeout(() => setSaveStatus({ type: null, message: '' }), 3000);
      }
    } catch (error) {
      console.error('Failed to fetch columns:', error);
      setSaveStatus({ type: 'error', message: 'Network error loading table columns' });
      setTimeout(() => setSaveStatus({ type: null, message: '' }), 3000);
    } finally {
      setLoading(false);
    }
  };

  const setupDatabase = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/schema-manager/setup', { method: 'POST' });
      const data = await response.json();

      if (data.success) {
        setSetupComplete(true);
        fetchTables();
      } else {
        alert('Failed to setup: ' + data.error);
      }
    } catch (error) {
      console.error('Failed to setup:', error);
      alert('Failed to setup database');
    } finally {
      setLoading(false);
    }
  };

  const saveDescription = async (columnName: string, description: string) => {
    try {
      const response = await fetch('/api/schema-manager/save-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableName: selectedTable,
          columnName,
          description,
        }),
      });

      const data = await response.json();
      if (data.success) {
        // Remove from saving set
        setSavingColumns((prev) => {
          const newSet = new Set(prev);
          newSet.delete(columnName);
          return newSet;
        });

        // Show brief success indicator
        setSaveStatus({ type: 'success', message: 'Saved!' });
        setTimeout(() => setSaveStatus({ type: null, message: '' }), 1500);
      } else {
        setSavingColumns((prev) => {
          const newSet = new Set(prev);
          newSet.delete(columnName);
          return newSet;
        });
        setSaveStatus({ type: 'error', message: data.error || 'Failed to save' });
      }
    } catch (error) {
      console.error('Failed to save description:', error);
      setSavingColumns((prev) => {
        const newSet = new Set(prev);
        newSet.delete(columnName);
        return newSet;
      });
      setSaveStatus({ type: 'error', message: 'Network error' });
    }
  };

  const debouncedSave = (columnName: string, description: string) => {
    // Clear existing timeout for this column
    const existingTimeout = autosaveTimeoutRef.current.get(columnName);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Add to saving set
    setSavingColumns((prev) => new Set(prev).add(columnName));

    // Set new timeout
    const timeout = setTimeout(() => {
      saveDescription(columnName, description);
    }, 800); // 800ms debounce

    autosaveTimeoutRef.current.set(columnName, timeout);
  };

  const exportSchema = async () => {
    try {
      const response = await fetch('/api/schema-manager/export');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `schema-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to export schema:', error);
      alert('Failed to export schema');
    }
  };

  const exportCurrentTable = async () => {
    if (!selectedTable) return;

    try {
      const response = await fetch(`/api/schema-manager/export?tables=${encodeURIComponent(selectedTable)}`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `schema-${selectedTable}-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to export table:', error);
      alert('Failed to export table');
    }
  };

  const filteredTables = tables.filter((table) =>
    table.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const documentedCount = tableData?.columns.filter((col) => col.description).length || 0;
  const totalCount = tableData?.columns.length || 0;
  const documentationPercentage =
    totalCount > 0 ? ((documentedCount / totalCount) * 100).toFixed(1) : 0;

  if (!setupComplete) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-secondary-900">Schema Manager</h1>
            <p className="text-secondary-600 mt-1">
              Document your database schema for AI coding agents
            </p>
          </div>
        </div>

        <div className="card p-8">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-warning-100 rounded-full flex items-center justify-center mx-auto">
              <Settings className="h-8 w-8 text-warning-600" />
            </div>
            <h2 className="text-xl font-semibold text-secondary-900">Initial Setup Required</h2>
            <p className="text-secondary-600 max-w-md mx-auto">
              The schema descriptions table needs to be created before you can use the Schema
              Manager.
            </p>
            <button
              onClick={setupDatabase}
              disabled={loading}
              className="btn btn-primary mt-4"
            >
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Setting up...
                </>
              ) : (
                <>
                  <Settings className="h-4 w-4 mr-2" />
                  Create Schema Descriptions Table
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-secondary-900">Schema Manager</h1>
          <p className="text-secondary-600 mt-1">
            Document your database schema for AI coding agents
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={exportSchema} className="btn btn-secondary">
            <Download className="h-4 w-4 mr-2" />
            Export Full Schema
          </button>
        </div>
      </div>

      {/* Global Error/Status Message */}
      {saveStatus.type && (
        <div
          className={`p-4 rounded-lg ${
            saveStatus.type === 'success'
              ? 'bg-success-50 text-success-800 border border-success-200'
              : 'bg-danger-50 text-danger-800 border border-danger-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {saveStatus.type === 'success' ? (
              <CheckCircle className="h-5 w-5" />
            ) : (
              <AlertCircle className="h-5 w-5" />
            )}
            <span className="font-medium">{saveStatus.message}</span>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary-50 rounded-xl">
              <Database className="h-6 w-6 text-primary-600" />
            </div>
            <div>
              <p className="text-sm text-secondary-600">Total Tables</p>
              <p className="text-2xl font-bold text-secondary-900">{tables.length}</p>
            </div>
          </div>
        </div>

        {tableData && (
          <div className="card p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-accent-50 rounded-xl">
                <FileText className="h-6 w-6 text-accent-600" />
              </div>
              <div>
                <p className="text-sm text-secondary-600">Selected Table</p>
                <p className="text-2xl font-bold text-secondary-900">{tableData.tableName}</p>
              </div>
            </div>
          </div>
        )}

        {tableData && (
          <div className="card p-6">
            <div className="flex items-center gap-4">
              <div
                className={`p-3 rounded-xl ${
                  documentationPercentage === '100.0'
                    ? 'bg-success-50'
                    : 'bg-warning-50'
                }`}
              >
                {documentationPercentage === '100.0' ? (
                  <CheckCircle className="h-6 w-6 text-success-600" />
                ) : (
                  <AlertCircle className="h-6 w-6 text-warning-600" />
                )}
              </div>
              <div>
                <p className="text-sm text-secondary-600">Documentation</p>
                <p className="text-2xl font-bold text-secondary-900">
                  {documentationPercentage}%
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Tables List */}
        <div className="lg:col-span-1">
          <div className="card">
            <div className="p-4 border-b border-secondary-200">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary-400" />
                <input
                  type="text"
                  placeholder="Search tables..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input pl-10"
                />
              </div>
            </div>
            <div className="max-h-[600px] overflow-y-auto">
              {loading && filteredTables.length === 0 ? (
                <div className="p-8 text-center">
                  <RefreshCw className="h-8 w-8 animate-spin mx-auto text-secondary-400" />
                </div>
              ) : (
                <div className="divide-y divide-secondary-100">
                  {filteredTables.map((table) => (
                    <button
                      key={table.name}
                      onClick={() => setSelectedTable(table.name)}
                      className={`w-full px-4 py-3 flex items-center justify-between hover:bg-secondary-50 transition-colors text-left ${
                        selectedTable === table.name ? 'bg-primary-50 border-l-4 border-primary-600' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Database className="h-4 w-4 text-secondary-400 flex-shrink-0" />
                        <span className="text-sm font-medium text-secondary-900 truncate">
                          {table.name}
                        </span>
                      </div>
                      <ChevronRight
                        className={`h-4 w-4 transition-transform ${
                          selectedTable === table.name ? 'rotate-90 text-primary-600' : 'text-secondary-400'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Columns */}
        <div className="lg:col-span-3">
          {loading && selectedTable ? (
            <div className="card p-8">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto text-secondary-400" />
            </div>
          ) : tableData ? (
            <div className="card">
              <div className="p-6 border-b border-secondary-200 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-secondary-900">
                    {tableData.tableName}
                  </h2>
                  <p className="text-sm text-secondary-600 mt-1">
                    {documentedCount} of {totalCount} columns documented
                  </p>
                </div>
                <button onClick={exportCurrentTable} className="btn btn-secondary">
                  <Download className="h-4 w-4 mr-2" />
                  Export Table
                </button>
              </div>

              {/* Save Status */}
              {saveStatus.type && (
                <div
                  className={`mx-6 mt-4 p-3 rounded-lg ${
                    saveStatus.type === 'success'
                      ? 'bg-success-50 text-success-800'
                      : 'bg-danger-50 text-danger-800'
                  }`}
                >
                  {saveStatus.message}
                </div>
              )}

              <div className="divide-y divide-secondary-100">
                {tableData.columns.map((column, index) => (
                  <div
                    key={column.name}
                    className="p-6 hover:bg-secondary-50/50 transition-colors"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-3 flex-wrap">
                            <h3 className="font-mono text-sm font-semibold text-secondary-900">
                              {column.name}
                            </h3>
                            <span
                              className={`badge ${
                                column.nullable ? 'badge-warning' : 'badge-success'
                              }`}
                            >
                              {column.dataType}
                              {column.maxLength && `(${column.maxLength})`}
                            </span>
                            {column.default && (
                              <span className="badge badge-primary">default: {column.default}</span>
                            )}
                          </div>

                          <div className="relative">
                            <textarea
                              value={column.description}
                              onChange={(e) => {
                                const newColumns = [...tableData.columns];
                                newColumns[index] = { ...column, description: e.target.value };
                                setTableData({ ...tableData, columns: newColumns });
                                debouncedSave(column.name, e.target.value);
                              }}
                              placeholder="Add a description for this column... (autosaves as you type)"
                              className="input min-h-[80px] resize-y pr-10"
                              rows={2}
                            />
                            {savingColumns.has(column.name) && (
                              <div className="absolute right-3 bottom-3">
                                <RefreshCw className="h-4 w-4 text-primary-600 animate-spin" />
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2 pt-2">
                            {column.description && !savingColumns.has(column.name) && (
                              <span className="text-xs text-success-600 flex items-center gap-1">
                                <CheckCircle className="h-3 w-3" />
                                Saved
                              </span>
                            )}
                            {savingColumns.has(column.name) && (
                              <span className="text-xs text-secondary-500 flex items-center gap-1">
                                Saving...
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="card p-12">
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-secondary-100 rounded-full flex items-center justify-center mx-auto">
                  <Database className="h-8 w-8 text-secondary-400" />
                </div>
                <h3 className="text-lg font-semibold text-secondary-900">No Table Selected</h3>
                <p className="text-secondary-600">
                  Select a table from the list to view and document its columns
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
