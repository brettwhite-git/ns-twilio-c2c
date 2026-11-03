/**
 * Health checks — JSX. Rendered on the Overview page below the KPIs and
 * quick actions (2026-11-01: the Health nav item and the Overview's
 * Recent activity block were removed; Deactivate lives in the quick
 * actions). Three sub-blocks stacked vertically:
 *   1. Preflight    — re-run button + DataGrid of check rows
 *   2. Drift        — DataGrid of 4 detector rows (VoiceUrl + outbound
 *                     notice version from wizardLoadOutbound; Phone
 *                     numbers + Intelligence service from wizardLoadHealth)
 *   3. Phones       — read-only DataGrid of each rep's browser phone
 *                     (wizardLoadPresence) + Refresh button
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
import {loadPresence} from '../../app/effects/presence';
import {loadOutbound} from '../../app/effects/outbound';
import {loadHealth} from '../../app/effects/health';
import {wizardCall} from '../../services/wizardApi';
import type {AppState, HealthSignal, HealthState, OutboundState, PresenceRow, PresenceState} from '../../app/InitialState';
import type {PageTickProps} from '../../App';
import {ErrorText} from '../shared/ErrorText';
import {buildLastSeenCell, buildPhoneStatusCell} from '../shared/phoneStatus';
import {formatPhone} from '../shared/formatPhone';
import {friendlyError} from '../shared/friendlyError';

interface CheckItem {
    id?: string;
    label?: string;
    status?: string;
    detail?: string;
}

interface DriftSnapshot {
    voiceUrl?: string;
}

interface ConfigSnapshot {
    phoneNumber?: string;
    intelServiceSid?: string;
}

interface TwilioNumber {
    sid?: string;
    phoneNumber?: string;
}

interface TwilioService {
    sid?: string;
}

interface AssignmentRef {
    phoneSid?: string;
    phoneNumber?: string;
}

interface CellArgs {
    cell?: { row?: { dataItem?: CheckItem } };
}

interface PresenceCellArgs {
    cell?: { row?: { dataItem?: PresenceRow } };
}

const statusToBadge = (status: string): { text: string; palette: { bg: string; fg: string; border: string } } => {
    switch (status) {
        case 'pass': return { text: 'Pass', palette: { bg: '#D4EDDA', fg: '#155724', border: '#A3D9AE' } };
        case 'fail': return { text: 'Fail', palette: { bg: '#F8D7DA', fg: '#721C24', border: '#F1B5BB' } };
        case 'warn': return { text: 'Warn', palette: { bg: '#FFF3CD', fg: '#856404', border: '#FFE69C' } };
        case 'info_enabled': return { text: 'Enabled', palette: { bg: '#CCE5FF', fg: '#004085', border: '#9FCDFF' } };
        case 'info_disabled': return { text: 'Disabled', palette: { bg: '#E2E3E5', fg: '#383D41', border: '#C7CACE' } };
        case 'unknown': return { text: 'Not checked', palette: { bg: '#E2E3E5', fg: '#383D41', border: '#C7CACE' } };
        case 'not_published': return { text: 'Not published', palette: { bg: '#E2E3E5', fg: '#383D41', border: '#C7CACE' } };
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

/**
 * The 'TwiML VoiceUrl' drift row: does the TwiML App's Voice URL point at
 * the published outbound Function (drift.voiceUrl from wizardLoadOutbound)?
 * 'unknown' shows as a neutral "Not checked", never as a pass.
 */
export const voiceUrlDriftRow = (drift: DriftSnapshot, outbound: OutboundState): CheckItem => {
    const row = { label: 'TwiML VoiceUrl' };
    if (outbound.loaded && !outbound.published) {
        return { ...row, status: 'not_published', detail: '' };
    }
    // The app can still point at a Function that was deleted in Twilio:
    // then every outbound call fails, so this is not a pass.
    if (outbound.functionExists === false) {
        return { ...row, status: 'fail', detail: outbound.functionMessage ||
            'The outbound Function is missing in Twilio. Publish again.' };
    }
    if (drift.voiceUrl === 'pass') return { ...row, status: 'pass', detail: '' };
    if (drift.voiceUrl === 'fail') {
        return { ...row, status: 'fail', detail: 'Voice URL does not point at the published Function.' };
    }
    return { ...row, status: 'unknown', detail: '' };
};

/**
 * The 'Outbound notice version' row: is the published Function the
 * SuiteApp's current code version (needsRepublish from wizardLoadOutbound)?
 */
export const outboundVersionRow = (outbound: OutboundState): CheckItem => {
    const row = { label: 'Outbound notice version' };
    if (!outbound.loaded) return { ...row, status: 'unknown', detail: '' };
    if (!outbound.published) return { ...row, status: 'not_published', detail: '' };
    if (outbound.needsRepublish) {
        return { ...row, status: 'warn', detail: 'A newer version is available. Republish on the Voice page.' };
    }
    return {
        ...row,
        status: 'pass',
        // The version Twilio plays, not the saved one.
        detail: outbound.publishedNoticeVersion ? 'Notice v' + outbound.publishedNoticeVersion : ''
    };
};

