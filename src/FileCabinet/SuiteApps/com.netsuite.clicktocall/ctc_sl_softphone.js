/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * Serves the softphone popup UI for browser-to-PSTN calling via Twilio Voice SDK.
 * Receives phone, entityId, entityName as URL parameters.
 */
// eslint-disable-next-line suitescript/no-log-module
define(['N/url', 'N/runtime', 'N/log', 'N/file', 'N/search', './lib/ctc_html', './lib/ctc_entity', './lib/ctc_dock', './lib/ctc_workspace_queries'], (url, runtime, log, file, search, ctcHtml, ctcEntity, ctcDock, workspaceQueries) => {

    const escapeHtml = ctcHtml.escapeHtml;
    const escapeJs = ctcHtml.escapeJs;
    const safeJsonEmbed = ctcHtml.safeJsonEmbed;

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
        // Iteration B Phase 2: entryPoint disambiguates record launches
        // (Dial tab, contact pre-loaded) from dashboard launches (Search
        // tab default, rep finds a contact). Treat any launch that has a
        // phone OR entityId as record-like regardless of entryPoint, so
        // the dashboard's redial path still lands on Dial. Default tab:
        //   - dashboard entryPoint AND no phone/entityId → 'search'
        //   - everything else → 'dial'
        const entryPoint = params.entryPoint || (phone || entityId ? 'record' : 'dashboard');
        const initialTab = (entryPoint === 'dashboard' && !phone && !entityId)
            ? 'search'
            : 'dial';

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
            const sdkFile = file.load({ id: '/SuiteApps/com.netsuite.clicktocall/lib/twilio.min.js' });
            sdkUrl = sdkFile.url;
        } catch (e) {
            log.error({ title: 'CTC Softphone — Failed to load Twilio SDK file', details: e.message || e });
        }

        let contactsV2 = [];
        if ((entityType === 'customer' || entityType === 'prospect') && entityId) {
            // Phase 3: rich contact shape with all phones per contact, used by
            // the multi-contact picker.
            contactsV2 = ctcEntity.getContactsAtEntity(entityId);
        }
        // Phase 6 fix: when the record carries its own primary phone (the
        // company switchboard / customer's record-level phone), prepend a
        // synthetic "Company main" entry so reps can reach the switchboard
        // straight from the picker — not just per-contact lines.
        if (phone && entityName) {
            const mainEntry = {
                contactId: '__company_main__',
                name: entityName + ' (main line)',
                title: 'Company switchboard',
                email: '',
                phones: [{ number: phone, type: 'Main', isPrimary: true }]
            };
            // Strip the isPrimary flag from any other contact's first phone
            // so the picker preselects the company main as the default.
            contactsV2.forEach((c) => {
                (c.phones || []).forEach((p) => { p.isPrimary = false; });
            });
            contactsV2 = [mainEntry].concat(contactsV2);
        }

        const entityInfo = lookupEntityInfo(entityType, entityId);
        const entityRecordUrl = resolveEntityRecordUrl(entityType, entityId);

        const html = buildHtml({
            phone, entityId, entityName, entityType, tokenEndpoint, sdkUrl,
            contactsV2, entityInfo, entityRecordUrl,
            entryPoint, initialTab,
            // debug=1 (passed on by the shell from its own URL): Twilio SDK
            // debug logging. Default: warnings only.
            debug: params.debug === '1'
        });
        ctcHtml.setNoStoreHeaders(context.response);
        context.response.write(html);
    };

    /**
     * Look up enrichment fields on the launch entity. The in-call meta strip reads
     * ENTITY_INFO.owner.
     * Uses search.lookupFields (~1 governance unit) per call. Missing fields yield ''.
     */
    const lookupEntityInfo = (entityType, entityId) => {
        if (!entityType || !entityId) return {};
        try {
            const extractText = workspaceQueries.extractText;

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
            if (entityType === 'prospect') {
                const r = search.lookupFields({
                    type: search.Type.PROSPECT,
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
     * Build a NetSuite record URL for the in-call meta strip's Open-record link.
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
        // JS context values — safe for embedding in JS string literals inside <script>
        const jsPhone = escapeJs(opts.phone);
        const jsEntityId = escapeJs(opts.entityId);
        const jsEntityType = escapeJs(opts.entityType || '');
        const jsTokenEndpoint = escapeJs(opts.tokenEndpoint);
        // Phase 3: richer contacts shape for the multi-contact picker. Each
        // contact carries an array of phones [{number, type, isPrimary}]
        // covering work / mobile / home / alt.
        const contactsV2Json = safeJsonEmbed(opts.contactsV2 || []);
        // Phase 2: initialTab is 'dial' or 'search'. Defaults to 'dial' if not provided
        // so legacy callers (and existing tests) keep their current behavior.
        const jsInitialTab = escapeJs(opts.initialTab || 'dial');
        const jsDebug = opts.debug === true ? 'true' : 'false';

        const info = opts.entityInfo || {};

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
            --warning: #B47200;
            --danger: #B83A33;
        }
        html, body {
            width: 100%;
            height: 100vh;
            margin: 0;
            padding: 0;
            overflow: hidden;
        }
        body {
            font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: var(--panel-bg);
            color: var(--panel-text);
            -webkit-font-smoothing: antialiased;
            display: flex;
            flex-direction: column;
        }
        /* Phase 1 (Iteration B): popup locked to 380 × 640 emulator dimensions.
           Window-open sets the outer chrome; this caps internal layout. */
        .phone {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        .phone-display {
            background: linear-gradient(180deg, var(--phone-bg-1) 0%, var(--phone-bg-2) 100%);
            color: var(--phone-text);
            display: flex;
            flex-direction: column;
            flex: 1;
            min-height: 0;
            overflow: hidden;
        }
        /* Three-zone flex shell — phase 1 of iteration B.
           - phone-top:    status pill + tabs + gear (never scrolls)
           - phone-scroll: all per-state content (overflow-y auto absorbs growth)
           - phone-footer: primary action buttons (always anchored to bottom) */
        .phone-top {
            flex-shrink: 0;
            padding: 14px 22px 0;
            position: relative;
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
        }
        .phone-scroll {
            flex: 1;
            min-height: 0;
            overflow-y: auto;
            padding: 12px 22px 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            /* Phase 1.5: prominent scrollbar so reps discover the scroll
               affordance. Previous rgba(255,255,255,0.10) on dark navy was
               effectively invisible — users assumed clipped content was
               broken rather than scrollable. */
            scrollbar-width: auto;
            scrollbar-color: rgba(255,255,255,0.32) transparent;
            /* Phase 6 fix: position context for the audio overlay so it can
               absolutely-position itself over the scroll zone. */
            position: relative;
        }
        .phone-scroll::-webkit-scrollbar { width: 8px; }
        .phone-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.32); border-radius: 4px; }
        .phone-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.48); }
        .phone-footer {
            flex-shrink: 0;
            padding: 10px 22px 14px;
            border-top: 1px solid rgba(255, 255, 255, 0.06);
            background: rgba(0, 0, 0, 0.12);
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        /* Tab strip — Dial active by default; Search & Recents inert in phase 1. */
        .mode-tabs {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            background: var(--phone-card);
            border: 1px solid var(--phone-card-border);
            border-radius: 999px;
            padding: 2px;
            gap: 2px;
            width: 100%;
            margin-top: 8px;
        }
        .mode-tab {
            padding: 6px 6px;
            text-align: center;
            font-size: 11.5px;
            font-weight: 600;
            color: var(--phone-text-muted);
            border: none;
            background: transparent;
            border-radius: 999px;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
            letter-spacing: 0.02em;
            font-family: inherit;
        }
        .mode-tab .tab-icon { width: 12px; height: 12px; }
        .mode-tab.active {
            background: rgba(255, 255, 255, 0.16);
            color: var(--phone-text);
            box-shadow: 0 1px 4px rgba(0, 0, 0, 0.22);
        }
        .mode-tab:disabled { cursor: not-allowed; opacity: 0.55; }
        /* Audio-settings gear — inert in phase 1, wired in phase 4. */
        .audio-gear {
            position: absolute;
            top: 12px;
            right: 14px;
            width: 24px;
            height: 24px;
            background: var(--phone-card);
            border: 1px solid var(--phone-card-border);
            border-radius: 50%;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            color: var(--phone-text-muted);
            padding: 0;
        }
        .audio-gear:hover { background: rgba(255, 255, 255, 0.10); color: var(--phone-text); }
        .audio-gear svg { width: 13px; height: 13px; }
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
        .status-pill.reconnecting { color: #F4C76A; }
        .status-pill.incoming { color: #14B981; }
        .status-pill.connected { color: #14B981; }
        .status-pill.ended { color: var(--phone-text-faint); }
        .status-pill.error { color: #FCA5A5; }
        /* Subtle blue divider between audio selectors and the contact picker — barely visible */
        .phone-divider {
            width: 100%;
            height: 1px;
            background: rgba(56, 80, 122, 0.45);
            border: 0;
            margin: 6px 0 12px;
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
        /* No-phone-on-file CTA — shown when an entity is loaded but has no
           phone number. Mirrors the Search-tab "no phone on file" vocabulary
           and gives the rep a one-click jump to fix the record. */
        .no-phone-cta {
            display: none;
            font-size: 12px;
            color: #B6DCFA;
            text-decoration: none;
            margin: -4px 0 10px;
            letter-spacing: 0.02em;
        }
        .no-phone-cta.visible { display: inline-block; }
        .no-phone-cta:hover { color: #FFFFFF; text-decoration: underline; }
        /* Dialpad visible on idle/ready screen; hidden during active call */
        /* Iteration A/C/D alignment: compressed dialpad — keys are smaller
           so the new Selected Card header + compact meta strip + (during call)
           account snapshot all fit comfortably in the 640px frame. Still
           meets accessibility floor (≥ 28 px target). */
        .dialpad {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 5px;
            width: 100%;
            margin: 2px 0 6px;
        }
        .dialpad.hidden { display: none; }
        .dial-key {
            background: var(--phone-card);
            border: 1px solid var(--phone-card-border);
            border-radius: 10px;
            padding: 6px 6px 5px;
            cursor: pointer;
            color: var(--phone-text);
            transition: background 0.12s ease;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 1px;
            font-family: inherit;
            min-height: 32px;
        }
        .dial-key:hover { background: rgba(255, 255, 255, 0.10); }
        .dial-key .digit { font-size: 15px; font-weight: 500; line-height: 1.05; }
        .dial-key .letters {
            font-size: 7.5px;
            color: var(--phone-text-faint);
            letter-spacing: 0.14em;
            font-weight: 600;
            text-transform: uppercase;
            min-height: 8px;
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
            grid-template-columns: 1fr 1fr;
            gap: 8px;
        }
        .device-selectors.visible { display: grid; }
        .device-row {
            display: flex;
            align-items: center;
            gap: 6px;
            min-width: 0;
        }
        .device-row label {
            font-size: 9.5px;
            color: var(--phone-text-faint);
            min-width: 24px;
            flex-shrink: 0;
            text-align: right;
            font-family: "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }
        .device-row select {
            flex: 1;
            min-width: 0;
            background: var(--phone-card);
            color: var(--phone-text);
            border: 1px solid var(--phone-card-border);
            border-radius: 7px;
            padding: 7px 9px;
            font-size: 11px;
            font-family: inherit;
            outline: none;
            cursor: pointer;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
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
        /* ─── Iteration B Phase 2: Search tab ────────────────────────────── */
        /* view-dial / view-search are siblings inside .phone-scroll.
           Tab switching toggles .hidden on each. Recents stays inert. */
        .view-dial, .view-search {
            display: flex;
            flex-direction: column;
            align-items: center;
            width: 100%;
        }
        .view-search.hidden, .view-dial.hidden { display: none; }
        .search-bar {
            background: var(--phone-card);
            border: 1px solid var(--phone-card-border);
            border-radius: 10px;
            padding: 7px 10px;
            display: flex;
            align-items: center;
            gap: 9px;
            color: var(--phone-text);
            margin-bottom: 8px;
            width: 100%;
        }
        .search-bar .icon { width: 15px; height: 15px; color: var(--phone-text-muted); flex-shrink: 0; }
        .search-bar input {
            flex: 1;
            background: transparent;
            border: none;
            color: var(--phone-text);
            font: inherit;
            font-size: 13px;
            outline: none;
        }
        .search-bar input::placeholder { color: var(--phone-text-faint); }
        .filter-chips {
            display: flex;
            gap: 5px;
            margin-bottom: 8px;
            overflow-x: auto;
            padding-bottom: 2px;
            scrollbar-width: none;
            width: 100%;
        }
        .filter-chips::-webkit-scrollbar { display: none; }
        .filter-chip {
            font-size: 10.5px;
            color: var(--phone-text-muted);
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid var(--phone-card-border);
            border-radius: 999px;
            padding: 3px 9px;
            cursor: pointer;
            white-space: nowrap;
            font-family: inherit;
        }
        .filter-chip.active {
            background: rgba(116, 192, 252, 0.14);
            border-color: rgba(116, 192, 252, 0.45);
            color: #B6DCFA;
            font-weight: 600;
        }
        .filter-chip .count {
            font-family: "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
            font-size: 9px;
            margin-left: 4px;
            opacity: 0.7;
        }
        .surface-sect-head {
            text-align: left;
            font-family: "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
            font-size: 9px;
            text-transform: uppercase;
            letter-spacing: 0.12em;
            color: var(--phone-text-faint);
            margin: 4px 0 6px;
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            width: 100%;
        }
        .surface-sect-head .meta {
            color: var(--phone-text-muted);
            font-family: inherit;
            font-size: 10px;
            letter-spacing: 0;
            text-transform: none;
        }
        .result-list {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid var(--phone-card-border);
            border-radius: 10px;
            overflow: hidden;
            text-align: left;
            margin-bottom: 8px;
            width: 100%;
        }
        .result-list .row {
            padding: 7px 10px;
            display: flex;
            align-items: center;
            gap: 9px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            cursor: pointer;
        }
        .result-list .row:last-child { border-bottom: none; }
        .result-list .row:hover, .result-list .row.is-active { background: rgba(255, 255, 255, 0.07); }
        .result-list .swatch {
            width: 26px;
            height: 26px;
            border-radius: 7px;
            background: linear-gradient(135deg, #38507A 0%, #1F2F4D 100%);
            color: #FFFFFF;
            font-size: 10px;
            font-weight: 600;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }
        .result-list .swatch.lead     { background: linear-gradient(135deg, #A07E3F 0%, #6B5226 100%); }
        .result-list .swatch.prospect { background: linear-gradient(135deg, #4F7A86 0%, #2F4A56 100%); }
        .result-list .meta { flex: 1; min-width: 0; }
        .result-list .name {
            color: var(--phone-text);
            font-size: 12px;
            font-weight: 600;
            line-height: 1.2;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .result-list .sub {
            font-family: "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
            color: var(--phone-text-muted);
            font-size: 9.5px;
            line-height: 1.2;
            margin-top: 2px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .result-list .badge {
            font-size: 8.5px;
            text-transform: uppercase;
            letter-spacing: 0.10em;
            color: var(--phone-text-faint);
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid var(--phone-card-border);
            border-radius: 999px;
            padding: 1px 6px;
            flex-shrink: 0;
        }
        .result-list .badge.customer { color: #93C7AA; border-color: rgba(20,185,129,0.30); background: rgba(20,185,129,0.08); }
        .result-list .badge.lead     { color: #E8C77A; border-color: rgba(232,199,122,0.30); background: rgba(232,199,122,0.06); }
        .result-list .badge.prospect { color: #94BFD6; border-color: rgba(148,191,214,0.30); background: rgba(148,191,214,0.06); }
        .search-empty {
            text-align: center;
            color: var(--phone-text-faint);
            font-size: 11px;
            font-style: italic;
            padding: 12px 8px 6px;
            width: 100%;
        }
        .search-empty.hidden { display: none; }
        .search-loading {
            text-align: center;
            color: var(--phone-text-muted);
            font-size: 11px;
            padding: 10px 8px;
            width: 100%;
        }
        .search-loading.hidden { display: none; }
        /* ─── Iteration B Phase 3: multi-contact picker ────────────────────── */
        /* Sits in the Dial view above the dialpad. Hidden when the entity has
           zero contacts (Lead with no contact records, etc) — in that case the
           single record-level phone shows in the existing phoneNumber line. */
        .picker-card {
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 12px;
            padding: 10px 12px;
            margin: 0 0 10px;
            width: 100%;
            max-width: 320px;
            text-align: left;
        }
        .picker-card.hidden { display: none; }
        /* Iteration A/C/D Selected Card header inside picker-card */
        .sc-header {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 6px;
        }
        .sc-swatch {
            width: 32px;
            height: 32px;
            border-radius: 9px;
            background: linear-gradient(135deg, #38507A 0%, #1F2F4D 100%);
            color: #FFFFFF;
            font-weight: 600;
            font-size: 12px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            letter-spacing: 0.04em;
        }
        .sc-swatch.lead     { background: linear-gradient(135deg, #A07E3F 0%, #6B5226 100%); }
        .sc-swatch.prospect { background: linear-gradient(135deg, #4F7A86 0%, #2F4A56 100%); }
        .sc-name {
            flex: 1;
            min-width: 0;
            color: var(--phone-text);
            font-size: 15px;
            font-weight: 600;
            line-height: 1.2;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .sc-badge {
            font-size: 9.5px;
            text-transform: uppercase;
            letter-spacing: 0.10em;
            color: #93C7AA;
            background: rgba(20,185,129,0.08);
            border: 1px solid rgba(20,185,129,0.30);
            border-radius: 999px;
            padding: 2px 8px;
            flex-shrink: 0;
        }
        .sc-badge.lead     { color: #E8C77A; background: rgba(232,199,122,0.06); border-color: rgba(232,199,122,0.30); }
        .sc-badge.prospect { color: #94BFD6; background: rgba(148,191,214,0.06); border-color: rgba(148,191,214,0.30); }
        .sc-badge.hidden   { display: none; }
        /* Iteration A/C/D compact meta strip (NS / Owner / Last call) */
        .compact-meta {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 6px;
            margin: 8px 0 10px;
            width: 100%;
            max-width: 320px;
        }
        .compact-meta.hidden { display: none; }
        .meta-cell {
            background: rgba(255, 255, 255, 0.025);
            border: 1px solid var(--phone-card-border);
            border-radius: 7px;
            padding: 5px 8px;
            text-align: left;
            overflow: hidden;
            color: var(--phone-text);
            text-decoration: none;
        }
        .meta-cell.link { cursor: pointer; }
        .meta-cell.link:hover { background: rgba(255, 255, 255, 0.06); }
        .meta-cell .lbl {
            font-family: "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
            font-size: 8.5px;
            text-transform: uppercase;
            letter-spacing: 0.10em;
            color: var(--phone-text-faint);
            display: block;
        }
        .meta-cell .val {
            font-size: 11px;
            color: var(--phone-text);
            margin-top: 2px;
            line-height: 1.2;
            display: block;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .meta-cell .val.link-blue { color: #74A8E0; font-weight: 500; }
        /* Iteration I empty-Dial hint (top of view-dial when no context) */
        .dial-empty-hint {
            text-align: center;
            color: var(--phone-text-faint);
            font-size: 11.5px;
            font-style: italic;
            padding: 4px 8px 10px;
            width: 100%;
        }
        .dial-empty-hint.hidden { display: none; }
        .picker-btn {
            display: flex;
            align-items: center;
            justify-content: space-between;
            width: 100%;
            background: transparent;
            border: 1px solid var(--phone-card-border);
            border-radius: 8px;
            padding: 6px 10px;
            color: var(--phone-text);
            font-family: inherit;
            font-size: 12px;
            cursor: pointer;
            margin-top: 5px;
        }
        .picker-btn:first-child { margin-top: 0; }
        .picker-btn:hover { background: rgba(255, 255, 255, 0.04); }
        .picker-btn .picker-label {
            font-family: "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
            font-size: 9px;
            color: var(--phone-text-faint);
            text-transform: uppercase;
            letter-spacing: 0.10em;
            margin-right: 8px;
        }
        .picker-btn .picker-value { flex: 1; text-align: left; font-size: 12px; }
        .picker-btn .picker-value.mono {
            font-family: "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
            letter-spacing: 0.02em;
        }
        .picker-btn .chev {
            width: 12px;
            height: 12px;
            color: var(--phone-text-muted);
            flex-shrink: 0;
            transition: transform 0.15s ease;
        }
        .picker-btn[aria-expanded="true"] .chev { transform: rotate(180deg); }
        .picker-dropdown {
            margin-top: 6px;
            background: rgba(0, 0, 0, 0.20);
            border: 1px solid var(--phone-card-border);
            border-radius: 10px;
            overflow: hidden;
        }
        .picker-dropdown.hidden { display: none; }
        .picker-section-head {
            font-family: "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
            font-size: 9px;
            text-transform: uppercase;
            letter-spacing: 0.10em;
            color: var(--phone-text-faint);
            padding: 6px 10px 4px;
            text-align: left;
        }
        .picker-contact-row {
            padding: 7px 10px 8px;
            border-top: 1px solid rgba(255, 255, 255, 0.08);
            text-align: left;
            cursor: pointer;
        }
        .picker-contact-row:hover { background: rgba(255, 255, 255, 0.04); }
        .picker-contact-row.selected { background: rgba(20, 185, 129, 0.07); }
        .picker-contact-row.selected:hover { background: rgba(20, 185, 129, 0.10); }
        .picker-contact-row .name {
            font-size: 12.5px;
            color: var(--phone-text);
            font-weight: 600;
            line-height: 1.2;
        }
        .picker-contact-row .title {
            font-size: 10.5px;
            color: var(--phone-text-muted);
            margin-top: 1px;
        }
        .picker-contact-row .phones {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
            margin-top: 6px;
        }
        .phone-pill {
            font-family: "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
            font-size: 10.5px;
            color: var(--phone-text);
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid var(--phone-card-border);
            border-radius: 999px;
            padding: 2px 8px;
            cursor: pointer;
            font-family: inherit;
        }
        .phone-pill .pill-num {
            font-family: "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
            letter-spacing: 0.02em;
        }
        .phone-pill .tag {
            font-family: inherit;
            font-size: 9px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: var(--phone-text-faint);
            margin-left: 5px;
        }
        .phone-pill:hover { background: rgba(255, 255, 255, 0.08); }
        .phone-pill.selected {
            background: rgba(20, 185, 129, 0.16);
            border-color: rgba(20, 185, 129, 0.45);
            color: #B5EFD0;
        }
        .phone-pill.selected .tag { color: #88D9B0; }
        /* ─── Iteration B Phase 4: audio-settings overlay ──────────────────── */
        /* Phase 6 fix: was a sibling of view-dial / view-search inside the
           flex column — but on some browser/runtime combos the .hidden class
           on view-dial wasn't taking effect, so both stacked vertically. Now
           absolutely positioned to cover the scroll zone, layered with
           z-index. Backdrop matches the phone gradient so the cover feels
           seamless. */
        .audio-overlay {
            position: absolute;
            inset: 0;
            z-index: 10;
            background: linear-gradient(180deg, var(--phone-bg-1) 0%, var(--phone-bg-2) 100%);
            padding: 12px 22px 18px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            text-align: left;
        }
        .audio-overlay.hidden { display: none; }
        .audio-overlay .ovl-title {
            font-size: 13px;
            font-weight: 600;
            color: var(--phone-text);
            margin: 0 0 4px;
        }
        .audio-overlay .ovl-sub {
            font-size: 10.5px;
            color: var(--phone-text-muted);
            margin: 0 0 14px;
        }
        .audio-overlay .field { margin-bottom: 12px; }
        .audio-overlay .field-label {
            font-family: "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
            font-size: 9px;
            text-transform: uppercase;
            letter-spacing: 0.10em;
            color: var(--phone-text-faint);
            display: block;
            margin-bottom: 5px;
        }
        .audio-overlay select {
            width: 100%;
            appearance: none;
            -webkit-appearance: none;
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid var(--phone-card-border);
            border-radius: 9px;
            padding: 9px 11px;
            color: var(--phone-text);
            font: inherit;
            font-size: 12.5px;
            font-family: inherit;
            cursor: pointer;
            outline: none;
        }
        .audio-overlay select:focus { border-color: rgba(116, 192, 252, 0.45); }
        /* Phase 7 polish: live mic-level meter under the Input select. */
        .mic-meter {
            margin-top: 8px;
            height: 6px;
            border-radius: 3px;
            background: var(--phone-card);
            border: 1px solid var(--phone-card-border);
            overflow: hidden;
        }
        .mic-meter-bar {
            display: block;
            width: 0%;
            height: 100%;
            background: linear-gradient(90deg, #74C0FC 0%, #74C0FC 60%, #F4C76A 80%, #FCA5A5 100%);
            transition: width 60ms linear;
            transform-origin: left center;
        }
        .mic-meter-hint {
            margin-top: 6px;
            font-size: 10.5px;
            color: var(--phone-text-faint);
            letter-spacing: 0.02em;
        }
        .audio-overlay .save-default {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 11px;
            color: var(--phone-text-muted);
            margin: 4px 0 14px;
            cursor: pointer;
        }
        .audio-overlay .save-default input[type=checkbox] {
            margin: 0;
            cursor: pointer;
            accent-color: #14B981;
        }
        .audio-overlay .done-btn {
            align-self: center;
            width: fit-content;
            min-width: 160px;
            background: #74C0FC;
            color: #0B1426;
            border: 1px solid #74C0FC;
            border-radius: 8px;
            padding: 8px 18px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            font-family: inherit;
            letter-spacing: 0.02em;
            margin-top: 8px;
        }
        .audio-overlay .done-btn:hover {
            background: #8FCEFD;
            border-color: #8FCEFD;
        }
        /* Gear icon: active state when overlay open + disabled state during call. */
        .audio-gear:not([disabled]) { cursor: pointer; }
        .audio-gear.active {
            background: rgba(116, 192, 252, 0.18);
            border-color: rgba(116, 192, 252, 0.45);
            color: #B6DCFA;
        }
        .audio-gear.hidden { display: none; }
        /* ─── Iteration A/C/D alignment: hide legacy Dial-view vestiges ─────
           These elements survive in the DOM as invisible state stores so
           existing JS hooks (entityName.textContent, phoneNumberEl.textContent,
           etc.) keep working unchanged. The new Selected Card + compact meta
           components below display the same data with the wireframe layout. */
        .view-dial .avatar,
        .view-dial .contact-name,
        .view-dial .contact-phone,
        .view-dial .contact-company,
        .view-dial .phone-divider { display: none; }
        /* When the user types digits with no contact selected (dashboard
           launch + Dial tab), reveal the contact-phone slot so they can
           SEE what they are typing. The Selected Card UI was designed
           for selected-contact display; this fills the in-progress-dial
           gap. The container gets the .dialing class from setDialedNumber. */
        .view-dial.dialing .contact-phone,
        .view-dial.manual-dial .contact-phone {
            display: block;
            font-size: 28px;
            font-weight: 600;
            color: var(--phone-text-bright, #fff);
            letter-spacing: 0.5px;
            margin: 16px 0 8px;
            text-align: center;
        }
        /* In manual-dial mode (record-launch + rep types over the contact),
           hide the Selected Card, compact-meta strip, and the empty-Dial
           hint so the typed digits are the only thing in the spotlight. */
        .view-dial.manual-dial #pickerCard,
        .view-dial.manual-dial #compactMeta,
        .view-dial.manual-dial #dialEmptyHint { display: none !important; }

        /* The breadcrumb pill at the top of view-dial — only visible in
           manual-dial mode. Single-click restores the original contact. */
        .manual-dial-breadcrumb {
            display: none;
            align-items: center;
            gap: 6px;
            background: rgba(116, 192, 252, 0.10);
            border: 1px solid rgba(116, 192, 252, 0.30);
            color: #B6DCFA;
            border-radius: 999px;
            padding: 4px 12px;
            font-size: 11.5px;
            font-family: inherit;
            cursor: pointer;
            margin: 4px 0 8px;
            align-self: center;
        }
        .view-dial.manual-dial .manual-dial-breadcrumb { display: inline-flex; }
        .manual-dial-breadcrumb:hover { background: rgba(116, 192, 252, 0.18); }
        .manual-dial-breadcrumb .crumb-arrow { font-size: 13px; }
        /* ─── Iteration B Phase 5: Recents tab + last-3-dialed shortcut ───── */
        .view-recents {
            display: flex;
            flex-direction: column;
            align-items: center;
            width: 100%;
        }
        .view-recents.hidden { display: none; }
        .recents-list {
            width: 100%;
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid var(--phone-card-border);
            border-radius: 10px;
            overflow: hidden;
            text-align: left;
            margin-bottom: 8px;
        }
        .recents-row {
            display: grid;
            grid-template-columns: 24px 1fr auto;
            gap: 9px;
            padding: 7px 10px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            align-items: center;
            cursor: pointer;
        }
        .recents-row:last-child { border-bottom: none; }
        .recents-row:hover { background: rgba(255, 255, 255, 0.06); }
        .recents-row .dir {
            width: 22px; height: 22px;
            border-radius: 50%;
            display: inline-flex;
            align-items: center;
            justify-content: center;
        }
        .recents-row .dir.outbound { color: #94C7AC; background: rgba(20,185,129,0.10); }
        .recents-row .dir.inbound  { color: #94BFD6; background: rgba(148,191,214,0.10); }
        .recents-row .dir.missed   { color: #E69A8E; background: rgba(232,110,92,0.10); }
        .recents-row .dir svg { width: 12px; height: 12px; }
        .recents-row .meta { min-width: 0; }
        .recents-row .name {
            color: var(--phone-text);
            font-size: 12px;
            font-weight: 600;
            line-height: 1.2;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .recents-row .when {
            font-family: "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
            color: var(--phone-text-faint);
            font-size: 9.5px;
            line-height: 1.2;
            margin-top: 2px;
        }
        .recents-row .redial {
            background: transparent;
            border: 1px solid var(--phone-card-border);
            color: #93C7AA;
            border-radius: 6px;
            padding: 3px 6px;
            cursor: pointer;
            font-family: inherit;
        }
        .recents-row .redial svg { width: 12px; height: 12px; }
        .recents-row .redial:hover { background: rgba(20, 185, 129, 0.10); }
        /* Last-3 shortcut on empty Dial home — same row style, tighter padding */
        .last-dialed {
            width: 100%;
            margin-bottom: 8px;
        }
        .last-dialed.hidden { display: none; }
        .last-dialed .last-dialed-head {
            font-family: "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
            font-size: 9px;
            text-transform: uppercase;
            letter-spacing: 0.12em;
            color: var(--phone-text-faint);
            margin: 0 0 6px;
            display: flex; justify-content: space-between; align-items: baseline;
        }
        .last-dialed .last-dialed-head .meta {
            color: var(--phone-text-muted);
            font-family: inherit;
            font-size: 10px;
            letter-spacing: 0;
            text-transform: none;
        }
        /* ─── Iteration B Phase 6: in-call account snapshot ───────────────── */
        /* 4-tile 2×2 grid; appears inside view-dial during active call when
           an entityId is in scope. Hidden in idle / no-context states. */
        .account-snapshot {
            width: 100%;
            background: rgba(255, 255, 255, 0.025);
            border: 1px solid var(--phone-card-border);
            border-radius: 10px;
            padding: 10px 11px;
            margin: 10px 0 4px;
            text-align: left;
        }
        .account-snapshot.hidden { display: none; }
        .account-snapshot .head {
            font-family: "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
            font-size: 9px;
            text-transform: uppercase;
            letter-spacing: 0.12em;
            color: var(--phone-text-faint);
            margin-bottom: 8px;
            display: flex;
            justify-content: space-between;
            align-items: baseline;
        }
        .account-snapshot .head .meta {
            font-family: inherit;
            font-size: 10.5px;
            letter-spacing: 0;
            text-transform: none;
            color: var(--phone-text-muted);
            font-weight: 500;
        }
        .account-snapshot .tiles {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6px;
        }
        .account-snapshot .tile {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid var(--phone-card-border);
            border-radius: 8px;
            padding: 7px 9px;
        }
        .account-snapshot .tile .lbl {
            font-family: "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
            font-size: 8.5px;
            text-transform: uppercase;
            letter-spacing: 0.10em;
            color: var(--phone-text-faint);
            display: block;
        }
        .account-snapshot .tile .val {
            font-size: 14px;
            color: var(--phone-text);
            margin-top: 2px;
            font-weight: 600;
            line-height: 1.2;
        }
        .account-snapshot .tile .val.balance { color: #F4C76A; }
        .account-snapshot .tile .val.opps    { color: #B5EFD0; }
        .account-snapshot .tile .delta {
            font-family: "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
            font-size: 9.5px;
            color: var(--phone-text-muted);
            margin-top: 2px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
    </style>
</head>
<body>
<div class="phone">
    <div class="phone-display">
        <!-- ─── phone-top: status pill + tabs + audio gear (fixed) ─── -->
        <div class="phone-top">
            <button class="audio-gear" id="audioGear" type="button" title="Audio settings — pick mic and speaker" aria-label="Audio settings" aria-haspopup="dialog" aria-expanded="false">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </button>
            <div class="status-pill" id="status">Initializing&hellip;</div>
            <div class="mode-tabs" role="tablist" aria-label="Softphone modes">
                <button class="mode-tab active" id="tabDial" type="button" role="tab" aria-selected="true">
                    <svg class="tab-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="6" r="1.6"/><circle cx="12" cy="6" r="1.6"/><circle cx="19" cy="6" r="1.6"/><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/><circle cx="5" cy="18" r="1.6"/><circle cx="12" cy="18" r="1.6"/><circle cx="19" cy="18" r="1.6"/></svg>
                    Dial
                </button>
                <button class="mode-tab" id="tabSearch" type="button" role="tab" aria-selected="false" title="Search your owned customers, prospects, and leads">
                    <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="20" y1="20" x2="16.5" y2="16.5"/></svg>
                    Search
                </button>
                <button class="mode-tab" id="tabRecents" type="button" role="tab" aria-selected="false" title="Recent calls — last 7 days">
                    <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 16 14"/></svg>
                    Recents
                </button>
            </div>

        </div>

        <!-- ─── phone-scroll: per-state content (overflow absorbs growth) ─── -->
        <div class="phone-scroll">

        <!-- view-dial: existing Dial tab content (avatar / contact-fields / dialpad) -->
        <div class="view-dial" id="viewDial">
            <div class="avatar" aria-hidden="true">
                <svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="8" r="4"/>
                    <path d="M4 21c0-4 4-7 8-7s8 3 8 7"/>
                </svg>
            </div>

            <div class="contact-name" id="entityName">${safeEntityName}</div>
            <div class="contact-phone" id="phoneNumber">${safePhone}</div>
            <a class="no-phone-cta" id="noPhoneCta" target="_blank" rel="noopener" href="#">Add a phone in NetSuite &rarr;</a>
            <div class="contact-company" id="entityCompany"></div>

            <div class="timer" id="timer">00:00</div>

            <hr class="phone-divider" id="phoneDivider">

            <!-- Phase 3 multi-contact picker. Hidden when entity has 0 contacts
                 (Lead with no contact records) — the existing phoneNumber line
                 takes over in that case. Populated server-side on record launch
                 and client-side after a Search-tab selection (softphoneContacts
                 RESTlet route). -->
            <!-- Manual-dial breadcrumb: shown when the rep types digits
                 with a contact pre-loaded. Hides the Selected Card +
                 compact-meta + dialEmptyHint, surfaces the typed digits,
                 and offers a one-click path back to the original contact. -->
            <button class="manual-dial-breadcrumb hidden" id="manualDialBreadcrumb" type="button">
                <span class="crumb-arrow">&larr;</span>
                <span class="crumb-text">Use <span id="crumbEntityName">contact</span>'s number</span>
            </button>

            <div class="picker-card hidden" id="pickerCard">
                <!-- Iteration A/C/D Selected Card header: company swatch +
                     name + type badge. Populated client-side from ENTITY_NAME
                     and ENTITY_TYPE on init, and re-populated when a Search/
                     Recents row is selected (loadRecentIntoDial /
                     selectSearchRow). -->
                <div class="sc-header">
                    <div class="sc-swatch" id="scSwatch">&middot;&middot;</div>
                    <div class="sc-name" id="scName">&mdash;</div>
                    <span class="sc-badge" id="scBadge"></span>
                </div>
                <button class="picker-btn" id="pickerContactBtn" type="button" aria-expanded="false" aria-controls="pickerDropdown">
                    <span class="picker-label">Contact</span>
                    <span class="picker-value" id="pickerContactName">&mdash;</span>
                    <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <button class="picker-btn" id="pickerNumberBtn" type="button" aria-expanded="false" aria-controls="pickerDropdown">
                    <span class="picker-label">Number</span>
                    <span class="picker-value mono" id="pickerNumberValue">&mdash;</span>
                    <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div class="picker-dropdown hidden" id="pickerDropdown" role="region" aria-label="Pick a contact and phone"></div>
            </div>

            <!-- Iteration A/C/D compact meta strip: NS / Owner / Last call.
                 Hidden when no entity context. Populated client-side from
                 ENTITY_INFO + ENTITY_RECORD_URL + the recents fetch. -->
            <div class="compact-meta hidden" id="compactMeta">
                <a class="meta-cell link" id="metaOpenRecord" target="_blank" rel="noopener" href="#">
                    <span class="lbl">NS</span>
                    <span class="val link-blue">Open record &rarr;</span>
                </a>
                <div class="meta-cell">
                    <span class="lbl">Owner</span>
                    <span class="val" id="metaOwner">&mdash;</span>
                </div>
                <div class="meta-cell">
                    <span class="lbl">Last call</span>
                    <span class="val" id="metaLastCall">&mdash;</span>
                </div>
            </div>

            <!-- Iteration I empty-Dial hint at top of view-dial (shown when
                 no entity context is loaded — dashboard launch with no phone
                 + no entityId). -->
            <div class="dial-empty-hint hidden" id="dialEmptyHint">
                Type a number, or switch to Search to find a contact
            </div>

            <!-- Phase 5: last-3-dialed shortcut on the empty Dial home (no
                 contact loaded). Hidden once a contact is loaded into the
                 Selected Card. Populated by the same softphoneRecents fetch
                 as the Recents tab — top 3 rows only. -->
            <div class="last-dialed hidden" id="lastDialed">
                <div class="last-dialed-head">
                    <span>Last dialed</span>
                    <span class="meta">tap to redial</span>
                </div>
                <div class="recents-list" id="lastDialedList"></div>
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

            <!-- Phase 6: in-call account snapshot. Hidden by default; populated
                 + shown when setCallView('active') fires AND an entityId is in
                 scope. Empty rollups render as an em-dash placeholder so the
                 4-tile grid stays stable for thin records (Leads with no
                 transactions yet). -->
            <div class="account-snapshot hidden" id="accountSnapshot">
                <div class="head">
                    <span>Account snapshot</span>
                    <span class="meta" id="snapshotEntityLabel">&mdash;</span>
                </div>
                <div class="tiles">
                    <div class="tile">
                        <span class="lbl">Outstanding</span>
                        <div class="val balance" id="snapOutstanding">&mdash;</div>
                        <div class="delta" id="snapOutstandingDelta">&mdash;</div>
                    </div>
                    <div class="tile">
                        <span class="lbl">Open opps</span>
                        <div class="val opps" id="snapOpenOpps">&mdash;</div>
                        <div class="delta" id="snapOpenOppsDelta">&mdash;</div>
                    </div>
                    <div class="tile">
                        <span class="lbl">Last invoice</span>
                        <div class="val" id="snapLastInvoice">&mdash;</div>
                        <div class="delta" id="snapLastInvoiceDelta">&mdash;</div>
                    </div>
                    <div class="tile">
                        <span class="lbl">Last activity</span>
                        <div class="val" id="snapLastActivity">&mdash;</div>
                        <div class="delta" id="snapLastActivityDelta">&mdash;</div>
                    </div>
                </div>
            </div>
        </div><!-- /view-dial -->

        <!-- view-search: Phase 2 Search tab (hidden by default; shown when Search tab is active) -->
        <div class="view-search hidden" id="viewSearch">
            <div class="search-bar">
                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="20" y1="20" x2="16.5" y2="16.5"/></svg>
                <input id="searchInput" type="search" autocomplete="off" placeholder="Customers, contacts, leads&hellip;" aria-label="Search owned entities">
            </div>
            <div class="filter-chips" id="searchChips" role="group" aria-label="Filter by entity type within your book">
                <button class="filter-chip active" type="button" data-filter="" title="All entities where you are on the Sales Team (primary or secondary)">My book <span class="count" id="cnt-all">0</span></button>
                <button class="filter-chip" type="button" data-filter="customer">Customer <span class="count" id="cnt-customer">0</span></button>
                <button class="filter-chip" type="button" data-filter="prospect">Prospect <span class="count" id="cnt-prospect">0</span></button>
                <button class="filter-chip" type="button" data-filter="lead">Lead <span class="count" id="cnt-lead">0</span></button>
            </div>
            <div class="surface-sect-head">
                <span id="searchSectLabel">Suggested · your book</span>
                <span class="meta" id="searchSectMeta">by recency</span>
            </div>
            <div class="result-list" id="searchResults"></div>
            <div class="search-loading hidden" id="searchLoading">Loading&hellip;</div>
            <div class="search-empty hidden" id="searchEmpty">No matches &mdash; try a different name or number.</div>
        </div><!-- /view-search -->

        <!-- audio-overlay: Phase 4 audio-settings panel. Hidden by default;
             gear in phone-top toggles. Reuses #inputDevice / #outputDevice IDs
             so the existing populateDevices + Twilio device wiring is unchanged
             — Phase 1.5's inline device-selectors row in phone-top is gone now
             that these live behind the gear instead. -->
        <div class="audio-overlay hidden" id="audioOverlay" role="dialog" aria-label="Audio settings">
            <div class="ovl-title">Audio settings</div>
            <div class="ovl-sub">Pick the mic and speaker before you call. Defaults are remembered per browser.</div>

            <div class="field">
                <span class="field-label">Input &middot; microphone</span>
                <select id="inputDevice"><option value="">Loading&hellip;</option></select>
                <!-- Phase 7 polish: live VU meter so reps can verify the mic
                     is actually picking up sound (catches "muted at the OS
                     level" before they dial). Powered by Web Audio API
                     AudioContext.createAnalyser; runs only while the overlay
                     is open. -->
                <div class="mic-meter" id="micMeter" aria-hidden="true">
                    <div class="mic-meter-bar" id="micMeterBar"></div>
                </div>
                <div class="mic-meter-hint" id="micMeterHint">Speak to test &mdash; bar lights up when the mic hears you.</div>
            </div>
            <div class="field" id="outputRow">
                <span class="field-label">Output &middot; speaker</span>
                <select id="outputDevice"><option value="">Loading&hellip;</option></select>
            </div>

            <label class="save-default">
                <input type="checkbox" id="audioSaveDefault" checked>
                <span>Remember these as my defaults</span>
            </label>

            <button class="done-btn" id="audioDone" type="button">Save &amp; Return</button>
        </div><!-- /audio-overlay -->

        <!-- view-recents: Phase 5 Recents tab. Hidden by default; shown when
             the Recents tab is active. Filter chips re-segment by direction
             (All / Missed / Outbound / Inbound). Tap a row → load into Dial. -->
        <div class="view-recents hidden" id="viewRecents">
            <div class="filter-chips" id="recentsChips" role="group" aria-label="Filter recents by direction">
                <button class="filter-chip active" type="button" data-direction="">All <span class="count" id="rcnt-all">0</span></button>
                <button class="filter-chip" type="button" data-direction="missed">Missed <span class="count" id="rcnt-missed">0</span></button>
                <button class="filter-chip" type="button" data-direction="outbound">Out <span class="count" id="rcnt-out">0</span></button>
                <button class="filter-chip" type="button" data-direction="inbound">In <span class="count" id="rcnt-in">0</span></button>
            </div>
            <div class="surface-sect-head">
                <span>Last 7 days</span>
                <span class="meta" id="recentsCount">your calls only</span>
            </div>
            <div class="recents-list" id="recentsList"></div>
            <div class="search-loading hidden" id="recentsLoading">Loading&hellip;</div>
            <div class="search-empty hidden" id="recentsEmpty">No calls in the last 7 days.</div>
        </div><!-- /view-recents -->

        </div><!-- /phone-scroll -->

        <!-- ─── phone-footer: primary action row (fixed to bottom) ─── -->
        <div class="phone-footer">
        <div class="actions" id="idleActions">
            <div aria-hidden="true"></div>
            <div class="action-group">
                <button class="btn btn-call" id="btnCall" type="button" title="Place call" disabled>
                    <svg class="action-icon-lg" viewBox="0 0 24 24" fill="currentColor"><path d="M1.5 4.5a3 3 0 0 1 3-3h1.372c.86 0 1.61.586 1.819 1.42l1.105 4.423a1.875 1.875 0 0 1-.694 1.955l-1.293.97c-.135.101-.164.249-.126.352a11.285 11.285 0 0 0 6.697 6.697c.103.038.25.009.352-.126l.97-1.293a1.875 1.875 0 0 1 1.955-.694l4.423 1.105c.834.209 1.42.959 1.42 1.82V19.5a3 3 0 0 1-3 3h-2.25C8.552 22.5 1.5 15.448 1.5 6.75V4.5z"/></svg>
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
        </div><!-- /phone-footer -->
    </div>
</div>
<!-- ENTITY_INFO, record URL, name and type are read by the inline JS (in-call meta strip) -->
<script>window.__CTC_ENTITY_INFO__ = ${safeJsonEmbed(info || {})}; window.__CTC_ENTITY_RECORD_URL__ = ${safeJsonEmbed(opts.entityRecordUrl || '')}; window.__CTC_ENTITY_NAME__ = ${safeJsonEmbed(opts.entityName || '')}; window.__CTC_ENTITY_TYPE__ = ${safeJsonEmbed(opts.entityType || '')};</script>

    <script src="${escapeHtml(opts.sdkUrl)}"></script>
    <script>
    (function () {
        'use strict';

        var TOKEN_URL = '${jsTokenEndpoint}';
        var PHONE = '${jsPhone}';
        var ENTITY_ID = '${jsEntityId}';
        var ENTITY_TYPE = '${jsEntityType}';
        // Phase 3: richer per-entity contact shape for the multi-contact picker.
        var CONTACTS_V2 = ${contactsV2Json};
        var SELECTED_CONTACT_ID = '';
        var SELECTED_PHONE_TYPE = '';
        // Iteration B Phase 2: server-decided default tab — 'dial' or 'search'.
        var INITIAL_TAB = '${jsInitialTab}';
        // Twilio SDK log level: 1 (debug) with debug=1, else 3 (warn).
        var DEBUG = ${jsDebug};


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
        var errorBox = document.getElementById('errorBox');
        var logStatusEl = document.getElementById('logStatus');
        var phoneNumberEl = document.getElementById('phoneNumber');
        var noPhoneCtaEl = document.getElementById('noPhoneCta');

        // Fix 3b: client-side mirror of server's resolveEntityRecordUrl for
        // Search/Recents rows. Customer/Lead/Prospect all live on the same
        // entity record (custjob.nl), so a single path works for all three.
        // Without this, opts.recordUrl was empty (selectSearchRow had a TODO,
        // loadRecentIntoDial never set it), falling through to ENTITY_RECORD_URL
        // (also empty on portlet launch) → href="#" + target="_blank" opened
        // the Suitelet popup's own URL in a new tab.
        function clientResolveEntityUrl(entityType, entityId) {
            if (!entityId) return '';
            var t = String(entityType || '').toLowerCase();
            if (t === 'contact') {
                return '/app/common/entity/contact.nl?id=' + encodeURIComponent(entityId);
            }
            return '/app/common/entity/custjob.nl?id=' + encodeURIComponent(entityId);
        }

        // Fix 3a: when an entity is loaded but has no phone on file, render
        // "no phone on file" in place of the silent em-dash and surface the
        // "Add a phone in NetSuite" CTA. When PHONE is non-empty, show the
        // formatted digits and hide the CTA.
        function renderPhoneFallback() {
            if (PHONE) {
                if (noPhoneCtaEl) noPhoneCtaEl.classList.remove('visible');
                return formatPhone(PHONE);
            }
            if (ENTITY_ID) {
                if (noPhoneCtaEl) {
                    var ctaUrl = ENTITY_RECORD_URL
                        || clientResolveEntityUrl(ENTITY_TYPE, ENTITY_ID);
                    if (ctaUrl) {
                        noPhoneCtaEl.href = ctaUrl;
                        noPhoneCtaEl.classList.add('visible');
                    } else {
                        noPhoneCtaEl.classList.remove('visible');
                    }
                }
                return 'no phone on file';
            }
            if (noPhoneCtaEl) noPhoneCtaEl.classList.remove('visible');
            return '—';
        }
        // Phase 4: the legacy device-selectors wrapper was removed when the
        // mic/speaker selects moved into the audio-overlay. Variable kept as
        // a no-op (null) so any straggling references don't throw.
        var deviceSelectors = null;
        var inputSelect = document.getElementById('inputDevice');
        var outputSelect = document.getElementById('outputDevice');
        var outputRow = document.getElementById('outputRow');

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

        // --- Telephony Dock bus host ---
        // This page is the anchor: the only window with audio and call
        // state. Docks (lib/ctc_dock_client.js) in every tab mirror it over a
        // BroadcastChannel. They send 'hello' (asks for a snapshot) and
        // 'request' (dial / mute / hangup / answer / decline / ...); only
        // this window changes call state. Message shapes: see the BUS
        // CONTRACT in lib/ctc_dock.js.
        var DOCK_PHASE_BY_PILL = {
            '': 'ready', connecting: 'dialing', ringing: 'ringing',
            incoming: '${escapeJs(ctcDock.PHASE_INCOMING)}',
            connected: 'connected',
            reconnecting: '${escapeJs(ctcDock.PHASE_RECONNECTING)}',
            ended: 'ready', error: 'error'
        };
        var dockPhase = 'starting';
        var dockContactName = '';
        var dockLastLog = null;
        // Inbound spike. pendingInbound: the one ringing inbound call (not
        // answered yet). callDirection: 'outbound' | 'inbound' for the
        // current or last call. dockCaller: { number, name, entityId,
        // entityType } of the inbound caller (name / entity after lookup).
        var pendingInbound = null;
        var callDirection = 'outbound';
        var dockCaller = null;
        // The phone was handed to another tab (bus 'takeover'): the device
        // is unregistered and stays so until the shell stops this frame.
        var movedAway = false;
        // Snapshot fields the shell owns (postMessage SHELL_STATE_MESSAGE).
        var shellAudioUnlocked = false;
        var shellNotify = 'unsupported';
        var NOTIFY_STATES = { 'default': 1, granted: 1, denied: 1, unsupported: 1 };
        // The last refused request: { action, reason, nonce, at } or null.
        var dockRefused = null;
        var dockBus = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel('${escapeJs(ctcDock.BUS_CHANNEL)}') : null;

        function currentCallSid() {
            var c = pendingInbound || activeCall;
            return String((c && c.parameters && c.parameters.CallSid) || '');
        }

        function publishDock() {
            if (!dockBus) return;
            dockBus.postMessage({
                v: 1,
                type: 'snapshot',
                snap: {
                    phase: dockPhase,
                    direction: callDirection,
                    caller: dockCaller,
                    callSid: currentCallSid(),
                    entityId: ENTITY_ID,
                    entityType: ENTITY_TYPE,
                    entityName: ENTITY_NAME,
                    contactName: dockContactName,
                    number: formatPhone(PHONE),
                    startedAt: callStartTime,
                    muted: !!(activeCall && activeCall.isMuted()),
                    lastLog: dockLastLog,
                    audio: dockAudio(),
                    // true / false: inbound is granted and the device is /
                    // is not registered (Twilio can ring it). null: no inbound.
                    // false while token fetches fail (session gone): the
                    // dock shows the amber 'reconnecting' hint.
                    // null while paused: not receiving on purpose (error 'paused').
                    canReceive: tokenFailing ? false
                        : ctcPaused ? null
                        : (incomingGranted ? !!(device && device.state === 'registered') : null),
                    callWarning: callWarning,
                    audioUnlocked: shellAudioUnlocked,
                    notify: shellNotify,
                    missedUnseen: missedUnseen,
                    error: phoneError || { kind: '', code: 0, message: '' },
                    refused: dockRefused
                }
            });
        }

        // --- Phone errors (snapshot 'error') ---
        // One current error: { kind, code, message }. kind from the Twilio
        // code (errorKindForCode) or the source (token fetch = session,
        // mic permission = mic). Cleared by kind when that source recovers.
        var phoneError = null;

        function errorKindForCode(code) {
            var n = Number(code) || 0;
            if (n === 20101 || n === 20104 || (n >= 31204 && n <= 31206)) return 'session';
            if (n === 31208 || n === 31401) return 'mic';
            if (n >= 31000 && n <= 31999) return 'network';
            return 'twilio';
        }

        // code: the Twilio code / HTTP status (number), or a string code
        // (not_enabled: 'not_a_phone_user').
        function setPhoneError(kind, code, message) {
            phoneError = {
                kind: String(kind || 'twilio'),
                code: typeof code === 'string' && !/^[0-9]+$/.test(code) ? code : (Number(code) || 0),
                message: String(message || '').slice(0, 200)
            };
            publishDock();
        }

        // kinds: array of kinds this recovery clears; omitted = any kind.
        function clearPhoneError(kinds) {
            if (!phoneError) return;
            if (kinds && kinds.indexOf(phoneError.kind) === -1) return;
            phoneError = null;
            publishDock();
        }

        // --- Call quality (snapshot 'callWarning') ---
        // Twilio Call 'warning' / 'warning-cleared' names, mapped to the
        // short list docks know. Unknown names are ignored.
        var CALL_WARNING_MAP = {
            'high-rtt': 'high-rtt',
            'high-jitter': 'high-jitter',
            'high-packet-loss': 'packet-loss',
            'high-packets-lost-fraction': 'packet-loss',
            'low-mos': 'low-mos',
            'constant-audio-input-level': 'low-mic',
            'low-bytes-received': 'no-audio',
            'low-bytes-sent': 'no-audio',
            'ice-connectivity-lost': 'no-audio'
        };
        // Most severe first.
        var CALL_WARNING_ORDER = ['no-audio', 'low-mic', 'packet-loss', 'high-rtt', 'high-jitter', 'low-mos'];
        var callWarnings = {};
        var callWarning = '';

        // The most severe active warning ('' when none). active: map of
        // Twilio warning name to true.
        function pickCallWarning(active) {
            var mapped = {};
            for (var name in active) {
                if (Object.prototype.hasOwnProperty.call(active, name) && active[name]
                        && CALL_WARNING_MAP.hasOwnProperty(name)) {
                    mapped[CALL_WARNING_MAP[name]] = true;
                }
            }
            for (var i = 0; i < CALL_WARNING_ORDER.length; i++) {
                if (mapped[CALL_WARNING_ORDER[i]]) return CALL_WARNING_ORDER[i];
            }
            return '';
        }

        function noteCallWarning(name, on) {
            name = String(name || '');
            if (on) callWarnings[name] = true;
            else delete callWarnings[name];
            var next = pickCallWarning(callWarnings);
            if (next === callWarning) return;
            callWarning = next;
            publishDock();
        }

        function resetCallWarnings() {
            callWarnings = {};
            if (!callWarning) return;
            callWarning = '';
            publishDock();
        }

        // --- Missed calls (snapshot 'missedUnseen') ---
        // Inbound calls that stopped ringing unanswered since the last
        // 'markMissedSeen'. Kept in sessionStorage: this frame shares the
        // shell tab's storage, so a phone-frame restart keeps the count.
        var MISSED_KEY = '${escapeJs(ctcDock.MISSED_STORAGE_KEY)}';

        function emptyMissed() {
            return { count: 0, last: null, at: null };
        }

        function loadMissed() {
            try {
                var v = JSON.parse(window.sessionStorage.getItem(MISSED_KEY) || 'null');
                if (v && typeof v.count === 'number' && v.count > 0) {
                    var last = v.last && typeof v.last === 'object' ? {
                        name: String(v.last.name || ''),
                        number: String(v.last.number || ''),
                        entityId: String(v.last.entityId || ''),
                        entityType: String(v.last.entityType || '')
                    } : null;
                    return { count: Math.floor(v.count), last: last, at: typeof v.at === 'number' ? v.at : null };
                }
            } catch (e) { /* storage blocked or bad JSON */ }
            return emptyMissed();
        }

        function saveMissed() {
            try { window.sessionStorage.setItem(MISSED_KEY, JSON.stringify(missedUnseen)); } catch (e) { /* storage blocked */ }
        }

        var missedUnseen = loadMissed();

        function addMissedCall(caller) {
            caller = caller || {};
            missedUnseen = {
                count: missedUnseen.count + 1,
                last: {
                    name: String(caller.name || ''),
                    number: String(caller.number || ''),
                    entityId: String(caller.entityId || ''),
                    entityType: String(caller.entityType || '')
                },
                at: Date.now()
            };
            saveMissed();
        }

        function markMissedSeen() {
            missedUnseen = emptyMissed();
            saveMissed();
            publishDock();
        }

        // Audio devices for the dock: the same lists and selection the
        // #inputDevice / #outputDevice selects show. null before the device
        // exists. Blank labels (no mic permission yet) get the same
        // 'Microphone N' / 'Speaker N' names populateDevices uses.
        function dockAudio() {
            if (!device || !device.audio) return null;
            var inputs = [];
            var outputs = [];
            device.audio.availableInputDevices.forEach(function (info, id) {
                inputs.push({ id: id, label: info.label || 'Microphone ' + (inputs.length + 1) });
            });
            var outputSupported = device.audio.availableOutputDevices.size > 0;
            if (outputSupported) {
                device.audio.availableOutputDevices.forEach(function (info, id) {
                    outputs.push({ id: id, label: info.label || 'Speaker ' + (outputs.length + 1) });
                });
            }
            return {
                inputs: inputs,
                outputs: outputs,
                input: (inputSelect && inputSelect.value) || '',
                output: (outputSupported && outputSelect && outputSelect.value) || '',
                outputSupported: outputSupported
            };
        }

        // A dock picks a mic or speaker. Runs the same path as the audio
        // overlay selects: set the select, call the shared apply function,
        // and save the choice to the overlay defaults (localStorage) so it
        // survives a reload. Refused mid-call, as the UI hides the gear
        // then. Unknown ids are ignored. The snapshot sent back on refusal
        // tells the dock nothing changed.
        function dockSetInput(id) {
            id = String(id || '');
            if (activeCall || pendingInbound || !device || !device.audio
                    || !device.audio.availableInputDevices.has(id)) { publishDock(); return; }
            inputSelect.value = id;
            applyInputDevice(id);
            persistAudioPref('inputDeviceId', id);
        }

        function dockSetOutput(id) {
            id = String(id || '');
            if (activeCall || pendingInbound || !device || !device.audio
                    || !device.audio.availableOutputDevices.has(id)) { publishDock(); return; }
            outputSelect.value = id;
            applyOutputDevice(id);
            persistAudioPref('outputDeviceId', id);
        }

        function setDockLog(status, message, recordId) {
            dockLastLog = status ? {
                status: status,
                message: message || '',
                recordUrl: recordId ? '/app/crm/calendar/call.nl?id=' + encodeURIComponent(recordId) : ''
            } : null;
            publishDock();
        }

        // --- Bus request gate ---
        // BroadcastChannel cannot tell which same-origin page sent a
        // message. These checks stop accidents and replays, not an attacker
        // on the account origin (server-side allow-listing is the backstop):
        //   - every request needs origin 'dock' and a fresh nonce;
        //   - dial: only a dialable E.164 / NANP number, one per 3 s, 20 per
        //     rolling hour on this page, never while a call is live.
        var REQUEST_ORIGIN = '${escapeJs(ctcDock.REQUEST_ORIGIN)}';
        var NONCE_RE = new RegExp('${escapeJs(ctcDock.REQUEST_NONCE_PATTERN)}');
        var NONCE_MEMORY = 64;
        var DIAL_MIN_GAP_MS = 3000;
        var DIAL_MAX_PER_HOUR = 20;
        var DIAL_WINDOW_MS = 60 * 60 * 1000;
        var seenNonces = [];
        var dialTimes = [];

        // '' when the request may run, else why it is dropped.
        function requestRefusal(m) {
            if (!m || m.origin !== REQUEST_ORIGIN) return 'origin';
            if (typeof m.nonce !== 'string' || !NONCE_RE.test(m.nonce)) return 'nonce';
            if (seenNonces.indexOf(m.nonce) !== -1) return 'replay';
            seenNonces.push(m.nonce);
            if (seenNonces.length > NONCE_MEMORY) seenNonces.shift();
            return '';
        }

        // A dialable number after dialableFormat: +1 NXX NXX XXXX (NANP)
        // or + and 7-15 digits for other country codes.
        function validDialTarget(to) {
            var s = String(to || '');
            if (/^[+]1/.test(s)) return /^[+]1[2-9][0-9]{2}[2-9][0-9]{6}$/.test(s);
            return /^[+][2-9][0-9]{6,14}$/.test(s);
        }

        // '' when a dial may go out now (and counts it), else 'rate' or
        // 'hourly-limit'.
        function dialRateCheck(now) {
            dialTimes = dialTimes.filter(function (t) { return now - t < DIAL_WINDOW_MS; });
            if (dialTimes.length && now - dialTimes[dialTimes.length - 1] < DIAL_MIN_GAP_MS) return 'rate';
            if (dialTimes.length >= DIAL_MAX_PER_HOUR) return 'hourly-limit';
            dialTimes.push(now);
            return '';
        }

        function refuseRequest(m, reason) {
            console.warn('[CTC] Bus request refused: ' + (m && m.action) + ' (' + reason + ')');
            dockRefused = {
                action: String((m && m.action) || ''),
                reason: reason,
                nonce: String((m && m.nonce) || ''),
                at: Date.now()
            };
            publishDock();
        }

        // A dock asks to place a call. The dock already chose the entity,
        // contact, and number, so load them as a picker selection would and
        // dial. Refused while a call is live or before the device is ready,
        // for a number that is not dialable, and over the rate limits; the
        // snapshot sent back (refused) tells the dock why.
        function dockDial(m) {
            if (ctcPaused) { refuseRequest(m, 'paused'); return; }
            if (activeCall || pendingInbound || !device || dockPhase !== 'ready') { refuseRequest(m, 'busy'); return; }
            if (!validDialTarget(dialableFormat(String(m.to || '')))) { refuseRequest(m, 'invalid-number'); return; }
            var limit = dialRateCheck(Date.now());
            if (limit) { refuseRequest(m, limit); return; }
            ENTITY_ID = String(m.entityId || '');
            ENTITY_NAME = String(m.entityName || '');
            ENTITY_TYPE = String(m.entityType || '');
            window.__CTC_ENTITY_TYPE__ = ENTITY_TYPE;
            setDialedNumber(String(m.to || ''), { resetFresh: true, fromPicker: true });
            SELECTED_CONTACT_ID = String(m.contactId || '');
            dockContactName = String(m.contactName || '');
            if (!PHONE) { publishDock(); return; }
            makeCall();
        }

        // "Use phone here" from a waiting shell tab. Refused while a call is
        // live or ringing. Else: stop the registration watchdog, unregister
        // (Twilio stops ringing this tab), publish 'moved' and tell the
        // shell, which stops this frame once the other tab took the lock.
        var LIVE_PHASES = { dialing: 1, ringing: 1, incoming: 1, connected: 1, reconnecting: 1 };
        var TAKEOVER_UNREGISTER_WAIT_MS = 1500;

        function dockTakeover(m) {
            if (activeCall || pendingInbound || LIVE_PHASES[dockPhase]) { refuseRequest(m, 'call-live'); return; }
            if (movedAway) { publishDock(); return; }
            movedAway = true;
            clearRegisterRetry();
            var done = false;
            function finish() {
                if (done) return;
                done = true;
                dockPhase = '${escapeJs(ctcDock.PHASE_MOVED)}';
                regLog('Phone moved to another tab');
                publishDock();
                sendHeartbeat('moved');
                if (window.parent !== window) {
                    try {
                        window.parent.postMessage({ v: 1, type: '${escapeJs(ctcDock.PHONE_MOVED_MESSAGE)}' }, window.location.origin);
                    } catch (err) { console.error('[CTC] moved message failed', err); }
                }
            }
            var d = device;
            if (d && d.state === 'registered') {
                setTimeout(finish, TAKEOVER_UNREGISTER_WAIT_MS);
                try {
                    Promise.resolve(d.unregister()).then(finish, finish);
                } catch (err) { finish(); }
            } else {
                finish();
            }
        }

        if (dockBus) {
            dockBus.onmessage = function (e) {
                var m = e.data;
                if (!m || m.v !== 1) return;
                if (m.type === 'hello') {
                    publishDock();
                    return;
                }
                if (m.type !== 'request') return;
                var why = requestRefusal(m);
                if (why) {
                    console.warn('[CTC] Bus request dropped: ' + m.action + ' (' + why + ')');
                    return;
                }
                if (m.action === 'dial') {
                    dockDial(m);
                } else if (m.action === 'digits') {
                    if (activeCall && /^[0-9*#]$/.test(String(m.d))) appendDialDigit(String(m.d));
                } else if (m.action === 'hangup') {
                    hangUp();
                } else if (m.action === '${escapeJs(ctcDock.REQUEST_ANSWER)}') {
                    answerInbound();
                } else if (m.action === '${escapeJs(ctcDock.REQUEST_DECLINE)}') {
                    declineInbound();
                } else if (m.action === 'setInput') {
                    dockSetInput(m.id);
                } else if (m.action === 'setOutput') {
                    dockSetOutput(m.id);
                } else if (m.action === '${escapeJs(ctcDock.REQUEST_MARK_MISSED_SEEN)}') {
                    markMissedSeen();
                } else if (m.action === '${escapeJs(ctcDock.REQUEST_TAKEOVER)}') {
                    dockTakeover(m);
                } else if ((m.action === 'mute' || m.action === 'unmute')
                        && activeCall && activeCall.isMuted() !== (m.action === 'mute')) {
                    toggleMute();
                }
                // 'unlockAudio' is for the shell (a top-level gesture); the
                // shell forwards it here as UNLOCK_AUDIO_MESSAGE.
            };
            window.addEventListener('pagehide', function () {
                dockPhase = 'offline';
                publishDock();
            });
        }

        // --- Shell messages (postMessage, not the bus) ---
        // Only from the shell (window.parent), same origin.
        // SHELL_STATE_MESSAGE: { audioUnlocked, notify } for the snapshot.
        // UNLOCK_AUDIO_MESSAGE: a gesture in the shell; resume the audio
        // context Twilio plays the ringtone through (autoplay may have
        // suspended it) and play one silent sample to prime it.
        function unlockAudioHere() {
            try {
                var ac = (window.Twilio && Twilio.Device && Twilio.Device.audioContext) || null;
                if (!ac) return;
                if (ac.state === 'suspended' && typeof ac.resume === 'function') {
                    var p = ac.resume();
                    if (p && typeof p.catch === 'function') p.catch(function () { /* still blocked */ });
                }
                var src = ac.createBufferSource();
                src.buffer = ac.createBuffer(1, 1, 22050);
                src.connect(ac.destination);
                src.start(0);
            } catch (err) {
                console.log('[CTC] Audio unlock failed: ' + (err && err.message));
            }
        }

        window.addEventListener('message', function (ev) {
            var m = ev && ev.data;
            if (!m || m.v !== 1 || window.parent === window) return;
            if (ev.origin !== window.location.origin || ev.source !== window.parent) return;
            if (m.type === '${escapeJs(ctcDock.SHELL_STATE_MESSAGE)}') {
                shellAudioUnlocked = m.audioUnlocked === true;
                shellNotify = NOTIFY_STATES.hasOwnProperty(m.notify) ? String(m.notify) : 'unsupported';
                publishDock();
            } else if (m.type === '${escapeJs(ctcDock.UNLOCK_AUDIO_MESSAGE)}') {
                unlockAudioHere();
            }
        });

        // --- UI helpers ---
        // setStatus(text, pillClass)
        //   pillClass: '' (idle) | 'connecting' | 'ringing' | 'incoming' | 'connected' | 'ended' | 'error'
        //   Omitted pillClass (e.g. 'Fetching token') leaves the dock phase as is.
        function setStatus(text, pillClass) {
            statusEl.textContent = text;
            statusEl.className = 'status-pill' + (pillClass ? ' ' + pillClass : '');
            // After a takeover the phase stays 'moved' until this frame stops.
            if (pillClass !== undefined && !movedAway && DOCK_PHASE_BY_PILL.hasOwnProperty(pillClass)) {
                dockPhase = DOCK_PHASE_BY_PILL[pillClass];
                publishDock();
            }
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
                // Phase 4: hide the audio-settings gear during the call. Mid-call
                // device swap isn't reliably supported across browsers and the
                // overlay would obscure the in-call surface anyway. Re-enabled
                // when the call ends.
                var gearEl = document.getElementById('audioGear');
                if (gearEl) gearEl.classList.add('hidden');
                // If the audio overlay was open when the call started, close it
                // so the rep sees the in-call surface, not the settings panel.
                if (typeof closeAudioOverlay === 'function') closeAudioOverlay();
                // Phase 6: pull the account snapshot rollup for the entity we
                // just connected to. Fetched once per call; cached for the
                // call lifetime. Skipped when ENTITY_ID is empty (manual dial).
                if (typeof loadAccountSnapshot === 'function' && ENTITY_ID) {
                    loadAccountSnapshot(ENTITY_ID);
                }
            } else {
                idleActions.classList.remove('hidden');
                activeActions.classList.add('hidden');
                timerEl.classList.remove('visible');
                dialpadEl.classList.remove('hidden');
                var gearEl2 = document.getElementById('audioGear');
                if (gearEl2) gearEl2.classList.remove('hidden');
                // Phase 6: hide the snapshot card when not in-call.
                if (typeof hideAccountSnapshot === 'function') hideAccountSnapshot();
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
            // Docks run their own timer from startedAt; send it now.
            publishDock();
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

        // Manual-dial breadcrumb wiring. Shown via CSS when view-dial has
        // the .manual-dial class. One click restores the original pre-
        // loaded contact: clears typed digits + invokes the picker's
        // current selection (which is still the original contact since
        // SELECTED_CONTACT_ID was cleared by the rep's manual typing,
        // but currentContacts[0] is still the auto-selected one).
        var manualDialBreadcrumb = document.getElementById('manualDialBreadcrumb');
        var crumbEntityName      = document.getElementById('crumbEntityName');
        if (crumbEntityName) {
            crumbEntityName.textContent = ENTITY_NAME || 'contact';
        }
        function restoreEntityContext() {
            // Re-select the picker's first row (which is either the
            // synthetic "Company main" entry on Customer launches, or the
            // first contact otherwise). selectPickerPhone updates PHONE
            // via setDialedNumber({fromPicker:true}) so the .manual-dial
            // class is removed cleanly.
            var first = currentContacts && currentContacts[0];
            if (first && first.phones && first.phones.length) {
                var primary = first.phones.find(function (p) { return p.isPrimary; }) || first.phones[0];
                selectPickerPhone(first.contactId, primary.number, primary.type, first.name);
            } else {
                // No contacts to restore — just clear the dialed digits.
                // resetFresh:true ensures manuallyEdited drops so the
                // breadcrumb / .manual-dial visuals also clear.
                setDialedNumber('', { resetFresh: true });
            }
        }
        if (manualDialBreadcrumb) {
            manualDialBreadcrumb.addEventListener('click', restoreEntityContext);
        }

        // Tracks whether the current PHONE value was last set by the rep
        // typing/backspacing digits (true) vs. a context-setter like the
        // picker, search row, recents row, breadcrumb, or initial load
        // (false). The .manual-dial CSS class follows this flag — that
        // way every "loaded a contact phone" path clears manual-dial
        // uniformly, instead of relying on each caller to pass
        // opts.fromPicker correctly. Flipped true inside appendDialDigit
        // and backspaceDigit; flipped false by every context-setter via
        // opts.resetFresh.
        var manuallyEdited = false;

        function setDialedNumber(next, opts) {
            PHONE = normalizeDigits(next);
            phoneNumberEl.textContent = renderPhoneFallback();
            // Manual edits decouple SELECTED_CONTACT_ID from the picker so a
            // later picker change is treated as a fresh selection.
            // opts.fromPicker suppresses this when the picker itself is the
            // caller — it owns SELECTED_CONTACT_ID via selectPickerPhone.
            if (!(opts && opts.fromPicker)) {
                SELECTED_CONTACT_ID = '';
                dockContactName = '';
            }
            // opts.resetFresh marks this call as a context-load (picker,
            // search, recents, breadcrumb, initial). Three things happen:
            //   1. freshNumberOnNextDigit flips true so the next typed
            //      digit REPLACES the loaded phone (matches popup-load
            //      behavior).
            //   2. manuallyEdited flips false so .manual-dial drops.
            //   3. opts.manualEdit (passed by appendDialDigit/backspace)
            //      flips manuallyEdited true.
            if (opts && opts.resetFresh) {
                freshNumberOnNextDigit = true;
                manuallyEdited = false;
            }
            if (opts && opts.manualEdit) {
                manuallyEdited = true;
            }
            // Three view-dial display modes (.view-dial CSS hides the
            // legacy contact-phone slot by default — these classes
            // selectively unhide it):
            //   - default       → Selected Card visible, contact-phone hidden
            //   - .dialing      → no entity context (dashboard launch),
            //                     contact-phone shows typed digits
            //   - .manual-dial  → entity pre-loaded AND rep has typed/
            //                     backspaced digits; hide Selected Card /
            //                     compact-meta, show typed digits +
            //                     restore breadcrumb
            var viewDialEl = document.getElementById('viewDial');
            if (viewDialEl) {
                var dashboardDialing = !!PHONE && !ENTITY_ID && !SELECTED_CONTACT_ID;
                var manualOverride   = !!PHONE && !!ENTITY_ID && manuallyEdited;
                viewDialEl.classList.toggle('dialing', dashboardDialing);
                viewDialEl.classList.toggle('manual-dial', manualOverride);
                // Keep the breadcrumb's entity name current (ENTITY_NAME
                // changes when the rep picks a different entity via
                // Search/Recents).
                if (manualOverride) {
                    var crumbNameEl = document.getElementById('crumbEntityName');
                    if (crumbNameEl) crumbNameEl.textContent = ENTITY_NAME || 'contact';
                }
            }
            syncBackspaceVisibility();
            if (btnCall) btnCall.disabled = !PHONE;
            // Phase 5: re-evaluate the last-3-dialed shortcut. When PHONE
            // is non-empty (a contact is loaded), the shortcut hides.
            if (typeof renderLastDialed === 'function') renderLastDialed();
        }

        // Format the initial server-rendered phone number on load. Fix 3a: when
        // an entity was loaded but has no phone on file, surface the explicit
        // "no phone on file" copy + the Add-a-phone CTA via renderPhoneFallback.
        phoneNumberEl.textContent = renderPhoneFallback();

        function appendDialDigit(d) {
            if (!d) return;
            if (activeCall && typeof activeCall.sendDigits === 'function') {
                try { activeCall.sendDigits(d); } catch (err) { console.error('[CTC] sendDigits failed', err); }
                return;
            }
            if (freshNumberOnNextDigit) {
                freshNumberOnNextDigit = false;
                setDialedNumber(d, { manualEdit: true });
            } else {
                setDialedNumber((PHONE || '') + d, { manualEdit: true });
            }
        }

        function backspaceDigit() {
            if (activeCall) return;
            freshNumberOnNextDigit = false;
            var next = (PHONE || '').slice(0, -1);
            // Edge case: backspaced down to empty while in manual-dial
            // mode (entity pre-loaded) → restore the original contact
            // automatically instead of leaving a blank dial-empty state
            // with the breadcrumb still visible. Matches user-stated
            // expectation that clearing the override snaps back.
            if (!next && ENTITY_ID && currentContacts && currentContacts.length) {
                restoreEntityContext();
                return;
            }
            setDialedNumber(next, { manualEdit: !!next });
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

        // --- Token fetch ---
        // quiet: a background token refresh must not touch the status text
        // (it would overwrite an active call's status).
        // When the NetSuite session is gone the RESTlet answers with a non-OK
        // status, an HTML login page (often after a redirect) or a JSON
        // error. Each one rejects with a short reason ('HTTP 401',
        // 'not JSON (redirected)', 'error: ...') for the heartbeat lastError.
        function fetchToken(quiet) {
            if (!quiet) setStatus('Fetching token\\u2026');
            return fetch(TOKEN_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            })
            .then(function (res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.text().then(function (text) {
                    try {
                        return JSON.parse(text);
                    } catch (e) {
                        throw new Error('not JSON' + (res.redirected ? ' (redirected)' : ''));
                    }
                });
            })
            .then(function (data) {
                if (!data || typeof data !== 'object') throw new Error('empty response');
                if (data.error) {
                    var refused = new Error('error: ' + data.error);
                    // CTC is paused (not this user's access): see enterPaused.
                    if (data.paused === true) refused.paused = true;
                    throw refused;
                }
                if (!data.token) throw new Error('no token');
                return { token: data.token, phoneNumber: data.phoneNumber };
            });
        }

        var callerId = '';

        // --- Call logging ---
        // startedAt: epoch ms the call connected (callStartTime), or null.
        // The RESTlet prefers Twilio's start_time and checks this one.
        function logCallToNetSuite(callSid, duration, startedAt) {
            logCallPayload = JSON.stringify({
                action: 'logCall',
                callSid: callSid,
                startedAt: startedAt || null,
                entityId: ENTITY_ID,
                entityType: ENTITY_TYPE,
                contactId: SELECTED_CONTACT_ID,
                phone: PHONE,
                duration: duration,
                direction: callDirection,
                callerName: callDirection === 'inbound' && dockCaller ? dockCaller.name : ''
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
                    setDockLog('skipped', 'Call too brief to log');
                } else if (data.error) {
                    logStatusEl.textContent = 'Failed to log call';
                    logStatusEl.className = 'log-status error';
                    setDockLog('error', 'Failed to log call');
                } else {
                    setDockLog('saved', 'Phone Call saved', data.recordId);
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
                    setDockLog('saved', 'Call queued for logging');
                } else {
                    logStatusEl.textContent = 'Failed to log call';
                    logStatusEl.className = 'log-status error';
                    setDockLog('error', 'Failed to log call');
                }
            });
        }

        // sendBeacon fallback: if the page goes away (shell closed, phone
        // frame restarted) before the fetch resolves, queue the logCall
        // payload via the beacon API so it survives unload. pagehide: it
        // also fires for bfcache and mobile, and never blocks the unload.
        window.addEventListener('pagehide', function () {
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

            // Sprint 2 U3 (HIGH-11) — surface non-network failures so
            // the rep can tell genuine pending state apart from a
            // broken request. Pre-fix: any RESTlet 200-with-error or
            // 5xx was rescheduled silently; the rep saw an ambiguous
            // "transcript will be processed" message for 12 polls.
            // Post-fix: HTTP non-2xx + any data.error short-circuits
            // to a distinct error message and stops polling.
            // (Backticks intentionally avoided in this comment per
            // CLAUDE.md template-literal gotcha — the entire HTML
            // body is a template literal.)
            function surfaceTerminalError() {
                logStatusEl.textContent = 'Transcript check failed \\u2014 admin will retry';
                logStatusEl.className = 'log-status error';
            }

            function surfacePollCapPending() {
                // Distinct from in-flight pending — admin/scheduled-poll
                // will pick this up on next cycle. Not styled as error
                // because no failure occurred; the transcript may still
                // be processing on Twilio's side.
                logStatusEl.textContent = 'Transcript still pending \\u2014 check back later';
                logStatusEl.className = 'log-status';
            }

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
                .then(function (res) {
                    if (!res.ok) {
                        // HTTP 4xx/5xx — RESTlet rejected the request
                        // (auth, governance, bad params). Treat as
                        // terminal — retrying won't fix it client-side.
                        //
                        // Sprint 2 review #11 — use a sentinel property
                        // (ctcHttpStatus) instead of string-prefix
                        // sniffing on err.message. A future refactor
                        // that renames the thrown error string can't
                        // silently revert this terminal path.
                        var httpErr = new Error('Transcript check returned HTTP ' + res.status);
                        httpErr.ctcHttpStatus = res.status;
                        throw httpErr;
                    }
                    return res.json();
                })
                .then(function (data) {
                    // Sprint 2 U3 (HIGH-11) — explicit error check before
                    // the status switches. The RESTlet returns 200 with
                    // { error: '...' } for application-level errors
                    // (call ownership rejected, transcript fetch threw,
                    // etc.); without this check, the next 3 status
                    // branches all fall through to setTimeout and the
                    // failure stays invisible for 12 polls.
                    if (data && data.error) {
                        console.warn('[CTC] Transcript check error:', data.error);
                        surfaceTerminalError();
                        return;
                    }
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
                        surfacePollCapPending();
                        return;
                    }
                    setTimeout(poll, POLL_INTERVAL_MS);
                })
                .catch(function (err) {
                    console.warn('[CTC] Transcript fetch failed:', err && err.message);
                    // Sprint 2 review #11 — sentinel-property check
                    // replaces the fragile err.message prefix sniff.
                    // ctcHttpStatus is only set by the !res.ok throw
                    // above; genuine network/transient errors don't
                    // carry it and fall through to the retry-cap path.
                    if (err && typeof err.ctcHttpStatus === 'number') {
                        surfaceTerminalError();
                        return;
                    }
                    if (attempts >= POLL_MAX_ATTEMPTS) {
                        surfacePollCapPending();
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

            // Phase 4: device selects now live inside the audio-overlay (no
            // separate device-selectors wrapper to flip visible). The overlay
            // itself controls visibility — see openAudioOverlay/closeAudioOverlay.

            // Docks show the device lists; send the new ones.
            publishDock();
        }

        // --- Twilio Device setup ---
        // Token renewal: the access token has a 1 h ttl (lib/ctc_twilio_jwt.js)
        // and the phone mode shell keeps this page open for hours. Without a
        // refresh the device errors with AccessTokenExpired after an hour and
        // flips ready/error in a loop. The SDK emits tokenWillExpire
        // tokenRefreshMs before expiry; we fetch a new token and updateToken().
        var TOKEN_REFRESH_MS = 60000;
        // Token retry backoff: 5 s, 15 s, 30 s, then every 60 s. The phone
        // never gives up while the page is open (see Token recovery).
        var TOKEN_RETRY_DELAYS_MS = [5000, 15000, 30000, 60000];
        // Twilio codes for an expired / invalid JWT. 20101 (invalid token,
        // e.g. its API key was deleted after a key change) renews too.
        var TOKEN_EXPIRY_CODES = [20101, 20104, 31204, 31205, 31206];
        // True from the first token fetch until the refresh (with its
        // retries) settles. Blocks register() meanwhile.
        var tokenRefreshInFlight = false;
        // The token the device runs on (expiry check on page resume).
        var currentToken = '';
        // True from a failed token fetch until a token arrives again.
        var tokenFailing = false;
        // The RESTlet answered not_a_phone_user: permanent (phoneNotEnabled).
        var NOT_A_PHONE_USER = '${escapeJs(ctcDock.ERROR_NOT_A_PHONE_USER)}';
        var phoneDisabled = false;
        // A token arrived after failures during a live / ringing call: the
        // device is rebuilt right after the call ends (afterCallSettled).
        var sessionRebuildPending = false;
        var tokenRetryTimer = null;
        var tokenRetryAttempt = 0;
        var tokenRecoveryWatchStarted = false;
        // The mic permission nudge + device list fill runs on the FIRST
        // registration only; re-registers after a token update skip it.
        var audioPrimed = false;
        // Whether the current token lets Twilio ring this phone. An admin
        // can turn inbound on or off while the phone is open; the device
        // stays registered with the old grant, so a renewal that flips the
        // grant registers again (on) or unregisters (off).
        var incomingGranted = false;
        // The Twilio Client identity (NetSuite employee id) the device runs
        // as. Inbound calls ring this identity. If the NetSuite login changes
        // user, a renewed token carries a new identity and the device is
        // built again for it (see refreshDeviceToken).
        var deviceIdentity = '';
        // Set when the identity changed during a live or ringing call; the
        // rebuild runs right after the call ends (afterCallSettled).
        var identityRebuildPending = false;

        // The JWT payload, decoded (base64url). null when it is not a JWT.
        // The token is only decoded here, never trusted for anything else.
        function tokenPayload(token) {
            try {
                var part = String(token || '').split('.')[1] || '';
                part = part.replace(/-/g, '+').replace(/_/g, '/');
                while (part.length % 4) part += '=';
                var payload = JSON.parse(atob(part));
                return payload && typeof payload === 'object' ? payload : null;
            } catch (e) {
                return null;
            }
        }

        // Reads grants.voice.incoming.allow from the JWT payload.
        function tokenAllowsIncoming(token) {
            var payload = tokenPayload(token);
            var voice = payload && payload.grants && payload.grants.voice;
            return !!(voice && voice.incoming && voice.incoming.allow === true);
        }

        // Reads grants.identity from the JWT payload. '' when absent.
        function tokenIdentity(token) {
            var payload = tokenPayload(token);
            var id = payload && payload.grants && payload.grants.identity;
            return (typeof id === 'string' || typeof id === 'number') ? String(id) : '';
        }

        // --- Phone heartbeat ---
        // Tells NetSuite (RESTlet action phoneHeartbeat, record
        // customrecord_ctc_rep_presence) whether this phone can take calls,
        // so the Setup Wizard shows a stale phone before a caller hits it.
        // Sent on every registration state change (watchRegistration), after
        // a token refresh, every HEARTBEAT_INTERVAL_MS while the page is
        // open, and a final 'offline' beacon on pagehide. The server keeps
        // one row per rep and skips a write when nothing changed in 60 s.
        // A heartbeat failure never touches calling: errors are logged only.
        var HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
        // At most one heartbeat per HEARTBEAT_MIN_GAP_MS: a burst (page
        // load: registering, registered, token refresh) becomes one send
        // now and one queued send that reads the latest state.
        var HEARTBEAT_MIN_GAP_MS = 2000;
        var heartbeatStarted = false;
        var heartbeatLastSentAt = 0;
        var heartbeatTimer = null;
        // The last phone error, e.g. 'token: HTTP 401 at 01:02Z'. Queued:
        // sent with every heartbeat until one succeeds (with the session
        // gone the heartbeat itself fails).
        var heartbeatLastError = '';

        // Remember an error for the next heartbeat. kind: 'token' | 'register'.
        function notePhoneError(kind, detail) {
            var at = new Date().toISOString().slice(11, 16) + 'Z';
            heartbeatLastError = (kind + ': ' + String(detail || 'unknown') + ' at ' + at).slice(0, 200);
        }

        // Short browser label, e.g. 'Chrome 130 on macOS' (80 chars max).
        function heartbeatClient() {
            var ua = String((navigator && navigator.userAgent) || '');
            var marks = [['Edg/', 'Edge'], ['OPR/', 'Opera'], ['Firefox/', 'Firefox'],
                ['Chrome/', 'Chrome'], ['Version/', 'Safari']];
            var name = 'Browser';
            var version = '';
            for (var i = 0; i < marks.length; i++) {
                var at = ua.indexOf(marks[i][0]);
                if (at !== -1) {
                    name = marks[i][1];
                    version = ua.substr(at + marks[i][0].length).split('.')[0].split(' ')[0];
                    break;
                }
            }
            var os = ua.indexOf('Windows') !== -1 ? 'Windows'
                : ua.indexOf('Mac OS X') !== -1 ? 'macOS'
                : ua.indexOf('CrOS') !== -1 ? 'ChromeOS'
                : ua.indexOf('Linux') !== -1 ? 'Linux' : '';
            return (name + (version ? ' ' + version : '') + (os ? ' on ' + os : '')).slice(0, 80);
        }

        // The Twilio device state as the server knows it:
        // registered / unregistered / registering / offline.
        function heartbeatState() {
            if (!device) return 'unregistered';
            var s = device.state;
            if (s === 'registered' || s === 'registering' || s === 'unregistered') return s;
            return 'offline';
        }

        // identity: the token's Twilio identity, for comparison only. The
        // server stores whether it matches the session user and never uses
        // it as the employee.
        function heartbeatBody(state) {
            var body = {
                action: 'phoneHeartbeat',
                state: state,
                canReceive: state === 'registered' && !!incomingGranted,
                incomingGranted: !!incomingGranted,
                client: heartbeatClient(),
                identity: deviceIdentity || ''
            };
            if (heartbeatLastError) body.lastError = heartbeatLastError;
            return JSON.stringify(body);
        }

        // Coalesced: sends now, or queues one send for the end of the gap.
        // A queued send builds its body when it runs (the latest state wins).
        function sendHeartbeat(reason) {
            if (heartbeatTimer) return;
            var wait = heartbeatLastSentAt + HEARTBEAT_MIN_GAP_MS - Date.now();
            if (wait > 0) {
                heartbeatTimer = setTimeout(function () {
                    heartbeatTimer = null;
                    postHeartbeat(reason);
                }, wait);
                return;
            }
            postHeartbeat(reason);
        }

        function postHeartbeat(reason) {
            heartbeatLastSentAt = Date.now();
            var sentError = heartbeatLastError;
            try {
                fetch(TOKEN_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: heartbeatBody(heartbeatState())
                })
                .then(function (res) {
                    if (!res.ok) throw new Error('HTTP ' + res.status);
                    // A login page instead of JSON: the session is gone.
                    return res.json().catch(function () { throw new Error('not JSON'); });
                })
                .then(function (data) {
                    if (!data || data.error) throw new Error((data && data.error) || 'empty response');
                    // Delivered: drop the queued error unless a newer one came.
                    if (sentError && heartbeatLastError === sentError) heartbeatLastError = '';
                })
                .catch(function (err) {
                    console.log('[CTC] Heartbeat failed (' + reason + '): ' + (err && err.message));
                });
            } catch (err) {
                console.log('[CTC] Heartbeat failed (' + reason + '): ' + (err && err.message));
            }
        }

        // Installed once per page (not per device).
        function startHeartbeat() {
            if (heartbeatStarted) return;
            heartbeatStarted = true;
            setInterval(function () { sendHeartbeat('interval'); }, HEARTBEAT_INTERVAL_MS);
            window.addEventListener('pagehide', function () {
                try {
                    if (navigator.sendBeacon) {
                        navigator.sendBeacon(TOKEN_URL,
                            new Blob([heartbeatBody('offline')], { type: 'application/json' }));
                    }
                } catch (err) {
                    console.log('[CTC] Heartbeat beacon failed: ' + (err && err.message));
                }
            });
            // Back from the back-forward cache: the phone is open again.
            window.addEventListener('pageshow', function (e) {
                if (e && e.persisted) sendHeartbeat('page restored');
            });
        }

        // --- Registration watchdog ---
        // Inbound calls ring only a REGISTERED device. The signaling socket
        // can drop (sleep, network change, background-tab throttling) and
        // leave the phone unregistered: outbound still works, inbound never
        // rings. While the token grants incoming, this re-registers:
        //   - on 'unregistered' (and device errors that leave it unregistered):
        //     retry after REGISTER_RETRY_DELAYS_MS (2 s, 5 s, 15 s, 30 s,
        //     then every 60 s), one timer at a time;
        //   - on visibilitychange (visible), online and focus: try now;
        //   - every REGISTER_WATCH_MS: try when no retry timer is pending.
        // Never while a call is live or ringing, or a token refresh is in
        // flight. One register() at a time, raced against a 20 s timeout
        // (REGISTER_TIMEOUT_MS): a timeout frees the slot and schedules a
        // retry; if the device is still stuck in 'registering' at that retry
        // it is rebuilt with a fresh token. A token-expiry failure goes
        // through refreshDeviceToken(true). Only while the token grants
        // incoming: an outbound-only phone never registers.
        var REGISTER_RETRY_DELAYS_MS = [2000, 5000, 15000, 30000, 60000];
        var REGISTER_WATCH_MS = 60000;
        var REGISTER_TIMEOUT_MS = 20000;
        var registerInFlight = false;
        var registerRetryTimer = null;
        var registerAttempt = 0;
        var registrationWatchStarted = false;
        // A register() timed out while the SDK still says 'registering'.
        var registerStuck = false;

        function regLog(msg) {
            console.log('[CTC] ' + msg + ' @ ' + new Date().toISOString());
        }

        function registrationWatched() {
            return !!device && incomingGranted && !movedAway && !phoneDisabled && !ctcPaused;
        }

        function clearRegisterRetry() {
            if (registerRetryTimer) {
                clearTimeout(registerRetryTimer);
                registerRetryTimer = null;
            }
        }

        function scheduleRegisterRetry(reason) {
            if (registerRetryTimer || !registrationWatched()) return;
            var delay = REGISTER_RETRY_DELAYS_MS[Math.min(registerAttempt, REGISTER_RETRY_DELAYS_MS.length - 1)];
            registerAttempt++;
            regLog('Registration retry in ' + (delay / 1000) + ' s (' + reason + ')');
            registerRetryTimer = setTimeout(function () {
                registerRetryTimer = null;
                ensureRegistered('retry ' + registerAttempt);
            }, delay);
        }

        function ensureRegistered(reason) {
            if (!registrationWatched()) return;
            if (registerInFlight || device.state === 'registered') return;
            if (activeCall || pendingInbound || tokenRefreshInFlight) return;
            if (device.state !== 'unregistered') {
                // Still 'registering' after our register() timed out: the
                // SDK refuses a second register() now. Start over with a
                // fresh token and device (rebuild, as after a session loss).
                if (registerStuck) {
                    registerStuck = false;
                    regLog('Registration stuck (' + reason + '); rebuilding the phone');
                    sessionRebuildPending = true;
                    refreshDeviceToken(false);
                }
                return;
            }
            clearRegisterRetry();
            registerInFlight = true;
            var d = device;
            var timedOut = false;
            regLog('Registering (' + reason + ')');
            var p;
            try { p = d.register(); } catch (err) { p = Promise.reject(err); }
            var timer = setTimeout(function () {
                if (d !== device || !registerInFlight) return;
                timedOut = true;
                registerInFlight = false;
                registerStuck = d.state === 'registering';
                regLog('Register timed out after ' + (REGISTER_TIMEOUT_MS / 1000) + ' s');
                notePhoneError('register', 'timeout');
                setPhoneError('network', 0, 'register timed out');
                scheduleRegisterRetry('register timeout');
            }, REGISTER_TIMEOUT_MS);
            Promise.resolve(p).then(function () {
                clearTimeout(timer);
                if (d === device && !timedOut) registerInFlight = false;
            }, function (err) {
                clearTimeout(timer);
                if (d !== device || timedOut) return;
                registerInFlight = false;
                regLog('Register failed: ' + (err && (err.code || err.message)));
                notePhoneError('register', err && (err.code || err.message));
                if (isTokenExpiryError(err)) {
                    renewExpiredToken(err.code);
                    return;
                }
                scheduleRegisterRetry('register failed');
            });
        }

        // Registration listeners for one device instance. initDevice calls
        // this for every new device; destroy() drops the old device's
        // listeners, and the d !== device guard ignores any late event.
        function watchRegistration(d) {
            d.on('registering', function () {
                if (d !== device) return;
                regLog('Registration state: registering');
                publishDock();
                sendHeartbeat('registering');
            });
            d.on('registered', function () {
                if (d !== device) return;
                registerInFlight = false;
                registerStuck = false;
                registerAttempt = 0;
                clearRegisterRetry();
                regLog('Registration state: registered');
                publishDock();
                sendHeartbeat('registered');
            });
            d.on('unregistered', function () {
                if (d !== device) return;
                registerInFlight = false;
                registerStuck = false;
                regLog('Registration state: unregistered');
                publishDock();
                sendHeartbeat('unregistered');
                // Our own grant-off unregister clears incomingGranted first,
                // so scheduleRegisterRetry does nothing then.
                scheduleRegisterRetry('unregistered');
            });
            d.on('error', function (err) {
                if (d !== device) return;
                regLog('Device error ' + (err && err.code) + ' (state ' + d.state + ')');
                if (isTokenExpiryError(err)) return; // the main error handler renews
                if (d.state === 'unregistered') {
                    registerInFlight = false;
                    scheduleRegisterRetry('device error');
                }
            });
        }

        // Page-level triggers, installed once (not per device).
        function startRegistrationWatch() {
            if (registrationWatchStarted) return;
            registrationWatchStarted = true;
            document.addEventListener('visibilitychange', function () {
                if (document.visibilityState === 'visible') ensureRegistered('page visible');
            });
            window.addEventListener('online', function () { ensureRegistered('back online'); });
            window.addEventListener('focus', function () { ensureRegistered('window focus'); });
            setInterval(function () {
                if (!registerRetryTimer) ensureRegistered('watchdog');
            }, REGISTER_WATCH_MS);
        }

        // A call ended (any direction or outcome). Runs a rebuild deferred
        // by an identity change, else re-registers if the phone dropped
        // its registration during the call.
        function afterCallSettled() {
            setTimeout(function () {
                if (activeCall || pendingInbound) return;
                // Paused during the call: stop ringing now that it ended.
                if (ctcPaused) {
                    pausedIdle();
                    return;
                }
                if (identityRebuildPending || sessionRebuildPending) {
                    refreshDeviceToken(false);
                    return;
                }
                ensureRegistered('call ended');
            }, 0);
        }

        // Replaces the device with a new one for a new token (identity
        // change). Only with no live or ringing call.
        function rebuildDevice(token, reason) {
            regLog('Rebuilding the phone: ' + reason);
            var old = device;
            device = null;
            clearRegisterRetry();
            registerInFlight = false;
            registerStuck = false;
            registerAttempt = 0;
            identityRebuildPending = false;
            sessionRebuildPending = false;
            try { if (old) old.destroy(); } catch (err) { console.error('[CTC] destroy failed', err); }
            // The new device has its own audio helper: fill its lists again.
            audioPrimed = false;
            initDevice(token);
        }

        // On: the caller (refreshDeviceToken) registers next through
        // ensureRegistered. Off: unregister, so Twilio stops ringing it.
        function applyIncomingGrant(allow) {
            if (allow === incomingGranted) return;
            incomingGranted = allow;
            if (!device) return;
            console.log('[CTC] Incoming grant changed to ' + allow + '; updating registration');
            if (allow) return;
            clearRegisterRetry();
            if (device.state !== 'registered') return;
            try {
                Promise.resolve(device.unregister()).catch(function (err) {
                    console.error('[CTC] Unregister failed:', err && err.message);
                });
            } catch (err) {
                console.error('[CTC] Unregister failed:', err && err.message);
            }
        }

        function isTokenExpiryError(err) {
            return !!err && TOKEN_EXPIRY_CODES.indexOf(Number(err.code)) !== -1;
        }

        // A token Twilio refused (TOKEN_EXPIRY_CODES): fetch a new one at
        // once. A refusal again within EXPIRY_RENEW_RESET_MS (e.g. 20101
        // while an old API key is still in use) waits like a failed fetch:
        // 5 s, 15 s, 30 s, then every 60 s.
        var EXPIRY_RENEW_RESET_MS = 5 * 60 * 1000;
        var expiryRenewAttempt = 0;
        var expiryRenewAt = 0;
        var expiryRenewTimer = null;
        function renewExpiredToken(code) {
            // One renewal at a time: the SDK reports one refusal through
            // several listeners (device error, register() rejection).
            if (expiryRenewTimer || tokenRefreshInFlight || phoneDisabled || ctcPaused) return;
            var now = Date.now();
            if (now - expiryRenewAt > EXPIRY_RENEW_RESET_MS) expiryRenewAttempt = 0;
            expiryRenewAt = now;
            var delay = expiryRenewAttempt === 0 ? 0
                : TOKEN_RETRY_DELAYS_MS[Math.min(expiryRenewAttempt - 1, TOKEN_RETRY_DELAYS_MS.length - 1)];
            expiryRenewAttempt++;
            if (!delay) {
                refreshDeviceToken(true);
                return;
            }
            regLog('Token refused again (code ' + code + '); new token in ' + (delay / 1000) + ' s');
            expiryRenewTimer = setTimeout(function () {
                expiryRenewTimer = null;
                refreshDeviceToken(true);
            }, delay);
        }

        // --- Pause (config custrecord_ctc_active F) ---
        // The admin paused Click-to-Call. Found by the 60 s sessionPing
        // (active false) or a token answer marked paused. The phone stops
        // ringing (unregister) and refuses new calls; a live or ringing call
        // is left to finish and the unregister runs after it
        // (afterCallSettled). Snapshot error kind 'paused'. Not permanent:
        // when sessionPing says active again, the phone fetches a token and
        // registers again, with no reload.
        var ctcPaused = false;
        var PAUSED_MESSAGE = 'Calling is paused by your administrator';

        // Paused and no call: unregister and show the paused state.
        function pausedIdle() {
            if (device && device.state === 'registered') {
                try {
                    Promise.resolve(device.unregister()).catch(function () { /* already gone */ });
                } catch (err) { /* not registered */ }
            }
            clearError();
            setStatus('Calling paused', device ? '' : 'error');
            setButtons(false, false, false);
        }

        function enterPaused(reason) {
            clearTokenRetry();
            tokenRefreshInFlight = false;
            if (ctcPaused) return;
            ctcPaused = true;
            regLog('Calling paused by the administrator (' + reason + ')');
            clearRegisterRetry();
            if (expiryRenewTimer) {
                clearTimeout(expiryRenewTimer);
                expiryRenewTimer = null;
            }
            if (!activeCall && !pendingInbound) pausedIdle();
            setPhoneError('paused', 'ctc_paused', PAUSED_MESSAGE);
        }

        function leavePaused(reason) {
            if (!ctcPaused) return;
            ctcPaused = false;
            regLog('Calling resumed (' + reason + '); fetching a token');
            clearPhoneError(['paused']);
            if (device && !activeCall && !pendingInbound) deviceReady();
            // A fresh token (the old one may have ended while paused); the
            // renewal registers again when inbound is granted.
            refreshDeviceToken(false);
        }

        // sessionPing answer: active false pauses, true resumes; anything
        // else (an older RESTlet, a config read error) changes nothing.
        function applyActiveFlag(active, reason) {
            if (active === false) enterPaused(reason);
            else if (active === true) leavePaused(reason);
        }

        // --- Token recovery ---
        // A token fetch fails when the NetSuite session is gone (logout,
        // timeout). The phone never gives up while the page is open: it
        // retries after TOKEN_RETRY_DELAYS_MS (5 s, 15 s, 30 s, then every
        // 60 s) and at once on page visible, online and focus. While it
        // fails, the snapshot says canReceive false (amber hint) and the
        // heartbeat carries lastError. The first token after a failure
        // rebuilds the device (fresh session and identity) when no call is
        // live, else right after the call ends. A boot with no token at all
        // starts the device when the token comes.
        // expired: logged only (the token is already dead).
        function refreshDeviceToken(expired, attempt) {
            if (phoneDisabled || ctcPaused) return;
            attempt = attempt || 0;
            if (attempt === 0) {
                if (tokenRefreshInFlight) return;
                tokenRefreshInFlight = true;
            }
            tokenRetryAttempt = attempt;
            fetchToken(true)
                .then(function (result) {
                    var recovered = tokenFailing;
                    tokenFailing = false;
                    tokenRetryAttempt = 0;
                    clearPhoneError(['session', 'signed_out']);
                    // Every token answer carries the rep's caller ID (it can
                    // change while the phone is open): the next call uses it.
                    if (result.phoneNumber) callerId = result.phoneNumber;
                    if (!device) {
                        // The page never had a token (boot failed).
                        tokenRefreshInFlight = false;
                        regLog('Token fetch recovered; starting the phone');
                        clearError();
                        initDevice(result.token);
                        publishDock();
                        return;
                    }
                    // The NetSuite login changed user: the new token rings a
                    // different identity. Build the device again for it, now
                    // or right after the live / ringing call ends.
                    var newIdentity = tokenIdentity(result.token);
                    if (newIdentity && deviceIdentity && newIdentity !== deviceIdentity) {
                        tokenRefreshInFlight = false;
                        if (activeCall || pendingInbound) {
                            identityRebuildPending = true;
                            regLog('Phone user changed (' + deviceIdentity + ' to ' + newIdentity
                                + '); rebuild after this call');
                            publishDock();
                            return;
                        }
                        rebuildDevice(result.token, 'user changed (' + deviceIdentity + ' to ' + newIdentity + ')');
                        return;
                    }
                    identityRebuildPending = false;
                    // Back after failed fetches (the rep signed in again):
                    // register with the fresh session, never during a call.
                    if (recovered || sessionRebuildPending) {
                        if (!activeCall && !pendingInbound) {
                            tokenRefreshInFlight = false;
                            rebuildDevice(result.token, 'token fetch recovered');
                            publishDock();
                            return;
                        }
                        sessionRebuildPending = true;
                        regLog('Token fetch recovered during a call; rebuild after this call');
                    }
                    device.updateToken(result.token);
                    currentToken = result.token;
                    tokenRefreshInFlight = false;
                    console.log('[CTC] Token refreshed');
                    applyIncomingGrant(tokenAllowsIncoming(result.token));
                    sendHeartbeat('token refresh');
                    publishDock();
                    // Re-register only when it dropped (and the grant asks
                    // for it): the watchdog path, with its timeout and catch.
                    if (device.state === 'unregistered') ensureRegistered('token refresh');
                })
                .catch(function (err) {
                    tokenFailed(err, expired, attempt);
                });
        }

        // Every failed fetch: note it, show the amber hint, retry later.
        // tokenRefreshInFlight stays true until a token arrives.
        function tokenFailed(err, expired, attempt) {
            var detail = (err && err.message) || String(err);
            if (err && err.paused === true) {
                enterPaused('token refused: paused');
                return;
            }
            console.log('[CTC] Token refresh failed (attempt ' + (attempt + 1)
                + (expired ? ', token expired' : '') + '): ' + detail);
            notePhoneError('token', detail);
            if (detail === 'error: ' + NOT_A_PHONE_USER) {
                phoneNotEnabled();
                return;
            }
            var http = /^HTTP ([0-9]{3})/.exec(detail);
            // NetSuite said no (401 / 403, or its login page instead of
            // JSON): the rep is signed out and must sign in again. Other
            // failures (offline, a server error) stay 'session'.
            setPhoneError(isSignedOutDetail(detail) ? 'signed_out' : 'session',
                http ? Number(http[1]) : 0, 'token: ' + detail);
            if (!tokenFailing) {
                tokenFailing = true;
                publishDock();
                sendHeartbeat('token failed');
            }
            var delay = TOKEN_RETRY_DELAYS_MS[Math.min(attempt, TOKEN_RETRY_DELAYS_MS.length - 1)];
            clearTokenRetry();
            tokenRetryAttempt = attempt;
            tokenRetryTimer = setTimeout(function () {
                tokenRetryTimer = null;
                refreshDeviceToken(expired, attempt + 1);
            }, delay);
        }

        // The RESTlet refuses tokens for this user (not a rep, manager or
        // admin): permanent until the admin changes it. No more token
        // retries, no registration; the snapshot says error kind
        // 'not_enabled' and the shell releases the phone (PHONE_DISABLED_MESSAGE).
        // A live call is left to end by itself.
        function phoneNotEnabled() {
            clearTokenRetry();
            tokenRefreshInFlight = false;
            if (phoneDisabled) return;
            phoneDisabled = true;
            regLog('Phone is not enabled for this user; stopping');
            clearRegisterRetry();
            if (device && !activeCall && !pendingInbound && device.state === 'registered') {
                try {
                    Promise.resolve(device.unregister()).catch(function () { /* already gone */ });
                } catch (err) { /* not registered */ }
            }
            if (!activeCall && !pendingInbound) setStatus('Phone not enabled', 'error');
            setPhoneError('not_enabled', NOT_A_PHONE_USER, 'Phone is not enabled for your user');
            if (window.parent !== window) {
                try {
                    window.parent.postMessage({ v: 1, type: '${escapeJs(ctcDock.PHONE_DISABLED_MESSAGE)}' }, window.location.origin);
                } catch (err) { console.error('[CTC] disabled message failed', err); }
            }
        }

        function clearTokenRetry() {
            if (tokenRetryTimer) {
                clearTimeout(tokenRetryTimer);
                tokenRetryTimer = null;
            }
        }

        // A waiting retry runs now (page visible / online / focus).
        function retryTokenNow(reason) {
            if (!tokenRetryTimer) return;
            clearTokenRetry();
            regLog('Token retry now (' + reason + ')');
            refreshDeviceToken(false, tokenRetryAttempt + 1);
        }

        // Page-level triggers, installed once.
        function startTokenRecoveryWatch() {
            if (tokenRecoveryWatchStarted) return;
            tokenRecoveryWatchStarted = true;
            document.addEventListener('visibilitychange', function () {
                if (document.visibilityState === 'visible') {
                    retryTokenNow('page visible');
                    pingSession('page visible');
                }
            });
            window.addEventListener('online', function () {
                retryTokenNow('back online');
                pingSession('back online');
            });
            window.addEventListener('focus', function () { retryTokenNow('window focus'); });
            setInterval(function () { pingSession('interval'); }, SESSION_PING_MS);
        }

        // 'HTTP 401' / 'HTTP 403' / 'not JSON…' (a login page): signed out.
        function isSignedOutDetail(detail) {
            return /^HTTP 40[13]/.test(detail) || /^not JSON/.test(detail);
        }

        // --- Session watch ---
        // A token lasts an hour, so the token fetch alone finds a lost
        // NetSuite session (logout, idle timeout, a network change) up to an
        // hour late. Every SESSION_PING_MS, and at once when the page comes
        // back online or visible, the phone sends 'sessionPing' (no queries).
        // A 401 / 403 or a login page starts the token recovery loop, which
        // sets error kind 'signed_out' (the dock asks the rep to sign in)
        // and recovers by itself after the rep signs in. Offline or other
        // failures do nothing here.
        var SESSION_PING_MS = 60 * 1000;
        var sessionPingInFlight = false;
        function pingSession(reason) {
            if (phoneDisabled || tokenFailing || tokenRefreshInFlight || sessionPingInFlight) return;
            sessionPingInFlight = true;
            fetch(TOKEN_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'sessionPing' })
            })
            .then(function (res) {
                if (!res.ok) return { detail: 'HTTP ' + res.status };
                return res.json().then(function (b) { return { detail: '', body: b }; },
                    function () { return { detail: 'not JSON' }; });
            })
            .then(function (r) {
                sessionPingInFlight = false;
                var detail = r.detail;
                if (!detail) {
                    applyActiveFlag(r.body && r.body.active, 'session ping (' + reason + ')');
                    return;
                }
                if (!isSignedOutDetail(detail)) return;
                regLog('Session lost (' + reason + ': ' + detail + '); checking the token');
                refreshDeviceToken(false);
            })
            .catch(function () {
                sessionPingInFlight = false; // offline: the online event pings again
            });
        }

        // Seconds-since-epoch exp of the JWT, as ms; 0 when unknown.
        function tokenExpiresAt(token) {
            var payload = tokenPayload(token);
            return payload && typeof payload.exp === 'number' ? payload.exp * 1000 : 0;
        }

        // The page slept (frozen tab, laptop lid): tokenWillExpire may have
        // been missed. Renew when the token ends within the refresh window
        // plus 30 s, or already ended.
        function checkTokenExpiry(reason) {
            if (!device || !currentToken) return;
            var exp = tokenExpiresAt(currentToken);
            if (!exp || exp - Date.now() > TOKEN_REFRESH_MS + 30000) return;
            regLog('Token ends soon (' + reason + '); refreshing');
            refreshDeviceToken(exp <= Date.now());
        }

        // The device is usable: show Ready (never over a live or ringing
        // call) and, once per device, nudge the mic permission and fill the
        // device lists. Runs on 'registered', and at start for an
        // outbound-only phone (no incoming grant: it never registers).
        function deviceReady() {
            if (!activeCall && !pendingInbound) {
                setStatus('Ready to call', '');
                setButtons(true, false, false);
                setCallView('idle');
            }
            if (audioPrimed) return;
            audioPrimed = true;
            // Phase 4: explicitly request mic permission BEFORE populating
            // the device list. macOS browsers (Chrome / Brave / Safari)
            // return empty label strings for input devices until the user
            // has granted microphone access via getUserMedia. Twilio's
            // internal permission flow runs later in the call lifecycle,
            // so without this nudge the Mic dropdown shows blank options
            // even when the hardware is available.
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(function (stream) {
                    // Discard the stream — we only needed the permission grant.
                    stream.getTracks().forEach(function (t) { t.stop(); });
                    clearPhoneError(['mic']);
                })
                .catch(function (err) {
                    // Permission denied: labels will be blank, calls have no mic.
                    if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
                        setPhoneError('mic', 0, 'microphone: ' + err.name);
                    }
                })
                .finally(function () {
                    populateDevices();
                    if (typeof applyAudioDefaults === 'function') applyAudioDefaults();
                });
        }

        function initDevice(token) {
            incomingGranted = tokenAllowsIncoming(token);
            deviceIdentity = tokenIdentity(token);
            currentToken = token;
            regLog('Phone starting as identity ' + (deviceIdentity || '(unknown)')
                + (incomingGranted ? ' with inbound' : ' (outbound only)'));
            device = new Twilio.Device(token, {
                codecPreferences: ['opus', 'pcmu'],
                // 1 = debug (shell URL debug=1), 3 = warnings only.
                logLevel: DEBUG ? 1 : 3,
                tokenRefreshMs: TOKEN_REFRESH_MS,
                // Inbound spike: one call at a time. A second inbound call
                // while busy is not offered to this phone. The SDK's own
                // incoming ringtone plays (default sounds).
                allowIncomingWhileBusy: false,
                // Signaling fallback: try the nearest of these edges and
                // fail over to the next; a call keeps trying to reconnect
                // its signaling for up to 30 s (needs an edge list).
                edge: ['ashburn', 'umatilla'],
                maxCallSignalingTimeoutMs: 30000
            });

            // Fires only when the token grants incoming (config
            // custrecord_ctc_inbound_enabled).
            device.on('incoming', function (call) {
                onIncoming(call);
            });

            device.on('tokenWillExpire', function () {
                console.log('[CTC] Token will expire; refreshing');
                refreshDeviceToken(false);
            });

            device.on('registered', function () {
                console.log('[CTC] Device registered');
                clearPhoneError(['network', 'twilio']);
                deviceReady();
            });

            device.on('error', function (err) {
                // An expired token is recoverable: renew it instead of
                // showing the Error pill.
                if (isTokenExpiryError(err)) {
                    console.log('[CTC] Token expired or invalid (code ' + err.code + '); renewing');
                    renewExpiredToken(err.code);
                    return;
                }
                var code = err && err.code;
                var message = (err && err.message) || 'unknown';
                setPhoneError(errorKindForCode(code), code, message);
                // A device error during a live or ringing call (signaling
                // blip, a failed register) must not end the call's view:
                // log it and show it as the snapshot error only.
                if (activeCall || pendingInbound) {
                    console.warn('[CTC] Device error during a call (call kept): ' + code + ' ' + message);
                    return;
                }
                console.error('[CTC] Device error:', message);
                showError('Device error: ' + message);
                setStatus('Error', 'error');
                setButtons(true, false, false);
            });

            device.audio.on('deviceChange', function () {
                populateDevices();
                if (typeof applyAudioDefaults === 'function') applyAudioDefaults();
            });

            watchRegistration(device);
            startRegistrationWatch();
            if (incomingGranted) ensureRegistered('phone start');
            else deviceReady();
            startHeartbeat();
            startLifecycleWatch();
        }

        // --- Page Lifecycle + mic permission (installed once) ---
        // freeze: the browser is about to freeze this page (background tab);
        // no timers run, so tell NetSuite now (beacon, state 'frozen').
        // resume: back from frozen. Re-register, renew a token that ended
        // or ends soon, and send a heartbeat.
        // Microphone permission: 'denied' sets the mic error; any other
        // state clears it.
        var lifecycleWatchStarted = false;

        function startLifecycleWatch() {
            if (lifecycleWatchStarted) return;
            lifecycleWatchStarted = true;
            document.addEventListener('freeze', function () {
                try {
                    if (navigator.sendBeacon) {
                        navigator.sendBeacon(TOKEN_URL,
                            new Blob([heartbeatBody('frozen')], { type: 'application/json' }));
                    }
                } catch (err) {
                    console.log('[CTC] Frozen beacon failed: ' + (err && err.message));
                }
            });
            document.addEventListener('resume', function () {
                regLog('Page resumed');
                ensureRegistered('page resumed');
                checkTokenExpiry('page resumed');
                sendHeartbeat('resume');
            });
            try {
                if (navigator.permissions && typeof navigator.permissions.query === 'function') {
                    navigator.permissions.query({ name: 'microphone' }).then(function (st) {
                        function apply() {
                            if (st.state === 'denied') setPhoneError('mic', 0, 'microphone permission denied');
                            else clearPhoneError(['mic']);
                        }
                        apply();
                        st.onchange = apply;
                    }).catch(function () { /* not supported in this browser */ });
                }
            } catch (err) { /* permissions API missing */ }
        }

        // --- Audio device change handlers ---
        // applyInputDevice / applyOutputDevice are shared by the overlay
        // selects and the dock bus (dockSetInput / dockSetOutput). A
        // successful set publishes a snapshot so docks see the new choice.
        function applyInputDevice(id) {
            if (!device) return;
            device.audio.setInputDevice(id)
                .then(function () { console.log('[CTC] Input device set'); publishDock(); })
                .catch(function (err) { showError('Mic error: ' + err.message); });
        }

        function applyOutputDevice(id) {
            if (!device) return;
            device.audio.speakerDevices.set(id)
                .then(function () { console.log('[CTC] Output device set'); publishDock(); })
                .catch(function (err) { showError('Speaker error: ' + err.message); });
        }

        inputSelect.addEventListener('change', function () {
            applyInputDevice(this.value);
        });

        outputSelect.addEventListener('change', function () {
            applyOutputDevice(this.value);
        });

        // --- Call management ---
        // Accept / disconnect / error for a call in either direction. After
        // accept both directions share the same in-call path (timer, mute,
        // hangup, after-call log).
        function wireCall(call) {
            call.on('accept', function () {
                console.log('[CTC] Call accepted');
                clearPhoneError(['network', 'twilio', 'mic']);
                setStatus('Connected', 'connected');
                setButtons(false, true, true);
                startTimer();
            });

            // Media or signaling dropped mid-call; Twilio tries to restore
            // it (signaling for up to maxCallSignalingTimeoutMs). The call,
            // timer and mute stay; only the phase changes.
            call.on('reconnecting', function (err) {
                if (call !== activeCall) return;
                console.warn('[CTC] Call reconnecting: ' + ((err && (err.code || err.message)) || ''));
                setStatus('Reconnecting\\u2026', 'reconnecting');
            });
            call.on('reconnected', function () {
                if (call !== activeCall) return;
                console.log('[CTC] Call reconnected');
                resetCallWarnings();
                setStatus('Connected', 'connected');
            });

            // Call quality warnings -> snapshot callWarning.
            call.on('warning', function (name) {
                if (call !== activeCall) return;
                noteCallWarning(name, true);
            });
            call.on('warning-cleared', function (name) {
                if (call !== activeCall) return;
                noteCallWarning(name, false);
            });

            call.on('disconnect', function () {
                console.log('[CTC] Call disconnected');
                resetCallWarnings();
                if (pendingInbound === call) pendingInbound = null;
                var callSid = call.parameters ? call.parameters.CallSid : '';
                var duration = callStartTime ? Math.floor((Date.now() - callStartTime) / 1000) : 0;
                var startedAt = callStartTime;
                activeCall = null;
                afterCallSettled();
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
                    setDockLog('skipped', 'Call too brief to log');
                    return;
                }
                logCallToNetSuite(callSid, duration, startedAt);
            });

            call.on('error', function (err) {
                console.error('[CTC] Call error:', err.message);
                showError('Call error: ' + err.message);
                setPhoneError(errorKindForCode(err && err.code), err && err.code, err && err.message);
                resetCallWarnings();
                if (pendingInbound === call) pendingInbound = null;
                activeCall = null;
                afterCallSettled();
                resetTimer();
                setStatus('Error', 'error');
                setButtons(true, false, false);
                setCallView('idle');
                btnMute.classList.remove('active');
                if (muteLabel) muteLabel.textContent = 'Mute';
            });
        }

        function makeCall() {
            if (!device || activeCall || pendingInbound || ctcPaused) return;
            clearError();
            dockLastLog = null;
            callDirection = 'outbound';
            dockCaller = null;
            setStatus('Connecting\\u2026', 'connecting');
            setButtons(false, false, false);
            setCallView('active');
            // Release our diagnostic mic stream before Twilio claims it.
            // The meter restarts automatically if the rep re-opens the gear
            // after the call ends.
            if (typeof stopMicMeter === 'function') stopMicMeter();

            device.connect({ params: { To: dialableFormat(PHONE), CallerId: callerId } }).then(function (call) {
                activeCall = call;

                call.on('ringing', function () {
                    console.log('[CTC] Ringing');
                    setStatus('Ringing\\u2026', 'ringing');
                    setButtons(false, false, true);
                });

                wireCall(call);

                call.on('cancel', function () {
                    console.log('[CTC] Call cancelled');
                    resetCallWarnings();
                    activeCall = null;
                    afterCallSettled();
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
            publishDock();
        }

        function hangUp() {
            if (activeCall) {
                activeCall.disconnect();
            } else if (pendingInbound) {
                declineInbound();
            } else if (device) {
                device.disconnectAll();
            }
        }

        // --- Inbound (spike) ---
        // Twilio rings this phone's identity (Studio "Connect Call To" the
        // client). One pending call; the dock shows Answer / Decline over
        // the bus. Answer runs the same in-call path as outbound (wireCall).
        function callerLabel() {
            return (dockCaller && (dockCaller.name || dockCaller.number)) || 'unknown number';
        }

        function inboundEnded(status, message) {
            afterCallSettled();
            setStatus('Ready to call', '');
            setButtons(true, false, false);
            setCallView('idle');
            setDockLog(status, message);
        }

        function onIncoming(call) {
            if (activeCall || pendingInbound) {
                try { call.reject(); } catch (err) { console.error('[CTC] reject failed', err); }
                return;
            }
            var from = String((call.parameters && call.parameters.From) || '');
            console.log('[CTC] Incoming call');
            pendingInbound = call;
            callDirection = 'inbound';
            dockCaller = { number: formatPhone(from) || from, name: '', entityId: '', entityType: '' };
            dockLastLog = null;
            clearError();
            ENTITY_ID = '';
            ENTITY_NAME = '';
            ENTITY_TYPE = '';
            window.__CTC_ENTITY_TYPE__ = '';
            SELECTED_CONTACT_ID = '';
            dockContactName = '';
            setDialedNumber(from, { resetFresh: true, fromPicker: true });

            // Caller hung up, or Studio's ring timeout ended the dial.
            call.on('cancel', function () {
                if (pendingInbound !== call) return;
                console.log('[CTC] Incoming call cancelled');
                pendingInbound = null;
                // Unanswered: counts in snapshot missedUnseen until a dock
                // sends markMissedSeen (inboundEnded publishes it).
                addMissedCall(dockCaller);
                inboundEnded('missed', 'Missed call from ' + callerLabel());
            });
            call.on('reject', function () {
                if (pendingInbound !== call) return;
                pendingInbound = null;
                inboundEnded('skipped', 'Declined call from ' + callerLabel());
            });
            wireCall(call);

            setStatus('Incoming call', 'incoming');
            setButtons(false, false, false);
            lookupCaller(from, call);
        }

        function answerInbound() {
            if (!pendingInbound || activeCall) { publishDock(); return; }
            var call = pendingInbound;
            pendingInbound = null;
            activeCall = call;
            setStatus('Answering\\u2026');
            setButtons(false, false, true);
            setCallView('active');
            if (typeof stopMicMeter === 'function') stopMicMeter();
            try {
                call.accept();
            } catch (err) {
                console.error('[CTC] accept failed', err);
                activeCall = null;
                showError('Answer failed: ' + (err && err.message));
                inboundEnded('error', 'Could not answer the call');
                return;
            }
        }

        function declineInbound() {
            if (!pendingInbound) { publishDock(); return; }
            var call = pendingInbound;
            pendingInbound = null;
            try { call.reject(); } catch (err) { console.error('[CTC] reject failed', err); }
            inboundEnded('skipped', 'Declined call from ' + callerLabel());
        }

        // Match the caller to a record (RESTlet lookupCaller). The answer
        // may land while ringing or after Answer; it is dropped when that
        // call is already gone.
        function lookupCaller(from, call) {
            if (!from) return;
            fetch(TOKEN_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'lookupCaller', phone: from })
            })
            .then(function (res) { return res.json(); })
            .then(function (data) {
                var m = data && data.match;
                if (!m || (call !== pendingInbound && call !== activeCall)) return;
                ENTITY_ID = String(m.entityId || '');
                ENTITY_NAME = String(m.name || '');
                ENTITY_TYPE = String(m.entityType || '');
                window.__CTC_ENTITY_TYPE__ = ENTITY_TYPE;
                SELECTED_CONTACT_ID = String(m.contactId || '');
                dockContactName = String(m.contactName || '');
                dockCaller = {
                    number: dockCaller ? dockCaller.number : from,
                    name: ENTITY_NAME,
                    entityId: ENTITY_ID,
                    entityType: ENTITY_TYPE
                };
                publishDock();
                if (call === activeCall) {
                    if (typeof loadAccountSnapshot === 'function' && ENTITY_TYPE !== 'contact') loadAccountSnapshot(ENTITY_ID);
                }
            })
            .catch(function (err) { console.log('[CTC] Caller lookup failed: ' + (err && err.message)); });
        }

        // --- Iteration B Phase 2: Tab switching + Search tab ---
        // The popup renders two sibling views inside .phone-scroll: #viewDial
        // (existing Dial UI) and #viewSearch (Phase 2 Search). The tab strip
        // in .phone-top toggles .hidden on each. Recents stays inert until
        // Phase 5.
        var tabDial    = document.getElementById('tabDial');
        var tabSearch  = document.getElementById('tabSearch');
        var tabRecents = document.getElementById('tabRecents');
        var viewDial   = document.getElementById('viewDial');
        var viewSearch = document.getElementById('viewSearch');
        var searchInput   = document.getElementById('searchInput');
        var searchChips   = document.getElementById('searchChips');
        var searchResults = document.getElementById('searchResults');
        var searchEmpty   = document.getElementById('searchEmpty');
        var searchLoading = document.getElementById('searchLoading');
        var searchSectLabel = document.getElementById('searchSectLabel');
        var searchSectMeta  = document.getElementById('searchSectMeta');
        var cntAll      = document.getElementById('cnt-all');
        var cntCustomer = document.getElementById('cnt-customer');
        var cntProspect = document.getElementById('cnt-prospect');
        var cntLead     = document.getElementById('cnt-lead');

        // Local cache so we don't re-fetch the suggested book every time
        // the rep flips back to Search. Refreshed by typing a query.
        var suggestedRows = null;
        var activeFilter = '';
        var lastQuery = '';
        var debounceTimer = null;

        function setActiveTab(which) {
            var dialActive    = which === 'dial';
            var searchActive  = which === 'search';
            var recentsActive = which === 'recents';
            tabDial.classList.toggle('active', dialActive);
            tabDial.setAttribute('aria-selected', dialActive ? 'true' : 'false');
            tabSearch.classList.toggle('active', searchActive);
            tabSearch.setAttribute('aria-selected', searchActive ? 'true' : 'false');
            tabRecents.classList.toggle('active', recentsActive);
            tabRecents.setAttribute('aria-selected', recentsActive ? 'true' : 'false');
            viewDial.classList.toggle('hidden', !dialActive);
            viewSearch.classList.toggle('hidden', !searchActive);
            // Phase 5: Recents view sibling
            var viewRecentsEl = document.getElementById('viewRecents');
            if (viewRecentsEl) viewRecentsEl.classList.toggle('hidden', !recentsActive);
            if (searchActive) {
                if (suggestedRows === null) loadSuggested();
                setTimeout(function () { if (searchInput) searchInput.focus(); }, 0);
            }
            if (recentsActive) {
                if (typeof loadRecents === 'function' && recentRows === null) loadRecents();
            }
        }

        function badgeClassFor(type) {
            if (type === 'lead') return 'badge lead';
            if (type === 'prospect') return 'badge prospect';
            return 'badge customer';
        }
        function badgeLabelFor(type) {
            if (type === 'lead') return 'Lead';
            if (type === 'prospect') return 'Prospect';
            return 'Customer';
        }
        function swatchClassFor(type) {
            if (type === 'lead') return 'swatch lead';
            if (type === 'prospect') return 'swatch prospect';
            return 'swatch';
        }
        function initialsOf(name) {
            var parts = String(name || '').trim().split(/[^A-Za-z0-9]+/).slice(0, 2);
            return parts.map(function (p) { return p.charAt(0).toUpperCase(); }).join('') || '·';
        }

        function clearChildren(el) {
            // Safer than innerHTML='' — and matches the codebase's no-untrusted-HTML stance.
            while (el && el.firstChild) el.removeChild(el.firstChild);
        }

        function renderRows(rows) {
            clearChildren(searchResults);
            if (!rows || !rows.length) {
                searchEmpty.classList.remove('hidden');
                return;
            }
            searchEmpty.classList.add('hidden');
            rows.forEach(function (row) {
                var rowEl = document.createElement('div');
                rowEl.className = 'row';
                rowEl.setAttribute('role', 'button');
                rowEl.tabIndex = 0;

                var sw = document.createElement('div');
                sw.className = swatchClassFor(row.type);
                sw.textContent = initialsOf(row.companyName);
                rowEl.appendChild(sw);

                var meta = document.createElement('div');
                meta.className = 'meta';
                var name = document.createElement('div');
                name.className = 'name';
                name.textContent = row.companyName;
                var sub = document.createElement('div');
                sub.className = 'sub';
                sub.textContent = (row.contactName ? row.contactName + ' · ' : '') + (row.phone || 'no phone on file');
                meta.appendChild(name);
                meta.appendChild(sub);
                rowEl.appendChild(meta);

                var badge = document.createElement('span');
                badge.className = badgeClassFor(row.type);
                badge.textContent = badgeLabelFor(row.type);
                rowEl.appendChild(badge);

                rowEl.addEventListener('click', function () { selectSearchRow(row); });
                rowEl.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        selectSearchRow(row);
                    }
                });
                searchResults.appendChild(rowEl);
            });
        }

        // Iter B Phase 6 refinements: decouple the chip counts from the
        // displayed row list. Chip badges should reflect the TRUE book
        // size (returned by softphoneBookCounts) when the search input is
        // empty, and the filtered-match counts when the user is typing.
        // Pre-refinements: empty-state chips read "My book 20" because they
        // counted the Suggested top-20 slice — wildly underreporting reps
        // with larger books (Burt has 112).
        var bookCounts = null; // { total, customer, prospect, lead } | null until loaded

        function writeChipCounts(c) {
            cntAll.textContent      = String(c.total || 0);
            cntCustomer.textContent = String(c.customer || 0);
            cntProspect.textContent = String(c.prospect || 0);
            cntLead.textContent     = String(c.lead || 0);
        }

        function updateCountsFromRows(rows) {
            var c = 0, p = 0, l = 0;
            (rows || []).forEach(function (r) {
                if (r.type === 'customer') c++;
                else if (r.type === 'prospect') p++;
                else if (r.type === 'lead') l++;
            });
            writeChipCounts({ total: c + p + l, customer: c, prospect: p, lead: l });
        }

        function applyBookCountsToChips() {
            if (bookCounts && !bookCounts.error) writeChipCounts(bookCounts);
            else writeChipCounts({ total: 0, customer: 0, prospect: 0, lead: 0 });
        }

        function loadBookCounts() {
            fetch(TOKEN_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'softphoneBookCounts' })
            })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                bookCounts = data || null;
                // Only write the book counts when the user isn't typing —
                // otherwise we'd clobber the active filtered-result counts.
                if (!(searchInput && searchInput.value && searchInput.value.trim())) {
                    applyBookCountsToChips();
                }
            })
            .catch(function () { /* leave chips at last-known values */ });
        }

        function filterRows(rows, type) {
            if (!type) return rows;
            return (rows || []).filter(function (r) { return r.type === type; });
        }

        function applyVisible() {
            var source = suggestedRows || [];
            // Empty-search state: chips show the TRUE book breakdown (not
            // the 30-row Suggested slice). Falls back to row-derived counts
            // if the book-counts fetch hasn't returned yet.
            if (bookCounts && !bookCounts.error) applyBookCountsToChips();
            else updateCountsFromRows(source);
            renderRows(filterRows(source, activeFilter));
        }

        function loadSuggested() {
            searchLoading.classList.remove('hidden');
            searchSectLabel.textContent = 'Suggested · your book';
            searchSectMeta.textContent  = 'by recency';
            // Kick off the true-book-counts fetch in parallel — it powers the
            // chip badges so they show 95/4/13 instead of the 30-row slice.
            loadBookCounts();
            fetch(TOKEN_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'softphoneSuggested', limit: 30 })
            })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                searchLoading.classList.add('hidden');
                suggestedRows = (data && data.rows) || [];
                applyVisible();
            })
            .catch(function (err) {
                searchLoading.classList.add('hidden');
                showError('Suggested fetch failed: ' + (err.message || err));
            });
        }

        function runSearch(query) {
            searchLoading.classList.remove('hidden');
            searchSectLabel.textContent = (query ? '"' + query + '" — your book' : 'Suggested · your book');
            searchSectMeta.textContent  = (query ? 'across your book' : 'by recency');
            fetch(TOKEN_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'softphoneSearch',
                    query: query,
                    typeFilter: activeFilter,
                    limit: 20
                })
            })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                searchLoading.classList.add('hidden');
                var rows = (data && data.rows) || [];
                // Typed-search: chips reflect filtered match counts (not the
                // full book). When the user clears the input, applyVisible
                // restores the chips to true book totals.
                updateCountsFromRows(rows);
                renderRows(rows);
            })
            .catch(function (err) {
                searchLoading.classList.add('hidden');
                showError('Search failed: ' + (err.message || err));
            });
        }

        function onSearchInput() {
            var q = (searchInput.value || '').trim();
            if (debounceTimer) clearTimeout(debounceTimer);
            if (!q) {
                lastQuery = '';
                applyVisible();
                searchSectLabel.textContent = 'Suggested · your book';
                searchSectMeta.textContent  = 'by recency';
                return;
            }
            // Local prefix-match against the cached suggested book first.
            if (suggestedRows && suggestedRows.length) {
                var qLower = q.toLowerCase();
                var localHits = suggestedRows.filter(function (r) {
                    return (r.companyName || '').toLowerCase().indexOf(qLower) !== -1
                        || (r.contactName || '').toLowerCase().indexOf(qLower) !== -1
                        || (r.phone || '').indexOf(q) !== -1
                        || (r.email || '').toLowerCase().indexOf(qLower) !== -1;
                });
                if (localHits.length >= 3) {
                    updateCountsFromRows(localHits);
                    renderRows(filterRows(localHits, activeFilter));
                    return;
                }
            }
            // Fall back to remote search after 200ms idle.
            lastQuery = q;
            debounceTimer = setTimeout(function () {
                if (lastQuery === q) runSearch(q);
            }, 200);
        }

        function onChipClick(chipEl) {
            activeFilter = chipEl.getAttribute('data-filter') || '';
            Array.prototype.forEach.call(searchChips.querySelectorAll('.filter-chip'), function (el) {
                el.classList.toggle('active', el === chipEl);
            });
            if (lastQuery) runSearch(lastQuery);
            else applyVisible();
        }

        function selectSearchRow(row) {
            // Update ENTITY_ID + ENTITY_NAME first so renderPhoneFallback's
            // "no phone on file" branch sees the new entity and the CTA points
            // at the right record. ENTITY_TYPE comes from row.type
            // (customer/prospect/lead).
            ENTITY_ID = String(row.id || '');
            ENTITY_NAME = row.companyName || '';
            ENTITY_TYPE = row.type || '';
            window.__CTC_ENTITY_TYPE__ = row.type || '';
            // Always reset the dialed number — passing '' triggers the
            // "no phone on file" fallback when the row has no primary phone.
            setDialedNumber(row.phone || '', { resetFresh: true });
            if (entityName)    entityName.textContent = row.companyName || '';
            if (entityCompany) entityCompany.textContent = row.contactName || '';
            setActiveTab('dial');
            setButtons(!!row.phone, false, false);

            // Phase 3: hydrate the multi-contact picker for the selected entity.
            // Fall back to a single-phone view when the entity has zero contacts
            // (the row's phone stays in the Selected Card; picker stays hidden).
            hydratePickerForEntity(row.id);

            // Iteration A/C/D alignment: refresh the Selected Card header
            // (swatch + name + badge) and compact meta strip for the new
            // entity. Recents fetch is already in-memory so last-call age
            // updates without a new RESTlet call.
            if (typeof renderSelectedCardHeader === 'function') {
                renderSelectedCardHeader({
                    name: row.companyName,
                    type: row.type,
                    entityId: row.id,
                    recordUrl: clientResolveEntityUrl(row.type, row.id)
                });
            }
        }

        // ─── Iteration B Phase 3: multi-contact picker ──────────────────────
        var pickerCard        = document.getElementById('pickerCard');
        var pickerContactBtn  = document.getElementById('pickerContactBtn');
        var pickerNumberBtn   = document.getElementById('pickerNumberBtn');
        var pickerContactName = document.getElementById('pickerContactName');
        var pickerNumberValue = document.getElementById('pickerNumberValue');
        var pickerDropdown    = document.getElementById('pickerDropdown');
        var currentContacts   = CONTACTS_V2 || [];

        function formatPhoneForPill(num) {
            // Compact format for the dropdown pills — full E.164 for display.
            return String(num || '').trim();
        }

        function showPicker() {
            if (pickerCard) pickerCard.classList.remove('hidden');
        }
        function hidePicker() {
            if (pickerCard) pickerCard.classList.add('hidden');
        }
        function setPickerExpanded(expanded) {
            if (!pickerDropdown) return;
            pickerDropdown.classList.toggle('hidden', !expanded);
            pickerContactBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            pickerNumberBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        }

        function updatePickerLabels(contactName, phoneNumber) {
            if (pickerContactName) pickerContactName.textContent = contactName || '—';
            dockContactName = contactName || '';
            if (pickerNumberValue) pickerNumberValue.textContent = formatPhone(phoneNumber) || phoneNumber || '—';
        }

        function selectPickerPhone(contactId, phoneNumber, phoneType, contactName) {
            SELECTED_CONTACT_ID = String(contactId || '');
            SELECTED_PHONE_TYPE = String(phoneType || '');
            // PHONE state goes through the existing helpers so the rest of the
            // popup (Call button arming, fresh-digit reset, etc) stays correct.
            setDialedNumber(phoneNumber, { resetFresh: true, fromPicker: true });
            updatePickerLabels(contactName, phoneNumber);
            // Reflect the selection on the dropdown rows (visual highlight).
            var pills = pickerDropdown.querySelectorAll('.phone-pill');
            Array.prototype.forEach.call(pills, function (pill) {
                var same = pill.getAttribute('data-contact-id') === String(contactId)
                        && pill.getAttribute('data-number') === String(phoneNumber);
                pill.classList.toggle('selected', same);
            });
            var rows = pickerDropdown.querySelectorAll('.picker-contact-row');
            Array.prototype.forEach.call(rows, function (rowEl) {
                rowEl.classList.toggle('selected', rowEl.getAttribute('data-contact-id') === String(contactId));
            });
            setPickerExpanded(false);
        }

        function renderPicker(contacts) {
            currentContacts = Array.isArray(contacts) ? contacts : [];
            clearChildren(pickerDropdown);
            if (!currentContacts.length) {
                hidePicker();
                return;
            }
            showPicker();

            // Section head: "N contacts at this account"
            var head = document.createElement('div');
            head.className = 'picker-section-head';
            head.textContent = currentContacts.length + ' contact' + (currentContacts.length === 1 ? '' : 's') + ' at this account';
            pickerDropdown.appendChild(head);

            currentContacts.forEach(function (c) {
                var rowEl = document.createElement('div');
                rowEl.className = 'picker-contact-row';
                rowEl.setAttribute('data-contact-id', c.contactId);
                rowEl.setAttribute('role', 'button');
                rowEl.tabIndex = 0;
                // Phase 6 fix: clicking anywhere on the row picks this
                // contact's primary phone (their first phone in the list).
                // Per-line pills still work for selecting a specific number.
                rowEl.addEventListener('click', function (e) {
                    // Pill clicks bubble — guard so we don't double-fire.
                    if (e.target.closest('.phone-pill')) return;
                    if (c.phones && c.phones.length) {
                        var primary = c.phones.find(function (p) { return p.isPrimary; }) || c.phones[0];
                        selectPickerPhone(c.contactId, primary.number, primary.type, c.name);
                    }
                });
                rowEl.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (c.phones && c.phones.length) {
                            var primary = c.phones.find(function (p) { return p.isPrimary; }) || c.phones[0];
                            selectPickerPhone(c.contactId, primary.number, primary.type, c.name);
                        }
                    }
                });

                var nameEl = document.createElement('div');
                nameEl.className = 'name';
                nameEl.textContent = c.name || ('Contact ' + c.contactId);
                rowEl.appendChild(nameEl);

                if (c.title) {
                    var titleEl = document.createElement('div');
                    titleEl.className = 'title';
                    titleEl.textContent = c.title;
                    rowEl.appendChild(titleEl);
                }

                var phonesEl = document.createElement('div');
                phonesEl.className = 'phones';
                (c.phones || []).forEach(function (p) {
                    var pill = document.createElement('button');
                    pill.type = 'button';
                    pill.className = 'phone-pill';
                    pill.setAttribute('data-contact-id', c.contactId);
                    pill.setAttribute('data-number', p.number);
                    var numSpan = document.createElement('span');
                    numSpan.className = 'pill-num';
                    numSpan.textContent = formatPhoneForPill(p.number);
                    pill.appendChild(numSpan);
                    var tag = document.createElement('span');
                    tag.className = 'tag';
                    tag.textContent = p.type || '';
                    pill.appendChild(tag);
                    pill.addEventListener('click', function (e) {
                        e.stopPropagation();
                        selectPickerPhone(c.contactId, p.number, p.type, c.name);
                    });
                    phonesEl.appendChild(pill);
                });
                rowEl.appendChild(phonesEl);
                pickerDropdown.appendChild(rowEl);
            });

            // Preselect the primary phone of the first contact (if any).
            var first = currentContacts[0];
            if (first && first.phones && first.phones.length) {
                var primary = first.phones.find(function (p) { return p.isPrimary; }) || first.phones[0];
                selectPickerPhone(first.contactId, primary.number, primary.type, first.name);
            }
        }

        function hydratePickerForEntity(entityId) {
            if (!entityId) {
                renderPicker([]);
                return;
            }
            fetch(TOKEN_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'softphoneContacts', entityId: entityId })
            })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                renderPicker((data && data.rows) || []);
            })
            .catch(function (err) {
                showError('Contacts fetch failed: ' + (err.message || err));
                renderPicker([]);
            });
        }

        // Chevron clicks toggle the dropdown (either button opens the same panel).
        if (pickerContactBtn) {
            pickerContactBtn.addEventListener('click', function () {
                var open = pickerDropdown.classList.contains('hidden');
                setPickerExpanded(open);
            });
        }
        if (pickerNumberBtn) {
            pickerNumberBtn.addEventListener('click', function () {
                var open = pickerDropdown.classList.contains('hidden');
                setPickerExpanded(open);
            });
        }

        // Initial render from server-supplied CONTACTS_V2 (record-launch path).
        renderPicker(CONTACTS_V2);

        // ─── Iteration A/C/D alignment: Selected Card header + meta strip ──
        var scSwatch        = document.getElementById('scSwatch');
        var scName          = document.getElementById('scName');
        var scBadge         = document.getElementById('scBadge');
        var compactMeta     = document.getElementById('compactMeta');
        var metaOpenRecord  = document.getElementById('metaOpenRecord');
        var metaOwner       = document.getElementById('metaOwner');
        var metaLastCall    = document.getElementById('metaLastCall');
        var dialEmptyHint   = document.getElementById('dialEmptyHint');

        function entityInitials(name) {
            var parts = String(name || '').trim().split(/[^A-Za-z0-9]+/).filter(Boolean).slice(0, 2);
            return parts.map(function (p) { return p.charAt(0).toUpperCase(); }).join('') || '·';
        }
        function badgeLabelForType(type) {
            var t = String(type || '').toLowerCase();
            if (t === 'lead') return 'Lead';
            if (t === 'prospect') return 'Prospect';
            if (t === 'customer') return 'Customer';
            return '';
        }
        function ageLabelFromDate(iso) {
            if (!iso) return '';
            var t = Date.parse(iso);
            if (isNaN(t)) return '';
            var days = Math.floor((Date.now() - t) / 86400000);
            if (days <= 0) return 'today';
            if (days === 1) return 'yesterday';
            if (days < 7) return days + 'd ago';
            if (days < 30) return Math.round(days / 7) + 'w ago';
            if (days < 365) return Math.round(days / 30) + 'mo ago';
            return Math.round(days / 365) + 'y ago';
        }

        // Find the most-recent recents row matching this entityId. Called by
        // renderSelectedCardHeader to populate the "Last call" meta cell.
        function lastCallForEntity(entityId) {
            if (!recentRows || !entityId) return null;
            for (var i = 0; i < recentRows.length; i++) {
                if (String(recentRows[i].companyId) === String(entityId)) return recentRows[i];
            }
            return null;
        }

        function renderSelectedCardHeader(opts) {
            opts = opts || {};
            var name = opts.name || ENTITY_NAME || '';
            var type = (opts.type || ENTITY_TYPE || '').toLowerCase();
            var hasContext = !!(name || opts.entityId || ENTITY_ID);
            if (scSwatch) {
                scSwatch.textContent = entityInitials(name) || '··';
                scSwatch.className = 'sc-swatch ' + (type === 'lead' || type === 'prospect' ? type : '');
            }
            if (scName) scName.textContent = name || '—';
            if (scBadge) {
                var label = badgeLabelForType(type);
                scBadge.textContent = label;
                scBadge.className = 'sc-badge ' + (type === 'lead' || type === 'prospect' ? type : '');
                scBadge.classList.toggle('hidden', !label);
            }
            // Compact meta strip — populated from ENTITY_INFO + record URL +
            // most-recent matching recent. Hidden when no entity context.
            if (compactMeta) {
                compactMeta.classList.toggle('hidden', !hasContext);
                if (hasContext) {
                    // Fix 3b: only show the Open-record cell when we actually
                    // have a real entity URL. Falling through to href="#" with
                    // target="_blank" opens the Suitelet popup's own URL in a
                    // new tab — looks like the link points back at the softphone.
                    if (metaOpenRecord) {
                        var resolvedUrl = opts.recordUrl
                            || ENTITY_RECORD_URL
                            || clientResolveEntityUrl(opts.type || ENTITY_TYPE, opts.entityId || ENTITY_ID);
                        if (resolvedUrl) {
                            metaOpenRecord.href = resolvedUrl;
                            metaOpenRecord.classList.remove('hidden');
                        } else {
                            metaOpenRecord.removeAttribute('href');
                            metaOpenRecord.classList.add('hidden');
                        }
                    }
                    if (metaOwner) {
                        metaOwner.textContent = opts.owner || (ENTITY_INFO && ENTITY_INFO.owner) || '—';
                    }
                    if (metaLastCall) {
                        var lc = lastCallForEntity(opts.entityId || ENTITY_ID);
                        metaLastCall.textContent = lc ? ageLabelFromDate(lc.date) : '—';
                    }
                }
            }
            // Iteration I empty-hint: only show when there's NO context.
            if (dialEmptyHint) dialEmptyHint.classList.toggle('hidden', hasContext);
        }

        // Re-render the Selected Card header whenever recents finishes loading
        // (the "Last call" cell depends on recentRows). Wrap loadRecents to
        // call renderSelectedCardHeader after it completes.
        var _origLoadRecents = loadRecents;
        loadRecents = function () {
            _origLoadRecents();
            // The wrapped loadRecents resolves asynchronously; the .then in
            // the original sets recentRows. Re-render after a microtask so
            // metaLastCall picks up the freshly loaded data.
            setTimeout(function () { renderSelectedCardHeader({}); }, 50);
        };

        // Initial render on popup load (record path has ENTITY_NAME from
        // URL params; dashboard path has neither and shows the empty hint).
        renderSelectedCardHeader({});

        // ─── Iteration B Phase 4: audio-settings overlay ─────────────────────
        // The gear icon in phone-top toggles a settings overlay sibling of
        // view-dial / view-search. Reuses the existing #inputDevice /
        // #outputDevice <select>s + populateDevices() — only the chrome moved.
        // Defaults persist per-browser in localStorage so reps don't re-pick
        // their headset every popup open.
        var AUDIO_LS_KEY = 'ctc-audio-defaults';
        var audioGear     = document.getElementById('audioGear');
        var audioOverlay  = document.getElementById('audioOverlay');
        var audioDoneBtn  = document.getElementById('audioDone');
        var audioSaveBox  = document.getElementById('audioSaveDefault');

        function loadAudioDefaults() {
            try {
                var raw = localStorage.getItem(AUDIO_LS_KEY);
                if (!raw) return {};
                var parsed = JSON.parse(raw);
                return (parsed && typeof parsed === 'object') ? parsed : {};
            } catch (e) {
                return {};
            }
        }
        function saveAudioDefaults(prefs) {
            try {
                if (!audioSaveBox || audioSaveBox.checked) {
                    localStorage.setItem(AUDIO_LS_KEY, JSON.stringify(prefs));
                }
            } catch (e) { /* localStorage unavailable — drop silently */ }
        }
        // Persist a single field on change. Called from the input/output
        // select change handlers (existing handlers fire setInputDevice +
        // speakerDevices.set against the Twilio device; this just side-saves).
        function persistAudioPref(key, value) {
            var prefs = loadAudioDefaults();
            prefs[key] = value;
            saveAudioDefaults(prefs);
        }
        // Apply remembered defaults to the selects after populateDevices()
        // finished. If the device isn't in the list anymore (headset
        // unplugged), the select stays on whatever default was rendered.
        function applyAudioDefaults() {
            var prefs = loadAudioDefaults();
            if (prefs.inputDeviceId && inputSelect) {
                for (var i = 0; i < inputSelect.options.length; i++) {
                    if (inputSelect.options[i].value === prefs.inputDeviceId) {
                        inputSelect.value = prefs.inputDeviceId;
                        // Trigger existing change handler so Twilio picks it up
                        inputSelect.dispatchEvent(new Event('change'));
                        break;
                    }
                }
            }
            if (prefs.outputDeviceId && outputSelect) {
                for (var j = 0; j < outputSelect.options.length; j++) {
                    if (outputSelect.options[j].value === prefs.outputDeviceId) {
                        outputSelect.value = prefs.outputDeviceId;
                        outputSelect.dispatchEvent(new Event('change'));
                        break;
                    }
                }
            }
            // Docks see the remembered selection.
            publishDock();
        }

        // Phase 6 fix: the overlay now position-absolute covers the entire
        // scroll zone with its own backdrop, so we only need to toggle the
        // overlay's own .hidden class. View-dial / view-search / view-recents
        // stay in their natural state underneath — invisible because the
        // overlay sits on z-index 10 with the phone-gradient background.
        function openAudioOverlay() {
            if (!audioOverlay) return;
            audioOverlay.classList.remove('hidden');
            if (audioGear) {
                audioGear.classList.add('active');
                audioGear.setAttribute('aria-expanded', 'true');
            }
            startMicMeter();
        }
        function closeAudioOverlay() {
            if (!audioOverlay) return;
            audioOverlay.classList.add('hidden');
            if (audioGear) {
                audioGear.classList.remove('active');
                audioGear.setAttribute('aria-expanded', 'false');
            }
            stopMicMeter();
        }

        // ─── Phase 7 polish: live mic-level VU meter ───────────────────────
        // Only runs while the audio overlay is open (cleanup on close + when a
        // call connects, since Twilio's Voice SDK owns the mic stream during
        // a call). Tracks the selected inputDevice so swapping mics re-opens
        // the stream on the right device. Catches "muted at the OS level"
        // before the rep dials.
        var micMeterStream = null;
        var micMeterCtx    = null;
        var micMeterAnalyser = null;
        var micMeterRAF    = null;
        var micMeterBufLen = 0;
        var micMeterBuf    = null;

        function startMicMeter() {
            // Don't double-start; don't run during an active call (Twilio
            // owns the mic). Guard against missing Web Audio support.
            if (micMeterStream) return;
            if (activeCall) return;
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
            if (typeof AudioContext === 'undefined' && typeof webkitAudioContext === 'undefined') return;

            var constraints = { audio: true };
            var deviceId = inputSelect && inputSelect.value;
            if (deviceId) {
                constraints.audio = { deviceId: { exact: deviceId } };
            }
            navigator.mediaDevices.getUserMedia(constraints)
                .then(function (stream) {
                    // If the overlay closed between the request and the resolve,
                    // throw the stream away.
                    if (audioOverlay && audioOverlay.classList.contains('hidden')) {
                        stream.getTracks().forEach(function (t) { t.stop(); });
                        return;
                    }
                    micMeterStream = stream;
                    var Ctor = window.AudioContext || window.webkitAudioContext;
                    micMeterCtx = new Ctor();
                    var source = micMeterCtx.createMediaStreamSource(stream);
                    micMeterAnalyser = micMeterCtx.createAnalyser();
                    micMeterAnalyser.fftSize = 512;
                    micMeterAnalyser.smoothingTimeConstant = 0.5;
                    micMeterBufLen = micMeterAnalyser.frequencyBinCount;
                    micMeterBuf = new Uint8Array(micMeterBufLen);
                    source.connect(micMeterAnalyser);
                    drawMicMeter();
                })
                .catch(function (err) {
                    // Mic blocked or unavailable — hint stays as the static
                    // "speak to test" copy; bar remains at 0%. Don't crash.
                    console.log('[CTC] mic meter getUserMedia failed', err && err.message || err);
                });
        }

        function drawMicMeter() {
            if (!micMeterAnalyser || !micMeterBuf) return;
            micMeterAnalyser.getByteTimeDomainData(micMeterBuf);
            // RMS over the buffer → normalized 0..1
            var sum = 0;
            for (var i = 0; i < micMeterBufLen; i++) {
                var v = (micMeterBuf[i] - 128) / 128;
                sum += v * v;
            }
            var rms = Math.sqrt(sum / micMeterBufLen);
            // Scale up so normal speech reaches ~70% of the bar
            var pct = Math.min(100, Math.round(rms * 240));
            var bar = document.getElementById('micMeterBar');
            if (bar) bar.style.width = pct + '%';
            micMeterRAF = window.requestAnimationFrame(drawMicMeter);
        }

        function stopMicMeter() {
            if (micMeterRAF) {
                window.cancelAnimationFrame(micMeterRAF);
                micMeterRAF = null;
            }
            if (micMeterStream) {
                micMeterStream.getTracks().forEach(function (t) { t.stop(); });
                micMeterStream = null;
            }
            if (micMeterCtx) {
                try { micMeterCtx.close(); } catch (e) { /* ignore */ }
                micMeterCtx = null;
            }
            micMeterAnalyser = null;
            micMeterBuf = null;
            var bar = document.getElementById('micMeterBar');
            if (bar) bar.style.width = '0%';
        }

        if (audioGear) {
            audioGear.addEventListener('click', function () {
                if (audioOverlay.classList.contains('hidden')) openAudioOverlay();
                else closeAudioOverlay();
            });
        }
        if (audioDoneBtn) audioDoneBtn.addEventListener('click', closeAudioOverlay);

        // Wire select changes to localStorage (in addition to whatever the
        // existing change handlers do for Twilio device assignment).
        if (inputSelect) {
            inputSelect.addEventListener('change', function () {
                persistAudioPref('inputDeviceId', inputSelect.value);
                // Phase 7 polish: swap the mic-meter stream onto the newly
                // selected device so the bar reflects what reps actually
                // hear when they dial.
                if (audioOverlay && !audioOverlay.classList.contains('hidden')) {
                    stopMicMeter();
                    startMicMeter();
                }
            });
        }
        if (outputSelect) {
            outputSelect.addEventListener('change', function () {
                persistAudioPref('outputDeviceId', outputSelect.value);
            });
        }

        // ─── Iteration B Phase 5: Recents tab + last-3-dialed shortcut ────
        // recentRows = cached fetch from softphoneRecents. null = "not yet
        // fetched"; [] = "fetched, empty". The cache survives tab switches
        // so the popup doesn't re-hit the RESTlet just to flip back.
        var recentRows           = null;
        var recentsActiveFilter  = '';
        var viewRecents          = document.getElementById('viewRecents');
        var recentsList          = document.getElementById('recentsList');
        var recentsEmpty         = document.getElementById('recentsEmpty');
        var recentsLoading       = document.getElementById('recentsLoading');
        var recentsChips         = document.getElementById('recentsChips');
        var recentsCountEl       = document.getElementById('recentsCount');
        var rcntAll              = document.getElementById('rcnt-all');
        var rcntMissed           = document.getElementById('rcnt-missed');
        var rcntOut              = document.getElementById('rcnt-out');
        var rcntIn               = document.getElementById('rcnt-in');
        var lastDialedCard       = document.getElementById('lastDialed');
        var lastDialedList       = document.getElementById('lastDialedList');

        // Direction icon SVGs — outbound (↗), inbound (↙), missed (×)
        var DIR_SVG = {
            outbound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><polyline points="7 17 17 7"/><polyline points="9 7 17 7 17 15"/></svg>',
            inbound:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><polyline points="17 7 7 17"/><polyline points="15 17 7 17 7 9"/></svg>',
            missed:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><polyline points="7 7 17 17"/><polyline points="7 13 7 17 13 17"/></svg>'
        };
        var REDIAL_SVG = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.3 11.3 0 0 0 3.5.56 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.3 11.3 0 0 0 .56 3.5 1 1 0 0 1-.25 1z"/></svg>';

        function formatWhen(iso) {
            if (!iso) return '';
            // Server returns NetSuite-formatted date strings; trust them as-is.
            // Phase 7 polish can humanize ("Yesterday 4:12 PM") but for now
            // the raw string is informative enough.
            return String(iso);
        }
        function formatDur(seconds) {
            var s = Number(seconds) || 0;
            if (s < 60) return s + 's';
            var m = Math.floor(s / 60);
            var rem = s % 60;
            return m + 'm ' + (rem < 10 ? '0' : '') + rem + 's';
        }
        function directionFor(row) {
            // Phase 5: outbound-only data today; Phase 6+ derives missed from
            // duration === 0 + direction === inbound once that exists.
            if (row.isMissed) return 'missed';
            return row.direction || 'outbound';
        }

        function buildRecentsRow(row, opts) {
            var dir = directionFor(row);
            var el = document.createElement('div');
            el.className = 'recents-row';
            el.setAttribute('role', 'button');
            el.tabIndex = 0;

            var dirEl = document.createElement('div');
            dirEl.className = 'dir ' + dir;
            // Direction icon — innerHTML is safe here because DIR_SVG is a
            // server-controlled literal (not user input).
            // eslint-disable-next-line no-unsanitized/property
            dirEl.innerHTML = DIR_SVG[dir] || DIR_SVG.outbound;
            el.appendChild(dirEl);

            var meta = document.createElement('div');
            meta.className = 'meta';
            var name = document.createElement('div');
            name.className = 'name';
            name.textContent = row.companyName || row.contactName || 'Unknown';
            var when = document.createElement('div');
            when.className = 'when';
            var whenText = formatWhen(row.date);
            if (row.duration) whenText += ' · ' + formatDur(row.duration);
            else if (dir === 'missed') whenText += ' · missed';
            when.textContent = whenText;
            meta.appendChild(name);
            meta.appendChild(when);
            el.appendChild(meta);

            var redial = document.createElement('button');
            redial.type = 'button';
            redial.className = 'redial';
            redial.title = 'Redial this contact';
            // eslint-disable-next-line no-unsanitized/property
            redial.innerHTML = REDIAL_SVG;
            // Stop click bubbling so the row's own click handler doesn't fire twice
            redial.addEventListener('click', function (e) {
                e.stopPropagation();
                loadRecentIntoDial(row);
            });
            el.appendChild(redial);

            el.addEventListener('click', function () { loadRecentIntoDial(row); });
            el.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    loadRecentIntoDial(row);
                }
            });
            return el;
        }

        function loadRecentIntoDial(row) {
            // Mimic selectSearchRow's contract — load contact + phone into
            // the Dial state without auto-dialing. Rep confirms with the
            // green Call button.
            // Update ENTITY_ID/TYPE first so the no-phone fallback (and the
            // Open-record link) targets the right entity.
            ENTITY_ID = String(row.companyId || '');
            ENTITY_NAME = row.companyName || '';
            if (row.entityType) {
                ENTITY_TYPE = row.entityType;
                window.__CTC_ENTITY_TYPE__ = row.entityType;
            }
            // Always reset — passing '' triggers the no-phone-on-file fallback.
            setDialedNumber(row.phone || '', { resetFresh: true });
            if (entityName)    entityName.textContent = row.companyName || '';
            if (entityCompany) entityCompany.textContent = row.contactName || '';
            setActiveTab('dial');
            setButtons(!!row.phone, false, false);
            // Phase 3 picker hydration: if entity has multiple contacts, the
            // picker fills in for the rep to refine. Errors are swallowed
            // (already handled inside hydratePickerForEntity).
            if (row.companyId) hydratePickerForEntity(row.companyId);
            // Iteration A/C/D alignment: refresh the Selected Card header
            // and compact meta strip for the redialed entity.
            if (typeof renderSelectedCardHeader === 'function') {
                renderSelectedCardHeader({
                    name: row.companyName,
                    type: row.entityType,
                    entityId: row.companyId,
                    recordUrl: clientResolveEntityUrl(row.entityType, row.companyId)
                });
            }
        }

        function updateRecentCounts(rows) {
            var all = 0, missed = 0, out = 0, inb = 0;
            (rows || []).forEach(function (r) {
                all++;
                var d = directionFor(r);
                if (d === 'missed')   missed++;
                else if (d === 'inbound')  inb++;
                else /* outbound */        out++;
            });
            rcntAll.textContent    = all.toString();
            rcntMissed.textContent = missed.toString();
            rcntOut.textContent    = out.toString();
            rcntIn.textContent     = inb.toString();
        }

        function filterRecents(rows, direction) {
            if (!direction) return rows;
            return (rows || []).filter(function (r) { return directionFor(r) === direction; });
        }

        function renderRecents(rows) {
            clearChildren(recentsList);
            if (!rows || !rows.length) {
                recentsEmpty.classList.remove('hidden');
                return;
            }
            recentsEmpty.classList.add('hidden');
            rows.forEach(function (row) {
                recentsList.appendChild(buildRecentsRow(row));
            });
        }

        function applyRecentsVisible() {
            updateRecentCounts(recentRows || []);
            renderRecents(filterRecents(recentRows || [], recentsActiveFilter));
        }

        function loadRecents() {
            recentsLoading.classList.remove('hidden');
            fetch(TOKEN_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'softphoneRecents', dateRange: 'last7days', limit: 50 })
            })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                recentsLoading.classList.add('hidden');
                recentRows = (data && data.rows) || [];
                applyRecentsVisible();
                renderLastDialed();
            })
            .catch(function (err) {
                recentsLoading.classList.add('hidden');
                showError('Recents fetch failed: ' + (err.message || err));
            });
        }

        function onRecentsChipClick(chipEl) {
            recentsActiveFilter = chipEl.getAttribute('data-direction') || '';
            Array.prototype.forEach.call(recentsChips.querySelectorAll('.filter-chip'), function (el) {
                el.classList.toggle('active', el === chipEl);
            });
            applyRecentsVisible();
        }

        // ── Last-3-dialed shortcut on Dial home ──
        // Shows when (a) we have recent rows AND (b) the Dial tab has no
        // contact context (PHONE empty, no Selected Card armed).
        function renderLastDialed() {
            if (!lastDialedCard || !lastDialedList) return;
            var hasContext = !!(PHONE || ENTITY_ID);
            var rows = (recentRows || []).slice(0, 3);
            if (hasContext || !rows.length) {
                lastDialedCard.classList.add('hidden');
                return;
            }
            clearChildren(lastDialedList);
            rows.forEach(function (row) {
                lastDialedList.appendChild(buildRecentsRow(row));
            });
            lastDialedCard.classList.remove('hidden');
        }

        if (recentsChips) {
            recentsChips.addEventListener('click', function (e) {
                var chip = e.target.closest('.filter-chip');
                if (chip) onRecentsChipClick(chip);
            });
        }

        // ─── Iteration B Phase 6: in-call account snapshot ──────────────────
        var snapshotCard           = document.getElementById('accountSnapshot');
        var snapshotEntityLabel    = document.getElementById('snapshotEntityLabel');
        var snapOutstanding        = document.getElementById('snapOutstanding');
        var snapOutstandingDelta   = document.getElementById('snapOutstandingDelta');
        var snapOpenOpps           = document.getElementById('snapOpenOpps');
        var snapOpenOppsDelta      = document.getElementById('snapOpenOppsDelta');
        var snapLastInvoice        = document.getElementById('snapLastInvoice');
        var snapLastInvoiceDelta   = document.getElementById('snapLastInvoiceDelta');
        var snapLastActivity       = document.getElementById('snapLastActivity');
        var snapLastActivityDelta  = document.getElementById('snapLastActivityDelta');
        // Cache the last successful snapshot per entity so the second call to
        // the same record (e.g. redial) doesn't hit the RESTlet again.
        var snapshotCache = {};
        var snapshotEntityInFlight = '';

        function fmtMoney(n) {
            if (!n && n !== 0) return '—';
            var abs = Math.abs(Number(n) || 0);
            if (abs >= 1000) {
                return '$' + (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
            }
            return '$' + Math.round(n).toLocaleString();
        }
        function fmtAge(days) {
            if (days === null || days === undefined) return '';
            if (days === 0) return 'today';
            if (days === 1) return '1d ago';
            if (days < 7) return days + 'd ago';
            if (days < 30) return Math.round(days / 7) + 'w ago';
            if (days < 365) return Math.round(days / 30) + 'mo ago';
            return Math.round(days / 365) + 'y ago';
        }

        function paintSnapshot(snap) {
            // Outstanding
            if (snap.outstanding && snap.outstanding.sum > 0) {
                snapOutstanding.textContent = fmtMoney(snap.outstanding.sum);
                var bits = [];
                if (snap.outstanding.count) bits.push(snap.outstanding.count + ' inv');
                if (snap.outstanding.avgAgeDays !== null && snap.outstanding.avgAgeDays !== undefined) bits.push(snap.outstanding.avgAgeDays + 'd avg');
                snapOutstandingDelta.textContent = bits.join(' · ') || '—';
            } else {
                snapOutstanding.textContent = '$0';
                snapOutstandingDelta.textContent = 'no open invoices';
            }
            // Open opps
            if (snap.openOpps && snap.openOpps.count > 0) {
                snapOpenOpps.textContent = snap.openOpps.count + ' · ' + fmtMoney(snap.openOpps.sum);
                snapOpenOppsDelta.textContent = snap.openOpps.count === 1 ? 'open opp' : 'open opps';
            } else {
                snapOpenOpps.textContent = '0';
                snapOpenOppsDelta.textContent = 'no open opps';
            }
            // Last invoice
            if (snap.lastInvoice) {
                snapLastInvoice.textContent = fmtAge(snap.lastInvoice.ageDays) || '—';
                var inv = [];
                if (snap.lastInvoice.docNumber) inv.push(snap.lastInvoice.docNumber);
                if (snap.lastInvoice.amount)    inv.push(fmtMoney(snap.lastInvoice.amount));
                snapLastInvoiceDelta.textContent = inv.join(' · ') || '—';
            } else {
                snapLastInvoice.textContent = '—';
                snapLastInvoiceDelta.textContent = 'no invoices on file';
            }
            // Last activity
            if (snap.lastActivity) {
                snapLastActivity.textContent = fmtAge(snap.lastActivity.ageDays) || '—';
                snapLastActivityDelta.textContent = String(snap.lastActivity.type || '').toLowerCase();
            } else {
                snapLastActivity.textContent = '—';
                snapLastActivityDelta.textContent = 'no activity logged';
            }
        }

        function loadAccountSnapshot(entityId) {
            if (!snapshotCard || !entityId) return;
            var label = ENTITY_NAME || ('Entity ' + entityId);
            if (snapshotEntityLabel) snapshotEntityLabel.textContent = label;
            // Show the card immediately with — placeholders so the layout
            // doesn't jump when the RESTlet returns.
            paintSnapshot({});
            snapshotCard.classList.remove('hidden');

            // Cache hit
            if (snapshotCache[entityId]) {
                paintSnapshot(snapshotCache[entityId]);
                return;
            }
            // In-flight guard — don't fire a duplicate fetch while one is
            // already going for this entity.
            if (snapshotEntityInFlight === entityId) return;
            snapshotEntityInFlight = entityId;
            fetch(TOKEN_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'softphoneAccountSnapshot', entityId: entityId })
            })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                snapshotEntityInFlight = '';
                if (data && !data.error) {
                    snapshotCache[entityId] = data;
                    paintSnapshot(data);
                }
            })
            .catch(function (err) {
                snapshotEntityInFlight = '';
                console.error('[CTC] Snapshot fetch failed:', err);
                // Leave the — placeholders; non-fatal.
            });
        }

        function hideAccountSnapshot() {
            if (snapshotCard) snapshotCard.classList.add('hidden');
        }

        // Hook up tabs (Recents now functional)
        // Tab clicks also close any open audio overlay so the rep sees the
        // newly-active view, not a stale settings panel.
        tabDial.addEventListener('click', function () {
            closeAudioOverlay();
            setActiveTab('dial');
        });
        tabSearch.addEventListener('click', function () {
            closeAudioOverlay();
            setActiveTab('search');
        });
        tabRecents.addEventListener('click', function () {
            closeAudioOverlay();
            setActiveTab('recents');
        });

        // Apply server-decided initial tab. Dashboard launches without a phone
        // open straight to Search; record launches stay on Dial.
        if (INITIAL_TAB === 'search') setActiveTab('search');

        // Phase 5: kick off the Recents fetch on init so the last-3-dialed
        // shortcut on the Dial tab home renders without waiting for the user
        // to flip to Recents. Fetch is a single small RESTlet roundtrip;
        // result is cached for the popup lifetime.
        if (typeof loadRecents === 'function') loadRecents();

        if (searchInput)  searchInput.addEventListener('input', onSearchInput);
        // Native ::-webkit-search-cancel-button handles clearing — it
        // dispatches an 'input' event so onSearchInput re-renders the
        // empty state automatically.
        if (searchChips) {
            searchChips.addEventListener('click', function (e) {
                var chip = e.target.closest('.filter-chip');
                if (chip) onChipClick(chip);
            });
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

        startTokenRecoveryWatch();
        tokenRefreshInFlight = true;
        fetchToken()
            .then(function (result) {
                tokenRefreshInFlight = false;
                callerId = result.phoneNumber || '';
                initDevice(result.token);
            })
            .catch(function (err) {
                setStatus('Failed to initialize', 'error');
                showError('Token fetch failed: ' + (err.message || err));
                // Keep trying: the device starts when a token comes.
                if (!device) tokenFailed(err, false, 0);
            });
    })();
    </script>
</body>
</html>`;
    };

    return { onRequest };
});
