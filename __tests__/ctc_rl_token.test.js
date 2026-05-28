import restlet from 'SuiteScripts/ctc_rl_token';
import search from 'N/search';
import query from 'N/query';
import runtime from 'N/runtime';
import log from 'N/log';
import record from 'N/record';
import https from 'N/https';
import encode from 'N/encode';
import llm from 'N/llm';

jest.mock('N/search');
jest.mock('N/query');
jest.mock('N/runtime');
jest.mock('N/log');
jest.mock('N/record');
jest.mock('N/https');
jest.mock('N/encode');
jest.mock('N/llm');
jest.mock('SuiteScripts/lib/ctc_twilio_jwt');
jest.mock('SuiteScripts/lib/ctc_transcript_utils');
jest.mock('SuiteScripts/lib/ctc_twilio_admin', () => ({
    // U10: buildSecureAuthHeader replaces the legacy buildAuthHeader.
    // Returns an opaque sentinel so callers pass it through unchanged.
    buildSecureAuthHeader: jest.fn().mockReturnValue('__SECURESTRING_AUTH__'),
    // CRIT-2 / CRIT-3 gate dependency. Happy-path default: Twilio knows the
    // call and its `from` matches cfg.phoneNumber so verifyCallOwnership
    // passes for existing tests that only care about Phone Call writes.
    // Per-test overrides set the rejected/forbidden cases.
    getCall: jest.fn().mockImplementation(() => ({
        ok: true,
        status: 200,
        call: {
            sid: 'CAdeadbeefdeadbeefdeadbeefdeadbeef',
            from: '+15551234567',
            to: '+15559876543',
            callStatus: 'completed',
            duration: 60
        }
    }))
}));

const twilioJwt = require('SuiteScripts/lib/ctc_twilio_jwt');
const utils = require('SuiteScripts/lib/ctc_transcript_utils');

