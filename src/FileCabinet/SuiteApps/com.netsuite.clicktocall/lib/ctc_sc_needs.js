/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Sales Central "Needs me" (slice 1, 2026-11-25; ORCA boards SCApp and
 * SCLayout): one row per account in the session user's book that needs
 * the rep now, the reason first.
 *
 * Reasons, most urgent first (rank; tone red or amber):
 *   - a missed call or voicemail in the last 14 days with no later
 *     connected call to the same caller (red; ctc_rc_overview
 *     callsToReturn, the rule Call Central uses);
 *   - a task overdue (red) or due today (amber): an approved follow-up
 *     whose Task is open;
 *   - follow-ups to review (Pending; amber);
 *   - invoices that became due in the last 90 days (red, ranked last:
 *     finding #96, older debt only counts in the open balance).
 * Each row also carries the open balance, the next task date and the last
 * call date. Cost: book SuiteQL 10 + calls 10 + follow-ups 20 +
 * invoices 10 + names 10 = about 60 units. Calls dated after today are
 * left out (pastOnly; this account has some, finding #102).
 *
 * Snooze (2026-11-28, lib/ctc_sc_snooze.js): a row is hidden while the
 * user's snooze for the account is active (today < until) and the row's
 * `needs` text equals the text stored at snooze time; a new or changed
 * reason shows it again. Hidden rows are listed in `snoozed`. One more
 * SuiteQL (10 units).
 */
// eslint-disable-next-line suitescript/no-log-module
define(['N/search', 'N/log', './ctc_workspace_queries', './ctc_rc_overview', './ctc_rc_followups', './ctc_rc_scope', './ctc_sc_snooze'],
    (search, log, wq, rcOverview, rcFollowups, rcScope, scSnooze) => {

    const CALLBACK_DAYS = 14;
    const INVOICE_DAYS = 90;
    const DAY_MS = 86400000;

    /** Days from a to b (YYYY-MM-DD); NaN when either is blank. */
    const daysBetween = (a, b) => {
        if (!a || !b) return NaN;
        return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAY_MS);
    };

    const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');

    /**
     * Pure: the rows from already-loaded data.
     * @param {{
     *   todayIso: string,
     *   calls: Array<Object>,       loadHistoryRows rows (last 30 days)
     *   followUps: Array<Object>,   loadFollowUpRows rows (open)
     *   invoices: Array<{companyId: string, remaining: number, dueIso: string}>
     * }} p
     * @returns {Array<Object>} rows, most urgent first
     */
    const buildNeeds = (p) => {
        const today = p.todayIso;
        /** @type {Object<string, Object>} */
        const acc = {};
        const of = (id, name) => {
            const key = String(id || '');
            if (!key) return null;
            if (!acc[key]) {
                acc[key] = { companyId: key, name: name || '', phone: '', contact: '', reasons: [], open: 0, next: '', lastTouch: '', invoiceCount: 0 };
            }
            if (!acc[key].name && name) acc[key].name = name;
            return acc[key];
        };

        (p.calls || []).forEach((r) => {
            const a = of(r.companyId, r.companyName);
            if (!a) return;
            const iso = rcFollowups.nsToIso(r.date);
            // The contact on the newest call is the person to call (Needs me card and table)
            if (iso && iso >= a.lastTouch && r.contactName) a.contact = String(r.contactName);
            if (iso && iso > a.lastTouch) a.lastTouch = iso;
            if (!a.phone && r.phone) a.phone = String(r.phone);
        });
        rcOverview.callsToReturn(p.calls || []).forEach((r) => {
            const iso = rcFollowups.nsToIso(r.date);
            const age = daysBetween(iso, today);
            if (isNaN(age) || age > CALLBACK_DAYS) return;
            const a = of(r.companyId, r.companyName);
            if (!a) return;
            const what = r.voicemail ? 'Voicemail' : 'Missed call';
            const when = age === 0 ? 'today' : age === 1 ? 'yesterday' : age + ' days ago';
            a.reasons.push({ kind: 'callback', tone: 'red', rank: 0, days: age,
                status: 'Call back', why: what + ' ' + when + ', not returned' });
            if (r.phone) a.phone = String(r.phone);
        });

        (p.followUps || []).forEach((r) => {
            const stage = rcFollowups.stageOf(r);
            const call = r.call || {};
            const a = of(call.companyId, call.companyName);
            if (!a) return;
            if (stage === 'review') {
                a.reasons.push({ kind: 'review', tone: 'amber', rank: 3, days: 0, status: 'To review', why: r.text || 'Follow-up' });
                return;
            }
            if (stage !== 'task') return;
            const due = rcFollowups.nsToIso(r.taskDue || r.proposedDue);
            const late = daysBetween(due, today);
            if (late > 0) {
                a.reasons.push({ kind: 'task', tone: 'red', rank: 1, days: late, status: 'Overdue ' + late + 'd', why: r.text || 'Task' });
            } else if (late === 0) {
                a.reasons.push({ kind: 'task', tone: 'amber', rank: 2, days: 0, status: 'Due today', why: r.text || 'Task' });
            } else if (due && (!a.next || due < a.next)) {
                a.next = due;
            }
        });

        (p.invoices || []).forEach((inv) => {
            const a = acc[String(inv.companyId || '')];
            if (a) a.open += inv.remaining || 0;
        });
        // Overdue invoices: a reason of their own, also for accounts with
        // nothing else (the row then needs its name from the invoice).
        /** @type {Object<string, {name: string, count: number, days: number, remaining: number}>} */
        const late = {};
        (p.invoices || []).forEach((inv) => {
            const days = daysBetween(inv.dueIso, today);
            // Nothing left to pay is not past due, whatever the status says
            // (demo invoices: status Open, amount remaining 0; finding #103).
            if (!(inv.remaining > 0) || !(days > 0) || days > INVOICE_DAYS) return;
            const k = String(inv.companyId || '');
            const l = late[k] || (late[k] = { name: inv.companyName || '', count: 0, days: 0, remaining: 0 });
            l.count++;
            l.days = Math.max(l.days, days);
        });
        Object.keys(late).forEach((k) => {
            const l = late[k];
            const a = acc[k] || of(k, l.name);
            if (!a) return;
            if (!a.open) (p.invoices || []).forEach((inv) => { if (String(inv.companyId) === k) a.open += inv.remaining || 0; });
            a.invoiceCount = l.count;
            a.reasons.push({ kind: 'invoice', tone: 'red', rank: 4, days: l.days, status: 'Overdue ' + l.days + 'd',
                why: plural(l.count, 'invoice') + ' past due · oldest ' + l.days + 'd' });
        });

        const reviewCount = (a) => a.reasons.filter((x) => x.kind === 'review').length;
        /** Everything waiting on the account, in urgency order ("1 call back · 2 overdue tasks · 2 invoices"). */
        const needsOf = (a) => {
            const n = (pred) => a.reasons.filter(pred).length;
            const parts = [];
            const cb = n((x) => x.kind === 'callback');
            const over = n((x) => x.kind === 'task' && x.tone === 'red');
            const today = n((x) => x.kind === 'task' && x.tone === 'amber');
            const review = n((x) => x.kind === 'review');
            if (cb) parts.push(plural(cb, 'call back'));
            if (over) parts.push(plural(over, 'overdue task'));
            if (today) parts.push(plural(today, 'task') + ' due today');
            if (review) parts.push(plural(review, 'follow-up') + ' to review');
            if (a.invoiceCount) parts.push(plural(a.invoiceCount, 'invoice') + ' past due');
            return parts.join(' · ');
        };
        return Object.keys(acc).map((k) => acc[k]).filter((a) => a.reasons.length).map((a) => {
            const top = a.reasons.slice().sort((x, y) => x.rank - y.rank || y.days - x.days)[0];
            const n = reviewCount(a);
            const why = top.kind === 'review' ? (n === 1 ? top.why : plural(n, 'follow-up') + ' to review') : top.why;
            const more = a.reasons.length - (top.kind === 'review' ? n : 1);
            return {
                companyId: a.companyId,
                name: a.name || 'Account ' + a.companyId,
                entityType: 'customer',
                phone: a.phone,
                contact: a.contact,
                needs: needsOf(a),
                why: why,
                more: more > 0 ? more : 0,
                kind: top.kind,
                status: top.status,
                tone: top.tone,
                next: a.next,
                open: Math.round(a.open * 100) / 100,
                lastTouch: a.lastTouch,
                rank: top.rank,
                days: top.days
            };
        }).sort((x, y) => x.rank - y.rank || y.days - x.days || x.name.localeCompare(y.name))
          .map((r) => { delete r.rank; delete r.days; return r; });
    };

    /**
     * Pure: split the rows into shown and snoozed. A row is snoozed while
     * its account's snooze is active (todayIso < until) and its needs text
     * equals the snooze's sig.
     * @param {Array<Object>} rows - buildNeeds rows
     * @param {Array<{companyId: string, until: string, sig: string}>} snoozes
     * @param {string} todayIso
     * @returns {{rows: Array<Object>, snoozed: Array<{companyId: string, name: string, until: string}>}}
     */
    const splitSnoozed = (rows, snoozes, todayIso) => {
        /** @type {Object<string, {until: string, sig: string}>} */
        const active = {};
        (snoozes || []).forEach((s) => { if (s.until > todayIso) active[String(s.companyId)] = s; });
        const shown = [];
        const snoozed = [];
        rows.forEach((r) => {
            const s = active[r.companyId];
            if (s && s.sig === r.needs) snoozed.push({ companyId: r.companyId, name: r.name, until: s.until });
            else shown.push(r);
        });
        return { rows: shown, snoozed: snoozed };
    };

    /**
     * Open and partly paid invoices of the book (one search, 10 units, up
     * to 1000). Throws on a search error.
     * @param {Array<string>} book
     * @returns {Array<{companyId: string, companyName: string, remaining: number, dueIso: string}>}
     */
    const loadOpenInvoices = (book) => {
        if (!book.length) return [];
        return search.create({
            type: search.Type.INVOICE,
            filters: [
                ['entity', 'anyof', book], 'AND',
                ['mainline', 'is', 'T'], 'AND',
                ['status', 'anyof', ['CustInvc:A', 'CustInvc:B']]
            ],
            columns: ['entity', 'amountremaining', 'duedate']
        }).run().getRange({ start: 0, end: 1000 }).map((r) => ({
            companyId: String(r.getValue('entity') || ''),
            companyName: String(r.getText('entity') || ''),
            remaining: parseFloat(r.getValue('amountremaining')) || 0,
            dueIso: rcFollowups.nsToIso(r.getValue('duedate'))
        }));
    };

    /**
     * The Needs me list for one user. A failed source is left out and named
     * in `partial`; nothing throws.
     * @param {{userId: (string|number)}} p
     * @returns {{rows: Array<Object>, snoozed: Array<Object>, partial: Array<string>, error?: string}}
     */
    const loadNeeds = (p) => {
        const userId = p && p.userId;
        const partial = [];
        const book = wq.getBookCustomerIds({ userId: userId });
        if (!book.length) return { rows: [], snoozed: [], partial: partial };
        const calls = wq.loadHistoryRows({
            userId: userId, bookCustomerIds: book, limit: 1000, skipEntityType: true, pastOnly: true,
            dateFilter: ['startdate', 'onorafter', 'daysago30']
        });
        if (calls.error) partial.push('calls');
        const followUps = wq.loadFollowUpRows({ userId: userId, bookCustomerIds: book });
        if (followUps.error) partial.push('followUps');
        let invoices = [];
        try {
            invoices = loadOpenInvoices(book);
        } catch (e) {
            log.error({ title: 'CTC SC needs invoices failed', details: (e && e.message) || String(e) });
            partial.push('invoices');
        }
        const todayIso = rcScope.todayIso();
        const rows = buildNeeds({
            todayIso: todayIso,
            calls: calls.error ? [] : calls.rows,
            followUps: followUps.error ? [] : followUps.rows,
            invoices: invoices
        });
        // Names without the entity number (finding #97).
        try {
            const names = wq.companyNames(rows.map((r) => r.companyId));
            rows.forEach((r) => { if (names[r.companyId]) r.name = names[r.companyId]; });
        } catch (e) {
            log.error({ title: 'CTC SC needs names failed', details: (e && e.message) || String(e) });
        }
        let snoozes = [];
        try {
            snoozes = scSnooze.loadActive({ userId: userId, todayIso: todayIso });
        } catch (e) {
            log.error({ title: 'CTC SC needs snoozes failed', details: (e && e.message) || String(e) });
            partial.push('snooze');
        }
        return Object.assign(splitSnoozed(rows, snoozes, todayIso), { partial: partial });
    };

    return { buildNeeds, splitSnoozed, loadNeeds, CALLBACK_DAYS, INVOICE_DAYS };
});
