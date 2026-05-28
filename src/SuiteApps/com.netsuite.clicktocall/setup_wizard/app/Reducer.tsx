// @ts-check
/**
 * Reducer for the wizard + console Store.
 *
 * Path D-Store-2 (2026-05-27) — pure function that takes (state, action)
 * and returns the next state. Mirrors Oracle's airport360 sample
 * (`Reducer.tsx`).
 *
 * Pattern:
 *   Map<ActionType, (state) => newState> — handlers keyed by ActionType
 *   Symbol. Each handler uses `ImmutableUpdate.of(state, draft => {...})`
 *   from @uif-js/core to produce the next state via mutation-style code
 *   that yields an immutable result (equivalent to Immer's `produce`).
 *
 * Why ImmutableUpdate over spread?
 *   - Deep nesting: `state.console.phones[i].employeeIds.push(x)` reads
 *     naturally with a draft; the spread equivalent is 4 layers of
 *     `...prev, console: {...prev.console, phones: prev.console.phones.map(...)}`.
 *   - Reference stability: ImmutableUpdate only creates new references
 *     along the changed path; unchanged subtrees keep their refs, so
 *     React-style reference-equality optimizations work.
 *
 * Unknown action types fall through unchanged. Initial dispatch from
 * Store.create fires with action type === Store.INIT_ACTION_TYPE; the
 * fallthrough handles it correctly.
 */

import {ImmutableUpdate} from '@uif-js/core';
import {ActionType} from './Action';
import type {AppAction} from './Action';
import type {AppState} from './InitialState';

type Handler = (state: AppState) => AppState;

export default function reducer(state: AppState, action: AppAction): AppState {
    // Map<Symbol, Handler> — Symbol-keyed dispatch. Created per call so
    // each handler closure captures the current action argument.
    const actionMap: Map<symbol, Handler> = new Map([
        [
            ActionType.SET_MODE,
            (state) => ImmutableUpdate.of(state, (draft) => {
                draft.mode = (action as { payload: AppState['mode'] }).payload;
            })
        ],
        [
            ActionType.SET_CURRENT_STEP,
            (state) => ImmutableUpdate.of(state, (draft) => {
                draft.currentStep = (action as { payload: number }).payload;
            })
        ],
        [
            ActionType.SET_SELECTED_SECTION,
            (state) => ImmutableUpdate.of(state, (draft) => {
                draft.selectedSection =
                    (action as { payload: AppState['selectedSection'] }).payload;
            })
        ],
        [
            ActionType.SET_RAIL_VISIBLE,
            (state) => ImmutableUpdate.of(state, (draft) => {
                draft.railVisible = (action as { payload: boolean }).payload;
            })
        ]
    ]);

    const handler = actionMap.get(action.type as symbol);
    return handler ? handler(state) : state;
}
