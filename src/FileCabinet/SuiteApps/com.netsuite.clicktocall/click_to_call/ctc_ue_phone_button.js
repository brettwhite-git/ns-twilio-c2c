/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 *
 * Adds a Click-to-Call button to Customer, Contact, and Lead forms.
 * Visible in both view and edit mode.
 */
// eslint-disable-next-line suitescript/no-log-module
define(['N/url', 'N/runtime', 'N/log', './lib/ctc_entity'], (url, runtime, log, ctcEntity) => {

    const resolveEntityName = ctcEntity.resolveEntityName;

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
                    entityType: recType,
                    // Iteration B Phase 2: tells the Suitelet which default tab to open.
                    // 'record' → Dial tab pre-filled (this path). 'dashboard' → Search tab
                    // default (passed by the portlet's softphone launchers).
                    entryPoint: 'record'
                }
            });
        } catch (e) {
            log.error({ title: 'CTC UE — Failed to resolve Suitelet URL', details: e.message || e });
            return;
        }

        const escapedUrl = softphoneUrl.replace(/'/g, "\\'");
        context.form.addButton({
            id: 'custpage_ctc_call',
            label: '☎ Call ' + capitalize(recType),
            functionName: "window.open('" + escapedUrl + "','" + ctcEntity.SOFTPHONE_POPUP_NAME + "','" + ctcEntity.SOFTPHONE_POPUP_OPTIONS + "')"
        });

        // Inject CSS that promotes the toolbar Call button to NetSuite's primary blue
        // style. Field-level phone icons were removed — the toolbar button is sufficient.
        const inlineField = context.form.addField({
            id: 'custpage_ctc_inline',
            type: 'INLINEHTML',
            label: ' '
        });
        inlineField.defaultValue = buildCallButtonStyle();
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


    return { beforeLoad };
});
