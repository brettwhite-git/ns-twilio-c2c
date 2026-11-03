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
 * 2026-11-03: the API Key SID and the secret script id can be changed
 * here ("Change API key" → Test and save). The server tests the NEW
 * values first and saves only when the test passes. The rotation guide
 * follows Twilio's model: a key's secret is shown once, so rotation
 * means a NEW key (new SID) and a new NetSuite API Secret.
 */

import {PureComponent} from '@uif-js/core';
import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import {store} from '../../app/Store';
import {Action} from '../../app/Action';
import {cancelCredentialsEdit, saveCredentials, startCredentialsEdit} from '../../app/effects/credentials';
import type {AppState, CredentialsState} from '../../app/InitialState';
import type {PageTickProps} from '../../App';
import {friendlyError} from '../shared/friendlyError';
import {buildFailedCheckLines} from '../shared/FailedChecks';

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

    /** "Change API key" button, or the change form while editing. */
    private renderChangeForm(creds: CredentialsState): core.VDom.Node[] {
        const item = (node: unknown): core.VDom.Node =>
            (<component.StackPanel.Item>{node as never}</component.StackPanel.Item>) as core.VDom.Node;

        if (!creds.editing) {
            const out: core.VDom.Node[] = [];
            if (creds.saved) {
                out.push(item(
                    <component.Text type={component.Text.Type.STRONG}>
                        ✓ Saved. The connection test passed with the new API key.
                    </component.Text>
                ));
            }
            out.push(item(new component.Button({
                label: 'Change API key',
                startIcon: core.SystemIcon.EDIT,
                action: (): void => { startCredentialsEdit(); }
            } as never)));
            return out;
        }

        const field = (label: string, value: string, placeholder: string,
            key: 'apiKeySid' | 'apiSecretId'): core.VDom.Node[] => [
            (
                <component.GridPanel.Item>
                    <component.Text type={component.Text.Type.STRONG}>{label}</component.Text>
                </component.GridPanel.Item>
            ) as core.VDom.Node,
            (
                <component.GridPanel.Item>
                    <component.TextBox
                        text={value}
                        placeholder={placeholder}
                        enabled={!creds.saving}
                        onTextChanged={(args: { text?: string } | undefined): void => {
                            store.dispatch(Action.credentialsUpdate({ [key]: (args && args.text) || '' }));
                        }}
                        rootStyle={{width: '100%'} as never}
                    />
                </component.GridPanel.Item>
            ) as core.VDom.Node
        ];

        const out: core.VDom.Node[] = [
            item(
                <component.Text type={component.Text.Type.WEAK} size={component.Text.Size.S}>
                    Enter the new key's SID and the script ID of the NetSuite
                    API Secret that holds its secret. Click-to-Call tests the
                    connection with the new values first. If the test fails,
                    nothing is saved and the current key stays in use.
                </component.Text>
            ),
            item(
                <component.GridPanel
                    columns="220px 1fr"
                    rows="auto auto"
                    columnGap={component.GridPanel.GapSize.M}
                    rowGap={component.GridPanel.GapSize.S}
                    rootStyle={{maxWidth: '640px'} as never}
                >
                    {[
                        ...field('New API Key SID', creds.apiKeySid, 'SK…', 'apiKeySid'),
                        ...field('New API Key Secret script ID', creds.apiSecretId, 'custsecret_…', 'apiSecretId')
                    ] as never}
                </component.GridPanel>
            ),
            item(new component.StackPanel({
                orientation: component.StackPanel.Orientation.HORIZONTAL,
                itemGap: component.StackPanel.GapSize.S,
                items: [
                    new component.Button({
                        label: creds.saving ? 'Testing connection…' : 'Test and save',
                        type: component.Button.Type.PRIMARY,
                        enabled: !creds.saving &&
                            creds.apiKeySid.trim() !== '' && creds.apiSecretId.trim() !== '',
                        action: (): void => { saveCredentials(); }
                    } as never),
                    new component.Button({
                        label: 'Cancel',
                        enabled: !creds.saving,
                        action: (): void => { cancelCredentialsEdit(); }
                    } as never)
                ]
            } as never))
        ];
        if (creds.error) {
            out.push(item(
                <component.Text type={component.Text.Type.STRONG}>
                    {'✕ ' + friendlyError(creds.error)}
                </component.Text>
            ));
            buildFailedCheckLines(creds.failedChecks).forEach((line) => { out.push(item(line)); });
        }
        return out;
    }

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
        const changeForm = (
            <component.StackPanel.Item>
                <component.StackPanel
                    orientation={component.StackPanel.Orientation.VERTICAL}
                    itemGap={component.StackPanel.GapSize.S}
                >
                    {this.renderChangeForm(state.credentials) as never}
                </component.StackPanel>
            </component.StackPanel.Item>
        );

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

        // CTC brand navy used between the credentials table and the
        // rotation runbook. Matches the NavigationDrawer's dark navy
        // (#1F2F4D — same color used by the softphone shell) so the
        // button visually anchors to the same chrome as the side rail.
        const openSecretsButton = (
            <component.StackPanel.Item>
                <component.Button
                    label="Open NetSuite API Secrets"
                    type={component.Button.Type.PRIMARY}
                    startIcon={core.SystemIcon.LOCK as never}
                    action={this.handleOpenSecrets}
                    rootStyle={{
                        backgroundColor: '#2D4458',
                        color: '#FFFFFF',
                        borderColor: '#2D4458'
                    } as never}
                />
            </component.StackPanel.Item>
        );

        const items = [
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
            changeForm,
            openSecretsButton,
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
                                API key rotation guide
                            </component.Text>
                        </component.StackPanel.Item>
                        <component.StackPanel.Item>
                            <component.Text size={component.Text.Size.S}>
                                {'1. In the Twilio Console (Account › API keys & tokens), create a new Standard API key. Copy its secret at once: Twilio shows a key\'s secret only when you create the key, and you cannot change the secret of an existing key.'}
                            </component.Text>
                        </component.StackPanel.Item>
                        <component.StackPanel.Item>
                            <component.Text size={component.Text.Size.S}>
                                {'2. In NetSuite (Setup › Company › API Secrets), create a new secret with that value. Give it the same allowed scripts and allowed domains as the current secret. The allowed scripts must include CTC Setup Wizard API, CTC Token Generator and CTC Poll Transcripts: NetSuite does not let a script read this list, so the test cannot check it for the other two. Note its script ID (custsecret_…).'}
                            </component.Text>
                        </component.StackPanel.Item>
                        <component.StackPanel.Item>
                            <component.Text size={component.Text.Size.S}>
                                {'3. On this page, click "Change API key". Enter the new API Key SID (SK…, a new SID) and the new secret\'s script ID, then click "Test and save". If the test fails, the current key stays in use.'}
                            </component.Text>
                        </component.StackPanel.Item>
                        <component.StackPanel.Item>
                            <component.Text size={component.Text.Size.S}>
                                {'4. Reload phone mode, then place a test call. A phone that stays open keeps its old-key token until it renews (up to 1 hour).'}
                            </component.Text>
                        </component.StackPanel.Item>
                        <component.StackPanel.Item>
                            <component.Text size={component.Text.Size.S}>
                                {'5. Wait until open phones renew (up to 1 hour), or ask reps to reload phone mode. Then delete the old API key in the Twilio Console, and then the old secret in NetSuite API Secrets.'}
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
