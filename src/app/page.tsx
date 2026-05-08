"use client";

import { useState, useRef, useCallback } from "react";
import type { DashboardData } from "@/lib/types";
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

type Tab = "summary" | "tree" | "table" | "readiness" | "advanced" | "studio" | "comp";
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
      const band = v.grade && v.geo ? d.compMatrix[v.grade]?.[v.geo] : null;
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

  // ── UI state ──
  const [activeTab, setActiveTab] = useState<Tab>("summary");
  const [downloading] = useState(false);
  const [studioSlice, setStudioSlice] = useState<StateSlice>("as-is");
  const [tableSlice, setTableSlice] = useState<StateSlice>("as-is");
  const shellRef = useRef<HTMLDivElement>(null);

  const TABS = excelFile ? [...BASE_TABS, READINESS_TAB] : BASE_TABS;

  // ── As-Is handlers ──
  const handleDataReady = useCallback((d: DashboardData) => {
    setData(d);
    setActiveTab("summary");
  }, []);

  const handleExcelFile = useCallback((f: File) => setExcelFile(f), []);

  const handleExcelParsed = useCallback((rows: ExcelRow[], headers: string[], mapping: ColumnMapping) => {
    setExcelRows(rows);
    setExcelHeaders(headers);
    setColumnMapping(mapping);
  }, []);

  const handleRemappingConfirm = useCallback(async (newMapping: ColumnMapping) => {
    setShowRemapping(false);
    if (!excelRows) return;
    const { buildHierarchyFromMapping } = await import("@/lib/buildHierarchy");
    setData(buildHierarchyFromMapping(excelRows, newMapping));
    setColumnMapping(newMapping);
  }, [excelRows]);

  const handleDataChange = useCallback((d: DashboardData) => setData(d), []);
  const handleToBeDataChange = useCallback((d: DashboardData) => setToBeData(d), []);

  // ── To-Be handlers ──
  const handleCopyFromAsIs = useCallback(() => {
    if (!data) return;
    setToBeData(JSON.parse(JSON.stringify(data)));
    setToBeFile(excelFile);
  }, [data, excelFile]);

  const handleToBeUploaded = useCallback((
    d: DashboardData,
    file: File,
  ) => {
    setToBeData(d);
    setToBeFile(file);
    setShowToBeUpload(false);
  }, []);

  const handleResetToBe = useCallback(() => {
    setToBeData(null);
    setToBeFile(null);
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
        <AnalyticsStudioView file={studioFile} data={studioData} />
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
        <TableView data={tableData} file={tableFile} />
      </div>

      {/* ── 06 Comp Setup — shared ── */}
      <div data-view="comp" style={{ display: activeTab === "comp" ? "block" : "none" }}>
        <CompMatrixView data={data} onDataChange={handleDataChange} />
      </div>

      {/* ── 07 Data Readiness ── */}
      {excelFile && (
        <div data-view="readiness" style={{ display: activeTab === "readiness" ? "block" : "none" }}>
          <DataReadinessView file={excelFile} />
        </div>
      )}

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
