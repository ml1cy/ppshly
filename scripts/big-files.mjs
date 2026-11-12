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

// Keys already in the bucket with the same size, so a redeploy does not send
// 800+ MB again. Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the
// environment (set in CI); without them every file is uploaded.
async function existingObjects() {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !account) return null;
  const seen = new Map();
  let cursor = "";
  try {
    do {
      const url = new URL(`https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/${BUCKET}/objects`);
      url.searchParams.set("per_page", "1000");
      if (cursor) url.searchParams.set("cursor", cursor);
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const body = await res.json();
      if (!body.success) throw new Error(JSON.stringify(body.errors));
      for (const o of body.result) seen.set(o.key, o.size);
      cursor = body.result_info?.is_truncated ? body.result_info.cursor : "";
    } while (cursor);
    return seen;
  } catch (err) {
    console.warn(`Could not list the bucket (${err.message}); uploading every large file.`);
    return null;
  }
}

if (process.argv.includes("--upload")) {
  const have = await existingObjects();
  for (const [n, file] of files.entries()) {
    const size = statSync(join(ROOT, file)).size;
    if (have && have.get(file) === size) {
      console.log(`[${n + 1}/${files.length}] ${file} (already in R2)`);
      continue;
    }
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
