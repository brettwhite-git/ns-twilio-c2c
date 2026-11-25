/**
 * Sales Central (slice 1): the frame (header, underline tabs, filter row),
 * Needs me and Calls, the account drawer, the dock. The place (tab, open
 * account) lives in the URL hash (route.ts). Keys: Esc closes the drawer,
 * ↑ / ↓ walk the list while it is open.
 */

import {el, clear, localToday} from './dom';
import {STYLES} from './styles';
import {parseRoute, formatRoute, LIVE_TABS, Route, TabId} from './route';
import {makePost, Post, NeedsRow, CallRow} from './api';
import {mountDock, setDockContext, callWithDock, DockWindow} from './dock';
import {renderNeeds} from './needs';
import {renderCalls} from './calls';
import {openDrawer, closeDrawer, DrawerAccount} from './drawer';

const TABS: Array<[TabId, string]> = [
    ['needs', 'Needs me'], ['pipeline', 'Pipeline'], ['tasks', 'Tasks'], ['calls', 'Calls'], ['money', 'Money']
];

interface Data {
    needs: NeedsRow[] | null;
    needsPartial: string[];
    calls: CallRow[] | null;
    callsTotal: number;
    error: string;
}

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
    const content = el('div');
    const drawerHost = el('div');
    root.append(head, tabs, filters, content, drawerHost);

    let route: Route = parseRoute(win.location.hash);
    const data: Data = { needs: null, needsPartial: [], calls: null, callsTotal: 0, error: '' };
    let post: Post | null = null;
    let listButtons: HTMLElement[] = [];

    // ---- Accounts on the current tab (drawer walk, selection) ----
    const accountsOf = (tab: TabId): DrawerAccount[] => {
        if (tab === 'calls') {
            const seen: Record<string, boolean> = {};
            return (data.calls || []).filter((c) => c.companyId && !seen[c.companyId] && (seen[c.companyId] = true))
                .map((c) => ({ companyId: c.companyId, name: c.companyName, entityType: 'customer', phone: c.phone }));
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
        filters.append(chip('Owner', 'Me'), chip('Range', route.tab === 'calls' ? 'This week' : 'Last 14 days'));
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
        p<{ rows: NeedsRow[]; partial?: string[] }>({ action: 'salesCentralNeeds' }).then((d) => {
            if (d.error) throw new Error(d.error);
            data.needs = d.rows || [];
            data.needsPartial = d.partial || [];
        }).catch((e: Error) => {
            data.needs = [];
            data.needsPartial = ['all: ' + e.message];
        }).then(() => render(true));
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
