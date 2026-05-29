/**
 * Step 5 — Test & activate (JSX, redesigned).
 *
 * Phase A.8 (2026-05-29) — three sections, all reading
 * state.console.snapshot/preflight (which loadStep5 unwraps from the
 * server response):
 *
 *   1. Configuration review — 2-column dl-style grid
 *      (label uppercase weak / value mono). Mirrors the setup-wizard
 *      wireframe's `<dl class="summary">` block.
 *   2. Preflight checks — DataGrid matching the Health page's check
 *      table (StatusIcon | Check | Detail | Status badge).
 *   3. Action row — Activate (gated by allPassed) + Back + Re-run.
 *
 * The activated/loading branches are unchanged.
 */

import {PureComponent} from '@uif-js/core';
import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import {store} from '../../app/Store';
import {Action} from '../../app/Action';
import {loadStep5} from '../../app/effects/steps';
import {goToConsole, goToStep} from '../../app/effects/navigation';
import {wizardCall} from '../../services/wizardApi';
import type {AppState} from '../../app/InitialState';
import type {PageTickProps} from '../../App';

interface ConfigSnapshot {
    accountSid?: string;
    apiKeySid?: string;
    apiSecretId?: string;
    twimlAppSid?: string;
    phoneNumber?: string;
    intelServiceSid?: string;
}

interface PreflightCheck {
    id?: string;
    label?: string;
    status?: string;
    detail?: string;
    repairHint?: string;
}

interface AssignmentRow {
    phoneSid?: string;
}

interface CellArgs {
    cell?: { row?: { dataItem?: PreflightCheck } };
}

const statusToBadge = (status: string): {
    text: string;
    palette: { bg: string; fg: string; border: string };
} => {
    switch (status) {
        case 'pass': return { text: 'Pass', palette: { bg: '#D4EDDA', fg: '#155724', border: '#A3D9AE' } };
        case 'fail': return { text: 'Fail', palette: { bg: '#F8D7DA', fg: '#721C24', border: '#F1B5BB' } };
        case 'warn': return { text: 'Warn', palette: { bg: '#FFF3CD', fg: '#856404', border: '#FFE69C' } };
        case 'info_enabled': return { text: 'Enabled', palette: { bg: '#CCE5FF', fg: '#004085', border: '#9FCDFF' } };
        case 'info_disabled': return { text: 'Disabled', palette: { bg: '#E2E3E5', fg: '#383D41', border: '#C7CACE' } };
        default: return { text: status || '—', palette: { bg: '#E2E3E5', fg: '#383D41', border: '#C7CACE' } };
    }
};

const statusIcon = (status: string): { icon: unknown; color: unknown } => {
    switch (status) {
        case 'pass': return { icon: core.SystemIcon.STATUS_SUCCESS_FILLED, color: core.ImageConstant.Color.SUCCESS };
        case 'fail': return { icon: core.SystemIcon.STATUS_ERROR_FILLED, color: core.ImageConstant.Color.DANGER };
        case 'warn': return { icon: core.SystemIcon.STATUS_WARNING_FILLED, color: core.ImageConstant.Color.WARNING };
        case 'info_enabled': return { icon: core.SystemIcon.STATUS_INFO_FILLED, color: core.ImageConstant.Color.INFO };
        default: return { icon: core.SystemIcon.STATUS_INFO, color: core.ImageConstant.Color.NEUTRAL };
    }
};

export default class Step5 extends PureComponent<PageTickProps, unknown> {
    componentDidMount(): void {
        store.dispatch(Action.step5FieldChange('loading', true));
        store.dispatch(Action.step5FieldChange('activateError', null));
        loadStep5().finally(() => {
            store.dispatch(Action.step5FieldChange('loading', false));
        });
    }

    private rerunPreflight = (): void => {
        store.dispatch(Action.step5FieldChange('loading', true));
        store.dispatch(Action.step5FieldChange('activateError', null));
        loadStep5().finally(() => {
            store.dispatch(Action.step5FieldChange('loading', false));
        });
    };

