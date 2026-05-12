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
define(['N/search', 'N/runtime', 'N/log', 'N/record', 'N/https', 'N/encode', 'N/llm', './lib/ctc_twilio_jwt', './lib/ctc_transcript_utils'], (search, runtime, log, record, https, encode, llm, twilioJwt, utils) => {

    /**
     * Load CTC configuration from the singleton config record.
     * @returns {Object} Config values
     * @throws {Error} If no active config record exists
     */
    const loadConfig = () => {
        const results = search.create({
            type: 'customrecord_ctc_config',
            filters: [['isinactive', 'is', 'F']],
            columns: [
                'custrecord_ctc_account_sid',
                'custrecord_ctc_auth_token',
                'custrecord_ctc_api_key_sid',
                'custrecord_ctc_api_secret_id',
                'custrecord_ctc_twiml_app_sid',
                'custrecord_ctc_phone_number',
                'custrecord_ctc_intel_service_sid'
            ]
        }).run().getRange({ start: 0, end: 1 });

        if (!results.length) {
            throw new Error('CTC config record not found or inactive');
        }

        const r = results[0];
        return {
            accountSid:      r.getValue('custrecord_ctc_account_sid'),
            authToken:       r.getValue('custrecord_ctc_auth_token'),
            apiKeySid:       r.getValue('custrecord_ctc_api_key_sid'),
            apiSecretId:     r.getValue('custrecord_ctc_api_secret_id'),
            twimlAppSid:     r.getValue('custrecord_ctc_twiml_app_sid'),
            phoneNumber:     r.getValue('custrecord_ctc_phone_number'),
            intelServiceSid: r.getValue('custrecord_ctc_intel_service_sid')
        };
    };

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

    const buildAuthHeader = (accountSid, authToken) => {
        const encoded = encode.convert({
            string: accountSid + ':' + authToken,
            inputEncoding: encode.Encoding.UTF_8,
            outputEncoding: encode.Encoding.BASE_64
        });
        return 'Basic ' + encoded;
    };

    /**
     * POST handler — routes to token generation, call logging, or transcript check.
     * @param {Object} requestBody
     * @returns {Object}
     */
    const post = (requestBody) => {
        const body = requestBody || {};

        if (body.action === 'logCall') {
            return logCall(body);
        }

        if (body.action === 'checkTranscript') {
            return checkTranscript(body);
        }

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

            if (body.entityType === 'contact' && body.entityId) {
                phoneCall.setValue({ fieldId: 'contact', value: body.entityId });
                const parentCompany = lookupContactCompany(body.entityId);
                if (parentCompany) {
                    phoneCall.setValue({ fieldId: 'company', value: parentCompany });
                }
            } else {
                if (body.entityId) {
                    phoneCall.setValue({ fieldId: 'company', value: body.entityId });
                }
                if (body.contactId) {
                    phoneCall.setValue({ fieldId: 'contact', value: body.contactId });
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
            const authHeader = buildAuthHeader(config.accountSid, config.authToken);

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
            const title = (analysis.title || analysis.summary || '').substring(0, 80) || `Call — ${recording.sid}`;
            phoneCall.setValue({ fieldId: 'title', value: title });
            phoneCall.setValue({ fieldId: 'custevent_ctc_recording_sid', value: recording.sid });
            phoneCall.setValue({ fieldId: 'custevent_ctc_recording_url',
                value: `${utils.TWILIO_API_BASE}/${config.accountSid}/Recordings/${recording.sid}.mp3` });
            phoneCall.setValue({ fieldId: 'custevent_ctc_transcript', value: transcriptText });
            phoneCall.setValue({ fieldId: 'custevent_ctc_ai_summary', value: analysis.summary || '' });
            phoneCall.setValue({ fieldId: 'custevent_ctc_satisfaction', value: analysis.satisfaction_score || 5 });
            phoneCall.setValue({ fieldId: 'custevent_ctc_tone_keywords', value: (analysis.tone_keywords || []).join(', ') });
            phoneCall.setValue({ fieldId: 'custevent_ctc_action_items', value: (analysis.action_items || []).join('\n') });
            phoneCall.setValue({ fieldId: 'custevent_ctc_processed', value: true });
            phoneCall.setValue({ fieldId: 'custevent_ctc_call_status', value: utils.CALL_STATUS.TRANSCRIBED });
            phoneCall.save();

            utils.deleteRecording(config.accountSid, recording.sid, authHeader);

            return { status: 'completed' };
        } catch (e) {
            log.error({ title: 'CTC Check Transcript Failed', details: e.message || e });
            return { error: 'Transcript check failed' };
        }
    };

    return { post };
});
