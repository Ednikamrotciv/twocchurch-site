/* Build script for the World Overcomers website.
   Run it from the perchance agent workspace (execute_js) like this:

     globalThis.fs = fs;                       // the workspace filesystem
     const src = await fs.readTextFile("src/tools/build.mjs");
     const mod = await import(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
     return await mod.build();                 // writes src/bundle.js + src/bundle.css

   It bundles src/main.tsx (React + TypeScript) with esbuild-wasm, pulling React and
   ReactDOM from esm.sh at build time so the shipped src/bundle.js has no runtime
   dependencies. Never edit src/bundle.js by hand. */

import * as esbuildNamespace from "https://esm.sh/esbuild-wasm@0.21.5?bundle";

const esbuild = esbuildNamespace.default ?? esbuildNamespace;
const CDN = "https://esm.sh";

const BARE = {
  react: "/react@18.3.1?bundle",
  "react/jsx-runtime": "/react@18.3.1/jsx-runtime?bundle",
  "react-dom": "/react-dom@18.3.1?bundle&external=react",
  "react-dom/client": "/react-dom@18.3.1/client?bundle&external=react",
  /* Framer Motion, sharing the bundle's own React (SPEC note 147). The
     externals keep esm.sh from inlining a second React, which would break
     hooks at runtime. */
  "framer-motion": "/framer-motion@11.11.9?bundle&external=react,react-dom",
  "qrcode-generator": "/qrcode-generator@1.4.4?bundle",
  /* The announcement slide space: swiper drives the stage (creative effect +
     autoplay), framer-motion the entrance and the arrows. Vanilla swiper core
     only (no swiper/react wrapper). */
  "swiper": "/swiper@14.3.0?bundle",
  "swiper/modules": "/swiper@14.3.0/modules?bundle",
  /* The 3D slide stage (src/components/slides3d.tsx): React Three Fiber renders
     the carousel and drei's Html carries each designed slide as a face, so the
     eight DOM designs are reused untouched. Deep drei imports keep the heavy
     extras (mediapipe, hls, troika…) out of the bundle. The externals route
     every copy of react, react-dom, fiber and three through one shared module
     each (see the framer-motion note above). three@0.170.0 satisfies both
     peers (fiber wants >=0.133, drei wants >=0.137), pinned to the exact file
     the fiber bundle imports, so every copy of three in the graph is one
     module, not two. */
  "three": "/three@0.170.0/es2022/three.mjs",
  "@react-three/fiber": "/@react-three/fiber@8.18.0?bundle&external=react,react-dom&deps=three@0.170.0",
  "@react-three/drei/web/Html": "/@react-three/drei@9.122.0/web/Html?bundle&external=react,react-dom,@react-three/fiber,three&deps=three@0.170.0,@react-three/fiber@8.18.0",
  "@react-three/drei/core/Sparkles": "/@react-three/drei@9.122.0/core/Sparkles?bundle&external=react,react-dom,@react-three/fiber,three&deps=three@0.170.0,@react-three/fiber@8.18.0",
};

const cache = new Map();
const HTTP_CACHE_DIR = "scratch/.http-cache";

/* A tiny synchronous hash so fetched URLs map to stable cache filenames. */
function hashName(text) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ 0xdead;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}

function fetchText(url, fs) {
  if (!cache.has(url)) {
    const promise = (async () => {
      /* Within a session, fetched CDN files survive in scratch/ so rebuilds
         do not re-download big graphs (framer-motion is hundreds of files). */
      const slot = `${HTTP_CACHE_DIR}/${hashName(url)}.txt`;
      try {
        if (fs) return await fs.readTextFile(slot);
      } catch {
        /* cache miss — fall through to the network */
      }
      const text = await fetch(url).then((res) => {
        if (!res.ok) throw new Error(`fetch failed ${res.status} for ${url}`);
        return res.text();
      });
      try {
        if (fs) await fs.writeTextFile(slot, text);
      } catch {
        /* caching is best-effort; the build does not depend on it */
      }
      return text;
    })();
    cache.set(url, promise);
  }
  return cache.get(url);
}

