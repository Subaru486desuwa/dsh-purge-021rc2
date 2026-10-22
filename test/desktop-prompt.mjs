// Replay the installed host renderer without loading a daemon or making API calls.
// PURGE_HOST points to a read-only @deepseek-ai runtime snapshot, not a DSH home.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { rewritePromptAssembly } from "../lib/identity.js";

assert.ok(process.env.PURGE_HOST, "Set PURGE_HOST to the installed @deepseek-ai directory");
const source = fs.readFileSync(path.join(process.env.PURGE_HOST, "dsh-system-prompt/lib/index.js"), "utf8");
const start = source.indexOf("//#region lib/types/index.js");
const end = source.indexOf("/** All prompt registrations owned");
assert.ok(start >= 0 && end > start, "Expected the 0.2.1-rc.2 renderer layout");
const renderer = vm.createContext({});
vm.runInContext(source.slice(start, end), renderer);
const assembly = {
  sections:[{ name:"deployment:persona-suffix", text:"Your working directory is {{cwd}}." }],
  variables:{ provider:"diagnostic-provider", model:"diagnostic-model" },
  contexts:[{ name:"working-directory:current", text:"Working directory: /diagnostic/workspace", interpolate:false }],
  tools:[]
};
assert.throws(() => renderer.renderPrompt(assembly), /unknown prompt variable.*cwd/);
const before = structuredClone(assembly);
const repaired = rewritePromptAssembly(assembly, "Keep {{cwd}} literally in this example.");
assert.doesNotThrow(() => renderer.renderPrompt(repaired));
assert.match(renderer.renderPrompt(repaired), /Keep \{\{cwd\}\} literally/);
assert.deepEqual(repaired.contexts, before.contexts);
assert.equal(renderer.renderContextSnapshot(repaired), renderer.renderContextSnapshot(before));
assert.deepEqual(assembly, before, "rewrite mutated the host assembly");
console.log("Installed renderer: original suffix RED; repaired assembly GREEN; literal inject and runtime cwd preserved; no API calls.");
