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
