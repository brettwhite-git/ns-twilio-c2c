/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * Phone mode shell.
 *
 * The one place a call can live. This Suitelet is the tab's top page
 * ("shell") and never reloads. It holds two same-origin iframes:
 *   1. #ctc-ns-frame    full-size NetSuite UI. NetSuite clicks reload only
 *                       this frame.
 *   2. #ctc-phone-frame the softphone Suitelet (the call anchor and ctc-bus
 *                       host), hidden. The shell never reloads, so this frame
 *                       never reloads, so the call persists.
 * Exactly one shell per browser runs the phone: it takes the Web Lock
 * 'ctc-phone-anchor' before it loads #ctc-phone-frame. A second shell tab
 * shows "Your phone is open in another tab" and no phone.
 * The shell page itself draws the one dock pill + dialer (lib/ctc_dock_client.js
 * in shell mode). Docks on NetSuite pages inside the frame stay silent and
 * send Call clicks here through window.__ctcShell.call(ctx).
 * The shell also adds a session banner, a call-aware leave guard and a
 * top.document.getElementById shim. Shell events go to the console.
 */
// eslint-disable-next-line suitescript/no-log-module
define(['N/url', 'N/log', 'N/file', './lib/ctc_html', './lib/ctc_entity', './lib/ctc_dock'], (url, log, file, ctcHtml, ctcEntity, ctcDock) => {

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
     * Script tags that load the dock (pill + dialer) into the shell page. A
     * missing dock file or RESTlet must never break the shell.
     * @param {string} shellBase - this Suitelet's own URL
     * @returns {string}
     */
    const buildShellDockTags = (shellBase) => {
        try {
            const restletUrl = url.resolveScript({
                scriptId: 'customscript_ctc_rl_token',
                deploymentId: 'customdeploy_ctc_rl_token',
                returnExternalUrl: false
            });
            return ctcDock.buildDockScriptTag({
                assetUrl: file.load({ id: ctcDock.DOCK_ASSET_PATH }).url,
                dialerUrl: file.load({ id: ctcDock.DIALER_ASSET_PATH }).url,
                restletUrl: restletUrl,
                shellUrl: shellBase,
                context: {}
            });
        } catch (e) {
            log.error({ title: 'CTC Shell — Failed to load dock scripts', details: e.message || e });
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
            phoneFrameName: ctcEntity.SOFTPHONE_POPUP_NAME,
            dockTags: buildShellDockTags(shellBase)
        }));
    };

    /**
     * Build the shell page. Client code below is plain ES5 inside a template
     * literal: no backticks, no dollar-brace, backslashes doubled.
     * @param {Object} o
     * @param {string} o.framePath - validated NetSuite path
     * @param {string} o.softphoneUrl - softphone Suitelet URL ('' if unresolved)
     * @param {string} o.shellBase - this Suitelet's own URL ('' if unresolved)
     * @param {string} o.phoneFrameName - name of the hidden phone frame
     * @param {string} [o.dockTags] - dock <script> tags ('' if unavailable)
     * @returns {string}
     */
    const buildHtml = (o) => {
        const cfg = {
            framePath: o.framePath,
            shellBase: o.shellBase,
            softphoneUrl: o.softphoneUrl || '',
            signInUrl: '/app/center/card.nl',
            lockName: ctcDock.PHONE_LOCK_NAME,
            exitKey: ctcDock.EXIT_KEY,
            openRecordType: ctcDock.OPEN_RECORD_MESSAGE
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
  /* The phone frame holds audio and call state. It stays hidden. */
  #ctc-phone-frame { position: fixed; left: calc(50% - 200px); top: 50%; transform: translate(-50%, -50%); max-height: calc(100vh - 32px); width: 380px; height: 640px; border: 0; z-index: 10;
    background: #FFFFFF; border-radius: 12px; box-shadow: 0 0 0 1px rgba(22,21,19,0.08), 0 8px 24px rgba(22,21,19,0.10); }
  #ctc-phone-frame.ctc-off { visibility: hidden; pointer-events: none; }
  #ctc-pm-banners { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); width: calc(100% - 32px); max-width: 560px;
    z-index: 40; display: flex; flex-direction: column; gap: 8px; pointer-events: none; }
  .ctc-pm-banner { box-sizing: border-box; display: flex; align-items: center; gap: 12px; padding: 12px 16px; pointer-events: auto;
    background: #FFF8E6; border: 1px solid #F1E3BC; border-radius: 12px; box-shadow: 0 6px 16px rgba(22,21,19,0.08); }
  .ctc-pm-banner .dot { width: 8px; height: 8px; border-radius: 50%; background: #B47200; flex: none; }
  .ctc-pm-banner .text { flex: 1; min-width: 0; }
  .ctc-pm-banner .title { font-size: 13px; font-weight: 600; color: #161513; }
  .ctc-pm-banner .sub { font-size: 12px; color: #5F5B55; margin-top: 2px; }
  #ctc-pm-reload, #ctc-pm-busy-reload { background: none; border: 0; color: #1B6097; font-size: 13px; padding: 0 8px; height: 32px; border-radius: 6px; }
  #ctc-pm-signin { background: #345D7E; color: #FFFFFF; border: 0; height: 32px; padding: 0 14px; border-radius: 6px; font-size: 13px; font-weight: 600; flex: none; }
</style>
</head>
<body>
<iframe id="ctc-ns-frame" title="NetSuite" src="${escapeHtml(o.framePath)}"></iframe>
<iframe id="ctc-phone-frame" class="ctc-off" title="Softphone" name="${escapeHtml(o.phoneFrameName)}" allow="microphone; autoplay" src="about:blank"></iframe>

<div id="ctc-pm-banners">
  <div class="ctc-pm-banner" id="ctc-pm-banner" role="alert" hidden>
    <span class="dot" aria-hidden="true"></span>
    <div class="text">
      <div class="title">Your NetSuite session ended</div>
      <div class="sub" id="ctc-pm-banner-sub">Sign in again to keep working.</div>
    </div>
    <button type="button" id="ctc-pm-reload">Reload page</button>
    <button type="button" id="ctc-pm-signin">Sign in again</button>
  </div>
  <div class="ctc-pm-banner" id="ctc-pm-busy" role="alert" hidden>
    <span class="dot" aria-hidden="true"></span>
    <div class="text">
      <div class="title">Your phone is open in another tab</div>
      <div class="sub">Use that tab for calls, or close it and reload this one.</div>
    </div>
    <button type="button" id="ctc-pm-busy-reload">Reload</button>
  </div>
</div>
<script>
(function () {
  'use strict';
  var CFG = ${safeJsonEmbed(cfg)};
  // Never nest: a shell loaded inside the NetSuite frame would start a second
  // phone anchor. Show the plain NetSuite page there instead.
  if (window.top !== window.self) { location.replace(CFG.framePath); return; }

  // Shell API for the dock. Set before the dock scripts below load: the dock
  // picks shell mode when it finds it on the top window. call(ctx) opens the
  // dialer on Dial with the record loaded; it never dials by itself.
  window.__ctcShell = {
    version: 1,
    context: null,
    call: function (ctx) {
      if (window.__ctcDock && typeof window.__ctcDock.call === 'function') window.__ctcDock.call(ctx || null);
    },
    exit: function () {}
  };
  var ACTIVE = { incoming: 1, dialing: 1, ringing: 1, connected: 1 };

  var nsFrame = document.getElementById('ctc-ns-frame');
  var phoneFrame = document.getElementById('ctc-phone-frame');
  var banner = document.getElementById('ctc-pm-banner');
  var bannerSub = document.getElementById('ctc-pm-banner-sub');

  var busy = document.getElementById('ctc-pm-busy');

  var lastGoodPath = CFG.framePath;
  var phase = 'offline';
  var phoneStarted = false;

  // ---- Event log (console only) ----
  function logEvent(event, detail) {
    console.log('[ctc-shell]', event, detail == null ? '' : detail);
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
    // The phone frame kept the old session. Restart it too, unless a call is
    // live (the call does not need the NetSuite session until it is logged).
    if (phoneStarted && !ACTIVE[phase]) {
      logEvent('phone restart', 'after sign-in');
      phoneFrame.src = phoneFrame.src;
    }
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
    syncContext(win);
    try {
      win.addEventListener('error', function (ev) {
        logEvent('frame error', (ev && ev.message ? ev.message : 'error') + ' @ ' + tail(ev && ev.filename));
      });
    } catch (e) { /* frame window not accessible */ }
  });

  // ---- Record context for the dock ----
  // The dock on a record page inside the frame (frame mode) leaves its
  // record in window.__ctcRecordContext. Pass it to the shell's dialer so
  // its Dial tab follows the page (the dialer decides when to follow).
  function syncContext(win) {
    var ctx = null;
    try { ctx = win.__ctcRecordContext || null; } catch (e) { ctx = null; }
    window.__ctcShell.context = ctx;
    if (window.__ctcDock && typeof window.__ctcDock.setContext === 'function') {
      try { window.__ctcDock.setContext(ctx); } catch (e) { logEvent('dock context error', e && e.message); }
    }
  }

  // ---- Keep NetSuite navigation inside the frame ----
  // NetSuite's main menu does not navigate its own page: it replaces the TOP
  // page (top.location.replace). Inside phone mode that would throw the tab
  // out of the shell and restart the phone. The Navigation API lets the top
  // page see that navigation; cancel it and load the URL in the frame
  // instead. Left alone: navigations the user starts from the browser UI
  // (address bar, reload, back/forward are not cancelable or are traverses),
  // login pages (Oracle forbids framing them), other sites, the shell's own
  // URL, and our own Exit phone mode.
  var allowTopNav = false;
  var shellScriptId = '';
  try { shellScriptId = new URL(CFG.shellBase, location.href).searchParams.get('script') || ''; } catch (e) { shellScriptId = ''; }
  if (window.navigation && typeof window.navigation.addEventListener === 'function') {
    window.navigation.addEventListener('navigate', function (e) {
      if (allowTopNav || !e.cancelable || e.hashChange || e.downloadRequest) return;
      if (e.navigationType !== 'push' && e.navigationType !== 'replace') return;
      var dest;
      try { dest = new URL(e.destination.url); } catch (err) { return; }
      if (dest.origin !== location.origin || dest.pathname.indexOf('/app/') !== 0) return;
      if (isLoginPath(dest.pathname)) return;
      if (shellScriptId && dest.searchParams.get('script') === shellScriptId) return;
      if (dest.pathname === location.pathname && dest.search === location.search) return; // our own replaceState
      e.preventDefault();
      var path = dest.pathname + dest.search + dest.hash;
      logEvent('kept in frame', path);
      nsFrame.src = path;
    });
  } else {
    logEvent('navigation api missing', 'NetSuite menu clicks will leave phone mode');
  }

  // ---- Screen-pop (inbound) ----
  // After Answer on a matched caller the phone frame asks to open the record
  // in the NetSuite frame. Accepted only from #ctc-phone-frame, same origin,
  // and only an entity record path with a numeric id.
  var RECORD_PATH = /^[/]app[/]common[/]entity[/](custjob|contact)[.]nl[?]id=[0-9]+$/;
  window.addEventListener('message', function (ev) {
    var m = ev && ev.data;
    if (!m || m.v !== 1 || m.type !== CFG.openRecordType) return;
    if (ev.origin !== location.origin || ev.source !== phoneFrame.contentWindow) return;
    if (typeof m.path !== 'string' || !RECORD_PATH.test(m.path)) {
      logEvent('screen-pop refused', tail(m.path));
      return;
    }
    logEvent('screen-pop', m.path);
    nsFrame.src = m.path;
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

  // ---- Exit phone mode ----
  // The tab lands on the frame's page outside the shell. The flag stops the
  // dashboard dock from bringing the rep straight back (auto-enter).
  function exitPhoneMode() {
    if (ACTIVE[phase] && !window.confirm('Leaving phone mode will end your call. Leave?')) return;
    setGuard(false); // the rep already confirmed; skip the second browser prompt
    try { window.sessionStorage.setItem(CFG.exitKey, '1'); } catch (e) { /* storage blocked */ }
    logEvent('exit phone mode', currentFramePath());
    allowTopNav = true;
    window.location.href = currentFramePath();
  }
  window.__ctcShell.exit = exitPhoneMode;

  // ---- Phone frame: one per browser (Web Lock) ----
  function startPhone(reason) {
    if (!CFG.softphoneUrl) { logEvent('phone not started', 'no softphone URL'); return; }
    phoneStarted = true;
    phoneFrame.src = CFG.softphoneUrl;
    logEvent('phone start', reason);
  }
  if (navigator.locks && typeof navigator.locks.request === 'function') {
    navigator.locks.request(CFG.lockName, { ifAvailable: true }, function (lock) {
      if (!lock) {
        busy.hidden = false;
        logEvent('phone busy', 'another tab holds ' + CFG.lockName);
        return;
      }
      startPhone('lock held');
      // Keep the lock until this page goes away.
      return new Promise(function () {});
    }).catch(function (e) {
      logEvent('lock error', e && e.message);
      startPhone('lock error');
    });
  } else {
    logEvent('lock unavailable', 'no Web Locks API');
    startPhone('no lock');
  }
  document.getElementById('ctc-pm-busy-reload').addEventListener('click', function () {
    window.location.reload();
  });

  logEvent('shell start', CFG.framePath);
})();
</script>
${o.dockTags || ''}
</body>
</html>`;
    };

    return { onRequest, safeFramePath };
});
