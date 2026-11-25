/**
 * Sales Central (slice 1): the frame (header, underline tabs, filter row),
 * Needs me and Calls, the account drawer, the dock. The place (tab, open
 * account) lives in the URL hash (route.ts). Keys: Esc closes the drawer,
 * ↑ / ↓ walk the list while it is open.
 */

import {el, clear, localToday} from './dom';
import {STYLES} from './styles';
import {parseRoute, formatRoute, LIVE_TABS, Route, TabId} from './route';
import {makePost, Post, NeedsRow, CallRow, TaskRow, CompletePayload} from './api';
import {mountDock, setDockContext, callWithDock, DockWindow} from './dock';
import {renderNeeds} from './needs';
import {renderCalls} from './calls';
import {renderTasks, bandLabel} from './tasks';
import type {TaskGroup} from './tasks';
import {openDrawer, closeDrawer, DrawerAccount} from './drawer';

const TABS: Array<[TabId, string]> = [
    ['needs', 'Needs me'], ['pipeline', 'Pipeline'], ['tasks', 'Tasks'], ['calls', 'Calls'], ['money', 'Money']
];

interface Data {
    needs: NeedsRow[] | null;
    needsPartial: string[];
    calls: CallRow[] | null;
    callsTotal: number;
    tasks: TaskRow[] | null;
    tasksPartial: string[];
    error: string;
}

// RESTlet error codes a rep can act on, in plain words.
const PROBLEM: Record<string, string> = {
    forbidden: 'This task is not assigned to you.',
    already_actioned: 'Already done. The list is updated.',
    invalid_next_title: 'Give the next step a title.',
    invalid_next_due: 'Pick a due date for the next step.',
    invalid_note: 'The note is too long.'
};

