"use client";

import { useMemo, useState } from "react";
import { fmtCost } from "@/lib/computeStateMetrics";
import {
  buildActivityAnalysisPortfolio,
  type ActivityAnalysisPortfolio,
  type ActivityAnalysisActivityMetric,
  type ActivityAnalysisEmployeeMetric,
  type ActivityAnalysisRiskFlag,
  type WorkCapabilityDataset,
} from "@/lib/workCapabilityDataset";
import type { ColumnMapping } from "@/lib/fieldDictionary";
import type { ExcelRow } from "@/lib/parseExcel";
import type { PendingData } from "@/lib/story/types";
import { downloadCsv } from "@/lib/utils";
import styles from "@/app/page.module.css";

type AnalysisProps = {
  dataset: WorkCapabilityDataset | null;
  orgRows: ExcelRow[];
  orgEmployeeIdColumn: string;
  columnMapping: ColumnMapping | null;
  embeddedMode?: boolean;
  embeddedSection?: "all" | "category-charts" | "portfolio-workload";
  onAddToStory?: (data: PendingData) => void;
};

const formatPct = (value: number) => `${value.toFixed(0)}%`;

const fmtCostDetail = (n: number): string => {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}k`;
  return `$${Math.round(n)}`;
};

const FLAG_WHY: Record<string, string> = {
  "Ownership gap": "no accountable or responsible owner is assigned",
  "Fragmented activity": "spans multiple departments or has many assignees",
  "High cost transactional work": "high-cost but transactional or routine nature",
  "Seniority mismatch": "assigned to employees above or below expected grade",
  "Automation candidate": "suitable for automation with potential cost savings",
  "Outsourcing caution": "may be outsourceable but carries delivery risk",
};

const STATUS_COLOR: Record<string, string> = {
  "Severe overload": "#c0392b",
  "Overload": "#e67e22",
  "Normal": "#27ae60",
  "Under-mapped": "#7f8c8d",
};

function csvEscape(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  if (text.includes(",") || text.includes("\n") || text.includes('"')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

const DRILLDOWN_SECTIONS = [
  { id: "ownership", label: "Ownership / RACI" },
  { id: "automation", label: "Automation Candidates" },
] as const;

type DrilldownId = (typeof DRILLDOWN_SECTIONS)[number]["id"];

const sectionLabel: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--slate)",
  fontWeight: 700,
};

const compactInput: React.CSSProperties = {
  fontSize: 11,
  padding: "4px 6px",
  border: "1px solid #d0d0d0",
  borderRadius: 4,
  background: "white",
  color: "var(--ink)",
  flex: "1 1 80px",
  minWidth: 0,
};

export default function ActivityAnalysisView({
  dataset,
  orgRows,
  orgEmployeeIdColumn,
  columnMapping,
  embeddedMode = false,
  embeddedSection = "all",
  onAddToStory,
}: AnalysisProps) {
  const [expandedSections, setExpandedSections] = useState<Set<DrilldownId>>(new Set());
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [adoptionPct, setAdoptionPct] = useState(25);

  // Activity portfolio filters
  const [activitySearch, setActivitySearch] = useState("");
  const [activityCategoryFilter, setActivityCategoryFilter] = useState("");
  const [activityCriticalityFilter, setActivityCriticalityFilter] = useState("");
  const [activityRiskFilter, setActivityRiskFilter] = useState("");

  // People & workload filters
  const [peopleSearch, setPeopleSearch] = useState("");
  const [peopleDeptFilter, setPeopleDeptFilter] = useState("");
  const [peopleStatusFilter, setPeopleStatusFilter] = useState("");
  const [peopleRoleFilter, setPeopleRoleFilter] = useState("");

  const toggleSection = (id: DrilldownId) =>
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const portfolio = useMemo<ActivityAnalysisPortfolio | null>(() => {
    if (!dataset) return null;
    return buildActivityAnalysisPortfolio({ dataset, orgRows, orgEmployeeIdColumn, columnMapping });
  }, [dataset, orgRows, orgEmployeeIdColumn, columnMapping]);

  const filteredActivities = useMemo(() => {
    if (!portfolio) return [];
    const query = activitySearch.trim().toLowerCase();
    return portfolio.activities.filter((a) => {
      const matchesSearch =
        !query ||
        [a.activityName, a.domain, a.processArea, a.category, a.nature, a.criticality, a.departmentFocus, a.riskFlags.join(" ")]
          .join(" ")
          .toLowerCase()
          .includes(query);
      const matchesCategory = !activityCategoryFilter || a.category === activityCategoryFilter;
      const matchesCriticality = !activityCriticalityFilter || a.criticality === activityCriticalityFilter;
      const matchesRisk = !activityRiskFilter || a.riskFlags.includes(activityRiskFilter as ActivityAnalysisRiskFlag);
      return matchesSearch && matchesCategory && matchesCriticality && matchesRisk;
    });
  }, [portfolio, activitySearch, activityCategoryFilter, activityCriticalityFilter, activityRiskFilter]);

  const filteredEmployees = useMemo(() => {
    if (!portfolio) return [];
    const query = peopleSearch.trim().toLowerCase();
    return portfolio.employees.filter((e) => {
      const matchesSearch =
        !query ||
        [e.employeeName, e.role, e.department, e.workloadStatus].join(" ").toLowerCase().includes(query);
      const matchesDept = !peopleDeptFilter || e.department === peopleDeptFilter;
      const matchesStatus = !peopleStatusFilter || e.workloadStatus === peopleStatusFilter;
      const matchesRole = !peopleRoleFilter || e.role === peopleRoleFilter;
      return matchesSearch && matchesDept && matchesStatus && matchesRole;
    });
  }, [portfolio, peopleSearch, peopleDeptFilter, peopleStatusFilter, peopleRoleFilter]);

  const selectedActivity = useMemo(() => {
    if (!portfolio || !selectedActivityId) return null;
    return portfolio.activities.find((a) => a.activityId === selectedActivityId) ?? null;
  }, [portfolio, selectedActivityId]);

  const selectedEmployee = useMemo(() => {
    if (!portfolio || !selectedEmployeeId) return null;
    return portfolio.employees.find((e) => e.employeeId === selectedEmployeeId) ?? null;
  }, [portfolio, selectedEmployeeId]);

  const categoryCosts = useMemo(() => {
    if (!portfolio) return [];
    const sums = new Map<string, { cost: number; fte: number }>();
    for (const a of portfolio.activities) {
      const cat = a.category || "Uncategorized";
      const prev = sums.get(cat) ?? { cost: 0, fte: 0 };
      prev.cost += a.activityCost;
      prev.fte += a.activityFte;
      sums.set(cat, prev);
    }
    return Array.from(sums.entries())
      .map(([category, values]) => ({ category, ...values }))
      .sort((a, b) => b.cost - a.cost);
  }, [portfolio]);

  const automationCandidates = useMemo(() => {
    if (!portfolio) return [];
    return portfolio.activities.filter((a) => a.automationSaving > 0).sort((a, b) => b.automationSaving - a.automationSaving);
  }, [portfolio]);

  const highSavingThreshold = useMemo(() => {
    if (!portfolio || portfolio.activities.length === 0) return 0;
    const values = portfolio.activities.map((a) => a.automationSaving).sort((a, b) => a - b);
    return values[Math.max(0, Math.floor(values.length * 0.75) - 1)];
  }, [portfolio]);

  const raciSummary = useMemo(() => {
    if (!portfolio) return { noAccountable: 0, noResponsible: 0, multiAccountable: 0, highCritGaps: 0 };
    let noAccountable = 0, noResponsible = 0, multiAccountable = 0, highCritGaps = 0;
    for (const a of portfolio.activities) {
      if (a.accountableCount === 0) noAccountable++;
      if (a.responsibleCount === 0) noResponsible++;
      if (a.accountableCount > 1) multiAccountable++;
      if (a.criticality === "High" && (a.accountableCount === 0 || a.responsibleCount === 0)) highCritGaps++;
    }
    return { noAccountable, noResponsible, multiAccountable, highCritGaps };
  }, [portfolio]);

  const spotlightActivity = useMemo(() => {
    if (!portfolio) return null;
    if (selectedActivityId) return portfolio.activities.find((a) => a.activityId === selectedActivityId) ?? null;
    const flagged = [...portfolio.activities].filter((a) => a.riskFlags.length > 0).sort((a, b) => b.activityCost - a.activityCost);
    return flagged[0] ?? [...portfolio.activities].sort((a, b) => b.activityCost - a.activityCost)[0] ?? null;
  }, [portfolio, selectedActivityId]);

  const riskSavingMatrix = useMemo(() => {
    if (!portfolio) return { rows: [] as Array<{ label: string; high: number; low: number }> };
    const counts = { highCriticalHighSaving: 0, highCriticalLowSaving: 0, otherHighSaving: 0, otherLowSaving: 0 };
    for (const a of portfolio.activities) {
      const highSaving = a.automationSaving >= highSavingThreshold;
      const highCritical = a.criticality === "High";
      if (highCritical && highSaving) counts.highCriticalHighSaving++;
      if (highCritical && !highSaving) counts.highCriticalLowSaving++;
      if (!highCritical && highSaving) counts.otherHighSaving++;
      if (!highCritical && !highSaving) counts.otherLowSaving++;
    }
    return {
      rows: [
        { label: "High criticality", high: counts.highCriticalHighSaving, low: counts.highCriticalLowSaving },
        { label: "Other criticality", high: counts.otherHighSaving, low: counts.otherLowSaving },
      ],
    };
  }, [portfolio, highSavingThreshold]);

  const peopleDeptOptions = useMemo(() => {
    if (!portfolio) return [];
    return [...new Set(portfolio.employees.map((e) => e.department).filter((d): d is string => !!d))].sort();
  }, [portfolio]);

  const peopleStatusOptions = useMemo(() => {
    if (!portfolio) return [];
    return [...new Set(portfolio.employees.map((e) => e.workloadStatus))].sort();
  }, [portfolio]);

  const peopleRoleOptions = useMemo(() => {
    if (!portfolio) return [];
    return [...new Set(portfolio.employees.map((e) => e.role).filter((r): r is string => !!r))].sort();
  }, [portfolio]);

  const handleExport = () => {
    if (!portfolio) return;
    const headers = [
      "Activity ID", "Activity Name", "Category", "Process", "Nature",
      "Criticality", "Cost", "FTE", "Assigned People", "Departments",
      "Accountable", "Responsible", "Automation Saving", "Outsourcing Saving", "Risk Flags",
    ];
    const rows = filteredActivities.map((a) => [
      a.activityId, a.activityName, a.category, a.processArea, a.nature,
      a.criticality, a.activityCost.toFixed(2), a.activityFte.toFixed(2),
      a.assignedPeople, a.departmentsInvolved, a.accountableCount, a.responsibleCount,
      a.automationSaving.toFixed(2), a.outsourcingSaving.toFixed(2), a.riskFlags.join("; "),
    ]);
    const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "activity-analysis.csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  if (!dataset || !portfolio) {
    if (embeddedMode) return null;
    return (
      <section className={styles.workCapabilityPanel}>
        <div className={styles.workCapabilityHeader}>
          <div>
            <p className={styles.workCapabilityKicker}>Activity Analysis</p>
            <h2>Load work datasets to analyze activity cost, workload and ownership.</h2>
            <p className={styles.workCapabilityIntro}>
              Import the required Work &amp; Capability dataset first, then return to review
              activity portfolio, people workload, ownership gaps, and automation opportunities.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const maxCatCost = Math.max(1, ...categoryCosts.map((r) => r.cost));
  const maxCatFte = Math.max(1, ...categoryCosts.map((r) => r.fte));
  const highSavingCount = automationCandidates.filter((a) => a.automationSaving >= highSavingThreshold).length;
  const topAutoCandidate = automationCandidates[0] ?? null;
  const highCritHighSaving = riskSavingMatrix.rows[0]?.high ?? 0;
  const showCategoryCharts = !embeddedMode || embeddedSection === "all" || embeddedSection === "category-charts";
  const showPortfolioWorkload = !embeddedMode || embeddedSection === "all" || embeddedSection === "portfolio-workload";

  return (
    <section className={styles.workCapabilityPanel}>
      {/* Header */}
      {!embeddedMode && <div className={styles.workCapabilityHeader}>
        <div>
          <p className={styles.workCapabilityKicker}>Activity Analysis</p>
          <h2>Activity Analysis</h2>
          <p className={styles.workCapabilityIntro}>
            Analyze work effort, ownership risk, workload concentration, and automation opportunity across activities.
          </p>
        </div>
        <button className={styles.workCapabilityImportBtn} onClick={handleExport}>Export CSV</button>
      </div>}

      {/* KPI strip */}
      {!embeddedMode && <div className={styles.workCapabilityKpiStrip} style={{ gridTemplateColumns: "repeat(6, minmax(0, 1fr))" }}>
        <div className={styles.workCapabilityKpiCard}><span>Mapped cost</span><strong>{fmtCost(portfolio.kpis.totalMappedCost)}</strong></div>
        <div className={styles.workCapabilityKpiCard}><span>Mapped FTE</span><strong>{portfolio.kpis.totalMappedFTE.toFixed(1)}</strong></div>
        <div className={styles.workCapabilityKpiCard}><span>Activities</span><strong>{portfolio.kpis.totalActivities.toLocaleString()}</strong></div>
        <div className={styles.workCapabilityKpiCard}><span>People assigned</span><strong>{portfolio.kpis.totalAssignedPeople.toLocaleString()}</strong></div>
        <div className={styles.workCapabilityKpiCard}><span>Ownership gaps</span><strong>{portfolio.kpis.ownershipGaps.toLocaleString()}</strong></div>
        <div className={styles.workCapabilityKpiCard}><span>Automation saving</span><strong>{fmtCost(portfolio.kpis.automationSaving)}</strong></div>
      </div>}

      {/* Always-visible diagnostic overview */}
      <div style={{ display: "grid", gap: 16, marginTop: embeddedMode ? 0 : 18 }}>

        {/* Work concentration */}
        {showCategoryCharts && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <section className={styles.workCapabilityPanel}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <strong>Cost by category</strong>
              {onAddToStory && (
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => onAddToStory({ rows: categoryCosts.map(r => ({ Category: r.category, Cost: r.cost, FTE: r.fte })), columns: ['Category', 'Cost', 'FTE'], source: { type: 'org-metrics', label: 'Cost by category', capturedAt: new Date().toISOString() }, label: 'Cost by category' })} style={{ background: 'none', border: '1px solid rgba(0,107,107,0.35)', borderRadius: 3, padding: '3px 10px', fontSize: 11, color: 'var(--teal, #006b6b)', cursor: 'pointer', fontWeight: 500 }}>+ Story</button>
                  <button onClick={() => downloadCsv(categoryCosts.map(r => ({ Category: r.category, Cost: r.cost, FTE: r.fte })), ['Category', 'Cost', 'FTE'], 'cost-by-category.csv')} style={{ background: 'none', border: '1px solid rgba(0,107,107,0.35)', borderRadius: 3, padding: '3px 10px', fontSize: 11, color: 'var(--teal, #006b6b)', cursor: 'pointer', fontWeight: 500 }}>↓ CSV</button>
                </div>
              )}
            </div>
            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              {categoryCosts.slice(0, 8).map((item) => (
                <div key={item.category} style={{ display: "grid", gridTemplateColumns: "1fr 72px", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.category}</span>
                  <span style={{ color: "var(--slate)", fontSize: 12, textAlign: "right" }}>{fmtCostDetail(item.cost)}</span>
                  <div style={{ gridColumn: "span 2", height: 8, background: "#e9f6f6", borderRadius: 3 }}>
                    <div style={{ width: `${Math.max(6, (item.cost / maxCatCost) * 100)}%`, height: "100%", background: "var(--teal-deep)", borderRadius: 3 }} />
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className={styles.workCapabilityPanel}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <strong>FTE by category</strong>
              {onAddToStory && (
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => onAddToStory({ rows: categoryCosts.map(r => ({ Category: r.category, FTE: r.fte, Cost: r.cost })), columns: ['Category', 'FTE', 'Cost'], source: { type: 'org-metrics', label: 'FTE by category', capturedAt: new Date().toISOString() }, label: 'FTE by category' })} style={{ background: 'none', border: '1px solid rgba(0,107,107,0.35)', borderRadius: 3, padding: '3px 10px', fontSize: 11, color: 'var(--teal, #006b6b)', cursor: 'pointer', fontWeight: 500 }}>+ Story</button>
                  <button onClick={() => downloadCsv(categoryCosts.map(r => ({ Category: r.category, FTE: r.fte, Cost: r.cost })), ['Category', 'FTE', 'Cost'], 'fte-by-category.csv')} style={{ background: 'none', border: '1px solid rgba(0,107,107,0.35)', borderRadius: 3, padding: '3px 10px', fontSize: 11, color: 'var(--teal, #006b6b)', cursor: 'pointer', fontWeight: 500 }}>↓ CSV</button>
                </div>
              )}
            </div>
            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              {categoryCosts.slice(0, 8).map((item) => (
                <div key={item.category} style={{ display: "grid", gridTemplateColumns: "1fr 72px", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.category}</span>
                  <span style={{ color: "var(--slate)", fontSize: 12, textAlign: "right" }}>{item.fte.toFixed(1)} FTE</span>
                  <div style={{ gridColumn: "span 2", height: 8, background: "#f4eef6", borderRadius: 3 }}>
                    <div style={{ width: `${Math.max(6, (item.fte / maxCatFte) * 100)}%`, height: "100%", background: "#6f4c9d", borderRadius: 3 }} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>}

        {!embeddedMode && <>
        {/* Delivery risk + Automation */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <section className={styles.workCapabilityPanel}>
            <strong style={sectionLabel}>Delivery risk</strong>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              {[
                { label: "Overloaded", value: portfolio.kpis.overloadedEmployees, accent: "#c0392b" },
                { label: "Ownership gaps", value: portfolio.kpis.ownershipGaps, accent: "#e67e22" },
                { label: "No accountable", value: raciSummary.noAccountable, accent: "#e67e22" },
                { label: "No responsible", value: raciSummary.noResponsible, accent: "#e67e22" },
                { label: "Multi-accountable", value: raciSummary.multiAccountable, accent: "#5f7c8a" },
              ].map(({ label, value, accent }) => (
                <div key={label} style={{ background: "var(--cream)", borderRadius: 6, padding: "8px 12px", minWidth: 90, flex: "1 1 90px", borderTop: `3px solid ${value > 0 ? accent : "#ddd"}` }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: value > 0 ? accent : "var(--ink)" }}>{value}</div>
                  <div style={{ fontSize: 10, color: "var(--slate)", marginTop: 2, lineHeight: 1.3 }}>{label}</div>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.workCapabilityPanel}>
            <strong style={sectionLabel}>Automation opportunity</strong>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              <div style={{ background: "var(--cream)", borderRadius: 6, padding: "8px 12px", minWidth: 110, flex: "1 1 110px", borderTop: "3px solid var(--teal-deep)" }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: "var(--teal-deep)" }}>{fmtCost(portfolio.kpis.automationSaving)}</div>
                <div style={{ fontSize: 10, color: "var(--slate)", marginTop: 2 }}>Total saving</div>
              </div>
              <div style={{ background: "var(--cream)", borderRadius: 6, padding: "8px 12px", minWidth: 90, flex: "1 1 90px", borderTop: "3px solid var(--teal-deep)" }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: "var(--teal-deep)" }}>{highSavingCount}</div>
                <div style={{ fontSize: 10, color: "var(--slate)", marginTop: 2 }}>High-saving activities</div>
              </div>
              <div style={{ background: "var(--cream)", borderRadius: 6, padding: "8px 12px", minWidth: 120, flex: "2 1 120px", borderTop: "3px solid #5f7c8a" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{topAutoCandidate?.activityName ?? "—"}</div>
                <div style={{ fontSize: 10, color: "var(--slate)", marginTop: 2 }}>Top candidate{topAutoCandidate ? ` · ${fmtCostDetail(topAutoCandidate.automationSaving)}` : ""}</div>
              </div>
              <div style={{ background: "var(--cream)", borderRadius: 6, padding: "8px 12px", minWidth: 90, flex: "1 1 90px", borderTop: "3px solid #c0392b" }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#c0392b" }}>{highCritHighSaving}</div>
                <div style={{ fontSize: 10, color: "var(--slate)", marginTop: 2, lineHeight: 1.3 }}>High criticality + high saving</div>
              </div>
            </div>
          </section>
        </div>

        {/* Activity spotlight */}
        {spotlightActivity && (
          <section className={styles.workCapabilityPanel}>
            <strong style={sectionLabel}>Activity spotlight</strong>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 200px" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>{spotlightActivity.activityName}</div>
                <div style={{ fontSize: 11, color: "var(--slate)", marginTop: 2 }}>
                  {spotlightActivity.category}{spotlightActivity.processArea ? ` › ${spotlightActivity.processArea}` : ""}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  {[
                    { label: "Cost", value: fmtCostDetail(spotlightActivity.activityCost) },
                    { label: "FTE", value: spotlightActivity.activityFte.toFixed(1) },
                    { label: "People", value: String(spotlightActivity.assignedPeople) },
                    { label: "Depts", value: String(spotlightActivity.departmentsInvolved) },
                    ...(spotlightActivity.automationSaving > 0
                      ? [{ label: "Auto saving", value: fmtCostDetail(spotlightActivity.automationSaving) }]
                      : []),
                  ].map(({ label, value }) => (
                    <div key={label} style={{ background: "var(--cream)", borderRadius: 4, padding: "4px 8px", display: "flex", gap: 4, alignItems: "baseline" }}>
                      <span style={{ fontSize: 10, color: "var(--slate)" }}>{label}</span>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
              {spotlightActivity.riskFlags.length > 0 && (
                <div style={{ flex: "1 1 200px", padding: "8px 12px", background: "#fff8f0", borderRadius: 6, borderLeft: "3px solid #e67e22" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#c0392b", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Why flagged</div>
                  <div style={{ fontSize: 11, color: "var(--ink)", lineHeight: 1.6 }}>
                    {spotlightActivity.riskFlags.map((flag, i) => (
                      <span key={flag}>
                        {i > 0 && " · "}
                        <strong>{flag}</strong>
                        {FLAG_WHY[flag] ? `: ${FLAG_WHY[flag]}` : ""}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
        </>}
      </div>

      {/* Activity Portfolio + People & Workload — always visible, side by side */}
      {showPortfolioWorkload && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: embeddedMode ? 0 : 16 }}>

        {/* ── Activity Portfolio ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <strong style={sectionLabel}>Activity Portfolio</strong>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: "var(--slate)" }}>{filteredActivities.length} of {portfolio.activities.length}</span>
              {onAddToStory && (
                <>
                  <button onClick={() => onAddToStory({ rows: filteredActivities.map(a => ({ Activity: a.activityName, Category: a.category, Process: a.processArea, Criticality: a.criticality, Cost: a.activityCost, FTE: a.activityFte, People: a.assignedPeople })), columns: ['Activity', 'Category', 'Process', 'Criticality', 'Cost', 'FTE', 'People'], source: { type: 'org-metrics', label: 'Activity Portfolio', capturedAt: new Date().toISOString() }, label: 'Activity Portfolio' })} style={{ background: 'none', border: '1px solid rgba(0,107,107,0.35)', borderRadius: 3, padding: '3px 10px', fontSize: 11, color: 'var(--teal, #006b6b)', cursor: 'pointer', fontWeight: 500 }}>+ Story</button>
                  <button onClick={() => downloadCsv(filteredActivities.map(a => ({ Activity: a.activityName, Category: a.category, Process: a.processArea, Criticality: a.criticality, Cost: a.activityCost, FTE: a.activityFte, People: a.assignedPeople })), ['Activity', 'Category', 'Process', 'Criticality', 'Cost', 'FTE', 'People'], 'activity-portfolio.csv')} style={{ background: 'none', border: '1px solid rgba(0,107,107,0.35)', borderRadius: 3, padding: '3px 10px', fontSize: 11, color: 'var(--teal, #006b6b)', cursor: 'pointer', fontWeight: 500 }}>↓ CSV</button>
                </>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <input
              value={activitySearch}
              onChange={(e) => setActivitySearch(e.target.value)}
              placeholder="Search activities…"
              style={{ ...compactInput, flexBasis: "120px" }}
            />
            <select value={activityCategoryFilter} onChange={(e) => setActivityCategoryFilter(e.target.value)} style={compactInput}>
              <option value="">Category</option>
              {portfolio.filterOptions.categories.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <select value={activityCriticalityFilter} onChange={(e) => setActivityCriticalityFilter(e.target.value)} style={compactInput}>
              <option value="">Criticality</option>
              {portfolio.filterOptions.criticalities.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <select value={activityRiskFilter} onChange={(e) => setActivityRiskFilter(e.target.value)} style={compactInput}>
              <option value="">Risk flag</option>
              {portfolio.filterOptions.riskFlags.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          <div style={{ maxHeight: 260, overflowY: "auto", border: "1px solid #e0e0e0", borderRadius: 6 }}>
            <table className={styles.workCapabilityActivityTable}>
              <thead>
                <tr>
                  <th>Activity</th>
                  <th>Category</th>
                  <th>Process</th>
                </tr>
              </thead>
              <tbody>
                {filteredActivities.map((a) => (
                  <tr
                    key={a.activityId}
                    className={a.activityId === selectedActivityId ? styles.workCapabilityActivityRowSelected : ""}
                    onClick={() => setSelectedActivityId(a.activityId === selectedActivityId ? null : a.activityId)}
                    style={{ cursor: "pointer" }}
                  >
                    <td style={{ fontSize: 11 }}>
                      {a.riskFlags.length > 0 && <span style={{ color: "#e67e22", marginRight: 4 }}>●</span>}
                      {a.activityName}
                    </td>
                    <td style={{ fontSize: 11 }}>{a.category}</td>
                    <td style={{ fontSize: 11 }}>{a.processArea}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedActivity ? (
            <div style={{ border: "1px solid #c8e6e6", borderRadius: 6, padding: 12, background: "#f0f9f9" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{selectedActivity.activityName}</div>
              <div style={{ fontSize: 11, color: "var(--slate)", marginTop: 2 }}>
                {selectedActivity.category}{selectedActivity.processArea ? ` › ${selectedActivity.processArea}` : ""}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                {[
                  { label: "Cost", value: fmtCostDetail(selectedActivity.activityCost) },
                  { label: "FTE", value: selectedActivity.activityFte.toFixed(1) },
                  { label: "People", value: String(selectedActivity.assignedPeople) },
                  { label: "Depts", value: String(selectedActivity.departmentsInvolved) },
                  ...(selectedActivity.automationSaving > 0 ? [{ label: "Auto $", value: fmtCostDetail(selectedActivity.automationSaving) }] : []),
                ].map(({ label, value }) => (
                  <span key={label} style={{ background: "white", borderRadius: 4, padding: "3px 7px", fontSize: 11, border: "1px solid #d0d0d0" }}>
                    <span style={{ color: "var(--slate)", fontSize: 10 }}>{label} </span>
                    <strong>{value}</strong>
                  </span>
                ))}
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--slate)" }}>
                Acc: <strong style={{ color: "var(--ink)" }}>{selectedActivity.accountableCount}</strong>
                {" · "}Resp: <strong style={{ color: "var(--ink)" }}>{selectedActivity.responsibleCount}</strong>
                {" · "}Cons: <strong style={{ color: "var(--ink)" }}>{selectedActivity.consultedCount}</strong>
                {" · "}Inf: <strong style={{ color: "var(--ink)" }}>{selectedActivity.informedCount}</strong>
              </div>
              {selectedActivity.riskFlags.length > 0 && (
                <div style={{ marginTop: 8, padding: "6px 10px", background: "#fff8f0", borderRadius: 4, borderLeft: "3px solid #e67e22" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#c0392b", textTransform: "uppercase", marginBottom: 3 }}>Flagged</div>
                  {selectedActivity.riskFlags.map((flag) => (
                    <div key={flag} style={{ fontSize: 11, color: "var(--ink)", lineHeight: 1.5 }}>
                      <strong>{flag}</strong>{FLAG_WHY[flag] ? `: ${FLAG_WHY[flag]}` : ""}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div style={{ border: "1px dashed #d0d0d0", borderRadius: 6, padding: 12, textAlign: "center", color: "var(--slate)", fontSize: 12 }}>
              Select an activity to view details
            </div>
          )}
        </div>

        {/* ── People & Workload ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <strong style={sectionLabel}>People &amp; Workload</strong>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: "var(--slate)" }}>{filteredEmployees.length} of {portfolio.employees.length}</span>
              {onAddToStory && (
                <>
                  <button onClick={() => onAddToStory({ rows: filteredEmployees.map(e => ({ Employee: e.employeeName, Role: e.role, Department: e.department, Status: e.workloadStatus, Activities: e.activityCount, FTE: e.mappedFTE })), columns: ['Employee', 'Role', 'Department', 'Status', 'Activities', 'FTE'], source: { type: 'org-metrics', label: 'People & Workload', capturedAt: new Date().toISOString() }, label: 'People & Workload' })} style={{ background: 'none', border: '1px solid rgba(0,107,107,0.35)', borderRadius: 3, padding: '3px 10px', fontSize: 11, color: 'var(--teal, #006b6b)', cursor: 'pointer', fontWeight: 500 }}>+ Story</button>
                  <button onClick={() => downloadCsv(filteredEmployees.map(e => ({ Employee: e.employeeName, Role: e.role, Department: e.department, Status: e.workloadStatus, Activities: e.activityCount, FTE: e.mappedFTE })), ['Employee', 'Role', 'Department', 'Status', 'Activities', 'FTE'], 'people-workload.csv')} style={{ background: 'none', border: '1px solid rgba(0,107,107,0.35)', borderRadius: 3, padding: '3px 10px', fontSize: 11, color: 'var(--teal, #006b6b)', cursor: 'pointer', fontWeight: 500 }}>↓ CSV</button>
                </>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <input
              value={peopleSearch}
              onChange={(e) => setPeopleSearch(e.target.value)}
              placeholder="Search people…"
              style={{ ...compactInput, flexBasis: "120px" }}
            />
            <select value={peopleDeptFilter} onChange={(e) => setPeopleDeptFilter(e.target.value)} style={compactInput}>
              <option value="">Department</option>
              {peopleDeptOptions.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <select value={peopleStatusFilter} onChange={(e) => setPeopleStatusFilter(e.target.value)} style={compactInput}>
              <option value="">Status</option>
              {peopleStatusOptions.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <select value={peopleRoleFilter} onChange={(e) => setPeopleRoleFilter(e.target.value)} style={compactInput}>
              <option value="">Role</option>
              {peopleRoleOptions.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          <div style={{ maxHeight: 260, overflowY: "auto", border: "1px solid #e0e0e0", borderRadius: 6 }}>
            <table className={styles.workCapabilityActivityTable}>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Role</th>
                  <th>Dept</th>
                  <th style={{ textAlign: "center" }}>Activities</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((e) => (
                  <tr
                    key={e.employeeId}
                    className={e.employeeId === selectedEmployeeId ? styles.workCapabilityActivityRowSelected : ""}
                    onClick={() => setSelectedEmployeeId(e.employeeId === selectedEmployeeId ? null : e.employeeId)}
                    style={{ cursor: "pointer" }}
                  >
                    <td style={{ fontSize: 11 }}>
                      {(e.workloadStatus === "Overload" || e.workloadStatus === "Severe overload") && <span style={{ color: "#c0392b", marginRight: 4 }}>●</span>}
                      {e.employeeName}
                    </td>
                    <td style={{ fontSize: 11 }}>{e.role}</td>
                    <td style={{ fontSize: 11 }}>{e.department}</td>
                    <td style={{ fontSize: 11, textAlign: "center" }}>{e.activityCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedEmployee ? (
            <div style={{ border: "1px solid #c8e6e6", borderRadius: 6, padding: 12, background: "#f0f9f9" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{selectedEmployee.employeeName}</div>
                <span style={{
                  fontSize: 11, padding: "2px 7px", borderRadius: 4,
                  background: STATUS_COLOR[selectedEmployee.workloadStatus] ?? "#7f8c8d",
                  color: "white", fontWeight: 600,
                }}>
                  {selectedEmployee.workloadStatus}
                </span>
              </div>
              <div style={{ fontSize: 11, color: "var(--slate)", marginTop: 2 }}>
                {selectedEmployee.role}{selectedEmployee.department ? ` · ${selectedEmployee.department}` : ""}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                {[
                  { label: "Workload", value: formatPct(selectedEmployee.totalWorkloadPct), highlight: selectedEmployee.workloadStatus === "Overload" || selectedEmployee.workloadStatus === "Severe overload" },
                  { label: "FTE", value: selectedEmployee.mappedFTE.toFixed(2), highlight: false },
                  { label: "Cost", value: fmtCostDetail(selectedEmployee.mappedCost), highlight: false },
                ].map(({ label, value, highlight }) => (
                  <span key={label} style={{ background: "white", borderRadius: 4, padding: "3px 7px", fontSize: 11, border: "1px solid #d0d0d0" }}>
                    <span style={{ color: "var(--slate)", fontSize: 10 }}>{label} </span>
                    <strong style={{ color: highlight ? "#c0392b" : "var(--ink)" }}>{value}</strong>
                  </span>
                ))}
              </div>
              {(() => {
                const assigned = portfolio.activities.filter(
                  (a) => a.deliveryFootprint.some((r) => r.employeeId === selectedEmployee.employeeId)
                );
                if (assigned.length === 0) return null;
                return (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--slate)", textTransform: "uppercase", marginBottom: 4 }}>
                      Assigned activities ({assigned.length})
                    </div>
                    <div style={{ maxHeight: 110, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
                      {assigned.map((a) => (
                        <div key={a.activityId} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "2px 0", borderBottom: "1px solid #e8e8e8" }}>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, paddingRight: 8 }}>{a.activityName}</span>
                          <span style={{ color: "var(--slate)", flexShrink: 0 }}>{fmtCostDetail(a.activityCost)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div style={{ border: "1px dashed #d0d0d0", borderRadius: 6, padding: 12, textAlign: "center", color: "var(--slate)", fontSize: 12 }}>
              Select an employee to view details
            </div>
          )}
        </div>
      </div>}

      {/* Drilldown sections — Ownership & Automation only */}
      {!embeddedMode && <div style={{ marginTop: 24, display: "grid", gap: 8 }}>
        {DRILLDOWN_SECTIONS.map(({ id, label }) => {
          const isOpen = expandedSections.has(id);
          return (
            <div key={id}>
              <button
                type="button"
                onClick={() => toggleSection(id)}
                style={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: isOpen ? "var(--teal-wash, #e6f4f4)" : "var(--cream)",
                  border: "1px solid #d8d8d8",
                  borderBottom: isOpen ? "none" : "1px solid #d8d8d8",
                  borderRadius: isOpen ? "6px 6px 0 0" : 6,
                  padding: "10px 16px",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--ink)",
                  textAlign: "left",
                }}
              >
                <span>{label}</span>
                <span style={{ fontSize: 10, color: "var(--slate)", fontWeight: 400 }}>
                  {isOpen ? "▲ collapse" : "▼ expand"}
                </span>
              </button>

              {isOpen && (
                <div style={{ border: "1px solid #d8d8d8", borderTop: "none", borderRadius: "0 0 6px 6px", padding: 16 }}>

                  {id === "ownership" && (() => {
                    const gapMap = new Map<string, { gap: number; fragmented: number }>();
                    for (const a of portfolio.activities) {
                      const key = a.category || "Uncategorized";
                      const s = gapMap.get(key) ?? { gap: 0, fragmented: 0 };
                      if (a.accountableCount === 0 || a.responsibleCount === 0) s.gap++;
                      if (a.departmentsInvolved >= 3 || a.assignedPeople >= 10) s.fragmented++;
                      gapMap.set(key, s);
                    }
                    const topCategories = Array.from(gapMap.entries())
                      .map(([cat, s]) => ({ cat, ...s }))
                      .sort((a, b) => (b.gap + b.fragmented) - (a.gap + a.fragmented))
                      .slice(0, 8);
                    const raciExceptions = portfolio.activities.filter((a) =>
                      a.accountableCount === 0 || a.responsibleCount === 0 || a.accountableCount > 1
                    );
                    return (
                      <div style={{ display: "grid", gap: 18 }}>
                        {/* Summary cards */}
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          {[
                            { label: "Ownership gaps", value: portfolio.kpis.ownershipGaps, accent: "#e67e22" },
                            { label: "No accountable", value: raciSummary.noAccountable, accent: "#c0392b" },
                            { label: "No responsible", value: raciSummary.noResponsible, accent: "#e67e22" },
                            { label: "Multi-accountable", value: raciSummary.multiAccountable, accent: "#5f7c8a" },
                            { label: "High-crit gaps", value: raciSummary.highCritGaps, accent: "#c0392b" },
                          ].map(({ label, value, accent }) => (
                            <div key={label} style={{ background: "var(--cream)", borderRadius: 6, padding: "8px 14px", flex: "1 1 100px", borderTop: `3px solid ${value > 0 ? accent : "#ddd"}` }}>
                              <div style={{ fontSize: 22, fontWeight: 700, color: value > 0 ? accent : "var(--ink)" }}>{value}</div>
                              <div style={{ fontSize: 10, color: "var(--slate)", marginTop: 2, lineHeight: 1.3 }}>{label}</div>
                            </div>
                          ))}
                        </div>

                        {/* Top problem categories */}
                        <section className={styles.workCapabilityPanel}>
                          <strong style={sectionLabel}>Top problem categories</strong>
                          <div style={{ display: "grid", gap: 4, marginTop: 10 }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 100px", gap: 8, padding: "4px 6px" }}>
                              <span style={{ fontSize: 10, color: "var(--slate)", textTransform: "uppercase" }}>Category</span>
                              <span style={{ fontSize: 10, color: "var(--slate)", textAlign: "center", textTransform: "uppercase" }}>Gaps</span>
                              <span style={{ fontSize: 10, color: "var(--slate)", textAlign: "center", textTransform: "uppercase" }}>Fragmented</span>
                            </div>
                            {topCategories.map(({ cat, gap, fragmented }) => (
                              <div key={cat} style={{ display: "grid", gridTemplateColumns: "1fr 80px 100px", gap: 8, alignItems: "center", padding: "5px 6px", borderRadius: 4, background: gap > 0 ? "#fff8f0" : "transparent" }}>
                                <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cat}</span>
                                <span style={{ fontSize: 12, fontWeight: gap > 0 ? 700 : 400, color: gap > 0 ? "#e67e22" : "var(--slate)", textAlign: "center" }}>{gap}</span>
                                <span style={{ fontSize: 12, color: fragmented > 0 ? "#5f7c8a" : "var(--slate)", textAlign: "center" }}>{fragmented}</span>
                              </div>
                            ))}
                          </div>
                        </section>

                        {/* RACI exceptions */}
                        <section className={styles.workCapabilityPanel}>
                          <strong style={sectionLabel}>RACI exceptions — {raciExceptions.length} activities flagged</strong>
                          {raciExceptions.length === 0 ? (
                            <p style={{ fontSize: 12, color: "var(--slate)", marginTop: 10 }}>No exceptions. All activities have at least one accountable and responsible owner.</p>
                          ) : (
                            <div style={{ marginTop: 10, overflowX: "auto" }}>
                              <table className={styles.workCapabilityActivityTable}>
                                <thead>
                                  <tr>
                                    <th>Activity</th>
                                    <th>Category</th>
                                    <th>Issue</th>
                                    <th style={{ textAlign: "center" }}>Acc</th>
                                    <th style={{ textAlign: "center" }}>Resp</th>
                                    <th>Criticality</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {raciExceptions.map((a) => {
                                    const issues: string[] = [];
                                    if (a.accountableCount === 0) issues.push("No accountable");
                                    if (a.responsibleCount === 0) issues.push("No responsible");
                                    if (a.accountableCount > 1) issues.push("Multi-accountable");
                                    const isHighCrit = a.criticality === "High" && (a.accountableCount === 0 || a.responsibleCount === 0);
                                    return (
                                      <tr key={a.activityId} style={{ background: isHighCrit ? "#fff0f0" : undefined }}>
                                        <td style={{ fontSize: 11 }}>{a.activityName}</td>
                                        <td style={{ fontSize: 11 }}>{a.category}</td>
                                        <td style={{ fontSize: 11 }}>
                                          {issues.map((issue, i) => (
                                            <span key={issue} style={{ color: issue === "No accountable" ? "#c0392b" : issue === "Multi-accountable" ? "#e67e22" : "#b8860b" }}>
                                              {i > 0 && " · "}{issue}
                                            </span>
                                          ))}
                                        </td>
                                        <td style={{ fontSize: 11, textAlign: "center", fontWeight: 700, color: a.accountableCount === 0 ? "#c0392b" : a.accountableCount > 1 ? "#e67e22" : "var(--ink)" }}>{a.accountableCount}</td>
                                        <td style={{ fontSize: 11, textAlign: "center", fontWeight: 700, color: a.responsibleCount === 0 ? "#c0392b" : "var(--ink)" }}>{a.responsibleCount}</td>
                                        <td style={{ fontSize: 11 }}>{a.criticality}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </section>

                        {/* Full RACI matrix — collapsed */}
                        <details style={{ border: "1px solid #e0e0e0", borderRadius: 6 }}>
                          <summary style={{ padding: "10px 14px", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--slate)", userSelect: "none" }}>
                            Full RACI Matrix ({filteredActivities.length} activities)
                          </summary>
                          <div style={{ padding: "0 14px 14px", overflowX: "auto" }}>
                            <table className={styles.workCapabilityActivityTable}>
                              <thead>
                                <tr>
                                  <th>Activity</th>
                                  <th>Accountable</th>
                                  <th>Responsible</th>
                                  <th>Consulted</th>
                                  <th>Informed</th>
                                  <th>No accountable</th>
                                  <th>No responsible</th>
                                  <th>Multi accountable</th>
                                  <th>High-crit gap</th>
                                </tr>
                              </thead>
                              <tbody>
                                {filteredActivities.map((a) => {
                                  const noAcc = a.accountableCount === 0;
                                  const noResp = a.responsibleCount === 0;
                                  const multiAcc = a.accountableCount > 1;
                                  const hcGap = a.criticality === "High" && (noAcc || noResp);
                                  return (
                                    <tr key={a.activityId}>
                                      <td>{a.activityName}</td>
                                      <td>{a.accountableCount}</td>
                                      <td>{a.responsibleCount}</td>
                                      <td>{a.consultedCount}</td>
                                      <td>{a.informedCount}</td>
                                      <td>{noAcc ? "Yes" : "No"}</td>
                                      <td>{noResp ? "Yes" : "No"}</td>
                                      <td>{multiAcc ? "Yes" : "No"}</td>
                                      <td>{hcGap ? "Yes" : "No"}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </details>
                      </div>
                    );
                  })()}

                  {id === "automation" && (() => {
                    const top10 = automationCandidates.slice(0, 10);
                    return (
                      <div style={{ display: "grid", gap: 18 }}>
                        {/* Summary cards */}
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <div style={{ background: "var(--cream)", borderRadius: 6, padding: "8px 14px", flex: "1 1 110px", borderTop: "3px solid var(--teal-deep)" }}>
                            <div style={{ fontSize: 22, fontWeight: 700, color: "var(--teal-deep)" }}>{fmtCost(portfolio.kpis.automationSaving)}</div>
                            <div style={{ fontSize: 10, color: "var(--slate)", marginTop: 2 }}>Total automation saving</div>
                          </div>
                          <div style={{ background: "var(--cream)", borderRadius: 6, padding: "8px 14px", flex: "1 1 100px", borderTop: "3px solid var(--teal-deep)" }}>
                            <div style={{ fontSize: 22, fontWeight: 700, color: "var(--teal-deep)" }}>{highSavingCount}</div>
                            <div style={{ fontSize: 10, color: "var(--slate)", marginTop: 2 }}>High-saving activities</div>
                          </div>
                          <div style={{ background: "var(--cream)", borderRadius: 6, padding: "8px 14px", flex: "1 1 100px", borderTop: "3px solid #c0392b" }}>
                            <div style={{ fontSize: 22, fontWeight: 700, color: "#c0392b" }}>{highCritHighSaving}</div>
                            <div style={{ fontSize: 10, color: "var(--slate)", marginTop: 2, lineHeight: 1.3 }}>High crit + high saving</div>
                          </div>
                          <div style={{ background: "var(--cream)", borderRadius: 6, padding: "8px 14px", flex: "2 1 160px", borderTop: "3px solid #5f7c8a" }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{topAutoCandidate?.activityName ?? "—"}</div>
                            <div style={{ fontSize: 10, color: "var(--slate)", marginTop: 2 }}>Top candidate{topAutoCandidate ? ` · ${fmtCostDetail(topAutoCandidate.automationSaving)} saving` : ""}</div>
                          </div>
                        </div>

                        {/* 2×2 priority matrix */}
                        <section className={styles.workCapabilityPanel}>
                          <strong style={sectionLabel}>Risk vs saving priority matrix</strong>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
                            <div style={{ padding: "12px 14px", borderRadius: 8, background: "#fff0f0", border: "2px solid #c0392b" }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: "#c0392b", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>★ Priority — automate now</div>
                              <div style={{ fontSize: 28, fontWeight: 700, color: "#c0392b" }}>{riskSavingMatrix.rows[0]?.high ?? 0}</div>
                              <div style={{ fontSize: 10, color: "var(--slate)", marginTop: 2 }}>High criticality · High saving</div>
                            </div>
                            <div style={{ padding: "12px 14px", borderRadius: 8, background: "#fff8f0", border: "1px solid #e0d0c0" }}>
                              <div style={{ fontSize: 10, fontWeight: 600, color: "#e67e22", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Monitor — high risk, lower ROI</div>
                              <div style={{ fontSize: 28, fontWeight: 700, color: "#e67e22" }}>{riskSavingMatrix.rows[0]?.low ?? 0}</div>
                              <div style={{ fontSize: 10, color: "var(--slate)", marginTop: 2 }}>High criticality · Lower saving</div>
                            </div>
                            <div style={{ padding: "12px 14px", borderRadius: 8, background: "#e9f6f6", border: "1px solid #b0d8d8" }}>
                              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--teal-deep)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Quick wins — low risk, high ROI</div>
                              <div style={{ fontSize: 28, fontWeight: 700, color: "var(--teal-deep)" }}>{riskSavingMatrix.rows[1]?.high ?? 0}</div>
                              <div style={{ fontSize: 10, color: "var(--slate)", marginTop: 2 }}>Other criticality · High saving</div>
                            </div>
                            <div style={{ padding: "12px 14px", borderRadius: 8, background: "var(--cream)", border: "1px solid #e0e0e0" }}>
                              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--slate)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Deprioritize</div>
                              <div style={{ fontSize: 28, fontWeight: 700, color: "var(--slate)" }}>{riskSavingMatrix.rows[1]?.low ?? 0}</div>
                              <div style={{ fontSize: 10, color: "var(--slate)", marginTop: 2 }}>Other criticality · Lower saving</div>
                            </div>
                          </div>
                        </section>

                        {/* Top 10 automation candidates */}
                        <section className={styles.workCapabilityPanel}>
                          <strong style={sectionLabel}>Top automation candidates</strong>
                          <div style={{ marginTop: 10, overflowX: "auto" }}>
                            <table className={styles.workCapabilityActivityTable}>
                              <thead>
                                <tr>
                                  <th>Activity</th>
                                  <th>Nature</th>
                                  <th>Criticality</th>
                                  <th>Cost</th>
                                  <th>Saving</th>
                                  <th>Reason</th>
                                </tr>
                              </thead>
                              <tbody>
                                {top10.map((a) => {
                                  const reason = a.nature || (a.riskFlags[0] ? FLAG_WHY[a.riskFlags[0]] ?? a.riskFlags[0] : "—");
                                  return (
                                    <tr
                                      key={a.activityId}
                                      onClick={() => setSelectedActivityId(a.activityId === selectedActivityId ? null : a.activityId)}
                                      className={a.activityId === selectedActivityId ? styles.workCapabilityActivityRowSelected : ""}
                                      style={{ cursor: "pointer" }}
                                    >
                                      <td style={{ fontSize: 11 }}>{a.activityName}</td>
                                      <td style={{ fontSize: 11 }}>{a.nature}</td>
                                      <td style={{ fontSize: 11 }}>{a.criticality}</td>
                                      <td style={{ fontSize: 11 }}>{fmtCostDetail(a.activityCost)}</td>
                                      <td style={{ fontSize: 11, fontWeight: 700, color: "var(--teal-deep)" }}>{fmtCostDetail(a.automationSaving)}</td>
                                      <td style={{ fontSize: 11, color: "var(--slate)" }}>{reason}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </section>

                        {/* Automation Capture Simulator — collapsed */}
                        <details style={{ border: "1px solid #e0e0e0", borderRadius: 6 }}>
                          <summary style={{ padding: "10px 14px", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--slate)", userSelect: "none" }}>
                            Automation Capture Simulator
                          </summary>
                          <div style={{ padding: 14 }}>
                            <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--slate)" }}>
                              Estimate savings and FTE release if a portion of this activity&apos;s automation potential is captured.
                            </p>
                            <p style={{ margin: "0 0 12px", fontSize: 12 }}>
                              {selectedActivity ? selectedActivity.activityName : "Select an activity from the top candidates table above."}
                            </p>
                            <input
                              type="range" min={0} max={100} step={5}
                              value={adoptionPct}
                              onChange={(e) => setAdoptionPct(Number(e.target.value))}
                              disabled={!selectedActivity}
                              style={{ width: "100%" }}
                            />
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 14 }}>
                              <div style={{ background: "var(--cream)", padding: 12, borderRadius: 6 }}>
                                <span style={{ display: "block", marginBottom: 8, color: "var(--slate-light)", textTransform: "uppercase", fontSize: 11 }}>Adoption</span>
                                <strong>{adoptionPct}%</strong>
                              </div>
                              <div style={{ background: "var(--cream)", padding: 12, borderRadius: 6 }}>
                                <span style={{ display: "block", marginBottom: 8, color: "var(--slate-light)", textTransform: "uppercase", fontSize: 11 }}>Estimated saving</span>
                                <strong>{selectedActivity ? fmtCost((selectedActivity.automationSaving * adoptionPct) / 100) : "$0"}</strong>
                              </div>
                              <div style={{ background: "var(--cream)", padding: 12, borderRadius: 6 }}>
                                <span style={{ display: "block", marginBottom: 8, color: "var(--slate-light)", textTransform: "uppercase", fontSize: 11 }}>FTE release</span>
                                <strong>{selectedActivity ? `${((selectedActivity.activityFte * adoptionPct) / 100).toFixed(2)} FTE` : "0.00 FTE"}</strong>
                              </div>
                            </div>
                          </div>
                        </details>

                        {/* Full Automation Savings Table — collapsed */}
                        <details style={{ border: "1px solid #e0e0e0", borderRadius: 6 }}>
                          <summary style={{ padding: "10px 14px", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--slate)", userSelect: "none" }}>
                            Full Automation Savings Table ({automationCandidates.length} activities)
                          </summary>
                          <div style={{ padding: "0 14px 14px", overflowX: "auto" }}>
                            <table className={styles.workCapabilityActivityTable}>
                              <thead>
                                <tr>
                                  <th>Activity</th>
                                  <th>Criticality</th>
                                  <th>Nature</th>
                                  <th>Cost</th>
                                  <th>Auto %</th>
                                  <th>Auto saving</th>
                                  <th>Risk flags</th>
                                </tr>
                              </thead>
                              <tbody>
                                {automationCandidates.map((a) => (
                                  <tr
                                    key={a.activityId}
                                    onClick={() => setSelectedActivityId(a.activityId === selectedActivityId ? null : a.activityId)}
                                    className={a.activityId === selectedActivityId ? styles.workCapabilityActivityRowSelected : ""}
                                    style={{ cursor: "pointer" }}
                                  >
                                    <td>{a.activityName}</td>
                                    <td>{a.criticality}</td>
                                    <td>{a.nature}</td>
                                    <td>{fmtCost(a.activityCost)}</td>
                                    <td>{formatPct(a.automationCostReductionPct)}</td>
                                    <td>{fmtCost(a.automationSaving)}</td>
                                    <td>{a.riskFlags.join("; ")}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </details>
                      </div>
                    );
                  })()}

                </div>
              )}
            </div>
          );
        })}
      </div>}
    </section>
  );
}
