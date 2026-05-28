import scheduledScript from 'SuiteScripts/ctc_ss_poll_transcripts';
import https from 'N/https';
import record from 'N/record';
import search from 'N/search';
import llm from 'N/llm';
import encode from 'N/encode';
import log from 'N/log';
import runtime from 'N/runtime';
import task from 'N/task';

jest.mock('N/https');
jest.mock('N/record');
jest.mock('N/search');
jest.mock('N/llm');
jest.mock('N/encode');
jest.mock('N/log');
jest.mock('N/runtime');
jest.mock('N/task');
jest.mock('SuiteScripts/lib/ctc_transcript_utils');
jest.mock('SuiteScripts/lib/ctc_twilio_admin', () => ({
    // U10: buildSecureAuthHeader replaces the legacy buildAuthHeader.
    buildSecureAuthHeader: jest.fn().mockReturnValue('__SECURESTRING_AUTH__')
}));
// Sprint 2 review P0 #1 (Option B) — orphan retry gate.
// Default mock returns ok:true so existing orphan-retry tests
// pass through unchanged; per-test overrides simulate the
// rejection path.
jest.mock('SuiteScripts/lib/ctc_call_ownership', () => ({
    verifyCallOwnership: jest.fn().mockReturnValue({ ok: true, call: { from: 'client:42' } })
}));

const utils = require('SuiteScripts/lib/ctc_transcript_utils');
const callOwnership = require('SuiteScripts/lib/ctc_call_ownership');

