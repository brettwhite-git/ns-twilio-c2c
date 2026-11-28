/**
 * Sales Central · Calls (ORCA SCApp; table from the needs-calls prototype,
 * 2026-11-28): this week's calls in the book, newest first, grouped by
 * day. A row opens the call drawer (ORCA ScCallDrawer); the phone button
 * calls back through the dock.
 */

import {el, clear, clock, nsDateToIso, shortDate} from './dom';
import type {CallRow} from './api';

export interface CallsView {
    rows: CallRow[];
    selected: string;
    todayIso: string;
    onOpen: (row: CallRow) => void;
    onCall: (row: CallRow) => void;
}

const PHONE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"></path></svg>';
const DIR_ICON: Record<string, string> = {
    in: '<path d="M17 7 7 17M7 9v8h8"></path>',
    out: '<path d="M7 17 17 7M9 7h8v8"></path>',
    missed: '<path d="M17 7 7 17M7 9v8h8"></path><path d="M14 4l6 6M20 4l-6 6"></path>',
    vm: '<circle cx="6.5" cy="12" r="3.5"></circle><circle cx="17.5" cy="12" r="3.5"></circle><path d="M6.5 15.5h11"></path>'
};

const summary = (r: CallRow): string => {
    if (r.brief) return r.brief;
    if (r.voicemail) return 'Voicemail';
    if (r.callStatus === 'Missed') return 'Missed call';
    if (r.callStatus === 'No answer') return 'No answer';
    if (r.callStatus === 'No transcript') return 'No transcript for this call';
    return 'No summary yet';
};

/** What kind of call it was, as a pill: Inbound / Outbound, Missed (red), Voicemail / No answer (amber). */
const kindPill = (r: CallRow): HTMLElement => {
    const [label, icon, tone] = r.voicemail ? ['Voicemail', 'vm', 'amb']
        : r.callStatus === 'Missed' ? ['Missed', 'missed', 'late']
            : r.callStatus === 'No answer' ? ['No answer', 'out', 'amb']
                : r.direction === 'inbound' ? ['Inbound', 'in', ''] : ['Outbound', 'out', ''];
    const p = el('span', 'sc-pill ' + tone);
    p.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + DIR_ICON[icon] + '</svg>';
    p.appendChild(document.createTextNode(label));
    return p;
};

const scorePill = (n: number | null): HTMLElement =>
    n ? el('span', 'sc-pill ' + (n <= 3 ? 'late' : n >= 7 ? 'good' : ''), n + ' / 10') : el('span', 'mut', '—');

const dayLabel = (iso: string, todayIso: string): string => {
    if (!iso) return 'Undated';
    const d = Math.round((Date.parse(todayIso) - Date.parse(iso)) / 86400000);
    return (d === 0 ? 'Today · ' : d === 1 ? 'Yesterday · ' : '') + shortDate(iso);
};

export const renderCalls = (host: HTMLElement, v: CallsView): HTMLElement[] => {
    clear(host);
    host.className = 'sc-calls sc-fade';
    if (!v.rows.length) {
        const m = el('div', 'sc-msg');
        m.append(el('b', '', 'No calls this week'), el('span', '', 'Calls with your accounts show here.'));
        host.appendChild(m);
        return [];
    }
    const head = el('div', 'sc-thead');
    head.append(el('span', '', 'Time'), el('span', '', 'Account · contact'), el('span', '', 'Call'), el('span', '', 'AI summary'),
        el('span', 'num', 'Length'), el('span', '', 'Score'), el('span'));
    host.appendChild(head);
    let day = '';
    v.rows.forEach((r) => {
        const iso = nsDateToIso(r.date);
        if (iso !== day) {
            day = iso;
            const n = v.rows.filter((x) => nsDateToIso(x.date) === iso).length;
            const g = el('div', 'sc-kday');
            g.append(el('span', '', dayLabel(iso, v.todayIso)), el('i', '', n + (n === 1 ? ' call' : ' calls')));
            host.appendChild(g);
        }
        const line = el('div', 'sc-rline');
        const b = el('button', 'sc-row');
        b.type = 'button';
        b.setAttribute('data-call', r.id);
        if (r.id === v.selected) b.setAttribute('aria-current', 'true');
        const who = el('span', 'sc-two strong');
        who.append(el('span', 'm sc-clip', r.companyName || r.phone || 'Unknown caller'), el('small', 'sc-clip', r.contactName || r.phone || ''));
        const kind = el('span');
        kind.appendChild(kindPill(r));
        const score = el('span');
        score.appendChild(scorePill(r.voicemail ? null : r.satisfaction));
        b.append(el('span', 'num', r.timeOfDay || ''), who, kind, el('span', 'sc-ksum', summary(r)),
            el('span', 'num', r.duration ? clock(r.duration) : '—'), score);
        b.addEventListener('click', () => v.onOpen(r));
        const call = el('button', 'sc-callb');
        call.type = 'button';
        call.innerHTML = PHONE;
        call.setAttribute('aria-label', 'Call back ' + (r.contactName || r.companyName || r.phone));
        call.disabled = !r.phone;
        call.addEventListener('click', () => v.onCall(r));
        line.append(b, call);
        host.appendChild(line);
    });
    return [];
};
