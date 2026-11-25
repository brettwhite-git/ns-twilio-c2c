/**
 * Sales Central · Calls (ORCA SCApp): this week's calls in the book, newest
 * first. A row with an account opens that account's drawer.
 */

import {el, clear, clock, ago, nsDateToIso} from './dom';
import type {CallRow} from './api';

export interface CallsView {
    rows: CallRow[];
    selected: string;
    todayIso: string;
    onOpen: (row: CallRow) => void;
}

const when = (r: CallRow, todayIso: string): string => {
    const day = ago(nsDateToIso(r.date), todayIso).replace(/d ago$/, 'd');
    return (day === '—' ? '' : day + ' ') + (r.timeOfDay || '');
};

const summary = (r: CallRow): string => {
    if (r.brief) return r.brief;
    if (r.voicemail) return 'Voicemail';
    if (r.callStatus === 'Missed') return 'Missed call';
    if (r.callStatus === 'No answer') return 'No answer';
    return 'No summary yet';
};

export const renderCalls = (host: HTMLElement, v: CallsView): HTMLElement[] => {
    clear(host);
    host.className = 'sc-calls sc-fade';
    const buttons: HTMLElement[] = [];
    if (!v.rows.length) {
        const m = el('div', 'sc-msg');
        m.append(el('b', '', 'No calls this week'), el('span', '', 'Calls with your accounts show here.'));
        host.appendChild(m);
        return buttons;
    }
    const head = el('div', 'sc-thead');
    head.append(el('span', '', 'When'), el('span', '', 'Account'), el('span', '', 'AI summary'),
        el('span', 'num', 'Length'), el('span', 'num', 'Score'));
    host.appendChild(head);
    v.rows.forEach((r) => {
        const b = el('button', 'sc-row');
        b.type = 'button';
        b.setAttribute('data-id', r.companyId);
        if (!r.companyId) { b.disabled = true; b.style.cursor = 'default'; }
        if (r.companyId && r.companyId === v.selected) b.setAttribute('aria-current', 'true');
        const score = el('span', 'num', r.satisfaction ? String(r.satisfaction) : '—');
        if (r.satisfaction && r.satisfaction <= 3) score.style.color = '#B3311F';
        const sum = el('span', 'sc-clip', summary(r));
        sum.style.color = '#4A4744';
        b.append(el('span', 'mut', when(r, v.todayIso)), el('span', 'sc-strong sc-clip', r.companyName || r.phone || 'Unknown caller'),
            sum, el('span', 'num', r.duration ? clock(r.duration) : '—'), score);
        b.addEventListener('click', () => { if (r.companyId) v.onOpen(r); });
        host.appendChild(b);
        if (r.companyId) buttons.push(b);
    });
    return buttons;
};
