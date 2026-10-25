// publish-watch.mjs — proves the FIRST Publish reached the live box.
//
// Problem it solves: the office clicks Publish, its own browser lifts at once
// (localStorage + code blessing), but other browsers/devices poll the LIVE box
// (Render). If the office→live relay missed (live asleep, live password differs
// after a diskless sleep-reset, 2FA on live, no session) and no rebuild has
// carried the words yet, those other copies stay on maintenance with no loud
// signal anywhere. This watch runs server-side after every successful office
// `publish` RPC: it re-reads the office stamp, then asks the live box for its
// stamp at ~3s, ~15s, ~45s, ~100s and ~200s. A Render cold boot alone takes
// 30–60s, and the rebuild path takes minutes — so at ~45s it logs one INFO
// "pending" line (connectivity, never a breach), and only if live is still
// behind after ~3.5 minutes does it log the HIGH line with the exact remedy,
// request id and elapsed time. Zero deps, timers unref'd (never holds a build
// or deploy open), skipped on the live box itself (RENDER=true — a publish
// there needs no relay). Fast proof in seconds, honest pending in under a
// minute, stuck signal only when it is actually stuck.
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
      if (round < 4 && my === token) later(round === 0 ? 12000 : round === 1 ? 30000 : round === 2 ? 55000 : 100000, () => check(my, round + 1));
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
    // ~45s with no confirmation is EXPECTED on a free host (cold boot alone
    // is 30–60s): say pending, out loud but at info — never a breach.
    if (round === 2) {
      const why = !live
        ? "could not read the live stamp yet"
        : live.unreachable
          ? "live box not answering yet (waking?)"
          : `live still shows rev ${live.rev} from ${live.at ? new Date(live.at).toISOString() : "never"} (office: rev ${office.rev})`;
      try {
        log({
          level: "info",
          kind: "publish-watch",
          ip: "-",
          route: liveUrl,
          detail: `publish still carrying to the live box (~45s, ${why}) — background retry + wake/rebuild carry it; no second click needed`,
          source: "live",
          online: live && !live.unreachable ? true : false,
        });
      } catch {}
    }
    if (round >= 4) {
      const why = !live
        ? "could not read the live stamp"
        : live.unreachable
          ? "live box unreachable (asleep/offline?)"
          : `live still shows rev ${live.rev} from ${live.at ? new Date(live.at).toISOString() : "never"} (office: rev ${office.rev})`;
      try {
        log({
          level: "high",
          kind: "publish-stuck",
          ip: "-",
          route: liveUrl,
          detail: `first Publish has NOT reached the live box after ~${Math.round((Date.now() - startedAt(my)) / 1000)}s [${reqIdOf(my)}] (${why}) — other browsers/devices stay on maintenance`,
          hint: "1) In the admin tab read the toast by the Publish button: if it says the live login was denied, type the live box's CURRENT password once on the Status tab (diskless hosts reset it to the shipped default on sleep — set ADMIN_HASH_OVERRIDE on the host to stop that). 2) This terminal: 'auto-deploy … not a git checkout' means this folder cannot push — publish from a git checkout, or click Publish on live/admin too. 3) If the live box is just asleep, its retry + wake carry it — or Publish once on live/admin for an instant lift.",
          source: "live",
          online: live && !live.unreachable ? true : false,
        });
      } catch {}
      return;
    }
    later(round === 0 ? 12000 : round === 1 ? 30000 : round === 2 ? 55000 : 100000, () => check(my, round + 1));
  }

  const startedAts = new Map();
  const reqIds = new Map();
  function startedAt(my) {
    return startedAts.get(my) || Date.now();
  }
  function reqIdOf(my) {
    return reqIds.get(my) || "r0";
  }

  function noteOfficePublish() {
    try {
      if (process.env.RENDER) return;
    } catch {}
    const my = ++token;
    try {
      startedAts.set(my, Date.now());
      reqIds.set(my, Math.random().toString(36).slice(2, 10));
      if (startedAts.size > 8) {
        const oldest = [...startedAts.keys()].sort((a, b) => a - b)[0];
        startedAts.delete(oldest);
        reqIds.delete(oldest);
      }
    } catch {}
    // Let the save settle, then prove the live box has it — first proof fast,
    // stuck verdict only after a cold boot + rebuild could have carried it.
    later(3000, () => check(my, 0));
  }

  return { noteOfficePublish };
}
