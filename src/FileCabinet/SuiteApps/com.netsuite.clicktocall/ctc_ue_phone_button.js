/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 *
 * Adds a Click-to-Call button to Customer, Contact, and Lead forms.
 * Visible in both view and edit mode.
 */
// eslint-disable-next-line suitescript/no-log-module
define(['N/url', 'N/runtime', 'N/log', './lib/ctc_entity', './lib/ctc_config'], (url, runtime, log, ctcEntity, ctcConfig) => {

    const resolveEntityName = ctcEntity.resolveEntityName;

    /**
     * U9 / U8: gate the phone-icon injection on `custrecord_ctc_active`.
     * On fresh installs the wizard hasn't run, so `cfg.active === false`
     * and we suppress the button entirely — reps never see a broken icon.
     * Once the wizard's preflight passes and admin clicks Activate,
     * `cfg.active` flips to true and the icon appears on the next form load.
     *
     * Back-compat: existing installs (pre-Phase 2) had a populated config
     * but no `active` field; we treat that as "active=true" so legacy
     * installs don't lose the icon at deploy time.
     */
    const isCtcActive = () => {
        try {
            const cfg = ctcConfig.loadConfig();
            if (cfg.active === true) return true;
            // Back-compat: populated config + unset active → treat as active
            if (cfg.accountSid && cfg.accountSid.length > 0) return true;
            return false;
        } catch (e) {
            // No config record at all = fresh install before wizard ran
            return false;
        }
    };

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

        // U9: gate on the active flag — wizard must have activated
        // CTC for the icon to appear. Prevents reps from seeing a
        // broken phone button on fresh customer installs.
        if (!isCtcActive()) return;

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
            label: 'Call ' + capitalize(recType),
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
        // Inline white SVG handset (Heroicons solid `phone`, fill = #FFFFFF) embedded as
        // a data URI so we don't need a File Cabinet round-trip for a 1KB icon. NetSuite
        // form buttons can't carry HTML labels, so the icon rides in via background-image
        // with extra padding-left to make room.
        const ICON = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23FFFFFF'><path d='M1.5 4.5a3 3 0 0 1 3-3h1.372c.86 0 1.61.586 1.819 1.42l1.105 4.423a1.875 1.875 0 0 1-.694 1.955l-1.293.97c-.135.101-.164.249-.126.352a11.285 11.285 0 0 0 6.697 6.697c.103.038.25.009.352-.126l.97-1.293a1.875 1.875 0 0 1 1.955-.694l4.423 1.105c.834.209 1.42.959 1.42 1.82V19.5a3 3 0 0 1-3 3h-2.25C8.552 22.5 1.5 15.448 1.5 6.75V4.5z'/></svg>\")";
        return `<style>
input#custpage_ctc_call,
button#custpage_ctc_call,
a#custpage_ctc_call,
#tbl_custpage_ctc_call input,
#tbl_custpage_ctc_call button,
#tbl_custpage_ctc_call a {
    background-color: #345D7E !important;
    background-image: ${ICON} !important;
    background-repeat: no-repeat !important;
    background-position: 9px center !important;
    background-size: 13px 13px !important;
    padding-left: 28px !important;
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
    background-image: ${ICON} !important;
    background-repeat: no-repeat !important;
    background-position: 9px center !important;
    background-size: 13px 13px !important;
    border-color: #2B4D69 !important;
    color: #FFFFFF !important;
}
</style>`;
    };


    return { beforeLoad };
});
