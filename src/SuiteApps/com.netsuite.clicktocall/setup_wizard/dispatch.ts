// @ts-check
/**
 * Dispatch state adapter — keeps the original `export let MODE` / setMode
 * public API working while delegating reads + writes to the new Store.
 *
 * Path D-Store-2 (2026-05-27) — refactored from "module-level let state +
 * direct setter exports" to "live-binding adapter on top of Store". The
 * exported `MODE` / `CURRENT_STEP` / `SELECTED_SECTION` / `RAIL_VISIBLE`
 * bindings stay as `export let` (Rollup-friendly live bindings — importers
 * see the current value), but they're synced from store.subscribe() rather
 * than mutated directly. The setter exports dispatch actions against the
 * store; the subscribe callback writes the new state back into the
 * live-binding locals.
 *
 * Why preserve the existing API?
 *   Every section + step + SpaClient site reads `MODE` / `CURRENT_STEP` /
 *   `SELECTED_SECTION` directly and writes via the setter exports. Replacing
 *   them with `store.getState().mode` reads + `store.dispatch(Action.X())`
 *   writes is a ~60-callsite refactor that fits naturally in D-Store-3's
 *   PureComponent + useSelector adoption. For D-Store-2, the adapter shape
 *   keeps the diff small (state model fixed; callsite API unchanged).
 *
 * Why use `export let` at all? See the original commit message
 * (Path B.3c) — ESM live bindings let importers see the current value
 * without forcing every read site to call a getter function.
 */

import {store} from './app/Store';
import {Action} from './app/Action';
import type {Mode, SectionName} from './app/InitialState';

// Re-export the type aliases at their original module location so
// importers like `import type {SectionName} from './dispatch'` keep
// working without churn.
export type {Mode, SectionName};

// ─────────────────────────────────────────────────────────────────────
// Live-binding adapter — `export let` synced from store.subscribe().
// Rollup preserves the binding semantics in concatenated AMD output;
// importers reading `MODE` see the current value, NOT a frozen snapshot.
// ─────────────────────────────────────────────────────────────────────

const initial = store.getState();

/** Top-level view mode (stepper vs console). Synced from Store. */
export let MODE: Mode = initial.mode;

/** 1-based step index within MODE='stepper'. Range: 1..5. Synced from Store. */
export let CURRENT_STEP: number = initial.currentStep;

/** Active section within MODE='console'. Synced from Store. */
export let SELECTED_SECTION: SectionName = initial.selectedSection;

/** U1.5: rail-visible across re-run wizard transitions. Synced from Store. */
export let RAIL_VISIBLE: boolean = initial.railVisible;

// Subscribe once at module-load time. Each store.dispatch(...) triggers
// the reducer, which updates store state, which fires this callback.
// We update our exported live bindings so any consumer reading `MODE`
// sees the latest value on its next read.
store.subscribe((state) => {
    MODE = state.mode;
    CURRENT_STEP = state.currentStep;
    SELECTED_SECTION = state.selectedSection;
    RAIL_VISIBLE = state.railVisible;
});

// ─────────────────────────────────────────────────────────────────────
// Setters — preserve original API. Each dispatches an action against
// the Store; the subscribe callback above updates the live bindings.
// ─────────────────────────────────────────────────────────────────────

export const setMode = (m: Mode): void => {
    store.dispatch(Action.setMode(m));
};

export const setCurrentStep = (n: number): void => {
    store.dispatch(Action.setCurrentStep(n));
};

export const setSelectedSection = (s: SectionName): void => {
    store.dispatch(Action.setSelectedSection(s));
};

export const setRailVisible = (v: boolean): void => {
    store.dispatch(Action.setRailVisible(v));
};
