"use client";

import { useEffect, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Pencil,
  X,
  ZoomIn,
} from "lucide-react";
import { parseFileUrls, serializeFileUrls } from "@/lib/file-urls";

function isImageUrl(url: string) {
  return /\.(jpg|jpeg|png|gif|webp|heic|bmp)(\?|#|$)/i.test(url);
}

function filenameFromUrl(url: string) {
  try {
    const { pathname } = new URL(url, "https://placeholder.local");
    const last = pathname.split("/").pop();
    return last ? decodeURIComponent(last) : url;
  } catch {
    return url.split("/").pop() || url;
  }
}

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

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") onPrev();
      if (event.key === "ArrowRight") onNext();
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
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between w-full mb-3 px-2">
          <span className="text-white/60 text-sm font-mono">
            {index + 1} / {urls.length}
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
              title="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {isImageUrl(url) ? (
          <img
            src={url}
            alt={filenameFromUrl(url)}
            className="max-h-[75vh] max-w-full object-contain rounded-lg shadow-2xl"
          />
        ) : (
          <div className="bg-white/10 rounded-xl p-8 text-center">
            <FileText className="h-16 w-16 text-white/50 mx-auto mb-4" />
            <p className="text-white text-sm mb-4 break-all">{filenameFromUrl(url)}</p>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg transition"
            >
              <ExternalLink className="h-4 w-4" /> Open File
            </a>
          </div>
        )}

        {urls.length > 1 && (
          <>
            <button
              onClick={onPrev}
              className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 bg-white/10 hover:bg-white/20 text-white rounded-full p-2 transition"
              title="Previous"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={onNext}
              className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 bg-white/10 hover:bg-white/20 text-white rounded-full p-2 transition"
              title="Next"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}

        <p className="text-white/40 text-xs mt-3 text-center break-all max-w-md px-4">
          {filenameFromUrl(url)}
        </p>
      </div>
    </div>
  );
}

function FilePreviewGrid({ urls }: { urls: string[] }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {urls.map((url, index) => (
          <div
            key={`${url}-${index}`}
            className="group relative rounded-xl border border-gray-200 overflow-hidden bg-gray-50 hover:shadow-md transition-all cursor-pointer"
            onClick={() => setLightboxIndex(index)}
          >
            {isImageUrl(url) ? (
              <>
                <img
                  src={url}
                  alt={filenameFromUrl(url)}
                  className="w-full h-28 object-cover group-hover:opacity-90 transition"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <ZoomIn className="h-7 w-7 text-white drop-shadow-lg" />
                </div>
              </>
            ) : (
              <div className="h-28 flex flex-col items-center justify-center gap-2 bg-orange-50 border-orange-200">
                <FileText className="h-8 w-8 text-orange-700" />
                <span className="text-[10px] uppercase tracking-wide text-orange-700/70 font-semibold">
                  PDF
                </span>
              </div>
            )}
            <div className="px-2 py-1.5 text-xs text-gray-500 border-t border-gray-100 truncate bg-white">
              {filenameFromUrl(url)}
            </div>
          </div>
        ))}
      </div>

      {lightboxIndex !== null && (
        <Lightbox
          urls={urls}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onPrev={() =>
            setLightboxIndex((lightboxIndex - 1 + urls.length) % urls.length)
          }
          onNext={() => setLightboxIndex((lightboxIndex + 1) % urls.length)}
        />
      )}
    </>
  );
}

export function MultiFileField({
  label,
  value,
  onSave,
  saving,
  hint = "Paste one file URL per line.",
  emptyLabel = "No files uploaded",
}: {
  label: string;
  value: unknown;
  onSave: (value: string | null) => Promise<void>;
  saving: boolean;
  hint?: string;
  emptyLabel?: string;
}) {
  const urls = parseFileUrls(value);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(urls.join("\n"));
  const [localSaving, setLocalSaving] = useState(false);

  useEffect(() => {
    if (!isEditing) setDraft(urls.join("\n"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, value]);

  const handleSave = async () => {
    const lines = draft
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    setLocalSaving(true);
    try {
      await onSave(serializeFileUrls(lines));
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to save files:", error);
    } finally {
      setLocalSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="text-sm font-medium text-gray-500">
            {label}
            {urls.length > 1 && (
              <span className="ml-2 inline-flex items-center rounded-full bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary-700">
                {urls.length} files
              </span>
            )}
          </div>
          <div className="text-xs text-gray-400">{hint}</div>
        </div>
        {!isEditing && (
          <button
            onClick={() => {
              setDraft(urls.join("\n"));
              setIsEditing(true);
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
          >
            <Pencil className="w-3 h-3" />
            Edit
          </button>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-2">
          <textarea
            rows={Math.min(10, Math.max(3, urls.length + 1))}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 text-sm break-all"
            placeholder="https://..."
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving || localSaving}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md disabled:opacity-60 transition-colors"
            >
              <Check className="w-3 h-3" />
              Save
            </button>
            <button
              onClick={() => {
                setDraft(urls.join("\n"));
                setIsEditing(false);
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
            >
              <X className="w-3 h-3" />
              Cancel
            </button>
          </div>
        </div>
      ) : urls.length > 0 ? (
        <FilePreviewGrid urls={urls} />
      ) : (
        <div className="text-sm text-slate-400 italic py-2">{emptyLabel}</div>
      )}
    </div>
  );
}
