/**
 * Health page (U6) — JSX.
 *
 * Phase 4 (2026-05-28) — JSX rewrite of components/sections/health.ts.
 * Three sub-blocks stacked vertically:
 *   1. Preflight    — re-run button + DataGrid of check rows
 *   2. Drift        — DataGrid of 3 client-computed detector rows
 *   3. Danger zone  — Deactivate flow with two-click confirm
 *
 * Spike (2026-05-28) — DataGrid layout. Preflight + Drift now use the same
 * 4-column DataGrid pattern (Status icon / Check / Detail / Status badge),
 * matching the table-style of CredentialsPage / PhonesPage / VoicePage.
 */

import {PureComponent} from '@uif-js/core';
import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import {store} from '../../app/Store';
import {Action} from '../../app/Action';
import {deactivate} from '../../app/effects/console';
import {wizardCall} from '../../services/wizardApi';
import type {AppState} from '../../app/InitialState';
import type {PageTickProps} from '../../App';

interface CheckItem {
    id?: string;
    label?: string;
    status?: string;
    detail?: string;
}

interface DriftSnapshot {
    voiceUrl?: string;
    phoneNumbers?: string;
    intelService?: string;
}

interface CellArgs {
    cell?: { row?: { dataItem?: CheckItem } };
}

const statusToBadge = (status: string): { text: string; palette: { bg: string; fg: string; border: string } } => {
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

export default class HealthPage extends PureComponent<PageTickProps, unknown> {
    private rerunPreflight = async (): Promise<void> => {
        store.dispatch(Action.consoleLoadSuccess({ preflightRefreshing: true } as never));
        try {
            const payload = await wizardCall('wizardRunPreflight', {});
            const checks = payload && (payload as { checks?: unknown[] }).checks;
            store.dispatch(Action.consoleLoadSuccess({
                preflight: Array.isArray(checks) ? checks : []
            }));
        } catch (e) {
            const err = e as { message?: string };
            store.dispatch(Action.actionErrorSet(
                'Preflight failed: ' + (err.message || String(e))
            ));
        } finally {
            store.dispatch(Action.consoleLoadSuccess({ preflightRefreshing: false } as never));
        }
    };

    private cancelDeactivateConfirm = (): void => {
        store.dispatch(Action.deactivateSuccess());
        // deactivateSuccess clears pendingDeactivateConfirm in the
        // reducer; alternatively we could add a dedicated action.
        // Phase 7 cleanup: introduce DEACTIVATE_CONFIRM_CANCEL.
    };

    private requestDeactivate = (): void => {
        store.dispatch(Action.deactivateRequest());
    };

    private confirmDeactivate = (): void => {
        deactivate();
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
                    const row = args?.cell?.row?.dataItem;
                    const status = row?.status || 'info_enabled';
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
                stretchFactor: 4,
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
                stretchFactor: 6,
                content: (args: CellArgs): unknown => {
                    const row = args?.cell?.row?.dataItem;
                    return new component.Text({
                        text: row?.detail || '—',
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
                    const row = args?.cell?.row?.dataItem;
                    const status = row?.status || 'info_enabled';
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

    render(): core.VDom.Node {
        const state = store.getState() as AppState;
        const c = state.console;
        const preflight = c.preflight as CheckItem[] | null | undefined;
        const drift = (c.drift || {}) as DriftSnapshot;
        const snap = (c.snapshot || {}) as { active?: boolean };
        const isPaused = snap.active === false;
        const refreshing = !!c.preflightRefreshing;

        const driftRows: CheckItem[] = [
            { label: 'TwiML VoiceUrl', status: drift.voiceUrl || 'pass', detail: drift.voiceUrl === 'fail' ? 'VoiceUrl does not match the wizard\'s expected Suitelet URL' : '' },
            { label: 'Phone numbers', status: drift.phoneNumbers || 'pass', detail: drift.phoneNumbers === 'fail' ? 'A configured Twilio number is missing from the account' : '' },
            { label: 'Intel Service', status: drift.intelService || 'info_enabled', detail: '' }
        ];

        // Danger zone — flat items list. The red-bordered card wrapper
        // is added downstream in `outerItems` (this avoids the doubled-
        // border bug where both this list AND the outer wrapper carried
        // border styling). Hidden entirely when CTC is already paused —
        // the top banner already surfaces a Reactivate path.
        const dangerZoneItems = isPaused ? [] : [
            (
                <component.StackPanel.Item>
                    <component.Heading level={3}>Danger zone</component.Heading>
                </component.StackPanel.Item>
            ),
            (
                <component.StackPanel.Item>
                    <component.Text
                        type={component.Text.Type.WEAK}
                        size={component.Text.Size.S}
                    >
                        Deactivate cuts rep phone-icon access across all
                        roles. In-progress calls finish; new calls are
                        blocked. Reactivate any time.
                    </component.Text>
                </component.StackPanel.Item>
            ),
            (
                <component.StackPanel.Item>
                    {c.pendingDeactivateConfirm ? (
                        <component.StackPanel
                            orientation={component.StackPanel.Orientation.HORIZONTAL}
                            itemGap={component.StackPanel.GapSize.S}
                        >
                            <component.StackPanel.Item>
                                <component.Button
                                    label="Cancel"
                                    action={this.cancelDeactivateConfirm}
                                />
                            </component.StackPanel.Item>
                            <component.StackPanel.Item>
                                <component.Button
                                    label="Confirm deactivate"
                                    type={component.Button.Type.DANGER}
                                    action={this.confirmDeactivate}
                                />
                            </component.StackPanel.Item>
                        </component.StackPanel>
                    ) : (
                        <component.Button
                            label="Deactivate"
                            type={component.Button.Type.DANGER}
                            action={this.requestDeactivate}
                        />
                    )}
                </component.StackPanel.Item>
            ),
            c.deactivateError && (
                <component.StackPanel.Item>
                    <component.Text type={component.Text.Type.STRONG}>
                        ✕ Deactivate failed: {c.deactivateError}
                    </component.Text>
                </component.StackPanel.Item>
            )
        ].filter(Boolean);

        const columns = this.buildCheckColumns();

        /*
         * Preflight content — flat array of <StackPanel.Item> elements.
         * UIF's StackPanel rejects nested arrays-as-children.
         */
        const preflightContent: core.VDom.Node[] = [];
        preflightContent.push(
            (
                <component.StackPanel.Item>
                    <component.Heading level={3}>Preflight</component.Heading>
                </component.StackPanel.Item>
            ) as core.VDom.Node
        );
        if (preflight === null || preflight === undefined) {
            preflightContent.push(
                (
                    <component.StackPanel.Item>
                        <component.Text type={component.Text.Type.WEAK}>
                            Click "Re-run" to evaluate.
                        </component.Text>
                    </component.StackPanel.Item>
                ) as core.VDom.Node
            );
        } else if (preflight.length === 0) {
            preflightContent.push(
                (
                    <component.StackPanel.Item>
                        <component.Text type={component.Text.Type.WEAK}>
                            No checks returned.
                        </component.Text>
                    </component.StackPanel.Item>
                ) as core.VDom.Node
            );
        } else {
            const preflightDs = new core.ArrayDataSource(preflight);
            preflightContent.push(
                (
                    <component.StackPanel.Item>
                        {new component.DataGrid({
                            dataSource: preflightDs,
                            columns,
                            columnStretch: true,
                            highlightRowsOnHover: true,
                            stripedRows: true,
                            dataRowHeight: 64,
                            headerRowHeight: 40,
                            rootStyle: { width: '100%' }
                        } as never) as never}
                    </component.StackPanel.Item>
                ) as core.VDom.Node
            );
        }
        // Re-run button moved BELOW the table per the wireframe; styled
        // CTC brand navy (#2D4458) to match the credentials/secrets CTA.
        preflightContent.push(
            (
                <component.StackPanel.Item>
                    <component.Button
                        label={refreshing ? 'Re-running…' : 'Re-run preflight'}
                        type={component.Button.Type.PRIMARY}
                        startIcon={core.SystemIcon.REFRESH as never}
                        enabled={!refreshing}
                        action={(): void => { this.rerunPreflight(); }}
                        rootStyle={{
                            backgroundColor: '#2D4458',
                            color: '#FFFFFF',
                            borderColor: '#2D4458'
                        } as never}
                    />
                </component.StackPanel.Item>
            ) as core.VDom.Node
        );

        /*
         * Drift content — same flat-array pattern. driftRows always has 3
         * entries so always renders the DataGrid.
         */
        const driftContent: core.VDom.Node[] = [];
        driftContent.push(
            (
                <component.StackPanel.Item>
                    <component.Heading level={3}>Drift detection</component.Heading>
                </component.StackPanel.Item>
            ) as core.VDom.Node
        );
        driftContent.push(
            (
                <component.StackPanel.Item>
                    <component.Text
                        type={component.Text.Type.WEAK}
                        size={component.Text.Size.S}
                    >
                        Compares the saved wizard config against the
                        live Twilio account. Re-runs each time the
                        console mounts.
                    </component.Text>
                </component.StackPanel.Item>
            ) as core.VDom.Node
        );
        const driftDs = new core.ArrayDataSource(driftRows);
        driftContent.push(
            (
                <component.StackPanel.Item>
                    {new component.DataGrid({
                        dataSource: driftDs,
                        columns,
                        columnStretch: true,
                        highlightRowsOnHover: true,
                        stripedRows: true,
                        dataRowHeight: 64,
                        headerRowHeight: 40,
                        rootStyle: { width: '100%' }
                    } as never) as never}
                </component.StackPanel.Item>
            ) as core.VDom.Node
        );

        const outerItems = [
            /* Preflight block */
            (
                <component.StackPanel.Item>
                    <component.StackPanel
                        orientation={component.StackPanel.Orientation.VERTICAL}
                        itemGap={component.StackPanel.GapSize.S}
                    >
                        {preflightContent as never}
                    </component.StackPanel>
                </component.StackPanel.Item>
            ),
            /* Drift block */
            (
                <component.StackPanel.Item>
                    <component.StackPanel
                        orientation={component.StackPanel.Orientation.VERTICAL}
                        itemGap={component.StackPanel.GapSize.S}
                    >
                        {driftContent as never}
                    </component.StackPanel>
                </component.StackPanel.Item>
            ),
            /* Danger zone (hidden when paused) */
            !isPaused && (
                <component.StackPanel.Item>
                    <component.StackPanel
                        orientation={component.StackPanel.Orientation.VERTICAL}
                        itemGap={component.StackPanel.GapSize.S}
                        rootStyle={{
                            border: '1px solid #D33A2C',
                            borderRadius: '8px',
                            backgroundColor: '#FDF4F3',
                            padding: '16px 20px'
                        }}
                    >
                        {dangerZoneItems as never}
                    </component.StackPanel>
                </component.StackPanel.Item>
            ),
            c.actionError && (
                <component.StackPanel.Item>
                    <component.Text type={component.Text.Type.STRONG}>
                        ✕ {c.actionError}
                    </component.Text>
                </component.StackPanel.Item>
            )
        ].filter(Boolean);

        return (
            <component.StackPanel
                orientation={component.StackPanel.Orientation.VERTICAL}
                itemGap={component.StackPanel.GapSize.L}
            >
                {outerItems as never}
            </component.StackPanel>
        );
    }
}
