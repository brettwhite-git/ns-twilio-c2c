/**
 * Health page (U6) — JSX.
 *
 * Phase 4 (2026-05-28) — JSX rewrite of components/sections/health.ts.
 * Three sub-blocks stacked vertically:
 *   1. Preflight    — re-run button + check rows
 *   2. Drift        — 3 client-computed detector rows
 *   3. Danger zone  — Deactivate flow with two-click confirm
 */

import {PureComponent} from '@uif-js/core';
import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import {store} from '../../app/Store';
import {Action} from '../../app/Action';
import {deactivate} from '../../app/effects/console';
import {wizardCall} from '../../services/wizardApi';
import type {AppState} from '../../app/InitialState';

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

interface CheckRowProps {
    check: CheckItem;
}

const CheckRowItem = (props: CheckRowProps): core.VDom.Node => {
    const {check} = props;
    const status = check.status || 'info_enabled';
    const si = statusIcon(status);
    const sb = statusToBadge(status);

    return (
        <component.StackPanel
            orientation={component.StackPanel.Orientation.HORIZONTAL}
            alignment={component.StackPanel.Alignment.START}
            itemGap={component.StackPanel.GapSize.M}
        >
            <component.StackPanel.Item>
                <component.Image
                    image={si.icon as never}
                    size={component.Image.Size.M}
                    color={si.color as never}
                    presentation={true}
                />
            </component.StackPanel.Item>
            <component.StackPanel.Item>
                <component.StackPanel
                    orientation={component.StackPanel.Orientation.VERTICAL}
                    itemGap={component.StackPanel.GapSize.XXS}
                >
                    <component.StackPanel.Item>
                        <component.Text type={component.Text.Type.STRONG}>
                            {check.label || '(unlabeled check)'}
                        </component.Text>
                    </component.StackPanel.Item>
                    {check.detail ? (
                        <component.StackPanel.Item>
                            <component.Text
                                type={component.Text.Type.WEAK}
                                size={component.Text.Size.S}
                            >
                                {check.detail}
                            </component.Text>
                        </component.StackPanel.Item>
                    ) : null}
                </component.StackPanel>
            </component.StackPanel.Item>
            <component.StackPanel.Item>
                <component.Badge
                    content={sb.text}
                    type={component.Badge.Type.SUBTLE}
                    rootStyle={{
                        backgroundColor: sb.palette.bg,
                        color: sb.palette.fg,
                        border: '1px solid ' + sb.palette.border
                    }}
                />
            </component.StackPanel.Item>
        </component.StackPanel>
    );
};

export default class HealthPage extends PureComponent<unknown, unknown> {
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

        return (
            <component.StackPanel
                orientation={component.StackPanel.Orientation.VERTICAL}
                itemGap={component.StackPanel.GapSize.L}
            >
                {/* Preflight block */}
                <component.StackPanel.Item>
                    <component.StackPanel
                        orientation={component.StackPanel.Orientation.VERTICAL}
                        itemGap={component.StackPanel.GapSize.S}
                    >
                        <component.StackPanel.Item>
                            <component.Heading level={3}>Preflight</component.Heading>
                        </component.StackPanel.Item>
                        <component.StackPanel.Item>
                            <component.Button
                                label={refreshing ? 'Re-running…' : 'Re-run'}
                                startIcon={core.SystemIcon.REFRESH as never}
                                enabled={!refreshing}
                                action={(): void => { this.rerunPreflight(); }}
                            />
                        </component.StackPanel.Item>
                        {preflight === null || preflight === undefined ? (
                            <component.StackPanel.Item>
                                <component.Text type={component.Text.Type.WEAK}>
                                    Click "Re-run" to evaluate.
                                </component.Text>
                            </component.StackPanel.Item>
                        ) : preflight.length === 0 ? (
                            <component.StackPanel.Item>
                                <component.Text type={component.Text.Type.WEAK}>
                                    No checks returned.
                                </component.Text>
                            </component.StackPanel.Item>
                        ) : (
                            preflight.map((check, idx) => (
                                <component.StackPanel.Item key={'pf-' + (check.id || idx)}>
                                    <CheckRowItem check={check} />
                                </component.StackPanel.Item>
                            ))
                        )}
                    </component.StackPanel>
                </component.StackPanel.Item>

                {/* Drift block */}
                <component.StackPanel.Item>
                    <component.StackPanel
                        orientation={component.StackPanel.Orientation.VERTICAL}
                        itemGap={component.StackPanel.GapSize.S}
                    >
                        <component.StackPanel.Item>
                            <component.Heading level={3}>Drift detection</component.Heading>
                        </component.StackPanel.Item>
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
                        {driftRows.map((row, idx) => (
                            <component.StackPanel.Item key={'drift-' + idx}>
                                <CheckRowItem check={row} />
                            </component.StackPanel.Item>
                        ))}
                    </component.StackPanel>
                </component.StackPanel.Item>

                {/* Danger zone (hidden when paused) */}
                {!isPaused ? (
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
                            <component.StackPanel.Item>
                                <component.Heading level={3}>Danger zone</component.Heading>
                            </component.StackPanel.Item>
                            <component.StackPanel.Item>
                                <component.Text
                                    type={component.Text.Type.WEAK}
                                    size={component.Text.Size.S}
                                >
                                    Deactivate Click-to-Call: reps lose
                                    phone-icon access across all roles.
                                    In-progress calls finish normally; new
                                    calls cannot be placed. Reactivate any
                                    time.
                                </component.Text>
                            </component.StackPanel.Item>
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
                            {c.deactivateError ? (
                                <component.StackPanel.Item>
                                    <component.Text type={component.Text.Type.STRONG}>
                                        ✕ Deactivate failed: {c.deactivateError}
                                    </component.Text>
                                </component.StackPanel.Item>
                            ) : null}
                        </component.StackPanel>
                    </component.StackPanel.Item>
                ) : null}

                {c.actionError ? (
                    <component.StackPanel.Item>
                        <component.Text type={component.Text.Type.STRONG}>
                            ✕ {c.actionError}
                        </component.Text>
                    </component.StackPanel.Item>
                ) : null}
            </component.StackPanel>
        );
    }
}
