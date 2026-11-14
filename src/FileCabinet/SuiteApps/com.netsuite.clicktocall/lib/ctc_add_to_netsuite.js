// @ts-check
/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * "Add to NetSuite" for unknown numbers (DESIGN.md §6, tasks/todo.md A1).
 * Server-side actions behind the panel sheet; the RESTlet routes come
 * later (A2). Every function takes one params object, returns a plain
 * object and never throws:
 *   - success: { ok: true, ... }
 *   - failure: { ok: false, error: '<code>', message: '<rep-readable>' }
 * Error codes: invalid, no_permission, not_found, not_owner, duplicate,
 * no_empty_field, failed.
 *
 * Phone numbers: same rule as lookupCallerByPhone in
 * lib/ctc_workspace_queries.js (not exported there): strip non-digits,
 * accept 7-15 digits (input at most 32 characters), match on the last 10
 * digits (fewer when the number is shorter), with REGEXP_REPLACE on the
 * stored side in SuiteQL. A number is stored as '+' + digits when the
 * input starts with '+', else as digits.
 *
 * Phone fields (NetSuite records browser):
 *   - contact:                     phone (main), mobilephone, officephone, homephone
 *   - customer / lead / prospect:  phone, altphone, mobilephone, homephone
 * A contact has no altphone field. officephone is not inline-editable
 * (record.submitFields), so contact edits use record.load + save.
 *
 * Lead vs prospect: NetSuite keeps leads, prospects and customers in one
 * customer table, told apart by stage (LEAD / PROSPECT / CUSTOMER). The
 * entry type picks the stage, so newCompany creates record.Type.LEAD or
 * record.Type.PROSPECT (not record.Type.CUSTOMER), in dynamic mode so the
 * form defaults apply (subsidiary, status, sales rep). Status
 * (entitystatus) is required: the form default is kept; when the form
 * has none, the first status in that stage's list is used (the list
 * holds only the stage's statuses).
 *
 * Permissions: SuiteQL and record calls run with the rep's role, so
 * duplicate checks only see records the role can see, and a role
 * without create/edit access gets error 'no_permission'.
 * Phone Call writes (linkPhoneCall) and logOnly accept only calls whose
 * `assigned` is the current user. custevent_ctc_* fields are never set.
 *
 * Governance (units; RESTlet budget 5,000):
 *   findDuplicates         ≤ 30  (runSuiteQL 10 each: customer phones,
 *                                 contact phones, company name)
 *   addToExistingContact   15-25 (load 5 + save 10; + company SuiteQL 10)
 *   newContactAtCompany    25    (company SuiteQL 10 + create 5 + save 10)
 *   newCompany             15-30 (create 5 + save 10; contact + 15)
 *   linkPhoneCall          15-16 (load 5 + save 10; + lookupFields 1 when
 *                                 the company comes from the contact)
 *   logOnly                1     (lookupFields)
 */
