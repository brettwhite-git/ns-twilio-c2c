/**
 * Sales Central · Tasks (ORCA boards ScTasks2 variant A + ScTasks3): each
 * kind of context in its own column (Task · Account · From · Due · verb).
 * A summary line above the table filters to one group. Suggestions from
 * calls come first (the first 3, then "Show all"), with Dismiss / Approve on
 * the row. A task opens in place and splits in two: what it is about on the
 * left, how to close it on the right (outcome, note, next step). Colour is a
 * small circle per group, the same on the summary line and the heading.
 * A click anywhere on a task row opens it (#117); the account name is plain
 * text and a Peek icon after it is the only way to the account drawer (#118).
 */

import {el, clear, shortDate} from './dom';
import type {TaskRow, Outcome, CompletePayload} from './api';

export type TaskGroup = 'all' | 'suggested' | TaskRow['band'];
const BANDS: Array<[TaskRow['band'], string]> = [['overdue', 'Overdue'], ['today', 'Today'], ['week', 'This week'], ['later', 'Later']];
const GROUP_COLOR: Record<Exclude<TaskGroup, 'all'>, string> = {
    suggested: '#5F7590', overdue: '#B3311F', today: '#B8730A', week: '#A8A39C', later: '#DEDBD7'
};
const SUGGESTION_CAP = 3;
export const bandLabel = (band: TaskRow['band']): string => (BANDS.filter((b) => b[0] === band)[0] || ['', ''])[1];
const OUTCOMES: Array<[Outcome, string]> = [['done', 'Done'], ['next', 'Next step'], ['reach', 'Couldn’t reach'], ['no', 'Not needed']];
const ACTION: Record<Outcome, string> = {
    done: 'Complete', next: 'Complete and add next step', reach: 'Try again tomorrow', no: 'Close as not needed'
};

export interface TasksView {
    rows: TaskRow[];
    openId: string;
    /** The account whose drawer is open (its Peek icon shows as current). */
    selectedAccount: string;
    group: TaskGroup;
    showAllSuggested: boolean;
    todayIso: string;
    partial: string[];
    onToggle: (id: string) => void;
    onGroup: (group: TaskGroup) => void;
    onShowAllSuggested: () => void;
    onOpenAccount: (row: TaskRow) => void;
    onComplete: (row: TaskRow, p: CompletePayload) => Promise<string>;
    /** Add-only note on the Task's Message (#119); resolves to a problem, or ''. */
    onAddNote: (row: TaskRow, note: string) => Promise<string>;
    onSuggestion: (row: TaskRow, approve: boolean) => Promise<string>;
}

/** The next weekday after `iso` (YYYY-MM-DD). */
export const nextBusinessDay = (iso: string): string => {
    const d = new Date(iso + 'T12:00:00Z');
    do { d.setUTCDate(d.getUTCDate() + 1); } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
    return d.toISOString().slice(0, 10);
};

const dueText = (r: TaskRow): string => (r.due ? shortDate(r.due) : 'No date');
const dueColor = (r: TaskRow): string =>
    r.kind === 'suggestion' ? '#6F6B66' : r.band === 'overdue' ? '#B3311F' : r.band === 'today' ? '#B8730A' : '#6F6B66';

/** Tasks made from a suggestion are stored as "AI: <text>"; the list shows the text. */
export const displayTitle = (title: string): string => title.replace(/^AI:\s*/, '');

const circle = (group: Exclude<TaskGroup, 'all'>): HTMLElement => {
    const c = el('span', 'sc-cd');
    c.style.background = GROUP_COLOR[group];
    return c;
};

/** NetSuite stores textarea line breaks as <br>. */
const plainNote = (note: string): string => note.split(/\n|<br\s*\/?>/i).map((l) => l.trim()).filter(Boolean).join('\n');

const button = (cls: string, text: string, onClick: () => void): HTMLButtonElement => {
    const b = el('button', cls, text);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
};

/** A record's own name or number is the link to it in NetSuite; no icon (ORCA ScPipeline, option C). */
const recordLink = (text: string, href: string): HTMLAnchorElement => {
    const a = el('a', 'sc-rec', text);
    a.href = href;
    a.target = '_top';
    a.title = 'Open in NetSuite';
    return a;
};

const fromCell = (r: TaskRow): HTMLElement => {
    const c = el('span', 'sc-from sc-clip');
    if (!r.fromCall) {
        c.classList.add('mut');
        c.textContent = 'Added in NetSuite';
        return c;
    }
    c.textContent = (r.fromCall.title || 'A call') + (r.fromCall.date ? ' · ' + shortDate(r.fromCall.date) : '');
    return c;
};

