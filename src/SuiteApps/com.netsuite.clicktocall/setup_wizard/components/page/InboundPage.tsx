/**
 * Inbound calls page — JSX.
 *
 * Settings (Switch, ring-time Dropdown, no-answer TextArea, voicemail
 * Switch + length Dropdown, fallback-owner Dropdown, recording
 * Switches + notice TextArea) plus
 * "Save & publish", a publish status line, and a read-only DataGrid of
 * the routing (number → primary rep). Form controls are JSX so the
 * VDom keeps their focus across the per-keystroke re-render; the
 * DataGrid / Loader use the imperative `new X({...} as never)` form
 * the other pages use.
 */

import {PureComponent} from '@uif-js/core';
import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import {store} from '../../app/Store';
import {Action} from '../../app/Action';
import {loadInbound, publishRouting, saveInbound} from '../../app/effects/inbound';
import {loadPresence} from '../../app/effects/presence';
import type {AppState, InboundRoute, InboundState, PresenceRow} from '../../app/InitialState';
import type {PageTickProps} from '../../App';
import {ErrorText} from '../shared/ErrorText';
import {formatPhone} from '../shared/formatPhone';
import {buildPhoneStatusCell} from '../shared/phoneStatus';

export const DEFAULT_NO_ANSWER_MESSAGE =
    'Sorry, no one is available to take your call. Please try again later. Goodbye.';
export const DEFAULT_VOICEMAIL_GREETING =
    'Sorry, no one is available. Please leave a message after the tone.';
/** Voicemail length choices (seconds), inside the server's 30-300 range. */
export const VOICEMAIL_SECONDS = [30, 60, 120, 180, 300];
export const NO_ANSWER_MAX_LENGTH = 300;
export const DEFAULT_RECORDING_NOTICE = 'This call may be recorded for quality and training.';
export const RECORDING_NOTICE_MAX_LENGTH = 300;
const RING_SECONDS = [10, 15, 20, 25, 30, 45, 60];

/** '30 seconds', '1 minute', '2 minutes', '90 seconds'. */
export const voicemailLengthLabel = (seconds: number): string => {
    if (seconds % 60 !== 0) return seconds + ' seconds';
    const minutes = seconds / 60;
    return minutes + (minutes === 1 ? ' minute' : ' minutes');
};

interface CellArgs {
    cell?: { row?: { dataItem?: InboundRoute } };
}

/** "Published <local date time> · N numbers" / "Not published yet" / inbound off. */
export const statusLine = (inbound: InboundState): string => {
    const last = inbound.lastPublish;
    if (last && last.skipped === 'inbound_off') {
        return 'Inbound is off — routing not published';
    }
    if (!inbound.publishedAt) return 'Not published yet';
    const when = new Date(inbound.publishedAt);
    const whenText = isNaN(when.getTime()) ? inbound.publishedAt : when.toLocaleString();
    const count = last && last.ok && typeof last.numbersUpdated === 'number'
        ? ' · ' + last.numbersUpdated + (last.numbersUpdated === 1 ? ' number' : ' numbers')
        : '';
    return 'Published ' + whenText + count;
};

const item = (node: core.VDom.Node | false | null | undefined): core.VDom.Node | false =>
    node ? <component.StackPanel.Item>{node as never}</component.StackPanel.Item> : false;

const vstack = (
    gap: unknown,
    nodes: Array<core.VDom.Node | false | null | undefined>
): core.VDom.Node => (
    <component.StackPanel
        orientation={component.StackPanel.Orientation.VERTICAL}
        itemGap={gap as never}
    >
        {nodes.map(item).filter(Boolean) as never}
    </component.StackPanel>
);

const weak = (text: string): core.VDom.Node => (
    <component.Text type={component.Text.Type.WEAK} size={component.Text.Size.S}>
        {text}
    </component.Text>
);

export default class InboundPage extends PureComponent<PageTickProps, unknown> {
    componentDidMount(): void {
        const inbound = (store.getState() as AppState).inbound;
        if (!inbound.loaded && !inbound.loading) {
            loadInbound();
        }
        // Phone status is live data: reload it every time the page opens.
        loadPresence();
    }