    private activate = async (): Promise<void> => {
        try {
            const payload = await wizardCall('wizardActivate', {});
            const resp = payload as {
                activated?: boolean;
                error?: string;
                failedChecks?: PreflightCheck[];
            } | null;
            if (resp && resp.activated) {
                store.dispatch(Action.step5FieldChange('activated', true));
                store.dispatch(Action.step5FieldChange('activateError', null));
            } else {
                store.dispatch(Action.step5FieldChange(
                    'activateError',
                    (resp && resp.error) || 'unknown'
                ));
                if (resp && resp.failedChecks) {
                    store.dispatch(Action.consoleLoadSuccess({
                        preflight: resp.failedChecks as unknown[]
                    }));
                }
            }
        } catch (e) {
            const err = e as { message?: string };
            store.dispatch(Action.step5FieldChange(
                'activateError',
                'Network: ' + (err.message || String(e))
            ));
        }
    };

    private buildCheckColumns(): unknown[] {
        const CT = (component.DataGrid as unknown as { ColumnType: Record<string, unknown> }).ColumnType;
        const BdgType = component.Badge.Type;

        return [
            {
                type: CT.TEMPLATED,
                name: 'statusIcon',
                label: '',
                stretchFactor: 1,
                content: (args: CellArgs): unknown => {
                    const status = args?.cell?.row?.dataItem?.status || 'info_enabled';
                    const si = statusIcon(status);
                    return new component.Image({
                        image: si.icon,
                        size: component.Image.Size.M,
                        color: si.color,
                        presentation: true
                    } as never);
                }
            },
            {
                type: CT.TEMPLATED,
                name: 'check',
                label: 'Check',
                stretchFactor: 5,
                content: (args: CellArgs): unknown => {
                    const row = args?.cell?.row?.dataItem;
                    return new component.Text({
                        text: row?.label || '(unlabeled check)',
                        type: component.Text.Type.STRONG
                    });
                }
            },
            {
                type: CT.TEMPLATED,
                name: 'detail',
                label: 'Detail',
                stretchFactor: 7,
                content: (args: CellArgs): unknown => {
                    const row = args?.cell?.row?.dataItem;
                    const text = row?.detail ||
                        (row?.repairHint ? '→ ' + row.repairHint : '—');
                    return new component.Text({
                        text,
                        type: component.Text.Type.WEAK,
                        size: component.Text.Size.S
                    });
                }
            },
            {
                type: CT.TEMPLATED,
                name: 'status',
                label: 'Status',
                stretchFactor: 2,
                content: (args: CellArgs): unknown => {
                    const status = args?.cell?.row?.dataItem?.status || 'info_enabled';
                    const sb = statusToBadge(status);
                    return new component.Badge({
                        content: sb.text,
                        type: BdgType.SUBTLE,
                        rootStyle: {
                            backgroundColor: sb.palette.bg,
                            color: sb.palette.fg,
                            border: '1px solid ' + sb.palette.border
                        }
                    });
                }
            }
        ];
    }

