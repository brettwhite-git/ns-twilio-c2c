# Click-to-Call for NetSuite — Product & Behaviour Spec

A NetSuite SuiteApp (SDF, app id `com.netsuite.clicktocall`) that adds browser calling to NetSuite through Twilio. Reps call from Customer / Contact / Lead pages and take inbound calls in a dock on every page. Twilio records and transcribes the call. NetSuite's N/llm writes a summary, a satisfaction score, tone keywords and proposed follow-ups on the Phone Call record.

**Principle: no middleware, no NetSuite webhook.** Everything runs in SuiteScript (Suitelets, RESTlet, User Events, a Scheduled Script, a Portlet, a UIF SPA) and on Twilio's managed platform (TwiML App + TwiML Bin, Studio, Voice, Recordings, Conversational Intelligence). NetSuite reaches Twilio; Twilio never calls NetSuite. NetSuite learns about calls from the browser (fast path) and from a 15-minute poller (safety net).

**Status (2026-10-31):** sandbox `td3061543` (MFG 25.2 AI), branch `feat/telephony-dock`. Outbound, phone mode, dock, inbound routing and inbound recording are committed and live-tested. Call reconciliation (§7) and rep presence (§8) are built in the working tree, not yet committed or live-tested.

**How to keep this current:** update SPEC.md in the same commit as any behaviour change. When this file and the code disagree, the code is the truth; fix this file.

Paths: `F/` = `src/FileCabinet/SuiteApps/com.netsuite.clicktocall/`; `W/` = `src/SuiteApps/com.netsuite.clicktocall/setup_wizard/` (TypeScript source of the wizard bundle).

---

## 1. Phone mode shell & one anchor

**Purpose.** NetSuite page loads end WebRTC audio. A call must live in a page that never reloads.

**Current behaviour.**
- The shell Suitelet `customscript_ctc_sl_shell` is the tab's top page. It holds two same-origin iframes: `#ctc-ns-frame` (full-size NetSuite UI) and `#ctc-phone-frame` (the softphone Suitelet, hidden, `allow="microphone; autoplay"`). The phone frame is the only "anchor" that holds audio and call state. There is no popup anywhere.
- Frame start path comes from `u=`, validated by `safeFramePath`: must start with `/app/`, 1–2000 chars, no `//`, `\`, whitespace, control chars, scheme, or dot segments. Else the default `/app/center/card.nl?sc=-29`. The shell keeps the address bar in step (`history.replaceState` with `u=`).
- A shell loaded inside a frame replaces itself with its frame path (never nests).
- **Web Lock** `ctc-phone-anchor`, `ifAvailable`. Lock held → phone frame loads. Lock busy → banner "Your phone is open in another tab", no phone. No Web Locks API → phone starts anyway.
- **Navigation API:** NetSuite's Redwood menu calls `top.location.replace()`. The shell cancels cancelable same-origin `/app/` push/replace navigations and loads them in the frame. Not touched: browser-UI navigations, reloads, back/forward, login pages, other origins, the shell URL, Exit.
- Login page in the frame (session timeout) → frame blanked, banner "Sign in again" (or "Your call is still connected"). "Reload page" also restarts the phone frame when no call is live.
- A `beforeunload` guard is on while the phase is `incoming`, `dialing`, `ringing` or `connected`.
- **Screen-pop:** the anchor posts `ctc-open-record` to the shell. Accepted only from `#ctc-phone-frame`, same origin, path `/app/common/entity/(custjob|contact).nl?id=<digits>`.
- **Entry:** the dashboard portlet's dock loader auto-enters phone mode once when no tab holds the lock and sessionStorage `ctc-phone-exit` is not `'1'`. Normal tabs show an "Open phone" chip.
- **Exit phone mode** (dialer gear view): confirm if a call is live, set `ctc-phone-exit` = `'1'`, load the frame's page as the top page.

**Rules & limits.** Only one phone per browser profile. Browsers without the Navigation API (older Firefox / Safari) leave phone mode on menu clicks (logged `navigation api missing`).

