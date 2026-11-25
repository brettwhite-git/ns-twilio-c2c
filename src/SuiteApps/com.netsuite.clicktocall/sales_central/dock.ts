/**
 * Sales Central: the phone dock on this page (the spike's way, asset 44).
 * The shell's ?mount=1 gives the dock scripts and the RESTlet URL; the
 * dock follows the account the drawer shows (setContext) and Call opens
 * the dialer with it (it never dials by itself).
 */

const MOUNT_URL =
    '/app/site/hosting/scriptlet.nl?script=customscript_ctc_sl_shell&deploy=customdeploy_ctc_sl_shell&mount=1';

export interface DockContext { entityId: string; entityName: string; entityType: string; phone: string; }

interface DockApi {
    mode: string;
    call?: (ctx?: DockContext | null) => void;
    setContext?: (ctx: DockContext | null) => void;
}

export type DockWindow = Window & { __ctcDock?: DockApi };

interface DockMount { ok: boolean; assetUrl?: string; dialerUrl?: string; attrs?: Array<[string, string]>; }

const loadScript = (src: string, attrs: Array<[string, string]>): Promise<void> =>
    new Promise((resolve, reject) => {
        const s = document.createElement('script');
        attrs.forEach(([k, v]) => s.setAttribute(k, v));
        s.src = src;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('Could not load the phone'));
        document.body.appendChild(s);
    });

/**
 * Reads the mount data and starts the dock scripts. Resolves with the
 * RESTlet URL at once, so the page loads its data while the dock scripts
 * load (`ready`).
 */
export const mountDock = (win: DockWindow): Promise<{ restlet: string; ready: Promise<void> }> =>
    fetch(MOUNT_URL, { credentials: 'same-origin' })
        .then((r) => r.json() as Promise<DockMount>)
        .then((m) => {
            if (!m || !m.ok || !m.assetUrl || !m.dialerUrl) throw new Error('The phone is not set up for this account');
            const attrs = m.attrs || [];
            const restlet = (attrs.find(([k]) => k === 'data-restlet-url') || ['', ''])[1];
            const ready = win.__ctcDock ? Promise.resolve()
                : loadScript(m.assetUrl, attrs).then(() => loadScript(m.dialerUrl as string, []));
            return { restlet, ready };
        });

export const setDockContext = (win: DockWindow, ctx: DockContext | null): void => {
    const d = win.__ctcDock;
    if (d && typeof d.setContext === 'function') d.setContext(ctx);
};

export const callWithDock = (win: DockWindow, ctx: DockContext): boolean => {
    const d = win.__ctcDock;
    if (!d || typeof d.call !== 'function') return false;
    d.call(ctx);
    return true;
};
