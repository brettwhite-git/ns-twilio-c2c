/**
 * StepperShell — ApplicationHeader + Stepper strip + page wrapper for
 * the wizard's stepper mode.
 *
 * Phase 7 fix (2026-05-28) — moved ApplicationHeader + Stepper INSIDE
 * the RailContentShell wrapper so they share the same XXL outer padding
 * as the step content. Mirrors the ConsoleShell fix and the legacy
 * AppController.buildRailContentPane structure.
 */

import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import {store} from '../../app/Store';
import {NavRail} from './NavRail';
import {Stepper, STEPS} from './Stepper';
import {RailContentShell} from './RailContentShell';
import type {AppState} from '../../app/InitialState';

interface StepperShellProps {
    children?: core.VDom.Node | core.VDom.Node[];
    tick?: number;
}

export const StepperShell = (props: StepperShellProps): core.VDom.Node => {
    const state = store.getState() as AppState;
    const step = state.currentStep;
    const stepLabel = STEPS[step - 1]?.label || '';
    const subtitle = 'Step ' + step + ' of ' + STEPS.length + ' — ' + stepLabel;

    const innerStack = (
        <component.StackPanel
            orientation={component.StackPanel.Orientation.VERTICAL}
            itemGap={component.StackPanel.GapSize.L}
        >
            <component.StackPanel.Item>
                <component.ApplicationHeader
                    title="Click-to-Call Setup Wizard"
                    subtitle={subtitle}
                />
            </component.StackPanel.Item>
            <component.StackPanel.Item>
                <Stepper currentStep={step} />
            </component.StackPanel.Item>
            <component.StackPanel.Item>
                {props.children as never}
            </component.StackPanel.Item>
        </component.StackPanel>
    );

    const paddedContent = (
        <RailContentShell>
            {innerStack}
        </RailContentShell>
    );

    // If railVisible (post-activation Re-run flow), include the NavRail.
    if (state.railVisible) {
        return (
            <component.GridPanel
                columns="auto 1fr"
                rows="100%"
                columnGap={component.GridPanel.GapSize.NONE}
            >
                <component.GridPanel.Item>
                    <NavRail />
                </component.GridPanel.Item>
                <component.GridPanel.Item>{paddedContent}</component.GridPanel.Item>
            </component.GridPanel>
        );
    }

    return paddedContent;
};

export default StepperShell;
