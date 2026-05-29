/**
 * Prereqs effect — async action thunk for Step 1's environment-check
 * preflight (wizardPrereqs).
 *
 * Phase 2 (2026-05-28) — wraps the legacy `loadPrereqs` callback in
 * AppController.tsx (paths 760-790) as a dispatch-based effect.
 */

import {store} from '../Store';
import {Action} from '../Action';
import {wizardCall} from '../../services/wizardApi';

/**
 * Fetch the Step 1 prereqs check results from the server. Triggered
 * automatically when the user lands on Step 1 (fresh install path).
 *
 * The Suitelet returns `{ checks: [{ id, name, status, message }, ...] }`
 * — an array of per-check rows. Stored in state.prereqs.checks.
 */
export async function loadPrereqs(): Promise<void> {
    store.dispatch(Action.prereqsLoadStart());

    try {
        const payload = await wizardCall('wizardPrereqs', {});
        const checks = (payload && (payload as { checks?: unknown[] }).checks) || [];
        store.dispatch(Action.prereqsLoadSuccess(checks));
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Prereqs load failed';
        store.dispatch(Action.prereqsLoadFailure(msg));
    }
}
