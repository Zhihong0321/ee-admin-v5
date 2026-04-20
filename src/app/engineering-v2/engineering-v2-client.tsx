"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { User } from "@/lib/auth";
import {
    Search,
    SlidersHorizontal,
    ChevronDown,
    ChevronRight,
    X,
    ExternalLink,
    Image as ImageIcon,
    FileText,
    Layers,
    Wrench,
    CheckCircle2,
    XCircle,
    AlertCircle,
    RefreshCw,
    ZoomIn,
    Download,
    MapPin,
    User as UserIcon,
    Phone,
    Calendar,
    DollarSign,
    BarChart3,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface InvoiceRow {
    id: number;
    bubble_id: string;
    invoice_number: string | null;
    invoice_date: string | null;
    created_at: string | null;
    status: string | null;
    case_status: string | null;
    installation_status: string | null;
    state: string | null;
    total_amount: number | null;
    amount: number | null;
    percent_paid: number;
    customer_name: string | null;
    customer_phone: string | null;
    agent_name: string | null;
    installation_address: string | null;
    seda_bubble_id: string | null;
    seda_status: string | null;
    roof_images: string[];
    site_assessment: string[];
    pv_drawing: string[];
    eng_drawing: string[];
    roof_count: number;
    site_count: number;
    pv_count: number;
    eng_count: number;
    total_attachments: number;
}

interface ApiResponse {
    success: boolean;
    fetchedAt: string;
    total: number;
    invoices: InvoiceRow[];
}

type AttachmentKey = "roof" | "site" | "pv" | "eng";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtAmount(val: number | null) {
    if (val == null) return "—";
    return `RM ${val.toLocaleString("en-MY", { minimumFractionDigits: 0 })}`;
}

function fmtDate(val: string | null) {
    if (!val) return "—";
    return new Date(val).toLocaleDateString("en-MY", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
}

function isImage(url: string) {
    return /\.(jpg|jpeg|png|gif|webp|heic)(\?|$)/i.test(url);
}

function isPdf(url: string) {
    return /\.pdf(\?|$)/i.test(url);
}

function filename(url: string) {
    try {
        const u = new URL(url);
        const parts = u.pathname.split("/");
        return decodeURIComponent(parts[parts.length - 1]);
    } catch {
        return url.split("/").pop() || url;
    }
}

const ATTACHMENT_META: Record<
    AttachmentKey,
    { label: string; color: string; bg: string; Icon: React.ElementType }
> = {
    roof: {
        label: "Roof Images",
        color: "text-sky-700",
        bg: "bg-sky-50 border-sky-200",
        Icon: ImageIcon,
    },
    site: {
        label: "Site Assessment",
        color: "text-emerald-700",
        bg: "bg-emerald-50 border-emerald-200",
        Icon: Wrench,
    },
    pv: {
        label: "PV System Drawing",
        color: "text-violet-700",
        bg: "bg-violet-50 border-violet-200",
        Icon: Layers,
    },
    eng: {
        label: "Engineering Drawing",
        color: "text-orange-700",
        bg: "bg-orange-50 border-orange-200",
        Icon: FileText,
    },
};

// ─── Badge ────────────────────────────────────────────────────────────────────

function AttachBadge({
    count,
    type,
    onClick,
}: {
    count: number;
    type: AttachmentKey;
    onClick?: () => void;
}) {
    const { label, color, bg, Icon } = ATTACHMENT_META[type];
    const hasFiles = count > 0;

    return (
        <button
            title={hasFiles ? `${count} ${label}` : `No ${label}`}
            onClick={onClick}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold transition-all
        ${hasFiles ? `${bg} ${color} hover:opacity-80 cursor-pointer` : "bg-gray-50 border-gray-200 text-gray-400 cursor-default"}
      `}
        >
            <Icon className="h-3 w-3 flex-shrink-0" />
            {hasFiles ? count : "—"}
        </button>
    );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function PaymentBar({ pct }: { pct: number }) {
    const clamped = Math.min(100, Math.max(0, pct));
    const color =
        clamped >= 100
            ? "bg-emerald-500"
            : clamped >= 50
                ? "bg-amber-400"
                : "bg-red-400";

    return (
        <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all ${color}`}
                    style={{ width: `${clamped}%` }}
                />
            </div>
            <span className="text-xs font-mono text-gray-500 w-8 text-right">
                {clamped.toFixed(0)}%
            </span>
        </div>
    );
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function Lightbox({
    urls,
    index,
    onClose,
    onPrev,
    onNext,
}: {
    urls: string[];
    index: number;
    onClose: () => void;
    onPrev: () => void;
    onNext: () => void;
}) {
    const url = urls[index];
    const total = urls.length;

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowLeft") onPrev();
            if (e.key === "ArrowRight") onNext();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose, onPrev, onNext]);

    return (
        <div
            className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center"
            onClick={onClose}
        >
            <div
                className="relative max-w-5xl w-full mx-4 flex flex-col items-center"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Toolbar */}
                <div className="flex items-center justify-between w-full mb-3 px-2">
                    <span className="text-white/60 text-sm font-mono">
                        {index + 1} / {total}
                    </span>
                    <div className="flex items-center gap-3">
                        <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-white/70 hover:text-white transition"
                            title="Open in new tab"
                        >
                            <ExternalLink className="h-5 w-5" />
                        </a>
                        <a
                            href={url}
                            download
                            className="text-white/70 hover:text-white transition"
                            title="Download"
                        >
                            <Download className="h-5 w-5" />
                        </a>
                        <button
                            onClick={onClose}
                            className="text-white/70 hover:text-white transition"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                {/* Image or PDF */}
                {isPdf(url) ? (
                    <div className="bg-white/10 rounded-xl p-8 text-center">
                        <FileText className="h-16 w-16 text-white/50 mx-auto mb-4" />
                        <p className="text-white text-sm mb-4 break-all">{filename(url)}</p>
                        <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg transition"
                        >
                            <ExternalLink className="h-4 w-4" />
                            Open PDF
                        </a>
                    </div>
                ) : (
                    <img
                        src={url}
                        alt="Attachment"
                        className="max-h-[75vh] max-w-full object-contain rounded-lg shadow-2xl"
                    />
                )}

                {/* Nav arrows */}
                {total > 1 && (
                    <>
                        <button
                            onClick={onPrev}
                            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 bg-white/10 hover:bg-white/20 text-white rounded-full p-2 transition"
                        >
                            <ChevronDown className="h-5 w-5 rotate-90" />
                        </button>
                        <button
                            onClick={onNext}
                            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 bg-white/10 hover:bg-white/20 text-white rounded-full p-2 transition"
                        >
                            <ChevronDown className="h-5 w-5 -rotate-90" />
                        </button>
                    </>
                )}

                {/* Filename */}
                <p className="text-white/40 text-xs mt-3 text-center break-all max-w-md px-4">
                    {filename(url)}
                </p>
            </div>
        </div>
    );
}

