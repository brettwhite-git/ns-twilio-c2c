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

    const wrapContent = (d, child) => {
        if (!d.CP)
            return child;
        const Gap = d.CP_Gap || {};
        const padded = safeNew(d.CP, {
            content: child,
            horizontalAlignment: d.CP_HAlign.STRETCH,
            outerGap: {
                start: Gap.XXL,
                end: Gap.XXL,
                vertical: Gap.M
            }
        }, 'ContentPanel(rail-wrapper)') || child;
        if (!d.Sp)
            return padded;
        const Sp_Orient = (d.Sp && d.Sp.Orientation) || {};
        return safeNew(d.Sp, {
            content: padded,
            orientation: Sp_Orient.VERTICAL
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
        return safeNew(d.Bn, {
            title: 'Click-to-Call is paused',
            content: contentRow,
            color: d.Bn_Color.ORANGE,
            showControls: false
        }, 'Banner(paused)');
    };
    const buildStatCard = (d, spec) => {
        try {
            return d.Cd.metric({
                title: spec.title,
                metric: spec.metric,
                description: spec.description
            });
        }
        catch (e) {
            console.warn('[CTC Setup Wizard] Card.metric threw, ' +
                'falling back to manual stack:', e);
        }
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
            console.log("[CTC Setup Wizard] === REAL API PASS ===");
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
            var SP_Orient = SP && SP.Orientation || {};
            var SP_Gap = SP && SP.GapSize || {};
            var CP_Gap = CP && CP.GapSize || {};
            var CP_HAlign = CP && CP.HorizontalAlignment || {};
            var H_Type = H && H.Type || {};
            var T_Type = T && T.Type || {};
            var Stp_Orient = (Stp && Stp.Orientation) ||
                (SI && SI.Orientation) || {};
            var Bn_Color = Bn && Bn.Color || {};
            var GP_Gap = GP && GP.GapSize || {};
            var SysIcon = (core__namespace && core__namespace.SystemIcon) || {};
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
        var has = function (v) { return !!(v && String(v).trim().length > 0); };
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
            loadStep3Lists();
        if (CURRENT_STEP === 4)
            loadStep4Lists();
        if (CURRENT_STEP === 5)
            loadStep5();
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
        STATE.console.drift = null;
        rerender();
        var settled = 0;
        var TARGET = 4;
        function onSettled() {
            settled += 1;
            if (settled >= TARGET) {
                STATE.console.drift = computeDrift(STATE.console.snapshot);
                STATE.console.loading = false;
                rerender();
            }
        }
        wizardCall('wizardSnapshot', {})
            .then(function (p) { STATE.console.snapshot = p && p.snapshot; })
            .catch(function () { STATE.console.snapshot = null; })
            .then(onSettled);
        wizardCall('wizardLoadAssignments', {})
            .then(function (p) {
            STATE.console.assignments = (p && p.items) || [];
            STATE.console.phonesByPhone =
                groupAssignmentsByPhone(STATE.console.assignments);
        })
            .catch(function () {
            STATE.console.assignments = [];
            STATE.console.phonesByPhone = [];
        })
            .then(onSettled);
        wizardCall('wizardRunPreflight', {})
            .then(function (p) { STATE.console.preflight = (p && p.checks) || []; })
            .catch(function () { STATE.console.preflight = []; })
            .then(onSettled);
        wizardCall('wizardListEmployees', {})
            .then(function (p) {
            var items = (p && p.items) || [];
            STATE.console.phonesEmployees = items.map(function (e) {
                return {
                    id: Number(e.id),
                    name: e.name || '(no name)',
                    email: e.email || ''
                };
            });
        })
            .catch(function () { STATE.console.phonesEmployees = []; })
            .then(onSettled);
    }
    function computeDrift(snapshot, assignments) {
        if (!snapshot)
            return { phoneNumbers: 'unknown', voiceUrl: 'unknown',
                intelService: 'unknown' };
        return {
            phoneNumbers: 'in-sync',
            voiceUrl: 'in-sync',
            intelService: snapshot.intelServiceSid ? 'in-sync' : 'not-configured'
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
            STATE.console.phonesNumbers = (p && p.items) || [];
        })
            .catch(function (e) {
            STATE.console.phonesNumbers = [];
            STATE.console.phonesError = 'Could not load phone numbers: ' +
                (e && e.message ? e.message : String(e));
        })
            .then(function () {
            STATE.console.phonesLoading = false;
            rerender();
        });
    }
    function onPhonesRowSelectionChanged(phoneSid, newEmployeeIds) {
        STATE.console.phonesSaving[phoneSid] = true;
        STATE.console.phonesError = null;
        var grouped = STATE.console.phonesByPhone || [];
        for (var i = 0; i < grouped.length; i++) {
            if (grouped[i].phoneSid === phoneSid) {
                grouped[i].employeeIds = newEmployeeIds;
                if (!grouped[i].primaryEmployeeId ||
                    newEmployeeIds.indexOf(grouped[i].primaryEmployeeId) === -1) {
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
            STATE.console.phonesSaving[phoneSid] = false;
            if (!resp || resp.ok === false || resp.error) {
                STATE.console.phonesError =
                    'Save failed: ' + ((resp && resp.error) || 'unknown');
                wizardCall('wizardLoadAssignments', {}).then(function (p2) {
                    STATE.console.assignments = (p2 && p2.items) || [];
                    STATE.console.phonesByPhone =
                        groupAssignmentsByPhone(STATE.console.assignments);
                    rerender();
                });
            }
            rerender();
        })
            .catch(function (e) {
            STATE.console.phonesSaving[phoneSid] = false;
            STATE.console.phonesError = 'Network: ' +
                (e && e.message ? e.message : String(e));
            rerender();
        });
    }
    function onDeactivateClick() {
        if (!STATE.console.pendingDeactivateConfirm) {
            STATE.console.pendingDeactivateConfirm = true;
            rerender();
            return;
        }
        STATE.console.deactivateError = null;
        wizardCall('wizardActivate', { deactivate: true })
            .then(function (payload) {
            if (payload && payload.deactivated) {
                STATE.console.pendingDeactivateConfirm = false;
                if (STATE.console.snapshot) {
                    STATE.console.snapshot.active = false;
                }
                rerender();
            }
            else {
                STATE.console.deactivateError =
                    (payload && payload.error) || 'unknown_error';
                rerender();
            }
        })
            .catch(function (e) {
            STATE.console.deactivateError = 'Network: ' +
                (e && e.message ? e.message : String(e));
            rerender();
        });
    }
    function onReactivateClick() {
        STATE.console.actionError = null;
        wizardCall('wizardActivate', {})
            .then(function (payload) {
            if (payload && (payload.activated || payload.alreadyActive)) {
                if (STATE.console.snapshot) {
                    STATE.console.snapshot.active = true;
                }
                rerender();
            }
            else {
                STATE.console.actionError =
                    (payload && payload.error) || 'reactivate_failed';
                if (payload && payload.failedChecks) {
                    STATE.console.preflight = payload.failedChecks;
                }
                rerender();
            }
        })
            .catch(function (e) {
            STATE.console.actionError = 'Network: ' +
                (e && e.message ? e.message : String(e));
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
            var body;
            if (payload && payload.ok && payload.checks) {
                body = buildPrereqsList(payload.checks);
            }
            else if (payload && payload.error) {
                body = buildErrorBox(payload.error);
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
        var ButtonType = (component__namespace.Button && component__namespace.Button.Type) || {};
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
            case 'overview': return buildOverviewSection(d);
            case 'phones': return buildPhonesSection(d);
            case 'voice': return buildVoiceSection(d);
            case 'credentials': return buildCredentialsSection(d);
            case 'health': return buildHealthSection(d);
            default: return buildOverviewSection(d);
        }
    }
    function buildOverviewSection(d) {
        var items = [];
        var heading = safeNew(d.H, {
            content: "Overview",
            type: d.H_Type.MEDIUM_HEADING
        }, "Heading(overview)");
        if (heading)
            items.push(heading);
        var stats = buildOverviewStatCards(d);
        if (stats)
            items.push(stats);
        var quick = buildOverviewQuickActions(d);
        if (quick)
            items.push(quick);
        var activity = buildOverviewActivityFeed(d);
        if (activity)
            items.push(activity);
        if (items.length === 0)
            return safeNew(d.T, { text: "Overview" });
        return safeNew(d.SP, {
            items: items,
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.L
        }, "StackPanel(overview)");
    }
    function buildOverviewStatCards(d) {
        var snap = STATE.console.snapshot || {};
        var assignments = STATE.console.assignments || [];
        var preflight = STATE.console.preflight || [];
        var phoneCount = {};
        assignments.forEach(function (a) {
            if (a.phoneSid)
                phoneCount[a.phoneSid] = true;
        });
        var phonesConfigured = Object.keys(phoneCount).length || (snap.phoneNumber ? 1 : 0);
        var repCount = assignments.length;
        var preflightPassed = preflight.filter(function (c) {
            return c.status === 'pass';
        }).length;
        var preflightTotal = preflight.length;
        var statusLabel = snap.active === false ? 'Paused' :
            snap.active === true ? 'Active' : 'Unknown';
        var cards = [
            buildStatCard(d, {
                title: 'Status',
                metric: statusLabel,
                description: snap.active === false ? 'Reps cannot place calls'
                    : 'Reps can place calls'
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
        ].filter(function (c) { return c != null; });
        if (cards.length === 0)
            return null;
        if (d.GP) {
            return safeNew(d.GP, {
                columns: '1fr 1fr 1fr 1fr',
                rows: 'auto',
                items: cards,
                columnGap: (d.GP_Gap && d.GP_Gap.M) || undefined
            }, "GridPanel(overview-stats)");
        }
        return safeNew(d.SP, {
            items: cards,
            orientation: d.SP_Orient.HORIZONTAL,
            itemGap: d.SP_Gap.M
        }, "StackPanel(overview-stats-fallback)");
    }
    function buildOverviewQuickActions(d) {
        var ButtonType = (component__namespace.Button && component__namespace.Button.Type) || {};
        var heading = safeNew(d.H, {
            content: "Quick actions",
            type: d.H_Type.SMALL_HEADING
        }, "Heading(quick-actions)");
        var actions = [
            { label: "Add a phone number", onClick: function () { goToSection('phones'); } },
            { label: "Reassign reps", onClick: function () { goToSection('phones'); } },
            { label: "Update voice config", onClick: function () { goToSection('voice'); } },
            { label: "Rotate API Key Secret", onClick: function () { goToSection('credentials'); } },
            { label: "Run health check", onClick: function () { goToSection('health'); } }
        ];
        var buttons = actions.map(function (a) {
            return safeNew(component__namespace.Button, {
                label: a.label,
                type: ButtonType.PURE || ButtonType.DEFAULT,
                action: a.onClick
            }, "Button(qa-" + a.label + ")");
        }).filter(function (b) { return b != null; });
        if (buttons.length === 0)
            return heading;
        var row = safeNew(d.SP, {
            items: buttons,
            orientation: d.SP_Orient.HORIZONTAL,
            itemGap: d.SP_Gap.S
        }, "StackPanel(quick-actions-row)");
        return safeNew(d.SP, {
            items: [heading, row].filter(function (c) { return c != null; }),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.XS
        }, "StackPanel(quick-actions-block)");
    }
    function buildOverviewActivityFeed(d) {
        var heading = safeNew(d.H, {
            content: "Recent activity",
            type: d.H_Type.SMALL_HEADING
        }, "Heading(activity-feed)");
        var rows = [];
        {
            var stub = safeNew(d.T, {
                text: "Activity feed arrives in Phase 3c (U8 — wizardActivity). " +
                    "When live, it shows the last 50 audit-level wizard events.",
                type: d.T_Type.WEAK
            }, "Text(activity-stub)");
            if (stub)
                rows.push(stub);
        }
        return safeNew(d.SP, {
            items: [heading].concat(rows).filter(function (c) { return c != null; }),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.XS
        }, "StackPanel(activity-feed)");
    }
    function buildVoiceSection(d) {
        var snap = STATE.console.snapshot || {};
        var items = [];
        var heading = safeNew(d.H, {
            content: "Voice config",
            type: d.H_Type.MEDIUM_HEADING
        }, "Heading(voice)");
        if (heading)
            items.push(heading);
        var intro = safeNew(d.T, {
            text: "Manage TwiML application, default outbound caller-ID " +
                "number, and optional Conversational Intelligence " +
                "service. Changes save immediately and apply to the " +
                "next call placed.",
            type: d.T_Type.WEAK
        }, "Text(voice-intro)");
        if (intro)
            items.push(intro);
        if (STATE.console.voiceError) {
            var err = safeNew(d.T, {
                text: "✕ " + STATE.console.voiceError,
                type: d.T_Type.STRONG
            }, "Text(voice-error)");
            if (err)
                items.push(err);
        }
        items.push(buildVoiceFieldRow(d, {
            field: 'twimlAppSid',
            label: 'TwiML Application',
            value: snap.twimlAppSid,
            helpText: 'Twilio application that handles outbound call routing.'
        }));
        items.push(buildVoiceFieldRow(d, {
            field: 'phoneNumber',
            label: 'Default outbound caller-ID',
            value: snap.phoneNumber,
            helpText: 'Number reps see as their outbound caller ID.'
        }));
        items.push(buildVoiceFieldRow(d, {
            field: 'intelServiceSid',
            label: 'Conversational Intelligence (optional)',
            value: snap.intelServiceSid,
            helpText: 'Twilio Conversational Intelligence service for AI ' +
                'call analysis. Leave unset to disable AI analysis.',
            allowEmpty: true
        }));
        if (items.length === 0)
            return safeNew(d.T, { text: "Voice config" });
        return safeNew(d.SP, {
            items: items.filter(function (c) { return c != null; }),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.L
        }, "StackPanel(voice)");
    }
    function buildVoiceFieldRow(d, spec) {
        var isEditing = STATE.console.voiceEditing === spec.field;
        var ButtonType = (component__namespace.Button && component__namespace.Button.Type) || {};
        (component__namespace.Button && component__namespace.Button.Hierarchy) || {};
        var label = safeNew(d.T, {
            text: spec.label,
            type: d.T_Type.STRONG
        }, "Text(voice-label-" + spec.field + ")");
        var help = safeNew(d.T, {
            text: spec.helpText,
            type: d.T_Type.WEAK,
            size: d.T.Size && d.T.Size.S
        }, "Text(voice-help-" + spec.field + ")");
        var labelStack = safeNew(d.SP, {
            items: [label, help].filter(function (c) { return c != null; }),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.XXS
        }, "StackPanel(voice-label-" + spec.field + ")");
        var rightSide;
        if (isEditing) {
            rightSide = buildVoiceEditControls(d, spec);
        }
        else {
            rightSide = buildVoiceViewControls(d, spec, ButtonType);
        }
        var row = safeNew(d.SP, {
            items: [labelStack, rightSide].filter(function (c) { return c != null; }),
            orientation: d.SP_Orient.HORIZONTAL,
            itemGap: d.SP_Gap.L,
            justification: (d.SP.Justification && d.SP.Justification.SPACE_BETWEEN) || undefined
        }, "StackPanel(voice-row-" + spec.field + ")");
        if (d.CP) {
            return safeNew(d.CP, {
                content: row,
                outerGap: (d.CP_Gap && d.CP_Gap.M) || undefined,
                horizontalAlignment: d.CP_HAlign.STRETCH
            }, "ContentPanel(voice-row-pad-" + spec.field + ")") || row;
        }
        return row;
    }
    function buildVoiceViewControls(d, spec, ButtonType, ButtonHierarchy) {
        var valueText = spec.value
            ? safeNew(d.T, {
                text: spec.value,
                type: d.T_Type.DEFAULT
            }, "Text(voice-value-" + spec.field + ")")
            : safeNew(d.T, {
                text: '(not configured)',
                type: d.T_Type.WEAK
            }, "Text(voice-empty-" + spec.field + ")");
        var changeBtn = safeNew(component__namespace.Button, {
            label: 'Change',
            type: ButtonType.DEFAULT,
            action: function () { onVoiceChangeClick(spec.field, spec.allowEmpty); }
        }, "Button(voice-change-" + spec.field + ")");
        return safeNew(d.SP, {
            items: [valueText, changeBtn].filter(function (c) { return c != null; }),
            orientation: d.SP_Orient.HORIZONTAL,
            itemGap: d.SP_Gap.M
        }, "StackPanel(voice-view-" + spec.field + ")");
    }
    function buildVoiceEditControls(d, spec) {
        var ButtonType = (component__namespace.Button && component__namespace.Button.Type) || {};
        var listKey = voiceListKeyFor(spec.field);
        var list = STATE.console.voiceLists[listKey];
        if (list === null || STATE.console.voiceListsLoading) {
            var loader = safeNew(component__namespace.Loader, {
                label: "Loading from Twilio…",
                indeterminate: true
            }, "Loader(voice-list-" + spec.field + ")");
            return loader || safeNew(d.T, { text: "Loading from Twilio…" });
        }
        if (list.length === 0) {
            var emptyText = safeNew(d.T, {
                text: '(no items found in Twilio for this account)',
                type: d.T_Type.WEAK
            }, "Text(voice-empty-list-" + spec.field + ")");
            var cancelBtnE = safeNew(component__namespace.Button, {
                label: 'Cancel',
                type: ButtonType.DEFAULT,
                action: onVoiceCancelClick
            }, "Button(voice-cancel-empty-" + spec.field + ")");
            return safeNew(d.SP, {
                items: [emptyText, cancelBtnE].filter(function (c) { return c != null; }),
                orientation: d.SP_Orient.HORIZONTAL,
                itemGap: d.SP_Gap.M
            }, "StackPanel(voice-empty-edit-" + spec.field + ")");
        }
        var normalized = list.map(function (it) {
            if (spec.field === 'phoneNumber') {
                return {
                    value: it.phoneNumber,
                    label: it.phoneNumber +
                        (it.friendlyName ? '  —  ' + it.friendlyName : '')
                };
            }
            return {
                value: it.sid,
                label: (it.friendlyName || '(unnamed)') +
                    (it.sid ? '  [' + it.sid + ']' : '')
            };
        });
        var ds = new core__namespace.ArrayDataSource(normalized);
        var pending = STATE.console.voicePendingValue;
        var dropdown = safeNew(component__namespace.Dropdown, {
            dataSource: ds,
            valueMember: 'value',
            displayMember: 'label',
            selectedValue: pending || (spec.allowEmpty ? null : normalized[0].value),
            allowEmpty: !!spec.allowEmpty,
            placeholder: spec.allowEmpty ? '(none)' : 'Select…',
            onSelectionChanged: function (args) {
                STATE.console.voicePendingValue = (args && args.value) || null;
            }
        }, "Dropdown(voice-edit-" + spec.field + ")");
        var saving = !!STATE.console.voiceSaving;
        var saveBtn = safeNew(component__namespace.Button, {
            label: saving ? 'Saving…' : 'Save',
            type: ButtonType.PRIMARY,
            enabled: !saving,
            action: function () { onVoiceSaveClick(spec.field); }
        }, "Button(voice-save-" + spec.field + ")");
        var cancelBtn = safeNew(component__namespace.Button, {
            label: 'Cancel',
            type: ButtonType.DEFAULT,
            enabled: !saving,
            action: onVoiceCancelClick
        }, "Button(voice-cancel-" + spec.field + ")");
        return safeNew(d.SP, {
            items: [dropdown, saveBtn, cancelBtn].filter(function (c) { return c != null; }),
            orientation: d.SP_Orient.HORIZONTAL,
            itemGap: d.SP_Gap.S
        }, "StackPanel(voice-edit-" + spec.field + ")");
    }
    function voiceListKeyFor(field) {
        if (field === 'twimlAppSid')
            return 'twimlApps';
        if (field === 'phoneNumber')
            return 'phoneNumbers';
        if (field === 'intelServiceSid')
            return 'intelServices';
        return null;
    }
    function voiceActionFor(field) {
        if (field === 'twimlAppSid')
            return 'wizardListTwiMLApps';
        if (field === 'phoneNumber')
            return 'wizardListPhoneNumbers';
        if (field === 'intelServiceSid')
            return 'wizardListIntelServices';
        return null;
    }
    function onVoiceChangeClick(field, allowEmpty) {
        STATE.console.voiceEditing = field;
        STATE.console.voiceError = null;
        var snap = STATE.console.snapshot || {};
        STATE.console.voicePendingValue = snap[field] || null;
        var listKey = voiceListKeyFor(field);
        if (STATE.console.voiceLists[listKey] !== null) {
            rerender();
            return;
        }
        STATE.console.voiceListsLoading = true;
        rerender();
        wizardCall(voiceActionFor(field), {})
            .then(function (p) {
            STATE.console.voiceLists[listKey] = (p && p.items) || [];
            STATE.console.voiceListsLoading = false;
            rerender();
        })
            .catch(function (e) {
            STATE.console.voiceListsLoading = false;
            STATE.console.voiceError = 'Could not load list: ' +
                (e && e.message ? e.message : String(e));
            STATE.console.voiceEditing = null;
            rerender();
        });
    }
    function onVoiceCancelClick() {
        STATE.console.voiceEditing = null;
        STATE.console.voicePendingValue = null;
        STATE.console.voiceError = null;
        rerender();
    }
    function onVoiceSaveClick(field) {
        var snap = STATE.console.snapshot || {};
        var newValue = STATE.console.voicePendingValue;
        if (newValue === snap[field]) {
            STATE.console.voiceEditing = null;
            STATE.console.voicePendingValue = null;
            rerender();
            return;
        }
        var payload = {
            twimlAppSid: snap.twimlAppSid || '',
            phoneNumber: snap.phoneNumber || '',
            intelServiceSid: snap.intelServiceSid || ''
        };
        payload[field] = newValue || '';
        STATE.console.voiceSaving = true;
        STATE.console.voiceError = null;
        rerender();
        wizardCall('wizardSaveVoice', payload)
            .then(function (p) {
            STATE.console.voiceSaving = false;
            if (p && p.saved) {
                snap[field] = newValue;
                STATE.console.snapshot = snap;
                STATE.console.voiceEditing = null;
                STATE.console.voicePendingValue = null;
                rerender();
            }
            else {
                STATE.console.voiceError = 'Save failed: ' +
                    ((p && p.error) || 'unknown');
                rerender();
            }
        })
            .catch(function (e) {
            STATE.console.voiceSaving = false;
            STATE.console.voiceError = 'Network error saving: ' +
                (e && e.message ? e.message : String(e));
            rerender();
        });
    }
    function buildCredentialsSection(d) {
        var snap = STATE.console.snapshot || {};
        var items = [];
        var heading = safeNew(d.H, {
            content: "Credentials",
            type: d.H_Type.MEDIUM_HEADING
        }, "Heading(credentials)");
        if (heading)
            items.push(heading);
        var intro = safeNew(d.T, {
            text: "Twilio public identifiers and NetSuite secret pointer. " +
                "These values are safe to view; the API Key Secret value " +
                "itself is held in NetSuite's encrypted vault and is " +
                "never exposed to scripts.",
            type: d.T_Type.WEAK
        }, "Text(credentials-intro)");
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
                "and is never exposed to SuiteScript at runtime."
        }));
        var ButtonType = (component__namespace.Button && component__namespace.Button.Type) || {};
        var manageBtn = safeNew(component__namespace.Button, {
            label: 'Open NetSuite API Secrets ↗',
            type: ButtonType.DEFAULT,
            action: function () {
                try {
                    window.open('/app/common/scripting/secrets/settings.nl', '_blank');
                }
                catch (e) { }
            }
        }, "Button(open-api-secrets)");
        if (manageBtn)
            items.push(manageBtn);
        items.push(buildSecretRotationRunbook(d));
        return safeNew(d.SP, {
            items: items.filter(function (c) { return c != null; }),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.L
        }, "StackPanel(credentials)");
    }
    function buildCredentialRow(d, spec) {
        var labelText = safeNew(d.T, {
            text: spec.label,
            type: d.T_Type.STRONG
        }, "Text(cred-label)");
        var valueText = safeNew(d.T, {
            text: spec.value,
            type: d.T_Type.DEFAULT
        }, "Text(cred-value)");
        var helpText = safeNew(d.T, {
            text: spec.help,
            type: d.T_Type.WEAK,
            size: d.T && d.T.Size ? d.T.Size.S : undefined
        }, "Text(cred-help)");
        var inner = safeNew(d.SP, {
            items: [labelText, valueText, helpText].filter(function (c) { return c != null; }),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.XXS
        }, "StackPanel(cred-row-inner)");
        if (!d.CP)
            return inner;
        return safeNew(d.CP, {
            content: inner,
            outerGap: (d.CP_Gap && d.CP_Gap.M) || undefined,
            horizontalAlignment: d.CP_HAlign.STRETCH
        }, "ContentPanel(cred-row-" + spec.label + ")") || inner;
    }
    function buildSecretRotationRunbook(d) {
        var title = safeNew(d.H, {
            content: "Rotating the API Key Secret",
            type: d.H_Type.SMALL_HEADING
        }, "Heading(rotation-runbook)");
        var intro = safeNew(d.T, {
            text: "Twilio recommends rotating API Key Secrets every 90 days. " +
                "The rotation happens in two external systems:",
            type: d.T_Type.WEAK
        }, "Text(rotation-intro)");
        var step1 = safeNew(d.T, {
            text: "1. In the Twilio Console, generate a new API Key Secret " +
                "(Account > API keys & tokens > Create API key). Save the " +
                "Secret value — Twilio shows it only once."
        }, "Text(rotation-step-1)");
        var step2 = safeNew(d.T, {
            text: "2. In NetSuite, navigate to Setup > Company > Preferences " +
                "> API Secrets. Edit the secret with script ID matching " +
                "the pointer above. Paste the new Twilio Secret value. Save."
        }, "Text(rotation-step-2)");
        var step3 = safeNew(d.T, {
            text: "3. Return to this console's Health section and click " +
                "Re-run on Preflight to verify the new secret authenticates."
        }, "Text(rotation-step-3)");
        var inner = safeNew(d.SP, {
            items: [title, intro, step1, step2, step3].filter(function (c) { return c != null; }),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.S
        }, "StackPanel(rotation-inner)");
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
        }, "ContentPanel(rotation-callout)") || inner;
    }
    function buildHealthSection(d) {
        var items = [];
        var heading = safeNew(d.H, {
            content: "Health",
            type: d.H_Type.MEDIUM_HEADING
        }, "Heading(health)");
        if (heading)
            items.push(heading);
        var preflightBlock = buildHealthPreflightBlock(d);
        if (preflightBlock)
            items.push(preflightBlock);
        var driftBlock = buildHealthDriftBlock(d);
        if (driftBlock)
            items.push(driftBlock);
        var dangerBlock = buildHealthDangerZone(d);
        if (dangerBlock)
            items.push(dangerBlock);
        if (STATE.console.actionError) {
            var err = safeNew(d.T, {
                text: "✕ " + STATE.console.actionError,
                type: d.T_Type.STRONG
            }, "Text(health-error)");
            if (err)
                items.push(err);
        }
        if (items.length === 0)
            return safeNew(d.T, { text: "Health" });
        return safeNew(d.SP, {
            items: items,
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.L
        }, "StackPanel(health)");
    }
    function buildHealthPreflightBlock(d) {
        var ButtonType = (component__namespace.Button && component__namespace.Button.Type) || {};
        var sectionHeader = safeNew(d.H, {
            content: "Preflight",
            type: d.H_Type.SMALL_HEADING
        }, "Heading(health-preflight)");
        var rerunBtn = safeNew(component__namespace.Button, {
            label: "↻ Re-run",
            type: ButtonType.DEFAULT,
            action: function () {
                wizardCall('wizardRunPreflight', {}).then(function (p) {
                    STATE.console.preflight = (p && p.checks) || [];
                    rerender();
                }).catch(function (e) {
                    STATE.console.actionError = 'Preflight failed: ' +
                        (e && e.message ? e.message : String(e));
                    rerender();
                });
            }
        }, "Button(rerun-preflight)");
        var headerRow = safeNew(d.SP, {
            items: [sectionHeader, rerunBtn].filter(function (c) { return c != null; }),
            orientation: d.SP_Orient.HORIZONTAL,
            itemGap: d.SP_Gap.S
        }, "StackPanel(preflight-header-row)");
        var preflight = STATE.console.preflight;
        var bodyContent;
        if (preflight === null || preflight === undefined) {
            bodyContent = safeNew(d.T, {
                text: "Preflight not yet run. Click Re-run to check.",
                type: d.T_Type.WEAK
            }, "Text(preflight-loading)");
        }
        else if (preflight.length === 0) {
            bodyContent = safeNew(d.T, {
                text: "No checks returned.",
                type: d.T_Type.WEAK
            }, "Text(preflight-empty)");
        }
        else {
            bodyContent = buildHealthChecksDataGrid(d, preflight, 'preflight');
        }
        return safeNew(d.SP, {
            items: [headerRow, bodyContent].filter(function (c) { return c != null; }),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.M
        }, "StackPanel(preflight-block)");
    }
    function buildHealthDriftBlock(d) {
        var sectionHeader = safeNew(d.H, {
            content: "Drift detectors",
            type: d.H_Type.SMALL_HEADING
        }, "Heading(health-drift)");
        var drift = STATE.console.drift || {};
        var detectors = [
            { id: 'voiceUrl', label: 'TwiML VoiceUrl', status: drift.voiceUrl || 'unknown' },
            { id: 'phoneNumbers', label: 'Phone number list', status: drift.phoneNumbers || 'unknown' },
            { id: 'intelService', label: 'Intel Service', status: drift.intelService || 'unknown' }
        ];
        var statusMap = {
            'in-sync': { status: 'pass', detail: 'In sync with Twilio' },
            'drift': { status: 'warn', detail: 'Drift detected — review section for details' },
            'not-configured': { status: 'info_disabled', detail: 'Not configured' },
            'unknown': { status: 'info_disabled', detail: 'Drift detection requires data load' }
        };
        var checks = detectors.map(function (det) {
            var mapped = statusMap[det.status] || statusMap.unknown;
            return {
                id: det.id,
                label: det.label,
                status: mapped.status,
                detail: mapped.detail
            };
        });
        var grid = buildHealthChecksDataGrid(d, checks, 'drift');
        return safeNew(d.SP, {
            items: [sectionHeader, grid].filter(function (c) { return c != null; }),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.M
        }, "StackPanel(drift-block)");
    }
    function buildHealthChecksDataGrid(d, checks, gridName) {
        if (!d.DG) {
            console.warn("[CTC] DataGrid component unavailable; health falling back to StackPanel");
            var fallbackRows = (checks || []).map(function (c) {
                return buildCheckRow(c);
            }).filter(function (r) { return r != null; });
            if (fallbackRows.length === 0)
                return null;
            return safeNew(d.SP, {
                items: fallbackRows,
                orientation: d.SP_Orient.VERTICAL,
                itemGap: d.SP_Gap.M
            }, "StackPanel(health-checks-fallback-" + gridName + ")");
        }
        if (!checks || checks.length === 0)
            return null;
        var rowsDs;
        try {
            rowsDs = new d.Ads(checks);
        }
        catch (e) {
            console.error("[CTC] Health checks ArrayDataSource failed:", e);
            return null;
        }
        var CT = (d.DG && d.DG.ColumnType) || {};
        var statusColDef = {
            type: CT.TEMPLATED,
            name: 'status',
            label: 'Status',
            stretchFactor: 1,
            content: function (args) {
                try {
                    var row = args && args.cell && args.cell.row &&
                        args.cell.row.dataItem;
                    if (!row)
                        return safeNew(d.T, { text: '—' });
                    return badgeFor(row.status) || safeNew(d.T, { text: row.status });
                }
                catch (e) {
                    console.error("[CTC] Health status column threw:", e);
                    return safeNew(d.T, { text: '?' });
                }
            }
        };
        var checkColDef = {
            type: CT.TEMPLATED,
            name: 'check',
            label: 'Check',
            stretchFactor: 3,
            content: function (args) {
                try {
                    var row = args && args.cell && args.cell.row &&
                        args.cell.row.dataItem;
                    if (!row)
                        return safeNew(d.T, { text: '—' });
                    return safeNew(d.T, {
                        text: row.label || '',
                        type: d.T_Type.STRONG
                    }, "Text(check-label)");
                }
                catch (e) {
                    console.error("[CTC] Health check column threw:", e);
                    return safeNew(d.T, { text: '(error)' });
                }
            }
        };
        var detailColDef = {
            type: CT.TEMPLATED,
            name: 'detail',
            label: 'Detail',
            stretchFactor: 6,
            content: function (args) {
                try {
                    var row = args && args.cell && args.cell.row &&
                        args.cell.row.dataItem;
                    if (!row || !row.detail)
                        return safeNew(d.T, {
                            text: '—',
                            type: d.T_Type.WEAK
                        });
                    return safeNew(d.T, {
                        text: row.detail,
                        type: d.T_Type.WEAK
                    }, "Text(check-detail)");
                }
                catch (e) {
                    console.error("[CTC] Health detail column threw:", e);
                    return safeNew(d.T, { text: '(error)' });
                }
            }
        };
        var grid = safeNew(d.DG, {
            dataSource: rowsDs,
            columns: [statusColDef, checkColDef, detailColDef],
            columnStretch: true,
            highlightRowsOnHover: true,
            stripedRows: true,
            dataRowHeight: 48,
            headerRowHeight: 40,
            rootStyle: { width: '100%' }
        }, "DataGrid(health-" + gridName + ")");
        return grid;
    }
    function buildHealthDangerZone(d) {
        var snap = STATE.console.snapshot || {};
        var isPaused = snap.active === false;
        if (isPaused)
            return null;
        var ButtonType = (component__namespace.Button && component__namespace.Button.Type) || {};
        var sectionHeader = safeNew(d.H, {
            content: "Danger zone",
            type: d.H_Type.SMALL_HEADING
        }, "Heading(danger-zone)");
        var description = safeNew(d.T, {
            text: "Deactivate Click-to-Call: reps lose phone-icon access " +
                "across all roles. In-progress calls finish normally; new " +
                "calls cannot be placed. Reactivate any time.",
            type: d.T_Type.WEAK,
            size: d.T && d.T.Size ? d.T.Size.S : undefined
        }, "Text(danger-desc)");
        var buttons = [];
        if (STATE.console.pendingDeactivateConfirm) {
            var cancelBtn = safeNew(component__namespace.Button, {
                label: "Cancel",
                type: ButtonType.DEFAULT,
                action: function () {
                    STATE.console.pendingDeactivateConfirm = false;
                    rerender();
                }
            }, "Button(cancel-deactivate)");
            if (cancelBtn)
                buttons.push(cancelBtn);
            var confirmBtn = safeNew(component__namespace.Button, {
                label: "Confirm deactivate",
                type: ButtonType.DANGER || ButtonType.DEFAULT,
                action: onDeactivateClick
            }, "Button(confirm-deactivate)");
            if (confirmBtn)
                buttons.push(confirmBtn);
        }
        else {
            var deactivateBtn = safeNew(component__namespace.Button, {
                label: "Deactivate",
                type: ButtonType.DANGER || ButtonType.DEFAULT,
                action: onDeactivateClick
            }, "Button(deactivate)");
            if (deactivateBtn)
                buttons.push(deactivateBtn);
        }
        var deactivateErrorText = STATE.console.deactivateError ? safeNew(d.T, {
            text: "✕ Deactivate failed: " + STATE.console.deactivateError,
            type: d.T_Type.STRONG
        }, "Text(deactivate-error)") : null;
        var buttonRow = buttons.length > 0 ? safeNew(d.SP, {
            items: buttons,
            orientation: d.SP_Orient.HORIZONTAL,
            itemGap: d.SP_Gap.S
        }, "StackPanel(danger-buttons)") : null;
        var inner = safeNew(d.SP, {
            items: [sectionHeader, description, buttonRow, deactivateErrorText]
                .filter(function (c) { return c != null; }),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.S
        }, "StackPanel(danger-zone)");
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
        }, "ContentPanel(danger-zone-callout)") || inner;
    }
    function buildPhonesSection(d) {
        var items = [];
        var heading = safeNew(d.H, {
            content: "Phones & reps",
            type: d.H_Type.MEDIUM_HEADING
        }, "Heading(phones)");
        if (heading)
            items.push(heading);
        if (STATE.console.phonesLoading) {
            var loader = safeNew(component__namespace.Loader, {
                label: "Loading phones & reps…",
                indeterminate: true
            }, "Loader(phones)");
            if (loader)
                items.push(loader);
            return safeNew(d.SP, {
                items: items,
                orientation: d.SP_Orient.VERTICAL,
                itemGap: d.SP_Gap.L
            }, "StackPanel(phones-loading)") || heading;
        }
        var toolbar = buildPhonesToolbar(d);
        if (toolbar)
            items.push(toolbar);
        if (STATE.console.phonesError) {
            var err = safeNew(d.T, {
                text: "✕ " + STATE.console.phonesError,
                type: d.T_Type.STRONG
            }, "Text(phones-error)");
            if (err)
                items.push(err);
        }
        var grid = buildPhonesDataGrid(d);
        if (grid)
            items.push(grid);
        var grouped = STATE.console.phonesByPhone || [];
        if (grouped.length === 0) {
            var emptyText = safeNew(d.T, {
                text: "No phone numbers configured yet. Click \"Add phone " +
                    "number\" above to claim a Twilio number and assign reps.",
                type: d.T_Type.WEAK
            }, "Text(phones-empty)");
            if (emptyText)
                items.push(emptyText);
        }
        if (items.length === 0)
            return safeNew(d.T, { text: "Phones & reps" });
        return safeNew(d.SP, {
            items: items,
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.XL
        }, "StackPanel(phones)");
    }
    function buildPhonesToolbar(d) {
        var ButtonType = (component__namespace.Button && component__namespace.Button.Type) || {};
        var refreshBtn = safeNew(component__namespace.Button, {
            label: "Refresh from Twilio",
            type: ButtonType.DEFAULT,
            startIcon: d.SysIcon && d.SysIcon.REFRESH,
            action: function () { loadPhonesData(); }
        }, "Button(phones-refresh)");
        var addBtn = safeNew(component__namespace.Button, {
            label: "Add phone number",
            type: ButtonType.PRIMARY,
            startIcon: d.SysIcon && d.SysIcon.ADD,
            action: function () {
                goToStep(4);
            }
        }, "Button(phones-add)");
        var buttons = [refreshBtn, addBtn].filter(function (b) { return b != null; });
        if (buttons.length === 0)
            return null;
        return safeNew(d.SP, {
            items: buttons,
            orientation: d.SP_Orient.HORIZONTAL,
            itemGap: d.SP_Gap.S
        }, "StackPanel(phones-toolbar)");
    }
    function buildPhonesDataGrid(d) {
        if (!d.DG) {
            console.warn("[CTC] DataGrid component unavailable; falling back to text");
            return buildPhonesFallback(d);
        }
        var grouped = STATE.console.phonesByPhone || [];
        var employees = STATE.console.phonesEmployees || [];
        if (grouped.length === 0)
            return null;
        var rowsDs, employeesDs;
        try {
            rowsDs = new d.Ads(grouped);
            employeesDs = new d.Ads(employees);
        }
        catch (e) {
            console.error("[CTC] ArrayDataSource construction failed:", e);
            return buildPhonesFallback(d);
        }
        var CT = (d.DG && d.DG.ColumnType) || {};
        var BdgType = (d.Bdg && d.Bdg.Type) || {};
        function truncSid(sid) {
            if (!sid)
                return '';
            if (sid.length <= 14)
                return sid;
            return sid.slice(0, 6) + '…' + sid.slice(-4);
        }
        var phoneColDef = {
            type: CT.TEMPLATED,
            name: 'phone',
            label: 'Phone number',
            stretchFactor: 2,
            content: function (args) {
                try {
                    var row = args && args.cell && args.cell.row &&
                        args.cell.row.dataItem;
                    if (!row)
                        return safeNew(d.T, { text: '—' });
                    var top = safeNew(d.T, {
                        text: row.phoneNumber || '(unknown)',
                        type: d.T_Type.STRONG
                    }, "Text(phone-top)");
                    var sub = safeNew(d.T, {
                        text: truncSid(row.phoneSid),
                        type: d.T_Type.WEAK,
                        size: d.T.Size && d.T.Size.S
                    }, "Text(phone-sub)");
                    return safeNew(d.SP, {
                        items: [top, sub].filter(function (c) { return c != null; }),
                        orientation: d.SP_Orient.VERTICAL,
                        itemGap: d.SP_Gap.XXS
                    }, "StackPanel(phone-cell)") || top || safeNew(d.T, { text: row.phoneNumber || '' });
                }
                catch (e) {
                    console.error("[CTC] phone column template threw:", e);
                    return safeNew(d.T, { text: '(error)' });
                }
            }
        };
        var IM = (d.DG && d.DG.InputMode) || {};
        function repsDisplayMember(value) {
            if (value && typeof value === 'object') {
                return value.name || '';
            }
            var id = Number(value);
            var emp = (STATE.console.phonesEmployees || []).find(function (e) {
                return e.id === id;
            });
            return emp ? emp.name : '';
        }
        var repsColDef = {
            type: CT.MULTI_SELECT_DROPDOWN,
            name: 'reps',
            label: 'Assigned reps',
            stretchFactor: 5,
            binding: 'employeeIds',
            inputMode: IM.EDIT_ONLY,
            dataSource: employeesDs,
            displayMember: repsDisplayMember,
            editable: true,
            widgetOptions: function (row) {
                var dataItem = (row && row.dataItem) || {};
                var phoneSid = dataItem.phoneSid;
                return {
                    dataSource: employeesDs,
                    valueMember: 'id',
                    displayMember: 'name',
                    placeholder: 'Pick reps',
                    onSelectionChanged: function (args) {
                        var newIds = ((args && args.values) || []).map(function (v) {
                            if (v && typeof v === 'object')
                                return Number(v.id);
                            return Number(v);
                        });
                        if (phoneSid) {
                            onPhonesRowSelectionChanged(phoneSid, newIds);
                        }
                    }
                };
            }
        };
        var statusColDef = {
            type: CT.TEMPLATED,
            name: 'status',
            label: 'Status',
            stretchFactor: 1,
            content: function (args) {
                try {
                    var row = args && args.cell && args.cell.row &&
                        args.cell.row.dataItem;
                    if (!row)
                        return safeNew(d.T, { text: '—' });
                    var saving = STATE.console.phonesSaving[row.phoneSid];
                    var hasReps = (row.employeeIds || []).length > 0;
                    if (saving) {
                        return safeNew(d.Bdg, {
                            content: 'Saving…',
                            type: BdgType.SUBTLE
                        }, "Badge(saving)") || safeNew(d.T, { text: 'Saving…' });
                    }
                    else if (hasReps) {
                        return safeNew(d.Bdg, {
                            content: '✓ Live',
                            type: BdgType.SOLID
                        }, "Badge(live)") || safeNew(d.T, { text: '✓ Live' });
                    }
                    return safeNew(d.Bdg, {
                        content: 'No reps',
                        type: BdgType.SUBTLE
                    }, "Badge(no-reps)") || safeNew(d.T, { text: 'No reps' });
                }
                catch (e) {
                    console.error("[CTC] status column template threw:", e);
                    return safeNew(d.T, { text: '(error)' });
                }
            }
        };
        var columns = [phoneColDef, repsColDef, statusColDef];
        var grid = safeNew(d.DG, {
            dataSource: rowsDs,
            columns: columns,
            columnStretch: true,
            highlightRowsOnHover: true,
            stripedRows: true,
            dataRowHeight: 72,
            headerRowHeight: 44,
            editable: true,
            rootStyle: { width: '100%' }
        }, "DataGrid(phones)");
        if (!grid) {
            console.warn("[CTC] DataGrid construction returned null; using text fallback");
            return buildPhonesFallback(d);
        }
        return grid;
    }
    function buildPhonesFallback(d) {
        var grouped = STATE.console.phonesByPhone || [];
        var rows = grouped.map(function (g) {
            var label = (g.phoneNumber || '(unknown)') + ' — ' +
                (g.employeeIds || []).length + ' rep(s)';
            return safeNew(d.T, { text: label }, "Text(phone-row)");
        }).filter(function (r) { return r != null; });
        if (rows.length === 0)
            return null;
        return safeNew(d.SP, {
            items: rows,
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.XS
        }, "StackPanel(phones-fallback)");
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
            initial = buildStep5Activate(d);
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
        var ButtonType = (component__namespace.Button && component__namespace.Button.Type) || {};
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
            var phoneNumbers = STATE.step4.phoneNumbers || [];
            for (var i = 0; i < phoneNumbers.length; i++) {
                var pn = phoneNumbers[i];
                var assignment = STATE.step4.assignments[pn.sid] || {};
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
    function buildStep2Form(d) {
        var rows = [];
        rows.push(safeNew(d.H, {
            content: "Connect to your Twilio account",
            type: d.H_Type.MEDIUM_HEADING
        }, "Heading(step2)"));
        rows.push(safeNew(d.T, {
            text: "Enter your Twilio Account SID and API Key SID. " +
                "The API Key Secret must already exist in NetSuite " +
                "API Secrets (Setup > Company > API Secrets) — paste " +
                "its script ID below. Live validation against Twilio " +
                "runs at Step 6 (Test & activate) using the configured " +
                "secret pointer — no need to paste the secret value here."
        }, "Text(step2-intro)"));
        rows.push(buildTextField('Account SID', 'AC...', STATE.step2.accountSid, function (v) { STATE.step2.accountSid = v; }));
        rows.push(buildTextField('API Key SID', 'SK...', STATE.step2.apiKeySid, function (v) { STATE.step2.apiKeySid = v; }));
        rows.push(buildTextField('API Key Secret script ID', 'custsecret_...', STATE.step2.apiSecretId, function (v) { STATE.step2.apiSecretId = v; }));
        return safeNew(d.SP, {
            items: rows.filter(function (r) { return r != null; }),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.M
        }, "StackPanel(step2)");
    }
    function buildStep3Form(d) {
        var rows = [];
        rows.push(safeNew(d.H, {
            content: "Voice configuration",
            type: d.H_Type.MEDIUM_HEADING
        }, "Heading(step3)"));
        rows.push(safeNew(d.T, {
            text: "Pick the TwiML application, default outbound caller " +
                "ID, and (optional) Conversational Intelligence " +
                "service from your Twilio account. These are fetched " +
                "live from Twilio using the secure API Secret " +
                "configured in Step 2 — the secret value never leaves " +
                "NetSuite's vault."
        }, "Text(step3-intro)"));
        if (STATE.step3.twimlApps === null ||
            STATE.step3.phoneNumbers === null ||
            STATE.step3.intelServices === null) {
            var loader = safeNew(component__namespace.Loader, {
                label: "Loading from Twilio…",
                indeterminate: true
            }, "Loader(step3-lists)");
            if (loader)
                rows.push(loader);
            else
                rows.push(safeNew(d.T, {
                    text: "Loading from Twilio…"
                }, "Text(loading-fallback)"));
            return safeNew(d.SP, {
                items: rows.filter(function (r) { return r != null; }),
                orientation: d.SP_Orient.VERTICAL,
                itemGap: d.SP_Gap.M
            }, "StackPanel(step3-loading)");
        }
        if (STATE.step3.listLoadError) {
            rows.push(safeNew(d.T, {
                text: "✕ Could not load Twilio lists: " +
                    STATE.step3.listLoadError + ". Verify the API " +
                    "Secret value is set at Setup > Company > API " +
                    "Secrets, then go back to Step 2 and Continue " +
                    "again to retry.",
                type: d.T_Type.STRONG
            }, "Text(step3-error)"));
            return safeNew(d.SP, {
                items: rows.filter(function (r) { return r != null; }),
                orientation: d.SP_Orient.VERTICAL,
                itemGap: d.SP_Gap.M
            }, "StackPanel(step3-error)");
        }
        rows.push(buildDropdownField(d, 'TwiML Application', STATE.step3.twimlApps, STATE.step3.twimlAppSid, function (sid) { STATE.step3.twimlAppSid = sid; }));
        rows.push(buildDropdownField(d, 'Default outbound caller ID', STATE.step3.phoneNumbers.map(function (n) {
            return { value: n.phoneNumber,
                label: n.phoneNumber +
                    (n.friendlyName ? ' — ' + n.friendlyName : '') };
        }), STATE.step3.phoneNumber, function (val) { STATE.step3.phoneNumber = val; }, { valueIsString: true }));
        rows.push(buildDropdownField(d, 'Conversational Intelligence Service (optional)', STATE.step3.intelServices, STATE.step3.intelServiceSid, function (sid) { STATE.step3.intelServiceSid = sid; }, { allowEmpty: true }));
        return safeNew(d.SP, {
            items: rows.filter(function (r) { return r != null; }),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.M
        }, "StackPanel(step3)");
    }
    function loadStep3Lists() {
        STATE.step3.twimlApps = null;
        STATE.step3.phoneNumbers = null;
        STATE.step3.intelServices = null;
        STATE.step3.listLoadError = null;
        function handle(field, payload) {
            if (payload && payload.items) {
                STATE.step3[field] = payload.items;
                if (payload.items.length > 0) {
                    if (field === 'twimlApps' && !STATE.step3.twimlAppSid) {
                        STATE.step3.twimlAppSid = payload.items[0].sid;
                    }
                    if (field === 'phoneNumbers' && !STATE.step3.phoneNumber) {
                        STATE.step3.phoneNumber = payload.items[0].phoneNumber;
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
                rerender();
            }
        }
        wizardCall('wizardListTwiMLApps', {})
            .then(function (p) { handle('twimlApps', p); })
            .catch(function (e) {
            STATE.step3.listLoadError = 'TwiML apps: ' +
                (e && e.message ? e.message : String(e));
            handle('twimlApps', null);
        });
        wizardCall('wizardListPhoneNumbers', {})
            .then(function (p) { handle('phoneNumbers', p); })
            .catch(function (e) {
            STATE.step3.listLoadError = 'Phone numbers: ' +
                (e && e.message ? e.message : String(e));
            handle('phoneNumbers', null);
        });
        wizardCall('wizardListIntelServices', {})
            .then(function (p) { handle('intelServices', p); })
            .catch(function (e) {
            STATE.step3.listLoadError = 'Intel services: ' +
                (e && e.message ? e.message : String(e));
            handle('intelServices', null);
        });
    }
    function buildDropdownField(d, label, items, currentValue, onChange, opts) {
        opts = opts || {};
        var normalized = (items || []).map(function (it) {
            if (opts.valueIsString)
                return it;
            return {
                value: it.sid,
                label: (it.friendlyName || '(unnamed)') +
                    (it.sid ? '  [' + it.sid + ']' : '')
            };
        });
        if (normalized.length === 0) {
            return safeNew(component__namespace.StackPanel, {
                items: [
                    safeNew(component__namespace.Text, { text: label,
                        type: component__namespace.Text.Type.STRONG,
                        size: component__namespace.Text.Size.S
                    }, "Text(label-" + label + ")"),
                    safeNew(component__namespace.Text, {
                        text: "(no items found in Twilio for this account)",
                        type: component__namespace.Text.Type.WEAK,
                        size: component__namespace.Text.Size.S
                    }, "Text(empty-" + label + ")")
                ].filter(function (c) { return c != null; }),
                orientation: component__namespace.StackPanel.Orientation.VERTICAL,
                itemGap: component__namespace.StackPanel.GapSize.XXS
            }, "StackPanel(empty-" + label + ")");
        }
        var ds = new core__namespace.ArrayDataSource(normalized);
        var dropdown = safeNew(component__namespace.Dropdown, {
            dataSource: ds,
            valueMember: 'value',
            displayMember: 'label',
            selectedValue: currentValue || (opts.allowEmpty ? null : normalized[0].value),
            allowEmpty: !!opts.allowEmpty,
            placeholder: opts.allowEmpty ? '(none)' : 'Select…',
            onSelectionChanged: function (args) {
                onChange(args && args.value);
            }
        }, "Dropdown(" + label + ")");
        if (!dropdown) {
            return buildTextField(label, '', currentValue || '', onChange);
        }
        var lblText = safeNew(component__namespace.Text, {
            text: label,
            type: component__namespace.Text.Type.STRONG,
            size: component__namespace.Text.Size.S
        }, "Text(label-" + label + ")");
        return safeNew(component__namespace.StackPanel, {
            items: [lblText, dropdown].filter(function (c) { return c != null; }),
            orientation: component__namespace.StackPanel.Orientation.VERTICAL,
            itemGap: component__namespace.StackPanel.GapSize.XXS
        }, "StackPanel(field-" + label + ")") || dropdown;
    }
    function buildStep4Form(d) {
        var rows = [];
        rows.push(safeNew(d.H, {
            content: "Phone numbers & rep assignments",
            type: d.H_Type.MEDIUM_HEADING
        }, "Heading(step4)"));
        rows.push(safeNew(d.T, {
            text: "Assign reps to your Twilio phone numbers. Each rep " +
                "with a number assigned will use it as their outbound " +
                "caller ID. Reps without an assignment fall back to " +
                "the default caller ID set in Step 3."
        }, "Text(step4-intro)"));
        if (STATE.step4.phoneNumbers === null ||
            STATE.step4.employees === null) {
            var loader = safeNew(component__namespace.Loader, {
                label: "Loading phone numbers and employees…",
                indeterminate: true
            }, "Loader(step4)");
            if (loader)
                rows.push(loader);
            return safeNew(d.SP, {
                items: rows.filter(function (r) { return r != null; }),
                orientation: d.SP_Orient.VERTICAL,
                itemGap: d.SP_Gap.M
            }, "StackPanel(step4-loading)");
        }
        if (STATE.step4.listLoadError) {
            rows.push(safeNew(d.T, {
                text: "✕ " + STATE.step4.listLoadError,
                type: d.T_Type.STRONG
            }, "Text(step4-error)"));
            return safeNew(d.SP, {
                items: rows.filter(function (r) { return r != null; }),
                orientation: d.SP_Orient.VERTICAL,
                itemGap: d.SP_Gap.M
            }, "StackPanel(step4-error)");
        }
        if (STATE.step4.phoneNumbers.length === 0) {
            rows.push(safeNew(d.T, {
                text: "(no phone numbers owned by this Twilio account — " +
                    "buy one in Twilio Console before continuing)",
                type: d.T_Type.WEAK
            }, "Text(step4-empty)"));
            return safeNew(d.SP, {
                items: rows.filter(function (r) { return r != null; }),
                orientation: d.SP_Orient.VERTICAL,
                itemGap: d.SP_Gap.M
            }, "StackPanel(step4-empty)");
        }
        for (var i = 0; i < STATE.step4.phoneNumbers.length; i++) {
            var pn = STATE.step4.phoneNumbers[i];
            rows.push(buildStep4AssignmentRow(d, pn));
        }
        return safeNew(d.SP, {
            items: rows.filter(function (r) { return r != null; }),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.L
        }, "StackPanel(step4)");
    }
    function buildStep4AssignmentRow(d, phoneNumber) {
        var current = STATE.step4.assignments[phoneNumber.sid] || {};
        var employees = STATE.step4.employees || [];
        var pnLabel = safeNew(d.T, {
            text: phoneNumber.phoneNumber +
                (phoneNumber.friendlyName ? '  —  ' + phoneNumber.friendlyName : ''),
            type: d.T_Type.STRONG
        }, "Text(step4-pn-" + phoneNumber.sid + ")");
        var dataItems = employees.map(function (e) {
            return { value: e.id, label: e.name +
                    (e.email ? ' (' + e.email + ')' : '') };
        });
        var ds = new core__namespace.ArrayDataSource(dataItems);
        var selectedItems = (current.employeeIds || []).map(function (id) {
            return { value: id, label: lookupEmployeeName(id) };
        });
        var picker = safeNew(component__namespace.MultiselectDropdown, {
            dataSource: ds,
            valueMember: 'value',
            displayMember: 'label',
            selectedItems: selectedItems,
            placeholder: 'Assign reps…',
            onSelectionChanged: function (args) {
                var values = (args && args.values) || [];
                console.log("[CTC Setup Wizard] Step 4 picker — " +
                    "phoneSid=" + phoneNumber.sid +
                    " selected values:", values);
                if (!STATE.step4.assignments[phoneNumber.sid]) {
                    STATE.step4.assignments[phoneNumber.sid] = {};
                }
                STATE.step4.assignments[phoneNumber.sid].employeeIds = values;
                var a = STATE.step4.assignments[phoneNumber.sid];
                if (!a.primaryEmployeeId || values.indexOf(a.primaryEmployeeId) === -1) {
                    a.primaryEmployeeId = values.length > 0 ? values[0] : null;
                }
            }
        }, "MultiselectDropdown(emp-" + phoneNumber.sid + ")");
        var children = [pnLabel, picker].filter(function (c) { return c != null; });
        return safeNew(d.SP, {
            items: children,
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.XS
        }, "StackPanel(step4-row-" + phoneNumber.sid + ")");
    }
    function lookupEmployeeName(id) {
        var employees = STATE.step4.employees || [];
        for (var i = 0; i < employees.length; i++) {
            if (Number(employees[i].id) === Number(id))
                return employees[i].name;
        }
        return '(id ' + id + ')';
    }
    function loadStep4Lists() {
        STATE.step4.phoneNumbers = null;
        STATE.step4.employees = null;
        STATE.step4.assignments = {};
        STATE.step4.listLoadError = null;
        function rerenderIfReady() {
            if (STATE.step4.phoneNumbers !== null &&
                STATE.step4.employees !== null) {
                rerender();
            }
        }
        wizardCall('wizardListPhoneNumbers', {})
            .then(function (p) {
            STATE.step4.phoneNumbers = (p && p.items) || [];
            if (p && p.errorMessage)
                STATE.step4.listLoadError = p.errorMessage;
            rerenderIfReady();
        }).catch(function (e) {
            STATE.step4.phoneNumbers = [];
            STATE.step4.listLoadError = 'Phone numbers: ' +
                (e && e.message ? e.message : String(e));
            rerenderIfReady();
        });
        wizardCall('wizardListEmployees', {})
            .then(function (p) {
            STATE.step4.employees = (p && p.items) || [];
            if (p && p.errorMessage)
                STATE.step4.listLoadError = p.errorMessage;
            rerenderIfReady();
        }).catch(function (e) {
            STATE.step4.employees = [];
            STATE.step4.listLoadError = 'Employees: ' +
                (e && e.message ? e.message : String(e));
            rerenderIfReady();
        });
        wizardCall('wizardLoadAssignments', {})
            .then(function (p) {
            var items = (p && p.items) || [];
            var map = {};
            items.forEach(function (a) {
                if (!map[a.phoneSid]) {
                    map[a.phoneSid] = {
                        employeeIds: [],
                        label: a.label || '',
                        primaryEmployeeId: null
                    };
                }
                var empId = Number(a.employeeId);
                map[a.phoneSid].employeeIds.push(empId);
                if (a.isPrimary)
                    map[a.phoneSid].primaryEmployeeId = empId;
            });
            STATE.step4.assignments = map;
        }).catch(function () { });
    }
    function buildStep5Activate(d) {
        var rows = [];
        rows.push(safeNew(d.H, {
            content: "Test & activate",
            type: d.H_Type.MEDIUM_HEADING
        }, "Heading(step5)"));
        if (STATE.step5.activated) {
            rows.push(safeNew(d.T, {
                text: "✓ Click-to-Call is active. Sales reps can now use " +
                    "the phone icon on Customer, Lead, and Contact " +
                    "records.",
                type: d.T_Type.STRONG
            }, "Text(activated)"));
            var ButtonType = (component__namespace.Button && component__namespace.Button.Type) || {};
            var consoleBtn = safeNew(component__namespace.Button, {
                label: "Go to Admin Console",
                type: ButtonType.PRIMARY,
                action: goToConsole
            }, "Button(step5-to-console)");
            if (consoleBtn)
                rows.push(consoleBtn);
            return safeNew(d.SP, {
                items: rows.filter(function (r) { return r != null; }),
                orientation: d.SP_Orient.VERTICAL,
                itemGap: d.SP_Gap.M
            }, "StackPanel(step5-activated)");
        }
        if (STATE.step5.loading) {
            var loader = safeNew(component__namespace.Loader, {
                label: "Running preflight checks…",
                indeterminate: true
            }, "Loader(step5)");
            if (loader)
                rows.push(loader);
            return safeNew(d.SP, {
                items: rows.filter(function (r) { return r != null; }),
                orientation: d.SP_Orient.VERTICAL,
                itemGap: d.SP_Gap.M
            }, "StackPanel(step5-loading)");
        }
        if (STATE.step5.snapshot) {
            rows.push(safeNew(d.H, {
                content: "Configuration review",
                type: d.H_Type.SMALL_HEADING
            }, "Heading(review)"));
            var snap = STATE.step5.snapshot;
            var assignmentCount = (STATE.step5.assignments || []).length;
            var phoneNumbersWithReps = {};
            (STATE.step5.assignments || []).forEach(function (a) {
                if (a.phoneSid)
                    phoneNumbersWithReps[a.phoneSid] = true;
            });
            var lines = [
                'Account SID:        ' + (snap.accountSid || '(not set)'),
                'API Key SID:        ' + (snap.apiKeySid || '(not set)'),
                'API Key Secret:     ' + (snap.apiSecretId || '(not set)'),
                'TwiML Application:  ' + (snap.twimlAppSid || '(not set)'),
                'Default caller ID:  ' + (snap.phoneNumber || '(not set)'),
                'Intel Service:      ' + (snap.intelServiceSid || '(none)'),
                'Phone assignments:  ' + assignmentCount + ' rep(s) across ' +
                    Object.keys(phoneNumbersWithReps).length + ' number(s)'
            ];
            lines.forEach(function (l) {
                rows.push(safeNew(d.T, {
                    text: l,
                    type: d.T_Type.DEFAULT,
                    size: d.T && d.T.Size ? d.T.Size.S : undefined
                }, "Text(review-line)"));
            });
        }
        if (STATE.step5.preflight) {
            rows.push(safeNew(d.H, {
                content: "Preflight checks",
                type: d.H_Type.SMALL_HEADING
            }, "Heading(preflight)"));
            STATE.step5.preflight.forEach(function (check) {
                rows.push(buildCheckRow(check));
            });
        }
        var allPassed = STATE.step5.preflight &&
            STATE.step5.preflight.every(function (c) { return c.status === 'pass'; });
        var activateBtn = safeNew(component__namespace.Button, {
            label: allPassed ? "Activate Click-to-Call"
                : "Activate Click-to-Call (fix preflight first)",
            type: (component__namespace.Button && component__namespace.Button.Type)
                ? component__namespace.Button.Type.PRIMARY : undefined,
            enabled: allPassed,
            action: function () { onActivateClick(); }
        }, "Button(activate)");
        if (activateBtn)
            rows.push(activateBtn);
        if (STATE.step5.activateError) {
            rows.push(safeNew(d.T, {
                text: "✕ Activation failed: " + STATE.step5.activateError,
                type: d.T_Type.STRONG
            }, "Text(activate-error)"));
        }
        var rerunBtn = safeNew(component__namespace.Button, {
            label: "Re-run preflight",
            type: (component__namespace.Button && component__namespace.Button.Type)
                ? component__namespace.Button.Type.DEFAULT : undefined,
            action: function () { loadStep5(); }
        }, "Button(rerun-preflight)");
        if (rerunBtn)
            rows.push(rerunBtn);
        return safeNew(d.SP, {
            items: rows.filter(function (r) { return r != null; }),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.M
        }, "StackPanel(step5)");
    }
    function loadStep5() {
        STATE.step5.loading = true;
        STATE.step5.activateError = null;
        STATE.step5.snapshot = null;
        STATE.step5.assignments = null;
        STATE.step5.preflight = null;
        rerender();
        var settled = 0;
        function onSettled() {
            settled += 1;
            if (settled >= 3) {
                STATE.step5.loading = false;
                rerender();
            }
        }
        wizardCall('wizardSnapshot', {})
            .then(function (p) { STATE.step5.snapshot = p && p.snapshot; })
            .catch(function () { STATE.step5.snapshot = null; })
            .then(onSettled);
        wizardCall('wizardLoadAssignments', {})
            .then(function (p) { STATE.step5.assignments = (p && p.items) || []; })
            .catch(function () { STATE.step5.assignments = []; })
            .then(onSettled);
        wizardCall('wizardRunPreflight', {})
            .then(function (p) {
            STATE.step5.preflight = (p && p.checks) || [];
        }).catch(function (e) {
            STATE.step5.preflight = [{
                    id: 'network', label: 'Preflight call', status: 'fail',
                    detail: 'Network error: ' +
                        (e && e.message ? e.message : String(e))
                }];
        }).then(onSettled);
    }
    function onActivateClick() {
        wizardCall('wizardActivate', {})
            .then(function (payload) {
            if (payload && payload.activated) {
                STATE.step5.activated = true;
                STATE.step5.activateError = null;
            }
            else {
                STATE.step5.activateError =
                    (payload && payload.error) || 'unknown';
                if (payload && payload.failedChecks) {
                    STATE.step5.preflight = payload.failedChecks;
                }
            }
            rerender();
        }).catch(function (e) {
            STATE.step5.activateError = 'Network: ' +
                (e && e.message ? e.message : String(e));
            rerender();
        });
    }
    function buildPrereqsList(checks) {
        var rows = checks.map(function (c) { return buildCheckRow(c); })
            .filter(function (r) { return r != null; });
        if (rows.length === 0) {
            return safeNew(component__namespace.Text, {
                text: "No checks returned."
            }, "Text(empty-checks)");
        }
        return safeNew(component__namespace.StackPanel, {
            items: rows,
            orientation: component__namespace.StackPanel.Orientation.VERTICAL,
            itemGap: component__namespace.StackPanel.GapSize.M
        }, "StackPanel(prereqs)");
    }
    function buildStepper(d) {
        if (!d.SP || !d.T || !d.SI) ;
        var Badge = component__namespace.Badge;
        var BadgeType = (Badge && Badge.Type) || {};
        var BadgeSize = (Badge && Badge.Size) || {};
        var TextType = (d.T && d.T.Type) || {};
        var TextSize = (d.T && d.T.Size) || {};
        var SPAlign = (d.SP && d.SP.Alignment) || {};
        var SPJust = (d.SP && d.SP.Justification) || {};
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
