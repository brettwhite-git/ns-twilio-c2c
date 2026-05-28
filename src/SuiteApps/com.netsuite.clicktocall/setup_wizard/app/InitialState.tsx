// @ts-check
/**
 * Initial state tree for the wizard + console Store.
 *
 * Path D-Store-2 (2026-05-27) — adopts Store.create({reducer, state, ...})
 * from @uif-js/core. This file is the canonical state shape that flows
 * through the reducer; subsequent reads (in components) and writes
 * (via dispatched actions) all reference this tree.
 *
 * Scope of this file (intentional minimum for D-Store-2):
 *   Just the 4 dispatch fields — mode / currentStep / selectedSection /
 *   railVisible. These are the user-navigation concerns that gate the
 *   render output. They were `export let MODE = '...'` etc. in
 *   dispatch.ts; now they live as reducer-managed state.
 *
 * Out of scope for D-Store-2 (folds in during D-Store-3):
 *   - Step state (step2 / step3 / step4 / step5) currently in state.ts
 *   - Console state (snapshot, assignments, preflight, drift, phones*,
 *     voice*, etc.) currently in state.ts
 *
 * Why minimum scope: the dispatch state has clear setter semantics
 * (4 setters today) — easy to migrate to 4 action creators in one
 * commit. The step + console state has ~150 mutation sites; expanding
 * the Store to cover those is a bigger refactor that pairs naturally
 * with D-Store-3's PureComponent + useSelector adoption.
 */

/**
 * Top-level view mode:
 *   - 'stepper': 5-step onboarding wizard (Steps 1-5)
 *   - 'console': post-activation Admin Console
 */
export type Mode = 'stepper' | 'console';

/**
 * Active section within MODE='console'. Routes content via
 * NavigationDrawer's onSelectedValueChanged. Mirrors the files under
 * sections/.
 */
export type SectionName = 'overview' | 'phones' | 'voice' | 'credentials' | 'health';

/**
 * The reducer's state shape. Currently dispatch-only; will expand to
 * include step + console state in D-Store-3.
 */
export interface AppState {
    /** Top-level view mode. */
    mode: Mode;
    /** 1-based step index within mode='stepper'. Range: 1..5. */
    currentStep: number;
    /** Active section within mode='console'. */
    selectedSection: SectionName;
    /**
     * U1.5: once admin reaches the console (snapshot.active === true),
     * the left rail stays visible even when they click "Re-run wizard"
     * and drop back into stepper mode.
     */
    railVisible: boolean;
}

/**
 * Initial state — what the wizard starts in on fresh mount.
 * SpaClient.ts's run() resumability logic transitions this based on
 * the loaded snapshot.
 */
const initialState: AppState = {
    mode: 'stepper',
    currentStep: 1,
    selectedSection: 'overview',
    railVisible: false
};

export default initialState;
