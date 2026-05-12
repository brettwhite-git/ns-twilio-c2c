/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 *
 * Adds a Click-to-Call button to Customer, Contact, and Lead forms.
 * Visible in both view and edit mode.
 */
// eslint-disable-next-line suitescript/no-log-module
define(['N/url', 'N/runtime', 'N/log'], (url, runtime, log) => {

    /**
     * beforeLoad — add a Call button to the form.
     * @param {Object} context
     * @param {Object} context.form
     * @param {Object} context.newRecord
     * @param {string} context.type
     */
    const beforeLoad = (context) => {
        const type = context.type;
        if (type !== context.UserEventType.VIEW && type !== context.UserEventType.EDIT) return;

        const rec = context.newRecord;
        const recType = String(rec.type).toLowerCase();
        const recId = String(rec.id);

        const phone = rec.getValue({ fieldId: 'phone' });
        if (!phone) return;

        const entityName = resolveEntityName(rec, recType);

        let softphoneUrl = '';
        try {
            softphoneUrl = url.resolveScript({
                scriptId: 'customscript_ctc_sl_softphone',
                deploymentId: 'customdeploy_ctc_sl_softphone',
                params: {
                    phone: phone,
                    entityId: recId,
                    entityName: entityName,
                    entityType: recType
                }
            });
        } catch (e) {
            log.error({ title: 'CTC UE — Failed to resolve Suitelet URL', details: e.message || e });
            return;
        }

        const escapedUrl = softphoneUrl.replace(/'/g, "\\'");
        const buttonLabel = '☎ Call ' + capitalize(recType);
        context.form.addButton({
            id: 'custpage_ctc_call',
            label: buttonLabel,
            functionName: "window.open('" + escapedUrl + "','ctc_softphone','width=400,height=720,resizable=yes,scrollbars=yes,toolbar=no,menubar=no,location=no')"
        });

        // Inject inline script to add clickable phone icons next to phone field values,
        // plus CSS that promotes the Call button to NetSuite's primary blue style.
        const popupOpts = 'width=400,height=720,resizable=yes,scrollbars=yes,toolbar=no,menubar=no,location=no';
        const inlineField = context.form.addField({
            id: 'custpage_ctc_inline',
            type: 'INLINEHTML',
            label: ' '
        });
        inlineField.defaultValue = buildPhoneIconScript(softphoneUrl, popupOpts) + buildCallButtonStyle();
    };

    /**
     * Capitalize first letter of an entity type for button labels.
     */
    const capitalize = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

    /**
     * Inline CSS that promotes the Call button to NetSuite's primary blue style with
     * white text + white phone glyph. Selectors are deliberately broad because NetSuite
     * renders form buttons with multiple wrappers depending on theme.
     */
    const buildCallButtonStyle = () => {
        return `<style>
input#custpage_ctc_call,
button#custpage_ctc_call,
a#custpage_ctc_call,
#tbl_custpage_ctc_call input,
#tbl_custpage_ctc_call button,
#tbl_custpage_ctc_call a {
    background-color: #345D7E !important;
    background-image: none !important;
    color: #FFFFFF !important;
    border-color: #345D7E !important;
    font-weight: 600 !important;
}
input#custpage_ctc_call:hover,
button#custpage_ctc_call:hover,
a#custpage_ctc_call:hover,
#tbl_custpage_ctc_call input:hover,
#tbl_custpage_ctc_call button:hover,
#tbl_custpage_ctc_call a:hover {
    background-color: #2B4D69 !important;
    border-color: #2B4D69 !important;
    color: #FFFFFF !important;
}
</style>`;
    };

    /**
     * Build an inline script that injects clickable phone icons next to phone field values.
     * @param {string} softphoneUrl - Resolved Suitelet URL
     * @param {string} popupOpts - Window.open options string
     * @returns {string} HTML string with script tag
     */
    const buildPhoneIconScript = (softphoneUrl, popupOpts) => {
        const jsUrl = softphoneUrl.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/</g, '\\x3c');
        const jsOpts = popupOpts.replace(/'/g, "\\'");
        return `<script>
(function() {
    'use strict';
    function addIcon(el) {
        if (!el || el.querySelector('.ctc-phone-icon')) return;
        var a = document.createElement('a');
        a.className = 'ctc-phone-icon';
        a.href = '#';
        a.title = 'Click to call';
        a.style.cssText = 'margin-left:6px;text-decoration:none;font-size:14px;cursor:pointer;';
        a.textContent = '\\u{1F4DE}';
        a.onclick = function(e) {
            e.preventDefault();
            window.open('${jsUrl}', 'ctc_softphone', '${jsOpts}');
        };
        el.appendChild(a);
    }
    function tryInject() {
        var val = document.getElementById('phone_val');
        if (val && val.textContent.trim()) { addIcon(val); return; }
        var fs = document.querySelector('#phone_fs .uir-field');
        if (fs && fs.textContent.trim()) { addIcon(fs); return; }
        var tds = document.querySelectorAll('td.text');
        for (var i = 0; i < tds.length; i++) {
            var prev = tds[i].previousElementSibling;
            if (prev && /\\bPhone\\b/.test(prev.textContent) && tds[i].textContent.trim()) {
                addIcon(tds[i]);
                return;
            }
        }
    }
    if (document.readyState === 'complete') { tryInject(); }
    else { window.addEventListener('load', tryInject); }
})();
</script>`;
    };

    /**
     * Resolve a display name for the entity based on record type.
     * @param {Object} rec
     * @param {string} recType
     * @returns {string}
     */
    const resolveEntityName = (rec, recType) => {
        if (recType === 'contact') {
            const first = rec.getValue({ fieldId: 'firstname' }) || '';
            const last = rec.getValue({ fieldId: 'lastname' }) || '';
            return (first + ' ' + last).trim() || String(rec.id);
        }
        const company = rec.getValue({ fieldId: 'companyname' });
        if (company) return String(company);

        const first = rec.getValue({ fieldId: 'firstname' }) || '';
        const last = rec.getValue({ fieldId: 'lastname' }) || '';
        const fullName = (first + ' ' + last).trim();
        if (fullName) return fullName;

        return rec.getValue({ fieldId: 'entityid' }) || String(rec.id);
    };

    return { beforeLoad };
});
