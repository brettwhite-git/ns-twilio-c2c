/**
 * Credentials effects — API key rotation on the console Credentials page.
 *
 * Server contract (ctc_sl_wizard_api.js):
 *   wizardSaveCredentials { apiKeySid, apiSecretId } →
 *     { ok: true, saved: true, apiKeySid, apiSecretId, checks } |
 *     { ok: false, error, checks? }   (connection_test_failed keeps the old values)
 *
 * The secret VALUE never enters the SPA: the admin stores it in NetSuite
 * API Secrets and enters only the secret's script id (custsecret_...).
 */

import {store} from '../Store';
import {Action} from '../Action';
import {wizardCall} from '../../services/wizardApi';
import type {AppState, CheckResult} from '../InitialState';

interface ConfigSnapshot {
    apiKeySid?: string;
    apiSecretId?: string;
}

/** Open the change form, pre-filled with the saved values. */
export function startCredentialsEdit(): void {
    const snap = ((store.getState() as AppState).console.snapshot || {}) as ConfigSnapshot;
    store.dispatch(Action.credentialsUpdate({
        editing: true,
        apiKeySid: snap.apiKeySid || '',
        apiSecretId: snap.apiSecretId || '',
        error: null,
        failedChecks: [],
        saved: false
    }));
}

export function cancelCredentialsEdit(): void {
    if ((store.getState() as AppState).credentials.saving) return;
    store.dispatch(Action.credentialsUpdate({
        editing: false, error: null, failedChecks: []
    }));
}

/** Test the new key + secret, then save (the server saves only on a pass). */
export async function saveCredentials(): Promise<void> {
    const creds = (store.getState() as AppState).credentials;
    if (creds.saving) return;
    store.dispatch(Action.credentialsUpdate({ saving: true, error: null, failedChecks: [], saved: false }));
    try {
        const result = (await wizardCall('wizardSaveCredentials', {
            apiKeySid: creds.apiKeySid.trim(),
            apiSecretId: creds.apiSecretId.trim()
        })) as {
            ok?: boolean; saved?: boolean; error?: string; errorMessage?: string;
            apiKeySid?: string; apiSecretId?: string; checks?: CheckResult[];
        } | null;

        if (!result || result.saved !== true) {
            const checks = (result && Array.isArray(result.checks)) ? result.checks : [];
            store.dispatch(Action.credentialsUpdate({
                saving: false,
                error: (result && (result.errorMessage || result.error)) || 'save_failed',
                failedChecks: checks.filter((c) => c.status !== 'pass')
            }));
            return;
        }

        const snap = (store.getState() as AppState).console.snapshot as Record<string, unknown> | null;
        store.dispatch(Action.consolePatch({
            snapshot: {
                ...(snap || {}),
                apiKeySid: result.apiKeySid || creds.apiKeySid.trim(),
                apiSecretId: result.apiSecretId || creds.apiSecretId.trim()
            }
        }));
        store.dispatch(Action.credentialsUpdate({
            saving: false, editing: false, error: null, failedChecks: [], saved: true
        }));
    } catch (e) {
        store.dispatch(Action.credentialsUpdate({
            saving: false,
            error: e instanceof Error && e.message ? 'Network: ' + e.message : 'save_failed'
        }));
    }
}
