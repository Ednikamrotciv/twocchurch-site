// publish-watch.mjs — proves the FIRST Publish reached the live box.
//
// Problem it solves: the office clicks Publish, its own browser lifts at once
// (localStorage + code blessing), but other browsers/devices poll the LIVE box
// (Render). If the office→live relay missed (live asleep, live password differs
// after a diskless sleep-reset, 2FA on live, no session) and no rebuild has
// carried the words yet, those other copies stay on maintenance with no loud
// signal anywhere. This watch runs server-side after every successful office
// `publish` RPC: it re-reads the office stamp, then asks the live box for its
// stamp at ~3s, ~13s, ~28s and ~48s. On confirmation it logs one info line
// (other browsers lift); if live is still behind at the end it logs a HIGH
// line with the exact remedy. Zero deps, timers unref'd (never holds a build
// or deploy open), skipped on the live box itself (RENDER=true — a publish
// there needs no relay). Very fast: first proof in seconds, stuck signal in
// under a minute.
export function createPublishWatch({ getOfficeStamp, getLiveUrl, log } = {}) {
  let token = 0;

  function later(ms, fn) {
    try {
      const t = setTimeout(fn, ms);
      if (t && t.unref) t.unref();
      return t;
    } catch {
      return 0;
    }
  }

  async function fetchLiveStamp(base) {
    const clean = String(base || "").replace(/\/+$/, "");
    if (!/^https?:\/\/[^/\s]+$/i.test(clean)) return null;
    let ctrl = null;
    let timer = 0;
    try {
      if (typeof AbortController !== "undefined") {
        ctrl = new AbortController();
        timer = setTimeout(() => {
          try {
            ctrl.abort();
          } catch {}
        }, 8000);
      }
      const r = await fetch(clean + "/__cms/contentRev?conn=publish-watch", {
        method: "POST",
        headers: { "content-type": "text/plain;charset=utf-8" },
        body: "",
        signal: ctrl ? ctrl.signal : undefined,
      });
      if (timer) clearTimeout(timer);
      if (!r || !r.ok) return { unreachable: true };
      const data = await r.json().catch(() => null);
      if (!data || data.ok !== true) return { unreachable: true };
      return {
        rev: Math.floor(Number(data.rev)) || 0,
        notes: Math.floor(Number(data.notes)) || 0,
        at: Number(data.at) || 0,
        deploy: typeof data.publishDeploy === "string" ? data.publishDeploy : "",
        code: typeof data.code === "string" ? data.code : "",
        words: Math.floor(Number(data.words)) || 0,
      };
    } catch {
      if (timer) clearTimeout(timer);
      return { unreachable: true };
    }
  }

  async function check(my, round) {
    if (my !== token) return;
    let office = null;
    try {
      office = await getOfficeStamp();
    } catch {
      office = null;
    }
    if (!office || !(office.notes > 0)) {
      if (round < 3 && my === token) later(round === 0 ? 10000 : 20000, () => check(my, round + 1));
      return;
    }
    let liveUrl = "";
    try {
      liveUrl = (await getLiveUrl()) || "";
    } catch {
      liveUrl = "";
    }
    if (!liveUrl) {
      try {
        log({ level: "info", kind: "publish-watch", ip: "-", route: "-", detail: `office publish recorded (rev ${office.rev}) — no live address configured, this standalone copy is done`, source: "local" });
      } catch {}
      return;
    }
    // The live box IS this process (RENDER serves and publishes here): its own
    // polls already lift every copy within seconds — nothing to prove.
    try {
      if (process.env.RENDER) return;
    } catch {}
    const live = await fetchLiveStamp(liveUrl);
    if (my !== token) return;
    const confirmed =
      !!live &&
      !live.unreachable &&
      live.notes >= office.notes &&
      live.at > 0 &&
      live.at + 15000 >= office.at &&
      (live.words || 0) > 0;
    if (confirmed) {
      try {
        log({
          level: "info",
          kind: "publish-watch",
          ip: "-",
          route: liveUrl,
          detail: `live box confirmed the publish (rev ${live.rev}) — other browsers/devices lift off maintenance`,
          source: "live",
          online: true,
        });
      } catch {}
      return;
    }
    // Convergence fix (rev1 office vs rev2 live): rev counters are per-store
    // and NEVER match across boxes — only notes/clock/words decide. The old
    // message blamed the rev gap itself and gave up after ~50s, before a
    // rebuild (minutes) could carry the words. Keep proving for ~7 minutes and
    // say what actually blocks visitors.
    if (round >= 5) {
      const why = !live
        ? "could not read the live stamp"
        : live.unreachable
          ? "live box unreachable (asleep/offline?)"
          : `live notes ${live.notes} words ${live.words} at ${live.at ? new Date(live.at).toISOString() : "never"} (office notes ${office.notes} at ${office.at ? new Date(office.at).toISOString() : "never"}; rev ${live.rev} vs ${office.rev} is normal — counters are per-store)`;
      try {
        log({
          level: "high",
          kind: "publish-stuck",
          ip: "-",
          route: liveUrl,
          detail: `Publish has NOT reached the live box after ~7min (${why}) — other browsers/devices stay on maintenance until live holds this update with real words`,
          hint: "1) Admin tab toast by Publish: if live login was denied, type the live box's CURRENT password once on Status (diskless hosts reset to shipped default on sleep) or set ADMIN_HASH_OVERRIDE on Render. 2) Terminal: 'auto-deploy … not a git checkout' means this folder cannot push — publish from a git checkout so the rebuild carries the words, or Publish once on live/admin too. 3) Sleeping live: the 4s relay retry + wake carries it; keep the tab open or Publish on live/admin for instant lift. Rev mismatch alone is NOT failure — only notes/clock/words matter.",
          source: "live",
          online: live && !live.unreachable ? true : false,
        });
      } catch {}
      return;
    }
    // 3s, 15s, 45s, ~2.5min, ~5min, then the ~7min verdict above — long enough
    // for a sleep-wake relay AND a rebuild to land.
    later(round === 0 ? 12000 : round === 1 ? 30000 : round === 2 ? 90000 : 120000, () => check(my, round + 1));
  }

  function noteOfficePublish() {
    try {
      if (process.env.RENDER) return;
    } catch {}
    const my = ++token;
    // Let the save settle, then prove the live box has it — very fast.
    later(3000, () => check(my, 0));
  }

  return { noteOfficePublish };
}
