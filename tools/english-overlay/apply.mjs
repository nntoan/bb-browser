#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const rulesPath = join(repoRoot, "tools/english-overlay/rules.json");
const rules = JSON.parse(readFileSync(rulesPath, "utf8"));

let touched = 0;
for (const fileRule of rules.files) {
  const filePath = join(repoRoot, fileRule.path);
  let content = readFileSync(filePath, "utf8");
  const original = content;

  for (const [from, to] of fileRule.replacements) {
    content = content.replaceAll(from, to);
  }

  if (content !== original) {
    writeFileSync(filePath, content, "utf8");
    touched++;
    console.log(`[overlay] updated ${fileRule.path}`);
  }
}

if (touched === 0) {
  console.log("[overlay] no changes needed");
} else {
  console.log(`[overlay] done, updated ${touched} file(s)`);
}
