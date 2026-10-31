// @ts-check
/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Twilio call reconciliation. Twilio is the source of truth for calls.
 *
 * Only the browser logs calls (RESTlet logCall at hang-up). A call shorter
 * than 3 s, a missed inbound call (no answer, caller hung up, no phone
 * open) and a call cut off by a tab crash or reload leave no Phone Call.
 * The transcript poller calls reconcileCalls() once per run. It lists the
 * Twilio calls that ended since the watermark and creates the Phone Calls
 * that are missing. No webhooks (CLAUDE.md): polling only.
 *
 * Browser legs only:
 *   - inbound:  `to` is 'client:<employeeId>' (the leg Studio rang). The
 *               browser stores THIS leg's SID (call.parameters.CallSid of
 *               an incoming call). Its parent is the caller's leg.
 *   - outbound: `from` is 'client:<employeeId>' (the call the browser
 *               placed). The browser stores THIS (parent) SID. Its child
 *               leg (<Dial>) is the call to the dialed number.
 * A call is already logged when a Phone Call has its own SID, or (inbound)
 * its parent SID, or (outbound) one of its child SIDs.
 *
 * Duplicates: a call is created only when its end_time is 5 min old (the
 * browser fast path has finished), after a batch check per page and a
 * second check right before the create. A SID is handled once per run.
 *
 * Watermark (config custrecord_ctc_recon_watermark, ISO UTC): every
 * browser call that ended before it is reconciled. It moves only after a
 * complete run (all pages read, no governance stop), to the settle cutoff
 * (now - 5 min), but never past the end of a call whose create failed.
 * The next run starts 15 min before the watermark, never more than 7 days
 * back (also the first-run lookback).
 */
