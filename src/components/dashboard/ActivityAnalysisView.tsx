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
import styles from "@/app/page.module.css";

type AnalysisTab =
  | "overview"
  | "portfolio"
  | "people"
  | "ownership"
  | "automation";

type AnalysisProps = {
  dataset: WorkCapabilityDataset | null;
  orgRows: ExcelRow[];
  orgEmployeeIdColumn: string;
  columnMapping: ColumnMapping | null;
};

const formatPct = (value: number) => `${value.toFixed(0)}%`;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function csvEscape(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  if (text.includes(",") || text.includes("\n") || text.includes('"')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export default function ActivityAnalysisView({
  dataset,
  orgRows,
  orgEmployeeIdColumn,
  columnMapping,
}: AnalysisProps) {
  const [activeTab, setActiveTab] = useState<AnalysisTab>("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [natureFilter, setNatureFilter] = useState("");
  const [criticalityFilter, setCriticalityFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState("");
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(
    null,
  );
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(
    null,
  );
  const [adoptionPct, setAdoptionPct] = useState(25);

  const portfolio = useMemo<ActivityAnalysisPortfolio | null>(() => {
    if (!dataset) return null;
    return buildActivityAnalysisPortfolio({
      dataset,
      orgRows,
      orgEmployeeIdColumn,
      columnMapping,
    });
  }, [dataset, orgRows, orgEmployeeIdColumn, columnMapping]);

  const filteredActivities = useMemo(() => {
    if (!portfolio) return [];
    const query = searchQuery.trim().toLowerCase();
    return portfolio.activities.filter((activity) => {
      const matchesSearch =
        !query ||
        [
          activity.activityName,
          activity.domain,
          activity.processArea,
          activity.category,
          activity.nature,
          activity.criticality,
          activity.departmentFocus,
          activity.riskFlags.join(" "),
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);
      const matchesCategory =
        !categoryFilter || activity.category === categoryFilter;
      const matchesNature = !natureFilter || activity.nature === natureFilter;
      const matchesCriticality =
        !criticalityFilter || activity.criticality === criticalityFilter;
      const matchesRisk =
        !riskFilter ||
        activity.riskFlags.includes(riskFilter as ActivityAnalysisRiskFlag);
      return (
        matchesSearch &&
        matchesCategory &&
        matchesNature &&
        matchesCriticality &&
        matchesRisk
      );
    });
  }, [
    portfolio,
    searchQuery,
    categoryFilter,
    natureFilter,
    criticalityFilter,
    riskFilter,
  ]);

  const filteredEmployees = useMemo(() => {
    if (!portfolio) return [];
    const query = searchQuery.trim().toLowerCase();
    return portfolio.employees.filter((employee) => {
      const matchesSearch =
        !query ||
        [
          employee.employeeName,
          employee.role,
          employee.department,
          employee.workloadStatus,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);
      return matchesSearch;
    });
  }, [portfolio, searchQuery]);

  const selectedActivity = useMemo(() => {
    if (!portfolio || !selectedActivityId) return null;
    return (
      portfolio.activities.find(
        (activity) => activity.activityId === selectedActivityId,
      ) ?? null
    );
  }, [portfolio, selectedActivityId]);

  const selectedEmployee = useMemo(() => {
    if (!portfolio || !selectedEmployeeId) return null;
    return (
      portfolio.employees.find(
        (employee) => employee.employeeId === selectedEmployeeId,
      ) ?? null
    );
  }, [portfolio, selectedEmployeeId]);

  const categoryCosts = useMemo(() => {
    if (!portfolio) return [];
    const sums = new Map<string, { cost: number; fte: number }>();
    for (const activity of portfolio.activities) {
      const category = activity.category || "Uncategorized";
      const previous = sums.get(category) ?? { cost: 0, fte: 0 };
      previous.cost += activity.activityCost;
      previous.fte += activity.activityFte;
      sums.set(category, previous);
    }
    return Array.from(sums.entries())
      .map(([category, values]) => ({ category, ...values }))
      .sort((a, b) => b.cost - a.cost);
  }, [portfolio]);

  const scatterPoints = useMemo(() => {
    if (!portfolio) return [];
    const maxCost = Math.max(
      1,
      ...portfolio.activities.map((activity) => activity.activityCost),
    );
    const maxFte = Math.max(
      1,
      ...portfolio.activities.map((activity) => activity.activityFte),
    );
    return portfolio.activities.map((activity) => ({
      ...activity,
      x: clamp((activity.activityCost / maxCost) * 280, 10, 290),
      y: clamp(200 - (activity.activityFte / maxFte) * 180, 10, 210),
    }));
  }, [portfolio]);

  const topRisks = useMemo(() => {
    if (!portfolio) return [];
    return portfolio.activities
      .filter((activity) => activity.riskFlags.length > 0)
      .sort(
        (a, b) =>
          b.riskFlags.length - a.riskFlags.length ||
          b.activityCost - a.activityCost,
      )
      .slice(0, 6);
  }, [portfolio]);

  const automationCandidates = useMemo(() => {
    if (!portfolio) return [];
    return portfolio.activities
      .filter((activity) => activity.automationSaving > 0)
      .sort((a, b) => b.automationSaving - a.automationSaving);
  }, [portfolio]);

  const highSavingThreshold = useMemo(() => {
    if (!portfolio || portfolio.activities.length === 0) return 0;
    const values = portfolio.activities
      .map((activity) => activity.automationSaving)
      .sort((a, b) => a - b);
    return values[Math.max(0, Math.floor(values.length * 0.75) - 1)];
  }, [portfolio]);

  const riskSavingMatrix = useMemo(() => {
    if (!portfolio)
      return {
        rows: [] as Array<{ label: string; high: number; low: number }>,
      };
    const counts = {
      highCriticalHighSaving: 0,
      highCriticalLowSaving: 0,
      otherHighSaving: 0,
      otherLowSaving: 0,
    };
    for (const activity of portfolio.activities) {
      const highSaving = activity.automationSaving >= highSavingThreshold;
      const highCritical = activity.criticality === "High";
      if (highCritical && highSaving) counts.highCriticalHighSaving += 1;
      if (highCritical && !highSaving) counts.highCriticalLowSaving += 1;
      if (!highCritical && highSaving) counts.otherHighSaving += 1;
      if (!highCritical && !highSaving) counts.otherLowSaving += 1;
    }
    return {
      rows: [
        {
          label: "High criticality",
          high: counts.highCriticalHighSaving,
          low: counts.highCriticalLowSaving,
        },
        {
          label: "Other criticality",
          high: counts.otherHighSaving,
          low: counts.otherLowSaving,
        },
      ],
    };
  }, [portfolio, highSavingThreshold]);

  const handleExport = () => {
    if (!portfolio) return;
    const headers = [
      "Activity ID",
      "Activity Name",
      "Category",
      "Process",
      "Nature",
      "Criticality",
      "Cost",
      "FTE",
      "Assigned People",
      "Departments",
      "Accountable",
      "Responsible",
      "Automation Saving",
      "Outsourcing Saving",
      "Risk Flags",
    ];
    const rows = filteredActivities.map((activity) => [
      activity.activityId,
      activity.activityName,
      activity.category,
      activity.processArea,
      activity.nature,
      activity.criticality,
      activity.activityCost.toFixed(2),
      activity.activityFte.toFixed(2),
      activity.assignedPeople,
      activity.departmentsInvolved,
      activity.accountableCount,
      activity.responsibleCount,
      activity.automationSaving.toFixed(2),
      activity.outsourcingSaving.toFixed(2),
      activity.riskFlags.join("; "),
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map(csvEscape).join(","))
      .join("\n");
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
    return (
      <section className={styles.workCapabilityPanel}>
        <div className={styles.workCapabilityHeader}>
          <div>
            <p className={styles.workCapabilityKicker}>Activity Analysis</p>
            <h2>
              Load work datasets to analyze activity cost, workload and
              ownership.
            </h2>
            <p className={styles.workCapabilityIntro}>
              Import the required Work & Capability dataset first, then return
              to review activity portfolio, people workload, ownership gaps, and
              automation opportunities.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.workCapabilityPanel}>
      <div className={styles.workCapabilityHeader}>
        <div>
          <p className={styles.workCapabilityKicker}>Activity Analysis</p>
          <h2>
            Understand what work is happening, who is doing it, and where risk
            and savings exist.
          </h2>
          <p className={styles.workCapabilityIntro}>
            Analyze activity cost, FTE, ownership, employee workload, and
            automation/outsourcing opportunity in a deterministic view.
          </p>
        </div>
        <button
          className={styles.workCapabilityImportBtn}
          onClick={handleExport}
        >
          Export CSV
        </button>
      </div>

      <div className={styles.workCapabilityTaxonomyToolbar}>
        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search activities or employees"
          aria-label="Search Activity Analysis"
        />
        <select
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
        >
          <option value="">Category</option>
          {portfolio.filterOptions.categories.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <select
          value={natureFilter}
          onChange={(event) => setNatureFilter(event.target.value)}
        >
          <option value="">Nature</option>
          {portfolio.filterOptions.natures.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <select
          value={criticalityFilter}
          onChange={(event) => setCriticalityFilter(event.target.value)}
        >
          <option value="">Criticality</option>
          {portfolio.filterOptions.criticalities.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <select
          value={riskFilter}
          onChange={(event) => setRiskFilter(event.target.value)}
        >
          <option value="">Risk flag</option>
          {portfolio.filterOptions.riskFlags.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <div
        className={styles.workCapabilityKpiStrip}
        style={{ gridTemplateColumns: "repeat(8, minmax(0, 1fr))" }}
      >
        <div className={styles.workCapabilityKpiCard}>
          <span>Total mapped cost</span>
          <strong>{fmtCost(portfolio.kpis.totalMappedCost)}</strong>
        </div>
        <div className={styles.workCapabilityKpiCard}>
          <span>Total mapped FTE</span>
          <strong>{portfolio.kpis.totalMappedFTE.toFixed(1)}</strong>
        </div>
        <div className={styles.workCapabilityKpiCard}>
          <span>Activities mapped</span>
          <strong>{portfolio.kpis.totalActivities.toLocaleString()}</strong>
        </div>
        <div className={styles.workCapabilityKpiCard}>
          <span>People assigned</span>
          <strong>{portfolio.kpis.totalAssignedPeople.toLocaleString()}</strong>
        </div>
        <div className={styles.workCapabilityKpiCard}>
          <span>Overloaded employees</span>
          <strong>{portfolio.kpis.overloadedEmployees.toLocaleString()}</strong>
        </div>
        <div className={styles.workCapabilityKpiCard}>
          <span>Ownership gaps</span>
          <strong>{portfolio.kpis.ownershipGaps.toLocaleString()}</strong>
        </div>
        <div className={styles.workCapabilityKpiCard}>
          <span>Automation saving</span>
          <strong>{fmtCost(portfolio.kpis.automationSaving)}</strong>
        </div>
        <div className={styles.workCapabilityKpiCard}>
          <span>Outsourcing saving</span>
          <strong>{fmtCost(portfolio.kpis.outsourcingSaving)}</strong>
        </div>
      </div>

      <div
        className={styles.workCapabilityTaxonomyToolbar}
        style={{ marginTop: 12 }}
      >
        <button
          type="button"
          className={
            activeTab === "overview"
              ? styles.workCapabilityImportBtn
              : styles.workCapabilitySecondaryBtn
          }
          onClick={() => setActiveTab("overview")}
        >
          Overview
        </button>
        <button
          type="button"
          className={
            activeTab === "portfolio"
              ? styles.workCapabilityImportBtn
              : styles.workCapabilitySecondaryBtn
          }
          onClick={() => setActiveTab("portfolio")}
        >
          Activity Portfolio
        </button>
        <button
          type="button"
          className={
            activeTab === "people"
              ? styles.workCapabilityImportBtn
              : styles.workCapabilitySecondaryBtn
          }
          onClick={() => setActiveTab("people")}
        >
          People & Workload
        </button>
        <button
          type="button"
          className={
            activeTab === "ownership"
              ? styles.workCapabilityImportBtn
              : styles.workCapabilitySecondaryBtn
          }
          onClick={() => setActiveTab("ownership")}
        >
          Ownership/RACI
        </button>
        <button
          type="button"
          className={
            activeTab === "automation"
              ? styles.workCapabilityImportBtn
              : styles.workCapabilitySecondaryBtn
          }
          onClick={() => setActiveTab("automation")}
        >
          Automation Opportunities
        </button>
      </div>

      {activeTab === "overview" && (
        <div style={{ display: "grid", gap: 18, marginTop: 18 }}>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}
          >
            <section className={styles.workCapabilityPanel}>
              <strong>Cost by category</strong>
              <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                {categoryCosts.slice(0, 8).map((item) => (
                  <div
                    key={item.category}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 80px",
                      gap: 10,
                      alignItems: "center",
                    }}
                  >
                    <span style={{ fontSize: 12 }}>{item.category}</span>
                    <span style={{ color: "var(--slate)" }}>
                      {fmtCost(item.cost)}
                    </span>
                    <div
                      style={{
                        gridColumn: "span 2",
                        height: 10,
                        background: "#e9f6f6",
                        borderRadius: 3,
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.max(8, (item.cost / Math.max(1, ...categoryCosts.map((row) => row.cost))) * 100)}%`,
                          height: "100%",
                          background: "var(--teal-deep)",
                          borderRadius: 3,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className={styles.workCapabilityPanel}>
              <strong>FTE by category</strong>
              <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                {categoryCosts.slice(0, 8).map((item) => (
                  <div
                    key={item.category}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 80px",
                      gap: 10,
                      alignItems: "center",
                    }}
                  >
                    <span style={{ fontSize: 12 }}>{item.category}</span>
                    <span style={{ color: "var(--slate)" }}>
                      {item.fte.toFixed(2)}
                    </span>
                    <div
                      style={{
                        gridColumn: "span 2",
                        height: 10,
                        background: "#f4eef6",
                        borderRadius: 3,
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.max(8, (item.fte / Math.max(1, ...categoryCosts.map((row) => row.fte))) * 100)}%`,
                          height: "100%",
                          background: "#6f4c9d",
                          borderRadius: 3,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className={styles.workCapabilityPanel}>
            <strong>Cost vs FTE scatter</strong>
            <svg
              width="100%"
              height="240"
              viewBox="0 0 320 220"
              style={{
                marginTop: 12,
                background: "#fff",
                border: "1px solid rgba(0,0,0,0.08)",
                borderRadius: 6,
              }}
            >
              <line x1="40" y1="210" x2="310" y2="210" stroke="#ddd" />
              <line x1="40" y1="20" x2="40" y2="210" stroke="#ddd" />
              {scatterPoints.map((point) => (
                <g key={point.activityId}>
                  <circle
                    cx={40 + point.x}
                    cy={point.y}
                    r={5}
                    fill={point.riskFlags.length ? "#006b6b" : "#5f7c8a"}
                  />
                  <title>{`${point.activityName} · ${fmtCost(point.activityCost)} · ${point.activityFte.toFixed(2)} FTE`}</title>
                </g>
              ))}
            </svg>
          </section>

          <section className={styles.workCapabilityPanel}>
            <strong>Top risks</strong>
            <div style={{ marginTop: 12 }}>
              <table className={styles.workCapabilityActivityTable}>
                <thead>
                  <tr>
                    <th>Activity</th>
                    <th>Category</th>
                    <th>Risk flags</th>
                    <th>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {topRisks.map((activity) => (
                    <tr key={activity.activityId}>
                      <td>{activity.activityName}</td>
                      <td>{activity.category}</td>
                      <td>{activity.riskFlags.join(", ")}</td>
                      <td>{fmtCost(activity.activityCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {activeTab === "portfolio" && (
        <div
          className={styles.workCapabilityCatalogWorkspace}
          style={{ marginTop: 18 }}
        >
          <div className={styles.workCapabilityActivityTableWrap}>
            <table className={styles.workCapabilityActivityTable}>
              <thead>
                <tr>
                  <th>Activity</th>
                  <th>Category</th>
                  <th>Process</th>
                  <th>Nature</th>
                  <th>Criticality</th>
                  <th>People</th>
                  <th>Departments</th>
                  <th>Cost</th>
                  <th>FTE</th>
                  <th>Avg grade</th>
                  <th>Acc</th>
                  <th>Resp</th>
                  <th>Auto $</th>
                  <th>Outs $</th>
                  <th>Risk</th>
                </tr>
              </thead>
              <tbody>
                {filteredActivities.map((activity) => (
                  <tr
                    key={activity.activityId}
                    className={
                      activity.activityId === selectedActivityId
                        ? styles.workCapabilityActivityRowSelected
                        : ""
                    }
                    onClick={() => setSelectedActivityId(activity.activityId)}
                  >
                    <td>{activity.activityName}</td>
                    <td>{activity.category}</td>
                    <td>{activity.processArea}</td>
                    <td>{activity.nature}</td>
                    <td>{activity.criticality}</td>
                    <td>{activity.assignedPeople}</td>
                    <td>{activity.departmentsInvolved}</td>
                    <td>{fmtCost(activity.activityCost)}</td>
                    <td>{activity.activityFte.toFixed(2)}</td>
                    <td>
                      {activity.avgGrade != null
                        ? activity.avgGrade.toFixed(1)
                        : "-"}
                    </td>
                    <td>{activity.accountableCount}</td>
                    <td>{activity.responsibleCount}</td>
                    <td>{fmtCost(activity.automationSaving)}</td>
                    <td>{fmtCost(activity.outsourcingSaving)}</td>
                    <td>{activity.riskFlags.join("; ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <aside className={styles.workCapabilityActivityDetailPanel}>
            {selectedActivity ? (
              <div className={styles.workCapabilityActivityDetailInner}>
                <div className={styles.workCapabilityDetailHeader}>
                  <div>
                    <p className={styles.workCapabilityKicker}>
                      Activity detail
                    </p>
                    <h3>{selectedActivity.activityName}</h3>
                  </div>
                </div>
                <div className={styles.workCapabilityReadOnlyFacts}>
                  <span>
                    <strong>Category</strong>
                    {selectedActivity.category}
                  </span>
                  <span>
                    <strong>Process</strong>
                    {selectedActivity.processArea}
                  </span>
                  <span>
                    <strong>Nature</strong>
                    {selectedActivity.nature}
                  </span>
                  <span>
                    <strong>Criticality</strong>
                    {selectedActivity.criticality}
                  </span>
                  <span>
                    <strong>Cost</strong>
                    {fmtCost(selectedActivity.activityCost)}
                  </span>
                  <span>
                    <strong>FTE</strong>
                    {selectedActivity.activityFte.toFixed(2)}
                  </span>
                  <span>
                    <strong>People</strong>
                    {selectedActivity.assignedPeople}
                  </span>
                  <span>
                    <strong>Departments</strong>
                    {selectedActivity.departmentsInvolved}
                  </span>
                </div>
                <div className={styles.workCapabilityDetailSection}>
                  <strong>Ownership</strong>
                  <table>
                    <tbody>
                      <tr>
                        <th>Accountable</th>
                        <td>{selectedActivity.accountableCount}</td>
                      </tr>
                      <tr>
                        <th>Responsible</th>
                        <td>{selectedActivity.responsibleCount}</td>
                      </tr>
                      <tr>
                        <th>Consulted</th>
                        <td>{selectedActivity.consultedCount}</td>
                      </tr>
                      <tr>
                        <th>Informed</th>
                        <td>{selectedActivity.informedCount}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className={styles.workCapabilityDetailSection}>
                  <strong>Risk flags</strong>
                  <p>{selectedActivity.riskFlags.join(", ") || "None"}</p>
                </div>
              </div>
            ) : (
              <div className={styles.workCapabilityActivityDetailEmpty}>
                <h3>Select an activity</h3>
                <p>
                  Click a row to review activity workload, ownership, and
                  savings details.
                </p>
              </div>
            )}
          </aside>
        </div>
      )}

      {activeTab === "people" && (
        <div
          className={styles.workCapabilityCatalogWorkspace}
          style={{ marginTop: 18 }}
        >
          <div className={styles.workCapabilityActivityTableWrap}>
            <table className={styles.workCapabilityActivityTable}>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Role</th>
                  <th>Department</th>
                  <th>Activities</th>
                  <th>Workload</th>
                  <th>Cost</th>
                  <th>FTE</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((employee) => (
                  <tr
                    key={employee.employeeId}
                    className={
                      employee.employeeId === selectedEmployeeId
                        ? styles.workCapabilityActivityRowSelected
                        : ""
                    }
                    onClick={() => setSelectedEmployeeId(employee.employeeId)}
                  >
                    <td>{employee.employeeName}</td>
                    <td>{employee.role}</td>
                    <td>{employee.department}</td>
                    <td>{employee.activityCount}</td>
                    <td>{formatPct(employee.totalWorkloadPct)}</td>
                    <td>{fmtCost(employee.mappedCost)}</td>
                    <td>{employee.mappedFTE.toFixed(2)}</td>
                    <td>{employee.workloadStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <aside className={styles.workCapabilityActivityDetailPanel}>
            {selectedEmployee ? (
              <div className={styles.workCapabilityActivityDetailInner}>
                <div className={styles.workCapabilityDetailHeader}>
                  <div>
                    <p className={styles.workCapabilityKicker}>
                      Employee detail
                    </p>
                    <h3>{selectedEmployee.employeeName}</h3>
                  </div>
                </div>
                <div className={styles.workCapabilityReadOnlyFacts}>
                  <span>
                    <strong>Role</strong>
                    {selectedEmployee.role}
                  </span>
                  <span>
                    <strong>Department</strong>
                    {selectedEmployee.department}
                  </span>
                  <span>
                    <strong>Workload</strong>
                    {formatPct(selectedEmployee.totalWorkloadPct)}
                  </span>
                  <span>
                    <strong>Mapped cost</strong>
                    {fmtCost(selectedEmployee.mappedCost)}
                  </span>
                  <span>
                    <strong>Mapped FTE</strong>
                    {selectedEmployee.mappedFTE.toFixed(2)}
                  </span>
                  <span>
                    <strong>Status</strong>
                    {selectedEmployee.workloadStatus}
                  </span>
                </div>
                <div className={styles.workCapabilityDetailSection}>
                  <strong>Activities</strong>
                  <table>
                    <tbody>
                      {portfolio.activities
                        .filter((activity) =>
                          activity.deliveryFootprint.some(
                            (row) =>
                              row.employeeId === selectedEmployee.employeeId,
                          ),
                        )
                        .map((activity) => (
                          <tr key={activity.activityId}>
                            <th>{activity.activityName}</th>
                            <td>{fmtCost(activity.activityCost)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className={styles.workCapabilityActivityDetailEmpty}>
                <h3>Select an employee</h3>
                <p>
                  Click a row to see workload allocation and cost contributions.
                </p>
              </div>
            )}
          </aside>
        </div>
      )}

      {activeTab === "ownership" && (
        <div style={{ display: "grid", gap: 18, marginTop: 18 }}>
          <section className={styles.workCapabilityPanel}>
            <strong>Ownership gaps by category</strong>
            <div style={{ marginTop: 12 }}>
              <table className={styles.workCapabilityActivityTable}>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Gap count</th>
                    <th>Fragmented activities</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from(
                    portfolio.activities
                      .reduce((map, activity) => {
                        const key = activity.category || "Uncategorized";
                        const summary = map.get(key) ?? {
                          gap: 0,
                          fragmented: 0,
                        };
                        if (
                          activity.accountableCount === 0 ||
                          activity.responsibleCount === 0
                        )
                          summary.gap += 1;
                        if (
                          activity.departmentsInvolved >= 3 ||
                          activity.assignedPeople >= 10
                        )
                          summary.fragmented += 1;
                        map.set(key, summary);
                        return map;
                      }, new Map<string, { gap: number; fragmented: number }>())
                      .entries(),
                  ).map(([category, summary]) => (
                    <tr key={category}>
                      <td>{category}</td>
                      <td>{summary.gap}</td>
                      <td>{summary.fragmented}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className={styles.workCapabilityPanel}>
            <strong>Activity RACI matrix</strong>
            <div style={{ marginTop: 12, overflowX: "auto" }}>
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
                    <th>High-criticality gap</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredActivities.map((activity) => {
                    const noAccountable = activity.accountableCount === 0;
                    const noResponsible = activity.responsibleCount === 0;
                    const multiAccountable = activity.accountableCount > 1;
                    const highCriticalityGap =
                      activity.criticality === "High" &&
                      (noAccountable || noResponsible);
                    return (
                      <tr key={activity.activityId}>
                        <td>{activity.activityName}</td>
                        <td>{activity.accountableCount}</td>
                        <td>{activity.responsibleCount}</td>
                        <td>{activity.consultedCount}</td>
                        <td>{activity.informedCount}</td>
                        <td>{noAccountable ? "Yes" : "No"}</td>
                        <td>{noResponsible ? "Yes" : "No"}</td>
                        <td>{multiAccountable ? "Yes" : "No"}</td>
                        <td>{highCriticalityGap ? "Yes" : "No"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {activeTab === "automation" && (
        <div style={{ display: "grid", gap: 18, marginTop: 18 }}>
          <section className={styles.workCapabilityPanel}>
            <strong>Automation savings table</strong>
            <div style={{ marginTop: 12, overflowX: "auto" }}>
              <table className={styles.workCapabilityActivityTable}>
                <thead>
                  <tr>
                    <th>Activity</th>
                    <th>Criticality</th>
                    <th>Nature</th>
                    <th>Cost</th>
                    <th>Automation %</th>
                    <th>Automation saving</th>
                    <th>Risk flags</th>
                  </tr>
                </thead>
                <tbody>
                  {automationCandidates.map((activity) => (
                    <tr
                      key={activity.activityId}
                      onClick={() => setSelectedActivityId(activity.activityId)}
                      className={
                        activity.activityId === selectedActivityId
                          ? styles.workCapabilityActivityRowSelected
                          : ""
                      }
                    >
                      <td>{activity.activityName}</td>
                      <td>{activity.criticality}</td>
                      <td>{activity.nature}</td>
                      <td>{fmtCost(activity.activityCost)}</td>
                      <td>{formatPct(activity.automationCostReductionPct)}</td>
                      <td>{fmtCost(activity.automationSaving)}</td>
                      <td>{activity.riskFlags.join("; ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className={styles.workCapabilityPanel}>
            <strong>Risk vs saving matrix</strong>
            <table
              className={styles.workCapabilityActivityTable}
              style={{ marginTop: 12 }}
            >
              <thead>
                <tr>
                  <th>Risk</th>
                  <th>High saving</th>
                  <th>Lower saving</th>
                </tr>
              </thead>
              <tbody>
                {riskSavingMatrix.rows.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td>{row.high}</td>
                    <td>{row.low}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className={styles.workCapabilityPanel}>
            <strong>Selected activity adoption scenario</strong>
            <div style={{ marginTop: 12 }}>
              <p style={{ margin: 0, marginBottom: 10 }}>
                {selectedActivity
                  ? selectedActivity.activityName
                  : "Pick an activity from the automation table above."}
              </p>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={adoptionPct}
                onChange={(event) => setAdoptionPct(Number(event.target.value))}
                disabled={!selectedActivity}
                style={{ width: "100%" }}
              />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 18,
                  marginTop: 14,
                }}
              >
                <div
                  style={{
                    background: "var(--cream)",
                    padding: 12,
                    borderRadius: 6,
                  }}
                >
                  <span
                    style={{
                      display: "block",
                      marginBottom: 8,
                      color: "var(--slate-light)",
                      textTransform: "uppercase",
                      fontSize: 11,
                    }}
                  >
                    Adoption
                  </span>
                  <strong>{adoptionPct}%</strong>
                </div>
                <div
                  style={{
                    background: "var(--cream)",
                    padding: 12,
                    borderRadius: 6,
                  }}
                >
                  <span
                    style={{
                      display: "block",
                      marginBottom: 8,
                      color: "var(--slate-light)",
                      textTransform: "uppercase",
                      fontSize: 11,
                    }}
                  >
                    Estimated saving
                  </span>
                  <strong>
                    {selectedActivity
                      ? fmtCost(
                          (selectedActivity.automationSaving * adoptionPct) /
                            100,
                        )
                      : "$0"}
                  </strong>
                </div>
                <div
                  style={{
                    background: "var(--cream)",
                    padding: 12,
                    borderRadius: 6,
                  }}
                >
                  <span
                    style={{
                      display: "block",
                      marginBottom: 8,
                      color: "var(--slate-light)",
                      textTransform: "uppercase",
                      fontSize: 11,
                    }}
                  >
                    Estimated FTE release
                  </span>
                  <strong>
                    {selectedActivity
                      ? `${((selectedActivity.activityFte * adoptionPct) / 100).toFixed(2)} FTE`
                      : "0.00 FTE"}
                  </strong>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
