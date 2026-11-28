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
        HEALTH_LOAD_START: Symbol('healthLoadStart'),
        HEALTH_LOAD_SUCCESS: Symbol('healthLoadSuccess'),
        HEALTH_LOAD_FAILURE: Symbol('healthLoadFailure'),
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
        healthLoadStart() {
            return { type: ActionType.HEALTH_LOAD_START, payload: null };
        },
        healthLoadSuccess(payload) {
            return { type: ActionType.HEALTH_LOAD_SUCCESS, payload };
        },
        healthLoadFailure(error) {
            return { type: ActionType.HEALTH_LOAD_FAILURE, payload: { error } };
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
    const pickInboundSettings = (v) => ({
        inboundEnabled: v.inboundEnabled,
        ringSeconds: v.ringSeconds,
        noAnswerMessage: v.noAnswerMessage,
        recordInbound: v.recordInbound,
        recordingNoticeOn: v.recordingNoticeOn,
        recordingNotice: v.recordingNotice,
        voicemailOn: v.voicemailOn,
        voicemailMaxSeconds: v.voicemailMaxSeconds,
        fallbackOwnerId: v.fallbackOwnerId
    });
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
                    d.inbound.saved = pickInboundSettings(p);
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
                        d.inbound.saved = pickInboundSettings(p.settings || d.inbound);
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
            [ActionType.HEALTH_LOAD_START, (s) => core.ImmutableUpdate.of(s, (d) => {
                    d.health.loading = true;
                    d.health.error = null;
                })],
            [ActionType.HEALTH_LOAD_SUCCESS, (s) => core.ImmutableUpdate.of(s, (d) => {
                    const p = a.payload;
                    d.health.loading = false;
                    d.health.loaded = true;
                    d.health.error = null;
                    d.health.checkedAt = p.checkedAt;
                    d.health.signals = p.signals;
                    d.health.attention = p.attention;
                })],
            [ActionType.HEALTH_LOAD_FAILURE, (s) => core.ImmutableUpdate.of(s, (d) => {
                    d.health.loading = false;
                    d.health.error = a.payload.error;
                })],
            [ActionType.OUTBOUND_LOAD_START, (s) => core.ImmutableUpdate.of(s, (d) => {
                    d.outbound.loading = true;
                    d.outbound.loadError = null;
                })],
            [ActionType.OUTBOUND_LOAD_SUCCESS, (s) => core.ImmutableUpdate.of(s, (d) => {
                    const snap = a.payload;
                    const o = d.outbound;
                    const unsaved = o.loaded && (o.noticeOn !== o.savedNoticeOn || o.noticeText !== o.savedNoticeText);
                    const form = { noticeOn: o.noticeOn, noticeText: o.noticeText };
                    Object.assign(d.outbound, snap);
                    d.outbound.savedNoticeOn = snap.noticeOn;
                    d.outbound.savedNoticeText = snap.noticeText;
                    if (unsaved)
                        Object.assign(d.outbound, form);
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
                    if (p.op === 'run') {
                        d.outbound.publishRunning = busy;
                        return;
                    }
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
                    if (p.snapshot) {
                        Object.assign(d.outbound, p.snapshot);
                        d.outbound.savedNoticeOn = p.snapshot.noticeOn;
                        d.outbound.savedNoticeText = p.snapshot.noticeText;
                    }
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
            phonesLoadedAt: '',
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
            phoneTabSaving: false,
            phoneTabError: null,
            recordingKeepSaving: false,
            recordingKeepError: null,
            pendingDeactivateConfirm: false,
            deactivating: false,
            deactivateError: null,
            reactivating: false,
            reactivateSource: 'banner',
            reactivateError: null,
            reactivateFailedChecks: [],
            preflightRefreshing: false,
            preflightError: null,
            preflightAt: '',
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
            saved: null,
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
        health: {
            loaded: false,
            loading: false,
            error: null,
            checkedAt: '',
            signals: {},
            attention: []
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
            allowedPrefixes: '',
            allowedSource: '',
            publishedAllowedPrefixes: '',
            allowListPending: false,
            functionExists: null,
            functionMessage: '',
            savedNoticeOn: false,
            savedNoticeText: '',
            saving: false,
            publishing: false,
            unpublishing: false,
            publishRunning: false,
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
                store.dispatch(Action.consolePatch({ preflight: checks, preflightAt: new Date().toISOString() }));
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
    async function rerunPreflight() {
        if (store.getState().console.preflightRefreshing)
            return;
        store.dispatch(Action.consolePatch({ preflightRefreshing: true, preflightError: null }));
        try {
            const payload = await wizardCall('wizardRunPreflight', {});
            const checks = payload && payload.checks;
            if (Array.isArray(checks)) {
                store.dispatch(Action.consolePatch({ preflight: checks, preflightAt: new Date().toISOString() }));
            }
            else {
                store.dispatch(Action.consolePatch({
                    preflightError: errorOf(payload, 'Preflight did not return any checks')
                }));
            }
        }
        catch (e) {
            store.dispatch(Action.consolePatch({ preflightError: thrownText$1(e, 'Preflight did not run') }));
        }
        finally {
            store.dispatch(Action.consolePatch({ preflightRefreshing: false }));
        }
    }
    async function setPhoneTab(on) {
        if (store.getState().console.phoneTabSaving)
            return;
        store.dispatch(Action.consolePatch({ phoneTabSaving: true, phoneTabError: null }));
        try {
            const result = await wizardCall('wizardSetPhoneTab', { phoneTab: on });
            if (!result || result.ok === false) {
                store.dispatch(Action.consolePatch({ phoneTabError: errorOf(result, 'The phone mode setting was not saved') }));
                return;
            }
            const snap = store.getState().console.snapshot;
            store.dispatch(Action.consolePatch({ snapshot: { ...(snap || {}), phoneTab: on } }));
        }
        catch (e) {
            store.dispatch(Action.consolePatch({ phoneTabError: thrownText$1(e, 'The phone mode setting was not saved') }));
        }
        finally {
            store.dispatch(Action.consolePatch({ phoneTabSaving: false }));
        }
    }
    async function setRecordingKeep(keepDays) {
        if (store.getState().console.recordingKeepSaving)
            return;
        store.dispatch(Action.consolePatch({ recordingKeepSaving: true, recordingKeepError: null }));
        try {
            const result = await wizardCall('wizardSetRecordingKeep', { keepDays });
            if (!result || result.ok === false) {
                store.dispatch(Action.consolePatch({ recordingKeepError: errorOf(result, 'The recording setting was not saved') }));
                return;
            }
            const snap = store.getState().console.snapshot;
            store.dispatch(Action.consolePatch({ snapshot: { ...(snap || {}), recordingKeepDays: keepDays } }));
        }
        catch (e) {
            store.dispatch(Action.consolePatch({ recordingKeepError: thrownText$1(e, 'The recording setting was not saved') }));
        }
        finally {
            store.dispatch(Action.consolePatch({ recordingKeepSaving: false }));
        }
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

    const SEVERITIES = ['ok', 'warn', 'problem', 'unknown'];
    const toSeverity = (v) => (SEVERITIES.indexOf(v) !== -1 ? v : 'unknown');
    const toAction = (v) => {
        const a = (v || null);
        if (!a || typeof a.label !== 'string' || typeof a.route !== 'string')
            return undefined;
        return { label: a.label, route: a.route };
    };
    const toSignal = (raw) => {
        const r = (raw || {});
        const out = {
            key: String(r.key ?? ''),
            title: String(r.title ?? ''),
            value: r.value ?? null,
            severity: toSeverity(r.severity),
            detail: String(r.detail ?? '')
        };
        const action = toAction(r.action);
        if (action)
            out.action = action;
        return out;
    };
    const toAttention = (raw) => {
        const s = toSignal(raw);
        const item = { key: s.key, title: s.title, severity: s.severity, detail: s.detail };
        if (s.action)
            item.action = s.action;
        return item;
    };
    async function loadHealth() {
        if (store.getState().health.loading)
            return;
        store.dispatch(Action.healthLoadStart());
        try {
            const result = (await wizardCall('wizardLoadHealth', {}));
            if (!result || result.ok !== true) {
                store.dispatch(Action.healthLoadFailure((result && (result.message || result.error)) || 'Could not load the health checks'));
                return;
            }
            const signals = {};
            Object.keys(result.signals || {}).forEach((k) => {
                signals[k] = toSignal(result.signals[k]);
            });
            const attention = Array.isArray(result.attention) ? result.attention.map(toAttention) : [];
            store.dispatch(Action.healthLoadSuccess({
                checkedAt: String(result.checkedAt || ''),
                signals,
                attention
            }));
        }
        catch (e) {
            store.dispatch(Action.healthLoadFailure(e instanceof Error && e.message ? e.message : 'Could not load the health checks'));
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
            if (!listError(phones)) {
                store.dispatch(Action.consolePatch({ phonesLoadedAt: new Date().toISOString() }));
            }
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
            if (store.getState().health.loaded)
                loadHealth();
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

    const SECTIONS = ['overview', 'phones', 'inbound', 'outbound', 'transcripts', 'health', 'account'];
    const LEGACY_SECTIONS = {
        voice: 'outbound',
        credentials: 'account'
    };
    function parseHash(hash) {
        const path = String(hash || '').replace(/^#\/?/, '').replace(/\/+$/, '');
        if (!path)
            return null;
        const step = /^setup\/([1-5])$/.exec(path);
        if (step)
            return { kind: 'step', step: Number(step[1]) };
        const section = SECTIONS.find((sec) => sec === path);
        if (section)
            return { kind: 'section', section };
        if (Object.prototype.hasOwnProperty.call(LEGACY_SECTIONS, path)) {
            return { kind: 'section', section: LEGACY_SECTIONS[path], redirected: true };
        }
        return null;
    }
    const hashFor = (route) => route.kind === 'section' ? '#/' + route.section : '#/setup/' + route.step;

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
            if (state.mode === 'console' && state.selectedSection === route.section) {
                if (route.redirected)
                    writeHash(route, false);
                return;
            }
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
    const statusIcon = (status) => {
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

    const buildFailedCheckLines = (checks) => checks
        .filter((c) => c && c.status !== 'pass')
        .map((c) => new component__namespace.Text({
        text: '✕ ' + (c.label || c.id || 'Check') +
            (c.detail ? ': ' + c.detail : '') +
            (c.repairHint ? ' → ' + c.repairHint : ''),
        size: component__namespace.Text.Size.S,
        classList: ['ctc-t-small']
    }));

    const SP = component__namespace.StackPanel;
    const Gap = component__namespace.StackPanel.GapSize;
    const present = (nodes) => nodes.filter((n) => n !== null && n !== undefined && n !== false && n !== '');
    const empty = () => new component__namespace.Text({ text: '' });
    function vstack(nodes, gap = Gap.SPACING3X, opts = {}) {
        const list = present(nodes);
        return (jsxRuntime.jsx(component__namespace.StackPanel, { orientation: SP.Orientation.VERTICAL, itemGap: gap, alignment: (opts.alignment ?? SP.Alignment.STRETCH), classList: (opts.classList || []), children: (list.length ? list : [empty()]).map((n) => (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: n }))) }));
    }
    function hstack(nodes, gap = Gap.SPACING2X, opts = {}) {
        const list = present(nodes);
        const items = list.length ? list : [empty()];
        return (jsxRuntime.jsx(component__namespace.StackPanel, { orientation: SP.Orientation.HORIZONTAL, itemGap: gap, alignment: (opts.alignment ?? SP.Alignment.CENTER), justification: (opts.justification ?? SP.Justification.START), wrap: !!opts.wrap, children: items.map((n, i) => {
                const grow = (opts.growFirst && i === 0) || (opts.growLast && i === items.length - 1) ? 1 : 0;
                return jsxRuntime.jsx(component__namespace.StackPanel.Item, { grow: grow, children: n });
            }) }));
    }
    function grid(columns, cells, gap = Gap.SPACING3X, opts = {}) {
        const list = present(cells);
        return (jsxRuntime.jsx(component__namespace.GridPanel, { columns: columns, columnGap: gap, rowGap: (opts.rowGap ?? gap), children: (list.length ? list : [empty()]).map((n) => (jsxRuntime.jsx(component__namespace.GridPanel.Item, { alignment: (opts.stretch ? component__namespace.GridPanel.Alignment.STRETCH
                    : component__namespace.GridPanel.Alignment.START), children: n }))) }));
    }
    function card(nodes, opts = {}) {
        const variant = opts.variant || 'default';
        const cls = variant === 'flush' ? 'ctc-card-flush' : variant === 'danger' ? 'ctc-card-danger' : 'ctc-card';
        const classList = opts.fill ? [cls, 'ctc-fill'] : [cls];
        const pad = variant === 'flush'
            ? component__namespace.Card.GapSize.NONE
            : { vertical: component__namespace.Card.GapSize.SPACING4X, horizontal: component__namespace.Card.GapSize.SPACING4X };
        return (jsxRuntime.jsx(component__namespace.Card, { classList: classList, contentGap: pad, ariaLabel: opts.label, children: vstack(nodes, opts.gap ?? Gap.SPACING3X) }));
    }
    function typeClass(opts) {
        if (opts.strong && opts.small)
            return 'ctc-t-strong-small';
        if (opts.weak && opts.small)
            return 'ctc-t-help';
        if (opts.small)
            return 'ctc-t-small';
        if (opts.strong)
            return 'ctc-t-strong';
        if (opts.weak)
            return 'ctc-t-muted';
        return 'ctc-t-body';
    }
    function text(t, opts = {}) {
        return new component__namespace.Text({
            text: t,
            type: opts.strong ? component__namespace.Text.Type.STRONG : opts.weak ? component__namespace.Text.Type.WEAK : component__namespace.Text.Type.DEFAULT,
            size: opts.small ? component__namespace.Text.Size.S : component__namespace.Text.Size.M,
            classList: [typeClass(opts)].concat(opts.classList || []),
            ...(opts.title ? { rootAttributes: { title: opts.title } } : {})
        });
    }
    const help = (t) => text(t, { weak: true, small: true });
    function label(t) {
        return new component__namespace.Text({
            text: t,
            type: component__namespace.Text.Type.STRONG,
            size: component__namespace.Text.Size.S,
            classList: ['ctc-t-label']
        });
    }
    function num(n, opts = {}) {
        return text(n.toLocaleString(), { classList: ['ctc-num'].concat(opts.muteZero && n === 0 ? ['ctc-t-zero'] : []) });
    }
    function cardTitle(t, opts = {}) {
        return new component__namespace.Heading({
            content: t,
            level: 2,
            type: component__namespace.Heading.Type.SMALL_HEADING,
            classList: opts.danger ? ['ctc-h2', 'ctc-danger-title'] : ['ctc-h2']
        });
    }
    function metric(value, unit) {
        return hstack([
            new component__namespace.Text({ text: value, size: component__namespace.Text.Size.XXL, weight: component__namespace.Text.Weight.BOLD }),
            unit ? text(unit, { weak: true }) : null
        ], Gap.SPACING1X, { alignment: SP.Alignment.BASELINE });
    }
    const CHIP_TONE = {
        ok: 'ctc-chip-ok', warn: 'ctc-chip-warn', problem: 'ctc-chip-problem',
        off: 'ctc-chip-neutral', neutral: 'ctc-chip-neutral', info: 'ctc-chip-info'
    };
    function chip(label, tone) {
        return new component__namespace.Badge({
            content: label,
            type: component__namespace.Badge.Type.SUBTLE,
            size: component__namespace.Badge.Size.SMALL,
            classList: [CHIP_TONE[tone]]
        });
    }
    function stepBadge(n) {
        return new component__namespace.Text({ text: String(n), classList: ['ctc-step'] });
    }
    function dot(tone) {
        return new component__namespace.Text({
            text: '●',
            classList: ['ctc-dot-' + tone],
            rootAttributes: { 'aria-hidden': 'true' }
        });
    }
    function dotText(tone, label, extra, opts = {}) {
        return hstack([
            dot(tone),
            text(label, { small: opts.small }),
            extra ? text(extra, { weak: true, small: opts.small }) : null
        ], Gap.SPACING1X);
    }
    function divider() {
        return new component__namespace.Divider({ orientation: component__namespace.Divider.Orientation.HORIZONTAL });
    }
    function button(label, action, opts = {}) {
        const type = opts.link ? component__namespace.Button.Type.LINK
            : opts.danger ? component__namespace.Button.Type.DANGER
                : opts.primary ? component__namespace.Button.Type.PRIMARY
                    : component__namespace.Button.Type.DEFAULT;
        return new component__namespace.Button({
            label,
            type,
            size: opts.small ? component__namespace.Button.Size.SMALL : component__namespace.Button.Size.MEDIUM,
            enabled: opts.enabled !== false,
            startIcon: opts.icon,
            classList: opts.quietDanger ? ['ctc-btn-danger'] : undefined,
            action: (_args, sender) => { action(sender); }
        });
    }
    function openButton(label, url) {
        return button(label, () => { window.open(url, '_blank', 'noopener'); }, { icon: core__namespace.SystemIcon.OPEN_NEW });
    }
    function extLink(label, url) {
        return new component__namespace.Link({
            content: label + ' ↗',
            url,
            target: component__namespace.Link.Target.BLANK
        });
    }
    function field(labelText, control, helpText) {
        return vstack([
            label(labelText),
            control,
            helpText ? (typeof helpText === 'string' ? help(helpText) : helpText) : null
        ], Gap.SPACING1X);
    }
    function loader(label) {
        return new component__namespace.Loader({ label, indeterminate: true });
    }
    function skeleton(kind, size = 3, label = 'Loading…') {
        try {
            const S = component__namespace.Skeleton;
            if (kind === 'table')
                return S.table({ rows: size, columns: 4 });
            if (kind === 'kpi')
                return S.kpi();
            return S.lines({ count: size });
        }
        catch (e) {
            return loader(label);
        }
    }
    function problemCard(title, detail, actions = []) {
        return card([
            grid('auto minmax(0, 1fr)', [
                dot('problem'),
                vstack([
                    text(title, { strong: true }),
                    detail ? help(detail) : null,
                    present(actions).length ? hstack(actions, Gap.SPACING2X, { wrap: true }) : null
                ], Gap.SPACING1X)
            ], Gap.SPACING3X)
        ]);
    }
    function emptyCard(title, detail, actions = []) {
        return card([
            text(title, { strong: true }),
            help(detail),
            present(actions).length ? hstack(actions, Gap.SPACING2X, { wrap: true }) : null
        ], { gap: Gap.SPACING2X });
    }
    const errorLine = (msg) => text('✕ ' + msg, { strong: true });
    function pageHeader(title, subtitle, aside = []) {
        const heading = new component__namespace.Heading({
            content: title,
            level: 1,
            type: component__namespace.Heading.Type.PAGE_TITLE,
            rootAttributes: { 'data-ctc-page-heading': '' }
        });
        const left = vstack([heading, subtitle ? text(subtitle, { weak: true }) : null], Gap.SPACING1X);
        const right = present(aside);
        if (!right.length)
            return left;
        return hstack([left, hstack(right, Gap.SPACING3X, { wrap: true })], Gap.SPACING4X, {
            alignment: SP.Alignment.END, justification: SP.Justification.SPACE_BETWEEN, wrap: true, growFirst: true
        });
    }
    const ROW_ONE_LINE = 48;
    const ROW_TWO_LINES = 60;
    function table(rows, columns, opts = {}) {
        const CT = component__namespace.DataGrid.ColumnType;
        const gridColumn = component__namespace.GridColumn;
        const right = gridColumn && gridColumn.HorizontalAlignment ? gridColumn.HorizontalAlignment.RIGHT : undefined;
        return new component__namespace.DataGrid({
            dataSource: new core__namespace.ArrayDataSource(rows),
            columns: columns.map((c, i) => {
                const align = c.numeric && right !== undefined
                    ? { horizontalAlignment: right, headerHorizontalAlignment: right } : {};
                return {
                    type: CT.TEMPLATED,
                    name: c.name,
                    label: c.label,
                    stretchFactor: c.stretch,
                    classList: ['ctc-td'].concat(i === 0 ? ['ctc-td-first'] : [], c.numeric ? ['ctc-td-num'] : []),
                    headerClassList: ['ctc-th'].concat(c.numeric ? ['ctc-th-num'] : []),
                    ...align,
                    content: (args) => {
                        const r = args && args.cell && args.cell.row ? args.cell.row.dataItem : undefined;
                        return r ? c.cell(r) : text('');
                    }
                };
            }),
            columnStretch: true,
            highlightRowsOnHover: true,
            dataRowHeight: opts.rowHeight || ROW_ONE_LINE,
            headerRowHeight: 40,
            classList: ['ctc-table'],
            rootStyle: { width: '100%' }
        });
    }
    function listTable(columns, heads, rows) {
        const align = (c) => (c.end ? SP.Alignment.END : SP.Alignment.START);
        const cells = [];
        heads.forEach((h) => {
            cells.push(vstack([label(h.label)], Gap.NONE, { alignment: align(h), classList: ['ctc-lth'] }));
        });
        rows.forEach((row) => {
            row.forEach((cell, i) => {
                const h = heads[i] || { label: '' };
                cells.push(vstack([cell], Gap.SPACING1X, { alignment: align(h), classList: ['ctc-ltd'] }));
            });
        });
        return vstack([grid(columns, cells, Gap.NONE, { stretch: true })], Gap.NONE, { classList: ['ctc-list'] });
    }

    const PAUSE_CONFIRM_TEXT = 'Reps will not be able to call until you resume. Open phones stop within about a minute; ' +
        'calls in progress finish.';
    const PauseControl = (props) => {
        const c = store.getState().console;
        const snap = (c.snapshot || {});
        const paused = snap.active === false;
        const out = [];
        if (paused) {
            out.push(button(c.reactivating ? 'Resuming…' : 'Resume calling', () => { reactivate('overview'); }, {
                primary: true, enabled: !c.reactivating, icon: core__namespace.SystemIcon.PLAY
            }));
        }
        else if (c.deactivating) {
            out.push(button('Pausing…', () => undefined, { danger: true, enabled: false }));
        }
        else if (c.pendingDeactivateConfirm) {
            out.push(hstack([
                text(PAUSE_CONFIRM_TEXT, { small: true }),
                button('Confirm pause', () => { deactivate(); }, { small: true, danger: true }),
                button('Cancel', () => { store.dispatch(Action.deactivateSuccess()); }, { small: true })
            ], Gap.SPACING2X, { wrap: true }));
        }
        else {
            out.push(button(props.pauseLabel || 'Pause calling', () => { store.dispatch(Action.deactivateRequest()); }, {
                quietDanger: !!props.danger
            }));
        }
        if (c.deactivateError)
            out.push(errorLine('Pause failed: ' + friendlyError(c.deactivateError)));
        if (c.reactivateError && c.reactivateSource === 'overview') {
            out.push(errorLine('Resume failed: ' + friendlyError(c.reactivateError)));
            buildFailedCheckLines(c.reactivateFailedChecks).forEach((line) => { out.push(line); });
        }
        return vstack(out, Gap.SPACING2X, { alignment: component__namespace.StackPanel.Alignment.END });
    };

    const PHONE_STATUS_RECEIVING = { label: 'Receiving calls', color: '#2E9E6B' };
    const PHONE_STATUS_NOT_RECEIVING = { label: 'Not receiving calls', color: '#E9A62A' };
    const PHONE_STATUS_OFFLINE = { label: 'Offline', color: '#B9B5AE' };
    const PHONE_STATUS_INBOUND_OFF = { label: 'Ready (inbound off)', color: '#2E9E6B' };
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

    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
    function agoParts(minutes) {
        const m = Math.max(0, Math.round(minutes));
        if (m < 60)
            return { value: String(m), unit: 'min ago' };
        const h = Math.floor(m / 60);
        if (h < 48)
            return { value: String(h), unit: 'h ago' };
        return { value: String(Math.floor(h / 24)), unit: 'days ago' };
    }
    function timeOfDay(iso) {
        const t = Date.parse(iso || '');
        if (isNaN(t))
            return '';
        return new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
    function dateTime(iso) {
        const t = Date.parse(iso || '');
        return isNaN(t) ? '' : new Date(t).toLocaleString();
    }
    const DAY_MS = 24 * 60 * 60 * 1000;
    function aiMeter(remaining, backlog, nowMs) {
        if (remaining === null || !isFinite(remaining) || remaining < 0)
            return null;
        const used = Math.max(0, (backlog && backlog.analysedThisMonth) || 0);
        const startMs = backlog && backlog.monthStart ? Date.parse(backlog.monthStart) : NaN;
        const since = isNaN(startMs) ? '' : new Date(startMs).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
        const tone = remaining < 10 ? 'problem' : remaining < 50 ? 'warn' : 'ok';
        const usedText = used.toLocaleString() + (used === 1 ? ' call' : ' calls') +
            ' analysed by Click-to-Call' + (since ? ' since ' + since : ' this month');
        let runwayText;
        if (!used || isNaN(startMs)) {
            runwayText = 'No calls analysed this month yet.';
        }
        else {
            const days = Math.max(1, (nowMs - startMs) / DAY_MS);
            const runway = remaining / (used / days);
            runwayText = runway > 365 ? 'Enough for more than a year at this month\'s rate.'
                : 'Enough for about ' + Math.max(1, Math.floor(runway)).toLocaleString() + ' days at this month\'s rate.';
        }
        return { value: remaining, max: Math.max(remaining + used, 1), tone, usedText, runwayText };
    }
    const BACKLOG_STATUS_TONE = {
        'Logged': 'info',
        'Processing': 'info',
        'Failed': 'problem',
        'No transcript': 'neutral',
        'Recording cleanup due': 'warn'
    };
    const BACKLOG_PRIMER = 'Calls from the last 7 days that still have work to do. Each call waits for Twilio\'s transcript. ' +
        'Then NetSuite summarises it. Click-to-Call deletes the recording in Twilio after the keep period set under Recordings. ' +
        'Most calls go from Logged to Transcribed within an hour.';
    function backlogRows(v) {
        const row = (status, count, next, link) => ({ status, tone: BACKLOG_STATUS_TONE[status], count: Math.max(0, Number(count) || 0), next, link });
        return [
            row('Logged', v.logged, 'Waiting for Twilio\'s transcript. Checked every 15 minutes; closed as "No transcript" after 24 hours.'),
            row('Processing', v.processing, 'Being summarised now. A summary that stalls for 30 minutes is retried, up to 3 times.'),
            row('Failed', v.failed, 'Summary failed 3 times. The transcript is kept; the call is not retried again.', true),
            row('No transcript', v.noTranscript, 'Closed: no recording, or Twilio produced no transcript within 24 hours. Logged as calls without a summary.'),
            row('Recording cleanup due', v.cleanupPending, 'Recordings Twilio did not delete on the first try. Retried on the next run.')
        ];
    }
    function backlogKpi(v) {
        if (!v)
            return { metric: '—', metadata: '', tone: null, text: 'Not checked' };
        const total = v.logged + v.processing + v.failed;
        const parts = [];
        if (v.processing)
            parts.push(v.processing + ' processing');
        if (v.logged)
            parts.push(v.logged + ' logged');
        if (v.failed)
            parts.push(v.failed + ' failed');
        return {
            metric: String(total),
            metadata: total === 1 ? 'call' : 'calls',
            tone: v.failed > 0 ? 'warn' : null,
            text: parts.length ? parts.join(' · ') : 'Nothing waiting'
        };
    }
    function numbersRoutedKpi(v) {
        if (!v)
            return { metric: '—', metadata: '', tone: null, text: 'Not checked' };
        const total = v.numbers.length;
        if (total === 0)
            return { metric: '0', metadata: '', tone: 'off', text: 'No number has a rep yet' };
        const missing = v.numbers.filter((n) => !n.inTwilio).length;
        const onFlow = v.numbers.filter((n) => n.onFlow === true).length;
        const meta = 'of ' + total;
        if (missing) {
            return { metric: String(onFlow), metadata: meta, tone: 'problem',
                text: plural(missing, 'number is', 'numbers are') + ' not in Twilio' };
        }
        if (!v.flowSid)
            return { metric: '0', metadata: meta, tone: 'warn', text: 'Routing is not published' };
        if (onFlow === total) {
            return { metric: String(onFlow), metadata: meta, tone: v.inboundEnabled ? 'ok' : 'off',
                text: v.inboundEnabled ? 'All point at CTC routing' : 'All point at CTC routing · inbound off' };
        }
        return { metric: String(onFlow), metadata: meta, tone: v.inboundEnabled ? 'problem' : 'off',
            text: plural(total - onFlow, 'number does', 'numbers do') + ' not point at CTC routing' };
    }
    function repsReceivingKpi(v, relative) {
        if (!v)
            return { metric: '—', metadata: '', tone: null, text: 'Not checked' };
        const total = v.reps.length;
        if (total === 0)
            return { metric: '0', metadata: '', tone: 'off', text: 'No rep rings for a number' };
        const receiving = v.reps.filter((r) => r.receiving);
        const meta = 'of ' + total;
        if (!v.inboundEnabled) {
            return { metric: String(receiving.length), metadata: meta, tone: 'off', text: 'Inbound calls are off' };
        }
        const tone = receiving.length === total ? 'ok' : 'warn';
        if (receiving.length === 1) {
            const r = receiving[0];
            const seen = r.lastSeen ? relative(r.lastSeen) : '';
            return { metric: '1', metadata: meta, tone, text: r.employeeName + (seen ? ' · ' + seen.toLowerCase() : '') };
        }
        if (receiving.length === 0)
            return { metric: '0', metadata: meta, tone, text: 'No rep has a phone open' };
        return { metric: String(receiving.length), metadata: meta, tone,
            text: tone === 'ok' ? 'Every routed rep' : plural(total - receiving.length, 'rep is', 'reps are') + ' not receiving' };
    }
    function runStatusText(status) {
        switch (status) {
            case 'complete': return 'Completed';
            case 'processing': return 'Running';
            case 'failed': return 'Failed';
            default: return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'No run yet';
        }
    }
    function jobTone(j, staleAfterMinutes = 45) {
        if (!j || !j.lastStatus || j.minutesSinceLastRun === null)
            return 'off';
        if (j.lastStatus === 'failed')
            return 'problem';
        if (j.failedRecent > 0 || j.minutesSinceLastRun > staleAfterMinutes)
            return 'warn';
        return 'ok';
    }
    function missedCallSyncKpi(v) {
        const j = v && v.reconcile;
        if (!j)
            return { metric: '—', metadata: '', tone: null, text: 'Not checked' };
        if (!j.lastStatus || j.minutesSinceLastRun === null) {
            return { metric: '—', metadata: '', tone: 'off', text: runStatusText(j.lastStatus) };
        }
        const ago = agoParts(j.minutesSinceLastRun);
        return { metric: ago.value, metadata: ago.unit, tone: jobTone(j), text: runStatusText(j.lastStatus) };
    }
    function routingStatus(row, v) {
        if (row.ringId === null)
            return { label: 'No rep', tone: 'off' };
        const n = v ? v.numbers.find((x) => x.phoneSid === row.phoneSid) : null;
        if (!n)
            return { label: 'Not checked', tone: 'off' };
        if (!n.inTwilio)
            return { label: 'Not in Twilio', tone: 'problem' };
        if (n.onFlow === true)
            return { label: 'CTC routing', tone: 'ok' };
        return { label: 'Not routed', tone: 'warn' };
    }
    function callerIdPlan(rows, defaultNumber) {
        const byRep = {};
        const repIds = [];
        rows.forEach((r) => {
            r.employeeIds.forEach((id) => { if (repIds.indexOf(id) < 0)
                repIds.push(id); });
            if (r.ringId !== null && !byRep[String(r.ringId)]) {
                byRep[String(r.ringId)] = { phoneNumber: r.phoneNumber, ringsThem: true };
            }
        });
        repIds.forEach((id) => {
            if (!byRep[String(id)])
                byRep[String(id)] = { phoneNumber: defaultNumber || '', ringsThem: false };
        });
        return { byRep, repIds };
    }
    const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || name;
    const INBOUND_FIELDS = [
        'inboundEnabled', 'ringSeconds', 'noAnswerMessage', 'recordInbound', 'recordingNoticeOn',
        'recordingNotice', 'voicemailOn', 'voicemailMaxSeconds', 'fallbackOwnerId'
    ];
    function countInboundChanges(form, saved) {
        if (!saved)
            return 0;
        return INBOUND_FIELDS.filter((k) => form[k] !== saved[k]).length;
    }
    const CALL_CENTRAL_URL = '/app/site/hosting/scriptlet.nl?script=customscript_ctc_sl_reporting&deploy=customdeploy_ctc_sl_reporting';
    const API_SECRETS_URL = '/app/common/scripting/secrets/settings.nl';
    const PUBLISH_NOTICE_HELP = 'Creates the ctc-outbound Function in your Twilio account and points your Twilio app at it. ' +
        'Takes 15–30 seconds.';
    const SAVE_OFF_HELP = 'Nothing is sent to Twilio while the notice is off.';
    const NO_CHANGES_HELP = 'Callers hear the live version. Change the text or the switch to publish a new version.';
    const PUBLISH_CHANGES_HELP = 'Takes 15–30 seconds. Calls in progress keep the old notice.';
    const TURN_OFF_HELP = 'Calls connect without a notice. The Function stays in Twilio.';
    const REPUBLISH_HELP = 'A newer version of the Function is available. Publish to update it. Takes 15–30 seconds.';
    const FUNCTION_MISSING_HELP = 'The Function is missing in Twilio. Publish to create it again. Takes 15–30 seconds.';
    const VOICE_URL_HELP = 'Your Twilio app no longer points at the Function. Publish to point it back. Takes 15–30 seconds.';
    const ALLOW_LIST_HELP = 'The allowed countries changed. Publish to apply them. Takes 15–30 seconds.';
    const PUBLISHING_LABEL = 'Publishing… (15–30 s)';
    const REMOVE_CONFIRM_TEXT = 'Remove the Function now?';
    function removeBody(prevVoiceUrl) {
        return 'Deletes the ctc-outbound Function and points your Twilio app back at its previous Voice URL' +
            (prevVoiceUrl ? ': ' + prevVoiceUrl : '') + '. Outbound calls keep working, without a notice.';
    }
    const GEO_PERMISSIONS_HELP = 'Also turn on Twilio Geo Permissions (Twilio Console, Voice, Settings, Geo permissions) for the same ' +
        'countries only. +1 also reaches Caribbean countries; Geo Permissions can block those.';
    function allowListView(o) {
        const value = o.allowedPrefixes === '*' ? 'Every country'
            : o.allowedPrefixes ? o.allowedPrefixes.split(',').join(', ') : '—';
        const where = o.allowedSource === 'config'
            ? 'Set on the Click-to-Call configuration record (Outbound Allowed Country Codes).'
            : 'The country of the default caller ID. Change it on the Click-to-Call configuration record ' +
                '(Outbound Allowed Country Codes).';
        const scope = !o.published
            ? 'The Twilio dial Function checks it only while the recording notice is published.'
            : o.allowListPending ? 'Not live yet: publish the recording notice to apply it.'
                : 'The Twilio dial Function checks it on every call.';
        return { value, help: [where, scope, GEO_PERMISSIONS_HELP].join(' ') };
    }
    function outboundUnsaved(o) {
        return o.loaded && (o.noticeOn !== o.savedNoticeOn || o.noticeText !== o.savedNoticeText);
    }
    function noticeStatus(o) {
        const when = o.publishedAt && !isNaN(Date.parse(o.publishedAt)) ? '· ' + new Date(o.publishedAt).toLocaleString() : '';
        const hears = (v) => (v ? 'version ' + v : 'no notice');
        if (!o.published)
            return { tone: 'off', label: 'Not live · calls connect without a notice', extra: '' };
        if (o.functionExists === false) {
            return { tone: 'problem', label: o.functionMessage || 'The Function is missing in Twilio', extra: '' };
        }
        if (o.voiceUrlMatches === false)
            return { tone: 'problem', label: 'The Twilio app does not point at the Function', extra: when };
        if (o.pending)
            return { tone: 'warn', label: 'Published · the Twilio build is still running', extra: when };
        if (o.needsRepublish)
            return { tone: 'warn', label: 'Republish needed', extra: when };
        if (o.allowListPending)
            return { tone: 'warn', label: 'Allowed countries changed · publish to apply', extra: when };
        if (outboundUnsaved(o))
            return { tone: 'warn', label: 'Unsaved changes', extra: '' };
        if (o.changesPending) {
            return { tone: 'warn', label: 'Saved, not live yet · callers still hear ' + hears(o.publishedNoticeVersion), extra: '' };
        }
        return { tone: 'ok', label: o.publishedNoticeVersion
                ? 'Live · callers hear version ' + o.publishedNoticeVersion
                : 'Live · calls connect without a notice', extra: when };
    }
    function noticeActions(o) {
        const unsaved = outboundUnsaved(o);
        const running = o.publishRunning || o.publishing;
        const busy = running || o.saving || o.unpublishing;
        const out = (label, run, enabled, help, discard = false) => ({ primary: { label, run, enabled: enabled && !busy }, discard, help, removal: o.published });
        if (running)
            return out(PUBLISHING_LABEL, 'publish', false, PUBLISH_CHANGES_HELP);
        if (!o.published) {
            return o.noticeOn
                ? out('Publish notice', 'publish', true, PUBLISH_NOTICE_HELP)
                : out(o.saving ? 'Saving…' : 'Save', 'save', unsaved, SAVE_OFF_HELP);
        }
        const repair = o.functionExists === false ? FUNCTION_MISSING_HELP
            : o.voiceUrlMatches === false ? VOICE_URL_HELP
                : o.needsRepublish ? REPUBLISH_HELP
                    : o.allowListPending ? ALLOW_LIST_HELP : '';
        const toPublish = unsaved || o.changesPending;
        if (!o.noticeOn && (toPublish || o.publishedNoticeVersion > 0)) {
            return out('Turn off notice', 'publish', true, TURN_OFF_HELP);
        }
        if (toPublish)
            return out('Publish changes', 'publish', true, PUBLISH_CHANGES_HELP, unsaved && o.noticeOn);
        if (repair)
            return out('Publish changes', 'publish', true, repair);
        return out('Publish changes', 'publish', false, NO_CHANGES_HELP);
    }
    function liveNotice(o) {
        if (!o.published)
            return null;
        if (!o.publishedNoticeVersion)
            return { quote: '', note: 'No notice plays. Calls connect at once.' };
        if (o.publishedNoticeVersion === o.noticeVersion) {
            return { quote: '\u201C' + (o.savedNoticeText || o.defaultText) + '\u201D', note: '' };
        }
        return { quote: '', note: 'Version ' + o.publishedNoticeVersion + '. The saved text is newer and is not live yet.' };
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
            allowedPrefixes: str(raw.allowedPrefixes),
            allowedSource: str(raw.allowedSource),
            publishedAllowedPrefixes: str(raw.publishedAllowedPrefixes),
            allowListPending: raw.allowListPending === true,
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
    async function asPublishRun(work) {
        store.dispatch(Action.outboundRequest({ op: 'run', phase: 'start' }));
        try {
            await work();
        }
        finally {
            store.dispatch(Action.outboundRequest({ op: 'run', phase: 'done' }));
        }
    }
    function saveAndPublishOutbound(publish = true) {
        return publish ? asPublishRun(() => saveThenPublish(true)) : saveThenPublish(false);
    }
    async function saveThenPublish(publish) {
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
        return asPublishRun(() => publishUntilSettled(true));
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

    const formatPhone = (e164) => {
        const raw = String(e164 || '');
        const m = /^\+1([0-9]{3})([0-9]{3})([0-9]{4})$/.exec(raw);
        return m ? '+1 (' + m[1] + ') ' + m[2] + '-' + m[3] : raw;
    };

    const statusToBadge = (status) => {
        switch (status) {
            case 'pass': return { text: 'Pass', tone: 'ok' };
            case 'fail': return { text: 'Fail', tone: 'problem' };
            case 'warn': return { text: 'Needs action', tone: 'warn' };
            case 'info_enabled': return { text: 'Enabled', tone: 'info' };
            case 'info_disabled': return { text: 'Disabled', tone: 'neutral' };
            case 'unknown': return { text: 'Not checked', tone: 'neutral' };
            case 'not_published': return { text: 'Not published', tone: 'neutral' };
            default: return { text: status || '—', tone: 'neutral' };
        }
    };
    const voiceUrlDriftRow = (drift, outbound) => {
        const row = { label: 'Twilio app points at our dial function' };
        if (outbound.loaded && !outbound.published) {
            return { ...row, status: 'not_published', detail: '' };
        }
        if (outbound.functionExists === false) {
            return { ...row, status: 'fail', detail: outbound.functionMessage ||
                    'The outbound Function is missing in Twilio. Publish again.' };
        }
        if (drift.voiceUrl === 'pass')
            return { ...row, status: 'pass', detail: 'Voice URL matches' };
        if (drift.voiceUrl === 'fail') {
            return { ...row, status: 'fail', detail: 'Voice URL does not point at the published Function.' };
        }
        return { ...row, status: 'unknown', detail: '' };
    };
    const outboundVersionRow = (outbound) => {
        const row = { label: 'Recording notice code is current' };
        if (!outbound.loaded)
            return { ...row, status: 'unknown', detail: '' };
        if (!outbound.published)
            return { ...row, status: 'not_published', detail: '' };
        if (outbound.needsRepublish) {
            return { ...row, status: 'warn', detail: 'A newer version is available. Republish on the Outbound calls page.' };
        }
        return {
            ...row,
            status: 'pass',
            detail: 'Published ' + (outbound.publishedCodeVersion || '—') + ' · installed ' + (outbound.codeVersion || '—')
        };
    };
    const signalRow = (label, sig) => {
        if (!sig || sig.severity === 'unknown')
            return null;
        const status = sig.severity === 'ok' ? 'pass' : sig.severity === 'problem' ? 'fail' : 'warn';
        return { label, status, detail: sig.detail };
    };
    const phoneNumbersDriftRow = (c, health) => {
        const fromSignal = signalRow('Phone numbers still in Twilio', health && health.signals.numberRouting);
        if (fromSignal)
            return fromSignal;
        const row = { label: 'Phone numbers still in Twilio' };
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
    const intelDriftRow = (c, health) => {
        const fromSignal = signalRow('Transcription service auto-transcribes', health && health.signals.intelligence);
        if (fromSignal)
            return fromSignal;
        const row = { label: 'Transcription service auto-transcribes' };
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

    const idOf = (v) => Number(v && typeof v === 'object' ? v.id : v);
    const toIds = (values) => (values || []).map(idOf).filter((n) => !isNaN(n) && n > 0);
    const digitsOf = (v) => String(v || '').replace(/[^0-9]/g, '');
    function presenceTone(row) {
        const s = phoneStatus(row);
        if (s === PHONE_STATUS_OFFLINE)
            return { tone: 'off', label: s.label };
        if (s === PHONE_STATUS_NOT_RECEIVING)
            return { tone: 'warn', label: s.label };
        return { tone: 'ok', label: s.label };
    }
    function employeeNames(state) {
        const employees = (state.console.phonesEmployees || [])
            .map((e) => ({ id: Number(e.id), name: e.name || '' }));
        const names = {};
        (state.console.assignments || [])
            .forEach((a) => { if (a.employeeName)
            names[String(a.employeeId)] = a.employeeName; });
        const nameOf = (id) => employees.find((e) => e.id === id)?.name || names[String(id)] || ('Employee ' + id);
        return { employees, nameOf };
    }
    function tableRows(state) {
        return (state.console.phonesByPhone || []).map((r) => ({
            ...r,
            employeeIds: r.employeeIds.slice(),
            ringId: rowValues(r, {}).primaryEmployeeId
        }));
    }
    function callerIdList(state) {
        const c = state.console;
        if (c.phonesByPhone === null) {
            return c.phonesLoading ? skeleton('lines', 3) : text('Not loaded yet.', { weak: true });
        }
        const rows = tableRows(state);
        const defaultNumber = (c.snapshot || {}).phoneNumber || '';
        const plan = callerIdPlan(rows, defaultNumber);
        const { nameOf } = employeeNames(state);
        const lines = [];
        plan.repIds.forEach((id) => {
            const out = plan.byRep[String(id)];
            lines.push(text(nameOf(id), { strong: true }));
            lines.push(text(out && out.phoneNumber
                ? formatPhone(out.phoneNumber) + (out.ringsThem ? ' · rings this rep' : ' · default (rings for no number)')
                : 'No default caller ID set'));
        });
        return lines.length ? grid('auto minmax(0, 1fr)', lines, Gap.SPACING4X, { rowGap: Gap.SPACING2X })
            : text(rows.length ? 'No rep is assigned to a number yet.' : 'No numbers yet.', { weak: true });
    }
    const ALSO_ASSIGNED_HELP = 'Only the rep under Rings receives this number\'s calls and calls out from it. ' +
        'Also assigned reps are for reference only: they do not ring and do not change caller ID. ' +
        'Saving republishes inbound routing when inbound calls are on (a few seconds).';
    class PhonesPage extends core.PureComponent {
        componentDidMount() {
            const state = store.getState();
            const c = state.console;
            if (c.phonesNumbers === null && !c.phonesLoading)
                loadPhonesData();
            loadPresence();
            if (!state.health.loaded && !state.health.loading)
                loadHealth();
        }
        buildColumns(nameOf, plan) {
            const state = store.getState();
            const routingSig = state.health.signals.numberRouting;
            const routingValue = (routingSig && routingSig.value);
            const presence = state.presence;
            const byEmployee = {};
            presence.items.forEach((p) => { byEmployee[p.employeeId] = p; });
            const nowMs = Date.now() + presence.clockSkewMs;
            const c = state.console;
            return [
                { name: 'number', label: 'Number', stretch: 3, cell: (r) => vstack([
                        text(formatPhone(r.phoneNumber) || '(unknown)', { strong: true }),
                        r.friendlyName && digitsOf(r.friendlyName) !== digitsOf(r.phoneNumber).slice(-10)
                            && digitsOf(r.friendlyName) !== digitsOf(r.phoneNumber) ? help(r.friendlyName) : null
                    ], Gap.NONE) },
                { name: 'rings', label: 'Rings', stretch: 3,
                    cell: (r) => (r.ringId !== null ? text(nameOf(r.ringId)) : text('—', { weak: true })) },
                { name: 'also', label: 'Also assigned', stretch: 3, cell: (r) => {
                        const others = r.employeeIds.filter((id) => id !== r.ringId);
                        return others.length ? text(others.map(nameOf).join(', ')) : text('—', { weak: true });
                    } },
                { name: 'routing', label: 'Routing', stretch: 3, cell: (r) => {
                        if (!routingValue && r.ringId !== null) {
                            return text(state.health.loading ? 'Checking…' : 'Not checked', { weak: true });
                        }
                        const st = routingStatus(r, routingValue);
                        return dotText(st.tone, st.label);
                    } },
                { name: 'phone', label: 'Rep\'s phone', stretch: 4, cell: (r) => {
                        if (r.ringId === null)
                            return text('—', { weak: true });
                        if (!presence.loaded)
                            return text(presence.error ? '—' : 'Loading…', { weak: true });
                        const p = byEmployee[String(r.ringId)];
                        const st = presenceTone(p);
                        return dotText(st.tone, st.label, '· ' + relativeTime(p ? p.lastSeen : '', nowMs).toLowerCase());
                    } },
                { name: 'callsOut', label: 'Calls out from', stretch: 4, cell: (r) => {
                        if (r.ringId === null)
                            return text('—', { weak: true });
                        const out = plan.byRep[String(r.ringId)];
                        const who = firstName(nameOf(r.ringId));
                        if (out && out.phoneNumber === r.phoneNumber)
                            return text(who + ', from this number');
                        return text(who + ', from ' + (out && out.phoneNumber ? formatPhone(out.phoneNumber) : 'the default'));
                    } },
                { name: 'action', label: 'Actions', stretch: 2, cell: (r) => button('Edit', () => { openPhonesEditor(r.phoneSid); }, {
                        small: true,
                        enabled: c.phonesSavingSid === null && c.phonesEditingSid !== r.phoneSid
                    }) }
            ];
        }
        renderEditor(row, employees, nameOf) {
            const c = store.getState().console;
            const values = rowValues(row, c.phonesDrafts);
            const savingThis = c.phonesSavingSid === row.phoneSid;
            const anySaving = c.phonesSavingSid !== null;
            const dirty = !!c.phonesDrafts[row.phoneSid];
            const rowError = c.phonesRowErrors[row.phoneSid];
            const ringId = values.primaryEmployeeId;
            const others = values.employeeIds.filter((id) => id !== ringId);
            const ringsPicker = (jsxRuntime.jsx(component__namespace.Dropdown, { dataSource: new core__namespace.ArrayDataSource(employees), valueMember: "id", displayMember: "name", selectedValue: ringId, allowEmpty: true, placeholder: "No rep (callers hear the no-answer message)", enabled: !savingThis, onSelectionChanged: (sel) => {
                    const id = idOf(sel && sel.value);
                    if (!id || isNaN(id)) {
                        editPhonesRow(row.phoneSid, { employeeIds: [], primaryEmployeeId: null });
                        return;
                    }
                    if (id === ringId)
                        return;
                    editPhonesRow(row.phoneSid, {
                        employeeIds: [id].concat(values.employeeIds.filter((x) => x !== id)),
                        primaryEmployeeId: id
                    });
                }, rootStyle: { width: '100%' } }));
            const alsoChoices = employees.filter((e) => e.id !== ringId);
            const selectedItems = others.map((id) => alsoChoices.find((e) => e.id === id) || { id, name: nameOf(id) });
            const alsoPicker = (jsxRuntime.jsx(component__namespace.MultiselectDropdown, { dataSource: new core__namespace.ArrayDataSource(alsoChoices), valueMember: "id", displayMember: "name", selectedItems: selectedItems, comparator: (l, r) => idOf(l) === idOf(r), placeholder: ringId === null ? 'Pick who rings first' : 'Add reps', enabled: !savingThis && ringId !== null, onSelectionChanged: (args) => {
                    if (ringId === null)
                        return;
                    const picked = toIds(args && args.values).filter((id) => id !== ringId);
                    editPhonesRow(row.phoneSid, { employeeIds: [ringId].concat(picked), primaryEmployeeId: ringId });
                }, rootStyle: { width: '100%' } }));
            const body = [
                cardTitle('Editing ' + formatPhone(row.phoneNumber) + (row.friendlyName ? ' · ' + row.friendlyName : '')),
                grid('minmax(0, 1fr) minmax(0, 1fr)', [
                    vstack([label('Rings'), ringsPicker], Gap.SPACING1X),
                    vstack([label('Also assigned'), alsoPicker], Gap.SPACING1X)
                ], Gap.SPACING4X),
                help(ALSO_ASSIGNED_HELP),
                hstack([
                    button(savingThis ? 'Saving…' : 'Save', () => { savePhonesRow(row.phoneSid); }, {
                        primary: true, small: true, enabled: dirty && !anySaving
                    }),
                    button('Cancel', () => { cancelPhonesRow(row.phoneSid); }, { small: true, enabled: !savingThis })
                ])
            ];
            if (rowError)
                body.push(errorLine(friendlyError(rowError)));
            return card(body, { label: 'Edit number' });
        }
        renderCallerId(state, defaultNumber) {
            const how = card([
                cardTitle('How caller ID works'),
                text('Each rep calls out from the number that rings them, so a callback reaches the same rep. ' +
                    'A rep who rings for no number calls out from the default, ' +
                    (defaultNumber ? formatPhone(defaultNumber) : '(not set)') + '. Also assigned reps do not ring and ' +
                    'do not change caller ID.', { weak: true }),
                button('Change the default under Outbound calls', () => { goToSection('outbound'); }, { link: true, small: true })
            ], { label: 'How caller ID works', fill: true });
            const who = card([cardTitle('Who calls out from what today'), callerIdList(state)], { label: 'Who calls out from what today', fill: true });
            return grid('minmax(0, 1fr) minmax(0, 1fr)', [how, who], Gap.SPACING3X, { stretch: true });
        }
        render() {
            const state = store.getState();
            const c = state.console;
            const { employees, nameOf } = employeeNames(state);
            const defaultNumber = (c.snapshot || {}).phoneNumber || '';
            const refreshing = c.phonesLoading;
            const numbers = (c.phonesNumbers || []);
            const listed = timeOfDay(c.phonesLoadedAt);
            const header = pageHeader('Phones & reps', 'Which rep each Twilio number rings, and the number each rep calls out from.', [
                c.phonesNumbers !== null && !c.phonesListError
                    ? help(numbers.length + (numbers.length === 1 ? ' number' : ' numbers') + ' from Twilio' +
                        (listed ? ' · listed ' + listed : ''))
                    : null,
                button(refreshing ? 'Refreshing…' : 'Refresh from Twilio', () => { loadPhonesData(); }, {
                    enabled: !refreshing, icon: core__namespace.SystemIcon.REFRESH
                })
            ]);
            if (c.phonesByPhone === null && c.phonesLoading) {
                return vstack([
                    header,
                    grid('minmax(0, 1fr) minmax(0, 1fr)', [card([skeleton('lines', 3)]), card([skeleton('lines', 3)])], Gap.SPACING3X, { stretch: true }),
                    card([skeleton('table', 3, 'Loading phones & reps…')])
                ], Gap.SPACING4X);
            }
            const rows = tableRows(state);
            const plan = callerIdPlan(rows, defaultNumber);
            const editingRow = c.phonesEditingSid ? rows.find((r) => r.phoneSid === c.phonesEditingSid) || null : null;
            const routingNumberErrors = c.phonesRoutingErrors.filter((e) => !!e.phoneNumber);
            const routingPublishErrors = c.phonesRoutingErrors.filter((e) => !e.phoneNumber);
            const messages = [
                c.phonesListError ? problemCard('Couldn\'t load phone numbers', friendlyError(c.phonesListError) + ' Your saved assignments are unchanged.', [
                    button(refreshing ? 'Refreshing…' : 'Retry', () => { loadPhonesData(); }, {
                        primary: true, small: true, enabled: !refreshing
                    }),
                    button('Check the connection', () => { goToSection('account'); }, { link: true, small: true })
                ]) : null,
                c.phonesError ? errorLine(friendlyError(c.phonesError)) : null,
                c.phonesHasMore ? help('Only the first 100 Twilio numbers are shown.') : null,
                routingNumberErrors.length ? text('⚠ Inbound routing did not update for: ' +
                    routingNumberErrors.map((e) => formatPhone(e.phoneNumber)).join(', '), { strong: true, small: true }) : null,
                routingPublishErrors.length ? text('⚠ Inbound routing did not publish: ' +
                    routingPublishErrors.map((e) => e.message).join(' '), { strong: true, small: true }) : null
            ];
            let numbersCard;
            if (rows.length === 0) {
                numbersCard = c.phonesListError ? null : emptyCard('No phone numbers yet', 'Buy or port a number in the Twilio Console, then refresh here. Reps can call out before a number rings anyone.', [
                    button(refreshing ? 'Refreshing…' : 'Refresh from Twilio', () => { loadPhonesData(); }, {
                        small: true, enabled: !refreshing
                    }),
                    extLink('Twilio Console', 'https://console.twilio.com/')
                ]);
            }
            else {
                numbersCard = card([
                    table(rows, this.buildColumns(nameOf, plan), { rowHeight: ROW_TWO_LINES }),
                    hstack([
                        dotText('ok', 'CTC routing: calls to the number reach the rep under Rings', undefined, { small: true }),
                        dotText('warn', 'Not routed: the number points somewhere else in Twilio', undefined, { small: true }),
                        dotText('off', 'No rep: calls hear the no-answer message', undefined, { small: true })
                    ], Gap.SPACING4X, { wrap: true })
                ], { label: 'Numbers' });
            }
            return vstack([
                header,
                this.renderCallerId(state, defaultNumber),
                ...messages,
                numbersCard,
                editingRow ? this.renderEditor(editingRow, employees, nameOf) : null
            ], Gap.SPACING4X);
        }
    }

    const openHealthAction = (action) => {
        const r = parseHash(action.route);
        if (r && r.kind === 'section')
            goToSection(r.section);
    };
    function healthCheckAside() {
        const h = store.getState().health;
        const when = timeOfDay(h.checkedAt);
        return [
            when ? text('Checked ' + when, { weak: true, small: true }) : null,
            button(h.loading ? 'Checking…' : 'Check now', () => { loadHealth(); }, {
                enabled: !h.loading, icon: core__namespace.SystemIcon.REFRESH
            })
        ];
    }
    function runAllChecks() {
        rerunPreflight();
        loadHealth();
        loadPresence();
        loadOutbound();
    }
    function checkList(rows) {
        return listTable('minmax(0, 40fr) minmax(0, 45fr) minmax(72px, auto)', [
            { label: 'Check' }, { label: 'Result' }, { label: 'Status', end: true }
        ], rows.map((r) => {
            const link = r.link;
            const b = statusToBadge(r.status || 'unknown');
            return [
                text(r.label || '(unlabeled check)', { strong: true }),
                vstack([
                    text(r.detail || '—', { weak: true }),
                    link ? button(link.label, () => { openHealthAction(link); }, { link: true, small: true }) : null
                ], Gap.NONE, { alignment: component__namespace.StackPanel.Alignment.START }),
                chip(b.text, b.tone)
            ];
        }));
    }
    class HealthPage extends core.PureComponent {
        componentDidMount() {
            loadPresence();
            loadHealth();
            const outbound = store.getState().outbound;
            if (!outbound.loaded && !outbound.loading)
                loadOutbound();
        }
        renderSetup(state) {
            const c = state.console;
            const checks = c.preflight;
            const running = !!c.preflightRefreshing || (c.loading && checks === null);
            const passed = (checks || []).filter((ch) => ch.status === 'pass').length;
            const total = (checks || []).length;
            const body = [
                hstack([
                    cardTitle('Setup checks'),
                    total ? chip(passed + ' of ' + total + ' pass', passed === total ? 'ok'
                        : (checks || []).some((ch) => ch.status === 'fail') ? 'problem' : 'warn') : null
                ], Gap.SPACING2X)
            ];
            if (c.preflightError)
                body.push(errorLine('The checks did not run: ' + friendlyError(c.preflightError)));
            if (checks === null)
                body.push(running ? skeleton('table', 5, 'Running checks…') : help('Click Run checks.'));
            else if (!checks.length)
                body.push(text('No checks returned.', { weak: true }));
            else
                body.push(checkList(checks));
            return card(body, { label: 'Setup checks', fill: true });
        }
        renderDrift(state) {
            const c = state.console;
            const routing = signalRow('Inbound routing matches Phones & reps', state.health.signals.routingChanged);
            const rows = [
                voiceUrlDriftRow((c.drift || {}), state.outbound),
                outboundVersionRow(state.outbound),
                phoneNumbersDriftRow(c, state.health),
                intelDriftRow(c, state.health),
                routing
                    ? { ...routing, link: { label: 'Inbound calls', route: '#/inbound' } }
                    : { label: 'Inbound routing matches Phones & reps', status: 'unknown', detail: '' }
            ];
            const needs = rows.filter((r) => r.status === 'fail' || r.status === 'warn').length;
            return card([
                hstack([
                    cardTitle('Drift checks'),
                    chip(needs ? needs + ' needs action' : 'All match', needs ? 'warn' : 'ok'),
                    help('NetSuite vs. live Twilio')
                ], Gap.SPACING2X, { wrap: true }),
                state.health.error ? errorLine('Some checks did not load: ' + friendlyError(state.health.error)) : null,
                checkList(rows)
            ], { label: 'Drift checks', fill: true });
        }
        renderPhones(state) {
            const presence = state.presence;
            const nowMs = Date.now() + presence.clockSkewMs;
            const body = [
                grid('auto minmax(0, 1fr) auto', [
                    cardTitle('Rep phones'),
                    help('A rep receives calls only while a phone is open in the browser.'),
                    button(presence.loading ? 'Refreshing…' : 'Refresh', () => { loadPresence(); }, {
                        small: true, enabled: !presence.loading, icon: core__namespace.SystemIcon.REFRESH
                    })
                ], Gap.SPACING3X)
            ];
            if (presence.error) {
                body.push(errorLine('Phone status did not load: ' + friendlyError(presence.error)));
            }
            if (!presence.loaded) {
                if (!presence.error)
                    body.push(skeleton('table', 3, 'Loading phones…'));
            }
            else if (presence.items.length === 0) {
                body.push(text('No rep has opened a phone yet.', { weak: true }));
            }
            else {
                body.push(table(presence.items, [
                    { name: 'rep', label: 'Rep', stretch: 3, cell: (r) => text(r.employeeName || '(unnamed rep)', { strong: true }) },
                    { name: 'status', label: 'Status', stretch: 3, cell: (r) => {
                            const s = presenceTone(r);
                            return dotText(s.tone, s.label);
                        } },
                    { name: 'seen', label: 'Last seen', stretch: 2, cell: (r) => {
                            const iso = r.lastSeen || '';
                            return text(relativeTime(iso, nowMs), { title: exactTime(iso) || undefined });
                        } },
                    { name: 'client', label: 'Browser', stretch: 3, cell: (r) => text(r.client || '—', { weak: !r.client }) },
                    { name: 'incoming', label: 'Incoming calls', stretch: 2,
                        cell: (r) => (!r.state ? text('—', { weak: true }) : text(r.incomingGranted ? 'Allowed' : 'Off')) },
                    { name: 'error', label: 'Last error', stretch: 4,
                        cell: (r) => (r.lastError ? help(r.lastError) : text('—', { weak: true })) }
                ]));
            }
            return card(body, { label: 'Rep phones' });
        }
        renderVersions(state) {
            const o = state.outbound;
            const item = (label, value) => vstack([help(label), text(value)], Gap.SPACING1X);
            return card([
                cardTitle('Versions'),
                grid('repeat(5, minmax(0, 1fr))', [
                    item('Dial function code', o.loaded
                        ? (o.codeVersion || '—') + (o.published ? ' · published ' + (o.publishedCodeVersion || '—') : ' · not published')
                        : '—'),
                    item('Recording notice live', o.loaded && o.published
                        ? (o.publishedNoticeVersion ? 'version ' + o.publishedNoticeVersion : 'no notice') : '—')
                ], Gap.SPACING3X)
            ], { label: 'Versions' });
        }
        render() {
            const state = store.getState();
            const c = state.console;
            const running = !!c.preflightRefreshing || state.health.loading;
            const last = [c.preflightAt, state.health.checkedAt].filter(Boolean).sort().pop() || '';
            const when = timeOfDay(last);
            const header = pageHeader('Health', 'Setup checks, drift between NetSuite and Twilio, rep phones and versions.', [
                when ? text('Last run ' + when, { weak: true, small: true }) : null,
                button(running ? 'Running…' : 'Run checks', () => { runAllChecks(); }, { primary: true, enabled: !running })
            ]);
            if (!state.health.loaded && state.health.error && c.preflight === null && c.preflightError) {
                return vstack([header, problemCard('Couldn\'t run the checks', friendlyError(state.health.error) +
                        ' Nothing was changed.', [button('Retry', () => { runAllChecks(); }, { primary: true, small: true })])], Gap.SPACING4X);
            }
            return vstack([
                header,
                grid('minmax(0, 1fr) minmax(0, 1fr)', [this.renderSetup(state), this.renderDrift(state)], Gap.SPACING3X, { stretch: true }),
                this.renderPhones(state),
                this.renderVersions(state)
            ], Gap.SPACING4X);
        }
    }

    const PENDING = { metric: '…', metadata: '', tone: null, text: 'Checking…' };
    function statusLine$1(active, inboundOn, checks, at, running, failed) {
        if (active === false)
            return 'Reps cannot place or receive calls until you resume.';
        const can = inboundOn === false ? 'Reps can place calls; inbound calls are off.' : 'Reps can place and receive calls.';
        if (running)
            return can + ' Running checks…';
        if (failed || !checks)
            return can + (failed ? ' The checks did not run.' : '');
        const passed = checks.filter((c) => c.status === 'pass').length;
        const twilio = checks.find((c) => c.id === 'twilio_reachable');
        const parts = [];
        if (twilio)
            parts.push(twilio.status === 'pass' ? 'Twilio connected' : 'Twilio not reachable');
        const when = timeOfDay(at);
        parts.push((passed === checks.length ? 'checks passed' : passed + ' of ' + checks.length + ' checks passed') +
            (when ? ' at ' + when : ''));
        return can + ' ' + parts.join(' · ') + '.';
    }
    class OverviewPage extends core.PureComponent {
        componentDidMount() {
            loadHealth();
        }
        kpiCard(title, kpi, section) {
            const description = kpi.tone
                ? dotText(kpi.tone, kpi.text, undefined, { small: true })
                : text(kpi.text, { weak: true, small: true });
            try {
                return component__namespace.Card.metric({
                    title,
                    metric: kpi.metric,
                    metadata: kpi.metadata,
                    description,
                    action: () => { goToSection(section); },
                    cardOptions: { classList: ['ctc-card'] }
                });
            }
            catch (e) {
                return card([text(title, { weak: true, small: true }), text(kpi.metric + ' ' + kpi.metadata, { strong: true }),
                    description, button('Open', () => { goToSection(section); }, { small: true, link: true })]);
            }
        }
        renderStatus(state) {
            const c = state.console;
            const snap = (c.snapshot || {});
            const routing = state.health.signals.routingChanged;
            const inboundOn = routing && routing.value
                ? routing.value.inboundEnabled === true : null;
            const tone = snap.active === false ? 'warn' : snap.active === true ? 'ok' : 'off';
            const title = snap.active === false ? 'Paused' : snap.active === true ? 'Active' : 'Unknown';
            const running = !!c.preflightRefreshing || (c.loading && c.preflight === null);
            return card([
                grid('auto minmax(0, 1fr) auto', [
                    dot(tone),
                    vstack([
                        new component__namespace.Text({ text: title, size: component__namespace.Text.Size.L, weight: component__namespace.Text.Weight.BOLD,
                            classList: ['ctc-t-status'] }),
                        text(statusLine$1(snap.active, inboundOn, c.preflight, c.preflightAt, running, !!c.preflightError), { weak: true, small: true })
                    ], Gap.SPACING1X),
                    jsxRuntime.jsx(PauseControl, { tick: this.props.tick })
                ], Gap.SPACING3X)
            ], { label: 'Status' });
        }
        renderKpis(state) {
            const h = state.health;
            const value = (key) => {
                const s = h.signals[key];
                return s && s.value ? s.value : null;
            };
            const waiting = !h.loaded && (h.loading || !h.error);
            const nowMs = Date.now() + state.presence.clockSkewMs;
            const kpi = (v) => (waiting ? PENDING : v);
            return grid('repeat(4, minmax(0, 1fr))', [
                this.kpiCard('Numbers routed', kpi(numbersRoutedKpi(value('numberRouting'))), 'phones'),
                this.kpiCard('Reps receiving now', kpi(repsReceivingKpi(value('repPhones'), (iso) => relativeTime(iso, nowMs))), 'health'),
                this.kpiCard('Waiting for transcripts', kpi(backlogKpi(value('transcriptBacklog'))), 'transcripts'),
                this.kpiCard('Missed-call sync', kpi(missedCallSyncKpi(value('pollerRuns'))), 'transcripts')
            ], Gap.SPACING3X, { stretch: true });
        }
        renderCallCentral() {
            return card([
                grid('auto minmax(0, 1fr) auto', [
                    new component__namespace.Image({
                        image: core__namespace.SystemIcon.INSIGHT,
                        size: component__namespace.Image.Size.M,
                        color: core__namespace.ImageConstant.Color.INFO,
                        presentation: true,
                        classList: ['ctc-icon-tile']
                    }),
                    vstack([
                        text('Call Central', { strong: true }),
                        text('Calls, follow-ups and missed calls for the whole team. Reps see their own view from the dashboard.', { weak: true, small: true })
                    ], Gap.SPACING1X),
                    openButton('Open Call Central', CALL_CENTRAL_URL)
                ], Gap.SPACING3X)
            ], { label: 'Call Central' });
        }
        attentionRow(item, first) {
            const action = item.action;
            return grid('20px minmax(0, 1fr) auto', [
                dot(item.severity === 'problem' ? 'problem' : 'warn'),
                vstack([text(item.title, { strong: true }), item.detail ? help(item.detail) : null], Gap.SPACING1X),
                action ? button(action.label, () => { openHealthAction(action); }, { small: true, primary: first }) : null
            ], Gap.SPACING3X);
        }
        renderAttention(state) {
            const h = state.health;
            const items = h.attention.filter((i) => i.severity === 'problem' || i.severity === 'warn');
            const when = timeOfDay(h.checkedAt);
            const header = hstack([
                cardTitle('Needs attention'),
                h.loaded && items.length ? chip(String(items.length), 'warn') : null,
                when ? help((h.loading ? 'Checking… · updated ' : 'Updated ') + when) : (h.loading ? help('Checking…') : null)
            ], Gap.SPACING2X, { growLast: true });
            const body = [header];
            if (!h.loaded) {
                if (h.error) {
                    body.push(errorLine('The health checks did not load: ' + friendlyError(h.error)));
                    body.push(hstack([
                        button('Retry', () => { loadHealth(); }, { primary: true, small: true }),
                        button('Check the connection', () => { goToSection('account'); }, { link: true, small: true })
                    ], Gap.SPACING2X));
                }
                else {
                    body.push(skeleton('lines', 3, 'Checking…'));
                }
            }
            else if (!items.length) {
                body.push(text('Nothing needs attention.', { weak: true }));
            }
            else {
                items.forEach((item, i) => {
                    body.push(divider());
                    body.push(this.attentionRow(item, i === 0));
                });
            }
            if (h.loaded && h.error)
                body.push(errorLine('The last check did not finish: ' + friendlyError(h.error)));
            return card(body, { label: 'Needs attention', gap: Gap.SPACING2X });
        }
        render() {
            const state = store.getState();
            const assignments = state.console.assignments;
            let subtitle = 'Click-to-Call';
            if (assignments) {
                const phones = {};
                const reps = {};
                assignments.forEach((a) => {
                    if (a.phoneSid)
                        phones[a.phoneSid] = true;
                    if (a.employeeId != null)
                        reps[String(a.employeeId)] = true;
                });
                const n = Object.keys(phones).length;
                const r = Object.keys(reps).length;
                subtitle += ' · ' + n + (n === 1 ? ' number' : ' numbers') + ' · ' + r + (r === 1 ? ' rep' : ' reps');
            }
            return vstack([
                pageHeader('Overview', subtitle),
                this.renderStatus(state),
                this.renderKpis(state),
                this.renderCallCentral(),
                this.renderAttention(state)
            ], Gap.SPACING4X);
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
            loadHealth();
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
            loadHealth();
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
    const lower = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
    const noStop = (s) => String(s || '').replace(/\.$/, '');
    const switchControl = (label, value, onChange, enabled = true) => (jsxRuntime.jsx(component__namespace.Switch, { label: label, value: value, enabled: enabled, action: (args) => { onChange(!!(args && args.value)); } }));
    const setField = (changes) => {
        store.dispatch(Action.inboundFieldChange(changes));
    };
    class InboundPage extends core.PureComponent {
        constructor(props, context) {
            super(props, context);
            this.state = { confirmOff: false };
        }
        onMasterSwitch = (on) => {
            const inbound = store.getState().inbound;
            if (!on && inbound.inboundEnabled && inbound.saved && inbound.saved.inboundEnabled) {
                this.setState({ confirmOff: true });
                return;
            }
            this.setState({ confirmOff: false });
            setField({ inboundEnabled: on });
        };
        componentDidMount() {
            const state = store.getState();
            if (!state.inbound.loaded && !state.inbound.loading)
                loadInbound();
            loadPresence();
            if (!state.health.loaded && !state.health.loading)
                loadHealth();
        }
        renderStatusBar(state) {
            const inbound = state.inbound;
            const busy = inbound.saving || inbound.publishing;
            const changes = countInboundChanges(inbound, inbound.saved);
            const sig = state.health.signals.routingChanged;
            const parts = [];
            if (changes)
                parts.push(changes + (changes === 1 ? ' unsaved change' : ' unsaved changes'));
            if (sig && (sig.severity === 'warn' || sig.severity === 'problem') && sig.detail) {
                parts.push(parts.length ? lower(noStop(sig.detail)) : noStop(sig.detail));
            }
            if (!parts.length)
                parts.push(inbound.inboundEnabled ? 'No unsaved changes' : 'Inbound calls are off');
            const tone = sig && sig.severity === 'problem' ? 'problem'
                : changes || (sig && sig.severity === 'warn') ? 'warn'
                    : inbound.inboundEnabled ? 'ok' : 'off';
            const primaryLabel = inbound.saving || inbound.publishing ? 'Publishing…'
                : changes ? 'Save & publish' : 'Publish again';
            const bar = grid('auto minmax(0, 1fr) auto auto', [
                switchControl('Ring reps in the browser', inbound.inboundEnabled && !this.state.confirmOff, this.onMasterSwitch, !busy && !this.state.confirmOff),
                dotText(tone, parts.join(' · '), '· ' + statusLine(inbound).replace(/^Published/, 'published')),
                button('Discard', () => { if (inbound.saved)
                    setField(inbound.saved); }, { enabled: changes > 0 && !busy }),
                button(primaryLabel, () => { if (changes)
                    saveInbound();
                else
                    publishRouting(); }, {
                    primary: true, enabled: !busy
                })
            ], Gap.SPACING4X);
            const errors = (inbound.lastPublish && inbound.lastPublish.errors) || [];
            const failure = publishFailureText(inbound);
            return card([
                bar,
                this.state.confirmOff ? hstack([
                    text('Every number will hear the no-answer message after you publish.', { small: true }),
                    button('Turn off', () => {
                        this.setState({ confirmOff: false });
                        setField({ inboundEnabled: false });
                    }, { small: true }),
                    button('Keep on', () => { this.setState({ confirmOff: false }); }, { small: true })
                ], Gap.SPACING2X, { wrap: true }) : null,
                inbound.saveError ? problemCard('Save failed', friendlyError(inbound.saveError) + ' Nothing was published.') : null,
                failure ? errorLine(failure) : null,
                ...errors.map((e) => errorLine((e.phoneNumber ? formatPhone(e.phoneNumber) + ': ' : '') + e.message)),
                !inbound.inboundEnabled && inbound.flowSid ? text(OFF_STILL_ROUTED_WARNING, { strong: true, small: true }) : null,
                !inbound.inboundEnabled && !inbound.flowSid
                    ? help('Off: phones do not ring; callers hear the no-answer message.') : null,
                help('Open phones pick up a change within an hour, or at once after a reload.')
            ], { label: 'Inbound status', gap: Gap.SPACING2X });
        }
        stepRow(n, title, helpText, controls) {
            return grid('28px 240px minmax(0, 1fr)', [
                stepBadge(n),
                vstack([text(title, { strong: true }), typeof helpText === 'string' ? help(helpText) : helpText], Gap.SPACING1X),
                vstack(controls, Gap.SPACING3X)
            ], Gap.SPACING4X);
        }
        renderSteps(state) {
            const inbound = state.inbound;
            const ringOptions = RING_SECONDS.indexOf(inbound.ringSeconds) >= 0
                ? RING_SECONDS
                : RING_SECONDS.concat([inbound.ringSeconds]).sort((x, y) => x - y);
            const vmOptions = VOICEMAIL_SECONDS.indexOf(inbound.voicemailMaxSeconds) >= 0
                ? VOICEMAIL_SECONDS
                : VOICEMAIL_SECONDS.concat([inbound.voicemailMaxSeconds]).sort((x, y) => x - y);
            const showNotice = inbound.recordInbound && inbound.recordingNoticeOn;
            const recording = [
                switchControl('Record inbound calls', inbound.recordInbound, (v) => setField({ recordInbound: v })),
                switchControl('Play a recording notice first', inbound.recordingNoticeOn, (v) => setField({ recordingNoticeOn: v }), inbound.recordInbound),
                showNotice ? field('Notice text', jsxRuntime.jsx(component__namespace.TextArea, { text: inbound.recordingNotice, placeholder: DEFAULT_RECORDING_NOTICE, maxLength: RECORDING_NOTICE_MAX_LENGTH, rowCount: 2, onTextChanged: (args) => {
                        setField({ recordingNotice: ((args && args.text) || '').slice(0, RECORDING_NOTICE_MAX_LENGTH) });
                    }, rootStyle: { width: '100%' } }), help('Have your legal counsel approve the wording.')) : null
            ];
            const ring = [
                field('Ring for', jsxRuntime.jsx(component__namespace.Dropdown, { dataSource: new core__namespace.ArrayDataSource(ringOptions.map((n) => ({ value: n, label: n + ' seconds' }))), valueMember: "value", displayMember: "label", selectedValue: inbound.ringSeconds, onSelectionChanged: (args) => {
                        const n = Number(args && args.value);
                        if (n > 0)
                            setField({ ringSeconds: n });
                    }, rootStyle: { width: '200px' } }))
            ];
            const noAnswer = [
                field('Message', jsxRuntime.jsx(component__namespace.TextArea, { text: inbound.noAnswerMessage, placeholder: inbound.voicemailOn ? DEFAULT_VOICEMAIL_GREETING : DEFAULT_NO_ANSWER_MESSAGE, maxLength: NO_ANSWER_MAX_LENGTH, rowCount: 2, onTextChanged: (args) => {
                        setField({ noAnswerMessage: ((args && args.text) || '').slice(0, NO_ANSWER_MAX_LENGTH) });
                    }, rootStyle: { width: '100%' } })),
                hstack([
                    switchControl('Take a voicemail', inbound.voicemailOn, (v) => setField({ voicemailOn: v })),
                    text('up to', { weak: true, small: true }),
                    jsxRuntime.jsx(component__namespace.Dropdown, { dataSource: new core__namespace.ArrayDataSource(vmOptions.map((n) => ({ value: n, label: voicemailLengthLabel(n) }))), valueMember: "value", displayMember: "label", selectedValue: inbound.voicemailMaxSeconds, enabled: inbound.voicemailOn, ariaLabel: "Longest voicemail", onSelectionChanged: (args) => {
                            const n = Number(args && args.value);
                            if (n > 0)
                                setField({ voicemailMaxSeconds: n });
                        }, rootStyle: { width: '160px' } })
                ], Gap.SPACING3X, { wrap: true }),
                help(inbound.voicemailOn
                    ? 'After the message, callers can leave a voicemail. It is transcribed and logged as a Phone Call.'
                    : 'Off: callers hear the message and the call ends.')
            ];
            const ownerChoices = [{ value: '', label: 'Not set' }].concat(inbound.employees.map((e) => ({ value: e.id, label: e.name })));
            const nameOfOwner = (id) => (ownerChoices.find((o) => o.value === id) || { label: id }).label;
            const savedOwner = inbound.saved ? inbound.saved.fallbackOwnerId : inbound.fallbackOwnerId;
            const owner = [
                field('Owner', jsxRuntime.jsx(component__namespace.Dropdown, { dataSource: new core__namespace.ArrayDataSource(ownerChoices), valueMember: "value", displayMember: "label", selectedValue: inbound.fallbackOwnerId, onSelectionChanged: (args) => {
                        setField({ fallbackOwnerId: args && args.value != null ? String(args.value) : '' });
                    }, rootStyle: { width: '320px' } })),
                !inbound.fallbackOwnerId
                    ? dotText('warn', 'Not set: calls and voicemails that reach no rep are not logged.', undefined, { small: true })
                    : savedOwner !== inbound.fallbackOwnerId
                        ? dotText('warn', 'Was "' + nameOfOwner(savedOwner) + '"' +
                            (savedOwner ? '' : ': those calls were not logged') + '. Save to apply.', undefined, { small: true })
                        : null,
                help('Also used when a number has no rep, or its rep is inactive.')
            ];
            return card([
                cardTitle('What a caller experiences'),
                help('In call order. Off at the top: every number hears the no-answer message instead.'),
                divider(),
                this.stepRow(1, 'Recording notice', 'Plays before the phone rings.', recording),
                divider(),
                this.stepRow(2, 'Ring the rep', hstack([
                    help('The rep under Rings in'),
                    button('Phones & reps', () => { goToSection('phones'); }, { link: true, small: true })
                ], Gap.SPACING1X, { wrap: true }), ring),
                divider(),
                this.stepRow(3, 'No answer', 'When the rep does not pick up in time.', noAnswer),
                divider(),
                this.stepRow(4, 'Logged to', 'Owner of calls and voicemails that reach no rep.', owner)
            ], { label: 'What a caller experiences', gap: Gap.SPACING3X });
        }
        routingColumns(state) {
            const presence = state.presence;
            const byEmployee = {};
            presence.items.forEach((p) => { byEmployee[p.employeeId] = p; });
            const nowMs = Date.now() + presence.clockSkewMs;
            const also = {};
            (state.console.assignments || []).forEach((a) => {
                if (!a.phoneSid)
                    return;
                (also[a.phoneSid] = also[a.phoneSid] || []).push(String(a.employeeId) + '|' + (a.employeeName || ''));
            });
            return [
                { name: 'number', label: 'Number', stretch: 3, cell: (r) => text(formatPhone(r.phoneNumber), { strong: true }) },
                { name: 'rings', label: 'Rings', stretch: 3, cell: (r) => text(r.employeeName || '') },
                { name: 'also', label: 'Also assigned', stretch: 3, cell: (r) => {
                        if (state.console.assignments === null)
                            return text('—', { weak: true });
                        const names = (also[r.phoneSid] || [])
                            .filter((v) => v.split('|')[0] !== String(r.employeeId))
                            .map((v) => v.split('|').slice(1).join('|'))
                            .filter(Boolean);
                        return names.length ? text(names.join(', ')) : text('—', { weak: true });
                    } },
                { name: 'phone', label: 'Rep\'s phone', stretch: 4, cell: (r) => {
                        if (!presence.loaded)
                            return text(presence.error ? '—' : 'Loading…', { weak: true });
                        const id = r.employeeId;
                        const p = id == null ? undefined : byEmployee[String(id)];
                        const st = presenceTone(p);
                        return dotText(st.tone, st.label, '· ' + relativeTime(p ? p.lastSeen : '', nowMs).toLowerCase());
                    } }
            ];
        }
        renderRouting(state) {
            const inbound = state.inbound;
            const sig = state.health.signals.routingChanged;
            const since = !sig ? (state.health.loading ? 'Checking…' : 'Not checked')
                : sig.severity === 'ok' ? 'No change: ' + lower(sig.detail)
                    : sig.detail;
            const sinceTone = !sig || sig.severity === 'unknown' ? 'off'
                : sig.severity === 'ok' ? 'ok' : sig.severity === 'problem' ? 'problem' : 'warn';
            return card([
                grid('minmax(0, 1fr) auto', [
                    cardTitle('Routing'),
                    button('Change in Phones & reps', () => { goToSection('phones'); }, { link: true, small: true })
                ], Gap.SPACING3X),
                hstack([text('Since last publish:', { weak: true, small: true }), dotText(sinceTone, since, undefined, { small: true })], Gap.SPACING2X, { wrap: true }),
                inbound.routes.length === 0
                    ? text('No numbers have reps yet. Assign reps on Phones & reps.', { weak: true })
                    : table(inbound.routes, this.routingColumns(state))
            ], { label: 'Routing' });
        }
        render() {
            const state = store.getState();
            const inbound = state.inbound;
            const header = pageHeader('Inbound calls', 'How calls to your Twilio numbers reach reps.');
            if (inbound.loading || (!inbound.loaded && !inbound.loadError)) {
                return vstack([
                    header,
                    card([skeleton('lines', 2, 'Loading inbound settings…')]),
                    card([skeleton('lines', 6)]),
                    card([skeleton('table', 3)])
                ], Gap.SPACING4X);
            }
            if (!inbound.loaded) {
                return vstack([header, problemCard('Couldn\'t load inbound settings', friendlyError(inbound.loadError || 'Could not load inbound settings') + ' Nothing was changed.', [
                        button('Retry', () => { loadInbound(); }, { primary: true, small: true }),
                        button('Check the connection', () => { goToSection('account'); }, { link: true, small: true })
                    ])], Gap.SPACING4X);
            }
            return vstack([
                header,
                this.renderStatusBar(state),
                this.renderSteps(state),
                this.renderRouting(state)
            ], Gap.SPACING4X);
        }
    }

    const REPUBLISH_WARNING = 'A newer version is available. Republish to update.';
    const VOICE_URL_WARNING = 'Your TwiML App\'s Voice URL no longer points at the published Function.';
    const STEP_STATUS = {
        ok: { check: 'pass', text: 'Done' },
        skipped: { check: 'info_disabled', text: 'Skipped' },
        failed: { check: 'fail', text: 'Failed' },
        pending: { check: 'info_enabled', text: 'Pending' }
    };
    const stepLine = (step) => {
        const s = STEP_STATUS[step.status];
        return grid('18px minmax(0, 1fr) auto', [
            jsxRuntime.jsx(StatusIcon, { status: s.check, size: component__namespace.Image.Size.S }),
            text(step.label, { small: true }),
            help(step.status === 'failed' && step.detail ? 'Failed · ' + step.detail
                : step.detail ? s.text + ' · ' + step.detail : s.text)
        ], Gap.SPACING2X);
    };
    const isBusy = (o) => o.saving || o.publishing || o.publishRunning || o.unpublishing;
    class OutboundNotice extends core.PureComponent {
        componentDidMount() {
            const outbound = store.getState().outbound;
            if (!outbound.loaded && !outbound.loading) {
                loadOutbound();
            }
        }
        renderLeft(outbound, busy) {
            const max = outbound.maxLength;
            return vstack([
                jsxRuntime.jsx(component__namespace.Switch, { label: "Play a notice before the call connects", value: outbound.noticeOn, enabled: !busy, action: (args) => {
                        store.dispatch(Action.outboundFieldChange({ noticeOn: !!(args && args.value) }));
                    } }),
                help('The person called hears it after they answer; the rep hears ringing. Recording starts after ' +
                    'the notice, so the notice is not in the transcript. Every outbound call is recorded.'),
                outbound.noticeOn ? field('Notice', jsxRuntime.jsx(component__namespace.TextArea, { text: outbound.noticeText, placeholder: outbound.defaultText, maxLength: max, rowCount: 3, enabled: !busy, onTextChanged: (args) => {
                        store.dispatch(Action.outboundFieldChange({
                            noticeText: ((args && args.text) || '').slice(0, max)
                        }));
                    }, rootStyle: { width: '100%' } }), help('Have your legal counsel approve the wording.')) : null
            ], Gap.SPACING3X);
        }
        renderRight(outbound, busy) {
            const steps = outbound.steps || [];
            const live = liveNotice(outbound);
            const when = dateTime(outbound.publishedAt);
            const liveBody = live ? [
                live.quote ? text(live.quote, { classList: ['ctc-quote'] }) : null,
                live.note ? text(live.note, { weak: true }) : null,
                when ? help('Published ' + when) : null,
                outbound.functionUrl ? help('Function URL: ' + outbound.functionUrl) : null
            ] : [text('Nothing is live yet.', { weak: true })];
            return vstack([
                vstack([label('Live in Twilio'), ...liveBody], Gap.SPACING1X),
                outbound.published && outbound.voiceUrlMatches === false ? dotText('problem', VOICE_URL_WARNING, undefined, { small: true }) : null,
                outbound.published && outbound.needsRepublish ? dotText('warn', REPUBLISH_WARNING, undefined, { small: true }) : null,
                steps.length ? vstack([label('Last publish'), vstack(steps.map(stepLine), Gap.SPACING1X)], Gap.SPACING1X) : null,
                outbound.pending && !outbound.publishing && !outbound.publishRunning ? hstack([
                    help('The Twilio build is still running.'),
                    button('Check again', () => { resumePublishOutbound(); }, {
                        small: true, enabled: !busy, icon: core__namespace.SystemIcon.REFRESH
                    })
                ], Gap.SPACING2X, { wrap: true }) : null
            ], Gap.SPACING3X);
        }
        renderActions(outbound, busy) {
            const a = noticeActions(outbound);
            return hstack([
                button(a.primary.label, () => { saveAndPublishOutbound(a.primary.run === 'publish'); }, {
                    primary: true, enabled: a.primary.enabled
                }),
                a.discard ? button('Discard changes', () => {
                    store.dispatch(Action.outboundFieldChange({
                        noticeOn: outbound.savedNoticeOn,
                        noticeText: outbound.savedNoticeText
                    }));
                }, { enabled: !busy }) : null,
                help(a.help)
            ], Gap.SPACING2X, { wrap: true, growLast: true });
        }
        renderRemoval(outbound, busy) {
            const action = outbound.confirmUnpublish || outbound.unpublishing
                ? hstack([
                    text(REMOVE_CONFIRM_TEXT, { strong: true }),
                    button(outbound.unpublishing ? 'Removing…' : 'Remove', () => { unpublishOutbound(); }, {
                        danger: true, small: true, enabled: !busy
                    }),
                    button('Cancel', () => { store.dispatch(Action.outboundConfirmUnpublish(false)); }, {
                        small: true, enabled: !busy
                    })
                ], Gap.SPACING2X, { wrap: true })
                : button('Remove from Twilio…', () => { store.dispatch(Action.outboundConfirmUnpublish(true)); }, {
                    quietDanger: true, enabled: !busy
                });
            return [
                divider(),
                grid('minmax(0, 1fr) auto', [
                    vstack([label('Remove from Twilio'), text(removeBody(outbound.prevVoiceUrl))], Gap.SPACING1X),
                    action
                ], Gap.SPACING4X)
            ];
        }
        render() {
            const outbound = store.getState().outbound;
            if (outbound.loading || (!outbound.loaded && !outbound.loadError)) {
                return card([cardTitle('Recording notice'), skeleton('lines', 4, 'Loading recording notice…')], { label: 'Recording notice' });
            }
            if (!outbound.loaded) {
                return problemCard('Couldn\'t load the recording notice', friendlyError(outbound.loadError || 'Could not load the outbound recording notice') +
                    ' Nothing was changed.', [button('Retry', () => { loadOutbound(); }, { primary: true, small: true })]);
            }
            const busy = isBusy(outbound);
            const head = noticeStatus(outbound);
            return vstack([
                card([
                    hstack([cardTitle('Recording notice'), dotText(head.tone, head.label, head.extra)], Gap.SPACING3X, {
                        justification: component__namespace.StackPanel.Justification.SPACE_BETWEEN, wrap: true
                    }),
                    grid('minmax(0, 1fr) minmax(0, 1fr)', [this.renderLeft(outbound, busy), this.renderRight(outbound, busy)], Gap.SPACING5X),
                    outbound.error ? errorLine(friendlyError(outbound.error)) : null,
                    ...(outbound.published ? this.renderRemoval(outbound, busy) : [])
                ], { label: 'Recording notice', gap: Gap.SPACING4X }),
                this.renderActions(outbound, busy)
            ], Gap.SPACING3X);
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

    const TWILIO_DOCS = {
        twimlApp: 'https://www.twilio.com/docs/usage/api/applications',
        phoneNumber: 'https://www.twilio.com/docs/phone-numbers/api/incomingphonenumber-resource',
        intelService: 'https://www.twilio.com/docs/voice/intelligence'
    };
    const VOICE_FIELD_SPECS = {
        twimlAppSid: {
            field: 'twimlAppSid',
            label: 'TwiML Application',
            helpText: 'Outbound calls use this app. When you publish the recording ' +
                'notice, the console points its Voice URL at a Twilio Function in your account.',
            docUrl: TWILIO_DOCS.twimlApp
        },
        phoneNumber: {
            field: 'phoneNumber',
            label: 'Default caller ID',
            helpText: 'Reps who ring for no number call out from this number. A rep ' +
                'who rings for a number calls out from that number (Phones & reps).',
            docUrl: TWILIO_DOCS.phoneNumber
        },
        intelServiceSid: {
            field: 'intelServiceSid',
            label: 'Intelligence service',
            helpText: 'Twilio Conversational Intelligence, in your Twilio account. ' +
                'It turns call recordings into transcripts.',
            docUrl: TWILIO_DOCS.intelService,
            allowEmpty: true
        }
    };
    const listKeyFor = (field) => {
        switch (field) {
            case 'twimlAppSid': return 'twimlApps';
            case 'phoneNumber': return 'phoneNumbers';
            case 'intelServiceSid': return 'intelServices';
        }
    };
    const startVoiceEdit = (spec) => {
        const snap = (store.getState().console.snapshot || {});
        store.dispatch(Action.voiceFieldEdit(spec.field, snap[spec.field] || ''));
        loadVoiceLists();
    };
    const cancelVoiceEdit = () => {
        store.dispatch(Action.voiceFieldEdit(null, null));
    };
    const onPendingChange = (args) => {
        const value = (args && args.value) || null;
        store.dispatch(Action.voiceFieldEdit(store.getState().console.voiceEditing, value));
    };
    const optionsFor = (field, list) => list.map((it) => {
        if (field === 'phoneNumber') {
            return {
                value: it.phoneNumber || '',
                label: formatPhone(it.phoneNumber) + (it.friendlyName ? '  —  ' + it.friendlyName : '')
            };
        }
        return {
            value: it.sid || '',
            label: (it.friendlyName || '(unnamed)') + (it.sid ? '  [' + it.sid + ']' : '')
        };
    });
    const effectiveValue = (spec, options, pending) => {
        if (pending && options.some((o) => o.value === pending))
            return pending;
        if (spec.allowEmpty)
            return null;
        return options.length > 0 ? options[0].value : null;
    };
    const saveVoiceEdit = (spec) => {
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
    function voiceValueControl(spec, viewText) {
        const c = store.getState().console;
        const snap = (c.snapshot || {});
        if (c.voiceEditing !== spec.field) {
            const value = snap[spec.field];
            if (value) {
                return new component__namespace.Text({
                    text: viewText || (spec.field === 'phoneNumber' ? formatPhone(value) : value),
                    classList: ['ctc-t-body']
                });
            }
            return new component__namespace.Text({ text: '(not set)', type: component__namespace.Text.Type.WEAK, classList: ['ctc-t-muted'] });
        }
        const listKey = listKeyFor(spec.field);
        const list = c.voiceLists[listKey];
        if (list === null || c.voiceListsLoading) {
            return new component__namespace.Loader({ label: 'Loading from Twilio…', indeterminate: true });
        }
        const listError = c.voiceListErrors[listKey];
        if (listError) {
            return new component__namespace.Text({
                text: '✕ The Twilio list did not load: ' + friendlyError(listError),
                type: component__namespace.Text.Type.STRONG,
                size: component__namespace.Text.Size.S,
                classList: ['ctc-t-strong-small']
            });
        }
        if (list.length === 0) {
            return new component__namespace.Text({
                text: '(none found in this Twilio account)', type: component__namespace.Text.Type.WEAK, classList: ['ctc-t-muted']
            });
        }
        const options = optionsFor(spec.field, list);
        return new component__namespace.Dropdown({
            dataSource: new core__namespace.ArrayDataSource(options),
            valueMember: 'value',
            displayMember: 'label',
            selectedValue: effectiveValue(spec, options, c.voicePendingValue),
            allowEmpty: !!spec.allowEmpty,
            placeholder: spec.allowEmpty ? '(none)' : 'Select…',
            onSelectionChanged: onPendingChange,
            rootStyle: { width: '100%' }
        });
    }
    function voiceActionControl(spec) {
        const c = store.getState().console;
        const small = component__namespace.Button.Size.SMALL;
        if (c.voiceEditing !== spec.field) {
            return new component__namespace.Button({
                label: 'Change',
                size: small,
                enabled: !c.voiceSaving,
                action: () => { startVoiceEdit(spec); }
            });
        }
        const listKey = listKeyFor(spec.field);
        const list = c.voiceLists[listKey];
        const cancel = new component__namespace.Button({ label: 'Cancel', size: small, enabled: !c.voiceSaving, action: cancelVoiceEdit });
        if (list === null || c.voiceListsLoading || list.length === 0)
            return cancel;
        const row = (items) => new component__namespace.StackPanel({
            orientation: component__namespace.StackPanel.Orientation.HORIZONTAL,
            itemGap: component__namespace.StackPanel.GapSize.SPACING2X,
            items
        });
        if (c.voiceListErrors[listKey]) {
            return row([
                new component__namespace.Button({
                    label: 'Retry', size: small, startIcon: core__namespace.SystemIcon.REFRESH,
                    action: () => { loadVoiceLists(); }
                }),
                cancel
            ]);
        }
        return row([
            new component__namespace.Button({
                label: c.voiceSaving ? 'Saving…' : 'Save',
                size: small,
                type: component__namespace.Button.Type.PRIMARY,
                enabled: !c.voiceSaving,
                action: () => { saveVoiceEdit(spec); }
            }),
            cancel
        ]);
    }

    const kv$1 = (name, value, action) => grid('180px minmax(0, 1fr) auto', [label(name), value, action || text('')], Gap.SPACING4X);
    const settingRow = (name, spec, helpText, viewText) => kv$1(name, vstack([voiceValueControl(spec, viewText), help(helpText)], Gap.SPACING1X), voiceActionControl(spec));
    class OutboundPage extends core.PureComponent {
        componentDidMount() {
            const c = store.getState().console;
            if (c.phonesByPhone === null && !c.phonesLoading)
                loadPhonesData();
        }
        render() {
            const state = store.getState();
            const c = state.console;
            const snap = (c.snapshot || {});
            const n = (c.phonesNumbers || []).find((x) => x.phoneNumber === snap.phoneNumber);
            const callerIdText = snap.phoneNumber
                ? formatPhone(snap.phoneNumber) + (n && n.friendlyName ? ' · ' + n.friendlyName : '')
                : undefined;
            const path = [
                cardTitle('Call path'),
                settingRow('Twilio app', VOICE_FIELD_SPECS.twimlAppSid, 'Outbound calls use this app; publishing the recording notice points it at our dial function. ' +
                    'While the notice is published, remove it from Twilio before you change the app.'),
                divider(),
                settingRow('Default caller ID', VOICE_FIELD_SPECS.phoneNumber, 'Each rep calls out from the number that rings them. Reps that ring for no number use this one.', callerIdText),
                divider(),
                kv$1('Who calls out from what', callerIdList(state), button('Phones & reps', () => { goToSection('phones'); }, { link: true, small: true }))
            ];
            if (state.outbound.loaded) {
                const allow = allowListView(state.outbound);
                path.push(divider(), kv$1('Countries reps can call', vstack([text(allow.value), help(allow.help)], Gap.SPACING1X), null));
            }
            if (c.voiceError)
                path.push(errorLine(friendlyError(c.voiceError)));
            return vstack([
                pageHeader('Outbound calls', 'How reps\' calls leave NetSuite, and what the person called hears first.'),
                card(path, { label: 'Call path', gap: Gap.SPACING3X }),
                jsxRuntime.jsx(OutboundNotice, { tick: this.props.tick })
            ], Gap.SPACING4X);
        }
    }

    const METER_COLOR = {
        ok: component__namespace.MeterBar.Color.SUCCESS,
        warn: component__namespace.MeterBar.Color.WARNING,
        problem: component__namespace.MeterBar.Color.ERROR
    };
    const kv = (name, value, action = null) => grid('150px minmax(0, 1fr) auto', [label(name), value, action || text('')], Gap.SPACING4X);
    const signalOf = (state, key) => state.health.signals[key];
    const RECORDING_KEEP_DAYS = [0, 7, 30, 90, 180, 365];
    const RECORDING_KEEP_HELP = 'Keep call recordings for this many days so reps can play them; 0 deletes each recording after its transcript is saved. ' +
        'The background job deletes older recordings from Twilio. Twilio charges for recording storage.';
    const keepLabel = (n) => (n === 0 ? 'Delete after the transcript' : n + (n === 1 ? ' day' : ' days'));
    class TranscriptsPage extends core.PureComponent {
        componentDidMount() {
            const h = store.getState().health;
            if (!h.loaded && !h.loading)
                loadHealth();
        }
        signalState(state, sig) {
            const h = state.health;
            if (sig && sig.value)
                return null;
            if (h.loading && !h.loaded)
                return skeleton('lines', 3, 'Checking…');
            if (h.error && !sig) {
                return vstack([
                    errorLine('Not checked: ' + friendlyError(h.error)),
                    button('Retry', () => { loadHealth(); }, { primary: true, small: true })
                ], Gap.SPACING2X);
            }
            return text(sig ? sig.detail : 'Not checked yet.', { weak: true });
        }
        renderTranscription(state) {
            const c = state.console;
            const sig = signalOf(state, 'intelligence');
            const v = (sig && sig.value);
            const spec = VOICE_FIELD_SPECS.intelServiceSid;
            const auto = !v || !v.serviceSid ? { tone: 'off', label: 'No service' }
                : v.autoTranscribe === true ? { tone: 'ok', label: 'On' }
                    : v.autoTranscribe === false ? { tone: 'problem', label: 'Off' }
                        : { tone: 'off', label: 'Not checked' };
            const rows = [
                cardTitle('Transcription · Twilio'),
                kv('Service', vstack([
                    voiceValueControl(spec, v && v.friendlyName ? v.friendlyName : undefined),
                    help('Twilio Conversational Intelligence, in your Twilio account.')
                ], Gap.SPACING1X), voiceActionControl(spec)),
                divider(),
                kv('Auto-transcribe', vstack([
                    dotText(auto.tone, auto.label),
                    help('Twilio transcribes every recording in the account, voicemails included. Off would stop all transcripts.'),
                    sig && sig.severity !== 'ok' && sig.detail ? text(sig.detail, { small: true }) : null
                ], Gap.SPACING1X)),
                divider(),
                kv('Recordings', this.renderRecordingKeep(state))
            ];
            if (c.voiceError)
                rows.push(errorLine(friendlyError(c.voiceError)));
            return card(rows, { label: 'Transcription', fill: true, gap: Gap.SPACING2X });
        }
        renderRecordingKeep(state) {
            const c = state.console;
            const raw = c.snapshot?.recordingKeepDays;
            const days = typeof raw === 'number' ? raw : null;
            const options = days === null || RECORDING_KEEP_DAYS.indexOf(days) >= 0
                ? RECORDING_KEEP_DAYS
                : RECORDING_KEEP_DAYS.concat([days]).sort((x, y) => x - y);
            return vstack([
                days === null ? text('Not read: the keep period could not be read, so no recording is deleted.', { weak: true }) : null,
                jsxRuntime.jsx(component__namespace.Dropdown, { dataSource: new core__namespace.ArrayDataSource(options.map((n) => ({ value: n, label: keepLabel(n) }))), valueMember: "value", displayMember: "label", selectedValue: days === null ? undefined : days, enabled: !c.recordingKeepSaving, onSelectionChanged: (args) => {
                        const n = Number(args && args.value);
                        if (Number.isInteger(n) && n >= 0 && n !== days)
                            setRecordingKeep(n);
                    }, rootStyle: { width: '240px' } }),
                help(RECORDING_KEEP_HELP),
                help('Outbound calls are always recorded. Inbound recording is set under Inbound calls.'),
                c.recordingKeepError ? errorLine(friendlyError(c.recordingKeepError)) : null
            ], Gap.SPACING1X);
        }
        renderAi(state) {
            const sig = signalOf(state, 'aiQuota');
            const n = sig && typeof sig.value === 'number' ? sig.value : null;
            const tone = !sig ? 'off' : sig.severity === 'problem' ? 'problem' : sig.severity === 'warn' ? 'warn' : 'ok';
            const pending = this.signalState(state, sig);
            const backlog = state.health.signals.transcriptBacklog;
            const meter = aiMeter(n, backlog ? backlog.value : null, Date.now());
            return card([
                cardTitle('AI analysis · NetSuite N/llm'),
                n !== null ? metric(n.toLocaleString(), n === 1 ? 'AI analysis left' : 'AI analyses left') : pending,
                meter ? new component__namespace.MeterBar({
                    value: meter.value,
                    min: 0,
                    max: meter.max,
                    readOnly: true,
                    plotAreaSize: component__namespace.MeterBar.Size.MEDIUM,
                    indicatorBarSize: component__namespace.MeterBar.Size.MEDIUM,
                    indicatorBarColor: METER_COLOR[meter.tone],
                    rootStyle: { width: '100%' }
                }) : null,
                meter ? grid('minmax(0, 1fr) auto', [help(meter.usedText), help(meter.runwayText)], Gap.SPACING3X) : null,
                n !== null && tone !== 'ok' ? dotText(tone, sig ? sig.detail : '') : null,
                help('NetSuite reports only the requests left, not a total, so the bar is scaled to what is left plus ' +
                    'what Click-to-Call used this month. Other scripts that use N/llm draw from the same requests. ' +
                    'One request per analysed call; this is not script governance units.'),
                help('Below 10 left, calls are still transcribed but not analysed until more requests are available. ' +
                    'Analysis runs in NetSuite with N/llm (Cohere Command A), not in Twilio.')
            ], { label: 'AI analysis', fill: true });
        }
        renderBacklog(state) {
            const sig = signalOf(state, 'transcriptBacklog');
            const v = (sig && sig.value);
            const open = v ? v.logged + v.processing + v.failed : 0;
            const body = [
                grid('minmax(0, 1fr) auto', [
                    cardTitle('Transcript backlog'),
                    v ? help(open + (open === 1 ? ' call' : ' calls') + ' in progress · last ' + (v.windowDays || 7) + ' days') : null
                ], Gap.SPACING3X),
                help(BACKLOG_PRIMER)
            ];
            if (!v) {
                body.push(this.signalState(state, sig));
            }
            else {
                if (sig && sig.severity === 'problem')
                    body.push(dotText('problem', sig.detail));
                body.push(table(backlogRows(v), [
                    { name: 'status', label: 'Status', stretch: 3, cell: (r) => chip(r.status, r.tone) },
                    { name: 'calls', label: 'Calls', stretch: 1, numeric: true, cell: (r) => num(r.count, { muteZero: true }) },
                    { name: 'next', label: 'What happens next', stretch: 8, cell: (r) => help(r.next) },
                    { name: 'link', label: '', stretch: 3,
                        cell: (r) => (r.link && r.count > 0 ? extLink('Open in Call Central', CALL_CENTRAL_URL) : text('')) }
                ], { rowHeight: ROW_TWO_LINES }));
            }
            return card(body, { label: 'Transcript backlog' });
        }
        jobRow(name, j, helpText) {
            let status;
            if (!j || !j.lastStatus || j.minutesSinceLastRun === null) {
                status = dotText('off', j && j.lastStatus ? runStatusText(j.lastStatus) : 'No run yet');
            }
            else {
                const ago = agoParts(j.minutesSinceLastRun);
                status = dotText(jobTone(j), runStatusText(j.lastStatus) + ' ' + ago.value + ' ' + ago.unit, j.failedRecent > 0 ? '· ' + j.failedRecent + ' recent ' + (j.failedRecent === 1 ? 'run' : 'runs') + ' failed' : '');
            }
            return grid('200px minmax(0, 1fr)', [label(name),
                vstack([status, help(helpText)], Gap.SPACING1X)], Gap.SPACING4X);
        }
        renderJobs(state) {
            const sig = signalOf(state, 'pollerRuns');
            const v = (sig && sig.value);
            const body = [cardTitle('Background jobs')];
            if (!v) {
                body.push(this.signalState(state, sig));
            }
            else {
                body.push(this.jobRow('Transcript check', v.transcripts, 'Every 15 minutes. Also retries failed saves and deletes recordings past the keep period.'));
                body.push(divider());
                body.push(this.jobRow('Missed-call sync', v.reconcile, 'Every 15 minutes. Logs calls that rang no rep (missed, too short, no answer, voicemail) so Call Central is complete.'));
                if (sig && sig.severity !== 'ok' && sig.detail)
                    body.push(dotText(sig.severity === 'problem' ? 'problem' : 'warn', sig.detail));
            }
            return card(body, { label: 'Background jobs', gap: Gap.SPACING2X });
        }
        render() {
            const state = store.getState();
            return vstack([
                pageHeader('Transcripts & AI', 'Twilio transcribes the calls. NetSuite (N/llm) does the AI analysis: summary, satisfaction, tone and follow-ups. Below: both, and the background jobs that connect them.', healthCheckAside()),
                grid('minmax(0, 3fr) minmax(0, 2fr)', [this.renderTranscription(state), this.renderAi(state)], Gap.SPACING3X, { stretch: true }),
                this.renderBacklog(state),
                this.renderJobs(state)
            ], Gap.SPACING4X);
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
    function editCredentialsField(key, value) {
        const creds = store.getState().credentials;
        if (creds.saving)
            return;
        if (!creds.editing)
            startCredentialsEdit();
        store.dispatch(Action.credentialsUpdate({ [key]: value, saved: false }));
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

    const PHONE_TAB_HELP_OFF = 'Phone mode shows NetSuite and the phone in one tab. If a NetSuite update breaks NetSuite inside phone mode, ' +
        'turn this on: the phone gets its own tab and reps work in NetSuite in other tabs. Open phone tabs switch at their next load.';
    const PHONE_TAB_HELP_ON = 'On: the phone runs in its own tab without NetSuite inside it. Reps keep that tab open and work in other tabs. ' +
        'Turn it off to show NetSuite inside phone mode again. Open phone tabs switch at their next load.';
    const CONNECTION_CHECK_IDS = ['twilio_reachable', 'jwt_mint', 'secret_resolves'];
    const ROTATION_STEPS = [
        'In the Twilio Console (Account › API keys & tokens), create a new Standard API key. Copy its SID and secret: Twilio shows the secret only once.',
        'In NetSuite (Setup › Company › API Secrets), create a new secret with that value. Allow the same scripts and domains as the current secret: CTC Setup Wizard API, CTC Token Generator and CTC Poll Transcripts. Note its script ID (custsecret_…).',
        'Paste the new API Key SID and the new secret\'s script ID here and click Save & test.',
        'When the test passes and open phones have renewed (within an hour, or after a reload of phone mode), delete the old key in Twilio and the old secret in NetSuite.'
    ];
    function connectionStatus(checks, at) {
        const mine = (checks || []).filter((c) => CONNECTION_CHECK_IDS.indexOf(String(c.id)) >= 0);
        const when = timeOfDay(at);
        const extra = when ? '· tested ' + when : '';
        if (!mine.length)
            return { tone: 'off', label: 'Not tested', extra: '' };
        if (mine.every((c) => c.status === 'pass'))
            return { tone: 'ok', label: 'Connected', extra };
        return { tone: 'problem', label: 'Not connected', extra };
    }
    class AccountPage extends core.PureComponent {
        renderConnection(state) {
            const c = state.console;
            const creds = state.credentials;
            const snap = (c.snapshot || {});
            const keySid = creds.editing ? creds.apiKeySid : (snap.apiKeySid || '');
            const secretId = creds.editing ? creds.apiSecretId : (snap.apiSecretId || '');
            const dirty = creds.editing &&
                (creds.apiKeySid.trim() !== (snap.apiKeySid || '') || creds.apiSecretId.trim() !== (snap.apiSecretId || ''));
            const testing = !!c.preflightRefreshing || (c.loading && c.preflight === null);
            const status = testing
                ? { tone: 'info', label: 'Testing…', extra: '' }
                : connectionStatus(c.preflight, c.preflightAt);
            const failedConnection = (c.preflight || [])
                .filter((ch) => CONNECTION_CHECK_IDS.indexOf(String(ch.id)) >= 0 && ch.status !== 'pass');
            const rows = [
                hstack([cardTitle('Connection'), dotText(status.tone, status.label, status.extra)], Gap.SPACING3X, {
                    justification: component__namespace.StackPanel.Justification.SPACE_BETWEEN, wrap: true
                }),
                field('Account SID', jsxRuntime.jsx(component__namespace.TextBox, { text: snap.accountSid || '', enabled: false, classList: ['ctc-mono'], rootStyle: { width: '100%' } }), 'The Twilio account itself. To move to another account, re-run setup below.'),
                field('API Key SID', jsxRuntime.jsx(component__namespace.TextBox, { text: keySid, placeholder: "SK\u2026", enabled: !creds.saving, classList: ['ctc-mono'], onTextChanged: (args) => {
                        editCredentialsField('apiKeySid', (args && args.text) || '');
                    }, rootStyle: { width: '100%' } }), 'The key NetSuite signs call tokens with. A rotated key has a new SID: paste it here.'),
                field('API Key Secret (script ID)', jsxRuntime.jsx(component__namespace.TextBox, { text: secretId, placeholder: "custsecret_\u2026", enabled: !creds.saving, classList: ['ctc-mono'], onTextChanged: (args) => {
                        editCredentialsField('apiSecretId', (args && args.text) || '');
                    }, rootStyle: { width: '100%' } }), vstack([
                    help('The NetSuite API Secret that holds the key\'s secret. NetSuite never shows the value here.'),
                    extLink('Open NetSuite API Secrets', API_SECRETS_URL)
                ], Gap.SPACING1X)),
                hstack([
                    button(creds.saving ? 'Testing…' : 'Save & test', () => { saveCredentials(); }, {
                        primary: true,
                        enabled: !creds.saving && !!dirty && creds.apiKeySid.trim() !== '' && creds.apiSecretId.trim() !== ''
                    }),
                    dirty ? button('Discard', () => { cancelCredentialsEdit(); }, { enabled: !creds.saving }) : null,
                    button(testing ? 'Testing…' : 'Test connection', () => { rerunPreflight(); }, { enabled: !testing }),
                    help('Save & test calls Twilio with the new key first and saves it only when the test passes. A failed test keeps the old key.')
                ], Gap.SPACING2X, { wrap: true, growLast: true })
            ];
            if (creds.saved)
                rows.push(text('✓ Saved. The connection test passed with the new key.', { strong: true }));
            if (creds.error) {
                rows.push(errorLine(friendlyError(creds.error)));
                buildFailedCheckLines(creds.failedChecks).forEach((line) => { rows.push(line); });
            }
            if (c.preflightError)
                rows.push(errorLine('The connection test did not run: ' + friendlyError(c.preflightError)));
            if (!testing && failedConnection.length) {
                buildFailedCheckLines(failedConnection).forEach((line) => { rows.push(line); });
            }
            return card(rows, { label: 'Connection', fill: true, gap: Gap.SPACING4X });
        }
        renderRotation() {
            return card([
                cardTitle('Rotate the API key'),
                help('A Twilio secret is shown once and cannot be regenerated. Rotation means a new key with a new SID.'),
                vstack(ROTATION_STEPS.map((s, i) => text((i + 1) + '. ' + s, { small: true })), Gap.SPACING2X),
                help('Open phones pick up the new key at their next token renewal, within an hour. Calls in progress are not affected.'),
                extLink('Twilio docs', 'https://www.twilio.com/docs/iam/api-keys')
            ], { label: 'Rotate the API key', fill: true });
        }
        renderDangerZone(state) {
            const snap = (state.console.snapshot || {});
            const paused = snap.active === false;
            const row = (title, helpText, control) => grid('minmax(0, 1fr) auto', [
                vstack([text(title, { strong: true }), help(helpText)], Gap.SPACING1X),
                control
            ], Gap.SPACING4X);
            const phoneTab = snap.phoneTab === true;
            const c = state.console;
            return card([
                cardTitle('Danger zone', { danger: true }),
                row('Phone in its own tab', phoneTab ? PHONE_TAB_HELP_ON : PHONE_TAB_HELP_OFF, vstack([
                    button(c.phoneTabSaving ? 'Saving…' : phoneTab ? 'Show NetSuite in phone mode' : 'Use a separate phone tab', () => { setPhoneTab(!phoneTab); }, { enabled: !c.phoneTabSaving }),
                    c.phoneTabError ? errorLine(friendlyError(c.phoneTabError)) : null
                ], Gap.SPACING1X)),
                divider(),
                row('Pause calling', 'Reps cannot place or receive calls until you resume. Calls in progress finish normally. Twilio settings are kept.', jsxRuntime.jsx(PauseControl, { pauseLabel: "Pause calling\u2026", danger: true, tick: this.props.tick })),
                divider(),
                row('Re-run setup', 'Walk through the 5 setup steps again with the current values filled in. Use it to move to another Twilio account. Available while calling is paused.', button('Re-run setup', () => { goToStep(1); }, { enabled: paused, icon: core__namespace.SystemIcon.REFRESH }))
            ], { variant: 'danger', label: 'Danger zone' });
        }
        render() {
            const state = store.getState();
            return vstack([
                pageHeader('Twilio account', 'The Twilio account and API key NetSuite uses for calls, recordings and transcripts.'),
                grid('minmax(0, 3fr) minmax(0, 2fr)', [this.renderConnection(state), this.renderRotation()], Gap.SPACING3X, { stretch: true }),
                this.renderDangerZone(state)
            ], Gap.SPACING4X);
        }
    }

    const CONSOLE_CLASS = 'ctc-console';
    const CONSOLE_FRAME_CLASS = 'ctc-console-frame';
    const CONSOLE_SCROLL_CLASS = 'ctc-console-scroll';
    const RAIL_CLASS = 'ctc-rail';
    const RAIL_TITLE_CLASS = 'ctc-rail-title';
    const TOKENS = {
        surface: '#F6F5F2',
        card: '#FFFFFF',
        border: '#E5E2DD',
        divider: '#F1EFEA',
        text: '#161513',
        muted: '#5C5955',
        faint: '#8B8780',
        headerBg: '#FAFAF8',
        radius: '12px',
        dangerBorder: '#E7C3BF',
        dangerText: '#9A2A23'
    };
    const S = '.' + CONSOLE_CLASS;
    const T = TOKENS;
    const type = (cls, size, weight, color, lineHeight = '1.45') => S + ' .' + cls + '{font-size:' + size + 'px !important;font-weight:' + weight + ' !important;color:' + color +
        ' !important;line-height:' + lineHeight + ' !important}' +
        S + ' .' + cls + ' *{font-size:inherit !important;font-weight:inherit !important;color:inherit !important;' +
        'line-height:inherit !important}';
    const CSS = [
        S + '{background:' + T.surface + ';min-height:100%}',
        '.' + CONSOLE_FRAME_CLASS + ',.' + CONSOLE_SCROLL_CLASS + '{background:' + T.surface + '}',
        'div:has(> div > ' + S + '){background:' + T.surface + '}',
        type('ctc-t-body', 13, 400, T.text),
        type('ctc-t-strong', 13, 600, T.text),
        type('ctc-t-muted', 13, 400, T.muted),
        type('ctc-t-small', 12, 400, T.text),
        type('ctc-t-strong-small', 12, 600, T.text),
        type('ctc-t-help', 12, 400, T.muted),
        type('ctc-t-label', 12, 600, T.muted),
        type('ctc-h2', 15, 700, T.text, '1.35'),
        type('ctc-t-status', 17, 700, T.text, '1.2'),
        S + ' .ctc-h2{margin:0 !important}',
        S + ' .ctc-num{font-variant-numeric:tabular-nums}',
        S + ' .ctc-t-zero,' + S + ' .ctc-t-zero *{color:' + T.faint + ' !important}',
        S + ' .ctc-quote{border-left:3px solid ' + T.border + ';padding-left:10px}',
        S + ' .ctc-table .ctc-th{background:' + T.headerBg + ' !important;border-bottom:1px solid ' + T.border + ' !important}',
        S + ' .ctc-table .ctc-th,' + S + ' .ctc-table .ctc-th *{font-size:12px !important;font-weight:600 !important;' +
            'color:' + T.muted + ' !important}',
        S + ' .ctc-table .ctc-td-first .ctc-t-body{font-weight:600 !important}',
        S + ' .ctc-table .ctc-td-num,' + S + ' .ctc-table .ctc-th-num{text-align:right;font-variant-numeric:tabular-nums}',
        S + ' .ctc-lth,' + S + ' .ctc-ltd{box-sizing:border-box;height:100%;justify-content:center !important}',
        S + ' .ctc-lth{background:' + T.headerBg + ';border-bottom:1px solid ' + T.border + ';padding:9px 12px}',
        S + ' .ctc-ltd{border-bottom:1px solid ' + T.divider + ';padding:10px 12px}',
        S + ' .ctc-ltd .ctc-t-body,' + S + ' .ctc-ltd .ctc-t-help{overflow-wrap:anywhere}',
        S + ' .ctc-card{background:' + TOKENS.card + ' !important;border:1px solid ' + TOKENS.border +
            ' !important;border-radius:' + TOKENS.radius + ' !important;box-shadow:none !important;box-sizing:border-box}',
        S + ' .ctc-card-flush{background:' + TOKENS.card + ' !important;border:1px solid ' + TOKENS.border +
            ' !important;border-radius:' + TOKENS.radius + ' !important;box-shadow:none !important;overflow:hidden}',
        S + ' .ctc-card-danger{background:' + TOKENS.card + ' !important;border:1px solid ' + TOKENS.dangerBorder +
            ' !important;border-radius:' + TOKENS.radius + ' !important;box-shadow:none !important}',
        S + ' .ctc-danger-title{color:' + TOKENS.dangerText + ' !important}',
        S + ' .ctc-fill{height:100%}',
        S + ' .ctc-chip-neutral,' + S + ' .ctc-chip-info,' + S + ' .ctc-chip-warn,' + S + ' .ctc-chip-problem,' +
            S + ' .ctc-chip-ok{border:0 !important;border-radius:999px !important;font-size:12px !important;' +
            'font-weight:600 !important;white-space:nowrap}',
        S + ' [class*="ctc-chip-"] *{font-size:12px !important;font-weight:600 !important;color:inherit !important}',
        S + ' .ctc-chip-neutral{background:#F1EFEA !important;color:#5C5955 !important}',
        S + ' .ctc-chip-info{background:#E8F0F8 !important;color:#1F3550 !important}',
        S + ' .ctc-chip-warn{background:#FFF3D6 !important;color:#8A5A00 !important}',
        S + ' .ctc-chip-problem{background:#FCE9E7 !important;color:#9A2A23 !important}',
        S + ' .ctc-chip-ok{background:#E4F3EB !important;color:#1F6B49 !important}',
        S + ' .ctc-step{width:24px;height:24px;min-width:24px;box-sizing:border-box;border-radius:999px;' +
            'background:#1F3550;color:#FFFFFF !important;font-size:12px !important;font-weight:700 !important;' +
            'line-height:24px !important;text-align:center;display:inline-block !important;' +
            'font-variant-numeric:tabular-nums;margin-top:1px}',
        S + ' .ctc-btn-danger{color:#9A2A23 !important;border-color:#E7C3BF !important;background:#FFFFFF !important}',
        S + ' .ctc-btn-danger:hover{background:#FCF1EF !important}',
        S + ' .ctc-icon-tile{width:36px;height:36px;border-radius:10px;background:#E8F0F8;' +
            'display:inline-flex !important;align-items:center;justify-content:center}',
        S + ' .ctc-dot-ok{color:#2E9E6B !important}',
        S + ' .ctc-dot-warn{color:#E9A62A !important}',
        S + ' .ctc-dot-problem{color:#B4432F !important}',
        S + ' .ctc-dot-off{color:#B9B5AE !important}',
        S + ' .ctc-dot-info{color:#9DB4CF !important}',
        S + ' .ctc-mono{font-family:"SF Mono",Menlo,monospace !important;font-size:12px !important}',
        '.' + RAIL_CLASS + ' .ctc-rail-head{container-type:inline-size;width:100%}',
        '.' + RAIL_CLASS + ' .' + RAIL_TITLE_CLASS + '{display:block;font-size:11px !important;font-weight:700 !important;' +
            'letter-spacing:0.06em;text-transform:uppercase;color:#9FB3C8 !important;padding:6px 10px 8px;' +
            'white-space:nowrap;overflow:hidden;cursor:default;user-select:none;pointer-events:none}',
        '@container (max-width: 120px){.' + RAIL_CLASS + ' .' + RAIL_TITLE_CLASS + '{display:none !important}}'
    ].join('\n');
    const STYLE_ID = 'ctc-console-styles';
    function ensureConsoleStyles() {
        try {
            if (typeof document === 'undefined' || document.getElementById(STYLE_ID))
                return;
            const el = document.createElement('style');
            el.id = STYLE_ID;
            el.textContent = CSS;
            (document.head || document.documentElement).appendChild(el);
        }
        catch (e) {
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
    const railTitle = () => vstack([
        new component__namespace.Text({ text: 'Click-to-Call', classList: [RAIL_TITLE_CLASS] })
    ], Gap.NONE, { classList: ['ctc-rail-head'] });
    const NavRail = (_props) => {
        ensureConsoleStyles();
        const state = store.getState();
        const assignments = state.console.assignments;
        const assignmentBadge = assignments ? String(assignments.length) : undefined;
        const canRerun = !isConfigActive(state);
        const item = (value, label, icon, extra = {}) => ({
            value, label, icon, action: () => { navigate(value); }, ...extra
        });
        const navItems = [
            item('overview', 'Overview', core__namespace.SystemIcon.CARD_VIEW),
            item('phones', 'Phones & reps', core__namespace.SystemIcon.CALL, { badge: assignmentBadge }),
            item('inbound', 'Inbound calls', core__namespace.SystemIcon.ARROW_DIAGONAL_DOWN),
            item('outbound', 'Outbound calls', core__namespace.SystemIcon.ARROW_DIAGONAL_UP),
            item('transcripts', 'Transcripts & AI', core__namespace.SystemIcon.AI_SPARKLE),
            item('health', 'Health', core__namespace.SystemIcon.PERFORMANCE),
            item('account', 'Twilio account', core__namespace.SystemIcon.CREDENTIALS)
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
            classList: [RAIL_CLASS],
            header: railTitle(),
            headerAlignment: component__namespace.NavigationDrawer.HeaderAlignment.STRETCH,
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
        return (jsxRuntime.jsx(component__namespace.ScrollPanel, { orientation: component__namespace.ScrollPanel.Orientation.VERTICAL, classList: (props.scrollClassList || []), children: jsxRuntime.jsx(component__namespace.ContentPanel, { classList: (props.classList || []), horizontalAlignment: component__namespace.ContentPanel.HorizontalAlignment.STRETCH, outerGap: {
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

    const ConsoleShell = (props) => {
        ensureConsoleStyles();
        const state = store.getState();
        const snap = state.console.snapshot;
        const isPaused = snap?.active === false;
        const contentItems = [
            isPaused && (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: jsxRuntime.jsx(PausedBanner, { tick: props.tick }) })),
            (jsxRuntime.jsx(component__namespace.StackPanel.Item, { children: props.children }))
        ].filter(Boolean);
        return (jsxRuntime.jsxs(component__namespace.GridPanel, { columns: "auto 1fr", rows: "100%", columnGap: component__namespace.GridPanel.GapSize.NONE, classList: [CONSOLE_FRAME_CLASS], children: [jsxRuntime.jsx(component__namespace.GridPanel.Item, { children: jsxRuntime.jsx(NavRail, { tick: props.tick }) }), jsxRuntime.jsx(component__namespace.GridPanel.Item, { children: jsxRuntime.jsx(RailContentShell, { classList: [CONSOLE_CLASS], scrollClassList: [CONSOLE_SCROLL_CLASS], children: jsxRuntime.jsx(component__namespace.StackPanel, { orientation: component__namespace.StackPanel.Orientation.VERTICAL, itemGap: component__namespace.StackPanel.GapSize.SPACING4X, children: contentItems }) }) })] }));
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
                case 'outbound': return jsxRuntime.jsx(OutboundPage, { tick: tick });
                case 'transcripts': return jsxRuntime.jsx(TranscriptsPage, { tick: tick });
                case 'health': return jsxRuntime.jsx(HealthPage, { tick: tick });
                case 'account': return jsxRuntime.jsx(AccountPage, { tick: tick });
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
