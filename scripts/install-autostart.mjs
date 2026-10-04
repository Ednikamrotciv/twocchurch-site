import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd();
const NODE = process.execPath;

function sh(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd: ROOT, timeout: 60000 }, (err, stdout, stderr) => {
      resolve({ code: err ? err.code || 1 : 0, out: String(stdout || ""), err: String(stderr || "") });
    });
  });
}

if (process.platform === "win32") {
  const dir = path.join(os.homedir(), "AppData", "Roaming", "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, "World-Overcomers-Office-Server.cmd");
  await writeFile(file, `@echo off\r\ncd /d "${ROOT}"\r\n"${NODE}" scripts\\expose.mjs\r\n`);
  console.log(`auto-start installed: ${file}`);
  console.log("the office server now starts on its own at every Windows login. To remove it, delete that file.");
} else if (process.platform === "darwin") {
  const dir = path.join(os.homedir(), "Library", "LaunchAgents");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, "com.worldovercomers.expose.plist");
  await writeFile(file, `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n  <key>Label</key><string>com.worldovercomers.expose</string>\n  <key>ProgramArguments</key><array><string>${NODE}</string><string>${path.join(ROOT, "scripts", "expose.mjs")}</string></array>\n  <key>WorkingDirectory</key><string>${ROOT}</string>\n  <key>RunAtLoad</key><true/>\n  <key>KeepAlive</key><true/>\n</dict>\n</plist>\n`);
  const load = await sh("launchctl", ["load", file]);
  console.log(load.code === 0
    ? "auto-start installed and running — the office server now survives reboots on its own."
    : `file written: ${file} — start it once with: launchctl load ${file}`);
} else {
  const dir = path.join(os.homedir(), ".config", "systemd", "user");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, "wom-expose.service");
  await writeFile(file, `[Unit]\nDescription=World Overcomers office server\nAfter=network-online.target\n[Service]\nWorkingDirectory=${ROOT}\nExecStart=${NODE} ${path.join(ROOT, "scripts", "expose.mjs")}\nRestart=always\n[Install]\nWantedBy=default.target\n`);
  const en = await sh("systemctl", ["--user", "enable", "--now", "wom-expose.service"]);
  console.log(en.code === 0
    ? "auto-start installed and running — the office server now survives reboots on its own."
    : `file written: ${file} — start it once with: systemctl --user enable --now wom-expose.service`);
}
console.log("if you move this folder, run `npm run autostart` again from the new location.");
