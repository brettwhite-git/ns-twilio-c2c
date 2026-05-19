/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Shared CTC configuration loader + Twilio Basic Auth header builder.
 * Single source of truth so RESTlet / Scheduled Script / future SMS action
 * all read from the same config record with the same field set.
 */
define(['N/search', 'N/encode'], (search, encode) => {

    /**
     * Load the singleton CTC configuration record.
     * @returns {Object} {
     *     accountSid, authToken, authTokenSecretId, apiKeySid, apiSecretId,
     *     twimlAppSid, phoneNumber, intelServiceSid, active
     * }
     *
     * Notes on the auth-token fields:
     *   - `authToken` is the legacy raw CLOBTEXT (pre-Setup-Wizard-v2 installs).
     *   - `authTokenSecretId` is the new NetSuite Secret script ID set by the
     *     wizard. When populated, runtime auth should prefer this over the raw
     *     value — refactor handled in U4 (`buildAuthHeader` N/secrets migration).
     *     U1 ships the schema; the runtime path still reads `authToken` until U4.
     *
     * `active` defaults to false. Phone-button UE gates on this in U8 — until
     * the wizard flips it, the phone icon stays hidden on fresh customer
     * installs. Back-compat: U8 treats unset+populated-config as true so
     * existing installs don't lose the icon at deploy time.
     *
     * @throws {Error} if no active config record exists
     */
    const loadConfig = () => {
        const results = search.create({
            type: 'customrecord_ctc_config',
            filters: [['isinactive', 'is', 'F']],
            columns: [
                'custrecord_ctc_account_sid',
                'custrecord_ctc_auth_token',
                'custrecord_ctc_auth_token_id',
                'custrecord_ctc_api_key_sid',
                'custrecord_ctc_api_secret_id',
                'custrecord_ctc_twiml_app_sid',
                'custrecord_ctc_phone_number',
                'custrecord_ctc_intel_service_sid',
                'custrecord_ctc_active'
            ]
        }).run().getRange({ start: 0, end: 1 });

        if (!results.length) {
            throw new Error('CTC config record not found or inactive');
        }

        const r = results[0];
        return {
            accountSid:        r.getValue('custrecord_ctc_account_sid'),
            authToken:         r.getValue('custrecord_ctc_auth_token'),
            authTokenSecretId: r.getValue('custrecord_ctc_auth_token_id'),
            apiKeySid:         r.getValue('custrecord_ctc_api_key_sid'),
            apiSecretId:       r.getValue('custrecord_ctc_api_secret_id'),
            twimlAppSid:       r.getValue('custrecord_ctc_twiml_app_sid'),
            phoneNumber:       r.getValue('custrecord_ctc_phone_number'),
            intelServiceSid:   r.getValue('custrecord_ctc_intel_service_sid'),
            active:            r.getValue('custrecord_ctc_active') === true
                            || r.getValue('custrecord_ctc_active') === 'T'
        };
    };

    /**
     * Build a Twilio Basic Auth header from Account SID + Auth Token.
     * @param {string} accountSid
     * @param {string} authToken
     * @returns {string} "Basic <base64>"
     */
    const buildAuthHeader = (accountSid, authToken) => {
        const encoded = encode.convert({
            string: accountSid + ':' + authToken,
            inputEncoding: encode.Encoding.UTF_8,
            outputEncoding: encode.Encoding.BASE_64
        });
        return 'Basic ' + encoded;
    };

    return { loadConfig, buildAuthHeader };
});
