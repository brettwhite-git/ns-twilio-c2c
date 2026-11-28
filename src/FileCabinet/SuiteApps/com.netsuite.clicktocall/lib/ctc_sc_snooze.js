/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Sales Central "Needs me" Snooze (2026-11-28): a rep hides one account
 * from Needs me until tomorrow. One customrecord_ctc_sc_snooze row per
 * (employee, customer); snoozing again updates that row.
 *
 * The row keeps the account's `needs` text at snooze time (sig). Needs me
 * hides the account only while today < until AND its needs text still
 * equals sig, so a new or changed reason shows the account again early.
 *
 * Expired rows stay: each (employee, customer) pair has at most one row,
 * reused on the next snooze, so the table never grows past the books.
 * The employee always comes from the session, never from the request.
 */
define(['N/query', 'N/record', './ctc_workspace_queries', './ctc_rc_scope'],
    (query, record, wq, rcScope) => {

    const TYPE = 'customrecord_ctc_sc_snooze';
    const F = {
        employee: 'custrecord_ctc_snz_employee',
        customer: 'custrecord_ctc_snz_customer',
        until: 'custrecord_ctc_snz_until',
        sig: 'custrecord_ctc_snz_sig'
    };
    const MAX_SIG = 300;

    const isId = (v) => /^[0-9]{1,12}$/.test(String(v == null ? '' : v));

    /** YYYY-MM-DD → a Date at local noon (no day shift in any time zone; same as updateDeal). */
    const noonOf = (iso) => new Date(parseInt(iso.slice(0, 4), 10), parseInt(iso.slice(5, 7), 10) - 1, parseInt(iso.slice(8, 10), 10), 12);

    /**
     * The user's snoozes that are still active (until after today). One
     * SuiteQL, 10 units. Throws on a query error.
     * @param {{userId: (string|number), todayIso: string}} p
     * @returns {Array<{companyId: string, until: string, sig: string}>}
     */
    const loadActive = (p) => query.runSuiteQL({
        query: 'SELECT s.' + F.customer + " AS customer, TO_CHAR(s." + F.until + ", 'YYYY-MM-DD') AS until, s." + F.sig + ' AS sig' +
               ' FROM ' + TYPE + ' s WHERE s.' + F.employee + ' = ?' +
               ' AND s.' + F.until + " > TO_DATE(?, 'YYYY-MM-DD')",
        params: [parseInt(String(p.userId), 10), p.todayIso]
    }).asMappedResults().map((r) => ({
        companyId: String(r.customer || ''),
        until: String(r.until || ''),
        sig: String(r.sig || '')
    }));

    /** The id of the user's row for one customer, or '' when there is none. */
    const findRow = (userId, companyId) => {
        const rows = query.runSuiteQL({
            query: 'SELECT s.id FROM ' + TYPE + ' s WHERE s.' + F.employee + ' = ? AND s.' + F.customer + ' = ?',
            params: [parseInt(String(userId), 10), parseInt(String(companyId), 10)]
        }).asMappedResults();
        return rows.length ? String(rows[0].id) : '';
    };

    /**
     * Hide one account in the user's book until tomorrow.
     * @param {{userId: (string|number), body: {companyId: string, sig: string}}} p
     * @returns {{ok: true, until: string}|{error: 'invalid'|'forbidden'}}
     */
    const snooze = (p) => {
        const b = p.body || {};
        const sig = typeof b.sig === 'string' ? b.sig.trim() : '';
        if (!isId(b.companyId) || !sig || sig.length > MAX_SIG) return { error: 'invalid' };
        const companyId = String(b.companyId);
        if (!wq.isCustomerInBook(companyId, p.userId)) return { error: 'forbidden' };
        const until = rcScope.addDays(rcScope.todayIso(), 1);
        const id = findRow(p.userId, companyId);
        if (id) {
            record.submitFields({ type: TYPE, id: id, values: { [F.until]: noonOf(until), [F.sig]: sig } });
        } else {
            const rec = record.create({ type: TYPE });
            rec.setValue({ fieldId: F.employee, value: String(p.userId) });
            rec.setValue({ fieldId: F.customer, value: companyId });
            rec.setValue({ fieldId: F.until, value: noonOf(until) });
            rec.setValue({ fieldId: F.sig, value: sig });
            rec.save();
        }
        return { ok: true, until: until };
    };

    /**
     * Show one account again: delete the user's row for it (no row = ok).
     * No book check: a rep can only delete a row of their own.
     * @param {{userId: (string|number), body: {companyId: string}}} p
     * @returns {{ok: true}|{error: 'invalid'}}
     */
    const unsnooze = (p) => {
        const b = p.body || {};
        if (!isId(b.companyId)) return { error: 'invalid' };
        const id = findRow(p.userId, String(b.companyId));
        if (id) record.delete({ type: TYPE, id: id });
        return { ok: true };
    };

    return { loadActive, snooze, unsnooze, MAX_SIG, TYPE };
});
