/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Setup Wizard v2 — pure state helpers.
 *
 * No NetSuite API calls; consumes a config snapshot (already loaded by
 * lib/ctc_config.js) and decides which wizard step the admin should
 * land on. Splitting this out keeps the Suitelet's onRequest thin and
 * lets the state machine be unit-tested without N/search mocks.
 *
 * The wizard has six steps:
 *   1. Prerequisites
 *   2. Connect Twilio
 *   3. Voice config
 *   4. Phone numbers
 *   5. Reps & roles
 *   6. Test & activate
 *
 * Resumability rule (plan §"Key Technical Decisions" #5): no separate
 * wizard-state record. Current step is derived from which config fields
 * are populated. The first unpopulated field's step becomes the landing
 * step on next wizard open.
 */
define([], () => {

    /**
     * Convert the config record loaded by ctc_config.loadConfig() into a
     * stage-completion snapshot. Snapshot booleans are independent of one
     * another — a downstream caller can ask "has step 4 been completed?"
     * without re-querying the config record.
     *
     * @param {Object} config — shape returned by ctc_config.loadConfig()
     * @returns {Object} snapshot — booleans flagging each stage's completion
     */
    const snapshotFromConfig = (config) => {
        config = config || {};
        const has = (v) => !!(v && String(v).trim().length > 0);

        const hasPublicIds    = has(config.accountSid) && has(config.apiKeySid);
        const hasApiKeySecret = has(config.apiSecretId);
        const hasVoiceConfig  = has(config.twimlAppSid) && has(config.phoneNumber);
        const isActive        = config.active === true;

        return {
            hasPublicIds: hasPublicIds,
            hasApiKeySecret: hasApiKeySecret,
            // Phase 2 U10: Auth Token removed entirely. The only credential
            // path is API Key + Secret. "Credentials configured" means both
            // public identifiers AND the API Key Secret pointer are set.
            hasCredentials: hasPublicIds && hasApiKeySecret,
            hasVoiceConfig: hasVoiceConfig,
            isActive: isActive
        };
    };

    /**
     * Pick the wizard step the admin should land on, given a snapshot.
     *
     * Step assignment is "first unfinished stage wins" — admin lands on the
     * earliest step that hasn't been completed. After full activation, the
     * caller should branch to the admin console (deferred to follow-up work);
     * we return 6 here so post-activation visits still render *something*
     * (a "preflight re-run" view) until the console ships.
     *
     * @param {Object} snapshot — produced by snapshotFromConfig
     * @returns {number} 1..6
     */
    const determineCurrentStep = (snapshot) => {
        snapshot = snapshot || {};
        if (!snapshot.hasPublicIds)    return 2; // Step 1 prereqs auto-pass when admin's logged in; Step 2 is where actual input starts
        if (!snapshot.hasApiKeySecret) return 2;
        if (!snapshot.hasVoiceConfig)  return 3;
        // Phone-number assignments live in a separate record; the Suitelet
        // queries that count on render. For snapshot purposes we treat
        // hasVoiceConfig + !isActive as "still in Step 4 or 5". The
        // Suitelet refines this by also checking the rep_assignment count.
        if (!snapshot.isActive)        return 5; // preflight + activate
        return 5;                                // activated — U11 will introduce the 'console' sentinel
    };

    /**
     * Step number → display metadata for the stepper UI. Kept here so the
     * Suitelet's HTML render is data-driven.
     */
    // 5-step flow. Original plan had 6 steps with a separate "Reps &
    // roles" step, but it turned out redundant given Step 4 (phone
    // number → rep assignments) already establishes the rep list, AND
    // the deployment audience (`<allroles>T</allroles>` + runtime role
    // check) means no role-level wiring is needed. Step 5 collapses
    // into the final Test & Activate page, which now combines a
    // configuration review, preflight checks, and activation in one
    // surface — the "look once, run preflight, click activate" pattern.
    const STEPS = [
        { num: 1, label: 'Prerequisites',   sub: 'Setup checks' },
        { num: 2, label: 'Connect Twilio',  sub: 'SIDs & secrets' },
        { num: 3, label: 'Voice config',    sub: 'TwiML & caller ID' },
        { num: 4, label: 'Phone numbers',   sub: 'Claim & assign' },
        { num: 5, label: 'Test & activate', sub: 'Review & go live' }
    ];

    return {
        snapshotFromConfig: snapshotFromConfig,
        determineCurrentStep: determineCurrentStep,
        STEPS: STEPS
    };
});
