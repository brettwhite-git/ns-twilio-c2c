/**
 * StepperShell — ApplicationHeader + Stepper strip + page wrapper for
 * the wizard's stepper mode.
 *
 * Phase 6 (2026-05-28) — wraps a Step component (Step1/Step2/.../Step5)
 * with the chrome: ApplicationHeader title + step subtitle, full-width
 * Stepper progress strip, RailContentShell with the step content below.
 *
 * If the admin has previously activated and chosen "Re-run wizard" from
 * the console (state.railVisible === true), the NavRail also shows on
 * the left so the admin can navigate back to the console at any time.
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
}

export const StepperShell = (props: StepperShellProps): core.VDom.Node => {
    const state = store.getState() as AppState;
    const step = state.currentStep;
    const stepLabel = STEPS[step - 1]?.label || '';
    const subtitle = 'Step ' + step + ' of ' + STEPS.length + ' — ' + stepLabel;

    const contentColumn = (
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
                <component.ContentPanel
                    horizontalAlignment={component.ContentPanel.HorizontalAlignment.STRETCH}
                    outerGap={component.ContentPanel.GapSize.M}
                >
                    <Stepper currentStep={step} />
                </component.ContentPanel>
            </component.StackPanel.Item>
            <component.StackPanel.Item>
                <RailContentShell>{props.children}</RailContentShell>
            </component.StackPanel.Item>
        </component.StackPanel>
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
                <component.GridPanel.Item>{contentColumn}</component.GridPanel.Item>
            </component.GridPanel>
        );
    }

    return contentColumn;
};

export default StepperShell;
