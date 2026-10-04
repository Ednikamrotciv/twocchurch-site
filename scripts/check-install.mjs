import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const vitePkg = path.join(root, "node_modules", "vite", "package.json");
if (existsSync(vitePkg)) process.exit(0);

let pkg = null;
try {
  pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
} catch {
  pkg = null;
}
if (!pkg || pkg.name !== "world-overcomers-website") {
  console.error("This folder is not the website project. Extract the zip into an empty folder and run the commands there.");
  process.exit(1);
}

const onDeployHost =
  !!process.env.CI && process.env.CI !== "false";

if (onDeployHost) {
  console.error("Dependencies are missing (node_modules/vite not found). The host skipped or pruned them before the build.");
  console.error("Fix: set the host's install command to `npm install` (or `npm ci` with a committed lockfile) and build command to `npm run build`, then redeploy. Do not set NODE_ENV to prune dev dependencies on the install step.");
  process.exit(1);
}

console.error("Dev tools are missing. Run `npm install` here first, then retry.");
process.exit(1);
