// @ts-check
/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Telephony Dock constants + mount builders.
 * Phone mode: the shell Suitelet (ctc_sl_shell.js) is the tab's top page and
 * never reloads. Its hidden #ctc-phone-frame runs the softphone Suitelet, the
 * "anchor": the only window that holds audio and call state. Exactly one
 * shell per browser holds the phone (Web Lock PHONE_LOCK_NAME). The dock
 * (ctc_dock_client.js + ctc_dock_dialer.js) is plain browser JS that draws
 * the pill and dialer and talks to the anchor over BroadcastChannel
 * (BUS_CHANNEL). Data (search, contacts, recents, snapshot) comes straight
 * from the ctc_rl_token RESTlet, same session. No popup window anywhere.
 */
define(['./ctc_html'], (ctcHtml) => {

    const escapeHtml = ctcHtml.escapeHtml;
    const escapeJs = ctcHtml.escapeJs;

    // File Cabinet paths of the browser-side dock scripts, in load order.
    const DOCK_ASSET_PATH = '/SuiteApps/com.netsuite.clicktocall/lib/ctc_dock_client.js';
    const DIALER_ASSET_PATH = '/SuiteApps/com.netsuite.clicktocall/lib/ctc_dock_dialer.js';
    // This SuiteApp's single page apps: NetSuite serves them at
    // /spa-app/<appId>/<url> in every account. Phone mode loads these in
    // its frame (ctc_sl_shell.js).
    const SPA_PATH_PREFIX = '/spa-app/com.netsuite.clicktocall/';

    // Appended to the media URLs so browsers drop cached copies after a deploy.
    // Bump every time ctc_dock_client.js or ctc_dock_dialer.js changes.
    const DOCK_ASSET_VERSION = '51';

    // ===================== BUS CONTRACT (ctc-bus, v: 1) =====================
    // BroadcastChannel name shared by the anchor (ctc_sl_softphone.js in the
    // shell's #ctc-phone-frame), the shell page itself and every dock, in
    // every tab of this browser profile. Every message carries v: 1.
    //
    // ---- dock → anchor ----
    //   { type: 'hello' }   asks for a snapshot (no origin / nonce needed).
    //     The anchor answers at once with a snapshot.
    //   { type: 'request', action, origin: 'dock', nonce, anchor, from, seq, ...fields }
    //     origin: always the string 'dock'.
    //     anchor: snap.anchorId of the latest snapshot from a working anchor
    //       (not 'offline' / 'moved'). An anchor drops a request that names
    //       another anchor, so two anchors never both act on one 'dial'.
    //       New docks never send before the readiness handshake (below), so
    //       they always name it. Old docks may omit it; the anchor then
    //       accepts it.
    //     nonce: a fresh random string per request, 8-64 chars of [A-Za-z0-9_-]
    //       (use REQUEST_NONCE_PATTERN). The anchor drops a request without
    //       both, or with a nonce it saw before (replay). A refused request
    //       comes back as snap.refused with the same nonce (see below).
    //     from: the sending tab's id (REQUEST_SENDER_PATTERN), one per page
    //       load (window.__ctcBusTab, kept by the dock; the shell page sends
    //       no requests). seq: a positive integer, +1 per new command of that
    //       tab. The anchor runs each (from, seq) once: it keeps the last
    //       SEQ_MEMORY seqs of the last SENDER_MEMORY tabs, drops a repeat
    //       silently and acks it again. A dock sends the SAME seq again (fresh
    //       nonce) for a repeat of the same command within COALESCE_MS (a
    //       double-click on Call is one 'dial'; never for 'digits'). Old docks
    //       send no from / seq: no dedupe for them (nonce and rate limits
    //       only). Acks: snap.acks (below).
    //     A request that reaches an anchor after it started to step aside
    //     (it lost to another anchor, see One anchor) is dropped (not run,
    //     not acked), so a command sent while the anchor changes is never
    //     doubled. Docks never replay a sent request.
    //   Readiness handshake (docks): a dock says 'hello' at load and after an
    //     anchor change (its anchor said 'moved' / 'offline'). It sends no request
    //     until a snapshot from a working anchor with a compatible bus version
    //     (snap.bus, below) arrives; before the first one its pill shows
    //     'starting' (disabled slot). Requests made meanwhile wait at most
    //     REQUEST_QUEUE_MS, then are dropped with a quiet error line.
    //   Actions:
    //     'mute' | 'unmute' | 'hangup'
    //     'digits'      { d }  one of 0-9 * #, only during a call (DTMF)
    //     'dial'        { to, entityId, entityName, entityType, contactId, contactName }
    //                   Refused ('busy') unless phase is 'ready'; refused
    //                   ('invalid-number') unless to is a dialable E.164 / NANP
    //                   number (+1NXXNXXXXXX, or + and 7-15 digits outside +1;
    //                   10 / 11 digit NANP input is accepted and made +1);
    //                   rate-limited per anchor page: one dial per 3 s
    //                   ('rate'), 20 per rolling hour ('hourly-limit').
    //     'setInput' | 'setOutput'  { id }  (refused during a call)
    //     'answer' | 'decline'      (only while phase is 'incoming')
    //     'markMissedSeen'          resets snap.missedUnseen to count 0
    //     'unlockAudio'             handled by the SHELL, not the anchor: send
    //                               it from a user gesture (click / key) in a
    //                               top-level page of the shell tab (the dock in
    //                               shell mode). The shell acts only
    //                               while it has transient user activation, so
    //                               a request from another tab does nothing.
    //                               In the shell page prefer the direct call
    //                               window.__ctcShell.unlockAudio() inside the
    //                               click handler (same effect, no bus hop).
    //                               Effect: resumes the phone frame's audio
    //                               (ringtone may be blocked by autoplay until a
    //                               gesture) and asks for Notification
    //                               permission once (snap.notify).
    //   BroadcastChannel cannot authenticate a sender: any same-origin page
    //   can post these. origin / nonce / anchor / rate limits only stop
    //   accidents and replays; the backstop is server side: the outbound
    //   Function's country allow-list and Twilio Geo Permissions.
    //
    // ---- anchor → docks ----
    //   { type: 'snapshot', snap: { bus, anchorId, locked, phase, direction, caller, callSid, entityId, entityType,
    //     entityName, contactName, number, startedAt, muted, lastLog, audio, canReceive,
    //     callWarning, audioUnlocked, notify, missedUnseen, error, refused, acks } }
    //   Sent on every state change, after every request it ran, and as the
    //   answer to 'hello'.
    // bus: BUS_VERSION of the anchor. A snapshot without it comes from an
    //   older anchor and counts as version 1. A dock works with an anchor
    //   whose version is BUS_MIN_VERSION or more; older ones it ignores.
    //   Docks ignore fields they do not know, so new fields never break an
    //   older dock.
    // acks: { <from>: [seq, ...] } the last ACK_MEMORY seqs this anchor ran
    //   (or refused) per tab, newest last. A request it dropped is never in it.
    // anchorId: random id of this anchor page load ('a' + hex). locked: its
    //   shell holds the Web Lock PHONE_LOCK_NAME.
    // One anchor: the anchor runs only inside the shell (window.parent has
    //   __ctcShell); opened any other way it starts no Device and no bus.
    //   It says 'hello' at start. An anchor that sees another anchor's
    //   working snapshot keeps going when it wins (its shell holds the lock
    //   and the other's does not; with equal lock state, the lower anchorId),
    //   and answers with its own snapshot. The loser unregisters, publishes
    //   'moved' and sends its shell PHONE_DUPLICATE_MESSAGE (after a live
    //   call ends; it never ends a call).
    // phase: 'offline' | 'starting' | 'ready' | 'dialing' | 'ringing' | 'incoming'
    //        | 'answering' | 'connected' | 'reconnecting' | 'error' | 'moved'
    //   incoming: Twilio rings this phone (inbound). Docks show the incoming
    //     card (Answer / Decline) at their pill, or the panel's ring view when
    //     the panel is open.
    //   answering: the anchor accepted an inbound call ('answer') and waits
    //     for Twilio's 'accept' (media not up yet). Goes to 'connected' on
    //     accept, to 'ready' when the caller hangs up first (lastLog
    //     'missed') or the accept fails, to 'error' on a call error. The call
    //     exists (End works); Mute and the keypad do not yet. Docks show
    //     "Connecting…" with no action. Older docks do not know the phase
    //     and draw it as 'offline' (no action) until it changes.
    //   reconnecting: a live call lost its media / signaling path and Twilio is
    //     trying to restore it (Call 'reconnecting'). The call, timer and mute
    //     state are kept; the phase goes back to 'connected' on 'reconnected'
    //     (or the call ends). Treat it as a live call (End stays available).
    //   moved: this anchor lost to another anchor (One anchor) and stepped
    //     aside; it is unregistered and its shell stops its frame next. The
    //     winning anchor answers with its own snapshot at once. Docks draw
    //     'moved' from the anchor they follow as 'starting' (readiness
    //     handshake) and ignore 'offline' / 'moved' from any other anchor.
    //   Live phases (a call exists): dialing, ringing, incoming, answering, connected, reconnecting.
    // direction: 'outbound' | 'inbound' (the current or last call)
    // caller: null | { number, name, entityId, entityType } for an inbound call; name and the
    //   entity fill in after the anchor's lookupCaller answer (a second snapshot).
    // callSid: '' | the Twilio CallSid of the ringing or live call ('' until Twilio gives one).
    // lastLog: null | { status: 'saved' | 'skipped' | 'error' | 'missed', message, recordUrl }
    //   + transcript (saved calls, asset 43): { stage: 'logged' | 'transcribing' |
    //     'done' | 'none' | 'later', since (ms, when logged), summary (when done),
    //     recordId }. The softphone's transcript check moves it on.
    //   missed: an inbound call that stopped ringing before Answer ("Missed call from …").
    // canReceive: null (the token does not grant inbound) | true (Twilio can ring this phone:
    //   the device is registered) | false (inbound is on but the device is not registered;
    //   the anchor's watchdog is re-registering). A new snapshot goes out on every
    //   registration change. In the ready phase, false shows an amber dot ("reconnecting").
    // audio: null (no device yet) | { inputs: [{ id, label }], outputs: [{ id, label }],
    //        input, output, outputSupported }
    // callWarning: '' | 'no-audio' | 'low-mic' | 'packet-loss' | 'high-rtt' | 'high-jitter'
    //   | 'low-mos'. Call quality during a live call (Twilio Call 'warning' /
    //   'warning-cleared'); the most severe active one, in that order. Cleared
    //   on 'reconnected' and when the call ends. 'low-mic' = the mic sends a
    //   constant level (often a hardware-muted mic); ignore it while muted.
    // audioUnlocked: true once the shell tab had a user gesture (sticky
    //   activation, a click in the shell, or 'unlockAudio'). false: the
    //   ringtone may be silent (autoplay) — show "Turn on phone", which must
    //   call window.__ctcShell.unlockAudio() / send 'unlockAudio' from the click.
    // notify: 'default' | 'granted' | 'denied' | 'unsupported' — the shell
    //   tab's Notification permission. Asked only from 'unlockAudio'.
    // missedUnseen: { count, last, at } — inbound calls that stopped ringing
    //   unanswered since the last 'markMissedSeen'. last: null | { name, number,
    //   entityId, entityType } of the newest one; at: null | epoch ms of it.
    //   Kept in the shell tab's sessionStorage (MISSED_STORAGE_KEY), so a
    //   phone-frame restart keeps it; another tab starts at 0.
    // error: { kind, code, message } — kind '' (no error) | 'mic' | 'session'
    //   | 'signed_out' | 'network' | 'twilio' | 'not_enabled' | 'paused'. signed_out:
    //   NetSuite answered 401 / 403 or its login page (token fetch, or the
    //   60 s 'sessionPing'): the rep must sign in again; the phone recovers by
    //   itself after that (ERROR_SIGNED_OUT). session: other token fetch
    //   failures (offline, server error) or Twilio 20101 / 20104 / 31204-31206; mic: microphone permission
    //   denied or Twilio 31208 / 31401; network: other Twilio 31xxx (signaling,
    //   media) and register time-outs; twilio: any other Twilio code. code:
    //   the Twilio code, the HTTP status for session, else 0; for not_enabled
    //   the string ERROR_NOT_A_PHONE_USER ('not_a_phone_user'). message: short
    //   diagnostic text (not UI copy). Cleared on recovery (token back,
    //   registered, call accepted, permission granted). A device error during
    //   a live call sets error but keeps the call and its phase.
    //   not_enabled: the RESTlet refuses tokens for this user (not a rep,
    //   manager or admin). Permanent: phase 'error', no token retries, no
    //   registration; the shell releases the Web Lock, stops the phone frame
    //   and shows "The phone is not enabled for your user. Ask your
    //   administrator." with Exit phone mode. Docks should not auto-enter
    //   phone mode for this user (dock loader; the shell tab's sessionStorage
    //   has no flag for it yet) and should not offer Call.
    //   paused: the admin paused Click-to-Call (config active F), seen by the
    //   60 s 'sessionPing' (answer active false) or a token refusal marked
    //   paused. code 'ctc_paused'. The anchor unregisters (after a live call
    //   ends; it never ends one), refuses 'dial' (refused.reason 'paused')
    //   and fetches no tokens. Not permanent: when 'sessionPing' says active
    //   again the anchor fetches a token, registers and clears the error (no
    //   reload). Docks show "Calling is paused by your administrator" and
    //   should not offer Call.
    // refused: null | { action, reason, nonce, at } — the last request the
    //   anchor refused. reason: 'busy' | 'invalid-number' | 'rate'
    //   | 'hourly-limit' | 'paused' (dial while Click-to-Call is paused). Match nonce to
    //   your own request. Requests without origin / nonce are dropped silently.
    //
    // ---- Multi-tab (one phone, every tab) ----
    //   One shell holds the Web Lock PHONE_LOCK_NAME and runs the anchor. A
    //   second shell tab waits and queues a normal lock request, so it takes
    //   over by itself when the first tab closes / crashes / is discarded.
    //   While it waits (lock 'waiting') its dock is a remote control of the
    //   anchor in the other tab, like an outside tab; the busy banner shows
    //   only when the shell has no dock. No tab moves the phone by hand and
    //   no shell steals the lock. A shell whose lock is stolen anyway (by
    //   another page, e.g. an older shell still open) during a live call of
    //   its own keeps its phone (lock 'yielding'): the anchor steps aside
    //   after the call (One anchor), and the shell stops the phone frame when
    //   the call ends.
    //
    // ---- Shared UI state (docks, localStorage UI_STATE_KEY) ----
    //   { v: UI_STATE_VERSION, open, view, corner, at }: panel open or
    //   minimized, view 'dial' | 'search' | 'recents' | 'call', the snap
    //   point (also kept in the older key 'ctc-dock-pos', which every dock
    //   version writes and which wins), epoch ms. Written when the user opens
    //   or closes the panel, picks a tab or moves the dock. Applied on load and
    //   when the tab becomes visible or gets focus, never while the user
    //   works in the tab. A live call always shows the in-call view.
    //
    // ---- anchor ↔ shell (window.postMessage, same origin; not the bus) ----
    //   (No longer sent: the automatic screen-pop on Answer was removed at the user's
    //   request — reps may be mid-task; the panel's Open record link stays. The shell
    //   still accepts the message for a future explicit action.)
    //   anchor → shell: { v: 1, type: OPEN_RECORD_MESSAGE, path } after Answer on a
    //     matched caller (screen-pop). Accepted only from #ctc-phone-frame, same
    //     origin, and only an entity record path (/app/common/entity/custjob.nl|contact.nl?id=<digits>).
    //   anchor → shell: { v: 1, type: PHONE_DISABLED_MESSAGE } on not_a_phone_user.
    //   anchor → shell: { v: 1, type: PHONE_DUPLICATE_MESSAGE } when it lost
    //     to another anchor (see One anchor). The shell stops its phone frame
    //     and shows the busy banner.
    //   shell → anchor: { v: 1, type: SHELL_STATE_MESSAGE, audioUnlocked, notify }
    //     on phone-frame load and on change; the anchor copies both into snap.
    //   shell → anchor: { v: 1, type: UNLOCK_AUDIO_MESSAGE } from a gesture.
    //   shell → anchor: { v: 1, type: SESSION_CHECK_MESSAGE } when the NetSuite
    //     frame lands on a login page or an unreadable page: the anchor runs
    //     its session ping now (not at the next 60 s tick), so a sign-out shows
    //     as error kind signed_out within a second or two (asset 37).
    //   The anchor accepts these only from window.parent, same origin.
    //
    // Dock modes (ctc_dock_client.js picks one at load):
    //   shell   - top page is the shell (window.__ctcShell set before the dock
    //             scripts). Pill + dialer; talks to the anchor over the bus.
    //   frame   - a NetSuite page inside the shell. Draws nothing; exposes
    //             window.__ctcDock.call() → top.__ctcShell.call(ctx) and
    //             window.__ctcRecordContext for the shell to read on load.
    //   outside - a normal NetSuite tab. Another tab holds PHONE_LOCK_NAME →
    //             the full pill + panel as a remote control (bus requests).
    //             Else "Open phone" → top navigates to the shell
    //             with u=<this page>. With data-auto-enter="1" (dashboard
    //             portlet) it goes there by itself unless the rep left phone
    //             mode in this tab (sessionStorage EXIT_KEY = '1').
    const BUS_CHANNEL = 'ctc-bus';

    // Bus contract version: snapshots carry it as snap.bus. Version 2
    // (2026-11-11): request from / seq, snap.acks, readiness handshake.
    const BUS_VERSION = 2;
    // Oldest anchor version a dock works with (a snapshot without bus = 1).
    const BUS_MIN_VERSION = 1;
    // request.from: the sending tab's id.
    const REQUEST_SENDER_PATTERN = '^[A-Za-z0-9_-]{4,64}$';
    // Anchor memory for (from, seq) dedupe and acks.
    const SEQ_MEMORY = 32;
    const SENDER_MEMORY = 16;
    const ACK_MEMORY = 8;
    // Dock: a repeat of the same command within this time reuses its seq.
    const COALESCE_MS = 1000;
    // Dock: requests made before the readiness handshake wait this long.
    const REQUEST_QUEUE_MS = 2000;
    // localStorage key and version of the shared dock UI state.
    const UI_STATE_KEY = 'ctc-dock-ui';
    const UI_STATE_VERSION = 1;

    // Bus phase while Twilio rings this phone (inbound), and the requests the
    // docks send to answer or decline it.
    const PHASE_INCOMING = 'incoming';
    // Bus phase between 'answer' and Twilio's accept (see the contract).
    const PHASE_ANSWERING = 'answering';
    const REQUEST_ANSWER = 'answer';
    const REQUEST_DECLINE = 'decline';
    // postMessage type the anchor sends the shell for the screen-pop.
    const OPEN_RECORD_MESSAGE = 'ctc-open-record';

    // Phases added for call resilience and one anchor (a duplicate steps aside).
    const PHASE_RECONNECTING = 'reconnecting';
    const PHASE_MOVED = 'moved';
    // Requests added: audio unlock (shell), missed-call reset.
    const REQUEST_UNLOCK_AUDIO = 'unlockAudio';
    const REQUEST_MARK_MISSED_SEEN = 'markMissedSeen';
    // Every request carries origin: REQUEST_ORIGIN and a nonce matching this.
    const REQUEST_ORIGIN = 'dock';
    const REQUEST_NONCE_PATTERN = '^[A-Za-z0-9_-]{8,64}$';
    // postMessage types between the anchor and its shell (see the contract).
    const SHELL_STATE_MESSAGE = 'ctc-shell-state';
    const UNLOCK_AUDIO_MESSAGE = 'ctc-unlock-audio';
    const SESSION_CHECK_MESSAGE = 'ctc-session-check';
    const PHONE_DISABLED_MESSAGE = 'ctc-phone-disabled';
    const PHONE_DUPLICATE_MESSAGE = 'ctc-phone-duplicate';
    // RESTlet error (and snap.error.code) for a user who may not use the phone.
    const ERROR_NOT_A_PHONE_USER = 'not_a_phone_user';
    // snap.error.kind when NetSuite signed the rep out (bus contract above).
    const ERROR_SIGNED_OUT = 'signed_out';
    // sessionStorage key (shell tab) for snap.missedUnseen.
    const MISSED_STORAGE_KEY = 'ctc-missed-unseen';

    // Web Lock the shell holds for its whole life while it runs the phone.
    const PHONE_LOCK_NAME = 'ctc-phone-anchor';
    // sessionStorage key set when the rep leaves phone mode; stops auto-enter.
    const EXIT_KEY = 'ctc-phone-exit';

    /**
     * @typedef {Object} DockMountOptions
     * @property {string} [shellUrl] - phone mode shell Suitelet URL (same origin)
     * @property {boolean} [autoEnter] - outside phone mode, go to the shell by itself (dashboard portlet only)
     * @property {string} [restletUrl] - ctc_rl_token RESTlet URL (same origin)
     * @property {{entityId?: string, entityName?: string, entityType?: string, phone?: string}} [context] - Record the page shows
     * @property {string} [assetUrl] - media URL of ctc_dock_client.js
     * @property {string} [dialerUrl] - media URL of ctc_dock_dialer.js
     */

    const withVersion = (assetUrl) =>
        assetUrl + (assetUrl.indexOf('?') === -1 ? '?' : '&') + 'v=' + DOCK_ASSET_VERSION;

    /**
     * data-* attributes the dock reads from its <script> element.
     * @param {DockMountOptions} opts
     * @returns {Array<[string, string]>}
     */
    const dockAttributes = (opts) => {
        const ctx = opts.context || {};
        /** @type {Array<[string, string]>} */
        const attrs = [
            ['data-bus', BUS_CHANNEL],
            ['data-shell-url', opts.shellUrl || ''],
            ['data-restlet-url', opts.restletUrl || ''],
            ['data-entity-id', String(ctx.entityId || '')],
            ['data-entity-name', String(ctx.entityName || '')],
            ['data-entity-type', String(ctx.entityType || '')],
            ['data-phone', String(ctx.phone || '')]
        ];
        if (opts.autoEnter) attrs.push(['data-auto-enter', '1']);
        return attrs;
    };

    /**
     * Script tags that mount the dock on a page that runs scripts (record pages).
     * The dialer tag carries no attributes; it attaches to window.__ctcDock.
     * @param {DockMountOptions} opts - assetUrl and dialerUrl are required here
     * @returns {string}
     */
    const buildDockScriptTag = (opts) => {
        if (!opts || !opts.assetUrl || !opts.dialerUrl) return '';
        const attrs = dockAttributes(opts)
            .map(([k, v]) => ' ' + k + '="' + escapeHtml(v) + '"')
            .join('');
        return '<script src="' + escapeHtml(withVersion(opts.assetUrl)) + '"' + attrs + '></script>'
            + '<script src="' + escapeHtml(withVersion(opts.dialerUrl)) + '"></script>';
    };

    /**
     * Mount data for a page that adds the dock scripts itself (this
     * SuiteApp's SPAs): versioned file URLs plus the attributes the dock
     * script element must carry. Load the dialer after the dock.
     * @param {DockMountOptions} opts - assetUrl and dialerUrl are required here
     * @returns {{assetUrl: string, dialerUrl: string, attrs: Array<[string, string]>}|null}
     */
    const buildDockMount = (opts) => {
        if (!opts || !opts.assetUrl || !opts.dialerUrl) return null;
        return {
            assetUrl: withVersion(opts.assetUrl),
            dialerUrl: withVersion(opts.dialerUrl),
            attrs: dockAttributes(opts)
        };
    };

    /**
     * Dock loader for HTML portlets. NetSuite parses portlet HTML in a
     * throwaway iframe, copies innerHTML to the dashboard, and strips every
     * <script>; only inline on* attribute strings survive. A broken <img>
     * fires onerror once it lands in the live page, and the handler appends
     * the dock scripts there. The window.__ctcDock and data-ctc-dock-loader
     * guards keep it to one dock per page (the iframe copy may fire too; that
     * document is thrown away).
     * @param {DockMountOptions} opts - assetUrl and dialerUrl are required here
     * @returns {string}
     */
    const buildDockLoaderHtml = (opts) => {
        if (!opts || !opts.assetUrl || !opts.dialerUrl) return '';
        const setAttrs = dockAttributes(opts)
            .map(([k, v]) => "s.setAttribute('" + k + "','" + escapeJs(v) + "');")
            .join('');
        const js = "if(!window.__ctcDock&&!document.querySelector('script[data-ctc-dock-loader]')){"
            + "var s=document.createElement('script');s.src='" + escapeJs(withVersion(opts.assetUrl)) + "';"
            + setAttrs
            + "s.setAttribute('data-ctc-dock-loader','');"
            + "s.onload=function(){var d=document.createElement('script');d.src='" + escapeJs(withVersion(opts.dialerUrl)) + "';document.body.appendChild(d);};"
            + "document.body.appendChild(s);}";
        return '<img alt="" src="data:," style="display:none" onerror="' + escapeHtml(js) + '">';
    };

    return {
        DOCK_ASSET_PATH,
        DIALER_ASSET_PATH,
        SPA_PATH_PREFIX,
        DOCK_ASSET_VERSION,
        BUS_CHANNEL,
        BUS_VERSION,
        BUS_MIN_VERSION,
        REQUEST_SENDER_PATTERN,
        SEQ_MEMORY,
        SENDER_MEMORY,
        ACK_MEMORY,
        COALESCE_MS,
        REQUEST_QUEUE_MS,
        UI_STATE_KEY,
        UI_STATE_VERSION,
        PHASE_INCOMING,
        PHASE_ANSWERING,
        REQUEST_ANSWER,
        REQUEST_DECLINE,
        OPEN_RECORD_MESSAGE,
        PHASE_RECONNECTING,
        PHASE_MOVED,
        REQUEST_UNLOCK_AUDIO,
        REQUEST_MARK_MISSED_SEEN,
        REQUEST_ORIGIN,
        REQUEST_NONCE_PATTERN,
        SHELL_STATE_MESSAGE,
        UNLOCK_AUDIO_MESSAGE,
        SESSION_CHECK_MESSAGE,
        PHONE_DISABLED_MESSAGE,
        PHONE_DUPLICATE_MESSAGE,
        ERROR_NOT_A_PHONE_USER,
        ERROR_SIGNED_OUT,
        MISSED_STORAGE_KEY,
        PHONE_LOCK_NAME,
        EXIT_KEY,
        dockAttributes,
        buildDockScriptTag,
        buildDockMount,
        buildDockLoaderHtml
    };
});
