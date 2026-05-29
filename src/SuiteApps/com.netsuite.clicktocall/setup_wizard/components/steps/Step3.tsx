/**
 * Step 3 — Voice configuration (JSX, table layout).
 *
 * Phase A.7 (2026-05-29) — restructured into a 4-column table mirroring
 * Step 2 + the Voice console page: Field | Docs | Description | Value.
 * The Value column holds a Dropdown per row populated from live Twilio
 * API calls (TwiML Apps, Phone Numbers, Conversational Intelligence
 * Services).
 *
 * componentDidMount fires loadStep3Lists which dispatches into the
 * Store; render reacts to state.step3.{twimlApps,phoneNumbers,intelServices}
 * settling.
 *
 * Pattern reference: components/page/VoicePage.tsx (read+edit table) and
 * components/steps/Step2.tsx (editable table).
 */

import {PureComponent} from '@uif-js/core';
import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import {store} from '../../app/Store';
import {Action} from '../../app/Action';
import {loadStep3Lists} from '../../app/effects/steps';
import {WizardNavFooter} from '../shared/WizardNavFooter';
import type {AppState, Step3State} from '../../app/InitialState';
import type {PageTickProps} from '../../App';

interface TwilioItem {
    sid?: string;
    friendlyName?: string;
    phoneNumber?: string;
}

interface NormalizedOption {
    value: string;
    label: string;
}

const TWILIO_DOCS = {
    twimlApp: 'https://www.twilio.com/docs/usage/api/applications',
    phoneNumber:
        'https://www.twilio.com/docs/phone-numbers/api/incomingphonenumber-resource',
    intelService: 'https://www.twilio.com/docs/voice/intelligence'
};

interface RowSpec {
    field: keyof Step3State;
    label: string;
    description: string;
    docUrl: string;
    allowEmpty: boolean;
    listKey: 'twimlApps' | 'phoneNumbers' | 'intelServices';
    toOption: (item: TwilioItem) => NormalizedOption;
}

const ROWS: RowSpec[] = [
    {
        field: 'twimlAppSid',
        label: 'TwiML Application',
        description:
            'The Twilio application that handles outbound call routing. ' +
            'The wizard registers this app\'s VoiceUrl with the CTC ' +
            'Suitelet on activate.',
        docUrl: TWILIO_DOCS.twimlApp,
        allowEmpty: false,
        listKey: 'twimlApps',
        toOption: (ti) => ({
            value: ti.sid || '',
            label: (ti.friendlyName || '(unnamed)') +
                (ti.sid ? '  [' + ti.sid + ']' : '')
        })
    },
    {
        field: 'phoneNumber',
        label: 'Default outbound caller ID',
        description:
            'The number reps see as their caller ID when placing a call. ' +
            'Specific rep-to-number assignments in Step 4 override this ' +
            'default.',
        docUrl: TWILIO_DOCS.phoneNumber,
        allowEmpty: false,
        listKey: 'phoneNumbers',
        toOption: (n) => ({
            value: n.phoneNumber || '',
            label: (n.phoneNumber || '') +
                (n.friendlyName ? ' — ' + n.friendlyName : '')
        })
    },
    {
        field: 'intelServiceSid',
        label: 'Conversational Intelligence',
        description:
            'Optional. Twilio Voice Intelligence service that produces ' +
            'transcripts and AI summaries. Leave blank to disable post-' +
            'call analysis.',
        docUrl: TWILIO_DOCS.intelService,
        allowEmpty: true,
        listKey: 'intelServices',
        toOption: (ti) => ({
            value: ti.sid || '',
            label: (ti.friendlyName || '(unnamed)') +
                (ti.sid ? '  [' + ti.sid + ']' : '')
        })
    }
];

export default class Step3 extends PureComponent<PageTickProps, unknown> {
    componentDidMount(): void {
        loadStep3Lists();
    }

    private dispatchField = (field: keyof Step3State, value: unknown): void => {
        store.dispatch(Action.step3FieldChange(field, value));
    };

