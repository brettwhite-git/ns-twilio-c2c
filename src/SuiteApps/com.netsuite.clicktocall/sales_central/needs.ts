/**
 * Sales Central · Needs me (ORCA SCApp): "Do first" (up to 3 cards: the
 * most urgent accounts), then "All" as a table. One row per account; the
 * row opens the account drawer.
 */

import {el, clear, money, ago, shortDate} from './dom';
import type {NeedsRow} from './api';

const TONE: Record<string, string> = { red: '#B3311F', amber: '#B8730A', grey: '#A8A39C' };

export interface NeedsView {
    rows: NeedsRow[];
    selected: string;
    todayIso: string;
    partial: string[];
    onOpen: (row: NeedsRow) => void;
}

const status = (r: NeedsRow): HTMLElement => {
    const s = el('span', 'sc-status');
    const d = el('span', 'dot');
    d.style.background = TONE[r.tone] || TONE.grey;
    const t = el('span', '', r.status);
    if (r.tone === 'red') t.style.color = TONE.red;
    s.append(d, t);
    return s;
};

const whyText = (r: NeedsRow): string => r.why + (r.more ? ' · +' + r.more + ' more' : '');

export const renderNeeds = (host: HTMLElement, v: NeedsView): HTMLElement[] => {
    clear(host);
    host.className = 'sc-needs sc-fade';
    const buttons: HTMLElement[] = [];
    if (v.partial.length) {
        host.appendChild(el('div', 'sc-note', 'Some sources did not load (' + v.partial.join(', ') + '). The list may be short.'));
    }
    if (!v.rows.length) {
        const m = el('div', 'sc-msg');
        m.append(el('b', '', 'Nothing needs you right now'), el('span', '', 'Missed calls, overdue tasks, follow-ups and late invoices show here.'));
        host.appendChild(m);
        return buttons;
    }
    const pins = v.rows.slice(0, 3);
    const lab = el('div', 'sc-label', 'Do first ');
    lab.appendChild(el('span', 'cnt', String(pins.length)));
    host.appendChild(lab);
    const grid = el('div', 'sc-pins');
    pins.forEach((r) => {
        const b = el('button', 'sc-pin');
        b.type = 'button';
        const top = el('span', 'top');
        top.appendChild(status(r));
        const touch = el('span', 'mut', r.lastTouch ? 'Last touch ' + ago(r.lastTouch, v.todayIso) : '');
        touch.style.marginLeft = 'auto';
        top.appendChild(touch);
        b.append(top, el('span', 'name', r.name), el('span', 'why', whyText(r)),
            el('span', 'meta', (r.open ? money(r.open) + ' open' : 'Nothing open') + (r.next ? ' · next ' + shortDate(r.next) : '')));
        b.addEventListener('click', () => v.onOpen(r));
        grid.appendChild(b);
    });
    host.appendChild(grid);

    const all = el('div', 'sc-label', 'All ');
    all.appendChild(el('span', 'cnt', String(v.rows.length)));
    host.appendChild(all);
    const head = el('div', 'sc-thead');
    head.append(el('span', '', 'Account · why now'), el('span', '', 'Status'), el('span', 'num', 'Next'),
        el('span', 'num', 'Open'), el('span', 'num', 'Last touch'));
    host.appendChild(head);
    v.rows.forEach((r) => {
        const b = el('button', 'sc-row');
        b.type = 'button';
        b.setAttribute('data-id', r.companyId);
        if (r.companyId === v.selected) b.setAttribute('aria-current', 'true');
        const c = el('span', 'sc-cell2');
        const l1 = el('span', 'l1');
        l1.appendChild(el('span', 'name', r.name));
        c.append(l1, el('span', 'why', whyText(r)));
        const next = el('span', 'num', r.next ? shortDate(r.next) : '—');
        next.style.color = '#4A4744';
        b.append(c, status(r), next, el('span', 'num', money(r.open)), el('span', 'num mut', ago(r.lastTouch, v.todayIso)));
        b.addEventListener('click', () => v.onOpen(r));
        host.appendChild(b);
        buttons.push(b);
    });
    return buttons;
};