/**
 * A health signal (wizardLoadHealth) as a drift row status, or null when
 * the signal is missing or 'unknown' (the caller then falls back to the
 * data the console already has).
 */
export const signalRow = (label: string, sig: HealthSignal | undefined): CheckItem | null => {
    if (!sig || sig.severity === 'unknown') return null;
    const status = sig.severity === 'ok' ? 'pass' : sig.severity === 'problem' ? 'fail' : 'warn';
    return { label, status, detail: sig.detail };
};

/**
 * The 'Phone numbers' drift row: are the default caller ID and every
 * routed number still in the Twilio account, and (inbound on) on the
 * routing flow? Uses the health signal numberRouting (one Twilio list
 * read by wizardLoadHealth). Without it, computed from data the console
 * already has (the Phones & reps Twilio list); without that list the
 * row is a neutral "Not checked", never a pass.
 */
export const phoneNumbersDriftRow = (c: AppState['console'], health?: HealthState): CheckItem => {
    const fromSignal = signalRow('Phone numbers', health && health.signals.numberRouting);
    if (fromSignal) return fromSignal;
    const row = { label: 'Phone numbers' };
    const numbers = c.phonesNumbers as TwilioNumber[] | null;
    if (c.phonesListError) {
        return { ...row, status: 'unknown', detail: 'The Twilio number list did not load: ' + friendlyError(c.phonesListError) };
    }
    if (numbers === null || c.assignments === null) {
        return { ...row, status: 'unknown', detail: 'Open Phones & reps to check the numbers against Twilio.' };
    }
    const sids: Record<string, boolean> = {};
    const e164s: Record<string, boolean> = {};
    numbers.forEach((n) => {
        if (n.sid) sids[n.sid] = true;
        if (n.phoneNumber) e164s[n.phoneNumber] = true;
    });
    const missing: string[] = [];
    const snap = (c.snapshot || {}) as ConfigSnapshot;
    if (snap.phoneNumber && !e164s[snap.phoneNumber]) missing.push(formatPhone(snap.phoneNumber));
    const seen: Record<string, boolean> = {};
    (c.assignments as AssignmentRef[]).forEach((a) => {
        if (!a.phoneSid || seen[a.phoneSid]) return;
        seen[a.phoneSid] = true;
        if (!sids[a.phoneSid]) missing.push(formatPhone(a.phoneNumber) || a.phoneSid);
    });
    if (missing.length === 0) {
        return { ...row, status: 'pass', detail: 'The default caller ID and every assigned number are in Twilio.' };
    }
    if (c.phonesHasMore) {
        return { ...row, status: 'unknown', detail: 'Twilio lists more numbers than were loaded; not checked.' };
    }
    return { ...row, status: 'fail', detail: 'Not in the Twilio account: ' + missing.join(', ') };
};

/**
 * The 'Intelligence service' drift row: is the saved service in the
 * Twilio account with auto-transcribe on? Uses the health signal
 * intelligence (wizardLoadHealth). Without it, only with real data (the
 * Voice page's Twilio list); else a neutral "Not checked".
 */
export const intelDriftRow = (c: AppState['console'], health?: HealthState): CheckItem => {
    const fromSignal = signalRow('Intelligence service', health && health.signals.intelligence);
    if (fromSignal) return fromSignal;
    const row = { label: 'Intelligence service' };
    const snap = (c.snapshot || {}) as ConfigSnapshot;
    if (c.snapshot && !snap.intelServiceSid) {
        return { ...row, status: 'info_disabled', detail: 'No Intelligence service is set (no transcripts).' };
    }
    const services = c.voiceLists.intelServices as TwilioService[] | null;
    if (c.voiceListErrors.intelServices || services === null || !snap.intelServiceSid) {
        return { ...row, status: 'unknown', detail: '' };
    }
    return services.some((sv) => sv.sid === snap.intelServiceSid)
        ? { ...row, status: 'pass', detail: '' }
        : { ...row, status: 'fail', detail: 'The saved service is not in the Twilio account.' };
};

export default class HealthChecks extends PureComponent<PageTickProps, unknown> {
    componentDidMount(): void {
        loadPresence();
        // Health read model: Phone numbers + Intelligence rows here, and
        // the Overview "Needs attention" list.
        loadHealth();
        // The VoiceUrl drift row comes from the outbound notice load.
        const outbound = (store.getState() as AppState).outbound;
        if (!outbound.loaded && !outbound.loading) {
            loadOutbound();
        }
    }

