/**
 * Sales Central · Pipeline (ORCA board ScPipeline): the KPIs (open,
 * weighted, won this quarter, past close date) live in the header's Lens band;
 * Board | List sits in the tab row, left of the Owner / Range chips (viewToggle); the Board has one column per open NetSuite status, cards drag between
 * them; the pencil (or a List row) opens the deal drawer to edit and save.
 * Won is read only: it comes from a sales order, never from Sales Central.
 */

import {el, clear, money, shortDate, factGroup} from './dom';
import type {Deal, DealStatus, PipelineData, DealEdit, DealDetail} from './api';

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

/** One wheel colour per open status, in the form's order (ORCA ScCards, Pills). */
const STAGE_COLORS = ['#7C8794', '#2A8C8C', '#3166B0', '#C27A1A', '#3B7D3A', '#7A5AA6'];

const svg = (inner: string, size: number): string =>
    '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
const PILL_ICON = {
    bars: '<path d="M6 20v-4M12 20v-9M18 20V5"></path>',
    user: '<circle cx="12" cy="8" r="4"></circle><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"></path>',
    cal: '<rect x="4" y="5" width="16" height="16" rx="2"></rect><path d="M4 10h16M8 3v4M16 3v4"></path>'
};

/** The probability as a filled arc, in the status colour. */
const wheel = (probability: number, color: string): HTMLElement => {
    const w = el('span', 'sc-wheel');
    const c = 2 * Math.PI * 6;
    const filled = (c * Math.max(0, Math.min(100, probability))) / 100;
    w.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="#E5E2DD" stroke-width="2.5"></circle>' +
        '<circle cx="8" cy="8" r="6" fill="none" stroke="' + color + '" stroke-width="2.5" stroke-dasharray="' + filled.toFixed(2) + ' ' + c.toFixed(2) + '" transform="rotate(-90 8 8)"></circle></svg>';
    return w;
};

const pill = (icon: string, text: string, cls?: string): HTMLElement => {
    const p = el('span', 'sc-pill' + (cls ? ' ' + cls : ''));
    p.innerHTML = svg(icon, 13);
    p.appendChild(document.createTextNode(text));
    return p;
};

const card = (d: Deal, h: PipelineHandlers, color: string): HTMLElement => {
    const c = el('div', 'sc-card sc-pcard');
    c.setAttribute('data-id', d.id);
    c.draggable = true;
    c.addEventListener('dragstart', (e) => {
        if (e.dataTransfer) { e.dataTransfer.setData('text/plain', d.id); e.dataTransfer.effectAllowed = 'move'; }
        c.classList.add('dragging');
    });
    c.addEventListener('dragend', () => c.classList.remove('dragging'));
    const pen = button('sc-pen', '', () => h.onEdit(d));
    pen.innerHTML = PEN;
    pen.setAttribute('aria-label', 'Edit ' + (d.title || 'deal'));
    pen.title = 'Edit deal';
    const text = el('span', 'sc-ctext');
    text.append(el('span', 'sc-ca sc-clip', d.companyName || 'No customer'),
        el('span', 'sc-cd2 sc-clip', (d.title || 'Untitled') + ' · ' + money(d.amount)));
    if (d.created) text.appendChild(el('span', 'sc-cm sc-clip', 'Created ' + shortDate(d.created)));
    const top = el('div', 'sc-ctop');
    top.append(wheel(d.probability, color), text, pen);
    const pills = el('div', 'sc-pills');
    pills.appendChild(pill(PILL_ICON.bars, d.probability + '%'));
    if (d.rep) pills.appendChild(pill(PILL_ICON.user, d.rep.split(' ')[0]));
    if (!d.close) pills.appendChild(pill(PILL_ICON.cal, 'No close date'));
    else if (late(d, h.todayIso)) pills.appendChild(pill(PILL_ICON.cal, 'Overdue · ' + shortDate(d.close), 'late'));
    else pills.appendChild(pill(PILL_ICON.cal, shortDate(d.close)));
    c.append(top, pills);
    return c;
};

/** Column sort (the header's ⋯ menu). Kept per status while the page is open; close date is the server's order. */
type ColumnSort = 'close' | 'amount' | 'probability' | 'account';
const SORTS: Array<[ColumnSort, string]> = [['close', 'Close date'], ['amount', 'Amount'], ['probability', 'Probability'], ['account', 'Account']];
const columnSort: Record<string, ColumnSort> = {};
const sortDeals = (deals: Deal[], by: ColumnSort): Deal[] => {
    if (by === 'close') return deals;
    const copy = deals.slice();
    if (by === 'amount') copy.sort((a, b) => b.amount - a.amount);
    else if (by === 'probability') copy.sort((a, b) => b.probability - a.probability);
    else copy.sort((a, b) => a.companyName.localeCompare(b.companyName));
    return copy;
};

