// @ts-check
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
    const TWILIO_STUDIO_FLOWS = 'https://studio.twilio.com/v2/Flows';
    const TWILIO_FLOW_WEBHOOK_BASE = 'https://webhooks.twilio.com/v1/Accounts';
    const DEFAULT_FLOW_NAME = 'CTC Inbound Routing';

    // Strict SID shapes. Checked before any SID goes into a URL path so
    // a bad config value can never change the request target.
    const ACCOUNT_SID_RE = /^AC[0-9a-f]{32}$/;
    const PHONE_SID_RE = /^PN[0-9a-f]{32}$/;
    const FLOW_SID_RE = /^FW[0-9a-f]{32}$/;

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

    /**
     * Encode a flat object as application/x-www-form-urlencoded.
     * Undefined / null values are left out.
     */
    const encodeForm = (params) => {
        return Object.keys(params || {})
            .filter(function (k) { return params[k] !== undefined && params[k] !== null; })
            .map(function (k) {
                return encodeURIComponent(k) + '=' + encodeURIComponent(String(params[k]));
            })
            .join('&');
    };

    /**
     * Build a readable error message from a Twilio error body. Studio's
     * 400 (invalid definition) puts the useful text in details.errors[].
     */
    const twilioErrorMessage = (body, status) => {
        const base = body && body.message ? String(body.message) : 'HTTP ' + status;
        const errs = body && body.details && Array.isArray(body.details.errors)
            ? body.details.errors
            : [];
        const extra = errs
            .map(function (e) {
                if (!e) return '';
                const msg = e.message ? String(e.message) : '';
                const path = e.property_path ? ' (' + e.property_path + ')' : '';
                return msg ? msg + path : '';
            })
            .filter(function (m) { return !!m; });
        return extra.length ? base + ': ' + extra.join('; ') : base;
    };

    /**
     * Wrap N/https.post with a form-encoded body and the same envelope
     * as httpGetJson. Never throws.
     */
    const httpPostForm = (url, secureAuthHeader, params) => {
        try {
            const response = https.post({
                url: url,
                body: encodeForm(params),
                headers: {
                    Authorization: secureAuthHeader,
                    Accept: 'application/json',
                    'Content-Type': 'application/x-www-form-urlencoded'
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
                errorMessage: twilioErrorMessage(body, status)
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
     * Create or update (and publish) the inbound routing Studio flow.
     *
     *   flowSid valid  → POST /v2/Flows/{flowSid}; on 404 fall back to create
     *   flowSid empty  → POST /v2/Flows
     *
     * Returns { ok: true, status, flowSid, created, revision } or
     * { ok: false, status, flowSid: '', errorCode, errorMessage }.
     */
    const upsertStudioFlow = (cfg, flowSid, definition, friendlyName) => {
        let auth;
        try { auth = buildSecureAuthHeader(cfg); }
        catch (e) {
            return { ok: false, status: 'CONFIG_ERROR', flowSid: '',
                     errorCode: 'CONFIG_ERROR',
                     errorMessage: e && e.message ? e.message : String(e) };
        }

        const name = friendlyName || DEFAULT_FLOW_NAME;
        const params = {
            FriendlyName: name,
            Status: 'published',
            Definition: JSON.stringify(definition),
            CommitMessage: 'Published by NetSuite Click-to-Call ' +
                           new Date().toISOString()
        };

        const finish = (result, created) => {
            if (!result.ok) {
                return {
                    ok: false,
                    status: result.status,
                    flowSid: '',
                    errorCode: result.errorCode,
                    errorMessage: result.errorMessage
                };
            }
            const sid = result.body && result.body.sid;
            if (typeof sid !== 'string' || !FLOW_SID_RE.test(sid)) {
                return { ok: false, status: result.status, flowSid: '',
                         errorCode: 'BAD_RESPONSE',
                         errorMessage: 'Twilio did not return a flow SID' };
            }
            return {
                ok: true,
                status: result.status,
                flowSid: sid,
                created: created,
                revision: result.body.revision
            };
        };

        if (flowSid && typeof flowSid === 'string' && FLOW_SID_RE.test(flowSid)) {
            const updated = httpPostForm(TWILIO_STUDIO_FLOWS + '/' + flowSid, auth, params);
            log.audit({
                title: 'CTC Inbound — update Studio flow',
                details: 'flow=' + maskSid(flowSid) + ' status=' + updated.status +
                         ' ok=' + updated.ok
            });
            if (updated.ok || updated.status !== 404) return finish(updated, false);
            // Flow deleted in the Twilio Console: create a new one.
        } else if (flowSid) {
            log.audit({
                title: 'CTC Inbound — stored flow SID is not valid; creating a new flow',
                details: 'flow=' + maskSid(String(flowSid))
            });
        }

        const created = httpPostForm(TWILIO_STUDIO_FLOWS, auth, params);
        log.audit({
            title: 'CTC Inbound — create Studio flow',
            details: 'status=' + created.status + ' ok=' + created.ok
        });
        return finish(created, true);
    };

    /**
     * Point one phone number's incoming-call webhook at the Studio flow.
     * POST /2010-04-01/Accounts/{AC}/IncomingPhoneNumbers/{PN}.json
     *   VoiceUrl=https://webhooks.twilio.com/v1/Accounts/{AC}/Flows/{FW}
     *   VoiceMethod=POST
     */
    const setNumberVoiceUrl = (cfg, phoneSid, flowSid) => {
        const accountSid = cfg && cfg.accountSid;
        if (typeof accountSid !== 'string' || !ACCOUNT_SID_RE.test(accountSid)) {
            return { ok: false, status: 'INVALID_SID', errorCode: 'INVALID_ACCOUNT_SID',
                     errorMessage: 'The Account SID in the configuration is not valid' };
        }
        if (typeof phoneSid !== 'string' || !PHONE_SID_RE.test(phoneSid)) {
            return { ok: false, status: 'INVALID_SID', errorCode: 'INVALID_PHONE_SID',
                     errorMessage: 'The phone number SID is not valid' };
        }
        if (typeof flowSid !== 'string' || !FLOW_SID_RE.test(flowSid)) {
            return { ok: false, status: 'INVALID_SID', errorCode: 'INVALID_FLOW_SID',
                     errorMessage: 'The Studio flow SID is not valid' };
        }

        let auth;
        try { auth = buildSecureAuthHeader(cfg); }
        catch (e) {
            return { ok: false, status: 'CONFIG_ERROR', errorCode: 'CONFIG_ERROR',
                     errorMessage: e && e.message ? e.message : String(e) };
        }

        const voiceUrl = TWILIO_FLOW_WEBHOOK_BASE + '/' + accountSid + '/Flows/' + flowSid;
        const url = TWILIO_API_BASE + '/' + accountSid +
                    '/IncomingPhoneNumbers/' + phoneSid + '.json';
        const result = httpPostForm(url, auth, {
            VoiceUrl: voiceUrl,
            VoiceMethod: 'POST'
        });

        log.audit({
            title: 'CTC Inbound — set number voice URL',
            details: 'number=' + maskSid(phoneSid) + ' flow=' + maskSid(flowSid) +
                     ' status=' + result.status + ' ok=' + result.ok
        });

        if (!result.ok) return result;
        return { ok: true, status: result.status, phoneSid: phoneSid, voiceUrl: voiceUrl };
    };

    return {
        buildSecureAuthHeader: buildSecureAuthHeader,
        maskSid: maskSid,
        listApplications: listApplications,
        listPhoneNumbers: listPhoneNumbers,
        listIntelServices: listIntelServices,
        getCall: getCall,
        httpPostForm: httpPostForm,
        upsertStudioFlow: upsertStudioFlow,
        setNumberVoiceUrl: setNumberVoiceUrl,
        DEFAULT_FLOW_NAME: DEFAULT_FLOW_NAME
    };
});
