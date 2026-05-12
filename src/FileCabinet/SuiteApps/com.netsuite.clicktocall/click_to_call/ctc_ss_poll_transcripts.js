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
define(['N/https', 'N/record', 'N/search', 'N/llm', 'N/encode', 'N/log', './lib/ctc_transcript_utils', './lib/ctc_config'], (https, record, search, llm, encode, log, utils, ctcConfig) => {

    const loadConfig = ctcConfig.loadConfig;
    const buildAuthHeader = ctcConfig.buildAuthHeader;

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
        utils.writePhoneCallEnrichmentFields(phoneCall, {
            recording: recording,
            accountSid: config.accountSid,
            transcriptText: transcriptText,
            analysis: analysis,
            includeBrief: true,
            includeDuration: true
        });
        return phoneCall.save();
    };

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
                        markCallStatus(call.recordId, utils.CALL_STATUS.PROCESSING, false);
                        skipped++;
                        continue;
                    }

                    if (utils.isRecordingTerminal(recording)) {
                        markCallStatus(call.recordId, utils.CALL_STATUS.NO_TRANSCRIPT, true);
                        skipped++;
                        continue;
                    }

                    const transcript = utils.fetchTranscript(recording.sid, authHeader);
                    if (!transcript) {
                        markCallStatus(call.recordId, utils.CALL_STATUS.PROCESSING, false);
                        skipped++;
                        continue;
                    }

                    if (utils.isTranscriptTerminal(transcript)) {
                        markCallStatus(call.recordId, utils.CALL_STATUS.NO_TRANSCRIPT, true);
                        skipped++;
                        continue;
                    }

                    if (!utils.isTranscriptComplete(transcript)) {
                        markCallStatus(call.recordId, utils.CALL_STATUS.PROCESSING, false);
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
                    markCallStatus(call.recordId, utils.CALL_STATUS.FAILED, false);
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
