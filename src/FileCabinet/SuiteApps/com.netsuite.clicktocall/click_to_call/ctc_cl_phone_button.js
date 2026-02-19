/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 *
 * Injects click-to-call phone icons on Customer, Contact, and Lead records.
 * Clicking an icon opens the softphone Suitelet popup.
 */
define(['N/url', 'N/currentRecord'], (url, currentRecord) => {

    const PHONE_FIELDS_BY_TYPE = {
        customer:  ['phone', 'altphone'],
        contact:   ['phone', 'altphone', 'mobilephone'],
        lead:      ['phone', 'altphone']
    };

    /**
     * pageInit — inject call buttons next to phone fields.
     * @param {Object} context
     * @param {Object} context.currentRecord
     */
    const pageInit = (context) => {
        const rec = context.currentRecord;
        const recType = String(rec.type).toLowerCase();
        const recId = String(rec.id);

        const phoneFields = PHONE_FIELDS_BY_TYPE[recType];
        if (!phoneFields) return;

        const entityName = resolveEntityName(rec, recType);

        phoneFields.forEach((fieldId) => {
            const phoneValue = rec.getValue({ fieldId });
            if (!phoneValue) return;

            injectCallButton(fieldId, String(phoneValue), recId, entityName);
        });
    };

    /**
     * Resolve a display name for the entity based on record type.
     * @param {Object} rec - currentRecord instance
     * @param {string} recType - lowercase record type
     * @returns {string}
     */
    const resolveEntityName = (rec, recType) => {
        if (recType === 'contact') {
            const first = rec.getValue({ fieldId: 'firstname' }) || '';
            const last = rec.getValue({ fieldId: 'lastname' }) || '';
            return (first + ' ' + last).trim() || String(rec.id);
        }
        // Customer and Lead — try companyname, fall back to firstname+lastname, then entityid
        const company = rec.getValue({ fieldId: 'companyname' });
        if (company) return String(company);

        const first = rec.getValue({ fieldId: 'firstname' }) || '';
        const last = rec.getValue({ fieldId: 'lastname' }) || '';
        const fullName = (first + ' ' + last).trim();
        if (fullName) return fullName;

        return rec.getValue({ fieldId: 'entityid' }) || String(rec.id);
    };

    /**
     * Inject a phone icon button next to a field label in the DOM.
     * @param {string} fieldId
     * @param {string} phoneNumber
     * @param {string} entityId
     * @param {string} entityName
     */
    const injectCallButton = (fieldId, phoneNumber, entityId, entityName) => {
        // Try known NetSuite label selectors
        const selectors = [
            fieldId + '_fs_lbl_uir_label',
            fieldId + '_fs_lbl',
            fieldId + '_fs'
        ];

        let target = null;
        for (let i = 0; i < selectors.length; i++) {
            target = document.getElementById(selectors[i]);
            if (target) break;
        }
        if (!target) return;

        // Prevent duplicate injection
        if (target.querySelector('[data-ctc-btn="' + fieldId + '"]')) return;

        const btn = document.createElement('span');
        btn.setAttribute('data-ctc-btn', fieldId);
        btn.textContent = '\u{1F4DE}';
        btn.title = 'Call ' + phoneNumber;
        btn.style.cssText = 'cursor:pointer;margin-left:6px;font-size:14px;vertical-align:middle;';

        btn.addEventListener('click', () => {
            openSoftphone(phoneNumber, entityId, entityName);
        });

        target.appendChild(btn);
    };

    /**
     * Open the softphone Suitelet in a popup window.
     * @param {string} phoneNumber
     * @param {string} entityId
     * @param {string} entityName
     */
    const openSoftphone = (phoneNumber, entityId, entityName) => {
        const softphoneUrl = url.resolveScript({
            scriptId: 'customscript_ctc_sl_softphone',
            deploymentId: 'customdeploy_ctc_sl_softphone',
            params: {
                phone: phoneNumber,
                entityId: entityId,
                entityName: entityName
            }
        });

        window.open(
            softphoneUrl,
            'ctc_softphone',
            'width=380,height=500,resizable=no,scrollbars=no,toolbar=no,menubar=no,location=no'
        );
    };

    return { pageInit };
});
