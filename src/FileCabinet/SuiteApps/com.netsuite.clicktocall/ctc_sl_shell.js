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
 * The shell also adds an unreadable-page banner, a call-aware leave guard and a
 * top.document.getElementById shim. Shell events go to the console.
 */
// eslint-disable-next-line suitescript/no-log-module
define(['N/url', 'N/log', 'N/file', './lib/ctc_html', './lib/ctc_entity', './lib/ctc_dock', './lib/ctc_config'],
    (url, log, file, ctcHtml, ctcEntity, ctcDock, ctcConfig) => {

    const escapeHtml = ctcHtml.escapeHtml;
    const safeJsonEmbed = ctcHtml.safeJsonEmbed;

    const DEFAULT_FRAME_PATH = '/app/center/card.nl?sc=-29';
    const MAX_FRAME_PATH = 2000;
    // This SuiteApp's own single page apps (Setup Wizard, Sales Central).
    // Other apps' SPAs stay out.
    const SPA_FRAME_PREFIX = ctcDock.SPA_PATH_PREFIX;

    /**
     * Validate the NetSuite path to open in the frame. Anything that could
     * leave the account origin or climb out of /app/ (or this SuiteApp's
     * SPAs) falls back to the default dashboard path.
     * Rules: string; 1..2000 chars; starts with "/app/" or SPA_FRAME_PREFIX;
     * no "//", no "\",
     * no whitespace or control chars; no scheme (":" before the first "/");
     * no "." or ".." path segments (also percent-encoded) before "?" / "#".
     * @param {*} value
     * @returns {string} a safe path, or DEFAULT_FRAME_PATH
     */
    const safeFramePath = (value) => {
        if (typeof value !== 'string') return DEFAULT_FRAME_PATH;
        if (value.length === 0 || value.length > MAX_FRAME_PATH) return DEFAULT_FRAME_PATH;
        if (value.indexOf('/app/') !== 0 && value.indexOf(SPA_FRAME_PREFIX) !== 0) return DEFAULT_FRAME_PATH;
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
        const opts = dockMountOptions(shellBase);
        return opts ? ctcDock.buildDockScriptTag(opts) : '';
    };

    /**
     * Dock mount options (file URLs, RESTlet, shell). Null when a dock file
     * or the RESTlet can't be resolved (logged, never thrown).
     * @param {string} shellBase - this Suitelet's own URL
     * @returns {Object|null}
     */
    const dockMountOptions = (shellBase) => {
        try {
            const restletUrl = url.resolveScript({
                scriptId: 'customscript_ctc_rl_token',
                deploymentId: 'customdeploy_ctc_rl_token',
                returnExternalUrl: false
            });
            return {
                assetUrl: file.load({ id: ctcDock.DOCK_ASSET_PATH }).url,
                dialerUrl: file.load({ id: ctcDock.DIALER_ASSET_PATH }).url,
                restletUrl: restletUrl,
                shellUrl: shellBase,
                context: {}
            };
        } catch (e) {
            log.error({ title: 'CTC Shell — Failed to load dock scripts', details: e.message || e });
            return null;
        }
    };

    /**
     * ?mount=1: the dock's mount data as JSON, for pages that add the dock
     * themselves (this SuiteApp's SPAs). Same files and attributes as the
     * record pages' script tags. {ok:false} when the dock can't load.
     * @param {Object} response
     */
    const writeDockMount = (response) => {
        const shellBase = resolveSuitelet('customscript_ctc_sl_shell', 'customdeploy_ctc_sl_shell');
        const opts = dockMountOptions(shellBase);
        ctcHtml.setNoStoreHeaders(response);
        try { response.setHeader({ name: 'Content-Type', value: 'application/json; charset=utf-8' }); } catch (e) { /* header unavailable */ }
        response.write(JSON.stringify(opts ? Object.assign({ ok: true }, ctcDock.buildDockMount(opts)) : { ok: false }));
    };

    /**
     * GET handler — renders the phone mode shell page.
     * @param {Object} context
     * @param {Object} context.request
     * @param {Object} context.response
     */
    const onRequest = (context) => {
        const params = (context.request && context.request.parameters) || {};
        if (params.mount === '1') { writeDockMount(context.response); return; }
        const framePath = safeFramePath(params.u);
        // ifrmcntnr=T: NetSuite's flag for a Suitelet shown in an iframe
        // (SAFE pitfall 103).
        const softphoneUrl = resolveSuitelet('customscript_ctc_sl_softphone', 'customdeploy_ctc_sl_softphone', { entryPoint: 'dashboard', ifrmcntnr: 'T' });
        const shellBase = resolveSuitelet('customscript_ctc_sl_shell', 'customdeploy_ctc_sl_shell');
        ctcHtml.setNoStoreHeaders(context.response);
        context.response.write(buildHtml({
            framePath,
            // Admin switch (config): phone tab, no NetSuite frame. Never throws.
            phoneTab: ctcConfig.readPhoneTabMode(),
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
     * @param {boolean} [o.phoneTab] - admin switch: no NetSuite frame (phone tab)
     * @returns {string}
     */
    const buildHtml = (o) => {
        const cfg = {
            framePath: o.framePath,
            shellBase: o.shellBase,
            spaPrefix: SPA_FRAME_PREFIX,
            softphoneUrl: o.softphoneUrl || '',
            lockName: ctcDock.PHONE_LOCK_NAME,
            exitKey: ctcDock.EXIT_KEY,
            openRecordType: ctcDock.OPEN_RECORD_MESSAGE,
            busChannel: ctcDock.BUS_CHANNEL,
            phaseIncoming: ctcDock.PHASE_INCOMING,
            phaseMoved: ctcDock.PHASE_MOVED,
            errorSignedOut: ctcDock.ERROR_SIGNED_OUT,
            requestOrigin: ctcDock.REQUEST_ORIGIN,
            requestUnlock: ctcDock.REQUEST_UNLOCK_AUDIO,
            phoneDisabledType: ctcDock.PHONE_DISABLED_MESSAGE,
            phoneDuplicateType: ctcDock.PHONE_DUPLICATE_MESSAGE,
            shellStateType: ctcDock.SHELL_STATE_MESSAGE,
            unlockAudioType: ctcDock.UNLOCK_AUDIO_MESSAGE,
            sessionCheckType: ctcDock.SESSION_CHECK_MESSAGE,
            phoneTab: o.phoneTab === true
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
  #ctc-pm-unsupported-exit { background: none; border: 0; color: #1B6097; font-size: 13px; padding: 0 8px; height: 32px; border-radius: 6px; flex: none; }
  /* Phone tab: the shell without the NetSuite frame (browser gate, admin switch). */
  body.ctc-phone-tab { background: #F4F2EF; overflow: auto; }
  #ctc-pt { box-sizing: border-box; min-height: 100%; display: flex; align-items: center; justify-content: center; padding: 96px 16px 32px; }
  .ctc-pt-card { box-sizing: border-box; width: 100%; max-width: 480px; padding: 24px; background: #FFFFFF; border-radius: 12px;
    box-shadow: 0 0 0 1px rgba(22,21,19,0.08), 0 8px 24px rgba(22,21,19,0.06); }
  .ctc-pt-card h1 { margin: 0 0 8px; font-size: 18px; font-weight: 600; color: #161513; }
  .ctc-pt-card p { margin: 0 0 12px; font-size: 14px; line-height: 1.5; color: #5F5B55; }
  #ctc-pt-why { font-size: 13px; color: #8A5300; }
  #ctc-pt-open { margin-top: 4px; background: #345D7E; color: #FFFFFF; border: 0; height: 36px; padding: 0 16px; border-radius: 6px; font-size: 14px; font-weight: 600; }

</style>
</head>
<body>
${o.phoneTab ? '' : '<iframe id="ctc-ns-frame" title="NetSuite" src="' + escapeHtml(o.framePath) + '"></iframe>'}
<main id="ctc-pt" hidden>
  <div class="ctc-pt-card">
    <h1>This tab is your phone</h1>
    <p>Keep this tab open to make and take calls. Work in NetSuite in other tabs. The phone button on those pages controls this phone.</p>
    <p id="ctc-pt-why" hidden></p>
    <button type="button" id="ctc-pt-open">Open NetSuite in a new tab</button>
  </div>
</main>
<iframe id="ctc-phone-frame" class="ctc-off" title="Softphone" name="${escapeHtml(o.phoneFrameName)}" allow="microphone; autoplay" src="about:blank"></iframe>

<div id="ctc-pm-banners">
  <div class="ctc-pm-banner" id="ctc-pm-banner" role="alert" hidden>
    <span class="dot" aria-hidden="true"></span>
    <div class="text">
      <div class="title" id="ctc-pm-banner-title">This page cannot show inside phone mode</div>
      <div class="sub" id="ctc-pm-banner-sub">Reload to go back. If you were signed out, sign in again.</div>
    </div>
    <button type="button" id="ctc-pm-reload">Reload page</button>
  </div>
  <div class="ctc-pm-banner" id="ctc-pm-busy" role="alert" hidden>
    <span class="dot" aria-hidden="true"></span>
    <div class="text">
      <div class="title">Your phone is open in another tab</div>
      <div class="sub">Use that tab for calls.</div>
    </div>
    <button type="button" id="ctc-pm-busy-reload">Reload</button>
  </div>
  <div class="ctc-pm-banner" id="ctc-pm-unsupported" role="alert" hidden>
    <span class="dot" aria-hidden="true"></span>
    <div class="text">
      <div class="title">This browser cannot run the NetSuite phone</div>
      <div class="sub" id="ctc-pm-unsupported-sub">Use a current version of Chrome, Edge, Firefox or Safari.</div>
    </div>
    <button type="button" id="ctc-pm-unsupported-exit">Exit phone mode</button>
  </div>
  <div class="ctc-pm-banner" id="ctc-pm-disabled" role="status" hidden>
    <span class="dot" aria-hidden="true"></span>
    <div class="text">
      <div class="title">The phone is not enabled for your user. Ask your administrator.</div>
    </div>
    <button type="button" id="ctc-pm-disabled-exit">Exit phone mode</button>
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
  // unlockAudio(): call it inside a click / key handler ("Turn on phone").
  // phoneState(): { lock, audioUnlocked, notify } for the dock.
  window.__ctcShell = {
    version: 1,
    context: null,
    call: function (ctx) {
      if (window.__ctcDock && typeof window.__ctcDock.call === 'function') window.__ctcDock.call(ctx || null);
    },
    exit: function () {},
    unlockAudio: function () { unlockAudio('dock'); },
    phoneState: function () { return { lock: lockState, audioUnlocked: audioUnlocked, notify: notifyState() }; }
  };
  var ACTIVE = { incoming: 1, dialing: 1, ringing: 1, answering: 1, connected: 1, reconnecting: 1 };
  var SEARCH = String(location.search || '');
  var DEBUG = /[?&]debug=1(&|$)/.test(SEARCH);

  var nsFrame = document.getElementById('ctc-ns-frame');
  var phoneFrame = document.getElementById('ctc-phone-frame');
  var banner = document.getElementById('ctc-pm-banner');
  var bannerTitle = document.getElementById('ctc-pm-banner-title');
  var bannerSub = document.getElementById('ctc-pm-banner-sub');

  var busy = document.getElementById('ctc-pm-busy');
  var disabledBanner = document.getElementById('ctc-pm-disabled');

  // ---- "Phone in another tab" banner: no-dock fallback only ----
  // The dock (shell mode, with its panel) is a remote control of the other
  // tab's phone while this shell waits. The banner shows only when there is
  // no dock (its scripts failed to load).
  var busyWanted = false;
  // The dock scripts load after this one (parser-blocking tags): until the
  // document is parsed, no banner, so it never flashes before the dock.
  var docParsed = document.readyState !== 'loading';
  function hasDock() {
    try {
      var d = window.__ctcDock;
      return !!(d && d.mode === 'shell' && typeof d.hasPanel === 'function' && d.hasPanel());
    } catch (e) { return false; }
  }
  function syncBusy() {
    busy.hidden = !busyWanted || !docParsed || hasDock();
  }
  function setBusy(on) {
    busyWanted = !!on;
    syncBusy();
  }
  function onParsed() {
    docParsed = true;
    syncBusy();
  }
  document.addEventListener('DOMContentLoaded', onParsed);
  window.addEventListener('load', onParsed);
  // Tell the dock the lock state changed (it reads phoneState()).
  function notifyDock() {
    try {
      var d = window.__ctcDock;
      if (d && typeof d.refresh === 'function') d.refresh();
    } catch (e) { logEvent('dock refresh error', e && e.message); }
  }

  // ---- Browser gate (support matrix: SPEC.md section 1) ----
  // Required for any phone: Web Locks (one phone per browser) and
  // BroadcastChannel (the ctc-bus). Missing → no phone, one clear banner.
  // Required for the NetSuite frame: the Navigation API (it keeps NetSuite
  // menu clicks inside the frame). Missing → phone tab: the shell without
  // the NetSuite frame; NetSuite runs in normal tabs (remote-control docks).
  var FEATURES = {
    locks: !!(navigator.locks && typeof navigator.locks.request === 'function'),
    bus: typeof BroadcastChannel === 'function',
    navigation: !!(window.navigation && typeof window.navigation.addEventListener === 'function')
  };
  var missingCore = [];
  if (!FEATURES.locks) missingCore.push('Web Locks');
  if (!FEATURES.bus) missingCore.push('BroadcastChannel');
  var unsupported = missingCore.length > 0;
  var phoneTab = CFG.phoneTab || !FEATURES.navigation || !nsFrame;
  var phoneTabWhy = CFG.phoneTab || !nsFrame ? 'admin' : (!FEATURES.navigation ? 'navigation api missing' : '');
  if (phoneTab) {
    if (nsFrame) {
      // Started loading NetSuite already; stop it and drop the frame.
      try { nsFrame.src = 'about:blank'; } catch (e) { /* ignore */ }
      nsFrame.hidden = true;
      nsFrame = null;
    }
    document.body.className = (document.body.className ? document.body.className + ' ' : '') + 'ctc-phone-tab';
    document.getElementById('ctc-pt').hidden = false;
    document.getElementById('ctc-pm-reload').hidden = true;
    if (phoneTabWhy === 'navigation api missing') {
      var why = document.getElementById('ctc-pt-why');
      why.textContent = 'This browser cannot keep NetSuite inside phone mode, so the phone has its own tab. Chrome and Edge can show NetSuite and the phone in one tab.';
      why.hidden = false;
    }
    document.getElementById('ctc-pt-open').addEventListener('click', function () {
      window.open(CFG.framePath, '_blank');
    });
    document.title = 'Phone \u2014 NetSuite';
  }
  window.__ctcShell.phoneTab = phoneTab;

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
      var doc = nsFrame ? nsFrame.contentDocument : null;
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

  // ---- Page title (flashes while a call rings and the rep is away) ----
  var realTitle = document.title;
  var flashTimer = null;
  var flashOn = false;
  var flashLabel = '';
  function setRealTitle(t) {
    realTitle = t;
    if (!flashTimer) document.title = t;
  }

  // ---- Session lost + the unreadable-page banner ----
  // bannerKind 'session': a login page, or the phone says signed_out. No
  // banner for a sign-out (asset 37, DESIGN.md §3): the pill, the panel's
  // Signed out card and NetSuite's own modal say it. The state still drives
  // the phone restart after the rep signs in (sessionBack).
  // 'unreadable': the frame shows a page of another origin (often the
  // sign-in host, or another NetSuite account): it may not be a sign-out.
  // Only this kind shows the banner.
  var bannerKind = 'session';
  function bannerText() {
    bannerTitle.textContent = 'This page cannot show inside phone mode';
    bannerSub.textContent = (ACTIVE[phase] ? 'Your call is still connected. ' : '') +
      'Reload to go back. If you were signed out, sign in again.';
  }
  // fromPhone: the phone reported 'signed_out' (else the NetSuite frame
  // landed on a login page). A sign-out from the phone ends by itself when
  // the phone recovers.
  var bannerFromPhone = false;
  function showBanner(fromPhone, kind) {
    if (!sessionLost || !fromPhone) bannerFromPhone = !!fromPhone;
    // A sign-out (phone or login page) is certain: it wins over an
    // unreadable frame, which never replaces a sign-out.
    if (kind !== 'unreadable' || fromPhone) bannerKind = 'session';
    else if (!sessionLost) bannerKind = 'unreadable';
    sessionLost = true;
    if (bannerKind !== 'unreadable') {
      if (!banner.hidden) {
        banner.hidden = true;
        logEvent('banner hidden', 'signed out');
      }
      return;
    }
    bannerText();
    if (banner.hidden) {
      banner.hidden = false;
      logEvent('banner shown', 'phase=' + phase);
    }
  }
  // Load the NetSuite frame again: the rep's page, or NetSuite's sign-in when
  // the session is gone. The banner's Reload page and the dock's Sign in
  // (__ctcShell.reloadFrame, client signIn) both use it: the last good page,
  // so a blanked frame (login page, unreadable page) comes back too.
  function reloadFrame(reason) {
    if (!nsFrame) return false;
    banner.hidden = true;
    logEvent('frame reload', reason + ': ' + lastGoodPath);
    nsFrame.src = lastGoodPath;
    return true;
  }
  window.__ctcShell.reloadFrame = function () { return reloadFrame('sign in'); };
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
  // The first normal page after a sign-out (or the unreadable banner) means
  // the rep signed in again: hide any banner and restart the phone. Sign in
  // and Reload page only reload the NetSuite frame; a login page there marks
  // the session lost again.
  // The phone's latest snapshot: error kind and canReceive. The phone
  // recovers by itself after a new sign-in (token retry), so a restart is
  // needed only when it has not (a restart is a few seconds with no ringing).
  // Before the first snapshot nothing is known: restart.
  var phoneSeen = false;
  var phoneErrKind = '';
  var phoneCanReceive = null;
  function phoneRecovered() {
    return phoneSeen && phoneErrKind !== 'session' && phoneErrKind !== CFG.errorSignedOut && phoneCanReceive !== false;
  }
  function sessionBack() {
    if (!sessionLost) return;
    sessionLost = false;
    banner.hidden = true;
    closeSignedOutNotice();
    if (phoneRecovered()) {
      logEvent('phone restart skipped', 'signed in again, phone already recovered');
      return;
    }
    restartPhone('signed in again');
  }
  document.getElementById('ctc-pm-reload').addEventListener('click', function () {
    reloadFrame('reload page');
  });

  // ---- Frame watcher ----
  // NetSuite pages and this SuiteApp's SPAs: both load inside the frame.
  function isFramePath(p) {
    p = String(p || '');
    return p.indexOf('/app/') === 0 || p.indexOf(CFG.spaPrefix) === 0;
  }
  function isLoginPath(p) {
    return p.indexOf('/pages/login') === 0 || p.indexOf('/pages/customerlogin') === 0 ||
      p.indexOf('/app/login') === 0 || p.indexOf('/login.nl') !== -1 || p.indexOf('enterpriselogin') !== -1;
  }
  function leftFrame(reason, kind) {
    // Oracle forbids showing the login page inside an iframe: blank it now.
    nsFrame.src = 'about:blank';
    logEvent('left-frame', reason);
    showBanner(false, kind);
    // Likely a sign-out: the phone checks its session now, so the pill and
    // the panel say "Signed out" in a second or two (no banner; asset 37).
    postToPhone({ v: 1, type: CFG.sessionCheckType });
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
  // The shell's own address carries the frame's page (u=), so a reload
  // returns to it.
  function mirrorFramePath(path) {
    if (!CFG.shellBase) return;
    var sep = CFG.shellBase.indexOf('?') === -1 ? '?' : '&';
    try { history.replaceState(null, '', CFG.shellBase + sep + 'u=' + encodeURIComponent(path) + (DEBUG ? '&debug=1' : '')); } catch (e) { /* ignore */ }
  }
  // An SPA in the frame (Sales Central) changes its hash with replaceState,
  // which fires no event: it calls this after each change (asset 52).
  // The frame's page, for the dock (an SPA page keeps the pill on the
  // bottom row, finding #99).
  window.__ctcShell.framePath = function () { return lastGoodPath; };
  window.__ctcShell.syncFramePath = function () {
    var path = currentFramePath();
    if (!isFramePath(path) || path === lastGoodPath) return;
    lastGoodPath = path;
    mirrorFramePath(path);
  };
  if (nsFrame) nsFrame.addEventListener('load', function () {
    var loc, path, title, win;
    try {
      win = nsFrame.contentWindow;
      loc = win.location;
      if (loc.protocol === 'about:') return; // our own blanking
      path = loc.pathname + loc.search + loc.hash;
      title = nsFrame.contentDocument ? nsFrame.contentDocument.title : '';
    } catch (e) {
      leftFrame('cross-origin: ' + (e && e.name ? e.name : 'unreadable'), 'unreadable');
      return;
    }
    if (isLoginPath(loc.pathname)) {
      leftFrame('login page: ' + loc.pathname);
      return;
    }
    lastGoodPath = path;
    sessionBack();
    mirrorFramePath(path);
    if (title) setRealTitle(title);
    logEvent('frame load', path);
    notifyDock();
    syncContext(win);
    watchFrameWindow(win);
    followFrame(win);
    try {
      win.addEventListener('error', function (ev) {
        logEvent('frame error', (ev && ev.message ? ev.message : 'error') + ' @ ' + tail(ev && ev.filename));
      });
    } catch (e) { /* frame window not accessible */ }
  });

  // ---- In-frame fixes (architecture review H4) ----
  // External links: a link in NetSuite to another site would load that
  // site in the frame (unreadable → banner, the rep's place lost). The
  // frame's own Navigation API sees the destination first: cancel it and
  // open the site in a new tab. Left alone: same origin, NetSuite hosts
  // (sign-in, other accounts: the banner handles them), form posts,
  // downloads, hash changes, traversals.
  // Print: Ctrl / Cmd+P prints the top document (the shell), not the page
  // in the frame. Catch the key in the shell and in the frame and print
  // the frame instead. (The browser menu's Print still prints the shell.)
  function isNetSuiteHost(host) {
    return /(^|[.])netsuite[.]com$/i.test(String(host || ''));
  }
  function printFrame() {
    if (!nsFrame) return false;
    try {
      nsFrame.contentWindow.focus();
      nsFrame.contentWindow.print();
      logEvent('print', 'NetSuite frame');
      return true;
    } catch (e) {
      logEvent('print error', e && e.message);
      return false;
    }
  }
  function onPrintKey(ev) {
    if (!ev || !(ev.ctrlKey || ev.metaKey) || ev.altKey || ev.shiftKey) return;
    if (String(ev.key || '').toLowerCase() !== 'p') return;
    if (printFrame() && typeof ev.preventDefault === 'function') ev.preventDefault();
  }
  window.__ctcShell.print = printFrame;
  if (nsFrame) document.addEventListener('keydown', onPrintKey, true);
  function watchFrameWindow(win) {
    try { win.addEventListener('keydown', onPrintKey, true); } catch (e) { /* frame window not accessible */ }
    try {
      if (!win.navigation || typeof win.navigation.addEventListener !== 'function') return;
      win.navigation.addEventListener('navigate', function (e) {
        if (!e.cancelable || e.hashChange || e.downloadRequest || e.formData) return;
        if (e.navigationType !== 'push' && e.navigationType !== 'replace') return;
        var dest;
        try { dest = new URL(e.destination.url); } catch (err) { return; }
        if (dest.origin === location.origin) return;
        if (dest.protocol !== 'https:' && dest.protocol !== 'http:') return;
        if (isNetSuiteHost(dest.hostname)) return;
        e.preventDefault();
        logEvent('external link', dest.origin);
        window.open(dest.href, '_blank', 'noopener');
      });
    } catch (e) { /* frame navigation not accessible */ }
  }

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
  // An SPA in the frame changes record without a page load: its dock
  // (frame mode, setContext) asks for a fresh read. Only the NetSuite
  // frame's own window counts.
  window.__ctcShell.syncContext = function (win) {
    var current = null;
    try { current = nsFrame && nsFrame.contentWindow; } catch (e) { current = null; }
    if (!current || win !== current) return;
    logEvent('context', 'spa');
    syncContext(current);
  };

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
  if (nsFrame && FEATURES.navigation) {
    window.navigation.addEventListener('navigate', function (e) {
      if (allowTopNav || !e.cancelable || e.hashChange || e.downloadRequest) return;
      if (e.navigationType !== 'push' && e.navigationType !== 'replace') return;
      // A top-level form post: loading its URL in the frame would turn the
      // POST into a GET and drop the form data. Let it go (the tab leaves
      // phone mode; the leave guard asks first during a call).
      if (e.formData) { logEvent('top post left alone', tail(e.destination && e.destination.url)); return; }
      var dest;
      try { dest = new URL(e.destination.url); } catch (err) { return; }
      if (dest.origin !== location.origin || !isFramePath(dest.pathname)) return;
      if (isLoginPath(dest.pathname)) return;
      if (shellScriptId && dest.searchParams.get('script') === shellScriptId) return;
      if (dest.pathname === location.pathname && dest.search === location.search) return; // our own replaceState
      e.preventDefault();
      var path = dest.pathname + dest.search + dest.hash;
      logEvent('kept in frame', path);
      nsFrame.src = path;
    });
  } else if (phoneTab) {
    logEvent('phone tab', phoneTabWhy);
  }

  // ---- Messages from the phone frame ----
  // Accepted only from #ctc-phone-frame, same origin.
  //   OPEN_RECORD_MESSAGE: screen-pop after Answer on a matched caller; only
  //     an entity record path with a numeric id.
  //   PHONE_DISABLED_MESSAGE: the RESTlet refuses tokens for this user.
  //   PHONE_DUPLICATE_MESSAGE: another phone in this browser won (one anchor).
  var RECORD_PATH = /^[/]app[/]common[/]entity[/](custjob|contact)[.]nl[?]id=[0-9]+$/;
  window.addEventListener('message', function (ev) {
    var m = ev && ev.data;
    if (!m || m.v !== 1) return;
    if (m.type !== CFG.openRecordType && m.type !== CFG.phoneDisabledType && m.type !== CFG.phoneDuplicateType) return;
    if (ev.origin !== location.origin || ev.source !== phoneFrame.contentWindow) return;
    if (m.type === CFG.phoneDisabledType) { phoneDisabled(); return; }
    if (m.type === CFG.phoneDuplicateType) { phoneDuplicate(); return; }
    if (typeof m.path !== 'string' || !RECORD_PATH.test(m.path)) {
      logEvent('screen-pop refused', tail(m.path));
      return;
    }
    if (!nsFrame) { logEvent('screen-pop skipped', 'phone tab'); return; }
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
  // phase: this shell's OWN phone (its #ctc-phone-frame). Another tab's call
  // never turns on the leave guard here: leaving this tab does not end it.
  function setPhase(next) {
    next = String(next || 'offline');
    if (next === phase) return;
    logEvent('bus phase', phase + ' -> ' + next);
    phase = next;
    setGuard(!!ACTIVE[phase]);
    if (!banner.hidden) bannerText();
    // The lock went to another tab during our call: the call ended, so the
    // phone stops now (lockLost kept it for the call).
    if (lockState === 'yielding' && !ACTIVE[phase]) finishYield();
  }

  // ---- Bus ----
  // The shell sends no requests; it reads snapshots (its own phone's phase,
  // the bus probe, ringing, session) and takes 'unlockAudio' from its dock.
  var bus = null;
  function workingAnchor(snap) {
    return typeof snap.anchorId === 'string' && snap.anchorId !== '' && snap.phase !== 'offline' && snap.phase !== CFG.phaseMoved;
  }
  // The anchor in our own phone frame publishes its id there (same origin).
  function ownAnchorId() {
    if (!phoneStarted) return '';
    try {
      var w = phoneFrame.contentWindow;
      var id = w && w.__ctcAnchorId;
      return typeof id === 'string' ? id : '';
    } catch (e) { return ''; }
  }
  // A snapshot from this shell's own phone. Its id unknown (the frame not
  // started yet): every snapshot counts as ours while the phone runs.
  function ownSnapshot(snap) {
    if (!phoneStarted) return false;
    var id = ownAnchorId();
    return !id || snap.anchorId === id;
  }
  function onSnapshot(snap) {
    if (probing && workingAnchor(snap)) probeSeen = true;
    if (follow && !ownSnapshot(snap) && workingAnchor(snap)) followHeard(snap);
    if (ownSnapshot(snap)) setPhase(snap.phase);
    ringFromSnapshot(snap);
    sessionFromSnapshot(snap);
  }

  // ---- Signed out (phone error kind signed_out) ----
  // The phone found the NetSuite session gone: mark the session lost (no
  // banner) and, when the tab is hidden at that moment, one system
  // notification. It closes when the phone recovers (the rep signed in, in
  // any tab).
  var signedOutNotif = null;
  function closeSignedOutNotice() {
    if (!signedOutNotif) return;
    try { signedOutNotif.close(); } catch (e) { /* already closed */ }
    signedOutNotif = null;
  }
  function showSignedOutNotice() {
    if (signedOutNotif || notifyState() !== 'granted') return;
    try {
      var n = new Notification('Signed out of NetSuite', {
        body: 'Sign in again to keep receiving calls.',
        tag: 'ctc-signed-out',
        requireInteraction: true
      });
      n.onclick = function () {
        try { window.focus(); } catch (e) { /* focus refused */ }
        closeSignedOutNotice();
      };
      signedOutNotif = n;
    } catch (e) {
      logEvent('notification error', e && e.message);
    }
  }
  function sessionFromSnapshot(snap) {
    phoneSeen = true;
    phoneErrKind = (snap.error && snap.error.kind) || '';
    phoneCanReceive = snap.canReceive;
    if (phoneErrKind === CFG.errorSignedOut) {
      if (!sessionLost) logEvent('phone signed out', '');
      showBanner(true);
      if (document.hidden) showSignedOutNotice();
      return;
    }
    closeSignedOutNotice();
    if (sessionLost && bannerFromPhone && phoneRecovered()) {
      sessionLost = false;
      bannerFromPhone = false;
      banner.hidden = true;
      logEvent('session back', 'phone signed in again');
    }
  }
  if (typeof BroadcastChannel === 'function') {
    bus = new BroadcastChannel(CFG.busChannel);
    bus.onmessage = function (ev) {
      var m = ev && ev.data;
      if (!m || m.v !== 1) return;
      if (m.type === 'snapshot' && m.snap) {
        onSnapshot(m.snap);
      } else if (m.type === 'hello') {
        // A holder shell answers for its phone (alive even while it starts).
        if (lockState === 'held') bus.postMessage({ v: 1, type: HOLDER_TYPE, phase: phase });
      } else if (m.type === HOLDER_TYPE) {
        followHeard(null);
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

  // ---- Inbound ring: attention when the rep is away ----
  // The dock draws the incoming card (Answer / Decline) at its pill and
  // makes the one assertive announcement. The shell adds what the dock
  // cannot: when the tab is hidden or the window unfocused, a system
  // notification (when allowed) and a flashing title, until the phase
  // leaves 'incoming'. Coming back stops the flash. A notification click
  // focuses the window and the card's Answer (window.__ctcDock.focusIncoming).
  var ringing = false;
  var ringInfo = { title: '', sub: '', key: '' };
  var notif = null;
  var notifKey = '';

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
  function focusIncoming() {
    try {
      var dock = window.__ctcDock;
      if (dock && typeof dock.focusIncoming === 'function') dock.focusIncoming();
    } catch (e) { logEvent('dock focus error', e && e.message); }
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
    var key = ringInfo.key + '|' + ringInfo.title;
    if (notif && notifKey === key) return;
    try {
      // Same tag (the call SID): replaces this call's earlier notification,
      // also one shown by another shell tab.
      var n = new Notification('Incoming call', {
        body: ringInfo.title + (ringInfo.sub ? '\\n' + ringInfo.sub : ''),
        tag: ringInfo.key,
        requireInteraction: true
      });
      n.onclick = function () {
        try { window.focus(); } catch (e) { /* focus refused */ }
        focusIncoming();
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
    if (!ringing) return;
    if (!isAway()) { stopTitleFlash(); return; }
    startTitleFlash(ringInfo.title);
    showNotification();
  }
  function stopAttention() {
    stopTitleFlash();
    closeNotification();
  }
  function ringFromSnapshot(snap) {
    if (snap.phase === CFG.phaseIncoming) {
      var info = callerInfo(snap);
      if (!ringing) logEvent('ringing', info.key);
      ringing = true;
      ringInfo = info;
      ringAttention();
      return;
    }
    ringing = false;
    stopAttention();
  }
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
  // runs the phone) | 'waiting' (the dock is a remote control, or the busy
  // banner without a dock; a normal request is queued so this tab takes
  // over when the holder closes, crashes or is discarded) | 'yielding'
  // (another page stole the lock during our live call: the phone keeps the
  // call and stops when it ends) | 'disabled' (the phone is not enabled for
  // this user; lock released). The phone follows the tab you use (asset 51,
  // see "The phone follows you"): a waiting shell steals the lock on a click
  // when the phone tab is idle, or when the phone tab stops answering.
  var lockState = 'none';
  var releaseLock = null;
  var waitAbort = null;

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
  function setLock(next) {
    if (next === lockState) return;
    lockState = next;
    notifyDock();
  }
  function gotLock(mode) {
    setLock('held');
    setBusy(false);
    startPhone(mode === 'first' ? 'lock held' : mode === 'steal' ? 'moved here' : 'lock freed');
    // Keep the lock until this page goes away, its phone loses to another
    // phone (duplicate anchor), or the phone is not enabled for this user.
    return new Promise(function (resolve) { releaseLock = resolve; });
  }
  function becomeWaiting(reason) {
    setLock('waiting');
    setBusy(true);
    logEvent('phone busy', reason);
    requestLock('wait');
    // Is the phone tab alive? (A frozen tab keeps the lock and never rings.)
    followCheck(false);
  }
  // mode: 'first' (ifAvailable) | 'wait' (queued).
  function requestLock(mode) {
    var granted = false;
    var opts = mode === 'first' ? { ifAvailable: true } : {};
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
      if (granted) { lockLost(e && e.name); return; }   // another page stole it
      if (e && e.name === 'AbortError') return;          // our own cancel of a queued wait
      logEvent('lock error', e && e.message);
      if (mode === 'first') { lockBroken = true; probeThenStart('lock error'); }
    });
  }
  // Another page stole the lock (this shell never steals; an older shell
  // still open may): stop ours and wait in turn. Never during our own live
  // call (1.11): only the anchor ends its call. The phone keeps it; the
  // anchor sees the other phone and steps aside after the call (one
  // anchor), or finishYield stops it when the call ends.
  function lockLost(reason) {
    releaseLock = null;
    if (lockState === 'disabled') return;
    if (phoneStarted && ACTIVE[phase]) {
      logEvent('phone taken by another tab during a call', (reason || '') + '; the call goes on here');
      setLock('yielding');
      return;
    }
    logEvent('phone taken by another tab', reason);
    stopPhone('lock lost');
    setPhase('offline');
    becomeWaiting('lock lost');
  }
  function finishYield() {
    logEvent('phone stopped', 'call ended after the lock went to another tab');
    stopPhone('lock lost, call ended');
    becomeWaiting('lock lost');
    setPhase('offline');
  }
  // ---- The phone follows you (asset 51, finding #95) ----
  // A waiting shell (another tab runs the phone) takes the phone:
  //   - on a click or key in this tab (the shell, its dock or its NetSuite
  //     frame), when the phone tab is idle: no call or ring, no voicemail
  //     check, no summary on its way (otherBusy);
  //   - when this tab is visible and nothing answers the bus within
  //     FOLLOW_WAIT_MS (the phone tab is frozen, stalled or gone), click or
  //     not: checked when this tab starts waiting, comes into view, and
  //     every FOLLOW_CHECK_MS while visible.
  // A holder shell answers 'hello' itself ('holder'), so a phone that is
  // still starting in the tab that just took it counts as alive (no steal
  // back). Taking = a Web Locks steal: the old tab's lockLost stops its
  // phone, or keeps a live call until it ends. Reverses the 2026-11-13
  // "nothing steals the lock" decision (user, 2026-11-25: seamless).
  var FOLLOW_WAIT_MS = 2000;
  var FOLLOW_CHECK_MS = 15000;
  var FOLLOW_GAP_MS = 3000;
  var VM_BUSY_MS = 300000;
  var SUMMARY_BUSY_MS = 240000;
  var HOLDER_TYPE = 'ctc-phone-holder';
  var follow = null;
  var lastClickCheckAt = 0;
  function recent(since, ms) { return typeof since === 'number' && Date.now() - since < ms; }
  function otherBusy(snap) {
    if (!snap) return false;
    if (ACTIVE[snap.phase]) return true;
    var v = snap.voicemail;
    if (v && (v.state === 'checking' || v.state === 'leaving') && recent(v.since, VM_BUSY_MS)) return true;
    if (v && v.summary && (v.summary.stage === 'logged' || v.summary.stage === 'transcribing') && recent(v.since, VM_BUSY_MS)) return true;
    var t = snap.lastLog && snap.lastLog.transcript;
    return !!(t && (t.stage === 'logged' || t.stage === 'transcribing') && recent(t.since, SUMMARY_BUSY_MS));
  }
  function canFollow() {
    return lockState === 'waiting' && !lockBroken && !!bus && !!navigator.locks &&
      typeof navigator.locks.request === 'function' && !document.hidden;
  }
  function followCheck(byUser) {
    if (!canFollow()) return;
    if (follow) { if (byUser) follow.byUser = true; return; }
    // Clicks while the phone tab is busy: ask at most every FOLLOW_GAP_MS.
    if (byUser) {
      if (Date.now() - lastClickCheckAt < FOLLOW_GAP_MS) return;
      lastClickCheckAt = Date.now();
    }
    follow = { byUser: !!byUser, alive: false, snap: null, timer: null };
    bus.postMessage({ v: 1, type: 'hello' });
    follow.timer = setTimeout(function () { followDecide('timeout'); }, FOLLOW_WAIT_MS);
  }
  // Each answer while a check runs: an anchor snapshot (full state) decides
  // at once; a holder shell's answer only says "alive".
  function followHeard(snap) {
    if (!follow) return;
    follow.alive = true;
    if (snap) { follow.snap = snap; followDecide('answer'); }
  }
  function followDecide(why) {
    var f = follow;
    if (!f) return;
    follow = null;
    clearTimeout(f.timer);
    if (!canFollow()) return;
    if (!f.alive) { takePhone('the phone tab did not answer'); return; }
    if (f.byUser && !otherBusy(f.snap)) takePhone('followed a click in this tab (' + why + ')');
  }
  function takePhone(reason) {
    logEvent('phone moved here', reason);
    if (waitAbort) { try { waitAbort.abort(); } catch (e) { /* done */ } waitAbort = null; }
    var granted = false;
    navigator.locks.request(CFG.lockName, { steal: true }, function () {
      granted = true;
      return gotLock('steal');
    }).catch(function (e) {
      if (granted) { lockLost(e && e.name); return; }
      logEvent('lock error', e && e.message);
      requestLock('wait');
    });
  }
  function onFollowGesture() { followCheck(true); }
  // A NetSuite page in the frame: its clicks and keys count too.
  function followFrame(win) {
    try {
      var d = win && win.document;
      if (!d || typeof d.addEventListener !== 'function') return;
      d.addEventListener('pointerdown', onFollowGesture, true);
      d.addEventListener('keydown', onFollowGesture, true);
    } catch (e) { /* frame not readable */ }
  }
  document.addEventListener('pointerdown', onFollowGesture, true);
  document.addEventListener('keydown', onFollowGesture, true);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) followCheck(false); });
  setInterval(function () { followCheck(false); }, FOLLOW_CHECK_MS);

  // ---- No usable lock: ask the bus first ----
  // The lock request failed: start the phone only when no other phone
  // answers a 'hello' within PROBE_MS. Else wait with the busy banner (the
  // dock is a remote control of that phone). The anchors' own check (one
  // anchor, bus contract) is the backstop.
  var PROBE_MS = 1500;
  var probing = false;
  var probeSeen = false;
  var lockBroken = false;
  function probeThenStart(reason) {
    if (!bus) { startPhone(reason); return; }
    probing = true;
    probeSeen = false;
    bus.postMessage({ v: 1, type: 'hello' });
    setTimeout(function () {
      probing = false;
      if (!probeSeen) { startPhone(reason + ', no other phone'); return; }
      setLock('waiting');
      setBusy(true);
      logEvent('phone busy', 'another phone answered the bus');
    }, PROBE_MS);
  }
  // Our anchor lost to another phone in this browser (one anchor): stop it
  // and wait like a second tab.
  function phoneDuplicate() {
    if (!phoneStarted) return;
    logEvent('phone stopped', 'another phone is open in this browser');
    stopPhone('duplicate anchor');
    if (releaseLock) { releaseLock(); releaseLock = null; }
    if (lockBroken || !navigator.locks || typeof navigator.locks.request !== 'function') {
      setLock('waiting');
      setBusy(true);
      return;
    }
    becomeWaiting('duplicate anchor');
  }
  // The RESTlet refuses tokens for this user: release the lock, stop the
  // phone, and say so calmly. Exit phone mode stays available.
  function phoneDisabled() {
    if (lockState === 'disabled') return;
    logEvent('phone not enabled', 'not_a_phone_user');
    if (waitAbort) { try { waitAbort.abort(); } catch (e) { /* done */ } waitAbort = null; }
    stopPhone('not enabled');
    setLock('disabled');
    if (releaseLock) { releaseLock(); releaseLock = null; }
    setBusy(false);
    disabledBanner.hidden = false;
  }
  if (unsupported) {
    // No phone at all: without Web Locks two tabs could both run one; without
    // BroadcastChannel no dock can reach the phone.
    logEvent('browser unsupported', missingCore.join(', '));
    document.getElementById('ctc-pm-unsupported-sub').textContent =
      'It lacks ' + missingCore.join(' and ') + '. Use a current version of Chrome, Edge, Firefox or Safari.';
    document.getElementById('ctc-pm-unsupported').hidden = false;
  } else {
    requestLock('first');
  }
  document.getElementById('ctc-pm-unsupported-exit').addEventListener('click', exitPhoneMode);
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
