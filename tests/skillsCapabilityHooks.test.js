const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("SkillsCapabilityView declares memo hooks before empty-state returns", () => {
  const source = fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "src",
      "components",
      "dashboard",
      "SkillsCapabilityView.tsx",
    ),
    "utf8",
  );

  const firstEmptyStateReturn = source.indexOf(
    "Unable to load Skills & Capability data",
  );
  const filteredRolesHook = source.indexOf("const filteredRoles = useMemo");
  const filteredActivitiesHook = source.indexOf(
    "const filteredActivities = useMemo",
  );
  const filteredSkillsHook = source.indexOf("const filteredSkills = useMemo");

  assert.ok(filteredRolesHook !== -1, "filtered roles hook should exist");
  assert.ok(
    filteredActivitiesHook !== -1,
    "filtered activities hook should exist",
  );
  assert.ok(filteredSkillsHook !== -1, "filtered skills hook should exist");
  assert.ok(
    filteredRolesHook < firstEmptyStateReturn,
    "filtered roles hook must run before portfolio empty-state return",
  );
  assert.ok(
    filteredActivitiesHook < firstEmptyStateReturn,
    "filtered activities hook must run before portfolio empty-state return",
  );
  assert.ok(
    filteredSkillsHook < firstEmptyStateReturn,
    "filtered skills hook must run before portfolio empty-state return",
  );
});

test("SkillsCapabilityView uses a component CSS module instead of Tailwind-only classes", () => {
  const source = fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "src",
      "components",
      "dashboard",
      "SkillsCapabilityView.tsx",
    ),
    "utf8",
  );

  assert.match(
    source,
    /import styles from "\.\/SkillsCapabilityView\.module\.css"/,
    "SkillsCapabilityView should import its CSS module",
  );
  assert.doesNotMatch(
    source,
    /className="(?:[^"]*\s)?(?:bg-white|p-6|rounded-lg|shadow|text-gray-500|grid-cols-)/,
    "SkillsCapabilityView should not rely on Tailwind utility classes",
  );
});

test("SkillsCapabilityView can build portfolio without a finalized column mapping", () => {
  const source = fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "src",
      "components",
      "dashboard",
      "SkillsCapabilityView.tsx",
    ),
    "utf8",
  );

  assert.doesNotMatch(
    source,
    /if \(!dataset \|\| !columnMapping\) return null/,
    "helper accepts null columnMapping, so the UI should not block rendering",
  );
});

test("Role Readiness uses stable composite row keys and limits initial rendering", () => {
  const source = fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "src",
      "components",
      "dashboard",
      "SkillsCapabilityView.tsx",
    ),
    "utf8",
  );

  assert.match(
    source,
    /const ROLE_READINESS_TABLE_LIMIT = \d+/,
    "Role Readiness should have a visible render cap",
  );
  assert.match(
    source,
    /function roleReadinessRowKey\(role: SkillsCapabilityRoleMetric\)/,
    "Role rows need a composite key helper",
  );
  assert.doesNotMatch(
    source,
    /key=\{role\.employeeId\}/,
    "employeeId alone is not unique across role-readiness rows",
  );
  assert.match(
    source,
    /roles\.slice\(0, ROLE_READINESS_TABLE_LIMIT\)/,
    "Role Readiness should render an initial page instead of the full table",
  );
});
