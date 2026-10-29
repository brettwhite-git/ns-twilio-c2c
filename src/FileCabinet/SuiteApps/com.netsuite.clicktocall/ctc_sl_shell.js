/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * Phone mode test shell (SPIKE, not a shipped feature).
 *
 * Question under test: can a call survive NetSuite navigation in ONE tab,
 * with no popup? This Suitelet is the tab's top page ("shell") and never
 * reloads. It holds two same-origin iframes:
 *   1. #ctc-ns-frame    full-size NetSuite UI. NetSuite clicks reload only
 *                       this frame.
 *   2. #ctc-phone-frame the existing softphone Suitelet (the call anchor and
 *                       ctc-bus host). The shell never reloads, so this frame
 *                       never reloads, so the call persists. It carries the
 *                       anchor popup name, so the dock's
 *                       window.open('', SOFTPHONE_POPUP_NAME) should find it
 *                       instead of opening a popup (also under test).
 * The shell adds a session banner, a call-aware leave guard, a
 * top.document.getElementById shim, a Phone mode menu and an event log.
 */
// eslint-disable-next-line suitescript/no-log-module
define(['N/url', 'N/log', './lib/ctc_html', './lib/ctc_entity'], (url, log, ctcHtml, ctcEntity) => {

    const escapeHtml = ctcHtml.escapeHtml;
    const safeJsonEmbed = ctcHtml.safeJsonEmbed;

    const DEFAULT_FRAME_PATH = '/app/center/card.nl?sc=-29';
    const MAX_FRAME_PATH = 2000;

    /**
     * Validate the NetSuite path to open in the frame. Anything that could
     * leave the account origin or climb out of /app/ falls back to the
     * default dashboard path.
     * Rules: string; 1..2000 chars; starts with "/app/"; no "//", no "\",
     * no whitespace or control chars; no scheme (":" before the first "/");
     * no "." or ".." path segments (also percent-encoded) before "?" / "#".
     * @param {*} value
     * @returns {string} a safe path, or DEFAULT_FRAME_PATH
     */
    const safeFramePath = (value) => {
        if (typeof value !== 'string') return DEFAULT_FRAME_PATH;
        if (value.length === 0 || value.length > MAX_FRAME_PATH) return DEFAULT_FRAME_PATH;
        if (value.indexOf('/app/') !== 0) return DEFAULT_FRAME_PATH;
        if (value.indexOf('//') !== -1 || value.indexOf('\\') !== -1) return DEFAULT_FRAME_PATH;
        // eslint-disable-next-line no-control-regex
        if (/[\s\x00-\x1f\x7f]/.test(value)) return DEFAULT_FRAME_PATH;
        const colon = value.indexOf(':');
        if (colon !== -1 && colon < value.indexOf('/')) return DEFAULT_FRAME_PATH;
        const pathOnly = value.split(/[?#]/)[0];
        const dotSegment = pathOnly.split('/').some((seg) => /^(\.|%2e){1,2}$/i.test(seg));
        if (dotSegment) return DEFAULT_FRAME_PATH;
        return value;
    };

    /**
     * Resolve a Suitelet URL, logging (not throwing) on failure.
     * @param {string} scriptId
     * @param {string} deploymentId
     * @param {Object} [params]
     * @returns {string}
     */
    const resolveSuitelet = (scriptId, deploymentId, params) => {
        try {
            const opts = { scriptId, deploymentId, returnExternalUrl: false };
            if (params) opts.params = params;
            return url.resolveScript(opts) || '';
        } catch (e) {
            log.error({ title: 'CTC Shell — Failed to resolve ' + scriptId, details: e.message || e });
            return '';
        }
    };

    /**
     * GET handler — renders the phone mode shell page.
     * @param {Object} context
     * @param {Object} context.request
     * @param {Object} context.response
     */
    const onRequest = (context) => {
        const params = (context.request && context.request.parameters) || {};
        const framePath = safeFramePath(params.u);
        const softphoneUrl = resolveSuitelet('customscript_ctc_sl_softphone', 'customdeploy_ctc_sl_softphone', { entryPoint: 'dashboard' });
        const shellBase = resolveSuitelet('customscript_ctc_sl_shell', 'customdeploy_ctc_sl_shell');
        context.response.write(buildHtml({
            framePath,
            softphoneUrl,
            shellBase,
            popupName: ctcEntity.SOFTPHONE_POPUP_NAME
        }));
    };

    /**
     * Build the shell page. Client code below is plain ES5 inside a template
     * literal: no backticks, no dollar-brace, backslashes doubled.
     * @param {Object} o
     * @param {string} o.framePath - validated NetSuite path
     * @param {string} o.softphoneUrl - softphone Suitelet URL ('' if unresolved)
     * @param {string} o.shellBase - this Suitelet's own URL ('' if unresolved)
     * @param {string} o.popupName - anchor window name
     * @returns {string}
     */
    const buildHtml = (o) => {
        const cfg = {
            framePath: o.framePath,
            shellBase: o.shellBase,
            signInUrl: '/app/center/card.nl'
        };
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>NetSuite &mdash; Phone mode</title>
<style>
  html, body { height: 100%; overflow: hidden; }
  body { margin: 0; background: #FFFFFF; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
  [hidden] { display: none !important; }
  button { font-family: inherit; cursor: pointer; }
  button:focus-visible { outline: 2px solid #74C0FC; outline-offset: 2px; }
  #ctc-ns-frame { position: fixed; inset: 0; width: 100%; height: 100%; border: 0; z-index: 0; }
  #ctc-phone-frame { position: fixed; left: 16px; bottom: 64px; width: 380px; height: 640px; border: 0; z-index: 10;
    background: #FFFFFF; border-radius: 12px; box-shadow: 0 0 0 1px rgba(22,21,19,0.08), 0 8px 24px rgba(22,21,19,0.10); }
  #ctc-phone-frame.ctc-off { visibility: hidden; pointer-events: none; }
  #ctc-pm-banner { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); width: calc(100% - 32px); max-width: 560px;
    box-sizing: border-box; z-index: 40; display: flex; align-items: center; gap: 12px; padding: 12px 16px;
    background: #FFF8E6; border: 1px solid #F1E3BC; border-radius: 12px; box-shadow: 0 6px 16px rgba(22,21,19,0.08); }
  #ctc-pm-banner .dot { width: 8px; height: 8px; border-radius: 50%; background: #B47200; flex: none; }
  #ctc-pm-banner .text { flex: 1; min-width: 0; }
  #ctc-pm-banner .title { font-size: 13px; font-weight: 600; color: #161513; }
  #ctc-pm-banner .sub { font-size: 12px; color: #5F5B55; margin-top: 2px; }
  #ctc-pm-reload { background: none; border: 0; color: #1B6097; font-size: 13px; padding: 0 8px; height: 32px; border-radius: 6px; }
  #ctc-pm-signin { background: #345D7E; color: #FFFFFF; border: 0; height: 32px; padding: 0 14px; border-radius: 6px; font-size: 13px; font-weight: 600; flex: none; }
  #ctc-pm-pill { position: fixed; left: 16px; bottom: 16px; z-index: 30; height: 32px; padding: 0 14px; border: 0; border-radius: 999px;
    display: inline-flex; align-items: center; gap: 8px; color: #FFFFFF; font-size: 12px; font-weight: 600;
    background: linear-gradient(180deg, #1A2B47 0%, #0F1B30 100%); }
  #ctc-pm-pill .dot { width: 6px; height: 6px; border-radius: 50%; background: #8B8780; }
  #ctc-pm-menu { position: fixed; left: 16px; bottom: 56px; z-index: 31; min-width: 180px; padding: 6px; background: #FFFFFF; border-radius: 12px;
    box-shadow: 0 0 0 1px rgba(22,21,19,0.08), 0 8px 24px rgba(22,21,19,0.10); }
  #ctc-pm-menu button { display: block; width: 100%; height: 32px; padding: 0 10px; text-align: left; background: none; border: 0;
    border-radius: 6px; font-size: 13px; color: #161513; }
  #ctc-pm-menu button:hover { background: #F5F4F2; }
  #ctc-pm-log { position: fixed; right: 16px; bottom: 16px; z-index: 20; width: 420px; height: 280px; box-sizing: border-box;
    overflow: auto; padding: 8px 10px; background: #FFFFFF; border-radius: 12px;
    box-shadow: 0 0 0 1px rgba(22,21,19,0.08), 0 8px 24px rgba(22,21,19,0.10);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; color: #161513; }
  #ctc-pm-log .row { white-space: pre-wrap; word-break: break-all; padding: 1px 0; }
</style>
</head>
<body>
<iframe id="ctc-ns-frame" title="NetSuite" src="${escapeHtml(o.framePath)}"></iframe>
<iframe id="ctc-phone-frame" class="ctc-off" title="Softphone" name="${escapeHtml(o.popupName)}" allow="microphone; autoplay" src="${escapeHtml(o.softphoneUrl || 'about:blank')}"></iframe>

<div id="ctc-pm-banner" role="alert" hidden>
  <span class="dot" aria-hidden="true"></span>
  <div class="text">
    <div class="title">Your NetSuite session ended</div>
    <div class="sub" id="ctc-pm-banner-sub">Sign in again to keep working.</div>
  </div>
  <button type="button" id="ctc-pm-reload">Reload page</button>
  <button type="button" id="ctc-pm-signin">Sign in again</button>
</div>

<button type="button" id="ctc-pm-pill" aria-expanded="false" aria-controls="ctc-pm-menu"><span class="dot" id="ctc-pm-dot" aria-hidden="true"></span>Phone mode</button>
<div id="ctc-pm-menu" hidden>
  <button type="button" id="ctc-pm-phone" aria-expanded="false" aria-controls="ctc-phone-frame">Show phone</button>
  <button type="button" id="ctc-pm-logbtn" aria-expanded="false" aria-controls="ctc-pm-log">Event log</button>
  <button type="button" id="ctc-pm-exit">Exit phone mode</button>
</div>
<div id="ctc-pm-log" role="log" aria-label="Event log" hidden></div>

<script>
(function () {
  'use strict';
  var CFG = ${safeJsonEmbed(cfg)};
  // Never nest: a shell loaded inside the NetSuite frame would start a second
  // phone anchor. Show the plain NetSuite page there instead.
  if (window.top !== window.self) { location.replace(CFG.framePath); return; }
  var ACTIVE = { dialing: 1, ringing: 1, connected: 1 };
  var DOT = { offline: '#8B8780', starting: '#8B8780', ready: '#94A6BF', dialing: '#F4C76A', ringing: '#F4C76A', connected: '#14B981', error: '#EE6E5C' };

  var nsFrame = document.getElementById('ctc-ns-frame');
  var phoneFrame = document.getElementById('ctc-phone-frame');
  var banner = document.getElementById('ctc-pm-banner');
  var bannerSub = document.getElementById('ctc-pm-banner-sub');
  var pill = document.getElementById('ctc-pm-pill');
  var pillDot = document.getElementById('ctc-pm-dot');
  var menu = document.getElementById('ctc-pm-menu');
  var phoneBtn = document.getElementById('ctc-pm-phone');
  var logBtn = document.getElementById('ctc-pm-logbtn');
  var logPanel = document.getElementById('ctc-pm-log');

  var lastGoodPath = CFG.framePath;
  var phase = 'offline';

  // ---- Event log (newest first, last 200) ----
  var entries = [];
  function logEvent(event, detail) {
    var t = new Date().toTimeString().slice(0, 8);
    entries.unshift({ t: t, e: event, d: detail == null ? '' : String(detail) });
    if (entries.length > 200) entries.length = 200;
    console.log('[ctc-shell]', event, detail == null ? '' : detail);
    if (!logPanel.hidden) renderLog();
  }
  function renderLog() {
    logPanel.textContent = '';
    for (var i = 0; i < entries.length; i++) {
      var row = document.createElement('div');
      row.className = 'row';
      row.textContent = entries[i].t + '  ' + entries[i].e + (entries[i].d ? '  ' + entries[i].d : '');
      logPanel.appendChild(row);
    }
  }
  function tail(s) {
    s = String(s || '');
    return s.length > 60 ? '\\u2026' + s.slice(-60) : s;
  }

  // ---- top.document shim ----
  // NetSuite's nsResizeIframeToContent(c) calls top.document.getElementById(c).
  // Inside phone mode, top is this shell, not the NetSuite page, so that
  // lookup returns null and NetSuite throws. When the shell has no element
  // with the id, fall back to the NetSuite frame's document.
  var origGetById = document.getElementById.bind(document);
  var fallbackLogged = 0;
  document.getElementById = function (id) {
    var el = origGetById(id);
    if (el) return el;
    try {
      var doc = nsFrame.contentDocument;
      var found = doc ? doc.getElementById(id) : null;
      if (found && fallbackLogged < 20) {
        fallbackLogged++;
        logEvent('getElementById fallback', id);
      }
      return found;
    } catch (e) {
      return null;
    }
  };

  // ---- Session banner ----
  function bannerText() {
    bannerSub.textContent = ACTIVE[phase] ? 'Your call is still connected.' : 'Sign in again to keep working.';
  }
  function showBanner() {
    bannerText();
    if (banner.hidden) {
      banner.hidden = false;
      logEvent('banner shown', 'phase=' + phase);
    }
  }
  document.getElementById('ctc-pm-signin').addEventListener('click', function () {
    window.open(CFG.signInUrl, '_blank');
  });
  document.getElementById('ctc-pm-reload').addEventListener('click', function () {
    banner.hidden = true;
    nsFrame.src = lastGoodPath;
  });

  // ---- Frame watcher ----
  function isLoginPath(p) {
    return p.indexOf('/pages/login') === 0 || p.indexOf('/pages/customerlogin') === 0 ||
      p.indexOf('/app/login') === 0 || p.indexOf('/login.nl') !== -1 || p.indexOf('enterpriselogin') !== -1;
  }
  function leftFrame(reason) {
    // Oracle forbids showing the login page inside an iframe: blank it now.
    nsFrame.src = 'about:blank';
    logEvent('left-frame', reason);
    showBanner();
  }
  function currentFramePath() {
    try {
      var loc = nsFrame.contentWindow.location;
      if (loc.protocol === 'about:') return lastGoodPath;
      return loc.pathname + loc.search + loc.hash;
    } catch (e) {
      return lastGoodPath;
    }
  }
  nsFrame.addEventListener('load', function () {
    var loc, path, title, win;
    try {
      win = nsFrame.contentWindow;
      loc = win.location;
      if (loc.protocol === 'about:') return; // our own blanking
      path = loc.pathname + loc.search + loc.hash;
      title = nsFrame.contentDocument ? nsFrame.contentDocument.title : '';
    } catch (e) {
      leftFrame('cross-origin: ' + (e && e.name ? e.name : 'unreadable'));
      return;
    }
    if (isLoginPath(loc.pathname)) {
      leftFrame('login page: ' + loc.pathname);
      return;
    }
    lastGoodPath = path;
    if (CFG.shellBase) {
      var sep = CFG.shellBase.indexOf('?') === -1 ? '?' : '&';
      try { history.replaceState(null, '', CFG.shellBase + sep + 'u=' + encodeURIComponent(path)); } catch (e) { /* ignore */ }
    }
    if (title) document.title = title;
    logEvent('frame load', path);
    try {
      win.addEventListener('error', function (ev) {
        logEvent('frame error', (ev && ev.message ? ev.message : 'error') + ' @ ' + tail(ev && ev.filename));
      });
    } catch (e) { /* frame window not accessible */ }
  });

  // ---- Call-aware guard ----
  function onBeforeUnload(e) {
    e.preventDefault();
    e.returnValue = '';
  }
  var guardOn = false;
  function setGuard(on) {
    if (on === guardOn) return;
    guardOn = on;
    if (on) window.addEventListener('beforeunload', onBeforeUnload);
    else window.removeEventListener('beforeunload', onBeforeUnload);
  }
  function setPhase(next) {
    next = String(next || 'offline');
    if (next === phase) return;
    logEvent('bus phase', phase + ' -> ' + next);
    phase = next;
    pillDot.style.background = DOT[phase] || DOT.offline;
    pill.setAttribute('title', 'Phone: ' + phase);
    setGuard(!!ACTIVE[phase]);
    if (!banner.hidden) bannerText();
  }
  if (typeof BroadcastChannel === 'function') {
    var bus = new BroadcastChannel('ctc-bus');
    bus.onmessage = function (ev) {
      var m = ev && ev.data;
      if (!m || m.v !== 1) return;
      if (m.type === 'snapshot' && m.snap) setPhase(m.snap.phase);
    };
    bus.postMessage({ v: 1, type: 'hello' });
  } else {
    logEvent('bus unavailable', 'no BroadcastChannel');
  }

  // ---- Phone mode menu ----
  function setMenu(open) {
    menu.hidden = !open;
    pill.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  pill.addEventListener('click', function () { setMenu(menu.hidden); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !menu.hidden) {
      setMenu(false);
      pill.focus();
    }
  });
  phoneBtn.addEventListener('click', function () {
    var show = phoneFrame.classList.contains('ctc-off');
    phoneFrame.classList.toggle('ctc-off', !show);
    phoneBtn.textContent = show ? 'Hide phone' : 'Show phone';
    phoneBtn.setAttribute('aria-expanded', show ? 'true' : 'false');
  });
  logBtn.addEventListener('click', function () {
    logPanel.hidden = !logPanel.hidden;
    logBtn.setAttribute('aria-expanded', logPanel.hidden ? 'false' : 'true');
    if (!logPanel.hidden) renderLog();
  });
  document.getElementById('ctc-pm-exit').addEventListener('click', function () {
    if (ACTIVE[phase] && !window.confirm('Leaving phone mode will end your call. Leave?')) return;
    setGuard(false); // the rep already confirmed; skip the second browser prompt
    top.location.href = currentFramePath();
  });

  logEvent('shell start', CFG.framePath);
})();
</script>
</body>
</html>`;
    };

    return { onRequest, safeFramePath, DEFAULT_FRAME_PATH };
});