export const startApp = (root: HTMLElement, win: DockWindow): void => {
    const style = el('style', '', STYLES);
    root.className = 'sc';
    root.appendChild(style);

    const today = localToday();
    const head = el('header', 'sc-head');
    head.append(el('h1', '', 'Sales Central'),
        el('span', 'mut', new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })));
    const tabs = el('nav', 'sc-tabs');
    tabs.setAttribute('aria-label', 'Sales Central');
    tabs.setAttribute('role', 'tablist');
    const filters = el('div', 'sc-filters');
    const tabBar = el('div', 'sc-tabbar');
    tabBar.append(tabs, filters);
    const content = el('div');
    const drawerHost = el('div');
    root.append(head, tabBar, content, drawerHost);

    let route: Route = parseRoute(win.location.hash);
    const data: Data = { needs: null, needsPartial: [], calls: null, callsTotal: 0, tasks: null, tasksPartial: [], error: '' };
    let taskOpenId = '';
    let taskGroup: TaskGroup = 'all';
    let showAllSuggested = false;
    let post: Post | null = null;
    let listButtons: HTMLElement[] = [];

    // ---- Accounts on the current tab (drawer walk, selection) ----
    const accountsOf = (tab: TabId): DrawerAccount[] => {
        if (tab === 'calls') {
            const seen: Record<string, boolean> = {};
            return (data.calls || []).filter((c) => c.companyId && !seen[c.companyId] && (seen[c.companyId] = true))
                .map((c) => ({ companyId: c.companyId, name: c.companyName, entityType: 'customer', phone: c.phone }));
        }
        if (tab === 'tasks') {
            const seen: Record<string, boolean> = {};
            return (data.tasks || []).filter((t) => t.companyId && !seen[t.companyId] && (seen[t.companyId] = true))
                .map((t) => ({ companyId: t.companyId, name: t.companyName, entityType: 'customer', phone: '' }));
        }
        return (data.needs || []).map((r) => ({ companyId: r.companyId, name: r.name, entityType: r.entityType, phone: r.phone }));
    };
    const current = (): DrawerAccount | null =>
        accountsOf(route.tab).filter((a) => a.companyId === route.account)[0] || null;

    // ---- Route ----
    // replaceState fires no event, so phone mode's shell is told to copy the
    // frame's address into its own u= (asset 52); a reload then returns here.
    const writeHash = (): void => {
        const hash = formatRoute(route);
        if (win.location.hash !== hash) win.history.replaceState(null, '', hash);
        try {
            const shell = (win.top as unknown as { __ctcShell?: { syncFramePath?: () => void } }).__ctcShell;
            if (shell && typeof shell.syncFramePath === 'function') shell.syncFramePath();
        } catch (e) { /* not in phone mode, or another origin */ }
    };
    const go = (next: Route): void => {
        const tabChanged = next.tab !== route.tab;
        route = next;
        writeHash();
        render(tabChanged);
    };

    // ---- Frame ----
    const renderTabs = (): void => {
        clear(tabs);
        TABS.forEach(([id, label]) => {
            const live = LIVE_TABS.indexOf(id) !== -1;
            const b = el('button', 'sc-tab', label);
            b.type = 'button';
            b.setAttribute('role', 'tab');
            b.setAttribute('aria-selected', String(route.tab === id));
            if (!live) {
                b.disabled = true;
                b.title = 'Coming next';
            }
            const count = id === 'needs' && data.needs ? String(data.needs.length)
                : id === 'tasks' && data.tasks ? String(data.tasks.length)
                : id === 'calls' && data.calls ? String(data.callsTotal) : '';
            if (live && count) b.appendChild(el('span', 'cnt', count));
            b.addEventListener('click', () => { if (live && route.tab !== id) go({ tab: id, account: '' }); });
            tabs.appendChild(b);
        });
    };
    const renderFilters = (): void => {
        clear(filters);
        const chip = (k: string, v: string): HTMLElement => {
            const c = el('span', 'sc-chip', k + ' ');
            c.appendChild(el('b', '', v));
            return c;
        };
        filters.append(chip('Owner', 'Me'), chip('Range', route.tab === 'calls' ? 'This week' : route.tab === 'tasks' ? 'All open' : 'Last 14 days'));
    };

    // ---- Content ----
    const loading = (): void => {
        clear(content);
        for (let i = 0; i < 5; i++) { const p = el('div', 'sc-ph'); p.appendChild(el('span')); content.appendChild(p); }
    };
    const failed = (msg: string): void => {
        clear(content);
        const m = el('div', 'sc-msg');
        m.append(el('b', '', 'Sales Central could not load'), el('span', '', msg));
        content.appendChild(m);
    };
    const openAccount = (companyId: string): void => go({ tab: route.tab, account: companyId });
    const renderContent = (): void => {
        if (data.error) { failed(data.error); return; }
        if (route.tab === 'tasks') {
            if (!data.tasks) { loading(); return; }
            listButtons = renderTasks(content, { rows: data.tasks, openId: taskOpenId, selectedAccount: route.account,
                group: taskGroup, showAllSuggested: showAllSuggested,
                todayIso: today, partial: data.tasksPartial,
                onToggle: (id) => { taskOpenId = taskOpenId === id ? '' : id; renderContent(); },
                onGroup: (g) => { taskGroup = g; renderContent(); },
                onShowAllSuggested: () => { showAllSuggested = true; renderContent(); },
                onOpenAccount: (r) => openAccount(r.companyId),
                onComplete: completeTask,
                onAddNote: addTaskNote,
                onSuggestion: actOnSuggestion });
            return;
        }
        if (route.tab === 'calls') {
            if (!data.calls) { loading(); return; }
            listButtons = renderCalls(content, { rows: data.calls, selected: route.account, todayIso: today,
                onOpen: (r) => openAccount(r.companyId) });
        } else {
            if (!data.needs) { loading(); return; }
            listButtons = renderNeeds(content, { rows: data.needs, selected: route.account, todayIso: today,
                partial: data.needsPartial, onOpen: (r) => openAccount(r.companyId) });
        }
    };

    // ---- Tasks: write, then reload the lists that show tasks ----
    const toast = (text: string, action?: [string, () => void]): void => {
        const old = root.querySelector('.sc-toast');
        if (old) old.remove();
        const t = el('div', 'sc-toast', text);
        t.setAttribute('role', 'status');
        if (action) {
            const b = el('button', 'sc-toast-act', action[0]);
            b.type = 'button';
            b.addEventListener('click', () => { t.remove(); action[1](); });
            t.appendChild(b);
        }
        root.appendChild(t);
        win.setTimeout(() => t.remove(), action ? 6000 : 3500);
    };
    /** Show one task: its group, scrolled into view, a single flash. */
    const reveal = (id: string): void => {
        taskGroup = 'all';
        renderContent();
        const row = content.querySelector('.sc-trow[data-id="' + id + '"]') as HTMLElement | null;
        if (!row) return;
        if (typeof row.scrollIntoView === 'function') row.scrollIntoView({ block: 'center' });
        row.classList.add('sc-flash');
        win.setTimeout(() => row.classList.remove('sc-flash'), 900);
    };
    const loadNeeds = (): Promise<void> => (post as Post)<{ rows: NeedsRow[]; partial?: string[] }>({ action: 'salesCentralNeeds' }).then((d) => {
        if (d.error) throw new Error(d.error);
        data.needs = d.rows || [];
        data.needsPartial = d.partial || [];
    }).catch((e: Error) => {
        data.needs = [];
        data.needsPartial = ['all: ' + e.message];
    });
    const loadTasks = (): Promise<void> => (post as Post)<{ rows: TaskRow[]; partial?: string[] }>({ action: 'salesCentralTasks' }).then((d) => {
        if (d.error) throw new Error(d.error);
        data.tasks = d.rows || [];
        data.tasksPartial = d.partial || [];
    }).catch((e: Error) => {
        data.tasks = [];
        data.tasksPartial = ['all: ' + e.message];
    });
    const refreshAfterWrite = (message: string): void => {
        taskOpenId = '';
        toast(message);
        Promise.all([loadTasks(), loadNeeds()]).then(() => render(true));
    };
    const completeTask = (r: TaskRow, p: CompletePayload): Promise<string> =>
        (post as Post)<{ ok?: boolean; due?: string }>({ action: 'salesCentralCompleteTask', taskId: r.id, outcome: p.outcome, note: p.note, next: p.next }).then((d) => {
            if (d.error) {
                if (d.error === 'already_actioned') refreshAfterWrite(PROBLEM.already_actioned);
                return PROBLEM[d.error] || 'Could not save. Try again.';
            }
            refreshAfterWrite(p.outcome === 'reach' ? 'Kept open, due tomorrow · ' + r.title
                : p.outcome === 'next' ? 'Completed · next step added · ' + r.title
                : p.outcome === 'no' ? 'Closed as not needed · ' + r.title : 'Completed · ' + r.title);
            return '';
        }).catch(() => 'Could not save. Try again.');
    // A note keeps the task open: append the saved line in place, no reload.
    const addTaskNote = (r: TaskRow, note: string): Promise<string> =>
        (post as Post)<{ ok?: boolean; line?: string }>({ action: 'salesCentralAddTaskNote', taskId: r.id, note: note }).then((d) => {
            if (d.error) return PROBLEM[d.error] || 'Could not save. Try again.';
            r.note = r.note ? r.note + '\n\n' + (d.line || note) : (d.line || note);
            renderContent();
            toast('Note added · ' + r.title.replace(/^AI:\s*/, ''));
            return '';
        }).catch(() => 'Could not save. Try again.');
    const actOnSuggestion = (r: TaskRow, approve: boolean): Promise<string> =>
        (post as Post)<{ ok?: boolean; nativeTaskId?: string | number }>(approve && r.assignTo
            ? { action: 'approveProposedTask', taskId: r.id, edits: { assigneeId: r.assignTo } }
            : { action: approve ? 'approveProposedTask' : 'rejectProposedTask', taskId: r.id }).then((d) => {
            if (d.error) return d.error === 'forbidden' ? 'Not allowed: this call is not yours or your team\u2019s.' : 'Could not save. Try again.';
            if (!approve) { refreshAfterWrite('Dismissed · ' + r.title); return ''; }
            // Say where the new Task went (#111): its band after the reload.
            taskOpenId = '';
            const newId = String(d.nativeTaskId || '');
            Promise.all([loadTasks(), loadNeeds()]).then(() => {
                render(true);
                const made = (data.tasks || []).filter((t) => t.kind === 'task' && t.id === newId)[0];
                if (made) toast('Approved · now in ' + bandLabel(made.band) + ' · ' + r.title, ['Show', () => reveal(newId)]);
                else toast('Approved · ' + r.title);
            });
            return '';
        }).catch(() => 'Could not save. Try again.');

    // ---- Drawer ----
    const step = (dir: -1 | 1): string => {
        const list = accountsOf(route.tab);
        const i = list.findIndex((a) => a.companyId === route.account);
        const next = list[i + dir];
        return next ? next.companyId : '';
    };
    const drawerTop = (): number => Math.max(0, Math.round(tabs.getBoundingClientRect().bottom));
    let shownAccount = '';
    const renderDrawer = (): void => {
        const a = route.account && post ? current() : null;
        if (!a) {
            if (shownAccount) closeDrawer(drawerHost);
            shownAccount = '';
            return;
        }
        if (a.companyId === shownAccount) return;
        shownAccount = a.companyId;
        setDockContext(win, { entityId: a.companyId, entityName: a.name, entityType: a.entityType, phone: a.phone });
        openDrawer(drawerHost, a, {
            post: post as Post,
            top: drawerTop,
            onClose: () => go({ tab: route.tab, account: '' }),
            onStep: (dir) => { const id = step(dir); if (id) go({ tab: route.tab, account: id }); },
            canStep: (dir) => !!step(dir),
            onCall: (acc) => {
                callWithDock(win, { entityId: acc.companyId, entityName: acc.name, entityType: acc.entityType, phone: acc.phone });
            }
        });
    };

    const render = (full: boolean): void => {
        renderTabs();
        if (full) { renderFilters(); renderContent(); }
        else listButtons.forEach((b) => {
            if (b.getAttribute('data-id') === route.account) b.setAttribute('aria-current', 'true');
            else b.removeAttribute('aria-current');
        });
        renderDrawer();
    };

    // ---- Keys ----
    win.document.addEventListener('keydown', (e: KeyboardEvent) => {
        if (!route.account || e.metaKey || e.ctrlKey || e.altKey) return;
        const t = e.target as HTMLElement;
        if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
        if (e.key === 'Escape') { go({ tab: route.tab, account: '' }); e.preventDefault(); return; }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            const id = step(e.key === 'ArrowDown' ? 1 : -1);
            if (id) { go({ tab: route.tab, account: id }); e.preventDefault(); }
        }
    });
    win.addEventListener('hashchange', () => {
        const next = parseRoute(win.location.hash);
        if (next.tab !== route.tab || next.account !== route.account) {
            const tabChanged = next.tab !== route.tab;
            route = next;
            render(tabChanged);
        }
    });
    win.addEventListener('resize', () => {
        const d = drawerHost.querySelector('.sc-drawer') as HTMLElement | null;
        if (d) d.style.top = drawerTop() + 'px';
    });

    // ---- Load ----
    writeHash();
    render(true);
    mountDock(win).then(({ restlet, ready }) => {
        ready.catch(() => { /* the page works without the dock; Call does nothing */ });
        if (!restlet) throw new Error('No RESTlet URL from the phone set-up.');
        post = makePost(restlet);
        const p = post;
        loadNeeds().then(() => render(true));
        loadTasks().then(() => render(true));
        p<{ rows: CallRow[]; total?: number }>({ action: 'getWorkspaceHistory', dateRange: 'thisweek', limit: 50, pastOnly: true, companyNames: true }).then((d) => {
            if (d.error) throw new Error(d.error);
            data.calls = d.rows || [];
            data.callsTotal = typeof d.total === 'number' ? d.total : data.calls.length;
        }).catch(() => {
            data.calls = [];
        }).then(() => render(true));
    }).catch((e: Error) => {
        data.error = e.message;
        render(true);
    });
};
