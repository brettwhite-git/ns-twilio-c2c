/**
 * Stepper — horizontal step progress indicator (native UIF Stepper).
 *
 * Phase D (2026-05-29) — replaces the hand-rolled Badge + Text pill row
 * with `component.Stepper` + `component.Stepper.Item`. Pattern reference:
 * Oracle UIF sample (Stepper SPA component example).
 *
 * IMPORTANT — the StepperItem's `label` prop renders INSIDE the badge
 * circle (we discovered this when "Prerequisites" rendered as "equi…"
 * cropped inside the badge). Per Oracle's sample, only the children
 * slot is populated and the badge auto-shows the index number (or a
 * check icon when type=SUCCESS). The label prop is intentionally NOT
 * passed.
 *
 * Item.type drives the visual state:
 *   - SUCCESS — completed (green check) — past steps AND step 5 when activated
 *   - PRIMARY — current step
 *   - DEFAULT — future steps
 *
 * The bar is interactive: clicking a past/current step navigates to it via
 * goToStep(). Future steps are disabled until the admin reaches them.
 */

import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import {store} from '../../app/Store';
import {goToStep} from '../../app/effects/navigation';
import type {AppState} from '../../app/InitialState';

interface StepSpec {
    label: string;
    sub: string;
}

export const STEPS: StepSpec[] = [
    {label: 'Prerequisites',   sub: 'Setup checks'},
    {label: 'Connect Twilio',  sub: 'SIDs & secrets'},
    {label: 'Voice config',    sub: 'TwiML & caller ID'},
    {label: 'Phone numbers',   sub: 'Claim & assign'},
    {label: 'Test & activate', sub: 'Review & go live'}
];

interface StepperProps {
    currentStep: number;
    /**
     * Force re-invoke on every store dispatch — UIF function components
     * memoize on prop equality, and currentStep doesn't change when
     * state.step5.activated flips, so without tick the Stepper never
     * re-reads `activated` and the Step 5 badge stays as PRIMARY
     * instead of swapping to SUCCESS (green check).
     */
    tick?: number;
}

export const Stepper = (props: StepperProps): core.VDom.Node => {
    const state = store.getState() as AppState;
    const activated = !!state.step5.activated;
    const current0 = Math.max(1, Math.min(STEPS.length, props.currentStep)) - 1;

    const itemType = (i0: number): unknown => {
        // Step 5 (index 4) flips to SUCCESS once activated, even though
        // currentStep stays at 5 — the green check is the visual cue
        // that the wizard finished its job.
        if (i0 === 4 && activated) return component.Stepper.ItemType.SUCCESS;
        if (i0 < current0)         return component.Stepper.ItemType.SUCCESS;
        if (i0 === current0)       return component.Stepper.ItemType.PRIMARY;
        return component.Stepper.ItemType.DEFAULT;
    };

    // Build the Item children flat-array first (UIF's JSX runtime rejects
    // `.map()` nested arrays as direct children of layout panels — same
    // anti-pattern documented for StackPanel/GridPanel).
    const items: core.VDom.Node[] = [];
    STEPS.forEach((spec, i0) => {
        const enabled = i0 <= current0 || (i0 === 4 && activated);
        // Combine label + sub into a single description string. The
        // native StepperItem renders only one description slot beneath
        // the badge — we keep both lines by joining with a bullet so
        // admins still see the cycle subtitle.
        const description = spec.label + ' • ' + spec.sub;
        items.push(
            <component.Stepper.Item
                index={i0}
                type={itemType(i0) as never}
                enabled={enabled}
                descriptionMaxWidth={200 as never}
            >
                {description}
            </component.Stepper.Item>
        );
    });

    // Once activated, drop the "selected" highlight so Step 5's
    // type=SUCCESS visual wins (otherwise the selected/PRIMARY style
    // for selectedStepIndex=4 overrides type and Step 5 stays as a
    // dark "5" badge instead of the green check). Matches the Oracle
    // sample's pattern of clearing selection after the terminal step.
    const selected: number | null = (activated && current0 === 4) ? null : current0;

    return (
        <component.Stepper
            selectedStepIndex={selected}
            descriptionPosition={component.Stepper.DescriptionPosition.BOTTOM}
            separatorSize={component.Stepper.SeparatorSize.STRETCH as never}
            rootStyle={{width: '100%'} as never}
            onSelectionChanged={(args: { stepIndex: number }): void => {
                // UIF fires onSelectionChanged on PROGRAMMATIC prop
                // changes too, not just user clicks. Re-read state
                // here so we don't navigate based on a stale closure.
                const liveState = store.getState() as AppState;
                // Once activated we deliberately set selectedStepIndex
                // to null so Step 5's SUCCESS type wins; UIF reports
                // that transition as stepIndex=0, which we MUST ignore
                // or it bounces the admin back to Step 1.
                if (liveState.step5.activated) return;
                const liveCurrent0 = Math.max(1,
                    Math.min(STEPS.length, liveState.currentStep)) - 1;
                if (args.stepIndex === liveCurrent0) return;
                // Click navigation — clamp forward so the admin can't
                // skip ahead but can revisit past steps.
                const target = Math.min(liveCurrent0, args.stepIndex);
                goToStep(target + 1);
            }}
        >
            {items as never}
        </component.Stepper>
    );
};

export default Stepper;
