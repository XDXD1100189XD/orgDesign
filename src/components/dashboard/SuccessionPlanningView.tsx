"use client";

import { useMemo, useState } from "react";
import {
  buildSuccessionPlanningPortfolio,
  type SuccessionCandidateMetric,
  type SuccessionCandidateRecord,
  type SuccessionCandidateStatus,
  type SuccessionCriticalRoleMetric,
  type SuccessionPlanningPortfolio,
  type WorkCapabilityDataset,
} from "@/lib/workCapabilityDataset";
import type { ColumnMapping } from "@/lib/fieldDictionary";
import type { ExcelRow } from "@/lib/parseExcel";
import styles from "./SkillsCapabilityView.module.css";

type SuccessionTab =
  | "overview"
  | "critical-roles"
  | "candidates"
  | "conflicts"
  | "role-detail";

type SuccessionPlanningProps = {
  dataset: WorkCapabilityDataset | null;
  orgRows: ExcelRow[];
  orgEmployeeIdColumn: string;
  columnMapping: ColumnMapping | null;
  successionCandidates: SuccessionCandidateRecord[];
  onSuccessionCandidatesChange: (rows: SuccessionCandidateRecord[]) => void;
};

const tabs: Array<{ id: SuccessionTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "critical-roles", label: "Critical Roles" },
  { id: "candidates", label: "Successor Candidates" },
  { id: "conflicts", label: "Successor Load / Conflict" },
  { id: "role-detail", label: "Role Detail" },
];

const statusOptions: SuccessionCandidateStatus[] = [
  "Suggested",
  "Selected",
  "Rejected",
  "Backup",
];

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function pct(value: number) {
  return `${value.toFixed(1)}%`;
}

