"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";

interface DownloadButtonProps {
  bubbleId: string;
  customerName: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  showText?: boolean;
}

export function DownloadButton({
  bubbleId,
  customerName,
  variant = "secondary",
  size = "md",
  showText = true,
}: DownloadButtonProps) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);

    try {
      const response = await fetch(`/api/seda/${bubbleId}/download`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Download failed");
      }

      // Get filename from header
      const contentDisposition = response.headers.get("Content-Disposition");
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename =
        filenameMatch?.[1] || `${customerName}_All_Documents.zip`;

      // Download blob
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download error:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Failed to download documents. Please try again."
      );
    } finally {
      setDownloading(false);
    }
  };

  const getVariantClass = () => {
    switch (variant) {
      case "primary":
        return "bg-primary-600 text-white hover:bg-primary-700 disabled:bg-primary-300";
      case "ghost":
        return "bg-transparent text-gray-600 hover:bg-gray-100 disabled:opacity-50";
      default:
        return "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:bg-gray-100";
    }
  };

  const getSizeClass = () => {
    switch (size) {
      case "sm":
        return "px-2 py-1 text-sm";
      case "lg":
        return "px-6 py-3 text-lg";
      default:
        return "px-4 py-2 text-sm";
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={downloading}
      className={`flex items-center gap-2 rounded-lg font-medium transition-colors duration-200 disabled:cursor-not-allowed ${getVariantClass()} ${getSizeClass()}`}
    >
      {downloading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          {showText && <span>Downloading...</span>}
        </>
      ) : (
        <>
          <Download className="w-4 h-4" />
          {showText && <span>Download All</span>}
        </>
      )}
    </button>
  );
}