    private buildColumns(): unknown[] {
        const CT = (component.DataGrid as unknown as { ColumnType: Record<string, unknown> }).ColumnType;
        const presence = (store.getState() as AppState).presence;
        const byEmployee: Record<string, PresenceRow> = {};
        presence.items.forEach((p) => { byEmployee[p.employeeId] = p; });
        return [
            {
                type: CT.TEMPLATED,
                name: 'number',
                label: 'Number',
                stretchFactor: 1,
                content: (args: CellArgs): unknown => new component.Text({
                    text: formatPhone(args?.cell?.row?.dataItem?.phoneNumber),
                    type: component.Text.Type.STRONG
                })
            },
            {
                type: CT.TEMPLATED,
                name: 'rings',
                label: 'Rings',
                stretchFactor: 1,
                content: (args: CellArgs): unknown => new component.Text({
                    text: args?.cell?.row?.dataItem?.employeeName || ''
                })
            },
            {
                type: CT.TEMPLATED,
                name: 'phone',
                label: 'Phone',
                stretchFactor: 1,
                content: (args: CellArgs): unknown => {
                    if (!presence.loaded) {
                        return new component.Text({
                            text: presence.error ? '—' : 'Loading…',
                            type: component.Text.Type.WEAK
                        });
                    }
                    const id = args?.cell?.row?.dataItem?.employeeId;
                    return buildPhoneStatusCell(id == null ? undefined : byEmployee[String(id)]);
                }
            }
        ];
    }

