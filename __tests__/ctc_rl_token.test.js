import restlet from 'SuiteScripts/click_to_call/ctc_rl_token';
import search from 'N/search';
import runtime from 'N/runtime';
import log from 'N/log';

jest.mock('N/search');
jest.mock('N/runtime');
jest.mock('N/log');
jest.mock('SuiteScripts/click_to_call/lib/ctc_twilio_jwt');

const twilioJwt = require('SuiteScripts/click_to_call/lib/ctc_twilio_jwt');

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
    });

    describe('post', () => {
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

        it('coerces numeric employeeId to string', () => {
            restlet.post({ employeeId: 123 });

            expect(twilioJwt.generateAccessToken).toHaveBeenCalledWith(
                expect.objectContaining({ identity: '123' })
            );
        });
    });
});
