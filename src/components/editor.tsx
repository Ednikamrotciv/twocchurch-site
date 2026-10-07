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
import { readLiveStatus } from "../lib/livestatus";
import { SITE, SERVICES, img } from "../data/site";
import { recentLimit } from "../data/live";
import { ytWatch } from "../data/sermons";
import { askForRecentServices, useRecentServices } from "../lib/recentstreams";
import { BRANCHES } from "../data/branches";
import type { ChurchEvent } from "../data/content";
import { PHOTO_SLOTS, bundledPhoto, photoById, photoKeyOf, resolvePhoto } from "../data/photos";
import {
  compressImageBlob,
  clockAt,
  DAY_SHORT,
  fmtDate,
  fmtDuration,
  fmtTime,
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
              <dt>Published version</dt>
              <dd>{state.rev ? `version ${state.rev}` : "nothing published yet"}</dd>
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

/* -------------------------------------- the livestream: start, stop, continue */

/** Start / Continue / Stop for the broadcast; the panel reports whichever "on air" is speaking. */
export function LiveControlPanel() {
  useCmsTick();
  const now = useNow(20000);
  const live = draftLive();
  const isOn = !!live.isLive;
  const since = Number(live.liveSince) || 0;
  const cut = Number(live.liveCut) || 0;
  /* The head-office gathering, read the same way the site reads a visitor's —
     the office broadcasts that branch's services, and it is the schedule the
     panel is really about. */
  const info = nextService(SERVICES, now, churchTimezone());
  const clockLive = !!info?.isLive && !(cut >= info.at.getTime());
  const onNow = isOn || clockLive;
  const justStopped = !onNow && cut > 0 && now.getTime() - cut < 8 * 60 * 60 * 1000;
  const ready = !!(
    String(live.youtubeChannel || "").trim() ||
    String(live.youtubeId || "").trim() ||
    String(live.facebookUrl || "").trim()
  );
  const waited = cms.pendingSections().includes("live");
  /* When the office's session was never stamped — a site left on air from
     before this panel existed, or the clock's own gathering — the gathering's
     start is the honest beginning of the broadcast. */
  const clockStart = info?.isLive ? info.at.getTime() : 0;
  const started = since || clockStart;
  const minutes = started ? Math.max(0, Math.round((now.getTime() - started) / 60000)) : 0;

  /** Write the newest draft, so two presses in a row never fight each other. */
  const write = (patch: Record<string, any>) => {
    const latest = cms.getDraft().live || {};
    cms.setSectionValue("live", { ...latest, ...patch });
  };
  const start = () => {
    write({ isLive: true, liveSince: Date.now(), liveCut: 0, liveEndedBy: "office", liveCommandAt: Date.now() });
    /* A new session: read the channel now, so a service that has just been
       published shows up without waiting for the ten-minute timer. */
    askForRecentServices();
    fireToast("You are on air. Publish to put the live state on the public site.", "success");
  };
  const resume = () => {
    write({ isLive: true, liveCut: 0, liveEndedBy: "office", liveCommandAt: Date.now(), liveSince: started || Date.now() });
    fireToast("Back on air — the site is showing LIVE NOW again.", "success");
  };
  const stop = () => {
    write({ isLive: false, liveCut: Date.now(), liveEndedBy: "office", liveCommandAt: Date.now() });
    /* An ended service seeds Recent services now; every open page re-reads the channel. */
    const aired = readLiveStatus();
    askForRecentServices(aired.videoId ? { videoId: aired.videoId, title: aired.title } : undefined);
    fireToast("Stopped. The finished service is in Recent services, and the site is counting down to the next gathering.", "info");
  };

  const askedToPublish = waited ? " Publish to make it public." : "";
  /* Whether the last session ended by itself — the stream went off air, and the
     drawer stopped with it (see `useAutoStopLive` in src/lib/autostop.ts). */
  const endedByItself = justStopped && live.liveEndedBy === "channel";

  const headline = onNow
    ? "You are on air right now"
    : justStopped
    ? endedByItself
      ? "The stream ended, so the site stopped by itself"
      : "The stream has been stopped"
    : "The stream is off air";
  const status = onNow
    ? started
      ? `On air since ${fmtTime(started)}${minutes >= 1 ? ` — ${fmtDuration(minutes)}` : ""}.`
      : "The site is showing LIVE NOW and the player is open on the Watch live page."
    : justStopped
    ? endedByItself
      ? `The stream stopped on its own at ${fmtTime(cut)}, so the site went off air with it. The finished service is already under Recent services.`
      : `Stopped at ${fmtTime(cut)}. The finished service appears under Recent services on the Watch live page by itself.`
    : "Nothing is broadcasting — the site is counting down to the next gathering.";
  const note = onNow
    ? clockLive && !isOn
      ? `Your service times have ${info?.slot.name || "a gathering"} on right now, so the site is showing live by itself. It goes back to counting down when the gathering ends — or press Stop to end it now.` +
        askedToPublish
      : "Visitors see LIVE NOW across the site and the player opens on its own. You can press Stop when the service closes — or leave it: the site stops by itself the moment the stream ends on the channel it watches." +
        askedToPublish
    : justStopped
    ? endedByItself
      ? waited
        ? "Publish to take the live state off the website — until you do, visitors still see LIVE NOW. Continue puts it back on air if you are streaming again."
        : "Nothing to file: the service is in Recent services, and the site is counting down to the next gathering. Continue puts it back on air if you are streaming again."
      : "Continue picks the same session up where it stopped, and keeps counting how long it has been on air. Start begins a fresh one at the current time."
    : "Go on air at any time — for a moved service, a vigil, or a broadcast that is not on the schedule." +
      askedToPublish;

  return (
    <Card className={"admin__live" + (onNow ? " is-on" : justStopped ? " is-stopped" : "")}>
      <div className="admin__live-top">
        <span className={onNow ? "live-dot" : "live-dot live-dot--off"} aria-hidden="true" />
        <div className="admin__live-copy">
          <b>{headline}</b>
          <em>{status}</em>
        </div>
      </div>

      {onNow && !ready && (
        <p className="admin__live-warn">
          <Icon name="alert" size={14} />
          <span>
            Nothing is set to play yet. Paste the stream link, or the channel to watch, in the fields below — until then
            the Watch live screen tells visitors the service is on and that we will be live shortly, and plays the last
            message under its ticking clock.
          </span>
        </p>
      )}

      <div className="btn-row">
        {onNow ? (
          <Btn variant="crimson" icon="stop" onClick={stop}>
            Stop the livestream
          </Btn>
        ) : justStopped ? (
          <>
            <Btn icon="play" onClick={resume}>
              Continue the livestream
            </Btn>
            <Btn variant="ghost" icon="live" onClick={start}>
              Start a new livestream
            </Btn>
          </>
        ) : (
          <Btn icon="live" onClick={start}>
            Start the livestream
          </Btn>
        )}
      </div>

      <p className="admin__live-note">{note}</p>
    </Card>
  );
}

/* ------------------------------- the services the site is carrying */

/** Finished services, read from the church's channel; take-offs publish with the section (note 109). */
export function RecentServicesPanel() {
  useCmsTick();
  const now = useNow(30000);
  const live = draftLive();
  /* The head office's gathering, read the way the site reads it — a broadcast
     is expected around it, which is when the list is worth watching closely. */
  const info = nextService(SERVICES, now, churchTimezone());
  const onNow = !!live.isLive || !!info?.isLive;
  const recent = useRecentServices({ soon: onNow, liveNow: onNow });
  const limit = recentLimit(live.recentLimit);

  /* Read from the draft, so a take-off shows here, on the live section and on
     the page in the same breath (the applied content follows). */
  const hiddenIds: string[] = Array.isArray(live.hiddenReplays) ? live.hiddenReplays.map((id: any) => String(id)) : [];
  const hidden = new Set(hiddenIds);
  const items = recent.items;
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

  const channelSet = !!String(live.youtubeChannel || "").trim();
  const when = (it: any) =>
    it.at
      ? fmtDate(new Date(it.at), "long")
      : it.seeded
      ? "Just ended — YouTube is still publishing it"
      : it.ago || "Recently";

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
          {channelSet
            ? "Nothing here yet — the list fills itself as services finish."
            : "Paste the channel above (the YouTube channel the page watches) and the finished services appear here by themselves."}
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
  const res = await fetch(`${base}/__upload?name=${encodeURIComponent(filename)}`, {
    method: "POST",
    headers: { "content-type": blob.type || "application/octet-stream" },
    body: blob,
  });
  if (!res.ok) throw new Error("The file could not be saved. Try a smaller file, or paste a link instead.");
  const data = await res.json().catch(() => null);
  if (!data || typeof data.url !== "string" || !data.url)
    throw new Error("The file could not be saved. Try again, or paste a link instead.");
  return base ? base + data.url : data.url;
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
      /* A slide keeps its own resolution: the re-cut sets the size, so the
         picture goes in at full size and comes out 1600×1200. */
      const blob = forSlide ? await frameImageBlob(file) : await compressImageBlob(file, 1600, 0.82);
      const url = await localHostFile(blob, file.name || "photo.jpg");
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
        aria-label={forSlide ? "Choose a picture to fit to the slide" : "Choose a photo to upload"}
        onChange={(e) => {
          const file = e.target.files && e.target.files[0];
          if (file) upload(file);
        }}
      />
      <Btn size="sm" icon="camera" disabled={busy} onClick={() => inputRef.current && inputRef.current.click()}>
        {busy ? (forSlide ? "Setting your picture…" : "Uploading your photo…") : forSlide ? "Upload a picture" : "Upload a photo"}
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

  return (
    <div className="admin__wide">
      <Field label={label} hint={def.hint}>
        <div className="admin__videofield">
          <span className="admin__videopreview">
            {address ? <video src={address} controls playsInline preload="metadata" /> : <Icon name="play" size={20} />}
          </span>
          <div className="admin__videoinputs">
            <VideoUpload onDone={(made) => onChange(made)} />
            <Input value={url} onChange={(e) => onChange(e.target.value)} placeholder="…or paste the address of a video file" />
            {address && (
              <Btn size="sm" variant="quiet" icon="trash" onClick={() => onChange("")}>
                Remove the video
              </Btn>
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
  const original = slot ? bundledPhoto(slot.key) : def.fallbackPhoto ? bundledPhoto(def.fallbackPhoto) : "";
  const preview = resolvePhoto(text) || original;
  const chosenLabel = key ? PHOTO_SLOTS.find((s) => s.key === key)?.label || key : "";
  const forSlide = def.frame === "slide";
  const [fitting, setFitting] = useState(false);
  const [fitError, setFitError] = useState("");
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
      onChange(await localHostFile(framed, "slide.jpg"));
      fireToast("Picture set into the slide — publish to put it on the site.", "success");
    } catch (err) {
      setFitError(err instanceof Error ? err.message : String(err));
    } finally {
      setFitting(false);
    }
  };

  /* The agent prompts only for a pasted picture that is not landscape: uploads
     are already re-cut on the way up, and a framed picture is 1600×1200. */
  const needsLandscape =
    forSlide && custom && shape && shape.w > 0 && shape.h > 0 && shape.w < shape.h * 1.1 && agentOff !== preview;
  const squareish = !!shape && shape.w > 0 && shape.h > 0 && Math.abs(shape.w - shape.h) / Math.max(shape.w, shape.h) < 0.12;

  const caption = custom
    ? "Your own photo is in use."
    : key
    ? `Using “${chosenLabel}”.`
    : ownSlot
    ? "The original photo is in use."
    : def.fallbackPhoto
    ? "No photo of its own — the site's own picture shows here."
    : def.emptyNote || "Nothing set here yet.";

  return (
    <Field label={label} hint={def.hint || "Upload a photo from your phone or computer, or paste the address of one."}>
      <div className="admin__imagefield">
        <span className={"admin__imagepreview" + (forSlide ? " admin__imagepreview--slide" : "")}>{preview ? <img src={preview} alt="" /> : <Icon name="camera" size={18} />}</span>
        <div className="admin__imageinputs">
          <p className="admin__imagecaption">{caption}</p>
          <PhotoUpload onDone={(url) => onChange(url)} frame={def.frame} />
          <Input
            value={custom ? text : ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder="…or paste a photo link"
            aria-label="Paste the address of a photo"
          />
          {forSlide && custom ? (
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
            <Btn size="sm" variant="quiet" icon="trash" onClick={() => onChange("")}>
              Use the original photo
            </Btn>
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

export function PublishModal({ open, onClose, state }: { open: boolean; onClose: () => void; state: ReturnType<typeof cms.useCms> }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  useCmsTick();

  const changed = open ? cms.pendingSections() : [];
  const unsaved = open && cms.websiteIsUnsaved();

  /** Publish saves the site first while unsaved, then finishes from the stored plan. */
  useEffect(() => {
    if (!saving) return;
    let tries = 0;
    const timer = window.setInterval(async () => {
      tries += 1;
      if (!cms.websiteIsUnsaved()) {
        window.clearInterval(timer);
        const res = await cms.finishPlannedPublish();
        setSaving(false);
        if (res && res.ok) {
          fireToast(
            res.local
              ? "The website is saved. The shared server was unreachable, so your changes are on this device until it is back."
              : "Saved, and published — every visitor sees the new content right away.",
            res.local ? "info" : "success"
          );
          setNote("");
          onClose();
        } else {
          setSaveFailed(true);
        }
      } else if (tries >= 20) {
        window.clearInterval(timer);
        setSaving(false);
        setSaveFailed(true);
      }
    }, 700);
    return () => window.clearInterval(timer);
  }, [saving]);

  const submit = async () => {
    setSaveFailed(false);
    if (cms.websiteIsUnsaved()) {
      cms.planPublishAfterSave(note || defaultNote(changed));
      /* The editor checks that this browser is allowed to save the website;
         if it is, it saves and reloads this preview. */
      if (cms.requestWebsiteSave()) {
        setSaving(true);
        return;
      }
    }
    setBusy(true);
    const res = await cms.publish(note || defaultNote(changed));
    setBusy(false);
    if (res.ok) {
      fireToast(
        res.local
          ? "Saved on this device. The shared server was unreachable, so other visitors are not updated yet."
          : "Published. Every visitor sees the new content right away.",
        res.local ? "info" : "success"
      );
      setNote("");
      onClose();
    } else {
      fireToast(
        res.error === "unauthorized"
          ? "Your session expired — unlock the console again, then publish."
          : `Could not publish (${res.error}). Nothing on the site changed.`,
        "error"
      );
    }
  };

  /* What the website itself is doing — shown whether or not there is content
     waiting, because saving the website is the point of Publish while it is
     unsaved. */
  const saveNotice = saving ? (
    <p className="admin__busy">
      <span className="admin__ring" /> Saving the website so your changes can go live — this page will refresh by itself.
    </p>
  ) : saveFailed ? (
    <Notice icon="alert" tone="crimson">
      We could not save the website from here. Press <b>Save</b> in the editor's own toolbar (or <b>Ctrl+S</b>), then press Publish
      again — your changes are kept.
    </Notice>
  ) : unsaved ? (
    <Notice icon="info" tone="sky">
      {changed.length ? (
        <>
          The website itself has not been saved yet. Publishing saves it first, and from then on your changes are live at its own address
          for everyone.
        </>
      ) : (
        <>The website itself has not been saved yet, so there is nothing for visitors to see. Publish saves it.</>
      )}
    </Notice>
  ) : null;

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
          <Field label="Note for the activity log" hint="Optional — e.g. “Christmas service times”.">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={defaultNote(changed)} disabled={saving} />
          </Field>

          {saveNotice}

          {!state.authed && (
            <Notice tone="crimson">
              You are not signed in to the shared server, so this publish will only apply to this browser.
            </Notice>
          )}
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
    fireToast(res.ok ? "Rolled back to the previous revision." : `Could not roll back (${res.error}).`, res.ok ? "success" : "error");
  };

  /* Backup: the latest published content as a file the office keeps. */
  const doBackup = () => {
    try {
      const text = cms.exportPublished();
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
      fireToast("Backup downloaded — the latest published content.", "success");
    } catch {
      fireToast("Could not build the backup.", "error");
    }
  };

  /* Restore: an uploaded backup returns as a draft — review, then Publish. */
  const restoreRef = useRef<HTMLInputElement>(null);
  const doRestoreFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const res = cms.importBackup(await file.text());
      if (!res.ok) {
        fireToast(`Could not restore (${res.error}).`, "error");
      } else {
        const n = res.restored?.length || 0;
        const left = res.skipped?.length || 0;
        fireToast(
          left
            ? `Brought back ${n} ${n === 1 ? "section" : "sections"} — review, then Publish. ${left} ${left === 1 ? "section" : "sections"} from the backup no longer exist in this update and ${left === 1 ? "was" : "were"} left out.`
            : `Brought back ${n} ${n === 1 ? "section" : "sections"} — review, then Publish to put it live.`,
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
          <p>Puts every section back the way it was before the last publish.</p>
          <Btn size="sm" variant="ghost" icon="arrowLeft" onClick={doRevert} disabled={busy || !state.canUndo}>
            {busy ? "Rolling back…" : "Undo the last publish"}
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
          <p>Saves the latest published content as a file — keep it somewhere safe.</p>
          <Btn size="sm" variant="ghost" icon="download" onClick={doBackup} disabled={busy}>
            Back up now
          </Btn>
        </Card>
        <Card className="admin__tool">
          <h4>
            <Icon name="archive" size={16} /> Restore from a backup
          </h4>
          <p>Uploads a backup file and brings its content back as a draft — review it, then Publish.</p>
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
