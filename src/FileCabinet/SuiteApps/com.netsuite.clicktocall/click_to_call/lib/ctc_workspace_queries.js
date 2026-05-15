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

            // Scope to calls where the customer's salesrep is the current user.
            // `assigned` on Phone Call is unreliable (not always set, can point at the
            // logger rather than the account owner). `company.salesrep` is the source
            // of truth for who owns the account.
            const searchFilters = [
                ['company.salesrep', 'anyof', userId],
                'AND',
                ['custevent_ctc_call_sid', 'isnotempty', '']
            ];

            // Date filter: supports a `dateRange` shortcut for the portlet chips
            // (today, yesterday, thisweek, lastweek, last30days), or explicit
            // dateFrom/dateTo. `todayOnly` is the legacy shortcut kept for back-compat.
            const dateRange = params.dateRange;
            if (dateRange === 'yesterday') {
                searchFilters.push('AND', ['startdate', 'on', 'yesterday']);
            } else if (dateRange === 'thisweek') {
                searchFilters.push('AND', ['startdate', 'within', 'thisweek']);
            } else if (dateRange === 'lastweek') {
                searchFilters.push('AND', ['startdate', 'within', 'lastweek']);
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

            const rows = results.map((r) => ({
                id: r.id,
                date: r.getValue('startdate') || '',
                companyId: extractId(r.getValue('company')),
                companyName: extractText(r.getText ? r.getText('company') : r.getValue('company')),
                contactName: extractText(r.getText ? r.getText('contact') : r.getValue('contact')),
                phone: r.getValue('phone') || '',
                brief: r.getValue('custevent_ctc_ai_brief') || '',
                satisfaction: parseInt(r.getValue('custevent_ctc_satisfaction'), 10) || null,
                duration: parseInt(r.getValue('custevent_ctc_duration'), 10) || 0,
                callStatus: r.getValue('custevent_ctc_call_status') || ''
            }));

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
                // (proposed_task → phone_call → company → salesrep). So first find
                // all phone calls where company.salesrep = user, then filter
                // proposed_tasks where phone_call is in that set.
                const myCallIds = [];
                try {
                    const callResults = search.create({
                        type: search.Type.PHONE_CALL,
                        filters: [['company.salesrep', 'anyof', userId]],
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

    return {
        loadHistoryRows,
        loadTaskGroups,
        computeStats
    };
});
