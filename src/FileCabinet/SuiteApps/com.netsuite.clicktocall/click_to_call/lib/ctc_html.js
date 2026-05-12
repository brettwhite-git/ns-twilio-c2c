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

    return { escapeHtml, escapeJs };
});
