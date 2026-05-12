/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Shared entity helpers + softphone-popup constants.
 * Single source of truth for entity-name resolution across Customer / Contact / Lead
 * record types, plus the window.open options string used by every launcher.
 */
define([], () => {

    const SOFTPHONE_POPUP_OPTIONS =
        'width=400,height=720,resizable=yes,scrollbars=yes,toolbar=no,menubar=no,location=no';

    const SOFTPHONE_POPUP_NAME = 'ctc_softphone';

    /**
     * Resolve a display name from a NetSuite record by type.
     * - contact → firstname + lastname (falls back to record id)
     * - customer / lead → companyname, else firstname + lastname, else entityid, else id
     * @param {Object} rec - currentRecord or newRecord instance with .getValue() and .id
     * @param {string} recType - lowercase record type string ('contact', 'customer', 'lead')
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

    return {
        SOFTPHONE_POPUP_OPTIONS,
        SOFTPHONE_POPUP_NAME,
        resolveEntityName
    };
});
