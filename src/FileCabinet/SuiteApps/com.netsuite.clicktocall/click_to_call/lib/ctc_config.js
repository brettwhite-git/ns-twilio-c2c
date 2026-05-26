// @ts-check
/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Shared CTC configuration loader. Single source of truth so RESTlet /
 * Scheduled Script / Suitelet / future SMS action all read from the same
 * config record with the same field set.
 *
 * Phase 2 U10: the Auth Token path was removed entirely. All Twilio REST
 * Basic Auth now flows through `lib/ctc_twilio_admin.js:buildSecureAuthHeader`
 * which uses `N/https.createSecureString` with the `{custsecret_*}` placeholder
 * pointing at `cfg.apiSecretId`. The script never sees the cleartext secret
 * value — NetSuite's HTTP runtime expands the placeholder at the socket
 * write boundary.
 */
define(['N/search'], (search) => {

    /**
     * Load the singleton CTC configuration record.
     * @returns {Object} {
     *     accountSid, apiKeySid, apiSecretId,
     *     twimlAppSid, phoneNumber, intelServiceSid, active
     * }
     *
     * `active` defaults to false. Phone-button UE gates on this in U9 — until
     * the wizard flips it, the phone icon stays hidden on fresh customer
     * installs. Back-compat: U9 treats unset+populated-config as true so
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
            apiKeySid:         r.getValue('custrecord_ctc_api_key_sid'),
            apiSecretId:       r.getValue('custrecord_ctc_api_secret_id'),
            twimlAppSid:       r.getValue('custrecord_ctc_twiml_app_sid'),
            phoneNumber:       r.getValue('custrecord_ctc_phone_number'),
            intelServiceSid:   r.getValue('custrecord_ctc_intel_service_sid'),
            active:            r.getValue('custrecord_ctc_active') === true
                            || r.getValue('custrecord_ctc_active') === 'T'
        };
    };

    return { loadConfig };
});
