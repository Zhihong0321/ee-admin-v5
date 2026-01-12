"use client";

import { useEffect, useRef, useState } from "react";
import { INVOICE_TEMPLATE_HTML } from "@/lib/invoice-template";
import { X, Printer, Download, Loader2, FileText } from "lucide-react";
import { generateInvoicePdf } from "@/app/invoices/actions";

interface InvoiceViewerProps {
  invoiceData: any;
  onClose: () => void;
  version?: "v1" | "v2";
}

export default function InvoiceViewer({ invoiceData, onClose, version = "v2" }: InvoiceViewerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (iframeRef.current && invoiceData) {
      const doc = iframeRef.current.contentDocument || iframeRef.current.contentWindow?.document;
      if (doc) {
        doc.open();
        
        // Inject data into the template
        const dataScript = `<script>window.invoiceData = ${JSON.stringify(invoiceData)};</script>`;
        const htmlWithData = INVOICE_TEMPLATE_HTML.replace('</head>', `${dataScript}</head>`);
        
        doc.write(htmlWithData);
        doc.close();
      }
    }
  }, [invoiceData]);

  const handlePrint = () => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.print();
    }
  };

  const handleDownloadPdf = async () => {
    if (!invoiceData.id) return;
    setDownloading(true);
    try {
      const result = await generateInvoicePdf(invoiceData.id, version);
      if (result?.downloadUrl) {
        window.open(result.downloadUrl, "_blank");
      }
    } catch (error) {
      console.error("Failed to download PDF:", error);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 md:p-8">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-full flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-secondary-200 bg-secondary-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 rounded-lg">
              <FileText className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-secondary-900">Invoice Preview</h2>
              <p className="text-xs text-secondary-500">{invoiceData?.invoice_number || 'Draft'}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={handleDownloadPdf}
              disabled={downloading}
              className="btn-secondary py-2 flex items-center gap-2"
            >
              {downloading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>PDF</span>
            </button>
            <button 
              onClick={handlePrint}
              className="btn-secondary py-2 flex items-center gap-2"
            >
              <Printer className="w-4 h-4" />
              <span>Print</span>
            </button>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-secondary-200 rounded-full transition-colors text-secondary-500 hover:text-secondary-900"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 bg-secondary-100 p-4 md:p-8 overflow-auto flex justify-center">
          <iframe 
            ref={iframeRef}
            className="w-full max-w-[800px] bg-white shadow-lg min-h-[1100px] rounded-sm"
            title="Invoice Preview"
          />
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-secondary-200 bg-white flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">
            Close Preview
          </button>
          <button 
            onClick={handleDownloadPdf}
            disabled={downloading}
            className="btn-secondary flex items-center gap-2"
          >
            {downloading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Download PDF
          </button>
          <button onClick={handlePrint} className="btn-primary flex items-center gap-2">
            <Printer className="w-4 h-4" />
            Print Invoice
          </button>
        </div>
      </div>
    </div>
  );
}
