import assert from "node:assert/strict";
import test from "node:test";
import type { DashboardData } from "../src/lib/types";
import type { ColumnMapping } from "../src/lib/fieldDictionary";
import {
  addPositionRow,
  deletePositionRowsWithReassignment,
  editPositionRow,
  getTopLevelTransferIds,
  transferPositionRows,
  validateTransferTarget,
  type HierarchyPositionPayload,
} from "../src/lib/hierarchyRows";

const mapping: ColumnMapping = {
  "Employee ID": { column: "employee_id", confidence: 1, isManual: true },
  "Manager ID": { column: "manager_id", confidence: 1, isManual: true },
  "Full Name": { column: "name", confidence: 1, isManual: true },
  "Business Title": { column: "title", confidence: 1, isManual: true },
  "Department Name": { column: "department", confidence: 1, isManual: true },
  "Division": { column: null, confidence: 0, isManual: false },
  "Sub-Division": { column: null, confidence: 0, isManual: false },
  "Location": { column: "location", confidence: 1, isManual: true },
  "Country": { column: null, confidence: 0, isManual: false },
  "Region": { column: null, confidence: 0, isManual: false },
  "Job Family": { column: null, confidence: 0, isManual: false },
  "Job Sub Family": { column: null, confidence: 0, isManual: false },
  "Compensation Grade": { column: "grade", confidence: 1, isManual: true },
  "Management Level": { column: null, confidence: 0, isManual: false },
  "Worker Type": { column: null, confidence: 0, isManual: false },
  "FTE": { column: null, confidence: 0, isManual: false },
  "Annual Compensation": { column: null, confidence: 0, isManual: false },
  "Annual Rate": { column: null, confidence: 0, isManual: false },
  "Position Status": { column: "status", confidence: 1, isManual: true },
  "Squad": { column: "squad", confidence: 1, isManual: true },
  "Days Open": { column: null, confidence: 0, isManual: false },
};

const baseRows = [
  { employee_id: "E-1", manager_id: "", name: "Sarah Chen", title: "CEO", department: "Executive", grade: "M6", location: "US", status: "Filled", squad: "Exec" },
  { employee_id: "E-2", manager_id: "E-1", name: "James Park", title: "VP Engineering", department: "Engineering", grade: "M5", location: "US", status: "Filled", squad: "Platform" },
  { employee_id: "E-3", manager_id: "E-2", name: "Priya Rao", title: "Director Infrastructure", department: "Engineering", grade: "M4", location: "IN", status: "Filled", squad: "Infra" },
  { employee_id: "E-4", manager_id: "E-2", name: "Sam Lee", title: "Director Apps", department: "Engineering", grade: "M4", location: "UK", status: "Filled", squad: "Apps" },
];

const newPosition: HierarchyPositionPayload = {
  employeeId: "E-5",
  managerId: "E-2",
  name: "Mina Patel",
  role: "Engineering Manager",
  department: "Engineering",
  grade: "M3",
  location: "IN",
  country: "",
  region: "",
  status: "Filled",
  extraFields: { Squad: "Infra" },
};

const data: DashboardData = {
  vertices: {
    ceo: { display_name: "Sarah Chen", role: "CEO", id: "E-1", grade: "M6", dept: "Executive", unnamed: false, open_role: false, geo: "US" },
    vp: { display_name: "James Park", role: "VP Engineering", id: "E-2", grade: "M5", dept: "Engineering", unnamed: false, open_role: false, geo: "US" },
    infra: { display_name: "Priya Rao", role: "Director Infrastructure", id: "E-3", grade: "M4", dept: "Engineering", unnamed: false, open_role: false, geo: "IN" },
    apps: { display_name: "Sam Lee", role: "Director Apps", id: "E-4", grade: "M4", dept: "Engineering", unnamed: false, open_role: false, geo: "UK" },
  },
  edges: [
    { employee_temp_id: "vp", manager_temp_id: "ceo", edge_confidence: 1 },
    { employee_temp_id: "infra", manager_temp_id: "vp", edge_confidence: 1 },
    { employee_temp_id: "apps", manager_temp_id: "vp", edge_confidence: 1 },
  ],
  metrics: {
    basic: { total_nodes: 4, total_edges: 3, root_count: 1, roots: ["ceo"] },
    span: { ceo: 1, vp: 2, infra: 0, apps: 0 },
    depth: { ceo: 0, vp: 1, infra: 2, apps: 2 },
    subtree_count: { ceo: 3, vp: 2, infra: 0, apps: 0 },
    children: { ceo: ["vp"], vp: ["infra", "apps"] },
    parent: { vp: "ceo", infra: "vp", apps: "vp" },
    org_structure: { org_depth: 3, width_per_level: { "0": 1, "1": 1, "2": 2 }, layer_efficiency_score: 0, diameter: 0 },
    management: { manager_count: 2, avg_span: 1.5, span_variance: 0, span_gini: 0, span_overload_index: 0, overload_threshold: 0, overloaded: 0 },
    avg_confidence: 1,
  },
  warnings: [],
};