**Key files.** `F/ctc_sl_shell.js`, `F/lib/ctc_dock.js` (constants), `src/Objects/Scripts/customscript_ctc_sl_shell.xml`.

**Open gaps.** Company Landing Page entry is parked. Not tested in the frame: Save & Print, PDF, Change Role, address-editor popup windows.

---

## 2. Telephony Dock (pill + dialer panel)

**Purpose.** One phone control on every NetSuite page, drawn by the shell above the NetSuite frame.

**Dock modes** (`F/lib/ctc_dock_client.js`, picked at load): `shell` draws the pill and dialer; `frame` (NetSuite page in the shell) draws nothing, routes Call to `top.__ctcShell.call(ctx)` and exposes `window.__ctcRecordContext`; `outside` (normal tab) shows a chip only — mirrors a phone held by another tab (End / Mute allowed), else "Open phone" → shell with `u=`. Windows with `window.opener` draw nothing.

**Pill.**
- 8 snap points: rows t/m/b × columns l/c/r minus the centre (`tl tc tr ml mr bl bc br`). Default `bc`. Side margin 16 px, bottom row 24 px up. Shared across tabs in localStorage `ctc-dock-pos`. Arrow keys walk the grid.
- Shapes: **R5** horizontal (52 px high: grip, dot, words, timer, Mute, main button) on six points; **R4** vertical (52 px wide, no words) on `ml` / `mr`. Ready shows no words. Muted dot is gold. Inbound on but not registered → amber dot ("reconnecting").
- Drag: 4 px threshold; flick projection 200 ms when speed > 0.11 px/ms; no flick when the pointer was still > 100 ms before release.
- **Entrance:** one 260 ms fade + scale 0.96 → 1 (6 px travel), ease `cubic-bezier(0.23, 1, 0.32, 1)`, when the dock goes from hidden to shown. Reduced motion is honoured.
- In shell mode, bus silence during the first 15 s shows `starting`; after that a `hello` with no answer in 600 ms means offline. The dock pings every 15 s and on `visibilitychange`.

**Panel** (`F/lib/ctc_dock_dialer.js`).
- Fixed **380 × 620 px** for every view, capped by the screen (16 px each side, 24 px above the bottom). Views that need more scroll.
- Views: Dial (contact / number pickers, account tiles, keypad), Search, Recents, in-call (mute, end, DTMF keypad), ring (Answer / Decline), audio settings (gear: mic, speaker, Exit phone mode).
- A grip in the header drags the panel freely: lift (scale 1.02 + shadow), rubber band 0.3 past the screen edge, settle 300 ms `cubic-bezier(0.32, 0.72, 0, 1)`. It snaps to the pill's 8 points (flick-projected); the pill takes that point. Panel fade 200 ms.
- After-call note: `saved` and `skipped` notes hide after 10 s. A pending dial waits up to 15 s for the anchor.

**Bus contract** (BroadcastChannel `ctc-bus`, every message carries `v: 1`).
- Dock → anchor: `hello`; `request` actions `mute`, `unmute`, `hangup`, `digits {d}`, `dial {to, entityId, entityName, entityType, contactId, contactName}`, `setInput {id}` / `setOutput {id}` (refused during a call), `answer` / `decline` (only in phase `incoming`).
- Anchor → docks: `snapshot {phase, direction, caller, entityId, entityType, entityName, contactName, number, startedAt, muted, lastLog, audio, canReceive}`.
- `phase`: `offline | starting | ready | dialing | ringing | incoming | connected | error`. `direction`: `outbound | inbound`. `lastLog.status`: `saved | skipped | error | missed`. `canReceive`: `null` (token has no incoming grant) | `true` (registered) | `false` (inbound on, not registered).

**Rules & limits.** Nothing of ours may sit on a snap point. **Bump `DOCK_ASSET_VERSION` in `F/lib/ctc_dock.js` (now `'14'`) on every change to `ctc_dock_client.js` or `ctc_dock_dialer.js`**; it is the cache-bust query on both script URLs.

