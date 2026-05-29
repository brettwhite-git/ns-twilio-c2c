/**
 * Overview page — admin-console landing (U2).
 *
 * Phase 4 (2026-05-28) — JSX rewrite of components/sections/overview.ts.
 * Three blocks stacked vertically:
 *   1. Stat-card grid    — 4 KPI cards (status, phones, reps, preflight)
 *   2. Quick actions     — row of 5 deep-link buttons
 *   3. Recent calls      — DataGrid showing last 10 CTC-logged calls
 */

import {PureComponent} from '@uif-js/core';
import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import {store} from '../../app/Store';
import {goToSection} from '../../app/effects/navigation';
import {deactivate, reactivate} from '../../app/effects/console';
import type {AppState, SectionName} from '../../app/InitialState';
import type {PageTickProps} from '../../App';

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

interface RecentCallRow {
    id: string | number;
    date: string;
    title: string;
    repName: string;
    companyName: string;
    contactName: string;
    duration: number;
    brief: string;
    status: string;
    satisfaction: number | null;
}

// ─────────────────────────────────────────────────────────────────────
// StatCard — uses UIF Card.metric() for proper KPI styling (padding,
// border, baseline). Matches the legacy buildStatCard exactly.
// ─────────────────────────────────────────────────────────────────────

interface StatCardProps {
    title: string;
    metric: string;
    description: string;
    icon?: unknown;
    tone?: 'success' | 'warning' | 'info' | 'neutral';
}

const toneToImageColor = (tone: StatCardProps['tone']): unknown => {
    switch (tone) {
        case 'success': return core.ImageConstant.Color.SUCCESS;
        case 'warning': return core.ImageConstant.Color.WARNING;
        case 'info':    return core.ImageConstant.Color.INFO;
        case 'neutral': return core.ImageConstant.Color.NEUTRAL;
        default: return undefined;
    }
};

const buildIconedDescription = (props: StatCardProps): unknown => {
    const iconColor = toneToImageColor(props.tone);
    const icon = new component.Image({
        image: props.icon,
        size: component.Image.Size.S,
        color: iconColor,
        presentation: true
    } as never);
    const descText = props.description
        ? new component.Text({
            text: props.description,
            type: component.Text.Type.WEAK,
            size: component.Text.Size.S
        })
        : null;
    // StackPanel `items` accepts Component instances directly OR
    // StructuredItemConfiguration { component, options? } — both are
    // valid ItemConfiguration shapes per the catalog.
    const items = [
        icon,
        descText
    ].filter(Boolean);
    return new component.StackPanel({
        items,
        orientation: component.StackPanel.Orientation.HORIZONTAL,
        itemGap: component.StackPanel.GapSize.XS,
        alignment: component.StackPanel.Alignment.CENTER
    } as never);
};

const buildStatCard = (props: StatCardProps): core.VDom.Node => {
    // Card.metric is the canonical UIF KPI card factory — provides title,
    // metric value, and description slots with built-in styling. Matches
    // legacy buildStatCard in _archive/.../components/shared/shell.ts.
    try {
        const card = (component.Card as unknown as {
            metric: (opts: object) => unknown;
        }).metric({
            title: props.title,
            metric: props.metric,
            description: props.icon
                ? buildIconedDescription(props)
                : props.description
        });
        return card as never;
    } catch (e) {
        // Fallback to hand-rolled stack if Card.metric throws.
        const titleText = new component.Text({
            text: props.title,
            type: component.Text.Type.WEAK,
            size: component.Text.Size.S
        });
        const metricText = new component.Text({
            text: props.metric,
            type: component.Text.Type.STRONG
        });
        const descText = props.description
            ? new component.Text({
                text: props.description,
                type: component.Text.Type.WEAK,
                size: component.Text.Size.S
            })
            : null;
        const items = [titleText, metricText, descText].filter(Boolean);
        return new component.StackPanel({
            items,
            orientation: component.StackPanel.Orientation.VERTICAL,
            itemGap: component.StackPanel.GapSize.XXS
        } as never) as never;
    }
};

const StatCard = (props: StatCardProps): core.VDom.Node => buildStatCard(props);

// ─────────────────────────────────────────────────────────────────────
// Helpers (status formatting)
// ─────────────────────────────────────────────────────────────────────

