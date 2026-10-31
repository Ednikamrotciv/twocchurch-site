import React from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "framer-motion";
import { App } from "./App";
import "./styles/global.css";
import "./styles/pages.css";
import "./styles/glass.css";
/* Office CSS lazy: visitors never download the admin/editor styles. */
/* Office CSS on demand: hash route carries admin, so watch it cheaply. */
let officeCssLoaded = false;
function loadOfficeCss() {
  if (officeCssLoaded) return;
  officeCssLoaded = true;
  void import("./styles/admin.css");
  void import("./styles/edit.css");
}
try {
  const h0 = String(window.location.hash || "");
  const p0 = String(window.location.pathname || "");
  if (p0 === "/admin" || p0.indexOf("/admin/") === 0 || h0.indexOf("#/admin") === 0) loadOfficeCss();
  else window.addEventListener("hashchange", () => {
    try {
      const hh = String(window.location.hash || "");
      if (hh.indexOf("#/admin") === 0) loadOfficeCss();
    } catch {}
  });
} catch {}

function mount() {
  const el = document.getElementById("root");
  if (!el) {
    console.error("Root container #root not found");
    return;
  }
  el.removeAttribute("data-loading");
  /* Motion respects the visitor's own setting: with reduced motion asked for,
     transforms and layout animations go quiet everywhere (SPEC note 147). */
  try {
    createRoot(el).render(
      <MotionConfig reducedMotion="user">
        <App />
      </MotionConfig>
    );
  } catch (err) {
    /* A mount throw must never white-screen (notes 440, 441): the boundary
       owns render crashes, but a root failure happens above it — paint a
       plain reload card into #root so the visitor always has the same two
       ways out, even with React unmounted. */
    try {
      console.error("World Overcomers mount error:", err);
    } catch {}
    try {
      el.innerHTML =
        '<div style="max-width:560px;margin:8vh auto;padding:24px;text-align:center;font-family:system-ui">'
        + '<h2>Something went wrong on our side</h2>'
        + '<p>We are sorry — this page failed to load. One tap brings it back.</p>'
        + '<p><button onclick="location.reload()" style="padding:10px 18px">Reload the page</button> '
        + '<a href="/" style="padding:10px 18px">Try the home page</a></p></div>';
    } catch {}
  }
}

/* Global safety net (note 440): async throws (fetch, translation flush,
   upload heal) must never take the page down, and a stale chunk after a
   deploy must reload onto the new files once instead of parking on a crash
   card. Installed before mount so early failures are caught too. */
try {
  const chunkReloadedKey = "wom.chunkReloadedAt";
  const shouldReloadChunk = () => {
    try {
      const at = Number(sessionStorage.getItem(chunkReloadedKey) || 0);
      if (Date.now() - at < 60_000) return false;
      sessionStorage.setItem(chunkReloadedKey, String(Date.now()));
      return true;
    } catch {
      return true;
    }
  };
  const isChunkMsg = (m: string) =>
    /loading chunk/i.test(m) ||
    /loading css chunk/i.test(m) ||
    /chunkloaderror/i.test(m) ||
    /failed to fetch dynamically imported module/i.test(m) ||
    /importing a module script failed/i.test(m);
  window.addEventListener(
    "error",
    (e) => {
      try {
        const m = String((e as any)?.message || (e as any)?.error?.message || "");
        if (isChunkMsg(m) && shouldReloadChunk()) window.location.reload();
      } catch {}
    },
    true
  );
  window.addEventListener("unhandledrejection", (e) => {
    try {
      const m = String((e as any)?.reason?.message || (e as any)?.reason || "");
      if (isChunkMsg(m)) {
        try {
          e.preventDefault();
        } catch {}
        if (shouldReloadChunk()) window.location.reload();
      }
    } catch {}
  });
} catch {}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount);
} else {
  mount();
}
