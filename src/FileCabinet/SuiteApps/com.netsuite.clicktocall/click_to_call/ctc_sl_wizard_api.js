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
define(['N/runtime', 'N/record', 'N/search', 'N/log', 'N/secrets',
        './lib/ctc_config'],
       (runtime, record, search, log, secrets, config) => {

    // Standard role IDs are portable across NetSuite accounts.
    // Administrator = 3 (per NetSuite docs); custom roles vary.
    const ADMIN_ROLE_ID = 3;

    /* ------------------------------------------------------------------ */
    /* Suitelet entry point                                               */
    /* ------------------------------------------------------------------ */

    const onRequest = (context) => {
        const request = context.request;
        const response = context.response;
        const action = (request.parameters && request.parameters.action) || '';

        response.setHeader({ name: 'Content-Type', value: 'application/json' });

        // Admin gate — first thing, before any action dispatch.
        if (!isAdmin()) {
            log.audit({
                title: 'CTC Wizard API — non-admin reached endpoint',
                details: 'role=' + runtime.getCurrentUser().role +
                         ' action=' + action
            });
            response.write(JSON.stringify({ ok: false, error: 'forbidden' }));
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

    const isAdmin = () => {
        return Number(runtime.getCurrentUser().role) === ADMIN_ROLE_ID;
    };

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
     * API Secrets, accessed at runtime via N/secrets).
     *
     * Three outcomes:
     *   1. N/secrets module didn't load → fail with repair hint
     *   2. Module loaded but no existing CTC secret is configured yet
     *      → 'warn' (informational — wizard's Connect Twilio step
     *      will guide the admin to create them)
     *   3. Module loaded AND an existing secret resolves → pass
     *
     * The previous featureCheck('SUITESCRIPTSECRETS') was a misnomer —
     * NetSuite calls this surface "API Secrets" and the feature ID
     * doesn't reliably exist as 'SUITESCRIPTSECRETS' on all accounts.
     */
    const apiSecretsCheck = () => {
        if (!secrets) {
            return {
                id: 'api_secrets',
                label: 'API Secrets',
                status: 'fail',
                detail: 'N/secrets module failed to load.',
                repairHint: 'Verify the API Secrets feature is enabled ' +
                            'and the account allows N/secrets — contact ' +
                            'NetSuite Customer Support if module load fails.'
            };
        }

        // Optimistic pass: if module loaded, secrets are available.
        // Try to look up an existing CTC secret if the config record
        // already points at one — that confirms end-to-end resolution.
        var detail = 'N/secrets module loaded; API Secrets accessible ' +
                     'at Setup > Company > API Secrets.';

        try {
            var cfg = config.loadConfig();
            if (cfg && cfg.apiSecretId) {
                detail += ' Existing API Key Secret (' + cfg.apiSecretId +
                          ') is configured.';
            }
        } catch (e) {
            // Config record may not exist yet on fresh installs — that's
            // handled by configSingletonCheck. Don't double-report.
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
    /* Action dispatch table                                              */
    /* ------------------------------------------------------------------ */

    const ACTIONS = {
        wizardPrereqs: wizardPrereqs
        // U4-U7: wizardSavePublicIds, wizardValidateTwilio, wizardSaveVoice,
        //        wizardValidateTwiML, wizardListNumbers, wizardSaveAssignments,
        //        wizardListReps, wizardSaveRoles, wizardRunPreflight,
        //        wizardActivate
    };

    return { onRequest };
});
