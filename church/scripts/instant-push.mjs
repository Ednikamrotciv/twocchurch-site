/* Instant publish push (publish-at-once): hold the server's event stream open and
   hear its publish shouts in about a second instead of on the next poll
   minute. The shout only ever triggers the caller's normal guarded round, so
   this moves bytes never — it just says "now". Poll loops stay as the
   backstop; a host without the stream endpoint simply retries its backoff.
   Dependency-free (works in Node and browsers); fetch/timers injectable so the
   update verifier can run it anywhere. Never throws out. */

export function splitSse(buffer) {
  const messages = [];
  let rest = String(buffer == null ? "" : buffer);
  for (;;) {
    const m = /\r?\n\r?\n/.exec(rest);
    if (!m) break;
    const block = rest.slice(0, m.index);
    rest = rest.slice(m.index + m[0].length);
    const data = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.charAt(0) === ":") continue; /* heartbeat/comment */
      if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    }
    if (data.length) messages.push(data.join("\n"));
  }
  return { messages, rest };
}

export function openInstantPush(opts) {
  const o = opts || {};
  const originFor = o.originFor;
  const connId = String(o.connId || "follow");
  const onContent = o.onContent || function () {};
  const doFetch = o.fetchImpl || fetch;
  const later = o.setTimeoutImpl || setTimeout;
  const unlater = o.clearTimeoutImpl || clearTimeout;
  const log = o.log || function () {};
  let closed = false;
  let attempt = 0;
  let timer = 0;
  let wake = null;
  let ctrlNow = null;
  const wait = (ms) =>
    new Promise((res) => {
      wake = res;
      timer = later(() => {
        timer = 0;
        wake = null;
        res();
      }, ms);
    });
  const backoff = () => Math.min(30000, Math.round(2000 * Math.pow(1.5, Math.min(attempt, 9))));
  async function loop() {
    while (!closed) {
      attempt += 1;
      let origin = "";
      try {
        origin = String((await originFor()) || "");
      } catch {
        origin = "";
      }
      if (!origin) {
        await wait(backoff());
        continue;
      }
      const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      ctrlNow = ctrl;
      let watchdog = 0;
      const arm = () => {
        if (watchdog) unlater(watchdog);
        watchdog = later(() => {
          try {
            ctrl && ctrl.abort();
          } catch {}
        }, 70000);
      };
      try {
        const res = await doFetch(origin.replace(/\/+$/, "") + "/__cms/events?conn=" + encodeURIComponent(connId), {
          headers: { accept: "text/event-stream" },
          signal: ctrl ? ctrl.signal : undefined,
        });
        if (!res || !res.ok || !res.body || typeof res.body.getReader !== "function") throw new Error("no stream");
        attempt = 0;
        let buf = "";
        const reader = res.body.getReader();
        const dec = typeof TextDecoder !== "undefined" ? new TextDecoder() : null;
        arm();
        for (;;) {
          const step = await reader.read();
          if (!step || step.done) break;
          arm();
          const chunk = dec ? dec.decode(step.value, { stream: true }) : String(step.value || "");
          buf += chunk;
          if (buf.length > 65536) buf = buf.slice(-32768); /* garbage flood guard */
          const cut = splitSse(buf);
          buf = cut.rest;
          for (const line of cut.messages) {
            let obj = null;
            try {
              obj = JSON.parse(line);
            } catch {
              obj = null;
            }
            if (obj && typeof obj === "object" && typeof obj.rev === "number") {
              try {
                onContent(obj);
              } catch {}
            }
          }
          if (closed) break;
        }
        try {
          await reader.cancel();
        } catch {}
      } catch {
        /* unreachable, asleep, or an old host without the stream — back off */
      } finally {
        ctrlNow = null;
        if (watchdog) {
          unlater(watchdog);
          watchdog = 0;
        }
      }
      if (!closed) {
        if (attempt === 1) {
          try {
            log("instant push listening");
          } catch {}
        }
        await wait(backoff());
      }
    }
  }
  try {
    loop().catch(() => {});
  } catch {
    /* the caller's poll loop still brings every publish home */
  }
  return {
    close() {
      closed = true;
      try {
        ctrlNow && ctrlNow.abort();
      } catch {}
      if (timer) {
        unlater(timer);
        timer = 0;
      }
      if (wake) {
        const w = wake;
        wake = null;
        w();
      }
    },
  };
}
