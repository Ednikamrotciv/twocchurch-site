/* `npm run build` step two (right after `vite build`): finish dist/ for any
   static host — baked content, office-server + live-feed pointers, photos,
   uploads, and one page file per route (plus 404.html) so direct visits and
   refreshes work with no rewrite rules. Served from the domain root (clean
   addresses assume it). */

import { cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { bakeSeed } from "./bake-seed.mjs";
import { readFeedConfig, effectiveFeed } from "./feed-config.mjs";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "dist");

try {
  await stat(path.join(OUT, "index.html"));
} catch {
  console.error("no dist/index.html — `vite build` must run first (plain `npm run build` does both).");
  process.exit(1);
}
await mkdir(OUT, { recursive: true });

/* Fresh words on every deploy: bake the pushed store into dist/seed.json, so the
   deployed seed always matches what the office last published. */
try {
  await bakeSeed(ROOT, path.join(OUT, "seed.json"));
} catch (err) {
  /* An empty bake is a red build, never a silent shell (note 366). */
  if (err && err.code === "EMPTY_BAKE") {
    console.error("BUILD FAILED: " + err.message);
    process.exit(1);
  }
  console.warn("seed not re-baked:", err?.message || err);
}

/* Maintenance lock (no numbers — locked in code): EVERY build stamps a
   fresh opaque deploy ID and holds fresh visitors on the maintenance notice
   until the office publishes — whether the code is new or old, every deploy
   looks new during deploy. version.json + seed.json + the entry page all
   carry the same ID; the notice lifts only when a publish from that deploy
   lands (office Publish on the deployed copy, or a witnessed publish carrying
   the same ID). maintenance-hold.txt still ships as a marker (it is NOT git-ignored), but holding no longer depends on it — the lock cannot be
   switched off by deleting a file.
   maintenance hold on: fresh visitors wait until the office publishes (locked — every deploy holds). */
const DEPLOY_ID =
  "dpl-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
try {
  const seedPath = path.join(OUT, "seed.json");
  const seed = JSON.parse(await readFile(seedPath, "utf8"));
  if (seed && typeof seed === "object") {
    /* First-publish witness for the new deploy (one click clears everywhere):
       the bake above carries the office's last publish. When those words were
       published from THIS update (notes at the code's own update number, with
       real words), this deploy counts as their publisher too — every fresh
       visitor's same-deploy witness then matches on first paint, so one
       office Publish clears the maintenance notice on unlimited
       browsers/devices with no second click. A bake from an older update (or
       an empty/clean bake) keeps the hold: new code still waits for review.
       Backend notes reach the update number only through an explicit office
       publish/undo/flush, so the stamp can never leak ahead of review. */
    let buildNotes = 0;
    let buildCode = "";
    try {
      const hooksSrc = await readFile(path.join(ROOT, "src", "lib", "hooks.ts"), "utf8");
      buildNotes = Number((hooksSrc.match(/BUILD_NOTES = (\d+)/) || [])[1]) || 0;
      buildCode = (hooksSrc.match(/CODE_ID = "([A-Za-z0-9_-]+)"/) || [])[1] || "";
    } catch { /* no number — the hold below stands */ }
    const seedOut = { ...seed, hold: true, deployId: DEPLOY_ID };
    try {
      const sections = seed && seed.sections && typeof seed.sections === "object" ? Object.keys(seed.sections).length : 0;
      if (buildNotes > 0 && typeof seed.notes === "number" && Math.floor(seed.notes) >= buildNotes && typeof seed.rev === "number" && seed.rev > 0 && sections > 0) {
        /* Word-gated (note 428): the bake below names the publish it carries —
           only the running code's own review releases this deploy at first
           paint. A same-number bake from older code (or a codeless older bake,
           which proves nothing) keeps the hold until Publish. */
        const seedCode = typeof seed.code === "string" ? seed.code : "";
        if (!!buildCode && !!seedCode && seedCode === buildCode) {
          seedOut.publishedDeploy = DEPLOY_ID;
        }
      }
    } catch { /* witness skipped — the hold stands */ }
    await writeFile(seedPath, JSON.stringify(seedOut));
    console.log("maintenance hold on: fresh visitors wait until the office publishes (locked — every deploy holds)");
    if (seedOut.publishedDeploy) console.log("first-publish witness stamped: this deploy carries the office publish — one click clears every visitor");
  }
} catch (err) {
  console.warn("maintenance hold skipped:", err?.message || err);
}

