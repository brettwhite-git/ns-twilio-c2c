/**
 * Step 2 — Connect Twilio (JSX, table layout).
 *
 * Phase A.6 (2026-05-29) — restructured into a 4-column table mirroring
 * the Credentials section: Field | Docs | Description | Value. Each row
 * has a labeled TextBox in the Value column that dispatches step2FieldChange
 * on every keystroke. Inlined rendering (no Step2Field PureComponent) so
 * the parent Step2 PureComponent owns the whole tree — tick prop drives
 * re-render on every store update, which the WizardNavFooter relies on
 * to re-evaluate Continue's enabled state.
 *
 * Pattern reference: components/page/CredentialsPage.tsx (table read).
 */

import {PureComponent} from '@uif-js/core';
import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import {store} from '../../app/Store';
import {Action} from '../../app/Action';
import {WizardNavFooter} from '../shared/WizardNavFooter';
import type {AppState, Step2State} from '../../app/InitialState';
import type {PageTickProps} from '../../App';

const TWILIO_DOCS = {
    accountSid: 'https://www.twilio.com/docs/iam/api/account',
    apiKeySid: 'https://www.twilio.com/docs/iam/api-keys',
    apiSecret: 'https://www.twilio.com/docs/iam/api-keys'
};

interface FieldRowSpec {
    field: keyof Step2State;
    label: string;
    placeholder: string;
    docUrl: string;
    description: string;
}

const ROWS: FieldRowSpec[] = [
    {
        field: 'accountSid',
        label: 'Account SID',
        placeholder: 'AC...',
        docUrl: TWILIO_DOCS.accountSid,
        description:
            'Public identifier for your Twilio account. Found in the ' +
            'Twilio Console under Account Info. Safe to display — the ' +
            'matching Auth Token never leaves Twilio.'
    },
    {
        field: 'apiKeySid',
        label: 'API Key SID',
        placeholder: 'SK...',
        docUrl: TWILIO_DOCS.apiKeySid,
        description:
            'Identifies which Twilio API Key the wizard authenticates ' +
            'with. Create one at Account > API keys & tokens. The ' +
            'matching Secret is held by NetSuite (next field).'
    },
    {
        field: 'apiSecretId',
        label: 'API Key Secret script ID',
        placeholder: 'custsecret_...',
        docUrl: TWILIO_DOCS.apiSecret,
        description:
            'Script ID of the NetSuite API Secret holding the Twilio ' +
            'Secret value. Create the secret at Setup > Company > API ' +
            'Secrets, then paste its custsecret_... script ID here. The ' +
            'value itself never leaves NetSuite\'s vault.'
    }
];

export default class Step2 extends PureComponent<PageTickProps, unknown> {
    private dispatchField = (field: keyof Step2State, value: string): void => {
        store.dispatch(Action.step2FieldChange(field, value));
    };

    render(): core.VDom.Node {
        const state = store.getState() as AppState;
        const s = state.step2;

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
            const value = s[row.field] || '';

            allCells.push(
                <component.GridPanel.Item>
                    <component.Text type={component.Text.Type.STRONG}>
                        {row.label}
                    </component.Text>
                </component.GridPanel.Item>
            );

            // Link's `content` prop is one of the JSX shapes that silently
            // drops scalar content (see uif-spa-runtime-constraints doc #4).
            // Construct imperatively so the link text actually renders.
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

            allCells.push(
                <component.GridPanel.Item>
                    <component.TextBox
                        text={value}
                        placeholder={row.placeholder}
                        onTextChanged={(args: { text?: string } | undefined): void => {
                            this.dispatchField(row.field, (args && args.text) || '');
                        }}
                        rootStyle={{width: '100%'} as never}
                    />
                </component.GridPanel.Item>
            );
        });

        return (
            <component.StackPanel
                orientation={component.StackPanel.Orientation.VERTICAL}
                itemGap={component.StackPanel.GapSize.M}
            >
                <component.StackPanel.Item>
                    <component.Heading level={2}>
                        Connect to your Twilio account
                    </component.Heading>
                </component.StackPanel.Item>
                <component.StackPanel.Item>
                    <component.Text>
                        Enter your Twilio Account SID and API Key SID. The
                        API Key Secret must already exist in NetSuite API
                        Secrets (Setup &gt; Company &gt; API Secrets) —
                        paste its script ID below. Live validation against
                        Twilio runs at Step 5 using the configured secret
                        pointer — no need to paste the secret value here.
                    </component.Text>
                </component.StackPanel.Item>
                <component.StackPanel.Item>
                    <component.GridPanel
                        columns="180px 110px 1fr 360px"
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
