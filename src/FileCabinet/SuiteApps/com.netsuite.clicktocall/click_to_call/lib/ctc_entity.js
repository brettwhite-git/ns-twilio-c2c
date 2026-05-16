/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Shared entity helpers + softphone-popup constants.
 * Single source of truth for entity-name resolution across Customer / Contact / Lead
 * record types, plus the window.open options string used by every launcher.
 */
define([], () => {

    // Phase 1 (Iteration B): popup is locked to 380 × 640 to match the
    // mobile-emulator wireframe. Resize disabled so the popup never grows
    // between tab states (Dial / Search / Recents) — internal scroll absorbs
    // overflow inside the .phone-scroll zone.
    const SOFTPHONE_POPUP_OPTIONS =
        'width=380,height=640,resizable=no,scrollbars=no,toolbar=no,menubar=no,location=no';

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