/** Notes = the Task's native Message field, read only here; the one note box is in the action column (#119). */
const contextBlock = (r: TaskRow): HTMLElement => {
    const w = el('div', 'sc-ctx');
    const note = plainNote(r.note || '');
    w.appendChild(el('span', 'sc-lbl', 'Notes'));
    w.appendChild(el('span', 'sc-ctxt' + (note ? '' : ' mut'), note || 'No notes on this task.'));
    if (r.fromCall) {
        const links = el('div', 'sc-links');
        links.append(el('span', 'mut', 'From '), recordLink(r.fromCall.title || 'the call', '/app/crm/calendar/call.nl?id=' + encodeURIComponent(r.fromCall.id)));
        w.appendChild(links);
    }
    return w;
};

const actionBlock = (r: TaskRow, v: TasksView): HTMLElement => {
    const act = el('div', 'sc-act');
    let outcome: Outcome = 'done';
    const outs = el('div', 'sc-outs');
    outs.setAttribute('role', 'group');
    outs.setAttribute('aria-label', 'Outcome');
    const note = el('input', 'sc-field');
    note.type = 'text';
    note.placeholder = 'Add a note';
    note.setAttribute('aria-label', 'Note');
    const next = el('div', 'sc-next');
    const nextTitle = el('input', 'sc-field');
    nextTitle.type = 'text';
    nextTitle.value = 'Follow up with ' + (r.companyName || 'the customer');
    nextTitle.setAttribute('aria-label', 'Next step');
    const nextDue = el('input', 'sc-field');
    nextDue.type = 'date';
    nextDue.value = nextBusinessDay(v.todayIso);
    nextDue.setAttribute('aria-label', 'Next step due');
    next.append(nextTitle, nextDue);
    const err = el('span', 'sc-err');
    err.setAttribute('role', 'alert');
    const go = button('sc-btn pri', ACTION.done, () => {
        const payload: CompletePayload = { outcome: outcome, note: note.value.trim() };
        if (outcome === 'next') payload.next = { title: nextTitle.value.trim(), due: nextDue.value };
        go.disabled = true;
        err.textContent = '';
        v.onComplete(r, payload).then((problem) => {
            if (problem) { err.textContent = problem; go.disabled = false; }
        });
    });
    // Save note: add it and keep the task open. The outcome button: close with the note on its line.
    const save = button('sc-btn gh', 'Save note', () => {
        const text = note.value.trim();
        if (!text) { note.focus(); return; }
        save.disabled = true;
        err.textContent = '';
        v.onAddNote(r, text).then((problem) => {
            if (problem) { err.textContent = problem; save.disabled = false; }
        });
    });
    const paint = (): void => {
        Array.from(outs.children).forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute('data-o') === outcome)));
        next.hidden = outcome !== 'next';
        go.textContent = ACTION[outcome];
    };
    OUTCOMES.forEach(([o, label]) => {
        const b = button('sc-opt', label, () => { outcome = o; paint(); });
        b.setAttribute('data-o', o);
        outs.appendChild(b);
    });
    const acts = el('div', 'sc-acts');
    acts.append(button('sc-cancel', 'Cancel', () => v.onToggle(r.id)), save, go);
    act.append(outs, note, next, acts, err);
    paint();
    return act;
};

const suggestionVerbs = (r: TaskRow, v: TasksView): HTMLElement => {
    const cell = el('span', 'sc-verbs');
    const err = el('span', 'sc-err sc-clip');
    err.setAttribute('role', 'alert');
    const act = (approve: boolean) => (): void => {
        Array.from(cell.querySelectorAll('button')).forEach((b) => { (b as HTMLButtonElement).disabled = true; });
        err.textContent = '';
        v.onSuggestion(r, approve).then((problem) => {
            if (!problem) return;
            err.textContent = problem;
            err.title = problem;
            Array.from(cell.querySelectorAll('button')).forEach((b) => { (b as HTMLButtonElement).disabled = false; });
        });
    };
    cell.append(err, button('sc-btn gh sm', 'Dismiss', act(false)), button('sc-btn pri sm', 'Approve', act(true)));
    return cell;
};

const renderRow = (r: TaskRow, v: TasksView): HTMLElement => {
    const open = r.kind === 'task' && r.id === v.openId;
    const row = el('div', 'sc-trow');
    row.setAttribute('data-id', r.id);
    row.setAttribute('data-open', String(open));
    const line = el('div', 'sc-tline');
    const text = displayTitle(r.title);
    const title = r.kind === 'task' ? button('sc-tbtn sc-ttitle', text, () => v.onToggle(r.id)) : el('span', 'sc-ttitle', text);
    if (r.kind === 'task') title.setAttribute('aria-expanded', String(open));
    const due = el('span', 'num sc-due', dueText(r));
    due.style.color = dueColor(r);
    let verb: HTMLElement;
    if (r.kind === 'suggestion') verb = suggestionVerbs(r, v);
    else if (open) {
        // The open row's empty verb cell holds the way out to the record.
        verb = el('span', 'sc-verbs');
        verb.appendChild(recordLink('Task ' + r.id, '/app/crm/calendar/task.nl?id=' + encodeURIComponent(r.id)));
    }
    else verb = el('span', 'sc-verbs');
    if (r.kind === 'task' && !open) verb.appendChild(button('sc-btn gh sm', 'Complete', () => v.onToggle(r.id)));
    line.append(title, accountCell(r, v), fromCell(r), due, verb);
    if (r.kind === 'task') {
        line.classList.add('tap');
        // The whole row opens the task; its buttons and links keep their own job.
        line.addEventListener('click', (e) => {
            if (!(e.target as Element).closest('button, a, input, textarea')) v.onToggle(r.id);
        });
    }
    row.appendChild(line);
    if (open) {
        const body = el('div', 'sc-topen');
        body.append(contextBlock(r), actionBlock(r, v));
        row.appendChild(body);
    }
    return row;
};

