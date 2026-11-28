/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * Call recording audio. GET ?call=<Phone Call id>[&owner=<owner>]
 * redirects the browser to a short-lived signed link to the call's audio,
 * for an <audio> element in NetSuite. The browser never holds Twilio
 * credentials and NetSuite never relays the audio bytes.
 *
 * Source (2026-11-28, user decision; replaces an MP3 passthrough):
 * Conversational Intelligence keeps the media of every Transcript and
 * answers GET /v2/Transcripts/{GT}/Media with a temporary `media_url`.
 * The Transcript is found by its source Recording SID (the same lookup
 * the poller uses), so a call can play even after its Voice Recording
 * was deleted. The browser streams the signed link itself, so seeking
 * works and there is no NetSuite size limit.
 *
 * Access: the Reporting Central rule (lib/ctc_call_access, the same check
 * as the RESTlet's getCallDetail), applied here on every request. A call
 * that does not exist, is not a CTC call or is out of scope gets the same
 * 'not_found' answer, so the answer never tells whether a call exists.
 * No transcript (or no media) answers 'recording_unavailable'. Suitelets
 * cannot set an HTTP status, so refusals are short text/plain bodies; an
 * <audio> element reads them as a load error.
 *
 * Cost: lookupFields (1) + team / book SuiteQL (≤ 20) + config search
 * (10) + two https.get (20) ≈ 51 units per play. Logs never hold the
 * signed link, the auth header or a response body.
 */
// eslint-disable-next-line suitescript/no-log-module
define(['N/search', 'N/runtime', 'N/https', 'N/redirect', 'N/log', './lib/ctc_config', './lib/ctc_twilio_admin', './lib/ctc_call_access'],
    (search, runtime, https, redirect, log, ctcConfig, twilioAdmin, callAccess) => {

        const TWILIO_INTEL_BASE = 'https://intelligence.twilio.com/v2';
        const CALL_ID_RE = /^[0-9]{1,12}$/;
        const RECORDING_SID_RE = /^RE[0-9a-fA-F]{32}$/;
        const TRANSCRIPT_SID_RE = /^GT[0-9a-fA-F]{32}$/;
        const HTTPS_TIMEOUT_MS = 30000;

        const selectValue = (v) => (Array.isArray(v) ? (v.length ? String(v[0].value || '') : '') : String(v || ''));

        const refuse = (response, code) => {
            response.setHeader({ name: 'Content-Type', value: 'text/plain; charset=utf-8' });
            response.setHeader({ name: 'Cache-Control', value: 'no-store' });
            response.write(code);
        };

        /**
         * Validate, check access, fetch, answer. Returns the refusal code,
         * or '' after it wrote the audio.
         * @param {Object} params - request parameters
         * @param {Object} response - ServerResponse
         * @returns {string}
         */
        const serve = (params, response) => {
            const callId = String((params && params.call) || '').trim();
            if (!CALL_ID_RE.test(callId)) return 'invalid_call';
            const owner = typeof (params && params.owner) === 'string' ? params.owner : '';

            let f;
            try {
                f = search.lookupFields({
                    type: search.Type.PHONE_CALL,
                    id: callId,
                    columns: ['company', 'assigned', 'custevent_ctc_call_sid',
                        'custevent_ctc_recording_sid']
                });
            } catch (e) {
                return 'not_found';
            }
            if (!f || !f.custevent_ctc_call_sid) return 'not_found';

            const user = runtime.getCurrentUser();
            const inScope = callAccess.isCallInScope({
                companyId: selectValue(f.company), ownerId: selectValue(f.assigned),
                userId: user.id, role: user.role, owner: owner
            });
            if (!inScope) return 'not_found';

            const recordingSid = String(f.custevent_ctc_recording_sid || '');
            if (!RECORDING_SID_RE.test(recordingSid)) return 'recording_unavailable';

            const config = ctcConfig.loadConfig();
            const auth = { Authorization: twilioAdmin.buildSecureAuthHeader(config) };
            const getJson = (url) => {
                let r;
                try {
                    r = https.get({ url: url, headers: auth, timeout: HTTPS_TIMEOUT_MS });
                } catch (e) {
                    return { failed: 'twilio_unreachable' };
                }
                if (r.code === 404) return { failed: 'recording_unavailable' };
                if (r.code !== 200) {
                    log.error({ title: 'CTC Recording — Twilio refused', details: `call=${callId} HTTP ${r.code}` });
                    return { failed: 'twilio_error' };
                }
                try { return { body: JSON.parse(r.body) }; } catch (e) { return { failed: 'twilio_error' }; }
            };

            // The Transcript made from this recording (the poller's own lookup)
            const list = getJson(`${TWILIO_INTEL_BASE}/Transcripts?SourceSid=${recordingSid}`);
            if (list.failed) return list.failed;
            const transcript = ((list.body && list.body.transcripts) || [])[0];
            const transcriptSid = String((transcript && transcript.sid) || '');
            if (!TRANSCRIPT_SID_RE.test(transcriptSid)) return 'recording_unavailable';

            const media = getJson(`${TWILIO_INTEL_BASE}/Transcripts/${transcriptSid}/Media`);
            if (media.failed) return media.failed;
            const signed = String((media.body && media.body.media_url) || '');
            if (!/^https:\/\//i.test(signed)) return 'recording_unavailable';

            response.setHeader({ name: 'Cache-Control', value: 'no-store' });
            redirect.redirect({ url: signed });
            log.audit({ title: 'CTC Recording played', details: `call=${callId} user=${user.id}` });
            return '';
        };

        const onRequest = (context) => {
            if (context.request.method !== 'GET') {
                refuse(context.response, 'method_not_allowed');
                return;
            }
            let code;
            try {
                code = serve(context.request.parameters, context.response);
            } catch (e) {
                log.error({ title: 'CTC Recording failed', details: (e && e.message) || String(e) });
                code = 'error';
            }
            if (code) refuse(context.response, code);
        };

        return { onRequest };
    });
