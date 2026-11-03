/**
 * Overview page — admin-console landing (U2).
 *
 * Phase 4 (2026-05-28) — JSX rewrite of components/sections/overview.ts.
 * Three blocks stacked vertically:
 *   1. Stat-card grid    — 4 KPI cards (status, phones, reps, preflight)
 *   2. Quick actions     — row of 5 deep-link buttons
 *   3. Health checks     — preflight, drift, phones (HealthChecks)
 */

import {PureComponent} from '@uif-js/core';
import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import {store} from '../../app/Store';
import {Action} from '../../app/Action';
import {goToSection} from '../../app/effects/navigation';
import {deactivate, reactivate} from '../../app/effects/console';
import type {AppState, SectionName} from '../../app/InitialState';
import type {PageTickProps} from '../../App';
import HealthChecks from './HealthChecks';
import {formatPhone} from '../shared/formatPhone';
import {friendlyError} from '../shared/friendlyError';
import {buildFailedCheckLines} from '../shared/FailedChecks';

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
// OverviewPage
// ─────────────────────────────────────────────────────────────────────

export default class OverviewPage extends PureComponent<PageTickProps, unknown> {
    private handleNav = (section: SectionName): void => goToSection(section);

    // Deactivate asks twice: the first click shows Cancel / Confirm.
    private handleRequestDeactivate = (): void => { store.dispatch(Action.deactivateRequest()); };

    // deactivateSuccess clears pendingDeactivateConfirm in the reducer.
    private handleCancelDeactivate = (): void => { store.dispatch(Action.deactivateSuccess()); };

    private handleDeactivate = (): void => { deactivate(); };

    private handleReactivate = (): void => { reactivate('overview'); };

    /** Deactivate / Reactivate errors, shown under the quick-action buttons. */
    private renderActionErrors(c: AppState['console']): core.VDom.Node[] {
        const out: core.VDom.Node[] = [];
        if (c.deactivateError) {
            out.push(
                <component.StackPanel.Item>
                    <component.Text type={component.Text.Type.STRONG}>
                        {'✕ Deactivate failed: ' + friendlyError(c.deactivateError)}
                    </component.Text>
                </component.StackPanel.Item>
            );
        }
        if (c.reactivateError && c.reactivateSource === 'overview') {
            out.push(
                <component.StackPanel.Item>
                    <component.Text type={component.Text.Type.STRONG}>
                        {'✕ Reactivate failed: ' + friendlyError(c.reactivateError)}
                    </component.Text>
                </component.StackPanel.Item>
            );
            buildFailedCheckLines(c.reactivateFailedChecks).forEach((line) => {
                out.push(<component.StackPanel.Item>{line as never}</component.StackPanel.Item>);
            });
        }
        return out;
    }

