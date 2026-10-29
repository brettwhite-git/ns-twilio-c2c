/**
 * Telephony Dock — browser-side script (NOT a SuiteScript module).
 *
 * Mounted on NetSuite pages by a <script src> tag from lib/ctc_dock.js
 * (buildDockScriptTag). Mirrors the softphone popup (the "anchor") over
 * BroadcastChannel: it draws the anchor's snapshots and sends requests back.
 * It holds no audio and never changes call state itself.
 *
 * Views: chip (collapsed pill), card (expanded call), offline pill.
 * The dock sits in one of four corners; the corner is shared by every tab
 * through localStorage.
 */
(function () {
    'use strict';

    if (window.__ctcDock || typeof BroadcastChannel === 'undefined') return;

    var script = document.currentScript;
    var attr = function (name, fallback) {
        return (script && script.getAttribute(name)) || fallback;
    };
    var cfg = {
        bus: attr('data-bus', 'ctc-bus'),
        anchorUrl: attr('data-anchor-url', ''),
        popupName: attr('data-popup-name', 'ctc_softphone'),
        popupOptions: attr('data-popup-options', '')
    };

    var CORNER_KEY = 'ctc-dock';
    var CORNERS = ['tl', 'tr', 'bl', 'br'];
    var EDGE = 16;
    var DRAG_THRESHOLD = 4;
    var FLICK_SPEED = 0.11; // px/ms
    var FLICK_PROJECT_MS = 200;
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
        '.chip-label{font-size:13px;font-weight:600;white-space:nowrap;max-width:180px;overflow:hidden;text-overflow:ellipsis}',
        '.chip-time{font-size:12px;color:#94A6BF}',
        '.chip-go{width:28px;height:28px;border-radius:999px;background:rgba(255,255,255,0.08);display:inline-flex;align-items:center;justify-content:center}',
        '.chip-end{width:32px;height:32px;border-radius:999px;background:#EE6E5C;display:inline-flex;align-items:center;justify-content:center}',
        '.chip-end:hover{background:#D85440}',
        '.dock.lifted .chip{box-shadow:inset 0 1px 0 rgba(255,255,255,0.06),0 16px 36px rgba(15,27,48,0.32)}',

        /* offline pill: light, quiet */
        '.chip.light{background:#FFFFFF;border:1px solid #E5E2DD;color:#161513;box-shadow:0 6px 16px rgba(22,21,19,0.08)}',
        '.chip.light .chip-main{padding-right:16px}',
        '.chip-open{font-size:13px;color:#1B6097}',

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
        +       '<span class="chip-open">Open</span>'
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
        +       '<button type="button" class="pill" aria-label="Open softphone"><span class="dot"></span><span class="pill-label"></span></button>'
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
    var corner = readCorner();
    var pos = { x: 0, y: 0 };
    var drag = null;
    var suppressClick = false;
    var timerId = null;
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
    var chipLabel = $('.chip-label');
    var chipTime = $('.chip-time');
    var chipOpen = $('.chip-open');
    var chipGo = $('.chip-go');
    var chipEnd = $('.chip-end');
    var cardEl = $('.card');
    var cardTop = $('.card-top');
    var avatarEl = $('.avatar');
    var whoName = $('.who-name');
    var whoSub = $('.who-sub');
    var cardTime = $('.card-time');
    var pillEl = $('.pill');
    var pillLabel = $('.pill-label');
    var muteBtn = $('.mute');
    var endBtn = $('.key.end');

    // --- Helpers ---
    function readCorner() {
        try {
            var c = window.localStorage.getItem(CORNER_KEY);
            return CORNERS.indexOf(c) !== -1 ? c : 'br';
        } catch (e) {
            return 'br';
        }
    }

    function saveCorner(c) {
        try { window.localStorage.setItem(CORNER_KEY, c); } catch (e) { /* private mode */ }
    }

    function isActive() {
        return !!(snap && ACTIVE[snap.phase]);
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

    // Focus the anchor without reloading it; open it with `url` if it is gone.
    // Must run inside a click handler so the popup blocker lets it through.
    function openAnchor(url) {
        var w = null;
        try { w = window.open('', cfg.popupName, cfg.popupOptions); } catch (e) { w = null; }
        if (!w) return false;
        try {
            if ((!w.location.href || w.location.href === 'about:blank') && url) w.location.href = url;
        } catch (e) { /* cross-origin: leave it */ }
        try { w.focus(); } catch (e) { /* ignore */ }
        return true;
    }

    function send(action) {
        bus.postMessage({ v: 1, type: 'request', action: action });
    }

    // --- Render ---
    var PHASE_VIEW = {
        offline: { dot: '#8B8780', label: 'Phone offline' },
        error: { dot: '#EE6E5C', label: 'Phone error' },
        ready: { dot: '#94A6BF', label: 'Ready' },
        dialing: { dot: '#F4C76A', label: 'Calling…' },
        ringing: { dot: '#F4C76A', label: 'Ringing…' },
        connected: { dot: '#14B981', label: 'Connected ↗' }
    };

    function render() {
        if (!snap) { dockEl.hidden = true; return; }
        var phase = PHASE_VIEW[snap.phase] ? snap.phase : 'offline';
        var view = PHASE_VIEW[phase];
        var active = isActive();
        var light = phase === 'offline' || phase === 'error';
        var name = snap.entityName || snap.contactName || snap.number || 'Call';
        var sub = snap.entityName && snap.contactName ? snap.contactName : (snap.number || '');
        if (sub === name) sub = '';

        if (!active) expanded = false;

        dockEl.hidden = false;
        dockEl.style.setProperty('--dot', view.dot);
        chipEl.classList.toggle('light', light);
        chipEl.classList.toggle('navy', !light);
        chipLabel.textContent = active ? name : view.label;
        chipTime.hidden = !active || !snap.startedAt;
        chipOpen.hidden = !light;
        chipGo.hidden = phase !== 'ready';
        chipEnd.hidden = !active;
        chipMain.setAttribute('aria-label', active
            ? name + ', ' + view.label.replace(' ↗', '') + '. Open call card. Arrow keys move the dock.'
            : view.label + '. Open softphone. Arrow keys move the dock.');

        avatarEl.textContent = initials(name);
        whoName.textContent = name;
        whoSub.textContent = sub;
        whoSub.hidden = !sub;
        cardTime.hidden = !snap.startedAt;
        pillLabel.textContent = view.label;
        muteBtn.disabled = phase !== 'connected';
        muteBtn.setAttribute('aria-pressed', snap.muted ? 'true' : 'false');
        muteBtn.setAttribute('aria-label', snap.muted ? 'Unmute' : 'Mute');
        muteBtn.querySelector('svg').innerHTML = snap.muted ? ICON_MIC_OFF : ICON_MIC;

        tick();
        if (snap.startedAt && !timerId) timerId = window.setInterval(tick, 1000);
        if (!snap.startedAt && timerId) { window.clearInterval(timerId); timerId = null; }

        setExpanded(expanded, false);
    }

    // No motion on the timer tick.
    function tick() {
        var t = elapsed();
        chipTime.textContent = t;
        cardTime.textContent = t;
    }

    function setExpanded(next, animate) {
        var wasOpen = !cardEl.hidden;
        expanded = next;
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

    // --- Placement ---
    function safeTop() {
        // Keep 8 px below the NetSuite header when there is one.
        var top = EDGE;
        var header = document.querySelector('#ns_navigation, #ns-header-menu-main, .ns-navigation, #div__header');
        if (header) {
            var r = header.getBoundingClientRect();
            if (r.bottom > 0 && r.bottom < window.innerHeight / 2) top = Math.max(top, r.bottom + 8);
        }
        return top;
    }

    function cornerXY(c) {
        var w = dockEl.offsetWidth;
        var h = dockEl.offsetHeight;
        var right = c.charAt(1) === 'r';
        var bottom = c.charAt(0) === 'b';
        return {
            x: right ? window.innerWidth - w - EDGE : EDGE,
            y: bottom ? window.innerHeight - h - EDGE : safeTop()
        };
    }

    function applyTransform(lift) {
        dockEl.style.transform = 'translate3d(' + Math.round(pos.x) + 'px,' + Math.round(pos.y) + 'px,0)' + (lift ? ' scale(1.02)' : '');
    }

    function place(animate) {
        if (drag && drag.moved) return;
        var xy = cornerXY(corner);
        pos.x = xy.x;
        pos.y = xy.y;
        var origin = (corner.charAt(1) === 'r' ? 'right ' : 'left ') + (corner.charAt(0) === 'b' ? 'bottom' : 'top');
        cardEl.style.transformOrigin = origin;
        if (animate && !(reducedMotion && reducedMotion.matches)) {
            dockEl.style.transition = 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1)';
            window.setTimeout(function () { dockEl.style.transition = ''; }, 320);
        } else {
            dockEl.style.transition = '';
        }
        applyTransform(false);
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
        corner = (cy > window.innerHeight / 2 ? 'b' : 't') + (cx > window.innerWidth / 2 ? 'r' : 'l');
        saveCorner(corner);
        place(true);
    }
    chipMain.addEventListener('pointerup', endDrag);
    chipMain.addEventListener('pointercancel', endDrag);

    // Keyboard: arrows move to the next corner, no animation.
    function onArrow(e) {
        var v = corner.charAt(0);
        var hz = corner.charAt(1);
        if (e.key === 'ArrowUp') v = 't';
        else if (e.key === 'ArrowDown') v = 'b';
        else if (e.key === 'ArrowLeft') hz = 'l';
        else if (e.key === 'ArrowRight') hz = 'r';
        else return;
        e.preventDefault();
        corner = v + hz;
        saveCorner(corner);
        place(false);
    }
    chipMain.addEventListener('keydown', onArrow);

    // --- Actions ---
    chipMain.addEventListener('click', function () {
        if (suppressClick) { suppressClick = false; return; }
        if (isActive()) {
            setExpanded(true, true);
            cardTop.focus();
        } else {
            openAnchor(cfg.anchorUrl);
        }
    });
    chipEnd.addEventListener('click', function () { send('hangup'); });
    cardTop.addEventListener('click', function () {
        setExpanded(false, false);
        chipMain.focus();
    });
    cardEl.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { setExpanded(false, false); chipMain.focus(); }
    });
    pillEl.addEventListener('click', function () { openAnchor(cfg.anchorUrl); });
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

    // --- Sync and resize ---
    window.addEventListener('storage', function (e) {
        if (e.key !== CORNER_KEY || CORNERS.indexOf(e.newValue) === -1) return;
        corner = e.newValue;
        place(true);
    });
    if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(function () { place(false); }).observe(dockEl);
    }
    window.addEventListener('resize', function () { place(false); });

    // --- Public API (used by the record's Call button) ---
    window.__ctcDock = {
        /**
         * Start a call from a record. During an active call the anchor is only
         * focused, never reloaded, so the live call keeps its audio.
         * @param {string} url - Softphone Suitelet URL with the record's params
         */
        call: function (url) {
            if (isActive()) {
                openAnchor('');
                setExpanded(true, true);
                return;
            }
            window.open(url, cfg.popupName, cfg.popupOptions);
        }
    };

    function mount() {
        document.body.appendChild(host);
        hello();
        window.setInterval(function () {
            if (!document.hidden && snap && snap.phase !== 'offline') hello();
        }, PING_INTERVAL_MS);
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden) hello();
        });
    }

    if (document.body) mount();
    else document.addEventListener('DOMContentLoaded', mount);
})();
