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
 *             Call button goes to top.__ctcShell.call(ctx).
 *   outside - a normal NetSuite tab. Chip only: mirrors a phone held by
 *             another tab (Web Lock 'ctc-phone-anchor'), or offers
 *             "Open phone", which moves this tab into the shell.
 *
 * The pill sits on one of eight edge points; the point is shared by every
 * tab through localStorage. In the shell the dialer panel registers through
 * window.__ctcDock.host.registerPanel() and opens on the pill's point, one
 * fixed size for every view (PANEL_W x PANEL_H, the Search view's full
 * size). Pill and panel are one unit: dragging the panel's header snaps it
 * to one of the same eight points, and the pill comes back there. On the
 * left and right middle points (ml, mr) the pill stands vertical.
 */
(function () {
    'use strict';

    if (window.__ctcDock) return;

    var LOCK_NAME = 'ctc-phone-anchor';  // PHONE_LOCK_NAME in lib/ctc_dock.js
    var EXIT_KEY = 'ctc-phone-exit';     // EXIT_KEY in lib/ctc_dock.js

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

    // --- Frame mode: silent. The shell draws the one pill. ---
    if (mode === 'frame') {
        window.__ctcRecordContext = cfg.context;
        window.__ctcDock = {
            mode: 'frame',
            call: function () {
                var shell = shellObject();
                if (shell && typeof shell.call === 'function') shell.call(cfg.context);
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
    var PANEL_W = 380;
    // One panel height for every view: the Search view at full size. Views
    // that need less leave room at the bottom; views that need more scroll.
    var PANEL_H = 620;
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
    var ENTER_EASE = 'cubic-bezier(0.23, 1, 0.32, 1)';
    var ENTER_SHIFT = 6; // px the pill travels in from its edge
    var PANEL_FADE_MS = 200;
    var HELLO_TIMEOUT_MS = 600;
    // Shell: the phone frame loads after the dock. While it boots (up to
    // this long) a silent bus means "starting", not "offline".
    var SHELL_BOOT_MS = 15000;
    var PING_INTERVAL_MS = 15000;
    var ACTIVE = { dialing: true, ringing: true, connected: true };
    var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');

    var ICON_PHONE = '<path d="M2 5.5C2 3.6 3.6 2 5.5 2h1.3c.9 0 1.7.6 1.9 1.5l1 4c.2.8-.1 1.6-.8 2.1l-1.5 1.1a12 12 0 0 0 5.9 5.9l1.1-1.5c.5-.7 1.3-1 2.1-.8l4 1c.9.2 1.5 1 1.5 1.9v1.3c0 1.9-1.6 3.5-3.5 3.5A16.5 16.5 0 0 1 2 5.5z"></path>';
    var ICON_MIC = '<rect x="9" y="2" width="6" height="12" rx="3"></rect><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3"></path>';
    var ICON_RETRY = '<path d="M3 12a9 9 0 1 0 2.6-6.4L3 8M3 3v5h5"></path>';
    var ICON_MIC_OFF = '<path d="M2 2l20 20M9 9v3a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.9-.6M19 10v2a7 7 0 0 1-.6 2.8M5 10v2a7 7 0 0 0 12 5M12 19v3"></path>';

    var CSS = [
        ':host{all:initial}',
        '*{box-sizing:border-box}',
        '.dock{position:fixed;left:0;top:0;pointer-events:auto;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#FFFFFF;-webkit-font-smoothing:antialiased;will-change:transform}',
        // Author display rules beat the UA [hidden] rule, so restate it.
        '[hidden]{display:none !important}',
        'button{font:inherit;color:inherit;margin:0;border:0;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:transform 140ms ease-out,background-color 140ms ease-out}',
        'button:active{transform:scale(0.97)}',
        'button:focus-visible{outline:2px solid #74C0FC;outline-offset:2px}',
        '.navy{background:linear-gradient(180deg,#1A2B47 0%,#0F1B30 100%)}',
        '.dot{width:7px;height:7px;border-radius:999px;flex-shrink:0;background:var(--dot,#94A6BF)}',
        '.mono{font-family:"SF Mono","JetBrains Mono",Menlo,Consolas,monospace;font-variant-numeric:tabular-nums}',

        /* pill: one component in two shapes. Horizontal (R5) on six points:
           grip, dot, words, timer, Mute, main button in a row. Vertical (R4)
           on the left/right middle points (ml, mr): the same parts in a
           column, no words (labels live in title + aria-label). */
        '.vchip{display:flex;align-items:center;gap:10px;border-radius:26px;box-shadow:inset 0 1px 0 rgba(255,255,255,0.06),0 10px 24px rgba(15,27,48,0.26);touch-action:none;user-select:none;-webkit-user-select:none}',
        '.dock:not(.vert) .vchip{flex-direction:row;height:52px;padding:0 6px 0 14px}',
        '.dock.vert .vchip{flex-direction:column;width:52px;padding:10px 0}',
        '.dock:not(.vert) .vchip[data-main="none"]{padding-right:18px}',
        '.dock.vert .vchip[data-main="none"]{padding-bottom:16px}',
        '.dock.lifted .vchip{box-shadow:inset 0 1px 0 rgba(255,255,255,0.06),0 16px 36px rgba(15,27,48,0.32)}',
        '.v-body{display:flex;align-items:center;gap:10px;padding:0;border-radius:12px;background:transparent;text-align:left}',
        '.dock:not(.vert) .v-body{flex-direction:row;height:40px;min-width:0}',
        '.dock.vert .v-body{flex-direction:column;width:40px}',
        '.v-body:active{transform:none}',
        '.v-grip{display:grid;grid-template-columns:3px 3px;gap:2px;flex-shrink:0}',
        '.v-grip i{width:3px;height:3px;border-radius:999px;background:rgba(255,255,255,0.28)}',
        '.v-dot{width:8px;height:8px;border-radius:999px;flex-shrink:0;background:var(--dot,#94A6BF)}',
        '.vchip[data-stage="dialing"] .v-dot,.vchip[data-stage="ringing"] .v-dot{box-shadow:0 0 0 3px rgba(244,199,106,0.20)}',
        '.vchip[data-stage="connected"] .v-dot{box-shadow:0 0 0 3px rgba(20,185,129,0.20)}',
        '.vchip[data-muted="true"] .v-dot{background:#F4C76A;box-shadow:0 0 0 3px rgba(244,199,106,0.20)}',
        '.vchip[data-stage="starting"] .v-dot{animation:ctc-breathe 1.2s ease-in-out infinite alternate}',
        '@keyframes ctc-breathe{from{opacity:0.4}to{opacity:1}}',
        /* incoming: a soft ring that grows out of the dot and fades (ease-out).
           Only the dot moves; reduced motion keeps a still halo. */
        '.vchip[data-stage="incoming"] .v-dot{box-shadow:0 0 0 3px rgba(20,185,129,0.30);animation:ctc-ring 1.6s cubic-bezier(0.23,1,0.32,1) infinite}',
        '@keyframes ctc-ring{0%{box-shadow:0 0 0 0 rgba(20,185,129,0.55)}70%,100%{box-shadow:0 0 0 7px rgba(20,185,129,0)}}',
        /* each shape shows only its own words / timer */
        '.dock.vert .h-words,.dock.vert .h-time,.dock:not(.vert) .v-time{display:none}',
        '.h-words{display:flex;flex-direction:column;justify-content:center;min-width:0;max-width:168px}',
        '.h-l1,.h-l2{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
        '.h-l1{font-size:13px;font-weight:600;line-height:16px;color:#FFFFFF}',
        '.h-l2{font-size:11px;line-height:14px;color:#94A6BF}',
        '.h-l2.muted{color:#F4C76A}',
        '.h-time{flex-shrink:0;font-family:"SF Mono","JetBrains Mono",Menlo,Consolas,monospace;font-size:13px;font-weight:300;font-variant-numeric:tabular-nums;line-height:1;white-space:nowrap;color:#FFFFFF}',
        '.v-time{display:flex;flex-direction:column;align-items:center;font-family:"JetBrains Mono","SF Mono",Menlo,Consolas,monospace;font-size:13px;font-weight:300;font-variant-numeric:tabular-nums;line-height:1;color:#FFFFFF}',
        '.v-sep{font-size:7px;color:#94A6BF}',
        '.v-mute{width:36px;height:36px;border-radius:12px;background:rgba(255,255,255,0.10);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}',
        '.v-mute:hover{background:rgba(255,255,255,0.18)}',
        '.v-mute[aria-pressed="true"]{background:#F4C76A}',
        '.v-mute[aria-pressed="true"] svg{stroke:#1F2F4D}',
        '.v-main{width:40px;height:40px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}',
        '.v-main.call,.v-main.answer{background:#14B981;box-shadow:0 4px 12px rgba(20,185,129,0.36)}',
        '.v-main.answer:hover{background:#0E9E6D}',
        /* incoming: Decline (coral, like End) before Answer; vertical puts it under Answer */
        '.v-decline{width:40px;height:40px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;background:#EE6E5C;box-shadow:0 4px 12px rgba(238,110,92,0.40)}',
        '.v-decline:hover{background:#D85440}',
        '.v-decline svg{transform:rotate(135deg)}',
        '.dock.vert .v-decline{order:1}',
        '.v-main.end{background:#EE6E5C;box-shadow:0 4px 12px rgba(238,110,92,0.40)}',
        '.v-main.end:hover{background:#D85440}',
        '.v-main.end svg{transform:rotate(135deg)}',
        '.v-main.offline{background:#F4F2EE}',
        '.v-main.retry{width:36px;height:36px;border-radius:12px;background:#FCE9E7}',
        '.v-ico{display:none}',
        '.v-main.call .ico-call,.v-main.answer .ico-call,.v-main.end .ico-call,.v-main.offline .ico-offline,.v-main.retry .ico-retry{display:block}',
        /* offline / error: light pill */
        '.vchip.light{background:#FFFFFF;border:1px solid #E5E2DD;box-shadow:0 6px 16px rgba(22,21,19,0.08)}',
        '.vchip.light .v-grip i{background:#D9D5CF}',
        '.vchip.light.err{border-color:#F2C4BD}',
        '.vchip.light.err .v-grip i{background:#E5D3D0}',
        '.vchip.light .h-l1{color:#161513}',
        '.vchip.light .h-l2{color:#5C5955}',
        '.vchip.light.err .h-l1{color:#9A2A23}',

        /* card */
        '.card{width:300px;border-radius:14px;overflow:hidden;box-shadow:inset 0 1px 0 rgba(255,255,255,0.06),0 1px 1px rgba(0,0,0,0.08),0 16px 40px rgba(15,27,48,0.28);transition:opacity 200ms cubic-bezier(0.23,1,0.32,1),transform 200ms cubic-bezier(0.23,1,0.32,1)}',
        '.card.closed{opacity:0;transform:scale(0.96)}',
        '.card-top{width:100%;padding:14px 16px;display:flex;align-items:center;gap:12px;background:transparent;text-align:left;border-radius:0}',
        '.card-top:active{transform:none}',
        '.avatar{width:36px;height:36px;border-radius:999px;background:linear-gradient(135deg,#38507A 0%,#1F2F4D 100%);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;flex-shrink:0}',
        '.who{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}',
        '.who-name{font-size:14px;font-weight:600;letter-spacing:-0.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
        '.who-sub{font-size:12px;color:#94A6BF;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
        '.card-time{font-size:15px;font-weight:300}',
        '.card-bar{padding:10px 16px 12px;border-top:1px solid rgba(255,255,255,0.06);background:rgba(0,0,0,0.12);display:flex;align-items:center;gap:8px}',
        '.pill{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;font-size:11px;color:var(--dot,#94A6BF);background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08)}',
        '.pill .dot{width:6px;height:6px}',
        '.spacer{flex:1}',
        '.key{width:36px;height:36px;border-radius:12px;background:rgba(255,255,255,0.10);display:inline-flex;align-items:center;justify-content:center}',
        '.key:hover{background:rgba(255,255,255,0.18)}',
        '.key[aria-pressed="true"]{background:#F4C76A}',
        '.key[aria-pressed="true"] svg{stroke:#1F2F4D}',
        '.key.end{background:#EE6E5C}',
        '.key.end:hover{background:#D85440}',
        '.key[disabled]{opacity:0.4;cursor:default}',

        /* dialer panel (.card.dl, ctc_dock_dialer.js) while dragged: the open /
           close fade keeps transform; the drag moves translate and lifts with
           scale (1.02, eased in) and a deeper shadow; .settling glides
           translate to the snap point. */
        '.card.dl{transition:opacity 200ms cubic-bezier(0.23,1,0.32,1),transform 200ms cubic-bezier(0.23,1,0.32,1),scale 140ms ease-out,box-shadow 140ms ease-out}',
        '.card.dl.settling{transition:opacity 200ms cubic-bezier(0.23,1,0.32,1),transform 200ms cubic-bezier(0.23,1,0.32,1),scale 140ms ease-out,box-shadow 140ms ease-out,translate ' + SETTLE + '}',
        '.card.dl.lifted{scale:' + (1 + LIFT) + ';box-shadow:inset 0 1px 0 rgba(255,255,255,0.06),0 1px 1px rgba(0,0,0,0.08),0 24px 56px rgba(15,27,48,0.36)}',
        '@media (prefers-reduced-motion: reduce){.card,.card.dl,button{transition:opacity 200ms linear}.card.closed{transform:none}button:active{transform:none}.vchip .v-dot,.vchip[data-stage="incoming"] .v-dot{animation:none}}'
    ].join('\n');

    var HTML = ''
        + '<div class="dock" hidden>'
        +   '<div class="vchip navy">'
        +     '<button type="button" class="v-body">'
        +       '<span class="v-grip" aria-hidden="true"><i></i><i></i><i></i><i></i></span>'
        +       '<span class="v-dot" aria-hidden="true"></span>'
        +       '<span class="h-words" aria-hidden="true"><span class="h-l1"></span><span class="h-l2"></span></span>'
        +       '<span class="h-time" aria-hidden="true"></span>'
        +       '<span class="v-time" aria-hidden="true"><span class="v-mm"></span><span class="v-sep">·</span><span class="v-ss"></span></span>'
        +     '</button>'
        +     '<button type="button" class="v-mute" aria-label="Mute" aria-pressed="false">'
        +       '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON_MIC + '</svg>'
        +     '</button>'
        +     '<button type="button" class="v-decline" aria-label="Decline call" hidden>'
        +       '<svg width="16" height="16" viewBox="0 0 24 24" fill="#FFFFFF" aria-hidden="true">' + ICON_PHONE + '</svg>'
        +     '</button>'
        +     '<button type="button" class="v-main call">'
        +       '<svg class="v-ico ico-call" width="16" height="16" viewBox="0 0 24 24" fill="#FFFFFF" aria-hidden="true">' + ICON_PHONE + '</svg>'
        +       '<svg class="v-ico ico-offline" width="16" height="16" viewBox="0 0 24 24" fill="#345D7E" aria-hidden="true">' + ICON_PHONE + '</svg>'
        +       '<svg class="v-ico ico-retry" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9A2A23" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON_RETRY + '</svg>'
        +     '</button>'
        +   '</div>'
        +   '<div class="card navy closed" role="region" aria-label="Current call">'
        +     '<button type="button" class="card-top" aria-label="Collapse call card">'
        +       '<span class="avatar" aria-hidden="true"></span>'
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
        + '</div>';

    // --- State ---
    var snap = null; // null until the anchor answers (or the hello times out)
    var expanded = false;
    var panel = null; // { el, handle, render(snap), open(opts), focus(what), setContext(ctx) } from ctc_dock_dialer.js
    var corner = readCorner();
    var pos = { x: 0, y: 0 };
    var drag = null;
    var panelDrag = null;
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
    var pillFitTimer = null;
    // Outside mode: does another tab hold the phone? 'pending' until the
    // first lock query answers; null when the browser has no Web Locks.
    var lockHeld = mode === 'outside' ? 'pending' : false;
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
    var vDecline = $('.v-decline');
    var cardEl = $('.card');
    var cardTop = $('.card-top');
    var avatarEl = $('.avatar');
    var whoName = $('.who-name');
    var whoSub = $('.who-sub');
    var cardTime = $('.card-time');
    var pillLabel = $('.pill-label');
    var muteBtn = $('.mute');
    var endBtn = $('.key.end');

    // --- Helpers ---
    function readCorner() {
        try {
            var c = window.localStorage.getItem(CORNER_KEY);
            return CORNERS.indexOf(c) !== -1 ? c : DEFAULT_CORNER;
        } catch (e) {
            return DEFAULT_CORNER;
        }
    }

    // The pill (or the panel, which shares its point) moved.
    function saveCorner(c) {
        try { window.localStorage.setItem(CORNER_KEY, c); } catch (e) { /* private mode */ }
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

    function initials(name) {
        var parts = String(name || '').replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/);
        if (!parts[0]) return '?';
        return (parts[0].charAt(0) + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : '')).toUpperCase();
    }

    function elapsed() {
        if (!snap || !snap.startedAt) return '';
        var s = Math.max(0, Math.floor((Date.now() - snap.startedAt) / 1000));
        var m = Math.floor(s / 60);
        return (m < 10 ? '0' : '') + m + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
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

    function send(action) {
        bus.postMessage({ v: 1, type: 'request', action: action });
    }

    // --- Render ---
    var PHASE_VIEW = {
        offline: { dot: '#8B8780', label: 'Phone offline' },
        error: { dot: '#EE6E5C', label: 'Phone error' },
        starting: { dot: '#F4C76A', label: 'Starting phone…' },
        ready: { dot: '#94A6BF', label: 'Phone ready' }, // aria-label only: the ready pill has no text
        dialing: { dot: '#F4C76A', label: 'Calling…' },
        ringing: { dot: '#F4C76A', label: 'Ringing…' },
        incoming: { dot: '#14B981', label: 'Incoming call' },
        connected: { dot: '#14B981', label: 'Connected' }
    };
    var ARROWS_HINT = ' Arrow keys move the dock.';

    function render() {
        // The panel follows every snapshot first, so nothing below can leave
        // it on a stale view.
        if (panel && snap) panel.render(snap);

        var wasHidden = dockEl.hidden;
        if (mode === 'outside') renderOutside();
        else if (!snap) dockEl.hidden = true;
        else {
            renderChip(snap.phase, false);
            renderCard();
            setExpanded(expanded, false);
        }
        // First show on this page (load, login, after the lock check):
        // the entrance, at the pill's final size and place.
        if (wasHidden && !dockEl.hidden) enter();
        fitPill();
    }

    // Entrance: 260 ms fade + scale 0.96 -> 1 + a few px in from the pill's
    // edge, on the pill itself (the dock's transform holds its place).
    // Reduced motion: fade only. Called only when the dock goes from hidden
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
        vchipEl.getAnimations().forEach(function (a) { a.cancel(); });
        vchipEl.animate([from, to], { duration: ENTER_MS, easing: ENTER_EASE });
        entering = true;
        window.clearTimeout(enterTimer);
        enterTimer = window.setTimeout(function () { entering = false; }, ENTER_MS);
    }

    function renderOutside() {
        if (lockHeld === 'pending') { dockEl.hidden = true; return; }
        if (!phoneElsewhere()) {
            if (!cfg.shellUrl) { dockEl.hidden = true; return; }
            // "Open phone" (offline style): this tab moves into phone mode.
            expanded = false;
            dockEl.hidden = false;
            dockEl.style.setProperty('--dot', PHASE_VIEW.offline.dot);
            renderPill({ stage: 'offline', dot: true, light: true, main: 'offline', label: 'Open phone.' + ARROWS_HINT, title: 'Open phone', l1: 'Open phone' });
            if (timerId) { window.clearInterval(timerId); timerId = null; }
            setOrient();
            setExpanded(false, false);
            return;
        }
        // Another tab holds the phone: mirror its call.
        renderChip(snap ? snap.phase : 'starting', true);
        if (snap) renderCard();
        if (!isActive()) expanded = false;
        setExpanded(expanded, false);
    }

    // mirror: outside mode, the phone runs in another tab.
    function renderChip(phaseIn, mirror) {
        var phase = PHASE_VIEW[phaseIn] ? phaseIn : 'offline';
        var view = PHASE_VIEW[phase];
        var active = isActive();
        var light = !mirror && (phase === 'offline' || phase === 'error');
        var name = active ? callName() : '';
        var idleLabel = mirror ? 'Phone open in another tab' : view.label;

        if (!active && !panel) expanded = false;

        dockEl.hidden = false;
        dockEl.style.setProperty('--dot', view.dot);
        if (phase === 'incoming') {
            // Ringing in: Decline + Answer, here and in a mirror tab (the
            // anchor answers; the audio plays in the tab that holds the phone).
            var who = callerText();
            var words0 = pillWords(phase, mirror, active);
            renderPill({
                stage: phase,
                dot: true,
                main: 'answer',
                mainLabel: 'Answer call from ' + who,
                decline: true,
                declineLabel: 'Decline call from ' + who,
                label: 'Incoming call from ' + who + '. Open phone.' + ARROWS_HINT,
                title: 'Incoming call from ' + who,
                l1: words0.l1,
                l2: words0.l2
            });
            setOrient();
            tick();
            if (timerId) { window.clearInterval(timerId); timerId = null; }
            return;
        }
        // Tooltip text. Ready: dot + green phone button only, no label.
        var chipText = active ? name : (!mirror && phase === 'ready' ? '' : idleLabel);
        var label = active
            ? name + ', ' + view.label + '. Open call card.' + ARROWS_HINT
            : idleLabel + '.' + (mirror ? '' : ' Open phone.') + ARROWS_HINT;
        var words = pillWords(phase, mirror, active);
        renderPill({
            stage: phase,
            dot: true,
            light: light,
            err: phase === 'error',
            timer: active && !!snap.startedAt,
            mute: phase === 'connected',
            muted: !!(snap && snap.muted),
            main: active ? 'end' : mirror ? null : phase === 'ready' ? 'call' : phase === 'offline' ? 'offline' : phase === 'error' ? 'retry' : null,
            label: label,
            title: chipText || idleLabel,
            l1: words.l1,
            l2: words.l2,
            l2Muted: words.l2Muted
        });
        setOrient();

        tick();
        var running = !!(snap && snap.startedAt);
        if (running && !timerId) timerId = window.setInterval(tick, 1000);
        if (!running && timerId) { window.clearInterval(timerId); timerId = null; }
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
    // pill shows none. A wrap-up stage slots in here later.
    function pillWords(phase, mirror, active) {
        if (phase === 'incoming') return { l1: 'Incoming call', l2: callerText() };
        var number = active ? formatPhone(snap.number) || snap.number || '' : '';
        var name = active ? snap.entityName || snap.contactName || number || 'Call' : '';
        if (mirror) return { l1: 'Phone open in another tab', l2: name };
        if (phase === 'offline') return { l1: 'Phone offline', l2: 'Open phone mode' };
        if (phase === 'error') return { l1: 'Phone error', l2: 'Tap to reconnect' };
        if (phase === 'starting') return { l1: 'Starting phone', l2: '' };
        if (phase === 'dialing' || phase === 'ringing') return { l1: name, l2: 'Calling…' };
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
    //         | 'retry' (open phone) | 'answer' (incoming) | null (no button:
    //         starting, mirror idle)
    //   decline: the Decline button before main (incoming only); declineLabel its aria-label
    // The body button opens the phone / call card. When the main button does
    // that same thing, the body leaves the tab order so keyboard users meet
    // one control per action.
    function renderPill(o) {
        vchipEl.setAttribute('data-stage', o.stage);
        vchipEl.setAttribute('data-muted', o.mute && o.muted ? 'true' : 'false');
        vchipEl.setAttribute('data-main', o.main || 'none');
        vchipEl.classList.toggle('light', !!o.light);
        vchipEl.classList.toggle('navy', !o.light);
        vchipEl.classList.toggle('err', !!o.err);
        vchipEl.title = o.title || '';
        vchipEl.querySelector('.v-dot').hidden = !o.dot;
        hL1.textContent = o.l1 || '';
        hL2.textContent = o.l2 || '';
        hL2.hidden = !o.l2;
        hL2.classList.toggle('muted', !!o.l2Muted);
        hWords.hidden = !o.l1 && !o.l2;
        vTime.hidden = !o.timer;
        hTime.hidden = !o.timer;
        vMute.hidden = !o.mute;
        vMute.setAttribute('aria-pressed', o.muted ? 'true' : 'false');
        vMute.setAttribute('aria-label', o.muted ? 'Unmute' : 'Mute');
        vMute.querySelector('svg').innerHTML = o.muted ? ICON_MIC_OFF : ICON_MIC;
        vMain.hidden = !o.main;
        vMain.className = 'v-main' + (o.main ? ' ' + o.main : '');
        vMain.setAttribute('aria-label', o.mainLabel || (o.main === 'end' ? 'End call' : o.label));
        vDecline.hidden = !o.decline;
        vDecline.setAttribute('aria-label', o.declineLabel || 'Decline call');
        var bodyIsMain = o.main && o.main !== 'end' && o.main !== 'answer';
        vBody.tabIndex = bodyIsMain ? -1 : 0;
        if (bodyIsMain) {
            vBody.removeAttribute('aria-label');
            vBody.setAttribute('aria-hidden', 'true');
        } else {
            vBody.setAttribute('aria-label', o.label);
            vBody.removeAttribute('aria-hidden');
        }
    }

    // The pill's long axis follows its content: width when horizontal,
    // height when vertical. A change while it shows eases over 200 ms (no
    // ease under reduced motion). The dock is placed on the start and end
    // sizes and the ResizeObserver re-places it on every frame between, so
    // it stays anchored to its snap point (left / centre / right edge when
    // horizontal, centred on ml / mr when vertical). A render during an ease
    // (snapshots come in bursts) continues from the size shown now.
    function fitPill() {
        window.clearTimeout(pillFitTimer);
        var st = vchipEl.style;
        var vert = dockEl.classList.contains('vert');
        var prop = vert ? 'height' : 'width';
        var shown = !dockEl.hidden && !vchipEl.hidden;
        var from = pillFit.vert === vert ? pillFit.size : 0;
        if (from && st.transition) from = vert ? vchipEl.offsetHeight : vchipEl.offsetWidth;
        st.transition = '';
        st.width = '';
        st.height = '';
        st.overflow = '';
        if (!shown) { pillFit.size = 0; return; }
        var to = vert ? vchipEl.offsetHeight : vchipEl.offsetWidth;
        pillFit = { vert: vert, size: to };
        if (!from || from === to || reduced() || entering) {
            if (from !== to) place(false);
            return;
        }
        st.overflow = 'hidden'; // content may be larger than the pill mid-ease
        st[prop] = from + 'px';
        place(false); // anchor on the start size; the observer follows the ease
        st.transition = prop + ' 200ms ease-out';
        st[prop] = to + 'px';
        pillFitTimer = window.setTimeout(function () {
            st.transition = '';
            st[prop] = '';
            st.overflow = '';
            place(false);
        }, 220);
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
        avatarEl.textContent = initials(name);
        whoName.textContent = name;
        whoSub.textContent = sub;
        whoSub.hidden = !sub;
        cardTime.hidden = !snap.startedAt;
        pillLabel.textContent = PHASE_VIEW[phase].label;
        muteBtn.disabled = phase !== 'connected';
        muteBtn.setAttribute('aria-pressed', snap.muted ? 'true' : 'false');
        muteBtn.setAttribute('aria-label', snap.muted ? 'Unmute' : 'Mute');
        muteBtn.querySelector('svg').innerHTML = snap.muted ? ICON_MIC_OFF : ICON_MIC;
    }

    // No motion on the timer tick.
    function tick() {
        var t = elapsed();
        hTime.textContent = t;
        cardTime.textContent = t;
        var i = t.indexOf(':');
        vMm.textContent = i === -1 ? '' : t.slice(0, i);
        vSs.textContent = i === -1 ? '' : t.slice(i + 1);
    }

    function setExpanded(next, animate) {
        expanded = next;
        vchipEl.hidden = next;
        if (next) pillFit.size = 0; // reappears at its own size, no ease
        if (panel) {
            cardEl.hidden = true;
            setPanelOpen(next, animate);
            place(false);
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
    // in the same task, so nothing paints and no resize is observed. The other
    // shape is measured at its natural size (no size ease in progress).
    function sizeOf(vert) {
        var was = dockEl.classList.contains('vert');
        if (was === vert) return { w: dockEl.offsetWidth, h: dockEl.offsetHeight };
        var st = vchipEl.style;
        var keep = { w: st.width, h: st.height, o: st.overflow };
        st.width = st.height = st.overflow = '';
        dockEl.classList.toggle('vert', vert);
        var s = { w: dockEl.offsetWidth, h: dockEl.offsetHeight };
        dockEl.classList.toggle('vert', was);
        st.width = keep.w;
        st.height = keep.h;
        st.overflow = keep.o;
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
        cardEl.style.transformOrigin = (col === 'r' ? 'right ' : col === 'l' ? 'left ' : 'center ') + (row === 'b' ? 'bottom' : row === 't' ? 'top' : 'center');
        if (glide) {
            dockEl.style.transition = 'transform ' + SETTLE;
            window.setTimeout(function () { dockEl.style.transition = ''; }, 320);
        } else {
            dockEl.style.transition = '';
        }
        applyTransform(false);
        if (glide && flip) {
            orientTimer = window.setTimeout(function () {
                orientTimer = null;
                place(false);
            }, 320);
        }
    }

    // Panel size: 380 x 620, capped by the screen (16 px each side, safe
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
    }

    function stopPanelSettle() {
        window.clearTimeout(panelSettleTimer);
        panelSettleTimer = null;
        if (panel) panel.el.classList.remove('settling');
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

    // --- Drag (pill only) ---
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
            dockEl.classList.add('lifted');
        }
        pos.x = drag.ox + dx;
        pos.y = drag.oy + dy;
        applyTransform(true);
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
        dockEl.classList.remove('lifted');

        var fl = flick(d.samples, e);
        corner = nearestCorner(pos.x + dockEl.offsetWidth / 2 + fl.x, pos.y + dockEl.offsetHeight / 2 + fl.y);
        saveCorner(corner);
        place(true);
    }
    bindDrag(vchipEl);
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
    vDecline.addEventListener('keydown', onArrow);

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
            if (reduced()) { el.style.translate = ''; return; }
            void el.offsetWidth; // commit the start so the glide runs
            el.classList.add('settling');
            el.style.translate = '0px 0px';
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
            panel.focus();
        } else if (isActive()) {
            setExpanded(true, true);
            cardTop.focus();
        }
        // Outside mode, idle, phone in another tab: nothing to open here.
    }
    vBody.addEventListener('click', openFromPill);
    // The pill's padding and gaps act like its body.
    vchipEl.addEventListener('click', function (e) {
        if (!(e.target.closest && e.target.closest('button'))) openFromPill();
    });
    vMain.addEventListener('click', function () {
        if (vMain.classList.contains('end')) send('hangup');
        else if (vMain.classList.contains('answer')) send('answer');
        else openFromPill();
    });
    vDecline.addEventListener('click', function () { send('decline'); });
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
    bus.onmessage = function (e) {
        var m = e.data;
        if (!m || m.v !== 1 || m.type !== 'snapshot' || !m.snap) return;
        window.clearTimeout(helloTimer);
        gotSnapshot = true;
        snap = m.snap;
        render();
    };

    // Ask the anchor for a snapshot. No answer means no anchor: the anchor's
    // own 'offline' message on pagehide is not always delivered (crash,
    // killed tab), so silence is the reliable signal. Except in a shell that
    // just loaded: its phone frame is still starting (it speaks first when
    // ready), so the pill shows 'starting' instead of flashing 'offline'.
    function hello() {
        bus.postMessage({ v: 1, type: 'hello' });
        window.clearTimeout(helloTimer);
        helloTimer = window.setTimeout(function () {
            var booting = mode === 'shell' && !gotSnapshot && Date.now() - mountedAt < SHELL_BOOT_MS;
            var phase = booting ? 'starting' : 'offline';
            if (!snap || snap.phase !== phase) { snap = { phase: phase }; render(); }
        }, HELLO_TIMEOUT_MS);
    }

    // --- Outside mode: who holds the phone? ---
    function checkLock(done) {
        if (!navigator.locks || typeof navigator.locks.query !== 'function') {
            lockHeld = null;
            if (done) done();
            render();
            return;
        }
        navigator.locks.query().then(function (state) {
            lockHeld = (state.held || []).some(function (l) { return l.name === LOCK_NAME; });
        }, function () {
            lockHeld = null;
        }).then(function () {
            if (done) done();
            render();
        });
    }

    function exitFlagSet() {
        try { return window.sessionStorage.getItem(EXIT_KEY) === '1'; } catch (e) { return false; }
    }

    // Dashboard (portlet loader): move into phone mode by itself, once, when
    // no tab holds the phone and the rep did not leave phone mode in this tab.
    function maybeAutoEnter() {
        if (!cfg.autoEnter || !cfg.shellUrl || lockHeld !== false || exitFlagSet()) return;
        window.top.location.replace(shellHref());
    }

    // --- Sync and resize ---
    window.addEventListener('storage', function (e) {
        if (e.key !== CORNER_KEY || CORNERS.indexOf(e.newValue) === -1) return;
        corner = e.newValue;
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

        // Shared display helpers for ctc_dock_dialer.js.
        formatPhone: formatPhone,
        initials: initials,

        /**
         * Shell: open the dialer on Dial with `ctx` loaded and focus Call (it
         * never dials by itself). Outside: move this tab into phone mode.
         * @param {{entityId?: string, entityName?: string, entityType?: string, phone?: string}|null} [ctx]
         */
        call: function (ctx) {
            if (mode === 'outside') { goShell(); return; }
            if (!panel) {
                if (isActive()) { setExpanded(true, true); cardTop.focus(); }
                return;
            }
            panel.open({ ctx: normalizeContext(ctx) });
            setExpanded(true, true);
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

        // Extension surface for ctc_dock_dialer.js. Not a public API.
        host: mode !== 'shell' ? null : {
            cfg: cfg,
            css: function (text) {
                var st = document.createElement('style');
                st.textContent = text;
                root.appendChild(st);
            },
            getSnap: function () { return snap; },
            send: function (action, extra) {
                var m = { v: 1, type: 'request', action: action };
                if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) m[k] = extra[k];
                bus.postMessage(m);
            },
            collapse: function () { setExpanded(false, true); focusPill(); },
            registerPanel: function (p) {
                panel = p;
                p.el.hidden = true;
                p.el.classList.add('closed');
                root.appendChild(p.el);
                if (p.handle) bindPanelDrag(p.handle);
                if (snap) render();
            }
        }
    };

    function mount() {
        document.body.appendChild(host);
        mountedAt = Date.now();
        if (mode === 'outside') checkLock(maybeAutoEnter);
        hello();
        window.setInterval(function () {
            if (document.hidden) return;
            if (mode === 'outside') checkLock();
            if (snap && snap.phase !== 'offline') hello();
            else if (mode === 'outside' && phoneElsewhere()) hello();
        }, PING_INTERVAL_MS);
        document.addEventListener('visibilitychange', function () {
            if (document.hidden) return;
            if (mode === 'outside') checkLock();
            hello();
        });
    }

    if (document.body) mount();
    else document.addEventListener('DOMContentLoaded', mount);
})();
