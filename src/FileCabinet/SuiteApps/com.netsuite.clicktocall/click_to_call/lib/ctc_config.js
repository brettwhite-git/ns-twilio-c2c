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
     * @returns {Object} { accountSid, authToken, apiKeySid, apiSecretId,
     *                     twimlAppSid, phoneNumber, intelServiceSid }
     * @throws {Error} if no active config record exists
     */
    const loadConfig = () => {
        const results = search.create({
            type: 'customrecord_ctc_config',
            filters: [['isinactive', 'is', 'F']],
            columns: [
                'custrecord_ctc_account_sid',
                'custrecord_ctc_auth_token',
                'custrecord_ctc_api_key_sid',
                'custrecord_ctc_api_secret_id',
                'custrecord_ctc_twiml_app_sid',
                'custrecord_ctc_phone_number',
                'custrecord_ctc_intel_service_sid'
            ]
        }).run().getRange({ start: 0, end: 1 });

        if (!results.length) {
            throw new Error('CTC config record not found or inactive');
        }

        const r = results[0];
        return {
            accountSid:      r.getValue('custrecord_ctc_account_sid'),
            authToken:       r.getValue('custrecord_ctc_auth_token'),
            apiKeySid:       r.getValue('custrecord_ctc_api_key_sid'),
            apiSecretId:     r.getValue('custrecord_ctc_api_secret_id'),
            twimlAppSid:     r.getValue('custrecord_ctc_twiml_app_sid'),
            phoneNumber:     r.getValue('custrecord_ctc_phone_number'),
            intelServiceSid: r.getValue('custrecord_ctc_intel_service_sid')
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
