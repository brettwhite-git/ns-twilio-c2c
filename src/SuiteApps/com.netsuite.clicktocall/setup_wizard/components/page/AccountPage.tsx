/**
 * Twilio account page (#/account; #/credentials redirects here). Canvas:
 * Account.dc.html.
 *
 *   Connection card     status from the preflight credential checks
 *                       (Twilio reachable, token mints, secret resolves);
 *                       Account SID (read only), API Key SID, API Key
 *                       Secret script ID; Save & test / Test connection.
 *   Rotate the API key  the rotation steps (same row height as Connection).
 *   Danger zone         Pause calling… (confirm) and Re-run setup (only
 *                       while paused: opens the onboarding stepper at
 *                       Step 1, as the rail's "Re-run wizard" does).
 *
 * Save & test = wizardSaveCredentials: the server tests the NEW values
 * and saves only when the test passes. Test connection = preflight again
 * (no save). The secret VALUE never enters the SPA.
 */

import {PureComponent} from '@uif-js/core';
import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import {store} from '../../app/Store';
import {cancelCredentialsEdit, editCredentialsField, saveCredentials} from '../../app/effects/credentials';
import {rerunPreflight} from '../../app/effects/console';
import {goToStep} from '../../app/effects/navigation';
import type {AppState, CheckResult} from '../../app/InitialState';
import type {PageTickProps} from '../../App';
import {friendlyError} from '../shared/friendlyError';
import {buildFailedCheckLines} from '../shared/FailedChecks';
import {PauseControl} from '../shared/PauseControl';
import {API_SECRETS_URL, timeOfDay} from '../shared/consoleModel';
import type {Tone} from '../shared/consoleModel';
import {
    button, card, cardTitle, divider, dotText, errorLine, extLink, field, grid, help, hstack,
    pageHeader, text, vstack, Gap
} from '../shared/ui';
import type {Child} from '../shared/ui';

interface CredentialsSnapshot {
    accountSid?: string;
    apiKeySid?: string;
    apiSecretId?: string;
    active?: boolean;
}

/** Preflight checks that prove the Twilio connection. */
export const CONNECTION_CHECK_IDS = ['twilio_reachable', 'jwt_mint', 'secret_resolves'];

export const ROTATION_STEPS = [
    'In the Twilio Console (Account › API keys & tokens), create a new Standard API key. Copy its SID and secret: Twilio shows the secret only once.',
    'In NetSuite (Setup › Company › API Secrets), create a new secret with that value. Allow the same scripts and domains as the current secret: CTC Setup Wizard API, CTC Token Generator and CTC Poll Transcripts. Note its script ID (custsecret_…).',
    'Paste the new API Key SID and the new secret\'s script ID here and click Save & test.',
    'When the test passes and open phones have renewed (within an hour, or after a reload of phone mode), delete the old key in Twilio and the old secret in NetSuite.'
];

/** Connection status from the preflight credential checks. */
export function connectionStatus(checks: CheckResult[] | null, at: string): { tone: Tone; label: string; extra: string } {
    const mine = (checks || []).filter((c) => CONNECTION_CHECK_IDS.indexOf(String(c.id)) >= 0);
    const when = timeOfDay(at);
    const extra = when ? '· tested ' + when : '';
    if (!mine.length) return { tone: 'off', label: 'Not tested', extra: '' };
    if (mine.every((c) => c.status === 'pass')) return { tone: 'ok', label: 'Connected', extra };
    return { tone: 'problem', label: 'Not connected', extra };
}

