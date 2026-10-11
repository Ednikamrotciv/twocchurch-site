
/* ============================================================================
   World Overcomers — content server for #/admin

   This block is PUBLIC source. It holds no plaintext secret: the admin
   password exists here only as a SHA-256 hash. The password itself was
   generated with 40 hex chars of entropy and handed to the church office
   privately (see src/README.md: "Changing the admin password").

   WHY IT LOOKS LIKE THIS
   ----------------------
   Handlers get 50 ms of CPU and the runtime is an interpreter, so every byte
   written has to be earned. Measured on this server: JSON.parse is native and
   cheap (~2 ms per 100 KB), but a per-character encode loop costs about
   0.45 us per character. Therefore:

     * Content is stored as ONE BLOB PER SECTION, so publishing an edited
       section only re-encodes that section (usually a few KB, not the whole
       website).
     * Blobs are UTF-16 code units written straight into a Uint16Array view -
       no multi-byte branching, and no TextEncoder (the runtime has neither
       TextEncoder nor TextDecoder).
     * Only sections the office has actually edited are stored here. Anything
       else falls back to the content shipped with the site.

   DURABLE STATE LAYOUT  (state = zero-initialized Uint8Array, kept forever)

     bytes 0        magic 0xC7
     bytes 1        format version (2)
     bytes 2..5     revision              uint32 BE
     bytes 6..13    published at          float64 BE (ms since epoch)
     bytes 14..17   meta length           uint32  (code units)
     bytes 18..21   reserved
     bytes 22..25   section count         uint32
     bytes 26..29   section chars         uint32  (code units, all blobs)
     bytes 30..33   reserved
     bytes 34..     section index: 64 slots x 48 bytes
                      +0  id length (uint16)
                      +2  offset    (uint32, code units from BASE_CHARS)
                      +6  length    (uint32, code units)
                      +10 id bytes  (ASCII, <= 32 chars)

     then section blobs packed in index order (UTF-16 code units) from
     BASE_CHARS (= HEADER / 2), followed by the meta blob (UTF-16):
     JSON { by, log: [ {rev, at, by, note, changed} ], logWiped }.

   When a blob grows or shrinks the tail moves, which is done with
   Uint16Array.copyWithin (a native memmove).
   ========================================================================== */

var MAGIC = 0xc7;
var FMT = 2;
var SLOTS = 64;
var REC = 48;
var HEADER = 34 + SLOTS * REC;
var BASE_CHARS = HEADER / 2;
var MAX_SECTION_CHARS = 200000;
var MAX_LOG = 20;
/* History generation: states stamped with an older generation drop their
   publish log the first time this code loads, then record again. */
var LOG_GEN = 3;
var AUTH_WINDOW = 600000;

/* Sub-admins and one-time invite codes live in the meta blob beside the
   publish log (see writeMeta): a handful of tiny records, so every publish
   re-encodes them for free. Only SHA-256 hashes are ever stored — a password
   or invite code is checked by hashing what the caller sent and comparing. */
/* Main-password sign-in can be retired once named sub-admins exist (the office
   password is shared, sub-admins are not). MAIN_OFF never locks everyone out:
   switching it off needs a sub-admin to exist, deleting the last sub-admin or
   revoking the last invite while it is off is refused, and any signed-in
   sub-admin can switch it back on. */
var MAIN_OFF = false;
var MAX_SUBS = 20;
var MAX_INVITES = 20;
var INVITE_MS = 7 * 24 * 60 * 60 * 1000;

/* SHA-256 of the admin password (hex). Generated at build time; the plaintext
   never appears in this source. */
var ADMIN_HASH = "ef797c8118f02dfb649607dd5d3f8c7623048c9c063d532cc95c5ed7a898a64f";

/* A changed main password is stored as a hash override in the meta blob (see
   writeMeta) — the shipped hash above stays as the fallback. Only the hash is
   ever stored, never the password itself. */

/* How many times the main password has changed. Reported with every sign-in
   and content answer so a browser holding the old password signs itself out
   the moment it hears a newer number — no reload, no confusion. */
var PWGEN = 0;
var MAIN_HASH = "";

/* ------------------------------------------------------------------- views */

function dv() {
  return new DataView(state.buffer, state.byteOffset, state.byteLength);
}
function u16() {
  return new Uint16Array(state.buffer, state.byteOffset, state.byteLength >> 1);
}

/* ------------------------------------------------------------------ utf-8 */

/* Only used to hash the (short) admin password. */
function utf8Bytes(str) {
  var out = new Uint8Array(str.length * 3);
  var n = 0;
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    if (c < 0x80) {
      out[n++] = c;
    } else if (c < 0x800) {
      out[n++] = 0xc0 | (c >> 6);
      out[n++] = 0x80 | (c & 63);
    } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      var c2 = str.charCodeAt(i + 1);
      if (c2 >= 0xdc00 && c2 <= 0xdfff) {
        var cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
        out[n++] = 0xf0 | (cp >> 18);
        out[n++] = 0x80 | ((cp >> 12) & 63);
        out[n++] = 0x80 | ((cp >> 6) & 63);
        out[n++] = 0x80 | (cp & 63);
        i++;
      } else {
        out[n++] = 0xef;
        out[n++] = 0xbf;
        out[n++] = 0xbd;
      }
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      out[n++] = 0xef;
      out[n++] = 0xbf;
      out[n++] = 0xbd;
    } else {
      out[n++] = 0xe0 | (c >> 12);
      out[n++] = 0x80 | ((c >> 6) & 63);
      out[n++] = 0x80 | (c & 63);
    }
  }
  return out.subarray(0, n);
}

/* ------------------------------------------------- sha-1 (for totp) */

