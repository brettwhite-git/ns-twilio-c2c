/**
 * Step 1 — Prerequisites check (JSX).
 *
 * Phase 6 (2026-05-28) — fills the gap left by Phase 3 (which only
 * covered Step2-Step5). Prereqs were rendered inline in AppController's
 * loadPrereqs callback in the legacy world; this PureComponent fires
 * the loadPrereqs effect on mount and renders the PrereqsList primitive.
 */

import {PureComponent} from '@uif-js/core';
import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import {store} from '../../app/Store';
import {loadPrereqs} from '../../app/effects/prereqs';
import {PrereqsList} from '../shared/PrereqsList';
import {ErrorText} from '../shared/ErrorText';
import type {AppState} from '../../app/InitialState';
import type {CheckRowData} from '../shared/CheckRow';
import type {PageTickProps} from '../../App';

export default class Step1 extends PureComponent<PageTickProps, unknown> {
    componentDidMount(): void {
        loadPrereqs();
    }

    render(): core.VDom.Node {
        const state = store.getState() as AppState;
        const p = state.prereqs;

        const heading = (
            <component.StackPanel.Item>
                <component.Heading level={2}>Prerequisites</component.Heading>
            </component.StackPanel.Item>
        );
        const intro = (
            <component.StackPanel.Item>
                <component.Text>
                    The wizard verifies that NetSuite features required by
                    Click-to-Call are enabled. Fix any failures before
                    continuing.
                </component.Text>
            </component.StackPanel.Item>
        );

        if (p.loading) {
            return (
                <component.StackPanel
                    orientation={component.StackPanel.Orientation.VERTICAL}
                    itemGap={component.StackPanel.GapSize.M}
                >
                    {heading}
                    {intro}
                    <component.StackPanel.Item>
                        {new component.Loader({
                            label: 'Running prerequisite checks…',
                            indeterminate: true
                        } as never) as never}
                    </component.StackPanel.Item>
                </component.StackPanel>
            );
        }

        if (p.error) {
            return (
                <component.StackPanel
                    orientation={component.StackPanel.Orientation.VERTICAL}
                    itemGap={component.StackPanel.GapSize.M}
                >
                    {heading}
                    {intro}
                    <component.StackPanel.Item>
                        <ErrorText message={p.error} />
                    </component.StackPanel.Item>
                </component.StackPanel>
            );
        }

        const checks = (p.checks as CheckRowData[] | null) || [];

        return (
            <component.StackPanel
                orientation={component.StackPanel.Orientation.VERTICAL}
                itemGap={component.StackPanel.GapSize.M}
            >
                {heading}
                {intro}
                <component.StackPanel.Item>
                    <PrereqsList checks={checks} />
                </component.StackPanel.Item>
            </component.StackPanel>
        );
    }
}
