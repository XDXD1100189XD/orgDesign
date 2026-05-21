import React, { useEffect, useMemo, useState } from "react";
import type {
  ActivitySkillRisk,
  RoleReadinessStatus,
  SkillsCapabilityActivityMetric,
  SkillsCapabilityPortfolio,
  SkillsCapabilityRoleMetric,
  SkillsCapabilitySkillMetric,
  WorkCapabilityDataset,
} from "../../lib/workCapabilityDataset";
import { buildSkillsCapabilityPortfolio } from "../../lib/workCapabilityDataset";
import type { ColumnMapping } from "../../lib/fieldDictionary";
import type { ExcelRow } from "../../lib/parseExcel";
import styles from "./SkillsCapabilityView.module.css";

interface SkillsCapabilityViewProps {
  dataset: WorkCapabilityDataset | null;
  orgRows: ExcelRow[];
  orgEmployeeIdColumn: string;
  columnMapping: ColumnMapping | null;
  layoutMode?: "full" | "talent-mapping";
  successionRiskContent?: React.ReactNode;
  successionPlanningContent?: React.ReactNode;
}

type HeatmapView = "department-family" | "role-skill" | "employee-skill";

const HEATMAP_MODES: Array<{ id: HeatmapView; label: string }> = [
  { id: "department-family", label: "Department Gap Concentration" },
  { id: "role-skill", label: "Top Role Gaps" },
  { id: "employee-skill", label: "Top Employee Gaps" },
];

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function roleReadinessRowKey(role: SkillsCapabilityRoleMetric) {
  return `${role.employeeId}::${role.role}::${role.department}`;
}

function pct(value: number) {
  return `${value.toFixed(1)}%`;
}

