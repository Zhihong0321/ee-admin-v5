"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, FileText, ExternalLink, CheckCircle, XCircle } from "lucide-react";
import { StatusBadge } from "@/components/seda/status-badge";
import { StatusDropdown } from "@/components/seda/status-dropdown";
import { ProgressBar } from "@/components/seda/progress-bar";
import { DownloadButton } from "@/components/seda/download-button";
import { CHECKPOINT_LABELS } from "@/lib/seda-validation";

interface SedaDetailData {
  seda: any;
  checkpoints: {
    name: boolean;
    address: boolean;
    mykad: boolean;
    tnb_bill: boolean;
    tnb_meter: boolean;
    emergency_contact: boolean;
    payment_5percent: boolean;
  };
  completed_count: number;
  progress_percentage: number;
}

export default function SedaDetailPage({ params }: { params: Promise<{ bubble_id: string }> }) {
  const router = useRouter();
  const [bubbleId, setBubbleId] = useState<string>("");
  const [data, setData] = useState<SedaDetailData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    params.then((p) => {
      setBubbleId(p.bubble_id);
      fetchData(p.bubble_id);
    });
  }, []);

  const fetchData = async (id: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/seda/${id}`);
      if (!response.ok) throw new Error("Failed to fetch");

      const result: SedaDetailData = await response.json();
      setData(result);
    } catch (error) {
      console.error("Error fetching SEDA details:", error);
      alert("Failed to load SEDA details. Please try again.");
      router.push("/seda");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (type: "reg_status" | "seda_status", newStatus: string) => {
    try {
      const body = type === "reg_status" ? { reg_status: newStatus } : { seda_status: newStatus };
      const response = await fetch(`/api/seda/${bubbleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) throw new Error("Failed to update status");

      // Refresh data
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

  const { seda, checkpoints, completed_count, progress_percentage } = data;

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <button
        onClick={() => router.push("/seda")}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="w-5 h-5" />
        Back to SEDA List
      </button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {seda.customer?.name || "Unknown Customer"}
          </h1>
          <p className="text-gray-600 mt-1">SEDA Registration Details</p>
        </div>
        <DownloadButton
          bubbleId={bubbleId}
          customerName={seda.customer?.name || "Unknown"}
          size="lg"
        />
      </div>

      {/* Progress Section */}
      <div className="card bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
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
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <CheckpointItem label={CHECKPOINT_LABELS.name} complete={checkpoints.name} />
          <CheckpointItem label={CHECKPOINT_LABELS.address} complete={checkpoints.address} />
          <CheckpointItem label={CHECKPOINT_LABELS.mykad} complete={checkpoints.mykad} />
          <CheckpointItem label={CHECKPOINT_LABELS.tnb_bill} complete={checkpoints.tnb_bill} />
          <CheckpointItem label={CHECKPOINT_LABELS.tnb_meter} complete={checkpoints.tnb_meter} />
          <CheckpointItem label={CHECKPOINT_LABELS.emergency_contact} complete={checkpoints.emergency_contact} />
          <CheckpointItem label={CHECKPOINT_LABELS.payment_5percent} complete={checkpoints.payment_5percent} />
        </div>
      </div>

      {/* Status Update Section */}
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Status Update</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Registration Status
            </label>
            <StatusDropdown
              currentStatus={seda.reg_status}
              type="reg_status"
              onUpdate={(newStatus) => handleUpdateStatus("reg_status", newStatus)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              SEDA Status
            </label>
            <StatusDropdown
              currentStatus={seda.seda_status}
              type="seda_status"
              onUpdate={(newStatus) => handleUpdateStatus("seda_status", newStatus)}
            />
          </div>
        </div>
        <div className="mt-4 text-sm text-gray-500">
          Last updated: {seda.updated_at ? new Date(seda.updated_at).toLocaleString() : "N/A"}
        </div>
      </div>

      {/* Customer Information */}
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Customer Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <InfoRow label="Name" value={seda.customer?.name} />
          <InfoRow label="Email" value={seda.email} />
          <InfoRow label="IC Number" value={seda.ic_no} />
          <InfoRow label="Linked Customer ID" value={seda.linked_customer} />
          <InfoRow label="Emergency Contact Name" value={seda.e_contact_name} />
          <InfoRow label="Emergency Contact No" value={seda.e_contact_no} />
          <InfoRow label="Emergency Contact Relationship" value={seda.e_contact_relationship} />
          <InfoRow label="Emergency Email" value={seda.e_email} />
        </div>
      </div>

      {/* Address & Location */}
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Address & Location</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <InfoRow label="Installation Address" value={seda.installation_address} />
          <InfoRow label="City" value={seda.city} />
          <InfoRow label="State" value={seda.state} />
        </div>
      </div>

      {/* Solar System Details */}
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Solar System Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <InfoRow label="System Size" value={seda.system_size} suffix=" kW" />
          <InfoRow label="System Size in Form" value={seda.system_size_in_form_kwp} suffix=" kWp" />
          <InfoRow label="Inverter KW AC" value={seda.inverter_kwac} suffix=" kW" />
          <InfoRow label="Inverter Serial No" value={seda.inverter_serial_no} />
          <InfoRow label="Phase Type" value={seda.phase_type} />
        </div>
      </div>

      {/* TNB Information */}
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">TNB Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <InfoRow label="TNB Account No" value={seda.tnb_account_no} />
          <InfoRow label="TNB Meter Status" value={seda.tnb_meter_status} />
          <div>
            <div className="text-sm font-medium text-gray-500 mb-1">TNB Meter</div>
            {seda.tnb_meter ? (
              <a
                href={seda.tnb_meter}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 hover:text-primary-700 flex items-center gap-1"
              >
                View File <ExternalLink className="w-3 h-3" />
              </a>
            ) : (
              <div className="text-gray-400">Not uploaded</div>
            )}
          </div>
          <div>
            <div className="text-sm font-medium text-gray-500 mb-1">TNB Bill 1</div>
            {seda.tnb_bill_1 ? (
              <a
                href={seda.tnb_bill_1}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 hover:text-primary-700 flex items-center gap-1"
              >
                View Bill <ExternalLink className="w-3 h-3" />
              </a>
            ) : (
              <div className="text-gray-400">Not uploaded</div>
            )}
          </div>
          <div>
            <div className="text-sm font-medium text-gray-500 mb-1">TNB Bill 2</div>
            {seda.tnb_bill_2 ? (
              <a
                href={seda.tnb_bill_2}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 hover:text-primary-700 flex items-center gap-1"
              >
                View Bill <ExternalLink className="w-3 h-3" />
              </a>
            ) : (
              <div className="text-gray-400">Not uploaded</div>
            )}
          </div>
          <div>
            <div className="text-sm font-medium text-gray-500 mb-1">TNB Bill 3</div>
            {seda.tnb_bill_3 ? (
              <a
                href={seda.tnb_bill_3}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 hover:text-primary-700 flex items-center gap-1"
              >
                View Bill <ExternalLink className="w-3 h-3" />
              </a>
            ) : (
              <div className="text-gray-400">Not uploaded</div>
            )}
          </div>
        </div>
      </div>

      {/* Financial Information */}
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Financial Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InfoRow
            label="Project Price"
            value={seda.project_price}
            prefix="RM "
            suffix=""
            formatNumber
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
            {seda.invoice && (
              <div className="text-sm text-gray-500 mt-1">
                Total: RM {parseFloat(seda.invoice.total_amount || 0).toLocaleString()}
              </div>
            )}
          </div>
        </div>
        {seda.payments && seda.payments.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Payments</h3>
            {seda.payments.map((payment: any) => (
              <div key={payment.id} className="text-sm text-gray-600">
                RM {parseFloat(payment.amount || 0).toLocaleString()} - {payment.payment_date || "No date"}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Agent Information */}
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Agent Information</h2>
        <InfoRow label="Agent" value={seda.agent?.name || seda.agent} />
      </div>

      {/* Documents & Files */}
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Documents & Files</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <FileLink label="MyKad PDF" url={seda.mykad_pdf} />
          <FileLink label="IC Copy Front" url={seda.ic_copy_front} />
          <FileLink label="IC Copy Back" url={seda.ic_copy_back} />
          <FileLink label="Customer Signature" url={seda.customer_signature} />
          <FileLink label="Property Ownership Proof" url={seda.property_ownership_prove} />
          <FileLink label="Emergency Contact MyKad" url={seda.e_contact_mykad} />

          {/* Array files - show count */}
          <div>
            <div className="text-sm font-medium text-gray-500 mb-1">Roof Images</div>
            {seda.roof_images && seda.roof_images.length > 0 ? (
              <div className="text-sm text-gray-700">
                {seda.roof_images.length} file{seda.roof_images.length > 1 ? "s" : ""}
              </div>
            ) : (
              <div className="text-sm text-gray-400">None</div>
            )}
          </div>
          <div>
            <div className="text-sm font-medium text-gray-500 mb-1">Site Images</div>
            {seda.site_images && seda.site_images.length > 0 ? (
              <div className="text-sm text-gray-700">
                {seda.site_images.length} file{seda.site_images.length > 1 ? "s" : ""}
              </div>
            ) : (
              <div className="text-sm text-gray-400">None</div>
            )}
          </div>
        </div>
      </div>

      {/* Remarks */}
      {seda.special_remark && (
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Remarks</h2>
          <p className="text-gray-700 whitespace-pre-wrap">{seda.special_remark}</p>
        </div>
      )}
    </div>
  );
}

function CheckpointItem({ label, complete }: { label: string; complete: boolean }) {
  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg ${complete ? "bg-white" : "bg-red-50"}`}>
      {complete ? (
        <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
      ) : (
        <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
      )}
      <span className={`text-sm font-medium ${complete ? "text-gray-900" : "text-red-700"}`}>
        {label}
      </span>
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
