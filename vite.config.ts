// `npm run dev` — React + TypeScript through Vite (instant refresh while editing).
// The admin backend (sign-in, publish, uploads) is wired in by
// scripts/vite-cms-backend.mjs, so dev behaves exactly like production.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cmsBackend } from "./scripts/vite-cms-backend.mjs";

export default defineConfig({
  plugins: [react(), cmsBackend()],
  server: { port: 5173 },
  resolve: { dedupe: ["react", "react-dom"] },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("three")) return "vendor-three";
          if (id.includes("framer-motion")) return "vendor-motion";
          if (id.includes("swiper")) return "vendor-swiper";
          if (id.includes("react") || id.includes("scheduler")) return "vendor-react";
          return "vendor";
        },
      },
    },
  },
});
