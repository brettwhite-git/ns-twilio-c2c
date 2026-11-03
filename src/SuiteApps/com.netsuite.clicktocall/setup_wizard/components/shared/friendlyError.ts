/**
 * friendlyError — one place that turns a wizard API error code
 * (ctc_sl_wizard_api.js `error` values such as `preflight_failed`,
 * `config_not_found`, `missing_*`, `invalid_format_*`) into a plain
 * sentence for the admin. Text that is already a sentence (a Twilio
 * message, "Network: …") passes through unchanged.
 */

const FIELD_LABELS: Record<string, string> = {
    accountSid: 'Account SID',
    apiKeySid: 'API Key SID',
    apiSecretId: 'API Key Secret script ID',
    api_secret_id: 'API Key Secret script ID',
    twimlAppSid: 'TwiML Application SID',
    intelServiceSid: 'Intelligence service SID',
    phoneNumber: 'phone number',
    phone_number: 'phone number',
    assignments: 'rep assignments'
};

const FORMAT_HINTS: Record<string, string> = {
    accountSid: 'AC followed by 32 letters or digits',
    apiKeySid: 'SK followed by 32 letters or digits',
    apiSecretId: 'custsecret_ followed by letters, digits or _',
    twimlAppSid: 'AP followed by 32 letters or digits',
    intelServiceSid: 'GA followed by 32 letters or digits'
};

const MESSAGES: Record<string, string> = {
    preflight_failed: 'Some preflight checks failed. Fix the checks listed, then try again.',
    config_not_found: 'The Click-to-Call configuration record was not found. Run the setup wizard from Step 1.',
    forbidden: 'Only the Administrator role can change Click-to-Call settings.',
    method_not_allowed: 'The server refused the request. Reload the page and try again.',
    unknown_action: 'The server does not know this request. Reload the page to get the latest version.',
    internal_error: 'The server had an unexpected error. See the execution log of the CTC Wizard API script.',
    save_failed: 'The save did not complete. Try again.',
    outbound_published: 'Unpublish the recording notice first, then change the TwiML App.',
    nothing_to_save: 'Nothing to save.',
    config_active: 'Click-to-Call is active, so the setup wizard cannot change settings. Make the change in the console, or deactivate first.',
    activate_failed: 'Click-to-Call could not change its active setting. Try again.',
    governance_limit: 'NetSuite stopped the save before it finished (usage limit). Save again to finish.',
    payload_too_large: 'Too many phone numbers in one save. Save fewer numbers at a time.',
    load_assignments_failed: 'The rep assignments did not load.',
    load_routes_failed: 'The inbound routing table did not load.',
    connection_test_failed: 'The connection test failed, so nothing was saved. The old values are still in use.',
    EMPTY_SECRET_OR_INVALID: 'Twilio rejected the credentials. Check the API Key SID and the secret value in NetSuite API Secrets.',
    NETWORK_ERROR: 'NetSuite could not reach Twilio. Try again.'
};

/** A plain sentence for `raw` (an error code or a message). */
export const friendlyError = (raw: string | null | undefined): string => {
    const text = String(raw == null ? '' : raw).trim();
    if (!text) return 'Something went wrong. Try again.';
    if (MESSAGES[text]) return MESSAGES[text];

    const missing = /^missing_([A-Za-z_]+)$/.exec(text);
    if (missing) {
        const label = FIELD_LABELS[missing[1]] || missing[1].replace(/_/g, ' ');
        return 'Enter the ' + label + '.';
    }
    const format = /^invalid_format_([A-Za-z_]+)$/.exec(text);
    if (format) {
        const field = format[1];
        const label = FIELD_LABELS[field] || field.replace(/_/g, ' ');
        const hint = FORMAT_HINTS[field];
        return 'The ' + label + ' does not look right' +
            (hint ? ' (expected ' + hint + ').' : '.');
    }
    // Any other bare code (no spaces, lower_snake or UPPER_SNAKE).
    if (/^[A-Za-z0-9_]+$/.test(text) && text.indexOf('_') >= 0) {
        return 'The request failed (' + text + '). Try again.';
    }
    return text;
};

export default friendlyError;
