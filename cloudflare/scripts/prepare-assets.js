#!/usr/bin/env node
/**
 * Copy HelixBench static frontend into cloudflare/public for Worker Assets.
 * Node-based so Windows (CRLF / non-bash shells) can run `npm run deploy`.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cloudflareRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(cloudflareRoot, "..");
const dest = path.join(cloudflareRoot, "public");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dst) {
  ensureDir(path.dirname(dst));
  fs.copyFileSync(src, dst);
}

function copyJsDir(srcDir, dstDir) {
  ensureDir(dstDir);
  for (const name of fs.readdirSync(srcDir)) {
    if (!name.endsWith(".js")) continue;
    copyFile(path.join(srcDir, name), path.join(dstDir, name));
  }
}

function runPython(cmd) {
  const code = `
from pathlib import Path
import json
try:
    from server.micro_topics import MICRO_TOPICS
except Exception as exc:
    print("skip topics refresh:", exc)
    raise SystemExit(0)
out = Path("cloudflare/src/topics-data.json")
catalog = []
for t in MICRO_TOPICS:
    catalog.append({
        "id": t["id"],
        "name": t["name"],
        "category": t["category"],
        "blurb": t["blurb"],
        "tags": t["tags"],
        "lesson": t["lesson"],
        "code_examples": t.get("code_examples", []),
        "quiz_focus": t["quiz_focus"],
    })
out.write_text(json.dumps({"topics": catalog}, indent=2) + "\\n", encoding="utf-8")
print(f"refreshed {out} ({len(catalog)} topics)")
`;
  return spawnSync(cmd, ["-c", code], { cwd: repoRoot, encoding: "utf8" });
}

fs.rmSync(dest, { recursive: true, force: true });
ensureDir(path.join(dest, "css"));
ensureDir(path.join(dest, "js"));

copyFile(path.join(repoRoot, "index.html"), path.join(dest, "index.html"));
copyFile(path.join(repoRoot, "css", "styles.css"), path.join(dest, "css", "styles.css"));
copyJsDir(path.join(repoRoot, "js"), path.join(dest, "js"));

const candidates = process.platform === "win32" ? ["py", "python", "python3"] : ["python3", "python"];
let refreshed = false;
for (const cmd of candidates) {
  const result = runPython(cmd);
  if (result.error) continue;
  if (result.status === 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    refreshed = true;
    break;
  }
  if (result.stderr) console.warn(result.stderr.trim());
}
if (!refreshed) {
  console.warn("Python not available; keeping existing topics-data.json");
}

const headers = `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin

/css/*
  Cache-Control: public, max-age=86400

/js/*
  Cache-Control: public, max-age=86400

/index.html
  Cache-Control: public, max-age=300
`;
fs.writeFileSync(path.join(dest, "_headers"), headers, "utf8");

console.log("Prepared", dest);
console.log(
  "files:",
  fs.readdirSync(dest).join(", "),
  "| js:",
  fs.readdirSync(path.join(dest, "js")).join(", ")
);
