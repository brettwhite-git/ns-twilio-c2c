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
import type {AppState, SectionName, Step2State, Step3State} from '../InitialState';

// ─────────────────────────────────────────────────────────────────────
// determineLandingStep — pure helper
// ─────────────────────────────────────────────────────────────────────

interface SnapshotForRouting {
    accountSid?: string;
    apiKeySid?: string;
    apiSecretId?: string;
    twimlAppSid?: string;
    phoneNumber?: string;
    active?: boolean;
}

/** The wizardSnapshot config shape cached in state.console.snapshot. */
interface ConfigSnapshot extends SnapshotForRouting {
    intelServiceSid?: string;
}

/**
 * True while Click-to-Call is active (console.snapshot.active === true).
 * While active the stepper is closed: the rail hides "Re-run wizard" and
 * goToStep is a no-op. Deactivate (Overview) reopens it.
 */
export function isConfigActive(state: AppState): boolean {
    const snap = state.console.snapshot as ConfigSnapshot | null;
    return !!snap && snap.active === true;
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

    // An active config never lands in the stepper (stepper only after
    // a Deactivate).
    if (snap.active === true) return 'console';
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

const STEP2_FIELDS: Array<keyof Step2State> = ['accountSid', 'apiKeySid', 'apiSecretId'];
const STEP3_FIELDS: Array<'twimlAppSid' | 'phoneNumber' | 'intelServiceSid'> =
    ['twimlAppSid', 'phoneNumber', 'intelServiceSid'];

/**
 * Copy saved config values from console.snapshot into the Step 2 / 3
 * form fields that are still empty. Never overwrites a typed value.
 * apiSecretId is the custsecret_ script id (a pointer), never the
 * secret value; the snapshot does not carry the value.
 * Step 4 needs nothing here: loadStep4Lists loads saved assignments.
 */
function prefillFromSnapshot(state: AppState): void {
    const snap = state.console.snapshot as ConfigSnapshot | null;
    if (!snap) return;
    const saved = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

    STEP2_FIELDS.forEach((field) => {
        const v = saved(snap[field]);
        if (v && !state.step2[field]) {
            store.dispatch(Action.step2FieldChange(field, v));
        }
    });
    STEP3_FIELDS.forEach((field) => {
        const v = saved(snap[field]);
        if (v && !(state.step3 as Step3State)[field]) {
            store.dispatch(Action.step3FieldChange(field, v));
        }
    });
}

/**
 * Advance to (or jump to) a specific step. Flips MODE back to 'stepper'
 * and fires the step-specific data loader.
 */
export function goToStep(stepNum: number): void {
    const state = store.getState() as AppState;

    // Stepper only after a reset: while the config is active this is a
    // no-op and the admin stays where they are (the console). The Step 5
    // activation flow is not affected: it reaches Step 5 while still
    // inactive, activates in place, and leaves with goToConsole.
    if (isConfigActive(state)) return;

    // Entering the stepper (from the console after a Deactivate, or the
    // mount landing): pre-fill saved values the admin has not typed.
    if (state.mode === 'console' || state.mountRouting) {
        prefillFromSnapshot(state);
        // A Step 5 activation earlier this session must not carry over:
        // the Stepper and Step 5 would show the success view at once.
        if (state.step5.activated) {
            store.dispatch(Action.step5FieldChange('activated', false));
        }
    }

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
