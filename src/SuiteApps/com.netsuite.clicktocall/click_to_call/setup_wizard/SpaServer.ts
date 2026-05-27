/**
 * @NApiVersion 2.1
 * @NScriptType SpaServerScript
 *
 * Setup Wizard v2 — server-side initialization (TypeScript).
 *
 * Path B (2026-05-26) — migrated from hand-written AMD (the previous
 * src/FileCabinet/.../setup_wizard/SpaServer.js, 69 lines). Gulp now
 * owns the AMD output; only edit this TS source.
 *
 * SpaServerScript is intentionally minimal per NetSuite SAFE Guide
 * leading practices: this runs once at SPA load time to set up the
 * client environment. Business logic lives in the client (SpaClient)
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

import runtime from 'N/runtime';
import log from 'N/log';

// Standard role IDs are portable across NetSuite accounts (only custom
// roles vary per install). Administrator = 3 per NetSuite docs.
const ADMIN_ROLE_ID = 3;

/**
 * NetSuite's SpaServerScript context shape. The UIF type catalog
 * (@oracle/netsuite-uif-types v9.0.0) doesn't ship a SpaServerScript
 * type yet, so we declare the minimal surface we actually use.
 * Tighten this if Oracle publishes an official type or as we learn
 * which fields the framework supplies.
 */
interface SpaServerScriptContext {
    // Future: scriptContext.addStyleSheet({ relativePath: '...' })
    // once we ship a custom stylesheet. Reserved for forward use.
    addStyleSheet?: (options: { relativePath: string }) => void;
}

/**
 * Required SpaServerScript entry point. Runs once per SPA session.
 *
 * @param scriptContext NetSuite SPA framework context
 */
export const initializeSpa = (scriptContext: SpaServerScriptContext): void => {
    void scriptContext;

    const role = Number(runtime.getCurrentUser().role);
    if (role !== ADMIN_ROLE_ID) {
        // Defense-in-depth: the deployment audience should have
        // already rejected this user, but never trust a single
        // security layer.
        log.error({
            title: 'CTC Setup Wizard — non-admin reached initializeSpa',
            details: 'role=' + role + ' userId=' + runtime.getCurrentUser().id +
                     ' — deployment audience may be misconfigured on this account'
        });
        // SPA framework treats a thrown error as a hard fail and shows
        // the user a generic error page (no leak of internal details).
        throw new Error('Administrator role required');
    }

    log.audit({
        title: 'CTC Setup Wizard initialized',
        details: 'user=' + runtime.getCurrentUser().id +
                 ' accountId=' + runtime.accountId
    });
};
