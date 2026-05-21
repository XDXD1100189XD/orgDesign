const assert = require("node:assert/strict");
const { webcrypto } = require("node:crypto");
const { readFileSync } = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

globalThis.crypto = webcrypto;

const repoRoot = path.resolve(__dirname, "..");

require.extensions[".ts"] = function compileTs(module, filename) {
  const source = readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
  }).outputText;
  module._compile(output, filename);
};

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(
      this,
      path.join(repoRoot, "src", request.slice(2)),
      parent,
      isMain,
      options,
    );
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const {
  createSnapshotPayload,
  decryptSnapshot,
  encryptSnapshot,
  restoreSnapshotPayload,
} = require("../src/lib/offlineSnapshot.ts");

function makeDashboard(compMatrix) {
  return {
    vertices: {},
    edges: [],
    warnings: [],
    compMatrix,
    metrics: {
      basic: { total_nodes: 0, total_edges: 0, root_count: 0, roots: [] },
      span: {},
      depth: {},
      subtree_count: {},
      children: {},
      parent: {},
      org_structure: {
        org_depth: 0,
        width_per_level: {},
        layer_efficiency_score: 0,
        diameter: 0,
      },
      management: {
        manager_count: 0,
        avg_span: 0,
        span_variance: 0,
        span_gini: 0,
        span_overload_index: 0,
        overload_threshold: 0,
        overloaded: 0,
      },
      avg_confidence: 1,
    },
  };
}

function makeMapping(employeeColumn, gradeColumn) {
  const fields = [
    "Employee ID", "Manager ID", "Full Name", "Business Title", "Department Name",
    "Division", "Sub-Division", "Location", "Country", "Region", "Job Family",
    "Job Sub Family", "Compensation Grade", "Management Level", "Worker Type",
    "FTE", "Annual Compensation", "Annual Rate", "Position Status", "Squad",
    "Days Open",
  ];
  const mapping = Object.fromEntries(
    fields.map((field) => [field, { column: null, confidence: 0, isManual: false }]),
  );
  mapping["Employee ID"] = { column: employeeColumn, confidence: 1, isManual: true };
  mapping["Manager ID"] = { column: "manager_id", confidence: 1, isManual: true };
  mapping["Full Name"] = { column: "name", confidence: 1, isManual: true };
  mapping["Business Title"] = { column: "role", confidence: 1, isManual: true };
  mapping["Compensation Grade"] = { column: gradeColumn, confidence: 1, isManual: true };
  return mapping;
}

