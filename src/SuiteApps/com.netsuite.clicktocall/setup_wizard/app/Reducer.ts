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
import type {AppState} from './InitialState';

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
            };
            if (p.employees !== undefined) d.console.phonesEmployees = p.employees;
            if (p.numbers !== undefined) d.console.phonesNumbers = p.numbers;
            if (p.byPhone !== undefined) d.console.phonesByPhone = p.byPhone;
            d.console.phonesLoading = false;
        })],
        [ActionType.PHONES_ASSIGNMENT_SAVE, (s) => ImmutableUpdate.of(s, (d) => {
            const p = a.payload as {
                phoneSid: string;
                saving?: boolean;
                assignment?: unknown;
                error?: string | null;
            };
            if (p.saving !== undefined) {
                d.console.phonesSaving[p.phoneSid] = p.saving;
            }
            if (p.error !== undefined) {
                d.console.phonesError = p.error;
            }
            // The actual assignment row mutation is left to the effect
            // module to compose into a phonesLoadSuccess(byPhone:...)
            // follow-up dispatch — keeps the reducer simple.
        })],

        // ── Voice section ──────────────────────────────────────────
        [ActionType.VOICE_FIELD_EDIT, (s) => ImmutableUpdate.of(s, (d) => {
            const p = a.payload as {
                field: AppState['console']['voiceEditing'];
                pendingValue?: string | null;
            };
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
        [ActionType.DEACTIVATE_SUCCESS, (s) => ImmutableUpdate.of(s, (d) => {
            d.console.pendingDeactivateConfirm = false;
            d.console.deactivateError = null;
        })],
        [ActionType.DEACTIVATE_FAILURE, (s) => ImmutableUpdate.of(s, (d) => {
            const p = a.payload as { error: string };
            d.console.pendingDeactivateConfirm = false;
            d.console.deactivateError = p.error;
        })],

        // ── Reactivate flow ────────────────────────────────────────
        [ActionType.REACTIVATE_REQUEST, (s) => ImmutableUpdate.of(s, (d) => {
            d.console.actionError = null;
        })],
        [ActionType.REACTIVATE_SUCCESS, (s) => ImmutableUpdate.of(s, (d) => {
            d.console.actionError = null;
        })],
        [ActionType.REACTIVATE_FAILURE, (s) => ImmutableUpdate.of(s, (d) => {
            const p = a.payload as { error: string };
            d.console.actionError = p.error;
        })],

        // ── Cross-section error surface ────────────────────────────
        [ActionType.ACTION_ERROR_SET, (s) => ImmutableUpdate.of(s, (d) => {
            d.console.actionError = a.payload as string | null;
        })]
    ]);

    const handler = handlers.get(action.type as symbol);
    return handler ? handler(state) : state;
}
