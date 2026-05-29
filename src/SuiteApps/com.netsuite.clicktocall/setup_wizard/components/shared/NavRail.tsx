/**
 * NavRail — left-side NavigationDrawer for the admin console.
 *
 * Phase 7 fix (2026-05-28) — switched from `<NavigationDrawer items={...}>`
 * JSX prop form to imperative `new NavigationDrawer({items: [...]})` plus
 * the spike-validated `{instance}` child-expression escape pattern.
 *
 * Reason: NavigationDrawer's ItemOptions catalog interface omits `label`
 * (the catalog only lists it on NavigationDrawerItem.Options), but the
 * runtime accepts label on the plain options array. The JSX prop form
 * apparently re-validates the items shape and rejects/strips `label`,
 * leaving the drawer chrome visible but no items rendered. The imperative
 * constructor bypasses that and matches the legacy AppController code
 * exactly.
 */

import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import {store} from '../../app/Store';
import {goToSection, goToStep} from '../../app/effects/navigation';
import type {AppState, SectionName} from '../../app/InitialState';

export const NavRail = (): core.VDom.Node => {
    const state = store.getState() as AppState;
    const assignments = state.console.assignments;
    const assignmentBadge = assignments ? String(assignments.length) : undefined;

    const navItems = [
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

    const drawer = new component.NavigationDrawer({
        items: navItems,
        selectedValue: selectedVal,
        width: 240,
        visualStyle: component.NavigationDrawer.VisualStyle.DARK,
        onSelectedValueChanged: (args: { value?: string }): void => {
            const value = args && args.value;
            if (!value) return;
            if (value === 're-run') {
                goToStep(1);
                return;
            }
            goToSection(value as SectionName);
        }
    } as never);

    return drawer as never;
};

export default NavRail;