function sha1Bytes(msg) {
  var H = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  var bitLen = msg.length * 8;
  var len = msg.length + 9;
  while (len % 64 !== 0) len++;
  var buf = new Uint8Array(len);
  buf.set(msg, 0);
  buf[msg.length] = 0x80;
  var hi = Math.floor(bitLen / 4294967296);
  var lo = bitLen >>> 0;
  buf[len - 8] = (hi >>> 24) & 255;
  buf[len - 7] = (hi >>> 16) & 255;
  buf[len - 6] = (hi >>> 8) & 255;
  buf[len - 5] = hi & 255;
  buf[len - 4] = (lo >>> 24) & 255;
  buf[len - 3] = (lo >>> 16) & 255;
  buf[len - 2] = (lo >>> 8) & 255;
  buf[len - 1] = lo & 255;
  var off, i, w, a, b, c, d, e, f, k, t, x;
  for (off = 0; off < len; off += 64) {
    w = new Array(80);
    for (i = 0; i < 16; i++) {
      w[i] = (buf[off + i * 4] << 24) | (buf[off + i * 4 + 1] << 16) | (buf[off + i * 4 + 2] << 8) | buf[off + i * 4 + 3];
    }
    for (i = 16; i < 80; i++) {
      x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
      w[i] = (x << 1) | (x >>> 31);
    }
    a = H[0];
    b = H[1];
    c = H[2];
    d = H[3];
    e = H[4];
    for (i = 0; i < 80; i++) {
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      t = ((((a << 5) | (a >>> 27)) + f + e + k + w[i]) | 0) >>> 0;
      e = d >>> 0;
      d = c >>> 0;
      c = ((b << 30) | (b >>> 2)) >>> 0;
      b = a >>> 0;
      a = t;
    }
    H[0] = (H[0] + a) | 0;
    H[1] = (H[1] + b) | 0;
    H[2] = (H[2] + c) | 0;
    H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0;
  }
  var out = new Uint8Array(20);
  for (i = 0; i < 5; i++) {
    var h = H[i] >>> 0;
    out[i * 4] = (h >>> 24) & 255;
    out[i * 4 + 1] = (h >>> 16) & 255;
    out[i * 4 + 2] = (h >>> 8) & 255;
    out[i * 4 + 3] = h & 255;
  }
  return out;
}

function hmacSha1(key, msg) {
  var k = key.length > 64 ? sha1Bytes(key) : key;
  var block = new Uint8Array(64);
  for (var i = 0; i < k.length; i++) block[i] = k[i];
  var ipad = new Uint8Array(64);
  var opad = new Uint8Array(64);
  for (i = 0; i < 64; i++) {
    ipad[i] = block[i] ^ 0x36;
    opad[i] = block[i] ^ 0x5c;
  }
  var inner = new Uint8Array(64 + msg.length);
  inner.set(ipad, 0);
  inner.set(msg, 64);
  var mid = sha1Bytes(inner);
  var outer = new Uint8Array(84);
  outer.set(opad, 0);
  outer.set(mid, 64);
  return sha1Bytes(outer);
}

var B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Decode(s) {
  var acc = 0;
  var bits = 0;
  var out = [];
  for (var i = 0; i < s.length; i++) {
    var v = B32_ALPHABET.indexOf(s.charAt(i));
    if (v < 0) return null;
    acc = acc * 32 + v;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push(Math.floor(acc / Math.pow(2, bits)) & 255);
      acc = acc % Math.pow(2, bits);
    }
  }
  return out;
}

/* Six-digit authenticator code for a base32 secret at a 30-second step. */
function hotpCode(key, counter) {
  var msg = new Uint8Array(8);
  var c = counter;
  for (var i = 7; i >= 0; i--) {
    msg[i] = c % 256;
    c = Math.floor(c / 256);
  }
  var h = hmacSha1(key, msg);
  var o = h[19] & 15;
  var v = ((h[o] & 127) * 16777216) + (h[o + 1] * 65536) + (h[o + 2] * 256) + h[o + 3];
  var s = String(v % 1000000);
  while (s.length < 6) s = "0" + s;
  return s;
}

/* True when `code` is the current, previous or next 30-second code — the
   slack covers phone/server clock drift either way. */
function totpCheck(secret, code) {
  if (typeof secret !== "string" || !/^[A-Z2-7]{32}$/.test(secret)) return false;
  if (typeof code !== "string" || !/^[0-9]{6}$/.test(code)) return false;
  var key = base32Decode(secret);
  if (!key || !key.length) return false;
  var step = Math.floor(Date.now() / 30000);
  for (var d = -1; d <= 1; d++) {
    if (hotpCode(key, step + d) === code) return true;
  }
  return false;
}

/* ---------------------------------------------------------------- sha-256 */

