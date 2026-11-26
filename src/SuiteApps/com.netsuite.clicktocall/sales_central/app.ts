/**
 * Sales Central: the frame (header, underline tabs, Owner / Range chips),
 * Needs me, Pipeline, Tasks and Calls, the account and deal drawers, the dock. The place (tab, open
 * account) lives in the URL hash (route.ts). Keys: Esc closes the drawer,
 * ↑ / ↓ walk the list while it is open.
 */

import {el, clear, localToday} from './dom';
import {STYLES} from './styles';
import {parseRoute, formatRoute, LIVE_TABS, Route, TabId} from './route';
import {makePost, Post, NeedsRow, CallRow, TaskRow, CompletePayload, Deal, DealEdit, PipelineData} from './api';
import {mountDock, setDockContext, callWithDock, DockWindow} from './dock';
import {renderNeeds} from './needs';
import {renderCalls} from './calls';
import {renderTasks, bandLabel} from './tasks';
import {renderPipeline, openDealDrawer, closeDealDrawer, viewToggle} from './pipeline';
import {renderLens, tasksLens, pipelineLens, needsLens, callsLens} from './lens';
import type {LensGroup} from './lens';
import type {PipelineView} from './pipeline';
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
    pipeline: PipelineData | null;
    error: string;
}

// RESTlet error codes a rep can act on, in plain words.
const PROBLEM: Record<string, string> = {
    forbidden: 'This task is not assigned to you.',
    already_actioned: 'Already done. The list is updated.',
    invalid_next_title: 'Give the next step a title.',
    invalid_next_due: 'Pick a due date for the next step.',
    invalid_note: 'The note is too long.',
    invalid_title: 'Give the deal a title.',
    invalid_status: 'That status cannot be set here.',
    invalid_close: 'Pick an expected close date.',
    invalid_probability: 'Probability is 0 to 99.',
    closed: 'This deal is closed. The list is updated.'
};

