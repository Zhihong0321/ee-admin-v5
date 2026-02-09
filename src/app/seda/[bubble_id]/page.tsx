"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Loader2, FileText, ExternalLink, Pencil, Save, X } from "lucide-react";
import { StatusBadge } from "@/components/seda/status-badge";
import { StatusDropdown } from "@/components/seda/status-dropdown";
import { ProgressBar } from "@/components/seda/progress-bar";
import { DownloadButton } from "@/components/seda/download-button";

type SedaEditForm = Record<string, string>;

export default function SedaDetailPage() {
  const router = useRouter();
  const params = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [bubbleId, setBubbleId] = useState<string>("");
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState<SedaEditForm>({});
  const [originalSeda, setOriginalSeda] = useState<any>(null);

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
      setIsEditing(false);
      setSaving(false);
      setEditForm({});
      setOriginalSeda(null);
    } catch (error) {
      console.error("Error fetching SEDA details:", error);
      alert("Failed to load SEDA details. Please try again.");
      router.push("/seda");
    } finally {
      setLoading(false);
    }
  };

  const EDITABLE_FIELDS: Array<{
    key: string;
    label: string;
    type?: "text" | "number" | "textarea";
    placeholder?: string;
  }> = [
    { key: "email", label: "Email", type: "text" },
    { key: "ic_no", label: "IC Number", type: "text" },
    { key: "installation_address", label: "Installation Address", type: "textarea" },
    { key: "city", label: "City", type: "text" },
    { key: "state", label: "State", type: "text" },
    { key: "system_size", label: "System Size (kW)", type: "number" },
    { key: "system_size_in_form_kwp", label: "System Size in Form (kWp)", type: "number" },
    { key: "inverter_kwac", label: "Inverter KW AC (kW)", type: "number" },
    { key: "inverter_serial_no", label: "Inverter Serial No", type: "text" },
    { key: "phase_type", label: "Phase Type", type: "text" },
    { key: "tnb_account_no", label: "TNB Account No", type: "text" },
    { key: "tnb_meter_status", label: "TNB Meter Status", type: "text" },
    { key: "project_price", label: "Project Price (RM)", type: "number" },
    { key: "agent", label: "Agent", type: "text" },
    { key: "e_contact_name", label: "Emergency Contact Name", type: "text" },
    { key: "e_contact_no", label: "Emergency Contact No", type: "text" },
    { key: "e_contact_relationship", label: "Emergency Contact Relationship", type: "text" },
    { key: "e_email", label: "Emergency Email", type: "text" },
    { key: "special_remark", label: "Remarks", type: "textarea" },
  ];

  const startEdit = () => {
    const seda = data?.seda;
    if (!seda) return;
    const form: SedaEditForm = {};
    for (const f of EDITABLE_FIELDS) {
      const raw = seda[f.key];
      form[f.key] = raw === null || raw === undefined ? "" : String(raw);
    }
    setOriginalSeda(seda);
    setEditForm(form);
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setSaving(false);
    setEditForm({});
    setOriginalSeda(null);
  };

  const handleSave = async () => {
    if (!originalSeda) return;
    setSaving(true);
    try {
      const payload: Record<string, any> = {};
      for (const f of EDITABLE_FIELDS) {
        const next = editForm[f.key] ?? "";
        const prevRaw = originalSeda[f.key];
        const prev = prevRaw === null || prevRaw === undefined ? "" : String(prevRaw);
        if (next !== prev) {
          payload[f.key] = next;
        }
      }

      if (Object.keys(payload).length === 0) {
        cancelEdit();
        return;
      }

      const response = await fetch(`/api/seda/${bubbleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error || "Failed to update SEDA details");
      }

      await fetchData(bubbleId);
    } catch (error) {
      console.error("Error saving SEDA edits:", error);
      alert(error instanceof Error ? error.message : "Failed to save changes");
      setSaving(false);
    }
  };

  const handleUpdateStatus = async (newStatus: string) => {
    try {
      const body = { seda_status: newStatus };
      const response = await fetch(`/api/seda/${bubbleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) throw new Error("Failed to update status");

      // Refresh current data
      fetchData(bubbleId);
    } catch (error) {
      console.error("Error updating status:", error);
      throw error;
    }
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
        </div>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          {!isEditing ? (
            <button onClick={startEdit} className="btn-primary flex items-center gap-2">
              <Pencil className="w-4 h-4" />
              Edit Details
            </button>
          ) : (
            <>
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn-primary flex items-center gap-2 disabled:opacity-60"
              >
                <Save className="w-4 h-4" />
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                onClick={cancelEdit}
                disabled={saving}
                className="btn-secondary flex items-center gap-2 disabled:opacity-60"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
            </>
          )}
          <DownloadButton
            bubbleId={bubbleId}
            customerName={customer?.name || seda.customer_name || "Unknown"}
            size="lg"
          />
        </div>
      </div>

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

      {/* Status Update Section */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Status Update</h2>
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
      </div>

      {/* Customer Information */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Customer Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <InfoRow label="Name" value={customer?.name || seda.customer_name} />
          <EditableRow
            label="Email"
            value={seda.email}
            isEditing={isEditing}
            inputType="text"
            fieldKey="email"
            editForm={editForm}
            setEditForm={setEditForm}
          />
          <EditableRow
            label="IC Number"
            value={seda.ic_no}
            isEditing={isEditing}
            inputType="text"
            fieldKey="ic_no"
            editForm={editForm}
            setEditForm={setEditForm}
          />
          <InfoRow label="SEDA Profile ID" value={seda.seda_profile} />
        </div>
      </div>

      {/* Emergency Contact */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Emergency Contact</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <EditableRow
            label="Emergency Contact Name"
            value={seda.e_contact_name}
            isEditing={isEditing}
            inputType="text"
            fieldKey="e_contact_name"
            editForm={editForm}
            setEditForm={setEditForm}
          />
          <EditableRow
            label="Emergency Contact No"
            value={seda.e_contact_no}
            isEditing={isEditing}
            inputType="text"
            fieldKey="e_contact_no"
            editForm={editForm}
            setEditForm={setEditForm}
          />
          <EditableRow
            label="Emergency Contact Relationship"
            value={seda.e_contact_relationship}
            isEditing={isEditing}
            inputType="text"
            fieldKey="e_contact_relationship"
            editForm={editForm}
            setEditForm={setEditForm}
          />
          <EditableRow
            label="Emergency Email"
            value={seda.e_email}
            isEditing={isEditing}
            inputType="text"
            fieldKey="e_email"
            editForm={editForm}
            setEditForm={setEditForm}
          />
        </div>
      </div>

      {/* Address & Location */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Address & Location</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <EditableRow
            label="Installation Address"
            value={seda.installation_address}
            isEditing={isEditing}
            inputType="textarea"
            fieldKey="installation_address"
            editForm={editForm}
            setEditForm={setEditForm}
          />
          <EditableRow
            label="City"
            value={seda.city}
            isEditing={isEditing}
            inputType="text"
            fieldKey="city"
            editForm={editForm}
            setEditForm={setEditForm}
          />
          <EditableRow
            label="State"
            value={seda.state}
            isEditing={isEditing}
            inputType="text"
            fieldKey="state"
            editForm={editForm}
            setEditForm={setEditForm}
          />
        </div>
      </div>

      {/* Solar System Details */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Solar System Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <EditableRow
            label="System Size (kW)"
            value={seda.system_size}
            isEditing={isEditing}
            inputType="number"
            fieldKey="system_size"
            editForm={editForm}
            setEditForm={setEditForm}
          />
          <EditableRow
            label="System Size in Form (kWp)"
            value={seda.system_size_in_form_kwp}
            isEditing={isEditing}
            inputType="number"
            fieldKey="system_size_in_form_kwp"
            editForm={editForm}
            setEditForm={setEditForm}
          />
          <EditableRow
            label="Inverter KW AC (kW)"
            value={seda.inverter_kwac}
            isEditing={isEditing}
            inputType="number"
            fieldKey="inverter_kwac"
            editForm={editForm}
            setEditForm={setEditForm}
          />
          <EditableRow
            label="Inverter Serial No"
            value={seda.inverter_serial_no}
            isEditing={isEditing}
            inputType="text"
            fieldKey="inverter_serial_no"
            editForm={editForm}
            setEditForm={setEditForm}
          />
          <EditableRow
            label="Phase Type"
            value={seda.phase_type}
            isEditing={isEditing}
            inputType="text"
            fieldKey="phase_type"
            editForm={editForm}
            setEditForm={setEditForm}
          />
        </div>
      </div>

      {/* TNB Information */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">TNB Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <EditableRow
            label="TNB Account No"
            value={seda.tnb_account_no}
            isEditing={isEditing}
            inputType="text"
            fieldKey="tnb_account_no"
            editForm={editForm}
            setEditForm={setEditForm}
          />
          <EditableRow
            label="TNB Meter Status"
            value={seda.tnb_meter_status}
            isEditing={isEditing}
            inputType="text"
            fieldKey="tnb_meter_status"
            editForm={editForm}
            setEditForm={setEditForm}
          />
          <FileLink label="TNB Meter" url={seda.tnb_meter} />
          <FileLink label="TNB Bill 1" url={seda.tnb_bill_1} />
          <FileLink label="TNB Bill 2" url={seda.tnb_bill_2} />
          <FileLink label="TNB Bill 3" url={seda.tnb_bill_3} />
        </div>
      </div>

      {/* Financial Information */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Financial Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <EditableRow
            label="Project Price (RM)"
            value={seda.project_price}
            isEditing={isEditing}
            inputType="number"
            fieldKey="project_price"
            editForm={editForm}
            setEditForm={setEditForm}
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
      </div>

      {/* Agent Information */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Agent Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <EditableRow
            label="Agent"
            value={seda.agent_name || seda.agent}
            isEditing={isEditing}
            inputType="text"
            fieldKey="agent"
            editForm={editForm}
            setEditForm={setEditForm}
          />
        </div>
      </div>

      {/* Documents & Files */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Documents & Files</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <FileLink label="MyKad PDF" url={seda.mykad_pdf} />
          <FileLink label="IC Copy Front" url={seda.ic_copy_front} />
          <FileLink label="IC Copy Back" url={seda.ic_copy_back} />
          <FileLink label="Customer Signature" url={seda.customer_signature} />
          <FileLink label="Property Ownership Proof" url={seda.property_ownership_prove} />
          <FileLink label="Emergency Contact MyKad" url={seda.e_contact_mykad} />
        </div>
      </div>

      {/* Remarks */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Remarks</h2>
        <EditableRow
          label="Special Remark"
          value={seda.special_remark}
          isEditing={isEditing}
          inputType="textarea"
          fieldKey="special_remark"
          editForm={editForm}
          setEditForm={setEditForm}
        />
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  prefix = "",
  suffix = "",
  formatNumber = false,
}: {
  label: string;
  value: any;
  prefix?: string;
  suffix?: string;
  formatNumber?: boolean;
}) {
  const displayValue = value
    ? prefix + (formatNumber ? parseFloat(value).toLocaleString() : value) + suffix
    : "N/A";

  return (
    <div>
      <div className="text-sm font-medium text-gray-500 mb-1">{label}</div>
      <div className="text-gray-900">{displayValue}</div>
    </div>
  );
}

function FileLink({ label, url }: { label: string; url: string | null }) {
  return (
    <div>
      <div className="text-sm font-medium text-gray-500 mb-1">{label}</div>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary-600 hover:text-primary-700 flex items-center gap-1 text-sm"
        >
          View File <ExternalLink className="w-3 h-3" />
        </a>
      ) : (
        <div className="text-sm text-gray-400">Not uploaded</div>
      )}
    </div>
  );
}

function EditableRow({
  label,
  value,
  isEditing,
  inputType,
  fieldKey,
  editForm,
  setEditForm,
}: {
  label: string;
  value: any;
  isEditing: boolean;
  inputType: "text" | "number" | "textarea";
  fieldKey: string;
  editForm: Record<string, string>;
  setEditForm: (next: Record<string, string>) => void;
}) {
  if (!isEditing) {
    return <InfoRow label={label} value={value} />;
  }

  const current = editForm[fieldKey] ?? "";
  const base =
    "w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200";

  return (
    <div>
      <div className="text-sm font-medium text-gray-500 mb-1">{label}</div>
      {inputType === "textarea" ? (
        <textarea
          className={base}
          rows={3}
          value={current}
          onChange={(e) => setEditForm({ ...editForm, [fieldKey]: e.target.value })}
        />
      ) : (
        <input
          className={base}
          type={inputType}
          value={current}
          onChange={(e) => setEditForm({ ...editForm, [fieldKey]: e.target.value })}
        />
      )}
    </div>
  );
}
