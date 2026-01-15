"use client";

import { useState, useEffect, useCallback } from "react";
import { Building2, Plus, Edit2, Mail, Phone, MapPin,
  Globe, CreditCard, FileText, CheckCircle2,
  Settings2, AlertCircle, Trash2, HardDrive, RefreshCw, Loader2,
  Download, Database, FolderOpen, Zap, Activity, FileDown
} from "lucide-react";
import { getTemplates, updateTemplate, createTemplate, setDefaultTemplate, deleteTemplate } from "./actions";
import { testStorageHealth, syncFilesByCategory, SyncCategory } from "./storage-actions";

export default function ManageCompanyPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<any | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Storage states
  const [storageStatus, setStorageStatus] = useState<{status: string, message: string} | null>(null);
  const [isCheckingStorage, setIsCheckingStorage] = useState(false);
  const [activeCategory, setActiveCategory] = useState<SyncCategory | null>(null);
  const [syncProgress, setSyncProgress] = useState<Record<string, {success: number, failed: number}>>({});

  // Full migration states
  const [migrationStats, setMigrationStats] = useState<any>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationSessionId, setMigrationSessionId] = useState<string | null>(null);
  const [migrationProgress, setMigrationProgress] = useState<any>(null);

  useEffect(() => {
    fetchData();
    fetchMigrationStats();
  }, []);

  // Fetch migration statistics
  const fetchMigrationStats = async () => {
    setIsLoadingStats(true);
    try {
      const res = await fetch('/api/migration/stats');
      const data = await res.json();
      if (data.success) {
        setMigrationStats(data.stats);
      }
    } catch (error) {
      console.error('Failed to fetch migration stats:', error);
    } finally {
      setIsLoadingStats(false);
    }
  };

  // Start full migration
  const handleStartMigration = async () => {
    if (!confirm(`Start comprehensive file migration?\n\nThis will download ${migrationStats?.totalFiles || 0} files from Bubble and update all database URLs.\n\nThe process will run in the background and you can track progress here.`)) {
      return;
    }

    setIsMigrating(true);
    try {
      const res = await fetch('/api/migration/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();

      if (data.success) {
        setMigrationSessionId(data.sessionId);
        // Start SSE progress tracking
        startProgressTracking(data.sessionId);
      } else {
        alert('Failed to start migration: ' + data.error);
        setIsMigrating(false);
      }
    } catch (error) {
      console.error('Failed to start migration:', error);
      alert('Failed to start migration');
      setIsMigrating(false);
    }
  };

  // SSE progress tracking
  const startProgressTracking = useCallback((sessionId: string) => {
    const eventSource = new EventSource(`/api/migration/progress/stream?sessionId=${sessionId}`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'initial' || data.type === 'progress') {
          setMigrationProgress(data.progress);
        } else if (data.type === 'completed') {
          setMigrationProgress(data.progress);
          setIsMigrating(false);
          eventSource.close();
          fetchMigrationStats(); // Refresh stats
        } else if (data.type === 'error') {
          setIsMigrating(false);
          eventSource.close();
        }
      } catch (error) {
        console.error('Failed to parse SSE data:', error);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      setIsMigrating(false);
    };

    return () => eventSource.close();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const data = await getTemplates();
      setTemplates(data);
    } catch (error) {
      console.error("Failed to fetch templates", error);
    } finally {
      setLoading(false);
    }
  }

  const handleCheckStorage = async () => {
    setIsCheckingStorage(true);
    try {
      const result = await testStorageHealth();
      setStorageStatus(result);
    } catch (error) {
      setStorageStatus({ status: 'error', message: String(error) });
    } finally {
      setIsCheckingStorage(false);
    }
  };

  const handleSyncCategory = async (category: SyncCategory) => {
    setActiveCategory(category);
    try {
      // Small batches of 50 to avoid timeouts
      const result = await syncFilesByCategory(category, 50);
      if (result.success && result.results) {
        setSyncProgress(prev => ({
          ...prev,
          [category]: {
            success: (prev[category]?.success || 0) + result.results!.success,
            failed: (prev[category]?.failed || 0) + result.results!.failed,
          }
        }));
      }
    } catch (error) {
      console.error(error);
    } finally {
      setActiveCategory(null);
    }
  };

  const categories: {id: SyncCategory, label: string}[] = [
    { id: 'signatures', label: 'Signatures' },
    { id: 'ic_copies', label: 'IC Copies & MyKad' },
    { id: 'bills', label: 'TNB Bills & Meters' },
    { id: 'roof_site_images', label: 'Roof & Site Photos' },
    { id: 'payments', label: 'Payment Receipts' },
    { id: 'user_profiles', label: 'Profile Pictures' },
  ];

  const handleEditClick = (template: any) => {
    setEditingTemplate({ ...template });
    setIsModalOpen(true);
  };

  const handleAddClick = () => {
    setEditingTemplate({
      template_name: "",
      company_name: "",
      company_address: "",
      company_phone: "",
      company_email: "",
      sst_registration_no: "",
      bank_name: "",
      bank_account_no: "",
      bank_account_name: "",
      terms_and_conditions: "",
      disclaimer: "",
      active: true,
      is_default: false,
      apply_sst: false,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTemplate) return;

    try {
      if (editingTemplate.id) {
        const { id, ...data } = editingTemplate;
        await updateTemplate(id, data);
      } else {
        await createTemplate(editingTemplate);
      }
      setIsModalOpen(false);
      fetchData();
    } catch (error) {
      console.error("Failed to save template", error);
      alert("Failed to save template");
    }
  };

  const handleSetDefault = async (id: number) => {
    try {
      await setDefaultTemplate(id);
      fetchData();
    } catch (error) {
      console.error("Failed to set default", error);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Are you sure you want to delete the template "${name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await deleteTemplate(id);
      fetchData();
    } catch (error) {
      console.error("Failed to delete template", error);
      alert("Failed to delete template. Please try again.");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-secondary-900">Manage Company</h1>
          <p className="text-secondary-600">
            Manage company profiles and invoice templates.
          </p>
        </div>
        
        <button onClick={handleAddClick} className="btn-primary flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Add Template
        </button>
      </div>

      {/* Comprehensive File Migration Section */}
      <div className="card overflow-hidden bg-gradient-to-br from-primary-900 via-primary-800 to-primary-900 text-white shadow-elevation-lg">
        <div className="p-6 border-b border-white/10">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-500/20 rounded-xl backdrop-blur-md border border-green-500/30">
                <Download className="h-6 w-6 text-green-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold">Bubble Decommission: File Migration</h3>
                <p className="text-primary-200 text-sm">Migrate ALL files from Bubble to Railway storage before shutdown</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {migrationStats && (
                <div className="px-4 py-2 bg-white/5 rounded-xl border border-white/10 text-center">
                  <p className="text-[10px] uppercase font-bold text-primary-300 tracking-wider">Files to Migrate</p>
                  <p className="text-2xl font-bold text-white">{migrationStats.totalFiles}</p>
                </div>
              )}

              {!isMigrating && (
                <button
                  onClick={handleStartMigration}
                  disabled={!migrationStats || migrationStats.totalFiles === 0 || isLoadingStats}
                  className="btn-primary bg-green-600 hover:bg-green-500 border-none flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FileDown className="h-4 w-4" />
                  {isLoadingStats ? 'Scanning...' : 'Start Full Migration'}
                </button>
              )}

              <button
                onClick={fetchMigrationStats}
                disabled={isLoadingStats}
                className="btn-secondary bg-white/5 border-white/10 text-white hover:bg-white/10 flex items-center gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${isLoadingStats ? 'animate-spin' : ''}`} />
                Refresh Stats
              </button>
            </div>
          </div>
        </div>

        {/* Migration Progress */}
        {isMigrating && migrationProgress && (
          <div className="p-6 bg-black/20 border-b border-white/5">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Progress Bar */}
              <div className="lg:col-span-2 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-white">Overall Progress</p>
                  <p className="text-sm font-bold text-green-400">
                    {migrationProgress.totalFiles > 0
                      ? Math.round((migrationProgress.completedFiles / migrationProgress.totalFiles) * 100)
                      : 0}%
                  </p>
                </div>
                <div className="h-3 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all duration-300"
                    style={{
                      width: `${migrationProgress.totalFiles > 0
                        ? (migrationProgress.completedFiles / migrationProgress.totalFiles) * 100
                        : 0}%`
                    }}
                  />
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-green-400 font-semibold">
                    ✓ {migrationProgress.completedFiles} migrated
                  </span>
                  <span className={migrationProgress.failedFiles > 0 ? 'text-red-400' : 'text-primary-300'}>
                    ✗ {migrationProgress.failedFiles} failed
                  </span>
                  <span className="text-primary-300">
                    → {migrationProgress.totalFiles - migrationProgress.completedFiles - migrationProgress.failedFiles} remaining
                  </span>
                </div>
              </div>

              {/* Current File */}
              <div className="lg:col-span-2 space-y-2">
                <p className="text-[10px] uppercase font-bold text-primary-300 tracking-wider flex items-center gap-2">
                  <Activity className="h-3 w-3" />
                  Currently Downloading
                </p>
                {migrationProgress.currentFile ? (
                  <>
                    <p className="text-sm font-medium text-white truncate">{migrationProgress.currentFile}</p>
                    {migrationProgress.downloadSpeed && (
                      <div className="flex items-center gap-2 text-xs text-green-400">
                        <Zap className="h-3 w-3" />
                        <span className="font-semibold">{migrationProgress.downloadSpeed}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-primary-300">Initializing...</p>
                )}
              </div>
            </div>

            {/* Recent Details */}
            {migrationProgress.details && migrationProgress.details.length > 0 && (
              <div className="mt-4 pt-4 border-t border-white/5">
                <div className="flex flex-wrap gap-2">
                  {migrationProgress.details.slice(-4).map((detail: string, idx: number) => (
                    <span
                      key={idx}
                      className="text-[10px] px-2 py-1 bg-white/5 rounded border border-white/10 text-primary-200"
                    >
                      {detail}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Breakdown by Table */}
        {migrationStats && (
          <div className="p-6">
            <p className="text-[10px] uppercase font-bold text-primary-300 tracking-wider mb-4 flex items-center gap-2">
              <Database className="h-3 w-3" />
              Files by Table
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {Object.entries(migrationStats.byTable).map(([table, count]: [string, any]) => (
                <div
                  key={table}
                  className="p-3 bg-white/5 rounded-lg border border-white/5 hover:border-green-500/30 transition-all"
                >
                  <p className="text-[10px] uppercase font-bold text-primary-300 truncate">{table}</p>
                  <p className="text-xl font-bold text-white">{count}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Storage & Sync Testing Section */}
      <div className="card overflow-hidden bg-gradient-to-br from-secondary-900 via-secondary-800 to-secondary-900 text-white shadow-elevation-lg">
        <div className="p-6 border-b border-white/10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary-500/20 rounded-xl backdrop-blur-md border border-primary-500/30">
                <HardDrive className="h-6 w-6 text-primary-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold">Bubble File Migration Engine</h3>
                <p className="text-secondary-300 text-sm">Download and host files locally on Railway Storage (/storage)</p>
              </div>
            </div>
            
            <button 
              onClick={handleCheckStorage}
              disabled={isCheckingStorage}
              className="btn-secondary bg-white/5 border-white/10 text-white hover:bg-white/10 flex items-center gap-2"
            >
              {isCheckingStorage ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Verify Storage Health
            </button>
          </div>

          {storageStatus && (
            <div className={`mt-4 p-3 rounded-lg flex items-center gap-3 text-sm ${storageStatus.status === 'healthy' ? 'bg-green-500/20 text-green-300 border border-green-500/30' : 'bg-red-500/20 text-red-300 border border-red-500/30'}`}>
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="font-medium">{storageStatus.status === 'healthy' ? 'System Ready:' : 'Critical Error:'}</span>
              <span>{storageStatus.message}</span>
            </div>
          )}
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map((cat) => (
            <div key={cat.id} className="p-4 rounded-xl bg-white/5 border border-white/5 flex flex-col justify-between group hover:border-primary-500/30 transition-all duration-300">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="font-bold text-secondary-100">{cat.label}</p>
                  <div className="flex gap-3 mt-1">
                    <span className="text-[10px] uppercase font-bold text-green-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                      Done: {syncProgress[cat.id]?.success || 0}
                    </span>
                    <span className="text-[10px] uppercase font-bold text-red-400">
                      Fail: {syncProgress[cat.id]?.failed || 0}
                    </span>
                  </div>
                </div>
                <div className={`p-2 rounded-lg transition-colors ${activeCategory === cat.id ? 'bg-primary-500 animate-spin' : 'bg-white/5 group-hover:bg-primary-500/20'}`}>
                  <RefreshCw className={`h-4 w-4 ${activeCategory === cat.id ? 'text-white' : 'text-secondary-400'}`} />
                </div>
              </div>
              
              <button 
                onClick={() => handleSyncCategory(cat.id)}
                disabled={activeCategory !== null}
                className="btn-primary w-full py-2 text-xs bg-primary-600 hover:bg-primary-500 border-none disabled:opacity-30 disabled:grayscale transition-all"
              >
                {activeCategory === cat.id ? 'Processing Batch...' : `Sync Batch (50)`}
              </button>
            </div>
          ))}
        </div>

        <div className="px-6 py-4 bg-black/20 border-t border-white/5 flex items-center justify-between">
          <p className="text-[10px] text-secondary-400 uppercase font-bold tracking-widest">Resumable Engine: Click again to process next batch</p>
          <div className="flex gap-2">
             <div className="h-1.5 w-24 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-primary-500" style={{ width: `${Math.min(Object.values(syncProgress).reduce((a,b) => a+b.success, 0) / 100, 100)}%` }}></div>
             </div>
          </div>
        </div>
      </div>

      {/* Templates List */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {loading ? (
          Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="card p-6 animate-pulse bg-secondary-50 h-64 shadow-none border-secondary-100"></div>
          ))
        ) : templates.length === 0 ? (
          <div className="col-span-full card p-12 text-center">
             <div className="p-4 bg-secondary-50 rounded-full w-fit mx-auto mb-4">
               <Building2 className="h-8 w-8 text-secondary-300" />
             </div>
             <p className="text-secondary-900 font-bold text-lg">No templates found</p>
             <p className="text-secondary-500 mb-6">Start by creating your first company template.</p>
             <button onClick={handleAddClick} className="btn-primary mx-auto flex items-center gap-2">
               <Plus className="h-4 w-4" />
               Create Template
             </button>
          </div>
        ) : (
          templates.map((tmpl) => (
            <div key={tmpl.id} className={`card overflow-hidden transition-all duration-300 border-2 ${tmpl.is_default ? 'border-primary-500 shadow-elevation-md' : 'border-transparent'}`}>
              <div className="p-6">
                <div className="flex justify-between items-start mb-6">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-primary-50 flex items-center justify-center">
                      <Building2 className="h-6 w-6 text-primary-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-secondary-900">{tmpl.template_name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        {tmpl.is_default && (
                          <span className="px-2 py-0.5 bg-primary-100 text-primary-700 text-[10px] font-bold uppercase rounded-md flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            Default
                          </span>
                        )}
                        <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-md ${tmpl.active ? 'bg-green-100 text-green-700' : 'bg-secondary-100 text-secondary-600'}`}>
                          {tmpl.active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {!tmpl.is_default && (
                      <button 
                        onClick={() => handleSetDefault(tmpl.id)}
                        className="p-2 hover:bg-primary-50 text-primary-600 rounded-lg transition-colors group relative"
                      >
                        <Settings2 className="h-5 w-5" />
                        <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-secondary-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20 pointer-events-none">Set Default</span>
                      </button>
                    )}
                    <button 
                      onClick={() => handleEditClick(tmpl)}
                      className="p-2 hover:bg-secondary-100 text-secondary-600 rounded-lg transition-colors group relative"
                    >
                      <Edit2 className="h-5 w-5" />
                      <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-secondary-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20 pointer-events-none">Edit Template</span>
                    </button>
                    {!tmpl.is_default && (
                      <button 
                        onClick={() => handleDelete(tmpl.id, tmpl.template_name)}
                        className="p-2 hover:bg-red-50 text-red-600 rounded-lg transition-colors group relative"
                      >
                        <Trash2 className="h-5 w-5" />
                        <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-secondary-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20 pointer-events-none">Delete Template</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-6 bg-secondary-50/50 p-4 rounded-xl border border-secondary-100">
                  <div className="flex items-start gap-3">
                    <div className="mt-1"><Building2 className="h-3.5 w-3.5 text-secondary-400" /></div>
                    <div>
                      <p className="text-[10px] uppercase font-bold text-secondary-400 tracking-wider">Entity Name</p>
                      <p className="text-sm font-medium text-secondary-700">{tmpl.company_name}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="mt-1"><Mail className="h-3.5 w-3.5 text-secondary-400" /></div>
                    <div>
                      <p className="text-[10px] uppercase font-bold text-secondary-400 tracking-wider">Email</p>
                      <p className="text-sm font-medium text-secondary-700">{tmpl.company_email || "N/A"}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="mt-1"><Phone className="h-3.5 w-3.5 text-secondary-400" /></div>
                    <div>
                      <p className="text-[10px] uppercase font-bold text-secondary-400 tracking-wider">Phone</p>
                      <p className="text-sm font-medium text-secondary-700">{tmpl.company_phone || "N/A"}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="mt-1"><CreditCard className="h-3.5 w-3.5 text-secondary-400" /></div>
                    <div>
                      <p className="text-[10px] uppercase font-bold text-secondary-400 tracking-wider">Bank Info</p>
                      <p className="text-sm font-medium text-secondary-700">{tmpl.bank_name || "N/A"}</p>
                    </div>
                  </div>
                  <div className="md:col-span-2 flex items-start gap-3 border-t border-secondary-100 pt-3 mt-1">
                    <div className="mt-1"><MapPin className="h-3.5 w-3.5 text-secondary-400" /></div>
                    <div>
                      <p className="text-[10px] uppercase font-bold text-secondary-400 tracking-wider">Address</p>
                      <p className="text-sm font-medium text-secondary-700 line-clamp-2">{tmpl.company_address || "No address provided"}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Edit/Add Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-secondary-900/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-elevation-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col animate-scale-in">
            <div className="p-6 border-b border-secondary-200 flex items-center justify-between bg-white z-10">
              <div>
                <h2 className="text-xl font-bold text-secondary-900">
                  {editingTemplate?.id ? "Edit Template" : "Add New Template"}
                </h2>
                <p className="text-sm text-secondary-500 mt-0.5">
                  Configure company details and invoice defaults.
                </p>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-2 hover:bg-secondary-100 rounded-full transition-colors"
              >
                <Plus className="h-6 w-6 rotate-45 text-secondary-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              <form id="template-form" onSubmit={handleSubmit} className="p-8 space-y-10">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                  {/* Section: Basic Info */}
                  <div className="space-y-6">
                    <h3 className="text-sm font-bold text-primary-600 uppercase tracking-wider flex items-center gap-2 border-b border-primary-100 pb-2">
                      <Building2 className="h-4 w-4" />
                      Company Identity
                    </h3>
                    
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-secondary-700 uppercase tracking-wide">Internal Name</label>
                        <input
                          type="text"
                          required
                          className="input"
                          placeholder="e.g. Main HQ Template"
                          value={editingTemplate?.template_name || ""}
                          onChange={(e) => setEditingTemplate({ ...editingTemplate, template_name: e.target.value })}
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-secondary-700 uppercase tracking-wide">Formal Company Name</label>
                        <input
                          type="text"
                          required
                          className="input"
                          placeholder="e.g. ETERNALGY SDN BHD"
                          value={editingTemplate?.company_name || ""}
                          onChange={(e) => setEditingTemplate({ ...editingTemplate, company_name: e.target.value })}
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-bold text-secondary-700 uppercase tracking-wide">Company Address</label>
                        <textarea
                          className="input min-h-[120px] py-3 text-sm"
                          placeholder="Full registered address..."
                          value={editingTemplate?.company_address || ""}
                          onChange={(e) => setEditingTemplate({ ...editingTemplate, company_address: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Section: Contact & Tax */}
                  <div className="space-y-6">
                    <h3 className="text-sm font-bold text-primary-600 uppercase tracking-wider flex items-center gap-2 border-b border-primary-100 pb-2">
                      <Globe className="h-4 w-4" />
                      Contact & Registration
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2 md:col-span-2">
                        <label className="text-xs font-bold text-secondary-700 uppercase tracking-wide">Email Address</label>
                        <input
                          type="email"
                          className="input"
                          value={editingTemplate?.company_email || ""}
                          onChange={(e) => setEditingTemplate({ ...editingTemplate, company_email: e.target.value })}
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-secondary-700 uppercase tracking-wide">Phone Number</label>
                        <input
                          type="text"
                          className="input"
                          value={editingTemplate?.company_phone || ""}
                          onChange={(e) => setEditingTemplate({ ...editingTemplate, company_phone: e.target.value })}
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-bold text-secondary-700 uppercase tracking-wide">SST No.</label>
                        <input
                          type="text"
                          className="input"
                          value={editingTemplate?.sst_registration_no || ""}
                          onChange={(e) => setEditingTemplate({ ...editingTemplate, sst_registration_no: e.target.value })}
                        />
                      </div>

                      <div className="md:col-span-2 p-4 bg-secondary-50 rounded-xl border border-secondary-200 flex flex-wrap items-center gap-6 mt-2">
                         <label className="flex items-center gap-3 cursor-pointer group">
                           <div className="relative flex items-center">
                             <input 
                               type="checkbox" 
                               className="peer h-5 w-5 cursor-pointer appearance-none rounded border border-secondary-300 bg-white checked:bg-primary-600 checked:border-primary-600 focus:ring-2 focus:ring-primary-500 transition-all"
                               checked={editingTemplate?.apply_sst || false}
                               onChange={(e) => setEditingTemplate({ ...editingTemplate, apply_sst: e.target.checked })}
                             />
                             <CheckCircle2 className="absolute h-3.5 w-3.5 text-white opacity-0 peer-checked:opacity-100 left-0.5 pointer-events-none transition-opacity" />
                           </div>
                           <span className="text-sm font-semibold text-secondary-700 group-hover:text-secondary-900">Apply SST</span>
                         </label>
                         
                         <label className="flex items-center gap-3 cursor-pointer group">
                           <div className="relative flex items-center">
                             <input 
                               type="checkbox" 
                               className="peer h-5 w-5 cursor-pointer appearance-none rounded border border-secondary-300 bg-white checked:bg-green-600 checked:border-green-600 focus:ring-2 focus:ring-green-500 transition-all"
                               checked={editingTemplate?.active || false}
                               onChange={(e) => setEditingTemplate({ ...editingTemplate, active: e.target.checked })}
                             />
                             <CheckCircle2 className="absolute h-3.5 w-3.5 text-white opacity-0 peer-checked:opacity-100 left-0.5 pointer-events-none transition-opacity" />
                           </div>
                           <span className="text-sm font-semibold text-secondary-700 group-hover:text-secondary-900">Active Status</span>
                         </label>
                      </div>
                    </div>
                  </div>

                  {/* Section: Banking */}
                  <div className="space-y-6">
                    <h3 className="text-sm font-bold text-primary-600 uppercase tracking-wider flex items-center gap-2 border-b border-primary-100 pb-2">
                      <CreditCard className="h-4 w-4" />
                      Banking Details
                    </h3>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-secondary-700 uppercase tracking-wide">Bank Name</label>
                        <input
                          type="text"
                          className="input"
                          placeholder="e.g. MAYBANK"
                          value={editingTemplate?.bank_name || ""}
                          onChange={(e) => setEditingTemplate({ ...editingTemplate, bank_name: e.target.value })}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-secondary-700 uppercase tracking-wide">Account No.</label>
                          <input
                            type="text"
                            className="input"
                            value={editingTemplate?.bank_account_no || ""}
                            onChange={(e) => setEditingTemplate({ ...editingTemplate, bank_account_no: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-secondary-700 uppercase tracking-wide">Holder Name</label>
                          <input
                            type="text"
                            className="input"
                            value={editingTemplate?.bank_account_name || ""}
                            onChange={(e) => setEditingTemplate({ ...editingTemplate, bank_account_name: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Section: Logo & Layout */}
                  <div className="space-y-6">
                     <h3 className="text-sm font-bold text-primary-600 uppercase tracking-wider flex items-center gap-2 border-b border-primary-100 pb-2">
                      <FileText className="h-4 w-4" />
                      Document Extras
                    </h3>
                    
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-secondary-700 uppercase tracking-wide">Logo URL</label>
                        <input
                          type="text"
                          className="input"
                          placeholder="https://..."
                          value={editingTemplate?.logo_url || ""}
                          onChange={(e) => setEditingTemplate({ ...editingTemplate, logo_url: e.target.value })}
                        />
                      </div>

                      <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-700 leading-relaxed">
                          Enter your terms and conditions as HTML or plain text below. This content will be rendered at the bottom of generated PDFs.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Section: T&C - Full Width */}
                  <div className="lg:col-span-2 space-y-4">
                    <label className="text-xs font-bold text-secondary-700 uppercase tracking-wide">Terms & Conditions (HTML/Text)</label>
                    <textarea
                      className="input min-h-[400px] font-mono text-xs py-4 bg-secondary-50"
                      placeholder="Paste your legal terms here..."
                      value={editingTemplate?.terms_and_conditions || ""}
                      onChange={(e) => setEditingTemplate({ ...editingTemplate, terms_and_conditions: e.target.value })}
                    />
                  </div>

                  <div className="lg:col-span-2 space-y-4 pb-10">
                    <label className="text-xs font-bold text-secondary-700 uppercase tracking-wide">Footer Disclaimer</label>
                    <textarea
                      className="input min-h-[100px] py-3 text-sm"
                      placeholder="Small note at the bottom of the page..."
                      value={editingTemplate?.disclaimer || ""}
                      onChange={(e) => setEditingTemplate({ ...editingTemplate, disclaimer: e.target.value })}
                    />
                  </div>
                </div>
              </form>
            </div>

            <div className="p-6 border-t border-secondary-200 flex items-center justify-end gap-3 bg-white z-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
              <button 
                type="button" 
                onClick={() => setIsModalOpen(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                form="template-form"
                className="btn-primary px-8"
              >
                Save Template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
