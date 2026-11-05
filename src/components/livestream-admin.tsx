/* livestream-admin.tsx — the Watch Live health dashboard (note 441).
   Admin-only panel in the Live stream drawer: the ten statuses, Validate +
   Preview, video id, last successful check, player error, recovery status,
   backup config and plain-word diagnostics. Invalid broadcasts can never be
   marked READY — READY derives from a passing pre-flight stamped onto
   liveVerifiedId/liveVerifiedAt, and Publish carries those words like any
   other field. No source edits needed to fix an id (the drawer fields above).
   Auth/permissions unchanged: this renders inside the admin console only. */

import React, { useEffect, useState } from "react";
import { parseYoutubeId } from "../lib/embed";
import * as cms from "../lib/cms";
import { liveTarget, useLiveStream } from "../lib/livestatus";
import { VideoPlayer } from "./blocks";
import { Badge, Btn, Card, Modal, Notice } from "./ui";
import {
  adminStatusFor,
  backupConfigOf,
  emptyValidation,
  fullPreflight,
  getLastPlayerError,
  isFallbackActive,
  isRecoverablePlayerError,
  subscribePlayerErrors,
  type AdminLiveStatus,
  type LiveValidation,
} from "../lib/livevalidate";

function fmtTime(at: number): string {
  try {
    if (!(at > 0)) return "never";
    const d = new Date(at);
    return d.toLocaleString();
  } catch { return "never"; }
}

export function LivestreamHealthPanel() {
  cms.useCmsVersion();
  const live = (cms.getDraft().live || {}) as Record<string, unknown>;
  const air = useLiveStream();
  const primaryRaw = String(live.youtubeId || "").trim();
  const primaryId = parseYoutubeId(primaryRaw);
  const verifiedId = parseYoutubeId(String(live.liveVerifiedId || ""));
  const verifiedAt = Number(live.liveVerifiedAt) || 0;
  const backupCfg = backupConfigOf(live as { liveBackupVideo?: unknown; liveBackupStream?: unknown; liveOfflineMessage?: unknown });

  const [validation, setValidation] = useState<LiveValidation | null>(null);
  const [validating, setValidating] = useState(false);
  const [preview, setPreview] = useState(false);
  const [errorTick, setErrorTick] = useState(0);
  useEffect(() => subscribePlayerErrors(() => { try { setErrorTick((t) => t + 1); } catch {} }), []);
  void errorTick;

  const lastErr = getLastPlayerError();
  const primaryDead =
    !!validation && (!!validation.validFormat && (validation.exists === false || validation.embeddable === false || validation.playerError === 100 || validation.playerError === 101 || validation.playerError === 105 || validation.playerError === 150));
  const fallbackOn = isFallbackActive(!!primaryDead, backupCfg.recordingId);
  const status: AdminLiveStatus = validation
    ? adminStatusFor({
        validation,
        liveNow: air.state === "live",
        connecting: validating || !!air.checking,
        reconnecting: !!lastErr && Date.now() - lastErr.at < 120_000 && isRecoverablePlayerError(lastErr.code),
        fallbackActive: fallbackOn,
        checking: validating,
      })
    : validating || !!air.checking
    ? "CHECKING"
    : "UNVERIFIED";

  const readyNow = !!primaryId && !!verifiedId && primaryId === verifiedId && verifiedAt > 0 && !!validation?.canMarkReady;

  const validate = async () => {
    if (!primaryId) {
      setValidation({ ...emptyValidation(), checkedAt: Date.now() });
      return;
    }
    setValidating(true);
    try {
      const v = await fullPreflight(primaryId, { playerTest: true });
      setValidation(v);
      /* Stamp READY only on a pass — an invalid id never marks verified, and
         the reason sits in the draft note + on this panel, never hidden. */
      const latest = (cms.getDraft().live || {}) as Record<string, unknown>;
      if (v.canMarkReady) {
        cms.setSectionValue("live", { ...latest, liveVerifiedId: v.videoId, liveVerifiedAt: Date.now(), liveVerifyNote: v.diagnosis });
      } else {
        cms.setSectionValue("live", { ...latest, liveVerifiedId: "", liveVerifiedAt: 0, liveVerifyNote: v.diagnosis });
      }
    } catch {
      setValidation({ ...emptyValidation(), diagnosis: "Validation could not run — network or proxy down. Try again.", checkedAt: Date.now() });
    } finally {
      try { setValidating(false); } catch {}
    }
  };

  return (
    <Card className="admin__livehealth">
      <div className="admin__livehealth-head">
        <h4>Livestream health</h4>
        <Badge accent={status === "LIVE" ? "crimson" : status === "READY" ? "emerald" : status === "UNAVAILABLE" || status === "ENDED" ? "crimson" : status === "FALLBACK_ACTIVE" ? "gold" : "sky"}>
          {status.replace(/_/g, " ")}
        </Badge>
      </div>
      <dl className="admin__livehealth-grid">
        <div><dt>Video ID</dt><dd><code>{primaryId || "(none — channel watch only)"}</code></dd></div>
        <div><dt>Last successful check</dt><dd>{verifiedAt > 0 ? fmtTime(verifiedAt) : "never"}</dd></div>
        <div><dt>Player error</dt><dd>{lastErr && lastErr.code !== null ? `YouTube error ${lastErr.code} (${lastErr.context || "player"})` : lastErr ? `note: ${lastErr.context || "ok"}` : "none"}</dd></div>
        <div><dt>Recovery</dt><dd>bounded retries (max 6, 2s → 30s backoff); dead/private/unembeddable videos are never retried</dd></div>
        <div><dt>Backup recording</dt><dd>{backupCfg.recordingId ? <code>{backupCfg.recordingId}</code> : "not set — set it in the field below"}</dd></div>
        <div><dt>Offline message</dt><dd>{backupCfg.message ? backupCfg.message.slice(0, 120) : "(default message)"}</dd></div>
      </dl>
      {validation ? (
        <Notice icon={validation.canMarkReady ? "check" : "alert"}>
          <b>{validation.canMarkReady ? (readyNow ? "READY — verified." : "Passes validation.") : "Not ready."}</b> {validation.diagnosis}
          {validation.limitations.length > 0 && (
            <span> Limits: {validation.limitations.join(" ")}</span>
          )}
          {validation.title && <span> Title: {validation.title}.</span>}
          {validation.source === "oembed-fallback" && <span> Source: oEmbed mirror (no API key on the server).</span>}
          {validation.source === "data-api" && <span> Source: YouTube Data API.</span>}
        </Notice>
      ) : (
        <p className="muted">Not yet validated — press Validate before Publish. Metadata alone never declares playable: the check includes a real player init.</p>
      )}
      <div className="btn-row">
        <Btn size="sm" variant="gold" icon="check" onClick={validate} disabled={validating || !primaryId}>
          {validating ? "Checking…" : "Validate livestream"}
        </Btn>
        <Btn size="sm" variant="ghost" icon="play" onClick={() => setPreview(true)} disabled={!primaryId}>
          Preview livestream
        </Btn>
      </div>
      {!primaryId && (
        <p className="muted">Type the YouTube link in the field above first — the channel watch ({liveTarget()?.url || "no channel"}) needs no validation.</p>
      )}
      {preview && primaryId && (
        <Modal open onClose={() => setPreview(false)} title="Livestream preview">
          <p className="muted">This is the exact player init the validation runs — what you see here is what visitors get.</p>
          <VideoPlayer source={{ platform: "youtube", youtubeId: primaryId }} title={validation?.title || "Livestream preview"} autoPlay />
        </Modal>
      )}
    </Card>
  );
}
