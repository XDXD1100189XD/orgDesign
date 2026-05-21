const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const repoRoot = path.resolve(__dirname, "..");

require.extensions[".ts"] = function compileTs(module, filename) {
  const source = readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
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
  NAVIGATION_LOADING_DURATION_MS,
  getNavigationLoadingMessage,
} = require("../src/lib/navigationLoading.ts");

test("navigation loading helper gives explicit content-loading copy", () => {
  assert.equal(NAVIGATION_LOADING_DURATION_MS, 900);
  assert.equal(
    getNavigationLoadingMessage("workforce-intelligence", "talent-mapping"),
    "Talent Mapping content is still loading.",
  );
  assert.equal(
    getNavigationLoadingMessage("workforce-intelligence", "activity-analysis"),
    "Activity Analysis content is still loading.",
  );
  assert.equal(
    getNavigationLoadingMessage("studio", "activity-analysis"),
    "Analytics Studio content is still loading.",
  );
});

test("save snapshot does not ask for passphrase confirmation", () => {
  const source = readFileSync(
    path.join(__dirname, "..", "src", "app", "page.tsx"),
    "utf8",
  );

  assert.match(source, /Enter a passphrase for this encrypted snapshot\./);
  assert.doesNotMatch(source, /Re-enter the passphrase to confirm/);
  assert.doesNotMatch(source, /Passphrases did not match/);
});
