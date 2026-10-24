/* scripts/security-report.mjs — breach-report PDF builder (pure, dependency-free).
   Turns medium+ security events into a minimal valid PDF (1.4, Helvetica) that
   the office can download whenever there is a potential breach. Used by
   scripts/security-log.mjs (GET /__security-report.pdf, admin-only). The Admin
   console has a matching client-side builder in src/lib/security.ts as a
   fallback for static hosts with no server — keep the two in sync (same line
   layout, same ASCII sanitising so xref offsets stay exact).
*/

const BREACH_SEV = new Set(["medium", "high", "critical"]);

/* Potential breaches only: info/low are routine noise. Oldest first. */
export function breachEvents(ring, limit = 200) {
  try {
    const list = (Array.isArray(ring) ? ring : []).filter((e) => e && BREACH_SEV.has(e.severity));
    list.sort((a, b) => (a.at || 0) - (b.at || 0));
    return list.slice(-limit);
  } catch { return []; }
}

export function reportFilename(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `security-breach-report-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.pdf`;
}

function clean(s, max) {
  let out = String(s == null ? "" : s).replace(/[\r\n\t]+/g, " ").replace(/[^\x20-\x7E]/g, "?").trim().replace(/\s+/g, " ");
  if (out.length > max) out = out.slice(0, Math.max(0, max - 3)) + "...";
  return out;
}

function wrap(s, width) {
  const words = String(s).split(" ").filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? cur + " " + w : w;
    if (next.length > width) { if (cur) lines.push(cur); cur = w.length > width ? w.slice(0, width) : w; }
    else cur = next;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

function esc(s) {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/* events: breach-filtered list (each {at,time,service,origin,online,source,
   severity,rule,kind,msg,detail,ip,hint}); meta: {service,online,counts}. */
export function buildBreachPdf(events, meta = {}) {
  const evs = Array.isArray(events) ? events : [];
  const counts = meta.counts || {};
  const when = new Date().toString().slice(0, 33);

  const title = [{ text: "Security breach report", font: "F2", size: 16 }];
  const head = [
    { text: `Generated: ${when}  ·  Service: ${clean(meta.service || "server", 20)}  ·  Live deploy: ${meta.online ? "online" : "offline / local only"}`, font: "F1", size: 10 },
    { text: `Potential breaches — medium: ${counts.medium || 0}, high: ${counts.high || 0}, critical: ${counts.critical || 0} (blocked requests: ${counts.blocked || 0}; info/low omitted)`, font: "F1", size: 10 },
    { text: "", font: "F1", size: 10 },
  ];
  const body = [];
  if (!evs.length) {
    body.push({ text: "No potential breaches recorded — quiet. Nothing to download urgently.", font: "F1", size: 10 });
  }
  evs.forEach((e, i) => {
    const tag = e.origin === "live" ? "[live]" : "[local]";
    const net = e.online === true ? "online" : "offline";
    const what = clean(`${e.rule || e.kind || e.source || "event"}`, 40);
    const msg = clean(e.msg || e.detail || "", 140);
    body.push({ text: `#${i + 1} ${clean(e.time || "", 20)} ${tag} ${net} [${String(e.severity || "?").toUpperCase()}] ${clean(e.source || "?", 16)} ${what} ip=${clean(e.ip || "unknown", 40)}`, font: "F2", size: 10 });
    for (const l of wrap(msg, 95)) body.push({ text: "    " + l, font: "F1", size: 10 });
    const hint = clean(e.hint || "", 220);
    if (hint) for (const l of wrap("Hint: " + hint, 95)) body.push({ text: "    " + l, font: "F1", size: 10 });
    body.push({ text: "", font: "F1", size: 10 });
  });
  body.push({ text: "Full real-time feed: the `npm run dev` terminal, logs/security-events.jsonl, and Admin -> Tools -> Security watch.", font: "F1", size: 10 });

  const all = [...title, ...head, ...body];
  // Paginate: title block counts triple (larger type), 54 rows per A4 page.
  const pages = [];
  let cur = [], used = 0;
  for (const ln of all) {
    const cost = ln.size > 10 ? 3 : 1;
    if (used + cost > 54 && cur.length) { pages.push(cur); cur = []; used = 0; }
    cur.push(ln); used += cost;
  }
  if (cur.length) pages.push(cur);

  const out = [];
  const offsets = [0];
  out.push("%PDF-1.4\n");
  let nextId = 1;
  const catalogId = nextId++;
  const pagesId = nextId++;
  const fontRegId = nextId++;
  const fontBoldId = nextId++;
  const pageIds = [];
  const contentOf = [];
  for (let i = 0; i < pages.length; i++) { pageIds.push(nextId++); contentOf.push(nextId++); }

  const addObj = (id, bodyStr) => {
    offsets[id] = out.join("").length;
    out.push(`${id} 0 obj\n${bodyStr}\nendobj\n`);
  };
  addObj(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  addObj(pagesId, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
  addObj(fontRegId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  addObj(fontBoldId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  pages.forEach((lines, pi) => {
    const parts = ["BT"];
    let y = 770;
    for (const ln of lines) {
      parts.push(`/${ln.font} ${ln.size} Tf 50 ${y} Td (${esc(ln.text)}) Tj`);
      y -= ln.size > 10 ? 22 : 13;
    }
    parts.push("ET");
    const stream = parts.join("\n") + "\n";
    addObj(pageIds[pi], `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontRegId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentOf[pi]} 0 R >>`);
    offsets[contentOf[pi]] = out.join("").length;
    const header = `${contentOf[pi]} 0 obj\n<< /Length ${stream.length} >>\nstream\n`;
    out.push(header + stream + "endstream\nendobj\n");
  });

  const count = nextId;
  const xrefAt = out.join("").length;
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let id = 1; id < count; id++) xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  out.push(xref + `trailer\n<< /Size ${count} /Root ${catalogId} 0 R >>\nstartxref\n${xrefAt}\n%%EOF`);
  const pdf = out.join("");
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}
