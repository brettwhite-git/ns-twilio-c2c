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
 * Voicemail (2026-11-01). The Studio flow records a voicemail on the
 * caller's (parent) call after an unanswered ring or for an unrouted
 * number (lib/ctc_inbound_routing). Two cases:
 *   - client child leg not answered: its parent call is read (it must have
 *     ended at least 5 min ago, else the leg waits for the next run) and
 *     the parent's recordings are listed. A voicemail recording makes the
 *     Phone Call a voicemail, else it is 'Missed'.
 *   - PSTN parent leg with no client child leg (caller hung up during the
 *     notice, or the number has no route): Twilio direction 'inbound', no
 *     parent, `to` is a number whose VoiceUrl is our Studio flow. 'Missed',
 *     or a voicemail when the parent has a voicemail recording. Deduped on
 *     the parent SID and every child SID.
 * A voicemail Phone Call: status 'Logged' (processed F) with
 * custevent_ctc_voicemail T, title 'Voicemail from <name or number>'. The
 * transcript poller (Phase C) then transcribes it like any logged call and
 * ends it at 'Transcribed' / 'No transcript'; the checkbox stays as the
 * voicemail marker. One transcript path, no new status for the poller.
 *
 * Owner: the client identity (child legs) or the number's primary rep
 * (parent legs). An inactive / unknown rep, or a number with no route,
 * gives the config fallback owner (custrecord_ctc_fallback_owner); with no
 * active fallback owner the call is skipped (as before); each run with
 * skips logs one audit row 'CTC Recon skipped calls — no owner' (count +
 * SIDs).
 *
 * Watermark (config custrecord_ctc_recon_watermark, ISO UTC): every
 * browser call that ended before it is reconciled. It moves only after a
 * complete run (all pages read, no governance stop), to the settle cutoff
 * (now - 5 min), but never past the end of a call whose create failed,
 * while that call ended less than MAX_PIN_MS (6 h) ago. An older failing
 * call no longer holds it: it is logged ('CTC Recon call dropped — failed
 * too long') and counted as `dropped`.
 * The next run starts 15 min before the watermark, never more than 7 days
 * back (also the first-run lookback).
 */
// eslint-disable-next-line suitescript/no-log-module
define(['N/query', 'N/record', 'N/search', 'N/runtime', 'N/format', 'N/log', './ctc_transcript_utils', './ctc_workspace_queries', './ctc_time', './ctc_inbound_routing'],
       (query, record, search, runtime, format, log, utils, workspaceQueries, ctcTime, inboundRouting) => {

    const TWILIO_HOST = 'https://api.twilio.com';
    const PAGE_SIZE = 100;
    const CHILD_PAGE_SIZE = 20;
    const OVERLAP_MS = 15 * 60 * 1000;
    const SETTLE_MS = 5 * 60 * 1000;
    const MAX_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
    // A call whose create keeps failing holds the watermark (so the next
    // run retries it) only while its end is less than MAX_PIN_MS old:
    // about 24 runs at 15 min. After that the watermark moves past it and
    // the call is logged as dropped (2026-11-03). Before, one poison call
    // (customer UE script, mandatory field) pinned the watermark up to
    // 7 days and every run re-read the whole window.
    const MAX_PIN_MS = 6 * 60 * 60 * 1000;
    // Most skipped SIDs listed in the per-run skip summary.
    const SKIP_LIST_MAX = 20;
    const MIN_LOG_SECONDS = 3;
    // Safety cap on pages per run (100 calls each). Walking a page of
    // already-logged calls costs about 20 units, so MAX_UNITS binds first.
    const MAX_PAGES = 200;
    const SQL_CHUNK = 200;

    // Governance. Per page: 1 https.get (10) + 1 SuiteQL (10). Per created
    // call: re-check SuiteQL (10) + employee lookupFields (1) + 1 https.get
    // for the child / parent leg (10) + lookupCallerByPhone (2-5 SuiteQL, ≤ 50)
    // + record.create/save (15) = about 70 units. A missed inbound call or
    // a PSTN parent leg adds one recordings GET (10) and maybe the parent
    // call GET (10). Once per run, at the first create: the time zone
    // (ctc_time, config.load, 10, or 20 with the company fallback); at the
    // first PSTN parent leg: the flow's numbers (https.get, 10) and the
    // routes (search, 10). The pass starts only with
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
    const FLOW_SID_PATTERN = /^FW[0-9a-f]{32}$/;
    const NUMBERS_PAGE_SIZE = 100;
    // Recording states that never give a voicemail to transcribe.
    const DEAD_RECORDING_STATUSES = ['absent', 'deleted', 'failed'];

    /**
     * Browser leg of a Twilio call, or null for every other leg.
     * @param {Object} call - Twilio Call resource
     * @returns {{direction: string, identity: string, parent?: boolean}|null}
     */
    const classifyLeg = (call) => {
        const to = String((call && call.to) || '');
        const from = String((call && call.from) || '');
        if (to.indexOf(CLIENT_PREFIX) === 0) return { direction: 'inbound', identity: to.slice(CLIENT_PREFIX.length) };
        if (from.indexOf(CLIENT_PREFIX) === 0) return { direction: 'outbound', identity: from.slice(CLIENT_PREFIX.length) };
        return null;
    };

    /**
     * True for a caller's PSTN leg into one of our numbers: Twilio
     * direction 'inbound', no parent, `from` not a client, `to` a phone
     * number. (A TwiML App client call is also direction 'inbound', but
     * its `from` is 'client:...'.) Whether `to` is on our Studio flow is
     * checked separately.
     * @param {Object} call - Twilio Call resource
     * @returns {boolean}
     */
    const isPstnInboundParent = (call) => {
        if (!call || call.direction !== 'inbound' || call.parent_call_sid) return false;
        const from = String(call.from || '');
        const to = String(call.to || '');
        if (from.indexOf(CLIENT_PREFIX) === 0 || /^(client|sip):/i.test(to)) return false;
        return !!inboundRouting.toE164(to);
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

    /**
     * A number from Twilio's display form (`to_formatted`, e.g.
     * '(555) 123-4567' or '+44 20 7946 0000'), as E.164-like digits. Twilio
     * shows North American numbers without +1: 10 digits get '+1'.
     * Client / SIP addresses give ''.
     */
    const phoneFromFormatted = (value) => {
        const s = String(value || '').trim();
        if (!s || /^(client|sip):/i.test(s)) return '';
        const digits = s.replace(/[^0-9]/g, '');
        if (s.charAt(0) === '+') return phoneOf('+' + digits);
        if (digits.length === 10) return phoneOf('+1' + digits);
        if (digits.length === 11 && digits.charAt(0) === '1') return phoneOf('+' + digits);
        return phoneOf(digits);
    };

    /** The dialed number of one leg: `to`, else `to_formatted`. */
    const dialedOf = (call) => phoneOf(call && call.to) || phoneFromFormatted(call && call.to_formatted);

    const digitsOf = (value) => String(value || '').replace(/[^0-9]/g, '');

    /** '+15551234567' → '(555) 123-4567'; other numbers as they are. */
    const formatNumber = (number) => {
        const m = String(number || '').match(/^\+1([0-9]{3})([0-9]{3})([0-9]{4})$/);
        return m ? `(${m[1]}) ${m[2]}-${m[3]}` : String(number || '');
    };

    const cleanName = (value) => {
        // eslint-disable-next-line no-control-regex
        return String(value || '').replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, 120);
    };

    /**
     * Phone Call title. label: matched name, else the formatted number, else
     * ''. An outbound call with no number never reached a phone: 'Call did
     * not connect'. A voicemail: 'Voicemail from <label>'.
     */
    const titleFor = (direction, status, label, voicemail) => {
        if (status === utils.CALL_STATUS.NO_ANSWER) return label ? `No answer: ${label}` : 'Call did not connect';
        const who = label || 'unknown';
        if (voicemail) return `Voicemail from ${who}`;
        if (status === utils.CALL_STATUS.MISSED) return `Missed call from ${who}`;
        return direction === 'inbound' ? `Inbound call from ${who}` : `Call to ${who}`;
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
     * @property {string} fallbackOwnerId
     * @property {Object|null} flow - our flow's numbers + routes (loaded once)
     * @property {Object} stats
     * @property {string} stopped
     * @property {number|null} earliestFailedEndMs
     * @property {number} nowMs
     * @property {Array<string>} skippedSids - no-owner skips this run (capped)
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
     * Owner of a reconciled Phone Call: `repId` when it is an active
     * employee, else the fallback owner when that is an active employee,
     * else '' (skip).
     */
    const resolveOwner = (repId, ctx) => {
        if (repId && REP_ID_PATTERN.test(repId) && isActiveEmployee(repId, ctx)) return repId;
        const fallback = ctx.fallbackOwnerId;
        if (fallback && REP_ID_PATTERN.test(fallback) && isActiveEmployee(fallback, ctx)) return fallback;
        return '';
    };

    /**
     * Our Studio flow's numbers (E.164 → true: IncomingPhoneNumbers whose
     * voice_url is the flow) and routes (E.164 → primary rep id). Loaded
     * once per run, at the first PSTN parent leg. { transient: true } when
     * Twilio or the routes could not be read (those legs wait for the next
     * run). No published flow → no numbers.
     * @param {ReconCtx} ctx
     */
    const flowNumbers = (ctx) => {
        if (ctx.flow) return ctx.flow;
        const flowSid = String(ctx.config.studioFlowSid || '');
        /** @type {{numbers: Object<string, boolean>, routes: Object<string, string>, transient?: boolean}} */
        const flow = { numbers: {}, routes: {} };
        ctx.flow = flow;
        if (!FLOW_SID_PATTERN.test(flowSid)) return flow;

        const url = `${utils.TWILIO_API_BASE}/${ctx.config.accountSid}/IncomingPhoneNumbers.json?PageSize=${NUMBERS_PAGE_SIZE}`;
        const body = utils.getTwilioJson(url, ctx.authHeader, 'CTC Recon Flow Numbers');
        if (utils.isTransientError(body)) {
            flow.transient = true;
            return flow;
        }
        const list = (body && Array.isArray(body.incoming_phone_numbers)) ? body.incoming_phone_numbers : [];
        if (body && body.next_page_uri) {
            log.audit({ title: 'CTC Recon flow numbers — first page only', details: `listed=${list.length}` });
        }
        list.forEach((n) => {
            const voiceUrl = String((n && n.voice_url) || '');
            const e164 = inboundRouting.toE164(n && n.phone_number);
            if (e164 && voiceUrl.indexOf(`/Flows/${flowSid}`) !== -1) flow.numbers[e164] = true;
        });
        try {
            inboundRouting.loadRoutes().forEach((r) => { flow.routes[r.phoneNumber] = String(r.employeeId); });
        } catch (e) {
            log.error({ title: 'CTC Recon routes not read', details: (e && e.message) || String(e) });
            flow.transient = true;
        }
        return flow;
    };

    /**
     * The voicemail among a call's recordings: owned by `parentSid`, not
     * a <Dial> recording, not absent / deleted / failed, and not a
     * finished 0 s recording. null when there is none.
     */
    const pickVoicemail = (recordings, parentSid) => {
        const list = Array.isArray(recordings) ? recordings : [];
        return list.find((r) => {
            if (!r || !r.sid || r.call_sid !== parentSid) return false;
            if (r.source === 'DialVerb') return false;
            if (DEAD_RECORDING_STATUSES.indexOf(r.status) !== -1) return false;
            return !(r.status === 'completed' && durationOf(r) <= 0);
        }) || null;
    };

    /**
     * Voicemail of an unanswered client child leg, read from its parent.
     * Returns { transient: true } (Twilio not readable), { deferred: true }
     * (the parent call is still live or ended less than 5 min ago: the
     * voicemail may not be finished), or { recording, parent } where
     * recording is null when there is no voicemail.
     */
    const childVoicemail = (parentSid, pageBySid, ctx) => {
        let parent = pageBySid[parentSid];
        if (!parent) {
            parent = utils.fetchCall(ctx.config.accountSid, parentSid, ctx.authHeader);
            if (utils.isTransientError(parent)) return { transient: true };
        }
        if (!parent) return { recording: null, parent: null };
        if (TERMINAL_CALL_STATUSES.indexOf(parent.status) === -1) return { deferred: true };
        const parentEnd = utils.parseTwilioDate(parent.end_time);
        if (parentEnd !== null && parentEnd > ctx.cutoffMs) return { deferred: true };
        const recordings = utils.fetchRecordingsForCall(ctx.config.accountSid, parentSid, ctx.authHeader);
        if (utils.isTransientError(recordings)) return { transient: true };
        return { recording: pickVoicemail(recordings, parentSid), parent: parent };
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
     * The number an outbound browser call dialed. In order: the picked
     * child leg, any other child leg (`to`, else `to_formatted`), then the
     * parent leg's own `to` / `to_formatted` (a TwiML App client call may
     * carry the dialed number there, or the app's number, or nothing). A
     * parent `to` equal to our caller ID or a child's `from` is our own
     * Twilio number, not the callee. '' when none is found.
     */
    const outboundNumber = (call, child, children, ctx) => {
        const legs = (child ? [child] : []).concat(children.filter((c) => c !== child));
        for (const c of legs) {
            const n = dialedOf(c);
            if (n) return n;
        }
        const own = {};
        [ctx.config.phoneNumber].concat(children.map((c) => c.from)).forEach((v) => {
            const d = digitsOf(v).slice(-10);
            if (d.length >= 7) own[d] = true;
        });
        const parentNumber = dialedOf(call);
        return parentNumber && !own[digitsOf(parentNumber).slice(-10)] ? parentNumber : '';
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
            const duration = durationOf(call);
            const status = mapStatus('inbound', call.status, duration);
            // Not answered: the caller may have left a voicemail on the parent.
            let voicemail = null;
            let parent = null;
            if (status === utils.CALL_STATUS.MISSED && parentSid) {
                const vm = childVoicemail(parentSid, pageBySid, ctx);
                if (vm.transient) return { transient: true };
                if (vm.deferred) return { deferred: true };
                voicemail = vm.recording;
                parent = vm.parent;
            }
            if (!number && parentSid) {
                if (!parent) parent = pageBySid[parentSid];
                if (!parent) {
                    parent = utils.fetchCall(ctx.config.accountSid, parentSid, ctx.authHeader);
                    if (utils.isTransientError(parent)) return { transient: true };
                }
                number = phoneOf(parent && parent.from);
            }
            return {
                number: number,
                duration: voicemail ? durationOf(voicemail) : duration,
                status: voicemail ? utils.CALL_STATUS.LOGGED : status,
                voicemail: !!voicemail,
                relatedSids: parentSid ? [parentSid] : []
            };
        }

        const fetched = fetchChildLegs(call.sid, ctx);
        if (utils.isTransientError(fetched)) return { transient: true };
        // Child legs listed on this page count too (the child query may miss them).
        const children = fetched.slice();
        Object.keys(pageBySid).forEach((s) => {
            const c = pageBySid[s];
            if (c && c.parent_call_sid === call.sid && !children.some((k) => k.sid === c.sid)) children.push(c);
        });
        const child = pickChild(children);
        const duration = child ? durationOf(child) : 0;
        const legStatus = call.status !== 'completed' ? call.status : (child ? child.status : 'no-child');
        const number = outboundNumber(call, child, children, ctx);
        if (!number) {
            log.audit({
                title: 'CTC Recon outbound number not found',
                details: `callSid=${call.sid} status=${call.status} children=${children.length} ` +
                         `to=${String(call.to || '')} to_formatted=${String(call.to_formatted || '')}`
            });
        }
        return {
            number: number,
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

    /**
     * Phone Call date and call start from Twilio start_time (RFC 2822 UTC).
     * custevent_ctc_call_started = the start as ISO-8601 UTC (the row time
     * every list shows). startdate (DATE) = the local date of the start in
     * the user's (or company) time zone: format.parse of the date part of
     * N/format's DATETIME text. starttime / endtime are NOT set: on a Phone
     * Call they need Reserve Time (timedevent), which would put missed calls
     * on the rep's calendar. Never blocks the create.
     */
    const setCallTimes = (phoneCall, call) => {
        const startMs = utils.parseTwilioDate(call.start_time);
        if (startMs === null) return;
        phoneCall.setValue({ fieldId: 'custevent_ctc_call_started', value: ctcTime.isoUtc(startMs) });
        try {
            const start = ctcTime.localParts(startMs, ctcTime.userTimezone());
            if (!start) throw new Error('no date in formatted start');
            phoneCall.setValue({ fieldId: 'startdate', value: format.parse({ value: start.date, type: format.Type.DATE }) });
        } catch (e) {
            log.error({ title: 'CTC Recon start date not set', details: `${call.sid}: ${(e && e.message) || e}` });
        }
    };

    const STAT_KEY = {
        'Missed': 'missed',
        'Too short': 'tooShort',
        'No answer': 'noAnswer',
        'Logged': 'logged'
    };

    /** Creates the Phone Call; returns its stats key under stats.created. */
    const createPhoneCall = (cand, repId, details) => {
        const call = cand.call;
        const inbound = cand.leg.direction === 'inbound';
        let match = null;
        if (details.number) {
            const res = workspaceQueries.lookupCallerByPhone({ userId: repId, phone: details.number });
            match = (res && res.match) || null;
        }
        const label = cleanName(match && match.name) || formatNumber(details.number);
        const status = details.status;

        const phoneCall = record.create({ type: record.Type.PHONE_CALL, isDynamic: true });
        phoneCall.setValue({ fieldId: 'title', value: titleFor(cand.leg.direction, status, label, details.voicemail === true) });
        phoneCall.setValue({ fieldId: 'status', value: 'COMPLETE' });
        phoneCall.setValue({ fieldId: 'assigned', value: parseInt(repId, 10) });
        if (details.number) phoneCall.setValue({ fieldId: 'phone', value: details.number });
        phoneCall.setValue({ fieldId: 'custevent_ctc_call_sid', value: call.sid });
        phoneCall.setValue({ fieldId: 'custevent_ctc_duration', value: details.duration });
        phoneCall.setValue({ fieldId: 'custevent_ctc_processed', value: status !== utils.CALL_STATUS.LOGGED });
        phoneCall.setValue({ fieldId: 'custevent_ctc_call_status', value: status });
        if (inbound) phoneCall.setValue({ fieldId: 'custevent_ctc_inbound', value: true });
        if (details.voicemail === true) phoneCall.setValue({ fieldId: 'custevent_ctc_voicemail', value: true });

        setCallTimes(phoneCall, call);
        if (match) linkEntity(phoneCall, match);

        const recordId = phoneCall.save();
        log.audit({
            title: 'CTC Recon Phone Call created',
            details: `callSid=${call.sid} phoneCall=${recordId} status=${status} rep=${repId} ` +
                     `direction=${cand.leg.direction} voicemail=${details.voicemail === true}`
        });
        return details.voicemail === true ? 'voicemail' : STAT_KEY[status];
    };

    const markFailed = (cand, ctx) => {
        ctx.stats.errors++;
        // Pin cap: past MAX_PIN_MS the call no longer holds the watermark.
        if (typeof cand.endMs === 'number' && ctx.nowMs - cand.endMs > MAX_PIN_MS) {
            ctx.stats.dropped++;
            log.error({
                title: 'CTC Recon call dropped — failed too long',
                details: `callSid=${(cand.call && cand.call.sid) || 'unknown'} ` +
                         `ended=${new Date(cand.endMs).toISOString()} — failed on every run for over ` +
                         `${MAX_PIN_MS / 3600000} h; the watermark no longer waits for it. No Phone Call was created.`
            });
            return;
        }
        if (ctx.earliestFailedEndMs === null || cand.endMs < ctx.earliestFailedEndMs) {
            ctx.earliestFailedEndMs = cand.endMs;
        }
    };

    /** A call with no owner: counted and listed for the run's skip summary. */
    const markSkipped = (sid, ctx) => {
        ctx.stats.skipped++;
        if (ctx.skippedSids.length < SKIP_LIST_MAX) ctx.skippedSids.push(String(sid || ''));
    };

    /** Not decided yet (voicemail may still be running): hold the watermark. */
    const markDeferred = (cand, ctx) => {
        ctx.stats.deferred++;
        if (ctx.earliestFailedEndMs === null || cand.endMs < ctx.earliestFailedEndMs) {
            ctx.earliestFailedEndMs = cand.endMs;
        }
    };

    /**
     * Second check right before the create (the browser fast path may have
     * logged the call since the page check), then the create.
     */
    const createUnlessLogged = (cand, ownerId, details, ctx) => {
        const sids = [cand.call.sid].concat(details.relatedSids);
        if (anyLogged(sids, findLoggedSids(sids))) {
            ctx.stats.existing++;
            return;
        }
        ctx.stats.created[createPhoneCall(cand, ownerId, details)]++;
    };

    /**
     * A caller's PSTN leg into our flow (see isPstnInboundParent) that the
     * page check did not find logged. A client child leg means the call
     * rang a rep: that child leg is reconciled on its own, so nothing here.
     * Else 'Missed', or a voicemail when the parent has a voicemail
     * recording. Owner: the number's primary rep, else the fallback owner.
     * @param {{call: Object, leg: {direction: string, identity: string}, endMs: number}} cand
     * @param {Object<string, Object>} pageBySid
     * @param {ReconCtx} ctx
     */
    const reconcileParentOne = (cand, pageBySid, ctx) => {
        const call = cand.call;
        const toNumber = inboundRouting.toE164(call.to);
        const routedRep = (ctx.flow && ctx.flow.routes[toNumber]) || '';
        const ownerId = resolveOwner(routedRep, ctx);
        if (!ownerId) {
            log.audit({ title: 'CTC Recon skip — no owner for inbound call',
                        details: `callSid=${call.sid} to=${toNumber} routedRep=${routedRep || 'none'}` });
            markSkipped(call.sid, ctx);
            return;
        }
        const fetched = fetchChildLegs(call.sid, ctx);
        if (utils.isTransientError(fetched)) {
            markFailed(cand, ctx);
            return;
        }
        const children = fetched.slice();
        Object.keys(pageBySid).forEach((s) => {
            const c = pageBySid[s];
            if (c && c.parent_call_sid === call.sid && !children.some((k) => k.sid === c.sid)) children.push(c);
        });
        if (children.some((c) => String(c.to || '').indexOf(CLIENT_PREFIX) === 0)) return;

        const recordings = utils.fetchRecordingsForCall(ctx.config.accountSid, call.sid, ctx.authHeader);
        if (utils.isTransientError(recordings)) {
            markFailed(cand, ctx);
            return;
        }
        const voicemail = pickVoicemail(recordings, call.sid);
        createUnlessLogged(cand, ownerId, {
            number: phoneOf(call.from),
            duration: voicemail ? durationOf(voicemail) : 0,
            status: voicemail ? utils.CALL_STATUS.LOGGED : utils.CALL_STATUS.MISSED,
            voicemail: !!voicemail,
            relatedSids: children.map((c) => String(c.sid || ''))
        }, ctx);
    };

    /**
     * One eligible leg that the page check did not find logged.
     * @param {{call: Object, leg: {direction: string, identity: string, parent?: boolean}, endMs: number}} cand
     * @param {Object<string, Object>} pageBySid
     * @param {ReconCtx} ctx
     */
    const reconcileOne = (cand, pageBySid, ctx) => {
        if (cand.leg.parent) {
            reconcileParentOne(cand, pageBySid, ctx);
            return;
        }
        const repId = cand.leg.identity;
        // A non-numeric identity is not one of our phones: skip. An
        // inactive or unknown employee falls back to the fallback owner.
        const ownerId = REP_ID_PATTERN.test(repId) ? resolveOwner(repId, ctx) : '';
        if (!ownerId) {
            log.audit({ title: 'CTC Recon skip — not an active employee', details: `callSid=${cand.call.sid} identity=${repId}` });
            markSkipped(cand.call.sid, ctx);
            return;
        }
        if (ownerId !== repId) {
            log.audit({ title: 'CTC Recon fallback owner', details: `callSid=${cand.call.sid} identity=${repId} owner=${ownerId}` });
        }
        const details = gatherDetails(cand, pageBySid, ctx);
        if (details.transient) {
            markFailed(cand, ctx);
            return;
        }
        if (details.deferred) {
            markDeferred(cand, ctx);
            return;
        }
        createUnlessLogged(cand, ownerId, details, ctx);
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
        const hasClientChild = {};
        calls.forEach((c) => {
            if (!c || !c.sid) return;
            pageBySid[c.sid] = c;
            if (c.parent_call_sid) {
                (childrenByParent[c.parent_call_sid] = childrenByParent[c.parent_call_sid] || []).push(String(c.sid));
                if (String(c.to || '').indexOf(CLIENT_PREFIX) === 0) hasClientChild[c.parent_call_sid] = true;
            }
        });

        const candidates = [];
        calls.forEach((c) => {
            const sid = String((c && c.sid) || '');
            let leg = classifyLeg(c);
            // A caller's leg into our flow with no client child on this page
            // is a candidate too (checked against the flow numbers below).
            const pstnParent = !leg && isPstnInboundParent(c) && !hasClientChild[sid];
            if (!leg && !pstnParent) return;
            if (!CALL_SID_PATTERN.test(sid) || ctx.handled[sid]) return;
            if (TERMINAL_CALL_STATUSES.indexOf(c.status) === -1) return;
            const endMs = utils.parseTwilioDate(c.end_time);
            if (endMs !== null && (endMs < ctx.windowStartMs || endMs > ctx.cutoffMs)) return;
            if (pstnParent) {
                const flow = flowNumbers(ctx);
                if (flow.transient) {
                    // Flow numbers not readable: hold the watermark, retry next run.
                    ctx.handled[sid] = true;
                    if (endMs !== null) markFailed({ call: c, endMs: endMs }, ctx);
                    else ctx.stats.errors++;
                    return;
                }
                if (!flow.numbers[inboundRouting.toE164(c.to)]) return;
                leg = { direction: 'inbound', identity: '', parent: true };
            }
            if (endMs === null) {
                log.error({ title: 'CTC Recon end time unreadable', details: `${sid}: ${c.end_time}` });
                ctx.handled[sid] = true;
                ctx.stats.errors++;
                return;
            }
            const related = leg.parent
                ? (childrenByParent[sid] || [])
                : leg.direction === 'inbound'
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

    const writeWatermark = (cfg, ms) => {
        const iso = new Date(ms).toISOString();
        record.submitFields({
            type: 'customrecord_ctc_config',
            id: cfg.id,
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
     * @returns {{seen: number, existing: number, skipped: number, errors: number, deferred: number, dropped: number,
     *            created: {missed: number, tooShort: number, noAnswer: number, logged: number, voicemail: number},
     *            pages: number, complete: boolean, stopped: string, watermark: string}}
     */
    const reconcileCalls = (opts) => {
        const cfg = opts.config;
        const nowMs = typeof opts.nowMs === 'number' ? opts.nowMs : Date.now();
        const stats = {
            seen: 0, existing: 0, skipped: 0, errors: 0, deferred: 0, dropped: 0,
            created: { missed: 0, tooShort: 0, noAnswer: 0, logged: 0, voicemail: 0 },
            pages: 0, complete: false, stopped: '', watermark: String(cfg.reconWatermark || '')
        };

        const startUnits = remainingUnits();
        if (startUnits < START_MIN_UNITS) {
            stats.stopped = 'governance';
            return stats;
        }

        const oldMs = parseWatermark(cfg.reconWatermark);
        const floorMs = nowMs - MAX_LOOKBACK_MS;
        /** @type {ReconCtx} */
        const ctx = {
            config: cfg,
            authHeader: opts.authHeader,
            windowStartMs: Math.max(oldMs === null ? floorMs : oldMs - OVERLAP_MS, floorMs),
            cutoffMs: nowMs - SETTLE_MS,
            startUnits: startUnits,
            handled: {},
            activeReps: {},
            fallbackOwnerId: String(cfg.fallbackOwnerId || ''),
            flow: null,
            stats: stats,
            stopped: '',
            earliestFailedEndMs: null,
            nowMs: nowMs,
            skippedSids: []
        };

        let url = `${utils.TWILIO_API_BASE}/${cfg.accountSid}/Calls.json` +
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
            url = next ? nextPageUrl(next, cfg.accountSid) : '';
            if (next && !url) {
                log.error({ title: 'CTC Recon next page not followed', details: String(next) });
                stats.errors++;
                ctx.stopped = 'next page';
            }
        }
        stats.stopped = ctx.stopped;
        stats.complete = !ctx.stopped;

        // No-owner skips are lost calls (no Phone Call, and the watermark
        // moves past them). One summary per run with the count, so the
        // loss is visible without reading every per-call row.
        if (stats.skipped > 0) {
            log.audit({
                title: 'CTC Recon skipped calls — no owner',
                details: `skipped=${stats.skipped} fallbackOwner=${ctx.fallbackOwnerId || 'none'} ` +
                         `callSids=${ctx.skippedSids.join(',')}${stats.skipped > ctx.skippedSids.length ? ',…' : ''} ` +
                         '— no Phone Call was created. Set an active fallback owner (Setup Wizard) to keep these calls.'
            });
        }

        if (stats.complete) {
            let newMs = ctx.cutoffMs;
            if (ctx.earliestFailedEndMs !== null) newMs = Math.min(newMs, ctx.earliestFailedEndMs);
            if (oldMs === null || newMs > oldMs) {
                try {
                    stats.watermark = writeWatermark(cfg, newMs);
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
        isPstnInboundParent,
        pickVoicemail,
        mapStatus,
        findLoggedSids,
        nextPageUrl,
        formatNumber,
        phoneFromFormatted,
        START_MIN_UNITS,
        STOP_UNITS,
        MAX_UNITS,
        OVERLAP_MS,
        SETTLE_MS,
        MAX_LOOKBACK_MS,
        MAX_PIN_MS
    };
});