function money(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function riskClass(
  value: ActivitySkillRisk | RoleReadinessStatus | "High" | "Medium" | "Low",
) {
  if (value === "High" || value === "High capability risk") return styles.badgeRed;
  if (value === "Medium" || value === "Development needed") return styles.badgeOrange;
  if (value === "Minor gaps") return styles.badgeAmber;
  if (value === "Ready" || value === "Low") return styles.badgeGreen;
  return styles.badgeNeutral;
}

function heatClass(value: number) {
  if (value >= 3) return styles.heatHigh;
  if (value >= 2) return styles.heatMedium;
  if (value > 0) return styles.heatLow;
  return styles.heatNone;
}

function truncateSkills(skills: string[], max = 3): string {
  if (skills.length === 0) return "—";
  if (skills.length <= max) return skills.join(", ");
  return `${skills.slice(0, max).join(", ")} +${skills.length - max} more`;
}

export default function SkillsCapabilityView({
  dataset,
  orgRows,
  orgEmployeeIdColumn,
  columnMapping,
  layoutMode = "full",
  successionRiskContent = null,
  successionPlanningContent = null,
}: SkillsCapabilityViewProps) {
  const [mounted, setMounted] = useState(false);
  const [heatmapView, setHeatmapView] = useState<HeatmapView>("department-family");
  const [selectedRoleKey, setSelectedRoleKey] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const portfolio = useMemo<SkillsCapabilityPortfolio | null>(() => {
    if (!dataset) return null;
    try {
      return buildSkillsCapabilityPortfolio({
        dataset,
        orgRows,
        orgEmployeeIdColumn,
        columnMapping,
      });
    } catch (error) {
      console.error("Failed to build skills capability portfolio:", error);
      return null;
    }
  }, [dataset, orgRows, orgEmployeeIdColumn, columnMapping]);

  const filteredRoles = useMemo(() => portfolio?.roles ?? [], [portfolio]);
  const filteredActivities = useMemo(() => portfolio?.activities ?? [], [portfolio]);
  const filteredSkills = useMemo(() => portfolio?.skills ?? [], [portfolio]);

  const selectedRole = useMemo(() => {
    if (!portfolio || !selectedRoleKey) return null;
    return portfolio.roles.find((role) => roleReadinessRowKey(role) === selectedRoleKey);
  }, [portfolio, selectedRoleKey]);

  if (!mounted) return <CenterState message="Loading Skills & Capability data..." />;

  if (!portfolio) {
    return (
      <CenterState message="Unable to load Skills & Capability data. Please check your dataset." />
    );
  }

  if (layoutMode === "talent-mapping") {
    return (
      <div className={styles.wrap}>
        <header className={styles.header}>
          <div>
            <div className={styles.eyebrow}>Work &amp; Capability Analysis</div>
            <h2 className={styles.title}>Talent Mapping</h2>
            <p className={styles.subtitle}>
              Connect skills, activity risk, coverage, and succession exposure in one talent
              planning view.
            </p>
          </div>
        </header>

        <KpiStrip portfolio={portfolio} />

        <section id="capability-health">
          <div className={styles.sectionHeading}>
            <h3>Capability Health Overview</h3>
          </div>
          <div className={styles.talentOverviewGrid}>
            <SkillGapOverviewCard portfolio={portfolio} />
            {successionRiskContent}
          </div>
        </section>

        <div className={styles.talentTwoColumn}>
          <ActivityRiskDrilldown activities={filteredActivities} />
          <SkillCoverageDrilldown
            skills={filteredSkills}
            filterOptions={portfolio.filterOptions}
          />
        </div>

        <GapHeatmapSection
          portfolio={portfolio}
          heatmapView={heatmapView}
          onHeatmapViewChange={setHeatmapView}
        />

        {successionPlanningContent}
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>Work & Capability Analysis</div>
          <h2 className={styles.title}>Skills & Capability</h2>
          <p className={styles.subtitle}>
            Identify skill gaps, role readiness risk, activity coverage gaps, and single-point
            capability dependencies.
          </p>
        </div>
        <div className={styles.controls}>
          <button className={styles.secondaryButton} type="button">
            Export
          </button>
        </div>
      </header>

      <KpiStrip portfolio={portfolio} />

      <CapabilityHealthSection portfolio={portfolio} />

      <GapHeatmapSection
        portfolio={portfolio}
        heatmapView={heatmapView}
        onHeatmapViewChange={setHeatmapView}
      />

      <TopCapabilityRisksSection portfolio={portfolio} activities={filteredActivities} />

      <RoleReadinessDrilldown
        roles={filteredRoles}
        onSelectRole={setSelectedRoleKey}
        filterOptions={portfolio.filterOptions}
      />

      <ActivityRiskDrilldown activities={filteredActivities} />

      <SkillCoverageDrilldown
        skills={filteredSkills}
        filterOptions={portfolio.filterOptions}
      />

      {selectedRole && (
        <RoleDetailDrawer role={selectedRole} onClose={() => setSelectedRoleKey(null)} />
      )}
    </div>
  );
}

function CenterState({ message }: { message: string }) {
  return (
    <div className={styles.centerState}>
      <div className={styles.spinner} aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}

function KpiStrip({ portfolio }: { portfolio: SkillsCapabilityPortfolio }) {
  const kpis = [
    { label: "Critical skills", value: portfolio.kpis.criticalSkills, tone: styles.metricBlue },
    { label: "Major skill gaps", value: portfolio.kpis.majorSkillGaps, tone: styles.metricRed },
    {
      label: "Avg readiness",
      value: pct(portfolio.kpis.averageReadiness),
      tone: styles.metricGreen,
    },
    {
      label: "Roles below 70%",
      value: portfolio.kpis.rolesBelow70PctReadiness,
      tone: styles.metricOrange,
    },
    {
      label: "Activities at risk",
      value: portfolio.kpis.activitiesAtSkillRisk,
      tone: styles.metricPurple,
    },
    {
      label: "Single-point skills",
      value: portfolio.kpis.singlePointCriticalSkills,
      tone: styles.metricRed,
    },
  ];

  return (
    <section className={styles.kpiGrid}>
      {kpis.map(({ label, value, tone }) => (
        <article className={styles.kpiCard} key={label}>
          <div className={cx(styles.kpiValue, tone)}>{value}</div>
          <div className={styles.kpiLabel}>{label}</div>
        </article>
      ))}
      {portfolio.kpis.unvalidatedSyntheticSkills > 0 && (
        <article className={styles.kpiCard}>
          <div className={cx(styles.kpiValue, styles.metricNeutral)}>
            {portfolio.kpis.unvalidatedSyntheticSkills}
          </div>
          <div className={styles.kpiLabel}>Unvalidated skills</div>
        </article>
      )}
    </section>
  );
}

function CapabilityHealthSection({ portfolio }: { portfolio: SkillsCapabilityPortfolio }) {
  const weakestCritical = portfolio.skills
    .filter((s) => s.criticality === "High")
    .sort((a, b) => a.employeesAtLevel3Plus - b.employeesAtLevel3Plus)
    .slice(0, 10);

  const maxCoverage = Math.max(1, ...portfolio.skills.map((s) => s.employeesAtLevel3Plus));

  const readinessBuckets: Array<[string, SkillsCapabilityRoleMetric[], string]> = [
    ["85–100%", portfolio.roles.filter((r) => r.readinessScore >= 85), styles.metricGreen],
    [
      "70–85%",
      portfolio.roles.filter((r) => r.readinessScore >= 70 && r.readinessScore < 85),
      styles.metricAmber,
    ],
    [
      "50–70%",
      portfolio.roles.filter((r) => r.readinessScore >= 50 && r.readinessScore < 70),
      styles.metricOrange,
    ],
    ["<50%", portfolio.roles.filter((r) => r.readinessScore < 50), styles.metricRed],
  ];

  return (
    <section id="capability-health">
      <div className={styles.sectionHeading}>
        <h3>Capability Health Overview</h3>
      </div>
      <div className={styles.overviewGrid}>
        <SkillGapOverviewCard portfolio={portfolio} />

        <ChartCard
          title="Weakest critical skills"
          subtitle="Critical skills with fewest employees at level 3+"
        >
          <div className={styles.barList}>
            {weakestCritical.map((skill) => (
              <MetricBar
                key={skill.skillId}
                label={skill.skillName}
                value={skill.employeesAtLevel3Plus}
                width={(skill.employeesAtLevel3Plus / maxCoverage) * 100}
                tone="green"
              />
            ))}
            {weakestCritical.length === 0 && (
              <p className={styles.emptyNote}>No critical skills found.</p>
            )}
          </div>
        </ChartCard>

        <ChartCard
          title="Readiness distribution"
          subtitle="Employee-role pairs by readiness band"
        >
          <div className={styles.distributionGrid}>
            {readinessBuckets.map(([label, rows, colorClass]) => (
              <div className={styles.distributionCard} key={String(label)}>
                <strong className={String(colorClass)}>{rows.length}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>
    </section>
  );
}

function SkillGapOverviewCard({ portfolio }: { portfolio: SkillsCapabilityPortfolio }) {
  const deptGaps = portfolio.filterOptions.departments
    .map((dept) => ({
      dept,
      majorGaps: portfolio.roles
        .filter((r) => r.department === dept)
        .reduce((sum, r) => sum + r.majorGaps, 0),
    }))
    .sort((a, b) => b.majorGaps - a.majorGaps);

  const maxDeptGap = Math.max(1, ...deptGaps.map((d) => d.majorGaps));

  return (
    <ChartCard
      title="Where skill gaps concentrate"
      subtitle="Departments ranked by total major gap count"
    >
      <div className={styles.barList}>
        {deptGaps.map(({ dept, majorGaps }) => (
          <MetricBar
            key={dept || "blank"}
            label={dept || "No department"}
            value={majorGaps}
            width={(majorGaps / maxDeptGap) * 100}
            tone="red"
          />
        ))}
        {deptGaps.length === 0 && (
          <p className={styles.emptyNote}>No department data available.</p>
        )}
      </div>
    </ChartCard>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <article className={styles.card}>
      <div className={styles.cardHeader}>
        <h3>{title}</h3>
        {subtitle && <span>{subtitle}</span>}
      </div>
      {children}
    </article>
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
          className={cx(styles.barFill, tone === "red" ? styles.barRed : styles.barGreen)}
          style={{ width: `${Math.max(2, Math.min(100, width))}%` }}
        />
      </div>
      <strong>{value}</strong>
    </div>
  );
}

function GapHeatmapSection({
  portfolio,
  heatmapView,
  onHeatmapViewChange,
}: {
  portfolio: SkillsCapabilityPortfolio;
  heatmapView: HeatmapView;
  onHeatmapViewChange: (view: HeatmapView) => void;
}) {
  const rows =
    heatmapView === "department-family"
      ? portfolio.filterOptions.departments.map((department) => ({
          key: department || "No department",
          label: department || "No department",
          roles: portfolio.roles.filter((role) => role.department === department),
        }))
      : portfolio.roles
          .slice()
          .sort((a, b) => b.majorGaps - a.majorGaps)
          .slice(0, 20)
          .map((role) => ({
            key: roleReadinessRowKey(role),
            label:
              heatmapView === "role-skill"
                ? `${role.role} — ${role.employeeName}`
                : role.employeeName,
            roles: [role],
          }));

  const columns =
    heatmapView === "department-family"
      ? portfolio.filterOptions.skillFamilies
      : portfolio.skills.slice(0, 16).map((s) => s.skillName);

  const rowHeader =
    heatmapView === "department-family"
      ? "Department"
      : heatmapView === "role-skill"
        ? "Role"
        : "Employee";

  return (
    <section id="gap-heatmap">
      <div className={styles.sectionHeading}>
        <h3>Skill Gap Heatmap</h3>
      </div>
      <article className={styles.card}>
        <div className={styles.cardHeaderRow}>
          <p className={styles.heatmapHelper}>
            Cells show major skill gap counts for the selected cut. Role and employee views are
            limited to highest-gap rows for readability.
          </p>
          <div className={styles.segmented}>
            {HEATMAP_MODES.map(({ id, label }) => (
              <button
                key={id}
                className={cx(styles.segment, heatmapView === id && styles.segmentActive)}
                type="button"
                onClick={() => onHeatmapViewChange(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.tableScroll}>
          <table className={styles.heatmap}>
            <thead>
              <tr>
                <th>{rowHeader}</th>
                {columns.map((col) => (
                  <th key={col}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td>{row.label}</td>
                  {columns.map((col) => {
                    const majorGaps = row.roles.reduce((sum, role) => {
                      return (
                        sum +
                        role.skillDetails.filter((detail) => {
                          if (heatmapView === "department-family") {
                            const skill = portfolio.skills.find(
                              (item) => item.skillId === detail.skillId,
                            );
                            return (
                              skill?.skillFamily === col && detail.gapStatus === "Major gap"
                            );
                          }
                          return detail.skillName === col && detail.gapStatus === "Major gap";
                        }).length
                      );
                    }, 0);
                    return (
                      <td key={col} className={heatClass(majorGaps)}>
                        {majorGaps || ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={styles.legend}>
          <span>0 = Covered</span>
          <span>1 = Minor watch</span>
          <span>2+ = Moderate gap</span>
          <span>3+ = Major gap</span>
        </div>
      </article>
    </section>
  );
}

function TopCapabilityRisksSection({
  portfolio,
  activities,
}: {
  portfolio: SkillsCapabilityPortfolio;
  activities: SkillsCapabilityActivityMetric[];
}) {
  const topRoleRisks = portfolio.roles
    .filter((r) => r.majorGaps > 0)
    .sort((a, b) => b.majorGaps - a.majorGaps)
    .slice(0, 4);

  const topActivityRisks = activities
    .filter((a) => a.skillRisk === "High")
    .sort((a, b) => b.costAtRisk - a.costAtRisk)
    .slice(0, 3);

  const topSinglePoint = portfolio.skills
    .filter((s) => s.singlePointRisk === "High")
    .slice(0, 3);

  const total = topRoleRisks.length + topActivityRisks.length + topSinglePoint.length;

  return (
    <section id="top-risks">
      <div className={styles.sectionHeading}>
        <h3>Top Capability Risks</h3>
        <span>Roles, activities, and single-point skill dependencies most at risk</span>
      </div>
      <article className={styles.card}>
        <div className={styles.tableScroll}>
          <table className={styles.table} style={{ minWidth: 560 }}>
            <thead>
              <tr>
                <th>Risk Type</th>
                <th>Role / Activity</th>
                <th>Department</th>
                <th>Top Missing Skills</th>
                <th>Gap</th>
                <th>Suggested Action</th>
              </tr>
            </thead>
            <tbody>
              {topRoleRisks.map((role) => {
                const missing = role.skillDetails
                  .filter((s) => s.gapStatus === "Major gap")
                  .map((s) => s.skillName);
                return (
                  <tr key={`role-${roleReadinessRowKey(role)}`}>
                    <td>
                      <span className={cx(styles.badge, styles.badgeRed)}>Role gap</span>
                    </td>
                    <td>{role.role}</td>
                    <td>{role.department || "—"}</td>
                    <td title={missing.join(", ")}>{truncateSkills(missing)}</td>
                    <td>{role.majorGaps}</td>
                    <td>Upskill / hire</td>
                  </tr>
                );
              })}
              {topActivityRisks.map((activity) => {
                const missing = activity.skillCoverageDetails
                  .filter((s) => s.coveragePct < 50)
                  .map((s) => s.skillName);
                return (
                  <tr key={`activity-${activity.activityId}`}>
                    <td>
                      <span className={cx(styles.badge, styles.badgeOrange)}>Activity risk</span>
                    </td>
                    <td>{activity.activityName}</td>
                    <td>—</td>
                    <td title={missing.join(", ")}>{truncateSkills(missing)}</td>
                    <td>{activity.majorSkillGaps}</td>
                    <td>Reassign or train</td>
                  </tr>
                );
              })}
              {topSinglePoint.map((skill) => (
                <tr key={`skill-${skill.skillId}`}>
                  <td>
                    <span className={cx(styles.badge, styles.badgeAmber)}>Single-point</span>
                  </td>
                  <td>{skill.skillName}</td>
                  <td>—</td>
                  <td>{skill.skillName}</td>
                  <td>1 person</td>
                  <td>Build backup</td>
                </tr>
              ))}
              {total === 0 && (
                <tr>
                  <td colSpan={6}>No capability risks found in current filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}

function RoleReadinessDrilldown({
  roles,
  onSelectRole,
  filterOptions,
}: {
  roles: SkillsCapabilityRoleMetric[];
  onSelectRole: (key: string) => void;
  filterOptions: SkillsCapabilityPortfolio["filterOptions"];
}) {
  const [deptFilter, setDeptFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [bandFilter, setBandFilter] = useState("");

  const uniqueRoles = useMemo(() => {
    const set = new Set(roles.map((r) => r.role));
    return Array.from(set).sort();
  }, [roles]);

  const filtered = useMemo(() => {
    return roles.filter((r) => {
      if (deptFilter && r.department !== deptFilter) return false;
      if (roleFilter && r.role !== roleFilter) return false;
      if (bandFilter === "high-risk" && r.riskStatus !== "High capability risk") return false;
      if (bandFilter === "dev-needed" && r.riskStatus !== "Development needed") return false;
      if (bandFilter === "minor-gaps" && r.riskStatus !== "Minor gaps") return false;
      if (bandFilter === "ready" && r.riskStatus !== "Ready") return false;
      return true;
    });
  }, [roles, deptFilter, roleFilter, bandFilter]);

  const compact = filtered
    .slice()
    .sort((a, b) => a.readinessScore - b.readinessScore)
    .slice(0, 20);

  return (
    <section id="role-readiness">
      <div className={styles.sectionHeading}>
        <h3>Role Readiness</h3>
        <span>
          Sorted by readiness score (lowest first). Click a row to inspect required skills and gaps.
        </span>
      </div>
      <article className={styles.card}>
        <div className={styles.drilldownFilters}>
          <select
            className={styles.select}
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
          >
            <option value="">All departments</option>
            {filterOptions.departments.map((d) => (
              <option key={d} value={d}>
                {d || "No department"}
              </option>
            ))}
          </select>
          <select
            className={styles.select}
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="">All roles</option>
            {uniqueRoles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select
            className={styles.select}
            value={bandFilter}
            onChange={(e) => setBandFilter(e.target.value)}
          >
            <option value="">All readiness bands</option>
            <option value="high-risk">High capability risk</option>
            <option value="dev-needed">Development needed</option>
            <option value="minor-gaps">Minor gaps</option>
            <option value="ready">Ready</option>
          </select>
        </div>
        <div className={styles.tableScroll}>
          <table className={styles.table} style={{ minWidth: 520 }}>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Role</th>
                <th>Department</th>
                <th>Readiness</th>
                <th>Major Gaps</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {compact.map((role) => (
                <tr
                  key={roleReadinessRowKey(role)}
                  className={styles.clickRow}
                  onClick={() => onSelectRole(roleReadinessRowKey(role))}
                >
                  <td>{role.employeeName}</td>
                  <td>{role.role}</td>
                  <td>{role.department || "—"}</td>
                  <td>{pct(role.readinessScore)}</td>
                  <td>{role.majorGaps}</td>
                  <td>
                    <span className={cx(styles.badge, riskClass(role.riskStatus))}>
                      {role.riskStatus}
                    </span>
                  </td>
                </tr>
              ))}
              {compact.length === 0 && (
                <tr>
                  <td colSpan={6}>No roles match the current filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 20 && (
          <div className={styles.tableNotice}>
            Showing {compact.length} of {filtered.length} matching roles — expand the full table
            below or refine filters.
          </div>
        )}
        <details className={styles.detailsBlock}>
          <summary className={styles.summaryToggle}>
            Full role readiness table ({filtered.length} rows)
          </summary>
          <div className={styles.detailsContent}>
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Role</th>
                    <th>Department</th>
                    <th>Grade</th>
                    <th>Required</th>
                    <th>Covered</th>
                    <th>Minor gaps</th>
                    <th>Major gaps</th>
                    <th>Critical gaps</th>
                    <th>Readiness</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((role) => (
                    <tr
                      key={roleReadinessRowKey(role)}
                      className={styles.clickRow}
                      onClick={() => onSelectRole(roleReadinessRowKey(role))}
                    >
                      <td>{role.employeeName}</td>
                      <td>{role.role}</td>
                      <td>{role.department || "—"}</td>
                      <td>{role.grade || "—"}</td>
                      <td>{role.requiredSkills}</td>
                      <td>{role.coveredSkills}</td>
                      <td>{role.minorGaps}</td>
                      <td>{role.majorGaps}</td>
                      <td>{role.criticalGaps}</td>
                      <td>{pct(role.readinessScore)}</td>
                      <td>
                        <span className={cx(styles.badge, riskClass(role.riskStatus))}>
                          {role.riskStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={11}>No roles match the current filters.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </details>
      </article>
    </section>
  );
}

function ActivityRiskDrilldown({
  activities,
}: {
  activities: SkillsCapabilityActivityMetric[];
}) {
  const [critFilter, setCritFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState("");

  const filtered = useMemo(() => {
    return activities.filter((a) => {
      if (critFilter && a.criticality !== critFilter) return false;
      if (riskFilter && a.skillRisk !== riskFilter) return false;
      return true;
    });
  }, [activities, critFilter, riskFilter]);

  const top10 = filtered
    .slice()
    .sort((a, b) => b.costAtRisk - a.costAtRisk)
    .slice(0, 10);

  return (
    <section id="activity-risk">
      <div className={styles.sectionHeading}>
        <h3>Activity-Skill Risk</h3>
        <span>Top 10 activities by cost at risk. Coverage joins assigned people to skill requirements.</span>
      </div>
      <article className={styles.card}>
        <div className={styles.drilldownFilters}>
          <select
            className={styles.select}
            value={critFilter}
            onChange={(e) => setCritFilter(e.target.value)}
          >
            <option value="">All criticality</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
          <select
            className={styles.select}
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
          >
            <option value="">All risk levels</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
            <option value="Unknown">Unknown</option>
          </select>
        </div>
        <div className={styles.tableScroll}>
          <table className={styles.table} style={{ minWidth: 520 }}>
            <thead>
              <tr>
                <th>Activity</th>
                <th>Criticality</th>
                <th>People</th>
                <th>Major Gaps</th>
                <th>Cost at Risk</th>
                <th>Risk</th>
              </tr>
            </thead>
            <tbody>
              {top10.map((activity) => (
                <tr key={activity.activityId}>
                  <td>{activity.activityName}</td>
                  <td>{activity.criticality || "—"}</td>
                  <td>{activity.assignedPeople}</td>
                  <td>{activity.majorSkillGaps}</td>
                  <td>{money(activity.costAtRisk)}</td>
                  <td>
                    <span className={cx(styles.badge, riskClass(activity.skillRisk))}>
                      {activity.skillRisk}
                    </span>
                  </td>
                </tr>
              ))}
              {top10.length === 0 && (
                <tr>
                  <td colSpan={6}>No activities match the current filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <details className={styles.detailsBlock}>
          <summary className={styles.summaryToggle}>
            Full activity risk table ({filtered.length} activities)
          </summary>
          <div className={styles.detailsContent}>
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Activity</th>
                    <th>Criticality</th>
                    <th>People</th>
                    <th>Required skills</th>
                    <th>Lowest coverage</th>
                    <th>Major gaps</th>
                    <th>Risk</th>
                    <th>Cost at risk</th>
                    <th>FTE at risk</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((activity) => (
                    <tr key={activity.activityId}>
                      <td>{activity.activityName}</td>
                      <td>{activity.criticality || "—"}</td>
                      <td>{activity.assignedPeople}</td>
                      <td>{activity.requiredSkills}</td>
                      <td>
                        {activity.skillRisk === "Unknown"
                          ? "Unknown"
                          : pct(activity.lowestSkillCoveragePct)}
                      </td>
                      <td>{activity.majorSkillGaps}</td>
                      <td>
                        <span className={cx(styles.badge, riskClass(activity.skillRisk))}>
                          {activity.skillRisk}
                        </span>
                      </td>
                      <td>{money(activity.costAtRisk)}</td>
                      <td>{activity.fteAtRisk.toFixed(1)}</td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={9}>No activities match the current filters.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </details>
      </article>
    </section>
  );
}

function SkillCoverageDrilldown({
  skills,
  filterOptions,
}: {
  skills: SkillsCapabilitySkillMetric[];
  filterOptions: SkillsCapabilityPortfolio["filterOptions"];
}) {
  const [familyFilter, setFamilyFilter] = useState("");
  const [critFilter, setCritFilter] = useState("");
  const [spFilter, setSpFilter] = useState("");

  const filtered = useMemo(() => {
    return skills.filter((s) => {
      if (familyFilter && s.skillFamily !== familyFilter) return false;
      if (critFilter && s.criticality !== critFilter) return false;
      if (spFilter && s.singlePointRisk !== spFilter) return false;
      return true;
    });
  }, [skills, familyFilter, critFilter, spFilter]);

  const critOrder = (c: string) => (c === "High" ? 0 : c === "Medium" ? 1 : 2);
  const spOrder = (s: string) => (s === "High" ? 0 : s === "Medium" ? 1 : 2);

  const sorted = filtered
    .slice()
    .sort((a, b) => {
      if (critOrder(a.criticality) !== critOrder(b.criticality))
        return critOrder(a.criticality) - critOrder(b.criticality);
      if (spOrder(a.singlePointRisk) !== spOrder(b.singlePointRisk))
        return spOrder(a.singlePointRisk) - spOrder(b.singlePointRisk);
      return a.employeesAtLevel3Plus - b.employeesAtLevel3Plus;
    })
    .slice(0, 20);

  return (
    <section id="skill-coverage">
      <div className={styles.sectionHeading}>
        <h3>Skill Coverage</h3>
        <span>
          Critical and single-point skills surface first. Supply, demand, and dependency risk.
        </span>
      </div>
      <article className={styles.card}>
        <div className={styles.drilldownFilters}>
          <select
            className={styles.select}
            value={familyFilter}
            onChange={(e) => setFamilyFilter(e.target.value)}
          >
            <option value="">All skill families</option>
            {filterOptions.skillFamilies.map((f) => (
              <option key={f} value={f}>
                {f || "No family"}
              </option>
            ))}
          </select>
          <select
            className={styles.select}
            value={critFilter}
            onChange={(e) => setCritFilter(e.target.value)}
          >
            <option value="">All criticality</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
          <select
            className={styles.select}
            value={spFilter}
            onChange={(e) => setSpFilter(e.target.value)}
          >
            <option value="">All single-point risk</option>
            <option value="High">High (single-point)</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>
        <div className={styles.tableScroll}>
          <table className={styles.table} style={{ minWidth: 580 }}>
            <thead>
              <tr>
                <th>Skill</th>
                <th>Family</th>
                <th>Criticality</th>
                <th>Employees</th>
                <th>Level 3+</th>
                <th>Activities</th>
                <th>Single-Point Risk</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((skill) => (
                <tr key={skill.skillId}>
                  <td>{skill.skillName}</td>
                  <td>{skill.skillFamily || "—"}</td>
                  <td>{skill.criticality || "—"}</td>
                  <td>{skill.employeesWithSkill}</td>
                  <td>{skill.employeesAtLevel3Plus}</td>
                  <td>{skill.activitiesRequiringSkill}</td>
                  <td>
                    <span className={cx(styles.badge, riskClass(skill.singlePointRisk))}>
                      {skill.singlePointRisk}
                    </span>
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={7}>No skills match the current filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 20 && (
          <div className={styles.tableNotice}>
            Showing top {sorted.length} of {filtered.length} skills — expand the full table below
            or refine filters.
          </div>
        )}
        <details className={styles.detailsBlock}>
          <summary className={styles.summaryToggle}>
            Full skill coverage table ({filtered.length} skills)
          </summary>
          <div className={styles.detailsContent}>
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Skill</th>
                    <th>Family</th>
                    <th>Criticality</th>
                    <th>Employees</th>
                    <th>Level 3+</th>
                    <th>Level 4+</th>
                    <th>Departments</th>
                    <th>Activities</th>
                    <th>Roles</th>
                    <th>Single-point risk</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((skill) => (
                    <tr key={skill.skillId}>
                      <td>{skill.skillName}</td>
                      <td>{skill.skillFamily || "—"}</td>
                      <td>{skill.criticality || "—"}</td>
                      <td>{skill.employeesWithSkill}</td>
                      <td>{skill.employeesAtLevel3Plus}</td>
                      <td>{skill.employeesAtLevel4Plus}</td>
                      <td>{skill.departmentsCovered}</td>
                      <td>{skill.activitiesRequiringSkill}</td>
                      <td>{skill.rolesRequiringSkill}</td>
                      <td>
                        <span className={cx(styles.badge, riskClass(skill.singlePointRisk))}>
                          {skill.singlePointRisk}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={10}>No skills match the current filters.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </details>
      </article>
    </section>
  );
}

function RoleDetailDrawer({
  role,
  onClose,
}: {
  role: SkillsCapabilityRoleMetric;
  onClose: () => void;
}) {
  return (
    <aside className={styles.drawer} aria-label="Role capability detail">
      <div className={styles.drawerHead}>
        <div>
          <div className={styles.eyebrow}>Role detail</div>
          <h3>{role.employeeName}</h3>
          <p>
            {role.role} — {role.department || "No department"}
          </p>
        </div>
        <button className={styles.iconButton} type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <div className={styles.drawerMetrics}>
        <MiniMetric label="Readiness" value={pct(role.readinessScore)} />
        <MiniMetric label="Required" value={role.requiredSkills} />
        <MiniMetric label="Covered" value={role.coveredSkills} />
        <MiniMetric label="Major gaps" value={role.majorGaps} />
      </div>
      <div className={styles.drawerSection}>
        <h4>Required skills</h4>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Skill</th>
              <th>Required</th>
              <th>Current</th>
              <th>Gap</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {role.skillDetails.map((skill) => (
              <tr key={skill.skillId}>
                <td>{skill.skillName}</td>
                <td>{skill.requiredLevel}</td>
                <td>{skill.currentLevel}</td>
                <td>{skill.gap}</td>
                <td>
                  <span
                    className={cx(
                      styles.badge,
                      skill.gapStatus === "Covered"
                        ? styles.badgeGreen
                        : skill.gapStatus === "Minor gap"
                          ? styles.badgeAmber
                          : styles.badgeRed,
                    )}
                  >
                    {skill.gapStatus}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={styles.drawerSection}>
        <h4>Activities impacted</h4>
        <p className={styles.drawerNote}>
          {role.activitiesImpacted.length > 0
            ? role.activitiesImpacted.join(", ")
            : "No assigned activities currently show a required-skill gap for this role."}
        </p>
      </div>
    </aside>
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