describe('ctc_ss_poll_transcripts', () => {

    const MOCK_CONFIG = {
        custrecord_ctc_account_sid: 'AC_test_account',
        custrecord_ctc_api_key_sid: 'SK_test_key',
        custrecord_ctc_api_secret_id: 'custsecret_ctc_api_key_secret',
        custrecord_ctc_twiml_app_sid: 'AP_test_app',
        custrecord_ctc_phone_number: '+15551234567',
        custrecord_ctc_intel_service_sid: 'GA_test_intel'
    };

    const mockConfigResult = {
        getValue: jest.fn((field) => MOCK_CONFIG[field] || '')
    };

    const MOCK_RECORDING = {
        sid: 'RE_test_recording_001',
        duration: '120',
        call_sid: 'CA_test_call_001'
    };

    const MOCK_TRANSCRIPT = {
        sid: 'GT_test_transcript_001',
        status: 'completed'
    };

    const MOCK_ANALYSIS = {
        title: 'Product feature inquiry — engaged prospect',
        brief: 'Customer asked about features, rep provided overview and will follow up',
        summary: 'Customer inquired about product features. Rep provided overview.',
        satisfaction_score: 7,
        tone_keywords: ['interested', 'helpful', 'engaged'],
        action_items: ['Send product brochure', 'Schedule follow-up call']
    };

    let mockConfigSearchRun;
    let mockUnprocessedSearchRun;
    let mockCleanupPendingSearchRun;
    let mockOrphanSearchRun;
    let mockPhoneCallByCallSidSearchRun;
    let mockPhoneCall;

    beforeEach(() => {
        jest.clearAllMocks();

        // Config search
        mockConfigSearchRun = {
            getRange: jest.fn().mockReturnValue([mockConfigResult])
        };

        // Unprocessed calls search — returns one call by default
        mockUnprocessedSearchRun = {
            getRange: jest.fn().mockReturnValue([{
                id: '12345',
                getValue: jest.fn((field) => {
                    if (field === 'custevent_ctc_call_sid') return 'CA_test_call_001';
                    return '';
                })
            }])
        };

        // Sprint 2 U4 (HIGH-4) — cleanup-pending search. Default
        // returns empty so existing tests don't unexpectedly enter
        // the cleanup-retry pass.
        mockCleanupPendingSearchRun = {
            getRange: jest.fn().mockReturnValue([])
        };

        // Sprint 2 U5 (HIGH-13) — orphan search + dedup-lookup
        // search. Both default to empty.
        mockOrphanSearchRun = {
            getRange: jest.fn().mockReturnValue([])
        };
        mockPhoneCallByCallSidSearchRun = {
            getRange: jest.fn().mockReturnValue([])
        };

        search.create.mockImplementation((opts) => {
            if (opts.type === 'customrecord_ctc_config') {
                return { run: jest.fn().mockReturnValue(mockConfigSearchRun) };
            }
            if (opts.type === 'customrecord_ctc_orphan_call') {
                return { run: jest.fn().mockReturnValue(mockOrphanSearchRun) };
            }
            // Distinguish cleanup-pending search from the unprocessed
            // search by inspecting the filter array. Cleanup-pending
            // filters on custevent_ctc_recording_cleanup_pending=T.
            const filterStr = JSON.stringify(opts.filters || []);
            if (filterStr.indexOf('custevent_ctc_recording_cleanup_pending') !== -1) {
                return { run: jest.fn().mockReturnValue(mockCleanupPendingSearchRun) };
            }
            // Phone Call by callSid dedup lookup — single equality filter
            // on custevent_ctc_call_sid (U5).
            if (filterStr.indexOf('custevent_ctc_call_sid') !== -1
                && filterStr.indexOf('is') !== -1
                && filterStr.indexOf('isnotempty') === -1) {
                return { run: jest.fn().mockReturnValue(mockPhoneCallByCallSidSearchRun) };
            }
            // Unprocessed Phone Call search (default)
            return { run: jest.fn().mockReturnValue(mockUnprocessedSearchRun) };
        });

        search.Type = { PHONE_CALL: 'phonecall' };

        // Sprint 2 U1 (HIGH-5) — race-window idempotency guard. The
        // scheduled loop now calls search.lookupFields immediately
        // before any per-call mutation. Default mock returns the
        // non-terminal state so existing happy-path tests pass through
        // the guard unchanged.
        search.lookupFields = jest.fn().mockReturnValue({
            custevent_ctc_processed: false,
            custevent_ctc_call_status: 'Logged'
        });

        // Sprint 2 review #3 — recreatePhoneCallFromOrphan calls
        // search.lookupFields for contact-entityType orphans to
        // resolve the parent company. Default mock returns no
        // company so the test doesn't unexpectedly set the field.
        search.lookupFields.mockImplementation((opts) => {
            if (opts && opts.type === 'contact') {
                return { company: [] };
            }
            return {
                custevent_ctc_processed: false,
                custevent_ctc_call_status: 'Logged'
            };
        });

        // Sprint 2 U2 (HIGH-6) — governance ceiling guard. Default
        // mock returns plenty of headroom so existing tests run the
        // full loop. Per-test overrides simulate low budget.
        runtime.getCurrentScript = jest.fn().mockReturnValue({
            getRemainingUsage: jest.fn().mockReturnValue(9000)
        });
        task.TaskType = { SCHEDULED_SCRIPT: 'SCHEDULED_SCRIPT' };
        task.create = jest.fn().mockReturnValue({
            submit: jest.fn().mockReturnValue('TASK_ID_001')
        });

        encode.convert.mockReturnValue('QUNX0dGVzdF9hY2NvdW50OmF1dGhfdG9rZW5fMTIz');
        encode.Encoding = { UTF_8: 'UTF_8', BASE_64: 'BASE_64' };

        llm.getRemainingFreeUsage.mockReturnValue(100);
        llm.ModelFamily = { COHERE_COMMAND: 'COHERE_COMMAND' };

        // Utils mocks
        utils.TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01/Accounts';
        utils.CALL_STATUS = {
            LOGGED: 'Logged',
            PROCESSING: 'Processing',
            TRANSCRIBED: 'Transcribed',
            NO_TRANSCRIPT: 'No transcript',
            FAILED: 'Failed'
        };
        utils.fetchRecordingForCall.mockReturnValue(MOCK_RECORDING);
        utils.fetchTranscript.mockReturnValue(MOCK_TRANSCRIPT);
        utils.fetchSentences.mockReturnValue([
            { media_channel: 1, transcript: 'Hello' },
            { media_channel: 2, transcript: 'Hi there' }
        ]);
        utils.formatTranscript.mockReturnValue('[REP] Hello\n[CUSTOMER] Hi there');
        utils.analyzeTranscript.mockReturnValue(MOCK_ANALYSIS);
        // Sprint 2 U4 (HIGH-4) — deleteRecording now returns a status
        // sentinel. Default mock returns true (delete succeeded) so
        // existing tests don't trigger the cleanup_pending flag path.
        utils.deleteRecording.mockReturnValue(true);
        // Expose TRANSIENT_ERROR sentinel for U4 cleanup-retry tests.
        // The real lib/ctc_transcript_utils freezes a { __ctc_transient }
        // object; we mirror that shape so === identity works.
        utils.TRANSIENT_ERROR = Object.freeze({ __ctc_transient: true });
        utils.isTransientError = jest.fn().mockImplementation((v) => v === utils.TRANSIENT_ERROR);
        utils.isRecordingTerminal = jest.fn().mockReturnValue(false);
        utils.isTranscriptTerminal = jest.fn().mockReturnValue(false);
        utils.isTranscriptComplete = jest.fn().mockReturnValue(true);
        // Mirror the real lib/ctc_transcript_utils.writePhoneCallEnrichmentFields
        // so existing assertions on setValue still pass after the refactor.
        utils.writePhoneCallEnrichmentFields = jest.fn((rec, opts) => {
            const r = opts.recording || {};
            const a = opts.analysis || {};
            let title = (a.title || '').substring(0, 80);
            if (!title) {
                const firstClause = (a.summary || '').split(/[.!?]/)[0] || '';
                title = firstClause.substring(0, 60) || `Call — ${r.sid}`;
            }
            rec.setValue({ fieldId: 'title', value: title });
            rec.setValue({ fieldId: 'custevent_ctc_recording_sid', value: r.sid });
            rec.setValue({ fieldId: 'custevent_ctc_recording_url',
                value: `${utils.TWILIO_API_BASE}/${opts.accountSid}/Recordings/${r.sid}.mp3` });
            if (opts.includeDuration && r.duration != null) {
                rec.setValue({ fieldId: 'custevent_ctc_duration', value: parseInt(r.duration, 10) });
            }
            rec.setValue({ fieldId: 'custevent_ctc_transcript', value: opts.transcriptText || '' });
            rec.setValue({ fieldId: 'custevent_ctc_ai_summary', value: a.summary || '' });
            rec.setValue({ fieldId: 'custevent_ctc_satisfaction', value: a.satisfaction_score || 5 });
            rec.setValue({ fieldId: 'custevent_ctc_tone_keywords', value: (a.tone_keywords || []).join(', ') });
            rec.setValue({ fieldId: 'custevent_ctc_action_items', value: (a.action_items || []).join('\n') });
            if (opts.includeBrief) {
                rec.setValue({ fieldId: 'custevent_ctc_ai_brief', value: (a.brief || a.summary || '').substring(0, 120) });
            }
            rec.setValue({ fieldId: 'custevent_ctc_processed', value: true });
            rec.setValue({ fieldId: 'custevent_ctc_call_status', value: utils.CALL_STATUS.TRANSCRIBED });
        });

        // N/record
        mockPhoneCall = {
            setValue: jest.fn(),
            save: jest.fn().mockReturnValue(12345)
        };
        record.load = jest.fn().mockReturnValue(mockPhoneCall);
        record.submitFields = jest.fn();
        record.Type = { PHONE_CALL: 'phonecall' };
        // Sprint 2 U5 — record.create + record.delete are exercised
        // by the orphan retry pass. Mock to avoid throws on calls
        // that don't override these.
        record.create = jest.fn().mockReturnValue(mockPhoneCall);
        record.delete = jest.fn();
    });

    describe('HIGH-13 orphan Phone Call retry pass', () => {
        // Sprint 2 U5 — when the RESTlet's logCall throws on
        // phoneCall.save(), an orphan row is persisted. This pass
        // walks orphan rows, dedups against existing Phone Calls,
        // recreates the Phone Call, and deletes the orphan on
        // success. retryCount caps at 3 — beyond that the row
        // stays for admin triage.

        const buildOrphanRow = (overrides) => {
            const base = {
                recordId: '88888',
                callSid: 'CA_orphan_001',
                recordingSid: 'RE_orphan_001',
                entityId: '500',
                entityType: 'customer',
                userId: '42',
                phone: '+15551234567',
                direction: 'outbound',
                retryCount: 0
            };
            const row = Object.assign(base, overrides);
            return {
                id: row.recordId,
                getValue: jest.fn((field) => {
                    const map = {
                        custrecord_ctc_orphan_callsid: row.callSid,
                        custrecord_ctc_orphan_recordingsid: row.recordingSid,
                        custrecord_ctc_orphan_entityid: row.entityId,
                        custrecord_ctc_orphan_entitytype: row.entityType,
                        custrecord_ctc_orphan_userid: row.userId,
                        custrecord_ctc_orphan_phone: row.phone,
                        custrecord_ctc_orphan_direction: row.direction,
                        custrecord_ctc_orphan_retrycount: row.retryCount
                    };
                    return map[field] !== undefined ? map[field] : '';
                })
            };
        };

        beforeEach(() => {
            // Main loop empty — orphan pass is the only work
            mockUnprocessedSearchRun.getRange.mockReturnValue([]);
            // Sprint 2 review P0 #1 (Option B) — default ownership
            // check passes. Per-test overrides simulate rejection.
            callOwnership.verifyCallOwnership.mockReturnValue({ ok: true, call: { from: 'client:42' } });
        });

        it('recreates Phone Call and deletes orphan on successful retry', () => {
            mockOrphanSearchRun.getRange.mockReturnValue([buildOrphanRow({})]);
            // Recreate path: record.create returns a fresh Phone Call
            const recreatedPhoneCall = {
                setValue: jest.fn(),
                save: jest.fn().mockReturnValue(444444)
            };
            record.create.mockReturnValue(recreatedPhoneCall);

            scheduledScript.execute();

            expect(record.create).toHaveBeenCalledWith({ type: 'phonecall', isDynamic: true });
            expect(recreatedPhoneCall.save).toHaveBeenCalled();
            // Orphan row deleted
            expect(record.delete).toHaveBeenCalledWith({
                type: 'customrecord_ctc_orphan_call',
                id: '88888'
            });
        });

        it('skips orphan when a Phone Call already exists for this callSid (dedup)', () => {
            mockOrphanSearchRun.getRange.mockReturnValue([buildOrphanRow({})]);
            // Phone Call dedup lookup finds an existing record
            mockPhoneCallByCallSidSearchRun.getRange.mockReturnValue([
                { id: '999999' }
            ]);

            scheduledScript.execute();

            // No record.create for phonecall (dedup branch deletes
            // the orphan without recreating)
            const phoneCallCreates = record.create.mock.calls.filter(
                (c) => c[0] && c[0].type === 'phonecall'
            );
            expect(phoneCallCreates).toHaveLength(0);
            // Orphan still deleted (dedup branch)
            expect(record.delete).toHaveBeenCalledWith({
                type: 'customrecord_ctc_orphan_call',
                id: '88888'
            });
        });

        it('increments retryCount on save failure and leaves orphan intact', () => {
            mockOrphanSearchRun.getRange.mockReturnValue([buildOrphanRow({ retryCount: 0 })]);
            const failingPhoneCall = {
                setValue: jest.fn(),
                save: jest.fn().mockImplementation(() => { throw new Error('save still failing'); })
            };
            record.create.mockReturnValue(failingPhoneCall);

            scheduledScript.execute();

            // retryCount incremented to 1
            const inc = record.submitFields.mock.calls.find(
                (c) => c[0] && c[0].type === 'customrecord_ctc_orphan_call'
                       && c[0].values && c[0].values.custrecord_ctc_orphan_retrycount === 1
            );
            expect(inc).toBeDefined();
            // Orphan NOT deleted
            expect(record.delete).not.toHaveBeenCalled();
        });

        it('logs admin-triage error when retryCount reaches 3', () => {
            mockOrphanSearchRun.getRange.mockReturnValue([buildOrphanRow({ retryCount: 2 })]);
            const failingPhoneCall = {
                setValue: jest.fn(),
                save: jest.fn().mockImplementation(() => { throw new Error('persistent failure'); })
            };
            record.create.mockReturnValue(failingPhoneCall);

            scheduledScript.execute();

            // retryCount went 2 → 3
            const inc = record.submitFields.mock.calls.find(
                (c) => c[0] && c[0].type === 'customrecord_ctc_orphan_call'
                       && c[0].values && c[0].values.custrecord_ctc_orphan_retrycount === 3
            );
            expect(inc).toBeDefined();
            // Admin-triage error logged
            expect(log.error).toHaveBeenCalledWith(
                expect.objectContaining({ title: 'CTC Orphan retry cap reached — admin triage' })
            );
        });

        it('search filter excludes orphans with retryCount >= 3', () => {
            scheduledScript.execute();

            const orphanSearchCall = search.create.mock.calls.find(
                (c) => c[0] && c[0].type === 'customrecord_ctc_orphan_call'
            );
            expect(orphanSearchCall).toBeDefined();
            expect(JSON.stringify(orphanSearchCall[0].filters)).toContain('lessthan');
            expect(JSON.stringify(orphanSearchCall[0].filters)).toContain('3');
        });

        it('orphan retry pass honors shouldYield() and enqueues resume mid-batch', () => {
            mockOrphanSearchRun.getRange.mockReturnValue([
                buildOrphanRow({ recordId: '88001', callSid: 'CA_orph_A' }),
                buildOrphanRow({ recordId: '88002', callSid: 'CA_orph_B' })
            ]);
            // First yield check (orphan #1) high; second (orphan #2) low
            let checkCount = 0;
            runtime.getCurrentScript.mockReturnValue({
                getRemainingUsage: jest.fn().mockImplementation(() => {
                    checkCount++;
                    return checkCount > 1 ? 500 : 9000;
                })
            });

            scheduledScript.execute();

            // First orphan processed (record.create + delete fired once)
            const phoneCallCreates = record.create.mock.calls.filter(
                (c) => c[0] && c[0].type === 'phonecall'
            );
            expect(phoneCallCreates).toHaveLength(1);
            // Second orphan triggered the yield + enqueue
            expect(task.create).toHaveBeenCalled();
        });

        it('Review P0 #1: rejects orphan when verifyCallOwnership returns ok=false (forged-row exploit guard)', () => {
            mockOrphanSearchRun.getRange.mockReturnValue([buildOrphanRow({
                callSid: 'CA_forged_001',
                userId: '99',  // attacker userId
                entityId: '500'
            })]);
            // Simulate Twilio reporting the call was placed by a DIFFERENT user
            callOwnership.verifyCallOwnership.mockReturnValue({ ok: false, reason: 'NOT_CALL_OWNER' });

            scheduledScript.execute();

            // Phone Call NOT recreated
            const phoneCallCreates = record.create.mock.calls.filter(
                (c) => c[0] && c[0].type === 'phonecall'
            );
            expect(phoneCallCreates).toHaveLength(0);
            // Orphan NOT deleted (left for retry-cap or admin triage)
            expect(record.delete).not.toHaveBeenCalled();
            // retryCount incremented to 1 (one rejection per cycle)
            const inc = record.submitFields.mock.calls.find(
                (c) => c[0] && c[0].type === 'customrecord_ctc_orphan_call'
                       && c[0].values && c[0].values.custrecord_ctc_orphan_retrycount === 1
            );
            expect(inc).toBeDefined();
        });

        it('preserves entity fields when recreating Phone Call', () => {
            mockOrphanSearchRun.getRange.mockReturnValue([buildOrphanRow({
                entityId: '777',
                entityType: 'contact',
                phone: '+15559999999',
                callSid: 'CA_orph_fields'
            })]);
            const recreatedPhoneCall = {
                setValue: jest.fn(),
                save: jest.fn().mockReturnValue(555555)
            };
            record.create.mockReturnValue(recreatedPhoneCall);

            scheduledScript.execute();

            const fields = {};
            recreatedPhoneCall.setValue.mock.calls.forEach((c) => {
                fields[c[0].fieldId] = c[0].value;
            });
            expect(fields.custevent_ctc_call_sid).toBe('CA_orph_fields');
            expect(fields.contact).toBe(777);
            expect(fields.phone).toBe('+15559999999');
            expect(fields.title).toBe('Call to +15559999999');
            expect(fields.custevent_ctc_call_status).toBe('Logged');
        });
    });

    describe('HIGH-4 recording cleanup-pending flag + retry pass', () => {
        // Sprint 2 U4 — Twilio Recording DELETE can fail transiently
        // (5xx, network, timeout). Pre-fix: deleteRecording logged
        // the failure and returned undefined; the recording stayed
        // in Twilio storage indefinitely (cost + privacy concern)
        // because nothing ever retried. Post-fix: deleteRecording
        // returns a status sentinel; transient sets
        // custevent_ctc_recording_cleanup_pending=T; a cleanup-retry
        // pass after the main loop walks pending rows and retries.

        it('does NOT set cleanup_pending flag when deleteRecording succeeds (returns true)', () => {
            utils.deleteRecording.mockReturnValue(true);

            scheduledScript.execute();

            const flagWrites = record.submitFields.mock.calls.filter(
                (c) => c[0] && c[0].values && c[0].values.custevent_ctc_recording_cleanup_pending !== undefined
            );
            expect(flagWrites).toHaveLength(0);
        });

        it('does NOT set cleanup_pending flag when deleteRecording returns null (404 — already gone)', () => {
            utils.deleteRecording.mockReturnValue(null);

            scheduledScript.execute();

            const flagWrites = record.submitFields.mock.calls.filter(
                (c) => c[0] && c[0].values && c[0].values.custevent_ctc_recording_cleanup_pending !== undefined
            );
            expect(flagWrites).toHaveLength(0);
        });

        it('does NOT set cleanup_pending flag when deleteRecording returns false (4xx — not retriable)', () => {
            utils.deleteRecording.mockReturnValue(false);

            scheduledScript.execute();

            const flagWrites = record.submitFields.mock.calls.filter(
                (c) => c[0] && c[0].values && c[0].values.custevent_ctc_recording_cleanup_pending !== undefined
            );
            expect(flagWrites).toHaveLength(0);
        });

        it('SETS cleanup_pending flag when deleteRecording returns TRANSIENT_ERROR (5xx / network)', () => {
            utils.deleteRecording.mockReturnValue(utils.TRANSIENT_ERROR);

            scheduledScript.execute();

            const flagWrites = record.submitFields.mock.calls.filter(
                (c) => c[0] && c[0].values && c[0].values.custevent_ctc_recording_cleanup_pending === true
            );
            expect(flagWrites).toHaveLength(1);
            expect(flagWrites[0][0].id).toBe('12345');
        });

        it('cleanup-retry pass — clears flag on successful retry (returns true)', () => {
            // Main-loop search returns 0 calls; cleanup pass has 1 row
            mockUnprocessedSearchRun.getRange.mockReturnValue([]);
            mockCleanupPendingSearchRun.getRange.mockReturnValue([{
                id: '99999',
                getValue: jest.fn((field) => {
                    if (field === 'custevent_ctc_recording_sid') return 'RE_stale_001';
                    return '';
                })
            }]);
            utils.deleteRecording.mockReturnValue(true);

            scheduledScript.execute();

            // deleteRecording called once with the stale recording SID
            expect(utils.deleteRecording).toHaveBeenCalledWith(
                'AC_test_account', 'RE_stale_001', expect.anything()
            );
            // Flag cleared
            const flagClears = record.submitFields.mock.calls.filter(
                (c) => c[0] && c[0].id === '99999'
                       && c[0].values && c[0].values.custevent_ctc_recording_cleanup_pending === false
            );
            expect(flagClears).toHaveLength(1);
        });

        it('cleanup-retry pass — clears flag on 404 (already gone, returns null)', () => {
            mockUnprocessedSearchRun.getRange.mockReturnValue([]);
            mockCleanupPendingSearchRun.getRange.mockReturnValue([{
                id: '99999',
                getValue: jest.fn(() => 'RE_stale_001')
            }]);
            utils.deleteRecording.mockReturnValue(null);

            scheduledScript.execute();

            const flagClears = record.submitFields.mock.calls.filter(
                (c) => c[0] && c[0].id === '99999'
                       && c[0].values && c[0].values.custevent_ctc_recording_cleanup_pending === false
            );
            expect(flagClears).toHaveLength(1);
        });

        it('cleanup-retry pass — leaves flag set on transient retry failure', () => {
            mockUnprocessedSearchRun.getRange.mockReturnValue([]);
            mockCleanupPendingSearchRun.getRange.mockReturnValue([{
                id: '99999',
                getValue: jest.fn(() => 'RE_stale_001')
            }]);
            utils.deleteRecording.mockReturnValue(utils.TRANSIENT_ERROR);

            scheduledScript.execute();

            // No flag clear — leave it set for next cycle
            const flagClears = record.submitFields.mock.calls.filter(
                (c) => c[0] && c[0].values && c[0].values.custevent_ctc_recording_cleanup_pending === false
            );
            expect(flagClears).toHaveLength(0);
        });

        it('Review P0 #2: findCleanupPendingCalls filter includes processed=T (destructive flag-flip exploit guard)', () => {
            // If this assertion fails, an attacker who can write to
            // custevent_ctc_recording_cleanup_pending could trigger
            // Twilio recording deletion BEFORE transcription completes,
            // permanently losing the recording.
            scheduledScript.execute();

            const cleanupSearchCall = search.create.mock.calls.find((c) => {
                if (!c[0] || !c[0].filters) return false;
                const filterStr = JSON.stringify(c[0].filters);
                return filterStr.indexOf('custevent_ctc_recording_cleanup_pending') !== -1;
            });
            expect(cleanupSearchCall).toBeDefined();
            const filterStr = JSON.stringify(cleanupSearchCall[0].filters);
            // Both conditions must be present in the filter
            expect(filterStr).toContain('custevent_ctc_recording_cleanup_pending');
            expect(filterStr).toContain('custevent_ctc_processed');
        });

        it('cleanup-retry pass — honors shouldYield() and enqueues resume mid-batch', () => {
            mockUnprocessedSearchRun.getRange.mockReturnValue([]);
            mockCleanupPendingSearchRun.getRange.mockReturnValue([
                { id: '99999', getValue: jest.fn(() => 'RE_stale_001') },
                { id: '99998', getValue: jest.fn(() => 'RE_stale_002') }
            ]);
            // Main loop has no work (empty unprocessed list) so no
            // shouldYield checks fire there. Cleanup pass: check #1
            // is for stale row #1 (high — process), check #2 is for
            // stale row #2 (low — yield + enqueue).
            let checkCount = 0;
            runtime.getCurrentScript.mockReturnValue({
                getRemainingUsage: jest.fn().mockImplementation(() => {
                    checkCount++;
                    return checkCount > 1 ? 500 : 9000;
                })
            });
            utils.deleteRecording.mockReturnValue(true);

            scheduledScript.execute();

            // Only the first stale row processed
            expect(utils.deleteRecording).toHaveBeenCalledTimes(1);
            // Second row triggered the yield
            expect(task.create).toHaveBeenCalled();
        });
    });

    describe('HIGH-6 governance ceiling guard', () => {
        // Per-call cost is high (record.load + save + 1-3 https.get +
        // 1 https.delete + 1 llm.generateText + N record.create for
        // proposed tasks ≈ 200-600 units). A 50-call batch can blow
        // the 10,000-unit scheduled-script ceiling; mid-execution
        // death leaves the in-flight call in a partial state. Guard:
        // yield + task.create resume before processing the next call
        // when remaining usage drops below GOVERNANCE_THRESHOLD (1000).

        it('processes calls normally when remaining usage is well above threshold', () => {
            // Default mock returns 9000 — should process the call
            scheduledScript.execute();

            expect(utils.fetchRecordingForCall).toHaveBeenCalled();
            expect(task.create).not.toHaveBeenCalled();
        });

        it('breaks loop and enqueues task.create resume when remaining usage drops below 1000', () => {
            runtime.getCurrentScript.mockReturnValue({
                getRemainingUsage: jest.fn().mockReturnValue(800)
            });

            scheduledScript.execute();

            // Did NOT process the call (yielded before any work)
            expect(utils.fetchRecordingForCall).not.toHaveBeenCalled();
            // Did enqueue the resume task
            expect(task.create).toHaveBeenCalledTimes(1);
            expect(task.create).toHaveBeenCalledWith(expect.objectContaining({
                taskType: 'SCHEDULED_SCRIPT',
                scriptId: 'customscript_ctc_ss_poll',
                deploymentId: 'customdeploy_ctc_ss_poll'
            }));
        });

        it('does not enqueue resume when remaining usage is exactly at threshold', () => {
            // Threshold is `< 1000` — equal to 1000 should still process
            runtime.getCurrentScript.mockReturnValue({
                getRemainingUsage: jest.fn().mockReturnValue(1000)
            });

            scheduledScript.execute();

            expect(utils.fetchRecordingForCall).toHaveBeenCalled();
            expect(task.create).not.toHaveBeenCalled();
        });

        it('processes some calls then yields when remaining usage drops mid-batch', () => {
            // Two calls in batch; second one fires after usage drops
            mockUnprocessedSearchRun.getRange.mockReturnValue([
                { id: '12345', getValue: jest.fn(() => 'CA_test_call_001') },
                { id: '67890', getValue: jest.fn(() => 'CA_test_call_002') }
            ]);
            let checkCount = 0;
            runtime.getCurrentScript.mockReturnValue({
                getRemainingUsage: jest.fn().mockImplementation(() => {
                    checkCount++;
                    return checkCount > 1 ? 500 : 9000;
                })
            });

            scheduledScript.execute();

            // First call processed
            expect(utils.fetchRecordingForCall).toHaveBeenCalledTimes(1);
            // Second call yielded — task.create enqueued resume
            expect(task.create).toHaveBeenCalledTimes(1);
        });

        it('logs error but does not throw when task.create.submit fails', () => {
            runtime.getCurrentScript.mockReturnValue({
                getRemainingUsage: jest.fn().mockReturnValue(500)
            });
            task.create.mockReturnValue({
                submit: jest.fn().mockImplementation(() => {
                    throw new Error('Pending scheduled task already enqueued');
                })
            });

            // Should not throw — fall through to next scheduled cycle
            expect(() => scheduledScript.execute()).not.toThrow();

            // log.error fires with the failure
            expect(log.error).toHaveBeenCalledWith(
                expect.objectContaining({ title: 'CTC Governance Resume Failed' })
            );
        });
    });

    describe('HIGH-5 race-window idempotency guard', () => {
        // The browser-side pollForTranscript runs in parallel with this
        // scheduled poll. If the browser path completes enrichment and
        // deletes the recording before the scheduled pass reaches the
        // call, the scheduled pass would otherwise flip call_status
        // back to PROCESSING (and processed back to false) when the
        // Twilio Recording GET returns empty. Guard: re-check the
        // authoritative state with search.lookupFields before any
        // mutation, and skip when terminal.

        it('skips call when search.lookupFields reports processed=true', () => {
            search.lookupFields.mockReturnValue({
                custevent_ctc_processed: true,
                custevent_ctc_call_status: 'Logged'
            });

            scheduledScript.execute();

            // No downstream work fires
            expect(utils.fetchRecordingForCall).not.toHaveBeenCalled();
            expect(utils.fetchTranscript).not.toHaveBeenCalled();
            expect(record.load).not.toHaveBeenCalled();
            // No status flip
            const statusFlips = record.submitFields.mock.calls.filter(
                (c) => c[0] && c[0].values && c[0].values.custevent_ctc_call_status
            );
            expect(statusFlips).toHaveLength(0);
        });

        it('skips call when call_status is Transcribed (browser-poll already finished)', () => {
            search.lookupFields.mockReturnValue({
                custevent_ctc_processed: false,
                custevent_ctc_call_status: 'Transcribed'
            });

            scheduledScript.execute();

            expect(utils.fetchRecordingForCall).not.toHaveBeenCalled();
            const statusFlips = record.submitFields.mock.calls.filter(
                (c) => c[0] && c[0].values && c[0].values.custevent_ctc_call_status
            );
            expect(statusFlips).toHaveLength(0);
        });

        it('skips call when call_status is "No transcript"', () => {
            search.lookupFields.mockReturnValue({
                custevent_ctc_processed: false,
                custevent_ctc_call_status: 'No transcript'
            });

            scheduledScript.execute();

            expect(utils.fetchRecordingForCall).not.toHaveBeenCalled();
        });

        it('continues processing when call_status is Processing (non-terminal)', () => {
            search.lookupFields.mockReturnValue({
                custevent_ctc_processed: false,
                custevent_ctc_call_status: 'Processing'
            });

            scheduledScript.execute();

            // Past the guard, downstream work fires normally
            expect(utils.fetchRecordingForCall).toHaveBeenCalled();
        });

        it('continues processing when call_status is FAILED — FAILED is retry-eligible so transient root causes can self-heal', () => {
            search.lookupFields.mockReturnValue({
                custevent_ctc_processed: false,
                custevent_ctc_call_status: 'Failed'
            });

            scheduledScript.execute();

            expect(utils.fetchRecordingForCall).toHaveBeenCalled();
        });

        it('continues processing on default state (processed=false, status=Logged)', () => {
            // Default mock already returns this state; this test exists
            // as an explicit regression guard against a future "skip all
            // calls" bug in the guard logic.
            scheduledScript.execute();

            expect(utils.fetchRecordingForCall).toHaveBeenCalled();
            expect(record.load).toHaveBeenCalled();
        });

        it('handles list-shaped call_status return value', () => {
            // search.lookupFields returns LIST-typed fields as
            // [{ value, text }]. The CALL_STATUS field is free-text
            // today, but defend against a future schema change where
            // call_status becomes a LIST field.
            search.lookupFields.mockReturnValue({
                custevent_ctc_processed: false,
                custevent_ctc_call_status: [{ value: '4', text: 'Transcribed' }]
            });

            scheduledScript.execute();

            expect(utils.fetchRecordingForCall).not.toHaveBeenCalled();
        });
    });

    describe('findUnprocessedCalls', () => {
        it('searches for Phone Calls with processed=F and call_sid not empty', () => {
            scheduledScript.execute();

            expect(search.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'phonecall',
                    filters: [
                        ['custevent_ctc_processed', 'is', 'F'],
                        'AND',
                        ['custevent_ctc_call_sid', 'isnotempty', '']
                    ]
                })
            );
        });
    });

    describe('recording lookup per call', () => {
        it('calls fetchRecordingForCall with call SID', () => {
            scheduledScript.execute();

            // Phase 2 U10: auth header is now a SecureString opaque handle
            // (built via https.createSecureString in lib/ctc_twilio_admin.js),
            // not a plain "Basic <base64>" string. The mock returns a sentinel.
            expect(utils.fetchRecordingForCall).toHaveBeenCalledWith(
                'AC_test_account', 'CA_test_call_001', expect.anything()
            );
        });

        it('skips call when no recording found', () => {
            utils.fetchRecordingForCall.mockReturnValue(null);

            scheduledScript.execute();

            expect(utils.fetchTranscript).not.toHaveBeenCalled();
            expect(record.load).not.toHaveBeenCalled();
        });

        // Sprint 2b (HIGH-1) — transient Twilio failure must NOT flip
        // call_status to PROCESSING. Pre-fix: every call in the batch
        // gets PROCESSING set during a sustained Twilio outage; next
        // cycle re-runs and does the same thing forever. Post-fix:
        // status is left at whatever it was (LOGGED, typically), so
        // the next clean cycle picks it up without churn.
        it('HIGH-1: leaves call_status untouched on transient Twilio failure', () => {
            // Mock the helper to return TRANSIENT_ERROR sentinel.
            // Module-level utils.* are jest.mocks; isTransientError needs
            // to return true for the same value fetchRecordingForCall returns.
            const SENTINEL = { __ctc_transient: true };
            utils.fetchRecordingForCall.mockReturnValue(SENTINEL);
            utils.isTransientError = jest.fn().mockImplementation((v) => v === SENTINEL);

            scheduledScript.execute();

            // No call_status flip (no submitFields with custevent_ctc_call_status)
            const statusFlips = record.submitFields.mock.calls.filter(
                (c) => c[0] && c[0].values && c[0].values.custevent_ctc_call_status
            );
            expect(statusFlips).toHaveLength(0);
            // And no downstream Twilio work fires
            expect(utils.fetchTranscript).not.toHaveBeenCalled();
        });
    });

    describe('transcript processing', () => {
        it('skips call when transcript not ready', () => {
            utils.fetchTranscript.mockReturnValue(null);

            scheduledScript.execute();

            expect(record.load).not.toHaveBeenCalled();
        });

        it('calls fetchSentences and formatTranscript on completed transcript', () => {
            scheduledScript.execute();

            expect(utils.fetchSentences).toHaveBeenCalledWith('GT_test_transcript_001', expect.any(String));
            expect(utils.formatTranscript).toHaveBeenCalled();
        });
    });

    describe('AI analysis', () => {
        it('calls analyzeTranscript when quota available', () => {
            scheduledScript.execute();

            expect(utils.analyzeTranscript).toHaveBeenCalledWith('[REP] Hello\n[CUSTOMER] Hi there');
        });

        it('skips AI when quota is low', () => {
            llm.getRemainingFreeUsage.mockReturnValue(5);

            scheduledScript.execute();

            expect(utils.analyzeTranscript).not.toHaveBeenCalled();
            // Should still update the record
            expect(record.load).toHaveBeenCalled();
        });
    });

    describe('Phone Call record update', () => {
        it('loads existing record by ID (never creates)', () => {
            scheduledScript.execute();

            expect(record.load).toHaveBeenCalledWith({
                type: 'phonecall',
                id: '12345',
                isDynamic: true
            });
        });

        it('sets all enrichment fields', () => {
            scheduledScript.execute();

            const fields = {};
            mockPhoneCall.setValue.mock.calls.forEach((call) => {
                fields[call[0].fieldId] = call[0].value;
            });

            expect(fields.title).toBe(MOCK_ANALYSIS.title);
            expect(fields.custevent_ctc_recording_sid).toBe('RE_test_recording_001');
            expect(fields.custevent_ctc_recording_url).toContain('RE_test_recording_001.mp3');
            expect(fields.custevent_ctc_duration).toBe(120);
            expect(fields.custevent_ctc_transcript).toBe('[REP] Hello\n[CUSTOMER] Hi there');
            expect(fields.custevent_ctc_ai_summary).toBe(MOCK_ANALYSIS.summary);
            expect(fields.custevent_ctc_satisfaction).toBe(7);
            expect(fields.custevent_ctc_tone_keywords).toBe('interested, helpful, engaged');
            expect(fields.custevent_ctc_action_items).toBe('Send product brochure\nSchedule follow-up call');
            expect(fields.custevent_ctc_ai_brief).toBe(MOCK_ANALYSIS.brief);
            expect(fields.custevent_ctc_processed).toBe(true);
        });

        it('saves the record', () => {
            scheduledScript.execute();

            expect(mockPhoneCall.save).toHaveBeenCalled();
        });

        it('uses first clause of summary as title fallback when title is empty', () => {
            utils.analyzeTranscript.mockReturnValue({
                ...MOCK_ANALYSIS,
                title: '',
                summary: 'The customer discussed pricing options. They seemed interested.'
            });

            scheduledScript.execute();

            const fields = {};
            mockPhoneCall.setValue.mock.calls.forEach((call) => {
                fields[call[0].fieldId] = call[0].value;
            });
            expect(fields.title).toBe('The customer discussed pricing options');
        });

        it('falls back to recording SID when both title and summary are empty', () => {
            utils.analyzeTranscript.mockReturnValue({
                ...MOCK_ANALYSIS,
                title: '',
                summary: ''
            });

            scheduledScript.execute();

            const fields = {};
            mockPhoneCall.setValue.mock.calls.forEach((call) => {
                fields[call[0].fieldId] = call[0].value;
            });
            expect(fields.title).toContain('Call —');
            expect(fields.title).toContain('RE_test_recording_001');
        });

        it('falls back to truncated summary for brief when brief is empty', () => {
            utils.analyzeTranscript.mockReturnValue({
                ...MOCK_ANALYSIS,
                brief: ''
            });

            scheduledScript.execute();

            const fields = {};
            mockPhoneCall.setValue.mock.calls.forEach((call) => {
                fields[call[0].fieldId] = call[0].value;
            });
            expect(fields.custevent_ctc_ai_brief).toBe(MOCK_ANALYSIS.summary);
        });
    });

    describe('recording deletion', () => {
        it('deletes recording after successful processing', () => {
            scheduledScript.execute();

            expect(utils.deleteRecording).toHaveBeenCalledWith(
                'AC_test_account', 'RE_test_recording_001', expect.any(String)
            );
        });
    });

    describe('error handling', () => {
        it('continues processing after one call fails', () => {
            mockUnprocessedSearchRun.getRange.mockReturnValue([
                {
                    id: '111',
                    getValue: jest.fn().mockReturnValue('CA_call_1')
                },
                {
                    id: '222',
                    getValue: jest.fn().mockReturnValue('CA_call_2')
                }
            ]);

            utils.fetchRecordingForCall
                .mockReturnValueOnce(null) // first call — no recording, skipped
                .mockReturnValueOnce(MOCK_RECORDING);

            scheduledScript.execute();

            // Second call should still be processed
            expect(record.load).toHaveBeenCalledTimes(1);
            expect(record.load).toHaveBeenCalledWith(expect.objectContaining({ id: '222' }));
        });

        it('logs error when call processing throws', () => {
            utils.fetchRecordingForCall.mockImplementation(() => {
                throw new Error('Network timeout');
            });

            scheduledScript.execute();

            expect(log.error).toHaveBeenCalledWith(
                expect.objectContaining({ title: 'CTC Call Processing Error' })
            );
        });

        it('does not throw from execute when config fails', () => {
            mockConfigSearchRun.getRange.mockReturnValue([]);

            expect(() => scheduledScript.execute()).not.toThrow();
            expect(log.error).toHaveBeenCalledWith(
                expect.objectContaining({ title: 'CTC Poll Execute Error' })
            );
        });

        it('handles no unprocessed calls gracefully', () => {
            mockUnprocessedSearchRun.getRange.mockReturnValue([]);

            scheduledScript.execute();

            expect(utils.fetchRecordingForCall).not.toHaveBeenCalled();
            expect(log.audit).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'CTC Poll Complete',
                    // Sprint 2 review #7 — audit message now includes all three passes.
                    details: expect.stringContaining('main(processed=0, skipped=0, errors=0)')
                })
            );
        });
    });

    describe('summary logging', () => {
        it('logs poll completion summary', () => {
            scheduledScript.execute();

            expect(log.audit).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'CTC Poll Complete',
                    // Sprint 2 review #7 — new audit format.
                    details: expect.stringContaining('main(processed=1')
                })
            );
        });
    });

    describe('call status transitions', () => {
        it('writes Transcribed status on successful enrichment', () => {
            scheduledScript.execute();

            const fields = {};
            mockPhoneCall.setValue.mock.calls.forEach((call) => {
                fields[call[0].fieldId] = call[0].value;
            });
            expect(fields.custevent_ctc_call_status).toBe('Transcribed');
        });

        it('marks status No transcript when Recording is absent (terminal)', () => {
            utils.isRecordingTerminal.mockReturnValue(true);
            utils.fetchRecordingForCall.mockReturnValue({ sid: 'RE_abs', status: 'absent' });

            scheduledScript.execute();

            expect(record.submitFields).toHaveBeenCalledWith(expect.objectContaining({
                id: '12345',
                values: expect.objectContaining({
                    custevent_ctc_call_status: 'No transcript',
                    custevent_ctc_processed: true
                })
            }));
            expect(record.load).not.toHaveBeenCalled();
        });

        it('marks status No transcript when Transcript is in terminal failure state', () => {
            utils.isTranscriptTerminal.mockReturnValue(true);
            utils.fetchTranscript.mockReturnValue({ sid: 'GT_x', status: 'canceled' });

            scheduledScript.execute();

            expect(record.submitFields).toHaveBeenCalledWith(expect.objectContaining({
                values: expect.objectContaining({ custevent_ctc_call_status: 'No transcript' })
            }));
        });

        it('marks status Processing when no recording yet and continues polling next cycle', () => {
            utils.fetchRecordingForCall.mockReturnValue(null);

            scheduledScript.execute();

            expect(record.submitFields).toHaveBeenCalledWith(expect.objectContaining({
                values: expect.objectContaining({
                    custevent_ctc_call_status: 'Processing',
                    custevent_ctc_processed: false
                })
            }));
        });

        it('marks status Failed when processing throws', () => {
            utils.fetchRecordingForCall.mockImplementation(() => {
                throw new Error('Twilio API down');
            });

            scheduledScript.execute();

            expect(record.submitFields).toHaveBeenCalledWith(expect.objectContaining({
                values: expect.objectContaining({ custevent_ctc_call_status: 'Failed' })
            }));
        });
    });
});
