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
import {goToSection, goToStep, isConfigActive} from '../../app/effects/navigation';
import type {AppState, SectionName} from '../../app/InitialState';

export const NavRail = (): core.VDom.Node => {
    const state = store.getState() as AppState;
    const assignments = state.console.assignments;
    const assignmentBadge = assignments ? String(assignments.length) : undefined;

    // Stepper only after a reset: "Re-run wizard" shows only while the
    // config is not active (after Deactivate). The rail re-renders on
    // every store change, so Deactivate / Reactivate / Step 5 activation
    // update it at once (they refresh console.snapshot).
    const canRerun = !isConfigActive(state);

    const navItems: Array<Record<string, unknown>> = [
        { value: 'overview',    label: 'Overview',          icon: core.SystemIcon.CARD_VIEW },
        { value: 'phones',      label: 'Phones & reps',     icon: core.SystemIcon.CALL,
          badge: assignmentBadge },
        { value: 'inbound',     label: 'Inbound calls',     icon: core.SystemIcon.CALL },
        { value: 'voice',       label: 'Voice config',      icon: core.SystemIcon.SETTINGS },
        { value: 'credentials', label: 'Credentials',       icon: core.SystemIcon.LOCK }
    ];
    if (canRerun) {
        navItems.push(
            { value: 're-run',      label: 'Re-run wizard',     icon: core.SystemIcon.REFRESH,
              separatorTop: true,
              action: (): void => { goToStep(1); } }
        );
    }

    // In the stepper after a Step 5 activation the re-run item is gone;
    // fall back to the section so the drawer never selects a missing item.
    const selectedVal = state.mode === 'stepper' && canRerun ? 're-run' : state.selectedSection;

    const drawer = new component.NavigationDrawer({
        items: navItems,
        selectedValue: selectedVal,
        width: 240,
        visualStyle: component.NavigationDrawer.VisualStyle.DARK,
        onSelectedValueChanged: (args: { value?: string }): void => {
            const value = args && args.value;
            if (!value) return;
            if (value === 're-run') {
                // goToStep is a no-op while the config is active.
                goToStep(1);
                return;
            }
            goToSection(value as SectionName);
        }
    } as never);

    return drawer as never;
};

export default NavRail;
