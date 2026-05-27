// @ts-check
/**
 * Overview section — U2 (Phase 3a).
 *
 * Admin-console landing page. Three blocks stacked vertically:
 *   1. Stat-card grid — 4 KPI cards (status, phones, reps, preflight)
 *   2. Quick actions  — row of 5 deep-link buttons into other sections
 *   3. Activity feed  — stub until U8 (wizardActivity), then last 50
 *                       audit-level events
 *
 * Path B.3h (2026-05-27) — extracted from SpaClient.ts. Uses the deps
 * injection pattern (see sections/health.ts B.3g for the precedent):
 * the quick-action buttons need SpaClient's goToSection handler, so
 * OverviewSectionDeps carries that callback explicitly.
 */

import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import { safeNew } from '../render/primitives';
import { STATE } from '../state';
import { buildStatCard } from '../render/shell';
import type { EnumsBag, StatCardTone } from '../render/shell';
import type { SectionName } from '../dispatch';

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

/** Event-handler deps this section needs from SpaClient. */
export interface OverviewSectionDeps {
    /**
     * Navigate to an admin-console section. Mutates SELECTED_SECTION
     * via dispatch + triggers rerender. Used by every Quick action.
     */
    goToSection: (section: SectionName) => void;
}

interface ConsoleSnapshot {
    active?: boolean;
    phoneNumber?: string;
}

interface AssignmentRow {
    phoneSid?: string;
}

interface CheckRow {
    status?: string;
}

interface ActivityRow {
    timestamp?: string;
    title?: string;
    user?: string;
}

// ─────────────────────────────────────────────────────────────────────
// buildOverviewSection — section root
// ─────────────────────────────────────────────────────────────────────

/**
 * U2: Overview section — landing page when admin enters console.
 * 4 stat cards + quick-actions row + recent-activity feed (mocked
 * until U8 / Phase 3c). Same data sources as the original U11
 * summary card, just shaped as a dashboard.
 */
export const buildOverviewSection = (d: EnumsBag, deps: OverviewSectionDeps): unknown => {
    const items: unknown[] = [];

    const heading = safeNew(d.H, {
        content: 'Overview',
        type: d.H_Type.MEDIUM_HEADING
    }, 'Heading(overview)');
    if (heading) items.push(heading);

    const stats = buildOverviewStatCards(d);
    if (stats) items.push(stats);

    const quick = buildOverviewQuickActions(d, deps);
    if (quick) items.push(quick);

    const activity = buildOverviewActivityFeed(d);
    if (activity) items.push(activity);

    if (items.length === 0) return safeNew(d.T, { text: 'Overview' }, 'Text(overview-empty)');
    return safeNew(d.SP, {
        items: items,
        orientation: d.SP_Orient.VERTICAL,
        itemGap: d.SP_Gap.L
    }, 'StackPanel(overview)');
};

// ─────────────────────────────────────────────────────────────────────
// Stat cards (4-column grid)
// ─────────────────────────────────────────────────────────────────────

const buildOverviewStatCards = (d: EnumsBag): unknown => {
    const snap = (STATE.console.snapshot || {}) as ConsoleSnapshot;
    const assignments = (STATE.console.assignments || []) as AssignmentRow[];
    const preflight = (STATE.console.preflight || []) as CheckRow[];

    const phoneCount: Record<string, boolean> = {};
    assignments.forEach((a) => {
        if (a.phoneSid) phoneCount[a.phoneSid] = true;
    });
    const phonesConfigured = Object.keys(phoneCount).length || (snap.phoneNumber ? 1 : 0);
    const repCount = assignments.length;
    const preflightPassed = preflight.filter((c) => c.status === 'pass').length;
    const preflightTotal = preflight.length;
    // Path C-2: Status card gets a semantic SystemIcon + color so admins
    // can scan Active/Paused state at a glance. The other 3 cards stay
    // text-only because their metric values are numeric and don't have
    // a binary good/bad semantic.
    const statusLabel = snap.active === false ? 'Paused' :
                        snap.active === true ? 'Active' : 'Unknown';
    const statusIcon = snap.active === true  ? core.SystemIcon.STATUS_SUCCESS_FILLED :
                       snap.active === false ? core.SystemIcon.STATUS_WARNING_FILLED :
                                                core.SystemIcon.STATUS_INFO_FILLED;
    const statusTone: StatCardTone = snap.active === true  ? 'success' :
                                     snap.active === false ? 'warning' :
                                                              'info';

    const cards = [
        buildStatCard(d, {
            title: 'Status',
            metric: statusLabel,
            description: snap.active === false ? 'Reps cannot place calls'
                                               : 'Reps can place calls',
            icon: statusIcon,
            tone: statusTone
        }),
        buildStatCard(d, {
            title: 'Phone numbers',
            metric: String(phonesConfigured),
            description: phonesConfigured === 0 ? 'No numbers configured'
                : snap.phoneNumber || ''
        }),
        buildStatCard(d, {
            title: 'Assigned reps',
            metric: String(repCount),
            description: repCount === 0 ? 'No assignments'
                : (repCount === 1 ? '1 rep' : repCount + ' reps')
        }),
        buildStatCard(d, {
            title: 'Preflight',
            metric: preflightTotal > 0
                ? preflightPassed + ' of ' + preflightTotal
                : '—',
            description: preflightTotal > 0 ? 'See Health for detail'
                                            : 'Not yet run'
        })
    ].filter((c) => c != null);

    if (cards.length === 0) return null;

    if (d.GP) {
        // CSS-grid track string — 4 equal flex columns. Equivalent to
        // 'repeat(4, 1fr)' but the literal version is more portable
        // across UIF versions per the catalog GridPanel docs.
        return safeNew(d.GP, {
            columns: '1fr 1fr 1fr 1fr',
            rows: 'auto',
            items: cards,
            columnGap: (d.GP_Gap && d.GP_Gap.M) || undefined
        }, 'GridPanel(overview-stats)');
    }
    return safeNew(d.SP, {
        items: cards,
        orientation: d.SP_Orient.HORIZONTAL,
        itemGap: d.SP_Gap.M
    }, 'StackPanel(overview-stats-fallback)');
};

