'use client';

import React, { useState, useRef } from 'react';
import Papa from 'papaparse';
import { motion, AnimatePresence } from 'framer-motion';
import { usePipelineStore, useProjectStore, useAuthStore } from '@/lib/stores';
import { GCPMarker } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Upload, X, AlertCircle, CheckCircle2, ChevronRight, Download, ArrowRight, Loader2 } from 'lucide-react';

const CRS_OPTIONS = [
  { value: 'EPSG:4326',  label: 'WGS84 — Decimal Degrees (EPSG:4326)' },
  { value: 'EPSG:32736', label: 'UTM Zone 36S (EPSG:32736)' },
  { value: 'EPSG:32735', label: 'UTM Zone 35S (EPSG:32735)' },
  { value: 'EPSG:2046',  label: 'Lo33 South Africa (EPSG:2046)' },
  { value: 'custom',     label: 'Custom EPSG code...' },
];

const AUTO_DETECT_PATTERNS: Record<string, string[]> = {
  pointName:  ['name', 'id', 'point', 'gcp', 'label', 'marker', 'point_id', 'point_name', 'gcp_id', 'station'],
  longitude:  ['longitude', 'long', 'lon', 'lng', 'x', 'easting', 'east'],
  latitude:   ['latitude', 'lat', 'y', 'northing', 'north'],
  elevation:  ['elevation', 'elev', 'height', 'alt', 'altitude', 'z', 'h', 'ellh'],
  accuracyH:  ['h_accuracy', 'hacc', 'accuracy_h', 'horizontal_accuracy', 'acc_h', 'sigma_h'],
  accuracyV:  ['v_accuracy', 'vacc', 'accuracy_v', 'vertical_accuracy', 'acc_v', 'sigma_v'],
  description:['description', 'desc', 'note', 'notes', 'comment', 'remarks'],
};

interface ParsedGCP {
  id: string;
  name: string;
  longitude: number;
  latitude: number;
  elevation: number;
  accuracyH?: number;
  accuracyV?: number;
  description?: string;
  rowIndex: number;
  valid: boolean;
  errors: string[];
}

