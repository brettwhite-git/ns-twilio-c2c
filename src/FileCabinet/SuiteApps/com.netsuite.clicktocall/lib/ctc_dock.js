// @ts-check
/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Telephony Dock constants + mount builders.
 * The softphone popup is the "anchor": the only window that holds audio and
 * call state. The dock (ctc_dock_client.js + ctc_dock_dialer.js) is plain
 * browser JS that runs the softphone UI on NetSuite pages and talks to the
 * anchor over BroadcastChannel(BUS_CHANNEL). Data (search, contacts, recents,
 * snapshot) comes straight from the ctc_rl_token RESTlet, same session.
 */
define(['./ctc_html'], (ctcHtml) => {

    const escapeHtml = ctcHtml.escapeHtml;
    const escapeJs = ctcHtml.escapeJs;

    // File Cabinet paths of the browser-side dock scripts, in load order.
    const DOCK_ASSET_PATH = '/SuiteApps/com.netsuite.clicktocall/lib/ctc_dock_client.js';
    const DIALER_ASSET_PATH = '/SuiteApps/com.netsuite.clicktocall/lib/ctc_dock_dialer.js';

    // Appended to the media URLs so browsers drop cached copies after a deploy.
    // Bump every time ctc_dock_client.js or ctc_dock_dialer.js changes.
    const DOCK_ASSET_VERSION = '2';

    // BroadcastChannel name shared by the anchor (ctc_sl_softphone.js) and
    // every dock tab. Message shapes (all carry v: 1):
    //   tab → anchor: { type: 'hello' }
    //                 { type: 'request', action: 'mute' | 'unmute' | 'hangup' }
    //                 { type: 'request', action: 'digits', d }
    //                 { type: 'request', action: 'dial', to, entityId, entityName, entityType, contactId, contactName }
    //   anchor → tabs: { type: 'snapshot', snap: { phase, entityId, entityType, entityName,
    //                    contactName, number, startedAt, muted, lastLog } }
    // phase: 'offline' | 'starting' | 'ready' | 'dialing' | 'ringing' | 'connected' | 'error'
    // lastLog: null | { status: 'saved' | 'skipped' | 'error', message, recordUrl }
    const BUS_CHANNEL = 'ctc-bus';

    /**
     * @typedef {Object} DockMountOptions
     * @property {string} anchorUrl - Softphone Suitelet URL the anchor opens with
     * @property {string} popupName - window.open name of the anchor
     * @property {string} popupOptions - window.open features of the anchor
     * @property {string} [restletUrl] - ctc_rl_token RESTlet URL (same origin)
     * @property {{entityId?: string, entityName?: string, entityType?: string, phone?: string}} [context] - Record the page shows
     * @property {string} [assetUrl] - media URL of ctc_dock_client.js
     * @property {string} [dialerUrl] - media URL of ctc_dock_dialer.js
     */

    const withVersion = (assetUrl) =>
        assetUrl + (assetUrl.indexOf('?') === -1 ? '?' : '&') + 'v=' + DOCK_ASSET_VERSION;

    /**
     * data-* attributes the dock reads from its <script> element.
     * @param {DockMountOptions} opts
     * @returns {Array<[string, string]>}
     */
    const dockAttributes = (opts) => {
        const ctx = opts.context || {};
        return [
            ['data-bus', BUS_CHANNEL],
            ['data-anchor-url', opts.anchorUrl || ''],
            ['data-popup-name', opts.popupName || ''],
            ['data-popup-options', opts.popupOptions || ''],
            ['data-restlet-url', opts.restletUrl || ''],
            ['data-entity-id', String(ctx.entityId || '')],
            ['data-entity-name', String(ctx.entityName || '')],
            ['data-entity-type', String(ctx.entityType || '')],
            ['data-phone', String(ctx.phone || '')]
        ];
    };

    /**
     * Script tags that mount the dock on a page that runs scripts (record pages).
     * The dialer tag carries no attributes; it attaches to window.__ctcDock.
     * @param {DockMountOptions} opts - assetUrl and dialerUrl are required here
     * @returns {string}
     */
    const buildDockScriptTag = (opts) => {
        if (!opts || !opts.assetUrl || !opts.dialerUrl) return '';
        const attrs = dockAttributes(opts)
            .map(([k, v]) => ' ' + k + '="' + escapeHtml(v) + '"')
            .join('');
        return '<script src="' + escapeHtml(withVersion(opts.assetUrl)) + '"' + attrs + '></script>'
            + '<script src="' + escapeHtml(withVersion(opts.dialerUrl)) + '"></script>';
    };

    /**
     * Dock loader for HTML portlets. NetSuite parses portlet HTML in a
     * throwaway iframe, copies innerHTML to the dashboard, and strips every
     * <script>; only inline on* attribute strings survive. A broken <img>
     * fires onerror once it lands in the live page, and the handler appends
     * the dock scripts there. The window.__ctcDock and data-ctc-dock-loader
     * guards keep it to one dock per page (the iframe copy may fire too; that
     * document is thrown away).
     * @param {DockMountOptions} opts - assetUrl and dialerUrl are required here
     * @returns {string}
     */
    const buildDockLoaderHtml = (opts) => {
        if (!opts || !opts.assetUrl || !opts.dialerUrl) return '';
        const setAttrs = dockAttributes(opts)
            .map(([k, v]) => "s.setAttribute('" + k + "','" + escapeJs(v) + "');")
            .join('');
        const js = "if(!window.__ctcDock&&!document.querySelector('script[data-ctc-dock-loader]')){"
            + "var s=document.createElement('script');s.src='" + escapeJs(withVersion(opts.assetUrl)) + "';"
            + setAttrs
            + "s.setAttribute('data-ctc-dock-loader','');"
            + "s.onload=function(){var d=document.createElement('script');d.src='" + escapeJs(withVersion(opts.dialerUrl)) + "';document.body.appendChild(d);};"
            + "document.body.appendChild(s);}";
        return '<img alt="" src="data:," style="display:none" onerror="' + escapeHtml(js) + '">';
    };

    return {
        DOCK_ASSET_PATH,
        DIALER_ASSET_PATH,
        DOCK_ASSET_VERSION,
        BUS_CHANNEL,
        dockAttributes,
        buildDockScriptTag,
        buildDockLoaderHtml
    };
});