**Mounts.** Record pages via `F/ctc_ue_phone_button.js` (shown only when `custrecord_ctc_active` is true); dashboard via a hidden `<img onerror>` loader (`buildDockLoaderHtml`) because portlets strip `<script>`.

**Key files.** `F/lib/ctc_dock.js`, `F/lib/ctc_dock_client.js`, `F/lib/ctc_dock_dialer.js`.

---

## 3. Softphone (anchor)

**Purpose.** Holds the Twilio Device, call state, bus host and call logging.

**Token.** RESTlet `customscript_ctc_rl_token` (GET) builds a Twilio Access Token with N/crypto HMAC-SHA256 (`F/lib/ctc_twilio_jwt.js`): ttl 3600 s, `cty: twilio-fpa;v=1`, identity = NetSuite employee internal id, `outgoing.application_sid` = `custrecord_ctc_twiml_app_sid`, `incoming.allow` = `custrecord_ctc_inbound_enabled`. Signing secret: NetSuite API Secret named by `custrecord_ctc_api_secret_id`.

**Renewal.** Device option `tokenRefreshMs` 60 000 → `tokenWillExpire` → fetch token → `device.updateToken()`. Expiry codes 20104, 31204, 31205, 31206 renew and re-register instead of showing Error. Retries after 5 s, 15 s, 30 s. Audio setup runs only on the first registration. A renewal never resets a live call.

**Device.** `codecPreferences ['opus', 'pcmu']`, `allowIncomingWhileBusy: false`. SDK 2.7.3 bundled at `F/lib/twilio.min.js` (CDN blocked by CSP).

**Registration watchdog** (only while the token grants incoming). On `unregistered`: retry after 2 s, 5 s, 15 s, 30 s, then every 60 s, one timer at a time. Try now on page visible, `online`, `focus`. Every 60 s when no retry is pending. Never during a live or ringing call or an in-flight token refresh.

**Identity rebuild.** When a renewed token carries a different identity (NetSuite user changed), the device is rebuilt; during a live or ringing call the rebuild waits until the call settles. A changed incoming grant is applied to the existing device (`applyIncomingGrant`), which re-registers it.

**Heartbeat.** RESTlet action `phoneHeartbeat` on every registration change, after a token refresh, every 5 min, and an `offline` beacon on `pagehide`. See §8.

**Key files.** `F/ctc_sl_softphone.js`, `F/ctc_rl_token.js`, `F/lib/ctc_twilio_jwt.js`.

**Open gaps.** A change of identity or grant is caught only at the next token renewal (up to 1 h; the wizard says "within an hour, or at once after a reload").

---

## 4. Outbound calling & logging

**Current behaviour.**
- Call from a record (phone icon / Call button, VIEW and EDIT mode) or from the dialer. The anchor runs `device.connect({ params: { To, CallerId } })`; caller ID = `custrecord_ctc_phone_number` from the token response.
- The TwiML App points at a hand-made **TwiML Bin** that does `<Dial record="record-from-answer-dual">`.
- At hang-up the browser posts RESTlet `logCall` (`sendBeacon` on unload). The RESTlet creates a Phone Call (`record.Type.PHONE_CALL`) with `custevent_ctc_call_sid`, duration, entity / contact, status `Logged`, `custevent_ctc_inbound` for inbound.
- **Ownership check** (`F/lib/ctc_call_ownership.js`, `verifyCallOwnership`): the RESTlet fetches the Twilio call. Outbound: `from` must be the rep's client identity or one of the rep's assigned numbers (`customrecord_ctc_rep_assignment`), falling back to the config caller ID. Inbound: the leg's `to` must be `client:<rep id>`. Failure → `forbidden`.
- Duplicate `callSid` returns the existing record (`duplicate: true`).
- After logging, the browser polls `checkTranscript` every 15 s, up to 12 attempts.

**Rules & limits.**
- Browser: calls with no connect (duration 0) are not logged; calls under **3 s** are skipped ("Call too brief to log"). RESTlet: rejects under **2 s** (`duration_below_threshold`; Twilio does not transcribe recordings under 2 s).
- Phone must match `^\+?[0-9]{7,15}$`.
- **Orphan queue:** a transient `save()` failure writes `customrecord_ctc_orphan_call`. Poller Phase B retries up to 50 rows with `custrecord_ctc_orphan_retrycount` < 3, re-checking ownership first.