    private renderReviewGrid(snap: ConfigSnapshot, assignments: AssignmentRow[]): core.VDom.Node {
        // Track unique phone numbers represented in the assignments.
        const phoneSet: Record<string, boolean> = {};
        assignments.forEach((a) => { if (a.phoneSid) phoneSet[a.phoneSid] = true; });
        const phoneCount = Object.keys(phoneSet).length;

        const rows: Array<{label: string; value: string; mono: boolean; weak?: boolean}> = [
            {label: 'ACCOUNT SID',         value: snap.accountSid || '(not set)',     mono: true,  weak: !snap.accountSid},
            {label: 'API KEY SID',          value: snap.apiKeySid || '(not set)',      mono: true,  weak: !snap.apiKeySid},
            {label: 'API KEY SECRET',       value: snap.apiSecretId || '(not set)',    mono: true,  weak: !snap.apiSecretId},
            {label: 'TWIML APPLICATION',    value: snap.twimlAppSid || '(not set)',    mono: true,  weak: !snap.twimlAppSid},
            {label: 'DEFAULT CALLER ID',    value: snap.phoneNumber || '(not set)',    mono: true,  weak: !snap.phoneNumber},
            {label: 'INTEL SERVICE',        value: snap.intelServiceSid || '(none)',   mono: true,  weak: !snap.intelServiceSid},
            {label: 'PHONE ASSIGNMENTS',    value: assignments.length + ' rep(s) across ' + phoneCount + ' number(s)', mono: false, weak: assignments.length === 0}
        ];

        const cells: core.VDom.Node[] = [];
        rows.forEach((r) => {
            cells.push(
                <component.GridPanel.Item>
                    <component.Text
                        type={component.Text.Type.WEAK}
                        size={component.Text.Size.S}
                    >
                        {r.label}
                    </component.Text>
                </component.GridPanel.Item>
            );
            cells.push(
                <component.GridPanel.Item>
                    <component.Text
                        type={r.weak ? component.Text.Type.WEAK : component.Text.Type.DEFAULT}
                        rootStyle={{
                            fontFamily: r.mono
                                ? 'ui-monospace, SF Mono, Menlo, Consolas, monospace'
                                : 'inherit',
                            fontSize: r.mono ? '12.5px' : '13px',
                            wordBreak: 'break-all'
                        } as never}
                    >
                        {r.value}
                    </component.Text>
                </component.GridPanel.Item>
            );
        });

        return (
            <component.StackPanel
                orientation={component.StackPanel.Orientation.VERTICAL}
                itemGap={component.StackPanel.GapSize.NONE}
                rootStyle={{
                    background: '#F7F8F9',
                    border: '1px solid #E2E3E5',
                    borderRadius: '10px',
                    padding: '18px 22px'
                } as never}
            >
                <component.StackPanel.Item>
                    <component.GridPanel
                        columns="220px 1fr"
                        rows="auto auto auto auto auto auto auto"
                        columnGap={component.GridPanel.GapSize.M}
                        rowGap={component.GridPanel.GapSize.S}
                    >
                        {cells as never}
                    </component.GridPanel>
                </component.StackPanel.Item>
            </component.StackPanel>
        );
    }

