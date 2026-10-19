// Patch-level tests for the 0.2.1-rc.2 adaptation.
// 1) #40 must match the 0.2.1 system-prompt shape and stay valid JS.
// 2) #86 must rewrite the queue-steer path to agent.steer (issue #121).
// 3) #119 / #127 static guards.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import * as core from "../build/lib/core.js";

const HOST = "/Users/yuqma/.npm/_npx/1e7f6d9597241db0/node_modules/@deepseek-ai";
const patch = (id) => core.ALL_PATCHES.find((p) => p.id === id);

let passed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}\n  ${error.message}`);
    process.exitCode = 1;
  }
}

function tmpFile(name, text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "purge-test-"));
  const fp = path.join(dir, name);
  fs.writeFileSync(fp, text);
  return fp;
}

function assertParses(text, label) {
  const fp = tmpFile("case.mjs", text);
  execFileSync(process.execPath, ["--check", fp], { stdio: "pipe" });
  if (label) console.log(`  · ${label} parses`);
}

await check("#40 matches 0.2.1 system-prompt and yields valid JS", () => {
  const fp = path.join(HOST, "dsh-system-prompt/lib/index.js");
  // 用官方快照当"改前"样本；没有快照才退回当前文件。
  const pristine = `${fp}.dshpurge.bak`;
  const base = fs.existsSync(pristine) ? pristine : fp;
  const source = fs.readFileSync(base, "utf8");
  const p = patch(40);
  const out = core.applyReplacementsToText(source, p, fp);
  assert.equal(out.changed, true, "patch 40 did not match 0.2.1 host");
  assert.equal(out.text.includes("transformed.sections : [completeSection]"), false);
  assert.match(out.text, /fold-complete inject first/);
  assert.match(out.text, /requiredContexts\.has\(entry\.name\)/);
  assertParses(out.text, "patched system-prompt");

  const again = core.applyReplacementsToText(out.text, p, fp);
  assert.equal(again.changed, false, "patch 40 is not idempotent");
});

await check("#86 rewrites queue steer to agent.steer (#121)", () => {
  const p = patch(86);
  const source = [
    '\t\t\tcase "steer":',
    "\t\t\t\tagent.inbox.remove(request.itemId);",
    "\t\t\t\tagent.followup(message); // [dsh-purge-86] queue steer → next-turn",
    "\t\t\t\tbreak;",
  ].join("\n");
  const out = core.applyReplacementsToText(source, p, "api-session-controller/lib/index.js");
  assert.equal(out.changed, true);
  assert.match(out.text, /agent\.steer\(message\); \/\/ \[dsh-purge-86\] queue steer stays steer/);
  assert.doesNotMatch(out.text, /agent\.followup\(message\)/);
});

await check("#119 no bare atomicCopyFile call remains", () => {
  const text = fs.readFileSync(new URL("../build/lib/desktop.js", import.meta.url), "utf8");
  assert.doesNotMatch(text, /try \{ atomicCopyFile\(/, "missing await on atomicCopyFile");
  assert.match(text, /await atomicCopyFile\(fp, bak\)/);
  assert.match(text, /export async function repairOfficialCliAfterUnpack/);
});

await check("#127 hostFs exposes closeSync", async () => {
  const mod = await import("../build/lib/extract-asar.js");
  assert.equal(typeof mod.hostFs.closeSync, "function", "hostFs.closeSync is not routed");
  assert.equal(typeof mod.hostFs.fsyncSync, "function");
});

await check("redteam preset no longer declares toolFilter", () => {
  const yml = fs.readFileSync(new URL("../build/presets/redteam/agent.cordis.yml", import.meta.url), "utf8");
  assert.doesNotMatch(yml, /toolFilter:/);
  assert.match(yml, /maxDepth: 1/);
});

console.log(`\n${passed} checks passed`);