**Key files.** `F/ctc_ue_phone_button.js`, `F/ctc_sl_softphone.js`, `F/ctc_rl_token.js`, `F/lib/ctc_call_ownership.js`.

**Open gaps.** README / ARCHITECTURE show the Bin with `callerId="{{From}}"`; the browser sends `CallerId`, so the Bin text in the docs may be stale. No outbound recording notice (§12, §13).

---

## 5. Inbound calling

**Purpose.** A customer calls a rep's Twilio number; the rep's pill rings; the call is answered in the browser and logged.

**Routing flow.** `F/lib/ctc_inbound_routing.js` builds **one Studio flow for all numbers**, friendly name `CTC Inbound Routing`, from rep assignments:
- `routesFromAssignments`: one route per phone SID — the **primary rep** (`custrecord_ctc_ra_is_primary`), else the first assigned employee. Inactive assignment rows, rows without an employee and numbers without digits are skipped. A second SID with the same E.164 number is skipped. At most 50 routes.
- Shape: `Trigger ─incomingCall─▶ [recording_notice] ─▶ split_dialed ─To == route n─▶ ring_n` (connect-call-to `client:<employeeId>`, `caller_id {{contact.channel.address}}`, `timeout` = ring seconds, `record` = record flag) `─callCompleted─▶ answered_n` (`DialCallStatus == completed` → end, else → `no_answer`). `split_dialed` noMatch → `no_answer` (say-play message). The `answered_n` split is required: callCompleted fires for answered calls too.
- **Publish** (`publishRouting`): skipped when inbound is off; create/update the flow (`upsertStudioFlow`), store `custrecord_ctc_studio_flow_sid` and `custrecord_ctc_routing_published_at`, then point each routed number's VoiceUrl at the flow (`setNumberVoiceUrl`), keeping 100 units in reserve per number. Triggered by wizard "Save & publish" / "Publish again" (`wizardSaveInbound`, `wizardPublishRouting`) and automatically after `wizardSaveAssignments` when inbound is on.

**Ring & answer.** Ring time `custrecord_ctc_ring_seconds`: default 20, clamped 10–60. No-answer message `custrecord_ctc_noanswer_message` (blank → "Sorry, no one is available to take your call. Please try again later. Goodbye."). The anchor holds one pending call; a second call while busy is rejected. Caller cancel / ring timeout → `missed` note; Decline → `skipped` note.

**Caller match.** RESTlet `lookupCaller` → `lookupCallerByPhone`: last 10 digits (non-digits stripped both sides, SuiteQL `REGEXP_REPLACE`), customer / prospect / lead / contact; a match in the rep's book wins; a contact with a company returns the company as entity. The name fills in by a second snapshot. After Answer on a match, screen-pop opens the record in the NetSuite frame.

**Logging.** Answered inbound ≥ 3 s → `logCall` with `direction: 'inbound'` → `custevent_ctc_inbound` T. Missed inbound calls are logged only by reconciliation (§7).

**Recording.** `custrecord_ctc_record_inbound` → `record: true` on every ring widget. `custrecord_ctc_recording_notice_on` (applies only with recording on) adds one say-play before the split; text `custrecord_ctc_recording_notice` (blank → "This call may be recorded for quality and training.").

**Test setup.** +1 (855) 557-5596 → Burt Brocus, employee 120 (client identity `120`). Live result 2026-10-30: answered, matched 7 Abbott Inc., Phone Call 6438.

**Key files.** `F/lib/ctc_inbound_routing.js`, `F/lib/ctc_twilio_admin.js`, `F/ctc_sl_wizard_api.js`, `W/components/page/InboundPage.tsx`, `F/lib/ctc_workspace_queries.js`.

**Open gaps.** Inactive primary employee not filtered (call goes to no-answer). Turning inbound off leaves numbers on the flow (callers hear the no-answer message). Publish overwrites manual Studio edits. No voicemail, no fallback rep, no hunt group, anonymous callers not matched.

