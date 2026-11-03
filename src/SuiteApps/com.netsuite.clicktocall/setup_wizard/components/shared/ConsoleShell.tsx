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
 *
 * 2026-11-03 console rebuild: the shared "Click-to-Call Admin Console"
 * heading is gone (each page has its own header, as in the canvas); the
 * content panel carries the console style scope (consoleStyles.ts).
 */

import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import {store} from '../../app/Store';
import {NavRail} from './NavRail';
import {RailContentShell} from './RailContentShell';
import {PausedBanner} from './PausedBanner';
import type {AppState} from '../../app/InitialState';
import {CONSOLE_CLASS, ensureConsoleStyles} from './consoleStyles';

interface ConsoleShellProps {
    children?: core.VDom.Node | core.VDom.Node[];
    tick?: number;
}

export const ConsoleShell = (props: ConsoleShellProps): core.VDom.Node => {
    ensureConsoleStyles();
    const state = store.getState() as AppState;
    const snap = state.console.snapshot as { active?: boolean } | null | undefined;
    const isPaused = snap?.active === false;

    // Each page renders its own header (title = focus target after
    // navigation, see ui.pageHeader). The paused banner sits above it on
    // every page.
    const contentItems = [
        isPaused && (
            <component.StackPanel.Item>
                <PausedBanner tick={props.tick} />
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
                <NavRail tick={props.tick} />
            </component.GridPanel.Item>
            <component.GridPanel.Item>
                <RailContentShell classList={[CONSOLE_CLASS]}>
                    <component.StackPanel
                        orientation={component.StackPanel.Orientation.VERTICAL}
                        itemGap={component.StackPanel.GapSize.SPACING4X}
                    >
                        {contentItems as never}
                    </component.StackPanel>
                </RailContentShell>
            </component.GridPanel.Item>
        </component.GridPanel>
    );
};

export default ConsoleShell;
