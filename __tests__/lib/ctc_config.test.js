import ctcConfig from 'SuiteScripts/lib/ctc_config';
import search from 'N/search';

jest.mock('N/search');

// Phase 2 U10: Auth Token removed entirely. ctc_config no longer exports
// buildAuthHeader; the runtime auth path lives in lib/ctc_twilio_admin.js
// via buildSecureAuthHeader(cfg) which uses N/https.createSecureString.
// loadConfig no longer returns `authToken` or `authTokenSecretId`.

describe('ctc_config', () => {
    const buildSearchResult = (overrides = {}) => {
        const defaults = {
            custrecord_ctc_account_sid: 'AC' + 'a'.repeat(32),
            custrecord_ctc_api_key_sid: 'SK' + 'b'.repeat(32),
            custrecord_ctc_api_secret_id: 'custsecret_ctc_api_key_secret',
            custrecord_ctc_twiml_app_sid: 'AP' + 'c'.repeat(32),
            custrecord_ctc_phone_number: '+15551234567',
            custrecord_ctc_intel_service_sid: 'GA' + 'd'.repeat(32),
            custrecord_ctc_active: 'T'
        };
        const data = Object.assign({}, defaults, overrides);
        return {
            getValue: jest.fn((field) => data[field])
        };
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('loadConfig', () => {
        it('returns the public identifier fields + the API Key Secret pointer + active flag', () => {
            const result = buildSearchResult();
            search.create.mockReturnValue({
                run: () => ({ getRange: () => [result] })
            });

            const config = ctcConfig.loadConfig();

            expect(config.accountSid).toMatch(/^AC[a-z]{32}$/);
            expect(config.apiKeySid).toMatch(/^SK[a-z]{32}$/);
            expect(config.apiSecretId).toBe('custsecret_ctc_api_key_secret');
            expect(config.twimlAppSid).toMatch(/^AP[a-z]{32}$/);
            expect(config.phoneNumber).toBe('+15551234567');
            expect(config.intelServiceSid).toMatch(/^GA[a-z]{32}$/);
            expect(config.active).toBe(true);
        });

        it('no longer returns authToken or authTokenSecretId in its public shape (U10)', () => {
            const result = buildSearchResult();
            search.create.mockReturnValue({
                run: () => ({ getRange: () => [result] })
            });

            const config = ctcConfig.loadConfig();

            expect(config).not.toHaveProperty('authToken');
            expect(config).not.toHaveProperty('authTokenSecretId');
        });

        it('no longer selects authToken or authTokenSecretId in the search columns list (U10)', () => {
            let capturedOpts;
            search.create.mockImplementation((opts) => {
                capturedOpts = opts;
                return { run: () => ({ getRange: () => [buildSearchResult()] }) };
            });

            ctcConfig.loadConfig();

            expect(capturedOpts.columns).not.toContain('custrecord_ctc_auth_token');
            expect(capturedOpts.columns).not.toContain('custrecord_ctc_auth_token_id');
        });

        it('coerces active flag to a strict boolean from NetSuite\'s "T"/"F" string representation', () => {
            search.create.mockReturnValue({
                run: () => ({ getRange: () => [buildSearchResult({ custrecord_ctc_active: 'T' })] })
            });
            expect(ctcConfig.loadConfig().active).toBe(true);

            search.create.mockReturnValue({
                run: () => ({ getRange: () => [buildSearchResult({ custrecord_ctc_active: 'F' })] })
            });
            expect(ctcConfig.loadConfig().active).toBe(false);

            // Boolean-true (some NetSuite contexts return a real boolean rather than 'T'/'F')
            search.create.mockReturnValue({
                run: () => ({ getRange: () => [buildSearchResult({ custrecord_ctc_active: true })] })
            });
            expect(ctcConfig.loadConfig().active).toBe(true);

            // Missing / empty — fresh install before wizard, must default to false
            search.create.mockReturnValue({
                run: () => ({ getRange: () => [buildSearchResult({ custrecord_ctc_active: '' })] })
            });
            expect(ctcConfig.loadConfig().active).toBe(false);
        });

        it('throws when no config record exists (fresh install before wizard creates the singleton)', () => {
            search.create.mockReturnValue({
                run: () => ({ getRange: () => [] })
            });

            expect(() => ctcConfig.loadConfig()).toThrow(/CTC config record not found/);
        });
    });

    describe('buildAuthHeader — removed in U10', () => {
        it('is no longer exported from ctc_config (Auth Token path eliminated)', () => {
            expect(ctcConfig.buildAuthHeader).toBeUndefined();
        });
    });
});
