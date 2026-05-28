import utils from 'SuiteScripts/lib/ctc_transcript_utils';
import https from 'N/https';
import llm from 'N/llm';
import log from 'N/log';
import record from 'N/record';

jest.mock('N/https');
jest.mock('N/llm');
jest.mock('N/log');
jest.mock('N/record');

describe('ctc_transcript_utils', () => {

    const AUTH_HEADER = 'Basic dGVzdDp0ZXN0';
    const ACCOUNT_SID = 'AC_test_account';

    const MOCK_RECORDING = {
        sid: 'RE_test_recording_001',
        duration: '120',
        call_sid: 'CA_test_call_001'
    };

    const MOCK_TRANSCRIPT = {
        sid: 'GT_test_transcript_001',
        status: 'completed',
        source_sid: 'RE_test_recording_001'
    };

    const MOCK_SENTENCES = [
        { media_channel: 1, transcript: 'Hello, how can I help you today?' },
        { media_channel: 2, transcript: 'I am interested in your product.' },
        { media_channel: 1, transcript: 'Great, let me tell you about our features.' }
    ];

    const MOCK_ANALYSIS = {
        title: 'Product feature inquiry — engaged prospect',
        brief: '',  // Sprint 2c — added when lib/ctc_llm_analysis FALLBACK_ANALYSIS gained brief
        summary: 'Customer inquired about product features. Rep provided overview.',
        satisfaction_score: 7,
        tone_keywords: ['interested', 'helpful', 'engaged'],
        action_items: ['Send product brochure', 'Schedule follow-up call']
    };

    beforeEach(() => {
        jest.clearAllMocks();

        llm.ModelFamily = { COHERE_COMMAND: 'COHERE_COMMAND' };
        llm.generateText = jest.fn().mockReturnValue({
            text: JSON.stringify(MOCK_ANALYSIS)
        });
        // Sprint 2c — analyzeTranscript was extracted to lib/ctc_llm_analysis
        // and now checks llm.getRemainingFreeUsage() via hasQuota() before
        // calling generateText. Tests that expect generateText to be called
        // need quota above the QUOTA_RESERVE_THRESHOLD (10).
        llm.getRemainingFreeUsage = jest.fn().mockReturnValue(100);

        https.delete = jest.fn().mockReturnValue({ code: 204, body: '' });
    });

    describe('fetchRecordingForCall', () => {
        it('returns the first recording for a call SID', () => {
            https.get.mockReturnValue({
                code: 200,
                body: JSON.stringify({ recordings: [MOCK_RECORDING] })
            });

            const result = utils.fetchRecordingForCall(ACCOUNT_SID, 'CA_test_call_001', AUTH_HEADER);

            expect(result).toEqual(MOCK_RECORDING);
            expect(https.get).toHaveBeenCalledWith(expect.objectContaining({
                url: expect.stringContaining('/Calls/CA_test_call_001/Recordings.json'),
                headers: { Authorization: AUTH_HEADER }
            }));
        });

        it('returns null when no recordings exist', () => {
            https.get.mockReturnValue({
                code: 200,
                body: JSON.stringify({ recordings: [] })
            });

            const result = utils.fetchRecordingForCall(ACCOUNT_SID, 'CA_none', AUTH_HEADER);
            expect(result).toBeNull();
        });

        it('returns null and logs error on 4xx terminal response', () => {
            https.get.mockReturnValue({ code: 401, body: 'Unauthorized' });

            const result = utils.fetchRecordingForCall(ACCOUNT_SID, 'CA_err', AUTH_HEADER);

            expect(result).toBeNull();
            expect(log.error).toHaveBeenCalledWith(
                expect.objectContaining({ title: 'CTC Fetch Call Recordings Failed' })
            );
        });

        // Sprint 2b (HIGH-1) — distinguish transient Twilio failures from
        // "no recording yet" so callers can leave call_status untouched.
        it('HIGH-1: returns TRANSIENT_ERROR on Twilio 5xx (distinct from null)', () => {
            https.get.mockReturnValue({ code: 503, body: 'Service Unavailable' });

            const result = utils.fetchRecordingForCall(ACCOUNT_SID, 'CA_503', AUTH_HEADER);

            expect(utils.isTransientError(result)).toBe(true);
            expect(result).not.toBeNull();
            expect(log.error).toHaveBeenCalledWith(
                expect.objectContaining({ title: 'CTC Fetch Call Recordings — Twilio 5xx' })
            );
        });

        // Sprint 2b (HIGH-2) — network/timeout exception treated as transient.
        it('HIGH-2: returns TRANSIENT_ERROR when https.get throws (timeout/network)', () => {
            https.get.mockImplementation(() => { throw new Error('SSL_ERROR_SYSCALL'); });

            const result = utils.fetchRecordingForCall(ACCOUNT_SID, 'CA_timeout', AUTH_HEADER);

            expect(utils.isTransientError(result)).toBe(true);
        });

        // Sprint 2b (HIGH-2) — verify the 30s timeout is passed to https.get.
        it('HIGH-2: passes 30000ms timeout on every Twilio fetch', () => {
            https.get.mockReturnValue({ code: 200, body: JSON.stringify({ recordings: [] }) });

            utils.fetchRecordingForCall(ACCOUNT_SID, 'CA_timeout_check', AUTH_HEADER);

            expect(https.get).toHaveBeenCalledWith(
                expect.objectContaining({ timeout: 30000 })
            );
        });

        // Sprint 2b (HIGH-12) — malformed JSON body (Twilio outage HTML page).
        it('HIGH-12: returns TRANSIENT_ERROR when response.body is unparseable JSON', () => {
            https.get.mockReturnValue({ code: 200, body: '<!DOCTYPE html><html><body>503</body></html>' });

            const result = utils.fetchRecordingForCall(ACCOUNT_SID, 'CA_html', AUTH_HEADER);

            expect(utils.isTransientError(result)).toBe(true);
            expect(log.error).toHaveBeenCalledWith(
                expect.objectContaining({ title: 'CTC Fetch Call Recordings — JSON parse' })
            );
        });
    });

    describe('fetchTranscript', () => {
        it('returns completed transcript', () => {
            https.get.mockReturnValue({
                code: 200,
                body: JSON.stringify({ transcripts: [MOCK_TRANSCRIPT] })
            });

            const result = utils.fetchTranscript('RE_test_recording_001', AUTH_HEADER);
            expect(result).toEqual(MOCK_TRANSCRIPT);
        });

        it('returns the transcript object regardless of status so callers can branch', () => {
            const inProgress = { ...MOCK_TRANSCRIPT, status: 'in_progress' };
            https.get.mockReturnValue({
                code: 200,
                body: JSON.stringify({ transcripts: [inProgress] })
            });

            const result = utils.fetchTranscript('RE_test', AUTH_HEADER);
            expect(result).toEqual(inProgress);
            expect(utils.isTranscriptComplete(result)).toBe(false);
        });

        it('returns null when no transcripts exist', () => {
            https.get.mockReturnValue({
                code: 200,
                body: JSON.stringify({ transcripts: [] })
            });

            const result = utils.fetchTranscript('RE_test', AUTH_HEADER);
            expect(result).toBeNull();
        });

        it('returns null on 4xx terminal response', () => {
            https.get.mockReturnValue({ code: 401, body: 'Unauthorized' });

            const result = utils.fetchTranscript('RE_test', AUTH_HEADER);
            expect(result).toBeNull();
        });

        it('HIGH-1: returns TRANSIENT_ERROR on Twilio 5xx', () => {
            https.get.mockReturnValue({ code: 502, body: 'Bad Gateway' });

            const result = utils.fetchTranscript('RE_test', AUTH_HEADER);
            expect(utils.isTransientError(result)).toBe(true);
        });

        it('HIGH-12: returns TRANSIENT_ERROR on malformed JSON', () => {
            https.get.mockReturnValue({ code: 200, body: 'not json' });

            const result = utils.fetchTranscript('RE_test', AUTH_HEADER);
            expect(utils.isTransientError(result)).toBe(true);
        });
    });

    describe('terminal-state helpers', () => {
        it('isRecordingTerminal returns true for absent recording', () => {
            expect(utils.isRecordingTerminal({ status: 'absent' })).toBe(true);
        });
        it('isRecordingTerminal returns false for completed recording', () => {
            expect(utils.isRecordingTerminal({ status: 'completed' })).toBe(false);
        });
        it('isRecordingTerminal returns false for null', () => {
            expect(utils.isRecordingTerminal(null)).toBe(false);
        });
        it('isTranscriptTerminal returns true for failed / canceled / error', () => {
            expect(utils.isTranscriptTerminal({ status: 'failed' })).toBe(true);
            expect(utils.isTranscriptTerminal({ status: 'canceled' })).toBe(true);
            expect(utils.isTranscriptTerminal({ status: 'error' })).toBe(true);
        });
        it('isTranscriptTerminal returns false for in-progress / queued / completed', () => {
            expect(utils.isTranscriptTerminal({ status: 'in-progress' })).toBe(false);
            expect(utils.isTranscriptTerminal({ status: 'queued' })).toBe(false);
            expect(utils.isTranscriptTerminal({ status: 'completed' })).toBe(false);
        });
        it('isTranscriptComplete returns true only for completed status', () => {
            expect(utils.isTranscriptComplete({ status: 'completed' })).toBe(true);
            expect(utils.isTranscriptComplete({ status: 'queued' })).toBe(false);
            expect(utils.isTranscriptComplete(null)).toBe(false);
        });
        it('exposes CALL_STATUS constants', () => {
            expect(utils.CALL_STATUS.LOGGED).toBe('Logged');
            expect(utils.CALL_STATUS.PROCESSING).toBe('Processing');
            expect(utils.CALL_STATUS.TRANSCRIBED).toBe('Transcribed');
            expect(utils.CALL_STATUS.NO_TRANSCRIPT).toBe('No transcript');
            expect(utils.CALL_STATUS.FAILED).toBe('Failed');
        });
    });

    describe('fetchSentences', () => {
        it('returns sentences array', () => {
            https.get.mockReturnValue({
                code: 200,
                body: JSON.stringify({ sentences: MOCK_SENTENCES })
            });

            const result = utils.fetchSentences('GT_test_001', AUTH_HEADER);
            expect(result).toEqual(MOCK_SENTENCES);
        });

        it('returns empty array on non-200 response', () => {
            https.get.mockReturnValue({ code: 500, body: 'Error' });

            const result = utils.fetchSentences('GT_test_001', AUTH_HEADER);
            expect(result).toEqual([]);
        });
    });

    describe('formatTranscript', () => {
        it('formats sentences with speaker labels', () => {
            const result = utils.formatTranscript(MOCK_SENTENCES);

            expect(result).toContain('[REP] Hello, how can I help you today?');
            expect(result).toContain('[CUSTOMER] I am interested in your product.');
            expect(result).toContain('[REP] Great, let me tell you about our features.');
        });

        it('returns empty string for empty sentences', () => {
            expect(utils.formatTranscript([])).toBe('');
        });
    });

    describe('analyzeTranscript', () => {
        it('calls llm.generateText with transcript', () => {
            utils.analyzeTranscript('test transcript');

            expect(llm.generateText).toHaveBeenCalledWith(
                expect.objectContaining({
                    modelFamily: 'COHERE_COMMAND',
                    modelParameters: { temperature: 0.2, maxTokens: 800 }
                })
            );
            expect(llm.generateText.mock.calls[0][0].prompt).toContain('test transcript');
        });

        it('parses valid JSON response', () => {
            const result = utils.analyzeTranscript('test');
            expect(result).toEqual(MOCK_ANALYSIS);
        });

        it('handles markdown code fences', () => {
            llm.generateText.mockReturnValue({
                text: '```json\n' + JSON.stringify(MOCK_ANALYSIS) + '\n```'
            });

            const result = utils.analyzeTranscript('test');
            expect(result.summary).toBe(MOCK_ANALYSIS.summary);
        });

        it('falls back to defaults on malformed JSON', () => {
            llm.generateText.mockReturnValue({ text: 'not json' });

            const result = utils.analyzeTranscript('test');

            expect(result.satisfaction_score).toBe(5);
            expect(result.tone_keywords).toEqual([]);
            expect(result.action_items).toEqual([]);
            expect(log.audit).toHaveBeenCalledWith(
                expect.objectContaining({ title: 'CTC LLM JSON Parse Failed' })
            );
        });
    });

    describe('deleteRecording', () => {
        it('calls Twilio DELETE API', () => {
            https.delete.mockReturnValue({ code: 204, body: '' });
            utils.deleteRecording(ACCOUNT_SID, 'RE_test_001', AUTH_HEADER);

            expect(https.delete).toHaveBeenCalledWith(expect.objectContaining({
                url: expect.stringContaining('RE_test_001.json'),
                headers: { Authorization: AUTH_HEADER }
            }));
        });

        // Sprint 2 U4 (HIGH-4) — return contract documents which
        // failures the caller treats as terminal vs retriable.
        it('returns true on 204 success', () => {
            https.delete.mockReturnValue({ code: 204, body: '' });

            const result = utils.deleteRecording(ACCOUNT_SID, 'RE_test_001', AUTH_HEADER);

            expect(result).toBe(true);
            expect(log.error).not.toHaveBeenCalled();
        });

        it('returns true on 200 success', () => {
            https.delete.mockReturnValue({ code: 200, body: '{}' });

            const result = utils.deleteRecording(ACCOUNT_SID, 'RE_test_001', AUTH_HEADER);

            expect(result).toBe(true);
        });

        it('returns null on 404 — recording already gone, treat as success path', () => {
            https.delete.mockReturnValue({ code: 404, body: 'Not Found' });

            const result = utils.deleteRecording(ACCOUNT_SID, 'RE_test_001', AUTH_HEADER);

            expect(result).toBeNull();
        });

        it('returns TRANSIENT_ERROR on 5xx — caller sets cleanup_pending flag', () => {
            https.delete.mockReturnValue({ code: 503, body: 'Service Unavailable' });

            const result = utils.deleteRecording(ACCOUNT_SID, 'RE_test_001', AUTH_HEADER);

            expect(result).toBe(utils.TRANSIENT_ERROR);
            expect(log.error).toHaveBeenCalledWith(
                expect.objectContaining({ title: 'CTC Delete Recording — 5xx (transient)' })
            );
        });

        it('returns TRANSIENT_ERROR when https.delete throws (network error)', () => {
            https.delete.mockImplementation(() => { throw new Error('ECONNRESET'); });

            const result = utils.deleteRecording(ACCOUNT_SID, 'RE_test_001', AUTH_HEADER);

            expect(result).toBe(utils.TRANSIENT_ERROR);
            expect(log.error).toHaveBeenCalledWith(
                expect.objectContaining({ title: 'CTC Delete Recording — network error' })
            );
        });

        it('Review #6: returns TRANSIENT_ERROR on 401 — auth failure is admin-fixable, keep retrying', () => {
            https.delete.mockReturnValue({ code: 401, body: 'Unauthorized' });

            const result = utils.deleteRecording(ACCOUNT_SID, 'RE_test_001', AUTH_HEADER);

            expect(result).toBe(utils.TRANSIENT_ERROR);
            expect(log.error).toHaveBeenCalledWith(
                expect.objectContaining({ title: 'CTC Delete Recording — auth failure (admin-fixable, transient)' })
            );
        });

        it('Review #6: returns TRANSIENT_ERROR on 403 — same admin-fixable path', () => {
            https.delete.mockReturnValue({ code: 403, body: 'Forbidden' });

            const result = utils.deleteRecording(ACCOUNT_SID, 'RE_test_001', AUTH_HEADER);

            expect(result).toBe(utils.TRANSIENT_ERROR);
        });

        it('returns false on truly non-retriable 4xx (e.g. 400 malformed)', () => {
            https.delete.mockReturnValue({ code: 400, body: 'Bad Request' });

            const result = utils.deleteRecording(ACCOUNT_SID, 'RE_test_001', AUTH_HEADER);

            expect(result).toBe(false);
            expect(log.error).toHaveBeenCalledWith(
                expect.objectContaining({ title: 'CTC Delete Recording Failed' })
            );
        });
    });

    describe('exported constants', () => {
        it('exports TWILIO_API_BASE', () => {
            expect(utils.TWILIO_API_BASE).toContain('api.twilio.com');
        });

        it('exports TWILIO_INTEL_BASE', () => {
            expect(utils.TWILIO_INTEL_BASE).toContain('intelligence.twilio.com');
        });

        it('exports ANALYSIS_PROMPT_PREFIX', () => {
            expect(utils.ANALYSIS_PROMPT_PREFIX).toContain('sales call analyst');
        });
    });

    describe('createProposedTasksFromAnalysis', () => {
        let savedRecords;
        let mockRec;

        beforeEach(() => {
            savedRecords = [];
            mockRec = {
                _values: {},
                _texts: {},
                setValue: jest.fn(function ({ fieldId, value }) { this._values[fieldId] = value; return this; }),
                setText: jest.fn(function ({ fieldId, text }) { this._texts[fieldId] = text; return this; }),
                save: jest.fn(function () {
                    const id = 1000 + savedRecords.length;
                    savedRecords.push({ id, values: { ...this._values }, texts: { ...this._texts } });
                    return id;
                })
            };
            record.create = jest.fn(() => {
                mockRec._values = {};
                mockRec._texts = {};
                return mockRec;
            });
        });

        it('creates one proposed_task per non-empty action item', () => {
            const analysis = { action_items: ['Send brochure', 'Schedule demo', 'Email pricing'] };

            const ids = utils.createProposedTasksFromAnalysis(42, analysis);

            expect(ids).toHaveLength(3);
            expect(record.create).toHaveBeenCalledTimes(3);
            expect(record.create).toHaveBeenCalledWith({ type: 'customrecord_ctc_proposed_task' });
        });

        it('filters out empty / whitespace-only items', () => {
            const analysis = { action_items: ['Real task', '', '   ', 'Another task'] };

            const ids = utils.createProposedTasksFromAnalysis(42, analysis);

            expect(ids).toHaveLength(2);
        });

        it('filters out non-string entries (LLM occasionally returns object items)', () => {
            // Defensive: typeof !== 'string' filter guards against String({}) = '[object Object]'
            const analysis = { action_items: [
                'Real string task',
                { task: 'object form', due: 'tomorrow' },  // would become '[object Object]'
                ['nested', 'array'],
                123,                                          // number
                null,
                'Another real task'
            ] };

            const ids = utils.createProposedTasksFromAnalysis(42, analysis);

            expect(ids).toHaveLength(2);  // only the two real strings
        });

        it('returns empty array for missing action_items', () => {
            expect(utils.createProposedTasksFromAnalysis(42, {})).toEqual([]);
            expect(utils.createProposedTasksFromAnalysis(42, null)).toEqual([]);
            expect(utils.createProposedTasksFromAnalysis(42, { action_items: [] })).toEqual([]);
        });

        it('returns empty array if action_items is not an array', () => {
            expect(utils.createProposedTasksFromAnalysis(42, { action_items: 'not an array' })).toEqual([]);
        });

        it('sets phone_call link, text, status=Pending, and proposed_due ~3 days out', () => {
            utils.createProposedTasksFromAnalysis(42, { action_items: ['Test item'] });

            const setValueCalls = mockRec.setValue.mock.calls.map(c => c[0]);
            const setTextCalls = mockRec.setText.mock.calls.map(c => c[0]);
            expect(setValueCalls).toContainEqual({ fieldId: 'custrecord_ctc_pt_phone_call', value: 42 });
            expect(setValueCalls).toContainEqual({ fieldId: 'custrecord_ctc_pt_text', value: 'Test item' });
            expect(setTextCalls).toContainEqual({ fieldId: 'custrecord_ctc_pt_status', text: 'Pending' });

            const dueCall = setValueCalls.find(c => c.fieldId === 'custrecord_ctc_pt_proposed_due');
            expect(dueCall).toBeDefined();
            const daysOut = Math.round((dueCall.value.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            expect(daysOut).toBe(3);
        });

        it('uses ignoreMandatoryFields on save', () => {
            utils.createProposedTasksFromAnalysis(42, { action_items: ['Item'] });
            expect(mockRec.save).toHaveBeenCalledWith({ ignoreMandatoryFields: true });
        });
    });

    describe('writePhoneCallEnrichmentFields integrates createProposedTasksFromAnalysis', () => {
        let phoneCallRec;
        let mockProposedRec;
        let savedProposedRecords;

        beforeEach(() => {
            phoneCallRec = {
                id: 99,
                setValue: jest.fn().mockReturnThis(),
                getValue: jest.fn()
            };
            savedProposedRecords = [];
            mockProposedRec = {
                setValue: jest.fn().mockReturnThis(),
                setText: jest.fn().mockReturnThis(),
                save: jest.fn(() => {
                    const id = 1000 + savedProposedRecords.length;
                    savedProposedRecords.push(id);
                    return id;
                })
            };
            record.create = jest.fn(() => mockProposedRec);
        });

        it('spawns proposed_tasks by default when action_items present', () => {
            utils.writePhoneCallEnrichmentFields(phoneCallRec, {
                recording: { sid: 'RE_x', duration: 60 },
                accountSid: 'AC_x',
                transcriptText: 'transcript',
                analysis: MOCK_ANALYSIS
            });

            expect(record.create).toHaveBeenCalledTimes(MOCK_ANALYSIS.action_items.length);
            expect(savedProposedRecords).toHaveLength(MOCK_ANALYSIS.action_items.length);
        });

        it('does NOT spawn proposed_tasks when opts.createProposedTasks === false', () => {
            utils.writePhoneCallEnrichmentFields(phoneCallRec, {
                recording: { sid: 'RE_x' },
                accountSid: 'AC_x',
                transcriptText: 't',
                analysis: MOCK_ANALYSIS,
                createProposedTasks: false
            });

            expect(record.create).not.toHaveBeenCalled();
        });

        it('swallows proposed_task creation errors without throwing', () => {
            record.create = jest.fn(() => { throw new Error('record.create failed'); });

            expect(() => utils.writePhoneCallEnrichmentFields(phoneCallRec, {
                recording: { sid: 'RE_x' },
                accountSid: 'AC_x',
                transcriptText: 't',
                analysis: MOCK_ANALYSIS
            })).not.toThrow();

            expect(log.error).toHaveBeenCalledWith(
                expect.objectContaining({ title: 'CTC Proposed Task Creation Failed' })
            );
        });

        it('uses opts.phoneCallId as fallback when phoneCallRec.id missing', () => {
            const noIdRec = { setValue: jest.fn().mockReturnThis(), getValue: jest.fn() };

            utils.writePhoneCallEnrichmentFields(noIdRec, {
                recording: { sid: 'RE_x' },
                accountSid: 'AC_x',
                transcriptText: 't',
                analysis: { action_items: ['Item'] },
                phoneCallId: 777
            });

            const setValueCalls = mockProposedRec.setValue.mock.calls.map(c => c[0]);
            expect(setValueCalls).toContainEqual({ fieldId: 'custrecord_ctc_pt_phone_call', value: 777 });
        });

        it('skips proposed_task creation when no phoneCallId available at all', () => {
            const noIdRec = { setValue: jest.fn().mockReturnThis(), getValue: jest.fn() };

            utils.writePhoneCallEnrichmentFields(noIdRec, {
                recording: { sid: 'RE_x' },
                accountSid: 'AC_x',
                transcriptText: 't',
                analysis: MOCK_ANALYSIS
            });

            expect(record.create).not.toHaveBeenCalled();
        });
    });
});
