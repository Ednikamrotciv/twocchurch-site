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
  const splash = document.getElementById("splash");
  if (splash) splash.remove();
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
