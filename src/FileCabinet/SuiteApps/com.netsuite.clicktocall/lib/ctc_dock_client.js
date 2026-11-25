/**
 * Telephony Dock — browser-side script (NOT a SuiteScript module).
 *
 * Mounted by a <script src> tag from lib/ctc_dock.js (buildDockScriptTag) on
 * record pages and in the phone mode shell, or by the portlet loader
 * (buildDockLoaderHtml) on the dashboard. The call lives only in the shell's
 * #ctc-phone-frame (the "anchor"). The dock mirrors the anchor's snapshots
 * over BroadcastChannel and sends requests back. It holds no audio and never
 * changes call state itself. No popup window anywhere.
 *
 * One file, three modes (picked once at load):
 *   shell   - top page is the shell (window.__ctcShell is set before this
 *             script). Pill + dialer panel (ctc_dock_dialer.js).
 *   frame   - a NetSuite page inside the shell. Draws nothing. The record's
 *             Call button goes to top.__ctcShell.call(ctx). An SPA page
 *             names a new record with window.__ctcDock.setContext(ctx).
 *   outside - a normal NetSuite tab. Another tab holds the phone (Web Lock
 *             'ctc-phone-anchor'): the same pill + dialer panel as the
 *             shell, as a remote control (bus requests; the audio stays in
 *             the phone tab). No tab holds it: an "Open phone" chip, which
 *             moves this tab into the shell. Nothing at all for a user the
 *             phone is not enabled for (localStorage NOT_ENABLED_KEY).
 *
 * The pill sits on one of eight edge points; the point is shared by every
 * tab through localStorage. In the shell the dialer panel registers through
 * window.__ctcDock.host.registerPanel() (shell and outside modes; outside it
 * shows only while another tab holds the phone) and opens on the pill's point, one
 * fixed size for every view (PANEL_W x PANEL_H, the Search view's full
 * size). Pill and panel are one unit: dragging the panel's header snaps it
 * to one of the same eight points, and the pill comes back there. On the
 * left and right middle points (ml, mr) the pill stands vertical.
 *
 * Inbound ring (phase 'incoming'), panel closed: the incoming card (Answer /
 * Decline) rises out of the pill (above it on the bottom row, below it on the
 * top row, beside it on ml / mr); the pill itself only says "Ringing". The
 * shell and remote tabs both draw it. With the panel open, the panel's ring
 * view takes its place. Under the name one hint line (asset 40): "contact ·
 * Last call Nov 12" (the date from the dialer's call context once loaded:
 * host.ringContext) or "Not in NetSuite".
 */
