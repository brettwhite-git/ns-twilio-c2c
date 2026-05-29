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
import type {ConsoleState} from '../InitialState';

/**
 * Load the four console-shared payloads in parallel. Mirrors
 * AppController.loadConsole() (paths 447-490). Each Promise rejects
 * silently — partial failures degrade to null fields rather than
 * aborting the whole load — matching legacy behavior.
 */
export async function loadConsole(): Promise<void> {
    store.dispatch(Action.consoleLoadStart());

    const safe = <T>(promise: Promise<T>): Promise<T | null> =>
        promise.catch(() => null);

    try {
        const [snapshot, assignments, preflight, recentCalls] = await Promise.all([
            safe(wizardCall('wizardSnapshot', {})),
            safe(wizardCall('wizardLoadAssignments', {})),
            safe(wizardCall('wizardRunPreflight', {})),
            // Server clamps limit to [1, 25] (see ctc_sl_wizard_api.js
            // wizardListRecentCalls handler). Ask for the max so the
            // Overview chart has the widest sample of recent CTC-tagged
            // Phone Calls to aggregate by sales rep.
            safe(wizardCall('wizardListRecentCalls', { limit: 25 }))
        ]);

        // Server-response shape extraction — match the legacy
        // AppController loadConsole exactly:
        //   wizardSnapshot           -> { snapshot: {...} }
        //   wizardLoadAssignments    -> { items: [...] }
        //   wizardRunPreflight       -> { checks: [...] }
        //   wizardListRecentCalls    -> { items: [...] }   (NOT .calls!)
        // Default to [] (empty array) on missing/failed so the UI can
        // render its "no data" state instead of staying in "loading…".
        const snap = snapshot && (snapshot as { snapshot?: unknown }).snapshot;
        const slice: Partial<ConsoleState> = {
            snapshot: snap || null,
            assignments: (assignments && (assignments as { items?: unknown[] }).items) || [],
            preflight: (preflight && (preflight as { checks?: unknown[] }).checks) || [],
            recentCalls: (recentCalls && (recentCalls as { items?: unknown[] }).items) || []
        };

        store.dispatch(Action.consoleLoadSuccess(slice));
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Console load failed';
        store.dispatch(Action.consoleLoadFailure(msg));
    }
}

/**
 * Deactivate the SuiteApp. Mirrors AppController.confirmDeactivate
 * (paths 690-720). On success the snapshot is refetched so the console
 * shows the Paused banner.
 */
export async function deactivate(): Promise<void> {
    store.dispatch(Action.deactivateRequest());
    try {
        const result = await wizardCall('wizardActivate', { deactivate: true });
        if (result && (result as { ok?: boolean }).ok === false) {
            const err = (result as { error?: string }).error || 'Deactivate failed';
            store.dispatch(Action.deactivateFailure(err));
            return;
        }
        store.dispatch(Action.deactivateSuccess());
        await loadConsole();
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Deactivate failed';
        store.dispatch(Action.deactivateFailure(msg));
    }
}

/**
 * Reactivate the SuiteApp. Mirrors AppController.reactivate (paths
 * 722-740). Triggered from the Paused banner's CTA.
 */
export async function reactivate(): Promise<void> {
    store.dispatch(Action.reactivateRequest());
    try {
        const result = await wizardCall('wizardActivate', {});
        if (result && (result as { ok?: boolean }).ok === false) {
            const err = (result as { error?: string }).error || 'Reactivate failed';
            store.dispatch(Action.reactivateFailure(err));
            return;
        }
        store.dispatch(Action.reactivateSuccess());
        await loadConsole();
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Reactivate failed';
        store.dispatch(Action.reactivateFailure(msg));
    }
}
