"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { StatusBadge } from "./status-badge";

interface StatusDropdownProps {
  currentStatus: string | null;
  onUpdate: (newStatus: string) => Promise<void>;
  disabled?: boolean;
}

export function StatusDropdown({
  currentStatus,
  onUpdate,
  disabled = false,
}: StatusDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [updating, setUpdating] = useState(false);

  const getStatusOptions = () => {
    return [
      { value: "", label: "Not Set" },
      { value: "Pending", label: "Pending" },
      { value: "VERIFIED", label: "VERIFIED" },
      { value: "APPROVED BY SEDA", label: "APPROVED BY SEDA" },
      { value: "INCOMPLETE", label: "INCOMPLETE" },
      { value: "DEMO", label: "DEMO" },
    ];
  };

  const handleSelect = async (newStatus: string) => {
    setUpdating(true);
    try {
      await onUpdate(newStatus);
      setIsOpen(false);
    } catch (error) {
      console.error("Failed to update status:", error);
      alert("Failed to update status. Please try again.");
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled || updating}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
          disabled
            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
            : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 cursor-pointer"
        }`}
      >
        <StatusBadge status={currentStatus} />
        {!disabled && !updating && (
          <ChevronDown className="w-4 h-4 text-gray-500" />
        )}
        {updating && (
          <div className="w-4 h-4 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
        )}
      </button>

      {isOpen && !disabled && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown */}
          <div className="absolute z-20 mt-2 w-56 bg-white border border-gray-200 rounded-lg shadow-lg py-1 max-h-96 overflow-y-auto">
            {getStatusOptions().map((option) => (
              <button
                key={option.value}
                onClick={() => handleSelect(option.value)}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 transition-colors"
              >
                <StatusBadge status={option.value} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
