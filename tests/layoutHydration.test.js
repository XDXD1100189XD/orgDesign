const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("root body tolerates extension-injected hydration attributes", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "src", "app", "layout.tsx"),
    "utf8"
  );

  assert.match(source, /<body\s+suppressHydrationWarning/);
  assert.match(source, /bis_skin_checked/);
  assert.match(source, /bis_register/);
  assert.match(source, /MutationObserver/);
  assert.match(source, /removeAttribute\(attribute\.name\)/);
});