test("encrypted snapshot round trips canonical org, comp, mappings, workforce, and story state", async () => {
  const asIsComp = { G7: { US: { min: 100, max: 200, currency: "USD" } } };
  const toBeComp = { G8: { UK: { min: 150, max: 250, currency: "GBP" } } };
  const baselineMapping = makeMapping("employee_id", "grade");
  const asIsMapping = makeMapping("emp_id_override", "comp_grade_as_is");
  const toBeMapping = makeMapping("employee_id", "target_grade");

  const state = {
    dataset: {
      datasetId: "org-test",
      sourceFileName: "org.xlsx",
      uploadedAt: "2026-05-21T00:00:00.000Z",
      baselineRows: [{ employee_id: "E1", manager_id: "", name: "A", grade: "G7" }],
      baselineHeaders: ["employee_id", "manager_id", "name", "grade"],
      defaultMapping: baselineMapping,
      states: {
        baseline: {
          stateId: "baseline",
          label: "Uploaded Baseline",
          rows: [{ employee_id: "E1", manager_id: "", name: "A", grade: "G7" }],
          headers: ["employee_id", "manager_id", "name", "grade"],
          mapping: baselineMapping,
          data: makeDashboard({}),
          compMatrix: {},
          revision: 0,
          updatedAt: "2026-05-21T00:00:00.000Z",
        },
        asIs: {
          stateId: "asIs",
          label: "As-Is",
          rows: [{ employee_id: "E1", emp_id_override: "E1", manager_id: "", name: "A", comp_grade_as_is: "G7", derived_cost_center: "CC1" }],
          headers: ["employee_id", "emp_id_override", "manager_id", "name", "comp_grade_as_is", "derived_cost_center"],
          mapping: asIsMapping,
          data: makeDashboard(asIsComp),
          compMatrix: asIsComp,
          revision: 2,
          updatedAt: "2026-05-21T00:01:00.000Z",
        },
        toBe: {
          stateId: "toBe",
          label: "To-Be",
          rows: [{ employee_id: "E1", manager_id: "", name: "A", target_grade: "G8", to_be_field: "yes" }],
          headers: ["employee_id", "manager_id", "name", "target_grade", "to_be_field"],
          mapping: toBeMapping,
          data: makeDashboard(toBeComp),
          compMatrix: toBeComp,
          revision: 1,
          updatedAt: "2026-05-21T00:02:00.000Z",
        },
      },
      activeStateBySurface: { table: "toBe", studio: "asIs", hierarchy: "toBe", ai: "asIs" },
      changeLog: [],
      revision: 4,
    },
    data: makeDashboard(asIsComp),
    toBeData: makeDashboard(toBeComp),
    columnMapping: asIsMapping,
    excelRows: [{ employee_id: "E1" }],
    excelHeaders: ["employee_id"],
    asIsMutatedRows: [{ employee_id: "E1", derived_cost_center: "CC1" }],
    toBeMutatedRows: [{ employee_id: "E1", to_be_field: "yes" }],
    changeLog: [],
    workCapabilityDataset: { datasetId: "wc-test", revision: 3, shared: {}, states: { asIs: {} } },
    successionCandidates: [{ roleId: "role-1", candidateId: "E1", readinessScore: 88 }],
    storyDoc: { id: "story-1", title: "Snapshot Story", slides: [], createdAt: "2026-05-21T00:00:00.000Z", updatedAt: "2026-05-21T00:00:00.000Z" },
    activeSlideId: "slide-1",
    libraryItems: [{ rows: [{ metric: "Cost", value: 100 }], columns: ["metric", "value"], source: { type: "org-metrics", label: "Metric", capturedAt: "2026-05-21T00:00:00.000Z" }, label: "Metric" }],
    ui: { activeTab: "story", workforceSubTab: "talent-mapping", studioSlice: "to-be", tableSlice: "to-be", compTarget: "both" },
    sourceFiles: { orgFileName: "org.xlsx", toBeFileName: "target.xlsx" },
  };

  const payload = createSnapshotPayload(state, "2026-05-21T12:00:00.000Z");
  const envelopeText = await encryptSnapshot(payload, "correct horse battery staple");
  assert.match(envelopeText, /"format":"org-dashboard-snapshot"/);
  assert.doesNotMatch(envelopeText, /comp_grade_as_is/);

  await assert.rejects(
    () => decryptSnapshot(envelopeText, "wrong password"),
    /Could not decrypt snapshot/,
  );

  const decrypted = await decryptSnapshot(envelopeText, "correct horse battery staple");
  const restored = restoreSnapshotPayload(decrypted);

  assert.equal(restored.dataset.states.asIs.compMatrix.G7.US.currency, "USD");
  assert.equal(restored.dataset.states.toBe.compMatrix.G8.UK.currency, "GBP");
  assert.equal(restored.dataset.states.asIs.mapping["Compensation Grade"].column, "comp_grade_as_is");
  assert.equal(restored.dataset.states.toBe.mapping["Compensation Grade"].column, "target_grade");
  assert.deepEqual(restored.dataset.states.asIs.headers, ["employee_id", "emp_id_override", "manager_id", "name", "comp_grade_as_is", "derived_cost_center"]);
  assert.equal(restored.workCapabilityDataset.datasetId, "wc-test");
  assert.equal(restored.storyDoc.title, "Snapshot Story");
  assert.equal(restored.ui.compTarget, "both");
});
