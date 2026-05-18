'use client';

import { useEffect, useMemo, useState } from 'react';
import type { DashboardData } from '@/lib/types';
import { parseExcelFile, type ExcelRow } from '@/lib/parseExcel';
import {
  COST_SCHEMA, type CostKey,
  LOADED_COMPONENTS, TRANSITION_COMPONENTS, COST_LABELS,
  GROSS_SALARY_ALIASES, JOB_FAMILY_ALIASES,
  EMPLOYEE_NAME_ALIASES, EMPLOYEE_ID_ALIASES,
  detectCostColumns, detectColumn, fmtNum,
} from '@/lib/costSchema';
import styles from './AdvancedAnalyticsView.module.css';
import type { PendingData } from '@/lib/story/types';

const FTE_ALIASES = [
  'fte', 'full_time_equivalent', 'fulltime_equivalent', 'fte_count', 'headcount_fte',
] as const;

const MONTHLY_COST_ALIASES = [
  'monthly_cost', 'monthly_salary', 'monthly_pay', 'monthly_compensation',
  'monthly_ctc', 'monthly_gross',
] as const;

// ─── helpers ───────────────────────────────────────────────────────────────

function normName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z\s]/g, '');
}

function median(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  return n % 2 === 0
    ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
    : sorted[Math.floor(n / 2)];
}

function numVal(v: ExcelRow[string]): number | null {
  const n = Number(v);
  return isNaN(n) ? null : n;
}

// ─── structural computations (pure DashboardData) ─────────────────────────

interface LayerStat {
  layer: number;
  managerCount: number;
  min: number; max: number; avg: number; med: number;
}

interface CompressionNode {
  id: string; name: string; role: string;
  kidId: string; kidName: string; kidRole: string;
}

interface FunctionSpreadManager {
  id: string; name: string; role: string;
  span: number; families: string[];
}

interface StructuralMetrics {
  layerStats: LayerStat[];
  lowSpanManagers: { id: string; name: string; role: string; span: number; depth: number }[];
  soloManagers: { id: string; name: string; role: string; span: number; depth: number }[];
  compressionNodes: CompressionNode[];
  orphans: { id: string; name: string; role: string }[];
  functionSpread: FunctionSpreadManager[];
  totalManagers: number;
}

interface DeptRow {
  dept: string;
  headcount: number;
  fte: number;
  openRoles: number;
  openRolesPct: number;
  avgSpan: number | null;
  maxDepth: number;
  costPerFte: number | null;
}

function computeStructural(data: DashboardData): StructuralMetrics {
  const { vertices, metrics } = data;
  const { span, depth, children, parent } = metrics;

  // Layer stats — managers only (span > 0)
  const layerGroups: Record<number, number[]> = {};
  for (const [id, s] of Object.entries(span)) {
    if (s === 0) continue;
    const d = depth[id] ?? 0;
    if (!layerGroups[d]) layerGroups[d] = [];
    layerGroups[d].push(s);
  }
  const layerStats: LayerStat[] = Object.entries(layerGroups)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([layer, spans]) => {
      const sorted = [...spans].sort((a, b) => a - b);
      const avg = sorted.reduce((s, v) => s + v, 0) / sorted.length;
      return {
        layer: Number(layer),
        managerCount: sorted.length,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        avg: Math.round(avg * 10) / 10,
        med: Math.round(median(sorted) * 10) / 10,
      };
    });

  // Low-span (1-3) and solo (1-2)
  const managerEntries = Object.entries(span)
    .filter(([, s]) => s > 0)
    .map(([id, s]) => ({
      id, span: s,
      depth: depth[id] ?? 0,
      name: vertices[id]?.display_name ?? id,
      role: vertices[id]?.role ?? '—',
    }));

  const lowSpanManagers = managerEntries
    .filter((m) => m.span <= 3)
    .sort((a, b) => a.span - b.span);

  const soloManagers = lowSpanManagers.filter((m) => m.span <= 2);

  // Layer compression: manager → exactly 1 report → who is also a manager
  const compressionNodes: CompressionNode[] = [];
  for (const [id, kids] of Object.entries(children)) {
    if (kids.length !== 1) continue;
    const kidId = kids[0];
    if ((children[kidId]?.length ?? 0) === 0) continue;
    // also only if the manager itself has a parent (not root pass-throughs of tiny orgs)
    if (!parent[id]) continue;
    compressionNodes.push({
      id,
      name: vertices[id]?.display_name ?? id,
      role: vertices[id]?.role ?? '—',
      kidId,
      kidName: vertices[kidId]?.display_name ?? kidId,
      kidRole: vertices[kidId]?.role ?? '—',
    });
  }

  // Orphans: in vertex_lookup but not referenced by any edge
  const edgeIds = new Set<string>();
  for (const e of data.edges) {
    edgeIds.add(e.employee_temp_id);
    edgeIds.add(e.manager_temp_id);
  }
  const orphans = Object.entries(vertices)
    .filter(([id]) => !edgeIds.has(id))
    .map(([id, v]) => ({ id, name: v.display_name, role: v.role }));

  // Function spread: manager with 3+ distinct dept among direct reports
  const functionSpread: FunctionSpreadManager[] = [];
  for (const [id, kids] of Object.entries(children)) {
    if (kids.length === 0) continue;
    const depts = [
      ...new Set(
        kids.map((k) => vertices[k]?.dept).filter((d): d is string => !!d)
      ),
    ];
    if (depts.length >= 3) {
      functionSpread.push({
        id,
        name: vertices[id]?.display_name ?? id,
        role: vertices[id]?.role ?? '—',
        span: kids.length,
        families: depts,
      });
    }
  }

  const totalManagers = managerEntries.length;

  return { layerStats, lowSpanManagers, soloManagers, compressionNodes, orphans, functionSpread, totalManagers };
}