function sha256Hex(input) {
  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

  var msg = utf8Bytes(input);
  var len = msg.length;
  var total = ((len + 9 + 63) >> 6) << 6;
  var buf = new Uint8Array(total);
  buf.set(msg, 0);
  buf[len] = 0x80;
  var bits = len * 8;
  var hi = Math.floor(bits / 4294967296);
  var lo = bits >>> 0;
  buf[total - 8] = (hi >>> 24) & 255;
  buf[total - 7] = (hi >>> 16) & 255;
  buf[total - 6] = (hi >>> 8) & 255;
  buf[total - 5] = hi & 255;
  buf[total - 4] = (lo >>> 24) & 255;
  buf[total - 3] = (lo >>> 16) & 255;
  buf[total - 2] = (lo >>> 8) & 255;
  buf[total - 1] = lo & 255;

  var w = new Uint32Array(64);
  for (var chunk = 0; chunk < total; chunk += 64) {
    for (var t = 0; t < 16; t++) {
      var p = chunk + t * 4;
      w[t] = ((buf[p] << 24) | (buf[p + 1] << 16) | (buf[p + 2] << 8) | buf[p + 3]) >>> 0;
    }
    for (t = 16; t < 64; t++) {
      var w15 = w[t - 15], w2 = w[t - 2];
      var s0 = ((w15 >>> 7) | (w15 << 25)) ^ ((w15 >>> 18) | (w15 << 14)) ^ (w15 >>> 3);
      var s1 = ((w2 >>> 17) | (w2 << 15)) ^ ((w2 >>> 19) | (w2 << 13)) ^ (w2 >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (t = 0; t < 64; t++) {
      var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      var ch = (e & f) ^ (~e & g);
      var temp1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
      var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      var maj = (a & b) ^ (a & c) ^ (b & c);
      var temp2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e;
      e = (d + temp1) >>> 0;
      d = c; c = b; b = a;
      a = (temp1 + temp2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  var hex = "";
  for (var k = 0; k < 8; k++) {
    var v = H[k].toString(16);
    hex += v.length === 8 ? v : ("00000000" + v).slice(-8);
  }
  return hex;
}

/* --------------------------------------------------------- blob read/write */

function writeString(str, charOffset) {
  var view = u16();
  for (var i = 0; i < str.length; i++) view[charOffset + i] = str.charCodeAt(i);
}

function readString(charOffset, len) {
  if (len <= 0) return "";
  var view = u16();
  var out = "";
  var CHUNK = 4096;
  for (var i = 0; i < len; i += CHUNK) {
    var end = i + CHUNK < len ? i + CHUNK : len;
    out += String.fromCharCode.apply(null, view.subarray(charOffset + i, charOffset + end));
  }
  return out;
}

/* ------------------------------------------------------------ durable state */

var REV = 0, AT = 0, BY = "";
/* The code update the published content was last blessed from (note 249:
   visitors wait on maintenance until a publish from the newest code). */
var NOTES = 0;
var LOG = [];
/* The office's latest on-air answer (note 318, memory-only): the deployed
   server cannot read YouTube itself (bot-walled datacenter IPs get a login
   wall with no live marker), but the office copy can — so a signed-in office
   tab reports each definitive answer here and visitors read it back. A
   restart clears it and the office re-reports within a poll. */
var LIVE_REPORT = null;
/* The publish before this one: {at, rev, sections} — one undo, inside about
   15 minutes of the publish (note 291). A publish always deletes the one
   before it as the live words; this copy only lives long enough to take it
   back, then clears off the server. Kept in the meta blob, so no state-layout
   change was needed. */
var PREV = null;
var UNDO_MS = 15 * 60 * 1000;
/* Set while loading a state stamped with an older history generation: the
   record is forgotten and the clean state is written back at once. */
var FRESH_GEN = false;
var INDEX = [];          /* [{id, off, len}] in packing order */
var SECTIONS = {};       /* id -> JSON string */
var META_CHARS = 0;
var SECTION_CHARS = 0;

function readIndex(view) {
  var n = view.getUint32(22, false);
  var out = [];
  for (var i = 0; i < n && i < SLOTS; i++) {
    var o = 34 + i * REC;
    var idLen = view.getUint16(o, false);
    var id = "";
    for (var c = 0; c < idLen && c < 32; c++) id += String.fromCharCode(state[o + 10 + c]);
    if (!id) continue;
    out.push({ id: id, off: view.getUint32(o + 2, false), len: view.getUint32(o + 6, false) });
  }
  return out;
}

function totalSectionChars() {
  var sum = 0;
  for (var i = 0; i < INDEX.length; i++) sum += INDEX[i].len;
  return sum;
}

function writeHeader() {
  var view = dv();
  state[0] = MAGIC;
  state[1] = FMT;
  view.setUint32(2, REV, false);
  view.setFloat64(6, AT, false);
  view.setUint32(14, META_CHARS, false);
  view.setUint32(18, 0, false);
  view.setUint32(22, INDEX.length, false);
  view.setUint32(26, SECTION_CHARS, false);
  view.setUint32(30, 0, false);
  for (var i = 0; i < INDEX.length; i++) {
    var entry = INDEX[i];
    var o = 34 + i * REC;
    view.setUint16(o, entry.id.length, false);
    view.setUint32(o + 2, entry.off, false);
    view.setUint32(o + 6, entry.len, false);
    for (var c = 0; c < entry.id.length; c++) state[o + 10 + c] = entry.id.charCodeAt(c) & 127;
  }
}

/* The previous publish only counts when it is shaped right (note 291) —
   anything else is forgotten, never restored. */
function cleanPrev(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.at !== "number" || typeof raw.rev !== "number") return null;
  var secs = raw.sections;
  if (!secs || typeof secs !== "object") return null;
  var out = {};
  var n = 0;
  for (var id in secs) {
    if (!Object.prototype.hasOwnProperty.call(secs, id)) continue;
    if (!/^[a-zA-Z][a-zA-Z0-9-]{0,31}$/.test(id)) return null;
    var v = secs[id];
    if (typeof v !== "string" || v.length > MAX_SECTION_CHARS) return null;
    try {
      var parsed = JSON.parse(v);
      if (parsed === null || typeof parsed !== "object") return null;
    } catch (e) {
      return null;
    }
    out[id] = v;
    if (++n > SLOTS) return null;
  }
  if (!n) return null;
  return { at: raw.at, rev: Math.floor(raw.rev), sections: out };
}

/* The previous publish, if still inside its ~15-minute undo window. Expired
   means forgotten on the spot (lazy expiry: enforced on every read and every
   write, so nothing expired is ever served or kept). */
function livePrev(now) {
  if (!PREV) return null;
  if (typeof PREV.at !== "number" || now - PREV.at > UNDO_MS) {
    PREV = null;
    return null;
  }
  return PREV;
}

function undoLeftSec(now) {
  var p = livePrev(now);
  if (!p) return 0;
  var left = Math.ceil((UNDO_MS - (now - p.at)) / 1000);
  return left > 0 ? left : 0;
}

function writeMeta() {
  var meta = JSON.stringify({ by: BY, log: LOG, logGen: LOG_GEN, subs: SUBS, invites: INVITES, totp: TOTP, mainOff: MAIN_OFF, mainHash: MAIN_HASH, pwgen: PWGEN, notes: NOTES, prev: PREV });
  META_CHARS = meta.length;
  writeString(meta, BASE_CHARS + SECTION_CHARS);
  /* The header carries META_CHARS: without this, an admin-only change (an
     invite, a sub-admin, two-factor) would sit in state with a stale length,
     and the next load would read a truncated blob and wipe the publish log
     with it. */
  writeHeader();
}

/* Sub-admin roster. SUBS = [{name, hash, at}], INVITES = [{name, codeHash, at}].
   Loaded from the meta blob (missing in older state means none yet), saved by
   writeMeta. Invite codes expire and are pruned whenever they are read. */
var SUBS = [];
var INVITES = [];

function validSubName(name) {
  return typeof name === "string" && /^[A-Za-z][A-Za-z0-9 .'\-]{0,39}$/.test(name);
}
function cleanSubs(raw) {
  var out = [];
  if (raw && raw.length) {
    for (var i = 0; i < raw.length && out.length < MAX_SUBS; i++) {
      var s = raw[i];
      if (s && validSubName(s.name) && typeof s.hash === "string" && /^[0-9a-f]{64}$/.test(s.hash)) {
        out.push({ name: s.name, hash: s.hash, at: typeof s.at === "number" ? s.at : 0 });
      }
    }
  }
  return out;
}
function pruneInvites(now) {
  var kept = [];
  for (var i = 0; i < INVITES.length; i++) {
    if (typeof INVITES[i].at === "number" && now - INVITES[i].at < INVITE_MS) kept.push(INVITES[i]);
  }
  INVITES = kept;
}
function cleanInvites(raw, now) {
  var out = [];
  if (raw && raw.length) {
    for (var i = 0; i < raw.length && out.length < MAX_INVITES; i++) {
      var v = raw[i];
      if (v && validSubName(v.name) && typeof v.codeHash === "string" && /^[0-9a-f]{64}$/.test(v.codeHash)) {
        if (typeof v.at === "number" && now - v.at < INVITE_MS) out.push({ name: v.name, codeHash: v.codeHash, at: v.at });
      }
    }
  }
  return out;
}
function nameTaken(name) {
  var i;
  for (i = 0; i < SUBS.length; i++) if (SUBS[i].name === name) return true;
  for (i = 0; i < INVITES.length; i++) if (INVITES[i].name === name) return true;
  return false;
}

/* Main-admin two-factor: TOTP = { secret (base32), backups ([sha256 hex]) } or
   null. The secret is made by the office's own browser (real randomness) and
   only stored after a code proves the authenticator app reads it. */
var TOTP = null;
var BACKUP_COUNT = 10;

function cleanTotp(raw) {
  if (!raw || typeof raw.secret !== "string" || !/^[A-Z2-7]{32}$/.test(raw.secret)) return null;
  var kept = [];
  if (raw.backups && raw.backups.length) {
    for (var i = 0; i < raw.backups.length && kept.length < BACKUP_COUNT; i++) {
      if (typeof raw.backups[i] === "string" && /^[0-9a-f]{64}$/.test(raw.backups[i])) kept.push(raw.backups[i]);
    }
  }
  var out = { secret: raw.secret, backups: kept };
  if (typeof raw.q === "string" && raw.q.length > 0 && raw.q.length <= 120 &&
      typeof raw.qhash === "string" && /^[0-9a-f]{64}$/.test(raw.qhash)) {
    out.q = raw.q;
    out.qhash = raw.qhash;
  }
  return out;
}
/* The way back in without the authenticator: a security question only the
   office can answer. Answers match loosely — trimmed, lowercased, whitespace
   collapsed — and only the hash is ever stored. (Single-use spare codes came
   before the question and are still honoured when present, but no new ones
   are made.) */
function normAnswer(s) {
  return String(s == null ? "" : s).trim().toLowerCase().replace(/\s+/g, " ");
}
/* "answer", "spare:<index>", or "" — never consumes anything. */
function fallbackKind(typed) {
  if (!TOTP) return "";
  if (TOTP.qhash && sha256Hex(normAnswer(typed)) === TOTP.qhash && normAnswer(typed)) return "answer";
  var cleaned = cleanCode(typed);
  if (cleaned) {
    var digest = sha256Hex(cleaned);
    for (var i = 0; i < TOTP.backups.length; i++) {
      if (TOTP.backups[i] === digest) return "spare:" + i;
    }
  }
  return "";
}
/* Authenticator and backup codes arrive typed by hand — spaces and dashes are
   formatting, not content. */
function cleanCode(s) {
  return String(s).replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function loadState() {
  if (state.length < HEADER) return;
  var view = dv();
  if (state[0] !== MAGIC || state[1] !== FMT) return;
  REV = view.getUint32(2, false);
  AT = view.getFloat64(6, false);
  META_CHARS = view.getUint32(14, false);
  INDEX = readIndex(view);
  SECTION_CHARS = totalSectionChars();
  if ((BASE_CHARS + SECTION_CHARS + META_CHARS) * 2 > state.length) {
    INDEX = [];
    META_CHARS = 0;
    SECTION_CHARS = 0;
    return;
  }
  var meta = META_CHARS ? readString(BASE_CHARS + SECTION_CHARS, META_CHARS) : "";
  try {
    var parsed = JSON.parse(meta);
    BY = typeof parsed.by === "string" ? parsed.by : "";
    /* Clean start: anything recorded under an older generation is forgotten —
       the log, the version counter and the last-published stamp — so the next
       publish is recorded as version 1 with no past. */
    if (parsed.logGen !== LOG_GEN) {
      LOG = [];
      BY = "";
      NOTES = 0; // note 301: a new history generation is unreviewed — visitors wait until the office publishes
      REV = 0;
      AT = 0;
      FRESH_GEN = true;
    } else if (parsed.log && parsed.log.length) {
      LOG = parsed.log;
    } else {
      LOG = [];
    }
    SUBS = cleanSubs(parsed.subs);
    INVITES = cleanInvites(parsed.invites, Date.now());
    TOTP = cleanTotp(parsed.totp);
    MAIN_OFF = !!(parsed && parsed.mainOff);
    MAIN_HASH = typeof parsed.mainHash === "string" && /^[0-9a-f]{64}$/.test(parsed.mainHash) ? parsed.mainHash : "";
    PWGEN = typeof parsed.pwgen === "number" && parsed.pwgen >= 0 ? Math.floor(parsed.pwgen) : 0;
    NOTES = typeof parsed.notes === "number" && parsed.notes >= 0 ? Math.floor(parsed.notes) : 0;
    PREV = cleanPrev(parsed.prev);
  } catch (e) {
    NOTES = 0;
    BY = "";
    LOG = [];
    SUBS = [];
    INVITES = [];
    TOTP = null;
    MAIN_OFF = false;
    MAIN_HASH = "";
    PWGEN = 0;
    PREV = null;
  }
  SECTIONS = {};
  for (var i = 0; i < INDEX.length; i++) {
    SECTIONS[INDEX[i].id] = readString(BASE_CHARS + INDEX[i].off, INDEX[i].len);
  }
  if (FRESH_GEN) {
    FRESH_GEN = false;
    writeMeta();
    writeHeader();
  }
}

/* Write one section blob (value === null clears it).
   Returns an error string, or "" on success. */
function setSection(id, value) {
  var found = -1;
  for (var i = 0; i < INDEX.length; i++) {
    if (INDEX[i].id === id) {
      found = i;
      break;
    }
  }
  var oldLen = found >= 0 ? INDEX[found].len : 0;
  var newText = value === null ? "" : value;
  var newLen = newText.length;
  if (newLen > MAX_SECTION_CHARS) return "too-big";
  if (newLen === 0 && found < 0) return "";

  var at = found >= 0 ? INDEX[found].off : SECTION_CHARS;
  var delta = newLen - oldLen;
  var tailEnd = SECTION_CHARS + META_CHARS;
  if (delta !== 0) {
    u16().copyWithin(BASE_CHARS + at + oldLen + delta, BASE_CHARS + at + oldLen, BASE_CHARS + tailEnd);
  }
  if (newLen > 0) writeString(newText, BASE_CHARS + at);

  if (found >= 0) {
    if (newLen === 0) {
      INDEX.splice(found, 1);
      delete SECTIONS[id];
    } else {
      INDEX[found].len = newLen;
      SECTIONS[id] = newText;
    }
  } else {
    INDEX.push({ id: id, off: at, len: newLen });
    SECTIONS[id] = newText;
  }
  for (var j = 0; j < INDEX.length; j++) {
    if (INDEX[j].off > at) INDEX[j].off += delta;
  }
  SECTION_CHARS = totalSectionChars();
  writeMeta();
  writeHeader();
  return "";
}

loadState();

/* --------------------------------------------------------------- authority */

var admins = new Set();
/* Which admin each live connection signed in as: id -> {role, name}. Needed so
   deleting a sub-admin signs their live sessions out too (a bare id set could
   not say whose connection to drop). */
var adminIds = new Map();
var connFails = new Map();
var netFails = new Map();
/* Step one of a two-factor sign-in: the main password checked out on this
   connection and the code is still owed. Stamped so a stale note dies. */
var pending2fa = new Map();
var PENDING_2FA_MS = 5 * 60 * 1000;

function isMain(conn) {
  if (!admins.has(conn.id)) return false;
  var ident = adminIds.get(conn.id);
  return !!ident && ident.role === "main";
}
function isSub(conn) {
  if (!admins.has(conn.id)) return false;
  var ident = adminIds.get(conn.id);
  return !!ident && ident.role === "sub";
}

function connectKey(conn) {
  return conn.net && conn.net.length > 2 ? conn.net[2] : 0;
}

function allowAttempt(conn) {
  var now = Date.now();
  var c = connFails.get(conn.id);
  if (c && now - c.t < AUTH_WINDOW && c.n >= 5) return false;
  var n = netFails.get(connectKey(conn));
  if (n && now - n.t < AUTH_WINDOW && n.n >= 40) return false;
  return true;
}

function noteFail(map, key) {
  var now = Date.now();
  var entry = map.get(key);
  if (!entry || now - entry.t > AUTH_WINDOW) {
    entry = { n: 0, t: now };
    map.set(key, entry);
  }
  entry.n++;
  if (map.size > 3000) map.clear();
}

function ok(extra) {
  var out = { ok: true };
  for (var k in extra) out[k] = extra[k];
  return JSON.stringify(out);
}
function fail(err) {
  return JSON.stringify({ ok: false, err: err });
}

/* ------------------------------------------------------------------- events */

self.onopen = function (info) {
  try {
    info.conn.subscribe("content");
  } catch (e) {
    /* best-effort nudge channel */
  }
};

self.onclose = function (info) {
  admins.delete(info.conn.id);
  adminIds.delete(info.conn.id);
  pending2fa.delete(info.conn.id);
  connFails.delete(info.conn.id);
};

self.onmessage = function () {};

self.rpc = {
  getContent: function (info) {
    var parts = [];
    for (var i = 0; i < INDEX.length; i++) {
      parts.push(JSON.stringify(INDEX[i].id) + ":" + SECTIONS[INDEX[i].id]);
    }
    /* Reading also enforces the undo window (note 291): an expired previous
       publish clears off the server here if nothing else got to it first. */
    var now = Date.now();
    var hadPrev = !!PREV;
    var left = undoLeftSec(now);
    if (hadPrev && !PREV) {
      writeMeta();
      writeHeader();
    }
    return ok({
      rev: REV,
      at: AT,
      by: BY,
      notes: NOTES,
      sections: "{" + parts.join(",") + "}",
      log: LOG,
      admin: admins.has(info.conn.id),
      pwgen: PWGEN,
      undoLeft: left,
    });
  },

  /* Office-reported on-air answer (note 318): reads are public (visitors ask
     every check); writes take an admin connection (the signed-in office tab).
     Only strict, recent answers are kept — anything else is refused, never
     stored — so a stale tab, a wrong channel or a forged video id can never
     put words on the visitors' screen. */
  liveReport: function (info, raw) {
    if (!raw) return ok({ report: LIVE_REPORT });
    if (!admins.has(info.conn.id)) return fail("denied");
    var rep;
    try {
      rep = JSON.parse(raw);
    } catch (e) {
      return fail("bad-report");
    }
    if (!rep || typeof rep !== "object") return fail("bad-report");
    var target = String(rep.target || "").slice(0, 300);
    if (!/^https:\/\/(www\.youtube\.com|youtube\.com|m\.youtube\.com|youtu\.be)\//.test(target)) return fail("bad-report");
    if (rep.state !== "live" && rep.state !== "off") return fail("bad-report");
    var videoId = String(rep.videoId || "");
    if (videoId && !/^[\w-]{11}$/.test(videoId)) return fail("bad-report");
    var title = String(rep.title || "").slice(0, 200);
    var checkedAt = Number(rep.checkedAt) || 0;
    var now = Date.now();
    if (!(checkedAt > 0) || checkedAt > now + 5 * 60 * 1000 || now - checkedAt > 10 * 60 * 1000) return fail("bad-report");
    LIVE_REPORT = { target: target, state: rep.state, videoId: videoId, title: title, checkedAt: checkedAt, at: now };
    return ok({ stored: true });
  },

  login: function (info, raw) {
    if (!allowAttempt(info.conn)) return fail("rate");
    /* Either box opens whichever account matches — a sub-admin password works
       in the main box and the office password works in the sub-admin box. Only
       a tie needs the location: the same text cannot serve two accounts at
       once, so the sub-admin box looks at sub-admins first and the main box at
       the office password first. `raw` is the password itself (older bundles)
       or JSON {password, want} (want "sub" from the sub-admin box). */
    var password = raw;
    var wantSub = false;
    if (typeof raw === "string" && raw.charAt(0) === "{") {
      try {
        var asked = JSON.parse(raw);
        if (asked && typeof asked.password === "string") {
          password = asked.password;
          wantSub = asked.want === "sub";
        }
      } catch (e) {}
    }
    if (typeof password !== "string" || !password) {
      noteFail(connFails, info.conn.id);
      noteFail(netFails, connectKey(info.conn));
      return fail("denied");
    }
    var digest = sha256Hex(password);
    var mainMatch = digest === (MAIN_HASH || ADMIN_HASH);
    var i, subIdx = -1;
    for (i = 0; i < SUBS.length; i++) {
      if (SUBS[i].hash === digest) {
        subIdx = i;
        break;
      }
    }
    /* The main admin's password (the office's authenticator, unchanged). With
       two-factor on it only earns the second step, never the keys — and once
       the main sign-in is retired it earns nothing at all. */
    var openMain = function () {
      if (MAIN_OFF) {
        noteFail(connFails, info.conn.id);
        noteFail(netFails, connectKey(info.conn));
        return fail("denied");
      }
      if (TOTP) {
        pending2fa.set(info.conn.id, Date.now());
        if (pending2fa.size > 3000) pending2fa.clear();
        return ok({ role: "main", needCode: true, q: TOTP.q || "" });
      }
      admins.add(info.conn.id);
      adminIds.set(info.conn.id, { role: "main", name: "" });
      return ok({ role: "main", pwgen: PWGEN });
    };
    var openSub = function () {
      admins.add(info.conn.id);
      adminIds.set(info.conn.id, { role: "sub", name: SUBS[subIdx].name });
      return ok({ role: "sub", name: SUBS[subIdx].name, pwgen: PWGEN });
    };
    if (wantSub && subIdx >= 0) return openSub();
    if (mainMatch) return openMain();
    if (subIdx >= 0) return openSub();
    /* A one-time invite code signs nobody in by itself — it only names the
       invitation, so the caller can set the sub-admin's real password next
       (see setSubPassword). The code stays valid until it is used. */
    pruneInvites(Date.now());
    for (i = 0; i < INVITES.length; i++) {
      if (INVITES[i].codeHash === digest) {
        return ok({ role: "invite", name: INVITES[i].name });
      }
    }
    noteFail(connFails, info.conn.id);
    noteFail(netFails, connectKey(info.conn));
    return fail("denied");
  },

  /* Turn a one-time invite code into a sub-admin. Public (the unused code IS
     the credential), so it is rate-limited like login. The code is consumed:
     it works exactly once, and afterwards the password signs in like the
     main admin's does. */
  setSubPassword: function (info, raw) {
    if (!allowAttempt(info.conn)) return fail("rate");
    var bad = function (err) {
      noteFail(connFails, info.conn.id);
      noteFail(netFails, connectKey(info.conn));
      return fail(err);
    };
    var payload;
    try {
      payload = JSON.parse(raw);
    } catch (e) {
      return bad("bad-payload");
    }
    if (!payload || typeof payload.code !== "string" || typeof payload.password !== "string") return bad("bad-payload");
    if (payload.password.length < 8 || payload.password.length > 128) return bad("bad-password");
    pruneInvites(Date.now());
    var digest = sha256Hex(payload.code);
    var found = -1;
    for (var i = 0; i < INVITES.length; i++) {
      if (INVITES[i].codeHash === digest) {
        found = i;
        break;
      }
    }
    if (found < 0) return bad("bad-code");
    var name = INVITES[found].name;
    if (!validSubName(name)) return bad("bad-code");
    if (SUBS.length >= MAX_SUBS) return bad("too-many");
    for (i = 0; i < SUBS.length; i++) {
      if (SUBS[i].name === name) return bad("name-taken");
    }
    INVITES.splice(found, 1);
    SUBS.push({ name: name, hash: sha256Hex(payload.password), at: Date.now() });
    writeMeta();
    admins.add(info.conn.id);
    adminIds.set(info.conn.id, { role: "sub", name: name });
    return ok({ role: "sub", name: name, pwgen: PWGEN });
  },

  /* Step two of a two-factor sign-in: the authenticator's 6-digit code, or one
     of the single-use backup codes. Backup codes are spent the moment one
     works. Guessing is rate-limited like login. */
  login2fa: function (info, raw) {
    if (!allowAttempt(info.conn)) return fail("rate");
    var bad = function (err) {
      noteFail(connFails, info.conn.id);
      noteFail(netFails, connectKey(info.conn));
      return fail(err);
    };
    var at = pending2fa.get(info.conn.id);
    if (!at || Date.now() - at > PENDING_2FA_MS) {
      pending2fa.delete(info.conn.id);
      return bad("no-pending");
    }
    if (!TOTP) {
      pending2fa.delete(info.conn.id);
      return bad("off");
    }
    var payload;
    try {
      payload = JSON.parse(raw);
    } catch (e) {
      return bad("bad-payload");
    }
    if (!payload || typeof payload.code !== "string") return bad("bad-payload");
    var raw = payload.code;
    if (!raw || raw.length > 140) return bad("bad-code");
    var done = function () {
      pending2fa.delete(info.conn.id);
      admins.add(info.conn.id);
      adminIds.set(info.conn.id, { role: "main", name: "" });
      return ok({ role: "main", pwgen: PWGEN });
    };
    var cleaned = cleanCode(raw);
    if (cleaned && totpCheck(TOTP.secret, cleaned)) return done();
    var fb = fallbackKind(raw);
    if (fb === "answer") return done();
    if (fb.slice(0, 6) === "spare:") {
      TOTP.backups.splice(parseInt(fb.slice(6), 10), 1);
      writeMeta();
      return done();
    }
    return bad("bad-code");
  },

  totpStatus: function (info) {
    if (!isMain(info.conn)) return fail("unauthorized");
    return ok({ enabled: !!TOTP, hasQ: !!(TOTP && TOTP.qhash), q: TOTP && TOTP.q ? TOTP.q : "" });
  },

  /* Enroll the authenticator app. The browser made the secret; the code typed
     from the app proves it was recorded right, and the security question is
     the way back in when the phone is lost. Only then is anything stored. */
  totpSetup: function (info, raw) {
    if (!isMain(info.conn)) return fail("unauthorized");
    var payload;
    try {
      payload = JSON.parse(raw);
    } catch (e) {
      return fail("bad-payload");
    }
    if (!payload || typeof payload.secret !== "string" || !/^[A-Z2-7]{32}$/.test(payload.secret)) return fail("bad-secret");
    if (typeof payload.q !== "string" || payload.q.trim().length < 4 || payload.q.length > 120) return fail("bad-question");
    var norm = normAnswer(payload.answer);
    if (!norm || norm.length < 4 || String(payload.answer).length > 140) return fail("bad-answer");
    if (typeof payload.code !== "string" || !totpCheck(payload.secret, cleanCode(payload.code))) return fail("bad-code");
    var backups = [];
    if (payload.backups && payload.backups.length) {
      for (var i = 0; i < payload.backups.length && backups.length < BACKUP_COUNT; i++) {
        if (typeof payload.backups[i] === "string" && /^[0-9a-f]{64}$/.test(payload.backups[i])) backups.push(payload.backups[i]);
      }
    }
    TOTP = { secret: payload.secret, backups: backups, q: payload.q.trim(), qhash: sha256Hex(norm) };
    writeMeta();
    return ok({});
  },

  /* Set or refresh the security question and answer. Takes a signed-in main
     admin plus proof it is them: a current app code, the current answer, or
     one of the old spare codes. */
  setSecurityQA: function (info, raw) {
    if (!isMain(info.conn)) return fail("unauthorized");
    if (!TOTP) return fail("off");
    var payload;
    try {
      payload = JSON.parse(raw);
    } catch (e) {
      return fail("bad-payload");
    }
    if (!payload || typeof payload.proof !== "string" || !payload.proof) return fail("bad-payload");
    var cleaned = cleanCode(payload.proof);
    var proved = !!(cleaned && totpCheck(TOTP.secret, cleaned));
    var fb = proved ? "" : fallbackKind(payload.proof);
    if (!proved && fb !== "answer" && fb.slice(0, 6) !== "spare:") return fail("bad-code");
    if (typeof payload.q !== "string" || payload.q.trim().length < 4 || payload.q.length > 120) return fail("bad-question");
    var norm = normAnswer(payload.answer);
    if (!norm || norm.length < 4 || String(payload.answer).length > 140) return fail("bad-answer");
    TOTP.q = payload.q.trim();
    TOTP.qhash = sha256Hex(norm);
    writeMeta();
    return ok({});
  },

  /* Switch two-factor back off. Takes the security answer only — the office
     proves it without needing the phone in hand. */
  totpDisable: function (info, raw) {
    if (!isMain(info.conn)) return fail("unauthorized");
    if (!TOTP) return fail("off");
    var payload;
    try {
      payload = JSON.parse(raw);
    } catch (e) {
      return fail("bad-payload");
    }
    if (!payload || typeof payload.code !== "string") return fail("bad-payload");
    var typed = payload.code;
    if (!typed || typed.length > 140) return fail("bad-code");
    if (!TOTP.qhash) return fail("no-question");
    if (fallbackKind(typed) === "answer") {
      TOTP = null;
      writeMeta();
      return ok({});
    }
    return fail("bad-code");
  },
  /* One-click switch-off from the header toggle. The session is the proof —
     same trust as a password change — and the cleared state is saved the
     same way: TOTP = null + writeMeta, like MAIN_HASH + writeMeta. */
  totpOffNow: function (info) {
    if (!isMain(info.conn)) return fail("unauthorized");
    if (!TOTP) return fail("off");
    TOTP = null;
    writeMeta();
    return ok({});
  },
  /* Retire (or restore) the main password sign-in. Switching it off takes the
     main admin and a remaining sub-admin; switching it back on takes either —
     otherwise the office could lock itself out with no way back in. */
  setMainOff: function (info, raw) {
    var payload;
    try {
      payload = JSON.parse(raw);
    } catch (e) {
      return fail("bad-payload");
    }
    if (!payload || typeof payload.off !== "boolean") return fail("bad-payload");
    if (payload.off) {
      if (!isMain(info.conn)) return fail("unauthorized");
      if (SUBS.length === 0) return fail("no-subs");
      MAIN_OFF = true;
    } else {
      if (!isMain(info.conn) && !isSub(info.conn)) return fail("unauthorized");
      MAIN_OFF = false;
    }
    writeMeta();
    return ok({ off: MAIN_OFF });
  },

  /* Change the main password. Takes the signed-in main admin — the session is
     the proof — and only while two-factor is on, plus the security answer (or
     a current app code) with every change. The new password is hashed by the
     caller (SHA-256 hex); only the hash is ever stored. The old password stops
     working everywhere at once: the generation bumps, every other main-admin
     session is signed out on the spot, and a nudge tells their tabs to clear
     themselves — sub-admins are untouched, their passwords did not change. */
  setMainPassword: function (info, raw) {
    if (!isMain(info.conn)) return fail("unauthorized");
    if (!TOTP) return fail("need-2fa");
    var payload;
    try {
      payload = JSON.parse(raw);
    } catch (e) {
      return fail("bad-payload");
    }
    if (!payload || typeof payload.hash !== "string" || !/^[0-9a-f]{64}$/.test(payload.hash)) return fail("bad-password");
    if (!payload || typeof payload.proof !== "string" || !payload.proof) return fail("bad-payload");
    var cleaned = cleanCode(payload.proof);
    var proved = !!(cleaned && totpCheck(TOTP.secret, cleaned));
    if (!proved && !fallbackKind(payload.proof)) return fail("bad-code");
    MAIN_HASH = payload.hash;
    PWGEN++;
    adminIds.forEach(function (ident, id) {
      if (id !== info.conn.id && ident && ident.role === "main") {
        admins.delete(id);
        adminIds.delete(id);
      }
    });
    writeMeta();
    try {
      pubsub.publish("content", JSON.stringify({ rev: REV, at: AT, by: BY }));
    } catch (e) {
      /* a missed nudge is harmless: clients refresh on next load */
    }
    return ok({ pwgen: PWGEN });
  },

  /* Any signed-in admin may ask whether the main password still works. */
  mainState: function (info) {
    if (!isMain(info.conn) && !isSub(info.conn)) return fail("unauthorized");
    return ok({ off: MAIN_OFF });
  },

  /* The roster. Main admin only — names and dates go out, hashes never do. */
  listSubs: function (info) {
    if (!isMain(info.conn)) return fail("unauthorized");
    pruneInvites(Date.now());
    var subs = [];
    for (var i = 0; i < SUBS.length; i++) subs.push({ name: SUBS[i].name, at: SUBS[i].at });
    var invites = [];
    for (i = 0; i < INVITES.length; i++) {
      invites.push({ name: INVITES[i].name, at: INVITES[i].at, expires: INVITES[i].at + INVITE_MS });
    }
    return ok({ subs: subs, invites: invites });
  },

  /* Invite a sub-admin. The browser generates the code (real randomness) and
     sends only its SHA-256; the code itself is shown once, to be passed on. */
  createInvite: function (info, raw) {
    if (!isMain(info.conn)) return fail("unauthorized");
    var payload;
    try {
      payload = JSON.parse(raw);
    } catch (e) {
      return fail("bad-payload");
    }
    if (!payload || !validSubName(payload.name)) return fail("bad-name");
    if (typeof payload.codeHash !== "string" || !/^[0-9a-f]{64}$/.test(payload.codeHash)) return fail("bad-code");
    pruneInvites(Date.now());
    if (nameTaken(payload.name)) return fail("name-taken");
    if (INVITES.length >= MAX_INVITES) return fail("too-many");
    INVITES.push({ name: payload.name, codeHash: payload.codeHash, at: Date.now() });
    writeMeta();
    return ok({});
  },

  revokeInvite: function (info, raw) {
    if (!isMain(info.conn)) return fail("unauthorized");
    var payload;
    try {
      payload = JSON.parse(raw);
    } catch (e) {
      return fail("bad-payload");
    }
    if (!payload || typeof payload.name !== "string") return fail("bad-payload");
    for (var i = 0; i < INVITES.length; i++) {
      if (INVITES[i].name === payload.name) {
        if (MAIN_OFF && SUBS.length === 0 && INVITES.length <= 1) return fail("last-way-in");
        INVITES.splice(i, 1);
        writeMeta();
        return ok({});
      }
    }
    return fail("unknown");
  },

  /* Delete a sub-admin. Their live sessions are signed out on the spot. */
  deleteSub: function (info, raw) {
    if (!isMain(info.conn)) return fail("unauthorized");
    var payload;
    try {
      payload = JSON.parse(raw);
    } catch (e) {
      return fail("bad-payload");
    }
    if (!payload || typeof payload.name !== "string") return fail("bad-payload");
    var found = false;
    for (var i = 0; i < SUBS.length; i++) {
      if (SUBS[i].name === payload.name) {
        if (MAIN_OFF && SUBS.length <= 1) return fail("last-way-in");
        SUBS.splice(i, 1);
        found = true;
        break;
      }
    }
    if (!found) return fail("unknown");
    adminIds.forEach(function (ident, id) {
      if (ident && ident.role === "sub" && ident.name === payload.name) {
        admins.delete(id);
        adminIds.delete(id);
      }
    });
    writeMeta();
    return ok({});
  },

  /* Patch publish. raw = { by, note, notes, changed: [id], sections } (note 249:
     notes carries the publishing code's update; empty sections still bless. */
  publish: function (info, raw) {
    if (!admins.has(info.conn.id)) return fail("unauthorized");
    var payload;
    try {
      payload = JSON.parse(raw);
    } catch (e) {
      return fail("bad-payload");
    }
    if (!payload || typeof payload.sections !== "object" || payload.sections === null) return fail("bad-payload");

    var ids = [];
    var id;
    for (id in payload.sections) {
      if (Object.prototype.hasOwnProperty.call(payload.sections, id)) ids.push(id);
    }
    var notes = typeof payload.notes === "number" && payload.notes >= 0 && payload.notes <= 999999 ? Math.floor(payload.notes) : 0;
    if (!ids.length && !notes) return fail("empty");
    if (ids.length > SLOTS) return fail("too-many");

    var i, value;
    for (i = 0; i < ids.length; i++) {
      id = ids[i];
      if (!/^[a-zA-Z][a-zA-Z0-9-]{0,31}$/.test(id)) return fail("bad-id");
      value = payload.sections[id];
      if (value === null) continue;
      if (typeof value !== "string" || value.length > MAX_SECTION_CHARS) return fail("bad-value");
      try {
        var parsed = JSON.parse(value);
        if (parsed === null || typeof parsed !== "object") return fail("bad-value");
      } catch (e) {
        return fail("bad-value");
      }
    }

    var free = state.length - (HEADER + (SECTION_CHARS + META_CHARS) * 2);
    for (i = 0; i < ids.length; i++) {
      value = payload.sections[ids[i]];
      if (typeof value === "string") free -= value.length * 2;
    }
    /* The undo snapshot about to be kept (note 291) is a full copy of the
       live sections — reserve for it when none is kept yet. */
    if (!PREV) free -= SECTION_CHARS * 2 + 1024;
    if (free < 8192) return fail("no-space");

    /* A publish deletes the previous publish as the live words — but the
       superseded set is kept for one ~15-minute undo first (note 291). Only
       the first batch of a multi-batch publish snapshots (the client marks it
       `first`), so the copy predates the whole publish, not its middle. */
    var undoSnap = null;
    if (payload.first === true && ids.length) {
      var keep = {};
      for (var k in SECTIONS) {
        if (Object.prototype.hasOwnProperty.call(SECTIONS, k)) keep[k] = SECTIONS[k];
      }
      if (Object.keys(keep).length) undoSnap = { at: 0, rev: REV, sections: keep };
    }

    REV += 1;
    AT = Date.now();
    BY = typeof payload.by === "string" ? payload.by.slice(0, 60) : "";
    if (notes > NOTES) NOTES = notes;
    var changed = [];
    if (payload.changed && payload.changed.length) {
      for (i = 0; i < payload.changed.length && i < 24; i++) {
        var name = String(payload.changed[i]);
        if (/^[a-zA-Z][a-zA-Z0-9-]{0,31}$/.test(name)) changed.push(name);
      }
    }
    /* A publish sent in several batches (see sendPatch in cms.ts) records one
       history entry, on its last batch — `quiet` batches only store content. */
    if (!payload.quiet) {
      var who = adminIds.get(info.conn.id);
      LOG.unshift({
        rev: REV,
        at: AT,
        by: BY,
        role: who && who.role === "sub" ? "sub" : "main",
        note: typeof payload.note === "string" ? payload.note.slice(0, 160) : "",
        changed: changed,
      });
      if (LOG.length > MAX_LOG) LOG.length = MAX_LOG;
    }

    for (i = 0; i < ids.length; i++) {
      var err = setSection(ids[i], payload.sections[ids[i]]);
      if (err) return fail(err);
    }
    /* The publish landed whole: the superseded set becomes the undo window. */
    if (undoSnap) {
      undoSnap.at = AT;
      PREV = undoSnap;
    }
    /* A notes-only publish moves no sections, so persist the blessing here. */
    writeMeta();
    writeHeader();

    try {
      pubsub.publish("content", JSON.stringify({ rev: REV, at: AT, by: BY }));
    } catch (e) {
      /* a missed nudge is harmless: clients refresh on next load */
    }
    return ok({ rev: REV, notes: NOTES });
  },
  /* Put the previous publish back whole (note 291): one undo, inside about
     15 minutes of the publish it supersedes. It replaces the current publish
     outright — a publish always deletes the one before it — and the undo
     itself consumes the window: afterwards nothing of either is kept. */
  undoPublish: function (info, raw) {
    if (!admins.has(info.conn.id)) return fail("unauthorized");
    var now = Date.now();
    var prev = livePrev(now);
    if (!prev) {
      if (PREV) {
        PREV = null;
        writeMeta();
        writeHeader();
      }
      return fail("expired");
    }
    var ids = [];
    var id;
    for (id in prev.sections) {
      if (Object.prototype.hasOwnProperty.call(prev.sections, id)) ids.push(id);
    }
    /* Sections the previous publish never held leave with the current one —
       the restore is exact, not a merge. */
    var cur;
    for (cur in SECTIONS) {
      if (
        Object.prototype.hasOwnProperty.call(SECTIONS, cur) &&
        !Object.prototype.hasOwnProperty.call(prev.sections, cur)
      ) {
        var clr = setSection(cur, null);
        if (clr) return fail(clr);
      }
    }
    for (var i = 0; i < ids.length; i++) {
      var err = setSection(ids[i], prev.sections[ids[i]]);
      if (err) return fail(err);
    }
    var by = BY;
    if (typeof raw === "string" && raw) {
      try {
        var asked = JSON.parse(raw);
        if (asked && typeof asked.by === "string" && asked.by) by = asked.by.slice(0, 60);
      } catch (e) {
        /* the stored name stands */
      }
    }
    PREV = null;
    REV += 1;
    AT = now;
    BY = by;
    var who = adminIds.get(info.conn.id);
    LOG.unshift({
      rev: REV,
      at: AT,
      by: BY,
      role: who && who.role === "sub" ? "sub" : "main",
      note: "Undid the last publish",
      changed: ids.slice(0, 24),
    });
    if (LOG.length > MAX_LOG) LOG.length = MAX_LOG;
    writeMeta();
    writeHeader();
    try {
      pubsub.publish("content", JSON.stringify({ rev: REV, at: AT, by: BY }));
    } catch (e) {
      /* a missed nudge is harmless: clients refresh on next load */
    }
    return ok({ rev: REV, notes: NOTES });
  },
  /* Forget the publish history. Content is untouched — the next publish
     starts the record again from there. Main admin only. */
  clearLog: function (info) {
    if (!isMain(info.conn)) return fail("unauthorized");
    LOG = [];
    BY = "";
    REV = 0;
    AT = 0;
    PREV = null;
    writeMeta();
    writeHeader();
    return ok({});
  },
};
