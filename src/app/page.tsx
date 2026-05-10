"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { DashboardData, AIChartRequest } from "@/lib/types";
import type { ColumnMapping } from "@/lib/fieldDictionary";
import type { ExcelRow } from "@/lib/parseExcel";
import UploadModal from "@/components/upload/UploadModal";
import ToBeUploadModal from "@/components/upload/ToBeUploadModal";
import ColumnMappingStep from "@/components/upload/ColumnMappingStep";
import SummaryView from "@/components/dashboard/SummaryView";
import HierarchyView from "@/components/dashboard/HierarchyView";
import DataReadinessView from "@/components/dashboard/DataReadinessView";
import AdvancedAnalyticsView from "@/components/dashboard/AdvancedAnalyticsView";
import CompMatrixView from "@/components/dashboard/CompMatrixView";
import ChangeManagementDrawer from "@/components/dashboard/ChangeManagementDrawer";
import {
  createChangeRecord,
  cloneSnapshot,
  type ChangeRecord,
  type ChangeScope,
} from "@/lib/changeManagement";
import dynamic from "next/dynamic";
import styles from "./page.module.css";

const TableView = dynamic(
  () => import("@/components/dashboard/TableView"),
  { ssr: false }
);

const AnalyticsStudioView = dynamic(
  () => import("@/components/dashboard/AnalyticsStudioView"),
  { ssr: false }
);

const AIAssistantView = dynamic(
  () => import("@/components/dashboard/AIAssistantView"),
  { ssr: false }
);

// ── Session persistence ──────────────────────────────────────────────────────

const SESSION_KEY = 'org-dashboard-session';
const CHANGE_LOG_VERSION = 3;

interface SessionPayload {
  data: DashboardData;
  toBeData: DashboardData | null;
  columnMapping: ColumnMapping | null;
  excelHeaders: string[];
  excelRows: ExcelRow[] | null;
  studioMutatedRows: ExcelRow[] | null;
  hadExcelFile: boolean;
  changeLogVersion?: number;
  changeLog?: ChangeRecord[];
}

function saveSession(payload: SessionPayload) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  } catch { /* storage full — silently skip */ }
}

// ─────────────────────────────────────────────────────────────────────────────

type Tab = "summary" | "tree" | "table" | "readiness" | "advanced" | "studio" | "comp" | "ai";
type StateSlice = "as-is" | "to-be";

// ── Target state metric computation ──
interface StateMetrics {
  avgSpan: number;
  layers: number;
  totalCost: number | null;
  icRatio: number;
  headcount: number;
  mgrRatio: number;
}

function computeStateMetrics(d: DashboardData): StateMetrics {
  const m = d.metrics;
  const total   = m.basic.total_nodes;
  const mgrCnt  = m.management.manager_count;

  let totalCost: number | null = null;
  if (d.compMatrix) {
    let cost = 0; let hasAny = false;
    for (const v of Object.values(d.vertices)) {
      if (!v.grade) continue;
      const gradeMatrix = d.compMatrix[v.grade];
      if (!gradeMatrix) continue;
      const band = (v.geo ? gradeMatrix[v.geo] : null) ?? Object.values(gradeMatrix)[0] ?? null;
      if (band) { cost += (band.min + band.max) / 2; hasAny = true; }
    }
    if (hasAny) totalCost = cost;
  }

  return {
    avgSpan:   m.management.avg_span,
    layers:    m.org_structure.org_depth,
    totalCost,
    icRatio:   total > 0 ? ((total - mgrCnt) / total) * 100 : 0,
    headcount: total,
    mgrRatio:  total > 0 ? (mgrCnt / total) * 100 : 0,
  };
}

