/**
 * Presence effects — rep browser-phone status for the Health page
 * "Phones" section and the Inbound calls routing table.
 *
 * Server contract (ctc_sl_wizard_api.js):
 *   wizardLoadPresence {} → {ok, now, items:[{employeeId, employeeName,
 *                            canReceive, state, lastSeen, lastChange, stale}]}
 */

import {store} from '../Store';
import {Action} from '../Action';
import {wizardCall} from '../../services/wizardApi';
import type {AppState, PresenceRow} from '../InitialState';

interface PresenceEnvelope {
    ok?: boolean;
    error?: string;
    message?: string;
    now?: string;
    items?: unknown[];
}

const toRow = (raw: unknown): PresenceRow => {
    const r = (raw || {}) as Record<string, unknown>;
    return {
        employeeId: String(r.employeeId ?? ''),
        employeeName: String(r.employeeName ?? ''),
        canReceive: r.canReceive === true,
        state: String(r.state ?? ''),
        lastSeen: String(r.lastSeen ?? ''),
        lastChange: String(r.lastChange ?? ''),
        stale: r.stale !== false
    };
};

/** Load (or reload) every rep's phone status. One load at a time. */
export async function loadPresence(): Promise<void> {
    if ((store.getState() as AppState).presence.loading) return;
    store.dispatch(Action.presenceLoadStart());
    try {
        const result = (await wizardCall('wizardLoadPresence', {})) as PresenceEnvelope | null;
        if (!result || result.ok !== true) {
            store.dispatch(Action.presenceLoadFailure(
                (result && (result.message || result.error)) || 'Could not load phone status'
            ));
            return;
        }
        const serverNow = Date.parse(result.now || '');
        const skew = isNaN(serverNow) ? 0 : serverNow - Date.now();
        const items = Array.isArray(result.items) ? result.items.map(toRow) : [];
        store.dispatch(Action.presenceLoadSuccess(items, skew));
    } catch (e) {
        store.dispatch(Action.presenceLoadFailure(
            e instanceof Error && e.message ? e.message : 'Could not load phone status'
        ));
    }
}