    private renderSettings(inbound: InboundState): core.VDom.Node {
        const busy = inbound.saving || inbound.publishing;
        const ringOptions = RING_SECONDS.indexOf(inbound.ringSeconds) >= 0
            ? RING_SECONDS
            : RING_SECONDS.concat([inbound.ringSeconds]).sort((x, y) => x - y);
        const ringDs = new core.ArrayDataSource(
            ringOptions.map((n) => ({ value: n, label: n + ' seconds' }))
        );

        const inboundSwitch = vstack(component.StackPanel.GapSize.XXS, [
            <component.Switch
                label="Ring reps in the browser"
                value={inbound.inboundEnabled}
                action={(args: { value?: boolean }): void => {
                    store.dispatch(Action.inboundFieldChange({ inboundEnabled: !!(args && args.value) }));
                }}
            />,
            !inbound.inboundEnabled &&
                weak('Off: phones do not ring; callers hear the no-answer message.'),
            weak('Open phones pick up a change within an hour, or at once after a reload.')
        ]);

        const ringTime = vstack(component.StackPanel.GapSize.XXS, [
            <component.Text type={component.Text.Type.STRONG}>Ring time</component.Text>,
            <component.Dropdown
                dataSource={ringDs as never}
                valueMember="value"
                displayMember="label"
                selectedValue={inbound.ringSeconds}
                onSelectionChanged={(args: { value?: unknown }): void => {
                    const n = Number(args && args.value);
                    if (n > 0) store.dispatch(Action.inboundFieldChange({ ringSeconds: n }));
                }}
                rootStyle={{width: '200px'} as never}
            />
        ]);

        const message = vstack(component.StackPanel.GapSize.XXS, [
            <component.Text type={component.Text.Type.STRONG}>No-answer message</component.Text>,
            <component.TextArea
                text={inbound.noAnswerMessage}
                placeholder={inbound.voicemailOn ? DEFAULT_VOICEMAIL_GREETING : DEFAULT_NO_ANSWER_MESSAGE}
                maxLength={NO_ANSWER_MAX_LENGTH}
                rowCount={3}
                onTextChanged={(args: { text?: string } | undefined): void => {
                    store.dispatch(Action.inboundFieldChange({
                        noAnswerMessage: ((args && args.text) || '').slice(0, NO_ANSWER_MAX_LENGTH)
                    }));
                }}
                rootStyle={{width: '100%'} as never}
            />
        ]);

        const vmOptions = VOICEMAIL_SECONDS.indexOf(inbound.voicemailMaxSeconds) >= 0
            ? VOICEMAIL_SECONDS
            : VOICEMAIL_SECONDS.concat([inbound.voicemailMaxSeconds]).sort((x, y) => x - y);
        const vmDs = new core.ArrayDataSource(
            vmOptions.map((n) => ({ value: n, label: voicemailLengthLabel(n) }))
        );
        const voicemail = vstack(component.StackPanel.GapSize.S, [
            vstack(component.StackPanel.GapSize.XXS, [
                <component.Switch
                    label="Voicemail"
                    value={inbound.voicemailOn}
                    action={(args: { value?: boolean }): void => {
                        store.dispatch(Action.inboundFieldChange({ voicemailOn: !!(args && args.value) }));
                    }}
                />,
                weak(inbound.voicemailOn
                    ? 'After the no-answer message, callers can leave a voicemail. It is transcribed and logged as a Phone Call.'
                    : 'Off: callers hear the no-answer message and the call ends.')
            ]),
            vstack(component.StackPanel.GapSize.XXS, [
                <component.Text type={component.Text.Type.STRONG}>Longest voicemail</component.Text>,
                <component.Dropdown
                    dataSource={vmDs as never}
                    valueMember="value"
                    displayMember="label"
                    selectedValue={inbound.voicemailMaxSeconds}
                    enabled={inbound.voicemailOn}
                    onSelectionChanged={(args: { value?: unknown }): void => {
                        const n = Number(args && args.value);
                        if (n > 0) store.dispatch(Action.inboundFieldChange({ voicemailMaxSeconds: n }));
                    }}
                    rootStyle={{width: '200px'} as never}
                />
            ])
        ]);

        const ownerChoices = [{ value: '', label: 'Not set' }].concat(
            inbound.employees.map((e) => ({ value: e.id, label: e.name }))
        );
        const fallbackOwner = vstack(component.StackPanel.GapSize.XXS, [
            <component.Text type={component.Text.Type.STRONG}>Unrouted calls and voicemails go to</component.Text>,
            <component.Dropdown
                dataSource={new core.ArrayDataSource(ownerChoices) as never}
                valueMember="value"
                displayMember="label"
                selectedValue={inbound.fallbackOwnerId}
                onSelectionChanged={(args: { value?: unknown }): void => {
                    const v = args && args.value != null ? String(args.value) : '';
                    store.dispatch(Action.inboundFieldChange({ fallbackOwnerId: v }));
                }}
                rootStyle={{width: '320px'} as never}
            />,
            weak('Also used when a number has no rep, or its rep is inactive. Not set: those calls are not logged.')
        ]);

        const showNotice = inbound.recordInbound && inbound.recordingNoticeOn;
        const recording = vstack(component.StackPanel.GapSize.S, [
            <component.Text type={component.Text.Type.STRONG}>Recording</component.Text>,
            vstack(component.StackPanel.GapSize.XXS, [
                <component.Switch
                    label="Record inbound calls"
                    value={inbound.recordInbound}
                    action={(args: { value?: boolean }): void => {
                        store.dispatch(Action.inboundFieldChange({ recordInbound: !!(args && args.value) }));
                    }}
                />,
                weak('Recordings are transcribed and summarised like outbound calls.')
            ]),
            vstack(component.StackPanel.GapSize.XXS, [
                <component.Switch
                    label="Play a recording notice first"
                    value={inbound.recordingNoticeOn}
                    enabled={inbound.recordInbound}
                    action={(args: { value?: boolean }): void => {
                        store.dispatch(Action.inboundFieldChange({ recordingNoticeOn: !!(args && args.value) }));
                    }}
                />,
                weak('Callers hear this before the phone rings.')
            ]),
            showNotice && vstack(component.StackPanel.GapSize.XXS, [
                <component.Text type={component.Text.Type.STRONG}>Recording notice</component.Text>,
                <component.TextArea
                    text={inbound.recordingNotice}
                    placeholder={DEFAULT_RECORDING_NOTICE}
                    maxLength={RECORDING_NOTICE_MAX_LENGTH}
                    rowCount={2}
                    enabled={showNotice}
                    onTextChanged={(args: { text?: string } | undefined): void => {
                        store.dispatch(Action.inboundFieldChange({
                            recordingNotice: ((args && args.text) || '').slice(0, RECORDING_NOTICE_MAX_LENGTH)
                        }));
                    }}
                    rootStyle={{width: '100%'} as never}
                />
            ])
        ]);

        const saveButton = new component.Button({
            label: inbound.saving ? 'Publishing…' : 'Save & publish',
            type: component.Button.Type.PRIMARY,
            enabled: !busy,
            action: (): void => { saveInbound(); }
        } as never);

        const errors = (inbound.lastPublish && inbound.lastPublish.errors) || [];

        return (
            <component.StackPanel
                orientation={component.StackPanel.Orientation.VERTICAL}
                itemGap={component.StackPanel.GapSize.L}
                rootStyle={{maxWidth: '560px'} as never}
            >
                {[
                    item(inboundSwitch),
                    item(ringTime),
                    item(message),
                    item(voicemail),
                    item(fallbackOwner),
                    item(recording),
                    item(saveButton as never),
                    item(inbound.saveError ? <ErrorText message={inbound.saveError} /> : false),
                    item(vstack(component.StackPanel.GapSize.XXS, [
                        <component.Text type={component.Text.Type.WEAK}>
                            {statusLine(inbound)}
                        </component.Text>,
                        ...errors.map((e) => (
                            <ErrorText message={formatPhone(e.phoneNumber) + ': ' + e.message} />
                        ))
                    ]))
                ].filter(Boolean) as never}
            </component.StackPanel>
        );
    }

