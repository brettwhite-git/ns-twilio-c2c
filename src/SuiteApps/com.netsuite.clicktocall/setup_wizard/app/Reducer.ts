/**
 * Reducer for the wizard + console Store.
 *
 * Phase 1 (2026-05-28) — expanded handler map matching the full action
 * surface in Action.ts. Subsequent phases wire callers to dispatch these
 * actions instead of mutating the legacy STATE singleton directly.
 *
 * Pattern:
 *   Map<ActionType, (state) => newState> — handlers keyed by ActionType
 *   Symbol. Each handler uses `ImmutableUpdate.of(state, draft => {...})`
 *   from @uif-js/core to produce the next state via mutation-style draft
 *   code that yields an immutable result.
 *
 * Unknown action types fall through unchanged. The Store's initial
 * dispatch fires with action.type === Store.INIT_ACTION_TYPE; the
 * fallthrough handles it correctly.
 */

import {ImmutableUpdate} from '@uif-js/core';
import {ActionType} from './Action';
import type {AppAction} from './Action';
import type {
    AppState,
    CheckResult,
    CredentialsState,
    InboundPublishError,
    InboundPublishResult,
    InboundSettings,
    OutboundSnapshot,
    PhoneDraft,
    PresenceRow
} from './InitialState';
import type {
    HealthLoadPayload,
    InboundLoadPayload,
    InboundRoutesPayload,
    OutboundFields,
    OutboundRequestPayload,
    PhonesRowSavePayload
} from './Action';

/**
 * Copy a publish result into the inbound draft: flowSid on ok or partial
 * (the server kept the SID); publishedAt only on ok (a partial or failed
 * publish keeps the previous time).
 */
const applyPublish = (inbound: AppState['inbound'], publish: InboundPublishResult): void => {
    inbound.lastPublish = publish;
    if ((publish.ok || publish.partial) && publish.flowSid) inbound.flowSid = publish.flowSid;
    if (publish.ok && publish.publishedAt) inbound.publishedAt = publish.publishedAt;
};

