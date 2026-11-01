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

    // A Twilio `from` that is a phone number (E.164, optional +).
    const PHONE_NUMBER_RE = /^\+?[0-9]{7,15}$/;

    /**
     * Look up phone numbers assigned to a user via customrecord_ctc_rep_assignment.
     * Returns an array of E.164 strings (empty if no assignments). Never
     * throws. No longer used by verifyCallOwnership (2026-11-01: a caller
     * ID does not prove who placed a call); kept as an export.
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
     * Outbound authorization model (tightened 2026-11-01): the call must
     * come from this user's browser phone.
     *   (a) the leg's `from` is the WebRTC client identity
     *       `client:<userId>` (CRIT-1 ties the JWT identity to the session
     *       user) — the browser leg the softphone reports; or
     *   (b) the leg's `from` is a phone number (the dialed child leg of a
     *       TwiML <Dial>, from = caller ID): its `parent_call_sid` is
     *       fetched and the parent's `from` must be `client:<userId>`.
     * A caller ID alone no longer proves ownership: every rep shares the
     * config caller ID, and assigned numbers can be shared too, so any
     * rep could claim another rep's call by its SID.
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

        // Outbound (a): the browser leg itself.
        if (callFrom === expectedClientIdentity) {
            return { ok: true, call: twilioResult.call };
        }

        // Outbound (b): a dialed child leg (from = caller ID). Its parent
        // must be this user's browser leg.
        const parentSid = String((twilioResult.call && twilioResult.call.parent_call_sid) || '');
        if (PHONE_NUMBER_RE.test(callFrom) && /^CA[a-zA-Z0-9]{32}$/.test(parentSid)) {
            const parentResult = twilioAdmin.getCall(cfg, parentSid);
            if (!parentResult.ok) {
                log.audit({
                    title: 'CTC verifyCallOwnership — parent lookup failed',
                    details: 'callSid=' + callSid + ' parentSid=' + parentSid +
                             ' userId=' + userId + ' status=' + parentResult.status
                });
                return {
                    ok: false,
                    reason: parentResult.status === 404 ? 'CALL_NOT_FOUND' : 'TWILIO_LOOKUP_FAILED',
                    twilioStatus: parentResult.status
                };
            }
            const parentFrom = String((parentResult.call && parentResult.call.from) || '');
            if (parentFrom === expectedClientIdentity) {
                return { ok: true, call: twilioResult.call };
            }
            log.audit({
                title: 'CTC verifyCallOwnership — parent caller mismatch',
                details: 'callSid=' + callSid + ' parentSid=' + parentSid +
                         ' userId=' + userId + ' parentFrom=' + parentFrom +
                         ' expectedClient=' + expectedClientIdentity
            });
            return { ok: false, reason: 'NOT_CALL_OWNER', callFrom: callFrom };
        }

        log.audit({
            title: 'CTC verifyCallOwnership — caller mismatch',
            details: 'callSid=' + callSid + ' userId=' + userId +
                     ' callFrom=' + callFrom +
                     ' parentSid=' + (parentSid || '-') +
                     ' expectedClient=' + expectedClientIdentity
        });
        return { ok: false, reason: 'NOT_CALL_OWNER', callFrom: callFrom };
    };

    return {
        verifyCallOwnership,
        getUserAssignedPhones
    };
});
