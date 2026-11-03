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

// ─────────────────────────────────────────────────────────────────────
// Hash routes — #/overview, #/phones, #/inbound, #/voice, #/credentials,
// #/setup/<n>. Reload and deep links open the right page; back/forward
// move between pages (hashchange). Unknown hash → overview.
// ─────────────────────────────────────────────────────────────────────

const SECTIONS: SectionName[] = ['overview', 'phones', 'inbound', 'voice', 'credentials'];

export type HashRoute =
    | { kind: 'section'; section: SectionName }
    | { kind: 'step'; step: number };

/** Parse a location hash ('#/phones', '#/setup/3'). null = empty or unknown. */
export function parseHash(hash: string): HashRoute | null {
    const path = String(hash || '').replace(/^#\/?/, '').replace(/\/+$/, '');
    if (!path) return null;
    const step = /^setup\/([1-5])$/.exec(path);
    if (step) return { kind: 'step', step: Number(step[1]) };
    const section = SECTIONS.find((sec) => sec === path);
    return section ? { kind: 'section', section } : null;
}

const hashFor = (route: HashRoute): string =>
    route.kind === 'section' ? '#/' + route.section : '#/setup/' + route.step;

/**
 * Show `route` in the address bar. push = a new history entry (user
 * navigation); else replace (mount, redirects). pushState never fires
 * hashchange, so this does not loop back into onHashChange.
 */
function writeHash(route: HashRoute, push: boolean): void {
    try {
        const target = hashFor(route);
        if (window.location.hash === target) return;
        if (push) window.history.pushState(null, '', target);
        else window.history.replaceState(null, '', target);
    } catch (e) {
        // No history API (or a sandboxed frame): routing still works in-app.
    }
}

/** The route of the page shown now. */
function currentRoute(state: AppState): HashRoute {
    return state.mode === 'stepper'
        ? { kind: 'step', step: state.currentStep }
        : { kind: 'section', section: state.selectedSection };
}

/** Furthest step opened this session (back/forward may return to it). */
let furthestStep = 0;

/**
 * Highest step a hash may open. An incomplete config may not skip ahead
 * of its landing step or of a step already reached this session; a
 * complete but inactive config may open any step (as "Re-run wizard" does).
 */
function maxStepFor(state: AppState): number {
    const snap = (state.console.snapshot || {}) as SnapshotForRouting;
    const landing = determineLandingStep(snap);
    return landing === 'console' ? TOTAL_STEPS : Math.max(landing, furthestStep);
}

/** May the console sections open now? (Not on a fresh / incomplete install.) */
function consoleAllowed(state: AppState): boolean {
    const snap = (state.console.snapshot || {}) as SnapshotForRouting;
    return state.railVisible || determineLandingStep(snap) === 'console';
}

// ─────────────────────────────────────────────────────────────────────
// After a page change: scroll to the top and move focus to the page
// heading (marked data-ctc-page-heading by ConsoleShell / StepperShell),
// then make sure the rail shows the right item.
// ─────────────────────────────────────────────────────────────────────

type RailSync = () => void;
let railSync: RailSync | null = null;

/** NavRail registers how to re-select its drawer item (see NavRail.tsx). */
export function registerRailSync(fn: RailSync): void {
    railSync = fn;
}

function afterNavigate(): void {
    const run = (): void => {
        try { if (railSync) railSync(); } catch (e) { /* rail sync is best effort */ }
        try {
            const heading = document.querySelector('[data-ctc-page-heading]') as HTMLElement | null;
            if (!heading) return;
            for (let el: HTMLElement | null = heading.parentElement; el; el = el.parentElement) {
                if (el.scrollTop > 0) el.scrollTop = 0;
            }
            if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
            heading.focus({ preventScroll: true });
        } catch (e) { /* focus / scroll are best effort */ }
    };
    // The store re-renders synchronously on dispatch, but UIF may finish
    // the DOM work after this tick: run after the next frame.
    if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => { setTimeout(run, 0); });
    } else {
        setTimeout(run, 0);
    }
}

// ─────────────────────────────────────────────────────────────────────
// goTo thunks
// ─────────────────────────────────────────────────────────────────────

/**
 * Advance to (or jump to) a specific step. Flips MODE back to 'stepper'
 * and fires the step-specific data loader.
 */