const DOTS = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.6"></circle><circle cx="12" cy="12" r="1.6"></circle><circle cx="19" cy="12" r="1.6"></circle></svg>';

/** The ⋯ button and its menu: "Sort by" with one item checked. Esc or a click outside closes it. */
const columnMenu = (statusName: string, current: () => ColumnSort, onPick: (s: ColumnSort) => void): HTMLElement => {
    const wrap = el('span', 'sc-cmw');
    const btn = el('button', 'sc-cmb');
    btn.type = 'button';
    btn.innerHTML = DOTS;
    btn.setAttribute('aria-label', 'Sort ' + statusName);
    btn.setAttribute('aria-haspopup', 'menu');
    btn.setAttribute('aria-expanded', 'false');
    let menu: HTMLElement | null = null;
    const close = (): void => {
        if (!menu) return;
        menu.remove();
        menu = null;
        btn.setAttribute('aria-expanded', 'false');
        document.removeEventListener('mousedown', outside, true);
        document.removeEventListener('keydown', onKey, true);
    };
    const outside = (e: Event): void => { if (!wrap.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') { e.stopPropagation(); close(); btn.focus(); } };
    btn.addEventListener('click', () => {
        if (menu) { close(); return; }
        menu = el('div', 'sc-cmenu');
        menu.setAttribute('role', 'menu');
        menu.appendChild(el('div', 'sc-cmh', 'Sort by'));
        SORTS.forEach(([key, label]) => {
            const it = el('button', 'sc-cmi', label);
            it.type = 'button';
            it.setAttribute('role', 'menuitemradio');
            it.setAttribute('aria-checked', String(current() === key));
            it.addEventListener('click', () => { close(); onPick(key); });
            (menu as HTMLElement).appendChild(it);
        });
        wrap.appendChild(menu);
        btn.setAttribute('aria-expanded', 'true');
        document.addEventListener('mousedown', outside, true);
        document.addEventListener('keydown', onKey, true);
        (menu.querySelector('[aria-checked="true"]') as HTMLElement | null)?.focus();
    });
    wrap.appendChild(btn);
    return wrap;
};

const board = (p: PipelineData, h: PipelineHandlers): HTMLElement => {
    const cols = el('div', 'sc-cols');
    cols.style.gridTemplateColumns = 'repeat(' + Math.max(1, p.statuses.length) + ', minmax(190px, 1fr))';
    p.statuses.forEach((s, i) => {
        const items = p.deals.filter((d) => d.statusId === s.id);
        const color = STAGE_COLORS[i % STAGE_COLORS.length];
        const col = el('div', 'sc-col');
        col.setAttribute('data-status', s.id);
        const head = el('div', 'sc-colh');
        const cards = el('div', 'sc-ccards');
        const fill = (): void => {
            clear(cards);
            sortDeals(items, columnSort[s.id] || 'close').forEach((d) => cards.appendChild(card(d, h, color)));
        };
        head.append(el('b', '', s.name), el('span', 'cnt', String(items.length)), el('span', 'amt', items.length ? money(sum(items)) : ''),
            columnMenu(s.name, () => columnSort[s.id] || 'close', (by) => { columnSort[s.id] = by; fill(); }));
        fill();
        col.append(head, cards);
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
    const wrap = el('div', 'sc-plist sc-grid');
    const head = el('div', 'sc-thead');
    head.append(el('span', '', 'Deal'), el('span', '', 'Account'),
        factGroup([['Close', 'num g-date'], ['Probability', 'num g-pct'], ['Amount', 'num g-money']]));
    wrap.appendChild(head);
    p.statuses.forEach((s) => {
        const items = p.deals.filter((d) => d.statusId === s.id);
        if (!items.length) return;
        const b = el('div', 'sc-band', s.name + ' ');
        b.appendChild(el('span', 'cnt', String(items.length)));
        b.appendChild(el('span', 'sc-bcount', money(sum(items))));
        wrap.appendChild(b);
        items.forEach((d) => {
            const r = button('sc-row', '', () => h.onEdit(d));
            r.setAttribute('data-id', d.id);
            const close = el('span', 'num', d.close ? shortDate(d.close) : '—');
            if (late(d, h.todayIso)) close.style.color = '#B3311F';
            r.append(el('span', 'sc-strong', d.title || 'Untitled'), el('span', 'sc-clip', d.companyName),
                factGroup([[close, 'num g-date'], [d.probability + '%', 'num mut g-pct'], [money(d.amount), 'num g-money']]));
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
    /** The deal's detail, read when the drawer opens; the sections fill in when it arrives. */
    detail: Promise<DealDetail | null>;
}

const ACT_ICON: Record<string, string> = {
    call: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2',
    task: 'M4 4h16v16H4z M9 12l2 2 4-4',
    event: 'M4 6h16v14H4z M4 10h16 M8 3v4 M16 3v4'
};
const ACT_WORD: Record<string, string> = { call: 'Call', task: 'Task', event: 'Event' };

const section = (title: string, aside: string): HTMLElement => {
    const h = el('div', 'sc-dsec');
    h.append(el('span', '', title), el('i', '', aside));
    return h;
};

const daysBetween = (fromIso: string, toIso: string): number =>
    Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86400000);

/** Details, Items and Activity under the edit fields (ORCA board ScDeal, option A). */
export const renderDealDetail = (host: HTMLElement, d: Deal, x: DealDetail): void => {
    clear(host);
    const det = x.details;
    const age = det.created && det.created <= x.todayIso ? 'Open ' + daysBetween(det.created, x.todayIso) + ' days · ' : '';
    host.appendChild(section('Details', det.created ? age + (age ? 'created ' : 'Created ') + shortDate(det.created) : ''));
    const kv = el('dl', 'sc-dkv');
    const range = det.rangeLow || det.rangeHigh ? money(det.rangeLow) + ' – ' + money(det.rangeHigh) : '';
    ([['Sales rep', det.salesRep], ['Lead source', det.leadSource], ['Partner', det.partner],
        ['Forecast type', det.forecastType], ['Range', range]] as Array<[string, string]>).forEach(([k, v]) => {
        kv.append(el('dt', '', k), el('dd', v ? '' : 'mut', v || 'None'));
    });
    host.appendChild(kv);
    if (det.memo) host.appendChild(el('div', 'sc-dmemo', det.memo));

    host.appendChild(section('Items', x.partial.indexOf('items') !== -1 ? 'Could not load' : x.items.length + (x.items.length === 1 ? ' line' : ' lines')));
    if (x.items.length) {
        const t = el('table', 'sc-ditems');
        const head = el('tr');
        head.append(el('th', '', 'Item'), el('th', 'num', 'Qty'), el('th', 'num', 'Amount'));
        t.appendChild(head);
        x.items.forEach((it) => {
            const r = el('tr');
            r.append(el('td', '', it.item), el('td', 'num', it.quantity.toLocaleString('en-US')), el('td', 'num', money(it.amount)));
            t.appendChild(r);
        });
        const tot = el('tr', 'tot');
        tot.append(el('td', '', 'Total'), el('td'), el('td', 'num', money(x.items.reduce((s, it) => s + it.amount, 0))));
        t.appendChild(tot);
        host.appendChild(t);
    }

    host.appendChild(section('Activity', x.activity.length ? 'Last ' + x.activity.length : ''));
    if (!x.activity.length) host.appendChild(el('div', 'mut', 'No calls, tasks or events on this deal yet.'));
    x.activity.forEach((a) => {
        const row = el('div', 'sc-dact');
        const ic = el('span', 'ic');
        ic.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + ACT_ICON[a.kind] + '"></path></svg>';
        row.append(ic, el('span', '', ACT_WORD[a.kind] + ' · ' + (a.title || 'Untitled')), el('span', 'mut', a.date ? shortDate(a.date) : ''));
        host.appendChild(row);
    });
    const all = el('a', 'sc-rec', 'All activity in NetSuite');
    all.href = '/app/accounting/transactions/opprtnty.nl?id=' + encodeURIComponent(d.id);
    all.target = '_top';
    host.appendChild(all);
};

const loadingDetail = (host: HTMLElement): void => {
    clear(host);
    ['Details', 'Items'].forEach((t) => {
        host.appendChild(section(t, ''));
        const bars = el('div', 'sc-dload');
        [70, 55, 62].forEach((w) => { const b = el('span'); b.style.width = w + '%'; bars.appendChild(b); });
        host.appendChild(bars);
    });
};

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
    const more = el('div', 'sc-dmore');
    loadingDetail(more);
    h.detail.then((x) => {
        if (x) renderDealDetail(more, d, x);
        else { clear(more); more.appendChild(el('div', 'mut', 'Could not load details')); }
    });
    body.append(title, field('Title', tIn), grid, more);
    dw.append(bar, body, foot);
    host.appendChild(dw);
    return dw;
};

export const closeDealDrawer = (host: HTMLElement): void => {
    const d = host.querySelector('.sc-deal');
    if (d) d.remove();
};