export default class AccountPage extends PureComponent<PageTickProps, unknown> {
    private renderConnection(state: AppState): core.VDom.Node {
        const c = state.console;
        const creds = state.credentials;
        const snap = (c.snapshot || {}) as CredentialsSnapshot;
        const keySid = creds.editing ? creds.apiKeySid : (snap.apiKeySid || '');
        const secretId = creds.editing ? creds.apiSecretId : (snap.apiSecretId || '');
        const dirty = creds.editing &&
            (creds.apiKeySid.trim() !== (snap.apiKeySid || '') || creds.apiSecretId.trim() !== (snap.apiSecretId || ''));
        const testing = !!c.preflightRefreshing || (c.loading && c.preflight === null);
        const status = testing
            ? { tone: 'info' as Tone, label: 'Testing…', extra: '' }
            : connectionStatus(c.preflight as CheckResult[] | null, c.preflightAt);
        const failedConnection = ((c.preflight || []) as CheckResult[])
            .filter((ch) => CONNECTION_CHECK_IDS.indexOf(String(ch.id)) >= 0 && ch.status !== 'pass');

        const rows: Child[] = [
            hstack([cardTitle('Connection'), dotText(status.tone, status.label, status.extra)], Gap.SPACING3X, {
                justification: component.StackPanel.Justification.SPACE_BETWEEN, wrap: true
            }),
            field('Account SID',
                <component.TextBox text={snap.accountSid || ''} enabled={false} classList={['ctc-mono'] as never}
                    rootStyle={{width: '100%'} as never} />,
                'The Twilio account itself. To move to another account, re-run setup below.'),
            field('API Key SID',
                <component.TextBox
                    text={keySid}
                    placeholder="SK…"
                    enabled={!creds.saving}
                    classList={['ctc-mono'] as never}
                    onTextChanged={(args: { text?: string } | undefined): void => {
                        editCredentialsField('apiKeySid', (args && args.text) || '');
                    }}
                    rootStyle={{width: '100%'} as never}
                />,
                'The key NetSuite signs call tokens with. A rotated key has a new SID: paste it here.'),
            field('API Key Secret (script ID)',
                <component.TextBox
                    text={secretId}
                    placeholder="custsecret_…"
                    enabled={!creds.saving}
                    classList={['ctc-mono'] as never}
                    onTextChanged={(args: { text?: string } | undefined): void => {
                        editCredentialsField('apiSecretId', (args && args.text) || '');
                    }}
                    rootStyle={{width: '100%'} as never}
                />,
                vstack([
                    help('The NetSuite API Secret that holds the key\'s secret. NetSuite never shows the value here.'),
                    extLink('Open NetSuite API Secrets', API_SECRETS_URL)
                ], Gap.SPACING1X)),
            hstack([
                button(creds.saving ? 'Testing…' : 'Save & test', () => { saveCredentials(); }, {
                    primary: true,
                    enabled: !creds.saving && !!dirty && creds.apiKeySid.trim() !== '' && creds.apiSecretId.trim() !== ''
                }),
                dirty ? button('Discard', () => { cancelCredentialsEdit(); }, { enabled: !creds.saving }) : null,
                button(testing ? 'Testing…' : 'Test connection', () => { rerunPreflight(); }, { enabled: !testing }),
                help('Save & test calls Twilio with the new key first and saves it only when the test passes. A failed test keeps the old key.')
            ], Gap.SPACING2X, { wrap: true, growLast: true })
        ];
        if (creds.saved) rows.push(text('✓ Saved. The connection test passed with the new key.', { strong: true }));
        if (creds.error) {
            rows.push(errorLine(friendlyError(creds.error)));
            buildFailedCheckLines(creds.failedChecks).forEach((line) => { rows.push(line); });
        }
        if (c.preflightError) rows.push(errorLine('The connection test did not run: ' + friendlyError(c.preflightError)));
        if (!testing && failedConnection.length) {
            buildFailedCheckLines(failedConnection).forEach((line) => { rows.push(line); });
        }
        return card(rows, { label: 'Connection', fill: true, gap: Gap.SPACING4X });
    }

    private renderRotation(): core.VDom.Node {
        return card([
            cardTitle('Rotate the API key'),
            help('A Twilio secret is shown once and cannot be regenerated. Rotation means a new key with a new SID.'),
            vstack(ROTATION_STEPS.map((s, i) => text((i + 1) + '. ' + s, { small: true })), Gap.SPACING2X),
            help('Open phones pick up the new key at their next token renewal, within an hour. Calls in progress are not affected.'),
            extLink('Twilio docs', 'https://www.twilio.com/docs/iam/api-keys')
        ], { label: 'Rotate the API key', fill: true });
    }

    private renderDangerZone(state: AppState): core.VDom.Node {
        const snap = (state.console.snapshot || {}) as CredentialsSnapshot;
        const paused = snap.active === false;
        const row = (title: string, helpText: string, control: Child): core.VDom.Node =>
            grid('minmax(0, 1fr) auto', [
                vstack([text(title, { strong: true }), help(helpText)], Gap.SPACING1X),
                control
            ], Gap.SPACING4X);
        return card([
            cardTitle('Danger zone', { danger: true }),
            row('Pause calling',
                'Reps cannot place or receive calls until you resume. Calls in progress finish normally. Twilio settings are kept.',
                <PauseControl pauseLabel="Pause calling…" danger={true} tick={this.props.tick} />),
            divider(),
            row('Re-run setup',
                'Walk through the 5 setup steps again with the current values filled in. Use it to move to another Twilio account. Available while calling is paused.',
                button('Re-run setup', () => { goToStep(1); }, { enabled: paused, icon: core.SystemIcon.REFRESH }))
        ], { variant: 'danger', label: 'Danger zone' });
    }

    render(): core.VDom.Node {
        const state = store.getState() as AppState;
        return vstack([
            pageHeader('Twilio account', 'The Twilio account and API key NetSuite uses for calls, recordings and transcripts.'),
            grid('minmax(0, 3fr) minmax(0, 2fr)', [this.renderConnection(state), this.renderRotation()],
                Gap.SPACING3X, { stretch: true }),
            this.renderDangerZone(state)
        ], Gap.SPACING4X);
    }
}