function money(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function riskClass(value: string) {
  if (value === "High" || value === "High conflict" || value === "Capacity risk" || value === "Backfill risk") return styles.badgeRed;
  if (value === "Medium" || value === "Attention" || value === "Review required") return styles.badgeOrange;
  if (value === "Low" || value === "Ready Now") return styles.badgeGreen;
  if (value === "Ready Soon" || value === "Backup") return styles.badgeAmber;
  return styles.badgeNeutral;
}

function candidatePairKey(targetEmployeeId: string, candidateEmployeeId: string) {
  return `${targetEmployeeId}::${candidateEmployeeId}`;
}

function toSuccessionRecord(
  candidate: SuccessionCandidateMetric,
  status: SuccessionCandidateStatus,
): SuccessionCandidateRecord {
  const selected = status === "Selected" || status === "Backup";
  return {
    target_employee_id: candidate.targetEmployeeId,
    candidate_employee_id: candidate.candidateEmployeeId,
    readiness_score: candidate.readinessScore,
    readiness_status: candidate.readinessStatus,
    rank: candidate.rank,
    status,
    selected_flag: selected,
    already_selected_count: selected ? Math.max(1, candidate.alreadySelectedFor) : candidate.alreadySelectedFor,
    attention_flag: candidate.attentionFlag,
    attention_reason: candidate.attentionReason,
  };
}

export default function SuccessionPlanningView({
  dataset,
  orgRows,
  orgEmployeeIdColumn,
  columnMapping,
  successionCandidates,
  onSuccessionCandidatesChange,
}: SuccessionPlanningProps) {
  const [activeTab, setActiveTab] = useState<SuccessionTab>("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState("");
  const [selectedTargetEmployeeId, setSelectedTargetEmployeeId] =
    useState<string | null>(null);

  const portfolio = useMemo<SuccessionPlanningPortfolio | null>(() => {
    if (!dataset) return null;
    return buildSuccessionPlanningPortfolio({
      dataset,
      orgRows,
      orgEmployeeIdColumn,
      columnMapping,
      successionCandidates,
    });
  }, [
    dataset,
    orgRows,
    orgEmployeeIdColumn,
    columnMapping,
    successionCandidates,
  ]);

  const selectedRole = useMemo(() => {
    if (!portfolio) return null;
    return (
      portfolio.criticalRoles.find(
        (role) => role.employeeId === selectedTargetEmployeeId,
      ) ??
      portfolio.criticalRoles[0] ??
      null
    );
  }, [portfolio, selectedTargetEmployeeId]);

  const filteredRoles = useMemo(() => {
    if (!portfolio) return [];
    const query = searchQuery.trim().toLowerCase();
    return portfolio.criticalRoles.filter((role) => {
      const matchesSearch =
        !query ||
        [role.employeeName, role.role, role.department, role.grade]
          .join(" ")
          .toLowerCase()
          .includes(query);
      const matchesDepartment =
        !departmentFilter || role.department === departmentFilter;
      const matchesRisk = !riskFilter || role.successionRisk === riskFilter;
      return matchesSearch && matchesDepartment && matchesRisk;
    });
  }, [portfolio, searchQuery, departmentFilter, riskFilter]);

  const selectedCandidates = useMemo(() => {
    if (!portfolio || !selectedRole) return [];
    return portfolio.candidates.filter(
      (candidate) => candidate.targetEmployeeId === selectedRole.employeeId,
    );
  }, [portfolio, selectedRole]);

  const updateCandidateStatus = (
    candidate: SuccessionCandidateMetric,
    status: SuccessionCandidateStatus,
  ) => {
    const key = candidatePairKey(
      candidate.targetEmployeeId,
      candidate.candidateEmployeeId,
    );
    const nextRecord = toSuccessionRecord(candidate, status);
    const next = [
      ...successionCandidates.filter(
        (record) =>
          candidatePairKey(
            record.target_employee_id,
            record.candidate_employee_id,
          ) !== key,
      ),
      nextRecord,
    ];
    onSuccessionCandidatesChange(next);
  };

  if (!portfolio) {
    return (
      <div className={styles.centerState}>
        <p>Load Work & Capability datasets to view succession planning.</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>Work & Capability Analysis</div>
          <h2 className={styles.title}>Succession Planning</h2>
          <p className={styles.subtitle}>
            Deterministic critical-role coverage, successor readiness, workload
            conflicts, and selected-candidate attention flags.
          </p>
        </div>
        <div className={styles.controls}>
          <input
            className={styles.input}
            type="search"
            placeholder="Search role, incumbent, department..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <select
            className={styles.select}
            value={departmentFilter}
            onChange={(event) => setDepartmentFilter(event.target.value)}
          >
            <option value="">All departments</option>
            {portfolio.filterOptions.departments.map((department) => (
              <option key={department} value={department}>
                {department}
              </option>
            ))}
          </select>
          <select
            className={styles.select}
            value={riskFilter}
            onChange={(event) => setRiskFilter(event.target.value)}
          >
            <option value="">All risks</option>
            {portfolio.filterOptions.riskStatuses.map((risk) => (
              <option key={risk} value={risk}>
                {risk}
              </option>
            ))}
          </select>
          <button className={styles.secondaryButton} type="button">
            Export
          </button>
        </div>
      </header>

      <KpiStrip portfolio={portfolio} />

      <section className={styles.panel}>
        <nav className={styles.tabs} aria-label="Succession planning views">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={cx(
                styles.tab,
                activeTab === tab.id && styles.tabActive,
              )}
              type="button"
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <div className={styles.panelBody}>
          {activeTab === "overview" && (
            <OverviewTab portfolio={portfolio} roles={filteredRoles} />
          )}
          {activeTab === "critical-roles" && (
            <CriticalRolesTab
              roles={filteredRoles}
              onSelect={(employeeId) => {
                setSelectedTargetEmployeeId(employeeId);
                setActiveTab("role-detail");
              }}
            />
          )}
          {activeTab === "candidates" && selectedRole && (
            <CandidatesTab
              roles={portfolio.criticalRoles}
              selectedRole={selectedRole}
              candidates={selectedCandidates}
              onRoleChange={setSelectedTargetEmployeeId}
              onStatusChange={updateCandidateStatus}
            />
          )}
          {activeTab === "conflicts" && (
            <ConflictTab loads={portfolio.successorLoads} />
          )}
          {activeTab === "role-detail" && selectedRole && (
            <RoleDetailTab
              role={selectedRole}
              candidates={selectedCandidates}
              onStatusChange={updateCandidateStatus}
            />
          )}
        </div>
      </section>
    </div>
  );
}

function KpiStrip({ portfolio }: { portfolio: SuccessionPlanningPortfolio }) {
  const kpis = [
    ["Critical roles", portfolio.kpis.criticalRoles, styles.metricBlue],
    ["Without successor", portfolio.kpis.rolesWithoutSuccessor, styles.metricRed],
    ["Only one successor", portfolio.kpis.rolesWithOneSuccessor, styles.metricOrange],
    ["Avg readiness", pct(portfolio.kpis.averageSuccessorReadiness), styles.metricGreen],
    ["High-risk roles", portfolio.kpis.highRiskRoles, styles.metricRed],
    ["Duplicate flags", portfolio.kpis.duplicateSuccessorFlags, styles.metricPurple],
    ["Critical activity dep.", portfolio.kpis.criticalActivityDependency, styles.metricNeutral],
  ];

  return (
    <section className={styles.kpiGrid}>
      {kpis.map(([label, value, tone]) => (
        <article className={styles.kpiCard} key={String(label)}>
          <div className={cx(styles.kpiValue, String(tone))}>{value}</div>
          <div className={styles.kpiLabel}>{label}</div>
        </article>
      ))}
    </section>
  );
}

function OverviewTab({
  portfolio,
  roles,
}: {
  portfolio: SuccessionPlanningPortfolio;
  roles: SuccessionCriticalRoleMetric[];
}) {
  const departments = portfolio.filterOptions.departments;
  const maxHighRisk = Math.max(
    1,
    ...departments.map(
      (department) =>
        portfolio.criticalRoles.filter(
          (role) =>
            role.department === department && role.successionRisk === "High",
        ).length,
    ),
  );
  const readinessBuckets = [
    ["Ready Now", portfolio.candidates.filter((row) => row.readinessScore >= 85).length],
    ["Ready Soon", portfolio.candidates.filter((row) => row.readinessScore >= 70 && row.readinessScore < 85).length],
    ["Development", portfolio.candidates.filter((row) => row.readinessScore >= 50 && row.readinessScore < 70).length],
    ["Not Recommended", portfolio.candidates.filter((row) => row.readinessScore < 50).length],
  ];

  return (
    <div className={styles.overviewGrid}>
      <article className={styles.card}>
        <div className={styles.cardHeader}>
          <h3>Succession Risk by Department</h3>
        </div>
        <div className={styles.barList}>
          {departments.map((department) => {
            const count = portfolio.criticalRoles.filter(
              (role) =>
                role.department === department && role.successionRisk === "High",
            ).length;
            return (
              <MetricBar
                key={department}
                label={department}
                value={count}
                width={(count / maxHighRisk) * 100}
                tone="red"
              />
            );
          })}
        </div>
      </article>
      <article className={styles.card}>
        <div className={styles.cardHeader}>
          <h3>Readiness Distribution</h3>
        </div>
        <div className={styles.distributionGrid}>
          {readinessBuckets.map(([label, count], index) => (
            <div className={styles.distributionCard} key={String(label)}>
              <strong
                className={cx(
                  index === 0 && styles.metricGreen,
                  index === 1 && styles.metricAmber,
                  index === 2 && styles.metricOrange,
                  index === 3 && styles.metricRed,
                )}
              >
                {count}
              </strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </article>
      <article className={cx(styles.card, styles.fullWidth)}>
        <div className={styles.cardHeader}>
          <h3>Top Succession Risks</h3>
          <span>Critical roles ordered by risk and criticality score.</span>
        </div>
        <RoleTable roles={roles.slice(0, 10)} />
      </article>
    </div>
  );
}

function MetricBar({
  label,
  value,
  width,
  tone,
}: {
  label: string;
  value: number;
  width: number;
  tone: "red" | "green";
}) {
  return (
    <div className={styles.metricBar}>
      <span title={label}>{label}</span>
      <div className={styles.barTrack}>
        <div
          className={cx(
            styles.barFill,
            tone === "red" ? styles.barRed : styles.barGreen,
          )}
          style={{ width: `${Math.max(2, Math.min(100, width))}%` }}
        />
      </div>
      <strong>{value}</strong>
    </div>
  );
}

function CriticalRolesTab({
  roles,
  onSelect,
}: {
  roles: SuccessionCriticalRoleMetric[];
  onSelect: (employeeId: string) => void;
}) {
  return (
    <article className={styles.card}>
      <div className={styles.cardHeader}>
        <h3>Critical Roles</h3>
        <span>Select a row to open role detail.</span>
      </div>
      <RoleTable roles={roles} onSelect={onSelect} />
    </article>
  );
}

function RoleTable({
  roles,
  onSelect,
}: {
  roles: SuccessionCriticalRoleMetric[];
  onSelect?: (employeeId: string) => void;
}) {
  return (
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Role / incumbent</th>
            <th>Department</th>
            <th>Grade</th>
            <th>Span</th>
            <th>Loaded cost</th>
            <th>Critical activities</th>
            <th>Critical skills</th>
            <th>Successors</th>
            <th>Best readiness</th>
            <th>Risk</th>
          </tr>
        </thead>
        <tbody>
          {roles.map((role) => (
            <tr
              key={role.employeeId}
              className={onSelect ? styles.clickRow : undefined}
              onClick={() => onSelect?.(role.employeeId)}
            >
              <td>
                <strong>{role.employeeName}</strong>
                <br />
                {role.role || "-"}
              </td>
              <td>{role.department || "-"}</td>
              <td>{role.grade || "-"}</td>
              <td>{role.span}</td>
              <td>{money(role.loadedCost)}</td>
              <td>{role.criticalActivitiesOwned}</td>
              <td>{role.requiredCriticalSkills}</td>
              <td>{role.successorCount}</td>
              <td>{pct(role.bestSuccessorReadiness)}</td>
              <td>
                <span className={cx(styles.badge, riskClass(role.successionRisk))}>
                  {role.successionRisk}
                </span>
              </td>
            </tr>
          ))}
          {roles.length === 0 && (
            <tr>
              <td colSpan={10}>No critical roles match current filters.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function CandidatesTab({
  roles,
  selectedRole,
  candidates,
  onRoleChange,
  onStatusChange,
}: {
  roles: SuccessionCriticalRoleMetric[];
  selectedRole: SuccessionCriticalRoleMetric;
  candidates: SuccessionCandidateMetric[];
  onRoleChange: (employeeId: string) => void;
  onStatusChange: (
    candidate: SuccessionCandidateMetric,
    status: SuccessionCandidateStatus,
  ) => void;
}) {
  return (
    <article className={styles.card}>
      <div className={styles.cardHeaderRow}>
        <div>
          <h3>Successor Candidates</h3>
          <span>Ranked deterministically by required skill readiness.</span>
        </div>
        <select
          className={styles.select}
          value={selectedRole.employeeId}
          onChange={(event) => onRoleChange(event.target.value)}
        >
          {roles.map((role) => (
            <option key={role.employeeId} value={role.employeeId}>
              {role.employeeName} - {role.role}
            </option>
          ))}
        </select>
      </div>
      <CandidateTable candidates={candidates} onStatusChange={onStatusChange} />
    </article>
  );
}

function CandidateTable({
  candidates,
  onStatusChange,
}: {
  candidates: SuccessionCandidateMetric[];
  onStatusChange: (
    candidate: SuccessionCandidateMetric,
    status: SuccessionCandidateStatus,
  ) => void;
}) {
  return (
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Candidate</th>
            <th>Current role</th>
            <th>Department</th>
            <th>Grade</th>
            <th>Readiness</th>
            <th>Covered</th>
            <th>Minor</th>
            <th>Major</th>
            <th>Critical</th>
            <th>Workload</th>
            <th>Selected for</th>
            <th>Status</th>
            <th>Attention</th>
          </tr>
        </thead>
        <tbody>
          {candidates.slice(0, 100).map((candidate) => (
            <tr
              key={candidatePairKey(
                candidate.targetEmployeeId,
                candidate.candidateEmployeeId,
              )}
            >
              <td>{candidate.candidateName}</td>
              <td>{candidate.currentRole || "-"}</td>
              <td>{candidate.department || "-"}</td>
              <td>{candidate.grade || "-"}</td>
              <td>{pct(candidate.readinessScore)}</td>
              <td>{candidate.coveredSkills}</td>
              <td>{candidate.minorGaps}</td>
              <td>{candidate.majorGaps}</td>
              <td>{candidate.criticalGaps}</td>
              <td>{pct(candidate.currentWorkloadPct)}</td>
              <td>{candidate.alreadySelectedFor}</td>
              <td>
                <select
                  className={styles.select}
                  value={candidate.status}
                  onChange={(event) =>
                    onStatusChange(
                      candidate,
                      event.target.value as SuccessionCandidateStatus,
                    )
                  }
                >
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                {candidate.attentionFlag ? candidate.attentionReason || "Review" : "-"}
              </td>
            </tr>
          ))}
          {candidates.length === 0 && (
            <tr>
              <td colSpan={13}>No candidates found for this role.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ConflictTab({
  loads,
}: {
  loads: SuccessionPlanningPortfolio["successorLoads"];
}) {
  return (
    <article className={styles.card}>
      <div className={styles.cardHeader}>
        <h3>Successor Load / Conflict</h3>
        <span>Shows candidates explicitly selected or marked as backup.</span>
      </div>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Candidate</th>
              <th>Selected target roles</th>
              <th>Count</th>
              <th>Avg readiness</th>
              <th>Workload</th>
              <th>Conflict risk</th>
              <th>Recommended action</th>
            </tr>
          </thead>
          <tbody>
            {loads.map((load) => (
              <tr key={load.candidateEmployeeId}>
                <td>{load.candidateName}</td>
                <td>{load.selectedTargetRoles.join("; ")}</td>
                <td>{load.selectedTargetCount}</td>
                <td>{pct(load.averageReadiness)}</td>
                <td>{pct(load.currentWorkloadPct)}</td>
                <td>
                  <span className={cx(styles.badge, riskClass(load.conflictRisk))}>
                    {load.conflictRisk}
                  </span>
                </td>
                <td>{load.recommendedAction}</td>
              </tr>
            ))}
            {loads.length === 0 && (
              <tr>
                <td colSpan={7}>No selected successor conflicts yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function RoleDetailTab({
  role,
  candidates,
  onStatusChange,
}: {
  role: SuccessionCriticalRoleMetric;
  candidates: SuccessionCandidateMetric[];
  onStatusChange: (
    candidate: SuccessionCandidateMetric,
    status: SuccessionCandidateStatus,
  ) => void;
}) {
  return (
    <div className={styles.overviewGrid}>
      <article className={styles.card}>
        <div className={styles.cardHeader}>
          <h3>{role.employeeName}</h3>
          <span>{role.role}</span>
        </div>
        <div className={styles.distributionGrid}>
          <MiniMetric label="Department" value={role.department || "-"} />
          <MiniMetric label="Grade" value={role.grade || "-"} />
          <MiniMetric label="Span" value={role.span} />
          <MiniMetric label="Risk" value={role.successionRisk} />
        </div>
      </article>
      <article className={styles.card}>
        <div className={styles.cardHeader}>
          <h3>Critical Activity Dependency</h3>
        </div>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Activity</th>
                <th>Criticality</th>
                <th>Time</th>
                <th>Accountability</th>
              </tr>
            </thead>
            <tbody>
              {role.criticalActivityDetails.map((activity) => (
                <tr key={activity.activityId}>
                  <td>{activity.activityName}</td>
                  <td>{activity.criticality}</td>
                  <td>{pct(activity.timeAllocationPct)}</td>
                  <td>{activity.accountability}</td>
                </tr>
              ))}
              {role.criticalActivityDetails.length === 0 && (
                <tr>
                  <td colSpan={4}>No high-criticality owned activities.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
      <article className={cx(styles.card, styles.fullWidth)}>
        <div className={styles.cardHeader}>
          <h3>Ranked Successor Candidates</h3>
          <span>Select, backup, or reject candidates for this role.</span>
        </div>
        <CandidateTable candidates={candidates} onStatusChange={onStatusChange} />
      </article>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className={styles.miniMetric}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
