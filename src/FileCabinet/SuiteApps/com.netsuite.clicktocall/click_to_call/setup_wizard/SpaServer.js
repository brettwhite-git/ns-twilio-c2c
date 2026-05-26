// @ts-check
/* eslint-disable suitescript/script-type, suitescript/no-log-module */
/**
 * @NApiVersion 2.1
 * @NScriptType SpaServerScript
 *
 * Setup Wizard v2 — server-side initialization.
 *
 * (ESLint disables above: the suitescript-plugin script-type rule predates
 * NetSuite's SpaServerScript type. The no-log-module rule also doesn't apply
 * to SPA server scripts — UIF runtime doesn't expose `log` as a global.)
 *
 * SpaServerScript is intentionally minimal per NetSuite SAFE Guide
 * leading practices: this runs once at SPA load time to set up the
 * client environment. Business logic lives in the client (SpaClient.js)
 * which calls back into server actions via UIF data services or a
 * separate RESTlet when needed.
 *
 * Role gating is enforced at TWO layers:
 *   1. Deployment audience (custspa_ctc_setup_wizard.xml):
 *      <audienceallroles>F</audienceallroles> +
 *      <audienceroles>ADMINISTRATOR</audienceroles> — framework
 *      enforces this before initializeSpa even runs. Non-admins
 *      can't reach the URL at all.
 *   2. Runtime defense-in-depth: re-check inside initializeSpa
 *      for the unlikely case that the deployment audience was
 *      misconfigured on a customer install.
 */
define(["require", "exports", "N/runtime", "N/log"],
       function (require, exports, runtime, log) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.initializeSpa = void 0;

    // Standard role IDs are portable across NetSuite accounts (only custom
    // roles vary per install). Administrator = 3 per NetSuite docs.
    var ADMIN_ROLE_ID = 3;

    /**
     * Required SpaServerScript entry point. Runs once per SPA session.
     * @param {Object} scriptContext — NetSuite SPA framework context
     */
    var initializeSpa = function (scriptContext) {
        var role = Number(runtime.getCurrentUser().role);
        if (role !== ADMIN_ROLE_ID) {
            // Defense-in-depth: the deployment audience should have
            // already rejected this user, but never trust a single
            // security layer.
            log.error({
                title: "CTC Setup Wizard — non-admin reached initializeSpa",
                details: "role=" + role + " userId=" + runtime.getCurrentUser().id +
                         " — deployment audience may be misconfigured on this account"
            });
            // SPA framework treats a thrown error as a hard fail and shows
            // the user a generic error page (no leak of internal details).
            throw new Error("Administrator role required");
        }

        log.audit({
            title: "CTC Setup Wizard initialized",
            details: "user=" + runtime.getCurrentUser().id +
                     " accountId=" + runtime.accountId
        });

        // Future: scriptContext.addStyleSheet({ relativePath: '/assets/wizard.css' })
        // once we ship a custom stylesheet. For now UIF defaults are sufficient.
    };

    exports.initializeSpa = initializeSpa;
});
