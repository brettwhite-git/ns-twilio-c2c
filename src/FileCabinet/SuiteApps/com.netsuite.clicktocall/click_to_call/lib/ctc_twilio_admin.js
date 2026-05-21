/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Twilio REST API wrappers used by the v2 Setup Wizard.
 *
 * AUTH PATTERN — N/https.createSecureString with {custsecret_*} placeholder.
 * The secret VALUE never enters SuiteScript scope — NetSuite's HTTP runtime
 * expands the {custsecret_*} placeholder at the socket write boundary.
 *
 * Reference: Oracle's documented Suitelet sample for Basic Auth via secure
 * string — https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/
 * article_0111025229.html
 *
 * Every helper returns a typed envelope:
 *   { ok: true,  status: 200, ...response-specific-fields }
 *   { ok: false, status: <number|'NETWORK_ERROR'|'EMPTY_SECRET'>,
 *                errorCode, errorMessage }
 *
 * Never throws. Caller gets a clean structured result either way.
 */
// eslint-disable-next-line suitescript/no-log-module
define(['N/https', 'N/encode', 'N/log'],
       (https, encode, log) => {

    const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01/Accounts';
    const TWILIO_INTEL_BASE = 'https://intelligence.twilio.com/v2';

    // Twilio's REST API list endpoints default to 50 per page; the wizard
    // caps at 100 numbers / 100 TwiML apps / 100 Intel services per
    // account for v1. Accounts beyond that are uncommon for sales-team
    // outbound calling and can be addressed in v2.
    const LIST_PAGE_SIZE = 100;

    /**
     * Build a Basic Auth header as a SecureString. Caller passes the
     * config snapshot (with apiKeySid + apiSecretId). The runtime
     * expands `{custsecret_<id>}` at socket write — the secret VALUE
     * is never in SuiteScript scope.
     */
    const buildSecureAuthHeader = (cfg) => {
        if (!cfg || !cfg.apiKeySid || !cfg.apiSecretId) {
            throw new Error('buildSecureAuthHeader: cfg.apiKeySid + ' +
                'cfg.apiSecretId both required');
        }
        // SID is an identifier (not secret per Twilio); concatenate it
        // plaintext with the placeholder for the secret value.
        const credentialInput = cfg.apiKeySid + ':{' + cfg.apiSecretId + '}';
        const credential = https.createSecureString({ input: credentialInput });

        // Base64 the SID:SECRET pair (per HTTP Basic Auth spec).
        credential.convertEncoding({
            toEncoding: encode.Encoding.BASE_64,
            fromEncoding: encode.Encoding.UTF_8
        });

        // Prepend the 'Basic ' scheme. Result is a single SecureString
        // suitable for the Authorization header.
        const header = https.createSecureString({ input: 'Basic ' });
        header.appendSecureString({
            secureString: credential,
            keepEncoding: true
        });
        return header;
    };

    /**
     * Mask a Twilio SID for safe logging: 'AC...<last4>' style.
     */
    const maskSid = (sid) => {
        if (!sid || typeof sid !== 'string' || sid.length < 8) return '****';
        return sid.slice(0, 4) + '...' + sid.slice(-4);
    };

    /**
     * Wrap N/https.get with a clean envelope. Detects:
     *   - 2xx success → returns parsed body
     *   - 401 → EMPTY_SECRET likely; specific error code so the SPA can
     *     surface "secret value is empty — paste it at Setup > Company >
     *     API Secrets"
     *   - Other non-2xx → returns Twilio error envelope
     *   - Network error → NETWORK_ERROR
     */
    const httpGetJson = (url, secureAuthHeader) => {
        try {
            const response = https.get({
                url: url,
                headers: {
                    Authorization: secureAuthHeader,
                    Accept: 'application/json'
                }
            });
            const status = response.code;
            let body;
            try { body = JSON.parse(response.body || '{}'); }
            catch (e) { body = {}; }

            if (status >= 200 && status < 300) {
                return { ok: true, status: status, body: body };
            }
            if (status === 401) {
                return {
                    ok: false,
                    status: 401,
                    errorCode: 'EMPTY_SECRET_OR_INVALID',
                    errorMessage: 'Twilio rejected the credentials. The ' +
                        'API Key Secret in NetSuite API Secrets may be ' +
                        'empty or invalid. Open Setup > Company > API ' +
                        'Secrets and paste the secret value.'
                };
            }
            return {
                ok: false,
                status: status,
                errorCode: body && body.code ? body.code : status,
                errorMessage: body && body.message
                    ? body.message
                    : 'HTTP ' + status
            };
        } catch (e) {
            return {
                ok: false,
                status: 'NETWORK_ERROR',
                errorCode: 'NETWORK_ERROR',
                errorMessage: (e && e.message ? e.message : String(e))
            };
        }
    };

    /**
     * GET /Accounts/{Sid}.json — proves Account SID + secret pair is valid.
     * Used as the wizard's primary "are credentials wired?" check.
     */
    const pingAccount = (cfg) => {
        const url = TWILIO_API_BASE + '/' + cfg.accountSid + '.json';
        const result = httpGetJson(url, buildSecureAuthHeader(cfg));

        log.audit({
            title: 'CTC Wizard — Twilio account ping',
            details: 'sid=' + maskSid(cfg.accountSid) +
                     ' status=' + result.status +
                     ' ok=' + result.ok
        });

        if (result.ok) {
            return {
                ok: true,
                friendlyName: result.body.friendly_name,
                twilioStatus: result.body.status,
                accountSid: maskSid(result.body.sid || cfg.accountSid)
            };
        }
        return result;
    };

    /**
     * GET /Accounts/{Sid}/Applications.json — list ALL TwiML apps in
     * the account. Used by Step 3 to render the TwiML App dropdown.
     */
    const listApplications = (cfg) => {
        const url = TWILIO_API_BASE + '/' + cfg.accountSid +
                    '/Applications.json?PageSize=' + LIST_PAGE_SIZE;
        const result = httpGetJson(url, buildSecureAuthHeader(cfg));

        log.audit({
            title: 'CTC Wizard — list TwiML applications',
            details: 'status=' + result.status + ' ok=' + result.ok
        });

        if (!result.ok) return result;

        const apps = (result.body && result.body.applications) || [];
        return {
            ok: true,
            items: apps.map(function (a) {
                return {
                    sid: a.sid,
                    friendlyName: a.friendly_name,
                    voiceUrl: a.voice_url,
                    voiceMethod: a.voice_method
                };
            }),
            hasMore: !!(result.body && result.body.next_page_uri)
        };
    };

    /**
     * GET /Accounts/{Sid}/Applications/{TwiMLAppSid}.json — single-app
     * detail. Kept for preflight in Step 6 (verify a specific app).
     */
    const getApplication = (cfg, twimlAppSid) => {
        const url = TWILIO_API_BASE + '/' + cfg.accountSid +
                    '/Applications/' + twimlAppSid + '.json';
        const result = httpGetJson(url, buildSecureAuthHeader(cfg));

        log.audit({
            title: 'CTC Wizard — TwiML App validation',
            details: 'twimlApp=' + maskSid(twimlAppSid) +
                     ' status=' + result.status + ' ok=' + result.ok
        });

        if (result.ok) {
            return {
                ok: true,
                friendlyName: result.body.friendly_name,
                voiceUrl: result.body.voice_url,
                voiceMethod: result.body.voice_method,
                twimlAppSid: maskSid(result.body.sid || twimlAppSid)
            };
        }
        return result;
    };

    /**
     * GET /Accounts/{Sid}/IncomingPhoneNumbers.json — list ALL owned
     * numbers. Used by Step 3 (caller-ID dropdown) and Step 5 (rep
     * assignment grid).
     */
    const listPhoneNumbers = (cfg) => {
        const url = TWILIO_API_BASE + '/' + cfg.accountSid +
                    '/IncomingPhoneNumbers.json?PageSize=' + LIST_PAGE_SIZE;
        const result = httpGetJson(url, buildSecureAuthHeader(cfg));

        log.audit({
            title: 'CTC Wizard — list phone numbers',
            details: 'status=' + result.status + ' ok=' + result.ok
        });

        if (!result.ok) return result;

        const numbers = (result.body && result.body.incoming_phone_numbers) || [];
        return {
            ok: true,
            items: numbers.map(function (n) {
                return {
                    sid: n.sid,
                    phoneNumber: n.phone_number,
                    friendlyName: n.friendly_name,
                    capabilities: n.capabilities
                };
            }),
            hasMore: !!(result.body && result.body.next_page_uri)
        };
    };

    /**
     * GET /Accounts/{Sid}/IncomingPhoneNumbers.json?PhoneNumber=<E164> —
     * verify the number is owned by this Twilio account. Used by
     * preflight when admin manually entered a number rather than picking
     * from the list dropdown.
     */
    const getPhoneNumberLookup = (cfg, phoneNumber) => {
        const encodedNumber = encodeURIComponent(phoneNumber);
        const url = TWILIO_API_BASE + '/' + cfg.accountSid +
                    '/IncomingPhoneNumbers.json?PhoneNumber=' + encodedNumber;
        const result = httpGetJson(url, buildSecureAuthHeader(cfg));

        log.audit({
            title: 'CTC Wizard — phone number lookup',
            details: 'number=' + phoneNumber +
                     ' status=' + result.status + ' ok=' + result.ok
        });

        if (!result.ok) return result;

        const list = (result.body && result.body.incoming_phone_numbers) || [];
        if (list.length === 0) {
            return {
                ok: false,
                status: 200,
                errorCode: 'NOT_OWNED',
                errorMessage: 'Phone number ' + phoneNumber +
                              ' is not owned by this Twilio account.'
            };
        }
        const number = list[0];
        return {
            ok: true,
            phoneNumber: number.phone_number,
            friendlyName: number.friendly_name,
            phoneSid: number.sid,
            capabilities: number.capabilities
        };
    };

    /**
     * GET intelligence.twilio.com/v2/Services — list Intel services.
     */
    const listIntelServices = (cfg) => {
        const url = TWILIO_INTEL_BASE + '/Services?PageSize=' + LIST_PAGE_SIZE;
        const result = httpGetJson(url, buildSecureAuthHeader(cfg));

        log.audit({
            title: 'CTC Wizard — list Intel services',
            details: 'status=' + result.status + ' ok=' + result.ok
        });

        if (!result.ok) return result;

        const services = (result.body && result.body.services) || [];
        return {
            ok: true,
            items: services.map(function (s) {
                return {
                    sid: s.sid,
                    friendlyName: s.friendly_name,
                    languageCode: s.language_code
                };
            })
        };
    };

    /**
     * GET intelligence.twilio.com/v2/Services/{Gid} — single-service
     * detail. Kept for preflight in Step 6.
     */
    const getIntelService = (cfg, intelServiceSid) => {
        const url = TWILIO_INTEL_BASE + '/Services/' + intelServiceSid;
        const result = httpGetJson(url, buildSecureAuthHeader(cfg));

        log.audit({
            title: 'CTC Wizard — Intel Service validation',
            details: 'intelService=' + maskSid(intelServiceSid) +
                     ' status=' + result.status + ' ok=' + result.ok
        });

        if (result.ok) {
            return {
                ok: true,
                friendlyName: result.body.friendly_name,
                intelServiceSid: maskSid(result.body.sid || intelServiceSid)
            };
        }
        return result;
    };

    /**
     * GET /Accounts/{Sid}/Calls/{CallSid}.json — fetch a specific call's
     * canonical Twilio-side details (`from`, `to`, `status`, `duration`).
     *
     * Used by ctc_rl_token's verifyCallOwnership to confirm a body-supplied
     * callSid was actually placed by the authenticated user's caller-ID
     * before allowing logCall / checkTranscript (CRIT-2 / CRIT-3, SAFE
     * review 2026-05-21).
     */
    const getCall = (cfg, callSid) => {
        const url = TWILIO_API_BASE + '/' + cfg.accountSid +
                    '/Calls/' + callSid + '.json';
        const result = httpGetJson(url, buildSecureAuthHeader(cfg));

        if (result.ok) {
            return {
                ok: true,
                status: result.status,
                call: {
                    sid:        result.body.sid,
                    from:       result.body.from,
                    to:         result.body.to,
                    callStatus: result.body.status,
                    duration:   result.body.duration
                }
            };
        }
        return result;
    };

    return {
        buildSecureAuthHeader: buildSecureAuthHeader,
        maskSid: maskSid,
        pingAccount: pingAccount,
        listApplications: listApplications,
        getApplication: getApplication,
        listPhoneNumbers: listPhoneNumbers,
        getPhoneNumberLookup: getPhoneNumberLookup,
        listIntelServices: listIntelServices,
        getIntelService: getIntelService,
        getCall: getCall
    };
});
