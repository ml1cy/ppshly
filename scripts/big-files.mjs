#!/usr/bin/env node
// Cloudflare will not host a static file over 25 MiB. This script finds those
// files, lists them in .assetsignore so the deploy skips them, and (with
// --upload) copies them to the R2 bucket the Worker reads from.
//
//   node scripts/big-files.mjs            refresh .assetsignore
//   node scripts/big-files.mjs --upload   refresh, then upload to R2
//
// Run it again whenever you add a game with a file over 25 MiB.

import { readdirSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LIMIT = 25 * 1024 * 1024;
const BUCKET = process.env.BUCKET || "ppsholy-big-files";
const SKIP = new Set([".git", "node_modules", ".wrangler"]);
const MARK = "# --- files over 25 MiB (written by scripts/big-files.mjs) ---";

function walk(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, found);
    else if (entry.isFile() && statSync(path).size > LIMIT) found.push(path);
  }
  return found;
}

const files = walk(ROOT).map((p) => relative(ROOT, p).split(sep).join("/")).sort();

// .assetsignore uses .gitignore syntax: anchor with "/" and escape specials.
const escape = (p) => "/" + p.replace(/([\\*?\[\]!# ])/g, "\\$1");
const ignorePath = join(ROOT, ".assetsignore");
const head = readFileSync(ignorePath, "utf8").split(MARK)[0].trimEnd();
writeFileSync(ignorePath, `${head}\n\n${MARK}\n${files.map(escape).join("\n")}\n`);
console.log(`${files.length} files over 25 MiB listed in .assetsignore`);

if (process.argv.includes("--upload")) {
  for (const [n, file] of files.entries()) {
    console.log(`[${n + 1}/${files.length}] ${file}`);
    const run = spawnSync(
      "npx",
      ["wrangler", "r2", "object", "put", `${BUCKET}/${file}`, "--file", join(ROOT, file), "--remote"],
      { stdio: "inherit", shell: process.platform === "win32" }
    );
    if (run.status !== 0) {
      console.error(`Upload failed for ${file}. Fix the error above and run again.`);
      process.exit(1);
    }
  }
  console.log("All large files are in R2.");
}
