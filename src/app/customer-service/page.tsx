"use client";

import { useState, useEffect } from "react";
import { getPaidInvoices, getCustomerServiceNo, saveCustomerServiceNo, createWhatsAppGroup, testCreateWhatsAppGroup } from "./actions";
import { Loader2, Save, MessageCircle, AlertTriangle } from "lucide-react";

export default function CustomerServicePage() {
  const [csNo, setCsNo] = useState("");
  const [savingCsNo, setSavingCsNo] = useState(false);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [testingGroup, setTestingGroup] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [no, invData] = await Promise.all([
        getCustomerServiceNo(),
        getPaidInvoices()
      ]);
      setCsNo(no);
      setInvoices(invData);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveSettings() {
    if (!csNo) {
      alert("Please enter a valid WhatsApp number.");
      return;
    }
    setSavingCsNo(true);
    try {
      const res = await saveCustomerServiceNo(csNo);
      if (res.success) {
        alert("Customer Service Number saved successfully.");
      } else {
        alert(`Failed to save: ${res.error}`);
      }
    } catch (e) {
      alert("Error saving settings.");
    } finally {
      setSavingCsNo(false);
    }
  }

  async function handleCreateGroup(inv: any) {
    if (!csNo) {
      alert("Please set a Customer Service WhatsApp number in the settings above first.");
      return;
    }

    setProcessingId(inv.id);
    const participants = [
      csNo,
      inv.agent_phone,
      inv.customer_phone
    ];

    try {
      const res = await createWhatsAppGroup(inv.customer_name || "Unknown Customer", participants);
      if (res.success) {
        alert(`Successfully created WhatsApp Group!`);
      } else {
        alert(`Could not create group: ${res.error}`);
      }
    } catch (e) {
      alert("An unexpected error occurred.");
    } finally {
      setProcessingId(null);
    }
  }

  async function handleTestCreateGroup() {
    if (!csNo) {
      alert("Please enter or save a Customer Service WhatsApp number first.");
      return;
    }
    setTestingGroup(true);
    try {
      const res = await testCreateWhatsAppGroup(csNo);
      if (res.success) {
        alert("Successfully created test WhatsApp Group!");
      } else {
        alert(`Could not create test group: ${res.error}`);
      }
    } catch (e) {
      alert("An unexpected error occurred during test.");
    } finally {
      setTestingGroup(false);
    }
  }

  return (
    <div className="space-y-8 animate-fade-in p-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold text-secondary-900">Customer Service Dashboard</h1>
        <p className="text-secondary-600">
          Manage customer service settings and initiate WhatsApp groups for fully or partially paid invoices.
        </p>
      </div>

      <div className="card p-6 border-l-4 border-primary-500">
        <h2 className="text-xl font-semibold mb-4 text-secondary-900">Settings</h2>
        <div className="flex flex-col md:flex-row items-end gap-4 max-w-md">
          <div className="w-full">
            <label className="block text-sm font-medium text-secondary-700 mb-1">
              Customer Service WhatsApp No.
            </label>
            <input
              type="text"
              placeholder="e.g. 60123456789"
              className="input w-full"
              value={csNo}
              onChange={(e) => setCsNo(e.target.value)}
            />
          </div>
          <button 
            onClick={handleSaveSettings}
            disabled={savingCsNo}
            className="btn-primary whitespace-nowrap"
          >
            {savingCsNo ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5 mr-2 inline-block" />}
            {savingCsNo ? "Saving..." : "Save Config"}
          </button>
          <button 
            onClick={handleTestCreateGroup}
            disabled={testingGroup || !csNo}
            className="btn-secondary whitespace-nowrap"
          >
            {testingGroup ? <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" /> : <MessageCircle className="w-5 h-5 mr-2 inline-block" />}
            {testingGroup ? "Testing..." : "Test Create WA Group"}
          </button>
        </div>
        <p className="text-xs text-secondary-500 mt-2">Include country code without '+' sign (e.g. 60123456789).</p>
      </div>

      <div className="card">
        <div className="p-6 border-b border-secondary-200">
          <h2 className="text-xl font-semibold text-secondary-900">Paid Invoices</h2>
          <p className="text-sm text-secondary-500">Invoices sorted by 1st payment date (latest on top)</p>
        </div>
        
        <div className="overflow-x-auto">
          <table className="table w-full">
            <thead>
              <tr>
                <th>Invoice No.</th>
                <th>Customer</th>
                <th>Agent</th>
                <th>1st Payment Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center">
                    <Loader2 className="w-8 h-8 text-primary-500 animate-spin mx-auto inline-block" />
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-secondary-500">No paid invoices found.</td>
                </tr>
              ) : (
                invoices.map((inv) => {
                  const missingCustomerPhone = !inv.customer_phone || String(inv.customer_phone).trim() === "";
                  return (
                    <tr key={inv.id}>
                      <td className="font-semibold text-secondary-900">
                        {inv.invoice_number || `INV-${inv.id}`}
                      </td>
                      <td>
                        <div className="flex flex-col">
                          <span className="font-medium text-secondary-700">{inv.customer_name || "N/A"}</span>
                          {missingCustomerPhone ? (
                            <span className="flex items-center text-xs text-red-500 mt-1 font-semibold">
                              <AlertTriangle className="w-3 h-3 mr-1 inline-block" /> Missing phone No.
                            </span>
                          ) : (
                            <span className="text-xs text-secondary-500">{inv.customer_phone}</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="flex flex-col">
                          <span className="text-secondary-700">{inv.agent_name || "N/A"}</span>
                          <span className="text-xs text-secondary-500">{inv.agent_phone || "No contact"}</span>
                        </div>
                      </td>
                      <td className="text-secondary-600">
                        {inv.first_payment_date ? new Date(inv.first_payment_date).toLocaleDateString() : "N/A"}
                      </td>
                      <td>
                        <button
                          onClick={() => handleCreateGroup(inv)}
                          disabled={processingId === inv.id}
                          className="btn-secondary text-primary-600 hover:text-primary-700 flex items-center shadow-sm disabled:opacity-50"
                        >
                          {processingId === inv.id ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin inline-block" />
                          ) : (
                            <MessageCircle className="w-4 h-4 mr-2 inline-block" />
                          )}
                          Create WA Group
                        </button>
                      </td>
                    </tr>
                  );
                })
               )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
