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
            safe(wizardCall('wizardListRecentCalls', { limit: 10 }))
        ]);

        const slice: Partial<ConsoleState> = {
            snapshot,
            assignments: (assignments && (assignments as { rows?: unknown[] }).rows) || null,
            preflight: (preflight && (preflight as { checks?: unknown[] }).checks) || null,
            recentCalls: (recentCalls && (recentCalls as { calls?: unknown[] }).calls) || null
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
