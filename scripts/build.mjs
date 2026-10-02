import { buildSite } from "./build-lib.mjs";

const written = await buildSite();
for (const f of written) console.log("wrote", f.path, f.bytes, "bytes");
