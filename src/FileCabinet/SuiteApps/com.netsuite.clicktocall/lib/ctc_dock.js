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

    // Appended to the media URLs so browsers drop cached copies after a deploy.
    // Bump every time ctc_dock_client.js or ctc_dock_dialer.js changes.
    const DOCK_ASSET_VERSION = '20';

    // ===================== BUS CONTRACT (ctc-bus, v: 1) =====================
    // BroadcastChannel name shared by the anchor (ctc_sl_softphone.js in the
    // shell's #ctc-phone-frame), the shell page itself and every dock, in
    // every tab of this browser profile. Every message carries v: 1.
    //
    // ---- dock → anchor ----
    //   { type: 'hello' }   asks for a snapshot (no origin / nonce needed)
    //   { type: 'request', action, origin: 'dock', nonce, ...fields }
    //     origin: always the string 'dock'.
    //     nonce: a fresh random string per request, 8-64 chars of [A-Za-z0-9_-]
    //       (use REQUEST_NONCE_PATTERN). The anchor drops a request without
    //       both, or with a nonce it saw before (replay). A refused request
    //       comes back as snap.refused with the same nonce (see below).
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
    //     'takeover'                "Use phone here": see Multi-tab below
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
    //   can post these. origin / nonce / rate limits only stop accidents and
    //   replays; server-side allow-listing of dialled numbers is the backstop
    //   (future work).
    //
    // ---- anchor → docks ----
    //   { type: 'snapshot', snap: { phase, direction, caller, callSid, entityId, entityType,
    //     entityName, contactName, number, startedAt, muted, lastLog, audio, canReceive,
    //     callWarning, audioUnlocked, notify, missedUnseen, error, refused } }
    //   Sent on every state change and as the answer to 'hello'.
    // phase: 'offline' | 'starting' | 'ready' | 'dialing' | 'ringing' | 'incoming'
    //        | 'connected' | 'reconnecting' | 'error' | 'moved'
    //   incoming: Twilio rings this phone (inbound). Docks show the incoming
    //     card (Answer / Decline) at their pill, or the panel's ring view when
    //     the panel is open.
    //   reconnecting: a live call lost its media / signaling path and Twilio is
    //     trying to restore it (Call 'reconnecting'). The call, timer and mute
    //     state are kept; the phase goes back to 'connected' on 'reconnected'
    //     (or the call ends). Treat it as a live call (End stays available).
    //   moved: this anchor handed the phone to another tab ('takeover'); it is
    //     unregistered and its frame is stopped next. The new tab's anchor
    //     publishes its own snapshots ('starting' → 'ready') soon after.
    //   Live phases (a call exists): dialing, ringing, incoming, connected, reconnecting.
    // direction: 'outbound' | 'inbound' (the current or last call)
    // caller: null | { number, name, entityId, entityType } for an inbound call; name and the
    //   entity fill in after the anchor's lookupCaller answer (a second snapshot).
    // callSid: '' | the Twilio CallSid of the ringing or live call ('' until Twilio gives one).
    // lastLog: null | { status: 'saved' | 'skipped' | 'error' | 'missed', message, recordUrl }
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
    //   | 'network' | 'twilio' | 'not_enabled'. session: token fetch fails (NetSuite session
    //   gone) or Twilio 20101 / 20104 / 31204-31206; mic: microphone permission
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
    // refused: null | { action, reason, nonce, at } — the last request the
    //   anchor refused. reason: 'busy' | 'invalid-number' | 'rate'
    //   | 'hourly-limit' | 'call-live' (takeover during a call). Match nonce to
    //   your own request. Requests without origin / nonce are dropped silently.
    //
    // ---- Multi-tab ("Use phone here") ----
    //   One shell holds the Web Lock PHONE_LOCK_NAME and runs the anchor. A
    //   second shell tab waits (busy banner) and queues a normal lock request,
    //   so it takes over by itself when the first tab closes / crashes / is
    //   discarded. window.__ctcShell.takeover() (or the banner's "Use phone
    //   here") in a waiting shell sends 'takeover'. The anchor refuses during a
    //   live call (refused.reason 'call-live'); else it unregisters, publishes
    //   phase 'moved' and tells its shell (PHONE_MOVED_MESSAGE). The waiting
    //   shell then takes the lock with { steal: true } (also after 3 s with no
    //   answer from any anchor) and starts its phone; the old shell stops its
    //   phone frame and waits (busy banner) in turn. An outside (normal) tab
    //   cannot hold the phone: its "Use phone here" opens the shell in the
    //   same tab with u=<its path>; the shell then calls takeover() itself
    //   when it finds the phone busy (a dock action; see TAKEOVER_PARAM).
    //
    // ---- anchor ↔ shell (window.postMessage, same origin; not the bus) ----
    //   (No longer sent: the automatic screen-pop on Answer was removed at the user's
    //   request — reps may be mid-task; the panel's Open record link stays. The shell
    //   still accepts the message for a future explicit action.)
    //   anchor → shell: { v: 1, type: OPEN_RECORD_MESSAGE, path } after Answer on a
    //     matched caller (screen-pop). Accepted only from #ctc-phone-frame, same
    //     origin, and only an entity record path (/app/common/entity/custjob.nl|contact.nl?id=<digits>).
    //   anchor → shell: { v: 1, type: PHONE_MOVED_MESSAGE } after a takeover.
    //   anchor → shell: { v: 1, type: PHONE_DISABLED_MESSAGE } on not_a_phone_user.
    //   shell → anchor: { v: 1, type: SHELL_STATE_MESSAGE, audioUnlocked, notify }
    //     on phone-frame load and on change; the anchor copies both into snap.
    //   shell → anchor: { v: 1, type: UNLOCK_AUDIO_MESSAGE } from a gesture.
    //   The anchor accepts these only from window.parent, same origin.
    //
    // Dock modes (ctc_dock_client.js picks one at load):
    //   shell   - top page is the shell (window.__ctcShell set before the dock
    //             scripts). Pill + dialer; talks to the anchor over the bus.
    //   frame   - a NetSuite page inside the shell. Draws nothing; exposes
    //             window.__ctcDock.call() → top.__ctcShell.call(ctx) and
    //             window.__ctcRecordContext for the shell to read on load.
    //   outside - a normal NetSuite tab. Chip only. Another tab holds
    //             PHONE_LOCK_NAME → mirror its call read-only (End/Mute
    //             allowed). Else "Open phone" → top navigates to the shell
    //             with u=<this page>. With data-auto-enter="1" (dashboard
    //             portlet) it goes there by itself unless the rep left phone
    //             mode in this tab (sessionStorage EXIT_KEY = '1').
    const BUS_CHANNEL = 'ctc-bus';

    // Bus phase while Twilio rings this phone (inbound), and the requests the
    // docks send to answer or decline it.
    const PHASE_INCOMING = 'incoming';
    const REQUEST_ANSWER = 'answer';
    const REQUEST_DECLINE = 'decline';
    // postMessage type the anchor sends the shell for the screen-pop.
    const OPEN_RECORD_MESSAGE = 'ctc-open-record';

    // Phases added for call resilience and multi-tab.
    const PHASE_RECONNECTING = 'reconnecting';
    const PHASE_MOVED = 'moved';
    // Requests added: audio unlock (shell), missed-call reset, takeover.
    const REQUEST_UNLOCK_AUDIO = 'unlockAudio';
    const REQUEST_MARK_MISSED_SEEN = 'markMissedSeen';
    const REQUEST_TAKEOVER = 'takeover';
    // Every request carries origin: REQUEST_ORIGIN and a nonce matching this.
    const REQUEST_ORIGIN = 'dock';
    const REQUEST_NONCE_PATTERN = '^[A-Za-z0-9_-]{8,64}$';
    // postMessage types between the anchor and its shell (see the contract).
    const PHONE_MOVED_MESSAGE = 'ctc-phone-moved';
    const SHELL_STATE_MESSAGE = 'ctc-shell-state';
    const UNLOCK_AUDIO_MESSAGE = 'ctc-unlock-audio';
    const PHONE_DISABLED_MESSAGE = 'ctc-phone-disabled';
    // RESTlet error (and snap.error.code) for a user who may not use the phone.
    const ERROR_NOT_A_PHONE_USER = 'not_a_phone_user';
    // sessionStorage key (shell tab) for snap.missedUnseen.
    const MISSED_STORAGE_KEY = 'ctc-missed-unseen';
    // Shell URL parameter: takeover=1 makes a shell that finds the phone
    // busy ask for it at once ("Use phone here" from an outside tab).
    const TAKEOVER_PARAM = 'takeover';

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
        DOCK_ASSET_VERSION,
        BUS_CHANNEL,
        PHASE_INCOMING,
        REQUEST_ANSWER,
        REQUEST_DECLINE,
        OPEN_RECORD_MESSAGE,
        PHASE_RECONNECTING,
        PHASE_MOVED,
        REQUEST_UNLOCK_AUDIO,
        REQUEST_MARK_MISSED_SEEN,
        REQUEST_TAKEOVER,
        REQUEST_ORIGIN,
        REQUEST_NONCE_PATTERN,
        PHONE_MOVED_MESSAGE,
        SHELL_STATE_MESSAGE,
        UNLOCK_AUDIO_MESSAGE,
        PHONE_DISABLED_MESSAGE,
        ERROR_NOT_A_PHONE_USER,
        MISSED_STORAGE_KEY,
        TAKEOVER_PARAM,
        PHONE_LOCK_NAME,
        EXIT_KEY,
        dockAttributes,
        buildDockScriptTag,
        buildDockLoaderHtml
    };
});