export function goToStep(stepNum: number, opts: { push?: boolean } = {}): void {
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
    const changed = state.mode !== 'stepper' || state.currentStep !== clamped;
    furthestStep = Math.max(furthestStep, clamped);
    store.dispatch(Action.setMode('stepper'));
    store.dispatch(Action.setCurrentStep(clamped));
    writeHash({ kind: 'step', step: clamped }, opts.push !== false && !state.mountRouting);

    // Per-step loader dispatch. Steps 3/4/5 loaders aren't yet ported to
    // effects modules — they still live in components/steps/. Phase 3
    // ports them; until then, this thunk only handles the prereqs case.
    if (clamped === 1) {
        loadPrereqs();
    }
    if (changed && !state.mountRouting) afterNavigate();
}

/**
 * Enter the Admin Console on `section` (default Overview). Flips
 * RAIL_VISIBLE so the left rail persists across mode flips, clears
 * any in-flight error / modal / confirm state, and fires loadConsole.
 */
export function goToConsole(section: SectionName = 'overview', opts: { push?: boolean } = {}): void {
    const state = store.getState() as AppState;
    store.dispatch(Action.setMode('console'));
    store.dispatch(Action.setSelectedSection(section));
    store.dispatch(Action.setRailVisible(true));
    store.dispatch(Action.actionErrorSet(null));
    writeHash({ kind: 'section', section }, opts.push !== false && !state.mountRouting);
    loadConsole();
    loadSectionData(section);
    if (!state.mountRouting) afterNavigate();
}

/** First-visit data for a section (Phones grid). */
function loadSectionData(section: SectionName): void {
    const c = (store.getState() as AppState).console;
    if (section === 'phones' && c.phonesNumbers === null && !c.phonesLoading) {
        loadPhonesData();
    }
}

/**
 * Change the active console section. Switches SELECTED_SECTION and
 * lazy-loads section-specific data on first visit (Phones DataGrid).
 * Calling it for the section already shown is allowed (the rail item
 * that is already selected still "navigates": scroll to top + focus).
 */
export function goToSection(sectionName: SectionName, opts: { push?: boolean } = {}): void {
    const state = store.getState() as AppState;
    store.dispatch(Action.setSelectedSection(sectionName));

    // If entering console from stepper mode (Re-run wizard → navigate),
    // also flip MODE so the rail's selected value resolves correctly.
    if (state.mode === 'stepper') {
        store.dispatch(Action.setMode('console'));
    }
    store.dispatch(Action.actionErrorSet(null));
    writeHash({ kind: 'section', section: sectionName }, opts.push !== false);

    loadSectionData(sectionName);
    afterNavigate();
}

// ─────────────────────────────────────────────────────────────────────
// Mount + back/forward
// ─────────────────────────────────────────────────────────────────────

/**
 * Mount landing. `landing` is determineLandingStep(snapshot). A hash in
 * the URL wins when it is allowed; otherwise the landing page opens and
 * the hash is rewritten to match.
 */
export function landFromHash(landing: number | 'console'): void {
    const route = parseHash(window.location.hash);
    const state = store.getState() as AppState;

    if (landing === 'console') {
        if (route && route.kind === 'step' && !isConfigActive(state)) {
            // Configured but paused: a step link opens the stepper with
            // the rail (as "Re-run wizard" does).
            store.dispatch(Action.setRailVisible(true));
            goToStep(route.step, { push: false });
            return;
        }
        goToConsole(route && route.kind === 'section' ? route.section : 'overview', { push: false });
        return;
    }

    // Incomplete config: the stepper, never past the landing step.
    const step = route && route.kind === 'step' ? Math.min(route.step, landing) : landing;
    goToStep(step, { push: false });
}

/** Back / forward (or a typed hash): open the page the hash names. */
function onHashChange(): void {
    const state = store.getState() as AppState;
    if (state.mountRouting) return;
    const route = parseHash(window.location.hash);

    if (route && route.kind === 'section' && consoleAllowed(state)) {
        if (state.mode === 'console' && state.selectedSection === route.section) return;
        if (state.mode === 'console') goToSection(route.section, { push: false });
        else goToConsole(route.section, { push: false });
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
    // Unknown hash, or a page that is not allowed now.
    if (!route && consoleAllowed(state)) {
        if (state.mode === 'console' && state.selectedSection === 'overview') {
            writeHash({ kind: 'section', section: 'overview' }, false);
        } else if (state.mode === 'console') {
            goToSection('overview', { push: false });
        } else {
            goToConsole('overview', { push: false });
        }
        return;
    }
    writeHash(currentRoute(state), false);
}

let hashListening = false;

/** Listen for hashchange once (App.componentDidMount). */
export function startHashRouting(): void {
    if (hashListening) return;
    hashListening = true;
    try { window.addEventListener('hashchange', onHashChange); }
    catch (e) { hashListening = false; }
}
