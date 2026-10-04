/* auto-copy.mjs — every text editable: finds hard-coded words, keys them, rewrites sources to ct().
   Run from the agent workspace, then rebuild (see README). Idempotent. */

const PAGES_DIR = "src/pages/";
const COMPONENTS_DIR = "src/components/";

/* Which page-text group a file's words belong to (see COPY_PAGES in copy.ts). */
const PAGE_OF_FILE = {
  "Home.tsx": "home",
  "About.tsx": "about",
  "Locations.tsx": "locations",
  "Sermons.tsx": "sermons",
  "SermonDetail.tsx": "sermon",
  "WatchLive.tsx": "live",
  "liveclock.tsx": "live",
  "Events.tsx": "events",
  "Testimonies.tsx": "testimonies",
  "Giving.tsx": "giving",
  "Prayer.tsx": "prayer",
  "Contact.tsx": "contact",
  "Visit.tsx": "visit",
  "Devotional.tsx": "devotional",
  "Ministries.tsx": "ministries",
  "Library.tsx": "library",
  "NotFound.tsx": "site",
};

/* Files the office must never be handed (its own tools). */
const SKIP_FILES = new Set([PAGES_DIR + "Admin.tsx", COMPONENTS_DIR + "editor.tsx", COMPONENTS_DIR + "ErrorBoundary.tsx"]);

/* Attribute literals that are read by a visitor, never by the code. */
const TEXT_ATTRS = new Set([
  "label", "placeholder", "title", "aria-label", "ariaLabel", "alt", "hint", "eyebrow",
  "lede", "text", "sub", "caption", "emptyText", "helpText",
]);

/* Attributes whose value is markup or logic, never words to reword. */
const LOGIC_ATTRS = new Set([
  "className", "class", "id", "key", "to", "href", "src", "srcSet", "sizes", "type", "role", "rel",
  "target", "d", "fill", "stroke", "strokeWidth", "viewBox", "xmlns", "width", "height", "style",
  "name", "value", "variant", "size", "tone", "icon", "iconRight", "platform", "provider", "category",
  "accent", "idKey", "path", "query", "lang", "dir", "ref", "autoComplete", "inputMode", "htmlFor",
  "accept", "pattern", "min", "max", "step", "maxLength", "colSpan", "form", "method", "loading",
  "decoding", "poster", "preload", "quality", "dateTime", "tabIndex", "as", "hrefLang", "download",
]);

/* Object-literal properties whose value is display text. */
const TEXT_KEYS = new Set(["label", "title", "sub", "text", "hint", "tip", "caption", "note", "body", "group", "description", "message"]);

/* Object-literal properties that are logic, never display text. */
const LOGIC_KEYS = new Set([
  "id", "key", "to", "href", "src", "type", "icon", "value", "name", "slug", "path", "platform",
  "provider", "category", "accent", "variant", "tone", "size", "role", "mode", "sort", "filter",
  "target", "className", "class", "query", "color", "colour", "url", "image", "photo", "avatar",
  "currency", "format", "unit", "method", "status", "kind", "ref", "theme", "tag", "tags", "cmd",
  "hash", "day", "minutes", "amount", "pct", "lat", "lng", "step", "min", "max", "at", "by", "as",
]);

/* Functions whose string arguments are logic (selectors, keys, ids …). */
const LOGIC_CALLEES = new Set([
  "console", "log", "warn", "error", "info", "debug", "querySelector", "querySelectorAll",
  "getElementById", "getElementsByClassName", "getElementsByTagName", "setItem", "getItem",
  "removeItem", "createElement", "addEventListener", "removeEventListener", "dispatchEvent",
  "setAttribute", "getAttribute", "removeAttribute", "hasAttribute", "includes", "startsWith",
  "endsWith", "indexOf", "lastIndexOf", "includes", "match", "matchAll", "test", "exec",
  "replace", "replaceAll", "split", "padStart", "padEnd", "normalize", "localeCompare",
  "className", "createObjectURL", "revokeObjectURL", "fetch", "import", "require", "randomUUID",
  "toISOString", "getContext", "createImageBitmap", "sortBy", "debounce", "setDoc", "open",
  "postMessage", "writeText", "readText", "setProperty", "getPropertyValue",
  "useMediaQuery", "matchMedia",
]);

