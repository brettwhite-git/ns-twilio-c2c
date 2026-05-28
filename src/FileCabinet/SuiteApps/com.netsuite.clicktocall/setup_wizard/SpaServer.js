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

define(['exports', 'N/runtime', 'N/log'], (function (exports, runtime, log) { 'use strict';

    const ADMIN_ROLE_ID = 3;
    const initializeSpa = (scriptContext) => {
        const role = Number(runtime.getCurrentUser().role);
        if (role !== ADMIN_ROLE_ID) {
            log.error({
                title: 'CTC Setup Wizard — non-admin reached initializeSpa',
                details: 'role=' + role + ' userId=' + runtime.getCurrentUser().id +
                    ' — deployment audience may be misconfigured on this account'
            });
            throw new Error('Administrator role required');
        }
        log.audit({
            title: 'CTC Setup Wizard initialized',
            details: 'user=' + runtime.getCurrentUser().id +
                ' accountId=' + runtime.accountId
        });
    };

    exports.initializeSpa = initializeSpa;

}));