// eslint-disable-next-line suitescript/no-log-module
define(['N/record', 'N/query', 'N/search', 'N/runtime', 'N/log'], (record, query, search, runtime, log) => {

    const LIMIT = 10;
    const MAX_TEXT = 100;
    const DEFAULT_STATUS = 'lead'; // DESIGN.md §6: Lead until a config setting exists

    const CONTACT_PHONE_FIELDS = ['phone', 'mobilephone', 'officephone', 'homephone'];
    const CUSTOMER_PHONE_FIELDS = ['phone', 'altphone'];
    // SuiteQL columns: the set lookupCallerByPhone proves in production, so the
    // duplicate check and the Dial match slot agree. contact.officephone is a
    // record-API field (written above) but is not proven as a SuiteQL column.
    const CONTACT_QUERY_FIELDS = ['phone', 'mobilephone', 'homephone'];
    // addToExistingContact without a field: the first empty one of these.
    const AUTO_PICK_FIELDS = ['phone', 'mobilephone', 'officephone'];

    const STAGE_TO_WIRE = { LEAD: 'lead', PROSPECT: 'prospect', CUSTOMER: 'customer' };
    const STAGES_SQL = "('CUSTOMER', 'PROSPECT', 'LEAD')";

    // ─── Small helpers ─────────────────────────────────────────────────────

    const str = (v) => (v === null || v === undefined) ? '' : String(v).trim();

    /** A NetSuite internal id (positive integer) as a string, else ''. */
    const idOf = (v) => {
        const s = str(v);
        return /^[1-9][0-9]{0,11}$/.test(s) ? s : '';
    };

    const flag = (v) => v === true || v === 'T' || v === 'true';

    const fail = (error, message) => ({ ok: false, error: error, message: message });

    const personName = (first, last) => (str(first) + ' ' + str(last)).trim();

    const wireType = (stage) => STAGE_TO_WIRE[str(stage).toUpperCase()] || 'customer';

    /** lookupFields gives select fields as [{ value, text }]; plain values pass through. */
    const selectValue = (v) => {
        if (Array.isArray(v)) return v.length ? str(v[0].value) : '';
        return str(v);
    };

    /**
     * @param {*} raw
     * @returns {{digits: string, key: string, n: number, value: string}|null}
     *   key = last 10 digits (fewer when shorter), n = key length (7..10),
     *   value = the form written to a phone field. null when invalid.
     */
    const parsePhone = (raw) => {
        const text = str(raw);
        const digits = text.replace(/[^0-9]/g, '');
        if (!text || text.length > 32 || digits.length < 7 || digits.length > 15) return null;
        const key = digits.slice(-10);
        return { digits: digits, key: key, n: key.length, value: (text.charAt(0) === '+' ? '+' : '') + digits };
    };

    /** Last n digits of a stored phone ('' when it has fewer digits than n). */
    const tailOf = (v, n) => {
        const d = str(v).replace(/[^0-9]/g, '');
        return d.length >= n ? d.slice(-n) : '';
    };

    /** The session user's id; '' on error (then no call counts as the rep's). */
    const currentUserId = () => {
        try {
            return str(runtime.getCurrentUser().id);
        } catch (e) {
            return '';
        }
    };

    /** True when a Phone Call's assigned employee is the session user. */
    const isMine = (assigned) => {
        const me = currentUserId();
        return !!me && str(assigned) === me;
    };

    const INVALID_ERROR_NAMES = ['USER_ERROR', 'SSS_RECORD_TYPE_REQ_FIELD_MISSING'];

    /**
     * Map a NetSuite error to the failure shape and log it. NetSuite
     * USER_ERROR / INVALID_* messages are rep-readable ("Please enter
     * value(s) for: Status"), so they pass through.
     * @param {*} e
     * @param {string} action - what failed, as a verb phrase for the message
     */
    const toFailure = (e, action) => {
        const name = str(e && e.name);
        const message = str(e && e.message);
        log.error({ title: 'CTC addToNetSuite failed', details: 'action=' + action + ' name=' + name + ' message=' + message });
        if (name.indexOf('PERMISSION') !== -1) {
            return fail('no_permission', 'Your role cannot ' + action + '. Ask your administrator for access.');
        }
        if (name === 'RCRD_DSNT_EXIST') return fail('not_found', 'That record is no longer in NetSuite.');
        if (name === 'DUP_ENTITY') return fail('duplicate', message || 'This record is already in NetSuite.');
        if (INVALID_ERROR_NAMES.indexOf(name) !== -1 || name.indexOf('INVALID_') === 0) {
            return fail('invalid', message || 'NetSuite did not accept these values.');
        }
        return fail('failed', 'NetSuite could not ' + action + '. Try again.');
    };

    const BAD_PHONE = 'Enter a phone number with 7 to 15 digits.';

    // ─── Duplicate check ───────────────────────────────────────────────────

    /** The first of `fields` whose stored number matches the key. */
    const matchedField = (row, fields, phone) =>
        fields.filter((f) => tailOf(row[f], phone.n) === phone.key)[0] || fields[0];

    const phoneMatches = (phone) => {
        // n is 7..10 from parsePhone: safe to inline.
        const tail = (col) => 'SUBSTR(REGEXP_REPLACE(' + col + ", '[^0-9]', ''), -" + phone.n + ')';
        const anyTail = (alias, fields) => '(' + fields.map((f) => tail(alias + '.' + f) + ' = ?').join(' OR ') + ')';
        const columns = (alias, fields) => fields.map((f) => alias + '.' + f + ' AS ' + f).join(', ');
        const keys = (fields) => fields.map(() => phone.key);

        const customerSql =
            'SELECT c.id AS id, c.companyname AS companyname, c.firstname AS firstname, ' +
            '       c.lastname AS lastname, c.stage AS stage, ' + columns('c', CUSTOMER_PHONE_FIELDS) + ' ' +
            'FROM customer c ' +
            "WHERE c.isInactive = 'F' " +
            '  AND c.stage IN ' + STAGES_SQL + ' ' +
            '  AND ' + anyTail('c', CUSTOMER_PHONE_FIELDS) + ' ' +
            'FETCH FIRST ' + LIMIT + ' ROWS ONLY';
        const byCustomer = query.runSuiteQL({ query: customerSql, params: keys(CUSTOMER_PHONE_FIELDS) })
            .asMappedResults().map((r) => ({
                entityId: String(r.id),
                entityType: wireType(r.stage),
                name: str(r.companyname) || personName(r.firstname, r.lastname),
                field: matchedField(r, CUSTOMER_PHONE_FIELDS, phone)
            }));

        const contactSql =
            'SELECT ct.id AS id, ct.firstname AS firstname, ct.lastname AS lastname, ' +
            '       ' + columns('ct', CONTACT_QUERY_FIELDS) + ', ct.company AS company, ' +
            '       c.companyname AS companyname, c.firstname AS cfirstname, c.lastname AS clastname, c.stage AS stage ' +
            'FROM contact ct ' +
            'LEFT JOIN customer c ON c.id = ct.company ' +
            "WHERE ct.isInactive = 'F' " +
            '  AND ' + anyTail('ct', CONTACT_QUERY_FIELDS) + ' ' +
            'FETCH FIRST ' + LIMIT + ' ROWS ONLY';
        const byContact = query.runSuiteQL({ query: contactSql, params: keys(CONTACT_QUERY_FIELDS) })
            .asMappedResults().map((r) => {
                const contactName = personName(r.firstname, r.lastname);
                const companyId = idOf(r.company);
                const atCompany = !!(companyId && r.stage);
                return {
                    entityId: atCompany ? companyId : String(r.id),
                    entityType: atCompany ? wireType(r.stage) : 'contact',
                    name: atCompany ? (str(r.companyname) || personName(r.cfirstname, r.clastname) || contactName) : contactName,
                    contactId: String(r.id),
                    contactName: contactName,
                    field: matchedField(r, CONTACT_QUERY_FIELDS, phone)
                };
            });

        // Company-level numbers first, then contacts (lookupCallerByPhone order).
        return byCustomer.concat(byContact).slice(0, LIMIT);
    };

    const nameMatches = (companyName) => {
        const upper = companyName.toUpperCase();
        // Exact and "starts with" in one LIKE; the exact name is the
        // shortest, so it sorts first. A '%' or '_' typed in the name acts
        // as a wildcard: that only widens a duplicate check.
        const sql =
            'SELECT c.id AS id, c.companyname AS companyname, c.stage AS stage ' +
            'FROM customer c ' +
            "WHERE c.isInactive = 'F' " +
            '  AND c.stage IN ' + STAGES_SQL + ' ' +
            '  AND UPPER(c.companyname) LIKE ? ' +
            'ORDER BY LENGTH(c.companyname), c.companyname ' +
            'FETCH FIRST ' + LIMIT + ' ROWS ONLY';
        return query.runSuiteQL({ query: sql, params: [upper + '%'] }).asMappedResults().map((r) => ({
            entityId: String(r.id),
            entityType: wireType(r.stage),
            name: str(r.companyname),
            exact: str(r.companyname).toUpperCase() === upper
        }));
    };

    /**
     * Records that already hold this number, and companies with this name.
     * Give a phone, a company name, or both. Governance: ≤ 30 units.
     *
     * @param {{phone?: string, companyName?: string}} [params]
     * @returns {Object} { ok, byPhone: [{entityId, entityType, name, contactId?,
     *   contactName?, field}], byName: [{entityId, entityType, name, exact}] }
     *   byPhone: customer/lead/prospect numbers first, then contacts; a
     *   contact at a company returns the company as the entity. At most
     *   10 rows each.
     */
    const findDuplicates = (params) => {
        const p = params || {};
        const rawPhone = str(p.phone);
        const companyName = str(p.companyName);
        if (!rawPhone && !companyName) return fail('invalid', 'Enter a phone number or a company name.');
        const phone = rawPhone ? parsePhone(rawPhone) : null;
        if (rawPhone && !phone) return fail('invalid', BAD_PHONE);
        if (companyName.length > MAX_TEXT) return fail('invalid', 'The company name is too long.');
        try {
            return {
                ok: true,
                byPhone: phone ? phoneMatches(phone) : [],
                byName: companyName ? nameMatches(companyName) : []
            };
        } catch (e) {
            return toFailure(e, 'check for duplicates');
        }
    };

    // ─── Writes ────────────────────────────────────────────────────────────

    /**
     * Name and stage of a customer / lead / prospect. Throws on a query
     * error. Governance: 10 units.
     * @returns {{found: boolean, name: string, entityType: string}}
     */
    const companyInfo = (companyId) => {
        const rows = query.runSuiteQL({
            query: 'SELECT c.companyname AS companyname, c.firstname AS firstname, c.lastname AS lastname, ' +
                   '       c.stage AS stage ' +
                   'FROM customer c WHERE c.id = ?',
            params: [Number(companyId)]
        }).asMappedResults();
        if (!rows.length) return { found: false, name: '', entityType: 'customer' };
        const r = rows[0];
        return { found: true, name: str(r.companyname) || personName(r.firstname, r.lastname), entityType: wireType(r.stage) };
    };

    /**
     * Create a contact at a company with the number as its main phone.
     * Governance: 15 units. Throws on a NetSuite error.
     * @returns {string} the new contact id
     */
    const createContact = (o) => {
        const c = record.create({ type: record.Type.CONTACT, isDynamic: true });
        // Company first: in dynamic mode it sources the subsidiary.
        c.setValue({ fieldId: 'company', value: o.companyId });
        if (o.firstName) c.setValue({ fieldId: 'firstname', value: o.firstName });
        if (o.lastName) c.setValue({ fieldId: 'lastname', value: o.lastName });
        if (o.title) c.setValue({ fieldId: 'title', value: o.title });
        c.setValue({ fieldId: 'phone', value: o.phone.value });
        return String(c.save());
    };

    /**
     * Add the number to a contact. Field rule:
     *   - `field` given (phone | mobilephone | officephone | homephone):
     *     the number goes there, and replaces what was there.
     *   - no field, makeMain: the number goes to `phone` (main).
     *   - no field: the first empty of phone / mobilephone / officephone;
     *     none empty → error 'no_empty_field'.
     *   - makeMain with another field: `phone` gets the number too.
     * Values that were replaced come back in `replaced` (a different
     * number only). Governance: 15 units, 25 with a company.
     *
     * @param {{contactId?: (string|number), phone?: string, field?: string, makeMain?: boolean}} [params]
     * @returns {Object} { ok, entityId, entityType, name, contactId, contactName,
     *   companyId, companyName, field, makeMain, replaced: [{field, value}] }
     *   entity = the contact's company, or the contact when it has none.
     */
    const addToExistingContact = (params) => {
        const p = params || {};
        const contactId = idOf(p.contactId);
        if (!contactId) return fail('invalid', 'Pick a contact.');
        const phone = parsePhone(p.phone);
        if (!phone) return fail('invalid', BAD_PHONE);
        const field = str(p.field);
        if (field && CONTACT_PHONE_FIELDS.indexOf(field) === -1) {
            return fail('invalid', 'Pick the main, mobile, office or home phone field.');
        }
        const makeMain = flag(p.makeMain);

        let slot;
        let replaced;
        let contactName;
        let companyId;
        try {
            const contact = record.load({ type: record.Type.CONTACT, id: contactId });
            const current = {};
            CONTACT_PHONE_FIELDS.forEach((f) => { current[f] = str(contact.getValue({ fieldId: f })); });
            slot = field || (makeMain ? 'phone' : AUTO_PICK_FIELDS.filter((f) => !current[f])[0]);
            if (!slot) {
                return fail('no_empty_field', 'This contact has no empty phone field. Pick the field to replace.');
            }
            const targets = (makeMain && slot !== 'phone') ? [slot, 'phone'] : [slot];
            replaced = targets
                .filter((f) => current[f] && tailOf(current[f], phone.n) !== phone.key)
                .map((f) => ({ field: f, value: current[f] }));
            targets.forEach((f) => contact.setValue({ fieldId: f, value: phone.value }));
            contactName = personName(contact.getValue({ fieldId: 'firstname' }), contact.getValue({ fieldId: 'lastname' })) ||
                str(contact.getValue({ fieldId: 'entityid' }));
            companyId = idOf(contact.getValue({ fieldId: 'company' }));
            // Only phone fields change; another mandatory field the contact
            // lacks must not block adding a number.
            contact.save({ ignoreMandatoryFields: true });
        } catch (e) {
            return toFailure(e, 'add the number to this contact');
        }

        log.audit({
            title: 'CTC addToNetSuite addToExistingContact',
            details: 'user=' + currentUserId() + ' contact=' + contactId + ' field=' + slot + ' makeMain=' + makeMain
        });

        let info = { found: false, name: '', entityType: 'customer' };
        if (companyId) {
            // The number is saved: a failed name lookup must not report failure.
            try { info = companyInfo(companyId); } catch (e) {
                log.error({ title: 'CTC addToNetSuite companyInfo failed', details: 'company=' + companyId + ' name=' + (e && e.name) });
            }
        }
        return {
            ok: true,
            entityId: companyId || contactId,
            entityType: companyId ? info.entityType : 'contact',
            name: companyId ? (info.name || contactName) : contactName,
            contactId: contactId,
            contactName: contactName,
            companyId: companyId,
            companyName: info.name,
            field: slot,
            makeMain: makeMain,
            replaced: replaced
        };
    };

    /**
     * New contact at an existing customer / lead / prospect. A new contact
     * has no other number, so the number is always its main phone
     * (`phone`); makeMain is accepted for one API shape and changes
     * nothing here. Needs a first or last name. Governance: 25 units.
     *
     * @param {{companyId?: (string|number), firstName?: string, lastName?: string,
     *          title?: string, phone?: string, makeMain?: boolean}} [params]
     * @returns {Object} { ok, entityId, entityType, name, contactId, contactName,
     *   companyId, companyName, field: 'phone' }
     */
    const newContactAtCompany = (params) => {
        const p = params || {};
        const companyId = idOf(p.companyId);
        if (!companyId) return fail('invalid', 'Pick a company.');
        const firstName = str(p.firstName);
        const lastName = str(p.lastName);
        const title = str(p.title);
        if (!firstName && !lastName) return fail('invalid', 'Enter the contact\'s name.');
        if (firstName.length > MAX_TEXT || lastName.length > MAX_TEXT || title.length > MAX_TEXT) {
            return fail('invalid', 'A name or role is too long.');
        }
        const phone = parsePhone(p.phone);
        if (!phone) return fail('invalid', BAD_PHONE);

        try {
            const info = companyInfo(companyId);
            if (!info.found) return fail('not_found', 'That company is not in NetSuite.');
            const contactId = createContact({ companyId: companyId, firstName: firstName, lastName: lastName, title: title, phone: phone });
            log.audit({
                title: 'CTC addToNetSuite newContactAtCompany',
                details: 'user=' + currentUserId() + ' company=' + companyId + ' contact=' + contactId
            });
            return {
                ok: true,
                entityId: companyId,
                entityType: info.entityType,
                name: info.name,
                contactId: contactId,
                contactName: personName(firstName, lastName),
                companyId: companyId,
                companyName: info.name,
                field: 'phone'
            };
        } catch (e) {
            return toFailure(e, 'create the contact');
        }
    };

    /**
     * Keep the form's default status; when the form has none, use the
     * first status in the list (dynamic mode lists only this stage's
     * statuses). On any error leave it: save then reports the missing
     * Status as USER_ERROR → 'invalid'.
     */
    const ensureEntityStatus = (rec) => {
        try {
            if (str(rec.getValue({ fieldId: 'entitystatus' }))) return;
            const first = (rec.getField({ fieldId: 'entitystatus' }).getSelectOptions() || [])
                .filter((o) => str(o && o.value))[0];
            if (first) rec.setValue({ fieldId: 'entitystatus', value: first.value });
        } catch (e) {
            log.debug({ title: 'CTC addToNetSuite entitystatus default', details: 'name=' + (e && e.name) });
        }
    };

    /**
     * New company as a Lead or Prospect (see the header for the record
     * type), with the number as its phone; then a contact on it with the
     * same number when a first or last name is given. The company is not
     * rolled back when the contact fails: the result stays ok with
     * `contactError` so the caller does not create the company twice.
     * Governance: 15 units, 30 with a contact.
     *
     * @param {{companyName?: string, firstName?: string, lastName?: string,
     *          phone?: string, status?: string}} [params]
     *   status defaults to 'lead'.
     * @returns {Object} { ok, entityId, entityType, name, companyId, companyName,
     *   contactId, contactName, field: 'phone', contactError? }
     */
    const newCompany = (params) => {
        const p = params || {};
        const companyName = str(p.companyName);
        if (!companyName) return fail('invalid', 'Enter the company name.');
        if (companyName.length > MAX_TEXT) return fail('invalid', 'The company name is too long.');
        const status = str(p.status).toLowerCase() || DEFAULT_STATUS;
        if (status !== 'lead' && status !== 'prospect') return fail('invalid', 'Pick Lead or Prospect.');
        const firstName = str(p.firstName);
        const lastName = str(p.lastName);
        if (firstName.length > MAX_TEXT || lastName.length > MAX_TEXT) return fail('invalid', 'The contact name is too long.');
        const phone = parsePhone(p.phone);
        if (!phone) return fail('invalid', BAD_PHONE);

        let entityId;
        try {
            const c = record.create({
                type: status === 'prospect' ? record.Type.PROSPECT : record.Type.LEAD,
                isDynamic: true
            });
            c.setValue({ fieldId: 'isperson', value: 'F' });
            c.setValue({ fieldId: 'companyname', value: companyName });
            c.setValue({ fieldId: 'phone', value: phone.value });
            ensureEntityStatus(c);
            entityId = String(c.save());
        } catch (e) {
            return toFailure(e, 'create the company');
        }
        log.audit({ title: 'CTC addToNetSuite newCompany', details: 'user=' + currentUserId() + ' entity=' + entityId + ' status=' + status });

        const result = {
            ok: true,
            entityId: entityId,
            entityType: status,
            name: companyName,
            companyId: entityId,
            companyName: companyName,
            contactId: '',
            contactName: '',
            field: 'phone'
        };
        if (!firstName && !lastName) return result;
        try {
            result.contactId = createContact({ companyId: entityId, firstName: firstName, lastName: lastName, title: '', phone: phone });
            result.contactName = personName(firstName, lastName);
        } catch (e) {
            const f = toFailure(e, 'create the contact');
            result.contactError = { error: f.error, message: f.message };
        }
        return result;
    };

    /**
     * Link a Phone Call to a company and / or contact. Both fields are
     * written (an omitted one is cleared), so the call shows exactly the
     * new link. With only a contact, its company is used. Only the rep's
     * own call (assigned = current user). Governance: 15-16 units.
     *
     * @param {{phoneCallId?: (string|number), companyId?: (string|number), contactId?: (string|number)}} [params]
     * @returns {Object} { ok, phoneCallId, entityId, companyId, contactId }
     */
    const linkPhoneCall = (params) => {
        const p = params || {};
        const phoneCallId = idOf(p.phoneCallId);
        if (!phoneCallId) return fail('invalid', 'The call is missing.');
        let companyId = idOf(p.companyId);
        const contactId = idOf(p.contactId);
        if ((str(p.companyId) && !companyId) || (str(p.contactId) && !contactId)) {
            return fail('invalid', 'The company or contact is not valid.');
        }
        if (!companyId && !contactId) return fail('invalid', 'Pick a company or a contact.');

        try {
            const call = record.load({ type: record.Type.PHONE_CALL, id: phoneCallId });
            if (!isMine(call.getValue({ fieldId: 'assigned' }))) {
                return fail('not_owner', 'This call belongs to another rep.');
            }
            if (!companyId) {
                const f = search.lookupFields({ type: search.Type.CONTACT, id: contactId, columns: ['company'] });
                companyId = idOf(selectValue(f && f.company));
            }
            call.setValue({ fieldId: 'company', value: companyId });
            call.setValue({ fieldId: 'contact', value: contactId });
            call.save({ ignoreMandatoryFields: true });
            log.audit({
                title: 'CTC addToNetSuite linkPhoneCall',
                details: 'user=' + currentUserId() + ' call=' + phoneCallId + ' company=' + companyId + ' contact=' + contactId
            });
            return { ok: true, phoneCallId: phoneCallId, entityId: companyId || contactId, companyId: companyId, contactId: contactId };
        } catch (e) {
            return toFailure(e, 'link the call');
        }
    };

    /**
     * "Log without a record": writes nothing. Confirms the call exists
     * and is the rep's (assigned = current user); it stays as logged.
     * Governance: 1 unit.
     *
     * @param {{phoneCallId?: (string|number)}} [params]
     * @returns {Object} { ok, phoneCallId, linked } — linked: the call
     *   already has a company or contact.
     */
    const logOnly = (params) => {
        const p = params || {};
        const phoneCallId = idOf(p.phoneCallId);
        if (!phoneCallId) return fail('invalid', 'The call is missing.');
        try {
            const f = search.lookupFields({ type: search.Type.PHONE_CALL, id: phoneCallId, columns: ['assigned', 'company', 'contact'] });
            if (!f || !Object.prototype.hasOwnProperty.call(f, 'assigned')) {
                return fail('not_found', 'That call is no longer in NetSuite.');
            }
            if (!isMine(selectValue(f.assigned))) return fail('not_owner', 'This call belongs to another rep.');
            return { ok: true, phoneCallId: phoneCallId, linked: !!(selectValue(f.company) || selectValue(f.contact)) };
        } catch (e) {
            return toFailure(e, 'check the call');
        }
    };

    return {
        findDuplicates,
        addToExistingContact,
        newContactAtCompany,
        newCompany,
        linkPhoneCall,
        logOnly,
        CONTACT_PHONE_FIELDS,
        DEFAULT_STATUS
    };
});
