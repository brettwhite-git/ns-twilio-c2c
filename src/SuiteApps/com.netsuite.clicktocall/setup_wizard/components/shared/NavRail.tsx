/**
 * NavRail — left-side NavigationDrawer for the admin console.
 *
 * Phase 6 (2026-05-28) — JSX replacement for the legacy
 * `buildConsoleNavDrawer` in AppController.tsx. NavigationDrawer with
 * 5 section items + a "Re-run wizard" item separated below.
 *
 * Highlights:
 *   - In console mode, the active section item is selected
 *   - In stepper mode (post-console Re-run flow), "re-run" is selected
 *   - Dark visual style (NetSuite navy)
 *   - Phones item shows assignment count badge when assignments loaded
 */

import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import {store} from '../../app/Store';
import {goToSection, goToStep} from '../../app/effects/navigation';
import type {AppState, SectionName} from '../../app/InitialState';

interface NavItemSpec {
    value: string;
    label: string;
    icon: unknown;
    badge?: string;
    separatorTop?: boolean;
    action?: () => void;
}

export const NavRail = (): core.VDom.Node => {
    const state = store.getState() as AppState;
    const assignments = state.console.assignments;
    const assignmentBadge = assignments ? String(assignments.length) : undefined;

    const navItems: NavItemSpec[] = [
        { value: 'overview',    label: 'Overview',          icon: core.SystemIcon.HOME },
        { value: 'phones',      label: 'Phones & reps',     icon: core.SystemIcon.CALL,
          badge: assignmentBadge },
        { value: 'voice',       label: 'Voice config',      icon: core.SystemIcon.SETTINGS },
        { value: 'credentials', label: 'Credentials',       icon: core.SystemIcon.LOCK },
        { value: 'health',      label: 'Health',            icon: core.SystemIcon.HEART_FILLED },
        { value: 're-run',      label: 'Re-run wizard',     icon: core.SystemIcon.REFRESH,
          separatorTop: true,
          action: (): void => { goToStep(1); } }
    ];

    const selectedVal = state.mode === 'stepper' ? 're-run' : state.selectedSection;

    return (
        <component.NavigationDrawer
            items={navItems as never}
            selectedValue={selectedVal}
            width={240}
            visualStyle={component.NavigationDrawer.VisualStyle.DARK}
            onSelectedValueChanged={(args: { value?: string }): void => {
                const value = args && args.value;
                if (!value) return;
                if (value === 're-run') {
                    goToStep(1);
                    return;
                }
                goToSection(value as SectionName);
            }}
        />
    );
};

export default NavRail;
