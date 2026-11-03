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
 *
 * Selection sync (2026-11-03): every page change (rail, Overview quick
 * action, hash / back-forward) must move the drawer's selection. The rail
 * takes a `tick` prop so it re-renders on every store change (a prop-less
 * function component may be skipped), and navigation.ts calls the
 * registered rail sync after each page change, which re-selects the right
 * item on every drawer still in the page. Each item also has an `action`,
 * so clicking the item that is already selected still navigates (the
 * drawer fires no selection change for it).
 */

import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import {store} from '../../app/Store';
import {goToSection, goToStep, isConfigActive, registerRailSync} from '../../app/effects/navigation';
import type {AppState, SectionName} from '../../app/InitialState';

interface DrawerLike {
    selectedValue: unknown;
    rootElement: HTMLElement | null;
    setSelectedValue(value: unknown, options: { reason?: string | symbol }): void;
}

/** Drawers created and not yet known to be gone from the page. */
let drawers: DrawerLike[] = [];

/** The rail value for the page shown now. */
const railValueFor = (state: AppState): string =>
    state.mode === 'stepper' && !isConfigActive(state) ? 're-run' : state.selectedSection;

/** Re-select the right item on every drawer still in the page. */
const syncRailSelection = (): void => {
    const value = railValueFor(store.getState() as AppState);
    drawers.forEach((d) => {
        if (d.rootElement && d.rootElement.isConnected && d.selectedValue !== value) {
            d.setSelectedValue(value, { reason: 'ctc-sync' });
        }
    });
};
registerRailSync(syncRailSelection);

/** Rail click → navigate (also for the item that is already selected). */
const navigate = (value: string): void => {
    if (value === 're-run') {
        // goToStep is a no-op while the config is active.
        goToStep(1);
        return;
    }
    goToSection(value as SectionName);
};

interface NavRailProps {
    /** Changes on every store dispatch so the rail re-renders. */
    tick?: number;
}

export const NavRail = (_props: NavRailProps): core.VDom.Node => {
    const state = store.getState() as AppState;
    const assignments = state.console.assignments;
    const assignmentBadge = assignments ? String(assignments.length) : undefined;

    // Stepper only after a reset: "Re-run wizard" shows only while the
    // config is not active (after Deactivate). The rail re-renders on
    // every store change, so Deactivate / Reactivate / Step 5 activation
    // update it at once (they refresh console.snapshot).
    const canRerun = !isConfigActive(state);

    const item = (value: string, label: string, icon: unknown, extra: Record<string, unknown> = {}):
        Record<string, unknown> => ({
            value, label, icon, action: (): void => { navigate(value); }, ...extra
        });

    const navItems: Array<Record<string, unknown>> = [
        item('overview',    'Overview',      core.SystemIcon.CARD_VIEW),
        item('phones',      'Phones & reps', core.SystemIcon.GROUPS, { badge: assignmentBadge }),
        item('inbound',     'Inbound calls', core.SystemIcon.CALL),
        item('voice',       'Voice config',  core.SystemIcon.SETTINGS),
        item('credentials', 'Credentials',   core.SystemIcon.LOCK)
    ];
    if (canRerun) {
        navItems.push(item('re-run', 'Re-run wizard', core.SystemIcon.REFRESH, { separatorTop: true }));
    }

    // In the stepper after a Step 5 activation the re-run item is gone;
    // railValueFor falls back to the section so the drawer never selects
    // a missing item.
    const selectedVal = railValueFor(state);

    const drawer = new component.NavigationDrawer({
        items: navItems,
        selectedValue: selectedVal,
        width: 240,
        visualStyle: component.NavigationDrawer.VisualStyle.DARK,
        onSelectedValueChanged: (args: { value?: string }): void => {
            const value = args && args.value;
            if (!value) return;
            // Programmatic re-selection (sync) and the item's own action
            // both land here: navigate only when the page differs.
            if (value === railValueFor(store.getState() as AppState)) return;
            navigate(value);
        }
    } as never);

    // Keep drawers that are in the page, plus the last few created (not
    // rendered yet); drop the rest so the list cannot grow.
    drawers.push(drawer as unknown as DrawerLike);
    const recent = drawers.slice(-3);
    drawers = drawers.filter((d) =>
        recent.indexOf(d) >= 0 || (!!d.rootElement && d.rootElement.isConnected));
    return drawer as never;
};

export default NavRail;
