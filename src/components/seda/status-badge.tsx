"use client";

interface StatusBadgeProps {
  status: string | null;
  type: "reg_status" | "seda_status";
}

export function StatusBadge({ status, type }: StatusBadgeProps) {
  const getColorClass = () => {
    if (type === "reg_status") {
      const regStatusColors: Record<string, string> = {
        Approved: "bg-green-100 text-green-800",
        APPROVED: "bg-green-100 text-green-800",
        Draft: "bg-gray-100 text-gray-800",
        Submitted: "bg-blue-100 text-blue-800",
        Deleted: "bg-red-100 text-red-800",
        Incomplete: "bg-orange-100 text-orange-800",
        Demo: "bg-purple-100 text-purple-800",
        Verified: "bg-blue-100 text-blue-800",
        "1 NEW CONTACT": "bg-yellow-100 text-yellow-800",
        PROPOSAL: "bg-yellow-100 text-yellow-800",
        "2 PROPOSAL": "bg-yellow-100 text-yellow-800",
      };
      return (
        regStatusColors[status || ""] || "bg-gray-100 text-gray-800"
      );
    } else {
      const sedaStatusColors: Record<string, string> = {
        "APPROVED BY SEDA": "bg-green-100 text-green-800",
        VERIFIED: "bg-blue-100 text-blue-800",
        Pending: "bg-yellow-100 text-yellow-800",
        INCOMPLETE: "bg-red-100 text-red-800",
        DEMO: "bg-purple-100 text-purple-800",
      };
      return (
        sedaStatusColors[status || ""] || "bg-gray-100 text-gray-800"
      );
    }
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getColorClass()}`}
    >
      {status || "Not Set"}
    </span>
  );
}
