import React from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "framer-motion";
import { App } from "./App";
import "./styles/global.css";
import "./styles/pages.css";
import "./styles/admin.css";
import "./styles/edit.css";
import "./styles/glass.css";

function mount() {
  /* Offline live site (one click clears everywhere, online or offline): after
     one online visit past a publish, offline opens paint the cached live site
     instead of an error or a stuck notice. New deploys wipe the old cache on
     activate, so each deploy still opens fresh, clean and new. */
  try {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch(() => {});
      });
    }
  } catch {}
  const el = document.getElementById("root");
  if (!el) {
    console.error("Root container #root not found");
    return;
  }
  el.removeAttribute("data-loading");
  /* Motion respects the visitor's own setting: with reduced motion asked for,
     transforms and layout animations go quiet everywhere (SPEC note 147). */
  createRoot(el).render(
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount);
} else {
  mount();
}
