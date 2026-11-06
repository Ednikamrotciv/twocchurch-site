// `npm run dev` — React + TypeScript through Vite (instant refresh while editing).
// The admin backend (sign-in, publish, uploads) is wired in by
// scripts/vite-cms-backend.mjs, so dev behaves exactly like production.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cmsBackend } from "./scripts/vite-cms-backend.mjs";

export default defineConfig({
  plugins: [react(), cmsBackend()],
  /* One server only (note 255): if an older folder's dev is still holding
     5173, a new folder must fail loudly — never slide silently onto 5174 while
     the browser keeps showing the old folder on 5173. */
  server: { port: 5173, strictPort: true },
  resolve: { dedupe: ["react", "react-dom"] },
  build: {
    /* Fast deploys: skip the bundle-size gzip pass and sourcemaps (both are
       pure build-time cost on the huge three.js chunk — runtime caching is
       already handled by the hashed names + manualChunks below). */
    sourcemap: false,
    reportCompressedSize: false,
    minify: "esbuild",
    target: "es2019",
    cssCodeSplit: true,
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
