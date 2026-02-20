/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * Serves the softphone popup UI for browser-to-PSTN calling via Twilio Voice SDK.
 * Receives phone, entityId, entityName as URL parameters.
 */
// eslint-disable-next-line suitescript/no-log-module
define(['N/url', 'N/runtime', 'N/log', 'N/file', 'N/search'], (url, runtime, log, file, search) => {

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
        const entityType = params.entityType || '';

        let tokenEndpoint = '';
        let sdkUrl = '';
        try {
            tokenEndpoint = url.resolveScript({
                scriptId: 'customscript_ctc_rl_token',
                deploymentId: 'customdeploy_ctc_rl_token',
                returnExternalUrl: false
            });
        } catch (e) {
            log.error({ title: 'CTC Softphone — Failed to resolve RESTlet URL', details: e.message || e });
        }

        try {
            const sdkFile = file.load({ id: '/SuiteApps/com.netsuite.clicktocall/click_to_call/lib/twilio.min.js' });
            sdkUrl = sdkFile.url;
        } catch (e) {
            log.error({ title: 'CTC Softphone — Failed to load Twilio SDK file', details: e.message || e });
        }

        let contacts = [];
        if (entityType === 'customer' && entityId) {
            contacts = queryContacts(entityId);
        }

        const html = buildHtml({ phone, entityId, entityName, entityType, tokenEndpoint, sdkUrl, contacts });
        context.response.write(html);
    };

    /**
     * Query contacts related to a customer entity.
     * @param {string} entityId - Customer internal ID
     * @returns {Array<Object>} Array of {id, name, phone, mobile}
     */
    const queryContacts = (entityId) => {
        try {
            const results = search.create({
                type: 'contact',
                filters: [['company', 'anyof', entityId]],
                columns: ['firstname', 'lastname', 'phone', 'mobilephone']
            }).run().getRange({ start: 0, end: 50 });

            log.debug({ title: 'CTC queryContacts', details: `entityId=${entityId}, found=${results.length}` });

            return results.map((r) => ({
                id: r.id,
                name: ((r.getValue('firstname') || '') + ' ' + (r.getValue('lastname') || '')).trim(),
                phone: r.getValue('phone') || '',
                mobile: r.getValue('mobilephone') || ''
            })).filter((c) => c.phone || c.mobile);
        } catch (e) {
            log.error({ title: 'CTC Softphone — Failed to query contacts', details: e.message || e });
            return [];
        }
    };

    /**
     * Build the self-contained HTML page for the softphone popup.
     * @param {Object} opts
     * @param {string} opts.phone
     * @param {string} opts.entityId
     * @param {string} opts.entityName
     * @param {string} opts.tokenEndpoint
     * @param {string} opts.sdkUrl
     * @returns {string} Full HTML document
     */
    const buildHtml = (opts) => {
        const safePhone = escapeHtml(opts.phone);
        const safeEntityName = escapeHtml(opts.entityName);
        const safeEntityId = escapeHtml(opts.entityId);
        // JS context values — safe for embedding in JS string literals inside <script>
        const jsPhone = escapeJs(opts.phone);
        const jsEntityId = escapeJs(opts.entityId);
        const jsEntityType = escapeJs(opts.entityType || '');
        const jsTokenEndpoint = escapeJs(opts.tokenEndpoint);
        const contactsJson = JSON.stringify(opts.contacts || []);

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
            height: 560px;
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
        .device-selectors {
            width: 100%;
            max-width: 340px;
            margin-bottom: 16px;
        }
        .device-row {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
        }
        .device-row label {
            font-size: 11px;
            color: #8888aa;
            min-width: 32px;
            text-align: right;
        }
        .device-row select {
            flex: 1;
            background: #2a2a40;
            color: #e0e0e0;
            border: 1px solid #3a3a55;
            border-radius: 6px;
            padding: 5px 8px;
            font-size: 12px;
            font-family: inherit;
            outline: none;
            cursor: pointer;
            appearance: auto;
        }
        .device-row select:focus {
            border-color: #5a5a80;
        }
        .contact-select-row {
            width: 100%;
            max-width: 340px;
            margin-bottom: 12px;
            display: none;
        }
        .contact-select-row select {
            width: 100%;
            background: #2a2a40;
            color: #e0e0e0;
            border: 1px solid #3a3a55;
            border-radius: 6px;
            padding: 6px 8px;
            font-size: 13px;
            font-family: inherit;
            outline: none;
            cursor: pointer;
            appearance: auto;
        }
        .contact-select-row select:focus { border-color: #5a5a80; }
        .log-status {
            font-size: 12px;
            color: #2ecc71;
            margin-top: 8px;
            text-align: center;
            min-height: 16px;
        }
        .log-status.error { color: #ff6b6b; }
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
    <div class="contact-select-row" id="contactRow">
        <select id="contactSelect"></select>
    </div>
    <div class="status" id="status">Initializing&hellip;</div>
    <div class="timer" id="timer">00:00</div>
    <div class="device-selectors" id="deviceSelectors" style="display:none">
        <div class="device-row">
            <label for="inputDevice">Mic</label>
            <select id="inputDevice"><option value="">Loading…</option></select>
        </div>
        <div class="device-row" id="outputRow">
            <label for="outputDevice">Out</label>
            <select id="outputDevice"><option value="">Loading…</option></select>
        </div>
    </div>
    <div class="controls">
        <button class="btn btn-call" id="btnCall" disabled>Call</button>
        <button class="btn btn-mute" id="btnMute" disabled>Mute</button>
        <button class="btn btn-hangup" id="btnHangup" disabled>End</button>
    </div>
    <div class="error-box" id="errorBox"></div>
    <div class="log-status" id="logStatus"></div>

    <script src="${escapeHtml(opts.sdkUrl)}"></script>
    <script>
    (function () {
        'use strict';

        var TOKEN_URL = '${jsTokenEndpoint}';
        var PHONE = '${jsPhone}';
        var ENTITY_ID = '${jsEntityId}';
        var ENTITY_TYPE = '${jsEntityType}';
        var CONTACTS = ${contactsJson};
        var SELECTED_CONTACT_ID = '';


        var statusEl = document.getElementById('status');
        var timerEl = document.getElementById('timer');
        var btnCall = document.getElementById('btnCall');
        var btnMute = document.getElementById('btnMute');
        var btnHangup = document.getElementById('btnHangup');
        var errorBox = document.getElementById('errorBox');
        var logStatusEl = document.getElementById('logStatus');
        var contactRow = document.getElementById('contactRow');
        var contactSelect = document.getElementById('contactSelect');
        var phoneNumberEl = document.getElementById('phoneNumber');
        var deviceSelectors = document.getElementById('deviceSelectors');
        var inputSelect = document.getElementById('inputDevice');
        var outputSelect = document.getElementById('outputDevice');
        var outputRow = document.getElementById('outputRow');

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
                return { token: data.token, phoneNumber: data.phoneNumber };
            });
        }

        var callerId = '';

        // --- Contact dropdown ---
        function initContactDropdown() {
            if (!CONTACTS.length) return;
            var mainOpt = document.createElement('option');
            mainOpt.value = '';
            mainOpt.textContent = 'Company main: ' + PHONE;
            contactSelect.appendChild(mainOpt);
            CONTACTS.forEach(function (c) {
                if (c.phone) {
                    var opt = document.createElement('option');
                    opt.value = c.id + '|' + c.phone;
                    opt.textContent = c.name + ' \\u2014 ' + c.phone;
                    contactSelect.appendChild(opt);
                }
                if (c.mobile) {
                    var mopt = document.createElement('option');
                    mopt.value = c.id + '|' + c.mobile;
                    mopt.textContent = c.name + ' (mobile) \\u2014 ' + c.mobile;
                    contactSelect.appendChild(mopt);
                }
            });
            contactRow.style.display = 'block';
            contactSelect.addEventListener('change', function () {
                var val = this.value;
                if (!val) {
                    PHONE = '${jsPhone}';
                    SELECTED_CONTACT_ID = '';
                } else {
                    var parts = val.split('|');
                    SELECTED_CONTACT_ID = parts[0];
                    PHONE = parts[1];
                }
                phoneNumberEl.textContent = PHONE;
            });
        }
        initContactDropdown();

        // --- Call logging ---
        function logCallToNetSuite(callSid, duration) {
            logStatusEl.textContent = 'Logging call\\u2026';
            logStatusEl.className = 'log-status';
            fetch(TOKEN_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'logCall',
                    callSid: callSid,
                    entityId: ENTITY_ID,
                    entityType: ENTITY_TYPE,
                    contactId: SELECTED_CONTACT_ID,
                    phone: PHONE,
                    duration: duration
                })
            })
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (data.error) {
                    logStatusEl.textContent = 'Failed to log call';
                    logStatusEl.className = 'log-status error';
                } else {
                    logStatusEl.textContent = 'Call logged \\u2714 \\u2014 Fetching transcript\\u2026';
                    logStatusEl.className = 'log-status';
                    pollForTranscript(callSid, data.recordId);
                }
            })
            .catch(function () {
                logStatusEl.textContent = 'Failed to log call';
                logStatusEl.className = 'log-status error';
            });
        }

        // --- Transcript polling ---
        var POLL_INTERVAL_MS = 15000;
        var POLL_MAX_ATTEMPTS = 12;

        function pollForTranscript(callSid, recordId) {
            var attempts = 0;

            function poll() {
                attempts++;
                console.log('[CTC] Checking transcript (' + attempts + '/' + POLL_MAX_ATTEMPTS + ')');

                fetch(TOKEN_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'checkTranscript',
                        callSid: callSid,
                        recordId: recordId
                    })
                })
                .then(function (res) { return res.json(); })
                .then(function (data) {
                    if (data.status === 'completed') {
                        logStatusEl.textContent = 'Transcript saved \\u2714';
                        logStatusEl.className = 'log-status';
                        return;
                    }
                    if (attempts >= POLL_MAX_ATTEMPTS) {
                        logStatusEl.textContent = 'Transcript will be processed shortly';
                        logStatusEl.className = 'log-status';
                        return;
                    }
                    setTimeout(poll, POLL_INTERVAL_MS);
                })
                .catch(function () {
                    if (attempts >= POLL_MAX_ATTEMPTS) {
                        logStatusEl.textContent = 'Transcript will be processed shortly';
                        logStatusEl.className = 'log-status';
                        return;
                    }
                    setTimeout(poll, POLL_INTERVAL_MS);
                });
            }

            setTimeout(poll, POLL_INTERVAL_MS);
        }

        // --- Audio device helpers ---
        function clearSelect(sel) {
            while (sel.firstChild) sel.removeChild(sel.firstChild);
        }

        function populateDevices() {
            if (!device || !device.audio) return;

            // Input devices
            clearSelect(inputSelect);
            device.audio.availableInputDevices.forEach(function (info, id) {
                var opt = document.createElement('option');
                opt.value = id;
                opt.textContent = info.label || 'Microphone ' + (inputSelect.options.length + 1);
                inputSelect.appendChild(opt);
            });

            // Output devices (only if browser supports setSinkId)
            var supportsOutput = device.audio.availableOutputDevices.size > 0;
            outputRow.style.display = supportsOutput ? '' : 'none';
            if (supportsOutput) {
                clearSelect(outputSelect);
                device.audio.availableOutputDevices.forEach(function (info, id) {
                    var opt = document.createElement('option');
                    opt.value = id;
                    opt.textContent = info.label || 'Speaker ' + (outputSelect.options.length + 1);
                    outputSelect.appendChild(opt);
                });
            }

            deviceSelectors.style.display = '';
        }

        // --- Twilio Device setup ---
        function initDevice(token) {
            device = new Twilio.Device(token, {
                codecPreferences: ['opus', 'pcmu'],
                logLevel: 1
            });

            device.on('registered', function () {
                console.log('[CTC] Device registered');
                setStatus('Ready to call');
                setButtons(true, false, false);
                populateDevices();
            });

            device.on('error', function (err) {
                console.error('[CTC] Device error:', err.message);
                showError('Device error: ' + err.message);
                setStatus('Error', true);
                setButtons(true, false, false);
            });

            device.audio.on('deviceChange', function () {
                populateDevices();
            });

            device.register();
        }

        // --- Audio device change handlers ---
        inputSelect.addEventListener('change', function () {
            if (!device) return;
            device.audio.setInputDevice(this.value)
                .then(function () { console.log('[CTC] Input device set'); })
                .catch(function (err) { showError('Mic error: ' + err.message); });
        });

        outputSelect.addEventListener('change', function () {
            if (!device) return;
            device.audio.speakerDevices.set(this.value)
                .then(function () { console.log('[CTC] Output device set'); })
                .catch(function (err) { showError('Speaker error: ' + err.message); });
        });

        // --- Call management ---
        function makeCall() {
            if (!device || activeCall) return;
            clearError();
            setStatus('Connecting\\u2026');
            setButtons(false, false, false);

            device.connect({ params: { To: PHONE, CallerId: callerId } }).then(function (call) {
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
                    var callSid = call.parameters ? call.parameters.CallSid : '';
                    var duration = callStartTime ? Math.floor((Date.now() - callStartTime) / 1000) : 0;
                    activeCall = null;
                    resetTimer();
                    setStatus('Call ended \\u2014 ready to redial');
                    setButtons(true, false, false);
                    btnMute.classList.remove('active');
                    btnMute.textContent = 'Mute';
                    if (device && device.audio) device.audio.unsetInputDevice();
                    if (callSid && duration > 0) {
                        logCallToNetSuite(callSid, duration);
                    }
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
            .then(function (result) {
                callerId = result.phoneNumber || '';
                initDevice(result.token);
            })
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
