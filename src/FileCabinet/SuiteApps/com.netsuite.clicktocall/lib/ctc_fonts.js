// @ts-check
/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Figtree (SIL OFL 1.1, lib/fonts/FIGTREE-OFL.txt) for the CTC Suitelets and
 * portlet. Served from the File Cabinet, not a font CDN: same origin, so
 * NetSuite's content policy never blocks it. One variable file covers every
 * weight (300–900) for Latin text.
 */
// eslint-disable-next-line suitescript/no-log-module
define(['N/file', 'N/log'], (file, log) => {

    const FIGTREE_PATH = '/SuiteApps/com.netsuite.clicktocall/lib/fonts/figtree-latin-wght-normal.woff2';

    // Use as the page font-family. Falls back to system fonts while Figtree
    // loads (font-display: swap) or if the file cannot be served.
    const FONT_STACK = "Figtree, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    const MONO_STACK = "'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace";

    // A <style> body is raw text: the browser does not decode HTML entities
    // there, so '&amp;' would reach the server as a parameter named 'amp;c'
    // (media.nl then answers "Page Not Found"). Percent-encode only the
    // characters that could end the CSS string or the style element.
    const cssUrl = (u) => String(u).replace(/["'\\<>\s]/g, (ch) => '%' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));

    /**
     * @font-face rule for Figtree, wrapped in a <style> tag. Empty string when
     * the font file cannot be loaded (the page then uses the system fallback).
     * @returns {string}
     */
    const buildFigtreeStyle = () => {
        let src = '';
        try {
            src = file.load({ id: FIGTREE_PATH }).url;
        } catch (e) {
            log.error({ title: 'CTC Fonts — Figtree file not found', details: e.message || e });
            return '';
        }
        if (!src) return '';
        return '<style>@font-face{font-family:"Figtree";src:url("' + cssUrl(src)
            + '") format("woff2");font-weight:300 900;font-style:normal;font-display:swap}</style>';
    };

    return { FIGTREE_PATH, FONT_STACK, MONO_STACK, buildFigtreeStyle };
});
