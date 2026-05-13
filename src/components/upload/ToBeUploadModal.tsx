'use client';

import { useState, useRef, useCallback } from 'react';
import type { DashboardData } from '@/lib/types';
import type { ColumnMapping } from '@/lib/fieldDictionary';
import type { ExcelRow } from '@/lib/parseExcel';
import ColumnMappingStep from './ColumnMappingStep';
import styles from './UploadModal.module.css';

interface Props {
  asIsHeaders: string[];
  asIsMapping: ColumnMapping | null;
  asIsData: DashboardData;
  onConfirm: (data: DashboardData, file: File, rows: ExcelRow[], headers: string[], mapping: ColumnMapping) => void;
  onCancel: () => void;
}

export default function ToBeUploadModal({ asIsHeaders, asIsMapping, asIsData, onConfirm, onCancel }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hardErrors, setHardErrors] = useState<string[]>([]);
  const [softWarnings, setSoftWarnings] = useState<string[]>([]);
  const [proceedDespiteWarnings, setProceedDespiteWarnings] = useState(false);
  const [showMapping, setShowMapping] = useState(false);
  const [excelRows, setExcelRows] = useState<ExcelRow[] | null>(null);
  const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
  const [autoMapping, setAutoMapping] = useState<ColumnMapping | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    setError(null);
    setHardErrors([]);
    setSoftWarnings([]);
    setProceedDespiteWarnings(false);
    if (f.size > 20 * 1024 * 1024) { setError('File is larger than 20 MB.'); return; }
    setFile(f);
  }, []);

  const analyze = async (forceProcceed = false) => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setHardErrors([]);
    setSoftWarnings([]);

    try {
      const { parseExcelFile } = await import('@/lib/parseExcel');
      const rows = await parseExcelFile(file);
      if (rows.length === 0) throw new Error('The file appears to be empty.');
      const headers = Object.keys(rows[0]);

      // Hard check: required hierarchy columns must exist in To-Be. Optional
      // mapped columns may be As-Is-only derived fields and can be remapped.
      const hard: string[] = [];
      const soft: string[] = [];

      // Only check columns that are actually mapped in As-Is
      if (asIsMapping) {
        const requiredAsIsCols = ['Employee ID', 'Manager ID']
          .map(field => asIsMapping[field as keyof ColumnMapping]?.column)
          .filter((c): c is string => c !== null);
        const missingRequired = requiredAsIsCols.filter(c => !headers.includes(c));
        if (missingRequired.length > 0) {
          hard.push(
            `Missing required hierarchy column(s) from As-Is mapping: ${missingRequired.join(', ')}`
          );
        }

        const optionalAsIsCols = Object.values(asIsMapping)
          .map(e => e.column)
          .filter((c): c is string => c !== null && !requiredAsIsCols.includes(c));
        const missingOptional = optionalAsIsCols.filter(c => !headers.includes(c));
        if (missingOptional.length > 0) {
          soft.push(
            `${missingOptional.length} optional mapped column(s) are missing and can be remapped for To-Be: ${missingOptional.slice(0, 4).join(', ')}${missingOptional.length > 4 ? ` (+${missingOptional.length - 4} more)` : ''}`
          );
        }
      } else if (asIsHeaders.length > 0) {
        // No mapping available — check raw column overlap
        const missingCols = asIsHeaders.filter(h => !headers.includes(h));
        if (missingCols.length > asIsHeaders.length * 0.3) {
          hard.push(
            `${missingCols.length} of ${asIsHeaders.length} As-Is columns are missing. This may be a different table.`
          );
        }
      }

      // Soft check: emp_id overlap
      if (!forceProcceed && asIsMapping) {
        const empIdCol = asIsMapping['Employee ID']?.column;
        if (empIdCol && headers.includes(empIdCol)) {
          const asIsIds = new Set(
            Object.values(asIsData.vertices)
              .map(v => v.id)
              .filter(Boolean)
              .map(id => String(id).trim().toLowerCase())
          );
          if (asIsIds.size > 0) {
            const toBeIds = new Set(
              rows.map(r => String(r[empIdCol] ?? '').trim().toLowerCase()).filter(Boolean)
            );
            const overlap = [...asIsIds].filter(id => toBeIds.has(id)).length;
            const pct = Math.round((overlap / asIsIds.size) * 100);
            if (overlap === 0) {
              soft.push(`No employee IDs from As-Is appear in this file (0% overlap). It may be a completely different dataset.`);
            } else if (pct < 20) {
              soft.push(`Only ${pct}% of As-Is employee IDs found in this file (${overlap} of ${asIsIds.size}). Verify this is the correct To-Be file.`);
            }
          }
        }
      }

      if (hard.length > 0) {
        setHardErrors(hard);
        setLoading(false);
        return;
      }

      if (soft.length > 0 && !forceProcceed) {
        setSoftWarnings(soft);
        setLoading(false);
        return;
      }

      // All good — proceed to mapping
      const { matchColumns } = await import('@/lib/fieldDictionary');
      const mapping = asIsMapping ?? matchColumns(headers);
      setExcelRows(rows);
      setExcelHeaders(headers);
      setAutoMapping(mapping);
      setShowMapping(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not parse file.');
    } finally {
      setLoading(false);
    }
  };

  const handleMappingConfirm = async (mapping: ColumnMapping) => {
    setShowMapping(false);
    setLoading(true);
    try {
      const { buildHierarchyFromMapping } = await import('@/lib/buildHierarchy');
      const dashData = buildHierarchyFromMapping(excelRows!, mapping);
      onConfirm(dashData, file!, excelRows!, excelHeaders, mapping);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not build hierarchy.');
      setLoading(false);
    }
  };

  if (showMapping && autoMapping) {
    return (
      <div className={styles.overlay}>
        <ColumnMappingStep
          headers={excelHeaders}
          mapping={autoMapping}
          onConfirm={handleMappingConfirm}
          onBack={() => { setShowMapping(false); setLoading(false); }}
        />
      </div>
    );
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        <div className={styles.hero}>
          <div className={styles.diamond} />
          <p className={styles.kicker}>To-Be State · Upload</p>
          <h2>Upload target<br /><em>org structure.</em></h2>
        </div>

        <div className={styles.body}>
          <p className={styles.help}>
            Upload the To-Be Excel file. It must have the same columns as the As-Is file
            {asIsHeaders.length > 0 ? ` (${asIsHeaders.length} columns expected)` : ''}.
            Rows can vary — only column structure is validated.
          </p>

          <label
            className={`${styles.dropzone} ${dragging ? styles.drag : ''}`}
            onDragEnter={e => { e.preventDefault(); setDragging(true); }}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files[0];
              if (f) handleFile(f);
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.dzIcon}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <div className={styles.dzTitle}>Drop your Excel file here</div>
            <div className={styles.dzSub}>XLSX · XLS · CSV · up to 20 MB</div>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
              hidden
            />
          </label>

          {file && (
            <div className={styles.preview}>
              <div className={styles.fileIcon}>📊</div>
              <div className={styles.info}>
                <div className={styles.fname}>{file.name}</div>
              </div>
              <button className={styles.remove} onClick={() => {
                setFile(null);
                setHardErrors([]);
                setSoftWarnings([]);
                setProceedDespiteWarnings(false);
                if (inputRef.current) inputRef.current.value = '';
              }}>×</button>
            </div>
          )}

          {hardErrors.length > 0 && (
            <div className={styles.error}>
              <b>Cannot proceed:</b>
              {hardErrors.map((e, i) => <div key={i} style={{ marginTop: 4 }}>• {e}</div>)}
            </div>
          )}

          {softWarnings.length > 0 && hardErrors.length === 0 && (
            <div className={styles.error} style={{ background: '#fffbf0', borderColor: '#d97706', color: '#92400e' }}>
              <b>Warning:</b>
              {softWarnings.map((w, i) => <div key={i} style={{ marginTop: 4 }}>• {w}</div>)}
              <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                <button
                  className={styles.btn}
                  style={{ padding: '6px 14px', fontSize: 11 }}
                  onClick={() => { setProceedDespiteWarnings(true); analyze(true); }}
                >
                  Proceed Anyway
                </button>
              </div>
            </div>
          )}

          {error && <div className={styles.error}><b>Error:</b> {error}</div>}

          {softWarnings.length === 0 && (
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button
                className={styles.btn}
                style={{ flex: 1, background: 'none', border: '1px solid rgba(0,0,0,0.15)', color: 'var(--ink)', boxShadow: 'none' }}
                onClick={onCancel}
              >
                Cancel
              </button>
              <button
                className={styles.btn}
                style={{ flex: 2 }}
                disabled={!file || loading}
                onClick={() => analyze(proceedDespiteWarnings)}
              >
                {loading ? 'Validating…' : 'Validate & Continue'}
              </button>
            </div>
          )}
          {softWarnings.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <button
                className={styles.btn}
                style={{ background: 'none', border: '1px solid rgba(0,0,0,0.15)', color: 'var(--ink)', boxShadow: 'none', width: '100%' }}
                onClick={onCancel}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