---

## 6. Recording, transcription & AI analysis

**Recording.** Outbound: TwiML Bin `record-from-answer-dual`. Inbound: Studio `record: true`; Twilio attaches the recording to the **parent** call (caller leg). The poller and RESTlet find it through the child leg's `parent_call_sid`.

**Transcription.** Twilio Conversational Intelligence service `custrecord_ctc_intel_service_sid` transcribes the recording. The poller reads `intelligence.twilio.com/v2/Transcripts?SourceSid=<recording>` and `/Sentences`. Speaker labels: dual-channel channel 1 = parent leg; outbound rep = channel 1, inbound rep = channel 2.

**Poller** `customscript_ctc_ss_poll` / `customdeploy_ctc_ss_poll` (`F/ctc_ss_poll_transcripts.js`): recurrence `daily`, every 1 day, from 00:00Z, repeat PT15M. Phases: A cleanup-pending recording deletes (≤ 50); B orphan retry (≤ 50); C unprocessed Phone Calls (≤ 50); D reconciliation (§7). Yields with `task.create` when fewer than 1000 units remain.

**Statuses** (`custevent_ctc_call_status`, `CALL_STATUS` in `F/lib/ctc_transcript_utils.js`): `Logged`, `Processing`, `Transcribed`, `No transcript`, `Failed`, `Missed`, `Too short`, `No answer`. Terminal: Transcribed, No transcript, Missed, Too short, No answer. A terminal status also sets `custevent_ctc_processed` T. `Processing` is written once.

**Wait rules.** No recording: read the Twilio Call; 1 h after the call ended (or at once if Twilio has no such call) → `No transcript`. Recording but no finished transcript: 24 h after the recording last changed → `No transcript`. Recording status `absent` or `deleted` is terminal. Times use Twilio UTC timestamps. Network errors, timeouts, 5xx, 401, 403 and 429 are transient: retry next cycle, never close a call.

**AI analysis** (`F/lib/ctc_llm_analysis.js`). N/llm `modelFamily: 'cohere.command-a-03-2025'`, temperature 0.2, maxTokens 800. Writes `custevent_ctc_ai_summary`, `custevent_ctc_ai_brief`, `custevent_ctc_satisfaction`, `custevent_ctc_tone_keywords`, `custevent_ctc_action_items`, `custevent_ctc_transcript`, and proposed tasks (`customrecord_ctc_proposed_task`). Skipped for the cycle when free usage < 10. JSON fences are stripped before parsing.

**Recording cleanup.** After transcript extraction the Twilio recording is deleted. A transient delete failure sets `custevent_ctc_recording_cleanup_pending` T for Phase A; 404 counts as deleted.

**Open gaps (live checks pending).** Studio `record: true` channel count (mono vs dual → speaker labels for inbound unverified); auto-transcription of inbound recordings; delete of the parent-call recording.

---

## 7. Call reconciliation (poller Phase D)

**Purpose.** Only the browser logs calls. Calls < 3 s, missed inbound calls and calls cut off by a crash or reload leave no Phone Call. Twilio is the source of truth.

**Current behaviour** (`F/lib/ctc_call_reconcile.js`, built, not yet committed).
- Lists Twilio Calls (page size 100) that ended since the watermark. Keeps only browser legs: inbound = `to` `client:<id>`; outbound = `from` `client:<id>`. Terminal statuses only: completed, busy, no-answer, canceled, failed.
- A call is created only when its end time is **5 min** old.
- **Dedupe:** already logged when a Phone Call has its own SID, or (inbound) its parent SID, or (outbound) one of its child SIDs (child page size 20). Batch SuiteQL check per page (chunks of 200), a second check right before create, one handling per SID per run.
- **Status mapping:** not answered (status ≠ completed or 0 s) → inbound `Missed` ("Missed call from <name or number>"), outbound `No answer` (from the dialed child leg); completed < 3 s → `Too short`; completed ≥ 3 s → `Logged` (the transcript pass takes it). Processed T except for `Logged`. Rep = client id, only if an active employee. Entity via `lookupCallerByPhone`. Inbound sets `custevent_ctc_inbound`.
- **Watermark** `custrecord_ctc_recon_watermark` (ISO UTC). Moves only after a complete run, to now − 5 min, never past a call whose create failed. Next run starts 15 min before it, never more than 7 days back. **First run: 7-day backfill.**

