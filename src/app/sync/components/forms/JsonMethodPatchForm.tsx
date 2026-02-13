
import { useState } from "react";
import { Upload, RefreshCw, Loader2, XCircle, CheckCircle2, FileJson, Zap } from "lucide-react";

interface JsonMethodPatchFormProps {
  onPatch: (jsonData: any[]) => Promise<any>;
}

export function JsonMethodPatchForm({ onPatch }: JsonMethodPatchFormProps) {
  const [isPatching, setIsPatching] = useState(false);
  const [jsonData, setJsonData] = useState<any[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [results, setResults] = useState<any>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setParseError(null);
    setResults(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);

        if (!Array.isArray(parsed)) {
          throw new Error('JSON must be an array of records');
        }

        setJsonData(parsed);
      } catch (err) {
        setParseError(err instanceof Error ? err.message : 'Failed to parse JSON');
        setJsonData(null);
      }
    };
    reader.readAsText(file);
  };

  const handlePatch = async () => {
    if (!jsonData || jsonData.length === 0) return;
    
    if (!confirm(`Patch payment methods for ${jsonData.length} records?

This will ONLY fill in the "payment_method" field if it is currently empty. No other data will be changed.`)) {
      return;
    }

    setIsPatching(true);
    setResults(null);

    try {
      const res = await onPatch(jsonData);
      setResults(res);
    } catch (error) {
      setResults({ success: false, error: String(error) });
    } finally {
      setIsPatching(false);
    }
  };

  return (
    <section className="bg-white rounded-lg shadow-sm border border-secondary-200 p-6">
      <h2 className="text-xl font-semibold text-secondary-900 mb-4 flex items-center gap-2">
        <Zap className="h-5 w-5 text-amber-500" />
        Patch Payment Methods from JSON
      </h2>
      <p className="text-sm text-secondary-500 mb-6">
        Upload a Payment export JSON to fill in missing payment methods without overwriting other data.
      </p>

      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <label className="btn-secondary flex items-center gap-2 cursor-pointer">
            <Upload className="h-4 w-4" />
            Upload Payment JSON
            <input
              type="file"
              accept=".json"
              onChange={handleFileUpload}
              disabled={isPatching}
              className="hidden"
            />
          </label>
          
          {fileName && (
            <span className="text-sm text-secondary-600 truncate max-w-xs">
              {fileName}
            </span>
          )}

          {jsonData && !isPatching && (
            <button
              onClick={handlePatch}
              className="btn-primary bg-amber-600 hover:bg-amber-700 border-none flex items-center gap-2 ml-auto"
            >
              <RefreshCw className="h-4 w-4" />
              Patch {jsonData.length} Methods
            </button>
          )}
          
          {isPatching && (
            <div className="flex items-center gap-2 text-amber-600 font-medium ml-auto">
              <Loader2 className="h-4 w-4 animate-spin" />
              Patching...
            </div>
          )}
        </div>

        {parseError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
            <XCircle className="h-4 w-4" />
            {parseError}
          </div>
        )}

        {results && (
          <div className={`p-4 rounded-lg border ${
            results.success 
              ? 'bg-green-50 border-green-200 text-green-800' 
              : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            <div className="flex items-center gap-2 mb-2 font-bold">
              {results.success ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
              {results.success ? 'Patch Complete' : 'Patch Failed'}
            </div>
            {results.success ? (
              <div className="grid grid-cols-3 gap-4 text-center mt-3">
                <div className="bg-white p-2 rounded shadow-sm">
                  <p className="text-2xl font-bold">{results.patchedCount}</p>
                  <p className="text-[10px] uppercase font-bold text-secondary-500">Patched</p>
                </div>
                <div className="bg-white p-2 rounded shadow-sm">
                  <p className="text-2xl font-bold">{results.skippedCount}</p>
                  <p className="text-[10px] uppercase font-bold text-secondary-500">Skipped</p>
                </div>
                <div className="bg-white p-2 rounded shadow-sm">
                  <p className="text-2xl font-bold">{results.notFoundCount}</p>
                  <p className="text-[10px] uppercase font-bold text-secondary-500">Not Found</p>
                </div>
              </div>
            ) : (
              <p className="text-sm font-mono">{results.error}</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
