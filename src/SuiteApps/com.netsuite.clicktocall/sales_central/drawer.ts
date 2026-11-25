/**
 * Sales Central · the account drawer (ORCA SCApp / SCLayout): 440px from
 * the right, under the tabs. Glance (open balance, overdue invoices, last
 * touch), recent activity, open follow-ups, people; Call and Open in
 * NetSuite at its foot. Data: softphoneCallContext + softphoneContacts.
 */

import {el, clear, money, shortDate} from './dom';
import type {Post, AccountContext, ContactRow} from './api';

export interface DrawerAccount { companyId: string; name: string; entityType: string; phone: string; }

export interface DrawerHandlers {
    post: Post;
    top: () => number;
    onClose: () => void;
    onStep: (dir: -1 | 1) => void;
    canStep: (dir: -1 | 1) => boolean;
    onCall: (a: DrawerAccount) => void;
}

const ICON = {
    up: 'M6 15l6-6 6 6', down: 'M6 9l6 6 6-6', close: 'M6 6l12 12M18 6L6 18'
};

const icon = (path: string, label: string, onClick: () => void): HTMLButtonElement => {
    const b = el('button', 'sc-icon');
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + path + '"></path></svg>';
    b.addEventListener('click', onClick);
    return b;
};

const recordUrl = (a: DrawerAccount): string => '/app/common/entity/custjob.nl?id=' + encodeURIComponent(a.companyId);

const touchText = (days: number | null | undefined): string => {
    if (days == null) return '—';
    if (days === 0) return 'Today';
    if (days === 1) return '1 day';
    return days + ' days';
};

const section = (label: string): HTMLElement => {
    const s = el('div', 'sc-sect');
    s.appendChild(el('span', 'mut', label));
    return s;
};

const fill = (body: HTMLElement, a: DrawerAccount, ctx: AccountContext, contacts: ContactRow[]): void => {
    clear(body);
    const title = el('div', 'sc-dtitle');
    title.append(el('b', '', a.name), el('span', 'mut', a.phone || 'Customer'));
    body.appendChild(title);
    if (ctx.error) {
        body.appendChild(el('span', 'mut', 'Could not load this account. ' + ctx.error));
        return;
    }
    const o = ctx.outstanding || { sum: 0, count: 0, overdueCount: 0, oldestDays: null };
    const g = el('div', 'sc-glance');
    const cell = (num: string, label: string, red?: boolean): HTMLElement => {
        const c = el('div');
        const b = el('b', '', num);
        if (red) b.style.color = '#B3311F';
        c.append(b, el('span', '', label));
        return c;
    };
    g.append(cell(money(o.sum), 'open'), cell(String(o.overdueCount || 0), 'overdue invoices', (o.overdueCount || 0) > 0),
        cell(touchText(ctx.lastTouchDays), 'since last touch'));
    body.appendChild(g);

    const act = section('Recent activity');
    (ctx.activity || []).forEach((x) => {
        const i = el('div', 'sc-item');
        i.append(el('span', 'sc-clip', x.text), el('span', 'mut', x.ageDays === 0 ? 'Today' : x.ageDays + 'd'));
        act.appendChild(i);
    });
    if (!(ctx.activity || []).length) act.appendChild(el('span', 'mut', 'No activity in the last 90 days'));
    body.appendChild(act);

    const fu = section('Follow-ups');
    (ctx.followUps || []).forEach((f) => {
        const i = el('div', 'sc-item');
        i.append(el('span', '', f.title), el('span', 'mut', f.due ? 'Due ' + shortDate(f.due) : ''));
        fu.appendChild(i);
    });
    if (!(ctx.followUps || []).length) fu.appendChild(el('span', 'mut', 'No open follow-ups'));
    body.appendChild(fu);

    const people = section('People');
    contacts.filter((c) => c.contactId !== '__company_main__').slice(0, 4).forEach((c) => {
        const ph = (c.phones || [])[0];
        people.appendChild(el('span', '', c.name + (c.title ? ', ' + c.title : '') + (ph ? ' · ' + ph.number : '')));
    });
    if (people.childNodes.length === 1) people.appendChild(el('span', 'mut', 'No contacts'));
    body.appendChild(people);
};

/** Opens (or refills) the drawer for one account (icon paths are constants). */
export const openDrawer = (host: HTMLElement, a: DrawerAccount, h: DrawerHandlers): HTMLElement => {
    clear(host);
    const d = el('aside', 'sc-drawer');
    d.setAttribute('aria-label', a.name);
    d.style.top = h.top() + 'px';
    const head = el('div', 'sc-dhead');
    const tools = el('span', 'tools');
    const up = icon(ICON.up, 'Previous', () => h.onStep(-1));
    const down = icon(ICON.down, 'Next', () => h.onStep(1));
    up.disabled = !h.canStep(-1);
    down.disabled = !h.canStep(1);
    tools.append(up, down, icon(ICON.close, 'Close (Esc)', h.onClose));
    head.append(el('span', 'mut', 'Account'), tools);
    const body = el('div', 'sc-dbody');
    const title = el('div', 'sc-dtitle');
    title.append(el('b', '', a.name), el('span', 'mut', 'Loading…'));
    body.appendChild(title);
    const foot = el('div', 'sc-dfoot');
    const call = el('button', 'sc-btn go', 'Call');
    call.type = 'button';
    call.addEventListener('click', () => h.onCall(a));
    const open = el('a', 'sc-btn gh', 'Open in NetSuite');
    open.href = recordUrl(a);
    open.target = '_top';
    foot.append(call, open, el('span', 'mut', 'Esc to close'));
    d.append(head, body, foot);
    host.appendChild(d);

    Promise.all([
        h.post<AccountContext>({ action: 'softphoneCallContext', entityId: a.companyId })
            .catch((e: Error) => ({ error: e.message }) as AccountContext),
        h.post<{ rows?: ContactRow[] }>({ action: 'softphoneContacts', entityId: a.companyId })
            .then((r) => r.rows || []).catch(() => [] as ContactRow[])
    ]).then(([ctx, contacts]) => {
        if (d.isConnected) fill(body, a, ctx, contacts);
    });
    return d;
};

/** Slides the drawer out, then empties the host. */
export const closeDrawer = (host: HTMLElement): void => {
    const d = host.querySelector('.sc-drawer');
    if (!d) return;
    d.classList.add('out');
    window.setTimeout(() => { if (d.parentNode === host) clear(host); }, 200);
};
