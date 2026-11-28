/**
 * Sales Central · Needs me (ORCA SCApp; layout from the needs-calls
 * prototype, 2026-11-28): "Do first" (up to 3 cards: the most urgent
 * accounts, each with Open / Contact / Needs and Call), then every account
 * as a table with the same facts. A row opens the account drawer; Call
 * rings the newest call's contact through the dock.
 */

import {el, clear, money, ago, shortDate, factGroup} from './dom';
import type {NeedsRow, SnoozedRow} from './api';

export interface NeedsView {
    rows: NeedsRow[];
    selected: string;
    todayIso: string;
    partial: string[];
    onOpen: (row: NeedsRow) => void;
    onCall: (row: NeedsRow) => void;
    /** Accounts hidden until tomorrow (salesCentralSnooze); a changed reason brings one back by itself. */
    snoozed: SnoozedRow[];
    showSnoozed: boolean;
    onSnooze: (row: NeedsRow, card: HTMLElement) => void;
    onUnsnooze: (companyId: string) => void;
    onToggleSnoozed: () => void;
}

const SNOOZE = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8"></circle><path d="M12 9v4l2.5 1.5M9 2h6"></path></svg>';
const PHONE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"></path></svg>';

const button = (cls: string, text: string, onClick: () => void): HTMLButtonElement => {
    const b = el('button', cls, text);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
};

/** The reason as a pill: red or amber, like the cards' status. */
const status = (r: NeedsRow): HTMLElement => el('span', 'sc-pill ' + (r.tone === 'red' ? 'late' : r.tone === 'amber' ? 'amb' : ''), r.status);

const whyText = (r: NeedsRow): string => r.why + (r.more ? ' · +' + r.more + ' more' : '');
const firstName = (s: string): string => (s || '').split(' ')[0];
const touchText = (r: NeedsRow, todayIso: string): string => (r.lastTouch ? ago(r.lastTouch, todayIso) : '—');

const stat = (label: string, value: string, cls?: string): HTMLElement => {
    const d = el('div');
    d.append(el('span', '', label), el('b', cls || '', value));
    return d;
};

/** A Do first card: reason, account, why; Open / Contact / Needs; Call and Account details (ORCA needs-calls prototype). */
const card = (r: NeedsRow, v: NeedsView): HTMLElement => {
    const c = el('div', 'sc-pin');
    c.setAttribute('data-id', r.companyId);
    const top = el('div', 'top');
    top.append(status(r), el('span', 'mut', r.lastTouch ? 'Last touch ' + ago(r.lastTouch, v.todayIso) : 'No touch logged'));
    const name = button('name sc-clip', r.name, () => v.onOpen(r));
    name.title = 'Account details';
    const stats = el('div', 'sc-pstats');
    stats.append(stat('Open', r.open ? money(r.open) : '$0'), stat('Contact', r.contact || '—', 'sm sc-clip'), stat('Needs', r.needs || r.status, 'sm'));
    const acts = el('div', 'sc-pacts');
    if (r.phone) acts.appendChild(button('sc-btn go', 'Call ' + (firstName(r.contact) || r.name), () => v.onCall(r)));
    acts.appendChild(button('sc-btn gh', 'Account details', () => v.onOpen(r)));
    const snz = button('sc-snz', '', () => v.onSnooze(r, c));
    snz.innerHTML = SNOOZE;
    snz.appendChild(document.createTextNode('Snooze'));
    snz.title = 'Hide until tomorrow. It comes back sooner if something new happens.';
    acts.appendChild(snz);
    c.append(top, name, el('div', 'why sc-clip', whyText(r)), stats, acts);
    return c;
};

const two = (main: string, sub: string, cls?: string): HTMLElement => {
    const s = el('span', 'sc-two ' + (cls || ''));
    s.append(el('span', 'm sc-clip', main), el('small', 'sc-clip', sub));
    return s;
};

export const renderNeeds = (host: HTMLElement, v: NeedsView): HTMLElement[] => {
    clear(host);
    host.className = 'sc-needs sc-fade';
    const buttons: HTMLElement[] = [];
    if (v.partial.length) {
        host.appendChild(el('div', 'sc-note', 'Some sources did not load (' + v.partial.join(', ') + '). The list may be short.'));
    }
    if (!v.rows.length) {
        const m = el('div', 'sc-msg');
        m.append(el('b', '', 'Nothing needs you right now'), el('span', '', v.snoozed.length
            ? v.snoozed.length + (v.snoozed.length === 1 ? ' account is' : ' accounts are') + ' snoozed until tomorrow.'
            : 'Missed calls, overdue tasks, follow-ups and late invoices show here.'));
        host.appendChild(m);
        if (v.snoozed.length) m.appendChild(button('sc-snzt', 'Show snoozed', v.onToggleSnoozed));
        return buttons;
    }
    const grid = el('div', 'sc-pins');
    v.rows.slice(0, 3).forEach((r) => grid.appendChild(card(r, v)));
    host.appendChild(grid);

    const table = el('div', 'sc-grid');
    const band = el('div', 'sc-band');
    band.append(el('span', '', 'Everything that needs you '), el('span', 'cnt', String(v.rows.length)));
    if (v.snoozed.length) {
        const t = button('sc-snzt', v.snoozed.length + ' snoozed', v.onToggleSnoozed);
        t.setAttribute('aria-expanded', String(v.showSnoozed));
        band.appendChild(t);
    }
    band.appendChild(el('span', 'sc-bcount', 'Most urgent first'));
    host.appendChild(table);
    table.appendChild(band);
    if (v.showSnoozed && v.snoozed.length) {
        const list = el('div', 'sc-snzlist');
        v.snoozed.forEach((s) => {
            const row = el('div', 'sc-snzrow');
            row.append(el('span', 'sc-clip', s.name), el('span', 'mut', 'until ' + shortDate(s.until)),
                button('sc-cancel', 'Unsnooze', () => v.onUnsnooze(s.companyId)));
            list.appendChild(row);
        });
        table.appendChild(list);
    }
    const head = el('div', 'sc-thead');
    head.append(el('span', '', 'Account · why now'), el('span', '', 'Status'), el('span', '', 'Contact'),
        factGroup([['Open', 'num g-money'], ['Last touch', 'num g-date'], ['Next', 'num g-date'], ['', 'g-act']]));
    table.appendChild(head);
    v.rows.forEach((r) => {
        // The row opens the drawer; Call is its own button beside it (no button inside a button)
        const line = el('div', 'sc-rline');
        line.setAttribute('data-id', r.companyId);
        const b = el('button', 'sc-row');
        b.type = 'button';
        b.setAttribute('data-id', r.companyId);
        if (r.companyId === v.selected) b.setAttribute('aria-current', 'true');
        b.append(two(r.name, whyText(r), 'strong'), el('span', '', ''), two(r.contact || '—', r.phone || ''),
            factGroup([[r.open ? money(r.open) : '$0', 'num g-money'], [touchText(r, v.todayIso), 'num g-date'],
                [r.next ? shortDate(r.next) : '—', 'num g-date'], ['', 'g-act']]));
        b.children[1].appendChild(status(r));
        b.addEventListener('click', () => v.onOpen(r));
        const call = button('sc-callb', '', () => v.onCall(r));
        call.innerHTML = PHONE;
        call.setAttribute('aria-label', 'Call ' + (r.contact || r.name));
        call.disabled = !r.phone;
        line.append(b, call);
        table.appendChild(line);
        buttons.push(b);
    });
    return buttons;
};
