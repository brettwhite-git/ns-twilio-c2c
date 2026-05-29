/**
 * Stepper — horizontal step progress indicator.
 *
 * Phase 7 fix (2026-05-28) — switched Badge construction from JSX form
 * to imperative `new Badge({...})` returned via `{instance}` JSX child
 * expression. The JSX `<component.Badge content={...} />` form apparently
 * doesn't pass `content` through correctly (badges render as content-less
 * dots); the imperative form matches the legacy AppController.buildStepper
 * pattern exactly. Pattern proven via Phase 6 spike findings.
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

    // Imperative Badge construction — JSX form doesn't render `content`.
    const badge = new component.Badge({
        content: isDone ? '✓' : String(spec.num),
        type: isCurrent || isDone
            ? component.Badge.Type.SOLID
            : component.Badge.Type.SUBTLE,
        size: component.Badge.Size.DEFAULT
    });

    return (
        <component.StackPanel
            orientation={component.StackPanel.Orientation.VERTICAL}
            alignment={component.StackPanel.Alignment.CENTER}
            itemGap={component.StackPanel.GapSize.XS}
        >
            <component.StackPanel.Item>
                {badge as never}
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
    const pills: core.VDom.Node[] = [];
    for (const spec of STEPS) {
        pills.push(
            <component.StackPanel.Item key={'step-' + spec.num}>
                <StepPill spec={spec} currentStep={props.currentStep} />
            </component.StackPanel.Item>
        );
    }

    return (
        <component.StackPanel
            orientation={component.StackPanel.Orientation.HORIZONTAL}
            justification={component.StackPanel.Justification.SPACE_BETWEEN}
            itemGap={component.StackPanel.GapSize.M}
        >
            {pills as never}
        </component.StackPanel>
    );
};

export default Stepper;
