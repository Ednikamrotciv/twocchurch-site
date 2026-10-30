/* editor.tsx — the office's editing widgets: field controls, uploads, sign-in, publish dialogs. */

import React, { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode-generator";
import {
  Badge,
  Btn,
  Card,
  Empty,
  Field,
  Icon,
  Input,
  Modal,
  Notice,
  Section,
  SectionHeading,
  Select,
  Switch,
  Textarea,
} from "../components/ui";
import { PageHead } from "../components/layout";
import { SearchBox, eventDate } from "../components/blocks";
import { fireToast, useNow } from "../lib/hooks";
import { readLiveStatus, recheckLiveNow, checkLiveStream, guestTarget, isGuestTargetUrl, useLiveStream, liveTarget, isStatusForTarget, clearGuestOnStop, forgetVerified, forgetAllVerified, pingLocalReload } from "../lib/livestatus";
import { SITE, SERVICES, img } from "../data/site";
import { recentLimit } from "../data/live";
import { ytWatch } from "../data/sermons";
import { askForRecentServices, fetchPreviousLives, readRecentServices, subscribeRecentServices } from "../lib/recentstreams";
import type { RecentService } from "../lib/recentstreams";
import { BRANCHES } from "../data/branches";
import type { ChurchEvent } from "../data/content";
import { PHOTO_SLOTS, bundledPhoto, photoById, photoKeyOf, resolvePhoto, slotBundledPhoto } from "../data/photos";
import {
  compressImageBlob,
  clockAt,
  DAY_SHORT,
  fmtDate,
  MONTH_SHORT,
  nextService,
  churchTimezone,
  to12h,
  zonedParts,
} from "../lib/store";
import { frameImageBlob, framePastedSlide } from "../lib/slideFrame";
import {
  SECTION_DEFS,
  type Field as FieldDef,
  type SectionDef,
  ACCENT_OPTIONS,
  clone,
  getPath,
  setPath,
  sectionById,
  sectionIsHidden,
} from "../lib/cmsSchema";
import * as cms from "../lib/cms";
import { cacheUploadBlob, uploadNameOf, useCachedUploadUrl, useFeedUploadUrl } from "../lib/uploadCache";
import { siteFile } from "../lib/livefeed";
import { serverUrl } from "../lib/remoteserver";

/* -------------------------------------------------------------- status pill */

export function StatusPill({ state }: { state: ReturnType<typeof cms.useCms> }) {
  const label =
    state.status === "online"
      ? "Connected"
      : state.status === "connecting"
      ? "Connecting…"
      : state.status === "offline"
      ? "Reconnecting…"
      : "Not connected";
  const tone = state.status === "online" ? "emerald" : state.status === "connecting" ? "sky" : "crimson";
  return (
    <span className={"admin__pill admin__pill--" + tone} title={"Sharing your content with every visitor: " + label}>
      <i />
      <span className="admin__pill-label">{label}</span>
    </span>
  );
}

/* The returning sub-admin's sign-in: just the password they created with
   their invite code, typed in each visit. */
function SubSignIn({
  error,
  busy,
  subPw,
  setSubPw,
  onSubmit,
  onBack,
}: {
  error: string;
  busy: boolean;
  subPw: string;
  setSubPw: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onBack: () => void;
}) {
  return (
    <form onSubmit={onSubmit}>
      <Field
        label="Sub-admin password"
        error={error}
        hint="The password you created with your invite code."
      >
        <Input
          type="password"
          autoComplete="current-password"
          value={subPw}
          onChange={(e) => setSubPw(e.target.value)}
          placeholder="••••••••••••"
          aria-label="Sub-admin password"
        />
      </Field>
      <div className="btn-row">
        <Btn type="submit" disabled={busy || !subPw} icon="lock">
          {busy ? "Checking…" : "Sign in as sub-admin"}
        </Btn>
        <Btn variant="ghost" onClick={onBack}>
          Back
        </Btn>
      </div>
    </form>
  );
}

/* Office-server address field removed: this copy joins its server automatically
   (baked server.json, or same-machine probe). No manual address on the sign-in card. */
function ServerConnect() {
  return null;
}

/* ---------------------------------------------------------------- login gate */

export function LoginGate({ onExit, onDone }: { onExit?: () => void; onDone?: () => void }) {
  const state = cms.useCms();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  /* Join the server in the background the moment the card opens, so it is
     usually already connected by the time the password is typed. */
  useEffect(() => {
    if (state.status === "local" || state.status === "offline") {
      cms.ensureOnline().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* Sub-admin signup: a one-time invite code from the main admin, spent to
     create the sub-admin's own password — afterwards the code is dead and the
     password signs in like the main admin's. */
  const [inviteMode, setInviteMode] = useState(false);
  const [code, setCode] = useState("");
  const [inviteName, setInviteName] = useState("");
  /* Returning sub-admins sign in with the password they created — a click like
     the invite-code one, but for passwords that already exist. */
  const [subMode, setSubMode] = useState(false);
  const [subPw, setSubPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  /* Second step of main-admin two-factor: the password checked out and the
     authenticator code is still owed — or the security answer, when the phone
     is out of reach. */
  const [needCode, setNeedCode] = useState(false);
  const [needQ, setNeedQ] = useState("");
  const [useAnswer, setUseAnswer] = useState(false);
  const [secondCode, setSecondCode] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    setError("");
    const res = await cms.login(password);
    setBusy(false);
    if (res.ok && res.needCode) {
      setNeedCode(true);
      setNeedQ(res.q || "");
      setUseAnswer(false);
      setSecondCode("");
      setError("");
      return;
    }
    if (res.ok) {
      setPassword("");
      fireToast("Welcome back — you are signed in.", "info");
      onDone?.();
      return;
    }
    setError(
      res.error === "offline"
        ? "The content server is not reachable from this page yet. Try again in a moment."
        : res.error === "rate"
        ? "Too many attempts from this connection. Please wait ten minutes and try again."
        : "That password was not recognised."
    );
    setPassword("");
  };

  const submitSecondCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secondCode) return;
    setBusy(true);
    setError("");
    const res = await cms.login2fa(secondCode, password);
    setBusy(false);
    if (res.ok) {
      setPassword("");
      setSecondCode("");
      setNeedCode(false);
      setNeedQ("");
      setUseAnswer(false);
      fireToast("Welcome back — you are signed in.", "info");
      onDone?.();
      return;
    }
    setError(
      res.error === "offline"
        ? "The content server is not reachable from this page yet. Wait a moment and try again."
        : res.error === "rate"
        ? "Too many attempts from this connection. Please wait ten minutes and try again."
        : res.error === "no-pending"
        ? "That step expired — enter your password again from the start."
        : useAnswer
        ? "That answer was not recognised — try again."
        : "That code was not recognised — try the current one from your authenticator app."
    );
    if (res.error === "no-pending") {
      setNeedCode(false);
      setNeedQ("");
      setUseAnswer(false);
      setPassword("");
    }
    setSecondCode("");
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = cms.normalizeInviteCode(code);
    if (!clean) return;
    setBusy(true);
    setError("");
    const res = await cms.login(clean);
    setBusy(false);
    if (res.ok && res.role === "invite") {
      setInviteName(res.name || "");
      setCode(clean);
      return;
    }
    if (res.ok) {
      setPassword("");
      setCode("");
      fireToast("Welcome back — you are signed in.", "info");
      onDone?.();
      return;
    }
    setError(
      res.error === "offline"
        ? "The content server is not reachable from this page yet. Wait a moment and try again."
        : res.error === "rate"
        ? "Too many attempts from this connection. Please wait ten minutes and try again."
        : "That code was not recognised — codes work once and expire after 7 days."
    );
    setCode("");
  };

  const submitNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw.length < 8) {
      setError("Choose a password of at least 8 characters.");
      return;
    }
    if (newPw !== confirmPw) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    const res = await cms.redeemInvite(code, newPw);
    setBusy(false);
    if (res.ok) {
      setCode("");
      setNewPw("");
      setConfirmPw("");
      setInviteName("");
      setInviteMode(false);
      fireToast(`Welcome, ${res.name || "sub-admin"} — you are signed in.`, "info");
      onDone?.();
      return;
    }
    setError(
      res.error === "offline"
        ? "The content server is not reachable from this page yet. Wait a moment and try again."
        : res.error === "rate"
        ? "Too many attempts from this connection. Please wait ten minutes and try again."
        : res.error === "bad-code"
        ? "That code has already been used or has expired — ask the main admin for a new one."
        : res.error === "bad-password"
        ? "Choose a password of at least 8 characters."
        : res.error === "too-many"
        ? "There are already as many sub-admins as the site allows — the main admin must delete one first."
        : res.error === "name-taken"
        ? "That name is already taken — ask the main admin for a new invite code."
        : "Something went wrong — please try again."
    );
  };

  const doSubLogin = async (pw: string) => {
    if (!pw) return;
    setBusy(true);
    setError("");
    const res = await cms.login(pw, false, "sub");
    setBusy(false);
    /* On a tie the sub box opens sub; the office password enters straight in otherwise. */
    if (res.ok && res.needCode) {
      setPassword(pw);
      setNeedCode(true);
      setNeedQ(res.q || "");
      setUseAnswer(false);
      setSecondCode("");
      setSubPw("");
      setSubMode(false);
      setError("");
      return;
    }
    if (res.ok) {
      if (res.role === "invite") {
        setError("That is a one-time invite code — use the invite code option instead.");
        setSubPw("");
        return;
      }
      setSubPw("");
      setSubMode(false);
      fireToast(`Welcome back, ${res.role === "sub" ? res.name || "sub-admin" : "main admin"} — you are signed in.`, "info");
      onDone?.();
      return;
    }
    setError(
      res.error === "offline"
        ? "The content server is not reachable from this page yet. Wait a moment and try again."
        : res.error === "rate"
        ? "Too many attempts from this connection. Please wait ten minutes and try again."
        : cms.websiteIsUnsaved()
        ? "That password was not recognised. This website is not saved yet, so a reload forgets sub-admins — save the website first, then create the invite code again."
        : "That password was not recognised."
    );
    setSubPw("");
  };

  const submitSub = async (e: React.FormEvent) => {
    e.preventDefault();
    await doSubLogin(subPw);
  };

  return (
    <div className="admin__gate admin__gate--modal">
      <Card className="admin__gate-card">
        <span className="admin__gate-icon">
          <Icon name="lock" size={22} />
        </span>
        <h2>Sign in</h2>
        <p className="muted">
          Signing in lets you change the words, the photos and the details on the site itself — nothing you do is public until you
          publish it.
        </p>
        {needCode ? (
          useAnswer ? (
            <form onSubmit={submitSecondCode}>
              <Field label="Security question" error={error} hint={needQ || "Answer the question only the office set up."}>
                <Input
                  value={secondCode}
                  onChange={(e) => setSecondCode(e.target.value)}
                  placeholder="Your answer"
                  aria-label="Security answer"
                  autoComplete="off"
                  maxLength={140}
                />
              </Field>
              <div className="btn-row">
                <Btn type="submit" disabled={busy || !secondCode.trim()} icon="lock">
                  {busy ? "Checking…" : "Sign in"}
                </Btn>
                <Btn variant="ghost" onClick={() => { setUseAnswer(false); setSecondCode(""); setError(""); }}>
                  Use the app code
                </Btn>
              </div>
            </form>
          ) : (
            <form onSubmit={submitSecondCode}>
              <Field
                label="Authenticator code"
                error={error}
                hint="The password checked out — now the 6-digit code from your authenticator app."
              >
                <Input
                  value={secondCode}
                  onChange={(e) => setSecondCode(e.target.value)}
                  placeholder="123456"
                  aria-label="Authenticator code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={12}
                />
              </Field>
              <div className="btn-row">
                <Btn type="submit" disabled={busy || !secondCode.trim()} icon="shield">
                  {busy ? "Checking…" : "Sign in"}
                </Btn>
                <Btn variant="ghost" onClick={() => { setNeedCode(false); setNeedQ(""); setPassword(""); setSecondCode(""); setError(""); }}>
                  Back
                </Btn>
              </div>
              {needQ ? (
                <p className="muted" style={{ marginTop: "0.8rem" }}>
                  No access to the app?{" "}
                  <button type="button" className="admin__linkbtn" onClick={() => { setUseAnswer(true); setSecondCode(""); setError(""); }}>
                    Answer your security question
                  </button>
                </p>
              ) : null}
            </form>
          )
        ) : inviteMode ? (
          inviteName ? (
            <form onSubmit={submitNewPassword}>
              <Field
                label="Create your password"
                error={error}
                hint={`This code invited ${inviteName} — set the password you will sign in with from now on. The code stops working the moment this is done.`}
              >
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  placeholder="At least 8 characters"
                  aria-label="New password"
                />
              </Field>
              <Field label="Repeat the password" error={undefined}>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  placeholder="Same password again"
                  aria-label="Repeat the password"
                />
              </Field>
              <div className="btn-row">
                <Btn type="submit" disabled={busy || !newPw || !confirmPw} icon="lock">
                  {busy ? "Creating…" : "Create my password"}
                </Btn>
                <Btn variant="ghost" onClick={() => { setInviteMode(false); setInviteName(""); setError(""); }}>
                  Back
                </Btn>
              </div>
            </form>
          ) : (
            <form onSubmit={submitCode}>
              <Field
                label="One-time invite code"
                error={error}
                hint="Given to you once by the main admin. It works a single time and expires after 7 days."
              >
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="XXXX-XXXX-XXXX"
                  aria-label="One-time invite code"
                  autoComplete="one-time-code"
                />
              </Field>
              <div className="btn-row">
                <Btn type="submit" disabled={busy || !cms.normalizeInviteCode(code)} icon="send">
                  {busy ? "Checking…" : "Continue"}
                </Btn>
                <Btn variant="ghost" onClick={() => { setInviteMode(false); setError(""); }}>
                  Use the admin password
                </Btn>
              </div>
            </form>
          )
        ) : subMode ? (
          <SubSignIn
            error={error}
            busy={busy}
            subPw={subPw}
            setSubPw={setSubPw}
            onSubmit={submitSub}
            onBack={() => { setSubMode(false); setSubPw(""); setError(""); }}
          />
        ) : (
          <>
            <form onSubmit={submit}>
              <Field label="Admin password" error={error}>
                <Input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  aria-label="Admin password"
                />
              </Field>
              <div className="btn-row">
                <Btn type="submit" disabled={busy || !password} icon="lock">
                  {busy ? "Checking…" : "Start editing"}
                </Btn>
                {onExit ? (
                  <Btn variant="ghost" icon="external" onClick={onExit}>
                    Open the live site
                  </Btn>
                ) : (
                  <Btn variant="ghost" to="/" icon="arrowLeft">
                    Back to the website
                  </Btn>
                )}
              </div>
            </form>
            <p className="muted" style={{ marginTop: "0.8rem" }}>
              <button type="button" className="admin__linkbtn" onClick={() => { setInviteMode(true); setError(""); }}>
                Use a one-time invite code
              </button>
            </p>
            <p className="muted">
              <button type="button" className="admin__linkbtn" onClick={() => { setSubMode(true); setError(""); }}>
                Sign in as a sub-admin
              </button>
            </p>
          </>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------- live-site status row */

/** The Status tab's "Live site" row: the last relay report, plus the
    one-time live-password fix and a manual retry while words are owed. */
function LiveSiteRow() {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  let body = "Not yet reached this session — it updates on your next publish.";
  try {
    const relay = cms.relayStatus();
    if (relay.msg) body = `${relay.msg}${relay.at ? ` (${cms.timeAgo(relay.at)})` : ""}`;
  } catch {
    /* the fallback above stands */
  }
  let needsPw = false;
  try {
    needsPw = cms.relayNeedsPassword();
  } catch {
    needsPw = false;
  }
  let pending = false;
  try {
    pending = !needsPw && cms.relayPending();
  } catch {
    pending = false;
  }
  const sendPw = async () => {
    if (busy || !pw) return;
    setBusy(true);
    try {
      const r = await cms.submitLivePassword(pw);
      setMsg(r.msg);
      if (r.ok) setPw("");
      fireToast(r.msg, r.ok ? "success" : "error");
    } catch {
      setMsg("Could not send — retrying in the background.");
    }
    setBusy(false);
  };
  const sendNow = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const done = await cms.retryLiveNow();
      const m = done ? "Live site updated with your publish." : "Still owed to the live site — retrying in the background.";
      setMsg(m);
      fireToast(m, done ? "success" : "info");
    } catch {
      setMsg("Could not send — retrying in the background.");
    }
    setBusy(false);
  };
  return (
    <span>
      {body}
      {needsPw ? (
        <span style={{ display: "block", marginTop: "0.5rem" }}>
          <label className="muted" htmlFor="livepw">
            Live admin password (typed once, kept in this browser only):
          </label>
          <span style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
            <input
              id="livepw"
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="••••••••••••"
              autoComplete="off"
              style={{ flex: "1 1 auto", minWidth: 0 }}
            />
            <button type="button" className="admin__linkbtn" disabled={busy || !pw} onClick={sendPw}>
              {busy ? "Sending…" : "Save & send to live"}
            </button>
          </span>
        </span>
      ) : null}
      {pending && !needsPw ? (
        <span style={{ display: "block", marginTop: "0.5rem" }}>
          <button type="button" className="admin__linkbtn" disabled={busy} onClick={sendNow}>
            {busy ? "Sending…" : "Send now"}
          </button>
        </span>
      ) : null}
      {msg ? (
        <span className="muted" style={{ display: "block", marginTop: "0.25rem" }}>
          {msg}
        </span>
      ) : null}
    </span>
  );
}

/* ----------------------------------------------------------------- dashboard */

export function Dashboard({
  state,
  onOpen,
}: {
  state: ReturnType<typeof cms.useCms>;
  /** Jump to a section — optionally opening and highlighting one of its entries. */
  onOpen: (id: string, entryKey?: string) => void;
}) {
  const draft = cms.getDraft();
  const changed = cms.pendingSections().filter((id) => !sectionIsHidden(id));

  const nextEvent = useMemo(() => {
    const list = [...(draft.events || [])].sort((a, b) => (a.offsetDays || 0) - (b.offsetDays || 0));
    return list[0];
  }, [draft, state.version]);

  const live = (draft.announcements || []).filter((a: any) => a.active !== false);

  return (
    <div className="admin__page">
      <SectionHeading
        eyebrow="What is live"
        title="Where things stand"
        lede="Whether your changes are live, who changed what, and what is coming up next."
      />

      <div className="admin__two">
        <Card>
          <h3>Where things stand</h3>
          <dl className="admin__kv">
            <div>
              <dt>Sharing</dt>
              <dd>
                <StatusPill state={state} />
              </dd>
            </div>
            <div>
              <dt>Last published</dt>
              <dd>
                {cms.timeAgo(state.updatedAt)}
                {state.updatedBy ? ` by ${state.updatedBy}` : ""}
              </dd>
            </div>
            <div>
              <dt>Waiting to publish</dt>
              <dd>{changed.length ? `${changed.length} part${changed.length === 1 ? "" : "s"} of the site` : "nothing"}</dd>
            </div>
            <div>
              <dt>Live site</dt>
              <dd>
                <LiveSiteRow />
              </dd>
            </div>
          </dl>
          {changed.length > 0 && (
            <div className="admin__chips">
              {changed.map((id) => (
                <button key={id} type="button" className="admin__chip" onClick={() => onOpen(id)}>
                  {sectionById(id)?.label || id}
                </button>
              ))}
            </div>
          )}
          {state.pendingLocal && (
            <Notice tone="sky">
              <b>Waiting to sync.</b> Changes saved while the shared server was unreachable are queued here and sent automatically as
              soon as the connection is back.
            </Notice>
          )}
        </Card>

        <Card>
          <h3>This week</h3>
          {nextEvent ? (
            <div className="admin__next">
              <Badge accent="gold" icon="calendar">
                Next activity
              </Badge>
              <h4>{nextEvent.title}</h4>
              <p className="muted">
                In {nextEvent.offsetDays} day{nextEvent.offsetDays === 1 ? "" : "s"} · {nextEvent.time} · {nextEvent.location}
              </p>
              <button
                type="button"
                className="admin__linkbtn"
                onClick={() => onOpen("events", nextEvent.id ? String(nextEvent.id) : undefined)}
              >
                Edit this activity
              </button>
            </div>
          ) : (
            <Empty icon="calendar" title="No activities scheduled" text="Add a conference, class or outreach and it will appear on the events calendar." />
          )}
          <div className="admin__mini">
            <span>
              <b>{live.length}</b> notice{live.length === 1 ? "" : "s"} showing on the site
            </span>
            <button
              type="button"
              className="admin__linkbtn"
              onClick={() => onOpen("announcements", live[0]?.id ? String(live[0].id) : undefined)}
            >
              Manage announcements
            </button>
          </div>
        </Card>
      </div>

      <SectionHeading
        eyebrow="History"
        title="Recent activity"
        lede={
          state.log.length
            ? `The last ${state.log.length} publish${state.log.length === 1 ? "" : "es"} to the shared server.`
            : "Nothing has been published from this console yet."
        }
      />
      <Card>
        {state.log.length === 0 ? (
          <p className="muted">Your first publish will appear here, with what changed and who changed it.</p>
        ) : (
          <ul className="admin__log">
            {state.log.map((entry) => {
              const isMain = entry.role !== "sub";
              const who = isMain ? "Admin" : entry.by || "Admin";
              return (
              <li key={`${entry.rev}-${entry.at}`}>
                <span className="admin__log-dot" aria-hidden="true">
                  •
                </span>
                <div className="admin__log-main">
                  <b>{entry.note || "Content updated"}</b>
                  <em>{cms.timeAgo(entry.at)}</em>
                  {entry.changed?.length ? (
                    <span className="admin__chips admin__chips--log">
                      {entry.changed.map((id: string) => {
                        const def = sectionById(id);
                        return def && !sectionIsHidden(id) ? (
                          <button key={id} type="button" className="admin__chip" onClick={() => onOpen(id)}>
                            {def.label}
                          </button>
                        ) : (
                          <span key={id} className="admin__log-id">
                            {def?.label || id}
                          </span>
                        );
                      })}
                    </span>
                  ) : null}
                </div>
                <span className={"admin__log-by" + (isMain ? " admin__log-by--main" : "")}>{who}</span>
            </li>
              );
            })}
          </ul>
        )}
        {state.log.length > 0 && state.role === "main" && <ClearLogButton />}
      </Card>

    </div>
  );
}

/* ---------------------------------------------- what happens when it ends */
function ClearLogButton() {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(t);
  }, [armed]);
  return (
    <div className="btn-row">
      <Btn size="sm" variant="ghost" icon="trash" disabled={busy} onClick={async () => {
        if (!armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        setBusy(true);
        const res = await cms.clearLog();
        setBusy(false);
        fireToast(res.ok ? "Publish history cleared. Recording starts fresh from your next publish." : `Could not clear history: ${res.error || "error"}`, res.ok ? "success" : "error");
      }}>
        {armed ? "Click again to confirm" : "Clear history"}
      </Btn>
    </div>
  );
}

/* Foot of the live section: the Previous-sermons count and the way to the messages. */

export function draftLive(): any {
  return cms.getDraft().live || {};
}

export function LiveEndingPanel({ onOpen, children }: { onOpen: (id: string) => void; children?: React.ReactNode }) {
  return (
    <Card className="admin__archive">
      {children}
      <div className="btn-row">
        <Btn size="sm" icon="archive" variant="ghost" onClick={() => onOpen("sermons")}>
          Open the sermon list
        </Btn>
      </div>
    </Card>
  );
}

/* ----------------------------------- the livestream transport: one play/pause button, one stop button */

/** The main slot's own transport (notes 390, 392, 404): one Play/Pause toggle
    plus one Stop, sitting right under the main channel field — and commanding
    nothing but the main slot. Every click stamps `liveCommandAt`. The main
    channel needs no click to start (note 400): @twocorg opens the screen by
    itself the moment YouTube is live — Play is only the manual override (a
    walled read, or a badge the office wants forced): published, it opens the
    channel itself while the read cannot confirm a broadcast. Pause HOLDS the
    session without ending it (the session start is kept, so play picks the
    same session back up); stop ENDS it (the start is cleared and the finished
    service files itself, so the next play begins fresh). The stop also empties
    the guest slot in the same stamped write — see `GuestTransportButtons` below. Publish sends the
    on-air state ONLY when a click stamped a newer command than what is
    published (see `gateLiveCommand` in src/lib/cms.ts) — an unclicked Publish
    leaves the site's on-air state alone, whatever the draft says. The buttons
    never gate a live end: when the broadcast ends the screen closes at once
    onto the main channel's previous-service thumbnails, published or not — a
    leaves the site's on-air state alone, whatever the draft says. When the
    broadcast ends by itself, nothing is written and nothing is filed: the
    office presses Stop, then Publish (the automatic stop was removed at the
    office's request — see src/lib/autostop.ts). */
export function LiveTransportButtons() {
  useCmsTick();
  const now = useNow(20000);
  const live = draftLive();
  const isOn = !!live.isLive;
  const since = Number(live.liveSince) || 0;
  const cut = Number(live.liveCut) || 0;
  /* The head-office gathering, read the same way the site reads a visitor's —
     the office broadcasts that branch's services, and it is the schedule the
     buttons are really about. */
  const info = nextService(SERVICES, now, churchTimezone());
  const clockLive = !!info?.isLive && !(cut >= info.at.getTime());
  /* A paused session waits to be picked back up (note 392): pause keeps the
     session start, stop clears it — so play resumes a hold but begins fresh
     after an end. A site left on air from before this panel existed carries
     no stamp, so there is nothing held: play begins fresh. */
  const heldSession = since > 0;
  const onNow = isOn || clockLive;
  /* The slot's own on-air light (note 406): the blinking red dot sits in
     this row while the main channel is live — the check's answer for the
     main address, or the office's own switch — so the office sees at a
     glance which field is on air. The countdown alone never lights it. */
  const airNow = useLiveStream();
  const mainUrl = liveTarget()?.url || "";
  const mainLive = (!!mainUrl && airNow.state === "live" && isStatusForTarget(airNow, mainUrl)) || isOn;
  const ready = !!(
    String(live.youtubeChannel || "").trim() ||
    String(live.youtubeId || "").trim() ||
    String(live.facebookUrl || "").trim()
  );
  /** Write the newest draft, so two presses in a row never fight each other. */
  const write = (patch: Record<string, any>) => {
    const latest = cms.getDraft().live || {};
    cms.setSectionValue("live", { ...latest, ...patch });
  };
  /* Play picks a held session back up where it paused, else begins a fresh
     one at the current time — either way the click stamps the command, and
     Publish sends it. */
  const play = () => {
    /* Stamp the verified broadcast into the draft at press time so Publish
       carries the real video + real headline — visitors open them at once
       with sound, no scrape wait, no reload. */
    const stampKnown = () => {
      try {
        const s = readLiveStatus();
        const mainUrl = liveTarget()?.url || "";
        if (s && s.state === "live" && s.videoId && mainUrl && isStatusForTarget(s, mainUrl)) {
          const latest = cms.getDraft().live || {};
          cms.setSectionValue("live", { ...latest, liveVideoId: s.videoId, liveVideoTitle: s.title || (latest as any).liveTitle || "", liveVideoChannelId: s.channelId || (latest as any).liveVideoChannelId || "", liveVideoAt: Date.now() });
        }
      } catch {}
    };
    const refineInBackground = () => {
      try {
        checkLiveStream().then((s) => {
          try {
            const mainUrl = liveTarget()?.url || "";
            if (s && (s as any).state === "live" && (s as any).videoId && mainUrl && isStatusForTarget(s as any, mainUrl)) {
              const latest = cms.getDraft().live || {};
              if ((latest as any).isLive) cms.setSectionValue("live", { ...latest, liveVideoId: (s as any).videoId, liveVideoTitle: (s as any).title || (latest as any).liveTitle || "", liveVideoChannelId: (s as any).channelId || "", liveVideoAt: Date.now() });
            }
          } catch {}
        }).catch(() => {});
      } catch {}
    };
    if (heldSession) {
      write({ isLive: true, liveCut: 0, liveEndedBy: "office", liveCommandAt: Date.now() });
      stampKnown();
      refineInBackground();
      recheckLiveNow();
      return;
    }
    write({ isLive: true, liveSince: Date.now(), liveCut: 0, liveEndedBy: "office", liveCommandAt: Date.now() });
    stampKnown();
    refineInBackground();
    /* A new session: read the channel now, so a service that has just been
       published shows up without waiting for the ten-minute timer. */
    askForRecentServices();
    /* …and ask the on-air check at once (note 310): if the stream is already
       up on the channel the site flips to it in seconds, on live and local. */
    recheckLiveNow();
  };
  /* Pause holds the broadcast without ending it (note 392): the session start
     is kept — no `liveSince` key here — so play picks the same session back
     up, and the finished service is NOT filed. */
  const pause = () => {
    write({ isLive: false, liveCut: Date.now(), liveEndedBy: "office", liveCommandAt: Date.now() });
    recheckLiveNow();
  };
  /* Stop ends the session straight (note 414): the live stops — the start is
     cleared, so the next play begins fresh — and the finished service files
     itself under Recent services. The temporary guest slot empties in the
     same stamped write, so Publish clears everything about the guest channel
     with the stop — and the unsaved change with it. */
  const stop = () => {
    const at = Date.now();
    write(clearGuestOnStop({ ...cms.getDraft().live, isLive: false, liveSince: 0, liveCut: at, liveEndedBy: "office", liveCommandAt: at, liveVideoId: "", liveVideoTitle: "", liveVideoChannelId: "", liveVideoAt: 0 }));
    recheckLiveNow();
    /* An ended service seeds Recent services now; every open page re-reads the channel.
       A temporary guest never seeds (note 379): its ending leaves the main
       channel's list — and the last-service still — alone. */
    const aired = readLiveStatus();
    const airedGuest = isGuestTargetUrl(aired.target || "", guestTarget()?.url || "");
    askForRecentServices(!airedGuest && aired.videoId ? { videoId: aired.videoId, title: aired.title } : undefined);
  };
  /* Reload repairs both slots at once (the general fix, same manual press as
     play/pause/stop): drops every poisoned verdict, stamps a reload press so
     Publish carries the fix, refreshes the verified video + headline for both
     slots behind, and re-asks the on-air check. Visitors remount + rejoin
     sound on the published press — any error, incl. blocked autoplay — with
     no page reload, staying on this site. */
  const reload = () => {
    const at = Date.now();
    /* Shared repair (visitor arrow runs the same): drop stale verdicts,
       re-ask what's live now, play the current broadcast by its fresh
       verified id. */
    try {
      forgetAllVerified();
    } catch {}
    try {
      const cur = cms.getDraft().live || {};
      for (const raw of [String((cur as any).liveVideoId || ""), String((cur as any).guestVideoId || "")]) {
        try { if (raw) forgetVerified(raw); } catch {}
      }
      try {
        const s = readLiveStatus();
        if (s && (s as any).videoId) { try { forgetVerified((s as any).videoId); } catch {} }
      } catch {}
    } catch {}
    write({ liveReloadAt: at, liveCommandAt: at });
    /* Local force ping: every open Watch screen in this browser repairs at
       once — before Publish — while the stamp above carries it to visitors. */
    try {
      pingLocalReload(at);
    } catch {}
    try {
      const stampBoth = (s: any) => {
        try {
          const mUrl = liveTarget()?.url || "";
          if (s && s.state === "live" && s.videoId && mUrl && isStatusForTarget(s, mUrl)) {
            const cur = cms.getDraft().live || {};
            cms.setSectionValue("live", { ...cur, liveVideoId: s.videoId, liveVideoTitle: s.title || (cur as any).liveTitle || "", liveVideoChannelId: s.channelId || "", liveVideoAt: Date.now() });
          }
        } catch {}
        try {
          const gUrl = guestTarget(String((cms.getDraft().live as any)?.externalYoutubeChannel || ""))?.url || "";
          if (s && s.state === "live" && s.videoId && gUrl && isStatusForTarget(s, gUrl)) {
            const cur2 = cms.getDraft().live || {};
            cms.setSectionValue("live", { ...cur2, guestVideoId: s.videoId, guestVideoTitle: s.title || (cur2 as any).liveTitle || "", guestVideoChannelId: s.channelId || "", guestVideoAt: Date.now() });
          }
        } catch {}
      };
      try {
        const s = readLiveStatus();
        if (s && (s as any).state === "live") stampBoth(s);
      } catch {}
      checkLiveStream().then((s) => { try { stampBoth(s); } catch {} }).catch(() => {});
    } catch {}
    recheckLiveNow();
    askForRecentServices();
    fireToast("Livestream reloaded — press Publish to send the fix to everyone watching.", "success");
  };

  return (
    <div className="admin__transport">
      <div className="transport-row">
        <div className="btn-row transport-row__btns">
          {onNow ? (
            <Btn size="sm" variant="gold" icon="pause" onClick={pause} title="Pause the livestream" ariaLabel="Pause the livestream">
              Pause
            </Btn>
          ) : (
            <Btn size="sm" variant="gold" icon="play" onClick={play} title="Play the livestream" ariaLabel="Play the livestream">
              Play
            </Btn>
          )}
          <Btn size="sm" variant="ghost" icon="stop" onClick={stop} title="Stop the livestream" ariaLabel="Stop the livestream">
            Stop
          </Btn>
          <Btn size="sm" variant="ghost" icon="refresh" onClick={reload} title="Reload the livestream — fixes sound, picture and errors on both channels" ariaLabel="Reload the livestream">
            Reload
          </Btn>
          {mainLive && (
            <span className="live-badge transport-row__live" role="status">
              <span className="live-dot" aria-hidden="true" /> Live
            </span>
          )}
        </div>
      </div>
      {onNow && !ready && (
        <p className="admin__live-warn">
          <Icon name="alert" size={14} />
          <span>
            Nothing is set to play yet. Paste the stream link, or the channel to watch, in the fields above — until then
            the Watch live screen stays on the countdown until the channel is live — no press needed, Play is only a manual override.
          </span>
        </p>
      )}
    </div>
  );
}

/** The guest slot's own transport (note 404): one Play/Pause toggle plus one
    Stop, sitting right under the guest channel field — and commanding nothing
    but the guest slot, on its own `guestIsLive` / `guestCommandAt` keys, so
    one row's buttons never work the other. Play needs a guest typed first
    (an empty slot names its field instead of touching the main channel);
    pause holds the guest override off; stop ends it AND empties the slot, so
    the guest field is empty again after every guest stop. A guest ending
    files nothing, like every guest end. Every click stamps `guestCommandAt`,
    and Publish sends the guest state ONLY on a newer guest click (see
    `gateLiveCommand` in src/lib/cms.ts). */
export function GuestTransportButtons() {
  useCmsTick();
  const live = draftLive();
  const guestOn = !!(live as any).guestIsLive;
  /* The guest slot's own on-air light (note 406): the blinking red dot sits
     in this row while the guest address is live — the check's answer for the
     typed guest field, or the guest row's own switch. */
  const guestAirNow = useLiveStream();
  const guestUrlNow = guestTarget(String((live as any).externalYoutubeChannel || ""))?.url || "";
  const guestLiveNow = (!!guestUrlNow && guestAirNow.state === "live" && isStatusForTarget(guestAirNow, guestUrlNow)) || guestOn;
  /** Write the newest draft, so two presses in a row never fight each other. */
  const write = (patch: Record<string, any>) => {
    const latest = cms.getDraft().live || {};
    cms.setSectionValue("live", { ...latest, ...patch });
  };
  /* Guest play arms the guest override — main untouched. */
  const play = () => {
    const latest = cms.getDraft().live || {};
    if (!String((latest as any).externalYoutubeChannel || "").trim()) {
      fireToast("Type the guest channel first — there is no guest to override.", "info");
      return;
    }
    write({ guestIsLive: true, guestCommandAt: Date.now() });
    try {
      const s = readLiveStatus();
      const gUrl = guestTarget(String((cms.getDraft().live as any)?.externalYoutubeChannel || ""))?.url || "";
      if (s && s.state === "live" && s.videoId && gUrl && isStatusForTarget(s, gUrl)) {
        const cur = cms.getDraft().live || {};
        cms.setSectionValue("live", { ...cur, guestVideoId: s.videoId, guestVideoTitle: s.title || (cur as any).liveTitle || "", guestVideoChannelId: s.channelId || "", guestVideoAt: Date.now() });
      }
      checkLiveStream().then((ns) => {
        try {
          const gU = guestTarget(String((cms.getDraft().live as any)?.externalYoutubeChannel || ""))?.url || "";
          if (ns && (ns as any).state === "live" && (ns as any).videoId && gU && isStatusForTarget(ns as any, gU)) {
            const cur2 = cms.getDraft().live || {};
            if ((cur2 as any).guestIsLive) cms.setSectionValue("live", { ...cur2, guestVideoId: (ns as any).videoId, guestVideoTitle: (ns as any).title || (cur2 as any).liveTitle || "", guestVideoChannelId: (ns as any).channelId || "", guestVideoAt: Date.now() });
          }
        } catch {}
      }).catch(() => {});
    } catch {}
    recheckLiveNow();
  };
  /* Guest pause holds the override off without clearing the slot. */
  const pause = () => {
    write({ guestIsLive: false, guestCommandAt: Date.now() });
    recheckLiveNow();
  };
  /* Guest stop ends the override AND empties the slot (main untouched, and a
     guest ending files nothing under Recent services). */
  const stop = () => {
    const latest = cms.getDraft().live || {};
    const hadGuest = String((latest as any).externalYoutubeChannel || "").trim() !== "";
    write({ guestIsLive: false, guestCommandAt: Date.now(), guestVideoId: "", guestVideoTitle: "", guestVideoChannelId: "", guestVideoAt: 0, ...(hadGuest ? { externalYoutubeChannel: "" } : {}) });
    recheckLiveNow();
  };
  /* Guest Reload repairs the guest slot the same manual way (stamping the
     guest press so Publish carries it); poisoned verdicts for both slots are
     dropped and both slots restamp behind, so one press fixes whichever side
     is misbehaving. Visitors remount + rejoin sound on the published press. */
  const reload = () => {
    const at = Date.now();
    /* Shared repair (visitor arrow runs the same): drop stale verdicts,
       re-ask what's live now, play the current broadcast by its fresh
       verified id. */
    try {
      forgetAllVerified();
    } catch {}
    try {
      const cur = cms.getDraft().live || {};
      for (const raw of [String((cur as any).liveVideoId || ""), String((cur as any).guestVideoId || "")]) {
        try { if (raw) forgetVerified(raw); } catch {}
      }
      try {
        const s = readLiveStatus();
        if (s && (s as any).videoId) { try { forgetVerified((s as any).videoId); } catch {} }
      } catch {}
    } catch {}
    write({ liveReloadAt: at, guestCommandAt: at });
    /* Local force ping: every open Watch screen in this browser repairs at
       once — before Publish — while the stamp above carries it to visitors. */
    try {
      pingLocalReload(at);
    } catch {}
    try {
      const stampBoth = (s: any) => {
        try {
          const mUrl = liveTarget()?.url || "";
          if (s && s.state === "live" && s.videoId && mUrl && isStatusForTarget(s, mUrl)) {
            const cur = cms.getDraft().live || {};
            cms.setSectionValue("live", { ...cur, liveVideoId: s.videoId, liveVideoTitle: s.title || (cur as any).liveTitle || "", liveVideoChannelId: s.channelId || "", liveVideoAt: Date.now() });
          }
        } catch {}
        try {
          const gUrl = guestTarget(String((cms.getDraft().live as any)?.externalYoutubeChannel || ""))?.url || "";
          if (s && s.state === "live" && s.videoId && gUrl && isStatusForTarget(s, gUrl)) {
            const cur2 = cms.getDraft().live || {};
            cms.setSectionValue("live", { ...cur2, guestVideoId: s.videoId, guestVideoTitle: s.title || (cur2 as any).liveTitle || "", guestVideoChannelId: s.channelId || "", guestVideoAt: Date.now() });
          }
        } catch {}
      };
      try {
        const s = readLiveStatus();
        if (s && (s as any).state === "live") stampBoth(s);
      } catch {}
      checkLiveStream().then((s) => { try { stampBoth(s); } catch {} }).catch(() => {});
    } catch {}
    recheckLiveNow();
    askForRecentServices();
    fireToast("Guest stream reloaded — press Publish to send the fix to everyone watching.", "success");
  };

  return (
    <div className="admin__transport">
      <div className="transport-row">
        <div className="btn-row transport-row__btns">
          {guestOn ? (
            <Btn size="sm" variant="gold" icon="pause" onClick={pause} title="Pause the livestream" ariaLabel="Pause the livestream">
              Pause
            </Btn>
          ) : (
            <Btn size="sm" variant="gold" icon="play" onClick={play} title="Play the livestream" ariaLabel="Play the livestream">
              Play
            </Btn>
          )}
          <Btn size="sm" variant="ghost" icon="stop" onClick={stop} title="Stop the livestream" ariaLabel="Stop the livestream">
            Stop
          </Btn>
          <Btn size="sm" variant="ghost" icon="refresh" onClick={reload} title="Reload the guest stream — fixes sound, picture and errors" ariaLabel="Reload the guest stream">
            Reload
          </Btn>
          {guestLiveNow && (
            <span className="live-badge transport-row__live" role="status">
              <span className="live-dot" aria-hidden="true" /> Live
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- the services the site is carrying */

/** Whatever channel the field names, read for its previous lives (admin
    only): the last previous live broadcasts, newest first — re-read when the
    field moves, when a service is seeded or ends, and on a quiet cadence. */
function usePreviousLives(channel: string) {
  const [lives, setLives] = useState<RecentService[]>([]);
  const [reading, setReading] = useState(false);
  useEffect(() => {
    let alive = true;
    if (!channel) {
      setLives([]);
      setReading(false);
      return;
    }
    setReading(true);
    const read = () => {
      fetchPreviousLives(channel, 24)
        .then((res) => {
          if (!alive) return;
          setReading(false);
          setLives(res ? res.items : []);
        })
        .catch(() => {
          if (!alive) return;
          setReading(false);
          setLives([]);
        });
    };
    /* The field types ahead of the read: wait out the keystrokes. */
    const timer = window.setTimeout(read, 700);
    const unsub = subscribeRecentServices(read);
    const iv = window.setInterval(read, 90_000);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      window.clearInterval(iv);
      unsub();
    };
  }, [channel]);
  return { lives, reading };
}

/** Finished services, read from the channel in the field above; take-offs publish with the section (note 109). */
export function RecentServicesPanel() {
  useCmsTick();
  const live = draftLive();
  const limit = recentLimit(live.recentLimit);

  /* Read from the draft, so a take-off shows here, on the live section and on
     the page in the same breath (the applied content follows). */
  const hiddenIds: string[] = Array.isArray(live.hiddenReplays) ? live.hiddenReplays.map((id: any) => String(id)) : [];
  const hidden = new Set(hiddenIds);
  const channelSet = !!String(live.youtubeChannel || "").trim();
  const cleanedChannel = String(live.youtubeChannel || "").trim().replace(/@@+/g, "@").replace(/\s+/g, "");
  /* Any channel in the field takes the last previous lives: the panel follows
     the draft channel above — its last previous live broadcasts — with a
     just-ended service seeded on top while YouTube publishes it. */
  const { lives, reading } = usePreviousLives(cleanedChannel);
  const seeds = readRecentServices().items.filter((it) => it.seeded && !lives.some((l) => l.videoId === it.videoId));
  const items = [...seeds, ...lives];
  const shown = items.filter((it) => !hidden.has(it.videoId)).slice(0, limit);
  const off = hiddenIds.map(
    (id) =>
      items.find((it) => it.videoId === id) || {
        videoId: id,
        title: "",
        thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        at: 0,
        ago: "",
      }
  );

  const writeHidden = (ids: string[]) => {
    const latest = cms.getDraft().live || {};
    cms.setSectionValue("live", { ...latest, hiddenReplays: ids });
  };
  const takeOff = (id: string) => {
    writeHidden([...hiddenIds, id]);
    fireToast("Taken off the site. Publish to make it hold for everyone.", "info");
  };
  const putBack = (id: string) => writeHidden(hiddenIds.filter((x) => x !== id));

  /* One tap back to the church's channel (note 346): restores carry
     debugging channels otherwise, and the recents follow the published
     channel — so the wrong list stays until a @twocorg publish moves it. */
  const resetChannel = () => {
    const latest = cms.getDraft().live || {};
    cms.setSectionValue("live", { ...latest, youtubeChannel: "@twocorg" });
    fireToast("Channel reset to @twocorg — Review and publish to put it live. The old list clears out as @twocorg's services arrive.", "success");
  };
  const when = (it: any) => (it.at ? fmtDate(new Date(it.at), "long") : it.ago || "Recently");

  return (
    <Card className="admin__recent">
      <div className="admin__archive-head">
        <span className="admin__archive-icon">
          <Icon name="youtube" size={18} />
        </span>
        <div>
          <h3>Recent services</h3>
        </div>
      </div>

      {cleanedChannel.toLowerCase() !== "@twocorg" && (
        <Notice icon="alert" tone="gold">
          This list follows {live.youtubeChannel ? live.youtubeChannel : "no channel"} — not the church's channel.{" "}
          <button type="button" className="admin__linkbtn" onClick={resetChannel}>
            Reset to @twocorg
          </button>{" "}
          — then Review and publish to move every copy.
        </Notice>
      )}

      {shown.length > 0 ? (
        <ul className="admin__recent-list">
          {shown.map((it) => (
            <li key={it.videoId}>
              <img className="admin__recent-thumb" src={it.thumb} alt="" loading="lazy" />
              <span className="admin__recent-copy">
                <b>{it.title || "A service"}</b>
                <em>{when(it)}</em>
              </span>
              <a className="admin__recent-open" href={ytWatch(it.videoId)} target="_blank" rel="noreferrer">
                YouTube <Icon name="external" size={12} />
              </a>
              <ConfirmIcon
                className="admin__recent-remove"
                title="Take this service off the site"
                label="Take it off"
                onConfirm={() => takeOff(it.videoId)}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">
          {!channelSet
            ? "Paste the channel above (the YouTube channel the page watches) and the finished services appear here by themselves."
            : reading
            ? `Reading ${cleanedChannel}'s previous lives…`
            : "No previous lives on this channel yet — they appear here as services finish."}
        </p>
      )}

      {off.length > 0 && (
        <div className="admin__recent-off">
          <b>Taken off the site</b>
          <ul className="admin__recent-list">
            {off.map((it: any) => (
              <li key={it.videoId}>
                <img className="admin__recent-thumb" src={it.thumb} alt="" loading="lazy" />
                <span className="admin__recent-copy">
                  <b>{it.title || "A service"}</b>
                  <em>{it.videoId}</em>
                </span>
                <button type="button" className="admin__linkbtn" onClick={() => putBack(it.videoId)}>
                  Put it back
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------ the activity on right now */

/** One activity as the panel below needs it: when it is, and on whose clock. */
type ActivityRow = {
  event: ChurchEvent;
  index: number;
  start: Date;
  end: Date;
  /** Days from today on the office's own clock: 0 = today, 1 = tomorrow. */
  days: number;
  day: number;
  month: number;
  /** The date and time as the office's own clock reads them (SPEC note 85). */
  weekday: number;
  time: string;
  running: boolean;
  past: boolean;
};

/** The activity on now (or next), with a straight line to its form; draft-backed. */
export function CurrentEventPanel({ onOpen }: { onOpen: (id: string, entryKey?: string) => void }) {
  useCmsTick();
  const now = useNow(30000);
  const events = (cms.getDraft().events || []) as ChurchEvent[];

  const rows = useMemo<ActivityRow[]>(() => {
    const office = zonedParts(now);
    return events
      .map((event, index) => {
        const start = eventDate(event, now);
        const end = new Date(start.getTime() + (Number(event.durationMin) || 120) * 60000);
        const p = zonedParts(start);
        const c = clockAt(start);
        return {
          event,
          index,
          start,
          end,
          days: Math.round((Date.UTC(p.year, p.month - 1, p.day) - Date.UTC(office.year, office.month - 1, office.day)) / 86400000),
          day: p.day,
          month: p.month,
          weekday: c.day,
          time: to12h(c.time),
          running: now >= start && now < end,
          past: now >= end,
        };
      })
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [events, now]);

  const running = rows.filter((r) => r.running);
  const laterToday = rows.filter((r) => !r.running && !r.past && r.days === 0);
  const upcoming = rows.filter((r) => !r.running && !r.past);
  const current = running[0] || laterToday[0] || upcoming[0];
  const others = [...running, ...laterToday].filter((r) => r !== current);

  /* How an activity's moment reads to the office: it is on, it is still to come
     today, or it is on some named day. */
  const when = (r: ActivityRow) =>
    r.running
      ? `On now · until ${to12h(clockAt(r.end).time)}`
      : r.days === 0
      ? `Later today · ${r.time}`
      : r.days === 1
      ? `Tomorrow · ${r.time}`
      : `${DAY_SHORT[r.weekday]} ${MONTH_SHORT[r.month - 1]} ${r.day} · ${r.time}`;
  const city = (r: ActivityRow) => BRANCHES.find((b) => b.id === r.event.branchId)?.city || "";
  /* A row the drawer can find: an entry without an id is matched by its place
     in the list, which is how the console looks entries up (see ListBlock). */
  const keyOfRow = (r: ActivityRow) => String((r.event as any)?.id || r.index);

  const heading =
    running.length > 0 ? "Happening right now" : laterToday.length > 0 ? "Still to come today" : "Coming up next";

  return (
    <Card className="admin__now">
      <div className="admin__archive-head">
        <span className="admin__archive-icon">
          <Icon name="calendar" size={18} />
        </span>
        <div>
          <h3>{heading}</h3>
          <p>
            The activity the site is carrying at the moment, with a line straight to its details. Dates are stored as
            “so many days from today”, so the calendar keeps itself up to date without anyone editing it.
          </p>
        </div>
      </div>

      {current ? (
        <>
          <div className={"admin__now-card" + (current.running ? " is-live" : "")}>
            <span className="admin__now-when">
              {current.running ? <span className="live-dot" aria-hidden="true" /> : <Icon name="clock" size={14} />}
              {when(current)}
            </span>
            <b>{current.event.title || "Untitled activity"}</b>
            <em>{[current.event.location, city(current)].filter(Boolean).join(" · ")}</em>
            {current.event.featured && (
              <Badge accent="gold" icon="star">
                On the home page
              </Badge>
            )}
            <div className="btn-row">
              <Btn size="sm" icon="pencil" onClick={() => onOpen("events", keyOfRow(current))}>
                Edit this event
              </Btn>
            </div>
          </div>

          {others.length > 0 && (
            <ul className="admin__now-list">
              {others.map((r) => (
                <li key={keyOfRow(r)}>
                  <span className="admin__now-when">
                    {r.running ? <span className="live-dot" aria-hidden="true" /> : <Icon name="clock" size={14} />}
                    {when(r)}
                  </span>
                  <b>{r.event.title || "Untitled activity"}</b>
                  <button type="button" className="admin__linkbtn" onClick={() => onOpen("events", keyOfRow(r))}>
                    Edit
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="muted">
          Nothing is on the calendar yet — add a conference, class or outreach below and it appears here, on the site
          and on the home page.
        </p>
      )}
    </Card>
  );
}

/* --------------------------------------------------------------- field types */

/* Office-server uploads land in data/uploads/ (same-origin or absolute). */
function isLocalHost(): boolean {
  try {
    const host = window.location?.hostname || "";
    return host === "localhost" || host === "127.0.0.1" || host === "";
  } catch {
    return false;
  }
}

async function localHostFile(blob: Blob, filename: string): Promise<string> {
  const base = serverUrl();
  if (!base && !isLocalHost())
    throw new Error("Uploads need the office server connection — connect it in the admin console, or paste a link instead.");
  /* HIGH fix: file writes prove the office conn, so strangers cannot store
     files on the server. Wait briefly for the join when it is still opening. */
  if (!cms.officeFileConn()) {
    try {
      await cms.ensureOnline(8000);
    } catch {}
  }
  const res = await fetch(`${base}/__upload?conn=${encodeURIComponent(cms.officeFileConn())}&name=${encodeURIComponent(filename)}`, {
    method: "POST",
    headers: { "content-type": blob.type || "application/octet-stream" },
    body: blob,
  });
  if (res.status === 403) throw new Error("Sign in to the admin console first, then upload again.");
  if (!res.ok) throw new Error("The file could not be saved. Try a smaller file, or paste a link instead.");
  const data = await res.json().catch(() => null);
  if (!data || typeof data.url !== "string" || !data.url)
    throw new Error("The file could not be saved. Try again, or paste a link instead.");
  return base ? base + data.url : data.url;
}

/* The stored name inside an office-server address, or "" for anything else
   (bundled photos, pasted links, CDN pictures are not office uploads). */
function hostedUploadName(url: string): string {
  const m = /\/data\/uploads\/([A-Za-z0-9][A-Za-z0-9._-]*)/.exec(String(url || ""));
  return m ? m[1] : "";
}

/* Delete an office-server upload for good — it leaves data/uploads/ and
   afterwards simply stops riding in backups. Two-tap confirmed at the call
   site, because every page using it loses its picture until republished. */
async function deleteHostFile(name: string): Promise<void> {
  const base = serverUrl();
  if (!base && !isLocalHost()) throw new Error("The office server connection is needed to delete it — connect it in the admin console.");
  if (!cms.officeFileConn()) {
    try {
      await cms.ensureOnline(8000);
    } catch {}
  }
  const res = await fetch(`${base}/__delete-file?conn=${encodeURIComponent(cms.officeFileConn())}&name=${encodeURIComponent(name)}`, { method: "POST" });
  if (res.status === 403) throw new Error("Sign in to the admin console first, then delete again.");
  if (res.status === 404) throw new Error("It is already gone from the office server.");
  if (!res.ok) throw new Error("It could not be deleted on the server.");
}

/* The two-tap "delete it from the office" control behind a photo or video.
   Renders nothing for addresses the office server does not hold. */
function DeleteUpload({ url, what, onGone }: { url: string; what: string; onGone: () => void }) {
  const name = hostedUploadName(url);
  const [busy, setBusy] = useState(false);
  if (!name) return null;
  const go = async () => {
    setBusy(true);
    try {
      await deleteHostFile(name);
      onGone();
      fireToast(`${what} deleted from the office — publish to take it off the site.`, "success");
    } catch (err) {
      fireToast(err instanceof Error ? err.message : "It could not be deleted.", "error");
    }
    setBusy(false);
  };
  if (busy) return <span className="field__hint">Deleting…</span>;
  return (
    <ConfirmIcon
      onConfirm={go}
      title={`Delete this ${what.toLowerCase()} from the office server — it stops showing everywhere it is used`}
      label={`Delete ${what.toLowerCase()} from the office`}
    />
  );
}

/* Phone/computer photos shrink first, then host; `frame: "slide"` re-cuts to the slide frame. */

export function PhotoUpload({ onDone, frame }: { onDone: (url: string) => void; frame?: "slide" }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const forSlide = frame === "slide";

  const upload = async (file: File) => {
    setError("");
    setBusy(true);
    try {
      /* Slides take pictures only: the re-cut sets the size, so the picture
         goes in at full size and comes out 1600×1200. */
      const blob = forSlide ? await frameImageBlob(file) : await compressImageBlob(file, 1600, 0.82);
      const url = await localHostFile(blob, file.name || "photo.jpg");
      /* Sleep-free (note 413): keep the bytes in this browser so a host sleep never blanks the slide. */
      try {
        const kept = uploadNameOf(url);
        if (kept) cacheUploadBlob(kept, blob).catch(() => {});
      } catch {}
      onDone(url);
      fireToast(
        forSlide ? "Picture fitted to the slide — publish to put it on the site." : "Photo ready — publish to put it on the site.",
        "success"
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="admin__upload">
      <input
        ref={inputRef}
        className="admin__file"
        type="file"
        accept="image/*"
        aria-label={forSlide ? "Choose a picture for the slide" : "Choose a photo to upload"}
        onChange={(e) => {
          const file = e.target.files && e.target.files[0];
          if (file) upload(file);
        }}
      />
      <Btn size="sm" icon="camera" disabled={busy} onClick={() => inputRef.current && inputRef.current.click()}>
        {busy ? "Uploading your photo…" : forSlide ? "Upload a picture" : "Upload a photo"}
      </Btn>
      {error && <p className="admin__upload-error">{error}</p>}
    </div>
  );
}

/* Message videos are kept on the office server (data/uploads/). */
export function VideoUpload({ onDone }: { onDone: (url: string) => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const upload = async (file: File) => {
    setError("");
    setBusy(true);
    try {
      const url = await localHostFile(file, file.name || "video.mp4");
      try {
        const kept = uploadNameOf(url);
        if (kept) cacheUploadBlob(kept, file).catch(() => {});
      } catch {}
      onDone(url);
      fireToast("Video ready — publish to put it on the site.", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="admin__upload">
      <input
        ref={inputRef}
        className="admin__file"
        type="file"
        accept="video/mp4,video/webm,video/ogg,video/quicktime,video/*"
        aria-label="Choose a video to upload"
        onChange={(e) => {
          const file = e.target.files && e.target.files[0];
          if (file) upload(file);
        }}
      />
      <Btn size="sm" icon="play" disabled={busy} onClick={() => inputRef.current && inputRef.current.click()}>
        {busy ? "Uploading your video… this can take a while" : "Upload a video"}
      </Btn>
      {error && <p className="admin__upload-error">{error}</p>}
    </div>
  );
}

/* The video control: the player preview, the upload, and a pasted address. */
function VideoField({
  def,
  value,
  onChange,
  label,
}: {
  def: FieldDef;
  value: any;
  onChange: (v: any) => void;
  label?: string;
}) {
  const url = value === undefined || value === null ? "" : String(value);
  const address = url.trim();
  const cachedVideo = useCachedUploadUrl(address);
  const feedVideo = useFeedUploadUrl(address);
  const videoSrc = cachedVideo || address;
  const [videoUseFeed, setVideoUseFeed] = useState(false);
  useEffect(() => {
    setVideoUseFeed(false);
  }, [address]);
  const vSrc = videoUseFeed && feedVideo ? feedVideo : videoSrc;

  return (
    <div className="admin__wide">
      <Field label={label} hint={def.hint}>
        <div className="admin__videofield">
          <span className="admin__videopreview">
            {address ? (
              <video
                key={vSrc}
                src={vSrc}
                playsInline
                preload="metadata"
                muted
                disablePictureInPicture
                onError={() => {
                  if (feedVideo && feedVideo !== videoSrc) setVideoUseFeed(true);
                }}
              />
            ) : (
              <Icon name="play" size={20} />
            )}
          </span>
          <div className="admin__videoinputs">
            <VideoUpload onDone={(made) => onChange(made)} />
            <Input value={url} onChange={(e) => onChange(e.target.value)} placeholder="…or paste the address of a video file" />
            {address && (
              <div className="btn-row">
                <Btn size="sm" variant="quiet" icon="trash" onClick={() => onChange("")}>
                  Remove the video
                </Btn>
                <DeleteUpload url={address} what="Video" onGone={() => onChange("")} />
              </div>
            )}
          </div>
        </div>
      </Field>
    </div>
  );
}

/** One photo control for every picture: upload, paste an address, or clear. */
function ImageField({
  def,
  value,
  onChange,
  label,
}: {
  def: FieldDef;
  value: any;
  onChange: (v: any) => void;
  label?: string;
}) {
  const text = value === undefined || value === null ? "" : String(value);
  const key = photoKeyOf(text);
  const slot = photoById(def.path);
  const ownSlot = !!slot && slot.key === def.path;
  const custom = !!text && !key;
  /* What the site shows when this field is empty: the slot's own photo, the
     bundled photo a record falls back to, or nothing at all. */
  const original = slot ? siteFile(slotBundledPhoto(slot.key)) : def.fallbackPhoto ? siteFile(bundledPhoto(def.fallbackPhoto)) : "";
  const rawPreview = resolvePhoto(text) || original;
  /* Sleep-free (note 413): a wiped server copy previews the cached upload
     from this browser instead of the camera placeholder — blank-free. */
  const cachedPreview = useCachedUploadUrl(rawPreview);
  const feedPreview = useFeedUploadUrl(rawPreview);
  const preview = cachedPreview || rawPreview;
  const chosenLabel = key ? PHOTO_SLOTS.find((s) => s.key === key)?.label || key : "";
  const forSlide = def.frame === "slide";
  const [fitting, setFitting] = useState(false);
  const [fitError, setFitError] = useState("");
  /* A dead address (an upload that no longer resolves) shows the camera
     placeholder instead of a torn preview — every upload, every size. */
  const [imgError, setImgError] = useState(false);
  const [feedFailed, setFeedFailed] = useState(false);
  useEffect(() => {
    setImgError(false);
    setFeedFailed(false);
  }, [preview]);
  /* The agent reads the picture's own shape, so it can prompt exactly when the
     picture is not landscape. */
  const [shape, setShape] = useState<{ w: number; h: number } | null>(null);
  const [agentOff, setAgentOff] = useState("");
  useEffect(() => {
    if (!forSlide || !preview) {
      setShape(null);
      return;
    }
    let alive = true;
    const pic = new Image();
    pic.onload = () => {
      if (alive) setShape({ w: pic.naturalWidth || 0, h: pic.naturalHeight || 0 });
    };
    pic.onerror = () => {
      if (alive) setShape(null);
    };
    pic.src = preview;
    return () => {
      alive = false;
    };
  }, [preview, forSlide]);

  /* Pasted addresses set into the slide frame (1600x1200) untouched, no blur. */
  const fitPasted = async () => {
    if (fitting || !custom) return;
    setFitError("");
    setFitting(true);
    try {
      const framed = await framePastedSlide(text);
      if (!framed) throw new Error("That address could not be read as a picture. Check the link, or upload the picture instead.");
      const fittedUrl = await localHostFile(framed, "slide.jpg");
      try {
        const kept = uploadNameOf(fittedUrl);
        if (kept) cacheUploadBlob(kept, framed).catch(() => {});
      } catch {}
      onChange(fittedUrl);
      fireToast("Picture set into the slide — publish to put it on the site.", "success");
    } catch (err) {
      setFitError(err instanceof Error ? err.message : String(err));
    } finally {
      setFitting(false);
    }
  };

  /* The agent prompts only for a pasted picture that is not landscape: uploads
    are already re-cut on the way up, and a framed picture is 1600×1200. */
  /* Slides take pictures only (video upload was removed): a pasted link that
     looks like a film is named, not previewed — films already live keep
     playing on the site until the office replaces them. */
  const slideVideoLink = forSlide && /\.(mp4|m4v|webm|ogv|ogg|mov)(\?|#|$)/i.test(String(text || "").trim());
  const needsLandscape =
    forSlide && custom && !slideVideoLink && shape && shape.w > 0 && shape.h > 0 && shape.w < shape.h * 1.1 && agentOff !== preview;
  const squareish = !!shape && shape.w > 0 && shape.h > 0 && Math.abs(shape.w - shape.h) / Math.max(shape.w, shape.h) < 0.12;

  const caption = slideVideoLink
    ? "That link looks like a video — slides take pictures only. Films already live keep playing until you replace them."
    : custom
    ? "Your own photo is in use."
    : key
    ? `Using “${chosenLabel}”.`
    : ownSlot
    ? "The original photo is in use."
    : def.fallbackPhoto
    ? "No photo of its own — the site's own picture shows here."
    : def.emptyNote || "Nothing set here yet.";

  return (
    <Field label={label} hint={def.hint || (forSlide ? "Upload a picture from your phone or computer, or paste the address of one." : "Upload a photo from your phone or computer, or paste the address of one.")}>
      <div className="admin__imagefield">
        <span className={"admin__imagepreview" + (forSlide ? " admin__imagepreview--slide" : "")}>
          {preview && !slideVideoLink && !imgError ? (
            <img src={preview} alt="" draggable={false} onError={() => setImgError(true)} />
          ) : preview && !slideVideoLink && imgError && feedPreview && feedPreview !== preview && !feedFailed ? (
            <img src={feedPreview} alt="" draggable={false} onError={() => setFeedFailed(true)} />
          ) : (
            <Icon name="camera" size={18} />
          )}
        </span>
        <div className="admin__imageinputs">
          <p className="admin__imagecaption">{caption}</p>
          <PhotoUpload onDone={(url) => onChange(url)} frame={def.frame} />
          <Input
            value={custom ? text : ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder="…or paste a photo link"
            aria-label="Paste the address of a photo"
          />
          {forSlide && custom && !slideVideoLink ? (
            <Btn size="sm" icon="refresh" disabled={fitting} onClick={fitPasted}>
              {fitting ? "Fitting your picture…" : "Fit to the slide"}
            </Btn>
          ) : null}
          {needsLandscape ? (
            <div className="admin__agent" role="status">
              <p className="admin__agent-head">
                <Icon name="sparkle" size={14} />
                <span>Slide helper</span>
              </p>
              <p className="admin__agent-text">
                {squareish ? "This picture is square" : "This picture is portrait"}
                {shape ? ` (${shape.w} × ${shape.h})` : ""}, but slides show in landscape (1600 × 1200).
                Set it to fit the slide? The whole picture goes in uncropped and sharp, resting on a background drawn from its own colours — the slide simply shows your picture as it is. If your designer also sent a wide version of this same flyer, upload that instead — it goes on exactly as it is.
              </p>
              <div className="admin__agent-row">
                <Btn size="sm" icon="refresh" disabled={fitting} onClick={fitPasted}>
                  {fitting ? "Setting it in…" : "Set into landscape"}
                </Btn>
                <Btn size="sm" variant="quiet" onClick={() => setAgentOff(preview)}>
                  Keep as is
                </Btn>
              </div>
            </div>
          ) : null}
          {fitError && <p className="admin__upload-error">{fitError}</p>}
          {text && (
            <div className="btn-row">
              <Btn size="sm" variant="quiet" icon="trash" onClick={() => onChange("")}>
                Use the original photo
              </Btn>
              <DeleteUpload url={text} what="Photo" onGone={() => onChange("")} />
            </div>
          )}
        </div>
      </div>
    </Field>
  );
}

/* Testimony kinds are managed inside the entry (add assigns; remove guards use). */
function TestimonyKindField({
  value,
  onChange,
  draft,
  label,
  entry,
}: {
  value: any;
  onChange: (v: any) => void;
  draft: cms.Snapshot;
  label?: string;
  entry?: any;
}) {
  const obj = draft.testimonies;
  const cats: any[] = Array.isArray(obj) ? [] : Array.isArray((obj as any)?.categories) ? (obj as any).categories : [];
  const items: any[] = Array.isArray(obj) ? obj : Array.isArray((obj as any)?.items) ? (obj as any).items : [];
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [accent, setAccent] = useState<string>("gold");
  const writeCats = (next: any[]) => {
    const cur = obj && typeof obj === "object" && !Array.isArray(obj) ? obj : { items: obj };
    cms.setSectionValue("testimonies", { ...cur, categories: next });
  };
  const options = cats
    .filter((c) => String(c?.id || "").trim())
    .map((c) => ({ value: String(c.id), label: String(c.label || c.id) }));
  if (value && !options.some((o) => o.value === String(value))) {
    options.push({ value: String(value), label: String(value) + " (missing)" });
  }
  const usedByOthers = items.filter((t) => t !== entry && t?.category === value).length;
  const lastOne = cats.length <= 1;
  const blockReason = !value
    ? "Choose a kind first."
    : lastOne
      ? "Keep at least one kind of grace."
      : usedByOthers > 0
        ? `Used by ${usedByOthers} other ${usedByOthers === 1 ? "testimony" : "testimonies"} — change ${usedByOthers === 1 ? "it" : "them"} first.`
        : null;
  const removeKind = () => {
    if (blockReason) return;
    const rest = cats.filter((c) => String(c?.id) !== String(value));
    writeCats(rest);
    /* This entry (the only user left) moves to a kind that remains. */
    if (entry?.category === value) {
      const fallback = rest.find((c) => String(c?.id) === "other") || rest[0];
      if (fallback) onChange(String(fallback.id));
    }
  };
  const addKind = () => {
    const labelText = name.trim();
    if (!labelText) return;
    const id = uniqueId(cats, "id", { label: labelText });
    writeCats([...cats, { id, label: labelText, accent }]);
    onChange(id);
    setName("");
    setAccent("gold");
    setAdding(false);
  };
  return (
    <Field label={label || "Kind of grace"}>
      <div className="admin__chip-row">
        <Select value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} options={options} />
        {blockReason ? (
          <button type="button" title={blockReason} disabled className="admin__danger-btn">
            <Icon name="trash" size={14} />
          </button>
        ) : (
          <ConfirmIcon onConfirm={removeKind} title="Remove this kind of grace" />
        )}
      </div>
      {blockReason && value ? <p className="muted small">{blockReason}</p> : null}
      {adding ? (
        <div className="admin__chip-row">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New kind, e.g. Guidance" />
          <Select value={accent} onChange={(e) => setAccent(e.target.value)} options={ACCENT_OPTIONS.map((a) => ({ value: a, label: a }))} />
          <Btn size="sm" variant="quiet" icon="plus" onClick={addKind}>
            Add
          </Btn>
        </div>
      ) : (
        <Btn size="sm" variant="quiet" icon="plus" onClick={() => setAdding(true)}>
          New kind
        </Btn>
      )}
    </Field>
  );
}

export function FieldControl({
  def,
  value,
  onChange,
  draft,
  label,
  entry,
}: {
  def: FieldDef;
  value: any;
  onChange: (v: any) => void;
  draft: cms.Snapshot;
  label?: string;
  /** The list entry being edited, when this control sits inside one. */
  entry?: any;
}) {
  const text = value === undefined || value === null ? "" : String(value);

  if (def.readonly) {
    return (
      <Field label={label} hint={def.hint}>
        <Input value={text} readOnly className="admin__locked" />
      </Field>
    );
  }

  /* A line of explanation that the office reads but does not edit. */
  if (def.type === "static") {
    return (
      <Field label={label} hint={def.hint}>
        <p className="admin__statictext">{text || "—"}</p>
      </Field>
    );
  }

  switch (def.type) {
    case "textarea":
      return (
        <div className="admin__wide">
          <Field label={label} hint={def.hint}>
            <Textarea rows={def.rows || 3} value={text} onChange={(e) => onChange(e.target.value)} placeholder={def.placeholder} />
          </Field>
        </div>
      );
    case "number":
      return (
        <Field label={label} hint={def.hint}>
          <Input
            type="number"
            value={Number.isFinite(value) ? value : ""}
            min={def.min}
            max={def.max}
            step={def.step ?? 1}
            onChange={(e) => {
              const raw = e.target.value;
              onChange(raw === "" ? 0 : Number(raw));
            }}
          />
        </Field>
      );
    case "time":
      return (
        <Field label={label} hint={def.hint}>
          <Input type="time" value={text} onChange={(e) => onChange(e.target.value)} />
        </Field>
      );
    case "date":
      return (
        <Field label={label} hint={def.hint}>
          <Input type="date" value={text} onChange={(e) => onChange(e.target.value)} />
        </Field>
      );
    case "boolean":
      return (
        <div className="admin__bool">
          <button
            type="button"
            role="switch"
            aria-checked={!!value}
            className={"admin__switch" + (value ? " is-on" : "")}
            onClick={() => onChange(!value)}
          >
            <i />
          </button>
          <span>
            <b>{label}</b>
            {def.hint && <em>{def.hint}</em>}
          </span>
        </div>
      );
    case "select": {
      const options = resolveOptions(def, draft);
      return (
        <Field label={label} hint={def.hint}>
          <Select
            value={text}
            onChange={(e) => onChange(def.numberValues ? Number(e.target.value) : e.target.value)}
            options={options}
          />
        </Field>
      );
    }
    case "image":
      return <ImageField def={def} value={value} onChange={onChange} label={label} />;
    case "video":
      return <VideoField def={def} value={value} onChange={onChange} label={label} />;
    case "testimonyKind":
      return <TestimonyKindField value={value} onChange={onChange} draft={draft} label={label} entry={entry} />;
    case "strings": {
      const list: string[] = Array.isArray(value) ? value : [];
      return (
        <div className="admin__wide">
          <Field label={label} hint={def.hint}>
            <div className="admin__chips-edit">
              {list.map((entry, i) => (
                <div className="admin__chip-row" key={i}>
                  <Input
                    value={entry}
                    onChange={(e) => onChange(list.map((x, j) => (j === i ? e.target.value : x)))}
                  />
                  <button type="button" title="Remove" onClick={() => onChange(list.filter((_, j) => j !== i))}>
                    <Icon name="close" size={14} />
                  </button>
                </div>
              ))}
              <Btn size="sm" variant="quiet" icon="plus" onClick={() => onChange([...list, ""])}>
                {def.addLabel || "Add"}
              </Btn>
            </div>
          </Field>
        </div>
      );
    }
    case "list": {
      const list: any[] = Array.isArray(value) ? value : [];
      const sub = def.fields || [];
      /* itemLabel/itemMeta may be a path (a string) or a reader (a function) —
         a nested list like a branch's weekly schedule uses the function form. */
      const readItem = (which: "itemLabel" | "itemMeta", item: any) => {
        const v = (def as any)[which];
        const text = typeof v === "function" ? v(item) : typeof v === "string" ? item?.[v] : "";
        return String(text ?? "");
      };
      return (
        <div className="admin__wide">
          <div className="admin__sublist">
          <div className="admin__sublist-head">
            <b>{label}</b>
            {def.maxItems ? <em className="muted small"> {list.length} of {def.maxItems}</em> : null}
            <Btn size="sm" variant="quiet" icon="plus" title={def.maxItems && list.length >= def.maxItems ? "Full — adding removes the oldest entry" : undefined} onClick={() => {
              const fresh = def.makeNew ? def.makeNew() : {};
              /* A row added beside id'd siblings takes its own id at once, so
                 the unsaved list can tell it apart (and a later Delete keeps
                 exactly the removals) instead of matching it by position. */
              if (fresh && typeof fresh === "object" && "id" in fresh && !fresh.id && list.some((x) => x && (x as any).id)) {
                (fresh as any).id = uniqueId(list, "id", fresh);
              }
              if (def.maxItems) {
                /* A capped list is newest-first: the new entry lands on top,
                   right under this button, and past the cap the oldest entry
                   (by createdAt) makes room. */
                let oldest = 0;
                for (let i = 1; i < list.length; i++) {
                  if ((list[i]?.createdAt ?? 0) < (list[oldest]?.createdAt ?? 0)) oldest = i;
                }
                const trimmed = list.length >= def.maxItems ? [...list.slice(0, oldest), ...list.slice(oldest + 1)] : [...list];
                onChange([fresh, ...trimmed]);
              } else {
                onChange([...list, fresh]);
              }
            }}>
              {def.addLabel || "Add"}
            </Btn>
          </div>
          {list.length === 0 && <p className="muted small">None yet.</p>}
          {list.map((entry, i) => (
            <div className="admin__subcard" key={i}>
              <div className="admin__subcard-head">
                <span>
                  <b>{readItem("itemLabel", entry) || `Item ${i + 1}`}</b>
                  {readItem("itemMeta", entry) ? <em> {readItem("itemMeta", entry)}</em> : null}
                </span>
                <span className="admin__subcard-actions">
                  <button type="button" title="Move up" disabled={i === 0} onClick={() => onChange(swap(list, i, i - 1))}>
                    <Icon name="arrowUp" size={13} />
                  </button>
                  <button type="button" title="Move down" disabled={i === list.length - 1} onClick={() => onChange(swap(list, i, i + 1))}>
                    <Icon name="arrowRight" size={13} className="admin__rot90" />
                  </button>
                  <ConfirmIcon onConfirm={() => onChange(list.filter((_, j) => j !== i))} title="Remove" />
                </span>
              </div>
              <div className="admin__form admin__form--tight">
                {sub.map((f) => (
                  <FieldControl
                    key={f.path}
                    def={f}
                    label={f.label}
                    value={getPath(entry, f.path)}
                    draft={draft}
                    entry={entry}
                    onChange={(v) =>
                      onChange(
                        list.map((x, j) => {
                          if (j !== i) return x;
                          const copy = clone(x);
                          setPath(copy, f.path, v);
                          return copy;
                        })
                      )
                    }
                  />
                ))}
              </div>
            </div>
          ))}
          </div>
        </div>
      );
    }
    case "slug":
      return (
        <Field label={label} hint={def.hint}>
          <Input value={text} onChange={(e) => onChange(slugify(e.target.value))} placeholder={def.placeholder} />
        </Field>
      );
    default:
      return (
        <Field label={label} hint={def.hint}>
          <Input value={text} onChange={(e) => onChange(e.target.value)} placeholder={def.placeholder} />
        </Field>
      );
  }
}


/* ---------------------------------------------------------- publish modal */

/* The ONE publish action both buttons share (attached publish rule, note 432):
   the bottom-bar Publish button and this dialog's Publish now button run this
   same function, so Publish and Publish now do the same thing — one
   cms.publish pipeline, same activity-log note, same result toasts.
   Returns true when the caller should clear + close, false when it should
   stay open and show the save hint. Clicks are serialized by the callers'
   shared busy flags (both buttons disable together), so this helper itself
   never refuses a call. */
export async function runPublishAction(
  noteInput: string,
  onPhase?: (phase: "saving" | "publishing") => void
): Promise<boolean> {
  try {
    const changed = cms.pendingSections();
    const note = noteInput || defaultNote(changed);
    /* One-click publish: either the bottom-bar Publish or the dialog's
       Publish now alone finishes the job — no second click, no save gate.
       (websiteIsUnsaved is always false now; the old save-first branch is
       retired.) */
    /* One click is one publish (Publish == Publish now): a stale tab on the
       previous deploy stamps the FRESH deploy id below instead of blessing
       the old one — so one click clears every browser/device, no second
       click. Only a real update (newer notes/code the old bundle cannot
       bless) still reloads first. */
    try {
      cms.beginPublishNoReload();
    } catch {}
    try {
      await cms.peekFreshDeploy().catch(() => {});
    } catch {}
    try {
      if (cms.isStaleWaiting() && !cms.isDeployOnlyStale()) {
        fireToast("New update arrived — reloading onto it. Press Publish again once it loads.", "info");
        try {
          window.location.reload();
        } catch {}
        try {
          cms.endPublishNoReload();
        } catch {}
        return false;
      }
    } catch {}
    onPhase?.("publishing");
    const res = await cms.publish(note);
    try {
      cms.endPublishNoReload();
    } catch {}
    if (res.ok) {
      /* One click reaches every visitor (unlimited browsers/devices): the
         words ride the office server, the live relay, the feed and the
         rebuild — no maintenance hold to clear with a second click. */
      fireToast(
        res.local
          ? "Saved on this device. The shared server was unreachable, so other visitors follow when it returns — no second click needed."
          : res.live === false
          ? res.relayMsg || "Published here. The live site follows within a minute — no second click needed."
          : "Published. Every visitor sees the new content right away — no second click needed.",
        res.local || res.live === false ? "info" : "success"
      );
      return true;
    }
    if (res.error === "stale-reload") {
      /* A newer build landed mid-click: the pre-click check already reloaded
         when it may — this covers the race, so say so and reload instead of
         failing quietly. One toast only (toasts show a single word). */
      fireToast("New deploy arrived — reloading onto it. Press Publish again once it loads.", "info");
      try {
        window.location.reload();
      } catch {}
      return false;
    }
    fireToast(
      res.error === "idle-expired"
        ? "Your session ended — sign in again, then publish."
        : res.error === "unauthorized"
        ? "Your session expired — unlock the console again, then publish."
        : `Could not publish (${res.error}). Nothing on the site changed.`,
      "error"
    );
    return false;
  } catch (err) {
    try {
      cms.endPublishNoReload();
    } catch {}
    /* Never leave the caller hanging with no toast: a throw (e.g. a network
       failure that rejects instead of returning {ok:false}) reports and
       releases, so the buttons never stick on "Publishing…". */
    console.error("publish failed", err);
    fireToast("Could not publish (connection error). Nothing on the site changed.", "error");
    return false;
  }
}

export function PublishModal({
  open,
  onClose,
  state,
  onPublish,
  busy: busyProp,
  saving: savingProp,
  saveFailed: saveFailedProp,
}: {
  open: boolean;
  onClose: () => void;
  state: ReturnType<typeof cms.useCms>;
  /* Linked handler from the admin shell: when provided, Publish now runs the
     SAME function as the bottom-bar Publish button. Otherwise the dialog
     runs the shared action on its own. */
  onPublish?: (note: string) => Promise<boolean>;
  busy?: boolean;
  saving?: boolean;
  saveFailed?: boolean;
}) {
  const [note, setNote] = useState("");
  const [busyLocal, setBusyLocal] = useState(false);
  const [savingLocal, setSavingLocal] = useState(false);
  const [saveFailedLocal, setSaveFailedLocal] = useState(false);
  const [livePw, setLivePw] = useState("");
  const [livePwBusy, setLivePwBusy] = useState(false);
  const [livePwMsg, setLivePwMsg] = useState("");
  useCmsTick();

  const changed = open ? cms.pendingSections() : [];
  /* One-click unlimited: no outer save gate — either button alone publishes. */
  const unsaved = false;

  /* Linked busy state: when the shell drives this dialog, both buttons share
     one spinner/hint so they read as one action. */
  const busy = busyProp ?? busyLocal;
  const saving = savingProp ?? savingLocal;
  const saveFailed = saveFailedProp ?? saveFailedLocal;

  const submit = async () => {
    /* Linked path: Publish now runs the same function as Publish — one click
       from either button finishes it, no second click. */
    if (onPublish) {
      const done = await onPublish(note);
      if (done) setNote("");
      return;
    }
    setSaveFailedLocal(false);
    setBusyLocal(true);
    try {
      const done = await runPublishAction(note, (phase) => {
        if (phase === "saving") setSavingLocal(true);
      });
      if (done) {
        setNote("");
        onClose();
      }
    } finally {
      setBusyLocal(false);
      setSavingLocal(false);
    }
  };

  /* One-click unlimited: no website-save step — Publish goes straight live
     for every visitor, so there is no save notice or second click. */
  const saveNotice = null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Publish to the website"
      footer={
        <>
          <Btn variant="ghost" onClick={onClose} disabled={busy || saving}>
            Cancel
          </Btn>
          <Btn icon="send" onClick={submit} disabled={busy || saving}>
            {saving
              ? "Saving the website…"
              : busy
              ? "Publishing…"
              : !changed.length && unsaved
              ? "Save the website"
              : "Publish now"}
          </Btn>
        </>
      }
    >
      {changed.length === 0 ? (
        <>
          <p className="muted">There are no changes to publish right now.</p>
          {saveNotice}
        </>
      ) : (
        <>
          <p>
            This will update <b>{changed.length}</b> section{changed.length === 1 ? "" : "s"} on the live site immediately:
          </p>
          <ul className="admin__publist">
            {changed.map((id) => (
              <li key={id}>
                <Icon name={sectionById(id)?.icon || "info"} size={14} />
                {sectionById(id)?.label || id}
              </li>
            ))}
          </ul>
          <p className="muted">Anything newer on the live site folds into this publish by itself — your edits always win.</p>
          <Field label="Note for the activity log" hint="Optional — e.g. “Christmas service times”.">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={defaultNote(changed)} disabled={saving} />
          </Field>

          {saveNotice}

          {state.authed && state.status !== "online" && (
            <Notice tone="sky">
              Not connected to the shared server right now — Publish tries to connect first, and anything it cannot
              send is queued on this device and published by itself when the connection returns.
            </Notice>
          )}

          {!state.authed && (
            <Notice tone="crimson">
              You are not signed in to the shared server, so this publish will only apply to this browser.
            </Notice>
          )}

          {(() => {
            let needsLivePw = false;
            try {
              needsLivePw = cms.relayNeedsPassword();
            } catch {
              needsLivePw = false;
            }
            if (!needsLivePw) return null;
            const sendLivePw = async () => {
              if (livePwBusy || !livePw) return;
              setLivePwBusy(true);
              try {
                const r = await cms.submitLivePassword(livePw);
                setLivePwMsg(r.msg);
                if (r.ok) {
                  setLivePw("");
                  setNote("");
                  fireToast(r.msg, "success");
                  onClose();
                } else {
                  fireToast(r.msg, "error");
                }
              } catch {
                setLivePwMsg("Could not send — retrying in the background.");
              }
              setLivePwBusy(false);
            };
            return (
              <>
                <Notice tone="crimson">
                  The live site denied this console's password, so the publish above is waiting there. Type the live
                  admin password once — it sends by itself, and from then on your publishes relay without asking.
                </Notice>
                <Field label="Live admin password" hint="Typed once, kept in this browser only.">
                  <Input
                    type="password"
                    value={livePw}
                    onChange={(e) => setLivePw(e.target.value)}
                    placeholder="••••••••••••"
                    disabled={livePwBusy}
                  />
                </Field>
                <div className="btn-row">
                  <Btn icon="send" onClick={sendLivePw} disabled={livePwBusy || !livePw}>
                    {livePwBusy ? "Sending…" : "Save & send to live"}
                  </Btn>
                </div>
                {livePwMsg ? <p className="muted">{livePwMsg}</p> : null}
              </>
            );
          })()}
        </>
      )}
    </Modal>
  );
}

export function defaultNote(changed: string[]): string {
  if (!changed.length) return "Content updated";
  return `Updated ${changed.map((id) => sectionById(id)?.label || id).join(", ")}`.slice(0, 150);
}

/* ---------------------------------------------------------------- tools page */

export function ToolsPage() {
  const state = cms.useCms();
  const [busy, setBusy] = useState(false);
  useCmsTick();

  const doRevert = async () => {
    setBusy(true);
    const res = await cms.undoLastPublish();
    setBusy(false);
    if (!res.ok && res.error === "stale-reload") {
      fireToast("New deploy arrived — reloading onto it. Undo again once it loads.", "info");
      try {
        window.location.reload();
      } catch {}
      return;
    }
    if (!res.ok) {
      fireToast(`Could not roll back (${res.error}).`, "error");
    } else if (res.live === false) {
      fireToast("Rolled back here. The live site follows within a minute.", "info");
    } else {
      fireToast("Rolled back to the previous revision.", "success");
    }
  };
  /* The ~15-minute server undo window counts down live while it is open. */
  const [, setUndoTick] = useState(0);
  const undoSecs = cms.undoCountdownSec();
  useEffect(() => {
    if (undoSecs <= 0) return;
    const t = window.setInterval(() => setUndoTick((x) => x + 1), 15000);
    return () => window.clearInterval(t);
  }, [undoSecs > 0]);

  /* Backup: the latest published content and its photos as one file the office keeps. */
  const doBackup = async () => {
    setBusy(true);
    try {
      const text = await cms.exportPublished();
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, "0");
      const name = `world-overcomers-backup-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      let extra = "";
      try {
        const parsed = JSON.parse(text);
        const files = parsed?.files;
        const nf = Array.isArray(files) ? files.length : 0;
        if (nf) extra = ` with ${nf} uploaded ${nf === 1 ? "file" : "files"}`;
        /* Missing uploads must shout (note 346): a backup that skipped
           photos/videos used to look complete, and the restore then showed
           them blank on the new copy. */
        const missing = parsed?.missingFiles;
        if (Array.isArray(missing) && missing.length) {
          const names = missing.map((m: any) => String(m)).slice(0, 3).join(", ");
          fireToast(
            `Backup downloaded, but ${missing.length} uploaded ${missing.length === 1 ? "file is" : "files are"} missing from it (${names}${missing.length > 3 ? "…" : ""}) — those will be blank after a restore. Publish first (or re-upload them), then back up again.`,
            "error"
          );
        }
      } catch {
        /* the file still downloaded — the count is only a nicety */
      }
      fireToast(`Backup downloaded — the latest published content${extra}.`, "success");
    } catch {
      fireToast("Could not build the backup.", "error");
    }
    setBusy(false);
  };

  /* Restore: an uploaded backup returns as a draft — words and photos — review, then Publish. */
  const restoreRef = useRef<HTMLInputElement>(null);
  const doRestoreFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const res = await cms.importBackup(await file.text());
      if (!res.ok) {
        fireToast(`Could not restore (${res.error}).`, "error");
      } else {
        const n = res.restored?.length || 0;
        const left = res.skipped?.length || 0;
        const imgs = res.filesRestored || 0;
        const missed = [...(res.filesMissing || []), ...(res.filesFailed || [])];
        const imgBit = imgs ? ` ${imgs} uploaded ${imgs === 1 ? "file" : "files"} brought back too.` : "";
        const missBit = missed.length
          ? ` ${missed.length} uploaded ${missed.length === 1 ? "file is" : "files are"} missing on the server (${missed.slice(0, 3).join(", ")}${missed.length > 3 ? "…" : ""}).`
          : "";
        const chanBit = res.channelMoved
          ? ` Channel in the backup was ${res.channelMoved} — set to @twocorg (change it back in the Live stream console if that was intentional).`
          : "";
        const guestBit = res.guestCleared
          ? ` Guest channel in the backup was ${res.guestCleared} — cleared, since every update arrives with an empty guest slot (paste it back in the Live stream console if that event is still on).`
          : "";
        fireToast(
          left
            ? `Brought back ${n} ${n === 1 ? "section" : "sections"} — review, then Publish. ${left} ${left === 1 ? "section" : "sections"} from the backup no longer exist in this update and ${left === 1 ? "was" : "were"} left out.${imgBit}${missBit}${chanBit}${guestBit}`
            : `Brought back ${n} ${n === 1 ? "section" : "sections"} — review, then Publish to put it live.${imgBit}${missBit}${chanBit}${guestBit}`,
          "success"
        );
      }
    } catch {
      fireToast("Could not read that file.", "error");
    }
    setBusy(false);
    if (restoreRef.current) restoreRef.current.value = "";
  };

  return (
    <div className="admin__page">
      {state.role === "main" && <Authenticator />}
      {state.role === "main" && <ChangePassword />}
      {state.role === "main" && <SubAdmins />}
      {state.role === "sub" && <MainSigninState />}
      <div className="admin__toolgrid">
        <Card className="admin__tool">
          <h4>
            <Icon name="arrowLeft" size={16} /> Undo the last publish
          </h4>
          <p>
            Puts every section back the way it was before the last publish.
            {undoSecs > 0
              ? ` About ${undoSecs >= 90 ? `${Math.round(undoSecs / 60)} minutes` : `${undoSecs} seconds`} left to undo.`
              : " The previous publish clears off after about 15 minutes."}
          </p>
          <Btn size="sm" variant="ghost" icon="arrowLeft" onClick={doRevert} disabled={busy || !state.canUndo}>
            {busy ? "Rolling back…" : undoSecs > 0 ? "Undo the last publish" : "Nothing to undo"}
          </Btn>
        </Card>
        <Card className="admin__tool">
          <h4>
            <Icon name="lock" size={16} /> End this session
          </h4>
          <p>log out this admin.</p>
          <Btn
            size="sm"
            variant="ghost"
            icon="lock"
            onClick={() => {
              cms.logout();
              fireToast("Signed out — sign in again to keep editing.", "info");
            }}
          >
            Sign out
          </Btn>
        </Card>
        <Card className="admin__tool">
          <h4>
            <Icon name="download" size={16} /> Download a backup
          </h4>
          <p>Saves the latest published content and its photos as one file — keep it somewhere safe.</p>
          <Btn size="sm" variant="ghost" icon="download" onClick={doBackup} disabled={busy}>
            Back up now
          </Btn>
        </Card>
        <Card className="admin__tool">
          <h4>
            <Icon name="archive" size={16} /> Restore from a backup
          </h4>
          <p>Uploads a backup file and brings its content and photos back as a draft — review it, then Publish.</p>
          <input
            ref={restoreRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => void doRestoreFile(e.target.files?.[0])}
          />
          <Btn size="sm" variant="ghost" icon="archive" onClick={() => restoreRef.current?.click()} disabled={busy}>
            {busy ? "Restoring…" : "Restore a backup"}
          </Btn>
        </Card>
      </div>
    </div>
  );
}

/* -------------------------------------------------------- authenticator app */

/* Two-factor setup: scan, prove with a live code, set the way back in. */
function Authenticator() {
  const [status, setStatus] = useState<{ enabled: boolean; hasQ: boolean; q: string } | null>(null);
  const [error, setError] = useState("");
  const [settingUp, setSettingUp] = useState(false);
  const [secret, setSecret] = useState("");
  const [verify, setVerify] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [changing, setChanging] = useState(false);
  const [chQ, setChQ] = useState("");
  const [chA, setChA] = useState("");
  const [proof, setProof] = useState("");
  const [busy, setBusy] = useState(false);
  /* Switching off asks for proof first: the toggle opens this form, and Done
     (the security answer or an app code) is what actually switches it off. */
  const [disabling, setDisabling] = useState(false);
  const [disableProof, setDisableProof] = useState("");

  const refresh = async () => {
    const res = await cms.totpState();
    if (res.ok) {
      setStatus({ enabled: !!res.enabled, hasQ: !!res.hasQ, q: res.q || "" });
      setError("");
    } else {
      setError(res.error === "offline" ? "The content server is not reachable — the state will appear when it is back." : "Could not load the state — please try again.");
    }
  };
  useEffect(() => {
    refresh();
  }, []);

  const qrSvg = useMemo(() => {
    if (!settingUp || !secret) return "";
    try {
      const qr = QRCode(0, "M");
      qr.addData(cms.totpUri(secret));
      qr.make();
      return qr.createSvgTag(5, 0);
    } catch {
      return "";
    }
  }, [settingUp, secret]);

  const start = () => {
    setSecret(cms.genTotpSecret());
    setVerify("");
    setQuestion("");
    setAnswer("");
    setSettingUp(true);
    setError("");
  };

  /* Header switch: on sets up; off asks the security answer; Done switches off. */
  const toggle = (next: boolean) => {
    setError("");
    if (settingUp) {
      setSettingUp(false);
      setSecret("");
      setVerify("");
      setQuestion("");
      setAnswer("");
      return;
    }
    if (next) {
      if (status && !status.enabled) start();
    } else if (status && status.enabled) {
      if (disabling) {
        setDisabling(false);
        setDisableProof("");
      } else {
        setChanging(false);
        setDisabling(true);
        setDisableProof("");
      }
    }
  };

  const switchOff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disableProof.trim()) return;
    setBusy(true);
    setError("");
    const res = await cms.totpDisable(disableProof);
    setBusy(false);
    if (res.ok) {
      setDisabling(false);
      setDisableProof("");
      setSettingUp(false);
      setSecret("");
      setVerify("");
      setQuestion("");
      setAnswer("");
      setChanging(false);
      setChQ("");
      setChA("");
      setProof("");
      setStatus({ enabled: false, hasQ: false, q: "" });
      fireToast("Two-factor is off — the password alone signs in again.", "info");
      refresh();
    } else {
      setError(
        res.error === "offline"
          ? "The content server is not reachable — please try again when it is back."
          : res.error === "no-question"
          ? "No security question is set yet — set one first, then switch off with its answer."
          : "That answer was not recognised — try again."
      );
    }
  };

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verify.trim() || question.trim().length < 4 || answer.trim().length < 4) return;
    setBusy(true);
    setError("");
    const res = await cms.totpEnroll(secret, question.trim(), answer, verify);
    setBusy(false);
    if (res.ok) {
      setSettingUp(false);
      setVerify("");
      setQuestion("");
      setAnswer("");
      fireToast("Two-factor is on — the security question is saved.", "info");
      refresh();
      return;
    }
    setError(
      res.error === "bad-code"
        ? "That code was not recognised — check the app shows World Overcomers and try the current code."
        : res.error === "bad-question"
        ? "Write a question of at least 4 characters."
        : res.error === "bad-answer"
        ? "The answer needs at least 4 characters — pick one only you know."
        : "Could not switch it on — please try again."
    );
  };

  const changeQA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (chQ.trim().length < 4 || chA.trim().length < 4 || !proof.trim()) return;
    setBusy(true);
    setError("");
    const res = await cms.setSecurityQA(chQ.trim(), chA, proof);
    setBusy(false);
    if (res.ok) {
      setChanging(false);
      setChQ("");
      setChA("");
      setProof("");
      fireToast("Security question updated.", "info");
      refresh();
      return;
    }
    setError(
      res.error === "bad-code"
        ? "That proof was not recognised — use a current app code or the current answer."
        : res.error === "bad-question"
        ? "Write a question of at least 4 characters."
        : res.error === "bad-answer"
        ? "The answer needs at least 4 characters — pick one only you know."
        : "Could not update it — please try again."
    );
  };

  return (
    <Card className="admin__tool admin__tool--wide">
      <div className="admin__tool-head">
        <h4>
          <Icon name="shield" size={16} /> Authenticator app
        </h4>
        <Switch
          label="Two-factor"
          checked={!!(status && status.enabled)}
          disabled={!status || busy}
          onChange={toggle}
        />
      </div>
      <p>
        A second lock on your own sign-in: even if someone learns your password, they still need the 6-digit code from your
        authenticator app. If the phone is lost, a security question only you can
        answer signs you in instead.
      </p>
      {error && <p className="muted">{error}</p>}
      {status && status.enabled && (
        <p className="muted">
          Two-factor is on{status.hasQ && status.q ? ` · security question: ${status.q}` : " · no security question yet — set one below"}.
        </p>
      )}
      {status && !status.enabled && !settingUp && (
        <p className="muted">Flip the switch to set it up.</p>
      )}
      {settingUp && (
        <>
          {qrSvg ? (
            <div className="admin__qr" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          ) : (
            <p className="muted">Type this secret into your authenticator app by hand:</p>
          )}
          {qrSvg && <p className="muted">Scan this with your authenticator app — or type the secret in by hand:</p>}
          <span className="admin__secret">{secret}</span>
          <form onSubmit={confirm}>
            <Field label="Code from the app" error={undefined} hint="Type the current 6-digit code to prove the app reads it. Nothing is switched on until this checks out.">
              <Input
                value={verify}
                onChange={(e) => setVerify(e.target.value)}
                placeholder="123456"
                aria-label="Code from the app"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={12}
              />
            </Field>
            <Field
              label="Security question"
              error={undefined}
              hint="Shown at sign-in when the authenticator is out of reach. Only the answer is secret — the question itself is visible."
            >
              <Input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. What street did the church first meet on?"
                aria-label="Security question"
                maxLength={120}
              />
            </Field>
            <Field
              label="Answer"
              error={undefined}
              hint="Only you know it — at least 4 characters. Capitals and spacing do not matter when you type it later."
            >
              <Input
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Your answer"
                aria-label="Security answer"
                autoComplete="off"
                maxLength={140}
              />
            </Field>
            <span className="btn-row">
              <Btn
                type="submit"
                size="sm"
                variant="gold"
                icon="check"
                disabled={busy || !verify.trim() || question.trim().length < 4 || answer.trim().length < 4}
              >
                {busy ? "Checking…" : "Switch on"}
              </Btn>
              <Btn size="sm" variant="ghost" onClick={() => { setSettingUp(false); setSecret(""); setVerify(""); setQuestion(""); setAnswer(""); setError(""); }}>
                Cancel
              </Btn>
            </span>
          </form>
        </>
      )}
      {status && status.enabled && disabling && !status.hasQ && (
        <p className="muted">
          No security question is set yet —{" "}
          <button
            type="button"
            className="admin__linkbtn"
            onClick={() => { setDisabling(false); setDisableProof(""); setChanging(true); setChQ(status.q || ""); setChA(""); setProof(""); setError(""); }}
          >
            set one first
          </button>
          , then switch off with its answer.
        </p>
      )}
      {status && status.enabled && disabling && status.hasQ && (
        <form onSubmit={switchOff}>
          <Field
            label="Security question"
            error={undefined}
            hint={status.q}
          >
            <Input
              value={disableProof}
              onChange={(e) => setDisableProof(e.target.value)}
              placeholder="Your answer"
              aria-label="Security answer to switch off"
              autoComplete="off"
              maxLength={140}
            />
          </Field>
          <span className="btn-row">
            <Btn type="submit" size="sm" variant="gold" icon="check" disabled={busy || !disableProof.trim()}>
              {busy ? "Checking…" : "Done"}
            </Btn>
            <Btn size="sm" variant="ghost" onClick={() => { setDisabling(false); setDisableProof(""); setError(""); }}>
              Keep it on
            </Btn>
          </span>
        </form>
      )}
      {status && status.enabled && !changing && !disabling && (
        <Btn
          size="sm"
          variant="ghost"
          icon="refresh"
          onClick={() => { setChanging(true); setChQ(status.q || ""); setChA(""); setProof(""); setError(""); }}
        >
          {status.hasQ ? "Change the security question" : "Set a security question"}
        </Btn>
      )}
      {changing && (
        <form onSubmit={changeQA}>
          <Field label="Security question" error={undefined} hint="Shown at sign-in when the authenticator is out of reach.">
            <Input value={chQ} onChange={(e) => setChQ(e.target.value)} placeholder="e.g. What street did the church first meet on?" aria-label="New security question" maxLength={120} />
          </Field>
          <Field label="New answer" error={undefined} hint="At least 4 characters — only you know it.">
            <Input value={chA} onChange={(e) => setChA(e.target.value)} placeholder="Your answer" aria-label="New security answer" autoComplete="off" maxLength={140} />
          </Field>
          <Field
            label="Prove it is you"
            error={undefined}
            hint="A current code from the app — or the current answer, if the phone is already lost."
          >
            <Input
              value={proof}
              onChange={(e) => setProof(e.target.value)}
              placeholder="123456 or current answer"
              aria-label="Proof it is you"
              autoComplete="off"
              maxLength={140}
            />
          </Field>
          <span className="btn-row">
            <Btn type="submit" size="sm" variant="ghost" icon="check" disabled={busy || chQ.trim().length < 4 || chA.trim().length < 4 || !proof.trim()}>
              {busy ? "Checking…" : "Save the question"}
            </Btn>
            <Btn size="sm" variant="ghost" onClick={() => { setChanging(false); setChQ(""); setChA(""); setProof(""); setError(""); }}>
              Keep the old one
            </Btn>
          </span>
        </form>
      )}
    </Card>
  );
}

/* Main admin only: password change needs the security answer or an app code. */
function ChangePassword() {
  const [two, setTwo] = useState<{ on: boolean; q: string } | null>(null);
  const [checkFailed, setCheckFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [ans, setAns] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const checkTwo = async () => {
    const res = await cms.totpState();
    if (res.ok) {
      setTwo({ on: !!res.enabled, q: res.q || "" });
      setCheckFailed(false);
    } else {
      setCheckFailed(true);
    }
  };
  useEffect(() => {
    checkTwo();
    /* The authenticator can be switched on or off in this same visit (the
       card above) — re-check then, so this card never stays locked behind a
       state it read a moment ago. */
    window.addEventListener("wom:totp-changed", checkTwo);
    return () => window.removeEventListener("wom:totp-changed", checkTwo);
  }, []);

  const open = () => {
    setEditing(true);
    setAns("");
    setNewPw("");
    setConfirmPw("");
    setError("");
  };
  const close = () => {
    setEditing(false);
    setAns("");
    setNewPw("");
    setConfirmPw("");
    setError("");
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ans.trim()) {
      setError("Answer the security question first.");
      return;
    }
    if (newPw.length < 8) {
      setError("Choose a password of at least 8 characters.");
      return;
    }
    if (newPw !== confirmPw) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    const res = await cms.setMainPassword(newPw, ans);
    setBusy(false);
    if (res.ok) {
      close();
      fireToast("Password changed — use the new one from now on.", "info");
      return;
    }
    if (res.error === "need-2fa") setTwo({ on: false, q: "" });
    setError(
      res.error === "need-2fa"
        ? "Switch the authenticator app on first — the password can only be changed while it is on."
        : res.error === "bad-code"
        ? "That answer was not recognised — try your security answer or the current app code."
        : res.error === "offline"
        ? "The content server is not reachable — please try again when it is back."
        : res.error === "bad-password"
        ? "Choose a password of at least 8 characters."
        : "Could not change it — please try again."
    );
  };

  return (
    <Card className="admin__tool admin__tool--wide">
      <h4>
        <Icon name="lock" size={16} /> Office password
      </h4>
      {!editing ? (
        two === null ? (
          <p className="muted">{checkFailed ? "Could not check the authenticator state — reopen Tools to try again." : "Checking…"}</p>
        ) : !two.on ? (
          <p className="muted">Switch the authenticator app on first — the office password can only be changed while the second lock is on.</p>
        ) : (
          <>
            <p>Change the password that signs the admin in. It first asks for your security answer — then the old password stops working the moment the new one is saved.</p>
            <Btn size="sm" variant="ghost" icon="pencil" onClick={open}>
              Change the password
            </Btn>
          </>
        )
      ) : (
        <form onSubmit={save}>
          <Field
            label="Security answer"
            error={error}
            hint={two && two.q ? two.q : "Type a current code from your authenticator app."}
          >
            <Input
              value={ans}
              onChange={(e) => setAns(e.target.value)}
              placeholder={two && two.q ? "Your answer" : "123456"}
              aria-label="Security answer"
              autoComplete="off"
              maxLength={140}
            />
          </Field>
          <Field label="New password" error={undefined} hint="At least 8 characters — it works on every device from the moment you save it.">
            <Input
              type="password"
              autoComplete="new-password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder="At least 8 characters"
              aria-label="New office password"
            />
          </Field>
          <Field label="Repeat the password" error={undefined}>
            <Input
              type="password"
              autoComplete="new-password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              placeholder="Same password again"
              aria-label="Repeat the new office password"
            />
          </Field>
          <span className="btn-row">
            <Btn type="submit" size="sm" variant="gold" icon="check" disabled={busy || !ans.trim() || !newPw || !confirmPw}>
              {busy ? "Saving…" : "Save the new password"}
            </Btn>
            <Btn size="sm" variant="ghost" onClick={close}>
              Keep the old one
            </Btn>
          </span>
        </form>
      )}
    </Card>
  );
}

/* A sub-admin only ever sees this while the main password is switched off — so
   someone can always switch it back on. */
export function MainSigninState() {
  const [off, setOff] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    cms.mainState().then((res) => {
      if (res.ok) setOff(!!res.off);
    });
  }, []);
  if (!off) return null;
  return (
    <Card className="admin__tool admin__tool--wide">
      <h4>
        <Icon name="lock" size={16} /> Main sign-in
      </h4>
      <p>The main password is switched off — only sub-admins can sign in.</p>
      <Btn
        size="sm"
        variant="ghost"
        icon="check"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const res = await cms.setMainOff(false);
          setBusy(false);
          if (res.ok) {
            setOff(false);
            fireToast("Main password sign-in is back on.", "success");
          } else {
            fireToast("Could not switch it back on — please try again.", "error");
          }
        }}
      >
        {busy ? "Checking…" : "Switch it back on"}
      </Btn>
    </Card>
  );
}

/* ------------------------------------------------------------ sub-admins */

/* Main admin only: who else may sign in. An invitation is a one-time code the
   browser invents and shows exactly once — the server only ever holds its
   hash — and spending it creates the sub-admin's own password. */
function SubAdmins() {
  const [subs, setSubs] = useState<{ name: string; at: number }[]>([]);
  const [invites, setInvites] = useState<{ name: string; at: number; expires: number }[]>([]);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [freshCode, setFreshCode] = useState<{ name: string; code: string } | null>(null);
  /* While the website is unsaved the preview server forgets invites on
     reload — so opening this card saves it automatically, once per visit.
     After the save + reload everything here works on every tab and device. */
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!cms.websiteIsUnsaved()) return;
    try {
      if (sessionStorage.getItem("wom.cms.autosave-once")) return;
      sessionStorage.setItem("wom.cms.autosave-once", "1");
    } catch {}
    if (cms.requestWebsiteSave()) setSaving(true);
  }, []);

  const refresh = async () => {
    const roster = await cms.listAdmins();
    if (roster.ok) {
      setSubs(roster.subs || []);
      setInvites(roster.invites || []);
      setError("");
    } else {
      setError(roster.error === "offline" ? "The content server is not reachable — the list will appear when it is back." : "Could not load the list — please try again.");
    }
  };
  useEffect(() => {
    refresh();
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = name.trim();
    if (!cms.validSubName(clean)) {
      setError("Give the sub-admin a short name starting with a letter.");
      return;
    }
    setBusy(true);
    setError("");
    const res = await cms.createInvite(clean);
    setBusy(false);
    if (res.ok && res.code) {
      setFreshCode({ name: clean, code: res.code });
      setName("");
      refresh();
      return;
    }
    setError(
      res.error === "name-taken"
        ? "That name is already in use — pick another."
        : res.error === "too-many"
        ? "There are already as many pending invites as the site allows — revoke one first."
        : res.error === "offline"
        ? "The content server is not reachable — try again when it is back."
        : "Could not create the invite — please try again."
    );
  };

  const removeSub = async (sub: string) => {
    const res = await cms.deleteSub(sub);
    if (res.ok) {
      fireToast(`${sub} can no longer sign in.`, "info");
      refresh();
    } else {
      fireToast("Could not delete that sub-admin — please try again.", "error");
    }
  };

  const revoke = async (sub: string) => {
    const res = await cms.revokeInvite(sub);
    if (res.ok) refresh();
    else fireToast("Could not revoke that invite — please try again.", "error");
  };

  const copyCode = async () => {
    if (!freshCode) return;
    try {
      await navigator.clipboard.writeText(cms.formatInviteCode(freshCode.code));
      fireToast(`Copied — share it with ${freshCode.name}.`, "success");
    } catch {
      fireToast("Copying failed — long-press the code to copy it by hand.", "error");
    }
  };

  return (
    <Card className="admin__tool admin__tool--wide">
      <h4>
        <Icon name="people" size={16} /> Sub-admins
      </h4>
      <p>Invite others to sign in and edit just like you. An invite code works once and expires after 7 days.</p>
      {saving && (
        <Notice tone="gold">
          <b>Saving the website…</b> Invites need it saved once — the page reloads, then everything here works
          everywhere. If it stays unsaved, press Save in the editor yourself.
        </Notice>
      )}
      {error && <p className="muted">{error}</p>}
      {(subs.length > 0 || invites.length > 0) && (
        <ul className="admin__roster">
          {subs.map((s) => (
            <li key={s.name}>
              <div>
                <b>{s.name}</b>
                <em>Sub-admin · joined {cms.timeAgo(s.at)}</em>
              </div>
              <ConfirmIcon title={`Delete ${s.name}`} label="Delete admin" onConfirm={() => removeSub(s.name)} />
            </li>
          ))}
          {invites.map((v) => (
            <li key={"invite:" + v.name}>
              <div>
                <b>{v.name}</b>
                <em>Invite code · expires {new Date(v.expires).toLocaleDateString()}</em>
              </div>
              <button type="button" className="admin__linkbtn" onClick={() => revoke(v.name)}>
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
      {freshCode && (
        <Notice tone="gold">
          <b>Share this code with {freshCode.name} — it is shown once, works once, and expires in 7 days.</b>
          <span className="admin__invite-code">{cms.formatInviteCode(freshCode.code)}</span>
          <span className="btn-row">
            <Btn size="sm" variant="ghost" icon="clipboard" onClick={copyCode}>
              Copy the code
            </Btn>
            <Btn size="sm" variant="ghost" onClick={() => setFreshCode(null)}>
              Done
            </Btn>
          </span>
        </Notice>
      )}
      <form onSubmit={create}>
        <Field label="Invite a sub-admin" error={undefined}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mary" aria-label="Sub-admin name" maxLength={40} />
        </Field>
        <Btn type="submit" size="sm" variant="ghost" icon="plus" disabled={busy || !name.trim()}>
          {busy ? "Creating…" : "Create invite code"}
        </Btn>
      </form>
    </Card>
  );
}

/* ------------------------------------------------------------------ pieces */

export function ConfirmIcon({
  onConfirm,
  title,
  label,
  className = "",
}: {
  onConfirm: () => void;
  title: string;
  label?: string;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const id = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(id);
  }, [armed]);
  return (
    <button
      type="button"
      title={armed ? "Click again to confirm" : title}
      className={"admin__danger-btn" + (armed ? " is-armed" : "") + (className ? " " + className : "")}
      onClick={() => (armed ? onConfirm() : setArmed(true))}
    >
      <Icon name="trash" size={14} />
      {label ? (
        <span className="admin__danger-btn-label" aria-live="polite">
          <span className={armed ? "" : "is-shown"}>{label}</span>
          <span className={armed ? "is-shown" : ""}>Confirm</span>
        </span>
      ) : null}
    </button>
  );
}


/** Re-render a subtree whenever the CMS version bumps. */
export function useCmsTick() {
  cms.useCmsVersion();
}

/* ------------------------------------------------------------------ utils */

export function resolveOptions(def: FieldDef, draft: cms.Snapshot): { value: string; label: string }[] {
  const withEmpty = (opts: { value: string; label: string }[]) =>
    def.placeholderOption && !opts.some((o) => o.value === "")
      ? [{ value: "", label: def.placeholderOption }, ...opts]
      : opts;
  if (def.optionsFrom === "branches") {
    const list = (draft.branches || []) as any[];
    const out = list.map((b) => ({ value: String(b.id || ""), label: b.name || b.id || "(unnamed branch)" }));
    return withEmpty(out.length ? out : [{ value: "", label: "No branches yet" }]);
  }
  if (def.optionsFrom === "testimonyCategories") {
    /* The wall entry's Kind dropdown follows the Filters list live — a kind
       of grace the office just added is assignable without a reload. */
    const obj = draft.testimonies as any;
    const list: any[] = Array.isArray(obj) ? [] : Array.isArray(obj?.categories) ? obj.categories : [];
    const out = list
      .filter((c) => String(c?.id || "").trim())
      .map((c) => ({ value: String(c.id), label: String(c.label || c.id) }));
    return withEmpty(out.length ? out : [{ value: "", label: "No kinds yet" }]);
  }
  const opts = def.options || [];
  const labels = def.optionLabels || {};
  return withEmpty(
    opts.map((o, i) => (typeof o === "string" ? { value: o, label: labels[o] || o } : o))
  );
}

export function keyOf(item: any, index: number): string {
  return String(item?.id || item?.ref || item?.q || item?.label || item?.title || item?.name || index);
}

export function matches(item: any, query: string): boolean {
  if (!query.trim()) return true;
  const hay = JSON.stringify(item || {}).toLowerCase();
  return hay.includes(query.trim().toLowerCase());
}

export function uniqueId(list: any[], key: string, item: any): string {
  const base = slugify(item?.title || item?.name || item?.q || item?.label || item?.ref || "item") || "item";
  const taken = new Set(list.map((x) => String(x?.[key] || "")));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export function slugify(text: string): string {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function swap(list: any[], a: number, b: number): any[] {
  const next = [...list];
  const tmp = next[a];
  next[a] = next[b];
  next[b] = tmp;
  return next;
}