// ─── cost computation ─────────────────────────────────────────────────────

interface CostSummary {
  loadedTotal: number;
  transitionTotal: number;
  perEmployeeLoaded: number;
  perEmployeeTransition: number;
  detected: Partial<Record<CostKey, string>>;
  rowCount: number;
}

function computeCosts(
  rows: ExcelRow[],
  colMap: Partial<Record<CostKey, string>>,
  enabled: Set<CostKey>,
): CostSummary {
  let loadedTotal = 0;
  let transitionTotal = 0;

  for (const row of rows) {
    for (const key of LOADED_COMPONENTS) {
      if (!enabled.has(key)) continue;
      const col = colMap[key];
      if (!col) continue;
      const n = numVal(row[col]);
      if (n !== null) loadedTotal += n;
    }
    for (const key of TRANSITION_COMPONENTS) {
      if (!enabled.has(key)) continue;
      const col = colMap[key];
      if (!col) continue;
      const n = numVal(row[col]);
      if (n !== null) transitionTotal += n;
    }
  }

  const rowCount = rows.length;
  return {
    loadedTotal,
    transitionTotal,
    perEmployeeLoaded: rowCount > 0 ? loadedTotal / rowCount : 0,
    perEmployeeTransition: rowCount > 0 ? transitionTotal / rowCount : 0,
    detected: colMap,
    rowCount,
  };
}

// ─── anomalous salary reporting ───────────────────────────────────────────

interface AnomalousEntry {
  empId: string; empName: string; empRole: string; empSalary: number;
  mgrId: string; mgrName: string; mgrRole: string; mgrSalary: number;
  delta: number;
}

function findAnomalous(
  data: DashboardData,
  rows: ExcelRow[],
  grossCol: string,
  nameCol: string | null,
  idCol: string | null,
): AnomalousEntry[] {
  // build salary map: normalised_name → salary, and id → salary
  const bySalaryName = new Map<string, number>();
  const bySalaryId = new Map<string, number>();

  for (const row of rows) {
    const sal = numVal(row[grossCol]);
    if (sal === null || sal <= 0) continue;
    if (nameCol) {
      const n = normName(String(row[nameCol] ?? ''));
      if (n) bySalaryName.set(n, sal);
    }
    if (idCol) {
      const id = String(row[idCol] ?? '').trim().toLowerCase();
      if (id) bySalaryId.set(id, sal);
    }
  }

  const getSalary = (tempId: string): number | null => {
    const v = data.vertices[tempId];
    if (!v) return null;
    if (idCol && v.id) {
      const s = bySalaryId.get(v.id.toLowerCase());
      if (s !== undefined) return s;
    }
    if (nameCol) {
      const s = bySalaryName.get(normName(v.display_name));
      if (s !== undefined) return s;
    }
    return null;
  };

  const result: AnomalousEntry[] = [];
  for (const [empId, mgrId] of Object.entries(data.metrics.parent)) {
    const empSal = getSalary(empId);
    const mgrSal = getSalary(mgrId);
    if (empSal === null || mgrSal === null) continue;
    if (empSal >= mgrSal) {
      result.push({
        empId, empName: data.vertices[empId]?.display_name ?? empId,
        empRole: data.vertices[empId]?.role ?? '—', empSalary: empSal,
        mgrId, mgrName: data.vertices[mgrId]?.display_name ?? mgrId,
        mgrRole: data.vertices[mgrId]?.role ?? '—', mgrSalary: mgrSal,
        delta: empSal - mgrSal,
      });
    }
  }
  return result.sort((a, b) => b.delta - a.delta);
}

