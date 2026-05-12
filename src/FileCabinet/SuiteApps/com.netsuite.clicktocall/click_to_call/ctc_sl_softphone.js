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

        const entityInfo = lookupEntityInfo(entityType, entityId);
        const entityRecordUrl = resolveEntityRecordUrl(entityType, entityId);

        const html = buildHtml({
            phone, entityId, entityName, entityType, tokenEndpoint, sdkUrl,
            contacts, entityInfo, entityRecordUrl
        });
        context.response.write(html);
    };

    /**
     * Look up enrichment fields on the launch entity to populate the contact-info panel.
     * Uses search.lookupFields (~1 governance unit) per call. Missing fields yield ''.
     */
    const lookupEntityInfo = (entityType, entityId) => {
        if (!entityType || !entityId) return {};
        try {
            const extractText = (val) => (Array.isArray(val) && val.length ? (val[0].text || '') : '');

            if (entityType === 'customer') {
                const r = search.lookupFields({
                    type: search.Type.CUSTOMER,
                    id: entityId,
                    columns: ['email', 'salesrep']
                });
                return { email: r.email || '', owner: extractText(r.salesrep), parent: '', title: '' };
            }
            if (entityType === 'contact') {
                const r = search.lookupFields({
                    type: search.Type.CONTACT,
                    id: entityId,
                    columns: ['email', 'title', 'company']
                });
                return { email: r.email || '', title: r.title || '', parent: extractText(r.company), owner: '' };
            }
            if (entityType === 'lead') {
                const r = search.lookupFields({
                    type: search.Type.LEAD,
                    id: entityId,
                    columns: ['email', 'salesrep']
                });
                return { email: r.email || '', owner: extractText(r.salesrep), parent: '', title: '' };
            }
        } catch (e) {
            log.error({ title: 'CTC Softphone — Entity info lookup failed', details: e.message || e });
        }
        return {};
    };

    /**
     * Build a NetSuite record URL for the "See in NetSuite" link in the contact panel.
     */
    const resolveEntityRecordUrl = (entityType, entityId) => {
        if (!entityType || !entityId) return '';
        try {
            return url.resolveRecord({ recordType: entityType, recordId: entityId });
        } catch (e) {
            return '';
        }
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
                columns: ['firstname', 'lastname', 'phone', 'mobilephone', 'email', 'title']
            }).run().getRange({ start: 0, end: 50 });

            log.debug({ title: 'CTC queryContacts', details: `entityId=${entityId}, found=${results.length}` });

            return results.map((r) => ({
                id: r.id,
                name: ((r.getValue('firstname') || '') + ' ' + (r.getValue('lastname') || '')).trim(),
                phone: r.getValue('phone') || '',
                mobile: r.getValue('mobilephone') || '',
                email: r.getValue('email') || '',
                title: r.getValue('title') || ''
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

        const info = opts.entityInfo || {};
        const safeRecordUrl = escapeHtml(opts.entityRecordUrl || '');
        const infoRows = buildContactInfoRows(info, opts.entityType);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Click-to-Call — ${safeEntityName}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        :root {
            --phone-bg-1: #1A2B47;
            --phone-bg-2: #0F1B30;
            --phone-text: #FFFFFF;
            --phone-text-muted: #94A6BF;
            --phone-text-faint: #6B7B95;
            --phone-card: rgba(255, 255, 255, 0.04);
            --phone-card-border: rgba(255, 255, 255, 0.08);
            --action-call: #14B981;
            --action-call-deep: #0E9E6D;
            --action-end: #EE6E5C;
            --action-end-deep: #D85440;
            --action-neutral: rgba(255, 255, 255, 0.10);
            --action-neutral-hover: rgba(255, 255, 255, 0.18);
            --panel-bg: #FFFFFF;
            --panel-text: #161513;
            --panel-text-muted: #5C5955;
            --panel-border: #E5E2DD;
            --info: #1B6097;
            --info-soft: rgba(27, 96, 151, 0.08);
            --warning: #B47200;
            --danger: #B83A33;
        }
        html, body {
            width: 100%;
            min-height: 100vh;
            margin: 0;
            padding: 0;
        }
        body {
            font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: var(--panel-bg);
            color: var(--panel-text);
            -webkit-font-smoothing: antialiased;
            display: flex;
            flex-direction: column;
        }
        .phone {
            width: 100%;
            display: flex;
            flex-direction: column;
            flex: 1;
        }
        .phone-display {
            background: linear-gradient(180deg, var(--phone-bg-1) 0%, var(--phone-bg-2) 100%);
            color: var(--phone-text);
            padding: 16px 22px 18px;
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
        }
        .status-pill {
            font-size: 12px;
            color: var(--phone-text-muted);
            background: var(--phone-card);
            border: 1px solid var(--phone-card-border);
            border-radius: 999px;
            padding: 4px 12px;
            margin-bottom: 12px;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            min-height: 22px;
        }
        .status-pill::before {
            content: "";
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background: currentColor;
        }
        .status-pill.connecting { color: #F4C76A; }
        .status-pill.ringing { color: #F4C76A; }
        .status-pill.connected { color: #14B981; }
        .status-pill.ended { color: var(--phone-text-faint); }
        .status-pill.error { color: #FCA5A5; }
        /* Contact picker — lives in the bottom contact-info panel on light bg */
        .picker-row {
            width: 100%;
            margin-bottom: 14px;
            display: none;
            position: relative;
        }
        .picker-row.visible { display: block; }
        .picker-row select {
            appearance: none;
            -webkit-appearance: none;
            background: var(--panel-bg);
            color: var(--panel-text);
            border: 1px solid var(--panel-border);
            border-radius: 8px;
            font-family: inherit;
            font-size: 13px;
            font-weight: 500;
            width: 100%;
            cursor: pointer;
            outline: none;
            padding: 9px 32px 9px 12px;
            transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .picker-row select:focus { border-color: var(--info); box-shadow: 0 0 0 3px var(--info-soft); }
        .picker-row::after {
            content: "";
            position: absolute;
            top: 50%;
            right: 14px;
            width: 8px; height: 8px;
            border-right: 2px solid var(--panel-text-muted);
            border-bottom: 2px solid var(--panel-text-muted);
            transform: translateY(-75%) rotate(45deg);
            pointer-events: none;
        }
        .avatar {
            width: 68px;
            height: 68px;
            border-radius: 50%;
            background: linear-gradient(135deg, #38507A 0%, #1F2F4D 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 12px;
            box-shadow: 0 3px 12px rgba(0, 0, 0, 0.3);
            border: 2px solid rgba(255, 255, 255, 0.08);
        }
        .avatar svg { width: 34px; height: 34px; color: rgba(255, 255, 255, 0.82); }
        .contact-name {
            font-size: 20px;
            font-weight: 600;
            margin: 0 0 4px;
            letter-spacing: -0.01em;
            color: var(--phone-text);
            max-width: 320px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .contact-phone {
            font-family: "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
            font-size: 15px;
            color: var(--phone-text);
            margin: 0 0 2px;
            min-height: 18px;
        }
        /* Backspace lives in the action row to the right of the green Call button */
        .action-group.backspace-group { visibility: hidden; }
        .action-group.backspace-group.visible { visibility: visible; }
        .btn-backspace-action {
            background: var(--action-neutral);
            color: var(--phone-text);
        }
        .btn-backspace-action:hover:not(:disabled) {
            background: var(--action-neutral-hover);
        }
        .contact-company {
            font-size: 11.5px;
            color: var(--phone-text-faint);
            margin: 0 0 10px;
        }
        .timer {
            font-family: "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
            font-size: 26px;
            font-weight: 300;
            letter-spacing: 0.04em;
            margin: 2px 0 10px;
            color: var(--phone-text);
            display: none;
        }
        .timer.visible { display: block; }
        .origin-line {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-size: 11px;
            color: var(--phone-text-muted);
            background: var(--phone-card);
            border: 1px solid var(--phone-card-border);
            border-radius: 999px;
            padding: 4px 10px;
            margin-bottom: 12px;
            max-width: 320px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        /* Dialpad visible on idle/ready screen; hidden during active call */
        .dialpad {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 5px;
            width: 100%;
            margin: 4px 0 10px;
        }
        .dialpad.hidden { display: none; }
        .dial-key {
            background: var(--phone-card);
            border: 1px solid var(--phone-card-border);
            border-radius: 11px;
            padding: 10px 8px 9px;
            cursor: pointer;
            color: var(--phone-text);
            transition: background 0.12s ease;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 2px;
            font-family: inherit;
        }
        .dial-key:hover { background: rgba(255, 255, 255, 0.10); }
        .dial-key .digit { font-size: 19px; font-weight: 500; line-height: 1; }
        .dial-key .letters {
            font-size: 8.5px;
            color: var(--phone-text-faint);
            letter-spacing: 0.18em;
            font-weight: 600;
            text-transform: uppercase;
            min-height: 9px;
            line-height: 1;
        }
        .actions {
            display: flex;
            gap: 10px;
            align-items: center;
            justify-content: center;
            margin-top: 2px;
        }
        .actions.hidden { display: none; }
        .action-group { display: flex; flex-direction: column; align-items: center; }
        /* Idle state: 3-col grid mirrors the dialpad so the green Call button
           sits directly under the '0' key, with Back tucked in column 3. */
        #idleActions:not(.hidden) {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 5px;
            width: 100%;
            align-items: center;
        }
        #idleActions .action-group { justify-self: center; }
        .btn {
            width: 48px;
            height: 48px;
            border-radius: 14px;
            border: none;
            background: var(--action-neutral);
            color: var(--phone-text);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: transform 0.12s ease, background 0.12s ease, box-shadow 0.12s ease;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
            font-family: inherit;
            font-size: 12px;
            font-weight: 600;
            padding: 0;
        }
        .btn:hover:not(:disabled) { background: var(--action-neutral-hover); transform: translateY(-1px); }
        .btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
        .btn.active {
            background: #F4C76A;
            color: #1F2F4D;
            box-shadow: 0 4px 12px rgba(244, 199, 106, 0.4);
        }
        .btn.active svg { color: #1F2F4D; }
        /* Primary action buttons share the avatar's size so the two visual anchors
           (identity at top, action at bottom) feel paired. */
        .btn-call {
            width: 56px; height: 56px; border-radius: 16px;
            background: var(--action-call);
            box-shadow: 0 5px 16px rgba(20, 185, 129, 0.32);
        }
        .btn-call:hover:not(:disabled) { background: var(--action-call-deep); }
        .btn-hangup {
            width: 56px; height: 56px; border-radius: 16px;
            background: var(--action-end);
            box-shadow: 0 5px 16px rgba(238, 110, 92, 0.32);
        }
        .btn-hangup:hover:not(:disabled) { background: var(--action-end-deep); }
        .action-label {
            font-size: 9.5px;
            color: var(--phone-text-faint);
            margin-top: 4px;
            font-family: "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }
        .action-icon { width: 20px; height: 20px; pointer-events: none; }
        .action-icon-lg { width: 24px; height: 24px; pointer-events: none; }
        .device-selectors {
            width: 100%;
            margin-bottom: 12px;
            display: none;
            flex-direction: column;
            gap: 5px;
        }
        .device-selectors.visible { display: flex; }
        .device-row {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .device-row label {
            font-size: 10px;
            color: var(--phone-text-faint);
            min-width: 30px;
            text-align: right;
            font-family: "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }
        .device-row select {
            flex: 1;
            background: var(--phone-card);
            color: var(--phone-text);
            border: 1px solid var(--phone-card-border);
            border-radius: 7px;
            padding: 7px 9px;
            font-size: 11.5px;
            font-family: inherit;
            outline: none;
            cursor: pointer;
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            min-height: 30px;
        }
        .device-row select option {
            background: var(--phone-bg-2);
            color: var(--phone-text);
        }
        .device-row select:focus { border-color: rgba(255, 255, 255, 0.22); }
        .log-status {
            font-size: 11.5px;
            color: var(--phone-text-muted);
            margin-top: 10px;
            text-align: center;
            min-height: 14px;
            font-family: "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
        }
        .log-status.error { color: #FCA5A5; }
        .error-box {
            font-size: 11.5px;
            color: #FCA5A5;
            background: rgba(252, 165, 165, 0.08);
            border: 1px solid rgba(252, 165, 165, 0.22);
            border-radius: 8px;
            padding: 7px 11px;
            margin-top: 10px;
            text-align: center;
            word-break: break-word;
            display: none;
        }
        .contact-panel {
            background: var(--panel-bg);
            color: var(--panel-text);
            padding: 14px 18px 16px;
            flex: 1;
            display: flex;
            flex-direction: column;
        }
        .contact-panel h3 {
            margin: 0 0 10px;
            font-size: 11px;
            font-weight: 600;
            color: var(--panel-text-muted);
            text-align: left;
            text-transform: uppercase;
            letter-spacing: 0.08em;
        }
        .panel-link-row { margin-top: auto; padding-top: 10px; }
        .contact-link {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 12px;
            background: var(--info-soft);
            border: 1px solid rgba(27, 96, 151, 0.22);
            border-radius: 10px;
            color: var(--info);
            font-size: 12.5px;
            font-weight: 600;
            margin-bottom: 12px;
            cursor: pointer;
            text-decoration: none;
        }
        .contact-link:hover { background: rgba(27, 96, 151, 0.14); }
        .contact-link .ns-icon {
            width: 22px; height: 22px;
            background: var(--info);
            color: #fff;
            border-radius: 6px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.02em;
        }
        .contact-link .arrow { margin-left: auto; opacity: 0.7; }
        .contact-rows { display: flex; flex-direction: column; gap: 7px; margin: 0; padding: 0; }
        .contact-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 14px;
            font-size: 12px;
        }
        .contact-row dt { color: var(--panel-text-muted); font-weight: 500; flex-shrink: 0; margin: 0; }
        .contact-row dd {
            margin: 0;
            color: var(--panel-text);
            text-align: right;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            min-width: 0;
        }
        .panel-empty {
            text-align: center;
            font-size: 11.5px;
            color: var(--panel-text-muted);
            font-style: italic;
            padding: 8px 0 0;
        }
    </style>
</head>
<body>
<div class="phone">
    <div class="phone-display">
        <div class="status-pill" id="status">Initializing&hellip;</div>

        <div class="avatar" aria-hidden="true">
            <svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="8" r="4"/>
                <path d="M4 21c0-4 4-7 8-7s8 3 8 7"/>
            </svg>
        </div>

        <div class="contact-name" id="entityName">${safeEntityName}</div>
        <div class="contact-phone" id="phoneNumber">${safePhone}</div>
        <div class="contact-company" id="entityCompany"></div>

        <div class="timer" id="timer">00:00</div>

        <div class="origin-line" id="originLine">Outbound · from main line</div>

        <div class="device-selectors" id="deviceSelectors">
            <div class="device-row">
                <label for="inputDevice">Mic</label>
                <select id="inputDevice"><option value="">Loading…</option></select>
            </div>
            <div class="device-row" id="outputRow">
                <label for="outputDevice">Out</label>
                <select id="outputDevice"><option value="">Loading…</option></select>
            </div>
        </div>

        <div class="dialpad" id="dialpad">
            <button class="dial-key" data-digit="1" type="button"><span class="digit">1</span><span class="letters">&nbsp;</span></button>
            <button class="dial-key" data-digit="2" type="button"><span class="digit">2</span><span class="letters">ABC</span></button>
            <button class="dial-key" data-digit="3" type="button"><span class="digit">3</span><span class="letters">DEF</span></button>
            <button class="dial-key" data-digit="4" type="button"><span class="digit">4</span><span class="letters">GHI</span></button>
            <button class="dial-key" data-digit="5" type="button"><span class="digit">5</span><span class="letters">JKL</span></button>
            <button class="dial-key" data-digit="6" type="button"><span class="digit">6</span><span class="letters">MNO</span></button>
            <button class="dial-key" data-digit="7" type="button"><span class="digit">7</span><span class="letters">PQRS</span></button>
            <button class="dial-key" data-digit="8" type="button"><span class="digit">8</span><span class="letters">TUV</span></button>
            <button class="dial-key" data-digit="9" type="button"><span class="digit">9</span><span class="letters">WXYZ</span></button>
            <button class="dial-key" data-digit="*" type="button"><span class="digit">∗</span><span class="letters">&nbsp;</span></button>
            <button class="dial-key" data-digit="0" type="button"><span class="digit">0</span><span class="letters">+</span></button>
            <button class="dial-key" data-digit="#" type="button"><span class="digit">#</span><span class="letters">&nbsp;</span></button>
        </div>

        <div class="actions" id="idleActions">
            <div aria-hidden="true"></div>
            <div class="action-group">
                <button class="btn btn-call" id="btnCall" type="button" title="Place call" disabled>
                    <svg class="action-icon-lg" viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.3 11.3 0 0 0 3.5.56 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.3 11.3 0 0 0 .56 3.5 1 1 0 0 1-.25 1z"/></svg>
                </button>
                <span class="action-label">Call</span>
            </div>
            <div class="action-group backspace-group" id="backspaceGroup">
                <button class="btn btn-backspace-action" id="btnBackspace" type="button" title="Backspace" aria-label="Backspace">
                    <svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 5H8L3 12l5 7h13a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>
                </button>
                <span class="action-label">Back</span>
            </div>
        </div>

        <div class="actions hidden" id="activeActions">
            <div class="action-group">
                <button class="btn" id="btnMute" type="button" title="Mute">
                    <svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0z"/><path d="M19 11a7 7 0 0 1-14 0"/><line x1="12" y1="18" x2="12" y2="22"/></svg>
                </button>
                <span class="action-label" id="muteLabel">Mute</span>
            </div>
            <div class="action-group">
                <button class="btn btn-hangup" id="btnHangup" type="button" title="End call">
                    <svg class="action-icon-lg" viewBox="0 0 24 24" fill="currentColor"><path d="M21 15.5c-1.3 0-2.6-.2-3.8-.6a1 1 0 0 0-1 .24l-2 2A15 15 0 0 1 7 10l2-2a1 1 0 0 0 .24-1c-.4-1.2-.6-2.5-.6-3.8a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1A17 17 0 0 0 20 21a1 1 0 0 0 1-1v-3.5a1 1 0 0 0-1-1z" transform="rotate(135 12 12)"/></svg>
                </button>
                <span class="action-label">End</span>
            </div>
        </div>

        <div class="error-box" id="errorBox"></div>
        <div class="log-status" id="logStatus"></div>
    </div>

    <div class="contact-panel">
        <h3>Contact information</h3>

        <div class="picker-row" id="contactRow">
            <select id="contactSelect"></select>
        </div>

        <dl class="contact-rows" id="contactInfoRows">
            <div class="contact-row" data-row="email"><dt>Email</dt><dd id="info-email">&mdash;</dd></div>
            <div class="contact-row" data-row="title"><dt>Title</dt><dd id="info-title">&mdash;</dd></div>
            <div class="contact-row" data-row="owner"><dt>Owner</dt><dd id="info-owner">&mdash;</dd></div>
            <div class="contact-row" data-row="parent"><dt>Parent</dt><dd id="info-parent">&mdash;</dd></div>
        </dl>

        ${safeRecordUrl ? `<div class="panel-link-row"><a class="contact-link" id="contactLink" href="${safeRecordUrl}" target="_blank" rel="noopener"><span class="ns-icon">NS</span><span id="contactLinkLabel">See ${escapeHtml(opts.entityType || 'record')} in NetSuite</span><span class="arrow">→</span></a></div>` : ''}
    </div>
</div>
<!-- ENTITY_INFO and CONTACTS_INFO are consumed by inline JS to swap panel rows when picker changes -->
<script>window.__CTC_ENTITY_INFO__ = ${JSON.stringify(info || {})}; window.__CTC_ENTITY_RECORD_URL__ = ${JSON.stringify(opts.entityRecordUrl || '')}; window.__CTC_ENTITY_NAME__ = ${JSON.stringify(opts.entityName || '')}; window.__CTC_ENTITY_TYPE__ = ${JSON.stringify(opts.entityType || '')};</script>

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
        var idleActions = document.getElementById('idleActions');
        var activeActions = document.getElementById('activeActions');
        var dialpadEl = document.getElementById('dialpad');
        var dialKeys = document.querySelectorAll('.dial-key');
        var muteLabel = document.getElementById('muteLabel');
        var originLine = document.getElementById('originLine');
        var errorBox = document.getElementById('errorBox');
        var logStatusEl = document.getElementById('logStatus');
        var contactRow = document.getElementById('contactRow');
        var contactSelect = document.getElementById('contactSelect');
        var phoneNumberEl = document.getElementById('phoneNumber');
        var deviceSelectors = document.getElementById('deviceSelectors');
        var inputSelect = document.getElementById('inputDevice');
        var outputSelect = document.getElementById('outputDevice');
        var outputRow = document.getElementById('outputRow');

        // Contact panel info row elements
        var infoEmailEl = document.getElementById('info-email');
        var infoTitleEl = document.getElementById('info-title');
        var infoOwnerEl = document.getElementById('info-owner');
        var infoParentEl = document.getElementById('info-parent');
        var contactLinkLabelEl = document.getElementById('contactLinkLabel');
        var contactLinkEl = document.getElementById('contactLink');

        var ENTITY_INFO = window.__CTC_ENTITY_INFO__ || {};
        var ENTITY_RECORD_URL = window.__CTC_ENTITY_RECORD_URL__ || '';
        var ENTITY_NAME = window.__CTC_ENTITY_NAME__ || '';

        // Calls shorter than this are skipped (no record, no transcript work).
        // Twilio Voice Intelligence won't transcribe recordings under 2 seconds.
        var MIN_LOG_DURATION_SECONDS = 3;

        var device = null;
        var activeCall = null;
        var timerInterval = null;
        var callStartTime = null;
        var logCallPending = false;
        var logCallPayload = null;

        // When true, the next dial-digit input clears PHONE and starts fresh
        // (instead of appending). Flipped true after popup load and after the
        // user selects a contact from the dropdown — flipped false on the
        // first manual digit so subsequent keystrokes append normally.
        var freshNumberOnNextDigit = true;

        // --- Phone number formatting ---
        // Display as (xxx) xxx-xxxx (US) or +cc (xxx) xxx-xxxx (international).
        // PHONE is stored as raw digits (with optional leading +); only the display formats.
        function formatPhone(input) {
            var s = String(input || '');
            var plus = s.charAt(0) === '+';
            var d = s.replace(/[^0-9]/g, '');
            if (!d) return '';

            // International form: keep an explicit +country-code + 10-digit local
            if (plus) {
                if (d.length <= 10) return '+' + d;
                var ccI = d.slice(0, d.length - 10);
                var restI = d.slice(d.length - 10);
                return '+' + ccI + ' (' + restI.slice(0, 3) + ') ' + restI.slice(3, 6) + '-' + restI.slice(6);
            }

            // Bare digits — format US-style until we exceed 10, then assume cc
            if (d.length <= 3) return d;
            if (d.length <= 6) return '(' + d.slice(0, 3) + ') ' + d.slice(3);
            if (d.length <= 10) return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
            var cc = d.slice(0, d.length - 10);
            var rest = d.slice(d.length - 10);
            return '+' + cc + ' (' + rest.slice(0, 3) + ') ' + rest.slice(3, 6) + '-' + rest.slice(6);
        }

        // Normalize PHONE state to digits + optional leading +.
        function normalizeDigits(input) {
            var s = String(input || '');
            var plus = s.charAt(0) === '+';
            var d = s.replace(/[^0-9]/g, '');
            return (plus ? '+' : '') + d;
        }

        // Final form passed to Twilio. Prefers +E.164; falls back to whatever digits exist.
        function dialableFormat(input) {
            var d = normalizeDigits(input);
            if (!d) return '';
            if (d.charAt(0) === '+') return d;
            if (d.length === 10) return '+1' + d;
            if (d.length === 11 && d.charAt(0) === '1') return '+' + d;
            return d;
        }

        // --- UI helpers ---
        // setStatus(text, pillClass)
        //   pillClass: '' (idle) | 'connecting' | 'ringing' | 'connected' | 'ended' | 'error'
        function setStatus(text, pillClass) {
            statusEl.textContent = text;
            statusEl.className = 'status-pill' + (pillClass ? ' ' + pillClass : '');
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

        // Swap visible action group between idle (single Call + dialpad visible)
        // and active (Mute/End, dialpad hidden, timer visible).
        function setCallView(view) {
            if (view === 'active') {
                idleActions.classList.add('hidden');
                activeActions.classList.remove('hidden');
                timerEl.classList.add('visible');
                dialpadEl.classList.add('hidden');
            } else {
                idleActions.classList.remove('hidden');
                activeActions.classList.add('hidden');
                timerEl.classList.remove('visible');
                dialpadEl.classList.remove('hidden');
            }
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

        // Dialpad behavior:
        //   - Active call: each digit sends a DTMF tone via call.sendDigits()
        //   - Idle, first manual digit after load/contact-select: clears PHONE and replaces
        //   - Idle, subsequent digits: append
        var btnBackspace = document.getElementById('btnBackspace');
        var backspaceGroup = document.getElementById('backspaceGroup');

        function syncBackspaceVisibility() {
            if (!backspaceGroup) return;
            backspaceGroup.classList.toggle('visible', !activeCall && !!PHONE);
        }

        function setDialedNumber(next, opts) {
            PHONE = normalizeDigits(next);
            phoneNumberEl.textContent = formatPhone(PHONE) || '—';
            // Manual edits decouple from the dropdown's selected contact (unless
            // the caller is the dropdown itself, in which case it manages SELECTED_CONTACT_ID).
            if (contactSelect && !(opts && opts.fromPicker)) {
                SELECTED_CONTACT_ID = '';
                if (contactSelect.options.length) contactSelect.selectedIndex = 0;
            }
            syncBackspaceVisibility();
            if (btnCall) btnCall.disabled = !PHONE;
        }

        // Format the initial server-rendered phone number on load.
        if (PHONE) {
            phoneNumberEl.textContent = formatPhone(PHONE);
        }

        function appendDialDigit(d) {
            if (!d) return;
            if (activeCall && typeof activeCall.sendDigits === 'function') {
                try { activeCall.sendDigits(d); } catch (err) { console.error('[CTC] sendDigits failed', err); }
                return;
            }
            if (freshNumberOnNextDigit) {
                freshNumberOnNextDigit = false;
                setDialedNumber(d);
            } else {
                setDialedNumber((PHONE || '') + d);
            }
        }

        function backspaceDigit() {
            if (activeCall) return;
            freshNumberOnNextDigit = false;
            setDialedNumber((PHONE || '').slice(0, -1));
        }

        function onDialKey(e) {
            appendDialDigit(e.currentTarget.getAttribute('data-digit'));
        }
        dialKeys.forEach(function (k) { k.addEventListener('click', onDialKey); });

        if (btnBackspace) btnBackspace.addEventListener('click', backspaceDigit);

        // Physical keyboard listener — 0-9, *, #, backspace/delete.
        // Skipped when focus is in a form input/select (to avoid hijacking dropdown typeahead).
        document.addEventListener('keydown', function (e) {
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            var tag = (e.target && e.target.tagName) || '';
            if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
            var key = e.key;
            if (key === 'Backspace' || key === 'Delete') {
                backspaceDigit();
                e.preventDefault();
                return;
            }
            if (/^[0-9*#+]$/.test(key)) {
                appendDialDigit(key);
                e.preventDefault();
            }
        });

        // Initial state — show backspace if number is pre-populated
        syncBackspaceVisibility();

        // --- Contact info panel ---
        function setRowValue(rowEl, valueEl, value) {
            if (!rowEl || !valueEl) return;
            if (value) {
                valueEl.textContent = value;
                rowEl.style.display = '';
            } else {
                rowEl.style.display = 'none';
            }
        }

        function renderContactInfoFor(info, displayName) {
            info = info || {};
            var rows = document.querySelectorAll('.contact-row');
            // Map each row's data-row attr to the corresponding info field + DOM value el
            var map = {
                email:  { el: infoEmailEl,  val: info.email  || '' },
                title:  { el: infoTitleEl,  val: info.title  || '' },
                owner:  { el: infoOwnerEl,  val: info.owner  || '' },
                parent: { el: infoParentEl, val: info.parent || '' }
            };
            rows.forEach(function (row) {
                var key = row.getAttribute('data-row');
                var m = map[key];
                if (m) setRowValue(row, m.el, m.val);
            });
            // Hide entire panel rows section if everything is empty
            var anyVisible = Object.keys(map).some(function (k) { return map[k].val; });
            var panelEmpty = document.getElementById('panelEmpty');
            if (!anyVisible && !panelEmpty) {
                var emptyDiv = document.createElement('div');
                emptyDiv.id = 'panelEmpty';
                emptyDiv.className = 'panel-empty';
                emptyDiv.textContent = 'No additional contact details available.';
                document.getElementById('contactInfoRows').after(emptyDiv);
            } else if (anyVisible && panelEmpty) {
                panelEmpty.remove();
            }
            if (contactLinkLabelEl && displayName) {
                contactLinkLabelEl.textContent = 'See ' + displayName + ' in NetSuite';
            }
        }
        // Initial render with the launch entity's info
        renderContactInfoFor(ENTITY_INFO, (window.__CTC_ENTITY_TYPE__ || 'record'));

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

        // --- Contact dropdown (lives in the bottom contact-info panel) ---
        function findContactById(id) {
            for (var i = 0; i < CONTACTS.length; i++) {
                if (String(CONTACTS[i].id) === String(id)) return CONTACTS[i];
            }
            return null;
        }

        function initContactDropdown() {
            if (!CONTACTS.length) return;
            var mainOpt = document.createElement('option');
            mainOpt.value = '';
            mainOpt.textContent = 'Company main \\u2014 ' + ENTITY_NAME;
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
            contactRow.classList.add('visible');
            contactSelect.addEventListener('change', function () {
                var val = this.value;
                var entityNameEl = document.getElementById('entityName');
                if (!val) {
                    PHONE = '${jsPhone}';
                    SELECTED_CONTACT_ID = '';
                    if (entityNameEl) entityNameEl.textContent = ENTITY_NAME;
                    renderContactInfoFor(ENTITY_INFO, (window.__CTC_ENTITY_TYPE__ || 'record'));
                    if (contactLinkEl && ENTITY_RECORD_URL) contactLinkEl.href = ENTITY_RECORD_URL;
                } else {
                    var parts = val.split('|');
                    SELECTED_CONTACT_ID = parts[0];
                    PHONE = parts[1];
                    var c = findContactById(SELECTED_CONTACT_ID);
                    if (c) {
                        if (entityNameEl) entityNameEl.textContent = c.name || ENTITY_NAME;
                        renderContactInfoFor({
                            email: c.email || '',
                            title: c.title || '',
                            parent: ENTITY_NAME,
                            owner: ENTITY_INFO.owner || ''
                        }, 'contact');
                        if (contactLinkEl) contactLinkEl.href = '/app/common/entity/contact.nl?id=' + encodeURIComponent(SELECTED_CONTACT_ID);
                    }
                }
                PHONE = normalizeDigits(PHONE);
                phoneNumberEl.textContent = formatPhone(PHONE) || '—';
                if (btnCall) btnCall.disabled = !PHONE;
                syncBackspaceVisibility();
                // Picker selection resets fresh-start so the next typed digit replaces, not appends
                freshNumberOnNextDigit = true;
            });
        }
        initContactDropdown();

        // --- Call logging ---
        function logCallToNetSuite(callSid, duration) {
            logCallPayload = JSON.stringify({
                action: 'logCall',
                callSid: callSid,
                entityId: ENTITY_ID,
                entityType: ENTITY_TYPE,
                contactId: SELECTED_CONTACT_ID,
                phone: PHONE,
                duration: duration
            });
            logCallPending = true;

            logStatusEl.textContent = 'Logging call\\u2026';
            logStatusEl.className = 'log-status';
            fetch(TOKEN_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: logCallPayload
            })
            .then(function (res) { return res.json(); })
            .then(function (data) {
                logCallPending = false;
                if (data.error === 'duration_below_threshold') {
                    logStatusEl.textContent = 'Call too brief to log';
                    logStatusEl.className = 'log-status';
                } else if (data.error) {
                    logStatusEl.textContent = 'Failed to log call';
                    logStatusEl.className = 'log-status error';
                } else {
                    logStatusEl.textContent = data.duplicate
                        ? 'Call already logged \\u2714 \\u2014 Fetching transcript\\u2026'
                        : 'Call logged \\u2714 \\u2014 Fetching transcript\\u2026';
                    logStatusEl.className = 'log-status';
                    pollForTranscript(callSid, data.recordId);
                }
            })
            .catch(function () {
                // fetch failed mid-flight; try sendBeacon as last-ditch
                if (logCallPending && navigator.sendBeacon) {
                    var blob = new Blob([logCallPayload], { type: 'application/json' });
                    navigator.sendBeacon(TOKEN_URL, blob);
                    logCallPending = false;
                    logStatusEl.textContent = 'Call queued for logging';
                    logStatusEl.className = 'log-status';
                } else {
                    logStatusEl.textContent = 'Failed to log call';
                    logStatusEl.className = 'log-status error';
                }
            });
        }

        // sendBeacon fallback: if the rep closes the popup before fetch resolves,
        // queue the logCall payload via the browser's beacon API so it survives unload.
        window.addEventListener('beforeunload', function () {
            if (logCallPending && logCallPayload && navigator.sendBeacon) {
                var blob = new Blob([logCallPayload], { type: 'application/json' });
                navigator.sendBeacon(TOKEN_URL, blob);
                logCallPending = false;
            }
        });

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
                    if (data.status === 'terminal') {
                        // Twilio confirmed no transcript will exist (call too short,
                        // recording absent, or Intelligence returned a failure status).
                        logStatusEl.textContent = 'Transcription unavailable \\u2014 call too brief';
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

            // class-based show — style.display='' won't override .device-selectors{display:none}
            deviceSelectors.classList.add('visible');
        }

        // --- Twilio Device setup ---
        function initDevice(token) {
            device = new Twilio.Device(token, {
                codecPreferences: ['opus', 'pcmu'],
                logLevel: 1
            });

            device.on('registered', function () {
                console.log('[CTC] Device registered');
                setStatus('Ready to call', '');
                setButtons(true, false, false);
                setCallView('idle');
                populateDevices();
            });

            device.on('error', function (err) {
                console.error('[CTC] Device error:', err.message);
                showError('Device error: ' + err.message);
                setStatus('Error', 'error');
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
            setStatus('Connecting\\u2026', 'connecting');
            setButtons(false, false, false);
            setCallView('active');

            device.connect({ params: { To: dialableFormat(PHONE), CallerId: callerId } }).then(function (call) {
                activeCall = call;

                call.on('ringing', function () {
                    console.log('[CTC] Ringing');
                    setStatus('Ringing\\u2026', 'ringing');
                    setButtons(false, false, true);
                });

                call.on('accept', function () {
                    console.log('[CTC] Call accepted');
                    setStatus('Connected', 'connected');
                    setButtons(false, true, true);
                    startTimer();
                });

                call.on('disconnect', function () {
                    console.log('[CTC] Call disconnected');
                    var callSid = call.parameters ? call.parameters.CallSid : '';
                    var duration = callStartTime ? Math.floor((Date.now() - callStartTime) / 1000) : 0;
                    activeCall = null;
                    resetTimer();
                    setStatus('Call ended \\u2014 ready to redial', 'ended');
                    setButtons(true, false, false);
                    setCallView('idle');
                    btnMute.classList.remove('active');
                    if (muteLabel) muteLabel.textContent = 'Mute';
                    if (device && device.audio) device.audio.unsetInputDevice();

                    if (!callSid || duration <= 0) {
                        // Never connected (no answer / busy / declined) — nothing to log.
                        return;
                    }
                    if (duration < MIN_LOG_DURATION_SECONDS) {
                        // Connected but too brief for Twilio to transcribe. Skip logging.
                        logStatusEl.textContent = 'Call too brief to log (' + duration + 's)';
                        logStatusEl.className = 'log-status';
                        return;
                    }
                    logCallToNetSuite(callSid, duration);
                });

                call.on('error', function (err) {
                    console.error('[CTC] Call error:', err.message);
                    showError('Call error: ' + err.message);
                    activeCall = null;
                    resetTimer();
                    setStatus('Error', 'error');
                    setButtons(true, false, false);
                    setCallView('idle');
                    btnMute.classList.remove('active');
                    if (muteLabel) muteLabel.textContent = 'Mute';
                });

                call.on('cancel', function () {
                    console.log('[CTC] Call cancelled');
                    activeCall = null;
                    resetTimer();
                    setStatus('Call cancelled \\u2014 ready to redial', 'ended');
                    setButtons(true, false, false);
                    setCallView('idle');
                });
            }).catch(function (err) {
                console.error('[CTC] Connect failed:', err.message || err);
                showError('Connect failed: ' + (err.message || err));
                setStatus('Error', 'error');
                setButtons(true, false, false);
                setCallView('idle');
            });
        }

        function toggleMute() {
            if (!activeCall) return;
            var muted = !activeCall.isMuted();
            activeCall.mute(muted);
            btnMute.classList.toggle('active', muted);
            if (muteLabel) muteLabel.textContent = muted ? 'Unmute' : 'Mute';
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
            setStatus('Configuration error', 'error');
            showError('Token endpoint not configured. Check CTC script deployments.');
            return;
        }

        fetchToken()
            .then(function (result) {
                callerId = result.phoneNumber || '';
                if (originLine && callerId) {
                    originLine.textContent = 'Outbound \\u00b7 from ' + callerId;
                }
                initDevice(result.token);
            })
            .catch(function (err) {
                setStatus('Failed to initialize', 'error');
                showError('Token fetch failed: ' + (err.message || err));
            });
    })();
    </script>
</body>
</html>`;
    };

    /**
     * Build the <dl>.contact-rows HTML for the contact-info panel from looked-up entity info.
     * Renders only rows that have a non-empty value so blanks don't clutter the panel.
     */
    const buildContactInfoRows = (info, entityType) => {
        const rows = [];
        const push = (label, value) => {
            if (!value) return;
            rows.push(`<div class="contact-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`);
        };
        push('Email', info.email);
        push('Title', info.title);
        push('Owner', info.owner);
        push('Parent', info.parent);
        if (!rows.length) return '';
        return `<dl class="contact-rows">${rows.join('')}</dl>`;
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
