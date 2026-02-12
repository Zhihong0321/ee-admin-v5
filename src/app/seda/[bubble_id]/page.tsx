"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Loader2, FileText, ExternalLink, Save, X, Pencil, Check, RefreshCw, UserPlus, CheckCircle, XCircle, AlertCircle, Clock, Sparkles } from "lucide-react";
import { StatusBadge } from "@/components/seda/status-badge";
import { StatusDropdown } from "@/components/seda/status-dropdown";
import { ProgressBar } from "@/components/seda/progress-bar";
import { DownloadButton } from "@/components/seda/download-button";

// Define all editable fields from seda_registration schema
const SEDA_FIELD_CONFIG: Record<string, { label: string; type: 'text' | 'textarea' | 'number' | 'date' | 'url'; section: string }> = {
  // Customer Information
  email: { label: "Email", type: "text", section: "customer" },
  ic_no: { label: "IC Number", type: "text", section: "customer" },

  // Emergency Contact
  e_contact_name: { label: "Emergency Contact Name", type: "text", section: "emergency" },
  e_contact_no: { label: "Emergency Contact No", type: "text", section: "emergency" },
  e_contact_relationship: { label: "Relationship", type: "text", section: "emergency" },
  e_email: { label: "Emergency Email", type: "text", section: "emergency" },

  // Address & Location
  installation_address: { label: "Installation Address", type: "textarea", section: "address" },
  city: { label: "City", type: "text", section: "address" },
  state: { label: "State", type: "text", section: "address" },

  // Solar System Details
  system_size: { label: "System Size (kW)", type: "number", section: "solar" },
  system_size_in_form_kwp: { label: "System Size in Form (kWp)", type: "number", section: "solar" },
  inverter_kwac: { label: "Inverter kW AC", type: "number", section: "solar" },
  inverter_serial_no: { label: "Inverter Serial No", type: "text", section: "solar" },
  phase_type: { label: "Phase Type", type: "text", section: "solar" },
  sunpeak_hours: { label: "Sunpeak Hours", type: "number", section: "solar" },

  // TNB Information
  tnb_account_no: { label: "TNB Account No", type: "text", section: "tnb" },
  tnb_meter_status: { label: "TNB Meter Status", type: "text", section: "tnb" },
  tnb_meter: { label: "TNB Meter Image URL", type: "url", section: "tnb" },
  tnb_bill_1: { label: "TNB Bill 1 URL", type: "url", section: "tnb" },
  tnb_bill_2: { label: "TNB Bill 2 URL", type: "url", section: "tnb" },
  tnb_bill_3: { label: "TNB Bill 3 URL", type: "url", section: "tnb" },
  average_tnb: { label: "Average TNB", type: "number", section: "tnb" },

  // Financial Information
  project_price: { label: "Project Price (RM)", type: "number", section: "financial" },
  estimated_monthly_saving: { label: "Est. Monthly Saving", type: "number", section: "financial" },
  price_category: { label: "Price Category", type: "text", section: "financial" },

  // NEM / SEDA
  nem_application_no: { label: "NEM Application No", type: "text", section: "nem" },
  nem_type: { label: "NEM Type", type: "text", section: "nem" },
  nem_cert: { label: "NEM Certificate URL", type: "url", section: "nem" },
  seda_status: { label: "SEDA Status", type: "text", section: "nem" },
  reg_status: { label: "Registration Status", type: "text", section: "nem" },
  redex_status: { label: "Redex Status", type: "text", section: "nem" },
  redex_remark: { label: "Redex Remark", type: "textarea", section: "nem" },

  // Documents
  mykad_pdf: { label: "MyKad PDF URL", type: "url", section: "documents" },
  ic_copy_front: { label: "IC Copy Front URL", type: "url", section: "documents" },
  ic_copy_back: { label: "IC Copy Back URL", type: "url", section: "documents" },
  customer_signature: { label: "Customer Signature URL", type: "url", section: "documents" },
  property_ownership_prove: { label: "Property Ownership Proof URL", type: "url", section: "documents" },
  e_contact_mykad: { label: "Emergency Contact MyKad URL", type: "url", section: "documents" },

  // Other
  agent: { label: "Agent", type: "text", section: "agent" },
  special_remark: { label: "Special Remark", type: "textarea", section: "remarks" },
  company_registration_no: { label: "Company Registration No", type: "text", section: "other" },
  slug: { label: "Slug", type: "text", section: "other" },

  // Folder Links
  g_electric_folder_link: { label: "Google Electric Folder", type: "url", section: "folders" },
  g_roof_folder_link: { label: "Google Roof Folder", type: "url", section: "folders" },

  // Check fields
  check_tnb_bill_and_meter_image: { label: "Check TNB Bill & Meter", type: "text", section: "checks" },
  check_mykad: { label: "Check MyKad", type: "text", section: "checks" },
  check_ownership: { label: "Check Ownership", type: "text", section: "checks" },
  check_fill_in_detail: { label: "Check Fill In Detail", type: "text", section: "checks" },
};

