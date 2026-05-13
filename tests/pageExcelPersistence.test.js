const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("uploaded org datasets are not serialized into browser storage", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "src", "app", "page.tsx"),
    "utf8"
  );

  assert.doesNotMatch(source, /localStorage\.setItem\([^)]*ORG_DATASET_STORAGE_KEY/);
  assert.doesNotMatch(source, /localStorage\.getItem\([^)]*ORG_DATASET_STORAGE_KEY/);
  assert.doesNotMatch(source, /JSON\.stringify\(dataset\)/);
  assert.match(source, /localStorage\.removeItem\(ORG_DATASET_STORAGE_KEY\)/);
});