    private renderRouting(inbound: InboundState): core.VDom.Node {
        const busy = inbound.saving || inbound.publishing;
        const table = inbound.routes.length === 0
            ? <component.Text type={component.Text.Type.WEAK}>
                {'No numbers have reps yet. Assign reps on Phones & reps.'}
            </component.Text>
            : new component.DataGrid({
                dataSource: new core.ArrayDataSource(inbound.routes),
                columns: this.buildColumns(),
                columnStretch: true,
                highlightRowsOnHover: true,
                stripedRows: true,
                dataRowHeight: 48,
                headerRowHeight: 40,
                rootStyle: { width: '100%' }
            } as never) as never;

        return vstack(component.StackPanel.GapSize.S, [
            table as core.VDom.Node,
            weak('The primary rep on Phones & reps is the one who rings.'),
            new component.Button({
                label: 'Publish again',
                enabled: !busy,
                action: (): void => { publishRouting(); }
            } as never) as never
        ]);
    }

    render(): core.VDom.Node {
        const inbound = (store.getState() as AppState).inbound;

        const description = (
            <component.Text type={component.Text.Type.WEAK}>
                Calls to your Twilio numbers ring the number's primary rep in
                the browser. NetSuite publishes one Twilio Studio flow for all
                numbers.
            </component.Text>
        );

        if (inbound.loading || (!inbound.loaded && !inbound.loadError)) {
            return vstack(component.StackPanel.GapSize.L, [
                description,
                new component.Loader({
                    label: 'Loading inbound settings…',
                    indeterminate: true
                } as never) as never
            ]);
        }

        if (!inbound.loaded) {
            return vstack(component.StackPanel.GapSize.L, [
                description,
                <ErrorText message={inbound.loadError || 'Could not load inbound settings'} />,
                new component.Button({
                    label: 'Retry',
                    startIcon: core.SystemIcon.REFRESH,
                    action: (): void => { loadInbound(); }
                } as never) as never
            ]);
        }

        return vstack(component.StackPanel.GapSize.XL, [
            description,
            this.renderSettings(inbound),
            this.renderRouting(inbound)
        ]);
    }
}
