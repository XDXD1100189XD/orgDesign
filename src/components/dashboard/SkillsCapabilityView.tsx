import React, { useState, useMemo } from "react";
import type {
  SkillsCapabilityPortfolio,
  SkillsCapabilityRoleMetric,
  SkillsCapabilityActivityMetric,
  SkillsCapabilitySkillMetric,
  WorkCapabilityDataset,
} from "../../lib/workCapabilityDataset";
import type { ExcelRow } from "../../lib/parseExcel";
import type { ColumnMapping } from "../../lib/fieldDictionary";
import { buildSkillsCapabilityPortfolio } from "../../lib/workCapabilityDataset";

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

export default function SkillsCapabilityView({
  dataset,
  orgRows,
  orgEmployeeIdColumn,
  columnMapping,
}: SkillsCapabilityViewProps) {
  const portfolio = useMemo(() => {
    if (!dataset || !columnMapping) return null;
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

  if (!portfolio) {
    return (
      <div className="p-6">
        <div className="text-center text-gray-500">
          Unable to load Skills & Capability data. Please check your dataset.
        </div>
      </div>
    );
  }
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFilters, setSelectedFilters] = useState({
    department: "",
    skillFamily: "",
    criticality: "",
    riskStatus: "",
    skillRisk: "",
  });

  const filteredRoles = useMemo(() => {
    return portfolio.roles.filter((role) => {
      const matchesSearch =
        !searchTerm ||
        role.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        role.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
        role.department.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesDepartment =
        !selectedFilters.department ||
        role.department === selectedFilters.department;
      const matchesRiskStatus =
        !selectedFilters.riskStatus ||
        role.riskStatus === selectedFilters.riskStatus;
      return matchesSearch && matchesDepartment && matchesRiskStatus;
    });
  }, [portfolio.roles, searchTerm, selectedFilters]);

  const filteredActivities = useMemo(() => {
    return portfolio.activities.filter((activity) => {
      const matchesSearch =
        !searchTerm ||
        activity.activityName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCriticality =
        !selectedFilters.criticality ||
        activity.criticality === selectedFilters.criticality;
      const matchesSkillRisk =
        !selectedFilters.skillRisk ||
        activity.skillRisk === selectedFilters.skillRisk;
      return matchesSearch && matchesCriticality && matchesSkillRisk;
    });
  }, [portfolio.activities, searchTerm, selectedFilters]);

  const filteredSkills = useMemo(() => {
    return portfolio.skills.filter((skill) => {
      const matchesSearch =
        !searchTerm ||
        skill.skillName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        skill.skillFamily.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesSkillFamily =
        !selectedFilters.skillFamily ||
        skill.skillFamily === selectedFilters.skillFamily;
      const matchesCriticality =
        !selectedFilters.criticality ||
        skill.criticality === selectedFilters.criticality;
      return matchesSearch && matchesSkillFamily && matchesCriticality;
    });
  }, [portfolio.skills, searchTerm, selectedFilters]);

  const renderOverviewTab = () => (
    <div className="space-y-6">
      {/* Skill Gaps by Department Chart */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Skill Gaps by Department</h3>
        <div className="space-y-2">
          {portfolio.filterOptions.departments.map((dept) => {
            const deptRoles = portfolio.roles.filter(
              (role) => role.department === dept,
            );
            const majorGaps = deptRoles.reduce(
              (sum, role) => sum + role.majorGaps,
              0,
            );
            const maxGaps = Math.max(
              ...portfolio.filterOptions.departments.map((d) =>
                portfolio.roles
                  .filter((r) => r.department === d)
                  .reduce((sum, r) => sum + r.majorGaps, 0),
              ),
            );
            const width = maxGaps > 0 ? (majorGaps / maxGaps) * 100 : 0;
            return (
              <div key={dept} className="flex items-center space-x-2">
                <div className="w-32 text-sm truncate">
                  {dept || "No Department"}
                </div>
                <div className="flex-1 bg-gray-200 rounded-full h-4">
                  <div
                    className="bg-red-500 h-4 rounded-full"
                    style={{ width: `${width}%` }}
                  ></div>
                </div>
                <div className="w-12 text-sm text-right">{majorGaps}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Critical Skill Coverage Chart */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Critical Skill Coverage</h3>
        <div className="space-y-2">
          {portfolio.skills
            .filter((skill) => skill.criticality === "High")
            .slice(0, 10)
            .map((skill) => {
              const coverage = skill.employeesAtLevel3Plus;
              const maxCoverage = Math.max(
                ...portfolio.skills.map((s) => s.employeesAtLevel3Plus),
              );
              const width =
                maxCoverage > 0 ? (coverage / maxCoverage) * 100 : 0;
              return (
                <div
                  key={skill.skillId}
                  className="flex items-center space-x-2"
                >
                  <div className="w-32 text-sm truncate">{skill.skillName}</div>
                  <div className="flex-1 bg-gray-200 rounded-full h-4">
                    <div
                      className="bg-green-500 h-4 rounded-full"
                      style={{ width: `${width}%` }}
                    ></div>
                  </div>
                  <div className="w-12 text-sm text-right">{coverage}</div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Readiness Distribution */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Readiness Distribution</h3>
        <div className="grid grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {portfolio.roles.filter((r) => r.readinessScore >= 85).length}
            </div>
            <div className="text-sm text-gray-600">85–100%</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">
              {
                portfolio.roles.filter(
                  (r) => r.readinessScore >= 70 && r.readinessScore < 85,
                ).length
              }
            </div>
            <div className="text-sm text-gray-600">70–85%</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">
              {
                portfolio.roles.filter(
                  (r) => r.readinessScore >= 50 && r.readinessScore < 70,
                ).length
              }
            </div>
            <div className="text-sm text-gray-600">50–70%</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">
              {portfolio.roles.filter((r) => r.readinessScore < 50).length}
            </div>
            <div className="text-sm text-gray-600">0–50%</div>
          </div>
        </div>
      </div>

      {/* Top Capability Risks Table */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Top Capability Risks</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Risk Type</th>
                <th className="text-left py-2">Role/Activity</th>
                <th className="text-left py-2">Department</th>
                <th className="text-left py-2">Skill</th>
                <th className="text-left py-2">Gap</th>
                <th className="text-left py-2">Suggested Action</th>
              </tr>
            </thead>
            <tbody>
              {portfolio.roles
                .filter((role) => role.majorGaps > 0)
                .slice(0, 10)
                .map((role) => (
                  <tr key={role.employeeId} className="border-b">
                    <td className="py-2">Major gap in critical skill</td>
                    <td className="py-2">{role.role}</td>
                    <td className="py-2">{role.department}</td>
                    <td className="py-2">
                      {role.skillDetails
                        .filter(
                          (s) =>
                            s.gapStatus === "Major gap" &&
                            s.criticality === "High",
                        )
                        .map((s) => s.skillName)
                        .join(", ")}
                    </td>
                    <td className="py-2">{role.majorGaps}</td>
                    <td className="py-2">Upskill / hire</td>
                  </tr>
                ))}
              {portfolio.activities
                .filter((activity) => activity.skillRisk === "High")
                .slice(0, 5)
                .map((activity) => (
                  <tr key={activity.activityId} className="border-b">
                    <td className="py-2">Activity skill coverage &lt;50%</td>
                    <td className="py-2">{activity.activityName}</td>
                    <td className="py-2">-</td>
                    <td className="py-2">
                      {activity.skillCoverageDetails
                        .filter((s) => s.coveragePct < 50)
                        .map((s) => s.skillName)
                        .join(", ")}
                    </td>
                    <td className="py-2">{activity.majorSkillGaps}</td>
                    <td className="py-2">Reassign or train</td>
                  </tr>
                ))}
              {portfolio.skills
                .filter((skill) => skill.singlePointRisk === "High")
                .slice(0, 5)
                .map((skill) => (
                  <tr key={skill.skillId} className="border-b">
                    <td className="py-2">Single-person skill</td>
                    <td className="py-2">-</td>
                    <td className="py-2">-</td>
                    <td className="py-2">{skill.skillName}</td>
                    <td className="py-2">1 person</td>
                    <td className="py-2">Build backup</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderGapHeatmapTab = () => (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">
          Skill Gap Heatmap - Department × Skill Family
        </h3>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Department</th>
                {portfolio.filterOptions.skillFamilies.map((family) => (
                  <th key={family} className="text-center py-2 text-xs">
                    {family}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {portfolio.filterOptions.departments.map((dept) => (
                <tr key={dept} className="border-b">
                  <td className="py-2 font-medium">
                    {dept || "No Department"}
                  </td>
                  {portfolio.filterOptions.skillFamilies.map((family) => {
                    const deptRoles = portfolio.roles.filter(
                      (r) => r.department === dept,
                    );
                    const familySkills = portfolio.skills.filter(
                      (s) => s.skillFamily === family,
                    );
                    const majorGaps = deptRoles.reduce(
                      (sum, role) =>
                        sum +
                        role.skillDetails.filter(
                          (detail) =>
                            familySkills.some(
                              (skill) => skill.skillId === detail.skillId,
                            ) && detail.gapStatus === "Major gap",
                        ).length,
                      0,
                    );
                    const intensity =
                      majorGaps > 5
                        ? 3
                        : majorGaps > 2
                          ? 2
                          : majorGaps > 0
                            ? 1
                            : 0;
                    const bgColor =
                      intensity === 3
                        ? "bg-red-500"
                        : intensity === 2
                          ? "bg-orange-400"
                          : intensity === 1
                            ? "bg-yellow-300"
                            : "bg-gray-100";
                    return (
                      <td
                        key={family}
                        className={`text-center py-2 ${bgColor} text-white`}
                      >
                        {majorGaps || ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 text-sm text-gray-600">
          Legend: White = No gaps, Yellow = Minor gaps, Orange = Moderate gaps,
          Red = Major gaps
        </div>
      </div>
    </div>
  );

  const renderRoleReadinessTab = () => (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Role Readiness</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Employee</th>
                <th className="text-left py-2">Role</th>
                <th className="text-left py-2">Department</th>
                <th className="text-left py-2">Grade</th>
                <th className="text-center py-2">Required</th>
                <th className="text-center py-2">Covered</th>
                <th className="text-center py-2">Minor Gaps</th>
                <th className="text-center py-2">Major Gaps</th>
                <th className="text-center py-2">Critical Gaps</th>
                <th className="text-center py-2">Readiness %</th>
                <th className="text-left py-2">Risk Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredRoles.map((role) => (
                <tr key={role.employeeId} className="border-b hover:bg-gray-50">
                  <td className="py-2">{role.employeeName}</td>
                  <td className="py-2">{role.role}</td>
                  <td className="py-2">{role.department}</td>
                  <td className="py-2">{role.grade}</td>
                  <td className="py-2 text-center">{role.requiredSkills}</td>
                  <td className="py-2 text-center">{role.coveredSkills}</td>
                  <td className="py-2 text-center">{role.minorGaps}</td>
                  <td className="py-2 text-center">{role.majorGaps}</td>
                  <td className="py-2 text-center">{role.criticalGaps}</td>
                  <td className="py-2 text-center">
                    {role.readinessScore.toFixed(1)}%
                  </td>
                  <td className="py-2">
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        role.riskStatus === "Ready"
                          ? "bg-green-100 text-green-800"
                          : role.riskStatus === "Minor gaps"
                            ? "bg-yellow-100 text-yellow-800"
                            : role.riskStatus === "Development needed"
                              ? "bg-orange-100 text-orange-800"
                              : "bg-red-100 text-red-800"
                      }`}
                    >
                      {role.riskStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderActivityRiskTab = () => (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Activity-Skill Risk</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Activity</th>
                <th className="text-left py-2">Criticality</th>
                <th className="text-center py-2">Assigned People</th>
                <th className="text-center py-2">Required Skills</th>
                <th className="text-center py-2">Lowest Coverage %</th>
                <th className="text-center py-2">Major Skill Gaps</th>
                <th className="text-left py-2">Skill Risk</th>
                <th className="text-right py-2">Cost at Risk</th>
                <th className="text-right py-2">FTE at Risk</th>
              </tr>
            </thead>
            <tbody>
              {filteredActivities.map((activity) => (
                <tr
                  key={activity.activityId}
                  className="border-b hover:bg-gray-50"
                >
                  <td className="py-2">{activity.activityName}</td>
                  <td className="py-2">{activity.criticality}</td>
                  <td className="py-2 text-center">
                    {activity.assignedPeople}
                  </td>
                  <td className="py-2 text-center">
                    {activity.requiredSkills}
                  </td>
                  <td className="py-2 text-center">
                    {activity.lowestSkillCoveragePct.toFixed(1)}%
                  </td>
                  <td className="py-2 text-center">
                    {activity.majorSkillGaps}
                  </td>
                  <td className="py-2">
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        activity.skillRisk === "High"
                          ? "bg-red-100 text-red-800"
                          : activity.skillRisk === "Medium"
                            ? "bg-orange-100 text-orange-800"
                            : activity.skillRisk === "Low"
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {activity.skillRisk}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    ${activity.costAtRisk.toLocaleString()}
                  </td>
                  <td className="py-2 text-right">
                    {activity.fteAtRisk.toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderSkillCoverageTab = () => (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Skill Coverage</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Skill</th>
                <th className="text-left py-2">Skill Family</th>
                <th className="text-left py-2">Criticality</th>
                <th className="text-center py-2">Employees with Skill</th>
                <th className="text-center py-2">Level 3+</th>
                <th className="text-center py-2">Level 4+</th>
                <th className="text-center py-2">Departments</th>
                <th className="text-center py-2">Activities Requiring</th>
                <th className="text-center py-2">Roles Requiring</th>
                <th className="text-left py-2">Single Point Risk</th>
              </tr>
            </thead>
            <tbody>
              {filteredSkills.map((skill) => (
                <tr key={skill.skillId} className="border-b hover:bg-gray-50">
                  <td className="py-2">{skill.skillName}</td>
                  <td className="py-2">{skill.skillFamily}</td>
                  <td className="py-2">{skill.criticality}</td>
                  <td className="py-2 text-center">
                    {skill.employeesWithSkill}
                  </td>
                  <td className="py-2 text-center">
                    {skill.employeesAtLevel3Plus}
                  </td>
                  <td className="py-2 text-center">
                    {skill.employeesAtLevel4Plus}
                  </td>
                  <td className="py-2 text-center">
                    {skill.departmentsCovered}
                  </td>
                  <td className="py-2 text-center">
                    {skill.activitiesRequiringSkill}
                  </td>
                  <td className="py-2 text-center">
                    {skill.rolesRequiringSkill}
                  </td>
                  <td className="py-2">
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        skill.singlePointRisk === "High"
                          ? "bg-red-100 text-red-800"
                          : skill.singlePointRisk === "Medium"
                            ? "bg-orange-100 text-orange-800"
                            : "bg-green-100 text-green-800"
                      }`}
                    >
                      {skill.singlePointRisk}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
          <h2 className="text-2xl font-bold">Skills & Capability</h2>
          <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4">
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={selectedFilters.department}
              onChange={(e) =>
                setSelectedFilters({
                  ...selectedFilters,
                  department: e.target.value,
                })
              }
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Departments</option>
              {portfolio.filterOptions.departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
            <select
              value={selectedFilters.skillFamily}
              onChange={(e) =>
                setSelectedFilters({
                  ...selectedFilters,
                  skillFamily: e.target.value,
                })
              }
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Skill Families</option>
              {portfolio.filterOptions.skillFamilies.map((family) => (
                <option key={family} value={family}>
                  {family}
                </option>
              ))}
            </select>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
              Export
            </button>
          </div>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <div className="bg-white p-4 rounded-lg shadow text-center">
          <div className="text-2xl font-bold text-blue-600">
            {portfolio.kpis.criticalSkills}
          </div>
          <div className="text-sm text-gray-600">Critical Skills</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow text-center">
          <div className="text-2xl font-bold text-red-600">
            {portfolio.kpis.majorSkillGaps}
          </div>
          <div className="text-sm text-gray-600">Major Skill Gaps</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow text-center">
          <div className="text-2xl font-bold text-green-600">
            {portfolio.kpis.averageReadiness.toFixed(1)}%
          </div>
          <div className="text-sm text-gray-600">Avg Readiness</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow text-center">
          <div className="text-2xl font-bold text-orange-600">
            {portfolio.kpis.rolesBelow70PctReadiness}
          </div>
          <div className="text-sm text-gray-600">Roles Below 70%</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow text-center">
          <div className="text-2xl font-bold text-purple-600">
            {portfolio.kpis.activitiesAtSkillRisk}
          </div>
          <div className="text-sm text-gray-600">Activities at Risk</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow text-center">
          <div className="text-2xl font-bold text-red-600">
            {portfolio.kpis.singlePointCriticalSkills}
          </div>
          <div className="text-sm text-gray-600">Single-Point Skills</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow text-center">
          <div className="text-2xl font-bold text-gray-600">
            {portfolio.kpis.unvalidatedSyntheticSkills}
          </div>
          <div className="text-sm text-gray-600">Unvalidated Skills</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b">
          <nav className="flex">
            {[
              { id: "overview", label: "Overview" },
              { id: "gap-heatmap", label: "Gap Heatmap" },
              { id: "role-readiness", label: "Role Readiness" },
              { id: "activity-risk", label: "Activity-Skill Risk" },
              { id: "skill-coverage", label: "Skill Coverage" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`px-6 py-3 text-sm font-medium border-b-2 ${
                  activeTab === tab.id
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="p-6">
          {activeTab === "overview" && renderOverviewTab()}
          {activeTab === "gap-heatmap" && renderGapHeatmapTab()}
          {activeTab === "role-readiness" && renderRoleReadinessTab()}
          {activeTab === "activity-risk" && renderActivityRiskTab()}
          {activeTab === "skill-coverage" && renderSkillCoverageTab()}
        </div>
      </div>
    </div>
  );
}
