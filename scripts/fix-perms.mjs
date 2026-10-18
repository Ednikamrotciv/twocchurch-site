import { chmodSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const targets = ["node_modules/.bin"];
for (const scope of ["@esbuild", "@rollup"]) {
  let names;
  try {
    names = readdirSync(path.join(ROOT, "node_modules", scope));
  } catch {
    continue;
  }
  for (const name of names) {
    targets.push(path.join("node_modules", scope, name, "bin"));
    targets.push(path.join("node_modules", scope, name));
  }
}
for (const t of targets) {
  const dir = path.join(ROOT, t);
  let st;
  try {
    st = statSync(dir);
  } catch {
    continue;
  }
  if (!st.isDirectory()) {
    try {
      chmodSync(dir, 0o755);
    } catch { /* keep going */ }
    continue;
  }
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    continue;
  }
  for (const n of names) {
    try {
      chmodSync(path.join(dir, n), 0o755);
    } catch { /* keep going */ }
  }
}
