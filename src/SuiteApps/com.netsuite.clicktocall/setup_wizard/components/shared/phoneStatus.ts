/**
 * Rep phone status helpers — shared by the Health page "Phones" grid and
 * the Inbound calls routing table "Phone" column.
 *
 * Status rule (row from wizardLoadPresence):
 *   Offline (grey)              — stale (no heartbeat in 12 min, or never) or state 'offline'
 *   Not receiving calls (amber) — state is not 'registered', or canReceive is false
 *   Receiving calls (green)     — registered and canReceive
 */

import * as component from '@uif-js/component';
import type {PresenceRow} from '../../app/InitialState';

export interface PhoneStatus {
    label: string;
    color: string;
}

export const PHONE_STATUS_RECEIVING: PhoneStatus = { label: 'Receiving calls', color: '#14B981' };
export const PHONE_STATUS_NOT_RECEIVING: PhoneStatus = { label: 'Not receiving calls', color: '#F4C76A' };
export const PHONE_STATUS_OFFLINE: PhoneStatus = { label: 'Offline', color: '#9CA3AF' };

export const phoneStatus = (row: PresenceRow | null | undefined): PhoneStatus => {
    if (!row || row.stale || row.state === 'offline' || !row.state) return PHONE_STATUS_OFFLINE;
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

/** Coloured dot + status text, for a DataGrid cell. */
export const buildPhoneStatusCell = (row: PresenceRow | null | undefined): unknown => {
    const status = phoneStatus(row);
    return new component.StackPanel({
        items: [
            new component.Text({
                text: '●',
                rootStyle: { color: status.color },
                rootAttributes: { 'aria-hidden': 'true' }
            } as never),
            new component.Text({ text: status.label } as never)
        ],
        orientation: component.StackPanel.Orientation.HORIZONTAL,
        itemGap: component.StackPanel.GapSize.XS,
        alignment: component.StackPanel.Alignment.CENTER
    } as never);
};

/** Relative "last seen" text with the exact time in a title. */
export const buildLastSeenCell = (row: PresenceRow | null | undefined, nowMs: number): unknown => {
    const iso = (row && row.lastSeen) || '';
    const title = exactTime(iso);
    return new component.Text({
        text: relativeTime(iso, nowMs),
        type: component.Text.Type.WEAK,
        rootAttributes: title ? { title: title } : {}
    } as never);
};
