// @ts-check
/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Shared call-ownership verification used by:
 *   - ctc_rl_token.js (RESTlet) on logCall + checkTranscript
 *   - ctc_ss_poll_transcripts.js (Scheduled Script) on orphan retry
 *
 * Extracted from ctc_rl_token.js per Sprint 2 review P0 #1 (Option B):
 * the orphan-retry path in the scheduled script must server-side-verify
 * call ownership before recreating a Phone Call from an orphan row.
 * Without this, any internal script with the (forced-NONENEEDED)
 * customrecord_ctc_orphan_call write access could forge an orphan row
 * with a stolen callSid + attacker userId + target entityId, and the
 * scheduled retry would obligingly create a Phone Call from it —
 * bypassing Sprint 1's CRIT-2 protection.
 *
 * The SuiteApp + custom-role constraint (see CLAUDE.md "Multi-Role
 * Support") forces NONENEEDED access on the orphan record. Server-side
 * verification on the retry path closes the gap that record-level
 * access tightening cannot.
 */
// eslint-disable-next-line suitescript/no-log-module
define(['N/search', 'N/log', './ctc_config', './ctc_twilio_admin'],
       (search, log, ctcConfig, twilioAdmin) => {

    /**
     * Look up phone numbers assigned to a user via customrecord_ctc_rep_assignment.
     * Used by verifyCallOwnership to authorize logCall/checkTranscript on the
     * Twilio call's `from` value. Returns an array of E.164 strings (empty if no
     * assignments). Never throws — failed lookup falls back to "no assignments,"
     * letting the cfg.phoneNumber fallback inside verifyCallOwnership cover the
     * pre-rep-assignment install state.
     */
    const getUserAssignedPhones = (userId) => {
        try {
            const s = search.create({
                type: 'customrecord_ctc_rep_assignment',
                filters: [
                    ['custrecord_ctc_ra_employee', 'anyof', userId],
                    'AND', ['isinactive', 'is', 'F']
                ],
                columns: ['custrecord_ctc_ra_phone_number']
            });
            const phones = [];
            s.run().each((row) => {
                const p = row.getValue('custrecord_ctc_ra_phone_number');
                if (p) phones.push(String(p));
                return true;
            });
            return phones;
        } catch (e) {
            log.error({ title: 'CTC getUserAssignedPhones failed', details: (e && e.message) || String(e) });
            return [];
        }
    };

    /**
     * CRIT-2 / CRIT-3 / Review P0 #1 gate — server-side correlate
     * a body-supplied (or orphan-persisted) callSid with the
     * authenticated user before allowing record mutations against it.
     *
     * Authorization model: the Twilio call's `from` (E.164 or
     * `client:<userId>`) must match either
     *   (a) the WebRTC client identity `client:<userId>` — strongest
     *       binding; CRIT-1 already enforces that the JWT identity
     *       is the session user's ID
     *   (b) a phone number assigned to userId via
     *       customrecord_ctc_rep_assignment
     *   (c) cfg.phoneNumber — the install-wide caller-ID, used as a
     *       fallback for installs that haven't set up per-rep
     *       assignments yet
     *
     * Inbound (direction === 'inbound', spike): Twilio rang the browser
     * phone, so the callSid is the leg Twilio dialed to the client. Its
     * `to` is `client:<identity>` and its `from` is the outside caller.
     * The only accepted binding is `to === client:<userId>` (CRIT-1 ties
     * the identity to the session user). The outbound rules above are not
     * used for inbound, and inbound rules are never used for outbound.
     *
     * Returns { ok: true, call } or { ok: false, reason: <CODE>, ... }.
     * Never throws.
     *
     * @param {string} callSid
     * @param {string|number} userId
     * @param {string} [direction] - 'inbound' for a call Twilio rang in; anything else = outbound
     * @returns {{ok:true, call:object} | {ok:false, reason:string, callFrom?:string, callTo?:string, twilioStatus?:number}}
     */
    const verifyCallOwnership = (callSid, userId, direction) => {
        if (!callSid || typeof callSid !== 'string' ||
            !/^CA[a-zA-Z0-9]{32}$/.test(callSid)) {
            return { ok: false, reason: 'INVALID_CALLSID_FORMAT' };
        }

        let cfg;
        try { cfg = ctcConfig.loadConfig(); }
        catch (e) { return { ok: false, reason: 'CONFIG_LOAD_FAILED' }; }
        if (!cfg || !cfg.accountSid) return { ok: false, reason: 'CONFIG_MISSING' };

        const twilioResult = twilioAdmin.getCall(cfg, callSid);
        if (!twilioResult.ok) {
            log.audit({
                title: 'CTC verifyCallOwnership — Twilio lookup failed',
                details: 'callSid=' + callSid + ' userId=' + userId +
                         ' status=' + twilioResult.status
            });
            return {
                ok: false,
                reason: twilioResult.status === 404 ? 'CALL_NOT_FOUND' : 'TWILIO_LOOKUP_FAILED',
                twilioStatus: twilioResult.status
            };
        }

        const callFrom = String((twilioResult.call && twilioResult.call.from) || '');
        const expectedClientIdentity = 'client:' + String(userId);

        if (direction === 'inbound') {
            const callTo = String((twilioResult.call && twilioResult.call.to) || '');
            if (callTo === expectedClientIdentity) {
                return { ok: true, call: twilioResult.call };
            }
            log.audit({
                title: 'CTC verifyCallOwnership — inbound callee mismatch',
                details: 'callSid=' + callSid + ' userId=' + userId +
                         ' callTo=' + callTo +
                         ' expectedClient=' + expectedClientIdentity
            });
            return { ok: false, reason: 'NOT_CALL_OWNER', callTo: callTo };
        }

        // For outbound WebRTC calls, Twilio's `from` is the calling
        // client's JWT identity in the form `client:<identity>` — not
        // a phone number — unless the TwiML response explicitly set
        // `callerId="+15551234567"` on its <Dial>. We accept either
        // path; see ctc_rl_token.js original implementation comments
        // for the full reasoning.
        if (callFrom === expectedClientIdentity) {
            return { ok: true, call: twilioResult.call };
        }

        const allowedPhones = getUserAssignedPhones(userId);
        if (cfg.phoneNumber) allowedPhones.push(cfg.phoneNumber);
        if (allowedPhones.indexOf(callFrom) !== -1) {
            return { ok: true, call: twilioResult.call };
        }

        log.audit({
            title: 'CTC verifyCallOwnership — caller-ID mismatch',
            details: 'callSid=' + callSid + ' userId=' + userId +
                     ' callFrom=' + callFrom +
                     ' expectedClient=' + expectedClientIdentity +
                     ' allowedPhones=' + allowedPhones.length
        });
        return { ok: false, reason: 'NOT_CALL_OWNER', callFrom: callFrom };
    };

    return {
        verifyCallOwnership,
        getUserAssignedPhones
    };
});
