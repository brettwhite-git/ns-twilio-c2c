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
define(['N/search', 'N/log'], (search, log) => {

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
     * Load recent Phone Call rows assigned to a user, with optional filters.
     *
     * @param {Object} params
     * @param {string|number} params.userId
     * @param {Object} [params.filters]
     * @param {string} [params.filters.dateFrom]
     * @param {string} [params.filters.dateTo]
     * @param {number} [params.filters.satMin]
     * @param {string} [params.filters.status]
     * @param {boolean} [params.todayOnly]
     * @param {number} [params.limit=30]
     * @returns {{ rows: Array<Object>, total: number }} — `{ error }` on failure
     */
    const loadHistoryRows = (params) => {
        try {
            params = params || {};
            const filters = params.filters || {};
            const limit = parseInt(params.limit, 10) || 30;
            const userId = params.userId;

            // Scope to calls where the current user is on the customer's Sales
            // Team (primary OR secondary). `assigned` on Phone Call is unreliable
            // (not always set, can point at the logger rather than the account
            // owner). `company.salesteam.employee` covers both the primary
            // salesrep and any secondary team members.
            const searchFilters = [
                ['company.salesteam.employee', 'anyof', userId],
                'AND',
                ['custevent_ctc_call_sid', 'isnotempty', '']
            ];

            // Date filter: supports a `dateRange` shortcut for the portlet chips
            // (today, yesterday, thisweek, lastweek, last7days, last30days), or
            // explicit dateFrom/dateTo. `todayOnly` is the legacy shortcut kept
            // for back-compat. `last7days` was added for the softphone Recents
            // tab (Iteration B Phase 5).
            const dateRange = params.dateRange;
            if (dateRange === 'yesterday') {
                searchFilters.push('AND', ['startdate', 'on', 'yesterday']);
            } else if (dateRange === 'thisweek') {
                searchFilters.push('AND', ['startdate', 'within', 'thisweek']);
            } else if (dateRange === 'lastweek') {
                searchFilters.push('AND', ['startdate', 'within', 'lastweek']);
            } else if (dateRange === 'last7days') {
                searchFilters.push('AND', ['startdate', 'within', 'lastweektodate']);
            } else if (dateRange === 'last30days') {
                searchFilters.push('AND', ['startdate', 'within', 'lastthirtydays']);
            } else if (dateRange === 'today' || params.todayOnly) {
                searchFilters.push('AND', ['startdate', 'on', 'today']);
            } else {
                if (filters.dateFrom) searchFilters.push('AND', ['startdate', 'onorafter', filters.dateFrom]);
                if (filters.dateTo)   searchFilters.push('AND', ['startdate', 'onorbefore', filters.dateTo]);
            }
            if (filters.satMin) searchFilters.push('AND', ['custevent_ctc_satisfaction', 'greaterthanorequalto', filters.satMin]);
            if (filters.status) searchFilters.push('AND', ['custevent_ctc_call_status', 'is', filters.status]);

            const results = search.create({
                type: search.Type.PHONE_CALL,
                filters: searchFilters,
                columns: [
                    { name: 'startdate', sort: search.Sort.DESC },
                    'company',
                    'contact',
                    'phone',
                    'custevent_ctc_ai_brief',
                    'custevent_ctc_satisfaction',
                    'custevent_ctc_duration',
                    'custevent_ctc_call_status'
                ]
            }).run().getRange({ start: 0, end: limit });

            const rows = results.map((r) => {
                const duration = parseInt(r.getValue('custevent_ctc_duration'), 10) || 0;
                const callStatus = r.getValue('custevent_ctc_call_status') || '';
                // Iteration B Phase 5: direction is always 'outbound' for now —
                // CTC is outbound-only per CLAUDE.md / no-inbound-MVP scope. When
                // inbound lands, derive from a Phone Call field (is_outgoing or
                // a new custevent). 'missed' is a UI-only derived state for the
                // Recents tab — inbound + duration === 0 once inbound exists.
                return {
                    id: r.id,
                    date: r.getValue('startdate') || '',
                    companyId: extractId(r.getValue('company')),
                    companyName: extractText(r.getText ? r.getText('company') : r.getValue('company')),
                    contactName: extractText(r.getText ? r.getText('contact') : r.getValue('contact')),
                    phone: r.getValue('phone') || '',
                    brief: r.getValue('custevent_ctc_ai_brief') || '',
                    satisfaction: parseInt(r.getValue('custevent_ctc_satisfaction'), 10) || null,
                    duration: duration,
                    callStatus: callStatus,
                    direction: 'outbound',
                    isMissed: false, // duration === 0 once inbound calls exist
                    entityType: ''
                };
            });

            // Stage isn't joinable from phonecall.company (NetSuite rejects
            // {name:'stage', join:'company'} with "An nlobjSearchColumn contains
            // an invalid column"). Do a second-pass batched lookup against
            // customer for unique companyIds. Same pattern loadTaskGroups uses.
            enrichRowsWithEntityType(rows);

            return { rows: rows, total: rows.length };
        } catch (e) {
            log.error({ title: 'CTC loadHistoryRows Failed', details: e.message || e });
            return { error: 'History fetch failed', rows: [], total: 0 };
        }
    };

    /**
     * Load proposed_task rows for a user, grouped by source phone call.
     *
     * @param {Object} params
     * @param {string|number} params.userId
     * @param {string} [params.tab='pending'] — 'pending' | 'awaiting' | 'completed' | 'rejected' | 'all'
     * @param {string|number} [params.phoneCallId] — optional scope to one call
     * @param {number} [params.limit=50]
     * @returns {{ groups: Array<{ call: Object, tasks: Array<Object> }>, totalTasks: number }}
     */
    const loadTaskGroups = (params) => {
        try {
            params = params || {};
            const tab = params.tab || 'pending';
            const limit = parseInt(params.limit, 10) || 50;
            const userId = params.userId;

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

            if (params.phoneCallId) {
                filterParts.push([['custrecord_ctc_pt_phone_call', 'anyof', params.phoneCallId]]);
            } else {
                // Two-step query: NetSuite search doesn't support the 3-hop join
                // (proposed_task → phone_call → company → salesteam). So first find
                // all phone calls where the user is on company.salesteam (primary
                // or secondary), then filter proposed_tasks where phone_call is in
                // that set.
                const myCallIds = [];
                try {
                    const callResults = search.create({
                        type: search.Type.PHONE_CALL,
                        filters: [['company.salesteam.employee', 'anyof', userId]],
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

            const results = search.create({
                type: 'customrecord_ctc_proposed_task',
                filters: filters,
                columns: [
                    { name: 'created', sort: search.Sort.DESC },
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
            }).run().getRange({ start: 0, end: limit });

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

            const groupsByCallId = {};
            results.forEach((r) => {
                const callValue = r.getValue('custrecord_ctc_pt_phone_call');
                const callId = extractId(callValue) || callValue || '';
                if (!groupsByCallId[callId]) {
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
                    text: r.getValue('custrecord_ctc_pt_text') || '',
                    status: localText('custrecord_ctc_pt_status'),
                    proposedDue: r.getValue('custrecord_ctc_pt_proposed_due') || '',
                    assigneeName: localText('custrecord_ctc_pt_proposed_assignee'),
                    taskCompleted: r.getValue('custrecord_ctc_pt_task_completed') === true ||
                                   r.getValue('custrecord_ctc_pt_task_completed') === 'T',
                    createdTaskId: extractId(r.getValue('custrecord_ctc_pt_created_task'))
                });
            });

            const groups = Object.keys(groupsByCallId).map((k) => groupsByCallId[k]);

            // Second-pass batched stage lookup so each group.call gets a Lead /
            // Prospect / Customer label. NetSuite doesn't support the 3-hop join
            // proposed_task → phone_call → company → stage in a single search.
            enrichRowsWithEntityType(groups.map((g) => g.call));

            return { groups: groups, totalTasks: results.length };
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

    // ─── Iteration B · Phase 2 — softphone Search tab ───────────────────────

    // Map stage codes to lowercase wire names used by the softphone client.
    // search.Type.CUSTOMER covers all three stages; filter by `stage` field.
    const STAGE_TO_WIRE = { LEAD: 'lead', PROSPECT: 'prospect', CUSTOMER: 'customer' };
    const WIRE_TO_STAGE = { lead: 'LEAD', prospect: 'PROSPECT', customer: 'CUSTOMER' };

    /**
     * Pack a Customer search result row into the wire shape the softphone
     * client renders. Phase 2 keeps this minimal — just enough to render a
     * search-result row and arm the Call button.
     */
    const packEntityRow = (r) => {
        const stage = String(r.getValue('stage') || '').toUpperCase();
        const company = r.getValue('companyname') || '';
        const first   = r.getValue('firstname') || '';
        const last    = r.getValue('lastname') || '';
        const contactName = (first || last) ? (first + ' ' + last).trim() : '';
        return {
            id: String(r.id),
            type: STAGE_TO_WIRE[stage] || 'customer',
            companyName: company || contactName || ('Entity ' + r.id),
            contactName: contactName,
            phone: r.getValue('phone') || '',
            email: r.getValue('email') || '',
            lastModified: r.getValue('lastmodifieddate') || ''
        };
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
    const getSuggestedContacts = (params) => {
        try {
            params = params || {};
            const userId = params.userId;
            const limit = Math.min(parseInt(params.limit, 10) || 20, 50);
            if (!userId) {
                return { error: 'userId required', rows: [], total: 0 };
            }
            const results = search.create({
                type: search.Type.CUSTOMER,
                filters: [
                    ['salesteam.employee', 'anyof', userId], 'AND',
                    ['stage', 'anyof', ['LEAD', 'PROSPECT', 'CUSTOMER']], 'AND',
                    ['isinactive', 'is', 'F']
                ],
                columns: [
                    { name: 'lastmodifieddate', sort: search.Sort.DESC },
                    'stage',
                    'companyname',
                    'firstname',
                    'lastname',
                    'phone',
                    'email'
                ]
            }).run().getRange({ start: 0, end: limit });

            const rows = results.map(packEntityRow);
            return { rows: rows, total: rows.length };
        } catch (e) {
            log.error({ title: 'CTC getSuggestedContacts Failed', details: e.message || e });
            return { error: 'Suggested fetch failed', rows: [], total: 0 };
        }
    };

    /**
     * Fuzzy search across the rep's owned book — matches against company
     * name, first name, last name, primary phone, and email. Optional
     * `typeFilter` narrows to a single stage. Returns at most `limit` rows.
     *
     * @param {Object} params
     * @param {string|number} params.userId
     * @param {string} params.query — non-empty user-typed query
     * @param {'customer'|'prospect'|'lead'|''} [params.typeFilter]
     * @param {number} [params.limit=20]
     * @returns {{ rows: Array<Object>, total: number }} — `{ error }` on failure
     */
    const searchOwnedEntities = (params) => {
        try {
            params = params || {};
            const userId = params.userId;
            const query = String(params.query || '').trim();
            const limit = Math.min(parseInt(params.limit, 10) || 20, 50);
            const typeFilter = String(params.typeFilter || '').toLowerCase();
            if (!userId) {
                return { error: 'userId required', rows: [], total: 0 };
            }
            if (!query) {
                return { rows: [], total: 0 };
            }
            // Stage filter: all three by default, narrowed if typeFilter matches.
            const stages = WIRE_TO_STAGE[typeFilter]
                ? [WIRE_TO_STAGE[typeFilter]]
                : ['LEAD', 'PROSPECT', 'CUSTOMER'];

            // OR-group of contains-matches across the five searchable fields.
            // NetSuite filter syntax: nested array becomes its own AND/OR scope.
            const matchGroup = [
                ['companyname', 'contains', query], 'OR',
                ['firstname',   'contains', query], 'OR',
                ['lastname',    'contains', query], 'OR',
                ['phone',       'contains', query], 'OR',
                ['email',       'contains', query]
            ];

            const results = search.create({
                type: search.Type.CUSTOMER,
                filters: [
                    ['salesteam.employee', 'anyof', userId], 'AND',
                    ['stage', 'anyof', stages], 'AND',
                    ['isinactive', 'is', 'F'], 'AND',
                    matchGroup
                ],
                columns: [
                    { name: 'lastmodifieddate', sort: search.Sort.DESC },
                    'stage',
                    'companyname',
                    'firstname',
                    'lastname',
                    'phone',
                    'email'
                ]
            }).run().getRange({ start: 0, end: limit });

            const rows = results.map(packEntityRow);
            return { rows: rows, total: rows.length };
        } catch (e) {
            log.error({ title: 'CTC searchOwnedEntities Failed', details: e.message || e });
            return { error: 'Search failed', rows: [], total: 0 };
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
     * @param {Object} params
     * @param {string|number} params.entityId
     * @returns {{
     *   outstanding: { sum, count, avgAgeDays },
     *   openOpps:    { count, sum },
     *   lastInvoice: { docNumber, amount, ageDays } | null,
     *   lastActivity:{ type, ageDays, date } | null,
     *   error?: string
     * }}
     */
    const getAccountSnapshot = (params) => {
        params = params || {};
        const entityId = params.entityId;
        if (!entityId) return { error: 'entityId required' };

        const empty = {
            outstanding:  { sum: 0, count: 0, avgAgeDays: null },
            openOpps:     { count: 0, sum: 0 },
            lastInvoice:  null,
            lastActivity: null
        };

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
            // Phone Call records reference the customer via `company`. Tasks and
            // CalendarEvents use `company` too. Search all three types in parallel
            // and pick the latest.
            try {
                const phoneCalls = search.create({
                    type: search.Type.PHONE_CALL,
                    filters: [['company', 'anyof', entityId]],
                    columns: [{ name: 'startdate', sort: search.Sort.DESC }]
                }).run().getRange({ start: 0, end: 1 });

                const tasks = search.create({
                    type: search.Type.TASK,
                    filters: [['company', 'anyof', entityId]],
                    columns: [{ name: 'createddate', sort: search.Sort.DESC }]
                }).run().getRange({ start: 0, end: 1 });

                const events = search.create({
                    type: search.Type.CALENDAR_EVENT,
                    filters: [['company', 'anyof', entityId]],
                    columns: [{ name: 'startdate', sort: search.Sort.DESC }]
                }).run().getRange({ start: 0, end: 1 });

                const candidates = [];
                if (phoneCalls.length) candidates.push({ type: 'Phone call', date: phoneCalls[0].getValue('startdate') });
                if (tasks.length)      candidates.push({ type: 'Task',       date: tasks[0].getValue('createddate') });
                if (events.length)     candidates.push({ type: 'Event',      date: events[0].getValue('startdate') });

                if (candidates.length) {
                    candidates.sort((a, b) => Date.parse(b.date || 0) - Date.parse(a.date || 0));
                    const winner = candidates[0];
                    empty.lastActivity = {
                        type:    winner.type,
                        date:    winner.date,
                        ageDays: daysSince(winner.date)
                    };
                }
            } catch (e) {
                log.error({ title: 'CTC snapshot lastActivity failed', details: e.message || e });
            }

            return empty;
        } catch (e) {
            log.error({ title: 'CTC getAccountSnapshot failed', details: e.message || e });
            return Object.assign({ error: 'Snapshot fetch failed' }, empty);
        }
    };

    return {
        loadHistoryRows,
        loadTaskGroups,
        computeStats,
        // Phase 2 — softphone Search tab
        getSuggestedContacts,
        searchOwnedEntities,
        // Phase 6 — in-call account snapshot
        getAccountSnapshot
    };
});
