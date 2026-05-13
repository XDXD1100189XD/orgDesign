const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("Analytics Studio treats canonical rows as a loaded dataset even without a File object", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "src", "components", "dashboard", "AnalyticsStudioView.tsx"),
    "utf8"
  );

  assert.match(source, /const hasInput = Boolean\(file \|\| propRows\?\.\length\);/);
  assert.doesNotMatch(source, /if\s*\(\s*!file\s*\)\s*{\s*return\s*\(/);
});