// ─── tenure stats ─────────────────────────────────────────────────────────

interface TenureStats {
  avg: number; med: number; min: number; max: number;
  unit: string; count: number;
}

function computeTenure(rows: ExcelRow[], col: string): TenureStats | null {
  const vals = rows.map((r) => numVal(r[col])).filter((v): v is number => v !== null && v > 0);
  if (vals.length === 0) return null;
  const sorted = [...vals].sort((a, b) => a - b);
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
  // If median > 60 → likely months; convert to years
  const rawMed = median(sorted);
  const unit = rawMed > 60 ? 'months' : 'years';
  const div = unit === 'months' ? 12 : 1;
  return {
    avg: Math.round((avg / div) * 10) / 10,
    med: Math.round((rawMed / div) * 10) / 10,
    min: Math.round((sorted[0] / div) * 10) / 10,
    max: Math.round((sorted[sorted.length - 1] / div) * 10) / 10,
    unit: 'years', count: vals.length,
  };
}

// ─── department analysis ──────────────────────────────────────────────────

function computeDeptAnalysis(
  data: DashboardData,
  rows: ExcelRow[],
  fteCol: string | null,
  annualCostCol: string | null,
  monthlyCol: string | null,
  nameCol: string | null,
  idCol: string | null,
): DeptRow[] {
  const { vertices, metrics } = data;
  const { span, depth } = metrics;
  const UNASSIGNED = '(No Department)';

  const byId   = new Map<string, { fte: number; cost: number }>();
  const byName = new Map<string, { fte: number; cost: number }>();
  const hasCostCol = !!(annualCostCol || monthlyCol);
  const hasExcel   = rows.length > 0;

  for (const row of rows) {
    const fte  = fteCol ? (numVal(row[fteCol]) ?? 1) : 1;
    let   cost = 0;
    if (annualCostCol)      cost = numVal(row[annualCostCol]) ?? 0;
    else if (monthlyCol)    cost = (numVal(row[monthlyCol]) ?? 0) * 12;
    if (idCol)   { const id = String(row[idCol]   ?? '').trim().toLowerCase(); if (id) byId.set(id, { fte, cost }); }
    if (nameCol) { const n  = normName(String(row[nameCol] ?? ''));             if (n)  byName.set(n, { fte, cost }); }
  }

  const getExcel = (vid: string): { fte: number; cost: number } | null => {
    const v = vertices[vid];
    if (!v) return null;
    if (idCol && v.id) { const d = byId.get(v.id.toLowerCase()); if (d) return d; }
    if (nameCol)       { const d = byName.get(normName(v.display_name)); if (d) return d; }
    return null;
  };

  type Acc = { headcount: number; fte: number; openRoles: number; spanSum: number; spanCount: number; maxDepth: number; totalCost: number };
  const groups = new Map<string, Acc>();

  for (const [vid, v] of Object.entries(vertices)) {
    const key = v.dept || UNASSIGNED;
    if (!groups.has(key)) groups.set(key, { headcount: 0, fte: 0, openRoles: 0, spanSum: 0, spanCount: 0, maxDepth: 0, totalCost: 0 });
    const g = groups.get(key)!;
    g.headcount++;
    if (v.open_role) g.openRoles++;
    const d = depth[vid] ?? 0;
    if (d > g.maxDepth) g.maxDepth = d;
    const s = span[vid] ?? 0;
    if (s > 0) { g.spanSum += s; g.spanCount++; }
    const ex = getExcel(vid);
    g.fte       += ex?.fte  ?? 1;
    g.totalCost += ex?.cost ?? 0;
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a === UNASSIGNED ? 1 : b === UNASSIGNED ? -1 : a.localeCompare(b))
    .map(([dept, g]) => ({
      dept,
      headcount: g.headcount,
      fte: Math.round(g.fte * 10) / 10,
      openRoles: g.openRoles,
      openRolesPct: g.headcount > 0 ? Math.round((g.openRoles / g.headcount) * 100) : 0,
      avgSpan: g.spanCount > 0 ? Math.round((g.spanSum / g.spanCount) * 10) / 10 : null,
      maxDepth: g.maxDepth,
      costPerFte: (hasExcel && hasCostCol && g.fte > 0) ? Math.round(g.totalCost / g.fte) : null,
    }));
}

// ─── sub-components ───────────────────────────────────────────────────────

