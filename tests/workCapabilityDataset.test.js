const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");

function loadTsModule(path) {
  const source = fs.readFileSync(path, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const mod = { exports: {} };
  const fn = new Function("require", "module", "exports", output);
  fn(require, mod, mod.exports);
  return mod.exports;
}

const {
  applyWorkCapabilityTaxonomyMutation,
  buildWorkCapabilityActivityPortfolio,
  buildActivityAnalysisPortfolio,
  buildSkillsCapabilityPortfolio,
  buildWorkCapabilityTaxonomyCleanupSuggestions,
  buildWorkCapabilityTaxonomyGraph,
  canHardDeleteWorkCapabilityActivity,
  createWorkCapabilityDataset,
  detectWorkCapabilityDataset,
  getWorkCapabilityArchiveImpact,
  getWorkCapabilityMergeImpact,
  getWorkCapabilityTaxonomyMutationImpact,
  updateWorkCapabilityNormalization,
  validateWorkCapabilityFiles,
} = loadTsModule("src/lib/workCapabilityDataset.ts");

const orgRows = [
  {
    employee_id: "E1",
    name: "Ada",
    position_title: "CEO",
    department: "Exec",
    loaded_cost: 120,
    FTE: 1,
  },
  {
    employee_id: "E2",
    name: "Ben",
    position_title: "Manager",
    department: "Ops",
    loaded_cost: 80,
    FTE: 0.5,
  },
];

const activityLibraryRows = [
  {
    activity_id: "ACT001",
    activity_name: "Run reporting",
    department_focus: "Ops",
    activity_category: "Reporting",
    process_area: "Operations",
    nature: "Transactional",
    criticality: "Medium",
    automation_cost_reduction_pct: 30,
    outsourcing_cost_reduction_pct: 10,
    complexity: "Low",
    frequency: "Weekly",
    active_flag: true,
  },
  {
    activity_id: "ACT002",
    activity_name: "Prepare dashboards",
    department_focus: "Ops",
    activity_category: "Reporting",
    process_area: "Operations",
    nature: "Operational",
    criticality: "High",
    automation_cost_reduction_pct: 20,
    outsourcing_cost_reduction_pct: 5,
    complexity: "Medium",
    frequency: "Monthly",
    active_flag: true,
  },
  {
    activity_id: "ACT003",
    activity_name: "Run transition planning",
    department_focus: "Transition",
    activity_category: "Planning",
    process_area: "Transition Management",
    nature: "Strategic",
    criticality: "High",
    automation_cost_reduction_pct: 10,
    outsourcing_cost_reduction_pct: 0,
    complexity: "High",
    frequency: "Quarterly",
    active_flag: true,
  },
];

const activityAssignmentsRows = [
  {
    assignment_id: "ASN001",
    employee_id: "E1",
    activity_id: "ACT001",
    time_allocation_pct: 25,
    accountability: "Responsible",
    assignment_source: "Imported",
    confidence_score: 1,
    validated: true,
  },
  {
    assignment_id: "ASN002",
    employee_id: "E2",
    activity_id: "ACT002",
    time_allocation_pct: 35,
    accountability: "Accountable",
    assignment_source: "Imported",
    confidence_score: 1,
    validated: true,
  },
];

const skillLibraryRows = [
  {
    skill_id: "SK001",
    skill_name: "Data analysis",
    skill_family: "Data",
    skill_category: "Analytics",
    skill_type: "Analytical",
    criticality: "High",
    proficiency_scale: "1-5",
    active_flag: true,
  },
];

const roleSkillRequirementRows = [
  {
    requirement_id: "REQ001",
    role_key: "ops-manager",
    position_title: "Manager",
    department: "Ops",
    skill_id: "SK001",
    required_level: 4,
    criticality: "High",
    requirement_source: "Imported",
    validated: true,
    active_flag: true,
  },
];

const employeeSkillRows = [
  {
    employee_skill_id: "ES001",
    employee_id: "E1",
    skill_id: "SK001",
    current_level: 3,
    evidence_source: "Imported",
    confidence_score: 1,
    validated: true,
    synthetic_flag: false,
  },
];

const activitySkillRequirementRows = [
  {
    activity_skill_requirement_id: "ASR001",
    activity_id: "ACT001",
    skill_id: "SK001",
    required_level: 3,
    criticality: "Medium",
    relationship_type: "Primary",
    weight: 1,
    requirement_source: "Imported",
    validated: true,
    active_flag: true,
  },
  {
    activity_skill_requirement_id: "ASR002",
    activity_id: "ACT002",
    skill_id: "SK001",
    required_level: 4,
    criticality: "High",
    relationship_type: "Supporting",
    weight: 0.8,
    requirement_source: "Imported",
    validated: true,
    active_flag: true,
  },
];

function parsed(dataset, rows) {
  return {
    fileName: `${dataset}.csv`,
    datasetType: dataset,
    headers: Object.keys(rows[0] ?? {}),
    rows,
  };
}

function allFiles(overrides = {}) {
  return [
    parsed(
      "activity_library",
      overrides.activity_library ?? activityLibraryRows,
    ),
    parsed(
      "activity_assignments",
      overrides.activity_assignments ?? activityAssignmentsRows,
    ),
    parsed("skill_library", overrides.skill_library ?? skillLibraryRows),
    parsed(
      "role_skill_requirements",
      overrides.role_skill_requirements ?? roleSkillRequirementRows,
    ),
    parsed("employee_skills", overrides.employee_skills ?? employeeSkillRows),
    parsed(
      "activity_skill_requirements",
      overrides.activity_skill_requirements ?? activitySkillRequirementRows,
    ),
  ];
}

test("detects each work capability dataset from headers", () => {
  for (const file of allFiles()) {
    assert.equal(detectWorkCapabilityDataset(file.headers), file.datasetType);
  }
});

test("rejects missing required columns", () => {
  const files = allFiles({
    activity_library: activityLibraryRows.map(
      ({ activity_name, ...row }) => row,
    ),
  });

  const validation = validateWorkCapabilityFiles({
    files,
    orgRows,
    orgEmployeeIdColumn: "employee_id",
  });

  assert.equal(validation.status, "failed");
  assert.match(
    validation.errors.join("\n"),
    /activity_library.*missing required column activity_name/i,
  );
});

test("rejects duplicate primary keys", () => {
  const files = allFiles({
    skill_library: [
      skillLibraryRows[0],
      { ...skillLibraryRows[0], skill_name: "Duplicate" },
    ],
  });

  const validation = validateWorkCapabilityFiles({
    files,
    orgRows,
    orgEmployeeIdColumn: "employee_id",
  });

  assert.equal(validation.status, "failed");
  assert.match(
    validation.errors.join("\n"),
    /skill_library.*duplicate primary key SK001/i,
  );
});

test("summarizes non-standard labels but still rejects invalid required numbers", () => {
  const files = allFiles({
    activity_assignments: [
      {
        ...activityAssignmentsRows[0],
        accountability: "Owner",
        assignment_source: "AI Suggested",
        time_allocation_pct: "many",
      },
    ],
  });

  const validation = validateWorkCapabilityFiles({
    files,
    orgRows,
    orgEmployeeIdColumn: "employee_id",
  });

  assert.equal(validation.status, "failed");
  assert.doesNotMatch(
    validation.errors.join("\n"),
    /accountability must be one of/i,
  );
  assert.match(
    validation.warnings.join("\n"),
    /Normalization: 2 non-standard label groups found/i,
  );
  assert.equal(validation.normalization.totalGroups, 2);
  assert.equal(validation.normalization.needsReview, 2);
  assert.match(
    validation.errors.join("\n"),
    /activity_assignments row 2: time_allocation_pct must be a number/i,
  );
});

test("creates normalized companion fields while preserving raw imported labels", () => {
  const dataset = createWorkCapabilityDataset({
    orgDatasetId: "org_1",
    files: allFiles({
      activity_assignments: [
        {
          ...activityAssignmentsRows[0],
          assignment_source: "Synthetic role/department rule",
        },
      ],
      skill_library: [{ ...skillLibraryRows[0], skill_type: "Business" }],
      employee_skills: [
        {
          ...employeeSkillRows[0],
          evidence_source: "Synthetic-Role-Inferred",
          gap_status: "Not required / adjacent",
        },
      ],
      role_skill_requirements: [
        {
          ...roleSkillRequirementRows[0],
          role_level: "Senior Leader",
          requirement_source:
            "Synthetic rule-based from title, department, grade",
        },
      ],
      activity_skill_requirements: [
        {
          ...activitySkillRequirementRows[0],
          relationship_type: "Optional",
          requirement_source: "Synthetic keyword + department rule",
        },
      ],
    }),
    orgRows,
    orgEmployeeIdColumn: "employee_id",
  });

  assert.equal(dataset.validation.status, "imported_with_warnings");
  assert.equal(
    dataset.states.asIs.activityAssignments[0].assignment_source,
    "Synthetic role/department rule",
  );
  assert.equal(
    dataset.states.asIs.activityAssignments[0].assignment_source_normalized,
    "Synthetic",
  );
  assert.equal(dataset.shared.skillLibrary[0].skill_type, "Business");
  assert.equal(
    dataset.shared.skillLibrary[0].skill_type_normalized,
    "Functional",
  );
  assert.equal(
    dataset.states.asIs.roleSkillRequirements[0].role_level_normalized,
    "Executive",
  );
  assert.equal(
    dataset.states.asIs.employeeSkills[0].gap_status_normalized,
    "Not Required",
  );
  assert.equal(
    dataset.shared.activitySkillRequirements[0].relationship_type_normalized,
    "Optional",
  );
  assert.equal(dataset.normalization.autoApplied, 8);
  assert.equal(dataset.normalization.needsReview, 0);
  assert.doesNotMatch(
    dataset.validation.warnings.join("\n"),
    /non-standard values "Synthetic role\/department rule"/i,
  );
});

test("keeps unknown labels in normalization review until approved or ignored", () => {
  const dataset = createWorkCapabilityDataset({
    orgDatasetId: "org_1",
    files: allFiles({
      employee_skills: [
        { ...employeeSkillRows[0], evidence_source: "Self Assessment" },
      ],
      role_skill_requirements: [
        { ...roleSkillRequirementRows[0], role_level: "Senior Manager" },
      ],
    }),
    orgRows,
    orgEmployeeIdColumn: "employee_id",
  });

  const roleRecord = dataset.normalization.records.find(
    (record) => record.field === "role_level",
  );
  const evidenceRecord = dataset.normalization.records.find(
    (record) => record.field === "evidence_source",
  );

  assert.equal(dataset.normalization.needsReview, 2);
  assert.equal(roleRecord.status, "needs_review");
  assert.equal(
    dataset.states.asIs.roleSkillRequirements[0].role_level_normalized,
    "",
  );

  const approved = updateWorkCapabilityNormalization(dataset, {
    id: roleRecord.id,
    status: "approved",
    normalizedValue: "Manager",
  });

  assert.equal(
    approved.normalization.records.find((record) => record.id === roleRecord.id)
      .status,
    "approved",
  );
  assert.equal(
    approved.states.asIs.roleSkillRequirements[0].role_level_normalized,
    "Manager",
  );

  const ignored = updateWorkCapabilityNormalization(approved, {
    id: evidenceRecord.id,
    status: "ignored",
  });

  assert.equal(
    ignored.normalization.records.find(
      (record) => record.id === evidenceRecord.id,
    ).status,
    "ignored",
  );
  assert.equal(
    ignored.states.asIs.employeeSkills[0].evidence_source,
    "Self Assessment",
  );
  assert.equal(
    ignored.states.asIs.employeeSkills[0].evidence_source_normalized,
    "",
  );
});

test("ignores extra descriptive columns during validation", () => {
  const dataset = createWorkCapabilityDataset({
    orgDatasetId: "org_1",
    files: allFiles({
      skill_library: [
        {
          ...skillLibraryRows[0],
          description: "Optional imported description",
          aliases: "analytics, reporting",
        },
      ],
      activity_assignments: [
        { ...activityAssignmentsRows[0], notes: "Imported free-text note" },
      ],
      employee_skills: [
        { ...employeeSkillRows[0], notes: "Manager supplied context" },
      ],
    }),
    orgRows,
    orgEmployeeIdColumn: "employee_id",
  });

  assert.equal(dataset.validation.status, "success");
  assert.equal(
    dataset.shared.skillLibrary[0].description,
    "Optional imported description",
  );
  assert.equal(
    dataset.states.asIs.activityAssignments[0].notes,
    "Imported free-text note",
  );
});

test("rejects missing employee, activity, and skill references", () => {
  const files = allFiles({
    activity_assignments: [
      {
        ...activityAssignmentsRows[0],
        employee_id: "E999",
        activity_id: "ACT999",
      },
    ],
    employee_skills: [
      { ...employeeSkillRows[0], employee_id: "E888", skill_id: "SK999" },
    ],
    activity_skill_requirements: [
      {
        ...activitySkillRequirementRows[0],
        activity_id: "ACT998",
        skill_id: "SK998",
      },
    ],
    role_skill_requirements: [
      { ...roleSkillRequirementRows[0], skill_id: "SK997" },
    ],
  });

  const validation = validateWorkCapabilityFiles({
    files,
    orgRows,
    orgEmployeeIdColumn: "employee_id",
  });

  assert.equal(validation.status, "failed");
  assert.match(
    validation.errors.join("\n"),
    /activity_assignments row 2: employee_id E999 does not exist in As-Is org rows/i,
  );
  assert.match(
    validation.errors.join("\n"),
    /activity_assignments row 2: activity_id ACT999 does not exist in activity_library/i,
  );
  assert.match(
    validation.errors.join("\n"),
    /employee_skills row 2: employee_id E888 does not exist in As-Is org rows/i,
  );
  assert.match(
    validation.errors.join("\n"),
    /employee_skills row 2: skill_id SK999 does not exist in skill_library/i,
  );
  assert.match(
    validation.errors.join("\n"),
    /activity_skill_requirements row 2: activity_id ACT998 does not exist in activity_library/i,
  );
  assert.match(
    validation.errors.join("\n"),
    /role_skill_requirements row 2: skill_id SK997 does not exist in skill_library/i,
  );
});

test("creates a memory-only dataset with shared tables and As-Is state tables", () => {
  const dataset = createWorkCapabilityDataset({
    orgDatasetId: "org_1",
    files: allFiles(),
    orgRows,
    orgEmployeeIdColumn: "employee_id",
  });

  assert.equal(dataset.orgDatasetId, "org_1");
  assert.equal(dataset.shared.activityLibrary.length, 3);
  assert.equal(dataset.shared.skillLibrary.length, 1);
  assert.equal(dataset.shared.activitySkillRequirements.length, 2);
  assert.equal(dataset.states.asIs.activityAssignments.length, 2);
  assert.equal(dataset.states.asIs.roleSkillRequirements.length, 1);
  assert.equal(dataset.states.asIs.employeeSkills.length, 1);
  assert.equal(dataset.states.toBe, undefined);
  assert.equal(dataset.validation.status, "success");
});

test("builds activity portfolio metrics using allocation percentage", () => {
  const dataset = createWorkCapabilityDataset({
    orgDatasetId: "org_1",
    files: allFiles(),
    orgRows,
    orgEmployeeIdColumn: "employee_id",
  });

  const portfolio = buildWorkCapabilityActivityPortfolio({
    dataset,
    orgRows,
    orgEmployeeIdColumn: "employee_id",
  });
  const reporting = portfolio.activities.find(
    (activity) => activity.activityId === "ACT001",
  );
  const dashboards = portfolio.activities.find(
    (activity) => activity.activityId === "ACT002",
  );

  assert.equal(reporting.totalCost, 30);
  assert.equal(reporting.totalFTE, 0.25);
  assert.equal(reporting.assignedPeople, 1);
  assert.equal(reporting.departmentsInvolved, 1);
  assert.equal(reporting.responsibleCount, 1);
  assert.equal(reporting.accountableCount, 0);
  assert.equal(reporting.automationSaving, 9);
  assert.equal(reporting.outsourcingSaving, 3);
  assert.equal(dashboards.totalCost, 28);
  assert.equal(dashboards.totalFTE, 0.175);
  assert.equal(portfolio.kpis.totalActivities, 3);
  assert.equal(portfolio.kpis.mappedCost, 58);
});

test("builds activity analysis portfolio metrics and risk flags", () => {
  const dataset = createWorkCapabilityDataset({
    orgDatasetId: "org_1",
    files: allFiles(),
    orgRows,
    orgEmployeeIdColumn: "employee_id",
  });

  const analysis = buildActivityAnalysisPortfolio({
    dataset,
    orgRows,
    orgEmployeeIdColumn: "employee_id",
    columnMapping: null,
  });

  const reporting = analysis.activities.find(
    (activity) => activity.activityId === "ACT001",
  );
  const dashboards = analysis.activities.find(
    (activity) => activity.activityId === "ACT002",
  );

  assert.equal(analysis.kpis.totalMappedCost, 58);
  assert.equal(analysis.kpis.totalMappedFTE.toFixed(3), "0.425");
  assert.equal(analysis.kpis.totalAssignedPeople, 2);
  assert.equal(analysis.kpis.overloadedEmployees, 0);
  assert.equal(analysis.kpis.ownershipGaps, 3);
  assert.equal(analysis.kpis.automationSaving, 14.6);
  assert.equal(reporting?.activityCost, 30);
  assert.equal(reporting?.automationSaving, 9);
  assert.ok(reporting?.riskFlags.includes("Automation candidate"));
  assert.ok(reporting?.riskFlags.includes("High cost transactional work"));
  assert.equal(dashboards?.activityCost, 28);
  assert.equal(dashboards?.automationSaving, 5.6);
});

test("builds skills capability portfolio metrics and readiness scores", () => {
  const dataset = createWorkCapabilityDataset({
    orgDatasetId: "org_1",
    files: allFiles(),
    orgRows,
    orgEmployeeIdColumn: "employee_id",
  });

  const portfolio = buildSkillsCapabilityPortfolio({
    dataset,
    orgRows,
    orgEmployeeIdColumn: "employee_id",
    columnMapping: null,
  });

  // Test data: E2 (Ben, Manager) matches role_key "ops-manager" from roleSkillRequirements
  // E2's readiness for SK001: required_level=4, current_level=0 (no employee skill)
  // readiness = min(0/4, 1) * 3 / 3 = 0%
  // majorGaps = 1 (gap of 4)
  assert.equal(portfolio.kpis.criticalSkills, 1, "critical skills");
  assert.equal(portfolio.kpis.majorSkillGaps, 1, "major skill gaps");
  assert.equal(portfolio.kpis.averageReadiness.toFixed(1), "0.0", "average readiness");
  assert.equal(portfolio.kpis.rolesBelow70PctReadiness, 1, "roles below 70%");
  assert.equal(portfolio.kpis.activitiesAtSkillRisk, 1, "activities at skill risk");
  assert.equal(portfolio.kpis.singlePointCriticalSkills, 1, "single-point critical skills");
  assert.equal(portfolio.kpis.unvalidatedSyntheticSkills, 0, "unvalidated synthetic skills");

  const role = portfolio.roles.find((r) => r.employeeId === "E2");
  assert.equal(role?.readinessScore.toFixed(1), "0.0", "E2 readiness score");
  assert.equal(role?.riskStatus, "High capability risk", "E2 risk status");
  assert.equal(role?.majorGaps, 1, "E2 major gaps");

  const activity = portfolio.activities.find((a) => a.activityId === "ACT001");
  assert.equal(activity?.skillRisk, "Low", "ACT001 skill risk");
  assert.equal(activity?.lowestSkillCoveragePct.toFixed(1), "100.0", "ACT001 coverage");

  const skill = portfolio.skills.find((s) => s.skillId === "SK001");
  assert.equal(skill?.singlePointRisk, "High", "SK001 single-point risk");
});

test("builds taxonomy as domain category process activity hierarchy", () => {
  const dataset = createWorkCapabilityDataset({
    orgDatasetId: "org_1",
    files: allFiles(),
    orgRows,
    orgEmployeeIdColumn: "employee_id",
  });

  const portfolio = buildWorkCapabilityActivityPortfolio({
    dataset,
    orgRows,
    orgEmployeeIdColumn: "employee_id",
  });

  const opsActivity = portfolio.activities.find(
    (activity) => activity.activityId === "ACT001",
  );
  assert.equal(opsActivity.domain, "Ops");
  assert.equal(opsActivity.category, "Reporting");
  assert.equal(opsActivity.processArea, "Operations");

  const domainNode = portfolio.tree.find(
    (node) => node.kind === "domain" && node.domain === "Ops",
  );
  assert.ok(domainNode);
  assert.equal(domainNode.categoryCount, 1);
  assert.equal(domainNode.processCount, 1);
  assert.equal(domainNode.activityCount, 2);
  assert.equal(domainNode.criticalActivityCount, 1);

  const categoryNode = portfolio.tree.find(
    (node) =>
      node.kind === "category" &&
      node.domain === "Ops" &&
      node.category === "Reporting",
  );
  assert.ok(categoryNode);
  assert.equal(categoryNode.processCount, 1);
  assert.equal(categoryNode.activityCount, 2);

  const processNode = portfolio.tree.find(
    (node) =>
      node.kind === "process" &&
      node.domain === "Ops" &&
      node.category === "Reporting" &&
      node.processArea === "Operations",
  );
  assert.ok(processNode);
  assert.equal(processNode.activityCount, 2);

  const graph = buildWorkCapabilityTaxonomyGraph(dataset, {
    selectedNodeId: "taxonomy-root",
  });
  const domainGraphNode = graph.nodes.find(
    (node) => node.kind === "domain" && node.label === "Ops",
  );
  const categoryGraphNode = graph.nodes.find(
    (node) =>
      node.kind === "category" &&
      node.label === "Reporting" &&
      node.parentId === domainGraphNode.id,
  );
  const processGraphNode = graph.nodes.find(
    (node) =>
      node.kind === "process" &&
      node.label === "Operations" &&
      node.parentId === categoryGraphNode.id,
  );

  assert.ok(domainGraphNode);
  assert.ok(categoryGraphNode);
  assert.ok(processGraphNode);
});

test("scopes category and process node ids by their full taxonomy path", () => {
  const dataset = createWorkCapabilityDataset({
    orgDatasetId: "org_1",
    files: allFiles({
      activity_library: [
        activityLibraryRows[0],
        {
          ...activityLibraryRows[2],
          activity_category: "Reporting",
        },
      ],
      activity_assignments: [
        activityAssignmentsRows[0],
        { ...activityAssignmentsRows[1], activity_id: "ACT003" },
      ],
      activity_skill_requirements: [
        activitySkillRequirementRows[0],
        { ...activitySkillRequirementRows[1], activity_id: "ACT003" },
      ],
    }),
    orgRows,
    orgEmployeeIdColumn: "employee_id",
  });

  const portfolio = buildWorkCapabilityActivityPortfolio({
    dataset,
    orgRows,
    orgEmployeeIdColumn: "employee_id",
  });

  assert.ok(portfolio.tree.some((node) => node.id === "domain::Ops"));
  assert.ok(portfolio.tree.some((node) => node.id === "domain::Transition"));
  assert.ok(
    portfolio.tree.some((node) => node.id === "category::Ops::Reporting"),
  );
  assert.ok(
    portfolio.tree.some(
      (node) => node.id === "category::Transition::Reporting",
    ),
  );
  assert.ok(
    portfolio.tree.some(
      (node) => node.id === "process::Ops::Reporting::Operations",
    ),
  );
  assert.ok(
    portfolio.tree.some(
      (node) =>
        node.id === "process::Transition::Reporting::Transition Management",
    ),
  );

  const graph = buildWorkCapabilityTaxonomyGraph(dataset, {});
  const reportingNodes = graph.nodes.filter(
    (node) => node.kind === "category" && node.label === "Reporting",
  );
  assert.equal(reportingNodes.length, 2);
  assert.deepEqual(reportingNodes.map((node) => node.id).sort(), [
    "category::Ops::Reporting",
    "category::Transition::Reporting",
  ]);
  assert.equal(
    graph.nodes.some((node) => node.id === "category::Reporting"),
    false,
  );
  assert.equal(
    graph.edges.filter((edge) => edge.target === "category::Ops::Reporting")
      .length,
    1,
  );
  assert.equal(
    graph.edges.filter(
      (edge) => edge.target === "category::Transition::Reporting",
    ).length,
    1,
  );
});

test("uses taxonomy fallbacks for blank department, category, and process values", () => {
  const dataset = createWorkCapabilityDataset({
    orgDatasetId: "org_1",
    files: allFiles({
      activity_library: [
        {
          ...activityLibraryRows[0],
          activity_id: "ACT010",
          department_focus: "All",
          activity_category: "Reporting",
          process_area: "",
        },
        {
          ...activityLibraryRows[1],
          activity_id: "ACT011",
          department_focus: "",
          activity_category: "",
          process_area: "",
          activity_name: "Coordinate general admin",
        },
      ],
      activity_assignments: [
        { ...activityAssignmentsRows[0], activity_id: "ACT010" },
      ],
      activity_skill_requirements: [
        { ...activitySkillRequirementRows[0], activity_id: "ACT010" },
      ],
    }),
    orgRows,
    orgEmployeeIdColumn: "employee_id",
  });

  const portfolio = buildWorkCapabilityActivityPortfolio({
    dataset,
    orgRows,
    orgEmployeeIdColumn: "employee_id",
  });

  const reporting = portfolio.activities.find(
    (activity) => activity.activityId === "ACT010",
  );
  const general = portfolio.activities.find(
    (activity) => activity.activityId === "ACT011",
  );

  assert.equal(reporting.domain, "Data & Analytics");
  assert.equal(reporting.category, "Reporting");
  assert.equal(reporting.processArea, "General Process");
  assert.equal(general.domain, "Business Support");
  assert.equal(general.category, "Uncategorized");
  assert.equal(general.processArea, "General Process");
});

test("activity portfolio excludes archived activities by default", () => {
  const dataset = createWorkCapabilityDataset({
    orgDatasetId: "org_1",
    files: allFiles(),
    orgRows,
    orgEmployeeIdColumn: "employee_id",
  });
  const archived = applyWorkCapabilityTaxonomyMutation(dataset, {
    type: "deactivate_activity",
    activityId: "ACT001",
  });

  const defaultPortfolio = buildWorkCapabilityActivityPortfolio({
    dataset: archived,
    orgRows,
    orgEmployeeIdColumn: "employee_id",
  });
  const withArchived = buildWorkCapabilityActivityPortfolio({
    dataset: archived,
    orgRows,
    orgEmployeeIdColumn: "employee_id",
    includeArchived: true,
  });

  assert.equal(
    defaultPortfolio.activities.some(
      (activity) => activity.activityId === "ACT001",
    ),
    false,
  );
  assert.equal(defaultPortfolio.kpis.totalActivities, 2);
  assert.equal(
    withArchived.activities.some(
      (activity) => activity.activityId === "ACT001",
    ),
    true,
  );
  assert.equal(withArchived.kpis.totalActivities, 3);
});

test("classifies activity skill risk from assigned employee coverage", () => {
  const dataset = createWorkCapabilityDataset({
    orgDatasetId: "org_1",
    files: allFiles({
      activity_library: activityLibraryRows.map((row) =>
        row.activity_id === "ACT003" ? { ...row, criticality: "Medium" } : row,
      ),
      activity_assignments: [
        activityAssignmentsRows[0],
        activityAssignmentsRows[1],
        {
          ...activityAssignmentsRows[0],
          assignment_id: "ASN003",
          activity_id: "ACT003",
          employee_id: "E1",
        },
      ],
      employee_skills: [
        {
          ...employeeSkillRows[0],
          employee_id: "E1",
          skill_id: "SK001",
          current_level: 4,
        },
        {
          ...employeeSkillRows[0],
          employee_skill_id: "ES002",
          employee_id: "E2",
          skill_id: "SK001",
          current_level: 2,
        },
      ],
      activity_skill_requirements: [
        {
          ...activitySkillRequirementRows[0],
          activity_id: "ACT001",
          required_level: 4,
        },
        {
          ...activitySkillRequirementRows[1],
          activity_id: "ACT002",
          required_level: 4,
        },
        {
          ...activitySkillRequirementRows[0],
          activity_skill_requirement_id: "ASR003",
          activity_id: "ACT003",
          required_level: 5,
        },
      ],
    }),
    orgRows,
    orgEmployeeIdColumn: "employee_id",
  });

  const portfolio = buildWorkCapabilityActivityPortfolio({
    dataset,
    orgRows,
    orgEmployeeIdColumn: "employee_id",
  });

  assert.equal(
    portfolio.activities.find((activity) => activity.activityId === "ACT001")
      .skillRisk,
    "Low",
  );
  assert.equal(
    portfolio.activities.find((activity) => activity.activityId === "ACT002")
      .skillRisk,
    "High",
  );
  assert.equal(
    portfolio.activities.find((activity) => activity.activityId === "ACT003")
      .skillRisk,
    "Medium",
  );

  const unknownBase = createWorkCapabilityDataset({
    orgDatasetId: "org_1",
    files: allFiles(),
    orgRows,
    orgEmployeeIdColumn: "employee_id",
  });
  const unknownPortfolio = buildWorkCapabilityActivityPortfolio({
    dataset: {
      ...unknownBase,
      shared: { ...unknownBase.shared, activitySkillRequirements: [] },
    },
    orgRows,
    orgEmployeeIdColumn: "employee_id",
  });
  assert.equal(
    unknownPortfolio.activities.find(
      (activity) => activity.activityId === "ACT001",
    ).skillRisk,
    "Unknown",
  );
});

test("renames process and category taxonomy labels in canonical activity library", () => {
  const dataset = createWorkCapabilityDataset({
    orgDatasetId: "org_1",
    files: allFiles(),
    orgRows,
    orgEmployeeIdColumn: "employee_id",
  });

  const renamedProcess = applyWorkCapabilityTaxonomyMutation(dataset, {
    type: "rename_process",
    from: "Operations",
    to: "Service Operations",
  });

  assert.equal(
    renamedProcess.shared.activityLibrary.filter(
      (row) => row.process_area === "Service Operations",
    ).length,
    2,
  );
  assert.equal(
    renamedProcess.shared.activityLibrary.find(
      (row) => row.activity_id === "ACT003",
    ).process_area,
    "Transition Management",
  );
  assert.equal(renamedProcess.revision, dataset.revision + 1);
  assert.equal(
    renamedProcess.taxonomyChangeLog.at(-1).action,
    "rename_process",
  );

  const renamedCategory = applyWorkCapabilityTaxonomyMutation(renamedProcess, {
    type: "rename_category",
    processArea: "Service Operations",
    from: "Reporting",
    to: "Performance Reporting",
  });

  assert.equal(
    renamedCategory.shared.activityLibrary.filter(
      (row) => row.activity_category === "Performance Reporting",
    ).length,
    2,
  );
  assert.equal(
    renamedCategory.taxonomyChangeLog.at(-1).affected.activityRows,
    2,
  );
});

test("moves an activity category to another process as a single taxonomy mutation", () => {
  const dataset = createWorkCapabilityDataset({
    orgDatasetId: "org_1",
    files: allFiles(),
    orgRows,
    orgEmployeeIdColumn: "employee_id",
  });

  const moved = applyWorkCapabilityTaxonomyMutation(dataset, {
    type: "move_category",
    processArea: "Operations",
    category: "Reporting",
    toProcessArea: "Transition Management",
  });

  const movedRows = moved.shared.activityLibrary.filter(
    (row) => row.activity_category === "Reporting",
  );
  assert.equal(movedRows.length, 2);
  assert.equal(
    movedRows.every((row) => row.process_area === "Transition Management"),
    true,
  );
  assert.equal(moved.taxonomyChangeLog.at(-1).action, "move_category");
  assert.equal(moved.taxonomyChangeLog.at(-1).affected.activityRows, 2);
});

test("moves and edits one activity without changing its stable activity id", () => {
  const dataset = createWorkCapabilityDataset({
    orgDatasetId: "org_1",
    files: allFiles(),
    orgRows,
    orgEmployeeIdColumn: "employee_id",
  });

  const moved = applyWorkCapabilityTaxonomyMutation(dataset, {
    type: "move_activity",
    activityId: "ACT001",
    processArea: "Transition Management",
    category: "KT Planning",
  });
  const edited = applyWorkCapabilityTaxonomyMutation(moved, {
    type: "update_activity",
    activityId: "ACT001",
    patch: {
      activity_name: "Run weekly service reporting",
      criticality: "High",
      automation_cost_reduction_pct: 45,
    },
  });

  const activity = edited.shared.activityLibrary.find(
    (row) => row.activity_id === "ACT001",
  );
  assert.equal(activity.activity_id, "ACT001");
  assert.equal(activity.process_area, "Transition Management");
  assert.equal(activity.activity_category, "KT Planning");
  assert.equal(activity.activity_name, "Run weekly service reporting");
  assert.equal(activity.criticality, "High");
  assert.equal(activity.automation_cost_reduction_pct, 45);
  assert.equal(
    edited.states.asIs.activityAssignments.find(
      (row) => row.assignment_id === "ASN001",
    ).activity_id,
    "ACT001",
  );
});

test("adds and deactivates activities while preserving rows for traceability", () => {
  const dataset = createWorkCapabilityDataset({
    orgDatasetId: "org_1",
    files: allFiles(),
    orgRows,
    orgEmployeeIdColumn: "employee_id",
  });

  const added = applyWorkCapabilityTaxonomyMutation(dataset, {
    type: "add_activity",
    row: {
      activity_id: "ACT999",
      activity_name: "Review vendor invoices",
      department_focus: "Finance",
      activity_category: "Vendor Management",
      process_area: "Business Support",
      nature: "Transactional",
      criticality: "Medium",
      automation_cost_reduction_pct: 15,
      outsourcing_cost_reduction_pct: 10,
      complexity: "Low",
      frequency: "Monthly",
      active_flag: true,
    },
  });

  assert.equal(
    added.shared.activityLibrary.some((row) => row.activity_id === "ACT999"),
    true,
  );
  assert.equal(
    added.states.asIs.activityAssignments.some(
      (row) => row.activity_id === "ACT999",
    ),
    false,
  );

  const deactivated = applyWorkCapabilityTaxonomyMutation(added, {
    type: "deactivate_activity",
    activityId: "ACT999",
  });

  assert.equal(
    deactivated.shared.activityLibrary.find(
      (row) => row.activity_id === "ACT999",
    ).active_flag,
    false,
  );
  assert.equal(
    deactivated.taxonomyChangeLog.at(-1).action,
    "deactivate_activity",
  );
});

test("merges activities by repointing assignments and skill requirements then deactivating sources", () => {
  const dataset = createWorkCapabilityDataset({
    orgDatasetId: "org_1",
    files: allFiles(),
    orgRows,
    orgEmployeeIdColumn: "employee_id",
  });

  const impact = getWorkCapabilityTaxonomyMutationImpact(dataset, {
    type: "merge_activities",
    sourceActivityIds: ["ACT002"],
    targetActivityId: "ACT001",
  });
  assert.equal(impact.activityRows, 1);
  assert.equal(impact.assignmentRows, 1);
  assert.equal(impact.skillRequirementRows, 1);

  const merged = applyWorkCapabilityTaxonomyMutation(dataset, {
    type: "merge_activities",
    sourceActivityIds: ["ACT002"],
    targetActivityId: "ACT001",
  });

  assert.equal(
    merged.states.asIs.activityAssignments.find(
      (row) => row.assignment_id === "ASN002",
    ).activity_id,
    "ACT001",
  );
  assert.equal(
    merged.states.asIs.activityAssignments.some(
      (row) => row.activity_id === "ACT002",
    ),
    false,
  );
  assert.equal(
    merged.shared.activitySkillRequirements.some(
      (row) => row.activity_id === "ACT002",
    ),
    false,
  );
  assert.equal(
    merged.shared.activityLibrary.find((row) => row.activity_id === "ACT002")
      .active_flag,
    false,
  );
  assert.equal(merged.taxonomyChangeLog.at(-1).affected.assignmentRows, 1);
  assert.equal(
    merged.taxonomyChangeLog.at(-1).affected.skillRequirementRows,
    1,
  );
});

test("merge dedupes assignments and skill requirements after repointing", () => {
  const dataset = createWorkCapabilityDataset({
    orgDatasetId: "org_1",
    files: allFiles({
      activity_assignments: [
        { ...activityAssignmentsRows[0], notes: "first" },
        {
          ...activityAssignmentsRows[0],
          assignment_id: "ASN002",
          activity_id: "ACT002",
          time_allocation_pct: 15,
          notes: "second",
        },
      ],
      activity_skill_requirements: [
        {
          ...activitySkillRequirementRows[0],
          activity_id: "ACT001",
          required_level: 3,
          criticality: "Medium",
          weight: 0.6,
        },
        {
          ...activitySkillRequirementRows[1],
          activity_id: "ACT002",
          required_level: 4,
          criticality: "High",
          weight: 0.8,
        },
      ],
    }),
    orgRows,
    orgEmployeeIdColumn: "employee_id",
  });

  const merged = applyWorkCapabilityTaxonomyMutation(dataset, {
    type: "merge_activities",
    sourceActivityIds: ["ACT002"],
    targetActivityId: "ACT001",
  });

  const assignments = merged.states.asIs.activityAssignments.filter(
    (row) => row.activity_id === "ACT001",
  );
  assert.equal(assignments.length, 1);
  assert.equal(assignments[0].time_allocation_pct, 40);
  assert.match(assignments[0].notes, /first/);
  assert.match(assignments[0].notes, /second/);

  const requirements = merged.shared.activitySkillRequirements.filter(
    (row) => row.activity_id === "ACT001" && row.skill_id === "SK001",
  );
  assert.equal(requirements.length, 1);
  assert.equal(requirements[0].required_level, 4);
  assert.equal(requirements[0].criticality, "High");
  assert.equal(requirements[0].weight, 0.8);
  assert.equal(
    merged.shared.activityLibrary.find((row) => row.activity_id === "ACT002")
      .merged_into_activity_id,
    "ACT001",
  );
});

test("merge impact previews moved rows, deduped skill requirements, cost, and FTE", () => {
  const dataset = createWorkCapabilityDataset({
    orgDatasetId: "org_1",
    files: allFiles({
      activity_assignments: [
        activityAssignmentsRows[0],
        {
          ...activityAssignmentsRows[0],
          assignment_id: "ASN002",
          activity_id: "ACT002",
          time_allocation_pct: 15,
          notes: "second",
        },
      ],
      activity_skill_requirements: [
        {
          ...activitySkillRequirementRows[0],
          activity_id: "ACT001",
          required_level: 3,
          criticality: "Medium",
          weight: 0.6,
        },
        {
          ...activitySkillRequirementRows[1],
          activity_id: "ACT002",
          required_level: 4,
          criticality: "High",
          weight: 0.8,
        },
      ],
    }),
    orgRows,
    orgEmployeeIdColumn: "employee_id",
  });

  const portfolio = buildWorkCapabilityActivityPortfolio({
    dataset,
    orgRows,
    orgEmployeeIdColumn: "employee_id",
  });
  const impact = getWorkCapabilityMergeImpact({
    dataset,
    portfolio,
    sourceActivityIds: ["ACT002"],
    targetActivityId: "ACT001",
  });

  assert.equal(impact.assignmentsMoved, 1);
  assert.equal(impact.skillRequirementsMerged, 1);
  assert.equal(impact.duplicateSkillRequirementsDeduped, 1);
  assert.equal(impact.costAffected, 18);
  assert.equal(impact.fteAffected, 0.15);
});

test("archive impact previews people, cost, FTE, skills, and accountability links", () => {
  const dataset = createWorkCapabilityDataset({
    orgDatasetId: "org_1",
    files: allFiles(),
    orgRows,
    orgEmployeeIdColumn: "employee_id",
  });
  const portfolio = buildWorkCapabilityActivityPortfolio({
    dataset,
    orgRows,
    orgEmployeeIdColumn: "employee_id",
  });

  const impact = getWorkCapabilityArchiveImpact({
    dataset,
    portfolio,
    activityIds: ["ACT002"],
  });

  assert.equal(impact.activityCount, 1);
  assert.equal(impact.assignedPeople, 1);
  assert.equal(impact.totalCost, 28);
  assert.equal(impact.totalFTE, 0.175);
  assert.equal(impact.skillRequirements, 1);
  assert.equal(impact.accountabilityLinks, 1);
});

test("taxonomy cleanup suggestions flag duplicates, single-child chains, unassigned work, skill gaps, owner gaps, and archives", () => {
  const dataset = createWorkCapabilityDataset({
    orgDatasetId: "org_1",
    files: allFiles({
      activity_library: [
        activityLibraryRows[0],
        {
          ...activityLibraryRows[1],
          activity_name: "Run reporting",
          active_flag: true,
        },
        activityLibraryRows[2],
        {
          ...activityLibraryRows[2],
          activity_id: "ACT004",
          activity_name: "Archived transition work",
          active_flag: false,
        },
      ],
      activity_assignments: [activityAssignmentsRows[0]],
      activity_skill_requirements: [activitySkillRequirementRows[0]],
    }),
    orgRows,
    orgEmployeeIdColumn: "employee_id",
  });
  const portfolio = buildWorkCapabilityActivityPortfolio({
    dataset,
    orgRows,
    orgEmployeeIdColumn: "employee_id",
    includeArchived: true,
  });

  const suggestions = buildWorkCapabilityTaxonomyCleanupSuggestions({
    dataset,
    portfolio,
  });
  const types = suggestions.map((suggestion) => suggestion.type);

  assert.ok(types.includes("possible_duplicate"));
  assert.ok(types.includes("single_child_chain"));
  assert.ok(types.includes("unassigned_activity"));
  assert.ok(types.includes("missing_skill_requirements"));
  assert.ok(types.includes("missing_accountable_owner"));
  assert.ok(types.includes("archived_count"));
  assert.ok(
    suggestions
      .find((suggestion) => suggestion.type === "possible_duplicate")
      .actions.includes("Review"),
  );
  assert.ok(
    suggestions
      .find((suggestion) => suggestion.type === "possible_duplicate")
      .actions.includes("Merge"),
  );
});

test("builds a visual taxonomy graph with branch-level activity expansion", () => {
  const dataset = createWorkCapabilityDataset({
    orgDatasetId: "org_1",
    files: allFiles(),
    orgRows,
    orgEmployeeIdColumn: "employee_id",
  });

  const overview = buildWorkCapabilityTaxonomyGraph(dataset, {});

  assert.ok(
    overview.nodes.some(
      (node) => node.kind === "root" && node.id === "taxonomy-root",
    ),
  );
  assert.ok(
    overview.nodes.some(
      (node) => node.kind === "domain" && node.label === "Transition",
    ),
  );
  assert.ok(
    overview.nodes.some(
      (node) => node.kind === "category" && node.label === "Reporting",
    ),
  );
  assert.ok(
    overview.nodes.some(
      (node) => node.kind === "process" && node.label === "Operations",
    ),
  );
  assert.equal(
    overview.nodes.some((node) => node.kind === "activity"),
    false,
  );
  assert.ok(
    overview.edges.some(
      (edge) =>
        edge.source === "taxonomy-root" && edge.target.startsWith("domain::"),
    ),
  );

  const expanded = buildWorkCapabilityTaxonomyGraph(dataset, {
    selectedNodeId: "process::Ops::Reporting::Operations",
  });

  const activityNode = expanded.nodes.find(
    (node) => node.kind === "activity" && node.activityId === "ACT002",
  );
  assert.ok(activityNode);
  assert.equal(activityNode.criticality, "High");
  assert.equal(activityNode.automationPct, 20);
  assert.ok(expanded.edges.some((edge) => edge.target === activityNode.id));
});

test("blocks hard delete when dependent rows exist", () => {
  const dataset = createWorkCapabilityDataset({
    orgDatasetId: "org_1",
    files: allFiles(),
    orgRows,
    orgEmployeeIdColumn: "employee_id",
  });

  const guard = canHardDeleteWorkCapabilityActivity(dataset, "ACT001");

  assert.equal(guard.allowed, false);
  assert.match(guard.reason, /deactivate or merge/i);
  assert.equal(guard.assignmentRows, 1);
  assert.equal(guard.skillRequirementRows, 1);
});

test("Work & Capability UI is present after org upload and is not persisted to localStorage", () => {
  const page = fs.readFileSync("src/app/page.tsx", "utf8");

  assert.match(page, /type Tab = .*"work-capability"/s);
  assert.match(page, /label: "Work & Capability"/);
  assert.match(page, /useState<WorkCapabilityDataset \| null>\(null\)/);
  assert.match(page, /workCapabilityDataset/);
  assert.match(page, /Normalization Review/);
  assert.match(page, /updateWorkCapabilityNormalization/);
  assert.doesNotMatch(page, /localStorage\.setItem\([^)]*workCapability/i);
});

test("Work & Capability upload is a multi-step modal and hides issues until import", () => {
  const page = fs.readFileSync("src/app/page.tsx", "utf8");
  const css = fs.readFileSync("src/app/page.module.css", "utf8");

  assert.match(page, /workCapabilityUploadOpen/);
  assert.match(page, /workCapabilityStep/);
  assert.match(page, /hasImportAttempted/);
  assert.match(page, /Open upload modal/);
  assert.match(page, /Select files/);
  assert.match(page, /Review files/);
  assert.match(page, /Import result/);
  assert.match(page, /\{hasImportAttempted && \(/);
  assert.match(
    page,
    /\{hasImportAttempted && normalization && normalization\.totalGroups > 0 && \(/,
  );
  assert.match(css, /\.workCapabilityModalOverlay/);
  assert.match(css, /\.workCapabilityStepper/);
});

test("Work & Capability includes an editable process taxonomy manager", () => {
  const page = fs.readFileSync("src/app/page.tsx", "utf8");
  const css = fs.readFileSync("src/app/page.module.css", "utf8");

  assert.match(page, /Catalog View/);
  assert.doesNotMatch(page, />\s*Map View\s*</);
  assert.match(page, /Experimental Map/);
  assert.match(page, /showExperimentalMap/);
  assert.match(page, /buildWorkCapabilityActivityPortfolio/);
  assert.match(page, /Scenario Levers/);
  assert.match(page, /Archive Activity/);
  assert.match(page, /ReactFlow/);
  assert.match(page, /Controls/);
  assert.match(page, /MiniMap/);
  assert.match(page, /buildWorkCapabilityTaxonomyGraph/);
  assert.match(page, /Taxonomy Inspector/);
  assert.match(page, /Search taxonomy/);
  assert.match(page, /applyWorkCapabilityTaxonomyMutation/);
  assert.match(page, /getWorkCapabilityTaxonomyMutationImpact/);
  assert.match(page, /getWorkCapabilityMergeImpact/);
  assert.match(page, /getWorkCapabilityArchiveImpact/);
  assert.match(page, /buildWorkCapabilityTaxonomyCleanupSuggestions/);
  assert.match(page, /Rename Process/);
  assert.match(page, /Merge Activities/);
  assert.match(page, /selectedActivityIds/);
  assert.match(page, /workCapabilityBulkActionBar/);
  assert.match(page, /Archive Selected/);
  assert.match(page, /Taxonomy Cleanup Suggestions/);
  assert.match(page, /Edit Activity/);
  assert.match(page, /detailEditMode/);
  assert.match(page, /Taxonomy Change Log/);
  assert.match(css, /\.workCapabilityTaxonomyCanvas/);
  assert.match(css, /\.workCapabilityCatalogWorkspace/);
  assert.match(css, /\.workCapabilityActivityTable/);
  assert.match(css, /\.workCapabilityInspector/);
  assert.match(css, /\.workCapabilityTaxonomyNode/);
  assert.match(css, /\.workCapabilityBulkActionBar/);
  assert.match(css, /\.workCapabilityCleanupPanel/);
  assert.match(css, /\.workCapabilityActionModalOverlay/);
  assert.doesNotMatch(page, /setScenario/);
  assert.doesNotMatch(page, /localStorage\.setItem\([^)]*workCapability/i);
});
