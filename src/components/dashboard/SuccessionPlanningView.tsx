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
import shared from "./SkillsCapabilityView.module.css";
import sp from "./SuccessionPlanningView.module.css";

type SuccessionPlanningProps = {
  dataset: WorkCapabilityDataset | null;
  orgRows: ExcelRow[];
  orgEmployeeIdColumn: string;
  columnMapping: ColumnMapping | null;
  successionCandidates: SuccessionCandidateRecord[];
  onSuccessionCandidatesChange: (rows: SuccessionCandidateRecord[]) => void;
  embeddedMode?: boolean;
  embeddedSection?: "all" | "risk-overview" | "remaining" | "attention-flags";
};

const statusOptions: SuccessionCandidateStatus[] = [
  "Suggested",
  "Selected",
  "Backup",
  "Rejected",
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

function riskBadge(value: string) {
  if (
    value === "High" ||
    value === "High conflict" ||
    value === "Capacity risk" ||
    value === "Backfill risk"
  )
    return shared.badgeRed;
  if (
    value === "Medium" ||
    value === "Attention" ||
    value === "Review required"
  )
    return shared.badgeOrange;
  if (value === "Low" || value === "Ready Now") return shared.badgeGreen;
  if (value === "Ready Soon" || value === "Backup") return shared.badgeAmber;
  return shared.badgeNeutral;
}

function candidatePairKey(
  targetEmployeeId: string,
  candidateEmployeeId: string,
) {
  return `${targetEmployeeId}::${candidateEmployeeId}`;
}

type ScoredCandidate = {
  candidate: SuccessionCandidateMetric;
  fitType: "Same dept" | "Cross-functional";
  fitScore: number;
};

function parseGradeLevel(grade: string | null | undefined): number {
  if (!grade) return 0;
  const num = grade.match(/(\d+)/);
  if (num) return parseInt(num[1], 10);
  const letter = grade.trim().match(/^([A-Za-z])/);
  if (letter) return letter[1].toUpperCase().charCodeAt(0) - 64;
  return 0;
}

function scoreCandidateFit(
  candidate: SuccessionCandidateMetric,
  targetDept: string,
  targetGrade: string,
): ScoredCandidate {
  let score = 0;
  const sameDept =
    !!candidate.department && candidate.department === targetDept;
  score += sameDept ? 40 : 0;

  const targetLevel = parseGradeLevel(targetGrade);
  const candLevel = parseGradeLevel(candidate.grade);
  if (targetLevel > 0 && candLevel > 0) {
    const diff = Math.abs(targetLevel - candLevel);
    if (diff === 0) score += 30;
    else if (diff === 1) score += 22;
    else if (diff === 2) score += 12;
  }

  score += (candidate.readinessScore / 100) * 20;
  if (candidate.currentWorkloadPct > 100) score -= 5;
  if (candidate.attentionFlag) score -= 5;

  return {
    candidate,
    fitType: sameDept ? "Same dept" : "Cross-functional",
    fitScore: score,
  };
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
    already_selected_count: selected
      ? Math.max(1, candidate.alreadySelectedFor)
      : candidate.alreadySelectedFor,
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
  embeddedMode = false,
  embeddedSection = "all",
}: SuccessionPlanningProps) {
  const [riskFilter, setRiskFilter] = useState("");
  const [selectedTargetEmployeeId, setSelectedTargetEmployeeId] = useState<
    string | null
  >(null);
  const [cockpitSearch, setCockpitSearch] = useState("");
  const [cockpitDeptFilter, setCockpitDeptFilter] = useState("");

  const portfolio = useMemo<SuccessionPlanningPortfolio | null>(() => {
    if (!dataset) return null;
    return buildSuccessionPlanningPortfolio({
      dataset,
      orgRows,
      orgEmployeeIdColumn,
      columnMapping,
      successionCandidates,
    });
  }, [dataset, orgRows, orgEmployeeIdColumn, columnMapping, successionCandidates]);

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
    const query = cockpitSearch.trim().toLowerCase();
    return portfolio.criticalRoles.filter((role) => {
      const matchesSearch =
        !query ||
        [role.employeeName, role.role, role.department, role.grade]
          .join(" ")
          .toLowerCase()
          .includes(query);
      const matchesDept =
        !cockpitDeptFilter || role.department === cockpitDeptFilter;
      const matchesRisk =
        !riskFilter || role.successionRisk === riskFilter;
      return matchesSearch && matchesDept && matchesRisk;
    });
  }, [portfolio, cockpitSearch, cockpitDeptFilter, riskFilter]);

  const selectedCandidates = useMemo((): ScoredCandidate[] => {
    if (!portfolio || !selectedRole) return [];
    const targetLevel = parseGradeLevel(selectedRole.grade);
    return portfolio.candidates
      .filter((c) => {
        if (c.targetEmployeeId !== selectedRole.employeeId) return false;
        if (targetLevel > 0) {
          const candLevel = parseGradeLevel(c.grade);
          if (candLevel > 0) {
            const diff = targetLevel - candLevel;
            if (diff < 1 || diff > 2) return false;
          }
        }
        return true;
      })
      .map((c) =>
        scoreCandidateFit(c, selectedRole.department, selectedRole.grade),
      )
      .sort((a, b) => b.fitScore - a.fitScore);
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
        (r) =>
          candidatePairKey(r.target_employee_id, r.candidate_employee_id) !==
          key,
      ),
      nextRecord,
    ];
    onSuccessionCandidatesChange(next);
  };

  if (!portfolio) {
    return (
      <div className={shared.centerState}>
        <p>Load Work &amp; Capability datasets to view succession planning.</p>
      </div>
    );
  }

  const multipleSuccessors = Math.max(
    0,
    portfolio.kpis.criticalRoles -
      portfolio.kpis.rolesWithoutSuccessor -
      portfolio.kpis.rolesWithOneSuccessor,
  );

  const kpis = [
    {
      label: "Critical roles",
      value: portfolio.kpis.criticalRoles,
      tone: shared.metricBlue,
    },
    {
      label: "Without successor",
      value: portfolio.kpis.rolesWithoutSuccessor,
      tone: shared.metricRed,
    },
    {
      label: "Avg readiness",
      value: pct(portfolio.kpis.averageSuccessorReadiness),
      tone: shared.metricGreen,
    },
    {
      label: "High-risk roles",
      value: portfolio.kpis.highRiskRoles,
      tone: shared.metricRed,
    },
    {
      label: "Critical activity dep.",
      value: portfolio.kpis.criticalActivityDependency,
      tone: shared.metricNeutral,
    },
    {
      label: "Conflict flags",
      value: portfolio.kpis.duplicateSuccessorFlags,
      tone: shared.metricPurple,
    },
  ];

  if (embeddedMode && embeddedSection === "risk-overview") {
    return (
      <section className={sp.sectionPanel}>
        <div className={sp.sectionHeader}>
          <div>
            <h3 className={sp.sectionTitle}>Succession Risk</h3>
            <p className={sp.sectionSubtitle}>High-risk critical roles by department.</p>
          </div>
        </div>
        <div className={sp.sectionBody}>
          <RiskByDepartment portfolio={portfolio} />
        </div>
      </section>
    );
  }

  if (embeddedMode && embeddedSection === "remaining") {
    return (
      <>
        <section className={sp.sectionPanel}>
          <div className={sp.sectionHeader}>
            <div>
              <h3 className={sp.sectionTitle}>Critical Role Cockpit</h3>
              <p className={sp.sectionSubtitle}>
                Select a role to view its risk profile and succession details.
              </p>
            </div>
          </div>
          <div className={sp.cockpit}>
            <div className={sp.cockpitLeft}>
              <div className={sp.cockpitFilters}>
                <input
                  className={shared.input}
                  style={{ flex: "none", width: "100%" }}
                  type="search"
                  placeholder="Search role or incumbent..."
                  value={cockpitSearch}
                  onChange={(e) => setCockpitSearch(e.target.value)}
                />
                <select
                  className={shared.select}
                  style={{ flex: "none", width: "100%" }}
                  value={cockpitDeptFilter}
                  onChange={(e) => setCockpitDeptFilter(e.target.value)}
                >
                  <option value="">All departments</option>
                  {portfolio.filterOptions.departments.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div className={sp.cockpitList}>
                {filteredRoles.map((role) => (
                  <div
                    key={role.employeeId}
                    className={cx(
                      sp.roleRow,
                      role.employeeId === selectedRole?.employeeId &&
                        sp.roleRowSelected,
                    )}
                    onClick={() => setSelectedTargetEmployeeId(role.employeeId)}
                  >
                    <div>
                      <div className={sp.roleRowName}>{role.employeeName}</div>
                      <div className={sp.roleRowMeta}>
                        {role.role || "-"} | {role.department}
                      </div>
                    </div>
                    <span
                      className={cx(shared.badge, riskBadge(role.successionRisk))}
                    >
                      {role.successionRisk}
                    </span>
                  </div>
                ))}
                {filteredRoles.length === 0 && (
                  <div
                    style={{
                      padding: "20px 14px",
                      color: "var(--slate-light)",
                      fontSize: 12,
                    }}
                  >
                    No roles match current filters.
                  </div>
                )}
              </div>
            </div>

            <div className={sp.cockpitRight}>
              {selectedRole ? (
                <RoleProfile role={selectedRole} />
              ) : (
                <div className={sp.emptyProfile}>
                  Select a critical role from the list.
                </div>
              )}
            </div>
          </div>
        </section>

        <section className={sp.sectionPanel}>
          <div className={sp.sectionHeader}>
            <div>
              <h3 className={sp.sectionTitle}>Successor Candidates</h3>
              <p className={sp.sectionSubtitle}>
                {selectedRole
                  ? `Ranked candidates for ${selectedRole.employeeName}${selectedRole.role ? ` | ${selectedRole.role}` : ""}`
                  : "Select a role in the cockpit above to view candidates."}
              </p>
            </div>
          </div>
          <div className={sp.sectionBody}>
            {selectedRole ? (
              <CompactCandidateTable
                candidates={selectedCandidates}
                onStatusChange={updateCandidateStatus}
              />
            ) : (
              <p
                style={{ margin: 0, color: "var(--slate-light)", fontSize: 12 }}
              >
                Select a critical role to view candidates.
              </p>
            )}
          </div>
        </section>

      </>
    );
  }

  if (embeddedMode && embeddedSection === "attention-flags") {
    return (
      <section className={sp.sectionPanel}>
        <div className={sp.sectionHeader}>
          <div>
            <h3 className={sp.sectionTitle}>Attention Flags / Conflicts</h3>
            <p className={sp.sectionSubtitle}>
              Coverage gaps, workload risk, and selected-candidate conflicts.
            </p>
          </div>
        </div>
        <div className={sp.sectionBody}>
          <AttentionFlags portfolio={portfolio} />
        </div>
      </section>
    );
  }

  return (
    <div className={shared.wrap}>
      {/* Header */}
      <header className={shared.header}>
        <div>
          <div className={shared.eyebrow}>Work &amp; Capability Analysis</div>
          <h2 className={shared.title}>Succession Planning</h2>
          <p className={shared.subtitle}>
            Identify exposed critical roles, assess successor readiness, and
            flag capacity or coverage conflicts.
          </p>
        </div>
        <div className={shared.controls}>
          <select
            className={shared.select}
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
          >
            <option value="">All risks</option>
            {portfolio.filterOptions.riskStatuses.map((risk) => (
              <option key={risk} value={risk}>
                {risk}
              </option>
            ))}
          </select>
          <button className={shared.secondaryButton} type="button">
            Export
          </button>
        </div>
      </header>

      {/* KPI Strip */}
      <section className={shared.kpiGrid}>
        {kpis.map(({ label, value, tone }) => (
          <article className={shared.kpiCard} key={label}>
            <div className={cx(shared.kpiValue, tone)}>{value}</div>
            <div className={shared.kpiLabel}>{label}</div>
          </article>
        ))}
      </section>

      {/* ── Section 1: Succession Risk Overview ── */}
      <section className={sp.sectionPanel}>
        <div className={sp.sectionHeader}>
          <div>
            <h3 className={sp.sectionTitle}>Succession Risk Overview</h3>
            <p className={sp.sectionSubtitle}>
              Risk concentration by department, readiness pool, and coverage
              status.
            </p>
          </div>
        </div>
        <div className={sp.sectionBody}>
          <div className={sp.overviewCols}>
            <div className={sp.overviewCard}>
              <RiskByDepartment portfolio={portfolio} />
            </div>
            <div className={sp.overviewCard}>
              <ReadinessPool portfolio={portfolio} />
            </div>
          </div>
          <p className={sp.coverageSectionLabel}>Coverage Status</p>
          <div className={sp.coverageGrid}>
            <div className={sp.coverageCard}>
              <div className={cx(sp.coverageValue, shared.metricRed)}>
                {portfolio.kpis.rolesWithoutSuccessor}
              </div>
              <span className={sp.coverageLabel}>No Successor</span>
            </div>
            <div className={sp.coverageCard}>
              <div className={cx(sp.coverageValue, shared.metricOrange)}>
                {portfolio.kpis.rolesWithOneSuccessor}
              </div>
              <span className={sp.coverageLabel}>One Successor</span>
            </div>
            <div className={sp.coverageCard}>
              <div className={cx(sp.coverageValue, shared.metricGreen)}>
                {multipleSuccessors}
              </div>
              <span className={sp.coverageLabel}>Multiple Successors</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 2: Critical Role Cockpit ── */}
      <section className={sp.sectionPanel}>
        <div className={sp.sectionHeader}>
          <div>
            <h3 className={sp.sectionTitle}>Critical Role Cockpit</h3>
            <p className={sp.sectionSubtitle}>
              Select a role to view its risk profile and succession details.
            </p>
          </div>
        </div>
        <div className={sp.cockpit}>
          {/* Left: filterable role list */}
          <div className={sp.cockpitLeft}>
            <div className={sp.cockpitFilters}>
              <input
                className={shared.input}
                style={{ flex: "none", width: "100%" }}
                type="search"
                placeholder="Search role or incumbent…"
                value={cockpitSearch}
                onChange={(e) => setCockpitSearch(e.target.value)}
              />
              <select
                className={shared.select}
                style={{ flex: "none", width: "100%" }}
                value={cockpitDeptFilter}
                onChange={(e) => setCockpitDeptFilter(e.target.value)}
              >
                <option value="">All departments</option>
                {portfolio.filterOptions.departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div className={sp.cockpitList}>
              {filteredRoles.map((role) => (
                <div
                  key={role.employeeId}
                  className={cx(
                    sp.roleRow,
                    role.employeeId === selectedRole?.employeeId &&
                      sp.roleRowSelected,
                  )}
                  onClick={() => setSelectedTargetEmployeeId(role.employeeId)}
                >
                  <div>
                    <div className={sp.roleRowName}>{role.employeeName}</div>
                    <div className={sp.roleRowMeta}>
                      {role.role || "—"} · {role.department}
                    </div>
                  </div>
                  <span
                    className={cx(shared.badge, riskBadge(role.successionRisk))}
                  >
                    {role.successionRisk}
                  </span>
                </div>
              ))}
              {filteredRoles.length === 0 && (
                <div
                  style={{
                    padding: "20px 14px",
                    color: "var(--slate-light)",
                    fontSize: 12,
                  }}
                >
                  No roles match current filters.
                </div>
              )}
            </div>
          </div>

          {/* Right: selected role profile */}
          <div className={sp.cockpitRight}>
            {selectedRole ? (
              <RoleProfile role={selectedRole} />
            ) : (
              <div className={sp.emptyProfile}>
                Select a critical role from the list.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Section 3: Successor Candidates ── */}
      <section className={sp.sectionPanel}>
        <div className={sp.sectionHeader}>
          <div>
            <h3 className={sp.sectionTitle}>Successor Candidates</h3>
            <p className={sp.sectionSubtitle}>
              {selectedRole
                ? `Ranked candidates for ${selectedRole.employeeName}${selectedRole.role ? ` · ${selectedRole.role}` : ""}`
                : "Select a role in the cockpit above to view candidates."}
            </p>
          </div>
        </div>
        <div className={sp.sectionBody}>
          {selectedRole ? (
            <CompactCandidateTable
              candidates={selectedCandidates}
              onStatusChange={updateCandidateStatus}
            />
          ) : (
            <p
              style={{ margin: 0, color: "var(--slate-light)", fontSize: 12 }}
            >
              Select a critical role to view candidates.
            </p>
          )}
        </div>
      </section>

      {/* ── Section 4: Attention Flags ── */}
      <section className={sp.sectionPanel}>
        <div className={sp.sectionHeader}>
          <div>
            <h3 className={sp.sectionTitle}>Attention Flags / Conflicts</h3>
            <p className={sp.sectionSubtitle}>
              Coverage gaps, workload risk, and selected-candidate conflicts.
            </p>
          </div>
        </div>
        <div className={sp.sectionBody}>
          <AttentionFlags portfolio={portfolio} />
        </div>
      </section>
    </div>
  );
}

/* ── Sub-components ── */

function RiskByDepartment({
  portfolio,
}: {
  portfolio: SuccessionPlanningPortfolio;
}) {
  const departments = portfolio.filterOptions.departments;
  const maxHighRisk = Math.max(
    1,
    ...departments.map(
      (d) =>
        portfolio.criticalRoles.filter(
          (r) => r.department === d && r.successionRisk === "High",
        ).length,
    ),
  );

  return (
    <div>
      <p className={sp.miniLabel}>Succession Risk by Department</p>
      <div className={shared.barList}>
        {departments.map((d) => {
          const count = portfolio.criticalRoles.filter(
            (r) => r.department === d && r.successionRisk === "High",
          ).length;
          return (
            <div key={d} className={shared.metricBar}>
              <span title={d}>{d}</span>
              <div className={shared.barTrack}>
                <div
                  className={cx(shared.barFill, shared.barRed)}
                  style={{
                    width: `${Math.max(2, (count / maxHighRisk) * 100)}%`,
                  }}
                />
              </div>
              <strong>{count}</strong>
            </div>
          );
        })}
        {departments.length === 0 && (
          <p style={{ margin: 0, fontSize: 12, color: "var(--slate-light)" }}>
            No department data.
          </p>
        )}
      </div>
    </div>
  );
}

function ReadinessPool({
  portfolio,
}: {
  portfolio: SuccessionPlanningPortfolio;
}) {
  const buckets = [
    {
      label: "Ready Now",
      count: portfolio.candidates.filter((r) => r.readinessScore >= 85).length,
      tone: shared.metricGreen,
    },
    {
      label: "Ready Soon",
      count: portfolio.candidates.filter(
        (r) => r.readinessScore >= 70 && r.readinessScore < 85,
      ).length,
      tone: shared.metricAmber,
    },
    {
      label: "Development",
      count: portfolio.candidates.filter(
        (r) => r.readinessScore >= 50 && r.readinessScore < 70,
      ).length,
      tone: shared.metricOrange,
    },
  ];
  const notRecommended = portfolio.candidates.filter(
    (r) => r.readinessScore < 50,
  ).length;

  return (
    <div>
      <p className={sp.miniLabel}>Successor Readiness Pool</p>
      <div className={sp.threeCol}>
        {buckets.map(({ label, count, tone }) => (
          <div key={label} className={shared.distributionCard}>
            <strong className={tone}>{count}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      {notRecommended > 0 && (
        <p
          style={{
            margin: "10px 0 0",
            fontSize: 11,
            color: "var(--slate-light)",
          }}
        >
          +{notRecommended} candidate{notRecommended > 1 ? "s" : ""} not
          recommended (readiness &lt; 50%)
        </p>
      )}
    </div>
  );
}

function RoleProfile({ role }: { role: SuccessionCriticalRoleMetric }) {
  const metrics = [
    { label: "Department", value: role.department || "—" },
    { label: "Grade", value: role.grade || "—" },
    { label: "Span", value: String(role.span) },
    { label: "Risk", value: role.successionRisk },
    { label: "Loaded Cost", value: `$${money(role.loadedCost)}` },
    { label: "Successors", value: String(role.successorCount) },
    { label: "Best Readiness", value: pct(role.bestSuccessorReadiness) },
    {
      label: "Critical Activities",
      value: String(role.criticalActivitiesOwned),
    },
    { label: "Critical Skills", value: String(role.requiredCriticalSkills) },
  ];

  return (
    <div>
      <h3 className={sp.profileName}>{role.employeeName}</h3>
      <p className={sp.profileRole}>{role.role || "—"}</p>
      <div className={sp.profileGrid}>
        {metrics.map(({ label, value }) => (
          <div key={label} className={sp.profileMetric}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      {role.criticalActivityDetails.length > 0 && (
        <>
          <p className={sp.profileActivitiesTitle}>
            Critical Activity Dependencies
          </p>
          <div className={shared.tableScroll} style={{ maxHeight: 160 }}>
            <table className={shared.table}>
              <thead>
                <tr>
                  <th>Activity</th>
                  <th>Criticality</th>
                  <th>Time %</th>
                  <th>Accountability</th>
                </tr>
              </thead>
              <tbody>
                {role.criticalActivityDetails.map((a) => (
                  <tr key={a.activityId}>
                    <td>{a.activityName}</td>
                    <td>{a.criticality}</td>
                    <td>{pct(a.timeAllocationPct)}</td>
                    <td>{a.accountability}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

const DEFAULT_CANDIDATE_SHOW = 8;

function CandidateRows({
  items,
  onStatusChange,
}: {
  items: ScoredCandidate[];
  onStatusChange: (
    candidate: SuccessionCandidateMetric,
    status: SuccessionCandidateStatus,
  ) => void;
}) {
  return (
    <>
      {items.map(({ candidate: c }) => (
        <tr key={candidatePairKey(c.targetEmployeeId, c.candidateEmployeeId)}>
          <td>
            <strong>{c.candidateName}</strong>
          </td>
          <td>{c.currentRole || "—"}</td>
          <td>{c.department || "—"}</td>
          <td>{c.grade || "—"}</td>
          <td>
            <span className={cx(shared.badge, riskBadge(c.readinessStatus))}>
              {pct(c.readinessScore)}
            </span>
          </td>
          <td>{pct(c.currentWorkloadPct)}</td>
          <td>
            <select
              className={shared.select}
              value={c.status}
              onChange={(e) =>
                onStatusChange(c, e.target.value as SuccessionCandidateStatus)
              }
            >
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </td>
          <td>
            {c.attentionFlag ? (
              <span
                className={cx(shared.badge, shared.badgeOrange)}
                title={c.attentionReason || "Review"}
              >
                {c.attentionReason || "Review"}
              </span>
            ) : (
              "—"
            )}
          </td>
        </tr>
      ))}
    </>
  );
}

const candidateTableHead = (
  <thead>
    <tr>
      <th>Candidate</th>
      <th>Current Role</th>
      <th>Department</th>
      <th>Grade</th>
      <th>Readiness</th>
      <th>Workload</th>
      <th>Status</th>
      <th>Attention</th>
    </tr>
  </thead>
);

function CompactCandidateTable({
  candidates,
  onStatusChange,
}: {
  candidates: ScoredCandidate[];
  onStatusChange: (
    candidate: SuccessionCandidateMetric,
    status: SuccessionCandidateStatus,
  ) => void;
}) {
  const [showAll, setShowAll] = useState(false);

  if (candidates.length === 0) {
    return (
      <p style={{ margin: 0, color: "var(--slate-light)", fontSize: 12 }}>
        No candidates identified for this role.
      </p>
    );
  }

  const sameDept = candidates.filter((c) => c.fitType === "Same dept");
  const crossFunctional = candidates.filter(
    (c) => c.fitType === "Cross-functional",
  );
  const visibleSameDept = showAll
    ? sameDept
    : sameDept.slice(0, DEFAULT_CANDIDATE_SHOW);

  return (
    <>
      <p className={sp.candidateHelper}>
        Candidates ranked by department fit, grade proximity, readiness, and
        workload capacity.
      </p>

      {sameDept.length === 0 && (
        <p className={sp.noSameDeptNote}>
          No same-department successors found. Showing cross-functional
          alternatives.
        </p>
      )}

      {sameDept.length > 0 && (
        <>
          <div className={shared.tableScroll}>
            <table className={shared.table}>
              {candidateTableHead}
              <tbody>
                <CandidateRows
                  items={visibleSameDept}
                  onStatusChange={onStatusChange}
                />
              </tbody>
            </table>
          </div>
          {sameDept.length > DEFAULT_CANDIDATE_SHOW && !showAll && (
            <button
              type="button"
              className={sp.showMoreBtn}
              onClick={() => setShowAll(true)}
            >
              View {sameDept.length - DEFAULT_CANDIDATE_SHOW} more same-dept
              candidate{sameDept.length - DEFAULT_CANDIDATE_SHOW > 1 ? "s" : ""}
            </button>
          )}
        </>
      )}

      {crossFunctional.length > 0 && (
        <details
          className={sp.crossSection}
          style={{ marginTop: sameDept.length > 0 ? 14 : 0 }}
          open={sameDept.length === 0}
        >
          <summary className={sp.crossSummary}>
            Cross-functional alternatives ({crossFunctional.length})
          </summary>
          <div className={sp.crossContent}>
            <div className={shared.tableScroll}>
              <table className={shared.table}>
                {candidateTableHead}
                <tbody>
                  <CandidateRows
                    items={crossFunctional}
                    onStatusChange={onStatusChange}
                  />
                </tbody>
              </table>
            </div>
          </div>
        </details>
      )}
    </>
  );
}

function AttentionFlags({
  portfolio,
}: {
  portfolio: SuccessionPlanningPortfolio;
}) {
  type FlagSeverity = "red" | "orange" | "amber";
  const flags: Array<{ severity: FlagSeverity; message: string }> = [];

  // Roles with no successor
  if (portfolio.kpis.rolesWithoutSuccessor > 0) {
    const n = portfolio.kpis.rolesWithoutSuccessor;
    flags.push({
      severity: "red",
      message: `${n} critical role${n > 1 ? "s" : ""} ${n > 1 ? "have" : "has"} no identified successor — immediate succession risk.`,
    });
  }

  // High-risk roles with no ready-now candidate
  const noReadyNow = portfolio.criticalRoles.filter(
    (r) => r.successionRisk === "High" && r.bestSuccessorReadiness < 85,
  ).length;
  if (noReadyNow > 0) {
    flags.push({
      severity: "orange",
      message: `${noReadyNow} high-risk role${noReadyNow > 1 ? "s" : ""} ${noReadyNow > 1 ? "have" : "has"} no ready-now successor (readiness ≥ 85%).`,
    });
  }

  // Roles with successors but low best readiness
  const lowReadiness = portfolio.criticalRoles.filter(
    (r) => r.successorCount > 0 && r.bestSuccessorReadiness < 50,
  ).length;
  if (lowReadiness > 0) {
    flags.push({
      severity: "orange",
      message: `${lowReadiness} critical role${lowReadiness > 1 ? "s" : ""} ${lowReadiness > 1 ? "have" : "has"} successors but best readiness below 50% — active development needed.`,
    });
  }

  // Per-candidate conflict loads
  for (const load of portfolio.successorLoads) {
    if (
      load.conflictRisk === "High conflict" ||
      load.conflictRisk === "Capacity risk"
    ) {
      flags.push({
        severity: "red",
        message: `${load.candidateName} is selected for ${load.selectedTargetCount} roles — ${load.recommendedAction}`,
      });
    } else if (
      load.conflictRisk === "Attention" ||
      load.conflictRisk === "Backfill risk"
    ) {
      flags.push({
        severity: "orange",
        message: `${load.candidateName} — ${load.recommendedAction}`,
      });
    } else if (load.conflictRisk === "Review required") {
      flags.push({
        severity: "amber",
        message: `${load.candidateName} — ${load.recommendedAction}`,
      });
    }
  }

  // Critical activity dependency
  if (portfolio.kpis.criticalActivityDependency > 0) {
    const n = portfolio.kpis.criticalActivityDependency;
    flags.push({
      severity: "amber",
      message: `${n} role${n > 1 ? "s" : ""} own high-criticality activities with no clear succession coverage plan.`,
    });
  }

  if (flags.length === 0) {
    return (
      <p className={sp.flagEmpty}>
        No selected successor conflicts detected.
        <br />
        Select candidates to monitor duplicate coverage and workload risk.
      </p>
    );
  }

  const dotClass: Record<FlagSeverity, string> = {
    red: sp.dotRed,
    orange: sp.dotOrange,
    amber: sp.dotAmber,
  };
  const itemClass: Record<FlagSeverity, string> = {
    red: sp.flagRed,
    orange: sp.flagOrange,
    amber: sp.flagAmber,
  };

  return (
    <div className={sp.flagList}>
      {flags.map((flag, i) => (
        <div key={i} className={cx(sp.flagItem, itemClass[flag.severity])}>
          <div className={cx(sp.flagDot, dotClass[flag.severity])} />
          <span>{flag.message}</span>
        </div>
      ))}
    </div>
  );
}