// eslint-disable-next-line suitescript/no-log-module
define(['N/query', 'N/record', 'N/search', 'N/runtime', 'N/log', './ctc_transcript_utils', './ctc_workspace_queries'],
       (query, record, search, runtime, log, utils, workspaceQueries) => {

    const TWILIO_HOST = 'https://api.twilio.com';
    const PAGE_SIZE = 100;
    const CHILD_PAGE_SIZE = 20;
    const OVERLAP_MS = 15 * 60 * 1000;
    const SETTLE_MS = 5 * 60 * 1000;
    const MAX_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
    const MIN_LOG_SECONDS = 3;
    // Safety cap on pages per run (100 calls each). Walking a page of
    // already-logged calls costs about 20 units, so MAX_UNITS binds first.
    const MAX_PAGES = 200;
    const SQL_CHUNK = 200;

    // Governance. Per page: 1 https.get (10) + 1 SuiteQL (10). Per created
    // call: re-check SuiteQL (10) + employee lookupFields (1) + 1 https.get
    // for the child / parent leg (10) + lookupCallerByPhone (3 SuiteQL, 30)
    // + record.create/save (15) = about 70 units. The pass starts only with
    // START_MIN_UNITS left, stops before the next page or call when fewer
    // than STOP_UNITS are left, and uses at most MAX_UNITS per run.
    const START_MIN_UNITS = 2000;
    const STOP_UNITS = 1000;
    const MAX_UNITS = 5000;

    const TERMINAL_CALL_STATUSES = ['completed', 'busy', 'no-answer', 'canceled', 'failed'];
    const CLIENT_PREFIX = 'client:';
    const CALL_SID_PATTERN = /^CA[A-Za-z0-9]{32}$/;
    const PHONE_PATTERN = /^\+?[0-9]{7,15}$/;
    const REP_ID_PATTERN = /^[0-9]{1,10}$/;

    /**
     * Browser leg of a Twilio call, or null for every other leg.
     * @param {Object} call - Twilio Call resource
     * @returns {{direction: string, identity: string}|null}
     */
    const classifyLeg = (call) => {
        const to = String((call && call.to) || '');
        const from = String((call && call.from) || '');
        if (to.indexOf(CLIENT_PREFIX) === 0) return { direction: 'inbound', identity: to.slice(CLIENT_PREFIX.length) };
        if (from.indexOf(CLIENT_PREFIX) === 0) return { direction: 'outbound', identity: from.slice(CLIENT_PREFIX.length) };
        return null;
    };

    const durationOf = (call) => {
        const n = parseInt(String((call && call.duration) || ''), 10);
        return isNaN(n) || n < 0 ? 0 : n;
    };

    /**
     * Status for a call the browser did not log.
     *   - not answered (status other than completed, or 0 s): inbound
     *     'Missed', outbound 'No answer'
     *   - completed, under 3 s: 'Too short'
     *   - completed, 3 s or more: 'Logged' (the transcript pass takes it)
     * Outbound passes the dialed child leg's status and duration.
     */
    const mapStatus = (direction, legStatus, durationSec) => {
        const answered = legStatus === 'completed' && durationSec > 0;
        if (!answered) return direction === 'inbound' ? utils.CALL_STATUS.MISSED : utils.CALL_STATUS.NO_ANSWER;
        if (durationSec < MIN_LOG_SECONDS) return utils.CALL_STATUS.TOO_SHORT;
        return utils.CALL_STATUS.LOGGED;
    };

    /** 'YYYY-MM-DD' (UTC) of an epoch ms. */
    const isoDate = (ms) => new Date(ms).toISOString().slice(0, 10);

    /** Watermark ISO string → epoch ms, or null when blank / unreadable. */
    const parseWatermark = (value) => {
        const s = String(value || '').trim();
        if (!s) return null;
        const ms = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T/.test(s) ? Date.parse(s) : NaN;
        if (isNaN(ms)) {
            log.error({ title: 'CTC Recon watermark unreadable', details: s });
            return null;
        }
        return ms;
    };

    const phoneOf = (value) => {
        const s = String(value || '').trim();
        return PHONE_PATTERN.test(s) ? s : '';
    };

    /** '+15551234567' → '(555) 123-4567'; other numbers as they are. */
    const formatNumber = (number) => {
        const m = String(number || '').match(/^\+1([0-9]{3})([0-9]{3})([0-9]{4})$/);
        return m ? `(${m[1]}) ${m[2]}-${m[3]}` : String(number || '');
    };

    const cleanName = (value) => {
        // eslint-disable-next-line no-control-regex
        return String(value || '').replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, 120);
    };

    const titleFor = (direction, status, label) => {
        if (status === utils.CALL_STATUS.MISSED) return `Missed call from ${label}`;
        if (status === utils.CALL_STATUS.NO_ANSWER) return `No answer: ${label}`;
        return direction === 'inbound' ? `Inbound call from ${label}` : `Call to ${label}`;
    };

    /**
     * Next-page URL from Twilio's relative next_page_uri. Only a path under
     * this account on api.twilio.com is followed (the auth header goes
     * with it); anything else gives ''.
     */
    const nextPageUrl = (nextPageUri, accountSid) => {
        const uri = String(nextPageUri || '');
        const prefix = `/2010-04-01/Accounts/${accountSid}/Calls.json?`;
        return uri.indexOf(prefix) === 0 ? TWILIO_HOST + uri : '';
    };

    /**
     * Map SID → Phone Call internal id for the SIDs that already have a
     * Phone Call (custevent_ctc_call_sid). SuiteQL with bind params, in
     * chunks. custevent_ctc_call_sid is a Long Text (CLOBTEXT) field;
     * TO_CHAR keeps the IN comparison valid on a CLOB column. Throws on a
     * query error (the caller stops the pass: no create without a check).
     *
     * @param {Array<string>} sids
     * @returns {Object<string, string>}
     */
    const findLoggedSids = (sids) => {
        const unique = [];
        const seen = {};
        (sids || []).forEach((sid) => {
            const s = String(sid || '');
            if (CALL_SID_PATTERN.test(s) && !seen[s]) {
                seen[s] = true;
                unique.push(s);
            }
        });
        /** @type {Object<string, string>} */
        const found = {};
        for (let i = 0; i < unique.length; i += SQL_CHUNK) {
            const chunk = unique.slice(i, i + SQL_CHUNK);
            const sql = 'SELECT id, TO_CHAR(custevent_ctc_call_sid) AS callsid FROM phonecall ' +
                        'WHERE TO_CHAR(custevent_ctc_call_sid) IN (' + chunk.map(() => '?').join(', ') + ')';
            query.runSuiteQL({ query: sql, params: chunk }).asMappedResults().forEach((r) => {
                found[String(r.callsid)] = String(r.id);
            });
        }
        return found;
    };

    const anyLogged = (sids, logged) => sids.some((sid) => !!logged[sid]);

    /**
     * Run state shared by the page loop and the per-call steps.
     * @typedef {Object} ReconCtx
     * @property {Object} config
     * @property {*} authHeader
     * @property {number} windowStartMs
     * @property {number} cutoffMs
     * @property {number} startUnits
     * @property {Object<string, boolean>} handled
     * @property {Object<string, boolean>} activeReps
     * @property {Object} stats
     * @property {string} stopped
     * @property {number|null} earliestFailedEndMs
     */

    const remainingUnits = () => runtime.getCurrentScript().getRemainingUsage();

    /** @param {ReconCtx} ctx */
    const budgetLow = (ctx) => {
        const left = remainingUnits();
        return left < STOP_UNITS || (ctx.startUnits - left) >= MAX_UNITS;
    };

    /** True when `repId` is an active employee. Cached per run. */
    const isActiveEmployee = (repId, ctx) => {
        if (Object.prototype.hasOwnProperty.call(ctx.activeReps, repId)) return ctx.activeReps[repId];
        let active = false;
        try {
            const res = search.lookupFields({ type: search.Type.EMPLOYEE, id: repId, columns: ['isinactive'] });
            const inactive = res && res.isinactive;
            active = !!res && !(inactive === true || inactive === 'T');
        } catch (e) {
            // No such employee (or not readable): not a rep.
            active = false;
        }
        ctx.activeReps[repId] = active;
        return active;
    };

    /**
     * Child legs of an outbound browser call (the <Dial> to the number):
     * GET Calls.json?ParentCallSid=<sid>. Returns an array or
     * TRANSIENT_ERROR. A 404 / other 4xx gives [].
     */
    const fetchChildLegs = (sid, ctx) => {
        const url = `${utils.TWILIO_API_BASE}/${ctx.config.accountSid}/Calls.json?ParentCallSid=${sid}&PageSize=${CHILD_PAGE_SIZE}`;
        const body = utils.getTwilioJson(url, ctx.authHeader, 'CTC Recon Child Legs');
        if (utils.isTransientError(body)) return body;
        const calls = (body && body.calls) || [];
        return Array.isArray(calls) ? calls.filter((c) => c && c.parent_call_sid === sid) : [];
    };

    /** The answered child leg with the longest talk time, else the first. */
    const pickChild = (children) => {
        const answered = children
            .filter((c) => c.status === 'completed' && durationOf(c) > 0)
            .sort((a, b) => durationOf(b) - durationOf(a));
        return answered[0] || children[0] || null;
    };

    /**
     * Facts the Phone Call needs, or { transient: true } when Twilio could
     * not be read (the call is retried next run).
     * @param {{call: Object, leg: {direction: string}}} cand
     * @param {Object<string, Object>} pageBySid - calls on this page by SID
     * @param {ReconCtx} ctx
     */
    const gatherDetails = (cand, pageBySid, ctx) => {
        const call = cand.call;
        if (cand.leg.direction === 'inbound') {
            const parentSid = CALL_SID_PATTERN.test(String(call.parent_call_sid || '')) ? call.parent_call_sid : '';
            // Studio sets caller_id to the caller, so the leg's `from` is
            // the caller's number. Else read it from the parent call.
            let number = phoneOf(call.from);
            if (!number && parentSid) {
                let parent = pageBySid[parentSid];
                if (!parent) {
                    parent = utils.fetchCall(ctx.config.accountSid, parentSid, ctx.authHeader);
                    if (utils.isTransientError(parent)) return { transient: true };
                }
                number = phoneOf(parent && parent.from);
            }
            const duration = durationOf(call);
            return {
                number: number,
                duration: duration,
                status: mapStatus('inbound', call.status, duration),
                relatedSids: parentSid ? [parentSid] : []
            };
        }

        const children = fetchChildLegs(call.sid, ctx);
        if (utils.isTransientError(children)) return { transient: true };
        const child = pickChild(children);
        const duration = child ? durationOf(child) : 0;
        const legStatus = call.status !== 'completed' ? call.status : (child ? child.status : 'no-child');
        return {
            number: phoneOf(child && child.to),
            duration: duration,
            status: mapStatus('outbound', legStatus, duration),
            relatedSids: children.map((c) => String(c.sid || ''))
        };
    };

    /** Set company / contact from a lookupCallerByPhone match (logCall rules). */
    const linkEntity = (phoneCall, match) => {
        const numeric = (v) => {
            const n = parseInt(String(v || ''), 10);
            return (isFinite(n) && n > 0 && String(n) === String(v).trim()) ? n : null;
        };
        if (match.entityType === 'contact') {
            const contactId = numeric(match.entityId);
            if (contactId) phoneCall.setValue({ fieldId: 'contact', value: contactId });
            return;
        }
        const companyId = numeric(match.entityId);
        if (companyId) phoneCall.setValue({ fieldId: 'company', value: companyId });
        const contactId = numeric(match.contactId);
        if (contactId) phoneCall.setValue({ fieldId: 'contact', value: contactId });
    };

    const createPhoneCall = (cand, repId, details) => {
        const call = cand.call;
        const inbound = cand.leg.direction === 'inbound';
        let match = null;
        if (details.number) {
            const res = workspaceQueries.lookupCallerByPhone({ userId: repId, phone: details.number });
            match = (res && res.match) || null;
        }
        const label = cleanName(match && match.name) || formatNumber(details.number) || 'unknown';
        const status = details.status;

        const phoneCall = record.create({ type: record.Type.PHONE_CALL, isDynamic: true });
        phoneCall.setValue({ fieldId: 'title', value: titleFor(cand.leg.direction, status, label) });
        phoneCall.setValue({ fieldId: 'status', value: 'COMPLETE' });
        phoneCall.setValue({ fieldId: 'assigned', value: parseInt(repId, 10) });
        if (details.number) phoneCall.setValue({ fieldId: 'phone', value: details.number });
        phoneCall.setValue({ fieldId: 'custevent_ctc_call_sid', value: call.sid });
        phoneCall.setValue({ fieldId: 'custevent_ctc_duration', value: details.duration });
        phoneCall.setValue({ fieldId: 'custevent_ctc_processed', value: status !== utils.CALL_STATUS.LOGGED });
        phoneCall.setValue({ fieldId: 'custevent_ctc_call_status', value: status });
        if (inbound) phoneCall.setValue({ fieldId: 'custevent_ctc_inbound', value: true });

        const startMs = utils.parseTwilioDate(call.start_time);
        if (startMs !== null) {
            try {
                const start = new Date(startMs);
                phoneCall.setValue({ fieldId: 'startdate', value: start });
                phoneCall.setValue({ fieldId: 'starttime', value: start });
            } catch (e) {
                log.error({ title: 'CTC Recon start time not set', details: `${call.sid}: ${(e && e.message) || e}` });
            }
        }
        if (match) linkEntity(phoneCall, match);

        const recordId = phoneCall.save();
        log.audit({
            title: 'CTC Recon Phone Call created',
            details: `callSid=${call.sid} phoneCall=${recordId} status=${status} rep=${repId} direction=${cand.leg.direction}`
        });
        return status;
    };

    const STAT_KEY = {
        'Missed': 'missed',
        'Too short': 'tooShort',
        'No answer': 'noAnswer',
        'Logged': 'logged'
    };

    const markFailed = (cand, ctx) => {
        ctx.stats.errors++;
        if (ctx.earliestFailedEndMs === null || cand.endMs < ctx.earliestFailedEndMs) {
            ctx.earliestFailedEndMs = cand.endMs;
        }
    };

    /**
     * One eligible browser leg that the page check did not find logged.
     * @param {{call: Object, leg: {direction: string, identity: string}, endMs: number}} cand
     * @param {Object<string, Object>} pageBySid
     * @param {ReconCtx} ctx
     */
    const reconcileOne = (cand, pageBySid, ctx) => {
        const repId = cand.leg.identity;
        if (!REP_ID_PATTERN.test(repId) || !isActiveEmployee(repId, ctx)) {
            log.audit({ title: 'CTC Recon skip — not an active employee', details: `callSid=${cand.call.sid} identity=${repId}` });
            ctx.stats.skipped++;
            return;
        }
        const details = gatherDetails(cand, pageBySid, ctx);
        if (details.transient) {
            markFailed(cand, ctx);
            return;
        }
        // Second check right before the create: the browser fast path may
        // have logged the call since the page check.
        const logged = findLoggedSids([cand.call.sid].concat(details.relatedSids));
        if (anyLogged([cand.call.sid].concat(details.relatedSids), logged)) {
            ctx.stats.existing++;
            return;
        }
        const status = createPhoneCall(cand, repId, details);
        ctx.stats.created[STAT_KEY[status]]++;
    };

    /**
     * Eligible browser legs of one page, then the batch check, then each
     * leg not yet logged. Sets ctx.stopped to stop the run.
     * @param {Array<Object>} calls
     * @param {ReconCtx} ctx
     */
    const processPage = (calls, ctx) => {
        const pageBySid = {};
        const childrenByParent = {};
        calls.forEach((c) => {
            if (!c || !c.sid) return;
            pageBySid[c.sid] = c;
            if (c.parent_call_sid) {
                (childrenByParent[c.parent_call_sid] = childrenByParent[c.parent_call_sid] || []).push(String(c.sid));
            }
        });

        const candidates = [];
        calls.forEach((c) => {
            const leg = classifyLeg(c);
            if (!leg) return;
            const sid = String(c.sid || '');
            if (!CALL_SID_PATTERN.test(sid) || ctx.handled[sid]) return;
            if (TERMINAL_CALL_STATUSES.indexOf(c.status) === -1) return;
            const endMs = utils.parseTwilioDate(c.end_time);
            if (endMs === null) {
                log.error({ title: 'CTC Recon end time unreadable', details: `${sid}: ${c.end_time}` });
                ctx.handled[sid] = true;
                ctx.stats.errors++;
                return;
            }
            if (endMs < ctx.windowStartMs || endMs > ctx.cutoffMs) return;
            const related = leg.direction === 'inbound'
                ? (c.parent_call_sid ? [String(c.parent_call_sid)] : [])
                : (childrenByParent[sid] || []);
            candidates.push({ call: c, leg: leg, endMs: endMs, related: related });
        });
        if (!candidates.length) return;
        ctx.stats.seen += candidates.length;

        let logged;
        try {
            const all = [];
            candidates.forEach((cand) => { all.push(cand.call.sid); cand.related.forEach((s) => all.push(s)); });
            logged = findLoggedSids(all);
        } catch (e) {
            log.error({ title: 'CTC Recon existence check failed', details: (e && e.message) || String(e) });
            ctx.stats.errors++;
            ctx.stopped = 'query';
            return;
        }

        for (const cand of candidates) {
            if (budgetLow(ctx)) {
                ctx.stopped = 'governance';
                return;
            }
            ctx.handled[cand.call.sid] = true;
            if (anyLogged([cand.call.sid].concat(cand.related), logged)) {
                ctx.stats.existing++;
                continue;
            }
            try {
                reconcileOne(cand, pageBySid, ctx);
            } catch (e) {
                log.error({ title: 'CTC Recon call failed', details: `${cand.call.sid}: ${(e && e.message) || e}` });
                markFailed(cand, ctx);
            }
        }
    };

    const writeWatermark = (config, ms) => {
        const iso = new Date(ms).toISOString();
        record.submitFields({
            type: 'customrecord_ctc_config',
            id: config.id,
            values: { custrecord_ctc_recon_watermark: iso },
            options: { enableSourcing: false, ignoreMandatoryFields: true }
        });
        return iso;
    };

    /**
     * Create the Phone Calls Twilio has and NetSuite does not.
     *
     * Twilio calls: GET {TWILIO_API_BASE}/{AC}/Calls.json
     *   ?EndTime>=YYYY-MM-DD&PageSize=100 (UTC date of the window start;
     *   the exact window is applied per call), then next_page_uri.
     * EndTime (not StartTime) so a long call that started before the
     * window date is still listed.
     *
     * @param {{config: Object, authHeader: *, nowMs?: number}} opts
     * @returns {{seen: number, existing: number, skipped: number, errors: number,
     *            created: {missed: number, tooShort: number, noAnswer: number, logged: number},
     *            pages: number, complete: boolean, stopped: string, watermark: string}}
     */
    const reconcileCalls = (opts) => {
        const config = opts.config;
        const nowMs = typeof opts.nowMs === 'number' ? opts.nowMs : Date.now();
        const stats = {
            seen: 0, existing: 0, skipped: 0, errors: 0,
            created: { missed: 0, tooShort: 0, noAnswer: 0, logged: 0 },
            pages: 0, complete: false, stopped: '', watermark: String(config.reconWatermark || '')
        };

        const startUnits = remainingUnits();
        if (startUnits < START_MIN_UNITS) {
            stats.stopped = 'governance';
            return stats;
        }

        const oldMs = parseWatermark(config.reconWatermark);
        const floorMs = nowMs - MAX_LOOKBACK_MS;
        /** @type {ReconCtx} */
        const ctx = {
            config: config,
            authHeader: opts.authHeader,
            windowStartMs: Math.max(oldMs === null ? floorMs : oldMs - OVERLAP_MS, floorMs),
            cutoffMs: nowMs - SETTLE_MS,
            startUnits: startUnits,
            handled: {},
            activeReps: {},
            stats: stats,
            stopped: '',
            earliestFailedEndMs: null
        };

        let url = `${utils.TWILIO_API_BASE}/${config.accountSid}/Calls.json` +
                  `?EndTime%3E=${isoDate(ctx.windowStartMs)}&PageSize=${PAGE_SIZE}`;
        /** @type {Object<string, boolean>} */
        const fetched = {};
        while (url) {
            if (budgetLow(ctx)) { ctx.stopped = 'governance'; break; }
            if (stats.pages >= MAX_PAGES) { ctx.stopped = 'page cap'; break; }
            if (fetched[url]) {
                log.error({ title: 'CTC Recon next page repeats', details: url });
                stats.errors++;
                ctx.stopped = 'next page';
                break;
            }
            fetched[url] = true;
            const body = utils.getTwilioJson(url, ctx.authHeader, 'CTC Recon List Calls');
            if (!body || utils.isTransientError(body)) {
                stats.errors++;
                ctx.stopped = 'twilio';
                break;
            }
            stats.pages++;
            processPage(Array.isArray(body.calls) ? body.calls : [], ctx);
            if (ctx.stopped) break;
            const next = body.next_page_uri;
            url = next ? nextPageUrl(next, config.accountSid) : '';
            if (next && !url) {
                log.error({ title: 'CTC Recon next page not followed', details: String(next) });
                stats.errors++;
                ctx.stopped = 'next page';
            }
        }
        stats.stopped = ctx.stopped;
        stats.complete = !ctx.stopped;

        if (stats.complete) {
            let newMs = ctx.cutoffMs;
            if (ctx.earliestFailedEndMs !== null) newMs = Math.min(newMs, ctx.earliestFailedEndMs);
            if (oldMs === null || newMs > oldMs) {
                try {
                    stats.watermark = writeWatermark(config, newMs);
                } catch (e) {
                    log.error({ title: 'CTC Recon watermark write failed', details: (e && e.message) || String(e) });
                    stats.errors++;
                }
            }
        }
        return stats;
    };

    return {
        reconcileCalls,
        classifyLeg,
        mapStatus,
        findLoggedSids,
        nextPageUrl,
        formatNumber,
        START_MIN_UNITS,
        STOP_UNITS,
        MAX_UNITS,
        OVERLAP_MS,
        SETTLE_MS,
        MAX_LOOKBACK_MS
    };
});
