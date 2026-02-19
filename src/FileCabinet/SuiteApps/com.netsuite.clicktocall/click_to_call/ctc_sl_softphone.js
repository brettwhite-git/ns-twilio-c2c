/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * Serves the softphone popup UI for browser-to-PSTN calling via Twilio Voice SDK.
 * Receives phone, entityId, entityName as URL parameters.
 */
// eslint-disable-next-line suitescript/no-log-module
define(['N/url', 'N/runtime', 'N/log'], (url, runtime, log) => {

    const TWILIO_SDK_URL = 'https://sdk.twilio.com/js/client/releases/2.7.3/twilio.min.js';

    /**
     * GET handler — renders the softphone HTML page.
     * @param {Object} context
     * @param {Object} context.request
     * @param {Object} context.response
     */
    const onRequest = (context) => {
        const params = context.request.parameters;
        const phone = params.phone || '';
        const entityId = params.entityId || '';
        const entityName = params.entityName || '';

        let tokenEndpoint = '';
        try {
            tokenEndpoint = url.resolveScript({
                scriptId: 'customscript_ctc_rl_token',
                deploymentId: 'customdeploy_ctc_rl_token',
                returnExternalUrl: true
            });
        } catch (e) {
            log.error({ title: 'CTC Softphone — Failed to resolve RESTlet URL', details: e.message || e });
        }

        const html = buildHtml({ phone, entityId, entityName, tokenEndpoint });
        context.response.write(html);
    };

    /**
     * Build the self-contained HTML page for the softphone popup.
     * @param {Object} opts
     * @param {string} opts.phone
     * @param {string} opts.entityId
     * @param {string} opts.entityName
     * @param {string} opts.tokenEndpoint
     * @returns {string} Full HTML document
     */
    const buildHtml = (opts) => {
        const safePhone = escapeHtml(opts.phone);
        const safeEntityName = escapeHtml(opts.entityName);
        const safeEntityId = escapeHtml(opts.entityId);
        // JS context values — safe for embedding in JS string literals inside <script>
        const jsPhone = escapeJs(opts.phone);
        const jsEntityId = escapeJs(opts.entityId);
        const jsTokenEndpoint = escapeJs(opts.tokenEndpoint);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Click-to-Call — ${safeEntityName}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: #1a1a2e;
            color: #e0e0e0;
            width: 380px;
            height: 500px;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 24px 20px;
            overflow: hidden;
        }
        .header { text-align: center; margin-bottom: 24px; }
        .entity-name {
            font-size: 18px;
            font-weight: 600;
            color: #ffffff;
            margin-bottom: 4px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 340px;
        }
        .phone-number {
            font-size: 14px;
            color: #8888aa;
            font-family: "SF Mono", "Fira Code", monospace;
        }
        .status {
            font-size: 14px;
            color: #8888aa;
            margin-bottom: 16px;
            min-height: 20px;
            text-align: center;
        }
        .status.error { color: #ff6b6b; }
        .timer {
            font-size: 48px;
            font-weight: 300;
            font-family: "SF Mono", "Fira Code", monospace;
            color: #ffffff;
            margin-bottom: 32px;
            letter-spacing: 2px;
        }
        .controls { display: flex; gap: 16px; margin-bottom: 24px; }
        .btn {
            width: 72px;
            height: 72px;
            border-radius: 50%;
            border: none;
            cursor: pointer;
            font-size: 13px;
            font-weight: 600;
            color: #ffffff;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: opacity 0.15s, transform 0.1s;
        }
        .btn:hover:not(:disabled) { opacity: 0.85; transform: scale(1.05); }
        .btn:disabled { opacity: 0.3; cursor: not-allowed; transform: none; }
        .btn-call { background: #2ecc71; }
        .btn-mute { background: #e67e22; }
        .btn-mute.active { background: #d35400; }
        .btn-hangup { background: #e74c3c; }
        .error-box {
            font-size: 12px;
            color: #ff6b6b;
            background: rgba(255, 107, 107, 0.1);
            border: 1px solid rgba(255, 107, 107, 0.3);
            border-radius: 8px;
            padding: 8px 12px;
            max-width: 340px;
            text-align: center;
            word-break: break-word;
            display: none;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="entity-name" id="entityName">${safeEntityName}</div>
        <div class="phone-number" id="phoneNumber">${safePhone}</div>
    </div>
    <div class="status" id="status">Initializing&hellip;</div>
    <div class="timer" id="timer">00:00</div>
    <div class="controls">
        <button class="btn btn-call" id="btnCall" disabled>Call</button>
        <button class="btn btn-mute" id="btnMute" disabled>Mute</button>
        <button class="btn btn-hangup" id="btnHangup" disabled>End</button>
    </div>
    <div class="error-box" id="errorBox"></div>

    <script src="${TWILIO_SDK_URL}"></script>
    <script>
    (function () {
        'use strict';

        var TOKEN_URL = '${jsTokenEndpoint}';
        var PHONE = '${jsPhone}';
        var ENTITY_ID = '${jsEntityId}';

        var statusEl = document.getElementById('status');
        var timerEl = document.getElementById('timer');
        var btnCall = document.getElementById('btnCall');
        var btnMute = document.getElementById('btnMute');
        var btnHangup = document.getElementById('btnHangup');
        var errorBox = document.getElementById('errorBox');

        var device = null;
        var activeCall = null;
        var timerInterval = null;
        var callStartTime = null;

        // --- UI helpers ---
        function setStatus(text, isError) {
            statusEl.textContent = text;
            statusEl.className = isError ? 'status error' : 'status';
        }

        function showError(msg) {
            errorBox.textContent = msg;
            errorBox.style.display = 'block';
            console.error('[CTC] ' + msg);
        }

        function clearError() {
            errorBox.style.display = 'none';
            errorBox.textContent = '';
        }

        function setButtons(callEnabled, muteEnabled, hangupEnabled) {
            btnCall.disabled = !callEnabled;
            btnMute.disabled = !muteEnabled;
            btnHangup.disabled = !hangupEnabled;
        }

        function resetTimer() {
            if (timerInterval) clearInterval(timerInterval);
            timerInterval = null;
            callStartTime = null;
            timerEl.textContent = '00:00';
        }

        function startTimer() {
            callStartTime = Date.now();
            timerInterval = setInterval(function () {
                var elapsed = Math.floor((Date.now() - callStartTime) / 1000);
                var mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
                var secs = String(elapsed % 60).padStart(2, '0');
                timerEl.textContent = mins + ':' + secs;
            }, 1000);
        }

        // --- Token fetch ---
        function fetchToken() {
            setStatus('Fetching token\\u2026');
            return fetch(TOKEN_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            })
            .then(function (res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            })
            .then(function (data) {
                if (data.error) throw new Error(data.error);
                return data.token;
            });
        }

        // --- Twilio Device setup ---
        function initDevice(token) {
            device = new Twilio.Device(token, {
                codecPreferences: [Twilio.Device.Codec.Opus, Twilio.Device.Codec.PCMU],
                logLevel: 1
            });

            device.on('registered', function () {
                console.log('[CTC] Device registered');
                setStatus('Ready to call');
                setButtons(true, false, false);
            });

            device.on('error', function (err) {
                console.error('[CTC] Device error:', err.message);
                showError('Device error: ' + err.message);
                setStatus('Error', true);
                setButtons(true, false, false);
            });

            device.register();
        }

        // --- Call management ---
        function makeCall() {
            if (!device || activeCall) return;
            clearError();
            setStatus('Connecting\\u2026');
            setButtons(false, false, false);

            device.connect({ params: { To: PHONE } }).then(function (call) {
                activeCall = call;

                call.on('ringing', function () {
                    console.log('[CTC] Ringing');
                    setStatus('Ringing\\u2026');
                    setButtons(false, false, true);
                });

                call.on('accept', function () {
                    console.log('[CTC] Call accepted');
                    setStatus('Connected');
                    setButtons(false, true, true);
                    startTimer();
                });

                call.on('disconnect', function () {
                    console.log('[CTC] Call disconnected');
                    activeCall = null;
                    resetTimer();
                    setStatus('Call ended \\u2014 ready to redial');
                    setButtons(true, false, false);
                    btnMute.classList.remove('active');
                    btnMute.textContent = 'Mute';
                });

                call.on('error', function (err) {
                    console.error('[CTC] Call error:', err.message);
                    showError('Call error: ' + err.message);
                    activeCall = null;
                    resetTimer();
                    setStatus('Error', true);
                    setButtons(true, false, false);
                    btnMute.classList.remove('active');
                    btnMute.textContent = 'Mute';
                });

                call.on('cancel', function () {
                    console.log('[CTC] Call cancelled');
                    activeCall = null;
                    resetTimer();
                    setStatus('Call cancelled \\u2014 ready to redial');
                    setButtons(true, false, false);
                });
            }).catch(function (err) {
                console.error('[CTC] Connect failed:', err.message || err);
                showError('Connect failed: ' + (err.message || err));
                setStatus('Error', true);
                setButtons(true, false, false);
            });
        }

        function toggleMute() {
            if (!activeCall) return;
            var muted = !activeCall.isMuted();
            activeCall.mute(muted);
            btnMute.classList.toggle('active', muted);
            btnMute.textContent = muted ? 'Unmute' : 'Mute';
            console.log('[CTC] Mute:', muted);
        }

        function hangUp() {
            if (activeCall) {
                activeCall.disconnect();
            } else if (device) {
                device.disconnectAll();
            }
        }

        // --- Event bindings ---
        btnCall.addEventListener('click', makeCall);
        btnMute.addEventListener('click', toggleMute);
        btnHangup.addEventListener('click', hangUp);

        // --- Init ---
        if (!TOKEN_URL) {
            setStatus('Configuration error', true);
            showError('Token endpoint not configured. Check CTC script deployments.');
            return;
        }

        fetchToken()
            .then(initDevice)
            .catch(function (err) {
                setStatus('Failed to initialize', true);
                showError('Token fetch failed: ' + (err.message || err));
            });
    })();
    </script>
</body>
</html>`;
    };

    /**
     * Escape HTML special characters to prevent XSS from URL params.
     * @param {string} str
     * @returns {string}
     */
    const escapeHtml = (str) => {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    /**
     * Escape a value for safe embedding in a JS single-quoted string literal inside a script tag.
     * Prevents breaking out of the string or closing the script tag.
     * @param {string} str
     * @returns {string}
     */
    const escapeJs = (str) => {
        return String(str)
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/</g, '\\x3c')
            .replace(/>/g, '\\x3e')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r');
    };

    return { onRequest };
});
