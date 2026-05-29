// @ts-check
/**
 * Store singleton for the wizard + console.
 *
 * Path D-Store-2 (2026-05-27) — Store.create({reducer, state}) from
 * @uif-js/core. Single source of truth for dispatch state (mode,
 * currentStep, selectedSection, railVisible). Replaces the
 * `export let MODE = '...'` module-level state that lived in
 * dispatch.ts.
 *
 * Why a module-level singleton?
 *   Airport360 creates its Store inside Airport.tsx's PureComponent
 *   constructor. We don't have PureComponent yet (D-Store-3 adds it).
 *   For D-Store-2, the Store lives as a module-level singleton so
 *   dispatch.ts (the backward-compat adapter) and SpaClient.ts can
 *   both reach it. D-Store-3 will optionally move the Store init
 *   into App.tsx's constructor and pass it via Store.Provider context.
 *
 * onStateChanged hookup:
 *   This Store is created BEFORE SpaClient.ts's rerender() function
 *   exists (module-import time vs run() invocation time). So onStateChanged
 *   is wired via store.subscribe(...) inside SpaClient.ts's run() callback,
 *   AFTER rerender is defined. Until that subscribe lands, dispatched
 *   actions still update the state but no rerender fires — which is
 *   fine because the Store isn't used until run() runs.
 */

import {Store} from '@uif-js/core';
import reducer from './Reducer';
import initialState from './InitialState';
import type {AppState} from './InitialState';

/**
 * The wizard + console Store. Singleton. Read state via `store.getState()`,
 * mutate via `store.dispatch(Action.x(...))`.
 *
 * @uif-js/core's TypeScript declaration types Store.create's return as
 * `Self.Store` (unparameterized) rather than `Store<AppState>`. We cast
 * the result to the parameterized type so consumers (dispatch.ts,
 * SpaClient.ts) get correct state-shape autocomplete.
 */
export const store = Store.create({
    reducer,
    state: initialState
}) as Store<AppState>;