// ─── File Grid ────────────────────────────────────────────────────────────────

function FileGrid({
    urls,
    type,
}: {
    urls: string[];
    type: AttachmentKey;
}) {
    const [lightbox, setLightbox] = useState<{ index: number } | null>(null);
    const { Icon, color, bg } = ATTACHMENT_META[type];

    if (urls.length === 0)
        return (
            <p className="text-gray-400 text-sm italic py-2">No files uploaded.</p>
        );

    return (
        <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {urls.map((url, i) => (
                    <div
                        key={i}
                        className="group relative rounded-xl border border-gray-200 overflow-hidden bg-gray-50 hover:shadow-md transition-all cursor-pointer"
                        onClick={() => setLightbox({ index: i })}
                    >
                        {isImage(url) ? (
                            <>
                                <img
                                    src={url}
                                    alt={`Attachment ${i + 1}`}
                                    className="w-full h-28 object-cover group-hover:opacity-90 transition"
                                    onError={(e) => ((e.currentTarget as HTMLImageElement).src = "")}
                                />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition flex items-center justify-center opacity-0 group-hover:opacity-100">
                                    <ZoomIn className="h-7 w-7 text-white drop-shadow-lg" />
                                </div>
                            </>
                        ) : (
                            <div className={`h-28 flex flex-col items-center justify-center gap-2 ${bg}`}>
                                <FileText className={`h-8 w-8 ${color}`} />
                                <span className="text-xs text-center text-gray-500 px-2 truncate w-full text-center">
                                    {filename(url)}
                                </span>
                            </div>
                        )}
                        {/* Footer bar */}
                        <div className="px-2 py-1.5 text-xs text-gray-500 border-t border-gray-100 truncate">
                            {filename(url)}
                        </div>
                    </div>
                ))}
            </div>

            {lightbox && (
                <Lightbox
                    urls={urls}
                    index={lightbox.index}
                    onClose={() => setLightbox(null)}
                    onPrev={() =>
                        setLightbox({ index: (lightbox.index - 1 + urls.length) % urls.length })
                    }
                    onNext={() =>
                        setLightbox({ index: (lightbox.index + 1) % urls.length })
                    }
                />
            )}
        </>
    );
}

