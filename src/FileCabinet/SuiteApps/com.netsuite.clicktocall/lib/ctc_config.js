// @ts-check
/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Shared CTC configuration loader. Single source of truth so RESTlet /
 * Scheduled Script / Suitelet / future SMS action all read from the same
 * config record with the same field set.
 *
 * Phase 2 U10: the Auth Token path was removed entirely. All Twilio REST
 * Basic Auth now flows through `lib/ctc_twilio_admin.js:buildSecureAuthHeader`
 * which uses `N/https.createSecureString` with the `{custsecret_*}` placeholder
 * pointing at `cfg.apiSecretId`. The script never sees the cleartext secret
 * value — NetSuite's HTTP runtime expands the placeholder at the socket
 * write boundary.
 */
// eslint-disable-next-line suitescript/no-log-module
define(['N/search', 'N/record', 'N/log'], (search, record, log) => {

    const DEFAULT_RING_SECONDS = 20;
    const MIN_RING_SECONDS = 10;
    const MAX_RING_SECONDS = 60;
    const DEFAULT_NOANSWER_MESSAGE = 'Sorry, no one is available to take ' +
        'your call. Please try again later. Goodbye.';
    const DEFAULT_RECORDING_NOTICE = 'This call may be recorded for quality and training.';
    // Voicemail (2026-11-01). With voicemail on, the no-answer message is
    // the greeting before the beep, so its default asks for a message.
    const DEFAULT_VOICEMAIL_GREETING = 'Sorry, no one is available. ' +
        'Please leave a message after the tone.';
    const DEFAULT_VOICEMAIL_MAX_SECONDS = 120;
    const MIN_VOICEMAIL_MAX_SECONDS = 30;
    const MAX_VOICEMAIL_MAX_SECONDS = 300;
    // Outbound recording notice (2026-11-03): spoken to the called party by
    // the outbound Twilio Function (lib/ctc_outbound_function.js).
    const DEFAULT_OUTBOUND_NOTICE = 'This call is recorded and transcribed with AI.';
    const MAX_OUTBOUND_NOTICE_LENGTH = 300;

    /**
     * Inbound ring time in whole seconds. Blank or not a number gives the
     * default (20); other values are clamped to 10-60.
     */
    const parseRingSeconds = (raw) => {
        const n = parseInt(raw, 10);
        if (isNaN(n)) return DEFAULT_RING_SECONDS;
        return Math.min(Math.max(n, MIN_RING_SECONDS), MAX_RING_SECONDS);
    };

    /**
     * Default no-answer message for the voicemail setting: the voicemail
     * greeting when voicemail is on, else the try-again-later message.
     */
    const defaultNoAnswerMessage = (voicemailOn) =>
        (voicemailOn ? DEFAULT_VOICEMAIL_GREETING : DEFAULT_NOANSWER_MESSAGE);

    /**
     * True when the text is blank or one of the two built-in defaults.
     * The wizard shows the default in the text box, so a save can store a
     * default verbatim; it must still follow the voicemail setting.
     */
    const isDefaultNoAnswerMessage = (raw) => {
        const s = raw == null ? '' : String(raw).trim();
        return !s || s === DEFAULT_NOANSWER_MESSAGE || s === DEFAULT_VOICEMAIL_GREETING;
    };

    /**
     * No-answer message. Blank (or a built-in default) gives the default
     * for the voicemail setting; other text is used as it is.
     */
    const parseNoAnswerMessage = (raw, voicemailOn) => {
        if (isDefaultNoAnswerMessage(raw)) return defaultNoAnswerMessage(voicemailOn === true);
        return String(raw).trim();
    };

    /**
     * Voicemail on/off. The XML default is checked. Only an explicit
     * false / 'F' is off; blank or null reads as on. Note: N/search can
     * return false for a checkbox an older config record never stored,
     * so an existing install may read off until the wizard saves it.
     */
    const parseVoicemailOn = (raw) => {
        if (raw === false || raw === 'F') return false;
        return true;
    };

    /**
     * Longest voicemail in whole seconds. Blank or not a number gives 120;
     * other values are clamped to 30-300.
     */
    const parseVoicemailMaxSeconds = (raw) => {
        const n = parseInt(raw, 10);
        if (isNaN(n)) return DEFAULT_VOICEMAIL_MAX_SECONDS;
        return Math.min(Math.max(n, MIN_VOICEMAIL_MAX_SECONDS), MAX_VOICEMAIL_MAX_SECONDS);
    };

    /** Employee internal id as a string of digits, or ''. */
    const parseEmployeeId = (raw) => {
        const s = raw == null ? '' : String(raw).trim();
        return /^[0-9]{1,10}$/.test(s) ? s : '';
    };

    /** Recording notice; blank gives the default notice. */
    const parseRecordingNotice = (raw) => {
        const s = raw == null ? '' : String(raw).trim();
        return s || DEFAULT_RECORDING_NOTICE;
    };

    const isChecked = (v) => v === true || v === 'T';

    /** Outbound notice; blank gives the default notice. */
    const parseOutboundNotice = (raw) => {
        const s = raw == null ? '' : String(raw).trim();
        return s || DEFAULT_OUTBOUND_NOTICE;
    };

    /** Whole number >= 0; blank or not a number gives `fallback`. */
    const parseCount = (raw, fallback) => {
        const n = parseInt(raw, 10);
        return isNaN(n) || n < 0 ? fallback : n;
    };

    const text = (raw) => (raw == null ? '' : String(raw));


    // Outbound notice fields (2026-11-03). Read with record.load, not as search
    // columns: right after the SDF deploy NetSuite refused them as search
    // columns (SSS_INVALID_SRCH_COL) while record.load saw them, and a failed
    // column took loadConfig — and so the phone — down. Optional settings must
    // never break the phone: any error here gives the defaults (notice off).
    const OUTBOUND_DEFAULTS = {
        outNoticeOn: false, outNoticeText: DEFAULT_OUTBOUND_NOTICE, outNoticeVersion: 1, outPublishedNoticeVersion: 0,
        outFnService: '', outFnEnv: '', outFnBuild: '', outFnPendingBuild: '', outFnDomain: '', outFnCodeVersion: '',
        outFnHash: '', outPrevVoiceUrl: '', outPublishedAt: '', outAllowedCc: '', outPublishedAllowedCc: ''
    };
    const readOutbound = (id) => {
        try {
            const rec = record.load({ type: 'customrecord_ctc_config', id: id });
            const v = (f) => rec.getValue({ fieldId: f });
            return {
                outNoticeOn:       isChecked(v('custrecord_ctc_out_notice_on')),
                outNoticeText:     parseOutboundNotice(v('custrecord_ctc_out_notice')),
                outNoticeVersion:  Math.max(1, parseCount(v('custrecord_ctc_out_notice_ver'), 1)),
                outPublishedNoticeVersion: parseCount(v('custrecord_ctc_out_pub_notice_ver'), 0),
                outFnService:      text(v('custrecord_ctc_out_fn_service')),
                outFnEnv:          text(v('custrecord_ctc_out_fn_env')),
                outFnBuild:        text(v('custrecord_ctc_out_fn_build')),
                outFnPendingBuild: text(v('custrecord_ctc_out_fn_pending_build')),
                outFnDomain:       text(v('custrecord_ctc_out_fn_domain')),
                outFnCodeVersion:  text(v('custrecord_ctc_out_fn_code_ver')),
                outFnHash:         text(v('custrecord_ctc_out_fn_hash')),
                outPrevVoiceUrl:   text(v('custrecord_ctc_out_prev_voiceurl')),
                outPublishedAt:    text(v('custrecord_ctc_out_published_at')),
                outAllowedCc:      text(v('custrecord_ctc_out_allowed_cc')),
                outPublishedAllowedCc: text(v('custrecord_ctc_out_pub_allowed_cc'))
            };
        } catch (e) {
            log.error({ title: 'CTC config — outbound fields unreadable; notice treated as off', details: (e && e.message) || String(e) });
            return Object.assign({}, OUTBOUND_DEFAULTS);
        }
    };

    /**
     * Load the singleton CTC configuration record.
     * @returns {Object} {
     *     accountSid, apiKeySid, apiSecretId,
     *     id, accountSid, apiKeySid, apiSecretId,
     *     twimlAppSid, phoneNumber, intelServiceSid, active, inboundEnabled,
     *     ringSeconds, noAnswerMessage, studioFlowSid, routingPublishedAt,
     *     recordInbound, recordingNoticeOn, recordingNotice, reconWatermark,
     *     voicemailOn, voicemailMaxSeconds, fallbackOwnerId
     * }
     *
     * `id` is the config record's internal id (for record.submitFields).
     *
     * Inbound routing (Studio flow generated by lib/ctc_inbound_routing):
     * `ringSeconds` defaults to 20 when blank/invalid and is clamped to
     * 10-60; `noAnswerMessage` defaults to a built-in message when blank;
     * `studioFlowSid` and `routingPublishedAt` are '' until the first
     * publish.
     *
     * Inbound recording: `recordInbound` and `recordingNoticeOn` read their
     * checkboxes as-is (the XML default is checked for new records; an
     * unset value reads false). `recordingNotice` defaults to a built-in
     * notice when blank.
     *
     * Voicemail: `voicemailOn` (default true; blank / null reads true)
     * sends unanswered and unrouted inbound callers to a Studio
     * record-voicemail widget after the no-answer message.
     * `voicemailMaxSeconds` defaults to 120, clamped to 30-300.
     * `noAnswerMessage` defaults to the voicemail greeting when voicemail
     * is on. `fallbackOwnerId` is the employee who owns Phone Calls for
     * unrouted numbers and for inactive reps ('' when not set).
     *
     * Outbound recording notice (lib/ctc_outbound_function): `outNoticeOn`
     * (default false), `outNoticeText` (blank gives DEFAULT_OUTBOUND_NOTICE),
     * `outNoticeVersion` (blank gives 1; the wizard bumps it when the text
     * or on/off changes), `outPublishedNoticeVersion` (the notice version
     * live in Twilio after the last publish; 0 = no notice plays). The
     * outFn* fields and `outPrevVoiceUrl` / `outPublishedAt` are '' until
     * the first publish.
     *
     * Call reconciliation (lib/ctc_call_reconcile): `reconWatermark` is the
     * ISO 8601 UTC time before which every Twilio browser call has a Phone
     * Call; '' until the first complete run.
     *
     * `active` defaults to false. Phone-button UE gates on this in U9 — until
     * the wizard flips it, the phone icon stays hidden on fresh customer
     * installs. Back-compat: U9 treats unset+populated-config as true so
     * existing installs don't lose the icon at deploy time.
     *
     * `inboundEnabled` defaults to false. When true, the RESTlet's token
     * grant allows incoming calls to the rep's client identity (inbound
     * spike). Outbound-only installs keep today's grant.
     *
     * @throws {Error} if no active config record exists
     */
    const loadConfig = () => {
        const results = search.create({
            type: 'customrecord_ctc_config',
            filters: [['isinactive', 'is', 'F']],
            columns: [
                'custrecord_ctc_account_sid',
                'custrecord_ctc_api_key_sid',
                'custrecord_ctc_api_secret_id',
                'custrecord_ctc_twiml_app_sid',
                'custrecord_ctc_phone_number',
                'custrecord_ctc_intel_service_sid',
                'custrecord_ctc_active',
                'custrecord_ctc_inbound_enabled',
                'custrecord_ctc_ring_seconds',
                'custrecord_ctc_noanswer_message',
                'custrecord_ctc_studio_flow_sid',
                'custrecord_ctc_routing_published_at',
                'custrecord_ctc_record_inbound',
                'custrecord_ctc_recording_notice_on',
                'custrecord_ctc_recording_notice',
                'custrecord_ctc_recon_watermark',
                'custrecord_ctc_voicemail_on',
                'custrecord_ctc_voicemail_max_seconds',
                'custrecord_ctc_fallback_owner'
            ]
        }).run().getRange({ start: 0, end: 1 });

        if (!results.length) {
            throw new Error('CTC config record not found or inactive');
        }

        const r = results[0];
        const voicemailOn = parseVoicemailOn(r.getValue('custrecord_ctc_voicemail_on'));
        return Object.assign({
            id:                r.id,
            accountSid:        r.getValue('custrecord_ctc_account_sid'),
            apiKeySid:         r.getValue('custrecord_ctc_api_key_sid'),
            apiSecretId:       r.getValue('custrecord_ctc_api_secret_id'),
            twimlAppSid:       r.getValue('custrecord_ctc_twiml_app_sid'),
            phoneNumber:       r.getValue('custrecord_ctc_phone_number'),
            intelServiceSid:   r.getValue('custrecord_ctc_intel_service_sid'),
            active:            r.getValue('custrecord_ctc_active') === true
                            || r.getValue('custrecord_ctc_active') === 'T',
            inboundEnabled:    r.getValue('custrecord_ctc_inbound_enabled') === true
                            || r.getValue('custrecord_ctc_inbound_enabled') === 'T',
            ringSeconds:       parseRingSeconds(r.getValue('custrecord_ctc_ring_seconds')),
            noAnswerMessage:   parseNoAnswerMessage(r.getValue('custrecord_ctc_noanswer_message'), voicemailOn),
            studioFlowSid:     r.getValue('custrecord_ctc_studio_flow_sid') || '',
            routingPublishedAt: r.getValue('custrecord_ctc_routing_published_at') || '',
            recordInbound:     isChecked(r.getValue('custrecord_ctc_record_inbound')),
            recordingNoticeOn: isChecked(r.getValue('custrecord_ctc_recording_notice_on')),
            recordingNotice:   parseRecordingNotice(r.getValue('custrecord_ctc_recording_notice')),
            reconWatermark:    r.getValue('custrecord_ctc_recon_watermark') || '',
            voicemailOn:       voicemailOn,
            voicemailMaxSeconds: parseVoicemailMaxSeconds(r.getValue('custrecord_ctc_voicemail_max_seconds')),
            fallbackOwnerId:   parseEmployeeId(r.getValue('custrecord_ctc_fallback_owner'))
        });
    };

    /**
     * loadConfig() plus the outbound notice fields (readOutbound). Only the
     * outbound code calls this; the phone path keeps loadConfig() alone.
     * @returns {Object}
     */
    const loadOutboundConfig = () => {
        const cfg = loadConfig();
        return Object.assign(cfg, readOutbound(cfg.id));
    };

    // Inbound routing state (2026-11-03, Phase 1 health read model): a JSON
    // record of the last publish attempt, written by
    // lib/ctc_inbound_routing.publishRouting and read by lib/ctc_health.
    // Like the outbound fields, it is read with record.load and is NEVER a
    // loadConfig search column (a new column broke the phone path once).
    const ROUTING_STATE_FIELD = 'custrecord_ctc_routing_state';

    /**
     * Read the stored routing state. record.load (2 units); never throws.
     *   { ok: true, state: Object }   the stored JSON object
     *   { ok: true, state: null }     nothing stored yet (never published
     *                                 since change tracking was added)
     *   { ok: false, error }          the field or the JSON is unreadable
     * @param {string|number} id - config record internal id
     */
    const readRoutingState = (id) => {
        let raw;
        try {
            const rec = record.load({ type: 'customrecord_ctc_config', id: id });
            raw = rec.getValue({ fieldId: ROUTING_STATE_FIELD });
        } catch (e) {
            log.error({ title: 'CTC config — routing state unreadable', details: (e && e.message) || String(e) });
            return { ok: false, error: 'routing_state_unreadable' };
        }
        const s = raw == null ? '' : String(raw).trim();
        if (!s) return { ok: true, state: null };
        try {
            const parsed = JSON.parse(s);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return { ok: true, state: parsed };
        } catch (e) { /* falls through */ }
        log.error({ title: 'CTC config — routing state is not a JSON object', details: 'length=' + s.length });
        return { ok: false, error: 'routing_state_invalid' };
    };

    /**
     * Store the routing state JSON. record.submitFields (2 units). Never
     * throws: a failed write must not change a publish result.
     * @returns {boolean} true when saved
     */
    const writeRoutingState = (id, state) => {
        try {
            record.submitFields({
                type: 'customrecord_ctc_config',
                id: id,
                values: { [ROUTING_STATE_FIELD]: JSON.stringify(state) }
            });
            return true;
        } catch (e) {
            log.error({ title: 'CTC config — routing state not saved', details: (e && e.message) || String(e) });
            return false;
        }
    };

    /**
     * Phone tab mode (custrecord_ctc_phone_tab_mode): the phone mode shell
     * runs without the NetSuite frame. The admin's fallback when a NetSuite
     * release breaks NetSuite inside the frame (architecture review H1).
     * Read on its own (lookupFields, not a loadConfig column) and never
     * throws: a missing or unreadable field means false (framed mode).
     * @param {string|number} [id] config record id; looked up when omitted
     * @returns {boolean}
     */
    const readPhoneTabMode = (id) => {
        try {
            let recId = id;
            if (!recId) {
                const rows = search.create({
                    type: 'customrecord_ctc_config',
                    filters: [['isinactive', 'is', 'F']],
                    columns: ['internalid']
                }).run().getRange({ start: 0, end: 1 });
                if (!rows.length) return false;
                recId = rows[0].id;
            }
            const v = search.lookupFields({
                type: 'customrecord_ctc_config',
                id: recId,
                columns: ['custrecord_ctc_phone_tab_mode']
            });
            return isChecked(v && v.custrecord_ctc_phone_tab_mode);
        } catch (e) {
            log.error({ title: 'CTC config — phone tab mode unreadable; framed mode', details: (e && e.message) || String(e) });
            return false;
        }
    };

    const DEFAULT_RECORDING_KEEP_DAYS = 30;
    const MAX_RECORDING_KEEP_DAYS = 3650;

    /**
     * custrecord_ctc_recording_keep_days → whole days. Blank, not a number,
     * or out of range (below 0, above MAX) gives the default 30. 0 = delete
     * the recording right after the transcript is saved.
     * @param {*} raw
     * @returns {number}
     */
    const parseRecordingKeepDays = (raw) => {
        if (raw === '' || raw === null || raw === undefined) return DEFAULT_RECORDING_KEEP_DAYS;
        const n = Number(raw);
        if (!Number.isInteger(n) || n < 0 || n > MAX_RECORDING_KEEP_DAYS) return DEFAULT_RECORDING_KEEP_DAYS;
        return n;
    };

    /**
     * Days to keep call recordings in Twilio. Read on its own (lookupFields,
     * not a loadConfig column: a new loadConfig search column took the
     * phone down once, CHANGELOG 2026-11-03). Never throws.
     * Returns null when the field cannot be read: callers then delete
     * nothing (keeping a recording can be undone later, a delete cannot).
     * @param {string|number} id - config record internal id
     * @returns {number|null}
     */
    const readRecordingKeepDays = (id) => {
        try {
            const v = search.lookupFields({
                type: 'customrecord_ctc_config',
                id: id,
                columns: ['custrecord_ctc_recording_keep_days']
            });
            return parseRecordingKeepDays(v && v.custrecord_ctc_recording_keep_days);
        } catch (e) {
            log.error({ title: 'CTC config — recording keep days unreadable; no recording deletes', details: (e && e.message) || String(e) });
            return null;
        }
    };

    return {
        loadOutboundConfig,
        readRecordingKeepDays,
        parseRecordingKeepDays,
        DEFAULT_RECORDING_KEEP_DAYS,
        MAX_RECORDING_KEEP_DAYS,
        loadConfig,
        readPhoneTabMode,
        readRoutingState,
        writeRoutingState,
        DEFAULT_RING_SECONDS,
        MIN_RING_SECONDS,
        MAX_RING_SECONDS,
        DEFAULT_NOANSWER_MESSAGE,
        DEFAULT_RECORDING_NOTICE,
        DEFAULT_VOICEMAIL_GREETING,
        DEFAULT_VOICEMAIL_MAX_SECONDS,
        MIN_VOICEMAIL_MAX_SECONDS,
        MAX_VOICEMAIL_MAX_SECONDS,
        DEFAULT_OUTBOUND_NOTICE,
        MAX_OUTBOUND_NOTICE_LENGTH,
        defaultNoAnswerMessage,
        isDefaultNoAnswerMessage
    };
});