**Governance.** Starts only with ≥ 2000 units left; stops before the next page or call below 1000; at most 5000 units and 200 pages per run. About 70 units per created call.

**Open gaps.** Not live-tested. New statuses are not yet shown in the UI (§13).

---

## 8. Rep presence / heartbeat

**Purpose.** Show a stale or unregistered phone before a caller hits it.

**Current behaviour** (built, not yet committed).
- Record `customrecord_ctc_rep_presence`, one row per employee: `custrecord_ctc_rp_employee`, `custrecord_ctc_rp_last_seen` (ISO), `custrecord_ctc_rp_can_receive`, `custrecord_ctc_rp_state` (`registered | unregistered | registering | offline`), `custrecord_ctc_rp_incoming_granted`, `custrecord_ctc_rp_client` (browser label, ≤ 80 chars), `custrecord_ctc_rp_last_change` (last change of can-receive).
- RESTlet `phoneHeartbeat`: employee = session user, never a body value. `canReceive` is true only when registered and incoming is granted. An unchanged heartbeat within 60 s is not written.
- Wizard `wizardLoadPresence`: `stale` when no heartbeat in **12 min** (or never). Status rule (`W/components/shared/phoneStatus.ts`): stale or `offline` → Offline (grey); not registered or not can-receive → Not receiving calls (amber); else Receiving calls (green).
- Shown on the wizard Health page "Phones" table (Rep · Status · Last seen) and the Inbound page routing table "Phone" column.

**Open gaps.** Soak test (idle 60 min, sleep, network off/on, background tab) not run. No alerting.

---

## 9. Sales Rep Central portlet & Reporting Central

**Portlet** `customscript_ctc_pl_dashboard` (`F/ctc_pl_dashboard.js`, self-contained). Period control Today / Yesterday / This week / Last week; flat KPI strip; tabs Calls / Follow-ups; up to 5 calls and 5 follow-ups (total from `runPaged().count`, kept in `data-fu-total`); inline approve / reject; "Approve all N" approves only the rows on screen; a "Reporting Central" link carrying `range=`. Mounts the dock loader. Portlet HTML uses inline `on*` handlers only.

**Reporting Central** `customscript_ctc_sl_reporting` (`F/ctc_sl_reporting.js`). Ranges `today | yesterday | thisweek | lastweek | custom` (from / to); tabs Calls / Follow-ups / Missed; direction filter All / Outbound / Inbound / Missed; search; CSV export (`csv=1`, cells defused against formula injection). No detail panel.

**Shared.** Rep's book = primary sales rep OR Sales Team member (SuiteQL `customerSalesTeam.customer`). Font: Figtree woff2 from the File Cabinet (`F/lib/ctc_fonts.js`, `F/lib/fonts/`), no font CDN. Call rows carry `timeOfDay` from `starttime`, else `createddate`.

**Portlet call statuses** (one `STATUS_RULES` table, used by the server render and the period-refresh JS). With no AI brief: Logged / Processing → "Processing…"; No transcript → "No transcript"; Too short → "Too short to summarize"; Failed → "Summary failed"; Missed → coral chip "Missed call" (`ctc-pl-status-missed`) + coral inbound arrow + Length "—"; No answer → grey chip "No answer" (`ctc-pl-status-quiet`), Length "—" when 0 s. Calls KPI sub-line "<n> missed" (coral); average talk time excludes 0 s rows. Status chips use `ctc-pl-status`, never `ctc-pl-chip` (that class belongs to the period buttons).

**Rules.** **Reporting Central's "Missed" still means a call with no talk time (duration 0, `isUnconnected`), not status `Missed`.**

