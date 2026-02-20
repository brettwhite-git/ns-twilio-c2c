/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @NModuleScope SameAccount
 *
 * Polls NetSuite for unprocessed Phone Call records (processed=false, call_sid not empty),
 * fetches transcripts via Twilio Conversational Intelligence, runs AI analysis with N/llm,
 * updates Phone Call activity records, and deletes processed recordings.
 */
// eslint-disable-next-line suitescript/no-log-module
define(['N/https', 'N/record', 'N/search', 'N/llm', 'N/encode', 'N/log', './lib/ctc_transcript_utils'], (https, record, search, llm, encode, log, utils) => {

    const loadConfig = () => {
        const results = search.create({
            type: 'customrecord_ctc_config',
            filters: [['isinactive', 'is', 'F']],
            columns: [
                'custrecord_ctc_account_sid',
                'custrecord_ctc_auth_token',
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
            twimlAppSid:     r.getValue('custrecord_ctc_twiml_app_sid'),
            phoneNumber:     r.getValue('custrecord_ctc_phone_number'),
            intelServiceSid: r.getValue('custrecord_ctc_intel_service_sid')
        };
    };

    const buildAuthHeader = (accountSid, authToken) => {
        const encoded = encode.convert({
            string: accountSid + ':' + authToken,
            inputEncoding: encode.Encoding.UTF_8,
            outputEncoding: encode.Encoding.BASE_64
        });
        return 'Basic ' + encoded;
    };

    const findUnprocessedCalls = () => {
        const results = search.create({
            type: search.Type.PHONE_CALL,
            filters: [
                ['custevent_ctc_processed', 'is', 'F'],
                'AND',
                ['custevent_ctc_call_sid', 'isnotempty', '']
            ],
            columns: ['internalid', 'custevent_ctc_call_sid']
        }).run().getRange({ start: 0, end: 50 });

        return results.map((r) => ({
            recordId: r.id,
            callSid: r.getValue('custevent_ctc_call_sid')
        }));
    };

    const updatePhoneCallRecord = (recordId, recording, config, transcriptText, analysis) => {
        const phoneCall = record.load({ type: record.Type.PHONE_CALL, id: recordId, isDynamic: true });

        let title = (analysis.title || '').substring(0, 80);
        if (!title) {
            const firstClause = (analysis.summary || '').split(/[.!?]/)[0] || '';
            title = firstClause.substring(0, 60) || `Call — ${recording.sid}`;
        }
        phoneCall.setValue({ fieldId: 'title', value: title });
        phoneCall.setValue({ fieldId: 'custevent_ctc_recording_sid', value: recording.sid });
        phoneCall.setValue({ fieldId: 'custevent_ctc_recording_url',
            value: `${utils.TWILIO_API_BASE}/${config.accountSid}/Recordings/${recording.sid}.mp3` });
        phoneCall.setValue({ fieldId: 'custevent_ctc_duration', value: parseInt(recording.duration, 10) });
        phoneCall.setValue({ fieldId: 'custevent_ctc_transcript', value: transcriptText });
        phoneCall.setValue({ fieldId: 'custevent_ctc_ai_summary', value: analysis.summary || '' });
        phoneCall.setValue({ fieldId: 'custevent_ctc_satisfaction', value: analysis.satisfaction_score || 5 });
        phoneCall.setValue({ fieldId: 'custevent_ctc_tone_keywords', value: (analysis.tone_keywords || []).join(', ') });
        phoneCall.setValue({ fieldId: 'custevent_ctc_action_items', value: (analysis.action_items || []).join('\n') });
        phoneCall.setValue({ fieldId: 'custevent_ctc_ai_brief', value: (analysis.brief || analysis.summary || '').substring(0, 120) });
        phoneCall.setValue({ fieldId: 'custevent_ctc_processed', value: true });

        return phoneCall.save();
    };

    const execute = () => {
        let processed = 0;
        let skipped = 0;
        let errors = 0;

        try {
            const config = loadConfig();
            const authHeader = buildAuthHeader(config.accountSid, config.authToken);
            const hasLlmQuota = llm.getRemainingFreeUsage() >= 10;

            if (!hasLlmQuota) {
                log.audit({ title: 'CTC LLM Quota Low', details: 'AI analysis will be skipped this cycle' });
            }

            const unprocessedCalls = findUnprocessedCalls();

            for (const call of unprocessedCalls) {
                try {
                    const recording = utils.fetchRecordingForCall(config.accountSid, call.callSid, authHeader);
                    if (!recording) {
                        skipped++;
                        continue;
                    }

                    const transcript = utils.fetchTranscript(recording.sid, authHeader);
                    if (!transcript) {
                        skipped++;
                        continue;
                    }

                    const sentences = utils.fetchSentences(transcript.sid, authHeader);
                    const transcriptText = utils.formatTranscript(sentences);

                    let analysis = {
                        summary: '',
                        brief: '',
                        satisfaction_score: 5,
                        tone_keywords: [],
                        action_items: []
                    };

                    if (hasLlmQuota && transcriptText) {
                        analysis = utils.analyzeTranscript(transcriptText);
                    }

                    updatePhoneCallRecord(call.recordId, recording, config, transcriptText, analysis);
                    utils.deleteRecording(config.accountSid, recording.sid, authHeader);
                    processed++;
                } catch (e) {
                    log.error({ title: 'CTC Call Processing Error', details: `${call.callSid}: ${e.message || e}` });
                    errors++;
                }
            }
        } catch (e) {
            log.error({ title: 'CTC Poll Execute Error', details: e.message || e });
        }

        log.audit({ title: 'CTC Poll Complete', details: `Processed: ${processed}, Skipped: ${skipped}, Errors: ${errors}` });
    };

    return { execute };
});
