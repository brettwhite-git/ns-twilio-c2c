/**
 * ConsoleShell — rail + ApplicationHeader + page wrapper for the
 * admin console mode.
 *
 * Phase 7 fix (2026-05-28) — moved ApplicationHeader + PausedBanner
 * INSIDE the RailContentShell wrapper so they share the same XXL outer
 * padding as the page content. Previously the header sat flush at the
 * left edge while the content was indented 48px — visual misalignment.
 *
 * Matches the legacy AppController.buildRailContentPane structure where
 * `wrapContent(d, stack)` wrapped the ENTIRE content stack (title +
 * banner + body) in one padded ContentPanel.
 */

import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import {store} from '../../app/Store';
import {NavRail} from './NavRail';
import {RailContentShell} from './RailContentShell';
import {PausedBanner} from './PausedBanner';
import type {AppState, SectionName} from '../../app/InitialState';

const subtitleFor = (section: SectionName): string => {
    switch (section) {
        case 'overview':    return 'Overview';
        case 'phones':      return 'Phones & reps';
        case 'voice':       return 'Voice config';
        case 'credentials': return 'Credentials';
        case 'health':      return 'Health';
    }
};

interface ConsoleShellProps {
    children?: core.VDom.Node | core.VDom.Node[];
    tick?: number;
}

export const ConsoleShell = (props: ConsoleShellProps): core.VDom.Node => {
    const state = store.getState() as AppState;
    const snap = state.console.snapshot as { active?: boolean } | null | undefined;
    const isPaused = snap?.active === false;
    const subtitle = subtitleFor(state.selectedSection);

    // Page header — H2 title + small WEAK subtitle, matching the
    // Quick actions / Recent activity / preflight section headers so
    // the page hierarchy reads consistently top-to-bottom.
    const contentItems = [
        (
            <component.StackPanel.Item>
                <component.StackPanel
                    orientation={component.StackPanel.Orientation.VERTICAL}
                    itemGap={component.StackPanel.GapSize.XXS}
                >
                    <component.StackPanel.Item>
                        <component.Heading level={2}>
                            Click-to-Call Admin Console
                        </component.Heading>
                    </component.StackPanel.Item>
                    <component.StackPanel.Item>
                        <component.Text
                            type={component.Text.Type.WEAK}
                            size={component.Text.Size.S}
                        >
                            {subtitle}
                        </component.Text>
                    </component.StackPanel.Item>
                </component.StackPanel>
            </component.StackPanel.Item>
        ),
        isPaused && (
            <component.StackPanel.Item>
                <PausedBanner />
            </component.StackPanel.Item>
        ),
        (
            <component.StackPanel.Item>
                {props.children as never}
            </component.StackPanel.Item>
        )
    ].filter(Boolean);

    return (
        <component.GridPanel
            columns="auto 1fr"
            rows="100%"
            columnGap={component.GridPanel.GapSize.NONE}
        >
            <component.GridPanel.Item>
                <NavRail />
            </component.GridPanel.Item>
            <component.GridPanel.Item>
                <RailContentShell>
                    <component.StackPanel
                        orientation={component.StackPanel.Orientation.VERTICAL}
                        itemGap={component.StackPanel.GapSize.L}
                    >
                        {contentItems as never}
                    </component.StackPanel>
                </RailContentShell>
            </component.GridPanel.Item>
        </component.GridPanel>
    );
};

export default ConsoleShell;
