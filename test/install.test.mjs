import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync, execFileSync } from "node:child_process";
import { test } from "node:test";

const installer = new URL("../scripts/install.sh", import.meta.url).pathname;
const version = "1.0.0-test";
function fixture(t, { invalid = false, checksum = true, desktop = false, wrongName = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "purge-install-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, "user");
  const dshHome = desktop ? path.join(home, "Library/Application Support/dsh-desktop/harness") : path.join(root, "custom DSH home");
  const target = path.join(dshHome, "profiles/web/node_modules/dsh-purge");
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, "old.txt"), "original plugin");
  fs.mkdirSync(path.join(dshHome, "dsh-purge"));
  fs.writeFileSync(path.join(dshHome, "dsh-purge/applied.json"), '{"version":"old"}\n');
  fs.writeFileSync(path.join(dshHome, "dsh-purge/installed-rev"), "apply:old\n");
  fs.writeFileSync(path.join(dshHome, "prompt-inject.md"), "user prompt\n");
  const packageDir = path.join(root, "package");
  fs.mkdirSync(path.join(packageDir, "lib"), { recursive: true });
  fs.writeFileSync(path.join(packageDir, "package.json"), JSON.stringify({ name:wrongName ? "other" : "dsh-purge", version, main:"lib/index.js" }));
  fs.writeFileSync(path.join(packageDir, "lib/index.js"), "export const name = 'dsh-purge';\n");
  const tarball = path.join(root, `dsh-purge-${version}.tgz`);
  if (invalid) fs.writeFileSync(tarball, "not an archive");
  else execFileSync("tar", ["czf", tarball, "-C", root, "package"]);
  const digest = checksum ? createHash("sha256").update(fs.readFileSync(tarball)).digest("hex") : "0".repeat(64);
  fs.writeFileSync(path.join(root, "SHA256SUMS.txt"), `${digest}  dsh-purge-${version}.tgz\n`);
  const bin = path.join(root, "bin"); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "curl"), '#!/bin/sh\nfor arg do case "$arg" in https://*) url="$arg";; esac; done\nwhile [ "$#" -gt 0 ]; do if [ "$1" = -o ]; then shift; dest="$1"; fi; shift; done\ncp "$FIXTURE/${url##*/}" "$dest"\n', { mode:0o755 });
  function run(explicit = true) {
    const env = { ...process.env, HOME:home, FIXTURE:root, PURGE_VERSION:version, PATH:`${bin}:${process.env.PATH}` };
    delete env.DSH_HOME;
    if (explicit) env.DSH_HOME = dshHome;
    return spawnSync("sh", [installer], { env, encoding:"utf8" });
  }
  return { root, home, dshHome, target, run };
}

test("custom DSH_HOME install preserves real apply state and user data", (t) => {
  const f = fixture(t); const r = f.run();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.target, "package.json"))).version, version);
  assert.equal(fs.readFileSync(path.join(f.dshHome, "dsh-purge/applied.json"), "utf8"), '{"version":"old"}\n');
  assert.equal(fs.readFileSync(path.join(f.dshHome, "dsh-purge/installed-rev"), "utf8"), "apply:old\n");
  assert.equal(fs.readFileSync(path.join(f.dshHome, "prompt-inject.md"), "utf8"), "user prompt\n");
  assert.equal(fs.existsSync(path.join(f.home, ".dsh")), false);
  const backup = fs.readdirSync(path.dirname(f.target)).find(n => n.startsWith("dsh-purge.") && n.endsWith(".bak"));
  assert.ok(backup); assert.equal(fs.readFileSync(path.join(path.dirname(f.target), backup, "old.txt"), "utf8"), "original plugin");
});
for (const [name, options] of [["bad archive", { invalid:true }], ["checksum mismatch", { checksum:false }], ["wrong package", { wrongName:true }]]) {
  test(`${name} leaves the original plugin usable`, (t) => {
    const f = fixture(t, options); const r = f.run();
    assert.notEqual(r.status, 0);
    assert.equal(fs.readFileSync(path.join(f.target, "old.txt"), "utf8"), "original plugin");
  });
}
test("desktop layout is detected only when legacy web home is absent", (t) => {
  const f = fixture(t, { desktop:true }); const r = f.run(false);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.target, "package.json"))).version, version);
});

test("an existing legacy web profile remains the default", (t) => {
  const f = fixture(t, { desktop:true });
  const legacy = path.join(f.home, ".dsh/profiles/web/node_modules/dsh-purge");
  fs.mkdirSync(legacy, { recursive:true });
  fs.writeFileSync(path.join(legacy, "old.txt"), "legacy");
  const r = f.run(false);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(JSON.parse(fs.readFileSync(path.join(legacy, "package.json"))).version, version);
  assert.equal(fs.readFileSync(path.join(f.target, "old.txt"), "utf8"), "original plugin");
});
