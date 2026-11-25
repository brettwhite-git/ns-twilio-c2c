/**
 * @NApiVersion 2.1
 * @NScriptType SpaServerScript
 *
 * Sales Central: server init. Logs who opened it; the page fetches its data
 * from the ctc_rl_token RESTlet.
 */

define(['exports', 'N/runtime', 'N/log'], (function (exports, runtime, log) { 'use strict';

    const initializeSpa = (scriptContext) => {
        const user = runtime.getCurrentUser();
        log.audit({ title: 'CTC Sales Central opened', details: 'user=' + user.id + ' role=' + user.role });
    };

    exports.initializeSpa = initializeSpa;

}));
