import restlet from 'SuiteScripts/click_to_call/ctc_rl_token';
import search from 'N/search';
import runtime from 'N/runtime';
import log from 'N/log';
import record from 'N/record';
import https from 'N/https';
import encode from 'N/encode';
import llm from 'N/llm';

jest.mock('N/search');
jest.mock('N/runtime');
jest.mock('N/log');
jest.mock('N/record');
jest.mock('N/https');
jest.mock('N/encode');
jest.mock('N/llm');
jest.mock('SuiteScripts/click_to_call/lib/ctc_twilio_jwt');
jest.mock('SuiteScripts/click_to_call/lib/ctc_transcript_utils');

const twilioJwt = require('SuiteScripts/click_to_call/lib/ctc_twilio_jwt');
const utils = require('SuiteScripts/click_to_call/lib/ctc_transcript_utils');

describe('ctc_rl_token', () => {
    const mockConfigResult = {
        getValue: jest.fn((field) => {
            const values = {
                custrecord_ctc_account_sid: 'AC_test_account',
                custrecord_ctc_auth_token: 'auth_token_123',
                custrecord_ctc_api_key_sid: 'SK_test_key',
                custrecord_ctc_api_secret_id: 'custsecret_ctc_api_key_secret',
                custrecord_ctc_twiml_app_sid: 'AP_test_app',
                custrecord_ctc_phone_number: '+15551234567',
                custrecord_ctc_intel_service_sid: 'GA_test_intel'
            };
            return values[field] || '';
        })
    };

    let mockSearchRun;

    beforeEach(() => {
        jest.clearAllMocks();

        mockSearchRun = {
            getRange: jest.fn().mockReturnValue([mockConfigResult])
        };

        search.create.mockReturnValue({
            run: jest.fn().mockReturnValue(mockSearchRun)
        });

        runtime.getCurrentUser.mockReturnValue({ id: 42 });
        twilioJwt.generateAccessToken.mockReturnValue('mock.jwt.token');

        record.Type = { PHONE_CALL: 'phonecall' };
        record.create = jest.fn().mockReturnValue({
            setValue: jest.fn(),
            save: jest.fn().mockReturnValue(99999)
        });

        encode.convert.mockReturnValue('QUNX0dGVzdF9hY2NvdW50OmF1dGhfdG9rZW5fMTIz');
        encode.Encoding = { UTF_8: 'UTF_8', BASE_64: 'BASE_64' };

        llm.getRemainingFreeUsage = jest.fn().mockReturnValue(100);
        llm.ModelFamily = { COHERE_COMMAND: 'COHERE_COMMAND' };

        // Utils mocks
        utils.TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01/Accounts';
        utils.fetchRecordingForCall = jest.fn();
        utils.fetchTranscript = jest.fn();
        utils.fetchSentences = jest.fn();
        utils.formatTranscript = jest.fn();
        utils.analyzeTranscript = jest.fn();
        utils.deleteRecording = jest.fn();
    });

    describe('post — token generation', () => {
        it('returns a token object', () => {
            const result = restlet.post({});
            expect(result).toHaveProperty('token');
            expect(result.token).toBe('mock.jwt.token');
        });

        it('loads config from customrecord_ctc_config', () => {
            restlet.post({});

            expect(search.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'customrecord_ctc_config',
                    filters: [['isinactive', 'is', 'F']]
                })
            );
        });

        it('passes config values to generateAccessToken', () => {
            restlet.post({});

            expect(twilioJwt.generateAccessToken).toHaveBeenCalledWith({
                accountSid: 'AC_test_account',
                apiKeySid: 'SK_test_key',
                apiSecretId: 'custsecret_ctc_api_key_secret',
                twimlAppSid: 'AP_test_app',
                identity: '42'
            });
        });

        it('uses provided employeeId as identity', () => {
            restlet.post({ employeeId: '99' });

            expect(twilioJwt.generateAccessToken).toHaveBeenCalledWith(
                expect.objectContaining({ identity: '99' })
            );
        });

        it('defaults identity to current user ID when employeeId not provided', () => {
            restlet.post({});

            expect(runtime.getCurrentUser).toHaveBeenCalled();
            expect(twilioJwt.generateAccessToken).toHaveBeenCalledWith(
                expect.objectContaining({ identity: '42' })
            );
        });

        it('defaults identity to current user ID when request body is null', () => {
            restlet.post(null);

            expect(runtime.getCurrentUser).toHaveBeenCalled();
            expect(twilioJwt.generateAccessToken).toHaveBeenCalledWith(
                expect.objectContaining({ identity: '42' })
            );
        });

        it('returns error when config record not found', () => {
            mockSearchRun.getRange.mockReturnValue([]);

            const result = restlet.post({});

            expect(result).toHaveProperty('error');
            expect(result.error).toBe('Token generation failed');
        });

        it('logs error when config record not found', () => {
            mockSearchRun.getRange.mockReturnValue([]);

            restlet.post({});

            expect(log.error).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'CTC Token Generation Failed'
                })
            );
        });

        it('returns error when JWT generation throws', () => {
            twilioJwt.generateAccessToken.mockImplementation(() => {
                throw new Error('crypto failure');
            });

            const result = restlet.post({});

            expect(result).toHaveProperty('error');
            expect(result.error).toBe('Token generation failed');
        });

        it('includes phoneNumber from config in response', () => {
            const result = restlet.post({});
            expect(result).toHaveProperty('phoneNumber', '+15551234567');
        });

        it('coerces numeric employeeId to string', () => {
            restlet.post({ employeeId: 123 });

            expect(twilioJwt.generateAccessToken).toHaveBeenCalledWith(
                expect.objectContaining({ identity: '123' })
            );
        });
    });

    describe('logCall action', () => {
        it('creates a Phone Call record with correct fields', () => {
            const mockPhoneCall = {
                setValue: jest.fn(),
                save: jest.fn().mockReturnValue(12345)
            };
            record.create.mockReturnValue(mockPhoneCall);

            const result = restlet.post({
                action: 'logCall',
                callSid: 'CA_test_123',
                entityId: '100',
                entityType: 'customer',
                contactId: '200',
                phone: '+15551234567',
                duration: 120
            });

            expect(record.create).toHaveBeenCalledWith({ type: 'phonecall', isDynamic: true });
            expect(result).toEqual({ success: true, recordId: 12345 });

            const fields = {};
            mockPhoneCall.setValue.mock.calls.forEach((call) => {
                fields[call[0].fieldId] = call[0].value;
            });
            expect(fields.title).toBe('Call to +15551234567');
            expect(fields.status).toBe('COMPLETE');
            expect(fields.phone).toBe('+15551234567');
            expect(fields.custevent_ctc_call_sid).toBe('CA_test_123');
            expect(fields.custevent_ctc_duration).toBe(120);
            expect(fields.custevent_ctc_processed).toBe(false);
            expect(fields.company).toBe('100');
            expect(fields.contact).toBe('200');
        });

        it('does not set company for contact entityType', () => {
            const mockPhoneCall = {
                setValue: jest.fn(),
                save: jest.fn().mockReturnValue(12345)
            };
            record.create.mockReturnValue(mockPhoneCall);

            restlet.post({
                action: 'logCall',
                callSid: 'CA_test_456',
                entityId: '300',
                entityType: 'contact',
                phone: '+15559876543',
                duration: 60
            });

            const fieldIds = mockPhoneCall.setValue.mock.calls.map((c) => c[0].fieldId);
            expect(fieldIds).not.toContain('company');
        });

        it('still generates token when no action specified', () => {
            const result = restlet.post({});
            expect(result).toHaveProperty('token', 'mock.jwt.token');
        });

        it('returns error when Phone Call creation fails', () => {
            record.create.mockImplementation(() => { throw new Error('Record error'); });

            const result = restlet.post({
                action: 'logCall',
                callSid: 'CA_test_fail',
                phone: '+15551234567',
                duration: 30
            });

            expect(result).toHaveProperty('error', 'Failed to log call');
            expect(log.error).toHaveBeenCalledWith(
                expect.objectContaining({ title: 'CTC Log Call Failed' })
            );
        });
    });

    describe('checkTranscript action', () => {
        const MOCK_RECORDING = {
            sid: 'RE_test_001',
            duration: '90'
        };

        const MOCK_TRANSCRIPT = {
            sid: 'GT_test_001',
            status: 'completed'
        };

        const MOCK_ANALYSIS = {
            title: 'Product discussion — positive outcome',
            summary: 'Good call about product.',
            satisfaction_score: 8,
            tone_keywords: ['positive', 'engaged'],
            action_items: ['Follow up next week']
        };

        let mockPhoneCall;

        beforeEach(() => {
            mockPhoneCall = {
                setValue: jest.fn(),
                save: jest.fn().mockReturnValue(55555)
            };
            record.load = jest.fn().mockReturnValue(mockPhoneCall);

            utils.fetchRecordingForCall.mockReturnValue(MOCK_RECORDING);
            utils.fetchTranscript.mockReturnValue(MOCK_TRANSCRIPT);
            utils.fetchSentences.mockReturnValue([
                { media_channel: 1, transcript: 'Hello' }
            ]);
            utils.formatTranscript.mockReturnValue('[REP] Hello');
            utils.analyzeTranscript.mockReturnValue(MOCK_ANALYSIS);
        });

        it('returns no_recording when no recording found', () => {
            utils.fetchRecordingForCall.mockReturnValue(null);

            const result = restlet.post({
                action: 'checkTranscript',
                callSid: 'CA_none',
                recordId: '100'
            });

            expect(result).toEqual({ status: 'no_recording' });
        });

        it('returns pending when transcript not ready', () => {
            utils.fetchTranscript.mockReturnValue(null);

            const result = restlet.post({
                action: 'checkTranscript',
                callSid: 'CA_test',
                recordId: '100'
            });

            expect(result).toEqual({ status: 'pending' });
        });

        it('returns completed and enriches Phone Call record', () => {
            const result = restlet.post({
                action: 'checkTranscript',
                callSid: 'CA_test',
                recordId: '100'
            });

            expect(result).toEqual({ status: 'completed' });

            expect(record.load).toHaveBeenCalledWith({
                type: 'phonecall',
                id: '100',
                isDynamic: true
            });

            const fields = {};
            mockPhoneCall.setValue.mock.calls.forEach((call) => {
                fields[call[0].fieldId] = call[0].value;
            });

            expect(fields.title).toBe('Product discussion — positive outcome');
            expect(fields.custevent_ctc_recording_sid).toBe('RE_test_001');
            expect(fields.custevent_ctc_transcript).toBe('[REP] Hello');
            expect(fields.custevent_ctc_ai_summary).toBe('Good call about product.');
            expect(fields.custevent_ctc_satisfaction).toBe(8);
            expect(fields.custevent_ctc_tone_keywords).toBe('positive, engaged');
            expect(fields.custevent_ctc_action_items).toBe('Follow up next week');
            expect(fields.custevent_ctc_processed).toBe(true);
            expect(mockPhoneCall.save).toHaveBeenCalled();
        });

        it('deletes recording after enrichment', () => {
            restlet.post({
                action: 'checkTranscript',
                callSid: 'CA_test',
                recordId: '100'
            });

            expect(utils.deleteRecording).toHaveBeenCalledWith(
                'AC_test_account', 'RE_test_001', expect.any(String)
            );
        });

        it('skips AI analysis when quota is low', () => {
            llm.getRemainingFreeUsage.mockReturnValue(5);

            const result = restlet.post({
                action: 'checkTranscript',
                callSid: 'CA_test',
                recordId: '100'
            });

            expect(result).toEqual({ status: 'completed' });
            expect(utils.analyzeTranscript).not.toHaveBeenCalled();
            // Should still enrich with transcript
            expect(mockPhoneCall.setValue).toHaveBeenCalledWith(
                expect.objectContaining({ fieldId: 'custevent_ctc_transcript', value: '[REP] Hello' })
            );
        });

        it('returns error on exception', () => {
            mockSearchRun.getRange.mockReturnValue([]);

            const result = restlet.post({
                action: 'checkTranscript',
                callSid: 'CA_test',
                recordId: '100'
            });

            expect(result).toHaveProperty('error', 'Transcript check failed');
            expect(log.error).toHaveBeenCalledWith(
                expect.objectContaining({ title: 'CTC Check Transcript Failed' })
            );
        });

        it('builds auth header from config', () => {
            restlet.post({
                action: 'checkTranscript',
                callSid: 'CA_test',
                recordId: '100'
            });

            expect(encode.convert).toHaveBeenCalledWith({
                string: 'AC_test_account:auth_token_123',
                inputEncoding: 'UTF_8',
                outputEncoding: 'BASE_64'
            });
        });
    });
});
