/**
 * ConsoleShell — rail + ApplicationHeader + page wrapper for the
 * admin console mode.
 *
 * Phase 6 (2026-05-28) — wraps a Page component (OverviewPage / PhonesPage
 * / etc.) with the chrome: NavigationDrawer on the left, ApplicationHeader
 * + (optional) PausedBanner + RailContentShell with the page content on
 * the right.
 *
 * Root layout is a CSS-grid GridPanel `columns: 'auto 1fr'` so the rail
 * auto-sizes to its rendered width and the content fills the remaining
 * width. This requires the SPA's outer container to have an explicit
 * height (set via `scriptContext.setLayout('application')` in SpaClient).
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
}

export const ConsoleShell = (props: ConsoleShellProps): core.VDom.Node => {
    const state = store.getState() as AppState;
    const snap = state.console.snapshot as { active?: boolean } | null | undefined;
    const isPaused = snap?.active === false;
    const subtitle = subtitleFor(state.selectedSection);

    const contentColumn = (
        <component.StackPanel
            orientation={component.StackPanel.Orientation.VERTICAL}
            itemGap={component.StackPanel.GapSize.L}
        >
            <component.StackPanel.Item>
                <component.ApplicationHeader
                    title="Click-to-Call Admin Console"
                    subtitle={subtitle}
                />
            </component.StackPanel.Item>
            {isPaused ? (
                <component.StackPanel.Item>
                    <PausedBanner />
                </component.StackPanel.Item>
            ) : null}
            <component.StackPanel.Item>
                <RailContentShell>{props.children}</RailContentShell>
            </component.StackPanel.Item>
        </component.StackPanel>
    );

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
};

export default ConsoleShell;
