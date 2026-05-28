/**
 * Credentials page (U5) — JSX.
 *
 * Phase 4 (2026-05-28) — JSX rewrite of components/sections/credentials.ts.
 * Read-only display of Twilio credential identifiers + Open NetSuite API
 * Secrets button + 3-step rotation runbook callout.
 *
 * The rotate-secret modal flow (U5 Phase 3c) is gated on UIF Modal type
 * support — see legacy notes in sections/credentials.ts.
 */

import {PureComponent} from '@uif-js/core';
import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import {store} from '../../app/Store';
import type {AppState} from '../../app/InitialState';

interface CredentialsSnapshot {
    accountSid?: string;
    apiKeySid?: string;
    apiSecretId?: string;
}

interface CredentialRowSpec {
    label: string;
    value: string;
    help: string;
    docUrl?: string;
}

const TWILIO_CREDS_DOCS = {
    accountSid: 'https://www.twilio.com/docs/iam/api/account',
    apiKeySid: 'https://www.twilio.com/docs/iam/api-keys',
    apiSecret: 'https://www.twilio.com/docs/iam/api-keys'
};

const CredentialRow = (props: { spec: CredentialRowSpec }): core.VDom.Node => {
    const {spec} = props;
    return (
        <component.GridPanel
            columns="1fr 2fr 2fr"
            rows="auto"
            columnGap={component.GridPanel.GapSize.L}
        >
            <component.GridPanel.Item>
                <component.StackPanel
                    orientation={component.StackPanel.Orientation.VERTICAL}
                    itemGap={component.StackPanel.GapSize.XXS}
                >
                    <component.StackPanel.Item>
                        <component.Text type={component.Text.Type.STRONG}>
                            {spec.label}
                        </component.Text>
                    </component.StackPanel.Item>
                    {spec.docUrl ? (
                        <component.StackPanel.Item>
                            <component.Link
                                content="Twilio docs ↗"
                                url={spec.docUrl}
                                target={component.Link.Target.BLANK}
                            />
                        </component.StackPanel.Item>
                    ) : null}
                </component.StackPanel>
            </component.GridPanel.Item>
            <component.GridPanel.Item>
                <component.Text
                    type={component.Text.Type.WEAK}
                    size={component.Text.Size.S}
                >
                    {spec.help}
                </component.Text>
            </component.GridPanel.Item>
            <component.GridPanel.Item>
                {spec.value ? (
                    <component.Text>{spec.value}</component.Text>
                ) : (
                    <component.Text type={component.Text.Type.WEAK}>
                        (not configured)
                    </component.Text>
                )}
            </component.GridPanel.Item>
        </component.GridPanel>
    );
};

export default class CredentialsPage extends PureComponent<unknown, unknown> {
    private handleOpenSecrets = (): void => {
        try {
            window.open('/app/common/scripting/secrets/settings.nl', '_blank');
        } catch (e) { /* ignore */ }
    };

    render(): core.VDom.Node {
        const state = store.getState() as AppState;
        const snap = (state.console.snapshot || {}) as CredentialsSnapshot;

        const rows: CredentialRowSpec[] = [
            {
                label: 'Account SID',
                value: snap.accountSid || '',
                help: 'Your Twilio Account SID. Public — safe to display.',
                docUrl: TWILIO_CREDS_DOCS.accountSid
            },
            {
                label: 'API Key SID',
                value: snap.apiKeySid || '',
                help: 'Identifies which Twilio API Key the wizard uses. ' +
                    'Public — the matching Secret stays in NetSuite\'s ' +
                    'API Secrets vault.',
                docUrl: TWILIO_CREDS_DOCS.apiKeySid
            },
            {
                label: 'API Key Secret pointer',
                value: snap.apiSecretId || '',
                help: 'NetSuite script-id (custsecret_…) of the API Secret. ' +
                    'The secret value itself never leaves NetSuite\'s vault.',
                docUrl: TWILIO_CREDS_DOCS.apiSecret
            }
        ];

        return (
            <component.StackPanel
                orientation={component.StackPanel.Orientation.VERTICAL}
                itemGap={component.StackPanel.GapSize.L}
            >
                <component.StackPanel.Item>
                    <component.Button
                        label="Open NetSuite API Secrets"
                        startIcon={core.SystemIcon.LOCK as never}
                        action={this.handleOpenSecrets}
                    />
                </component.StackPanel.Item>
                <component.StackPanel.Item>
                    <component.Text type={component.Text.Type.WEAK}>
                        The Account SID + API Key SID are public identifiers
                        — they're safe to display here. The actual API Secret
                        value is held opaque by NetSuite's API Secrets vault
                        (Setup &gt; Company &gt; API Secrets) and never
                        travels through the SPA.
                    </component.Text>
                </component.StackPanel.Item>
                {rows.map((spec) => (
                    <component.StackPanel.Item key={spec.label}>
                        <CredentialRow spec={spec} />
                    </component.StackPanel.Item>
                ))}
                <component.StackPanel.Item>
                    <component.StackPanel
                        orientation={component.StackPanel.Orientation.VERTICAL}
                        itemGap={component.StackPanel.GapSize.XS}
                        rootStyle={{
                            padding: '12px 16px',
                            border: '1px solid #E2E3E5',
                            borderRadius: '4px',
                            background: '#F7F8F9'
                        }}
                    >
                        <component.StackPanel.Item>
                            <component.Text type={component.Text.Type.STRONG}>
                                Rotation runbook
                            </component.Text>
                        </component.StackPanel.Item>
                        <component.StackPanel.Item>
                            <component.Text size={component.Text.Size.S}>
                                1. Mint a new API Key Secret in the Twilio
                                Console (Account &gt; API Keys &amp; tokens).
                            </component.Text>
                        </component.StackPanel.Item>
                        <component.StackPanel.Item>
                            <component.Text size={component.Text.Size.S}>
                                2. Update the secret value in NetSuite (Setup
                                &gt; Company &gt; API Secrets) — keep the
                                same script id so the wizard pointer above
                                stays valid.
                            </component.Text>
                        </component.StackPanel.Item>
                        <component.StackPanel.Item>
                            <component.Text size={component.Text.Size.S}>
                                3. Revoke the old Twilio API Key once you've
                                verified call placement works with the new
                                secret.
                            </component.Text>
                        </component.StackPanel.Item>
                    </component.StackPanel>
                </component.StackPanel.Item>
            </component.StackPanel>
        );
    }
}