function fmtCost(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${Math.round(n / 1e6)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}k`;
  return `$${Math.round(n)}`;
}

const BASE_TABS: { key: Tab; num: string; label: string }[] = [
  { key: "summary",  num: "01", label: "Summary" },
  { key: "advanced", num: "02", label: "Advanced Analytics" },
  { key: "studio",   num: "03", label: "Analytics Studio" },
  { key: "tree",     num: "04", label: "Hierarchy" },
  { key: "table",    num: "05", label: "Employees" },
  { key: "comp",     num: "06", label: "Comp Setup" },
  { key: "ai",       num: "08", label: "AI Assistant" },
];
const READINESS_TAB = { key: "readiness" as Tab, num: "07", label: "Data Readiness" };

export default function HomePage() {
  // ── As-Is state ──
  const [data, setData] = useState<DashboardData | null>(null);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelRows, setExcelRows] = useState<ExcelRow[] | null>(null);
  const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping | null>(null);
  const [showRemapping, setShowRemapping] = useState(false);

  // ── To-Be state ──
  const [toBeData, setToBeData] = useState<DashboardData | null>(null);
  const [toBeFile, setToBeFile] = useState<File | null>(null);
  const [showToBeUpload, setShowToBeUpload] = useState(false);

  // ── Studio-mutated rows (shared with Employees tab and AI assistant) ──
  const [studioMutatedRows, setStudioMutatedRows] = useState<import("@/lib/parseExcel").ExcelRow[] | null>(null);

  // ── AI chart request (set by AI assistant, consumed by Analytics Studio) ──
  const [pendingChartRequest, setPendingChartRequest] = useState<AIChartRequest | null>(null);

  // Change management state
  const [changeLog, setChangeLog] = useState<ChangeRecord[]>([]);
  const [showChangeDrawer, setShowChangeDrawer] = useState(false);

  // ── UI state ──
  const [activeTab, setActiveTab] = useState<Tab>("summary");
  const [downloading] = useState(false);
  const [studioSlice, setStudioSlice] = useState<StateSlice>("as-is");
  const [tableSlice, setTableSlice] = useState<StateSlice>("as-is");
  const [tableJumpId, setTableJumpId] = useState<string | null>(null);
  const [showExcelPrompt, setShowExcelPrompt] = useState(false);
  const [hadExcelFile, setHadExcelFile] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);

  // ── Restore session on mount ──
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const s: Partial<SessionPayload> = JSON.parse(raw);
      if (s.data)          setData(s.data);
      if (s.excelHeaders)  setExcelHeaders(s.excelHeaders);
      if (s.excelRows)     setExcelRows(s.excelRows);
      if (s.studioMutatedRows) setStudioMutatedRows(s.studioMutatedRows);
      if (s.columnMapping) setColumnMapping(s.columnMapping);
      if (s.toBeData)      setToBeData(s.toBeData);
      if (s.changeLogVersion === CHANGE_LOG_VERSION && s.changeLog) setChangeLog(s.changeLog);
      if (s.hadExcelFile) {
        setHadExcelFile(true);
        setShowExcelPrompt(!s.excelRows?.length);
      }
    } catch { /* corrupted storage — ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Persist session whenever data changes ──
  useEffect(() => {
    if (!data) return;
    saveSession({
      data,
      toBeData,
      columnMapping,
      excelHeaders,
      excelRows,
      studioMutatedRows,
      hadExcelFile: hadExcelFile || !!excelFile || !!excelRows,
      changeLogVersion: CHANGE_LOG_VERSION,
      changeLog,
    });
  }, [data, toBeData, columnMapping, excelHeaders, excelRows, studioMutatedRows, excelFile, hadExcelFile, changeLog]);

  const TABS = excelFile ? [...BASE_TABS, READINESS_TAB] : BASE_TABS;

  const appendChange = useCallback((change: ChangeRecord) => {
    setChangeLog((prev) => [...prev, change]);
  }, []);

  const currentSnapshot = useCallback(() => ({
    data,
    toBeData,
    columnMapping,
    excelRows,
    studioRows: studioMutatedRows,
  }), [columnMapping, data, excelRows, studioMutatedRows, toBeData]);

  const canBuildFromRows = useCallback((rows: ExcelRow[]) => {
    if (!columnMapping || rows.length === 0) return false;
    const headers = new Set(Object.keys(rows[0]));
    return ["Employee ID", "Manager ID"].every((field) => {
      const mapped = columnMapping[field as keyof ColumnMapping]?.column;
      return !!mapped && headers.has(mapped);
    });
  }, [columnMapping]);

  // ── As-Is handlers ──
  const handleDataReady = useCallback((d: DashboardData) => {
    appendChange(createChangeRecord({
      scope: "as-is",
      action: data ? "upload" : "initialize",
      before: currentSnapshot(),
      after: { data: d, toBeData, columnMapping, excelRows, studioRows: studioMutatedRows },
      details: data ? undefined : ["Baseline snapshot captured from the uploaded org data."],
    }));
    setData(d);
    setActiveTab("summary");
  }, [appendChange, columnMapping, currentSnapshot, data, excelRows, studioMutatedRows, toBeData]);

  const handleExcelFile = useCallback((f: File) => {
    setExcelFile(f);
    setHadExcelFile(true);
    setStudioMutatedRows(null);
    setShowExcelPrompt(false);
  }, []);

  const handleExcelParsed = useCallback((rows: ExcelRow[], headers: string[], mapping: ColumnMapping) => {
    setExcelRows(rows);
    setExcelHeaders(headers);
    appendChange(createChangeRecord({
      scope: "mapping",
      action: "mapping",
      before: currentSnapshot(),
      after: { data, toBeData, columnMapping: mapping, excelRows: rows, studioRows: studioMutatedRows },
    }));
    setColumnMapping(mapping);
  }, [appendChange, currentSnapshot, data, studioMutatedRows, toBeData]);

  const handleRemappingConfirm = useCallback(async (newMapping: ColumnMapping) => {
    setShowRemapping(false);
    if (!excelRows) return;
    const { buildHierarchyFromMapping } = await import("@/lib/buildHierarchy");
    const nextData = buildHierarchyFromMapping(excelRows, newMapping);
    appendChange(createChangeRecord({
      scope: "mapping",
      action: "mapping",
      before: currentSnapshot(),
      after: { data: nextData, toBeData, columnMapping: newMapping, excelRows, studioRows: studioMutatedRows },
    }));
    setData(nextData);
    setColumnMapping(newMapping);
  }, [appendChange, currentSnapshot, data, excelRows, studioMutatedRows, toBeData]);

  const handleDataChange = useCallback((d: DashboardData) => {
    appendChange(createChangeRecord({
      scope: "as-is",
      action: "hierarchy",
      before: currentSnapshot(),
      after: { data: d, toBeData, columnMapping, excelRows, studioRows: studioMutatedRows },
    }));
    setData(d);
  }, [appendChange, columnMapping, currentSnapshot, excelRows, studioMutatedRows, toBeData]);

  const handleToBeDataChange = useCallback((d: DashboardData) => {
    appendChange(createChangeRecord({
      scope: "to-be",
      action: "hierarchy",
      before: currentSnapshot(),
      after: { data, toBeData: d, columnMapping, excelRows, studioRows: studioMutatedRows },
    }));
    setToBeData(d);
  }, [appendChange, columnMapping, currentSnapshot, data, excelRows, studioMutatedRows]);
  const handleCompDataChange = useCallback((d: DashboardData) => {
    const nextToBeData = toBeData ? { ...toBeData, compMatrix: d.compMatrix } : toBeData;
    appendChange(createChangeRecord({
      scope: "compensation",
      action: "compensation",
      title: "Compensation setup updated",
      summary: nextToBeData ? "Compensation bands were updated and synced into the target state." : "Compensation bands were updated.",
      details: ["As-Is compensation setup changed.", ...(nextToBeData ? ["To-Be compensation setup now uses the same band matrix."] : [])],
      before: currentSnapshot(),
      after: { data: d, toBeData: nextToBeData, columnMapping, excelRows, studioRows: studioMutatedRows },
    }));
    setData(d);
    setToBeData(nextToBeData);
  }, [appendChange, columnMapping, currentSnapshot, data, excelRows, studioMutatedRows, toBeData]);

  const handleSharedRowsChange = useCallback(async (
    rows: ExcelRow[] | null,
    meta?: { source?: string; action?: string; query?: string; affected?: number; label?: string; target?: StateSlice },
  ) => {
    const target = meta?.target ?? (activeTab === "table" ? tableSlice : studioSlice);
    const before = currentSnapshot();
    let nextData = data;
    let nextToBeData = toBeData;
    const nextStudioRows = rows;

    if (rows && columnMapping && canBuildFromRows(rows)) {
      const { buildHierarchyFromMapping } = await import("@/lib/buildHierarchy");
      const rebuilt = buildHierarchyFromMapping(rows, columnMapping);
      if (target === "as-is") nextData = rebuilt;
      if (target === "to-be") nextToBeData = rebuilt;
    }

    const isReset = rows === null;
    const sourceLabel =
      meta?.source === "employees-table" ? "Employees table"
        : meta?.source === "analytics-sql" ? "Analytics SQL"
          : meta?.source === "analytics-reset" ? "Analytics Studio"
            : meta?.source === "ai-sql" ? "Agentic AI SQL"
              : "Employee rows";

    appendChange(createChangeRecord({
      scope: "rows",
      action: "rows",
      title: isReset ? `${sourceLabel} reset` : `${sourceLabel} updated ${target === "as-is" ? "As-Is" : "To-Be"} rows`,
      summary: isReset
        ? "The active row layer was reset to the loaded source data."
        : `${(rows?.length ?? 0).toLocaleString()} rows changed${meta?.affected != null ? `, ${meta.affected.toLocaleString()} affected by the operation` : ""}.`,
      details: [
        meta?.label ?? (meta?.query ? `SQL: ${meta.query}` : "Rows changed through an editable surface."),
        rows && columnMapping && canBuildFromRows(rows)
          ? `The ${target === "as-is" ? "As-Is" : "To-Be"} hierarchy was rebuilt from these rows.`
          : "Stored as row-layer changes because the current field mapping could not rebuild hierarchy data.",
      ],
      before,
      after: {
        data: nextData,
        toBeData: nextToBeData,
        columnMapping,
        excelRows,
        studioRows: nextStudioRows,
      },
    }));

    setStudioMutatedRows(nextStudioRows);
    if (nextData !== data) setData(nextData);
    if (nextToBeData !== toBeData) setToBeData(nextToBeData);
  }, [activeTab, appendChange, canBuildFromRows, columnMapping, currentSnapshot, data, excelRows, studioSlice, tableSlice, toBeData]);

  const handleRowMutation = useCallback(async (rows: ExcelRow[], target: 'as-is' | 'to-be' | 'both') => {
    if (!columnMapping) return;
    const { buildHierarchyFromMapping } = await import('@/lib/buildHierarchy');
    const nextAsIs = (target === 'as-is' || target === 'both') ? buildHierarchyFromMapping(rows, columnMapping) : data;
    const nextToBe = (target === 'to-be' || target === 'both') ? buildHierarchyFromMapping(rows, columnMapping) : toBeData;
    const scope: ChangeScope = target === 'as-is' ? 'as-is' : target === 'to-be' ? 'to-be' : 'session';
    appendChange(createChangeRecord({
      scope,
      action: "rows",
      title: `Rows applied to ${target === "both" ? "both states" : target === "as-is" ? "As-Is" : "To-Be"}`,
      summary: `${rows.length.toLocaleString()} source rows rebuilt into hierarchy data.`,
      details: ["Dashboard state was rebuilt from the current row set and field mapping."],
      before: currentSnapshot(),
      after: { data: nextAsIs, toBeData: nextToBe, columnMapping, excelRows, studioRows: rows },
    }));
    setStudioMutatedRows(rows);
    if (target === 'as-is' || target === 'both') {
      setExcelRows(rows);
      setData(nextAsIs);
    }
    if (target === 'to-be' || target === 'both') {
      setToBeData(nextToBe);
    }
  }, [appendChange, columnMapping, currentSnapshot, data, excelRows, toBeData]);

  const handleFieldMapping = useCallback(async (field: string, column: string, newRows?: ExcelRow[]) => {
    if (!columnMapping) return;
    const { buildHierarchyFromMapping } = await import('@/lib/buildHierarchy');
    const newMapping: ColumnMapping = {
      ...columnMapping,
      [field as import('@/lib/fieldDictionary').CanonicalField]: { column, confidence: 1, isManual: true },
    };
    setColumnMapping(newMapping);
    const rows = newRows ?? excelRows;
    if (!rows) return;
    if (newRows) {
      setExcelRows(newRows);
      setStudioMutatedRows(newRows);
      // Add the new derived column to excelHeaders if it isn't already there
      setExcelHeaders(prev => prev.includes(column) ? prev : [...prev, column]);
    }
    const nextData = buildHierarchyFromMapping(rows, newMapping);
    appendChange(createChangeRecord({
      scope: "mapping",
      action: "mapping",
      before: currentSnapshot(),
      after: { data: nextData, toBeData, columnMapping: newMapping, excelRows: newRows ?? excelRows, studioRows: newRows ?? studioMutatedRows },
    }));
    setData(nextData);
  }, [appendChange, columnMapping, currentSnapshot, data, excelRows, studioMutatedRows, toBeData]);

  // ── To-Be handlers ──
  const handleCopyFromAsIs = useCallback(() => {
    if (!data) return;
    const nextToBe = JSON.parse(JSON.stringify(data));
    appendChange(createChangeRecord({
      scope: "to-be",
      action: "copy",
      title: "To-Be copied from As-Is",
      summary: "Target state initialized from the current organization snapshot.",
      details: ["Use this as a controlled baseline before target-state edits."],
      before: currentSnapshot(),
      after: { data, toBeData: nextToBe, columnMapping, excelRows, studioRows: studioMutatedRows },
    }));
    setToBeData(nextToBe);
    setToBeFile(excelFile);
  }, [appendChange, columnMapping, currentSnapshot, data, excelFile, excelRows, studioMutatedRows]);

  const handleToBeUploaded = useCallback((
    d: DashboardData,
    file: File,
  ) => {
    appendChange(createChangeRecord({
      scope: "to-be",
      action: "upload",
      title: "To-Be file uploaded",
      summary: `${file.name} loaded as target-state data.`,
      before: currentSnapshot(),
      after: { data, toBeData: d, columnMapping, excelRows, studioRows: studioMutatedRows },
    }));
    setToBeData(d);
    setToBeFile(file);
    setShowToBeUpload(false);
  }, [appendChange, columnMapping, currentSnapshot, data, excelRows, studioMutatedRows]);

  const handleResetToBe = useCallback(() => {
    appendChange(createChangeRecord({
      scope: "to-be",
      action: "reset",
      before: currentSnapshot(),
      after: { data, toBeData: null, columnMapping, excelRows, studioRows: studioMutatedRows },
    }));
    setToBeData(null);
    setToBeFile(null);
  }, [appendChange, columnMapping, currentSnapshot, data, excelRows, studioMutatedRows]);

  const handleRevertChange = useCallback((change: ChangeRecord) => {
    const before = cloneSnapshot(change.before);

    if ("data" in before) setData(before.data ?? null);
    if ("toBeData" in before) {
      setToBeData(before.toBeData ?? null);
      if (!before.toBeData) setToBeFile(null);
    }
    if ("columnMapping" in before) setColumnMapping(before.columnMapping ?? null);
    if ("excelRows" in before) setExcelRows(before.excelRows ?? null);
    if ("studioRows" in before) setStudioMutatedRows(before.studioRows ?? null);

    setChangeLog((prev) => {
      const index = prev.findIndex((item) => item.id === change.id);
      return index >= 0 ? prev.slice(0, index) : prev;
    });
  }, []);

  const handleDownload = async () => { return; };

  if (!data) {
    return (
      <>
        <div className={styles.shell} style={{ filter: "blur(8px)", pointerEvents: "none" }}>
          <ShellSkeleton />
        </div>
        <UploadModal
          onDataReady={handleDataReady}
          onExcelFile={handleExcelFile}
          onExcelParsed={handleExcelParsed}
        />
      </>
    );
  }

  // Which data/file to pass to analytics studio and table
  const studioData = studioSlice === "as-is" ? data : (toBeData ?? data);
  const studioFile = studioSlice === "as-is" ? excelFile : (toBeFile ?? excelFile);
  const tableData  = tableSlice  === "as-is" ? data : (toBeData ?? data);
  const tableFile  = tableSlice  === "as-is" ? excelFile : (toBeFile ?? excelFile);

  return (
    <div className={styles.shell} ref={shellRef}>
      {showToBeUpload && (
        <ToBeUploadModal
          asIsHeaders={excelHeaders}
          asIsMapping={columnMapping}
          asIsData={data}
          onConfirm={(d, file) => handleToBeUploaded(d, file)}
          onCancel={() => setShowToBeUpload(false)}
        />
      )}
      {showChangeDrawer && (
        <ChangeManagementDrawer
          changes={changeLog}
          onClose={() => setShowChangeDrawer(false)}
          onRevert={handleRevertChange}
        />
      )}

      <header className={styles.header}>
        <div className={styles.brandmark}>
          <div className={styles.bar} />
          <div className={styles.brandName}>Org Analytics · Menu Tech</div>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.crumbs}>
            Portfolio <b>· Item Vista</b>
          </div>
          <button
            className={styles.changeLogBtn}
            onClick={() => setShowChangeDrawer(true)}
          >
            Change Log
            {changeLog.length > 0 && <span>{changeLog.length}</span>}
          </button>
          <button
            className={`${styles.downloadBtn} ${downloading ? styles.spinning : ""}`}
            onClick={handleDownload}
            disabled={downloading}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {downloading ? "Preparing…" : "Download PDF"}
          </button>
        </div>
      </header>

      <h1 className={styles.title}>
        Org design <em>by the numbers</em>
      </h1>
      <p className={styles.subtitle}>
        A snapshot of the Menu Data (Item Vista) portfolio — headcount, span,
        depth, and distribution — rendered from the latest resolved hierarchy graph.
      </p>

      <nav className={styles.tabs}>
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`${styles.tab} ${activeTab === t.key ? styles.tabActive : ""}`}
            onClick={() => setActiveTab(t.key)}
          >
            <span className={styles.tabNum}>{t.num}</span>
            {t.label}
          </button>
        ))}
        {columnMapping && (
          <button
            className={styles.editFieldsBtn}
            onClick={() => setShowRemapping(true)}
            title="Re-map Excel columns to data model fields"
          >
            <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 5H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-5"/>
              <path d="M17.5 2.5a2.121 2.121 0 0 1 3 3L12 14l-4 1 1-4 8.5-8.5z"/>
            </svg>
            Edit Fields
          </button>
        )}
      </nav>

      {showRemapping && columnMapping && (
        <div className={styles.remapOverlay}>
          <ColumnMappingStep
            headers={excelHeaders}
            mapping={columnMapping}
            onConfirm={handleRemappingConfirm}
            onBack={() => setShowRemapping(false)}
          />
        </div>
      )}

      {/* ── Excel re-upload banner (shown after session restore) ── */}
      {showExcelPrompt && !excelFile && (
        <div className={styles.excelPromptBanner}>
          <span className={styles.excelPromptText}>
            Re-upload your Excel file to restore Data Readiness file checks.
            Dashboard state, rows, and the change log were restored from this browser session.
          </span>
          <label className={styles.excelPromptBtn}>
            Re-upload Excel
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setExcelFile(f);
                setShowExcelPrompt(false);
                try {
                  const { parseExcelFile } = await import('@/lib/parseExcel');
                  const rows = await parseExcelFile(f);
                  setExcelRows(rows);
                  setExcelHeaders(Object.keys(rows[0] ?? {}));
                } catch { /* file still works for DataReadiness/Studio */ }
              }}
            />
          </label>
          <button className={styles.excelPromptDismiss} onClick={() => setShowExcelPrompt(false)}>
            ×
          </button>
        </div>
      )}

      {/* ── 01 Summary — always As-Is ── */}
      <div data-view="summary" style={{ display: activeTab === "summary" ? "block" : "none" }}>
        <SummaryView data={data} />
      </div>

      {/* ── 02 Advanced Analytics — always As-Is ── */}
      <div data-view="advanced" style={{ display: activeTab === "advanced" ? "block" : "none" }}>
        <AdvancedAnalyticsView data={data} file={excelFile} />
      </div>

      {/* ── 03 Analytics Studio — state-switchable ── */}
      <div data-view="studio" style={{ display: activeTab === "studio" ? "block" : "none" }}>
        <div className={styles.sectionStateBar}>
          <span className={styles.sectionStateLabel}>State</span>
          <div className={styles.sectionStateBtns}>
            <button
              className={`${styles.sectionStateBtn} ${studioSlice === "as-is" ? styles.sectionStateBtnActive : ""}`}
              onClick={() => setStudioSlice("as-is")}
            >
              As-Is
            </button>
            <button
              className={`${styles.sectionStateBtn} ${studioSlice === "to-be" ? styles.sectionStateBtnActive : ""}`}
              onClick={() => setStudioSlice("to-be")}
              disabled={!toBeData}
              title={!toBeData ? "Initialize To-Be state in the Hierarchy tab first" : undefined}
            >
              To-Be
            </button>
          </div>
          {studioSlice === "to-be" && toBeData && (
            <span className={styles.sectionStateLabel} style={{ marginLeft: 8 }}>
              {toBeFile ? toBeFile.name : "Copied from As-Is"}
            </span>
          )}
        </div>
        <AnalyticsStudioView
          file={studioFile}
          data={studioData}
          rows={studioMutatedRows ?? excelRows ?? undefined}
          onRowsChange={(rows, meta) => handleSharedRowsChange(rows, { ...meta, target: studioSlice })}
          externalChartRequest={pendingChartRequest}
        />
      </div>

      {/* ── 04 Hierarchy — both panels side-by-side ── */}
      <div
        data-view="tree"
        data-export-title="Hierarchy Tree"
        style={{ display: activeTab === "tree" ? "block" : "none" }}
      >
        <div className={styles.hierarchyDual}>
          {/* As-Is panel */}
          <div className={styles.statePanel}>
            <div className={styles.statePanelHeader}>
              <span className={styles.stateLabelAsIs}>AS-IS</span>
              <span className={styles.statePanelDesc}>Current State</span>
            </div>
            <HierarchyView data={data} onDataChange={handleDataChange} />
          </div>

          {/* To-Be panel */}
          <div className={styles.statePanel}>
            <div className={styles.statePanelHeader}>
              <span className={styles.stateLabelToBe}>TO-BE</span>
              <span className={styles.statePanelDesc}>Target State</span>
              {toBeData && (
                <button className={styles.toBeResetBtn} onClick={handleResetToBe} title="Reset To-Be state">
                  ✕ Reset
                </button>
              )}
            </div>
            {toBeData ? (
              <HierarchyView data={toBeData} onDataChange={handleToBeDataChange} />
            ) : (
              <ToBeEmptyState
                onCopy={handleCopyFromAsIs}
                onUpload={() => setShowToBeUpload(true)}
                hasAsIsFile={!!excelFile}
              />
            )}
          </div>
        </div>

        {/* ── Target State Analysis ── */}
        <TargetStateAnalysis asIs={computeStateMetrics(data)} toBe={toBeData ? computeStateMetrics(toBeData) : null} />
      </div>

      {/* ── 05 Employees — state-switchable ── */}
      <div
        data-view="table"
        data-export-title="Employee Directory"
        style={{ display: activeTab === "table" ? "block" : "none" }}
      >
        <div className={styles.sectionStateBar}>
          <span className={styles.sectionStateLabel}>State</span>
          <div className={styles.sectionStateBtns}>
            <button
              className={`${styles.sectionStateBtn} ${tableSlice === "as-is" ? styles.sectionStateBtnActive : ""}`}
              onClick={() => setTableSlice("as-is")}
            >
              As-Is
            </button>
            <button
              className={`${styles.sectionStateBtn} ${tableSlice === "to-be" ? styles.sectionStateBtnActive : ""}`}
              onClick={() => setTableSlice("to-be")}
              disabled={!toBeData}
              title={!toBeData ? "Initialize To-Be state in the Hierarchy tab first" : undefined}
            >
              To-Be
            </button>
          </div>
          {tableSlice === "to-be" && toBeData && (
            <span className={styles.sectionStateLabel} style={{ marginLeft: 8 }}>
              {toBeFile ? toBeFile.name : "Copied from As-Is · hierarchy edits applied"}
            </span>
          )}
        </div>
        <TableView
          data={tableData}
          file={tableFile}
          jumpToId={tableJumpId}
          onJumpComplete={() => setTableJumpId(null)}
          externalRows={studioMutatedRows ?? excelRows}
          onRowsChange={(rows, meta) => handleSharedRowsChange(rows, { ...meta, target: tableSlice })}
        />
      </div>

      {/* ── 06 Comp Setup — shared ── */}
      <div data-view="comp" style={{ display: activeTab === "comp" ? "block" : "none" }}>
        <CompMatrixView data={data} onDataChange={handleCompDataChange} />
      </div>

      {/* ── 07 Data Readiness ── */}
      {excelFile && (
        <div data-view="readiness" style={{ display: activeTab === "readiness" ? "block" : "none" }}>
          <DataReadinessView
            file={excelFile}
            onNavigateToEmployee={(rowId) => {
              setActiveTab("table");
              setTableJumpId(rowId);
            }}
          />
        </div>
      )}

      {/* ── 08 AI Assistant ── */}
      <div data-view="ai" style={{ display: activeTab === "ai" ? "block" : "none" }}>
        <AIAssistantView
          data={data}
          rows={studioMutatedRows ?? excelRows ?? []}
          onRowsChange={(rows, meta) => handleSharedRowsChange(rows, { ...meta, target: "as-is" })}
          onCreateChart={req => { setPendingChartRequest(req); setActiveTab('studio'); }}
          onDataChange={handleCompDataChange}
          toBeData={toBeData}
          onRowMutation={handleRowMutation}
          onFieldMapping={handleFieldMapping}
          columnMapping={columnMapping}
        />
      </div>

      <footer className={styles.footer}>
        <div>Confidential · Internal Analytics · 2026</div>
        <div>menu-tech / item-vista · snapshot.v1</div>
      </footer>
    </div>
  );
}

// ── Target State Analysis ──
interface MetricDef {
  key: string;
  label: string;
  value: (m: StateMetrics) => string;
  delta: (a: StateMetrics, b: StateMetrics) => string;
  deltaSign: (a: StateMetrics, b: StateMetrics) => "pos" | "neg" | "zero";
}

const METRIC_DEFS: MetricDef[] = [
  {
    key: "span",
    label: "Avg Span",
    value: m => m.avgSpan.toFixed(2),
    delta: (a, b) => {
      const d = b.avgSpan - a.avgSpan;
      return (d >= 0 ? "+" : "") + d.toFixed(2);
    },
    deltaSign: (a, b) => {
      const d = b.avgSpan - a.avgSpan;
      return d === 0 ? "zero" : d > 0 ? "pos" : "neg";
    },
  },
  {
    key: "layers",
    label: "Layers",
    value: m => String(m.layers),
    delta: (a, b) => {
      const d = b.layers - a.layers;
      return (d >= 0 ? "+" : "") + d;
    },
    deltaSign: (a, b) => {
      const d = b.layers - a.layers;
      return d === 0 ? "zero" : d < 0 ? "pos" : "neg"; // fewer layers = good
    },
  },
  {
    key: "cost",
    label: "Total Cost",
    value: m => m.totalCost != null ? fmtCost(m.totalCost) : "—",
    delta: (a, b) => {
      if (a.totalCost == null || b.totalCost == null) return "—";
      const pct = a.totalCost !== 0 ? ((b.totalCost - a.totalCost) / a.totalCost) * 100 : 0;
      return (pct >= 0 ? "+" : "") + pct.toFixed(1) + "%";
    },
    deltaSign: (a, b) => {
      if (a.totalCost == null || b.totalCost == null) return "zero";
      const d = b.totalCost - a.totalCost;
      return d === 0 ? "zero" : d < 0 ? "pos" : "neg"; // lower cost = good
    },
  },
  {
    key: "ic",
    label: "IC Ratio",
    value: m => m.icRatio.toFixed(0) + "%",
    delta: (a, b) => {
      const d = b.icRatio - a.icRatio;
      return (d >= 0 ? "+" : "") + d.toFixed(1) + "pp";
    },
    deltaSign: (a, b) => {
      const d = b.icRatio - a.icRatio;
      return d === 0 ? "zero" : "zero"; // neutral — direction depends on org goals
    },
  },
  {
    key: "hc",
    label: "Headcount",
    value: m => m.headcount.toLocaleString(),
    delta: (a, b) => {
      const d = b.headcount - a.headcount;
      return (d >= 0 ? "+" : "") + d.toLocaleString();
    },
    deltaSign: (a, b) => {
      const d = b.headcount - a.headcount;
      return d === 0 ? "zero" : "zero"; // neutral
    },
  },
  {
    key: "mgr",
    label: "Mgr Ratio",
    value: m => m.mgrRatio.toFixed(0) + "%",
    delta: (a, b) => {
      const d = b.mgrRatio - a.mgrRatio;
      return (d >= 0 ? "+" : "") + d.toFixed(1) + "pp";
    },
    deltaSign: (a, b) => {
      const d = b.mgrRatio - a.mgrRatio;
      return d === 0 ? "zero" : d < 0 ? "pos" : "neg"; // lower mgr ratio = leaner
    },
  },
];

function TargetStateAnalysis({ asIs, toBe }: { asIs: StateMetrics; toBe: StateMetrics | null }) {
  const ref = toBe ?? asIs;
  return (
    <div className={styles.targetAnalysis}>
      <div className={styles.targetAnalysisHeader}>
        <span className={styles.targetAnalysisTitle}>Target State Analysis</span>
        {!toBe && (
          <span className={styles.targetAnalysisNote}>
            Initialize To-Be state above to see deltas
          </span>
        )}
      </div>
      <div className={styles.metricStrip}>
        {METRIC_DEFS.map(def => {
          const deltaStr  = toBe ? def.delta(asIs, toBe) : "±0";
          const sign      = toBe ? def.deltaSign(asIs, toBe) : "zero";
          const isZero    = deltaStr === "±0" || deltaStr === "+0" || deltaStr === "+0.0%" || deltaStr === "+0.00" || deltaStr === "+0pp" || deltaStr === "+0.0pp";
          return (
            <div key={def.key} className={styles.metricCard}>
              <div className={styles.metricLabel}>{def.label}</div>
              <div className={styles.metricRow}>
                <span className={styles.metricAsIs}>{def.value(asIs)}</span>
                {toBe && def.value(toBe) !== def.value(asIs) && (
                  <span className={styles.metricToBe}>{def.value(ref)}</span>
                )}
              </div>
              <div className={`${styles.metricDelta} ${sign === "pos" && !isZero ? styles.metricDeltaPos : sign === "neg" && !isZero ? styles.metricDeltaNeg : ""}`}>
                {toBe ? deltaStr : <span className={styles.metricDeltaZero}>±0</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── To-Be Empty State ──
function ToBeEmptyState({
  onCopy,
  onUpload,
  hasAsIsFile,
}: {
  onCopy: () => void;
  onUpload: () => void;
  hasAsIsFile: boolean;
}) {
  return (
    <div className={styles.toBeEmpty}>
      <div className={styles.toBeEmptyTitle}>To-Be state is empty</div>
      <div className={styles.toBeEmptySub}>
        Choose how to initialize the target state
      </div>
      <div className={styles.toBeEmptyActions}>
        <button className={styles.toBeEmptyBtn} onClick={onCopy}>
          <span className={styles.toBeEmptyBtnIcon}>⎘</span>
          <div className={styles.toBeEmptyBtnText}>
            <b>Copy from As-Is</b>
            <small>Start with current state as baseline, then edit the hierarchy</small>
          </div>
        </button>
        {hasAsIsFile && (
          <button className={styles.toBeEmptyBtn} onClick={onUpload}>
            <span className={styles.toBeEmptyBtnIcon}>↑</span>
            <div className={styles.toBeEmptyBtnText}>
              <b>Upload Excel</b>
              <small>Must have same columns as As-Is · rows can vary</small>
            </div>
          </button>
        )}
      </div>
    </div>
  );
}

function ShellSkeleton() {
  return (
    <>
      <header className={styles.header}>
        <div className={styles.brandmark}>
          <div className={styles.bar} />
          <div className={styles.brandName}>Org Analytics · Menu Tech</div>
        </div>
      </header>
      <h1 className={styles.title}>
        Org design <em>by the numbers</em>
      </h1>
      <p className={styles.subtitle}>Upload an org chart to get started.</p>
    </>
  );
}
