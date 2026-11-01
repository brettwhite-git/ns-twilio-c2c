// @ts-check
/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Shared HTML/JS escape helpers for Suitelet HTML rendering and
 * inline-script injection. Single source of truth for XSS sanitization.
 */
define([], () => {

    /**
     * Escape HTML special characters to prevent XSS when embedding untrusted
     * values inside HTML text content or attribute values.
     * @param {*} str
     * @returns {string}
     */
    const escapeHtml = (str) => {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    /**
     * Escape a value for safe embedding inside a JS single-quoted string literal
     * within a <script> block. Prevents string-break / script-tag-break XSS.
     * @param {*} str
     * @returns {string}
     */
    const escapeJs = (str) => {
        return String(str)
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/</g, '\\x3c')
            .replace(/>/g, '\\x3e')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r');
    };

    /**
     * JSON.stringify wrapped to be safe inside <script> blocks — escapes `<` to its
     * unicode escape so an entity-name string containing `</script>` cannot terminate
     * the inline script tag and inject executable code.
     * @param {*} val
     * @returns {string} JSON string safe to inline inside a <script> ... </script> block
     */
    const safeJsonEmbed = (val) => JSON.stringify(val).replace(/</g, '\\u003c');

    /**
     * Tell the browser never to cache a Suitelet page (Cache-Control
     * no-store, Pragma no-cache). The phone mode shell and the softphone
     * must always load fresh after a sign-in. A header the runtime refuses
     * never breaks the page.
     * @param {{setHeader: Function}} response - Suitelet context.response
     */
    const setNoStoreHeaders = (response) => {
        [['Cache-Control', 'no-store, max-age=0'], ['Pragma', 'no-cache']].forEach((h) => {
            try {
                response.setHeader({ name: h[0], value: h[1] });
            } catch (e) {
                // Header not allowed or no setHeader: serve the page anyway.
            }
        });
    };

    return { escapeHtml, escapeJs, safeJsonEmbed, setNoStoreHeaders };
});