const formatDuration = (seconds: number): string => {
    if (!seconds || seconds < 0) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const pad = (n: number): string => (n < 10 ? '0' + n : String(n));
    if (h > 0) return h + ':' + pad(m) + ':' + pad(s);
    return m + ':' + pad(s);
};

const formatCallStatus = (status: string): string => {
    const norm = (status || '').trim();
    if (!norm) return '—';
    return norm.charAt(0).toUpperCase() + norm.slice(1).toLowerCase();
};

const statusBadgePalette = (status: string): { bg: string; fg: string; border: string } => {
    const norm = (status || '').toLowerCase().trim();
    switch (norm) {
        case 'transcribed': return { bg: '#D4EDDA', fg: '#155724', border: '#A3D9AE' };
        case 'processing':  return { bg: '#CCE5FF', fg: '#004085', border: '#9FCDFF' };
        case 'logged':      return { bg: '#E2E3E5', fg: '#383D41', border: '#C7CACE' };
        case 'no_transcript':
        case 'no transcript': return { bg: '#FFF3CD', fg: '#856404', border: '#FFE69C' };
        case 'failed':      return { bg: '#F8D7DA', fg: '#721C24', border: '#F1B5BB' };
        default:            return { bg: '#E2E3E5', fg: '#383D41', border: '#C7CACE' };
    }
};

// ─────────────────────────────────────────────────────────────────────
// OverviewPage
// ─────────────────────────────────────────────────────────────────────

interface OverviewPageState {
    /** 0-based current page index for the Recent activity DataGrid. */
    currentPage: number;
}

const ROWS_PER_PAGE = 10;

export default class OverviewPage extends PureComponent<PageTickProps, OverviewPageState> {
    private recentCallsColumns: unknown[];

    constructor(props: PageTickProps, context: unknown) {
        super(props, context);
        this.state = { currentPage: 0 };
        const CT = (component.DataGrid as unknown as { ColumnType: Record<string, unknown> }).ColumnType;
        const BdgType = component.Badge.Type;

        // Recent activity grid — 5 columns (Date, Customer, Rep, Status,
        // open-call action). Sits on the LEFT half of a 2-col GridPanel
        // paired with the rep-activity chart on the right.
        this.recentCallsColumns = [
            {
                type: CT.TEMPLATED,
                name: 'date',
                label: 'Date',
                stretchFactor: 2,
                content: (args: { cell?: { row?: { dataItem?: RecentCallRow } } }): unknown => {
                    const row = args?.cell?.row?.dataItem;
                    return new component.Text({
                        text: row?.date || '—',
                        size: component.Text.Size.S
                    });
                }
            },
            {
                type: CT.TEMPLATED,
                name: 'contact',
                label: 'Customer',
                stretchFactor: 3,
                content: (args: { cell?: { row?: { dataItem?: RecentCallRow } } }): unknown => {
                    const row = args?.cell?.row?.dataItem;
                    const primary = row?.companyName || row?.contactName || '(unknown)';
                    return new component.Text({ text: primary, type: component.Text.Type.STRONG });
                }
            },
            {
                type: CT.TEMPLATED,
                name: 'rep',
                label: 'Sales rep',
                stretchFactor: 2,
                content: (args: { cell?: { row?: { dataItem?: RecentCallRow } } }): unknown => {
                    const row = args?.cell?.row?.dataItem;
                    return new component.Text({ text: row?.repName || '(unassigned)' });
                }
            },
            {
                type: CT.TEMPLATED,
                name: 'status',
                label: 'Status',
                stretchFactor: 2,
                content: (args: { cell?: { row?: { dataItem?: RecentCallRow } } }): unknown => {
                    const row = args?.cell?.row?.dataItem;
                    if (!row) return new component.Text({ text: '—' });
                    const palette = statusBadgePalette(row.status);
                    return new component.Badge({
                        content: formatCallStatus(row.status),
                        type: BdgType.SUBTLE,
                        rootStyle: {
                            backgroundColor: palette.bg,
                            color: palette.fg,
                            border: '1px solid ' + palette.border
                        }
                    });
                }
            },
            {
                type: CT.TEMPLATED,
                name: 'open',
                label: '',
                stretchFactor: 1,
                content: (args: { cell?: { row?: { dataItem?: RecentCallRow } } }): unknown => {
                    const row = args?.cell?.row?.dataItem;
                    if (!row?.id) return new component.Text({ text: '' });
                    return new component.Button({
                        label: '',
                        startIcon: core.SystemIcon.CALL,
                        action: (): void => {
                            try {
                                window.open(
                                    '/app/crm/calendar/call.nl?id=' +
                                        encodeURIComponent(String(row.id)),
                                    '_blank'
                                );
                            } catch (e) { /* ignore */ }
                        }
                    } as never);
                }
            }
        ];
    }