/** The saved-settings fields of a load payload / the form. */
const pickInboundSettings = (v: InboundSettings): InboundSettings => ({
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

type Handler = (state: AppState) => AppState;

export default function reducer(state: AppState, action: AppAction): AppState {
    const a = action as { type: symbol; payload: unknown };

    const handlers: Map<symbol, Handler> = new Map<symbol, Handler>([
        // ── App-level dispatch ─────────────────────────────────────
        [ActionType.SET_MODE, (s) => ImmutableUpdate.of(s, (d) => {
            d.mode = a.payload as AppState['mode'];
        })],
        [ActionType.SET_CURRENT_STEP, (s) => ImmutableUpdate.of(s, (d) => {
            d.currentStep = a.payload as number;
        })],
        [ActionType.SET_SELECTED_SECTION, (s) => ImmutableUpdate.of(s, (d) => {
            d.selectedSection = a.payload as AppState['selectedSection'];
        })],
        [ActionType.SET_RAIL_VISIBLE, (s) => ImmutableUpdate.of(s, (d) => {
            d.railVisible = a.payload as boolean;
        })],
        [ActionType.SET_MOUNT_ROUTING, (s) => ImmutableUpdate.of(s, (d) => {
            d.mountRouting = a.payload as boolean;
        })],
        [ActionType.SET_WIZARD_SAVING, (s) => ImmutableUpdate.of(s, (d) => {
            d.wizardSaving = a.payload as boolean;
        })],

        // ── Step form field changes ────────────────────────────────
        [ActionType.STEP2_FIELD_CHANGE, (s) => ImmutableUpdate.of(s, (d) => {
            const p = a.payload as { field: keyof AppState['step2']; value: string };
            d.step2[p.field] = p.value;
        })],
        [ActionType.STEP3_FIELD_CHANGE, (s) => ImmutableUpdate.of(s, (d) => {
            const p = a.payload as { field: keyof AppState['step3']; value: unknown };
            (d.step3 as unknown as Record<string, unknown>)[p.field as string] = p.value;
        })],
        [ActionType.STEP4_FIELD_CHANGE, (s) => ImmutableUpdate.of(s, (d) => {
            const p = a.payload as { field: keyof AppState['step4']; value: unknown };
            (d.step4 as unknown as Record<string, unknown>)[p.field as string] = p.value;
        })],
        [ActionType.STEP5_FIELD_CHANGE, (s) => ImmutableUpdate.of(s, (d) => {
            const p = a.payload as { field: keyof AppState['step5']; value: unknown };
            (d.step5 as unknown as Record<string, unknown>)[p.field as string] = p.value;
        })],

        // ── Prereqs (Step 1) ───────────────────────────────────────
        [ActionType.PREREQS_LOAD_START, (s) => ImmutableUpdate.of(s, (d) => {
            d.prereqs.loading = true;
            d.prereqs.error = null;
        })],
        [ActionType.PREREQS_LOAD_SUCCESS, (s) => ImmutableUpdate.of(s, (d) => {
            const p = a.payload as { checks: unknown[] };
            d.prereqs.loading = false;
            d.prereqs.checks = p.checks;
            d.prereqs.error = null;
        })],
        [ActionType.PREREQS_LOAD_FAILURE, (s) => ImmutableUpdate.of(s, (d) => {
            const p = a.payload as { error: string };
            d.prereqs.loading = false;
            d.prereqs.error = p.error;
        })],

        // ── Console common loaders ─────────────────────────────────
        [ActionType.CONSOLE_LOAD_START, (s) => ImmutableUpdate.of(s, (d) => {
            d.console.loading = true;
            d.console.actionError = null;
        })],
        [ActionType.CONSOLE_LOAD_SUCCESS, (s) => ImmutableUpdate.of(s, (d) => {
            const slice = a.payload as Partial<AppState['console']>;
            Object.assign(d.console, slice);
            d.console.loading = false;
        })],
        [ActionType.CONSOLE_LOAD_FAILURE, (s) => ImmutableUpdate.of(s, (d) => {
            const p = a.payload as { error: string };
            d.console.loading = false;
            d.console.actionError = p.error;
        })],
        [ActionType.CONSOLE_DRIFT_SET, (s) => ImmutableUpdate.of(s, (d) => {
            d.console.drift = a.payload;
        })],
        [ActionType.CONSOLE_PATCH, (s) => ImmutableUpdate.of(s, (d) => {
            Object.assign(d.console, a.payload as Partial<AppState['console']>);
        })],

        // ── Phones section ─────────────────────────────────────────
        [ActionType.PHONES_LOAD_START, (s) => ImmutableUpdate.of(s, (d) => {
            d.console.phonesLoading = true;
            d.console.phonesError = null;
        })],
        [ActionType.PHONES_LOAD_SUCCESS, (s) => ImmutableUpdate.of(s, (d) => {
            const p = a.payload as {
                employees?: unknown[] | null;
                numbers?: unknown[] | null;
                byPhone?: unknown[] | null;
                listError?: string | null;
                hasMore?: boolean;
                error?: string | null;
            };
            if (p.employees !== undefined) d.console.phonesEmployees = p.employees;
            if (p.numbers !== undefined) d.console.phonesNumbers = p.numbers;
            if (p.byPhone !== undefined) d.console.phonesByPhone = p.byPhone;
            if (p.listError !== undefined) d.console.phonesListError = p.listError;
            if (p.hasMore !== undefined) d.console.phonesHasMore = p.hasMore;
            if (p.error !== undefined) d.console.phonesError = p.error;
            d.console.phonesLoading = false;
        })],
        [ActionType.PHONES_LOAD_FAILURE, (s) => ImmutableUpdate.of(s, (d) => {
            d.console.phonesLoading = false;
            d.console.phonesError = (a.payload as { error: string }).error;
        })],
        [ActionType.PHONES_DRAFT_SET, (s) => ImmutableUpdate.of(s, (d) => {
            const p = a.payload as { phoneSid: string; draft: PhoneDraft | null };
            const drafts = { ...d.console.phonesDrafts };
            if (p.draft) drafts[p.phoneSid] = p.draft;
            else delete drafts[p.phoneSid];
            d.console.phonesDrafts = drafts;
            if (!p.draft) {
                const errs = { ...d.console.phonesRowErrors };
                delete errs[p.phoneSid];
                d.console.phonesRowErrors = errs;
            }
        })],
        [ActionType.PHONES_EDIT_ROW, (s) => ImmutableUpdate.of(s, (d) => {
            // One row at a time: opening or closing the editor drops any
            // unsaved edits and the old row's error.
            const p = a.payload as { phoneSid: string | null };
            d.console.phonesEditingSid = p.phoneSid;
            d.console.phonesDrafts = {};
            d.console.phonesRowErrors = {};
        })],
        [ActionType.PHONES_ROW_SAVE, (s) => ImmutableUpdate.of(s, (d) => {
            const p = a.payload as PhonesRowSavePayload;
            const errs = { ...d.console.phonesRowErrors };
            delete errs[p.phoneSid];
            if (p.phase === 'start') {
                d.console.phonesSavingSid = p.phoneSid;
                d.console.phonesRoutingErrors = [];
            } else if (p.phase === 'success') {
                d.console.phonesSavingSid = null;
                // Close the editor unless a refresh warning must show in it.
                if (d.console.phonesEditingSid === p.phoneSid && !p.error) {
                    d.console.phonesEditingSid = null;
                }
                const drafts = { ...d.console.phonesDrafts };
                delete drafts[p.phoneSid];
                d.console.phonesDrafts = drafts;
                if (p.error) errs[p.phoneSid] = p.error;
            } else {
                d.console.phonesSavingSid = null;
                errs[p.phoneSid] = p.error || 'Save failed';
            }
            if (p.routingErrors !== undefined) {
                d.console.phonesRoutingErrors = p.routingErrors as InboundPublishError[];
            }
            d.console.phonesRowErrors = errs;
        })],

        // ── Inbound calls section ──────────────────────────────────
        [ActionType.INBOUND_LOAD_START, (s) => ImmutableUpdate.of(s, (d) => {
            d.inbound.loading = true;
            d.inbound.loadError = null;
        })],
        [ActionType.INBOUND_LOAD_SUCCESS, (s) => ImmutableUpdate.of(s, (d) => {
            const p = a.payload as InboundLoadPayload;
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
        [ActionType.INBOUND_LOAD_FAILURE, (s) => ImmutableUpdate.of(s, (d) => {
            const p = a.payload as { error: string };
            d.inbound.loading = false;
            d.inbound.loadError = p.error;
        })],
        [ActionType.INBOUND_FIELD_CHANGE, (s) => ImmutableUpdate.of(s, (d) => {
            Object.assign(d.inbound, a.payload as Partial<InboundSettings>);
        })],
        [ActionType.INBOUND_SAVE, (s) => ImmutableUpdate.of(s, (d) => {
            const p = a.payload as {
                phase: 'start' | 'success' | 'failure';
                settings?: InboundSettings;
                publish?: InboundPublishResult;
                error?: string | null;
            };
            if (p.phase === 'start') {
                d.inbound.saving = true;
                d.inbound.saveError = null;
            } else if (p.phase === 'success') {
                d.inbound.saving = false;
                d.inbound.saveError = null;
                if (p.settings) Object.assign(d.inbound, p.settings);
                d.inbound.saved = pickInboundSettings(p.settings || d.inbound);
                if (p.publish) applyPublish(d.inbound, p.publish);
            } else {
                d.inbound.saving = false;
                d.inbound.saveError = p.error ?? 'Save failed';
            }
        })],
        [ActionType.INBOUND_PUBLISH, (s) => ImmutableUpdate.of(s, (d) => {
            const p = a.payload as {
                phase: 'start' | 'success' | 'failure';
                publish?: InboundPublishResult;
                error?: string | null;
            };
            if (p.phase === 'start') {
                d.inbound.publishing = true;
                d.inbound.saveError = null;
            } else if (p.phase === 'success') {
                d.inbound.publishing = false;
                if (p.publish) applyPublish(d.inbound, p.publish);
            } else {
                d.inbound.publishing = false;
                d.inbound.saveError = p.error ?? 'Publish failed';
            }
        })],
        [ActionType.INBOUND_ROUTING_UPDATE, (s) => ImmutableUpdate.of(s, (d) => {
            // Publish state only: the form (and its unsaved edits) stays.
            applyPublish(d.inbound, a.payload as InboundPublishResult);
        })],
        [ActionType.INBOUND_ROUTES_SET, (s) => ImmutableUpdate.of(s, (d) => {
            const p = a.payload as InboundRoutesPayload;
            d.inbound.routes = p.routes;
            if (p.flowSid !== undefined) d.inbound.flowSid = p.flowSid;
            if (p.publishedAt !== undefined) d.inbound.publishedAt = p.publishedAt;
        })],

        // ── Rep phone presence ─────────────────────────────────────
        [ActionType.PRESENCE_LOAD_START, (s) => ImmutableUpdate.of(s, (d) => {
            d.presence.loading = true;
            d.presence.error = null;
        })],
        [ActionType.PRESENCE_LOAD_SUCCESS, (s) => ImmutableUpdate.of(s, (d) => {
            const p = a.payload as { items: PresenceRow[]; clockSkewMs: number };
            d.presence.loading = false;
            d.presence.loaded = true;
            d.presence.error = null;
            d.presence.items = p.items;
            d.presence.clockSkewMs = p.clockSkewMs;
        })],
        [ActionType.PRESENCE_LOAD_FAILURE, (s) => ImmutableUpdate.of(s, (d) => {
            d.presence.loading = false;
            d.presence.error = (a.payload as { error: string }).error;
        })],

        // ── Health read model ──────────────────────────────────────
        [ActionType.HEALTH_LOAD_START, (s) => ImmutableUpdate.of(s, (d) => {
            d.health.loading = true;
            d.health.error = null;
        })],
        [ActionType.HEALTH_LOAD_SUCCESS, (s) => ImmutableUpdate.of(s, (d) => {
            const p = a.payload as HealthLoadPayload;
            d.health.loading = false;
            d.health.loaded = true;
            d.health.error = null;
            d.health.checkedAt = p.checkedAt;
            d.health.signals = p.signals;
            d.health.attention = p.attention;
        })],
        [ActionType.HEALTH_LOAD_FAILURE, (s) => ImmutableUpdate.of(s, (d) => {
            d.health.loading = false;
            d.health.error = (a.payload as { error: string }).error;
        })],

        // ── Outbound recording notice ──────────────────────────────
        [ActionType.OUTBOUND_LOAD_START, (s) => ImmutableUpdate.of(s, (d) => {
            d.outbound.loading = true;
            d.outbound.loadError = null;
        })],
        [ActionType.OUTBOUND_LOAD_SUCCESS, (s) => ImmutableUpdate.of(s, (d) => {
            const snap = a.payload as OutboundSnapshot;
            // A reload (e.g. Health "Run checks") keeps the admin's unsaved edits.
            const o = d.outbound;
            const unsaved = o.loaded && (o.noticeOn !== o.savedNoticeOn || o.noticeText !== o.savedNoticeText);
            const form = { noticeOn: o.noticeOn, noticeText: o.noticeText };
            Object.assign(d.outbound, snap);
            d.outbound.savedNoticeOn = snap.noticeOn;
            d.outbound.savedNoticeText = snap.noticeText;
            if (unsaved) Object.assign(d.outbound, form);
            d.outbound.loading = false;
            d.outbound.loaded = true;
            d.outbound.loadError = null;
        })],
        [ActionType.OUTBOUND_LOAD_FAILURE, (s) => ImmutableUpdate.of(s, (d) => {
            d.outbound.loading = false;
            d.outbound.loadError = (a.payload as { error: string }).error;
        })],
        [ActionType.OUTBOUND_FIELD_CHANGE, (s) => ImmutableUpdate.of(s, (d) => {
            Object.assign(d.outbound, a.payload as Partial<OutboundFields>);
        })],
        [ActionType.OUTBOUND_REQUEST, (s) => ImmutableUpdate.of(s, (d) => {
            const p = a.payload as OutboundRequestPayload;
            const busy = p.phase === 'start';
            if (p.op === 'run') {
                d.outbound.publishRunning = busy;
                return;
            }
            if (p.op === 'save') d.outbound.saving = busy;
            else if (p.op === 'publish') d.outbound.publishing = busy;
            else d.outbound.unpublishing = busy;
            if (busy) {
                d.outbound.error = null;
                d.outbound.confirmUnpublish = false;
                // A new Save & publish starts a fresh step list.
                if (p.op === 'save') d.outbound.steps = null;
                return;
            }
            if (p.snapshot) {
                Object.assign(d.outbound, p.snapshot);
                d.outbound.savedNoticeOn = p.snapshot.noticeOn;
                d.outbound.savedNoticeText = p.snapshot.noticeText;
            }
            if (p.pending !== undefined) d.outbound.pending = p.pending;
            if (p.steps !== undefined) d.outbound.steps = p.steps;
            d.outbound.error = p.error ?? null;
        })],
        [ActionType.OUTBOUND_CONFIRM_UNPUBLISH, (s) => ImmutableUpdate.of(s, (d) => {
            d.outbound.confirmUnpublish = a.payload as boolean;
        })],

        // ── Voice section ──────────────────────────────────────────
        [ActionType.VOICE_FIELD_EDIT, (s) => ImmutableUpdate.of(s, (d) => {
            const p = a.payload as {
                field: AppState['console']['voiceEditing'];
                pendingValue?: string | null;
            };
            // Opening, switching or cancelling a row starts with no error.
            if (p.field !== d.console.voiceEditing) d.console.voiceError = null;
            d.console.voiceEditing = p.field;
            d.console.voicePendingValue = p.pendingValue ?? null;
        })],
        [ActionType.VOICE_FIELD_SAVE, (s) => ImmutableUpdate.of(s, (d) => {
            const p = a.payload as {
                phase: 'start' | 'success' | 'failure';
                field?: AppState['console']['voiceEditing'];
                value?: unknown;
                error?: string | null;
            };
            if (p.phase === 'start') {
                d.console.voiceSaving = true;
                d.console.voiceError = null;
            } else if (p.phase === 'success') {
                d.console.voiceSaving = false;
                d.console.voiceEditing = null;
                d.console.voicePendingValue = null;
                d.console.voiceError = null;
                // Merge the saved field into console.snapshot so the
                // row re-renders with the new value. Without this the
                // UI reverts visually to the pre-save snapshot even
                // though the server has the new value.
                if (p.field && p.value !== undefined) {
                    const snap = (d.console.snapshot || {}) as Record<string, unknown>;
                    snap[p.field] = p.value;
                    d.console.snapshot = snap as never;
                }
            } else if (p.phase === 'failure') {
                d.console.voiceSaving = false;
                d.console.voiceError = p.error ?? 'Voice save failed';
            }
        })],

        // ── Deactivate flow ────────────────────────────────────────
        [ActionType.DEACTIVATE_REQUEST, (s) => ImmutableUpdate.of(s, (d) => {
            d.console.pendingDeactivateConfirm = true;
            d.console.deactivateError = null;
        })],
        [ActionType.DEACTIVATE_START, (s) => ImmutableUpdate.of(s, (d) => {
            d.console.deactivating = true;
            d.console.deactivateError = null;
        })],
        [ActionType.DEACTIVATE_SUCCESS, (s) => ImmutableUpdate.of(s, (d) => {
            d.console.pendingDeactivateConfirm = false;
            d.console.deactivating = false;
            d.console.deactivateError = null;
        })],
        [ActionType.DEACTIVATE_FAILURE, (s) => ImmutableUpdate.of(s, (d) => {
            const p = a.payload as { error: string };
            d.console.pendingDeactivateConfirm = false;
            d.console.deactivating = false;
            d.console.deactivateError = p.error;
        })],

        // ── Reactivate flow ────────────────────────────────────────
        [ActionType.REACTIVATE_REQUEST, (s) => ImmutableUpdate.of(s, (d) => {
            const p = a.payload as { source: AppState['console']['reactivateSource'] };
            d.console.reactivating = true;
            d.console.reactivateSource = p.source;
            d.console.reactivateError = null;
            d.console.reactivateFailedChecks = [];
        })],
        [ActionType.REACTIVATE_SUCCESS, (s) => ImmutableUpdate.of(s, (d) => {
            d.console.reactivating = false;
            d.console.reactivateError = null;
            d.console.reactivateFailedChecks = [];
        })],
        [ActionType.REACTIVATE_FAILURE, (s) => ImmutableUpdate.of(s, (d) => {
            const p = a.payload as { error: string; failedChecks: CheckResult[] };
            d.console.reactivating = false;
            d.console.reactivateError = p.error;
            d.console.reactivateFailedChecks = p.failedChecks || [];
        })],

        // ── Credentials page ───────────────────────────────────────
        [ActionType.CREDENTIALS_UPDATE, (s) => ImmutableUpdate.of(s, (d) => {
            Object.assign(d.credentials, a.payload as Partial<CredentialsState>);
        })],

        // ── Cross-section error surface ────────────────────────────
        [ActionType.ACTION_ERROR_SET, (s) => ImmutableUpdate.of(s, (d) => {
            d.console.actionError = a.payload as string | null;
        })]
    ]);

    const handler = handlers.get(action.type as symbol);
    return handler ? handler(state) : state;
}
