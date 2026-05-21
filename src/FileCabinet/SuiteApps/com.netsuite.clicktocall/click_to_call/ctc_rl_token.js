/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @NModuleScope SameAccount
 *
 * Generates Twilio Access Tokens for the Voice SDK, logs calls,
 * and checks transcript readiness for near-real-time enrichment.
 * Called by the Suitelet softphone UI via same-origin request.
 */
// eslint-disable-next-line suitescript/no-log-module
define(['N/search', 'N/runtime', 'N/log', 'N/record', 'N/https', 'N/encode', 'N/llm', './lib/ctc_twilio_jwt', './lib/ctc_transcript_utils', './lib/ctc_config', './lib/ctc_twilio_admin', './lib/ctc_workspace_queries', './lib/ctc_entity'], (search, runtime, log, record, https, encode, llm, twilioJwt, utils, ctcConfig, twilioAdmin, workspaceQueries, ctcEntity) => {

    const loadConfig = ctcConfig.loadConfig;
    // Phase 2 U10: Auth Token removed. All Twilio Basic Auth uses the API Key
    // SecureString path — buildSecureAuthHeader(cfg) returns a SecureString
    // built from `apiKeySid + ':{' + apiSecretId + '}'`. The secret VALUE
    // never enters script scope; NetSuite's HTTP runtime expands the
    // {custsecret_*} placeholder at the socket write boundary.
    const buildSecureAuthHeader = twilioAdmin.buildSecureAuthHeader;

    const lookupContactCompany = (contactId) => {
        try {
            const result = search.lookupFields({
                type: search.Type.CONTACT,
                id: contactId,
                columns: ['company']
            });
            const company = result && result.company;
            if (Array.isArray(company) && company.length && company[0].value) {
                return company[0].value;
            }
            return '';
        } catch (e) {
            log.error({ title: 'CTC Contact Parent Lookup Failed', details: e.message || e });
            return '';
        }
    };

    /**
     * POST handler — routes to token generation, call logging, transcript check,
     * entity search, workspace data fetches, or proposed-task review actions.
     * @param {Object} requestBody
     * @returns {Object}
     */
    const post = (requestBody) => {
        const body = requestBody || {};

        if (body.action === 'logCall')              return logCall(body);
        if (body.action === 'checkTranscript')      return checkTranscript(body);
        if (body.action === 'searchEntities')       return searchEntities(body);
        if (body.action === 'getWorkspaceHistory')  return getWorkspaceHistory(body);
        if (body.action === 'getWorkspaceTasks')    return getWorkspaceTasks(body);
        if (body.action === 'softphoneSuggested')   return softphoneSuggested(body);
        if (body.action === 'softphoneSearch')      return softphoneSearch(body);
        if (body.action === 'softphoneContacts')    return softphoneContacts(body);
        if (body.action === 'softphoneRecents')     return softphoneRecents(body);
        if (body.action === 'softphoneAccountSnapshot') return softphoneAccountSnapshot(body);
        if (body.action === 'softphoneBookCounts')  return softphoneBookCounts(body);
        if (body.action === 'approveProposedTask')  return approveProposedTask(body);
        if (body.action === 'bulkApproveProposedTasks') return bulkApproveProposedTasks(body);
        if (body.action === 'rejectProposedTask')   return rejectProposedTask(body);

        return generateToken(body);
    };

    /**
     * Generate a Twilio Access Token.
     * @param {Object} body
     * @returns {Object} { token, phoneNumber } or { error }
     */
    const generateToken = (body) => {
        try {
            const config = loadConfig();
            const identity = body.employeeId
                ? String(body.employeeId)
                : String(runtime.getCurrentUser().id);

            const token = twilioJwt.generateAccessToken({
                accountSid:  config.accountSid,
                apiKeySid:   config.apiKeySid,
                apiSecretId: config.apiSecretId,
                twimlAppSid: config.twimlAppSid,
                identity:    identity
            });

            return { token: token, phoneNumber: config.phoneNumber };
        } catch (e) {
            log.error({ title: 'CTC Token Generation Failed', details: e.message || e });
            return { error: 'Token generation failed' };
        }
    };

    // Minimum call duration (seconds) before we create a Phone Call record.
    // Twilio Voice Intelligence won't transcribe recordings under 2 seconds, so logging
    // sub-2s calls produces empty activity records. Server-side defense-in-depth — the
    // softphone client enforces a higher 3s threshold for UX.
    const MIN_LOG_DURATION_SECONDS = 2;

    /**
     * Look up an existing Phone Call by Twilio Call SID to support idempotent logCall.
     * sendBeacon on popup unload can race with the in-flight fetch; this prevents duplicates.
     */
    const findCallByCallSid = (callSid) => {
        const results = search.create({
            type: search.Type.PHONE_CALL,
            filters: [['custevent_ctc_call_sid', 'is', callSid]],
            columns: ['internalid']
        }).run().getRange({ start: 0, end: 1 });
        return results.length ? results[0].id : null;
    };

    /**
     * Create a Phone Call record immediately after call ends.
     * @param {Object} body
     * @returns {Object} { success, recordId, duplicate? } or { error }
     */
    const logCall = (body) => {
        try {
            const duration = parseInt(body.duration, 10) || 0;
            if (duration < MIN_LOG_DURATION_SECONDS) {
                return { error: 'duration_below_threshold', duration: duration };
            }

            if (body.callSid) {
                const existingId = findCallByCallSid(body.callSid);
                if (existingId) {
                    return { success: true, recordId: existingId, duplicate: true };
                }
            }

            const phoneCall = record.create({ type: record.Type.PHONE_CALL, isDynamic: true });

            phoneCall.setValue({ fieldId: 'title', value: 'Call to ' + (body.phone || 'unknown') });
            phoneCall.setValue({ fieldId: 'status', value: 'COMPLETE' });
            phoneCall.setValue({ fieldId: 'phone', value: body.phone || '' });
            phoneCall.setValue({ fieldId: 'custevent_ctc_call_sid', value: body.callSid || '' });
            phoneCall.setValue({ fieldId: 'custevent_ctc_duration', value: duration });
            phoneCall.setValue({ fieldId: 'custevent_ctc_processed', value: false });
            phoneCall.setValue({ fieldId: 'custevent_ctc_call_status', value: utils.CALL_STATUS.LOGGED });

            // Numeric-id guard: Phone Call's `company` and `contact` fields
            // require numeric record IDs. NetSuite sometimes injects sentinel
            // strings into Customer/Contact record DOM (e.g. `__company_main__`
            // for the "main contact" placeholder). The softphone scraping the
            // DOM can capture these. Reject anything non-numeric so we save
            // the call instead of failing the whole log.
            const numericId = (v) => {
                const n = parseInt(v, 10);
                return (isFinite(n) && n > 0 && String(n) === String(v).trim()) ? n : null;
            };

            if (body.entityType === 'contact') {
                const contactNumeric = numericId(body.entityId);
                if (contactNumeric) {
                    phoneCall.setValue({ fieldId: 'contact', value: contactNumeric });
                    const parentCompany = lookupContactCompany(contactNumeric);
                    if (parentCompany) {
                        phoneCall.setValue({ fieldId: 'company', value: parentCompany });
                    }
                }
            } else {
                const companyNumeric = numericId(body.entityId);
                if (companyNumeric) {
                    phoneCall.setValue({ fieldId: 'company', value: companyNumeric });
                }
                const contactNumeric = numericId(body.contactId);
                if (contactNumeric) {
                    phoneCall.setValue({ fieldId: 'contact', value: contactNumeric });
                }
            }

            const recordId = phoneCall.save();
            return { success: true, recordId: recordId };
        } catch (e) {
            log.error({ title: 'CTC Log Call Failed', details: e.message || e });
            return { error: 'Failed to log call' };
        }
    };

    /**
     * Update only the status fields on a Phone Call record. Used to mark Processing
     * mid-flight or terminal states without overwriting the rest of the record.
     */
    const markCallStatus = (recordId, status, processed) => {
        try {
            const updates = { custevent_ctc_call_status: status };
            if (typeof processed === 'boolean') {
                updates.custevent_ctc_processed = processed;
            }
            record.submitFields({
                type: record.Type.PHONE_CALL,
                id: recordId,
                values: updates,
                options: { enableSourcing: false, ignoreMandatoryFields: true }
            });
        } catch (e) {
            log.error({ title: 'CTC Mark Status Failed', details: `${recordId}: ${e.message || e}` });
        }
    };

    /**
     * Check if a transcript is ready for a given call, and if so, enrich the Phone Call record.
     * @param {Object} body
     * @param {string} body.callSid - Twilio Call SID
     * @param {string} body.recordId - NetSuite Phone Call internal ID
     * @returns {Object} { status: 'completed'|'pending'|'no_recording' } or { error }
     */
    const checkTranscript = (body) => {
        try {
            const config = loadConfig();
            const authHeader = buildSecureAuthHeader(config);

            const recording = utils.fetchRecordingForCall(config.accountSid, body.callSid, authHeader);
            if (!recording) {
                return { status: 'no_recording' };
            }

            if (utils.isRecordingTerminal(recording)) {
                if (body.recordId) markCallStatus(body.recordId, utils.CALL_STATUS.NO_TRANSCRIPT, true);
                return { status: 'terminal', reason: 'recording_' + recording.status };
            }

            const transcript = utils.fetchTranscript(recording.sid, authHeader);
            if (!transcript) {
                if (body.recordId) markCallStatus(body.recordId, utils.CALL_STATUS.PROCESSING, false);
                return { status: 'pending' };
            }

            if (utils.isTranscriptTerminal(transcript)) {
                if (body.recordId) markCallStatus(body.recordId, utils.CALL_STATUS.NO_TRANSCRIPT, true);
                return { status: 'terminal', reason: 'transcript_' + transcript.status };
            }

            if (!utils.isTranscriptComplete(transcript)) {
                if (body.recordId) markCallStatus(body.recordId, utils.CALL_STATUS.PROCESSING, false);
                return { status: 'pending' };
            }

            const sentences = utils.fetchSentences(transcript.sid, authHeader);
            const transcriptText = utils.formatTranscript(sentences);

            let analysis = {
                summary: '',
                satisfaction_score: 5,
                tone_keywords: [],
                action_items: []
            };

            const hasLlmQuota = llm.getRemainingFreeUsage() >= 10;
            if (hasLlmQuota && transcriptText) {
                analysis = utils.analyzeTranscript(transcriptText);
            }

            const phoneCall = record.load({ type: record.Type.PHONE_CALL, id: body.recordId, isDynamic: true });
            utils.writePhoneCallEnrichmentFields(phoneCall, {
                recording: recording,
                accountSid: config.accountSid,
                transcriptText: transcriptText,
                analysis: analysis,
                includeBrief: true,
                includeDuration: false
            });
            phoneCall.save();

            utils.deleteRecording(config.accountSid, recording.sid, authHeader);

            return { status: 'completed' };
        } catch (e) {
            log.error({ title: 'CTC Check Transcript Failed', details: e.message || e });
            return { error: 'Transcript check failed' };
        }
    };

    // ─────────────────────────────────────────────────────────────────────────────
    // Phase 2 — Workspace data + entity search + proposed-task review actions
    // ─────────────────────────────────────────────────────────────────────────────

    const ENTITY_SEARCH_MAX_PER_TYPE = 8;

    /**
     * searchEntities — typeahead lookup across Customer / Contact / Lead / Prospect.
     * Used by the dashboard-mode softphone (no preset entityId) to let the rep
     * type a name and pick a target before dialing.
     * @param {Object} body
     * @param {string} body.q - search term (min 2 chars)
     * @returns {Object} { results: [{ id, name, type, phone }] } or { error }
     */
    const searchEntities = (body) => {
        try {
            const q = String(body.q || '').trim();
            if (q.length < 2) return { results: [] };

            const out = [];

            // Customer + Prospect — companyname or entityid or phone
            ['customer', 'prospect'].forEach((type) => {
                try {
                    const res = search.create({
                        type: type,
                        filters: [[
                            ['companyname', 'contains', q], 'OR',
                            ['entityid',    'contains', q], 'OR',
                            ['phone',       'contains', q]
                        ]],
                        columns: ['entityid', 'companyname', 'phone']
                    }).run().getRange({ start: 0, end: ENTITY_SEARCH_MAX_PER_TYPE });

                    res.forEach((r) => {
                        out.push({
                            id: r.id,
                            name: r.getValue('companyname') || r.getValue('entityid') || '',
                            type: type,
                            phone: r.getValue('phone') || ''
                        });
                    });
                } catch (e) {
                    log.error({ title: `CTC searchEntities ${type} failed`, details: e.message || e });
                }
            });

            // Contact — firstname/lastname or entityid or phone
            try {
                const res = search.create({
                    type: search.Type.CONTACT,
                    filters: [[
                        ['firstname', 'contains', q], 'OR',
                        ['lastname',  'contains', q], 'OR',
                        ['entityid',  'contains', q], 'OR',
                        ['phone',     'contains', q]
                    ]],
                    columns: ['firstname', 'lastname', 'entityid', 'phone', 'company']
                }).run().getRange({ start: 0, end: ENTITY_SEARCH_MAX_PER_TYPE });

                res.forEach((r) => {
                    const fn = r.getValue('firstname') || '';
                    const ln = r.getValue('lastname') || '';
                    const fullName = (fn + ' ' + ln).trim() || r.getValue('entityid') || '';
                    out.push({
                        id: r.id,
                        name: fullName,
                        type: 'contact',
                        phone: r.getValue('phone') || ''
                    });
                });
            } catch (e) {
                log.error({ title: 'CTC searchEntities contact failed', details: e.message || e });
            }

            // Lead — companyname or entityid or phone
            try {
                const res = search.create({
                    type: search.Type.LEAD,
                    filters: [[
                        ['companyname', 'contains', q], 'OR',
                        ['entityid',    'contains', q], 'OR',
                        ['phone',       'contains', q]
                    ]],
                    columns: ['entityid', 'companyname', 'phone']
                }).run().getRange({ start: 0, end: ENTITY_SEARCH_MAX_PER_TYPE });

                res.forEach((r) => {
                    out.push({
                        id: r.id,
                        name: r.getValue('companyname') || r.getValue('entityid') || '',
                        type: 'lead',
                        phone: r.getValue('phone') || ''
                    });
                });
            } catch (e) {
                log.error({ title: 'CTC searchEntities lead failed', details: e.message || e });
            }

            // Entries with no phone aren't dialable — filter them
            return { results: out.filter((row) => row.phone) };
        } catch (e) {
            log.error({ title: 'CTC searchEntities Failed', details: e.message || e });
            return { error: 'Entity search failed' };
        }
    };

    /**
     * getWorkspaceHistory — fetch the current user's recent CTC-tracked Phone Calls.
     * Used by the Workspace Call History tab AND the Portlet Today's Calls tab
     * (with limit=10 + same-day filter applied client-side or via params).
     *
     * @param {Object} body
     * @param {Object} [body.filters]
     * @param {string} [body.filters.dateFrom]    - YYYY-MM-DD inclusive
     * @param {string} [body.filters.dateTo]      - YYYY-MM-DD inclusive
     * @param {number} [body.filters.satMin]      - min satisfaction score
     * @param {string} [body.filters.status]      - call status filter (e.g. 'Transcribed')
     * @param {boolean} [body.todayOnly]          - shortcut: filter to today only
     * @param {number} [body.limit=30]            - max rows to return
     * @returns {Object} { rows: [...], total } or { error }
     */
    const getWorkspaceHistory = (body) => {
        return workspaceQueries.loadHistoryRows({
            userId: runtime.getCurrentUser().id,
            filters: body.filters,
            todayOnly: !!body.todayOnly,
            dateRange: body.dateRange,
            limit: body.limit
        });
    };

    /**
     * getWorkspaceTasks — fetch proposed_task rows for the current user, grouped by source call.
     * Used by the Workspace AI Tasks tab AND the Portlet Pending Tasks tab.
     *
     * @param {Object} body
     * @param {string} [body.tab='pending']   - 'pending' | 'awaiting' | 'completed' | 'rejected' | 'all'
     * @param {string} [body.phoneCallId]     - optional scope to a single source call
     * @param {number} [body.limit=50]
     * @returns {Object} { groups: [{ call, tasks: [...] }], totalTasks } or { error }
     */
    const getWorkspaceTasks = (body) => {
        return workspaceQueries.loadTaskGroups({
            userId: runtime.getCurrentUser().id,
            tab: body.tab,
            phoneCallId: body.phoneCallId,
            limit: body.limit
        });
    };

    /**
     * softphoneSuggested — Iteration B Phase 2.
     * Returns the current user's top owned Customer / Prospect / Lead
     * entities for the softphone Search tab's empty "Suggested · your book"
     * state. Capped at 20 by default to keep the local prefix-match fast.
     *
     * @param {Object} body
     * @param {number} [body.limit=20]
     * @returns {Object} { rows: [...], total } or { error }
     */
    const softphoneSuggested = (body) => {
        return workspaceQueries.getSuggestedContacts({
            userId: runtime.getCurrentUser().id,
            limit: body.limit
        });
    };

    /**
     * softphoneSearch — Iteration B Phase 2.
     * Fuzzy match across the rep's owned book — name / company / phone /
     * email. Called as a debounced fallback when the client-side prefix
     * match on the suggested list returns fewer than ~3 results.
     *
     * @param {Object} body
     * @param {string} body.query
     * @param {'customer'|'prospect'|'lead'|''} [body.typeFilter]
     * @param {number} [body.limit=20]
     * @returns {Object} { rows: [...], total } or { error }
     */
    const softphoneSearch = (body) => {
        return workspaceQueries.searchOwnedEntities({
            userId: runtime.getCurrentUser().id,
            query: body.query,
            typeFilter: body.typeFilter,
            limit: body.limit
        });
    };

    /**
     * softphoneBookCounts — Iter B Phase 6 refinements.
     * Returns the rep's TRUE book size + per-stage breakdown so the Search
     * tab's chip badges show real totals ("My book 112 · Customer 95 ·
     * Prospect 4 · Lead 13") instead of the displayed-slice counts. Decouples
     * the row-fetch (capped at 20 for the Suggested list) from the chip
     * counts (the whole book).
     *
     * @returns {Object} { total, customer, prospect, lead } or { error, ... }
     */
    const softphoneBookCounts = () => {
        return workspaceQueries.getBookCounts({
            userId: runtime.getCurrentUser().id
        });
    };

    /**
     * softphoneContacts — Iteration B Phase 3.
     * Returns every contact at an entity with all phones each contact has on
     * file. The softphone uses this to hydrate the multi-contact picker when
     * the user selects an entity from the Search tab.
     *
     * @param {Object} body
     * @param {string|number} body.entityId
     * @returns {Object} { rows: [...] } or { error }
     */
    const softphoneContacts = (body) => {
        const entityId = body.entityId;
        if (!entityId) return { error: 'entityId required', rows: [] };

        const contacts = ctcEntity.getContactsAtEntity(entityId);

        // Mirror the Suitelet's record-launch behavior: when the entity
        // has a record-level phone (company switchboard / customer main
        // line), prepend a synthetic "Company main" entry so reps can
        // reach the switchboard from this picker too. Without this, the
        // dashboard → search → select-Customer path was missing the
        // main line that the direct-toolbar-launch path showed.
        try {
            const entityType = resolveEntityType(entityId);
            if (entityType === 'customer' || entityType === 'lead' || entityType === 'prospect') {
                const r = search.lookupFields({
                    type: search.Type.CUSTOMER,
                    id: entityId,
                    columns: ['phone', 'companyname', 'entityid']
                });
                const phone = r.phone || '';
                const name = r.companyname || r.entityid || '';
                if (phone && name) {
                    contacts.forEach((c) => {
                        (c.phones || []).forEach((p) => { p.isPrimary = false; });
                    });
                    contacts.unshift({
                        contactId: '__company_main__',
                        name: name + ' (main line)',
                        title: 'Company switchboard',
                        email: '',
                        phones: [{ number: phone, type: 'Main', isPrimary: true }]
                    });
                }
            }
        } catch (e) {
            log.error({ title: 'CTC softphoneContacts main-line lookup failed',
                        details: e.message || String(e) });
            // Fall through with just the contacts.
        }

        return { rows: contacts };
    };

    /**
     * Best-effort entity-type resolver for softphoneContacts. Tries the
     * top three entity types — customer record covers lead/prospect/
     * customer (all share the entity stage). Returns null if not found.
     */
    const resolveEntityType = (entityId) => {
        try {
            search.lookupFields({
                type: search.Type.CUSTOMER,
                id: entityId,
                columns: ['internalid']
            });
            return 'customer';
        } catch (e) { /* not a customer */ }
        return null;
    };

    /**
     * softphoneRecents — Iteration B Phase 5.
     * Returns the current rep's recent Phone Calls for the Recents tab AND
     * the last-3-dialed shortcut on the empty Dial home. Reuses
     * workspaceQueries.loadHistoryRows with a last-7-days default; client-side
     * direction filter chips (All / Missed / Outbound / Inbound) filter the
     * returned rows in the popup.
     *
     * @param {Object} body
     * @param {string} [body.dateRange='last7days'] — last7days | today | last30days
     * @param {number} [body.limit=50]
     * @returns {Object} { rows: [...], total } or { error }
     */
    const softphoneRecents = (body) => {
        return workspaceQueries.loadHistoryRows({
            userId: runtime.getCurrentUser().id,
            dateRange: body.dateRange || 'last7days',
            limit: body.limit || 50
        });
    };

    /**
     * softphoneAccountSnapshot — Iteration B Phase 6.
     * Returns the 4-tile rollup (outstanding / open opps / last invoice /
     * last activity) for an entity. Fetched once when a call connects in
     * the softphone popup; cached in popup scope for the call lifetime.
     *
     * @param {Object} body
     * @param {string|number} body.entityId
     * @returns {Object} {outstanding, openOpps, lastInvoice, lastActivity} or {error}
     */
    const softphoneAccountSnapshot = (body) => {
        if (!body.entityId) return { error: 'entityId required' };
        return workspaceQueries.getAccountSnapshot({ entityId: body.entityId });
    };

    /**
     * approveProposedTask — materialize a proposed_task as a native NetSuite Task,
     * then mark the proposed_task as Approved with audit trail.
     *
     * @param {Object} body
     * @param {string} body.taskId           - proposed_task internal ID
     * @param {Object} [body.edits]          - optional rep edits before approval
     * @param {string} [body.edits.text]
     * @param {string} [body.edits.due]      - YYYY-MM-DD
     * @param {string} [body.edits.assignee] - employee internal ID
     * @returns {Object} { ok: true, nativeTaskId } or { error }
     */
    /**
     * Parse YYYY-MM-DD into a local-tz Date (avoids `new Date('2026-05-16')` parsing as UTC
     * midnight, which shifts the date back one day in negative-offset timezones).
     */
    const parseDateLocal = (str) => {
        if (!str) return null;
        const s = String(str).trim();
        if (!s) return null;
        const m = s.match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})/);
        if (m) return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
    };

    /**
     * Verify the current user is the salesrep on the customer of the source phone call,
     * or is an admin. Returns true when authorized, false otherwise.
     *
     * Uses the customer.salesrep ownership model to MATCH the filter semantics in
     * lib/ctc_workspace_queries.js (rep sees calls/tasks where customer.salesrep = me).
     * Previously checked phonecall.assigned, which was inconsistent with the filter —
     * the rep could see a task but not approve it.
     */
    /**
     * Look up the salesrep on the customer of the source phone call.
     * Returns the salesrep's internal ID (string) or '' if not resolvable.
     * Shared by isAuthorizedForProposedTask + approveProposedTask so the
     * "my calls = me" filter semantics match the assignee on the materialized Task.
     */
    const getCustomerSalesRepForCall = (sourceCallId) => {
        if (!sourceCallId) return '';
        try {
            const callLookup = search.lookupFields({
                type: search.Type.PHONE_CALL,
                id: sourceCallId,
                columns: ['company']
            });
            const companyArr = callLookup && callLookup.company;
            if (!Array.isArray(companyArr) || !companyArr.length || !companyArr[0].value) {
                return '';
            }
            const companyLookup = search.lookupFields({
                type: search.Type.CUSTOMER,
                id: companyArr[0].value,
                columns: ['salesrep']
            });
            const srepArr = companyLookup && companyLookup.salesrep;
            if (Array.isArray(srepArr) && srepArr.length && srepArr[0].value) {
                return String(srepArr[0].value);
            }
        } catch (e) {
            log.error({ title: 'CTC salesrep lookup failed', details: e.message || e });
        }
        return '';
    };

    const isAuthorizedForProposedTask = (sourceCallId, userId) => {
        // Admin role ID in NetSuite is 3
        try {
            const roleId = String(runtime.getCurrentUser().role);
            if (roleId === '3') return true;
        } catch (e) {
            // continue with salesrep check
        }
        const srepId = getCustomerSalesRepForCall(sourceCallId);
        return srepId !== '' && srepId === String(userId);
    };

    const approveProposedTask = (body) => {
        try {
            if (!body.taskId) return { error: 'taskId required' };
            const userId = runtime.getCurrentUser().id;

            const pt = record.load({
                type: 'customrecord_ctc_proposed_task',
                id: body.taskId,
                isDynamic: false
            });

            // Idempotency: only Pending tasks can be approved. Re-clicks (stale UI,
            // double-submit) must not create duplicate native Tasks.
            const currentStatusText = pt.getText
                ? pt.getText({ fieldId: 'custrecord_ctc_pt_status' })
                : '';
            if (currentStatusText && currentStatusText !== 'Pending') {
                return { error: 'already_actioned', currentStatus: currentStatusText };
            }

            // Belt-and-suspenders idempotency: if a native Task was already linked
            // (e.g., status save failed previously leaving created_task populated),
            // return the existing Task ID without creating another. Prevents the
            // duplicate-Task explosion that motivated this fix.
            const existingTaskId = pt.getValue({ fieldId: 'custrecord_ctc_pt_created_task' });
            if (existingTaskId) {
                return { ok: true, nativeTaskId: existingTaskId, idempotent: true };
            }

            const sourceCallId = pt.getValue({ fieldId: 'custrecord_ctc_pt_phone_call' });

            // Authorization: only the rep assigned to the source call (or admin) can approve.
            if (!isAuthorizedForProposedTask(sourceCallId, userId)) {
                return { error: 'forbidden' };
            }

            // Apply edits if any (mutate proposed_task so audit trail captures the text the rep approved)
            const edits = body.edits || {};
            const editsText = (edits.text != null && String(edits.text).trim()) || '';
            const editsDue = parseDateLocal(edits.due);
            const editsAssignee = (edits.assignee != null && String(edits.assignee).trim()) || '';

            const finalText = editsText || pt.getValue({ fieldId: 'custrecord_ctc_pt_text' });
            const finalDueValue = editsDue || pt.getValue({ fieldId: 'custrecord_ctc_pt_proposed_due' });
            // Assignee priority:
            //   1. Explicit edit from the rep (future inline-edit UI)
            //   2. The customer's salesrep — same source of truth as the "my tasks = me" filter
            //   3. The current user (fallback for orphan calls with no company / no salesrep)
            // We intentionally ignore the LLM-suggested `custrecord_ctc_pt_proposed_assignee`:
            // it's a free-text name guess and was producing wrong assignments (e.g. Kathryn Glass
            // instead of the customer's actual salesrep).
            const customerSalesRepId = getCustomerSalesRepForCall(sourceCallId);
            const finalAssignee = editsAssignee || customerSalesRepId || userId;

            if (editsText)     pt.setValue({ fieldId: 'custrecord_ctc_pt_text', value: finalText });
            if (editsDue)      pt.setValue({ fieldId: 'custrecord_ctc_pt_proposed_due', value: finalDueValue });
            if (editsAssignee) pt.setValue({ fieldId: 'custrecord_ctc_pt_proposed_assignee', value: finalAssignee });

            // Look up source call's company + contact for the Task's entity links
            let sourceCompany = '';
            let sourceContact = '';
            if (sourceCallId) {
                try {
                    const callLookup = search.lookupFields({
                        type: search.Type.PHONE_CALL,
                        id: sourceCallId,
                        columns: ['company', 'contact']
                    });
                    if (Array.isArray(callLookup.company) && callLookup.company.length) {
                        sourceCompany = callLookup.company[0].value || '';
                    }
                    if (Array.isArray(callLookup.contact) && callLookup.contact.length) {
                        sourceContact = callLookup.contact[0].value || '';
                    }
                } catch (e) {
                    log.error({ title: 'CTC approveProposedTask call lookup failed', details: e.message || e });
                }
            }

            // Materialize native Task
            const task = record.create({ type: record.Type.TASK, isDynamic: true });
            task.setValue({ fieldId: 'title', value: 'AI: ' + String(finalText).substring(0, 80) });
            task.setValue({ fieldId: 'message', value: finalText });
            if (sourceCompany) task.setValue({ fieldId: 'company', value: sourceCompany });
            if (sourceContact) task.setValue({ fieldId: 'contact', value: sourceContact });
            if (finalAssignee) task.setValue({ fieldId: 'assigned', value: finalAssignee });
            if (finalDueValue) task.setValue({ fieldId: 'duedate', value: finalDueValue });
            const nativeTaskId = task.save({ ignoreMandatoryFields: true });

            // Mark proposed_task approved + link to materialized Task
            pt.setText({ fieldId: 'custrecord_ctc_pt_status', text: 'Approved' });
            pt.setValue({ fieldId: 'custrecord_ctc_pt_created_task', value: nativeTaskId });
            pt.setValue({ fieldId: 'custrecord_ctc_pt_reviewer', value: userId });
            pt.setValue({ fieldId: 'custrecord_ctc_pt_reviewed_date', value: new Date() });
            pt.save({ ignoreMandatoryFields: true });

            return { ok: true, nativeTaskId: nativeTaskId };
        } catch (e) {
            log.error({ title: 'CTC approveProposedTask Failed', details: (e && e.message) || String(e) });
            // Return generic error to client — internal NetSuite messages can leak field IDs.
            // Real details live in the Script Execution Log.
            return { error: 'Approval failed' };
        }
    };

    /**
     * bulkApproveProposedTasks — approve multiple proposed_tasks in one round-trip.
     * Reuses approveProposedTask per-task so ownership + idempotency + SDF-correct
     * field writes all apply uniformly. Per-task failures don't abort the batch.
     *
     * @param {Object} body
     * @param {Array<string>} body.taskIds — proposed_task IDs to approve (max 25 per batch)
     * @returns {Object} { ok, approved, failed, results } or { error }
     */
    const bulkApproveProposedTasks = (body) => {
        try {
            const taskIds = Array.isArray(body.taskIds) ? body.taskIds : [];
            if (!taskIds.length) return { error: 'taskIds required' };
            // Cap to stay well under RESTlet governance — each approve costs roughly
            // 30 units (load + Task create + save).
            if (taskIds.length > 25) return { error: 'batch_too_large', limit: 25 };

            const results = taskIds.map((id) => {
                try {
                    const r = approveProposedTask({ taskId: id });
                    return Object.assign({ taskId: id }, r);
                } catch (e) {
                    return { taskId: id, error: (e && e.message) || String(e) };
                }
            });
            const approved = results.filter((r) => r.ok).length;
            const failed = results.filter((r) => r.error).length;
            return { ok: failed === 0, approved: approved, failed: failed, results: results };
        } catch (e) {
            log.error({ title: 'CTC bulkApproveProposedTasks Failed', details: (e && e.message) || String(e) });
            return { error: 'Bulk approval failed' };
        }
    };

    /**
     * rejectProposedTask — mark a proposed_task as Rejected. No Task record created.
     * Kept in the system (not deleted) for AI-quality auditing.
     *
     * @param {Object} body
     * @param {string} body.taskId
     * @returns {Object} { ok: true } or { error }
     */
    const rejectProposedTask = (body) => {
        try {
            if (!body.taskId) return { error: 'taskId required' };
            const userId = runtime.getCurrentUser().id;

            // Load the record (instead of submitFields) so we can use setText to coerce
            // the SELECT list value text→ID, plus enforce ownership + idempotency.
            const pt = record.load({
                type: 'customrecord_ctc_proposed_task',
                id: body.taskId,
                isDynamic: false
            });

            const currentStatusText = pt.getText
                ? pt.getText({ fieldId: 'custrecord_ctc_pt_status' })
                : '';
            if (currentStatusText && currentStatusText !== 'Pending') {
                return { error: 'already_actioned', currentStatus: currentStatusText };
            }

            const sourceCallId = pt.getValue({ fieldId: 'custrecord_ctc_pt_phone_call' });
            if (!isAuthorizedForProposedTask(sourceCallId, userId)) {
                return { error: 'forbidden' };
            }

            pt.setText({ fieldId: 'custrecord_ctc_pt_status', text: 'Rejected' });
            pt.setValue({ fieldId: 'custrecord_ctc_pt_reviewer', value: userId });
            pt.setValue({ fieldId: 'custrecord_ctc_pt_reviewed_date', value: new Date() });
            pt.save({ ignoreMandatoryFields: true });

            return { ok: true };
        } catch (e) {
            log.error({ title: 'CTC rejectProposedTask Failed', details: (e && e.message) || String(e) });
            return { error: 'Rejection failed' };
        }
    };

    return { post };
});
