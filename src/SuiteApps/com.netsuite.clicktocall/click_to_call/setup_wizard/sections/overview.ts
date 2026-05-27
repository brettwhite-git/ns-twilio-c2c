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

/**
 * Path C-3 (revised): a Phone Call row from wizardListRecentCalls.
 * Mirrors the server payload shape from ctc_sl_wizard_api.js.
 */
interface RecentCallRow {
    id: string | number;
    date: string;         // e.g. "5/27/2026 10:42 am"
    title: string;
    repName: string;
    companyName: string;
    contactName: string;
    duration: number;     // seconds
    brief: string;        // AI summary snippet
    status: string;       // custevent_ctc_call_status value
    satisfaction: number | null;
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

/**
 * Path C-3 (revised): Recent calls dashboard widget. Replaces the
 * earlier wizard-activity-feed stub. Pulls real Phone Call records
 * from wizardListRecentCalls (server-side filter by
 * `custevent_ctc_call_sid is-not-empty` → only CTC-logged calls,
 * ORDER BY startdate DESC LIMIT 10).
 *
 * Rendered as a UIF DataGrid for scannability — admins see the last
 * 10 calls with rep / contact / duration / AI status at a glance,
 * with a row-click affordance opening the full Phone Call record in
 * a new tab.
 *
 * Three branches by data state:
 *   - null      → loading (handled by the parent settled-counter; we
 *                 see this briefly during loadConsole)
 *   - []        → empty (no CTC calls yet — fresh install)
 *   - [n > 0]   → DataGrid with the rows
 */
const buildOverviewActivityFeed = (d: EnumsBag): unknown => {
    const heading = safeNew(d.H, {
        content: 'Recent calls',
        type: d.H_Type.SMALL_HEADING
    }, 'Heading(recent-calls)');

    const calls = STATE.console.recentCalls as RecentCallRow[] | null;
    const rows: unknown[] = [];

    if (calls === null) {
        // Loading state — settled-counter in loadConsole rerenders once
        // all 5 parallel calls land. This branch is a one-frame flicker
        // most of the time.
        const loader = safeNew(component.Loader, {
            label: 'Loading recent calls…',
            indeterminate: true
        }, 'Loader(recent-calls)');
        if (loader) rows.push(loader);
    } else if (calls.length === 0) {
        const empty = safeNew(d.T, {
            text: 'No calls logged yet. Once reps start placing calls ' +
                  'through Click-to-Call, the 10 most recent will show up here.',
            type: d.T_Type.WEAK
        }, 'Text(recent-calls-empty)');
        if (empty) rows.push(empty);
    } else {
        const grid = buildRecentCallsDataGrid(d, calls);
        if (grid) rows.push(grid);
    }

    return safeNew(d.SP, {
        items: [heading as unknown].concat(rows).filter((c) => c != null),
        orientation: d.SP_Orient.VERTICAL,
        itemGap: d.SP_Gap.S
    }, 'StackPanel(recent-calls-feed)');
};

/**
 * DataGrid renderer for the Recent calls feed. Mirrors the column-
 * definition pattern used in sections/phones.ts and sections/health.ts:
 * plain options objects in `columns: [...]`, TEMPLATED columns whose
 * `content` callback returns Components built via safeNew.
 *
 * Columns: [Date | Rep | Contact | Duration | Status]
 *
 * Row click → opens the Phone Call record in a new tab via window.open.
 * Falls back to a vertical Text list if DataGrid isn't available at
 * runtime.
 */
const buildRecentCallsDataGrid = (d: EnumsBag, calls: RecentCallRow[]): unknown => {
    if (!d.DG) {
        console.warn('[CTC] DataGrid component unavailable; recent calls falling back to text');
        return buildRecentCallsFallback(d, calls);
    }

    let rowsDs: unknown;
    try {
        rowsDs = new d.Ads(calls);
    } catch (e) {
        console.error('[CTC] Recent calls ArrayDataSource failed:', e);
        return buildRecentCallsFallback(d, calls);
    }

    const CT = d.DG.ColumnType;
    const BdgType = d.Bdg.Type;

    const dateColDef = {
        type: CT.TEMPLATED,
        name: 'date',
        label: 'Date',
        stretchFactor: 2,
        content: (args: { cell?: { row?: { dataItem?: RecentCallRow } } }): unknown => {
            try {
                const row = args && args.cell && args.cell.row &&
                            args.cell.row.dataItem;
                if (!row) return safeNew(d.T, { text: '—' }, 'Text(date-empty)');
                return safeNew(d.T, {
                    text: row.date || '(no date)',
                    type: d.T_Type.DEFAULT
                }, 'Text(call-date)');
            } catch (e) {
                console.error('[CTC] Recent calls date column threw:', e);
                return safeNew(d.T, { text: '(error)' }, 'Text(date-error)');
            }
        }
    };

    const repColDef = {
        type: CT.TEMPLATED,
        name: 'rep',
        label: 'Rep',
        stretchFactor: 2,
        content: (args: { cell?: { row?: { dataItem?: RecentCallRow } } }): unknown => {
            try {
                const row = args && args.cell && args.cell.row &&
                            args.cell.row.dataItem;
                if (!row) return safeNew(d.T, { text: '—' }, 'Text(rep-empty)');
                return safeNew(d.T, {
                    text: row.repName || '(unassigned)',
                    type: d.T_Type.DEFAULT
                }, 'Text(call-rep)');
            } catch (e) {
                return safeNew(d.T, { text: '(error)' }, 'Text(rep-error)');
            }
        }
    };

    const contactColDef = {
        type: CT.TEMPLATED,
        name: 'contact',
        label: 'Contact',
        stretchFactor: 3,
        content: (args: { cell?: { row?: { dataItem?: RecentCallRow } } }): unknown => {
            try {
                const row = args && args.cell && args.cell.row &&
                            args.cell.row.dataItem;
                if (!row) return safeNew(d.T, { text: '—' }, 'Text(contact-empty)');
                const primary = row.companyName || row.contactName || '(unknown)';
                const secondary = (row.companyName && row.contactName)
                    ? row.contactName
                    : '';
                const primaryText = safeNew(d.T, {
                    text: primary,
                    type: d.T_Type.STRONG
                }, 'Text(call-contact-primary)');
                const secondaryText = secondary ? safeNew(d.T, {
                    text: secondary,
                    type: d.T_Type.WEAK,
                    size: d.T.Size && d.T.Size.S
                }, 'Text(call-contact-secondary)') : null;
                return safeNew(d.SP, {
                    items: [primaryText, secondaryText].filter((c) => c != null),
                    orientation: d.SP_Orient.VERTICAL,
                    itemGap: d.SP_Gap.XXS
                }, 'StackPanel(call-contact)') || primaryText;
            } catch (e) {
                return safeNew(d.T, { text: '(error)' }, 'Text(contact-error)');
            }
        }
    };

    const durationColDef = {
        type: CT.TEMPLATED,
        name: 'duration',
        label: 'Duration',
        stretchFactor: 1,
        content: (args: { cell?: { row?: { dataItem?: RecentCallRow } } }): unknown => {
            try {
                const row = args && args.cell && args.cell.row &&
                            args.cell.row.dataItem;
                if (!row) return safeNew(d.T, { text: '—' }, 'Text(dur-empty)');
                return safeNew(d.T, {
                    text: formatDuration(row.duration),
                    type: d.T_Type.DEFAULT
                }, 'Text(call-duration)');
            } catch (e) {
                return safeNew(d.T, { text: '(error)' }, 'Text(dur-error)');
            }
        }
    };

    const statusColDef = {
        type: CT.TEMPLATED,
        name: 'status',
        label: 'AI Status',
        stretchFactor: 2,
        content: (args: { cell?: { row?: { dataItem?: RecentCallRow } } }): unknown => {
            try {
                const row = args && args.cell && args.cell.row &&
                            args.cell.row.dataItem;
                if (!row) return safeNew(d.T, { text: '—' }, 'Text(status-empty)');
                const label = formatCallStatus(row.status);
                const badgeType = row.status === 'transcribed' ? BdgType.SOLID :
                                   row.status === 'failed' ? BdgType.SOLID :
                                                              BdgType.SUBTLE;
                return safeNew(d.Bdg, {
                    content: label,
                    type: badgeType
                }, 'Badge(call-status)') || safeNew(d.T, { text: label }, 'Text(call-status-fb)');
            } catch (e) {
                return safeNew(d.T, { text: '(error)' }, 'Text(status-error)');
            }
        }
    };

    const grid = safeNew(d.DG, {
        dataSource: rowsDs,
        columns: [dateColDef, repColDef, contactColDef, durationColDef, statusColDef],
        columnStretch: true,
        highlightRowsOnHover: true,
        stripedRows: true,
        dataRowHeight: 56,
        headerRowHeight: 40,
        rootStyle: { width: '100%' },
        // Row-click → open the Phone Call record in a new tab. Path
        // pattern matches NetSuite's standard call.nl URL.
        onRowClick: (args: { row?: { dataItem?: RecentCallRow } }): void => {
            const dataItem = args && args.row && args.row.dataItem;
            if (!dataItem || !dataItem.id) return;
            try {
                window.open(
                    '/app/crm/calendar/call.nl?id=' + encodeURIComponent(String(dataItem.id)),
                    '_blank'
                );
            } catch (e) { /* ignore */ }
        }
    }, 'DataGrid(recent-calls)');

    if (!grid) {
        console.warn('[CTC] Recent calls DataGrid construction returned null; using text fallback');
        return buildRecentCallsFallback(d, calls);
    }
    return grid;
};

/**
 * Text-only fallback for the Recent calls feed when DataGrid is
 * unavailable. Mirrors the buildPhonesFallback pattern.
 */
const buildRecentCallsFallback = (d: EnumsBag, calls: RecentCallRow[]): unknown => {
    const rows = calls.map((c) => {
        const label = (c.date || '?') + ' — ' +
                      (c.companyName || c.contactName || '(unknown)') +
                      ' [' + (c.repName || 'unassigned') + ']' +
                      ' — ' + formatDuration(c.duration);
        return safeNew(d.T, { text: label }, 'Text(call-row-fb)');
    }).filter((r) => r != null);
    if (rows.length === 0) return null;
    return safeNew(d.SP, {
        items: rows,
        orientation: d.SP_Orient.VERTICAL,
        itemGap: d.SP_Gap.XS
    }, 'StackPanel(recent-calls-fallback)');
};

/** Format a duration in seconds → "Mm:Ss" or "Hh:Mm:Ss". */
const formatDuration = (seconds: number): string => {
    if (!seconds || seconds < 0) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const pad = (n: number) => (n < 10 ? '0' + n : String(n));
    if (h > 0) return h + ':' + pad(m) + ':' + pad(s);
    return m + ':' + pad(s);
};

/** Map custevent_ctc_call_status raw value → human-readable label. */
const formatCallStatus = (status: string): string => {
    if (!status) return '—';
    // Status values from CLAUDE.md memory: Logged / Processing /
    // Transcribed / No transcript / Failed. The raw value may also
    // already be a human-readable label depending on whether the field
    // is text or a List/Record selector. Pass-through with title-case
    // normalization.
    const norm = String(status).trim();
    if (!norm) return '—';
    return norm.charAt(0).toUpperCase() + norm.slice(1).toLowerCase();
};
