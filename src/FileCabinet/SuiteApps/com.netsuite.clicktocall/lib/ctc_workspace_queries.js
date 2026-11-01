// @ts-check
/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Shared workspace queries — used by the Portlet (server-side at render time)
 * and by the RESTlet (`getWorkspaceHistory` / `getWorkspaceTasks` actions for
 * the future Workspace Suitelet). Centralizing the search logic here avoids
 * an HTTP roundtrip from the portlet, and keeps row shape consistent across
 * both surfaces.
 */
// eslint-disable-next-line suitescript/no-log-module
define(['N/search', 'N/query', 'N/log', './ctc_time'], (search, query, log, ctcTime) => {

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
     *   countTotal?: boolean
     * }} [params]
     * `missedOnly` keeps only missed calls and voicemails (status 'Missed'
     * OR custevent_ctc_voicemail T). `countTotal` makes `total` the number
     * of matching calls, not only the rows returned (runPaged count, only
     * when the limit may have cut the list).
     * @returns {{rows: Array<Object>, total: number, error?: string}} `{error}` on failure
     */
    const loadHistoryRows = (params) => {
        try {
            const p = params || {};
            const filters = p.filters || {};
            const limit = parseInt(String(p.limit || ''), 10) || 30;
            const userId = p.userId;

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
            const bookCustomerIds = Array.isArray(p.bookCustomerIds)
                ? p.bookCustomerIds
                : getBookCustomerIds({ userId: userId });
            if (!bookCustomerIds.length) {
                // No accessible customers → no rows. Short-circuit; the
                // N/search `anyof` operator rejects empty arrays anyway.
                return { rows: [], total: 0 };
            }
            const searchFilters = [
                ['company', 'anyof', bookCustomerIds],
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
            if (dateRange === 'yesterday') {
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
                ]
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
                    satisfaction: parseInt(r.getValue('custevent_ctc_satisfaction'), 10) || null,
                    duration: duration,
                    callStatus: callStatus,
                    direction: (inbound === true || inbound === 'T') ? 'inbound' : 'outbound',
                    voicemail: voicemail === true || voicemail === 'T',
                    isMissed: false,
                    entityType: ''
                };
            });

            // Stage isn't joinable from phonecall.company (NetSuite rejects
            // {name:'stage', join:'company'} with "An nlobjSearchColumn contains
            // an invalid column"). Do a second-pass batched lookup against
            // customer for unique companyIds. Same pattern loadTaskGroups uses.
            enrichRowsWithEntityType(rows);

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
     * Load proposed_task rows for a user, grouped by source phone call.
     *
     * @param {{
     *   userId?: string|number,
     *   tab?: string,
     *   phoneCallId?: string|number,
     *   limit?: number
     * }} [params]
     * @returns {{groups: Array<{call: Object, tasks: Array<Object>}>, totalTasks: number, error?: string}}
     */
    const loadTaskGroups = (params) => {
        try {
            const p = params || {};
            const tab = p.tab || 'pending';
            const limit = parseInt(String(p.limit || ''), 10) || 50;
            const userId = p.userId;

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
                // Two-step query: NetSuite search doesn't support the 3-hop join
                // (proposed_task → phone_call → company → salesteam). So first
                // resolve the rep's book customer-id set via SuiteQL (primary OR
                // Sales Team member), look up all phone calls on those customers,
                // then filter proposed_tasks where phone_call is in that set.
                const bookCustomerIds = getBookCustomerIds({ userId: userId });
                if (!bookCustomerIds.length) {
                    return { groups: [], totalTasks: 0 };
                }
                const myCallIds = [];
                try {
                    const callResults = search.create({
                        type: search.Type.PHONE_CALL,
                        filters: [['company', 'anyof', bookCustomerIds]],
                        columns: ['internalid']
                    }).run().getRange({ start: 0, end: 1000 });
                    callResults.forEach((r) => myCallIds.push(r.id));
                } catch (e) {
                    log.error({ title: 'CTC loadTaskGroups call lookup failed', details: e.message || e });
                }
                if (!myCallIds.length) {
                    // No accessible calls → no tasks
                    return { groups: [], totalTasks: 0 };
                }
                filterParts.push([['custrecord_ctc_pt_phone_call', 'anyof', myCallIds]]);
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
                    search.createColumn({ name: 'startdate', join: 'custrecord_ctc_pt_phone_call' }),
                    search.createColumn({ name: 'company', join: 'custrecord_ctc_pt_phone_call' })
                ]
            });
            const results = taskSearch.run().getRange({ start: 0, end: limit });
            // totalTasks is every pending task, not only the rows returned.
            // Count only when the limit may have cut the list.
            const totalTasks = results.length < limit ? results.length : taskSearch.runPaged({ pageSize: 1000 }).count;

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
                            satisfaction: parseInt(r.getValue({ name: 'custevent_ctc_satisfaction', join: 'custrecord_ctc_pt_phone_call' }), 10) || null,
                            date: r.getValue({ name: 'startdate', join: 'custrecord_ctc_pt_phone_call' }) || ''
                        },
                        tasks: []
                    };
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
            enrichRowsWithEntityType(groups.map((g) => g.call));

            return { groups: groups, totalTasks: totalTasks };
        } catch (e) {
            log.error({ title: 'CTC loadTaskGroups Failed', details: e.message || e });
            return { error: 'Tasks fetch failed', groups: [], totalTasks: 0 };
        }
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

    // NetSuite search date keyword for the period before each Reporting Central
    // range (only where one compares fairly).
    const REPORT_PREVIOUS_RANGE = { today: 'yesterday', thisweek: 'lastweektodate' };

    /**
     * Satisfaction band for a 1-10 score: 'high' (7+), 'mid' (5-6), 'low'
     * (1-4) or 'none' (unscored). Callers map the band to their CSS class.
     * @param {*} n
     * @returns {'high'|'mid'|'low'|'none'}
     */
    const satClass = (n) => {
        if (typeof n !== 'number' || !n) return 'none';
        if (n >= 7) return 'high';
        if (n >= 5) return 'mid';
        return 'low';
    };

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
     * direction: 'all' | 'outbound' | 'inbound' | 'missed'. 'missed' =
     * isMissedCall; 'outbound' / 'inbound' = the other calls in that
     * direction (an unanswered outbound call is outbound). The three
     * directions split the rows with no overlap.
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
            if ((dir === 'outbound' || dir === 'inbound') &&
                (isMissedCall(r) || (r.direction || 'outbound') !== dir)) return false;
            if (!text) return true;
            const names = (String(r.companyName || '') + ' ' + String(r.contactName || '')).toLowerCase();
            if (names.indexOf(text) !== -1) return true;
            return digits.length >= 3 && String(r.phone || '').replace(/[^0-9]/g, '').indexOf(digits) !== -1;
        });
    };

    /**
     * Headline numbers for a set of calls. Pure: no queries.
     * @param {Array<Object>} rows
     * @returns {{calls: number, connected: number, connectedPct: number|null,
     *   talkSeconds: number, talkMinutes: number, avgTalkSeconds: number|null,
     *   satAvg: number|null, satCount: number}}
     */
    const computeReportKpis = (rows) => {
        const list = rows || [];
        const connected = list.filter((r) => !isUnconnected(r));
        const talkSeconds = connected.reduce((a, r) => a + r.duration, 0);
        const scored = list.filter((r) => typeof r.satisfaction === 'number' && r.satisfaction > 0);
        return {
            calls: list.length,
            connected: connected.length,
            connectedPct: list.length ? Math.round((connected.length / list.length) * 100) : null,
            talkSeconds: talkSeconds,
            talkMinutes: Math.round(talkSeconds / 60),
            avgTalkSeconds: connected.length ? Math.round(talkSeconds / connected.length) : null,
            satAvg: scored.length ? scored.reduce((a, r) => a + r.satisfaction, 0) / scored.length : null,
            satCount: scored.length
        };
    };

    /**
     * Count CTC calls in the rep's book for a NetSuite date keyword (for
     * "vs previous period"). Returns null on failure so callers omit the delta.
     * @param {{userId?: string|number, bookCustomerIds?: Array<string>, dateKeyword: string}} params
     * @returns {number|null}
     */
    const countCalls = (params) => {
        try {
            const p = params || { dateKeyword: '' };
            if (!p.dateKeyword) return null;
            const ids = Array.isArray(p.bookCustomerIds) ? p.bookCustomerIds : getBookCustomerIds({ userId: p.userId });
            if (!ids.length) return 0;
            const op = (p.dateKeyword === 'today' || p.dateKeyword === 'yesterday') ? 'on' : 'within';
            return search.create({
                type: search.Type.PHONE_CALL,
                filters: [
                    ['company', 'anyof', ids], 'AND',
                    ['custevent_ctc_call_sid', 'isnotempty', ''], 'AND',
                    ['startdate', op, p.dateKeyword]
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

        return rows.map(packEntityRowSql);
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
     * Iteration B Phase 6 — single rollup powering the in-call account
     * snapshot card. Four mini-queries against the entity's transactions,
     * opportunities, and activity history; combined into the wire shape
     * the softphone client renders into the 4-tile grid.
     *
     * @param {{entityId?: string|number}} [params]
     * @returns {{
     *   outstanding: { sum: any, count: any, avgAgeDays: any },
     *   openOpps:    { count: any, sum: any },
     *   lastInvoice: { docNumber: any, amount: any, ageDays: any } | null,
     *   lastActivity:{ type: any, ageDays: any, date: any } | null,
     *   error?: string
     * }}
     */
    const getAccountSnapshot = (params) => {
        const p = params || {};
        const entityId = p.entityId;

        const empty = {
            outstanding:  { sum: 0, count: 0, avgAgeDays: null },
            openOpps:     { count: 0, sum: 0 },
            lastInvoice:  null,
            lastActivity: null
        };

        if (!entityId) return Object.assign({}, empty, { error: 'entityId required' });

        try {
            // ── Outstanding invoices: open + partially-paid balances ──
            try {
                const invResults = search.create({
                    type: search.Type.INVOICE,
                    filters: [
                        ['entity', 'anyof', entityId], 'AND',
                        ['mainline', 'is', 'T'], 'AND',
                        ['status', 'anyof', ['CustInvc:A', 'CustInvc:B']] // Open / Partially paid
                    ],
                    columns: [
                        'amountremaining',
                        'trandate'
                    ]
                }).run().getRange({ start: 0, end: 200 });

                empty.outstanding.count = invResults.length;
                empty.outstanding.sum   = sumColumn(invResults, 'amountremaining');
                if (invResults.length) {
                    let ageTotal = 0, ageCount = 0;
                    invResults.forEach((r) => {
                        const d = daysSince(r.getValue('trandate'));
                        if (d !== null) { ageTotal += d; ageCount++; }
                    });
                    empty.outstanding.avgAgeDays = ageCount ? Math.round(ageTotal / ageCount) : null;
                }
            } catch (e) {
                log.error({ title: 'CTC snapshot outstanding failed', details: e.message || e });
            }

            // ── Open opportunities: count + sum projectedtotal ──
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

            // ── Last invoice: most-recent by trandate desc ──
            try {
                const lastInvResults = search.create({
                    type: search.Type.INVOICE,
                    filters: [
                        ['entity', 'anyof', entityId], 'AND',
                        ['mainline', 'is', 'T']
                    ],
                    columns: [
                        { name: 'trandate', sort: search.Sort.DESC },
                        'tranid',
                        'total'
                    ]
                }).run().getRange({ start: 0, end: 1 });

                if (lastInvResults.length) {
                    const r = lastInvResults[0];
                    empty.lastInvoice = {
                        docNumber: r.getValue('tranid') || '',
                        amount:    parseFloat(r.getValue('total')) || 0,
                        ageDays:   daysSince(r.getValue('trandate'))
                    };
                }
            } catch (e) {
                log.error({ title: 'CTC snapshot lastInvoice failed', details: e.message || e });
            }

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
            activitySources.forEach((src) => {
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
            });

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
     * @param {{userId?: string|number, phone?: string}} [params]
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

        try {
            const book = {};
            getBookCustomerIds({ userId: p.userId }).forEach((id) => { book[String(id)] = true; });

            const candidates = [];

            const customerSql =
                'SELECT c.id AS id, c.companyname AS companyname, c.firstname AS firstname, ' +
                '       c.lastname AS lastname, c.stage AS stage ' +
                'FROM customer c ' +
                "WHERE c.isInactive = 'F' " +
                "  AND c.stage IN ('CUSTOMER', 'PROSPECT', 'LEAD') " +
                '  AND (' + tail('c.phone') + ' = ? OR ' + tail('c.altphone') + ' = ?) ' +
                'FETCH FIRST 20 ROWS ONLY';
            query.runSuiteQL({ query: customerSql, params: [key, key] }).asMappedResults().forEach((r) => {
                const id = String(r.id);
                candidates.push({
                    entityId: id,
                    entityType: STAGE_TO_WIRE[String(r.stage || '').toUpperCase()] || 'customer',
                    name: r.companyname || personName(r.firstname, r.lastname),
                    contactName: '',
                    contactId: '',
                    inBook: !!book[id]
                });
            });

            const contactSql =
                'SELECT ct.id AS id, ct.firstname AS firstname, ct.lastname AS lastname, ' +
                '       ct.company AS company, c.companyname AS companyname, c.stage AS stage ' +
                'FROM contact ct ' +
                'LEFT JOIN customer c ON c.id = ct.company ' +
                "WHERE ct.isInactive = 'F' " +
                '  AND (' + tail('ct.phone') + ' = ? OR ' + tail('ct.mobilephone') + ' = ? OR ' +
                tail('ct.homephone') + ' = ?) ' +
                'FETCH FIRST 20 ROWS ONLY';
            query.runSuiteQL({ query: contactSql, params: [key, key, key] }).asMappedResults().forEach((r) => {
                const contactName = personName(r.firstname, r.lastname);
                const companyId = r.company ? String(r.company) : '';
                if (companyId && r.stage) {
                    candidates.push({
                        entityId: companyId,
                        entityType: STAGE_TO_WIRE[String(r.stage).toUpperCase()] || 'customer',
                        name: r.companyname || contactName,
                        contactName: contactName,
                        contactId: String(r.id),
                        inBook: !!book[companyId]
                    });
                } else {
                    candidates.push({
                        entityId: String(r.id),
                        entityType: 'contact',
                        name: contactName,
                        contactName: '',
                        contactId: '',
                        inBook: false
                    });
                }
            });

            // Book first; inside each group the query order holds
            // (customer-level numbers before contact numbers).
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

    return {
        extractText,
        loadHistoryRows,
        loadTaskGroups,
        computeStats,
        // Phase 2 — softphone Search tab
        getSuggestedContacts,
        searchOwnedEntities,
        getBookCounts,
        // Phase 6 — in-call account snapshot
        getAccountSnapshot,
        // Reporting Central
        getBookCustomerIds,
        parseTimeOfDay,
        isUnconnected,
        isMissedCall,
        satClass,
        filterCallRows,
        computeReportKpis,
        countCalls,
        getRepPhoneNumber,
        REPORT_PREVIOUS_RANGE,
        // Inbound spike — caller match
        lookupCallerByPhone
    };
});
