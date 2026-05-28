/**
 * Stepper — horizontal step progress indicator.
 *
 * Phase 6 (2026-05-28) — JSX replacement for the legacy `buildStepper`
 * helper in AppController.tsx. 5 pills laid out SPACE_BETWEEN; each pill
 * is a Badge + label + sublabel column.
 *
 * Note: legacy uses primitives instead of `component.Stepper` because
 * the native Stepper component rendered silently invisible in 3 prior
 * attempts. Pattern preserved.
 */

import * as core from '@uif-js/core';
import * as component from '@uif-js/component';

interface StepSpec {
    num: number;
    label: string;
    sub: string;
}

export const STEPS: StepSpec[] = [
    { num: 1, label: 'Prerequisites',   sub: 'Setup checks' },
    { num: 2, label: 'Connect Twilio',  sub: 'SIDs & secrets' },
    { num: 3, label: 'Voice config',    sub: 'TwiML & caller ID' },
    { num: 4, label: 'Phone numbers',   sub: 'Claim & assign' },
    { num: 5, label: 'Test & activate', sub: 'Review & go live' }
];

interface StepperProps {
    currentStep: number;
}

const StepPill = (props: { spec: StepSpec; currentStep: number }): core.VDom.Node => {
    const {spec, currentStep} = props;
    const isCurrent = spec.num === currentStep;
    const isDone = spec.num < currentStep;

    return (
        <component.StackPanel
            orientation={component.StackPanel.Orientation.VERTICAL}
            alignment={component.StackPanel.Alignment.CENTER}
            itemGap={component.StackPanel.GapSize.XS}
        >
            <component.StackPanel.Item>
                <component.Badge
                    content={isDone ? '✓' : String(spec.num)}
                    type={isCurrent || isDone
                        ? component.Badge.Type.SOLID
                        : component.Badge.Type.SUBTLE}
                    size={component.Badge.Size.DEFAULT}
                />
            </component.StackPanel.Item>
            <component.StackPanel.Item>
                <component.Text
                    type={isCurrent ? component.Text.Type.STRONG : component.Text.Type.DEFAULT}
                >
                    {spec.label}
                </component.Text>
            </component.StackPanel.Item>
            <component.StackPanel.Item>
                <component.Text
                    type={component.Text.Type.WEAK}
                    size={component.Text.Size.S}
                >
                    {spec.sub}
                </component.Text>
            </component.StackPanel.Item>
        </component.StackPanel>
    );
};

export const Stepper = (props: StepperProps): core.VDom.Node => {
    return (
        <component.StackPanel
            orientation={component.StackPanel.Orientation.HORIZONTAL}
            justification={component.StackPanel.Justification.SPACE_BETWEEN}
            itemGap={component.StackPanel.GapSize.M}
        >
            {STEPS.map((spec) => (
                <component.StackPanel.Item key={'step-' + spec.num}>
                    <StepPill spec={spec} currentStep={props.currentStep} />
                </component.StackPanel.Item>
            ))}
        </component.StackPanel>
    );
};

export default Stepper;