/* Clean-deploy flag (option A): with clean-deploy.txt beside package.json the
   bake above shipped no words — the deploy opens fresh, new and clean until
   the office clicks Recover and Publish. Remove the file and rebuild to carry
   words again. */
try {
  await readFile(path.join(ROOT, "clean-deploy.txt"), "utf8");
  console.log("clean deploy on: dist ships no words (clean-deploy.txt) — Recover + Publish, then REMOVE the file and rebuild to lock words in");
} catch { /* words ride as usual */ }

/* The live feed address: with a valid publish-feed.txt (a public source repo
   line, or a mirror repo line for private sources), deployed copies read fresh
   words straight off the repo within minutes of a publish — no rebuild needed,
   on any host. Without either, copies update on rebuilds only. */
try {
  const cfg = await readFeedConfig(ROOT);
  const feed = effectiveFeed(cfg);
  if (feed) {
    /* Uploads layout for wipe durability: a mirror repo carries uploads at
       its top ("uploads/<name>", synced by feed-mirror.mjs), while a public
       source repo carries them where the office keeps them
       ("data/uploads/<name>", committed by auto-push). Copies read this back
       through bakedFeedUploadsDir() and paint/heal off the repo when the disk
       copy is gone. */
    const uploadsDir = cfg.mirror ? "uploads" : "data/uploads";
    await writeFile(path.join(OUT, "feed.json"), JSON.stringify({ feed, uploads: uploadsDir }));
    console.log(`live feed on: ${feed} — deployed copies refresh without rebuilds`);
  } else {
    const rawFeed = await readFile(path.join(ROOT, "publish-feed.txt"), "utf8").catch(() => "");
    const line = String(rawFeed).split(/\r?\n/).map((l) => l.trim()).find((l) => l && !l.startsWith("#")) || "";
    if (!line) console.log("no live feed in publish-feed.txt — deployed copies update on rebuilds only");
    else console.warn(`publish-feed.txt ignored: "${line}" is not owner/repo@branch or a github.com repo address — deployed copies update on rebuilds only`);
  }
    /* Feed signal on the entry page (note 416): the deployed copy reads it
       synchronously on first paint — like the wom-server meta above — so the
       maintenance gate knows at once that words can move after deploy even
       with no server behind the copy. Route copies below inherit the shell. */
    try {
      var shellPathFeed = path.join(OUT, "index.html");
      var shellFeed = await readFile(shellPathFeed, "utf8");
      if (shellFeed.indexOf('name="wom-feed"') < 0) {
        var tagFeed = '<meta name="wom-feed" content="1">';
        if (shellFeed.indexOf("</head>") >= 0) { shellFeed = shellFeed.replace("</head>", "  " + tagFeed + "\n</head>"); }
        else { shellFeed = tagFeed + "\n" + shellFeed; }
        await writeFile(shellPathFeed, shellFeed);
        console.log("feed meta stamped into dist/index.html");
      }
    } catch (errFeed) {
      console.warn("feed meta skipped:", errFeed && errFeed.message ? errFeed.message : errFeed);
    }
} catch (err) {
  console.warn("feed.json skipped:", err?.message || err);
}

/* Origin address for wake-time priming (sleep-wake after the first publish):
   the git remote names the public source repo, so bake it into
   dist/origin.json — a waking box with no live feed configured primes its
   fallback off the pushed source seed instead of the deploy-time bake (see
   primeMirrorSeed in seed-fallback.mjs). Best effort and silent: no git
   remote, a non-github remote, or a build farm without git all skip it, and
   private repos 404 at prime time and stay skipped. Public owner/repo@branch
   only, never a secret. */
try {
  const { execFile: gitExec } = await import("node:child_process");
  const gitOut = (args) => new Promise((res) => gitExec("git", args, { cwd: ROOT, timeout: 4000 }, (err, stdout) => res(err ? "" : String(stdout || "").trim())));
  const [remote, branchRaw] = await Promise.all([gitOut(["config", "--get", "remote.origin.url"]), gitOut(["rev-parse", "--abbrev-ref", "HEAD"])]);
  let branch = branchRaw;
  if (!branch || branch === "HEAD") branch = "main";
  let gm = /^https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/i.exec(remote);
  if (!gm) gm = /^git@github\.com:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/i.exec(remote);
  if (gm && gm[1] !== "owner" && gm[2] !== "repo" && /^[A-Za-z0-9_.\/-]+$/.test(branch)) {
    await writeFile(path.join(OUT, "origin.json"), JSON.stringify({ source: `${gm[1]}/${gm[2]}@${branch}` }));
    console.log(`origin baked in: ${gm[1]}/${gm[2]}@${branch} — waking boxes prime the first publish off the source repo`);
  }
} catch { /* no git remote — wakes prime off the feed only */ }

