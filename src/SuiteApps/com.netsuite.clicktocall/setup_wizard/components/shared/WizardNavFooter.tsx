/**
 * WizardNavFooter — Back + Continue button row at the bottom of every
 * wizard step.
 *
 * Step 1: no Back, Continue → goToStep(2) (no server save).
 * Step 2: Back → goToStep(1), Continue → saveStep2 → goToStep(3).
 * Step 3: Back → goToStep(2), Continue → saveStep3 → goToStep(4).
 * Step 4: Back → goToStep(3), Continue → saveStep4 → goToStep(5).
 * Step 5: Back is inlined into Step5.tsx's action row alongside
 *         "Re-run preflight" so it doesn't double-render via this footer.
 *
 * Continue is gated by isStepValid(currentStep); failures surface via
 * Action.actionErrorSet on save error.
 *
 * Implemented as a PureComponent class with a `tick` prop so it
 * participates in App.forceRerender's tick-driven reactivity. The function
 * component variant didn't reliably re-evaluate `enabled` after dispatch.
 */

import {PureComponent} from '@uif-js/core';
import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import {store} from '../../app/Store';
import {Action} from '../../app/Action';
import {goToStep} from '../../app/effects/navigation';
import {saveStep2, saveStep3, saveStep4, SaveResult} from '../../app/effects/steps';
import {isStepValid} from '../../app/Validation';
import type {AppState} from '../../app/InitialState';

const TOTAL_STEPS = 5;

const advance = async (
    currentStep: number,
    saver: () => Promise<SaveResult>
): Promise<void> => {
    store.dispatch(Action.actionErrorSet(null));
    const result = await saver();
    if (result.ok) {
        goToStep(currentStep + 1);
    } else {
        store.dispatch(Action.actionErrorSet(
            'Save failed (Step ' + currentStep + '): ' + (result.error || 'unknown')
        ));
    }
};

const onContinue = (currentStep: number): void => {
    if (currentStep === 1) {
        goToStep(2);
        return;
    }
    if (currentStep === 2) { advance(2, saveStep2); return; }
    if (currentStep === 3) { advance(3, saveStep3); return; }
    if (currentStep === 4) { advance(4, saveStep4); return; }
};

interface WizardNavFooterProps {
    tick?: number;
}

export class WizardNavFooter extends PureComponent<WizardNavFooterProps, unknown> {
    render(): core.VDom.Node | null {
        const state = store.getState() as AppState;
        const currentStep = state.currentStep;

        // Step 5's Back is inlined into Step5.tsx; nothing to render here.
        if (currentStep >= TOTAL_STEPS) return null;

        const showBack = currentStep > 1;
        const showContinue = currentStep < TOTAL_STEPS;
        if (!showBack && !showContinue) return null;

        const continueEnabled = isStepValid(currentStep, state);
        const errorMsg = state.console.actionError;

        const items: core.VDom.Node[] = [];

        if (showBack) {
            items.push(
                <component.StackPanel.Item>
                    <component.Button
                        label="Back"
                        type={component.Button.Type.DEFAULT}
                        action={(): void => { goToStep(currentStep - 1); }}
                    />
                </component.StackPanel.Item>
            );
        }

        if (showContinue) {
            items.push(
                <component.StackPanel.Item>
                    <component.Button
                        label="Continue"
                        type={component.Button.Type.PRIMARY}
                        enabled={continueEnabled}
                        action={(): void => { onContinue(currentStep); }}
                    />
                </component.StackPanel.Item>
            );
        }

        const row = (
            <component.StackPanel
                orientation={component.StackPanel.Orientation.HORIZONTAL}
                itemGap={component.StackPanel.GapSize.M}
            >
                {items as never}
            </component.StackPanel>
        );

        if (!errorMsg) return row;

        return (
            <component.StackPanel
                orientation={component.StackPanel.Orientation.VERTICAL}
                itemGap={component.StackPanel.GapSize.S}
            >
                <component.StackPanel.Item>
                    <component.Text type={component.Text.Type.STRONG}>
                        {'✕ ' + errorMsg}
                    </component.Text>
                </component.StackPanel.Item>
                <component.StackPanel.Item>
                    {row}
                </component.StackPanel.Item>
            </component.StackPanel>
        );
    }
}

export default WizardNavFooter;