// ─── Invoice Detail Panel ─────────────────────────────────────────────────────

function InvoiceDetail({
    invoice,
    onClose,
}: {
    invoice: InvoiceRow;
    onClose: () => void;
}) {
    const [activeTab, setActiveTab] = useState<AttachmentKey>("roof");

    const tabs: { key: AttachmentKey; urls: string[] }[] = [
        { key: "roof", urls: invoice.roof_images },
        { key: "site", urls: invoice.site_assessment },
        { key: "pv", urls: invoice.pv_drawing },
        { key: "eng", urls: invoice.eng_drawing },
    ];

    return (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">

                {/* Header */}
                <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h2 className="text-xl font-bold text-gray-900">
                                {invoice.invoice_number || invoice.bubble_id}
                            </h2>
                            {invoice.status && (
                                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
                                    {invoice.status}
                                </span>
                            )}
                            {invoice.installation_status && (
                                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
                                    {invoice.installation_status}
                                </span>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-500">
                            {invoice.customer_name && (
                                <span className="flex items-center gap-1">
                                    <UserIcon className="h-3.5 w-3.5" />
                                    {invoice.customer_name}
                                </span>
                            )}
                            {invoice.customer_phone && (
                                <span className="flex items-center gap-1">
                                    <Phone className="h-3.5 w-3.5" />
                                    {invoice.customer_phone}
                                </span>
                            )}
                            {invoice.agent_name && (
                                <span className="flex items-center gap-1 text-indigo-600">
                                    <UserIcon className="h-3.5 w-3.5" />
                                    Agent: {invoice.agent_name}
                                </span>
                            )}
                            {invoice.installation_address && (
                                <span className="flex items-center gap-1">
                                    <MapPin className="h-3.5 w-3.5" />
                                    {invoice.installation_address}
                                </span>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Summary Strip */}
                <div className="grid grid-cols-4 divide-x divide-gray-100 bg-gray-50 border-b border-gray-100">
                    <div className="px-5 py-3 text-center">
                        <p className="text-xs text-gray-400 mb-0.5">Total Amount</p>
                        <p className="text-base font-bold text-gray-900">
                            {fmtAmount(invoice.total_amount || invoice.amount)}
                        </p>
                    </div>
                    <div className="px-5 py-3 text-center">
                        <p className="text-xs text-gray-400 mb-0.5">Payment %</p>
                        <p className="text-base font-bold text-emerald-600">
                            {invoice.percent_paid.toFixed(0)}%
                        </p>
                    </div>
                    <div className="px-5 py-3 text-center">
                        <p className="text-xs text-gray-400 mb-0.5">Invoice Date</p>
                        <p className="text-sm font-medium text-gray-700">
                            {fmtDate(invoice.invoice_date)}
                        </p>
                    </div>
                    <div className="px-5 py-3 text-center">
                        <p className="text-xs text-gray-400 mb-0.5">SEDA Status</p>
                        <p className="text-sm font-medium text-gray-700">
                            {invoice.seda_status || "—"}
                        </p>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-100 px-4 pt-2 gap-1">
                    {tabs.map(({ key, urls }) => {
                        const { label, color, Icon } = ATTACHMENT_META[key];
                        const active = activeTab === key;
                        return (
                            <button
                                key={key}
                                onClick={() => setActiveTab(key)}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-sm font-semibold transition border-b-2 -mb-[1px]
                  ${active
                                        ? `border-current ${color} bg-white`
                                        : "border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                                    }`}
                            >
                                <Icon className="h-4 w-4" />
                                {label}
                                <span
                                    className={`ml-1 px-1.5 py-0 rounded-full text-xs font-bold
                    ${urls.length > 0 ? "bg-current text-white" :
                                            active ? `${color} opacity-40` : "bg-gray-200 text-gray-500"
                                        }`}
                                    style={urls.length > 0 ? { color: "white" } : {}}
                                >
                                    {urls.length}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* File Display */}
                <div className="flex-1 overflow-y-auto p-6">
                    {tabs.map(({ key, urls }) =>
                        activeTab === key ? (
                            <FileGrid key={key} urls={urls} type={key} />
                        ) : null
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Main Client ──────────────────────────────────────────────────────────────

export function EngineeringV2Client({ user }: { user: User }) {
    const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRow | null>(null);
    const [showFilter, setShowFilter] = useState(false);
    const [minPct, setMinPct] = useState(0);
    const [maxPct, setMaxPct] = useState(100);
    const [pendingMin, setPendingMin] = useState(0);
    const [pendingMax, setPendingMax] = useState(100);
    const [lastFetch, setLastFetch] = useState<Date | null>(null);
    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Debounce search
    useEffect(() => {
        if (searchTimer.current) clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => setDebouncedSearch(search), 400);
        return () => {
            if (searchTimer.current) clearTimeout(searchTimer.current);
        };
    }, [search]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({
                limit: "200",
                minPct: String(minPct),
                maxPct: String(maxPct),
            });
            if (debouncedSearch) params.set("search", debouncedSearch);

            const res = await fetch(`/api/engineering-v2?${params}`);
            const data: ApiResponse = await res.json();
            if (!data.success) throw new Error(data.invoices?.length === 0 ? "No data" : "API error");
            setInvoices(data.invoices);
            setLastFetch(new Date());
        } catch (e: any) {
            setError(e.message || "Failed to load");
        } finally {
            setLoading(false);
        }
    }, [debouncedSearch, minPct, maxPct]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    function applyFilter() {
        setMinPct(pendingMin);
        setMaxPct(pendingMax);
        setShowFilter(false);
    }

    // Stats
    const stats = {
        total: invoices.length,
        withRoof: invoices.filter((i) => i.roof_count > 0).length,
        withSite: invoices.filter((i) => i.site_count > 0).length,
        withPV: invoices.filter((i) => i.pv_count > 0).length,
        withEng: invoices.filter((i) => i.eng_count > 0).length,
        missingAll: invoices.filter((i) => i.total_attachments === 0).length,
        complete: invoices.filter(
            (i) => i.roof_count > 0 && i.site_count > 0 && i.pv_count > 0 && i.eng_count > 0
        ).length,
    };

    return (
        <div className="min-h-screen bg-[#f8f9fb]">

            {/* ── Top Header ── */}
            <div className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
                <div className="px-6 py-4 flex items-center justify-between gap-4">
                    <div>
                        <h1 className="text-xl font-bold text-gray-900 tracking-tight">
                            Engineering V2
                        </h1>
                        <p className="text-xs text-gray-400 mt-0.5">
                            Attachment tracker · {lastFetch ? `Updated ${lastFetch.toLocaleTimeString()}` : "Loading…"}
                        </p>
                    </div>

                    {/* Search + Filter */}
                    <div className="flex items-center gap-3 flex-1 max-w-xl">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search invoice, customer, agent, address…"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 transition"
                            />
                            {search && (
                                <button
                                    onClick={() => setSearch("")}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>

                        {/* Filter toggle */}
                        <div className="relative">
                            <button
                                onClick={() => setShowFilter((v) => !v)}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition
                  ${(minPct > 0 || maxPct < 100)
                                        ? "bg-indigo-600 border-indigo-600 text-white"
                                        : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                                    }`}
                            >
                                <SlidersHorizontal className="h-4 w-4" />
                                Filter
                                {(minPct > 0 || maxPct < 100) && (
                                    <span className="text-xs opacity-80">{minPct}–{maxPct}%</span>
                                )}
                            </button>

                            {showFilter && (
                                <div className="absolute right-0 top-full mt-2 bg-white rounded-2xl border border-gray-200 shadow-xl p-5 w-72 z-40">
                                    <p className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
                                        <BarChart3 className="h-4 w-4 text-indigo-500" />
                                        Payment % filter
                                    </p>
                                    <div className="space-y-3">
                                        <div>
                                            <label className="text-xs text-gray-500 mb-1 block">Min %</label>
                                            <input
                                                type="range"
                                                min={0}
                                                max={100}
                                                step={5}
                                                value={pendingMin}
                                                onChange={(e) => setPendingMin(Number(e.target.value))}
                                                className="w-full accent-indigo-500"
                                            />
                                            <p className="text-xs text-right text-gray-500">{pendingMin}%</p>
                                        </div>
                                        <div>
                                            <label className="text-xs text-gray-500 mb-1 block">Max %</label>
                                            <input
                                                type="range"
                                                min={0}
                                                max={100}
                                                step={5}
                                                value={pendingMax}
                                                onChange={(e) => setPendingMax(Number(e.target.value))}
                                                className="w-full accent-indigo-500"
                                            />
                                            <p className="text-xs text-right text-gray-500">{pendingMax}%</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 mt-4">
                                        <button
                                            onClick={() => {
                                                setPendingMin(0);
                                                setPendingMax(100);
                                                setMinPct(0);
                                                setMaxPct(100);
                                                setShowFilter(false);
                                            }}
                                            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition"
                                        >
                                            Reset
                                        </button>
                                        <button
                                            onClick={applyFilter}
                                            className="flex-1 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition"
                                        >
                                            Apply
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Refresh */}
                        <button
                            onClick={fetchData}
                            disabled={loading}
                            className="p-2.5 rounded-xl border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 transition disabled:opacity-50"
                            title="Refresh"
                        >
                            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                        </button>
                    </div>
                </div>

                {/* ── Stats Row ── */}
                <div className="px-6 pb-4 flex flex-wrap gap-3">
                    {[
                        { label: "Total Invoices", val: stats.total, color: "text-gray-700" },
                        { label: "With Roof", val: stats.withRoof, color: "text-sky-600" },
                        { label: "With Site Assessment", val: stats.withSite, color: "text-emerald-600" },
                        { label: "With PV Drawing", val: stats.withPV, color: "text-violet-600" },
                        { label: "With Eng Drawing", val: stats.withEng, color: "text-orange-600" },
                        { label: "✓ Complete", val: stats.complete, color: "text-emerald-700 font-bold" },
                        { label: "⚠ No Attachments", val: stats.missingAll, color: "text-red-600" },
                    ].map((s) => (
                        <div
                            key={s.label}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200"
                        >
                            <span className={`text-base font-bold ${s.color}`}>{s.val}</span>
                            <span className="text-xs text-gray-500">{s.label}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Content ── */}
            <div className="px-6 py-5">
                {error && (
                    <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-5 text-red-700 text-sm">
                        <AlertCircle className="h-4 w-4 flex-shrink-0" />
                        {error}
                        <button onClick={fetchData} className="ml-auto underline text-red-600 hover:text-red-800 text-xs">
                            Retry
                        </button>
                    </div>
                )}

                {loading && (
                    <div className="flex items-center justify-center py-24 text-gray-400">
                        <RefreshCw className="h-6 w-6 animate-spin mr-3" />
                        <span className="text-sm">Loading invoices…</span>
                    </div>
                )}

                {!loading && !error && (
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                        {/* Table Header */}
                        <div className="grid grid-cols-[200px_160px_140px_auto_46px_46px_46px_46px_32px] gap-3 px-5 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                            <div>Customer / Invoice</div>
                            <div>Agent</div>
                            <div>Amount</div>
                            <div>Payment Progress</div>
                            <div className="text-center text-sky-600" title="Roof Images">
                                <ImageIcon className="h-3.5 w-3.5 mx-auto" />
                            </div>
                            <div className="text-center text-emerald-600" title="Site Assessment">
                                <Wrench className="h-3.5 w-3.5 mx-auto" />
                            </div>
                            <div className="text-center text-violet-600" title="PV Drawing">
                                <Layers className="h-3.5 w-3.5 mx-auto" />
                            </div>
                            <div className="text-center text-orange-600" title="Engineering Drawing">
                                <FileText className="h-3.5 w-3.5 mx-auto" />
                            </div>
                            <div />
                        </div>

                        {/* Rows */}
                        {invoices.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                                <Search className="h-8 w-8 mb-3 opacity-30" />
                                <p className="text-sm font-medium">No invoices found</p>
                                <p className="text-xs mt-1 opacity-70">Try adjusting your search or filters</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-100">
                                {invoices.map((inv) => (
                                    <InvoiceRow
                                        key={inv.id}
                                        invoice={inv}
                                        onView={() => setSelectedInvoice(inv)}
                                    />
                                ))}
                            </div>
                        )}

                        {/* Footer count */}
                        {invoices.length > 0 && (
                            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">
                                Showing {invoices.length} invoices
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Invoice Detail Panel ── */}
            {selectedInvoice && (
                <InvoiceDetail
                    invoice={selectedInvoice}
                    onClose={() => setSelectedInvoice(null)}
                />
            )}
        </div>
    );
}

// ─── Invoice Row ──────────────────────────────────────────────────────────────

function InvoiceRow({
    invoice,
    onView,
}: {
    invoice: InvoiceRow;
    onView: () => void;
}) {
    const allComplete =
        invoice.roof_count > 0 &&
        invoice.site_count > 0 &&
        invoice.pv_count > 0 &&
        invoice.eng_count > 0;

    return (
        <div
            className={`grid grid-cols-[200px_160px_140px_auto_46px_46px_46px_46px_32px] gap-3 px-5 py-3.5 items-center hover:bg-indigo-50/40 transition group cursor-pointer`}
            onClick={onView}
        >
            {/* Customer + Invoice Number */}
            <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">
                    {invoice.customer_name || "Unknown Customer"}
                </p>
                <p className="text-xs text-gray-400 font-mono truncate">
                    {invoice.invoice_number || invoice.bubble_id}
                </p>
                <p className="text-xs text-gray-400 truncate mt-0.5">
                    {fmtDate(invoice.created_at)}
                </p>
            </div>

            {/* Agent */}
            <div className="min-w-0">
                <p className="text-xs text-indigo-600 font-medium truncate">
                    {invoice.agent_name || "—"}
                </p>
                {invoice.state && (
                    <p className="text-xs text-gray-400 truncate">{invoice.state}</p>
                )}
            </div>

            {/* Amount */}
            <div>
                <p className="text-sm font-bold text-gray-800">
                    {fmtAmount(invoice.total_amount || invoice.amount)}
                </p>
                {invoice.case_status && (
                    <span className="inline-block text-xs px-1.5 py-0 rounded bg-gray-100 text-gray-500 mt-0.5">
                        {invoice.case_status}
                    </span>
                )}
            </div>

            {/* Payment % */}
            <div className="min-w-0">
                <PaymentBar pct={invoice.percent_paid} />
            </div>

            {/* Attachment badge pills */}
            {(["roof", "site", "pv", "eng"] as AttachmentKey[]).map((key) => {
                const count =
                    key === "roof" ? invoice.roof_count
                        : key === "site" ? invoice.site_count
                            : key === "pv" ? invoice.pv_count
                                : invoice.eng_count;
                const { Icon, color, bg } = ATTACHMENT_META[key];
                const hasFiles = count > 0;
                return (
                    <div key={key} className="flex items-center justify-center" title={`${ATTACHMENT_META[key].label}: ${count}`}>
                        <div
                            className={`flex items-center justify-center w-8 h-8 rounded-lg border text-xs font-bold transition
                ${hasFiles
                                    ? `${bg} ${color} border-current/30 group-hover:scale-110`
                                    : "bg-gray-50 border-gray-200 text-gray-300"
                                }`}
                        >
                            {hasFiles ? count : <Icon className="h-3.5 w-3.5" />}
                        </div>
                    </div>
                );
            })}

            {/* Arrow / Complete check */}
            <div className="flex items-center justify-center">
                {allComplete ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : (
                    <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all" />
                )}
            </div>
        </div>
    );
}