export const startApp = (root: HTMLElement, win: DockWindow): void => {
    const style = el('style', '', STYLES);
    root.className = 'sc';
    root.appendChild(style);

    const today = localToday();
    // Frame (ORCA ScFrame B, after Batchline): the ground holds two cards. The header card is one
    // row (fold caret, title, tabs, the tab's controls) over the Lens band; the work card holds the tab.
    const FOLD_KEY = 'ctc-sc-lens-folded';
    let lensFolded = false;
    try { lensFolded = win.localStorage.getItem(FOLD_KEY) === '1'; } catch (e) { /* storage blocked: start open */ }
    const fold = el('button', 'sc-fold');
    fold.type = 'button';
    fold.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"></path></svg>';
    const title = el('h1', 'sc-title', 'Sales Central');
    const tabs = el('nav', 'sc-tabs');
    tabs.setAttribute('aria-label', 'Sales Central');
    tabs.setAttribute('role', 'tablist');
    const filters = el('div', 'sc-filters');
    const tabBar = el('div', 'sc-tabbar');
    tabBar.append(fold, title, el('span', 'sc-tsep'), tabs, filters);
    const lens = el('div', 'sc-lens');
    const hcard = el('div', 'sc-frame sc-hcard');
    hcard.append(tabBar, lens);
    const content = el('div');
    const wcard = el('div', 'sc-frame sc-wcard');
    wcard.appendChild(content);
    const drawerHost = el('div');
    root.append(hcard, wcard, drawerHost);
    const paintFold = (): void => {
        fold.setAttribute('aria-expanded', String(!lensFolded));
        fold.setAttribute('aria-label', lensFolded ? 'Show summary' : 'Hide summary');
        fold.title = lensFolded ? 'Show summary' : 'Hide summary';
        hcard.classList.toggle('folded', lensFolded);
    };
    fold.addEventListener('click', () => {
        lensFolded = !lensFolded;
        try { win.localStorage.setItem(FOLD_KEY, lensFolded ? '1' : '0'); } catch (e) { /* not kept */ }
        paintFold();
    });
    paintFold();

    let route: Route = parseRoute(win.location.hash);
    const data: Data = { needs: null, needsPartial: [], calls: null, callsTotal: 0, tasks: null, tasksPartial: [], pipeline: null, error: '' };
    let taskOpenId = '';
    let taskGroup: TaskGroup = 'all';
    let showAllSuggested = false;
    let pipelineView: PipelineView = 'board';
    let dealOpenId = '';
    let post: Post | null = null;
    let listButtons: HTMLElement[] = [];

    // ---- Accounts on the current tab (drawer walk, selection) ----
    const accountsOf = (tab: TabId): DrawerAccount[] => {
        if (tab === 'calls') {
            const seen: Record<string, boolean> = {};
            return (data.calls || []).filter((c) => c.companyId && !seen[c.companyId] && (seen[c.companyId] = true))
                .map((c) => ({ companyId: c.companyId, name: c.companyName, entityType: 'customer', phone: c.phone }));
        }
        if (tab === 'pipeline') {
            const seen: Record<string, boolean> = {};
            return (data.pipeline ? data.pipeline.deals : []).filter((d) => d.companyId && !seen[d.companyId] && (seen[d.companyId] = true))
                .map((d) => ({ companyId: d.companyId, name: d.companyName, entityType: 'customer', phone: '' }));
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
                : id === 'pipeline' && data.pipeline ? String(data.pipeline.deals.length)
                : id === 'calls' && data.calls ? String(data.callsTotal) : '';
            if (live && count) b.appendChild(el('span', 'cnt', count));
            b.addEventListener('click', () => { if (live && route.tab !== id) go({ tab: id, account: '' }); });
            tabs.appendChild(b);
        });
    };
    const renderFilters = (): void => {
        clear(filters);
        // Pipeline: Board | List sits left of the chips, with a divider between (#124)
        if (route.tab === 'pipeline') filters.append(viewToggle(pipelineView, (v) => { pipelineView = v; render(true); }), el('span', 'sc-vsep'));
        const chip = (k: string, v: string): HTMLElement => {
            const c = el('span', 'sc-chip', k + ' ');
            c.appendChild(el('b', '', v));
            return c;
        };
        filters.append(chip('Owner', 'Me'), chip('Range', route.tab === 'calls' ? 'This week' : route.tab === 'tasks' ? 'All open' : route.tab === 'pipeline' ? 'Open deals' : 'Last 14 days'));
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
        if (route.tab === 'pipeline') {
            if (!data.pipeline) { loading(); return; }
            listButtons = [];
            renderPipeline(content, data.pipeline, { view: pipelineView, todayIso: today,
                onMove: moveDeal,
                onEdit: (d) => openDeal(d.id) });
            return;
        }
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
    // ---- Pipeline: load, move (drag) with Undo, edit in the deal drawer ----
    const loadPipeline = (): Promise<void> => (post as Post)<PipelineData>({ action: 'salesCentralPipeline' }).then((d) => {
        if (d.error) throw new Error(d.error);
        data.pipeline = { statuses: d.statuses || [], deals: d.deals || [], kpis: d.kpis, partial: d.partial || [] };
    }).catch((e: Error) => {
        data.pipeline = { statuses: [], deals: [], partial: ['all: ' + e.message],
            kpis: { open: 0, openCount: 0, weighted: 0, won: 0, wonCount: 0, late: 0, lateCount: 0 } };
    });
    const statusName = (id: string): string => ((data.pipeline ? data.pipeline.statuses : []).filter((s) => s.id === id)[0] || { name: '' }).name;
    const saveDeal = (d: Deal, edit: DealEdit): Promise<string> =>
        (post as Post)<{ ok?: boolean }>({ action: 'salesCentralUpdateDeal', id: d.id, ...edit }).then((r) => {
            if (r.error) {
                if (r.error === 'closed') loadPipeline().then(() => render(true));
                return r.error === 'forbidden' ? 'This customer is not in your book.' : PROBLEM[r.error] || 'Could not save. Try again.';
            }
            return '';
        }).catch(() => 'Could not save. Try again.');
    const moveDeal = (d: Deal, statusId: string): void => {
        const from = d.statusId;
        d.statusId = statusId; // the card moves at once; the save follows
        renderContent();
        saveDeal(d, { statusId: statusId }).then((problem) => {
            if (problem) {
                d.statusId = from;
                renderContent();
                toast(problem + ' · ' + (d.title || d.companyName));
                return;
            }
            toast('Moved to ' + statusName(statusId) + ' · ' + d.companyName + ' · ' + d.title, ['Undo', () => {
                d.statusId = from;
                renderContent();
                saveDeal(d, { statusId: from }).then(() => loadPipeline().then(() => render(true)));
            }]);
            loadPipeline().then(() => render(true));
        });
    };
    const openDeal = (id: string): void => {
        dealOpenId = id;
        const d = (data.pipeline ? data.pipeline.deals : []).filter((x) => x.id === id)[0];
        if (!d) { closeDealDrawer(drawerHost); dealOpenId = ''; return; }
        openDealDrawer(drawerHost, d, {
            statuses: data.pipeline ? data.pipeline.statuses : [],
            top: drawerTop,
            onClose: () => { dealOpenId = ''; closeDealDrawer(drawerHost); },
            onAccount: (deal) => { dealOpenId = ''; closeDealDrawer(drawerHost); go({ tab: route.tab, account: deal.companyId }); },
            onSave: (deal, edit) => saveDeal(deal, edit).then((problem) => {
                if (problem) return problem;
                dealOpenId = '';
                closeDealDrawer(drawerHost);
                toast('Saved · ' + (edit.title || deal.title));
                loadPipeline().then(() => render(true));
                return '';
            })
        });
    };

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
    const drawerTop = (): number => Math.max(0, Math.round(hcard.getBoundingClientRect().bottom));
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

    // ---- Lens: this tab's figures, from data it already loaded ----
    const lensGroups = (): LensGroup[] => {
        if (route.tab === 'tasks') return data.tasks ? tasksLens(data.tasks) : [];
        if (route.tab === 'pipeline') return data.pipeline ? pipelineLens(data.pipeline) : [];
        if (route.tab === 'calls') return data.calls ? callsLens(data.calls, data.callsTotal) : [];
        return data.needs ? needsLens(data.needs) : [];
    };
    const render = (full: boolean): void => {
        renderTabs();
        if (full) { renderFilters(); renderLens(lens, lensGroups()); renderContent(); }
        else listButtons.forEach((b) => {
            if (b.getAttribute('data-id') === route.account) b.setAttribute('aria-current', 'true');
            else b.removeAttribute('aria-current');
        });
        renderDrawer();
    };

    // ---- Keys ----
    win.document.addEventListener('keydown', (e: KeyboardEvent) => {
        if (dealOpenId && e.key === 'Escape') { dealOpenId = ''; closeDealDrawer(drawerHost); e.preventDefault(); return; }
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
        loadPipeline().then(() => render(true));
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
