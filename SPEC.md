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
- **Web Lock** `ctc-phone-anchor`, `ifAvailable`. Lock held → phone frame loads. Lock busy → banner "Your phone is open in another tab" (buttons Reload, **Use phone here**), no phone; the waiting shell also queues a normal lock request, so it takes the phone by itself when the holder closes, crashes or is discarded (banner hides, phone starts). No Web Locks API → phone starts anyway.
- **Takeover ("Use phone here")** — `__ctcShell.takeover()` or the banner button, only in a waiting shell: sends bus `takeover`. The anchor refuses during a live / ringing call (`refused.reason 'call-live'`); else it unregisters, publishes phase `moved` and posts `ctc-phone-moved` to its shell. The waiting shell steals the lock (`{ steal: true }`, its queued request cancelled first) after the `moved` snapshot, or after **3 s** with no answer. The old shell stops its phone frame at `moved` but keeps the lock until the steal (so its own queued request cannot win the free lock), then waits in turn; no steal in **10 s** → it restarts its own phone. A holder whose lock is stolen without a handover stops its phone and waits. URL `takeover=1` makes a shell that finds the phone busy ask at once (the outside-tab dock's "Use phone here", §2). `__ctcShell.phoneState()` → `{ lock: 'none'|'held'|'moving'|'waiting'|'stealing'|'disabled', audioUnlocked, notify }`.
- **Phone not enabled** — the anchor posts `ctc-phone-disabled` when the RESTlet answers `not_a_phone_user`: the shell releases the lock, stops the phone frame and shows "The phone is not enabled for your user. Ask your administrator." with **Exit phone mode**.
- **Audio + notifications unlock** — `audioUnlocked` = the tab had a user gesture (`navigator.userActivation.hasBeenActive`, a pointer / key event in the shell, or a 2 s poll that notices activation from NetSuite-frame clicks). Every unlock posts `ctc-unlock-audio` to the phone frame (it resumes Twilio's `AudioContext` and plays one silent sample: the ringtone can be blocked by autoplay until a gesture). `__ctcShell.unlockAudio()` (dock "Turn on phone" / "Get call alerts", §2) or a bus `unlockAudio` received while this tab has transient activation also calls `Notification.requestPermission()`, once. The shell sends `{ audioUnlocked, notify }` to the phone frame (`ctc-shell-state`) on phone-frame load and on change; the anchor puts both in the snapshot.
- **Inbound ring (away)** — the dock draws the incoming card (§2); the shell has no toast and no live region of its own. When the tab is hidden or the window unfocused during phase `incoming`: a system Notification (tag = call SID, `requireInteraction`, replaced when the caller name arrives) when permission is granted, and the title flashes "Ringing · <caller>" every 1 s; both stop when the phase leaves `incoming`, and the flash stops when the rep comes back. A notification click → `window.focus()` + `window.__ctcDock.focusIncoming()` (focuses the card's Answer, or the panel's Answer when the panel is open).
- `debug=1` on the shell URL is passed on to the softphone URL (Twilio SDK log level 1) and kept by `history.replaceState`.
- **Navigation API:** NetSuite's Redwood menu calls `top.location.replace()`. The shell cancels cancelable same-origin `/app/` push/replace navigations and loads them in the frame. Not touched: browser-UI navigations, reloads, back/forward, login pages, other origins, the shell URL, Exit.
- Login page (or an unreadable cross-origin page) in the frame (session timeout) → frame blanked, banner "Sign in again" (or "Your call is still connected"). "Reload page" reloads only the NetSuite frame. **Sign-in again:** the first normal (non-login) page the frame loads after the banner hides the banner and restarts the phone frame (`restartPhone`, loads the softphone URL again) when no call is live; during a live call the restart is skipped and the softphone recovers by itself (§3). **The restart is also skipped when the phone already recovered by itself** (its latest snapshot has no `session` / `signed_out` error and `canReceive` is not false; 2026-11-02, the soak test found a needless ~6 s gap). Before any snapshot the shell restarts. A login page after Reload shows the banner again, with no restart.
- **Signed out (phone error kind `signed_out`, 2026-11-02):** the shell shows the same session banner and, when the rep is away (tab hidden or window unfocused) and notifications are granted, one system notification "Signed out of NetSuite" / "Sign in again to keep receiving calls." (tag `ctc-signed-out`, `requireInteraction`). A banner raised this way hides, and the notification closes, when the phone recovers; a banner raised by a login page in the frame keeps the rule above.
- Both the shell and the softphone Suitelet send `Cache-Control: no-store, max-age=0` and `Pragma: no-cache` (`ctcHtml.setNoStoreHeaders`; a refused header never breaks the page).
- A `beforeunload` guard is on while the phase is `incoming`, `dialing`, `ringing`, `connected` or `reconnecting`.
- **Screen-pop: removed (2026-11-01, user decision).** Answering never navigates; the rep may be mid-task, and the panel's Open record link opens the record. The shell still accepts `ctc-open-record`, though nothing sends it: accepted only from `#ctc-phone-frame`, same origin, path `/app/common/entity/(custjob|contact).nl?id=<digits>`. `ctc-phone-moved` and `ctc-phone-disabled` are accepted from the same sender only.
- **Entry:** the dashboard portlet's dock loader auto-enters phone mode once when no tab holds the lock, sessionStorage `ctc-phone-exit` is not `'1'` and the phone is not marked not-enabled for this browser (localStorage `ctc-phone-not-enabled`, §2). Normal tabs show an "Open phone" chip, or the remote-control dock when another tab holds the phone (§2).
- **Exit phone mode** (dialer gear view): confirm if a call is live, set `ctc-phone-exit` = `'1'`, load the frame's page as the top page.

**Rules & limits.** Only one phone per browser profile. Browsers without the Navigation API (older Firefox / Safari) leave phone mode on menu clicks (logged `navigation api missing`).

**Key files.** `F/ctc_sl_shell.js`, `F/lib/ctc_dock.js` (constants), `src/Objects/Scripts/customscript_ctc_sl_shell.xml`.

**Open gaps.** Company Landing Page entry is parked. Not tested in the frame: Save & Print, PDF, Change Role, address-editor popup windows.

---

## 2. Telephony Dock (pill + dialer panel)

**Purpose.** One phone control on every NetSuite page, drawn by the shell above the NetSuite frame.

**Dock modes** (`F/lib/ctc_dock_client.js`, picked at load): `shell` draws the pill and dialer; `frame` (NetSuite page in the shell) draws nothing, routes Call to `top.__ctcShell.call(ctx)` and exposes `window.__ctcRecordContext`; `outside` (normal tab):
- **Another tab holds the phone** (Web Lock held; without Web Locks: an anchor answers the bus) → **remote control**: the same pill and 380 × 620 panel as the shell (Dial / Search / Recents, in-call controls, incoming Answer / Decline), all sending bus requests to the phone tab's anchor. The record page's Call button opens this panel on Dial (it no longer leaves the page). The panel bottom says "Audio plays in your phone tab."; its gear view shows **Use phone here** instead of Exit phone mode (only when no call is live): this tab loads the shell with `u=<this path>&takeover=1`. If the dialer script is missing, the old mirror chip + call card is drawn.
- **No tab holds the phone** → "Open phone" chip → shell with `u=`.
- **Phone not enabled** → nothing at all (see Errors).
Windows with `window.opener` draw nothing.

**Pill.**
- 8 snap points: rows t/m/b × columns l/c/r minus the centre (`tl tc tr ml mr bl bc br`). Default `bc`. Side margin 16 px, bottom row 24 px up. Shared across tabs in localStorage `ctc-dock-pos`. Arrow keys walk the grid.
- Shapes: **R5** horizontal (52 px high: grip, dot, words, timer, Mute, main button) on six points; **R4** vertical (52 px wide, no words; `title` + `aria-label` carry them) on `ml` / `mr`. Ready shows no words. Muted dot is gold. Inbound on but not registered → amber dot ("reconnecting").
- **Phases:** `incoming` rings in sky `#74C0FC` (dot + pulse) so ringing reads apart from a green connected call; the pill has no buttons then: horizontal reads "Ringing", vertical shows the pulsing dot only. Answer / Decline live on the incoming card (below) or in the open panel. `reconnecting` keeps the call pill (name, timer running, Mute, End) with an amber dot and amber second line "Reconnecting…". `moved` → light pill "Phone moved to another tab" (shown whole); a click opens a small menu (150 ms fade + scale 0.97 → 1, closes on Escape / outside press) with **Use phone here** (shell: `__ctcShell.takeover()`; outside: shell URL with `takeover=1`).
- **Between calls, in this order** (shell and remote tabs): error kind (below) → **Turn on phone** (shell tab only, `snap.audioUnlocked === false`, phase ready: the words read "Turn on phone"; a click calls `__ctcShell.unlockAudio()` and does not open the panel; the pill remembers the action at pointerdown / keydown, because the shell's own gesture listener can unlock and re-render first) → **missed calls** (`missedUnseen.count > 0`, phase ready: coral `#D9553F` dot + "N missed"; vertical: a coral count badge on the dot, 9+ cap). Opening the panel sends `markMissedSeen`.
- **Errors** (`snap.error.kind`, between calls only; a device error during a live call keeps the call pill): `mic` → light error pill "Microphone blocked"; `signed_out` → amber "Sign in to NetSuite" (click: reload the NetSuite frame in the shell, else the page, so NetSuite shows its sign-in; the panel alert "Your NetSuite session ended. Sign in again in this tab." + Sign in); `session` → amber "Reconnecting…" (panel: "Reconnecting the phone…", no button); `network` → amber "Reconnecting…"; `twilio` → "Phone error". Plain phase `error` with no kind: "Phone error · Click to reconnect". `not_enabled` → no pill in any mode (the shell shows its own banner; shell lock `disabled` counts too). The dock stores localStorage `ctc-phone-not-enabled` = `'1'` and `ctc-phone-not-enabled-at` = epoch ms when a snapshot carries `not_enabled`; the flag expires after **24 h** and is cleared by any snapshot in `ready`, `incoming` or a live phase (a working token). While it is set, outside tabs draw nothing and the dashboard loader does not auto-enter phone mode.
- **Accessibility:** two visually hidden live regions in the dock's shadow root (outside `.dock`, so a hidden dock still speaks): assertive "Incoming call from X" (shell and remote tabs; the only announcement of a ring), polite "Call connected", "Reconnecting", "Call ended", "Missed call from X". Nothing is said for the first snapshot after load. The control that opens the panel / menu carries `aria-expanded` (`aria-haspopup="menu"` for the moved menu).
- Drag: 4 px threshold; flick projection 200 ms when speed > 0.11 px/ms; no flick when the pointer was still > 100 ms before release.
- **Entrance:** one 260 ms fade + scale 0.96 → 1 (6 px travel), ease `cubic-bezier(0.23, 1, 0.32, 1)`, when the dock goes from hidden to shown. Reduced motion is honoured.
- In shell mode, bus silence during the first 15 s shows `starting`; after that a `hello` with no answer in 600 ms means offline. The dock pings every 15 s and on `visibilitychange`.

**Incoming card** (`F/lib/ctc_dock_client.js`, the pill morphs into the card: sample A1, 2026-11-01).
- Shows while the phase is `incoming` and the panel is closed, in the shell and in remote tabs (phone held by another tab, with or without the dialer). Opening the panel hides it at once (the panel's ring view has Answer / Decline); closing the panel while it still rings brings it back. No card while the dock is hidden (not enabled).
- 320 px wide (at most viewport − 32), radius 16 px, navy like the pill, white text. Row: sky dot · "Incoming call" (11 px `#9FC9EE`) over the caller name, else the formatted number (15 px semibold), over "number · contact" (12 px `#94A6BF`, ellipsis, each part only when it adds something) · Decline (36 px round `#EE6E5C`, handset 135°) · Answer (36 px round `#14B981`). Press scale 0.97, 140 ms ease-out.
- `role="alertdialog"`, `aria-label` "Incoming call from X"; the buttons say "Answer / Decline call from X". It never takes focus by itself (a NetSuite form keeps it); Escape does nothing. `__ctcDock.focusIncoming()` focuses Answer (shell notification click). After a keyboard Answer / Decline, focus goes to the pill.
- Answer / Decline send bus `answer` / `decline` (origin `dock` + nonce) straight from the dock, in the shell too. The card then exits and stays away for that ring (call SID); the connected pill and missed counting are unchanged. Answering does not navigate.
- **Placement:** centred on the pill, kept 16 px inside the viewport: one rule for all 8 points, horizontal or vertical pill. The pill sits under the open card at opacity 0 and comes back when the card closes (at once when the dock hides). Re-placed on resize, while the pill is dragged, and on a snap (glides with the pill: `translate` 300 ms `cubic-bezier(0.32, 0.72, 0, 1)`).
- **Motion** (WAAPI, clip-path + opacity; curve `cubic-bezier(0.23, 1, 0.32, 1)`): enter 1280 ms, the card's clip grows from the pill's rect (pill radius) to `inset(-32px round 48px)` (open, room for the shadow); the pill fades out over the first 480 ms; the card content fades in from 40 % (512 ms delay, 768 ms). Exit (answer, decline, caller hung up, phase leaves `incoming`) 880 ms: content fades out over 352 ms, the clip shrinks back to the pill's rect, the pill fades in over the last 396 ms; a closing card takes no clicks. A new ring during an exit starts from what is drawn (interruptible). Reduced motion: opacity only, 120 ms. The user chose the slow pace (4× the sample) on 2026-11-01.

**Panel** (`F/lib/ctc_dock_dialer.js`).
- Fixed **380 × 620 px** for every view, capped by the screen (16 px each side, 24 px above the bottom). Views that need more scroll.
- Views: Dial (contact / number pickers, account tiles, keypad), Search, Recents, in-call (mute, end, DTMF keypad), ring (Answer / Decline), audio settings (gear: mic, speaker, Exit phone mode).
- **Recents** (RESTlet `softphoneRecents` → `loadHistoryRows({ dateRange: 'last7days' })` = `startdate onorafter daysago7`; `last30days` = `daysago30`. The old `within lastweektodate` meant last week up to the same weekday and returned nothing for this week's calls). Each row: direction icon (20 px circle, 12 px arrow: down-left for in / missed, up-right for out; panel tints of the portlet colours — In `rgba(116,192,252,0.18)` / `#9FD0FA`, Out `rgba(255,255,255,0.10)` / `#C9D3E1`, Missed `rgba(238,110,92,0.20)` / `#FFA595`, arrow vs circle ≥ 5:1; `role="img"` + aria-label + title "Inbound call" / "Outbound call" / "Missed call"), name, sub line, date + minutes. Missed rows (status `Missed` or a voicemail, the portlet's `isMissedCall` rule) start the sub line with "Missed" / "Voicemail" in `#FF9E8C` and carry a **Call back** button (same dial path as the missed note; the row is an `li.dl-recent` card holding the row button and Call back side by side). A row click still loads the record on Dial.
- **Pending missed row:** the newest `missedUnseen.last` (kept by the panel after `markMissedSeen`, with `missedUnseen.at`) shows at the top of Recents as "Missed · just now" (then "N min ago", "N h ago") with Call back, until Recents holds a Phone Call from the same number (last 10 digits) whose `startedAt` (row field = `custevent_ctc_call_started`, ISO UTC) is no earlier than `at` − 2 min (`at` is when the ringing stopped; the record keeps when it started). Recents reloads when opened more than 60 s after its last load, and when a call ends (at once if Recents is in front).
- A grip in the header drags the panel freely: lift (scale 1.02 + shadow), rubber band 0.3 past the screen edge, settle 300 ms `cubic-bezier(0.32, 0.72, 0, 1)`. It snaps to the pill's 8 points (flick-projected); the pill takes that point. Panel fade 200 ms.
- After-call note: `saved` and `skipped` notes hide after 10 s; the timer pauses while the note is hovered or holds focus and goes on with the time left. A pending dial waits up to 15 s for the anchor.
- **Missed-call note** (`lastLog.status 'missed'`), never auto-hidden: it stays until the rep closes it or uses Call back, also when the anchor restarts without a `lastLog`; a new call replaces it. "Missed call from <name or number>" with **Call back** (loads the caller on Dial and dials through the normal dial path) and **Open record** (when the caller matched a record). The caller comes from `missedUnseen.last`, kept by the panel because `markMissedSeen` clears it; else `snap.caller`.
- **Error banner** under the header (between and during calls): `mic` → "Microphone blocked" + "Click the lock icon in the address bar › Allow microphone › reload" + **Reload**; `session` → "Your NetSuite session ended. Sign in again in this tab." + **Sign in** (outside: reloads the tab; shell: reloads the NetSuite frame, where the shell's sign-in banner takes over); `twilio` → "Phone error" + `error.message` + **Retry**. Reload / Retry reload the shell's `#ctc-phone-frame` (never during a call; hidden in remote tabs). `network` has no banner; the header badge says "Reconnecting…".
- **Call quality** (`callWarning`, in-call view): one amber line under the timer — `low-mic` (also the raw `constant-audio-input-level`) → "We can't hear your microphone" (not while muted); every other value (`no-audio`, `packet-loss`, `high-rtt`, `high-jitter`, `low-mos`, raw `high-packet-loss`, `ice-connectivity-lost`) → "Weak connection". Cleared on `''`.
- **Refused requests:** the panel remembers the nonces it sent; a `refused` with one of them shows once, muted, for 4 s: `rate` / `hourly-limit` → "Too many calls in a short time — wait a moment"; `invalid-number` → "That number can't be dialled"; `busy` → "Finish the current call first".
- **Call alerts** (header, under the buttons): `notify === 'default'` in the shell tab → text button **Get call alerts** (sends `unlockAudio` via `__ctcShell.unlockAudio()`; the shell asks for Notification permission from that click); `notify === 'denied'` → muted "Call alerts are off in this browser". Remote tabs never show the button.
- Search filter chips are at least 24 px tall.

**Bus contract** (BroadcastChannel `ctc-bus`, every message carries `v: 1`). The full contract, with every field, is the comment block in `F/lib/ctc_dock.js` (BUS CONTRACT); this is a summary.
- Dock → anchor: `hello`; `request {action, origin: 'dock', nonce}` — the anchor drops a request without `origin: 'dock'` and a fresh nonce (8–64 chars `[A-Za-z0-9_-]`, last 64 remembered against replay). Actions `mute`, `unmute`, `hangup`, `digits {d}`, `dial {to, entityId, entityName, entityType, contactId, contactName}`, `setInput {id}` / `setOutput {id}` (refused during a call), `answer` / `decline` (only in phase `incoming`), `markMissedSeen`, `takeover` (§1), `unlockAudio` (handled by the shell, only with a gesture in that tab).
- **Dial gate:** phase must be `ready` (else `busy`); `to` must be dialable after normalisation: `+1NXXNXXXXXX` or `+` and 7–15 digits outside +1 (else `invalid-number`); one dial per 3 s (`rate`) and 20 per rolling hour per anchor page (`hourly-limit`).
- Anchor → docks: `snapshot {phase, direction, caller, callSid, entityId, entityType, entityName, contactName, number, startedAt, muted, lastLog, audio, canReceive, callWarning, audioUnlocked, notify, missedUnseen, error, refused}`.
- `phase`: `offline | starting | ready | dialing | ringing | incoming | connected | reconnecting | error | moved`. `direction`: `outbound | inbound`. `lastLog.status`: `saved | skipped | error | missed`. `canReceive`: `null` (token has no incoming grant) | `true` (registered) | `false` (inbound on, not registered). `callWarning`: `'' | no-audio | low-mic | packet-loss | high-rtt | high-jitter | low-mos`. `notify`: `default | granted | denied | unsupported`. `missedUnseen`: `{count, last: {name, number, entityId, entityType} | null, at}`. `error`: `{kind: '' | mic | session | signed_out | network | twilio | not_enabled, code, message}`. `refused`: `null | {action, reason, nonce, at}`.
- **Security limit:** BroadcastChannel cannot authenticate a same-origin sender; any page on the account origin can post requests. origin / nonce / rate limits stop accidents and replays only. Server-side allow-listing of dialled numbers is the backstop (future, §13).
- The dock draws every field above (see Pill and Panel). Unknown phases fall back to the offline view.

**Rules & limits.** Nothing of ours may sit on a snap point. **Bump `DOCK_ASSET_VERSION` in `F/lib/ctc_dock.js` (now `'20'`) on every change to `ctc_dock_client.js` or `ctc_dock_dialer.js`**; it is the cache-bust query on both script URLs.

**Mounts.** Record pages via `F/ctc_ue_phone_button.js` (shown only when `custrecord_ctc_active` is true); dashboard via a hidden `<img onerror>` loader (`buildDockLoaderHtml`) because portlets strip `<script>`.

**Key files.** `F/lib/ctc_dock.js`, `F/lib/ctc_dock_client.js`, `F/lib/ctc_dock_dialer.js`. Behaviour tests: `__tests__/lib/ctc_dock_ui.test.js` (jsdom; skipped when jsdom cannot be found — it is not a project dependency).

---

## 3. Softphone (anchor)

**Purpose.** Holds the Twilio Device, call state, bus host and call logging.

**Token.** RESTlet `customscript_ctc_rl_token` (POST, no `action`) builds a Twilio Access Token with N/crypto HMAC-SHA256 (`F/lib/ctc_twilio_jwt.js`): ttl 3600 s, `cty: twilio-fpa;v=1`, identity = NetSuite employee internal id, `outgoing.application_sid` = `custrecord_ctc_twiml_app_sid`, `incoming.allow` = `custrecord_ctc_inbound_enabled`. Signing secret: NetSuite API Secret named by `custrecord_ctc_api_secret_id`.

**Phone user gate** (`isPhoneUser` in `F/ctc_rl_token.js`). A token is issued only when `custrecord_ctc_active` is true AND one of: the session user has an active `customrecord_ctc_rep_assignment` (`custrecord_ctc_ra_employee`, `isinactive` F); the session user is the `supervisor` of an employee with one (search join `custrecord_ctc_ra_employee.supervisor`); the session role is Administrator (3). Else `{ error: 'not_a_phone_user' }` (audit `CTC RESTlet — not a phone user` with the reason). The same gate runs before every phone action: `logCall`, `checkTranscript`, `lookupCaller`, `phoneHeartbeat`, `softphoneSuggested`, `softphoneSearch`, `softphoneContacts`, `softphoneRecents`, `softphoneAccountSnapshot`, `softphoneBookCounts`. Open to every internal user (portlet / Reporting Central): `getWorkspaceHistory`, `getWorkspaceTasks`, `searchEntities`, the proposed-task actions (own checks). Decided once per request, never cached across requests. Fails closed: a config or search error denies. Cost: config search + up to 2 assignment searches (≈ 30 units).

**Renewal.** Device option `tokenRefreshMs` 60 000 → `tokenWillExpire` → fetch token → `device.updateToken()`. Expiry codes 20104, 31204, 31205, 31206 renew and re-register instead of showing Error. Audio setup runs only on the first registration. A renewal never resets a live call.

**Token recovery (session gone).** A token fetch fails on a non-OK status (`HTTP 401`), a non-JSON answer such as the login page (`not JSON (redirected)`), a JSON error (`error: …`), no token, or a network error. The phone never gives up while the page is open (except `not_a_phone_user`, below): retries after 5 s, 15 s, 30 s, then every 60 s (`TOKEN_RETRY_DELAYS_MS`), and at once on page visible, `online` and `focus` while a retry waits. One fetch at a time; register() waits meanwhile. While fetches fail the snapshot has `canReceive: false` (amber "reconnecting" hint) and the error goes to the heartbeat `lastError`. The first token after a failure **rebuilds the device** (`rebuildDevice`: fresh session and identity) when no call is live; during a call the token is applied now and the rebuild runs when the call settles. A failed first fetch at page load shows "Failed to initialize" and keeps retrying; the device starts when a token comes. There is no "Phone session expired" give-up any more.

**Device.** `codecPreferences ['opus', 'pcmu']`, `allowIncomingWhileBusy: false`, `edge ['ashburn', 'umatilla']` (signaling fallback), `maxCallSignalingTimeoutMs 30000` (a call keeps reconnecting its signaling for up to 30 s; needs the edge list), `logLevel` 3 (warn), 1 with `debug=1`. SDK 2.7.3 bundled at `F/lib/twilio.min.js` (CDN blocked by CSP); both option names are in that build. Only a token with the incoming grant registers; an outbound-only phone is Ready at once (`deviceReady`) and never calls `register()`.

**Call resilience.** Call `reconnecting` → phase `reconnecting` (call, timer and mute kept); `reconnected` → `connected`. Call `warning` / `warning-cleared` → `callWarning` (most severe active one; cleared on `reconnected` and at call end). A device `error` during a live or ringing call sets the snapshot `error` and logs a warning but never resets the call view; with no call it shows Error as before.

**Errors (snapshot `error`).** From the Twilio code: 20101 / 20104 / 31204–31206 → `session`; 31208 / 31401 → `mic`; other 31xxx → `network`; else `twilio`. Token fetch failures → `signed_out` when NetSuite answered 401 / 403 or its login page (not JSON), else `session` (offline, server error; code = HTTP status). **Session watch:** every 60 s, and at once when the page comes back online or visible, the softphone POSTs RESTlet action `sessionPing` (no gate, no queries; NetSuite answers 401 SESSION_TIMED_OUT before the script when the session is gone). A 401 / 403 / login page starts the token recovery loop at once (→ `signed_out`); offline or other failures do nothing. Before this a lost session showed only at the hourly token renewal. A network change ends the NetSuite session (soak test 2026-11-02). Register time-out → `network`. Mic permission (`navigator.permissions.query({name:'microphone'})`, watched with `onchange`) `denied`, or `getUserMedia` NotAllowedError → `mic`. Cleared by kind on recovery: token back (session, signed_out), `registered` (network, twilio), call accepted (network, twilio, mic), permission back (mic).

**Not a phone user.** A token answer `{error: 'not_a_phone_user'}` is permanent: no token retries, no registration, phase `error`, error `{kind: 'not_enabled', code: 'not_a_phone_user', message: 'Phone is not enabled for your user'}`, and `ctc-phone-disabled` to the shell (§1). A live call is left to end by itself.

**Missed calls.** An inbound call cancelled before Answer (caller hung up or ring timeout; not Decline) adds to `missedUnseen` (count, last caller, time). Bus `markMissedSeen` resets it. Kept in sessionStorage `ctc-missed-unseen` (shared by the shell tab and its phone frame), so a phone-frame restart keeps it; another tab starts at 0.

**Page Lifecycle.** `freeze` → a `phoneHeartbeat` beacon with state `frozen`; `resume` → re-register, renew the token when it ends within 90 s (or already ended), heartbeat. The after-call `logCall` beacon is sent on `pagehide` (was `beforeunload`).

**Registration watchdog** (only while the token grants incoming, and never after a takeover or `not_a_phone_user`). On `unregistered`: retry after 2 s, 5 s, 15 s, 30 s, then every 60 s, one timer at a time. Try now on page visible, `online`, `focus`, page `resume`. Every 60 s when no retry is pending. Never during a live or ringing call or an in-flight token refresh. Each `register()` races a **20 s** timeout: a time-out frees the slot, sets error `network` and schedules a retry; if that retry finds the device still `registering` (the SDK refuses a second `register()`), the device is rebuilt with a fresh token. Every `register()` goes through this path (with its catch).

**Identity rebuild.** When a renewed token carries a different identity (NetSuite user changed), the device is rebuilt; during a live or ringing call the rebuild waits until the call settles. A changed incoming grant is applied to the existing device (`applyIncomingGrant`), which re-registers it.

**Heartbeat.** RESTlet action `phoneHeartbeat` on every registration change, after a token refresh, on the first token failure, every 5 min, and an `offline` beacon on `pagehide`. Coalesced: at most one per 2 s (`HEARTBEAT_MIN_GAP_MS`); a burst sends once now and once at the end of the gap with the latest state. Body adds `identity` (the token's identity, for comparison only) and `lastError` (e.g. `token: HTTP 401 at 01:02Z`, `register: 31204 at 01:02Z`, ≤ 200 chars). `lastError` is queued and sent with every heartbeat until one succeeds (OK status and a JSON answer without `error`); a newer error replaces it. See §8.

**Key files.** `F/ctc_sl_softphone.js`, `F/ctc_rl_token.js`, `F/lib/ctc_twilio_jwt.js`.

**Open gaps.** A change of identity or grant is caught only at the next token renewal (up to 1 h; the wizard says "within an hour, or at once after a reload"). **The RESTlet `phoneHeartbeat` accepts only `registered | unregistered | registering | offline`; the `frozen` beacon is refused (`invalid_state`) until `PRESENCE_STATES` in `F/ctc_rl_token.js` (and §8) adds it.** Live checks pending: `edge` / `maxCallSignalingTimeoutMs` reconnect (network off/on mid-call), warning names, the audio unlock on a cold tab, the freeze / resume path.

---

## 4. Outbound calling & logging

**Current behaviour.**
- Call from a record (phone icon / Call button, VIEW and EDIT mode) or from the dialer. The anchor runs `device.connect({ params: { To, CallerId } })`; caller ID = `custrecord_ctc_phone_number` from the token response.
- The TwiML App points at a hand-made **TwiML Bin** that does `<Dial record="record-from-answer-dual">`.
- At hang-up the browser posts RESTlet `logCall` (`sendBeacon` on unload) with `startedAt` (epoch ms the call connected). The RESTlet creates a Phone Call (`record.Type.PHONE_CALL`) with `custevent_ctc_call_sid`, duration, entity / contact, status `Logged`, `custevent_ctc_inbound` for inbound, and `custevent_ctc_call_started` (ISO-8601 UTC): Twilio's `start_time` from the ownership check, else `startedAt` when within ±1 day of now, else now − duration. `starttime` / Reserve Time are not set.
- **Ownership check** (`F/lib/ctc_call_ownership.js`, `verifyCallOwnership`): the RESTlet fetches the Twilio call (`F/lib/ctc_twilio_admin.js` `getCall`: `sid`, `from`, `to`, `callStatus`, `duration`, `start_time`, `parent_call_sid`). Outbound: `from` must be `client:<rep id>`; or, when `from` is a phone number (a dialed child leg), its `parent_call_sid` is fetched and the parent's `from` must be `client:<rep id>`. A caller ID alone (assigned number or the config caller ID) is not accepted. Inbound: the leg's `to` must be `client:<rep id>`. Failure → `forbidden` (`NOT_CALL_OWNER`, `CALL_NOT_FOUND`, `TWILIO_LOOKUP_FAILED`).
- Duplicate `callSid` returns the existing record (`duplicate: true`).
- After logging, the browser polls `checkTranscript` every 15 s, up to 12 attempts.
- **`checkTranscript` is idempotent** (after the binding and ownership checks): a stored terminal status (Transcribed, No transcript, Missed, Too short, No answer) or `custevent_ctc_processed` T returns at once with no Twilio work and no write — Transcribed → `{status:'completed', alreadyDone:true}`; claimed (processed T + Processing) → `{status:'pending', reason:'claimed'}`; others → `{status:'terminal', reason:'already_closed'}`. Before the LLM it **claims** the call (§6).

**Rules & limits.**
- Browser: calls with no connect (duration 0) are not logged; calls under **3 s** are skipped ("Call too brief to log"). RESTlet: rejects under **2 s** (`duration_below_threshold`; Twilio does not transcribe recordings under 2 s).
- Phone must match `^\+?[0-9]{7,15}$`.
- **Orphan queue:** a transient `save()` failure (`RCRD_HAS_BEEN_CHANGED`, `SSS_REQUEST_LIMIT_EXCEEDED`, `CONCURRENT_REQUEST_LIMIT_EXCEEDED`, `UNEXPECTED_ERROR`; `SSS_RECORD_TYPE_REQ_FIELD_MISSING` is not transient → `NON_TRANSIENT_SAVE`) writes `customrecord_ctc_orphan_call`. Poller Phase B retries up to 50 rows with `custrecord_ctc_orphan_retrycount` < 3, re-checking ownership first.

**Key files.** `F/ctc_ue_phone_button.js`, `F/ctc_sl_softphone.js`, `F/ctc_rl_token.js`, `F/lib/ctc_call_ownership.js`.

**Open gaps.** README / ARCHITECTURE show the Bin with `callerId="{{From}}"`; the browser sends `CallerId`, so the Bin text in the docs may be stale. No outbound recording notice (§12, §13).

---

## 5. Inbound calling

**Purpose.** A customer calls a rep's Twilio number; the rep's pill rings; the call is answered in the browser and logged.

**Routing flow.** `F/lib/ctc_inbound_routing.js` builds **one Studio flow for all numbers**, friendly name `CTC Inbound Routing`, from rep assignments:
- `routesFromAssignments`: one route per phone SID — the **primary rep** (`custrecord_ctc_ra_is_primary`), else the first assigned employee. Inactive assignment rows, rows without an employee and numbers without digits are skipped. A second SID with the same E.164 number is skipped. At most 50 routes.
- Shape: `Trigger ─incomingCall─▶ [recording_notice] ─▶ split_dialed ─To == route n─▶ ring_n` (connect-call-to `client:<employeeId>`, `caller_id {{contact.channel.address}}`, `timeout` = ring seconds, `record` = record flag) `─callCompleted─▶ answered_n` (`DialCallStatus == completed` → end, else → `no_answer`). `split_dialed` noMatch → `no_answer` (say-play message). The `answered_n` split is required: callCompleted fires for answered calls too.
- **Voicemail** (`custrecord_ctc_voicemail_on`, default on): `no_answer ─audioComplete─▶ voicemail` (Studio `record-voicemail`: `timeout` 5 s silence, `max_length` = `custrecord_ctc_voicemail_max_seconds` (default 120, clamped 30–300), `finish_on_key '#'`, `play_beep 'true'`, `trim 'trim-silence'`, `transcribe false`) `─recordingComplete / noAudio─▶ voicemail_goodbye` (say-play "Thank you for your message. Goodbye.") → end; `hangup` → end (Twilio keeps the recording). Unanswered rings, unrouted numbers (`split_dialed` noMatch) and a flow with no routes all reach it through `no_answer`. Voicemail off → `no_answer` then hang-up (as before). Legacy `<Record>` transcription stays off: Conversational Intelligence transcribes the voicemail (§6).
- **Publish** (`publishRouting`): skipped when inbound is off; create/update the flow (`upsertStudioFlow`), store `custrecord_ctc_studio_flow_sid` and `custrecord_ctc_routing_published_at`, then point each routed number's VoiceUrl at the flow (`setNumberVoiceUrl`), keeping 100 units in reserve per number. Triggered by wizard "Save & publish" / "Publish again" (`wizardSaveInbound`, `wizardPublishRouting`) and automatically after `wizardSaveAssignments` when inbound is on.

**Ring & answer.** The dock shows the incoming card at the pill (§2) and, when the tab is away, the shell adds a system notification and a flashing title (§1). Ring time `custrecord_ctc_ring_seconds`: default 20, clamped 10–60. No-answer message `custrecord_ctc_noanswer_message`. Blank, or text equal to a built-in default, gives the default for the voicemail setting: voicemail on → "Sorry, no one is available. Please leave a message after the tone."; off → "Sorry, no one is available to take your call. Please try again later. Goodbye." The wizard stores a built-in default as blank, so the text follows the switch. The anchor holds one pending call; a second call while busy is rejected. Caller cancel / ring timeout → `missed` note and `missedUnseen` + 1 (§3); Decline → `skipped` note.

**Caller match.** RESTlet `lookupCaller` → `lookupCallerByPhone`: last 10 digits (non-digits stripped both sides, SuiteQL `REGEXP_REPLACE`), customer / prospect / lead / contact; a match in the rep's book wins; a contact with a company returns the company as entity. The name fills in by a second snapshot. After Answer the page stays where it is; the panel shows the match with Open record.

**Logging.** Answered inbound ≥ 3 s → `logCall` with `direction: 'inbound'` → `custevent_ctc_inbound` T. Missed inbound calls and voicemails are logged only by reconciliation (§7).

**Fallback owner** `custrecord_ctc_fallback_owner` (employee, wizard "Unrouted calls and voicemails go to"): owns reconciled calls and voicemails for numbers with no route, and for calls whose rep is inactive or unknown. Not set → those calls are not logged.

**Recording.** `custrecord_ctc_record_inbound` → `record: true` on every ring widget. `custrecord_ctc_recording_notice_on` (applies only with recording on) adds one say-play before the split; text `custrecord_ctc_recording_notice` (blank → "This call may be recorded for quality and training.").

**Test setup.** +1 (855) 557-5596 → Burt Brocus, employee 120 (client identity `120`). Live result 2026-10-30: answered, matched 7 Abbott Inc., Phone Call 6438.

**Key files.** `F/lib/ctc_inbound_routing.js`, `F/lib/ctc_twilio_admin.js`, `F/ctc_sl_wizard_api.js`, `W/components/page/InboundPage.tsx`, `F/lib/ctc_workspace_queries.js`.

**Open gaps.** Inactive primary employee not filtered in the flow (the call rings the inactive client, then goes to no-answer / voicemail; reconciliation gives it to the fallback owner). Turning inbound off leaves numbers on the flow (callers hear the no-answer message, then voicemail when on). Publish overwrites manual Studio edits. No hunt group, anonymous callers not matched. Not live-tested: the `record-voicemail` widget as published, the voicemail recording's `call_sid` / `source`, Intelligence auto-transcription of a voicemail recording.

---

## 6. Recording, transcription & AI analysis

**Recording.** Outbound: TwiML Bin `record-from-answer-dual`. Inbound: Studio `record: true`; Twilio attaches the recording to the **parent** call (caller leg). The poller and RESTlet find it through the child leg's `parent_call_sid`.

**Transcription.** Twilio Conversational Intelligence service `custrecord_ctc_intel_service_sid` transcribes the recording. No code creates transcripts: the service must have auto-transcribe on (README setup step), which covers every recording in the account, voicemails included. The poller reads `intelligence.twilio.com/v2/Transcripts?SourceSid=<recording>` and `/Sentences`. Speaker labels: dual-channel channel 1 = parent leg; outbound rep = channel 1, inbound rep = channel 2.

**Poller** `customscript_ctc_ss_poll` (`F/ctc_ss_poll_transcripts.js`), two deployments picked by the script parameter `custscript_ctc_poll_mode` (TEXT, not mandatory):
- `customdeploy_ctc_ss_poll`, mode `transcripts` (also when empty): daily, every 1 day, from 00:00Z, repeat PT15M. Phases A cleanup-pending recording deletes (≤ 50); B orphan retry (≤ 50); C0 stale analysis claims (≤ 20, below); C unprocessed Phone Calls (≤ 50). Yields with `task.create` (this deployment) when fewer than 1000 units remain. Audit `CTC Poll Complete`: `main(…) cleanup(…) orphan(…) stale(released, gaveUp)`.
- `customdeploy_ctc_ss_poll_recon`, mode `reconcile`: daily, from 00:00Z (SDF allows only 30-minute start increments), repeat PT15M. Phase D reconciliation only (§7), with the whole run's budget. Audit `CTC Poll Complete`: `recon(seen, existing, created(missed, tooShort, noAnswer, logged, voicemail), deferred, skipped, errors, complete[, stopped])`.
- Any other mode: error `CTC Poll — unknown mode`, nothing done.

**Claim before the LLM** (`F/lib/ctc_call_claim.js`). The browser (`checkTranscript`) and Phase C both claim a call before the LLM: a fresh read (`lookupFields`), then, only when not terminal and not processed, write `Processing` + `custevent_ctc_processed` T + `custevent_ctc_analysis_claim` = `<ISO-8601 UTC claim time>|<claim count>` (the count goes on from the stored stamp). processed T takes the call out of Phase C's search; the enrichment save then writes Transcribed. Already finished or claimed → no LLM (Phase C counts `alreadyDone`; the RESTlet answers as above). A failed claim write is transient (retry). An error after the claim releases it: `Failed` + processed F (Phase C retries). NetSuite has no compare-and-swap: the race window is the gap between the fresh read and the write. The enrichment save (both paths) empties the stamp.

**Stale claims** (Phase C0, before C). A script killed between claim and save leaves processed T + Processing. The poller searches calls with the stamp set, processed T and no `custevent_ctc_ai_summary` (≤ 20). Status Processing and stamp older than **30 min** (or unreadable) → back to `Logged` + processed F, stamp kept, and Phase C retries it in the same run. When the stamp count is over **3** (3 retries used) → `Failed` + processed T and the stamp emptied: never retried again (the Twilio recording is not deleted). Own try/catch; a failed release is logged and skipped. The time is the stamp's UTC time, not `lastmodified` (search dates come back in the user's format and time zone).

**Statuses** (`custevent_ctc_call_status`, `CALL_STATUS` in `F/lib/ctc_transcript_utils.js`): `Logged`, `Processing`, `Transcribed`, `No transcript`, `Failed`, `Missed`, `Too short`, `No answer`. Terminal: Transcribed, No transcript, Missed, Too short, No answer. A terminal status also sets `custevent_ctc_processed` T. `Processing` is written once while waiting (processed F); `Processing` with processed T is an analysis claim.

**Wait rules.** No recording: read the Twilio Call; 1 h after the call ended (or at once if Twilio has no such call) → `No transcript`. Recording but no finished transcript: 24 h after the recording last changed → `No transcript`. Recording status `absent` or `deleted` is terminal. Times use Twilio UTC timestamps. Network errors, timeouts, 5xx, 401, 403 and 429 are transient: retry next cycle, never close a call.

**AI analysis** (`F/lib/ctc_llm_analysis.js`). N/llm `modelFamily: 'cohere.command-a-03-2025'`, temperature 0.2, maxTokens 800. Writes `custevent_ctc_ai_summary`, `custevent_ctc_ai_brief`, `custevent_ctc_satisfaction`, `custevent_ctc_tone_keywords`, `custevent_ctc_action_items`, `custevent_ctc_transcript`, and proposed tasks (`customrecord_ctc_proposed_task`). Skipped for the cycle when free usage < 10. JSON fences are stripped before parsing.
- **Date reference line.** `analyzeTranscript(text, opts, context)`; `context` = `{ today, callDate, timezone, phoneCallId }` from `ctcTime.analysisDates(custevent_ctc_call_started)` (`F/lib/ctc_time.js`: user time zone via `userTimezone` + `localParts`, date part back through `format.parse`; call date = today when the start is blank; server clock when N/format gives no date). Both callers pass it: RESTlet `checkTranscript` (from the loaded Phone Call) and poller Phase C (the search reads `custevent_ctc_call_started`). The prompt starts with "Today is <Weekday, YYYY-MM-DD> (<time zone>). The call took place on <Weekday, YYYY-MM-DD>." (time zone part left out when unknown; no context → server-clock today).
- **Action items** are objects `{"task": string, "due_date": "YYYY-MM-DD" | null}`. The prompt says: resolve relative timing ("next Tuesday", "end of week", "in two weeks") against the call date; `null` when the call gives no timing. Plain strings are still accepted (`normalizeActionItems`, `F/lib/ctc_transcript_utils.js`); other shapes and empty tasks are dropped. `custevent_ctc_action_items` stores the task texts, one per line.
- **Proposed task due date** (`createProposedTasksFromAnalysis(phoneCallId, analysis, callDate)`): the AI `due_date` when it is a real `YYYY-MM-DD` date from the call date through call date + 90 days; anything else → call date + 3 business days (Saturday / Sunday skipped).
- **Fallback title** (no AI title and no summary): "Voicemail from <who>" / "Inbound call from <who>" / "Call to <who>"; <who> = company, else contact, else the phone number, else "unknown". Never the recording SID. ("Voicemail: " prefix only on AI titles.)
- **Failures are logged with `log.error`** and the Phone Call id (`phoneCall=<id> reason=…`): quota below the reserve ("CTC LLM quota below reserve", and "CTC LLM analysis skipped" in both callers), the N/llm error name + message ("CTC LLM call failed"), JSON parse failure or a non-object JSON ("CTC LLM JSON Parse Failed", with the first 500 chars).

**Voicemail transcripts.** One transcript path, no new status. Reconciliation logs a voicemail as `Logged` (processed F) with checkbox `custevent_ctc_voicemail` T (the lasting marker) and `custevent_ctc_inbound` T. Phase C transcribes it like any call: the voicemail recording sits on the caller's (parent) call; Phase C finds it directly when the Phone Call stores the parent SID, or through `fetchParentCallRecording` when it stores the client child SID. It ends at `Transcribed` / `No transcript`. A mono voicemail is channel 1 = `[CUSTOMER]`. The enrichment title keeps the marker: "Voicemail: <AI title>".

**Recording cleanup.** After transcript extraction the Twilio recording is deleted (voicemails too, same rules). A transient delete failure sets `custevent_ctc_recording_cleanup_pending` T for Phase A; 404 counts as deleted.

**Open gaps (live checks pending).** Studio `record: true` channel count (mono vs dual → speaker labels for inbound unverified); auto-transcription of inbound recordings; delete of the parent-call recording.

---

## 7. Call reconciliation (poller Phase D)

**Purpose.** Only the browser logs calls. Calls < 3 s, missed inbound calls and calls cut off by a crash or reload leave no Phone Call. Twilio is the source of truth.

**Current behaviour** (`F/lib/ctc_call_reconcile.js`, built, not yet committed).
- Lists Twilio Calls (page size 100) that ended since the watermark. Keeps only browser legs: inbound = `to` `client:<id>`; outbound = `from` `client:<id>`. Terminal statuses only: completed, busy, no-answer, canceled, failed.
- A call is created only when its end time is **5 min** old.
- **Dedupe:** already logged when a Phone Call has its own SID, or (inbound) its parent SID, or (outbound) one of its child SIDs (child page size 20). Batch SuiteQL check per page (chunks of 200), a second check right before create, one handling per SID per run.
- **Status mapping:** not answered (status ≠ completed or 0 s) → inbound `Missed` ("Missed call from <name or number>"), outbound `No answer` (from the dialed child leg); completed < 3 s → `Too short`; completed ≥ 3 s → `Logged` (the transcript pass takes it). Processed T except for `Logged`. Rep = client id, only if an active employee. Entity via `lookupCallerByPhone` (whenever a number is found). Inbound sets `custevent_ctc_inbound`.
- **Outbound dialed number:** child legs from `Calls.json?ParentCallSid=` plus any child leg listed on the same page; the picked child first, then the other children (`to`, else `to_formatted`: 10 digits → `+1`, a leading `+` kept, `client:` / `sip:` ignored); then the parent leg's own `to` / `to_formatted`, unless it equals the config caller ID or a child's `from`. No number → log audit `CTC Recon outbound number not found` (parent `to`, `to_formatted`, child count).
- **Title:** outbound `No answer` → "No answer: <name or number>", or **"Call did not connect"** when no number is known. Others: "Missed call from …", "Inbound call from …", "Call to …" (fallback "unknown").
- **Date and call start:** `custevent_ctc_call_started` = Twilio `start_time` (RFC 2822 UTC) as ISO-8601 UTC. `startdate` = the local date of that start in the script user's time zone (`F/lib/ctc_time.js`: N/config `USER_PREFERENCES` `TIMEZONE`, else `COMPANY_INFORMATION` `timezone`, read once per execution; `format.format({ type: DATETIME, timezone })`, date part → `format.parse` DATE). **`starttime`, `endtime` and `timedevent` (Reserve Time) are never set**: reconciled Missed / No answer calls must not appear on the rep's calendar. A date failure logs `CTC Recon start date not set`; the UTC start is still stored and the call created.
- **Voicemail on an unanswered client leg:** for an inbound `Missed` leg with a parent, the parent call is read (from the page, else `Calls/<sid>.json`). Parent still live, or ended < 5 min ago → wait (stat `deferred`, the watermark holds at the leg's end). Else the parent's `Recordings.json` is listed; a voicemail = `call_sid` = parent, `source` ≠ `DialVerb`, status not `absent` / `deleted` / `failed`, not a completed 0 s recording. Voicemail → `Logged` + `custevent_ctc_voicemail` T, title "Voicemail from <name or number>", duration = recording length (stat `created.voicemail`). No voicemail → `Missed`.
- **PSTN parent legs without a client child** (caller hung up during the notice; unrouted number): Twilio `direction` `inbound`, no parent, `from` not a client, `to` a number whose VoiceUrl is our flow (`IncomingPhoneNumbers.json`, first 100, `voice_url` contains `/Flows/<custrecord_ctc_studio_flow_sid>`; read once per run, only when such a leg appears; no flow SID → no parent pass). A client child on the page or from `Calls.json?ParentCallSid=` → left to the child leg. Else `Missed`, or a voicemail when the parent has a voicemail recording. Stores the parent SID; deduped on the parent SID and every child SID. Owner: the number's primary rep (`loadRoutes`), else the fallback owner. Flow numbers / routes not readable → those legs wait (error, watermark held).
- **Owner and fallback:** client legs: the client id when it is an active employee; an inactive or unknown numeric id → the fallback owner (`custrecord_ctc_fallback_owner`) when it is an active employee; else skipped (as before). A non-numeric identity is skipped.
- **Watermark** `custrecord_ctc_recon_watermark` (ISO UTC). Moves only after a complete run, to now − 5 min, never past a call whose create failed or that waits. Next run starts 15 min before it, never more than 7 days back. **First run: 7-day backfill.**

**Governance.** Runs in its own deployment `customdeploy_ctc_ss_poll_recon` (§6), so Phases A–C no longer use up its budget (before, Phase C could stop at 1000 units left, under the 2000 Phase D needs to start). Starts only with ≥ 2000 units left; stops before the next page or call below 1000; at most 5000 units and 200 pages per run. About 70 units per created call, plus 10–20 once per run for the time zone. A missed inbound leg adds a recordings GET (10) and maybe the parent call GET (10); a PSTN parent leg adds the child GET and the recordings GET (20); the flow numbers + routes cost 20 once per run.

**Open gaps.** Not live-tested. New statuses are not yet shown in the UI (§13). Live check pending: the parent-leg `to` of a TwiML App client call; `startdate` and the list time match the rep's time zone; voicemail cases (rang-and-not-answered, unrouted, hung up during the notice). The poll audit `recon(…)` does not print `created.voicemail` or `deferred` yet (`F/ctc_ss_poll_transcripts.js`).

---

## 8. Rep presence / heartbeat

**Purpose.** Show a stale or unregistered phone before a caller hits it.

**Current behaviour** (built, not yet committed).
- Record `customrecord_ctc_rep_presence`, one row per employee: `custrecord_ctc_rp_employee`, `custrecord_ctc_rp_last_seen` (ISO), `custrecord_ctc_rp_can_receive`, `custrecord_ctc_rp_state` (`registered | unregistered | registering | offline`), `custrecord_ctc_rp_incoming_granted`, `custrecord_ctc_rp_client` (browser label, ≤ 80 chars), `custrecord_ctc_rp_last_change` (last change of can-receive), `custrecord_ctc_rp_last_error` (CLOBTEXT, ≤ 200 chars, last phone error; kept until the next one), `custrecord_ctc_rp_identity_match` (checkbox: the token identity in the body equals the session user).
- RESTlet `phoneHeartbeat` (phone users only, §3 gate; else `not_a_phone_user`, no row): employee = session user, never a body value; body `identity` is only compared (`identity_match`). `canReceive` is true only when registered and incoming is granted. An unchanged heartbeat within 60 s is not written (a new `lastError` or a changed identity match counts as a change). **Upsert:** reads the newest row plus up to 5 more (internalid DESC), updates the newest and deletes the extra rows (at most 5 per call; a failed delete is logged); returns `removed: n`. The client sends at most one heartbeat per 2 s (§3).
- Wizard `wizardLoadPresence`: `stale` when no heartbeat in **12 min** (or never). Status rule (`W/components/shared/phoneStatus.ts`): stale or `offline` → Offline (grey); not registered or not can-receive → Not receiving calls (amber); else Receiving calls (green).
- Shown on the wizard Overview "Phones" table (Rep · Status · Last seen) and the Inbound page routing table "Phone" column.

**Open gaps.** Soak test (idle 60 min, sleep, network off/on, background tab) not run. No alerting.

---

## 9. Sales Rep Central portlet & Reporting Central

**Portlet** `customscript_ctc_pl_dashboard` (`F/ctc_pl_dashboard.js`, self-contained). Period control Today / Yesterday / This week / Last week; flat KPI strip; tabs **Calls | Missed | Follow-ups**; up to 5 calls and 5 follow-ups (total from `runPaged().count`, kept in `data-fu-total`); inline approve / reject; "Approve all N" approves only the rows on screen; a "Reporting Central" link carrying `range=`. Mounts the dock loader. Portlet HTML uses inline `on*` handlers only.
- **Missed call** = status `Missed` (STATUS_RULES `dir: 'missed'`) OR a voicemail (`custevent_ctc_voicemail` T). One helper, `isMissedCall` (client mirror `MISSED_CALL_JS`); the Missed search (`missedOnly`) uses the same rule.
- **Direction icon** before the time in each call row (icon dot + time, no word): a 20 px circle with a centred 12 px arrow — down-left for inbound / missed, up-right for outbound — In #1B6097 on #E8F3FC, Out #5C5955 on #F1EFEA, Missed #9A3A2C on #FCE9E7 (a missed call or an inbound call with no talk time); 8 px gap, then the time (13 px, tabular figures). `role="img"` + aria-label + title "Inbound call" / "Outbound call" / "Missed call"; missed rows keep "Missed call" / "Voicemail" in the brief column, so the meaning is not colour alone. Classes `ctc-pl-status-dir ctc-pl-status-dir-<in|out|missed>`. Time column 80 px (Calls and Missed tabs); the "Time" header has the row's 12 px left padding, so it lines up with the icon. Narrow layout: the icon spans both lines, names line up.
- **Voicemail rows** (Calls and Missed): the brief cell reads "Voicemail", with the AI brief below when present (whatever the status).
- **Missed count**: the Calls KPI "<n> missed" and the Missed badge show the same number: the Missed search's full count (`missedCountOf`); if that search fails, the missed calls among the loaded rows.
- **Phone numbers** shown in the Missed tab use `formatPhone` (`F/lib/ctc_html.js`, shared with Reporting Central; NANP → "+1 (303) 555-0111", others as given). The period refresh uses the same rules (`FORMAT_PHONE_JS`). The dialer still gets the raw number.
- **Missed tab**: the period's Phone Calls with status `Missed` OR `custevent_ctc_voicemail` T (`loadHistoryRows({ missedOnly: true, countTotal: true })`), newest first, up to 5; coral count badge (`ctc-pl-badge-missed`, full count, hidden at 0 by root class `ctc-pl-no-missed`). Row: icon + time, customer (link) or the number, "Missed call" or "Voicemail" (+ the AI brief when present), "Call back" (same shell-dialer call as the row redial). Empty: "No missed calls in this period." Missed rows still also appear in Calls. The period refresh sends `includeMissed: true, missedLimit: 5`; `getWorkspaceHistory` then adds `missed: { rows, total }` (or `{ error }`) from a second search.
- **Follow-ups**: the 5 newest pending (`loadTaskGroups` sorts `created` DESC, then internal id DESC; groups keep the order of their newest task; each task carries `rank`; the portlet flattens and sorts by `rank`). Footer: "Showing <shown> of <N> · newest first" (hidden by root class `ctc-pl-fu-all` when N ≤ shown, kept in step on approve) + "See all in Reporting Central ↗" (`tab=followups&range=<period>`, updated by the period buttons; no link when Reporting Central is not deployed). The follow-up bar's Review still opens the Follow-ups tab.

**Reporting Central** `customscript_ctc_sl_reporting` (`F/ctc_sl_reporting.js`). Params `range` (`today | yesterday | thisweek | lastweek | custom`, with `from` / `to`), `tab` (`calls | followups | missed`), `dir`, `q`; tabs Calls / Follow-ups / Missed; direction filter All / Outbound / Inbound / Missed; search; CSV export (`csv=1`, cells defused against formula injection). No detail panel. Call rows show the same direction icon as the portlet (`rc-dir rc-dir-<kind>`, 20 px circle, 12 px arrow, aria-label + title, tokens `--in-*`, `--out-*`, `--missed-*`; When column 100 px, header and cells share the 18 px left padding); Missed = status `Missed`, a voicemail, or inbound with no talk time. Multi-day ranges show a short date under the time, in the time's text column (not under the icon): "Oct 30", with the year when it is not the current year ("Oct 30, 2025", one line, `white-space: nowrap`; about 68 px, the column leaves 72 px); parsed with `N/format.parse` from the user's date format (an unparsable date shows as given). The CSV keeps the full date. **"After the call" for unanswered calls uses the portlet's words** (shared `CALL_STATUS_RULES` + `unansweredRule` in `F/lib/ctc_html.js`, also the portlet's `STATUS_RULES`): status `Missed` or inbound with no talk time → coral chip "Missed call" (`rc-status rc-status-missed`); status `No answer` or outbound with no talk time → quiet chip "No answer" (`rc-status-quiet`); voicemail → "Voicemail" + AI brief. These come before the follow-up count. "Not connected" is gone (page and CSV). Voicemail rows read "Voicemail" (+ the AI brief below) in "After the call" (the CSV keeps `afterCall`). The CSV "Direction" column keeps `directionKey` (Missed = not connected).

**Shared.** Rep's book = primary sales rep OR Sales Team member (SuiteQL `customerSalesTeam.customer`). Resolved once per page and passed as `bookCustomerIds` (Reporting Central: history, follow-ups, previous-period count; portlet: calls, missed, follow-ups). Follow-ups (`loadTaskGroups`) filter proposed tasks by `custrecord_ctc_pt_phone_call.company anyof <book>` (one join; before 2026-11-02 a capped list of the book's first 1000 call ids, which lost follow-ups). Reporting Central shows a notice when a range returns the 1000-call limit (`rc-truncated`): the numbers then count only the newest 1000. Font: Figtree woff2 from the File Cabinet (`F/lib/ctc_fonts.js`, `F/lib/fonts/`), no font CDN. Call rows (`loadHistoryRows`, used by the portlet, its period refresh and Reporting Central) carry `timeOfDay` ('HH:MM') from the effective call time: `custevent_ctc_call_started` in the user's time zone (`ctc_time.localTimeOfIso`), else `starttime`, else `createddate`. The search sorts by `startdate` DESC, `createddate` DESC; inside each day the rows are then re-ordered newest first by `timeOfDay` (blank last). Older Phone Calls without the field keep the old times.

**Portlet call statuses** (one `STATUS_RULES` table = `ctcHtml.CALL_STATUS_RULES` in `F/lib/ctc_html.js`, shared with Reporting Central; used by the server render and the period-refresh JS). With no AI brief: Logged / Processing → "Processing…"; No transcript → "No transcript"; Too short → "Too short to summarize"; Failed → "Summary failed"; Missed → coral chip "Missed call" (`ctc-pl-status-missed`) + "Missed call" direction icon + Length "—"; No answer → grey chip "No answer" (`ctc-pl-status-quiet`), Length "—" when 0 s. Calls KPI sub-line "<n> missed" (coral; same count as the Missed badge: status Missed + voicemail); average talk time excludes 0 s rows. Status chips and direction icons use `ctc-pl-status*`, never `ctc-pl-chip` (that class belongs to the period buttons).

**Rules.** One missed rule in Reporting Central (`wq.isMissedCall`, 2026-11-01): status `Missed`, a voicemail (`custevent_ctc_voicemail` T), or an inbound call with no talk time (calls logged before reconciliation). It drives the direction icon, the Missed tab, the Missed filter and the CSV "Direction". The direction filters split the rows with no overlap: Missed = `isMissedCall`; Outbound / Inbound = the other calls in that direction (an unanswered outbound call is Outbound, with the "No answer" chip). Connected KPI and talk time: a voicemail is not connected (`isUnconnected` = no talk time or a voicemail), so its recording length is not talk time. The portlet Missed tab reads status `Missed` / voicemail.

**Open gaps.** Portlet `<style>` / `@container` survival in the live portlet copy not verified; the Missed tab, chips and footer are not live-tested.

---

## 10. Setup Wizard admin console

UIF SPA `custspa_ctc_setup_wizard` (source `W/`, bundle `F/setup_wizard/`), server endpoints in `customscript_ctc_sl_wizard_api` (`F/ctc_sl_wizard_api.js`). Config is edited only here (the config record blocks UI edits). The API checks Administrator (role 3, else `forbidden`), then **POST only** (any other method → `{ok:false, error:'method_not_allowed'}`, audit logged). The SPA sends only `core.Ajax.post` (`W/services/wizardApi.ts`).

**Onboarding steps.** 1 Prerequisites · 2 Connect Twilio (Account SID, API Key SID, API Secret id) · 3 Voice (TwiML App, caller ID, Intelligence service) · 4 Phone numbers + rep assignments · 5 Test & activate (`wizardActivate` sets `custrecord_ctc_active`).

**Console pages.**
- **Overview** — 4 KPI cards, quick actions (Deactivate asks twice: Cancel / Confirm deactivate), then the health checks: preflight checks, drift rows, "Phones" presence table (`wizardSnapshot`, `wizardRunPreflight`, `wizardLoadPresence`). No separate Health page (removed 2026-11-01 with the recent-calls table and rep chart).
- **Credentials** — Twilio credential fields (`wizardSavePublicIds`).
- **Phones & reps** — numbers and assigned reps, primary flag (`wizardLoadAssignments`, `wizardSaveAssignments` → auto-republish when inbound is on).
- **Voice** — TwiML App, default caller ID, Conversational Intelligence (`wizardSaveVoice`, live Twilio lists).
- **Inbound calls** — on/off, ring seconds, no-answer message, Voicemail switch + "Longest voicemail" (30 s, 1, 2, 3, 5 min), "Unrouted calls and voicemails go to" (active employees with access, plus the current owner; "Not set"), record inbound, notice on/off + text, publish status, routing table with Phone column (`wizardLoadInbound` adds `voicemailOn`, `voicemailMaxSeconds`, `fallbackOwnerId`, `employees`; `wizardSaveInbound` validates `voicemailOn` boolean, `voicemailMaxSeconds` integer 30–300, `fallbackOwnerId` '' / an active employee id; `wizardPublishRouting`).

**Build.** `npm run typecheck`, `npm run lint`, `npm test`, `npm run bundle`; bundle is committed; CI checks bundle drift.

**Open gaps.** Voice page and Step 3 say "The wizard registers this app's VoiceUrl" — no code does. Overview "TwiML VoiceUrl" drift row gets no data and always shows Pass.

---

## 11. Phone Call record

**Today.** `customscript_ctc_ue_transcript_viewer` (VIEW and EDIT) injects a "Call Intelligence" panel above Primary Information: status pill, AI summary block, 4-column metrics (satisfaction, duration, tone keywords, recording), transcript, action items. Redundant CTC fields are hidden in VIEW mode.
- **Pills:** Logged / Processing / Transcribed / No transcript / Failed, plus (reconciliation) `Missed` → coral "Missed call" (`#FCE9E7` / `#9A3A2C`, the portlet chip colours), `No answer` → grey "No answer", `Too short` → grey "Too short to summarize". A voicemail (`custevent_ctc_voicemail` T) adds a sky "Voicemail" pill (`#E8F3FC` / `#1B6097`) before the status pill.
- **Voicemails are never scored** (2026-11-01): the AI writer leaves `custevent_ctc_satisfaction` empty on a voicemail (`writePhoneCallEnrichmentFields`); `loadHistoryRows` and `loadTaskGroups` read no score for a voicemail even when an older one is stored, so the Sat column shows "—" and the portlet / Reporting Central averages skip it; the record panel shows "Not scored".
- **Unanswered calls** (status Missed / No answer / Too short, not a voicemail, no summary and no transcript): the panel shows the pills and one line instead of the summary, metrics and transcript: "The caller did not reach anyone and left no voicemail." / "The person you called did not pick up." / "The call lasted under 3 seconds, so there is nothing to summarize."

**Phone Call fields** (`custevent_ctc_*`): `call_sid`, `call_started` (CLOBTEXT, ISO-8601 UTC, "Call started (UTC)", inline), `call_status`, `duration`, `inbound`, `processed`, `recording_sid`, `recording_url`, `recording_cleanup_pending`, `voicemail` (checkbox, voicemail marker), `analysis_claim` (CLOBTEXT, hidden, `<ISO>|<count>`, §6), `transcript`, `ai_summary`, `ai_brief`, `satisfaction`, `tone_keywords`, `action_items`.

**Planned redesign (not built):** design canvas "Phone Call Record — Enhanced", https://claude.ai/artifact/TDtqWmXLx2rehn8YMVk7zt.

**Open gaps.** The full redesign (canvas above) is not built; its questions are open.

---

## Reference: custom records & config fields

- `customrecord_ctc_config` (singleton, access NONENEEDED): `custrecord_ctc_account_sid`, `_api_key_sid`, `_api_secret_id`, `_twiml_app_sid`, `_phone_number` (caller ID), `_intel_service_sid`, `_active`, `_inbound_enabled`, `_ring_seconds`, `_noanswer_message`, `_studio_flow_sid`, `_routing_published_at`, `_record_inbound`, `_recording_notice_on`, `_recording_notice`, `_recon_watermark`, `_voicemail_on` (checkbox, default T), `_voicemail_max_seconds` (integer), `_fallback_owner` (employee) (all `custrecord_ctc_` prefix).
- `customrecord_ctc_rep_assignment`: `custrecord_ctc_ra_employee`, `_phone_sid`, `_phone_number`, `_label`, `_is_primary`.
- `customrecord_ctc_orphan_call`: `custrecord_ctc_orphan_callsid`, `_recordingsid`, `_entityid`, `_entitytype`, `_userid`, `_phone`, `_direction`, `_retrycount`, `_contactid`, `_duration`.
- `customrecord_ctc_proposed_task` (+ list `customlist_ctc_pt_status`; `allowuiaccess` F, access NONENEEDED; reviewed only in the portlet / Reporting Central): `custrecord_ctc_pt_phone_call`, `_text`, `_status`, `_proposed_due`, `_proposed_assignee`, `_reviewer`, `_reviewed_date`, `_created_task`, `_task_completed`, `_task_completed_date`.
- `customrecord_ctc_rep_presence`: see §8.
- Scripts: `customscript_ctc_ue_phone_button`, `_ue_transcript_viewer`, `_sl_softphone`, `_sl_shell`, `_sl_reporting`, `_sl_wizard_api`, `_rl_token`, `_ss_poll` (deployments `customdeploy_ctc_ss_poll` transcripts, `customdeploy_ctc_ss_poll_recon` reconcile; parameter `custscript_ctc_poll_mode`), `_pl_dashboard`; SPA `custspa_ctc_setup_wizard`.

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
- 2026-11-01 — (Superseded the same day: no automatic screen-pop on Answer; the rep may be mid-task.) An inbound toast (shell, top level) plus system notification and title flash when the tab is away.
- 2026-11-01 — The phone stays controllable from any tab over the bus (gated: origin, nonce, dial rate and number checks). A waiting shell takes over by itself when the phone tab goes away, and "Use phone here" moves the phone when no call is live.
- 2026-11-01 — Tokens and phone actions only for phone users: CTC active AND (active rep assignment, supervisor of an assigned rep, or Administrator).
- 2026-11-01 — Reconciliation gets its own scheduled deployment (`customdeploy_ctc_ss_poll_recon`, from 00:00Z).
- 2026-11-01 — Outbound ownership needs `client:<rep id>` on the leg or its parent; a caller ID alone is not proof.
- 2026-11-01 — One analysis per call: claim (Processing + processed T) before the LLM.
- 2026-11-01 — Unanswered and unrouted inbound callers go to a voicemail that is transcribed. Voicemail = `Logged` + `custevent_ctc_voicemail` checkbox (one transcript path, no new status). Fallback owner for unrouted numbers and inactive reps.
- 2026-11-01 — The inbound alert moves from the shell's centred toast into the dock: a card that rises out of the pill (variant B; replaced the same day by the pill-to-card morph, sample A1), in the shell and remote tabs. The shell keeps only the away alerts (system notification, title flash). The pill says "Ringing"; Answer / Decline live on the card or the open panel.

---

## 13. Open gaps & next work

1. **Outbound recording notice spike** — callee hears the notice and the call bridges; notice inside / outside the recording; token params priority; `answerOnBridge`. Legal wording for all-party-consent states needs counsel.
2. **New status chips UI** — `Missed` / `Too short` / `No answer` in the portlet, Reporting Central (Missed tab from status) and the Phone Call panel.
3. **Phone Call record redesign** — build from the approved canvas (§11).
4. **Wizard VoiceUrl claim** — Voice page / Step 3 say the wizard registers the TwiML App VoiceUrl; no code does. Overview "TwiML VoiceUrl" drift row always passes.
5. **Identity / grant change** caught only at token renewal (up to 1 h).
6. **Inactive primary rep** still routed in the flow (the call goes to no-answer / voicemail; reconciliation gives it to the fallback owner).
7. **Inbound off** leaves numbers pointed at the flow.
8. **Flow publish overwrites** manual Studio edits.
9. **No hunt group.** Voicemail and a fallback owner are built (§5, §7), not live-tested. Voicemail shows in the portlet Missed tab; not yet in Reporting Central or the Phone Call panel.
10. **Monitoring / alerting** — no alert on poller failure, stale phones or publish errors.
11. **Inbound recording speaker channel** unverified (mono vs dual); auto-transcription and parent-recording delete unverified.
12. **Commit + live-test** reconciliation (§7) and presence (§8); staleness soak test; logout → login recovery (§1, §3) without a hard reload.
13. Missed inbound calls arrive up to ~20 min late (5 min settle + 15 min poll).
14. **Dock UI for the new contract** — `reconnecting`, `moved`, `callWarning`, "Turn on phone" (`audioUnlocked`), notifications (`notify`), missed badge (`missedUnseen` + `markMissedSeen`), `error` kinds incl. `not_enabled` (no auto-enter, no Call), `refused`, outside-tab "Use phone here" (shell with `u=` + `takeover=1`).
15. **Server-side dial allow-listing** — the bus cannot authenticate senders (§2).
16. **Heartbeat `frozen` state** not accepted by the RESTlet yet (§3).

14. **Stale analysis claim** release is built (§6), not live-tested. A call that gave up (Failed + processed T) keeps its Twilio recording; no admin view lists them yet.
15. **Non-phone users:** built in the working tree, not live-tested — the softphone stops on `not_a_phone_user` (§3) and the dock remembers it for 24 h (localStorage `ctc-phone-not-enabled`), so outside tabs draw nothing and the dashboard loader does not auto-enter (§2). The first dashboard visit still enters phone mode once to learn it.
16. **Supervisor check** joins the Employee record: a manager role without employee view permission is refused (fails closed). Live check needed.

### Known doc inaccuracies (code is the truth)

- CLAUDE.md: `DOCK_ASSET_VERSION` "now `'8'`" → code `'16'`.
- CLAUDE.md: panel "as tall as its content … stuck to the left/right edge … localStorage `ctc-dock-panel-side`" → code: fixed 380 × 620, 8-point drag; key removed.
- CLAUDE.md: "Shell test controls … only with `&debug=1`" → removed in the 2026-10-30 cleanup.
- CLAUDE.md: "6 scripts", "Inbound is not built", "What NOT to Build: no inbound" → 9 scripts + SPA; inbound is built.
- ARCHITECTURE.md / README.md: TwiML Bin `callerId="{{From}}"` → the browser sends `CallerId`.
- `lib/ctc_workspace_queries.js` comments still say "CTC is outbound only" / missed inbound calls are not logged.

- 2026-11-01 — No screen-pop on Answer (user: reps may be in the middle of something; Open record exists in the panel). Vertical pill always shows the phone button (no bare-dot pill while starting or ringing). DOCK_ASSET_VERSION 18.
- 2026-11-01 — Portlet tabs Calls | Missed | Follow-ups; In / Out / Missed direction chips (portlet + Reporting Central); follow-ups footer "Showing x of N · newest first" + Reporting Central link; AI due dates resolved against the call date (reference line, `{task, due_date}` items, +3 business days fallback); fallback titles never use the recording SID.
- 2026-11-01 — Ringing pill (both shapes): sky dot plus a green Answer button with a pulsing ring orb (`.v-main.answer`, `ctc-orb` 1.6 s; reduced motion: static ring). The button answers (bus `answer`); the pill body opens the phone. DOCK_ASSET_VERSION 19.
- 2026-11-01 — Recents fix: `last7days` = `startdate onorafter daysago7` (was `within lastweektodate`, empty for this week), `last30days` = `daysago30`. Phone panel Recents: direction icons, "Missed" / "Voicemail" + Call back on missed rows, a pending row for the newest missed call until its Phone Call is reconciled; the missed note never auto-hides. Portlet + Reporting Central: In / Out / Missed word chips replaced by a 20 px icon dot + time (user chose option 1); Time column 80 px (portlet) / When column 84 px (Reporting Central). DOCK_ASSET_VERSION 20.
- 2026-11-01 — Reporting Central: short date under the time in multi-day ranges ("Oct 30" / "Oct 30, 2025"), When column 100 px; "After the call" for unanswered calls reads "Missed call" / "No answer" chips from the shared `CALL_STATUS_RULES` (moved from the portlet to `lib/ctc_html.js`), replacing "Not connected".