function SectionHeader({ num, title, sub }: { num: string; title: string; sub?: string }) {
  return (
    <div className={styles.secHeader}>
      <div className={styles.secBar} />
      <div>
        <div className={styles.secNum}>{num}</div>
        <h2 className={styles.secTitle}>{title}</h2>
        {sub && <p className={styles.secSub}>{sub}</p>}
      </div>
    </div>
  );
}

function StatPill({ label, value, accent }: { label: string; value: string | number; accent?: 'red' | 'green' | 'amber' }) {
  return (
    <div className={styles.pill}>
      <div className={`${styles.pillVal} ${accent ? styles['pillVal_' + accent] : ''}`}>{value}</div>
      <div className={styles.pillLabel}>{label}</div>
    </div>
  );
}

// Span candlestick chart
function SpanChart({ layerStats }: { layerStats: LayerStat[] }) {
  if (layerStats.length === 0) return null;
  const globalMax = Math.max(...layerStats.map((l) => l.max), 1);
  const H = 160; // px chart inner height

  const pct = (v: number) => `${((v / globalMax) * H).toFixed(1)}px`;
  const spanColor = (avg: number) =>
    avg < 3 ? 'var(--red)' : avg <= 6 ? 'var(--teal)' : 'var(--accent)';

  return (
    <div className={styles.chartWrap}>
      <div className={styles.chartInner}>
        {/* Y-axis labels */}
        <div className={styles.yAxis}>
          {[globalMax, Math.round(globalMax / 2), 0].map((v) => (
            <span key={v} className={styles.yLabel}>{v}</span>
          ))}
        </div>

      <div className={styles.chartArea}>
        {layerStats.map((l) => (
          <div key={l.layer} className={styles.candleCol}>
            {/* stem from min to max */}
            <div
              className={styles.stem}
              style={{
                bottom: pct(l.min),
                height: pct(l.max - l.min),
              }}
            />
            {/* avg bar from 0 to avg */}
            <div
              className={styles.avgBar}
              style={{
                height: pct(l.avg),
                background: spanColor(l.avg),
              }}
            />
            {/* median tick */}
            <div className={styles.medTick} style={{ bottom: pct(l.med) }} />
            {/* min/max caps */}
            <div className={styles.cap} style={{ bottom: pct(l.min) }} />
            <div className={styles.cap} style={{ bottom: pct(l.max) }} />
            <div className={styles.candleLabel}>L{l.layer}</div>
          </div>
        ))}
      </div>
      </div>{/* end chartInner */}

      {/* Legend */}
      <div className={styles.chartLegend}>
        <span><span className={styles.legendBox} style={{ background: 'var(--teal)' }} /> Avg span</span>
        <span><span className={styles.legendLine} style={{ background: 'var(--olive)' }} /> Median</span>
        <span><span className={styles.legendLine} style={{ background: 'rgba(0,0,0,0.2)' }} /> Min–Max range</span>
      </div>
    </div>
  );
}

// ─── main component ────────────────────────────────────────────────────────

interface Props {
  data: DashboardData;
  file?: File | null;
  sourceRows?: ExcelRow[];
  onAddToStory?: (data: PendingData) => void;
}

