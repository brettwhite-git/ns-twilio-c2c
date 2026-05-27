/**
 * @NApiVersion 2.1
 *
 * Setup Wizard v2 — SpaClient (proper props, no more guessing).
 *
 * Path B.3a (2026-05-27) — mechanical AMD → ESM TS conversion.
 * The middle 3,700+ lines of code were preserved IDENTICALLY; only
 * the AMD `define([...], function(...))` wrapper at the top and the
 * `exports.run = run; })` close at the bottom changed. This is the
 * skeleton conversion that unblocks subsequent extractions (B.3b+).
 *
 * `// @ts-nocheck` above is intentional during this skeleton commit
 * — the 3,700 lines were never type-checked (the original .js had no
 * `// @ts-check`), and turning on TS errors for 3,700 untyped lines
 * in one go would be unmanageable. Subsequent B.3 commits extract
 * code OUT of this file into properly-typed modules where the type
 * benefits accrue. The shrinking SpaClient.ts here keeps ts-nocheck
 * until B.5 minimizes it to the ~600-line entry-point shell.
 *
 * Rewrote against the actual @uif-js TypeScript definitions
 * (component.d.ts from the netsuite-uif-reference skill). Earlier
 * iterations were guessing prop names from JSX conventions. Real shapes:
 *
 *   Heading       — `content` (NOT `text`), `type: PAGE_TITLE|...`
 *   Text          — `text` (correct), `type/size/weight/color` enums
 *   StepperItem   — `label` only (description/done/disabled aren't in Options)
 *   Stepper       — `items, selectedStepIndex, orientation, descriptionGenerator`
 *                   step "done/active" is computed from selectedStepIndex
 *   ContentPanel  — `content, horizontalAlignment: STRETCH, outerGap`
 *   StackPanel    — `items, orientation, itemGap` (with own enums)
 *
 * The HTML reference at docs/architecture/setup-wizard-v2.html ships a
 * specific page layout (stepper across the top, content card below); the
 * UIF equivalent below uses StackPanel(VERTICAL) [ContentPanel-wrapped
 * Stepper, ContentPanel-wrapped step body ].
 */

