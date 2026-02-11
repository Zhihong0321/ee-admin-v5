"use client";

import { CHECKPOINT_LABELS } from "@/lib/seda-validation";

interface ProgressBarProps {
  completed: number;
  total: number;
  checkpoints?: {
    name: boolean;
    address: boolean;
    mykad: boolean;
    tnb_bill: boolean;
    tnb_meter: boolean;
    emergency_contact: boolean;
    payment_required: boolean;
  };
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
}

export function ProgressBar({
  completed,
  total,
  checkpoints,
  showLabel = true,
  size = "md",
}: ProgressBarProps) {
  const percentage = Math.round((completed / total) * 100);

  // Determine color based on progress
  const getColorClass = () => {
    if (completed <= 3) return "bg-red-500";
    if (completed <= 5) return "bg-yellow-500";
    return "bg-green-500";
  };

  const getHeightClass = () => {
    switch (size) {
      case "sm":
        return "h-2";
      case "lg":
        return "h-4";
      default:
        return "h-3";
    }
  };

  return (
    <div className="w-full">
      {showLabel && (
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">
            Progress
          </span>
          <span className="text-sm font-semibold text-gray-900">
            {completed}/{total} ({percentage}%)
          </span>
        </div>
      )}
      <div className={`w-full bg-gray-200 rounded-full overflow-hidden ${getHeightClass()}`}>
        <div
          className={`${getColorClass()} ${getHeightClass()} transition-all duration-300 ease-out`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Checkpoint tooltip (optional) */}
      {checkpoints && (
        <div className="mt-2 grid grid-cols-7 gap-1 text-xs">
          <CheckpointIcon label="Name" complete={checkpoints.name} />
          <CheckpointIcon label="Address" complete={checkpoints.address} />
          <CheckpointIcon label="MyKad" complete={checkpoints.mykad} />
          <CheckpointIcon label="TNB" complete={checkpoints.tnb_bill} />
          <CheckpointIcon label="Meter" complete={checkpoints.tnb_meter} />
          <CheckpointIcon label="Emergency" complete={checkpoints.emergency_contact} />
          <CheckpointIcon label="Payment" complete={checkpoints.payment_required} />
        </div>
      )}
    </div>
  );
}

interface CheckpointIconProps {
  label: string;
  complete: boolean;
}

function CheckpointIcon({ label, complete }: CheckpointIconProps) {
  return (
    <div
      className="flex flex-col items-center gap-1"
      title={label}
    >
      <div
        className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium ${complete
            ? "bg-green-500 text-white"
            : "bg-gray-300 text-gray-600"
          }`}
      >
        {complete ? "✓" : "✗"}
      </div>
    </div>
  );
}