    private handlePageChange = (args: { index?: number }): void => {
        // UIF Pagination.onPageSelected fires with
        // { page, index, previousPage, previousIndex, reason }.
        // The 0-based current page lives on .index — NOT
        // .selectedPageIndex (that was an incorrect guess from the
        // component property name and silently fell back to page 0,
        // so clicking next/prev never advanced).
        const next = (args && typeof args.index === 'number') ? args.index : 0;
        this.setState({ currentPage: next });
    };

    /**
     * Build the left-side paginated grid block: header row containing
     * a "Recent calls" title (left) + Pagination strip (right), with
     * the DataGrid below.
     */
    private buildRecentCallsGrid(allCalls: RecentCallRow[]): unknown {
        const totalRows = allCalls.length;
        const start = this.state.currentPage * ROWS_PER_PAGE;
        const pageSlice = allCalls.slice(start, start + ROWS_PER_PAGE);
        const pageRowsDs = new core.ArrayDataSource(pageSlice);

        const headerTitle = new component.Text({
            text: 'Recent calls',
            type: component.Text.Type.STRONG
        });

        const pagination = new component.Pagination({
            pages: { rowsCount: totalRows, rowsPerPage: ROWS_PER_PAGE },
            selectedPageIndex: this.state.currentPage,
            rowsCounter: totalRows,
            navigation: {
                type: (component.Pagination as unknown as { NavigationType: { DEFAULT: unknown } })
                    .NavigationType.DEFAULT,
                buttons: {
                    firstPage: true,
                    previousPage: true,
                    nextPage: true,
                    lastPage: true
                },
                pageIndicator: true
            },
            onPageSelected: this.handlePageChange
        } as never);

        const headerRow = new component.StackPanel({
            items: [headerTitle, pagination],
            orientation: component.StackPanel.Orientation.HORIZONTAL,
            justification: component.StackPanel.Justification.SPACE_BETWEEN,
            alignment: component.StackPanel.Alignment.CENTER,
            itemGap: component.StackPanel.GapSize.M
        } as never);

        // Cap the DataGrid to ~440px so [headerRow ~40px + grid 440px]
        // totals ~480px and matches the chart's height on the right. The
        // DataGrid scrolls internally when the 10-row page exceeds the
        // visible window.
        const grid = new component.DataGrid({
            dataSource: pageRowsDs,
            columns: this.recentCallsColumns,
            columnStretch: true,
            highlightRowsOnHover: true,
            stripedRows: true,
            dataRowHeight: 48,
            headerRowHeight: 40,
            onRowClick: this.handleRowClick,
            rootStyle: { width: '100%', height: '440px' }
        } as never);

        return new component.StackPanel({
            items: [headerRow, grid],
            orientation: component.StackPanel.Orientation.VERTICAL,
            itemGap: component.StackPanel.GapSize.S,
            rootStyle: { width: '100%' }
        } as never);
    }

    /**
     * Aggregate the recent-calls list by sales rep for the chart on the
     * right half of the Recent activity block. Returns { categories,
     * callCounts, durationMinutes } in matched-index order.
     */
    private aggregateByRep(calls: RecentCallRow[]): {
        categories: string[];
        callCounts: number[];
        durationMinutes: number[];
    } {
        const buckets: Record<string, { calls: number; seconds: number }> = {};
        for (const c of calls) {
            const key = c.repName || '(unassigned)';
            if (!buckets[key]) buckets[key] = { calls: 0, seconds: 0 };
            buckets[key].calls += 1;
            buckets[key].seconds += c.duration || 0;
        }
        const categories = Object.keys(buckets);
        const callCounts = categories.map((k) => buckets[k].calls);
        const durationMinutes = categories.map((k) =>
            Math.round((buckets[k].seconds / 60) * 10) / 10);
        return { categories, callCounts, durationMinutes };
    }

