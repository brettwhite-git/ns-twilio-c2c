define(['exports', '@uif-js/core/jsx-runtime', '@uif-js/core', '@uif-js/component'], (function (exports, jsxRuntime, core, component) { 'use strict';

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

    const ActionType = {
        SET_MODE: Symbol('setMode'),
        SET_CURRENT_STEP: Symbol('setCurrentStep'),
        SET_SELECTED_SECTION: Symbol('setSelectedSection'),
        SET_RAIL_VISIBLE: Symbol('setRailVisible'),
        SET_MOUNT_ROUTING: Symbol('setMountRouting'),
        STEP2_FIELD_CHANGE: Symbol('step2FieldChange'),
        STEP3_FIELD_CHANGE: Symbol('step3FieldChange'),
        STEP4_FIELD_CHANGE: Symbol('step4FieldChange'),
        STEP5_FIELD_CHANGE: Symbol('step5FieldChange'),
        PREREQS_LOAD_START: Symbol('prereqsLoadStart'),
        PREREQS_LOAD_SUCCESS: Symbol('prereqsLoadSuccess'),
        PREREQS_LOAD_FAILURE: Symbol('prereqsLoadFailure'),
        CONSOLE_LOAD_START: Symbol('consoleLoadStart'),
        CONSOLE_LOAD_SUCCESS: Symbol('consoleLoadSuccess'),
        CONSOLE_LOAD_FAILURE: Symbol('consoleLoadFailure'),
        CONSOLE_DRIFT_SET: Symbol('consoleDriftSet'),
        PHONES_LOAD_START: Symbol('phonesLoadStart'),
        PHONES_LOAD_SUCCESS: Symbol('phonesLoadSuccess'),
        PHONES_ASSIGNMENT_SAVE: Symbol('phonesAssignmentSave'),
        VOICE_FIELD_EDIT: Symbol('voiceFieldEdit'),
        VOICE_FIELD_SAVE: Symbol('voiceFieldSave'),
        DEACTIVATE_REQUEST: Symbol('deactivateRequest'),
        DEACTIVATE_SUCCESS: Symbol('deactivateSuccess'),
        DEACTIVATE_FAILURE: Symbol('deactivateFailure'),
        REACTIVATE_REQUEST: Symbol('reactivateRequest'),
        REACTIVATE_SUCCESS: Symbol('reactivateSuccess'),
        REACTIVATE_FAILURE: Symbol('reactivateFailure'),
        ACTION_ERROR_SET: Symbol('actionErrorSet')
    };
    const Action = {
        setMode(mode) {
            return { type: ActionType.SET_MODE, payload: mode };
        },
        setCurrentStep(step) {
            return { type: ActionType.SET_CURRENT_STEP, payload: step };
        },
        setSelectedSection(section) {
            return { type: ActionType.SET_SELECTED_SECTION, payload: section };
        },
        setRailVisible(visible) {
            return { type: ActionType.SET_RAIL_VISIBLE, payload: visible };
        },
        setMountRouting(routing) {
            return { type: ActionType.SET_MOUNT_ROUTING, payload: routing };
        },
        step2FieldChange(field, value) {
            return { type: ActionType.STEP2_FIELD_CHANGE, payload: { field, value } };
        },
        step3FieldChange(field, value) {
            return { type: ActionType.STEP3_FIELD_CHANGE, payload: { field, value } };
        },
        step4FieldChange(field, value) {
            return { type: ActionType.STEP4_FIELD_CHANGE, payload: { field, value } };
        },
        step5FieldChange(field, value) {
            return { type: ActionType.STEP5_FIELD_CHANGE, payload: { field, value } };
        },
        prereqsLoadStart() {
            return { type: ActionType.PREREQS_LOAD_START, payload: null };
        },
        prereqsLoadSuccess(checks) {
            return { type: ActionType.PREREQS_LOAD_SUCCESS, payload: { checks } };
        },
        prereqsLoadFailure(error) {
            return { type: ActionType.PREREQS_LOAD_FAILURE, payload: { error } };
        },
        consoleLoadStart() {
            return { type: ActionType.CONSOLE_LOAD_START, payload: null };
        },
        consoleLoadSuccess(slice) {
            return { type: ActionType.CONSOLE_LOAD_SUCCESS, payload: slice };
        },
        consoleLoadFailure(error) {
            return { type: ActionType.CONSOLE_LOAD_FAILURE, payload: { error } };
        },
        consoleDriftSet(drift) {
            return { type: ActionType.CONSOLE_DRIFT_SET, payload: drift };
        },
        phonesLoadStart() {
            return { type: ActionType.PHONES_LOAD_START, payload: null };
        },
        phonesLoadSuccess(slice) {
            return { type: ActionType.PHONES_LOAD_SUCCESS, payload: slice };
        },
        phonesAssignmentSave(payload) {
            return { type: ActionType.PHONES_ASSIGNMENT_SAVE, payload };
        },
        voiceFieldEdit(field, pendingValue = null) {
            return { type: ActionType.VOICE_FIELD_EDIT, payload: { field, pendingValue } };
        },
        voiceFieldSave(payload) {
            return { type: ActionType.VOICE_FIELD_SAVE, payload };
        },
        deactivateRequest() {
            return { type: ActionType.DEACTIVATE_REQUEST, payload: null };
        },
        deactivateSuccess() {
            return { type: ActionType.DEACTIVATE_SUCCESS, payload: null };
        },
        deactivateFailure(error) {
            return { type: ActionType.DEACTIVATE_FAILURE, payload: { error } };
        },
        reactivateRequest() {
            return { type: ActionType.REACTIVATE_REQUEST, payload: null };
        },
        reactivateSuccess() {
            return { type: ActionType.REACTIVATE_SUCCESS, payload: null };
        },
        reactivateFailure(error) {
            return { type: ActionType.REACTIVATE_FAILURE, payload: { error } };
        },
        actionErrorSet(error) {
            return { type: ActionType.ACTION_ERROR_SET, payload: error };
        }
    };

    function reducer(state, action) {
        const a = action;
        const handlers = new Map([
            [ActionType.SET_MODE, (s) => core.ImmutableUpdate.of(s, (d) => {
                    d.mode = a.payload;
                })],
            [ActionType.SET_CURRENT_STEP, (s) => core.ImmutableUpdate.of(s, (d) => {
                    d.currentStep = a.payload;
                })],
            [ActionType.SET_SELECTED_SECTION, (s) => core.ImmutableUpdate.of(s, (d) => {
                    d.selectedSection = a.payload;
                })],
            [ActionType.SET_RAIL_VISIBLE, (s) => core.ImmutableUpdate.of(s, (d) => {
                    d.railVisible = a.payload;
                })],
            [ActionType.SET_MOUNT_ROUTING, (s) => core.ImmutableUpdate.of(s, (d) => {
                    d.mountRouting = a.payload;
                })],
            [ActionType.STEP2_FIELD_CHANGE, (s) => core.ImmutableUpdate.of(s, (d) => {
                    const p = a.payload;
                    d.step2[p.field] = p.value;
                })],
            [ActionType.STEP3_FIELD_CHANGE, (s) => core.ImmutableUpdate.of(s, (d) => {
                    const p = a.payload;
                    d.step3[p.field] = p.value;
                })],
            [ActionType.STEP4_FIELD_CHANGE, (s) => core.ImmutableUpdate.of(s, (d) => {
                    const p = a.payload;
                    d.step4[p.field] = p.value;
                })],
            [ActionType.STEP5_FIELD_CHANGE, (s) => core.ImmutableUpdate.of(s, (d) => {
                    const p = a.payload;
                    d.step5[p.field] = p.value;
                })],
            [ActionType.PREREQS_LOAD_START, (s) => core.ImmutableUpdate.of(s, (d) => {
                    d.prereqs.loading = true;
                    d.prereqs.error = null;
                })],
            [ActionType.PREREQS_LOAD_SUCCESS, (s) => core.ImmutableUpdate.of(s, (d) => {
                    const p = a.payload;
                    d.prereqs.loading = false;
                    d.prereqs.checks = p.checks;
                    d.prereqs.error = null;
                })],
            [ActionType.PREREQS_LOAD_FAILURE, (s) => core.ImmutableUpdate.of(s, (d) => {
                    const p = a.payload;
                    d.prereqs.loading = false;
                    d.prereqs.error = p.error;
                })],
            [ActionType.CONSOLE_LOAD_START, (s) => core.ImmutableUpdate.of(s, (d) => {
                    d.console.loading = true;
                    d.console.actionError = null;
                })],
            [ActionType.CONSOLE_LOAD_SUCCESS, (s) => core.ImmutableUpdate.of(s, (d) => {
                    const slice = a.payload;
                    Object.assign(d.console, slice);
                    d.console.loading = false;
                })],
            [ActionType.CONSOLE_LOAD_FAILURE, (s) => core.ImmutableUpdate.of(s, (d) => {
                    const p = a.payload;
                    d.console.loading = false;
                    d.console.actionError = p.error;
                })],
            [ActionType.CONSOLE_DRIFT_SET, (s) => core.ImmutableUpdate.of(s, (d) => {
                    d.console.drift = a.payload;
                })],
            [ActionType.PHONES_LOAD_START, (s) => core.ImmutableUpdate.of(s, (d) => {
                    d.console.phonesLoading = true;
                    d.console.phonesError = null;
                })],
            [ActionType.PHONES_LOAD_SUCCESS, (s) => core.ImmutableUpdate.of(s, (d) => {
                    const p = a.payload;
                    if (p.employees !== undefined)
                        d.console.phonesEmployees = p.employees;
                    if (p.numbers !== undefined)
                        d.console.phonesNumbers = p.numbers;
                    if (p.byPhone !== undefined)
                        d.console.phonesByPhone = p.byPhone;
                    d.console.phonesLoading = false;
                })],
            [ActionType.PHONES_ASSIGNMENT_SAVE, (s) => core.ImmutableUpdate.of(s, (d) => {
                    const p = a.payload;
                    if (p.saving !== undefined) {
                        d.console.phonesSaving[p.phoneSid] = p.saving;
                    }
                    if (p.error !== undefined) {
                        d.console.phonesError = p.error;
                    }
                })],
            [ActionType.VOICE_FIELD_EDIT, (s) => core.ImmutableUpdate.of(s, (d) => {
                    const p = a.payload;
                    d.console.voiceEditing = p.field;
                    d.console.voicePendingValue = p.pendingValue ?? null;
                })],
            [ActionType.VOICE_FIELD_SAVE, (s) => core.ImmutableUpdate.of(s, (d) => {
                    const p = a.payload;
                    if (p.phase === 'start') {
                        d.console.voiceSaving = true;
                        d.console.voiceError = null;
                    }
                    else if (p.phase === 'success') {
                        d.console.voiceSaving = false;
                        d.console.voiceEditing = null;
                        d.console.voicePendingValue = null;
                        d.console.voiceError = null;
                    }
                    else if (p.phase === 'failure') {
                        d.console.voiceSaving = false;
                        d.console.voiceError = p.error ?? 'Voice save failed';
                    }
                })],
            [ActionType.DEACTIVATE_REQUEST, (s) => core.ImmutableUpdate.of(s, (d) => {
                    d.console.pendingDeactivateConfirm = true;
                    d.console.deactivateError = null;
                })],
            [ActionType.DEACTIVATE_SUCCESS, (s) => core.ImmutableUpdate.of(s, (d) => {
                    d.console.pendingDeactivateConfirm = false;
                    d.console.deactivateError = null;
                })],
            [ActionType.DEACTIVATE_FAILURE, (s) => core.ImmutableUpdate.of(s, (d) => {
                    const p = a.payload;
                    d.console.pendingDeactivateConfirm = false;
                    d.console.deactivateError = p.error;
                })],
            [ActionType.REACTIVATE_REQUEST, (s) => core.ImmutableUpdate.of(s, (d) => {
                    d.console.actionError = null;
                })],
            [ActionType.REACTIVATE_SUCCESS, (s) => core.ImmutableUpdate.of(s, (d) => {
                    d.console.actionError = null;
                })],
            [ActionType.REACTIVATE_FAILURE, (s) => core.ImmutableUpdate.of(s, (d) => {
                    const p = a.payload;
                    d.console.actionError = p.error;
                })],
            [ActionType.ACTION_ERROR_SET, (s) => core.ImmutableUpdate.of(s, (d) => {
                    d.console.actionError = a.payload;
                })]
        ]);
        const handler = handlers.get(action.type);
        return handler ? handler(state) : state;
    }

    const initialState = {
        mode: 'stepper',
        currentStep: 1,
        selectedSection: 'overview',
        railVisible: false,
        mountRouting: true,
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
        prereqs: {
            checks: null,
            loading: false,
            error: null
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
            preflightRefreshing: false,
            actionError: null
        }
    };

    const store = core.Store.create({
        reducer,
        state: initialState
    });

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

    async function loadConsole() {
        store.dispatch(Action.consoleLoadStart());
        const safe = (promise) => promise.catch(() => null);
        try {
            const [snapshot, assignments, preflight, recentCalls] = await Promise.all([
                safe(wizardCall('wizardSnapshot', {})),
                safe(wizardCall('wizardLoadAssignments', {})),
                safe(wizardCall('wizardRunPreflight', {})),
                safe(wizardCall('wizardListRecentCalls', { limit: 10 }))
            ]);
            const slice = {
                snapshot,
                assignments: (assignments && assignments.rows) || null,
                preflight: (preflight && preflight.checks) || null,
                recentCalls: (recentCalls && recentCalls.calls) || null
            };
            store.dispatch(Action.consoleLoadSuccess(slice));
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : 'Console load failed';
            store.dispatch(Action.consoleLoadFailure(msg));
        }
    }
    async function deactivate() {
        store.dispatch(Action.deactivateRequest());
        try {
            const result = await wizardCall('wizardActivate', { deactivate: true });
            if (result && result.ok === false) {
                const err = result.error || 'Deactivate failed';
                store.dispatch(Action.deactivateFailure(err));
                return;
            }
            store.dispatch(Action.deactivateSuccess());
            await loadConsole();
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : 'Deactivate failed';
            store.dispatch(Action.deactivateFailure(msg));
        }
    }
    async function reactivate() {
        store.dispatch(Action.reactivateRequest());
        try {
            const result = await wizardCall('wizardActivate', {});
            if (result && result.ok === false) {
                const err = result.error || 'Reactivate failed';
                store.dispatch(Action.reactivateFailure(err));
                return;
            }
            store.dispatch(Action.reactivateSuccess());
            await loadConsole();
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : 'Reactivate failed';
            store.dispatch(Action.reactivateFailure(msg));
        }
    }

    async function loadPhonesData() {
        store.dispatch(Action.phonesLoadStart());
        try {
            const [phonesPayload, employeesPayload] = await Promise.all([
                wizardCall('wizardListPhoneNumbers', {}),
                wizardCall('wizardListEmployees', {})
            ]);
            const numbers = (phonesPayload && phonesPayload.phones) || [];
            const employees = (employeesPayload && employeesPayload.employees) || [];
            store.dispatch(Action.phonesLoadSuccess({ numbers, employees }));
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : 'Phones load failed';
            store.dispatch(Action.phonesAssignmentSave({
                phoneSid: '__load__',
                error: msg
            }));
        }
    }
    async function savePhonesAssignment(phoneSid, employeeIds, label, primaryEmployeeId) {
        store.dispatch(Action.phonesAssignmentSave({ phoneSid, saving: true, error: null }));
        try {
            const payload = {
                phoneSid,
                employeeIds,
                label,
                primaryEmployeeId
            };
            const result = await wizardCall('wizardSaveAssignments', payload);
            if (result && result.ok === false) {
                const err = result.error || 'Save failed';
                store.dispatch(Action.phonesAssignmentSave({ phoneSid, saving: false, error: err }));
                return;
            }
            const refreshed = await wizardCall('wizardLoadAssignments', {});
            const byPhone = (refreshed && refreshed.byPhone) || [];
            store.dispatch(Action.phonesLoadSuccess({ byPhone }));
            store.dispatch(Action.phonesAssignmentSave({ phoneSid, saving: false, error: null }));
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : 'Save failed';
            store.dispatch(Action.phonesAssignmentSave({ phoneSid, saving: false, error: msg }));
        }
    }

    async function loadPrereqs() {
        store.dispatch(Action.prereqsLoadStart());
        try {
            const payload = await wizardCall('wizardPrereqs', {});
            const checks = (payload && payload.checks) || [];
            store.dispatch(Action.prereqsLoadSuccess(checks));
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : 'Prereqs load failed';
            store.dispatch(Action.prereqsLoadFailure(msg));
        }
    }

    function determineLandingStep(snap) {
        const has = (v) => !!(v && String(v).trim().length > 0);
        if (!has(snap.accountSid) || !has(snap.apiKeySid))
            return 2;
        if (!has(snap.apiSecretId))
            return 2;
        if (!has(snap.twimlAppSid) || !has(snap.phoneNumber))
            return 3;
        return 'console';
    }
    const TOTAL_STEPS = 5;
    function goToStep(stepNum) {
        const clamped = Math.max(1, Math.min(TOTAL_STEPS, stepNum));
        store.dispatch(Action.setMode('stepper'));
        store.dispatch(Action.setCurrentStep(clamped));
        if (clamped === 1) {
            loadPrereqs();
        }
    }
    function goToConsole() {
        store.dispatch(Action.setMode('console'));
        store.dispatch(Action.setSelectedSection('overview'));
        store.dispatch(Action.setRailVisible(true));
        store.dispatch(Action.actionErrorSet(null));
        loadConsole();
    }
    function goToSection(sectionName) {
        store.dispatch(Action.setSelectedSection(sectionName));
        const state = store.getState();
        if (state.mode === 'stepper') {
            store.dispatch(Action.setMode('console'));
        }
        store.dispatch(Action.actionErrorSet(null));
        if (sectionName === 'phones' && state.console.phonesNumbers === null) {
            loadPhonesData();
        }
    }

    const StatusIcon = (props) => {
        let icon;
        let color;
        switch (props.status) {
            case 'pass':
                icon = core__namespace.SystemIcon.STATUS_SUCCESS_FILLED;
                color = core__namespace.ImageConstant.Color.SUCCESS;
                break;
            case 'fail':
                icon = core__namespace.SystemIcon.STATUS_ERROR_FILLED;
                color = core__namespace.ImageConstant.Color.DANGER;
                break;
            case 'warn':
                icon = core__namespace.SystemIcon.STATUS_WARNING_FILLED;
                color = core__namespace.ImageConstant.Color.WARNING;
                break;
            case 'info_enabled':
                icon = core__namespace.SystemIcon.STATUS_INFO_FILLED;
                color = core__namespace.ImageConstant.Color.INFO;
                break;
            case 'info_disabled':
                icon = core__namespace.SystemIcon.STATUS_INFO;
                color = core__namespace.ImageConstant.Color.NEUTRAL;
                break;
            default:
                icon = core__namespace.SystemIcon.STATUS_INFO;
                color = core__namespace.ImageConstant.Color.NEUTRAL;
        }
        return (jsxRuntime.jsx(component__namespace.Image, { image: icon, size: (props.size || component__namespace.Image.Size.M), color: color, presentation: true }));
    };

    const CheckRow = (props) => {
        const { check } = props;
        return (jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.HORIZONTAL, alignment: component__namespace.StackPanel.Alignment.START, itemGap: component__namespace.StackPanel.GapSize.M, children: [jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(StatusIcon, { status: check.status }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.XXS, children: [jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.STRONG, children: check.label }) }), check.detail ? (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, size: component__namespace.Text.Size.S, children: check.detail }) })) : null, check.repairHint ? (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { size: component__namespace.Text.Size.S, children: '→ ' + check.repairHint }) })) : null] }) })] }));
    };

    const PrereqsList = (props) => {
        const { checks } = props;
        if (!checks || checks.length === 0) {
            return (jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, children: "No checks returned." }));
        }
        return (jsxRuntime.jsx(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.M, children: checks.map((c, idx) => (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(CheckRow, { check: c }) }, 'check-' + (c.id || idx)))) }));
    };

    const ErrorText = (props) => {
        const prefix = props.glyph === false ? '' : '✕ ';
        return (jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.STRONG, children: prefix + props.message }));
    };

    class Step1 extends core.PureComponent {
        componentDidMount() {
            loadPrereqs();
        }
        render() {
            const state = store.getState();
            const p = state.prereqs;
            const heading = (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Heading, { level: 2, children: "Prerequisites" }) }));
            const intro = (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { children: "The wizard verifies that NetSuite features required by Click-to-Call are enabled. Fix any failures before continuing." }) }));
            if (p.loading) {
                return (jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.M, children: [heading, intro, jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: new component__namespace.Loader({
                                label: 'Running prerequisite checks…',
                                indeterminate: true
                            }) })] }));
            }
            if (p.error) {
                return (jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.M, children: [heading, intro, jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(ErrorText, { message: p.error }) })] }));
            }
            const checks = p.checks || [];
            return (jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.M, children: [heading, intro, jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(PrereqsList, { checks: checks }) })] }));
        }
    }

    class Step2Field extends core.PureComponent {
        handleChange = (args) => {
            const v = (args && args.text) || '';
            store.dispatch(Action.step2FieldChange(this.props.field, v));
        };
        render() {
            const state = store.getState();
            const value = state.step2[this.props.field] || '';
            return (jsxRuntime.jsx(component__namespace.Field, { label: this.props.label, orientation: component__namespace.Field.Orientation.VERTICAL, children: jsxRuntime.jsx(component__namespace.TextBox, { text: value, placeholder: this.props.placeholder, onTextChanged: this.handleChange }) }));
        }
    }
    class Step2 extends core.PureComponent {
        render() {
            return (jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.M, children: [jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Heading, { level: 2, children: "Connect to your Twilio account" }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { children: "Enter your Twilio Account SID and API Key SID. The API Key Secret must already exist in NetSuite API Secrets (Setup > Company > API Secrets) \u2014 paste its script ID below. Live validation against Twilio runs at Step 5 (Test & activate) using the configured secret pointer \u2014 no need to paste the secret value here." }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsxs(component__namespace.GridPanel, { columns: "1fr 1fr 1fr", rows: "auto", columnGap: component__namespace.GridPanel.GapSize.M, children: [jsxRuntime.jsx(component__namespace.GridPanel.Item, { children: jsxRuntime.jsx(Step2Field, { label: "Account SID", placeholder: "AC...", field: "accountSid" }) }), jsxRuntime.jsx(component__namespace.GridPanel.Item, { children: jsxRuntime.jsx(Step2Field, { label: "API Key SID", placeholder: "SK...", field: "apiKeySid" }) }), jsxRuntime.jsx(component__namespace.GridPanel.Item, { children: jsxRuntime.jsx(Step2Field, { label: "API Key Secret script ID", placeholder: "custsecret_...", field: "apiSecretId" }) })] }) })] }));
        }
    }

    async function loadStep3Lists() {
        store.dispatch(Action.step3FieldChange('twimlApps', null));
        store.dispatch(Action.step3FieldChange('phoneNumbers', null));
        store.dispatch(Action.step3FieldChange('intelServices', null));
        store.dispatch(Action.step3FieldChange('listLoadError', null));
        const fetchList = async (action, field, sidField, sidValue) => {
            try {
                const resp = (await wizardCall(action, {}));
                const items = (resp && resp.items) || [];
                store.dispatch(Action.step3FieldChange(field, items));
                if (resp && resp.errorMessage) {
                    store.dispatch(Action.step3FieldChange('listLoadError', resp.errorMessage));
                }
                const existing = store.getState().step3[sidField];
                if (items.length > 0 && !existing) {
                    const v = sidValue(items[0]);
                    if (v)
                        store.dispatch(Action.step3FieldChange(sidField, v));
                }
            }
            catch (e) {
                const err = e;
                store.dispatch(Action.step3FieldChange(field, []));
                store.dispatch(Action.step3FieldChange('listLoadError', field + ': ' + (err.message || String(e))));
            }
        };
        await Promise.all([
            fetchList('wizardListTwiMLApps', 'twimlApps', 'twimlAppSid', (i) => i.sid || ''),
            fetchList('wizardListPhoneNumbers', 'phoneNumbers', 'phoneNumber', (i) => i.phoneNumber || ''),
            fetchList('wizardListIntelServices', 'intelServices', 'intelServiceSid', (i) => i.sid || '')
        ]);
    }
    async function loadStep4Lists() {
        store.dispatch(Action.step4FieldChange('phoneNumbers', null));
        store.dispatch(Action.step4FieldChange('employees', null));
        store.dispatch(Action.step4FieldChange('assignments', {}));
        store.dispatch(Action.step4FieldChange('listLoadError', null));
        const reportError = (prefix, e) => {
            const err = e;
            store.dispatch(Action.step4FieldChange('listLoadError', prefix + ': ' + (err.message || String(e))));
        };
        const numbersTask = wizardCall('wizardListPhoneNumbers', {})
            .then((p) => {
            const resp = p;
            store.dispatch(Action.step4FieldChange('phoneNumbers', (resp && resp.items) || []));
        })
            .catch((e) => {
            store.dispatch(Action.step4FieldChange('phoneNumbers', []));
            reportError('Phone numbers', e);
        });
        const employeesTask = wizardCall('wizardListEmployees', {})
            .then((p) => {
            const resp = p;
            store.dispatch(Action.step4FieldChange('employees', (resp && resp.items) || []));
        })
            .catch((e) => {
            store.dispatch(Action.step4FieldChange('employees', []));
            reportError('Employees', e);
        });
        const assignmentsTask = wizardCall('wizardLoadAssignments', {})
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
            store.dispatch(Action.step4FieldChange('assignments', map));
        })
            .catch(() => { });
        await Promise.all([numbersTask, employeesTask, assignmentsTask]);
    }
    async function loadStep5() {
        const safe = (promise) => promise.catch(() => null);
        const [snapshot, assignments, preflight] = await Promise.all([
            safe(wizardCall('wizardSnapshot', {})),
            safe(wizardCall('wizardLoadAssignments', {})),
            safe(wizardCall('wizardRunPreflight', {}))
        ]);
        store.dispatch(Action.consoleLoadSuccess({
            snapshot,
            assignments: (assignments && assignments.rows) || null,
            preflight: (preflight && preflight.checks) || null
        }));
    }

    class DropdownField extends core.PureComponent {
        render() {
            const { label, options, selectedValue, allowEmpty } = this.props;
            if (options.length === 0) {
                return (jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.XXS, children: [jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.STRONG, children: label }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, children: "(no items found in Twilio for this account)" }) })] }));
            }
            const ds = new core__namespace.ArrayDataSource(options);
            return (jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.XXS, children: [jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.STRONG, children: label }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Dropdown, { dataSource: ds, valueMember: "value", displayMember: "label", selectedValue: selectedValue || (allowEmpty ? null : options[0].value), allowEmpty: !!allowEmpty, placeholder: allowEmpty ? '(none)' : 'Select…', onSelectionChanged: (args) => {
                                this.props.onChange((args && args.value) || '');
                            } }) })] }));
        }
    }
    class Step3 extends core.PureComponent {
        componentDidMount() {
            loadStep3Lists();
        }
        dispatchField = (field, value) => {
            store.dispatch(Action.step3FieldChange(field, value));
        };
        render() {
            const state = store.getState();
            const s = state.step3;
            const heading = (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Heading, { level: 2, children: "Voice configuration" }) }));
            const intro = (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { children: "Pick the TwiML application, default outbound caller ID, and Conversational Intelligence service from your Twilio account. These are fetched live using the secure API Secret configured in Step 2 \u2014 the secret value never leaves NetSuite's vault." }) }));
            if (s.twimlApps === null || s.phoneNumbers === null || s.intelServices === null) {
                return (jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.M, children: [heading, intro, jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: new component__namespace.Loader({
                                label: 'Loading from Twilio…',
                                indeterminate: true
                            }) })] }));
            }
            if (s.listLoadError) {
                return (jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.M, children: [heading, intro, jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsxs(component__namespace.Text, { type: component__namespace.Text.Type.STRONG, children: ["\u2715 Could not load Twilio lists: ", s.listLoadError, ". Verify the API Secret value is set at Setup > Company > API Secrets, then go back to Step 2 and Continue again to retry."] }) })] }));
            }
            const twimlOptions = s.twimlApps.map((ti) => ({
                value: ti.sid || '',
                label: (ti.friendlyName || '(unnamed)') + (ti.sid ? '  [' + ti.sid + ']' : '')
            }));
            const phoneOptions = s.phoneNumbers.map((n) => ({
                value: n.phoneNumber || '',
                label: (n.phoneNumber || '') + (n.friendlyName ? ' — ' + n.friendlyName : '')
            }));
            const intelOptions = s.intelServices.map((ti) => ({
                value: ti.sid || '',
                label: (ti.friendlyName || '(unnamed)') + (ti.sid ? '  [' + ti.sid + ']' : '')
            }));
            return (jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.M, children: [heading, intro, jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(DropdownField, { label: "TwiML Application", options: twimlOptions, selectedValue: s.twimlAppSid, onChange: (v) => this.dispatchField('twimlAppSid', v) }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(DropdownField, { label: "Default outbound caller ID", options: phoneOptions, selectedValue: s.phoneNumber, onChange: (v) => this.dispatchField('phoneNumber', v) }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(DropdownField, { label: "Conversational Intelligence Service", options: intelOptions, selectedValue: s.intelServiceSid, onChange: (v) => this.dispatchField('intelServiceSid', v) }) })] }));
        }
    }

    class AssignmentRow extends core.PureComponent {
        handleSelectionChanged = (args) => {
            const { phoneNumber } = this.props;
            const values = (args && args.values) || [];
            const state = store.getState();
            const assignments = {
                ...state.step4.assignments
            };
            const prev = assignments[phoneNumber.sid] || {};
            const next = {
                ...prev,
                employeeIds: values
            };
            if (!prev.primaryEmployeeId || values.indexOf(prev.primaryEmployeeId) === -1) {
                next.primaryEmployeeId = values.length > 0 ? values[0] : null;
            }
            assignments[phoneNumber.sid] = next;
            store.dispatch(Action.step4FieldChange('assignments', assignments));
        };
        render() {
            const { phoneNumber, employees, assignment } = this.props;
            const dataItems = employees.map((e) => ({
                value: e.id,
                label: (e.name || '') + (e.email ? ' (' + e.email + ')' : '')
            }));
            const ds = new core__namespace.ArrayDataSource(dataItems);
            const lookupName = (id) => {
                for (const emp of employees) {
                    if (Number(emp.id) === Number(id))
                        return emp.name || '';
                }
                return '(id ' + id + ')';
            };
            const selectedItems = (assignment.employeeIds || []).map((id) => ({
                value: id,
                label: lookupName(id)
            }));
            const labelText = (phoneNumber.phoneNumber || '') +
                (phoneNumber.friendlyName ? '  —  ' + phoneNumber.friendlyName : '');
            return (jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.XS, children: [jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.STRONG, children: labelText }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.MultiselectDropdown, { dataSource: ds, valueMember: "value", displayMember: "label", selectedItems: selectedItems, placeholder: "Assign reps\u2026", onSelectionChanged: this.handleSelectionChanged }) })] }));
        }
    }
    class Step4 extends core.PureComponent {
        componentDidMount() {
            loadStep4Lists();
        }
        render() {
            const state = store.getState();
            const s = state.step4;
            const heading = (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Heading, { level: 2, children: "Phone numbers & rep assignments" }) }));
            const intro = (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { children: "Assign reps to your Twilio phone numbers. Each rep with a number assigned will use it as their outbound caller ID. Reps without an assignment fall back to the default caller ID set in Step 3." }) }));
            if (s.phoneNumbers === null || s.employees === null) {
                return (jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.M, children: [heading, intro, jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: new component__namespace.Loader({
                                label: 'Loading phone numbers and employees…',
                                indeterminate: true
                            }) })] }));
            }
            if (s.listLoadError) {
                return (jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.M, children: [heading, intro, jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsxs(component__namespace.Text, { type: component__namespace.Text.Type.STRONG, children: ["\u2715 ", s.listLoadError] }) })] }));
            }
            const phoneNumbers = s.phoneNumbers || [];
            const employees = s.employees || [];
            const assignments = s.assignments;
            if (phoneNumbers.length === 0) {
                return (jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.M, children: [heading, intro, jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, children: "(no phone numbers owned by this Twilio account \u2014 buy one in Twilio Console before continuing)" }) })] }));
            }
            return (jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.L, children: [heading, intro, phoneNumbers.map((pn) => (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(AssignmentRow, { phoneNumber: pn, employees: employees, assignment: assignments[pn.sid] || {} }) }, pn.sid)))] }));
        }
    }

    const CheckRowItem$1 = (props) => {
        const { check } = props;
        const status = check.status || 'info_enabled';
        let icon;
        let color;
        switch (status) {
            case 'pass':
                icon = core__namespace.SystemIcon.STATUS_SUCCESS_FILLED;
                color = core__namespace.ImageConstant.Color.SUCCESS;
                break;
            case 'fail':
                icon = core__namespace.SystemIcon.STATUS_ERROR_FILLED;
                color = core__namespace.ImageConstant.Color.DANGER;
                break;
            case 'warn':
                icon = core__namespace.SystemIcon.STATUS_WARNING_FILLED;
                color = core__namespace.ImageConstant.Color.WARNING;
                break;
            case 'info_enabled':
                icon = core__namespace.SystemIcon.STATUS_INFO_FILLED;
                color = core__namespace.ImageConstant.Color.INFO;
                break;
            default:
                icon = core__namespace.SystemIcon.STATUS_INFO;
                color = core__namespace.ImageConstant.Color.NEUTRAL;
        }
        return (jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.HORIZONTAL, alignment: component__namespace.StackPanel.Alignment.START, itemGap: component__namespace.StackPanel.GapSize.M, children: [jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Image, { image: icon, size: component__namespace.Image.Size.M, color: color, presentation: true }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.XXS, children: [jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.STRONG, children: check.label || '' }) }), check.detail ? (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, size: component__namespace.Text.Size.S, children: check.detail }) })) : null, check.repairHint ? (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { size: component__namespace.Text.Size.S, children: '→ ' + check.repairHint }) })) : null] }) })] }));
    };
    class Step5 extends core.PureComponent {
        componentDidMount() {
            store.dispatch(Action.step5FieldChange('loading', true));
            store.dispatch(Action.step5FieldChange('activateError', null));
            loadStep5().finally(() => {
                store.dispatch(Action.step5FieldChange('loading', false));
            });
        }
        rerunPreflight = () => {
            store.dispatch(Action.step5FieldChange('loading', true));
            store.dispatch(Action.step5FieldChange('activateError', null));
            loadStep5().finally(() => {
                store.dispatch(Action.step5FieldChange('loading', false));
            });
        };
        activate = async () => {
            try {
                const payload = await wizardCall('wizardActivate', {});
                const resp = payload;
                if (resp && resp.activated) {
                    store.dispatch(Action.step5FieldChange('activated', true));
                    store.dispatch(Action.step5FieldChange('activateError', null));
                }
                else {
                    store.dispatch(Action.step5FieldChange('activateError', (resp && resp.error) || 'unknown'));
                    if (resp && resp.failedChecks) {
                        store.dispatch(Action.consoleLoadSuccess({
                            preflight: resp.failedChecks
                        }));
                    }
                }
            }
            catch (e) {
                const err = e;
                store.dispatch(Action.step5FieldChange('activateError', 'Network: ' + (err.message || String(e))));
            }
        };
        render() {
            const state = store.getState();
            const s = state.step5;
            const heading = (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Heading, { level: 2, children: "Test & activate" }) }));
            if (s.activated) {
                return (jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.M, children: [heading, jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.STRONG, children: "\u2713 Click-to-Call is active. Sales reps can now use the phone icon on Customer, Lead, and Contact records." }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Button, { label: "Go to Admin Console", type: component__namespace.Button.Type.PRIMARY, action: () => { goToConsole(); } }) })] }));
            }
            if (s.loading) {
                return (jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.M, children: [heading, jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: new component__namespace.Loader({
                                label: 'Running preflight checks…',
                                indeterminate: true
                            }) })] }));
            }
            const consoleState = state.console;
            const snap = consoleState.snapshot || null;
            const assignments = consoleState.assignments || [];
            const preflight = consoleState.preflight || null;
            const phoneNumbersWithReps = {};
            assignments.forEach((a) => {
                if (a.phoneSid)
                    phoneNumbersWithReps[a.phoneSid] = true;
            });
            const reviewLines = snap ? [
                'Account SID:        ' + (snap.accountSid || '(not set)'),
                'API Key SID:        ' + (snap.apiKeySid || '(not set)'),
                'API Key Secret:     ' + (snap.apiSecretId || '(not set)'),
                'TwiML Application:  ' + (snap.twimlAppSid || '(not set)'),
                'Default caller ID:  ' + (snap.phoneNumber || '(not set)'),
                'Intel Service:      ' + (snap.intelServiceSid || '(none)'),
                'Phone assignments:  ' + assignments.length + ' rep(s) across ' +
                    Object.keys(phoneNumbersWithReps).length + ' number(s)'
            ] : [];
            const allPassed = preflight !== null &&
                preflight.every((c) => c.status === 'pass');
            return (jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.M, children: [heading, snap ? (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Heading, { level: 3, children: "Configuration review" }) })) : null, reviewLines.map((line, idx) => (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { size: component__namespace.Text.Size.S, children: line }) }, 'review-' + idx))), preflight ? (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Heading, { level: 3, children: "Preflight checks" }) })) : null, (preflight || []).map((check, idx) => (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(CheckRowItem$1, { check: check }) }, 'pf-' + (check.id || idx)))), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Button, { label: allPassed
                                ? 'Activate Click-to-Call'
                                : 'Activate Click-to-Call (fix preflight first)', type: component__namespace.Button.Type.PRIMARY, enabled: allPassed, action: () => { this.activate(); } }) }), s.activateError ? (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsxs(component__namespace.Text, { type: component__namespace.Text.Type.STRONG, children: ["\u2715 Activation failed: ", s.activateError] }) })) : null, jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Button, { label: "Re-run preflight", type: component__namespace.Button.Type.DEFAULT, action: this.rerunPreflight }) })] }));
        }
    }

    const StatCard = (props) => {
        const toneColor = (() => {
            switch (props.tone) {
                case 'success': return core__namespace.ImageConstant.Color.SUCCESS;
                case 'warning': return core__namespace.ImageConstant.Color.WARNING;
                case 'info': return core__namespace.ImageConstant.Color.INFO;
                default: return core__namespace.ImageConstant.Color.NEUTRAL;
            }
        })();
        return (jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.XS, rootStyle: {
                padding: '16px',
                border: '1px solid #E2E3E5',
                borderRadius: '6px',
                background: '#FFFFFF'
            }, children: [jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, size: component__namespace.Text.Size.S, children: props.title }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.HORIZONTAL, alignment: component__namespace.StackPanel.Alignment.CENTER, itemGap: component__namespace.StackPanel.GapSize.XS, children: [props.icon ? (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Image, { image: props.icon, size: component__namespace.Image.Size.M, color: toneColor, presentation: true }) })) : null, jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Heading, { level: 3, children: props.metric }) })] }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, size: component__namespace.Text.Size.S, children: props.description }) })] }));
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
    const formatCallStatus = (status) => {
        const norm = (status || '').trim();
        if (!norm)
            return '—';
        return norm.charAt(0).toUpperCase() + norm.slice(1).toLowerCase();
    };
    const statusBadgePalette = (status) => {
        const norm = (status || '').toLowerCase().trim();
        switch (norm) {
            case 'transcribed': return { bg: '#D4EDDA', fg: '#155724', border: '#A3D9AE' };
            case 'processing': return { bg: '#CCE5FF', fg: '#004085', border: '#9FCDFF' };
            case 'logged': return { bg: '#E2E3E5', fg: '#383D41', border: '#C7CACE' };
            case 'no_transcript':
            case 'no transcript': return { bg: '#FFF3CD', fg: '#856404', border: '#FFE69C' };
            case 'failed': return { bg: '#F8D7DA', fg: '#721C24', border: '#F1B5BB' };
            default: return { bg: '#E2E3E5', fg: '#383D41', border: '#C7CACE' };
        }
    };
    class OverviewPage extends core.PureComponent {
        recentCallsColumns;
        constructor(props, context) {
            super(props, context);
            const CT = component__namespace.DataGrid.ColumnType;
            const BdgType = component__namespace.Badge.Type;
            this.recentCallsColumns = [
                {
                    type: CT.TEMPLATED,
                    name: 'date',
                    label: 'Date',
                    stretchFactor: 2,
                    content: (args) => {
                        const row = args?.cell?.row?.dataItem;
                        return new component__namespace.Text({ text: row?.date || '—' });
                    }
                },
                {
                    type: CT.TEMPLATED,
                    name: 'rep',
                    label: 'Rep',
                    stretchFactor: 2,
                    content: (args) => {
                        const row = args?.cell?.row?.dataItem;
                        return new component__namespace.Text({ text: row?.repName || '(unassigned)' });
                    }
                },
                {
                    type: CT.TEMPLATED,
                    name: 'contact',
                    label: 'Contact',
                    stretchFactor: 3,
                    content: (args) => {
                        const row = args?.cell?.row?.dataItem;
                        const primary = row?.companyName || row?.contactName || '(unknown)';
                        return new component__namespace.Text({ text: primary, type: component__namespace.Text.Type.STRONG });
                    }
                },
                {
                    type: CT.TEMPLATED,
                    name: 'duration',
                    label: 'Duration',
                    stretchFactor: 1,
                    content: (args) => {
                        const row = args?.cell?.row?.dataItem;
                        return new component__namespace.Text({ text: row ? formatDuration(row.duration) : '—' });
                    }
                },
                {
                    type: CT.TEMPLATED,
                    name: 'status',
                    label: 'AI Status',
                    stretchFactor: 2,
                    content: (args) => {
                        const row = args?.cell?.row?.dataItem;
                        if (!row)
                            return new component__namespace.Text({ text: '—' });
                        const palette = statusBadgePalette(row.status);
                        return new component__namespace.Badge({
                            content: formatCallStatus(row.status),
                            type: BdgType.SUBTLE,
                            rootStyle: {
                                backgroundColor: palette.bg,
                                color: palette.fg,
                                border: '1px solid ' + palette.border
                            }
                        });
                    }
                }
            ];
        }
        handleNav = (section) => goToSection(section);
        handleDeactivate = () => { deactivate(); };
        handleRowClick = (args) => {
            const dataItem = args?.row?.dataItem;
            if (!dataItem?.id)
                return;
            try {
                window.open('/app/crm/calendar/call.nl?id=' + encodeURIComponent(String(dataItem.id)), '_blank');
            }
            catch (e) { }
        };
        render() {
            const state = store.getState();
            const c = state.console;
            const snap = (c.snapshot || {});
            const assignments = (c.assignments || []);
            const preflight = (c.preflight || []);
            const recentCalls = c.recentCalls;
            const phoneCount = {};
            assignments.forEach((a) => { if (a.phoneSid)
                phoneCount[a.phoneSid] = true; });
            const phonesConfigured = Object.keys(phoneCount).length || (snap.phoneNumber ? 1 : 0);
            const repCount = assignments.length;
            const preflightPassed = preflight.filter((cc) => cc.status === 'pass').length;
            const preflightTotal = preflight.length;
            const statusLabel = snap.active === false ? 'Paused'
                : snap.active === true ? 'Active' : 'Unknown';
            const statusIcon = snap.active === true ? core__namespace.SystemIcon.STATUS_SUCCESS_FILLED
                : snap.active === false ? core__namespace.SystemIcon.STATUS_WARNING_FILLED
                    : core__namespace.SystemIcon.STATUS_INFO_FILLED;
            const statusTone = snap.active === true ? 'success' : snap.active === false ? 'warning' : 'info';
            const recentCallsDs = recentCalls && recentCalls.length > 0
                ? new core__namespace.ArrayDataSource(recentCalls)
                : null;
            return (jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.L, children: [jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsxs(component__namespace.GridPanel, { columns: "1fr 1fr 1fr 1fr", rows: "auto", columnGap: component__namespace.GridPanel.GapSize.M, children: [jsxRuntime.jsx(component__namespace.GridPanel.Item, { children: jsxRuntime.jsx(StatCard, { title: "Status", metric: statusLabel, description: snap.active === false
                                            ? 'Reps cannot place calls'
                                            : 'Reps can place calls', icon: statusIcon, tone: statusTone }) }), jsxRuntime.jsx(component__namespace.GridPanel.Item, { children: jsxRuntime.jsx(StatCard, { title: "Phone numbers", metric: String(phonesConfigured), description: phonesConfigured === 0
                                            ? 'No numbers configured'
                                            : (snap.phoneNumber || '') }) }), jsxRuntime.jsx(component__namespace.GridPanel.Item, { children: jsxRuntime.jsx(StatCard, { title: "Assigned reps", metric: String(repCount), description: repCount === 0
                                            ? 'No assignments'
                                            : (repCount === 1 ? '1 rep' : repCount + ' reps') }) }), jsxRuntime.jsx(component__namespace.GridPanel.Item, { children: jsxRuntime.jsx(StatCard, { title: "Preflight", metric: preflightTotal > 0
                                            ? preflightPassed + ' of ' + preflightTotal
                                            : '—', description: preflightTotal > 0
                                            ? 'See Health for detail'
                                            : 'Not yet run' }) })] }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.S, children: [jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Heading, { level: 3, children: "Quick actions" }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, size: component__namespace.Text.Size.S, children: "Common admin tasks \u2014 full screens still available via the left rail." }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.HORIZONTAL, itemGap: component__namespace.StackPanel.GapSize.S, children: [jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Button, { label: "Add a phone number", startIcon: core__namespace.SystemIcon.ADD, action: () => this.handleNav('phones') }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Button, { label: "Reassign reps", startIcon: core__namespace.SystemIcon.REFRESH, action: () => this.handleNav('phones') }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Button, { label: "Update voice config", startIcon: core__namespace.SystemIcon.PLAY, action: () => this.handleNav('voice') }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Button, { label: "Rotate API Key Secret", startIcon: core__namespace.SystemIcon.LOCK, action: () => this.handleNav('credentials') }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Button, { label: "Deactivate", type: component__namespace.Button.Type.DANGER, startIcon: core__namespace.SystemIcon.STOP, action: this.handleDeactivate }) })] }) })] }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.S, children: [jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Heading, { level: 3, children: "Recent calls" }) }), recentCalls === null ? (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: new component__namespace.Loader({
                                        label: 'Loading recent calls…',
                                        indeterminate: true
                                    }) })) : recentCalls.length === 0 ? (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, children: "No calls logged yet. Once reps start placing calls through Click-to-Call, the 10 most recent will show up here." }) })) : (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: new component__namespace.DataGrid({
                                        dataSource: recentCallsDs,
                                        columns: this.recentCallsColumns,
                                        columnStretch: true,
                                        highlightRowsOnHover: true,
                                        stripedRows: true,
                                        dataRowHeight: 56,
                                        headerRowHeight: 40,
                                        onRowClick: this.handleRowClick
                                    }) }))] }) })] }));
        }
    }

    const truncSid = (sid) => {
        if (!sid)
            return '';
        if (sid.length <= 14)
            return sid;
        return sid.slice(0, 6) + '…' + sid.slice(-4);
    };
    class PhonesPage extends core.PureComponent {
        buildColumns(employees) {
            const CT = component__namespace.DataGrid.ColumnType;
            const IM = component__namespace.DataGrid.InputMode;
            const BdgType = component__namespace.Badge.Type;
            const employeesDs = new core__namespace.ArrayDataSource(employees);
            const statusForRow = (row) => {
                const state = store.getState();
                const saving = state.console.phonesSaving[row.phoneSid || ''];
                const hasReps = (row.employeeIds || []).length > 0;
                if (saving) {
                    return {
                        icon: core__namespace.SystemIcon.STATUS_INFO_FILLED,
                        color: core__namespace.ImageConstant.Color.INFO,
                        label: 'Saving…'
                    };
                }
                if (hasReps) {
                    return {
                        icon: core__namespace.SystemIcon.STATUS_SUCCESS_FILLED,
                        color: core__namespace.ImageConstant.Color.SUCCESS,
                        label: 'Live'
                    };
                }
                return {
                    icon: core__namespace.SystemIcon.STATUS_WARNING_FILLED,
                    color: core__namespace.ImageConstant.Color.WARNING,
                    label: 'No reps'
                };
            };
            return [
                {
                    type: CT.TEMPLATED,
                    name: 'statusIcon',
                    label: '',
                    stretchFactor: 1,
                    content: (args) => {
                        const row = args?.cell?.row?.dataItem;
                        if (!row)
                            return new component__namespace.Text({ text: '' });
                        const s = statusForRow(row);
                        return new component__namespace.Image({
                            image: s.icon,
                            size: component__namespace.Image.Size.M,
                            color: s.color,
                            presentation: true
                        });
                    }
                },
                {
                    type: CT.TEMPLATED,
                    name: 'phone',
                    label: 'Phone number',
                    stretchFactor: 2,
                    content: (args) => {
                        const row = args?.cell?.row?.dataItem;
                        return new component__namespace.Text({
                            text: row?.phoneNumber || '(unknown)',
                            type: component__namespace.Text.Type.STRONG
                        });
                    }
                },
                {
                    type: CT.TEMPLATED,
                    name: 'phoneSid',
                    label: 'Phone SID',
                    stretchFactor: 2,
                    content: (args) => {
                        const row = args?.cell?.row?.dataItem;
                        return new component__namespace.Text({
                            text: truncSid(row?.phoneSid),
                            type: component__namespace.Text.Type.WEAK,
                            size: component__namespace.Text.Size.S
                        });
                    }
                },
                {
                    type: CT.MULTI_SELECT_DROPDOWN,
                    name: 'reps',
                    label: 'Assigned reps',
                    stretchFactor: 5,
                    binding: 'employeeIds',
                    inputMode: IM.EDIT_ONLY,
                    dataSource: employeesDs,
                    editable: true,
                    displayMember: (value) => {
                        if (value && typeof value === 'object') {
                            return value.name || '';
                        }
                        const id = Number(value);
                        const emp = employees.find((e) => e.id === id);
                        return emp?.name || '';
                    },
                    widgetOptions: (row) => {
                        const dataItem = row?.dataItem || {};
                        const phoneSid = dataItem.phoneSid;
                        const label = dataItem.label || '';
                        const primary = dataItem.primaryEmployeeId ?? null;
                        return {
                            dataSource: employeesDs,
                            valueMember: 'id',
                            displayMember: 'name',
                            placeholder: 'Pick reps',
                            onSelectionChanged: (args) => {
                                const newIds = ((args && args.values) || []).map((v) => {
                                    if (v && typeof v === 'object') {
                                        return Number(v.id);
                                    }
                                    return Number(v);
                                });
                                if (phoneSid) {
                                    savePhonesAssignment(phoneSid, newIds, label, primary);
                                }
                            }
                        };
                    }
                },
                {
                    type: CT.TEMPLATED,
                    name: 'status',
                    label: 'Status',
                    stretchFactor: 2,
                    content: (args) => {
                        const row = args?.cell?.row?.dataItem;
                        if (!row)
                            return new component__namespace.Text({ text: '—' });
                        const s = statusForRow(row);
                        const palette = s.label === 'Live' ? { bg: '#D4EDDA', fg: '#155724', border: '#A3D9AE' } :
                            s.label === 'Saving…' ? { bg: '#CCE5FF', fg: '#004085', border: '#9FCDFF' } :
                                { bg: '#FFF3CD', fg: '#856404', border: '#FFE69C' };
                        return new component__namespace.Badge({
                            content: s.label,
                            type: BdgType.SUBTLE,
                            rootStyle: {
                                backgroundColor: palette.bg,
                                color: palette.fg,
                                border: '1px solid ' + palette.border
                            }
                        });
                    }
                }
            ];
        }
        render() {
            const state = store.getState();
            const c = state.console;
            const grouped = (c.phonesByPhone || []);
            const employees = (c.phonesEmployees || []);
            if (c.phonesLoading) {
                return (jsxRuntime.jsx(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.L, children: jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: new component__namespace.Loader({
                            label: 'Loading phones & reps…',
                            indeterminate: true
                        }) }) }));
            }
            const columns = this.buildColumns(employees);
            const rowsDs = grouped.length > 0 ? new core__namespace.ArrayDataSource(grouped) : null;
            return (jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.XL, children: [jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.HORIZONTAL, itemGap: component__namespace.StackPanel.GapSize.S, children: [jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Button, { label: "Refresh from Twilio", startIcon: core__namespace.SystemIcon.REFRESH, action: () => { loadPhonesData(); } }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Button, { label: "Add phone number", type: component__namespace.Button.Type.PRIMARY, startIcon: core__namespace.SystemIcon.ADD, action: () => { goToStep(4); } }) })] }) }), c.phonesError ? (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsxs(component__namespace.Text, { type: component__namespace.Text.Type.STRONG, children: ["\u2715 ", c.phonesError] }) })) : null, grouped.length === 0 ? (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, children: "No phone numbers configured yet. Click \"Add phone number\" above to claim a Twilio number and assign reps." }) })) : (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: new component__namespace.DataGrid({
                            dataSource: rowsDs,
                            columns,
                            columnStretch: true,
                            highlightRowsOnHover: true,
                            stripedRows: true,
                            dataRowHeight: 72,
                            headerRowHeight: 44,
                            editable: true,
                            rootStyle: { width: '100%' }
                        }) }))] }));
        }
    }

    async function loadVoiceLists() {
        store.dispatch(Action.consoleLoadSuccess({ voiceListsLoading: true }));
        const safe = (promise) => promise.catch(() => null);
        try {
            const [twiml, phones, intel] = await Promise.all([
                safe(wizardCall('wizardListTwiMLApps', {})),
                safe(wizardCall('wizardListPhoneNumbers', {})),
                safe(wizardCall('wizardListIntelServices', {}))
            ]);
            const voiceLists = {
                twimlApps: (twiml && twiml.apps) || null,
                phoneNumbers: (phones && phones.phones) || null,
                intelServices: (intel && intel.services) || null
            };
            store.dispatch(Action.consoleLoadSuccess({
                voiceLists,
                voiceListsLoading: false
            }));
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : 'Voice lists load failed';
            store.dispatch(Action.consoleLoadSuccess({
                voiceListsLoading: false,
                voiceError: msg
            }));
        }
    }
    async function saveVoiceField(field, value) {
        store.dispatch(Action.voiceFieldSave({ phase: 'start' }));
        try {
            const payload = { [field]: value };
            const result = await wizardCall('wizardSaveVoice', payload);
            if (result && result.ok === false) {
                const err = result.error || 'Voice save failed';
                store.dispatch(Action.voiceFieldSave({ phase: 'failure', error: err }));
                return;
            }
            store.dispatch(Action.voiceFieldSave({ phase: 'success', field, value }));
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : 'Voice save failed';
            store.dispatch(Action.voiceFieldSave({ phase: 'failure', error: msg }));
        }
    }

    const TWILIO_DOCS = {
        twimlApp: 'https://www.twilio.com/docs/usage/api/applications',
        phoneNumber: 'https://www.twilio.com/docs/phone-numbers/api/incomingphonenumber-resource',
        intelService: 'https://www.twilio.com/docs/voice/intelligence'
    };
    const FIELD_SPECS = [
        {
            field: 'twimlAppSid',
            label: 'TwiML Application',
            helpText: 'The Twilio application that handles outbound call routing. ' +
                'The wizard registers this app\'s VoiceUrl with the CTC Suitelet.',
            docUrl: TWILIO_DOCS.twimlApp
        },
        {
            field: 'phoneNumber',
            label: 'Default outbound caller-ID',
            helpText: 'Number reps see as their outbound caller ID. Specific ' +
                'rep-to-number assignments override this default.',
            docUrl: TWILIO_DOCS.phoneNumber
        },
        {
            field: 'intelServiceSid',
            label: 'Conversational Intelligence',
            helpText: 'Optional. The Voice Intelligence service ID that ' +
                'produces transcripts and AI summaries.',
            docUrl: TWILIO_DOCS.intelService,
            allowEmpty: true
        }
    ];
    const listKeyFor = (field) => {
        switch (field) {
            case 'twimlAppSid': return 'twimlApps';
            case 'phoneNumber': return 'phoneNumbers';
            case 'intelServiceSid': return 'intelServices';
        }
    };
    class VoiceFieldRow extends core.PureComponent {
        handleEdit = () => {
            const { spec } = this.props;
            const state = store.getState();
            const snap = (state.console.snapshot || {});
            const current = snap[spec.field] || '';
            store.dispatch(Action.voiceFieldEdit(spec.field, current));
            loadVoiceLists();
        };
        handleCancel = () => {
            store.dispatch(Action.voiceFieldEdit(null, null));
        };
        handlePendingChange = (args) => {
            const value = (args && args.value) || null;
            const state = store.getState();
            store.dispatch(Action.voiceFieldEdit(state.console.voiceEditing, value));
        };
        handleSave = () => {
            const { spec } = this.props;
            const state = store.getState();
            const pending = state.console.voicePendingValue;
            if (pending !== null && pending !== undefined) {
                saveVoiceField(spec.field, pending);
            }
        };
        render() {
            const { spec } = this.props;
            const state = store.getState();
            const snap = (state.console.snapshot || {});
            const isEditing = state.console.voiceEditing === spec.field;
            const value = snap[spec.field];
            const labelCell = (jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.XXS, children: [jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.STRONG, children: spec.label }) }), spec.docUrl ? (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Link, { content: "Twilio docs \u2197", url: spec.docUrl, target: component__namespace.Link.Target.BLANK }) })) : null] }));
            const helpCell = (jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, size: component__namespace.Text.Size.S, children: spec.helpText }));
            const rightCell = isEditing
                ? this.renderEditControls(spec)
                : this.renderViewControls(spec, value);
            return (jsxRuntime.jsxs(component__namespace.GridPanel, { columns: "1fr 3fr 2fr", rows: "auto", columnGap: component__namespace.GridPanel.GapSize.L, children: [jsxRuntime.jsx(component__namespace.GridPanel.Item, { children: labelCell }), jsxRuntime.jsx(component__namespace.GridPanel.Item, { children: helpCell }), jsxRuntime.jsx(component__namespace.GridPanel.Item, { children: rightCell })] }));
        }
        renderViewControls(spec, value) {
            return (jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.HORIZONTAL, itemGap: component__namespace.StackPanel.GapSize.M, children: [jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: value ? (jsxRuntime.jsx(component__namespace.Text, { children: value })) : (jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, children: "(not configured)" })) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Button, { label: "Change", action: this.handleEdit }) })] }));
        }
        renderEditControls(spec) {
            const state = store.getState();
            const c = state.console;
            const listKey = listKeyFor(spec.field);
            const list = c.voiceLists[listKey];
            const saving = c.voiceSaving;
            const pending = c.voicePendingValue;
            if (list === null || c.voiceListsLoading) {
                return (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: new component__namespace.Loader({
                        label: 'Loading from Twilio…',
                        indeterminate: true
                    }) }));
            }
            if (list.length === 0) {
                return (jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.HORIZONTAL, itemGap: component__namespace.StackPanel.GapSize.M, children: [jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, children: "(no items found in Twilio for this account)" }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Button, { label: "Cancel", action: this.handleCancel }) })] }));
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
            return (jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.HORIZONTAL, itemGap: component__namespace.StackPanel.GapSize.S, children: [jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Dropdown, { dataSource: ds, valueMember: "value", displayMember: "label", selectedValue: pending || (spec.allowEmpty ? null : normalized[0].value), allowEmpty: !!spec.allowEmpty, placeholder: spec.allowEmpty ? '(none)' : 'Select…', onSelectionChanged: this.handlePendingChange }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Button, { label: saving ? 'Saving…' : 'Save', type: component__namespace.Button.Type.PRIMARY, enabled: !saving, action: this.handleSave }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Button, { label: "Cancel", enabled: !saving, action: this.handleCancel }) })] }));
        }
    }
    class VoicePage extends core.PureComponent {
        render() {
            const state = store.getState();
            const c = state.console;
            return (jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.L, children: [jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, children: "Manage TwiML application, default outbound caller-ID number, and optional Conversational Intelligence service. Changes save immediately and apply to the next call placed." }) }), c.voiceError ? (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsxs(component__namespace.Text, { type: component__namespace.Text.Type.STRONG, children: ["\u2715 ", c.voiceError] }) })) : null, FIELD_SPECS.map((spec) => (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(VoiceFieldRow, { spec: spec }) }, spec.field)))] }));
        }
    }

    const TWILIO_CREDS_DOCS = {
        accountSid: 'https://www.twilio.com/docs/iam/api/account',
        apiKeySid: 'https://www.twilio.com/docs/iam/api-keys',
        apiSecret: 'https://www.twilio.com/docs/iam/api-keys'
    };
    const CredentialRow = (props) => {
        const { spec } = props;
        return (jsxRuntime.jsxs(component__namespace.GridPanel, { columns: "1fr 2fr 2fr", rows: "auto", columnGap: component__namespace.GridPanel.GapSize.L, children: [jsxRuntime.jsx(component__namespace.GridPanel.Item, { children: jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.XXS, children: [jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.STRONG, children: spec.label }) }), spec.docUrl ? (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Link, { content: "Twilio docs \u2197", url: spec.docUrl, target: component__namespace.Link.Target.BLANK }) })) : null] }) }), jsxRuntime.jsx(component__namespace.GridPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, size: component__namespace.Text.Size.S, children: spec.help }) }), jsxRuntime.jsx(component__namespace.GridPanel.Item, { children: spec.value ? (jsxRuntime.jsx(component__namespace.Text, { children: spec.value })) : (jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, children: "(not configured)" })) })] }));
    };
    class CredentialsPage extends core.PureComponent {
        handleOpenSecrets = () => {
            try {
                window.open('/app/common/scripting/secrets/settings.nl', '_blank');
            }
            catch (e) { }
        };
        render() {
            const state = store.getState();
            const snap = (state.console.snapshot || {});
            const rows = [
                {
                    label: 'Account SID',
                    value: snap.accountSid || '',
                    help: 'Your Twilio Account SID. Public — safe to display.',
                    docUrl: TWILIO_CREDS_DOCS.accountSid
                },
                {
                    label: 'API Key SID',
                    value: snap.apiKeySid || '',
                    help: 'Identifies which Twilio API Key the wizard uses. ' +
                        'Public — the matching Secret stays in NetSuite\'s ' +
                        'API Secrets vault.',
                    docUrl: TWILIO_CREDS_DOCS.apiKeySid
                },
                {
                    label: 'API Key Secret pointer',
                    value: snap.apiSecretId || '',
                    help: 'NetSuite script-id (custsecret_…) of the API Secret. ' +
                        'The secret value itself never leaves NetSuite\'s vault.',
                    docUrl: TWILIO_CREDS_DOCS.apiSecret
                }
            ];
            return (jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.L, children: [jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Button, { label: "Open NetSuite API Secrets", startIcon: core__namespace.SystemIcon.LOCK, action: this.handleOpenSecrets }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, children: "The Account SID + API Key SID are public identifiers \u2014 they're safe to display here. The actual API Secret value is held opaque by NetSuite's API Secrets vault (Setup > Company > API Secrets) and never travels through the SPA." }) }), rows.map((spec) => (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(CredentialRow, { spec: spec }) }, spec.label))), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.XS, rootStyle: {
                                padding: '12px 16px',
                                border: '1px solid #E2E3E5',
                                borderRadius: '4px',
                                background: '#F7F8F9'
                            }, children: [jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.STRONG, children: "Rotation runbook" }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { size: component__namespace.Text.Size.S, children: "1. Mint a new API Key Secret in the Twilio Console (Account > API Keys & tokens)." }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { size: component__namespace.Text.Size.S, children: "2. Update the secret value in NetSuite (Setup > Company > API Secrets) \u2014 keep the same script id so the wizard pointer above stays valid." }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { size: component__namespace.Text.Size.S, children: "3. Revoke the old Twilio API Key once you've verified call placement works with the new secret." }) })] }) })] }));
        }
    }

    const statusToBadge = (status) => {
        switch (status) {
            case 'pass': return { text: 'Pass', palette: { bg: '#D4EDDA', fg: '#155724', border: '#A3D9AE' } };
            case 'fail': return { text: 'Fail', palette: { bg: '#F8D7DA', fg: '#721C24', border: '#F1B5BB' } };
            case 'warn': return { text: 'Warn', palette: { bg: '#FFF3CD', fg: '#856404', border: '#FFE69C' } };
            case 'info_enabled': return { text: 'Enabled', palette: { bg: '#CCE5FF', fg: '#004085', border: '#9FCDFF' } };
            case 'info_disabled': return { text: 'Disabled', palette: { bg: '#E2E3E5', fg: '#383D41', border: '#C7CACE' } };
            default: return { text: status || '—', palette: { bg: '#E2E3E5', fg: '#383D41', border: '#C7CACE' } };
        }
    };
    const statusIcon = (status) => {
        switch (status) {
            case 'pass': return { icon: core__namespace.SystemIcon.STATUS_SUCCESS_FILLED, color: core__namespace.ImageConstant.Color.SUCCESS };
            case 'fail': return { icon: core__namespace.SystemIcon.STATUS_ERROR_FILLED, color: core__namespace.ImageConstant.Color.DANGER };
            case 'warn': return { icon: core__namespace.SystemIcon.STATUS_WARNING_FILLED, color: core__namespace.ImageConstant.Color.WARNING };
            case 'info_enabled': return { icon: core__namespace.SystemIcon.STATUS_INFO_FILLED, color: core__namespace.ImageConstant.Color.INFO };
            default: return { icon: core__namespace.SystemIcon.STATUS_INFO, color: core__namespace.ImageConstant.Color.NEUTRAL };
        }
    };
    const CheckRowItem = (props) => {
        const { check } = props;
        const status = check.status || 'info_enabled';
        const si = statusIcon(status);
        const sb = statusToBadge(status);
        return (jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.HORIZONTAL, alignment: component__namespace.StackPanel.Alignment.START, itemGap: component__namespace.StackPanel.GapSize.M, children: [jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Image, { image: si.icon, size: component__namespace.Image.Size.M, color: si.color, presentation: true }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.XXS, children: [jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.STRONG, children: check.label || '(unlabeled check)' }) }), check.detail ? (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, size: component__namespace.Text.Size.S, children: check.detail }) })) : null] }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Badge, { content: sb.text, type: component__namespace.Badge.Type.SUBTLE, rootStyle: {
                            backgroundColor: sb.palette.bg,
                            color: sb.palette.fg,
                            border: '1px solid ' + sb.palette.border
                        } }) })] }));
    };
    class HealthPage extends core.PureComponent {
        rerunPreflight = async () => {
            store.dispatch(Action.consoleLoadSuccess({ preflightRefreshing: true }));
            try {
                const payload = await wizardCall('wizardRunPreflight', {});
                const checks = payload && payload.checks;
                store.dispatch(Action.consoleLoadSuccess({
                    preflight: Array.isArray(checks) ? checks : []
                }));
            }
            catch (e) {
                const err = e;
                store.dispatch(Action.actionErrorSet('Preflight failed: ' + (err.message || String(e))));
            }
            finally {
                store.dispatch(Action.consoleLoadSuccess({ preflightRefreshing: false }));
            }
        };
        cancelDeactivateConfirm = () => {
            store.dispatch(Action.deactivateSuccess());
        };
        requestDeactivate = () => {
            store.dispatch(Action.deactivateRequest());
        };
        confirmDeactivate = () => {
            deactivate();
        };
        render() {
            const state = store.getState();
            const c = state.console;
            const preflight = c.preflight;
            const drift = (c.drift || {});
            const snap = (c.snapshot || {});
            const isPaused = snap.active === false;
            const refreshing = !!c.preflightRefreshing;
            const driftRows = [
                { label: 'TwiML VoiceUrl', status: drift.voiceUrl || 'pass', detail: drift.voiceUrl === 'fail' ? 'VoiceUrl does not match the wizard\'s expected Suitelet URL' : '' },
                { label: 'Phone numbers', status: drift.phoneNumbers || 'pass', detail: drift.phoneNumbers === 'fail' ? 'A configured Twilio number is missing from the account' : '' },
                { label: 'Intel Service', status: drift.intelService || 'info_enabled', detail: '' }
            ];
            return (jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.L, children: [jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.S, children: [jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Heading, { level: 3, children: "Preflight" }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Button, { label: refreshing ? 'Re-running…' : 'Re-run', startIcon: core__namespace.SystemIcon.REFRESH, enabled: !refreshing, action: () => { this.rerunPreflight(); } }) }), preflight === null || preflight === undefined ? (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, children: "Click \"Re-run\" to evaluate." }) })) : preflight.length === 0 ? (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, children: "No checks returned." }) })) : (preflight.map((check, idx) => (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(CheckRowItem, { check: check }) }, 'pf-' + (check.id || idx)))))] }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.S, children: [jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Heading, { level: 3, children: "Drift detection" }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, size: component__namespace.Text.Size.S, children: "Compares the saved wizard config against the live Twilio account. Re-runs each time the console mounts." }) }), driftRows.map((row, idx) => (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(CheckRowItem, { check: row }) }, 'drift-' + idx)))] }) }), !isPaused ? (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.S, rootStyle: {
                                border: '1px solid #D33A2C',
                                borderRadius: '8px',
                                backgroundColor: '#FDF4F3',
                                padding: '16px 20px'
                            }, children: [jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Heading, { level: 3, children: "Danger zone" }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, size: component__namespace.Text.Size.S, children: "Deactivate Click-to-Call: reps lose phone-icon access across all roles. In-progress calls finish normally; new calls cannot be placed. Reactivate any time." }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: c.pendingDeactivateConfirm ? (jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.HORIZONTAL, itemGap: component__namespace.StackPanel.GapSize.S, children: [jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Button, { label: "Cancel", action: this.cancelDeactivateConfirm }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Button, { label: "Confirm deactivate", type: component__namespace.Button.Type.DANGER, action: this.confirmDeactivate }) })] })) : (jsxRuntime.jsx(component__namespace.Button, { label: "Deactivate", type: component__namespace.Button.Type.DANGER, action: this.requestDeactivate })) }), c.deactivateError ? (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsxs(component__namespace.Text, { type: component__namespace.Text.Type.STRONG, children: ["\u2715 Deactivate failed: ", c.deactivateError] }) })) : null] }) })) : null, c.actionError ? (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsxs(component__namespace.Text, { type: component__namespace.Text.Type.STRONG, children: ["\u2715 ", c.actionError] }) })) : null] }));
        }
    }

    const NavRail = () => {
        const state = store.getState();
        const assignments = state.console.assignments;
        const assignmentBadge = assignments ? String(assignments.length) : undefined;
        const navItems = [
            { value: 'overview', label: 'Overview', icon: core__namespace.SystemIcon.HOME },
            { value: 'phones', label: 'Phones & reps', icon: core__namespace.SystemIcon.CALL,
                badge: assignmentBadge },
            { value: 'voice', label: 'Voice config', icon: core__namespace.SystemIcon.SETTINGS },
            { value: 'credentials', label: 'Credentials', icon: core__namespace.SystemIcon.LOCK },
            { value: 'health', label: 'Health', icon: core__namespace.SystemIcon.HEART_FILLED },
            { value: 're-run', label: 'Re-run wizard', icon: core__namespace.SystemIcon.REFRESH,
                separatorTop: true,
                action: () => { goToStep(1); } }
        ];
        const selectedVal = state.mode === 'stepper' ? 're-run' : state.selectedSection;
        return (jsxRuntime.jsx(component__namespace.NavigationDrawer, { items: navItems, selectedValue: selectedVal, width: 240, visualStyle: component__namespace.NavigationDrawer.VisualStyle.DARK, onSelectedValueChanged: (args) => {
                const value = args && args.value;
                if (!value)
                    return;
                if (value === 're-run') {
                    goToStep(1);
                    return;
                }
                goToSection(value);
            } }));
    };

    const RailContentShell = (props) => {
        return (jsxRuntime.jsx(component__namespace.ScrollPanel, { orientation: component__namespace.ScrollPanel.Orientation.VERTICAL, children: jsxRuntime.jsx(component__namespace.ContentPanel, { horizontalAlignment: component__namespace.ContentPanel.HorizontalAlignment.STRETCH, outerGap: {
                    start: component__namespace.ContentPanel.GapSize.XXL,
                    end: component__namespace.ContentPanel.GapSize.XXL,
                    vertical: component__namespace.ContentPanel.GapSize.M
                }, children: props.children }) }));
    };

    const PausedBanner = (props) => {
        const handleReactivate = props.onReactivate || (() => { reactivate(); });
        const contentRow = (jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.HORIZONTAL, itemGap: component__namespace.StackPanel.GapSize.L, alignment: component__namespace.StackPanel.Alignment.CENTER, children: [jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { children: "Reps cannot place calls until you reactivate. All config is preserved." }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Button, { label: "Reactivate", type: component__namespace.Button.Type.PRIMARY, action: handleReactivate }) })] }));
        return (jsxRuntime.jsx(component__namespace.BannerMessage, { title: "Click-to-Call is paused", content: contentRow, type: component__namespace.BannerMessage.Type.WARNING, showCloseButton: false }));
    };

    const subtitleFor = (section) => {
        switch (section) {
            case 'overview': return 'Overview';
            case 'phones': return 'Phones & reps';
            case 'voice': return 'Voice config';
            case 'credentials': return 'Credentials';
            case 'health': return 'Health';
        }
    };
    const ConsoleShell = (props) => {
        const state = store.getState();
        const snap = state.console.snapshot;
        const isPaused = snap?.active === false;
        const subtitle = subtitleFor(state.selectedSection);
        const contentColumn = (jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.L, children: [jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.ApplicationHeader, { title: "Click-to-Call Admin Console", subtitle: subtitle }) }), isPaused ? (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(PausedBanner, {}) })) : null, jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(RailContentShell, { children: props.children }) })] }));
        return (jsxRuntime.jsxs(component__namespace.GridPanel, { columns: "auto 1fr", rows: "100%", columnGap: component__namespace.GridPanel.GapSize.NONE, children: [jsxRuntime.jsx(component__namespace.GridPanel.Item, { children: jsxRuntime.jsx(NavRail, {}) }), jsxRuntime.jsx(component__namespace.GridPanel.Item, { children: contentColumn })] }));
    };

    const STEPS = [
        { num: 1, label: 'Prerequisites', sub: 'Setup checks' },
        { num: 2, label: 'Connect Twilio', sub: 'SIDs & secrets' },
        { num: 3, label: 'Voice config', sub: 'TwiML & caller ID' },
        { num: 4, label: 'Phone numbers', sub: 'Claim & assign' },
        { num: 5, label: 'Test & activate', sub: 'Review & go live' }
    ];
    const StepPill = (props) => {
        const { spec, currentStep } = props;
        const isCurrent = spec.num === currentStep;
        const isDone = spec.num < currentStep;
        return (jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, alignment: component__namespace.StackPanel.Alignment.CENTER, itemGap: component__namespace.StackPanel.GapSize.XS, children: [jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Badge, { content: isDone ? '✓' : String(spec.num), type: isCurrent || isDone
                            ? component__namespace.Badge.Type.SOLID
                            : component__namespace.Badge.Type.SUBTLE, size: component__namespace.Badge.Size.DEFAULT }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: isCurrent ? component__namespace.Text.Type.STRONG : component__namespace.Text.Type.DEFAULT, children: spec.label }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, size: component__namespace.Text.Size.S, children: spec.sub }) })] }));
    };
    const Stepper = (props) => {
        return (jsxRuntime.jsx(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.HORIZONTAL, justification: component__namespace.StackPanel.Justification.SPACE_BETWEEN, itemGap: component__namespace.StackPanel.GapSize.M, children: STEPS.map((spec) => (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(StepPill, { spec: spec, currentStep: props.currentStep }) }, 'step-' + spec.num))) }));
    };

    const StepperShell = (props) => {
        const state = store.getState();
        const step = state.currentStep;
        const stepLabel = STEPS[step - 1]?.label || '';
        const subtitle = 'Step ' + step + ' of ' + STEPS.length + ' — ' + stepLabel;
        const contentColumn = (jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.L, children: [jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.ApplicationHeader, { title: "Click-to-Call Setup Wizard", subtitle: subtitle }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.ContentPanel, { horizontalAlignment: component__namespace.ContentPanel.HorizontalAlignment.STRETCH, outerGap: component__namespace.ContentPanel.GapSize.M, children: jsxRuntime.jsx(Stepper, { currentStep: step }) }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(RailContentShell, { children: props.children }) })] }));
        if (state.railVisible) {
            return (jsxRuntime.jsxs(component__namespace.GridPanel, { columns: "auto 1fr", rows: "100%", columnGap: component__namespace.GridPanel.GapSize.NONE, children: [jsxRuntime.jsx(component__namespace.GridPanel.Item, { children: jsxRuntime.jsx(NavRail, {}) }), jsxRuntime.jsx(component__namespace.GridPanel.Item, { children: contentColumn })] }));
        }
        return contentColumn;
    };

    class App extends core.PureComponent {
        storeUnsubscribe = null;
        constructor(props, context) {
            super(props, context);
            this.state = { tick: 0 };
        }
        forceRerender = () => {
            this.setState({ tick: this.state.tick + 1 });
        };
        componentDidMount() {
            this.storeUnsubscribe = store.subscribe(this.forceRerender);
            this.initializeApp();
        }
        componentWillUnmount() {
            if (this.storeUnsubscribe) {
                this.storeUnsubscribe();
                this.storeUnsubscribe = null;
            }
        }
        async initializeApp() {
            store.dispatch(Action.setMountRouting(true));
            try {
                const payload = await wizardCall('wizardSnapshot', {});
                const snap = (payload && payload.snapshot) || {};
                store.dispatch(Action.consoleLoadSuccess({ snapshot: snap }));
                const target = determineLandingStep(snap);
                if (target === 'console') {
                    goToConsole();
                }
                else {
                    goToStep(target);
                }
            }
            catch (e) {
                goToStep(1);
            }
            finally {
                store.dispatch(Action.setMountRouting(false));
            }
        }
        renderStep(stepNum) {
            switch (stepNum) {
                case 1: return jsxRuntime.jsx(Step1, {});
                case 2: return jsxRuntime.jsx(Step2, {});
                case 3: return jsxRuntime.jsx(Step3, {});
                case 4: return jsxRuntime.jsx(Step4, {});
                case 5: return jsxRuntime.jsx(Step5, {});
                default: return jsxRuntime.jsx(Step1, {});
            }
        }
        renderSection(section) {
            switch (section) {
                case 'overview': return jsxRuntime.jsx(OverviewPage, {});
                case 'phones': return jsxRuntime.jsx(PhonesPage, {});
                case 'voice': return jsxRuntime.jsx(VoicePage, {});
                case 'credentials': return jsxRuntime.jsx(CredentialsPage, {});
                case 'health': return jsxRuntime.jsx(HealthPage, {});
                default: return jsxRuntime.jsx(OverviewPage, {});
            }
        }
        render() {
            const state = store.getState();
            if (state.mountRouting) {
                return (jsxRuntime.jsx(component__namespace.ContentPanel, { horizontalAlignment: component__namespace.ContentPanel.HorizontalAlignment.CENTER, outerGap: component__namespace.ContentPanel.GapSize.XL, children: new component__namespace.Loader({
                        label: 'Loading…',
                        indeterminate: true
                    }) }));
            }
            if (state.mode === 'console') {
                return (jsxRuntime.jsx(ConsoleShell, { children: this.renderSection(state.selectedSection) }));
            }
            return (jsxRuntime.jsx(StepperShell, { children: this.renderStep(state.currentStep) }));
        }
    }

    const run = (context) => {
        try {
            if (typeof context.setLayout === 'function') {
                context.setLayout('application');
            }
        }
        catch (e) {
            console.warn("[CTC Setup Wizard] setLayout('application') failed; " +
                "rail may not fill viewport:", e);
        }
        context.setContent(jsxRuntime.jsx(App, {}));
    };

    exports.run = run;

}));
