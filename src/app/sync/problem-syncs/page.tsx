/**
 * ============================================================================
 * PAYMENT PROBLEM SYNCS PAGE
 * ============================================================================
 *
 * Displays a list of problematic payment syncs that couldn't be processed.
 * Allows viewing, filtering, and managing these problem syncs.
 *
 * Problem Types:
 * - missing_invoice: Payment has linked_invoice but invoice not found in DB
 * - bubble_not_found: Payment ID not found in Bubble API
 * - sync_failed: General sync failure
 *
 * File: src/app/sync/problem-syncs/page.tsx
 */

"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, RefreshCw, Trash2, Search, Filter } from "lucide-react";
import Link from "next/link";

interface ProblemSync {
  paymentBubbleId: string;
  linkedInvoiceBubbleId?: string;
  issueType: 'missing_invoice' | 'bubble_not_found' | 'sync_failed';
  timestamp: string;
  errorMessage?: string;
  paymentAmount?: string;
  paymentDate?: string;
}

export default function ProblemSyncsPage() {
  const [problems, setProblems] = useState<ProblemSync[]>([]);
  const [filteredProblems, setFilteredProblems] = useState<ProblemSync[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<'all' | 'missing_invoice' | 'bubble_not_found' | 'sync_failed'>('all');
  const [isClearing, setIsClearing] = useState(false);

  // Fetch problem syncs
  const fetchProblems = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/sync/payment-problems");
      const result = await response.json();

      if (result.success) {
        setProblems(result.problems);
      } else {
        console.error("Failed to load problems:", result.error);
      }
    } catch (error) {
      console.error("Error fetching problems:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Clear specific problem
  const clearProblem = async (paymentId: string) => {
    if (!confirm(`Remove payment ${paymentId} from problem list?`)) return;

    setIsClearing(true);
    try {
      const response = await fetch("/api/sync/payment-problems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId })
      });

      const result = await response.json();

      if (result.success) {
        // Remove from local state
        setProblems(problems.filter(p => p.paymentBubbleId !== paymentId));
      } else {
        alert(`Failed: ${result.error}`);
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setIsClearing(false);
    }
  };

  // Clear all problems
  const clearAllProblems = async () => {
    if (!confirm(`Clear all ${problems.length} problems from the list?`)) return;

    setIsClearing(true);
    try {
      const response = await fetch("/api/sync/payment-problems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });

      const result = await response.json();

      if (result.success) {
        setProblems([]);
      } else {
        alert(`Failed: ${result.error}`);
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setIsClearing(false);
    }
  };

  // Filter problems
  useEffect(() => {
    let filtered = problems;

    // Apply type filter
    if (filterType !== 'all') {
      filtered = filtered.filter(p => p.issueType === filterType);
    }

    // Apply search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.paymentBubbleId.toLowerCase().includes(query) ||
        p.linkedInvoiceBubbleId?.toLowerCase().includes(query) ||
        p.errorMessage?.toLowerCase().includes(query)
      );
    }

    setFilteredProblems(filtered);
  }, [problems, searchQuery, filterType]);

  // Initial load
  useEffect(() => {
    fetchProblems();
  }, []);

  // Get issue type label and color
  const getIssueTypeBadge = (type: string) => {
    switch (type) {
      case 'missing_invoice':
        return <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded-full text-xs">Missing Invoice</span>;
      case 'bubble_not_found':
        return <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs">Not Found in Bubble</span>;
      case 'sync_failed':
        return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs">Sync Failed</span>;
      default:
        return <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded-full text-xs">{type}</span>;
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <AlertTriangle className="w-8 h-8 text-orange-500" />
              Problem Payment Syncs
            </h1>
            <p className="text-gray-600 mt-2">
              Payments that couldn't be synced or linked to invoices
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/sync"
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center gap-2"
            >
              ← Back to Sync
            </Link>
            <button
              onClick={fetchProblems}
              disabled={isLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-orange-500">
          <div className="text-sm text-gray-600">Total Problems</div>
          <div className="text-2xl font-bold">{problems.length}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-orange-500">
          <div className="text-sm text-gray-600">Missing Invoice</div>
          <div className="text-2xl font-bold">{problems.filter(p => p.issueType === 'missing_invoice').length}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-red-500">
          <div className="text-sm text-gray-600">Not Found in Bubble</div>
          <div className="text-2xl font-bold">{problems.filter(p => p.issueType === 'bubble_not_found').length}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-yellow-500">
          <div className="text-sm text-gray-600">Sync Failed</div>
          <div className="text-2xl font-bold">{problems.filter(p => p.issueType === 'sync_failed').length}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search by payment ID, invoice ID, or error..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Filter */}
          <div className="md:w-64">
            <label className="block text-sm font-medium text-gray-700 mb-1">Filter by Issue Type</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Issues</option>
              <option value="missing_invoice">Missing Invoice</option>
              <option value="bubble_not_found">Not Found in Bubble</option>
              <option value="sync_failed">Sync Failed</option>
            </select>
          </div>

          {/* Clear All */}
          {problems.length > 0 && (
            <div className="md:w-auto flex items-end">
              <button
                onClick={clearAllProblems}
                disabled={isClearing}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-300 flex items-center gap-2 h-10"
              >
                <Trash2 className="w-4 h-4" />
                Clear All
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Problems List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
            Loading...
          </div>
        ) : filteredProblems.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {problems.length === 0 ? (
              <>
                <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-lg font-medium">No problem syncs found</p>
                <p className="text-sm mt-1">All payments synced successfully!</p>
              </>
            ) : (
              <>
                <Search className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-lg font-medium">No problems match your filters</p>
                <p className="text-sm mt-1">Try adjusting your search or filter</p>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payment ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Issue Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Error</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Timestamp</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredProblems.map((problem) => (
                  <tr key={problem.paymentBubbleId} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="font-mono text-sm text-gray-900">{problem.paymentBubbleId}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getIssueTypeBadge(problem.issueType)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {problem.linkedInvoiceBubbleId ? (
                        <span className="font-mono text-sm text-gray-600">{problem.linkedInvoiceBubbleId}</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {problem.paymentAmount ? (
                        <span className="text-sm text-gray-900">RM {problem.paymentAmount}</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600 max-w-xs truncate block" title={problem.errorMessage}>
                        {problem.errorMessage}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-500">
                        {new Date(problem.timestamp).toLocaleString()}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <button
                        onClick={() => clearProblem(problem.paymentBubbleId)}
                        disabled={isClearing}
                        className="text-red-600 hover:text-red-900 disabled:text-gray-400"
                        title="Remove from list"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-6 text-center text-sm text-gray-500">
        Showing {filteredProblems.length} of {problems.length} problems
      </div>
    </div>
  );
}