function dirname(path) {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

function joinPath(base, relative) {
  const parts = (base ? base.split("/") : []).concat(relative.split("/"));
  const out = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

const CANDIDATE_EXTENSIONS = ["", ".tsx", ".ts", ".js", ".jsx", ".mjs", ".css", "/index.tsx", "/index.ts", "/index.js"];

function loaderFor(path) {
  if (path.endsWith(".tsx")) return "tsx";
  if (path.endsWith(".ts")) return "ts";
  if (path.endsWith(".css")) return "css";
  if (path.endsWith(".json")) return "json";
  return "js";
}

export async function build(options = {}) {
  const fs = globalThis.fs;
  if (!fs) throw new Error("globalThis.fs is not available — run this from the perchance agent workspace");

  await esbuild.initialize({
    wasmURL: "https://esm.sh/esbuild-wasm@0.21.5/esbuild.wasm",
  });

  const unresolved = [];

  const plugin = {
    name: "workspace",
    setup(build) {
      build.onResolve({ filter: /.*/ }, async (args) => {
        if (args.kind === "entry-point") {
          return { path: "src/main.tsx", namespace: "ws" };
        }

        if (args.namespace === "http") {
          if (args.path.startsWith("/")) return { path: CDN + args.path, namespace: "http" };
          if (args.path.startsWith("http")) return { path: args.path, namespace: "http" };
          if (BARE[args.path]) return { path: CDN + BARE[args.path], namespace: "http" };
          /* A fetched chunk importing its siblings relatively (framer-motion's
             esm.sh graph does this throughout): resolve against the URL it was
             imported from. */
          if (args.path.startsWith(".") && args.importer && /^https?:\/\//.test(args.importer)) {
            return { path: new URL(args.path, args.importer).href, namespace: "http" };
          }
          unresolved.push(args.path);
          return { path: args.path, external: true };
        }

        const base = args.resolveDir || "";
        if (args.path.startsWith(".") || args.path.startsWith("/")) {
          const target = joinPath(base, args.path.replace(/^\//, ""));
          for (const ext of CANDIDATE_EXTENSIONS) {
            const candidate = target + ext;
            try {
              await fs.readTextFile(candidate);
              return { path: candidate, namespace: "ws" };
            } catch {
              /* try next */
            }
          }
          return { errors: [{ text: `Cannot resolve ${args.path} from ${base}` }] };
        }

        if (BARE[args.path]) return { path: CDN + BARE[args.path], namespace: "http" };
        unresolved.push(args.path);
        return { path: args.path, external: true };
      });

      build.onLoad({ filter: /.*/, namespace: "http" }, async (args) => ({
        contents: await fetchText(args.path, fs),
        loader: loaderFor(args.path),
      }));

      build.onLoad({ filter: /.*/, namespace: "ws" }, async (args) => {
        const contents = await fs.readTextFile(args.path);
        return { contents, loader: loaderFor(args.path), resolveDir: dirname(args.path) };
      });
    },
  };

  const result = await esbuild.build({
    entryPoints: ["src/main.tsx"],
    bundle: true,
    splitting: true,
    write: false,
    format: "esm",
    target: ["es2020"],
    jsx: "automatic",
    minify: !options.dev,
    sourcemap: false,
    legalComments: "none",
    define: { "process.env.NODE_ENV": '"production"' },
    outdir: "src",
    entryNames: "bundle",
    chunkNames: "chunks/chunk-[hash]",
    assetNames: "assets/[name]",
    logLevel: "warning",
    plugins: [plugin],
  });

  const written = [];
  for (const file of result.outputFiles) {
    await fs.writeFile(file.path, file.contents);
    written.push({ path: file.path, bytes: file.contents.length });
  }
  await esbuild.stop();
  return { written, unresolved: [...new Set(unresolved)] };
}
