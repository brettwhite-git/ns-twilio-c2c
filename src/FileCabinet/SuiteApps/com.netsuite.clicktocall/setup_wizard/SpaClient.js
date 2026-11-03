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
        SET_WIZARD_SAVING: Symbol('setWizardSaving'),
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
        CONSOLE_PATCH: Symbol('consolePatch'),
        PHONES_LOAD_START: Symbol('phonesLoadStart'),
        PHONES_LOAD_SUCCESS: Symbol('phonesLoadSuccess'),
        PHONES_LOAD_FAILURE: Symbol('phonesLoadFailure'),
        PHONES_DRAFT_SET: Symbol('phonesDraftSet'),
        PHONES_EDIT_ROW: Symbol('phonesEditRow'),
        PHONES_ROW_SAVE: Symbol('phonesRowSave'),
        INBOUND_LOAD_START: Symbol('inboundLoadStart'),
        INBOUND_LOAD_SUCCESS: Symbol('inboundLoadSuccess'),
        INBOUND_LOAD_FAILURE: Symbol('inboundLoadFailure'),
        INBOUND_FIELD_CHANGE: Symbol('inboundFieldChange'),
        INBOUND_SAVE: Symbol('inboundSave'),
        INBOUND_PUBLISH: Symbol('inboundPublish'),
        INBOUND_ROUTING_UPDATE: Symbol('inboundRoutingUpdate'),
        INBOUND_ROUTES_SET: Symbol('inboundRoutesSet'),
        PRESENCE_LOAD_START: Symbol('presenceLoadStart'),
        PRESENCE_LOAD_SUCCESS: Symbol('presenceLoadSuccess'),
        PRESENCE_LOAD_FAILURE: Symbol('presenceLoadFailure'),
        OUTBOUND_LOAD_START: Symbol('outboundLoadStart'),
        OUTBOUND_LOAD_SUCCESS: Symbol('outboundLoadSuccess'),
        OUTBOUND_LOAD_FAILURE: Symbol('outboundLoadFailure'),
        OUTBOUND_FIELD_CHANGE: Symbol('outboundFieldChange'),
        OUTBOUND_REQUEST: Symbol('outboundRequest'),
        OUTBOUND_CONFIRM_UNPUBLISH: Symbol('outboundConfirmUnpublish'),
        VOICE_FIELD_EDIT: Symbol('voiceFieldEdit'),
        VOICE_FIELD_SAVE: Symbol('voiceFieldSave'),
        DEACTIVATE_REQUEST: Symbol('deactivateRequest'),
        DEACTIVATE_START: Symbol('deactivateStart'),
        DEACTIVATE_SUCCESS: Symbol('deactivateSuccess'),
        DEACTIVATE_FAILURE: Symbol('deactivateFailure'),
        REACTIVATE_REQUEST: Symbol('reactivateRequest'),
        REACTIVATE_SUCCESS: Symbol('reactivateSuccess'),
        REACTIVATE_FAILURE: Symbol('reactivateFailure'),
        CREDENTIALS_UPDATE: Symbol('credentialsUpdate'),
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
        setWizardSaving(saving) {
            return { type: ActionType.SET_WIZARD_SAVING, payload: saving };
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
        consolePatch(patch) {
            return { type: ActionType.CONSOLE_PATCH, payload: patch };
        },
        phonesLoadStart() {
            return { type: ActionType.PHONES_LOAD_START, payload: null };
        },
        phonesLoadSuccess(slice) {
            return { type: ActionType.PHONES_LOAD_SUCCESS, payload: slice };
        },
        phonesLoadFailure(error) {
            return { type: ActionType.PHONES_LOAD_FAILURE, payload: { error } };
        },
        phonesDraftSet(phoneSid, draft) {
            return { type: ActionType.PHONES_DRAFT_SET, payload: { phoneSid, draft } };
        },
        phonesEditRow(phoneSid) {
            return { type: ActionType.PHONES_EDIT_ROW, payload: { phoneSid } };
        },
        phonesRowSave(payload) {
            return { type: ActionType.PHONES_ROW_SAVE, payload };
        },
        inboundLoadStart() {
            return { type: ActionType.INBOUND_LOAD_START, payload: null };
        },
        inboundLoadSuccess(payload) {
            return { type: ActionType.INBOUND_LOAD_SUCCESS, payload };
        },
        inboundLoadFailure(error) {
            return { type: ActionType.INBOUND_LOAD_FAILURE, payload: { error } };
        },
        inboundFieldChange(changes) {
            return { type: ActionType.INBOUND_FIELD_CHANGE, payload: changes };
        },
        inboundSave(payload) {
            return { type: ActionType.INBOUND_SAVE, payload };
        },
        inboundPublish(payload) {
            return { type: ActionType.INBOUND_PUBLISH, payload };
        },
        inboundRoutingUpdate(publish) {
            return { type: ActionType.INBOUND_ROUTING_UPDATE, payload: publish };
        },
        inboundRoutesSet(payload) {
            return { type: ActionType.INBOUND_ROUTES_SET, payload };
        },
        presenceLoadStart() {
            return { type: ActionType.PRESENCE_LOAD_START, payload: null };
        },
        presenceLoadSuccess(items, clockSkewMs) {
            return { type: ActionType.PRESENCE_LOAD_SUCCESS, payload: { items, clockSkewMs } };
        },
        presenceLoadFailure(error) {
            return { type: ActionType.PRESENCE_LOAD_FAILURE, payload: { error } };
        },
        outboundLoadStart() {
            return { type: ActionType.OUTBOUND_LOAD_START, payload: null };
        },
        outboundLoadSuccess(snapshot) {
            return { type: ActionType.OUTBOUND_LOAD_SUCCESS, payload: snapshot };
        },
        outboundLoadFailure(error) {
            return { type: ActionType.OUTBOUND_LOAD_FAILURE, payload: { error } };
        },
        outboundFieldChange(changes) {
            return { type: ActionType.OUTBOUND_FIELD_CHANGE, payload: changes };
        },
        outboundRequest(payload) {
            return { type: ActionType.OUTBOUND_REQUEST, payload };
        },
        outboundConfirmUnpublish(open) {
            return { type: ActionType.OUTBOUND_CONFIRM_UNPUBLISH, payload: open };
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
        deactivateStart() {
            return { type: ActionType.DEACTIVATE_START, payload: null };
        },
        deactivateSuccess() {
            return { type: ActionType.DEACTIVATE_SUCCESS, payload: null };
        },
        deactivateFailure(error) {
            return { type: ActionType.DEACTIVATE_FAILURE, payload: { error } };
        },
        reactivateRequest(source) {
            return { type: ActionType.REACTIVATE_REQUEST, payload: { source } };
        },
        reactivateSuccess() {
            return { type: ActionType.REACTIVATE_SUCCESS, payload: null };
        },
        reactivateFailure(error, failedChecks = []) {
            return { type: ActionType.REACTIVATE_FAILURE, payload: { error, failedChecks } };
        },
        credentialsUpdate(patch) {
            return { type: ActionType.CREDENTIALS_UPDATE, payload: patch };
        },
        actionErrorSet(error) {
            return { type: ActionType.ACTION_ERROR_SET, payload: error };
        }
    };

    const applyPublish = (inbound, publish) => {
        inbound.lastPublish = publish;
        if ((publish.ok || publish.partial) && publish.flowSid)
            inbound.flowSid = publish.flowSid;
        if (publish.ok && publish.publishedAt)
            inbound.publishedAt = publish.publishedAt;
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
            [ActionType.SET_WIZARD_SAVING, (s) => core.ImmutableUpdate.of(s, (d) => {
                    d.wizardSaving = a.payload;
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
            [ActionType.CONSOLE_PATCH, (s) => core.ImmutableUpdate.of(s, (d) => {
                    Object.assign(d.console, a.payload);
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
                    if (p.listError !== undefined)
                        d.console.phonesListError = p.listError;
                    if (p.hasMore !== undefined)
                        d.console.phonesHasMore = p.hasMore;
                    if (p.error !== undefined)
                        d.console.phonesError = p.error;
                    d.console.phonesLoading = false;
                })],
            [ActionType.PHONES_LOAD_FAILURE, (s) => core.ImmutableUpdate.of(s, (d) => {
                    d.console.phonesLoading = false;
                    d.console.phonesError = a.payload.error;
                })],
            [ActionType.PHONES_DRAFT_SET, (s) => core.ImmutableUpdate.of(s, (d) => {
                    const p = a.payload;
                    const drafts = { ...d.console.phonesDrafts };
                    if (p.draft)
                        drafts[p.phoneSid] = p.draft;
                    else
                        delete drafts[p.phoneSid];
                    d.console.phonesDrafts = drafts;
                    if (!p.draft) {
                        const errs = { ...d.console.phonesRowErrors };
                        delete errs[p.phoneSid];
                        d.console.phonesRowErrors = errs;
                    }
                })],
            [ActionType.PHONES_EDIT_ROW, (s) => core.ImmutableUpdate.of(s, (d) => {
                    const p = a.payload;
                    d.console.phonesEditingSid = p.phoneSid;
                    d.console.phonesDrafts = {};
                    d.console.phonesRowErrors = {};
                })],
            [ActionType.PHONES_ROW_SAVE, (s) => core.ImmutableUpdate.of(s, (d) => {
                    const p = a.payload;
                    const errs = { ...d.console.phonesRowErrors };
                    delete errs[p.phoneSid];
                    if (p.phase === 'start') {
                        d.console.phonesSavingSid = p.phoneSid;
                        d.console.phonesRoutingErrors = [];
                    }
                    else if (p.phase === 'success') {
                        d.console.phonesSavingSid = null;
                        if (d.console.phonesEditingSid === p.phoneSid && !p.error) {
                            d.console.phonesEditingSid = null;
                        }
                        const drafts = { ...d.console.phonesDrafts };
                        delete drafts[p.phoneSid];
                        d.console.phonesDrafts = drafts;
                        if (p.error)
                            errs[p.phoneSid] = p.error;
                    }
                    else {
                        d.console.phonesSavingSid = null;
                        errs[p.phoneSid] = p.error || 'Save failed';
                    }
                    if (p.routingErrors !== undefined) {
                        d.console.phonesRoutingErrors = p.routingErrors;
                    }
                    d.console.phonesRowErrors = errs;
                })],
            [ActionType.INBOUND_LOAD_START, (s) => core.ImmutableUpdate.of(s, (d) => {
                    d.inbound.loading = true;
                    d.inbound.loadError = null;
                })],
            [ActionType.INBOUND_LOAD_SUCCESS, (s) => core.ImmutableUpdate.of(s, (d) => {
                    const p = a.payload;
                    d.inbound.loading = false;
                    d.inbound.loaded = true;
                    d.inbound.loadError = null;
                    d.inbound.inboundEnabled = p.inboundEnabled;
                    d.inbound.ringSeconds = p.ringSeconds;
                    d.inbound.noAnswerMessage = p.noAnswerMessage;
                    d.inbound.recordInbound = p.recordInbound;
                    d.inbound.recordingNoticeOn = p.recordingNoticeOn;
                    d.inbound.recordingNotice = p.recordingNotice;
                    d.inbound.voicemailOn = p.voicemailOn;
                    d.inbound.voicemailMaxSeconds = p.voicemailMaxSeconds;
                    d.inbound.fallbackOwnerId = p.fallbackOwnerId;
                    d.inbound.employees = p.employees;
                    d.inbound.flowSid = p.flowSid;
                    d.inbound.publishedAt = p.publishedAt;
                    d.inbound.routes = p.routes;
                })],
            [ActionType.INBOUND_LOAD_FAILURE, (s) => core.ImmutableUpdate.of(s, (d) => {
                    const p = a.payload;
                    d.inbound.loading = false;
                    d.inbound.loadError = p.error;
                })],
            [ActionType.INBOUND_FIELD_CHANGE, (s) => core.ImmutableUpdate.of(s, (d) => {
                    Object.assign(d.inbound, a.payload);
                })],
            [ActionType.INBOUND_SAVE, (s) => core.ImmutableUpdate.of(s, (d) => {
                    const p = a.payload;
                    if (p.phase === 'start') {
                        d.inbound.saving = true;
                        d.inbound.saveError = null;
                    }
                    else if (p.phase === 'success') {
                        d.inbound.saving = false;
                        d.inbound.saveError = null;
                        if (p.settings)
                            Object.assign(d.inbound, p.settings);
                        if (p.publish)
                            applyPublish(d.inbound, p.publish);
                    }
                    else {
                        d.inbound.saving = false;
                        d.inbound.saveError = p.error ?? 'Save failed';
                    }
                })],
            [ActionType.INBOUND_PUBLISH, (s) => core.ImmutableUpdate.of(s, (d) => {
                    const p = a.payload;
                    if (p.phase === 'start') {
                        d.inbound.publishing = true;
                        d.inbound.saveError = null;
                    }
                    else if (p.phase === 'success') {
                        d.inbound.publishing = false;
                        if (p.publish)
                            applyPublish(d.inbound, p.publish);
                    }
                    else {
                        d.inbound.publishing = false;
                        d.inbound.saveError = p.error ?? 'Publish failed';
                    }
                })],
            [ActionType.INBOUND_ROUTING_UPDATE, (s) => core.ImmutableUpdate.of(s, (d) => {
                    applyPublish(d.inbound, a.payload);
                })],
            [ActionType.INBOUND_ROUTES_SET, (s) => core.ImmutableUpdate.of(s, (d) => {
                    const p = a.payload;
                    d.inbound.routes = p.routes;
                    if (p.flowSid !== undefined)
                        d.inbound.flowSid = p.flowSid;
                    if (p.publishedAt !== undefined)
                        d.inbound.publishedAt = p.publishedAt;
                })],
            [ActionType.PRESENCE_LOAD_START, (s) => core.ImmutableUpdate.of(s, (d) => {
                    d.presence.loading = true;
                    d.presence.error = null;
                })],
            [ActionType.PRESENCE_LOAD_SUCCESS, (s) => core.ImmutableUpdate.of(s, (d) => {
                    const p = a.payload;
                    d.presence.loading = false;
                    d.presence.loaded = true;
                    d.presence.error = null;
                    d.presence.items = p.items;
                    d.presence.clockSkewMs = p.clockSkewMs;
                })],
            [ActionType.PRESENCE_LOAD_FAILURE, (s) => core.ImmutableUpdate.of(s, (d) => {
                    d.presence.loading = false;
                    d.presence.error = a.payload.error;
                })],
            [ActionType.OUTBOUND_LOAD_START, (s) => core.ImmutableUpdate.of(s, (d) => {
                    d.outbound.loading = true;
                    d.outbound.loadError = null;
                })],
            [ActionType.OUTBOUND_LOAD_SUCCESS, (s) => core.ImmutableUpdate.of(s, (d) => {
                    Object.assign(d.outbound, a.payload);
                    d.outbound.loading = false;
                    d.outbound.loaded = true;
                    d.outbound.loadError = null;
                })],
            [ActionType.OUTBOUND_LOAD_FAILURE, (s) => core.ImmutableUpdate.of(s, (d) => {
                    d.outbound.loading = false;
                    d.outbound.loadError = a.payload.error;
                })],
            [ActionType.OUTBOUND_FIELD_CHANGE, (s) => core.ImmutableUpdate.of(s, (d) => {
                    Object.assign(d.outbound, a.payload);
                })],
            [ActionType.OUTBOUND_REQUEST, (s) => core.ImmutableUpdate.of(s, (d) => {
                    const p = a.payload;
                    const busy = p.phase === 'start';
                    if (p.op === 'save')
                        d.outbound.saving = busy;
                    else if (p.op === 'publish')
                        d.outbound.publishing = busy;
                    else
                        d.outbound.unpublishing = busy;
                    if (busy) {
                        d.outbound.error = null;
                        d.outbound.confirmUnpublish = false;
                        if (p.op === 'save')
                            d.outbound.steps = null;
                        return;
                    }
                    if (p.snapshot)
                        Object.assign(d.outbound, p.snapshot);
                    if (p.pending !== undefined)
                        d.outbound.pending = p.pending;
                    if (p.steps !== undefined)
                        d.outbound.steps = p.steps;
                    d.outbound.error = p.error ?? null;
                })],
            [ActionType.OUTBOUND_CONFIRM_UNPUBLISH, (s) => core.ImmutableUpdate.of(s, (d) => {
                    d.outbound.confirmUnpublish = a.payload;
                })],
            [ActionType.VOICE_FIELD_EDIT, (s) => core.ImmutableUpdate.of(s, (d) => {
                    const p = a.payload;
                    if (p.field !== d.console.voiceEditing)
                        d.console.voiceError = null;
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
                        if (p.field && p.value !== undefined) {
                            const snap = (d.console.snapshot || {});
                            snap[p.field] = p.value;
                            d.console.snapshot = snap;
                        }
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
            [ActionType.DEACTIVATE_START, (s) => core.ImmutableUpdate.of(s, (d) => {
                    d.console.deactivating = true;
                    d.console.deactivateError = null;
                })],
            [ActionType.DEACTIVATE_SUCCESS, (s) => core.ImmutableUpdate.of(s, (d) => {
                    d.console.pendingDeactivateConfirm = false;
                    d.console.deactivating = false;
                    d.console.deactivateError = null;
                })],
            [ActionType.DEACTIVATE_FAILURE, (s) => core.ImmutableUpdate.of(s, (d) => {
                    const p = a.payload;
                    d.console.pendingDeactivateConfirm = false;
                    d.console.deactivating = false;
                    d.console.deactivateError = p.error;
                })],
            [ActionType.REACTIVATE_REQUEST, (s) => core.ImmutableUpdate.of(s, (d) => {
                    const p = a.payload;
                    d.console.reactivating = true;
                    d.console.reactivateSource = p.source;
                    d.console.reactivateError = null;
                    d.console.reactivateFailedChecks = [];
                })],
            [ActionType.REACTIVATE_SUCCESS, (s) => core.ImmutableUpdate.of(s, (d) => {
                    d.console.reactivating = false;
                    d.console.reactivateError = null;
                    d.console.reactivateFailedChecks = [];
                })],
            [ActionType.REACTIVATE_FAILURE, (s) => core.ImmutableUpdate.of(s, (d) => {
                    const p = a.payload;
                    d.console.reactivating = false;
                    d.console.reactivateError = p.error;
                    d.console.reactivateFailedChecks = p.failedChecks || [];
                })],
            [ActionType.CREDENTIALS_UPDATE, (s) => core.ImmutableUpdate.of(s, (d) => {
                    Object.assign(d.credentials, a.payload);
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
        wizardSaving: false,
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
            activating: false,
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
            drift: null,
            loading: false,
            phonesEmployees: null,
            phonesNumbers: null,
            phonesByPhone: null,
            phonesLoading: false,
            phonesListError: null,
            phonesHasMore: false,
            phonesEditingSid: null,
            phonesDrafts: {},
            phonesSavingSid: null,
            phonesRowErrors: {},
            phonesError: null,
            phonesRoutingErrors: [],
            voiceEditing: null,
            voicePendingValue: null,
            voiceLists: {
                twimlApps: null,
                phoneNumbers: null,
                intelServices: null
            },
            voiceListsLoading: false,
            voiceListErrors: {},
            voiceSaving: false,
            voiceError: null,
            activeModal: null,
            pendingDeactivateConfirm: false,
            deactivating: false,
            deactivateError: null,
            reactivating: false,
            reactivateSource: 'banner',
            reactivateError: null,
            reactivateFailedChecks: [],
            preflightRefreshing: false,
            preflightError: null,
            actionError: null
        },
        inbound: {
            loaded: false,
            loading: false,
            loadError: null,
            inboundEnabled: false,
            ringSeconds: 20,
            noAnswerMessage: '',
            recordInbound: true,
            recordingNoticeOn: false,
            recordingNotice: '',
            voicemailOn: true,
            voicemailMaxSeconds: 120,
            fallbackOwnerId: '',
            flowSid: '',
            publishedAt: '',
            routes: [],
            employees: [],
            saving: false,
            saveError: null,
            publishing: false,
            lastPublish: null
        },
        presence: {
            loaded: false,
            loading: false,
            error: null,
            items: [],
            clockSkewMs: 0
        },
        outbound: {
            loaded: false,
            loading: false,
            loadError: null,
            noticeOn: false,
            noticeText: '',
            noticeVersion: 0,
            defaultText: '',
            maxLength: 300,
            appSid: '',
            functionUrl: '',
            prevVoiceUrl: '',
            publishedAt: '',
            publishedCodeVersion: '',
            codeVersion: '',
            needsRepublish: false,
            published: false,
            pending: false,
            voiceUrlMatches: null,
            driftVoiceUrl: 'unknown',
            publishedNoticeVersion: 0,
            changesPending: false,
            functionExists: null,
            functionMessage: '',
            saving: false,
            publishing: false,
            unpublishing: false,
            confirmUnpublish: false,
            error: null,
            steps: null
        },
        credentials: {
            editing: false,
            apiKeySid: '',
            apiSecretId: '',
            saving: false,
            error: null,
            failedChecks: [],
            saved: false
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

    const errorOf = (result, fallback) => {
        const r = (result || {});
        return r.errorMessage || r.message || r.error || fallback;
    };
    const thrownText$1 = (e, fallback) => e instanceof Error && e.message ? 'Network: ' + e.message : fallback;
    async function loadConsole() {
        store.dispatch(Action.consoleLoadStart());
        store.dispatch(Action.consolePatch({ preflightError: null }));
        const snapshotTask = wizardCall('wizardSnapshot', {})
            .then((payload) => {
            const snap = payload && payload.snapshot;
            if (snap)
                store.dispatch(Action.consolePatch({ snapshot: snap }));
        })
            .catch(() => { });
        const assignmentsTask = wizardCall('wizardLoadAssignments', {})
            .then((payload) => {
            const items = payload && payload.items;
            if (Array.isArray(items))
                store.dispatch(Action.consolePatch({ assignments: items }));
        })
            .catch(() => { });
        const preflightTask = wizardCall('wizardRunPreflight', {})
            .then((payload) => {
            const checks = payload && payload.checks;
            if (Array.isArray(checks)) {
                store.dispatch(Action.consolePatch({ preflight: checks }));
            }
            else {
                store.dispatch(Action.consolePatch({
                    preflightError: errorOf(payload, 'Preflight did not return any checks')
                }));
            }
        })
            .catch((e) => {
            store.dispatch(Action.consolePatch({
                preflightError: thrownText$1(e, 'Preflight did not run')
            }));
        });
        await Promise.all([snapshotTask, assignmentsTask, preflightTask]);
        store.dispatch(Action.consoleLoadSuccess({}));
    }
    const setActiveFlag = (active) => {
        const snap = store.getState().console.snapshot;
        store.dispatch(Action.consolePatch({ snapshot: { ...(snap || {}), active } }));
    };
    async function deactivate() {
        if (store.getState().console.deactivating)
            return;
        store.dispatch(Action.deactivateStart());
        try {
            const result = await wizardCall('wizardActivate', { deactivate: true });
            if (!result || result.ok === false) {
                store.dispatch(Action.deactivateFailure(errorOf(result, 'Deactivate failed')));
                return;
            }
            setActiveFlag(false);
            store.dispatch(Action.deactivateSuccess());
            await loadConsole();
        }
        catch (e) {
            store.dispatch(Action.deactivateFailure(thrownText$1(e, 'Deactivate failed')));
        }
    }
    async function reactivate(source = 'banner') {
        if (store.getState().console.reactivating)
            return;
        store.dispatch(Action.reactivateRequest(source));
        try {
            const result = await wizardCall('wizardActivate', {});
            if (!result || result.ok === false) {
                const failed = (result && result.failedChecks) || [];
                store.dispatch(Action.reactivateFailure(errorOf(result, 'Reactivate failed'), Array.isArray(failed) ? failed : []));
                return;
            }
            setActiveFlag(true);
            store.dispatch(Action.reactivateSuccess());
            await loadConsole();
        }
        catch (e) {
            store.dispatch(Action.reactivateFailure(thrownText$1(e, 'Reactivate failed')));
        }
    }

    function groupByPhone(phoneNumbers, assignments) {
        const map = {};
        for (const pn of phoneNumbers) {
            if (!pn.sid)
                continue;
            map[pn.sid] = {
                phoneSid: pn.sid,
                phoneNumber: pn.phoneNumber || '',
                friendlyName: pn.friendlyName || '',
                employeeIds: [],
                label: '',
                primaryEmployeeId: null
            };
        }
        for (const a of assignments) {
            if (!a.phoneSid)
                continue;
            if (!map[a.phoneSid]) {
                map[a.phoneSid] = {
                    phoneSid: a.phoneSid,
                    phoneNumber: '',
                    friendlyName: '',
                    employeeIds: [],
                    label: a.label || '',
                    primaryEmployeeId: null
                };
            }
            const empId = Number(a.employeeId);
            map[a.phoneSid].employeeIds.push(empId);
            if (a.label && !map[a.phoneSid].label)
                map[a.phoneSid].label = a.label;
            if (a.isPrimary)
                map[a.phoneSid].primaryEmployeeId = empId;
        }
        return Object.values(map);
    }
    const listError = (p) => p && (p.error || p.errorMessage) ? String(p.errorMessage || p.error) : null;
    const thrownText = (e, fallback) => e instanceof Error && e.message ? 'Network: ' + e.message : fallback;
    async function loadPhonesData() {
        store.dispatch(Action.phonesLoadStart());
        try {
            const [phonesPayload, employeesPayload, assignmentsPayload] = await Promise.all([
                wizardCall('wizardListPhoneNumbers', {}),
                wizardCall('wizardListEmployees', {}),
                wizardCall('wizardLoadAssignments', {})
            ]);
            const phones = phonesPayload;
            const emps = employeesPayload;
            const asg = assignmentsPayload;
            const numbers = (phones && phones.items) || [];
            const employees = (emps && emps.items) || [];
            const assignmentRows = (asg && asg.items) || [];
            const byPhone = groupByPhone(numbers, assignmentRows);
            const otherErrors = [
                listError(emps) ? 'Employees: ' + listError(emps) : '',
                listError(asg) ? 'Assignments: ' + listError(asg) : ''
            ].filter(Boolean).join(' · ');
            store.dispatch(Action.phonesLoadSuccess({
                numbers,
                employees,
                byPhone,
                listError: listError(phones),
                hasMore: !!(phones && phones.hasMore),
                error: otherErrors || null
            }));
            if (!listError(asg)) {
                store.dispatch(Action.consolePatch({ assignments: assignmentRows }));
            }
        }
        catch (e) {
            store.dispatch(Action.phonesLoadFailure(thrownText(e, 'Phones load failed')));
        }
    }
    function savedRow(phoneSid) {
        const rows = (store.getState().console.phonesByPhone || []);
        return rows.find((r) => r.phoneSid === phoneSid) || null;
    }
    function effectivePrimary(employeeIds, primary) {
        if (primary !== null && employeeIds.indexOf(primary) >= 0)
            return primary;
        return employeeIds.length > 0 ? employeeIds[0] : null;
    }
    function rowValues(row, drafts) {
        const draft = drafts[row.phoneSid];
        const employeeIds = draft ? draft.employeeIds : row.employeeIds;
        const primary = draft ? draft.primaryEmployeeId : row.primaryEmployeeId;
        return { employeeIds, primaryEmployeeId: effectivePrimary(employeeIds, primary) };
    }
    const sameIds = (a, b) => a.length === b.length && a.every((v) => b.indexOf(v) >= 0);
    function editPhonesRow(phoneSid, changes) {
        const state = store.getState();
        if (state.console.phonesSavingSid === phoneSid)
            return;
        if (state.console.phonesEditingSid !== phoneSid)
            return;
        const saved = savedRow(phoneSid);
        if (!saved)
            return;
        const current = rowValues(saved, state.console.phonesDrafts);
        const picked = changes.employeeIds !== undefined ? changes.employeeIds : current.employeeIds;
        const employeeIds = sameIds(picked, current.employeeIds) ? current.employeeIds : picked;
        const requested = changes.primaryEmployeeId !== undefined
            ? changes.primaryEmployeeId : current.primaryEmployeeId;
        const next = {
            employeeIds,
            primaryEmployeeId: effectivePrimary(employeeIds, requested)
        };
        if (sameIds(next.employeeIds, current.employeeIds) &&
            next.primaryEmployeeId === current.primaryEmployeeId)
            return;
        const savedValues = rowValues(saved, {});
        const unchanged = sameIds(next.employeeIds, savedValues.employeeIds) &&
            next.primaryEmployeeId === savedValues.primaryEmployeeId;
        store.dispatch(Action.phonesDraftSet(phoneSid, unchanged ? null : next));
    }
    function openPhonesEditor(phoneSid) {
        const c = store.getState().console;
        if (c.phonesSavingSid !== null || c.phonesEditingSid === phoneSid)
            return;
        store.dispatch(Action.phonesEditRow(phoneSid));
    }
    function cancelPhonesRow(phoneSid) {
        if (store.getState().console.phonesSavingSid === phoneSid)
            return;
        store.dispatch(Action.phonesEditRow(null));
    }
    let saveInFlight = false;
    async function refreshInboundRoutes() {
        if (!store.getState().inbound.loaded)
            return;
        try {
            const r = (await wizardCall('wizardLoadInbound', {}));
            if (!r || r.ok !== true || !Array.isArray(r.routes))
                return;
            store.dispatch(Action.inboundRoutesSet({
                routes: r.routes,
                flowSid: r.flowSid || '',
                publishedAt: r.publishedAt || ''
            }));
        }
        catch (e) {
        }
    }
    async function savePhonesRow(phoneSid) {
        if (saveInFlight)
            return;
        const state = store.getState();
        const saved = savedRow(phoneSid);
        const draft = state.console.phonesDrafts[phoneSid];
        if (!saved || !draft)
            return;
        saveInFlight = true;
        store.dispatch(Action.phonesRowSave({ phoneSid, phase: 'start' }));
        try {
            const values = rowValues(saved, state.console.phonesDrafts);
            const result = await wizardCall('wizardSaveAssignments', {
                assignments: [{
                        phoneSid,
                        phoneNumber: saved.phoneNumber,
                        employeeIds: values.employeeIds,
                        label: saved.label,
                        primaryEmployeeId: values.primaryEmployeeId
                    }]
            });
            if (!result || result.saved !== true) {
                store.dispatch(Action.phonesRowSave({
                    phoneSid,
                    phase: 'failure',
                    error: (result && (result.errorMessage || result.error)) || 'save_failed'
                }));
                return;
            }
            const routing = result.routing;
            if (routing && !routing.skipped && typeof routing.ok === 'boolean') {
                store.dispatch(Action.inboundRoutingUpdate(routing));
            }
            const routingErrors = routing && Array.isArray(routing.errors) ? routing.errors.slice() : [];
            if (routing && routing.ok === false && !routing.skipped && !routing.partial &&
                routingErrors.length === 0) {
                routingErrors.push({
                    phoneNumber: '',
                    message: routing.message || 'Inbound routing was not published. Publish again.'
                });
            }
            let reloadError = null;
            let rows = null;
            try {
                const asg = (await wizardCall('wizardLoadAssignments', {}));
                if (asg && Array.isArray(asg.items) && !listError(asg))
                    rows = asg.items;
            }
            catch (e) {
                rows = null;
            }
            if (rows) {
                const numbers = (store.getState().console.phonesNumbers || []);
                store.dispatch(Action.phonesLoadSuccess({ byPhone: groupByPhone(numbers, rows) }));
                store.dispatch(Action.consolePatch({ assignments: rows }));
            }
            else {
                const current = (store.getState().console.phonesByPhone || []);
                store.dispatch(Action.phonesLoadSuccess({
                    byPhone: current.map((r) => (r.phoneSid === phoneSid
                        ? { ...r, employeeIds: values.employeeIds, primaryEmployeeId: values.primaryEmployeeId }
                        : r))
                }));
                reloadError = 'Saved, but the list did not refresh. Click "Refresh from Twilio".';
            }
            store.dispatch(Action.phonesRowSave({
                phoneSid, phase: 'success', routingErrors, error: reloadError
            }));
            await refreshInboundRoutes();
        }
        catch (e) {
            store.dispatch(Action.phonesRowSave({
                phoneSid, phase: 'failure', error: thrownText(e, 'save_failed')
            }));
        }
        finally {
            saveInFlight = false;
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

    function isConfigActive(state) {
        const snap = state.console.snapshot;
        return !!snap && snap.active === true;
    }
    function determineLandingStep(snap) {
        const has = (v) => !!(v && String(v).trim().length > 0);
        if (snap.active === true)
            return 'console';
        if (!has(snap.accountSid) || !has(snap.apiKeySid))
            return 2;
        if (!has(snap.apiSecretId))
            return 2;
        if (!has(snap.twimlAppSid) || !has(snap.phoneNumber))
            return 3;
        return 'console';
    }
    const TOTAL_STEPS$1 = 5;
    const STEP2_FIELDS = ['accountSid', 'apiKeySid', 'apiSecretId'];
    const STEP3_FIELDS = ['twimlAppSid', 'phoneNumber', 'intelServiceSid'];
    function prefillFromSnapshot(state) {
        const snap = state.console.snapshot;
        if (!snap)
            return;
        const saved = (v) => (typeof v === 'string' ? v.trim() : '');
        STEP2_FIELDS.forEach((field) => {
            const v = saved(snap[field]);
            if (v && !state.step2[field]) {
                store.dispatch(Action.step2FieldChange(field, v));
            }
        });
        STEP3_FIELDS.forEach((field) => {
            const v = saved(snap[field]);
            if (v && !state.step3[field]) {
                store.dispatch(Action.step3FieldChange(field, v));
            }
        });
    }
    const SECTIONS = ['overview', 'phones', 'inbound', 'voice', 'credentials'];
    function parseHash(hash) {
        const path = String(hash || '').replace(/^#\/?/, '').replace(/\/+$/, '');
        if (!path)
            return null;
        const step = /^setup\/([1-5])$/.exec(path);
        if (step)
            return { kind: 'step', step: Number(step[1]) };
        const section = SECTIONS.find((sec) => sec === path);
        return section ? { kind: 'section', section } : null;
    }
    const hashFor = (route) => route.kind === 'section' ? '#/' + route.section : '#/setup/' + route.step;
    function writeHash(route, push) {
        try {
            const target = hashFor(route);
            if (window.location.hash === target)
                return;
            if (push)
                window.history.pushState(null, '', target);
            else
                window.history.replaceState(null, '', target);
        }
        catch (e) {
        }
    }
    function currentRoute(state) {
        return state.mode === 'stepper'
            ? { kind: 'step', step: state.currentStep }
            : { kind: 'section', section: state.selectedSection };
    }
    let furthestStep = 0;
    function maxStepFor(state) {
        const snap = (state.console.snapshot || {});
        const landing = determineLandingStep(snap);
        return landing === 'console' ? TOTAL_STEPS$1 : Math.max(landing, furthestStep);
    }
    function consoleAllowed(state) {
        const snap = (state.console.snapshot || {});
        return state.railVisible || determineLandingStep(snap) === 'console';
    }
    let railSync = null;
    function registerRailSync(fn) {
        railSync = fn;
    }
    function afterNavigate() {
        const run = () => {
            try {
                if (railSync)
                    railSync();
            }
            catch (e) { }
            try {
                const heading = document.querySelector('[data-ctc-page-heading]');
                if (!heading)
                    return;
                for (let el = heading.parentElement; el; el = el.parentElement) {
                    if (el.scrollTop > 0)
                        el.scrollTop = 0;
                }
                if (!heading.hasAttribute('tabindex'))
                    heading.setAttribute('tabindex', '-1');
                heading.focus({ preventScroll: true });
            }
            catch (e) { }
        };
        if (typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(() => { setTimeout(run, 0); });
        }
        else {
            setTimeout(run, 0);
        }
    }
    function goToStep(stepNum, opts = {}) {
        const state = store.getState();
        if (isConfigActive(state))
            return;
        if (state.mode === 'console' || state.mountRouting) {
            prefillFromSnapshot(state);
            if (state.step5.activated) {
                store.dispatch(Action.step5FieldChange('activated', false));
            }
        }
        const clamped = Math.max(1, Math.min(TOTAL_STEPS$1, stepNum));
        const changed = state.mode !== 'stepper' || state.currentStep !== clamped;
        furthestStep = Math.max(furthestStep, clamped);
        store.dispatch(Action.setMode('stepper'));
        store.dispatch(Action.setCurrentStep(clamped));
        writeHash({ kind: 'step', step: clamped }, opts.push !== false && !state.mountRouting);
        if (clamped === 1) {
            loadPrereqs();
        }
        if (changed && !state.mountRouting)
            afterNavigate();
    }
    function goToConsole(section = 'overview', opts = {}) {
        const state = store.getState();
        store.dispatch(Action.setMode('console'));
        store.dispatch(Action.setSelectedSection(section));
        store.dispatch(Action.setRailVisible(true));
        store.dispatch(Action.actionErrorSet(null));
        writeHash({ kind: 'section', section }, opts.push !== false && !state.mountRouting);
        loadConsole();
        loadSectionData(section);
        if (!state.mountRouting)
            afterNavigate();
    }
    function loadSectionData(section) {
        const c = store.getState().console;
        if (section === 'phones' && c.phonesNumbers === null && !c.phonesLoading) {
            loadPhonesData();
        }
    }
    function goToSection(sectionName, opts = {}) {
        const state = store.getState();
        store.dispatch(Action.setSelectedSection(sectionName));
        if (state.mode === 'stepper') {
            store.dispatch(Action.setMode('console'));
        }
        store.dispatch(Action.actionErrorSet(null));
        writeHash({ kind: 'section', section: sectionName }, opts.push !== false);
        loadSectionData(sectionName);
        afterNavigate();
    }
    function landFromHash(landing) {
        const route = parseHash(window.location.hash);
        const state = store.getState();
        if (landing === 'console') {
            if (route && route.kind === 'step' && !isConfigActive(state)) {
                store.dispatch(Action.setRailVisible(true));
                goToStep(route.step, { push: false });
                return;
            }
            goToConsole(route && route.kind === 'section' ? route.section : 'overview', { push: false });
            return;
        }
        const step = route && route.kind === 'step' ? Math.min(route.step, landing) : landing;
        goToStep(step, { push: false });
    }
    function onHashChange() {
        const state = store.getState();
        if (state.mountRouting)
            return;
        const route = parseHash(window.location.hash);
        if (route && route.kind === 'section' && consoleAllowed(state)) {
            if (state.mode === 'console' && state.selectedSection === route.section)
                return;
            if (state.mode === 'console')
                goToSection(route.section, { push: false });
            else
                goToConsole(route.section, { push: false });
            return;
        }
        if (route && route.kind === 'step' && !isConfigActive(state)) {
            const step = Math.min(route.step, maxStepFor(state));
            if (state.mode === 'stepper' && state.currentStep === step) {
                writeHash({ kind: 'step', step }, false);
                return;
            }
            goToStep(step, { push: false });
            return;
        }
        if (!route && consoleAllowed(state)) {
            if (state.mode === 'console' && state.selectedSection === 'overview') {
                writeHash({ kind: 'section', section: 'overview' }, false);
            }
            else if (state.mode === 'console') {
                goToSection('overview', { push: false });
            }
            else {
                goToConsole('overview', { push: false });
            }
            return;
        }
        writeHash(currentRoute(state), false);
    }
    let hashListening = false;
    function startHashRouting() {
        if (hashListening)
            return;
        hashListening = true;
        try {
            window.addEventListener('hashchange', onHashChange);
        }
        catch (e) {
            hashListening = false;
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
        const textColumnItems = [
            (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.STRONG, children: check.label }) })),
            check.detail && (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, size: component__namespace.Text.Size.S, children: check.detail }) })),
            check.repairHint && (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { size: component__namespace.Text.Size.S, children: '→ ' + check.repairHint }) }))
        ].filter(Boolean);
        return (jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.HORIZONTAL, alignment: component__namespace.StackPanel.Alignment.START, itemGap: component__namespace.StackPanel.GapSize.M, children: [jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(StatusIcon, { status: check.status }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.XXS, children: textColumnItems }) })] }));
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
    const callSave = async (action, payload) => {
        try {
            const resp = (await wizardCall(action, payload));
            if (resp && resp.saved)
                return { ok: true };
            return { ok: false, error: (resp && resp.error) || 'unknown' };
        }
        catch (e) {
            const err = e;
            return { ok: false, error: 'Network: ' + (err.message || String(e)) };
        }
    };
    async function saveStep2() {
        const s = store.getState().step2;
        return callSave('wizardSavePublicIds', {
            accountSid: s.accountSid,
            apiKeySid: s.apiKeySid,
            apiSecretId: s.apiSecretId
        });
    }
    async function saveStep3() {
        const s = store.getState().step3;
        return callSave('wizardSaveVoice', {
            twimlAppSid: s.twimlAppSid,
            phoneNumber: s.phoneNumber,
            intelServiceSid: s.intelServiceSid
        });
    }
    async function saveStep4() {
        const s = store.getState().step4;
        const phoneNumbers = s.phoneNumbers || [];
        const assignmentsMap = s.assignments || {};
        const rows = [];
        phoneNumbers.forEach((pn) => {
            const a = assignmentsMap[pn.sid] || {};
            const employeeIds = a.employeeIds || [];
            if (employeeIds.length === 0)
                return;
            rows.push({
                phoneSid: pn.sid,
                phoneNumber: pn.phoneNumber,
                label: a.label || pn.friendlyName || '',
                employeeIds: employeeIds,
                primaryEmployeeId: a.primaryEmployeeId || employeeIds[0]
            });
        });
        console.log('[CTC Setup Wizard] Step 4 Continue — assignments map:', assignmentsMap);
        console.log('[CTC Setup Wizard] Step 4 Continue — payload rows (' + rows.length + '):', rows);
        return callSave('wizardSaveAssignments', { assignments: rows, stepper: true });
    }
    async function loadStep5() {
        const safe = (promise) => promise.catch(() => null);
        const [snapResp, assignments, preflight] = await Promise.all([
            safe(wizardCall('wizardSnapshot', {})),
            safe(wizardCall('wizardLoadAssignments', {})),
            safe(wizardCall('wizardRunPreflight', {}))
        ]);
        const snapshot = (snapResp && snapResp.snapshot) || null;
        store.dispatch(Action.consoleLoadSuccess({
            snapshot,
            assignments: (assignments && assignments.items) || null,
            preflight: (preflight && preflight.checks) || null
        }));
    }

    const nonEmpty = (v) => !!(v && String(v).trim().length > 0);
    function isStep2Valid(state) {
        const s = state.step2;
        return nonEmpty(s.accountSid) && nonEmpty(s.apiKeySid) && nonEmpty(s.apiSecretId);
    }
    function isStep3Valid(state) {
        const s = state.step3;
        return nonEmpty(s.twimlAppSid) && nonEmpty(s.phoneNumber);
    }
    function isStep4Valid(state) {
        const map = state.step4.assignments;
        for (const sid in map) {
            if (!Object.prototype.hasOwnProperty.call(map, sid))
                continue;
            const ids = (map[sid] && map[sid].employeeIds) || [];
            if (ids.length > 0)
                return true;
        }
        return false;
    }
    function isStepValid(stepNum, state) {
        switch (stepNum) {
            case 2: return isStep2Valid(state);
            case 3: return isStep3Valid(state);
            case 4: return isStep4Valid(state);
            default: return true;
        }
    }

    const FIELD_LABELS = {
        accountSid: 'Account SID',
        apiKeySid: 'API Key SID',
        apiSecretId: 'API Key Secret script ID',
        api_secret_id: 'API Key Secret script ID',
        twimlAppSid: 'TwiML Application SID',
        intelServiceSid: 'Intelligence service SID',
        phoneNumber: 'phone number',
        phone_number: 'phone number',
        assignments: 'rep assignments'
    };
    const FORMAT_HINTS = {
        accountSid: 'AC followed by 32 letters or digits',
        apiKeySid: 'SK followed by 32 letters or digits',
        apiSecretId: 'custsecret_ followed by letters, digits or _',
        twimlAppSid: 'AP followed by 32 letters or digits',
        intelServiceSid: 'GA followed by 32 letters or digits'
    };
    const MESSAGES = {
        preflight_failed: 'Some preflight checks failed. Fix the checks listed, then try again.',
        config_not_found: 'The Click-to-Call configuration record was not found. Run the setup wizard from Step 1.',
        forbidden: 'Only the Administrator role can change Click-to-Call settings.',
        method_not_allowed: 'The server refused the request. Reload the page and try again.',
        unknown_action: 'The server does not know this request. Reload the page to get the latest version.',
        internal_error: 'The server had an unexpected error. See the execution log of the CTC Wizard API script.',
        save_failed: 'The save did not complete. Try again.',
        outbound_published: 'Unpublish the recording notice first, then change the TwiML App.',
        nothing_to_save: 'Nothing to save.',
        config_active: 'Click-to-Call is active, so the setup wizard cannot change settings. Make the change in the console, or deactivate first.',
        activate_failed: 'Click-to-Call could not change its active setting. Try again.',
        governance_limit: 'NetSuite stopped the save before it finished (usage limit). Save again to finish.',
        payload_too_large: 'Too many phone numbers in one save. Save fewer numbers at a time.',
        load_assignments_failed: 'The rep assignments did not load.',
        load_routes_failed: 'The inbound routing table did not load.',
        connection_test_failed: 'The connection test failed, so nothing was saved. The old values are still in use.',
        EMPTY_SECRET_OR_INVALID: 'Twilio rejected the credentials. Check the API Key SID and the secret value in NetSuite API Secrets.',
        NETWORK_ERROR: 'NetSuite could not reach Twilio. Try again.'
    };
    const friendlyError = (raw) => {
        const text = String(raw == null ? '' : raw).trim();
        if (!text)
            return 'Something went wrong. Try again.';
        if (MESSAGES[text])
            return MESSAGES[text];
        const missing = /^missing_([A-Za-z_]+)$/.exec(text);
        if (missing) {
            const label = FIELD_LABELS[missing[1]] || missing[1].replace(/_/g, ' ');
            return 'Enter the ' + label + '.';
        }
        const format = /^invalid_format_([A-Za-z_]+)$/.exec(text);
        if (format) {
            const field = format[1];
            const label = FIELD_LABELS[field] || field.replace(/_/g, ' ');
            const hint = FORMAT_HINTS[field];
            return 'The ' + label + ' does not look right' +
                (hint ? ' (expected ' + hint + ').' : '.');
        }
        if (/^[A-Za-z0-9_]+$/.test(text) && text.indexOf('_') >= 0) {
            return 'The request failed (' + text + '). Try again.';
        }
        return text;
    };

    const TOTAL_STEPS = 5;
    const advance = async (currentStep, saver) => {
        if (store.getState().wizardSaving)
            return;
        store.dispatch(Action.actionErrorSet(null));
        store.dispatch(Action.setWizardSaving(true));
        let result;
        try {
            result = await saver();
        }
        finally {
            store.dispatch(Action.setWizardSaving(false));
        }
        if (result.ok) {
            goToStep(currentStep + 1);
        }
        else {
            store.dispatch(Action.actionErrorSet('Save failed (Step ' + currentStep + '): ' + friendlyError(result.error || 'unknown')));
        }
    };
    const onContinue = (currentStep) => {
        if (currentStep === 1) {
            goToStep(2);
            return;
        }
        if (currentStep === 2) {
            advance(2, saveStep2);
            return;
        }
        if (currentStep === 3) {
            advance(3, saveStep3);
            return;
        }
        if (currentStep === 4) {
            advance(4, saveStep4);
            return;
        }
    };
    class WizardNavFooter extends core.PureComponent {
        render() {
            const state = store.getState();
            const currentStep = state.currentStep;
            if (currentStep >= TOTAL_STEPS)
                return null;
            const showBack = currentStep > 1;
            const showContinue = currentStep < TOTAL_STEPS;
            if (!showBack && !showContinue)
                return null;
            const saving = state.wizardSaving;
            const continueEnabled = isStepValid(currentStep, state) && !saving;
            const errorMsg = state.console.actionError;
            const items = [];
            if (showBack) {
                items.push(jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Button, { label: "Back", type: component__namespace.Button.Type.DEFAULT, enabled: !saving, action: () => { goToStep(currentStep - 1); } }) }));
            }
            if (showContinue) {
                items.push(jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Button, { label: saving ? 'Saving…' : 'Continue', type: component__namespace.Button.Type.PRIMARY, enabled: continueEnabled, action: () => { onContinue(currentStep); } }) }));
            }
            const row = (jsxRuntime.jsx(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.HORIZONTAL, itemGap: component__namespace.StackPanel.GapSize.M, children: items }));
            if (!errorMsg)
                return row;
            return (jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.S, children: [jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.STRONG, children: '✕ ' + errorMsg }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: row })] }));
        }
    }

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
                            }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(WizardNavFooter, { tick: this.props.tick }) })] }));
            }
            if (p.error) {
                return (jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.M, children: [heading, intro, jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(ErrorText, { message: p.error }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(WizardNavFooter, { tick: this.props.tick }) })] }));
            }
            const checks = p.checks || [];
            return (jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.M, children: [heading, intro, jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(PrereqsList, { checks: checks }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(WizardNavFooter, { tick: this.props.tick }) })] }));
        }
    }

    const TWILIO_DOCS$2 = {
        accountSid: 'https://www.twilio.com/docs/iam/api/account',
        apiKeySid: 'https://www.twilio.com/docs/iam/api-keys',
        apiSecret: 'https://www.twilio.com/docs/iam/api-keys'
    };
    const ROWS$1 = [
        {
            field: 'accountSid',
            label: 'Account SID',
            placeholder: 'AC...',
            docUrl: TWILIO_DOCS$2.accountSid,
            description: 'Public identifier for your Twilio account. Found in the ' +
                'Twilio Console under Account Info. Safe to display — the ' +
                'matching Auth Token never leaves Twilio.'
        },
        {
            field: 'apiKeySid',
            label: 'API Key SID',
            placeholder: 'SK...',
            docUrl: TWILIO_DOCS$2.apiKeySid,
            description: 'Identifies which Twilio API Key the wizard authenticates ' +
                'with. Create one at Account > API keys & tokens. The ' +
                'matching Secret is held by NetSuite (next field).'
        },
        {
            field: 'apiSecretId',
            label: 'API Key Secret script ID',
            placeholder: 'custsecret_...',
            docUrl: TWILIO_DOCS$2.apiSecret,
            description: 'Script ID of the NetSuite API Secret holding the Twilio ' +
                'Secret value. Create the secret at Setup > Company > API ' +
                'Secrets, then paste its custsecret_... script ID here. The ' +
                'value itself never leaves NetSuite\'s vault.'
        }
    ];
    class Step2 extends core.PureComponent {
        dispatchField = (field, value) => {
            store.dispatch(Action.step2FieldChange(field, value));
        };
        render() {
            const state = store.getState();
            const s = state.step2;
            const pushHeader = (cells, text) => {
                cells.push(jsxRuntime.jsx(component__namespace.GridPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, size: component__namespace.Text.Size.S, children: text }) }));
            };
            const allCells = [];
            pushHeader(allCells, 'Field');
            pushHeader(allCells, 'Docs');
            pushHeader(allCells, 'Description');
            pushHeader(allCells, 'Value');
            ROWS$1.forEach((row) => {
                const value = s[row.field] || '';
                allCells.push(jsxRuntime.jsx(component__namespace.GridPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.STRONG, children: row.label }) }));
                const docLink = new component__namespace.Link({
                    content: 'Twilio docs ↗',
                    url: row.docUrl,
                    target: component__namespace.Link.Target.BLANK
                });
                allCells.push(jsxRuntime.jsx(component__namespace.GridPanel.Item, { children: docLink }));
                allCells.push(jsxRuntime.jsx(component__namespace.GridPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, size: component__namespace.Text.Size.S, children: row.description }) }));
                allCells.push(jsxRuntime.jsx(component__namespace.GridPanel.Item, { children: jsxRuntime.jsx(component__namespace.TextBox, { text: value, placeholder: row.placeholder, onTextChanged: (args) => {
                            this.dispatchField(row.field, (args && args.text) || '');
                        }, rootStyle: { width: '100%' } }) }));
            });
            return (jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.M, children: [jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Heading, { level: 2, children: "Connect to your Twilio account" }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { children: "Enter your Twilio Account SID and API Key SID. The API Key Secret must already exist in NetSuite API Secrets (Setup > Company > API Secrets) \u2014 paste its script ID below. Live validation against Twilio runs at Step 5 using the configured secret pointer \u2014 no need to paste the secret value here." }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.GridPanel, { columns: "180px 110px 1fr 360px", rows: "auto auto auto auto", columnGap: component__namespace.GridPanel.GapSize.M, rowGap: component__namespace.GridPanel.GapSize.M, children: allCells }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(WizardNavFooter, { tick: this.props.tick }) })] }));
        }
    }

    const TWILIO_DOCS$1 = {
        twimlApp: 'https://www.twilio.com/docs/usage/api/applications',
        phoneNumber: 'https://www.twilio.com/docs/phone-numbers/api/incomingphonenumber-resource',
        intelService: 'https://www.twilio.com/docs/voice/intelligence'
    };
    const ROWS = [
        {
            field: 'twimlAppSid',
            label: 'TwiML Application',
            description: 'Outbound calls use this app. When you publish the recording ' +
                'notice, the wizard points its Voice URL at a Twilio Function ' +
                'in your account.',
            docUrl: TWILIO_DOCS$1.twimlApp,
            allowEmpty: false,
            listKey: 'twimlApps',
            toOption: (ti) => ({
                value: ti.sid || '',
                label: (ti.friendlyName || '(unnamed)') +
                    (ti.sid ? '  [' + ti.sid + ']' : '')
            })
        },
        {
            field: 'phoneNumber',
            label: 'Default outbound caller ID',
            description: 'The number reps see as their caller ID when placing a call. ' +
                'Specific rep-to-number assignments in Step 4 override this ' +
                'default.',
            docUrl: TWILIO_DOCS$1.phoneNumber,
            allowEmpty: false,
            listKey: 'phoneNumbers',
            toOption: (n) => ({
                value: n.phoneNumber || '',
                label: (n.phoneNumber || '') +
                    (n.friendlyName ? ' — ' + n.friendlyName : '')
            })
        },
        {
            field: 'intelServiceSid',
            label: 'Conversational Intelligence',
            description: 'Optional. Twilio Voice Intelligence service that produces ' +
                'transcripts and AI summaries. Leave blank to disable post-' +
                'call analysis.',
            docUrl: TWILIO_DOCS$1.intelService,
            allowEmpty: true,
            listKey: 'intelServices',
            toOption: (ti) => ({
                value: ti.sid || '',
                label: (ti.friendlyName || '(unnamed)') +
                    (ti.sid ? '  [' + ti.sid + ']' : '')
            })
        }
    ];
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
                            }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(WizardNavFooter, { tick: this.props.tick }) })] }));
            }
            if (s.listLoadError) {
                return (jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.M, children: [heading, intro, jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsxs(component__namespace.Text, { type: component__namespace.Text.Type.STRONG, children: ["\u2715 Could not load Twilio lists: ", s.listLoadError, ". Verify the API Secret value is set at Setup > Company > API Secrets, then go back to Step 2 and Continue again to retry."] }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(WizardNavFooter, { tick: this.props.tick }) })] }));
            }
            const pushHeader = (cells, text) => {
                cells.push(jsxRuntime.jsx(component__namespace.GridPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, size: component__namespace.Text.Size.S, children: text }) }));
            };
            const allCells = [];
            pushHeader(allCells, 'Field');
            pushHeader(allCells, 'Docs');
            pushHeader(allCells, 'Description');
            pushHeader(allCells, 'Value');
            ROWS.forEach((row) => {
                const items = s[row.listKey] || [];
                const options = items.map(row.toOption);
                const selectedValue = s[row.field] ||
                    (row.allowEmpty ? '' : (options[0]?.value || ''));
                allCells.push(jsxRuntime.jsx(component__namespace.GridPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.STRONG, children: row.label }) }));
                const docLink = new component__namespace.Link({
                    content: 'Twilio docs ↗',
                    url: row.docUrl,
                    target: component__namespace.Link.Target.BLANK
                });
                allCells.push(jsxRuntime.jsx(component__namespace.GridPanel.Item, { children: docLink }));
                allCells.push(jsxRuntime.jsx(component__namespace.GridPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, size: component__namespace.Text.Size.S, children: row.description }) }));
                if (options.length === 0) {
                    allCells.push(jsxRuntime.jsx(component__namespace.GridPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, children: "(no items found in Twilio for this account)" }) }));
                }
                else {
                    const ds = new core__namespace.ArrayDataSource(options);
                    allCells.push(jsxRuntime.jsx(component__namespace.GridPanel.Item, { children: jsxRuntime.jsx(component__namespace.Dropdown, { dataSource: ds, valueMember: "value", displayMember: "label", selectedValue: selectedValue || (row.allowEmpty ? null : options[0].value), allowEmpty: row.allowEmpty, placeholder: row.allowEmpty ? '(none)' : 'Select…', onSelectionChanged: (args) => {
                                this.dispatchField(row.field, (args && args.value) || '');
                            }, rootStyle: { width: '100%' } }) }));
                }
            });
            return (jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.M, children: [heading, intro, jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.GridPanel, { columns: "220px 110px 1fr 360px", rows: "auto auto auto auto", columnGap: component__namespace.GridPanel.GapSize.M, rowGap: component__namespace.GridPanel.GapSize.M, children: allCells }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(WizardNavFooter, { tick: this.props.tick }) })] }));
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
                            }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(WizardNavFooter, { tick: this.props.tick }) })] }));
            }
            if (s.listLoadError) {
                return (jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.M, children: [heading, intro, jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsxs(component__namespace.Text, { type: component__namespace.Text.Type.STRONG, children: ["\u2715 ", s.listLoadError] }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(WizardNavFooter, { tick: this.props.tick }) })] }));
            }
            const phoneNumbers = s.phoneNumbers || [];
            const employees = s.employees || [];
            const assignments = s.assignments;
            if (phoneNumbers.length === 0) {
                return (jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.M, children: [heading, intro, jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, children: "(no phone numbers owned by this Twilio account \u2014 buy one in Twilio Console before continuing)" }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(WizardNavFooter, { tick: this.props.tick }) })] }));
            }
            const stackItems = [];
            stackItems.push(heading);
            stackItems.push(intro);
            for (const pn of phoneNumbers) {
                stackItems.push(jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(AssignmentRow, { phoneNumber: pn, employees: employees, assignment: assignments[pn.sid] || {} }) }, pn.sid));
            }
            stackItems.push(jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(WizardNavFooter, { tick: this.props.tick }) }));
            return (jsxRuntime.jsx(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.L, children: stackItems }));
        }
    }

    const statusToBadge$1 = (status) => {
        switch (status) {
            case 'pass': return { text: 'Pass', palette: { bg: '#D4EDDA', fg: '#155724', border: '#A3D9AE' } };
            case 'fail': return { text: 'Fail', palette: { bg: '#F8D7DA', fg: '#721C24', border: '#F1B5BB' } };
            case 'warn': return { text: 'Warn', palette: { bg: '#FFF3CD', fg: '#856404', border: '#FFE69C' } };
            case 'info_enabled': return { text: 'Enabled', palette: { bg: '#CCE5FF', fg: '#004085', border: '#9FCDFF' } };
            case 'info_disabled': return { text: 'Disabled', palette: { bg: '#E2E3E5', fg: '#383D41', border: '#C7CACE' } };
            default: return { text: status || '—', palette: { bg: '#E2E3E5', fg: '#383D41', border: '#C7CACE' } };
        }
    };
    const statusIcon$1 = (status) => {
        switch (status) {
            case 'pass': return { icon: core__namespace.SystemIcon.STATUS_SUCCESS_FILLED, color: core__namespace.ImageConstant.Color.SUCCESS };
            case 'fail': return { icon: core__namespace.SystemIcon.STATUS_ERROR_FILLED, color: core__namespace.ImageConstant.Color.DANGER };
            case 'warn': return { icon: core__namespace.SystemIcon.STATUS_WARNING_FILLED, color: core__namespace.ImageConstant.Color.WARNING };
            case 'info_enabled': return { icon: core__namespace.SystemIcon.STATUS_INFO_FILLED, color: core__namespace.ImageConstant.Color.INFO };
            default: return { icon: core__namespace.SystemIcon.STATUS_INFO, color: core__namespace.ImageConstant.Color.NEUTRAL };
        }
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
            if (store.getState().step5.activating)
                return;
            store.dispatch(Action.step5FieldChange('activating', true));
            store.dispatch(Action.step5FieldChange('activateError', null));
            try {
                const payload = await wizardCall('wizardActivate', {});
                const resp = payload;
                if (resp && resp.activated) {
                    const snap = store.getState().console.snapshot;
                    store.dispatch(Action.consoleLoadSuccess({
                        snapshot: { ...(snap || {}), active: true }
                    }));
                    store.dispatch(Action.step5FieldChange('activated', true));
                    store.dispatch(Action.step5FieldChange('activateError', null));
                }
                else {
                    store.dispatch(Action.step5FieldChange('activateError', (resp && (resp.errorMessage || resp.error)) || 'unknown'));
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
            finally {
                store.dispatch(Action.step5FieldChange('activating', false));
            }
        };
        buildCheckColumns() {
            const CT = component__namespace.DataGrid.ColumnType;
            const BdgType = component__namespace.Badge.Type;
            return [
                {
                    type: CT.TEMPLATED,
                    name: 'statusIcon',
                    label: '',
                    stretchFactor: 1,
                    content: (args) => {
                        const status = args?.cell?.row?.dataItem?.status || 'info_enabled';
                        const si = statusIcon$1(status);
                        return new component__namespace.Image({
                            image: si.icon,
                            size: component__namespace.Image.Size.M,
                            color: si.color,
                            presentation: true
                        });
                    }
                },
                {
                    type: CT.TEMPLATED,
                    name: 'check',
                    label: 'Check',
                    stretchFactor: 5,
                    content: (args) => {
                        const row = args?.cell?.row?.dataItem;
                        return new component__namespace.Text({
                            text: row?.label || '(unlabeled check)',
                            type: component__namespace.Text.Type.STRONG
                        });
                    }
                },
                {
                    type: CT.TEMPLATED,
                    name: 'detail',
                    label: 'Detail',
                    stretchFactor: 7,
                    content: (args) => {
                        const row = args?.cell?.row?.dataItem;
                        const text = row?.detail ||
                            (row?.repairHint ? '→ ' + row.repairHint : '—');
                        return new component__namespace.Text({
                            text,
                            type: component__namespace.Text.Type.WEAK,
                            size: component__namespace.Text.Size.S
                        });
                    }
                },
                {
                    type: CT.TEMPLATED,
                    name: 'status',
                    label: 'Status',
                    stretchFactor: 2,
                    content: (args) => {
                        const status = args?.cell?.row?.dataItem?.status || 'info_enabled';
                        const sb = statusToBadge$1(status);
                        return new component__namespace.Badge({
                            content: sb.text,
                            type: BdgType.SUBTLE,
                            rootStyle: {
                                backgroundColor: sb.palette.bg,
                                color: sb.palette.fg,
                                border: '1px solid ' + sb.palette.border
                            }
                        });
                    }
                }
            ];
        }
        renderReviewGrid(snap, assignments) {
            const phoneSet = {};
            assignments.forEach((a) => { if (a.phoneSid)
                phoneSet[a.phoneSid] = true; });
            const phoneCount = Object.keys(phoneSet).length;
            const rows = [
                { label: 'ACCOUNT SID', value: snap.accountSid || '(not set)', mono: true, weak: !snap.accountSid },
                { label: 'API KEY SID', value: snap.apiKeySid || '(not set)', mono: true, weak: !snap.apiKeySid },
                { label: 'API KEY SECRET', value: snap.apiSecretId || '(not set)', mono: true, weak: !snap.apiSecretId },
                { label: 'TWIML APPLICATION', value: snap.twimlAppSid || '(not set)', mono: true, weak: !snap.twimlAppSid },
                { label: 'DEFAULT CALLER ID', value: snap.phoneNumber || '(not set)', mono: true, weak: !snap.phoneNumber },
                { label: 'INTEL SERVICE', value: snap.intelServiceSid || '(none)', mono: true, weak: !snap.intelServiceSid },
                { label: 'PHONE ASSIGNMENTS', value: assignments.length + ' rep(s) across ' + phoneCount + ' number(s)', mono: false, weak: assignments.length === 0 }
            ];
            const cells = [];
            rows.forEach((r) => {
                cells.push(jsxRuntime.jsx(component__namespace.GridPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, size: component__namespace.Text.Size.S, children: r.label }) }));
                cells.push(jsxRuntime.jsx(component__namespace.GridPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: r.weak ? component__namespace.Text.Type.WEAK : component__namespace.Text.Type.DEFAULT, rootStyle: {
                            fontFamily: r.mono
                                ? 'ui-monospace, SF Mono, Menlo, Consolas, monospace'
                                : 'inherit',
                            fontSize: r.mono ? '12.5px' : '13px',
                            wordBreak: 'break-all'
                        }, children: r.value }) }));
            });
            return (jsxRuntime.jsx(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.NONE, rootStyle: {
                    background: '#F7F8F9',
                    border: '1px solid #E2E3E5',
                    borderRadius: '10px',
                    padding: '18px 22px'
                }, children: jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.GridPanel, { columns: "220px 1fr", rows: "auto auto auto auto auto auto auto", columnGap: component__namespace.GridPanel.GapSize.M, rowGap: component__namespace.GridPanel.GapSize.S, children: cells }) }) }));
        }
        render() {
            const state = store.getState();
            const s = state.step5;
            const consoleState = state.console;
            const snap = consoleState.snapshot || {};
            const assignments = consoleState.assignments || [];
            const preflight = consoleState.preflight;
            if (s.activated) {
                return (jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.M, children: [jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.STRONG, children: "\u2713 Click-to-Call is active. Sales reps can now use the phone icon on Customer, Lead, and Contact records." }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Button, { label: "Go to Admin Console", type: component__namespace.Button.Type.PRIMARY, action: () => { goToConsole(); } }) })] }));
            }
            if (s.loading) {
                return (jsxRuntime.jsx(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.M, children: jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: new component__namespace.Loader({
                            label: 'Running preflight checks…',
                            indeterminate: true
                        }) }) }));
            }
            const allPassed = preflight !== null &&
                (preflight || []).every((c) => c.status === 'pass');
            const leftCol = (jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.S, children: [jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Heading, { level: 3, children: "Configuration review" }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: this.renderReviewGrid(snap, assignments) })] }));
            const rightItems = [];
            rightItems.push(jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Heading, { level: 3, children: "Preflight checks" }) }));
            if (preflight === null) {
                rightItems.push(jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, children: "(preflight has not run \u2014 click \"Re-run preflight\" below)" }) }));
            }
            else if (preflight.length === 0) {
                rightItems.push(jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, children: "(no checks returned)" }) }));
            }
            else {
                const columns = this.buildCheckColumns();
                const ds = new core__namespace.ArrayDataSource(preflight);
                rightItems.push(jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: new component__namespace.DataGrid({
                        dataSource: ds,
                        columns,
                        columnStretch: true,
                        highlightRowsOnHover: true,
                        stripedRows: true,
                        dataRowHeight: 56,
                        headerRowHeight: 36,
                        rootStyle: { width: '100%' }
                    }) }));
            }
            const rightCol = (jsxRuntime.jsx(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.S, children: rightItems }));
            const items = [];
            items.push(jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsxs(component__namespace.GridPanel, { columns: "1fr 1fr", rows: "auto", columnGap: component__namespace.GridPanel.GapSize.L, children: [jsxRuntime.jsx(component__namespace.GridPanel.Item, { children: leftCol }), jsxRuntime.jsx(component__namespace.GridPanel.Item, { children: rightCol })] }) }));
            items.push(jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Button, { label: s.activating
                        ? 'Activating…'
                        : allPassed
                            ? 'Activate Click-to-Call'
                            : 'Activate Click-to-Call (fix preflight first)', type: component__namespace.Button.Type.PRIMARY, enabled: allPassed && !s.activating, action: () => { this.activate(); } }) }));
            if (s.activateError) {
                items.push(jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.STRONG, children: '✕ Activation failed: ' + friendlyError(s.activateError) }) }));
            }
            items.push(jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.HORIZONTAL, itemGap: component__namespace.StackPanel.GapSize.M, children: [jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Button, { label: "Back", type: component__namespace.Button.Type.DEFAULT, enabled: !s.activating, action: () => { goToStep(4); } }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Button, { label: "Re-run preflight", type: component__namespace.Button.Type.DEFAULT, enabled: !s.activating, action: this.rerunPreflight }) })] }) }));
            return (jsxRuntime.jsx(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.L, children: items }));
        }
    }

    const toRow = (raw) => {
        const r = (raw || {});
        return {
            employeeId: String(r.employeeId ?? ''),
            employeeName: String(r.employeeName ?? ''),
            canReceive: r.canReceive === true,
            state: String(r.state ?? ''),
            lastSeen: String(r.lastSeen ?? ''),
            lastChange: String(r.lastChange ?? ''),
            stale: r.stale !== false,
            incomingGranted: r.incomingGranted === true,
            lastError: String(r.lastError ?? ''),
            identityMatch: r.identityMatch === true,
            client: String(r.client ?? '')
        };
    };
    async function loadPresence() {
        if (store.getState().presence.loading)
            return;
        store.dispatch(Action.presenceLoadStart());
        try {
            const result = (await wizardCall('wizardLoadPresence', {}));
            if (!result || result.ok !== true) {
                store.dispatch(Action.presenceLoadFailure((result && (result.message || result.error)) || 'Could not load phone status'));
                return;
            }
            const serverNow = Date.parse(result.now || '');
            const skew = isNaN(serverNow) ? 0 : serverNow - Date.now();
            const items = Array.isArray(result.items) ? result.items.map(toRow) : [];
            store.dispatch(Action.presenceLoadSuccess(items, skew));
        }
        catch (e) {
            store.dispatch(Action.presenceLoadFailure(e instanceof Error && e.message ? e.message : 'Could not load phone status'));
        }
    }

    const STEP_STATUSES = ['ok', 'skipped', 'failed', 'pending'];
    const DRIFT_STATUSES = ['pass', 'fail', 'unknown'];
    const str = (v) => (v == null ? '' : String(v));
    const errorText$1 = (e, fallback) => e instanceof Error && e.message ? e.message : fallback;
    const failureText$1 = (result, fallback) => (result && (result.error || result.message)) || fallback;
    const toSnapshot = (raw) => {
        const drift = raw.drift && raw.drift.voiceUrl;
        return {
            noticeOn: raw.noticeOn === true,
            noticeText: str(raw.noticeText),
            noticeVersion: Number(raw.noticeVersion) || 0,
            defaultText: str(raw.defaultText),
            maxLength: Number(raw.maxLength) || 300,
            appSid: str(raw.appSid),
            functionUrl: str(raw.functionUrl),
            prevVoiceUrl: str(raw.prevVoiceUrl),
            publishedAt: str(raw.publishedAt),
            publishedCodeVersion: str(raw.publishedCodeVersion),
            codeVersion: str(raw.codeVersion),
            needsRepublish: raw.needsRepublish === true,
            published: raw.published === true,
            pending: raw.pending === true,
            voiceUrlMatches: typeof raw.voiceUrlMatches === 'boolean' ? raw.voiceUrlMatches : null,
            driftVoiceUrl: DRIFT_STATUSES.indexOf(drift) >= 0
                ? drift
                : 'unknown',
            publishedNoticeVersion: Number(raw.publishedNoticeVersion) || 0,
            changesPending: raw.changesPending === true,
            functionExists: typeof raw.functionExists === 'boolean' ? raw.functionExists : null,
            functionMessage: str(raw.functionMessage)
        };
    };
    const toSteps = (raw) => {
        if (!Array.isArray(raw))
            return [];
        return raw.map((s) => {
            const raw = (s && s.status);
            const status = STEP_STATUSES.indexOf(raw) >= 0 ? raw : 'pending';
            return {
                key: str(s && s.key),
                label: str(s && (s.label || s.key)),
                status,
                detail: str(s && s.detail)
            };
        });
    };
    const runFailureText = (result, steps, fallback) => {
        if (result && (result.error || result.message))
            return failureText$1(result, fallback);
        const failed = steps.filter((s) => s.status === 'failed')[0];
        if (failed)
            return failed.detail ? failed.label + ': ' + failed.detail : failed.label;
        return fallback;
    };
    const setDrift = (snapshot) => {
        const current = (store.getState().console.drift || {});
        store.dispatch(Action.consoleDriftSet({ ...current, voiceUrl: snapshot.driftVoiceUrl }));
    };
    async function loadOutbound() {
        store.dispatch(Action.outboundLoadStart());
        try {
            const result = (await wizardCall('wizardLoadOutbound', {}));
            if (!result || result.ok !== true) {
                store.dispatch(Action.outboundLoadFailure(failureText$1(result, 'Could not load the outbound recording notice')));
                return;
            }
            const snapshot = toSnapshot(result);
            store.dispatch(Action.outboundLoadSuccess(snapshot));
            setDrift(snapshot);
        }
        catch (e) {
            store.dispatch(Action.outboundLoadFailure(errorText$1(e, 'Could not load the outbound recording notice')));
        }
    }
    const AUTO_RESUME_TRIES = 6;
    const AUTO_RESUME_DELAY_MS = 5000;
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    async function runPublish(resume) {
        store.dispatch(Action.outboundRequest({ op: 'publish', phase: 'start' }));
        try {
            const result = (await wizardCall('wizardPublishOutbound', resume ? { resume: true } : {}));
            const steps = toSteps(result && result.steps);
            const snapshot = result && result.state ? toSnapshot(result.state) : undefined;
            const pending = !!result && (result.pending === true || (!!snapshot && snapshot.pending));
            const failed = (!result || result.ok !== true) && !pending;
            store.dispatch(Action.outboundRequest({
                op: 'publish',
                phase: 'done',
                snapshot,
                pending,
                steps,
                error: failed ? runFailureText(result, steps, 'Publish failed') : null
            }));
            if (snapshot)
                setDrift(snapshot);
            return pending && !steps.some((st) => st.status === 'failed');
        }
        catch (e) {
            store.dispatch(Action.outboundRequest({
                op: 'publish',
                phase: 'done',
                error: errorText$1(e, 'Publish failed')
            }));
            return false;
        }
    }
    async function publishUntilSettled(resume) {
        let pending = await runPublish(resume);
        for (let i = 0; pending && i < AUTO_RESUME_TRIES; i++) {
            await delay(AUTO_RESUME_DELAY_MS);
            pending = await runPublish(true);
        }
    }
    async function saveAndPublishOutbound(publish = true) {
        const outbound = store.getState().outbound;
        store.dispatch(Action.outboundRequest({ op: 'save', phase: 'start' }));
        try {
            const result = (await wizardCall('wizardSaveOutbound', {
                noticeOn: outbound.noticeOn,
                noticeText: outbound.noticeText
            }));
            if (!result || result.ok !== true) {
                store.dispatch(Action.outboundRequest({
                    op: 'save',
                    phase: 'done',
                    error: failureText$1(result, 'Save failed')
                }));
                return;
            }
            const snapshot = toSnapshot(result);
            store.dispatch(Action.outboundRequest({ op: 'save', phase: 'done', snapshot }));
            setDrift(snapshot);
        }
        catch (e) {
            store.dispatch(Action.outboundRequest({
                op: 'save',
                phase: 'done',
                error: errorText$1(e, 'Save failed')
            }));
            return;
        }
        if (publish)
            await publishUntilSettled(false);
    }
    function resumePublishOutbound() {
        return publishUntilSettled(true);
    }
    async function unpublishOutbound() {
        store.dispatch(Action.outboundRequest({ op: 'unpublish', phase: 'start' }));
        try {
            const result = (await wizardCall('wizardUnpublishOutbound', {}));
            const steps = toSteps(result && result.steps);
            const snapshot = result && result.state ? toSnapshot(result.state) : undefined;
            const failed = !result || result.ok !== true;
            store.dispatch(Action.outboundRequest({
                op: 'unpublish',
                phase: 'done',
                snapshot,
                steps,
                error: failed ? runFailureText(result, steps, 'Unpublish failed') : null
            }));
            if (snapshot)
                setDrift(snapshot);
        }
        catch (e) {
            store.dispatch(Action.outboundRequest({
                op: 'unpublish',
                phase: 'done',
                error: errorText$1(e, 'Unpublish failed')
            }));
        }
    }

    const PHONE_STATUS_RECEIVING = { label: 'Receiving calls', color: '#14B981' };
    const PHONE_STATUS_NOT_RECEIVING = { label: 'Not receiving calls', color: '#F4C76A' };
    const PHONE_STATUS_OFFLINE = { label: 'Offline', color: '#9CA3AF' };
    const PHONE_STATUS_INBOUND_OFF = { label: 'Ready (inbound off)', color: '#14B981' };
    const phoneStatus = (row) => {
        if (!row || row.stale || row.state === 'offline' || !row.state)
            return PHONE_STATUS_OFFLINE;
        if (!row.incomingGranted)
            return PHONE_STATUS_INBOUND_OFF;
        if (row.state !== 'registered' || !row.canReceive)
            return PHONE_STATUS_NOT_RECEIVING;
        return PHONE_STATUS_RECEIVING;
    };
    const relativeTime = (iso, nowMs) => {
        const t = Date.parse(iso || '');
        if (isNaN(t))
            return 'Never';
        const sec = Math.max(0, Math.floor((nowMs - t) / 1000));
        if (sec < 60)
            return 'Just now';
        const min = Math.floor(sec / 60);
        if (min < 60)
            return min + ' min ago';
        const hr = Math.floor(min / 60);
        if (hr < 24)
            return hr + ' h ago';
        const days = Math.floor(hr / 24);
        return days + (days === 1 ? ' day ago' : ' days ago');
    };
    const exactTime = (iso) => {
        const t = Date.parse(iso || '');
        return isNaN(t) ? '' : new Date(t).toLocaleString();
    };
    const buildPhoneStatusCell = (row) => {
        const status = phoneStatus(row);
        return new component__namespace.StackPanel({
            items: [
                new component__namespace.Text({
                    text: '●',
                    rootStyle: { color: status.color },
                    rootAttributes: { 'aria-hidden': 'true' }
                }),
                new component__namespace.Text({ text: status.label })
            ],
            orientation: component__namespace.StackPanel.Orientation.HORIZONTAL,
            itemGap: component__namespace.StackPanel.GapSize.XS,
            alignment: component__namespace.StackPanel.Alignment.CENTER
        });
    };
    const buildLastSeenCell = (row, nowMs) => {
        const iso = (row && row.lastSeen) || '';
        const title = exactTime(iso);
        return new component__namespace.Text({
            text: relativeTime(iso, nowMs),
            type: component__namespace.Text.Type.WEAK,
            rootAttributes: title ? { title: title } : {}
        });
    };

    const formatPhone = (e164) => {
        const raw = String(e164 || '');
        const m = /^\+1([0-9]{3})([0-9]{3})([0-9]{4})$/.exec(raw);
        return m ? '+1 (' + m[1] + ') ' + m[2] + '-' + m[3] : raw;
    };

    const statusToBadge = (status) => {
        switch (status) {
            case 'pass': return { text: 'Pass', palette: { bg: '#D4EDDA', fg: '#155724', border: '#A3D9AE' } };
            case 'fail': return { text: 'Fail', palette: { bg: '#F8D7DA', fg: '#721C24', border: '#F1B5BB' } };
            case 'warn': return { text: 'Warn', palette: { bg: '#FFF3CD', fg: '#856404', border: '#FFE69C' } };
            case 'info_enabled': return { text: 'Enabled', palette: { bg: '#CCE5FF', fg: '#004085', border: '#9FCDFF' } };
            case 'info_disabled': return { text: 'Disabled', palette: { bg: '#E2E3E5', fg: '#383D41', border: '#C7CACE' } };
            case 'unknown': return { text: 'Not checked', palette: { bg: '#E2E3E5', fg: '#383D41', border: '#C7CACE' } };
            case 'not_published': return { text: 'Not published', palette: { bg: '#E2E3E5', fg: '#383D41', border: '#C7CACE' } };
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
    const voiceUrlDriftRow = (drift, outbound) => {
        const row = { label: 'TwiML VoiceUrl' };
        if (outbound.loaded && !outbound.published) {
            return { ...row, status: 'not_published', detail: '' };
        }
        if (outbound.functionExists === false) {
            return { ...row, status: 'fail', detail: outbound.functionMessage ||
                    'The outbound Function is missing in Twilio. Publish again.' };
        }
        if (drift.voiceUrl === 'pass')
            return { ...row, status: 'pass', detail: '' };
        if (drift.voiceUrl === 'fail') {
            return { ...row, status: 'fail', detail: 'Voice URL does not point at the published Function.' };
        }
        return { ...row, status: 'unknown', detail: '' };
    };
    const outboundVersionRow = (outbound) => {
        const row = { label: 'Outbound notice version' };
        if (!outbound.loaded)
            return { ...row, status: 'unknown', detail: '' };
        if (!outbound.published)
            return { ...row, status: 'not_published', detail: '' };
        if (outbound.needsRepublish) {
            return { ...row, status: 'warn', detail: 'A newer version is available. Republish on the Voice page.' };
        }
        return {
            ...row,
            status: 'pass',
            detail: outbound.publishedNoticeVersion ? 'Notice v' + outbound.publishedNoticeVersion : ''
        };
    };
    const phoneNumbersDriftRow = (c) => {
        const row = { label: 'Phone numbers' };
        const numbers = c.phonesNumbers;
        if (c.phonesListError) {
            return { ...row, status: 'unknown', detail: 'The Twilio number list did not load: ' + friendlyError(c.phonesListError) };
        }
        if (numbers === null || c.assignments === null) {
            return { ...row, status: 'unknown', detail: 'Open Phones & reps to check the numbers against Twilio.' };
        }
        const sids = {};
        const e164s = {};
        numbers.forEach((n) => {
            if (n.sid)
                sids[n.sid] = true;
            if (n.phoneNumber)
                e164s[n.phoneNumber] = true;
        });
        const missing = [];
        const snap = (c.snapshot || {});
        if (snap.phoneNumber && !e164s[snap.phoneNumber])
            missing.push(formatPhone(snap.phoneNumber));
        const seen = {};
        c.assignments.forEach((a) => {
            if (!a.phoneSid || seen[a.phoneSid])
                return;
            seen[a.phoneSid] = true;
            if (!sids[a.phoneSid])
                missing.push(formatPhone(a.phoneNumber) || a.phoneSid);
        });
        if (missing.length === 0) {
            return { ...row, status: 'pass', detail: 'The default caller ID and every assigned number are in Twilio.' };
        }
        if (c.phonesHasMore) {
            return { ...row, status: 'unknown', detail: 'Twilio lists more numbers than were loaded; not checked.' };
        }
        return { ...row, status: 'fail', detail: 'Not in the Twilio account: ' + missing.join(', ') };
    };
    const intelDriftRow = (c) => {
        const row = { label: 'Intelligence service' };
        const snap = (c.snapshot || {});
        if (c.snapshot && !snap.intelServiceSid) {
            return { ...row, status: 'info_disabled', detail: 'No Intelligence service is set (no transcripts).' };
        }
        const services = c.voiceLists.intelServices;
        if (c.voiceListErrors.intelServices || services === null || !snap.intelServiceSid) {
            return { ...row, status: 'unknown', detail: '' };
        }
        return services.some((sv) => sv.sid === snap.intelServiceSid)
            ? { ...row, status: 'pass', detail: '' }
            : { ...row, status: 'fail', detail: 'The saved service is not in the Twilio account.' };
    };
    class HealthChecks extends core.PureComponent {
        componentDidMount() {
            loadPresence();
            const outbound = store.getState().outbound;
            if (!outbound.loaded && !outbound.loading) {
                loadOutbound();
            }
        }
        buildPresenceColumns(nowMs) {
            const CT = component__namespace.DataGrid.ColumnType;
            return [
                {
                    type: CT.TEMPLATED,
                    name: 'rep',
                    label: 'Rep',
                    stretchFactor: 3,
                    content: (args) => new component__namespace.Text({
                        text: args?.cell?.row?.dataItem?.employeeName || '(unnamed rep)',
                        type: component__namespace.Text.Type.STRONG
                    })
                },
                {
                    type: CT.TEMPLATED,
                    name: 'status',
                    label: 'Status',
                    stretchFactor: 3,
                    content: (args) => buildPhoneStatusCell(args?.cell?.row?.dataItem)
                },
                {
                    type: CT.TEMPLATED,
                    name: 'lastSeen',
                    label: 'Last seen',
                    stretchFactor: 2,
                    content: (args) => buildLastSeenCell(args?.cell?.row?.dataItem, nowMs)
                }
            ];
        }
        buildPhonesContent(presence) {
            const content = [];
            const push = (node) => {
                content.push((jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: node })));
            };
            push(jsxRuntime.jsx(component__namespace.Heading, { level: 3, children: "Phones" }));
            if (presence.error) {
                push(jsxRuntime.jsx(ErrorText, { message: presence.error }));
            }
            if (!presence.loaded) {
                if (!presence.error) {
                    push(jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, children: "Loading phones\u2026" }));
                }
            }
            else if (presence.items.length === 0) {
                push(jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, children: "No reps have phones yet." }));
            }
            else {
                const nowMs = Date.now() + presence.clockSkewMs;
                push(new component__namespace.DataGrid({
                    dataSource: new core__namespace.ArrayDataSource(presence.items),
                    columns: this.buildPresenceColumns(nowMs),
                    columnStretch: true,
                    highlightRowsOnHover: true,
                    stripedRows: true,
                    dataRowHeight: 48,
                    headerRowHeight: 40,
                    rootStyle: { width: '100%' }
                }));
            }
            push(new component__namespace.Button({
                label: presence.loading ? 'Refreshing…' : 'Refresh',
                startIcon: core__namespace.SystemIcon.REFRESH,
                enabled: !presence.loading,
                action: () => { loadPresence(); }
            }));
            return content;
        }
        rerunPreflight = async () => {
            store.dispatch(Action.consolePatch({ preflightRefreshing: true, preflightError: null }));
            try {
                const payload = await wizardCall('wizardRunPreflight', {});
                const checks = payload && payload.checks;
                if (Array.isArray(checks)) {
                    store.dispatch(Action.consolePatch({ preflight: checks }));
                }
                else {
                    const p = (payload || {});
                    store.dispatch(Action.consolePatch({
                        preflightError: p.errorMessage || p.error || 'Preflight did not return any checks'
                    }));
                }
            }
            catch (e) {
                const err = e;
                store.dispatch(Action.consolePatch({
                    preflightError: 'Network: ' + (err.message || String(e))
                }));
            }
            finally {
                store.dispatch(Action.consolePatch({ preflightRefreshing: false }));
            }
        };
        buildCheckColumns() {
            const CT = component__namespace.DataGrid.ColumnType;
            const BdgType = component__namespace.Badge.Type;
            return [
                {
                    type: CT.TEMPLATED,
                    name: 'statusIcon',
                    label: '',
                    stretchFactor: 1,
                    content: (args) => {
                        const row = args?.cell?.row?.dataItem;
                        const status = row?.status || 'unknown';
                        const si = statusIcon(status);
                        return new component__namespace.Image({
                            image: si.icon,
                            size: component__namespace.Image.Size.M,
                            color: si.color,
                            presentation: true
                        });
                    }
                },
                {
                    type: CT.TEMPLATED,
                    name: 'check',
                    label: 'Check',
                    stretchFactor: 4,
                    content: (args) => {
                        const row = args?.cell?.row?.dataItem;
                        return new component__namespace.Text({
                            text: row?.label || '(unlabeled check)',
                            type: component__namespace.Text.Type.STRONG
                        });
                    }
                },
                {
                    type: CT.TEMPLATED,
                    name: 'detail',
                    label: 'Detail',
                    stretchFactor: 6,
                    content: (args) => {
                        const row = args?.cell?.row?.dataItem;
                        return new component__namespace.Text({
                            text: row?.detail || '—',
                            type: component__namespace.Text.Type.WEAK,
                            size: component__namespace.Text.Size.S
                        });
                    }
                },
                {
                    type: CT.TEMPLATED,
                    name: 'status',
                    label: 'Status',
                    stretchFactor: 2,
                    content: (args) => {
                        const row = args?.cell?.row?.dataItem;
                        const status = row?.status || 'unknown';
                        const sb = statusToBadge(status);
                        return new component__namespace.Badge({
                            content: sb.text,
                            type: BdgType.SUBTLE,
                            rootStyle: {
                                backgroundColor: sb.palette.bg,
                                color: sb.palette.fg,
                                border: '1px solid ' + sb.palette.border
                            }
                        });
                    }
                }
            ];
        }
        render() {
            const state = store.getState();
            const c = state.console;
            const preflight = c.preflight;
            const drift = (c.drift || {});
            const refreshing = !!c.preflightRefreshing || (c.loading && preflight === null);
            const driftRows = [
                voiceUrlDriftRow(drift, state.outbound),
                outboundVersionRow(state.outbound),
                phoneNumbersDriftRow(c),
                intelDriftRow(c)
            ];
            const columns = this.buildCheckColumns();
            const phonesContent = this.buildPhonesContent(state.presence);
            const preflightContent = [];
            preflightContent.push((jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Heading, { level: 3, children: "Preflight" }) })));
            if (c.preflightError) {
                preflightContent.push((jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(ErrorText, { message: 'Preflight did not run: ' + friendlyError(c.preflightError) }) })));
            }
            if (preflight === null || preflight === undefined) {
                preflightContent.push((jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, children: refreshing
                            ? 'Running preflight checks…'
                            : 'Click "Re-run preflight" to evaluate.' }) })));
            }
            else if (preflight.length === 0) {
                preflightContent.push((jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, children: "No checks returned." }) })));
            }
            else {
                const preflightDs = new core__namespace.ArrayDataSource(preflight);
                preflightContent.push((jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: new component__namespace.DataGrid({
                        dataSource: preflightDs,
                        columns,
                        columnStretch: true,
                        highlightRowsOnHover: true,
                        stripedRows: true,
                        dataRowHeight: 64,
                        headerRowHeight: 40,
                        rootStyle: { width: '100%' }
                    }) })));
            }
            preflightContent.push((jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Button, { label: refreshing ? 'Re-running…' : 'Re-run preflight', type: component__namespace.Button.Type.PRIMARY, startIcon: core__namespace.SystemIcon.REFRESH, enabled: !refreshing, action: () => { this.rerunPreflight(); }, rootStyle: {
                        backgroundColor: '#2D4458',
                        color: '#FFFFFF',
                        borderColor: '#2D4458'
                    } }) })));
            const driftContent = [];
            driftContent.push((jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Heading, { level: 3, children: "Drift detection" }) })));
            driftContent.push((jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, size: component__namespace.Text.Size.S, children: "Compares the saved wizard config against the live Twilio account. Re-runs each time the console mounts." }) })));
            const driftDs = new core__namespace.ArrayDataSource(driftRows);
            driftContent.push((jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: new component__namespace.DataGrid({
                    dataSource: driftDs,
                    columns,
                    columnStretch: true,
                    highlightRowsOnHover: true,
                    stripedRows: true,
                    dataRowHeight: 64,
                    headerRowHeight: 40,
                    rootStyle: { width: '100%' }
                }) })));
            const outerItems = [
                (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.S, children: preflightContent }) })),
                (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.S, children: driftContent }) })),
                (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.S, children: phonesContent }) })),
                c.actionError && (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.STRONG, children: '✕ ' + friendlyError(c.actionError) }) }))
            ].filter(Boolean);
            return (jsxRuntime.jsx(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.L, children: outerItems }));
        }
    }

    const buildFailedCheckLines = (checks) => checks
        .filter((c) => c && c.status !== 'pass')
        .map((c) => new component__namespace.Text({
        text: '✕ ' + (c.label || c.id || 'Check') +
            (c.detail ? ': ' + c.detail : '') +
            (c.repairHint ? ' → ' + c.repairHint : ''),
        size: component__namespace.Text.Size.S
    }));

    const toneToImageColor = (tone) => {
        switch (tone) {
            case 'success': return core__namespace.ImageConstant.Color.SUCCESS;
            case 'warning': return core__namespace.ImageConstant.Color.WARNING;
            case 'info': return core__namespace.ImageConstant.Color.INFO;
            case 'neutral': return core__namespace.ImageConstant.Color.NEUTRAL;
            default: return undefined;
        }
    };
    const buildIconedDescription = (props) => {
        const iconColor = toneToImageColor(props.tone);
        const icon = new component__namespace.Image({
            image: props.icon,
            size: component__namespace.Image.Size.S,
            color: iconColor,
            presentation: true
        });
        const descText = props.description
            ? new component__namespace.Text({
                text: props.description,
                type: component__namespace.Text.Type.WEAK,
                size: component__namespace.Text.Size.S
            })
            : null;
        const items = [
            icon,
            descText
        ].filter(Boolean);
        return new component__namespace.StackPanel({
            items,
            orientation: component__namespace.StackPanel.Orientation.HORIZONTAL,
            itemGap: component__namespace.StackPanel.GapSize.XS,
            alignment: component__namespace.StackPanel.Alignment.CENTER
        });
    };
    const buildStatCard = (props) => {
        try {
            const card = component__namespace.Card.metric({
                title: props.title,
                metric: props.metric,
                description: props.icon
                    ? buildIconedDescription(props)
                    : props.description
            });
            return card;
        }
        catch (e) {
            const titleText = new component__namespace.Text({
                text: props.title,
                type: component__namespace.Text.Type.WEAK,
                size: component__namespace.Text.Size.S
            });
            const metricText = new component__namespace.Text({
                text: props.metric,
                type: component__namespace.Text.Type.STRONG
            });
            const descText = props.description
                ? new component__namespace.Text({
                    text: props.description,
                    type: component__namespace.Text.Type.WEAK,
                    size: component__namespace.Text.Size.S
                })
                : null;
            const items = [titleText, metricText, descText].filter(Boolean);
            return new component__namespace.StackPanel({
                items,
                orientation: component__namespace.StackPanel.Orientation.VERTICAL,
                itemGap: component__namespace.StackPanel.GapSize.XXS
            });
        }
    };
    const StatCard = (props) => buildStatCard(props);
    class OverviewPage extends core.PureComponent {
        handleNav = (section) => goToSection(section);
        handleRequestDeactivate = () => { store.dispatch(Action.deactivateRequest()); };
        handleCancelDeactivate = () => { store.dispatch(Action.deactivateSuccess()); };
        handleDeactivate = () => { deactivate(); };
        handleReactivate = () => { reactivate('overview'); };
        renderActionErrors(c) {
            const out = [];
            if (c.deactivateError) {
                out.push(jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.STRONG, children: '✕ Deactivate failed: ' + friendlyError(c.deactivateError) }) }));
            }
            if (c.reactivateError && c.reactivateSource === 'overview') {
                out.push(jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.STRONG, children: '✕ Reactivate failed: ' + friendlyError(c.reactivateError) }) }));
                buildFailedCheckLines(c.reactivateFailedChecks).forEach((line) => {
                    out.push(jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: line }));
                });
            }
            return out;
        }
        render() {
            const state = store.getState();
            const c = state.console;
            const snap = (c.snapshot || {});
            const assignments = (c.assignments || []);
            const preflight = (c.preflight || []);
            const assignmentsPending = c.assignments === null;
            const preflightPending = c.preflight === null && c.loading;
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
            return (jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.L, children: [jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsxs(component__namespace.GridPanel, { columns: "1fr 1fr 1fr 1fr", rows: "auto", columnGap: component__namespace.GridPanel.GapSize.M, children: [jsxRuntime.jsx(component__namespace.GridPanel.Item, { children: jsxRuntime.jsx(StatCard, { title: "Status", metric: statusLabel, description: snap.active === false
                                            ? 'Reps cannot place calls'
                                            : 'Reps can place calls', icon: statusIcon, tone: statusTone }) }), jsxRuntime.jsx(component__namespace.GridPanel.Item, { children: jsxRuntime.jsx(StatCard, { title: "Phone numbers", metric: assignmentsPending ? '…' : String(phonesConfigured), description: assignmentsPending ? 'Loading…'
                                            : phonesConfigured === 0
                                                ? 'No numbers configured'
                                                : formatPhone(snap.phoneNumber) }) }), jsxRuntime.jsx(component__namespace.GridPanel.Item, { children: jsxRuntime.jsx(StatCard, { title: "Assigned reps", metric: assignmentsPending ? '…' : String(repCount), description: assignmentsPending ? 'Loading…'
                                            : repCount === 0
                                                ? 'No assignments'
                                                : (repCount === 1 ? '1 rep' : repCount + ' reps') }) }), jsxRuntime.jsx(component__namespace.GridPanel.Item, { children: jsxRuntime.jsx(StatCard, { title: "Preflight", metric: preflightPending ? '…'
                                            : preflightTotal > 0
                                                ? preflightPassed + ' of ' + preflightTotal
                                                : '—', description: preflightPending ? 'Running checks…'
                                            : preflightTotal > 0
                                                ? 'See checks below'
                                                : c.preflightError ? 'Did not run' : 'Not yet run' }) })] }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.S, rootStyle: {
                                border: '1px solid #E2E3E5',
                                borderRadius: '8px',
                                padding: '18px 22px',
                                background: '#FAFAFB'
                            }, children: [
                                (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, size: component__namespace.Text.Size.S, children: "Common admin tasks \u2014 full screens still available via the left rail." }) })),
                                (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.HORIZONTAL, itemGap: component__namespace.StackPanel.GapSize.S, children: [jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Button, { label: "Manage phone numbers", startIcon: core__namespace.SystemIcon.CALL, action: () => this.handleNav('phones') }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Button, { label: "Reassign reps", startIcon: core__namespace.SystemIcon.GROUPS, action: () => this.handleNav('phones') }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Button, { label: "Update voice config", startIcon: core__namespace.SystemIcon.SETTINGS, action: () => this.handleNav('voice') }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Button, { label: "API key rotation guide", startIcon: core__namespace.SystemIcon.LOCK, action: () => this.handleNav('credentials') }) }), snap.active === false ? (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Button, { label: c.reactivating ? 'Reactivating…' : 'Reactivate', type: component__namespace.Button.Type.PRIMARY, startIcon: core__namespace.SystemIcon.PLAY, enabled: !c.reactivating, action: this.handleReactivate }) })) : c.pendingDeactivateConfirm ? (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.HORIZONTAL, itemGap: component__namespace.StackPanel.GapSize.S, children: [jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Button, { label: "Cancel", enabled: !c.deactivating, action: this.handleCancelDeactivate }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Button, { label: c.deactivating ? 'Deactivating…' : 'Confirm deactivate', type: component__namespace.Button.Type.DANGER, startIcon: core__namespace.SystemIcon.STOP, enabled: !c.deactivating, action: this.handleDeactivate }) })] }) })) : (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Button, { label: "Deactivate", type: component__namespace.Button.Type.DANGER, startIcon: core__namespace.SystemIcon.STOP, action: this.handleRequestDeactivate }) }))] }) })),
                                ...this.renderActionErrors(c)
                            ] }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(HealthChecks, { tick: this.props.tick }) })] }));
        }
    }

    const truncSid = (sid) => {
        if (!sid)
            return '';
        if (sid.length <= 14)
            return sid;
        return sid.slice(0, 6) + '…' + sid.slice(-4);
    };
    const idOf = (v) => Number(v && typeof v === 'object' ? v.id : v);
    const toIds = (values) => (values || []).map(idOf).filter((n) => !isNaN(n) && n > 0);
    const CARD_STYLE = {
        border: '1px solid #E2E3E5',
        borderRadius: '8px',
        padding: '18px 22px',
        background: '#FAFAFB'
    };
    class PhonesPage extends core.PureComponent {
        componentDidMount() {
            const c = store.getState().console;
            if (c.phonesNumbers === null && !c.phonesLoading) {
                loadPhonesData();
            }
        }
        buildColumns(nameOf) {
            const CT = component__namespace.DataGrid.ColumnType;
            const BdgType = component__namespace.Badge.Type;
            const statusForRow = (row) => {
                const state = store.getState();
                if (state.console.phonesSavingSid === row.phoneSid) {
                    return {
                        icon: core__namespace.SystemIcon.STATUS_INFO_FILLED,
                        color: core__namespace.ImageConstant.Color.INFO,
                        label: 'Saving…'
                    };
                }
                if (row.employeeIds.length > 0) {
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
                            text: formatPhone(row?.phoneNumber) || '(unknown)',
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
                    type: CT.TEMPLATED,
                    name: 'reps',
                    label: 'Assigned reps',
                    stretchFactor: 4,
                    content: (args) => {
                        const row = args?.cell?.row?.dataItem;
                        const ids = row ? row.employeeIds : [];
                        if (ids.length === 0) {
                            return new component__namespace.Text({ text: '—', type: component__namespace.Text.Type.WEAK });
                        }
                        return new component__namespace.Text({ text: ids.map(nameOf).join(', ') });
                    }
                },
                {
                    type: CT.TEMPLATED,
                    name: 'rings',
                    label: 'Rings',
                    stretchFactor: 3,
                    content: (args) => {
                        const row = args?.cell?.row?.dataItem;
                        const primary = row ? rowValues(row, {}).primaryEmployeeId : null;
                        if (primary === null) {
                            return new component__namespace.Text({ text: '—', type: component__namespace.Text.Type.WEAK });
                        }
                        return new component__namespace.Text({ text: nameOf(primary) });
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
                },
                {
                    type: CT.TEMPLATED,
                    name: 'action',
                    label: '',
                    stretchFactor: 2,
                    content: (args) => {
                        const row = args?.cell?.row?.dataItem;
                        if (!row)
                            return new component__namespace.Text({ text: '' });
                        const c = store.getState().console;
                        return new component__namespace.Button({
                            label: 'Edit',
                            startIcon: core__namespace.SystemIcon.EDIT,
                            enabled: c.phonesSavingSid === null && c.phonesEditingSid !== row.phoneSid,
                            action: () => { openPhonesEditor(row.phoneSid); }
                        });
                    }
                }
            ];
        }
        renderEditor(row, employees, nameOf) {
            const c = store.getState().console;
            const values = rowValues(row, c.phonesDrafts);
            const savingThis = c.phonesSavingSid === row.phoneSid;
            const anySaving = c.phonesSavingSid !== null;
            const dirty = !!c.phonesDrafts[row.phoneSid];
            const rowError = c.phonesRowErrors[row.phoneSid];
            const selectedItems = values.employeeIds
                .map((id) => employees.find((e) => e.id === id) ||
                { id, name: nameOf(id) });
            const repsPicker = (jsxRuntime.jsx(component__namespace.MultiselectDropdown, { dataSource: new core__namespace.ArrayDataSource(employees), valueMember: "id", displayMember: "name", selectedItems: selectedItems, comparator: (l, r) => idOf(l) === idOf(r), placeholder: "Pick reps", enabled: !savingThis, onSelectionChanged: (args) => {
                    editPhonesRow(row.phoneSid, { employeeIds: toIds(args && args.values) });
                }, rootStyle: { width: '100%' } }));
            const ringOptions = values.employeeIds.map((id) => ({ id, name: nameOf(id) }));
            const ringsPicker = ringOptions.length === 0
                ? new component__namespace.Text({ text: 'Assign a rep first.', type: component__namespace.Text.Type.WEAK })
                : new component__namespace.Dropdown({
                    dataSource: new core__namespace.ArrayDataSource(ringOptions),
                    valueMember: 'id',
                    displayMember: 'name',
                    selectedValue: values.primaryEmployeeId,
                    enabled: !savingThis && ringOptions.length > 1,
                    onSelectionChanged: (sel) => {
                        const id = idOf(sel && sel.value);
                        if (!id || id === values.primaryEmployeeId)
                            return;
                        editPhonesRow(row.phoneSid, { primaryEmployeeId: id });
                    }
                });
            const buttons = new component__namespace.StackPanel({
                orientation: component__namespace.StackPanel.Orientation.HORIZONTAL,
                itemGap: component__namespace.StackPanel.GapSize.S,
                items: [
                    new component__namespace.Button({
                        label: savingThis ? 'Saving…' : 'Save',
                        type: component__namespace.Button.Type.PRIMARY,
                        enabled: dirty && !anySaving,
                        action: () => { savePhonesRow(row.phoneSid); }
                    }),
                    new component__namespace.Button({
                        label: 'Cancel',
                        enabled: !savingThis,
                        action: () => { cancelPhonesRow(row.phoneSid); }
                    })
                ]
            });
            const item = (node) => (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: node }));
            const label = (text) => item(jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.STRONG, children: text }));
            const items = [
                item(jsxRuntime.jsx(component__namespace.Heading, { level: 3, children: formatPhone(row.phoneNumber) + (row.friendlyName ? '  —  ' + row.friendlyName : '') })),
                label('Assigned reps'),
                item(repsPicker),
                label('Rings'),
                item(ringsPicker),
                item(jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, size: component__namespace.Text.Size.S, children: "Inbound calls to this number ring this rep, and this rep calls out from this number." })),
                item(buttons)
            ];
            if (rowError) {
                items.push(item(jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.STRONG, children: '✕ ' + friendlyError(rowError) })));
            }
            return (jsxRuntime.jsx(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.S, rootStyle: { ...CARD_STYLE, maxWidth: '640px' }, children: items }));
        }
        render() {
            const state = store.getState();
            const c = state.console;
            const employees = (c.phonesEmployees || [])
                .map((e) => ({ id: Number(e.id), name: e.name || '' }));
            const nameOf = (id) => employees.find((e) => e.id === id)?.name || ('Employee ' + id);
            const routingNumberErrors = c.phonesRoutingErrors.filter((e) => !!e.phoneNumber);
            const routingPublishErrors = c.phonesRoutingErrors.filter((e) => !e.phoneNumber);
            if (c.phonesByPhone === null && c.phonesLoading) {
                return (jsxRuntime.jsx(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.L, children: jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: new component__namespace.Loader({
                            label: 'Loading phones & reps…',
                            indeterminate: true
                        }) }) }));
            }
            const rows = (c.phonesByPhone || [])
                .map((r) => ({ ...r, employeeIds: r.employeeIds.slice() }));
            const editingRow = c.phonesEditingSid
                ? rows.find((r) => r.phoneSid === c.phonesEditingSid) || null
                : null;
            const refreshing = c.phonesLoading;
            const items = [
                (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.HORIZONTAL, itemGap: component__namespace.StackPanel.GapSize.S, children: jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Button, { label: refreshing ? 'Refreshing…' : 'Refresh from Twilio', startIcon: core__namespace.SystemIcon.REFRESH, enabled: !refreshing, action: () => { loadPhonesData(); } }) }) }) })),
                c.phonesListError && (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.STRONG, children: '✕ The Twilio phone numbers did not load: ' + friendlyError(c.phonesListError) +
                            ' Click "Refresh from Twilio" to try again.' }) })),
                c.phonesError && (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.STRONG, children: '✕ ' + friendlyError(c.phonesError) }) })),
                c.phonesHasMore && (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, size: component__namespace.Text.Size.S, children: "Only the first 100 Twilio numbers are shown." }) })),
                routingNumberErrors.length > 0 && (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.STRONG, size: component__namespace.Text.Size.S, children: '⚠ Inbound routing did not update for: ' +
                            routingNumberErrors.map((e) => formatPhone(e.phoneNumber)).join(', ') }) })),
                routingPublishErrors.length > 0 && (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.STRONG, size: component__namespace.Text.Size.S, children: '⚠ Inbound routing did not publish: ' +
                            routingPublishErrors.map((e) => e.message).join(' ') }) })),
                rows.length === 0 ? (!c.phonesListError && (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, children: "No phone numbers found in your Twilio account. Buy one in the Twilio Console, then click \"Refresh from Twilio\" to pick it up and assign reps." }) }))) : (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: new component__namespace.DataGrid({
                        dataSource: new core__namespace.ArrayDataSource(rows),
                        columns: this.buildColumns(nameOf),
                        columnStretch: true,
                        highlightRowsOnHover: true,
                        stripedRows: true,
                        dataRowHeight: 72,
                        headerRowHeight: 44,
                        rootStyle: { width: '100%' }
                    }) })),
                editingRow && (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: this.renderEditor(editingRow, employees, nameOf) }))
            ].filter(Boolean);
            return (jsxRuntime.jsx(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.XL, children: items }));
        }
    }

    const errorText = (e, fallback) => e instanceof Error && e.message ? e.message : fallback;
    const failureText = (result, fallback) => (result && (result.message || result.error)) || fallback;
    async function loadInbound() {
        store.dispatch(Action.inboundLoadStart());
        try {
            const result = (await wizardCall('wizardLoadInbound', {}));
            if (!result || result.ok !== true) {
                store.dispatch(Action.inboundLoadFailure(failureText(result, 'Could not load inbound settings')));
                return;
            }
            store.dispatch(Action.inboundLoadSuccess({
                inboundEnabled: result.inboundEnabled === true,
                ringSeconds: Number(result.ringSeconds) || 20,
                noAnswerMessage: result.noAnswerMessage || '',
                recordInbound: result.recordInbound !== false,
                recordingNoticeOn: result.recordingNoticeOn === true,
                recordingNotice: result.recordingNotice || '',
                voicemailOn: result.voicemailOn !== false,
                voicemailMaxSeconds: Number(result.voicemailMaxSeconds) || 120,
                fallbackOwnerId: result.fallbackOwnerId ? String(result.fallbackOwnerId) : '',
                employees: Array.isArray(result.employees)
                    ? result.employees.map((e) => ({ id: String(e.id), name: String(e.name || '') }))
                    : [],
                flowSid: result.flowSid || '',
                publishedAt: result.publishedAt || '',
                routes: Array.isArray(result.routes) ? result.routes : []
            }));
        }
        catch (e) {
            store.dispatch(Action.inboundLoadFailure(errorText(e, 'Could not load inbound settings')));
        }
    }
    async function saveInbound() {
        const inbound = store.getState().inbound;
        const settings = {
            inboundEnabled: inbound.inboundEnabled,
            ringSeconds: inbound.ringSeconds,
            noAnswerMessage: inbound.noAnswerMessage,
            recordInbound: inbound.recordInbound,
            recordingNoticeOn: inbound.recordingNoticeOn,
            recordingNotice: inbound.recordingNotice,
            voicemailOn: inbound.voicemailOn,
            voicemailMaxSeconds: inbound.voicemailMaxSeconds,
            fallbackOwnerId: inbound.fallbackOwnerId
        };
        store.dispatch(Action.inboundSave({ phase: 'start' }));
        try {
            const result = (await wizardCall('wizardSaveInbound', { ...settings }));
            if (!result || result.ok !== true) {
                store.dispatch(Action.inboundSave({
                    phase: 'failure',
                    error: failureText(result, 'Save failed')
                }));
                return;
            }
            store.dispatch(Action.inboundSave({
                phase: 'success',
                settings: result.settings || settings,
                publish: result.publish
            }));
        }
        catch (e) {
            store.dispatch(Action.inboundSave({ phase: 'failure', error: errorText(e, 'Save failed') }));
        }
    }
    async function publishRouting() {
        store.dispatch(Action.inboundPublish({ phase: 'start' }));
        try {
            const result = (await wizardCall('wizardPublishRouting', {}));
            if (!result || result.ok !== true) {
                store.dispatch(Action.inboundPublish({
                    phase: 'failure',
                    error: failureText(result, 'Publish failed')
                }));
                return;
            }
            store.dispatch(Action.inboundPublish({ phase: 'success', publish: result.publish }));
        }
        catch (e) {
            store.dispatch(Action.inboundPublish({ phase: 'failure', error: errorText(e, 'Publish failed') }));
        }
    }

    const DEFAULT_NO_ANSWER_MESSAGE = 'Sorry, no one is available to take your call. Please try again later. Goodbye.';
    const DEFAULT_VOICEMAIL_GREETING = 'Sorry, no one is available. Please leave a message after the tone.';
    const VOICEMAIL_SECONDS = [30, 60, 120, 180, 300];
    const NO_ANSWER_MAX_LENGTH = 300;
    const DEFAULT_RECORDING_NOTICE = 'This call may be recorded for quality and training.';
    const RECORDING_NOTICE_MAX_LENGTH = 300;
    const RING_SECONDS = [10, 15, 20, 25, 30, 45, 60];
    const OFF_STILL_ROUTED_WARNING = '⚠ Numbers still point at the flow; callers hear the no-answer message.';
    const voicemailLengthLabel = (seconds) => {
        if (seconds % 60 !== 0)
            return seconds + ' seconds';
        const minutes = seconds / 60;
        return minutes + (minutes === 1 ? ' minute' : ' minutes');
    };
    const publishFailureText = (inbound) => {
        const last = inbound.lastPublish;
        if (!last || last.ok || last.skipped)
            return '';
        return last.message || 'Routing was not published. Publish again.';
    };
    const statusLine = (inbound) => {
        const last = inbound.lastPublish;
        if (last && last.skipped === 'inbound_off') {
            return 'Inbound is off — routing not published';
        }
        if (!inbound.publishedAt)
            return 'Not published yet';
        const when = new Date(inbound.publishedAt);
        const whenText = isNaN(when.getTime()) ? inbound.publishedAt : when.toLocaleString();
        const count = last && last.ok && typeof last.numbersUpdated === 'number'
            ? ' · ' + last.numbersUpdated + (last.numbersUpdated === 1 ? ' number' : ' numbers')
            : '';
        return 'Published ' + whenText + count;
    };
    const item$1 = (node) => node ? jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: node }) : false;
    const vstack$1 = (gap, nodes) => (jsxRuntime.jsx(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: gap, children: nodes.map(item$1).filter(Boolean) }));
    const weak$1 = (text) => (jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, size: component__namespace.Text.Size.S, children: text }));
    class InboundPage extends core.PureComponent {
        componentDidMount() {
            const inbound = store.getState().inbound;
            if (!inbound.loaded && !inbound.loading) {
                loadInbound();
            }
            loadPresence();
        }
        buildColumns() {
            const CT = component__namespace.DataGrid.ColumnType;
            const presence = store.getState().presence;
            const byEmployee = {};
            presence.items.forEach((p) => { byEmployee[p.employeeId] = p; });
            return [
                {
                    type: CT.TEMPLATED,
                    name: 'number',
                    label: 'Number',
                    stretchFactor: 1,
                    content: (args) => new component__namespace.Text({
                        text: formatPhone(args?.cell?.row?.dataItem?.phoneNumber),
                        type: component__namespace.Text.Type.STRONG
                    })
                },
                {
                    type: CT.TEMPLATED,
                    name: 'rings',
                    label: 'Rings',
                    stretchFactor: 1,
                    content: (args) => new component__namespace.Text({
                        text: args?.cell?.row?.dataItem?.employeeName || ''
                    })
                },
                {
                    type: CT.TEMPLATED,
                    name: 'phone',
                    label: 'Phone',
                    stretchFactor: 1,
                    content: (args) => {
                        if (!presence.loaded) {
                            return new component__namespace.Text({
                                text: presence.error ? '—' : 'Loading…',
                                type: component__namespace.Text.Type.WEAK
                            });
                        }
                        const id = args?.cell?.row?.dataItem?.employeeId;
                        return buildPhoneStatusCell(id == null ? undefined : byEmployee[String(id)]);
                    }
                }
            ];
        }
        renderSettings(inbound) {
            const busy = inbound.saving || inbound.publishing;
            const ringOptions = RING_SECONDS.indexOf(inbound.ringSeconds) >= 0
                ? RING_SECONDS
                : RING_SECONDS.concat([inbound.ringSeconds]).sort((x, y) => x - y);
            const ringDs = new core__namespace.ArrayDataSource(ringOptions.map((n) => ({ value: n, label: n + ' seconds' })));
            const inboundSwitch = vstack$1(component__namespace.StackPanel.GapSize.XXS, [
                jsxRuntime.jsx(component__namespace.Switch, { label: "Ring reps in the browser", value: inbound.inboundEnabled, action: (args) => {
                        store.dispatch(Action.inboundFieldChange({ inboundEnabled: !!(args && args.value) }));
                    } }),
                !inbound.inboundEnabled && !inbound.flowSid &&
                    weak$1('Off: phones do not ring; callers hear the no-answer message.'),
                !inbound.inboundEnabled && !!inbound.flowSid &&
                    jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.STRONG, size: component__namespace.Text.Size.S, children: OFF_STILL_ROUTED_WARNING }),
                weak$1('Open phones pick up a change within an hour, or at once after a reload.')
            ]);
            const ringTime = vstack$1(component__namespace.StackPanel.GapSize.XXS, [
                jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.STRONG, children: "Ring time" }),
                jsxRuntime.jsx(component__namespace.Dropdown, { dataSource: ringDs, valueMember: "value", displayMember: "label", selectedValue: inbound.ringSeconds, onSelectionChanged: (args) => {
                        const n = Number(args && args.value);
                        if (n > 0)
                            store.dispatch(Action.inboundFieldChange({ ringSeconds: n }));
                    }, rootStyle: { width: '200px' } })
            ]);
            const message = vstack$1(component__namespace.StackPanel.GapSize.XXS, [
                jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.STRONG, children: "No-answer message" }),
                jsxRuntime.jsx(component__namespace.TextArea, { text: inbound.noAnswerMessage, placeholder: inbound.voicemailOn ? DEFAULT_VOICEMAIL_GREETING : DEFAULT_NO_ANSWER_MESSAGE, maxLength: NO_ANSWER_MAX_LENGTH, rowCount: 3, onTextChanged: (args) => {
                        store.dispatch(Action.inboundFieldChange({
                            noAnswerMessage: ((args && args.text) || '').slice(0, NO_ANSWER_MAX_LENGTH)
                        }));
                    }, rootStyle: { width: '100%' } })
            ]);
            const vmOptions = VOICEMAIL_SECONDS.indexOf(inbound.voicemailMaxSeconds) >= 0
                ? VOICEMAIL_SECONDS
                : VOICEMAIL_SECONDS.concat([inbound.voicemailMaxSeconds]).sort((x, y) => x - y);
            const vmDs = new core__namespace.ArrayDataSource(vmOptions.map((n) => ({ value: n, label: voicemailLengthLabel(n) })));
            const voicemail = vstack$1(component__namespace.StackPanel.GapSize.S, [
                vstack$1(component__namespace.StackPanel.GapSize.XXS, [
                    jsxRuntime.jsx(component__namespace.Switch, { label: "Voicemail", value: inbound.voicemailOn, action: (args) => {
                            store.dispatch(Action.inboundFieldChange({ voicemailOn: !!(args && args.value) }));
                        } }),
                    weak$1(inbound.voicemailOn
                        ? 'After the no-answer message, callers can leave a voicemail. It is transcribed and logged as a Phone Call.'
                        : 'Off: callers hear the no-answer message and the call ends.')
                ]),
                vstack$1(component__namespace.StackPanel.GapSize.XXS, [
                    jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.STRONG, children: "Longest voicemail" }),
                    jsxRuntime.jsx(component__namespace.Dropdown, { dataSource: vmDs, valueMember: "value", displayMember: "label", selectedValue: inbound.voicemailMaxSeconds, enabled: inbound.voicemailOn, onSelectionChanged: (args) => {
                            const n = Number(args && args.value);
                            if (n > 0)
                                store.dispatch(Action.inboundFieldChange({ voicemailMaxSeconds: n }));
                        }, rootStyle: { width: '200px' } })
                ])
            ]);
            const ownerChoices = [{ value: '', label: 'Not set' }].concat(inbound.employees.map((e) => ({ value: e.id, label: e.name })));
            const fallbackOwner = vstack$1(component__namespace.StackPanel.GapSize.XXS, [
                jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.STRONG, children: "Unrouted calls and voicemails go to" }),
                jsxRuntime.jsx(component__namespace.Dropdown, { dataSource: new core__namespace.ArrayDataSource(ownerChoices), valueMember: "value", displayMember: "label", selectedValue: inbound.fallbackOwnerId, onSelectionChanged: (args) => {
                        const v = args && args.value != null ? String(args.value) : '';
                        store.dispatch(Action.inboundFieldChange({ fallbackOwnerId: v }));
                    }, rootStyle: { width: '320px' } }),
                weak$1('Also used when a number has no rep, or its rep is inactive. Not set: those calls are not logged.')
            ]);
            const showNotice = inbound.recordInbound && inbound.recordingNoticeOn;
            const recording = vstack$1(component__namespace.StackPanel.GapSize.S, [
                jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.STRONG, children: "Recording" }),
                vstack$1(component__namespace.StackPanel.GapSize.XXS, [
                    jsxRuntime.jsx(component__namespace.Switch, { label: "Record inbound calls", value: inbound.recordInbound, action: (args) => {
                            store.dispatch(Action.inboundFieldChange({ recordInbound: !!(args && args.value) }));
                        } }),
                    weak$1('Recordings are transcribed and summarised like outbound calls.')
                ]),
                vstack$1(component__namespace.StackPanel.GapSize.XXS, [
                    jsxRuntime.jsx(component__namespace.Switch, { label: "Play a recording notice first", value: inbound.recordingNoticeOn, enabled: inbound.recordInbound, action: (args) => {
                            store.dispatch(Action.inboundFieldChange({ recordingNoticeOn: !!(args && args.value) }));
                        } }),
                    weak$1('Callers hear this before the phone rings.')
                ]),
                showNotice && vstack$1(component__namespace.StackPanel.GapSize.XXS, [
                    jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.STRONG, children: "Recording notice" }),
                    jsxRuntime.jsx(component__namespace.TextArea, { text: inbound.recordingNotice, placeholder: DEFAULT_RECORDING_NOTICE, maxLength: RECORDING_NOTICE_MAX_LENGTH, rowCount: 2, enabled: showNotice, onTextChanged: (args) => {
                            store.dispatch(Action.inboundFieldChange({
                                recordingNotice: ((args && args.text) || '').slice(0, RECORDING_NOTICE_MAX_LENGTH)
                            }));
                        }, rootStyle: { width: '100%' } })
                ])
            ]);
            const saveButton = new component__namespace.Button({
                label: inbound.saving ? 'Publishing…' : 'Save & publish',
                type: component__namespace.Button.Type.PRIMARY,
                enabled: !busy,
                action: () => { saveInbound(); }
            });
            const errors = (inbound.lastPublish && inbound.lastPublish.errors) || [];
            const failure = publishFailureText(inbound);
            return (jsxRuntime.jsx(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.L, rootStyle: { maxWidth: '560px' }, children: [
                    item$1(inboundSwitch),
                    item$1(ringTime),
                    item$1(message),
                    item$1(voicemail),
                    item$1(fallbackOwner),
                    item$1(recording),
                    item$1(saveButton),
                    item$1(inbound.saveError ? jsxRuntime.jsx(ErrorText, { message: friendlyError(inbound.saveError) }) : false),
                    item$1(vstack$1(component__namespace.StackPanel.GapSize.XXS, [
                        jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, children: statusLine(inbound) }),
                        failure && jsxRuntime.jsx(ErrorText, { message: failure }),
                        ...errors.map((e) => (jsxRuntime.jsx(ErrorText, { message: (e.phoneNumber ? formatPhone(e.phoneNumber) + ': ' : '') + e.message })))
                    ]))
                ].filter(Boolean) }));
        }
        renderRouting(inbound) {
            const busy = inbound.saving || inbound.publishing;
            const table = inbound.routes.length === 0
                ? jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, children: 'No numbers have reps yet. Assign reps on Phones & reps.' })
                : new component__namespace.DataGrid({
                    dataSource: new core__namespace.ArrayDataSource(inbound.routes),
                    columns: this.buildColumns(),
                    columnStretch: true,
                    highlightRowsOnHover: true,
                    stripedRows: true,
                    dataRowHeight: 48,
                    headerRowHeight: 40,
                    rootStyle: { width: '100%' }
                });
            return vstack$1(component__namespace.StackPanel.GapSize.S, [
                table,
                weak$1('The primary rep on Phones & reps is the one who rings.'),
                new component__namespace.Button({
                    label: inbound.publishing ? 'Publishing…' : 'Publish again',
                    enabled: !busy,
                    action: () => { publishRouting(); }
                })
            ]);
        }
        render() {
            const inbound = store.getState().inbound;
            const description = (jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, children: "Calls to your Twilio numbers ring the number's primary rep in the browser. NetSuite publishes one Twilio Studio flow for all numbers." }));
            if (inbound.loading || (!inbound.loaded && !inbound.loadError)) {
                return vstack$1(component__namespace.StackPanel.GapSize.L, [
                    description,
                    new component__namespace.Loader({
                        label: 'Loading inbound settings…',
                        indeterminate: true
                    })
                ]);
            }
            if (!inbound.loaded) {
                return vstack$1(component__namespace.StackPanel.GapSize.L, [
                    description,
                    jsxRuntime.jsx(ErrorText, { message: friendlyError(inbound.loadError || 'Could not load inbound settings') }),
                    new component__namespace.Button({
                        label: 'Retry',
                        startIcon: core__namespace.SystemIcon.REFRESH,
                        action: () => { loadInbound(); }
                    })
                ]);
            }
            return vstack$1(component__namespace.StackPanel.GapSize.XL, [
                description,
                this.renderSettings(inbound),
                this.renderRouting(inbound)
            ]);
        }
    }

    async function loadVoiceLists() {
        store.dispatch(Action.consolePatch({ voiceListsLoading: true, voiceListErrors: {} }));
        const fetchList = async (action) => {
            try {
                const r = (await wizardCall(action, {}));
                const items = (r && Array.isArray(r.items)) ? r.items : [];
                const error = r && (r.errorMessage || r.error);
                return error ? { items, error: String(error) } : { items };
            }
            catch (e) {
                return { items: [], error: e instanceof Error && e.message ? 'Network: ' + e.message : 'load_failed' };
            }
        };
        const [twiml, phones, intel] = await Promise.all([
            fetchList('wizardListTwiMLApps'),
            fetchList('wizardListPhoneNumbers'),
            fetchList('wizardListIntelServices')
        ]);
        const voiceListErrors = {};
        if (twiml.error)
            voiceListErrors.twimlApps = twiml.error;
        if (phones.error)
            voiceListErrors.phoneNumbers = phones.error;
        if (intel.error)
            voiceListErrors.intelServices = intel.error;
        store.dispatch(Action.consolePatch({
            voiceLists: {
                twimlApps: twiml.items,
                phoneNumbers: phones.items,
                intelServices: intel.items
            },
            voiceListErrors,
            voiceListsLoading: false
        }));
    }
    async function saveVoiceField(field, value) {
        store.dispatch(Action.voiceFieldSave({ phase: 'start' }));
        const payload = { partial: true };
        payload[field] = value;
        if (field === 'intelServiceSid' && !value)
            payload.clearIntelService = true;
        try {
            const result = await wizardCall('wizardSaveVoice', payload);
            const saved = result && (result.saved === true);
            if (!saved) {
                const r = (result || {});
                const err = r.errorMessage || r.error || 'Voice save failed';
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

    const CONSENT_TEXT = 'Publishing creates a Twilio Function named ctc-outbound in your Twilio ' +
        'account and points your TwiML App\'s Voice URL at it. Your current ' +
        'Voice URL is saved so you can restore it.';
    const REPUBLISH_WARNING = 'A newer version is available. Republish to update.';
    const NOTICE_OFF_PUBLISHED_NOTE = 'The Function stays in place; calls connect without a notice. Use ' +
        'Unpublish and remove to restore your previous Voice URL.';
    const VOICE_URL_WARNING = 'Your TwiML App\'s Voice URL no longer points at the published Function.';
    const STEP_STATUS = {
        ok: { check: 'pass', text: 'Done' },
        skipped: { check: 'info_disabled', text: 'Skipped' },
        failed: { check: 'fail', text: 'Failed' },
        pending: { check: 'info_enabled', text: 'Pending' }
    };
    const outboundStatusLine = (outbound) => {
        if (!outbound.published)
            return 'Not published yet';
        const live = outbound.publishedNoticeVersion
            ? 'notice v' + outbound.publishedNoticeVersion
            : 'no notice';
        if (outbound.changesPending)
            return 'Live: ' + live + ' · Saved changes not published yet';
        const when = new Date(outbound.publishedAt);
        const whenText = !outbound.publishedAt
            ? ''
            : isNaN(when.getTime()) ? outbound.publishedAt : when.toLocaleString();
        return 'Published' + (whenText ? ' ' + whenText : '') +
            (outbound.publishedNoticeVersion ? ' · notice v' + outbound.publishedNoticeVersion : '');
    };
    const item = (node) => node ? jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: node }) : false;
    const vstack = (gap, nodes) => (jsxRuntime.jsx(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: gap, children: nodes.map(item).filter(Boolean) }));
    const hstack = (nodes) => (jsxRuntime.jsx(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.HORIZONTAL, itemGap: component__namespace.StackPanel.GapSize.S, children: nodes.map(item).filter(Boolean) }));
    const weak = (text) => (jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, size: component__namespace.Text.Size.S, children: text }));
    const stepRow = (step) => {
        const s = STEP_STATUS[step.status];
        return (jsxRuntime.jsx(CheckRow, { check: {
                label: step.label + ' — ' + s.text,
                status: s.check,
                detail: step.status === 'failed' ? step.detail : undefined
            } }));
    };
    class OutboundNotice extends core.PureComponent {
        componentDidMount() {
            const outbound = store.getState().outbound;
            if (!outbound.loaded && !outbound.loading) {
                loadOutbound();
            }
        }
        renderButtons(outbound, busy) {
            const saveOnly = !outbound.noticeOn && !outbound.published;
            const working = outbound.saving || outbound.publishing;
            const saveButton = new component__namespace.Button({
                label: saveOnly
                    ? (working ? 'Saving…' : 'Save')
                    : (working ? 'Publishing…' : 'Save & publish'),
                type: component__namespace.Button.Type.PRIMARY,
                enabled: !busy,
                action: () => { saveAndPublishOutbound(!saveOnly); }
            });
            if (!outbound.published)
                return hstack([saveButton]);
            if (outbound.confirmUnpublish) {
                return vstack(component__namespace.StackPanel.GapSize.XXS, [
                    weak('This restores the previous Voice URL and deletes the Function.'),
                    hstack([
                        jsxRuntime.jsx(component__namespace.Button, { label: "Cancel", enabled: !busy, action: () => { store.dispatch(Action.outboundConfirmUnpublish(false)); } }),
                        jsxRuntime.jsx(component__namespace.Button, { label: "Confirm unpublish", type: component__namespace.Button.Type.DANGER, enabled: !busy, action: () => { unpublishOutbound(); } })
                    ])
                ]);
            }
            return hstack([
                saveButton,
                jsxRuntime.jsx(component__namespace.Button, { label: outbound.unpublishing ? 'Unpublishing…' : 'Unpublish and remove', type: component__namespace.Button.Type.DANGER, enabled: !busy, action: () => { store.dispatch(Action.outboundConfirmUnpublish(true)); } })
            ]);
        }
        renderSettings(outbound) {
            const busy = outbound.saving || outbound.publishing || outbound.unpublishing;
            const max = outbound.maxLength;
            const steps = outbound.steps || [];
            const noticeSwitch = vstack(component__namespace.StackPanel.GapSize.XXS, [
                jsxRuntime.jsx(component__namespace.Switch, { label: "Play a recording notice on outbound calls", value: outbound.noticeOn, enabled: !busy, action: (args) => {
                        store.dispatch(Action.outboundFieldChange({ noticeOn: !!(args && args.value) }));
                    } }),
                weak('The person you call hears this after they answer, before the call ' +
                    'connects and before recording starts.')
            ]);
            const noticeText = outbound.noticeOn && vstack(component__namespace.StackPanel.GapSize.XXS, [
                jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.STRONG, children: "Notice" }),
                jsxRuntime.jsx(component__namespace.TextArea, { text: outbound.noticeText, placeholder: outbound.defaultText, maxLength: max, rowCount: 2, enabled: !busy, onTextChanged: (args) => {
                        store.dispatch(Action.outboundFieldChange({
                            noticeText: ((args && args.text) || '').slice(0, max)
                        }));
                    }, rootStyle: { width: '100%' } }),
                weak(outbound.noticeText.length + ' / ' + max + ' characters'),
                weak('Have your legal counsel approve the wording.')
            ]);
            const pending = outbound.pending && !outbound.publishing && vstack(component__namespace.StackPanel.GapSize.XXS, [
                jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, children: 'Publishing… the Twilio build is still running' }),
                new component__namespace.Button({
                    label: 'Check again',
                    startIcon: core__namespace.SystemIcon.REFRESH,
                    enabled: !busy,
                    action: () => { resumePublishOutbound(); }
                })
            ]);
            const status = vstack(component__namespace.StackPanel.GapSize.XXS, [
                jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, children: outboundStatusLine(outbound) }),
                outbound.published && !!outbound.functionUrl &&
                    weak('Function URL: ' + outbound.functionUrl),
                outbound.published && outbound.needsRepublish &&
                    jsxRuntime.jsx(CheckRow, { check: { label: REPUBLISH_WARNING, status: 'warn' } }),
                outbound.published && outbound.voiceUrlMatches === false &&
                    jsxRuntime.jsx(CheckRow, { check: { label: VOICE_URL_WARNING, status: 'warn' } })
            ]);
            return (jsxRuntime.jsx(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.L, rootStyle: { maxWidth: '560px' }, children: [
                    item(noticeSwitch),
                    item(noticeText),
                    item(!outbound.published && outbound.noticeOn && weak(CONSENT_TEXT)),
                    item(outbound.published && !outbound.noticeOn && weak(NOTICE_OFF_PUBLISHED_NOTE)),
                    item(this.renderButtons(outbound, busy)),
                    item(outbound.error ? jsxRuntime.jsx(ErrorText, { message: outbound.error }) : false),
                    item(pending),
                    item(steps.length > 0 && vstack(component__namespace.StackPanel.GapSize.XS, steps.map(stepRow))),
                    item(status)
                ].filter(Boolean) }));
        }
        render() {
            const outbound = store.getState().outbound;
            const heading = jsxRuntime.jsx(component__namespace.Heading, { level: 3, children: "Outbound recording notice" });
            if (outbound.loading || (!outbound.loaded && !outbound.loadError)) {
                return vstack(component__namespace.StackPanel.GapSize.S, [
                    heading,
                    new component__namespace.Loader({
                        label: 'Loading recording notice…',
                        indeterminate: true
                    })
                ]);
            }
            if (!outbound.loaded) {
                return vstack(component__namespace.StackPanel.GapSize.S, [
                    heading,
                    jsxRuntime.jsx(ErrorText, { message: outbound.loadError || 'Could not load the outbound recording notice' }),
                    new component__namespace.Button({
                        label: 'Retry',
                        startIcon: core__namespace.SystemIcon.REFRESH,
                        action: () => { loadOutbound(); }
                    })
                ]);
            }
            return vstack(component__namespace.StackPanel.GapSize.S, [
                heading,
                this.renderSettings(outbound)
            ]);
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
            helpText: 'Outbound calls use this app. When you publish the recording ' +
                'notice, the wizard points its Voice URL at a Twilio Function in your account.',
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
    const handleEdit = (spec) => {
        const state = store.getState();
        const snap = (state.console.snapshot || {});
        const current = snap[spec.field] || '';
        store.dispatch(Action.voiceFieldEdit(spec.field, current));
        loadVoiceLists();
    };
    const handleCancel = () => {
        store.dispatch(Action.voiceFieldEdit(null, null));
    };
    const handlePendingChange = (args) => {
        const value = (args && args.value) || null;
        const state = store.getState();
        store.dispatch(Action.voiceFieldEdit(state.console.voiceEditing, value));
    };
    const optionsFor = (field, list) => list.map((it) => {
        if (field === 'phoneNumber') {
            return {
                value: it.phoneNumber || '',
                label: formatPhone(it.phoneNumber) +
                    (it.friendlyName ? '  —  ' + it.friendlyName : '')
            };
        }
        return {
            value: it.sid || '',
            label: (it.friendlyName || '(unnamed)') +
                (it.sid ? '  [' + it.sid + ']' : '')
        };
    });
    const effectiveValue = (spec, options, pending) => {
        if (pending && options.some((o) => o.value === pending))
            return pending;
        if (spec.allowEmpty)
            return null;
        return options.length > 0 ? options[0].value : null;
    };
    const handleSave = (spec) => {
        const c = store.getState().console;
        const list = c.voiceLists[listKeyFor(spec.field)];
        if (!list)
            return;
        const value = effectiveValue(spec, optionsFor(spec.field, list), c.voicePendingValue);
        if (value) {
            saveVoiceField(spec.field, value);
        }
        else if (spec.allowEmpty) {
            saveVoiceField(spec.field, '');
        }
    };
    class VoicePage extends core.PureComponent {
        buildColumns() {
            const CT = component__namespace.DataGrid.ColumnType;
            return [
                {
                    type: CT.TEMPLATED,
                    name: 'field',
                    label: 'Field',
                    stretchFactor: 2,
                    content: (args) => {
                        const row = args?.cell?.row?.dataItem;
                        return new component__namespace.Text({
                            text: row?.label || '',
                            type: component__namespace.Text.Type.STRONG
                        });
                    }
                },
                {
                    type: CT.TEMPLATED,
                    name: 'docs',
                    label: 'Docs',
                    stretchFactor: 1,
                    content: (args) => {
                        const row = args?.cell?.row?.dataItem;
                        if (!row?.docUrl)
                            return new component__namespace.Text({ text: '' });
                        return new component__namespace.Link({
                            content: 'Twilio docs ↗',
                            url: row.docUrl,
                            target: component__namespace.Link.Target.BLANK
                        });
                    }
                },
                {
                    type: CT.TEMPLATED,
                    name: 'description',
                    label: 'Description',
                    stretchFactor: 3,
                    content: (args) => {
                        const row = args?.cell?.row?.dataItem;
                        return new component__namespace.Text({
                            text: row?.helpText || '',
                            type: component__namespace.Text.Type.WEAK,
                            size: component__namespace.Text.Size.S
                        });
                    }
                },
                {
                    type: CT.TEMPLATED,
                    name: 'value',
                    label: 'Current value',
                    stretchFactor: 3,
                    content: (args) => {
                        const row = args?.cell?.row?.dataItem;
                        if (!row)
                            return new component__namespace.Text({ text: '' });
                        const state = store.getState();
                        const c = state.console;
                        const snap = (c.snapshot || {});
                        const isEditing = c.voiceEditing === row.field;
                        if (!isEditing) {
                            const value = snap[row.field];
                            if (value) {
                                return new component__namespace.Text({
                                    text: row.field === 'phoneNumber' ? formatPhone(value) : value
                                });
                            }
                            return new component__namespace.Text({
                                text: '(not configured)',
                                type: component__namespace.Text.Type.WEAK
                            });
                        }
                        const listKey = listKeyFor(row.field);
                        const list = c.voiceLists[listKey];
                        if (list === null || c.voiceListsLoading) {
                            return new component__namespace.Loader({
                                label: 'Loading from Twilio…',
                                indeterminate: true
                            });
                        }
                        const listError = c.voiceListErrors[listKey];
                        if (listError) {
                            return new component__namespace.Text({
                                text: '✕ The Twilio list did not load: ' + friendlyError(listError),
                                type: component__namespace.Text.Type.STRONG,
                                size: component__namespace.Text.Size.S
                            });
                        }
                        if (list.length === 0) {
                            return new component__namespace.Text({
                                text: '(no items found in Twilio for this account)',
                                type: component__namespace.Text.Type.WEAK
                            });
                        }
                        const normalized = optionsFor(row.field, list);
                        const ds = new core__namespace.ArrayDataSource(normalized);
                        return new component__namespace.Dropdown({
                            dataSource: ds,
                            valueMember: 'value',
                            displayMember: 'label',
                            selectedValue: effectiveValue(row, normalized, c.voicePendingValue),
                            allowEmpty: !!row.allowEmpty,
                            placeholder: row.allowEmpty ? '(none)' : 'Select…',
                            onSelectionChanged: handlePendingChange
                        });
                    }
                },
                {
                    type: CT.TEMPLATED,
                    name: 'action',
                    label: 'Action',
                    stretchFactor: 2,
                    content: (args) => {
                        const row = args?.cell?.row?.dataItem;
                        if (!row)
                            return new component__namespace.Text({ text: '' });
                        const state = store.getState();
                        const c = state.console;
                        const isEditing = c.voiceEditing === row.field;
                        if (!isEditing) {
                            return new component__namespace.Button({
                                label: 'Change',
                                action: () => { handleEdit(row); }
                            });
                        }
                        const listKey = listKeyFor(row.field);
                        const list = c.voiceLists[listKey];
                        const saving = c.voiceSaving;
                        if (list === null || c.voiceListsLoading) {
                            return new component__namespace.Button({
                                label: 'Cancel',
                                action: handleCancel
                            });
                        }
                        if (c.voiceListErrors[listKey]) {
                            return new component__namespace.StackPanel({
                                orientation: component__namespace.StackPanel.Orientation.HORIZONTAL,
                                itemGap: component__namespace.StackPanel.GapSize.S,
                                items: [
                                    new component__namespace.Button({
                                        label: 'Retry',
                                        startIcon: core__namespace.SystemIcon.REFRESH,
                                        action: () => { loadVoiceLists(); }
                                    }),
                                    new component__namespace.Button({
                                        label: 'Cancel',
                                        action: handleCancel
                                    })
                                ]
                            });
                        }
                        if (list.length === 0) {
                            return new component__namespace.Button({
                                label: 'Cancel',
                                action: handleCancel
                            });
                        }
                        const saveBtn = new component__namespace.Button({
                            label: saving ? 'Saving…' : 'Save',
                            type: component__namespace.Button.Type.PRIMARY,
                            enabled: !saving,
                            action: () => { handleSave(row); }
                        });
                        const cancelBtn = new component__namespace.Button({
                            label: 'Cancel',
                            enabled: !saving,
                            action: handleCancel
                        });
                        return new component__namespace.StackPanel({
                            orientation: component__namespace.StackPanel.Orientation.HORIZONTAL,
                            itemGap: component__namespace.StackPanel.GapSize.S,
                            items: [saveBtn, cancelBtn]
                        });
                    }
                }
            ];
        }
        render() {
            const state = store.getState();
            const c = state.console;
            const columns = this.buildColumns();
            const rowsDs = new core__namespace.ArrayDataSource(FIELD_SPECS);
            const items = [
                (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, children: "Manage TwiML application, default outbound caller-ID number, and optional Conversational Intelligence service. Changes save immediately and apply to the next call placed." }) })),
                c.voiceError && (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.STRONG, children: '✕ ' + friendlyError(c.voiceError) }) })),
                (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: new component__namespace.DataGrid({
                        dataSource: rowsDs,
                        columns,
                        columnStretch: true,
                        highlightRowsOnHover: true,
                        stripedRows: true,
                        dataRowHeight: 80,
                        headerRowHeight: 40,
                        rootStyle: { width: '100%' }
                    }) })),
                (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(OutboundNotice, { tick: this.props.tick }) }))
            ].filter(Boolean);
            return (jsxRuntime.jsx(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.L, children: items }));
        }
    }

    function startCredentialsEdit() {
        const snap = (store.getState().console.snapshot || {});
        store.dispatch(Action.credentialsUpdate({
            editing: true,
            apiKeySid: snap.apiKeySid || '',
            apiSecretId: snap.apiSecretId || '',
            error: null,
            failedChecks: [],
            saved: false
        }));
    }
    function cancelCredentialsEdit() {
        if (store.getState().credentials.saving)
            return;
        store.dispatch(Action.credentialsUpdate({
            editing: false, error: null, failedChecks: []
        }));
    }
    async function saveCredentials() {
        const creds = store.getState().credentials;
        if (creds.saving)
            return;
        store.dispatch(Action.credentialsUpdate({ saving: true, error: null, failedChecks: [], saved: false }));
        try {
            const result = (await wizardCall('wizardSaveCredentials', {
                apiKeySid: creds.apiKeySid.trim(),
                apiSecretId: creds.apiSecretId.trim()
            }));
            if (!result || result.saved !== true) {
                const checks = (result && Array.isArray(result.checks)) ? result.checks : [];
                store.dispatch(Action.credentialsUpdate({
                    saving: false,
                    error: (result && (result.errorMessage || result.error)) || 'save_failed',
                    failedChecks: checks.filter((c) => c.status !== 'pass')
                }));
                return;
            }
            const snap = store.getState().console.snapshot;
            store.dispatch(Action.consolePatch({
                snapshot: {
                    ...(snap || {}),
                    apiKeySid: result.apiKeySid || creds.apiKeySid.trim(),
                    apiSecretId: result.apiSecretId || creds.apiSecretId.trim()
                }
            }));
            store.dispatch(Action.credentialsUpdate({
                saving: false, editing: false, error: null, failedChecks: [], saved: true
            }));
        }
        catch (e) {
            store.dispatch(Action.credentialsUpdate({
                saving: false,
                error: e instanceof Error && e.message ? 'Network: ' + e.message : 'save_failed'
            }));
        }
    }

    const TWILIO_CREDS_DOCS = {
        accountSid: 'https://www.twilio.com/docs/iam/api/account',
        apiKeySid: 'https://www.twilio.com/docs/iam/api-keys',
        apiSecret: 'https://www.twilio.com/docs/iam/api-keys'
    };
    class CredentialsPage extends core.PureComponent {
        handleOpenSecrets = () => {
            try {
                window.open('/app/common/scripting/secrets/settings.nl', '_blank');
            }
            catch (e) { }
        };
        renderChangeForm(creds) {
            const item = (node) => (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: node }));
            if (!creds.editing) {
                const out = [];
                if (creds.saved) {
                    out.push(item(jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.STRONG, children: "\u2713 Saved. The connection test passed with the new API key." })));
                }
                out.push(item(new component__namespace.Button({
                    label: 'Change API key',
                    startIcon: core__namespace.SystemIcon.EDIT,
                    action: () => { startCredentialsEdit(); }
                })));
                return out;
            }
            const field = (label, value, placeholder, key) => [
                (jsxRuntime.jsx(component__namespace.GridPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.STRONG, children: label }) })),
                (jsxRuntime.jsx(component__namespace.GridPanel.Item, { children: jsxRuntime.jsx(component__namespace.TextBox, { text: value, placeholder: placeholder, enabled: !creds.saving, onTextChanged: (args) => {
                            store.dispatch(Action.credentialsUpdate({ [key]: (args && args.text) || '' }));
                        }, rootStyle: { width: '100%' } }) }))
            ];
            const out = [
                item(jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, size: component__namespace.Text.Size.S, children: "Enter the new key's SID and the script ID of the NetSuite API Secret that holds its secret. Click-to-Call tests the connection with the new values first. If the test fails, nothing is saved and the current key stays in use." })),
                item(jsxRuntime.jsx(component__namespace.GridPanel, { columns: "220px 1fr", rows: "auto auto", columnGap: component__namespace.GridPanel.GapSize.M, rowGap: component__namespace.GridPanel.GapSize.S, rootStyle: { maxWidth: '640px' }, children: [
                        ...field('New API Key SID', creds.apiKeySid, 'SK…', 'apiKeySid'),
                        ...field('New API Key Secret script ID', creds.apiSecretId, 'custsecret_…', 'apiSecretId')
                    ] })),
                item(new component__namespace.StackPanel({
                    orientation: component__namespace.StackPanel.Orientation.HORIZONTAL,
                    itemGap: component__namespace.StackPanel.GapSize.S,
                    items: [
                        new component__namespace.Button({
                            label: creds.saving ? 'Testing connection…' : 'Test and save',
                            type: component__namespace.Button.Type.PRIMARY,
                            enabled: !creds.saving &&
                                creds.apiKeySid.trim() !== '' && creds.apiSecretId.trim() !== '',
                            action: () => { saveCredentials(); }
                        }),
                        new component__namespace.Button({
                            label: 'Cancel',
                            enabled: !creds.saving,
                            action: () => { cancelCredentialsEdit(); }
                        })
                    ]
                }))
            ];
            if (creds.error) {
                out.push(item(jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.STRONG, children: '✕ ' + friendlyError(creds.error) })));
                buildFailedCheckLines(creds.failedChecks).forEach((line) => { out.push(item(line)); });
            }
            return out;
        }
        buildColumns() {
            const CT = component__namespace.DataGrid.ColumnType;
            return [
                {
                    type: CT.TEMPLATED,
                    name: 'field',
                    label: 'Field',
                    stretchFactor: 2,
                    content: (args) => {
                        const row = args?.cell?.row?.dataItem;
                        return new component__namespace.Text({
                            text: row?.label || '',
                            type: component__namespace.Text.Type.STRONG
                        });
                    }
                },
                {
                    type: CT.TEMPLATED,
                    name: 'docs',
                    label: 'Docs',
                    stretchFactor: 1,
                    content: (args) => {
                        const row = args?.cell?.row?.dataItem;
                        if (!row?.docUrl)
                            return new component__namespace.Text({ text: '' });
                        return new component__namespace.Link({
                            content: 'Twilio docs ↗',
                            url: row.docUrl,
                            target: component__namespace.Link.Target.BLANK
                        });
                    }
                },
                {
                    type: CT.TEMPLATED,
                    name: 'description',
                    label: 'Description',
                    stretchFactor: 4,
                    content: (args) => {
                        const row = args?.cell?.row?.dataItem;
                        return new component__namespace.Text({
                            text: row?.help || '',
                            type: component__namespace.Text.Type.WEAK,
                            size: component__namespace.Text.Size.S
                        });
                    }
                },
                {
                    type: CT.TEMPLATED,
                    name: 'value',
                    label: 'Value',
                    stretchFactor: 3,
                    content: (args) => {
                        const row = args?.cell?.row?.dataItem;
                        if (row?.value) {
                            return new component__namespace.Text({ text: row.value });
                        }
                        return new component__namespace.Text({
                            text: '(not configured)',
                            type: component__namespace.Text.Type.WEAK
                        });
                    }
                }
            ];
        }
        render() {
            const state = store.getState();
            const snap = (state.console.snapshot || {});
            const changeForm = (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.S, children: this.renderChangeForm(state.credentials) }) }));
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
            const columns = this.buildColumns();
            const rowsDs = new core__namespace.ArrayDataSource(rows);
            const openSecretsButton = (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Button, { label: "Open NetSuite API Secrets", type: component__namespace.Button.Type.PRIMARY, startIcon: core__namespace.SystemIcon.LOCK, action: this.handleOpenSecrets, rootStyle: {
                        backgroundColor: '#2D4458',
                        color: '#FFFFFF',
                        borderColor: '#2D4458'
                    } }) }));
            const items = [
                (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, children: "The Account SID + API Key SID are public identifiers \u2014 they're safe to display here. The actual API Secret value is held opaque by NetSuite's API Secrets vault (Setup > Company > API Secrets) and never travels through the SPA." }) })),
                (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: new component__namespace.DataGrid({
                        dataSource: rowsDs,
                        columns,
                        columnStretch: true,
                        highlightRowsOnHover: true,
                        stripedRows: true,
                        dataRowHeight: 64,
                        headerRowHeight: 40,
                        rootStyle: { width: '100%' }
                    }) })),
                changeForm,
                openSecretsButton,
                (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.XS, rootStyle: {
                            padding: '12px 16px',
                            border: '1px solid #E2E3E5',
                            borderRadius: '4px',
                            background: '#F7F8F9'
                        }, children: [jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.STRONG, children: "API key rotation guide" }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { size: component__namespace.Text.Size.S, children: '1. In the Twilio Console (Account › API keys & tokens), create a new Standard API key. Copy its secret at once: Twilio shows a key\'s secret only when you create the key, and you cannot change the secret of an existing key.' }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { size: component__namespace.Text.Size.S, children: '2. In NetSuite (Setup › Company › API Secrets), create a new secret with that value. Give it the same allowed scripts and allowed domains as the current secret. The allowed scripts must include CTC Setup Wizard API, CTC Token Generator and CTC Poll Transcripts: NetSuite does not let a script read this list, so the test cannot check it for the other two. Note its script ID (custsecret_…).' }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { size: component__namespace.Text.Size.S, children: '3. On this page, click "Change API key". Enter the new API Key SID (SK…, a new SID) and the new secret\'s script ID, then click "Test and save". If the test fails, the current key stays in use.' }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { size: component__namespace.Text.Size.S, children: '4. Reload phone mode, then place a test call. A phone that stays open keeps its old-key token until it renews (up to 1 hour).' }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { size: component__namespace.Text.Size.S, children: '5. Wait until open phones renew (up to 1 hour), or ask reps to reload phone mode. Then delete the old API key in the Twilio Console, and then the old secret in NetSuite API Secrets.' }) })] }) }))
            ].filter(Boolean);
            return (jsxRuntime.jsx(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.L, children: items }));
        }
    }

    let drawers = [];
    const railValueFor = (state) => state.mode === 'stepper' && !isConfigActive(state) ? 're-run' : state.selectedSection;
    const syncRailSelection = () => {
        const value = railValueFor(store.getState());
        drawers.forEach((d) => {
            if (d.rootElement && d.rootElement.isConnected && d.selectedValue !== value) {
                d.setSelectedValue(value, { reason: 'ctc-sync' });
            }
        });
    };
    registerRailSync(syncRailSelection);
    const navigate = (value) => {
        if (value === 're-run') {
            goToStep(1);
            return;
        }
        goToSection(value);
    };
    const NavRail = (_props) => {
        const state = store.getState();
        const assignments = state.console.assignments;
        const assignmentBadge = assignments ? String(assignments.length) : undefined;
        const canRerun = !isConfigActive(state);
        const item = (value, label, icon, extra = {}) => ({
            value, label, icon, action: () => { navigate(value); }, ...extra
        });
        const navItems = [
            item('overview', 'Overview', core__namespace.SystemIcon.CARD_VIEW),
            item('phones', 'Phones & reps', core__namespace.SystemIcon.GROUPS, { badge: assignmentBadge }),
            item('inbound', 'Inbound calls', core__namespace.SystemIcon.CALL),
            item('voice', 'Voice config', core__namespace.SystemIcon.SETTINGS),
            item('credentials', 'Credentials', core__namespace.SystemIcon.LOCK)
        ];
        if (canRerun) {
            navItems.push(item('re-run', 'Re-run wizard', core__namespace.SystemIcon.REFRESH, { separatorTop: true }));
        }
        const selectedVal = railValueFor(state);
        const drawer = new component__namespace.NavigationDrawer({
            items: navItems,
            selectedValue: selectedVal,
            width: 240,
            visualStyle: component__namespace.NavigationDrawer.VisualStyle.DARK,
            onSelectedValueChanged: (args) => {
                const value = args && args.value;
                if (!value)
                    return;
                if (value === railValueFor(store.getState()))
                    return;
                navigate(value);
            }
        });
        drawers.push(drawer);
        const recent = drawers.slice(-3);
        drawers = drawers.filter((d) => recent.indexOf(d) >= 0 || (!!d.rootElement && d.rootElement.isConnected));
        return drawer;
    };

    const RailContentShell = (props) => {
        return (jsxRuntime.jsx(component__namespace.ScrollPanel, { orientation: component__namespace.ScrollPanel.Orientation.VERTICAL, children: jsxRuntime.jsx(component__namespace.ContentPanel, { horizontalAlignment: component__namespace.ContentPanel.HorizontalAlignment.STRETCH, outerGap: {
                    start: component__namespace.ContentPanel.GapSize.XXL,
                    end: component__namespace.ContentPanel.GapSize.XXL,
                    vertical: component__namespace.ContentPanel.GapSize.M
                }, children: props.children }) }));
    };

    const PausedBanner = (props) => {
        const c = store.getState().console;
        const handleReactivate = props.onReactivate || (() => { reactivate('banner'); });
        const bodyText = new component__namespace.Text({
            text: 'Reps\' phones stop within about a minute; calls in progress finish. ' +
                'Calling stays off until you reactivate. All config is preserved.'
        });
        const reactivateBtn = new component__namespace.Button({
            label: c.reactivating ? 'Reactivating…' : 'Reactivate',
            type: component__namespace.Button.Type.PRIMARY,
            enabled: !c.reactivating,
            action: handleReactivate
        });
        const contentRow = new component__namespace.StackPanel({
            items: [bodyText, reactivateBtn],
            orientation: component__namespace.StackPanel.Orientation.HORIZONTAL,
            itemGap: component__namespace.StackPanel.GapSize.L,
            justification: component__namespace.StackPanel.Justification.SPACE_BETWEEN,
            alignment: component__namespace.StackPanel.Alignment.CENTER
        });
        const showError = !!c.reactivateError && c.reactivateSource === 'banner';
        const content = showError
            ? new component__namespace.StackPanel({
                items: [
                    contentRow,
                    new component__namespace.Text({
                        text: '✕ Reactivate failed: ' + friendlyError(c.reactivateError),
                        type: component__namespace.Text.Type.STRONG
                    }),
                    ...buildFailedCheckLines(c.reactivateFailedChecks)
                ],
                orientation: component__namespace.StackPanel.Orientation.VERTICAL,
                itemGap: component__namespace.StackPanel.GapSize.XS
            })
            : contentRow;
        const banner = new component__namespace.BannerMessage({
            title: 'Click-to-Call is paused',
            content,
            type: component__namespace.BannerMessage.Type.WARNING,
            showCloseButton: false
        });
        return banner;
    };

    const subtitleFor = (section) => {
        switch (section) {
            case 'overview': return 'Overview';
            case 'phones': return 'Phones & reps';
            case 'inbound': return 'Inbound calls';
            case 'voice': return 'Voice config';
            case 'credentials': return 'Credentials';
        }
    };
    const ConsoleShell = (props) => {
        const state = store.getState();
        const snap = state.console.snapshot;
        const isPaused = snap?.active === false;
        const subtitle = subtitleFor(state.selectedSection);
        const contentItems = [
            (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.XXS, children: [jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Heading, { level: 2, rootAttributes: {
                                    'data-ctc-page-heading': '',
                                    'aria-label': 'Click-to-Call Admin Console: ' + subtitle
                                }, children: "Click-to-Call Admin Console" }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, size: component__namespace.Text.Size.S, children: subtitle }) })] }) })),
            isPaused && (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(PausedBanner, { tick: props.tick }) })),
            (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: props.children }))
        ].filter(Boolean);
        return (jsxRuntime.jsxs(component__namespace.GridPanel, { columns: "auto 1fr", rows: "100%", columnGap: component__namespace.GridPanel.GapSize.NONE, children: [jsxRuntime.jsx(component__namespace.GridPanel.Item, { children: jsxRuntime.jsx(NavRail, { tick: props.tick }) }), jsxRuntime.jsx(component__namespace.GridPanel.Item, { children: jsxRuntime.jsx(RailContentShell, { children: jsxRuntime.jsx(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.L, children: contentItems }) }) })] }));
    };

    const STEPS = [
        { label: 'Prerequisites', sub: 'Setup checks' },
        { label: 'Connect Twilio', sub: 'SIDs & secrets' },
        { label: 'Voice config', sub: 'TwiML & caller ID' },
        { label: 'Phone numbers', sub: 'Claim & assign' },
        { label: 'Test & activate', sub: 'Review & go live' }
    ];
    const Stepper = (props) => {
        const state = store.getState();
        const activated = !!state.step5.activated;
        const current0 = Math.max(1, Math.min(STEPS.length, props.currentStep)) - 1;
        const itemType = (i0) => {
            if (i0 === 4 && activated)
                return component__namespace.Stepper.ItemType.SUCCESS;
            if (i0 < current0)
                return component__namespace.Stepper.ItemType.SUCCESS;
            if (i0 === current0)
                return component__namespace.Stepper.ItemType.PRIMARY;
            return component__namespace.Stepper.ItemType.DEFAULT;
        };
        const items = [];
        STEPS.forEach((spec, i0) => {
            const enabled = i0 <= current0 || (i0 === 4 && activated);
            const description = spec.label + ' • ' + spec.sub;
            items.push(jsxRuntime.jsx(component__namespace.Stepper.Item, { index: i0, type: itemType(i0), enabled: enabled, descriptionMaxWidth: 200, children: description }));
        });
        const selected = (activated && current0 === 4) ? null : current0;
        return (jsxRuntime.jsx(component__namespace.Stepper, { selectedStepIndex: selected, descriptionPosition: component__namespace.Stepper.DescriptionPosition.BOTTOM, separatorSize: component__namespace.Stepper.SeparatorSize.STRETCH, rootStyle: { width: '100%' }, onSelectionChanged: (args) => {
                const liveState = store.getState();
                if (liveState.step5.activated)
                    return;
                const liveCurrent0 = Math.max(1, Math.min(STEPS.length, liveState.currentStep)) - 1;
                if (args.stepIndex === liveCurrent0)
                    return;
                const target = Math.min(liveCurrent0, args.stepIndex);
                goToStep(target + 1);
            }, children: items }));
    };

    const StepperShell = (props) => {
        const state = store.getState();
        const step = state.currentStep;
        const stepLabel = STEPS[step - 1]?.label || '';
        const subtitle = 'Step ' + step + ' of ' + STEPS.length + ' — ' + stepLabel;
        const innerStack = (jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.L, children: [jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsxs(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.XXS, children: [jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Heading, { level: 2, rootAttributes: {
                                        'data-ctc-page-heading': '',
                                        'aria-label': 'Click-to-Call Setup Wizard: ' + subtitle
                                    }, children: "Click-to-Call Setup Wizard" }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(component__namespace.Text, { type: component__namespace.Text.Type.WEAK, size: component__namespace.Text.Size.S, children: subtitle }) })] }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { grow: 1, children: jsxRuntime.jsx(Stepper, { currentStep: step, tick: props.tick }) }), jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: props.children })] }));
        const paddedContent = (jsxRuntime.jsx(RailContentShell, { children: innerStack }));
        if (state.railVisible) {
            return (jsxRuntime.jsxs(component__namespace.GridPanel, { columns: "auto 1fr", rows: "100%", columnGap: component__namespace.GridPanel.GapSize.NONE, children: [jsxRuntime.jsx(component__namespace.GridPanel.Item, { children: jsxRuntime.jsx(NavRail, { tick: props.tick }) }), jsxRuntime.jsx(component__namespace.GridPanel.Item, { children: paddedContent })] }));
        }
        return paddedContent;
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
            startHashRouting();
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
                const raw = payload && payload.snapshot;
                const snap = raw || {};
                store.dispatch(Action.consoleLoadSuccess({ snapshot: snap }));
                landFromHash(raw ? determineLandingStep(snap) : 1);
            }
            catch (e) {
                landFromHash(1);
            }
            finally {
                store.dispatch(Action.setMountRouting(false));
            }
        }
        renderStep(stepNum, tick) {
            switch (stepNum) {
                case 1: return jsxRuntime.jsx(Step1, { tick: tick });
                case 2: return jsxRuntime.jsx(Step2, { tick: tick });
                case 3: return jsxRuntime.jsx(Step3, { tick: tick });
                case 4: return jsxRuntime.jsx(Step4, { tick: tick });
                case 5: return jsxRuntime.jsx(Step5, { tick: tick });
                default: return jsxRuntime.jsx(Step1, { tick: tick });
            }
        }
        renderSection(section, tick) {
            switch (section) {
                case 'overview': return jsxRuntime.jsx(OverviewPage, { tick: tick });
                case 'phones': return jsxRuntime.jsx(PhonesPage, { tick: tick });
                case 'inbound': return jsxRuntime.jsx(InboundPage, { tick: tick });
                case 'voice': return jsxRuntime.jsx(VoicePage, { tick: tick });
                case 'credentials': return jsxRuntime.jsx(CredentialsPage, { tick: tick });
                default: return jsxRuntime.jsx(OverviewPage, { tick: tick });
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
            const tick = this.state.tick;
            if (state.mode === 'console') {
                return (jsxRuntime.jsx(ConsoleShell, { tick: tick, children: this.renderSection(state.selectedSection, tick) }));
            }
            return (jsxRuntime.jsx(StepperShell, { tick: tick, children: this.renderStep(state.currentStep, tick) }));
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
