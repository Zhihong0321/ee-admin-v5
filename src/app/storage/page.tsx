"use client";

import { useState, useEffect, useMemo } from "react";
import { 
  File, 
  FileText, 
  Image as ImageIcon, 
  Search, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  ExternalLink, 
  Zap, 
  RefreshCw,
  Loader2,
  HardDrive,
  Eye,
  ChevronLeft
} from "lucide-react";
import Link from "next/link";
import { listAllFiles, shrinkImage, StorageFile } from "../manage-company/storage-actions";

export default function StorageManagerPage() {
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<keyof StorageFile>("size");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [processingFiles, setProcessingFiles] = useState<Set<string>>(new Set());
  const [previewFile, setPreviewFile] = useState<StorageFile | null>(null);

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    setIsRefreshing(true);
    try {
      const data = await listAllFiles();
      setFiles(data);
    } catch (error) {
      console.error("Failed to fetch files", error);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleSort = (field: keyof StorageFile) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const filteredAndSortedFiles = useMemo(() => {
    return files
      .filter(f => f.name.toLowerCase().includes(search.toLowerCase()) || f.path.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];
        
        if (typeof valA === 'string' && typeof valB === 'string') {
          return sortOrder === "asc" 
            ? valA.localeCompare(valB) 
            : valB.localeCompare(valA);
        }
        
        // @ts-ignore - for dates and numbers
        return sortOrder === "asc" ? valA - valB : valB - valA;
      });
  }, [files, search, sortField, sortOrder]);

  const handleShrink = async (file: StorageFile) => {
    if (!confirm(`Are you sure you want to shrink "${file.name}"? This will overwrite the original file with a compressed version.`)) {
      return;
    }

    setProcessingFiles(prev => new Set(prev).add(file.fullPath));
    try {
      const res = await shrinkImage(file.fullPath, 70); // 70% quality
      if (res.success) {
        alert(`Successfully shrunk file!

Old Size: ${res.oldSize}
New Size: ${res.newSize}
Saved: ${res.saved}`);
        fetchFiles(); // Refresh list
      } else {
        alert(res.message || res.error || "Failed to shrink file");
      }
    } catch (error) {
      console.error(error);
      alert("An error occurred during processing");
    } finally {
      setProcessingFiles(prev => {
        const next = new Set(prev);
        next.delete(file.fullPath);
        return next;
      });
    }
  };

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'image': return <ImageIcon className="h-4 w-4 text-primary-500" />;
      case 'pdf': return <FileText className="h-4 w-4 text-red-500" />;
      default: return <File className="h-4 w-4 text-secondary-400" />;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link href="/manage-company" className="text-secondary-400 hover:text-primary-600 transition-colors">
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-3xl font-bold text-secondary-900 flex items-center gap-3">
              <HardDrive className="h-8 w-8 text-primary-600" />
              Storage Manager
            </h1>
          </div>
          <p className="text-secondary-600">
            Manage files stored in local storage. Optimize large images to save space.
          </p>
        </div>
        
        <button 
          onClick={fetchFiles} 
          disabled={isRefreshing}
          className="btn-secondary flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh List
        </button>
      </div>

      {/* Stats Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-4 bg-primary-50 border-primary-100 flex items-center gap-4">
          <div className="p-3 bg-white rounded-xl text-primary-600 shadow-sm">
            <File className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-primary-700 uppercase tracking-wider">Total Files</p>
            <p className="text-2xl font-bold text-primary-900">{files.length}</p>
          </div>
        </div>
        
        <div className="card p-4 bg-green-50 border-green-100 flex items-center gap-4">
          <div className="p-3 bg-white rounded-xl text-green-600 shadow-sm">
            <HardDrive className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-green-700 uppercase tracking-wider">Total Size</p>
            <p className="text-2xl font-bold text-green-900">
              {files.length > 0 ? (files.reduce((acc, f) => acc + f.size, 0) / (1024 * 1024)).toFixed(2) + ' MB' : '0 MB'}
            </p>
          </div>
        </div>

        <div className="card p-4 bg-amber-50 border-amber-100 flex items-center gap-4">
          <div className="p-3 bg-white rounded-xl text-amber-600 shadow-sm">
            <Zap className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-amber-700 uppercase tracking-wider">Large Files (&gt;1MB)</p>
            <p className="text-2xl font-bold text-amber-900">{files.filter(f => f.size > 1024 * 1024).length}</p>
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="card p-4 flex flex-col md:flex-row items-center gap-4">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary-400" />
          <input
            type="text"
            placeholder="Search files by name or path..."
            className="input pl-10 w-full"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="text-sm text-secondary-500 font-medium px-2">
          Showing {filteredAndSortedFiles.length} of {files.length} files
        </div>
      </div>

      {/* Files Table */}
      <div className="card overflow-hidden border-secondary-200">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-secondary-50 border-b border-secondary-200">
                <th className="px-6 py-4 font-bold text-secondary-700 uppercase tracking-wider cursor-pointer hover:bg-secondary-100 transition-colors" onClick={() => handleSort('name')}>
                  <div className="flex items-center gap-2">
                    Name {sortField === 'name' ? (sortOrder === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                  </div>
                </th>
                <th className="px-6 py-4 font-bold text-secondary-700 uppercase tracking-wider">Type</th>
                <th className="px-6 py-4 font-bold text-secondary-700 uppercase tracking-wider cursor-pointer hover:bg-secondary-100 transition-colors text-right" onClick={() => handleSort('size')}>
                  <div className="flex items-center justify-end gap-2">
                    Size {sortField === 'size' ? (sortOrder === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                  </div>
                </th>
                <th className="px-6 py-4 font-bold text-secondary-700 uppercase tracking-wider cursor-pointer hover:bg-secondary-100 transition-colors" onClick={() => handleSort('mtime')}>
                  <div className="flex items-center gap-2">
                    Modified {sortField === 'mtime' ? (sortOrder === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                  </div>
                </th>
                <th className="px-6 py-4 font-bold text-secondary-700 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-secondary-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={5} className="px-6 py-6"><div className="h-4 bg-secondary-100 rounded w-full"></div></td>
                  </tr>
                ))
              ) : filteredAndSortedFiles.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-secondary-500 italic">
                    No files found matching your criteria.
                  </td>
                </tr>
              ) : (
                filteredAndSortedFiles.map((file) => (
                  <tr key={file.fullPath} className="hover:bg-secondary-50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-semibold text-secondary-900 group-hover:text-primary-600 transition-colors truncate max-w-md" title={file.name}>
                          {file.name}
                        </span>
                        <span className="text-[10px] text-secondary-400 font-mono truncate max-w-md" title={file.path}>
                          /{file.path}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {getFileIcon(file.type)}
                        <span className="text-xs text-secondary-600 capitalize">{file.type}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className={`font-mono text-xs font-bold ${file.size > 1024 * 1024 ? 'text-amber-600' : 'text-secondary-600'}`}>
                        {file.sizeFormatted}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-secondary-500">
                      {new Date(file.mtime).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => setPreviewFile(file)}
                          className="p-1.5 hover:bg-primary-50 text-primary-600 rounded-lg transition-colors"
                          title="Preview"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <a 
                          href={`/api/files/${file.path}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="p-1.5 hover:bg-secondary-200 text-secondary-600 rounded-lg transition-colors"
                          title="Open in new tab"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                        {file.type === 'image' && (
                          <button 
                            onClick={() => handleShrink(file)}
                            disabled={processingFiles.has(file.fullPath)}
                            className="p-1.5 hover:bg-green-50 text-green-600 rounded-lg transition-colors disabled:opacity-50"
                            title="Shrink Image"
                          >
                            {processingFiles.has(file.fullPath) ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Zap className="h-4 w-4" />
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-secondary-900/80 backdrop-blur-sm animate-fade-in" onClick={() => setPreviewFile(null)}>
          <div className="bg-white rounded-2xl shadow-elevation-xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-secondary-200 flex items-center justify-between">
              <h3 className="font-bold text-secondary-900 truncate pr-4">{previewFile.name}</h3>
              <button onClick={() => setPreviewFile(null)} className="p-1 hover:bg-secondary-100 rounded-full">
                <RefreshCw className="h-5 w-5 rotate-45 text-secondary-500" />
              </button>
            </div>
            <div className="flex-1 bg-secondary-50 overflow-auto flex items-center justify-center p-4">
              {previewFile.type === 'image' ? (
                <img 
                  src={`/api/files/${previewFile.path}`} 
                  alt={previewFile.name} 
                  className="max-w-full h-auto shadow-elevation-lg rounded"
                />
              ) : previewFile.type === 'pdf' ? (
                <iframe 
                  src={`/api/files/${previewFile.path}`} 
                  className="w-full h-[600px] border-none"
                />
              ) : (
                <div className="text-secondary-400 flex flex-col items-center gap-4">
                  <File className="h-16 w-16" />
                  <p>Preview not available for this file type.</p>
                  <a 
                    href={`/api/files/${previewFile.path}`} 
                    download 
                    className="btn-primary"
                  >
                    Download to View
                  </a>
                </div>
              )}
            </div>
            <div className="p-4 bg-secondary-50 border-t border-secondary-200 flex items-center justify-between text-xs font-mono text-secondary-500">
              <span>Size: {previewFile.sizeFormatted}</span>
              <span>Path: /{previewFile.path}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
