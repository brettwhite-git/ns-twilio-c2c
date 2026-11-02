// @ts-check
/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Figtree (SIL OFL 1.1, lib/fonts/FIGTREE-OFL.txt) for the CTC Suitelets and
 * portlet. Served from the File Cabinet, not a font CDN: same origin, so
 * NetSuite's content policy never blocks it. One variable file covers every
 * weight (300–900) for Latin text.
 *
 * The file's URL never changes, so it is read once an hour at most (N/cache,
 * PROTECTED scope: shared by this SuiteApp's scripts, whatever the role).
 */
// eslint-disable-next-line suitescript/no-log-module
define(['N/file', 'N/cache', 'N/log', './ctc_html'], (file, cache, log, ctcHtml) => {

    const FIGTREE_PATH = '/SuiteApps/com.netsuite.clicktocall/lib/fonts/figtree-latin-wght-normal.woff2';
    const FONT_CACHE = 'ctc_fonts';
    const FONT_URL_KEY = 'figtree_url';
    const FONT_URL_TTL = 3600;

    // Use as the page font-family. Falls back to system fonts while Figtree
    // loads, or if the file cannot be served.
    const FONT_STACK = "Figtree, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    const MONO_STACK = "'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace";

    // A <style> body is raw text: the browser does not decode HTML entities
    // there, so '&amp;' would reach the server as a parameter named 'amp;c'
    // (media.nl then answers "Page Not Found"). Percent-encode only the
    // characters that could end the CSS string or the style element.
    const cssUrl = (u) => String(u).replace(/["'\\<>\s]/g, (ch) => '%' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));

    // The cache loader: the font file's URL ('' when it has none). Throws
    // when the file cannot be loaded (nothing is cached then).
    const loadFontUrl = () => String(file.load({ id: FIGTREE_PATH }).url || '');

    /**
     * The Figtree file's URL: from N/cache (loaded at most once per hour),
     * or straight from the File Cabinet when no cache is available.
     * @returns {string}
     */
    const figtreeUrl = () => {
        let store = null;
        try {
            store = cache.getCache({ name: FONT_CACHE, scope: cache.Scope.PROTECTED });
        } catch (e) {
            store = null;
        }
        if (!store) return loadFontUrl();
        return String(store.get({ key: FONT_URL_KEY, loader: loadFontUrl, ttl: FONT_URL_TTL }) || '');
    };

    /**
     * @font-face rule for Figtree, wrapped in a <style> tag. Empty string when
     * the font file cannot be loaded (the page then uses the system fallback).
     * Default (the portlet, which sits inside the NetSuite dashboard and has
     * no <head> of its own): font-display swap. `preload` (a page that writes
     * its own <head>, Reporting Central): a <link rel="preload"> first and
     * font-display optional, so text never re-flows when the font arrives
     * (a page view where it is not ready at once keeps the system font).
     * @param {{preload?: boolean}} [opts]
     * @returns {string}
     */
    const buildFigtreeStyle = (opts) => {
        const preload = !!(opts && opts.preload);
        let src = '';
        try {
            src = figtreeUrl();
        } catch (e) {
            log.error({ title: 'CTC Fonts — Figtree file not found', details: e.message || e });
            return '';
        }
        if (!src) return '';
        return (preload ? '<link rel="preload" href="' + ctcHtml.escapeHtml(src) + '" as="font" type="font/woff2" crossorigin>' : '') +
            '<style>@font-face{font-family:"Figtree";src:url("' + cssUrl(src) +
            '") format("woff2");font-weight:300 900;font-style:normal;font-display:' + (preload ? 'optional' : 'swap') + '}</style>';
    };

    return { FIGTREE_PATH, FONT_CACHE, FONT_URL_KEY, FONT_URL_TTL, FONT_STACK, MONO_STACK, buildFigtreeStyle };
});
