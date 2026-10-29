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
 * window.__ctcDock.host.registerPanel() and opens full height on the left or
 * right edge.
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
        popupName: attr('data-popup-name', ''),
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
    var PANEL_SIDE_KEY = 'ctc-dock-panel-side';
    var PANEL_W = 380;
    var EDGE = 16;
    var BOTTOM_GAP = 24; // bottom row sits a little higher than the side margin
    var DRAG_THRESHOLD = 4;
    var FLICK_SPEED = 0.11; // px/ms
    var FLICK_PROJECT_MS = 200;
    var SETTLE = '300ms cubic-bezier(0.32, 0.72, 0, 1)';
    var PANEL_FADE_MS = 200;
    var HELLO_TIMEOUT_MS = 600;
    var PING_INTERVAL_MS = 15000;
    var ACTIVE = { dialing: true, ringing: true, connected: true };
    var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');

    var ICON_PHONE = '<path d="M2 5.5C2 3.6 3.6 2 5.5 2h1.3c.9 0 1.7.6 1.9 1.5l1 4c.2.8-.1 1.6-.8 2.1l-1.5 1.1a12 12 0 0 0 5.9 5.9l1.1-1.5c.5-.7 1.3-1 2.1-.8l4 1c.9.2 1.5 1 1.5 1.9v1.3c0 1.9-1.6 3.5-3.5 3.5A16.5 16.5 0 0 1 2 5.5z"></path>';
    var ICON_MIC = '<rect x="9" y="2" width="6" height="12" rx="3"></rect><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3"></path>';
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

        /* chip */
        '.chip{display:inline-flex;align-items:center;gap:4px;height:44px;padding:0 6px 0 0;border-radius:999px;box-shadow:inset 0 1px 0 rgba(255,255,255,0.06),0 8px 20px rgba(15,27,48,0.24);transition:box-shadow 140ms ease-out}',
        '.chip-main{display:inline-flex;align-items:center;gap:10px;height:44px;padding:0 6px 0 16px;border-radius:999px;background:transparent;touch-action:none;user-select:none;-webkit-user-select:none}',
        '.chip-main:active{transform:none}',
        '.chip-label{font-size:13px;font-weight:600;white-space:nowrap;max-width:200px;overflow:hidden;text-overflow:ellipsis}',
        '.chip-time{font-size:12px;color:#94A6BF}',
        '.chip-go{width:28px;height:28px;border-radius:999px;background:rgba(255,255,255,0.08);display:inline-flex;align-items:center;justify-content:center}',
        '.chip-end{width:32px;height:32px;border-radius:999px;background:#EE6E5C;display:inline-flex;align-items:center;justify-content:center}',
        '.chip-end:hover{background:#D85440}',
        '.dock.lifted .chip{box-shadow:inset 0 1px 0 rgba(255,255,255,0.06),0 16px 36px rgba(15,27,48,0.32)}',

        /* offline pill: light, quiet */
        '.chip.light{background:#FFFFFF;border:1px solid #E5E2DD;color:#161513;box-shadow:0 6px 16px rgba(22,21,19,0.08)}',
        '.chip.light .chip-main{padding-right:16px}',

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
        '@media (prefers-reduced-motion: reduce){.card,button{transition:opacity 200ms linear}.card.closed{transform:none}button:active{transform:none}}'
    ].join('\n');

    var HTML = ''
        + '<div class="dock" hidden>'
        +   '<div class="chip navy">'
        +     '<button type="button" class="chip-main">'
        +       '<span class="dot"></span>'
        +       '<span class="chip-label"></span>'
        +       '<span class="chip-time mono"></span>'
        +       '<span class="chip-go" aria-hidden="true"><svg width="13" height="13" viewBox="0 0 24 24" fill="#14B981">' + ICON_PHONE + '</svg></span>'
        +     '</button>'
        +     '<button type="button" class="chip-end" aria-label="End call">'
        +       '<svg width="14" height="14" viewBox="0 0 24 24" fill="#FFFFFF" aria-hidden="true" style="transform:rotate(135deg)">' + ICON_PHONE + '</svg>'
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
    var panelHideTimer = null;
    var suppressClick = false;
    var timerId = null;
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
    var chipEl = $('.chip');
    var chipMain = $('.chip-main');
    var chipDot = $('.chip-main .dot');
    var chipLabel = $('.chip-label');
    var chipTime = $('.chip-time');
    var chipGo = $('.chip-go');
    var chipEnd = $('.chip-end');
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

    // The pill moved. A pill on the left or right edge also takes the panel
    // to that side (the rep's latest choice wins).
    function saveCorner(c) {
        try { window.localStorage.setItem(CORNER_KEY, c); } catch (e) { /* private mode */ }
        var col = c.charAt(1);
        if (col === 'l' || col === 'r') savePanelSide(col);
    }

    function readPanelSide() {
        try {
            var s = window.localStorage.getItem(PANEL_SIDE_KEY);
            if (s === 'l' || s === 'r') return s;
        } catch (e) { /* private mode */ }
        return corner.charAt(1) === 'l' ? 'l' : 'r';
    }

    function savePanelSide(s) {
        try { window.localStorage.setItem(PANEL_SIDE_KEY, s); } catch (e) { /* private mode */ }
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

    function send(action) {
        bus.postMessage({ v: 1, type: 'request', action: action });
    }

    // --- Render ---
    var PHASE_VIEW = {
        offline: { dot: '#8B8780', label: 'Phone offline' },
        error: { dot: '#EE6E5C', label: 'Phone error' },
        starting: { dot: '#F4C76A', label: 'Starting phone…' },
        ready: { dot: '#94A6BF', label: 'Ready' },
        dialing: { dot: '#F4C76A', label: 'Calling…' },
        ringing: { dot: '#F4C76A', label: 'Ringing…' },
        connected: { dot: '#14B981', label: 'Connected' }
    };
    var ARROWS_HINT = ' Arrow keys move the dock.';

    function render() {
        // The panel follows every snapshot first, so nothing below can leave
        // it on a stale view.
        if (panel && snap) panel.render(snap);

        if (mode === 'outside') { renderOutside(); return; }
        if (!snap) { dockEl.hidden = true; return; }
        renderChip(snap.phase, false);
        renderCard();
        setExpanded(expanded, false);
    }

    function renderOutside() {
        if (lockHeld === 'pending') { dockEl.hidden = true; return; }
        if (!phoneElsewhere()) {
            if (!cfg.shellUrl) { dockEl.hidden = true; return; }
            // "Open phone": this tab moves into phone mode.
            expanded = false;
            dockEl.hidden = false;
            chipEl.classList.remove('light');
            chipEl.classList.add('navy');
            chipDot.hidden = true;
            chipLabel.textContent = 'Open phone';
            chipTime.hidden = true;
            chipGo.hidden = false;
            chipEnd.hidden = true;
            chipMain.setAttribute('aria-label', 'Open phone.' + ARROWS_HINT);
            if (timerId) { window.clearInterval(timerId); timerId = null; }
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
        chipEl.classList.toggle('light', light);
        chipEl.classList.toggle('navy', !light);
        chipDot.hidden = false;
        chipLabel.textContent = active ? name : idleLabel;
        chipTime.hidden = !active || !snap.startedAt;
        chipGo.hidden = mirror || phase !== 'ready';
        chipEnd.hidden = !active;
        chipMain.setAttribute('aria-label', active
            ? name + ', ' + view.label + '. Open call card.' + ARROWS_HINT
            : idleLabel + '.' + (mirror ? '' : ' Open phone.') + ARROWS_HINT);

        tick();
        var running = !!(snap && snap.startedAt);
        if (running && !timerId) timerId = window.setInterval(tick, 1000);
        if (!running && timerId) { window.clearInterval(timerId); timerId = null; }
    }

    function callName() {
        return snap.entityName || snap.contactName || snap.number || 'Call';
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
        chipTime.textContent = t;
        cardTime.textContent = t;
    }

    function setExpanded(next, animate) {
        expanded = next;
        if (panel) {
            chipEl.hidden = next;
            cardEl.hidden = true;
            setPanelOpen(next, animate);
            place(false);
            return;
        }
        var wasOpen = !cardEl.hidden;
        chipEl.hidden = next;
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
            placePanel();
            if (el.hidden) {
                el.hidden = false;
                if (animate) {
                    el.classList.add('closed');
                    void el.offsetWidth; // commit the closed state so the transition runs
                }
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

    function cornerXY(c) {
        var w = dockEl.offsetWidth;
        var h = dockEl.offsetHeight;
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
    function nearestCorner(cx, cy) {
        var w = dockEl.offsetWidth;
        var h = dockEl.offsetHeight;
        var best = DEFAULT_CORNER;
        var bestD = Infinity;
        CORNERS.forEach(function (c) {
            var xy = cornerXY(c);
            var dx = xy.x + w / 2 - cx;
            var dy = xy.y + h / 2 - cy;
            var d = dx * dx + dy * dy;
            if (d < bestD) { bestD = d; best = c; }
        });
        return best;
    }

    function applyTransform(lift) {
        dockEl.style.transform = 'translate3d(' + Math.round(pos.x) + 'px,' + Math.round(pos.y) + 'px,0)' + (lift ? ' scale(1.02)' : '');
    }

    function place(animate) {
        if (drag && drag.moved) return;
        var xy = cornerXY(corner);
        pos.x = xy.x;
        pos.y = xy.y;
        var col = corner.charAt(1);
        var row = corner.charAt(0);
        cardEl.style.transformOrigin = (col === 'r' ? 'right ' : col === 'l' ? 'left ' : 'center ') + (row === 'b' ? 'bottom' : row === 't' ? 'top' : 'center');
        if (animate && !reduced()) {
            dockEl.style.transition = 'transform ' + SETTLE;
            window.setTimeout(function () { dockEl.style.transition = ''; }, 320);
        } else {
            dockEl.style.transition = '';
        }
        applyTransform(false);
    }

    // Full-height panel: from the safe top to 24 px above the bottom, 380 px
    // wide, 16 px from the left or right screen edge.
    function panelBox() {
        var top = safeTop();
        var w = Math.min(PANEL_W, window.innerWidth - 2 * EDGE);
        var side = readPanelSide();
        return {
            side: side,
            x: side === 'l' ? EDGE : window.innerWidth - w - EDGE,
            y: top,
            w: w,
            h: Math.max(0, window.innerHeight - top - BOTTOM_GAP)
        };
    }

    function placePanel() {
        if (!panel || (panelDrag && panelDrag.moved)) return;
        var b = panelBox();
        var s = panel.el.style;
        s.left = b.x + 'px';
        s.top = b.y + 'px';
        s.width = b.w + 'px';
        s.height = b.h + 'px';
        panel.el.setAttribute('data-side', b.side);
    }

    // --- Drag (chip only) ---
    chipMain.addEventListener('pointerdown', function (e) {
        if (e.button !== 0 || drag) return;
        suppressClick = false;
        drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, ox: pos.x, oy: pos.y, moved: false, samples: [] };
        chipMain.setPointerCapture(e.pointerId);
    });

    chipMain.addEventListener('pointermove', function (e) {
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
    });

    function endDrag(e) {
        if (!drag || e.pointerId !== drag.id) return;
        var d = drag;
        drag = null;
        try { chipMain.releasePointerCapture(e.pointerId); } catch (err) { /* already released */ }
        if (!d.moved) return;
        suppressClick = true;
        dockEl.classList.remove('lifted');

        var w = dockEl.offsetWidth;
        var h = dockEl.offsetHeight;
        var cx = pos.x + w / 2;
        var cy = pos.y + h / 2;
        var first = d.samples[0];
        var last = d.samples[d.samples.length - 1];
        if (first && last && last.t > first.t) {
            var vx = (last.x - first.x) / (last.t - first.t);
            var vy = (last.y - first.y) / (last.t - first.t);
            if (Math.sqrt(vx * vx + vy * vy) > FLICK_SPEED) {
                cx += vx * FLICK_PROJECT_MS;
                cy += vy * FLICK_PROJECT_MS;
            }
        }
        corner = nearestCorner(cx, cy);
        saveCorner(corner);
        place(true);
    }
    chipMain.addEventListener('pointerup', endDrag);
    chipMain.addEventListener('pointercancel', endDrag);

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
    chipMain.addEventListener('keydown', onArrow);

    // --- Drag (panel header): snaps to the nearer screen side ---
    function bindPanelDrag(handle) {
        var el = panel.el;
        handle.style.touchAction = 'none';
        handle.addEventListener('pointerdown', function (e) {
            if (e.button !== 0 || panelDrag) return;
            if (e.target.closest && e.target.closest('button, a, input, select')) return;
            panelDrag = { id: e.pointerId, x0: e.clientX, left0: parseFloat(el.style.left) || 0, dx: 0, moved: false };
            handle.setPointerCapture(e.pointerId);
        });
        handle.addEventListener('pointermove', function (e) {
            if (!panelDrag || e.pointerId !== panelDrag.id) return;
            var dx = e.clientX - panelDrag.x0;
            if (!panelDrag.moved && Math.abs(dx) <= DRAG_THRESHOLD) return;
            panelDrag.moved = true;
            panelDrag.dx = dx;
            el.style.transition = 'none';
            el.style.translate = Math.round(dx) + 'px';
        });
        function end(e) {
            if (!panelDrag || e.pointerId !== panelDrag.id) return;
            var d = panelDrag;
            panelDrag = null;
            try { handle.releasePointerCapture(e.pointerId); } catch (err) { /* already released */ }
            if (!d.moved) return;
            var now = d.left0 + d.dx;
            var side = now + el.offsetWidth / 2 < window.innerWidth / 2 ? 'l' : 'r';
            savePanelSide(side);
            var b = panelBox();
            // Jump to the new side with an offset that keeps the panel where it
            // is on screen, then settle the offset to zero.
            el.style.transition = 'none';
            placePanel();
            el.style.translate = Math.round(now - b.x) + 'px';
            void el.offsetWidth;
            if (!reduced()) el.style.transition = 'translate ' + SETTLE;
            el.style.translate = '0px';
            window.setTimeout(function () { el.style.transition = ''; }, 320);
        }
        handle.addEventListener('pointerup', end);
        handle.addEventListener('pointercancel', end);
    }

    // --- Actions ---
    chipMain.addEventListener('click', function () {
        if (suppressClick) { suppressClick = false; return; }
        if (mode === 'outside' && !phoneElsewhere()) { goShell(); return; }
        if (panel) {
            setExpanded(true, true);
            panel.focus();
        } else if (isActive()) {
            setExpanded(true, true);
            cardTop.focus();
        }
        // Outside mode, idle, phone in another tab: nothing to open here.
    });
    chipEnd.addEventListener('click', function () { send('hangup'); });
    cardTop.addEventListener('click', function () {
        setExpanded(false, false);
        chipMain.focus();
    });
    cardEl.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { setExpanded(false, false); chipMain.focus(); }
    });
    muteBtn.addEventListener('click', function () { send(snap && snap.muted ? 'unmute' : 'mute'); });
    endBtn.addEventListener('click', function () { send('hangup'); });

    // --- Bus ---
    var helloTimer = null;
    bus.onmessage = function (e) {
        var m = e.data;
        if (!m || m.v !== 1 || m.type !== 'snapshot' || !m.snap) return;
        window.clearTimeout(helloTimer);
        snap = m.snap;
        render();
    };

    // Ask the anchor for a snapshot. No answer means no anchor: the anchor's
    // own 'offline' message on pagehide is not always delivered (crash,
    // killed tab), so silence is the reliable signal.
    function hello() {
        bus.postMessage({ v: 1, type: 'hello' });
        window.clearTimeout(helloTimer);
        helloTimer = window.setTimeout(function () {
            if (!snap || snap.phase !== 'offline') { snap = { phase: 'offline' }; render(); }
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
        if (e.key === PANEL_SIDE_KEY && expanded) { placePanel(); return; }
        if (e.key !== CORNER_KEY || CORNERS.indexOf(e.newValue) === -1) return;
        corner = e.newValue;
        place(true);
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
            collapse: function () { setExpanded(false, true); chipMain.focus(); },
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
