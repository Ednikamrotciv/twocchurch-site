import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function cleanUrl(value) {
  return String(value == null ? "" : value).trim().replace(/\/+$/, "");
}

function checkUrl(url) {
  if (!url) return "empty — nothing written";
  if (!/^https?:\/\/[^\s/\\]+$/i.test(url)) {
    return `not an origin (want just https://your-tunnel-address, nothing after it) — got: ${url}`;
  }
  if (/^http:\/\//i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(url)) {
    return `not https (browsers only send the admin password over https) — got: ${url}`;
  }
  return "";
}

export { cleanUrl, checkUrl };

const CLI = typeof process !== "undefined" && process.argv && process.argv[1] && process.argv[1].endsWith("set-server.mjs");
if (CLI) {
  const ROOT = process.cwd();
  const arg = cleanUrl(process.argv[2] || "");
  const problem = checkUrl(arg);
  if (problem) {
    console.error(`set-server: ${problem}`);
    console.error("usage: npm run set-server https://your-tunnel-address");
    process.exitCode = 1;
  } else {
    const target = path.join(ROOT, "cms-server.txt");
    const prev = await readFile(target, "utf8").catch(() => "");
    const keep = prev.split(/\r?\n/).filter((l) => l.trim().startsWith("#"));
    await writeFile(target, (keep.length ? keep.join("\n") + "\n" : "") + arg + "\n");
    console.log(`set-server: office server is now ${arg} (commit cms-server.txt and push)`);
  }
}
