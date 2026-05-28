// @ts-check
/**
 * App — root PureComponent for the Setup Wizard SPA.
 *
 * Path D-Store-3a (2026-05-27) — replaces the legacy
 * `scriptContext.setContent(buildRoot())` full-tree teardown rerender model
 * with UIF's canonical PureComponent + setState pattern. Subscribes to:
 *
 *   1. The Store (Path D-Store-2) — every dispatched action fires this
 *      component's setState, which re-evaluates render() and lets UIF
 *      diff the component tree (preserves focus, scroll, input transients
 *      that the old full-tree teardown lost on every state change).
 *
 *   2. The rerenderHook in AppController (also fires on STATE.console.*
 *      mutations from loaders + handlers that haven't yet been folded
 *      into the Store). D-Store-3 expands this when STATE.console becomes
 *      reducer-managed too.
 *
 * Both subscriptions call this.setState({tick: tick+1}) — a sentinel
 * state mutation that forces render() to re-run. UIF doesn't expose
 * PureComponent.forceUpdate(), so the increment-a-tick pattern is the
 * canonical way to trigger a render without a meaningful state change.
 *
 * The actual render output comes from AppController.renderRoot(), which
 * holds the bulk of the imperative UI logic (build* functions, handlers,
 * loaders). D-Store-3b will migrate those builders to JSX.
 *
 * Lifecycle:
 *   constructor          — set initial state (tick: 0)
 *   componentDidMount    — register rerender hook + subscribe to store +
 *                          fire initializeApp (wizardSnapshot resumability)
 *   componentWillUnmount — clear subscriptions + reset hook
 *   render               — return AppController.renderRoot()
 */

import { PureComponent, VDom } from '@uif-js/core';
import { store } from './app/Store';
import {
    initializeApp,
    renderRoot,
    setRerenderHook
} from './AppController';

interface AppState {
    /**
     * Sentinel counter incremented to force re-renders. The actual app
     * state lives in the Store (dispatch state) + STATE.console (transient
     * data state); this tick is just a "something changed, re-render"
     * signal. UIF doesn't expose forceUpdate() on PureComponent, so
     * setState({tick: tick+1}) is the canonical way to trigger render()
     * without a meaningful state change.
     */
    tick: number;
}

export default class App extends PureComponent<unknown, AppState> {
    private storeUnsubscribe: (() => void) | null = null;

    constructor(props: unknown, context: unknown) {
        super(props, context);
        this.state = { tick: 0 };
    }

    private forceRerender = (): void => {
        // UIF's PureComponent.setState only accepts a Partial<State> object
        // (no functional updater form like React's). Reading this.state.tick
        // is safe here because subscription callbacks fire synchronously
        // after dispatch — no batching window where stale state could be read.
        this.setState({ tick: this.state.tick + 1 });
    };

    componentDidMount(): void {
        // Register rerender hook FIRST so AppController.rerender() calls
        // (fired during initializeApp's wizardSnapshot resolution) update
        // this component instead of no-op'ing.
        setRerenderHook(this.forceRerender);

        // Subscribe to Store dispatches (Path D-Store-2 wired this from
        // SpaClient.ts before; now it lives here in App so the subscription
        // lifecycle is tied to the component mount lifecycle, not module
        // load).
        this.storeUnsubscribe = store.subscribe(this.forceRerender);

        // Fire the wizardSnapshot resumability flow. Sets up router +
        // enums + routes the user to console or the right step based on
        // their snapshot state. Was the body of run(scriptContext) before
        // D-Store-3a.
        initializeApp();
    }

    componentWillUnmount(): void {
        if (this.storeUnsubscribe) {
            this.storeUnsubscribe();
            this.storeUnsubscribe = null;
        }
        // Reset the hook to a no-op so any in-flight async callbacks
        // calling rerender() after unmount don't try to update a dead
        // component.
        setRerenderHook(() => { /* unmounted */ });
    }

    render(): VDom.Node {
        // AppController.renderRoot() returns a Component instance (or null
        // during mount-routing). Component is in VDom.Node's union, so the
        // cast is safe at the type-system boundary.
        return renderRoot() as VDom.Node;
    }
}
