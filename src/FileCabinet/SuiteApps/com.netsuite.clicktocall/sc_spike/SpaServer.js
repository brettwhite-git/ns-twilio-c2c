/**
 * @NApiVersion 2.1
 * @NScriptType SpaServerScript
 *
 * Sales Central spike (2026-11-21, throwaway): server init. Logs who
 * opened it; the page fetches everything else itself.
 */

define(['exports', 'N/runtime', 'N/log'], (function (exports, runtime, log) { 'use strict';

    const initializeSpa = (scriptContext) => {
        const user = runtime.getCurrentUser();
        log.audit({ title: 'CTC SC spike opened', details: 'user=' + user.id + ' role=' + user.role });
    };

    exports.initializeSpa = initializeSpa;

}));
