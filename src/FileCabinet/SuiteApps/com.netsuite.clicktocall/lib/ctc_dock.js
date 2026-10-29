// @ts-check
/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Telephony Dock constants + script-tag builder.
 * The softphone popup is the "anchor": the only window that holds audio and
 * call state. ctc_dock_client.js is a plain browser script that mirrors the
 * anchor on NetSuite pages over BroadcastChannel(BUS_CHANNEL).
 */
define(['./ctc_html'], (ctcHtml) => {

    const escapeHtml = ctcHtml.escapeHtml;

    // File Cabinet path of the browser-side dock script.
    const DOCK_ASSET_PATH = '/SuiteApps/com.netsuite.clicktocall/lib/ctc_dock_client.js';

    // Appended to the media URL so browsers drop a cached copy after a deploy.
    // Bump every time ctc_dock_client.js changes.
    const DOCK_ASSET_VERSION = '1';

    // BroadcastChannel name shared by the anchor (ctc_sl_softphone.js) and
    // every dock tab. Message shapes (all carry v: 1):
    //   tab → anchor: { type: 'hello' } | { type: 'request', action: 'mute' | 'unmute' | 'hangup' }
    //   anchor → tabs: { type: 'snapshot', snap: { phase, entityName, contactName, number, startedAt, muted } }
    // phase: 'offline' | 'ready' | 'dialing' | 'ringing' | 'connected' | 'error'
    const BUS_CHANNEL = 'ctc-bus';

    /**
     * Build the <script> tag that mounts the dock on a NetSuite page.
     * @param {Object} opts
     * @param {string} opts.assetUrl - File Cabinet media URL of ctc_dock_client.js
     * @param {string} opts.anchorUrl - Softphone Suitelet URL the "Open" action loads
     * @param {string} opts.popupName - window.open name of the anchor
     * @param {string} opts.popupOptions - window.open features of the anchor
     * @returns {string}
     */
    const buildDockScriptTag = (opts) => {
        if (!opts || !opts.assetUrl) return '';
        const sep = opts.assetUrl.indexOf('?') === -1 ? '?' : '&';
        const src = opts.assetUrl + sep + 'v=' + DOCK_ASSET_VERSION;
        return '<script src="' + escapeHtml(src) + '"'
            + ' data-bus="' + escapeHtml(BUS_CHANNEL) + '"'
            + ' data-anchor-url="' + escapeHtml(opts.anchorUrl || '') + '"'
            + ' data-popup-name="' + escapeHtml(opts.popupName || '') + '"'
            + ' data-popup-options="' + escapeHtml(opts.popupOptions || '') + '"'
            + '></script>';
    };

    return {
        DOCK_ASSET_PATH,
        DOCK_ASSET_VERSION,
        BUS_CHANNEL,
        buildDockScriptTag
    };
});
