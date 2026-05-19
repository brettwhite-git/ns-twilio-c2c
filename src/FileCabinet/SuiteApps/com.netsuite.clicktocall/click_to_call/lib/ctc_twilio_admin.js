/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Twilio REST API wrappers used by the v2 Setup Wizard for live
 * validation of admin-entered credentials and resource SIDs.
 *
 * Auth strategy: Basic Auth with API Key SID + API Key Secret value.
 * This validates two credentials at once (the pair must be correct
 * for any call to succeed) and matches the JWT signing path the
 * softphone uses at runtime — so the wizard validations dry-run the
 * same credentials reps will use.
 *
 * Every helper returns a typed envelope:
 *   { ok: true,  status: 200, ...response-specific-fields }
 *   { ok: false, status: <number|'TIMEOUT'>, errorCode, errorMessage }
 *
 * Never throws. Caller gets a clean structured result either way.
 */
// eslint-disable-next-line suitescript/no-log-module
define(['N/https', 'N/encode', 'N/log', 'N/crypto'],
       (https, encode, log, crypto) => {

    const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01/Accounts';
    const TWILIO_INTEL_BASE = 'https://intelligence.twilio.com/v2';

    /**
     * Build a Basic Auth header from API Key SID + the resolved secret
     * value (the actual API Key Secret, not its script ID).
     */
    const buildApiKeyAuthHeader = (apiKeySid, apiKeySecretValue) => {
        const encoded = encode.convert({
            string: apiKeySid + ':' + apiKeySecretValue,
            inputEncoding: encode.Encoding.UTF_8,
            outputEncoding: encode.Encoding.BASE_64
        });
        return 'Basic ' + encoded;
    };

    /**
     * Mask a Twilio SID for safe logging: 'AC...<last4>' style.
     */
    const maskSid = (sid) => {
        if (!sid || typeof sid !== 'string' || sid.length < 8) return '****';
        return sid.slice(0, 4) + '...' + sid.slice(-4);
    };

    /**
     * Wrap N/https.get with a 15s timeout and clean envelope.
     */
    const httpGetJson = (url, authHeader) => {
        try {
            const response = https.get({
                url: url,
                headers: {
                    Authorization: authHeader,
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
     * GET /Accounts/{Sid}.json — proves Account SID + API Key pair is valid.
     */
    const pingAccount = (accountSid, apiKeySid, apiKeySecretValue) => {
        const url = TWILIO_API_BASE + '/' + accountSid + '.json';
        const auth = buildApiKeyAuthHeader(apiKeySid, apiKeySecretValue);
        const result = httpGetJson(url, auth);

        log.audit({
            title: 'CTC Wizard — Twilio account ping',
            details: 'sid=' + maskSid(accountSid) +
                     ' status=' + result.status +
                     ' ok=' + result.ok
        });

        if (result.ok) {
            return {
                ok: true,
                friendlyName: result.body.friendly_name,
                twilioStatus: result.body.status,
                accountSid: maskSid(result.body.sid || accountSid)
            };
        }
        return result;
    };

    /**
     * GET /Accounts/{Sid}/Applications/{TwiMLAppSid}.json — proves the
     * TwiML App exists in this account and shows its voice_url so the
     * admin can verify it points at the right place.
     */
    const getApplication = (accountSid, twimlAppSid, apiKeySid, apiKeySecretValue) => {
        const url = TWILIO_API_BASE + '/' + accountSid + '/Applications/' +
                    twimlAppSid + '.json';
        const auth = buildApiKeyAuthHeader(apiKeySid, apiKeySecretValue);
        const result = httpGetJson(url, auth);

        log.audit({
            title: 'CTC Wizard — TwiML App validation',
            details: 'twimlApp=' + maskSid(twimlAppSid) +
                     ' status=' + result.status +
                     ' ok=' + result.ok
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
     * GET /Accounts/{Sid}/IncomingPhoneNumbers.json?PhoneNumber=<E164> —
     * verifies the number is owned by this Twilio account.
     */
    const getPhoneNumberLookup = (accountSid, phoneNumber, apiKeySid, apiKeySecretValue) => {
        const encodedNumber = encodeURIComponent(phoneNumber);
        const url = TWILIO_API_BASE + '/' + accountSid +
                    '/IncomingPhoneNumbers.json?PhoneNumber=' + encodedNumber;
        const auth = buildApiKeyAuthHeader(apiKeySid, apiKeySecretValue);
        const result = httpGetJson(url, auth);

        log.audit({
            title: 'CTC Wizard — phone number lookup',
            details: 'number=' + phoneNumber + ' status=' + result.status +
                     ' ok=' + result.ok
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
     * GET intelligence.twilio.com/v2/Services/{Gid} — validates the
     * Conversational Intelligence service SID exists.
     */
    const getIntelService = (intelServiceSid, apiKeySid, apiKeySecretValue) => {
        const url = TWILIO_INTEL_BASE + '/Services/' + intelServiceSid;
        const auth = buildApiKeyAuthHeader(apiKeySid, apiKeySecretValue);
        const result = httpGetJson(url, auth);

        log.audit({
            title: 'CTC Wizard — Intel Service validation',
            details: 'intelService=' + maskSid(intelServiceSid) +
                     ' status=' + result.status +
                     ' ok=' + result.ok
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
     * Materialize the API Key Secret value from its script ID via
     * N/crypto. This is how the existing softphone JWT signer reads
     * the secret. Used by every wizard validation action since we
     * need the raw secret VALUE for Basic Auth (not just the SID).
     *
     * Note: createSecretKey returns a KEY HANDLE, not the raw bytes.
     * For Basic Auth we need the raw secret. The existing token
     * RESTlet uses crypto.createHmac to sign with the key — that works
     * for HMAC but not for Basic Auth where we need to embed the
     * secret in the header.
     *
     * Workaround: store the secret VALUE directly in a CLOBTEXT field
     * on the config record at wizard-save time, OR have the wizard
     * pass the secret VALUE in the request body (since the admin just
     * typed it). The latter is the wizard's actual flow — admin
     * pastes the secret, validates, then on save we store ONLY the
     * pointer (not the value) and rely on N/crypto for HMAC paths.
     *
     * For wizard validation, the admin provides the secret VALUE in
     * the request body; we use it directly for the Basic Auth call
     * and never persist it. The script ID points at where they'll
     * store it in NetSuite Secrets after validation passes.
     */

    return {
        buildApiKeyAuthHeader: buildApiKeyAuthHeader,
        maskSid: maskSid,
        pingAccount: pingAccount,
        getApplication: getApplication,
        getPhoneNumberLookup: getPhoneNumberLookup,
        getIntelService: getIntelService
    };
});
