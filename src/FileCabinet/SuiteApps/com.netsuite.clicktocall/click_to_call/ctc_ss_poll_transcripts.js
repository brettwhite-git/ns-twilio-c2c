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
define(['N/https', 'N/record', 'N/search', 'N/llm', 'N/encode', 'N/log', './lib/ctc_transcript_utils', './lib/ctc_config', './lib/ctc_twilio_admin'], (https, record, search, llm, encode, log, utils, ctcConfig, twilioAdmin) => {

    const loadConfig = ctcConfig.loadConfig;
    // Phase 2 U10: Auth Token removed. Use API Key SecureString path.
    const buildSecureAuthHeader = twilioAdmin.buildSecureAuthHeader;

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
            const authHeader = buildSecureAuthHeader(config);
            const hasLlmQuota = llm.getRemainingFreeUsage() >= 10;

            if (!hasLlmQuota) {
                log.audit({ title: 'CTC LLM Quota Low', details: 'AI analysis will be skipped this cycle' });
            }

            const unprocessedCalls = findUnprocessedCalls();

            // Sprint 2 U1 (HIGH-5) — idempotency guard against the
            // browser-poll vs scheduled-poll race. The browser-side
            // pollForTranscript can complete enrichment + delete the
            // Twilio recording at minute 3; this scheduled pass started
            // at minute 0 reaches the same call at minute 4 and would
            // otherwise see an empty Twilio recording response, flip
            // call_status to PROCESSING, and re-queue a call that is
            // already TRANSCRIBED. findUnprocessedCalls() filters by
            // processed=F at search time, but cannot close the TOCTOU
            // window between search execution and per-call processing.
            // Re-check the authoritative state immediately before any
            // mutation.
            //
            // TERMINAL_STATUSES excludes FAILED on purpose — a FAILED
            // call with processed=false should remain retry-eligible so
            // transient root causes can self-heal on a subsequent cycle.
            const TERMINAL_STATUSES = [
                utils.CALL_STATUS.TRANSCRIBED,
                utils.CALL_STATUS.NO_TRANSCRIPT
            ];

            for (const call of unprocessedCalls) {
                try {
                    const currentState = search.lookupFields({
                        type: record.Type.PHONE_CALL,
                        id: call.recordId,
                        columns: ['custevent_ctc_processed', 'custevent_ctc_call_status']
                    });
                    const alreadyProcessed = currentState && currentState.custevent_ctc_processed === true;
                    const callStatusRaw = currentState && currentState.custevent_ctc_call_status;
                    // lookupFields returns LIST values as [{ value, text }];
                    // FREEFORMTEXT/CHECKBOX returns the scalar directly. The
                    // call_status field is a CLOBTEXT/FREEFORMTEXT free-text
                    // value mirroring CALL_STATUS, so the scalar shape is
                    // what we expect — but coerce defensively.
                    const callStatus = Array.isArray(callStatusRaw)
                        ? (callStatusRaw[0] && (callStatusRaw[0].text || callStatusRaw[0].value)) || ''
                        : (callStatusRaw || '');
                    if (alreadyProcessed || TERMINAL_STATUSES.indexOf(callStatus) !== -1) {
                        log.debug({
                            title: 'CTC Skip — already terminal',
                            details: `${call.recordId} processed=${alreadyProcessed} status=${callStatus}`
                        });
                        skipped++;
                        continue;
                    }

                    const recording = utils.fetchRecordingForCall(config.accountSid, call.callSid, authHeader);
                    // Sprint 2b (HIGH-1) — distinguish transient Twilio errors
                    // (5xx / network / timeout / malformed JSON) from "no
                    // recording yet." For transient: leave call_status
                    // untouched so the next cycle picks it up cleanly,
                    // instead of churning every call to PROCESSING during
                    // a sustained Twilio outage.
                    if (utils.isTransientError(recording)) {
                        skipped++;
                        continue;
                    }
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
                    if (utils.isTransientError(transcript)) {
                        skipped++;
                        continue;
                    }
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
