import scheduledScript from 'SuiteScripts/click_to_call/ctc_ss_poll_transcripts';
import https from 'N/https';
import record from 'N/record';
import search from 'N/search';
import llm from 'N/llm';
import encode from 'N/encode';
import log from 'N/log';

jest.mock('N/https');
jest.mock('N/record');
jest.mock('N/search');
jest.mock('N/llm');
jest.mock('N/encode');
jest.mock('N/log');
jest.mock('SuiteScripts/click_to_call/lib/ctc_transcript_utils');

const utils = require('SuiteScripts/click_to_call/lib/ctc_transcript_utils');

describe('ctc_ss_poll_transcripts', () => {

    const MOCK_CONFIG = {
        custrecord_ctc_account_sid: 'AC_test_account',
        custrecord_ctc_auth_token: 'auth_token_123',
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

        search.create.mockImplementation((opts) => {
            if (opts.type === 'customrecord_ctc_config') {
                return { run: jest.fn().mockReturnValue(mockConfigSearchRun) };
            }
            // Unprocessed Phone Call search
            return { run: jest.fn().mockReturnValue(mockUnprocessedSearchRun) };
        });

        search.Type = { PHONE_CALL: 'phonecall' };

        encode.convert.mockReturnValue('QUNX0dGVzdF9hY2NvdW50OmF1dGhfdG9rZW5fMTIz');
        encode.Encoding = { UTF_8: 'UTF_8', BASE_64: 'BASE_64' };

        llm.getRemainingFreeUsage.mockReturnValue(100);
        llm.ModelFamily = { COHERE_COMMAND: 'COHERE_COMMAND' };

        // Utils mocks
        utils.TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01/Accounts';
        utils.fetchRecordingForCall.mockReturnValue(MOCK_RECORDING);
        utils.fetchTranscript.mockReturnValue(MOCK_TRANSCRIPT);
        utils.fetchSentences.mockReturnValue([
            { media_channel: 1, transcript: 'Hello' },
            { media_channel: 2, transcript: 'Hi there' }
        ]);
        utils.formatTranscript.mockReturnValue('[REP] Hello\n[CUSTOMER] Hi there');
        utils.analyzeTranscript.mockReturnValue(MOCK_ANALYSIS);
        utils.deleteRecording.mockImplementation(() => {});

        // N/record
        mockPhoneCall = {
            setValue: jest.fn(),
            save: jest.fn().mockReturnValue(12345)
        };
        record.load = jest.fn().mockReturnValue(mockPhoneCall);
        record.Type = { PHONE_CALL: 'phonecall' };
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

            expect(utils.fetchRecordingForCall).toHaveBeenCalledWith(
                'AC_test_account', 'CA_test_call_001', expect.stringContaining('Basic ')
            );
        });

        it('skips call when no recording found', () => {
            utils.fetchRecordingForCall.mockReturnValue(null);

            scheduledScript.execute();

            expect(utils.fetchTranscript).not.toHaveBeenCalled();
            expect(record.load).not.toHaveBeenCalled();
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
                    details: 'Processed: 0, Skipped: 0, Errors: 0'
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
                    details: expect.stringContaining('Processed: 1')
                })
            );
        });
    });
});