export default function AdvancedAnalyticsView({ data, file, sourceRows, onAddToStory }: Props) {
  const [rows, setRows] = useState<ExcelRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [excelLoading, setExcelLoading] = useState(false);
  const [excelError, setExcelError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<Set<CostKey>>(
    new Set([...LOADED_COMPONENTS, ...TRANSITION_COMPONENTS]),
  );

  useEffect(() => {
    if (sourceRows) {
      setRows(sourceRows);
      setHeaders(sourceRows.length > 0 ? Object.keys(sourceRows[0]) : []);
      setExcelLoading(false);
      setExcelError(null);
      return;
    }
    if (!file) { setRows([]); setHeaders([]); return; }
    setExcelLoading(true);
    setExcelError(null);
    parseExcelFile(file)
      .then((parsed) => {
        setRows(parsed);
        setHeaders(parsed.length > 0 ? Object.keys(parsed[0]) : []);
        setExcelLoading(false);
      })
      .catch((err: unknown) => {
        setExcelError(err instanceof Error ? err.message : 'Parse error');
        setExcelLoading(false);
      });
  }, [file, sourceRows]);

  const colMap       = useMemo(() => detectCostColumns(headers), [headers]);
  const grossCol     = useMemo(() => detectColumn(headers, GROSS_SALARY_ALIASES), [headers]);
  const fteCol       = useMemo(() => detectColumn(headers, FTE_ALIASES), [headers]);
  const monthlyCol   = useMemo(() => detectColumn(headers, MONTHLY_COST_ALIASES), [headers]);
  const jobFamCol    = useMemo(() => detectColumn(headers, JOB_FAMILY_ALIASES), [headers]);
  const nameCol      = useMemo(() => detectColumn(headers, EMPLOYEE_NAME_ALIASES), [headers]);
  const idCol        = useMemo(() => detectColumn(headers, EMPLOYEE_ID_ALIASES), [headers]);

  const structural   = useMemo(() => computeStructural(data), [data]);
  const costs        = useMemo(() => rows.length ? computeCosts(rows, colMap, enabled) : null, [rows, colMap, enabled]);
  const anomalous    = useMemo(() => (rows.length && grossCol) ? findAnomalous(data, rows, grossCol, nameCol, idCol) : [], [data, rows, grossCol, nameCol, idCol]);
  const deptAnalysis = useMemo(() => computeDeptAnalysis(data, rows, fteCol, grossCol, monthlyCol, nameCol, idCol), [data, rows, fteCol, grossCol, monthlyCol, nameCol, idCol]);

  const toggleCost = (key: CostKey) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const detectedCostKeys = (Object.keys(COST_SCHEMA) as CostKey[]).filter((k) => colMap[k]);
  const missingLoadedCols = LOADED_COMPONENTS.filter((k) => !colMap[k]);
  const missingTransCols  = TRANSITION_COMPONENTS.filter((k) => !colMap[k]);

  // Detect job family from excel for function spread (override dept if available)
  const excelFamilyMap = useMemo(() => {
    if (!jobFamCol || !nameCol || rows.length === 0) return null;
    const m = new Map<string, string>();
    for (const row of rows) {
      const n = normName(String(row[nameCol] ?? ''));
      const fam = String(row[jobFamCol] ?? '').trim();
      if (n && fam) m.set(n, fam);
    }
    return m;
  }, [rows, jobFamCol, nameCol]);

  // Enrich function spread with excel job families if available
  const enrichedFuncSpread = useMemo(() => {
    if (!excelFamilyMap) return structural.functionSpread;
    return structural.functionSpread.map((mgr) => {
      const kids = data.metrics.children[mgr.id] ?? [];
      const families = [
        ...new Set(
          kids.map((kid) => {
            const name = normName(data.vertices[kid]?.display_name ?? '');
            return excelFamilyMap.get(name) || data.vertices[kid]?.dept || null;
          }).filter(Boolean) as string[]
        ),
      ];
      return families.length >= 3 ? { ...mgr, families } : null;
    }).filter((m): m is FunctionSpreadManager => m !== null && m.families.length >= 3);
  }, [structural.functionSpread, excelFamilyMap, data]);

  return (
    <div className={styles.wrap}>

      {/* ══════════════════════════════════════════════
          1 · SPAN OF CONTROL
      ══════════════════════════════════════════════ */}
      <section className={styles.section}>
        <SectionHeader
          num="01"
          title="Span of Control"
          sub="Average direct reports per manager, broken down by org layer."
        />

        <SpanChart layerStats={structural.layerStats} />

        {/* Layer table */}
        {onAddToStory && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
            <button
              onClick={() => {
                const now = new Date().toISOString();
                onAddToStory({
                  rows: structural.layerStats.map(l => ({
                    Layer: `L${l.layer}`,
                    Managers: l.managerCount,
                    Min: l.min,
                    Max: l.max,
                    Median: l.med,
                    Avg: l.avg,
                  })),
                  columns: ['Layer', 'Managers', 'Min', 'Max', 'Median', 'Avg'],
                  source: { type: 'org-metrics', label: 'Span of Control by Layer', capturedAt: now },
                  label: 'Span of Control by Layer',
                });
              }}
              style={{
                background: 'none', border: '1px solid rgba(0,107,107,0.35)',
                borderRadius: 3, padding: '3px 10px', fontSize: 11,
                color: 'var(--teal, #006b6b)', cursor: 'pointer', fontWeight: 500,
              }}
            >
              + Story
            </button>
          </div>
        )}
        <div className={styles.dataTable}>
          <div className={styles.dtHead}>
            <div className={styles.dtCell}>Layer</div>
            <div className={styles.dtCell}>Managers</div>
            <div className={styles.dtCell}>Min</div>
            <div className={styles.dtCell}>Max</div>
            <div className={styles.dtCell}>Median</div>
            <div className={styles.dtCell}>Avg</div>
          </div>
          {structural.layerStats.map((l) => (
            <div key={l.layer} className={styles.dtRow}>
              <div className={styles.dtCell}><span className={styles.layerTag}>L{l.layer}</span></div>
              <div className={styles.dtCell}>{l.managerCount}</div>
              <div className={`${styles.dtCell} ${l.min <= 2 ? styles.red : ''}`}>{l.min}</div>
              <div className={`${styles.dtCell} ${l.max >= 8 ? styles.amber : ''}`}>{l.max}</div>
              <div className={styles.dtCell}>{l.med}</div>
              <div className={`${styles.dtCell} ${styles.bold}`}>{l.avg}</div>
            </div>
          ))}
        </div>

        {/* Low-span callout */}
        {structural.lowSpanManagers.length > 0 && (
          <div className={styles.callout}>
            <span className={styles.calloutLabel}>Low-span managers (1–3 reports)</span>
            <span className={styles.calloutBadge}>{structural.lowSpanManagers.length}</span>
            <span className={styles.calloutSub}>
              {((structural.lowSpanManagers.length / structural.totalManagers) * 100).toFixed(0)}% of all managers
            </span>
          </div>
        )}
      </section>

      {/* ══════════════════════════════════════════════
          2 · STRUCTURAL PATTERNS
      ══════════════════════════════════════════════ */}
      <section className={styles.section}>
        <SectionHeader
          num="02"
          title="Structural Patterns"
          sub="Design issues that affect org efficiency and role clarity."
        />

        <div className={styles.patternGrid}>

          {/* Solo managers */}
          <div className={styles.patternCard}>
            <div className={styles.patternCardHead}>
              <span className={styles.patternNum}>{structural.soloManagers.length}</span>
              <div>
                <div className={styles.patternTitle}>Solo Reporting Managers</div>
                <div className={styles.patternSub}>Managers with only 1–2 direct reports — structural underutilization</div>
              </div>
            </div>
            {structural.soloManagers.length > 0 && (
              <div className={styles.miniList}>
                {structural.soloManagers.map((m) => (
                  <div key={m.id} className={styles.miniItem}>
                    <span className={styles.miniName}>{m.name}</span>
                    <span className={styles.miniRole}>{m.role}</span>
                    <span className={styles.spanDot} data-span={m.span}>{m.span}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Layer compression */}
          <div className={styles.patternCard}>
            <div className={styles.patternCardHead}>
              <span className={styles.patternNum}>{structural.compressionNodes.length}</span>
              <div>
                <div className={styles.patternTitle}>Single-Insertion Layers</div>
                <div className={styles.patternSub}>Manager → 1 report → also a manager (pass-through layers)</div>
              </div>
            </div>
            {structural.compressionNodes.length > 0 && (
              <div className={styles.chainList}>
                {structural.compressionNodes.map((n) => (
                  <div key={n.id} className={styles.chainItem}>
                    <span className={styles.chainNode}>{n.name}</span>
                    <span className={styles.chainArrow}>→</span>
                    <span className={styles.chainNode}>{n.kidName}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Function spread */}
        {enrichedFuncSpread.length > 0 && (
          <div className={styles.subSection}>
            <div className={styles.subSecLabel}>
              Function Spread
              <span className={styles.subSecBadge}>{enrichedFuncSpread.length} managers across 3+ job families</span>
            </div>
            <div className={styles.dataTable}>
              <div className={styles.dtHead}>
                <div className={styles.dtCell} style={{ flex: 2 }}>Manager</div>
                <div className={styles.dtCell}>Role</div>
                <div className={styles.dtCell}>Span</div>
                <div className={styles.dtCell} style={{ flex: 3 }}>Job Families</div>
              </div>
              <div className={styles.dtScrollBody}>
                {enrichedFuncSpread.map((m) => (
                  <div key={m.id} className={styles.dtRow}>
                    <div className={styles.dtCell} style={{ flex: 2 }}>{m.name}</div>
                    <div className={styles.dtCell}><span className={styles.roleTag}>{m.role}</span></div>
                    <div className={styles.dtCell}>{m.span}</div>
                    <div className={styles.dtCell} style={{ flex: 3 }}>
                      <div className={styles.tagRow}>
                        {m.families.map((f) => <span key={f} className={styles.famTag}>{f}</span>)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ══════════════════════════════════════════════
          3 · DEPARTMENT ANALYSIS
      ══════════════════════════════════════════════ */}
      <section className={styles.section}>
        <SectionHeader
          num="03"
          title="Department Analysis"
          sub="Headcount, open roles, span of control, depth, and cost per FTE grouped by department."
        />

        {onAddToStory && deptAnalysis.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
            <button
              onClick={() => {
                const now = new Date().toISOString();
                onAddToStory({
                  rows: deptAnalysis.map(r => ({
                    Department: r.dept,
                    Headcount: r.headcount,
                    FTE: r.fte,
                    'Open Roles': r.openRoles,
                    'Avg Span': r.avgSpan ?? '—',
                    'Max Depth': r.maxDepth,
                    'Cost/FTE': r.costPerFte ?? '—',
                  })),
                  columns: ['Department', 'Headcount', 'FTE', 'Open Roles', 'Avg Span', 'Max Depth', 'Cost/FTE'],
                  source: { type: 'org-metrics', label: 'Department Analysis', capturedAt: now },
                  label: 'Department Analysis',
                });
              }}
              style={{
                background: 'none', border: '1px solid rgba(0,107,107,0.35)',
                borderRadius: 3, padding: '3px 10px', fontSize: 11,
                color: 'var(--teal, #006b6b)', cursor: 'pointer', fontWeight: 500,
              }}
            >
              + Story
            </button>
          </div>
        )}
        <div className={styles.dataTable}>
          <div className={styles.dtHead}>
            <div className={styles.dtCell} style={{ flex: 2 }}>Department</div>
            <div className={styles.dtCell}>Headcount</div>
            <div className={styles.dtCell}>FTE</div>
            <div className={styles.dtCell}>Open Roles</div>
            <div className={styles.dtCell}>Avg Span</div>
            <div className={styles.dtCell}>Max Depth</div>
            <div className={styles.dtCell}>Cost / FTE</div>
          </div>
          <div className={styles.dtScrollBody}>
            {deptAnalysis.map((row) => (
              <div key={row.dept} className={styles.dtRow}>
                <div className={styles.dtCell} style={{ flex: 2 }}>
                  {row.dept === '(No Department)'
                    ? <span className={styles.deptNone}>{row.dept}</span>
                    : row.dept}
                </div>
                <div className={`${styles.dtCell} ${styles.bold}`}>{row.headcount}</div>
                <div className={styles.dtCell}>{row.fte}</div>
                <div className={styles.dtCell}>
                  {row.openRoles > 0
                    ? <>{row.openRoles} <span className={styles.pctLabel}>({row.openRolesPct}%)</span></>
                    : 0}
                </div>
                <div className={styles.dtCell}>
                  {row.avgSpan !== null ? row.avgSpan : <span className={styles.deptDash}>—</span>}
                </div>
                <div className={styles.dtCell}>{row.maxDepth}</div>
                <div className={`${styles.dtCell} ${styles.bold}`}>
                  {row.costPerFte !== null ? fmtNum(row.costPerFte) : <span className={styles.deptDash}>—</span>}
                </div>
              </div>
            ))}
            {deptAnalysis.length === 0 && (
              <div className={styles.dtRow}>
                <div className={styles.dtCell} style={{ color: 'var(--slate-light)', fontStyle: 'italic' }}>
                  No department data available
                </div>
              </div>
            )}
          </div>
        </div>

        {!file && (
          <p className={styles.hint}>Upload an Excel file to populate FTE and Cost / FTE columns.</p>
        )}
      </section>

      {/* ══════════════════════════════════════════════
          4 · COST ANALYSIS
      ══════════════════════════════════════════════ */}
      <section className={styles.section}>
        <SectionHeader
          num="04"
          title="Cost Analysis"
          sub="Loaded cost per headcount and workforce transition cost, detected from your file."
        />

        {!file && (
          <div className={styles.noFileBox}>
            Upload an Excel file with salary and benefits data to enable cost analysis.
          </div>
        )}

        {file && excelLoading && (
          <div className={styles.inlineLoader}><div className={styles.drSpinner} /> Parsing file…</div>
        )}

        {file && excelError && (
          <div className={styles.errorBox}>{excelError}</div>
        )}

        {file && !excelLoading && !excelError && (
          <>
            {/* Column mapping + toggles */}
            <div className={styles.costConfigWrap}>
              <div className={styles.costGroup}>
                <div className={styles.costGroupLabel}>Loaded Cost Components</div>
                <div className={styles.costCols}>
                  {LOADED_COMPONENTS.map((key) => {
                    const col = colMap[key];
                    const on = enabled.has(key);
                    return (
                      <label key={key} className={`${styles.costRow} ${!col ? styles.costRowMissing : ''} ${on ? '' : styles.costRowOff}`}>
                        <input
                          type="checkbox"
                          className={styles.checkbox}
                          checked={on && !!col}
                          disabled={!col}
                          onChange={() => col && toggleCost(key)}
                        />
                        <span className={styles.costLabel}>{COST_LABELS[key]}</span>
                        {col
                          ? <span className={styles.colFound}>→ {col}</span>
                          : <span className={styles.colMissing}>not detected</span>}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className={styles.costGroup}>
                <div className={styles.costGroupLabel}>Transition Cost Components</div>
                <div className={styles.costCols}>
                  {TRANSITION_COMPONENTS.map((key) => {
                    const col = colMap[key];
                    const on = enabled.has(key);
                    return (
                      <label key={key} className={`${styles.costRow} ${!col ? styles.costRowMissing : ''} ${on ? '' : styles.costRowOff}`}>
                        <input
                          type="checkbox"
                          className={styles.checkbox}
                          checked={on && !!col}
                          disabled={!col}
                          onChange={() => col && toggleCost(key)}
                        />
                        <span className={styles.costLabel}>{COST_LABELS[key]}</span>
                        {col
                          ? <span className={styles.colFound}>→ {col}</span>
                          : <span className={styles.colMissing}>not detected</span>}
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            {detectedCostKeys.length === 0 && (
              <p className={styles.hint}>
                No cost columns matched in this file. Check that column headers match
                expected names (e.g. "salary", "bonus", "pension", "recruitment_cost").
              </p>
            )}

            {/* Cost summary cards */}
            {costs && detectedCostKeys.length > 0 && (
              <div className={styles.costSummary}>
                <div className={styles.costCard}>
                  <div className={styles.costCardLabel}>Total Loaded Cost</div>
                  <div className={styles.costCardVal}>{fmtNum(costs.loadedTotal)}</div>
                  <div className={styles.costCardSub}>{fmtNum(costs.perEmployeeLoaded)} per employee · {costs.rowCount} people</div>
                  {missingLoadedCols.length > 0 && (
                    <div className={styles.costCardMissing}>
                      Missing: {missingLoadedCols.map((k) => COST_LABELS[k]).join(', ')}
                    </div>
                  )}
                </div>
                <div className={styles.costCard}>
                  <div className={styles.costCardLabel}>Total Transition Cost</div>
                  <div className={styles.costCardVal}>{fmtNum(costs.transitionTotal)}</div>
                  <div className={styles.costCardSub}>{fmtNum(costs.perEmployeeTransition)} per employee avg</div>
                  {missingTransCols.length > 0 && (
                    <div className={styles.costCardMissing}>
                      Missing: {missingTransCols.map((k) => COST_LABELS[k]).join(', ')}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* ══════════════════════════════════════════════
          5 · COMPENSATION ANOMALIES
      ══════════════════════════════════════════════ */}
      <section className={styles.section}>
        <SectionHeader
          num="05"
          title="Compensation Anomalies"
          sub="Direct reports whose gross salary meets or exceeds their manager's."
        />

        {!grossCol && file && !excelLoading && (
          <p className={styles.hint}>No gross salary column detected. Expected: total_annual_compensation, ctc, gross_salary, etc.</p>
        )}
        {!file && (
          <p className={styles.hint}>Upload an Excel file with salary data to detect compensation anomalies.</p>
        )}

        {anomalous.length === 0 && grossCol && (
          <div className={styles.allGoodBox}>
            No anomalies detected — all direct reports earn less than their manager.
          </div>
        )}

        {anomalous.length > 0 && (
          <>
            <div className={styles.anomalyCount}>
              <span className={styles.anomalyBadge}>{anomalous.length}</span>
              case{anomalous.length !== 1 ? 's' : ''} where direct report salary ≥ manager salary
            </div>
            <div className={styles.dataTable}>
              <div className={styles.dtHead}>
                <div className={styles.dtCell} style={{ flex: 2 }}>Employee</div>
                <div className={styles.dtCell}>Emp. Salary</div>
                <div className={styles.dtCell} style={{ flex: 2 }}>Manager</div>
                <div className={styles.dtCell}>Mgr. Salary</div>
                <div className={styles.dtCell}>Delta</div>
              </div>
              {anomalous.map((a, i) => (
                <div key={i} className={`${styles.dtRow} ${a.delta === 0 ? styles.dtRowWarn : styles.dtRowRed}`}>
                  <div className={styles.dtCell} style={{ flex: 2 }}>
                    <div>{a.empName}</div>
                    <div className={styles.smallRole}>{a.empRole}</div>
                  </div>
                  <div className={`${styles.dtCell} ${styles.bold}`}>{fmtNum(a.empSalary)}</div>
                  <div className={styles.dtCell} style={{ flex: 2 }}>
                    <div>{a.mgrName}</div>
                    <div className={styles.smallRole}>{a.mgrRole}</div>
                  </div>
                  <div className={styles.dtCell}>{fmtNum(a.mgrSalary)}</div>
                  <div className={`${styles.dtCell} ${styles.bold} ${a.delta > 0 ? styles.red : styles.amber}`}>
                    {a.delta === 0 ? 'Equal' : `+${fmtNum(a.delta)}`}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

    </div>
  );
}
