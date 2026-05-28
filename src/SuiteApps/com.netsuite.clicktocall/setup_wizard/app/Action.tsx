// @ts-check
/**
 * Action types + action creators for the wizard + console Store.
 *
 * Path D-Store-2 (2026-05-27) — Redux-style action pattern matching
 * Oracle's airport360 sample (`Action.tsx`). Symbol-keyed ActionType
 * avoids string-collision risks across feature modules.
 *
 * Convention:
 *   - ActionType is a frozen dict of unique Symbols (one per action)
 *   - Action is a dict of factory functions; each returns an Action
 *     object with {type, payload} shape per the Store.Action interface
 *     from @uif-js/core
 *   - Action creators are TYPED — params constrain what payload shape
 *     downstream reducer handlers receive
 *
 * Scope of this file (D-Store-2 minimum):
 *   4 actions — setMode, setCurrentStep, setSelectedSection,
 *   setRailVisible. Mirrors the 4 setters that lived in dispatch.ts.
 *
 * Future: D-Store-3 will add step + console actions (loadSnapshot,
 * loadPreflight, deactivate, savePhonesAssignment, etc.) as the
 * STATE.* direct-mutation sites get refactored into the Store.
 */

import type {Mode, SectionName} from './InitialState';

// ─────────────────────────────────────────────────────────────────────
// ActionType — Symbol-keyed enum. Symbol() guarantees uniqueness
// across modules (vs string keys which could collide if two action
// creators in different feature areas pick the same name).
// ─────────────────────────────────────────────────────────────────────

const ActionType = {
    SET_MODE: Symbol('setMode'),
    SET_CURRENT_STEP: Symbol('setCurrentStep'),
    SET_SELECTED_SECTION: Symbol('setSelectedSection'),
    SET_RAIL_VISIBLE: Symbol('setRailVisible')
} as const;

// ─────────────────────────────────────────────────────────────────────
// Action interfaces — narrow the payload shape per action so the
// reducer can pattern-match on type + read the correctly-typed payload
// without casting.
// ─────────────────────────────────────────────────────────────────────

interface SetModeAction {
    type: typeof ActionType.SET_MODE;
    payload: Mode;
}

interface SetCurrentStepAction {
    type: typeof ActionType.SET_CURRENT_STEP;
    payload: number;
}

interface SetSelectedSectionAction {
    type: typeof ActionType.SET_SELECTED_SECTION;
    payload: SectionName;
}

interface SetRailVisibleAction {
    type: typeof ActionType.SET_RAIL_VISIBLE;
    payload: boolean;
}

/** Union of all actions the reducer handles. */
export type AppAction =
    | SetModeAction
    | SetCurrentStepAction
    | SetSelectedSectionAction
    | SetRailVisibleAction;

// ─────────────────────────────────────────────────────────────────────
// Action creators — typed factory functions returning Action objects.
// ─────────────────────────────────────────────────────────────────────

const Action = {
    setMode(mode: Mode): SetModeAction {
        return { type: ActionType.SET_MODE, payload: mode };
    },
    setCurrentStep(step: number): SetCurrentStepAction {
        return { type: ActionType.SET_CURRENT_STEP, payload: step };
    },
    setSelectedSection(section: SectionName): SetSelectedSectionAction {
        return { type: ActionType.SET_SELECTED_SECTION, payload: section };
    },
    setRailVisible(visible: boolean): SetRailVisibleAction {
        return { type: ActionType.SET_RAIL_VISIBLE, payload: visible };
    }
} as const;

export { Action, ActionType };
