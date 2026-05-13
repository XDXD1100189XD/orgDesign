const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = function loadTs(module, filename) {
  const source = require("node:fs").readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2017,
      esModuleInterop: true,
    },
  }).outputText;
  module._compile(output, filename);
};

const { buildHierarchyFromMapping } = require("../src/lib/buildHierarchy.ts");
const { computeStateMetrics } = require("../src/lib/computeStateMetrics.ts");
const { applyOrgMutation, createOrgDataset } = require("../src/lib/orgDataset.ts");

const mapping = {
  "Employee ID": { column: "employee_id", confidence: 1, isManual: true },
  "Manager ID": { column: "manager_id", confidence: 1, isManual: true },
  "Full Name": { column: "name", confidence: 1, isManual: true },
  "Business Title": { column: "title", confidence: 1, isManual: true },
  "Department Name": { column: "department", confidence: 1, isManual: true },
  "Division": { column: null, confidence: 0, isManual: false },
  "Sub-Division": { column: null, confidence: 0, isManual: false },
  "Location": { column: "geo", confidence: 1, isManual: true },
  "Country": { column: "country", confidence: 1, isManual: true },
  "Region": { column: "region", confidence: 1, isManual: true },
  "Job Family": { column: null, confidence: 0, isManual: false },
  "Job Sub Family": { column: null, confidence: 0, isManual: false },
  "Compensation Grade": { column: "grade", confidence: 1, isManual: true },
  "Management Level": { column: null, confidence: 0, isManual: false },
  "Worker Type": { column: null, confidence: 0, isManual: false },
  "FTE": { column: null, confidence: 0, isManual: false },
  "Annual Compensation": { column: null, confidence: 0, isManual: false },
  "Annual Rate": { column: null, confidence: 0, isManual: false },
  "Position Status": { column: "status", confidence: 1, isManual: true },
  "Squad": { column: null, confidence: 0, isManual: false },
  "Days Open": { column: null, confidence: 0, isManual: false },
};

const rows = [
  { employee_id: "E1", manager_id: "", name: "Ada", title: "CEO", department: "Exec", grade: "G1", geo: "US", country: "USA", region: "NA", status: "Filled" },
  { employee_id: "E2", manager_id: "E1", name: "Ben", title: "Mgr", department: "Ops", grade: "G1", geo: "IN", country: "India", region: "APAC", status: "Filled" },
];

const compMatrix = {
  G1: {
    US: { min: 100, max: 100, currency: "USD" },
    IN: { min: 200, max: 200, currency: "USD" },
  },
};

test("hierarchy rebuild copies mapped geography to vertices for cost calculations", () => {
  const data = buildHierarchyFromMapping(rows, mapping);

  assert.equal(data.vertices.E1.geo, "US");
  assert.equal(data.vertices.E2.geo, "IN");
});

test("total cost follows exact grade and geography bands after a row geography edit", () => {
  const before = buildHierarchyFromMapping(rows, mapping);
  before.compMatrix = compMatrix;
  assert.equal(computeStateMetrics(before).totalCost, 300);

  const after = buildHierarchyFromMapping(
    rows.map((row) => row.employee_id === "E2" ? { ...row, geo: "US" } : row),
    mapping,
  );
  after.compMatrix = compMatrix;

  assert.equal(computeStateMetrics(after).totalCost, 200);
});

test("as-is and to-be geography cost changes stay isolated by canonical state", () => {
  const dataset = createOrgDataset({ rows, headers: Object.keys(rows[0]), mapping });
  const withComp = applyOrgMutation(dataset, {
    target: "both",
    source: "comp",
    action: "updateCompMatrix",
    compMatrix,
  });
  const withToBe = applyOrgMutation(withComp, { target: "toBe", source: "session", action: "copyFromAsIs" });
  const editedToBe = applyOrgMutation(withToBe, {
    target: "toBe",
    source: "ai-sql",
    action: "replaceRows",
    rows: withToBe.states.toBe.rows.map((row) => row.employee_id === "E2" ? { ...row, geo: "US" } : row),
  });

  assert.equal(computeStateMetrics(editedToBe.states.asIs.data).totalCost, 300);
  assert.equal(computeStateMetrics(editedToBe.states.toBe.data).totalCost, 200);
});

test("rows with an unmapped geography band are reported instead of priced with another geo band", () => {
  const data = buildHierarchyFromMapping([{ ...rows[0], geo: "UK" }], mapping);
  data.compMatrix = compMatrix;
  const metrics = computeStateMetrics(data);

  assert.equal(metrics.totalCost, null);
  assert.deepEqual(metrics.missingCompBands, [{ employeeId: "E1", grade: "G1", geo: "UK" }]);
});

test("AI scenario planning chooses the compensation matrix for the requested target state", () => {
  const source = fs.readFileSync("src/components/dashboard/AIAssistantView.tsx", "utf8");

  assert.match(source, /const targetData\s+=\s+target === 'to-be' \? toBeDataRef\.current : d;/);
  assert.match(source, /targetData\?\.compMatrix \?\? null,/);
  assert.match(source, /const targetData\s+=\s+plan\.target === 'to-be' \? toBeDataRef\.current : dataRef\.current;/);
});
