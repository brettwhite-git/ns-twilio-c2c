/**
 * Credentials page (U5) — JSX.
 *
 * Phase 4 (2026-05-28) — JSX rewrite of components/sections/credentials.ts.
 * Read-only display of Twilio credential identifiers + Open NetSuite API
 * Secrets button + 3-step rotation runbook callout.
 *
 * Spike (2026-05-28) — DataGrid layout. Three credential rows live inside a
 * single DataGrid so the page reads like a comparison table rather than three
 * stacked GridPanel cards.
 *
 * The rotate-secret modal flow (U5 Phase 3c) is gated on UIF Modal type
 * support — see legacy notes in sections/credentials.ts.
 */

import {PureComponent} from '@uif-js/core';
import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import {store} from '../../app/Store';
import type {AppState} from '../../app/InitialState';
import type {PageTickProps} from '../../App';

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

interface CellArgs {
    cell?: { row?: { dataItem?: CredentialRowSpec } };
}

const TWILIO_CREDS_DOCS = {
    accountSid: 'https://www.twilio.com/docs/iam/api/account',
    apiKeySid: 'https://www.twilio.com/docs/iam/api-keys',
    apiSecret: 'https://www.twilio.com/docs/iam/api-keys'
};

export default class CredentialsPage extends PureComponent<PageTickProps, unknown> {
    private handleOpenSecrets = (): void => {
        try {
            window.open('/app/common/scripting/secrets/settings.nl', '_blank');
        } catch (e) { /* ignore */ }
    };

    private buildColumns(): unknown[] {
        const CT = (component.DataGrid as unknown as { ColumnType: Record<string, unknown> }).ColumnType;

        return [
            {
                type: CT.TEMPLATED,
                name: 'field',
                label: 'Field',
                stretchFactor: 2,
                content: (args: CellArgs): unknown => {
                    const row = args?.cell?.row?.dataItem;
                    return new component.Text({
                        text: row?.label || '',
                        type: component.Text.Type.STRONG
                    });
                }
            },
            {
                type: CT.TEMPLATED,
                name: 'docs',
                label: 'Docs',
                stretchFactor: 1,
                content: (args: CellArgs): unknown => {
                    const row = args?.cell?.row?.dataItem;
                    if (!row?.docUrl) return new component.Text({ text: '' });
                    return new component.Link({
                        content: 'Twilio docs ↗',
                        url: row.docUrl,
                        target: component.Link.Target.BLANK
                    } as never);
                }
            },
            {
                type: CT.TEMPLATED,
                name: 'description',
                label: 'Description',
                stretchFactor: 4,
                content: (args: CellArgs): unknown => {
                    const row = args?.cell?.row?.dataItem;
                    return new component.Text({
                        text: row?.help || '',
                        type: component.Text.Type.WEAK,
                        size: component.Text.Size.S
                    });
                }
            },
            {
                type: CT.TEMPLATED,
                name: 'value',
                label: 'Value',
                stretchFactor: 3,
                content: (args: CellArgs): unknown => {
                    const row = args?.cell?.row?.dataItem;
                    if (row?.value) {
                        return new component.Text({ text: row.value });
                    }
                    return new component.Text({
                        text: '(not configured)',
                        type: component.Text.Type.WEAK
                    });
                }
            }
        ];
    }

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

        const columns = this.buildColumns();
        const rowsDs = new core.ArrayDataSource(rows);

        const items = [
            (
                <component.StackPanel.Item>
                    <component.Button
                        label="Open NetSuite API Secrets"
                        startIcon={core.SystemIcon.LOCK as never}
                        action={this.handleOpenSecrets}
                    />
                </component.StackPanel.Item>
            ),
            (
                <component.StackPanel.Item>
                    <component.Text type={component.Text.Type.WEAK}>
                        The Account SID + API Key SID are public identifiers
                        — they're safe to display here. The actual API Secret
                        value is held opaque by NetSuite's API Secrets vault
                        (Setup &gt; Company &gt; API Secrets) and never
                        travels through the SPA.
                    </component.Text>
                </component.StackPanel.Item>
            ),
            (
                <component.StackPanel.Item>
                    {new component.DataGrid({
                        dataSource: rowsDs,
                        columns,
                        columnStretch: true,
                        highlightRowsOnHover: true,
                        stripedRows: true,
                        dataRowHeight: 64,
                        headerRowHeight: 40,
                        rootStyle: { width: '100%' }
                    } as never) as never}
                </component.StackPanel.Item>
            ),
            (
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
            )
        ].filter(Boolean);

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
