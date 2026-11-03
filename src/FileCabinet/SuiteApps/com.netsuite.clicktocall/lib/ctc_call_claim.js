// @ts-check
/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * One analysis per Phone Call. The browser (RESTlet checkTranscript) and
 * the poller (Scheduled Script Phase C) can both find a finished
 * transcript for the same call. Before either runs the LLM it claims the
 * call: status Processing with custevent_ctc_processed T.
 *
 *   - processed T takes the call out of the poller's search
 *     (processed = F), so the poller does not pick it up again.
 *   - checkTranscript returns early on processed T or a terminal status.
 *   - The enrichment save then writes Transcribed (processed stays T).
 *   - On an error after the claim, the caller releases it with
 *     Failed + processed F (the poller retries Failed calls).
 *
 * NetSuite has no compare-and-swap. The claim re-reads the call right
 * before it writes, so the race window is the gap between that read
 * and the write (milliseconds), not the whole Twilio + LLM pass.
 *
 * Stale claims: the claim also writes custevent_ctc_analysis_claim =
 * "<ISO-8601 UTC claim time>|<claim count>". The enrichment save empties
 * it (clearClaimOnRecord). A script killed between claim and save (no
 * catch runs) leaves processed T + Processing. The poller
 * (findStaleClaims / releaseStaleClaim) sends such a call back to
 * Logged + processed F when the claim is over 30 minutes old and the call
 * has no AI summary, so the normal path retries it. After
 * MAX_STALE_RELEASES releases it gives up: Failed + processed T.
 *
 * Attempt cap: each claim adds 1 to the stamp count. claimForAnalysis
 * refuses a call whose count already reached MAX_ANALYSIS_ATTEMPTS and
 * closes it as Failed + processed T (reason 'gave_up'), so a call that
 * fails after the claim (save error, customer UE script) is analysed at
 * most MAX_ANALYSIS_ATTEMPTS times instead of every 15 min forever.
 * The time is our own UTC stamp, not lastmodified (search date values
 * come back in the user's format and time zone).
 */
// eslint-disable-next-line suitescript/no-log-module
define(['N/search', 'N/record', 'N/log', './ctc_transcript_utils'], (search, record, log, utils) => {

    const isChecked = (v) => v === true || v === 'T';

    const CLAIM_FIELD = 'custevent_ctc_analysis_claim';
    const STALE_CLAIM_MS = 30 * 60 * 1000;
    const MAX_STALE_RELEASES = 3;
    // Most claims (analysis attempts, LLM calls) one call gets, on any
    // path: browser, poller retry after Failed, stale release. Same
    // value as the stale-release cap.
    const MAX_ANALYSIS_ATTEMPTS = MAX_STALE_RELEASES;
    const STALE_SEARCH_MAX = 20;

    /**
     * Parse "<ISO>|<count>". Unreadable → { atMs: NaN, count: 0 }.
     * @param {*} raw
     * @returns {{atMs:number, count:number}}
     */
    const parseClaim = (raw) => {
        const parts = String(raw || '').split('|');
        const atMs = Date.parse(parts[0] || '');
        const count = parseInt(parts[1], 10);
        return { atMs: atMs, count: count > 0 ? count : 0 };
    };

    /**
     * Statuses after which a call is never analysed again.
     * @returns {string[]}
     */
    const terminalStatuses = () => {
        const S = utils.CALL_STATUS || {};
        return [S.TRANSCRIBED, S.NO_TRANSCRIPT, S.MISSED, S.TOO_SHORT, S.NO_ANSWER]
            .filter((s) => typeof s === 'string' && s);
    };

    /**
     * Text of a lookupFields value (scalar, or [{ value, text }]).
     * @param {*} raw
     * @returns {string}
     */
    const lookupText = (raw) => {
        if (Array.isArray(raw)) return String((raw[0] && (raw[0].text || raw[0].value)) || '');
        return String(raw || '');
    };

    /**
     * Where a stored call stands for analysis.
     * @param {{processed:*, status:*}} state
     * @returns {'transcribed'|'terminal'|'claimed'|'open'}
     *   transcribed = Transcribed; terminal = another terminal status, or
     *   processed T with a status that is not Processing; claimed =
     *   processed T + Processing (another path is analysing); open = free.
     */
    const stateOf = (state) => {
        const status = String((state && state.status) || '');
        const processed = isChecked(state && state.processed);
        const S = utils.CALL_STATUS || {};
        if (status && status === S.TRANSCRIBED) return 'transcribed';
        if (terminalStatuses().indexOf(status) !== -1) return 'terminal';
        if (processed) return status === S.PROCESSING ? 'claimed' : 'terminal';
        return 'open';
    };

    /**
     * Close a call that used up its analysis attempts: Failed + processed
     * T, stamp emptied. A failed write is reported as claim_failed (the
     * caller treats it as transient and the next run tries again).
     * @param {string|number} recordId
     * @param {{status:string, claim:string}} current
     * @param {number} count
     * @returns {{ok:false, reason:'gave_up'|'claim_failed'}}
     */
    const giveUp = (recordId, current, count) => {
        const values = { custevent_ctc_call_status: utils.CALL_STATUS.FAILED, custevent_ctc_processed: true };
        values[CLAIM_FIELD] = '';
        try {
            record.submitFields({
                type: record.Type.PHONE_CALL,
                id: recordId,
                values: values,
                options: { enableSourcing: false, ignoreMandatoryFields: true }
            });
        } catch (e) {
            log.error({ title: 'CTC claim write failed', details: `${recordId}: ${(e && e.message) || e}` });
            return { ok: false, reason: 'claim_failed' };
        }
        log.error({
            title: 'CTC analysis gave up — attempt cap',
            details: `phoneCall=${recordId} attempts=${count} max=${MAX_ANALYSIS_ATTEMPTS} ` +
                     `status=${current.status} claim=${current.claim} — closed as Failed (processed T); recording left in Twilio`
        });
        return { ok: false, reason: 'gave_up' };
    };

    /**
     * Claim a call for analysis. Re-reads the call first. A call that
     * already used MAX_ANALYSIS_ATTEMPTS claims is closed instead (giveUp).
     * Never throws.
     * @param {string|number} recordId - Phone Call internal id
     * @returns {{ok:true} | {ok:false, reason:'transcribed'|'terminal'|'claimed'|'claim_failed'|'gave_up', status?:string}}
     */
    const claimForAnalysis = (recordId) => {
        /** @type {{processed:*, status:string, claim:string}} */
        let current;
        try {
            const r = search.lookupFields({
                type: record.Type.PHONE_CALL,
                id: recordId,
                columns: ['custevent_ctc_processed', 'custevent_ctc_call_status', CLAIM_FIELD]
            }) || {};
            current = {
                processed: r.custevent_ctc_processed,
                status: lookupText(r.custevent_ctc_call_status),
                claim: lookupText(r[CLAIM_FIELD])
            };
        } catch (e) {
            log.error({ title: 'CTC claim read failed', details: `${recordId}: ${(e && e.message) || e}` });
            return { ok: false, reason: 'claim_failed' };
        }
        const where = stateOf(current);
        if (where !== 'open') return { ok: false, reason: where, status: current.status };
        const priorCount = parseClaim(current.claim).count;
        // Attempt cap (2026-11-03). Every claim is one analysis attempt
        // (one LLM call). A call released as Failed + processed F after an
        // error came back every 15 min forever. After MAX_ANALYSIS_ATTEMPTS
        // claims the call ends as Failed for good (processed T; stamp
        // emptied so it leaves the stale-claim search).
        if (priorCount >= MAX_ANALYSIS_ATTEMPTS) return giveUp(recordId, current, priorCount);
        const values = {
            custevent_ctc_call_status: utils.CALL_STATUS.PROCESSING,
            custevent_ctc_processed: true
        };
        // The count survives releases, so the stale-claim cap holds.
        values[CLAIM_FIELD] = new Date().toISOString() + '|' + (priorCount + 1);
        try {
            record.submitFields({
                type: record.Type.PHONE_CALL,
                id: recordId,
                values: values,
                options: { enableSourcing: false, ignoreMandatoryFields: true }
            });
        } catch (e) {
            log.error({ title: 'CTC claim write failed', details: `${recordId}: ${(e && e.message) || e}` });
            return { ok: false, reason: 'claim_failed' };
        }
        return { ok: true };
    };

    /**
     * Give a claimed call back after an error: Failed + processed F, so
     * the poller retries it. Never throws (markCallStatus logs).
     * @param {string|number} recordId
     */
    const releaseClaim = (recordId) => {
        utils.markCallStatus(recordId, utils.CALL_STATUS.FAILED, false);
    };

    /**
     * Empty the claim stamp on a record about to get its enrichment save.
     * @param {Object} rec - N/record Phone Call (loaded)
     */
    const clearClaimOnRecord = (rec) => {
        rec.setValue({ fieldId: CLAIM_FIELD, value: '' });
    };

    /**
     * Claimed calls (stamp set, processed T, no AI summary), up to 20.
     * Throws on a search error (the caller isolates it).
     * @returns {Array<{recordId:string, status:string, claim:string}>}
     */
    const findClaimedCalls = () => {
        const rows = search.create({
            type: search.Type.PHONE_CALL,
            filters: [
                [CLAIM_FIELD, 'isnotempty', ''],
                'AND', ['custevent_ctc_processed', 'is', 'T'],
                'AND', ['custevent_ctc_ai_summary', 'isempty', '']
            ],
            columns: ['internalid', 'custevent_ctc_call_status', CLAIM_FIELD]
        }).run().getRange({ start: 0, end: STALE_SEARCH_MAX }) || [];
        return rows.map((r) => ({
            recordId: r.id,
            status: String(r.getValue('custevent_ctc_call_status') || ''),
            claim: String(r.getValue(CLAIM_FIELD) || '')
        }));
    };

    /**
     * Release one claimed call when its claim is stale.
     * Never throws.
     * @param {{recordId:string, status:string, claim:string}} row
     * @param {number} nowMs
     * @returns {'fresh'|'released'|'gaveUp'|'notClaimed'|'failed'}
     */
    const releaseStaleClaim = (row, nowMs) => {
        if (row.status !== utils.CALL_STATUS.PROCESSING) return 'notClaimed';
        const claim = parseClaim(row.claim);
        // An unreadable stamp counts as stale.
        if (!isNaN(claim.atMs) && nowMs - claim.atMs <= STALE_CLAIM_MS) return 'fresh';
        const gaveUp = claim.count > MAX_STALE_RELEASES;
        const values = gaveUp
            ? { custevent_ctc_call_status: utils.CALL_STATUS.FAILED, custevent_ctc_processed: true }
            : { custevent_ctc_call_status: utils.CALL_STATUS.LOGGED, custevent_ctc_processed: false };
        // Gave up: empty the stamp so the call leaves this search.
        // Released: keep it, so the next claim counts on from it.
        if (gaveUp) values[CLAIM_FIELD] = '';
        try {
            record.submitFields({
                type: record.Type.PHONE_CALL,
                id: row.recordId,
                values: values,
                options: { enableSourcing: false, ignoreMandatoryFields: true }
            });
        } catch (e) {
            log.error({ title: 'CTC stale claim release failed', details: `${row.recordId}: ${(e && e.message) || e}` });
            return 'failed';
        }
        log.audit({
            title: gaveUp ? 'CTC stale claim — gave up' : 'CTC stale claim released',
            details: `${row.recordId} claim=${row.claim}`
        });
        return gaveUp ? 'gaveUp' : 'released';
    };

    return {
        CLAIM_FIELD,
        STALE_CLAIM_MS,
        MAX_STALE_RELEASES,
        MAX_ANALYSIS_ATTEMPTS,
        claimForAnalysis,
        releaseClaim,
        stateOf,
        clearClaimOnRecord,
        findClaimedCalls,
        releaseStaleClaim
    };
});
