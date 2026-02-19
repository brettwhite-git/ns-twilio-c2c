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
        date_created: '2024-06-15T10:30:00Z',
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
        summary: 'Customer inquired about product features. Rep provided overview.',
        satisfaction_score: 7,
        tone_keywords: ['interested', 'helpful', 'engaged'],
        action_items: ['Send product brochure', 'Schedule follow-up call']
    };

    let mockSearchRun;
    let mockDuplicateSearchRun;
    let mockPhoneCall;
    let searchCreateCallCount;

    beforeEach(() => {
        jest.clearAllMocks();

        searchCreateCallCount = 0;

        // Config search (first call) and duplicate search (subsequent calls)
        mockSearchRun = {
            getRange: jest.fn().mockReturnValue([mockConfigResult])
        };
        mockDuplicateSearchRun = {
            getRange: jest.fn().mockReturnValue([]) // no duplicates by default
        };

        search.create.mockImplementation((opts) => {
            if (opts.type === 'customrecord_ctc_config') {
                return { run: jest.fn().mockReturnValue(mockSearchRun) };
            }
            // duplicate check (PHONE_CALL type)
            return { run: jest.fn().mockReturnValue(mockDuplicateSearchRun) };
        });

        // search.Type enum
        search.Type = { PHONE_CALL: 'phonecall' };

        // encode.convert for Basic Auth
        encode.convert.mockReturnValue('QUNX0dGVzdF9hY2NvdW50OmF1dGhfdG9rZW5fMTIz');
        encode.Encoding = { UTF_8: 'UTF_8', BASE_64: 'BASE_64' };

        // N/llm
        llm.getRemainingFreeUsage.mockReturnValue(100);
        llm.ModelFamily = { COHERE_COMMAND: 'COHERE_COMMAND' };
        llm.generateText.mockReturnValue({
            text: JSON.stringify(MOCK_ANALYSIS)
        });

        // N/https — default responses
        https.get.mockImplementation(({ url }) => {
            if (url.includes('/Recordings.json')) {
                return {
                    code: 200,
                    body: JSON.stringify({ recordings: [MOCK_RECORDING] })
                };
            }
            if (url.includes('/Transcripts?SourceSid=')) {
                return {
                    code: 200,
                    body: JSON.stringify({ transcripts: [MOCK_TRANSCRIPT] })
                };
            }
            if (url.includes('/Sentences')) {
                return {
                    code: 200,
                    body: JSON.stringify({ sentences: MOCK_SENTENCES })
                };
            }
            return { code: 404, body: 'Not found' };
        });

        https.delete = jest.fn().mockReturnValue({ code: 204, body: '' });

        // N/record
        mockPhoneCall = {
            setValue: jest.fn(),
            save: jest.fn().mockReturnValue(12345)
        };
        record.create.mockReturnValue(mockPhoneCall);
        record.Type = { PHONE_CALL: 'phonecall' };
    });

    describe('loadConfig', () => {
        it('loads config from customrecord_ctc_config', () => {
            scheduledScript.execute();

            expect(search.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'customrecord_ctc_config',
                    filters: [['isinactive', 'is', 'F']]
                })
            );
        });

        it('logs error when config record not found', () => {
            mockSearchRun.getRange.mockReturnValue([]);

            scheduledScript.execute();

            expect(log.error).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'CTC Poll Execute Error'
                })
            );
        });
    });

    describe('buildAuthHeader', () => {
        it('calls encode.convert with accountSid:authToken', () => {
            scheduledScript.execute();

            expect(encode.convert).toHaveBeenCalledWith({
                string: 'AC_test_account:auth_token_123',
                inputEncoding: 'UTF_8',
                outputEncoding: 'BASE_64'
            });
        });
    });

    describe('fetchRecentRecordings', () => {
        it('calls Twilio Recordings API with correct URL and auth', () => {
            scheduledScript.execute();

            const recordingsCall = https.get.mock.calls.find(
                (call) => call[0].url.includes('/Recordings.json')
            );
            expect(recordingsCall).toBeDefined();
            expect(recordingsCall[0].url).toContain('AC_test_account/Recordings.json');
            expect(recordingsCall[0].headers.Authorization).toContain('Basic ');
        });

        it('returns empty array on non-200 response', () => {
            https.get.mockImplementation(({ url }) => {
                if (url.includes('/Recordings.json')) {
                    return { code: 500, body: 'Server Error' };
                }
                return { code: 200, body: '{}' };
            });

            scheduledScript.execute();

            // Should not attempt to process any recordings
            expect(record.create).not.toHaveBeenCalled();
        });
    });

    describe('duplicate detection', () => {
        it('skips already-processed recordings', () => {
            mockDuplicateSearchRun.getRange.mockReturnValue([{ id: '999' }]);

            scheduledScript.execute();

            // Should search for the recording SID
            expect(search.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'phonecall',
                    filters: [['custevent_ctc_recording_sid', 'is', 'RE_test_recording_001']]
                })
            );

            // Should NOT create a Phone Call record
            expect(record.create).not.toHaveBeenCalled();
        });

        it('processes non-duplicate recordings', () => {
            mockDuplicateSearchRun.getRange.mockReturnValue([]);

            scheduledScript.execute();

            expect(record.create).toHaveBeenCalled();
        });
    });

    describe('transcript formatting', () => {
        it('formats sentences with [REP] and [CUSTOMER] labels', () => {
            scheduledScript.execute();

            // Check that the transcript is passed to the Phone Call record
            const transcriptCall = mockPhoneCall.setValue.mock.calls.find(
                (call) => call[0].fieldId === 'custevent_ctc_transcript'
            );
            expect(transcriptCall).toBeDefined();
            const text = transcriptCall[0].value;
            expect(text).toContain('[REP] Hello, how can I help you today?');
            expect(text).toContain('[CUSTOMER] I am interested in your product.');
            expect(text).toContain('[REP] Great, let me tell you about our features.');
        });
    });

    describe('AI analysis', () => {
        it('calls llm.generateText with transcript', () => {
            scheduledScript.execute();

            expect(llm.generateText).toHaveBeenCalledWith(
                expect.objectContaining({
                    modelFamily: 'COHERE_COMMAND',
                    modelParameters: { temperature: 0.2, maxTokens: 800 }
                })
            );
            expect(llm.generateText.mock.calls[0][0].prompt).toContain('[REP] Hello');
        });

        it('handles markdown code fences in LLM response', () => {
            llm.generateText.mockReturnValue({
                text: '```json\n' + JSON.stringify(MOCK_ANALYSIS) + '\n```'
            });

            scheduledScript.execute();

            const summaryCall = mockPhoneCall.setValue.mock.calls.find(
                (call) => call[0].fieldId === 'custevent_ctc_ai_summary'
            );
            expect(summaryCall[0].value).toBe(MOCK_ANALYSIS.summary);
        });

        it('falls back to defaults on malformed JSON', () => {
            llm.generateText.mockReturnValue({
                text: 'This is not valid JSON at all'
            });

            scheduledScript.execute();

            const scoreCall = mockPhoneCall.setValue.mock.calls.find(
                (call) => call[0].fieldId === 'custevent_ctc_satisfaction'
            );
            expect(scoreCall[0].value).toBe(5);

            const keywordsCall = mockPhoneCall.setValue.mock.calls.find(
                (call) => call[0].fieldId === 'custevent_ctc_tone_keywords'
            );
            expect(keywordsCall[0].value).toBe('');
        });

        it('skips AI when quota is low', () => {
            llm.getRemainingFreeUsage.mockReturnValue(5);

            scheduledScript.execute();

            expect(llm.generateText).not.toHaveBeenCalled();
            // Should still create the Phone Call record
            expect(record.create).toHaveBeenCalled();
        });
    });

    describe('Phone Call record creation', () => {
        it('creates record with correct type when no existing record', () => {
            scheduledScript.execute();

            expect(record.create).toHaveBeenCalledWith({
                type: 'phonecall',
                isDynamic: true
            });
        });

        it('sets all required fields', () => {
            scheduledScript.execute();

            const fields = {};
            mockPhoneCall.setValue.mock.calls.forEach((call) => {
                fields[call[0].fieldId] = call[0].value;
            });

            expect(fields.title).toBe(MOCK_ANALYSIS.summary.substring(0, 80));
            expect(fields.status).toBe('COMPLETE');
            expect(fields.custevent_ctc_recording_sid).toBe('RE_test_recording_001');
            expect(fields.custevent_ctc_recording_url).toContain('RE_test_recording_001.mp3');
            expect(fields.custevent_ctc_duration).toBe(120);
            expect(fields.custevent_ctc_ai_summary).toBe(MOCK_ANALYSIS.summary);
            expect(fields.custevent_ctc_satisfaction).toBe(7);
            expect(fields.custevent_ctc_tone_keywords).toBe('interested, helpful, engaged');
            expect(fields.custevent_ctc_action_items).toBe('Send product brochure\nSchedule follow-up call');
            expect(fields.custevent_ctc_processed).toBe(true);
        });

        it('uses fallback title when summary is empty', () => {
            llm.generateText.mockReturnValue({
                text: JSON.stringify({
                    summary: '',
                    satisfaction_score: 5,
                    tone_keywords: [],
                    action_items: []
                })
            });

            scheduledScript.execute();

            const titleCall = mockPhoneCall.setValue.mock.calls.find(
                (call) => call[0].fieldId === 'title'
            );
            expect(titleCall[0].value).toContain('RE_test_recording_001');
        });

        it('saves the record', () => {
            scheduledScript.execute();

            expect(mockPhoneCall.save).toHaveBeenCalled();
        });
    });

    describe('update existing record by call_sid', () => {
        it('loads existing record when call_sid match found', () => {
            const mockExistingRecord = {
                setValue: jest.fn(),
                save: jest.fn().mockReturnValue(77777)
            };
            record.load = jest.fn().mockReturnValue(mockExistingRecord);

            // The call_sid search returns a match
            search.create.mockImplementation((opts) => {
                if (opts.type === 'customrecord_ctc_config') {
                    return { run: jest.fn().mockReturnValue(mockSearchRun) };
                }
                if (opts.filters && opts.filters[0] && opts.filters[0][0] === 'custevent_ctc_call_sid') {
                    return { run: jest.fn().mockReturnValue({ getRange: jest.fn().mockReturnValue([{ id: '77777' }]) }) };
                }
                // duplicate check by recording_sid
                return { run: jest.fn().mockReturnValue(mockDuplicateSearchRun) };
            });

            scheduledScript.execute();

            expect(record.load).toHaveBeenCalledWith({
                type: 'phonecall',
                id: '77777',
                isDynamic: true
            });
            expect(record.create).not.toHaveBeenCalled();
            expect(mockExistingRecord.save).toHaveBeenCalled();
        });

        it('creates new record when no call_sid match found', () => {
            search.create.mockImplementation((opts) => {
                if (opts.type === 'customrecord_ctc_config') {
                    return { run: jest.fn().mockReturnValue(mockSearchRun) };
                }
                // All other searches return empty
                return { run: jest.fn().mockReturnValue({ getRange: jest.fn().mockReturnValue([]) }) };
            });

            scheduledScript.execute();

            expect(record.create).toHaveBeenCalledWith({
                type: 'phonecall',
                isDynamic: true
            });
        });
    });

    describe('recording deletion', () => {
        it('deletes recording after successful processing', () => {
            scheduledScript.execute();

            expect(https.delete).toHaveBeenCalledWith(
                expect.objectContaining({
                    url: expect.stringContaining('RE_test_recording_001.json')
                })
            );
        });

        it('logs error on failed deletion', () => {
            https.delete.mockReturnValue({ code: 500, body: 'Server Error' });

            scheduledScript.execute();

            expect(log.error).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'CTC Delete Recording Failed'
                })
            );
        });
    });

    describe('error isolation', () => {
        it('continues processing after one recording fails', () => {
            const recording2 = { ...MOCK_RECORDING, sid: 'RE_test_recording_002' };

            https.get.mockImplementation(({ url }) => {
                if (url.includes('/Recordings.json')) {
                    return {
                        code: 200,
                        body: JSON.stringify({ recordings: [MOCK_RECORDING, recording2] })
                    };
                }
                if (url.includes('/Transcripts?SourceSid=RE_test_recording_001')) {
                    throw new Error('Network timeout');
                }
                if (url.includes('/Transcripts?SourceSid=RE_test_recording_002')) {
                    return {
                        code: 200,
                        body: JSON.stringify({ transcripts: [{ ...MOCK_TRANSCRIPT, sid: 'GT_002' }] })
                    };
                }
                if (url.includes('/Sentences')) {
                    return {
                        code: 200,
                        body: JSON.stringify({ sentences: MOCK_SENTENCES })
                    };
                }
                return { code: 404, body: '' };
            });

            scheduledScript.execute();

            // First recording errored, second should still process
            expect(record.create).toHaveBeenCalledTimes(1);
            expect(log.error).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'CTC Recording Processing Error'
                })
            );
        });

        it('does not throw from execute', () => {
            mockSearchRun.getRange.mockReturnValue([]);

            expect(() => scheduledScript.execute()).not.toThrow();
        });
    });

    describe('transcript not ready', () => {
        it('skips recording when transcript is not completed', () => {
            https.get.mockImplementation(({ url }) => {
                if (url.includes('/Recordings.json')) {
                    return {
                        code: 200,
                        body: JSON.stringify({ recordings: [MOCK_RECORDING] })
                    };
                }
                if (url.includes('/Transcripts?SourceSid=')) {
                    return {
                        code: 200,
                        body: JSON.stringify({ transcripts: [{ ...MOCK_TRANSCRIPT, status: 'in_progress' }] })
                    };
                }
                return { code: 200, body: '{}' };
            });

            scheduledScript.execute();

            expect(record.create).not.toHaveBeenCalled();
        });

        it('skips recording when no transcripts returned', () => {
            https.get.mockImplementation(({ url }) => {
                if (url.includes('/Recordings.json')) {
                    return {
                        code: 200,
                        body: JSON.stringify({ recordings: [MOCK_RECORDING] })
                    };
                }
                if (url.includes('/Transcripts?SourceSid=')) {
                    return {
                        code: 200,
                        body: JSON.stringify({ transcripts: [] })
                    };
                }
                return { code: 200, body: '{}' };
            });

            scheduledScript.execute();

            expect(record.create).not.toHaveBeenCalled();
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
