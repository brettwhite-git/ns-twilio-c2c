import utils from 'SuiteScripts/click_to_call/lib/ctc_transcript_utils';
import https from 'N/https';
import llm from 'N/llm';
import log from 'N/log';

jest.mock('N/https');
jest.mock('N/llm');
jest.mock('N/log');

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

        it('returns null and logs error on non-200 response', () => {
            https.get.mockReturnValue({ code: 500, body: 'Server Error' });

            const result = utils.fetchRecordingForCall(ACCOUNT_SID, 'CA_err', AUTH_HEADER);

            expect(result).toBeNull();
            expect(log.error).toHaveBeenCalledWith(
                expect.objectContaining({ title: 'CTC Fetch Call Recordings Failed' })
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

        it('returns null when transcript is not completed', () => {
            https.get.mockReturnValue({
                code: 200,
                body: JSON.stringify({ transcripts: [{ ...MOCK_TRANSCRIPT, status: 'in_progress' }] })
            });

            const result = utils.fetchTranscript('RE_test', AUTH_HEADER);
            expect(result).toBeNull();
        });

        it('returns null when no transcripts exist', () => {
            https.get.mockReturnValue({
                code: 200,
                body: JSON.stringify({ transcripts: [] })
            });

            const result = utils.fetchTranscript('RE_test', AUTH_HEADER);
            expect(result).toBeNull();
        });

        it('returns null on non-200 response', () => {
            https.get.mockReturnValue({ code: 500, body: 'Error' });

            const result = utils.fetchTranscript('RE_test', AUTH_HEADER);
            expect(result).toBeNull();
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
            utils.deleteRecording(ACCOUNT_SID, 'RE_test_001', AUTH_HEADER);

            expect(https.delete).toHaveBeenCalledWith(expect.objectContaining({
                url: expect.stringContaining('RE_test_001.json'),
                headers: { Authorization: AUTH_HEADER }
            }));
        });

        it('logs error on failed deletion', () => {
            https.delete.mockReturnValue({ code: 500, body: 'Error' });

            utils.deleteRecording(ACCOUNT_SID, 'RE_test_001', AUTH_HEADER);

            expect(log.error).toHaveBeenCalledWith(
                expect.objectContaining({ title: 'CTC Delete Recording Failed' })
            );
        });

        it('does not log error on 204 response', () => {
            https.delete.mockReturnValue({ code: 204, body: '' });

            utils.deleteRecording(ACCOUNT_SID, 'RE_test_001', AUTH_HEADER);

            expect(log.error).not.toHaveBeenCalled();
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
});
