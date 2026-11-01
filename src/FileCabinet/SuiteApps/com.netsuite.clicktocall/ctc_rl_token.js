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
define(['N/search', 'N/runtime', 'N/log', 'N/record', 'N/https', 'N/encode', './lib/ctc_twilio_jwt', './lib/ctc_transcript_utils', './lib/ctc_config', './lib/ctc_twilio_admin', './lib/ctc_workspace_queries', './lib/ctc_entity', './lib/ctc_call_ownership', './lib/ctc_llm_analysis', './lib/ctc_time', './lib/ctc_call_claim'], (search, runtime, log, record, https, encode, twilioJwt, utils, ctcConfig, twilioAdmin, workspaceQueries, ctcEntity, callOwnership, llmAnalysis, ctcTime, callClaim) => {

    const loadConfig = ctcConfig.loadConfig;
    // Phase 2 U10: Auth Token removed. All Twilio Basic Auth uses the API Key
    // SecureString path — buildSecureAuthHeader(cfg) returns a SecureString
    // built from `apiKeySid + ':{' + apiSecretId + '}'`. The secret VALUE
    // never enters script scope; NetSuite's HTTP runtime expands the
    // {custsecret_*} placeholder at the socket write boundary.
    const buildSecureAuthHeader = twilioAdmin.buildSecureAuthHeader;

    /**
     * POST handler — routes to token generation, call logging, transcript check,
     * entity search, workspace data fetches, or proposed-task review actions.
     * @param {Object} requestBody
     * @returns {Object}
     */
    const post = (requestBody) => {
        const body = requestBody || {};

        // Actions open to any internal user: the dashboard portlet and
        // Reporting Central (managers, admins) call these and scope the
        // data to the session user's book; the proposed-task actions have
        // their own owner / sales-rep checks.
        if (body.action === 'searchEntities')       return searchEntities(body);
        if (body.action === 'getWorkspaceHistory')  return getWorkspaceHistory(body);
        if (body.action === 'getWorkspaceTasks')    return getWorkspaceTasks(body);
        if (body.action === 'approveProposedTask')  return approveProposedTask(body);
        if (body.action === 'bulkApproveProposedTasks') return bulkApproveProposedTasks(body);
        if (body.action === 'rejectProposedTask')   return rejectProposedTask(body);

        // Phone actions act for the session user: only phone users
        // (isPhoneUser). Decided once per request, never cached across
        // requests: an assignment change applies at the next request.
        const gate = isPhoneUser();
        if (!gate.ok) {
            log.audit({
                title: 'CTC RESTlet — not a phone user',
                details: 'action=' + (body.action || 'token') + ' reason=' + gate.reason +
                         ' userId=' + runtime.getCurrentUser().id
            });
            return { error: NOT_A_PHONE_USER };
        }

        if (body.action === 'logCall')              return logCall(body);
        if (body.action === 'checkTranscript')      return checkTranscript(body);
        if (body.action === 'softphoneSuggested')   return softphoneSuggested(body);
        if (body.action === 'softphoneSearch')      return softphoneSearch(body);
        if (body.action === 'softphoneContacts')    return softphoneContacts(body);
        if (body.action === 'softphoneRecents')     return softphoneRecents(body);
        if (body.action === 'softphoneAccountSnapshot') return softphoneAccountSnapshot(body);
        if (body.action === 'softphoneBookCounts')  return softphoneBookCounts(body);
        if (body.action === 'lookupCaller')         return lookupCaller(body);
        if (body.action === 'phoneHeartbeat')       return phoneHeartbeat(body);

        return generateToken(body, gate.config);
    };

    // --- Phone user gate (tokens + phone actions) ---
    const NOT_A_PHONE_USER = 'not_a_phone_user';
    const ADMINISTRATOR_ROLE_ID = '3';
    const REP_ASSIGNMENT_TYPE = 'customrecord_ctc_rep_assignment';

    /**
     * True when at least one active rep assignment matches the filter.
     * Throws on a search error (the caller fails closed).
     * @param {Array} filter - N/search filter on the assignment record
     * @returns {boolean}
     */
    const hasActiveAssignment = (filter) => {
        const rows = search.create({
            type: REP_ASSIGNMENT_TYPE,
            filters: [filter, 'AND', ['isinactive', 'is', 'F']],
            columns: ['internalid']
        }).run().getRange({ start: 0, end: 1 });
        return !!(rows && rows.length);
    };

    /**
     * Who may get a Twilio token and use the phone actions (user
     * decision 2026-11-01): CTC is active (custrecord_ctc_active) AND the
     * session user has an active rep assignment, OR supervises an employee
     * who has one, OR the session role is Administrator (3).
     * Fails closed: a config or search error denies.
     * Cost: config search (10) + up to 2 assignment searches (10 each).
     * @returns {{ok:true, config:Object} | {ok:false, reason:string}}
     */
    const isPhoneUser = () => {
        let config;
        try {
            config = loadConfig();
        } catch (e) {
            log.error({ title: 'CTC phone user check — config failed', details: (e && e.message) || String(e) });
            return { ok: false, reason: 'config_unavailable' };
        }
        if (!config || config.active !== true) return { ok: false, reason: 'ctc_inactive' };

        const user = runtime.getCurrentUser();
        if (String(user.role) === ADMINISTRATOR_ROLE_ID) return { ok: true, config: config };
        const userId = parseInt(user.id, 10);
        if (!(userId > 0)) return { ok: false, reason: 'no_user' };

        try {
            if (hasActiveAssignment(['custrecord_ctc_ra_employee', 'anyof', String(userId)])) {
                return { ok: true, config: config };
            }
            // Managers: the assigned employee's supervisor is this user.
            // Joins the Employee record; a role that cannot read employees
            // gets an error here and is denied (logged).
            if (hasActiveAssignment(['custrecord_ctc_ra_employee.supervisor', 'anyof', String(userId)])) {
                return { ok: true, config: config };
            }
        } catch (e) {
            log.error({ title: 'CTC phone user check — assignment search failed', details: (e && e.message) || String(e) });
            return { ok: false, reason: 'check_failed' };
        }
        return { ok: false, reason: 'no_assignment' };
    };

    /**
     * Generate a Twilio Access Token. The caller (post) has already
     * checked isPhoneUser and passes the config it loaded.
     * @param {Object} body
     * @param {Object} config - loaded CTC config
     * @returns {Object} { token, phoneNumber } or { error }
     */
    const generateToken = (body, config) => {
        try {
            // CRIT-1 (SAFE review 2026-05-21) — identity MUST come from the
            // authenticated session, never from the request body. The previous
            // `body.employeeId ? ... : runtime.getCurrentUser().id` pattern
            // let any authenticated internal user mint a JWT bound to another
            // rep's identity (Twilio attributes the call/recording/transcript
            // to that identity). Once Step 4's rep_assignment lookup is wired
            // into caller-ID resolution, the same bug becomes "rep A places
            // calls displaying rep B's caller ID."
            const identity = String(runtime.getCurrentUser().id);

            const token = twilioJwt.generateAccessToken({
                accountSid:  config.accountSid,
                apiKeySid:   config.apiKeySid,
                apiSecretId: config.apiSecretId,
                twimlAppSid: config.twimlAppSid,
                identity:    identity,
                // Inbound spike: Twilio may ring this identity only when the
                // config record turns inbound on.
                incomingAllow: config.inboundEnabled === true
            });

            return { token: token, phoneNumber: config.phoneNumber };
        } catch (e) {
            log.error({ title: 'CTC Token Generation Failed', details: e.message || e });
            return { error: 'Token generation failed' };
        }
    };

    /**
     * Inbound spike: match the caller's number to a record for the ring UI
     * and the screen-pop. The rep's own book wins (see
     * workspaceQueries.lookupCallerByPhone).
     * @param {Object} body
     * @param {string} body.phone - caller number as Twilio sent it (E.164)
     * @returns {Object} { match: {entityId, entityType, name, contactName, contactId, inBook} | null } or { error, match: null }
     */
    const lookupCaller = (body) => {
        return workspaceQueries.lookupCallerByPhone({
            userId: runtime.getCurrentUser().id,
            phone: body.phone
        });
    };

    // --- Rep phone heartbeat (customrecord_ctc_rep_presence) ---
    const PRESENCE_TYPE = 'customrecord_ctc_rep_presence';
    const PRESENCE_FIELDS = {
        employee:        'custrecord_ctc_rp_employee',
        lastSeen:        'custrecord_ctc_rp_last_seen',
        canReceive:      'custrecord_ctc_rp_can_receive',
        state:           'custrecord_ctc_rp_state',
        incomingGranted: 'custrecord_ctc_rp_incoming_granted',
        client:          'custrecord_ctc_rp_client',
        lastChange:      'custrecord_ctc_rp_last_change',
        lastError:       'custrecord_ctc_rp_last_error',
        identityMatch:   'custrecord_ctc_rp_identity_match'
    };
    const PRESENCE_STATES = ['registered', 'unregistered', 'registering', 'offline', 'frozen'];
    const PRESENCE_CLIENT_MAX = 80;
    const PRESENCE_ERROR_MAX = 200;
    // An unchanged heartbeat inside this window is not written.
    const PRESENCE_MIN_WRITE_MS = 60 * 1000;
    // Extra rows for one employee (concurrent first heartbeats) deleted per
    // call. The newest row is kept and updated.
    const PRESENCE_MAX_DELETES = 5;

    const isChecked = (v) => v === true || v === 'T';
    // eslint-disable-next-line no-control-regex
    const cleanText = (v, max) => String(v || '').replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, max);

    /**
     * Delete the extra presence rows of one employee (all but the newest).
     * A failed delete is logged and skipped.
     * @param {Array<Object>} extras - search results, newest first
     */
    const deleteExtraPresenceRows = (extras) => {
        extras.slice(0, PRESENCE_MAX_DELETES).forEach((row) => {
            try {
                record.delete({ type: PRESENCE_TYPE, id: row.id });
            } catch (e) {
                log.error({ title: 'CTC phoneHeartbeat extra row not deleted', details: `${row.id}: ${(e && e.message) || e}` });
            }
        });
    };

    /**
     * The softphone reports whether this rep's browser phone can receive
     * calls. One row per employee (upsert): the newest row is updated and
     * up to 5 extra rows are deleted. The employee is the session user,
     * never a body value. body.identity (the token's Twilio identity) is
     * only compared with the session user (identityMatch). body.lastError
     * (≤ 200 chars) is stored when present and kept when absent.
     * Cost: one search (10 units) plus, when it writes, submitFields (2)
     * or create + save (2 + 4), plus 4 units per extra row deleted.
     * @param {Object} body - { state, canReceive, incomingGranted, client, identity, lastError }
     * @returns {Object} { ok: true, skipped?, removed? } or { error }
     */
    const phoneHeartbeat = (body) => {
        try {
            const employeeId = parseInt(runtime.getCurrentUser().id, 10);
            if (!(employeeId > 0)) return { error: 'no_user' };

            const state = String(body.state || '');
            if (PRESENCE_STATES.indexOf(state) === -1) return { error: 'invalid_state' };
            const incomingGranted = body.incomingGranted === true;
            // Twilio rings only a registered device whose token grants incoming.
            const canReceive = body.canReceive === true && incomingGranted && state === 'registered';
            const client = cleanText(body.client, PRESENCE_CLIENT_MAX);
            const lastError = cleanText(body.lastError, PRESENCE_ERROR_MAX);
            const identityMatch = String(body.identity == null ? '' : body.identity).trim() === String(employeeId);

            const now = new Date();
            const nowIso = now.toISOString();
            const F = PRESENCE_FIELDS;

            const rows = search.create({
                type: PRESENCE_TYPE,
                filters: [[F.employee, 'anyof', String(employeeId)]],
                columns: [
                    search.createColumn({ name: 'internalid', sort: search.Sort.DESC }),
                    F.lastSeen, F.canReceive, F.state, F.incomingGranted, F.client, F.lastError, F.identityMatch
                ]
            }).run().getRange({ start: 0, end: 1 + PRESENCE_MAX_DELETES }) || [];

            if (!rows.length) {
                const rec = record.create({ type: PRESENCE_TYPE });
                rec.setValue({ fieldId: F.employee, value: employeeId });
                rec.setValue({ fieldId: F.lastSeen, value: nowIso });
                rec.setValue({ fieldId: F.canReceive, value: canReceive });
                rec.setValue({ fieldId: F.state, value: state });
                rec.setValue({ fieldId: F.incomingGranted, value: incomingGranted });
                rec.setValue({ fieldId: F.client, value: client });
                rec.setValue({ fieldId: F.lastChange, value: nowIso });
                rec.setValue({ fieldId: F.identityMatch, value: identityMatch });
                if (lastError) rec.setValue({ fieldId: F.lastError, value: lastError });
                rec.save({ ignoreMandatoryFields: true });
                return { ok: true };
            }

            const row = rows[0];
            const extras = rows.slice(1);
            if (extras.length) deleteExtraPresenceRows(extras);
            const removed = Math.min(extras.length, PRESENCE_MAX_DELETES);
            const withRemoved = (res) => {
                if (removed) res.removed = removed;
                return res;
            };

            const prevCanReceive = isChecked(row.getValue(F.canReceive));
            const changed = prevCanReceive !== canReceive
                || String(row.getValue(F.state) || '') !== state
                || isChecked(row.getValue(F.incomingGranted)) !== incomingGranted
                || String(row.getValue(F.client) || '') !== client
                || isChecked(row.getValue(F.identityMatch)) !== identityMatch
                || (!!lastError && String(row.getValue(F.lastError) || '') !== lastError);
            const lastSeenMs = Date.parse(String(row.getValue(F.lastSeen) || ''));
            const recent = !isNaN(lastSeenMs)
                && now.getTime() - lastSeenMs >= 0
                && now.getTime() - lastSeenMs < PRESENCE_MIN_WRITE_MS;
            if (!changed && recent) return withRemoved({ ok: true, skipped: true });

            const values = {};
            values[F.lastSeen] = nowIso;
            values[F.canReceive] = canReceive;
            values[F.state] = state;
            values[F.incomingGranted] = incomingGranted;
            values[F.client] = client;
            values[F.identityMatch] = identityMatch;
            if (lastError) values[F.lastError] = lastError;
            if (prevCanReceive !== canReceive) values[F.lastChange] = nowIso;
            record.submitFields({
                type: PRESENCE_TYPE,
                id: row.id,
                values: values,
                options: { enableSourcing: false, ignoreMandatoryFields: true }
            });
            return withRemoved({ ok: true });
        } catch (e) {
            log.error({ title: 'CTC phoneHeartbeat Failed', details: (e && e.message) || String(e) });
            return { error: 'Heartbeat failed' };
        }
    };

    // Minimum call duration (seconds) before we create a Phone Call record.
    // Twilio Voice Intelligence won't transcribe recordings under 2 seconds, so logging
    // sub-2s calls produces empty activity records. Server-side defense-in-depth — the
    // softphone client enforces a higher 3s threshold for UX.
    const MIN_LOG_DURATION_SECONDS = 2;

    // Sprint 2 review P0 #1 (Option B) — verifyCallOwnership +
    // getUserAssignedPhones extracted to lib/ctc_call_ownership.js so
    // the scheduled-script orphan-retry pass can re-verify ownership
    // before recreating a Phone Call from a persisted orphan row.
    // Same auth model, same behavior — pure mechanical extraction.
    const verifyCallOwnership = callOwnership.verifyCallOwnership;

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
     * Sprint 2 review ORPHAN-A — discriminate exception types so the
     * orphan queue only catches genuinely transient/retriable failures.
     *
     * Pre-fix, ANY phoneCall.save() throw triggered an orphan row.
     * In practice, most save failures are programming/config bugs
     * (mandatory field missing, INSUFFICIENT_PERMISSION, role
     * misconfiguration) — retry hits the same failure forever,
     * spamming logs until retryCount=3 makes the row stuck.
     *
     * Post-fix: classify by exception name. Only transient-shaped
     * errors (DB lock, deadlock, governance edges) enter the queue.
     * Programming bugs bubble up to the rep as a hard error so admin
     * fixes the root cause.
     *
     * Returns true if the orphan was persisted (and should be retried
     * by the scheduled pass), false otherwise (either non-transient
     * exception class, or the orphan write itself threw).
     */
    // SSS_RECORD_TYPE_REQ_FIELD_MISSING is not here: a missing mandatory
    // field fails the same way on every retry (2026-11-01).
    const TRANSIENT_SAVE_ERROR_NAMES = [
        'RCRD_HAS_BEEN_CHANGED',             // optimistic lock failure (NetSuite concurrent edit)
        'SSS_REQUEST_LIMIT_EXCEEDED',        // transient governance edge
        'CONCURRENT_REQUEST_LIMIT_EXCEEDED', // transient concurrency limit
        'UNEXPECTED_ERROR'                   // catch-all NetSuite emits for transient backend issues
    ];

    const isTransientSaveError = (err) => {
        if (!err) return false;
        const name = (err.name || '').toUpperCase();
        if (TRANSIENT_SAVE_ERROR_NAMES.indexOf(name) !== -1) return true;
        // Some NetSuite errors expose the code on err.id (User Error
        // Object pattern); check that too.
        const id = (err.id || '').toUpperCase();
        if (TRANSIENT_SAVE_ERROR_NAMES.indexOf(id) !== -1) return true;
        return false;
    };

    /**
     * Sprint 2 U5 (HIGH-13) — persist call metadata to a lightweight
     * orphan row when phoneCall.save() throws TRANSIENTLY. The
     * scheduled poller picks these up on its next cycle and retries
     * the Phone Call create.
     *
     * Synchronous inline retry is NOT an option here — the RESTlet
     * has a hard timeout and the rep's popup is waiting on the
     * response. The fallback queue lets the scheduled pass own the
     * retry.
     *
     * Sprint 2 review #3 — additionally persists contactId + duration
     * so the recreate path can reconstruct the full Phone Call shape
     * (not a degraded recovery).
     *
     * Returns true on success, false on failure. The caller still
     * returns a generic error to the rep either way; orphanCreated
     * is purely an observability hint.
     */
    const createOrphanCall = (body, userId) => {
        try {
            const orphan = record.create({ type: 'customrecord_ctc_orphan_call' });
            orphan.setValue({ fieldId: 'custrecord_ctc_orphan_callsid', value: String(body.callSid || '') });
            orphan.setValue({ fieldId: 'custrecord_ctc_orphan_recordingsid', value: String(body.recordingSid || '') });
            orphan.setValue({ fieldId: 'custrecord_ctc_orphan_entityid', value: parseInt(body.entityId, 10) || 0 });
            orphan.setValue({ fieldId: 'custrecord_ctc_orphan_entitytype', value: String(body.entityType || '') });
            orphan.setValue({ fieldId: 'custrecord_ctc_orphan_userid', value: parseInt(userId, 10) || 0 });
            orphan.setValue({ fieldId: 'custrecord_ctc_orphan_phone', value: String(body.phone || '') });
            orphan.setValue({ fieldId: 'custrecord_ctc_orphan_direction', value: String(body.direction || 'outbound') });
            // Sprint 2 review #3 — preserve contactId + duration so
            // recreatePhoneCallFromOrphan can build a complete record
            // (not a degraded one missing rollup data).
            orphan.setValue({ fieldId: 'custrecord_ctc_orphan_contactid', value: parseInt(body.contactId, 10) || 0 });
            orphan.setValue({ fieldId: 'custrecord_ctc_orphan_duration', value: parseInt(body.duration, 10) || 0 });
            orphan.setValue({ fieldId: 'custrecord_ctc_orphan_retrycount', value: 0 });
            orphan.save();
            return true;
        } catch (e) {
            // If the orphan write itself fails (e.g., the custom
            // record isn't deployed yet, or a quota issue), log
            // loudly — admin needs to know the safety-net is
            // broken. Do NOT throw — the rep gets a generic error
            // either way.
            log.error({ title: 'CTC createOrphanCall failed', details: (e && e.message) || String(e) });
            return false;
        }
    };

    /**
     * Name for an inbound Phone Call title: the matched record's name the
     * softphone sends (plain text, capped, control characters removed),
     * else the caller's number.
     * @param {Object} body
     * @returns {string}
     */
    const inboundTitleName = (body) => {
        // eslint-disable-next-line no-control-regex
        const name = String(body.callerName || '').replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, 120);
        return name || body.phone || 'unknown';
    };

    /**
     * Create a Phone Call record immediately after call ends.
     * @param {Object} body
     * @returns {Object} { success, recordId, duplicate? } or { error }
     */
    // A client-sent call start is used only within this window of now.
    const STARTED_AT_WINDOW_MS = 24 * 60 * 60 * 1000;

    /**
     * When the call started, ISO-8601 UTC, for custevent_ctc_call_started.
     * In order: Twilio's start_time from the ownership check (server
     * truth); the softphone's startedAt (epoch ms, its answer time) when it
     * is within ±1 day of now; else now minus the duration.
     * @param {Object|undefined} twilioCall - verifyCallOwnership's call
     * @param {*} startedAt - body.startedAt (client, epoch ms)
     * @param {number} duration - seconds
     * @returns {string}
     */
    const callStartedIso = (twilioCall, startedAt, duration) => {
        const nowMs = Date.now();
        const twilioMs = utils.parseTwilioDate(twilioCall && twilioCall.start_time);
        if (typeof twilioMs === 'number' && Math.abs(nowMs - twilioMs) <= STARTED_AT_WINDOW_MS) return ctcTime.isoUtc(twilioMs);
        const clientMs = typeof startedAt === 'number' ? startedAt : NaN;
        if (isFinite(clientMs) && Math.abs(nowMs - clientMs) <= STARTED_AT_WINDOW_MS) return ctcTime.isoUtc(clientMs);
        return ctcTime.isoUtc(nowMs - duration * 1000);
    };

    const logCall = (body) => {
        try {
            const duration = parseInt(body.duration, 10) || 0;
            if (duration < MIN_LOG_DURATION_SECONDS) {
                return { error: 'duration_below_threshold', duration: duration };
            }

            // HIGH-7 (SAFE review 2026-05-21) — phone format validation.
            // Pre-fix, body.phone was written verbatim to Phone Call's `title`
            // and `phone` fields with no length cap or character whitelist —
            // letting a malicious client pollute the activity log with
            // arbitrary text. Enforce E.164 (7-15 digits, optional leading
            // '+') at the boundary. NetSuite's `phone` field type provides
            // storage escaping so this isn't an XSS vector, but unvalidated
            // text is a data-integrity gap that BFN review will flag.
            const rawPhone = String(body.phone || '');
            if (!rawPhone || !/^\+?[0-9]{7,15}$/.test(rawPhone)) {
                log.audit({
                    title: 'CTC logCall — invalid phone format',
                    details: 'callSid=' + body.callSid +
                             ' phoneLen=' + rawPhone.length
                });
                return { error: 'invalid_phone' };
            }

            if (body.callSid) {
                const existingId = findCallByCallSid(body.callSid);
                if (existingId) {
                    return { success: true, recordId: existingId, duplicate: true };
                }
            }

            // CRIT-2 gate (SAFE review 2026-05-21) — verify the body-supplied
            // callSid was actually placed by the authenticated user before
            // we create a Phone Call record from it. Pre-fix, any internal
            // user could POST arbitrary callSid + entityId combinations and
            // forge activity records against any customer/contact/lead.
            // Inbound spike: a call Twilio rang in to this rep's phone.
            // verifyCallOwnership checks the Twilio leg's `to` is this
            // rep's client identity instead of the outbound `from` rules.
            const inbound = body.direction === 'inbound';
            const userId = runtime.getCurrentUser().id;
            const auth = verifyCallOwnership(body.callSid, userId, inbound ? 'inbound' : 'outbound');
            if (!auth.ok) {
                log.audit({
                    title: 'CTC logCall — verification rejected',
                    details: 'reason=' + auth.reason + ' callSid=' + body.callSid +
                             ' userId=' + userId
                });
                return { error: 'forbidden', code: auth.reason };
            }

            const phoneCall = record.create({ type: record.Type.PHONE_CALL, isDynamic: true });

            phoneCall.setValue({ fieldId: 'title', value: inbound
                ? 'Inbound call from ' + inboundTitleName(body)
                : 'Call to ' + (body.phone || 'unknown') });
            phoneCall.setValue({ fieldId: 'status', value: 'COMPLETE' });
            phoneCall.setValue({ fieldId: 'phone', value: body.phone || '' });
            // Sprint 2 review ORPHAN-B — set assigned=userId. Without
            // this, accounts where Phone Call's assigned is mandatory
            // (common in mature NetSuite installs) cause save() to
            // throw → every call enters the orphan queue → wasted
            // retries until retryCount=3. This is the #1 most likely
            // orphan trigger; closing it makes the safety-net actually
            // a safety-net (transient-only) rather than a noise source.
            phoneCall.setValue({ fieldId: 'assigned', value: userId });
            phoneCall.setValue({ fieldId: 'custevent_ctc_call_sid', value: body.callSid || '' });
            phoneCall.setValue({ fieldId: 'custevent_ctc_duration', value: duration });
            phoneCall.setValue({ fieldId: 'custevent_ctc_processed', value: false });
            phoneCall.setValue({ fieldId: 'custevent_ctc_call_status', value: utils.CALL_STATUS.LOGGED });
            if (inbound) phoneCall.setValue({ fieldId: 'custevent_ctc_inbound', value: true });
            phoneCall.setValue({ fieldId: 'custevent_ctc_call_started', value: callStartedIso(auth.call, body.startedAt, duration) });

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
                    const parentCompany = utils.lookupContactCompany(contactNumeric);
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

            // Sprint 2 U5 (HIGH-13) — inner try/catch around save so
            // a save failure specifically triggers orphan-row creation.
            // Anything that throws before save (record.create itself
            // or setValue) is a programming bug, not a transient — let
            // the outer catch handle it without polluting the orphan
            // queue with retry candidates that will keep failing.
            //
            // Sprint 2 review ORPHAN-A — classify the exception type.
            // Only transient-shaped errors (DB lock, deadlock,
            // governance edges) enter the orphan queue. Programming
            // bugs (mandatory field missing, INSUFFICIENT_PERMISSION,
            // etc.) surface as hard errors so admin fixes the root
            // cause instead of the orphan retry pass spamming logs
            // until retryCount=3.
            let recordId;
            try {
                recordId = phoneCall.save();
            } catch (saveErr) {
                const transient = isTransientSaveError(saveErr);
                log.error({
                    title: 'CTC logCall — phoneCall.save() failed',
                    details: 'callSid=' + body.callSid +
                             ' transient=' + transient +
                             ' err.name=' + (saveErr && saveErr.name) +
                             ' err=' + ((saveErr && saveErr.message) || String(saveErr))
                });
                if (!transient) {
                    // Non-transient — return hard error WITHOUT queueing.
                    // Admin will see the log.error and fix the root cause
                    // (missing required field, role permission, etc.).
                    return { error: 'Failed to log call', code: 'NON_TRANSIENT_SAVE' };
                }
                const orphanCreated = createOrphanCall(body, userId);
                return { error: 'Failed to log call — admin will retry', orphanCreated: orphanCreated };
            }
            return { success: true, recordId: recordId };
        } catch (e) {
            log.error({ title: 'CTC Log Call Failed', details: e.message || e });
            return { error: 'Failed to log call' };
        }
    };

    /**
     * Answer for a call that is not open for analysis
     * (callClaim.stateOf / claimForAnalysis reasons).
     * @param {string} where - 'transcribed' | 'terminal' | 'claimed'
     * @returns {Object}
     */
    const settledTranscriptAnswer = (where) => {
        if (where === 'transcribed') return { status: 'completed', alreadyDone: true };
        if (where === 'claimed') return { status: 'pending', reason: 'claimed' };
        return { status: 'terminal', reason: 'already_closed' };
    };

    /**
     * Check if a transcript is ready for a given call, and if so, enrich the Phone Call record.
     * Idempotent: a call with processed T or a terminal status is never
     * touched again, and the call is claimed (lib/ctc_call_claim) before
     * the LLM so the poller does not analyse it too.
     * @param {Object} body
     * @param {string} body.callSid - Twilio Call SID
     * @param {string} body.recordId - NetSuite Phone Call internal ID
     * @returns {Object} { status: 'completed'|'pending'|'no_recording'|'terminal'|'transient', alreadyDone?, reason? } or { error }
     */
    const checkTranscript = (body) => {
        let claimed = false;
        let saved = false;
        try {
            // CRIT-3 gate (SAFE review 2026-05-21) — checkTranscript pre-fix
            // accepted any body-supplied {callSid, recordId} pair and pulled
            // the Twilio transcript onto the supplied record, then DELETED
            // the Twilio-side recording. Three exploit shapes:
            //   - Corruption: write rep B's transcript onto rep B's record
            //     by spoofing callSid (overwrite valid data)
            //   - Exfiltration: pull rep B's transcript onto rep A's own
            //     record (transcript theft via callSid replay)
            //   - Evidence destruction: cause Twilio-side recording delete
            //     for arbitrary callSids regardless of authz
            //
            // Three checks gate the action:
            //   1. recordId is required
            //   2. phoneCall.custevent_ctc_call_sid MUST equal body.callSid
            //      (binding check — closes the corruption + exfiltration paths)
            //   3. verifyCallOwnership(callSid, currentUser) MUST pass
            //      (ownership check — same Twilio-side gate as CRIT-2/logCall)
            if (!body.recordId) {
                return { error: 'forbidden', code: 'RECORD_ID_REQUIRED' };
            }

            // Load the Phone Call FIRST and verify the callSid binding before
            // any Twilio work or state mutation.
            let phoneCallForCheck;
            try {
                phoneCallForCheck = record.load({
                    type: record.Type.PHONE_CALL, id: body.recordId
                });
            } catch (e) {
                return { error: 'forbidden', code: 'RECORD_NOT_FOUND' };
            }
            const boundCallSid = String(phoneCallForCheck.getValue({
                fieldId: 'custevent_ctc_call_sid'
            }) || '');
            if (boundCallSid !== String(body.callSid || '')) {
                log.audit({
                    title: 'CTC checkTranscript — callSid binding mismatch',
                    details: 'recordId=' + body.recordId +
                             ' bodyCallSid=' + body.callSid +
                             ' recordCallSid=' + boundCallSid +
                             ' userId=' + runtime.getCurrentUser().id
                });
                return { error: 'forbidden', code: 'CALLSID_MISMATCH' };
            }

            // Inbound calls store the child leg that rang the rep, so the
            // ownership check uses the inbound rule (to === client:<id>).
            // The flag comes from the stored record, never from the body.
            const inboundFlag = phoneCallForCheck.getValue({ fieldId: 'custevent_ctc_inbound' });
            const inbound = inboundFlag === true || inboundFlag === 'T';

            const userId = runtime.getCurrentUser().id;
            const auth = verifyCallOwnership(body.callSid, userId, inbound ? 'inbound' : 'outbound');
            if (!auth.ok) {
                log.audit({
                    title: 'CTC checkTranscript — verification rejected',
                    details: 'reason=' + auth.reason +
                             ' callSid=' + body.callSid +
                             ' userId=' + userId
                });
                return { error: 'forbidden', code: auth.reason };
            }

            // Already finished (Transcribed / No transcript / Missed / Too
            // short / No answer, or processed T) or claimed by the poller:
            // no Twilio work, no status write, no second analysis.
            const storedState = callClaim.stateOf({
                processed: phoneCallForCheck.getValue({ fieldId: 'custevent_ctc_processed' }),
                status: phoneCallForCheck.getValue({ fieldId: 'custevent_ctc_call_status' })
            });
            if (storedState !== 'open') return settledTranscriptAnswer(storedState);

            const config = loadConfig();
            const authHeader = buildSecureAuthHeader(config);

            let recording = utils.fetchRecordingForCall(config.accountSid, body.callSid, authHeader);
            // Sprint 2b (HIGH-1) — transient Twilio failure: tell the
            // browser to retry, don't flip call_status. The browser poll
            // retries every 15s for up to 3 minutes; the scheduled script
            // backfills any calls still pending after that.
            if (utils.isTransientError(recording)) {
                return { status: 'transient', reason: 'twilio_unreachable' };
            }
            // Inbound: the Studio flow's recording hangs on the parent
            // (caller) leg. Same lookup as the scheduled poller.
            if (!recording && inbound) {
                const childCall = utils.fetchCall(config.accountSid, body.callSid, authHeader);
                if (utils.isTransientError(childCall)) {
                    return { status: 'transient', reason: 'twilio_unreachable' };
                }
                recording = utils.fetchParentCallRecording(config.accountSid, childCall, authHeader);
                if (utils.isTransientError(recording)) {
                    return { status: 'transient', reason: 'twilio_unreachable' };
                }
            }
            if (!recording) {
                return { status: 'no_recording' };
            }

            if (utils.isRecordingTerminal(recording)) {
                if (body.recordId) utils.markCallStatus(body.recordId, utils.CALL_STATUS.NO_TRANSCRIPT, true);
                return { status: 'terminal', reason: 'recording_' + recording.status };
            }

            const transcript = utils.fetchTranscript(recording.sid, authHeader);
            if (utils.isTransientError(transcript)) {
                return { status: 'transient', reason: 'twilio_unreachable' };
            }
            if (!transcript) {
                if (body.recordId) utils.markCallStatus(body.recordId, utils.CALL_STATUS.PROCESSING, false);
                return { status: 'pending' };
            }

            if (utils.isTranscriptTerminal(transcript)) {
                if (body.recordId) utils.markCallStatus(body.recordId, utils.CALL_STATUS.NO_TRANSCRIPT, true);
                return { status: 'terminal', reason: 'transcript_' + transcript.status };
            }

            if (!utils.isTranscriptComplete(transcript)) {
                if (body.recordId) utils.markCallStatus(body.recordId, utils.CALL_STATUS.PROCESSING, false);
                return { status: 'pending' };
            }

            // Claim before the LLM (fresh read + Processing / processed T).
            const claim = callClaim.claimForAnalysis(body.recordId);
            if (!claim.ok) {
                if (claim.reason === 'claim_failed') return { status: 'transient', reason: 'claim_failed' };
                return settledTranscriptAnswer(claim.reason);
            }
            claimed = true;

            const sentences = utils.fetchSentences(transcript.sid, authHeader);
            const transcriptText = utils.formatTranscript(sentences, { inbound: inbound });

            let analysis = {
                summary: '',
                satisfaction_score: 5,
                tone_keywords: [],
                action_items: []
            };

            const hasLlmQuota = llmAnalysis.hasQuota();
            if (hasLlmQuota && transcriptText) {
                analysis = utils.analyzeTranscript(transcriptText);
            }

            const phoneCall = record.load({ type: record.Type.PHONE_CALL, id: body.recordId, isDynamic: true });
            callClaim.clearClaimOnRecord(phoneCall);
            utils.writePhoneCallEnrichmentFields(phoneCall, {
                recording: recording,
                accountSid: config.accountSid,
                transcriptText: transcriptText,
                analysis: analysis,
                includeDuration: false
            });
            const savedRecordId = phoneCall.save();
            saved = true;

            // Sprint 2 review #8 — mirror the scheduled-script's
            // cleanup_pending flag-set on transient DELETE failure.
            // Pre-fix, this user-path ignored the deleteRecording
            // return value, so a Twilio 5xx during browser-triggered
            // transcript fetch silently lost the cleanup retry.
            // Recording would linger in Twilio storage forever.
            const deleteResult = utils.deleteRecording(config.accountSid, recording.sid, authHeader);
            if (utils.isTransientError(deleteResult)) {
                try {
                    record.submitFields({
                        type: record.Type.PHONE_CALL,
                        id: savedRecordId,
                        values: { custevent_ctc_recording_cleanup_pending: true },
                        options: { enableSourcing: false, ignoreMandatoryFields: true }
                    });
                } catch (flagErr) {
                    log.error({ title: 'CTC checkTranscript — cleanup_pending flag-set failed', details: (flagErr && flagErr.message) || String(flagErr) });
                }
            }

            return { status: 'completed' };
        } catch (e) {
            log.error({ title: 'CTC Check Transcript Failed', details: e.message || e });
            // Give the claim back (Failed + processed F) so the poller retries.
            if (claimed && !saved) callClaim.releaseClaim(body.recordId);
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