export function GCPImportWizard() {
  const { gcpImportMeta, gcps, setGCPs, addLog } = usePipelineStore();
  const { activeProject } = useProjectStore();
  const { token } = useAuthStore();
  
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [crs, setCrs] = useState<string>('EPSG:4326');
  const [customCrs, setCustomCrs] = useState<string>('');
  
  const [parsedData, setParsedData] = useState<ParsedGCP[]>([]);
  const [showErrorsOnly, setShowErrorsOnly] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const autoDetect = (headers: string[], patterns: string[]): string | null => {
    for (const header of headers) {
      if (patterns.some(p => header.toLowerCase().includes(p))) return header;
    }
    return null;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
      addLog({ level: 'error', message: 'Only CSV files are supported', source: 'intake' });
      return;
    }

    setFile(selectedFile);
    parseCSV(selectedFile);
  };

  const parseCSV = (fileToParse: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
        transformHeader: (h) => h.trim(),
        complete: (result) => {
          setHeaders(result.meta.fields || []);
          setRows(result.data as Record<string, string>[]);
          
          if (result.errors && result.errors.length > 0) {
            setErrors(result.errors.map(err => `Row ${err.row}: ${err.message}`));
          } else {
            setErrors([]);
          }

          // Auto-detect mappings
          const initialMapping: Record<string, string> = {};
          const fields = Object.keys(AUTO_DETECT_PATTERNS);
          fields.forEach(field => {
            const detected = autoDetect(result.meta.fields || [], AUTO_DETECT_PATTERNS[field]);
            if (detected) initialMapping[field] = detected;
          });
          setMapping(initialMapping);
          setStep(2);
        }
      });
    };
    reader.readAsText(fileToParse);
  };

  const handleReset = () => {
    setStep(1);
    setFile(null);
    setHeaders([]);
    setRows([]);
    setErrors([]);
    setMapping({});
    setParsedData([]);
  };

  const requiredFields = ['pointName', 'longitude', 'latitude', 'elevation'];
  const mappedCount = requiredFields.filter(f => mapping[f]).length;
  
  const handleValidate = () => {
    if (mappedCount < 4) {
      addLog({ level: 'error', message: 'Please map all required fields', source: 'intake' });
      return;
    }

    const nameCount: Record<string, number> = {};
    const parsed: ParsedGCP[] = rows.map((row, index) => {
      const errs: string[] = [];
      
      const name = row[mapping.pointName]?.trim();
      if (!name) errs.push('Point name is empty');
      else {
        nameCount[name] = (nameCount[name] || 0) + 1;
      }

      const lonRaw = parseFloat(row[mapping.longitude]);
      if (isNaN(lonRaw)) errs.push(`Longitude '${row[mapping.longitude]}' is not a valid number`);
      else if (lonRaw < -180 || lonRaw > 180) errs.push(`Longitude ${lonRaw} is out of range (-180 to 180)`);

      const latRaw = parseFloat(row[mapping.latitude]);
      if (isNaN(latRaw)) errs.push(`Latitude '${row[mapping.latitude]}' is not a valid number`);
      else if (latRaw < -90 || latRaw > 90) errs.push(`Latitude ${latRaw} is out of range (-90 to 90)`);

      const elevRaw = parseFloat(row[mapping.elevation]);
      if (isNaN(elevRaw)) errs.push(`Elevation '${row[mapping.elevation]}' is not a valid number`);

      return {
        id: crypto.randomUUID(),
        name: name ?? `GCP_${index + 1}`,
        longitude: lonRaw,
        latitude: latRaw,
        elevation: elevRaw,
        accuracyH: mapping.accuracyH ? parseFloat(row[mapping.accuracyH]) || undefined : undefined,
        accuracyV: mapping.accuracyV ? parseFloat(row[mapping.accuracyV]) || undefined : undefined,
        description: mapping.description ? row[mapping.description]?.trim() : undefined,
        rowIndex: index,
        valid: errs.length === 0,
        errors: errs,
      };
    });

    // Check for duplicate names (warnings)
    parsed.forEach(p => {
      if (p.name && nameCount[p.name] > 1) {
        // We do not set valid to false for duplicate names, just add warning
        p.errors.push(`Duplicate name '${p.name}'`);
      }
    });

    setParsedData(parsed);
    setStep(3);
  };

  const handleImport = async (validOnly: boolean) => {
    console.group('[gcp-import-flow]');
    console.log('Step 1 — Checking auth...');
    setIsImporting(true);
    setImportError(null);

    try {
      const { token, isAuthenticated } = useAuthStore.getState();
      console.log('  Authenticated:', isAuthenticated);
      console.log('  Token exists:', !!token);
      
      const { activeProject } = useProjectStore.getState();
      console.log('Step 2 — Checking project...');
      console.log('  Project ID:', activeProject?.id);
      console.log('  Project name:', activeProject?.name);

      const url = `/api/projects/${activeProject?.id}/gcps/import`;
      console.log('Step 3 — URL construction...');
      console.log('  URL:', url);
      
      console.log('Step 4 — Sending request...');
      console.time('import-request');

      const toImport = parsedData.filter(p => validOnly ? p.valid : true);
      const gcpList: GCPMarker[] = toImport.map(p => ({
        id: p.id,
        name: p.name,
        longitude: p.longitude,
        latitude: p.latitude,
        elevation: p.elevation,
        accuracyH: p.accuracyH,
        accuracyV: p.accuracyV,
        description: p.description,
        isVerified: false,
      }));

      const finalCrs = crs === 'custom' ? customCrs : crs;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          gcps: gcpList,
          crs: finalCrs,
          sourceFile: file?.name || 'unknown.csv',
          importedAt: Date.now(),
          totalRows: parsedData.length,
          skippedRows: parsedData.length - gcpList.length,
        }),
      });

      console.timeEnd('import-request');
      console.log('Step 5 — Response received...');
      console.log('  Status:', response.status);
      console.log('  OK:', response.ok);

      if (!response.ok) {
        let errorData: any;
        try {
          errorData = await response.json();
        } catch {
          errorData = { error: `Status ${response.status}` };
        }
        console.error('  Error:', errorData);
        throw new Error(errorData.error?.message || errorData.error || `Status ${response.status}`);
      }

      const data = await response.json();
      console.log('Step 6 — Success!');
      console.log('  Imported:', data.data.imported);
      console.log('  GCPs:', data.data.gcps);
      
      setGCPs(gcpList, data.data.meta || null);
      addLog({ level: 'success', message: `${gcpList.length} GCPs imported successfully`, source: 'intake' });
      setStep(4);
      
    } catch (err: any) {
      console.error('Step X — Failed!');
      console.error('  Error:', err.message);
      setImportError(err.message || 'Import failed');
      addLog({ level: 'error', message: `GCP import failed: ${err.message}`, source: 'intake' });
    } finally {
      setIsImporting(false);
      console.groupEnd();
    }
  };

  const renderStepIndicator = () => (
    <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2 text-[11px] font-mono whitespace-nowrap">
      {[
        { num: 1, label: 'Upload' },
        { num: 2, label: 'Map Fields' },
        { num: 3, label: 'Preview & Validate' },
        { num: 4, label: 'Confirm' }
      ].map((s, i) => (
        <React.Fragment key={s.num}>
          <div className={cn(
            'flex items-center gap-1.5 px-2 py-1 rounded',
            step === s.num ? 'bg-[#00D4FF]/20 text-[#00D4FF]' : 
            step > s.num ? 'text-[#10B981]' : 'text-[#8B949E]'
          )}>
            {step > s.num ? <CheckCircle2 className="w-3.5 h-3.5" /> : <span>①②③④[s.num-1]</span>}
            {s.label}
          </div>
          {i < 3 && <ArrowRight className="w-3.5 h-3.5 text-[#8B949E]" />}
        </React.Fragment>
      ))}
    </div>
  );

  if (gcpImportMeta && step === 1) {
    return (
      <div className="p-4 rounded-lg bg-[#161B22] border border-[rgba(255,255,255,0.06)]">
        <h3 className="text-[13px] font-medium text-[#E6EDF3] mb-3">GCP Import</h3>
        <div className="flex items-center justify-between p-3 rounded bg-[#21262D] border border-[#00D4FF]/20">
          <div>
            <p className="text-[12px] text-[#E6EDF3]">{gcpImportMeta.totalImported} GCPs loaded from previous import</p>
            <p className="text-[11px] text-[#8B949E]">{gcpImportMeta.sourceFile} • {gcpImportMeta.crs}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setStep(1)} className="text-[11px] h-7">
            Re-import
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-lg bg-[#161B22] border border-[rgba(255,255,255,0.06)] flex flex-col gap-4">
      <h3 className="text-[13px] font-medium text-[#E6EDF3]">GCP Import</h3>
      {renderStepIndicator()}

      {step === 1 && (
        <div className="relative border-2 border-dashed border-[rgba(255,255,255,0.1)] hover:border-[#00D4FF]/50 rounded-lg p-8 flex flex-col items-center justify-center text-center transition-colors">
          <input
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            ref={fileInputRef}
          />
          <Upload className="w-8 h-8 text-[#8B949E] mb-3" />
          <p className="text-[13px] text-[#E6EDF3] mb-1">Drop your GCP CSV file here, or click to browse</p>
          <p className="text-[11px] text-[#8B949E]">Only .csv files are supported</p>
        </div>
      )}

      {step === 2 && file && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex items-center justify-between p-2 rounded bg-[#21262D]">
            <span className="text-[12px] text-[#E6EDF3]">{file.name} • {(file.size/1024).toFixed(1)} KB</span>
            <Button variant="ghost" size="sm" onClick={handleReset} className="h-6 w-6 p-0 text-[#8B949E] hover:text-white">
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="space-y-3">
            <h4 className="text-[12px] font-medium text-[#E6EDF3]">Map Fields</h4>
            <div className="grid grid-cols-[1fr_2fr] gap-2 text-[11px] font-mono text-[#8B949E] mb-1">
              <span>Required Fields</span>
              <span>CSV Column</span>
            </div>
            
            {/* Required Fields */}
            {[
              { id: 'pointName', label: 'Point Name / ID', desc: 'Unique identifier' },
              { id: 'longitude', label: 'Longitude', desc: 'X coordinate' },
              { id: 'latitude', label: 'Latitude', desc: 'Y coordinate' },
              { id: 'elevation', label: 'Elevation', desc: 'Height (m)' },
            ].map(f => (
              <div key={f.id} className="grid grid-cols-[1fr_2fr] gap-2 items-center">
                <div>
                  <span className="text-[12px] text-[#E6EDF3]">{f.label} <span className="text-red-500">*</span></span>
                </div>
                <div className="flex items-center gap-2">
                  <select 
                    className="flex-1 h-8 rounded bg-[#0E1117] border border-[rgba(255,255,255,0.06)] text-[12px] text-[#E6EDF3] px-2"
                    value={mapping[f.id] || ''}
                    onChange={(e) => setMapping(m => ({ ...m, [f.id]: e.target.value }))}
                  >
                    <option value="">— Not mapped —</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                  {mapping[f.id] && autoDetect(headers, AUTO_DETECT_PATTERNS[f.id]) === mapping[f.id] && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#00D4FF]/20 text-[#00D4FF]">Auto</span>
                  )}
                </div>
              </div>
            ))}

            <div className="grid grid-cols-[1fr_2fr] gap-2 text-[11px] font-mono text-[#8B949E] mt-4 mb-1">
              <span>Optional Fields</span>
              <span></span>
            </div>
            
            {[
              { id: 'accuracyH', label: 'Accuracy (H)' },
              { id: 'accuracyV', label: 'Accuracy (V)' },
              { id: 'description', label: 'Description' },
            ].map(f => (
              <div key={f.id} className="grid grid-cols-[1fr_2fr] gap-2 items-center">
                <span className="text-[12px] text-[#8B949E]">{f.label}</span>
                <select 
                  className="flex-1 h-8 rounded bg-[#0E1117] border border-[rgba(255,255,255,0.06)] text-[12px] text-[#8B949E] px-2"
                  value={mapping[f.id] || ''}
                  onChange={(e) => setMapping(m => ({ ...m, [f.id]: e.target.value }))}
                >
                  <option value="">— Not mapped —</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-[rgba(255,255,255,0.06)]">
            <h4 className="text-[12px] font-medium text-[#E6EDF3] mb-2">Coordinate System</h4>
            <select 
              className="w-full h-8 rounded bg-[#0E1117] border border-[rgba(255,255,255,0.06)] text-[12px] text-[#E6EDF3] px-2 mb-2"
              value={crs}
              onChange={(e) => setCrs(e.target.value)}
            >
              {CRS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {crs === 'custom' && (
              <Input 
                placeholder="e.g. EPSG:27700" 
                value={customCrs} 
                onChange={(e) => setCustomCrs(e.target.value)}
                className="h-8 text-[12px] bg-[#0E1117] mb-2"
              />
            )}
            {crs !== 'EPSG:4326' && (
              <p className="text-[10px] text-[#F59E0B]">
                Coordinates will be reprojected to WGS84 decimal degrees for map display. Ensure your columns contain easting/northing.
              </p>
            )}
          </div>

          <div className="flex justify-between items-center pt-2">
            <span className="text-[11px] text-[#8B949E]">{mappedCount} of 4 required mapped</span>
            <Button 
              onClick={handleValidate} 
              disabled={mappedCount < 4}
              className="h-8 text-[12px] bg-[#00D4FF] text-[#0E1117] hover:bg-[#00D4FF]/90"
            >
              Preview & Validate
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between">
            <div className="flex gap-3 text-[11px] font-mono">
              <span className="text-[#E6EDF3]">{parsedData.length} rows</span>
              <span className="text-[#10B981]">✓ {parsedData.filter(p => p.valid).length} valid</span>
              <span className="text-[#EF4444]">✗ {parsedData.filter(p => !p.valid).length} errors</span>
              <span className="text-[#F59E0B]">⚠ {parsedData.filter(p => p.errors.some(e => e.includes('Duplicate'))).length} warnings</span>
            </div>
            <label className="flex items-center gap-1.5 text-[11px] text-[#8B949E]">
              <input 
                type="checkbox" 
                checked={showErrorsOnly} 
                onChange={(e) => setShowErrorsOnly(e.target.checked)}
                className="rounded border-[rgba(255,255,255,0.1)] bg-[#0E1117]"
              />
              Show errors only
            </label>
          </div>

          <div className="border border-[rgba(255,255,255,0.06)] rounded overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-[#21262D] text-[#8B949E] font-mono">
                  <tr>
                    <th className="p-2 font-normal">Name</th>
                    <th className="p-2 font-normal">Lon</th>
                    <th className="p-2 font-normal">Lat</th>
                    <th className="p-2 font-normal">Elev</th>
                    <th className="p-2 font-normal text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(255,255,255,0.06)]">
                  {parsedData
                    .filter(p => showErrorsOnly ? (!p.valid || p.errors.length > 0) : true)
                    .slice(0, 10)
                    .map((row, i) => (
                    <tr key={i} className={cn(
                      'hover:bg-[#21262D]/50',
                      !row.valid ? 'bg-[#EF4444]/10' : row.errors.length > 0 ? 'bg-[#F59E0B]/10' : ''
                    )}>
                      <td className="p-2 text-[#E6EDF3]">{row.name}</td>
                      <td className="p-2 font-mono text-[#8B949E]">{row.longitude}</td>
                      <td className="p-2 font-mono text-[#8B949E]">{row.latitude}</td>
                      <td className="p-2 font-mono text-[#8B949E]">{row.elevation}</td>
                      <td className="p-2 text-right">
                        {row.errors.length > 0 ? (
                          <div className="flex justify-end relative group">
                            <AlertCircle className={cn("w-3.5 h-3.5", !row.valid ? "text-[#EF4444]" : "text-[#F59E0B]")} />
                            <div className="absolute right-0 bottom-full mb-1 hidden group-hover:block w-48 p-2 bg-[#161B22] border border-[rgba(255,255,255,0.1)] rounded text-[10px] text-left z-10 shadow-xl">
                              {row.errors.map((e, ei) => <div key={ei}>{e}</div>)}
                            </div>
                          </div>
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981] ml-auto" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(showErrorsOnly ? parsedData.filter(p => !p.valid).length : parsedData.length) > 10 && (
              <div className="p-2 text-center text-[10px] text-[#8B949E] bg-[#21262D]">
                Showing first 10 rows...
              </div>
            )}
          </div>

          {importError && (
            <div className="p-2.5 rounded border-l-2 border-l-[#EF4444] bg-[#EF4444]/10 text-[11px] text-[#EF4444]">
              {importError}
            </div>
          )}

          <div className="flex gap-2 justify-between pt-2 border-t border-[rgba(255,255,255,0.06)]">
            <Button variant="ghost" onClick={() => setStep(2)} className="h-8 text-[12px]">Back</Button>
            
            <div className="flex gap-2">
              {parsedData.filter(p => p.valid).length === 0 ? (
                <span className="text-[12px] text-[#EF4444] py-1">No valid GCPs to import.</span>
              ) : parsedData.some(p => !p.valid) ? (
                <>
                  <Button variant="outline" className="h-8 text-[12px]" onClick={() => setStep(2)}>Cancel</Button>
                  <Button onClick={() => handleImport(true)} disabled={isImporting} className="h-8 text-[12px] bg-[#00D4FF] text-[#0E1117]">
                    {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : `Import ${parsedData.filter(p => p.valid).length} Valid Only`}
                  </Button>
                </>
              ) : parsedData.some(p => p.errors.length > 0) ? (
                <>
                  <Button variant="outline" onClick={() => handleImport(true)} disabled={isImporting} className="h-8 text-[12px]">
                    Import {parsedData.length} Without Warnings
                  </Button>
                  <Button onClick={() => handleImport(false)} disabled={isImporting} className="h-8 text-[12px] bg-[#00D4FF] text-[#0E1117]">
                    {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : `Import All ${parsedData.length} GCPs`}
                  </Button>
                </>
              ) : (
                <Button onClick={() => handleImport(false)} disabled={isImporting} className="h-8 text-[12px] bg-[#00D4FF] text-[#0E1117]">
                  {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : `Import ${parsedData.length} GCPs`}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="text-center p-6 space-y-3 animate-in zoom-in-95">
          <div className="w-12 h-12 bg-[#10B981]/20 rounded-full flex items-center justify-center mx-auto mb-2">
            <CheckCircle2 className="w-6 h-6 text-[#10B981]" />
          </div>
          <h4 className="text-[14px] font-medium text-[#E6EDF3]">Import Successful</h4>
          <p className="text-[12px] text-[#8B949E]">
            {parsedData.filter(p => p.valid).length} GCPs loaded • {file?.name} • {crs}
          </p>
          <div className="flex justify-center gap-2 pt-4">
            <Button variant="outline" size="sm" onClick={handleReset} className="h-8 text-[12px]">
              Re-import
            </Button>
            <Button size="sm" onClick={() => {}} className="h-8 text-[12px] bg-[#00D4FF] text-[#0E1117]">
              View on Map
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
