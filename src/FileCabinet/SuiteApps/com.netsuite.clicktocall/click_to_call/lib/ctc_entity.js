/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Shared entity helpers + softphone-popup constants.
 * Single source of truth for entity-name resolution across Customer / Contact / Lead
 * record types, plus the window.open options string used by every launcher.
 */
// eslint-disable-next-line suitescript/no-log-module
define(['N/search', 'N/log'], (search, log) => {

    // Phase 1 (Iteration B): popup is locked to 380 × 640 to match the
    // mobile-emulator wireframe. Resize disabled so the popup never grows
    // between tab states (Dial / Search / Recents) — internal scroll absorbs
    // overflow inside the .phone-scroll zone.
    const SOFTPHONE_POPUP_OPTIONS =
        'width=380,height=640,resizable=no,scrollbars=no,toolbar=no,menubar=no,location=no';

    // Versioned popup name. window.open(url, name, features) silently
    // ignores the features string when a window with `name` already exists
    // and just loads the new URL into the stale chrome. Bump the suffix
    // every time SOFTPHONE_POPUP_OPTIONS dimensions change OR the inline
    // JS gets a load-bearing fix that reps must pick up immediately so
    // they don't keep using a stale-state popup after a deploy.
    //
    // v3 (Phase 4 fix): forces fresh popup so the deviceSelectors-crash
    // + mic-permission warm-up fixes take effect without reps needing
    // to manually close their existing popup window.
    const SOFTPHONE_POPUP_NAME = 'ctc_softphone_v3';

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

    /**
     * Iteration B Phase 3 — return the full set of contacts at a Customer /
     * Prospect / Lead entity, each with every phone they have on file.
     *
     * Wire shape per contact:
     *   { contactId, name, title, email,
     *     phones: [{ number, type, isPrimary }] }
     *
     * Phone types map to NetSuite contact fields:
     *   - phone        → 'Work'   (marked isPrimary on the first contact's first work line)
     *   - mobilephone  → 'Mobile'
     *   - homephone    → 'Home'
     *   - altphone     → 'Alt'
     *
     * Contacts with zero phones are filtered out — they can't be dialed.
     *
     * @param {string|number} entityId
     * @returns {Array<Object>} — empty array on error or no matches
     */
    const getContactsAtEntity = (entityId) => {
        if (!entityId) return [];
        try {
            const results = search.create({
                type: 'contact',
                filters: [
                    ['company', 'anyof', entityId], 'AND',
                    ['isinactive', 'is', 'F']
                ],
                columns: ['firstname', 'lastname', 'title', 'email',
                          'phone', 'mobilephone', 'homephone', 'altphone']
            }).run().getRange({ start: 0, end: 50 });

            const contacts = results.map((r) => {
                const phones = [];
                const work   = r.getValue('phone') || '';
                const mobile = r.getValue('mobilephone') || '';
                const home   = r.getValue('homephone') || '';
                const alt    = r.getValue('altphone') || '';
                if (work)   phones.push({ number: work,   type: 'Work',   isPrimary: false });
                if (mobile) phones.push({ number: mobile, type: 'Mobile', isPrimary: false });
                if (home)   phones.push({ number: home,   type: 'Home',   isPrimary: false });
                if (alt)    phones.push({ number: alt,    type: 'Alt',    isPrimary: false });
                const first = r.getValue('firstname') || '';
                const last  = r.getValue('lastname') || '';
                return {
                    contactId: String(r.id),
                    name: (first + ' ' + last).trim() || ('Contact ' + r.id),
                    title: r.getValue('title') || '',
                    email: r.getValue('email') || '',
                    phones: phones
                };
            }).filter((c) => c.phones.length > 0);

            // Flag the very first phone (across the first contact returned)
            // as the primary so the picker can preselect something sensible.
            if (contacts.length && contacts[0].phones.length) {
                contacts[0].phones[0].isPrimary = true;
            }
            return contacts;
        } catch (e) {
            log.error({ title: 'CTC getContactsAtEntity failed', details: e.message || e });
            return [];
        }
    };

    return {
        SOFTPHONE_POPUP_OPTIONS,
        SOFTPHONE_POPUP_NAME,
        resolveEntityName,
        getContactsAtEntity
    };
});
