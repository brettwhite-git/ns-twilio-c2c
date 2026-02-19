/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Generates Twilio Access Tokens (JWT) for the Voice SDK.
 * Uses N/crypto for HMAC-SHA256 signing with secrets stored in
 * NetSuite's API Secrets management (Setup > Company > API Secrets).
 */
define(['N/crypto', 'N/encode'], (crypto, encode) => {

    /**
     * Encode a string to base64url (RFC 7515) with no padding.
     * @param {string} str - Plain text input
     * @returns {string} base64url-encoded string
     */
    const toBase64Url = (str) => {
        return encode.convert({
            string: str,
            inputEncoding: encode.Encoding.UTF_8,
            outputEncoding: encode.Encoding.BASE_64_URL_SAFE
        }).replace(/=/g, '').replace(/\n/g, '').replace(/\r/g, '');
    };

    /**
     * Generate a Twilio Access Token for the Voice SDK.
     *
     * @param {Object} options
     * @param {string} options.accountSid   - Twilio Account SID (AC...)
     * @param {string} options.apiKeySid    - Twilio API Key SID (SK...)
     * @param {string} options.apiSecretId  - NetSuite API Secret script ID (custsecret_*)
     * @param {string} options.twimlAppSid  - TwiML Application SID (AP...)
     * @param {string} options.identity     - User identity (employee ID or username)
     * @param {number} [options.ttl=3600]   - Token lifetime in seconds
     * @returns {string} JWT token string
     */
    const generateAccessToken = (options) => {
        const {
            accountSid,
            apiKeySid,
            apiSecretId,
            twimlAppSid,
            identity,
            ttl = 3600
        } = options;

        const now = Math.floor(Date.now() / 1000);

        // JWT header — cty is required by Twilio or token silently fails
        const header = {
            typ: 'JWT',
            alg: 'HS256',
            cty: 'twilio-fpa;v=1'
        };

        // JWT payload — no nbf (optional, avoids clock-skew rejection)
        const payload = {
            jti: apiKeySid + '-' + now,
            iss: apiKeySid,
            sub: accountSid,
            iat: now,
            exp: now + ttl,
            grants: {
                identity: identity,
                voice: {
                    outgoing: { application_sid: twimlAppSid },
                    incoming: { allow: false }
                }
            }
        };

        const headerB64 = toBase64Url(JSON.stringify(header));
        const payloadB64 = toBase64Url(JSON.stringify(payload));
        const signingInput = headerB64 + '.' + payloadB64;

        // HMAC-SHA256 signature using secret from NetSuite API Secrets
        const key = crypto.createSecretKey({
            secret: apiSecretId,
            encoding: encode.Encoding.UTF_8
        });

        const hmac = crypto.createHmac({
            algorithm: crypto.HashAlg.SHA256,
            key: key
        });

        hmac.update({
            input: signingInput,
            inputEncoding: encode.Encoding.UTF_8
        });

        const signature = hmac.digest({
            outputEncoding: encode.Encoding.BASE_64_URL_SAFE
        }).replace(/=/g, '').replace(/\n/g, '').replace(/\r/g, '');

        return signingInput + '.' + signature;
    };

    return { generateAccessToken };
});
