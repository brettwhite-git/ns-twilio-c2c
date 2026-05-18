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
define(['N/search', 'N/query', 'N/log'], (search, query, log) => {

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

            // Scope to calls where the customer's salesrep is the current user.
            // `assigned` on Phone Call is unreliable (not always set, can point
            // at the logger rather than the account owner). `company.salesrep`
            // is the source of truth for who owns the account.
            // NOTE: widening to `company.salesteam.employee` to include
            // secondary team members returned zero results on sandbox
            // td3061543 — likely a join-name or Team-Selling-feature mismatch.
            // Pending verification of the correct N/search join syntax; for
            // now we stay on the proven primary-salesrep filter.
            const searchFilters = [
                ['company.salesrep', 'anyof', userId],
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
     * @param {Object} opts
     * @param {string|number} opts.userId
     * @param {Array<string>} opts.stages — e.g. ['LEAD','PROSPECT','CUSTOMER']
     * @param {string} [opts.matchQuery] — case-insensitive contains filter
     *                                     against companyname/first/last/phone/email
     * @param {number} opts.limit — capped 1..50
     * @returns {Array<Object>} packed entity rows
     */
    const runBookEntityQuery = (opts) => {
        const userId = parseInt(opts.userId, 10);
        const stages = (opts.stages && opts.stages.length)
            ? opts.stages
            : ['LEAD', 'PROSPECT', 'CUSTOMER'];
        const limit  = Math.min(Math.max(parseInt(opts.limit, 10) || 20, 1), 50);
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

        log.audit({
            title: 'CTC runBookEntityQuery breakdown',
            details:
                'rowCount=' + mapped.length +
                ' | stages=' + JSON.stringify(stageCounts) +
                ' | roles=' + JSON.stringify(roleCounts)
        });
        // Per-row dump — id · companyname · stage · role tag. Trimmed to
        // 50 names so the audit detail doesn't overflow NetSuite's column.
        const rowDump = rows.slice(0, 50).map((r) => {
            const role = (String(r.isprimary) === '1' && String(r.isteammember) === '1') ? 'P+S'
                       : String(r.isprimary)    === '1' ? 'P'
                       : String(r.isteammember) === '1' ? 'S'
                       : '?';
            return r.id + ':' + (r.companyname || '') + ':' + (r.stage || '') + ':' + role;
        }).join(' | ');
        log.audit({ title: 'CTC runBookEntityQuery rows', details: rowDump });

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
     * @param {Object} params
     * @param {string|number} params.userId
     * @returns {{ total: number, customer: number, prospect: number, lead: number }}
     *          or `{ error, total: 0, ... }` on failure.
     */
    const getBookCounts = (params) => {
        try {
            params = params || {};
            const userId = parseInt(params.userId, 10);
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

    const getSuggestedContacts = (params) => {
        try {
            params = params || {};
            const userId = params.userId;
            // Default 30 (up from 20) — Burt's book is 112, so a 30-row
            // most-recent slice gives reps better coverage in the empty-state
            // pre-fill. Hard cap stays at 50.
            const limit = Math.min(parseInt(params.limit, 10) || 30, 50);
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
            const userQuery = String(params.query || '').trim();
            const limit = Math.min(parseInt(params.limit, 10) || 20, 50);
            const typeFilter = String(params.typeFilter || '').toLowerCase();
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
        getBookCounts,
        // Phase 6 — in-call account snapshot
        getAccountSnapshot
    };
});
