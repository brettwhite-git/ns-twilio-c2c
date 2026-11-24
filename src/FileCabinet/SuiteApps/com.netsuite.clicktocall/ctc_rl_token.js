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
define(['N/search', 'N/runtime', 'N/log', 'N/record', './lib/ctc_twilio_jwt', './lib/ctc_transcript_utils', './lib/ctc_config', './lib/ctc_twilio_admin', './lib/ctc_workspace_queries', './lib/ctc_entity', './lib/ctc_call_ownership', './lib/ctc_llm_analysis', './lib/ctc_time', './lib/ctc_call_claim', './lib/ctc_rc_scope', './lib/ctc_outbound_function', './lib/ctc_inbound_routing', './lib/ctc_add_to_netsuite'], (search, runtime, log, record, twilioJwt, utils, ctcConfig, twilioAdmin, workspaceQueries, ctcEntity, callOwnership, llmAnalysis, ctcTime, callClaim, rcScope, outboundFn, inboundRouting, addToNetSuite) => {

    const loadConfig = ctcConfig.loadConfig;
    // Phase 2 U10: Auth Token removed. All Twilio Basic Auth uses the API Key
    // SecureString path — buildSecureAuthHeader(cfg) returns a SecureString
    // built from `apiKeySid + ':{' + apiSecretId + '}'`. The secret VALUE
    // never enters script scope; NetSuite's HTTP runtime expands the
    // {custsecret_*} placeholder at the socket write boundary.
    const buildSecureAuthHeader = twilioAdmin.buildSecureAuthHeader;

    /**
     * Runs fn and adds its ms to steps[name] (body.perf timings). Returns
     * what fn returns; a throw still counts the time.
     * @template T
     * @param {Object<string, number>} steps
     * @param {string} name
     * @param {function(): T} fn
     * @returns {T}
     */
    const timeStep = (steps, name, fn) => {
        const t0 = Date.now();
        try {
            return fn();
        } finally {
            steps[name] = (steps[name] || 0) + (Date.now() - t0);
        }
    };

    /** Governance units left, or null when the runtime cannot say. */
    const remainingUnits = () => {
        try {
            const n = runtime.getCurrentScript().getRemainingUsage();
            return typeof n === 'number' ? n : null;
        } catch (e) {
            return null;
        }
    };

    /**
     * POST handler — routes to token generation, call logging, transcript check,
     * workspace data fetches, or proposed-task review actions.
     *
     * Timing: every request logs `CTC perf` (debug) as '<action> <ms>ms'.
     * With body.perf === true an object answer also gains
     * `_perf: { ms, units, steps }`: ms in the whole request (gate
     * included), units used (getRemainingUsage before minus after; null
     * when unknown) and the ms of named steps (gate, and the steps of
     * lookupCaller, softphoneContacts, softphoneAccountSnapshot,
     * softphoneCallContext).
     * Without the flag the answer is unchanged.
     * @param {Object} requestBody
     * @returns {Object}
     */
    const post = (requestBody) => {
        const body = requestBody || {};
        const wantPerf = body.perf === true;
        const t0 = Date.now();
        const units0 = wantPerf ? remainingUnits() : null;
        /** @type {Object<string, number>} */
        const steps = {};
        const result = route(body, steps);
        const ms = Date.now() - t0;
        log.debug({ title: 'CTC perf', details: String(body.action || 'token') + ' ' + ms + 'ms' });
        if (!wantPerf || !result || typeof result !== 'object' || Array.isArray(result)) return result;
        const units1 = remainingUnits();
        return Object.assign({}, result, {
            _perf: {
                ms: ms,
                units: (units0 !== null && units1 !== null) ? units0 - units1 : null,
                steps: steps
            }
        });
    };

    /**
     * Routes one request (post). `steps` collects named step timings.
     * @param {Object} body
     * @param {Object<string, number>} steps
     * @returns {Object}
     */
    const route = (body, steps) => {

        // Session check for the phone (no gate): NetSuite itself answers
        // 401 SESSION_TIMED_OUT before this runs when the session is gone,
        // so reaching here means the session is alive. Also says whether
        // CTC is active, so open phones pause within a minute.
        if (body.action === 'sessionPing')          return sessionPing();

        // Actions open to any internal user: the dashboard portlet and
        // Reporting Central (managers, admins) call these and scope the
        // data to the session user's book; getCallDetail uses Reporting
        // Central's own scope (the book, or a manager's team); the
        // follow-up actions share one access rule (isAuthorizedForProposedTask).
        if (body.action === 'getWorkspaceHistory')  return getWorkspaceHistory(body);
        if (body.action === 'getCallDetail')        return getCallDetail(body);
        if (typeof body.action === 'string' && Object.prototype.hasOwnProperty.call(FOLLOW_UP_ACTIONS, body.action)) {
            // The manager rule reads the team once per request, never from
            // an earlier request (a supervisor change applies at once).
            rcScope.clearTeamCache();
            return FOLLOW_UP_ACTIONS[body.action](body);
        }

        // Phone actions act for the session user: only phone users
        // (isPhoneUser). Decided once per request, never cached across
        // requests: an assignment change applies at the next request.
        const gate = timeStep(steps, 'gate', isPhoneUser);
        if (!gate.ok) {
            log.audit({
                title: 'CTC RESTlet — not a phone user',
                details: 'action=' + (body.action || 'token') + ' reason=' + gate.reason +
                         ' userId=' + runtime.getCurrentUser().id
            });
            // paused: CTC is switched off (not this user's access). The
            // phone waits for sessionPing to say active again instead of
            // treating the refusal as permanent.
            return gate.reason === 'ctc_inactive'
                ? { error: NOT_A_PHONE_USER, paused: true }
                : { error: NOT_A_PHONE_USER };
        }

        if (body.action === 'logCall')              return logCall(body);
        if (body.action === 'checkTranscript')      return checkTranscript(body);
        if (body.action === 'softphoneSuggested')   return softphoneSuggested(body);
        if (body.action === 'softphoneSearch')      return softphoneSearch(body);
        if (body.action === 'softphoneContacts')    return softphoneContacts(body, steps);
        if (body.action === 'softphoneRecents')     return softphoneRecents(body);
        if (body.action === 'softphoneVoicemails')  return softphoneVoicemails(body);
        if (body.action === 'softphoneAccountSnapshot') return softphoneAccountSnapshot(body, steps);
        if (body.action === 'softphoneCallContext') return softphoneCallContext(body, steps);
        if (body.action === 'softphoneBookCounts')  return softphoneBookCounts(body);
        if (body.action === 'lookupCaller')         return lookupCaller(body, steps);
        if (body.action === 'phoneHeartbeat')       return phoneHeartbeat(body);
        if (body.action === 'softphoneFindDuplicates') return softphoneFindDuplicates(body);
        if (body.action === 'softphoneAddToNetSuite')  return softphoneAddToNetSuite(body);

        return generateToken(body, gate.config);
    };

    /**
     * sessionPing answer: { ok: true, active } where active is the config
     * flag custrecord_ctc_active (one config search, 10 units). No gate.
     * A config read error leaves `active` out: the phone keeps its state
     * (the token gate still fails closed).
     * @returns {{ok:true, active?:boolean}}
     */
    const sessionPing = () => {
        try {
            const cfg = loadConfig();
            return { ok: true, active: !!cfg && cfg.active === true };
        } catch (e) {
            const msg = (e && e.message) || String(e);
            // No config record at all = not active (fresh install).
            if (/not found/i.test(msg)) return { ok: true, active: false };
            log.error({ title: 'CTC sessionPing — config read failed', details: msg });
            return { ok: true };
        }
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
        // Any non-zero id: the account owner's employee id is -5.
        if (!userId) return { ok: false, reason: 'no_user' };

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

            return { token: token, phoneNumber: resolveCallerId(identity, config) };
        } catch (e) {
            log.error({ title: 'CTC Token Generation Failed', details: e.message || e });
            return { error: 'Token generation failed' };
        }
    };

    /**
     * Outbound caller ID for the session rep: the number whose inbound
     * calls ring this rep (lib/ctc_inbound_routing.loadRoutes: the number's
     * primary rep, else its first assigned rep), else the config default
     * caller ID. A rep who does not ring for any number (e.g. a secondary
     * on a shared number) uses the default. A failed lookup is logged and
     * falls back; it never fails the token. Cost: one search (10 units).
     * @param {string} userId - session user id (never from the request)
     * @param {Object} config - loaded CTC config
     * @returns {string}
     */
    const resolveCallerId = (userId, config) => {
        try {
            // The number that rings this rep (inbound routing's rule: the
            // number's primary rep, else its first assigned rep), so a
            // callback reaches the same rep.
            const mine = inboundRouting.loadRoutes().filter((r) => String(r.employeeId) === String(userId))[0];
            if (mine && mine.phoneNumber) return String(mine.phoneNumber);
        } catch (e) {
            log.error({
                title: 'CTC caller ID lookup failed — using the default caller ID',
                details: 'userId=' + userId + ' ' + ((e && e.message) || String(e))
            });
        }
        return config.phoneNumber;
    };

    /**
     * Inbound spike: match the caller's number to a record for the ring UI
     * and the screen-pop. The rep's own book wins (see
     * workspaceQueries.lookupCallerByPhone).
     * @param {Object} body
     * @param {string} body.phone - caller number as Twilio sent it (E.164)
     * @param {Object<string, number>} [steps] - perf step timings (post)
     * @returns {Object} { match: {entityId, entityType, name, contactName, contactId, inBook} | null } or { error, match: null }
     */
    const lookupCaller = (body, steps) => {
        return workspaceQueries.lookupCallerByPhone({
            userId: runtime.getCurrentUser().id,
            phone: body.phone,
            perfSteps: steps
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
            // Outbound recording notice (consent log): from config only, no
            // Twilio call. Played = the outbound Function is published and its
            // last publish put a notice live; the version is that publish's.
            if (!inbound) {
                try {
                    const notice = outboundFn.noticeForCall(ctcConfig.loadOutboundConfig());
                    phoneCall.setValue({ fieldId: 'custevent_ctc_notice_played', value: notice.played });
                    if (notice.played) phoneCall.setValue({ fieldId: 'custevent_ctc_notice_ver', value: notice.version });
                } catch (noticeErr) {
                    log.error({ title: 'CTC logCall — notice config read failed',
                                details: (noticeErr && noticeErr.message) || String(noticeErr) });
                }
            }
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

            // Sentences before the claim (2026-11-03): a failed fetch is
            // TRANSIENT_ERROR, not []. Nothing is saved, the recording is
            // kept, no attempt is spent; the browser retries and the poller
            // backfills. A real empty transcript ([]) is saved as before.
            const sentences = utils.fetchSentences(transcript.sid, authHeader);
            if (utils.isTransientError(sentences)) {
                return { status: 'transient', reason: 'twilio_unreachable' };
            }

            // Claim before the LLM (fresh read + Processing / processed T).
            // A call past the attempt cap is closed by the claim (gave_up →
            // answered as terminal).
            const claim = callClaim.claimForAnalysis(body.recordId);
            if (!claim.ok) {
                if (claim.reason === 'claim_failed') return { status: 'transient', reason: 'claim_failed' };
                return settledTranscriptAnswer(claim.reason);
            }
            claimed = true;

            const transcriptText = utils.formatTranscript(sentences, { inbound: inbound });

            let analysis = {
                summary: '',
                satisfaction_score: 5,
                tone_keywords: [],
                action_items: []
            };

            // Dates for the prompt's reference line and the proposed task
            // due dates: today and the call date in the user's time zone.
            const dates = ctcTime.analysisDates(phoneCallForCheck.getValue({ fieldId: 'custevent_ctc_call_started' })) || {};

            const hasLlmQuota = llmAnalysis.hasQuota();
            if (hasLlmQuota && transcriptText) {
                analysis = utils.analyzeTranscript(transcriptText, null, {
                    today: dates.today, callDate: dates.callDate, timezone: dates.timezone, phoneCallId: body.recordId
                });
            } else if (!hasLlmQuota && transcriptText) {
                log.error({
                    title: 'CTC LLM analysis skipped',
                    details: 'phoneCall=' + body.recordId + ' reason=quota — free usage below the reserve; transcript saved without AI fields'
                });
            }

            const phoneCall = record.load({ type: record.Type.PHONE_CALL, id: body.recordId, isDynamic: true });
            callClaim.clearClaimOnRecord(phoneCall);
            utils.writePhoneCallEnrichmentFields(phoneCall, {
                recording: recording,
                accountSid: config.accountSid,
                transcriptText: transcriptText,
                analysis: analysis,
                includeDuration: false,
                callDate: dates.callDate
            });
            const savedRecordId = phoneCall.save();
            saved = true;
            // Proposed tasks only after the save, at most once (never throws).
            utils.createProposedTasksOnce(savedRecordId || body.recordId, analysis, dates.callDate);

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

            // The dock's wrap-up shows the summary as soon as it exists
            // (asset 43); the record keeps the full analysis.
            return { status: 'completed', summary: String((analysis && analysis.summary) || '').slice(0, 600) };
        } catch (e) {
            log.error({ title: 'CTC Check Transcript Failed', details: e.message || e });
            // Give the claim back (Failed + processed F) so the poller retries.
            if (claimed && !saved) callClaim.releaseClaim(body.recordId);
            return { error: 'Transcript check failed' };
        }
    };

    // ─────────────────────────────────────────────────────────────────────────────
    // Phase 2 — Workspace data + proposed-task review actions
    // ─────────────────────────────────────────────────────────────────────────────

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
     * @param {boolean} [body.includeMissed]      - also return `missed`: the same period's
     *                                              missed calls and voicemails (portlet Missed tab)
     * @param {number} [body.missedLimit=5]       - max missed rows (1-25)
     * @returns {Object} { rows: [...], total, missed?: { rows, total } } or { error }
     */
    const getWorkspaceHistory = (body) => {
        const userId = runtime.getCurrentUser().id;
        const result = workspaceQueries.loadHistoryRows({
            userId: userId,
            filters: body.filters,
            todayOnly: !!body.todayOnly,
            dateRange: body.dateRange,
            limit: body.limit
        });
        if (body.includeMissed && result && !result.error) {
            const missedLimit = Math.min(25, Math.max(1, parseInt(String(body.missedLimit || ''), 10) || 5));
            const missed = workspaceQueries.loadHistoryRows({
                userId: userId,
                filters: body.filters,
                todayOnly: !!body.todayOnly,
                dateRange: body.dateRange,
                limit: missedLimit,
                missedOnly: true,
                countTotal: true
            });
            result.missed = missed.error
                ? { error: missed.error, rows: [], total: 0 }
                : { rows: missed.rows || [], total: missed.total || 0 };
        }
        return result;
    };

    // --- Reporting Central call detail ---

    // Transcript lines sent to the detail panel (the record has the rest).
    const CALL_DETAIL_LINES = 6;
    const CALL_DETAIL_COLUMNS = [
        'title', 'company', 'contact', 'phone', 'startdate', 'assigned',
        'custevent_ctc_call_sid', 'custevent_ctc_call_started', 'custevent_ctc_duration',
        'custevent_ctc_call_status', 'custevent_ctc_inbound', 'custevent_ctc_voicemail',
        'custevent_ctc_satisfaction', 'custevent_ctc_tone_keywords', 'custevent_ctc_ai_summary',
        'custevent_ctc_transcript', 'custevent_ctc_recording_url'
    ];
    // Select fields come back as [{ value, text }] (the lookupFields shape).
    const CALL_DETAIL_SELECTS = ['company', 'contact', 'assigned'];

    /**
     * The Phone Call's detail fields in the lookupFields shape. record.load,
     * not lookupFields: the long-text fields (transcript, summary) failed
     * through lookupFields live (2026-11-02), and the record panel already
     * reads them this way.
     * @param {string} callId
     * @returns {Object}
     */
    const readCallDetailFields = (callId) => {
        const rec = record.load({ type: record.Type.PHONE_CALL, id: callId });
        const f = {};
        CALL_DETAIL_COLUMNS.forEach((id) => {
            const value = rec.getValue({ fieldId: id });
            if (CALL_DETAIL_SELECTS.indexOf(id) !== -1) {
                f[id] = value ? [{ value: String(value), text: String(rec.getText({ fieldId: id }) || '') }] : [];
            } else if (id === 'startdate' && value instanceof Date) {
                f[id] = rec.getText({ fieldId: id }) || '';
            } else {
                f[id] = value;
            }
        });
        return f;
    };

    // Statuses that already say how an unanswered call ended.
    const UNANSWERED_STATUSES = ['Missed', 'No answer', 'Too short'];

    // lookupFields gives select fields as [{ value, text }].
    const selectValue = (v) => (Array.isArray(v) ? (v.length ? String(v[0].value || '') : '') : String(v || ''));
    const selectText = (v) => (Array.isArray(v) ? (v.length ? String(v[0].text || '') : '') : String(v || ''));

    /**
     * Transcript line → { speaker: 'rep' | 'customer' | '', text } from the
     * stored "[REP] …" / "[CUSTOMER] …" form (formatTranscript).
     * @param {string} line
     * @returns {{speaker: string, text: string}}
     */
    const transcriptLine = (line) => {
        const m = String(line).match(/^\[(REP|CUSTOMER)\]\s*/);
        if (!m) return { speaker: '', text: String(line) };
        return { speaker: m[1] === 'REP' ? 'rep' : 'customer', text: String(line).slice(m[0].length) };
    };

    /**
     * getCallDetail — one Phone Call for Reporting Central's call detail.
     * Open to any internal user (like Reporting Central's list) and scoped
     * exactly as that list (lib/ctc_rc_scope.js resolveOwnerScope with the
     * page's `owner`): a CTC call (custevent_ctc_call_sid set) that is
     *   - own calls (reps; a manager's "me"): its company is in the session
     *     user's book (primary sales rep OR Sales Team member);
     *   - team / member (managers): its `assigned` employee is in the
     *     resolved team / member.
     * Anything else, and a call that does not exist, answers
     * { error: 'not_found' }, so the answer never tells whether a call
     * exists. The team is read fresh for each request.
     * `status` is the effective status: a call with no talk time and no
     * reconciled status reads 'Missed' (inbound) or 'No answer'
     * (outbound), the list's rule (ctcHtml.unansweredRule). A voicemail is
     * never scored (satisfaction null).
     * Cost: lookupFields (1) + team SuiteQL (10) + book SuiteQL (10, own
     * calls only) + pending task search (10) = 21-31 units (no stage
     * lookup: skipEntityType).
     *
     * @param {Object} body
     * @param {string|number} body.callId - Phone Call internal id
     * @param {string} [body.owner] - the page's owner param ('team' | 'me' | <employee id>)
     * @returns {Object} { call, tasks } or { error }
     */
    const getCallDetail = (body) => {
        try {
            const callId = String(body.callId == null ? '' : body.callId).trim();
            if (!/^[0-9]{1,12}$/.test(callId)) return { error: 'callId required' };
            const user = runtime.getCurrentUser();
            const userId = user.id;

            let f;
            try {
                f = readCallDetailFields(callId);
            } catch (e) {
                // No such record (or not readable): the same answer as out of scope.
                log.audit({ title: 'CTC getCallDetail read failed', details: 'callId=' + callId + ' ' + ((e && e.message) || String(e)) });
                return { error: 'not_found' };
            }
            if (!f.custevent_ctc_call_sid) return { error: 'not_found' };
            const companyId = selectValue(f.company);
            const ownerId = selectValue(f.assigned);

            rcScope.clearTeamCache();
            const scope = rcScope.resolveOwnerScope({
                userId: userId, role: user.role, owner: typeof body.owner === 'string' ? body.owner : ''
            });
            if (scope.ownerIds) {
                if (!ownerId || scope.ownerIds.indexOf(ownerId) === -1) return { error: 'not_found' };
            } else {
                if (!companyId) return { error: 'not_found' };
                const book = workspaceQueries.getBookCustomerIds({ userId: userId });
                if (book.indexOf(companyId) === -1) return { error: 'not_found' };
            }

            const voicemail = isChecked(f.custevent_ctc_voicemail);
            const direction = isChecked(f.custevent_ctc_inbound) ? 'inbound' : 'outbound';
            const duration = parseInt(f.custevent_ctc_duration, 10) || 0;
            let status = String(f.custevent_ctc_call_status || '');
            if (!voicemail && duration <= 0 && UNANSWERED_STATUSES.indexOf(status) === -1) {
                status = direction === 'inbound' ? 'Missed' : 'No answer';
            }
            const lines = String(f.custevent_ctc_transcript || '').split(/\n|<br\s*\/?>/).filter((l) => l.trim());

            // The panel never shows the stage: skip that lookup.
            const tasks = workspaceQueries.loadTaskGroups({ userId: userId, phoneCallId: callId, tab: 'pending', skipEntityType: true });
            const pending = [];
            (tasks.groups || []).forEach((g) => (g.tasks || []).forEach((t) => {
                pending.push({ id: String(t.id), text: t.text || '', proposedDue: t.proposedDue || '' });
            }));

            const out = {
                call: {
                    id: callId,
                    title: workspaceQueries.displayCallTitle(f.title),
                    companyId: companyId,
                    companyName: selectText(f.company),
                    contactName: selectText(f.contact),
                    ownerId: ownerId,
                    ownerName: selectText(f.assigned),
                    phone: String(f.phone || ''),
                    date: String(f.startdate || ''),
                    startedAt: String(f.custevent_ctc_call_started || ''),
                    direction: direction,
                    duration: duration,
                    status: status,
                    voicemail: voicemail,
                    satisfaction: voicemail ? null : (parseInt(f.custevent_ctc_satisfaction, 10) || null),
                    toneKeywords: String(f.custevent_ctc_tone_keywords || ''),
                    summary: String(f.custevent_ctc_ai_summary || ''),
                    transcriptLines: lines.slice(0, CALL_DETAIL_LINES).map(transcriptLine),
                    transcriptLineCount: lines.length,
                    recordingUrl: String(f.custevent_ctc_recording_url || ''),
                    recordUrl: '/app/crm/calendar/call.nl?id=' + callId
                },
                tasks: pending
            };
            // The panel says so instead of "None from this call."
            if (tasks.error) out.tasksError = true;
            return out;
        } catch (e) {
            log.error({ title: 'CTC getCallDetail Failed', details: (e && e.message) || String(e) });
            return { error: 'Call detail failed' };
        }
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
     * `lastCalled` is the session user's most recent Phone Call to this
     * record in the last 90 days with a number on it
     * (workspaceQueries.lastCallForRecord): contactId ('' when the call had
     * no contact), number (Phone Call `phone`), at
     * (custevent_ctc_call_started, ISO UTC; '' on older calls). null when
     * there is none or the search fails (logged; the rows still return).
     * Governance: contacts search (10) + one customer lookupFields (1) +
     * one Phone Call search (10) = 21 units.
     *
     * @param {Object} body
     * @param {string|number} body.entityId
     * @param {Object<string, number>} [steps] - perf step timings (post)
     * @returns {{rows: Array<Object>, lastCalled: ({contactId: string, number: string, at: string}|null)}|{error: string, rows: Array}}
     */
    const softphoneContacts = (body, steps) => {
        const entityId = body.entityId;
        if (!entityId) return { error: 'entityId required', rows: [] };
        const perf = steps || {};

        const contacts = timeStep(perf, 'contacts', () => ctcEntity.getContactsAtEntity(entityId));

        // Mirror the Suitelet's record-launch behavior: when the entity
        // has a record-level phone (company switchboard / customer main
        // line), prepend a synthetic "Company main" entry so reps can
        // reach the switchboard from this picker too. Without this, the
        // dashboard → search → select-Customer path was missing the
        // main line that the direct-toolbar-launch path showed.
        // One customer lookupFields (customer, prospect and lead share the
        // customer record). It throws for an id that is not a customer
        // (a contact, a vendor): then there is no main line (debug log
        // only, as when the old type probe failed).
        let main = null;
        try {
            main = timeStep(perf, 'mainLine', () => search.lookupFields({
                type: search.Type.CUSTOMER,
                id: entityId,
                columns: ['phone', 'companyname', 'entityid']
            }));
        } catch (e) {
            log.debug({ title: 'CTC softphoneContacts no customer main line',
                        details: (e && e.message) || String(e) });
        }
        const phone = (main && main.phone) || '';
        const name = (main && (main.companyname || main.entityid)) || '';
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

        let lastCalled = null;
        try {
            lastCalled = timeStep(perf, 'lastCalled', () => workspaceQueries.lastCallForRecord({
                userId: runtime.getCurrentUser().id,
                entityId: entityId,
                days: 90
            }));
        } catch (e) {
            log.error({ title: 'CTC softphoneContacts last-called lookup failed',
                        details: e.message || String(e) });
            lastCalled = null;
        }

        return { rows: contacts, lastCalled: lastCalled };
    };

    /**
     * softphoneRecents — Iteration B Phase 5.
     * Returns the current rep's recent Phone Calls for the Recents tab AND
     * the last-3-dialed shortcut on the empty Dial home. Reuses
     * workspaceQueries.loadHistoryRows with a last-7-days default; client-side
     * direction filter chips (All / Missed / Outbound / Inbound) filter the
     * returned rows in the popup.
     *
     * Each row also carries `outcome` (workspaceQueries.dockOutcomeOf:
     * summary_ready | summarizing | too_short | missed | no_answer |
     * voicemail | failed | null) and `followUps` (pending proposed tasks on
     * that Phone Call): one more proposed-task search for the whole list.
     *
     * Scope: calls to the rep's book, plus the rep's own calls with no
     * company (an unknown number; "Add to NetSuite", DESIGN.md §6), in one
     * search (loadHistoryRows `includeUnlinked`). Every row carries
     * `unknown`: true for a call with no company (companyId '', the
     * dialled or caller number in `phone`), else false.
     * Governance: worst case 40 units, the same as before the unknown
     * rows (book SuiteQL 10 + Phone Call search 10 + stage lookup 10 +
     * proposed-task search 10).
     *
     * @param {Object} body
     * @param {string} [body.dateRange='last7days'] — last7days | today | last30days
     * @param {number} [body.limit=50]
     * @returns {Object} { rows: [...], total } or { error }
     */
    const softphoneRecents = (body) => {
        const result = workspaceQueries.loadHistoryRows({
            userId: runtime.getCurrentUser().id,
            dateRange: body.dateRange || 'last7days',
            limit: body.limit || 50,
            includeUnlinked: true
        });
        if (result && !result.error) workspaceQueries.addDockOutcomes(result.rows);
        return result;
    };

    /**
     * softphoneVoicemails — asset 29: the dock's Voicemail view. The rep's
     * voicemails (custevent_ctc_voicemail T), newest first, in the same
     * scope as softphoneRecents (calls to the rep's book). Cost: the book
     * query plus one Phone Call search (and the stage lookup).
     * `at` is the call start (custevent_ctc_call_started, ISO UTC), null
     * when the Phone Call has none. The dock marks a voicemail new by
     * comparing `at` with its own seen time; there is no server field.
     *
     * @param {Object} body
     * @param {number} [body.limit=30] - 1 to 50
     * @param {number} [body.days=30] - 1 to 365: calls on or after that many days ago
     * @returns {{rows: Array<{phoneCallId: string, at: (string|null), durationSec: number,
     *   companyId: string, companyName: string, entityType: string, contactName: string,
     *   phone: string, outcome: (string|null), brief: string}>, error?: string}}
     */
    const softphoneVoicemails = (body) => {
        const limit = Math.min(50, Math.max(1, parseInt(String(body.limit || ''), 10) || 30));
        const days = Math.min(365, Math.max(1, parseInt(String(body.days || ''), 10) || 30));
        const result = workspaceQueries.loadHistoryRows({
            userId: runtime.getCurrentUser().id,
            dateFilter: ['startdate', 'onorafter', 'daysago' + days],
            voicemailOnly: true,
            limit: limit
        });
        if (!result || result.error) return { error: (result && result.error) || 'Voicemails fetch failed', rows: [] };
        return {
            employeeId: String(runtime.getCurrentUser().id),
            rows: (result.rows || []).map((r) => ({
                phoneCallId: String(r.id),
                at: r.startedAt || null,
                durationSec: r.duration || 0,
                companyId: r.companyId || '',
                companyName: r.companyName || '',
                entityType: r.entityType || '',
                contactName: r.contactName || '',
                phone: r.phone || '',
                outcome: workspaceQueries.dockOutcomeOf(r),
                brief: r.brief || ''
            }))
        };
    };

    // --- Add to NetSuite (unknown numbers, DESIGN.md §6; lib/ctc_add_to_netsuite) ---

    /**
     * softphoneFindDuplicates — records that already hold this number, and
     * companies with this name, before the rep creates anything. Only
     * `phone` and `companyName` are read from the body.
     * Governance: ≤ 30 units (lib findDuplicates).
     *
     * @param {Object} body
     * @param {string} [body.phone]
     * @param {string} [body.companyName]
     * @returns {Object} lib findDuplicates result: { ok: true, byPhone, byName }
     *   or { ok: false, error, message }
     */
    const softphoneFindDuplicates = (body) => addToNetSuite.findDuplicates({
        phone: body.phone,
        companyName: body.companyName
    });

    /**
     * The write per softphoneAddToNetSuite mode. Each passes only its own
     * whitelisted body fields to the lib (never the body itself).
     */
    const ADD_TO_NETSUITE_MODES = {
        existingContact: (b) => addToNetSuite.addToExistingContact({
            contactId: b.contactId, phone: b.phone, field: b.field, makeMain: b.makeMain
        }),
        newContact: (b) => addToNetSuite.newContactAtCompany({
            companyId: b.companyId, firstName: b.firstName, lastName: b.lastName,
            title: b.title, phone: b.phone, makeMain: b.makeMain
        }),
        newCompany: (b) => addToNetSuite.newCompany({
            companyName: b.companyName, firstName: b.firstName, lastName: b.lastName,
            phone: b.phone, status: b.status
        })
    };

    /**
     * softphoneAddToNetSuite — put an unknown number into NetSuite and
     * link the call (DESIGN.md §6). body.mode:
     *   - 'existingContact': contactId, phone, field?, makeMain?
     *   - 'newContact':      companyId, firstName?, lastName?, title?, phone, makeMain?
     *   - 'newCompany':      companyName, firstName?, lastName?, phone, status? ('lead' | 'prospect')
     *   - 'logOnly':         phoneCallId (required); writes nothing
     * Other modes → { ok: false, error: 'invalid' }.
     * With body.phoneCallId, a successful write then links the Phone Call
     * to the result's companyId / contactId (lib linkPhoneCall). The
     * answer is the lib result plus `linked` (true / false; false when no
     * phoneCallId was given) and, when the link fails, `linkError` (its
     * error code). A failed link does not undo the write: `ok` stays true.
     * A failed write returns the lib failure as it is (no link attempt).
     * Governance: ≤ 46 units (write ≤ 30 + link ≤ 16); logOnly 1.
     *
     * @param {Object} body
     * @returns {Object} { ok: true, ...lib result, linked, linkError? }
     *   | lib logOnly result | { ok: false, error, message }
     */
    const softphoneAddToNetSuite = (body) => {
        const mode = body.mode;
        if (mode === 'logOnly') {
            if (!body.phoneCallId) return { ok: false, error: 'invalid', message: 'The call is missing.' };
            return addToNetSuite.logOnly({ phoneCallId: body.phoneCallId });
        }
        if (typeof mode !== 'string' || !Object.prototype.hasOwnProperty.call(ADD_TO_NETSUITE_MODES, mode)) {
            return { ok: false, error: 'invalid', message: 'Pick where the number goes.' };
        }
        const result = ADD_TO_NETSUITE_MODES[mode](body);
        if (!result || result.ok !== true) return result;

        const out = Object.assign({}, result, { linked: false });
        if (!body.phoneCallId) return out;
        const link = addToNetSuite.linkPhoneCall({
            phoneCallId: body.phoneCallId,
            companyId: result.companyId || '',
            contactId: result.contactId || ''
        });
        if (link && link.ok === true) {
            out.linked = true;
        } else {
            out.linkError = (link && link.error) || 'failed';
        }
        return out;
    };

    /**
     * softphoneAccountSnapshot — Iteration B Phase 6.
     * Returns the account rollup (outstanding / open opps / last activity)
     * for an entity: the dock dialer's insight line and live-call tiles.
     *
     * @param {Object} body
     * @param {string|number} body.entityId
     * @param {Object<string, number>} [steps] - perf step timings (post)
     * @returns {Object} {outstanding, openOpps, lastActivity} or {error}
     */
    const softphoneAccountSnapshot = (body, steps) => {
        if (!body.entityId) return { error: 'entityId required' };
        return workspaceQueries.getAccountSnapshot({ entityId: body.entityId, perfSteps: steps });
    };

    /**
     * softphoneCallContext — asset 38 call screen account context
     * (workspaceQueries.getCallContext): outstanding, lastTouchDays,
     * orders90, activity (max 4), followUps (max 3). `errors` (the
     * sources that failed) only with body.perf === true.
     * Governance: 70 units (7 searches) + the gate.
     *
     * @param {Object} body
     * @param {string|number} body.entityId
     * @param {string|number} [body.contactId]
     * @param {Object<string, number>} [steps] - perf step timings (post)
     * @returns {Object}
     */
    const softphoneCallContext = (body, steps) => {
        if (!body.entityId) return { error: 'entityId required' };
        const out = workspaceQueries.getCallContext({
            userId: runtime.getCurrentUser().id,
            entityId: body.entityId,
            contactId: body.contactId,
            steps: steps
        });
        if (body.perf !== true) delete out.errors;
        return out;
    };

    /**
     * approveProposedTask — materialize a proposed_task as a native NetSuite Task,
     * then mark the proposed_task as Approved with audit trail.
     *
     * @param {Object} body
     * @param {string} body.taskId           - proposed_task internal ID
     * @param {Object} [body.edits]          - optional edits before approval (readApproveEdits)
     * @param {string} [body.edits.text]
     * @param {string} [body.edits.dueDate]  - YYYY-MM-DD (older name: due)
     * @param {string} [body.edits.assigneeId] - employee internal ID (older name: assignee);
     *                                         the call owner, the customer's sales rep, or the approver's team
     * @param {string} [body.edits.priority] - HIGH | MEDIUM | LOW
     * @returns {Object} { ok: true, nativeTaskId } or { error } (forbidden, already_actioned,
     *                   invalid_text, invalid_due, invalid_assignee, invalid_priority)
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

    const isAdministrator = () => {
        try {
            // Administrator role id is 3.
            return String(runtime.getCurrentUser().role) === '3';
        } catch (e) {
            return false;
        }
    };

    /**
     * The source call's owner: the Phone Call's `assigned` employee (the
     * owner Reporting Central's team view scopes by), or ''.
     * @param {string|number} sourceCallId
     * @returns {string}
     */
    const getCallOwnerForCall = (sourceCallId) => {
        if (!sourceCallId) return '';
        try {
            const f = search.lookupFields({ type: search.Type.PHONE_CALL, id: sourceCallId, columns: ['assigned'] });
            return selectValue(f && f.assigned);
        } catch (e) {
            log.error({ title: 'CTC call owner lookup failed', details: (e && e.message) || String(e) });
            return '';
        }
    };

    /**
     * The user's team as Reporting Central reads it (lib/ctc_rc_scope.js
     * loadTeam: the active employees they supervise; for an Administrator
     * every active phone user). Cached for the request (post() clears it).
     * @param {string|number} userId
     * @param {boolean} asAdmin
     * @returns {Array<string>} employee ids
     */
    const teamIdsOf = (userId, asAdmin) =>
        rcScope.loadTeam({ userId: parseInt(String(userId), 10), isAdmin: asAdmin }).map((m) => m.id);

    /**
     * The one access rule for follow-up actions (approve, dismiss, bulk
     * approve, complete):
     *   - an Administrator;
     *   - the sales rep of the source call's customer (customer.salesrep);
     *   - a manager, for a call owned (Phone Call `assigned`) by an active
     *     employee they supervise (Reporting Central's team).
     * Never anyone else: a manager outside their team is refused.
     * Cost: 2 lookups (1 unit each); the manager rule adds 1 lookup and the
     * team SuiteQL (10 units, once per request).
     * @param {string|number} sourceCallId
     * @param {string|number} userId
     * @returns {boolean}
     */
    const isAuthorizedForProposedTask = (sourceCallId, userId) => {
        if (isAdministrator()) return true;
        const srepId = getCustomerSalesRepForCall(sourceCallId);
        if (srepId !== '' && srepId === String(userId)) return true;
        const ownerId = getCallOwnerForCall(sourceCallId);
        return ownerId !== '' && ownerId !== String(userId) && teamIdsOf(userId, false).indexOf(ownerId) !== -1;
    };

    const PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'];
    const MAX_TASK_TEXT = 4000;

    /**
     * Read and validate the edits sent with an approval. Every field is
     * optional; empty means "keep". `due` / `assignee` are older names for
     * `dueDate` / `assigneeId`.
     *   text       - trimmed, at most 4000 characters (else invalid_text)
     *   dueDate    - a real YYYY-MM-DD date (else invalid_due)
     *   assigneeId - an employee id (digits; else invalid_assignee); who may
     *                be chosen is checked by isAllowedAssignee
     *   priority   - HIGH | MEDIUM | LOW, any case (else invalid_priority)
     * @param {*} raw - body.edits
     * @returns {{edits?: {text: string, due: (Date|null), assigneeId: string, priority: string}, error?: string}}
     */
    const readApproveEdits = (raw) => {
        const e = raw && typeof raw === 'object' ? raw : {};
        const blank = (v) => v == null || String(v).trim() === '';
        const out = { text: '', due: null, assigneeId: '', priority: '' };
        if (!blank(e.text)) {
            out.text = String(e.text).trim();
            if (out.text.length > MAX_TASK_TEXT) return { error: 'invalid_text' };
        }
        const due = !blank(e.dueDate) ? e.dueDate : e.due;
        if (!blank(due)) {
            const iso = rcScope.isoDate(String(due).trim());
            if (!iso) return { error: 'invalid_due' };
            out.due = parseDateLocal(iso);
        }
        const who = !blank(e.assigneeId) ? e.assigneeId : e.assignee;
        if (!blank(who)) {
            out.assigneeId = String(who).trim();
            if (!/^[0-9]{1,12}$/.test(out.assigneeId)) return { error: 'invalid_assignee' };
        }
        if (!blank(e.priority)) {
            out.priority = String(e.priority).trim().toUpperCase();
            if (PRIORITIES.indexOf(out.priority) === -1) return { error: 'invalid_priority' };
        }
        return { edits: out };
    };

    /**
     * Who an approver may give the Task to: the source call's owner, the
     * customer's sales rep (the default), or someone in the approver's team
     * (lib/ctc_rc_scope.js: the people they supervise; for an Administrator
     * every active phone user).
     * @param {string} assigneeId
     * @param {{userId: (string|number), callOwnerId: string, salesRepId: string}} ctx
     * @returns {boolean}
     */
    const isAllowedAssignee = (assigneeId, ctx) => {
        if (assigneeId === ctx.callOwnerId || assigneeId === ctx.salesRepId) return true;
        return teamIdsOf(ctx.userId, isAdministrator()).indexOf(assigneeId) !== -1;
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

            // Edits (validated before anything is written); applied to the
            // proposed_task too, so the audit trail has what was approved.
            const read = readApproveEdits(body.edits);
            if (read.error) return { error: read.error };
            const editsText = read.edits.text;
            const editsDue = read.edits.due;
            const editsAssignee = read.edits.assigneeId;
            const editsPriority = read.edits.priority;

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
            if (editsAssignee && !isAllowedAssignee(editsAssignee, {
                userId: userId, salesRepId: customerSalesRepId, callOwnerId: getCallOwnerForCall(sourceCallId)
            })) {
                return { error: 'invalid_assignee' };
            }
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
            if (editsPriority) task.setValue({ fieldId: 'priority', value: editsPriority });
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
     * field writes + edit validation all apply uniformly. Per-task failures don't
     * abort the batch.
     *
     * @param {Object} body
     * @param {Array<{taskId: string, edits?: Object}>} [body.items] — each task with its own
     *        edits (Reporting Central sends each task's assigneeId: its call's owner);
     *        wins over taskIds
     * @param {Array<string>} [body.taskIds] — proposed_task IDs to approve without edits
     *        (max 25 per batch either way)
     * @returns {Object} { ok, approved, failed, results } or { error }
     */
    const bulkApproveProposedTasks = (body) => {
        try {
            const items = Array.isArray(body.items)
                ? body.items.filter((i) => i && typeof i === 'object' && i.taskId).map((i) => ({ taskId: i.taskId, edits: i.edits }))
                : (Array.isArray(body.taskIds) ? body.taskIds : []).map((id) => ({ taskId: id }));
            if (!items.length) return { error: 'taskIds required' };
            // Cap to stay well under RESTlet governance — each approve costs roughly
            // 30 units (load + Task create + save).
            if (items.length > 25) return { error: 'batch_too_large', limit: 25 };

            const results = items.map((item) => {
                try {
                    const r = approveProposedTask({ taskId: item.taskId, edits: item.edits });
                    return Object.assign({ taskId: item.taskId }, r);
                } catch (e) {
                    return { taskId: item.taskId, error: (e && e.message) || String(e) };
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

    /**
     * completeFollowUpTask — mark the NetSuite Task an approved follow-up
     * created as Completed (Reporting Central "Mark complete"), and flag the
     * proposed_task completed (+ date). Same access rule as approve.
     *
     * @param {Object} body
     * @param {string} body.taskId - proposed_task internal ID
     * @returns {Object} { ok: true, nativeTaskId } or { error } (taskId required, not_a_task,
     *                   already_actioned, forbidden, Complete failed)
     */
    const completeFollowUpTask = (body) => {
        try {
            if (!body.taskId) return { error: 'taskId required' };
            const userId = runtime.getCurrentUser().id;
            const pt = record.load({ type: 'customrecord_ctc_proposed_task', id: body.taskId, isDynamic: false });
            const statusText = pt.getText ? pt.getText({ fieldId: 'custrecord_ctc_pt_status' }) : '';
            const nativeTaskId = selectValue(pt.getValue({ fieldId: 'custrecord_ctc_pt_created_task' }));
            if (statusText !== 'Approved' || !nativeTaskId) return { error: 'not_a_task' };
            if (isChecked(pt.getValue({ fieldId: 'custrecord_ctc_pt_task_completed' }))) return { error: 'already_actioned' };
            if (!isAuthorizedForProposedTask(pt.getValue({ fieldId: 'custrecord_ctc_pt_phone_call' }), userId)) {
                return { error: 'forbidden' };
            }
            record.submitFields({
                type: record.Type.TASK,
                id: nativeTaskId,
                values: { status: 'COMPLETE' },
                options: { ignoreMandatoryFields: true }
            });
            pt.setValue({ fieldId: 'custrecord_ctc_pt_task_completed', value: true });
            pt.setValue({ fieldId: 'custrecord_ctc_pt_task_completed_date', value: new Date() });
            pt.save({ ignoreMandatoryFields: true });
            return { ok: true, nativeTaskId: nativeTaskId };
        } catch (e) {
            log.error({ title: 'CTC completeFollowUpTask Failed', details: (e && e.message) || String(e) });
            return { error: 'Complete failed' };
        }
    };

    // Follow-up actions (open to any internal user; each checks
    // isAuthorizedForProposedTask per task).
    const FOLLOW_UP_ACTIONS = {
        approveProposedTask: approveProposedTask,
        bulkApproveProposedTasks: bulkApproveProposedTasks,
        rejectProposedTask: rejectProposedTask,
        completeFollowUpTask: completeFollowUpTask
    };

    return { post };
});
