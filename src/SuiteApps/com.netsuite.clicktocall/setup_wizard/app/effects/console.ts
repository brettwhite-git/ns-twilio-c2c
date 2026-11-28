/**
 * Console effects — async action thunks for the post-activation Admin
 * Console mount + deactivate/reactivate flows.
 *
 * Phase 2 (2026-05-28) — wraps the legacy `loadConsole` / `confirmDeactivate`
 * / `reactivate` callbacks in AppController.tsx as dispatch-based effects.
 *
 * Each effect:
 *   1. Dispatches a *Start action to flip loading flags
 *   2. Calls wizardCall(...) (parallel where independent)
 *   3. Dispatches *Success with the merged slice OR *Failure on error
 *
 * Phase 2 is additive — these effects are NEW code, not yet called by
 * anyone. Phases 3-6 wire callers to invoke them.
 */

import {store} from '../Store';
import {Action} from '../Action';
import {wizardCall} from '../../services/wizardApi';
import type {AppState, CheckResult, ConsoleState} from '../InitialState';

/** Server text for a failed call: message, else the error code. */
const errorOf = (result: unknown, fallback: string): string => {
    const r = (result || {}) as { error?: string; errorMessage?: string; message?: string };
    return r.errorMessage || r.message || r.error || fallback;
};

const thrownText = (e: unknown, fallback: string): string =>
    e instanceof Error && e.message ? 'Network: ' + e.message : fallback;

/**
 * Load the console-shared payloads. Each part is stored as soon as it
 * lands, so the slow preflight (two Twilio GETs) does not hold back the
 * snapshot and assignment counts. console.loading stays true until all
 * parts are done. A failed part keeps its previous value: a failed
 * preflight sets preflightError instead of reading as "not yet run".
 */
export async function loadConsole(): Promise<void> {
    store.dispatch(Action.consoleLoadStart());
    store.dispatch(Action.consolePatch({ preflightError: null }));

    const snapshotTask = wizardCall('wizardSnapshot', {})
        .then((payload) => {
            const snap = payload && (payload as { snapshot?: unknown }).snapshot;
            if (snap) store.dispatch(Action.consolePatch({ snapshot: snap }));
        })
        .catch(() => { /* keep the cached snapshot */ });

    const assignmentsTask = wizardCall('wizardLoadAssignments', {})
        .then((payload) => {
            const items = payload && (payload as { items?: unknown[] }).items;
            if (Array.isArray(items)) store.dispatch(Action.consolePatch({ assignments: items }));
        })
        .catch(() => { /* keep the previous counts */ });

    const preflightTask = wizardCall('wizardRunPreflight', {})
        .then((payload) => {
            const checks = payload && (payload as { checks?: unknown[] }).checks;
            if (Array.isArray(checks)) {
                store.dispatch(Action.consolePatch({ preflight: checks, preflightAt: new Date().toISOString() }));
            } else {
                store.dispatch(Action.consolePatch({
                    preflightError: errorOf(payload, 'Preflight did not return any checks')
                }));
            }
        })
        .catch((e: unknown) => {
            store.dispatch(Action.consolePatch({
                preflightError: thrownText(e, 'Preflight did not run')
            }));
        });

    await Promise.all([snapshotTask, assignmentsTask, preflightTask]);
    store.dispatch(Action.consoleLoadSuccess({}));
}

/**
 * Run preflight again (Health "Re-run preflight", Twilio account "Test
 * connection"). One run at a time; a failed run sets preflightError and
 * keeps the previous checks.
 */
export async function rerunPreflight(): Promise<void> {
    if ((store.getState() as AppState).console.preflightRefreshing) return;
    store.dispatch(Action.consolePatch({ preflightRefreshing: true, preflightError: null }));
    try {
        const payload = await wizardCall('wizardRunPreflight', {});
        const checks = payload && (payload as { checks?: unknown[] }).checks;
        if (Array.isArray(checks)) {
            store.dispatch(Action.consolePatch({ preflight: checks, preflightAt: new Date().toISOString() }));
        } else {
            store.dispatch(Action.consolePatch({
                preflightError: errorOf(payload, 'Preflight did not return any checks')
            }));
        }
    } catch (e) {
        store.dispatch(Action.consolePatch({ preflightError: thrownText(e, 'Preflight did not run') }));
    } finally {
        store.dispatch(Action.consolePatch({ preflightRefreshing: false }));
    }
}

/**
 * Phone tab mode on / off (wizardSetPhoneTab, config
 * custrecord_ctc_phone_tab_mode). On success the cached snapshot's
 * phoneTab follows; open phone mode tabs switch at their next load.
 */