**Open gaps.** Missed tab should read status `Missed` once reconciliation ships. Portlet `<style>` / `@container` survival in the live portlet copy not verified.

---

## 10. Setup Wizard admin console

UIF SPA `custspa_ctc_setup_wizard` (source `W/`, bundle `F/setup_wizard/`), server endpoints in `customscript_ctc_sl_wizard_api` (`F/ctc_sl_wizard_api.js`). Config is edited only here (the config record blocks UI edits).

**Onboarding steps.** 1 Prerequisites · 2 Connect Twilio (Account SID, API Key SID, API Secret id) · 3 Voice (TwiML App, caller ID, Intelligence service) · 4 Phone numbers + rep assignments · 5 Test & activate (`wizardActivate` sets `custrecord_ctc_active`).

**Console pages.**
- **Overview** — recent calls, rep activity chart (`wizardListRecentCalls`, `wizardSnapshot`).
- **Credentials** — Twilio credential fields (`wizardSavePublicIds`).
- **Phones & reps** — numbers and assigned reps, primary flag (`wizardLoadAssignments`, `wizardSaveAssignments` → auto-republish when inbound is on).
- **Voice** — TwiML App, default caller ID, Conversational Intelligence (`wizardSaveVoice`, live Twilio lists).
- **Inbound calls** — on/off, ring seconds, no-answer message, record inbound, notice on/off + text, publish status, routing table with Phone column (`wizardLoadInbound`, `wizardSaveInbound`, `wizardPublishRouting`).
- **Health** — preflight checks, drift rows, "Phones" presence table (`wizardRunPreflight`, `wizardLoadPresence`).

**Build.** `npm run typecheck`, `npm run lint`, `npm test`, `npm run bundle`; bundle is committed; CI checks bundle drift.

**Open gaps.** Voice page and Step 3 say "The wizard registers this app's VoiceUrl" — no code does. Health "TwiML VoiceUrl" drift row gets no data and always shows Pass.

---

## 11. Phone Call record

**Today.** `customscript_ctc_ue_transcript_viewer` (VIEW and EDIT) injects a "Call Intelligence" panel above Primary Information: status pill (Logged / Processing / Transcribed / No transcript / Failed only), AI summary block, 4-column metrics (satisfaction, duration, tone keywords, recording), transcript, action items. Redundant CTC fields are hidden in VIEW mode.

**Phone Call fields** (`custevent_ctc_*`): `call_sid`, `call_status`, `duration`, `inbound`, `processed`, `recording_sid`, `recording_url`, `recording_cleanup_pending`, `transcript`, `ai_summary`, `ai_brief`, `satisfaction`, `tone_keywords`, `action_items`.

**Planned redesign (not built):** design canvas "Phone Call Record — Enhanced", https://claude.ai/artifact/TDtqWmXLx2rehn8YMVk7zt.

**Open gaps.** Panel has no style for `Missed`, `Too short`, `No answer` (no pill shows).

---

## Reference: custom records & config fields

- `customrecord_ctc_config` (singleton, access NONENEEDED): `custrecord_ctc_account_sid`, `_api_key_sid`, `_api_secret_id`, `_twiml_app_sid`, `_phone_number` (caller ID), `_intel_service_sid`, `_active`, `_inbound_enabled`, `_ring_seconds`, `_noanswer_message`, `_studio_flow_sid`, `_routing_published_at`, `_record_inbound`, `_recording_notice_on`, `_recording_notice`, `_recon_watermark` (all `custrecord_ctc_` prefix).
- `customrecord_ctc_rep_assignment`: `custrecord_ctc_ra_employee`, `_phone_sid`, `_phone_number`, `_label`, `_is_primary`.
- `customrecord_ctc_orphan_call`: `custrecord_ctc_orphan_callsid`, `_recordingsid`, `_entityid`, `_entitytype`, `_userid`, `_phone`, `_direction`, `_retrycount`, `_contactid`, `_duration`.
- `customrecord_ctc_proposed_task` (+ list `customlist_ctc_pt_status`): `custrecord_ctc_pt_phone_call`, `_text`, `_status`, `_proposed_due`, `_proposed_assignee`, `_reviewer`, `_reviewed_date`, `_created_task`, `_task_completed`, `_task_completed_date`.
- `customrecord_ctc_rep_presence`: see §8.
- Scripts: `customscript_ctc_ue_phone_button`, `_ue_transcript_viewer`, `_sl_softphone`, `_sl_shell`, `_sl_reporting`, `_sl_wizard_api`, `_rl_token`, `_ss_poll`, `_pl_dashboard`; SPA `custspa_ctc_setup_wizard`.