test("addPositionRow appends a mapped employee row without mutating source rows", () => {
  const nextRows = addPositionRow(baseRows, mapping, newPosition);

  assert.equal(baseRows.length, 4);
  assert.equal(nextRows.length, 5);
  assert.deepEqual(nextRows[4], {
    employee_id: "E-5",
    manager_id: "E-2",
    name: "Mina Patel",
    title: "Engineering Manager",
    department: "Engineering",
    grade: "M3",
    location: "IN",
    status: "Filled",
    squad: "Infra",
  });
});

test("editPositionRow updates mapped fields for one existing employee row", () => {
  const nextRows = editPositionRow(baseRows, mapping, "E-3", {
    ...newPosition,
    employeeId: "E-3",
    managerId: "E-2",
    name: "Priya Rao",
    role: "Senior Director Infrastructure",
    department: "Platform",
    grade: "M5",
    location: "SG",
    status: "Filled",
    extraFields: { Squad: "Core Infra" },
  });

  assert.equal(baseRows[2].title, "Director Infrastructure");
  assert.equal(nextRows[2].title, "Senior Director Infrastructure");
  assert.equal(nextRows[2].department, "Platform");
  assert.equal(nextRows[2].squad, "Core Infra");
});

test("transferPositionRows updates manager ID for every top-level selected source only", () => {
  const topLevel = getTopLevelTransferIds(data, ["vp", "infra", "apps"]);
  const nextRows = transferPositionRows(baseRows, mapping, data, topLevel, "ceo");

  assert.deepEqual(topLevel, ["vp"]);
  assert.equal(nextRows.find((r) => r.employee_id === "E-2")?.manager_id, "E-1");
  assert.equal(nextRows.find((r) => r.employee_id === "E-3")?.manager_id, "E-2");
  assert.equal(nextRows.find((r) => r.employee_id === "E-4")?.manager_id, "E-2");
});

test("validateTransferTarget blocks a target manager inside a selected subtree", () => {
  assert.deepEqual(validateTransferTarget(data, ["vp"], "infra"), {
    ok: false,
    reason: "Target manager is inside a selected subtree.",
  });
  assert.deepEqual(validateTransferTarget(data, ["infra"], "apps"), { ok: true });
});

test("deletePositionRowsWithReassignment removes the employee row and keeps reassigned reports visible in table rows", () => {
  const nextRows = deletePositionRowsWithReassignment(baseRows, mapping, "E-2", ["E-3", "E-4"], "E-1");

  assert.equal(nextRows.some((row) => row.employee_id === "E-2"), false);
  assert.equal(nextRows.find((row) => row.employee_id === "E-3")?.manager_id, "E-1");
  assert.equal(nextRows.find((row) => row.employee_id === "E-4")?.manager_id, "E-1");
  assert.equal(baseRows.find((row) => row.employee_id === "E-3")?.manager_id, "E-2");
});

test("row helpers return independent arrays so state slices can stay isolated", () => {
  const asIsRows = addPositionRow(baseRows, mapping, newPosition);
  const toBeRows = transferPositionRows(baseRows, mapping, data, ["infra"], "apps");

  assert.equal(asIsRows.find((r) => r.employee_id === "E-5")?.manager_id, "E-2");
  assert.equal(toBeRows.find((r) => r.employee_id === "E-5"), undefined);
  assert.equal(baseRows.find((r) => r.employee_id === "E-3")?.manager_id, "E-2");
});
