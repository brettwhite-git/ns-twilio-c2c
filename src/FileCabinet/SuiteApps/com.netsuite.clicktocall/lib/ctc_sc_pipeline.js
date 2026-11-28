/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Sales Central Pipeline (slice 3, 2026-11-25; ORCA board ScPipeline):
 * open opportunities for customers in the user's book, by NetSuite status
 * (entitystatus), plus the KPIs (open, weighted, won this quarter, past close
 * date); editing one deal (title, status, expected close, probability); and
 * one deal's detail for the drawer (loadDeal: owner, source, range, memo,
 * item lines, recent calls / tasks / events linked to it; ORCA board ScDeal A).
 *
 * Columns are the open opportunity statuses: the opportunity form's own
 * Status options, in the form's order, whose default probability (NetSuite
 * fills it in when the status is set) is above 0 and under 100. The SuiteQL
 * entitystatus table was not readable with a sales role (2026-11-25), so the
 * form is the source; an unsaved record costs no write.
 * Won is read only: NetSuite sets Closed Won when a sales order is created
 * from the opportunity, so a deal can never be moved to a closed status here.
 * Deals are chosen by their status (entitystatus), not by transaction status
 * codes: open = an open column's status; won = a status whose default
 * probability is 100 (Closed Won). Verified live 2026-11-25: the A/B status
 * codes matched no opportunity in SuiteQL.
 */
