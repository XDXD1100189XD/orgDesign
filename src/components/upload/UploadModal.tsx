'use client';

import { useState, useRef, useCallback } from 'react';
import { formatBytes } from '@/lib/utils';
import { WEBHOOK_URL, ANALYSIS_PROMPT } from '@/lib/constants';
import { unwrapResponse, parseWebhookResponse } from '@/lib/normalize';
import type { DashboardData, FileInputType } from '@/lib/types';
import { FILE_TYPE_CONFIG } from '@/lib/types';
import type { ColumnMapping } from '@/lib/fieldDictionary';
import type { ExcelRow } from '@/lib/parseExcel';
import ColumnMappingStep from './ColumnMappingStep';
import styles from './UploadModal.module.css';

type Stage = 'upload' | 'parse' | 'render';
const FILE_TYPES: FileInputType[] = ['image', 'text', 'excel'];

interface Props {
  onDataReady: (data: DashboardData) => void;
  onExcelFile?: (file: File) => void;
  onExcelParsed?: (rows: ExcelRow[], headers: string[], mapping: ColumnMapping) => void;
}

export default function UploadModal({ onDataReady, onExcelFile, onExcelParsed }: Props) {
  const [fileType, setFileType] = useState<FileInputType>('image');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [textInput, setTextInput] = useState('');
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeStage, setActiveStage] = useState<Stage | null>(null);
  const [doneStages, setDoneStages] = useState<Set<Stage>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Excel client-side flow
  const [excelRows, setExcelRows] = useState<ExcelRow[] | null>(null);
  const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
  const [autoMapping, setAutoMapping] = useState<ColumnMapping | null>(null);
  const [showMapping, setShowMapping] = useState(false);

  const config = FILE_TYPE_CONFIG[fileType];

  const handleFile = useCallback((f: File) => {
    setError(null);
    if (f.size > 20 * 1024 * 1024) {
      setError('File is larger than 20 MB.');
      return;
    }
    setFile(f);
    if (f.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(f);
    } else {
      setPreview(null);
    }
  }, []);

  const removeFile = () => {
    setFile(null);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const switchType = (t: FileInputType) => {
    setFileType(t);
    removeFile();
    setTextInput('');
    setError(null);
  };

  const markStage = (stage: Stage, done: boolean) => {
    if (done) {
      setDoneStages((prev) => new Set(prev).add(stage));
      setActiveStage(null);
    } else {
      setActiveStage(stage);
    }
  };

  const canSubmit = fileType === 'text' ? textInput.trim().length > 0 : !!file;

  const handleMappingConfirm = async (confirmedMapping: ColumnMapping) => {
    setShowMapping(false);
    setLoading(true);
    setError(null);
    try {
      const { buildHierarchyFromMapping } = await import('@/lib/buildHierarchy');
      const dashData = buildHierarchyFromMapping(excelRows!, confirmedMapping);
      onDataReady(dashData);
      if (file) onExcelFile?.(file);
      onExcelParsed?.(excelRows!, excelHeaders, confirmedMapping);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not build hierarchy.');
    } finally {
      setLoading(false);
    }
  };

  const analyze = async () => {
    if (!canSubmit) return;
    setError(null);
    setLoading(true);
    setDoneStages(new Set());

    // Excel: parse locally and show mapping UI — no server call
    if (fileType === 'excel') {
      try {
        const { parseExcelFile } = await import('@/lib/parseExcel');
        const rows = await parseExcelFile(file!);
        if (rows.length === 0) throw new Error('The file appears to be empty.');
        const headers = Object.keys(rows[0]);
        const { matchColumns } = await import('@/lib/fieldDictionary');
        const mapping = matchColumns(headers);
        setExcelRows(rows);
        setExcelHeaders(headers);
        setAutoMapping(mapping);
        setShowMapping(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not parse Excel file.');
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      markStage('upload', false);

      let resp: Response;

      if (fileType === 'text') {
        // Send text as JSON — no file involved
        resp = await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: textInput.trim(),
            file_type: 'text',
            prompt: ANALYSIS_PROMPT,
            timestamp: new Date().toISOString(),
          }),
        });
      } else {
        // Send file as multipart
        const form = new FormData();
        form.append('file', file!, file!.name);
        form.append('file_type', fileType);
        form.append('filename', file!.name);
        form.append('mime_type', file!.type);
        form.append('prompt', ANALYSIS_PROMPT);
        form.append('timestamp', new Date().toISOString());
        resp = await fetch(WEBHOOK_URL, { method: 'POST', body: form });
      }

      markStage('upload', true);

      markStage('parse', false);
      if (!resp.ok) throw new Error(`Webhook returned ${resp.status} ${resp.statusText}`);

      const raw = await resp.text();
      let payload;
      try { payload = JSON.parse(raw); } catch {
        throw new Error('Response was not valid JSON: ' + raw.slice(0, 120));
      }

      const unwrapped = unwrapResponse(payload);
      markStage('parse', true);

      markStage('render', false);
      const dashData = parseWebhookResponse(unwrapped);
      markStage('render', true);

      await new Promise((r) => setTimeout(r, 400));
      onDataReady(dashData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setActiveStage(null);
      setDoneStages(new Set());
    } finally {
      setLoading(false);
    }
  };

  const stages: { key: Stage; label: string }[] = [
    { key: 'upload', label: 'Uploading file to n8n…' },
    { key: 'parse', label: 'Analyzing & extracting hierarchy…' },
    { key: 'render', label: 'Rendering dashboard…' },
  ];

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
          <p className={styles.kicker}>Step 01 · Upload</p>
          <h2>Feed the chart<br /><em>get the dashboard.</em></h2>
        </div>

        <div className={styles.body}>
          <p className={styles.help}>
            Upload your org chart. Select the file type, drop the file, and we&apos;ll
            extract the hierarchy and render the dashboard.
          </p>

          {/* File type selector */}
          <div className={styles.typeSelector}>
            {FILE_TYPES.map((t) => (
              <button
                key={t}
                className={`${styles.typeBtn} ${fileType === t ? styles.typeBtnActive : ''}`}
                onClick={() => switchType(t)}
                disabled={loading}
              >
                <span className={styles.typeIcon}>{FILE_TYPE_CONFIG[t].icon}</span>
                <span className={styles.typeLabel}>{FILE_TYPE_CONFIG[t].label}</span>
                <span className={styles.typeDesc}>{FILE_TYPE_CONFIG[t].description}</span>
              </button>
            ))}
          </div>

          {/* Input area — text box or file dropzone */}
          {fileType === 'text' ? (
            <div className={styles.textWrap}>
              <textarea
                className={styles.textArea}
                placeholder="Paste your org chart text here…&#10;&#10;e.g. Wayne Filin-Matthews (Technology Lead) manages Akshay Sahni (Delivery Lead), who manages Jagdeep Singh (Tech Portfolio Lead)…"
                value={textInput}
                onChange={(e) => { setTextInput(e.target.value); setError(null); }}
                rows={8}
              />
              {textInput.trim() && (
                <div className={styles.textMeta}>
                  {textInput.trim().length} characters · {textInput.trim().split(/\n+/).filter(Boolean).length} lines
                </div>
              )}
            </div>
          ) : (
            <>
              <label
                className={`${styles.dropzone} ${dragging ? styles.drag : ''}`}
                onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
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
                <div className={styles.dzTitle}>Drop your {config.label.toLowerCase()} file here</div>
                <div className={styles.dzSub}>{config.description} · up to 20 MB</div>
                <input
                  ref={inputRef}
                  type="file"
                  accept={config.accept}
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                  hidden
                />
              </label>

              {file && (
                <div className={styles.preview}>
                  {preview ? (
                    <img src={preview} alt="preview" />
                  ) : (
                    <div className={styles.fileIcon}>{config.icon}</div>
                  )}
                  <div className={styles.info}>
                    <div className={styles.fname}>{file.name}</div>
                    <div className={styles.fsize}>{formatBytes(file.size)} · {fileType.toUpperCase()}</div>
                  </div>
                  <button className={styles.remove} onClick={removeFile}>×</button>
                </div>
              )}
            </>
          )}

          {(activeStage || doneStages.size > 0) && (
            <div className={styles.stages}>
              {stages.map((s) => (
                <div key={s.key} className={`${styles.stage} ${activeStage === s.key ? styles.stageActive : ''} ${doneStages.has(s.key) ? styles.stageDone : ''}`}>
                  <div className={styles.dot} />
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className={styles.error}><b>Couldn&apos;t process that.</b> {error}</div>
          )}

          <button className={styles.btn} disabled={!canSubmit || loading} onClick={analyze}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            {loading ? 'Working…' : 'Analyze & Generate'}
          </button>
        </div>
      </div>
    </div>
  );
}
