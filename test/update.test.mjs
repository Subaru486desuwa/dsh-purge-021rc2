import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import { markCurrent } from "../lib/update.js";

// Exercise the real URL builders used by downloads and profile dependency pins.
const source = fs.readFileSync(new URL("../lib/update.js", import.meta.url), "utf8");
const constants = source.match(/^const (?:REPO|STABLE_REF) = .*;$/gm).join("\n");
const start = source.indexOf("function archiveZipUrl(ref)");
const end = source.indexOf("\n}", source.indexOf("function archiveTarballUrl(ref)")) + 2;
const urls = vm.createContext({});
vm.runInContext(constants + "\n" + source.slice(start, end), urls);
test("default updater download and profile pin target this fork's main branch", () => {
  assert.equal(urls.archiveZipUrl(), "https://codeload.github.com/Subaru486desuwa/dsh-purge-021rc2/zip/refs/heads/main");
  assert.equal(urls.archiveTarballUrl(), "https://codeload.github.com/Subaru486desuwa/dsh-purge-021rc2/tar.gz/refs/heads/main");
});
test("pinned plugin versions stay within the fork", () => {
  assert.equal(urls.archiveTarballUrl("v1.1.72-dsh021rc2.5"), "https://codeload.github.com/Subaru486desuwa/dsh-purge-021rc2/tar.gz/refs/tags/v1.1.72-dsh021rc2.5");
});
test("current-version selection recognizes main rather than the old master branch", () => {
  const rows = markCurrent([
    { ref:"local", version:"1.1.72-dsh021rc2.5", channel:"stable" },
    { ref:"main", version:"1.1.72-dsh021rc2.5", channel:"stable" },
  ], { channel:"stable", pin:"" }, "1.1.72-dsh021rc2.5", "");
  assert.equal(rows.find(r => r.current)?.ref, "main");
});
