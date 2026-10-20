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
  const el = document.getElementById("root");
  if (!el) {
    console.error("Root container #root not found");
    return;
  }
  el.removeAttribute("data-loading");
  /* Offline shell (one-click-everywhere): return visits open the visitors
     site even with no network. Production only — dev serves from memory. */
  try {
    if ("serviceWorker" in navigator && import.meta.env.PROD) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch(() => {});
      });
    }
  } catch {}
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
