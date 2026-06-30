"use client";

import { Send, Loader2, AlertCircle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { getPaymentReceiptPreview, manualSendReceipt } from "@/app/(app)/payments/actions";

interface ReceiptPreviewModalProps {
  paymentId: number | null;
  onClose: () => void;
}

export function ReceiptPreviewModal({ paymentId, onClose }: ReceiptPreviewModalProps) {
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [html, setHtml] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (paymentId) {
      loadPreview(paymentId);
    } else {
      setHtml("");
      setError(null);
      setSuccessMsg(null);
    }
  }, [paymentId]);

  async function loadPreview(id: number) {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await getPaymentReceiptPreview(id);
      if (res.success && res.html) {
        setHtml(res.html);
        setPhone(res.phone || "Unknown Phone");
      } else {
        setError(res.error || "Failed to load preview");
      }
    } catch (e: any) {
      setError(e.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  }

  async function handleSend() {
    if (!paymentId) return;
    setSending(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await manualSendReceipt(paymentId);
      if (res.success) {
        setSuccessMsg("Receipt successfully sent to WhatsApp!");
      } else {
        setError(res.error || "Failed to send receipt");
      }
    } catch (e: any) {
      setError(e.message || "An error occurred while sending");
    } finally {
      setSending(false);
    }
  }

  if (!paymentId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-secondary-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-white">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Receipt Preview</h3>
            {phone && <p className="text-sm text-gray-500 mt-1">Client WhatsApp: {phone}</p>}
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={handleSend}
              disabled={loading || sending || !html || !!successMsg}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : successMsg ? (
                "Sent"
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Send to Client WhatsApp
                </>
              )}
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-secondary-400 hover:text-secondary-600 hover:bg-secondary-100 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 bg-gray-50 p-4 overflow-y-auto relative">
          {loading && (
            <div className="absolute inset-0 bg-white/50 flex flex-col items-center justify-center z-10">
              <Loader2 className="h-8 w-8 text-primary-600 animate-spin mb-2" />
              <p className="text-sm text-gray-600">Generating preview...</p>
            </div>
          )}

          {error && (
            <div className="m-4 p-4 bg-red-50 text-red-700 rounded-lg flex items-start gap-3">
              <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium">Error</h4>
                <p className="text-sm mt-1">{error}</p>
              </div>
            </div>
          )}

          {successMsg && (
            <div className="mx-4 mt-4 p-4 bg-green-50 text-green-700 rounded-lg flex items-center gap-3">
              <Send className="h-5 w-5" />
              <p className="font-medium">{successMsg}</p>
            </div>
          )}

          {html && !error && (
            <div className="w-full h-full bg-white rounded-lg shadow-sm overflow-hidden border border-gray-200">
              <iframe 
                srcDoc={html} 
                className="w-full h-full border-0"
                title="Receipt Preview"
              />
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