    render(): core.VDom.Node {
        const state = store.getState() as AppState;
        const c = state.console;
        const snap = (c.snapshot || {}) as ConsoleSnapshot;
        const assignments = (c.assignments || []) as AssignmentRow[];
        const preflight = (c.preflight || []) as CheckRow[];
        // Loading: no "0 reps / Not yet run" while the first load runs.
        const assignmentsPending = c.assignments === null;
        const preflightPending = c.preflight === null && c.loading;

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
                                metric={assignmentsPending ? '…' : String(phonesConfigured)}
                                description={assignmentsPending ? 'Loading…'
                                    : phonesConfigured === 0
                                        ? 'No numbers configured'
                                        : formatPhone(snap.phoneNumber)}
                            />
                        </component.GridPanel.Item>
                        <component.GridPanel.Item>
                            <StatCard
                                title="Assigned reps"
                                metric={assignmentsPending ? '…' : String(repCount)}
                                description={assignmentsPending ? 'Loading…'
                                    : repCount === 0
                                        ? 'No assignments'
                                        : (repCount === 1 ? '1 rep' : repCount + ' reps')}
                            />
                        </component.GridPanel.Item>
                        <component.GridPanel.Item>
                            <StatCard
                                title="Preflight"
                                metric={preflightPending ? '…'
                                    : preflightTotal > 0
                                        ? preflightPassed + ' of ' + preflightTotal
                                        : '—'}
                                description={preflightPending ? 'Running checks…'
                                    : preflightTotal > 0
                                        ? 'See checks below'
                                        : c.preflightError ? 'Did not run' : 'Not yet run'}
                            />
                        </component.GridPanel.Item>
                    </component.GridPanel>
                </component.StackPanel.Item>

                {/* Quick actions — wrapped in a soft bordered card to match the wireframe */}
                <component.StackPanel.Item>
                    <component.StackPanel
                        orientation={component.StackPanel.Orientation.VERTICAL}
                        itemGap={component.StackPanel.GapSize.S}
                        rootStyle={{
                            border: '1px solid #E2E3E5',
                            borderRadius: '8px',
                            padding: '18px 22px',
                            background: '#FAFAFB'
                        } as never}
                    >
                        {[
                        (<component.StackPanel.Item>
                            <component.Text
                                type={component.Text.Type.WEAK}
                                size={component.Text.Size.S}
                            >
                                Common admin tasks — full screens still available via the left rail.
                            </component.Text>
                        </component.StackPanel.Item>),
                        (<component.StackPanel.Item>
                            <component.StackPanel
                                orientation={component.StackPanel.Orientation.HORIZONTAL}
                                itemGap={component.StackPanel.GapSize.S}
                            >
                                <component.StackPanel.Item>
                                    <component.Button
                                        label="Manage phone numbers"
                                        startIcon={core.SystemIcon.CALL as never}
                                        action={(): void => this.handleNav('phones')}
                                    />
                                </component.StackPanel.Item>
                                <component.StackPanel.Item>
                                    <component.Button
                                        label="Reassign reps"
                                        startIcon={core.SystemIcon.GROUPS as never}
                                        action={(): void => this.handleNav('phones')}
                                    />
                                </component.StackPanel.Item>
                                <component.StackPanel.Item>
                                    <component.Button
                                        label="Update voice config"
                                        startIcon={core.SystemIcon.SETTINGS as never}
                                        action={(): void => this.handleNav('voice')}
                                    />
                                </component.StackPanel.Item>
                                <component.StackPanel.Item>
                                    <component.Button
                                        label="API key rotation guide"
                                        startIcon={core.SystemIcon.LOCK as never}
                                        action={(): void => this.handleNav('credentials')}
                                    />
                                </component.StackPanel.Item>
                                {snap.active === false ? (
                                    <component.StackPanel.Item>
                                        <component.Button
                                            label={c.reactivating ? 'Reactivating…' : 'Reactivate'}
                                            type={component.Button.Type.PRIMARY}
                                            startIcon={core.SystemIcon.PLAY as never}
                                            enabled={!c.reactivating}
                                            action={this.handleReactivate}
                                        />
                                    </component.StackPanel.Item>
                                ) : c.pendingDeactivateConfirm ? (
                                    <component.StackPanel.Item>
                                        <component.StackPanel
                                            orientation={component.StackPanel.Orientation.HORIZONTAL}
                                            itemGap={component.StackPanel.GapSize.S}
                                        >
                                            <component.StackPanel.Item>
                                                <component.Button
                                                    label="Cancel"
                                                    enabled={!c.deactivating}
                                                    action={this.handleCancelDeactivate}
                                                />
                                            </component.StackPanel.Item>
                                            <component.StackPanel.Item>
                                                <component.Button
                                                    label={c.deactivating ? 'Deactivating…' : 'Confirm deactivate'}
                                                    type={component.Button.Type.DANGER}
                                                    startIcon={core.SystemIcon.STOP as never}
                                                    enabled={!c.deactivating}
                                                    action={this.handleDeactivate}
                                                />
                                            </component.StackPanel.Item>
                                        </component.StackPanel>
                                    </component.StackPanel.Item>
                                ) : (
                                    <component.StackPanel.Item>
                                        <component.Button
                                            label="Deactivate"
                                            type={component.Button.Type.DANGER}
                                            startIcon={core.SystemIcon.STOP as never}
                                            action={this.handleRequestDeactivate}
                                        />
                                    </component.StackPanel.Item>
                                )}
                            </component.StackPanel>
                        </component.StackPanel.Item>),
                        ...this.renderActionErrors(c)
                        ] as never}
                    </component.StackPanel>
                </component.StackPanel.Item>

                {/* Health checks — preflight, drift, phones */}
                <component.StackPanel.Item>
                    <HealthChecks tick={this.props.tick} />
                </component.StackPanel.Item>
            </component.StackPanel>
        );
    }
}