    /**
     * Build the right-side rep-activity chart. Column for call counts on
     * the primary axis, line for duration (minutes) on the opposite y2.
     * Height capped at 480px so the chart and the paired DataGrid stay
     * in visual balance and the whole Recent activity block doesn't push
     * the page below the viewport fold.
     */
    private buildRepChart(calls: RecentCallRow[]): unknown {
        const {categories, callCounts, durationMinutes} = this.aggregateByRep(calls);
        return new component.Chart({
            title: 'Sales rep activity',
            subtitle: 'From the ' + calls.length + ' most recent calls',
            xAxis: {
                categories,
                title: 'Sales rep'
            },
            yAxis: [
                { title: 'Calls' },
                { title: 'Duration (min)', opposite: true }
            ],
            series: [
                {
                    name: 'Calls',
                    type: component.Chart.Type.COLUMN,
                    yAxis: 0,
                    data: callCounts
                },
                {
                    name: 'Duration (min)',
                    color: component.Chart.Color.YELLOW,
                    yAxis: 1,
                    data: durationMinutes
                }
            ],
            rootStyle: { width: '100%', height: '480px' }
        } as never);
    }

    private handleNav = (section: SectionName): void => goToSection(section);

    private handleDeactivate = (): void => { deactivate(); };

    private handleReactivate = (): void => { reactivate(); };

    private handleRowClick = (args: { row?: { dataItem?: RecentCallRow } }): void => {
        const dataItem = args?.row?.dataItem;
        if (!dataItem?.id) return;
        try {
            window.open(
                '/app/crm/calendar/call.nl?id=' + encodeURIComponent(String(dataItem.id)),
                '_blank'
            );
        } catch (e) { /* ignore */ }
    };

