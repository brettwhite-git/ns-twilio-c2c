/**
 * Navigation effects — thunks for mode/step/section transitions plus
 * the `determineLandingStep` pure helper that decides where a returning
 * admin lands based on their wizardSnapshot.
 *
 * Phase 2 (2026-05-28) — wraps the legacy `orchestration/router.ts`
 * functions as dispatch-based effects. Phase 6 replaces these with
 * declarative <Router.Hash> + <Router.Routes> JSX in App.tsx and deletes
 * orchestration/router.ts entirely.
 *
 * Pattern:
 *   - determineLandingStep is pure (no dispatch, no store reads)
 *   - goToStep / goToConsole / goToSection dispatch the relevant
 *     SET_MODE / SET_CURRENT_STEP / SET_SELECTED_SECTION actions and
 *     fire follow-up effects (loadPrereqs, loadConsole, loadPhonesData)
 */

import {store} from '../Store';
import {Action} from '../Action';
import {loadConsole} from './console';
import {loadPhonesData} from './phones';
import {loadPrereqs} from './prereqs';
import type {SectionName} from '../InitialState';

// ─────────────────────────────────────────────────────────────────────
// determineLandingStep — pure helper
// ─────────────────────────────────────────────────────────────────────

interface SnapshotForRouting {
    accountSid?: string;
    apiKeySid?: string;
    apiSecretId?: string;
    twimlAppSid?: string;
    phoneNumber?: string;
}

/**
 * Routing decision for the post-mount snapshot resolve. Returns 1..5
 * (step index) or 'console' (post-activation landing).
 *
 * Mirrors orchestration/router.ts determineLandingStep — kept pure so
 * tests can pin specific snapshot shapes against expected routes.
 */
export function determineLandingStep(snap: SnapshotForRouting): number | 'console' {
    const has = (v: string | undefined | null): boolean =>
        !!(v && String(v).trim().length > 0);

    if (!has(snap.accountSid) || !has(snap.apiKeySid)) return 2;
    if (!has(snap.apiSecretId)) return 2;
    if (!has(snap.twimlAppSid) || !has(snap.phoneNumber)) return 3;

    // Once voice config is set, returning admins always land on the
    // console — refresh-after-deactivate routes to the Reactivate
    // banner, not back into the stepper. The active flag only controls
    // rep call placement, not admin console access.
    return 'console';
}

// ─────────────────────────────────────────────────────────────────────
// goTo thunks — dispatch + fire follow-up effects
// ─────────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 5;

/**
 * Advance to (or jump to) a specific step. Flips MODE back to 'stepper'
 * and fires the step-specific data loader.
 */
export function goToStep(stepNum: number): void {
    const clamped = Math.max(1, Math.min(TOTAL_STEPS, stepNum));
    store.dispatch(Action.setMode('stepper'));
    store.dispatch(Action.setCurrentStep(clamped));

    // Per-step loader dispatch. Steps 3/4/5 loaders aren't yet ported to
    // effects modules — they still live in components/steps/. Phase 3
    // ports them; until then, this thunk only handles the prereqs case.
    if (clamped === 1) {
        loadPrereqs();
    }
}

/**
 * Enter the Admin Console. Lands on 'overview' section, flips
 * RAIL_VISIBLE so the left rail persists across mode flips, clears
 * any in-flight error / modal / confirm state, and fires loadConsole.
 */
export function goToConsole(): void {
    store.dispatch(Action.setMode('console'));
    store.dispatch(Action.setSelectedSection('overview'));
    store.dispatch(Action.setRailVisible(true));
    store.dispatch(Action.actionErrorSet(null));
    loadConsole();
}

/**
 * Change the active console section. Switches SELECTED_SECTION and
 * lazy-loads section-specific data on first visit (Phones DataGrid).
 */
export function goToSection(sectionName: SectionName): void {
    store.dispatch(Action.setSelectedSection(sectionName));

    // If entering console from stepper mode (Re-run wizard → navigate),
    // also flip MODE so the rail's selected value resolves correctly.
    const state = store.getState() as { mode: string; console: { phonesNumbers: unknown } };
    if (state.mode === 'stepper') {
        store.dispatch(Action.setMode('console'));
    }
    store.dispatch(Action.actionErrorSet(null));

    if (sectionName === 'phones' && state.console.phonesNumbers === null) {
        loadPhonesData();
    }
}
