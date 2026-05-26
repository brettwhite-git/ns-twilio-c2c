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
define(['N/https', 'N/record', 'N/search', 'N/llm', 'N/encode', 'N/log', 'N/runtime', 'N/task', './lib/ctc_transcript_utils', './lib/ctc_config', './lib/ctc_twilio_admin', './lib/ctc_call_ownership'], (https, record, search, llm, encode, log, runtime, task, utils, ctcConfig, twilioAdmin, callOwnership) => {

    const loadConfig = ctcConfig.loadConfig;
    // Phase 2 U10: Auth Token removed. Use API Key SecureString path.
    const buildSecureAuthHeader = twilioAdmin.buildSecureAuthHeader;

    // Sprint 2 U2 (HIGH-6) — governance ceiling guard.
    //
    // Per-call cost ≈ 1 record.load + 1 record.save + 1-3 https.get +
    // 1 https.delete + 1 llm.generateText + N record.create for
    // proposed tasks ≈ 200-600 governance units. 50-call batch can
    // easily blow the 10,000-unit ceiling under load; mid-execution
    // death leaves the last in-flight call in whatever partial state
    // was last written.
    //
    // 1,000 units leaves headroom for the loop's final iteration plus
    // the task.create call itself. NetSuite's scheduled-script
    // governance unit is the standard ceiling — see SAFE Guide §2.
    const GOVERNANCE_THRESHOLD = 1000;
    const SCRIPT_ID = 'customscript_ctc_ss_poll';
    const DEPLOY_ID = 'customdeploy_ctc_ss_poll';

    const shouldYield = () => {
        const script = runtime.getCurrentScript();
        return script.getRemainingUsage() < GOVERNANCE_THRESHOLD;
    };

    const enqueueResume = () => {
        try {
            task.create({
                taskType: task.TaskType.SCHEDULED_SCRIPT,
                scriptId: SCRIPT_ID,
                deploymentId: DEPLOY_ID
            }).submit();
            log.audit({
                title: 'CTC Governance Yield',
                details: 'Approaching governance ceiling — enqueued immediate resume via task.create'
            });
        } catch (e) {
            // Concurrent SCHEDULED_SCRIPT enqueue may collide
            // (NetSuite allows only one pending instance per
            // deployment). Falling through is fine — the next
            // scheduled cycle (15 min) will pick up the remaining
            // unprocessed calls naturally.
            log.error({
                title: 'CTC Governance Resume Failed',
                details: `${e.name || ''}: ${e.message || e} — relying on next scheduled cycle`
            });
        }
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

    /**
     * Sprint 2 U4 (HIGH-4) — find Phone Call records where the
     * Twilio Recording DELETE failed transiently on a prior cycle.
     * The cleanup-retry pass runs after the main loop and retries
     * the DELETE for each row; on success or confirmed 404 (already
     * gone), the flag clears. Cap at 50 rows to match the main-loop
     * batch size and stay within governance budget.
     */
    const findCleanupPendingCalls = () => {
        const results = search.create({
            type: search.Type.PHONE_CALL,
            filters: [
                ['custevent_ctc_recording_cleanup_pending', 'is', 'T'],
                'AND',
                ['custevent_ctc_recording_sid', 'isnotempty', ''],
                'AND',
                // Sprint 2 review P0 #2 — guard against destructive
                // flag-flip exploit. Without this filter, any internal
                // script with Phone Call edit access could set
                // cleanup_pending=T on an in-flight call (processed=F)
                // and trigger the cleanup pass to DELETE the Twilio
                // recording before transcription completes. Recording
                // is unrecoverable. The cleanup-retry path only makes
                // sense AFTER enrichment is complete (processed=T) —
                // before that, the main loop should still own deletion.
                ['custevent_ctc_processed', 'is', 'T']
            ],
            columns: ['internalid', 'custevent_ctc_recording_sid']
        }).run().getRange({ start: 0, end: 50 });

        return results.map((r) => ({
            recordId: r.id,
            recordingSid: r.getValue('custevent_ctc_recording_sid')
        }));
    };

    /**
     * Sprint 2 U5 (HIGH-13) — find orphan-call rows where the
     * RESTlet's logCall failed to save the Phone Call record. The
     * orphan-retry pass re-attempts the create with the persisted
     * metadata. Cap at 50 rows + retryCount<3 (admin triage above
     * the cap). Honors shouldYield from U2.
     */
    const findOrphanCalls = () => {
        const results = search.create({
            type: 'customrecord_ctc_orphan_call',
            filters: [
                ['custrecord_ctc_orphan_retrycount', 'lessthan', 3]
            ],
            columns: [
                'internalid',
                'custrecord_ctc_orphan_callsid',
                'custrecord_ctc_orphan_recordingsid',
                'custrecord_ctc_orphan_entityid',
                'custrecord_ctc_orphan_entitytype',
                'custrecord_ctc_orphan_userid',
                'custrecord_ctc_orphan_phone',
                'custrecord_ctc_orphan_direction',
                'custrecord_ctc_orphan_retrycount',
                // Sprint 2 review #3 — additional fields for full
                // Phone Call reconstruction during retry.
                'custrecord_ctc_orphan_contactid',
                'custrecord_ctc_orphan_duration'
            ]
        }).run().getRange({ start: 0, end: 50 });

        return results.map((r) => ({
            recordId: r.id,
            callSid: r.getValue('custrecord_ctc_orphan_callsid'),
            recordingSid: r.getValue('custrecord_ctc_orphan_recordingsid'),
            entityId: r.getValue('custrecord_ctc_orphan_entityid'),
            entityType: r.getValue('custrecord_ctc_orphan_entitytype'),
            userId: r.getValue('custrecord_ctc_orphan_userid'),
            phone: r.getValue('custrecord_ctc_orphan_phone'),
            direction: r.getValue('custrecord_ctc_orphan_direction'),
            retryCount: parseInt(r.getValue('custrecord_ctc_orphan_retrycount'), 10) || 0,
            contactId: parseInt(r.getValue('custrecord_ctc_orphan_contactid'), 10) || 0,
            duration: parseInt(r.getValue('custrecord_ctc_orphan_duration'), 10) || 0
        }));
    };

    /**
     * Sprint 2 review #3 — restore the parent-company lookup that
     * the RESTlet's logCall does for contact-entityType calls. Without
     * this, recreated Phone Calls for contact entities lose the
     * `company` link (sales rollups attribute to the contact only,
     * not the parent customer).
     */
    const lookupContactCompany = (contactId) => {
        try {
            const result = search.lookupFields({
                type: 'contact',
                id: contactId,
                columns: ['company']
            });
            if (result && result.company && result.company.length) {
                return result.company[0].value;
            }
            return null;
        } catch (e) {
            log.error({ title: 'CTC lookupContactCompany failed', details: (e && e.message) || String(e) });
            return null;
        }
    };

    /**
     * Idempotency check before recreating a Phone Call from an
     * orphan row — the in-flight save might have actually succeeded
     * (e.g., the save returned but a network error stole the
     * recordId from the RESTlet's response). Skip the orphan if a
     * Phone Call with this callSid already exists.
     */
    const findPhoneCallByCallSid = (callSid) => {
        const results = search.create({
            type: search.Type.PHONE_CALL,
            filters: [['custevent_ctc_call_sid', 'is', callSid]],
            columns: ['internalid']
        }).run().getRange({ start: 0, end: 1 });
        return results.length ? results[0].id : null;
    };

    const recreatePhoneCallFromOrphan = (orphan) => {
        const phoneCall = record.create({ type: record.Type.PHONE_CALL, isDynamic: true });
        phoneCall.setValue({ fieldId: 'title', value: 'Call to ' + (orphan.phone || 'unknown') });
        phoneCall.setValue({ fieldId: 'status', value: 'COMPLETE' });
        phoneCall.setValue({ fieldId: 'phone', value: orphan.phone || '' });
        phoneCall.setValue({ fieldId: 'custevent_ctc_call_sid', value: orphan.callSid });
        phoneCall.setValue({ fieldId: 'custevent_ctc_processed', value: false });
        phoneCall.setValue({ fieldId: 'custevent_ctc_call_status', value: utils.CALL_STATUS.LOGGED });

        // Sprint 2 review #3 — wire userId → assigned + restore
        // duration. Without these, recreated Phone Calls have no rep
        // owner (sales activity rollups misattribute) and no duration
        // (breaks duration-based reporting). Mirrors RESTlet logCall.
        // Sprint 2 review ORPHAN-B — assigned is also frequently
        // mandatory on Phone Call; setting it here closes the gap.
        const userIdNumeric = parseInt(orphan.userId, 10);
        if (userIdNumeric && userIdNumeric > 0) {
            phoneCall.setValue({ fieldId: 'assigned', value: userIdNumeric });
        }
        if (orphan.duration > 0) {
            phoneCall.setValue({ fieldId: 'custevent_ctc_duration', value: orphan.duration });
        }
        if (orphan.recordingSid) {
            phoneCall.setValue({ fieldId: 'custevent_ctc_recording_sid', value: orphan.recordingSid });
        }
        // Entity link — same numeric-id guard logic as the RESTlet.
        // Sprint 2 review #3 — for contact-entityType, ALSO look up
        // and set the parent company (sales rollups need both links).
        // For non-contact, ALSO set the secondary contact if persisted.
        const entityId = parseInt(orphan.entityId, 10);
        if (entityId && entityId > 0) {
            if (orphan.entityType === 'contact') {
                phoneCall.setValue({ fieldId: 'contact', value: entityId });
                const parentCompany = lookupContactCompany(entityId);
                if (parentCompany) {
                    phoneCall.setValue({ fieldId: 'company', value: parentCompany });
                }
            } else {
                phoneCall.setValue({ fieldId: 'company', value: entityId });
                if (orphan.contactId > 0) {
                    phoneCall.setValue({ fieldId: 'contact', value: orphan.contactId });
                }
            }
        }
        return phoneCall.save();
    };

    /**
     * Sprint 2 review #5 — extracted orphan-row processing so the
     * reordered Phase B pass and the test surface share one
     * implementation. Returns one of: 'resolved' (recreate succeeded),
     * 'rejected' (verifyCallOwnership failed), 'failed' (recreate
     * threw), 'duplicate' (dedup branch).
     */
    const processOrphanRow = (orphan) => {
        // Dedup: skip + delete orphan if a Phone Call already
        // exists for this callSid (the original save succeeded
        // despite the exception).
        try {
            const existingId = findPhoneCallByCallSid(orphan.callSid);
            if (existingId) {
                try {
                    record.delete({ type: 'customrecord_ctc_orphan_call', id: orphan.recordId });
                } catch (delErr) {
                    log.error({ title: 'CTC Orphan dedup delete failed', details: (delErr && delErr.message) || String(delErr) });
                }
                log.audit({
                    title: 'CTC Orphan Resolved — duplicate',
                    details: `orphan=${orphan.recordId} existingPhoneCall=${existingId}`
                });
                return 'duplicate';
            }
        } catch (lookupErr) {
            log.error({ title: 'CTC Orphan dedup lookup failed', details: (lookupErr && lookupErr.message) || String(lookupErr) });
            // Fall through to retry — failing-loud beats skipping
            // a real orphan.
        }

        // Sprint 2 review P0 #1 (Option B) — re-verify call
        // ownership on the retry path. Without this gate, anyone
        // with NONENEEDED write access to the orphan record
        // (forced by SuiteApp + custom-role constraint) could
        // forge a row with stolen callSid + attacker userId +
        // target entityId, and we would obligingly create a
        // Phone Call from it — reopening Sprint 1's CRIT-2.
        const auth = callOwnership.verifyCallOwnership(orphan.callSid, orphan.userId);
        if (!auth.ok) {
            log.audit({
                title: 'CTC Orphan rejected — verifyCallOwnership failed',
                details: `orphan=${orphan.recordId} callSid=${orphan.callSid} userId=${orphan.userId} reason=${auth.reason}`
            });
            const newRetryCount = orphan.retryCount + 1;
            try {
                record.submitFields({
                    type: 'customrecord_ctc_orphan_call',
                    id: orphan.recordId,
                    values: { custrecord_ctc_orphan_retrycount: newRetryCount },
                    options: { enableSourcing: false, ignoreMandatoryFields: true }
                });
            } catch (incErr) {
                log.error({ title: 'CTC Orphan retryCount inc failed', details: (incErr && incErr.message) || String(incErr) });
            }
            if (newRetryCount >= 3) {
                log.error({
                    title: 'CTC Orphan rejected (cap reached) — admin triage',
                    details: `orphan=${orphan.recordId} callSid=${orphan.callSid} reason=${auth.reason}`
                });
            }
            return 'rejected';
        }

        // Sprint 2 review #4 — narrowed try/catch. Recreate is one
        // try; delete is a separate try. Delete failure must NOT
        // increment retryCount on a row whose recreate succeeded.
        let recreatedId;
        try {
            recreatedId = recreatePhoneCallFromOrphan(orphan);
        } catch (recreateErr) {
            const newRetryCount = orphan.retryCount + 1;
            try {
                record.submitFields({
                    type: 'customrecord_ctc_orphan_call',
                    id: orphan.recordId,
                    values: { custrecord_ctc_orphan_retrycount: newRetryCount },
                    options: { enableSourcing: false, ignoreMandatoryFields: true }
                });
            } catch (incErr) {
                log.error({ title: 'CTC Orphan retryCount inc failed', details: (incErr && incErr.message) || String(incErr) });
            }
            if (newRetryCount >= 3) {
                log.error({
                    title: 'CTC Orphan retry cap reached — admin triage',
                    details: `orphan=${orphan.recordId} callSid=${orphan.callSid} err=${(recreateErr && recreateErr.message) || recreateErr}`
                });
            } else {
                log.error({
                    title: 'CTC Orphan retry failed',
                    details: `orphan=${orphan.recordId} retryCount=${newRetryCount} err=${(recreateErr && recreateErr.message) || recreateErr}`
                });
            }
            return 'failed';
        }

        // Recreate succeeded. Delete the orphan row in its own try.
        try {
            record.delete({ type: 'customrecord_ctc_orphan_call', id: orphan.recordId });
        } catch (delErr) {
            log.error({
                title: 'CTC Orphan delete failed (Phone Call recreated, dedup will self-heal next cycle)',
                details: `orphan=${orphan.recordId} phoneCall=${recreatedId} err=${(delErr && delErr.message) || delErr}`
            });
        }
        log.audit({
            title: 'CTC Orphan Resolved — recreated',
            details: `orphan=${orphan.recordId} callSid=${orphan.callSid} phoneCall=${recreatedId}`
        });
        return 'resolved';
    };

    const markCleanupPending = (recordId, pending) => {
        try {
            record.submitFields({
                type: record.Type.PHONE_CALL,
                id: recordId,
                values: { custevent_ctc_recording_cleanup_pending: !!pending },
                options: { enableSourcing: false, ignoreMandatoryFields: true }
            });
        } catch (e) {
            log.error({ title: 'CTC Mark Cleanup Pending Failed', details: `${recordId}: ${(e && e.message) || e}` });
        }
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
        // Sprint 2 review #7 — counters for all three passes, exposed
        // in the final audit message so admins can see when retry
        // passes are doing work or stuck.
        let processed = 0;
        let skipped = 0;
        let errors = 0;
        let cleanupResolved = 0;
        let cleanupTransient = 0;
        let orphanResolved = 0;
        let orphanFailed = 0;
        let orphanRejected = 0;

        try {
            const config = loadConfig();
            const authHeader = buildSecureAuthHeader(config);
            const hasLlmQuota = llm.getRemainingFreeUsage() >= 10;

            if (!hasLlmQuota) {
                log.audit({ title: 'CTC LLM Quota Low', details: 'AI analysis will be skipped this cycle' });
            }

            // Sprint 2 review #5 — REORDERED execute() passes.
            //
            // Old order: main loop → cleanup → orphan. When main
            // loop yielded mid-batch (governance pressure), cleanup
            // and orphan passes were starved because they sit AFTER
            // it in the execution order.
            //
            // New order: cleanup → orphan → main. Retry passes are
            // bounded (max 50 rows each), tend to be empty in
            // healthy steady state (especially after ORPHAN-A/B
            // discriminate which save failures are queued), and
            // when non-empty represent operational backlog that
            // benefits from prompt drain. Main loop runs last with
            // whatever budget remains; unprocessed calls re-queue
            // naturally for the next cycle if main is starved.

            // ─────────────────────────────────────────────────────
            // Phase A — cleanup-pending retry pass
            // (Sprint 2 U4 / HIGH-4)
            // ─────────────────────────────────────────────────────
            const cleanupPendingCalls = findCleanupPendingCalls();
            for (const pending of cleanupPendingCalls) {
                if (shouldYield()) {
                    enqueueResume();
                    break;
                }
                try {
                    const retryResult = utils.deleteRecording(config.accountSid, pending.recordingSid, authHeader);
                    if (utils.isTransientError(retryResult)) {
                        cleanupTransient++;
                        continue;
                    }
                    markCleanupPending(pending.recordId, false);
                    cleanupResolved++;
                    log.audit({
                        title: 'CTC Recording Cleanup Resolved',
                        details: `${pending.recordId} recording=${pending.recordingSid} result=${retryResult === true ? 'deleted' : retryResult === null ? 'gone' : '4xx'}`
                    });
                } catch (e) {
                    log.error({ title: 'CTC Cleanup Retry Error', details: `${pending.recordingSid}: ${(e && e.message) || e}` });
                }
            }

            // ─────────────────────────────────────────────────────
            // Phase B — orphan Phone Call retry pass
            // (Sprint 2 U5 / HIGH-13)
            // ─────────────────────────────────────────────────────
            const orphans = findOrphanCalls();
            for (const orphan of orphans) {
                if (shouldYield()) {
                    enqueueResume();
                    break;
                }
                const retryResult = processOrphanRow(orphan);
                if (retryResult === 'resolved') orphanResolved++;
                else if (retryResult === 'rejected') orphanRejected++;
                else if (retryResult === 'failed') orphanFailed++;
            }

            // ─────────────────────────────────────────────────────
            // Phase C — main unprocessed-call processing
            // (U1 race-window guard + U2 governance yield)
            // ─────────────────────────────────────────────────────
            const unprocessedCalls = findUnprocessedCalls();

            // TERMINAL_STATUSES excludes FAILED on purpose — a FAILED
            // call with processed=false should remain retry-eligible so
            // transient root causes can self-heal on a subsequent cycle.
            const TERMINAL_STATUSES = [
                utils.CALL_STATUS.TRANSCRIBED,
                utils.CALL_STATUS.NO_TRANSCRIPT
            ];

            for (const call of unprocessedCalls) {
                // Sprint 2 U2 (HIGH-6) — yield before the next call to
                // protect the in-flight Phone Call from mid-write
                // governance death. Resume via task.create so the
                // remaining slice processes within ~1 minute instead
                // of waiting for the next 15-minute interval.
                if (shouldYield()) {
                    enqueueResume();
                    break;
                }
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

                    // Sprint 2 U4 (HIGH-4) — handle the new deleteRecording
                    // return shape. TRANSIENT_ERROR means we couldn't reach
                    // Twilio to confirm the delete; set the cleanup_pending
                    // flag so the next cycle's retry pass picks it up.
                    // Any other return (true / null / false) means we have
                    // an authoritative answer from Twilio — nothing to retry.
                    const deleteResult = utils.deleteRecording(config.accountSid, recording.sid, authHeader);
                    if (utils.isTransientError(deleteResult)) {
                        markCleanupPending(call.recordId, true);
                    }
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

        // Sprint 2 review #7 — audit summary now includes ALL three
        // passes. Admins see at a glance whether retry passes did
        // work this cycle, vs only the main loop. Pre-fix, the
        // summary only reported the main loop's counters, masking
        // silent retry failures.
        log.audit({
            title: 'CTC Poll Complete',
            details: `main(processed=${processed}, skipped=${skipped}, errors=${errors}) ` +
                     `cleanup(resolved=${cleanupResolved}, transient=${cleanupTransient}) ` +
                     `orphan(resolved=${orphanResolved}, failed=${orphanFailed}, rejected=${orphanRejected})`
        });
    };

    return { execute };
});
