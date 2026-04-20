'use client';

import { useState, useEffect, useMemo } from 'react';
import {
    Database,
    RefreshCw,
    Search,
    ChevronDown,
    ChevronRight,
    Key,
    Link,
    AlertTriangle,
    CheckCircle,
    Clock,
    Table2,
    Copy,
    Check,
    Filter,
    Eye,
    EyeOff,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface ColumnInfo {
    name: string;
    dataType: string;
    udtName: string;
    maxLength: number | null;
    numericPrecision: number | null;
    numericScale: number | null;
    nullable: boolean;
    default: string | null;
    ordinalPosition: number;
    isPrimaryKey: boolean;
    foreignKey: { foreignTable: string; foreignColumn: string } | null;
    indexes: string[];
}

interface TableInfo {
    tableName: string;
    tableType: string;
    rowEstimate: number | null;
    totalSize: string | null;
    columns: ColumnInfo[];
}

interface DbSchema {
    fetchedAt: string;
    totalTables: number;
    tables: TableInfo[];
}

// ─── Known schema.ts columns per table (for drift detection) ──────────────────
// These are the columns that exist in schema.ts — used to highlight DB-only columns
const SCHEMA_TS_COLUMNS: Record<string, string[]> = {
    invoice: [
        'id', 'bubble_id', 'invoice_id', 'invoice_number', 'total_amount', 'invoice_date', 'status',
        'is_latest', 'share_token', 'linked_invoice_item', 'linked_customer', 'linked_agent',
        'linked_payment', 'linked_seda_registration', 'linked_roof_image', 'pv_system_drawing',
        'amount_eligible_for_comm', 'eligible_amount_description', 'percent_of_total_amount',
        'paid', '1st_payment_date', 'full_payment_date', 'last_payment_date', 'amount', 'dealercode',
        'approval_status', 'case_status', 'created_at', 'updated_at', 'template_id', 'created_by',
        'is_deleted', 'deleted_at',
    ],
    customer: [
        'id', 'customer_id', 'name', 'email', 'phone', 'address', 'city', 'state', 'postcode',
        'ic_number', 'linked_seda_registration', 'linked_old_customer', 'notes', 'version',
        'updated_by', 'created_by', 'created_at', 'updated_at', 'last_synced_at',
    ],
    agent: [
        'id', 'bubble_id', 'name', 'email', 'contact', 'agent_type', 'address', 'bankin_account',
        'banker', 'ic_front', 'ic_back', 'created_at', 'updated_at', 'last_synced_at',
    ],
    user: [
        'id', 'bubble_id', 'email', 'linked_agent_profile', 'agent_code', 'dealership',
        'profile_picture', 'user_signed_up', 'access_level', 'created_date', 'created_at',
        'updated_at', 'last_synced_at',
    ],
    seda_registration: [
        'id', 'bubble_id', 'last_synced_at', 'created_at', 'updated_at', 'mapper_status',
        'created_by', 'drawing_system_submitted', 'modified_date', 'state', 'redex_status',
        'roof_images', 'sunpeak_hours', 'system_size_in_form_kwp', 'created_date', 'agent',
        'project_price', 'system_size', 'city', 'linked_customer', 'inverter_kwac', 'slug',
        'estimated_monthly_saving', 'average_tnb', 'price_category', 'g_electric_folder_link',
        'g_roof_folder_link', 'installation_address', 'linked_invoice', 'customer_signature',
        'email', 'ic_copy_back', 'ic_copy_front', 'tnb_bill_3', 'tnb_bill_1', 'tnb_meter',
        'e_contact_no', 'tnb_bill_2', 'drawing_pdf_system', 'e_contact_name', 'seda_status',
        'version', 'nem_application_no', 'e_contact_relationship', 'ic_no', 'request_drawing_date',
        'phase_type', 'special_remark', 'tnb_account_no', 'nem_cert', 'property_ownership_prove',
        'inverter_serial_no', 'tnb_meter_install_date', 'tnb_meter_status', 'first_completion_date',
        'e_contact_mykad', 'mykad_pdf', 'nem_type', 'postcode', 'e_email', 'redex_remark',
        'site_images', 'company_registration_no', 'drawing_system_actual',
        'check_tnb_bill_and_meter_image', 'check_mykad', 'check_ownership', 'check_fill_in_detail',
        'drawing_engineering_seda_pdf', 'seda_profile_status', 'seda_profile_id',
        'seda_profile_checked_at', 'installation_address_1', 'installation_address_2',
        'latitude', 'longitude',
    ],
    payment: [
        'id', 'bubble_id', 'last_synced_at', 'created_at', 'updated_at', 'modified_date', 'amount',
        'created_date', 'payment_date', 'payment_index', 'epp_month', 'bank_charges', 'remark',
        'payment_method_v2', 'linked_invoice', 'linked_customer', 'terminal', 'attachment',
        'verified_by', 'payment_method', 'edit_history', 'log', 'issuer_bank', 'created_by',
        'linked_agent', 'epp_type', 'epp_cost',
    ],
    invoice_item: [
        'id', 'bubble_id', 'last_synced_at', 'created_at', 'updated_at', 'description',
        'modified_date', 'qty', 'amount', 'unit_price', 'created_by', 'created_date',
        'is_a_package', 'inv_item_type', 'linked_package', 'epp', 'linked_invoice', 'sort',
        'linked_voucher', 'voucher_remark',
    ],
    referral: [
        'id', 'bubble_id', 'linked_customer_profile', 'name', 'relationship', 'mobile_number',
        'status', 'created_at', 'updated_at', 'linked_agent', 'deal_value', 'commission_earned',
        'linked_invoice', 'project_type',
    ],
    voucher: [
        'id', 'bubble_id', 'title', 'voucher_code', 'voucher_type', 'deductable_from_commission',
        'invoice_description', 'terms_conditions', 'created_by', 'created_at', 'updated_at', 'last_synced_at',
    ],
    product: [
        'id', 'bubble_id', 'active', 'cost_price', 'created_at', 'created_by', 'created_date',
        'description', 'image', 'inventory', 'inverter_rating', 'label', 'last_synced_at',
        'linked_brand', 'linked_category', 'modified_date', 'name', 'pdf_product',
        'product_warranty_desc', 'selling_price', 'solar_output_rating', 'updated_at',
        'warranty_link', 'warranty_name',
    ],
    package: [
        'id', 'bubble_id', 'active', 'created_at', 'created_by', 'created_date', 'invoice_desc',
        'last_synced_at', 'linked_package_item', 'max_discount', 'modified_date', 'need_approval',
        'package_name', 'panel', 'panel_qty', 'password', 'price', 'special', 'type', 'updated_at',
    ],
    invoice_template: [
        'id', 'bubble_id', 'template_name', 'company_name', 'company_address', 'company_phone',
        'company_email', 'sst_registration_no', 'bank_name', 'bank_account_no', 'bank_account_name',
        'logo_url', 'terms_and_conditions', 'active', 'is_default', 'created_by', 'created_at',
        'updated_at', 'disclaimer', 'apply_sst',
    ],
    invoice_snapshot: ['id', 'invoice_id', 'version', 'snapshot_data', 'created_at', 'created_by'],
    invoice_edit_history: [
        'id', 'invoice_id', 'invoice_number', 'entity_type', 'entity_id', 'action_type', 'changes',
        'edited_by_name', 'edited_by_phone', 'edited_by_user_id', 'edited_by_role', 'edited_at',
    ],
    sync_progress: [
        'id', 'session_id', 'status', 'total_invoices', 'synced_invoices', 'current_invoice_id',
        'date_from', 'date_to', 'error_message', 'started_at', 'updated_at', 'completed_at',
    ],
    schema_descriptions: [
        'id', 'table_name', 'column_name', 'description', 'data_type', 'is_nullable',
        'column_default', 'created_at', 'updated_at', 'updated_by',
    ],
    submitted_payment: [
        'id', 'bubble_id', 'last_synced_at', 'created_at', 'updated_at', 'created_date',
        'modified_date', 'payment_date', 'payment_index', 'epp_month', 'bank_charges', 'amount',
        'issuer_bank', 'payment_method_v2', 'terminal', 'epp_type', 'status', 'payment_method',
        'created_by', 'linked_agent', 'remark', 'linked_invoice', 'linked_customer', 'attachment',
        'verified_by', 'edit_history', 'log',
    ],
    customer_history: [
        'history_id', 'customer_id', 'name', 'email', 'phone', 'address', 'city', 'state', 'postcode',
        'ic_number', 'notes', 'version', 'changed_by', 'changed_at', 'change_operation',
    ],
    customer_snapshot: [
        'snapshot_id', 'customer_id', 'customer_id_text', 'name', 'email', 'phone', 'address', 'city',
        'state', 'postcode', 'ic_number', 'linked_seda_registration', 'linked_old_customer', 'notes',
        'version', 'updated_by', 'created_by', 'created_at', 'updated_at', 'last_synced_at',
        'snapshot_operation', 'snapshot_created_at', 'snapshot_created_by',
    ],
    hybrid_inverter_upgrade_rule: [
        'id', 'bubble_id', 'rule_type', 'phase_scope', 'from_model_code', 'from_product_bubble_id',
        'from_product_name_snapshot', 'to_model_code', 'to_product_bubble_id',
        'to_product_name_snapshot', 'addon_model_code', 'addon_product_bubble_id',
        'addon_product_name_snapshot', 'price_amount', 'currency_code', 'stock_ready', 'active',
        'notes', 'sort_order', 'created_at', 'updated_at',
    ],
    app_settings: ['id', 'key', 'value', 'updated_at'],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getDataTypeBadge(col: ColumnInfo) {
    const type = col.dataType.toLowerCase();
    if (type.includes('[]') || type === 'array') return 'bg-purple-100 text-purple-800';
    if (type.includes('timestamp') || type.includes('date') || type.includes('time'))
        return 'bg-blue-100 text-blue-800';
    if (type === 'integer' || type === 'bigint' || type === 'smallint' || type === 'serial' || type === 'bigserial')
        return 'bg-green-100 text-green-800';
    if (type === 'numeric' || type === 'decimal' || type === 'real' || type === 'double precision')
        return 'bg-emerald-100 text-emerald-800';
    if (type === 'boolean') return 'bg-orange-100 text-orange-800';
    if (type === 'jsonb' || type === 'json') return 'bg-pink-100 text-pink-800';
    if (type === 'text' || type.includes('char')) return 'bg-slate-100 text-slate-700';
    return 'bg-gray-100 text-gray-700';
}

function formatDefault(val: string | null) {
    if (!val) return null;
    if (val.length > 40) return val.substring(0, 40) + '…';
    return val;
}

// ─── Column Row ───────────────────────────────────────────────────────────────
function ColumnRow({
    col,
    isNewInDb,
}: {
    col: ColumnInfo;
    isNewInDb: boolean;
}) {
    const [copied, setCopied] = useState(false);

    const copy = () => {
        navigator.clipboard.writeText(col.name);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <tr
            className={`border-b border-slate-100 text-sm transition-colors ${isNewInDb
                ? 'bg-amber-50 hover:bg-amber-100'
                : 'hover:bg-slate-50'
                }`}
        >
            {/* Ordinal */}
            <td className="px-3 py-2 text-slate-400 text-xs font-mono w-8 select-none">
                {col.ordinalPosition}
            </td>

            {/* Column name */}
            <td className="px-3 py-2 font-mono font-semibold text-slate-900">
                <div className="flex items-center gap-1.5">
                    {col.isPrimaryKey && (
                        <span title="Primary Key">
                            <Key className="h-3 w-3 text-yellow-500 flex-shrink-0" />
                        </span>
                    )}
                    {col.foreignKey && (
                        <span title={`FK → ${col.foreignKey.foreignTable}.${col.foreignKey.foreignColumn}`}>
                            <Link className="h-3 w-3 text-blue-500 flex-shrink-0" />
                        </span>
                    )}
                    <span>{col.name}</span>
                    {isNewInDb && (
                        <span className="ml-1 text-xs font-sans font-semibold text-amber-700 bg-amber-200 px-1.5 py-0.5 rounded-full">
                            NEW
                        </span>
                    )}
                    <button
                        onClick={copy}
                        className="ml-1 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-700 transition-opacity"
                        title="Copy column name"
                    >
                        {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                    </button>
                </div>
            </td>

            {/* Data type */}
            <td className="px-3 py-2">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium ${getDataTypeBadge(col)}`}>
                    {col.dataType}
                    {col.maxLength ? `(${col.maxLength})` : ''}
                    {col.numericPrecision && col.numericScale
                        ? `(${col.numericPrecision},${col.numericScale})`
                        : ''}
                </span>
            </td>

            {/* Nullable */}
            <td className="px-3 py-2 text-center">
                {col.nullable ? (
                    <span className="text-orange-500 text-xs">NULL</span>
                ) : (
                    <span className="text-green-600 text-xs font-semibold">NOT NULL</span>
                )}
            </td>

            {/* Default */}
            <td className="px-3 py-2 font-mono text-xs text-slate-500 max-w-[200px] truncate">
                {formatDefault(col.default) || <span className="text-slate-300">—</span>}
            </td>

            {/* FK */}
            <td className="px-3 py-2 text-xs text-blue-600 font-mono">
                {col.foreignKey
                    ? `→ ${col.foreignKey.foreignTable}.${col.foreignKey.foreignColumn}`
                    : <span className="text-slate-300">—</span>}
            </td>

            {/* Indexes */}
            <td className="px-3 py-2 text-xs text-slate-500">
                {col.indexes.length > 0
                    ? col.indexes.map((idx, i) => (
                        <span key={i} className="inline-block bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded mr-1 mb-1 font-mono text-[10px]">
                            {idx}
                        </span>
                    ))
                    : <span className="text-slate-300">—</span>}
            </td>
        </tr>
    );
}

// ─── Table Card ───────────────────────────────────────────────────────────────
function TableCard({
    table,
    isExpanded,
    onToggle,
    searchQuery,
    onlyNew,
}: {
    table: TableInfo;
    isExpanded: boolean;
    onToggle: () => void;
    searchQuery: string;
    onlyNew: boolean;
}) {
    const knownCols = SCHEMA_TS_COLUMNS[table.tableName] || null;

    const newCols = knownCols
        ? table.columns.filter((c) => !knownCols.includes(c.name))
        : [];

    const filteredCols = useMemo(() => {
        let cols = table.columns;
        if (searchQuery) {
            cols = cols.filter(
                (c) =>
                    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    c.dataType.toLowerCase().includes(searchQuery.toLowerCase())
            );
        }
        if (onlyNew && knownCols) {
            cols = cols.filter((c) => !knownCols.includes(c.name));
        }
        return cols;
    }, [table.columns, searchQuery, onlyNew, knownCols]);

    const hasNewCols = newCols.length > 0;
    const isUnknownTable = !knownCols;

    return (
        <div
            className={`rounded-xl border transition-all duration-200 overflow-hidden ${hasNewCols
                ? 'border-amber-300 shadow-sm shadow-amber-100'
                : isUnknownTable
                    ? 'border-purple-200'
                    : 'border-slate-200'
                }`}
        >
            {/* Table header */}
            <button
                onClick={onToggle}
                className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${hasNewCols
                    ? 'bg-amber-50 hover:bg-amber-100'
                    : isUnknownTable
                        ? 'bg-purple-50 hover:bg-purple-100'
                        : 'bg-white hover:bg-slate-50'
                    }`}
            >
                <div className="flex items-center gap-3 min-w-0">
                    {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-slate-500 flex-shrink-0" />
                    ) : (
                        <ChevronRight className="h-4 w-4 text-slate-500 flex-shrink-0" />
                    )}
                    <Table2 className={`h-4 w-4 flex-shrink-0 ${hasNewCols ? 'text-amber-600' : isUnknownTable ? 'text-purple-500' : 'text-slate-500'}`} />
                    <span className="font-mono font-semibold text-slate-900 truncate">
                        {table.tableName}
                    </span>
                    {isUnknownTable && (
                        <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-sans">
                            not in schema.ts
                        </span>
                    )}
                    {hasNewCols && (
                        <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full font-semibold font-sans flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            {newCols.length} new column{newCols.length > 1 ? 's' : ''}
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-4 text-xs text-slate-500 flex-shrink-0 ml-4">
                    <span className="font-mono">{table.columns.length} cols</span>
                    {table.rowEstimate != null && (
                        <span>{Number(table.rowEstimate).toLocaleString()} rows</span>
                    )}
                    {table.totalSize && <span>{table.totalSize}</span>}
                </div>
            </button>

            {/* Columns table */}
            {isExpanded && (
                <div className="overflow-x-auto border-t border-slate-200">
                    {filteredCols.length === 0 ? (
                        <div className="p-6 text-center text-slate-400 text-sm">
                            No columns match the current filter.
                        </div>
                    ) : (
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                    <th className="px-3 py-2 w-8">#</th>
                                    <th className="px-3 py-2">Column</th>
                                    <th className="px-3 py-2">Type</th>
                                    <th className="px-3 py-2 text-center">Null</th>
                                    <th className="px-3 py-2">Default</th>
                                    <th className="px-3 py-2">Foreign Key</th>
                                    <th className="px-3 py-2">Indexes</th>
                                </tr>
                            </thead>
                            <tbody className="group">
                                {filteredCols.map((col) => {
                                    const isNew = knownCols ? !knownCols.includes(col.name) : false;
                                    return (
                                        <ColumnRow key={col.name} col={col} isNewInDb={isNew} />
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function DbInspectorPage() {
    const [schema, setSchema] = useState<DbSchema | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [tableFilter, setTableFilter] = useState('');
    const [onlyNew, setOnlyNew] = useState(false);
    const [onlyDrift, setOnlyDrift] = useState(false);

    const fetchSchema = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/db-inspector', { cache: 'no-store' });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'Unknown error');
            setSchema(data);
            // Auto-expand invoice table
            setExpandedTables(new Set(['invoice']));
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSchema();
    }, []);

    const toggleTable = (name: string) => {
        setExpandedTables((prev) => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });
    };

    const expandAll = () => {
        if (schema) setExpandedTables(new Set(schema.tables.map((t) => t.tableName)));
    };

    const collapseAll = () => setExpandedTables(new Set());

    // Summary stats
    const driftTables = useMemo(() => {
        if (!schema) return [];
        return schema.tables.filter((t) => {
            const known = SCHEMA_TS_COLUMNS[t.tableName];
            if (!known) return false;
            return t.columns.some((c) => !known.includes(c.name));
        });
    }, [schema]);

    const unknownTables = useMemo(() => {
        if (!schema) return [];
        return schema.tables.filter((t) => !SCHEMA_TS_COLUMNS[t.tableName]);
    }, [schema]);

    // Filtered tables
    const filteredTables = useMemo(() => {
        if (!schema) return [];
        let tables = schema.tables;
        if (tableFilter) {
            tables = tables.filter((t) =>
                t.tableName.toLowerCase().includes(tableFilter.toLowerCase())
            );
        }
        if (onlyDrift) {
            tables = tables.filter((t) => {
                const known = SCHEMA_TS_COLUMNS[t.tableName];
                if (!known) return true; // unknown tables are "drift" too
                return t.columns.some((c) => !known.includes(c.name));
            });
        }
        return tables;
    }, [schema, tableFilter, onlyDrift]);

    return (
        <div className="space-y-6 max-w-full">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                        <Database className="h-8 w-8 text-indigo-600" />
                        Live DB Inspector
                    </h1>
                    <p className="text-slate-500 mt-1 text-sm">
                        Real-time schema from PostgreSQL —{' '}
                        {schema && (
                            <span className="font-mono text-xs text-slate-400">
                                fetched {new Date(schema.fetchedAt).toLocaleTimeString()}
                            </span>
                        )}
                    </p>
                </div>
                <button
                    onClick={fetchSchema}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    {loading ? 'Fetching…' : 'Refresh Schema'}
                </button>
            </div>

            {/* Error */}
            {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="font-semibold">Failed to fetch live schema</p>
                        <p className="font-mono text-xs mt-1">{error}</p>
                    </div>
                </div>
            )}

            {/* Stats */}
            {schema && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="bg-white rounded-xl border border-slate-200 p-4">
                        <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Tables in DB</p>
                        <p className="text-3xl font-bold text-slate-900 mt-1">{schema.totalTables}</p>
                    </div>
                    <div className={`rounded-xl border p-4 ${driftTables.length > 0 ? 'bg-amber-50 border-amber-300' : 'bg-white border-slate-200'}`}>
                        <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Schema Drift</p>
                        <p className={`text-3xl font-bold mt-1 ${driftTables.length > 0 ? 'text-amber-700' : 'text-green-600'}`}>
                            {driftTables.length}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">tables with new columns</p>
                    </div>
                    <div className={`rounded-xl border p-4 ${unknownTables.length > 0 ? 'bg-purple-50 border-purple-200' : 'bg-white border-slate-200'}`}>
                        <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Unknown Tables</p>
                        <p className={`text-3xl font-bold mt-1 ${unknownTables.length > 0 ? 'text-purple-700' : 'text-green-600'}`}>
                            {unknownTables.length}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">not in schema.ts</p>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200 p-4">
                        <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Total Columns</p>
                        <p className="text-3xl font-bold text-slate-900 mt-1">
                            {schema.tables.reduce((acc, t) => acc + t.columns.length, 0)}
                        </p>
                    </div>
                </div>
            )}

            {/* Drift Alert */}
            {schema && driftTables.length > 0 && (
                <div className="bg-amber-50 border border-amber-300 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="font-semibold text-amber-800">Schema Drift Detected</p>
                            <p className="text-sm text-amber-700 mt-1">
                                The following tables have columns in the live DB that are{' '}
                                <strong>missing from <code>schema.ts</code></strong>:
                            </p>
                            <div className="flex flex-wrap gap-2 mt-2">
                                {driftTables.map((t) => {
                                    const known = SCHEMA_TS_COLUMNS[t.tableName]!;
                                    const newCols = t.columns.filter((c) => !known.includes(c.name));
                                    return (
                                        <button
                                            key={t.tableName}
                                            onClick={() => {
                                                setTableFilter(t.tableName);
                                                setExpandedTables((prev) => new Set([...prev, t.tableName]));
                                            }}
                                            className="text-xs bg-amber-200 text-amber-900 px-3 py-1 rounded-full font-mono hover:bg-amber-300 transition-colors"
                                        >
                                            {t.tableName} (+{newCols.length})
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Controls */}
            {schema && (
                <div className="flex flex-col sm:flex-row gap-3">
                    {/* Table search */}
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Filter tables…"
                            value={tableFilter}
                            onChange={(e) => setTableFilter(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                    </div>

                    {/* Column search */}
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search columns / types…"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            onClick={() => setOnlyNew((v) => !v)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${onlyNew
                                ? 'bg-amber-100 border-amber-400 text-amber-800'
                                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                                }`}
                        >
                            <Filter className="h-3.5 w-3.5" />
                            New only
                        </button>
                        <button
                            onClick={() => setOnlyDrift((v) => !v)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${onlyDrift
                                ? 'bg-amber-100 border-amber-400 text-amber-800'
                                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                                }`}
                        >
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Drift tables
                        </button>
                        <button
                            onClick={expandAll}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-slate-200 bg-white text-slate-600 hover:border-slate-300 transition-colors"
                        >
                            <Eye className="h-3.5 w-3.5" />
                            Expand all
                        </button>
                        <button
                            onClick={collapseAll}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-slate-200 bg-white text-slate-600 hover:border-slate-300 transition-colors"
                        >
                            <EyeOff className="h-3.5 w-3.5" />
                            Collapse
                        </button>
                    </div>
                </div>
            )}

            {/* Tables */}
            {loading && !schema && (
                <div className="flex flex-col items-center justify-center py-24 gap-4 text-slate-400">
                    <RefreshCw className="h-10 w-10 animate-spin text-indigo-400" />
                    <p className="text-sm">Connecting to live database…</p>
                </div>
            )}

            {schema && (
                <div className="space-y-3">
                    {filteredTables.length === 0 ? (
                        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400 text-sm">
                            No tables match your filter.
                        </div>
                    ) : (
                        filteredTables.map((table) => (
                            <TableCard
                                key={table.tableName}
                                table={table}
                                isExpanded={expandedTables.has(table.tableName)}
                                onToggle={() => toggleTable(table.tableName)}
                                searchQuery={searchQuery}
                                onlyNew={onlyNew}
                            />
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
