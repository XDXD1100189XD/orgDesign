import assert from "node:assert/strict";
import test from "node:test";
import type { ColumnMapping } from "../src/lib/fieldDictionary";
import type { ExcelRow } from "../src/lib/parseExcel";
import {
  applyOrgMutation,
  createOrgDataset,
  restoreOrgDataset,
  stateHeadersForMapping,
} from "../src/lib/orgDataset";

const mapping: ColumnMapping = {
  "Employee ID": { column: "employee_id", confidence: 1, isManual: true },
  "Manager ID": { column: "manager_id", confidence: 1, isManual: true },
  "Full Name": { column: "name", confidence: 1, isManual: true },
  "Business Title": { column: "title", confidence: 1, isManual: true },
  "Department Name": { column: "department", confidence: 1, isManual: true },
  "Division": { column: null, confidence: 0, isManual: false },
  "Sub-Division": { column: null, confidence: 0, isManual: false },
  "Location": { column: null, confidence: 0, isManual: false },
  "Country": { column: null, confidence: 0, isManual: false },
  "Region": { column: null, confidence: 0, isManual: false },
  "Job Family": { column: null, confidence: 0, isManual: false },
  "Job Sub Family": { column: null, confidence: 0, isManual: false },
  "Compensation Grade": { column: "grade", confidence: 1, isManual: true },
  "Management Level": { column: null, confidence: 0, isManual: false },
  "Worker Type": { column: null, confidence: 0, isManual: false },
  "FTE": { column: null, confidence: 0, isManual: false },
  "Annual Compensation": { column: "salary", confidence: 1, isManual: true },
  "Annual Rate": { column: null, confidence: 0, isManual: false },
  "Position Status": { column: "status", confidence: 1, isManual: true },
  "Squad": { column: null, confidence: 0, isManual: false },
  "Days Open": { column: null, confidence: 0, isManual: false },
};

const rows: ExcelRow[] = [
  { employee_id: "E1", manager_id: "", name: "Ada", title: "CEO", department: "Exec", grade: "M6", salary: 100, status: "Filled" },
  { employee_id: "E2", manager_id: "E1", name: "Ben", title: "VP", department: "Product", grade: "M5", salary: 80, status: "Filled" },
];

test("createOrgDataset keeps uploaded rows immutable and initializes editable As-Is from them", () => {
  const dataset = createOrgDataset({ rows, headers: Object.keys(rows[0]), mapping, sourceFileName: "org.xlsx" });

  assert.notEqual(dataset.baselineRows, dataset.states.asIs.rows);
  assert.deepEqual(dataset.baselineRows, rows);
  assert.deepEqual(dataset.states.asIs.rows, rows);

  dataset.states.asIs.rows[0].name = "Changed";
  assert.equal(dataset.baselineRows[0].name, "Ada");
});

test("row mutations update only the selected state and never mutate baseline", () => {
  const dataset = createOrgDataset({ rows, headers: Object.keys(rows[0]), mapping });
  const withToBe = applyOrgMutation(dataset, { target: "toBe", source: "hierarchy", action: "copyFromAsIs" });
  const edited = applyOrgMutation(withToBe, {
    target: "toBe",
    source: "analytics-sql",
    action: "replaceRows",
    rows: withToBe.states.toBe!.rows.map((row) => row.employee_id === "E2" ? { ...row, department: "Design" } : row),
  });

  assert.equal(edited.states.toBe?.rows.find((row) => row.employee_id === "E2")?.department, "Design");
  assert.equal(edited.states.asIs.rows.find((row) => row.employee_id === "E2")?.department, "Product");
  assert.equal(edited.baselineRows.find((row) => row.employee_id === "E2")?.department, "Product");
});

test("derived columns can be mapped in one state without becoming baseline headers", () => {
  const dataset = createOrgDataset({ rows, headers: Object.keys(rows[0]), mapping });
  const withDerived = applyOrgMutation(dataset, {
    target: "asIs",
    source: "ai",
    action: "replaceRows",
    rows: dataset.states.asIs.rows.map((row) => ({ ...row, loaded_cost: Number(row.salary ?? 0) * 1.2 })),
  });
  const remapped = applyOrgMutation(withDerived, {
    target: "asIs",
    source: "mapping",
    action: "updateMapping",
    mapping: {
      ...withDerived.states.asIs.mapping,
      "Annual Rate": { column: "loaded_cost", confidence: 1, isManual: true },
    },
  });

  assert.equal(remapped.baselineHeaders.includes("loaded_cost"), false);
  assert.equal(remapped.states.asIs.headers.includes("loaded_cost"), true);
  assert.equal(remapped.states.asIs.mapping["Annual Rate"].column, "loaded_cost");
  assert.equal(remapped.states.baseline.mapping["Annual Rate"].column, null);

  const headerGroups = stateHeadersForMapping(remapped, "asIs");
  assert.deepEqual(headerGroups.derived, ["loaded_cost"]);
});

test("restoreOrgDataset rebuilds dashboard state from serializable rows and mappings", () => {
  const dataset = createOrgDataset({ rows, headers: Object.keys(rows[0]), mapping });
  const serialized = JSON.parse(JSON.stringify(dataset));
  delete serialized.states.asIs.data;

  const restored = restoreOrgDataset(serialized);

  assert.equal(restored?.states.asIs.data.vertices.E2.display_name, "Ben");
  assert.equal(restored?.states.asIs.data.edges.length, 1);
});
