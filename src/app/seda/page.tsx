"use client";

import { useState, useEffect } from "react";
import { Search, FileText, Loader2, Eye } from "lucide-react";
import { StatusBadge } from "@/components/seda/status-badge";
import { ProgressBar } from "@/components/seda/progress-bar";
import { DownloadButton } from "@/components/seda/download-button";

interface SedaRegistration {
  id: number;
  bubble_id: string;
  customer_name: string | null;
  installation_address: string | null;
  seda_status: string | null;
  email: string | null;
  ic_no: string | null;
  agent: string | null;
  modified_date: string | null;
  updated_at: string | null;
  share_token: string | null;
}

interface SedaGroup {
  seda_status: string;
  count: number;
  registrations: SedaRegistration[];
}

export default function SedaListPage() {
  const [data, setData] = useState<SedaGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  useEffect(() => {
    fetchData();
  }, [selectedStatus, search]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedStatus !== "all") {
        params.append("status", selectedStatus);
      }
      if (search) {
        params.append("search", search);
      }

      const response = await fetch(`/api/seda/registrations?${params}`);
      if (!response.ok) throw new Error("Failed to fetch");

      const result: SedaGroup[] = await response.json();
      setData(result);
    } catch (error) {
      console.error("Error fetching SEDA registrations:", error);
      alert("Failed to load SEDA registrations. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
  };

  // Calculate total count
  const totalCount = data.reduce((sum, group) => sum + group.count, 0);

  // Get all unique statuses for tabs
  const statusTabs = [
    { status: "all", label: "All", count: totalCount },
    ...data.map(g => ({
      status: g.seda_status,
      label: g.seda_status === "null" ? "Not Set" : g.seda_status,
      count: g.count
    }))
  ];

  // Flatten registrations for table display
  const getFlattenedRegistrations = (): SedaRegistration[] => {
    const all: SedaRegistration[] = [];
    data.forEach(group => {
      all.push(...group.registrations);
    });
    return all;
  };

  const registrations = getFlattenedRegistrations();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">SEDA Registrations</h1>
          <p className="text-gray-600">Manage and monitor SEDA registration progress</p>
        </div>
      </div>

      {/* Status Tabs */}
      <div className="bg-white border border-gray-200 rounded-xl p-1 shadow-sm">
        <div className="flex items-center gap-1 overflow-x-auto">
          {statusTabs.map((tab) => (
            <button
              key={tab.status}
              onClick={() => setSelectedStatus(tab.status)}
              className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-all ${
                selectedStatus === tab.status
                  ? "bg-primary-600 text-white shadow-sm"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
              }`}
            >
              {tab.label}
              <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-gray-200">
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="flex gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search by address, IC, email..."
            className="input pl-10"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <button type="submit" className="btn-secondary">
          Search
        </button>
      </form>

      {/* Data Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Installation Address</th>
                <th>Agent</th>
                <th>SEDA Status</th>
                <th>Last Modified</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary-600" />
                    <p className="mt-4 text-gray-600">Loading SEDA registrations...</p>
                  </td>
                </tr>
              ) : registrations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="p-4 bg-gray-100 rounded-full">
                        <FileText className="h-8 w-8 text-gray-400" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 mb-1">No SEDA registrations found</p>
                        <p className="text-sm text-gray-600">
                          {search ? "Try adjusting your search criteria" : "No registrations available"}
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                registrations.map((seda) => (
                  <tr key={seda.bubble_id} className="hover:bg-gray-50">
                    <td>
                      <div className="font-medium text-gray-900">
                        {seda.customer_name || "N/A"}
                      </div>
                      {seda.email && (
                        <div className="text-sm text-gray-500">{seda.email}</div>
                      )}
                      {seda.ic_no && (
                        <div className="text-xs text-gray-400">{seda.ic_no}</div>
                      )}
                    </td>
                    <td>
                      <div className="text-gray-700 max-w-xs truncate">
                        {seda.installation_address || "N/A"}
                      </div>
                    </td>
                    <td>
                      <div className="text-sm text-gray-600">
                        {seda.agent || "N/A"}
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={seda.seda_status} type="seda_status" />
                    </td>
                    <td>
                      {seda.modified_date ? (
                        <div className="text-sm text-gray-600">
                          {new Date(seda.modified_date).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric'
                          })}
                        </div>
                      ) : seda.updated_at ? (
                        <div className="text-sm text-gray-600">
                          {new Date(seda.updated_at).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric'
                          })}
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">N/A</span>
                      )}
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <DownloadButton
                          bubbleId={seda.bubble_id}
                          customerName={seda.customer_name || "Unknown"}
                          variant="ghost"
                          size="sm"
                          showText={false}
                        />
                        <a
                          href={`https://calculator.atap.solar/view/${seda.share_token || seda.bubble_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-ghost text-primary-600 hover:text-primary-700 flex items-center gap-1.5"
                        >
                          <Eye className="h-4 w-4" />
                          View
                        </a>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
