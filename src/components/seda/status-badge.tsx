"use client";

interface StatusBadgeProps {
  status: string | null;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const getColorClass = () => {
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
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getColorClass()}`}
    >
      {status || "Not Set"}
    </span>
  );
}
