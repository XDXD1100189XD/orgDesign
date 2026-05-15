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
}

type TabType =
  | "overview"
  | "gap-heatmap"
  | "role-readiness"
  | "activity-risk"
  | "skill-coverage";

type HeatmapView = "department-family" | "role-skill" | "employee-skill";

const tabs: Array<{ id: TabType; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "gap-heatmap", label: "Skill Gap Heatmap" },
  { id: "role-readiness", label: "Role Readiness" },
  { id: "activity-risk", label: "Activity-Skill Risk" },
  { id: "skill-coverage", label: "Skill Coverage" },
];

const ROLE_READINESS_TABLE_LIMIT = 100;

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
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 0,
  });
}

function riskClass(
  value: ActivitySkillRisk | RoleReadinessStatus | "High" | "Medium" | "Low",
) {
  if (value === "High" || value === "High capability risk") {
    return styles.badgeRed;
  }
  if (value === "Medium" || value === "Development needed") {
    return styles.badgeOrange;
  }
  if (value === "Minor gaps") {
    return styles.badgeAmber;
  }
  if (value === "Ready" || value === "Low") {
    return styles.badgeGreen;
  }
  return styles.badgeNeutral;
}

function heatClass(value: number) {
  if (value >= 3) return styles.heatHigh;
  if (value >= 2) return styles.heatMedium;
  if (value > 0) return styles.heatLow;
  return styles.heatNone;
}