export async function setPhoneTab(on: boolean): Promise<void> {
    if ((store.getState() as AppState).console.phoneTabSaving) return;
    store.dispatch(Action.consolePatch({ phoneTabSaving: true, phoneTabError: null }));
    try {
        const result = await wizardCall('wizardSetPhoneTab', { phoneTab: on });
        if (!result || (result as { ok?: boolean }).ok === false) {
            store.dispatch(Action.consolePatch({ phoneTabError: errorOf(result, 'The phone mode setting was not saved') }));
            return;
        }
        const snap = (store.getState() as AppState).console.snapshot as Record<string, unknown> | null;
        store.dispatch(Action.consolePatch({ snapshot: { ...(snap || {}), phoneTab: on } }));
    } catch (e) {
        store.dispatch(Action.consolePatch({ phoneTabError: thrownText(e, 'The phone mode setting was not saved') }));
    } finally {
        store.dispatch(Action.consolePatch({ phoneTabSaving: false }));
    }
}

/**
 * Days to keep call recordings in Twilio (wizardSetRecordingKeep, config
 * custrecord_ctc_recording_keep_days; 0 = delete after the transcript).
 * On success the cached snapshot's recordingKeepDays follows.
 */
export async function setRecordingKeep(keepDays: number): Promise<void> {
    if ((store.getState() as AppState).console.recordingKeepSaving) return;
    store.dispatch(Action.consolePatch({ recordingKeepSaving: true, recordingKeepError: null }));
    try {
        const result = await wizardCall('wizardSetRecordingKeep', { keepDays });
        if (!result || (result as { ok?: boolean }).ok === false) {
            store.dispatch(Action.consolePatch({ recordingKeepError: errorOf(result, 'The recording setting was not saved') }));
            return;
        }
        const snap = (store.getState() as AppState).console.snapshot as Record<string, unknown> | null;
        store.dispatch(Action.consolePatch({ snapshot: { ...(snap || {}), recordingKeepDays: keepDays } }));
    } catch (e) {
        store.dispatch(Action.consolePatch({ recordingKeepError: thrownText(e, 'The recording setting was not saved') }));
    } finally {
        store.dispatch(Action.consolePatch({ recordingKeepSaving: false }));
    }
}

/** Mark the cached snapshot active / paused at once (the banner and rail follow). */
const setActiveFlag = (active: boolean): void => {
    const snap = (store.getState() as AppState).console.snapshot as Record<string, unknown> | null;
    store.dispatch(Action.consolePatch({ snapshot: { ...(snap || {}), active } }));
};

/**
 * Deactivate the SuiteApp (second click of the two-click confirm).
 * Busy while the call runs; on success the cached snapshot flips to
 * paused at once (banner shows), then the console reloads.
 */
export async function deactivate(): Promise<void> {
    if ((store.getState() as AppState).console.deactivating) return;
    store.dispatch(Action.deactivateStart());
    try {
        const result = await wizardCall('wizardActivate', { deactivate: true });
        if (!result || (result as { ok?: boolean }).ok === false) {
            store.dispatch(Action.deactivateFailure(errorOf(result, 'Deactivate failed')));
            return;
        }
        setActiveFlag(false);
        store.dispatch(Action.deactivateSuccess());
        await loadConsole();
    } catch (e) {
        store.dispatch(Action.deactivateFailure(thrownText(e, 'Deactivate failed')));
    }
}

/**
 * Reactivate the SuiteApp (Paused banner or Overview). The server re-runs
 * preflight; on preflight_failed the failed checks are kept for display
 * next to the button that ran it.
 */
export async function reactivate(source: ConsoleState['reactivateSource'] = 'banner'): Promise<void> {
    if ((store.getState() as AppState).console.reactivating) return;
    store.dispatch(Action.reactivateRequest(source));
    try {
        const result = await wizardCall('wizardActivate', {});
        if (!result || (result as { ok?: boolean }).ok === false) {
            const failed = (result && (result as { failedChecks?: CheckResult[] }).failedChecks) || [];
            store.dispatch(Action.reactivateFailure(
                errorOf(result, 'Reactivate failed'),
                Array.isArray(failed) ? failed : []
            ));
            return;
        }
        setActiveFlag(true);
        store.dispatch(Action.reactivateSuccess());
        await loadConsole();
    } catch (e) {
        store.dispatch(Action.reactivateFailure(thrownText(e, 'Reactivate failed')));
    }
}