/* The office server, baked in: when the repo carries a cms-server.txt with
   the office address (one origin, e.g. https://office.example.com), every
   deployed copy joins that shared backend automatically — sign-in,
   publishing, uploads and live updates, exactly like local. Absent file, or
   a blank one, and the copy stands alone. */
try {
  const raw = await readFile(path.join(ROOT, "cms-server.txt"), "utf8").catch(() => "");
  const lines = String(raw).split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const first = lines[0] || "";
  const url = first && /^https?:\/\/[^/\s]+$/i.test(first.replace(/\/+$/, "")) ? first.replace(/\/+$/, "") : "";
  if (url) {
    await writeFile(path.join(OUT, "server.json"), JSON.stringify({ url }));
    console.log(`office server baked in: ${url} — deployed copies join the shared backend`);
    /* Stamp the same address as a meta tag in the entry page (note 279): the
       deployed copy reads it synchronously on first paint, so the
       maintenance gate knows immediately that it is server-backed instead
       of flashing live first. Route copies are made from this shell below,
       so they inherit it. */
    try {
      const shellPath = path.join(OUT, "index.html");
      let shell = await readFile(shellPath, "utf8");
      if (!shell.includes('name="wom-server"')) {
        const tag = `<meta name="wom-server" content="${url}">`;
        if (shell.includes("</head>")) shell = shell.replace("</head>", `  ${tag}\n</head>`);
        else shell = tag + "\n" + shell;
        await writeFile(shellPath, shell);
        console.log("server meta stamped into dist/index.html");
      }
    } catch (err) {
      console.warn("server meta skipped:", err?.message || err);
    }
  } else if (!lines.length) {
    console.log("no office server in cms-server.txt — deployed copies stand alone (see DEPLOY.md, office server)");
  } else {
    console.warn(`cms-server.txt ignored: "${first}" is not an origin (want just https://your-server-address, nothing after it) — deployed copies stand alone`);
  }
} catch (err) {
  console.warn("server.json skipped:", err?.message || err);
}

/* Deploy ID on the entry page (deploy lock): stamped synchronously so the
   first paint knows its deploy without fetching. Route copies below are made
   from this shell, so they inherit it. */
try {
  const shellPath = path.join(OUT, "index.html");
  let shell = await readFile(shellPath, "utf8");
  if (!shell.includes('name="wom-deploy"')) {
    const tag = '<meta name="wom-deploy" content="' + DEPLOY_ID + '">';
    if (shell.includes("</head>")) shell = shell.replace("</head>", "  " + tag + "\n</head>");
    else shell = tag + "\n" + shell;
    await writeFile(shellPath, shell);
    console.log("deploy id stamped into dist/index.html: " + DEPLOY_ID);
  }
} catch (err) {
  console.warn("deploy meta skipped:", err?.message || err);
}

/* String-URL files the app points at (photos are plain "src/assets/…" strings,
   never imports, so `vite build` skips them) plus the office's own uploads. */
/* Fast copies: photos + uploads ride together, not one after the other. */
try {
  const copyPhotos = cp(path.join(ROOT, "src", "assets"), path.join(OUT, "src", "assets"), { recursive: true })
    .then(() => console.log("photos copied to dist/src/assets"));
  const copyUploads = stat(path.join(ROOT, "data", "uploads")).catch(() => null)
    .then((st) => st && st.isDirectory() ? cp(path.join(ROOT, "data", "uploads"), path.join(OUT, "data", "uploads"), { recursive: true }) : null)
    .then((r) => { if (r) console.log("uploads copied to dist/data/uploads"); });
  await Promise.all([copyPhotos, copyUploads]);
} catch (err) {
  console.warn("asset copy skipped:", err?.message || err);
}

/* Clean addresses on hosts with no rewrite rules: /admin, /sermons, … each
   get their own copy of the entry page, so a direct visit or refresh boots
   the app instead of a host 404. The route list is read from the site's own
   table (src/lib/routes.tsx), plus the office prefix beside every page. */