export default function SkillsCapabilityView({
  dataset,
  orgRows,
  orgEmployeeIdColumn,
  columnMapping,
}: SkillsCapabilityViewProps) {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [heatmapView, setHeatmapView] =
    useState<HeatmapView>("department-family");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRoleKey, setSelectedRoleKey] = useState<string | null>(null);
  const [selectedFilters, setSelectedFilters] = useState({
    department: "",
    skillFamily: "",
    criticality: "",
    riskStatus: "",
    skillRisk: "",
  });

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

  const filteredRoles = useMemo(() => {
    if (!portfolio) return [];

    const query = searchTerm.trim().toLowerCase();
    return portfolio.roles.filter((role) => {
      const matchesSearch =
        !query ||
        role.employeeName.toLowerCase().includes(query) ||
        role.role.toLowerCase().includes(query) ||
        role.department.toLowerCase().includes(query);
      const matchesDepartment =
        !selectedFilters.department ||
        role.department === selectedFilters.department;
      const matchesRiskStatus =
        !selectedFilters.riskStatus ||
        role.riskStatus === selectedFilters.riskStatus;
      return matchesSearch && matchesDepartment && matchesRiskStatus;
    });
  }, [portfolio, searchTerm, selectedFilters]);

  const filteredActivities = useMemo(() => {
    if (!portfolio) return [];

    const query = searchTerm.trim().toLowerCase();
    return portfolio.activities.filter((activity) => {
      const matchesSearch =
        !query || activity.activityName.toLowerCase().includes(query);
      const matchesCriticality =
        !selectedFilters.criticality ||
        activity.criticality === selectedFilters.criticality;
      const matchesSkillRisk =
        !selectedFilters.skillRisk ||
        activity.skillRisk === selectedFilters.skillRisk;
      return matchesSearch && matchesCriticality && matchesSkillRisk;
    });
  }, [portfolio, searchTerm, selectedFilters]);

  const filteredSkills = useMemo(() => {
    if (!portfolio) return [];

    const query = searchTerm.trim().toLowerCase();
    return portfolio.skills.filter((skill) => {
      const matchesSearch =
        !query ||
        skill.skillName.toLowerCase().includes(query) ||
        skill.skillFamily.toLowerCase().includes(query);
      const matchesSkillFamily =
        !selectedFilters.skillFamily ||
        skill.skillFamily === selectedFilters.skillFamily;
      const matchesCriticality =
        !selectedFilters.criticality ||
        skill.criticality === selectedFilters.criticality;
      return matchesSearch && matchesSkillFamily && matchesCriticality;
    });
  }, [portfolio, searchTerm, selectedFilters]);

  const selectedRole = useMemo(() => {
    if (!portfolio || !selectedRoleKey) return null;
    return portfolio.roles.find(
      (role) => roleReadinessRowKey(role) === selectedRoleKey,
    );
  }, [portfolio, selectedRoleKey]);

  if (!mounted) {
    return <CenterState message="Loading Skills & Capability data..." />;
  }

  if (!portfolio) {
    return (
      <CenterState message="Unable to load Skills & Capability data. Please check your dataset." />
    );
  }

  const updateFilter = (key: keyof typeof selectedFilters, value: string) => {
    setSelectedFilters((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>Work & Capability Analysis</div>
          <h2 className={styles.title}>Skills & Capability</h2>
          <p className={styles.subtitle}>
            Deterministic readiness, skill gap, activity coverage, and
            single-point capability risk from uploaded work datasets.
          </p>
        </div>
        <div className={styles.controls}>
          <input
            className={styles.input}
            type="search"
            placeholder="Search roles, skills, activities..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
          <select
            className={styles.select}
            value={selectedFilters.department}
            onChange={(event) => updateFilter("department", event.target.value)}
          >
            <option value="">All departments</option>
            {portfolio.filterOptions.departments.map((department) => (
              <option key={department} value={department}>
                {department || "No department"}
              </option>
            ))}
          </select>
          <select
            className={styles.select}
            value={selectedFilters.skillFamily}
            onChange={(event) =>
              updateFilter("skillFamily", event.target.value)
            }
          >
            <option value="">All skill families</option>
            {portfolio.filterOptions.skillFamilies.map((family) => (
              <option key={family} value={family}>
                {family || "No family"}
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
        <nav className={styles.tabs} aria-label="Skills capability views">
          {tabs.map((tab) => (
            <button
              className={cx(
                styles.tab,
                activeTab === tab.id && styles.tabActive,
              )}
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <div className={styles.panelBody}>
          {activeTab === "overview" && (
            <OverviewTab portfolio={portfolio} activities={filteredActivities} />
          )}
          {activeTab === "gap-heatmap" && (
            <GapHeatmapTab
              portfolio={portfolio}
              heatmapView={heatmapView}
              onHeatmapViewChange={setHeatmapView}
            />
          )}
          {activeTab === "role-readiness" && (
            <RoleReadinessTab
              roles={filteredRoles}
              onSelectRole={setSelectedRoleKey}
            />
          )}
          {activeTab === "activity-risk" && (
            <ActivityRiskTab activities={filteredActivities} />
          )}
          {activeTab === "skill-coverage" && (
            <SkillCoverageTab skills={filteredSkills} />
          )}
        </div>
      </section>

      {selectedRole && (
        <RoleDetailDrawer
          role={selectedRole}
          onClose={() => setSelectedRoleKey(null)}
        />
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
    ["Critical skills", portfolio.kpis.criticalSkills, styles.metricBlue],
    ["Major skill gaps", portfolio.kpis.majorSkillGaps, styles.metricRed],
    ["Avg readiness", pct(portfolio.kpis.averageReadiness), styles.metricGreen],
    [
      "Roles below 70%",
      portfolio.kpis.rolesBelow70PctReadiness,
      styles.metricOrange,
    ],
    [
      "Activities at risk",
      portfolio.kpis.activitiesAtSkillRisk,
      styles.metricPurple,
    ],
    [
      "Single-point skills",
      portfolio.kpis.singlePointCriticalSkills,
      styles.metricRed,
    ],
    [
      "Unvalidated skills",
      portfolio.kpis.unvalidatedSyntheticSkills,
      styles.metricNeutral,
    ],
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
  activities,
}: {
  portfolio: SkillsCapabilityPortfolio;
  activities: SkillsCapabilityActivityMetric[];
}) {
  const maxDepartmentGaps = Math.max(
    1,
    ...portfolio.filterOptions.departments.map((department) =>
      portfolio.roles
        .filter((role) => role.department === department)
        .reduce((sum, role) => sum + role.majorGaps, 0),
    ),
  );
  const maxSkillCoverage = Math.max(
    1,
    ...portfolio.skills.map((skill) => skill.employeesAtLevel3Plus),
  );
  const readinessBuckets: Array<[string, SkillsCapabilityRoleMetric[]]> = [
    ["85-100%", portfolio.roles.filter((role) => role.readinessScore >= 85)],
    [
      "70-85%",
      portfolio.roles.filter(
        (role) => role.readinessScore >= 70 && role.readinessScore < 85,
      ),
    ],
    [
      "50-70%",
      portfolio.roles.filter(
        (role) => role.readinessScore >= 50 && role.readinessScore < 70,
      ),
    ],
    ["0-50%", portfolio.roles.filter((role) => role.readinessScore < 50)],
  ];
  const topRoleRisks = portfolio.roles
    .filter((role) => role.majorGaps > 0)
    .slice(0, 8);
  const topActivityRisks = activities
    .filter((activity) => activity.skillRisk === "High")
    .slice(0, 5);
  const topSinglePointRisks = portfolio.skills
    .filter((skill) => skill.singlePointRisk === "High")
    .slice(0, 5);

  return (
    <div className={styles.overviewGrid}>
      <ChartCard title="Skill Gaps by Department">
        <div className={styles.barList}>
          {portfolio.filterOptions.departments.map((department) => {
            const majorGaps = portfolio.roles
              .filter((role) => role.department === department)
              .reduce((sum, role) => sum + role.majorGaps, 0);
            return (
              <MetricBar
                key={department || "blank"}
                label={department || "No department"}
                value={majorGaps}
                width={(majorGaps / maxDepartmentGaps) * 100}
                tone="red"
              />
            );
          })}
        </div>
      </ChartCard>

      <ChartCard title="Critical Skill Coverage">
        <div className={styles.barList}>
          {portfolio.skills
            .filter((skill) => skill.criticality === "High")
            .slice(0, 10)
            .map((skill) => (
              <MetricBar
                key={skill.skillId}
                label={skill.skillName}
                value={skill.employeesAtLevel3Plus}
                width={(skill.employeesAtLevel3Plus / maxSkillCoverage) * 100}
                tone="green"
              />
            ))}
        </div>
      </ChartCard>

      <ChartCard title="Readiness Distribution">
        <div className={styles.distributionGrid}>
          {readinessBuckets.map(([label, rows], index) => (
            <div className={styles.distributionCard} key={String(label)}>
              <strong
                className={cx(
                  index === 0 && styles.metricGreen,
                  index === 1 && styles.metricAmber,
                  index === 2 && styles.metricOrange,
                  index === 3 && styles.metricRed,
                )}
              >
                {rows.length}
              </strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </ChartCard>

      <article className={cx(styles.card, styles.fullWidth)}>
        <div className={styles.cardHeader}>
          <h3>Top Capability Risks</h3>
          <span>Roles, activities, and single-point skill dependencies</span>
        </div>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Risk type</th>
                <th>Role / Activity</th>
                <th>Department</th>
                <th>Skill</th>
                <th>Gap</th>
                <th>Suggested action</th>
              </tr>
            </thead>
            <tbody>
              {topRoleRisks.map((role) => (
                <tr key={`role-${roleReadinessRowKey(role)}`}>
                  <td>Major role gap</td>
                  <td>{role.role}</td>
                  <td>{role.department || "-"}</td>
                  <td>
                    {role.skillDetails
                      .filter((skill) => skill.gapStatus === "Major gap")
                      .map((skill) => skill.skillName)
                      .join(", ") || "-"}
                  </td>
                  <td>{role.majorGaps}</td>
                  <td>Upskill / hire</td>
                </tr>
              ))}
              {topActivityRisks.map((activity) => (
                <tr key={`activity-${activity.activityId}`}>
                  <td>Activity coverage risk</td>
                  <td>{activity.activityName}</td>
                  <td>-</td>
                  <td>
                    {activity.skillCoverageDetails
                      .filter((skill) => skill.coveragePct < 50)
                      .map((skill) => skill.skillName)
                      .join(", ") || "-"}
                  </td>
                  <td>{activity.majorSkillGaps}</td>
                  <td>Reassign or train</td>
                </tr>
              ))}
              {topSinglePointRisks.map((skill) => (
                <tr key={`skill-${skill.skillId}`}>
                  <td>Single-point skill</td>
                  <td>-</td>
                  <td>-</td>
                  <td>{skill.skillName}</td>
                  <td>1 person</td>
                  <td>Build backup</td>
                </tr>
              ))}
              {topRoleRisks.length + topActivityRisks.length + topSinglePointRisks.length ===
                0 && (
                <tr>
                  <td colSpan={6}>No capability risks found in current filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className={styles.card}>
      <div className={styles.cardHeader}>
        <h3>{title}</h3>
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

function GapHeatmapTab({
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
          roles: portfolio.roles.filter(
            (role) => role.department === department,
          ),
        }))
          : portfolio.roles.slice(0, 30).map((role) => ({
              key: roleReadinessRowKey(role),
          label:
            heatmapView === "role-skill"
              ? `${role.role} - ${role.employeeName}`
              : role.employeeName,
          roles: [role],
        }));

  const columns =
    heatmapView === "department-family"
      ? portfolio.filterOptions.skillFamilies
      : portfolio.skills.slice(0, 16).map((skill) => skill.skillName);

  return (
    <article className={styles.card}>
      <div className={styles.cardHeaderRow}>
        <div>
          <h3>Skill Gap Heatmap</h3>
          <span>Cell values show major gap count for the selected cut.</span>
        </div>
        <div className={styles.segmented}>
          {[
            ["department-family", "Department x Skill Family"],
            ["role-skill", "Role x Skill"],
            ["employee-skill", "Employee x Skill"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={cx(
                styles.segment,
                heatmapView === id && styles.segmentActive,
              )}
              type="button"
              onClick={() => onHeatmapViewChange(id as HeatmapView)}
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
              <th>{heatmapView === "department-family" ? "Department" : "Role"}</th>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td>{row.label}</td>
                {columns.map((column) => {
                  const majorGaps = row.roles.reduce((sum, role) => {
                    return (
                      sum +
                      role.skillDetails.filter((detail) => {
                        if (heatmapView === "department-family") {
                          const skill = portfolio.skills.find(
                            (item) => item.skillId === detail.skillId,
                          );
                          return (
                            skill?.skillFamily === column &&
                            detail.gapStatus === "Major gap"
                          );
                        }
                        return (
                          detail.skillName === column &&
                          detail.gapStatus === "Major gap"
                        );
                      }).length
                    );
                  }, 0);
                  return (
                    <td key={column} className={heatClass(majorGaps)}>
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
  );
}

function RoleReadinessTab({
  roles,
  onSelectRole,
}: {
  roles: SkillsCapabilityRoleMetric[];
  onSelectRole: (roleKey: string) => void;
}) {
  const visibleRoles = roles.slice(0, ROLE_READINESS_TABLE_LIMIT);
  const hiddenRoleCount = Math.max(0, roles.length - visibleRoles.length);

  return (
    <article className={styles.card}>
      <div className={styles.cardHeader}>
        <h3>Role Readiness</h3>
        <span>Click a row to inspect required skills and gaps.</span>
      </div>
      {hiddenRoleCount > 0 && (
        <div className={styles.tableNotice}>
          Showing first {ROLE_READINESS_TABLE_LIMIT.toLocaleString()} of{" "}
          {roles.length.toLocaleString()} matching role-readiness rows. Use
          search or filters to narrow the list.
        </div>
      )}
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
            {visibleRoles.map((role) => (
              <tr
                className={styles.clickRow}
                key={roleReadinessRowKey(role)}
                onClick={() => onSelectRole(roleReadinessRowKey(role))}
              >
                <td>{role.employeeName}</td>
                <td>{role.role}</td>
                <td>{role.department || "-"}</td>
                <td>{role.grade || "-"}</td>
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
            {roles.length === 0 && (
              <tr>
                <td colSpan={11}>No roles match the current filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function ActivityRiskTab({
  activities,
}: {
  activities: SkillsCapabilityActivityMetric[];
}) {
  return (
    <article className={styles.card}>
      <div className={styles.cardHeader}>
        <h3>Activity-Skill Risk</h3>
        <span>Coverage joins assigned people to activity skill requirements.</span>
      </div>
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
            {activities.map((activity) => (
              <tr key={activity.activityId}>
                <td>{activity.activityName}</td>
                <td>{activity.criticality || "-"}</td>
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
            {activities.length === 0 && (
              <tr>
                <td colSpan={9}>No activities match the current filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function SkillCoverageTab({
  skills,
}: {
  skills: SkillsCapabilitySkillMetric[];
}) {
  return (
    <article className={styles.card}>
      <div className={styles.cardHeader}>
        <h3>Skill Coverage</h3>
        <span>Supply, demand, departments covered, and single-point risk.</span>
      </div>
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
              <th>Single point risk</th>
            </tr>
          </thead>
          <tbody>
            {skills.map((skill) => (
              <tr key={skill.skillId}>
                <td>{skill.skillName}</td>
                <td>{skill.skillFamily || "-"}</td>
                <td>{skill.criticality || "-"}</td>
                <td>{skill.employeesWithSkill}</td>
                <td>{skill.employeesAtLevel3Plus}</td>
                <td>{skill.employeesAtLevel4Plus}</td>
                <td>{skill.departmentsCovered}</td>
                <td>{skill.activitiesRequiringSkill}</td>
                <td>{skill.rolesRequiringSkill}</td>
                <td>
                  <span
                    className={cx(styles.badge, riskClass(skill.singlePointRisk))}
                  >
                    {skill.singlePointRisk}
                  </span>
                </td>
              </tr>
            ))}
            {skills.length === 0 && (
              <tr>
                <td colSpan={10}>No skills match the current filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
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
            {role.role} - {role.department || "No department"}
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

function MiniMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className={styles.miniMetric}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
