import assert from "node:assert/strict";
import test from "node:test";
import type { DashboardData } from "../src/lib/types";
import { getPositionPath, searchHierarchyPositions } from "../src/components/dashboard/hierarchySearch";

const data: DashboardData = {
  vertices: {
    ceo: {
      display_name: "Sarah Chen",
      role: "CEO",
      id: "E-001",
      grade: "M6",
      dept: "Executive",
      unnamed: false,
      open_role: false,
      geo: "US",
    },
    eng: {
      display_name: "James Park",
      role: "VP Engineering",
      id: "E-010",
      grade: "M5",
      dept: "Engineering",
      unnamed: false,
      open_role: false,
      geo: "US",
    },
    infra: {
      display_name: "Sam Lee",
      role: "Director Infrastructure",
      id: "E-020",
      grade: "M4",
      dept: "Engineering",
      unnamed: false,
      open_role: false,
      geo: "IN",
    },
    apps: {
      display_name: "Sam Lee",
      role: "Director Applications",
      id: "E-021",
      grade: "M4",
      dept: "Engineering",
      unnamed: false,
      open_role: false,
      geo: "UK",
    },
    open_sales: {
      display_name: "Open Role",
      role: "VP Sales",
      id: "JOB-9",
      grade: "M5",
      dept: "Sales",
      unnamed: true,
      open_role: true,
      geo: null,
    },
    stray: {
      display_name: "Priya Rao",
      role: "Finance Lead",
      id: "E-030",
      grade: "IC4",
      dept: "Finance",
      unnamed: false,
      open_role: false,
      geo: "IN",
    },
  },
  edges: [
    { employee_temp_id: "eng", manager_temp_id: "ceo", edge_confidence: 1 },
    { employee_temp_id: "infra", manager_temp_id: "eng", edge_confidence: 1 },
    { employee_temp_id: "apps", manager_temp_id: "eng", edge_confidence: 1 },
    { employee_temp_id: "open_sales", manager_temp_id: "ceo", edge_confidence: 1 },
  ],
  metrics: {
    basic: { total_nodes: 6, total_edges: 4, root_count: 1, roots: ["ceo"] },
    span: { ceo: 2, eng: 2, infra: 0, apps: 0, open_sales: 0, stray: 0 },
    depth: { ceo: 0, eng: 1, infra: 2, apps: 2, open_sales: 1 },
    subtree_count: { ceo: 4, eng: 2, infra: 0, apps: 0, open_sales: 0, stray: 0 },
    children: { ceo: ["eng", "open_sales"], eng: ["infra", "apps"] },
    parent: { eng: "ceo", infra: "eng", apps: "eng", open_sales: "ceo" },
    org_structure: {
      org_depth: 3,
      width_per_level: { "0": 1, "1": 2, "2": 2 },
      layer_efficiency_score: 0,
      diameter: 0,
    },
    management: {
      manager_count: 2,
      avg_span: 2,
      span_variance: 0,
      span_gini: 0,
      span_overload_index: 0,
      overload_threshold: 0,
      overloaded: 0,
    },
    avg_confidence: 1,
  },
  warnings: [],
};

test("searchHierarchyPositions returns separate contextual results for duplicate matches", () => {
  const results = searchHierarchyPositions(data, "sam");

  assert.equal(results.length, 2);
  assert.deepEqual(results.map((r) => r.id).sort(), ["apps", "infra"]);
  assert.ok(results.every((r) => r.managerName === "James Park"));
  assert.ok(results.some((r) => r.context.includes("UK")));
  assert.ok(results.some((r) => r.context.includes("IN")));
});

test("searchHierarchyPositions searches role, department, grade, geo, and id", () => {
  assert.deepEqual(searchHierarchyPositions(data, "JOB-9").map((r) => r.id), ["open_sales"]);
  assert.deepEqual(searchHierarchyPositions(data, "sales").map((r) => r.id), ["open_sales"]);
  assert.deepEqual(searchHierarchyPositions(data, "IC4").map((r) => r.id), ["stray"]);
  assert.equal(searchHierarchyPositions(data, "IN").length, 2);
});

test("getPositionPath returns available paths and handles unassigned positions", () => {
  assert.deepEqual(getPositionPath(data, "infra"), ["ceo", "eng", "infra"]);
  assert.deepEqual(getPositionPath(data, "infra", "eng"), ["eng", "infra"]);
  assert.deepEqual(getPositionPath(data, "stray"), ["stray"]);
});