    private buildPresenceColumns(nowMs: number): unknown[] {
        const CT = (component.DataGrid as unknown as { ColumnType: Record<string, unknown> }).ColumnType;
        return [
            {
                type: CT.TEMPLATED,
                name: 'rep',
                label: 'Rep',
                stretchFactor: 3,
                content: (args: PresenceCellArgs): unknown => new component.Text({
                    text: args?.cell?.row?.dataItem?.employeeName || '(unnamed rep)',
                    type: component.Text.Type.STRONG
                })
            },
            {
                type: CT.TEMPLATED,
                name: 'status',
                label: 'Status',
                stretchFactor: 3,
                content: (args: PresenceCellArgs): unknown => buildPhoneStatusCell(args?.cell?.row?.dataItem)
            },
            {
                type: CT.TEMPLATED,
                name: 'lastSeen',
                label: 'Last seen',
                stretchFactor: 2,
                content: (args: PresenceCellArgs): unknown => buildLastSeenCell(args?.cell?.row?.dataItem, nowMs)
            }
        ];
    }

    private buildPhonesContent(presence: PresenceState): core.VDom.Node[] {
        const content: core.VDom.Node[] = [];
        const push = (node: unknown): void => {
            content.push(
                (<component.StackPanel.Item>{node as never}</component.StackPanel.Item>) as core.VDom.Node
            );
        };
        push(<component.Heading level={3}>Phones</component.Heading>);
        if (presence.error) {
            push(<ErrorText message={presence.error} />);
        }
        if (!presence.loaded) {
            if (!presence.error) {
                push(
                    <component.Text type={component.Text.Type.WEAK}>
                        Loading phones…
                    </component.Text>
                );
            }
        } else if (presence.items.length === 0) {
            push(
                <component.Text type={component.Text.Type.WEAK}>
                    No reps have phones yet.
                </component.Text>
            );
        } else {
            const nowMs = Date.now() + presence.clockSkewMs;
            push(new component.DataGrid({
                dataSource: new core.ArrayDataSource(presence.items),
                columns: this.buildPresenceColumns(nowMs),
                columnStretch: true,
                highlightRowsOnHover: true,
                stripedRows: true,
                dataRowHeight: 48,
                headerRowHeight: 40,
                rootStyle: { width: '100%' }
            } as never));
        }
        push(new component.Button({
            label: presence.loading ? 'Refreshing…' : 'Refresh',
            startIcon: core.SystemIcon.REFRESH,
            enabled: !presence.loading,
            action: (): void => { loadPresence(); }
        } as never));
        return content;
    }

    private rerunPreflight = async (): Promise<void> => {
        store.dispatch(Action.consolePatch({ preflightRefreshing: true, preflightError: null }));
        try {
            const payload = await wizardCall('wizardRunPreflight', {});
            const checks = payload && (payload as { checks?: unknown[] }).checks;
            if (Array.isArray(checks)) {
                store.dispatch(Action.consolePatch({ preflight: checks }));
            } else {
                const p = (payload || {}) as { error?: string; errorMessage?: string };
                store.dispatch(Action.consolePatch({
                    preflightError: p.errorMessage || p.error || 'Preflight did not return any checks'
                }));
            }
        } catch (e) {
            const err = e as { message?: string };
            store.dispatch(Action.consolePatch({
                preflightError: 'Network: ' + (err.message || String(e))
            }));
        } finally {
            store.dispatch(Action.consolePatch({ preflightRefreshing: false }));
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
                    const row = args?.cell?.row?.dataItem;
                    const status = row?.status || 'unknown';
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
                    const status = row?.status || 'unknown';
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
        // The first console load runs preflight too: show it as running.
        const refreshing = !!c.preflightRefreshing || (c.loading && preflight === null);

        // Every row is computed from real data or shows "Not checked".
        const driftRows: CheckItem[] = [
            voiceUrlDriftRow(drift, state.outbound),
            outboundVersionRow(state.outbound),
            phoneNumbersDriftRow(c, state.health),
            intelDriftRow(c, state.health)
        ];

        const columns = this.buildCheckColumns();
        const phonesContent = this.buildPhonesContent(state.presence);

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
        if (c.preflightError) {
            preflightContent.push(
                (
                    <component.StackPanel.Item>
                        <ErrorText message={'Preflight did not run: ' + friendlyError(c.preflightError)} />
                    </component.StackPanel.Item>
                ) as core.VDom.Node
            );
        }
        if (preflight === null || preflight === undefined) {
            preflightContent.push(
                (
                    <component.StackPanel.Item>
                        <component.Text type={component.Text.Type.WEAK}>
                            {refreshing
                                ? 'Running preflight checks…'
                                : 'Click "Re-run preflight" to evaluate.'}
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
         * Drift content — same flat-array pattern. driftRows always has 4
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
            /* Phones block */
            (
                <component.StackPanel.Item>
                    <component.StackPanel
                        orientation={component.StackPanel.Orientation.VERTICAL}
                        itemGap={component.StackPanel.GapSize.S}
                    >
                        {phonesContent as never}
                    </component.StackPanel>
                </component.StackPanel.Item>
            ),
            c.actionError && (
                <component.StackPanel.Item>
                    <component.Text type={component.Text.Type.STRONG}>
                        {'✕ ' + friendlyError(c.actionError)}
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
