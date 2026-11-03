/**
 * Rep phone status helpers — shared by the Health page "Rep phones" table,
 * the Phones & reps and Inbound calls "Rep's phone" columns.
 *
 * Status rule (row from wizardLoadPresence):
 *   Offline (grey)              — stale (no heartbeat in 12 min, or never) or state 'offline'
 *   Ready (inbound off) (green) — the phone's token has no inbound grant
 *                                 (incomingGranted false): it places calls and
 *                                 is not meant to ring
 *   Not receiving calls (amber) — state is not 'registered', or canReceive is false
 *   Receiving calls (green)     — registered and canReceive
 */

import type {PresenceRow} from '../../app/InitialState';

export interface PhoneStatus {
    label: string;
    color: string;
}

// Dot colours = the console canvas palette (consoleStyles.ts .ctc-dot-*).
export const PHONE_STATUS_RECEIVING: PhoneStatus = { label: 'Receiving calls', color: '#2E9E6B' };
export const PHONE_STATUS_NOT_RECEIVING: PhoneStatus = { label: 'Not receiving calls', color: '#E9A62A' };
export const PHONE_STATUS_OFFLINE: PhoneStatus = { label: 'Offline', color: '#B9B5AE' };
export const PHONE_STATUS_INBOUND_OFF: PhoneStatus = { label: 'Ready (inbound off)', color: '#2E9E6B' };

export const phoneStatus = (row: PresenceRow | null | undefined): PhoneStatus => {
    if (!row || row.stale || row.state === 'offline' || !row.state) return PHONE_STATUS_OFFLINE;
    if (!row.incomingGranted) return PHONE_STATUS_INBOUND_OFF;
    if (row.state !== 'registered' || !row.canReceive) return PHONE_STATUS_NOT_RECEIVING;
    return PHONE_STATUS_RECEIVING;
};

/** "Just now" / "2 min ago" / "3 h ago" / "4 days ago" / "Never". */
export const relativeTime = (iso: string, nowMs: number): string => {
    const t = Date.parse(iso || '');
    if (isNaN(t)) return 'Never';
    const sec = Math.max(0, Math.floor((nowMs - t) / 1000));
    if (sec < 60) return 'Just now';
    const min = Math.floor(sec / 60);
    if (min < 60) return min + ' min ago';
    const hr = Math.floor(min / 60);
    if (hr < 24) return hr + ' h ago';
    const days = Math.floor(hr / 24);
    return days + (days === 1 ? ' day ago' : ' days ago');
};

/** Local date and time for the title attribute; '' when never seen. */
export const exactTime = (iso: string): string => {
    const t = Date.parse(iso || '');
    return isNaN(t) ? '' : new Date(t).toLocaleString();
};
