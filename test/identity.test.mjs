// Sanity tests for the {{cwd}} fix (#114 / #126 / #136).
// Runs the plugin's own rewritePromptAssembly against the exact shapes the
// 0.2.1 host produces, then replays the host's interpolation rule:
// every `{{name}}` must be a registered variable, otherwise the turn dies.
import assert from "node:assert/strict";
import { rewritePromptAssembly } from "../build/lib/identity.js";

const OFFICIAL =
  "You are a coding agent powered by the {{model}} model, running on the DeepSeek Harness. " +
  "Your working directory is {{cwd}}.";

function assembled(variables) {
  return {
    sections: [
      { name: "harness:identity", text: "You are a DeepSeek AI assistant." },
      { name: "deployment:persona-prefix", text: OFFICIAL },
      { name: "deployment:persona-suffix", text: OFFICIAL },
    ],
    contexts: [],
    tools: [],
    ...(variables === undefined ? {} : { variables }),
  };
}

// Mirrors @deepseek-ai/dsh-system-prompt interpolate(): unknown name => throw.
function renderSections(sections, variables) {
  const out = [];
  for (const section of sections) {
    if (section.interpolate === false) { out.push(section.text); continue; }
    out.push(String(section.text).replace(/\{\{([a-zA-Z0-9_.-]+)\}\}/g, (_m, name) => {
      if (!variables || !Object.hasOwn(variables, name)) {
        throw new Error(`unknown prompt variable "{{${name}}}" in section "${section.name}"`);
      }
      return String(variables[name]);
    }));
  }
  return out.join("\n\n");
}

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}\n  ${error.message}`);
    process.exitCode = 1;
  }
}

// 0.2.1-rc.2: provider/model only -> must not emit {{cwd}} at all.
check("0.2.1 variables(provider,model) renders without unknown variable", () => {
  const vars = { provider: "deepseek", model: "deepseek-v4.1" };
  const out = rewritePromptAssembly(assembled(vars), "INJECT BODY");
  const joined = out.sections.map((s) => s.text).join("\n");
  assert.equal(/\{\{\s*cwd\s*\}\}/.test(joined), false, "output still contains {{cwd}}");
  assert.doesNotThrow(() => renderSections(out.sections, vars));
  assert.match(joined, /working directory is the current workspace/i);
});

// A host that does register cwd keeps the real variable.
check("host with cwd variable keeps {{cwd}}", () => {
  const vars = { provider: "deepseek", model: "m", cwd: "/Users/yuqma/work" };
  const out = rewritePromptAssembly(assembled(vars), "INJECT BODY");
  const joined = out.sections.map((s) => s.text).join("\n");
  assert.match(joined, /\{\{\s*cwd\s*\}\}/, "cwd variable was stripped too aggressively");
  assert.doesNotThrow(() => renderSections(out.sections, vars));
});

// Legacy hosts expose no variables object at all: keep the old behaviour.
check("host without a variables object defaults to static (no crash)", () => {
  const out = rewritePromptAssembly(assembled(undefined), "INJECT BODY");
  const joined = out.sections.map((s) => s.text).join("\n");
  assert.equal(/\{\{\s*cwd\s*\}\}/.test(joined), false);
});

check("DSH_PURGE_CWD=variable forces the real variable back", () => {
  process.env.DSH_PURGE_CWD = "variable";
  try {
    const out = rewritePromptAssembly(assembled(undefined), "INJECT BODY");
    const joined = out.sections.map((s) => s.text).join("\n");
    assert.match(joined, /\{\{\s*cwd\s*\}\}/);
  } finally {
    delete process.env.DSH_PURGE_CWD;
  }
});

// A user inject that happens to contain {{cwd}} must also be neutralised.
check("inject text containing {{cwd}} survives 0.2.1", () => {
  const vars = { provider: "deepseek", model: "m" };
  const out = rewritePromptAssembly(assembled(vars), "Use {{cwd}} as your root.");
  assert.doesNotThrow(() => renderSections(out.sections, vars));
});

console.log(`\n${passed} checks passed`);