    render(): core.VDom.Node {
        const state = store.getState() as AppState;
        const s = state.step3;

        const heading = (
            <component.StackPanel.Item>
                <component.Heading level={2}>Voice configuration</component.Heading>
            </component.StackPanel.Item>
        );
        const intro = (
            <component.StackPanel.Item>
                <component.Text>
                    Pick the TwiML application, default outbound caller ID,
                    and Conversational Intelligence service from your Twilio
                    account. These are fetched live using the secure API
                    Secret configured in Step 2 — the secret value never
                    leaves NetSuite's vault.
                </component.Text>
            </component.StackPanel.Item>
        );

        // Loading state
        if (s.twimlApps === null || s.phoneNumbers === null || s.intelServices === null) {
            return (
                <component.StackPanel
                    orientation={component.StackPanel.Orientation.VERTICAL}
                    itemGap={component.StackPanel.GapSize.M}
                >
                    {heading}
                    {intro}
                    <component.StackPanel.Item>
                        {new component.Loader({
                            label: 'Loading from Twilio…',
                            indeterminate: true
                        } as never) as never}
                    </component.StackPanel.Item>
                    <component.StackPanel.Item>
                        <WizardNavFooter tick={this.props.tick} />
                    </component.StackPanel.Item>
                </component.StackPanel>
            );
        }

        // Error state
        if (s.listLoadError) {
            return (
                <component.StackPanel
                    orientation={component.StackPanel.Orientation.VERTICAL}
                    itemGap={component.StackPanel.GapSize.M}
                >
                    {heading}
                    {intro}
                    <component.StackPanel.Item>
                        <component.Text type={component.Text.Type.STRONG}>
                            ✕ Could not load Twilio lists: {s.listLoadError}.
                            Verify the API Secret value is set at Setup &gt;
                            Company &gt; API Secrets, then go back to Step 2
                            and Continue again to retry.
                        </component.Text>
                    </component.StackPanel.Item>
                    <component.StackPanel.Item>
                        <WizardNavFooter tick={this.props.tick} />
                    </component.StackPanel.Item>
                </component.StackPanel>
            );
        }

        // Loaded — build the table cells imperatively.
        const pushHeader = (cells: core.VDom.Node[], text: string): void => {
            cells.push(
                <component.GridPanel.Item>
                    <component.Text
                        type={component.Text.Type.WEAK}
                        size={component.Text.Size.S}
                    >
                        {text}
                    </component.Text>
                </component.GridPanel.Item>
            );
        };

        const allCells: core.VDom.Node[] = [];
        pushHeader(allCells, 'Field');
        pushHeader(allCells, 'Docs');
        pushHeader(allCells, 'Description');
        pushHeader(allCells, 'Value');

        ROWS.forEach((row) => {
            const items = (s[row.listKey] as TwilioItem[] | null) || [];
            const options: NormalizedOption[] = items.map(row.toOption);
            const selectedValue = (s[row.field] as string) ||
                (row.allowEmpty ? '' : (options[0]?.value || ''));

            allCells.push(
                <component.GridPanel.Item>
                    <component.Text type={component.Text.Type.STRONG}>
                        {row.label}
                    </component.Text>
                </component.GridPanel.Item>
            );

            const docLink = new component.Link({
                content: 'Twilio docs ↗',
                url: row.docUrl,
                target: component.Link.Target.BLANK
            } as never);
            allCells.push(
                <component.GridPanel.Item>
                    {docLink as never}
                </component.GridPanel.Item>
            );

            allCells.push(
                <component.GridPanel.Item>
                    <component.Text
                        type={component.Text.Type.WEAK}
                        size={component.Text.Size.S}
                    >
                        {row.description}
                    </component.Text>
                </component.GridPanel.Item>
            );

            if (options.length === 0) {
                allCells.push(
                    <component.GridPanel.Item>
                        <component.Text type={component.Text.Type.WEAK}>
                            (no items found in Twilio for this account)
                        </component.Text>
                    </component.GridPanel.Item>
                );
            } else {
                const ds = new core.ArrayDataSource(options);
                allCells.push(
                    <component.GridPanel.Item>
                        <component.Dropdown
                            dataSource={ds as never}
                            valueMember="value"
                            displayMember="label"
                            selectedValue={selectedValue || (row.allowEmpty ? null : options[0].value)}
                            allowEmpty={row.allowEmpty}
                            placeholder={row.allowEmpty ? '(none)' : 'Select…'}
                            onSelectionChanged={(args: { value?: string }): void => {
                                this.dispatchField(row.field, (args && args.value) || '');
                            }}
                            rootStyle={{width: '100%'} as never}
                        />
                    </component.GridPanel.Item>
                );
            }
        });

        return (
            <component.StackPanel
                orientation={component.StackPanel.Orientation.VERTICAL}
                itemGap={component.StackPanel.GapSize.M}
            >
                {heading}
                {intro}
                <component.StackPanel.Item>
                    <component.GridPanel
                        columns="220px 110px 1fr 360px"
                        rows="auto auto auto auto"
                        columnGap={component.GridPanel.GapSize.M}
                        rowGap={component.GridPanel.GapSize.M}
                    >
                        {allCells as never}
                    </component.GridPanel>
                </component.StackPanel.Item>
                <component.StackPanel.Item>
                    <WizardNavFooter tick={this.props.tick} />
                </component.StackPanel.Item>
            </component.StackPanel>
        );
    }
}
