import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";

const CDN = "https://esm.sh";

const BARE = {
  react: "/react@18.3.1?bundle",
  "react/jsx-runtime": "/react@18.3.1/jsx-runtime?bundle",
  "react-dom": "/react-dom@18.3.1?bundle&external=react",
  "react-dom/client": "/react-dom@18.3.1/client?bundle&external=react",
  "framer-motion": "/framer-motion@11.11.9?bundle&external=react,react-dom",
  "qrcode-generator": "/qrcode-generator@1.4.4?bundle",
  "swiper": "/swiper@14.3.0?bundle",
  "swiper/modules": "/swiper@14.3.0/modules?bundle",
  three: "/three@0.170.0/es2022/three.mjs",
  "@react-three/fiber": "/@react-three/fiber@8.18.0?bundle&external=react,react-dom&deps=three@0.170.0",
  "@react-three/drei/web/Html": "/@react-three/drei@9.122.0/web/Html?bundle&external=react,react-dom,@react-three/fiber,three&deps=three@0.170.0,@react-three/fiber@8.18.0",
  "@react-three/drei/core/Sparkles": "/@react-three/drei@9.122.0/core/Sparkles?bundle&external=react,react-dom,@react-three/fiber,three&deps=three@0.170.0,@react-three/fiber@8.18.0",
};

const HTTP_CACHE_DIR = path.join(process.cwd(), ".http-cache");

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

const memCache = new Map();

async function fetchText(url) {
  if (!memCache.has(url)) {
    memCache.set(url, (async () => {
      const slot = path.join(HTTP_CACHE_DIR, hashName(url) + ".txt");
      try {
        return await readFile(slot, "utf8");
      } catch { /* miss */ }
      const res = await fetch(url);
      if (!res.ok) throw new Error(`fetch failed ${res.status} for ${url}`);
      const text = await res.text();
      try {
        await mkdir(HTTP_CACHE_DIR, { recursive: true });
        await writeFile(slot, text);
      } catch { /* best-effort */ }
      return text;
    })());
  }
  return memCache.get(url);
}

function dirname(p) {
  const i = p.lastIndexOf("/");
  return i === -1 ? "" : p.slice(0, i);
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

function loaderFor(p) {
  if (p.endsWith(".tsx")) return "tsx";
  if (p.endsWith(".ts")) return "ts";
  if (p.endsWith(".css")) return "css";
  if (p.endsWith(".json")) return "json";
  return "js";
}

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function buildSite() {
  let esbuild;
  try {
    esbuild = await import("esbuild");
  } catch {
    throw new Error("esbuild is not installed — run `npm install` first");
  }

  const plugin = {
    name: "workspace",
    setup(build) {
      build.onResolve({ filter: /.*/ }, async (args) => {
        if (args.kind === "entry-point") return { path: "src/main.tsx", namespace: "ws" };
        if (args.namespace === "http") {
          if (args.path.startsWith("/")) return { path: CDN + args.path, namespace: "http" };
          if (args.path.startsWith("http")) return { path: args.path, namespace: "http" };
          if (BARE[args.path]) return { path: CDN + BARE[args.path], namespace: "http" };
          if (args.path.startsWith(".") && args.importer && /^https?:\/\//.test(args.importer)) {
            return { path: new URL(args.path, args.importer).href, namespace: "http" };
          }
          return { path: args.path, external: true };
        }
        const base = args.resolveDir || "";
        if (args.path.startsWith(".") || args.path.startsWith("/")) {
          const target = joinPath(base, args.path.replace(/^\//, ""));
          for (const ext of CANDIDATE_EXTENSIONS) {
            if (await exists(target + ext)) return { path: target + ext, namespace: "ws" };
          }
          return { errors: [{ text: `Cannot resolve ${args.path} from ${base}` }] };
        }
        if (BARE[args.path]) return { path: CDN + BARE[args.path], namespace: "http" };
        return { path: args.path, external: true };
      });

      build.onLoad({ filter: /.*/, namespace: "http" }, async (args) => ({
        contents: await fetchText(args.path),
        loader: loaderFor(args.path),
      }));

      build.onLoad({ filter: /.*/, namespace: "ws" }, async (args) => ({
        contents: await readFile(args.path, "utf8"),
        loader: loaderFor(args.path),
        resolveDir: dirname(args.path),
      }));
    },
  };

  const result = await esbuild.build({
    entryPoints: ["src/main.tsx"],
    bundle: true,
    write: false,
    format: "esm",
    target: ["es2020"],
    jsx: "automatic",
    minify: true,
    sourcemap: false,
    legalComments: "none",
    define: { "process.env.NODE_ENV": '"production"' },
    outdir: "src",
    entryNames: "app",
    assetNames: "assets/[name]",
    logLevel: "warning",
    plugins: [plugin],
  });

  const written = [];
  for (const file of result.outputFiles) {
    await writeFile(file.path, file.contents);
    written.push({ path: file.path, bytes: file.contents.length });
  }
  await esbuild.stop();
  return written;
}
