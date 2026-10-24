// publish-watch.mjs — proves the FIRST Publish reached the live box.
//
// Problem it solves: the office clicks Publish, its own browser lifts at once
// (localStorage + code blessing), but other browsers/devices poll the LIVE box
// (Render). If the office→live relay missed (live asleep, live password differs
// after a diskless sleep-reset, 2FA on live, no session) and no rebuild has
// carried the words yet, those other copies stay on maintenance with no loud
// signal anywhere. This watch runs server-side after every successful office
// `publish` RPC: it re-reads the office stamp, then asks the live box for its
// stamp at ~45s, ~2.5min and ~6min. On confirmation it logs one info line
// (other browsers lift); if live is still behind at the end it logs a HIGH
// line with the exact remedy. Zero deps, timers unref'd (never holds a build
// or deploy open), skipped on the live box itself (RENDER=true — a publish
// there needs no relay).
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
        }, 15000);
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
      if (round < 3 && my === token) later(round === 0 ? 40000 : 150000, () => check(my, round + 1));
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
      live.at + 15000 >= office.at;
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
    if (round >= 3) {
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
          detail: `first Publish has NOT reached the live box after ~6 min (${why}) — other browsers/devices stay on maintenance`,
          hint: "1) In the admin tab read the toast by the Publish button: if it says the live login was denied, type the live box's CURRENT password once on the Status tab (diskless hosts reset it to the shipped default on sleep). 2) This terminal: 'auto-deploy … not a git checkout' means this folder cannot push — publish from a git checkout, or click Publish on live/admin too. 3) If the live box is just asleep, its retry + wake carry it — or Publish once on live/admin for an instant lift.",
          source: "live",
          online: live && !live.unreachable ? true : false,
        });
      } catch {}
      return;
    }
    later(round === 0 ? 40000 : 150000, () => check(my, round + 1));
  }

  function noteOfficePublish() {
    try {
      if (process.env.RENDER) return;
    } catch {}
    const my = ++token;
    // Let the save settle, then prove the live box has it.
    later(8000, () => check(my, 0));
  }

  return { noteOfficePublish };
}
