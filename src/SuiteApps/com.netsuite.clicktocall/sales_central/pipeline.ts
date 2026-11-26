/**
 * Sales Central · Pipeline (ORCA board ScPipeline): the KPIs (open,
 * weighted, won this quarter, past close date) live in the header's Lens band;
 * Board | List sits in the tab row, left of the Owner / Range chips (viewToggle); the Board has one column per open NetSuite status, cards drag between
 * them; the pencil (or a List row) opens the deal drawer to edit and save.
 * Won is read only: it comes from a sales order, never from Sales Central.
 */

import {el, clear, money, shortDate} from './dom';
import type {Deal, DealStatus, PipelineData, DealEdit} from './api';

export type PipelineView = 'board' | 'list';

export interface PipelineHandlers {
    view: PipelineView;
    todayIso: string;
    onMove: (deal: Deal, statusId: string) => void;
    onEdit: (deal: Deal) => void;
}

const PEN = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"></path><path d="M14 6l4 4"></path></svg>';

const button = (cls: string, text: string, onClick: () => void): HTMLButtonElement => {
    const b = el('button', cls, text);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
};

const late = (d: Deal, todayIso: string): boolean => !!d.close && d.close < todayIso;
const sum = (deals: Deal[]): number => deals.reduce((n, d) => n + d.amount, 0);

/** Board | List, for the tab row (left of the Owner / Range chips). */
export const viewToggle = (view: PipelineView, onView: (v: PipelineView) => void): HTMLElement => {
    const seg = el('div', 'sc-sumline');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', 'View');
    (['board', 'list'] as PipelineView[]).forEach((v) => {
        const b = button('sc-sum', v === 'board' ? 'Board' : 'List', () => onView(v));
        b.setAttribute('aria-pressed', String(view === v));
        seg.appendChild(b);
    });
    return seg;
};

const card = (d: Deal, h: PipelineHandlers): HTMLElement => {
    const c = el('div', 'sc-card');
    c.setAttribute('data-id', d.id);
    c.draggable = true;
    c.addEventListener('dragstart', (e) => {
        if (e.dataTransfer) { e.dataTransfer.setData('text/plain', d.id); e.dataTransfer.effectAllowed = 'move'; }
        c.classList.add('dragging');
    });
    c.addEventListener('dragend', () => c.classList.remove('dragging'));
    const top = el('span', 'sc-ca');
    const pen = button('sc-pen', '', () => h.onEdit(d));
    pen.innerHTML = PEN;
    pen.setAttribute('aria-label', 'Edit ' + (d.title || 'deal'));
    pen.title = 'Edit deal';
    top.append(el('span', 'sc-clip', d.companyName || 'No customer'), pen);
    const meta = el('span', 'sc-cm');
    const close = el('span', '', d.close ? 'Close ' + shortDate(d.close) : 'No close date');
    if (late(d, h.todayIso)) close.style.color = '#B3311F';
    meta.append(close, el('span', '', d.probability + '%'));
    c.append(top, el('span', 'sc-cd2 sc-clip', (d.title || 'Untitled') + ' · ' + money(d.amount)), meta);
    return c;
};

const board = (p: PipelineData, h: PipelineHandlers): HTMLElement => {
    const cols = el('div', 'sc-cols');
    cols.style.gridTemplateColumns = 'repeat(' + Math.max(1, p.statuses.length) + ', minmax(190px, 1fr))';
    p.statuses.forEach((s) => {
        const items = p.deals.filter((d) => d.statusId === s.id);
        const col = el('div', 'sc-col');
        col.setAttribute('data-status', s.id);
        const head = el('div', 'sc-colh');
        head.append(el('b', '', s.name), el('span', 'cnt', String(items.length)), el('span', 'amt', items.length ? money(sum(items)) : ''));
        col.appendChild(head);
        items.forEach((d) => col.appendChild(card(d, h)));
        col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drop'); });
        col.addEventListener('dragleave', () => col.classList.remove('drop'));
        col.addEventListener('drop', (e) => {
            e.preventDefault();
            col.classList.remove('drop');
            const id = e.dataTransfer ? e.dataTransfer.getData('text/plain') : '';
            const d = p.deals.filter((x) => x.id === id)[0];
            if (d && d.statusId !== s.id) h.onMove(d, s.id);
        });
        cols.appendChild(col);
    });
    return cols;
};

const list = (p: PipelineData, h: PipelineHandlers): HTMLElement => {
    const wrap = el('div', 'sc-plist');
    const head = el('div', 'sc-thead');
    head.append(el('span', '', 'Deal'), el('span', '', 'Account'), el('span', 'num', 'Amount'), el('span', 'num', 'Close'), el('span', 'num', 'Probability'));
    wrap.appendChild(head);
    p.statuses.forEach((s) => {
        const items = p.deals.filter((d) => d.statusId === s.id);
        if (!items.length) return;
        const b = el('div', 'sc-band', s.name + ' ');
        b.appendChild(el('span', 'cnt', items.length + ' · ' + money(sum(items))));
        wrap.appendChild(b);
        items.forEach((d) => {
            const r = button('sc-row', '', () => h.onEdit(d));
            r.setAttribute('data-id', d.id);
            const close = el('span', 'num', d.close ? shortDate(d.close) : '—');
            if (late(d, h.todayIso)) close.style.color = '#B3311F';
            r.append(el('span', 'sc-strong sc-clip', d.title || 'Untitled'), el('span', 'sc-clip', d.companyName),
                el('span', 'num', money(d.amount)), close, el('span', 'num mut', d.probability + '%'));
            wrap.appendChild(r);
        });
    });
    return wrap;
};