/* Methods that mean "this string is data, not something a visitor reads". */
const STRINGY_METHODS = new Set([
  "toLowerCase", "toUpperCase", "trim", "replace", "replaceAll", "split", "includes", "startsWith",
  "endsWith", "indexOf", "lastIndexOf", "match", "matchAll", "test", "exec", "normalize", "padStart",
  "padEnd", "slice", "substring", "charAt", "localeCompare", "concat", "join", "map", "filter",
  "some", "every", "find", "reduce", "sort",
]);

/* Markup/URL-ish tokens that are never words to reword. */
const TOKENISH = /^[a-z0-9._\-/]+$/;
const CODEY = /[\\{}<>$^&|~]/;

/* ------------------------------------------------------------------ hash */

function fnv1a(str, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function hash16(str) {
  const a = fnv1a(str, 2166136261).toString(16).padStart(8, "0");
  const b = fnv1a(str + "\u0000seed2", 2654435761).toString(16).padStart(8, "0");
  return a + b;
}

/* ------------------------------------------------------- jsx text render */

/* The handful of named entities that could appear in JSX text, plus numeric
   references. Anything left over is surfaced as a warning by the tool. */
const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0",
  mdash: "\u2014", ndash: "\u2013", hellip: "\u2026", times: "\u00d7",
  rsquo: "\u2019", lsquo: "\u2018", ldquo: "\u201c", rdquo: "\u201d",
  bull: "\u2022", middot: "\u00b7", deg: "\u00b0", copy: "\u00a9",
  reg: "\u00ae", trade: "\u2122", frac12: "\u00bd", eacute: "\u00e9",
};