(function () {
    'use strict';

    if (window.__ctcDock) return;

    var LOCK_NAME = 'ctc-phone-anchor';  // PHONE_LOCK_NAME in lib/ctc_dock.js
    var EXIT_KEY = 'ctc-phone-exit';     // EXIT_KEY in lib/ctc_dock.js
    // localStorage: '1' while the phone is not enabled for this user
    // (snapshot error.kind 'not_enabled'); NOT_ENABLED_AT_KEY holds the epoch
    // ms it was set. Expires after NOT_ENABLED_TTL_MS; cleared when a token
    // works. While set, outside tabs draw nothing and never auto-enter.
    var NOT_ENABLED_KEY = 'ctc-phone-not-enabled';
    var NOT_ENABLED_AT_KEY = 'ctc-phone-not-enabled-at';
    var NOT_ENABLED_TTL_MS = 24 * 60 * 60 * 1000;

    var script = document.currentScript;
    var attr = function (name, fallback) {
        return (script && script.getAttribute(name)) || fallback;
    };
    var cfg = {
        bus: attr('data-bus', 'ctc-bus'),
        shellUrl: attr('data-shell-url', ''),
        autoEnter: attr('data-auto-enter', '') === '1',
        restletUrl: attr('data-restlet-url', ''),
        // The record this page shows, if any (empty on the dashboard).
        context: normalizeContext({
            entityId: attr('data-entity-id', ''),
            entityName: attr('data-entity-name', ''),
            entityType: attr('data-entity-type', ''),
            phone: attr('data-phone', '')
        })
    };

    // Plain copy of a record context; null when it names no record or number.
    function normalizeContext(c) {
        if (!c || typeof c !== 'object') return null;
        var out = {
            entityId: String(c.entityId || ''),
            entityName: String(c.entityName || ''),
            entityType: String(c.entityType || ''),
            phone: String(c.phone || '')
        };
        return out.entityId || out.phone ? out : null;
    }

    function shellObject() {
        try { return window.top.__ctcShell || null; } catch (e) { return null; }
    }

    var mode = 'outside';
    if (window.top === window && window.__ctcShell) mode = 'shell';
    else if (window.top !== window && shellObject()) mode = 'frame';

    // NetSuite popup windows (address editor, item lookups, print) are small
    // helper windows opened by a page: no pill there, and never move one into
    // the shell.
    if (mode === 'outside' && window.opener && window.opener !== window) return;

    // Address of this page inside the shell.
    function shellHref() {
        var sep = cfg.shellUrl.indexOf('?') === -1 ? '?' : '&';
        return cfg.shellUrl + sep + 'u=' + encodeURIComponent(location.pathname + location.search);
    }

    function goShell() {
        if (!cfg.shellUrl) return;
        try { window.sessionStorage.removeItem(EXIT_KEY); } catch (e) { /* storage blocked */ }
        window.top.location.href = shellHref();
    }

    // --- Phone not enabled for this user (outside tabs, dashboard loader) ---
    function notEnabledFlag() {
        try {
            var ls = window.localStorage;
            if (ls.getItem(NOT_ENABLED_KEY) !== '1') return false;
            var at = Number(ls.getItem(NOT_ENABLED_AT_KEY));
            if (at > 0 && Date.now() - at < NOT_ENABLED_TTL_MS) return true;
            ls.removeItem(NOT_ENABLED_KEY);
            ls.removeItem(NOT_ENABLED_AT_KEY);
        } catch (e) { /* storage blocked */ }
        return false;
    }

    function setNotEnabledFlag(on) {
        try {
            var ls = window.localStorage;
            if (on) {
                if (ls.getItem(NOT_ENABLED_KEY) === '1' && notEnabledFlag()) return;
                ls.setItem(NOT_ENABLED_KEY, '1');
                ls.setItem(NOT_ENABLED_AT_KEY, String(Date.now()));
            } else if (ls.getItem(NOT_ENABLED_KEY) !== null) {
                ls.removeItem(NOT_ENABLED_KEY);
                ls.removeItem(NOT_ENABLED_AT_KEY);
            }
        } catch (e) { /* storage blocked */ }
    }

    // --- Frame mode: silent. The shell draws the one pill. ---
    if (mode === 'frame') {
        window.__ctcRecordContext = cfg.context;
        window.__ctcDock = {
            mode: 'frame',
            call: function () {
                var shell = shellObject();
                if (shell && typeof shell.call === 'function') shell.call(cfg.context);
            },
            // A page that changes record without reloading (an SPA) names
            // the record it now shows; the shell's dialer follows it as it
            // does a record page load. Record pages never call it.
            setContext: function (ctx) {
                cfg.context = normalizeContext(ctx);
                window.__ctcRecordContext = cfg.context;
                var shell = shellObject();
                if (shell && typeof shell.syncContext === 'function') shell.syncContext(window);
            }
        };
        return;
    }

    if (typeof BroadcastChannel === 'undefined') {
        // No bus: nothing to mirror. Outside the shell the Call button still
        // moves the tab into phone mode.
        if (mode === 'outside') window.__ctcDock = { mode: 'outside', call: goShell };
        return;
    }

    if (mode === 'shell' && window.__ctcShell.context) {
        cfg.context = normalizeContext(window.__ctcShell.context);
    }

    // Eight snap points around the screen edge: row t/m/b + column l/c/r,
    // minus the screen centre. Default: bottom centre. New key, so docks saved
    // under the old four-corner key ('ctc-dock') start at the default again.
    var CORNER_KEY = 'ctc-dock-pos';
    var CORNERS = ['tl', 'tc', 'tr', 'ml', 'mr', 'bl', 'bc', 'br'];
    var DEFAULT_CORNER = 'bc';
    // This SuiteApp's SPA pages (lib/ctc_dock.js SPA_PATH_PREFIX): their
    // content runs edge to edge, so on arriving there the pill goes to the
    // bottom row (finding #99): a side or top point shows as the bottom
    // point on its side. A drag or arrow key there puts it anywhere again
    // (user, 2026-11-25: the bottom is only the default on arrival).
    var SPA_PATH_PREFIX = '/spa-app/com.netsuite.clicktocall/';
    // Sales Central's SPA URL (custspa_ctc_sales_central <url>).
    var SALES_CENTRAL_PATH = SPA_PATH_PREFIX + 'sales-central';
    var PANEL_W = 380;
    // One panel height for every view: the Search view at full size. Views
    // that need less leave room at the bottom; views that need more scroll.
    var PANEL_H = 682;
    var EDGE = 16;
    var BOTTOM_GAP = 24; // bottom row sits a little higher than the side margin
    var DRAG_THRESHOLD = 4;
    var FLICK_SPEED = 0.11; // px/ms
    var FLICK_PROJECT_MS = 200;
    var SETTLE = '300ms cubic-bezier(0.32, 0.72, 0, 1)';
    var SETTLE_MS = 320; // SETTLE plus a frame
    var RUBBER = 0.3; // past the screen edge a dragged panel moves at 0.3 of the pointer, slowing to a stop
    var LIFT = 0.02; // lifted panel: scale 1.02
    var ENTER_MS = 260;
    var REDUCED_MS = 150; // reduced motion: opacity only, <= 150 ms (DESIGN.md §3)
    var ENTER_EASE = 'cubic-bezier(0.23, 1, 0.32, 1)';
    var ENTER_SHIFT = 6; // px the pill travels in from its edge
    var PANEL_FADE_MS = 200;
    // Incoming card: the pill morphs into it (A1, 2026-11-01; asset 45,
    // finding #86: "shared parts + spring"). The window grows on a spring
    // (INC_SPRING_DAMPING, a tiny settle, no visible tail); the pill's dot
    // and Answer travel into the card's; the name and Decline fade in out of
    // a INC_BLUR_PX blur from INC_CONTENT_AT of the enter, over
    // INC_CONTENT_SPAN, INC_CONTENT_STAGGER apart. Exit: the words go in
    // INC_WORDS_OUT_MS, the window and the shared parts return on the settle
    // curve. INC_RADIUS: the open card's corners.
    var INC_ENTER_MS = 520;
    var INC_EXIT_MS = 220;
    var INC_REDUCED_MS = 120;
    var INC_CONTENT_AT = 0.12;
    var INC_CONTENT_SPAN = 0.55;
    var INC_CONTENT_STAGGER = 0.06;
    var INC_BLUR_PX = 4;
    var INC_WORDS_OUT_MS = 90;
    var INC_SPRING_DAMPING = 0.8;
    var INC_RADIUS = 16;
    var INC_SHADOW = '0 10px 24px rgba(15,27,48,0.26)';
    // The open window of the morph: the card plus 32 px all round (radius
    // 48), so the card's shadow shows as the morph ends.
    var INC_OUTSET = 32;
    var INC_OUTSET_RADIUS = 48;
    // Pill size change between stages: FLIP on the compositor (fitPill).
    var PILL_EASE_MS = 200;
    var PILL_EASE = 'ease-out';
    // Morph stacks (morphStack): nine pieces, painted centre, edges, corners.
    // Each piece is a [column, row] cell of the box: l / c / r x t / c / b.
    var PIECES = { c: ['c', 'c'], t: ['c', 't'], b: ['c', 'b'], l: ['l', 'c'], r: ['r', 'c'], tl: ['l', 't'], tr: ['r', 't'], bl: ['l', 'b'], br: ['r', 'b'] };
    var PIECE_KEYS = ['c', 't', 'b', 'l', 'r', 'tl', 'tr', 'bl', 'br'];
    var SEAM = 1; // px a surface piece reaches under its outer neighbours (no hairline at the joins)
    // The pill's outer shadow (dark / light surface): y offset, blur and
    // colour. At rest the ::before layer (box-shadow); during a size ease
    // two filled, blurred layers (.v-shade, the same shadow, see morphPill).
    var PILL_SHADE = { y: 10, blur: 24, color: 'rgba(15,27,48,0.26)' };
    var PILL_SHADE_LIGHT = { y: 6, blur: 16, color: 'rgba(22,21,19,0.08)' };
    function shadowCss(sh) { return '0 ' + sh.y + 'px ' + sh.blur + 'px ' + sh.color; }
    var PILL_SHADOW = shadowCss(PILL_SHADE);
    var PILL_SHADOW_LIGHT = shadowCss(PILL_SHADE_LIGHT);
    var HELLO_TIMEOUT_MS = 600;
    // The phone in another tab (a remote control): that tab may be in the
    // background, where the browser slows it. Wait longer before "offline".
    var REMOTE_HELLO_TIMEOUT_MS = 2000;
    // Bus contract (lib/ctc_dock.js): BUS_MIN_VERSION, COALESCE_MS,
    // REQUEST_QUEUE_MS, UI_STATE_KEY, UI_STATE_VERSION.
    var BUS_MIN_VERSION = 1;
    var COALESCE_MS = 1000;
    var REQUEST_QUEUE_MS = 2000;
    var UI_KEY = 'ctc-dock-ui';
    var UI_VERSION = 1;
    var UI_VIEWS = { dial: 1, search: 1, recents: 1, call: 1 };
    var NOT_READY_TEXT = 'The phone is not ready yet. Try again.';
    // Shell: the phone frame loads after the dock. While it boots (up to
    // this long) a silent bus means "starting", not "offline".
    var SHELL_BOOT_MS = 15000;
    var PING_INTERVAL_MS = 15000;
    // Wrap-up: how long the pill says "Call ended" (with Call back) after a call.
    var WRAP_MS = 8000;
    // Live call phases the pill treats as "on a call" (incoming has its own
    // view; answering has its own pill: "Connecting…", no action).
    var ACTIVE = { dialing: true, ringing: true, answering: true, connected: true, reconnecting: true };
    // Talking: Mute and the keypad work.
    var TALKING = { connected: true, reconnecting: true };
    // Phone colour tokens (DESIGN.md §1). Buttons use go / stop; dots on
    // the dark surface use goDot / stopDot. Answer is always go.
    var T = {
        go: '#436B1D', goHover: '#385A18',
        stop: '#B3311F', stopHover: '#9A2A1B',
        goDot: '#8AC94F', stopDot: '#FF9D90',
        ring: '#6FB6D3', amber: '#F4C76A', wrap: '#B6A3D9', offline: '#8B8780'
    };
    // '#RRGGBB' + alpha -> 'rgba(r,g,b,a)' (halos and coloured shadows).
    function rgba(hex, a) {
        var n = parseInt(hex.slice(1), 16);
        return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
    }
    // The v2.1 dark phone surface (DESIGN.md §3): 3 px grain, coral bloom
    // at bottom right, teal glows, navy gradient. Static (never animated).
    var SURFACE = 'radial-gradient(rgba(255,255,255,0.035) 1px,transparent 1.2px) 0 0/3px 3px,'
        + 'radial-gradient(55% 40% at 96% 100%,rgba(229,132,98,0.20),transparent 70%),'
        + 'radial-gradient(110% 75% at 100% 0%,rgba(4,83,111,0.80),rgba(4,83,111,0) 62%),'
        + 'radial-gradient(80% 50% at 0% 100%,rgba(47,143,179,0.14),transparent 70%),'
        + 'linear-gradient(180deg,#1C3344 0%,#15283A 55%,#11203A 100%)';
    var MISSED_DOT = T.stopDot; // missed: the stop dot on dark (DESIGN.md §1)
    var AMBER = T.amber;
    var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');

    // Markup of one morph stack (morphStack): nine clipped pieces, each with
    // a full-size fill.
    function stackHtml(cls) {
        return '<div class="ms ' + cls + '" aria-hidden="true">'
            + PIECE_KEYS.map(function (k) { return '<div class="mp" data-p="' + k + '"><i></i></div>'; }).join('')
            + '</div>';
    }

    var ICON_PHONE = '<path d="M2 5.5C2 3.6 3.6 2 5.5 2h1.3c.9 0 1.7.6 1.9 1.5l1 4c.2.8-.1 1.6-.8 2.1l-1.5 1.1a12 12 0 0 0 5.9 5.9l1.1-1.5c.5-.7 1.3-1 2.1-.8l4 1c.9.2 1.5 1 1.5 1.9v1.3c0 1.9-1.6 3.5-3.5 3.5A16.5 16.5 0 0 1 2 5.5z"></path>';
    var ICON_MIC = '<rect x="9" y="2" width="6" height="12" rx="3"></rect><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3"></path>';
    var ICON_RETRY = '<path d="M3 12a9 9 0 1 0 2.6-6.4L3 8M3 3v5h5"></path>';
    var ICON_MIC_OFF = '<path d="M2 2l20 20M9 9v3a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.9-.6M19 10v2a7 7 0 0 1-.6 2.8M5 10v2a7 7 0 0 0 12 5M12 19v3"></path>';

    var CSS = [
        ':host{all:initial}',
        '*{box-sizing:border-box}',
        '.dock{position:fixed;left:0;top:0;pointer-events:auto;font-family:"Oracle Sans","Helvetica Neue",Helvetica,Arial,sans-serif;color:#FFFFFF;-webkit-font-smoothing:antialiased}',
        // Author display rules beat the UA [hidden] rule, so restate it.
        '[hidden]{display:none !important}',
        'button{font:inherit;color:inherit;margin:0;border:0;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:transform 140ms ease-out,background-color 140ms ease-out}',
        'button:active{transform:scale(0.97)}',
        'button:focus-visible{outline:2px solid ' + T.ring + ';outline-offset:2px}',
        '.navy{background:' + SURFACE + ';border:1px solid rgba(255,255,255,0.07)}',
        '.dot{width:7px;height:7px;border-radius:999px;flex-shrink:0;background:var(--dot,#94A6BF)}',
        '.mono{font-family:"SF Mono","JetBrains Mono",Menlo,Consolas,monospace;font-variant-numeric:tabular-nums}',

        /* pill: one component in two shapes. Horizontal (R5) on six points:
           grip, dot, words, timer, Mute, main button in a row. Vertical (R4)
           on the left/right middle points (ml, mr): the same parts in a
           column, no words (labels live in title + aria-label). */
        /* The pill's outer shadow is two pre-rendered layers (::before at
           rest, ::after deeper while lifted) that swap by opacity: no
           box-shadow change. isolation: the layers, the morph stacks and
           the ring layers (z-index -1) sit above the pill's own surface and
           under its content. */
        '.vchip{position:relative;isolation:isolate;display:flex;align-items:center;gap:10px;border-radius:26px;box-shadow:inset 0 1px 0 rgba(255,255,255,0.06);touch-action:none;user-select:none;-webkit-user-select:none}',
        '.vchip::before,.vchip::after{content:"";position:absolute;inset:-1px;border-radius:inherit;pointer-events:none;z-index:-1}',
        '.vchip::before{box-shadow:' + PILL_SHADOW + '}',
        '.vchip::after{box-shadow:0 16px 36px rgba(15,27,48,0.32);opacity:0}',
        '.dock:not(.vert) .vchip{flex-direction:row;height:52px;padding:0 6px 0 14px}',
        '.dock.vert .vchip{flex-direction:column;width:52px;padding:10px 0}',
        '.dock.lifted .vchip::before,.vchip.morph::before{opacity:0}',
        '.dock.lifted .vchip::after{opacity:1}',
        /* morph stacks (FLIP, see morphStack): hidden at rest; while a size
           or shape change runs the element's own surface steps aside and
           the stacks draw it */
        '.ms{position:absolute;left:0;top:0;width:0;height:0;z-index:-1;pointer-events:none;display:none}',
        '.morph>.ms{display:block}',
        '.mp{position:absolute;overflow:hidden}',
        '.morph .mp,.morph .mp>i{will-change:transform}',
        '.mp>i{position:absolute;display:block;box-sizing:border-box}',
        '.v-shade{position:absolute;z-index:-1;pointer-events:none;display:none}',
        '.morph>.v-shade{display:block;will-change:opacity}',
        '.vchip.morph,.inc.morph{background:transparent !important;border-color:transparent !important;box-shadow:none !important}',
        '.v-body{display:flex;align-items:center;gap:10px;padding:0;border-radius:12px;background:transparent;text-align:left}',
        '.dock:not(.vert) .v-body{flex-direction:row;height:40px;min-width:0}',
        '.dock.vert .v-body{flex-direction:column;width:40px}',
        '.v-body:active{transform:none}',
        '.v-grip{display:grid;grid-template-columns:3px 3px;gap:2px;flex-shrink:0}',
        '.v-grip i{width:3px;height:3px;border-radius:999px;background:rgba(255,255,255,0.28)}',
        '.v-dot{width:8px;height:8px;border-radius:999px;flex-shrink:0;background:var(--dot,#94A6BF)}',
        /* halo: a 3 px ring at .20 of the dot colour, only while live
           (data-live: calling, ringing, connected, muted, reconnecting,
           incoming). Ready and Starting have none. */
        '.vchip[data-live="true"] .v-dot{box-shadow:0 0 0 3px ' + rgba(T.amber, 0.20) + '}',
        /* missed calls: coral count badge on the dot (vertical pill only;
           the horizontal pill says "N missed") */
        '.v-dot{position:relative}',
        '.v-count{position:absolute;top:-5px;left:-5px;min-width:18px;height:18px;padding:0 4px;border-radius:999px;background:' + MISSED_DOT + ';color:#11203A;font-size:12px;font-weight:700;line-height:18px;text-align:center;box-shadow:0 0 0 2px #15283A}',
        '.dock:not(.vert) .v-count{display:none}',
        '.vchip[data-live="true"][data-stage="connected"] .v-dot{box-shadow:0 0 0 3px ' + rgba(T.goDot, 0.20) + '}',
        '.vchip[data-muted="true"] .v-dot{background:' + T.amber + '}',
        '.vchip[data-live="true"][data-muted="true"] .v-dot{box-shadow:0 0 0 3px ' + rgba(T.amber, 0.20) + '}',
        '.vchip[data-stage="starting"] .v-dot{animation:ctc-breathe 1.2s ease-in-out infinite alternate}',
        '@keyframes ctc-breathe{from{opacity:0.4}to{opacity:1}}',
        /* incoming: a soft ring (T.ring) that grows out of the dot and fades
           (ease-out), so ringing reads apart from a green connected call.
           Only the dot moves; reduced motion keeps a still halo. */
        /* The ring is a disc under the dot (8 px, ring colour at .55) that
           scales to 20 px and fades: transform and opacity only. While it
           runs the still halo steps aside. Ring rule (DESIGN.md §3, asset
           41): every ring ends 6 px beyond its element, 1.6 s loop. */
        '.vchip[data-live="true"][data-stage="incoming"] .v-dot{box-shadow:none}',
        '.v-dot::before{content:"";position:absolute;inset:0;border-radius:inherit;background:' + rgba(T.ring, 0.55) + ';opacity:0;z-index:-1;pointer-events:none}',
        '.vchip[data-live="true"][data-stage="incoming"] .v-dot::before{animation:ctc-ring 1.6s cubic-bezier(0.23,1,0.32,1) infinite}',
        '@keyframes ctc-ring{0%{transform:scale(1);opacity:1}70%,100%{transform:scale(2.5);opacity:0}}',
        /* calling (dialing, ringing out): the halo breathes out of the dot.
           The same disc as the ring, in amber, grows 8 -> 20 px (the ring
           rule) and fades, 1.6 s: transform and opacity only. While
           it runs the still halo steps aside; reduced motion keeps it. */
        '.vchip[data-live="true"][data-stage="dialing"] .v-dot,.vchip[data-live="true"][data-stage="ringing"] .v-dot{box-shadow:none}',
        '.vchip[data-live="true"][data-stage="dialing"] .v-dot::before,.vchip[data-live="true"][data-stage="ringing"] .v-dot::before{background:' + rgba(T.amber, 0.45) + ';animation:ctc-halo 1.6s cubic-bezier(0.23,1,0.32,1) infinite}',
        '@keyframes ctc-halo{0%{transform:scale(1);opacity:1}70%,100%{transform:scale(2.5);opacity:0}}',
        /* each shape shows only its own words / timer */
        '.dock.vert .h-words,.dock.vert .h-time,.dock:not(.vert) .v-time{display:none}',
        '.h-words{display:flex;flex-direction:column;justify-content:center;min-width:0;max-width:168px}',
        '.h-l1,.h-l2{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
        '.h-l1{font-size:13px;font-weight:600;line-height:16px;color:#FFFFFF}',
        '.h-l2{font-size:12px;line-height:16px;color:#94A6BF}',
        '.h-l2.muted,.h-l1.amber,.h-l2.amber{color:#F4C76A}',
        '.h-time{flex-shrink:0;font-family:"SF Mono","JetBrains Mono",Menlo,Consolas,monospace;font-size:13px;font-weight:300;font-variant-numeric:tabular-nums;line-height:1;white-space:nowrap;color:#FFFFFF}',
        '.v-time{display:flex;flex-direction:column;align-items:center;font-family:"JetBrains Mono","SF Mono",Menlo,Consolas,monospace;font-size:13px;font-weight:300;font-variant-numeric:tabular-nums;line-height:1;color:#FFFFFF}',
        '.v-sep{font-size:7px;color:#94A6BF}',
        '.v-mute{width:36px;height:36px;border-radius:12px;background:rgba(255,255,255,0.10);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}',
        '.v-mute:hover{background:rgba(255,255,255,0.18)}',
        // Unmute: a glass amber tile (DESIGN.md §3): amber wash, 1 px inset
        // amber ring (no layout shift), amber icon.
        '.v-mute[aria-pressed="true"]{background:' + rgba(T.amber, 0.16) + ';box-shadow:inset 0 0 0 1px ' + T.amber + '}',
        '.v-mute[aria-pressed="true"] svg{stroke:' + T.amber + '}',
        '.v-main{width:40px;height:40px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}',
        '.v-main.call{background:' + T.go + ';box-shadow:0 4px 12px ' + rgba(T.go, 0.36) + '}',
        // Wrap-up: Call back, the same go button.
        '.v-main.callback{background:' + T.go + ';box-shadow:0 4px 12px ' + rgba(T.go, 0.36) + '}',
        // Ringing: the Answer button (go) wears a ring orb that pulses out.
        // The orb: a disc under the button (goDot at .55) that scales from
        // 40 to 52 px (the ring rule: 6 px beyond) and fades, over the still drop
        // shadow (::before). Transform and opacity only.
        '.v-main.answer{position:relative;background:' + T.go + '}',
        '.v-main.answer::before,.v-main.answer::after{content:"";position:absolute;inset:0;border-radius:inherit;z-index:-1;pointer-events:none}',
        '.v-main.answer::before{box-shadow:0 4px 12px ' + rgba(T.go, 0.36) + '}',
        '.v-main.answer::after{background:' + rgba(T.goDot, 0.55) + ';opacity:0;animation:ctc-orb 1.6s cubic-bezier(0.23,1,0.32,1) infinite}',
        '@keyframes ctc-orb{0%{transform:scale(1);opacity:1}70%,100%{transform:scale(1.3);opacity:0}}',
        // Pressed (scale 0.97 makes the button its own layer, so the disc
        // would draw over its face): no orb while held.
        '.v-main.answer:active::after{visibility:hidden}',
        '.v-main.end{background:' + T.stop + ';box-shadow:0 4px 12px ' + rgba(T.stop, 0.40) + '}',
        '.v-main.end:hover{background:' + T.stopHover + '}',
        // End is the Call glyph rotated 135 deg: the turn eases (transform, 150 ms).
        '.v-main svg{transition:transform 150ms cubic-bezier(0.23,1,0.32,1)}',
        '.v-main.end svg{transform:rotate(135deg)}',
        '.v-main.offline{background:#F4F2EE}',
        '.v-main.retry{background:#FCE9E7}',
        /* disabled slot: a stage with no action (Starting, Calling paused,
           no-dialer idle) keeps the 40 px main slot, so the pill never
           shrinks to a nub. Not a control: aria-hidden, out of the tab
           order, and presses fall through to the pill body. */
        '.v-main.disabled{background:rgba(255,255,255,0.10);cursor:default;pointer-events:none}',
        '.v-main.disabled .ico-call{display:block;opacity:0.45}',
        '.vchip.light .v-main.disabled{background:#F1EFED}',
        '.vchip.light .v-main.disabled .ico-call{fill:' + T.offline + ';opacity:1}',
        '.v-ico{display:none}',
        '.v-main.call .ico-call,.v-main.callback .ico-call,.v-main.answer .ico-call,.v-main.end .ico-call,.v-main.offline .ico-offline,.v-main.retry .ico-retry{display:block}',
        /* offline / error: light pill */
        '.vchip.light{background:#FFFFFF;border:1px solid #E5E2DD;box-shadow:none}',
        '.vchip.light::before{box-shadow:' + PILL_SHADOW_LIGHT + '}',
        '.vchip.light .v-grip i{background:#D9D5CF}',
        '.vchip.light.err{border-color:#F2C4BD}',
        '.vchip.light.err .v-grip i{background:#E5D3D0}',
        '.vchip.light .h-l1{color:#161513}',
        '.vchip.light .h-l2{color:#5C5955}',
        '.vchip.light.err .h-l1{color:#9A2A23}',
        /* incoming card: rises out of the pill (placed by script with
           translate; the enter / exit morph runs on transform + opacity,
           WAAPI, see animateIncoming). Row: sky dot, caller text, Decline,
           Answer. The outer shadow is a layer (.inc-shade) that fades in
           as the morph's window opens past the card. */
        '.inc{position:fixed;left:0;top:0;isolation:isolate;width:320px;max-width:calc(100vw - 32px);display:flex;align-items:center;gap:12px;padding:12px 12px 12px 16px;border-radius:' + INC_RADIUS + 'px;color:#FFFFFF;pointer-events:auto;font-family:"Oracle Sans","Helvetica Neue",Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;box-shadow:inset 0 1px 0 rgba(255,255,255,0.06);touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab}',
        '.inc.lifted{scale:' + (1 + LIFT) + ';cursor:grabbing}',
        '.inc-shade{position:absolute;inset:-1px;border-radius:inherit;box-shadow:' + INC_SHADOW + ';z-index:-1;pointer-events:none}',
        '.inc-dot{width:8px;height:8px;border-radius:999px;flex-shrink:0;background:' + T.ring + '}',
        '.inc-text{flex:1;min-width:0;display:flex;flex-direction:column}',
        '.inc-label{font-size:12px;font-weight:500;line-height:16px;color:#9FC9EE}',
        '.inc-name{margin-top:2px;font-size:15px;font-weight:600;line-height:20px;letter-spacing:-0.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
        '.inc-name.mono{font-family:"SF Mono","JetBrains Mono",Menlo,Consolas,monospace;font-weight:500;font-variant-numeric:tabular-nums;letter-spacing:0}',
        '.inc-sub{margin-top:1px;font-size:12px;line-height:16px;color:#B2C0D3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
        '.inc-acts{display:flex;gap:8px;flex-shrink:0}',
        '.inc-btn{width:36px;height:36px;border-radius:999px;padding:0;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}',
        '.inc-decline{background:' + T.stop + ';box-shadow:0 4px 12px ' + rgba(T.stop, 0.40) + '}',
        '.inc-decline:hover{background:' + T.stopHover + '}',
        '.inc-decline svg{transform:rotate(135deg)}',
        '.inc-answer{background:' + T.go + ';box-shadow:0 4px 12px ' + rgba(T.go, 0.36) + '}',
        // The card's Answer pulses like the pill's (ring rule: 36 -> 48 px).
        '.inc-answer{position:relative}',
        '.inc-answer::after{content:"";position:absolute;inset:0;border-radius:inherit;z-index:-1;pointer-events:none;background:' + rgba(T.goDot, 0.55) + ';opacity:0;animation:ctc-orb-card 1.6s cubic-bezier(0.23,1,0.32,1) infinite}',
        '.inc-answer:active::after{visibility:hidden}',
        '@keyframes ctc-orb-card{0%{transform:scale(1);opacity:1}70%,100%{transform:scale(1.333);opacity:0}}',
        '.inc-answer:hover{background:' + T.goHover + '}',
        /* screen-reader-only live regions */
        '.sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}',

        /* card */
        '.card{width:300px;border-radius:28px;overflow:hidden;box-shadow:inset 0 1px 0 rgba(255,255,255,0.06),0 1px 1px rgba(0,0,0,0.08),0 16px 40px rgba(15,27,48,0.28);transition:opacity 200ms cubic-bezier(0.23,1,0.32,1),transform 200ms cubic-bezier(0.23,1,0.32,1)}',
        '.card.closed{opacity:0;transform:scale(0.96)}',
        '.card-top{width:100%;padding:14px 16px;display:flex;align-items:center;gap:12px;background:transparent;text-align:left;border-radius:0}',
        '.card-top:active{transform:none}',
        // The other side: the person icon, never initials (DESIGN.md §4, asset 33).
        '.avatar{width:36px;height:36px;border-radius:999px;background:transparent;color:#94A6BF;display:flex;align-items:center;justify-content:center;flex-shrink:0}',
        '.who{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}',
        '.who-name{font-size:14px;font-weight:600;letter-spacing:-0.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
        '.who-sub{font-size:12px;color:#94A6BF;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
        '.card-time{font-size:15px;font-weight:300}',
        '.card-bar{padding:10px 16px 12px;border-top:1px solid rgba(255,255,255,0.06);background:rgba(0,0,0,0.12);display:flex;align-items:center;gap:8px}',
        '.pill{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;font-size:12px;color:var(--dot,#94A6BF);background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08)}',
        '.pill .dot{width:6px;height:6px}',
        '.spacer{flex:1}',
        '.key{width:36px;height:36px;border-radius:12px;background:rgba(255,255,255,0.10);display:inline-flex;align-items:center;justify-content:center}',
        '.key:hover{background:rgba(255,255,255,0.18)}',
        '.key[aria-pressed="true"]{background:' + rgba(T.amber, 0.16) + ';box-shadow:inset 0 0 0 1px ' + T.amber + '}',
        '.key[aria-pressed="true"] svg{stroke:' + T.amber + '}',
        '.key.end{background:' + T.stop + '}',
        '.key.end:hover{background:' + T.stopHover + '}',
        '.key[disabled]{opacity:0.4;cursor:default}',

        /* dialer panel (.card.dl, ctc_dock_dialer.js) while dragged: the open /
           close fade keeps transform; the drag moves translate and lifts with
           scale (1.02, eased in) and a deeper shadow: .dl-lift, a
           pre-rendered shadow layer under the panel that follows its box,
           fades in (opacity) and scales with it. .settling glides translate
           to the snap point. */
        '.card.dl{transition:opacity 200ms cubic-bezier(0.23,1,0.32,1),transform 200ms cubic-bezier(0.23,1,0.32,1),scale 140ms ease-out}',
        '.card.dl.settling{transition:opacity 200ms cubic-bezier(0.23,1,0.32,1),transform 200ms cubic-bezier(0.23,1,0.32,1),scale 140ms ease-out,translate ' + SETTLE + '}',
        '.card.dl.lifted{scale:' + (1 + LIFT) + '}',
        '.card.dl.lifted,.card.dl.settling,.dl-lift.lifted,.dl-lift.settling{will-change:translate,scale,opacity}',
        '.dl-lift{position:fixed;left:0;top:0;border-radius:28px;pointer-events:none;opacity:0;box-shadow:0 24px 56px rgba(15,27,48,0.16);transition:opacity 140ms ease-out,scale 140ms ease-out}',
        '.dl-lift.settling{transition:opacity 140ms ease-out,scale 140ms ease-out,translate ' + SETTLE + '}',
        '.dl-lift.lifted{opacity:1;scale:' + (1 + LIFT) + '}',
        '@media (prefers-reduced-motion: reduce){.card,.card.dl,button{transition:opacity 150ms linear}.card.closed{transform:none}button:active{transform:none}.v-main svg{transition:none}.vchip .v-dot,.v-dot::before,.v-main.answer::after,.inc-answer::after{animation:none}.vchip[data-live="true"][data-stage="incoming"] .v-dot{box-shadow:0 0 0 3px ' + rgba(T.ring, 0.20) + '}.vchip[data-live="true"][data-stage="dialing"] .v-dot,.vchip[data-live="true"][data-stage="ringing"] .v-dot{box-shadow:0 0 0 3px ' + rgba(T.amber, 0.20) + '}.v-main.answer::before{box-shadow:0 0 0 3px ' + rgba(T.goDot, 0.35) + '}}'
    ].join('\n');

    var HTML = ''
        + '<div class="dock" hidden>'
        +   '<div class="vchip navy">'
        +     '<span class="v-shade" aria-hidden="true"></span><span class="v-shade" aria-hidden="true"></span>' + stackHtml('v-surf')
        +     '<button type="button" class="v-body">'
        +       '<span class="v-grip" aria-hidden="true"><i></i><i></i><i></i><i></i></span>'
        +       '<span class="v-dot" aria-hidden="true"><span class="v-count" hidden></span></span>'
        +       '<span class="h-words" aria-hidden="true"><span class="h-l1"></span><span class="h-l2"></span></span>'
        +       '<span class="h-time" aria-hidden="true"></span>'
        +       '<span class="v-time" aria-hidden="true"><span class="v-mm"></span><span class="v-sep">·</span><span class="v-ss"></span></span>'
        +     '</button>'
        +     '<button type="button" class="v-mute" aria-label="Mute" aria-pressed="false">'
        +       '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON_MIC + '</svg>'
        +     '</button>'
        +     '<button type="button" class="v-main call">'
        +       '<svg class="v-ico ico-call" width="16" height="16" viewBox="0 0 24 24" fill="#FFFFFF" aria-hidden="true">' + ICON_PHONE + '</svg>'
        +       '<svg class="v-ico ico-offline" width="16" height="16" viewBox="0 0 24 24" fill="#345D7E" aria-hidden="true">' + ICON_PHONE + '</svg>'
        +       '<svg class="v-ico ico-retry" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9A2A23" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON_RETRY + '</svg>'
        +     '</button>'
        +   '</div>'
        +   '<div class="card navy closed" role="region" aria-label="Current call">'
        +     '<button type="button" class="card-top" aria-label="Collapse call card">'
        +       '<span class="avatar" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path></svg></span>'
        +       '<span class="who"><span class="who-name"></span><span class="who-sub"></span></span>'
        +       '<span class="card-time mono"></span>'
        +     '</button>'
        +     '<div class="card-bar">'
        +       '<span class="pill"><span class="dot"></span><span class="pill-label"></span></span>'
        +       '<span class="spacer"></span>'
        +       '<button type="button" class="key mute" aria-label="Mute" aria-pressed="false">'
        +         '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON_MIC + '</svg>'
        +       '</button>'
        +       '<button type="button" class="key end" aria-label="End call">'
        +         '<svg width="16" height="16" viewBox="0 0 24 24" fill="#FFFFFF" aria-hidden="true" style="transform:rotate(135deg)">' + ICON_PHONE + '</svg>'
        +       '</button>'
        +     '</div>'
        +   '</div>'
        + '</div>'
        // Incoming card: outside .dock (the dock's transform would carry it).
        + '<div class="inc navy" role="alertdialog" aria-label="Incoming call" hidden>'
        +   '<span class="inc-shade" aria-hidden="true"></span>'
        +   stackHtml('inc-surf')
        +   '<span class="inc-dot" aria-hidden="true"></span>'
        +   '<div class="inc-text">'
        +     '<span class="inc-label">Incoming call</span>'
        +     '<span class="inc-name"></span>'
        +     '<span class="inc-sub" hidden></span>'
        +   '</div>'
        +   '<div class="inc-acts">'
        +     '<button type="button" class="inc-btn inc-decline" aria-label="Decline call">'
        +       '<svg width="16" height="16" viewBox="0 0 24 24" fill="#FFFFFF" aria-hidden="true">' + ICON_PHONE + '</svg>'
        +     '</button>'
        +     '<button type="button" class="inc-btn inc-answer" aria-label="Answer call">'
        +       '<svg width="16" height="16" viewBox="0 0 24 24" fill="#FFFFFF" aria-hidden="true">' + ICON_PHONE + '</svg>'
        +     '</button>'
        +   '</div>'
        + '</div>'
        // Live regions stay outside .dock: a hidden dock must still speak.
        + '<div class="sr sr-assertive" role="alert" aria-live="assertive" aria-atomic="true"></div>'
        + '<div class="sr sr-polite" role="status" aria-live="polite" aria-atomic="true"></div>';

    // --- State ---
    var snap = null; // null until the anchor answers (or the hello times out)
    var expanded = false;
    var panel = null; // { el, handle, render(snap), open(opts), focus(what), setContext(ctx) } from ctc_dock_dialer.js
    var bottomOnly = false;
    // The rep moved the pill on this SPA page: their point wins until the
    // next page change.
    var movedOnPage = false;
    var corner = readCorner();
    var pos = { x: 0, y: 0 };
    var drag = null;
    var panelDrag = null;
    var panelLift = null; // the panel's lifted-shadow layer (.dl-lift), made in registerPanel
    var panelSettleTimer = null;
    var panelHideTimer = null;
    var suppressClick = false;
    var panelSuppressClick = false;
    var entering = false; // the pill's entrance runs (no size ease meanwhile)
    var enterTimer = null;
    var gotSnapshot = false; // the anchor (or another tab's) answered at least once
    var mountedAt = 0;
    var timerId = null;
    var orientTimer = null; // pending vertical/horizontal switch after a snap
    // Last settled pill size along its long axis (width when horizontal,
    // height when vertical); 0 = none shown.
    var pillFit = { vert: false, size: 0 };
    // Outside mode: does another tab hold the phone? 'pending' until the
    // first lock query answers; null when the browser has no Web Locks.
    var lockHeld = mode === 'outside' ? 'pending' : false;
    // What a click on the pill does beyond opening: 'unlock' (Turn on
    // phone) | 'signin' (signed out) | ''. pressAction keeps the value seen
    // at pointerdown / keydown: the shell's own gesture listener may unlock
    // audio (and a new snapshot re-render the pill) before the click lands.
    var pillAction = '';
    var pressAction = null;
    // Incoming card: incShown = it shows (or enters); incAnim = the running
    // enter / exit of the card (WAAPI); incSideAnims = its content and pill
    // fades; incDismissed = the ring (callSid) the rep already answered or
    // declined here, so a late 'incoming' snapshot of the same ring does not
    // bring it back.
    var incShown = false;
    var incAnim = null;
    var incSideAnims = [];
    var incDismissed = '';
    // Answer sent from this tab with no panel: the ring (ringKey) whose call
    // card opens, End focused, once the phase is live. '' = none. With a
    // panel the dialer opens on the call and focuses End itself.
    var answeredRing = '';
    // Wrap-up after a call ended (phase back to ready): the call the pill
    // offers to call back for WRAP_MS. null = none. { number, display,
    // entityName, entityId, entityType, seconds, timed }.
    var wrap = null;
    var wrapTimer = null;
    var pillWrap = false; // the pill shows the wrap-up stage now
    // Readiness handshake (bus contract): ready once a working anchor with a
    // compatible bus version answered. Until then requests wait in queue
    // ({ m, at }, at most REQUEST_QUEUE_MS). anchorBus: that anchor's bus
    // version. inflight: requests sent to an anchor that acks (bus 2+) and
    // not acked yet ({ seq, anchor, at }). lastCmd: the last command
    // ({ key, seq, at, anchor }) for COALESCE_MS.
    var ready = false;
    var anchorBus = 0;
    var queue = [];
    var queueTimer = null;
    var inflight = [];
    var lastCmd = null;
    // Shared UI state is being applied (no write back).
    var applyingUi = false;
    var bus = new BroadcastChannel(cfg.bus);

    // --- DOM ---
    var host = document.createElement('div');
    host.setAttribute('data-ctc-dock', '');
    host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483000;';
    var root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<style>' + CSS + '</style>' + HTML;

    var $ = function (sel) { return root.querySelector(sel); };
    var dockEl = $('.dock');
    var vchipEl = $('.vchip');
    var vBody = $('.v-body');
    var hWords = $('.h-words');
    var hL1 = $('.h-l1');
    var hL2 = $('.h-l2');
    var hTime = $('.h-time');
    var vTime = $('.v-time');
    var vMm = $('.v-mm');
    var vSs = $('.v-ss');
    var vMute = $('.v-mute');
    var vMain = $('.v-main');
    var cardEl = $('.card');
    var cardTop = $('.card-top');
    var whoName = $('.who-name');
    var whoSub = $('.who-sub');
    var cardTime = $('.card-time');
    var pillLabel = $('.pill-label');
    var muteBtn = $('.mute');
    var endBtn = $('.key.end');
    var vCount = $('.v-count');
    var incEl = $('.inc');
    var incShade = $('.inc-shade');
    var incSurf = $('.inc-surf');
    var vSurf = $('.v-surf');
    var vShades = root.querySelectorAll('.v-shade'); // [old size, new size]
    // Pill parts that move or fade when the pill changes size (fitPill).
    var pillParts = ['.v-grip', '.v-dot', '.h-words', '.h-time', '.v-time', '.v-mute', '.v-main'].map(function (sel) { return $(sel); });
    var incName = $('.inc-name');
    var incSub = $('.inc-sub');
    var incAnswer = $('.inc-answer');
    var incDecline = $('.inc-decline');
    var incDot = $('.inc-dot');
    var incText = $('.inc-text');
    var vDot = $('.v-dot');
    var srAssertive = $('.sr-assertive');
    var srPolite = $('.sr-polite');

    // --- Helpers ---
    // The snap point: CORNER_KEY (every dock version writes it, so it wins),
    // else the shared UI state's corner.
    function readCorner() {
        try {
            var c = window.localStorage.getItem(CORNER_KEY);
            if (CORNERS.indexOf(c) !== -1) return c;
        } catch (e) { /* storage blocked */ }
        var u = readUi();
        return u && CORNERS.indexOf(u.corner) !== -1 ? u.corner : DEFAULT_CORNER;
    }

    // The page this pill sits over: in the shell, the NetSuite frame's page.
    function pagePath() {
        try {
            if (mode === 'shell') {
                var s = window.__ctcShell;
                return s && typeof s.framePath === 'function' ? String(s.framePath() || '') : '';
            }
            return String(window.location.pathname || '');
        } catch (e) { return ''; }
    }

    function fitCorner(c) {
        return bottomOnly && !movedOnPage && c.charAt(0) !== 'b' ? 'b' + c.charAt(1) : c;
    }

    // Arriving on an SPA page the pill moves to the bottom row; leaving
    // it, back to the saved point.
    function checkPage() {
        var next = pagePath().indexOf(SPA_PATH_PREFIX) === 0;
        if (next === bottomOnly) return;
        bottomOnly = next;
        movedOnPage = false;
        var c = fitCorner(readCorner());
        if (c === corner) return;
        corner = c;
        if (mountedAt) {
            place(true);
            if (expanded) placePanel();
        }
    }

    function onSalesCentral() { return pagePath().indexOf(SALES_CENTRAL_PATH) === 0; }

    // The panel's Sales Central icon (asset 54, finding #104): the shell
    // opens it in the NetSuite frame (a call goes on); elsewhere this tab
    // moves into phone mode on it. With an account loaded, its drawer opens.
    function openSalesCentral(entityId) {
        var id = /^[0-9]{1,12}$/.test(String(entityId || '')) ? String(entityId) : '';
        var path = SALES_CENTRAL_PATH + '#needs' + (id ? '/a/' + id : '');
        if (mode === 'shell') {
            var s = window.__ctcShell;
            if (s && typeof s.openPath === 'function' && s.openPath(path)) return;
        }
        if (cfg.shellUrl) {
            try { window.sessionStorage.removeItem(EXIT_KEY); } catch (e) { /* storage blocked */ }
            var sep = cfg.shellUrl.indexOf('?') === -1 ? '?' : '&';
            window.top.location.href = cfg.shellUrl + sep + 'u=' + encodeURIComponent(path);
            return;
        }
        window.top.location.href = path;
    }

    // The pill (or the panel, which shares its point) moved by the rep.
    function saveCorner(c) {
        if (bottomOnly) movedOnPage = true;
        try { window.localStorage.setItem(CORNER_KEY, c); } catch (e) { /* private mode */ }
        saveUi();
    }

    // --- Shared UI state (localStorage UI_KEY, bus contract) ---
    // { v, open, view, corner, at }. Written when the user opens or closes
    // the panel, picks a tab or moves the dock; applied on load and when the
    // tab becomes visible or gets focus (applyUi), never while the user works
    // here. null when missing, unreadable or of another version.
    function readUi() {
        try {
            var u = JSON.parse(window.localStorage.getItem(UI_KEY) || 'null');
            if (!u || typeof u !== 'object' || u.v !== UI_VERSION) return null;
            return {
                open: u.open === true,
                view: UI_VIEWS[u.view] ? u.view : '',
                corner: CORNERS.indexOf(u.corner) !== -1 ? u.corner : ''
            };
        } catch (e) {
            return null;
        }
    }

    function saveUi() {
        if (applyingUi) return;
        var prev = readUi();
        var view = panel && typeof panel.view === 'function' ? panel.view() : '';
        var state = {
            v: UI_VERSION,
            // A page without the dialer keeps what the last panel said.
            open: panel ? !!expanded : !!(prev && prev.open),
            view: UI_VIEWS[view] ? view : (prev && prev.view) || 'dial',
            corner: corner,
            at: Date.now()
        };
        try { window.localStorage.setItem(UI_KEY, JSON.stringify(state)); } catch (e) { /* private mode */ }
    }

    // The panel can open here: shell, or a remote-control tab.
    function panelUsable() {
        return !!panel && !dockEl.hidden && (mode === 'shell' || remote());
    }

    // Show the phone as the user left it in any tab: snap point, view, panel
    // open or minimized. A live call shows its in-call view by itself.
    function applyUi() {
        var u = readUi();
        if (!u) return;
        applyingUi = true;
        try {
            var c = fitCorner(readCorner());
            if (c !== corner) {
                corner = c;
                place(false);
                if (expanded) placePanel();
            }
            if (panel && u.view && typeof panel.setView === 'function') panel.setView(u.view);
            if (panelUsable() && u.open !== expanded) setExpanded(u.open, false);
        } finally {
            applyingUi = false;
        }
    }

    function reduced() { return !!(reducedMotion && reducedMotion.matches); }

    function isActive() {
        return !!(snap && ACTIVE[snap.phase]);
    }

    // Outside mode: true when another tab runs the phone. Without Web Locks,
    // an anchor that answers the bus counts.
    function phoneElsewhere() {
        if (lockHeld === true) return true;
        if (lockHeld === null) return !!(snap && snap.phase !== 'offline');
        return false;
    }

    // Shell mode while another tab runs the phone (this shell waits for the
    // lock; it takes the phone by itself when that tab goes away).
    function shellWaiting() {
        return mode === 'shell' && shellLock() === 'waiting';
    }

    // The dialer loaded and the phone in another tab: the shell's pill +
    // panel as a remote control (requests over the bus; the audio, the
    // microphone and "Turn on phone" stay with that tab). Outside mode, or
    // a shell that waits for the lock.
    function remote() {
        if (!panel) return false;
        return (mode === 'outside' && phoneElsewhere()) || shellWaiting();
    }

    function errorKind() {
        var e = snap && snap.error;
        return e && typeof e === 'object' ? String(e.kind || '') : '';
    }

    function missedCount() {
        var m = snap && snap.missedUnseen;
        return m && typeof m.count === 'number' && m.count > 0 ? Math.floor(m.count) : 0;
    }

    function shellLock() {
        try {
            var s = window.__ctcShell;
            return s && typeof s.phoneState === 'function' ? String((s.phoneState() || {}).lock || '') : '';
        } catch (e) {
            return '';
        }
    }

    // The phone is not enabled for this user: no pill anywhere.
    function notEnabled() {
        if (errorKind() === 'not_enabled') return true;
        if (mode === 'shell') return shellLock() === 'disabled';
        return notEnabledFlag();
    }

    // Remember not_enabled for this browser (dashboard auto-enter, outside
    // pills); forget it as soon as a snapshot shows a working token.
    function trackNotEnabled() {
        if (!snap) return;
        if (errorKind() === 'not_enabled' || (mode === 'shell' && shellLock() === 'disabled')) setNotEnabledFlag(true);
        else if (snap.phase === 'ready' || snap.phase === 'incoming' || ACTIVE[snap.phase]) setNotEnabledFlag(false);
    }

    // "Turn on phone" / "Get call alerts": from the click itself. In the
    // shell the direct call; elsewhere the bus request (the shell acts on it
    // only with a gesture in its own tab).
    function unlock() {
        var s = mode === 'shell' ? shellObject() : null;
        if (s && typeof s.unlockAudio === 'function') s.unlockAudio();
        else send('unlockAudio');
    }

    // Shell only: reload the phone frame (the anchor starts again). Never
    // during a call. Returns false when there is nothing to reload.
    function reloadPhone() {
        if (mode !== 'shell' || isActive() || (snap && snap.phase === 'incoming')) return false;
        var f = document.getElementById('ctc-phone-frame');
        try {
            if (!f || !f.contentWindow || !f.getAttribute('src') || f.getAttribute('src') === 'about:blank') return false;
            f.contentWindow.location.reload();
            return true;
        } catch (e) {
            return false;
        }
    }

    // Session ended: load NetSuite again so it asks for the sign-in. The one
    // Sign in action (pill, panel card; asset 37). In the shell, the NetSuite
    // frame only (the phone keeps its own frame, so a call stays up): the
    // shell's reloadFrame also brings back a frame it blanked (login page).
    function signIn() {
        if (mode === 'shell') {
            try {
                var shell = window.__ctcShell;
                if (shell && typeof shell.reloadFrame === 'function' && shell.reloadFrame()) return;
            } catch (e) { /* fall through */ }
            var f = document.getElementById('ctc-ns-frame');
            try { f.contentWindow.location.reload(); return; } catch (e) { /* fall through */ }
        }
        window.location.reload();
    }

    // Live regions: the same text twice in a row still speaks (a trailing
    // no-break space makes it a change).
    function say(region, text) {
        region.textContent = region.textContent === text ? text + ' ' : text;
    }

    function whoOf(c) {
        c = c || {};
        return c.name || formatPhone(c.number) || c.number || '';
    }

    // Phase changes, spoken. Nothing on the first snapshot (page load).
    function announce(prev, next) {
        if (!prev || !next) return;
        var a = prev.phase, b = next.phase;
        if (b === 'incoming' && a !== 'incoming') {
            // The one assertive announcement of a ring (shell and other tabs).
            say(srAssertive, 'Incoming call from ' + (whoOf(next.caller) || whoOf({ number: next.number }) || 'unknown caller'));
            return;
        }
        if (b === 'connected' && a !== 'connected') { say(srPolite, 'Call connected'); return; }
        if (b === 'reconnecting' && a !== 'reconnecting') { say(srPolite, 'Reconnecting'); return; }
        var wasLive = !!ACTIVE[a] || a === 'incoming';
        var live = !!ACTIVE[b] || b === 'incoming';
        if (!wasLive || live) return;
        var pm = prev.missedUnseen && prev.missedUnseen.count || 0;
        var nm = next.missedUnseen && next.missedUnseen.count || 0;
        var missed = nm > pm || (a === 'incoming' && next.lastLog && next.lastLog.status === 'missed');
        if (missed) {
            var who = whoOf(next.missedUnseen && next.missedUnseen.last) || whoOf(prev.caller) || whoOf({ number: prev.number }) || 'unknown caller';
            say(srPolite, 'Missed call from ' + who);
        } else {
            say(srPolite, 'Call ended');
        }
    }

    function clockText(s) {
        var m = Math.floor(s / 60);
        return (m < 10 ? '0' : '') + m + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
    }

    function elapsed() {
        if (!snap || !snap.startedAt) return '';
        return clockText(Math.max(0, Math.floor((Date.now() - snap.startedAt) / 1000)));
    }

    // Display form of a number. Same rules as formatPhone in
    // ctc_sl_softphone.js. ctc_dock_dialer.js uses this one via __ctcDock.
    function formatPhone(input) {
        var str = String(input || '');
        var plus = str.trim().charAt(0) === '+';
        var d = str.replace(/[^0-9]/g, '');
        if (!d) return '';
        if (plus && d.length <= 10) return '+' + d;
        if (!plus && d.length <= 3) return d;
        if (!plus && d.length <= 6) return '(' + d.slice(0, 3) + ') ' + d.slice(3);
        if (!plus && d.length <= 10) return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
        var cc = d.slice(0, d.length - 10), r = d.slice(d.length - 10);
        return '+' + cc + ' (' + r.slice(0, 3) + ') ' + r.slice(3, 6) + '-' + r.slice(6);
    }

    // Bus contract (lib/ctc_dock.js): every request carries origin 'dock'
    // and a fresh nonce; the anchor drops requests without them.
    function makeNonce() {
        var out = '';
        try {
            var b = new Uint8Array(12);
            window.crypto.getRandomValues(b);
            for (var i = 0; i < b.length; i++) out += ('0' + b[i].toString(16)).slice(-2);
        } catch (e) {
            out = Math.random().toString(36).slice(2) + Date.now().toString(36);
        }
        return out;
    }

    function requestMessage(action, extra) {
        var m = { v: 1, type: 'request', action: action };
        if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) m[k] = extra[k];
        m.origin = 'dock';
        m.nonce = makeNonce();
        return m;
    }

    // This tab's sender id and command counter (request from / seq), one
    // per page load (window.__ctcBusTab).
    function busSender() {
        var s = window.__ctcBusTab;
        if (!s || typeof s.id !== 'string' || typeof s.seq !== 'number') {
            s = window.__ctcBusTab = { id: 't' + makeNonce().slice(0, 16), seq: 0 };
        }
        return s;
    }

    // The seq of a new command. The same command again within COALESCE_MS
    // (a double-click) takes the same seq, so the anchor runs it once; 0 when
    // the first one went to another anchor (never doubled: dropped). Never
    // for 'digits': two presses of a key are two tones.
    function nextSeq(action, extra) {
        var key = action === 'digits' ? '' : action + '|' + JSON.stringify(extra || {});
        var now = Date.now();
        if (key && lastCmd && lastCmd.key === key && now - lastCmd.at < COALESCE_MS) {
            return lastCmd.anchor === anchorId ? lastCmd.seq : 0;
        }
        var sender = busSender();
        sender.seq += 1;
        lastCmd = { key: key, seq: sender.seq, at: now, anchor: anchorId };
        return sender.seq;
    }

    // Every request: origin + nonce + from / seq. Sent at once when the
    // anchor is ready, else queued (readiness handshake). 'unlockAudio' is
    // for the shell (a gesture now) and never waits. Returns the nonce.
    function request(action, extra) {
        var m = requestMessage(action, extra);
        var seq = nextSeq(action, extra);
        if (!seq) return m.nonce;
        m.from = busSender().id;
        m.seq = seq;
        if (ready || action === 'unlockAudio') postRequest(m);
        else queueRequest(m);
        return m.nonce;
    }

    function postRequest(m) {
        // Name the anchor this request is for (bus contract: one anchor acts).
        if (anchorId) m.anchor = anchorId;
        if (anchorBus >= 2) inflight.push({ seq: m.seq, anchor: anchorId, at: Date.now() });
        bus.postMessage(m);
    }

    function queueRequest(m) {
        queue.push({ m: m, at: Date.now() });
        if (!queueTimer) queueTimer = window.setTimeout(expireQueue, REQUEST_QUEUE_MS);
    }

    // Requests that waited REQUEST_QUEUE_MS for the anchor: dropped, with
    // one quiet line.
    function expireQueue() {
        queueTimer = null;
        var now = Date.now();
        var kept = queue.filter(function (q) { return now - q.at < REQUEST_QUEUE_MS; });
        var dropped = kept.length < queue.length;
        queue = kept;
        if (queue.length) queueTimer = window.setTimeout(expireQueue, Math.max(0, REQUEST_QUEUE_MS - (now - queue[0].at)));
        if (dropped) quietError(NOT_READY_TEXT);
    }

    function flushQueue() {
        if (queueTimer) { window.clearTimeout(queueTimer); queueTimer = null; }
        var q = queue;
        queue = [];
        q.forEach(function (x) { postRequest(x.m); });
    }

    // The anchor acked these (snap.acks); requests older than 10 s are
    // forgotten.
    function trackAcks(s) {
        if (!inflight.length) return;
        var mine = s.acks && typeof s.acks === 'object' ? s.acks[busSender().id] : null;
        var now = Date.now();
        inflight = inflight.filter(function (x) {
            return now - x.at < 10000 && !(Array.isArray(mine) && mine.indexOf(x.seq) !== -1);
        });
    }

    // The anchor went away or stepped aside: what it never acked
    // was dropped there (bus contract), and is never sent again.
    function dropInflight() {
        var lost = inflight.length > 0;
        inflight = [];
        if (lost) quietError(NOT_READY_TEXT);
    }

    // A quiet error line: the panel's muted line, and the polite live region.
    function quietError(text) {
        say(srPolite, text);
        if (panel && typeof panel.quiet === 'function') panel.quiet(text);
    }

    function send(action) {
        request(action);
    }

    // --- Render ---
    var PHASE_VIEW = {
        offline: { dot: T.offline, label: 'Phone offline' },
        error: { dot: T.stopDot, label: 'Phone error' },
        starting: { dot: T.amber, label: 'Starting phone…' },
        ready: { dot: T.goDot, label: 'Phone ready' }, // aria-label only: the ready pill has no text
        dialing: { dot: T.amber, label: 'Calling…' },
        ringing: { dot: T.amber, label: 'Calling…' },
        incoming: { dot: T.ring, label: 'Incoming call' }, // ring: ringing reads apart from talking
        answering: { dot: T.goDot, label: 'Connecting…' }, // Answer sent, Twilio not accepted yet
        connected: { dot: T.goDot, label: 'Connected' },
        reconnecting: { dot: AMBER, label: 'Reconnecting…' }
    };
    // Ready, but Twilio cannot ring this phone (snap.canReceive === false:
    // inbound is on and the anchor is re-registering). Quiet: amber dot and
    // tooltip / aria text only.
    var READY_NOT_RECEIVING = { dot: T.amber, label: 'Ready · not receiving calls — reconnecting' };
    // Signed out of NetSuite (error kind signed_out): never "not receiving"
    // (asset 37, DESIGN.md §3).
    var SIGNED_OUT_VIEW = { dot: AMBER, label: 'Signed out' };
    // What the panel draws before the first snapshot.
    var STARTING_SNAP = { phase: 'starting' };
    var ARROWS_HINT = ' Arrow keys move the dock.';

    function render() {
        // The panel follows every snapshot first, so nothing below can leave
        // it on a stale view.
        trackNotEnabled();
        // Before the anchor answers, the panel says Starting too.
        if (panel) panel.render(snap || STARTING_SNAP);

        var before = capturePill(); // the pill as drawn now, for a size ease
        var wasHidden = dockEl.hidden;
        if (mode === 'outside') renderOutside();
        else if (notEnabled()) hideDock();
        else {
            // No snapshot yet (readiness handshake): the Starting pill.
            renderChip(snap ? snap.phase : 'starting', false);
            if (snap) renderCard();
            setExpanded(expanded, false);
        }
        // First show on this page (load, login, after the lock check):
        // the entrance, at the pill's final size and place.
        if (wasHidden && !dockEl.hidden) enter();
        fitPill(before);
        syncIncoming();
        followAnswer();
    }

    // Entrance: 260 ms fade + scale 0.96 -> 1 + a few px in from the pill's
    // edge, on the pill itself (the dock's transform holds its place).
    // Reduced motion: fade only, REDUCED_MS. Called only when the dock goes from hidden
    // to shown, so in-shell re-renders and cross-tab moves never run it.
    function enter() {
        if (vchipEl.hidden || typeof vchipEl.animate !== 'function') return;
        // Middle points come in from their side, the rest from their row's edge.
        var row = corner.charAt(0);
        var dx = row !== 'm' ? 0 : corner.charAt(1) === 'l' ? -ENTER_SHIFT : ENTER_SHIFT;
        var dy = row === 't' ? -ENTER_SHIFT : row === 'b' ? ENTER_SHIFT : 0;
        var from = reduced()
            ? { opacity: 0 }
            : { opacity: 0, transform: 'translate(' + dx + 'px,' + dy + 'px) scale(0.96)' };
        var to = reduced() ? { opacity: 1 } : { opacity: 1, transform: 'none' };
        var dur = reduced() ? REDUCED_MS : ENTER_MS;
        vchipEl.getAnimations().forEach(function (a) { a.cancel(); });
        vchipEl.animate([from, to], { duration: dur, easing: ENTER_EASE });
        entering = true;
        window.clearTimeout(enterTimer);
        enterTimer = window.setTimeout(function () { entering = false; }, dur);
    }

    // No pill (not_enabled): the panel closes.
    function hideDock() {
        if (expanded || (panel && !panel.el.hidden)) setExpanded(false, false);
        if (timerId) { window.clearInterval(timerId); timerId = null; }
        dockEl.hidden = true;
        syncIncoming();
    }

    function renderOutside() {
        if (notEnabled()) { hideDock(); return; }
        if (lockHeld === 'pending') { dockEl.hidden = true; return; }
        if (!phoneElsewhere()) {
            if (!cfg.shellUrl) { hideDock(); return; }
            // "Open phone" (offline style): this tab moves into phone mode.
            dockEl.hidden = false;
            dockEl.style.setProperty('--dot', PHASE_VIEW.offline.dot);
            renderPill({ stage: 'offline', dot: true, light: true, main: 'offline', label: 'Open phone.' + ARROWS_HINT, title: 'Open phone', l1: 'Open phone' });
            if (timerId) { window.clearInterval(timerId); timerId = null; }
            setOrient();
            setExpanded(false, false);
            return;
        }
        if (panel) {
            // Remote control: the shell's pill + panel; the anchor in the
            // phone tab does the work and plays the audio.
            renderChip(snap ? snap.phase : 'starting', false);
            setExpanded(expanded, false);
            return;
        }
        // No dialer on this page (its script did not load; the client does
        // not know its URL): the same pill, but no panel, so between calls
        // the main slot is disabled; a live call opens the call card.
        renderChip(snap ? snap.phase : 'starting', true);
        if (snap) renderCard();
        if (!isActive()) expanded = false;
        setExpanded(expanded, false);
    }

    // mirror: outside mode with no dialer (no panel): the same pill words,
    // no idle views and no main action between calls.
    function renderChip(phaseIn, mirror) {
        var phase = PHASE_VIEW[phaseIn] ? phaseIn : 'offline';
        var view = PHASE_VIEW[phase];
        if (phase === 'ready' && snap && snap.canReceive === false) view = READY_NOT_RECEIVING;
        var active = isActive();
        if (!active && phase !== 'incoming' && errorKind() === 'signed_out') view = SIGNED_OUT_VIEW;
        var light = phase === 'offline' || phase === 'error';
        var name = active ? callName() : '';
        var idleLabel = view.label;

        if (!active && !panel) expanded = false;

        dockEl.hidden = false;
        // The light error pill takes the stop button colour (stopDot is for dark).
        dockEl.style.setProperty('--dot', light && phase === 'error' ? T.stop : view.dot);
        if (phase === 'incoming') {
            // Ringing in: the incoming card above / beside the pill holds
            // Answer / Decline (here and in a tab without the dialer: the anchor answers;
            // the audio plays in the tab that holds the phone). The pill
            // says "Ringing" (horizontal), rings its sky dot, and shows a
            // green Answer button with a ring orb (both shapes).
            var who = callerText();
            var words0 = pillWords(phase, active);
            renderPill({
                stage: phase,
                dot: true,
                main: 'answer',
                mainLabel: 'Answer call from ' + who,
                label: 'Incoming call from ' + who + '.' + (panel ? ' Open phone.' : '') + ARROWS_HINT,
                title: 'Incoming call from ' + who,
                l1: words0.l1,
                l2: words0.l2
            });
            setOrient();
            tick();
            if (timerId) { window.clearInterval(timerId); timerId = null; }
            return;
        }
        if (phase === 'answering') {
            // Answer sent, Twilio has not connected the call yet: go dot,
            // "Connecting…", no action (a disabled main slot, no Mute).
            var caller = callerText();
            renderPill({
                stage: phase,
                dot: true,
                main: null,
                label: 'Connecting call from ' + caller + '.' + (panel ? ' Open phone.' : ' Open call card.') + ARROWS_HINT,
                title: 'Connecting call from ' + caller,
                l1: view.label,
                l2: ''
            });
            setOrient();
            tick();
            if (timerId) { window.clearInterval(timerId); timerId = null; }
            return;
        }
        // Idle states that replace the plain pill: errors, wrap-up, Turn on
        // phone, missed calls (see idleView).
        var idle = active || mirror ? null : idleView(phase, view);
        if (idle) {
            dockEl.style.setProperty('--dot', idle.dot);
            renderPill({
                stage: idle.stage || phase,
                dot: true,
                light: !!idle.light,
                err: !!idle.err,
                timer: !!idle.timer,
                main: idle.main || null,
                mainLabel: idle.mainLabel || '',
                action: idle.action || '',
                label: idle.label + '.' + ARROWS_HINT,
                title: idle.label,
                l1: idle.l1,
                l2: idle.l2 || '',
                l1Amber: !!idle.amber,
                count: idle.count || 0
            });
            setOrient();
            tick();
            if (timerId) { window.clearInterval(timerId); timerId = null; }
            return;
        }
        // Tooltip text. Ready: dot + green phone button only, no label.
        var chipText = active ? name : (phase === 'ready' ? '' : idleLabel);
        var label = active
            ? name + ', ' + view.label + '. Open call card.' + ARROWS_HINT
            : idleLabel + '.' + (mirror ? '' : ' Open phone.') + ARROWS_HINT;
        var words = pillWords(phase, active);
        renderPill({
            stage: phase,
            dot: true,
            light: light,
            err: phase === 'error',
            timer: active && !!snap.startedAt,
            mute: !!TALKING[phase],
            muted: !!(snap && snap.muted),
            main: active ? 'end' : mirror ? null : phase === 'ready' ? 'call' : phase === 'offline' ? 'offline' : phase === 'error' ? 'retry' : null,
            label: label,
            title: chipText || idleLabel,
            l1: words.l1,
            l2: words.l2,
            l2Muted: words.l2Muted,
            l2Amber: words.l2Amber
        });
        setOrient();

        tick();
        var running = !!(snap && snap.startedAt);
        if (running && !timerId) timerId = window.setInterval(tick, 1000);
        if (!running && timerId) { window.clearInterval(timerId); timerId = null; }
    }

    // The pill between calls when something needs the rep (null: the plain
    // pill). Shell and remote tabs only. Order: an error kind, wrap-up (a
    // call just ended), Turn on phone (shell tab, audio still locked),
    // missed calls.
    //   { dot, l1, l2, label (title / aria), main, mainLabel, action, light,
    //     err, amber, count, stage, timer }
    function idleView(phase, view) {
        var kind = errorKind();
        if (kind === 'mic') return { dot: T.stop, light: true, err: true, main: 'retry', l1: 'Microphone blocked', label: 'Microphone blocked. Open phone' };
        if (kind === 'twilio') return { dot: T.stop, light: true, err: true, main: 'retry', l1: 'Phone error', label: 'Phone error. Open phone' };
        if (kind === 'signed_out') return { dot: AMBER, amber: true, action: 'signin', l1: 'Sign in to NetSuite', label: 'Signed out of NetSuite. Sign in' };
        if (kind === 'session') return { dot: AMBER, amber: true, l1: 'Reconnecting…', label: 'Reconnecting. Open phone' };
        if (kind === 'network') return { dot: AMBER, amber: true, l1: 'Reconnecting…', label: 'Reconnecting. Open phone' };
        // Paused by the admin: a quiet offline-style pill, no Call.
        if (kind === 'paused') return { dot: PHASE_VIEW.offline.dot, light: true, l1: 'Calling paused', label: 'Calling is paused by your administrator' };
        if (phase !== 'ready') return null;
        if (wrap && panel) {
            var len = wrap.timed ? clockText(wrap.seconds) : '';
            return {
                stage: 'wrapup', dot: T.wrap, l1: 'Call ended', l2: wrap.display, timer: wrap.timed,
                main: 'callback', mainLabel: 'Call back ' + wrap.display,
                label: 'Call ended with ' + wrap.display + (len ? ', ' + len : '') + '. Open phone'
            };
        }
        // audioUnlocked is the phone tab's: a waiting shell (remote) never asks.
        if (mode === 'shell' && !shellWaiting() && snap && snap.audioUnlocked === false) {
            return { dot: view.dot, main: 'call', action: 'unlock', l1: 'Turn on phone', label: 'Turn on phone' };
        }
        var n = missedCount();
        if (n > 0) {
            return { dot: MISSED_DOT, main: 'call', l1: n + ' missed', count: n, label: n + (n === 1 ? ' missed call' : ' missed calls') + '. Open phone' };
        }
        return null;
    }

    function callName() {
        return snap.entityName || snap.contactName || snap.number || 'Call';
    }

    // Inbound caller: matched name, else the number in display form.
    function callerText() {
        var c = (snap && snap.caller) || {};
        var number = c.number || (snap && snap.number) || '';
        return c.name || formatPhone(number) || number || 'Unknown caller';
    }

    // Horizontal pill words (two lines; '' = line not shown). The vertical
    // pill shows none. Answering and wrap-up set their own (renderChip,
    // idleView).
    function pillWords(phase, active) {
        if (phase === 'incoming') return { l1: 'Ringing', l2: '' }; // the card names the caller
        var number = active ? formatPhone(snap.number) || snap.number || '' : '';
        var name = active ? snap.entityName || snap.contactName || number || 'Call' : '';
        if (phase === 'offline') return { l1: 'Phone offline', l2: 'Open phone mode' };
        if (phase === 'error') return { l1: 'Phone error', l2: 'Click to reconnect' };
        if (phase === 'starting') return { l1: 'Starting phone', l2: '' };
        if (phase === 'dialing' || phase === 'ringing') return { l1: name, l2: 'Calling…' };
        // Reconnecting: the call, timer and Mute stay; the second line says so.
        if (phase === 'reconnecting') return { l1: name, l2: 'Reconnecting…', l2Amber: true };
        if (phase === 'connected') {
            if (snap.muted) return { l1: name, l2: 'Muted', l2Muted: true };
            var sub = snap.contactName || number;
            return { l1: name, l2: sub === name ? '' : sub };
        }
        return { l1: '', l2: '' }; // ready: no words
    }

    // The pill, both shapes. Grip, status dot, words + timer (horizontal) or
    // timer as mm over ss (vertical), Mute while connected, main button last.
    //   main: 'call' (open phone) | 'end' (hang up) | 'offline' (open phone)
    //         | 'retry' (open phone) | 'answer' | 'callback' (wrap-up: dial
    //         the last call again) | null (no action: starting, answering,
    //         paused, no-dialer idle; a disabled slot is drawn)
    // The body button opens the phone / call card. When the main button does
    // that same thing, the body leaves the tab order so keyboard users meet
    // one control per action.
    function renderPill(o) {
        var disabled = !o.main;
        // Halo only while live (DESIGN.md §3); answering waits for Twilio.
        var live = !o.light && o.stage !== 'answering' && (!!ACTIVE[o.stage] || o.stage === 'incoming');
        pillWrap = o.stage === 'wrapup';
        vchipEl.setAttribute('data-stage', o.stage);
        vchipEl.setAttribute('data-live', live ? 'true' : 'false');
        vchipEl.setAttribute('data-muted', o.mute && o.muted ? 'true' : 'false');
        vchipEl.setAttribute('data-main', disabled ? 'disabled' : o.main);
        vchipEl.classList.toggle('light', !!o.light);
        vchipEl.classList.toggle('navy', !o.light);
        vchipEl.classList.toggle('err', !!o.err);
        vchipEl.title = o.title || '';
        vchipEl.querySelector('.v-dot').hidden = !o.dot;
        hL1.textContent = o.l1 || '';
        hL2.textContent = o.l2 || '';
        hL2.hidden = !o.l2;
        hL2.classList.toggle('muted', !!o.l2Muted);
        hL1.classList.toggle('amber', !!o.l1Amber);
        hL2.classList.toggle('amber', !!o.l2Amber);
        hWords.hidden = !o.l1 && !o.l2;
        vCount.hidden = !o.count;
        vCount.textContent = o.count ? (o.count > 9 ? '9+' : String(o.count)) : '';
        vTime.hidden = !o.timer;
        hTime.hidden = !o.timer;
        vMute.hidden = !o.mute;
        vMute.setAttribute('aria-pressed', o.muted ? 'true' : 'false');
        vMute.setAttribute('aria-label', o.muted ? 'Unmute' : 'Mute');
        vMute.querySelector('svg').innerHTML = o.muted ? ICON_MIC_OFF : ICON_MIC;
        vMain.hidden = false;
        vMain.className = 'v-main ' + (disabled ? 'disabled' : o.main);
        if (disabled) {
            vMain.tabIndex = -1;
            vMain.setAttribute('aria-hidden', 'true');
            vMain.removeAttribute('aria-label');
        } else {
            vMain.removeAttribute('tabindex');
            vMain.removeAttribute('aria-hidden');
            vMain.setAttribute('aria-label', o.mainLabel || (o.main === 'end' ? 'End call' : o.label));
        }
        var bodyIsMain = !disabled && o.main !== 'end' && o.main !== 'answer' && o.main !== 'callback';
        vBody.tabIndex = bodyIsMain ? -1 : 0;
        if (bodyIsMain) {
            vBody.removeAttribute('aria-label');
            vBody.setAttribute('aria-hidden', 'true');
        } else {
            vBody.setAttribute('aria-label', o.label);
            vBody.removeAttribute('aria-hidden');
        }
        pillAction = o.action || '';
        syncExpandedAria();
    }

    // aria-expanded on the control that opens something: the body when it
    // is in the tab order, else the main button. Nothing when the click
    // navigates or only turns the phone on.
    function syncExpandedAria() {
        vBody.removeAttribute('aria-expanded');
        vMain.removeAttribute('aria-expanded');
        var opener = vBody.tabIndex === 0 ? vBody : vMain;
        if (pillAction === 'unlock' || pillAction === 'signin') return;
        if (opener === vMain && vMain.classList.contains('end')) return;
        var opens = (mode !== 'outside' || phoneElsewhere()) && (!!panel || isActive());
        if (opens) opener.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    }

    // --- Compositor morph (FLIP) ---
    // A rounded box changes size or shape with transform only. The element
    // is laid out at its final size (box: x 0, y 0, w, h, r); a stack of
    // nine clipped pieces (centre, four edges, four corners) covers it, and
    // each piece animates from where its part of the box sits in the start
    // rect (a: x, y, w, h, r, relative to the element's border box) to
    // identity. Corners scale evenly (a.r / box.r), so they never stretch
    // and the radius morphs; edges stretch only along their length, the
    // centre both ways. Every piece is linear in the rect, so the pieces
    // stay joined on every frame. Surface pieces overlap their outer
    // neighbours by SEAM px (no hairline at the joins, as long as what
    // overlaps is opaque; a see-through shadow is never pieced).
    //   Plain mode (the pill's size ease): each piece holds its part of a
    //   full-size copy of the look (the fill) and stretches with it; two
    //   keyframes, the WAAPI easing.
    //   Window mode (the incoming card): the stack is a rounded window
    //   (box may sit off the element's origin and be larger than it) onto
    //   the card's own surface, which stays put: each fill is the card
    //   (fillBox) and is counter-scaled. Keyframes are sampled along
    //   the easing (linear between; sampleRects), and piece and fill share
    //   them, so they cancel all the way. The look is the old clip-path reveal, on the compositor.
    var MORPH_STEPS = 12; // window mode: keyframes at 12 even steps of time and 12 of distance
    var MIN_SCALE = 0.01; // window mode: thinnest window (its fill scales by 1 / this)

    function shownEl(el) { return !!el && el.getClientRects().length > 0; }

    function parseMatrix(t) {
        var m = /^matrix\(([^)]+)\)$/.exec(String(t || '').trim());
        if (!m) return null;
        var v = m[1].split(',').map(parseFloat);
        return v.length === 6 && v.every(isFinite) ? { sx: v[0], sy: v[3], tx: v[4], ty: v[5] } : null;
    }

    // CSS cubic-bezier(x1, y1, x2, y2) as a function of time (0..1).
    function bezier(x1, y1, x2, y2) {
        var at = function (a, b, t) { return 3 * a * t * (1 - t) * (1 - t) + 3 * b * t * t * (1 - t) + t * t * t; };
        return function (x) {
            if (x <= 0 || x >= 1) return x <= 0 ? 0 : 1;
            var lo = 0, hi = 1, t = x;
            for (var i = 0; i < 30; i++) {
                t = (lo + hi) / 2;
                if (at(x1, x2, t) < x) lo = t; else hi = t;
            }
            return at(y1, y2, t);
        };
    }
    var SETTLE_CURVE = bezier(0.32, 0.72, 0, 1); // SETTLE

    // A damped spring (damping ratio z < 1, released from rest) as a
    // function of time (0..1), time scaled so it has settled (within 0.1%)
    // at 1. z 0.8 overshoots by about 1.5%: a settle, not a bounce.
    function springCurve(z) {
        var wd = Math.sqrt(1 - z * z);
        var T = Math.log(1000) / z;
        return function (x) {
            if (x <= 0) return 0;
            if (x >= 1) return 1;
            var t = x * T;
            return 1 - Math.exp(-z * t) * (Math.cos(wd * t) + (z / wd) * Math.sin(wd * t));
        };
    }
    var SPRING_CURVE = springCurve(INC_SPRING_DAMPING);

    // Keyframes (linear easing) that move an element from (dx, dy, s) to
    // (dx2, dy2, s2) along `curve`, sampled like the morph window.
    function curveFrames(a, b, curve) {
        var out = [];
        for (var i = 0; i <= MORPH_STEPS * 2; i++) {
            var t = i / (MORPH_STEPS * 2);
            var p = curve(t);
            var l = function (u, v) { return u + (v - u) * p; };
            out.push({ offset: t, transform: 'translate(' + round3(l(a.dx, b.dx)) + 'px, ' + round3(l(a.dy, b.dy)) + 'px) scale(' + round3(l(a.s, b.s)) + ')' });
        }
        return out;
    }

    // Look of `el` (computed) for the fills: background, border, its own
    // (inset) box-shadow.
    function surfaceLook(el) {
        var cs = window.getComputedStyle(el);
        return 'box-shadow:' + cs.getPropertyValue('box-shadow') + ';' + ['background-color', 'background-image', 'background-size', 'background-position', 'background-repeat',
            'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
            'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
            'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color']
            .map(function (k) { return k + ':' + cs.getPropertyValue(k); }).join(';');
    }

    // Lay the stack's pieces out for `box` (margin m past the box, overlap
    // seam) and give every fill `look` at fillBox (default: box).
    // win: window mode (each corner piece rounds its own corner; fills
    // counter-scale about the piece's anchor). (bx, by): the element's
    // border widths. Element coordinates throughout. Runs once per morph.
    function layoutStack(stack, box, m, seam, look, bx, by, win, fillBox) {
        var X = box.x, Y = box.y, W = box.w, H = box.h, R = box.r;
        var f = fillBox || box;
        var cols = { l: [X - m, X + R + seam], c: [X + R, X + W - R], r: [X + W - R - seam, X + W + m] };
        var rows = { t: [Y - m, Y + R + seam], c: [Y + R, Y + H - R], b: [Y + H - R - seam, Y + H + m] };
        var ax = { l: X, c: X + R, r: X + W };
        var ay = { t: Y, c: Y + R, b: Y + H };
        var corner = { tl: 'top-left', tr: 'top-right', bl: 'bottom-left', br: 'bottom-right' };
        stack.style.left = -bx + 'px';
        stack.style.top = -by + 'px';
        Array.prototype.forEach.call(stack.children, function (p) {
            var k = p.getAttribute('data-p');
            var cell = PIECES[k];
            var cx = cols[cell[0]], cy = rows[cell[1]];
            p.style.cssText = 'left:' + cx[0] + 'px;top:' + cy[0] + 'px;width:' + Math.max(0, cx[1] - cx[0]) + 'px;height:'
                + Math.max(0, cy[1] - cy[0]) + 'px;transform-origin:' + (ax[cell[0]] - cx[0]) + 'px ' + (ay[cell[1]] - cy[0]) + 'px'
                + (win && corner[k] ? ';border-' + corner[k] + '-radius:' + R + 'px' : '');
            p.firstChild.style.cssText = look + ';left:' + (f.x - cx[0]) + 'px;top:' + (f.y - cy[0]) + 'px;width:' + f.w + 'px;height:' + f.h
                + 'px;border-radius:' + f.r + 'px' + (win ? ';transform-origin:' + (ax[cell[0]] - f.x) + 'px ' + (ay[cell[1]] - f.y) + 'px' : '');
        });
    }

    // Piece k drawn at rect a: translate (dx, dy) and scale (sx, sy) about
    // its anchor (identity when a is the box).
    function pieceParts(k, box, a, minScale) {
        var cell = PIECES[k];
        var R = box.r;
        var lo = minScale || 0.0001;
        var K = R > 0 ? Math.max(lo, a.r / R) : 1;
        var SX = box.w - 2 * R > 0.5 ? Math.max(lo, (a.w - 2 * a.r) / (box.w - 2 * R)) : 1;
        var SY = box.h - 2 * R > 0.5 ? Math.max(lo, (a.h - 2 * a.r) / (box.h - 2 * R)) : 1;
        var ax = { l: box.x, c: box.x + R, r: box.x + box.w }[cell[0]];
        var ay = { t: box.y, c: box.y + R, b: box.y + box.h }[cell[1]];
        var fx = { l: a.x, c: a.x + a.r, r: a.x + a.w }[cell[0]];
        var fy = { t: a.y, c: a.y + a.r, b: a.y + a.h }[cell[1]];
        return { dx: fx - ax, dy: fy - ay, sx: cell[0] === 'c' ? SX : K, sy: cell[1] === 'c' ? SY : K };
    }
    function round3(v) { return Math.round(v * 1000) / 1000; }
    function tf(dx, dy, sx, sy) {
        return 'translate(' + round3(dx) + 'px, ' + round3(dy) + 'px) scale(' + round3(sx) + ', ' + round3(sy) + ')';
    }
    function pieceTransform(k, box, a) {
        var q = pieceParts(k, box, a);
        return tf(q.dx, q.dy, q.sx, q.sy);
    }

    // The rect a stack draws now (mid-morph), from its corner pieces; null
    // when it cannot be read.
    function stackRect(stack, box) {
        var tl = parseMatrix(window.getComputedStyle(stack.querySelector('[data-p="tl"]')).transform);
        var br = parseMatrix(window.getComputedStyle(stack.querySelector('[data-p="br"]')).transform);
        if (!tl || !br) return null;
        return { x: box.x + tl.tx, y: box.y + tl.ty, w: box.w + br.tx - tl.tx, h: box.h + br.ty - tl.ty, r: tl.sx * box.r };
    }

    function lerpRect(a, b, p) {
        var l = function (u, v) { return u + (v - u) * p; };
        return { x: l(a.x, b.x), y: l(a.y, b.y), w: l(a.w, b.w), h: l(a.h, b.h), r: l(a.r, b.r) };
    }

    // Window mode keyframes: times (0..1) at MORPH_STEPS even steps of
    // time and MORPH_STEPS even steps of distance along `curve` (dense
    // where it moves fast), each with its rect. Few keyframes keep the
    // start cheap.
    function sampleRects(from, to, curve) {
        var ts = [];
        for (var i = 0; i <= MORPH_STEPS; i++) {
            ts.push(i / MORPH_STEPS);
            var lo = 0, hi = 1, y = i / MORPH_STEPS; // the time the curve reaches y
            for (var k = 0; k < 24; k++) { var m = (lo + hi) / 2; if (curve(m) < y) lo = m; else hi = m; }
            ts.push(hi);
        }
        ts.sort(function (a, b) { return a - b; });
        var out = [];
        ts.forEach(function (t) {
            t = Math.round(t * 10000) / 10000;
            if (!out.length || t - out[out.length - 1].t > 0.004) out.push({ t: t, rect: lerpRect(from, to, curve(t)) });
        });
        out[out.length - 1] = { t: 1, rect: lerpRect(from, to, 1) };
        return out;
    }

    // Animate the stack from rect `from` to rect `to` (either may be the
    // box itself). curve: window mode (sampled keyframes along it; opts'
    // easing is replaced by linear). Returns the WAAPI animations: the
    // pieces first (PIECE_KEYS order), then in window mode their fills.
    function morphStack(stack, box, from, to, opts, curve) {
        var pieces = PIECE_KEYS.map(function (k) { return stack.querySelector('[data-p="' + k + '"]'); });
        if (!curve) {
            return pieces.map(function (p, i) {
                var k = PIECE_KEYS[i];
                return p.animate([{ transform: pieceTransform(k, box, from) }, { transform: pieceTransform(k, box, to) }], opts);
            });
        }
        var samples = sampleRects(from, to, curve);
        var lin = { duration: opts.duration, easing: 'linear', fill: opts.fill };
        // Window values as drawn (rounded), so each fill inverts exactly them.
        var parts = pieces.map(function (p, j) {
            return samples.map(function (smp) {
                var q = pieceParts(PIECE_KEYS[j], box, smp.rect, MIN_SCALE);
                return { t: smp.t, dx: round3(q.dx), dy: round3(q.dy), sx: round3(q.sx), sy: round3(q.sy) };
            });
        });
        var out = pieces.map(function (p, j) {
            return p.animate(parts[j].map(function (q) { return { offset: q.t, transform: tf(q.dx, q.dy, q.sx, q.sy) }; }), lin);
        });
        return out.concat(pieces.map(function (p, j) {
            return p.firstChild.animate(parts[j].map(function (q) {
                return { offset: q.t, transform: tf(-q.dx / q.sx, -q.dy / q.sy, 1 / q.sx, 1 / q.sy) };
            }), lin);
        }));
    }

    function boxOf(el, r) {
        var w = el.offsetWidth, h = el.offsetHeight;
        return { x: 0, y: 0, w: w, h: h, r: r === undefined ? Math.min(w, h) / 2 : r }; // also the identity rect
    }

    // --- Pill size (FLIP) ---
    // The pill's long axis follows its content (width when horizontal,
    // height when vertical). A change while it shows: the pill takes its new
    // size and place at once (anchored to its snap point); its surface and
    // shadow (morph stacks) ease from the shape drawn before to the new one
    // over PILL_EASE_MS; parts that stay slide from where they were drawn;
    // parts that are new (or changed size) fade in over the second part.
    // Transform and opacity only. No ease under reduced motion, during the
    // entrance, or on a shape switch. A render during an ease starts from
    // what is drawn now.
    var pillMorph = null; // running animations, or null

    // What the pill draws now, before a render changes it; null when no
    // ease could follow.
    function capturePill() {
        if (dockEl.hidden || vchipEl.hidden || reduced() || typeof vchipEl.animate !== 'function') return null;
        var r = vchipEl.getBoundingClientRect();
        var rect = { left: r.left, top: r.top, width: r.width, height: r.height };
        if (pillMorph && vchipEl.classList.contains('morph')) {
            var a = stackRect(vSurf, boxOf(vchipEl));
            if (a) rect = { left: r.left + a.x, top: r.top + a.y, width: a.w, height: a.h };
        }
        return {
            vert: dockEl.classList.contains('vert'),
            rect: rect,
            parts: pillParts.map(function (el) {
                var shown = shownEl(el);
                return { el: el, shown: shown, rect: shown ? el.getBoundingClientRect() : null, opacity: shown ? window.getComputedStyle(el).opacity : '0' };
            })
        };
    }

    function stopPillMorph() {
        if (!pillMorph) return;
        var anims = pillMorph;
        pillMorph = null;
        anims.forEach(function (a) { a.onfinish = null; a.cancel(); });
        vchipEl.classList.remove('morph');
    }

    function fitPill(before) {
        var vert = dockEl.classList.contains('vert');
        var shown = !dockEl.hidden && !vchipEl.hidden;
        if (!shown) { stopPillMorph(); pillFit.size = 0; return; }
        var to = vert ? vchipEl.offsetHeight : vchipEl.offsetWidth;
        var from = pillFit.vert === vert ? pillFit.size : 0;
        pillFit = { vert: vert, size: to };
        if (from === to) return; // same size: a running ease goes on
        place(false); // the new size at its snap point, at once
        if (!from || !before || before.vert !== vert || reduced() || entering) { stopPillMorph(); return; }
        morphPill(before);
    }

    function morphPill(before) {
        stopPillMorph();
        var box = boxOf(vchipEl);
        var now = vchipEl.getBoundingClientRect();
        var b = before.rect;
        var a = { x: b.left - now.left, y: b.top - now.top, w: b.width, h: b.height, r: Math.min(b.width, b.height) / 2 };
        layoutStack(vSurf, box, 0, SEAM, surfaceLook(vchipEl), vchipEl.clientLeft, vchipEl.clientTop);
        // The shadow crossfades between the old and the new size: two
        // filled shapes in the shadow colour, blurred (a static filter, laid
        // out once), so the shadow under the part of the pill still to come
        // is there too (an outer box-shadow is cut out under its own box).
        // A stretched or pieced shadow would show its ends or seams.
        var sh = vchipEl.classList.contains('light') ? PILL_SHADE_LIGHT : PILL_SHADE;
        [a, box].forEach(function (q, i) {
            vShades[i].style.cssText = 'left:' + (q.x - vchipEl.clientLeft) + 'px;top:' + (q.y - vchipEl.clientTop + sh.y) + 'px;width:' + q.w
                + 'px;height:' + q.h + 'px;border-radius:' + q.r + 'px;background:' + sh.color + ';filter:blur(' + sh.blur / 2 + 'px)';
        });
        var opts = { duration: PILL_EASE_MS, easing: PILL_EASE };
        vchipEl.classList.add('morph');
        var anims = morphStack(vSurf, box, a, box, opts);
        anims.push(vShades[0].animate([{ opacity: 1 }, { opacity: 0 }], { duration: PILL_EASE_MS, easing: PILL_EASE, fill: 'forwards' }));
        anims.push(vShades[1].animate([{ opacity: 0 }, { opacity: 1 }], { duration: PILL_EASE_MS, easing: PILL_EASE, fill: 'backwards' }));
        // Parts ride with the pill's near end (left / top half) or far end:
        // a part that stays slides from where it was drawn; a new or resized
        // part slides with its end and fades in over the second half.
        var vert = before.vert;
        var nearD = vert ? b.top - now.top : b.left - now.left;
        var farD = vert ? b.top + b.height - now.top - now.height : b.left + b.width - now.left - now.width;
        before.parts.forEach(function (p) {
            if (!shownEl(p.el)) return;
            var r = p.el.getBoundingClientRect();
            var dx, dy;
            var kept = p.shown && Math.abs(r.width - p.rect.width) < 0.5 && Math.abs(r.height - p.rect.height) < 0.5;
            if (kept) {
                dx = p.rect.left - r.left;
                dy = p.rect.top - r.top;
            } else {
                var near = vert ? r.top + r.height / 2 < now.top + now.height / 2 : r.left + r.width / 2 < now.left + now.width / 2;
                dx = vert ? 0 : near ? nearD : farD;
                dy = vert ? (near ? nearD : farD) : 0;
                anims.push(p.el.animate([{ opacity: p.shown ? p.opacity : 0 }, { opacity: 1 }], {
                    duration: Math.round(PILL_EASE_MS / 2), delay: Math.round(PILL_EASE_MS / 2), easing: PILL_EASE, fill: 'backwards'
                }));
            }
            if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
            anims.push(p.el.animate([{ transform: 'translate(' + round3(dx) + 'px, ' + round3(dy) + 'px)' }, { transform: 'translate(0px, 0px)' }], opts));
        });
        pillMorph = anims;
        anims[0].onfinish = function () {
            if (pillMorph !== anims) return;
            pillMorph = null;
            vchipEl.classList.remove('morph');
        };
    }

    // The control that holds focus for the pill.
    function pillFocusTarget() {
        return vBody.tabIndex === 0 || vMain.hidden ? vBody : vMain;
    }

    function focusPill() {
        var t = pillFocusTarget();
        if (t) t.focus();
    }

    function renderCard() {
        var phase = PHASE_VIEW[snap.phase] ? snap.phase : 'offline';
        var name = callName();
        var sub = snap.entityName && snap.contactName ? snap.contactName : (snap.number || '');
        if (sub === name) sub = '';
        whoName.textContent = name;
        whoSub.textContent = sub;
        whoSub.hidden = !sub;
        cardTime.hidden = !snap.startedAt;
        pillLabel.textContent = PHASE_VIEW[phase].label;
        muteBtn.disabled = !TALKING[phase];
        muteBtn.setAttribute('aria-pressed', snap.muted ? 'true' : 'false');
        muteBtn.setAttribute('aria-label', snap.muted ? 'Unmute' : 'Mute');
        muteBtn.querySelector('svg').innerHTML = snap.muted ? ICON_MIC_OFF : ICON_MIC;
    }

    // No motion on the timer tick.
    // The wrap-up pill shows the call's final length instead.
    function tick() {
        var t = elapsed();
        var p = pillWrap && wrap && wrap.timed ? clockText(wrap.seconds) : t;
        hTime.textContent = p;
        cardTime.textContent = t;
        var i = p.indexOf(':');
        vMm.textContent = i === -1 ? '' : p.slice(0, i);
        vSs.textContent = i === -1 ? '' : p.slice(i + 1);
    }

    function setExpanded(next, animate) {
        var opening = next && !expanded;
        var closing = !next && expanded;
        expanded = next;
        vchipEl.hidden = next;
        if (next) {
            pillFit.size = 0; // reappears at its own size, no ease
        }
        syncExpandedAria();
        if (panel) {
            cardEl.hidden = true;
            setPanelOpen(next, animate);
            place(false);
            // Opening the phone shows the missed calls: reset the count.
            if (opening && missedCount() > 0) send('markMissedSeen');
            // The dialer refreshes its voicemail list while it shows.
            if ((opening || closing) && panel.shown) panel.shown(next);
            syncIncoming(); // open panel: its ring view replaces the card
            return;
        }
        var wasOpen = !cardEl.hidden;
        cardEl.hidden = !next;
        place(false);
        if (next && !wasOpen) {
            if (animate) {
                cardEl.classList.add('closed');
                void cardEl.offsetWidth; // commit the closed state so the transition runs
            }
            cardEl.classList.remove('closed');
        } else if (!next) {
            cardEl.classList.add('closed');
        }
    }

    // Panel open/close: 200 ms opacity + 12 px slide from its side (CSS in
    // the dialer; reduced motion keeps the opacity only).
    function setPanelOpen(open, animate) {
        var el = panel.el;
        if (open) {
            window.clearTimeout(panelHideTimer);
            var wasHidden = el.hidden;
            el.hidden = false;
            placePanel(); // reads the panel's height, so it runs with the panel shown
            if (wasHidden && animate) {
                el.classList.add('closed');
                void el.offsetWidth; // commit the closed state so the transition runs
            }
            el.classList.remove('closed');
        } else if (!el.hidden && !el.classList.contains('closed')) {
            el.classList.add('closed');
            window.clearTimeout(panelHideTimer);
            panelHideTimer = window.setTimeout(function () {
                if (!expanded) el.hidden = true;
                syncLift();
            }, PANEL_FADE_MS);
        }
    }

    // --- Placement ---
    function safeTop() {
        // Keep 8 px below the NetSuite header when there is one. In the shell
        // the header lives in the full-size NetSuite frame at the same place.
        var top = EDGE;
        var doc = document;
        if (mode === 'shell') {
            var frame = document.getElementById('ctc-ns-frame');
            try { doc = frame && frame.contentDocument; } catch (e) { doc = null; }
        }
        var header = doc && doc.querySelector('#ns_navigation, #ns-header-menu-main, .ns-navigation, #div__header');
        if (header) {
            var r = header.getBoundingClientRect();
            if (r.bottom > 0 && r.bottom < window.innerHeight / 2) top = Math.max(top, r.bottom + 8);
        }
        return top;
    }

    function isVertCorner(c) { return c === 'ml' || c === 'mr'; }

    // Vertical pill on ml / mr, horizontal elsewhere. A shape switch is not
    // a size change: the pill starts at its own size in the new shape.
    function setOrient() {
        var v = isVertCorner(corner);
        if (v === dockEl.classList.contains('vert')) return;
        var refocus = root.activeElement && root.activeElement === pillFocusTarget();
        dockEl.classList.toggle('vert', v);
        pillFit.size = 0;
        fitPill();
        if (refocus) focusPill();
    }

    // Rendered size of the pill in one orientation. Toggles the class and back
    // in the same task, so nothing paints and no resize is observed. The pill
    // is always laid out at its natural size (a size ease is drawn by
    // transforms only).
    function sizeOf(vert) {
        var was = dockEl.classList.contains('vert');
        if (was === vert) return { w: dockEl.offsetWidth, h: dockEl.offsetHeight };
        dockEl.classList.toggle('vert', vert);
        var s = { w: dockEl.offsetWidth, h: dockEl.offsetHeight };
        dockEl.classList.toggle('vert', was);
        return s;
    }

    // Placement of a pill of size `size` (default: as rendered now) at `c`.
    function cornerXY(c, size) {
        var w = size ? size.w : dockEl.offsetWidth;
        var h = size ? size.h : dockEl.offsetHeight;
        var top = safeTop();
        var bottom = window.innerHeight - h - BOTTOM_GAP;
        var col = c.charAt(1);
        var row = c.charAt(0);
        return {
            x: col === 'l' ? EDGE : col === 'r' ? window.innerWidth - w - EDGE : (window.innerWidth - w) / 2,
            y: row === 't' ? top : row === 'b' ? bottom : Math.max(top, (top + bottom) / 2)
        };
    }

    // Snap point whose placement is nearest to the dock's centre (cx, cy).
    // Each point is measured with the pill it would hold there (vertical on
    // ml / mr), so the centres compare like for like.
    function nearestCorner(cx, cy) {
        var sizes = { h: sizeOf(false), v: sizeOf(true) };
        var best = DEFAULT_CORNER;
        var bestD = Infinity;
        CORNERS.forEach(function (c) {
            var s = isVertCorner(c) ? sizes.v : sizes.h;
            var xy = cornerXY(c, s);
            var dx = xy.x + s.w / 2 - cx;
            var dy = xy.y + s.h / 2 - cy;
            var d = dx * dx + dy * dy;
            if (d < bestD) { bestD = d; best = c; }
        });
        return best;
    }

    function applyTransform(lift) {
        dockEl.style.transform = 'translate3d(' + Math.round(pos.x) + 'px,' + Math.round(pos.y) + 'px,0)' + (lift ? ' scale(1.02)' : '');
    }

    // An animated snap that changes orientation glides in the current shape,
    // then switches shape and re-places without animation.
    function place(animate) {
        if (drag && drag.moved) return;
        var glide = animate && !reduced();
        var flip = isVertCorner(corner) !== dockEl.classList.contains('vert');
        window.clearTimeout(orientTimer);
        orientTimer = null;
        if (!glide || !flip) setOrient();
        var xy = cornerXY(corner);
        pos.x = xy.x;
        pos.y = xy.y;
        var col = corner.charAt(1);
        var row = corner.charAt(0);
        dockEl.setAttribute('data-row', row);
        dockEl.setAttribute('data-col', col);
        cardEl.style.transformOrigin = (col === 'r' ? 'right ' : col === 'l' ? 'left ' : 'center ') + (row === 'b' ? 'bottom' : row === 't' ? 'top' : 'center');
        // will-change only while the dock moves (a drag, this glide).
        if (glide) {
            dockEl.style.transition = 'transform ' + SETTLE;
            dockEl.style.willChange = 'transform';
            window.setTimeout(function () { dockEl.style.transition = ''; dockEl.style.willChange = ''; }, 320);
        } else {
            dockEl.style.transition = '';
            dockEl.style.willChange = '';
        }
        applyTransform(false);
        placeIncoming(glide);
        if (glide && flip) {
            orientTimer = window.setTimeout(function () {
                orientTimer = null;
                place(false);
            }, 320);
        }
    }

    // Panel size: 380 x 682, capped by the screen (16 px each side, safe
    // top to 24 px above the bottom).
    function panelSize() {
        var avail = Math.max(0, window.innerHeight - safeTop() - BOTTOM_GAP);
        return { w: Math.min(PANEL_W, window.innerWidth - 2 * EDGE), h: Math.min(PANEL_H, avail) };
    }

    // Panel placement at snap point `c`, by the pill's rule: column l / c / r
    // at the left edge, centred, right edge; row t at the safe top, m centred
    // in the area between, b 24 px above the bottom.
    function panelXY(c, size) {
        var top = safeTop();
        var bottom = window.innerHeight - size.h - BOTTOM_GAP;
        var col = c.charAt(1);
        var row = c.charAt(0);
        return {
            x: col === 'l' ? EDGE : col === 'r' ? window.innerWidth - size.w - EDGE : (window.innerWidth - size.w) / 2,
            y: row === 't' ? top : row === 'b' ? bottom : Math.max(top, (top + bottom) / 2)
        };
    }

    // Snap point whose panel placement is nearest to the panel centre (cx, cy).
    function nearestPanelCorner(cx, cy, size) {
        var best = DEFAULT_CORNER;
        var bestD = Infinity;
        CORNERS.forEach(function (c) {
            var xy = panelXY(c, size);
            var dx = xy.x + size.w / 2 - cx;
            var dy = xy.y + size.h / 2 - cy;
            var d = dx * dx + dy * dy;
            if (d < bestD) { bestD = d; best = c; }
        });
        return best;
    }

    // The panel at the pill's point, settled (no drag offset). left / top
    // hold the settled place; a drag and its settle move only `translate`.
    // data-side: the edge the open / close slide comes from (l, r, else
    // the row's t or b).
    function placePanel() {
        if (!panel || (panelDrag && panelDrag.moved)) return;
        var el = panel.el;
        var s = el.style;
        var size = panelSize();
        var xy = panelXY(corner, size);
        stopPanelSettle();
        s.translate = '';
        s.width = size.w + 'px';
        s.height = size.h + 'px';
        s.left = Math.round(xy.x) + 'px';
        s.top = Math.round(xy.y) + 'px';
        var col = corner.charAt(1);
        el.setAttribute('data-side', col === 'c' ? corner.charAt(0) : col);
        syncLift();
    }

    // The lifted-shadow layer follows the panel's box (left / top / size /
    // translate) and its lifted / settling state. It shows only while
    // lifted (opacity), so the open / close slide needs no copy.
    function syncLift() {
        if (!panelLift || !panel) return;
        var ps = panel.el.style, ls = panelLift.style;
        ls.left = ps.left;
        ls.top = ps.top;
        ls.width = ps.width;
        ls.height = ps.height;
        ls.translate = ps.translate;
        panelLift.hidden = panel.el.hidden;
        panelLift.classList.toggle('lifted', panel.el.classList.contains('lifted'));
        panelLift.classList.toggle('settling', panel.el.classList.contains('settling'));
    }

    function stopPanelSettle() {
        window.clearTimeout(panelSettleTimer);
        panelSettleTimer = null;
        if (panel) panel.el.classList.remove('settling');
        syncLift();
    }

    // The panel's drag offset as drawn now (mid-settle too).
    function panelOffset() {
        var t = window.getComputedStyle(panel.el).translate;
        var parts = !t || t === 'none' ? [] : t.split(' ');
        return { x: parseFloat(parts[0]) || 0, y: parseFloat(parts[1]) || 0 };
    }

    // Rubber band: past [lo, hi] the panel moves at RUBBER of the pointer at
    // first and never more than `room` px (it stays on the screen).
    function rubber(v, lo, hi, room) {
        if (v >= lo && v <= hi) return v;
        var over = v < lo ? lo - v : v - hi;
        var d = room > 0 ? room * (1 - 1 / (over * RUBBER / room + 1)) : 0;
        return v < lo ? lo - d : hi + d;
    }

    // Flick: how far a release throws ahead (px). The pointer's speed over
    // its last 100 ms of moves, projected FLICK_PROJECT_MS on, when faster
    // than FLICK_SPEED. A pointer held still before release throws nothing.
    function flick(samples, e) {
        var first = samples[0];
        var last = samples[samples.length - 1];
        var now = e.timeStamp || Date.now();
        if (!first || !last || last.t <= first.t || now - last.t > 100) return { x: 0, y: 0 };
        var vx = (last.x - first.x) / (last.t - first.t);
        var vy = (last.y - first.y) / (last.t - first.t);
        if (Math.sqrt(vx * vx + vy * vy) <= FLICK_SPEED) return { x: 0, y: 0 };
        return { x: vx * FLICK_PROJECT_MS, y: vy * FLICK_PROJECT_MS };
    }

    // --- Incoming card ---
    // Shows while the phase is 'incoming', the pill shows (panel closed) and
    // this tab draws the shell's pill (the shell, or a tab whose phone runs
    // in another tab). Opening the panel (its ring view takes over) or
    // hiding the dock removes it at once; otherwise it exits toward the pill
    // (answer, decline, caller hung up). It never takes focus by itself and
    // Escape does nothing (no accidental decline).
    function ringKey() {
        if (!snap) return '';
        var c = snap.caller || {};
        return String(snap.callSid || '') || ('n:' + String(c.number || snap.number || ''));
    }

    function incomingWanted() {
        if (!snap || snap.phase !== 'incoming') return false;
        if (dockEl.hidden || vchipEl.hidden) return false;
        if (mode === 'outside' && !phoneElsewhere()) return false;
        return ringKey() !== incDismissed;
    }

    var CARD_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // "Last call Nov 12": the newest 'call' row of the call context's
    // activity ('' when there is none or the context is not loaded).
    function lastCallText(ctx) {
        var best = null;
        var bestT = -Infinity;
        ((ctx && Array.isArray(ctx.activity)) ? ctx.activity : []).forEach(function (a) {
            if (!a || a.kind !== 'call') return;
            var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(a.at || ''));
            var d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
            if (!d && a.ageDays != null && a.ageDays !== '' && !isNaN(Number(a.ageDays))) d = new Date(Date.now() - Number(a.ageDays) * 86400000);
            if (d && !isNaN(d.getTime()) && d.getTime() > bestT) { best = d; bestT = d.getTime(); }
        });
        return best ? 'Last call ' + CARD_MONTHS[best.getMonth()] + ' ' + best.getDate() : '';
    }

    // Name line: caller name, else the number in display form (SF Mono).
    // Hint line (asset 40): "contact · Last call Nov 12", each part only
    // when known; "Not in NetSuite" for a number with no record.
    function fillIncoming() {
        var c = snap.caller || {};
        var name = String(c.name || '');
        var contact = String(snap.contactName || '');
        var title = callerText();
        var hint;
        if (!name) {
            hint = 'Not in NetSuite';
        } else {
            var x = window.__ctcDock && window.__ctcDock.host;
            var ctx = x && typeof x.ringContext === 'function' ? x.ringContext() : null;
            hint = [contact && contact !== title ? contact : '', lastCallText(ctx)].filter(function (v) { return v; }).join(' · ');
        }
        incName.textContent = title;
        incName.classList.toggle('mono', !name);
        incSub.textContent = hint;
        incSub.hidden = !hint;
        incEl.setAttribute('aria-label', 'Incoming call from ' + title);
        incAnswer.setAttribute('aria-label', 'Answer call from ' + title);
        incDecline.setAttribute('aria-label', 'Decline call from ' + title);
    }

    // Card place for a pill at p {x, y, w, h}, card size s {w, h}, viewport
    // vw x vh: centred on the pill, kept EDGE inside the viewport. One rule
    // for every snap point, horizontal or vertical pill.
    function incomingXY(p, s, vw, vh) {
        var x = p.x + (p.w - s.w) / 2;
        var y = p.y + (p.h - s.h) / 2;
        return {
            x: Math.max(EDGE, Math.min(x, vw - s.w - EDGE)),
            y: Math.max(EDGE, Math.min(y, vh - s.h - EDGE))
        };
    }

    // The pill and the card placed on it: while dragged, the pill where it
    // is drawn; else where it settles (a snap glide's end, in the shape it
    // takes there). Returns { p, s, at } (pill rect, card size, card x / y).
    function incomingGeom() {
        var p;
        if (drag && drag.moved) {
            p = { x: pos.x, y: pos.y, w: dockEl.offsetWidth, h: dockEl.offsetHeight };
        } else {
            var size = sizeOf(isVertCorner(corner));
            var xy = cornerXY(corner, size);
            p = { x: xy.x, y: xy.y, w: size.w, h: size.h };
        }
        var s = { w: incEl.offsetWidth, h: incEl.offsetHeight };
        var at = incomingXY(p, s, window.innerWidth, window.innerHeight);
        return { p: p, s: s, at: { x: Math.round(at.x), y: Math.round(at.y) } };
    }

    // glide: the card glides with the pill (translate, SETTLE).
    function placeIncoming(glide) {
        if (!incShown) return;
        var g = incomingGeom();
        var st = incEl.style;
        st.transition = glide && !reduced() ? 'translate ' + SETTLE : '';
        st.translate = g.at.x + 'px ' + g.at.y + 'px';
    }

    // The pill's rect relative to the card (pill radius): where the enter
    // starts and the exit ends.
    function pillRectOnCard(g) {
        return { x: g.p.x - g.at.x, y: g.p.y - g.at.y, w: g.p.w, h: g.p.h, r: Math.min(g.p.w, g.p.h) / 2 };
    }

    function stopIncomingAnim() {
        incSideAnims.forEach(function (s) { s.cancel(); });
        incSideAnims = [];
        if (!incAnim) return;
        incAnim.onfinish = null;
        incAnim.cancel();
        incAnim = null;
    }

    // Pill hidden under the open card (inline opacity, so it outlives the
    // fade), or shown again.
    function setPillUnderCard(under) {
        vchipEl.style.opacity = under ? '0' : '';
    }

    // Enter (INC_ENTER_MS): a FLIP morph on a spring. A rounded window onto
    // the card's surface and shadow (morph stack in window mode, see
    // morphStack) grows from the pill's rect and radius to the card plus
    // INC_OUTSET all round (the shadow layer fades in as the window passes
    // the card's edges). The pill's dot and Answer travel into the card's
    // (shared parts, so the eye follows them, not an outline); the name and
    // Decline fade in out of a blur early (the card is never empty); the
    // pill fades out at once. Exit (INC_EXIT_MS, settle curve): the words
    // go first, the window and the shared parts return to the pill, the
    // pill fades in. Transform, opacity and a small blur only (WAAPI).
    // Reduced motion: the card's opacity only, INC_REDUCED_MS. A new enter
    // / exit starts from what is drawn now (window rect, parts' transforms),
    // so a ring during an exit turns it around smoothly.
    function animateIncoming(show) {
        var red = reduced();
        var canAnimate = typeof incEl.animate === 'function';
        var running = !!incAnim && canAnimate;
        var morphing = running && incEl.classList.contains('morph');
        var opacityNow = function (el) { return window.getComputedStyle(el).opacity; };
        var pillFrom = running ? opacityNow(vchipEl) : (show ? '1' : '0');
        var words = [incText, incDecline];
        var shared = [incDot, incAnswer];
        var wordsFrom = words.map(function (el) { return running ? opacityNow(el) : (show ? '0' : '1'); });
        var sharedFrom = shared.map(function (el) {
            if (!running) return null;
            var m = parseMatrix(window.getComputedStyle(el).transform);
            return m ? { dx: m.tx, dy: m.ty, s: m.sx, o: opacityNow(el) } : { dx: 0, dy: 0, s: 1, o: opacityNow(el) };
        });
        var cardFrom = running && !morphing ? opacityNow(incEl) : null;
        var card = boxOf(incEl, INC_RADIUS);
        var open = { x: -INC_OUTSET, y: -INC_OUTSET, w: card.w + 2 * INC_OUTSET, h: card.h + 2 * INC_OUTSET, r: INC_OUTSET_RADIUS };
        var rectFrom = morphing ? stackRect(incSurf, open) : null;
        stopIncomingAnim();
        incEl.classList.remove('morph');
        if (!canAnimate) {
            setPillUnderCard(show);
            if (!show) incEl.hidden = true;
            return;
        }
        var dur = red ? INC_REDUCED_MS : show ? INC_ENTER_MS : INC_EXIT_MS;
        var side = function (el, frames, opts) { incSideAnims.push(el.animate(frames, opts)); };
        var fade = function (el, a, b, delay, ms) {
            side(el, [{ opacity: a }, { opacity: b }], { duration: ms, delay: delay, easing: ENTER_EASE, fill: 'both' });
        };
        setPillUnderCard(false); // the fade owns the pill's opacity until the end
        var a;
        if (red) {
            fade(vchipEl, pillFrom, show ? 0 : 1, 0, dur);
            a = incEl.animate([{ opacity: cardFrom !== null ? cardFrom : (show ? 0 : 1) }, { opacity: show ? 1 : 0 }], { duration: dur, easing: ENTER_EASE, fill: 'both' });
        } else {
            var g = incomingGeom();
            var pillR = pillRectOnCard(g);
            var from = rectFrom || (show ? pillR : open);
            var curve = show ? SPRING_CURVE : SETTLE_CURVE;
            layoutStack(incSurf, open, 0, SEAM, surfaceLook(incEl), incEl.clientLeft, incEl.clientTop, true, card);
            incEl.classList.add('morph');
            var to = show ? open : pillR;
            var pieces = morphStack(incSurf, open, from, to, { duration: dur, fill: 'both' }, curve);
            // The card's shadow (its layer, in place) shows as the window
            // opens past the card's edges: opacity = how far past, of
            // INC_OUTSET (a pieced, see-through shadow would show seams).
            pieces.push(incShade.animate(sampleRects(from, to, curve).map(function (smp) {
                var r = smp.rect;
                var past = Math.min(-r.x, -r.y, r.x + r.w - card.w, r.y + r.h - card.h) / INC_OUTSET;
                return { offset: smp.t, opacity: round3(Math.max(0, Math.min(1, past))) };
            }), { duration: dur, easing: 'linear', fill: 'both' }));
            a = pieces.shift();
            incSideAnims = pieces;
            // Shared parts: the pill's dot and Answer become the card's. Their
            // offset from the card's own place, measured at rest.
            var home = shared.map(function (el, i) {
                var src = i === 0 ? vDot : vMain;
                var r1 = src && src.getBoundingClientRect();
                var r2 = el.getBoundingClientRect();
                if (!r1 || !r1.width || !r2.width) return null;
                return { dx: (r1.left + r1.width / 2) - (r2.left + r2.width / 2), dy: (r1.top + r1.height / 2) - (r2.top + r2.height / 2), s: r1.width / r2.width };
            });
            var rest = { dx: 0, dy: 0, s: 1 };
            if (show) {
                fade(vchipEl, pillFrom, 0, 0, INC_WORDS_OUT_MS);
                shared.forEach(function (el, i) {
                    var h = home[i];
                    var f = sharedFrom[i] || h;
                    if (!f) { fade(el, sharedFrom[i] ? sharedFrom[i].o : 0, 1, 0, Math.round(dur * INC_CONTENT_SPAN)); return; }
                    side(el, curveFrames(f, rest, SPRING_CURVE), { duration: dur, easing: 'linear', fill: 'both' });
                    if (sharedFrom[i] && sharedFrom[i].o !== '1') fade(el, sharedFrom[i].o, 1, 0, Math.round(dur * 0.3));
                });
                words.forEach(function (el, i) {
                    var o = Number(wordsFrom[i]) || 0;
                    side(el, [{ opacity: o, filter: 'blur(' + round3(INC_BLUR_PX * (1 - o)) + 'px)' }, { opacity: 1, filter: 'blur(0px)' }],
                        { duration: Math.round(dur * INC_CONTENT_SPAN), delay: running ? 0 : Math.round(dur * (INC_CONTENT_AT + i * INC_CONTENT_STAGGER)), easing: ENTER_EASE, fill: 'both' });
                });
            } else {
                words.forEach(function (el, i) { fade(el, wordsFrom[i], 0, 0, INC_WORDS_OUT_MS); });
                shared.forEach(function (el, i) {
                    var h = home[i];
                    var f = sharedFrom[i] || rest;
                    var o = sharedFrom[i] ? sharedFrom[i].o : '1';
                    if (h) side(el, curveFrames(f, h, SETTLE_CURVE), { duration: dur, easing: 'linear', fill: 'both' });
                    fade(el, o, 0, Math.round(dur * 0.4), Math.round(dur * 0.6));
                });
                fade(vchipEl, pillFrom, 1, Math.round(dur * 0.6), INC_WORDS_OUT_MS);
            }
        }
        incAnim = a;
        a.onfinish = function () {
            if (incAnim !== a) return;
            stopIncomingAnim(); // the end state is the elements' own (shown) or hidden
            incEl.classList.remove('morph');
            setPillUnderCard(show);
            if (!show) incEl.hidden = true;
        };
    }

    // Show / update / remove the card for the current snapshot and pill.
    function syncIncoming() {
        if (!snap || snap.phase !== 'incoming') incDismissed = '';
        if (incomingWanted()) {
            fillIncoming();
            if (!incShown) {
                incShown = true;
                incEl.hidden = false;
                incEl.style.pointerEvents = '';
                placeIncoming(false);
                animateIncoming(true);
            } else {
                placeIncoming(false); // the sub line may have changed its height
            }
            return;
        }
        if (!incShown) return;
        incShown = false;
        var hadFocus = incEl.contains(root.activeElement);
        if (dockEl.hidden || vchipEl.hidden) {
            stopIncomingAnim();
            incEl.classList.remove('morph');
            setPillUnderCard(false);
            incEl.hidden = true;
            return;
        }
        incEl.style.pointerEvents = 'none'; // a fading card never takes a click
        animateIncoming(false);
        if (hadFocus) focusPill(); // keyboard Answer / Decline: focus stays with the dock
    }

    // Answer / Decline on the card or the pill: the bus request (origin +
    // nonce), then the card exits and stays away for this ring. Answer also
    // opens the phone on the call (DESIGN.md §4: the card's exit and the
    // panel open start together); Decline never does.
    function respondIncoming(action) {
        if (!snap || snap.phase !== 'incoming') return;
        incDismissed = ringKey();
        send(action);
        syncIncoming();
        if (action === 'answer') openCallView();
    }

    // The panel opens at once in its in-call view; the dialer moves focus
    // to End when the phase goes live. Without a panel the call card opens
    // once the phase is live (followAnswer).
    function openCallView() {
        if (!panel) { answeredRing = incDismissed; return; }
        if (panel.answered) panel.answered();
        panel.open({});
        setExpanded(true, true);
        saveUi();
    }

    // No panel: the answered ring went live, so open the call card and
    // focus its End. The ring ending another way (missed, error) drops it.
    function followAnswer() {
        if (!answeredRing || !snap) return;
        if (snap.phase === 'incoming' && ringKey() === answeredRing) return;
        answeredRing = '';
        if (panel || !isActive() || dockEl.hidden) return;
        setExpanded(true, true);
        try { endBtn.focus({ preventScroll: true }); } catch (e) { endBtn.focus(); }
    }

    // --- Wrap-up ---
    // A call ended (a live phase went back to ready): the pill says "Call
    // ended" with the caller and the final length, and offers Call back, for
    // WRAP_MS. Never blocks dialing: any other phase (a new call, a ring, a
    // dial) drops it at once. Driven only by the snapshots.
    function clearWrap() {
        wrap = null;
        if (wrapTimer) { window.clearTimeout(wrapTimer); wrapTimer = null; }
    }

    function trackWrap(prev, next) {
        if (!next || next.phase !== 'ready') { clearWrap(); return; }
        if (!prev || !ACTIVE[prev.phase]) return;
        // An inbound call that never connected is a missed call, not a
        // wrap-up: the pill shows it as missed, like the panel (asset 42).
        if (prev.direction === 'inbound' && !prev.startedAt) { clearWrap(); return; }
        var c = (prev.direction === 'inbound' && prev.caller) || {};
        var number = String(prev.number || c.number || '');
        clearWrap();
        if (!number) return;
        var entityName = String(prev.entityName || c.name || '');
        wrap = {
            number: number,
            display: entityName || String(prev.contactName || '') || formatPhone(number) || number,
            entityName: entityName,
            entityId: String(prev.entityId || c.entityId || ''),
            entityType: String(prev.entityType || c.entityType || ''),
            seconds: prev.startedAt ? Math.max(0, Math.floor((Date.now() - prev.startedAt) / 1000)) : 0,
            timed: !!prev.startedAt
        };
        wrapTimer = window.setTimeout(function () {
            wrapTimer = null;
            wrap = null;
            render();
        }, WRAP_MS);
    }

    // Call back on the wrap-up pill: the dialer's normal dial path (Dial tab
    // loads the record or number, then dials). The pill drops the stage now.
    function callBackFromWrap() {
        var w = wrap;
        clearWrap();
        if (w && panel && panel.callBack) {
            panel.callBack({ number: w.number, name: w.entityName, entityId: w.entityId, entityType: w.entityType });
        }
        render();
    }


    // --- Drag (the pill, and the incoming card on it) ---
    // The whole pill is the handle, its buttons included. The pointer is captured by
    // the button pressed (else the pill), so a plain press still clicks that
    // button and a fast drag never loses the pointer.
    function bindDrag(el) {
        el.addEventListener('pointerdown', function (e) {
            if (e.button !== 0 || drag) return;
            suppressClick = false;
            var btn = e.target && e.target.closest ? e.target.closest('button') : null;
            var cap = btn && el.contains(btn) ? btn : el;
            drag = { id: e.pointerId, el: cap, x0: e.clientX, y0: e.clientY, ox: pos.x, oy: pos.y, moved: false, samples: [] };
            cap.setPointerCapture(e.pointerId);
        });
        el.addEventListener('pointermove', onDragMove);
        el.addEventListener('pointerup', endDrag);
        el.addEventListener('pointercancel', endDrag);
    }

    function onDragMove(e) {
        if (!drag || e.pointerId !== drag.id) return;
        var dx = e.clientX - drag.x0;
        var dy = e.clientY - drag.y0;
        if (!drag.moved && Math.sqrt(dx * dx + dy * dy) <= DRAG_THRESHOLD) return;
        if (!drag.moved) {
            drag.moved = true;
            dockEl.style.transition = '';
            dockEl.style.willChange = 'transform';
            dockEl.classList.add('lifted');
            if (incShown) incEl.classList.add('lifted');
            // Bounds for this drag: the snap points' extremes (the pill's
            // size and the safe top as the drag starts).
            drag.w = dockEl.offsetWidth;
            drag.h = dockEl.offsetHeight;
            drag.top = safeTop();
        }
        // Clamped to the screen: past the bounds the pill rubber-bands (as
        // the panel does) and never leaves the screen. Room: the gap to the
        // screen edge less what the 1.02 lift adds on each side.
        var grow = LIFT / 2;
        var rawY = drag.oy + dy;
        var roomY = (rawY < drag.top ? Math.min(EDGE, drag.top) : BOTTOM_GAP) - drag.h * grow;
        pos.x = rubber(drag.ox + dx, EDGE, Math.max(EDGE, window.innerWidth - drag.w - EDGE), EDGE - drag.w * grow);
        pos.y = rubber(rawY, drag.top, Math.max(drag.top, window.innerHeight - drag.h - BOTTOM_GAP), roomY);
        applyTransform(true);
        placeIncoming(false);
        var now = e.timeStamp || Date.now();
        drag.samples.push({ x: e.clientX, y: e.clientY, t: now });
        while (drag.samples.length > 2 && now - drag.samples[0].t > 100) drag.samples.shift();
    }

    function endDrag(e) {
        if (!drag || e.pointerId !== drag.id) return;
        var d = drag;
        drag = null;
        try { d.el.releasePointerCapture(e.pointerId); } catch (err) { /* already released */ }
        if (!d.moved) return;
        suppressClick = true;
        pressAction = null;
        dockEl.classList.remove('lifted');
        incEl.classList.remove('lifted');

        var fl = flick(d.samples, e);
        corner = nearestCorner(pos.x + dockEl.offsetWidth / 2 + fl.x, pos.y + dockEl.offsetHeight / 2 + fl.y);
        saveCorner(corner);
        place(true);
    }
    bindDrag(vchipEl);
    // The incoming card drags the dock too (finding #87): the card sits on
    // the pill (hidden under it) and follows it, so moving the card moves
    // the pill; Answer / Decline still click on a plain press.
    bindDrag(incEl);
    incEl.addEventListener('click', function (e) {
        if (!suppressClick) return;
        suppressClick = false;
        e.stopImmediatePropagation();
        e.preventDefault();
    }, true);
    // A drag never clicks the pill or its buttons (capture phase, before the
    // button sees it; immediate, so the pill's own click below skips too).
    vchipEl.addEventListener('click', function (e) {
        if (!suppressClick) return;
        suppressClick = false;
        e.stopImmediatePropagation();
        e.preventDefault();
    }, true);

    // Keyboard: arrows step to the next snap point on the 3 x 3 grid (the
    // centre is skipped), no animation.
    var ROWS = 'tmb';
    var COLS = 'lcr';
    function onArrow(e) {
        var r = ROWS.indexOf(corner.charAt(0));
        var c = COLS.indexOf(corner.charAt(1));
        var dr = 0, dc = 0;
        if (e.key === 'ArrowUp') dr = -1;
        else if (e.key === 'ArrowDown') dr = 1;
        else if (e.key === 'ArrowLeft') dc = -1;
        else if (e.key === 'ArrowRight') dc = 1;
        else return;
        e.preventDefault();
        var nr = r + dr, nc = c + dc;
        if (nr === 1 && nc === 1) { nr += dr; nc += dc; } // skip the centre
        if (nr < 0 || nr > 2 || nc < 0 || nc > 2) return;
        corner = ROWS.charAt(nr) + COLS.charAt(nc);
        saveCorner(corner);
        place(false);
    }
    vBody.addEventListener('keydown', onArrow);
    vMain.addEventListener('keydown', onArrow);

    // --- Drag (panel header) ---
    // Moves 1:1 with the pointer on both axes (translate only), lifted;
    // rubber-bands at the screen edge; on release snaps to the nearest of
    // the pill's eight points (a flick projects ahead like the pill's) and
    // the pill takes that point. Header buttons never start a drag. A new
    // press mid-settle catches the panel where it is drawn.
    function bindPanelDrag(handle) {
        var el = panel.el;
        handle.style.touchAction = 'none';
        handle.addEventListener('pointerdown', function (e) {
            panelSuppressClick = false;
            if (e.button !== 0 || panelDrag) return;
            if (e.target.closest && e.target.closest('button, a, input, select')) return;
            var off = panelOffset();
            stopPanelSettle();
            el.style.translate = off.x + 'px ' + off.y + 'px';
            syncLift();
            panelDrag = {
                id: e.pointerId, x0: e.clientX, y0: e.clientY,
                left: parseFloat(el.style.left) || 0, top: parseFloat(el.style.top) || 0,
                ox: off.x, oy: off.y, x: off.x, y: off.y, moved: false, samples: []
            };
            handle.setPointerCapture(e.pointerId);
        });
        handle.addEventListener('pointermove', function (e) {
            var d = panelDrag;
            if (!d || e.pointerId !== d.id) return;
            var dx = e.clientX - d.x0;
            var dy = e.clientY - d.y0;
            if (!d.moved && Math.sqrt(dx * dx + dy * dy) <= DRAG_THRESHOLD) return;
            if (!d.moved) {
                d.moved = true;
                if (!reduced()) el.classList.add('lifted');
            }
            // Bounds: the snap points' extremes. Room past them: the gap to
            // the screen edge (above the safe top at most EDGE) less what the
            // lift adds on each side.
            var size = panelSize();
            var grow = reduced() ? 0 : LIFT / 2;
            var top = safeTop();
            var rawY = d.top + d.oy + dy;
            var roomY = (rawY < top ? Math.min(EDGE, top) : BOTTOM_GAP) - size.h * grow;
            var x = rubber(d.left + d.ox + dx, EDGE, window.innerWidth - size.w - EDGE, EDGE - size.w * grow);
            var y = rubber(rawY, top, window.innerHeight - size.h - BOTTOM_GAP, roomY);
            d.x = x - d.left;
            d.y = y - d.top;
            el.style.translate = Math.round(d.x) + 'px ' + Math.round(d.y) + 'px';
            syncLift();
            var now = e.timeStamp || Date.now();
            d.samples.push({ x: e.clientX, y: e.clientY, t: now });
            while (d.samples.length > 2 && now - d.samples[0].t > 100) d.samples.shift();
        });
        function end(e) {
            var d = panelDrag;
            if (!d || e.pointerId !== d.id) return;
            panelDrag = null;
            try { handle.releasePointerCapture(e.pointerId); } catch (err) { /* already released */ }
            if (!d.moved) return;
            // The browser sends the release's click in this same task; no
            // click (cancel, pointer off the page) must not eat the next one.
            panelSuppressClick = true;
            window.setTimeout(function () { panelSuppressClick = false; }, 0);
            el.classList.remove('lifted');

            var size = panelSize();
            var vx0 = d.left + d.x; // where it was let go
            var vy0 = d.top + d.y;
            var fl = flick(d.samples, e);
            corner = nearestPanelCorner(vx0 + size.w / 2 + fl.x, vy0 + size.h / 2 + fl.y, size);
            saveCorner(corner);
            place(false); // the hidden pill takes the point (and its shape there)
            // Settle: left / top jump to the target while translate keeps the
            // panel where it was let go, then translate glides to zero.
            placePanel();
            el.style.translate = Math.round(vx0 - (parseFloat(el.style.left) || 0)) + 'px '
                + Math.round(vy0 - (parseFloat(el.style.top) || 0)) + 'px';
            syncLift();
            if (reduced()) { el.style.translate = ''; syncLift(); return; }
            void el.offsetWidth; // commit the start so the glide runs
            el.classList.add('settling');
            el.style.translate = '0px 0px';
            syncLift();
            panelSettleTimer = window.setTimeout(stopPanelSettle, SETTLE_MS);
        }
        handle.addEventListener('pointerup', end);
        handle.addEventListener('pointercancel', end);
        // The click that ends a drag clicks nothing (capture phase).
        handle.addEventListener('click', function (e) {
            if (!panelSuppressClick) return;
            panelSuppressClick = false;
            e.stopImmediatePropagation();
            e.preventDefault();
        }, true);
    }

    // --- Actions ---

    // The pill's own action: open the phone (panel), or the call card when
    // there is no panel; outside the shell with no phone, move into phone mode.
    function openFromPill() {
        if (mode === 'outside' && !phoneElsewhere()) { goShell(); return; }
        if (panel) {
            setExpanded(true, true);
            saveUi();
            panel.focus();
        } else if (isActive()) {
            setExpanded(true, true);
            cardTop.focus();
        }
        // Outside mode, idle, phone in another tab: nothing to open here.
    }
    // The pill's own action as it was when the press began (see pressAction).
    function takePillAction() {
        var a = pressAction !== null ? pressAction : pillAction;
        pressAction = null;
        return a;
    }
    function runPillAction(a) {
        if (a === 'unlock') { unlock(); return true; }
        if (a === 'signin') { signIn(); return true; }
        return false;
    }
    function onPillClick() {
        if (!runPillAction(takePillAction())) openFromPill();
    }
    vchipEl.addEventListener('pointerdown', function () { pressAction = pillAction; }, true);
    vchipEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') pressAction = pillAction;
    }, true);
    vBody.addEventListener('click', onPillClick);
    // The pill's padding and gaps act like its body.
    vchipEl.addEventListener('click', function (e) {
        if (!(e.target.closest && e.target.closest('button'))) onPillClick();
    });
    vMain.addEventListener('click', function () {
        if (vMain.classList.contains('disabled')) return; // not a control (presses fall through to the pill)
        var a = takePillAction();
        if (vMain.classList.contains('end')) send('hangup');
        else if (vMain.classList.contains('answer')) respondIncoming('answer');
        else if (vMain.classList.contains('callback')) callBackFromWrap();
        else if (!runPillAction(a)) openFromPill();
    });
    incAnswer.addEventListener('click', function () { respondIncoming('answer'); });
    incDecline.addEventListener('click', function () { respondIncoming('decline'); });
    vMute.addEventListener('click', function () { send(snap && snap.muted ? 'unmute' : 'mute'); });
    cardTop.addEventListener('click', function () {
        setExpanded(false, false);
        focusPill();
    });
    cardEl.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { setExpanded(false, false); focusPill(); }
    });
    muteBtn.addEventListener('click', function () { send(snap && snap.muted ? 'unmute' : 'mute'); });
    endBtn.addEventListener('click', function () { send('hangup'); });

    // --- Bus ---
    var helloTimer = null;
    // anchorId of the latest snapshot from a working anchor (not offline /
    // moved); requests carry it as 'anchor'.
    var anchorId = '';
    // snap.bus: the anchor's bus contract version (none: an older anchor, 1).
    function busVersionOf(s) {
        return s.bus === undefined || s.bus === null ? 1 : s.bus;
    }
    function busCompatible(s) {
        var v = busVersionOf(s);
        return typeof v === 'number' && v >= BUS_MIN_VERSION;
    }

    // Readiness handshake + anchor change. A working anchor (not offline /
    // moved) makes this tab ready and sends what waited. A new anchor id, or
    // our anchor saying offline / moved, is an anchor change: what the old one
    // never acked is dropped; after offline / moved requests wait again, and
    // this tab says hello (no time-out: the next anchor speaks when it starts).
    function trackAnchor(s) {
        var id = typeof s.anchorId === 'string' ? s.anchorId : '';
        trackAcks(s);
        if (s.phase !== 'offline' && s.phase !== 'moved') {
            if (id && anchorId && id !== anchorId) dropInflight();
            if (id) anchorId = id;
            anchorBus = busVersionOf(s);
            if (!ready) {
                ready = true;
                flushQueue();
            }
            return;
        }
        if (!ready || (id && anchorId && id !== anchorId)) return;
        ready = false;
        dropInflight();
        bus.postMessage({ v: 1, type: 'hello' });
    }

    // A stopped anchor (offline / moved) that is not the one this tab
    // follows: never drawn, so the tab stays on the live anchor (an anchor
    // that lost the one-anchor check sends 'moved', then 'offline' as its
    // frame unloads).
    function otherStoppedAnchor(s) {
        var id = typeof s.anchorId === 'string' ? s.anchorId : '';
        return (s.phase === 'offline' || s.phase === 'moved') && !!id && !!anchorId && id !== anchorId;
    }

    bus.onmessage = function (e) {
        var m = e.data;
        if (!m || m.v !== 1 || m.type !== 'snapshot' || !m.snap) return;
        // An anchor too old for this dock: not drawn, never sent to.
        if (!busCompatible(m.snap)) return;
        var ignore = otherStoppedAnchor(m.snap);
        trackAnchor(m.snap);
        if (ignore) return;
        window.clearTimeout(helloTimer);
        gotSnapshot = true;
        var prev = snap;
        // Our anchor stepped aside ('moved'): like any tab before the
        // handshake, the Starting pill until the winning anchor speaks.
        snap = m.snap.phase === 'moved' ? { phase: 'starting' } : m.snap;
        announce(prev, snap);
        trackWrap(prev, snap);
        render();
    };

    // Ask the anchor for a snapshot. No answer means no anchor: the anchor's
    // own 'offline' message on pagehide is not always delivered (crash,
    // killed tab), so silence is the reliable signal. Except in a shell that
    // just loaded: its phone frame is still starting (it speaks first when
    // ready), so the pill shows 'starting' instead of flashing 'offline'.
    // A shell waiting for the phone (another tab runs it) reads silence as
    // 'starting': the shell takes the phone when that tab does not answer
    // (asset 51, the phone follows you), so "Phone offline" would be wrong.
    function hello() {
        bus.postMessage({ v: 1, type: 'hello' });
        window.clearTimeout(helloTimer);
        var away = shellWaiting() || (mode === 'outside' && lockHeld !== false);
        helloTimer = window.setTimeout(function () {
            var booting = mode === 'shell' && !gotSnapshot && Date.now() - mountedAt < SHELL_BOOT_MS;
            var phase = booting || shellWaiting() ? 'starting' : 'offline';
            // Silence: no anchor. Requests wait (and drop) until one speaks.
            ready = false;
            if (!snap || snap.phase !== phase) { snap = { phase: phase }; clearWrap(); render(); }
        }, away ? REMOTE_HELLO_TIMEOUT_MS : HELLO_TIMEOUT_MS);
    }

    // --- Outside mode: who holds the phone? ---
    // done runs after the pill is drawn for the answer.
    function checkLock(done) {
        if (!navigator.locks || typeof navigator.locks.query !== 'function') {
            lockHeld = null;
            render();
            if (done) done();
            return;
        }
        navigator.locks.query().then(function (state) {
            lockHeld = (state.held || []).some(function (l) { return l.name === LOCK_NAME; });
        }, function () {
            lockHeld = null;
        }).then(function () {
            render();
            if (done) done();
        });
    }

    function exitFlagSet() {
        try { return window.sessionStorage.getItem(EXIT_KEY) === '1'; } catch (e) { return false; }
    }

    // Dashboard (portlet loader): move into phone mode by itself, once, when
    // no tab holds the phone and the rep did not leave phone mode in this tab.
    function maybeAutoEnter() {
        if (!cfg.autoEnter || !cfg.shellUrl || lockHeld !== false || exitFlagSet() || notEnabledFlag()) return;
        window.top.location.replace(shellHref());
    }

    // --- Sync and resize ---
    window.addEventListener('storage', function (e) {
        if (e.key !== CORNER_KEY || CORNERS.indexOf(e.newValue) === -1) return;
        corner = fitCorner(e.newValue);
        place(true);
        if (expanded) placePanel();
    });
    if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(function () { place(false); }).observe(dockEl);
    }
    window.addEventListener('resize', function () {
        place(false);
        if (expanded) placePanel();
    });

    // --- Public API ---
    window.__ctcDock = {
        mode: mode,

        // Shared display helper for ctc_dock_dialer.js.
        formatPhone: formatPhone,

        /**
         * Shell: open the dialer on Dial with `ctx` loaded and focus Call (it
         * never dials by itself). Outside: move this tab into phone mode.
         * @param {{entityId?: string, entityName?: string, entityType?: string, phone?: string}|null} [ctx]
         */
        call: function (ctx) {
            if (mode === 'outside' && !remote()) { goShell(); return; }
            if (!panel) {
                if (isActive()) { setExpanded(true, true); cardTop.focus(); }
                return;
            }
            panel.open({ ctx: normalizeContext(ctx) });
            setExpanded(true, true);
            saveUi();
            panel.focus('call');
        },

        /**
         * Shell: the record the NetSuite frame shows (null = none). The dialer
         * decides whether the Dial tab follows it.
         * @param {{entityId?: string, entityName?: string, entityType?: string, phone?: string}|null} ctx
         */
        setContext: function (ctx) {
            cfg.context = normalizeContext(ctx);
            if (panel && panel.setContext) panel.setContext(cfg.context);
            place(false);
            if (expanded) placePanel();
        },

        /**
         * While a call rings: focus Answer on the incoming card (or the
         * panel's Answer when the panel is open). The shell calls it from a
         * system notification click, after window.focus(). Never called on
         * a ring by itself: focus is not taken from a NetSuite form.
         * @returns {boolean} true when something took focus
         */
        focusIncoming: function () {
            if (!snap || snap.phase !== 'incoming') return false;
            if (incShown && !incEl.hidden) {
                try { incAnswer.focus({ preventScroll: true }); } catch (e) { incAnswer.focus(); }
                return true;
            }
            if (panel && expanded) { panel.focus(); return true; }
            return false;
        },

        // Extension surface for ctc_dock_dialer.js (shell and outside modes).
        // Not a public API.
        host: {
            cfg: cfg,
            mode: mode,
            // The phone in another tab (outside mode, or a waiting shell):
            // the panel is a remote control (no audio here, no Exit).
            isRemote: function () { return remote(); },
            unlockAudio: unlock,
            reloadPhone: reloadPhone,
            signIn: signIn,
            css: function (text) {
                var st = document.createElement('style');
                st.textContent = text;
                root.appendChild(st);
            },
            send: function (action, extra) { return request(action, extra); },
            // Sales Central icon: hidden on Sales Central itself.
            salesCentral: { here: function () { return onSalesCentral(); }, open: function (id) { openSalesCentral(id); } },
            // The user picked a view in the panel: share it (UI_KEY).
            saveUi: saveUi,
            collapse: function () { setExpanded(false, true); saveUi(); focusPill(); },
            // Set by the dialer: the ringing caller's call context once
            // loaded, else null (the incoming card's hint, asset 40).
            ringContext: null,
            // The dialer loaded that context: the card's hint fills in.
            contextChanged: function () { if (snap && snap.phase === 'incoming') syncIncoming(); },
            registerPanel: function (p) {
                panel = p;
                p.el.hidden = true;
                p.el.classList.add('closed');
                panelLift = document.createElement('div');
                panelLift.className = 'dl-lift';
                panelLift.setAttribute('aria-hidden', 'true');
                panelLift.hidden = true;
                root.appendChild(panelLift); // under the panel
                root.appendChild(p.el);
                if (p.handle) bindPanelDrag(p.handle);
                if (snap || mountedAt) render();
                applyUi();
            }
        },

        /**
         * Shell: the lock state changed (phoneState()); draw again.
         */
        refresh: function () { checkPage(); render(); },

        /**
         * true when the dialer panel is loaded (the shell's busy banner is
         * only the fallback without it).
         * @returns {boolean}
         */
        hasPanel: function () { return !!panel; }
    };

    function mount() {
        document.body.appendChild(host);
        checkPage();
        mountedAt = Date.now();
        // Outside: once the lock check says who holds the phone, the shared
        // UI state applies (the panel can open only then).
        if (mode === 'outside') checkLock(function () { maybeAutoEnter(); applyUi(); });
        // Shell: the Starting pill (disabled slot) until the anchor answers.
        else render();
        hello();
        window.setInterval(function () {
            if (document.hidden) return;
            if (mode === 'outside') checkLock();
            // Keep asking while the phone is in another tab, offline or not
            // (finding #95: a shell remote that once read offline never
            // asked again and stayed "Phone offline").
            if (snap && snap.phase !== 'offline') hello();
            else if ((mode === 'outside' && phoneElsewhere()) || shellWaiting()) hello();
        }, PING_INTERVAL_MS);
        // Back in this tab: the phone as the user left it (shared UI state).
        document.addEventListener('visibilitychange', function () {
            if (document.hidden) return;
            if (mode === 'outside') checkLock(applyUi);
            else applyUi();
            hello();
        });
        window.addEventListener('focus', applyUi);
    }

    if (document.body) mount();
    else document.addEventListener('DOMContentLoaded', mount);
})();
