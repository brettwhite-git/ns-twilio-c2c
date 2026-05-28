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
import {deactivate} from '../../app/effects/console';
import type {AppState, SectionName} from '../../app/InitialState';

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
// StatCard — 4 columns share this shape
// ─────────────────────────────────────────────────────────────────────

interface StatCardProps {
    title: string;
    metric: string;
    description: string;
    icon?: unknown;
    tone?: 'success' | 'warning' | 'info' | 'neutral';
}

const StatCard = (props: StatCardProps): core.VDom.Node => {
    const toneColor = (() => {
        switch (props.tone) {
            case 'success': return core.ImageConstant.Color.SUCCESS;
            case 'warning': return core.ImageConstant.Color.WARNING;
            case 'info': return core.ImageConstant.Color.INFO;
            default: return core.ImageConstant.Color.NEUTRAL;
        }
    })();

    return (
        <component.StackPanel
            orientation={component.StackPanel.Orientation.VERTICAL}
            itemGap={component.StackPanel.GapSize.XS}
            rootStyle={{
                padding: '16px',
                border: '1px solid #E2E3E5',
                borderRadius: '6px',
                background: '#FFFFFF'
            }}
        >
            <component.StackPanel.Item>
                <component.Text
                    type={component.Text.Type.WEAK}
                    size={component.Text.Size.S}
                >
                    {props.title}
                </component.Text>
            </component.StackPanel.Item>
            <component.StackPanel.Item>
                <component.StackPanel
                    orientation={component.StackPanel.Orientation.HORIZONTAL}
                    alignment={component.StackPanel.Alignment.CENTER}
                    itemGap={component.StackPanel.GapSize.XS}
                >
                    {props.icon ? (
                        <component.StackPanel.Item>
                            <component.Image
                                image={props.icon as never}
                                size={component.Image.Size.M}
                                color={toneColor as never}
                                presentation={true}
                            />
                        </component.StackPanel.Item>
                    ) : null}
                    <component.StackPanel.Item>
                        <component.Heading level={3}>
                            {props.metric}
                        </component.Heading>
                    </component.StackPanel.Item>
                </component.StackPanel>
            </component.StackPanel.Item>
            <component.StackPanel.Item>
                <component.Text
                    type={component.Text.Type.WEAK}
                    size={component.Text.Size.S}
                >
                    {props.description}
                </component.Text>
            </component.StackPanel.Item>
        </component.StackPanel>
    );
};

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

export default class OverviewPage extends PureComponent<unknown, unknown> {
    private recentCallsColumns: unknown[];

    constructor(props: unknown, context: unknown) {
        super(props, context);
        const CT = (component.DataGrid as unknown as { ColumnType: Record<string, unknown> }).ColumnType;
        const BdgType = component.Badge.Type;

        this.recentCallsColumns = [
            {
                type: CT.TEMPLATED,
                name: 'date',
                label: 'Date',
                stretchFactor: 2,
                content: (args: { cell?: { row?: { dataItem?: RecentCallRow } } }): unknown => {
                    const row = args?.cell?.row?.dataItem;
                    return new component.Text({ text: row?.date || '—' });
                }
            },
            {
                type: CT.TEMPLATED,
                name: 'rep',
                label: 'Rep',
                stretchFactor: 2,
                content: (args: { cell?: { row?: { dataItem?: RecentCallRow } } }): unknown => {
                    const row = args?.cell?.row?.dataItem;
                    return new component.Text({ text: row?.repName || '(unassigned)' });
                }
            },
            {
                type: CT.TEMPLATED,
                name: 'contact',
                label: 'Contact',
                stretchFactor: 3,
                content: (args: { cell?: { row?: { dataItem?: RecentCallRow } } }): unknown => {
                    const row = args?.cell?.row?.dataItem;
                    const primary = row?.companyName || row?.contactName || '(unknown)';
                    return new component.Text({ text: primary, type: component.Text.Type.STRONG });
                }
            },
            {
                type: CT.TEMPLATED,
                name: 'duration',
                label: 'Duration',
                stretchFactor: 1,
                content: (args: { cell?: { row?: { dataItem?: RecentCallRow } } }): unknown => {
                    const row = args?.cell?.row?.dataItem;
                    return new component.Text({ text: row ? formatDuration(row.duration) : '—' });
                }
            },
            {
                type: CT.TEMPLATED,
                name: 'status',
                label: 'AI Status',
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
            }
        ];
    }

    private handleNav = (section: SectionName): void => goToSection(section);

    private handleDeactivate = (): void => { deactivate(); };

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

        const recentCallsDs = recentCalls && recentCalls.length > 0
            ? new core.ArrayDataSource(recentCalls)
            : null;

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
                                    <component.Button
                                        label="Deactivate"
                                        type={component.Button.Type.DANGER}
                                        startIcon={core.SystemIcon.STOP as never}
                                        action={this.handleDeactivate}
                                    />
                                </component.StackPanel.Item>
                            </component.StackPanel>
                        </component.StackPanel.Item>
                    </component.StackPanel>
                </component.StackPanel.Item>

                {/* Recent calls */}
                <component.StackPanel.Item>
                    <component.StackPanel
                        orientation={component.StackPanel.Orientation.VERTICAL}
                        itemGap={component.StackPanel.GapSize.S}
                    >
                        <component.StackPanel.Item>
                            <component.Heading level={3}>Recent calls</component.Heading>
                        </component.StackPanel.Item>
                        {recentCalls === null ? (
                            <component.StackPanel.Item>
                                {new component.Loader({
                                    label: 'Loading recent calls…',
                                    indeterminate: true
                                } as never) as never}
                            </component.StackPanel.Item>
                        ) : recentCalls.length === 0 ? (
                            <component.StackPanel.Item>
                                <component.Text type={component.Text.Type.WEAK}>
                                    No calls logged yet. Once reps start placing
                                    calls through Click-to-Call, the 10 most
                                    recent will show up here.
                                </component.Text>
                            </component.StackPanel.Item>
                        ) : (
                            <component.StackPanel.Item>
                                {new component.DataGrid({
                                    dataSource: recentCallsDs,
                                    columns: this.recentCallsColumns,
                                    columnStretch: true,
                                    highlightRowsOnHover: true,
                                    stripedRows: true,
                                    dataRowHeight: 56,
                                    headerRowHeight: 40,
                                    onRowClick: this.handleRowClick
                                } as never) as never}
                            </component.StackPanel.Item>
                        )}
                    </component.StackPanel>
                </component.StackPanel.Item>
            </component.StackPanel>
        );
    }
}