---

## 12. Decisions log

- 2026-02-18 — Twilio signing secret lives in NetSuite API Secrets; JWT built with N/crypto, no Twilio SDK on the server.
- 2026-05 — Polling model: Scheduled Script every 15 min; no webhook endpoints.
- 2026-10-29 — One anchor in the phone mode shell; popup removed; Web Lock `ctc-phone-anchor`.
- 2026-10-29 — Company Landing Page entry parked; entry stays the dashboard portlet.
- 2026-10-30 — Tests and mocks (`__tests__/`, `__mocks__/`) stay local and untracked (`.gitignore`). Revisit: tracking recommended.
- 2026-10-30 — Inbound routing on Twilio Studio, not a NetSuite webhook and not a TwiML Bin pair.
- 2026-10-31 — One Studio flow for all inbound numbers, generated and published by NetSuite; the primary rep rings.
- 2026-10-31 — Inbound recording on (with optional notice before the ring).
- 2026-10-31 — Outbound recording notice: optional, off by default. Recommended design: Studio whisper via `<Dial><Number url>` + one manual Bin edit per install. Pending a live spike.
- 2026-10-31 — Bounded waits for transcripts (1 h no recording, 24 h no transcript); 401/403/429 transient.
- 2026-10-31 — Twilio is the source of truth for call history; reconciliation fills gaps, the browser stays the fast path.

---

## 13. Open gaps & next work

1. **Outbound recording notice spike** — callee hears the notice and the call bridges; notice inside / outside the recording; token params priority; `answerOnBridge`. Legal wording for all-party-consent states needs counsel.
2. **New status chips UI** — `Missed` / `Too short` / `No answer` in the portlet, Reporting Central (Missed tab from status) and the Phone Call panel.
3. **Phone Call record redesign** — build from the approved canvas (§11).
4. **Wizard VoiceUrl claim** — Voice page / Step 3 say the wizard registers the TwiML App VoiceUrl; no code does. Health "TwiML VoiceUrl" drift row always passes.
5. **Identity / grant change** caught only at token renewal (up to 1 h).
6. **Inactive primary rep** still routed; caller hears the no-answer message.
7. **Inbound off** leaves numbers pointed at the flow.
8. **Flow publish overwrites** manual Studio edits.
9. **No voicemail, no fallback rep / hunt group.**
10. **Monitoring / alerting** — no alert on poller failure, stale phones or publish errors.
11. **Inbound recording speaker channel** unverified (mono vs dual); auto-transcription and parent-recording delete unverified.
12. **Commit + live-test** reconciliation (§7) and presence (§8); staleness soak test.
13. Missed inbound calls arrive up to ~20 min late (5 min settle + 15 min poll).

### Known doc inaccuracies (code is the truth)

- CLAUDE.md: `DOCK_ASSET_VERSION` "now `'8'`" → code `'14'`.
- CLAUDE.md: panel "as tall as its content … stuck to the left/right edge … localStorage `ctc-dock-panel-side`" → code: fixed 380 × 620, 8-point drag; key removed.
- CLAUDE.md: "Shell test controls … only with `&debug=1`" → removed in the 2026-10-30 cleanup.
- CLAUDE.md: "6 scripts", "Inbound is not built", "What NOT to Build: no inbound" → 9 scripts + SPA; inbound is built.
- ARCHITECTURE.md / README.md: TwiML Bin `callerId="{{From}}"` → the browser sends `CallerId`.
- `lib/ctc_workspace_queries.js` comments still say "CTC is outbound only" / missed inbound calls are not logged.
