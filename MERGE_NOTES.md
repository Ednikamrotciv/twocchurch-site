# Merged build — secure base + first instant publish

Base: church-site-secure.zip (all security retained).
Ported from church-site.zip (first): ONLY the instant cross-device Publish → maintenance lift.

What this build does:
- New deploy HOLDS on the maintenance notice (fresh opaque deploy ID per build, deploy lock, clean-deploy.txt, maintenance-hold.txt, index.html pre-bundle gate). No numbers — every new code looks new, even same BUILD_NOTES.
- Any admin Publish CLEARS it at once everywhere: this tab (markDeployPublished, synchronous), every other tab same browser (localStorage storage event + BroadcastChannel wom.cms.publish, no reload), every other browser/device (socket shout + HTTP contentRev poll 5s base / 10s hurry while waiting + SSE instant-push ~1s + office→live relay + feed mirror + convergeNow + postDeploy clock witness + same-code server attestation). Local included (localOnly bless path also stamps publish clock + carries relay in background).
- New deploy wipes old wakes (wipeOldWakes unregisters SW + drops caches on fresh deploy/proven new update), unsaved changes clean/new-empty (DEPLOY_SEEN clears draft+pending+dirty once per deploy), clean-stage welcome-only until Recover+Publish, fresh/clean/new deploy. Nothing ever deleted (backups + office disk + seed kept). First Publish consumes clean-deploy.txt by itself (push commit deletes it) so next rebuild carries words.
- All security from second retained: WAF + session-anomaly + security-log + publish-watch + SECURITY.md + ADMIN_HASH_OVERRIDE + per-IP login backstop + server-side admin doors. WAF allow-lists publish/contentRev/events/seed/relay so instant lane untouched. Publish bodies never signature-scanned.

No other behavior from first was ported. Very-fast tuning: background relay per-fetch 12s (fails fast, 4s retry carries it — awake live lands in 1-2s, sleepy live lands via quick retries); foreground click stays bounded (~3.5s) so the office toast is immediate and local/other-tab lift never waits on live; publish-watch proves at ~3s/~13s/~28s/~48s with 8s fetch bound, stuck signal in under a minute.

One-click fix (Publish == Publish now): a stale office tab on the previous deploy stamps the FRESH deploy id from version.json in the same click — no reload + second click. Only a real update (newer notes/code the old bundle cannot bless) still reloads first. Stale auto-reload is suppressed while the click runs so the send finishes; the tab reloads onto the new build afterwards by itself.

Livestream unavailable fix: the player pre-check (oEmbed/noembed) misses embed-time failures (deleted/private after check, embedding disabled, age-gate, region block) — YouTube then sits on its black "This video is unavailable" frame. The player now loads the YouTube IFrame API once and swaps any embed error (100/101/105/150) to the dead fallback (poster + Watch on YouTube) instead of the black frame. Embed URLs carry enablejsapi=1; verifier expectations updated to match. Unknown/API-down keeps the old behavior.