function decodeEntities(value) {
  return String(value)
    .replace(/&#x([0-9a-fA-F]+);/g, (m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (m, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => (name in ENTITIES ? ENTITIES[name] : m));
}

function hasUnknownEntity(value) {
  return /&[a-zA-Z]+;/.test(String(value).replace(/&(amp|lt|gt|quot|apos|nbsp|mdash|ndash|hellip|times|rsquo|lsquo|ldquo|rdquo|bull|middot|deg|copy|reg|trade|frac12|eacute);/g, ""));
}

/* Babel's rule: drop line-leading/trailing whitespace, blank lines go, a
   newline between two words becomes a single space. */
function normalise(raw, decode) {
  const text = decode(raw);
  const lines = text.split(/\r\n|\n|\r/);
  let lastNonEmpty = 0;
  for (let i = 0; i < lines.length; i++) if (/[^ \t]/.test(lines[i])) lastNonEmpty = i;
  let out = "";
  for (let i = 0; i < lines.length; i++) {
    const isFirst = i === 0;
    const isLast = i === lines.length - 1;
    const isLastNonEmpty = i === lastNonEmpty;
    let line = lines[i].replace(/\t/g, " ");
    if (!isFirst) line = line.replace(/^ +/, "");
    if (!isLast) line = line.replace(/ +$/, "");
    if (line) {
      if (!isLastNonEmpty) line += " ";
      out += line;
    }
  }
  return out;
}

function labelOf(value) {
  const s = String(value)
    .replace(/\{\{\w+\}\}/g, "\u2026")
    .replace(/\s+/g, " ")
    .replace(/[*[\]]/g, "")
    .trim();
  if (!s) return String(value).trim();
  return s.length > 52 ? s.slice(0, 52).replace(/\s+\S*$/, "") + "\u2026" : s;
}

function tokenNameOf(expr) {
  if (expr.kind === "identifier") return expr.text;
  if (expr.kind === "property") return expr.name;
  return "v" + expr.index;
}

/* ------------------------------------------------------- what is words? */

/* Would a visitor read this as words? Used for every candidate that is not
   already obviously a display value (a label=, a hint=, a record's title). */
function looksLikeText(value) {
  const s = String(value);
  if (s.length < 2 || s.length > 400) return false;
  if (!/[A-Za-z]/.test(s)) return false;
  if (CODEY.test(s)) return false;
  if (/[A-Za-z]\(/.test(s)) return false; // scaleX(…), Math.round(…) leftovers
  if (/\(?(min|max)-(width|height)\s*:/.test(s)) return false; // a media query
  if (/:\s*\d+(\.\d+)?(px|em|rem|vh|vw|%|s|ms)\b/.test(s)) return false; // a CSS value
  if (/\.(?:[a-z]{2,5})$/i.test(s)) return false; // a file name (.ics, .txt, .jpg)
  if (/^\s*["'(\[]?\s*[/#]/.test(s)) return false;
  if (/^[a-z][a-z0-9+.-]*:/.test(s)) return false; // a scheme (tel:, mailto:, https:)
  if (!/\s/.test(s)) {
    if (TOKENISH.test(s)) return false; // btn-row, auto.site.x, watch-live
    if (!/^[A-Z]/.test(s) && !/[^\x00-\x7F]/.test(s)) return false; // a single lowercase word
  }
  return true;
}

/* ------------------------------------------------------------- the tool */

/* Elements whose words are a control rather than content: a button caption, a
   tooltip on a button. `<Btn>`, `<IconBtn>` and plain `<button>`, plus any
   element carrying a btn/button/cta class (`<Link className="share-btn">`). */
const BUTTON_ELEMENTS = new Set(["Btn", "IconBtn", "IconButton", "button"]);
const BUTTON_CLASS = /\b(btn|button|cta)\b/;
const HEADING_ELEMENTS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
/* Attributes a component uses for the words it puts on screen. */
const LABEL_ATTRS = new Set(["label", "aria-label", "ariaLabel"]);

/** Furniture check: button caption, page or section title (shown, not reworded). */
function roleOf(node, sf, ts) {
  let attrName = "";
  let element = null;
  let isChild = false;
  let n = node.parent;
  while (n && !ts.isSourceFile(n)) {
    if (!attrName && ts.isJsxAttribute(n)) attrName = n.name.getText(sf);
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
      element = n;
      isChild = false;
      break;
    }
    if (ts.isJsxElement(n)) {
      /* The nearest JSX element we walked up to is the one holding these words
         as a child (an attribute would have hit its opening element first). */
      element = n.openingElement;
      isChild = true;
      break;
    }
    n = n.parent;
  }
  if (!element) return undefined;
  const tag = ts.isIdentifier(element.tagName) ? element.tagName.text : element.tagName.getText(sf);
  let className = "";
  let hasTitle = false;
  if (element.attributes) {
    for (const a of element.attributes.properties) {
      if (!ts.isJsxAttribute(a)) continue;
      const name = a.name.getText(sf);
      if (name === "className" && a.initializer && ts.isStringLiteralLike(a.initializer)) className = a.initializer.text;
      if (name === "title") hasTitle = true;
    }
  }
  const isButton = BUTTON_ELEMENTS.has(tag) || BUTTON_CLASS.test(className);
  if (attrName === "title") {
    if (tag === "PageHead") return "pageTitle";
    if (tag === "SectionHeading") return "sectionTitle";
  }
  if (isButton) {
    if (LABEL_ATTRS.has(attrName)) return "button";
    if (isChild || hasTitle) return "button";
  }
  if (tag === "PageHead" && (LABEL_ATTRS.has(attrName) || attrName === "eyebrow")) return "pageTitle";
  if (tag === "SectionHeading" && (LABEL_ATTRS.has(attrName) || attrName === "eyebrow")) return "sectionTitle";
  if (isChild) {
    if (tag === "h1") return "pageTitle";
    if (HEADING_ELEMENTS.has(tag)) return "sectionTitle";
  }
  return undefined;
}

export async function run(opts = {}) {
  const dryRun = !!opts.dryRun;
  const ts = (await import("https://esm.sh/typescript@5.4.5")).default;
  const decode = decodeEntities;

  const all = (await fs.listFiles()).map((f) => f.path);
  const targets = all
    .filter((p) => p.startsWith(PAGES_DIR) || p.startsWith(COMPONENTS_DIR))
    .filter((p) => p.endsWith(".tsx") && !SKIP_FILES.has(p))
    .sort();

  const existing = await readExisting();
  const warnings = [];
  const notes = [];
  const entries = new Map(); // id -> { id, label, value, page }
  const touched = [];
  const editLog = [];
  let replaced = 0;

  for (const file of targets) {
    const code = await fs.readTextFile(file);
    const page = PAGE_OF_FILE[file.split("/").pop()] || "site";
    const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const edits = [];

    /* Never hand the office our own editing furniture (the .ed-copy span Rich
       renders, the admin chrome) — only the words of the site itself. */
    const EDIT_LAYER_ATTRS = new Set(["data-copy", "data-ed-ui"]);
    const onEditLayer = (node) => {
      let n = node;
      while (n) {
        if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && n.attributes) {
          for (const a of n.attributes.properties) {
            if (ts.isJsxAttribute(a) && EDIT_LAYER_ATTRS.has(a.name.getText(sf))) return true;
          }
        }
        n = n.parent;
      }
      return false;
    };

    const rebuildFor = (raw, value, role) => {
      /* The same words in the same file are the same line of text: one key, so
         the office rewords the site once and every copy of it follows. */
      const id = "auto." + page + "." + hash16(file + "|" + raw);
      if (!entries.has(id)) {
        const prior = existing.get(id);
        entries.set(id, {
          id,
          label: prior ? prior.label : labelOf(value),
          value: prior ? prior.value : value,
          role: role || (prior && prior.role) || undefined,
          page,
        });
      }
      return id;
    };

    /* A ct() call at module scope would be frozen before the published content
       is loaded, so only words inside a component/handler may be collected. */
    const insideFunction = (node) => {
      let n = node.parent;
      while (n && !ts.isSourceFile(n)) {
        if (
          ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) ||
          ts.isMethodDeclaration(n) || ts.isGetAccessor(n) || ts.isSetAccessor(n) || ts.isConstructorDeclaration(n)
        ) {
          return true;
        }
        n = n.parent;
      }
      return false;
    };

    /* Walk up from a candidate to decide whether its words are displayed. */
    /* Is the candidate the *value* this call works on — i.e. is there a plain
       chain of member accesses and calls from it up to `call`? A list or an
       arrow function in between means the call is not consuming these words. */
    const onValueChain = (node, call) => {
      let cur = node;
      let p = node.parent;
      while (p) {
        if (p === call) return true;
        const chain =
          ts.isPropertyAccessExpression(p) || ts.isElementAccessExpression(p) || ts.isCallExpression(p) ||
          ts.isParenthesizedExpression(p) || ts.isNonNullExpression(p) || ts.isAsExpression(p);
        if (!chain) return false;
        if (!ts.isParenthesizedExpression(p) && !ts.isNonNullExpression(p) && !ts.isAsExpression(p) && p.expression !== cur) return false;
        cur = p;
        p = p.parent;
      }
      return false;
    };

    const classify = (node) => {
      const why = (r) => { if (opts.debug === file) notes.push("why " + JSON.stringify(node.text.slice(0, 40)) + " -> " + r); return null; };
      const parent = node.parent;
      if (ts.isJsxAttribute(parent) && parent.initializer === node) {
        const name = parent.name.getText(sf);
        if (LOGIC_ATTRS.has(name)) return null;
        if (TEXT_ATTRS.has(name)) return "jsxAttr";
        return looksLikeText(node.text) ? "jsxAttr" : null;
      }
      if (ts.isPropertyAssignment(parent) && parent.initializer === node) {
        const key = ts.isIdentifier(parent.name) || ts.isStringLiteral(parent.name) ? parent.name.text : "";
        if (TEXT_KEYS.has(key)) return "prop";
        if (LOGIC_KEYS.has(key)) return null;
        return looksLikeText(node.text) ? "prop" : null;
      }
      let n = parent;
      let inLogicAttr = false;
      let rendered = false; // the literal sits straight in JSX, so it is printed
      let sawCall = false; // …but a function call in between means it is an argument
      let childSeen = false; // only the innermost JSX child expression decides
      const nodeStart = node.getStart(sf);
      const nodeEnd = node.getEnd(sf);
      while (n && !ts.isSourceFile(n)) {
        if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n) || ts.isModuleDeclaration(n)) return why("import");
        if (ts.isTypeNode(n) || ts.isTypeAliasDeclaration(n) || ts.isInterfaceDeclaration(n)) return why("type");
        if (ts.isTemplateExpression(n) || ts.isTemplateSpan(n)) return why("template");
        if (ts.isCallExpression(n) || ts.isNewExpression(n)) sawCall = true;
        if (ts.isJsxExpression(n) && (ts.isJsxElement(n.parent) || ts.isJsxFragment(n.parent)) && !childSeen) {
          rendered = !sawCall;
          childSeen = true;
        }
        if (ts.isJsxAttribute(n)) {
          const name = n.name.getText(sf);
          if (LOGIC_ATTRS.has(name)) inLogicAttr = true; // e.g. the subject line inside href={mailto(…)}
        }
        if (ts.isBinaryExpression(n)) {
          /* `cond && <Thing label="Go" />`, `x || "Fallback"` and `v ?? "—"`
             are just conditional rendering — walk on so the words inside are
             still collected. A comparison (`kind === "video"`) or arithmetic
             (`count + " items"`) is logic/prose the office must never touch. */
          const op = n.operatorToken.kind;
          const logical =
            op === ts.SyntaxKind.AmpersandAmpersandToken ||
            op === ts.SyntaxKind.BarBarToken ||
            op === ts.SyntaxKind.QuestionQuestionToken;
          if (!logical) return why("binary");
        }
        if (ts.isCaseClause(n) || ts.isSwitchStatement(n)) return why("switch");
        if (ts.isPropertyAccessExpression(n) && n.name === node) return why("propName");
        if (ts.isElementAccessExpression(n) && n.argumentExpression === node) return why("elementAccess");
        if (ts.isNewExpression(n)) return why("new");
        if (ts.isCallExpression(n)) {
          const callee = n.expression;
          /* Only a call that *consumes* these words says something about them:
             `"text".toLowerCase()` and `f("key")` do, but the `.map(…)` and
             `.filter(…)` sitting above a list of strings do not. */
          const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : "";
          if (LOGIC_CALLEES.has(name) && (n.arguments.includes(node) || onValueChain(node, n))) return why("call:" + name);
          if (STRINGY_METHODS.has(name) && onValueChain(node, n)) return why("chain:" + name);
        }
        n = n.parent;
      }
      /* Inside a link's own attributes only something that reads like a
         sentence can be words for the office (never a URL, id or token). */
      if (inLogicAttr && !(/\s/.test(node.text) && !/^[\w.-]*\/\/|^\//.test(node.text))) return why("logicAttr");
      /* Printed straight into the page: even a lone lower-case word counts
         ("items", "one-time"), because a visitor reads it. */
      if (rendered && node.text.trim().length > 1 && !CODEY.test(node.text) && !/\.(?:[a-z]{2,5})$/i.test(node.text)) return "expr";
      return looksLikeText(node.text) ? "expr" : why("notText r=" + rendered + " c=" + sawCall + " la=" + inLogicAttr);
    };

    /* A template is only collected when every hole is a plain value (so the
       wording can be stored as {{name}}) and the words around it are words. */
    const templateCopy = (node, inLogicAttr) => {
      const spans = node.templateSpans;
      const used = new Map(); // token -> expression source
      const vars = [];
      let value = node.head.text;
      let holes = 0;
      for (const span of spans) {
        const exprText = span.expression.getText(sf);
        if (/["'`]/.test(exprText)) return null;
        if (/(=>|\bfunction\b|\bawait\b|\byield\b|\.map\(|\.filter\(|\.join\(|\bslice\(|\breplace\()/.test(exprText)) return null;
        if (exprText.length > 60) return null;
        let name = "";
        if (ts.isIdentifier(span.expression)) name = span.expression.text;
        else if (ts.isPropertyAccessExpression(span.expression) && ts.isIdentifier(span.expression.name)) name = span.expression.name.text;
        if (name && used.has(name) && used.get(name) !== exprText) name = "";
        if (!name) name = "v" + holes;
        used.set(name, exprText);
        vars.push({ name, expr: exprText });
        value += "{{" + name + "}}";
        value += span.literal.text;
        holes++;
      }
      if (!holes) return null;
      const plain = value.replace(/\{\{\w+\}\}/g, "X");
      if (!looksLikeText(plain)) return null;
      if (!/[A-Za-z]{2,}/.test(value.replace(/\{\{\w+\}\}/g, ""))) return null; // purely built from values (or a lone "d")
      /* Class names and CSS values are built the same way, but they never carry
         words: reject the ones that are hyphenated or end in a dash. */
      const parts = [node.head.text, ...spans.map((s) => s.literal.text)];
      if (parts.some((p) => p.includes("--") || /(\w-|-\w)/.test(p) || /(^| )-\s*$/.test(p) || /^\s*-(\s|$)/.test(p))) return null;
      /* Inside href/src/className/style only a sentence can be a line of copy. */
      if (inLogicAttr && !/\s/.test(plain)) return null;
      return { value, vars };
    };

    const visit = (node) => {
      if (ts.isJsxText(node)) {
        const raw = node.getText(sf);
        const value = normalise(raw, decode);
        if (/[A-Za-z]/.test(value) && value.trim() && !onEditLayer(node)) {
          if (/[*[\]]/.test(value)) warnings.push({ file, raw: value.slice(0, 60), why: "markup characters" });
          if (hasUnknownEntity(raw)) warnings.push({ file, raw: raw.trim().slice(0, 60), why: "unresolved entity" });
          const id = rebuildFor(raw, value, roleOf(node, sf, ts));
          edits.push({ start: node.getStart(sf), end: node.getEnd(sf), text: "{ct(" + JSON.stringify(id) + ")}" });
        }
      } else if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteralLike(node.initializer)) {
        const prop = node.name.getText(sf);
        if (TEXT_ATTRS.has(prop) && !onEditLayer(node)) {
          const raw = node.initializer.getText(sf);
          const value = decode(node.initializer.text);
          if (/[A-Za-z]/.test(value) && value.trim()) {
            if (hasUnknownEntity(node.initializer.text)) warnings.push({ file, raw: node.initializer.text.slice(0, 60), why: "unresolved entity (" + prop + ")" });
            const id = rebuildFor(raw, value, roleOf(node.initializer, sf, ts));
            edits.push({ start: node.initializer.getStart(sf), end: node.initializer.getEnd(sf), text: "{ct(" + JSON.stringify(id) + ")}" });
          }
        }
      } else if (ts.isTemplateExpression(node)) {
        const existingCall = ts.isCallExpression(node.parent) && ts.isIdentifier(node.parent.expression) && node.parent.expression.text === "ct";
        if (!existingCall && insideFunction(node) && !onEditLayer(node)) {
          const parentCall = node.parent;
          const stringy = ts.isCallExpression(parentCall) && ts.isPropertyAccessExpression(parentCall.expression) && (STRINGY_METHODS.has(parentCall.expression.name.text) || LOGIC_CALLEES.has(parentCall.expression.name.text));
          if (!stringy) {
            const owner = jsxAttrNameFor(node, sf, ts);
            const found = templateCopy(node, !!(owner && LOGIC_ATTRS.has(owner)));
            if (found) {
              const id = rebuildFor(node.getText(sf), found.value, roleOf(node, sf, ts));
              const args = found.vars.map((v) => JSON.stringify(v.name) + ": " + v.expr).join(", ");
              edits.push({ start: node.getStart(sf), end: node.getEnd(sf), text: "ct(" + JSON.stringify(id) + ", { " + args + " })" });
            }
          }
        }
      } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        const inCt = ts.isCallExpression(node.parent) && ts.isIdentifier(node.parent.expression) && node.parent.expression.text === "ct";
        const isAttrName = ts.isJsxAttribute(node.parent);
        /* A literal that is a display property's value is handled below, so it
           is not collected twice (which would invent a second, unused key). */
        const propOwner = ts.isPropertyAssignment(node.parent) && node.parent.initializer === node
          ? (ts.isIdentifier(node.parent.name) || ts.isStringLiteral(node.parent.name) ? node.parent.name.text : "")
          : "";
        if (!inCt && !isAttrName && !TEXT_KEYS.has(propOwner) && insideFunction(node) && !onEditLayer(node)) {
          const kind = classify(node);
          if (opts.debug === file) notes.push("L" + sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + " candidate " + JSON.stringify(node.text.slice(0, 50)) + " -> " + kind);
          if (kind) {
            const raw = node.getText(sf);
            const value = ts.isStringLiteral(node) ? decode(node.text) : node.text;
            if (kind === "prop" || /[A-Za-z]/.test(value)) {
              const id = rebuildFor(raw, value, roleOf(node, sf, ts));
              /* This branch is always an expression position (a direct
                 attribute string is handled above), so the braces are already
                 there — never wrap it in another pair. */
              edits.push({ start: node.getStart(sf), end: node.getEnd(sf), text: "ct(" + JSON.stringify(id) + ")" });
            }
          }
        } else if (opts.debug === file) {
          notes.push("L" + sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + " guarded " + JSON.stringify(node.text.slice(0, 50)) + " attr=" + isAttrName + " textKey=" + TEXT_KEYS.has(propOwner) + " inCt=" + inCt + " fn=" + insideFunction(node));
        }
      } else if (ts.isPropertyAssignment(node) && node.initializer && ts.isStringLiteralLike(node.initializer)) {
        const prop = ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : "";
        if (TEXT_KEYS.has(prop) && ts.isObjectLiteralExpression(node.parent) && insideFunction(node)) {
          const value = decode(node.initializer.text);
          if (/[A-Za-z]/.test(value) && value.trim()) {
            const raw = node.initializer.getText(sf);
            const id = rebuildFor(raw, value);
            edits.push({ start: node.initializer.getStart(sf), end: node.initializer.getEnd(sf), text: "ct(" + JSON.stringify(id) + ")" });
          }
        }
      } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "ct") {
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteral(arg) && arg.text.startsWith("auto.")) {
          const id = arg.text;
          if (!entries.has(id)) {
            const prior = existing.get(id);
            /* The enclosing element is the truth about a role, so a fresh
               reading beats whatever the previous run recorded. */
            if (prior) entries.set(id, { ...prior, role: roleOf(node, sf, ts) || prior.role });
            else warnings.push({ file, raw: id, why: "unknown auto key (no default recorded)" });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);

    if (!edits.length) continue;
    replaced += edits.length;
    edits.sort((a, b) => b.start - a.start);
    /* Overlapping edits (a template and something inside it) would corrupt the
       file — the outer one wins, the inner one is dropped. */
    const kept = [];
    let lastStart = Infinity;
    let lastRange = "";
    for (const e of edits) {
      const range = e.start + ":" + e.end;
      if (range === lastRange) {
        warnings.push({ file, raw: code.slice(e.start, e.end).slice(0, 60), why: "collected twice (same range)" });
      } else if (e.end <= lastStart) {
        kept.push(e);
        lastStart = e.start;
        lastRange = range;
      } else {
        warnings.push({ file, raw: code.slice(e.start, e.end).slice(0, 60), why: "nested in a bigger edit" });
      }
    }
    let next = code;
    for (const e of kept) next = next.slice(0, e.start) + e.text + next.slice(e.end);
    next = ensureCtImport(next, file);
    touched.push({ file, count: kept.length });
    if (opts.dumpEdits) for (const e of kept) editLog.push([file, e.start, code.slice(e.start, e.end).replace(/\n/g, "\\n").slice(0, 140), e.text.slice(0, 90)].join("\t"));
    if (!dryRun) await fs.writeTextFile(file, next);
  }

  /* Group the entries by page, in source order. */
  const byPage = {};
  for (const e of entries.values()) {
    (byPage[e.page] = byPage[e.page] || []).push(e);
  }

  const out = renderAutoCopy(byPage);
  if (!dryRun) await fs.writeTextFile("src/data/autocopy.ts", out);
  if (opts.dumpEdits) await fs.writeTextFile(opts.dumpEdits, editLog.join("\n"));
  if (opts.debug) await fs.writeTextFile("scratch/auto-copy-debug.txt", notes.join("\n"));
  if (opts.dump) {
    await fs.writeTextFile(
      opts.dump,
      [...entries.values()]
        .map((e) => [e.id, e.page, JSON.stringify(e.value)].join("\t"))
        .join("\n")
    );
  }

  return {
    dryRun,
    filesTouched: touched.length,
    literalsClaimed: replaced,
    entries: entries.size,
    perPage: Object.fromEntries(Object.entries(byPage).map(([p, list]) => [p, list.length])),
    warnings: warnings.slice(0, 30),
    warningCount: warnings.length,
    bytes: out.length,
    sample: [...entries.values()].slice(0, 12).map((e) => e.id + "  " + JSON.stringify(e.value).slice(0, 50)),
  };
}

/* The nearest JSX attribute whose value contains this node (or null). */
function jsxAttrNameFor(node, sf, ts) {
  let n = node.parent;
  while (n && !ts.isSourceFile(n)) {
    if (ts.isJsxAttribute(n)) return n.name.getText(sf);
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) return null;
    n = n.parent;
  }
  return null;
}

/* Read the defaults a previous run recorded, so ids stay stable. */
async function readExisting() {
  const map = new Map();
  let text = "";
  try {
    text = await fs.readTextFile("src/data/autocopy.ts");
  } catch (err) {
    return map;
  }
  const re = /\{\s*id:\s*("(?:[^"\\]|\\.)*"),\s*label:\s*("(?:[^"\\]|\\.)*"),\s*value:\s*("(?:[^"\\]|\\.)*")(?:,\s*role:\s*("(?:[^"\\]|\\.)*"))?\s*\}/g;
  let m;
  while ((m = re.exec(text))) {
    const id = JSON.parse(m[1]);
    map.set(id, {
      id,
      label: JSON.parse(m[2]),
      value: JSON.parse(m[3]),
      role: m[4] ? JSON.parse(m[4]) : undefined,
      page: id.split(".")[1] || "site",
    });
  }
  return map;
}

function ensureCtImport(code, file) {
  if (/import\s*\{[^}]*\bct\b[^}]*\}\s*from\s*"[^"]*data\/copy"/.test(code)) return code;
  const lines = code.split("\n");
  let at = -1;
  for (let i = 0; i < Math.min(lines.length, 60); i++) if (/^import\s/.test(lines[i])) at = i;
  const rel = file.startsWith(PAGES_DIR) || file.startsWith(COMPONENTS_DIR) ? "../data/copy" : "./data/copy";
  if (at === -1) return `import { ct } from "${rel}";\n` + code;
  lines.splice(at + 1, 0, `import { ct } from "${rel}";`);
  return lines.join("\n");
}

function renderAutoCopy(byPage) {
  const head = [
    "/* ============================================================================",
    "   autocopy.ts — GENERATED by src/tools/auto-copy.mjs. Do not edit by hand.",
    "",
    "   The small words that used to be hard-coded in the components (labels,",
    "   placeholders, button captions, tooltips, little messages, the labels the",
    "   code builds itself). Each one has a stable key and its shipped wording;",
    "   copy.ts merges them into COPY_PAGES, so the office can edit them exactly",
    "   like the hand-written page text. Re-run the tool after adding new literal",
    "   text to a page or a component, then rebuild.",
    "   ========================================================================== */",
    "",
    'import type { CopyEntry } from "./copy";',
    "",
    "export const AUTO_ENTRIES: Record<string, CopyEntry[]> = {",
  ];
  const order = ["home", "about", "locations", "sermons", "sermon", "live", "events", "testimonies", "giving", "prayer", "contact", "visit", "devotional", "ministries", "library", "site"];
  const keys = [...new Set([...order.filter((k) => byPage[k]), ...Object.keys(byPage)])];
  const body = [];
  for (const key of keys) {
    body.push("  " + JSON.stringify(key) + ": [");
    for (const e of byPage[key]) {
      const role = e.role ? ", role: " + JSON.stringify(e.role) : "";
      body.push(
        "    { id: " + JSON.stringify(e.id) + ", label: " + JSON.stringify(e.label) + ", value: " + JSON.stringify(e.value) + role + " },"
      );
    }
    body.push("  ],");
  }
  body.push("};", "");
  return head.concat(body).join("\n");
}