describe('ctc_rl_token', () => {
    const mockConfigResult = {
        getValue: jest.fn((field) => {
            const values = {
                custrecord_ctc_account_sid: 'AC_test_account',
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
            getRange: jest.fn().mockReturnValue([mockConfigResult]),
            // CRIT-2 / CRIT-3 gate: getUserAssignedPhones uses .run().each().
            // Default: no rep_assignment rows, so verifyCallOwnership falls
            // back to cfg.phoneNumber match (which the mock getCall returns).
            each: jest.fn()
        };

        search.create.mockReturnValue({
            run: jest.fn().mockReturnValue(mockSearchRun)
        });

        runtime.getCurrentUser.mockReturnValue({ id: 42 });
        twilioJwt.generateAccessToken.mockReturnValue('mock.jwt.token');

        search.Type = { CONTACT: 'contact' };
        search.lookupFields = jest.fn().mockReturnValue({ company: [] });

        // N/query SuiteQL runner — workspace_queries.getBookCustomerIds calls
        // this before loadHistoryRows / loadTaskGroups. Default to a two-customer
        // book so the history/tasks lookups don't short-circuit during RESTlet
        // action tests. Per-test setups can override.
        query.runSuiteQL = jest.fn().mockReturnValue({
            asMappedResults: () => [{ id: '500' }, { id: '501' }]
        });

        record.Type = { PHONE_CALL: 'phonecall' };
        record.create = jest.fn().mockReturnValue({
            setValue: jest.fn(),
            save: jest.fn().mockReturnValue(99999)
        });
        record.submitFields = jest.fn();

        encode.convert.mockReturnValue('QUNX0dGVzdF9hY2NvdW50OmF1dGhfdG9rZW5fMTIz');
        encode.Encoding = { UTF_8: 'UTF_8', BASE_64: 'BASE_64' };

        llm.getRemainingFreeUsage = jest.fn().mockReturnValue(100);
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
        utils.fetchRecordingForCall = jest.fn();
        utils.fetchTranscript = jest.fn();
        utils.fetchSentences = jest.fn();
        utils.formatTranscript = jest.fn();
        utils.analyzeTranscript = jest.fn();
        utils.deleteRecording = jest.fn();
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

        // CRIT-1 regression — body.employeeId MUST NOT override session identity.
        // Pre-fix, generateToken read `body.employeeId ? body.employeeId : currentUser`,
        // letting any authenticated internal user mint a JWT bound to another rep.
        it('CRIT-1: ignores body.employeeId; always uses runtime.getCurrentUser().id', () => {
            restlet.post({ employeeId: '99' });

            expect(runtime.getCurrentUser).toHaveBeenCalled();
            expect(twilioJwt.generateAccessToken).toHaveBeenCalledWith(
                expect.objectContaining({ identity: '42' })
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

        it('CRIT-1: ignores numeric body.employeeId override too', () => {
            restlet.post({ employeeId: 123 });

            // identity must still be the session user (42), not the body's 123
            expect(twilioJwt.generateAccessToken).toHaveBeenCalledWith(
                expect.objectContaining({ identity: '42' })
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
                callSid: 'CA00000000000000000000000000000123',
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
            expect(fields.custevent_ctc_call_sid).toBe('CA00000000000000000000000000000123');
            expect(fields.custevent_ctc_duration).toBe(120);
            expect(fields.custevent_ctc_processed).toBe(false);
            // Phone Call's company/contact fields require numeric IDs;
            // the numericId() guard in logCall converts string body params.
            expect(fields.company).toBe(100);
            expect(fields.contact).toBe(200);
        });

        it('sets contact to entityId and company to parent customer for contact entityType', () => {
            const mockPhoneCall = {
                setValue: jest.fn(),
                save: jest.fn().mockReturnValue(12345)
            };
            record.create.mockReturnValue(mockPhoneCall);
            search.lookupFields.mockReturnValue({
                company: [{ value: '500', text: 'Acme Corp' }]
            });

            restlet.post({
                action: 'logCall',
                callSid: 'CA00000000000000000000000000000456',
                entityId: '300',
                entityType: 'contact',
                phone: '+15559876543',
                duration: 60
            });

            expect(search.lookupFields).toHaveBeenCalledWith({
                type: 'contact',
                id: 300,
                columns: ['company']
            });

            const fields = {};
            mockPhoneCall.setValue.mock.calls.forEach((call) => {
                fields[call[0].fieldId] = call[0].value;
            });
            expect(fields.contact).toBe(300);
            expect(fields.company).toBe('500');
        });

        it('omits company when contact has no parent customer', () => {
            const mockPhoneCall = {
                setValue: jest.fn(),
                save: jest.fn().mockReturnValue(12345)
            };
            record.create.mockReturnValue(mockPhoneCall);
            search.lookupFields.mockReturnValue({ company: [] });

            restlet.post({
                action: 'logCall',
                callSid: 'CA0000000000000000000000000orphan0',
                entityId: '301',
                entityType: 'contact',
                phone: '+15550000001',
                duration: 30
            });

            const fields = {};
            mockPhoneCall.setValue.mock.calls.forEach((call) => {
                fields[call[0].fieldId] = call[0].value;
            });
            expect(fields.contact).toBe(301);
            expect(fields.company).toBeUndefined();
        });

        it('still logs call when contact parent lookup throws', () => {
            const mockPhoneCall = {
                setValue: jest.fn(),
                save: jest.fn().mockReturnValue(12345)
            };
            record.create.mockReturnValue(mockPhoneCall);
            search.lookupFields.mockImplementation(() => {
                throw new Error('lookup boom');
            });

            const result = restlet.post({
                action: 'logCall',
                callSid: 'CA0000000000000000000000lookupfail',
                entityId: '302',
                entityType: 'contact',
                phone: '+15550000002',
                duration: 30
            });

            expect(result).toEqual({ success: true, recordId: 12345 });
            const fields = {};
            mockPhoneCall.setValue.mock.calls.forEach((call) => {
                fields[call[0].fieldId] = call[0].value;
            });
            expect(fields.contact).toBe(302);
            expect(fields.company).toBeUndefined();
            expect(log.error).toHaveBeenCalledWith(
                expect.objectContaining({ title: 'CTC Contact Parent Lookup Failed' })
            );
        });

        it('sets company to entityId for lead entityType', () => {
            const mockPhoneCall = {
                setValue: jest.fn(),
                save: jest.fn().mockReturnValue(12345)
            };
            record.create.mockReturnValue(mockPhoneCall);

            restlet.post({
                action: 'logCall',
                callSid: 'CA000000000000000000000000000lead0',
                entityId: '400',
                entityType: 'lead',
                phone: '+15550001111',
                duration: 45
            });

            const fields = {};
            mockPhoneCall.setValue.mock.calls.forEach((call) => {
                fields[call[0].fieldId] = call[0].value;
            });
            expect(fields.company).toBe(400);
            expect(search.lookupFields).not.toHaveBeenCalled();
        });

        it('still generates token when no action specified', () => {
            const result = restlet.post({});
            expect(result).toHaveProperty('token', 'mock.jwt.token');
        });

        it('returns error when Phone Call creation fails', () => {
            record.create.mockImplementation(() => { throw new Error('Record error'); });

            const result = restlet.post({
                action: 'logCall',
                callSid: 'CA000000000000000000000000000fail0',
                phone: '+15551234567',
                duration: 30
            });

            expect(result).toHaveProperty('error', 'Failed to log call');
            expect(log.error).toHaveBeenCalledWith(
                expect.objectContaining({ title: 'CTC Log Call Failed' })
            );
        });

        it('rejects sub-2s calls with duration_below_threshold and does not create a record', () => {
            const result = restlet.post({
                action: 'logCall',
                callSid: 'CA00000000000000000000000000brief0',
                phone: '+15551234567',
                duration: 1
            });

            expect(result).toEqual({ error: 'duration_below_threshold', duration: 1 });
            expect(record.create).not.toHaveBeenCalled();
        });

        it('writes Logged status on successful logCall', () => {
            const mockPhoneCall = {
                setValue: jest.fn(),
                save: jest.fn().mockReturnValue(12345)
            };
            record.create.mockReturnValue(mockPhoneCall);

            restlet.post({
                action: 'logCall',
                callSid: 'CA00000000000000000000000000status',
                entityId: '100',
                entityType: 'customer',
                phone: '+15551234567',
                duration: 30
            });

            const fields = {};
            mockPhoneCall.setValue.mock.calls.forEach((call) => {
                fields[call[0].fieldId] = call[0].value;
            });
            expect(fields.custevent_ctc_call_status).toBe('Logged');
        });

        it('returns existing recordId without creating duplicate when callSid already logged', () => {
            // First call to search for config, second call for callSid dedupe
            search.create.mockImplementation((opts) => {
                if (opts.type === 'customrecord_ctc_config') {
                    return { run: jest.fn().mockReturnValue(mockSearchRun) };
                }
                return {
                    run: jest.fn().mockReturnValue({
                        getRange: jest.fn().mockReturnValue([{ id: '77777' }])
                    })
                };
            });

            const result = restlet.post({
                action: 'logCall',
                callSid: 'CA000000000000000000000000000dupe0',
                phone: '+15551234567',
                duration: 30
            });

            expect(result).toEqual({ success: true, recordId: '77777', duplicate: true });
            expect(record.create).not.toHaveBeenCalled();
        });

        // ─────────────────────────────────────────────────────────────────
        // CRIT-2 regression — verifyCallOwnership gate
        // (SAFE review 2026-05-21, docs/plans/2026-05-21-002)
        //
        // Pre-fix, any authenticated user could POST arbitrary callSid +
        // entityId combinations to forge Phone Call activity records
        // against any customer/contact/lead. The fix requires the Twilio
        // call's `from` to match a phone assigned to the current user (via
        // rep_assignment) or the install's cfg.phoneNumber fallback.
        // ─────────────────────────────────────────────────────────────────
        const twilioAdmin = require('SuiteScripts/lib/ctc_twilio_admin');

        it('CRIT-2: rejects logCall when Twilio returns 404 (callSid does not exist)', () => {
            twilioAdmin.getCall.mockReturnValueOnce({
                ok: false, status: 404, errorCode: 'HTTP_404', errorMessage: 'Not Found'
            });

            const result = restlet.post({
                action: 'logCall',
                callSid: 'CA00000000000000000000000forge0001',
                entityId: '500',
                entityType: 'customer',
                phone: '+15551234567',
                duration: 30
            });

            expect(result).toEqual({ error: 'forbidden', code: 'CALL_NOT_FOUND' });
            expect(record.create).not.toHaveBeenCalled();
        });

        it('CRIT-2: rejects logCall when call.from does not match any caller-ID assigned to user', () => {
            // Twilio confirms the call exists, but it was placed from a
            // phone number NOT assigned to this user — classic forgery
            // attempt (user trying to log someone else's call).
            twilioAdmin.getCall.mockReturnValueOnce({
                ok: true, status: 200,
                call: { sid: 'CA...', from: '+19998887777', to: '+15559876543' }
            });

            const result = restlet.post({
                action: 'logCall',
                callSid: 'CA00000000000000000000000spoof0001',
                entityId: '500',
                entityType: 'customer',
                phone: '+15559876543',
                duration: 30
            });

            expect(result.error).toBe('forbidden');
            expect(result.code).toBe('NOT_CALL_OWNER');
            expect(record.create).not.toHaveBeenCalled();
        });

        it('CRIT-2: rejects logCall when callSid format is invalid', () => {
            const result = restlet.post({
                action: 'logCall',
                callSid: 'definitely-not-a-twilio-sid',
                entityId: '500',
                entityType: 'customer',
                phone: '+15559876543',
                duration: 30
            });

            expect(result).toEqual({ error: 'forbidden', code: 'INVALID_CALLSID_FORMAT' });
            expect(twilioAdmin.getCall).not.toHaveBeenCalled();
            expect(record.create).not.toHaveBeenCalled();
        });

        it('CRIT-2: allows logCall when call.from is the WebRTC client identity (client:<userId>)', () => {
            // Outbound WebRTC calls without TwiML callerId have
            // call.from = "client:<jwt-identity>". Since CRIT-1 binds
            // the JWT identity to the session user, accepting this
            // is equivalent to "session user placed this call."
            twilioAdmin.getCall.mockReturnValueOnce({
                ok: true, status: 200,
                call: { sid: 'CA...', from: 'client:42', to: '+15559876543' }
            });
            const mockPhoneCall = {
                setValue: jest.fn(),
                save: jest.fn().mockReturnValue(88888)
            };
            record.create.mockReturnValue(mockPhoneCall);

            const result = restlet.post({
                action: 'logCall',
                callSid: 'CA00000000000000000000000webrtc001',
                entityId: '500',
                entityType: 'customer',
                phone: '+15559876543',
                duration: 30
            });

            expect(result).toEqual({ success: true, recordId: 88888 });
        });

        it('CRIT-2: rejects when client:<userId> identity does NOT match current user', () => {
            // A call placed by client:99 by some other rep cannot be
            // logged by user 42 — even if 42 has all the same
            // caller-IDs assigned. Closes the cross-rep-impersonation
            // path that pre-CRIT-1 would have opened.
            twilioAdmin.getCall.mockReturnValueOnce({
                ok: true, status: 200,
                call: { sid: 'CA...', from: 'client:99', to: '+15559876543' }
            });

            const result = restlet.post({
                action: 'logCall',
                callSid: 'CA00000000000000000000000cross0099',
                entityId: '500',
                entityType: 'customer',
                phone: '+15559876543',
                duration: 30
            });

            expect(result.error).toBe('forbidden');
            expect(result.code).toBe('NOT_CALL_OWNER');
        });

        it('CRIT-2: allows logCall when call.from matches the install cfg.phoneNumber fallback', () => {
            // Common pre-rep-assignment state: no rows in rep_assignment;
            // verifyCallOwnership falls back to cfg.phoneNumber. Mock
            // search.create.run.each does nothing (no rows). Default
            // twilioAdmin.getCall already returns from=+15551234567 which
            // matches the mockConfigResult phoneNumber.
            const mockPhoneCall = {
                setValue: jest.fn(),
                save: jest.fn().mockReturnValue(99999)
            };
            record.create.mockReturnValue(mockPhoneCall);

            const result = restlet.post({
                action: 'logCall',
                callSid: 'CA00000000000000000000000legit0001',
                entityId: '500',
                entityType: 'customer',
                phone: '+15559876543',
                duration: 30
            });

            expect(result).toEqual({ success: true, recordId: 99999 });
        });

        // ─────────────────────────────────────────────────────────────────
        // HIGH-7 regression — body.phone E.164 validation
        // (SAFE review 2026-05-21, docs/plans/2026-05-21-002)
        //
        // Pre-fix, body.phone was written verbatim to Phone Call's title
        // and phone fields with no length cap or character whitelist.
        // Validation enforces /^\+?[0-9]{7,15}$/ before any record write,
        // fail-fast before the verifyCallOwnership gate.
        // ─────────────────────────────────────────────────────────────────

        it('HIGH-7: rejects logCall when body.phone is missing', () => {
            const result = restlet.post({
                action: 'logCall',
                callSid: 'CA00000000000000000000000legit0001',
                entityId: '500',
                entityType: 'customer',
                duration: 30
                // no phone
            });
            expect(result).toEqual({ error: 'invalid_phone' });
            expect(record.create).not.toHaveBeenCalled();
        });

        it('HIGH-7: rejects logCall when body.phone contains non-digits', () => {
            const result = restlet.post({
                action: 'logCall',
                callSid: 'CA00000000000000000000000legit0001',
                entityId: '500',
                entityType: 'customer',
                phone: '+1555<script>alert(1)</script>',
                duration: 30
            });
            expect(result).toEqual({ error: 'invalid_phone' });
            expect(record.create).not.toHaveBeenCalled();
        });

        it('HIGH-7: rejects logCall when body.phone is too short (< 7 digits)', () => {
            const result = restlet.post({
                action: 'logCall',
                callSid: 'CA00000000000000000000000legit0001',
                entityId: '500',
                entityType: 'customer',
                phone: '+15',
                duration: 30
            });
            expect(result).toEqual({ error: 'invalid_phone' });
            expect(record.create).not.toHaveBeenCalled();
        });

        it('HIGH-7: rejects logCall when body.phone is too long (> 15 digits)', () => {
            const result = restlet.post({
                action: 'logCall',
                callSid: 'CA00000000000000000000000legit0001',
                entityId: '500',
                entityType: 'customer',
                phone: '+12345678901234567890', // 20 digits, exceeds E.164 cap
                duration: 30
            });
            expect(result).toEqual({ error: 'invalid_phone' });
            expect(record.create).not.toHaveBeenCalled();
        });

        it('HIGH-7: phone validation fires BEFORE verifyCallOwnership (fail-fast)', () => {
            // Garbage phone + missing/forged callSid — phone check should
            // reject FIRST so Twilio's getCall is never hit.
            const twilioAdminMock = require('SuiteScripts/lib/ctc_twilio_admin');
            twilioAdminMock.getCall.mockClear();

            const result = restlet.post({
                action: 'logCall',
                callSid: 'CA00000000000000000000fakeforged00',
                entityId: '500',
                entityType: 'customer',
                phone: 'not a phone',
                duration: 30
            });

            expect(result).toEqual({ error: 'invalid_phone' });
            expect(twilioAdminMock.getCall).not.toHaveBeenCalled();
        });
    });

    describe('checkTranscript action', () => {
        // Shared callSid fixture for all checkTranscript happy-path tests.
        // CRIT-3 gate (SAFE review 2026-05-21) requires this to be a
        // realistic 34-char Twilio CallSid AND to match the value the
        // mocked Phone Call record returns from custevent_ctc_call_sid.
        const MOCK_CHECK_CALLSID = 'CA000000000000000000000000000valid';

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
            brief: 'Demo went well, sending pricing Tuesday',
            summary: 'Good call about product.',
            satisfaction_score: 8,
            tone_keywords: ['positive', 'engaged'],
            action_items: ['Follow up next week']
        };

        let mockPhoneCall;

        beforeEach(() => {
            mockPhoneCall = {
                setValue: jest.fn(),
                save: jest.fn().mockReturnValue(55555),
                // CRIT-3 gate: checkTranscript loads the Phone Call first
                // and verifies its custevent_ctc_call_sid matches body.callSid
                // before any Twilio work runs. Default returns the matching
                // fixture; per-test overrides simulate the mismatch case.
                getValue: jest.fn().mockImplementation((arg) => {
                    const field = (arg && arg.fieldId) || arg;
                    if (field === 'custevent_ctc_call_sid') return MOCK_CHECK_CALLSID;
                    return '';
                })
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
                callSid: MOCK_CHECK_CALLSID,
                recordId: '100'
            });

            expect(result).toEqual({ status: 'no_recording' });
        });

        it('returns pending when transcript not ready', () => {
            utils.fetchTranscript.mockReturnValue(null);

            const result = restlet.post({
                action: 'checkTranscript',
                callSid: MOCK_CHECK_CALLSID,
                recordId: '100'
            });

            expect(result).toEqual({ status: 'pending' });
        });

        it('returns completed and enriches Phone Call record', () => {
            const result = restlet.post({
                action: 'checkTranscript',
                callSid: MOCK_CHECK_CALLSID,
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
                callSid: MOCK_CHECK_CALLSID,
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
                callSid: MOCK_CHECK_CALLSID,
                recordId: '100'
            });

            expect(result).toEqual({ status: 'completed' });
            expect(utils.analyzeTranscript).not.toHaveBeenCalled();
            // Should still enrich with transcript
            expect(mockPhoneCall.setValue).toHaveBeenCalledWith(
                expect.objectContaining({ fieldId: 'custevent_ctc_transcript', value: '[REP] Hello' })
            );
        });

        it('returns forbidden+CONFIG_MISSING when config is unavailable (CRIT-3 gate fires first)', () => {
            // Post-CRIT-3, the verifyCallOwnership gate runs BEFORE the main
            // try-block's loadConfig + buildSecureAuthHeader pair. With no
            // config record present, the gate's own loadConfig returns
            // empty and rejects with CONFIG_MISSING — a more informative
            // envelope than the original generic "Transcript check failed."
            mockSearchRun.getRange.mockReturnValue([]);

            const result = restlet.post({
                action: 'checkTranscript',
                callSid: MOCK_CHECK_CALLSID,
                recordId: '100'
            });

            expect(result.error).toBe('forbidden');
            // loadConfig throws when no config record present; the gate
            // catches it as CONFIG_LOAD_FAILED. (If loadConfig is later
            // changed to return null/empty instead of throwing, the gate
            // would surface CONFIG_MISSING — either is acceptable as a
            // "config record missing" signal to the client.)
            expect(['CONFIG_LOAD_FAILED', 'CONFIG_MISSING']).toContain(result.code);
        });

        it('passes a SecureString auth header (built from API Key Secret pointer) to fetchRecordingForCall', () => {
            // Phase 2 U10: Auth Token removed; auth uses SecureString via
            // lib/ctc_twilio_admin.js:buildSecureAuthHeader which references
            // the apiSecretId script ID pointer via N/https.createSecureString.
            // The cleartext secret never enters script scope.
            restlet.post({
                action: 'checkTranscript',
                callSid: MOCK_CHECK_CALLSID,
                recordId: '100'
            });

            // fetchRecordingForCall was called with the account SID + a header
            // that is a SecureString instance (not a plain Basic string).
            expect(utils.fetchRecordingForCall).toHaveBeenCalledWith(
                'AC_test_account',
                MOCK_CHECK_CALLSID,
                expect.anything() // SecureString opaque handle
            );
        });

        it('marks status No transcript and returns terminal when Recording is absent', () => {
            utils.isRecordingTerminal.mockReturnValue(true);
            utils.fetchRecordingForCall.mockReturnValue({ sid: 'RE_abs', status: 'absent' });

            const result = restlet.post({
                action: 'checkTranscript',
                callSid: MOCK_CHECK_CALLSID,
                recordId: '101'
            });

            expect(result).toEqual({ status: 'terminal', reason: 'recording_absent' });
            expect(record.submitFields).toHaveBeenCalledWith(expect.objectContaining({
                id: '101',
                values: expect.objectContaining({
                    custevent_ctc_call_status: 'No transcript',
                    custevent_ctc_processed: true
                })
            }));
            expect(utils.fetchTranscript).not.toHaveBeenCalled();
        });

        it('marks status No transcript when Transcript is in terminal failure state', () => {
            utils.isTranscriptTerminal.mockReturnValue(true);
            utils.fetchTranscript.mockReturnValue({ sid: 'GT_x', status: 'failed' });

            const result = restlet.post({
                action: 'checkTranscript',
                callSid: MOCK_CHECK_CALLSID,
                recordId: '102'
            });

            expect(result).toEqual({ status: 'terminal', reason: 'transcript_failed' });
            expect(record.submitFields).toHaveBeenCalledWith(expect.objectContaining({
                id: '102',
                values: expect.objectContaining({ custevent_ctc_call_status: 'No transcript' })
            }));
        });

        it('marks status Processing and returns pending when transcript not ready', () => {
            utils.fetchTranscript.mockReturnValue(null);

            const result = restlet.post({
                action: 'checkTranscript',
                callSid: MOCK_CHECK_CALLSID,
                recordId: '103'
            });

            expect(result).toEqual({ status: 'pending' });
            expect(record.submitFields).toHaveBeenCalledWith(expect.objectContaining({
                id: '103',
                values: expect.objectContaining({
                    custevent_ctc_call_status: 'Processing',
                    custevent_ctc_processed: false
                })
            }));
        });

        it('writes Transcribed status on successful enrichment', () => {
            restlet.post({
                action: 'checkTranscript',
                callSid: MOCK_CHECK_CALLSID,
                recordId: '100'
            });

            const fields = {};
            mockPhoneCall.setValue.mock.calls.forEach((call) => {
                fields[call[0].fieldId] = call[0].value;
            });
            expect(fields.custevent_ctc_call_status).toBe('Transcribed');
        });

        it('writes the AI Brief field on successful enrichment for line-level sublist view', () => {
            restlet.post({
                action: 'checkTranscript',
                callSid: MOCK_CHECK_CALLSID,
                recordId: '100'
            });

            const fields = {};
            mockPhoneCall.setValue.mock.calls.forEach((call) => {
                fields[call[0].fieldId] = call[0].value;
            });
            expect(fields.custevent_ctc_ai_brief).toBe(MOCK_ANALYSIS.brief);
        });

        it('falls back to summary (trimmed to 120) when LLM omits brief', () => {
            const noBrief = { ...MOCK_ANALYSIS };
            delete noBrief.brief;
            utils.analyzeTranscript.mockReturnValue(noBrief);

            restlet.post({
                action: 'checkTranscript',
                callSid: MOCK_CHECK_CALLSID,
                recordId: '100'
            });

            const fields = {};
            mockPhoneCall.setValue.mock.calls.forEach((call) => {
                fields[call[0].fieldId] = call[0].value;
            });
            expect(fields.custevent_ctc_ai_brief).toBe(MOCK_ANALYSIS.summary);
        });

        // ─────────────────────────────────────────────────────────────
        // CRIT-3 regression — checkTranscript gates
        // (SAFE review 2026-05-21, docs/plans/2026-05-21-002)
        //
        // Pre-fix, any authenticated user could POST {callSid, recordId}
        // and trigger: (a) transcript theft (pull rep B's transcript onto
        // own record), (b) record corruption (overwrite another rep's
        // transcript), (c) Twilio recording deletion for arbitrary callSids.
        // Two gates close these: callSid/recordId binding + verifyCallOwnership.
        // ─────────────────────────────────────────────────────────────
        const twilioAdminFor3 = require('SuiteScripts/lib/ctc_twilio_admin');

        it('CRIT-3: rejects checkTranscript when recordId is missing', () => {
            const result = restlet.post({
                action: 'checkTranscript',
                callSid: MOCK_CHECK_CALLSID
                // no recordId
            });

            expect(result).toEqual({ error: 'forbidden', code: 'RECORD_ID_REQUIRED' });
            expect(record.load).not.toHaveBeenCalled();
            expect(utils.fetchRecordingForCall).not.toHaveBeenCalled();
        });

        it('CRIT-3: rejects checkTranscript on callSid/recordId mismatch', () => {
            // The Phone Call record is bound to a different callSid than
            // the one in the request — classic record-corruption attempt
            // (rep tries to write some OTHER call's transcript over this
            // record's data).
            mockPhoneCall.getValue = jest.fn().mockReturnValue('CA9999999999999999999999999othersi');

            const result = restlet.post({
                action: 'checkTranscript',
                callSid: MOCK_CHECK_CALLSID,
                recordId: '12345'
            });

            expect(result).toEqual({ error: 'forbidden', code: 'CALLSID_MISMATCH' });
            expect(utils.fetchRecordingForCall).not.toHaveBeenCalled();
        });

        it('CRIT-3: rejects checkTranscript when Phone Call recordId does not exist', () => {
            record.load = jest.fn().mockImplementation(() => {
                throw new Error('That record does not exist.');
            });

            const result = restlet.post({
                action: 'checkTranscript',
                callSid: MOCK_CHECK_CALLSID,
                recordId: '99999999'
            });

            expect(result).toEqual({ error: 'forbidden', code: 'RECORD_NOT_FOUND' });
            expect(utils.fetchRecordingForCall).not.toHaveBeenCalled();
        });

        it('CRIT-3: rejects checkTranscript when Twilio call.from does not match caller-ID', () => {
            // Binding passes (recordCallSid === bodyCallSid), but Twilio
            // says the call was placed from a phone NOT assigned to this
            // user. Closes the transcript-exfiltration vector.
            twilioAdminFor3.getCall.mockReturnValueOnce({
                ok: true, status: 200,
                call: { sid: MOCK_CHECK_CALLSID, from: '+19998887777', to: '+15551234567' }
            });

            const result = restlet.post({
                action: 'checkTranscript',
                callSid: MOCK_CHECK_CALLSID,
                recordId: '12345'
            });

            expect(result.error).toBe('forbidden');
            expect(result.code).toBe('NOT_CALL_OWNER');
            expect(utils.fetchRecordingForCall).not.toHaveBeenCalled();
            expect(utils.deleteRecording).not.toHaveBeenCalled();
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 2 actions
    // ─────────────────────────────────────────────────────────────────────────

    describe('searchEntities action', () => {
        const makeSearchResult = (id, fields) => ({
            id: id,
            getValue: jest.fn((col) => fields[col] || '')
        });

        beforeEach(() => {
            search.Type = { ...(search.Type || {}), CONTACT: 'contact', LEAD: 'lead', PHONE_CALL: 'phonecall' };
            // Default: every search returns empty
            search.create.mockImplementation(() => ({
                run: jest.fn().mockReturnValue({ getRange: jest.fn().mockReturnValue([]) })
            }));
        });

        it('returns empty results for q shorter than 2 chars', () => {
            const result = restlet.post({ action: 'searchEntities', q: 'a' });
            expect(result).toEqual({ results: [] });
        });

        it('queries customer, prospect, contact, and lead types', () => {
            const types = [];
            search.create.mockImplementation((opts) => {
                types.push(opts.type);
                return { run: () => ({ getRange: () => [] }) };
            });

            restlet.post({ action: 'searchEntities', q: 'acme' });

            expect(types).toEqual(expect.arrayContaining(['customer', 'prospect', 'contact', 'lead']));
        });

        it('returns deduped results with phone numbers only (filters out unreachable entries)', () => {
            search.create.mockImplementation((opts) => {
                if (opts.type === 'customer') {
                    return {
                        run: () => ({ getRange: () => [
                            makeSearchResult('100', { companyname: 'Acme Corp', entityid: 'C-100', phone: '(555) 111-2222' }),
                            makeSearchResult('101', { companyname: 'Acme No Phone', entityid: 'C-101', phone: '' })
                        ]})
                    };
                }
                return { run: () => ({ getRange: () => [] }) };
            });

            const result = restlet.post({ action: 'searchEntities', q: 'acme' });
            expect(result.results).toHaveLength(1);
            expect(result.results[0]).toEqual({ id: '100', name: 'Acme Corp', type: 'customer', phone: '(555) 111-2222' });
        });

        it('joins contact firstname+lastname for the name field', () => {
            search.create.mockImplementation((opts) => {
                if (opts.type === 'contact') {
                    return {
                        run: () => ({ getRange: () => [
                            makeSearchResult('200', { firstname: 'Maria', lastname: 'Rogers', phone: '(555) 333-4444', entityid: '' })
                        ]})
                    };
                }
                return { run: () => ({ getRange: () => [] }) };
            });

            const result = restlet.post({ action: 'searchEntities', q: 'maria' });
            const contactRow = result.results.find(r => r.type === 'contact');
            expect(contactRow.name).toBe('Maria Rogers');
        });

        it('falls back to entityid when companyname missing', () => {
            search.create.mockImplementation((opts) => {
                if (opts.type === 'lead') {
                    return {
                        run: () => ({ getRange: () => [
                            makeSearchResult('300', { companyname: '', entityid: 'L-300', phone: '(555) 555-6666' })
                        ]})
                    };
                }
                return { run: () => ({ getRange: () => [] }) };
            });

            const result = restlet.post({ action: 'searchEntities', q: 'L-' });
            const leadRow = result.results.find(r => r.type === 'lead');
            expect(leadRow.name).toBe('L-300');
        });

        it('returns error envelope when an unexpected exception fires', () => {
            search.create.mockImplementation(() => { throw new Error('boom'); });

            const result = restlet.post({ action: 'searchEntities', q: 'acme' });
            // Per-type try/catch swallows individual failures; aggregator returns empty results, not error
            expect(result).toEqual({ results: [] });
        });
    });

    describe('getWorkspaceHistory action', () => {
        beforeEach(() => {
            search.Type = { ...(search.Type || {}), PHONE_CALL: 'phonecall', CUSTOMER: 'customer' };
            search.Sort = { DESC: 'DESC', ASC: 'ASC' };
        });

        it('filters to current user assigned + non-empty call_sid', () => {
            let capturedFilters;
            search.create.mockImplementation((opts) => {
                capturedFilters = opts.filters;
                return { run: () => ({ getRange: () => [] }) };
            });

            restlet.post({ action: 'getWorkspaceHistory' });

            // Scope by the book customer-id set (primary OR Sales Team via
            // the SuiteQL pre-query). Old narrow company.salesrep filter is
            // gone — calls to Burt-as-secondary entities (Abbott) now flow
            // through. Not phonecall.assigned either.
            expect(capturedFilters).toEqual(expect.arrayContaining([
                ['company', 'anyof', ['500', '501']]
            ]));
            expect(JSON.stringify(capturedFilters)).not.toContain('"company.salesrep"');
            expect(capturedFilters).toEqual(expect.arrayContaining([
                ['custevent_ctc_call_sid', 'isnotempty', '']
            ]));
        });

        it('applies todayOnly filter when requested', () => {
            let capturedFilters;
            search.create.mockImplementation((opts) => {
                capturedFilters = opts.filters;
                return { run: () => ({ getRange: () => [] }) };
            });

            restlet.post({ action: 'getWorkspaceHistory', todayOnly: true });

            expect(capturedFilters).toEqual(expect.arrayContaining([
                ['startdate', 'on', 'today']
            ]));
        });

        it('maps result rows to the expected shape', () => {
            search.create.mockImplementation(() => ({
                run: () => ({ getRange: () => [{
                    id: '500',
                    getValue: jest.fn((arg) => {
                        const col = typeof arg === 'string' ? arg : arg.name;
                        const vals = {
                            startdate: '2026-05-13',
                            company: [{ value: '224', text: 'Abbott Inc.' }],
                            phone: '(281) 797-0761',
                            custevent_ctc_ai_brief: 'Quote requested for ~100 cables',
                            custevent_ctc_satisfaction: '7',
                            custevent_ctc_duration: '106',
                            custevent_ctc_call_status: 'Transcribed'
                        };
                        return vals[col] !== undefined ? vals[col] : '';
                    }),
                    getText: jest.fn((arg) => {
                        const col = typeof arg === 'string' ? arg : arg.name;
                        return col === 'company' ? 'Abbott Inc.' : '';
                    })
                }] })
            }));

            const result = restlet.post({ action: 'getWorkspaceHistory' });
            expect(result.rows).toHaveLength(1);
            expect(result.rows[0]).toEqual(expect.objectContaining({
                id: '500',
                companyName: 'Abbott Inc.',
                phone: '(281) 797-0761',
                brief: 'Quote requested for ~100 cables',
                satisfaction: 7,
                duration: 106,
                callStatus: 'Transcribed'
            }));
        });

        it('returns error envelope on exception', () => {
            search.create.mockImplementation(() => { throw new Error('search broke'); });

            const result = restlet.post({ action: 'getWorkspaceHistory' });
            expect(result.error).toBeDefined();
        });
    });

    describe('getWorkspaceTasks action', () => {
        beforeEach(() => {
            search.Sort = { DESC: 'DESC', ASC: 'ASC' };
            search.createColumn = jest.fn((opts) => opts);
        });

        it('groups results by source phone call', () => {
            search.create.mockImplementation(() => ({
                run: () => ({ getRange: () => [
                    {
                        id: '1001',
                        getValue: jest.fn((arg) => {
                            const col = typeof arg === 'string' ? arg : (arg.name + (arg.join ? '@' + arg.join : ''));
                            const vals = {
                                'custrecord_ctc_pt_phone_call': [{ value: '500', text: 'Call 500' }],
                                'custrecord_ctc_pt_text': 'Send brochure',
                                'custrecord_ctc_pt_status': [{ value: '1', text: 'Pending' }],
                                'custrecord_ctc_pt_proposed_due': '2026-05-16',
                                'custrecord_ctc_pt_proposed_assignee': [{ value: '42', text: 'Kathryn Glass' }],
                                'custrecord_ctc_pt_task_completed': false,
                                'custrecord_ctc_pt_created_task': '',
                                'company@custrecord_ctc_pt_phone_call': [{ value: '224', text: 'Abbott Inc.' }],
                                'custevent_ctc_ai_brief@custrecord_ctc_pt_phone_call': 'Quote requested',
                                'custevent_ctc_satisfaction@custrecord_ctc_pt_phone_call': '7',
                                'startdate@custrecord_ctc_pt_phone_call': '2026-05-13'
                            };
                            return vals[col] !== undefined ? vals[col] : '';
                        })
                    },
                    {
                        id: '1002',
                        getValue: jest.fn((arg) => {
                            const col = typeof arg === 'string' ? arg : (arg.name + (arg.join ? '@' + arg.join : ''));
                            const vals = {
                                'custrecord_ctc_pt_phone_call': [{ value: '500', text: 'Call 500' }],
                                'custrecord_ctc_pt_text': 'Schedule follow-up',
                                'custrecord_ctc_pt_status': [{ value: '1', text: 'Pending' }],
                                'custrecord_ctc_pt_proposed_due': '2026-05-16',
                                'custrecord_ctc_pt_proposed_assignee': [{ value: '42', text: 'Kathryn Glass' }],
                                'custrecord_ctc_pt_task_completed': false,
                                'custrecord_ctc_pt_created_task': '',
                                'company@custrecord_ctc_pt_phone_call': [{ value: '224', text: 'Abbott Inc.' }],
                                'custevent_ctc_ai_brief@custrecord_ctc_pt_phone_call': 'Quote requested',
                                'custevent_ctc_satisfaction@custrecord_ctc_pt_phone_call': '7',
                                'startdate@custrecord_ctc_pt_phone_call': '2026-05-13'
                            };
                            return vals[col] !== undefined ? vals[col] : '';
                        })
                    }
                ] })
            }));

            const result = restlet.post({ action: 'getWorkspaceTasks', tab: 'pending' });
            expect(result.groups).toHaveLength(1);
            expect(result.groups[0].tasks).toHaveLength(2);
            expect(result.groups[0].call.companyName).toBe('Abbott Inc.');
            expect(result.totalTasks).toBe(2);
        });

        it('scopes to a specific phone call when phoneCallId provided', () => {
            let capturedFilters;
            search.create.mockImplementation((opts) => {
                capturedFilters = opts.filters;
                return { run: () => ({ getRange: () => [] }) };
            });

            restlet.post({ action: 'getWorkspaceTasks', tab: 'pending', phoneCallId: '500' });

            const flat = JSON.stringify(capturedFilters);
            expect(flat).toContain('"custrecord_ctc_pt_phone_call"');
            expect(flat).toContain('"500"');
            // Without phoneCallId, would scope to user's calls via dotted join
            expect(flat).not.toContain('custrecord_ctc_pt_phone_call.assigned');
        });

        it('applies "awaiting" tab filter (Approved AND task_completed=F)', () => {
            // Two-step query: first call is the phonecall lookup, second is the proposed_task search
            const captured = [];
            search.create.mockImplementation((opts) => {
                captured.push(opts);
                if (opts.type === 'phonecall') {
                    return { run: () => ({ getRange: () => [{ id: '500' }] }) };
                }
                return { run: () => ({ getRange: () => [] }) };
            });
            search.Type.PHONE_CALL = 'phonecall';

            restlet.post({ action: 'getWorkspaceTasks', tab: 'awaiting' });

            // Assert on the proposed_task search filters (second call)
            const flat = JSON.stringify(captured[1].filters);
            expect(flat).toContain('Approved');
            expect(flat).toContain('custrecord_ctc_pt_task_completed');
        });

        it('returns empty groups gracefully when underlying search throws', () => {
            // With the two-step pattern, an upstream failure short-circuits to empty results
            // (not an error envelope) — the user sees "All caught up" rather than an error.
            search.create.mockImplementation(() => { throw new Error('search broke'); });
            search.Type.PHONE_CALL = 'phonecall';

            const result = restlet.post({ action: 'getWorkspaceTasks', tab: 'pending' });
            expect(result.groups).toEqual([]);
            expect(result.totalTasks).toBe(0);
        });
    });

    describe('approveProposedTask action', () => {
        let mockProposedTask;
        let mockTask;

        beforeEach(() => {
            search.Type = { ...(search.Type || {}), PHONE_CALL: 'phonecall', CUSTOMER: 'customer' };
            record.Type = { ...(record.Type || {}), PHONE_CALL: 'phonecall', TASK: 'task' };

            mockProposedTask = {
                getValue: jest.fn((arg) => {
                    const fieldId = typeof arg === 'string' ? arg : arg.fieldId;
                    const vals = {
                        custrecord_ctc_pt_text: 'Send the quote',
                        custrecord_ctc_pt_proposed_due: new Date('2026-05-16'),
                        custrecord_ctc_pt_proposed_assignee: '42',
                        custrecord_ctc_pt_phone_call: '500'
                    };
                    return vals[fieldId];
                }),
                getText: jest.fn((arg) => {
                    const fieldId = typeof arg === 'string' ? arg : arg.fieldId;
                    if (fieldId === 'custrecord_ctc_pt_status') return 'Pending';
                    return '';
                }),
                setValue: jest.fn().mockReturnThis(),
                setText: jest.fn().mockReturnThis(),
                save: jest.fn().mockReturnValue('1001')
            };
            mockTask = {
                setValue: jest.fn().mockReturnThis(),
                save: jest.fn().mockReturnValue('TASK_5001')
            };

            record.load = jest.fn().mockReturnValue(mockProposedTask);
            record.create = jest.fn().mockImplementation((opts) => {
                if (opts.type === 'task') return mockTask;
                return { setValue: jest.fn().mockReturnThis(), save: jest.fn() };
            });

            // Default: auth check resolves to current user (42).
            // Two-hop auth: phone_call → company, then customer → salesrep.
            // Plus a third lookup for entity links (company + contact) on Task creation.
            search.lookupFields = jest.fn().mockImplementation((opts) => {
                if (opts.type === 'customer' && opts.columns && opts.columns.indexOf('salesrep') !== -1) {
                    return { salesrep: [{ value: '42', text: 'Test User' }] };
                }
                // Auth lookup specifically asks for ['company'] only — entity-link lookup asks for both
                if (opts.type === 'phonecall' && opts.columns && opts.columns.length === 1 && opts.columns[0] === 'company') {
                    return { company: [{ value: '224', text: 'Abbott Inc.' }] };
                }
                // Approve's second phonecall lookup for Task entity fields (['company', 'contact'])
                return {
                    company: [{ value: '224', text: 'Abbott Inc.' }],
                    contact: [{ value: '729', text: 'Maria Rogers' }]
                };
            });
        });

        it('returns error when taskId missing', () => {
            const result = restlet.post({ action: 'approveProposedTask' });
            expect(result.error).toBe('taskId required');
        });

        it('creates a native Task with AI: prefix and source call entity links', () => {
            const result = restlet.post({ action: 'approveProposedTask', taskId: '1001' });

            expect(result.ok).toBe(true);
            expect(result.nativeTaskId).toBe('TASK_5001');

            const taskFields = {};
            mockTask.setValue.mock.calls.forEach((c) => { taskFields[c[0].fieldId] = c[0].value; });
            expect(taskFields.title).toBe('AI: Send the quote');
            expect(taskFields.message).toBe('Send the quote');
            expect(taskFields.company).toBe('224');
            expect(taskFields.contact).toBe('729');
            expect(taskFields.assigned).toBe('42');
        });

        it('marks proposed_task as Approved with reviewer + reviewed_date + created_task link', () => {
            restlet.post({ action: 'approveProposedTask', taskId: '1001' });

            expect(mockProposedTask.setText).toHaveBeenCalledWith({
                fieldId: 'custrecord_ctc_pt_status',
                text: 'Approved'
            });

            const ptFields = {};
            mockProposedTask.setValue.mock.calls.forEach((c) => { ptFields[c[0].fieldId] = c[0].value; });
            expect(ptFields.custrecord_ctc_pt_created_task).toBe('TASK_5001');
            expect(ptFields.custrecord_ctc_pt_reviewer).toBe(42);
            expect(ptFields.custrecord_ctc_pt_reviewed_date).toBeInstanceOf(Date);
        });

        it('applies edits when provided', () => {
            restlet.post({
                action: 'approveProposedTask',
                taskId: '1001',
                edits: { text: 'Edited text', due: '2026-05-20', assignee: '99' }
            });

            const taskFields = {};
            mockTask.setValue.mock.calls.forEach((c) => { taskFields[c[0].fieldId] = c[0].value; });
            expect(taskFields.title).toBe('AI: Edited text');
            expect(taskFields.message).toBe('Edited text');
            expect(taskFields.assigned).toBe('99');
        });

        it('truncates title to 80 chars after AI: prefix', () => {
            const longText = 'A'.repeat(200);
            mockProposedTask.getValue.mockImplementation((arg) => {
                const fieldId = typeof arg === 'string' ? arg : arg.fieldId;
                if (fieldId === 'custrecord_ctc_pt_text') return longText;
                if (fieldId === 'custrecord_ctc_pt_phone_call') return '500';  // owner check needs this
                return '';
            });

            restlet.post({ action: 'approveProposedTask', taskId: '1001' });

            const taskFields = {};
            mockTask.setValue.mock.calls.forEach((c) => { taskFields[c[0].fieldId] = c[0].value; });
            // Title = 'AI: ' + first 80 chars of text
            expect(taskFields.title.length).toBe(84);
            expect(taskFields.title.startsWith('AI: ')).toBe(true);
        });

        it('returns generic error envelope on exception (does NOT leak internal message)', () => {
            record.load = jest.fn().mockImplementation(() => { throw new Error('Internal record field XYZ failed'); });

            const result = restlet.post({ action: 'approveProposedTask', taskId: '1001' });
            // Generic message — actual exception lives in log only
            expect(result.error).toBe('Approval failed');
            expect(result.error).not.toContain('XYZ');
        });

        // ── Authorization & idempotency (added per security/correctness review) ──

        it('REJECTS approval when current user is not the customer salesrep (IDOR guard)', () => {
            search.lookupFields = jest.fn().mockImplementation((opts) => {
                if (opts.type === 'customer' && opts.columns && opts.columns.indexOf('salesrep') !== -1) {
                    return { salesrep: [{ value: '999', text: 'Different Rep' }] };  // not user 42
                }
                if (opts.type === 'phonecall' && opts.columns && opts.columns.indexOf('company') !== -1) {
                    return { company: [{ value: '224', text: 'Some Co' }] };
                }
                return { company: [], contact: [] };
            });

            const result = restlet.post({ action: 'approveProposedTask', taskId: '1001' });
            expect(result.error).toBe('forbidden');
            // No Task created
            expect(mockTask.save).not.toHaveBeenCalled();
        });

        it('ALLOWS approval when current user is the source call assignee', () => {
            // beforeEach sets assigned=42, current user=42 — happy path
            const result = restlet.post({ action: 'approveProposedTask', taskId: '1001' });
            expect(result.ok).toBe(true);
        });

        it('ALLOWS approval when current user has Administrator role (role id 3)', () => {
            runtime.getCurrentUser = jest.fn().mockReturnValue({ id: 99, role: '3' });
            // Admin role short-circuits the salesrep check, so the lookup mocks don't matter
            search.lookupFields = jest.fn().mockReturnValue({ company: [], contact: [] });

            const result = restlet.post({ action: 'approveProposedTask', taskId: '1001' });
            expect(result.ok).toBe(true);  // admin override
        });

        it('REJECTS re-approval (idempotency: status must be Pending)', () => {
            mockProposedTask.getText = jest.fn(() => 'Approved');

            const result = restlet.post({ action: 'approveProposedTask', taskId: '1001' });
            expect(result.error).toBe('already_actioned');
            expect(result.currentStatus).toBe('Approved');
            // No Task created
            expect(mockTask.save).not.toHaveBeenCalled();
        });

        it('SHORT-CIRCUITS to idempotent success when created_task is already populated', () => {
            // Simulates the bug we hit: status stayed Pending because pt.save() failed,
            // but the in-memory created_task field was set. On retry the belt-and-suspenders
            // guard should return the existing Task instead of creating a new one.
            mockProposedTask.getValue = jest.fn((arg) => {
                const fieldId = typeof arg === 'string' ? arg : arg.fieldId;
                if (fieldId === 'custrecord_ctc_pt_created_task') return '5135';
                if (fieldId === 'custrecord_ctc_pt_phone_call') return '500';
                if (fieldId === 'custrecord_ctc_pt_text') return 'Send the quote';
                return '';
            });

            const result = restlet.post({ action: 'approveProposedTask', taskId: '1001' });

            expect(result.ok).toBe(true);
            expect(result.nativeTaskId).toBe('5135');
            expect(result.idempotent).toBe(true);
            // No new Task created
            expect(mockTask.save).not.toHaveBeenCalled();
        });

        it('rejects empty/whitespace edits.text (falls back to original)', () => {
            restlet.post({
                action: 'approveProposedTask',
                taskId: '1001',
                edits: { text: '   ' }
            });

            const taskFields = {};
            mockTask.setValue.mock.calls.forEach((c) => { taskFields[c[0].fieldId] = c[0].value; });
            expect(taskFields.title).toBe('AI: Send the quote');  // original, not whitespace
        });

        it('rejects empty edits.due (does NOT pass new Date("") = Invalid Date to native Task)', () => {
            restlet.post({
                action: 'approveProposedTask',
                taskId: '1001',
                edits: { due: '' }
            });

            // Original due date used, not Invalid Date
            const taskFields = {};
            mockTask.setValue.mock.calls.forEach((c) => { taskFields[c[0].fieldId] = c[0].value; });
            expect(taskFields.duedate instanceof Date).toBe(true);
            expect(isNaN(taskFields.duedate.getTime())).toBe(false);
        });

        // Regression: the native Task's `assigned` field used to fall back to the
        // LLM-suggested `custrecord_ctc_pt_proposed_assignee` before the current user.
        // That string was a free-text name guess (e.g. "Kathryn Glass") and produced
        // wrong assignments. The fix: prefer the customer.salesrep on the source call —
        // same source of truth as the "my tasks = me" filter. The LLM-suggested
        // assignee is now ignored entirely (kept as proposed-task metadata only).
        it('assigns native Task to the customer.salesrep, NOT the LLM-suggested proposed_assignee', () => {
            // Proposed-task says assignee = 999 (the bad LLM guess).
            // But customer.salesrep on the source call = 42 (the actual owner / current user).
            mockProposedTask.getValue = jest.fn((arg) => {
                const fieldId = typeof arg === 'string' ? arg : arg.fieldId;
                const vals = {
                    custrecord_ctc_pt_text: 'Send the quote',
                    custrecord_ctc_pt_proposed_due: new Date('2026-05-16'),
                    custrecord_ctc_pt_proposed_assignee: '999',  // <-- stale LLM guess
                    custrecord_ctc_pt_phone_call: '500'
                };
                return vals[fieldId];
            });

            restlet.post({ action: 'approveProposedTask', taskId: '1001' });

            const taskFields = {};
            mockTask.setValue.mock.calls.forEach((c) => { taskFields[c[0].fieldId] = c[0].value; });
            // customer.salesrep wins over the proposed_assignee
            expect(taskFields.assigned).toBe('42');
            expect(taskFields.assigned).not.toBe('999');
        });

        it('falls back to current user when customer has no salesrep on file', () => {
            // No salesrep returned by the customer lookup → fall through to userId (42).
            // The auth check is admin-bypassed for this scenario so the request still proceeds.
            runtime.getCurrentUser = jest.fn(() => ({ id: 42, role: '3' }));  // admin role short-circuits auth
            search.lookupFields = jest.fn().mockImplementation((opts) => {
                if (opts.type === 'customer' && opts.columns && opts.columns.indexOf('salesrep') !== -1) {
                    return { salesrep: [] };  // no salesrep on file
                }
                return {
                    company: [{ value: '224', text: 'Abbott Inc.' }],
                    contact: [{ value: '729', text: 'Maria Rogers' }]
                };
            });

            restlet.post({ action: 'approveProposedTask', taskId: '1001' });

            const taskFields = {};
            mockTask.setValue.mock.calls.forEach((c) => { taskFields[c[0].fieldId] = c[0].value; });
            // Falls through to userId (42), NOT the LLM-suggested 999 from the mock fixture
            expect(taskFields.assigned).toBe(42);
        });

        it('parses edits.due as local-tz date (no UTC-midnight shift)', () => {
            restlet.post({
                action: 'approveProposedTask',
                taskId: '1001',
                edits: { due: '2026-05-20' }
            });

            const taskFields = {};
            mockTask.setValue.mock.calls.forEach((c) => { taskFields[c[0].fieldId] = c[0].value; });
            // Local-tz: May 20 in local time, NOT May 19 due to UTC shift
            expect(taskFields.duedate.getFullYear()).toBe(2026);
            expect(taskFields.duedate.getMonth()).toBe(4);  // May = 4 (0-indexed)
            expect(taskFields.duedate.getDate()).toBe(20);
        });
    });

    describe('bulkApproveProposedTasks action', () => {
        beforeEach(() => {
            // Reuse approveProposedTask happy-path mocks (set up in approveProposedTask beforeEach above).
            // The bulk handler iterates and calls approve for each — each succeeds with default mocks.
        });

        it('returns error when taskIds missing or empty', () => {
            expect(restlet.post({ action: 'bulkApproveProposedTasks' }).error).toBe('taskIds required');
            expect(restlet.post({ action: 'bulkApproveProposedTasks', taskIds: [] }).error).toBe('taskIds required');
        });

        it('rejects batch over 25 tasks', () => {
            const ids = Array.from({ length: 26 }, (_, i) => String(i + 1));
            const result = restlet.post({ action: 'bulkApproveProposedTasks', taskIds: ids });
            expect(result.error).toBe('batch_too_large');
            expect(result.limit).toBe(25);
        });
    });

    describe('rejectProposedTask action', () => {
        let mockProposedTaskForReject;

        beforeEach(() => {
            search.Type = { ...(search.Type || {}), PHONE_CALL: 'phonecall', CUSTOMER: 'customer' };
            mockProposedTaskForReject = {
                getValue: jest.fn((arg) => {
                    const fieldId = typeof arg === 'string' ? arg : arg.fieldId;
                    if (fieldId === 'custrecord_ctc_pt_phone_call') return '500';
                    return '';
                }),
                getText: jest.fn(() => 'Pending'),
                setValue: jest.fn().mockReturnThis(),
                setText: jest.fn().mockReturnThis(),
                save: jest.fn().mockReturnValue('1001')
            };
            record.load = jest.fn().mockReturnValue(mockProposedTaskForReject);
            // Two-hop auth: phonecall → company, then customer → salesrep
            search.lookupFields = jest.fn().mockImplementation((opts) => {
                if (opts.type === 'customer' && opts.columns && opts.columns.indexOf('salesrep') !== -1) {
                    return { salesrep: [{ value: '42', text: 'Test User' }] };  // matches user
                }
                if (opts.type === 'phonecall' && opts.columns && opts.columns.indexOf('company') !== -1) {
                    return { company: [{ value: '224', text: 'Co' }] };
                }
                return {};
            });
        });

        it('returns error when taskId missing', () => {
            const result = restlet.post({ action: 'rejectProposedTask' });
            expect(result.error).toBe('taskId required');
        });

        it('marks Rejected status via setText (NOT submitFields with raw text — that would fail on SELECT)', () => {
            const result = restlet.post({ action: 'rejectProposedTask', taskId: '1001' });

            expect(result.ok).toBe(true);
            // Loads then sets text — coerces 'Rejected' → list value ID
            expect(record.load).toHaveBeenCalledWith(expect.objectContaining({
                type: 'customrecord_ctc_proposed_task',
                id: '1001'
            }));
            expect(mockProposedTaskForReject.setText).toHaveBeenCalledWith({
                fieldId: 'custrecord_ctc_pt_status',
                text: 'Rejected'
            });
            // Reviewer + date set on the loaded record (not via submitFields raw)
            const setValueFields = {};
            mockProposedTaskForReject.setValue.mock.calls.forEach((c) => {
                setValueFields[c[0].fieldId] = c[0].value;
            });
            expect(setValueFields.custrecord_ctc_pt_reviewer).toBe(42);
            expect(setValueFields.custrecord_ctc_pt_reviewed_date).toBeInstanceOf(Date);
        });

        it('REJECTS when user is not the customer salesrep (IDOR guard)', () => {
            search.lookupFields = jest.fn().mockImplementation((opts) => {
                if (opts.type === 'customer' && opts.columns && opts.columns.indexOf('salesrep') !== -1) {
                    return { salesrep: [{ value: '999', text: 'Different Rep' }] };
                }
                if (opts.type === 'phonecall' && opts.columns && opts.columns.indexOf('company') !== -1) {
                    return { company: [{ value: '224', text: 'Co' }] };
                }
                return {};
            });

            const result = restlet.post({ action: 'rejectProposedTask', taskId: '1001' });
            expect(result.error).toBe('forbidden');
            expect(mockProposedTaskForReject.save).not.toHaveBeenCalled();
        });

        it('REJECTS when task is already actioned (status !== Pending)', () => {
            mockProposedTaskForReject.getText = jest.fn(() => 'Approved');

            const result = restlet.post({ action: 'rejectProposedTask', taskId: '1001' });
            expect(result.error).toBe('already_actioned');
            expect(mockProposedTaskForReject.save).not.toHaveBeenCalled();
        });

        it('returns generic error envelope on exception (no internal leak)', () => {
            record.load.mockImplementation(() => { throw new Error('Internal field ABC failed'); });

            const result = restlet.post({ action: 'rejectProposedTask', taskId: '1001' });
            expect(result.error).toBe('Rejection failed');
            expect(result.error).not.toContain('ABC');
        });
    });

    describe('HIGH-13 — orphan-call queue on logCall save failure', () => {
        // Sprint 2 U5 — pre-fix: if phoneCall.save() throws inside
        // logCall (NetSuite field-validation rejection, transient
        // DB issue, etc.), the RESTlet returned a generic error and
        // the Twilio recording (already in progress) was orphaned —
        // no NetSuite record to attach the transcript to. Post-fix:
        // a lightweight customrecord_ctc_orphan_call row captures
        // the call metadata so the scheduled poller can retry the
        // Phone Call create on a subsequent cycle.

        // Helper: build a transient-shaped exception for orphan-A tests.
        // ORPHAN-A only queues orphans when err.name matches the
        // transient list — otherwise the failure routes to a hard
        // non-transient error (programming bug, retry won't help).
        const buildTransientSaveError = (msg) => {
            const e = new Error(msg || 'transient save failure');
            e.name = 'RCRD_HAS_BEEN_CHANGED';
            return e;
        };

        it('creates orphan row when phoneCall.save() throws TRANSIENT exception', () => {
            const mockPhoneCall = {
                setValue: jest.fn(),
                save: jest.fn().mockImplementation(() => {
                    throw buildTransientSaveError('record concurrently edited');
                })
            };
            const mockOrphan = {
                setValue: jest.fn(),
                save: jest.fn().mockReturnValue(77777)
            };
            // record.create is called twice: once for Phone Call
            // (which throws on save), once for the orphan row
            record.create.mockImplementation((opts) => {
                if (opts.type === 'customrecord_ctc_orphan_call') {
                    return mockOrphan;
                }
                return mockPhoneCall;
            });

            const result = restlet.post({
                action: 'logCall',
                callSid: 'CA00000000000000000000000legitORPH',
                entityId: '500',
                entityType: 'customer',
                contactId: '600',
                phone: '+15551234567',
                duration: 30
            });

            // Returns the new error envelope (distinct from the
            // generic 'Failed to log call' from the outer catch)
            expect(result.error).toBe('Failed to log call — admin will retry');
            expect(result.orphanCreated).toBe(true);

            // Orphan record was created with the right fields
            const orphanFields = {};
            mockOrphan.setValue.mock.calls.forEach((c) => {
                orphanFields[c[0].fieldId] = c[0].value;
            });
            expect(orphanFields.custrecord_ctc_orphan_callsid).toBe('CA00000000000000000000000legitORPH');
            expect(orphanFields.custrecord_ctc_orphan_entityid).toBe(500);
            expect(orphanFields.custrecord_ctc_orphan_entitytype).toBe('customer');
            expect(orphanFields.custrecord_ctc_orphan_phone).toBe('+15551234567');
            expect(orphanFields.custrecord_ctc_orphan_retrycount).toBe(0);
            // Sprint 2 review #3 — new fields preserved on persist
            expect(orphanFields.custrecord_ctc_orphan_contactid).toBe(600);
            expect(orphanFields.custrecord_ctc_orphan_duration).toBe(30);
            expect(mockOrphan.save).toHaveBeenCalledTimes(1);
        });

        it('ORPHAN-A: returns hard error (no orphan) when save throws NON-transient exception', () => {
            const mockPhoneCall = {
                setValue: jest.fn(),
                save: jest.fn().mockImplementation(() => {
                    // Generic Error has no recognised name — treated as programming bug
                    throw new Error('Field required: assigned');
                })
            };
            const mockOrphan = {
                setValue: jest.fn(),
                save: jest.fn().mockReturnValue(88888)
            };
            record.create.mockImplementation((opts) => {
                if (opts.type === 'customrecord_ctc_orphan_call') return mockOrphan;
                return mockPhoneCall;
            });

            const result = restlet.post({
                action: 'logCall',
                callSid: 'CA00000000000000000000000nontransA',
                entityId: '500',
                entityType: 'customer',
                phone: '+15551234567',
                duration: 30
            });

            // Hard error path — no orphanCreated key on the response
            expect(result.error).toBe('Failed to log call');
            expect(result.code).toBe('NON_TRANSIENT_SAVE');
            // Orphan record was NOT created
            const orphanCreates = record.create.mock.calls.filter(
                (c) => c[0] && c[0].type === 'customrecord_ctc_orphan_call'
            );
            expect(orphanCreates).toHaveLength(0);
        });

        it('ORPHAN-B: logCall sets assigned=userId on Phone Call (happy path)', () => {
            const mockPhoneCall = {
                setValue: jest.fn(),
                save: jest.fn().mockReturnValue(12345)
            };
            record.create.mockReturnValue(mockPhoneCall);

            restlet.post({
                action: 'logCall',
                callSid: 'CA00000000000000000000000legitASGN',
                entityId: '500',
                entityType: 'customer',
                phone: '+15551234567',
                duration: 30
            });

            const fields = {};
            mockPhoneCall.setValue.mock.calls.forEach((c) => {
                fields[c[0].fieldId] = c[0].value;
            });
            // assigned should be the current user's id (runtime mock returns 42)
            expect(fields.assigned).toBe(42);
        });

        it('returns orphanCreated=false when orphan write itself throws (transient phoneCall save + non-throwing orphan classifier path)', () => {
            const mockPhoneCall = {
                setValue: jest.fn(),
                save: jest.fn().mockImplementation(() => { throw buildTransientSaveError('save boom'); })
            };
            const mockOrphan = {
                setValue: jest.fn(),
                save: jest.fn().mockImplementation(() => { throw new Error('orphan also boom'); })
            };
            record.create.mockImplementation((opts) => {
                if (opts.type === 'customrecord_ctc_orphan_call') return mockOrphan;
                return mockPhoneCall;
            });

            const result = restlet.post({
                action: 'logCall',
                callSid: 'CA00000000000000000000000orphFAIL0',
                entityId: '500',
                entityType: 'customer',
                phone: '+15551234567',
                duration: 30
            });

            expect(result.error).toBe('Failed to log call — admin will retry');
            expect(result.orphanCreated).toBe(false);
        });

        it('does NOT create orphan when phoneCall.save() succeeds (happy path preserved)', () => {
            const mockPhoneCall = {
                setValue: jest.fn(),
                save: jest.fn().mockReturnValue(12345)
            };
            record.create.mockReturnValue(mockPhoneCall);

            const result = restlet.post({
                action: 'logCall',
                callSid: 'CA00000000000000000000000happyPath',
                entityId: '500',
                entityType: 'customer',
                phone: '+15551234567',
                duration: 30
            });

            expect(result).toEqual({ success: true, recordId: 12345 });
            // Orphan record.create never invoked
            const orphanCalls = record.create.mock.calls.filter(
                (c) => c[0] && c[0].type === 'customrecord_ctc_orphan_call'
            );
            expect(orphanCalls).toHaveLength(0);
        });
    });

});