// ─────────────────────────────────────────────────────────────────────
// Quick actions strip — 5 deep-link buttons
// ─────────────────────────────────────────────────────────────────────

const buildOverviewQuickActions = (d: EnumsBag, deps: OverviewSectionDeps): unknown => {
    const ButtonType = component.Button.Type as Record<string, unknown>;

    const heading = safeNew(d.H, {
        content: 'Quick actions',
        type: d.H_Type.SMALL_HEADING
    }, 'Heading(quick-actions)');

    const actions: { label: string; onClick: () => void }[] = [
        { label: 'Add a phone number',      onClick: () => deps.goToSection('phones') },
        { label: 'Reassign reps',           onClick: () => deps.goToSection('phones') },
        { label: 'Update voice config',     onClick: () => deps.goToSection('voice') },
        { label: 'Rotate API Key Secret',   onClick: () => deps.goToSection('credentials') },
        { label: 'Run health check',        onClick: () => deps.goToSection('health') }
    ];

    const buttons = actions.map((a) => {
        // PURE-type buttons read as text-only links — appropriate for
        // a row of 5 affordances where DEFAULT (filled outline) would
        // dominate the page. Per d.ts Button.Type enum.
        return safeNew(component.Button, {
            label: a.label,
            type: ButtonType.PURE || ButtonType.DEFAULT,
            action: a.onClick
        }, 'Button(qa-' + a.label + ')');
    }).filter((b) => b != null);

    if (buttons.length === 0) return heading;

    const row = safeNew(d.SP, {
        items: buttons,
        orientation: d.SP_Orient.HORIZONTAL,
        itemGap: d.SP_Gap.S
    }, 'StackPanel(quick-actions-row)');

    return safeNew(d.SP, {
        items: [heading, row].filter((c) => c != null),
        orientation: d.SP_Orient.VERTICAL,
        itemGap: d.SP_Gap.XS
    }, 'StackPanel(quick-actions-block)');
};

// ─────────────────────────────────────────────────────────────────────
// Activity feed (stub until U8 / Phase 3c)
// ─────────────────────────────────────────────────────────────────────

const buildOverviewActivityFeed = (d: EnumsBag): unknown => {
    const heading = safeNew(d.H, {
        content: 'Recent activity',
        type: d.H_Type.SMALL_HEADING
    }, 'Heading(activity-feed)');

    // U8 (Phase 3c) wires this to wizardActivity. Until then, show
    // a stub note so admins know the feed is intentional, not missing.
    const activity = STATE.console.activity as ActivityRow[] | null;
    const rows: unknown[] = [];

    if (!activity) {
        const stub = safeNew(d.T, {
            text: 'Activity feed arrives in Phase 3c (U8 — wizardActivity). ' +
                  'When live, it shows the last 50 audit-level wizard events.',
            type: d.T_Type.WEAK
        }, 'Text(activity-stub)');
        if (stub) rows.push(stub);
    } else if (activity.length === 0) {
        const empty = safeNew(d.T, {
            text: 'No recent activity.',
            type: d.T_Type.WEAK
        }, 'Text(activity-empty)');
        if (empty) rows.push(empty);
    } else {
        activity.slice(0, 5).forEach((row) => {
            const line = safeNew(d.T, {
                text: (row.timestamp || '') + ' — ' + (row.title || '') +
                      (row.user ? ' (' + row.user + ')' : ''),
                size: d.T && d.T.Size ? d.T.Size.S : undefined
            }, 'Text(activity-row)');
            if (line) rows.push(line);
        });
    }

    return safeNew(d.SP, {
        items: [heading as unknown].concat(rows).filter((c) => c != null),
        orientation: d.SP_Orient.VERTICAL,
        itemGap: d.SP_Gap.XS
    }, 'StackPanel(activity-feed)');
};
