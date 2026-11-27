/**
 * Sales Central · the Lens band (ORCA board ScFrame, variant B, after
 * Batchline's header band): a sunk band in the header card with the figures
 * that matter on the current tab, in groups under small uppercase titles.
 * Every figure comes from data the tab already loaded (no extra reads).
 * The fold caret in the header hides the band; the choice is kept per browser.
 */

import {el, clear, money, shortDate} from './dom';
import type {TaskRow, PipelineData, NeedsRow, CallRow} from './api';

export interface LensItem { label: string; value: string; red?: boolean; }
export interface LensGroup { title: string; items: LensItem[]; }

const n = (x: number): string => x.toLocaleString('en-US');
const amount = (x: number): string => (x ? money(x) : '$0');
const pct = (part: number, whole: number): string => (whole ? Math.round((part / whole) * 100) + '%' : '—');
const avgMoney = (sum: number, count: number): string => (count ? money(sum / count) : '—');
const sum = <T>(rows: T[], f: (r: T) => number): number => rows.reduce((s, r) => s + (f(r) || 0), 0);
const clockOf = (secs: number): string => Math.floor(secs / 60) + ':' + String(Math.round(secs % 60)).padStart(2, '0');

export const tasksLens = (rows: TaskRow[]): LensGroup[] => {
    const tasks = rows.filter((r) => r.kind === 'task');
    const count = (band: TaskRow['band']): number => tasks.filter((r) => r.band === band).length;
    const overdue = tasks.filter((r) => r.band === 'overdue').map((r) => r.due).filter(Boolean).sort();
    const sugg = rows.filter((r) => r.kind === 'suggestion');
    const dates = sugg.map((r) => (r.fromCall ? r.fromCall.date : '')).filter(Boolean).sort();
    const accounts = new Set(sugg.map((r) => r.companyId).filter(Boolean)).size;
    return [
        { title: 'Today', items: [{ label: 'Overdue', value: n(count('overdue')), red: count('overdue') > 0 }, { label: 'Due today', value: n(count('today')) },
            { label: 'Oldest overdue', value: overdue.length ? shortDate(overdue[0]) : '—' }] },
        { title: 'Suggestions', items: [{ label: 'To review', value: n(sugg.length) }, { label: 'Oldest', value: dates.length ? shortDate(dates[0]) : '—' },
            { label: 'Accounts', value: n(accounts) }] },
        { title: 'Later', items: [{ label: 'This week', value: n(count('week')) }, { label: 'Later', value: n(count('later')) }, { label: 'All open', value: n(tasks.length) }] }
    ];
};

export const pipelineLens = (p: PipelineData): LensGroup[] => {
    const k = p.kpis;
    return [
        { title: 'Open', items: [{ label: 'Amount', value: amount(k.open) }, { label: 'Weighted', value: amount(k.weighted) }, { label: 'Deals', value: n(k.openCount) }] },
        { title: 'Won this quarter', items: [{ label: 'Amount', value: amount(k.won) }, { label: 'Sales orders', value: n(k.wonCount) }, { label: 'Average order', value: avgMoney(k.won, k.wonCount) }] },
        { title: 'Past close date', items: [{ label: 'Deals', value: n(k.lateCount), red: k.lateCount > 0 }, { label: 'Amount', value: amount(k.late) },
            { label: 'Share of open', value: pct(k.lateCount, k.openCount) }] }
    ];
};

export const needsLens = (rows: NeedsRow[]): LensGroup[] => {
    const red = rows.filter((r) => r.tone === 'red');
    const amber = rows.filter((r) => r.tone === 'amber');
    const open = (rs: NeedsRow[]): string => amount(sum(rs, (r) => r.open));
    return [
        { title: 'Act now', items: [{ label: 'Accounts', value: n(red.length), red: red.length > 0 },
            { label: 'Call backs', value: n(red.filter((r) => r.kind === 'callback').length) }, { label: 'Open', value: open(red) }] },
        { title: 'Soon', items: [{ label: 'Accounts', value: n(amber.length) }, { label: 'To review', value: n(amber.filter((r) => r.kind === 'review').length) },
            { label: 'Open', value: open(amber) }] },
        { title: 'Accounts', items: [{ label: 'Total', value: n(rows.length) }, { label: 'Open', value: open(rows) },
            { label: 'No touch logged', value: n(rows.filter((r) => !r.lastTouch).length) }] }
    ];
};

export const callsLens = (rows: CallRow[], total: number): LensGroup[] => {
    const timed = rows.filter((r) => r.duration > 0);
    const secs = sum(timed, (r) => r.duration);
    const scored = rows.filter((r) => typeof r.satisfaction === 'number' && r.satisfaction > 0);
    const scores = scored.map((r) => r.satisfaction as number);
    const avg = scores.length ? scores.reduce((s, x) => s + x, 0) / scores.length : 0;
    const voicemails = rows.filter((r) => r.voicemail).length;
    const missed = rows.filter((r) => r.callStatus === 'No answer' || r.callStatus === 'Missed').length;
    return [
        { title: 'This week', items: [{ label: 'Calls', value: n(total) }, { label: 'Minutes', value: n(Math.round(secs / 60)) },
            { label: 'Average length', value: timed.length ? clockOf(secs / timed.length) : '—' }] },
        { title: 'Missed', items: [{ label: 'Voicemails', value: n(voicemails) }, { label: 'No answer', value: n(missed) },
            { label: 'Share of calls', value: pct(voicemails + missed, rows.length) }] },
        { title: 'Mood', items: [{ label: 'Average', value: scores.length ? avg.toFixed(1) + ' / 10' : '—', red: scores.length > 0 && avg <= 5 },
            { label: 'Scored calls', value: n(scores.length) }, { label: 'Lowest', value: scores.length ? Math.min(...scores) + ' / 10' : '—' }] }
    ];
};

export const renderLens = (host: HTMLElement, groups: LensGroup[]): void => {
    clear(host);
    groups.forEach((g) => {
        const grp = el('div', 'sc-lgrp');
        grp.appendChild(el('span', 'sc-lgh', g.title));
        const kv = el('div', 'sc-lkv');
        g.items.forEach((it) => {
            const cell = el('div');
            const v = el('b', '', it.value);
            if (it.red) v.style.color = '#B3311F';
            cell.append(el('span', '', it.label), v);
            kv.appendChild(cell);
        });
        grp.appendChild(kv);
        host.appendChild(grp);
    });
};
