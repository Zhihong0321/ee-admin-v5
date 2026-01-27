"use client";

import { useEffect, useRef, useState } from "react";
import { INVOICE_TEMPLATE_HTML } from "@/lib/invoice-template";
import { X, Printer, Download, Loader2, FileText, User, CreditCard, Package, MapPin, Phone, Mail, Calendar, DollarSign, Info } from "lucide-react";
import { generateInvoicePdf } from "@/app/invoices/actions";

interface InvoiceViewerProps {
  invoiceData: any;
  onClose: () => void;
  version?: "v1" | "v2";
}

type Tab = "preview" | "details";

export default function InvoiceViewer({ invoiceData, onClose, version = "v2" }: InvoiceViewerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("preview");

  useEffect(() => {
    if (iframeRef.current && invoiceData && activeTab === "preview") {
      const doc = iframeRef.current.contentDocument || iframeRef.current.contentWindow?.document;
      if (doc) {
        doc.open();
        const dataScript = `<script>window.invoiceData = ${JSON.stringify(invoiceData)};</script>`;
        const htmlWithData = INVOICE_TEMPLATE_HTML.replace('</head>', `${dataScript}</head>`);
        doc.write(htmlWithData);
        doc.close();
      }
    }
  }, [invoiceData, activeTab]);

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
      <div className="bg-white rounded-2xl shadow-2xl w-full h-[95vh] max-h-[95vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-secondary-200 bg-secondary-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 rounded-lg">
              <FileText className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-secondary-900">Invoice Details</h2>
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
              onClick={onClose}
              className="p-2 hover:bg-secondary-200 rounded-full transition-colors text-secondary-500 hover:text-secondary-900"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-6 bg-secondary-50/50 border-b border-secondary-200">
          <button
            onClick={() => setActiveTab("preview")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "preview"
                ? "border-primary-600 text-primary-600"
                : "border-transparent text-secondary-600 hover:text-secondary-900"
            }`}
          >
            Preview
          </button>
          <button
            onClick={() => setActiveTab("details")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === "details"
                ? "border-primary-600 text-primary-600"
                : "border-transparent text-secondary-600 hover:text-secondary-900"
            }`}
          >
            <Info className="w-4 h-4" />
            Details
          </button>
        </div>

        {/* Content */}
        {activeTab === "preview" ? (
          <div className="flex-1 bg-secondary-100 p-4 md:p-8 overflow-auto flex justify-center">
            <iframe 
              ref={iframeRef}
              className="w-full max-w-[800px] bg-white shadow-lg min-h-[1100px] rounded-sm"
              title="Invoice Preview"
            />
          </div>
        ) : (
          <div className="flex-1 overflow-auto p-6 bg-secondary-50">
            <div className="max-w-full mx-auto space-y-6">
              {/* Invoice Summary */}
              <div className="card p-6">
                <div className="flex items-center gap-3 mb-4">
                  <FileText className="w-5 h-5 text-primary-600" />
                  <h3 className="text-lg font-bold text-secondary-900">Invoice Summary</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="min-w-0">
                    <label className="text-sm text-secondary-500">Invoice Number</label>
                    <p className="font-semibold text-secondary-900 truncate" title={invoiceData?.invoice_number}>{invoiceData?.invoice_number || 'N/A'}</p>
                  </div>
                  <div className="min-w-0">
                    <label className="text-sm text-secondary-500">Invoice Date</label>
                    <p className="font-semibold text-secondary-900 truncate">
                      {invoiceData?.invoice_date 
                        ? new Date(invoiceData.invoice_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                        : 'N/A'}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <label className="text-sm text-secondary-500">Status</label>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0 ${
                        invoiceData?.paid ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {invoiceData?.paid ? 'Paid' : 'Pending'}
                      </span>
                      <span className="text-sm text-secondary-600">
                        {invoiceData?.percent_of_total_amount ? `${parseFloat(invoiceData.percent_of_total_amount).toFixed(1)}%` : '0%'} Paid
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Customer Details */}
              <div className="card p-6">
                <div className="flex items-center gap-3 mb-4">
                  <User className="w-5 h-5 text-primary-600" />
                  <h3 className="text-lg font-bold text-secondary-900">Customer Details</h3>
                </div>
                {invoiceData?.customer_data ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="min-w-0">
                      <label className="text-sm text-secondary-500">Name</label>
                      <p className="font-semibold text-secondary-900 truncate" title={invoiceData.customer_data.name}>{invoiceData.customer_data.name || 'N/A'}</p>
                    </div>
                    <div className="min-w-0">
                      <label className="text-sm text-secondary-500">IC Number</label>
                      <p className="font-medium text-secondary-700 truncate" title={invoiceData.customer_data.ic_number}>{invoiceData.customer_data.ic_number || 'N/A'}</p>
                    </div>
                    <div className="flex items-start gap-2 min-w-0">
                      <Mail className="w-4 h-4 text-secondary-400 mt-1 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <label className="text-sm text-secondary-500">Email</label>
                        <p className="font-medium text-secondary-700 truncate" title={invoiceData.customer_data.email}>{invoiceData.customer_data.email || 'N/A'}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 min-w-0">
                      <Phone className="w-4 h-4 text-secondary-400 mt-1 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <label className="text-sm text-secondary-500">Phone</label>
                        <p className="font-medium text-secondary-700 truncate" title={invoiceData.customer_data.phone}>{invoiceData.customer_data.phone || 'N/A'}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 md:col-span-2 min-w-0">
                      <MapPin className="w-4 h-4 text-secondary-400 mt-1 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <label className="text-sm text-secondary-500">Address</label>
                        <p className="font-medium text-secondary-700">
                          {invoiceData.customer_data.address ? `${invoiceData.customer_data.address}, ` : ''}
                          {invoiceData.customer_data.city ? `${invoiceData.customer_data.city}, ` : ''}
                          {invoiceData.customer_data.state ? `${invoiceData.customer_data.state} ` : ''}
                          {invoiceData.customer_data.postcode || ''}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-secondary-500">No customer details available</p>
                )}
              </div>

              {/* Invoice Items */}
              <div className="card p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Package className="w-5 h-5 text-primary-600" />
                  <h3 className="text-lg font-bold text-secondary-900">Invoice Items</h3>
                  <span className="px-2 py-0.5 bg-secondary-100 text-secondary-600 text-xs rounded-full">
                    {invoiceData?.items?.length || 0} items
                  </span>
                </div>
                {invoiceData?.items && invoiceData.items.length > 0 ? (
                  <table className="table w-full">
                    <thead>
                      <tr>
                        <th className="w-[40%]">Description</th>
                        <th className="text-center w-[10%]">Qty</th>
                        <th className="text-right w-[25%]">Unit Price</th>
                        <th className="text-right w-[25%]">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoiceData.items.map((item: any, index: number) => (
                        <tr key={item.id || index}>
                          <td>
                            <div className="font-medium text-secondary-900 truncate" title={item.description}>{item.description || 'N/A'}</div>
                            {item.inv_item_type && (
                              <div className="text-xs text-secondary-500 capitalize">{item.inv_item_type}</div>
                            )}
                          </td>
                          <td className="text-center">
                            <span className="px-2 py-1 bg-secondary-100 text-secondary-700 rounded text-sm">
                              {item.qty || 0}
                            </span>
                          </td>
                          <td className="text-right text-secondary-700">
                            {item.unit_price ? `MYR ${parseFloat(item.unit_price).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '-'}
                          </td>
                          <td className="text-right font-semibold text-secondary-900">
                            MYR {parseFloat(item.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-secondary-50">
                        <td colSpan={3} className="text-right font-bold text-secondary-900">
                          Total
                        </td>
                        <td className="text-right font-bold text-primary-600 text-lg">
                          MYR {parseFloat(invoiceData.total_amount || invoiceData.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                ) : (
                  <p className="text-secondary-500">No invoice items found</p>
                )}
              </div>

              {/* Payments */}
              <div className="card p-6">
                <div className="flex items-center gap-3 mb-4">
                  <CreditCard className="w-5 h-5 text-primary-600" />
                  <h3 className="text-lg font-bold text-secondary-900">Payments</h3>
                  <span className="px-2 py-0.5 bg-secondary-100 text-secondary-600 text-xs rounded-full">
                    {invoiceData?.linked_payments?.length || 0} payments
                  </span>
                  <span className="ml-auto text-sm font-semibold text-green-600">
                    Total: MYR {parseFloat(invoiceData?.total_payments || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                {invoiceData?.linked_payments && invoiceData.linked_payments.length > 0 ? (
                  <table className="table w-full">
                    <thead>
                      <tr>
                        <th className="w-[20%]">Date</th>
                        <th className="w-[25%]">Method</th>
                        <th className="w-[25%]">Bank/Terminal</th>
                        <th className="text-right w-[30%]">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoiceData.linked_payments.map((payment: any, index: number) => (
                        <tr key={payment.id || index}>
                          <td>
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4 text-secondary-400 flex-shrink-0" />
                              <span className="truncate">
                                {payment.payment_date 
                                  ? new Date(payment.payment_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                                  : 'N/A'}
                              </span>
                            </div>
                          </td>
                          <td>
                            <span className="px-2 py-1 bg-secondary-100 text-secondary-700 rounded text-sm capitalize inline-block">
                              {payment.payment_method_v2 || payment.payment_method || 'N/A'}
                            </span>
                            {payment.epp_type && (
                              <span className="ml-1 text-xs text-secondary-500 block truncate">({payment.epp_type})</span>
                            )}
                          </td>
                          <td>
                            <div className="text-sm text-secondary-700 truncate" title={payment.issuer_bank || payment.terminal}>
                              {payment.issuer_bank || payment.terminal || '-'}
                            </div>
                            {payment.epp_month && (
                              <div className="text-xs text-secondary-500">{payment.epp_month} months</div>
                            )}
                          </td>
                          <td className="text-right font-semibold text-green-600">
                            <div className="flex items-center justify-end gap-1">
                              <DollarSign className="w-4 h-4" />
                              <span>MYR {parseFloat(payment.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-secondary-500">No payments found</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-secondary-200 bg-white flex justify-between items-center">
          <div className="text-sm text-secondary-500">
            Created by: <span className="font-medium text-secondary-700">{invoiceData?.created_by_user_name || 'System'}</span>
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="btn-secondary">
              Close
            </button>
            <button 
              onClick={handleDownloadPdf}
              disabled={downloading}
              className="btn-primary flex items-center gap-2"
            >
              {downloading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              Download PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