const accountCell = (r: TaskRow, v: TasksView): HTMLElement => {
    if (!r.companyId) return el('span', 'sc-clip mut', '—');
    const cell = el('span', 'sc-acct');
    const peek = button('sc-peek', '', () => v.onOpenAccount(r));
    peek.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
    peek.setAttribute('data-id', r.companyId);
    peek.setAttribute('aria-label', 'Account details: ' + (r.companyName || 'account'));
    peek.title = 'Account details';
    if (v.selectedAccount === r.companyId) peek.setAttribute('aria-current', 'true');
    cell.append(el('span', 'sc-clip', r.companyName || 'Account'), peek);
    return cell;
};

const band = (group: Exclude<TaskGroup, 'all'>, label: string, count: number, hint?: string): HTMLElement => {
    const b = el('div', 'sc-band');
    b.append(circle(group), el('span', '', label + ' '), el('span', 'cnt', String(count)));
    if (hint) b.appendChild(el('span', 'sc-hint', hint));
    return b;
};

/** Draws the Tasks tab; returns the Peek buttons (their aria-current follows the open drawer). */
export const renderTasks = (host: HTMLElement, v: TasksView): HTMLElement[] => {
    clear(host);
    host.className = 'sc-tasks sc-fade';
    if (v.partial.length) {
        host.appendChild(el('div', 'sc-note', 'Some sources did not load (' + v.partial.join(', ') + '). The list may be short.'));
    }
    if (!v.rows.length) {
        const m = el('div', 'sc-msg');
        m.append(el('b', '', 'No open tasks'), el('span', '', 'Tasks assigned to you and follow-ups suggested from your calls show here.'));
        host.appendChild(m);
        return [];
    }
    const suggestions = v.rows.filter((r) => r.kind === 'suggestion');
    const inBand = (key: TaskRow['band']): TaskRow[] => v.rows.filter((r) => r.kind === 'task' && r.band === key);
    const groups: Array<[TaskGroup, string, number]> = [['all', 'All', v.rows.length], ['suggested', 'Suggested', suggestions.length]];
    BANDS.forEach(([key, label]) => groups.push([key, label, inBand(key).length]));
    const shown: TaskGroup = groups.some((g) => g[0] === v.group && g[2] > 0) ? v.group : 'all';
    const line = el('div', 'sc-sumline');
    line.setAttribute('role', 'group');
    line.setAttribute('aria-label', 'Show');
    groups.forEach(([g, label, count]) => {
        if (g !== 'all' && !count) return;
        const b = button('sc-sum', '', () => v.onGroup(g));
        b.setAttribute('data-g', g);
        b.setAttribute('aria-pressed', String(shown === g));
        if (g !== 'all') b.appendChild(circle(g));
        b.append(el('span', '', label + ' '), el('b', '', String(count)));
        line.appendChild(b);
    });
    const bar = el('div', 'sc-sumbar');
    bar.appendChild(line);
    host.appendChild(bar);
    const head = el('div', 'sc-thead');
    head.append(el('span', '', 'Task'), el('span', '', 'Account'), el('span', '', 'From'), el('span', 'num', 'Due'), el('span'));
    host.appendChild(head);
    if (suggestions.length && (shown === 'all' || shown === 'suggested')) {
        const capped = shown === 'all' && !v.showAllSuggested && suggestions.length > SUGGESTION_CAP;
        host.appendChild(band('suggested', 'Suggested from your calls', suggestions.length, 'Approve adds it to your tasks'));
        (capped ? suggestions.slice(0, SUGGESTION_CAP) : suggestions).forEach((r) => host.appendChild(renderRow(r, v)));
        if (capped) host.appendChild(button('sc-more', 'Show all ' + suggestions.length, v.onShowAllSuggested));
    }
    BANDS.forEach(([key, label]) => {
        const items = inBand(key);
        if (!items.length || (shown !== 'all' && shown !== key)) return;
        host.appendChild(band(key, label, items.length));
        items.forEach((r) => host.appendChild(renderRow(r, v)));
    });
    return Array.from(host.querySelectorAll('.sc-peek')) as HTMLElement[];
};