    render(): core.VDom.Node {
        const state = store.getState() as AppState;
        const c = state.console;
        const snap = (c.snapshot || {}) as ConsoleSnapshot;
        const assignments = (c.assignments || []) as AssignmentRow[];
        const preflight = (c.preflight || []) as CheckRow[];
        const recentCalls = c.recentCalls as RecentCallRow[] | null;

        const phoneCount: Record<string, boolean> = {};
        assignments.forEach((a) => { if (a.phoneSid) phoneCount[a.phoneSid] = true; });
        const phonesConfigured = Object.keys(phoneCount).length || (snap.phoneNumber ? 1 : 0);
        const repCount = assignments.length;
        const preflightPassed = preflight.filter((cc) => cc.status === 'pass').length;
        const preflightTotal = preflight.length;

        const statusLabel = snap.active === false ? 'Paused'
            : snap.active === true ? 'Active' : 'Unknown';
        const statusIcon = snap.active === true ? core.SystemIcon.STATUS_SUCCESS_FILLED
            : snap.active === false ? core.SystemIcon.STATUS_WARNING_FILLED
            : core.SystemIcon.STATUS_INFO_FILLED;
        const statusTone: StatCardProps['tone'] =
            snap.active === true ? 'success' : snap.active === false ? 'warning' : 'info';

        return (
            <component.StackPanel
                orientation={component.StackPanel.Orientation.VERTICAL}
                itemGap={component.StackPanel.GapSize.L}
            >
                {/* Stat cards row */}
                <component.StackPanel.Item>
                    <component.GridPanel
                        columns="1fr 1fr 1fr 1fr"
                        rows="auto"
                        columnGap={component.GridPanel.GapSize.M}
                    >
                        <component.GridPanel.Item>
                            <StatCard
                                title="Status"
                                metric={statusLabel}
                                description={snap.active === false
                                    ? 'Reps cannot place calls'
                                    : 'Reps can place calls'}
                                icon={statusIcon}
                                tone={statusTone}
                            />
                        </component.GridPanel.Item>
                        <component.GridPanel.Item>
                            <StatCard
                                title="Phone numbers"
                                metric={String(phonesConfigured)}
                                description={phonesConfigured === 0
                                    ? 'No numbers configured'
                                    : (snap.phoneNumber || '')}
                            />
                        </component.GridPanel.Item>
                        <component.GridPanel.Item>
                            <StatCard
                                title="Assigned reps"
                                metric={String(repCount)}
                                description={repCount === 0
                                    ? 'No assignments'
                                    : (repCount === 1 ? '1 rep' : repCount + ' reps')}
                            />
                        </component.GridPanel.Item>
                        <component.GridPanel.Item>
                            <StatCard
                                title="Preflight"
                                metric={preflightTotal > 0
                                    ? preflightPassed + ' of ' + preflightTotal
                                    : '—'}
                                description={preflightTotal > 0
                                    ? 'See Health for detail'
                                    : 'Not yet run'}
                            />
                        </component.GridPanel.Item>
                    </component.GridPanel>
                </component.StackPanel.Item>

                {/* Quick actions */}
                <component.StackPanel.Item>
                    <component.StackPanel
                        orientation={component.StackPanel.Orientation.VERTICAL}
                        itemGap={component.StackPanel.GapSize.S}
                    >
                        <component.StackPanel.Item>
                            <component.Heading level={3}>Quick actions</component.Heading>
                        </component.StackPanel.Item>
                        <component.StackPanel.Item>
                            <component.Text
                                type={component.Text.Type.WEAK}
                                size={component.Text.Size.S}
                            >
                                Common admin tasks — full screens still available via the left rail.
                            </component.Text>
                        </component.StackPanel.Item>
                        <component.StackPanel.Item>
                            <component.StackPanel
                                orientation={component.StackPanel.Orientation.HORIZONTAL}
                                itemGap={component.StackPanel.GapSize.S}
                            >
                                <component.StackPanel.Item>
                                    <component.Button
                                        label="Add a phone number"
                                        startIcon={core.SystemIcon.ADD as never}
                                        action={(): void => this.handleNav('phones')}
                                    />
                                </component.StackPanel.Item>
                                <component.StackPanel.Item>
                                    <component.Button
                                        label="Reassign reps"
                                        startIcon={core.SystemIcon.REFRESH as never}
                                        action={(): void => this.handleNav('phones')}
                                    />
                                </component.StackPanel.Item>
                                <component.StackPanel.Item>
                                    <component.Button
                                        label="Update voice config"
                                        startIcon={core.SystemIcon.PLAY as never}
                                        action={(): void => this.handleNav('voice')}
                                    />
                                </component.StackPanel.Item>
                                <component.StackPanel.Item>
                                    <component.Button
                                        label="Rotate API Key Secret"
                                        startIcon={core.SystemIcon.LOCK as never}
                                        action={(): void => this.handleNav('credentials')}
                                    />
                                </component.StackPanel.Item>
                                <component.StackPanel.Item>
                                    {snap.active === false ? (
                                        <component.Button
                                            label="Reactivate"
                                            type={component.Button.Type.PRIMARY}
                                            startIcon={core.SystemIcon.PLAY as never}
                                            action={this.handleReactivate}
                                        />
                                    ) : (
                                        <component.Button
                                            label="Deactivate"
                                            type={component.Button.Type.DANGER}
                                            startIcon={core.SystemIcon.STOP as never}
                                            action={this.handleDeactivate}
                                        />
                                    )}
                                </component.StackPanel.Item>
                            </component.StackPanel>
                        </component.StackPanel.Item>
                    </component.StackPanel>
                </component.StackPanel.Item>

                {/* Recent activity — 2-col grid: DataGrid (left) + Chart (right) */}
                <component.StackPanel.Item>
                    <component.StackPanel
                        orientation={component.StackPanel.Orientation.VERTICAL}
                        itemGap={component.StackPanel.GapSize.S}
                    >
                        <component.StackPanel.Item>
                            <component.Heading level={3}>Recent activity</component.Heading>
                        </component.StackPanel.Item>
                        {recentCalls === null ? (
                            <component.StackPanel.Item>
                                {new component.Loader({
                                    label: 'Loading recent activity…',
                                    indeterminate: true
                                } as never) as never}
                            </component.StackPanel.Item>
                        ) : recentCalls.length === 0 ? (
                            <component.StackPanel.Item>
                                <component.Text type={component.Text.Type.WEAK}>
                                    No calls logged yet. Once reps start
                                    placing calls through Click-to-Call,
                                    recent activity will show up here.
                                </component.Text>
                            </component.StackPanel.Item>
                        ) : (
                            <component.StackPanel.Item>
                                <component.GridPanel
                                    columns="1fr 1fr"
                                    rows="auto"
                                    columnGap={component.GridPanel.GapSize.L}
                                >
                                    <component.GridPanel.Item>
                                        {this.buildRecentCallsGrid(recentCalls) as never}
                                    </component.GridPanel.Item>
                                    <component.GridPanel.Item>
                                        {this.buildRepChart(recentCalls) as never}
                                    </component.GridPanel.Item>
                                </component.GridPanel>
                            </component.StackPanel.Item>
                        )}
                    </component.StackPanel>
                </component.StackPanel.Item>
            </component.StackPanel>
        );
    }
}
