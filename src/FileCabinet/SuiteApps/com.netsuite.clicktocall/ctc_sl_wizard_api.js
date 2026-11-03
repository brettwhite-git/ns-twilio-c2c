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
 * accounts; custom roles vary per install. Then POST only: any other
 * method gets `{ ok: false, error: 'method_not_allowed' }`.
 */
// SAFE audit 2026-05-21 — N/log MUST be in the import list. Pre-import,
// the script used `log` as an implicit global; that works at NetSuite
// runtime but throws ReferenceError in Jest. The eslint-plugin-suitescript
// `no-log-module` rule prefers the global; we override here because
// test-harness correctness wins over the rule's preference.
// eslint-disable-next-line suitescript/no-log-module
define(['N/runtime', 'N/record', 'N/search', 'N/log', 'N/crypto', 'N/query',
        './lib/ctc_config', './lib/ctc_twilio_admin',
        './lib/ctc_twilio_jwt', './lib/ctc_inbound_routing', './lib/ctc_outbound_function'],
       (runtime, record, search, log, crypto, query, config, twilio, jwt, routing, outbound) => {

    /* ------------------------------------------------------------------ */
    /* Suitelet entry point                                               */
    /* ------------------------------------------------------------------ */

    const onRequest = (context) => {
        const request = context.request;
        const response = context.response;
        const action = (request.parameters && request.parameters.action) || '';

        response.setHeader({ name: 'Content-Type', value: 'application/json' });

        // U13a-corrected (deploy verification 2026-05-21) — admin gating
        // is enforced at RUNTIME. The original U13a intent was to move
        // gating to the deployment layer via <audienceallroles> +
        // <audienceroles>, but SDF emits "field is not supported and
        // will be ignored" for those fields on scriptdeployment
        // subrecords (no framework-layer audience exists for Suitelets
        // beyond <allroles>T/F</allroles>). Reverted to the dual-layer
        // pattern documented in CLAUDE.md "Multi-Role Support":
        // deployment is reachable to any internal role (allroles=T) and
        // this runtime check is the actual gate. Matches SpaServer.js.
        if (Number(runtime.getCurrentUser().role) !== 3) {
            log.audit({
                title: 'CTC Wizard API — non-admin reached endpoint',
                details: 'role=' + runtime.getCurrentUser().role +
                         ' action=' + action
            });
            response.write(JSON.stringify({ ok: false, error: 'forbidden' }));
            return;
        }

        // POST only (2026-11-01). Several actions write config, publish
        // Twilio routing or create records; a GET (link, image, prefetch)
        // must never run them. The SPA (W/services/wizardApi.ts) only
        // sends core.Ajax.post.
        if (String(request.method || '').toUpperCase() !== 'POST') {
            log.audit({
                title: 'CTC Wizard API — method not allowed',
                details: 'method=' + request.method + ' action=' + action
            });
            response.write(JSON.stringify({ ok: false, error: 'method_not_allowed' }));
            return;
        }

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
            if (stepperRefused(action, payload)) {
                log.audit({
                    title: 'CTC Wizard API — setup step refused (CTC active)',
                    details: 'action=' + action + ' user=' + runtime.getCurrentUser().id
                });
                response.write(JSON.stringify({ ok: false, error: STEPPER_ACTIVE_ERROR }));
                return;
            }
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
    /* Stepper guard: setup steps never change an active config           */
    /* ------------------------------------------------------------------ */

    // The setup stepper (Steps 2-4) runs only while CTC is not active; the
    // console edits an active config with its own actions. The SPA hides
    // the stepper when active; this is the server side of that rule.
    const STEPPER_ACTIVE_ERROR = 'config_active';
    // action -> true when this payload is a stepper save (not a console one).
    const STEPPER_SAVES = {
        // Step 2 only (the console uses wizardSaveCredentials).
        wizardSavePublicIds: () => true,
        // Step 3 sends the full form; the console Voice page sends partial.
        wizardSaveVoice: (p) => !(p && p.partial === true),
        // Step 4 marks its save; the console Phones page does not.
        wizardSaveAssignments: (p) => !!(p && p.stepper === true)
    };

    /**
     * True when `action` is a stepper save and CTC is active. One config
     * search (10 units), only for stepper saves. No config = not refused
     * (the action answers config_not_found itself).
     * @param {string} action
     * @param {Object} payload
     * @returns {boolean}
     */
    const stepperRefused = (action, payload) => {
        const isStepperSave = Object.prototype.hasOwnProperty.call(STEPPER_SAVES, action)
            ? STEPPER_SAVES[action] : null;
        if (!isStepperSave || !isStepperSave(payload)) return false;
        try {
            return config.loadConfig().active === true;
        } catch (e) {
            return false;
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

        // API Secrets — functional N/secrets check. This is the only
        // mandatory feature the admin actually has to set up before
        // proceeding (the wizard cannot create the API Secret for them).
        // SuiteScript 2.1 / SERVERSIDESCRIPTING / CUSTOMRECORDS / admin
        // role / SuiteApp installation are all tautologies (we wouldn't
        // be executing if any of them weren't true) — excluded so the
        // admin's eye lands on the items that actually need attention.
        checks.push(apiSecretsCheck());

        // Config singleton — create on fresh installs so subsequent
        // wizard steps have a target record to write to. Surfaces as
        // a green confirmation row once created.
        checks.push(configSingletonCheck());

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

    // U13a-corrected: isAdmin() is inlined in onRequest above (deploy
    // verification 2026-05-21 showed deployment-layer audience syntax
    // isn't supported at scriptdeployment level — SDF silently drops
    // <audienceroles>). The CLAUDE.md "Multi-Role Support" dual-layer
    // pattern is the right shape here: framework gate is best-effort,
    // runtime gate is the actual enforcement.

    const parsePayload = (request) => {
        const body = request.body;
        if (!body) return {};
        try { return JSON.parse(body); }
        catch (e) { return {}; }
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
    /* Action: wizardSaveVoice (Step 3)                                   */
    /* ------------------------------------------------------------------ */

    /**
     * Persist TwiML App SID + phone number + Intel Service SID to the
     * config singleton.
     *
     * Two shapes:
     *   Step 3 (full form): { twimlAppSid, phoneNumber, intelServiceSid? }
     *     — both twimlAppSid and phoneNumber are required.
     *   Console Voice page (one field): { partial: true, <one field> }
     *     — only the fields present are validated and written, so two
     *     admins editing different fields do not overwrite each other
     *     with a stale snapshot.
     * An empty intelServiceSid keeps the saved value. `clearIntelService:
     * true` clears it (console Voice page, "(none)").
     *
     * Guard (C2-G4): while the outbound recording notice Function is
     * published (or a publish is pending), the TwiML App cannot change —
     * its stored previous Voice URL belongs to the current app, so
     * unpublish would corrupt the new app. Refused with
     * { ok:false, error:'outbound_published', errorMessage }.
     */
    const VOICE_APP_LOCKED_MESSAGE = 'Unpublish the recording notice first ' +
        '(Voice › Outbound recording notice › Unpublish and remove), then change the TwiML App.';

    const wizardSaveVoice = (payload) => {
        const p = payload || {};
        const partial = p.partial === true;
        const values = {};

        if (!partial || p.twimlAppSid !== undefined) {
            const sids = validateSidPayload(p, ['twimlAppSid']);
            if (sids.error) return sids;
            values.custrecord_ctc_twiml_app_sid = p.twimlAppSid;
        }
        if (!partial || p.phoneNumber !== undefined) {
            if (!p.phoneNumber || typeof p.phoneNumber !== 'string') {
                return { ok: false, error: 'missing_phone_number' };
            }
            values.custrecord_ctc_phone_number = p.phoneNumber;
        }
        if (p.clearIntelService === true) {
            values.custrecord_ctc_intel_service_sid = '';
        } else if (p.intelServiceSid) {
            values.custrecord_ctc_intel_service_sid = p.intelServiceSid;
        }
        if (Object.keys(values).length === 0) {
            return { ok: false, error: 'nothing_to_save' };
        }

        let id;
        if (values.custrecord_ctc_twiml_app_sid !== undefined) {
            const cfg = loadOutboundConfigOrError();
            if (cfg.error) return { ok: false, error: cfg.error };
            id = cfg.id;
            const changing = String(cfg.twimlAppSid || '') !== p.twimlAppSid;
            const locked = outbound.isPublished(cfg) || !!cfg.outPrevVoiceUrl || !!cfg.outFnPendingBuild;
            if (changing && locked) {
                log.audit({
                    title: 'CTC Wizard — TwiML App change refused (outbound notice published)',
                    details: 'from=' + twilio.maskSid(cfg.twimlAppSid || '') +
                             ' to=' + twilio.maskSid(p.twimlAppSid)
                });
                return { ok: false, error: 'outbound_published', errorMessage: VOICE_APP_LOCKED_MESSAGE };
            }
        } else {
            id = getConfigRecordId();
        }
        if (!id) return { ok: false, error: 'config_not_found' };

        record.submitFields({
            type: 'customrecord_ctc_config',
            id: id,
            values: values
        });

        const has = (k) => values[k] !== undefined;
        log.audit({
            title: 'CTC Wizard — voice settings saved',
            details: (partial ? 'partial ' : '') +
                     'twimlApp=' + (has('custrecord_ctc_twiml_app_sid')
                         ? twilio.maskSid(p.twimlAppSid) : '(unchanged)') +
                     ' phone=' + (has('custrecord_ctc_phone_number') ? p.phoneNumber : '(unchanged)') +
                     ' intelService=' +
                        (p.clearIntelService === true
                            ? '(cleared)'
                            : p.intelServiceSid
                                ? twilio.maskSid(p.intelServiceSid)
                                : '(unchanged)')
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

    // The outbound actions also need the outbound notice fields.
    const loadOutboundConfigOrError = () => {
        try { return config.loadOutboundConfig(); }
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
     *   does, including `issalesrep`. Verified working via MCP query
     *   (sales reps returned on the development account).
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
    const isChecked = (v) => v === true || v === 'T';

    /**
     * Exactly one primary among the active rows of one number: the first
     * primary by internalid, else the first row. Every other row is set
     * to not primary. Deterministic, so two concurrent savers converge.
     * Cost: one search (10) + 2 per changed row. Returns the rows changed.
     */
    const enforceOnePrimary = (phoneSid) => {
        const rows = search.create({
            type: 'customrecord_ctc_rep_assignment',
            filters: [
                ['custrecord_ctc_ra_phone_sid', 'is', phoneSid],
                'AND',
                ['isinactive', 'is', 'F']
            ],
            columns: [
                search.createColumn({ name: 'internalid', sort: search.Sort.ASC }),
                'custrecord_ctc_ra_is_primary'
            ]
        }).run().getRange({ start: 0, end: 1000 });
        if (rows.length === 0) return 0;

        const firstPrimary = rows.filter((r) => isChecked(r.getValue('custrecord_ctc_ra_is_primary')))[0];
        const keepId = String((firstPrimary || rows[0]).id);
        let changed = 0;
        rows.forEach((r) => {
            const want = String(r.id) === keepId;
            if (isChecked(r.getValue('custrecord_ctc_ra_is_primary')) === want) return;
            record.submitFields({
                type: 'customrecord_ctc_rep_assignment',
                id: r.id,
                values: { custrecord_ctc_ra_is_primary: want }
            });
            changed++;
        });
        if (changed > 0) {
            log.audit({
                title: 'CTC Wizard — primary fixed after concurrent save',
                details: 'phoneSid=' + twilio.maskSid(phoneSid) + ' rows=' + rows.length +
                         ' changed=' + changed + ' primaryRow=' + keepId
            });
        }
        return changed;
    };

    /** Employee ids as positive integers, first occurrence kept, order kept. */
    const uniqueEmployeeIds = (raw) => {
        const out = [];
        (Array.isArray(raw) ? raw : []).forEach((v) => {
            const n = Number(v);
            if (!n || !isFinite(n) || n <= 0 || Math.floor(n) !== n) return;
            if (out.indexOf(n) < 0) out.push(n);
        });
        return out;
    };

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
        // 700+ record ops in one Suitelet execution, blowing the 1,000-unit
        // Suitelet governance budget mid-save and leaving the rep_assignment
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
        let primaryFixes = 0;

        try {
            for (let i = 0; i < payload.assignments.length; i++) {
                // CRIT-4 — per-iteration governance check. Suitelet
                // budget is 1,000 units per request; each phone iteration
                // costs 10 (row search) + 4 per existing-row delete + ~6
                // per insert + 10 (primary re-read) + 2 per primary fix,
                // and the routing republish after the loop needs about
                // 40 + 10 per number. Break
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

                // Insert one row per employee. Exactly one primary per
                // number: primaryEmployeeId when it is one of the reps,
                // else the first rep (inbound routing and the outbound
                // caller ID use the primary).
                const empIds = uniqueEmployeeIds(empIdsRaw);
                const primaryId = empIds.indexOf(Number(a.primaryEmployeeId)) >= 0
                    ? Number(a.primaryEmployeeId)
                    : (empIds.length > 0 ? empIds[0] : null);
                for (let k = 0; k < empIds.length; k++) {
                    const empId = empIds[k];
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
                        value: empId === primaryId
                    });
                    rec.save();
                    inserted++;
                }

                // Two concurrent saves of this number (two admins / tabs)
                // can interleave delete/insert and leave two primaries.
                // Re-read and keep exactly one, by the same rule routing
                // uses (lib/ctc_inbound_routing loadRoutes: first primary
                // by internalid, else the first row), so routing, caller
                // ID and the Rings column agree.
                primaryFixes += enforceOnePrimary(a.phoneSid);
            }

            log.audit({
                title: 'CTC Wizard — Step 4 assignments saved',
                details: 'deleted=' + deleted + ' inserted=' + inserted +
                         ' primaryFixes=' + primaryFixes +
                         ' phoneSids=' + payload.assignments.length
            });

            return { saved: true, deleted: deleted, inserted: inserted,
                     routing: routingAfterAssignmentSave() };
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

    // Scripts that must be on the API Secret's allow-list (Restricted
    // Scripts). NetSuite gives scripts no way to read that list, so the
    // checks can only prove it for this Suitelet and name the others.
    const SECRET_SCRIPTS_TEXT = 'CTC Setup Wizard API, CTC Token Generator (customscript_ctc_rl_token) ' +
        'and CTC Poll Transcripts (customscript_ctc_ss_poll)';

    /**
     * The credential checks shared by preflight and wizardSaveCredentials:
     * 1. Twilio REST API reachable with the key + secret, 2. a voice token
     * (JWT) mints exactly as the token RESTlet mints it (same secret
     * pointer, identity and grants), 3. the API Secret resolves via
     * N/crypto. With opts.transcripts (wizardSaveCredentials): 4. the
     * Intelligence API (intelligence.twilio.com, the host the poller reads
     * transcripts from) accepts the key: proves the secret's allowed
     * domains include it. Each check is
     * { id, label, status: 'pass'|'fail', detail, repairHint? }. Never throws.
     * `cfg` carries accountSid, apiKeySid, apiSecretId, twimlAppSid,
     * inboundEnabled.
     * @param {Object} cfg
     * @param {{transcripts?: boolean}} [opts]
     */
    const credentialChecks = (cfg, opts) => {
        const checks = [];

        // 1. Twilio REST API reachable — exercise the SAME path the
        //    wizard's Steps 3-4 use (sub-resource list call). Twilio
        //    Standard API Keys cannot access /Accounts/{Sid}.json
        //    directly, so the natural-sounding "ping the account"
        //    check fails with 401 even when credentials are correct.
        //    Probing /Accounts/{Sid}/Applications.json?PageSize=1
        //    proves reachability AND auth without requiring elevated
        //    API Key scope.
        let apps;
        try { apps = twilio.listApplications(cfg); }
        catch (e) {
            // A secret id the runtime cannot resolve throws while the
            // auth header is built: report it as an unreachable API.
            apps = { ok: false, errorCode: 'AUTH_HEADER_FAILED',
                     errorMessage: e && e.message ? e.message : String(e) };
        }
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

        // 2. JWT mint dry-run, with the token RESTlet's arguments
        //    (ctc_rl_token generateToken): the session user as identity,
        //    inbound grant from the config.
        try {
            const token = jwt.generateAccessToken({
                accountSid: cfg.accountSid,
                apiKeySid: cfg.apiKeySid,
                apiSecretId: cfg.apiSecretId,
                twimlAppSid: cfg.twimlAppSid,
                identity: String(runtime.getCurrentUser().id),
                incomingAllow: cfg.inboundEnabled === true
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
                detail: cfg.apiSecretId + ' is in this script\'s allow-list. NetSuite does not let ' +
                        'scripts read the allow-list, so check that it also names ' + SECRET_SCRIPTS_TEXT + '.'
            });
        } catch (e) {
            checks.push({
                id: 'secret_resolves',
                label: 'API Key Secret resolves via N/crypto',
                status: 'fail',
                detail: 'createSecretKey threw: ' +
                        (e && e.message ? e.message : String(e)),
                repairHint: 'Add ' + SECRET_SCRIPTS_TEXT + ' to ' + cfg.apiSecretId +
                            '\'s Restricted Scripts list'
            });
        }

        // 4. Transcripts host (save test only: one more Twilio call).
        if (opts && opts.transcripts === true) {
            let intel;
            try { intel = twilio.listIntelServices(cfg); }
            catch (e) {
                intel = { ok: false, errorCode: 'AUTH_HEADER_FAILED',
                          errorMessage: e && e.message ? e.message : String(e) };
            }
            checks.push({
                id: 'intelligence_reachable',
                label: 'Twilio transcripts API reachable',
                status: intel.ok ? 'pass' : 'fail',
                detail: intel.ok
                    ? 'intelligence.twilio.com accepted the key (the host the poller reads transcripts from).'
                    : (intel.errorMessage || 'Twilio call failed'),
                repairHint: intel.ok ? null
                    : 'Add intelligence.twilio.com to ' + cfg.apiSecretId +
                      '\'s allowed domains at Setup > Company > API Secrets'
            });
        }

        return checks;
    };

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

        // 1-3. Twilio REST reachable, JWT mints, secret resolves.
        credentialChecks(cfg).forEach((c) => { checks.push(c); });

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

        // Health "Drift detection" rows (not part of allPassed): the
        // TwiML App Voice URL vs the published outbound Function URL.
        // One Twilio GET (10 units). 'unknown' until the Function is published.
        let drift = { voiceUrl: 'unknown', functionCode: 'unknown' };
        try { drift = outbound.outboundStatus(Object.assign({}, cfg, config.loadOutboundConfig())).drift; }
        catch (e) {
            log.error({ title: 'CTC Wizard — outbound drift check failed',
                        details: e && e.message ? e.message : String(e) });
        }
        return { checks: checks, allPassed: allPassed, drift: drift };
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
    /* Action: wizardSaveCredentials (console Credentials — key rotation) */
    /* ------------------------------------------------------------------ */

    // NetSuite API Secret script ids. The id goes into a {custsecret_...}
    // placeholder, so only these characters are accepted.
    const API_SECRET_ID_RE = /^custsecret_[A-Za-z0-9_]+$/;

    /**
     * Point the config at a new Twilio API key (rotation: a new key has a
     * new SID; its secret lives in a new NetSuite API Secret). Runs the
     * credential checks with the NEW values first; saves only when all
     * pass, so a failed test keeps the old, working values. The secret
     * VALUE never reaches this action.
     *
     * wizardSaveCredentials { apiKeySid, apiSecretId } →
     *   { saved: true, apiKeySid, apiSecretId, checks } |
     *   { ok: false, error: 'missing_*' | 'invalid_format_*' | 'config_not_found' |
     *     'connection_test_failed', checks? }
     */
    const wizardSaveCredentials = (payload) => {
        const apiKeySid = payload && typeof payload.apiKeySid === 'string'
            ? payload.apiKeySid.trim() : '';
        const apiSecretId = payload && typeof payload.apiSecretId === 'string'
            ? payload.apiSecretId.trim() : '';

        const sids = validateSidPayload({ apiKeySid: apiKeySid }, ['apiKeySid']);
        if (sids.error) return sids;
        if (!apiSecretId) return { ok: false, error: 'missing_apiSecretId' };
        if (!API_SECRET_ID_RE.test(apiSecretId)) {
            return { ok: false, error: 'invalid_format_apiSecretId' };
        }

        const cfg = loadConfigOrError();
        if (cfg.error) return { ok: false, error: cfg.error };
        const id = getConfigRecordId();
        if (!id) return { ok: false, error: 'config_not_found' };

        const checks = credentialChecks(Object.assign({}, cfg, {
            apiKeySid: apiKeySid,
            apiSecretId: apiSecretId
        }), { transcripts: true });
        const failed = checks.filter((c) => c.status !== 'pass');
        if (failed.length > 0) {
            log.audit({
                title: 'CTC Wizard — credentials test failed (not saved)',
                details: 'apiKeySid=' + twilio.maskSid(apiKeySid) +
                         ' apiSecretId=' + apiSecretId +
                         ' failed=' + failed.map((c) => c.id).join(',')
            });
            return { ok: false, error: 'connection_test_failed', checks: checks };
        }

        record.submitFields({
            type: 'customrecord_ctc_config',
            id: id,
            values: {
                custrecord_ctc_api_key_sid: apiKeySid,
                custrecord_ctc_api_secret_id: apiSecretId
            }
        });

        log.audit({
            title: 'CTC Wizard — credentials changed',
            details: 'apiKeySid ' + twilio.maskSid(cfg.apiKeySid) + ' → ' +
                     twilio.maskSid(apiKeySid) + ', apiSecretId ' +
                     (cfg.apiSecretId || '(none)') + ' → ' + apiSecretId +
                     ', user=' + runtime.getCurrentUser().id
        });

        return { saved: true, apiKeySid: apiKeySid, apiSecretId: apiSecretId, checks: checks };
    };

    /* ------------------------------------------------------------------ */
    /* Inbound routing (one Studio flow for all inbound numbers)          */
    /* ------------------------------------------------------------------ */

    const MAX_NOANSWER_MESSAGE_LENGTH = 300;
    const MAX_RECORDING_NOTICE_LENGTH = 300;

    const errText = (e) => (e && e.message ? e.message : String(e));

    /**
     * After a successful assignment save, republish the routing flow when
     * inbound is on and a flow already exists. A routing failure never
     * turns the assignment save into a failure.
     */
    const routingAfterAssignmentSave = () => {
        try {
            const cfg = config.loadConfig();
            if (!cfg || !cfg.inboundEnabled) return { skipped: 'inbound_off' };
            if (!cfg.studioFlowSid) return { skipped: 'not_published' };
            return routing.publishRouting();
        } catch (e) {
            log.error({
                title: 'CTC Wizard — routing after assignment save failed',
                details: errText(e)
            });
            return { ok: false, message: errText(e), flowSid: '', publishedAt: '',
                     numbersUpdated: 0, errors: [] };
        }
    };

    /* -- Voicemail + fallback owner (Inbound calls page) ---------------- */

    /**
     * Employees the Inbound calls page offers as the fallback owner:
     * active employees with NetSuite access, plus the current fallback
     * owner (even when inactive, so the page can show it). [{ id, name }].
     * A query failure gives [] (the page still loads).
     */
    const listFallbackOwners = (currentId) => {
        try {
            const params = [];
            let sql = "SELECT id, entityid, firstname, lastname FROM employee " +
                      "WHERE (isinactive = 'F' AND giveaccess = 'T')";
            if (currentId) {
                sql += ' OR id = ?';
                params.push(Number(currentId));
            }
            sql += ' ORDER BY lastname, firstname';
            const rows = query.runSuiteQL({ query: sql, params: params }).asMappedResults();
            return rows.slice(0, 1000).map((r) => ({
                id: String(r.id),
                name: ((r.firstname || '') + ' ' + (r.lastname || '')).trim() || r.entityid || String(r.id)
            }));
        } catch (e) {
            log.error({ title: 'CTC Wizard — list fallback owners failed', details: errText(e) });
            return [];
        }
    };

    /** True when `id` is an active employee. */
    const isActiveEmployeeId = (id) => {
        try {
            const res = search.lookupFields({ type: search.Type.EMPLOYEE, id: id, columns: ['isinactive'] });
            const inactive = res && res.isinactive;
            return !!res && !(inactive === true || inactive === 'T');
        } catch (e) {
            return false;
        }
    };

    /**
     * Validate the voicemail fields of wizardSaveInbound. Returns
     * { values: { voicemailOn, voicemailMaxSeconds, fallbackOwnerId } } or
     * { error, message }. fallbackOwnerId '' / null clears it; otherwise
     * it must be an active employee's internal id.
     */
    const validateVoicemailPayload = (p) => {
        const minVm = config.MIN_VOICEMAIL_MAX_SECONDS || 30;
        const maxVm = config.MAX_VOICEMAIL_MAX_SECONDS || 300;
        if (typeof p.voicemailOn !== 'boolean') {
            return { error: 'invalid_voicemail_on', message: 'voicemailOn must be true or false.' };
        }
        if (typeof p.voicemailMaxSeconds !== 'number' || !Number.isInteger(p.voicemailMaxSeconds) ||
            p.voicemailMaxSeconds < minVm || p.voicemailMaxSeconds > maxVm) {
            return { error: 'invalid_voicemail_max_seconds',
                     message: 'Voicemail length must be a whole number of seconds from ' +
                              minVm + ' to ' + maxVm + '.' };
        }
        const raw = p.fallbackOwnerId == null ? '' : String(p.fallbackOwnerId).trim();
        if (raw && !/^[0-9]{1,10}$/.test(raw)) {
            return { error: 'invalid_fallback_owner', message: 'The fallback owner must be an employee.' };
        }
        if (raw && !isActiveEmployeeId(raw)) {
            return { error: 'invalid_fallback_owner',
                     message: 'The fallback owner must be an active employee.' };
        }
        return { values: { voicemailOn: p.voicemailOn,
                           voicemailMaxSeconds: p.voicemailMaxSeconds,
                           fallbackOwnerId: raw } };
    };

    /* -- end voicemail + fallback owner --------------------------------- */

    /**
     * wizardLoadInbound {} →
     *   { inboundEnabled, ringSeconds, noAnswerMessage, flowSid,
     *     publishedAt, routes: [{ phoneSid, phoneNumber, employeeId, employeeName }],
     *     recordInbound, recordingNoticeOn, recordingNotice,
     *     voicemailOn, voicemailMaxSeconds, fallbackOwnerId,
     *     employees: [{ id, name }] }
     */
    const wizardLoadInbound = () => {
        const cfg = loadConfigOrError();
        if (cfg.error) return { ok: false, error: cfg.error };

        let routes = [];
        let routesError;
        try { routes = routing.loadRoutes(); }
        catch (e) {
            log.error({ title: 'CTC Wizard — loadInbound routes failed', details: errText(e) });
            routesError = 'load_routes_failed';
        }

        const result = {
            inboundEnabled: !!cfg.inboundEnabled,
            ringSeconds: cfg.ringSeconds,
            noAnswerMessage: cfg.noAnswerMessage,
            flowSid: cfg.studioFlowSid || '',
            publishedAt: cfg.routingPublishedAt || '',
            routes: routes,
            recordInbound: cfg.recordInbound === true,
            recordingNoticeOn: cfg.recordingNoticeOn === true,
            recordingNotice: cfg.recordingNotice || config.DEFAULT_RECORDING_NOTICE || '',
            // Voicemail + fallback owner
            voicemailOn: cfg.voicemailOn !== false,
            voicemailMaxSeconds: cfg.voicemailMaxSeconds || config.DEFAULT_VOICEMAIL_MAX_SECONDS || 120,
            fallbackOwnerId: cfg.fallbackOwnerId || '',
            employees: listFallbackOwners(cfg.fallbackOwnerId || '')
        };
        if (routesError) result.routesError = routesError;
        return result;
    };

    /** Spoken text: control characters become spaces; then collapse and trim. */
    const cleanSpokenText = (raw) => String(raw || '')
        .replace(/[\u0000-\u001F\u007F]/g, ' ')
        .replace(/ {2,}/g, ' ')
        .trim();

    /**
     * Validate the wizardSaveInbound payload. Returns
     * { values: { inboundEnabled, ringSeconds, noAnswerMessage,
     *             recordInbound, recordingNoticeOn, recordingNotice } } or
     * { error, message }.
     */
    const validateInboundPayload = (payload) => {
        const p = payload || {};
        const minRing = config.MIN_RING_SECONDS || 10;
        const maxRing = config.MAX_RING_SECONDS || 60;

        if (typeof p.inboundEnabled !== 'boolean') {
            return { error: 'invalid_inbound_enabled',
                     message: 'inboundEnabled must be true or false.' };
        }
        if (typeof p.ringSeconds !== 'number' || !Number.isInteger(p.ringSeconds) ||
            p.ringSeconds < minRing || p.ringSeconds > maxRing) {
            return { error: 'invalid_ring_seconds',
                     message: 'Ring time must be a whole number of seconds from ' +
                              minRing + ' to ' + maxRing + '.' };
        }
        if (p.noAnswerMessage != null && typeof p.noAnswerMessage !== 'string') {
            return { error: 'invalid_noanswer_message',
                     message: 'The no-answer message must be text.' };
        }
        const message = cleanSpokenText(p.noAnswerMessage);
        if (message.length > MAX_NOANSWER_MESSAGE_LENGTH) {
            return { error: 'noanswer_message_too_long',
                     message: 'The no-answer message must be ' +
                              MAX_NOANSWER_MESSAGE_LENGTH + ' characters or fewer.' };
        }
        if (typeof p.recordInbound !== 'boolean') {
            return { error: 'invalid_record_inbound',
                     message: 'recordInbound must be true or false.' };
        }
        if (typeof p.recordingNoticeOn !== 'boolean') {
            return { error: 'invalid_recording_notice_on',
                     message: 'recordingNoticeOn must be true or false.' };
        }
        if (p.recordingNotice != null && typeof p.recordingNotice !== 'string') {
            return { error: 'invalid_recording_notice',
                     message: 'The recording notice must be text.' };
        }
        const notice = cleanSpokenText(p.recordingNotice);
        if (notice.length > MAX_RECORDING_NOTICE_LENGTH) {
            return { error: 'recording_notice_too_long',
                     message: 'The recording notice must be ' +
                              MAX_RECORDING_NOTICE_LENGTH + ' characters or fewer.' };
        }
        const vm = validateVoicemailPayload(p);
        if (vm.error) return vm;
        return { values: { inboundEnabled: p.inboundEnabled,
                           ringSeconds: p.ringSeconds,
                           // A built-in default is stored blank so it follows the voicemail setting.
                           noAnswerMessage: config.isDefaultNoAnswerMessage(message) ? '' : message,
                           voicemailOn: vm.values.voicemailOn,
                           voicemailMaxSeconds: vm.values.voicemailMaxSeconds,
                           fallbackOwnerId: vm.values.fallbackOwnerId,
                           recordInbound: p.recordInbound,
                           recordingNoticeOn: p.recordingNoticeOn,
                           recordingNotice: notice } };
    };

    /**
     * wizardSaveInbound { inboundEnabled, ringSeconds, noAnswerMessage,
     *                     recordInbound, recordingNoticeOn, recordingNotice,
     *                     voicemailOn, voicemailMaxSeconds, fallbackOwnerId } →
     *   { settings: { inboundEnabled, ringSeconds, noAnswerMessage,
     *                 recordInbound, recordingNoticeOn, recordingNotice,
     *                 voicemailOn, voicemailMaxSeconds, fallbackOwnerId },
     *     publish: PublishResult }
     * A blank message or notice is stored blank; settings then reports the
     * default text that callers will hear. A no-answer message equal to a
     * built-in default is stored blank too, so it follows the voicemail
     * setting (voicemail greeting vs try-again-later message).
     */
    const wizardSaveInbound = (payload) => {
        const v = validateInboundPayload(payload);
        if (v.error) return { ok: false, error: v.error, message: v.message };

        const id = getConfigRecordId();
        if (!id) return { ok: false, error: 'config_not_found' };

        record.submitFields({
            type: 'customrecord_ctc_config',
            id: id,
            values: {
                custrecord_ctc_inbound_enabled: v.values.inboundEnabled,
                custrecord_ctc_ring_seconds: v.values.ringSeconds,
                custrecord_ctc_noanswer_message: v.values.noAnswerMessage,
                custrecord_ctc_record_inbound: v.values.recordInbound,
                custrecord_ctc_recording_notice_on: v.values.recordingNoticeOn,
                custrecord_ctc_recording_notice: v.values.recordingNotice,
                custrecord_ctc_voicemail_on: v.values.voicemailOn,
                custrecord_ctc_voicemail_max_seconds: v.values.voicemailMaxSeconds,
                custrecord_ctc_fallback_owner: v.values.fallbackOwnerId
            }
        });

        log.audit({
            title: 'CTC Wizard — inbound settings saved',
            details: 'inboundEnabled=' + v.values.inboundEnabled +
                     ' ringSeconds=' + v.values.ringSeconds +
                     ' messageLength=' + v.values.noAnswerMessage.length +
                     ' recordInbound=' + v.values.recordInbound +
                     ' recordingNoticeOn=' + v.values.recordingNoticeOn +
                     ' noticeLength=' + v.values.recordingNotice.length +
                     ' voicemailOn=' + v.values.voicemailOn +
                     ' voicemailMaxSeconds=' + v.values.voicemailMaxSeconds +
                     ' fallbackOwner=' + (v.values.fallbackOwnerId || 'none')
        });

        let publish;
        try { publish = routing.publishRouting(); }
        catch (e) {
            log.error({ title: 'CTC Wizard — publishRouting threw', details: errText(e) });
            publish = { ok: false, message: errText(e), flowSid: '', publishedAt: '',
                        numbersUpdated: 0, errors: [] };
        }

        return {
            settings: {
                inboundEnabled: v.values.inboundEnabled,
                ringSeconds: v.values.ringSeconds,
                noAnswerMessage: v.values.noAnswerMessage ||
                                 config.defaultNoAnswerMessage(v.values.voicemailOn),
                recordInbound: v.values.recordInbound,
                recordingNoticeOn: v.values.recordingNoticeOn,
                recordingNotice: v.values.recordingNotice ||
                                 config.DEFAULT_RECORDING_NOTICE || '',
                voicemailOn: v.values.voicemailOn,
                voicemailMaxSeconds: v.values.voicemailMaxSeconds,
                fallbackOwnerId: v.values.fallbackOwnerId
            },
            publish: publish
        };
    };

    /** wizardPublishRouting {} → { publish: PublishResult } */
    const wizardPublishRouting = () => {
        let publish;
        try { publish = routing.publishRouting(); }
        catch (e) {
            log.error({ title: 'CTC Wizard — publishRouting threw', details: errText(e) });
            publish = { ok: false, message: errText(e), flowSid: '', publishedAt: '',
                        numbersUpdated: 0, errors: [] };
        }
        return { publish: publish };
    };

    /* ------------------------------------------------------------------ */
    /* Actions: outbound recording notice (Twilio Function)               */
    /* ------------------------------------------------------------------ */

    /**
     * Outbound state payload (wizardLoadOutbound and the `state` of the
     * other outbound actions):
     *   { noticeOn, noticeText, noticeVersion, defaultText, maxLength,
     *     appSid, functionUrl, prevVoiceUrl, publishedAt,
     *     publishedCodeVersion, codeVersion, needsRepublish, published,
     *     pending, voiceUrlMatches, publishedNoticeVersion, changesPending,
     *     functionExists?, functionMessage?,
     *     drift?: { voiceUrl, functionCode, functionService } }
     * live true: one Twilio GET of the TwiML App (voiceUrlMatches, drift),
     * plus one GET of the Function environment when published.
     * live false: no Twilio call; voiceUrlMatches is null and there is no
     * drift key.
     */
    const outboundState = (cfg, live) => {
        const noticeOn = cfg.outNoticeOn === true;
        const noticeVersion = cfg.outNoticeVersion || 1;
        const publishedNoticeVersion = cfg.outPublishedNoticeVersion || 0;
        const published = outbound.isPublished(cfg);
        const st = live ? outbound.outboundStatus(cfg) : null;
        const state = {
            noticeOn: noticeOn,
            noticeText: cfg.outNoticeText || config.DEFAULT_OUTBOUND_NOTICE,
            noticeVersion: noticeVersion,
            defaultText: config.DEFAULT_OUTBOUND_NOTICE,
            maxLength: config.MAX_OUTBOUND_NOTICE_LENGTH || 300,
            appSid: cfg.twimlAppSid || '',
            functionUrl: outbound.functionUrl(cfg.outFnDomain),
            prevVoiceUrl: cfg.outPrevVoiceUrl || '',
            publishedAt: cfg.outPublishedAt || '',
            publishedCodeVersion: cfg.outFnCodeVersion || '',
            codeVersion: outbound.FN_CODE_VERSION,
            needsRepublish: outbound.needsRepublish(cfg),
            published: published,
            pending: !!cfg.outFnPendingBuild,
            voiceUrlMatches: st ? st.voiceUrlMatches : null,
            publishedNoticeVersion: publishedNoticeVersion,
            // Saved notice settings differ from what Twilio runs now.
            changesPending: published && (noticeOn ? noticeVersion : 0) !== publishedNoticeVersion
        };
        if (st) {
            state.drift = st.drift;
            // null = not checked / unknown; false = service or environment deleted.
            state.functionExists = st.functionExists;
            if (st.functionMessage) state.functionMessage = st.functionMessage;
        }
        return state;
    };

    /** wizardLoadOutbound {} → outbound state (live). */
    const wizardLoadOutbound = () => {
        const cfg = loadOutboundConfigOrError();
        if (cfg.error) return { ok: false, error: cfg.error };
        return outboundState(cfg, true);
    };

    /**
     * Validate the wizardSaveOutbound payload. Returns
     * { values: { noticeOn, noticeText } } or { error, message }.
     * noticeText '' means the default notice.
     */
    const validateOutboundPayload = (payload) => {
        const p = payload || {};
        const max = config.MAX_OUTBOUND_NOTICE_LENGTH || 300;
        if (typeof p.noticeOn !== 'boolean') {
            return { error: 'invalid_notice_on', message: 'noticeOn must be true or false.' };
        }
        if (p.noticeText != null && typeof p.noticeText !== 'string') {
            return { error: 'invalid_notice_text', message: 'The notice must be text.' };
        }
        const text = cleanSpokenText(p.noticeText);
        if (text.length > max) {
            return { error: 'notice_text_too_long',
                     message: 'The notice must be ' + max + ' characters or fewer.' };
        }
        return { values: { noticeOn: p.noticeOn,
                           noticeText: text === config.DEFAULT_OUTBOUND_NOTICE ? '' : text } };
    };

    /**
     * wizardSaveOutbound { noticeOn, noticeText } → outbound state (no
     * Twilio call). Blank text (or the default text) is stored blank and
     * means the default notice. noticeVersion goes up by 1 when the
     * spoken text or on/off changes. Publish to make it live.
     */
    const wizardSaveOutbound = (payload) => {
        const v = validateOutboundPayload(payload);
        if (v.error) return { ok: false, error: v.error, message: v.message };

        const cfg = loadOutboundConfigOrError();
        if (cfg.error) return { ok: false, error: cfg.error };

        const newText = v.values.noticeText || config.DEFAULT_OUTBOUND_NOTICE;
        const oldText = cfg.outNoticeText || config.DEFAULT_OUTBOUND_NOTICE;
        const changed = newText !== oldText || v.values.noticeOn !== (cfg.outNoticeOn === true);
        const version = (cfg.outNoticeVersion || 1) + (changed ? 1 : 0);

        record.submitFields({
            type: 'customrecord_ctc_config',
            id: cfg.id,
            values: {
                custrecord_ctc_out_notice_on: v.values.noticeOn,
                custrecord_ctc_out_notice: v.values.noticeText,
                custrecord_ctc_out_notice_ver: version
            }
        });

        log.audit({
            title: 'CTC Wizard — outbound notice saved',
            details: 'noticeOn=' + v.values.noticeOn + ' textLength=' + newText.length +
                     ' version=' + version + ' changed=' + changed
        });

        return outboundState(Object.assign({}, cfg, {
            outNoticeOn: v.values.noticeOn,
            outNoticeText: newText,
            outNoticeVersion: version
        }), false);
    };

    /**
     * wizardPublishOutbound { resume?: boolean } →
     *   { ok, pending?, message?, steps: [{ key, label, status, detail }], state }
     * resume: finish a build that an earlier request left running.
     */
    const wizardPublishOutbound = (payload) => {
        const cfg = loadOutboundConfigOrError();
        if (cfg.error) return { ok: false, error: cfg.error };
        let res;
        try { res = outbound.publishOutbound(cfg, { resume: !!(payload && payload.resume === true) }); }
        catch (e) {
            log.error({ title: 'CTC Wizard — publishOutbound threw', details: errText(e) });
            res = { ok: false, message: errText(e), steps: [] };
        }
        const after = loadOutboundConfigOrError();
        const out = { ok: res.ok === true, steps: res.steps || [],
                      state: outboundState(after.error ? cfg : after, true) };
        if (res.pending) out.pending = true;
        if (res.message) out.message = res.message;
        return out;
    };

    /** wizardUnpublishOutbound {} → { ok, message?, steps, state } */
    const wizardUnpublishOutbound = () => {
        const cfg = loadOutboundConfigOrError();
        if (cfg.error) return { ok: false, error: cfg.error };
        let res;
        try { res = outbound.unpublishOutbound(cfg); }
        catch (e) {
            log.error({ title: 'CTC Wizard — unpublishOutbound threw', details: errText(e) });
            res = { ok: false, message: errText(e), steps: [] };
        }
        const after = loadOutboundConfigOrError();
        const out = { ok: res.ok === true, steps: res.steps || [],
                      state: outboundState(after.error ? cfg : after, true) };
        if (res.message) out.message = res.message;
        return out;
    };

    /* ------------------------------------------------------------------ */
    /* Action: wizardLoadPresence (Health + Inbound calls "Phones")       */
    /* ------------------------------------------------------------------ */

    /** A phone with no heartbeat for this long counts as offline. */
    const PRESENCE_STALE_MS = 12 * 60 * 1000;

    const presenceChecked = (v) => v === true || v === 'T';

    /**
     * Phone status for every rep with an assignment or a presence row
     * (customrecord_ctc_rep_presence, written by the token RESTlet's
     * phoneHeartbeat). Two searches (20 units).
     *
     * wizardLoadPresence {} →
     *   { items: [{ employeeId, employeeName, canReceive, state, lastSeen,
     *               lastChange, stale, incomingGranted, lastError,
     *               identityMatch, client }], now }
     * incomingGranted false = the phone's token has no inbound grant
     * (inbound off): "Ready (inbound off)", not "Not receiving calls".
     * A rep with an assignment and no presence row has state '' and
     * stale true (the phone never reported).
     */
    const wizardLoadPresence = () => {
        const nowMs = Date.now();
        const byEmployee = {};
        const order = [];
        const ensure = (employeeId, employeeName) => {
            const key = String(employeeId);
            if (!byEmployee[key]) {
                byEmployee[key] = {
                    employeeId: key,
                    employeeName: employeeName || '',
                    canReceive: false,
                    state: '',
                    lastSeen: '',
                    lastChange: '',
                    stale: true,
                    incomingGranted: false,
                    lastError: '',
                    identityMatch: false,
                    client: ''
                };
                order.push(key);
            } else if (!byEmployee[key].employeeName && employeeName) {
                byEmployee[key].employeeName = employeeName;
            }
            return byEmployee[key];
        };

        const assignments = search.create({
            type: 'customrecord_ctc_rep_assignment',
            filters: [['isinactive', 'is', 'F']],
            columns: ['custrecord_ctc_ra_employee']
        }).run().getRange({ start: 0, end: 1000 });
        assignments.forEach((r) => {
            const id = r.getValue('custrecord_ctc_ra_employee');
            if (id) ensure(id, r.getText('custrecord_ctc_ra_employee'));
        });

        // Oldest first, so the newest row wins if a race left two rows.
        const rows = search.create({
            type: 'customrecord_ctc_rep_presence',
            filters: [['isinactive', 'is', 'F']],
            columns: [
                search.createColumn({ name: 'internalid', sort: search.Sort.ASC }),
                'custrecord_ctc_rp_employee',
                'custrecord_ctc_rp_last_seen',
                'custrecord_ctc_rp_can_receive',
                'custrecord_ctc_rp_state',
                'custrecord_ctc_rp_last_change',
                // Same search, no extra units.
                'custrecord_ctc_rp_incoming_granted',
                'custrecord_ctc_rp_last_error',
                'custrecord_ctc_rp_identity_match',
                'custrecord_ctc_rp_client'
            ]
        }).run().getRange({ start: 0, end: 1000 });
        rows.forEach((r) => {
            const id = r.getValue('custrecord_ctc_rp_employee');
            if (!id) return;
            const item = ensure(id, r.getText('custrecord_ctc_rp_employee'));
            const lastSeen = String(r.getValue('custrecord_ctc_rp_last_seen') || '');
            const seenMs = Date.parse(lastSeen);
            item.canReceive = presenceChecked(r.getValue('custrecord_ctc_rp_can_receive'));
            item.state = String(r.getValue('custrecord_ctc_rp_state') || '');
            item.lastSeen = lastSeen;
            item.lastChange = String(r.getValue('custrecord_ctc_rp_last_change') || '');
            item.stale = isNaN(seenMs) || nowMs - seenMs > PRESENCE_STALE_MS;
            item.incomingGranted = presenceChecked(r.getValue('custrecord_ctc_rp_incoming_granted'));
            item.lastError = String(r.getValue('custrecord_ctc_rp_last_error') || '');
            item.identityMatch = presenceChecked(r.getValue('custrecord_ctc_rp_identity_match'));
            item.client = String(r.getValue('custrecord_ctc_rp_client') || '');
        });

        const items = order.map((k) => byEmployee[k]);
        items.sort((x, y) => String(x.employeeName).localeCompare(String(y.employeeName)));
        return { items: items, now: new Date(nowMs).toISOString() };
    };

    /* ------------------------------------------------------------------ */
    /* Action dispatch table                                              */
    /* ------------------------------------------------------------------ */

    const ACTIONS = {
        wizardPrereqs:           wizardPrereqs,
        wizardSnapshot:          wizardSnapshot,
        wizardSavePublicIds:     wizardSavePublicIds,
        wizardSaveCredentials:   wizardSaveCredentials,
        wizardListTwiMLApps:     wizardListTwiMLApps,
        wizardListPhoneNumbers:  wizardListPhoneNumbers,
        wizardListIntelServices: wizardListIntelServices,
        wizardSaveVoice:         wizardSaveVoice,
        wizardListEmployees:     wizardListEmployees,
        wizardLoadAssignments:   wizardLoadAssignments,
        wizardSaveAssignments:   wizardSaveAssignments,
        wizardRunPreflight:      wizardRunPreflight,
        wizardActivate:          wizardActivate,
        wizardLoadInbound:       wizardLoadInbound,
        wizardSaveInbound:       wizardSaveInbound,
        wizardPublishRouting:    wizardPublishRouting,
        wizardLoadPresence:      wizardLoadPresence,
        wizardLoadOutbound:      wizardLoadOutbound,
        wizardSaveOutbound:      wizardSaveOutbound,
        wizardPublishOutbound:   wizardPublishOutbound,
        wizardUnpublishOutbound: wizardUnpublishOutbound
    };

    return { onRequest };
});
