"use client";

import { useState } from "react";
import {
  FileText,
  Globe,
  Send,
  CheckCircle2,
  Code,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  FileQuestion,
  Zap,
  Clock,
  Link2
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ApiEndpoint {
  method: string;
  path: string;
  description: string;
  features?: string[];
  body?: { [key: string]: string };
  response?: { [key: string]: any };
  example?: any;
  notes?: string;
}

const apiEndpoints: ApiEndpoint[] = [
  {
    method: "POST",
    path: "/api/sync/invoice",
    description: "Fast sync a single invoice by Bubble ID with full integrity and automatic file patching",
    features: [
      "Syncs invoice with all relations (customer, agent, payments, SEDA, items)",
      "Automatically patches file URLs (converts /storage/ to absolute URLs)",
      "Handles Chinese/non-ASCII filenames (renames files + updates database)",
      "Patches payment attachments (both payment and submitted_payment tables)",
      "Patches SEDA registration files (all 13 file fields)"
    ],
    body: {
      bubble_id: "string (required) - The Bubble ID of the invoice to sync",
      force: "boolean (optional, default: false) - Skip timestamp check and force sync",
      skipUsers: "boolean (optional, default: true) - Skip syncing users (they rarely change)",
      skipAgents: "boolean (optional, default: true) - Skip syncing agents (they rarely change)"
    },
    response: {
      success: "boolean",
      invoiceId: "string",
      steps: "array of sync step results",
      stats: "sync statistics per entity",
      errors: "array of error messages",
      filePatching: {
        totalPatched: "number of Chinese filenames patched",
        totalAbsoluteUrls: "number of URLs converted to absolute",
        details: "array of file rename details"
      }
    },
    example: {
      bubble_id: "1647839483923x8394832",
      force: false,
      skipUsers: true,
      skipAgents: true
    }
  },
  {
    method: "POST",
    path: "/api/sync/invoice-items",
    description: "Populates invoice.linked_invoice_item from existing invoice_item table records (NO Bubble fetch)",
    body: {
      dateFrom: "string (optional) - Filter invoices created from this date",
      dateTo: "string (optional) - Filter invoices created until this date"
    },
    response: {
      success: "boolean",
      results: {
        updatedCount: "number of invoices updated",
        totalItems: "total item links created",
        avgItemsPerInvoice: "average items per invoice",
        duration: "operation duration in seconds"
      }
    },
    example: {
      dateFrom: "2026-01-01",
      dateTo: "2026-01-20"
    }
  }
];

const methodColors = {
  GET: "bg-green-100 text-green-700 border-green-200",
  POST: "bg-blue-100 text-blue-700 border-blue-200",
  PUT: "bg-yellow-100 text-yellow-700 border-yellow-200",
  DELETE: "bg-red-100 text-red-700 border-red-200"
};

export default function ApiDocPage() {
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [expandedEndpoint, setExpandedEndpoint] = useState<string | null>(null);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  const copyToClipboard = (text: string, type: 'url' | 'code') => {
    navigator.clipboard.writeText(text);
    if (type === 'url') {
      setCopiedUrl(text);
      setTimeout(() => setCopiedUrl(null), 2000);
    } else {
      setCopiedCode(text);
      setTimeout(() => setCopiedCode(null), 2000);
    }
  };

  const toggleEndpoint = (path: string) => {
    setExpandedEndpoint(expandedEndpoint === path ? null : path);
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2.5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg">
            <FileText className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-secondary-900">API Documentation</h1>
            <p className="text-sm text-secondary-500">Reference documentation for all available API endpoints</p>
          </div>
        </div>
      </div>

      {/* Quick Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-secondary-200 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Globe className="h-5 w-5 text-blue-600" />
            </div>
            <h3 className="font-semibold text-secondary-900">Base URL</h3>
          </div>
          <code className="text-sm text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg block overflow-x-auto">
            {baseUrl}
          </code>
        </div>

        <div className="bg-white rounded-xl border border-secondary-200 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            </div>
            <h3 className="font-semibold text-secondary-900">Status</h3>
          </div>
          <p className="text-sm text-secondary-600">All endpoints operational</p>
        </div>

        <div className="bg-white rounded-xl border border-secondary-200 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Code className="h-5 w-5 text-purple-600" />
            </div>
            <h3 className="font-semibold text-secondary-900">Format</h3>
          </div>
          <p className="text-sm text-secondary-600">JSON Request/Response</p>
        </div>
      </div>

      {/* API Endpoints */}
      <div className="space-y-4">
        {apiEndpoints.map((endpoint) => (
          <div
            key={endpoint.path}
            className="bg-white rounded-xl border border-secondary-200 shadow-sm overflow-hidden"
          >
            {/* Endpoint Header */}
            <button
              onClick={() => toggleEndpoint(endpoint.path)}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-secondary-50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <span className={cn(
                  "px-3 py-1 rounded-md text-xs font-bold border",
                  methodColors[endpoint.method as keyof typeof methodColors]
                )}>
                  {endpoint.method}
                </span>
                <code className="text-sm font-mono text-secondary-700">{endpoint.path}</code>
                <p className="text-sm text-secondary-600 max-w-md truncate">{endpoint.description}</p>
              </div>
              {expandedEndpoint === endpoint.path ? (
                <ChevronDown className="h-5 w-5 text-secondary-400" />
              ) : (
                <ChevronRight className="h-5 w-5 text-secondary-400" />
              )}
            </button>

            {/* Endpoint Details */}
            {expandedEndpoint === endpoint.path && (
              <div className="border-t border-secondary-200 p-6 space-y-6">
                {/* Description */}
                <div>
                  <h4 className="text-sm font-semibold text-secondary-900 mb-2 flex items-center gap-2">
                    <FileQuestion className="h-4 w-4 text-secondary-500" />
                    Description
                  </h4>
                  <p className="text-sm text-secondary-600">{endpoint.description}</p>
                </div>

                {/* Features */}
                {endpoint.features && endpoint.features.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-secondary-900 mb-3 flex items-center gap-2">
                      <Zap className="h-4 w-4 text-secondary-500" />
                      Features
                    </h4>
                    <ul className="space-y-2">
                      {endpoint.features.map((feature, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm text-secondary-600">
                          <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Request Body */}
                {endpoint.body && (
                  <div>
                    <h4 className="text-sm font-semibold text-secondary-900 mb-3 flex items-center gap-2">
                      <Send className="h-4 w-4 text-secondary-500" />
                      Request Body
                    </h4>
                    <div className="bg-secondary-50 rounded-lg p-4 overflow-x-auto">
                      <pre className="text-sm text-secondary-700">
                        {JSON.stringify(endpoint.body, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}

                {/* Response */}
                {endpoint.response && (
                  <div>
                    <h4 className="text-sm font-semibold text-secondary-900 mb-3 flex items-center gap-2">
                      <Clock className="h-4 w-4 text-secondary-500" />
                      Response
                    </h4>
                    <div className="bg-secondary-50 rounded-lg p-4 overflow-x-auto">
                      <pre className="text-sm text-secondary-700">
                        {JSON.stringify(endpoint.response, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}

                {/* Example */}
                {endpoint.example && (
                  <div>
                    <h4 className="text-sm font-semibold text-secondary-900 mb-3 flex items-center gap-2">
                      <Code className="h-4 w-4 text-secondary-500" />
                      Example Request
                    </h4>
                    <div className="space-y-3">
                      <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto relative group">
                        <button
                          onClick={() => copyToClipboard(JSON.stringify(endpoint.example, null, 2), 'code')}
                          className="absolute top-2 right-2 p-2 bg-slate-700 hover:bg-slate-600 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          {copiedCode === JSON.stringify(endpoint.example, null, 2) ? (
                            <Check className="h-4 w-4 text-green-400" />
                          ) : (
                            <Copy className="h-4 w-4 text-slate-300" />
                          )}
                        </button>
                        <pre className="text-sm text-slate-100">
                          {JSON.stringify(endpoint.example, null, 2)}
                        </pre>
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="text-xs bg-secondary-100 px-2 py-1 rounded text-secondary-600">
                          curl -X POST {baseUrl}{endpoint.path} -H "Content-Type: application/json" -d {'{"bubble_id":"..."}'}
                        </code>
                        <button
                          onClick={() => copyToClipboard(`curl -X POST ${baseUrl}${endpoint.path} -H "Content-Type: application/json" -d '${JSON.stringify(endpoint.example)}'`, 'url')}
                          className="p-1.5 hover:bg-secondary-100 rounded transition-colors"
                        >
                          {copiedUrl?.includes('curl') ? (
                            <Check className="h-3 w-3 text-green-600" />
                          ) : (
                            <Copy className="h-3 w-3 text-secondary-400" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Notes */}
                {endpoint.notes && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-amber-900 mb-2 flex items-center gap-2">
                      <Link2 className="h-4 w-4" />
                      Notes
                    </h4>
                    <p className="text-sm text-amber-800">{endpoint.notes}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add More Notice */}
      <div className="mt-8 p-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200">
        <div className="flex items-start gap-4">
          <div className="p-2 bg-blue-100 rounded-lg">
            <FileText className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-blue-900 mb-1">Need More Endpoints?</h3>
            <p className="text-sm text-blue-700">
              New API endpoints can be added to the <code className="bg-blue-100 px-1.5 py-0.5 rounded">src/app/api</code> directory.
              Document them here by updating the <code className="bg-blue-100 px-1.5 py-0.5 rounded">apiEndpoints</code> array in this page.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
