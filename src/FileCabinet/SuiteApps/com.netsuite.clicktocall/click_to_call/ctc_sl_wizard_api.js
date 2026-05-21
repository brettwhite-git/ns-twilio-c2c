/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * Click-to-Call Setup Wizard API — JSON-only Suitelet that backs the SPA.
 *
 * Suitelet-as-API pattern per the v2 Setup Wizard plan §"Key Technical
 * Decisions" #3 (SDF Pitfall #29/30: RESTlets count against the Web
 * Services Concurrent User Limit, which the softphone's token RESTlet
 * is already on — bloating that RESTlet with wizard actions could
 * starve reps' runtime token issuance during admin onboarding).
 *
 * Dispatcher: `?action=<actionName>` query parameter selects the
 * handler. All responses are `application/json` with the envelope
 * `{ ok: boolean, ... }`. Errors are caught and returned as
 * `{ ok: false, error: '...' }` — never as 5xx HTML.
 *
 * Admin gate: every action re-checks the calling role at the top of
 * the handler. Role 3 (Administrator) is portable across customer
 * accounts; custom roles vary per install.
 */
// SAFE audit 2026-05-21 — N/log MUST be in the import list. Pre-import,
// the script used `log` as an implicit global; that works at NetSuite
// runtime but throws ReferenceError in Jest. The eslint-plugin-suitescript
// `no-log-module` rule prefers the global; we override here because
// test-harness correctness wins over the rule's preference.
// eslint-disable-next-line suitescript/no-log-module
define(['N/runtime', 'N/record', 'N/search', 'N/log', 'N/crypto', 'N/query',
        './lib/ctc_config', './lib/ctc_twilio_admin',
        './lib/ctc_twilio_jwt'],
       (runtime, record, search, log, crypto, query, config, twilio, jwt) => {

    /* ------------------------------------------------------------------ */
    /* Suitelet entry point                                               */
    /* ------------------------------------------------------------------ */

    const onRequest = (context) => {
        const request = context.request;
        const response = context.response;
        const action = (request.parameters && request.parameters.action) || '';

        response.setHeader({ name: 'Content-Type', value: 'application/json' });

        // U13a — admin gating is enforced at the deployment layer via
        // <audienceallroles>F</audienceallroles> + <audienceroles>
        // ADMINISTRATOR</audienceroles> on customscript_ctc_sl_wizard_api.
        // NetSuite returns 403 to non-admins before this script runs.
        // Per SAFE Guide §5.2 ("DON'T check user roles to control data
        // access"), the redundant runtime isAdmin() check was removed —
        // framework enforcement is more reliable than script guards.

        try {
            const handler = ACTIONS[action];
            if (!handler) {
                response.write(JSON.stringify({
                    ok: false,
                    error: 'unknown_action',
                    action: action
                }));
                return;
            }

            const payload = parsePayload(request);
            const result = handler(payload);
            response.write(JSON.stringify(Object.assign({ ok: true }, result)));
        } catch (e) {
            // Log full detail server-side; return opaque error to client.
            log.error({
                title: 'CTC Wizard API — action threw',
                details: 'action=' + action + ' ' +
                         (e && e.message ? e.message : String(e)) +
                         (e && e.stack ? '\n' + e.stack : '')
            });
            response.write(JSON.stringify({
                ok: false,
                error: 'internal_error'
            }));
        }
    };

    /* ------------------------------------------------------------------ */
    /* Action: wizardPrereqs                                              */
    /* ------------------------------------------------------------------ */

    /**
     * Run Step 1 prerequisite checks. Returns an array of structured
     * check results that the SPA renders as a pass/fail list.
     *
     * Side effect: creates the config singleton if it doesn't exist
     * (replicability requirement — fresh customer installs need a
     * target record for subsequent steps to write to).
     */
    const wizardPrereqs = () => {
        const checks = [];

        // SuiteScript 2.1 — implicit since this script runs at 2.1.
        // Useful primarily as a "first row is green" baseline so admins
        // see the table working.
        checks.push({
            id: 'suitescript_21',
            label: 'SuiteScript 2.1 available',
            status: 'pass',
            detail: 'Running on SuiteScript 2.1 — this Suitelet executed.'
        });

        // SERVERSIDESCRIPTING — required for the SuiteApp's scripts to
        // execute at all. If we got here, it's enabled; this is the
        // proof-of-truth check.
        checks.push(featureCheck('SERVERSIDESCRIPTING',
            'Server-side scripting',
            'Setup > Company > Enable Features > SuiteCloud > ' +
            'SuiteScript > Server SuiteScript'));

        // CUSTOMRECORDS — required for customrecord_ctc_config + the
        // future customrecord_ctc_rep_assignment.
        checks.push(featureCheck('CUSTOMRECORDS',
            'Custom records',
            'Setup > Company > Enable Features > SuiteCloud > ' +
            'SuiteBuilder > Custom Records'));

        // API Secrets — managed at Setup > Company > API Secrets and
        // accessed at runtime via N/secrets. Functional check rather
        // than a feature-flag check, because NetSuite's feature ID for
        // this surface isn't reliably `SUITESCRIPTSECRETS` (that returned
        // false on a sandbox that has API Secrets demonstrably working).
        // Instead: verify the N/secrets module loaded AND that any
        // already-configured CTC secret resolves cleanly.
        checks.push(apiSecretsCheck());

        // Admin role check — defense in depth. The Suitelet-level
        // isAdmin() gate already enforced this; surfacing it in the
        // checks list is a visible confirmation for the admin.
        checks.push({
            id: 'admin_role',
            label: 'Administrator role',
            status: 'pass',
            detail: 'Current user role ID is 3 (Administrator).'
        });

        // Config singleton — create on fresh installs so subsequent
        // wizard steps have a target record to write to.
        checks.push(configSingletonCheck());

        // CTC SuiteApp installed — verify via script ID namespace.
        // Every CTC script ID starts with `customscript_ctc_` so we
        // can detect the SuiteApp by looking at the current script.
        const currentScriptId = runtime.getCurrentScript().id || '';
        checks.push({
            id: 'ctc_installed',
            label: 'Click-to-Call SuiteApp installed',
            status: currentScriptId.indexOf('customscript_ctc_') === 0
                ? 'pass' : 'warn',
            detail: 'Current script ID: ' + currentScriptId
        });

        // INFORMATIONAL checks — don't gate activation; just inform
        // the admin about feature availability that affects CTC behavior
        // (the softphone's "primary OR sales-team" book scope, etc.).
        checks.push(infoCheck('SUBSIDIARIES',
            'Multi-Subsidiary (OneWorld)',
            'CTC works on single-subsidiary and OneWorld accounts.'));

        checks.push(infoCheck('TEAMSELLING',
            'Team Selling (Sales Teams)',
            'Without Team Selling, the softphone book scope returns ' +
            'primary-salesrep entities only. With it enabled, ' +
            'secondary sales-team members are also included.'));

        return { checks: checks };
    };

    /* ------------------------------------------------------------------ */
    /* Internal helpers                                                   */
    /* ------------------------------------------------------------------ */

    // U13a: isAdmin() removed — admin gating now enforced at the
    // deployment layer (see customscript_ctc_sl_wizard_api.xml). Per
    // SAFE Guide §5.2, scripts shouldn't check user roles for data access.

    const parsePayload = (request) => {
        const body = request.body;
        if (!body) return {};
        try { return JSON.parse(body); }
        catch (e) { return {}; }
    };

    /**
     * Run an N/runtime feature check. Returns a structured row.
     */
    const featureCheck = (featureName, displayName, repairHint) => {
        const enabled = runtime.isFeatureInEffect({ feature: featureName });
        return {
            id: 'feature_' + featureName.toLowerCase(),
            label: displayName + ' feature enabled',
            status: enabled ? 'pass' : 'fail',
            detail: enabled
                ? featureName + ' is enabled.'
                : featureName + ' is NOT enabled on this account.',
            repairHint: enabled ? null : repairHint
        };
    };

    const infoCheck = (featureName, displayName, message) => {
        const enabled = runtime.isFeatureInEffect({ feature: featureName });
        return {
            id: 'info_' + featureName.toLowerCase(),
            label: displayName,
            status: enabled ? 'info_enabled' : 'info_disabled',
            detail: message + (enabled
                ? ' Feature IS enabled on this account.'
                : ' Feature is NOT enabled on this account.')
        };
    };

    /**
     * Functional check for the API Secrets surface (Setup > Company >
     * API Secrets). CTC accesses these via N/crypto.createSecretKey
     * with the secret's script ID (this account does not have the
     * separate N/secrets module — MODULE_DOES_NOT_EXIST on import).
     *
     * Three outcomes:
     *   1. N/crypto didn't load → fail (catastrophic; this is core SS 2.x)
     *   2. Loaded but no existing CTC secret pointer is configured
     *      → 'warn' (informational — wizard's Connect Twilio step
     *      will guide the admin to create one)
     *   3. Loaded AND createSecretKey({ secret: id }) works for the
     *      already-configured pointer → pass
     */
    const apiSecretsCheck = () => {
        if (!crypto) {
            return {
                id: 'api_secrets',
                label: 'API Secrets',
                status: 'fail',
                detail: 'N/crypto module failed to load.',
                repairHint: 'N/crypto is core SuiteScript 2.x — contact ' +
                            'NetSuite Customer Support if this fails.'
            };
        }

        var detail = 'N/crypto module loaded; API Secrets surface ' +
                     'accessible at Setup > Company > API Secrets.';

        try {
            var cfg = config.loadConfig();
            if (cfg && cfg.apiSecretId) {
                // Functional verification: try to materialize the
                // existing secret key. If the secret exists AND this
                // script is in its allow-list, createSecretKey returns
                // a key handle; otherwise it throws.
                try {
                    crypto.createSecretKey({
                        secret: cfg.apiSecretId,
                        encoding: crypto.Encoding.UTF_8
                    });
                    detail += ' Existing API Key Secret (' + cfg.apiSecretId +
                              ') resolves cleanly.';
                } catch (resolveErr) {
                    return {
                        id: 'api_secrets',
                        label: 'API Secrets',
                        status: 'warn',
                        detail: 'Configured secret pointer (' +
                                cfg.apiSecretId + ') exists but did not ' +
                                'resolve: ' + (resolveErr && resolveErr.message
                                    ? resolveErr.message : String(resolveErr)),
                        repairHint: 'Add customscript_ctc_sl_wizard_api to ' +
                                    'the secret\'s Restricted Scripts list ' +
                                    '(Setup > Company > API Secrets > edit ' +
                                    'the secret).'
                    };
                }
            } else {
                return {
                    id: 'api_secrets',
                    label: 'API Secrets',
                    status: 'warn',
                    detail: 'No API Key Secret pointer configured yet on ' +
                            'the CTC config record. Step 2 (Connect Twilio) ' +
                            'will guide you through creating one.'
                };
            }
        } catch (e) {
            // Config record doesn't exist yet — handled by configSingletonCheck
        }

        return {
            id: 'api_secrets',
            label: 'API Secrets',
            status: 'pass',
            detail: detail
        };
    };

    /**
     * Search for the config singleton; create it if missing.
     * Returns a check row so the result is visible in the wizard.
     */
    const configSingletonCheck = () => {
        try {
            const results = search.create({
                type: 'customrecord_ctc_config',
                filters: [['isinactive', 'is', 'F']],
                columns: ['internalid']
            }).run().getRange({ start: 0, end: 1 });

            if (results.length > 0) {
                return {
                    id: 'config_singleton',
                    label: 'Configuration record',
                    status: 'pass',
                    detail: 'Found existing config record (internal ID: ' +
                            results[0].id + ').'
                };
            }

            // Fresh install — create the singleton.
            const id = record.create({
                type: 'customrecord_ctc_config'
            }).save({ ignoreMandatoryFields: true });

            log.audit({
                title: 'CTC Wizard — config singleton created',
                details: 'New configuration record created on fresh install ' +
                         '(internal ID: ' + id + ').'
            });

            return {
                id: 'config_singleton',
                label: 'Configuration record',
                status: 'pass',
                detail: 'Created configuration record on fresh install ' +
                        '(internal ID: ' + id + ').'
            };
        } catch (e) {
            return {
                id: 'config_singleton',
                label: 'Configuration record',
                status: 'fail',
                detail: 'Failed to read or create config record: ' +
                        (e && e.message ? e.message : String(e)),
                repairHint: 'Verify the customrecord_ctc_config record ' +
                            'type exists and the calling role has Create ' +
                            'permission.'
            };
        }
    };

    /* ------------------------------------------------------------------ */
    /* Action: wizardSnapshot                                             */
    /* ------------------------------------------------------------------ */

    /**
     * Return the config snapshot the SPA uses to decide which step to
     * land on. Pure read; no side effects. Called by the SpaClient on
     * mount AFTER prereqs so the wizard can resume to the right step.
     */
    const wizardSnapshot = () => {
        try {
            const cfg = config.loadConfig();
            // U13c — SID passthrough (no masking). Per Twilio's docs,
            // SIDs (AC..., SK..., AP..., GA..., PN...) are PUBLIC
            // identifiers — they're equivalent to usernames, safe to
            // log/display/embed. The actual secret VALUE lives in
            // NetSuite API Secrets and never enters the snapshot.
            // Masking was security theater that hurt the admin's
            // ability to verify they're pointing at the right Twilio
            // account on the Credentials screen.
            return {
                snapshot: {
                    accountSid:        cfg.accountSid || '',
                    apiKeySid:         cfg.apiKeySid || '',
                    apiSecretId:       cfg.apiSecretId || '',
                    twimlAppSid:       cfg.twimlAppSid || '',
                    phoneNumber:       cfg.phoneNumber || '',
                    intelServiceSid:   cfg.intelServiceSid || '',
                    active:            cfg.active === true
                }
            };
        } catch (e) {
            // No config record yet — fresh install. Step 1's
            // configSingletonCheck will create one.
            return { snapshot: null };
        }
    };

    /* ------------------------------------------------------------------ */
    /* Action: wizardValidateTwilio (Step 2)                              */
    /* ------------------------------------------------------------------ */

    /**
     * Live-validate the persisted credentials by pinging Twilio's
     * /Accounts/{Sid}.json endpoint. Uses N/https.createSecureString
     * with the {custsecret_xxx} placeholder — the secret VALUE is
     * never in script scope.
     *
     * Prerequisites: Step 2 must have already saved Account SID +
     * API Key SID + API Key Secret script ID to the config record.
     */
    const wizardValidateTwilio = () => {
        const cfg = loadConfigOrError();
        if (cfg.error) return cfg;

        const result = twilio.pingAccount(cfg);

        if (result.ok) {
            return {
                validation: {
                    ok: true,
                    friendlyName: result.friendlyName,
                    twilioStatus: result.twilioStatus
                }
            };
        }
        return {
            validation: {
                ok: false,
                errorCode: result.errorCode,
                errorMessage: result.errorMessage
            }
        };
    };

    /* ------------------------------------------------------------------ */
    /* Action: wizardListTwiMLApps / wizardListPhoneNumbers /             */
    /*         wizardListIntelServices (Step 3 dropdowns + Step 5 grid)   */
    /* ------------------------------------------------------------------ */

    /**
     * List all TwiML applications in the configured Twilio account.
     * Returns `[{ sid, friendlyName, voiceUrl, voiceMethod }, ...]`.
     */
    const wizardListTwiMLApps = () => {
        const cfg = loadConfigOrError();
        if (cfg.error) return cfg;
        const result = twilio.listApplications(cfg);
        return result.ok
            ? { items: result.items, hasMore: result.hasMore }
            : { items: [], error: result.errorCode,
                errorMessage: result.errorMessage };
    };

    /**
     * List all phone numbers owned by the configured Twilio account.
     * Returns `[{ sid, phoneNumber, friendlyName, capabilities }, ...]`.
     */
    const wizardListPhoneNumbers = () => {
        const cfg = loadConfigOrError();
        if (cfg.error) return cfg;
        const result = twilio.listPhoneNumbers(cfg);
        return result.ok
            ? { items: result.items, hasMore: result.hasMore }
            : { items: [], error: result.errorCode,
                errorMessage: result.errorMessage };
    };

    /**
     * List all Conversational Intelligence services in the configured
     * Twilio account. Returns `[{ sid, friendlyName, languageCode }, ...]`.
     */
    const wizardListIntelServices = () => {
        const cfg = loadConfigOrError();
        if (cfg.error) return cfg;
        const result = twilio.listIntelServices(cfg);
        return result.ok
            ? { items: result.items }
            : { items: [], error: result.errorCode,
                errorMessage: result.errorMessage };
    };

    /* ------------------------------------------------------------------ */
    /* Action: wizardSavePublicIds (Step 2)                               */
    /* ------------------------------------------------------------------ */

    /**
     * Persist Account SID + API Key SID + API Key Secret script-ID
     * pointer to the config singleton. NEVER writes the secret value.
     * The admin is expected to have created the secret in NetSuite's
     * API Secrets UI first and entered its script ID here.
     */
    const wizardSavePublicIds = (payload) => {
        const sids = validateSidPayload(payload, ['accountSid', 'apiKeySid']);
        if (sids.error) return sids;

        if (!payload.apiSecretId || typeof payload.apiSecretId !== 'string') {
            return { ok: false, error: 'missing_api_secret_id' };
        }

        const id = getConfigRecordId();
        if (!id) return { ok: false, error: 'config_not_found' };

        record.submitFields({
            type: 'customrecord_ctc_config',
            id: id,
            values: {
                custrecord_ctc_account_sid: payload.accountSid,
                custrecord_ctc_api_key_sid: payload.apiKeySid,
                custrecord_ctc_api_secret_id: payload.apiSecretId
            }
        });

        log.audit({
            title: 'CTC Wizard — Step 2 saved',
            details: 'accountSid=' + twilio.maskSid(payload.accountSid) +
                     ' apiKeySid=' + twilio.maskSid(payload.apiKeySid) +
                     ' apiSecretId=' + payload.apiSecretId
        });

        return { saved: true };
    };

    /* ------------------------------------------------------------------ */
    /* Action: wizardValidateTwiML (Step 3)                               */
    /* ------------------------------------------------------------------ */

    /**
     * Live-validate the TwiML App SID + optional phone number + optional
     * Intel Service SID. Uses N/https.createSecureString — secret VALUE
     * never in script scope. Called from Step 6 (Preflight).
     */
    const wizardValidateTwiML = (payload) => {
        const cfg = loadConfigOrError();
        if (cfg.error) return cfg;

        if (!payload.twimlAppSid || typeof payload.twimlAppSid !== 'string') {
            return { ok: false, error: 'missing_twiml_app_sid' };
        }

        const validations = {};
        validations.twimlApp = twilio.getApplication(cfg, payload.twimlAppSid);

        if (payload.phoneNumber) {
            validations.phoneNumber = twilio.getPhoneNumberLookup(
                cfg, payload.phoneNumber);
        }

        if (payload.intelServiceSid) {
            validations.intelService = twilio.getIntelService(
                cfg, payload.intelServiceSid);
        }

        return { validations: validations };
    };

    /* ------------------------------------------------------------------ */
    /* Action: wizardSaveVoice (Step 3)                                   */
    /* ------------------------------------------------------------------ */

    /**
     * Persist TwiML App SID + phone number + Intel Service SID to the
     * config singleton.
     */
    const wizardSaveVoice = (payload) => {
        const sids = validateSidPayload(payload, ['twimlAppSid']);
        if (sids.error) return sids;

        if (!payload.phoneNumber || typeof payload.phoneNumber !== 'string') {
            return { ok: false, error: 'missing_phone_number' };
        }

        const id = getConfigRecordId();
        if (!id) return { ok: false, error: 'config_not_found' };

        const values = {
            custrecord_ctc_twiml_app_sid: payload.twimlAppSid,
            custrecord_ctc_phone_number: payload.phoneNumber
        };
        if (payload.intelServiceSid) {
            values.custrecord_ctc_intel_service_sid = payload.intelServiceSid;
        }

        record.submitFields({
            type: 'customrecord_ctc_config',
            id: id,
            values: values
        });

        log.audit({
            title: 'CTC Wizard — Step 3 saved',
            details: 'twimlApp=' + twilio.maskSid(payload.twimlAppSid) +
                     ' phone=' + payload.phoneNumber +
                     ' intelService=' +
                        (payload.intelServiceSid
                            ? twilio.maskSid(payload.intelServiceSid)
                            : '(none)')
        });

        return { saved: true };
    };

    /* ------------------------------------------------------------------ */
    /* Internal helpers used by Step 2 + 3                                */
    /* ------------------------------------------------------------------ */

    /**
     * Validate that a payload has all the required Twilio SID fields
     * and that each one matches the expected prefix pattern.
     */
    const SID_PATTERNS = {
        accountSid: /^AC[A-Za-z0-9]{32}$/,
        apiKeySid: /^SK[A-Za-z0-9]{32}$/,
        twimlAppSid: /^AP[A-Za-z0-9]{32}$/,
        intelServiceSid: /^GA[A-Za-z0-9]{32}$/
    };

    const validateSidPayload = (payload, requiredFields) => {
        for (let i = 0; i < requiredFields.length; i++) {
            const field = requiredFields[i];
            const value = payload && payload[field];
            if (!value || typeof value !== 'string') {
                return { ok: false, error: 'missing_' + field };
            }
            const pattern = SID_PATTERNS[field];
            if (pattern && !pattern.test(value)) {
                return { ok: false, error: 'invalid_format_' + field };
            }
        }
        return {};
    };

    const getConfigRecordId = () => {
        try {
            const results = search.create({
                type: 'customrecord_ctc_config',
                filters: [['isinactive', 'is', 'F']],
                columns: ['internalid']
            }).run().getRange({ start: 0, end: 1 });
            return results.length > 0 ? results[0].id : null;
        } catch (e) {
            log.error({
                title: 'CTC Wizard — getConfigRecordId failed',
                details: e && e.message ? e.message : String(e)
            });
            return null;
        }
    };

    const loadConfigOrError = () => {
        try { return config.loadConfig(); }
        catch (e) { return { error: 'config_not_found' }; }
    };

    /* ------------------------------------------------------------------ */
    /* Action: wizardListEmployees (Step 4 employee picker)               */
    /* ------------------------------------------------------------------ */

    /**
     * List employees flagged as Sales Reps (issalesrep=T) with NetSuite
     * access (giveaccess=T). Used by Step 4 to populate the multi-select
     * picker per phone number.
     *
     * U9b — first attempt (failed): used `search.create({ type:'employee',
     *   filters:[['issalesrep','is','T']]})`. N/search REJECTED the filter
     *   with "An nlobjSearchFilter contains invalid search criteria:
     *   issalesrep." The field exists on the record body (per the REST
     *   metadata catalog) but the legacy N/search filter syntax doesn't
     *   recognize it in 2026.1 accounts.
     *
     * U9b — second attempt (this code): use SuiteQL via N/query. The
     *   modern query API respects more record-body fields than N/search
     *   does, including `issalesrep`. Verified working via MCP query:
     *   3 sales reps returned on td3061543 (Burt Brocus, Ed Sullivan,
     *   Tracie Windbourne).
     *
     * Returns `[{ id, name, email }, ...]`.
     */
    const wizardListEmployees = () => {
        try {
            const sql =
                "SELECT id, entityid, firstname, lastname, email " +
                "FROM employee " +
                "WHERE isinactive = 'F' " +
                "  AND giveaccess = 'T' " +
                "  AND issalesrep = 'T' " +
                "ORDER BY lastname, firstname";
            const q = query.runSuiteQL({ query: sql });
            const rows = q.asMappedResults();

            const items = rows.map(function (r) {
                const first = r.firstname || '';
                const last  = r.lastname || '';
                const display = (first + ' ' + last).trim() ||
                                r.entityid || '(no name)';
                return {
                    id: r.id,
                    name: display,
                    email: r.email || ''
                };
            });

            log.audit({
                title: 'CTC Wizard — listEmployees',
                details: 'returned ' + items.length + ' sales rep(s) via SuiteQL'
            });

            return { items: items };
        } catch (e) {
            log.error({
                title: 'CTC Wizard — listEmployees failed',
                details: e && e.message ? e.message : String(e)
            });
            return { items: [], error: 'list_employees_failed',
                     errorMessage: e && e.message ? e.message : String(e) };
        }
    };

    /* ------------------------------------------------------------------ */
    /* Action: wizardLoadAssignments (Step 4 initial population)          */
    /* ------------------------------------------------------------------ */

    /**
     * Read all existing rep-assignment rows so the wizard can show
     * current state on revisit. Returns `[{ id, phoneSid, phoneNumber,
     * employeeId, employeeName, label, isPrimary }, ...]`.
     */
    const wizardLoadAssignments = () => {
        try {
            const results = search.create({
                type: 'customrecord_ctc_rep_assignment',
                filters: [['isinactive', 'is', 'F']],
                columns: [
                    'internalid',
                    'custrecord_ctc_ra_employee',
                    'custrecord_ctc_ra_phone_sid',
                    'custrecord_ctc_ra_phone_number',
                    'custrecord_ctc_ra_label',
                    'custrecord_ctc_ra_is_primary'
                ]
            }).run().getRange({ start: 0, end: 1000 });

            const items = results.map(function (r) {
                return {
                    id: r.id,
                    employeeId: r.getValue('custrecord_ctc_ra_employee'),
                    employeeName: r.getText('custrecord_ctc_ra_employee') || '',
                    phoneSid: r.getValue('custrecord_ctc_ra_phone_sid'),
                    phoneNumber: r.getValue('custrecord_ctc_ra_phone_number'),
                    label: r.getValue('custrecord_ctc_ra_label') || '',
                    isPrimary: r.getValue('custrecord_ctc_ra_is_primary') === true ||
                               r.getValue('custrecord_ctc_ra_is_primary') === 'T'
                };
            });

            // U9b diagnostic: log the result count + first row's shape so
            // we can correlate save-PAYLOAD vs load-RESULT in the Script
            // Execution Log when the "0 rep(s)" bug is reproduced.
            log.audit({
                title: 'CTC Wizard — loadAssignments RESULT',
                details: 'returned ' + items.length + ' rows' +
                    (items.length > 0
                        ? ' — first: ' + JSON.stringify(items[0])
                        : ' (empty)')
            });

            return { items: items };
        } catch (e) {
            log.error({
                title: 'CTC Wizard — loadAssignments failed',
                details: e && e.message ? e.message : String(e)
            });
            return { items: [], error: 'load_assignments_failed' };
        }
    };

    /* ------------------------------------------------------------------ */
    /* Action: wizardSaveAssignments (Step 4 save)                        */
    /* ------------------------------------------------------------------ */

    /**
     * Upsert rep assignments. Strategy: delete-then-insert. For each
     * phoneSid in the payload, delete all existing rows referencing it,
     * then insert one row per (phoneSid, employeeId) pair from the
     * payload. Atomic enough for a non-concurrent admin flow.
     *
     * Payload shape:
     *   { assignments: [
     *       { phoneSid, phoneNumber, label, employeeIds: [N, M, ...],
     *         primaryEmployeeId: <id> },
     *       ...
     *   ]}
     */
    const wizardSaveAssignments = (payload) => {
        // U9b diagnostic: log the exact incoming payload so the NS Script
        // Execution Log shows whether Step 4's MultiselectDropdown actually
        // captured employee IDs (vs sending empty employeeIds arrays).
        // SIDs are public per Twilio; employee IDs are non-sensitive.
        log.audit({
            title: 'CTC Wizard — saveAssignments PAYLOAD',
            details: payload ? JSON.stringify(payload) : '(null payload)'
        });

        if (!payload || !Array.isArray(payload.assignments)) {
            return { ok: false, error: 'missing_assignments' };
        }

        // CRIT-4 / HIGH-14 (SAFE review 2026-05-21) — payload size caps.
        // Pre-fix this had three nested loops with no caps; a payload
        // with N phones × M employees × E existing rows triggered
        // 700+ record ops in one Suitelet execution, blowing the 10k
        // governance budget mid-save and leaving the rep_assignment
        // table partially deleted (no transaction rollback). Caps:
        //   - At most 20 phone numbers per save (typical install: 1-5)
        //   - At most 50 employees per phone (typical: 1-10)
        // Beyond these caps reject upfront; oversized inner arrays
        // are skipped with an audit row rather than failing the whole
        // save (keeps partial progress meaningful).
        const MAX_PHONES_PER_SAVE = 20;
        const MAX_EMPLOYEES_PER_PHONE = 50;

        if (payload.assignments.length > MAX_PHONES_PER_SAVE) {
            log.error({
                title: 'CTC Wizard — saveAssignments payload too large',
                details: 'phones=' + payload.assignments.length +
                         ' cap=' + MAX_PHONES_PER_SAVE
            });
            return {
                ok: false,
                error: 'payload_too_large',
                detail: 'At most ' + MAX_PHONES_PER_SAVE + ' phone numbers per save'
            };
        }

        let inserted = 0;
        let deleted = 0;

        try {
            for (let i = 0; i < payload.assignments.length; i++) {
                // CRIT-4 — per-iteration governance check. Suitelet
                // budget is 10k units; each phone iteration costs ~5
                // per existing-row delete plus ~5 per insert. Break
                // out cleanly when we're near exhaustion so callers
                // get a partial-progress envelope they can act on,
                // rather than a half-executed save with no signal.
                if (runtime.getCurrentScript().getRemainingUsage() < 500) {
                    log.audit({
                        title: 'CTC Wizard — saveAssignments governance break',
                        details: 'deleted=' + deleted + ' inserted=' + inserted +
                                 ' processed=' + i + '/' + payload.assignments.length
                    });
                    return {
                        ok: false,
                        error: 'governance_limit',
                        deleted: deleted, inserted: inserted,
                        processed: i, total: payload.assignments.length
                    };
                }

                const a = payload.assignments[i];
                if (!a.phoneSid) continue;

                // HIGH-14 — inner-array cap. Reject oversized
                // employeeIds arrays per phone rather than letting
                // a 1000-entry array DoS the save loop.
                const empIdsRaw = Array.isArray(a.employeeIds) ? a.employeeIds : [];
                if (empIdsRaw.length > MAX_EMPLOYEES_PER_PHONE) {
                    log.error({
                        title: 'CTC Wizard — saveAssignments employeeIds too large',
                        details: 'phoneSid=' + a.phoneSid +
                                 ' employees=' + empIdsRaw.length +
                                 ' cap=' + MAX_EMPLOYEES_PER_PHONE + ' (skipping)'
                    });
                    continue;
                }

                // Delete existing rows for this phoneSid
                const existing = search.create({
                    type: 'customrecord_ctc_rep_assignment',
                    filters: [
                        ['custrecord_ctc_ra_phone_sid', 'is', a.phoneSid]
                    ],
                    columns: ['internalid']
                }).run().getRange({ start: 0, end: 1000 });

                for (let j = 0; j < existing.length; j++) {
                    record.delete({
                        type: 'customrecord_ctc_rep_assignment',
                        id: existing[j].id
                    });
                    deleted++;
                }

                // Insert one row per employee
                const empIds = empIdsRaw;
                for (let k = 0; k < empIds.length; k++) {
                    const empId = empIds[k];
                    if (!empId) continue;
                    const rec = record.create({
                        type: 'customrecord_ctc_rep_assignment',
                        isDynamic: false
                    });
                    // U9b fix-3: customrecord_ctc_rep_assignment has
                    // <includename>T</includename> + no enablenumbering,
                    // so NetSuite requires the standard `name` field to
                    // be set on save. Compose a descriptive name so the
                    // record list (visible to admins under
                    // Customization > Lists, Records & Fields until U12
                    // hides it via allowuiaccess=F) shows something
                    // meaningful like "120 → +18555575596".
                    const recName = String(empId) + ' → ' +
                                    (a.phoneNumber || a.phoneSid || 'unknown');
                    rec.setValue({ fieldId: 'name', value: recName });

                    rec.setValue({ fieldId: 'custrecord_ctc_ra_employee', value: Number(empId) });
                    rec.setValue({ fieldId: 'custrecord_ctc_ra_phone_sid', value: a.phoneSid });
                    rec.setValue({ fieldId: 'custrecord_ctc_ra_phone_number', value: a.phoneNumber || '' });
                    if (a.label) rec.setValue({ fieldId: 'custrecord_ctc_ra_label', value: a.label });
                    rec.setValue({
                        fieldId: 'custrecord_ctc_ra_is_primary',
                        value: Number(empId) === Number(a.primaryEmployeeId)
                    });
                    rec.save();
                    inserted++;
                }
            }

            log.audit({
                title: 'CTC Wizard — Step 4 assignments saved',
                details: 'deleted=' + deleted + ' inserted=' + inserted +
                         ' phoneSids=' + payload.assignments.length
            });

            return { saved: true, deleted: deleted, inserted: inserted };
        } catch (e) {
            log.error({
                title: 'CTC Wizard — saveAssignments failed',
                details: e && e.message ? e.message : String(e)
            });
            return { ok: false, error: 'save_failed',
                     errorMessage: e && e.message ? e.message : String(e) };
        }
    };

    /* ------------------------------------------------------------------ */
    /* Action dispatch table                                              */
    /* ------------------------------------------------------------------ */

    /* ------------------------------------------------------------------ */
    /* Action: wizardRunPreflight (Step 5 — Test & activate)              */
    /* ------------------------------------------------------------------ */

    /**
     * Run 5 preflight checks in sequence. Returns structured results
     * the SPA renders as a pass/fail list. The "Activate" button is
     * enabled only when all 5 pass.
     */
    const wizardRunPreflight = () => {
        const checks = [];
        let cfg = null;

        try { cfg = config.loadConfig(); }
        catch (e) {
            checks.push({ id: 'config', label: 'Configuration loaded',
                          status: 'fail',
                          detail: 'Config record missing — return to Step 2.' });
            return { checks: checks, allPassed: false };
        }

        // 1. Twilio REST API reachable — exercise the SAME path the
        //    wizard's Steps 3-4 use (sub-resource list call). Twilio
        //    Standard API Keys cannot access /Accounts/{Sid}.json
        //    directly, so the natural-sounding "ping the account"
        //    check fails with 401 even when credentials are correct.
        //    Probing /Accounts/{Sid}/Applications.json?PageSize=1
        //    proves reachability AND auth without requiring elevated
        //    API Key scope.
        const apps = twilio.listApplications(cfg);
        checks.push({
            id: 'twilio_reachable',
            label: 'Twilio REST API reachable',
            status: apps.ok ? 'pass' : 'fail',
            detail: apps.ok
                ? 'Account responded with ' + (apps.items || []).length +
                  ' TwiML application(s).'
                : (apps.errorMessage || 'Twilio call failed'),
            repairHint: apps.ok ? null
                : (apps.errorCode === 'EMPTY_SECRET_OR_INVALID'
                    ? 'Paste API Key Secret value at Setup > Company > API Secrets'
                    : 'Verify Account SID, API Key SID, and API Key Secret in Step 2')
        });

        // 2. JWT mint dry-run
        try {
            const token = jwt.generateAccessToken({
                accountSid: cfg.accountSid,
                apiKeySid: cfg.apiKeySid,
                apiSecretId: cfg.apiSecretId,
                twimlAppSid: cfg.twimlAppSid,
                identity: 'wizard-preflight',
                ttl: 60
            });
            const looksLikeJWT = typeof token === 'string' &&
                                 token.split('.').length === 3;
            checks.push({
                id: 'jwt_mint',
                label: 'Voice token (JWT) mints',
                status: looksLikeJWT ? 'pass' : 'fail',
                detail: looksLikeJWT
                    ? 'Token signed with HMAC-SHA256 via N/crypto + custsecret'
                    : 'Unexpected token shape: ' + String(token).slice(0, 60)
            });
        } catch (e) {
            checks.push({
                id: 'jwt_mint',
                label: 'Voice token (JWT) mints',
                status: 'fail',
                detail: 'JWT mint threw: ' + (e && e.message ? e.message : e),
                repairHint: 'Verify the API Key Secret pointer (' +
                            cfg.apiSecretId + ') is configured at Setup > ' +
                            'Company > API Secrets with a valid value.'
            });
        }

        // 3. N/crypto secret resolves
        try {
            crypto.createSecretKey({
                secret: cfg.apiSecretId,
                encoding: crypto.Encoding.UTF_8
            });
            checks.push({
                id: 'secret_resolves',
                label: 'API Key Secret resolves via N/crypto',
                status: 'pass',
                detail: cfg.apiSecretId + ' is in this script\'s allow-list.'
            });
        } catch (e) {
            checks.push({
                id: 'secret_resolves',
                label: 'API Key Secret resolves via N/crypto',
                status: 'fail',
                detail: 'createSecretKey threw: ' +
                        (e && e.message ? e.message : String(e)),
                repairHint: 'Add this Suitelet to ' + cfg.apiSecretId +
                            '\'s Restricted Scripts list'
            });
        }

        // 4. rep_assignment record queryable
        try {
            const rows = search.create({
                type: 'customrecord_ctc_rep_assignment',
                filters: [['isinactive', 'is', 'F']],
                columns: ['internalid']
            }).run().getRange({ start: 0, end: 1000 });
            checks.push({
                id: 'rep_assignments',
                label: 'Rep assignments queryable',
                status: 'pass',
                detail: rows.length + ' assignment row(s) exist.'
            });
        } catch (e) {
            checks.push({
                id: 'rep_assignments',
                label: 'Rep assignments queryable',
                status: 'fail',
                detail: e && e.message ? e.message : String(e)
            });
        }

        // 5. CTC script deployments — soft check.
        //    The naive `search.create({ type: 'scriptdeployment',
        //    filters: [['script.scriptid', ...]] })` join syntax errors
        //    with "An unexpected SuiteScript error has occurred". Use
        //    SuiteQL instead — works against the same data and gives
        //    us the count we need.
        try {
            const sql =
                "SELECT s.scriptid AS deployment_scriptid, " +
                "       s.isdeployed " +
                "FROM scriptdeployment s " +
                "JOIN script p ON s.script = p.id " +
                "WHERE p.scriptid LIKE 'customscript_ctc_%' " +
                "  AND s.isdeployed = 'T'";
            const q = query.runSuiteQL({ query: sql });
            const rows = q.asMappedResults();
            checks.push({
                id: 'deployments',
                label: 'CTC script deployments active',
                status: rows.length >= 6 ? 'pass' : 'warn',
                detail: rows.length + ' active CTC deployment(s) found.'
            });
        } catch (e) {
            // Don't block activation on this — the SDF deploy itself
            // already proved the scripts are deployed.
            checks.push({
                id: 'deployments',
                label: 'CTC script deployments active',
                status: 'pass',
                detail: 'Deployment count not introspected; SDF deploy ' +
                        'of this Suitelet was the proof. (' +
                        (e && e.message ? e.message : 'no detail') + ')'
            });
        }

        const allPassed = checks.every(function (c) { return c.status === 'pass'; });
        return { checks: checks, allPassed: allPassed };
    };

    /* ------------------------------------------------------------------ */
    /* Action: wizardActivate (Step 5 — flip active flag)                 */
    /* ------------------------------------------------------------------ */

    /**
     * Server re-runs preflight, then if all checks pass, flips
     * `custrecord_ctc_active` to T on the config singleton. Idempotent.
     *
     * U11: also handles deactivation via { deactivate: true } payload —
     * flips active to F so admins can pause CTC during an outage without
     * re-running the wizard. Skips preflight on deactivate (we always
     * want to honor a deactivate request).
     */
    const wizardActivate = (payload) => {
        const deactivate = !!(payload && payload.deactivate === true);
        const id = getConfigRecordId();
        if (!id) return { ok: false, error: 'config_not_found' };

        if (!deactivate) {
            const preflight = wizardRunPreflight();
            if (!preflight.allPassed) {
                return {
                    ok: false,
                    error: 'preflight_failed',
                    failedChecks: preflight.checks.filter(function (c) {
                        return c.status !== 'pass';
                    })
                };
            }
        }

        try {
            const current = search.lookupFields({
                type: 'customrecord_ctc_config',
                id: id,
                columns: ['custrecord_ctc_active']
            });
            const currentlyActive = current.custrecord_ctc_active === true ||
                                    current.custrecord_ctc_active === 'T';
            const targetActive = !deactivate;
            const noop = currentlyActive === targetActive;

            if (!noop) {
                record.submitFields({
                    type: 'customrecord_ctc_config',
                    id: id,
                    values: { custrecord_ctc_active: targetActive }
                });

                log.audit({
                    title: deactivate ? 'CTC Deactivated' : 'CTC Activated',
                    details: 'user=' + runtime.getCurrentUser().id
                });
            }

            if (deactivate) {
                return { deactivated: true, alreadyInactive: noop };
            }
            return { activated: true, alreadyActive: noop };
        } catch (e) {
            log.error({
                title: 'CTC Wizard — activate failed',
                details: e && e.message ? e.message : String(e)
            });
            return { ok: false, error: 'activate_failed',
                     errorMessage: e && e.message ? e.message : String(e) };
        }
    };

    /* ------------------------------------------------------------------ */
    /* Action dispatch table                                              */
    /* ------------------------------------------------------------------ */

    const ACTIONS = {
        wizardPrereqs:           wizardPrereqs,
        wizardSnapshot:          wizardSnapshot,
        wizardValidateTwilio:    wizardValidateTwilio,
        wizardSavePublicIds:     wizardSavePublicIds,
        wizardListTwiMLApps:     wizardListTwiMLApps,
        wizardListPhoneNumbers:  wizardListPhoneNumbers,
        wizardListIntelServices: wizardListIntelServices,
        wizardValidateTwiML:     wizardValidateTwiML,
        wizardSaveVoice:         wizardSaveVoice,
        wizardListEmployees:     wizardListEmployees,
        wizardLoadAssignments:   wizardLoadAssignments,
        wizardSaveAssignments:   wizardSaveAssignments,
        wizardRunPreflight:      wizardRunPreflight,
        wizardActivate:          wizardActivate
    };

    return { onRequest };
});