interface EditableFieldProps {
  fieldKey: string;
  value: any;
  config: { label: string; type: string };
  onSave: (key: string, value: any) => Promise<void>;
  saving: boolean;
}

function EditableField({ fieldKey, value, config, onSave, saving }: EditableFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [localSaving, setLocalSaving] = useState(false);

  const handleSave = async () => {
    setLocalSaving(true);
    try {
      await onSave(fieldKey, draft);
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to save:", error);
    } finally {
      setLocalSaving(false);
    }
  };

  const handleCancel = () => {
    setDraft(value ?? "");
    setIsEditing(false);
  };

  const displayValue = value ?? "N/A";
  const isUrl = config.type === "url";

  if (!isEditing) {
    return (
      <div className="group">
        <div className="text-sm font-medium text-gray-500 mb-1">{config.label}</div>
        <div className="flex items-start justify-between gap-2">
          <div className="text-gray-900 break-all flex-1">
            {isUrl && value ? (
              <a
                href={value}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 hover:text-primary-700 flex items-center gap-1 text-sm"
              >
                View File <ExternalLink className="w-3 h-3" />
              </a>
            ) : config.type === "number" && value ? (
              parseFloat(value).toLocaleString()
            ) : (
              displayValue
            )}
          </div>
          <button
            onClick={() => {
              setDraft(value ?? "");
              setIsEditing(true);
            }}
            className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded transition-all"
            title="Edit"
          >
            <Pencil className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="text-sm font-medium text-gray-500 mb-1">{config.label}</div>
      <div className="space-y-2">
        {config.type === "textarea" ? (
          <textarea
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 text-sm"
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Enter ${config.label}`}
          />
        ) : (
          <input
            type={config.type === "number" ? "number" : "text"}
            step={config.type === "number" ? "any" : undefined}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 text-sm"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Enter ${config.label}`}
          />
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={localSaving || saving}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md disabled:opacity-60 transition-colors"
          >
            {localSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            Save
          </button>
          <button
            onClick={handleCancel}
            disabled={localSaving}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
          >
            <X className="w-3 h-3" />
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

function Section({ title, children, className = "" }: SectionProps) {
  return (
    <div className={`bg-white border border-gray-200 rounded-lg shadow-sm p-6 ${className}`}>
      <h2 className="text-xl font-semibold text-gray-900 mb-4">{title}</h2>
      {children}
    </div>
  );
}

export default function SedaDetailPage() {
  const router = useRouter();
  const params = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [bubbleId, setBubbleId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [isRawEditing, setIsRawEditing] = useState(false);
  const [rawJson, setRawJson] = useState("");
  const [checkingProfile, setCheckingProfile] = useState(false);
  const [creatingProfile, setCreatingProfile] = useState(false);
  const [replacingProfile, setReplacingProfile] = useState(false);
  const [profileCheckResult, setProfileCheckResult] = useState<any>(null);
  const [resyncing, setResyncing] = useState(false);
  const [resyncResult, setResyncResult] = useState<any>(null);
  const [extractingBill, setExtractingBill] = useState(false);
  const [extractResult, setExtractResult] = useState<{ address: string | null; tnb_account_no: string | null } | null>(null);

  useEffect(() => {
    if (params.bubble_id) {
      const id = Array.isArray(params.bubble_id) ? params.bubble_id[0] : params.bubble_id;
      setBubbleId(id);
      fetchData(id);
    }
  }, [params.bubble_id]);

  const fetchData = async (id: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/seda/${id}`);
      if (!response.ok) throw new Error("Failed to fetch");

      const result = await response.json();
      setData(result);
      setRawJson(result?.seda ? JSON.stringify(result.seda, null, 2) : "");
    } catch (error) {
      console.error("Error fetching SEDA details:", error);
      alert("Failed to load SEDA details. Please try again.");
      router.push("/seda");
    } finally {
      setLoading(false);
    }
  };

  const patchSeda = useCallback(async (patch: Record<string, any>) => {
    const response = await fetch(`/api/seda/${bubbleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const msg = payload?.error ? String(payload.error) : "Failed to update SEDA registration";
      const details = payload?.detail ? `\n${String(payload.detail)}` : "";
      const hint = payload?.hint ? `\nHint: ${String(payload.hint)}` : "";
      const unknown = Array.isArray(payload?.unknown_keys)
        ? `\nUnknown keys: ${payload.unknown_keys.join(", ")}`
        : "";
      throw new Error(`${msg}${details}${hint}${unknown}`);
    }
    return payload;
  }, [bubbleId]);

  const handleFieldSave = useCallback(async (fieldKey: string, value: any) => {
    setSaving(true);
    try {
      await patchSeda({ [fieldKey]: value });
      await fetchData(bubbleId);
    } catch (error) {
      console.error("Error saving field:", error);
      alert(error instanceof Error ? error.message : "Failed to save changes");
      throw error;
    } finally {
      setSaving(false);
    }
  }, [bubbleId, patchSeda]);

  const handleUpdateStatus = async (newStatus: string) => {
    try {
      await patchSeda({ seda_status: newStatus });
      await fetchData(bubbleId);
    } catch (error) {
      console.error("Error updating status:", error);
      throw error;
    }
  };

  const handleSaveRawJson = async () => {
    setSaving(true);
    try {
      const parsed = JSON.parse(rawJson || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Invalid JSON: expected an object");
      }
      await patchSeda(parsed);
      await fetchData(bubbleId);
      setIsRawEditing(false);
    } catch (error) {
      console.error("Error saving SEDA edit:", error);
      alert(error instanceof Error ? error.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const handleCheckProfile = async () => {
    setCheckingProfile(true);
    setProfileCheckResult(null);
    try {
      const response = await fetch(`/api/seda/${bubbleId}/check-profile`, {
        method: "POST",
      });
      const result = await response.json();
      setProfileCheckResult(result);
      await fetchData(bubbleId);
    } catch (error) {
      console.error("Error checking profile:", error);
      setProfileCheckResult({ success: false, status: "error", message: "Failed to check profile" });
    } finally {
      setCheckingProfile(false);
    }
  };

  const handleCreateProfile = async () => {
    if (!confirm("Create a new SEDA profile for this registration?")) return;

    setCreatingProfile(true);
    setProfileCheckResult(null);
    try {
      const response = await fetch(`/api/seda/${bubbleId}/create-profile`, {
        method: "POST",
      });
      const result = await response.json();
      setProfileCheckResult(result);
      if (result.success) {
        await fetchData(bubbleId);
      } else {
        alert(result.message || "Failed to create profile");
      }
    } catch (error) {
      console.error("Error creating profile:", error);
      setProfileCheckResult({ success: false, status: "error", message: "Failed to create profile" });
    } finally {
      setCreatingProfile(false);
    }
  };

  const handleReplaceTestProfile = async () => {
    if (!confirm("Replace a test profile with this registration data?\n\nThis will find a test profile (mykad contains 02020201) and overwrite it with this registration's data.")) return;

    setReplacingProfile(true);
    setProfileCheckResult(null);
    try {
      const response = await fetch(`/api/seda/${bubbleId}/replace-test-profile`, {
        method: "POST",
      });
      const result = await response.json();
      setProfileCheckResult(result);
      if (result.success) {
        alert(`Success! Profile ${result.profile_id} replaced.\n\nPrevious: ${result.previous_name}`);
        await fetchData(bubbleId);
      } else {
        alert(result.message || result.error || "Failed to replace test profile");
      }
    } catch (error) {
      console.error("Error replacing test profile:", error);
      setProfileCheckResult({ success: false, status: "error", message: "Failed to replace test profile" });
    } finally {
      setReplacingProfile(false);
    }
  };

  const handleResync = async () => {
    setResyncing(true);
    setResyncResult(null);
    try {
      const response = await fetch(`/api/seda/${bubbleId}/resync`, {
        method: "POST",
      });
      const result = await response.json();
      setResyncResult(result);
      if (result.success) {
        await fetchData(bubbleId);
      }
    } catch (error) {
      console.error("Error re-syncing:", error);
      setResyncResult({ success: false, error: "Failed to re-sync with Bubble" });
    } finally {
      setResyncing(false);
    }
  };

  const handleExtractTnbBill = async () => {
    if (!data?.seda) return;
    const seda = data.seda;
    const billField = seda.tnb_bill_1 ? "tnb_bill_1" : seda.tnb_bill_2 ? "tnb_bill_2" : seda.tnb_bill_3 ? "tnb_bill_3" : null;
    if (!billField) {
      alert("No TNB bill uploaded. Please upload a TNB bill first.");
      return;
    }

    setExtractingBill(true);
    setExtractResult(null);
    try {
      const response = await fetch(`/api/seda/${bubbleId}/extract-tnb-bill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billField }),
      });
      const result = await response.json();
      if (result.success) {
        setExtractResult(result.data);
      } else {
        alert(result.error || "Failed to extract data from TNB bill");
      }
    } catch (error) {
      console.error("Error extracting TNB bill:", error);
      alert("Failed to extract data from TNB bill");
    } finally {
      setExtractingBill(false);
    }
  };

  const handleApplyExtract = async () => {
    if (!extractResult) return;
    setSaving(true);
    try {
      const patch: Record<string, string> = {};
      if (extractResult.address) patch.installation_address = extractResult.address;
      if (extractResult.tnb_account_no) patch.tnb_account_no = extractResult.tnb_account_no;
      if (Object.keys(patch).length === 0) {
        alert("No data to apply");
        return;
      }
      await patchSeda(patch);
      await fetchData(bubbleId);
      setExtractResult(null);
    } catch (error) {
      console.error("Error applying extracted data:", error);
      alert(error instanceof Error ? error.message : "Failed to apply extracted data");
    } finally {
      setSaving(false);
    }
  };

  const getProfileStatusBadge = (status: string | null) => {
    switch (status) {
      case "profile_created":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 text-sm font-medium rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
            <CheckCircle className="w-4 h-4" />
            Profile Created
          </span>
        );
      case "not_found":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 text-sm font-medium rounded-full bg-amber-100 text-amber-700 border border-amber-200">
            <XCircle className="w-4 h-4" />
            Not Found
          </span>
        );
      case "no_ic":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 text-sm font-medium rounded-full bg-red-100 text-red-700 border border-red-200">
            <AlertCircle className="w-4 h-4" />
            No IC Number
          </span>
        );
      case "error":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 text-sm font-medium rounded-full bg-red-100 text-red-700 border border-red-200">
            <AlertCircle className="w-4 h-4" />
            Error
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 text-sm font-medium rounded-full bg-gray-100 text-gray-600 border border-gray-200">
            <Clock className="w-4 h-4" />
            Not Checked
          </span>
        );
    }
  };

  const renderFieldsForSection = (sectionKey: string) => {
    if (!data?.seda) return null;
    const seda = data.seda;

    const fields = Object.entries(SEDA_FIELD_CONFIG)
      .filter(([_, config]) => config.section === sectionKey);

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {fields.map(([key, config]) => (
          <EditableField
            key={key}
            fieldKey={key}
            value={seda[key]}
            config={config}
            onSave={handleFieldSave}
            saving={saving}
          />
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary-600" />
          <p className="mt-4 text-gray-600">Loading SEDA details...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-600">SEDA registration not found</p>
        <button onClick={() => router.push("/seda")} className="btn-primary mt-4">
          Back to List
        </button>
      </div>
    );
  }

  const { seda, customer, checkpoints, completed_count, progress_percentage } = data;

  return (
    <div className="p-8 space-y-6">
      {/* Back Button */}
      <div>
        <button
          onClick={() => router.push("/seda")}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to SEDA List
        </button>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-gray-900">
              {customer?.name || seda.customer_name || "Unknown Customer"}
            </h1>
            <StatusBadge status={seda.seda_status || "Pending"} />
          </div>
          <p className="text-gray-600 mt-1">SEDA Registration Details</p>
          <p className="text-xs text-gray-400 mt-1 font-mono">ID: {bubbleId}</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <button
            onClick={handleResync}
            disabled={resyncing}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg disabled:opacity-60 transition-colors"
            title="Merge empty fields with data from Bubble"
          >
            {resyncing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {resyncing ? "Re-syncing..." : "Re-Sync"}
          </button>
          <button
            onClick={() => setIsRawEditing((v) => !v)}
            className="btn-secondary"
          >
            {isRawEditing ? "Close Raw Editor" : "Raw JSON Edit"}
          </button>
          <DownloadButton
            bubbleId={bubbleId}
            customerName={customer?.name || seda.customer_name || "Unknown"}
            size="lg"
          />
        </div>
      </div>

      {/* Re-Sync Result Banner */}
      {resyncResult && (
        <div className={`border rounded-lg p-4 ${
          resyncResult.success
            ? resyncResult.filled_count > 0
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-blue-50 border-blue-200 text-blue-800"
            : "bg-red-50 border-red-200 text-red-800"
        }`}>
          <div className="flex items-start justify-between">
            <div>
              <p className="font-medium">
                {resyncResult.success
                  ? resyncResult.message
                  : resyncResult.error || "Re-sync failed"}
              </p>
              {resyncResult.filled_fields && resyncResult.filled_fields.length > 0 && (
                <p className="text-sm mt-1 opacity-75">
                  Fields filled: {resyncResult.filled_fields.join(", ")}
                </p>
              )}
              {resyncResult.detail && (
                <p className="text-sm mt-1 opacity-75">{resyncResult.detail}</p>
              )}
            </div>
            <button
              onClick={() => setResyncResult(null)}
              className="p-1 hover:opacity-70"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Raw JSON Editor (Advanced) */}
      {isRawEditing && (
        <div className="bg-white border border-amber-200 rounded-lg shadow-sm p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Raw JSON Edit (Advanced)</h2>
              <p className="text-sm text-gray-600">
                Edit any seda_registration fields directly. Identifiers like id and bubble_id are blocked.
              </p>
            </div>
            <button
              onClick={handleSaveRawJson}
              disabled={saving}
              className="btn-primary disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
          <textarea
            className="w-full font-mono text-xs rounded-md border border-gray-300 p-3 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-500"
            rows={18}
            value={rawJson}
            onChange={(e) => setRawJson(e.target.value)}
          />
        </div>
      )}

      {/* Progress Section */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Form Progress</h2>
          <span className="text-lg font-bold text-gray-900">
            {completed_count}/7 ({progress_percentage}%)
          </span>
        </div>
        <ProgressBar
          completed={completed_count}
          total={7}
          checkpoints={checkpoints}
          size="lg"
        />
      </div>

      {/* SEDA Profile Status Section */}
      <div className="bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200 rounded-xl shadow-sm p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">SEDA Manager Profile</h2>
            <div className="flex flex-wrap items-center gap-3">
              {getProfileStatusBadge(seda.seda_profile_status)}
              {seda.seda_profile_id && (
                <span className="text-sm text-gray-500 font-mono">
                  ID: {seda.seda_profile_id}
                </span>
              )}
              {seda.seda_profile_checked_at && (
                <span className="text-xs text-gray-400">
                  Last checked: {new Date(seda.seda_profile_checked_at).toLocaleString()}
                </span>
              )}
            </div>
            {seda.ic_no && (
              <p className="text-sm text-gray-500 mt-2">
                MyKad/IC: <span className="font-mono">{seda.ic_no}</span>
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {seda.seda_profile_status === "profile_created" && (
              <a
                href={seda.seda_profile_id
                  ? `https://atap.seda.gov.my/profiles/individuals/${seda.seda_profile_id}/edit`
                  : `https://atap.seda.gov.my/profiles/individuals?search=${encodeURIComponent(seda.ic_no || '')}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                View Profile
              </a>
            )}
            <button
              onClick={handleCheckProfile}
              disabled={checkingProfile || creatingProfile}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg disabled:opacity-60 transition-colors"
            >
              {checkingProfile ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Check Profile
            </button>
            {(seda.seda_profile_status === "not_found" || seda.seda_profile_status === null) && (
              <>
                <button
                  onClick={handleReplaceTestProfile}
                  disabled={checkingProfile || creatingProfile || replacingProfile || !seda.ic_no}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg disabled:opacity-60 transition-colors"
                  title="Replace a test profile with this registration data"
                >
                  {replacingProfile ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  Replace Test Profile
                </button>
                <button
                  onClick={handleCreateProfile}
                  disabled={checkingProfile || creatingProfile || replacingProfile || !seda.ic_no}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-60 transition-colors"
                  title={!seda.ic_no ? "IC number required to create profile" : "Create profile in SEDA Manager"}
                >
                  {creatingProfile ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <UserPlus className="w-4 h-4" />
                  )}
                  Create Profile
                </button>
              </>
            )}
          </div>
        </div>
        {profileCheckResult && (
          <div className={`mt-4 p-3 rounded-lg text-sm ${
            profileCheckResult.success
              ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
              : "bg-red-100 text-red-800 border border-red-200"
          }`}>
            <p className="font-medium">
              {typeof profileCheckResult.message === 'string'
                ? profileCheckResult.message
                : JSON.stringify(profileCheckResult.message)}
            </p>
            {profileCheckResult.error && (
              <p className="mt-1 text-xs opacity-75">
                {typeof profileCheckResult.error === 'string'
                  ? profileCheckResult.error
                  : JSON.stringify(profileCheckResult.error)}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Status Update Section */}
      <Section title="Status Update">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              SEDA Status
            </label>
            <StatusDropdown
              currentStatus={seda.seda_status}
              onUpdate={handleUpdateStatus}
            />
          </div>
        </div>
      </Section>

      {/* Customer Information */}
      <Section title="Customer Information">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className="text-sm font-medium text-gray-500 mb-1">Name</div>
            <div className="text-gray-900">{customer?.name || seda.customer_name || "N/A"}</div>
            <p className="text-xs text-gray-400 mt-1">(Linked from Customer table)</p>
          </div>
          <EditableField
            fieldKey="email"
            value={seda.email}
            config={SEDA_FIELD_CONFIG.email}
            onSave={handleFieldSave}
            saving={saving}
          />
          <EditableField
            fieldKey="ic_no"
            value={seda.ic_no}
            config={SEDA_FIELD_CONFIG.ic_no}
            onSave={handleFieldSave}
            saving={saving}
          />
        </div>
      </Section>

      {/* Emergency Contact */}
      <Section title="Emergency Contact">
        {renderFieldsForSection("emergency")}
      </Section>

      {/* Address & Location */}
      <Section title="Address & Location">
        {renderFieldsForSection("address")}
      </Section>

      {/* Solar System Details */}
      <Section title="Solar System Details">
        {renderFieldsForSection("solar")}
      </Section>

      {/* TNB Information */}
      <Section title="TNB Information">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={handleExtractTnbBill}
            disabled={extractingBill || (!seda.tnb_bill_1 && !seda.tnb_bill_2 && !seda.tnb_bill_3)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg disabled:opacity-60 transition-colors"
            title="Use AI to extract address and TNB account number from the uploaded bill"
          >
            {extractingBill ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {extractingBill ? "Extracting..." : "Extract from TNB Bill"}
          </button>
        </div>

        {extractResult && (
          <div className="mb-4 border border-violet-200 bg-violet-50 rounded-lg p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 space-y-2">
                <p className="text-sm font-semibold text-violet-800">AI Extracted Data:</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="font-medium text-gray-600">Address: </span>
                    <span className="text-gray-900">{extractResult.address || "Not found"}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-600">TNB Account No: </span>
                    <span className="text-gray-900">{extractResult.tnb_account_no || "Not found"}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleApplyExtract}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-md disabled:opacity-60 transition-colors"
                >
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  Apply
                </button>
                <button
                  onClick={() => setExtractResult(null)}
                  className="p-1.5 text-gray-400 hover:text-gray-600 rounded transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {renderFieldsForSection("tnb")}
      </Section>

      {/* Financial Information */}
      <Section title="Financial Information">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <EditableField
            fieldKey="project_price"
            value={seda.project_price}
            config={SEDA_FIELD_CONFIG.project_price}
            onSave={handleFieldSave}
            saving={saving}
          />
          <EditableField
            fieldKey="estimated_monthly_saving"
            value={seda.estimated_monthly_saving}
            config={SEDA_FIELD_CONFIG.estimated_monthly_saving}
            onSave={handleFieldSave}
            saving={saving}
          />
          <EditableField
            fieldKey="price_category"
            value={seda.price_category}
            config={SEDA_FIELD_CONFIG.price_category}
            onSave={handleFieldSave}
            saving={saving}
          />
          <div>
            <div className="text-sm font-medium text-gray-500 mb-1">Linked Invoice</div>
            {seda.invoice ? (
              <a
                href={`/invoices?id=${seda.invoice.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 hover:text-primary-700 flex items-center gap-1"
              >
                <FileText className="w-4 h-4" />
                {seda.invoice.invoice_number || `Invoice #${seda.invoice.id}`}
                <ExternalLink className="w-3 h-3" />
              </a>
            ) : (
              <div className="text-gray-400">No invoice linked</div>
            )}
          </div>
        </div>
      </Section>

      {/* NEM / SEDA Status */}
      <Section title="NEM / SEDA Registration">
        {renderFieldsForSection("nem")}
      </Section>

      {/* Agent Information */}
      <Section title="Agent Information">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <EditableField
            fieldKey="agent"
            value={seda.agent}
            config={SEDA_FIELD_CONFIG.agent}
            onSave={handleFieldSave}
            saving={saving}
          />
          <div>
            <div className="text-sm font-medium text-gray-500 mb-1">Agent Name (Display)</div>
            <div className="text-gray-900">{seda.agent_name || seda.agent || "N/A"}</div>
          </div>
        </div>
      </Section>

      {/* Documents & Files */}
      <Section title="Documents & Files">
        {renderFieldsForSection("documents")}
      </Section>

      {/* Folder Links */}
      <Section title="Google Drive Folders">
        {renderFieldsForSection("folders")}
      </Section>

      {/* Verification Checks */}
      <Section title="Verification Checks">
        {renderFieldsForSection("checks")}
      </Section>

      {/* Remarks */}
      <Section title="Remarks">
        <div className="grid grid-cols-1 gap-4">
          <EditableField
            fieldKey="special_remark"
            value={seda.special_remark}
            config={SEDA_FIELD_CONFIG.special_remark}
            onSave={handleFieldSave}
            saving={saving}
          />
        </div>
      </Section>

      {/* Other Fields */}
      <Section title="Other Information">
        {renderFieldsForSection("other")}
      </Section>

      {/* Metadata (Read-only) */}
      <Section title="Metadata" className="bg-gray-50">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="font-medium text-gray-500">Created At</div>
            <div className="text-gray-700">{seda.created_at ? new Date(seda.created_at).toLocaleString() : "N/A"}</div>
          </div>
          <div>
            <div className="font-medium text-gray-500">Updated At</div>
            <div className="text-gray-700">{seda.updated_at ? new Date(seda.updated_at).toLocaleString() : "N/A"}</div>
          </div>
          <div>
            <div className="font-medium text-gray-500">Modified Date</div>
            <div className="text-gray-700">{seda.modified_date ? new Date(seda.modified_date).toLocaleString() : "N/A"}</div>
          </div>
          <div>
            <div className="font-medium text-gray-500">Last Synced</div>
            <div className="text-gray-700">{seda.last_synced_at ? new Date(seda.last_synced_at).toLocaleString() : "N/A"}</div>
          </div>
          <div>
            <div className="font-medium text-gray-500">Version</div>
            <div className="text-gray-700">{seda.version || "N/A"}</div>
          </div>
          <div>
            <div className="font-medium text-gray-500">Created By</div>
            <div className="text-gray-700">{seda.created_by || "N/A"}</div>
          </div>
        </div>
      </Section>
    </div>
  );
}
