/**
 * App — root PureComponent for the Setup Wizard SPA.
 *
 * Phase 6 (2026-05-28) — atomic JSX shell. Replaces the legacy
 * `AppController.renderRoot()` imperative tree with a declarative
 * JSX render that maps state.mode + state.currentStep + state.selectedSection
 * to one of the new Step{1..5} / *Page components, wrapped in
 * StepperShell or ConsoleShell.
 *
 * Lifecycle:
 *   constructor          — set initial state (tick: 0)
 *   componentDidMount    — subscribe to Store + fire initializeApp
 *                          (wizardSnapshot resumability routing)
 *   componentWillUnmount — clear store subscription
 *   render               — store-driven JSX render
 */

import {PureComponent, VDom} from '@uif-js/core';
import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import {store} from './app/Store';
import {Action} from './app/Action';
import {wizardCall} from './services/wizardApi';
import {
    determineLandingStep,
    goToConsole,
    goToStep
} from './app/effects/navigation';
import type {AppState} from './app/InitialState';
import Step1 from './components/steps/Step1';
import Step2 from './components/steps/Step2';
import Step3 from './components/steps/Step3';
import Step4 from './components/steps/Step4';
import Step5 from './components/steps/Step5';
import OverviewPage from './components/page/OverviewPage';
import PhonesPage from './components/page/PhonesPage';
import VoicePage from './components/page/VoicePage';
import CredentialsPage from './components/page/CredentialsPage';
import HealthPage from './components/page/HealthPage';
import {ConsoleShell} from './components/shared/ConsoleShell';
import {StepperShell} from './components/shared/StepperShell';

interface AppInternalState {
    tick: number;
}

interface SnapshotForRouting {
    accountSid?: string;
    apiKeySid?: string;
    apiSecretId?: string;
    twimlAppSid?: string;
    phoneNumber?: string;
    active?: boolean;
}

export default class App extends PureComponent<unknown, AppInternalState> {
    private storeUnsubscribe: (() => void) | null = null;

    constructor(props: unknown, context: unknown) {
        super(props, context);
        this.state = { tick: 0 };
    }

    private forceRerender = (): void => {
        this.setState({ tick: this.state.tick + 1 });
    };

    componentDidMount(): void {
        this.storeUnsubscribe = store.subscribe(this.forceRerender);
        this.initializeApp();
    }

    componentWillUnmount(): void {
        if (this.storeUnsubscribe) {
            this.storeUnsubscribe();
            this.storeUnsubscribe = null;
        }
    }

    /**
     * Fire the wizardSnapshot resumability flow on mount. Determines
     * whether the admin lands on the console (post-activation) or on
     * a specific step (fresh install or mid-wizard).
     *
     * While the snapshot is in-flight, state.mountRouting === true so
     * render() shows a centered Loader instead of flashing Step 1
     * for returning admins whose target is the console.
     */
    private async initializeApp(): Promise<void> {
        store.dispatch(Action.setMountRouting(true));
        try {
            const payload = await wizardCall('wizardSnapshot', {});
            const snap = (payload && (payload as { snapshot?: SnapshotForRouting }).snapshot) || {};
            // Cache the snapshot for downstream consumers (Step5 review,
            // Voice/Credentials/Overview rendering, Paused banner gate).
            store.dispatch(Action.consoleLoadSuccess({ snapshot: snap as never }));

            const target = determineLandingStep(snap);
            if (target === 'console') {
                goToConsole();
            } else {
                goToStep(target);
            }
        } catch (e) {
            // Snapshot failed — land on Step 1 (fresh install path).
            goToStep(1);
        } finally {
            store.dispatch(Action.setMountRouting(false));
        }
    }

    private renderStep(stepNum: number): core.VDom.Node {
        switch (stepNum) {
            case 1: return <Step1 />;
            case 2: return <Step2 />;
            case 3: return <Step3 />;
            case 4: return <Step4 />;
            case 5: return <Step5 />;
            default: return <Step1 />;
        }
    }

    private renderSection(section: AppState['selectedSection']): core.VDom.Node {
        switch (section) {
            case 'overview':    return <OverviewPage />;
            case 'phones':      return <PhonesPage />;
            case 'voice':       return <VoicePage />;
            case 'credentials': return <CredentialsPage />;
            case 'health':      return <HealthPage />;
            default:            return <OverviewPage />;
        }
    }

    render(): VDom.Node {
        const state = store.getState() as AppState;

        // Pre-route loader — avoids the Step 1 flash for returning admins.
        if (state.mountRouting) {
            return (
                <component.ContentPanel
                    horizontalAlignment={component.ContentPanel.HorizontalAlignment.CENTER}
                    outerGap={component.ContentPanel.GapSize.XL}
                >
                    {new component.Loader({
                        label: 'Loading…',
                        indeterminate: true
                    } as never) as never}
                </component.ContentPanel>
            ) as VDom.Node;
        }

        if (state.mode === 'console') {
            return (
                <ConsoleShell>
                    {this.renderSection(state.selectedSection)}
                </ConsoleShell>
            ) as VDom.Node;
        }

        return (
            <StepperShell>
                {this.renderStep(state.currentStep)}
            </StepperShell>
        ) as VDom.Node;
    }
}