// eslint-disable-next-line suitescript/no-log-module
define(['N/query', 'N/record', 'N/log', './ctc_workspace_queries', './ctc_rc_scope'],
    (query, record, log, wq, rcScope) => {

    const DEAL_LIMIT = 500;
    const MAX_TITLE = 200;

    const num = (v) => { const n = parseFloat(String(v == null ? '' : v)); return isFinite(n) ? n : 0; };
    const round2 = (n) => Math.round(n * 100) / 100;
    /** SuiteQL returns a percent field as a fraction (0.2 = 20%); the page and the form use 20. */
    const pctOf = (v) => Math.round(num(v) * 1000) / 10;

    /** NetSuite dates (M/D/YYYY from SuiteQL) → YYYY-MM-DD; '' when empty. */
    const isoOf = (v) => {
        const m = /^([0-9]{1,2})\/([0-9]{1,2})\/([0-9]{4})$/.exec(String(v || '').trim());
        if (m) return m[3] + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2);
        const iso = /^([0-9]{4}-[0-9]{2}-[0-9]{2})/.exec(String(v || ''));
        return iso ? iso[1] : '';
    };

    /** First day of today's calendar quarter (YYYY-MM-DD). */
    const quarterStart = (todayIso) => {
        const y = todayIso.slice(0, 4);
        const m = parseInt(todayIso.slice(5, 7), 10);
        return y + '-' + ('0' + (Math.floor((m - 1) / 3) * 3 + 1)).slice(-2) + '-01';
    };

    /**
     * Pure: the Pipeline from loaded rows.
     * @param {{todayIso: string, statuses: Array<{id: string, name: string, probability: number}>, open: Array<Object>, won: Array<Object>, names: Object<string, string>}} p
     */
    const buildPipeline = (p) => {
        const known = {};
        p.statuses.forEach((s) => { known[s.id] = true; });
        const deals = (p.open || []).map((o) => ({
            id: String(o.id), number: String(o.tranid || ''), title: String(o.title || ''),
            companyId: String(o.entity || ''), companyName: (p.names || {})[String(o.entity || '')] || String(o.entityname || ''),
            statusId: String(o.entitystatus || ''), amount: round2(num(o.projectedtotal)),
            probability: pctOf(o.probability), close: isoOf(o.expectedclosedate),
            rep: String(o.salesrepname || ''), created: isoOf(o.createddate)
        })).filter((d) => known[d.statusId]);
        const kpis = { open: 0, openCount: deals.length, weighted: 0, won: 0, wonCount: 0, late: 0, lateCount: 0 };
        deals.forEach((d) => {
            kpis.open += d.amount;
            kpis.weighted += d.amount * d.probability / 100;
            if (d.close && d.close < p.todayIso) { kpis.late += d.amount; kpis.lateCount += 1; }
        });
        (p.won || []).forEach((w) => { kpis.won += num(w.projectedtotal); kpis.wonCount += 1; });
        Object.keys(kpis).forEach((k) => { kpis[k] = round2(kpis[k]); });
        deals.sort((a, b) => (a.close || '9999').localeCompare(b.close || '9999') || a.title.localeCompare(b.title));
        return { statuses: p.statuses, deals: deals, kpis: kpis };
    };

    /** Every opportunity status on the form, in its order, with its default probability. Never saved. */
    const formStatuses = () => {
        const opp = record.create({ type: record.Type.OPPORTUNITY, isDynamic: true });
        return opp.getField({ fieldId: 'entitystatus' }).getSelectOptions()
            .filter((o) => String(o.value || '').trim())
            .map((o) => {
                opp.setValue({ fieldId: 'entitystatus', value: o.value });
                return { id: String(o.value), name: String(o.text || ''), probability: num(opp.getValue({ fieldId: 'probability' })) };
            });
    };
    const isOpen = (s) => s.probability > 0 && s.probability < 100;
    /** Open statuses (the columns), in the form's order. */
    const loadStatuses = () => formStatuses().filter(isOpen);

    const OPP_COLUMNS = 't.id, t.tranid, t.title, t.entity, t.entitystatus, t.probability, t.projectedtotal, t.expectedclosedate, ' +
        'BUILTIN.DF(t.employee) AS salesrepname, t.createddate';

    /**
     * Opportunities for the book's customers in the given statuses; with
     * `fromIso`, only those closed on or after it.
     */
    const loadOpps = (bookIds, statusIds, fromIso) => {
        if (!bookIds.length || !statusIds.length) return [];
        const ids = bookIds.slice(0, 1000);
        const marks = (list) => list.map(() => '?').join(',');
        return query.runSuiteQL({
            query: 'SELECT ' + OPP_COLUMNS + " FROM transaction t WHERE t.type = 'Opprtnty'" +
                   ' AND t.entitystatus IN (' + marks(statusIds) + ')' +
                   (fromIso ? " AND t.closedate >= TO_DATE(?, 'YYYY-MM-DD')" : '') +
                   ' AND t.entity IN (' + marks(ids) + ') ORDER BY t.expectedclosedate',
            params: statusIds.map(Number).concat(fromIso ? [fromIso] : [], ids)
        }).asMappedResults().slice(0, DEAL_LIMIT);
    };

    /**
     * The Pipeline for one user. A failed source is named in `partial`; nothing throws.
     * @param {{userId: (string|number)}} p
     */
    const loadPipeline = (p) => {
        const todayIso = rcScope.todayIso();
        const partial = [];
        const attempt = (name, fn, fallback) => {
            try { return fn(); } catch (e) {
                log.error({ title: 'CTC SC pipeline ' + name + ' failed', details: (e && e.message) || String(e) });
                partial.push(name);
                return fallback;
            }
        };
        const all = attempt('statuses', formStatuses, []);
        const statuses = all.filter(isOpen);
        const wonIds = all.filter((s) => s.probability >= 100).map((s) => s.id);
        const book = wq.getBookCustomerIds({ userId: p.userId });
        const open = attempt('deals', () => loadOpps(book, statuses.map((s) => s.id)), []);
        const won = attempt('won', () => loadOpps(book, wonIds, quarterStart(todayIso)), []);
        const names = attempt('names', () => wq.companyNames(open.map((o) => o.entity)), {});
        return Object.assign(buildPipeline({ todayIso: todayIso, statuses: statuses, open: open, won: won, names: names }), { partial: partial });
    };

    /**
     * Check one edit request (the boundary). Only the fields sent change.
     * @returns {{ok: true, id: string, values: Object}|{error: string}}
     */
    const readUpdate = (body, openStatusIds) => {
        const b = body || {};
        if (!/^[0-9]{1,12}$/.test(String(b.id || ''))) return { error: 'id required' };
        const values = {};
        if (b.title != null) {
            const t = String(b.title).trim();
            if (!t || t.length > MAX_TITLE) return { error: 'invalid_title' };
            values.title = t;
        }
        if (b.statusId != null) {
            if (openStatusIds.indexOf(String(b.statusId)) === -1) return { error: 'invalid_status' };
            values.entitystatus = String(b.statusId);
        }
        if (b.close != null) {
            const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(String(b.close));
            if (!m) return { error: 'invalid_close' };
            values.expectedclosedate = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10), 12);
        }
        if (b.probability != null) {
            const n = Number(b.probability);
            if (!isFinite(n) || n < 0 || n > 99) return { error: 'invalid_probability' };
            values.probability = n;
        }
        if (!Object.keys(values).length) return { error: 'nothing_to_save' };
        return { ok: true, id: String(b.id), values: values };
    };

    /**
     * Edit one open opportunity. Allowed when its customer is in the user's
     * book, or for an Administrator. Closed deals (won or lost) are refused.
     * @param {{userId: (string|number), isAdmin: boolean, body: Object}} p
     * @returns {{ok: true}|{error: string}}
     */
    const updateDeal = (p) => {
        const openIds = loadStatuses().map((s) => s.id);
        const req = readUpdate(p.body, openIds);
        if (!req.ok) return req;
        const opp = record.load({ type: record.Type.OPPORTUNITY, id: req.id, isDynamic: false });
        const status = String(opp.getValue({ fieldId: 'status' }) || '');
        if (openIds.indexOf(String(opp.getValue({ fieldId: 'entitystatus' }) || '')) === -1 || /closed/i.test(status)) {
            return { error: 'closed' };
        }
        if (!p.isAdmin && !wq.isCustomerInBook(opp.getValue({ fieldId: 'entity' }), p.userId)) return { error: 'forbidden' };
        Object.keys(req.values).forEach((f) => opp.setValue({ fieldId: f, value: req.values[f] }));
        opp.save({ ignoreMandatoryFields: true });
        return { ok: true };
    };

    const ACTIVITY_LIMIT = 5;
    /** Activities linked to an opportunity by their Transaction field, one table per kind. */
    const ACTIVITY_TABLES = [['call', 'phonecall'], ['task', 'task'], ['event', 'calendarevent']];

    /** Pure: the last few activities, newest first, from the per-kind rows. */
    const recentActivity = (byKind) => {
        const all = [];
        Object.keys(byKind).forEach((kind) => (byKind[kind] || []).forEach((r) => {
            all.push({ kind: kind, title: String(r.title || ''), date: isoOf(r.startdate) });
        }));
        return all.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, ACTIVITY_LIMIT);
    };

    const textOf = (rec, fieldId) => String(rec.getText({ fieldId: fieldId }) || '');
    const dateIso = (v) => (v instanceof Date
        ? v.getFullYear() + '-' + ('0' + (v.getMonth() + 1)).slice(-2) + '-' + ('0' + v.getDate()).slice(-2)
        : isoOf(v));

    /**
     * One deal's detail for the drawer (read only). Same access rule as
     * updateDeal: the customer is in the user's book, or an Administrator.
     * A failed part (items, an activity kind) is named in `partial`.
     * @param {{userId: (string|number), isAdmin: boolean, id: string}} p
     */
    const loadDeal = (p) => {
        if (!/^[0-9]{1,12}$/.test(String(p.id || ''))) return { error: 'id required' };
        const opp = record.load({ type: record.Type.OPPORTUNITY, id: String(p.id), isDynamic: false });
        if (!p.isAdmin && !wq.isCustomerInBook(opp.getValue({ fieldId: 'entity' }), p.userId)) return { error: 'forbidden' };
        const partial = [];
        const attempt = (name, fn, fallback) => {
            try { return fn(); } catch (e) {
                log.error({ title: 'CTC SC deal ' + name + ' failed', details: (e && e.message) || String(e) });
                partial.push(name);
                return fallback;
            }
        };
        const details = {
            salesRep: textOf(opp, 'salesrep'), leadSource: textOf(opp, 'leadsource'), partner: textOf(opp, 'partner'),
            forecastType: textOf(opp, 'forecasttype'), rangeLow: round2(num(opp.getValue({ fieldId: 'rangelow' }))),
            rangeHigh: round2(num(opp.getValue({ fieldId: 'rangehigh' }))), memo: String(opp.getValue({ fieldId: 'memo' }) || ''),
            created: dateIso(opp.getValue({ fieldId: 'createddate' }))
        };
        const items = attempt('items', () => {
            const lines = [];
            for (let i = 0; i < opp.getLineCount({ sublistId: 'item' }); i++) {
                const at = (f) => opp.getSublistValue({ sublistId: 'item', fieldId: f, line: i });
                lines.push({ item: String(opp.getSublistText({ sublistId: 'item', fieldId: 'item', line: i }) || ''),
                    quantity: num(at('quantity')), amount: round2(num(at('amount'))) });
            }
            return lines;
        }, []);
        const byKind = {};
        ACTIVITY_TABLES.forEach(([kind, table]) => {
            byKind[kind] = attempt(kind, () => query.runSuiteQL({
                query: 'SELECT id, title, startdate FROM ' + table + ' WHERE transaction = ? ORDER BY startdate DESC',
                params: [Number(p.id)]
            }).asMappedResults().slice(0, ACTIVITY_LIMIT), []);
        });
        return { ok: true, details: details, items: items, activity: recentActivity(byKind), todayIso: rcScope.todayIso(), partial: partial };
    };

    return { isoOf, quarterStart, buildPipeline, loadPipeline, readUpdate, updateDeal, recentActivity, loadDeal };
});
