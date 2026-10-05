import { rm, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const [mode] = process.argv.slice(2);

if (mode === "on") {
  try {
    await writeFile(path.join(ROOT, "auto-share.txt"), "on\n", { flag: "wx" });
    console.log("sharing flag written (auto-share.txt)");
  } catch {
    console.log("sharing flag already present (auto-share.txt)");
  }
  try {
    await rm(path.join(ROOT, "no-auto-share.txt"), { force: true });
  } catch { /* already absent */ }
  console.log("sharing is ON — the next server start attaches this machine by itself");
} else if (mode === "off") {
  await writeFile(
    path.join(ROOT, "no-auto-share.txt"),
    "# Sharing turned off on this machine (`npm run share-off`).\n# This file wins over auto-share.txt and is never overwritten by a zip.\n# Delete it (or run `npm run share-on`) to share again.\n"
  );
  console.log("sharing is OFF on this machine — the server runs local-only from here on");
} else {
  console.error("usage: npm run share-on | npm run share-off");
  process.exitCode = 1;
}
