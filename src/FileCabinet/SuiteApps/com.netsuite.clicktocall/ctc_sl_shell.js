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
        ctcHtml.setNoStoreHeaders(context.response);
        context.response.write(buildHtml({
            framePath,
            softphoneUrl,
            shellBase,
            phoneFrameName: ctcEntity.SOFTPHONE_POPUP_NAME,
            dockTags: buildShellDockTags(shellBase)
        }));
    };

    // Handset glyph (same path as the softphone's Call button). Decline turns it 135°.
    const HANDSET_PATH = 'M1.5 4.5a3 3 0 0 1 3-3h1.372c.86 0 1.61.586 1.819 1.42l1.105 4.423a1.875 1.875 0 0 1-.694 1.955l-1.293.97c-.135.101-.164.249-.126.352a11.285 11.285 0 0 0 6.697 6.697c.103.038.25.009.352-.126l.97-1.293a1.875 1.875 0 0 1 1.955-.694l4.423 1.105c.834.209 1.42.959 1.42 1.82V19.5a3 3 0 0 1-3 3h-2.25C8.552 22.5 1.5 15.448 1.5 6.75V4.5z';

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
            openRecordType: ctcDock.OPEN_RECORD_MESSAGE,
            busChannel: ctcDock.BUS_CHANNEL,
            phaseIncoming: ctcDock.PHASE_INCOMING,
            phaseMoved: ctcDock.PHASE_MOVED,
            requestOrigin: ctcDock.REQUEST_ORIGIN,
            requestAnswer: ctcDock.REQUEST_ANSWER,
            requestDecline: ctcDock.REQUEST_DECLINE,
            requestTakeover: ctcDock.REQUEST_TAKEOVER,
            requestUnlock: ctcDock.REQUEST_UNLOCK_AUDIO,
            phoneMovedType: ctcDock.PHONE_MOVED_MESSAGE,
            phoneDisabledType: ctcDock.PHONE_DISABLED_MESSAGE,
            shellStateType: ctcDock.SHELL_STATE_MESSAGE,
            unlockAudioType: ctcDock.UNLOCK_AUDIO_MESSAGE,
            takeoverParam: ctcDock.TAKEOVER_PARAM
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
  #ctc-pm-reload, #ctc-pm-busy-reload, #ctc-pm-disabled-exit { background: none; border: 0; color: #1B6097; font-size: 13px; padding: 0 8px; height: 32px; border-radius: 6px; flex: none; }
  #ctc-pm-signin, #ctc-pm-busy-take { background: #345D7E; color: #FFFFFF; border: 0; height: 32px; padding: 0 14px; border-radius: 6px; font-size: 13px; font-weight: 600; flex: none; }

  /* Inbound toast: top centre, below the pill's top-row snap point (top is
     set by script), above NetSuite and the dock. */
  .ctc-toast { position: fixed; top: 80px; left: 50%; z-index: 2147483001; box-sizing: border-box;
    width: 380px; max-width: calc(100vw - 32px); display: flex; align-items: center; gap: 12px; padding: 14px 14px 14px 16px;
    border-radius: 16px; color: #FFFFFF; background: linear-gradient(180deg, #1A2B47 0%, #0F1B30 100%);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 10px 24px rgba(15,27,48,0.26);
    font-family: Figtree, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    opacity: 0; transform: translate(-50%, -8px);
    transition: opacity 200ms cubic-bezier(0.23, 1, 0.32, 1), transform 200ms cubic-bezier(0.23, 1, 0.32, 1); }
  .ctc-toast.open { opacity: 1; transform: translate(-50%, 0); }
  .ctc-toast.closing { opacity: 0; transform: translate(-50%, 0); transition: opacity 150ms ease-out; }
  .ctc-toast-text { flex: 1; min-width: 0; }
  .ctc-toast-label { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 500; line-height: 16px; color: rgba(255,255,255,0.72); }
  .ctc-toast-dot { width: 8px; height: 8px; border-radius: 50%; background: #14B981; flex: none; animation: ctc-toast-ring 1.6s ease-out infinite; }
  .ctc-toast-name { margin-top: 4px; font-size: 16px; font-weight: 600; line-height: 22px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ctc-toast-sub { margin-top: 2px; font-size: 13px; line-height: 18px; color: rgba(255,255,255,0.72); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ctc-toast-sub:empty { display: none; }
  .ctc-toast-actions { display: flex; gap: 10px; flex: none; }
  .ctc-toast-btn { width: 44px; height: 44px; border: 0; border-radius: 999px; padding: 0; color: #FFFFFF;
    display: inline-flex; align-items: center; justify-content: center; transition: transform 100ms ease-out, filter 100ms ease-out; }
  .ctc-toast-btn svg { width: 20px; height: 20px; }
  .ctc-toast-btn:hover { filter: brightness(1.06); }
  .ctc-toast-btn:active { transform: scale(0.96); }
  .ctc-toast-btn.decline { background: #EE6E5C; box-shadow: 0 4px 12px rgba(238,110,92,0.40); }
  .ctc-toast-btn.decline svg { transform: rotate(135deg); }
  .ctc-toast-btn.answer { background: #14B981; box-shadow: 0 4px 12px rgba(20,185,129,0.36); }
  @keyframes ctc-toast-ring {
    0% { box-shadow: 0 0 0 0 rgba(20,185,129,0.55); }
    100% { box-shadow: 0 0 0 8px rgba(20,185,129,0); }
  }
  @media (prefers-reduced-motion: reduce) {
    .ctc-toast-dot { animation: none; }
    .ctc-toast, .ctc-toast.open, .ctc-toast.closing { transform: translate(-50%, 0); }
    .ctc-toast-btn:active { transform: none; }
  }
  .ctc-sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
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
      <div class="sub">Use that tab for calls, or move the phone to this tab.</div>
    </div>
    <button type="button" id="ctc-pm-busy-reload">Reload</button>
    <button type="button" id="ctc-pm-busy-take">Use phone here</button>
  </div>
  <div class="ctc-pm-banner" id="ctc-pm-disabled" role="status" hidden>
    <span class="dot" aria-hidden="true"></span>
    <div class="text">
      <div class="title">The phone is not enabled for your user. Ask your administrator.</div>
    </div>
    <button type="button" id="ctc-pm-disabled-exit">Exit phone mode</button>
  </div>
</div>

<div id="ctc-toast" class="ctc-toast" role="alertdialog" aria-labelledby="ctc-toast-label" aria-describedby="ctc-toast-name ctc-toast-sub" hidden>
  <div class="ctc-toast-text">
    <div class="ctc-toast-label" id="ctc-toast-label"><span class="ctc-toast-dot" aria-hidden="true"></span>Incoming call</div>
    <div class="ctc-toast-name" id="ctc-toast-name"></div>
    <div class="ctc-toast-sub" id="ctc-toast-sub"></div>
  </div>
  <div class="ctc-toast-actions">
    <button type="button" class="ctc-toast-btn decline" id="ctc-toast-decline" aria-label="Decline" title="Decline">
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${HANDSET_PATH}"/></svg>
    </button>
    <button type="button" class="ctc-toast-btn answer" id="ctc-toast-answer" aria-label="Answer" title="Answer">
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${HANDSET_PATH}"/></svg>
    </button>
  </div>
</div>
<div id="ctc-toast-live" class="ctc-sr" aria-live="assertive" aria-atomic="true"></div>
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
  // unlockAudio(): call it inside a click / key handler ("Turn on phone").
  // takeover(): "Use phone here" in a shell that waits for the phone.
  // phoneState(): { lock, audioUnlocked, notify } for the dock.
  window.__ctcShell = {
    version: 1,
    context: null,
    call: function (ctx) {
      if (window.__ctcDock && typeof window.__ctcDock.call === 'function') window.__ctcDock.call(ctx || null);
    },
    exit: function () {},
    unlockAudio: function () { unlockAudio('dock'); },
    takeover: function () { return takeover(); },
    phoneState: function () { return { lock: lockState, audioUnlocked: audioUnlocked, notify: notifyState() }; }
  };
  var ACTIVE = { incoming: 1, dialing: 1, ringing: 1, connected: 1, reconnecting: 1 };
  var SEARCH = String(location.search || '');
  var DEBUG = /[?&]debug=1(&|$)/.test(SEARCH);
  var wantTakeover = new RegExp('[?&]' + CFG.takeoverParam + '=1(&|$)').test(SEARCH);

  var nsFrame = document.getElementById('ctc-ns-frame');
  var phoneFrame = document.getElementById('ctc-phone-frame');
  var banner = document.getElementById('ctc-pm-banner');
  var bannerSub = document.getElementById('ctc-pm-banner-sub');

  var busy = document.getElementById('ctc-pm-busy');
  var disabledBanner = document.getElementById('ctc-pm-disabled');

  var lastGoodPath = CFG.framePath;
  var phase = 'offline';
  var phoneStarted = false;
  // True from the session banner until the NetSuite frame loads a normal
  // (non-login) page again, i.e. the rep signed in again.
  var sessionLost = false;

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

  // ---- Page title (the toast flashes it while ringing) ----
  var realTitle = document.title;
  var flashTimer = null;
  var flashOn = false;
  var flashLabel = '';
  function setRealTitle(t) {
    realTitle = t;
    if (!flashTimer) document.title = t;
  }

  // ---- Session banner ----
  function bannerText() {
    bannerSub.textContent = ACTIVE[phase] ? 'Your call is still connected.' : 'Sign in again to keep working.';
  }
  function showBanner() {
    sessionLost = true;
    bannerText();
    if (banner.hidden) {
      banner.hidden = false;
      logEvent('banner shown', 'phase=' + phase);
    }
  }
  document.getElementById('ctc-pm-signin').addEventListener('click', function () {
    window.open(CFG.signInUrl, '_blank');
  });
  // The phone frame kept the old session. Restart it, unless a call is live
  // (the call does not need the NetSuite session until it is logged; the
  // softphone renews its own token and rebuilds after the call).
  function restartPhone(reason) {
    if (!phoneStarted) return;
    if (ACTIVE[phase]) {
      logEvent('phone restart skipped', reason + ', call live');
      return;
    }
    logEvent('phone restart', reason);
    phoneFrame.src = phoneUrl();
  }
  // The first normal page after the session banner means the rep signed in
  // again: hide the banner and restart the phone. The Reload button only
  // reloads the NetSuite frame; a login page there shows the banner again.
  function sessionBack() {
    if (!sessionLost) return;
    sessionLost = false;
    banner.hidden = true;
    restartPhone('signed in again');
  }
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
    sessionBack();
    if (CFG.shellBase) {
      var sep = CFG.shellBase.indexOf('?') === -1 ? '?' : '&';
      try { history.replaceState(null, '', CFG.shellBase + sep + 'u=' + encodeURIComponent(path) + (DEBUG ? '&debug=1' : '')); } catch (e) { /* ignore */ }
    }
    if (title) setRealTitle(title);
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

  // ---- Messages from the phone frame ----
  // Accepted only from #ctc-phone-frame, same origin.
  //   OPEN_RECORD_MESSAGE: screen-pop after Answer on a matched caller; only
  //     an entity record path with a numeric id.
  //   PHONE_MOVED_MESSAGE: the anchor handed the phone to another tab.
  //   PHONE_DISABLED_MESSAGE: the RESTlet refuses tokens for this user.
  var RECORD_PATH = /^[/]app[/]common[/]entity[/](custjob|contact)[.]nl[?]id=[0-9]+$/;
  window.addEventListener('message', function (ev) {
    var m = ev && ev.data;
    if (!m || m.v !== 1) return;
    if (m.type !== CFG.openRecordType && m.type !== CFG.phoneMovedType && m.type !== CFG.phoneDisabledType) return;
    if (ev.origin !== location.origin || ev.source !== phoneFrame.contentWindow) return;
    if (m.type === CFG.phoneMovedType) { phoneMoved(); return; }
    if (m.type === CFG.phoneDisabledType) { phoneDisabled(); return; }
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

  // ---- Bus ----
  // Requests from the shell carry origin + a fresh nonce (bus contract).
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
  var bus = null;
  function busRequest(action) {
    if (!bus) return '';
    var m = { v: 1, type: 'request', action: action, origin: CFG.requestOrigin, nonce: makeNonce() };
    bus.postMessage(m);
    return m.nonce;
  }
  function onSnapshot(snap) {
    setPhase(snap.phase);
    takeoverReply(snap);
    toastFromSnapshot(snap);
  }
  if (typeof BroadcastChannel === 'function') {
    bus = new BroadcastChannel(CFG.busChannel);
    bus.onmessage = function (ev) {
      var m = ev && ev.data;
      if (!m || m.v !== 1) return;
      if (m.type === 'snapshot' && m.snap) {
        onSnapshot(m.snap);
      } else if (m.type === 'request' && m.action === CFG.requestUnlock && m.origin === CFG.requestOrigin) {
        // Only a gesture in this tab counts (transient activation now).
        if (hasTransientActivation()) unlockAudio('bus request');
      }
    };
    bus.postMessage({ v: 1, type: 'hello' });
  } else {
    logEvent('bus unavailable', 'no BroadcastChannel');
  }

  // ---- Audio + notification unlock ----
  // Browsers may block the ringtone (autoplay) and the notification prompt
  // until the rep interacts with this top-level page. audioUnlocked: the tab
  // had a gesture (sticky activation, a click / key in the shell). Clicks in
  // the NetSuite frame give the shell sticky activation too; a 2 s poll
  // notices it. Each unlock asks the phone frame to resume its audio.
  // unlockAudio() (dock "Turn on phone", bus 'unlockAudio' with transient
  // activation) also asks for Notification permission, once.
  function hasActivation() {
    try { return !!(navigator.userActivation && navigator.userActivation.hasBeenActive); } catch (e) { return false; }
  }
  function hasTransientActivation() {
    try { return navigator.userActivation ? !!navigator.userActivation.isActive : true; } catch (e) { return true; }
  }
  function notifyState() {
    if (typeof Notification !== 'function') return 'unsupported';
    var p = Notification.permission;
    return (p === 'granted' || p === 'denied') ? p : 'default';
  }
  var audioUnlocked = hasActivation();
  var notifyAsked = false;
  function postToPhone(msg) {
    if (!phoneStarted) return;
    try {
      if (phoneFrame.contentWindow) phoneFrame.contentWindow.postMessage(msg, location.origin);
    } catch (e) { /* phone frame not ready */ }
  }
  function sendShellState() {
    postToPhone({ v: 1, type: CFG.shellStateType, audioUnlocked: audioUnlocked, notify: notifyState() });
  }
  function markUnlocked(reason) {
    var changed = !audioUnlocked;
    audioUnlocked = true;
    postToPhone({ v: 1, type: CFG.unlockAudioType });
    if (changed) {
      logEvent('audio unlocked', reason);
      sendShellState();
    }
  }
  function unlockAudio(reason) {
    markUnlocked(reason || 'unlock');
    if (notifyAsked || notifyState() !== 'default') { sendShellState(); return; }
    notifyAsked = true;
    var done = function () {
      logEvent('notification permission', notifyState());
      sendShellState();
    };
    try {
      var p = Notification.requestPermission(done);
      if (p && typeof p.then === 'function') p.then(done, done);
    } catch (e) {
      logEvent('notification permission error', e && e.message);
    }
  }
  function onShellGesture() {
    if (!audioUnlocked) markUnlocked('shell gesture');
  }
  document.addEventListener('pointerdown', onShellGesture, true);
  document.addEventListener('keydown', onShellGesture, true);
  var activationPoll = null;
  if (!audioUnlocked) {
    activationPoll = setInterval(function () {
      if (audioUnlocked || hasActivation()) {
        clearInterval(activationPoll);
        activationPoll = null;
        if (!audioUnlocked) markUnlocked('page activation');
      }
    }, 2000);
  }
  try {
    if (navigator.permissions && typeof navigator.permissions.query === 'function') {
      navigator.permissions.query({ name: 'notifications' }).then(function (st) {
        st.onchange = sendShellState;
      }).catch(function () { /* not supported */ });
    }
  } catch (e) { /* permissions API missing */ }
  // A (re)loaded phone frame starts with defaults: tell it the shell state.
  phoneFrame.addEventListener('load', function () { sendShellState(); });

  // ---- Inbound toast ----
  // Phase 'incoming' shows a toast over any NetSuite page. Answer / Decline
  // send the bus requests; the toast closes on answer, decline, or when the
  // phase leaves 'incoming' (caller hung up). Focus moves to Answer only
  // when the rep is not typing somewhere (shell focused, nothing focused).
  // Away (tab hidden or window unfocused): a system notification (when
  // allowed) and a flashing title, until the phase leaves 'incoming'.
  var toast = document.getElementById('ctc-toast');
  var toastName = document.getElementById('ctc-toast-name');
  var toastSub = document.getElementById('ctc-toast-sub');
  var toastLive = document.getElementById('ctc-toast-live');
  var toastAnswer = document.getElementById('ctc-toast-answer');
  var toastDecline = document.getElementById('ctc-toast-decline');
  var PILL_SIZE = 52;
  var EDGE = 16;
  var TOAST_GAP = 12;
  var toastOpen = false;
  var toastCloseTimer = null;
  var toastInfo = { title: '', sub: '', key: '' };
  var toastDismissedKey = '';
  var notif = null;
  var notifKey = '';

  // Below the dock pill's top-row snap points (the dock keeps them 8 px
  // under the NetSuite header).
  function toastTop() {
    var top = EDGE;
    try {
      var doc = nsFrame.contentDocument;
      var header = doc && doc.querySelector && doc.querySelector('#ns_navigation, #ns-header-menu-main, .ns-navigation, #div__header');
      if (header) {
        var r = header.getBoundingClientRect();
        if (r.bottom > 0 && r.bottom < window.innerHeight / 2) top = Math.max(top, r.bottom + 8);
      }
    } catch (e) { /* frame not readable */ }
    return top + PILL_SIZE + TOAST_GAP;
  }
  function callerInfo(snap) {
    var c = snap.caller || {};
    var number = String(c.number || snap.number || '');
    var name = String(c.name || '');
    var contact = String(snap.contactName || '');
    var sub = [];
    if (name && number) sub.push(number);
    if (contact && contact !== name) sub.push(contact);
    return {
      title: name || number || 'Unknown caller',
      sub: sub.join(' \\u00b7 '),
      key: String(snap.callSid || '') || ('n:' + number)
    };
  }
  function focusAnswer(force) {
    if (!toastOpen) return;
    if (!force) {
      var ae = document.activeElement;
      var idle = !ae || ae === document.body || ae === document.documentElement || toast.contains(ae);
      if (!document.hasFocus() || !idle) return;
    }
    try { toastAnswer.focus({ preventScroll: true }); } catch (e) { toastAnswer.focus(); }
  }
  function showToast(snap) {
    var info = callerInfo(snap);
    if (info.key === toastDismissedKey) return;
    toastInfo = info;
    toastName.textContent = info.title;
    toastSub.textContent = info.sub;
    if (toastOpen) return;
    toastOpen = true;
    if (toastCloseTimer) { clearTimeout(toastCloseTimer); toastCloseTimer = null; }
    toast.style.top = toastTop() + 'px';
    toast.classList.remove('closing');
    toast.hidden = false;
    void toast.offsetWidth; // start the enter transition from the hidden state
    toast.classList.add('open');
    toastLive.textContent = 'Incoming call from ' + info.title;
    logEvent('toast shown', info.key);
    focusAnswer(false);
  }
  function hideToast(reason) {
    if (!toastOpen) return;
    toastOpen = false;
    toast.classList.remove('open');
    toast.classList.add('closing');
    toastLive.textContent = '';
    logEvent('toast closed', reason);
    toastCloseTimer = setTimeout(function () {
      toastCloseTimer = null;
      toast.hidden = true;
      toast.classList.remove('closing');
    }, 150);
  }
  function startTitleFlash(label) {
    flashLabel = label;
    if (flashTimer) return;
    flashOn = true;
    document.title = 'Ringing \\u00b7 ' + flashLabel;
    flashTimer = setInterval(function () {
      flashOn = !flashOn;
      document.title = flashOn ? 'Ringing \\u00b7 ' + flashLabel : realTitle;
    }, 1000);
  }
  function stopTitleFlash() {
    if (!flashTimer) return;
    clearInterval(flashTimer);
    flashTimer = null;
    document.title = realTitle;
  }
  function closeNotification() {
    if (!notif) return;
    try { notif.close(); } catch (e) { /* already closed */ }
    notif = null;
    notifKey = '';
  }
  function showNotification() {
    if (notifyState() !== 'granted') return;
    var key = toastInfo.key + '|' + toastInfo.title;
    if (notif && notifKey === key) return;
    try {
      // Same tag (the call SID): replaces this call's earlier notification,
      // also one shown by another shell tab.
      var n = new Notification('Incoming call', {
        body: toastInfo.title + (toastInfo.sub ? '\\n' + toastInfo.sub : ''),
        tag: toastInfo.key,
        requireInteraction: true
      });
      n.onclick = function () {
        try { window.focus(); } catch (e) { /* focus refused */ }
        focusAnswer(true);
        closeNotification();
      };
      notif = n;
      notifKey = key;
    } catch (e) {
      logEvent('notification error', e && e.message);
    }
  }
  function isAway() {
    return !!document.hidden || !document.hasFocus();
  }
  function ringAttention() {
    if (!toastOpen) return;
    if (!isAway()) { stopTitleFlash(); return; }
    startTitleFlash(toastInfo.title);
    showNotification();
  }
  function stopAttention() {
    stopTitleFlash();
    closeNotification();
  }
  function toastFromSnapshot(snap) {
    if (snap.phase === CFG.phaseIncoming) {
      showToast(snap);
      ringAttention();
      return;
    }
    toastDismissedKey = '';
    hideToast('phase ' + snap.phase);
    stopAttention();
  }
  toastAnswer.addEventListener('click', function () {
    markUnlocked('answer');
    busRequest(CFG.requestAnswer);
    toastDismissedKey = toastInfo.key;
    hideToast('answer');
    stopAttention();
  });
  toastDecline.addEventListener('click', function () {
    busRequest(CFG.requestDecline);
    toastDismissedKey = toastInfo.key;
    hideToast('decline');
    stopAttention();
  });
  document.addEventListener('visibilitychange', ringAttention);
  window.addEventListener('blur', ringAttention);
  window.addEventListener('focus', ringAttention);

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
  document.getElementById('ctc-pm-disabled-exit').addEventListener('click', exitPhoneMode);

  // ---- Phone frame: one per browser (Web Lock) ----
  // lockState: 'none' (no Web Locks API, or not asked yet) | 'held' (this tab
  // runs the phone) | 'moving' (handed off; waiting for the other tab to
  // steal the lock) | 'waiting' (busy banner; a normal request is queued so
  // this tab takes over when the holder closes, crashes or is discarded) |
  // 'stealing' ("Use phone here" in progress) | 'disabled' (the phone is not
  // enabled for this user; lock released).
  // After the anchor reports 'moved' this shell keeps the lock until the
  // new tab steals it: releasing first would let this tab's own queued
  // request win the free lock. No steal within MOVE_FALLBACK_MS: the phone
  // starts here again.
  var lockState = 'none';
  var releaseLock = null;
  var waitAbort = null;
  var moveFallbackTimer = null;
  var MOVE_FALLBACK_MS = 10000;
  var TAKEOVER_WAIT_MS = 3000;
  var takeoverNonce = '';
  var takeoverTimer = null;

  function phoneUrl() {
    if (!DEBUG) return CFG.softphoneUrl;
    return CFG.softphoneUrl + (CFG.softphoneUrl.indexOf('?') === -1 ? '?' : '&') + 'debug=1';
  }
  function startPhone(reason) {
    if (!CFG.softphoneUrl) { logEvent('phone not started', 'no softphone URL'); return; }
    phoneStarted = true;
    phoneFrame.src = phoneUrl();
    logEvent('phone start', reason);
  }
  function stopPhone(reason) {
    phoneStarted = false;
    phoneFrame.src = 'about:blank';
    logEvent('phone stop', reason);
  }
  function gotLock(mode) {
    lockState = 'held';
    busy.hidden = true;
    endTakeover();
    startPhone(mode === 'first' ? 'lock held' : mode === 'steal' ? 'took the phone' : 'lock freed');
    // Keep the lock until this page goes away, the phone moves, or the
    // phone is not enabled for this user.
    return new Promise(function (resolve) { releaseLock = resolve; });
  }
  function becomeWaiting(reason) {
    lockState = 'waiting';
    busy.hidden = false;
    logEvent('phone busy', reason);
    requestLock('wait');
    if (wantTakeover) {
      wantTakeover = false;
      takeover();
    }
  }
  // mode: 'first' (ifAvailable) | 'wait' (queued) | 'steal'.
  function requestLock(mode) {
    var granted = false;
    var opts = mode === 'first' ? { ifAvailable: true } : mode === 'steal' ? { steal: true } : {};
    if (mode === 'wait' && typeof AbortController === 'function') {
      waitAbort = new AbortController();
      opts.signal = waitAbort.signal;
    }
    navigator.locks.request(CFG.lockName, opts, function (lock) {
      if (!lock) {
        becomeWaiting('another tab holds ' + CFG.lockName);
        return;
      }
      granted = true;
      if (mode === 'wait') waitAbort = null;
      return gotLock(mode);
    }).catch(function (e) {
      if (granted) { lockLost(e && e.name); return; }   // another tab stole it
      if (e && e.name === 'AbortError') return;          // our own cancel of a queued wait
      logEvent('lock error', e && e.message);
      if (mode === 'first') startPhone('lock error');
      else if (mode === 'steal' && lockState === 'stealing') becomeWaiting('steal failed');
    });
  }
  // Another tab took the phone (steal): stop ours and wait in turn.
  function lockLost(reason) {
    releaseLock = null;
    if (moveFallbackTimer) { clearTimeout(moveFallbackTimer); moveFallbackTimer = null; }
    if (lockState === 'disabled') return;
    logEvent('phone taken by another tab', reason);
    stopPhone('lock lost');
    setPhase(CFG.phaseMoved);
    becomeWaiting('lock lost');
  }
  // Our anchor handed the phone over (bus 'takeover' from a waiting tab).
  function phoneMoved() {
    if (lockState !== 'held') return;
    lockState = 'moving';
    stopPhone('moved to another tab');
    busy.hidden = false;
    moveFallbackTimer = setTimeout(function () {
      moveFallbackTimer = null;
      if (lockState !== 'moving') return;
      logEvent('takeover abandoned', 'no tab took the phone');
      lockState = 'held';
      busy.hidden = true;
      startPhone('takeover abandoned');
    }, MOVE_FALLBACK_MS);
  }
  // The RESTlet refuses tokens for this user: release the lock, stop the
  // phone, and say so calmly. Exit phone mode stays available.
  function phoneDisabled() {
    if (lockState === 'disabled') return;
    logEvent('phone not enabled', 'not_a_phone_user');
    if (waitAbort) { try { waitAbort.abort(); } catch (e) { /* done */ } waitAbort = null; }
    endTakeover();
    lockState = 'disabled';
    stopPhone('not enabled');
    if (releaseLock) { releaseLock(); releaseLock = null; }
    busy.hidden = true;
    disabledBanner.hidden = false;
  }
  // "Use phone here": ask the current anchor to let go, then steal the lock.
  function takeover() {
    if (lockState !== 'waiting' || takeoverNonce) return false;
    takeoverNonce = busRequest(CFG.requestTakeover);
    if (!takeoverNonce) { stealLock('no bus'); return true; }
    logEvent('takeover asked', takeoverNonce);
    takeoverTimer = setTimeout(function () { stealLock('no anchor reply'); }, TAKEOVER_WAIT_MS);
    return true;
  }
  function endTakeover() {
    if (takeoverTimer) clearTimeout(takeoverTimer);
    takeoverTimer = null;
    takeoverNonce = '';
  }
  function takeoverReply(snap) {
    if (!takeoverNonce) return;
    if (snap.phase === CFG.phaseMoved) { stealLock('anchor moved'); return; }
    var r = snap.refused;
    if (r && r.nonce === takeoverNonce) {
      logEvent('takeover refused', r.reason);
      endTakeover();
    }
  }
  function stealLock(reason) {
    endTakeover();
    if (lockState !== 'waiting') return;
    if (waitAbort) { try { waitAbort.abort(); } catch (e) { /* done */ } waitAbort = null; }
    lockState = 'stealing';
    logEvent('takeover', reason);
    requestLock('steal');
  }
  if (navigator.locks && typeof navigator.locks.request === 'function') {
    requestLock('first');
  } else {
    logEvent('lock unavailable', 'no Web Locks API');
    startPhone('no lock');
  }
  document.getElementById('ctc-pm-busy-reload').addEventListener('click', function () {
    window.location.reload();
  });
  document.getElementById('ctc-pm-busy-take').addEventListener('click', function () {
    takeover();
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
