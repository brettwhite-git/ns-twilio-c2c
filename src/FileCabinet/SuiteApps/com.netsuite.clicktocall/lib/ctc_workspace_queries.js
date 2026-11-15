// @ts-check
/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Shared workspace queries — used by the Portlet (server-side at render time)
 * and by the RESTlet (`getWorkspaceHistory` for the portlet's history tabs).
 * Centralizing the search logic here avoids
 * an HTTP roundtrip from the portlet, and keeps row shape consistent across
 * both surfaces.
 */
// eslint-disable-next-line suitescript/no-log-module
define(['N/search', 'N/query', 'N/log', './ctc_time', './ctc_html'], (search, query, log, ctcTime, ctcHtml) => {

    // NetSuite N/search returns SELECT field values inconsistently:
    //   - JOINED columns:    array `[{ value, text }]`
    //   - UNJOINED columns:  plain string (the internal ID directly)
    // Both helpers must handle BOTH shapes or values silently disappear
    // (this is the bug that broke every Call History row's companyId — the
    // company link's `id=` param ended up empty, breaking row click-through,
    // the redial button's entity context, etc.).
    const extractText = (val) => {
        if (Array.isArray(val) && val.length) return val[0].text || '';
        return val ? String(val) : '';
    };
    const extractId = (val) => {
        if (Array.isArray(val) && val.length) return val[0].value || '';
        return val ? String(val) : '';
    };

    /**
     * Runs fn and adds its ms to steps[name] when steps is given (the
     * RESTlet's perf flag, body.perf). Returns what fn returns; a throw
     * still counts the time and goes on to the caller.
     * @template T
     * @param {Object<string, number>|null|undefined} steps
     * @param {string} name
     * @param {function(): T} fn
     * @returns {T}
     */
    const timeStep = (steps, name, fn) => {
        const t0 = Date.now();
        try {
            return fn();
        } finally {
            if (steps) steps[name] = (steps[name] || 0) + (Date.now() - t0);
        }
    };

    // Ids per `IN (…)` list in a SuiteQL book query (same size as
    // ctc_call_reconcile SQL_CHUNK).
    const LOOKUP_ID_CHUNK = 200;

    // Map NetSuite customer.stage codes (LEAD / PROSPECT / CUSTOMER / OTHER) to
    // the display labels we show in the portlet's Type column. Anything else
    // (no stage, e.g. orphan phone calls without a company) renders as '—'.
    const formatEntityType = (stage) => {
        const s = String(stage || '').toUpperCase();
        if (s === 'LEAD') return 'Lead';
        if (s === 'PROSPECT') return 'Prospect';
        if (s === 'CUSTOMER') return 'Customer';
        return '';
    };

    /**
     * Read the time of day from a NetSuite time or datetime string, in the
     * user's format ("9:48 am", "21:05", "10/30/2026 9:48 pm",
     * "30.10.2026 09:48:12"). Returns 'HH:MM' in 24 h, or '' when no time.
     * @param {*} value
     * @returns {string}
     */
    const parseTimeOfDay = (value) => {
        const m = String(value || '').match(/([0-9]{1,2}):([0-9]{2})(?::[0-9]{2})?\s*([ap])?\.?m?\.?/i);
        if (!m) return '';
        let h = parseInt(m[1], 10);
        const min = parseInt(m[2], 10);
        const ampm = (m[3] || '').toLowerCase();
        if (ampm === 'p' && h < 12) h += 12;
        if (ampm === 'a' && h === 12) h = 0;
        if (h > 23 || min > 59) return '';
        return (h < 10 ? '0' : '') + h + ':' + (min < 10 ? '0' : '') + min;
    };

    /**
     * Batched stage lookup. Given an array of objects with `companyId`,
     * mutates each object's `entityType` field with the Lead / Prospect /
     * Customer label from the customer record. One round-trip regardless
     * of how many rows.
     */
    const fetchStageMap = (companyIds) => {
        const map = {};
        if (!companyIds.length) return map;
        try {
            const stageResults = search.create({
                type: search.Type.CUSTOMER,
                filters: [['internalid', 'anyof', companyIds]],
                columns: ['stage']
            }).run().getRange({ start: 0, end: 1000 });
            stageResults.forEach((sr) => { map[sr.id] = sr.getValue('stage'); });
        } catch (e) {
            log.error({ title: 'CTC stage lookup failed', details: e.message || e });
        }
        return map;
    };

    const enrichRowsWithEntityType = (rows) => {
        const uniqueIds = [];
        const seen = {};
        rows.forEach((r) => {
            if (r.companyId && !seen[r.companyId]) {
                seen[r.companyId] = true;
                uniqueIds.push(r.companyId);
            }
        });
        const stageMap = fetchStageMap(uniqueIds);
        rows.forEach((r) => { r.entityType = formatEntityType(stageMap[r.companyId]); });
    };

    /**
     * Returns the full set of active customer internal IDs in the current
     * rep's "book" — defined as records where the rep is EITHER the primary
     * `salesrep` OR a member of the entity's Sales Team sublist (any role).
     *
     * Used by `loadHistoryRows` and `loadTaskGroups` to widen their scope
     * from primary-only (the old N/search `company.salesrep` filter) to the
     * same primary-OR-salesteam scope the softphone Search/Suggested tabs
     * already use. The two callers pass the result into their existing
     * N/search via `['company', 'anyof', <ids>]` — no changes to date /
     * status / formula filters required.
     *
     * @param {{userId?: string|number}} [params]
     * @returns {Array<string>} customer internal IDs (may be empty)
     */
    const getBookCustomerIds = (params) => {
        try {
            const userId = parseInt(String((params && params.userId) || ''), 10);
            if (!userId) return [];

            const sql =
                'SELECT DISTINCT c.id ' +
                'FROM customer c ' +
                'LEFT JOIN customerSalesTeam cst ON cst.customer = c.id ' +
                'WHERE (c.salesrep = ? OR cst.employee = ?) ' +
                '  AND c.isInactive = \'F\'';

            const rs = query.runSuiteQL({ query: sql, params: [userId, userId] });
            const ids = rs.asMappedResults().map((r) => String(r.id));

            // Defensive: N/search `anyof` with a huge array bumps URL length
            // and can fail with cryptic errors. Burt's book is 112; if a rep
            // ever exceeds ~800 we still ship the result but log a warning.
            if (ids.length > 800) {
                log.audit({
                    title: 'CTC getBookCustomerIds large book',
                    details: 'userId=' + userId + ' bookSize=' + ids.length +
                             ' — approaching the N/search anyof practical ceiling'
                });
            }
            return ids;
        } catch (e) {
            log.error({
                title: 'CTC getBookCustomerIds Failed',
                details: 'name=' + (e && e.name) + ' message=' + (e && e.message) + ' stack=' + (e && e.stack)
            });
            return [];
        }
    };

    /**
     * Newest first inside each day, by effective time ('HH:MM'; blank
     * last). The search already sorts by startdate DESC, so the days stay
     * in search order; ties keep search order.
     * @param {Array<{date: string, timeOfDay: string}>} rows
     * @returns {Array<Object>}
     */
    const sortWithinDay = (rows) => rows
        .map((r, i) => ({ r: r, i: i }))
        .sort((a, b) => {
            if (a.r.date !== b.r.date) return a.i - b.i;
            if (a.r.timeOfDay !== b.r.timeOfDay) return a.r.timeOfDay < b.r.timeOfDay ? 1 : -1;
            return a.i - b.i;
        })
        .map((x) => x.r);

    /**
     * Load recent Phone Call rows assigned to a user, with optional filters.
     *
     * @param {{
     *   userId?: string|number,
     *   filters?: {dateFrom?: string, dateTo?: string, satMin?: number, status?: string},
     *   todayOnly?: boolean,
     *   dateRange?: string,
     *   limit?: number,
     *   bookCustomerIds?: Array<string>,
     *   missedOnly?: boolean,
     *   voicemailOnly?: boolean,
     *   countTotal?: boolean,
     *   ownerIds?: Array<string>,
     *   dateFilter?: Array,
     *   skipEntityType?: boolean,
     *   includeUnlinked?: boolean
     * }} [params]
     * `missedOnly` keeps only missed calls and voicemails (status 'Missed'
     * OR custevent_ctc_voicemail T). `voicemailOnly` keeps only voicemails
     * (custevent_ctc_voicemail T; the dock's Voicemail view). `countTotal` makes `total` the number
     * of matching calls, not only the rows returned (runPaged count, only
     * when the limit may have cut the list).
     * `ownerIds` (Reporting Central team view) scopes by the Phone Call's
     * `assigned` employee instead of the book (logCall and reconciliation
     * set `assigned` to the rep who took the call); rows then carry
     * `ownerId` / `ownerName`. An empty array returns no rows. Without it
     * the scope is the user's book, as before.
     * `dateFilter` (Reporting Central, lib/ctc_rc_scope.js) is one N/search
     * filter expression on `startdate`, used instead of `dateRange`.
     * `skipEntityType` (Reporting Central, which never shows the stage)
     * skips the stage lookup: one customer search less; `entityType` stays ''.
     * `includeUnlinked` (the dock's Recents) also returns the user's own
     * calls with no company (an unknown number): `assigned` = userId AND
     * company empty, as an OR branch of the book scope in the same search,
     * so the date filters, the sort and the limit apply to both and no
     * call comes twice. Every row then carries `unknown`: true when it has
     * no company and no contact (the number is in `phone`), else false.
     * An empty book still returns the unknown calls. Ignored with
     * `ownerIds`. Without it, rows have no `unknown` key.
     * @returns {{rows: Array<Object>, total: number, error?: string}} `{error}` on failure
     */
    const loadHistoryRows = (params) => {
        try {
            const p = params || {};
            const filters = p.filters || {};
            const limit = parseInt(String(p.limit || ''), 10) || 30;
            const userId = p.userId;
            const byOwner = Array.isArray(p.ownerIds);

            // Scope to calls whose customer is in the rep's book (primary OR
            // Sales Team member). `assigned` on Phone Call is unreliable (not
            // always set, can point at the logger rather than the account
            // owner). The old `['company.salesrep', 'anyof', userId]` filter
            // missed any call to a customer where the rep was secondary on
            // the Sales Team (Burt → Abbott was hidden). Hybrid approach:
            // resolve the book customer-id set via SuiteQL (`getBookCustomerIds`),
            // then pass the IDs to N/search via `['company', 'anyof', ids]`
            // so all existing date/status/satMin filters keep working without
            // a translation pass.
            // `bookCustomerIds` lets a caller that already resolved the book
            // (Reporting Central runs several range queries) skip the lookup.
            // Team view: `ownerIds` replaces the book (see the JSDoc).
            const scopeIds = byOwner
                ? p.ownerIds
                : (Array.isArray(p.bookCustomerIds) ? p.bookCustomerIds : getBookCustomerIds({ userId: userId }));
            // Unknown numbers (includeUnlinked): the user's own calls with no company.
            const ownerId = parseInt(String(userId || ''), 10);
            const unlinked = !byOwner && p.includeUnlinked === true && !!ownerId
                ? [['assigned', 'anyof', String(ownerId)], 'AND', ['company', 'anyof', '@NONE@']]
                : null;
            if (!scopeIds.length && !unlinked) {
                // No accessible customers (or no team) → no rows. Short-circuit;
                // the N/search `anyof` operator rejects empty arrays anyway.
                return { rows: [], total: 0 };
            }
            /** @type {Array} */
            let scope = [byOwner ? 'assigned' : 'company', 'anyof', scopeIds];
            if (unlinked) scope = scopeIds.length ? [scope, 'OR', unlinked] : unlinked;
            const searchFilters = [
                scope,
                'AND',
                ['custevent_ctc_call_sid', 'isnotempty', '']
            ];

            // Date filter: supports a `dateRange` shortcut for the portlet chips
            // (today, yesterday, thisweek, lastweek, last7days, last30days), or
            // explicit dateFrom/dateTo. `todayOnly` is the legacy shortcut kept
            // for back-compat. `last7days` was added for the softphone Recents
            // tab (Iteration B Phase 5). It uses the rolling relative date
            // `daysago7` with `onorafter`: the range keyword `lastweektodate`
            // means "last week up to the same weekday", not the last 7 days,
            // so Recents came back empty. `last30days` uses `daysago30` the
            // same way (`lastthirtydays` is not a NetSuite date keyword).
            const dateRange = p.dateRange;
            if (Array.isArray(p.dateFilter)) {
                searchFilters.push('AND', p.dateFilter);
            } else if (dateRange === 'yesterday') {
                searchFilters.push('AND', ['startdate', 'on', 'yesterday']);
            } else if (dateRange === 'thisweek') {
                searchFilters.push('AND', ['startdate', 'within', 'thisweek']);
            } else if (dateRange === 'lastweek') {
                searchFilters.push('AND', ['startdate', 'within', 'lastweek']);
            } else if (dateRange === 'last7days') {
                searchFilters.push('AND', ['startdate', 'onorafter', 'daysago7']);
            } else if (dateRange === 'last30days') {
                searchFilters.push('AND', ['startdate', 'onorafter', 'daysago30']);
            } else if (dateRange === 'today' || p.todayOnly) {
                searchFilters.push('AND', ['startdate', 'on', 'today']);
            } else {
                if (filters.dateFrom) searchFilters.push('AND', ['startdate', 'onorafter', filters.dateFrom]);
                if (filters.dateTo)   searchFilters.push('AND', ['startdate', 'onorbefore', filters.dateTo]);
            }
            if (filters.satMin) searchFilters.push('AND', ['custevent_ctc_satisfaction', 'greaterthanorequalto', String(filters.satMin)]);
            if (filters.status) searchFilters.push('AND', ['custevent_ctc_call_status', 'is', filters.status]);
            if (p.missedOnly) {
                searchFilters.push('AND', [
                    ['custevent_ctc_call_status', 'is', 'Missed'], 'OR', ['custevent_ctc_voicemail', 'is', 'T']
                ]);
            }
            if (p.voicemailOnly) searchFilters.push('AND', ['custevent_ctc_voicemail', 'is', 'T']);

            // `createddate` is the second sort key so calls on the same day
            // come newest first (startdate has no time part). The rows are
            // then re-ordered inside each day by their effective time.
            const historySearch = search.create({
                type: search.Type.PHONE_CALL,
                filters: searchFilters,
                columns: [
                    { name: 'startdate', sort: search.Sort.DESC },
                    { name: 'createddate', sort: search.Sort.DESC },
                    'starttime',
                    'custevent_ctc_call_started',
                    'company',
                    'contact',
                    'phone',
                    'custevent_ctc_ai_brief',
                    'custevent_ctc_satisfaction',
                    'custevent_ctc_duration',
                    'custevent_ctc_call_status',
                    'custevent_ctc_inbound',
                    'custevent_ctc_voicemail'
                ].concat(byOwner ? ['assigned'] : [])
            });
            const results = historySearch.run().getRange({ start: 0, end: limit });

            const rows = results.map((r) => {
                const duration = parseInt(r.getValue('custevent_ctc_duration'), 10) || 0;
                const callStatus = r.getValue('custevent_ctc_call_status') || '';
                // Direction from custevent_ctc_inbound (inbound spike): T for
                // calls the rep answered in the phone, else outbound. Missed
                // inbound calls are not logged as Phone Calls in the spike.
                const inbound = r.getValue('custevent_ctc_inbound');
                const voicemail = r.getValue('custevent_ctc_voicemail');
                return {
                    id: r.id,
                    date: r.getValue('startdate') || '',
                    // 'HH:MM' (24 h), from the effective call time:
                    // custevent_ctc_call_started (ISO UTC, shown in the user's
                    // time zone), else `starttime` (Phone Calls are not timed
                    // events, so usually blank), else the record's creation
                    // time (late for reconciled calls).
                    timeOfDay: parseTimeOfDay(ctcTime.localTimeOfIso(r.getValue('custevent_ctc_call_started'))) ||
                               parseTimeOfDay(r.getValue('starttime')) ||
                               parseTimeOfDay(r.getValue('createddate')),
                    // ISO UTC call start ('' on older Phone Calls). The dock's
                    // Recents matches its pending missed row against it.
                    startedAt: String(r.getValue('custevent_ctc_call_started') || ''),
                    companyId: extractId(r.getValue('company')),
                    companyName: extractText(r.getText ? r.getText('company') : r.getValue('company')),
                    contactName: extractText(r.getText ? r.getText('contact') : r.getValue('contact')),
                    phone: r.getValue('phone') || '',
                    brief: r.getValue('custevent_ctc_ai_brief') || '',
                    // A voicemail is not a conversation: never scored (older
                    // voicemails may still hold a score; it is ignored).
                    satisfaction: (voicemail === true || voicemail === 'T') ? null
                        : (parseInt(r.getValue('custevent_ctc_satisfaction'), 10) || null),
                    duration: duration,
                    callStatus: callStatus,
                    direction: (inbound === true || inbound === 'T') ? 'inbound' : 'outbound',
                    voicemail: voicemail === true || voicemail === 'T',
                    isMissed: false,
                    entityType: ''
                };
            });
            // Team view: who took each call (Phone Call `assigned`).
            if (byOwner) {
                results.forEach((r, i) => {
                    rows[i].ownerId = extractId(r.getValue('assigned'));
                    rows[i].ownerName = extractText(r.getText ? r.getText('assigned') : r.getValue('assigned'));
                });
            }
            // A call linked to a contact with no company is a known record, not unknown.
            if (unlinked) rows.forEach((row) => { row.unknown = !row.companyId && !row.contactName; });

            // Stage isn't joinable from phonecall.company (NetSuite rejects
            // {name:'stage', join:'company'} with "An nlobjSearchColumn contains
            // an invalid column"). Do a second-pass batched lookup against
            // customer for unique companyIds. Same pattern loadTaskGroups uses.
            if (!p.skipEntityType) enrichRowsWithEntityType(rows);

            const total = (p.countTotal && results.length >= limit && historySearch.runPaged)
                ? historySearch.runPaged({ pageSize: 1000 }).count
                : rows.length;
            return { rows: sortWithinDay(rows), total: total };
        } catch (e) {
            log.error({ title: 'CTC loadHistoryRows Failed', details: e.message || e });
            return { error: 'History fetch failed', rows: [], total: 0 };
        }
    };

    /**
     * The scope filter for proposed tasks: the source call's `assigned`
     * employee in `ownerIds` (Reporting Central team / member view), else
     * the source call's company in the rep's book. NetSuite search can't do
     * the 3-hop join (proposed_task → phone_call → company → salesteam), so
     * the book (primary OR Sales Team member) comes from SuiteQL (or the
     * caller, which already has it), then one join filters the tasks by
     * their call's company. Before 2026-11-02 this listed the book's first
     * 1000 calls (no date, no sort) and filtered on those ids: a rep with
     * more calls lost follow-ups.
     * @param {{userId?: (string|number), ownerIds?: Array<string>, bookCustomerIds?: Array<string>}} p
     * @returns {Array|null} a filter expression, or null when nothing is in scope
     */
    const proposedTaskScope = (p) => {
        if (Array.isArray(p.ownerIds)) {
            return p.ownerIds.length ? ['custrecord_ctc_pt_phone_call.assigned', 'anyof', p.ownerIds] : null;
        }
        const book = Array.isArray(p.bookCustomerIds) ? p.bookCustomerIds : getBookCustomerIds({ userId: p.userId });
        return book.length ? ['custrecord_ctc_pt_phone_call.company', 'anyof', book] : null;
    };

    /**
     * Load proposed_task rows for a user, grouped by source phone call.
     *
     * @param {{
     *   userId?: string|number,
     *   tab?: string,
     *   phoneCallId?: string|number,
     *   bookCustomerIds?: Array<string>,
     *   ownerIds?: Array<string>,
     *   limit?: number,
     *   skipEntityType?: boolean,
     *   skipCount?: boolean
     * }} [params]
     * `skipEntityType` skips the stage lookup (each group.call keeps
     * `entityType` undefined): one customer search less. `skipCount` skips
     * the runPaged count when the limit is reached: `totalTasks` is then
     * the number of tasks returned. Reporting Central and getCallDetail
     * pass them (they never read either).
     * `ownerIds` (Reporting Central team view) keeps tasks whose source
     * call's `assigned` employee is in the list, instead of the book; each
     * group.call then carries `ownerId` / `ownerName`. An empty array
     * returns no groups.
     * @returns {{groups: Array<{call: Object, tasks: Array<Object>}>, totalTasks: number, error?: string}}
     */
    const loadTaskGroups = (params) => {
        try {
            const p = params || {};
            const tab = p.tab || 'pending';
            const limit = parseInt(String(p.limit || ''), 10) || 50;
            const userId = p.userId;
            const byOwner = Array.isArray(p.ownerIds);

            const filterParts = [];
            if (tab === 'pending') {
                filterParts.push([['formulatext: {custrecord_ctc_pt_status}', 'is', 'Pending']]);
            } else if (tab === 'awaiting') {
                filterParts.push([
                    ['formulatext: {custrecord_ctc_pt_status}', 'is', 'Approved'], 'AND',
                    ['custrecord_ctc_pt_task_completed', 'is', 'F']
                ]);
            } else if (tab === 'completed') {
                filterParts.push([
                    ['formulatext: {custrecord_ctc_pt_status}', 'is', 'Approved'], 'AND',
                    ['custrecord_ctc_pt_task_completed', 'is', 'T']
                ]);
            } else if (tab === 'rejected') {
                filterParts.push([['formulatext: {custrecord_ctc_pt_status}', 'is', 'Rejected']]);
            }
            // 'all' = no status filter

            if (p.phoneCallId) {
                filterParts.push([['custrecord_ctc_pt_phone_call', 'anyof', String(p.phoneCallId)]]);
            } else {
                const scope = proposedTaskScope({ userId: userId, ownerIds: p.ownerIds, bookCustomerIds: p.bookCustomerIds });
                if (!scope) return { groups: [], totalTasks: 0 };
                filterParts.push([scope]);
            }

            const filters = [];
            filterParts.forEach((part, idx) => {
                if (idx > 0) filters.push('AND');
                part.forEach((p) => filters.push(p));
            });

            const taskSearch = search.create({
                type: 'customrecord_ctc_proposed_task',
                filters: filters,
                // Newest first: created DESC, then internal id DESC (created
                // has minute precision, so same-minute tasks need a tie-break).
                columns: [
                    { name: 'created', sort: search.Sort.DESC },
                    { name: 'internalid', sort: search.Sort.DESC },
                    'custrecord_ctc_pt_phone_call',
                    'custrecord_ctc_pt_text',
                    'custrecord_ctc_pt_status',
                    'custrecord_ctc_pt_proposed_due',
                    'custrecord_ctc_pt_proposed_assignee',
                    'custrecord_ctc_pt_task_completed',
                    'custrecord_ctc_pt_created_task',
                    search.createColumn({ name: 'custevent_ctc_ai_brief', join: 'custrecord_ctc_pt_phone_call' }),
                    search.createColumn({ name: 'custevent_ctc_satisfaction', join: 'custrecord_ctc_pt_phone_call' }),
                    search.createColumn({ name: 'custevent_ctc_voicemail', join: 'custrecord_ctc_pt_phone_call' }),
                    search.createColumn({ name: 'startdate', join: 'custrecord_ctc_pt_phone_call' }),
                    search.createColumn({ name: 'company', join: 'custrecord_ctc_pt_phone_call' })
                ].concat(byOwner ? [search.createColumn({ name: 'assigned', join: 'custrecord_ctc_pt_phone_call' })] : [])
            });
            const results = taskSearch.run().getRange({ start: 0, end: limit });
            // totalTasks is every pending task, not only the rows returned.
            // Count only when the limit may have cut the list.
            const totalTasks = (results.length < limit || p.skipCount) ? results.length : taskSearch.runPaged({ pageSize: 1000 }).count;

            // For joined SELECT columns, getValue returns the internal ID and getText
            // returns the display text. Use getText for display fields, getValue for IDs.
            const joinedText = (r, name) => {
                const col = { name: name, join: 'custrecord_ctc_pt_phone_call' };
                if (r.getText) {
                    const t = r.getText(col);
                    if (t) return t;
                }
                return extractText(r.getValue(col));
            };

            // Groups keep the order of their newest task. Object.keys would
            // put integer-like call ids in ascending order, so the order
            // lives in its own array. Each task carries `rank` (its place
            // in the newest-first search) so callers can flatten the groups
            // and still list tasks newest first.
            const groupsByCallId = {};
            const groupOrder = [];
            results.forEach((r, rank) => {
                const callValue = r.getValue('custrecord_ctc_pt_phone_call');
                const callId = extractId(callValue) || callValue || '';
                if (!groupsByCallId[callId]) {
                    groupOrder.push(callId);
                    groupsByCallId[callId] = {
                        call: {
                            id: callId,
                            companyId: extractId(r.getValue({ name: 'company', join: 'custrecord_ctc_pt_phone_call' })),
                            companyName: joinedText(r, 'company'),
                            brief: r.getValue({ name: 'custevent_ctc_ai_brief', join: 'custrecord_ctc_pt_phone_call' }) || '',
                            satisfaction: isVoicemailValue(r.getValue({ name: 'custevent_ctc_voicemail', join: 'custrecord_ctc_pt_phone_call' })) ? null
                                : (parseInt(r.getValue({ name: 'custevent_ctc_satisfaction', join: 'custrecord_ctc_pt_phone_call' }), 10) || null),
                            date: r.getValue({ name: 'startdate', join: 'custrecord_ctc_pt_phone_call' }) || ''
                        },
                        tasks: []
                    };
                    if (byOwner) {
                        groupsByCallId[callId].call.ownerId = extractId(r.getValue({ name: 'assigned', join: 'custrecord_ctc_pt_phone_call' }));
                        groupsByCallId[callId].call.ownerName = joinedText(r, 'assigned');
                    }
                }

                // Same getText handling for local SELECT fields
                const localText = (name) => {
                    if (r.getText) {
                        const t = r.getText(name);
                        if (t) return t;
                    }
                    return extractText(r.getValue(name));
                };

                groupsByCallId[callId].tasks.push({
                    id: r.id,
                    rank: rank,
                    text: r.getValue('custrecord_ctc_pt_text') || '',
                    status: localText('custrecord_ctc_pt_status'),
                    proposedDue: r.getValue('custrecord_ctc_pt_proposed_due') || '',
                    assigneeName: localText('custrecord_ctc_pt_proposed_assignee'),
                    taskCompleted: r.getValue('custrecord_ctc_pt_task_completed') === true ||
                                   r.getValue('custrecord_ctc_pt_task_completed') === 'T',
                    createdTaskId: extractId(r.getValue('custrecord_ctc_pt_created_task'))
                });
            });

            const groups = groupOrder.map((k) => groupsByCallId[k]);

            // Second-pass batched stage lookup so each group.call gets a Lead /
            // Prospect / Customer label. NetSuite doesn't support the 3-hop join
            // proposed_task → phone_call → company → stage in a single search.
            if (!p.skipEntityType) enrichRowsWithEntityType(groups.map((g) => g.call));

            return { groups: groups, totalTasks: totalTasks };
        } catch (e) {
            log.error({ title: 'CTC loadTaskGroups Failed', details: e.message || e });
            return { error: 'Tasks fetch failed', groups: [], totalTasks: 0 };
        }
    };

    // Reporting Central Follow-ups: the most rows one search page returns.
    const FOLLOW_UP_LIMIT = 1000;
    const PT_CALL = 'custrecord_ctc_pt_phone_call';
    const PT_TASK = 'custrecord_ctc_pt_created_task';

    const PT_STATUS = 'formulatext: {custrecord_ctc_pt_status}';

    /**
     * Open follow-ups, whatever their date: Pending, or Approved with the
     * Task not completed (the follow-up's flag off and the Task's status Not
     * started / In progress). One formula condition: NetSuite refuses
     * nested AND / OR groups past a small depth ("Maximum parentheses depth
     * exceeded", seen live 2026-11-02).
     * @returns {Array<*>} a filter expression
     */
    const OPEN_FOLLOW_UP_FORMULA = "formulatext: CASE" +
        " WHEN {custrecord_ctc_pt_status} = 'Pending' THEN 'Y'" +
        " WHEN {custrecord_ctc_pt_status} = 'Approved' AND {custrecord_ctc_pt_task_completed} = 'F'" +
        " AND {" + PT_TASK + ".status} IN ('Not Started', 'In Progress') THEN 'Y'" +
        " ELSE 'N' END";
    const openFollowUpFilter = () => [OPEN_FOLLOW_UP_FORMULA, 'is', 'Y'];

    /**
     * Done follow-ups in a range. `range` is a `startdate` filter expression
     * (lib/ctc_rc_scope.js searchDateFilter); only its operator and values
     * are used. Done = dismissed (Rejected), or Approved with the
     * follow-up's flag on or the Task's status Completed. The date is when
     * it was done:
     *   - dismissed: the review date (custrecord_ctc_pt_reviewed_date);
     *   - completed: custrecord_ctc_pt_task_completed_date (set by
     *     Reporting Central's Mark complete), else the Task's own
     *     `completeddate` (completed in NetSuite);
     *   - when the record holds none of these, the source call's date.
     * Two flat formula conditions (see openFollowUpFilter for why).
     * @param {Array} range
     * @returns {Array<*>} a filter expression
     */
    const DONE_FOLLOW_UP_FORMULA = "formulatext: CASE" +
        " WHEN {custrecord_ctc_pt_status} = 'Rejected' THEN 'Y'" +
        " WHEN {custrecord_ctc_pt_status} = 'Approved' AND ({custrecord_ctc_pt_task_completed} = 'T'" +
        " OR {" + PT_TASK + ".status} = 'Completed') THEN 'Y'" +
        " ELSE 'N' END";
    const DONE_DATE_FORMULA = "formuladate: CASE WHEN {custrecord_ctc_pt_status} = 'Rejected'" +
        " THEN NVL({custrecord_ctc_pt_reviewed_date}, {" + PT_CALL + ".startdate})" +
        " ELSE NVL({custrecord_ctc_pt_task_completed_date}, NVL({" + PT_TASK + ".completeddate}, {" + PT_CALL + ".startdate})) END";
    const doneFollowUpFilter = (range) => [
        [DONE_FOLLOW_UP_FORMULA, 'is', 'Y'], 'AND', [DONE_DATE_FORMULA].concat(range.slice(1))
    ];

    /**
     * Reporting Central Follow-ups, in two searches (10 units each), newest
     * first (created DESC, internal id DESC), up to FOLLOW_UP_LIMIT rows each:
     *   - open (To review, My tasks): every one in scope, whatever the
     *     range: open work never drops out of the page;
     *   - done (completed, dismissed): only those done in the range
     *     (`dateFilter`, the calls list's `startdate` expression; see
     *     doneFollowUpFilter). Without `dateFilter`: none.
     * Scope = proposedTaskScope (the book, or `ownerIds`). The Task an
     * approval created comes along (status, due date, priority, assignee,
     * completed date).
     * @param {{userId?: (string|number), ownerIds?: Array<string>, bookCustomerIds?: Array<string>,
     *   dateFilter?: Array, limit?: number}} params
     * @returns {{rows: Array<Object>, truncated: boolean, openTruncated: boolean, doneTruncated: boolean, error?: string}}
     */
    const loadFollowUpRows = (params) => {
        try {
            const p = params || {};
            const limit = Math.min(FOLLOW_UP_LIMIT, parseInt(String(p.limit || ''), 10) || FOLLOW_UP_LIMIT);
            const none = { rows: [], truncated: false, openTruncated: false, doneTruncated: false };
            const scope = proposedTaskScope(p);
            if (!scope) return none;
            const hasRange = Array.isArray(p.dateFilter) && p.dateFilter.length > 2;
            const open = runFollowUpSearch([scope, 'AND', openFollowUpFilter()], limit, 0);
            const done = hasRange ? runFollowUpSearch([scope, 'AND', doneFollowUpFilter(p.dateFilter)], limit, open.length) : [];
            return {
                rows: open.concat(done),
                truncated: open.length >= limit || done.length >= limit,
                openTruncated: open.length >= limit,
                doneTruncated: done.length >= limit
            };
        } catch (e) {
            log.error({ title: 'CTC loadFollowUpRows Failed', details: (e && e.message) || String(e) });
            return { error: 'Follow-ups fetch failed', rows: [], truncated: false, openTruncated: false, doneTruncated: false };
        }
    };

    /**
     * One follow-up search → rows (loadFollowUpRows).
     * @param {Array<*>} filters
     * @param {number} limit
     * @param {number} rankFrom - the first row's rank
     * @returns {Array<Object>}
     */
    const runFollowUpSearch = (filters, limit, rankFrom) => {
        const callCol = (name) => search.createColumn({ name: name, join: PT_CALL });
        const taskCol = (name) => search.createColumn({ name: name, join: PT_TASK });
        const results = search.create({
            type: 'customrecord_ctc_proposed_task',
            filters: filters,
            columns: [
                { name: 'created', sort: search.Sort.DESC },
                { name: 'internalid', sort: search.Sort.DESC },
                PT_CALL, 'custrecord_ctc_pt_text', 'custrecord_ctc_pt_status', 'custrecord_ctc_pt_proposed_due',
                'custrecord_ctc_pt_reviewer', 'custrecord_ctc_pt_reviewed_date', PT_TASK,
                'custrecord_ctc_pt_task_completed', 'custrecord_ctc_pt_task_completed_date',
                callCol('title'), callCol('startdate'), callCol('company'), callCol('assigned'),
                callCol('custevent_ctc_duration'), callCol('custevent_ctc_voicemail'), callCol('custevent_ctc_inbound'),
                taskCol('status'), taskCol('duedate'), taskCol('priority'), taskCol('assigned'), taskCol('completeddate')
            ]
        }).run().getRange({ start: 0, end: limit });

        const text = (r, col) => {
            if (r.getText) {
                const t = r.getText(col);
                if (t) return String(t);
            }
            return extractText(r.getValue(col));
        };
        const value = (r, col) => {
            const v = r.getValue(col);
            return v == null ? '' : v;
        };
        const checked = (v) => v === true || v === 'T';
        const rows = results.map((r, rank) => {
            const c = (name) => ({ name: name, join: PT_CALL });
            const t = (name) => ({ name: name, join: PT_TASK });
            const createdTaskId = extractId(value(r, PT_TASK));
            return {
                id: String(r.id),
                rank: rankFrom + rank,
                text: String(value(r, 'custrecord_ctc_pt_text')),
                status: text(r, 'custrecord_ctc_pt_status'),
                proposedDue: String(value(r, 'custrecord_ctc_pt_proposed_due')),
                created: String(value(r, 'created')),
                reviewerId: extractId(value(r, 'custrecord_ctc_pt_reviewer')),
                reviewerName: text(r, 'custrecord_ctc_pt_reviewer'),
                reviewedDate: String(value(r, 'custrecord_ctc_pt_reviewed_date')),
                taskCompleted: checked(value(r, 'custrecord_ctc_pt_task_completed')),
                completedDate: String(value(r, 'custrecord_ctc_pt_task_completed_date')) ||
                    (createdTaskId ? String(value(r, t('completeddate'))) : ''),
                createdTaskId: createdTaskId,
                taskStatus: createdTaskId ? String(extractId(value(r, t('status'))) || '') : '',
                taskStatusText: createdTaskId ? text(r, t('status')) : '',
                taskDue: createdTaskId ? String(value(r, t('duedate'))) : '',
                taskPriority: createdTaskId ? String(extractId(value(r, t('priority'))) || '') : '',
                taskAssigneeId: createdTaskId ? extractId(value(r, t('assigned'))) : '',
                taskAssigneeName: createdTaskId ? text(r, t('assigned')) : '',
                call: {
                    id: extractId(value(r, PT_CALL)),
                    title: String(value(r, c('title'))),
                    date: String(value(r, c('startdate'))),
                    companyId: extractId(value(r, c('company'))),
                    companyName: text(r, c('company')),
                    ownerId: extractId(value(r, c('assigned'))),
                    ownerName: text(r, c('assigned')),
                    duration: parseInt(value(r, c('custevent_ctc_duration')), 10) || 0,
                    voicemail: checked(value(r, c('custevent_ctc_voicemail'))),
                    direction: checked(value(r, c('custevent_ctc_inbound'))) ? 'inbound' : 'outbound'
                }
            };
        });
        return rows;
    };

    /**
     * Pending follow-ups (proposed tasks with status Pending, Reporting
     * Central's "To review") per source Phone Call, for the given calls.
     * One search (10 units), none when `callIds` is empty. Up to
     * FOLLOW_UP_LIMIT tasks are counted.
     * @param {Array<string>} callIds
     * @returns {Object<string, number>} call id → count (calls with none are absent)
     */
    const pendingFollowUpsByCall = (callIds) => {
        /** @type {Object<string, number>} */
        const out = {};
        const ids = (callIds || []).map(String).filter((id) => !!id);
        if (!ids.length) return out;
        search.create({
            type: 'customrecord_ctc_proposed_task',
            filters: [
                [PT_CALL, 'anyof', ids], 'AND',
                [PT_STATUS, 'is', 'Pending']
            ],
            columns: [PT_CALL]
        }).run().getRange({ start: 0, end: FOLLOW_UP_LIMIT }).forEach((r) => {
            const id = extractId(r.getValue(PT_CALL));
            if (id) out[id] = (out[id] || 0) + 1;
        });
        return out;
    };

    // The outcome keys the dock shows (RESTlet `outcome`). Every other
    // ctcHtml.outcomeOf key ('no_transcript', and 'follow_up', which the
    // dock reads from `followUps`) is sent as null.
    const DOCK_OUTCOMES = ['summary_ready', 'summarizing', 'too_short', 'missed', 'no_answer', 'voicemail', 'failed'];

    /**
     * The dock's outcome key for a history row: ctcHtml.outcomeOf (the
     * rule Reporting Central and the portlet use) without the follow-up
     * step, mapped to DOCK_OUTCOMES, else null.
     * @param {Object} row - loadHistoryRows row
     * @returns {string|null}
     */
    const dockOutcomeOf = (row) => {
        const key = ctcHtml.outcomeOf(row, 0).key;
        return key && DOCK_OUTCOMES.indexOf(key) !== -1 ? key : null;
    };

    /**
     * Adds `outcome` (dockOutcomeOf) and `followUps` (pending proposed
     * tasks on that Phone Call) to each row, in place. One proposed-task
     * search for all rows (pendingFollowUpsByCall). When that search fails,
     * `followUps` is 0 on every row and the error is logged.
     * @param {Array<Object>} rows - loadHistoryRows rows
     * @returns {Array<Object>} the same rows
     */
    const addDockOutcomes = (rows) => {
        const list = rows || [];
        let pending = {};
        try {
            pending = pendingFollowUpsByCall(list.map((r) => r.id));
        } catch (e) {
            log.error({ title: 'CTC pendingFollowUpsByCall Failed', details: (e && e.message) || String(e) });
        }
        list.forEach((r) => {
            r.outcome = dockOutcomeOf(r);
            r.followUps = pending[String(r.id)] || 0;
        });
        return list;
    };

    /**
     * Compute headline stats from a set of history rows.
     * @param {Array<Object>} rows
     * @returns {{ callsToday: number, avgSat: string, talkTimeMinutes: number }}
     */
    const computeStats = (rows) => {
        rows = rows || [];
        const sats = rows.filter((r) => r.satisfaction);
        const avgSat = sats.length
            ? (sats.reduce((a, r) => a + r.satisfaction, 0) / sats.length).toFixed(1)
            : '—';
        const totalSec = rows.reduce((a, r) => a + (r.duration || 0), 0);
        return {
            callsToday: rows.length,
            avgSat: avgSat,
            talkTimeMinutes: Math.round(totalSec / 60)
        };
    };

    // ─── Reporting Central ──────────────────────────────────────────────────

    /**
     * Satisfaction band for a 1-10 score: 'high' (7+), 'mid' (5-6), 'low'
     * (1-4) or 'none' (unscored). Callers map the band to their CSS class.
     * @param {*} n
     * @returns {'high'|'mid'|'low'|'none'}
     */
    // Same bands as ctcHtml.satBand (Low 1-3, Moderate 4-6, High 7-10), so
    // the portlet and Reporting Central never disagree on a score.
    const satClass = (n) => {
        if (typeof n !== 'number' || !n) return 'none';
        if (n >= 7) return 'high';
        if (n >= 4) return 'mid';
        return 'low';
    };

    // Checkbox search value: true / 'T' when checked.
    const isVoicemailValue = (v) => v === true || v === 'T';

    /**
     * True when a call did not connect: no talk time, or a voicemail (its
     * duration is the recording, not a conversation).
     * @param {{duration?: number, voicemail?: boolean}} row
     * @returns {boolean}
     */
    const isUnconnected = (row) => !(row && row.duration > 0) || !!(row && row.voicemail === true);

    /**
     * True for a missed call: status 'Missed' (reconciliation), a voicemail,
     * or an inbound call with no talk time (calls logged before
     * reconciliation). The same rule as the direction icon.
     * @param {{callStatus?: string, voicemail?: boolean, direction?: string, duration?: number}} row
     * @returns {boolean}
     */
    const isMissedCall = (row) => !!row && (row.callStatus === 'Missed' || row.voicemail === true ||
        (row.direction === 'inbound' && !(row.duration > 0)));

    /**
     * Filter history rows by direction and a search text. Pure: no queries.
     * direction: 'all' | 'outbound' | 'inbound' | 'missed' | 'connected'.
     * 'missed' = isMissedCall; 'outbound' / 'inbound' = the other calls in
     * that direction (an unanswered outbound call is outbound). Those three
     * split the rows with no overlap. 'connected' = not missed, with talk
     * time, not a voicemail (Reporting Central's Connected tab).
     * The search matches company or contact name (case-insensitive), or the
     * phone digits when the text holds 3 or more digits.
     * @param {Array<Object>} rows
     * @param {{direction?: string, search?: string}} [opts]
     * @returns {Array<Object>}
     */
    const filterCallRows = (rows, opts) => {
        const o = opts || {};
        const dir = o.direction || 'all';
        const text = String(o.search || '').trim().toLowerCase();
        const digits = text.replace(/[^0-9]/g, '');
        return (rows || []).filter((r) => {
            if (dir === 'missed' && !isMissedCall(r)) return false;
            if (dir === 'connected' && (isMissedCall(r) || isUnconnected(r))) return false;
            if ((dir === 'outbound' || dir === 'inbound') &&
                (isMissedCall(r) || (r.direction || 'outbound') !== dir)) return false;
            if (!text) return true;
            const names = (String(r.companyName || '') + ' ' + String(r.contactName || '')).toLowerCase();
            if (names.indexOf(text) !== -1) return true;
            return digits.length >= 3 && String(r.phone || '').replace(/[^0-9]/g, '').indexOf(digits) !== -1;
        });
    };

    /**
     * Count CTC calls in the rep's book for a NetSuite date keyword (for
     * "vs previous period"). Returns null on failure so callers omit the delta.
     * `dateFilter` (an N/search `startdate` expression) replaces the keyword;
     * `ownerIds` scopes by the Phone Call's `assigned` employee instead of
     * the book (as loadHistoryRows).
     * @param {{userId?: string|number, bookCustomerIds?: Array<string>, ownerIds?: Array<string>,
     *   dateKeyword?: string, dateFilter?: Array}} params
     * @returns {number|null}
     */
    const countCalls = (params) => {
        try {
            const p = params || { dateKeyword: '' };
            if (!p.dateKeyword && !Array.isArray(p.dateFilter)) return null;
            const byOwner = Array.isArray(p.ownerIds);
            const ids = byOwner ? p.ownerIds
                : (Array.isArray(p.bookCustomerIds) ? p.bookCustomerIds : getBookCustomerIds({ userId: p.userId }));
            if (!ids.length) return 0;
            const op = (p.dateKeyword === 'today' || p.dateKeyword === 'yesterday') ? 'on' : 'within';
            return search.create({
                type: search.Type.PHONE_CALL,
                filters: [
                    [byOwner ? 'assigned' : 'company', 'anyof', ids], 'AND',
                    ['custevent_ctc_call_sid', 'isnotempty', ''], 'AND',
                    Array.isArray(p.dateFilter) ? p.dateFilter : ['startdate', op, p.dateKeyword]
                ],
                columns: ['internalid']
            }).runPaged({ pageSize: 1000 }).count;
        } catch (e) {
            log.error({ title: 'CTC countCalls Failed', details: e.message || e });
            return null;
        }
    };

    /**
     * The rep's Twilio caller ID from customrecord_ctc_rep_assignment: the
     * primary assignment, else the first one. '' when none or on failure.
     * @param {{userId?: string|number}} [params]
     * @returns {string}
     */
    const getRepPhoneNumber = (params) => {
        try {
            const userId = parseInt(String((params && params.userId) || ''), 10);
            if (!userId) return '';
            const results = search.create({
                type: 'customrecord_ctc_rep_assignment',
                filters: [
                    ['custrecord_ctc_ra_employee', 'anyof', userId], 'AND',
                    ['isinactive', 'is', 'F']
                ],
                columns: ['custrecord_ctc_ra_phone_number', 'custrecord_ctc_ra_is_primary']
            }).run().getRange({ start: 0, end: 20 });
            let first = '';
            for (let i = 0; i < results.length; i++) {
                const phone = String(results[i].getValue('custrecord_ctc_ra_phone_number') || '');
                if (!phone) continue;
                const primary = results[i].getValue('custrecord_ctc_ra_is_primary');
                if (primary === true || primary === 'T') return phone;
                if (!first) first = phone;
            }
            return first;
        } catch (e) {
            log.error({ title: 'CTC getRepPhoneNumber Failed', details: e.message || e });
            return '';
        }
    };

    // ─── Iteration B · Phase 2 — softphone Search tab ───────────────────────

    // Map stage codes to lowercase wire names used by the softphone client.
    // search.Type.CUSTOMER covers all three stages; filter by `stage` field.
    const STAGE_TO_WIRE = { LEAD: 'lead', PROSPECT: 'prospect', CUSTOMER: 'customer' };
    const WIRE_TO_STAGE = { lead: 'LEAD', prospect: 'PROSPECT', customer: 'CUSTOMER' };

    /**
     * Pack a SuiteQL row (asMappedResults shape — lowercase keys) into the
     * wire shape the softphone client renders. Phase 2 kept this minimal —
     * just enough to render a search-result row and arm the Call button.
     */
    const packEntityRowSql = (r) => {
        const stage = String(r.stage || '').toUpperCase();
        const company = r.companyname || '';
        const first   = r.firstname || '';
        const last    = r.lastname || '';
        const contactName = (first || last) ? (first + ' ' + last).trim() : '';
        return {
            id: String(r.id),
            type: STAGE_TO_WIRE[stage] || 'customer',
            companyName: company || contactName || ('Entity ' + r.id),
            contactName: contactName,
            phone: r.phone || '',
            email: r.email || '',
            lastModified: r.lastmodifieddate || ''
        };
    };

    const ISO_DAY = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

    /**
     * Adds `lastCalledAt` and `lastActivityAt` (ISO text or null) to packed
     * entity rows, in place. One SuiteQL query for all rows (10 units),
     * none when there are no rows:
     *   - lastCalledAt: the newest CTC Phone Call (custevent_ctc_call_sid
     *     set; the calls Recents lists) to the entity: its
     *     custevent_ctc_call_started (ISO UTC), else its start date
     *     ('YYYY-MM-DD') when that call has no start time;
     *   - lastActivityAt: the newest Phone Call (any) or Task on the entity
     *     (the Phone call and Task sources of the snapshot's Last activity
     *     tile; Events link by attendee and are left out): lastCalledAt when
     *     it is on that day, else the day ('YYYY-MM-DD').
     * When the query fails, both stay null and the error is logged: the
     * rows themselves are still returned.
     * @param {Array<Object>} rows - packEntityRowSql rows
     * @returns {Array<Object>} the same rows
     */
    const addLastDates = (rows) => {
        rows.forEach((r) => { r.lastCalledAt = null; r.lastActivityAt = null; });
        const ids = rows.map((r) => String(r.id)).filter((id) => /^[0-9]+$/.test(id));
        if (!ids.length) return rows;
        const marks = ids.map(() => '?').join(', ');
        const sql =
            'SELECT a.company AS id, MAX(a.ctcstarted) AS ctcstarted, MAX(a.ctcday) AS ctcday, MAX(a.actday) AS actday ' +
            'FROM ( ' +
            '  SELECT pc.company AS company, ' +
            '    CASE WHEN pc.custevent_ctc_call_sid IS NOT NULL THEN TO_CHAR(pc.custevent_ctc_call_started) END AS ctcstarted, ' +
            "    CASE WHEN pc.custevent_ctc_call_sid IS NOT NULL THEN TO_CHAR(pc.startdate, 'YYYY-MM-DD') END AS ctcday, " +
            "    TO_CHAR(pc.startdate, 'YYYY-MM-DD') AS actday " +
            '  FROM phonecall pc WHERE pc.company IN (' + marks + ') ' +
            '  UNION ALL ' +
            "  SELECT t.company AS company, NULL AS ctcstarted, NULL AS ctcday, TO_CHAR(t.createddate, 'YYYY-MM-DD') AS actday " +
            '  FROM task t WHERE t.company IN (' + marks + ') ' +
            ') a ' +
            'GROUP BY a.company';
        try {
            /** @type {Object<string, Object>} */
            const byId = {};
            query.runSuiteQL({ query: sql, params: ids.concat(ids) }).asMappedResults().forEach((m) => {
                byId[String(m.id)] = m;
            });
            rows.forEach((r) => {
                const m = byId[String(r.id)];
                if (!m) return;
                const startedMs = ctcTime.parseIsoUtc(m.ctcstarted);
                const started = startedMs === null ? '' : ctcTime.isoUtc(startedMs);
                const ctcDay = ISO_DAY.test(String(m.ctcday || '')) ? String(m.ctcday) : '';
                const actDay = ISO_DAY.test(String(m.actday || '')) ? String(m.actday) : '';
                // A newer CTC call with no start time wins by its day.
                const called = (ctcDay && ctcDay > started.slice(0, 10)) ? ctcDay : (started || ctcDay);
                r.lastCalledAt = called || null;
                r.lastActivityAt = (actDay && actDay > called.slice(0, 10)) ? actDay : (called || actDay || null);
            });
        } catch (e) {
            log.error({ title: 'CTC addLastDates Failed', details: (e && e.message) || String(e) });
        }
        return rows;
    };

    /**
     * Shared SuiteQL helper that returns customers/prospects/leads in the
     * current rep's "book" — defined as records where the rep is EITHER the
     * primary `salesrep` OR a member of the entity's Sales Team sublist
     * (`customerSalesTeam.employee`). Replaces a pair of N/search-based
     * paths whose join name (`salesteam.employee`) silently returned zero.
     *
     * @param {{
     *   userId: string|number,
     *   stages?: Array<string>,
     *   matchQuery?: string,
     *   limit?: number
     * }} opts - stages defaults to all three; limit capped 1..50
     * @returns {Array<Object>} packed entity rows
     */
    const runBookEntityQuery = (opts) => {
        const userId = parseInt(String(opts.userId), 10);
        const stages = (opts.stages && opts.stages.length)
            ? opts.stages
            : ['LEAD', 'PROSPECT', 'CUSTOMER'];
        const limit  = Math.min(Math.max(parseInt(String(opts.limit || ''), 10) || 20, 1), 50);
        const matchQ = String(opts.matchQuery || '').trim();
        const hasMatch = matchQ.length > 0;

        // Inline the stage list — it's a small enum from a fixed map, so
        // there's no injection vector. The two userId binds are kept as
        // parameters to N/query (the only place untrusted input could land).
        const stageLits = stages.map((s) => "'" + s + "'").join(',');

        // GROUP BY c.id only — per-customer columns are constant across the
        // LEFT JOIN rows, so MAX() is a no-op aggregator that satisfies the
        // SQL aggregation rule without listing every column. Earlier attempts
        // that listed every column in GROUP BY (including BUILTIN.DF()) blew
        // up silently on the sandbox; this shape is what's known-good.
        //
        // The isprimary / isteammember CASE expressions inline userId (already
        // parseInt-coerced above, so no injection vector) since SuiteQL `?`
        // binds are strictly positional and adding more `?` parameters here
        // would mean retro-fitting four extra params for what's purely a
        // verification flag. Inline is simpler and equivalent.
        let sql =
            'SELECT ' +
            '    c.id                    AS id, ' +
            '    MAX(c.companyname)      AS companyname, ' +
            '    MAX(c.firstname)        AS firstname, ' +
            '    MAX(c.lastname)         AS lastname, ' +
            '    MAX(c.phone)            AS phone, ' +
            '    MAX(c.email)            AS email, ' +
            '    MAX(c.stage)            AS stage, ' +
            '    MAX(c.lastmodifieddate) AS lastmodifieddate, ' +
            '    MAX(CASE WHEN c.salesrep   = ' + userId + ' THEN 1 ELSE 0 END) AS isprimary, ' +
            '    MAX(CASE WHEN cst.employee = ' + userId + ' THEN 1 ELSE 0 END) AS isteammember ' +
            'FROM customer c ' +
            // CustomerSalesTeam.customer is the parent-customer reference column
            // (sandbox audit log: `Field 'entity' for record 'CustomerSalesTeam'
            // was not found.` — the column is `customer`, not `entity`).
            'LEFT JOIN customerSalesTeam cst ON cst.customer = c.id ' +
            'WHERE (c.salesrep = ? OR cst.employee = ?) ' +
            '  AND c.isInactive = \'F\' ' +
            '  AND c.stage IN (' + stageLits + ') ';

        /** @type {Array<string|number>} */
        const params = [userId, userId];

        if (hasMatch) {
            const like = '%' + matchQ.toLowerCase() + '%';
            sql +=
                '  AND ( ' +
                '       LOWER(c.companyname) LIKE ? ' +
                '    OR LOWER(c.firstname)   LIKE ? ' +
                '    OR LOWER(c.lastname)    LIKE ? ' +
                '    OR LOWER(c.phone)       LIKE ? ' +
                '    OR LOWER(c.email)       LIKE ? ' +
                '  ) ';
            params.push(like, like, like, like, like);
        }

        sql +=
            'GROUP BY c.id ' +
            'ORDER BY MAX(c.lastmodifieddate) DESC ' +
            'FETCH FIRST ' + limit + ' ROWS ONLY';

        // Audit-log the SQL + params so script-execution-log readers can see
        // exactly what was sent if a query returns zero rows unexpectedly.
        log.audit({
            title: 'CTC runBookEntityQuery',
            details: 'sql=' + sql + ' params=' + JSON.stringify(params)
        });

        const rs = query.runSuiteQL({ query: sql, params: params });
        const mapped = rs.asMappedResults();

        // Verification breakdown — bucket by stage and by role (primary /
        // secondary-only / both) so the rep can sanity-check the book
        // contents against their NetSuite Sales Team membership without
        // running a separate query. Each line is short enough to read in
        // the Script Execution log details column.
        const stageCounts = { CUSTOMER: 0, PROSPECT: 0, LEAD: 0, OTHER: 0 };
        const roleCounts  = { primaryOnly: 0, secondaryOnly: 0, both: 0, none: 0 };
        const rows = mapped.map((r) => {
            const stageKey = String(r.stage || 'OTHER').toUpperCase();
            stageCounts[stageKey] = (stageCounts[stageKey] || 0) + 1;
            const isPrimary  = String(r.isprimary)    === '1';
            const isTeam     = String(r.isteammember) === '1';
            if (isPrimary && isTeam)        roleCounts.both++;
            else if (isPrimary)             roleCounts.primaryOnly++;
            else if (isTeam)                roleCounts.secondaryOnly++;
            else                            roleCounts.none++;
            return r;
        });

        // HIGH-9 (SAFE review 2026-05-21) — breakdown remains at debug
        // level only. Pre-fix this fired at log.audit on every softphone
        // search keypress, filling the Script Execution Log with traffic
        // proportional to typing rate. Audit-log noise + minor data-min
        // concern (stage/role distribution by user). Demoted to debug so
        // it's still available for troubleshooting without the audit-log
        // pollution. The per-row dump (id, companyname, stage, role)
        // was REMOVED entirely — it pushed customer/lead names (including
        // personal names from Lead records) into the audit log on every
        // search and BFN reviewers consistently flag that pattern.
        log.debug({
            title: 'CTC runBookEntityQuery breakdown',
            details:
                'rowCount=' + mapped.length +
                ' | stages=' + JSON.stringify(stageCounts) +
                ' | roles=' + JSON.stringify(roleCounts)
        });

        return addLastDates(rows.map(packEntityRowSql));
    };

    /**
     * Returns the rep's top N owned Customer / Prospect / Lead entities,
     * sorted by lastmodifieddate descending. Populates the empty-state
     * "Suggested · your book" list in the softphone Search tab.
     *
     * @param {Object} params
     * @param {string|number} params.userId
     * @param {number} [params.limit=20]
     * @returns {{ rows: Array<Object>, total: number }} — `{ error }` on failure
     */
    /**
     * Returns the true book size + per-stage breakdown for the current rep.
     * Powers the Search tab's chip count badges so they reflect the *real*
     * book ("My book 112 · Customer 95 · Prospect 4 · Lead 13") instead of
     * the displayed-slice counts. Single COUNT(DISTINCT) query — cheap
     * relative to the row-fetch.
     *
     * @param {{userId?: string|number}} [params]
     * @returns {{total: number, customer: number, prospect: number, lead: number, error?: string}}
     */
    const getBookCounts = (params) => {
        try {
            const p = params || {};
            const userId = parseInt(String(p.userId || ''), 10);
            if (!userId) {
                return { error: 'userId required', total: 0, customer: 0, prospect: 0, lead: 0 };
            }
            // CASE WHEN over a DISTINCT-counted set so a single query gives us
            // the per-stage breakdown. The LEFT JOIN + COUNT DISTINCT collapses
            // duplicate rows from the salesteam sublist (one customer can have
            // multiple salesteam line rows; we count the customer once).
            const sql =
                'SELECT ' +
                '  COUNT(DISTINCT c.id) AS total, ' +
                '  COUNT(DISTINCT CASE WHEN c.stage = \'CUSTOMER\' THEN c.id END) AS customer, ' +
                '  COUNT(DISTINCT CASE WHEN c.stage = \'PROSPECT\' THEN c.id END) AS prospect, ' +
                '  COUNT(DISTINCT CASE WHEN c.stage = \'LEAD\'     THEN c.id END) AS lead ' +
                'FROM customer c ' +
                'LEFT JOIN customerSalesTeam cst ON cst.customer = c.id ' +
                'WHERE (c.salesrep = ? OR cst.employee = ?) ' +
                '  AND c.isInactive = \'F\' ' +
                '  AND c.stage IN (\'LEAD\',\'PROSPECT\',\'CUSTOMER\')';

            const rs = query.runSuiteQL({ query: sql, params: [userId, userId] });
            const r = (rs.asMappedResults()[0]) || {};
            return {
                total:    parseInt(r.total, 10)    || 0,
                customer: parseInt(r.customer, 10) || 0,
                prospect: parseInt(r.prospect, 10) || 0,
                lead:     parseInt(r.lead, 10)     || 0
            };
        } catch (e) {
            log.error({
                title: 'CTC getBookCounts Failed',
                details: 'name=' + (e && e.name) + ' message=' + (e && e.message) + ' stack=' + (e && e.stack)
            });
            return { error: 'Book counts fetch failed: ' + (e && e.message), total: 0, customer: 0, prospect: 0, lead: 0 };
        }
    };

    /**
     * @param {{userId?: string|number, limit?: number}} [params]
     * @returns {{rows: Array<Object>, total: number, error?: string}}
     */
    const getSuggestedContacts = (params) => {
        try {
            const p = params || {};
            const userId = p.userId;
            // Default 30 (up from 20) - Burt's book is 112, so a 30-row
            // most-recent slice gives reps better coverage in the empty-state
            // pre-fill. Hard cap stays at 50.
            const limit = Math.min(parseInt(String(p.limit || ''), 10) || 30, 50);
            if (!userId) {
                return { error: 'userId required', rows: [], total: 0 };
            }
            // SuiteQL via runBookEntityQuery: rep's book = primary salesrep OR
            // a salesteam member. The N/search join `salesteam.employee` would
            // silently return zero — SuiteQL's `customerSalesTeam` table is
            // deterministic and the LEFT JOIN expresses the OR natively.
            const rows = runBookEntityQuery({ userId: userId, limit: limit });
            return { rows: rows, total: rows.length };
        } catch (e) {
            log.error({
                title: 'CTC getSuggestedContacts Failed',
                details: 'name=' + (e && e.name) + ' message=' + (e && e.message) + ' stack=' + (e && e.stack)
            });
            return { error: 'Suggested fetch failed: ' + (e && e.message), rows: [], total: 0 };
        }
    };

    /**
     * Fuzzy search across the rep's owned book — matches against company
     * name, first name, last name, primary phone, and email. Optional
     * `typeFilter` narrows to a single stage. Returns at most `limit` rows.
     *
     * @param {{
     *   userId?: string|number,
     *   query?: string,
     *   typeFilter?: 'customer'|'prospect'|'lead'|'',
     *   limit?: number
     * }} [params]
     * @returns {{rows: Array<Object>, total: number, error?: string}}
     */
    const searchOwnedEntities = (params) => {
        try {
            const p = params || {};
            const userId = p.userId;
            const userQuery = String(p.query || '').trim();
            const limit = Math.min(parseInt(String(p.limit || ''), 10) || 20, 50);
            const typeFilter = String(p.typeFilter || '').toLowerCase();
            if (!userId) {
                return { error: 'userId required', rows: [], total: 0 };
            }
            if (!userQuery) {
                return { rows: [], total: 0 };
            }
            const stages = WIRE_TO_STAGE[typeFilter]
                ? [WIRE_TO_STAGE[typeFilter]]
                : ['LEAD', 'PROSPECT', 'CUSTOMER'];
            // SuiteQL via runBookEntityQuery: rep's book + a case-insensitive
            // contains match against the five searchable fields. The book
            // includes both primary salesrep AND salesteam-member entities
            // (the user's request: a rep who's secondary on Abbott still
            // sees Abbott in Search).
            const rows = runBookEntityQuery({
                userId: userId,
                stages: stages,
                matchQuery: userQuery,
                limit: limit
            });
            return { rows: rows, total: rows.length };
        } catch (e) {
            log.error({
                title: 'CTC searchOwnedEntities Failed',
                details: 'name=' + (e && e.name) + ' message=' + (e && e.message) + ' stack=' + (e && e.stack)
            });
            return { error: 'Search failed: ' + (e && e.message), rows: [], total: 0 };
        }
    };

    // ─── Iteration B · Phase 6 — in-call account snapshot ──────────────────

    const daysSince = (iso) => {
        if (!iso) return null;
        const t = Date.parse(iso);
        if (isNaN(t)) return null;
        return Math.max(0, Math.floor((Date.now() - t) / 86400000));
    };

    const sumColumn = (results, col) => {
        let s = 0;
        results.forEach((r) => { s += parseFloat(r.getValue(col)) || 0; });
        return s;
    };

    /**
     * Open and partially paid invoices of an entity (status CustInvc:A /
     * CustInvc:B, mainline), up to 200. One search (10 units). Throws on a
     * search error (the caller decides).
     *   - sum: amountremaining; count: invoices
     *   - avgAgeDays / oldestDays: from trandate (daysSince), null with none
     *   - overdueCount: duedate before today
     * @param {string|number} entityId
     * @returns {{sum: number, count: number, avgAgeDays: (number|null), overdueCount: number, oldestDays: (number|null)}}
     */
    const loadOutstanding = (entityId) => {
        const invResults = search.create({
            type: search.Type.INVOICE,
            filters: [
                ['entity', 'anyof', entityId], 'AND',
                ['mainline', 'is', 'T'], 'AND',
                ['status', 'anyof', ['CustInvc:A', 'CustInvc:B']] // Open / Partially paid
            ],
            columns: ['amountremaining', 'trandate', 'duedate']
        }).run().getRange({ start: 0, end: 200 });

        let ageTotal = 0, ageCount = 0, overdueCount = 0;
        /** @type {number|null} */
        let oldestDays = null;
        invResults.forEach((r) => {
            const d = daysSince(r.getValue('trandate'));
            if (d !== null) {
                ageTotal += d;
                ageCount++;
                if (oldestDays === null || d > oldestDays) oldestDays = d;
            }
            const due = daysSince(r.getValue('duedate'));
            if (due !== null && due > 0) overdueCount++;
        });
        return {
            sum: sumColumn(invResults, 'amountremaining'),
            count: invResults.length,
            avgAgeDays: ageCount ? Math.round(ageTotal / ageCount) : null,
            overdueCount: overdueCount,
            oldestDays: oldestDays
        };
    };

    /**
     * Iteration B Phase 6 — account rollup for the dock dialer's insight
     * line and live-call tiles (balance, open opps, last activity). Mini-
     * queries against the entity's open invoices, opportunities, and
     * activity history.
     *
     * Cost: 5 searches (invoices, opportunities, then the newest Phone
     * Call, Task and Event; 50 units). The last activity stays 3 searches:
     * no one Activity search is proven in this repo.
     *
     * @param {{entityId?: string|number, perfSteps?: Object<string, number>}} [params]
     *   perfSteps: optional; gets the ms of each step (RESTlet perf flag)
     * @returns {{
     *   outstanding: { sum: any, count: any, avgAgeDays: any },
     *   openOpps:    { count: any, sum: any },
     *   lastActivity:{ type: any, ageDays: any, date: any } | null,
     *   error?: string
     * }}
     */
    const getAccountSnapshot = (params) => {
        const p = params || {};
        const entityId = p.entityId;
        const steps = p.perfSteps || null;

        const empty = {
            outstanding:  { sum: 0, count: 0, avgAgeDays: null },
            openOpps:     { count: 0, sum: 0 },
            lastActivity: null
        };

        if (!entityId) return Object.assign({}, empty, { error: 'entityId required' });

        try {
            // ── Outstanding invoices: open + partially-paid balances ──
            timeStep(steps, 'outstanding', () => {
                try {
                    const o = loadOutstanding(entityId);
                    empty.outstanding.count = o.count;
                    empty.outstanding.sum = o.sum;
                    empty.outstanding.avgAgeDays = o.avgAgeDays;
                } catch (e) {
                    log.error({ title: 'CTC snapshot outstanding failed', details: e.message || e });
                }
            });

            // ── Open opportunities: count + sum projectedtotal ──
            timeStep(steps, 'openOpps', () => {
                try {
                    const oppResults = search.create({
                        type: search.Type.OPPORTUNITY,
                        filters: [
                            ['entity', 'anyof', entityId], 'AND',
                            ['status', 'noneof', ['Opprtnty:D', 'Opprtnty:G']] // exclude Closed Won / Lost
                        ],
                        columns: ['projectedtotal']
                    }).run().getRange({ start: 0, end: 200 });

                    empty.openOpps.count = oppResults.length;
                    empty.openOpps.sum   = sumColumn(oppResults, 'projectedtotal');
                } catch (e) {
                    log.error({ title: 'CTC snapshot opps failed', details: e.message || e });
                }
            });

            // ── Last activity: most-recent Phone Call / Task / Event ──
            // Phone Call and Task searches both expose a `company` filter
            // (Records Browser). Calendar Event does NOT: its search rejects
            // `company` with "An nlobjSearchFilter contains invalid search
            // criteria: company" (live RESTlet log, 2026-10). Events link to
            // a customer through their attendee list, so the Event search
            // filters on `attendee` instead. Each search runs in its own
            // try/catch, so one bad filter only drops that source and the
            // other two still fill the tile.
            const activitySources = [
                { label: 'Phone call', type: search.Type.PHONE_CALL,     filter: 'company',  dateCol: 'startdate' },
                { label: 'Task',       type: search.Type.TASK,           filter: 'company',  dateCol: 'createddate' },
                { label: 'Event',      type: search.Type.CALENDAR_EVENT, filter: 'attendee', dateCol: 'startdate' }
            ];
            const candidates = [];
            activitySources.forEach((src) => timeStep(steps, 'lastActivity:' + src.label, () => {
                try {
                    const rows = search.create({
                        type: src.type,
                        filters: [[src.filter, 'anyof', entityId]],
                        columns: [{ name: src.dateCol, sort: search.Sort.DESC }]
                    }).run().getRange({ start: 0, end: 1 });
                    if (rows.length) candidates.push({ type: src.label, date: rows[0].getValue(src.dateCol) });
                } catch (e) {
                    log.error({ title: 'CTC snapshot lastActivity failed (' + src.label + ')', details: e.message || e });
                }
            }));

            if (candidates.length) {
                candidates.sort((a, b) => Date.parse(b.date || 0) - Date.parse(a.date || 0));
                const winner = candidates[0];
                empty.lastActivity = {
                    type:    winner.type,
                    date:    winner.date,
                    ageDays: daysSince(winner.date)
                };
            }

            return empty;
        } catch (e) {
            log.error({ title: 'CTC getAccountSnapshot failed', details: e.message || e });
            return Object.assign({ error: 'Snapshot fetch failed' }, empty);
        }
    };

    // ─── Asset 38 — call screen account context ────────────────────────────

    const CALL_CONTEXT_ACTIVITY_MAX = 4;
    const CALL_CONTEXT_FOLLOW_UP_MAX = 3;
    // Pending follow-ups read before the earliest-due sort (one page).
    const CALL_CONTEXT_FOLLOW_UP_READ = 100;

    /**
     * The date part of a NetSuite date or date/time value ('11/15/2026',
     * '11/15/2026 3:04 pm', or ISO), the form daysSince reads; '' when empty.
     * @param {*} value
     * @returns {string}
     */
    const dayToken = (value) => {
        const s = String(value == null ? '' : value).trim();
        if (!s) return '';
        return /^[0-9]{4}-[0-9]{2}-[0-9]{2}/.test(s) ? s.slice(0, 10) : s.split(' ')[0];
    };

    /**
     * The epoch ms of a value's date part (dayToken), or null.
     * @param {*} value
     * @returns {number|null}
     */
    const dayMs = (value) => {
        const token = dayToken(value);
        if (!token) return null;
        const t = Date.parse(token);
        return isNaN(t) ? null : t;
    };

    /**
     * 'YYYY-MM-DD' of a NetSuite date or date/time value, or ''.
     * @param {*} value
     * @returns {string}
     */
    const isoDay = (value) => {
        const t = dayMs(value);
        if (t === null) return '';
        const token = dayToken(value);
        if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(token)) return token;
        const d = new Date(t);
        const p2 = (n) => (n < 10 ? '0' : '') + n;
        return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
    };

    /** '$8,200' (whole units, thousands separators). */
    const money = (n) => {
        const v = Math.round(Number(n) || 0);
        return (v < 0 ? '-$' : '$') + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    };

    /** The first name in a contact's display text ('Abbott Inc. : Pat Lee' → 'Pat'). */
    const firstNameOf = (contactText) => {
        const parts = String(contactText || '').split(' : ');
        const name = parts[parts.length - 1].trim();
        return name ? name.split(/\s+/)[0] : '';
    };

    /**
     * Account context for the dock call screen (DESIGN.md §4 "Account
     * context on the call screen"): the KPI grid (outstanding, last touch,
     * 90-day orders), Recent activity and the pending follow-ups of one
     * entity. Each source is its own search in its own try/catch: a
     * failing source is logged (log.error), named in `errors`, and left
     * out (its numbers stay 0 / null).
     *
     * Sources (7 searches, 10 units each = 70 units):
     *   - outstanding: loadOutstanding (open invoices)
     *   - orders: Sales Orders, entity, mainline, trandate in the last 90
     *     days, newest first (up to 1000): count, total (`amount`), newest 2
     *     as activity
     *   - calls: Phone Calls, company = entity, newest 3
     *   - emails: Messages, `entity` = entity, newest 2 (unproven filter)
     *   - tasks / events: the newest one each, for lastTouchDays only
     *     (same filters as getAccountSnapshot)
     *   - followUps: Pending proposed tasks whose call's company is the
     *     entity, earliest due first (no due last), 3
     * activity: calls + emails + orders, newest first, 4. lastTouchDays:
     * the newest of every source above (days, daysSince).
     *
     * `userId` and `contactId` are accepted for the call shape; no source
     * filters on them.
     * @param {{userId?: (string|number), entityId?: (string|number), contactId?: (string|number),
     *   steps?: Object<string, number>}} params
     * @returns {{
     *   outstanding: {sum: number, count: number, overdueCount: number, oldestDays: (number|null)},
     *   lastTouchDays: (number|null),
     *   orders90: {count: number, total: number},
     *   activity: Array<{kind: string, text: string, at: string, ageDays: (number|null)}>,
     *   followUps: Array<{id: string, title: string, due: (string|null)}>,
     *   errors: Array<string>,
     *   error?: string
     * }}
     */
    const getCallContext = (params) => {
        const p = params || {};
        const entityId = p.entityId ? String(p.entityId) : '';
        const steps = p.steps || null;
        const out = {
            outstanding: { sum: 0, count: 0, overdueCount: 0, oldestDays: null },
            lastTouchDays: null,
            orders90: { count: 0, total: 0 },
            activity: [],
            followUps: [],
            errors: []
        };
        if (!entityId) return Object.assign(out, { error: 'entityId required' });

        /** @type {Array<{kind: string, text: string, ms: number, raw: *}>} */
        const items = [];
        /** @type {Array<number>} */
        const touches = [];
        const touch = (value) => {
            const t = dayMs(value);
            if (t !== null) touches.push(t);
            return t;
        };
        const add = (kind, text, value) => {
            const t = touch(value);
            if (t !== null) items.push({ kind: kind, text: text, ms: t, raw: value });
        };
        const source = (name, fn) => timeStep(steps, name, () => {
            try {
                fn();
            } catch (e) {
                out.errors.push(name);
                log.error({ title: 'CTC getCallContext ' + name + ' failed', details: (e && e.message) || String(e) });
            }
        });
        const text = (r, col) => {
            if (r.getText) {
                const t = r.getText(col);
                if (t) return String(t);
            }
            return extractText(r.getValue(col));
        };

        source('outstanding', () => {
            const o = loadOutstanding(entityId);
            out.outstanding = { sum: o.sum, count: o.count, overdueCount: o.overdueCount, oldestDays: o.oldestDays };
        });

        source('orders', () => {
            const rows = search.create({
                type: search.Type.SALES_ORDER,
                filters: [
                    ['entity', 'anyof', entityId], 'AND',
                    ['mainline', 'is', 'T'], 'AND',
                    ['trandate', 'onorafter', 'daysago90']
                ],
                columns: [
                    { name: 'trandate', sort: search.Sort.DESC },
                    { name: 'internalid', sort: search.Sort.DESC },
                    'tranid', 'amount', 'status'
                ]
            }).run().getRange({ start: 0, end: 1000 });
            out.orders90 = { count: rows.length, total: sumColumn(rows, 'amount') };
            rows.slice(0, 2).forEach((r) => {
                const parts = ['Order ' + String(r.getValue('tranid') || '').trim(), money(r.getValue('amount'))];
                const status = text(r, 'status');
                if (status) parts.push(status);
                add('order', parts.join(' · '), r.getValue('trandate'));
            });
        });

        source('calls', () => {
            search.create({
                type: search.Type.PHONE_CALL,
                filters: [['company', 'anyof', entityId]],
                columns: [
                    { name: 'startdate', sort: search.Sort.DESC },
                    { name: 'createddate', sort: search.Sort.DESC },
                    'title', 'contact', 'company'
                ]
            }).run().getRange({ start: 0, end: 3 }).forEach((r) => {
                const who = firstNameOf(text(r, 'contact')) || text(r, 'company');
                const title = String(r.getValue('title') || '').trim();
                const head = who ? 'Call with ' + who : 'Call';
                add('call', title ? head + ' · ' + title : head, r.getValue('startdate'));
            });
        });

        source('emails', () => {
            search.create({
                type: search.Type.MESSAGE,
                filters: [['entity', 'anyof', entityId]],
                columns: [
                    { name: 'messagedate', sort: search.Sort.DESC },
                    'subject'
                ]
            }).run().getRange({ start: 0, end: 2 }).forEach((r) => {
                const subject = String(r.getValue('subject') || '').trim();
                add('email', subject ? 'Email · ' + subject : 'Email', r.getValue('messagedate'));
            });
        });

        // Tasks and events: the last touch only (not in Recent activity).
        [
            { name: 'tasks', type: search.Type.TASK, filter: 'company', dateCol: 'createddate' },
            { name: 'events', type: search.Type.CALENDAR_EVENT, filter: 'attendee', dateCol: 'startdate' }
        ].forEach((src) => source(src.name, () => {
            const rows = search.create({
                type: src.type,
                filters: [[src.filter, 'anyof', entityId]],
                columns: [{ name: src.dateCol, sort: search.Sort.DESC }]
            }).run().getRange({ start: 0, end: 1 });
            if (rows.length) touch(rows[0].getValue(src.dateCol));
        }));

        source('followUps', () => {
            const rows = search.create({
                type: 'customrecord_ctc_proposed_task',
                filters: [
                    [PT_CALL + '.company', 'anyof', entityId], 'AND',
                    [PT_STATUS, 'is', 'Pending']
                ],
                columns: [
                    { name: 'created', sort: search.Sort.ASC },
                    { name: 'internalid', sort: search.Sort.ASC },
                    'custrecord_ctc_pt_text', 'custrecord_ctc_pt_proposed_due'
                ]
            }).run().getRange({ start: 0, end: CALL_CONTEXT_FOLLOW_UP_READ });
            out.followUps = rows.map((r, i) => {
                const due = isoDay(r.getValue('custrecord_ctc_pt_proposed_due'));
                return { id: String(r.id), title: String(r.getValue('custrecord_ctc_pt_text') || '').trim(), due: due || null, i: i };
            }).sort((a, b) => {
                if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1;
                if (!a.due !== !b.due) return a.due ? -1 : 1;
                return a.i - b.i;
            }).slice(0, CALL_CONTEXT_FOLLOW_UP_MAX).map((f) => ({ id: f.id, title: f.title, due: f.due }));
        });

        out.activity = items
            .map((it, i) => ({ it: it, i: i }))
            .sort((a, b) => (b.it.ms - a.it.ms) || (a.i - b.i))
            .slice(0, CALL_CONTEXT_ACTIVITY_MAX)
            .map(({ it }) => ({ kind: it.kind, text: it.text, at: isoDay(it.raw), ageDays: daysSince(dayToken(it.raw)) }));

        if (touches.length) out.lastTouchDays = daysSince(new Date(Math.max.apply(null, touches)).toISOString());
        return out;
    };

    // ─── Inbound spike — caller match ──────────────────────────────────────

    const personName = (first, last) => (String(first || '') + ' ' + String(last || '')).trim();

    /**
     * Match an inbound caller number to a customer / prospect / lead or a
     * contact. Compares the last 10 digits (fewer when the number is
     * shorter) with non-digits stripped on both sides (REGEXP_REPLACE in
     * SuiteQL). A match in the rep's book (getBookCustomerIds) wins over
     * one outside it; a contact counts as in the book when its company is.
     * A contact with a company returns the company as the entity and the
     * contact as contactName / contactId (same shape logCall takes).
     *
     * Book first: the customer and contact queries run first limited to
     * the book (`c.id IN (…)` / `ct.company IN (…)`, LOOKUP_ID_CHUNK ids
     * per query) and the first book hit returns at once (inBook true).
     * Only on a book miss do the two scans over all customers and all
     * contacts run. Inside each pass, customer-level numbers come before
     * contact numbers. SuiteQL count: 2 on a book customer hit, 3 on a
     * book contact hit, 5 on a miss (empty book: 3); 10 units each.
     *
     * @param {{userId?: string|number, phone?: string, perfSteps?: Object<string, number>}} [params]
     *   perfSteps: optional; gets the ms of each step (RESTlet perf flag)
     * @returns {{match: ({entityId: string, entityType: string, name: string,
     *            contactName: string, contactId: string, inBook: boolean}|null), error?: string}}
     */
    const lookupCallerByPhone = (params) => {
        const p = params || {};
        const raw = String(p.phone || '');
        const digits = raw.replace(/[^0-9]/g, '');
        if (raw.length > 32 || digits.length < 7 || digits.length > 15) {
            return { error: 'invalid_phone', match: null };
        }
        const key = digits.slice(-10);
        const n = key.length; // 7..10, from the checks above: safe to inline
        const tail = (col) => 'SUBSTR(REGEXP_REPLACE(' + col + ", '[^0-9]', ''), -" + n + ')';
        const steps = p.perfSteps || null;

        // `scope` is '' (all records) or an extra AND with id bind marks.
        const customerSql = (scope) =>
            'SELECT c.id AS id, c.companyname AS companyname, c.firstname AS firstname, ' +
            '       c.lastname AS lastname, c.stage AS stage ' +
            'FROM customer c ' +
            "WHERE c.isInactive = 'F' " +
            "  AND c.stage IN ('CUSTOMER', 'PROSPECT', 'LEAD') " +
            '  AND (' + tail('c.phone') + ' = ? OR ' + tail('c.altphone') + ' = ?) ' +
            scope +
            'FETCH FIRST 20 ROWS ONLY';
        const contactSql = (scope) =>
            'SELECT ct.id AS id, ct.firstname AS firstname, ct.lastname AS lastname, ' +
            '       ct.company AS company, c.companyname AS companyname, c.stage AS stage ' +
            'FROM contact ct ' +
            'LEFT JOIN customer c ON c.id = ct.company ' +
            "WHERE ct.isInactive = 'F' " +
            '  AND (' + tail('ct.phone') + ' = ? OR ' + tail('ct.mobilephone') + ' = ? OR ' +
            tail('ct.homephone') + ' = ?) ' +
            scope +
            'FETCH FIRST 20 ROWS ONLY';

        try {
            const bookIds = timeStep(steps, 'book', () => getBookCustomerIds({ userId: p.userId }));
            const book = {};
            bookIds.forEach((id) => { book[String(id)] = true; });

            const customerCandidate = (r) => {
                const id = String(r.id);
                return {
                    entityId: id,
                    entityType: STAGE_TO_WIRE[String(r.stage || '').toUpperCase()] || 'customer',
                    name: r.companyname || personName(r.firstname, r.lastname),
                    contactName: '',
                    contactId: '',
                    inBook: !!book[id]
                };
            };
            const contactCandidate = (r) => {
                const contactName = personName(r.firstname, r.lastname);
                const companyId = r.company ? String(r.company) : '';
                if (companyId && r.stage) {
                    return {
                        entityId: companyId,
                        entityType: STAGE_TO_WIRE[String(r.stage).toUpperCase()] || 'customer',
                        name: r.companyname || contactName,
                        contactName: contactName,
                        contactId: String(r.id),
                        inBook: !!book[companyId]
                    };
                }
                return {
                    entityId: String(r.id),
                    entityType: 'contact',
                    name: contactName,
                    contactName: '',
                    contactId: '',
                    inBook: false
                };
            };

            // First in-book candidate of one query run over the book ids,
            // LOOKUP_ID_CHUNK ids per query, in chunk order.
            const firstBookHit = (sqlFor, col, keyParams, toCandidate) => {
                for (let i = 0; i < bookIds.length; i += LOOKUP_ID_CHUNK) {
                    const chunk = bookIds.slice(i, i + LOOKUP_ID_CHUNK).map(String);
                    const scope = '  AND ' + col + ' IN (' + chunk.map(() => '?').join(', ') + ') ';
                    const hit = query.runSuiteQL({ query: sqlFor(scope), params: keyParams.concat(chunk) })
                        .asMappedResults().map(toCandidate).filter((c) => c.inBook)[0];
                    if (hit) return hit;
                }
                return null;
            };

            const customerKeys = [key, key];
            const contactKeys = [key, key, key];

            if (bookIds.length) {
                const bookHit =
                    timeStep(steps, 'bookCustomers', () => firstBookHit(customerSql, 'c.id', customerKeys, customerCandidate)) ||
                    timeStep(steps, 'bookContacts', () => firstBookHit(contactSql, 'ct.company', contactKeys, contactCandidate));
                if (bookHit) return { match: bookHit };
            }

            // Book miss: scan every customer, then every contact.
            const candidates = [];
            timeStep(steps, 'allCustomers', () => {
                query.runSuiteQL({ query: customerSql(''), params: customerKeys }).asMappedResults()
                    .forEach((r) => { candidates.push(customerCandidate(r)); });
            });
            timeStep(steps, 'allContacts', () => {
                query.runSuiteQL({ query: contactSql(''), params: contactKeys }).asMappedResults()
                    .forEach((r) => { candidates.push(contactCandidate(r)); });
            });

            // Book first (kept as a guard); inside each group the query
            // order holds (customer-level numbers before contact numbers).
            const match = candidates.filter((c) => c.inBook)[0] || candidates[0] || null;
            return { match: match };
        } catch (e) {
            log.error({
                title: 'CTC lookupCallerByPhone Failed',
                details: 'name=' + (e && e.name) + ' message=' + (e && e.message)
            });
            return { error: 'Lookup failed', match: null };
        }
    };


    /**
     * The user's most recent Phone Call to one record, for the dock's
     * "last called" mark on the contact list (RESTlet softphoneContacts).
     * Filters: `assigned` = userId, `company` = entityId, `phone` not empty,
     * `startdate` on or after `daysago<days>`. Newest first (startdate, then
     * createddate), one row. Fields are the ones logCall writes: `contact`,
     * `phone`, `custevent_ctc_call_started` (ISO UTC; '' on older calls).
     * Throws on a search error: the caller decides the fallback.
     * Governance: one search, 10 units.
     *
     * @param {Object} p
     * @param {string|number} p.userId
     * @param {string|number} p.entityId
     * @param {number} [p.days=90]
     * @returns {{contactId: string, number: string, at: string}|null}
     */
    const lastCallForRecord = (p) => {
        const params = /** @type {{userId?: (string|number), entityId?: (string|number), days?: number}} */ (p || {});
        if (!params.userId || !params.entityId) return null;
        const days = Math.max(1, parseInt(String(params.days || ''), 10) || 90);
        const results = search.create({
            type: search.Type.PHONE_CALL,
            filters: [
                ['assigned', 'anyof', String(params.userId)], 'AND',
                ['company', 'anyof', String(params.entityId)], 'AND',
                ['phone', 'isnotempty', ''], 'AND',
                ['startdate', 'onorafter', 'daysago' + days]
            ],
            columns: [
                { name: 'startdate', sort: search.Sort.DESC },
                { name: 'createddate', sort: search.Sort.DESC },
                'contact',
                'phone',
                'custevent_ctc_call_started'
            ]
        }).run().getRange({ start: 0, end: 1 });
        const r = results && results[0];
        if (!r) return null;
        return {
            contactId: extractId(r.getValue('contact')),
            number: String(r.getValue('phone') || ''),
            at: String(r.getValue('custevent_ctc_call_started') || '')
        };
    };

    return {
        extractText,
        loadHistoryRows,
        loadTaskGroups,
        loadFollowUpRows,
        FOLLOW_UP_LIMIT,
        // Asset 29 — dock Recents / Voicemail rows
        pendingFollowUpsByCall,
        dockOutcomeOf,
        addDockOutcomes,
        computeStats,
        // Phase 2 — softphone Search tab
        getSuggestedContacts,
        searchOwnedEntities,
        getBookCounts,
        // Phase 6 — in-call account snapshot
        getAccountSnapshot,
        // Asset 38 — call screen account context
        getCallContext,
        // Reporting Central
        getBookCustomerIds,
        parseTimeOfDay,
        isUnconnected,
        isMissedCall,
        satClass,
        filterCallRows,
        countCalls,
        getRepPhoneNumber,
        // Inbound spike — caller match
        lookupCallerByPhone,
        // Dock contact list — last called
        lastCallForRecord
    };
});
