/**
 * Sales Central spike (2026-11-21, throwaway) — the page, in plain DOM.
 *
 * What it proves (tasks/todo.md, spike Q2–Q6):
 *  - the dock mounts on an SPA page from the shell's ?mount=1 data;
 *  - in phone mode (frame) Call reaches the shell's dialer;
 *  - switching account without a reload moves the dialer's context
 *    (window.__ctcDock.setContext);
 *  - outside phone mode the dock behaves as on a record page.
 * The log at the bottom shows each step, so the live session needs no
 * devtools.
 */

const SHELL_MOUNT_URL =
    '/app/site/hosting/scriptlet.nl?script=customscript_ctc_sl_shell&deploy=customdeploy_ctc_sl_shell&mount=1';

interface DockContext {
    entityId: string;
    entityName: string;
    entityType: string;
    phone: string;
}

interface BookRow {
    id: string;
    type: string;
    companyName: string;
    contactName?: string;
    phone?: string;
}

interface DockMount {
    ok: boolean;
    assetUrl?: string;
    dialerUrl?: string;
    attrs?: Array<[string, string]>;
}

interface DockApi {
    mode: string;
    call?: (ctx?: DockContext | null) => void;
    setContext?: (ctx: DockContext | null) => void;
}

type SpikeWindow = Window & { __ctcDock?: DockApi };

export const rowToContext = (r: BookRow): DockContext => ({
    entityId: String(r.id || ''),
    entityName: String(r.companyName || ''),
    entityType: String(r.type || 'customer'),
    phone: String(r.phone || '')
});

const el = (tag: string, text?: string, style?: string): HTMLElement => {
    const e = document.createElement(tag);
    if (text) e.textContent = text;
    if (style) e.setAttribute('style', style);
    return e;
};

const loadScript = (src: string, attrs: Array<[string, string]>): Promise<void> =>
    new Promise((resolve, reject) => {
        const s = document.createElement('script');
        attrs.forEach(([k, v]) => s.setAttribute(k, v));
        s.src = src;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('could not load ' + src.split('?')[0].slice(-40)));
        document.body.appendChild(s);
    });

export const buildSpikePage = (root: HTMLElement, win: SpikeWindow): void => {
    root.setAttribute('style', 'padding:24px 32px;font:14px/1.45 -apple-system,Helvetica,Arial,sans-serif;color:#161513;max-width:880px');
    root.appendChild(el('h1', 'Sales Central spike', 'font-size:22px;margin:0 0 4px'));
    root.appendChild(el('p', 'Throwaway page: is the phone dock usable inside an SPA? Pick an account, then Call.', 'margin:0 0 18px;color:#5C5955'));

    const current = el('div', 'No account selected', 'font-weight:600;margin-bottom:10px');
    const list = el('div', '', 'display:flex;flex-direction:column;gap:6px;margin-bottom:20px');
    const logBox = el('pre', '', 'background:#F1EFED;border-radius:8px;padding:10px 12px;font:12px/1.5 ui-monospace,Menlo,monospace;white-space:pre-wrap;min-height:120px');
    root.appendChild(current);
    root.appendChild(list);
    root.appendChild(el('div', 'Log', 'font-weight:600;margin-bottom:6px'));
    root.appendChild(logBox);

    const log = (msg: string): void => {
        const t = new Date().toTimeString().slice(0, 8);
        logBox.textContent = t + '  ' + msg + '\n' + logBox.textContent;
        try { console.log('[ctc-sc-spike] ' + msg); } catch { /* no console */ }
    };

    const inShell = (): boolean => {
        try { return win.top !== win && !!(win.top as unknown as { __ctcShell?: unknown }).__ctcShell; } catch { return false; }
    };

    const select = (ctx: DockContext): void => {
        current.textContent = ctx.entityName + (ctx.phone ? ' · ' + ctx.phone : ' · no phone');
        const dock = win.__ctcDock;
        if (dock && typeof dock.setContext === 'function') {
            dock.setContext(ctx);
            log('context sent: ' + ctx.entityName + ' (' + dock.mode + ')');
        } else {
            log('no dock.setContext (' + (dock ? dock.mode : 'no dock') + ')');
        }
    };

    const call = (ctx: DockContext): void => {
        select(ctx);
        const dock = win.__ctcDock;
        if (dock && typeof dock.call === 'function') {
            dock.call(ctx);
            log('call: ' + ctx.entityName + ' via ' + dock.mode);
        } else {
            log('no dock to call with');
        }
    };

    const renderRows = (rows: BookRow[]): void => {
        list.textContent = '';
        if (!rows.length) {
            list.appendChild(el('div', 'No accounts in your book. Open this page as a rep.', 'color:#5C5955'));
            return;
        }
        rows.forEach((r) => {
            const ctx = rowToContext(r);
            const row = el('div', '', 'display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid #E4E1DC;border-radius:8px;background:#fff');
            const name = el('button', ctx.entityName, 'all:unset;cursor:pointer;flex:1;font-weight:600');
            name.addEventListener('click', () => select(ctx));
            row.appendChild(name);
            row.appendChild(el('span', ctx.entityType + (ctx.phone ? ' · ' + ctx.phone : ''), 'color:#5C5955;font-size:13px'));
            const btn = el('button', 'Call', 'border:0;border-radius:8px;background:#436B1D;color:#fff;font-weight:600;padding:6px 14px;cursor:pointer');
            (btn as HTMLButtonElement).disabled = !ctx.phone;
            btn.addEventListener('click', () => call(ctx));
            row.appendChild(btn);
            list.appendChild(row);
        });
    };

    log('page loaded; phone mode: ' + (inShell() ? 'yes (frame)' : 'no'));

    fetch(SHELL_MOUNT_URL, { credentials: 'same-origin' })
        .then((r) => r.json() as Promise<DockMount>)
        .then((m) => {
            if (!m || !m.ok || !m.assetUrl || !m.dialerUrl) throw new Error('mount data unavailable');
            const attrs = m.attrs || [];
            const restlet = (attrs.find(([k]) => k === 'data-restlet-url') || ['', ''])[1];
            const dockReady = win.__ctcDock
                ? Promise.resolve()
                : loadScript(m.assetUrl, attrs).then(() => loadScript(m.dialerUrl as string, []));
            return dockReady.then(() => {
                log('dock mounted: mode ' + (win.__ctcDock ? win.__ctcDock.mode : 'none'));
                return fetch(restlet, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'softphoneSuggested', limit: 6 })
                }).then((r) => r.json());
            });
        })
        .then((d: { rows?: BookRow[]; error?: string }) => {
            if (d && d.error) log('accounts: ' + d.error);
            renderRows((d && d.rows) || []);
        })
        .catch((e: Error) => log('error: ' + (e && e.message)));
};
