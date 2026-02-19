/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @NModuleScope SameAccount
 *
 * Generates Twilio Access Tokens for the Voice SDK.
 * Called by the Suitelet softphone UI via same-origin request.
 */
// eslint-disable-next-line suitescript/no-log-module
define(['N/search', 'N/runtime', 'N/log', 'N/record', './lib/ctc_twilio_jwt'], (search, runtime, log, record, twilioJwt) => {

    /**
     * Load CTC configuration from the singleton config record.
     * @returns {Object} Config values
     * @throws {Error} If no active config record exists
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
     * POST handler — routes to token generation or call logging based on action.
     * @param {Object} requestBody
     * @returns {Object}
     */
    const post = (requestBody) => {
        const body = requestBody || {};

        if (body.action === 'logCall') {
            return logCall(body);
        }

        return generateToken(body);
    };

    /**
     * Generate a Twilio Access Token.
     * @param {Object} body
     * @returns {Object} { token, phoneNumber } or { error }
     */
    const generateToken = (body) => {
        try {
            const config = loadConfig();
            const identity = body.employeeId
                ? String(body.employeeId)
                : String(runtime.getCurrentUser().id);

            const token = twilioJwt.generateAccessToken({
                accountSid:  config.accountSid,
                apiKeySid:   config.apiKeySid,
                apiSecretId: config.apiSecretId,
                twimlAppSid: config.twimlAppSid,
                identity:    identity
            });

            return { token: token, phoneNumber: config.phoneNumber };
        } catch (e) {
            log.error({ title: 'CTC Token Generation Failed', details: e.message || e });
            return { error: 'Token generation failed' };
        }
    };

    /**
     * Create a Phone Call record immediately after call ends.
     * @param {Object} body
     * @param {string} body.callSid - Twilio Call SID
     * @param {string} body.entityId - Customer/Contact/Lead internal ID
     * @param {string} body.entityType - Record type (customer, contact, lead)
     * @param {string} [body.contactId] - Contact internal ID (if contact selected)
     * @param {string} body.phone - Dialed phone number
     * @param {number} body.duration - Call duration in seconds
     * @returns {Object} { success, recordId } or { error }
     */
    const logCall = (body) => {
        try {
            const phoneCall = record.create({ type: record.Type.PHONE_CALL, isDynamic: true });

            phoneCall.setValue({ fieldId: 'title', value: 'Call to ' + (body.phone || 'unknown') });
            phoneCall.setValue({ fieldId: 'status', value: 'COMPLETE' });
            phoneCall.setValue({ fieldId: 'phone', value: body.phone || '' });
            phoneCall.setValue({ fieldId: 'custevent_ctc_call_sid', value: body.callSid || '' });
            phoneCall.setValue({ fieldId: 'custevent_ctc_duration', value: parseInt(body.duration, 10) || 0 });
            phoneCall.setValue({ fieldId: 'custevent_ctc_processed', value: false });

            if (body.entityId && body.entityType !== 'contact') {
                phoneCall.setValue({ fieldId: 'company', value: body.entityId });
            }
            if (body.contactId) {
                phoneCall.setValue({ fieldId: 'contact', value: body.contactId });
            }

            const recordId = phoneCall.save();
            return { success: true, recordId: recordId };
        } catch (e) {
            log.error({ title: 'CTC Log Call Failed', details: e.message || e });
            return { error: 'Failed to log call' };
        }
    };

    return { post };
});