export const renderPipeline = (host: HTMLElement, p: PipelineData, h: PipelineHandlers): void => {
    clear(host);
    host.className = 'sc-pipe sc-fade';
    if (p.partial.length) host.appendChild(el('div', 'sc-note', 'Some sources did not load (' + p.partial.join(', ') + '). The numbers may be short.'));
    if (!p.deals.length) {
        const m = el('div', 'sc-msg');
        m.append(el('b', '', 'No open deals'), el('span', '', 'Open opportunities for customers in your book show here.'));
        host.appendChild(m);
        return;
    }
    host.appendChild(h.view === 'list' ? list(p, h) : board(p, h));
};

// ---- Deal drawer ----

export interface DealDrawerHandlers {
    statuses: DealStatus[];
    top: () => number;
    onClose: () => void;
    onSave: (deal: Deal, edit: DealEdit) => Promise<string>;
    onAccount: (deal: Deal) => void;
}

const field = (label: string, input: HTMLElement): HTMLElement => {
    const f = el('label', 'sc-fl');
    f.append(el('span', '', label), input);
    return f;
};

/** Opens (or replaces) the deal drawer; returns it. Only changed fields are saved. */
export const openDealDrawer = (host: HTMLElement, d: Deal, h: DealDrawerHandlers): HTMLElement => {
    const old = host.querySelector('.sc-deal');
    if (old) old.remove();
    const dw = el('aside', 'sc-drawer sc-deal');
    dw.setAttribute('aria-label', 'Deal ' + (d.title || ''));
    dw.style.top = h.top() + 'px';
    const bar = el('div', 'sc-dhead');
    const tools = el('span', 'tools');
    const x = button('sc-icon', '✕', h.onClose);
    x.setAttribute('aria-label', 'Close');
    tools.appendChild(x);
    bar.append(el('span', 'sc-lbl', 'Deal'), tools);
    const title = el('div', 'sc-dtitle');
    const sub = el('div', 'sc-dsub');
    const rec = el('a', 'sc-rec', 'Opportunity ' + (d.number || d.id));
    rec.href = '/app/accounting/transactions/opprtnty.nl?id=' + encodeURIComponent(d.id);
    rec.target = '_top';
    rec.title = 'Open in NetSuite';
    const acct = button('sc-lk', d.companyName || 'Customer', () => h.onAccount(d));
    acct.title = 'Account details';
    sub.append(acct, el('span', 'mut', ' · '), rec);
    title.append(el('b', '', d.title || 'Untitled'), sub);

    const tIn = el('input', 'sc-field');
    tIn.type = 'text';
    tIn.value = d.title;
    const sIn = el('select', 'sc-field');
    h.statuses.forEach((s) => {
        const o = el('option', '', s.name);
        o.value = s.id;
        o.selected = s.id === d.statusId;
        sIn.appendChild(o);
    });
    const cIn = el('input', 'sc-field');
    cIn.type = 'date';
    cIn.value = d.close;
    const pIn = el('input', 'sc-field');
    pIn.type = 'number';
    pIn.min = '0';
    pIn.max = '99';
    pIn.value = String(d.probability);
    const grid = el('div', 'sc-fgrid');
    grid.append(field('Status', sIn), field('Expected close', cIn), field('Probability %', pIn),
        field('Amount', el('span', 'sc-ro', money(d.amount))));
    const err = el('span', 'sc-err');
    err.setAttribute('role', 'alert');
    const save = button('sc-btn pri', 'Save', () => {
        const edit: DealEdit = {};
        if (tIn.value.trim() !== d.title) edit.title = tIn.value.trim();
        if (sIn.value !== d.statusId) edit.statusId = sIn.value;
        if (cIn.value && cIn.value !== d.close) edit.close = cIn.value;
        if (pIn.value !== '' && Number(pIn.value) !== d.probability) edit.probability = Number(pIn.value);
        if (!Object.keys(edit).length) { h.onClose(); return; }
        save.disabled = true;
        err.textContent = '';
        h.onSave(d, edit).then((problem) => { if (problem) { err.textContent = problem; save.disabled = false; } });
    });
    const foot = el('div', 'sc-dfoot');
    foot.append(err, button('sc-cancel', 'Cancel', h.onClose), save);
    const body = el('div', 'sc-dbody');
    body.append(title, field('Title', tIn), grid);
    dw.append(bar, body, foot);
    host.appendChild(dw);
    return dw;
};

export const closeDealDrawer = (host: HTMLElement): void => {
    const d = host.querySelector('.sc-deal');
    if (d) d.remove();
};