try {
  const routesSrc = await readFile(path.join(ROOT, "src", "lib", "routes.tsx"), "utf8");
  const patterns = [...routesSrc.matchAll(/pattern:\s*"([^"]+)"/g)]
    .map((m) => m[1])
    .filter((p) => !p.includes(":") && p !== "/")
    .map((p) => p.replace(/^\//, ""));
  const pages = [...new Set([...patterns, "admin"])];
  const shell = await readFile(path.join(OUT, "index.html"), "utf8");
  const writePage = async (dir) => {
    await mkdir(path.join(OUT, dir), { recursive: true });
    await writeFile(path.join(OUT, dir, "index.html"), shell);
  };
  await Promise.all([
    ...pages.map((page) => writePage(page)),
    ...pages.map((page) => writePage(path.join("admin", page))),
    writeFile(path.join(OUT, "404.html"), shell),
  ]);
  console.log(`route pages written for: ${pages.join(", ")} (+ admin/*, 404.html)`);
} catch (err) {
  console.warn("route pages skipped:", err?.message || err);
}
/* Stamp the build with its update number (note 248): serve.mjs reads this
   back and refuses to serve a stale dist silently. */
try {
  const src = await readFile(path.join(ROOT, "src", "lib", "hooks.ts"), "utf8");
  const notes = Number((src.match(/BUILD_NOTES = (\d+)/) || [])[1]) || 0;
  /* Unnumbered code word (stale fix, no new number): version.json names the
     running code without ordering it, so a mixed-asset serve is spotted, not
     guessed. */
  const codeMatch = /export const CODE_ID = "([A-Za-z0-9_-]+)"/.exec(src);
  const codeWord = codeMatch ? codeMatch[1] : "";
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  await writeFile(path.join(OUT, "version.json"), JSON.stringify({ notes, code: codeWord, deployId: DEPLOY_ID, built: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, builtAt: Date.now() }));
  console.log(`build stamped: update ${notes}${codeWord ? " code " + codeWord : ""}`);
} catch (err) {
  console.warn("version.json skipped:", err?.message || err);
}
/* Code word on the entry page (unnumbered stale fix): the pre-bundle gate and
   the app read it synchronously on first paint. The source file already
   carries the same word for dev; enforce it here so dist can never drift. */
try {
  const srcHooks = await readFile(path.join(ROOT, "src", "lib", "hooks.ts"), "utf8");
  const codeMatch2 = /export const CODE_ID = "([A-Za-z0-9_-]+)"/.exec(srcHooks);
  const codeWord2 = codeMatch2 ? codeMatch2[1] : "";
  if (codeWord2) {
    const shellPath = path.join(OUT, "index.html");
    let shell = await readFile(shellPath, "utf8");
    const codeRe = /<meta name="wom-code" content="[^"]*"\s*\/?>/;
    const codeTag = '<meta name="wom-code" content="' + codeWord2 + '" />';
    if (codeRe.test(shell)) shell = shell.replace(codeRe, codeTag);
    else if (shell.includes("</head>")) shell = shell.replace("</head>", "  " + codeTag + "\n</head>");
    else shell = codeTag + "\n" + shell;
    await writeFile(shellPath, shell);
    console.log("code word stamped into dist/index.html: " + codeWord2);
  }
} catch (err) {
  console.warn("code meta skipped:", err?.message || err);
}
/* Entry files are never cached (note 302): without this, static hosts serve
   a stale index.html / version.json after an update, so visitors keep running
   the old bundle and never see the maintenance notice until a hard refresh.
   Netlify + Cloudflare Pages read _headers; Apache/cPanel hosts read
   .htaccess. Hashed JS/CSS under assets/ stay cached (their names change on
   every build). */
try {
  const headers =
`# note 302 — entry files always fresh, hashed assets cacheable.
/index.html
  Cache-Control: no-store, must-revalidate
/*/index.html
  Cache-Control: no-store, must-revalidate
/404.html
  Cache-Control: no-store, must-revalidate
/version.json
  Cache-Control: no-store, must-revalidate
/seed.json
  Cache-Control: no-store, must-revalidate
/server.json
  Cache-Control: no-store, must-revalidate
/feed.json
  Cache-Control: no-store, must-revalidate
`;
  await writeFile(path.join(OUT, "_headers"), headers);
  const htaccess =
`<IfModule mod_headers.c>
  # note 302 — entry files always fresh (see _headers for Netlify/Cloudflare)
  <FilesMatch "^(index\\.html|404\\.html|version\\.json|seed\\.json|server\\.json|feed\\.json)$">
    Header set Cache-Control "no-store, must-revalidate"
  </FilesMatch>
</IfModule>
`;
  await writeFile(path.join(OUT, ".htaccess"), htaccess);
  console.log("cache headers written (_headers + .htaccess): entry files never cached");
} catch (err) {
  console.warn("cache headers skipped:", err?.message || err);
}
console.log("dist/ ready to upload (the *contents* of dist/ go to the static host)");
