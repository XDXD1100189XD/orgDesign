const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

test("AI comp-band tool defaults to both states and uses explicit comp mutation callback", () => {
  const assistant = fs.readFileSync("src/components/dashboard/AIAssistantView.tsx", "utf8");
  const route = fs.readFileSync("src/app/api/ai/chat/route.ts", "utf8");

  assert.match(route, /target:\s*\{\s*type:\s*'string',\s*enum:\s*\['as-is',\s*'to-be',\s*'both'\]/);
  assert.match(route, /Defaults to "both"/);
  assert.match(assistant, /onCompMatrixChange\?:\s*\(\s*matrix:.*target: 'as-is' \| 'to-be' \| 'both'/s);
  assert.match(assistant, /const target\s*=\s*\(toolInput\.target as 'as-is' \| 'to-be' \| 'both' \| undefined\) \?\? 'both';/);
  assert.match(assistant, /onCompMatrixChangeRef\.current\(newMatrix,\s*target,/);
});

test("manual Comp Setup target selector hides Both while preserving internal support", () => {
  const page = fs.readFileSync("src/app/page.tsx", "utf8");
  const compStart = page.indexOf("06 Comp Setup");
  const readinessStart = page.indexOf("07 Data Readiness");
  const compSection = page.slice(compStart, readinessStart);

  assert.ok(compStart >= 0, "Comp Setup section should exist");
  assert.ok(readinessStart > compStart, "Data Readiness should follow Comp Setup");
  assert.match(page, /type CompTarget = StateSlice \| "both";/);
  assert.match(page, /target: effectiveTarget === "both" \? "both" : toOrgState\(effectiveTarget\)/);
  assert.doesNotMatch(compSection, /setCompTarget\("both"\)/);
  assert.doesNotMatch(compSection, />\s*Both\s*</);
});