    render(): core.VDom.Node {
        const state = store.getState() as AppState;
        const s = state.step5;
        const consoleState = state.console;
        const snap = (consoleState.snapshot as ConfigSnapshot | null) || {};
        const assignments = (consoleState.assignments as AssignmentRow[] | null) || [];
        const preflight = (consoleState.preflight as PreflightCheck[] | null);

        // Activated state — no heading (the page header subtitle already
        // says "Step 5 of 5 — Test & activate", a second H2 was redundant).
        if (s.activated) {
            return (
                <component.StackPanel
                    orientation={component.StackPanel.Orientation.VERTICAL}
                    itemGap={component.StackPanel.GapSize.M}
                >
                    <component.StackPanel.Item>
                        <component.Text type={component.Text.Type.STRONG}>
                            ✓ Click-to-Call is active. Sales reps can now
                            use the phone icon on Customer, Lead, and
                            Contact records.
                        </component.Text>
                    </component.StackPanel.Item>
                    <component.StackPanel.Item>
                        <component.Button
                            label="Go to Admin Console"
                            type={component.Button.Type.PRIMARY}
                            action={(): void => { goToConsole(); }}
                        />
                    </component.StackPanel.Item>
                </component.StackPanel>
            );
        }

        // Loading state
        if (s.loading) {
            return (
                <component.StackPanel
                    orientation={component.StackPanel.Orientation.VERTICAL}
                    itemGap={component.StackPanel.GapSize.M}
                >
                    <component.StackPanel.Item>
                        {new component.Loader({
                            label: 'Running preflight checks…',
                            indeterminate: true
                        } as never) as never}
                    </component.StackPanel.Item>
                </component.StackPanel>
            );
        }

        // Review state — two columns side-by-side (Config review on the
        // left, Preflight checks on the right) so the admin can scan both
        // before deciding to activate.
        const allPassed = preflight !== null &&
            (preflight || []).every((c) => c.status === 'pass');

        // Left column — Configuration review
        const leftCol = (
            <component.StackPanel
                orientation={component.StackPanel.Orientation.VERTICAL}
                itemGap={component.StackPanel.GapSize.S}
            >
                <component.StackPanel.Item>
                    <component.Heading level={3}>Configuration review</component.Heading>
                </component.StackPanel.Item>
                <component.StackPanel.Item>
                    {this.renderReviewGrid(snap, assignments)}
                </component.StackPanel.Item>
            </component.StackPanel>
        );

        // Right column — Preflight checks
        const rightItems: core.VDom.Node[] = [];
        rightItems.push(
            <component.StackPanel.Item>
                <component.Heading level={3}>Preflight checks</component.Heading>
            </component.StackPanel.Item>
        );

        if (preflight === null) {
            rightItems.push(
                <component.StackPanel.Item>
                    <component.Text type={component.Text.Type.WEAK}>
                        (preflight has not run — click "Re-run preflight" below)
                    </component.Text>
                </component.StackPanel.Item>
            );
        } else if (preflight.length === 0) {
            rightItems.push(
                <component.StackPanel.Item>
                    <component.Text type={component.Text.Type.WEAK}>
                        (no checks returned)
                    </component.Text>
                </component.StackPanel.Item>
            );
        } else {
            const columns = this.buildCheckColumns();
            const ds = new core.ArrayDataSource(preflight);
            rightItems.push(
                <component.StackPanel.Item>
                    {new component.DataGrid({
                        dataSource: ds,
                        columns,
                        columnStretch: true,
                        highlightRowsOnHover: true,
                        stripedRows: true,
                        dataRowHeight: 56,
                        headerRowHeight: 36,
                        rootStyle: { width: '100%' }
                    } as never) as never}
                </component.StackPanel.Item>
            );
        }

        const rightCol = (
            <component.StackPanel
                orientation={component.StackPanel.Orientation.VERTICAL}
                itemGap={component.StackPanel.GapSize.S}
            >
                {rightItems as never}
            </component.StackPanel>
        );

        // Activate + Back/Re-run row, beneath the two columns.
        const items: core.VDom.Node[] = [];

        items.push(
            <component.StackPanel.Item>
                <component.GridPanel
                    columns="1fr 1fr"
                    rows="auto"
                    columnGap={component.GridPanel.GapSize.L}
                >
                    <component.GridPanel.Item>{leftCol}</component.GridPanel.Item>
                    <component.GridPanel.Item>{rightCol}</component.GridPanel.Item>
                </component.GridPanel>
            </component.StackPanel.Item>
        );

        items.push(
            <component.StackPanel.Item>
                <component.Button
                    label={allPassed
                        ? 'Activate Click-to-Call'
                        : 'Activate Click-to-Call (fix preflight first)'}
                    type={component.Button.Type.PRIMARY}
                    enabled={allPassed}
                    action={(): void => { this.activate(); }}
                />
            </component.StackPanel.Item>
        );

        if (s.activateError) {
            items.push(
                <component.StackPanel.Item>
                    <component.Text type={component.Text.Type.STRONG}>
                        ✕ Activation failed: {s.activateError}
                    </component.Text>
                </component.StackPanel.Item>
            );
        }

        items.push(
            <component.StackPanel.Item>
                <component.StackPanel
                    orientation={component.StackPanel.Orientation.HORIZONTAL}
                    itemGap={component.StackPanel.GapSize.M}
                >
                    <component.StackPanel.Item>
                        <component.Button
                            label="Back"
                            type={component.Button.Type.DEFAULT}
                            action={(): void => { goToStep(4); }}
                        />
                    </component.StackPanel.Item>
                    <component.StackPanel.Item>
                        <component.Button
                            label="Re-run preflight"
                            type={component.Button.Type.DEFAULT}
                            action={this.rerunPreflight}
                        />
                    </component.StackPanel.Item>
                </component.StackPanel>
            </component.StackPanel.Item>
        );

        return (
            <component.StackPanel
                orientation={component.StackPanel.Orientation.VERTICAL}
                itemGap={component.StackPanel.GapSize.L}
            >
                {items as never}
            </component.StackPanel>
        );
    }
}