define(['exports', '@uif-js/core', '@uif-js/component'], (function (exports, core, component) { 'use strict';

    function _interopNamespaceDefault(e) {
        var n = Object.create(null);
        if (e) {
            Object.keys(e).forEach(function (k) {
                if (k !== 'default') {
                    var d = Object.getOwnPropertyDescriptor(e, k);
                    Object.defineProperty(n, k, d.get ? d : {
                        enumerable: true,
                        get: function () { return e[k]; }
                    });
                }
            });
        }
        n.default = e;
        return Object.freeze(n);
    }

    var core__namespace = /*#__PURE__*/_interopNamespaceDefault(core);
    var component__namespace = /*#__PURE__*/_interopNamespaceDefault(component);

    const WIZARD_API_URL = '/app/site/hosting/scriptlet.nl' +
        '?script=customscript_ctc_sl_wizard_api' +
        '&deploy=customdeploy_ctc_sl_wizard_api';
    const extractPayload = (response) => {
        if (response == null)
            return null;
        if (typeof response === 'object') {
            const env = response;
            if (env.ok !== undefined || env.checks !== undefined ||
                env.error !== undefined) {
                return response;
            }
            if (env.data && typeof env.data === 'object')
                return env.data;
            if (env.body && typeof env.body === 'object')
                return env.body;
            if (env.response && typeof env.response === 'object')
                return env.response;
            if (typeof env.responseText === 'string') {
                try {
                    return JSON.parse(env.responseText);
                }
                catch (e) { }
            }
        }
        if (typeof response === 'string') {
            try {
                return JSON.parse(response);
            }
            catch (e) {
                return null;
            }
        }
        return null;
    };
    const wizardCall = (action, payload) => {
        return core__namespace.Ajax.post(WIZARD_API_URL + '&action=' + action, payload || {}, {
            dataType: core__namespace.Ajax.DataType.JSON,
            responseType: core__namespace.Ajax.ResponseType.JSON
        }).then(extractPayload);
    };

    let MODE = 'stepper';
    let CURRENT_STEP = 1;
    let SELECTED_SECTION = 'overview';
    let RAIL_VISIBLE = false;
    const setMode = (m) => { MODE = m; };
    const setCurrentStep = (n) => { CURRENT_STEP = n; };
    const setSelectedSection = (s) => { SELECTED_SECTION = s; };
    const setRailVisible = (v) => { RAIL_VISIBLE = v; };

    const STATE = {
        step2: { accountSid: '', apiKeySid: '', apiSecretId: '' },
        step3: {
            twimlAppSid: '',
            phoneNumber: '',
            intelServiceSid: '',
            twimlApps: null,
            phoneNumbers: null,
            intelServices: null,
            listLoadError: null
        },
        step4: {
            phoneNumbers: null,
            employees: null,
            assignments: {},
            listLoadError: null
        },
        step5: {
            snapshot: null,
            assignments: null,
            preflight: null,
            activated: false,
            activateError: null,
            loading: false
        },
        console: {
            snapshot: null,
            assignments: null,
            preflight: null,
            activity: null,
            recentCalls: null,
            drift: null,
            loading: false,
            phonesEmployees: null,
            phonesNumbers: null,
            phonesByPhone: null,
            phonesLoading: false,
            phonesSaving: {},
            phonesError: null,
            voiceEditing: null,
            voicePendingValue: null,
            voiceLists: {
                twimlApps: null,
                phoneNumbers: null,
                intelServices: null
            },
            voiceListsLoading: false,
            voiceSaving: false,
            voiceError: null,
            activeModal: null,
            pendingDeactivateConfirm: false,
            deactivateError: null,
            actionError: null
        }
    };

    const safeNew = (Ctor, options, label) => {
        if (!Ctor) {
            console.log('[CTC Setup Wizard] ' + label + ' constructor missing — skipping');
            return null;
        }
        try {
            return new Ctor(options);
        }
        catch (e) {
            const err = e;
            console.log('[CTC Setup Wizard] ' + label + ' construction failed:', err && err.message ? err.message : e, '— options:', options);
            return null;
        }
    };

    const buildTextField = (label, placeholder, currentValue, onChange) => {
        const tb = safeNew(component__namespace.TextBox, {
            text: currentValue || '',
            placeholder: placeholder,
            onTextChanged: (args) => {
                onChange(args && args.text ? args.text : '');
            }
        }, 'TextBox(' + label + ')');
        if (!tb)
            return null;
        return safeNew(component__namespace.Field, {
            label: label,
            control: tb,
            orientation: component__namespace.Field.Orientation.VERTICAL
        }, 'Field(' + label + ')') || tb;
    };
    const buildCheckRow = (check) => {
        const icon = badgeFor(check.status);
        const labelText = safeNew(component__namespace.Text, {
            text: check.label,
            type: component__namespace.Text.Type.STRONG
        }, 'Text(row-label)');
        const detailText = check.detail ? safeNew(component__namespace.Text, {
            text: check.detail,
            type: component__namespace.Text.Type.WEAK,
            size: component__namespace.Text.Size.S
        }, 'Text(row-detail)') : null;
        const hintText = check.repairHint ? safeNew(component__namespace.Text, {
            text: '→ ' + check.repairHint,
            type: component__namespace.Text.Type.DEFAULT,
            size: component__namespace.Text.Size.S
        }, 'Text(row-hint)') : null;
        const rightStackItems = [labelText, detailText, hintText]
            .filter((c) => c != null);
        const rightStack = safeNew(component__namespace.StackPanel, {
            items: rightStackItems,
            orientation: component__namespace.StackPanel.Orientation.VERTICAL,
            itemGap: component__namespace.StackPanel.GapSize.XXS
        }, 'StackPanel(row-right)');
        const rowItems = [icon, rightStack]
            .filter((c) => c != null);
        return safeNew(component__namespace.StackPanel, {
            items: rowItems,
            orientation: component__namespace.StackPanel.Orientation.HORIZONTAL,
            alignment: component__namespace.StackPanel.Alignment.START,
            itemGap: component__namespace.StackPanel.GapSize.M
        }, 'StackPanel(row)');
    };
    const badgeFor = (status) => {
        let content;
        let type;
        switch (status) {
            case 'pass':
                content = '✓';
                type = component__namespace.Badge.Type.SOLID;
                break;
            case 'fail':
                content = '✕';
                type = component__namespace.Badge.Type.SOLID;
                break;
            case 'warn':
                content = '!';
                type = component__namespace.Badge.Type.SOLID;
                break;
            case 'info_enabled':
                content = 'ⓘ';
                type = component__namespace.Badge.Type.SUBTLE;
                break;
            case 'info_disabled':
                content = '○';
                type = component__namespace.Badge.Type.SUBTLE;
                break;
            default:
                content = '?';
                type = component__namespace.Badge.Type.SUBTLE;
        }
        return safeNew(component__namespace.Badge, {
            content: content,
            type: type,
            size: component__namespace.Badge.Size.DEFAULT
        }, 'Badge(status-' + status + ')');
    };
    const buildErrorBox = (errorMessage) => {
        return safeNew(component__namespace.Text, {
            text: 'Could not load prerequisite checks: ' + errorMessage,
            type: component__namespace.Text.Type.STRONG
        }, 'Text(error)');
    };
    const buildPrereqsList = (checks) => {
        const rows = (checks || []).map((c) => buildCheckRow(c))
            .filter((r) => r != null);
        if (rows.length === 0) {
            return safeNew(component__namespace.Text, {
                text: 'No checks returned.'
            }, 'Text(empty-checks)');
        }
        return safeNew(component__namespace.StackPanel, {
            items: rows,
            orientation: component__namespace.StackPanel.Orientation.VERTICAL,
            itemGap: component__namespace.StackPanel.GapSize.M
        }, 'StackPanel(prereqs)');
    };

    const wrapContent = (d, child) => {
        const padded = safeNew(d.CP, {
            content: child,
            horizontalAlignment: d.CP_HAlign.STRETCH,
            outerGap: {
                start: d.CP_Gap.XXL,
                end: d.CP_Gap.XXL,
                vertical: d.CP_Gap.M
            }
        }, 'ContentPanel(rail-wrapper)') || child;
        return safeNew(d.Sp, {
            content: padded,
            orientation: d.Sp.Orientation.VERTICAL
        }, 'ScrollPanel(rail-content)') || padded;
    };
    const buildPausedBanner = (d, onReactivate) => {
        const ButtonType = component__namespace.Button.Type;
        const bodyText = safeNew(d.T, {
            text: 'Reps cannot place calls until you reactivate. All ' +
                'config is preserved.'
        }, 'Text(paused-banner-body)');
        const reactivateBtn = safeNew(component__namespace.Button, {
            label: 'Reactivate',
            type: ButtonType.PRIMARY,
            action: onReactivate
        }, 'Button(paused-banner-reactivate)');
        const contentRow = safeNew(d.SP, {
            items: [bodyText, reactivateBtn].filter((c) => c != null),
            orientation: d.SP_Orient.HORIZONTAL,
            itemGap: d.SP_Gap.L,
            justification: (d.SP.Justification && d.SP.Justification.SPACE_BETWEEN) || undefined,
            alignment: (d.SP.Alignment && d.SP.Alignment.CENTER) || undefined
        }, 'StackPanel(paused-banner-content)') || bodyText;
        return safeNew(component__namespace.BannerMessage, {
            title: 'Click-to-Call is paused',
            content: contentRow,
            type: component__namespace.BannerMessage.Type.WARNING,
            showCloseButton: false
        }, 'BannerMessage(paused)');
    };
    const buildStatCard = (d, spec) => {
        try {
            return d.Cd.metric({
                title: spec.title,
                metric: spec.metric,
                description: spec.icon
                    ? buildIconedDescription(d, spec)
                    : spec.description
            });
        }
        catch (e) {
            console.warn('[CTC Setup Wizard] Card.metric threw, ' +
                'falling back to manual stack:', e);
        }
        return buildStatCardManualStack(d, spec);
    };
    const buildIconedDescription = (d, spec) => {
        const ImageCtor = component__namespace.Image;
        const iconColor = toneToImageColor(spec.tone);
        const icon = safeNew(ImageCtor, {
            image: spec.icon,
            size: component__namespace.Image.Size.S,
            color: iconColor,
            presentation: true
        }, 'Image(stat-icon-desc-' + spec.title + ')');
        const descText = spec.description ? safeNew(d.T, {
            text: spec.description,
            type: d.T_Type.WEAK,
            size: d.T && d.T.Size ? d.T.Size.S : undefined
        }, 'Text(stat-desc-' + spec.title + ')') : null;
        return safeNew(d.SP, {
            items: [icon, descText].filter((c) => c != null),
            orientation: d.SP_Orient.HORIZONTAL,
            itemGap: d.SP_Gap.XS,
            alignment: (d.SP.Alignment && d.SP.Alignment.CENTER) || undefined
        }, 'StackPanel(stat-iconed-desc-' + spec.title + ')') || icon || descText;
    };
    const buildStatCardManualStack = (d, spec) => {
        const label = safeNew(d.T, {
            text: spec.title,
            type: d.T_Type.WEAK,
            size: d.T && d.T.Size ? d.T.Size.S : undefined
        }, 'Text(stat-label)');
        const value = safeNew(d.H, {
            content: spec.metric,
            type: d.H_Type.SMALL_HEADING
        }, 'Heading(stat-value)');
        const sub = spec.description ? safeNew(d.T, {
            text: spec.description,
            type: d.T_Type.WEAK,
            size: d.T && d.T.Size ? d.T.Size.S : undefined
        }, 'Text(stat-sub)') : null;
        return safeNew(d.SP, {
            items: [label, value, sub].filter((c) => c != null),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.XXS
        }, 'StackPanel(stat-card-' + spec.title + ')');
    };
    const toneToImageColor = (tone) => {
        if (!tone)
            return undefined;
        switch (tone) {
            case 'success': return core__namespace.ImageConstant.Color.SUCCESS;
            case 'warning': return core__namespace.ImageConstant.Color.WARNING;
            case 'info': return core__namespace.ImageConstant.Color.INFO;
            case 'neutral': return core__namespace.ImageConstant.Color.NEUTRAL;
            default: return undefined;
        }
    };

    const buildCredentialsSection = (d) => {
        const snap = (STATE.console.snapshot || {});
        const items = [];
        const heading = safeNew(d.H, {
            content: 'Credentials',
            type: d.H_Type.MEDIUM_HEADING
        }, 'Heading(credentials)');
        if (heading)
            items.push(heading);
        const intro = safeNew(d.T, {
            text: 'Twilio public identifiers and NetSuite secret pointer. ' +
                'These values are safe to view; the API Key Secret value ' +
                'itself is held in NetSuite\'s encrypted vault and is ' +
                'never exposed to scripts.',
            type: d.T_Type.WEAK
        }, 'Text(credentials-intro)');
        if (intro)
            items.push(intro);
        items.push(buildCredentialRow(d, {
            label: 'Account SID',
            value: snap.accountSid || '(not set)',
            help: 'Public identifier for your Twilio account. Safe to view; ' +
                'used by SuiteScript to address the Twilio REST API.'
        }));
        items.push(buildCredentialRow(d, {
            label: 'API Key SID',
            value: snap.apiKeySid || '(not set)',
            help: 'Public identifier for the scoped API Key. Pairs with the ' +
                'secret value to authenticate REST calls.'
        }));
        items.push(buildCredentialRow(d, {
            label: 'API Key Secret pointer',
            value: snap.apiSecretId || '(not set)',
            help: 'Script ID of the NetSuite API Secret holding the secret ' +
                'value. The actual secret stays encrypted in NetSuite ' +
                'and is never exposed to SuiteScript at runtime.'
        }));
        const ButtonType = component__namespace.Button.Type;
        const manageBtn = safeNew(component__namespace.Button, {
            label: 'Open NetSuite API Secrets ↗',
            type: ButtonType.DEFAULT,
            action: () => {
                try {
                    window.open('/app/common/scripting/secrets/settings.nl', '_blank');
                }
                catch (e) { }
            }
        }, 'Button(open-api-secrets)');
        if (manageBtn)
            items.push(manageBtn);
        items.push(buildSecretRotationRunbook(d));
        return safeNew(d.SP, {
            items: items.filter((c) => c != null),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.L
        }, 'StackPanel(credentials)');
    };
    const buildCredentialRow = (d, spec) => {
        const labelText = safeNew(d.T, {
            text: spec.label,
            type: d.T_Type.STRONG
        }, 'Text(cred-label)');
        const valueText = safeNew(d.T, {
            text: spec.value,
            type: d.T_Type.DEFAULT
        }, 'Text(cred-value)');
        const helpText = safeNew(d.T, {
            text: spec.help,
            type: d.T_Type.WEAK,
            size: d.T && d.T.Size ? d.T.Size.S : undefined
        }, 'Text(cred-help)');
        const inner = safeNew(d.SP, {
            items: [labelText, valueText, helpText].filter((c) => c != null),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.XXS
        }, 'StackPanel(cred-row-inner)');
        if (!d.CP)
            return inner;
        return safeNew(d.CP, {
            content: inner,
            outerGap: (d.CP_Gap && d.CP_Gap.M) || undefined,
            horizontalAlignment: d.CP_HAlign.STRETCH
        }, 'ContentPanel(cred-row-' + spec.label + ')') || inner;
    };
    const buildSecretRotationRunbook = (d) => {
        const title = safeNew(d.H, {
            content: 'Rotating the API Key Secret',
            type: d.H_Type.SMALL_HEADING
        }, 'Heading(rotation-runbook)');
        const intro = safeNew(d.T, {
            text: 'Twilio recommends rotating API Key Secrets every 90 days. ' +
                'The rotation happens in two external systems:',
            type: d.T_Type.WEAK
        }, 'Text(rotation-intro)');
        const step1 = safeNew(d.T, {
            text: '1. In the Twilio Console, generate a new API Key Secret ' +
                '(Account > API keys & tokens > Create API key). Save the ' +
                'Secret value — Twilio shows it only once.'
        }, 'Text(rotation-step-1)');
        const step2 = safeNew(d.T, {
            text: '2. In NetSuite, navigate to Setup > Company > Preferences ' +
                '> API Secrets. Edit the secret with script ID matching ' +
                'the pointer above. Paste the new Twilio Secret value. Save.'
        }, 'Text(rotation-step-2)');
        const step3 = safeNew(d.T, {
            text: '3. Return to this console\'s Health section and click ' +
                'Re-run on Preflight to verify the new secret authenticates.'
        }, 'Text(rotation-step-3)');
        const inner = safeNew(d.SP, {
            items: [title, intro, step1, step2, step3].filter((c) => c != null),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.S
        }, 'StackPanel(rotation-inner)');
        if (!d.CP)
            return inner;
        return safeNew(d.CP, {
            content: inner,
            outerGap: (d.CP_Gap && d.CP_Gap.M) || undefined,
            horizontalAlignment: d.CP_HAlign.STRETCH,
            rootStyle: {
                border: '1px solid #E89C2B',
                borderRadius: '8px',
                backgroundColor: '#FDF8EE',
                padding: '16px 20px'
            }
        }, 'ContentPanel(rotation-callout)') || inner;
    };

    const buildHealthSection = (d, deps) => {
        const items = [];
        const heading = safeNew(d.H, {
            content: 'Health',
            type: d.H_Type.MEDIUM_HEADING
        }, 'Heading(health)');
        if (heading)
            items.push(heading);
        const preflightBlock = buildHealthPreflightBlock(d, deps);
        if (preflightBlock)
            items.push(preflightBlock);
        const driftBlock = buildHealthDriftBlock(d);
        if (driftBlock)
            items.push(driftBlock);
        const dangerBlock = buildHealthDangerZone(d, deps);
        if (dangerBlock)
            items.push(dangerBlock);
        if (STATE.console.actionError) {
            const err = safeNew(d.T, {
                text: '✕ ' + STATE.console.actionError,
                type: d.T_Type.STRONG
            }, 'Text(health-error)');
            if (err)
                items.push(err);
        }
        if (items.length === 0)
            return safeNew(d.T, { text: 'Health' }, 'Text(health-empty)');
        return safeNew(d.SP, {
            items: items,
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.L
        }, 'StackPanel(health)');
    };
    const buildHealthPreflightBlock = (d, deps) => {
        const ButtonType = component__namespace.Button.Type;
        const sectionHeader = safeNew(d.H, {
            content: 'Preflight',
            type: d.H_Type.SMALL_HEADING
        }, 'Heading(health-preflight)');
        const rerunBtn = safeNew(component__namespace.Button, {
            label: '↻ Re-run',
            type: ButtonType.DEFAULT,
            action: () => {
                wizardCall('wizardRunPreflight', {}).then((p) => {
                    const checks = p && p.checks;
                    STATE.console.preflight = Array.isArray(checks) ? checks : [];
                    deps.rerender();
                }).catch((e) => {
                    const err = e;
                    STATE.console.actionError = 'Preflight failed: ' +
                        (err && err.message ? err.message : String(e));
                    deps.rerender();
                });
            }
        }, 'Button(rerun-preflight)');
        const headerRow = safeNew(d.SP, {
            items: [sectionHeader, rerunBtn].filter((c) => c != null),
            orientation: d.SP_Orient.HORIZONTAL,
            itemGap: d.SP_Gap.S
        }, 'StackPanel(preflight-header-row)');
        const preflight = STATE.console.preflight;
        let bodyContent;
        if (preflight === null || preflight === undefined) {
            bodyContent = safeNew(d.T, {
                text: 'Preflight not yet run. Click Re-run to check.',
                type: d.T_Type.WEAK
            }, 'Text(preflight-loading)');
        }
        else if (preflight.length === 0) {
            bodyContent = safeNew(d.T, {
                text: 'No checks returned.',
                type: d.T_Type.WEAK
            }, 'Text(preflight-empty)');
        }
        else {
            bodyContent = buildHealthChecksDataGrid(d, preflight, 'preflight');
        }
        return safeNew(d.SP, {
            items: [headerRow, bodyContent].filter((c) => c != null),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.M
        }, 'StackPanel(preflight-block)');
    };
    const buildHealthDriftBlock = (d) => {
        const sectionHeader = safeNew(d.H, {
            content: 'Drift detectors',
            type: d.H_Type.SMALL_HEADING
        }, 'Heading(health-drift)');
        const drift = (STATE.console.drift || {});
        const detectors = [
            { id: 'voiceUrl', label: 'TwiML VoiceUrl', status: drift.voiceUrl || 'unknown' },
            { id: 'phoneNumbers', label: 'Phone number list', status: drift.phoneNumbers || 'unknown' },
            { id: 'intelService', label: 'Intel Service', status: drift.intelService || 'unknown' }
        ];
        const statusMap = {
            'in-sync': { status: 'pass', detail: 'In sync with Twilio' },
            'drift': { status: 'warn', detail: 'Drift detected — review section for details' },
            'not-configured': { status: 'info_disabled', detail: 'Not configured' },
            'unknown': { status: 'info_disabled', detail: 'Drift detection requires data load' }
        };
        const checks = detectors.map((det) => {
            const mapped = statusMap[det.status] || statusMap.unknown;
            return {
                id: det.id,
                label: det.label,
                status: mapped.status,
                detail: mapped.detail
            };
        });
        const grid = buildHealthChecksDataGrid(d, checks, 'drift');
        return safeNew(d.SP, {
            items: [sectionHeader, grid].filter((c) => c != null),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.M
        }, 'StackPanel(drift-block)');
    };
    const buildHealthChecksDataGrid = (d, checks, gridName) => {
        if (!d.DG) {
            console.warn('[CTC] DataGrid component unavailable; health falling back to StackPanel');
            const fallbackRows = (checks || []).map((c) => buildCheckRow(c))
                .filter((r) => r != null);
            if (fallbackRows.length === 0)
                return null;
            return safeNew(d.SP, {
                items: fallbackRows,
                orientation: d.SP_Orient.VERTICAL,
                itemGap: d.SP_Gap.M
            }, 'StackPanel(health-checks-fallback-' + gridName + ')');
        }
        if (!checks || checks.length === 0)
            return null;
        let rowsDs;
        try {
            rowsDs = new d.Ads(checks);
        }
        catch (e) {
            console.error('[CTC] Health checks ArrayDataSource failed:', e);
            return null;
        }
        const CT = d.DG.ColumnType;
        const statusColDef = {
            type: CT.TEMPLATED,
            name: 'status',
            label: 'Status',
            stretchFactor: 1,
            content: (args) => {
                try {
                    const row = args && args.cell && args.cell.row &&
                        args.cell.row.dataItem;
                    if (!row)
                        return safeNew(d.T, { text: '—' }, 'Text(status-empty)');
                    return badgeFor(row.status || '') || safeNew(d.T, { text: row.status }, 'Text(status-fallback)');
                }
                catch (e) {
                    console.error('[CTC] Health status column threw:', e);
                    return safeNew(d.T, { text: '?' }, 'Text(status-error)');
                }
            }
        };
        const checkColDef = {
            type: CT.TEMPLATED,
            name: 'check',
            label: 'Check',
            stretchFactor: 3,
            content: (args) => {
                try {
                    const row = args && args.cell && args.cell.row &&
                        args.cell.row.dataItem;
                    if (!row)
                        return safeNew(d.T, { text: '—' }, 'Text(check-empty)');
                    return safeNew(d.T, {
                        text: row.label || '',
                        type: d.T_Type.STRONG
                    }, 'Text(check-label)');
                }
                catch (e) {
                    console.error('[CTC] Health check column threw:', e);
                    return safeNew(d.T, { text: '(error)' }, 'Text(check-error)');
                }
            }
        };
        const detailColDef = {
            type: CT.TEMPLATED,
            name: 'detail',
            label: 'Detail',
            stretchFactor: 6,
            content: (args) => {
                try {
                    const row = args && args.cell && args.cell.row &&
                        args.cell.row.dataItem;
                    if (!row || !row.detail)
                        return safeNew(d.T, {
                            text: '—',
                            type: d.T_Type.WEAK
                        }, 'Text(detail-empty)');
                    return safeNew(d.T, {
                        text: row.detail,
                        type: d.T_Type.WEAK
                    }, 'Text(check-detail)');
                }
                catch (e) {
                    console.error('[CTC] Health detail column threw:', e);
                    return safeNew(d.T, { text: '(error)' }, 'Text(detail-error)');
                }
            }
        };
        return safeNew(d.DG, {
            dataSource: rowsDs,
            columns: [statusColDef, checkColDef, detailColDef],
            columnStretch: true,
            highlightRowsOnHover: true,
            stripedRows: true,
            dataRowHeight: 48,
            headerRowHeight: 40,
            rootStyle: { width: '100%' }
        }, 'DataGrid(health-' + gridName + ')');
    };
    const buildHealthDangerZone = (d, deps) => {
        const snap = (STATE.console.snapshot || {});
        const isPaused = snap.active === false;
        if (isPaused)
            return null;
        const ButtonType = component__namespace.Button.Type;
        const sectionHeader = safeNew(d.H, {
            content: 'Danger zone',
            type: d.H_Type.SMALL_HEADING
        }, 'Heading(danger-zone)');
        const description = safeNew(d.T, {
            text: 'Deactivate Click-to-Call: reps lose phone-icon access ' +
                'across all roles. In-progress calls finish normally; new ' +
                'calls cannot be placed. Reactivate any time.',
            type: d.T_Type.WEAK,
            size: d.T && d.T.Size ? d.T.Size.S : undefined
        }, 'Text(danger-desc)');
        const buttons = [];
        if (STATE.console.pendingDeactivateConfirm) {
            const cancelBtn = safeNew(component__namespace.Button, {
                label: 'Cancel',
                type: ButtonType.DEFAULT,
                action: () => {
                    STATE.console.pendingDeactivateConfirm = false;
                    deps.rerender();
                }
            }, 'Button(cancel-deactivate)');
            if (cancelBtn)
                buttons.push(cancelBtn);
            const confirmBtn = safeNew(component__namespace.Button, {
                label: 'Confirm deactivate',
                type: ButtonType.DANGER || ButtonType.DEFAULT,
                action: deps.onDeactivateClick
            }, 'Button(confirm-deactivate)');
            if (confirmBtn)
                buttons.push(confirmBtn);
        }
        else {
            const deactivateBtn = safeNew(component__namespace.Button, {
                label: 'Deactivate',
                type: ButtonType.DANGER || ButtonType.DEFAULT,
                action: deps.onDeactivateClick
            }, 'Button(deactivate)');
            if (deactivateBtn)
                buttons.push(deactivateBtn);
        }
        const deactivateErrorText = STATE.console.deactivateError ? safeNew(d.T, {
            text: '✕ Deactivate failed: ' + STATE.console.deactivateError,
            type: d.T_Type.STRONG
        }, 'Text(deactivate-error)') : null;
        const buttonRow = buttons.length > 0 ? safeNew(d.SP, {
            items: buttons,
            orientation: d.SP_Orient.HORIZONTAL,
            itemGap: d.SP_Gap.S
        }, 'StackPanel(danger-buttons)') : null;
        const inner = safeNew(d.SP, {
            items: [sectionHeader, description, buttonRow, deactivateErrorText]
                .filter((c) => c != null),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.S
        }, 'StackPanel(danger-zone)');
        if (!d.CP)
            return inner;
        return safeNew(d.CP, {
            content: inner,
            outerGap: (d.CP_Gap && d.CP_Gap.M) || undefined,
            horizontalAlignment: d.CP_HAlign.STRETCH,
            rootStyle: {
                border: '1px solid #D33A2C',
                borderRadius: '8px',
                backgroundColor: '#FDF4F3',
                padding: '16px 20px'
            }
        }, 'ContentPanel(danger-zone-callout)') || inner;
    };

    const buildOverviewSection = (d, deps) => {
        const items = [];
        const heading = safeNew(d.H, {
            content: 'Overview',
            type: d.H_Type.MEDIUM_HEADING
        }, 'Heading(overview)');
        if (heading)
            items.push(heading);
        const stats = buildOverviewStatCards(d);
        if (stats)
            items.push(stats);
        const quick = buildOverviewQuickActions(d, deps);
        if (quick)
            items.push(quick);
        const activity = buildOverviewActivityFeed(d);
        if (activity)
            items.push(activity);
        if (items.length === 0)
            return safeNew(d.T, { text: 'Overview' }, 'Text(overview-empty)');
        return safeNew(d.SP, {
            items: items,
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.L
        }, 'StackPanel(overview)');
    };
    const buildOverviewStatCards = (d) => {
        const snap = (STATE.console.snapshot || {});
        const assignments = (STATE.console.assignments || []);
        const preflight = (STATE.console.preflight || []);
        const phoneCount = {};
        assignments.forEach((a) => {
            if (a.phoneSid)
                phoneCount[a.phoneSid] = true;
        });
        const phonesConfigured = Object.keys(phoneCount).length || (snap.phoneNumber ? 1 : 0);
        const repCount = assignments.length;
        const preflightPassed = preflight.filter((c) => c.status === 'pass').length;
        const preflightTotal = preflight.length;
        const statusLabel = snap.active === false ? 'Paused' :
            snap.active === true ? 'Active' : 'Unknown';
        const statusIcon = snap.active === true ? core__namespace.SystemIcon.STATUS_SUCCESS_FILLED :
            snap.active === false ? core__namespace.SystemIcon.STATUS_WARNING_FILLED :
                core__namespace.SystemIcon.STATUS_INFO_FILLED;
        const statusTone = snap.active === true ? 'success' :
            snap.active === false ? 'warning' :
                'info';
        const cards = [
            buildStatCard(d, {
                title: 'Status',
                metric: statusLabel,
                description: snap.active === false ? 'Reps cannot place calls'
                    : 'Reps can place calls',
                icon: statusIcon,
                tone: statusTone
            }),
            buildStatCard(d, {
                title: 'Phone numbers',
                metric: String(phonesConfigured),
                description: phonesConfigured === 0 ? 'No numbers configured'
                    : snap.phoneNumber || ''
            }),
            buildStatCard(d, {
                title: 'Assigned reps',
                metric: String(repCount),
                description: repCount === 0 ? 'No assignments'
                    : (repCount === 1 ? '1 rep' : repCount + ' reps')
            }),
            buildStatCard(d, {
                title: 'Preflight',
                metric: preflightTotal > 0
                    ? preflightPassed + ' of ' + preflightTotal
                    : '—',
                description: preflightTotal > 0 ? 'See Health for detail'
                    : 'Not yet run'
            })
        ].filter((c) => c != null);
        if (cards.length === 0)
            return null;
        if (d.GP) {
            return safeNew(d.GP, {
                columns: '1fr 1fr 1fr 1fr',
                rows: 'auto',
                items: cards,
                columnGap: (d.GP_Gap && d.GP_Gap.M) || undefined
            }, 'GridPanel(overview-stats)');
        }
        return safeNew(d.SP, {
            items: cards,
            orientation: d.SP_Orient.HORIZONTAL,
            itemGap: d.SP_Gap.M
        }, 'StackPanel(overview-stats-fallback)');
    };
    const buildOverviewQuickActions = (d, deps) => {
        const ButtonType = component__namespace.Button.Type;
        const heading = safeNew(d.H, {
            content: 'Quick actions',
            type: d.H_Type.SMALL_HEADING
        }, 'Heading(quick-actions)');
        const subtitle = safeNew(d.T, {
            text: 'Common admin tasks — full screens still available via the left rail.',
            type: d.T_Type.WEAK,
            size: d.T && d.T.Size ? d.T.Size.S : undefined
        }, 'Text(quick-actions-subtitle)');
        const headerStack = safeNew(d.SP, {
            items: [heading, subtitle].filter((c) => c != null),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.XXS
        }, 'StackPanel(quick-actions-header)');
        const actions = [
            {
                label: 'Add a phone number',
                icon: core__namespace.SystemIcon.ADD,
                type: ButtonType.DEFAULT,
                onClick: () => deps.goToSection('phones')
            },
            {
                label: 'Reassign reps',
                icon: core__namespace.SystemIcon.REFRESH,
                type: ButtonType.DEFAULT,
                onClick: () => deps.goToSection('phones')
            },
            {
                label: 'Update voice config',
                icon: core__namespace.SystemIcon.PLAY,
                type: ButtonType.DEFAULT,
                onClick: () => deps.goToSection('voice')
            },
            {
                label: 'Rotate API Key Secret',
                icon: core__namespace.SystemIcon.LOCK,
                type: ButtonType.DEFAULT,
                onClick: () => deps.goToSection('credentials')
            },
            {
                label: 'Deactivate',
                icon: core__namespace.SystemIcon.STOP,
                type: ButtonType.DANGER || ButtonType.DEFAULT,
                onClick: deps.onDeactivateClick
            }
        ];
        const buttons = actions.map((a) => {
            return safeNew(component__namespace.Button, {
                label: a.label,
                type: a.type,
                startIcon: a.icon,
                action: a.onClick
            }, 'Button(qa-' + a.label + ')');
        }).filter((b) => b != null);
        if (buttons.length === 0)
            return headerStack;
        const row = safeNew(d.SP, {
            items: buttons,
            orientation: d.SP_Orient.HORIZONTAL,
            itemGap: d.SP_Gap.S
        }, 'StackPanel(quick-actions-row)');
        return safeNew(d.SP, {
            items: [headerStack, row].filter((c) => c != null),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.S
        }, 'StackPanel(quick-actions-block)');
    };
    const buildOverviewActivityFeed = (d) => {
        const heading = safeNew(d.H, {
            content: 'Recent calls',
            type: d.H_Type.SMALL_HEADING
        }, 'Heading(recent-calls)');
        const calls = STATE.console.recentCalls;
        const rows = [];
        if (calls === null) {
            const loader = safeNew(component__namespace.Loader, {
                label: 'Loading recent calls…',
                indeterminate: true
            }, 'Loader(recent-calls)');
            if (loader)
                rows.push(loader);
        }
        else if (calls.length === 0) {
            const empty = safeNew(d.T, {
                text: 'No calls logged yet. Once reps start placing calls ' +
                    'through Click-to-Call, the 10 most recent will show up here.',
                type: d.T_Type.WEAK
            }, 'Text(recent-calls-empty)');
            if (empty)
                rows.push(empty);
        }
        else {
            const grid = buildRecentCallsDataGrid(d, calls);
            if (grid)
                rows.push(grid);
        }
        return safeNew(d.SP, {
            items: [heading].concat(rows).filter((c) => c != null),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.S
        }, 'StackPanel(recent-calls-feed)');
    };
    const buildRecentCallsDataGrid = (d, calls) => {
        if (!d.DG) {
            console.warn('[CTC] DataGrid component unavailable; recent calls falling back to text');
            return buildRecentCallsFallback(d, calls);
        }
        let rowsDs;
        try {
            rowsDs = new d.Ads(calls);
        }
        catch (e) {
            console.error('[CTC] Recent calls ArrayDataSource failed:', e);
            return buildRecentCallsFallback(d, calls);
        }
        const CT = d.DG.ColumnType;
        const BdgType = d.Bdg.Type;
        const dateColDef = {
            type: CT.TEMPLATED,
            name: 'date',
            label: 'Date',
            stretchFactor: 2,
            content: (args) => {
                try {
                    const row = args && args.cell && args.cell.row &&
                        args.cell.row.dataItem;
                    if (!row)
                        return safeNew(d.T, { text: '—' }, 'Text(date-empty)');
                    return safeNew(d.T, {
                        text: row.date || '(no date)',
                        type: d.T_Type.DEFAULT
                    }, 'Text(call-date)');
                }
                catch (e) {
                    console.error('[CTC] Recent calls date column threw:', e);
                    return safeNew(d.T, { text: '(error)' }, 'Text(date-error)');
                }
            }
        };
        const repColDef = {
            type: CT.TEMPLATED,
            name: 'rep',
            label: 'Rep',
            stretchFactor: 2,
            content: (args) => {
                try {
                    const row = args && args.cell && args.cell.row &&
                        args.cell.row.dataItem;
                    if (!row)
                        return safeNew(d.T, { text: '—' }, 'Text(rep-empty)');
                    return safeNew(d.T, {
                        text: row.repName || '(unassigned)',
                        type: d.T_Type.DEFAULT
                    }, 'Text(call-rep)');
                }
                catch (e) {
                    return safeNew(d.T, { text: '(error)' }, 'Text(rep-error)');
                }
            }
        };
        const contactColDef = {
            type: CT.TEMPLATED,
            name: 'contact',
            label: 'Contact',
            stretchFactor: 3,
            content: (args) => {
                try {
                    const row = args && args.cell && args.cell.row &&
                        args.cell.row.dataItem;
                    if (!row)
                        return safeNew(d.T, { text: '—' }, 'Text(contact-empty)');
                    const primary = row.companyName || row.contactName || '(unknown)';
                    const secondary = (row.companyName && row.contactName)
                        ? row.contactName
                        : '';
                    const primaryText = safeNew(d.T, {
                        text: primary,
                        type: d.T_Type.STRONG
                    }, 'Text(call-contact-primary)');
                    const secondaryText = secondary ? safeNew(d.T, {
                        text: secondary,
                        type: d.T_Type.WEAK,
                        size: d.T.Size && d.T.Size.S
                    }, 'Text(call-contact-secondary)') : null;
                    return safeNew(d.SP, {
                        items: [primaryText, secondaryText].filter((c) => c != null),
                        orientation: d.SP_Orient.VERTICAL,
                        itemGap: d.SP_Gap.XXS
                    }, 'StackPanel(call-contact)') || primaryText;
                }
                catch (e) {
                    return safeNew(d.T, { text: '(error)' }, 'Text(contact-error)');
                }
            }
        };
        const durationColDef = {
            type: CT.TEMPLATED,
            name: 'duration',
            label: 'Duration',
            stretchFactor: 1,
            content: (args) => {
                try {
                    const row = args && args.cell && args.cell.row &&
                        args.cell.row.dataItem;
                    if (!row)
                        return safeNew(d.T, { text: '—' }, 'Text(dur-empty)');
                    return safeNew(d.T, {
                        text: formatDuration(row.duration),
                        type: d.T_Type.DEFAULT
                    }, 'Text(call-duration)');
                }
                catch (e) {
                    return safeNew(d.T, { text: '(error)' }, 'Text(dur-error)');
                }
            }
        };
        const statusColDef = {
            type: CT.TEMPLATED,
            name: 'status',
            label: 'AI Status',
            stretchFactor: 2,
            content: (args) => {
                try {
                    const row = args && args.cell && args.cell.row &&
                        args.cell.row.dataItem;
                    if (!row)
                        return safeNew(d.T, { text: '—' }, 'Text(status-empty)');
                    const label = formatCallStatus(row.status);
                    const palette = statusBadgePalette(row.status);
                    return safeNew(d.Bdg, {
                        content: label,
                        type: BdgType.SUBTLE,
                        rootStyle: {
                            backgroundColor: palette.bg,
                            color: palette.fg,
                            border: '1px solid ' + palette.border
                        }
                    }, 'Badge(call-status)') || safeNew(d.T, { text: label }, 'Text(call-status-fb)');
                }
                catch (e) {
                    return safeNew(d.T, { text: '(error)' }, 'Text(status-error)');
                }
            }
        };
        const grid = safeNew(d.DG, {
            dataSource: rowsDs,
            columns: [dateColDef, repColDef, contactColDef, durationColDef, statusColDef],
            columnStretch: true,
            highlightRowsOnHover: true,
            stripedRows: true,
            dataRowHeight: 56,
            headerRowHeight: 40,
            rootStyle: { width: '100%' },
            onRowClick: (args) => {
                const dataItem = args && args.row && args.row.dataItem;
                if (!dataItem || !dataItem.id)
                    return;
                try {
                    window.open('/app/crm/calendar/call.nl?id=' + encodeURIComponent(String(dataItem.id)), '_blank');
                }
                catch (e) { }
            }
        }, 'DataGrid(recent-calls)');
        if (!grid) {
            console.warn('[CTC] Recent calls DataGrid construction returned null; using text fallback');
            return buildRecentCallsFallback(d, calls);
        }
        return grid;
    };
    const buildRecentCallsFallback = (d, calls) => {
        const rows = calls.map((c) => {
            const label = (c.date || '?') + ' — ' +
                (c.companyName || c.contactName || '(unknown)') +
                ' [' + (c.repName || 'unassigned') + ']' +
                ' — ' + formatDuration(c.duration);
            return safeNew(d.T, { text: label }, 'Text(call-row-fb)');
        }).filter((r) => r != null);
        if (rows.length === 0)
            return null;
        return safeNew(d.SP, {
            items: rows,
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.XS
        }, 'StackPanel(recent-calls-fallback)');
    };
    const formatDuration = (seconds) => {
        if (!seconds || seconds < 0)
            return '—';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        const pad = (n) => (n < 10 ? '0' + n : String(n));
        if (h > 0)
            return h + ':' + pad(m) + ':' + pad(s);
        return m + ':' + pad(s);
    };
    const statusBadgePalette = (status) => {
        const norm = (status || '').toLowerCase().trim();
        switch (norm) {
            case 'transcribed':
                return { bg: '#D4EDDA', fg: '#155724', border: '#A3D9AE' };
            case 'processing':
                return { bg: '#CCE5FF', fg: '#004085', border: '#9FCDFF' };
            case 'logged':
                return { bg: '#E2E3E5', fg: '#383D41', border: '#C7CACE' };
            case 'no_transcript':
            case 'no transcript':
                return { bg: '#FFF3CD', fg: '#856404', border: '#FFE69C' };
            case 'failed':
                return { bg: '#F8D7DA', fg: '#721C24', border: '#F1B5BB' };
            default:
                return { bg: '#E2E3E5', fg: '#383D41', border: '#C7CACE' };
        }
    };
    const formatCallStatus = (status) => {
        if (!status)
            return '—';
        const norm = String(status).trim();
        if (!norm)
            return '—';
        return norm.charAt(0).toUpperCase() + norm.slice(1).toLowerCase();
    };

    const TWILIO_DOCS = {
        twimlApp: 'https://www.twilio.com/docs/usage/api/applications',
        phoneNumber: 'https://www.twilio.com/docs/phone-numbers',
        intelService: 'https://www.twilio.com/docs/voice/intelligence'
    };
    const buildVoiceSection = (d, deps) => {
        const snap = (STATE.console.snapshot || {});
        const items = [];
        const heading = safeNew(d.H, {
            content: 'Voice config',
            type: d.H_Type.MEDIUM_HEADING
        }, 'Heading(voice)');
        if (heading)
            items.push(heading);
        const intro = safeNew(d.T, {
            text: 'Manage TwiML application, default outbound caller-ID ' +
                'number, and optional Conversational Intelligence ' +
                'service. Changes save immediately and apply to the ' +
                'next call placed.',
            type: d.T_Type.WEAK
        }, 'Text(voice-intro)');
        if (intro)
            items.push(intro);
        if (STATE.console.voiceError) {
            const err = safeNew(d.T, {
                text: '✕ ' + STATE.console.voiceError,
                type: d.T_Type.STRONG
            }, 'Text(voice-error)');
            if (err)
                items.push(err);
        }
        items.push(buildVoiceFieldRow(d, deps, {
            field: 'twimlAppSid',
            label: 'TwiML Application',
            value: snap.twimlAppSid,
            helpText: 'The Twilio application that handles outbound call ' +
                'routing. The wizard registers this app\'s VoiceUrl with ' +
                'the CTC Suitelet, so every call a rep places hits ' +
                'NetSuite first for screening before connecting to Twilio.',
            docUrl: TWILIO_DOCS.twimlApp
        }));
        items.push(buildVoiceFieldRow(d, deps, {
            field: 'phoneNumber',
            label: 'Default outbound caller-ID',
            value: snap.phoneNumber,
            helpText: 'Number reps see as their outbound caller ID. ' +
                'Specific rep-to-number assignments override this default ' +
                '— see Phones & reps section to assign different numbers ' +
                'to individual reps.',
            docUrl: TWILIO_DOCS.phoneNumber
        }));
        items.push(buildVoiceFieldRow(d, deps, {
            field: 'intelServiceSid',
            label: 'Conversational Intelligence',
            value: snap.intelServiceSid,
            helpText: 'Twilio Conversational Intelligence service that ' +
                'transcribes call audio and powers the AI summary, tone ' +
                'keywords, and satisfaction scoring on Phone Call records. ' +
                'Required for the AI analysis pipeline.',
            docUrl: TWILIO_DOCS.intelService
        }));
        if (items.length === 0)
            return safeNew(d.T, { text: 'Voice config' }, 'Text(voice-empty)');
        return safeNew(d.SP, {
            items: items.filter((c) => c != null),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.L
        }, 'StackPanel(voice)');
    };
    const buildVoiceFieldRow = (d, deps, spec) => {
        const isEditing = STATE.console.voiceEditing === spec.field;
        const ButtonType = component__namespace.Button.Type;
        const label = safeNew(d.T, {
            text: spec.label,
            type: d.T_Type.STRONG
        }, 'Text(voice-label-' + spec.field + ')');
        const help = safeNew(d.T, {
            text: spec.helpText,
            type: d.T_Type.WEAK,
            size: d.T.Size && d.T.Size.S
        }, 'Text(voice-help-' + spec.field + ')');
        const rightSide = isEditing
            ? buildVoiceEditControls(d, deps, spec)
            : buildVoiceViewControls(d, deps, spec, ButtonType);
        const docLink = spec.docUrl ? safeNew(component__namespace.Link, {
            content: 'Twilio docs ↗',
            url: spec.docUrl,
            target: component__namespace.Link.Target.BLANK
        }, 'Link(voice-doc-' + spec.field + ')') : null;
        const cells = [label, help, rightSide, docLink].filter((c) => c != null);
        const grid = safeNew(d.GP, {
            columns: '1fr 3fr 2fr 1fr',
            rows: 'auto',
            items: cells,
            columnGap: (d.GP_Gap && d.GP_Gap.L) || undefined
        }, 'GridPanel(voice-row-' + spec.field + ')') || safeNew(d.SP, {
            items: cells,
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.S
        }, 'StackPanel(voice-row-fallback-' + spec.field + ')');
        if (d.CP) {
            return safeNew(d.CP, {
                content: grid,
                outerGap: (d.CP_Gap && d.CP_Gap.M) || undefined,
                horizontalAlignment: d.CP_HAlign.STRETCH
            }, 'ContentPanel(voice-row-pad-' + spec.field + ')') || grid;
        }
        return grid;
    };
    const buildVoiceViewControls = (d, deps, spec, ButtonType) => {
        const valueText = spec.value
            ? safeNew(d.T, {
                text: spec.value,
                type: d.T_Type.DEFAULT
            }, 'Text(voice-value-' + spec.field + ')')
            : safeNew(d.T, {
                text: '(not configured)',
                type: d.T_Type.WEAK
            }, 'Text(voice-empty-' + spec.field + ')');
        const changeBtn = safeNew(component__namespace.Button, {
            label: 'Change',
            type: ButtonType.DEFAULT,
            action: () => { onVoiceChangeClick(deps, spec.field, !!spec.allowEmpty); }
        }, 'Button(voice-change-' + spec.field + ')');
        return safeNew(d.SP, {
            items: [valueText, changeBtn].filter((c) => c != null),
            orientation: d.SP_Orient.HORIZONTAL,
            itemGap: d.SP_Gap.M
        }, 'StackPanel(voice-view-' + spec.field + ')');
    };
    const buildVoiceEditControls = (d, deps, spec) => {
        const ButtonType = component__namespace.Button.Type;
        const listKey = voiceListKeyFor(spec.field);
        const list = listKey ? STATE.console.voiceLists[listKey] : null;
        if (list === null || STATE.console.voiceListsLoading) {
            const loader = safeNew(component__namespace.Loader, {
                label: 'Loading from Twilio…',
                indeterminate: true
            }, 'Loader(voice-list-' + spec.field + ')');
            return loader || safeNew(d.T, { text: 'Loading from Twilio…' }, 'Text(voice-loading)');
        }
        if (list.length === 0) {
            const emptyText = safeNew(d.T, {
                text: '(no items found in Twilio for this account)',
                type: d.T_Type.WEAK
            }, 'Text(voice-empty-list-' + spec.field + ')');
            const cancelBtnE = safeNew(component__namespace.Button, {
                label: 'Cancel',
                type: ButtonType.DEFAULT,
                action: () => { onVoiceCancelClick(deps); }
            }, 'Button(voice-cancel-empty-' + spec.field + ')');
            return safeNew(d.SP, {
                items: [emptyText, cancelBtnE].filter((c) => c != null),
                orientation: d.SP_Orient.HORIZONTAL,
                itemGap: d.SP_Gap.M
            }, 'StackPanel(voice-empty-edit-' + spec.field + ')');
        }
        const normalized = list.map((it) => {
            if (spec.field === 'phoneNumber') {
                return {
                    value: it.phoneNumber || '',
                    label: (it.phoneNumber || '') +
                        (it.friendlyName ? '  —  ' + it.friendlyName : '')
                };
            }
            return {
                value: it.sid || '',
                label: (it.friendlyName || '(unnamed)') +
                    (it.sid ? '  [' + it.sid + ']' : '')
            };
        });
        const ds = new core__namespace.ArrayDataSource(normalized);
        const pending = STATE.console.voicePendingValue;
        const dropdown = safeNew(component__namespace.Dropdown, {
            dataSource: ds,
            valueMember: 'value',
            displayMember: 'label',
            selectedValue: pending || (spec.allowEmpty ? null : normalized[0].value),
            allowEmpty: !!spec.allowEmpty,
            placeholder: spec.allowEmpty ? '(none)' : 'Select…',
            onSelectionChanged: (args) => {
                STATE.console.voicePendingValue = (args && args.value) || null;
            }
        }, 'Dropdown(voice-edit-' + spec.field + ')');
        const saving = !!STATE.console.voiceSaving;
        const saveBtn = safeNew(component__namespace.Button, {
            label: saving ? 'Saving…' : 'Save',
            type: ButtonType.PRIMARY,
            enabled: !saving,
            action: () => { onVoiceSaveClick(deps, spec.field); }
        }, 'Button(voice-save-' + spec.field + ')');
        const cancelBtn = safeNew(component__namespace.Button, {
            label: 'Cancel',
            type: ButtonType.DEFAULT,
            enabled: !saving,
            action: () => { onVoiceCancelClick(deps); }
        }, 'Button(voice-cancel-' + spec.field + ')');
        return safeNew(d.SP, {
            items: [dropdown, saveBtn, cancelBtn].filter((c) => c != null),
            orientation: d.SP_Orient.HORIZONTAL,
            itemGap: d.SP_Gap.S
        }, 'StackPanel(voice-edit-' + spec.field + ')');
    };
    const voiceListKeyFor = (field) => {
        if (field === 'twimlAppSid')
            return 'twimlApps';
        if (field === 'phoneNumber')
            return 'phoneNumbers';
        if (field === 'intelServiceSid')
            return 'intelServices';
        return null;
    };
    const voiceActionFor = (field) => {
        if (field === 'twimlAppSid')
            return 'wizardListTwiMLApps';
        if (field === 'phoneNumber')
            return 'wizardListPhoneNumbers';
        if (field === 'intelServiceSid')
            return 'wizardListIntelServices';
        return null;
    };
    const onVoiceChangeClick = (deps, field, _allowEmpty) => {
        STATE.console.voiceEditing = field;
        STATE.console.voiceError = null;
        const snap = (STATE.console.snapshot || {});
        STATE.console.voicePendingValue = snap[field] || null;
        const listKey = voiceListKeyFor(field);
        if (!listKey) {
            deps.rerender();
            return;
        }
        if (STATE.console.voiceLists[listKey] !== null) {
            deps.rerender();
            return;
        }
        STATE.console.voiceListsLoading = true;
        deps.rerender();
        const action = voiceActionFor(field);
        if (!action) {
            STATE.console.voiceListsLoading = false;
            STATE.console.voiceEditing = null;
            deps.rerender();
            return;
        }
        wizardCall(action, {})
            .then((p) => {
            const items = (p && p.items) || [];
            STATE.console.voiceLists[listKey] = items;
            STATE.console.voiceListsLoading = false;
            deps.rerender();
        })
            .catch((e) => {
            const err = e;
            STATE.console.voiceListsLoading = false;
            STATE.console.voiceError = 'Could not load list: ' +
                (err && err.message ? err.message : String(e));
            STATE.console.voiceEditing = null;
            deps.rerender();
        });
    };
    const onVoiceCancelClick = (deps) => {
        STATE.console.voiceEditing = null;
        STATE.console.voicePendingValue = null;
        STATE.console.voiceError = null;
        deps.rerender();
    };
    const onVoiceSaveClick = (deps, field) => {
        const snap = (STATE.console.snapshot || {});
        const newValue = STATE.console.voicePendingValue;
        if (newValue === snap[field]) {
            STATE.console.voiceEditing = null;
            STATE.console.voicePendingValue = null;
            deps.rerender();
            return;
        }
        const payload = {
            twimlAppSid: snap.twimlAppSid || '',
            phoneNumber: snap.phoneNumber || '',
            intelServiceSid: snap.intelServiceSid || ''
        };
        payload[field] = newValue || '';
        STATE.console.voiceSaving = true;
        STATE.console.voiceError = null;
        deps.rerender();
        wizardCall('wizardSaveVoice', payload)
            .then((p) => {
            STATE.console.voiceSaving = false;
            const resp = p;
            if (resp && resp.saved) {
                snap[field] = newValue || undefined;
                STATE.console.snapshot = snap;
                STATE.console.voiceEditing = null;
                STATE.console.voicePendingValue = null;
                deps.rerender();
            }
            else {
                STATE.console.voiceError = 'Save failed: ' +
                    ((resp && resp.error) || 'unknown');
                deps.rerender();
            }
        })
            .catch((e) => {
            const err = e;
            STATE.console.voiceSaving = false;
            STATE.console.voiceError = 'Network error saving: ' +
                (err && err.message ? err.message : String(e));
            deps.rerender();
        });
    };

    const buildPhonesSection = (d, deps) => {
        const items = [];
        const heading = safeNew(d.H, {
            content: 'Phones & reps',
            type: d.H_Type.MEDIUM_HEADING
        }, 'Heading(phones)');
        if (heading)
            items.push(heading);
        if (STATE.console.phonesLoading) {
            const loader = safeNew(component__namespace.Loader, {
                label: 'Loading phones & reps…',
                indeterminate: true
            }, 'Loader(phones)');
            if (loader)
                items.push(loader);
            return safeNew(d.SP, {
                items: items,
                orientation: d.SP_Orient.VERTICAL,
                itemGap: d.SP_Gap.L
            }, 'StackPanel(phones-loading)') || heading;
        }
        const toolbar = buildPhonesToolbar(d, deps);
        if (toolbar)
            items.push(toolbar);
        if (STATE.console.phonesError) {
            const err = safeNew(d.T, {
                text: '✕ ' + STATE.console.phonesError,
                type: d.T_Type.STRONG
            }, 'Text(phones-error)');
            if (err)
                items.push(err);
        }
        const grid = buildPhonesDataGrid(d, deps);
        if (grid)
            items.push(grid);
        const grouped = (STATE.console.phonesByPhone || []);
        if (grouped.length === 0) {
            const emptyText = safeNew(d.T, {
                text: 'No phone numbers configured yet. Click "Add phone ' +
                    'number" above to claim a Twilio number and assign reps.',
                type: d.T_Type.WEAK
            }, 'Text(phones-empty)');
            if (emptyText)
                items.push(emptyText);
        }
        if (items.length === 0)
            return safeNew(d.T, { text: 'Phones & reps' }, 'Text(phones-section-empty)');
        return safeNew(d.SP, {
            items: items,
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.XL
        }, 'StackPanel(phones)');
    };
    const buildPhonesToolbar = (d, deps) => {
        const ButtonType = component__namespace.Button.Type;
        const refreshBtn = safeNew(component__namespace.Button, {
            label: 'Refresh from Twilio',
            type: ButtonType.DEFAULT,
            startIcon: d.SysIcon && d.SysIcon.REFRESH,
            action: () => { deps.loadPhonesData(); }
        }, 'Button(phones-refresh)');
        const addBtn = safeNew(component__namespace.Button, {
            label: 'Add phone number',
            type: ButtonType.PRIMARY,
            startIcon: d.SysIcon && d.SysIcon.ADD,
            action: () => {
                deps.goToStep(4);
            }
        }, 'Button(phones-add)');
        const buttons = [refreshBtn, addBtn].filter((b) => b != null);
        if (buttons.length === 0)
            return null;
        return safeNew(d.SP, {
            items: buttons,
            orientation: d.SP_Orient.HORIZONTAL,
            itemGap: d.SP_Gap.S
        }, 'StackPanel(phones-toolbar)');
    };
    const buildPhonesDataGrid = (d, deps) => {
        if (!d.DG) {
            console.warn('[CTC] DataGrid component unavailable; falling back to text');
            return buildPhonesFallback(d);
        }
        const grouped = (STATE.console.phonesByPhone || []);
        const employees = (STATE.console.phonesEmployees || []);
        if (grouped.length === 0)
            return null;
        let rowsDs;
        let employeesDs;
        try {
            rowsDs = new d.Ads(grouped);
            employeesDs = new d.Ads(employees);
        }
        catch (e) {
            console.error('[CTC] ArrayDataSource construction failed:', e);
            return buildPhonesFallback(d);
        }
        const CT = d.DG.ColumnType;
        const BdgType = d.Bdg.Type;
        const truncSid = (sid) => {
            if (!sid)
                return '';
            if (sid.length <= 14)
                return sid;
            return sid.slice(0, 6) + '…' + sid.slice(-4);
        };
        const phoneColDef = {
            type: CT.TEMPLATED,
            name: 'phone',
            label: 'Phone number',
            stretchFactor: 2,
            content: (args) => {
                try {
                    const row = args && args.cell && args.cell.row &&
                        args.cell.row.dataItem;
                    if (!row)
                        return safeNew(d.T, { text: '—' }, 'Text(phone-empty)');
                    const top = safeNew(d.T, {
                        text: row.phoneNumber || '(unknown)',
                        type: d.T_Type.STRONG
                    }, 'Text(phone-top)');
                    const sub = safeNew(d.T, {
                        text: truncSid(row.phoneSid),
                        type: d.T_Type.WEAK,
                        size: d.T.Size && d.T.Size.S
                    }, 'Text(phone-sub)');
                    return safeNew(d.SP, {
                        items: [top, sub].filter((c) => c != null),
                        orientation: d.SP_Orient.VERTICAL,
                        itemGap: d.SP_Gap.XXS
                    }, 'StackPanel(phone-cell)') || top || safeNew(d.T, { text: row.phoneNumber || '' }, 'Text(phone-fallback)');
                }
                catch (e) {
                    console.error('[CTC] phone column template threw:', e);
                    return safeNew(d.T, { text: '(error)' }, 'Text(phone-error)');
                }
            }
        };
        const IM = d.DG.InputMode;
        const repsDisplayMember = (value) => {
            if (value && typeof value === 'object') {
                return value.name || '';
            }
            const id = Number(value);
            const emp = (STATE.console.phonesEmployees || [])
                .find((e) => e.id === id);
            return emp ? (emp.name || '') : '';
        };
        const repsColDef = {
            type: CT.MULTI_SELECT_DROPDOWN,
            name: 'reps',
            label: 'Assigned reps',
            stretchFactor: 5,
            binding: 'employeeIds',
            inputMode: IM.EDIT_ONLY,
            dataSource: employeesDs,
            displayMember: repsDisplayMember,
            editable: true,
            widgetOptions: (row) => {
                const dataItem = (row && row.dataItem) || {};
                const phoneSid = dataItem.phoneSid;
                return {
                    dataSource: employeesDs,
                    valueMember: 'id',
                    displayMember: 'name',
                    placeholder: 'Pick reps',
                    onSelectionChanged: (args) => {
                        const newIds = ((args && args.values) || []).map((v) => {
                            if (v && typeof v === 'object')
                                return Number(v.id);
                            return Number(v);
                        });
                        if (phoneSid) {
                            deps.onPhonesRowSelectionChanged(phoneSid, newIds);
                        }
                    }
                };
            }
        };
        const statusColDef = {
            type: CT.TEMPLATED,
            name: 'status',
            label: 'Status',
            stretchFactor: 1,
            content: (args) => {
                try {
                    const row = args && args.cell && args.cell.row &&
                        args.cell.row.dataItem;
                    if (!row)
                        return safeNew(d.T, { text: '—' }, 'Text(status-empty)');
                    const saving = STATE.console.phonesSaving[row.phoneSid || ''];
                    const hasReps = (row.employeeIds || []).length > 0;
                    if (saving) {
                        return safeNew(d.Bdg, {
                            content: 'Saving…',
                            type: BdgType.SUBTLE
                        }, 'Badge(saving)') || safeNew(d.T, { text: 'Saving…' }, 'Text(saving-fallback)');
                    }
                    else if (hasReps) {
                        return safeNew(d.Bdg, {
                            content: '✓ Live',
                            type: BdgType.SOLID
                        }, 'Badge(live)') || safeNew(d.T, { text: '✓ Live' }, 'Text(live-fallback)');
                    }
                    return safeNew(d.Bdg, {
                        content: 'No reps',
                        type: BdgType.SUBTLE
                    }, 'Badge(no-reps)') || safeNew(d.T, { text: 'No reps' }, 'Text(no-reps-fallback)');
                }
                catch (e) {
                    console.error('[CTC] status column template threw:', e);
                    return safeNew(d.T, { text: '(error)' }, 'Text(status-error)');
                }
            }
        };
        const columns = [phoneColDef, repsColDef, statusColDef];
        const grid = safeNew(d.DG, {
            dataSource: rowsDs,
            columns: columns,
            columnStretch: true,
            highlightRowsOnHover: true,
            stripedRows: true,
            dataRowHeight: 72,
            headerRowHeight: 44,
            editable: true,
            rootStyle: { width: '100%' }
        }, 'DataGrid(phones)');
        if (!grid) {
            console.warn('[CTC] DataGrid construction returned null; using text fallback');
            return buildPhonesFallback(d);
        }
        return grid;
    };
    const buildPhonesFallback = (d) => {
        const grouped = (STATE.console.phonesByPhone || []);
        const rows = grouped.map((g) => {
            const label = (g.phoneNumber || '(unknown)') + ' — ' +
                (g.employeeIds || []).length + ' rep(s)';
            return safeNew(d.T, { text: label }, 'Text(phone-row)');
        }).filter((r) => r != null);
        if (rows.length === 0)
            return null;
        return safeNew(d.SP, {
            items: rows,
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.XS
        }, 'StackPanel(phones-fallback)');
    };

    const buildStep2Form = (d) => {
        const heading = safeNew(d.H, {
            content: 'Connect to your Twilio account',
            type: d.H_Type.MEDIUM_HEADING
        }, 'Heading(step2)');
        const intro = safeNew(d.T, {
            text: 'Enter your Twilio Account SID and API Key SID. ' +
                'The API Key Secret must already exist in NetSuite ' +
                'API Secrets (Setup > Company > API Secrets) — paste ' +
                'its script ID below. Live validation against Twilio ' +
                'runs at Step 5 (Test & activate) using the configured ' +
                'secret pointer — no need to paste the secret value here.'
        }, 'Text(step2-intro)');
        const fields = [
            buildTextField('Account SID', 'AC...', STATE.step2.accountSid, (v) => { STATE.step2.accountSid = v; }),
            buildTextField('API Key SID', 'SK...', STATE.step2.apiKeySid, (v) => { STATE.step2.apiKeySid = v; }),
            buildTextField('API Key Secret script ID', 'custsecret_...', STATE.step2.apiSecretId, (v) => { STATE.step2.apiSecretId = v; })
        ].filter((f) => f != null);
        const fieldsBlock = safeNew(d.GP, {
            columns: '1fr 1fr 1fr',
            rows: 'auto',
            items: fields,
            columnGap: (d.GP_Gap && d.GP_Gap.M) || undefined
        }, 'GridPanel(step2-fields)') || safeNew(d.SP, {
            items: fields,
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.M
        }, 'StackPanel(step2-fields-fallback)');
        const items = [heading, intro, fieldsBlock].filter((c) => c != null);
        return safeNew(d.SP, {
            items: items,
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.M
        }, 'StackPanel(step2)');
    };

    const buildStep3Form = (d) => {
        const rows = [];
        rows.push(safeNew(d.H, {
            content: 'Voice configuration',
            type: d.H_Type.MEDIUM_HEADING
        }, 'Heading(step3)'));
        rows.push(safeNew(d.T, {
            text: 'Pick the TwiML application, default outbound caller ' +
                'ID, and Conversational Intelligence service from your ' +
                'Twilio account. These are fetched live from Twilio ' +
                'using the secure API Secret configured in Step 2 — ' +
                "the secret value never leaves NetSuite's vault. " +
                'Conversational Intelligence is required: it produces ' +
                'the call transcripts that drive AI summaries and ' +
                'tone/satisfaction scoring.'
        }, 'Text(step3-intro)'));
        if (STATE.step3.twimlApps === null ||
            STATE.step3.phoneNumbers === null ||
            STATE.step3.intelServices === null) {
            const loader = safeNew(component__namespace.Loader, {
                label: 'Loading from Twilio…',
                indeterminate: true
            }, 'Loader(step3-lists)');
            if (loader)
                rows.push(loader);
            else
                rows.push(safeNew(d.T, {
                    text: 'Loading from Twilio…'
                }, 'Text(loading-fallback)'));
            return safeNew(d.SP, {
                items: rows.filter((r) => r != null),
                orientation: d.SP_Orient.VERTICAL,
                itemGap: d.SP_Gap.M
            }, 'StackPanel(step3-loading)');
        }
        if (STATE.step3.listLoadError) {
            rows.push(safeNew(d.T, {
                text: '✕ Could not load Twilio lists: ' +
                    STATE.step3.listLoadError + '. Verify the API ' +
                    'Secret value is set at Setup > Company > API ' +
                    'Secrets, then go back to Step 2 and Continue ' +
                    'again to retry.',
                type: d.T_Type.STRONG
            }, 'Text(step3-error)'));
            return safeNew(d.SP, {
                items: rows.filter((r) => r != null),
                orientation: d.SP_Orient.VERTICAL,
                itemGap: d.SP_Gap.M
            }, 'StackPanel(step3-error)');
        }
        rows.push(buildDropdownField(d, 'TwiML Application', (STATE.step3.twimlApps || []), STATE.step3.twimlAppSid, (sid) => { STATE.step3.twimlAppSid = sid || ''; }));
        rows.push(buildDropdownField(d, 'Default outbound caller ID', (STATE.step3.phoneNumbers || []).map((n) => {
            return {
                value: n.phoneNumber || '',
                label: (n.phoneNumber || '') +
                    (n.friendlyName ? ' — ' + n.friendlyName : '')
            };
        }), STATE.step3.phoneNumber, (val) => { STATE.step3.phoneNumber = val || ''; }, { valueIsString: true }));
        rows.push(buildDropdownField(d, 'Conversational Intelligence Service', (STATE.step3.intelServices || []), STATE.step3.intelServiceSid, (sid) => { STATE.step3.intelServiceSid = sid || ''; }));
        return safeNew(d.SP, {
            items: rows.filter((r) => r != null),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.M
        }, 'StackPanel(step3)');
    };
    const loadStep3Lists = (deps) => {
        STATE.step3.twimlApps = null;
        STATE.step3.phoneNumbers = null;
        STATE.step3.intelServices = null;
        STATE.step3.listLoadError = null;
        const handle = (field, payload) => {
            if (payload && payload.items) {
                STATE.step3[field] = payload.items;
                const first = payload.items[0];
                if (first) {
                    if (field === 'twimlApps' && !STATE.step3.twimlAppSid) {
                        STATE.step3.twimlAppSid = first.sid || '';
                    }
                    if (field === 'phoneNumbers' && !STATE.step3.phoneNumber) {
                        STATE.step3.phoneNumber = first.phoneNumber || '';
                    }
                    if (field === 'intelServices' && !STATE.step3.intelServiceSid) {
                        STATE.step3.intelServiceSid = first.sid || '';
                    }
                }
            }
            else {
                STATE.step3[field] = [];
                if (payload && payload.errorMessage) {
                    STATE.step3.listLoadError = payload.errorMessage;
                }
            }
            if (STATE.step3.twimlApps !== null &&
                STATE.step3.phoneNumbers !== null &&
                STATE.step3.intelServices !== null) {
                deps.rerender();
            }
        };
        wizardCall('wizardListTwiMLApps', {})
            .then((p) => { handle('twimlApps', p); })
            .catch((e) => {
            const err = e;
            STATE.step3.listLoadError = 'TwiML apps: ' +
                (err && err.message ? err.message : String(e));
            handle('twimlApps', null);
        });
        wizardCall('wizardListPhoneNumbers', {})
            .then((p) => { handle('phoneNumbers', p); })
            .catch((e) => {
            const err = e;
            STATE.step3.listLoadError = 'Phone numbers: ' +
                (err && err.message ? err.message : String(e));
            handle('phoneNumbers', null);
        });
        wizardCall('wizardListIntelServices', {})
            .then((p) => { handle('intelServices', p); })
            .catch((e) => {
            const err = e;
            STATE.step3.listLoadError = 'Intel services: ' +
                (err && err.message ? err.message : String(e));
            handle('intelServices', null);
        });
    };
    const buildDropdownField = (d, label, items, currentValue, onChange, opts) => {
        const o = opts || {};
        const normalized = (items || []).map((it) => {
            if (o.valueIsString)
                return it;
            const ti = it;
            return {
                value: ti.sid || '',
                label: (ti.friendlyName || '(unnamed)') +
                    (ti.sid ? '  [' + ti.sid + ']' : '')
            };
        });
        if (normalized.length === 0) {
            return safeNew(component__namespace.StackPanel, {
                items: [
                    safeNew(component__namespace.Text, {
                        text: label,
                        type: component__namespace.Text.Type.STRONG,
                        size: component__namespace.Text.Size.S
                    }, 'Text(label-' + label + ')'),
                    safeNew(component__namespace.Text, {
                        text: '(no items found in Twilio for this account)',
                        type: component__namespace.Text.Type.WEAK,
                        size: component__namespace.Text.Size.S
                    }, 'Text(empty-' + label + ')')
                ].filter((c) => c != null),
                orientation: component__namespace.StackPanel.Orientation.VERTICAL,
                itemGap: component__namespace.StackPanel.GapSize.XXS
            }, 'StackPanel(empty-' + label + ')');
        }
        const ds = new core__namespace.ArrayDataSource(normalized);
        const dropdown = safeNew(component__namespace.Dropdown, {
            dataSource: ds,
            valueMember: 'value',
            displayMember: 'label',
            selectedValue: currentValue || (o.allowEmpty ? null : normalized[0].value),
            allowEmpty: !!o.allowEmpty,
            placeholder: o.allowEmpty ? '(none)' : 'Select…',
            onSelectionChanged: (args) => {
                onChange(args && args.value);
            }
        }, 'Dropdown(' + label + ')');
        if (!dropdown) {
            return buildTextField(label, '', currentValue || '', (v) => onChange(v));
        }
        const lblText = safeNew(component__namespace.Text, {
            text: label,
            type: component__namespace.Text.Type.STRONG,
            size: component__namespace.Text.Size.S
        }, 'Text(label-' + label + ')');
        return safeNew(component__namespace.StackPanel, {
            items: [lblText, dropdown].filter((c) => c != null),
            orientation: component__namespace.StackPanel.Orientation.VERTICAL,
            itemGap: component__namespace.StackPanel.GapSize.XXS
        }, 'StackPanel(field-' + label + ')') || dropdown;
    };

    const buildStep4Form = (d) => {
        const rows = [];
        rows.push(safeNew(d.H, {
            content: 'Phone numbers & rep assignments',
            type: d.H_Type.MEDIUM_HEADING
        }, 'Heading(step4)'));
        rows.push(safeNew(d.T, {
            text: 'Assign reps to your Twilio phone numbers. Each rep ' +
                'with a number assigned will use it as their outbound ' +
                'caller ID. Reps without an assignment fall back to ' +
                'the default caller ID set in Step 3.'
        }, 'Text(step4-intro)'));
        if (STATE.step4.phoneNumbers === null ||
            STATE.step4.employees === null) {
            const loader = safeNew(component__namespace.Loader, {
                label: 'Loading phone numbers and employees…',
                indeterminate: true
            }, 'Loader(step4)');
            if (loader)
                rows.push(loader);
            return safeNew(d.SP, {
                items: rows.filter((r) => r != null),
                orientation: d.SP_Orient.VERTICAL,
                itemGap: d.SP_Gap.M
            }, 'StackPanel(step4-loading)');
        }
        if (STATE.step4.listLoadError) {
            rows.push(safeNew(d.T, {
                text: '✕ ' + STATE.step4.listLoadError,
                type: d.T_Type.STRONG
            }, 'Text(step4-error)'));
            return safeNew(d.SP, {
                items: rows.filter((r) => r != null),
                orientation: d.SP_Orient.VERTICAL,
                itemGap: d.SP_Gap.M
            }, 'StackPanel(step4-error)');
        }
        const phoneNumbers = (STATE.step4.phoneNumbers || []);
        if (phoneNumbers.length === 0) {
            rows.push(safeNew(d.T, {
                text: '(no phone numbers owned by this Twilio account — ' +
                    'buy one in Twilio Console before continuing)',
                type: d.T_Type.WEAK
            }, 'Text(step4-empty)'));
            return safeNew(d.SP, {
                items: rows.filter((r) => r != null),
                orientation: d.SP_Orient.VERTICAL,
                itemGap: d.SP_Gap.M
            }, 'StackPanel(step4-empty)');
        }
        for (const pn of phoneNumbers) {
            rows.push(buildStep4AssignmentRow(d, pn));
        }
        return safeNew(d.SP, {
            items: rows.filter((r) => r != null),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.L
        }, 'StackPanel(step4)');
    };
    const buildStep4AssignmentRow = (d, phoneNumber) => {
        const assignments = STATE.step4.assignments;
        const current = assignments[phoneNumber.sid] || {};
        const employees = (STATE.step4.employees || []);
        const pnLabel = safeNew(d.T, {
            text: (phoneNumber.phoneNumber || '') +
                (phoneNumber.friendlyName ? '  —  ' + phoneNumber.friendlyName : ''),
            type: d.T_Type.STRONG
        }, 'Text(step4-pn-' + phoneNumber.sid + ')');
        const dataItems = employees.map((e) => {
            return {
                value: e.id,
                label: (e.name || '') + (e.email ? ' (' + e.email + ')' : '')
            };
        });
        const ds = new core__namespace.ArrayDataSource(dataItems);
        const selectedItems = (current.employeeIds || []).map((id) => {
            return { value: id, label: lookupEmployeeName(id) };
        });
        const picker = safeNew(component__namespace.MultiselectDropdown, {
            dataSource: ds,
            valueMember: 'value',
            displayMember: 'label',
            selectedItems: selectedItems,
            placeholder: 'Assign reps…',
            onSelectionChanged: (args) => {
                const values = (args && args.values) || [];
                console.log('[CTC Setup Wizard] Step 4 picker — ' +
                    'phoneSid=' + phoneNumber.sid +
                    ' selected values:', values);
                if (!assignments[phoneNumber.sid]) {
                    assignments[phoneNumber.sid] = {};
                }
                assignments[phoneNumber.sid].employeeIds = values;
                const a = assignments[phoneNumber.sid];
                if (!a.primaryEmployeeId || values.indexOf(a.primaryEmployeeId) === -1) {
                    a.primaryEmployeeId = values.length > 0 ? values[0] : null;
                }
            }
        }, 'MultiselectDropdown(emp-' + phoneNumber.sid + ')');
        const children = [pnLabel, picker].filter((c) => c != null);
        return safeNew(d.SP, {
            items: children,
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.XS
        }, 'StackPanel(step4-row-' + phoneNumber.sid + ')');
    };
    const lookupEmployeeName = (id) => {
        const employees = (STATE.step4.employees || []);
        for (const emp of employees) {
            if (Number(emp.id) === Number(id))
                return emp.name || '';
        }
        return '(id ' + id + ')';
    };
    const loadStep4Lists = (deps) => {
        STATE.step4.phoneNumbers = null;
        STATE.step4.employees = null;
        STATE.step4.assignments = {};
        STATE.step4.listLoadError = null;
        const rerenderIfReady = () => {
            if (STATE.step4.phoneNumbers !== null &&
                STATE.step4.employees !== null) {
                deps.rerender();
            }
        };
        wizardCall('wizardListPhoneNumbers', {})
            .then((p) => {
            const resp = p;
            STATE.step4.phoneNumbers = (resp && resp.items) || [];
            if (resp && resp.errorMessage)
                STATE.step4.listLoadError = resp.errorMessage;
            rerenderIfReady();
        }).catch((e) => {
            const err = e;
            STATE.step4.phoneNumbers = [];
            STATE.step4.listLoadError = 'Phone numbers: ' +
                (err && err.message ? err.message : String(e));
            rerenderIfReady();
        });
        wizardCall('wizardListEmployees', {})
            .then((p) => {
            const resp = p;
            STATE.step4.employees = (resp && resp.items) || [];
            if (resp && resp.errorMessage)
                STATE.step4.listLoadError = resp.errorMessage;
            rerenderIfReady();
        }).catch((e) => {
            const err = e;
            STATE.step4.employees = [];
            STATE.step4.listLoadError = 'Employees: ' +
                (err && err.message ? err.message : String(e));
            rerenderIfReady();
        });
        wizardCall('wizardLoadAssignments', {})
            .then((p) => {
            const resp = p;
            const items = (resp && resp.items) || [];
            const map = {};
            items.forEach((a) => {
                if (!map[a.phoneSid]) {
                    map[a.phoneSid] = {
                        employeeIds: [],
                        label: a.label || '',
                        primaryEmployeeId: null
                    };
                }
                const empId = Number(a.employeeId);
                map[a.phoneSid].employeeIds.push(empId);
                if (a.isPrimary)
                    map[a.phoneSid].primaryEmployeeId = empId;
            });
            STATE.step4.assignments = map;
        }).catch(() => { });
    };

    const buildStep5Activate = (d, deps) => {
        const rows = [];
        rows.push(safeNew(d.H, {
            content: 'Test & activate',
            type: d.H_Type.MEDIUM_HEADING
        }, 'Heading(step5)'));
        if (STATE.step5.activated) {
            rows.push(safeNew(d.T, {
                text: '✓ Click-to-Call is active. Sales reps can now use ' +
                    'the phone icon on Customer, Lead, and Contact ' +
                    'records.',
                type: d.T_Type.STRONG
            }, 'Text(activated)'));
            const ButtonType = component__namespace.Button.Type;
            const consoleBtn = safeNew(component__namespace.Button, {
                label: 'Go to Admin Console',
                type: ButtonType.PRIMARY,
                action: deps.goToConsole
            }, 'Button(step5-to-console)');
            if (consoleBtn)
                rows.push(consoleBtn);
            return safeNew(d.SP, {
                items: rows.filter((r) => r != null),
                orientation: d.SP_Orient.VERTICAL,
                itemGap: d.SP_Gap.M
            }, 'StackPanel(step5-activated)');
        }
        if (STATE.step5.loading) {
            const loader = safeNew(component__namespace.Loader, {
                label: 'Running preflight checks…',
                indeterminate: true
            }, 'Loader(step5)');
            if (loader)
                rows.push(loader);
            return safeNew(d.SP, {
                items: rows.filter((r) => r != null),
                orientation: d.SP_Orient.VERTICAL,
                itemGap: d.SP_Gap.M
            }, 'StackPanel(step5-loading)');
        }
        if (STATE.step5.snapshot) {
            rows.push(safeNew(d.H, {
                content: 'Configuration review',
                type: d.H_Type.SMALL_HEADING
            }, 'Heading(review)'));
            const snap = STATE.step5.snapshot;
            const assignments = (STATE.step5.assignments || []);
            const assignmentCount = assignments.length;
            const phoneNumbersWithReps = {};
            assignments.forEach((a) => {
                if (a.phoneSid)
                    phoneNumbersWithReps[a.phoneSid] = true;
            });
            const lines = [
                'Account SID:        ' + (snap.accountSid || '(not set)'),
                'API Key SID:        ' + (snap.apiKeySid || '(not set)'),
                'API Key Secret:     ' + (snap.apiSecretId || '(not set)'),
                'TwiML Application:  ' + (snap.twimlAppSid || '(not set)'),
                'Default caller ID:  ' + (snap.phoneNumber || '(not set)'),
                'Intel Service:      ' + (snap.intelServiceSid || '(none)'),
                'Phone assignments:  ' + assignmentCount + ' rep(s) across ' +
                    Object.keys(phoneNumbersWithReps).length + ' number(s)'
            ];
            lines.forEach((l) => {
                rows.push(safeNew(d.T, {
                    text: l,
                    type: d.T_Type.DEFAULT,
                    size: d.T && d.T.Size ? d.T.Size.S : undefined
                }, 'Text(review-line)'));
            });
        }
        const preflight = (STATE.step5.preflight || null);
        if (preflight) {
            rows.push(safeNew(d.H, {
                content: 'Preflight checks',
                type: d.H_Type.SMALL_HEADING
            }, 'Heading(preflight)'));
            preflight.forEach((check) => {
                rows.push(buildCheckRow(check));
            });
        }
        const allPassed = preflight !== null &&
            preflight.every((c) => c.status === 'pass');
        const activateBtn = safeNew(component__namespace.Button, {
            label: allPassed ? 'Activate Click-to-Call'
                : 'Activate Click-to-Call (fix preflight first)',
            type: component__namespace.Button.Type.PRIMARY,
            enabled: allPassed,
            action: () => { onActivateClick(deps); }
        }, 'Button(activate)');
        if (activateBtn)
            rows.push(activateBtn);
        if (STATE.step5.activateError) {
            rows.push(safeNew(d.T, {
                text: '✕ Activation failed: ' + STATE.step5.activateError,
                type: d.T_Type.STRONG
            }, 'Text(activate-error)'));
        }
        const rerunBtn = safeNew(component__namespace.Button, {
            label: 'Re-run preflight',
            type: component__namespace.Button.Type.DEFAULT,
            action: () => { loadStep5(deps); }
        }, 'Button(rerun-preflight)');
        if (rerunBtn)
            rows.push(rerunBtn);
        return safeNew(d.SP, {
            items: rows.filter((r) => r != null),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.M
        }, 'StackPanel(step5)');
    };
    const loadStep5 = (deps) => {
        STATE.step5.loading = true;
        STATE.step5.activateError = null;
        STATE.step5.snapshot = null;
        STATE.step5.assignments = null;
        STATE.step5.preflight = null;
        deps.rerender();
        let settled = 0;
        const onSettled = () => {
            settled += 1;
            if (settled >= 3) {
                STATE.step5.loading = false;
                deps.rerender();
            }
        };
        wizardCall('wizardSnapshot', {})
            .then((p) => { STATE.step5.snapshot = p && p.snapshot; })
            .catch(() => { STATE.step5.snapshot = null; })
            .then(onSettled);
        wizardCall('wizardLoadAssignments', {})
            .then((p) => {
            const resp = p;
            STATE.step5.assignments = (resp && resp.items) || [];
        })
            .catch(() => { STATE.step5.assignments = []; })
            .then(onSettled);
        wizardCall('wizardRunPreflight', {})
            .then((p) => {
            const resp = p;
            STATE.step5.preflight = (resp && resp.checks) || [];
        }).catch((e) => {
            const err = e;
            STATE.step5.preflight = [{
                    id: 'network', label: 'Preflight call', status: 'fail',
                    detail: 'Network error: ' +
                        (err && err.message ? err.message : String(e))
                }];
        }).then(onSettled);
    };
    const onActivateClick = (deps) => {
        wizardCall('wizardActivate', {})
            .then((payload) => {
            const resp = payload;
            if (resp && resp.activated) {
                STATE.step5.activated = true;
                STATE.step5.activateError = null;
            }
            else {
                STATE.step5.activateError = (resp && resp.error) || 'unknown';
                if (resp && resp.failedChecks) {
                    STATE.step5.preflight = resp.failedChecks;
                }
            }
            deps.rerender();
        }).catch((e) => {
            const err = e;
            STATE.step5.activateError = 'Network: ' +
                (err && err.message ? err.message : String(e));
            deps.rerender();
        });
    };

    var STEPS = [
        { num: 1, label: 'Prerequisites', sub: 'Setup checks' },
        { num: 2, label: 'Connect Twilio', sub: 'SIDs & secrets' },
        { num: 3, label: 'Voice config', sub: 'TwiML & caller ID' },
        { num: 4, label: 'Phone numbers', sub: 'Claim & assign' },
        { num: 5, label: 'Test & activate', sub: 'Review & go live' }
    ];
    var scriptCtx = null;
    var bodyContainer = null;
    var enums = null;
    var run = function (scriptContext) {
        try {
            var SP = component__namespace.StackPanel;
            var CP = component__namespace.ContentPanel;
            var H = component__namespace.Heading;
            var T = component__namespace.Text;
            var Stp = component__namespace.Stepper;
            var SI = component__namespace.StepperItem;
            var ND = component__namespace.NavigationDrawer;
            var GP = component__namespace.GridPanel;
            var Bn = component__namespace.Banner;
            var Cd = component__namespace.Card;
            var Tb = component__namespace.ToolBar;
            var Sp = component__namespace.ScrollPanel;
            var DG = component__namespace.DataGrid;
            var TC = component__namespace.TemplatedColumn;
            var MDC = component__namespace.MultiselectDropdownColumn;
            var Bdg = component__namespace.Badge;
            var Ads = core__namespace.ArrayDataSource;
            var SP_Orient = SP.Orientation;
            var SP_Gap = SP.GapSize;
            var CP_Gap = CP.GapSize;
            var CP_HAlign = CP.HorizontalAlignment;
            var H_Type = H.Type;
            var T_Type = T.Type;
            var Stp_Orient = Stp.Orientation;
            var Bn_Color = Bn.Color;
            var GP_Gap = GP.GapSize;
            var SysIcon = core__namespace.SystemIcon;
            enums = {
                SP: SP, CP: CP, H: H, T: T, Stp: Stp, SI: SI,
                ND: ND, GP: GP, Bn: Bn, Cd: Cd, Tb: Tb,
                Sp: Sp,
                DG: DG, TC: TC, MDC: MDC, Bdg: Bdg, Ads: Ads,
                SP_Orient: SP_Orient,
                SP_Gap: SP_Gap,
                CP_Gap: CP_Gap,
                CP_HAlign: CP_HAlign,
                H_Type: H_Type,
                T_Type: T_Type,
                Stp_Orient: Stp_Orient,
                Bn_Color: Bn_Color,
                GP_Gap: GP_Gap,
                SysIcon: SysIcon
            };
            scriptCtx = scriptContext;
            try {
                if (scriptContext && typeof scriptContext.setLayout === 'function') {
                    scriptContext.setLayout('application');
                }
            }
            catch (e) {
                console.warn("[CTC Setup Wizard] setLayout('application') " +
                    "failed; rail may not fill viewport:", e);
            }
            rerender();
            loadPrereqs();
            wizardCall('wizardSnapshot', {}).then(function (payload) {
                var snap = payload && payload.snapshot;
                if (!snap)
                    return;
                var target = determineLandingStep(snap);
                if (target === 'console') {
                    console.log("[CTC Setup Wizard] resumability — routing to Admin Console");
                    goToConsole();
                }
                else if (target !== CURRENT_STEP) {
                    console.log("[CTC Setup Wizard] resumability — routing to step " + target);
                    goToStep(target);
                }
            }).catch(function (e) {
                console.warn("[CTC Setup Wizard] resumability snapshot " +
                    "failed; staying on Step 1:", e);
            });
        }
        catch (e) {
            console.error("[CTC Setup Wizard] run() threw:", e);
        }
    };
    function determineLandingStep(snap) {
        var has = function (v) {
            return !!(v && String(v).trim().length > 0);
        };
        if (!has(snap.accountSid) || !has(snap.apiKeySid))
            return 2;
        if (!has(snap.apiSecretId))
            return 2;
        if (!has(snap.twimlAppSid) || !has(snap.phoneNumber))
            return 3;
        return 'console';
    }
    function rerender() {
        if (!scriptCtx || !enums)
            return;
        try {
            var root = buildRoot(enums);
            scriptCtx.setContent(root);
            console.log("[CTC Setup Wizard] rerender — step " + CURRENT_STEP);
        }
        catch (e) {
            console.error("[CTC Setup Wizard] rerender threw:", e);
        }
    }
    function goToStep(stepNum) {
        setMode('stepper');
        setCurrentStep(Math.max(1, Math.min(STEPS.length, stepNum)));
        rerender();
        if (CURRENT_STEP === 1)
            loadPrereqs();
        if (CURRENT_STEP === 3)
            loadStep3Lists({ rerender: rerender });
        if (CURRENT_STEP === 4)
            loadStep4Lists({ rerender: rerender });
        if (CURRENT_STEP === 5)
            loadStep5({ rerender: rerender, goToConsole: goToConsole });
    }
    function goToConsole() {
        setMode('console');
        setSelectedSection('overview');
        setRailVisible(true);
        STATE.console.pendingDeactivateConfirm = false;
        STATE.console.deactivateError = null;
        STATE.console.actionError = null;
        STATE.console.activeModal = null;
        loadConsole();
    }
    function loadConsole() {
        STATE.console.loading = true;
        STATE.console.snapshot = null;
        STATE.console.assignments = null;
        STATE.console.preflight = null;
        STATE.console.recentCalls = null;
        STATE.console.drift = null;
        rerender();
        var settled = 0;
        var TARGET = 5;
        function onSettled() {
            settled += 1;
            if (settled >= TARGET) {
                STATE.console.drift = computeDrift(STATE.console.snapshot);
                STATE.console.loading = false;
                rerender();
            }
        }
        wizardCall('wizardSnapshot', {})
            .then(function (p) {
            var resp = p;
            STATE.console.snapshot = (resp && resp.snapshot) || null;
        })
            .catch(function () { STATE.console.snapshot = null; })
            .then(onSettled);
        wizardCall('wizardLoadAssignments', {})
            .then(function (p) {
            var resp = p;
            STATE.console.assignments = (resp && resp.items) || [];
            STATE.console.phonesByPhone =
                groupAssignmentsByPhone(STATE.console.assignments);
        })
            .catch(function () {
            STATE.console.assignments = [];
            STATE.console.phonesByPhone = [];
        })
            .then(onSettled);
        wizardCall('wizardRunPreflight', {})
            .then(function (p) {
            var resp = p;
            STATE.console.preflight = (resp && resp.checks) || [];
        })
            .catch(function () { STATE.console.preflight = []; })
            .then(onSettled);
        wizardCall('wizardListRecentCalls', { limit: 10 })
            .then(function (p) {
            var resp = p;
            STATE.console.recentCalls = (resp && resp.items) || [];
        })
            .catch(function () { STATE.console.recentCalls = []; })
            .then(onSettled);
        wizardCall('wizardListEmployees', {})
            .then(function (p) {
            var resp = p;
            var items = (resp && resp.items) || [];
            STATE.console.phonesEmployees = items.map(function (e) {
                var emp = e;
                return {
                    id: Number(emp.id),
                    name: emp.name || '(no name)',
                    email: emp.email || ''
                };
            });
        })
            .catch(function () { STATE.console.phonesEmployees = []; })
            .then(onSettled);
    }
    function computeDrift(snapshot, _assignments) {
        if (!snapshot)
            return { phoneNumbers: 'unknown', voiceUrl: 'unknown',
                intelService: 'unknown' };
        var snap = snapshot;
        return {
            phoneNumbers: 'in-sync',
            voiceUrl: 'in-sync',
            intelService: snap.intelServiceSid ? 'in-sync' : 'not-configured'
        };
    }
    function goToSection(sectionName) {
        setSelectedSection(sectionName);
        if (MODE === 'stepper') {
            setMode('console');
        }
        STATE.console.pendingDeactivateConfirm = false;
        STATE.console.actionError = null;
        rerender();
        if (sectionName === 'phones' &&
            STATE.console.phonesNumbers === null) {
            loadPhonesData();
        }
    }
    function groupAssignmentsByPhone(flatRows) {
        var grouped = {};
        (flatRows || []).forEach(function (r) {
            if (!r.phoneSid)
                return;
            if (!grouped[r.phoneSid]) {
                grouped[r.phoneSid] = {
                    phoneSid: r.phoneSid,
                    phoneNumber: r.phoneNumber || '',
                    employeeIds: [],
                    primaryEmployeeId: null
                };
            }
            var bucket = grouped[r.phoneSid];
            var empId = Number(r.employeeId);
            if (empId && bucket.employeeIds.indexOf(empId) === -1) {
                bucket.employeeIds.push(empId);
            }
            if (r.isPrimary && !bucket.primaryEmployeeId) {
                bucket.primaryEmployeeId = empId;
            }
        });
        Object.keys(grouped).forEach(function (sid) {
            var b = grouped[sid];
            if (!b.primaryEmployeeId && b.employeeIds.length > 0) {
                b.primaryEmployeeId = b.employeeIds[0];
            }
        });
        return Object.keys(grouped).map(function (sid) { return grouped[sid]; });
    }
    function loadPhonesData() {
        STATE.console.phonesLoading = true;
        STATE.console.phonesError = null;
        rerender();
        wizardCall('wizardListPhoneNumbers', {})
            .then(function (p) {
            var resp = p;
            STATE.console.phonesNumbers = (resp && resp.items) || [];
        })
            .catch(function (e) {
            var err = e;
            STATE.console.phonesNumbers = [];
            STATE.console.phonesError = 'Could not load phone numbers: ' +
                (err && err.message ? err.message : String(e));
        })
            .then(function () {
            STATE.console.phonesLoading = false;
            rerender();
        });
    }
    function onPhonesRowSelectionChanged(phoneSid, newEmployeeIds) {
        STATE.console.phonesSaving[phoneSid] = true;
        STATE.console.phonesError = null;
        var grouped = (STATE.console.phonesByPhone || []);
        for (var i = 0; i < grouped.length; i++) {
            if (grouped[i].phoneSid === phoneSid) {
                grouped[i].employeeIds = newEmployeeIds;
                var current = grouped[i].primaryEmployeeId;
                if (!current || newEmployeeIds.indexOf(current) === -1) {
                    grouped[i].primaryEmployeeId = newEmployeeIds.length > 0
                        ? newEmployeeIds[0] : null;
                }
                break;
            }
        }
        rerender();
        var payload = {
            assignments: grouped.map(function (g) {
                return {
                    phoneSid: g.phoneSid,
                    phoneNumber: g.phoneNumber || '',
                    employeeIds: g.employeeIds || [],
                    primaryEmployeeId: g.primaryEmployeeId || null
                };
            })
        };
        wizardCall('wizardSaveAssignments', payload)
            .then(function (resp) {
            var r = resp;
            STATE.console.phonesSaving[phoneSid] = false;
            if (!r || r.ok === false || r.error) {
                STATE.console.phonesError =
                    'Save failed: ' + ((r && r.error) || 'unknown');
                wizardCall('wizardLoadAssignments', {}).then(function (p2) {
                    var r2 = p2;
                    STATE.console.assignments = (r2 && r2.items) || [];
                    STATE.console.phonesByPhone =
                        groupAssignmentsByPhone(STATE.console.assignments);
                    rerender();
                });
            }
            rerender();
        })
            .catch(function (e) {
            var err = e;
            STATE.console.phonesSaving[phoneSid] = false;
            STATE.console.phonesError = 'Network: ' +
                (err && err.message ? err.message : String(e));
            rerender();
        });
    }
    function onDeactivateClick() {
        if (!STATE.console.pendingDeactivateConfirm) {
            STATE.console.pendingDeactivateConfirm = true;
            STATE.console.actionError = null;
            if (SELECTED_SECTION !== 'health') {
                setSelectedSection('health');
                if (MODE === 'stepper')
                    setMode('console');
            }
            rerender();
            return;
        }
        STATE.console.deactivateError = null;
        wizardCall('wizardActivate', { deactivate: true })
            .then(function (payload) {
            var resp = payload;
            if (resp && resp.deactivated) {
                STATE.console.pendingDeactivateConfirm = false;
                if (STATE.console.snapshot) {
                    STATE.console.snapshot.active = false;
                }
                rerender();
            }
            else {
                STATE.console.deactivateError =
                    (resp && resp.error) || 'unknown_error';
                rerender();
            }
        })
            .catch(function (e) {
            var err = e;
            STATE.console.deactivateError = 'Network: ' +
                (err && err.message ? err.message : String(e));
            rerender();
        });
    }
    function onReactivateClick() {
        STATE.console.actionError = null;
        wizardCall('wizardActivate', {})
            .then(function (payload) {
            var resp = payload;
            if (resp && (resp.activated || resp.alreadyActive)) {
                if (STATE.console.snapshot) {
                    STATE.console.snapshot.active = true;
                }
                rerender();
            }
            else {
                STATE.console.actionError =
                    (resp && resp.error) || 'reactivate_failed';
                if (resp && resp.failedChecks) {
                    STATE.console.preflight = resp.failedChecks;
                }
                rerender();
            }
        })
            .catch(function (e) {
            var err = e;
            STATE.console.actionError = 'Network: ' +
                (err && err.message ? err.message : String(e));
            rerender();
        });
    }
    function loadPrereqs() {
        if (!bodyContainer) {
            console.warn("[CTC Setup Wizard] bodyContainer missing — " +
                "cannot render prereqs");
            return;
        }
        console.log("[CTC Setup Wizard] Calling wizardPrereqs...");
        wizardCall('wizardPrereqs', {}).then(function (payload) {
            var resp = payload;
            var body;
            if (resp && resp.ok && resp.checks) {
                body = buildPrereqsList(resp.checks);
            }
            else if (resp && resp.error) {
                body = buildErrorBox(resp.error);
            }
            else {
                body = buildErrorBox('unexpected response shape — see console');
            }
            var stack = safeNew(component__namespace.StackPanel, {
                items: [body, buildNavFooter(enums)]
                    .filter(function (c) { return c != null; }),
                orientation: component__namespace.StackPanel.Orientation.VERTICAL,
                itemGap: component__namespace.StackPanel.GapSize.L
            }, "StackPanel(prereqs+footer)") || body;
            try {
                bodyContainer.setContent(stack);
            }
            catch (e) {
                console.error("[CTC Setup Wizard] bodyContainer.setContent " +
                    "failed:", e);
            }
        }).catch(function (err) {
            console.error("[CTC Setup Wizard] wizardPrereqs Ajax failed:", err);
            try {
                bodyContainer.setContent(buildErrorBox('Network or server error calling wizardPrereqs — ' +
                    'check browser DevTools Network tab and the NetSuite ' +
                    'Script Execution Log for details.'));
            }
            catch (e) { }
        });
    }
    function buildRoot(d) {
        var railVisible = MODE === 'console' ||
            (MODE === 'stepper' && RAIL_VISIBLE);
        if (railVisible) {
            var drawer = buildConsoleNavDrawer(d);
            var contentPane = buildRailContentPane(d);
            var rootChildren = [drawer, contentPane]
                .filter(function (c) { return c != null; });
            if (d.GP && rootChildren.length === 2) {
                var GP_Gap = d.GP_Gap || (d.GP && d.GP.GapSize) || {};
                var rootGrid = safeNew(d.GP, {
                    columns: 'auto 1fr',
                    rows: '100%',
                    items: rootChildren,
                    columnGap: GP_Gap.NONE
                }, "GridPanel(root-rail)");
                if (rootGrid)
                    return rootGrid;
            }
            return safeNew(d.SP, {
                items: rootChildren,
                orientation: d.SP_Orient.VERTICAL,
                itemGap: d.SP_Gap.M
            }, "StackPanel(root-rail-fallback)") || rootChildren[0];
        }
        var title = safeNew(d.H, {
            content: "Click-to-Call Setup Wizard",
            type: d.H_Type.PAGE_TITLE
        }, "Heading(title)");
        var subtitle = safeNew(d.T, {
            text: "Step " + CURRENT_STEP + " of " + STEPS.length + " — " +
                STEPS[CURRENT_STEP - 1].label
        }, "Text(subtitle)");
        var stepper = buildStepper(d);
        var stepperBox = null;
        if (stepper) {
            stepperBox = safeNew(d.CP, {
                content: stepper,
                horizontalAlignment: d.CP_HAlign.STRETCH,
                outerGap: d.CP_Gap.M
            }, "ContentPanel(stepper, STRETCH)") || stepper;
        }
        var bodyBox = buildStepBodyContainer(d);
        var children = [title, subtitle, stepperBox, bodyBox]
            .filter(function (c) { return c != null; });
        var stack = safeNew(d.SP, {
            items: children,
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.L
        }, "StackPanel(outer)");
        if (!stack)
            return title || subtitle;
        var page = safeNew(d.CP, {
            content: stack,
            horizontalAlignment: d.CP_HAlign.STRETCH,
            outerGap: d.CP_Gap.L
        }, "ContentPanel(page)");
        return page || stack;
    }
    function buildRailContentPane(d) {
        if (STATE.console.loading && MODE === 'console') {
            var loader = safeNew(component__namespace.Loader, {
                label: "Loading console…",
                indeterminate: true
            }, "Loader(console)");
            return wrapContent(d, loader || safeNew(d.T, { text: "Loading…" }, "Text(loading)"));
        }
        var items = [];
        var titleText = MODE === 'console'
            ? "Click-to-Call Admin Console"
            : "Click-to-Call Setup Wizard";
        var title = safeNew(d.H, {
            content: titleText,
            type: d.H_Type.PAGE_TITLE
        }, "Heading(content-title)");
        if (title)
            items.push(title);
        if (MODE === 'console' && STATE.console.snapshot
            && STATE.console.snapshot.active === false) {
            var paused = buildPausedBanner(d, onReactivateClick);
            if (paused)
                items.push(paused);
        }
        if (MODE === 'console') {
            var section = buildSectionContent(d);
            if (section)
                items.push(section);
        }
        else {
            var subtitle = safeNew(d.T, {
                text: "Step " + CURRENT_STEP + " of " + STEPS.length + " — " +
                    STEPS[CURRENT_STEP - 1].label
            }, "Text(rail-subtitle)");
            if (subtitle)
                items.push(subtitle);
            var stepperWidget = buildStepper(d);
            if (stepperWidget) {
                var stepperBox = safeNew(d.CP, {
                    content: stepperWidget,
                    horizontalAlignment: d.CP_HAlign.STRETCH,
                    outerGap: d.CP_Gap.M
                }, "ContentPanel(rail-stepper)") || stepperWidget;
                items.push(stepperBox);
            }
            var stepBody = buildStepBodyContainer(d);
            if (stepBody)
                items.push(stepBody);
        }
        if (items.length === 0) {
            return wrapContent(d, safeNew(d.T, {
                text: "Admin Console — no content rendered."
            }, "Text(console-empty)"));
        }
        var stack = safeNew(d.SP, {
            items: items,
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.L
        }, "StackPanel(rail-content)");
        return wrapContent(d, stack || items[0]);
    }
    function buildConsoleNavDrawer(d) {
        if (!d.ND) {
            return buildNavFallback(d);
        }
        var assignmentBadge = STATE.console.assignments
            ? String(STATE.console.assignments.length)
            : null;
        var SysIcon = d.SysIcon || {};
        var navItems = [
            { value: 'overview', label: 'Overview', icon: SysIcon.HOME },
            { value: 'phones', label: 'Phones & reps', icon: SysIcon.CALL,
                badge: assignmentBadge || undefined },
            { value: 'voice', label: 'Voice config', icon: SysIcon.SETTINGS },
            { value: 'credentials', label: 'Credentials', icon: SysIcon.LOCK },
            { value: 'health', label: 'Health', icon: SysIcon.HEART_FILLED },
            { value: 're-run', label: 'Re-run wizard', icon: SysIcon.REFRESH,
                separatorTop: true,
                action: function () { goToStep(1); } }
        ];
        var selectedVal = MODE === 'stepper' ? 're-run' : SELECTED_SECTION;
        var VisualStyle = (d.ND && d.ND.VisualStyle) || {};
        return safeNew(d.ND, {
            items: navItems,
            selectedValue: selectedVal,
            width: 240,
            visualStyle: VisualStyle.DARK,
            onSelectedValueChanged: function (args) {
                var value = args && args.value;
                if (!value)
                    return;
                if (value === 're-run') {
                    goToStep(1);
                    return;
                }
                goToSection(value);
            }
        }, "NavigationDrawer(console)");
    }
    function buildNavFallback(d) {
        var ButtonType = component__namespace.Button.Type;
        var navSpecs = [
            { value: 'overview', label: 'Overview' },
            { value: 'phones', label: 'Phones & reps' },
            { value: 'voice', label: 'Voice config' },
            { value: 'credentials', label: 'Credentials' },
            { value: 'health', label: 'Health' },
            { value: 're-run', label: '↻ Re-run wizard' }
        ];
        var buttons = navSpecs.map(function (spec) {
            return safeNew(component__namespace.Button, {
                label: spec.label,
                type: spec.value === SELECTED_SECTION
                    ? ButtonType.PRIMARY
                    : ButtonType.DEFAULT,
                action: function () {
                    if (spec.value === 're-run')
                        goToStep(1);
                    else
                        goToSection(spec.value);
                }
            }, "Button(nav-" + spec.value + ")");
        }).filter(function (b) { return b != null; });
        if (buttons.length === 0)
            return null;
        return safeNew(d.SP, {
            items: buttons,
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.XS
        }, "StackPanel(nav-fallback)");
    }
    function buildSectionContent(d) {
        switch (SELECTED_SECTION) {
            case 'overview': return buildOverviewSection(d, {
                goToSection: goToSection,
                onDeactivateClick: onDeactivateClick
            });
            case 'phones': return buildPhonesSection(d, {
                loadPhonesData: loadPhonesData,
                goToStep: goToStep,
                onPhonesRowSelectionChanged: onPhonesRowSelectionChanged
            });
            case 'voice': return buildVoiceSection(d, { rerender: rerender });
            case 'credentials': return buildCredentialsSection(d);
            case 'health': return buildHealthSection(d, {
                rerender: rerender,
                onDeactivateClick: onDeactivateClick
            });
            default: return buildOverviewSection(d, {
                goToSection: goToSection,
                onDeactivateClick: onDeactivateClick
            });
        }
    }
    function buildStepBodyContainer(d) {
        var initial;
        if (CURRENT_STEP === 1) {
            initial = safeNew(component__namespace.Loader, {
                label: "Running prerequisite checks…",
                indeterminate: true
            }, "Loader(prereqs)") || safeNew(d.T, {
                text: "Loading prerequisite checks…"
            }, "Text(loading-fallback)");
        }
        else if (CURRENT_STEP === 2) {
            initial = buildStep2Form(d);
        }
        else if (CURRENT_STEP === 3) {
            initial = buildStep3Form(d);
        }
        else if (CURRENT_STEP === 4) {
            initial = buildStep4Form(d);
        }
        else if (CURRENT_STEP === 5) {
            initial = buildStep5Activate(d, {
                rerender: rerender,
                goToConsole: goToConsole
            });
        }
        else {
            initial = safeNew(d.T, {
                text: "Step " + CURRENT_STEP + " not implemented.",
                type: d.T_Type.WEAK
            }, "Text(stub-step-" + CURRENT_STEP + ")");
        }
        var stack = safeNew(d.SP, {
            items: [initial, buildNavFooter(d)]
                .filter(function (c) { return c != null; }),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.L
        }, "StackPanel(body+footer)");
        var box = safeNew(d.CP, {
            content: stack || initial,
            horizontalAlignment: d.CP_HAlign.STRETCH,
            outerGap: d.CP_Gap.L
        }, "ContentPanel(body)");
        bodyContainer = box;
        return box;
    }
    function buildNavFooter(d) {
        var ButtonType = component__namespace.Button.Type;
        var backBtn = (CURRENT_STEP > 1) ? safeNew(component__namespace.Button, {
            label: "Back",
            type: ButtonType.DEFAULT,
            action: function () { goToStep(CURRENT_STEP - 1); }
        }, "Button(back)") : null;
        var nextBtn = (CURRENT_STEP < STEPS.length) ? safeNew(component__namespace.Button, {
            label: "Continue",
            type: ButtonType.PRIMARY,
            action: function () { onContinueClick(); }
        }, "Button(continue)") : null;
        var items = [backBtn, nextBtn]
            .filter(function (c) { return c != null; });
        if (items.length === 0)
            return null;
        return safeNew(d.SP, {
            items: items,
            orientation: d.SP_Orient.HORIZONTAL,
            itemGap: d.SP_Gap.M
        }, "StackPanel(nav-footer)");
    }
    function onContinueClick() {
        if (CURRENT_STEP === 1) {
            goToStep(2);
            return;
        }
        if (CURRENT_STEP === 2) {
            wizardCall('wizardSavePublicIds', {
                accountSid: STATE.step2.accountSid,
                apiKeySid: STATE.step2.apiKeySid,
                apiSecretId: STATE.step2.apiSecretId
            }).then(function (payload) {
                if (payload && payload.saved)
                    goToStep(3);
                else
                    alert("Save failed: " +
                        ((payload && payload.error) || 'unknown'));
            }).catch(function (e) {
                alert("Network error saving Step 2: " +
                    (e && e.message ? e.message : String(e)));
            });
            return;
        }
        if (CURRENT_STEP === 3) {
            wizardCall('wizardSaveVoice', {
                twimlAppSid: STATE.step3.twimlAppSid,
                phoneNumber: STATE.step3.phoneNumber,
                intelServiceSid: STATE.step3.intelServiceSid
            }).then(function (payload) {
                if (payload && payload.saved)
                    goToStep(4);
                else
                    alert("Save failed: " +
                        ((payload && payload.error) || 'unknown'));
            }).catch(function (e) {
                alert("Network error saving Step 3: " +
                    (e && e.message ? e.message : String(e)));
            });
            return;
        }
        if (CURRENT_STEP === 4) {
            var rows = [];
            var phoneNumbers = (STATE.step4.phoneNumbers || []);
            var assignmentsMap = STATE.step4.assignments;
            for (var i = 0; i < phoneNumbers.length; i++) {
                var pn = phoneNumbers[i];
                var assignment = assignmentsMap[pn.sid] || {};
                var employeeIds = assignment.employeeIds || [];
                if (employeeIds.length === 0)
                    continue;
                rows.push({
                    phoneSid: pn.sid,
                    phoneNumber: pn.phoneNumber,
                    label: assignment.label || pn.friendlyName || '',
                    employeeIds: employeeIds,
                    primaryEmployeeId: assignment.primaryEmployeeId || employeeIds[0]
                });
            }
            console.log("[CTC Setup Wizard] Step 4 Continue — STATE.step4.assignments:", STATE.step4.assignments);
            console.log("[CTC Setup Wizard] Step 4 Continue — payload rows (" +
                rows.length + "):", rows);
            wizardCall('wizardSaveAssignments', { assignments: rows })
                .then(function (payload) {
                console.log("[CTC Setup Wizard] saveAssignments response:", payload);
                if (payload && payload.saved)
                    goToStep(5);
                else
                    alert("Save failed: " +
                        ((payload && payload.error) || 'unknown'));
            }).catch(function (e) {
                alert("Network error saving Step 4: " +
                    (e && e.message ? e.message : String(e)));
            });
            return;
        }
        goToStep(CURRENT_STEP + 1);
    }
    function buildStepper(d) {
        var Badge = component__namespace.Badge;
        var BadgeType = Badge.Type;
        var BadgeSize = Badge.Size;
        var TextType = d.T.Type;
        var TextSize = d.T.Size;
        var SPAlign = d.SP.Alignment;
        var SPJust = d.SP.Justification;
        var pills = STEPS.map(function (s) {
            var isCurrent = (s.num === CURRENT_STEP);
            var isDone = (s.num < CURRENT_STEP);
            var badge = safeNew(Badge, {
                content: isDone ? "✓" : String(s.num),
                type: isCurrent || isDone
                    ? BadgeType.SOLID
                    : BadgeType.SUBTLE,
                size: BadgeSize.DEFAULT
            }, "Badge(" + s.num + ")");
            var label = safeNew(d.T, {
                text: s.label,
                type: isCurrent ? TextType.STRONG : TextType.DEFAULT
            }, "Text(label-" + s.num + ")");
            var sublabel = safeNew(d.T, {
                text: s.sub,
                type: TextType.WEAK,
                size: TextSize.S
            }, "Text(sub-" + s.num + ")");
            var pillItems = [badge, label, sublabel]
                .filter(function (c) { return c != null; });
            return safeNew(d.SP, {
                items: pillItems,
                orientation: d.SP_Orient.VERTICAL,
                alignment: SPAlign.CENTER,
                itemGap: d.SP_Gap.XS
            }, "StackPanel(pill-" + s.num + ")");
        }).filter(function (p) { return p != null; });
        if (pills.length === 0)
            return null;
        return safeNew(d.SP, {
            items: pills,
            orientation: d.SP_Orient.HORIZONTAL,
            justification: SPJust.SPACE_BETWEEN,
            itemGap: d.SP_Gap.M
        }, "StackPanel(stepper-strip)");
    }

    exports.run = run;

}));
